/** T265 (#794): the tree belts along every river and creek (the owner, 2026-10-28: "somemore trees bunching along rivers and creeks on mass",
 *  and "dont screw performance").
 *
 *  - **The belt.** A jittered global grid (BELT.S tiles) near every waterway keeps a point by how far it lies past the bank: thickets close to
 *    the water (whole to BELT.full tiles, 10 m), thinning out to none at BELT.reach (40 m). A clump noise bunches the trees into thickets and
 *    glades, an open noise leaves whole stretches of bank bare (the water shows there), and on the camera's side of the water (the trees whose
 *    crowns would stand over it on screen: their ground point further down the screen than the water's) fewer stand near the bank. In the
 *    swamp (swamp.ts: the streams' band and the river's) a few trees stand, some of them dead snags, and more where it meets dry ground.
 *  - **The trees.** Broadleaf first (the waterside birches, aspens and maples weighted up; the library has no willow yet: requested in
 *    docs/GOLF-SPRITES.md), some conifers; at the forest's size (FOREST_SIZE) with its spread. The engine draws them as it draws the forest:
 *    never mirrored (tree-sun.ts, #775).
 *  - **Planting.** A pure function of the seed, the waterways and the swamp bands (riverBeltCell), cell by cell as the forest is (FOREST_CELL:
 *    the engine plants a cell's belt with its forest, Engine.plantCell), so cells plant in any order and never overlap; cleared by the same
 *    rules (Engine.treeClearance free: the roads, bridges, lots, the course, painted areas, the player's clearing), and never in the water (a
 *    trunk at least BELT.river.min / BELT.creek.min tiles past the water's or the channel's edge, never on water or creek tiles), on a hill (the
 *    forest's own) or on a steep slope.
 *
 *  Pure TypeScript, no DOM: the node tests run it. Units: tiles of 2 m. */
import { MAP, mulberry } from './iso';
import { fbm, hash2, makeNoise, smoothstep, type Noise } from './terrain/noise';
import { TC, sampleField, type Waterway } from './terrain/types';
import { FOREST_BROADLEAF, FOREST_CELL, FOREST_CONIFERS, FOREST_SIZE, dealTree, ownerSize, treeDeal, type ForestTree, type TreeSpecies } from './forest';
import { RIVER_BAND, SwampField, riverStreams, swampStreams } from './swamp';

/** the belt's numbers (tiles):
 *  - S: the grid's spacing (the forest's is 2.4: a thicket is denser); keep: the most of its points a thicket keeps;
 *  - river, creek: min, the nearest a trunk stands past the water's edge (a river: on its bank's outer part, the bank 3 tiles) or past the
 *    channel's edge (a creek: its swamp's core); bank, where the belt's distance starts (the river's bank's outer edge, a creek's channel);
 *  - full, reach: whole to full tiles past the bank, none past reach (10 m and 40 m);
 *  - clump, clumpWave, clumpFloor: the thickets: a noise of clumpWave tiles, under clump[0] a glade (clumpFloor of the trees), over clump[1] a thicket;
 *  - open, openWave: the gaps: a slow noise, under open[0] no belt at all (the bank bare, the water in view), over open[1] the whole belt;
 *  - front: on the camera's side of the water (front.dot: the unit vector from the water to the tree, along the screen's down (1, 1) / sqrt 2,
 *    over it), within front.near tiles of the bank only front.keep of the trees (their crowns would hide the water);
 *  - swamp: keep, the share of the trees standing where the swamp is whole; snag, the share of those that are dead snags (only snagClear
 *    tiles clear of anything built: no dead tree beside a lot or a road);
 *  - conifer: the conifers' share; slope: no tree on a slope steeper than this (the forest's soft limit) */
export const BELT = {
  S: 2.1, keep: 0.9,
  river: { min: 2, bank: 3 }, creek: { min: 0.5, bank: 0 },
  full: 5, reach: 20,
  clump: [-0.25, 0.2], clumpWave: 9, clumpFloor: 0.15,
  open: [-0.18, 0.05], openWave: 46,
  front: { dot: 0.35, near: 7, keep: 0.4 },
  swamp: { keep: 0.3, snag: 0.12, snagClear: 6 },
  conifer: 0.15, slope: 1.15,
} as const;
/** the farthest past a channel's edge a belt tree can stand (tiles) */
export const BELT_OUT = BELT.river.bank + BELT.reach;

/** the waterside weights: birches and aspens doubled, maples half again, oaks a little less; the snags out (the swamp deals its own) */
const WATERSIDE: Record<string, number> = { birch: 2, 'gold birch': 2, 'young aspen': 2, maple: 1.5, 'crimson maple': 1.5, 'scarlet maple': 1.5, 'ember maple': 1.5, oak: 0.8, 'old oak': 0.8, 'amber oak': 0.8, 'crimson oak': 0.8 };
const broad: TreeSpecies[] = FOREST_BROADLEAF.filter(s => !s.dead).map(s => ({ ...s, w: s.w * (WATERSIDE[s.name] ?? 1) }));
/** the belt's deals: the waterside broadleaf trees, the conifers (spruces and firs weighted up: they like wet ground), the dead snags */
export const BELT_BROAD_DEAL = treeDeal(broad);
export const BELT_CONIFER_DEAL = treeDeal(FOREST_CONIFERS.map(s => ({ ...s, w: s.w * (/spruce|fir/.test(s.name) ? 1.5 : 1) })));
export const BELT_SNAG_DEAL = treeDeal(FOREST_BROADLEAF.filter(s => s.dead));

/** segment records: ax ay bx by, the half widths at a and b, the kind (0 river, 1 creek), then the box (grown by the widest half width and
 *  BELT_OUT) */
const SEG = 11;
/** the bucket size (tiles) of the segment index */
const CELL = 32;

/** the waterways near a point: their segments indexed by where the belt can reach, so a cell looks at only the few near it */
export class WaterIndex {
  private segs: Float64Array;
  private cells = new Map<number, number[]>();
  constructor(waters: readonly Waterway[]) {
    const out: number[] = [];
    for (const w of waters) {
      const p = w.pts, kind = w.kind === 'river' ? 0 : 1;
      for (let k = 0; k < Math.max(1, p.length - 1); k++) {
        const a = p[k]!, b = p[Math.min(k + 1, p.length - 1)]!, g = Math.max(a.w, b.w) / 2 + BELT_OUT + 1;
        out.push(a.x, a.y, b.x, b.y, a.w / 2, b.w / 2, kind, Math.min(a.x, b.x) - g, Math.min(a.y, b.y) - g, Math.max(a.x, b.x) + g, Math.max(a.y, b.y) + g);
      }
    }
    this.segs = Float64Array.from(out);
    const s = this.segs;
    for (let i = 0; i < s.length; i += SEG) {
      for (let cy = Math.floor(s[i + 8]! / CELL); cy <= Math.floor(s[i + 10]! / CELL); cy++) for (let cx = Math.floor(s[i + 7]! / CELL); cx <= Math.floor(s[i + 9]! / CELL); cx++) {
        const key = (cy + 64) * 4096 + cx + 64, l = this.cells.get(key); if (l) l.push(i); else this.cells.set(key, [i]);
      }
    }
  }
  /** the segments (offsets) whose reach touches the tile box, in one order */
  near(x0: number, y0: number, x1: number, y1: number): number[] {
    const seen = new Set<number>(), s = this.segs;
    for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
      for (const i of this.cells.get((cy + 64) * 4096 + cx + 64) ?? []) if (s[i + 7]! <= x1 && s[i + 9]! >= x0 && s[i + 8]! <= y1 && s[i + 10]! >= y0) seen.add(i);
    }
    return [...seen].sort((a, b) => a - b);
  }
  /** the waterway nearest (x, y) among list: d, how far (x, y) lies past its channel's edge (tiles; negative inside), its kind (0 river, 1
   *  creek), and the unit vector from its nearest point to (x, y) (nx, ny); d Infinity with none */
  nearest(list: readonly number[], x: number, y: number, out: { d: number; kind: number; nx: number; ny: number }) {
    const s = this.segs; out.d = Infinity; out.kind = 1; out.nx = 0; out.ny = 0;
    for (const i of list) {
      if (x < s[i + 7]! || x > s[i + 9]! || y < s[i + 8]! || y > s[i + 10]!) continue;
      const ax = s[i]!, ay = s[i + 1]!, dx = s[i + 2]! - ax, dy = s[i + 3]! - ay, l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
      const ex = x - (ax + dx * t), ey = y - (ay + dy * t), r = Math.sqrt(ex * ex + ey * ey), d = r - (s[i + 4]! + (s[i + 5]! - s[i + 4]!) * t);
      if (d < out.d) { out.d = d; out.kind = s[i + 6]!; out.nx = r > 0 ? ex / r : 0; out.ny = r > 0 ? ey / r : 0; }
    }
    return out;
  }
}

/** what a map's belts are planted from, made once per terrain: the waterways' index, the swamp bands (the streams' and the river's, for the
 *  trees standing in the swamp) and the belt's noises */
export interface BeltField { water: WaterIndex; creekSwamp: SwampField; riverSwamp: SwampField; clump: Noise; open: Noise }
export function beltField(seed: number, waters: readonly Waterway[]): BeltField {
  return { water: new WaterIndex(waters), creekSwamp: new SwampField(swampStreams(waters)), riverSwamp: new SwampField(riverStreams(waters), RIVER_BAND), clump: makeNoise(seed ^ 0x3e17), open: makeNoise(seed ^ 0x0be7) };
}

/** the belt's keep (0..1) at a point b tiles past the bank (the profile: thick near the water, thinning out to none at BELT.reach) */
export const beltProfile = (b: number) => 1 - smoothstep(BELT.full, BELT.reach, b);

/** the belt trees of forest cell (ci, cj): a pure function of the seed, the terrain, the field and free (Engine.treeClearance: false where
 *  something built or the player's land keeps trees off), so cells plant in any order and never overlap. slope: the terrain's slope field
 *  (terrain-paint.ts slopeField), or null for flat ground */
export function riverBeltCell(seed: number, cls: Uint8Array, slope: Float32Array | null, f: BeltField, ci: number, cj: number, free: (x: number, y: number, r: number) => boolean, r0 = 1): ForestTree[] {
  const out: ForestTree[] = [], S = BELT.S, x0 = ci * FOREST_CELL, y0 = cj * FOREST_CELL;
  const list = f.water.near(x0, y0, x0 + FOREST_CELL, y0 + FOREST_CELL); if (!list.length) return out;
  const q = { d: 0, kind: 0, nx: 0, ny: 0 };
  for (let gx = Math.floor(x0 / S) - 1; gx <= Math.ceil((x0 + FOREST_CELL) / S) + 1; gx++) {
    for (let gy = Math.floor(y0 / S) - 1; gy <= Math.ceil((y0 + FOREST_CELL) / S) + 1; gy++) {
      const bx = (gx + 0.5) * S, by = (gy + 0.5) * S;
      if (Math.floor(bx / FOREST_CELL) !== ci || Math.floor(by / FOREST_CELL) !== cj) continue;
      const r = mulberry(hash2(hash2(seed ^ 0x6b1e, gx), gy));
      const x = bx + (r() - 0.5) * 0.9 * S, y = by + (r() - 0.5) * 0.9 * S;
      if (x < 1 || y < 1 || x >= MAP - 1 || y >= MAP - 1) continue;
      f.water.nearest(list, x, y, q);
      const kind = q.kind === 0 ? BELT.river : BELT.creek;
      if (!(q.d >= kind.min)) continue; // (never in the water: past the river's water and its bank's inner half, past a creek's channel)
      const b = q.d - kind.bank; if (b >= BELT.reach) continue;
      const c = cls[Math.floor(y) * MAP + Math.floor(x)];
      if (c === TC.WATER || c === TC.CREEK || c === TC.HILL) continue; // (the hills are the forest's)
      let p = BELT.keep * beltProfile(b);
      p *= smoothstep(BELT.open[0], BELT.open[1], fbm(f.open, x / BELT.openWave + 17.3, y / BELT.openWave - 4.1, 2)); if (!(p > 0)) continue;
      p *= BELT.clumpFloor + (1 - BELT.clumpFloor) * smoothstep(BELT.clump[0], BELT.clump[1], fbm(f.clump, x / BELT.clumpWave - 2.7, y / BELT.clumpWave + 8.9, 2));
      if ((q.nx + q.ny) * Math.SQRT1_2 > BELT.front.dot) p *= BELT.front.keep + (1 - BELT.front.keep) * smoothstep(BELT.front.near - 4, BELT.front.near, b);
      const u = r(); if (u >= p) continue; // (a cheap first cut: the swamp only ever thins)
      const sw = Math.max(f.creekSwamp.cover(x, y), f.riverSwamp.cover(x, y));
      if (sw > 0 && u >= p * (1 - (1 - BELT.swamp.keep) * sw)) continue;
      if (slope && sampleField(slope, x, y) > BELT.slope) continue;
      if (!free(x, y, r0)) continue;
      const deal = sw > 0.5 && r() < BELT.swamp.snag && free(x, y, BELT.swamp.snagClear) ? BELT_SNAG_DEAL : r() < BELT.conifer ? BELT_CONIFER_DEAL : BELT_BROAD_DEAL;
      const id = dealTree(deal, r()), scale = ownerSize(id) * FOREST_SIZE * (0.82 + r() * 0.36);
      out.push({ x, y, id, scale, flip: false });
    }
  }
  return out;
}
