// The practice facilities' own building tools (T206, #540; the owner, 2026-10-27: "this should have its own building tools. not use the course
// hole building tools"): Facilities ▸ Practice places a whole facility as a ghost over the practice area, [ / ] size it (never under what
// practice.ts needs to open it), R turns it, a click builds it. This is the pure part: the facility's outlines, the course-grid cells they lay,
// what they cost, why a spot is refused, and the facility under a point (the bulldozer takes it whole).
// - The putting green: an organic green, one of PUTT_SHAPES' outlines rounded with T204's roundedRing (rugged-edges.ts) and moved by a seeded,
//   smooth radial wobble, so no two greens match and no side runs straight; the course's own collar draws its fringe, and the range host
//   stands its practice flags in it once practice.ts scans it open.
// - The chipping green and bunker: a rounder green and a real greenside bunker curled round its side within BUNKER_REACH (practice.ts). #1281 (the owner,
//   2026-11-14: "remove the TEe box and make the bunker bigger. add some rough grass around the entire thing"): no chip mat any more, the bunker about
//   half the green's width, and round each facility a ragged band of rough grass that blends into the ground it stands on.
// Both lay green, bunker and rough cells of hole 0 into the course grid (the same cells the brushes laid before, and the rough round them), so practice.ts's
// scan, the golfers (rangebiz.ts RangeSim) and the takings work unchanged (the rough counts for nothing: it is not green or sand). Pure TS, no DOM, deterministic. Units: tiles of 2 m (the grid's cells are 1 m).
import type { Pt } from '../network';
import { roundedRing, signedArea } from '../rugged-edges';
import { CELL_T, SURF, cellAt, cellCentre, type Grid } from '../ext/course-grid';
import { polyCells } from '../ext/course-grid/areas';
import { unitBuildCost } from './costs';
import { BUNKER_MIN, BUNKER_REACH, CHIP_MIN, FRINGE_M, PUTT_MIN } from './practice';
import type { PracticeId } from './rangesave';

/** a facility's green, in m² of green alone: the least (never under what practice.ts needs open: PUTT_MIN / CHIP_MIN, before its fringe is
 *  counted), the size the tool starts at, and the most; [ / ] step by `step` (a factor) */
export const PRACTICE_SIZE: Readonly<Record<PracticeId, { min: number; def: number; max: number }>> = {
  putting: { min: PUTT_MIN, def: 420, max: 900 },
  chipping: { min: CHIP_MIN, def: 280, max: 600 },
};
export const SIZE_STEP = 1.15;
/** the putting green's outline presets (Tab steps through them): name and a coarse unit outline (x y pairs, about radius 1), rounded and
 *  wobbled before use */
export const PUTT_SHAPES: readonly { id: string; name: string; pts: readonly number[] }[] = [
  { id: 'oval', name: 'Oval', pts: [1.3, 0, 0.92, 0.6, 0, 0.82, -0.92, 0.6, -1.3, 0, -0.92, -0.6, 0, -0.82, 0.92, -0.6] },
  { id: 'kidney', name: 'Kidney', pts: [1.25, -0.1, 1.0, 0.55, 0.35, 0.8, 0, 0.45, -0.35, 0.8, -1.0, 0.55, -1.25, -0.1, -0.75, -0.75, 0, -0.85, 0.75, -0.75] },
  { id: 'pear', name: 'Pear', pts: [1.35, 0, 1.05, 0.5, 0.45, 0.6, -0.2, 0.95, -0.95, 0.75, -1.2, 0, -0.95, -0.75, -0.2, -0.95, 0.45, -0.6, 1.05, -0.5] },
  { id: 'peanut', name: 'Peanut', pts: [1.4, 0, 1.1, 0.6, 0.45, 0.7, 0, 0.42, -0.45, 0.7, -1.1, 0.6, -1.4, 0, -1.1, -0.6, -0.45, -0.7, 0, -0.42, 0.45, -0.7, 1.1, -0.6] },
  { id: 'teardrop', name: 'Teardrop', pts: [1.5, 0, 0.8, 0.45, 0, 0.82, -0.75, 0.75, -1.1, 0, -0.75, -0.75, 0, -0.82, 0.8, -0.45] },
];
/** the chipping green's outline: a rounder blob (the same rounding and wobble) */
const CHIP_SHAPE = [1.1, 0, 0.75, 0.75, 0, 1.02, -0.75, 0.75, -1.1, 0, -0.75, -0.75, 0, -1.02, 0.75, -0.75];
/** the turns R steps through (eighths of a turn) */
export const TURNS = 8;
/** the facility's layout (m): the bunker's gap from the green's edge (room for the green's collar), and its length along the green and its depth off it, each a
 *  [share of the green's radius, least, most]. #1281 (the owner, 2026-11-14: "remove the TEe box and make the bunker bigger"): the old bunker was a thin crescent
 *  (9 x 4.4 m, 38 m²) and the chip mat a mound of 6 m²; now a real greenside bunker, about half the green's width along its edge and a third of it deep (10 x 7 m
 *  beside the default green), and no chip mat */
const LAYOUT = { bunkerGap: 1.6, bunkerLen: [1.1, 9.5, 17] as const, bunkerDepth: [0.72, 6, 9] as const };
/** #1281 (the owner: "add some rough grass around the entire thing"): the band of rough round a facility's green and bunker, in metres: its mean width, how much
 *  a slow wave and a faster one (value noise over the ground) move it, and the least and most it is. Its outer edge is ragged; it never lies on a cell that holds
 *  something else, nor outside the practice area. The chipping stands (practice.ts scanPractice) sit 5 m off the green's edge, just past it */
export const ROUGH = { base: 3, slow: 1.1, fast: 0.6, min: 1.4, max: 4.8 } as const;
/** two facilities (and anything else built in the practice area) keep this far apart (m): past BUNKER_REACH, so the chipping bunker never
 *  counts for the putting green, and past LINK_M, so the bulldozer never takes them together */
export const GAP_M = 8;
/** the bulldozer takes a facility's cells (green, bunker, tee) that lie within this of each other (m): the green and its bunker (and an old save's chip mat) */
export const LINK_M = 6.5;

/** what one facility lays: its kind, its green's outline (closed, tiles), its bunker's (chipping only; its chip mat's, `spot`, is no longer laid: an old save's
 *  mat is still a facility's cell), its centre and the wobble's seed (the rough band's ragged edge follows it) */
export interface FacilityPlan { kind: PracticeId; green: number[]; bunker: number[] | null; spot: number[] | null; centre: Pt; seed: number }
/** where and how: the centre (tiles), the green's size (m² of green alone, clamped to PRACTICE_SIZE), the turn (eighths), the outline preset
 *  (putting) and the wobble's seed */
export interface PlanSpec { kind: PracticeId; x: number; y: number; m2: number; turn: number; shape: number; seed: number }

/** a facility's green size clamped to its range */
export const clampSize = (kind: PracticeId, m2: number): number => { const s = PRACTICE_SIZE[kind]; return Math.min(s.max, Math.max(s.min, Number.isFinite(m2) ? m2 : s.def)); };

/** a small seeded hash (0..1) */
function hash01(seed: number, k: number): number {
  let h = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(k + 1, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0; h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
/** a unit outline rounded (T204's roundedRing: every corner a curve) and moved by a seeded radial wobble (a few smooth waves round the ring,
 *  a few percent of its radius), centred on its centroid; no side stays straight */
function organic(pts: readonly number[], seed: number, amp: number): number[] {
  const ring = roundedRing(pts, 10, 0.08);
  const waves = [2, 3, 5].map((k, i) => ({ k, a: amp * [1, 0.6, 0.35][i]! * (0.6 + 0.8 * hash01(seed, i)), p: hash01(seed, 10 + i) * Math.PI * 2 }));
  const out: number[] = [];
  for (let i = 0; i + 1 < ring.length; i += 2) {
    const x = ring[i]!, y = ring[i + 1]!, th = Math.atan2(y, x);
    let f = 1; for (const w of waves) f += w.a * Math.sin(w.k * th + w.p);
    out.push(x * f, y * f);
  }
  return out;
}
/** a unit outline scaled to area m2 (m²), turned by angle a (radians) and moved to (x, y) (tiles) */
function place(unit: readonly number[], m2: number, a: number, x: number, y: number): number[] {
  const A = Math.abs(signedArea(unit)), k = Math.sqrt(m2 / 4 / Math.max(1e-9, A)), c = Math.cos(a), s = Math.sin(a), out: number[] = [];
  for (let i = 0; i + 1 < unit.length; i += 2) { const u = unit[i]! * k, v = unit[i + 1]! * k; out.push(x + u * c - v * s, y + u * s + v * c); }
  return out;
}
/** an outline in the facility's frame (m, u along its turn, v across) moved to the world (tiles) */
function frame(pts: readonly number[], a: number, x: number, y: number): number[] {
  const c = Math.cos(a), s = Math.sin(a), out: number[] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) { const u = pts[i]! / 2, v = pts[i + 1]! / 2; out.push(x + u * c - v * s, y + u * s + v * c); }
  return out;
}

/** the facility's outlines for a spec: the putting green alone, or the chipping green with its bunker curled round its side (+v). #1281: no chip mat */
export function practicePlan(o: PlanSpec): FacilityPlan {
  const m2 = clampSize(o.kind, o.m2), a = (((Math.round(o.turn) % TURNS) + TURNS) % TURNS) * Math.PI * 2 / TURNS, centre = { x: o.x, y: o.y };
  if (o.kind === 'putting') {
    const sh = PUTT_SHAPES[((Math.round(o.shape) % PUTT_SHAPES.length) + PUTT_SHAPES.length) % PUTT_SHAPES.length]!;
    return { kind: 'putting', green: place(organic(sh.pts, o.seed, 0.05), m2, a, o.x, o.y), bunker: null, spot: null, centre, seed: o.seed };
  }
  const green = place(organic(CHIP_SHAPE, o.seed, 0.045), m2, a, o.x, o.y);
  // the green's reach along +v (m), in its own frame, to set the bunker off its edge
  const c = Math.cos(a), s = Math.sin(a);
  let vMax = 0;
  for (let i = 0; i + 1 < green.length; i += 2) { const dx = (green[i]! - o.x) * 2, dy = (green[i + 1]! - o.y) * 2, u = dx * c + dy * s, v = -dx * s + dy * c; if (Math.abs(u) < 3 && v > vMax) vMax = v; }
  const R = Math.sqrt(m2 / Math.PI), size = (t: readonly [number, number, number]) => Math.min(t[2], Math.max(t[1], t[0] * R)), L = size(LAYOUT.bunkerLen), D = size(LAYOUT.bunkerDepth);
  // the bunker: a kidney bowed round the green (its inner side follows the green's curve), from bunkerGap to bunkerGap + D off its edge; its outer side is fullest in
  // the middle, tapers toward the ends and wanders a little, so no two bunkers are the same and none is a clean crescent
  const ring: number[] = [], N = 14, r0 = vMax + LAYOUT.bunkerGap, ph0 = hash01(o.seed, 40) * Math.PI * 2, ph1 = hash01(o.seed, 41) * Math.PI * 2;
  const arc = (rad: number, i: number) => { const t = -0.5 + i / N, ang = (t * L) / (r0 + D / 2); return [Math.sin(ang) * rad, Math.cos(ang) * rad]; };
  for (let i = 0; i <= N; i++) { const [u, v] = arc(r0, i); ring.push(u!, v!); }
  for (let i = N; i >= 0; i--) { const t = -0.5 + i / N, bulge = 1 - 0.45 * (2 * t) ** 2 + 0.07 * Math.sin(9 * t + ph0) + 0.05 * Math.sin(17 * t + ph1), [u, v] = arc(r0 + D * bulge, i); ring.push(u!, v!); }
  const bunker = frame(roundedRing(ring, 2.2, 0.5), a, o.x, o.y);
  return { kind: 'chipping', green, bunker, spot: null, centre, seed: o.seed };
}

/** the grid cells a plan lays: green, bunker (not under the green), tee (an old chip mat's: none now) and rough (the band round them, #1281, under none of the
 *  others), cell indices of g */
export interface PlanCells { green: number[]; bunker: number[]; tee: number[]; rough: number[] }
/** #1281: a smooth value noise (-1..1) of (x, y) in the lattice of `seed` */
function vnoise(seed: number, x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const h = (i: number, j: number) => hash01(seed, ((i & 0x3ff) << 10) | (j & 0x3ff)) * 2 - 1, a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
/** #1281: the distance (cells: m; a two-pass chamfer, within a few percent) from each cell of a w x h box to the nearest of its seeds (seed[i] set), Infinity far off */
export function distanceField(w: number, h: number, seed: Uint8Array): Float32Array {
  const d = new Float32Array(w * h), D1 = 1, D2 = Math.SQRT2;
  for (let i = 0; i < d.length; i++) d[i] = seed[i] ? 0 : Infinity;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; let v = d[i]!;
    if (x > 0) v = Math.min(v, d[i - 1]! + D1);
    if (y > 0) { v = Math.min(v, d[i - w]! + D1); if (x > 0) v = Math.min(v, d[i - w - 1]! + D2); if (x < w - 1) v = Math.min(v, d[i - w + 1]! + D2); }
    d[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; let v = d[i]!;
    if (x < w - 1) v = Math.min(v, d[i + 1]! + D1);
    if (y < h - 1) { v = Math.min(v, d[i + w]! + D1); if (x < w - 1) v = Math.min(v, d[i + w + 1]! + D2); if (x > 0) v = Math.min(v, d[i + w - 1]! + D2); }
    d[i] = v;
  }
  return d;
}
/** #1281: the band of rough round a facility's cells (green, bunker, tee: `feat`): the cells within a ragged width of them (ROUGH: a slow and a faster value noise,
 *  from the plan's seed, over the ground relative to the facility's centre, so the band keeps its shape as the ghost moves), on the grid's cells that hold nothing
 *  (SURF.none), inside `box` (the practice area, tiles x0 y0 x1 y1) when given */
function roughBand(g: Grid, feat: readonly number[], p: FacilityPlan, box?: readonly [number, number, number, number]): number[] {
  if (!feat.length) return [];
  const reach = Math.ceil(ROUGH.max) + 1;
  let cx0 = Infinity, cy0 = Infinity, cx1 = -Infinity, cy1 = -Infinity;
  for (const i of feat) { const cx = i % g.w, cy = (i - cx) / g.w; if (cx < cx0) cx0 = cx; if (cx > cx1) cx1 = cx; if (cy < cy0) cy0 = cy; if (cy > cy1) cy1 = cy; }
  cx0 = Math.max(0, cx0 - reach); cy0 = Math.max(0, cy0 - reach); cx1 = Math.min(g.w - 1, cx1 + reach); cy1 = Math.min(g.h - 1, cy1 + reach);
  const W = cx1 - cx0 + 1, H = cy1 - cy0 + 1, seed = new Uint8Array(W * H);
  for (const i of feat) { const cx = i % g.w, cy = (i - cx) / g.w; seed[(cy - cy0) * W + cx - cx0] = 1; }
  const d = distanceField(W, H, seed), ox = (p.centre.x - g.x0) / CELL_T, oy = (p.centre.y - g.y0) / CELL_T, out: number[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dist = d[y * W + x]!; if (dist === 0 || dist > ROUGH.max) continue;
    const cx = cx0 + x, cy = cy0 + y, i = cy * g.w + cx; if (g.surf[i] !== SURF.none) continue;
    if (box) { const tx = g.x0 + (cx + 0.5) * CELL_T, ty = g.y0 + (cy + 0.5) * CELL_T; if (tx < box[0] || tx >= box[2] || ty < box[1] || ty >= box[3]) continue; }
    const lx = cx - ox, ly = cy - oy, width = Math.min(ROUGH.max, Math.max(ROUGH.min, ROUGH.base + ROUGH.slow * vnoise(p.seed + 7, lx / 5.5, ly / 5.5) + ROUGH.fast * vnoise(p.seed + 19, lx / 2.2, ly / 2.2)));
    if (dist <= width) out.push(i);
  }
  return out;
}
/** the cells a plan lays on g; box (the practice area, tiles): the rough band stays inside it */
export function planCells(g: Grid, p: FacilityPlan, box?: readonly [number, number, number, number]): PlanCells {
  const seen = new Set<number>(), take = (pts: number[] | null) => { const out: number[] = []; if (pts) polyCells(g, pts, i => { if (!seen.has(i)) { seen.add(i); out.push(i); } }); return out; };
  const green = take(p.green), bunker = take(p.bunker), tee = take(p.spot);
  return { green, bunker, tee, rough: roughBand(g, [...green, ...bunker, ...tee], p, box) };
}
/** the surface each part of a plan lays (SURF ids) */
export const PART_SURF = { green: SURF.green, bunker: SURF.bunker, tee: SURF.tee, rough: SURF.rough } as const;
/** what laying a plan's cells costs ($): each cell that changes, at its surface's seeded price (the brushes' price, 1 m² a cell) */
export function planCost(g: Grid, c: PlanCells): number {
  let n = 0;
  for (const k of ['green', 'bunker', 'tee', 'rough'] as const) { const s = PART_SURF[k], unit = unitBuildCost(k); for (const i of c[k]) if (g.surf[i] !== s) n += unit; }
  return Math.round(n);
}
/** the green's size a plan lays (m², green cells) and its bunker's cells within reach (practice.ts's rule, for the tests and the label) */
export const planM2 = (c: PlanCells): number => c.green.length;

/** the reasons a spot is refused (the ghost's red label; 'outside' also offers the "Show area" pill) */
export const PRACTICE_WHY = {
  outside: 'Outside the practice area',
  land: 'Not your land',
  near: `Too close to another practice green: keep ${GAP_M} m apart`,
  built: { putting: 'Your putting green is built: bulldoze it to build another', chipping: 'Your chipping green is built: bulldoze it to build another' } as Readonly<Record<PracticeId, string>>,
  none: 'No practice area: the driving range has one beside its car park',
  /** T239: a guided start's practice area is land to buy first */
  forSale: 'The practice area is for sale: buy it in Land for sale first',
} as const;
export type RefusalKind = 'outside' | 'land' | 'near' | 'built' | '';

/** what a spot check needs: the practice area's box (tiles x0 y0 x1 y1), whether a tile is the player's, and whether that facility is open now */
export interface SpotCtx { box: readonly [number, number, number, number]; owned?: (x: number, y: number) => boolean; open?: boolean;
  /** T239: the practice area is still for sale (not the player's yet): every spot in it is refused with PRACTICE_WHY.forSale */
  forSale?: boolean }
/** why plan p cannot be built on grid g ('' when it can), and the kind: the green (with its fringe) and the rest inside the area, on your land,
 *  GAP_M clear of every green, bunker and tee already in the area, and the facility not open already */
export function planWhy(g: Grid, p: FacilityPlan, c: PlanCells, s: SpotCtx): { why: string; kind: RefusalKind } {
  const [x0, y0, x1, y1] = s.box, inset = FRINGE_M * CELL_T;
  const inside = (pts: number[] | null, d: number) => { if (!pts) return true; for (let i = 0; i + 1 < pts.length; i += 2) { const x = pts[i]!, y = pts[i + 1]!; if (x < x0 + d || x > x1 - d || y < y0 + d || y > y1 - d) return false; } return true; };
  if (!inside(p.green, inset) || !inside(p.bunker, 0) || !inside(p.spot, 0)) return { why: PRACTICE_WHY.outside, kind: 'outside' };
  if (s.forSale) return { why: PRACTICE_WHY.forSale, kind: 'land' };
  if (s.owned) for (const k of ['green', 'bunker', 'tee'] as const) for (const i of c[k]) { const q = cellCentre(g, i); if (!s.owned(q.x, q.y)) return { why: PRACTICE_WHY.land, kind: 'land' }; }
  if (s.open) return { why: PRACTICE_WHY.built[p.kind], kind: 'built' };
  // anything built in the area within GAP_M of the plan's outlines
  const gap = GAP_M / 2, parts = [p.green, p.bunker, p.spot].filter((q): q is number[] => !!q).map(q => ({ q, b: bbox(q) }));
  const cx0 = Math.max(0, Math.floor((x0 - g.x0) / CELL_T)), cy0 = Math.max(0, Math.floor((y0 - g.y0) / CELL_T));
  const cx1 = Math.min(g.w, Math.ceil((x1 - g.x0) / CELL_T)), cy1 = Math.min(g.h, Math.ceil((y1 - g.y0) / CELL_T));
  for (let cy = cy0; cy < cy1; cy++) for (let cx = cx0; cx < cx1; cx++) {
    const v = g.surf[cy * g.w + cx]!; if (v !== SURF.green && v !== SURF.bunker && v !== SURF.tee) continue;
    const x = g.x0 + (cx + 0.5) * CELL_T, y = g.y0 + (cy + 0.5) * CELL_T;
    for (const { q, b } of parts) if (x > b[0] - gap && x < b[2] + gap && y > b[1] - gap && y < b[3] + gap && polyDist(q, x, y) < gap) return { why: PRACTICE_WHY.near, kind: 'near' };
  }
  return { why: '', kind: '' };
}
function bbox(q: readonly number[]): [number, number, number, number] {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (let i = 0; i + 1 < q.length; i += 2) { a = Math.min(a, q[i]!); b = Math.min(b, q[i + 1]!); c = Math.max(c, q[i]!); d = Math.max(d, q[i + 1]!); }
  return [a, b, c, d];
}
/** the distance from (x, y) to a closed polygon (0 inside), tiles */
export function polyDist(q: readonly number[], x: number, y: number): number {
  const n = q.length >> 1; let inside = false, best = Infinity;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = q[2 * j]!, ay = q[2 * j + 1]!, bx = q[2 * i]!, by = q[2 * i + 1]!;
    if ((by > y) !== (ay > y) && x < ax + ((y - ay) * (bx - ax)) / (by - ay)) inside = !inside;
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx - x, ay + t * dy - y));
  }
  return inside ? 0 : best;
}

/** the facility under tile (x, y) in the practice area (box): its green, bunker and tee cells, those within LINK_M of each other from the cell
 *  there, and (#1281) the rough band round them: the area's rough cells nearer them than any other facility's, within ROUGH.max (null: none there, or
 *  outside the area). The cell may be one of the band's: it finds the facility it rings. A painted facility of an old save is taken the same way */
export function facilityAt(g: Grid, box: readonly [number, number, number, number], x: number, y: number): { cells: number[]; green: number; bunker: number; tee: number; rough: number } | null {
  if (x < box[0] || x >= box[2] || y < box[1] || y >= box[3]) return null;
  const feat = (i: number) => { const v = g.surf[i]; return v === SURF.green || v === SURF.bunker || v === SURF.tee; };
  let at = cellAt(g, x, y);
  if (at >= 0 && g.surf[at] === SURF.rough) {
    // a cell of the rough band: the nearest facility cell within the band's reach stands for it
    const ax = at % g.w, ay = (at - ax) / g.w, r = Math.ceil(ROUGH.max); let best = -1, bd = Infinity;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const nx = ax + dx, ny = ay + dy; if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue; const k = ny * g.w + nx, d = dx * dx + dy * dy; if (d < bd && d <= ROUGH.max * ROUGH.max && feat(k)) { bd = d; best = k; } }
    at = best;
  }
  if (at < 0 || !feat(at)) return null;
  const cx0 = Math.max(0, Math.floor((box[0] - g.x0) / CELL_T)), cy0 = Math.max(0, Math.floor((box[1] - g.y0) / CELL_T));
  const cx1 = Math.min(g.w, Math.ceil((box[2] - g.x0) / CELL_T)), cy1 = Math.min(g.h, Math.ceil((box[3] - g.y0) / CELL_T)), R = Math.ceil(LINK_M), R2 = LINK_M * LINK_M;
  const seen = new Set<number>([at]), stack = [at], out: number[] = [];
  while (stack.length) {
    const i = stack.pop()!; out.push(i);
    const ix = i % g.w, iy = (i - ix) / g.w;
    // a cell inside its own kind's run passes no new link: only an edge cell reaches out (the inside is taken by its neighbours)
    const v = g.surf[i], inner = ix > cx0 && iy > cy0 && ix < cx1 - 1 && iy < cy1 - 1 && g.surf[i - 1] === v && g.surf[i + 1] === v && g.surf[i - g.w] === v && g.surf[i + g.w] === v;
    const r = inner ? 1 : R;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > R2) continue;
      const nx = ix + dx, ny = iy + dy; if (nx < cx0 || ny < cy0 || nx >= cx1 || ny >= cy1) continue;
      const k = ny * g.w + nx; if (seen.has(k) || !feat(k)) continue;
      seen.add(k); stack.push(k);
    }
  }
  let green = 0, bunker = 0, tee = 0;
  for (const i of out) { const v = g.surf[i]; if (v === SURF.green) green++; else if (v === SURF.bunker) bunker++; else tee++; }
  // #1281: the band: each rough cell of the area goes with the facility whose cells are the nearer (a band shared by two near ones is split between them)
  const W = cx1 - cx0, H = cy1 - cy0, own = new Set(out), sa = new Uint8Array(W * H), sb = new Uint8Array(W * H);
  let anyRough = false;
  for (let cy = cy0; cy < cy1; cy++) for (let cx = cx0; cx < cx1; cx++) {
    const i = cy * g.w + cx, s = g.surf[i]!;
    if (s === SURF.rough) anyRough = true; else if (feat(i)) (own.has(i) ? sa : sb)[(cy - cy0) * W + cx - cx0] = 1;
  }
  let rough = 0;
  if (anyRough) {
    const da = distanceField(W, H, sa), db = distanceField(W, H, sb);
    for (let cy = cy0; cy < cy1; cy++) for (let cx = cx0; cx < cx1; cx++) {
      const i = cy * g.w + cx; if (g.surf[i] !== SURF.rough) continue;
      const k = (cy - cy0) * W + cx - cx0, d = da[k]!;
      if (d <= ROUGH.max + 0.5 && d <= db[k]!) { out.push(i); rough++; }
    }
  }
  return { cells: out, green, bunker, tee, rough };
}
/** what the bulldozer refunds for a facility's cells: half their seeded price (the course's sell-back rate, as a prop's) */
export const facilityRefund = (f: { green: number; bunker: number; tee: number; rough?: number }): number => Math.round((f.green * unitBuildCost('green') + f.bunker * unitBuildCost('bunker') + f.tee * unitBuildCost('tee') + (f.rough ?? 0) * unitBuildCost('rough')) / 2);
/** the bunker cells within practice.ts's reach of a plan's green (the chipping green needs BUNKER_MIN of them) */
export function bunkerInReach(g: Grid, c: PlanCells): number {
  const greens = c.green.map(i => cellCentre(g, i)), R = BUNKER_REACH * CELL_T; let n = 0;
  for (const i of c.bunker) { const q = cellCentre(g, i); if (greens.some(p => Math.abs(p.x - q.x) <= R && Math.abs(p.y - q.y) <= R && (p.x - q.x) ** 2 + (p.y - q.y) ** 2 <= R * R)) n++; }
  return n;
}
export { BUNKER_MIN };
