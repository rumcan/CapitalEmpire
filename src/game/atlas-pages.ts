// Atlas page residency (T080): the sprite atlas pages (2048 px, five mips each) no longer all sit on the GPU at full size. GAME-PLAN 2.3
// budgets the atlases at 96 MB on a hi-dpi screen and 32 MB on a dpr-1 screen; the whole set at mip 0 is about 1 GB in RGBA8.
//
// - The low set: every page from mip `lowBase` down (a 512 px page and its mips on a hi-dpi screen), always resident, loaded before the
//   first frame. Anything that has not streamed in yet draws from it: soft for a moment, never blank.
// - Cells: each page is cut into GRID x GRID cells (512 px squares at mip 0). A street at the closest zoom draws from 20-odd pages but
//   only uses a few cells of most of them (one house on a page of houses), so cells, not pages, are what streams: about a third of the
//   memory whole pages would need (measured on the bench city: 23 pages on screen, 129 cells = 8 pages' worth).
// - Streamed tiers: texture arrays of cell-sized slots, one per base mip finer than the low set (mip 1, and mip 0 on a screen above 1x,
//   sizes.ts atlasMip0). A slot holds one cell's mips from its tier's base to lowBase - 1, with a border of real neighbouring pixels (4 px
//   at its coarsest level: one compressed block) so filtering across a cell edge matches the whole page. Mips upload coarse to fine, and
//   the shader clamps the level of detail to the finest one uploaded, so a cell sharpens step by step and never samples a missing level.
// - Each frame the engine says which cells it draws and which are near the view, and the finest mip the view needs (neededLevel: the
//   zoom times the dpr against mip 0's 0.6 atlas px per display px). Cells on screen want that mip; cells near the view one mip coarser,
//   so a fast pan finds them half-loaded. Only cells on screen at the closest zoom get mip 0.
// - A full tier evicts its least recently wanted slot, never one wanted this frame. When every slot of a tier is in use the cell tries a
//   finer tier (it serves too), then a coarser one (better than the low set), in the order on-screen first, finest want first, most
//   pixels on screen first.
//
// The memory is fixed up front (planAtlas: texStorage3D allocates every slot), so the budget holds by construction. This module is plain
// TypeScript (no GL) so the tests drive it directly; gl.ts owns the textures, the uploads and the shader, engine.ts says what is wanted.

export const MB = 1024 * 1024;
/** cells per page side */
export const GRID = 4;
/** the border of a slot at its coarsest level, in texels (one 4 x 4 block of a compressed format) */
export const BORDER = 4;

/** GAME-PLAN 2.3: atlases <= 96 MB on a hi-dpi screen (any dpr above 1 loads mip 0, sizes.ts atlasMip0), <= 32 MB at dpr 1 */
export function atlasBudget(dpr: number): number { return (dpr > 1 ? 96 : 32) * MB; }

/** bytes of a w x h image at `bpp` bytes per px (block formats round up to whole 4 x 4 blocks) */
export function rectBytes(w: number, h: number, bpp: number): number { return Math.ceil(w / 4) * 4 * Math.ceil(h / 4) * 4 * bpp; }
/** bytes of the mips base .. levels - 1 of one whole page */
export function chainBytes(size: number, levels: number, base: number, bpp: number): number {
  let n = 0; for (let m = base; m < levels; m++) { const s = Math.max(1, size >> m); n += rectBytes(s, s, bpp); } return n;
}

export interface TierPlan {
  /** the finest mip of its slots; they hold base .. lowBase - 1 */
  base: number; levels: number; slots: number; bytes: number;
  /** a cell's side at the base mip (texels), its border there, and the slot's side (cell + 2 borders) */
  cell: number; border: number; slot: number;
}
export interface AtlasPlan {
  pages: number; size: number; levels: number; grid: number;
  /** bytes per px of the GPU format (1: BC7 / ASTC 4x4 / ETC2 RGBA; 4: RGBA8) */
  bpp: number;
  /** the finest mip this screen ever draws (0 above dpr 1, else 1) */
  finest: number;
  /** the always-resident set: every whole page from this mip down */
  lowBase: number; lowBytes: number;
  /** the streamed tiers, finest base first */
  tiers: TierPlan[];
  /** GPU bytes of the whole plan (allocated up front) */
  bytes: number; budget: number;
}

/** the low set takes at most this share of the budget */
const LOW_SHARE = 0.3;
/** each streamed tier but the finest takes this share of what is left after the coarser ones */
const COARSE_TIER_SHARE = 0.15;

/** a slot of a tier with base mip `base` under a low set at `lowBase`: its cell, border and side at the base, and its bytes */
export function slotShape(size: number, grid: number, base: number, lowBase: number, bpp: number) {
  const levels = lowBase - base, cell = (size >> base) / grid, border = BORDER << (levels - 1), slot = cell + 2 * border;
  let bytes = 0; for (let k = 0; k < levels; k++) { const s = slot >> k; bytes += rectBytes(s, s, bpp); }
  return { levels, cell, border, slot, bytes };
}

/** Split a byte budget into the always-resident low set and the streamed tiers. `budget` is in the format's own bytes (an RGBA8 fallback
 *  passes 4x the compressed budget, so it keeps the same cells resident at 4x the memory). */
export function planAtlas(o: { pages: number; size: number; levels: number; bpp: number; budget: number; finest: number; grid?: number; maxLayers?: number }): AtlasPlan {
  const { pages, size, levels, bpp, budget } = o, grid = o.grid ?? GRID, finest = Math.max(0, Math.min(levels - 2, o.finest)), maxLayers = Math.min(2047, o.maxLayers ?? 2048);
  // the low set: the finest base whose chain for every page fits its share (at least one mip coarser than the finest the screen draws)
  let lowBase = levels - 1;
  for (let L = finest + 1; L < levels; L++) if (pages * chainBytes(size, levels, L, bpp) <= budget * LOW_SHARE) { lowBase = L; break; }
  const lowBytes = pages * chainBytes(size, levels, lowBase, bpp), cells = pages * grid * grid;
  // the streamed tiers, coarse to fine: each coarser one a share of what is left, the finest the rest; never more slots than cells
  const bases: number[] = []; for (let b = lowBase - 1; b >= finest; b--) bases.push(b);
  let left = Math.max(0, budget - lowBytes); const coarseToFine: TierPlan[] = [];
  bases.forEach((base, i) => {
    const sh = slotShape(size, grid, base, lowBase, bpp), last = i === bases.length - 1;
    const slots = Math.max(0, Math.min(cells, maxLayers, Math.floor((last ? left : left * COARSE_TIER_SHARE) / sh.bytes)));
    coarseToFine.push({ base, levels: sh.levels, slots, bytes: slots * sh.bytes, cell: sh.cell, border: sh.border, slot: sh.slot }); left -= slots * sh.bytes;
  });
  const tiers = coarseToFine.reverse().filter(t => t.slots > 0);
  return { pages, size, levels, grid, bpp, finest, lowBase, lowBytes, tiers, bytes: lowBytes + tiers.reduce((s, t) => s + t.bytes, 0), budget };
}

/** the finest mip the view needs: lod = log2(atlas px per device px) for a sprite drawn at its pixel limit (sizes.ts: mip 0 holds `mip0`
 *  atlas px per display px), floored (the GPU blends toward the finer level), clamped to the screen's finest and the coarsest */
export function neededLevel(zoom: number, dpr: number, plan: Pick<AtlasPlan, 'finest' | 'levels'>, mip0 = 0.6): number {
  const lod = Math.log2(mip0 / Math.max(1e-6, zoom * dpr));
  return Math.max(plan.finest, Math.min(plan.levels - 1, Math.floor(lod + 1e-3)));
}

/** the cell (unit) index of a page's cell cx, cy */
export const unitOf = (page: number, cx: number, cy: number, grid = GRID) => (page * grid + cy) * grid + cx;
/** the source rectangle of a unit's slot at mip `level` of its page, in that level's texels (it reaches past the page by the border at
 *  the page's edges: transparent there, like the page's own gutter) */
export function slotRect(plan: AtlasPlan, tier: TierPlan, unit: number, level: number) {
  const g = plan.grid, cx = unit % g, cy = Math.floor(unit / g) % g, k = level - tier.base, cell = tier.cell >> k, border = tier.border >> k;
  return { x: cx * cell - border, y: cy * cell - border, w: cell + 2 * border, h: cell + 2 * border, page: Math.floor(unit / (g * g)) };
}

/** one level of one cell to upload into a slot (gen: the slot's generation when it was asked, so a load for an evicted slot is dropped) */
export interface PageLoad { tier: number; slot: number; unit: number; level: number; gen: number; onScreen: boolean }

interface Slot { unit: number; /** the finest mip uploaded (lowBase: none yet) */ have: number; /** the finest mip it should get */ target: number; used: number; gen: number; busy: boolean; failedAt: number; weight: number }

/** a cell the frame wants: its finest needed mip, whether it is drawn this frame (else it is near the view), and its share of the screen
 *  (any measure; more is loaded first) */
export interface PageWant { unit: number; level: number; onScreen: boolean; weight?: number }

export class AtlasPages {
  readonly plan: AtlasPlan;
  readonly units: number;
  private slots: Slot[][];
  /** per tier, the slot holding each unit (-1: none) */
  private slotOf: Int16Array[];
  /** per unit: the tier (0 = the low set, t + 1 = streamed tier t), the slot in it, and the finest mip it draws; packed for the shader */
  readonly lookup: Int32Array;
  /** set when lookup changed since the last takeLookup() */
  dirty = true;
  /** loads started, slots evicted, loads dropped (their slot was evicted meanwhile); starved: cells the last update found no slot for */
  stats = { loads: 0, evictions: 0, dropped: 0, starved: 0 };

  constructor(plan: AtlasPlan) {
    this.plan = plan; this.units = plan.pages * plan.grid * plan.grid;
    this.slots = plan.tiers.map(t => Array.from({ length: t.slots }, (): Slot => ({ unit: -1, have: plan.lowBase, target: plan.lowBase, used: -1, gen: 0, busy: false, failedAt: -1e9, weight: 0 })));
    this.slotOf = plan.tiers.map(() => new Int16Array(this.units).fill(-1));
    this.lookup = new Int32Array(this.units);
    for (let u = 0; u < this.units; u++) this.lookup[u] = AtlasPages.code(0, 0, plan.lowBase);
  }

  /** the shader's code for a unit (gl.ts atlasTex): tier | slot << 3 | finest mip << 14 */
  static code(tier: number, slot: number, level: number) { return tier | (slot << 3) | (level << 14); }
  static decode(code: number) { return { tier: code & 7, slot: (code >> 3) & 2047, level: code >> 14 }; }

  /** the finest mip a unit draws from now (the low set's base if no slot has anything finer) */
  levelOf(unit: number): number { return AtlasPages.decode(this.lookup[unit]!).level; }
  /** the units holding a slot in tier t (for tests and the debug readout) */
  unitsIn(t: number): number[] { return this.slots[t]!.filter(s => s.unit >= 0).map(s => s.unit); }
  /** slots in use per tier */
  usage(): number[] { return this.slots.map(tier => tier.reduce((n, s) => n + (s.unit >= 0 ? 1 : 0), 0)); }

  /** Take this frame's wants (any order, a unit may repeat) and return the next loads to start, keeping at most `maxLoads` in flight. */
  update(frame: number, wants: PageWant[], maxLoads = 4): PageLoad[] {
    const P = this.plan, L = P.lowBase;
    const order = wants.filter(w => w.level < L && w.unit >= 0 && w.unit < this.units)
      .sort((a, b) => Number(b.onScreen) - Number(a.onScreen) || a.level - b.level || (b.weight ?? 0) - (a.weight ?? 0));
    const seen = new Set<number>(); this.stats.starved = 0;
    for (const w of order) {
      if (seen.has(w.unit)) continue; seen.add(w.unit);
      const level = Math.max(w.level, P.finest), weight = (w.weight ?? 0) + (w.onScreen ? 1e9 : 0);
      // the tier made for this level: the coarsest base at or finer than it
      let want = -1; for (let t = 0; t < P.tiers.length; t++) if (P.tiers[t]!.base <= level) want = t;
      if (want < 0) continue;
      // already held by a tier at least that fine: keep it, and ask for the finer mips if the want got finer
      let held = -1; for (let t = 0; t <= want; t++) if (this.slotOf[t]![w.unit]! >= 0) { held = t; break; }
      if (held >= 0) { this.touch(held, w.unit, level, frame, weight); continue; }
      // a slot in that tier, else a finer tier, else a coarser one (better than the low set)
      const tryOrder = [want]; for (let t = want - 1; t >= 0; t--) tryOrder.push(t); for (let t = want + 1; t < P.tiers.length; t++) tryOrder.push(t);
      let placed = false;
      for (const t of tryOrder) {
        if (t > want && this.slotOf[t]![w.unit]! >= 0) { this.touch(t, w.unit, level, frame, weight); placed = true; break; }
        const s = this.victim(t, frame); if (s < 0) continue;
        this.assign(t, s, w.unit, Math.max(level, P.tiers[t]!.base), frame, weight); placed = true; break;
      }
      if (!placed) this.stats.starved++;
    }
    // the next level of each slot short of its target, wanted this frame and on screen first; each slot loads one level at a time
    let busy = 0; for (const tier of this.slots) for (const s of tier) if (s.busy) busy++;
    if (busy >= maxLoads) return [];
    const ready: { t: number; i: number; s: Slot }[] = [];
    this.slots.forEach((tier, t) => tier.forEach((s, i) => { if (s.unit >= 0 && !s.busy && s.have > s.target && frame - s.failedAt > 120) ready.push({ t, i, s }); }));
    ready.sort((a, b) => b.s.used - a.s.used || b.s.weight - a.s.weight || a.s.target - b.s.target);
    const loads: PageLoad[] = [];
    for (const r of ready) {
      if (busy >= maxLoads) break;
      r.s.busy = true; busy++; this.stats.loads++;
      loads.push({ tier: r.t, slot: r.i, unit: r.s.unit, level: r.s.have - 1, gen: r.s.gen, onScreen: r.s.used === frame && r.s.weight >= 1e9 });
    }
    return loads;
  }

  /** is the load's slot still the one it was asked for (not evicted since)? */
  valid(load: PageLoad): boolean { const s = this.slots[load.tier]?.[load.slot]; return !!s && s.gen === load.gen && s.unit === load.unit; }
  /** a load's pixels arrived (ok) or failed; returns whether to upload them (false: its slot was evicted meanwhile, drop them). The slot
   *  stays busy until uploaded(), so the next level is not asked for before this one is on the GPU */
  done(load: PageLoad, ok: boolean, frame = 0): boolean {
    if (!this.valid(load)) { this.stats.dropped++; return false; }
    if (!ok) { const s = this.slots[load.tier]![load.slot]!; s.busy = false; s.failedAt = frame; return false; }
    return true;
  }
  /** a load's level is on the GPU: the cell may draw from it */
  uploaded(load: PageLoad) {
    if (!this.valid(load)) return;
    const s = this.slots[load.tier]![load.slot]!; s.busy = false; s.have = Math.min(s.have, load.level);
    this.refresh(load.unit);
  }

  /** the lookup, if it changed since the last call */
  takeLookup(): Int32Array | null { if (!this.dirty) return null; this.dirty = false; return this.lookup; }

  private touch(t: number, unit: number, level: number, frame: number, weight: number) {
    const s = this.slots[t]![this.slotOf[t]![unit]!]!;
    s.used = frame; s.weight = weight; s.target = Math.min(s.target, Math.max(level, this.plan.tiers[t]!.base));
  }
  /** a free slot, else the least recently wanted one not wanted this frame (the lightest on a tie); -1 if every slot is in use this frame */
  private victim(t: number, frame: number): number {
    const tier = this.slots[t]!; let best = -1;
    for (let i = 0; i < tier.length; i++) {
      const s = tier[i]!; if (s.unit < 0) return i;
      if (s.used >= frame) continue;
      if (best < 0 || s.used < tier[best]!.used || (s.used === tier[best]!.used && s.weight < tier[best]!.weight)) best = i;
    }
    return best;
  }
  private assign(t: number, i: number, unit: number, target: number, frame: number, weight: number) {
    const s = this.slots[t]![i]!, old = s.unit;
    if (old >= 0) { this.slotOf[t]![old] = -1; this.stats.evictions++; }
    Object.assign(s, { unit, have: this.plan.lowBase, target, used: frame, gen: s.gen + 1, busy: false, failedAt: -1e9, weight });
    this.slotOf[t]![unit] = i;
    if (old >= 0) this.refresh(old);
    this.refresh(unit);
  }
  /** a unit's code: the slot with the finest uploaded mip, else the low set */
  private refresh(unit: number) {
    const P = this.plan; let code = AtlasPages.code(0, 0, P.lowBase), best = P.lowBase;
    for (let t = 0; t < P.tiers.length; t++) {
      const i = this.slotOf[t]![unit]!; if (i < 0) continue;
      const s = this.slots[t]![i]!; if (s.have < best) { best = s.have; code = AtlasPages.code(t + 1, i, s.have); }
    }
    if (this.lookup[unit] !== code) { this.lookup[unit] = code; this.dirty = true; }
  }
}
