// Farm lots and dirt tracks along country roads (Arena task T005): deep rural parcels fronting one side of a road seg,
// a deterministic farmstead-and-fields composition per parcel, and the farm track back into the fields as road legs.
// Pure TS, no DOM; not wired into the engine (the lead integrates: see the PR's integration notes).
// The parcel frame matches the town lots' (src/game/lots/compose.ts): a point is o + u*a + n*b in tiles (1 tile = 2 m),
// the road is at b < 0, the front edge (at seg.h + FARM_VERGE from the seg's centreline) at b = 0, a in [0, w], b in [0, d].
// Parcels tile the seg's whole line from a fixed anchor, so a seg split along the same line keeps its parcels and keys,
// like the town lots' global lattice. All layout is a pure function of (parcel, seed): pass one seed per farm (seedForParcel)
// and composeFarm, farmTrack and farmsteadOf with the same seed agree on the yard, the drive and the track.
import { MAP, clamp, mulberry } from '../../iso';
import { LIBRARY } from '../../library';
import type { LibItem } from '../../types';
import type { LotPatch } from '../../ground-protocol';
import type { Pt } from '../../network';
import type { Composition, Placed } from '../../lots/compose';
import { OWNER_SCALE } from '../../lots/scales';
import { TC } from '../../terrain/types';
import { RUSTY_PICKUPS } from '../../vehicles';

/** one rural parcel fronting a road: the frame origin (front-left corner, tiles), u along the road, n away from it;
 *  w (frontage) and d (depth) in tiles, side +1 to the left of a -> b and -1 to the right; key stable across seg splits */
export interface FarmParcel { key: string; o: Pt; u: Pt; n: Pt; w: number; d: number /* tiles */; side: 1 | -1 }
/** the farmstead layout composeFarm builds and farmTrack follows, in world tiles: the gate on the front edge (b = 0),
 *  the yard apron's centre, the farmhouse and barn footprint centres, and the drive's position a along u from o (tiles) */
export interface Farmstead { gate: Pt; yard: Pt; house: Pt; barn: Pt; driveA: number }

/** frontage and depth of a freshly cut parcel, tiles (60–160 m by 120–300 m); terrain can trim the depth to FARM_MIN_DEPTH */
export const FARM_FRONT_MIN = 30, FARM_FRONT_MAX = 80, FARM_DEPTH_MIN = 60, FARM_DEPTH_MAX = 150;
/** the shallowest parcel kept after bad terrain trims its depth, tiles (80 m) */
export const FARM_MIN_DEPTH = 40;
/** the grass verge kept between the asphalt edge (seg.h) and the parcel's front edge, tiles; the gap between neighbours, tiles */
export const FARM_VERGE = 1, FARM_GAP = 2;
/** where the line's tiling is anchored, in the along-line coordinate t = dot(p, u): below any tile on the map */
const ANCHOR = -4096;
/** place tolerances, as in the lot composer: reach past the parcel, street props into the verge, the overlap share allowed */
const REACH = 0.3, VERGE = 0.65, EPS = 0.02, OVERLAP = 0.35;
const isBad = (c: number) => c === TC.HILL || c === TC.WATER || c === TC.CREEK || c === TC.BANK;
const hund = (v: number) => Math.round(v * 100);
const pick = (r: () => number, a: string[]): string => a[Math.floor(r() * a.length)] ?? '';

/** FNV-style hash of integers to a uint32 (the lot composer's mix) */
function mix(...v: number[]): number { let h = 0x811c9dc5; for (const x of v) h = Math.imul(h ^ (x >>> 0), 16777619); return h >>> 0; }
/** the same hash as a fraction in [0, 1) (one final xor-shift so nearby inputs decorrelate) */
function h01(...v: number[]): number { const h = mix(...v); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; }
/** a parcel key as a uint32, so a farm's layout depends on which parcel it is as well as on its seed */
function keyHash(key: string): number { let h = 0x811c9dc5; for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619); return h >>> 0; }

/** the per-farm seed the lead should pass to composeFarm/farmTrack/farmsteadOf: the world seed mixed with the parcel's key,
 *  so one world seed still gives every farm its own layout and the same farm always composes the same */
export function seedForParcel(p: FarmParcel, worldSeed: number): number { return mix(worldSeed >>> 0, keyHash(p.key), 0xf17a); }

/** the parcel's four corners in world tiles (front-left, front-right, back-right, back-left) */
export function parcelCorners(p: FarmParcel): [Pt, Pt, Pt, Pt] {
  const x = p.o.x + p.u.x * p.w, y = p.o.y + p.u.y * p.w, bx = p.o.x + p.n.x * p.d, by = p.o.y + p.n.y * p.d;
  return [{ ...p.o }, { x, y }, { x: x + p.n.x * p.d, y: y + p.n.y * p.d }, { x: bx, y: by }];
}
/** the parcel's centre in world tiles */
export function parcelCentre(p: FarmParcel): Pt { return { x: p.o.x + p.u.x * p.w / 2 + p.n.x * p.d / 2, y: p.o.y + p.u.y * p.w / 2 + p.n.y * p.d / 2 }; }
/** do two parcels overlap (separating-axis test, 0.25 tiles of penetration tolerated, as the town lots use) */
export function parcelsOverlap(p: FarmParcel, q: FarmParcel): boolean {
  const pc = parcelCentre(p), qc = parcelCentre(q), dx = qc.x - pc.x, dy = qc.y - pc.y;
  for (const ax of [p.u, p.n, q.u, q.n]) {
    const r = (l: FarmParcel) => Math.abs(l.u.x * ax.x + l.u.y * ax.y) * l.w / 2 + Math.abs(l.n.x * ax.x + l.n.y * ax.y) * l.d / 2;
    if (Math.abs(dx * ax.x + dy * ax.y) >= r(p) + r(q) - 0.25) return false;
  }
  return true;
}

/* ---------- parcels ---------- */

/** the trimmed depth of a parcel: rows of 1-tile samples along n until the row before the first that touches bad terrain
 *  (HILL, WATER, CREEK, BANK or off the map); the same sampling the town lots use, but no bad sample is tolerated */
function trimDepth(cls: Uint8Array, o: Pt, u: Pt, n: Pt, w: number, D: number): number {
  for (let j = 0; j <= D; j++) for (let i = 0; i <= w; i++) {
    const x = Math.floor(o.x + u.x * i + n.x * j), y = Math.floor(o.y + u.y * i + n.y * j);
    if (x < 0 || y < 0 || x >= MAP || y >= MAP || y * MAP + x >= cls.length || isBad(cls[y * MAP + x])) return j - 1;
  }
  return D;
}

/** The farm parcels along one road seg, both sides. seg.h is the road class's half width in tiles; the front edge sits
 *  FARM_VERGE past it. Each side tiles the seg's whole line from ANCHOR with seeded frontages of 30–80 tiles and FARM_GAP
 *  between neighbours (split segs on the same line get the same tiling); a parcel is kept when its whole frontage lies in
 *  the seg's usable span (cut back h + 3 tiles at each end, clear of junctions) and its terrain-trimmed depth is at least
 *  FARM_MIN_DEPTH. Parcels of one call never overlap; parcels of different segs can (two roads back to back), which the
 *  lead settles like LotMap does — parcelsOverlap is the test. Steep land beyond TC.HILL cannot be seen from cls alone. */
export function farmParcels(seg: { a: Pt; b: Pt; h: number }, cls: Uint8Array, seed: number): FarmParcel[] {
  const out: FarmParcel[] = [], dvx = seg.b.x - seg.a.x, dvy = seg.b.y - seg.a.y, L = Math.hypot(dvx, dvy);
  if (L < 1e-6) return out;
  const u: Pt = { x: dvx / L, y: dvy / L }, pu: Pt = { x: -u.y, y: u.x }, h = Math.max(0, seg.h);
  const t0 = seg.a.x * u.x + seg.a.y * u.y, t1 = seg.b.x * u.x + seg.b.y * u.y, end = h + 3;
  const lo = t0 + end, hi = t1 - end;
  if (hi - lo < FARM_FRONT_MIN) return out;
  // the foot of the origin on the line: the same for every piece of the line, so it keys a parcel across splits
  const f: Pt = { x: seg.a.x - u.x * t0, y: seg.a.y - u.y * t0 };
  const lineH = mix(hund(f.x), hund(f.y), Math.round(u.x * 1000), Math.round(u.y * 1000));
  const kp = `${hund(f.x)},${hund(f.y)}|${Math.round(u.x * 1000)},${Math.round(u.y * 1000)}|F`;
  const ws = seed >>> 0, r0 = h + FARM_VERGE;
  for (const side of [1, -1] as const) {
    const n: Pt = { x: pu.x * side, y: pu.y * side };
    for (let t = ANCHOR; t < t1;) {
      const w = FARM_FRONT_MIN + Math.floor(h01(ws, lineH, side + 2, Math.round(t), 101) * (FARM_FRONT_MAX - FARM_FRONT_MIN + 1));
      if (t >= lo - 1e-9 && t + w <= hi + 1e-9) {
        const o: Pt = { x: f.x + u.x * t + n.x * r0, y: f.y + u.y * t + n.y * r0 };
        const want = FARM_DEPTH_MIN + Math.floor(h01(ws, lineH, side + 2, Math.round(t), 707) * (FARM_DEPTH_MAX - FARM_DEPTH_MIN + 1));
        const d = trimDepth(cls, o, u, n, w, want);
        if (d >= FARM_MIN_DEPTH) out.push({ key: `${kp}${side}|${Math.round(t)}`, o, u: { ...u }, n: { ...n }, w, d, side });
      }
      t += w + FARM_GAP;
    }
  }
  return out;
}

/* ---------- sprites (the lot composer's placement math, for the farm frame) ---------- */

const BY = new Map<string, LibItem>(LIBRARY.map(i => [i.id, i]));
const names = (ids: string[]) => ids.filter(id => BY.has(id));
const cat = (f: (i: LibItem) => boolean) => LIBRARY.filter(f).map(i => i.id);
type Box4 = [number, number, number, number];
/** the footprint of a sprite at scale s, relative to its anchor (the union of its boxes, as the engine draws it) */
function boxOf(id: string, s: number, flip: boolean): Box4 {
  const it = BY.get(id)!;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of it.boxes) {
    const hx = (flip ? b.hy : b.hx) * s / 2, hy = (flip ? b.hx : b.hy) * s / 2, dx = (flip ? b.dy : b.dx) * s / 2, dy = (flip ? b.dx : b.dy) * s / 2;
    x0 = Math.min(x0, dx - hx); x1 = Math.max(x1, dx + hx); y0 = Math.min(y0, dy - hy); y1 = Math.max(y1, dy + hy);
  }
  return [x0, y0, x1, y1];
}
/** a sprite's full extents along a farm frame's u and n at the owner's scale times mul (no jitter), to lay the yard out */
function frameExtents(u: Pt, n: Pt, id: string, flip: boolean, mul = 1): [number, number] {
  const h = boxOf(id, (OWNER_SCALE[id] ?? 1) * mul, flip), w = h[2] - h[0], d = h[3] - h[1];
  return [Math.abs(u.x) * w + Math.abs(u.y) * d, Math.abs(n.x) * w + Math.abs(n.y) * d];
}
/** the facing of a parcel, as the lot composer reads it: sprites face +Y (unflipped) or +X (flipped), and where the road
 *  lies on -Y/-X the rear view is wanted */
function facing(p: FarmParcel): { flip: boolean; rear: boolean; F: Pt } {
  const F: Pt = { x: -p.n.x, y: -p.n.y }, flip = Math.abs(F.x) > Math.abs(F.y);
  return { flip, rear: flip ? F.x < 0 : F.y < 0, F };
}
const FARMHOUSE_FRONT = names(['gen:house-farmhouse-wrap', 'gen:house-l-ranch', 'gen:house-ranch-long']);
const FARMHOUSE_REAR = names(['expansion:ranch-rear']);   // no farmhouse rear view exists; the ranch rear stands in
const BARN = names(['world:barn']), SILO = names(['ref:landmark-silo']), SHED = names(['ref:building-farm-shed']);
const GARAGE_FRONT = names(['static:garage_timber', 'static:garage_brick']), GARAGE_REAR = names(['expansion:garage-rear']);
const TREES = cat(i => i.kind === 'tree' && !/dead/.test(i.id)), BUSHES = cat(i => i.kind === 'bush');
const ORCHARD = names(['ref:tree-birch-gold', 'ref:tree-maple-crimson', 'world:tree_oak_0', 'world:tree_oak_1']);
const CARS = cat(i => i.cat === 'Vehicles' && /_[news](-v2)?$/.test(i.id)), PICKUPS = CARS.filter(id => /pickup|van/.test(id));
const FACE: Record<string, Pt> = { n: { x: 0, y: -1 }, s: { x: 0, y: 1 }, e: { x: 1, y: 0 }, w: { x: -1, y: 0 } };
interface Pair { x: string; y: string }
const PICKET: Pair = { x: 'world:fence_picket_x', y: 'world:fence_picket_y' };
const BOARD: Pair = { x: 'expansion:fence-privacy-x', y: 'expansion:fence-privacy-y' };   // the longest pair in the library: fewest props per long edge
const CHAIN: Pair = { x: 'expansion:chainlink-x', y: 'expansion:chainlink-y' };

interface Item { id: string; x: number; y: number; flip: boolean; s: number; fp: Box4; fence: boolean; veh: boolean; street: boolean; plant: boolean }
interface Spec { id: string; s: number; flip: boolean; h: Box4 }
interface Opt { flip?: boolean; mul?: number; fixed?: boolean; street?: boolean; plant?: boolean; veh?: boolean }
interface Patch { block: boolean; tex: LotPatch['tex']; quad: number[]; lines?: number[] }

/** does an axis-aligned footprint overlap a convex quad (8 numbers, corners in order); touching is not overlap */
function hit(fp: Box4, q: number[]): boolean {
  const axes: Pt[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }];
  for (let k = 0; k < 4; k++) { const j = (k + 1) % 4; axes.push({ x: -(q[2 * j + 1] - q[2 * k + 1]), y: q[2 * j] - q[2 * k] }); }
  const fx = [fp[0], fp[2], fp[2], fp[0]], fy = [fp[1], fp[1], fp[3], fp[3]];
  for (const ax of axes) {
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (let k = 0; k < 4; k++) {
      const pa = fx[k] * ax.x + fy[k] * ax.y, pb = q[2 * k] * ax.x + q[2 * k + 1] * ax.y;
      a0 = Math.min(a0, pa); a1 = Math.max(a1, pa); b0 = Math.min(b0, pb); b1 = Math.max(b1, pb);
    }
    if (a1 <= b0 + EPS || b1 <= a0 + EPS) return false;
  }
  return true;
}
/** the share of the smaller footprint two axis-aligned footprints share */
function share(p: Box4, q: Box4): number {
  const ix = Math.min(p[2], q[2]) - Math.max(p[0], q[0]), iy = Math.min(p[3], q[3]) - Math.max(p[1], q[1]);
  if (ix <= EPS || iy <= EPS) return 0;
  return ix * iy / Math.min((p[2] - p[0]) * (p[3] - p[1]), (q[2] - q[0]) * (q[3] - q[1]));
}

/** one farm's build: candidates in priority order, ground patches in paint order, and done() to settle them */
class FB {
  readonly o: Pt; readonly u: Pt; readonly n: Pt; readonly W: number; readonly D: number;
  readonly flip: boolean; readonly rear: boolean; readonly F: Pt; readonly r: () => number;
  readonly items: Item[] = []; readonly patches: Patch[] = [];
  /** the upright cap for plants (orchard and hedgerow trees queue last); fences are not capped */
  cap = 80;
  constructor(p: FarmParcel, r: () => number) {
    this.o = p.o; this.u = p.u; this.n = p.n; this.W = p.w; this.D = p.d; this.r = r;
    const f = facing(p); this.flip = f.flip; this.rear = f.rear; this.F = f.F;
  }
  /** the world point of a parcel-frame point (a along u, b along n, tiles) */
  P(a: number, b: number): Pt { return { x: this.o.x + this.u.x * a + this.n.x * b, y: this.o.y + this.u.y * a + this.n.y * b }; }
  /** a sprite at its owner's scale times mul (varied 5% unless fixed: the buildings are fixed so farmsteadOf is exact) */
  spec(id: string, o: Opt = {}): Spec | null {
    if (!BY.has(id)) return null;
    const flip = !!o.flip, s = (OWNER_SCALE[id] ?? 1) * (o.mul ?? 1) * (o.fixed ? 1 : 1 + 0.05 * (2 * this.r() - 1));
    return { id, s, flip, h: boxOf(id, s, flip) };
  }
  /** the half extent of a spec along the parcel's u (ea) and n (eb) */
  ea(g: Spec): number { return (Math.abs(this.u.x) * (g.h[2] - g.h[0]) + Math.abs(this.u.y) * (g.h[3] - g.h[1])) / 2; }
  eb(g: Spec): number { return (Math.abs(this.n.x) * (g.h[2] - g.h[0]) + Math.abs(this.n.y) * (g.h[3] - g.h[1])) / 2; }
  /** a spec with its footprint centre at a world point */
  atW(g: Spec | null, c: Pt, o: Opt = {}): Item | null {
    if (!g) return null;
    const it = BY.get(g.id)!, h = g.h, x = c.x - (h[0] + h[2]) / 2, y = c.y - (h[1] + h[3]) / 2;
    const item: Item = { id: g.id, x, y, flip: g.flip, s: g.s, fp: [x + h[0], y + h[1], x + h[2], y + h[3]], fence: it.kind === 'fencex' || it.kind === 'fencey' || g.id === 'world:hedge', veh: !!o.veh || it.cat === 'Vehicles', street: !!o.street, plant: !!o.plant };
    this.items.push(item); return item;
  }
  /** one sprite, footprint centre at a parcel-frame point */
  put(id: string, a: number, b: number, o: Opt = {}): Item | null { const g = this.spec(id, o); return g ? this.atW(g, this.P(a, b), o) : null; }
  /** a straight run of fence segments end to end between two parcel-frame points; segments whose centre falls in gap (fractions of the run) are left out */
  run(kind: Pair, a0: number, b0: number, a1: number, b1: number, gap?: [number, number]) {
    const p0 = this.P(a0, b0), p1 = this.P(a1, b1), dx = p1.x - p0.x, dy = p1.y - p0.y, L = Math.hypot(dx, dy);
    if (L < 1e-6) return;
    const ax = Math.abs(dx) >= Math.abs(dy), g = this.spec(ax ? kind.x : kind.y);
    if (!g) return;
    const step = ax ? g.h[2] - g.h[0] : g.h[3] - g.h[1];
    if (step <= 0) return;
    const n = Math.floor(L / step + 1e-9), left = (L - n * step) / 2;
    for (let i = 0; i < n; i++) {
      const t = (left + (i + 0.5) * step) / L;
      if (gap && t >= gap[0] && t <= gap[1]) continue;
      this.atW(g, { x: p0.x + dx * t, y: p0.y + dy * t });
    }
  }
  /** the world quad (8 numbers) of a parcel-frame rectangle */
  quad(a0: number, b0: number, a1: number, b1: number): number[] { return [this.P(a0, b0), this.P(a1, b0), this.P(a1, b1), this.P(a0, b1)].flatMap(q => [q.x, q.y]); }
  /** a ground patch over a parcel-frame rectangle (clamped to the parcel); blocking patches (the drive, the track) keep uprights off */
  pave(block: boolean, a0: number, b0: number, a1: number, b1: number, tex: LotPatch['tex'], lines?: number[]) {
    const A0 = clamp(a0, 0, this.W), A1 = clamp(a1, 0, this.W), B0 = clamp(b0, 0, this.D), B1 = clamp(b1, 0, this.D);
    if (A1 - A0 < 0.05 || B1 - B0 < 0.05) return;
    this.patches.push({ block, tex, quad: this.quad(A0, B0, A1, B1), lines });
  }
  /** crop or furrow rows for a field rectangle: lines every ROW tiles running along u or along n, in world tiles.
   *  NOTE for the lead: the renderer paints every lot patch's lines in worn off-white today (parking bays); rows want a
   *  dark furrow colour when this is wired in — the geometry here is the rows whatever they are painted in. */
  rows(a0: number, b0: number, a1: number, b1: number, alongU: boolean): number[] {
    const ROW = 1.5, out: number[] = [];
    if (alongU) for (let b = b0 + ROW / 2; b < b1 - 0.2 && out.length < 480; b += ROW) { const x = this.P(a0 + 0.3, b), y = this.P(a1 - 0.3, b); out.push(x.x, x.y, y.x, y.y); }
    else for (let a = a0 + ROW / 2; a < a1 - 0.2 && out.length < 480; a += ROW) { const x = this.P(a, b0 + 0.3), y = this.P(a, b1 - 0.3); out.push(x.x, x.y, y.x, y.y); }
    return out;
  }
  /** a car or pickup from a pool, the one whose facing suits the road best, its near edge at b0 along the lane at a */
  vehicle(pool: string[], a: number, b0: number): number {
    if (!pool.length) return 0;
    let best = -2; const ties: string[] = [];
    for (const id of pool) {
      const l = RUSTY_PICKUPS[id] ?? /_([news])(-v2)?$/.exec(id)?.[1]; if (!l) continue;
      const f = FACE[l], dd = f.x * this.F.x + f.y * this.F.y;
      if (dd > best + 1e-9) { best = dd; ties.length = 0; ties.push(id); } else if (dd > best - 1e-9) ties.push(id);
    }
    const g = this.spec(pick(this.r, ties));
    if (!g) return 0;
    const span = 2 * this.eb(g);
    this.atW(g, this.P(a, b0 + span / 2));
    return span;
  }
  /** n sprites from a pool at seeded points of a parcel-frame rectangle */
  scatter(pool: string[], a0: number, b0: number, a1: number, b1: number, n: number, o: Opt = {}) {
    for (let i = 0; i < n && pool.length; i++) this.put(pick(this.r, pool), a0 + (a1 - a0) * this.r(), b0 + (b1 - b0) * this.r(), o);
  }
  /** is the footprint inside the parcel (REACH past the sides and back, VERGE into the front grass for street props) */
  inside(it: Item): boolean {
    const [x0, y0, x1, y1] = it.fp, minB = it.street ? -VERGE : -REACH;
    for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) {
      const dx = x - this.o.x, dy = y - this.o.y, a = dx * this.u.x + dy * this.u.y, b = dx * this.n.x + dy * this.n.y;
      if (a < -REACH || a > this.W + REACH || b < minB || b > this.D + REACH) return false;
    }
    return true;
  }
  /** does it stand on the drive or the track (vehicles excepted) */
  onBlock(it: Item): boolean { for (const q of this.patches) if (q.block && !it.veh && hit(it.fp, q.quad)) return true; return false; }
  /** the composition: candidates in order, the first that fits wins; fences settle separately, plants stop at the cap */
  done(): Composition {
    const props: Placed[] = [], acc: Item[] = []; let plants = 0;
    for (const it of this.items) {
      if (!this.inside(it) || this.onBlock(it)) continue;
      if (!it.fence) {
        if (it.plant && plants >= this.cap) continue;
        if (acc.some(a => !a.fence && share(a.fp, it.fp) > OVERLAP)) continue;
        if (it.plant) plants++;
      }
      acc.push(it); props.push({ id: it.id, x: it.x, y: it.y, flip: it.flip, scale: it.s });
    }
    return { props, ground: this.patches.map(q => (q.lines?.length ? { pts: q.quad, tex: q.tex, lines: q.lines } : { pts: q.quad, tex: q.tex })) };
  }
}

/* ---------- the farmstead layout (shared by composeFarm, farmTrack and farmsteadOf) ---------- */

type PlotKind = 'crop' | 'plough' | 'pasture' | 'orchard' | 'fallow';
interface Plot { a0: number; b0: number; a1: number; b1: number; kind: PlotKind }
interface Layout {
  driveA: number; side: 1 | -1; houseId: string; houseMul: number; barnMul: number;
  ha: number; hb: number; ba: number; bb: number;   // farmhouse and barn footprint centres, parcel frame (tiles)
  hw: number; hd: number; bw: number; bd: number;   // their extents along u and n at the built scale
  front: number; yardB1: number;                 // the house's front setback and the back of the yard (fields start here)
  endB: number; branchB: number; branchA: number | null;   // the track: its end, the branch's b, and where it runs to (null: no branch)
  plots: Plot[]; pasture: Plot | null;
}
/** the layout of one farm from its parcel and seed alone (its own random stream, so extra draws in composeFarm cannot move it) */
function layoutOf(p: FarmParcel, seed: number): Layout {
  const r = mulberry(mix(seed >>> 0, keyHash(p.key), p.w, p.d, 0xfa12)), { flip, rear } = facing(p), W = p.w, D = p.d;
  // the farmhouse: mostly the farmhouse sprite, sometimes a ranch; the barn only has the one view
  const hv = r(), houseId = rear ? (FARMHOUSE_REAR[0] ?? FARMHOUSE_FRONT[0]) : hv < 0.55 ? FARMHOUSE_FRONT[0] : FARMHOUSE_FRONT[1 + Math.floor(r() * (FARMHOUSE_FRONT.length - 1))] ?? FARMHOUSE_FRONT[0];
  let [hw, hd] = frameExtents(p.u, p.n, houseId, flip);
  let [bw, bd] = frameExtents(p.u, p.n, BARN[0], flip);
  // house, lane (2 tiles) and barn stand side by side with 0.7 tiles clear of the lane and the edges: where the narrowest
  // frontage (or a diagonal frame's wider extents) cannot hold all three, shrink both buildings, never grow, as specFit does
  let houseMul = 1, barnMul = 1;
  if (hw + bw + 4.8 > W) {
    houseMul = barnMul = (W - 4.8) / (hw + bw);
    [hw, hd] = frameExtents(p.u, p.n, houseId, flip, houseMul);
    [bw, bd] = frameExtents(p.u, p.n, BARN[0], flip, barnMul);
  }
  const side = (r() < 0.5 ? -1 : 1) as 1 | -1;
  const lo = (side > 0 ? bw : hw) + 2.4, hi = W - (side > 0 ? hw : bw) - 2.4;
  const driveA = clamp(W * (0.38 + 0.24 * r()), lo, Math.max(lo, hi));
  const ha = driveA + side * (1.7 + hw / 2), ba = driveA - side * (1.7 + bw / 2);
  const front = 7 + 5 * r(), hb = front + hd / 2, bb = hb + 2 + 4 * r();
  const yardB1 = Math.min(Math.max(hb + hd / 2, bb + bd / 2) + 5 + 3 * r(), Math.max(front + hd + 4, D - 3));
  // the fields: bands across the depth behind the yard, each split by the track lane (and again where a side runs wide)
  const plots: Plot[] = [], f0 = yardB1 + 1.5, f1 = D - 1.5, R = f1 - f0;
  let pasture: Plot | null = null;
  if (R >= 10) {
    const bands = R > 70 ? 3 : R > 38 ? 2 : 1, edges = [f0];
    let left = R;
    for (let k = bands - 1; k >= 1; k--) { const take = left * (0.3 + 0.25 * r()); edges.push(edges[edges.length - 1] + Math.min(take, left - 10 * k)); left = f1 - edges[edges.length - 1]; }
    edges.push(f1);
    for (let k = 0; k + 1 < edges.length; k++) {
      const segs: [number, number][] = [];
      for (const [s0, s1] of [[1.5, driveA - 2.2], [driveA + 2.2, W - 1.5]] as [number, number][]) {
        if (s1 - s0 < 8) continue;
        if (s1 - s0 > 38 && r() < 0.6) { const m = (s0 + s1) / 2 + (r() - 0.5) * 6; segs.push([s0, m - 1], [m + 1, s1]); } else segs.push([s0, s1]);
      }
      for (const [a0, a1] of segs) {
        const v = r();
        let kind: PlotKind = v < 0.38 ? 'crop' : v < 0.56 ? 'plough' : v < 0.78 ? 'pasture' : v < 0.9 ? 'orchard' : 'fallow';
        if (kind === 'orchard' && (a1 - a0 < 14 || edges[k + 1] - edges[k] < 14)) kind = 'crop';
        const plot: Plot = { a0, b0: edges[k] + 0.8, a1, b1: edges[k + 1] - 0.8, kind };
        plots.push(plot);
        if (kind === 'pasture' && !pasture) pasture = plot;
      }
    }
    // every farm grows something: with no crop drawn, the largest plot becomes the crop field
    if (plots.length && !plots.some(q => q.kind === 'crop')) {
      const big = plots.reduce((a2, b2) => ((b2.a1 - b2.a0) * (b2.b1 - b2.b0) > (a2.a1 - a2.a0) * (a2.b1 - a2.b0) ? b2 : a2));
      big.kind = 'crop';
      if (pasture === big) pasture = plots.find(q => q.kind === 'pasture') ?? null;
    }
  }
  // the track: the drive lane straight on past the yard to endB, with (usually) one branch along a band headland
  const endB = Math.max(Math.min(D - 3, yardB1 + (0.55 + 0.4 * r()) * Math.max(0, D - 3 - yardB1)), Math.min(D - 3, yardB1 + 4));
  let branchB = (yardB1 + endB) / 2;
  if (plots.length) { const bs = [...new Set(plots.map(q => q.b0))].filter(b => b > yardB1 + 4 && b < endB - 3); if (bs.length) branchB = bs[Math.floor(r() * bs.length)] - 0.8; }
  const branchA = r() < 0.65 && endB - branchB > 3 ? (r() < 0.5 ? 3.5 : W - 3.5) : null;
  return { driveA, side, houseId, houseMul, barnMul, ha, hb, ba, bb, hw, hd, bw, bd, front, yardB1, endB, branchB, branchA, plots, pasture };
}
/** the track's centreline joints in the parcel frame: the gate, the back of the yard, the branch point, the stem's end */
function trackFrame(L: Layout): { a: number; b: number }[] {
  const pts = [{ a: L.driveA, b: 0 }, { a: L.driveA, b: L.yardB1 }];
  if (L.branchB > L.yardB1 + 1.5) pts.push({ a: L.driveA, b: L.branchB });
  if (L.endB > pts[pts.length - 1].b + 1e-6) pts.push({ a: L.driveA, b: L.endB });
  return pts;
}
const world = (p: FarmParcel, a: number, b: number): Pt => ({ x: p.o.x + p.u.x * a + p.n.x * b, y: p.o.y + p.u.y * a + p.n.y * b });

/** The farmstead of a parcel at a seed (world tiles): where the drive meets the front edge, the yard's centre and the two
 *  buildings composeFarm will place. The lead extends the gate along -n to the road's centreline to connect a trip end. */
export function farmsteadOf(p: FarmParcel, seed: number): Farmstead {
  const L = layoutOf(p, seed);
  return { gate: world(p, L.driveA, 0), yard: world(p, L.driveA, (L.front + L.yardB1) / 2), house: world(p, L.ha, L.hb), barn: world(p, L.ba, L.bb), driveA: L.driveA };
}

/** The farm track as dirt-road legs in world tiles: from the gate on the front edge, up the drive past the farmhouse
 *  cluster, then straight back into the fields to 55–95% of the remaining depth, usually with one branch along a field
 *  headland to a side gate. Legs chain end to end (the branch starts on the stem). The first leg is the drive connector:
 *  extend its start along -n to the road's centreline to join the network, or drop it and keep the rest as field track.
 *  Adding these as roads will spawn town lots along them unless the dirt class is kept out of LotMap (integration note). */
export function farmTrack(p: FarmParcel, seed: number): { a: Pt; b: Pt }[] {
  const L = layoutOf(p, seed), f = trackFrame(L), legs: { a: Pt; b: Pt }[] = [];
  for (let i = 0; i + 1 < f.length; i++) legs.push({ a: world(p, f[i].a, f[i].b), b: world(p, f[i + 1].a, f[i + 1].b) });
  if (L.branchA !== null) legs.push({ a: world(p, L.driveA, L.branchB), b: world(p, L.branchA, L.branchB) });
  return legs;
}

/** The composition of one farm: the farmhouse and barn either side of a gravel drive near the road (a silo, shed or garage
 *  on most farms, the tractor and the pickup in the yard, the mailbox at the gate), fields behind — crop (field tex with row
 *  lines), ploughed dirt, fallow, pasture kept as grass behind a chain-link paddock fence with hay bales, and orchards as a
 *  tree grid — a board fence along the frontage, a picket fence at the back of the yard, hedgerow trees, and the dirt track
 *  painted as ground strips under the legs farmTrack returns. Deterministic in (parcel, seed); every prop id exists in
 *  LIBRARY; no two uprights share more than 35% of the smaller footprint; nothing stands in front of the parcel's front
 *  edge except the mailbox and the utility pole, within VERGE tiles of it and clear of the asphalt. */
export function composeFarm(p: FarmParcel, seed: number): Composition {
  const L = layoutOf(p, seed), B = new FB(p, mulberry(mix(seed >>> 0, keyHash(p.key), 0xc09f))), { W, D, r, flip, rear } = B;
  // the ground, back to front (later patches paint over earlier): fields, the yard apron, the drive, the track
  for (const q of L.plots) {
    if (q.kind === 'crop') B.pave(false, q.a0, q.b0, q.a1, q.b1, 'field', B.rows(q.a0, q.b0, q.a1, q.b1, r() < 0.5));
    else if (q.kind === 'plough') B.pave(false, q.a0, q.b0, q.a1, q.b1, 'dirt', B.rows(q.a0, q.b0, q.a1, q.b1, r() < 0.5));
    else if (q.kind === 'fallow') B.pave(false, q.a0, q.b0, q.a1, q.b1, 'dirt');
  }
  const yA0 = Math.min(L.ha - L.hw / 2, L.ba - L.bw / 2, L.driveA - 1) - 1.5, yA1 = Math.max(L.ha + L.hw / 2, L.ba + L.bw / 2, L.driveA + 1) + 1.5;
  B.pave(false, yA0, Math.max(0, L.front - 2.5), yA1, L.yardB1, 'gravel');
  B.pave(true, L.driveA - 1, 0, L.driveA + 1, L.yardB1, 'gravel');
  B.pave(true, L.driveA - 0.8, L.yardB1, L.driveA + 0.8, L.endB, 'dirt');
  if (L.branchA !== null) B.pave(true, Math.min(L.driveA, L.branchA), L.branchB - 0.8, Math.max(L.driveA, L.branchA), L.branchB + 0.8, 'dirt');
  // the buildings, at their laid-out centres and scales so farmsteadOf stays exact
  B.put(L.houseId, L.ha, L.hb, { flip, mul: L.houseMul, fixed: true });
  B.put(BARN[0], L.ba, L.bb, { flip, mul: L.barnMul, fixed: true });
  // the silo stands at the barn's back corner, away from the lane; the shed behind the barn towards it
  if (SILO.length && r() < 0.55) { const [sw, sd] = frameExtents(p.u, p.n, SILO[0], flip); B.put(SILO[0], clamp(L.ba - L.side * (L.bw / 4), sw / 2 + 0.7, W - sw / 2 - 0.7), clamp(L.bb + L.bd / 2 + sd / 2 + 0.6, sd / 2 + 0.7, D - sd / 2 - 0.7), { flip }); }
  if (SHED.length && r() < 0.75) B.put(SHED[0], clamp(L.ba + L.side * (L.bw / 5), 3, W - 3), Math.min(D - 2.5, L.bb + L.bd / 2 + 2.6), { flip });
  if (r() < 0.45) B.put(rear ? (GARAGE_REAR[0] ?? pick(r, GARAGE_FRONT)) : pick(r, GARAGE_FRONT), clamp(L.driveA + L.side * 3.4, 2.6, W - 2.6), Math.max(2.2, L.front - 1.6), { flip });
  // the working yard: tractor before the barn, a trailer by the shed, the pickup on the drive, clutter, the windmill
  if (r() < 0.75) B.put('expansion:farm-tractor', L.ba, L.bb - L.bd / 2 - 1.8, { veh: true });
  if (r() < 0.35) B.put('expansion:utility-trailer', clamp(L.ba + L.bw / 2 + 1.6, 1.6, W - 1.6), L.bb + L.bd / 2 + 1.2, { veh: true });
  // (T236: the yard's pickup is the yellow or the rusty one: vehicles.ts RUSTY_PICKUPS, farm and junk lots only)
  if (r() < 0.85) { const span = B.vehicle(PICKUPS.length ? [...PICKUPS, ...Object.keys(RUSTY_PICKUPS)] : CARS, L.driveA, 2.2); if (span && r() < 0.3) B.vehicle(CARS, L.driveA, 2.4 + span); }
  B.scatter(names(['expansion:lumber-bundle', 'expansion:pallet-stack', 'expansion:oil-drums']), Math.max(1, L.ba - L.bw / 2), L.bb + L.bd / 2 + 0.8, Math.min(W - 1, L.ba + L.bw / 2), Math.min(D - 1, L.yardB1), 2);
  if (r() < 0.25) B.put('ref:landmark-windmill', r() < 0.5 ? 2 : W - 2, L.yardB1 - 1.8);
  // the house garden behind the farmhouse, then the gate furniture
  const gB0 = L.hb + L.hd / 2 + 0.9, gB1 = Math.max(gB0 + 1, L.yardB1 - 0.8);
  for (const [id, ch] of [['expansion:chicken-coop', 0.35], ['expansion:glasshouse', 0.25], ['expansion:outhouse', 0.3], ['expansion:wooden-well', 0.25], ['expansion:doghouse', 0.35]] as [string, number][])
    if (r() < ch) B.put(id, clamp(L.ha + (r() - 0.5) * L.hw, 1.4, W - 1.4), gB0 + (gB1 - gB0) * r());
  B.put(r() < 0.5 ? 'expansion:rural-mailboxes' : 'world:mailbox', clamp(L.driveA + 1.7, 1, W - 1), -0.3, { street: true });
  if (r() < 0.45) B.put('town:utility_pole', r() < 0.5 ? 1.2 : W - 1.2, -0.35, { street: true });
  for (const sx of [-1, 1]) B.put(pick(r, TREES), clamp(L.ha + sx * (L.hw / 2 + 1.3), 1, W - 1), L.hb + (r() - 0.5) * 2, { plant: true });
  B.put(pick(r, TREES), clamp(L.ha - L.hw / 4, 1, W - 1), Math.max(1.2, L.front - 2), { plant: true });
  for (let a = L.ha - L.hw / 2; a <= L.ha + L.hw / 2; a += 1.6) B.put(pick(r, BUSHES), a, L.front - 0.8, { plant: true });
  // fences: board along the road frontage (a gate gap at the drive), picket at the back of the yard, chain-link round the paddock
  B.run(BOARD, 0.3, 0.35, W - 0.3, 0.35, [(L.driveA - 1.7) / W, (L.driveA + 1.7) / W]);
  B.run(PICKET, Math.max(0.4, yA0), L.yardB1, L.driveA - 1.7, L.yardB1);
  B.run(PICKET, L.driveA + 1.7, L.yardB1, Math.min(W - 0.4, yA1), L.yardB1);
  const pad = L.pasture;
  if (pad) {
    const laneSideLeft = pad.a1 <= L.driveA;   // the gate gap goes on the paddock side facing the track lane
    B.run(CHAIN, pad.a0, pad.b0, pad.a1, pad.b0);
    B.run(CHAIN, pad.a0, pad.b1, pad.a1, pad.b1);
    B.run(CHAIN, pad.a0, pad.b0, pad.a0, pad.b1, laneSideLeft ? undefined : [0.42, 0.58]);
    B.run(CHAIN, pad.a1, pad.b0, pad.a1, pad.b1, laneSideLeft ? [0.42, 0.58] : undefined);
    B.scatter(names(['ref:halloween-hay-bales']), pad.a0 + 1.2, pad.b0 + 1.2, pad.a1 - 1.2, pad.b1 - 1.2, 2 + Math.floor(r() * 3));
  }
  // the fields' own furniture: orchard grids, hay in the fallow, hedgerow trees along the back and one side
  for (const q of L.plots) {
    if (q.kind === 'orchard') {
      // a compact tree grid at a fixed 5.5-tile pitch from the plot's lane-side corner, not stretched over the whole plot
      const fromLeft = q.a1 <= L.driveA, cols = Math.min(6, Math.floor((q.a1 - q.a0 - 2) / 5.5)), rowsK = Math.min(5, Math.floor((q.b1 - q.b0 - 2) / 5.5));
      for (let i = 0; i < cols; i++) for (let j = 0; j < rowsK; j++) B.put(pick(r, ORCHARD), (fromLeft ? q.a1 - 3 - i * 5.5 : q.a0 + 3 + i * 5.5) + (r() - 0.5) * 0.8, q.b0 + 3 + j * 5.5 + (r() - 0.5) * 0.8, { plant: true, mul: 0.75 });
    } else if (q.kind === 'fallow') B.scatter(names(['ref:halloween-hay-bales']), q.a0 + 1.2, q.b0 + 1.2, q.a1 - 1.2, q.b1 - 1.2, 2);
    else if (q.kind === 'pasture' && q !== pad) B.scatter(BUSHES, q.a0 + 1, q.b0 + 1, q.a1 - 1, q.b1 - 1, 2, { plant: true });
  }
  for (let a = 3 + r() * 4; a < W - 2; a += 9 + r() * 5) B.put(pick(r, TREES), a, D - 1.3, { plant: true });
  const sideA = r() < 0.5 ? 1 : W - 1;
  for (let b = L.yardB1 + 6 + r() * 4; b < D - 3; b += 11 + r() * 6) B.put(pick(r, TREES), sideA, b, { plant: true });
  return B.done();
}
