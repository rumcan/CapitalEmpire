// The practice facilities' own building tools (T206, #540; the owner, 2026-10-27: "this should have its own building tools. not use the course
// hole building tools"): Facilities ▸ Practice places a whole facility as a ghost over the practice area, [ / ] size it (never under what
// practice.ts needs to open it), R turns it, a click builds it. This is the pure part: the facility's outlines, the course-grid cells they lay,
// what they cost, why a spot is refused, and the facility under a point (the bulldozer takes it whole).
// - The putting green: an organic green, one of PUTT_SHAPES' outlines rounded with T204's roundedRing (rugged-edges.ts) and moved by a seeded,
//   smooth radial wobble, so no two greens match and no side runs straight; the course's own collar draws its fringe, and the range host
//   stands its practice flags in it once practice.ts scans it open.
// - The chipping green and bunker: a rounder green, a practice bunker curled round its side within BUNKER_REACH (practice.ts), and a small tee
//   mat to chip from on the far side.
// Both lay green, bunker and tee cells of hole 0 into the course grid, the same cells the brushes laid before, so practice.ts's scan, the
// golfers (rangebiz.ts RangeSim) and the takings work unchanged. Pure TS, no DOM, deterministic. Units: tiles of 2 m (the grid's cells are 1 m).
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
/** the facility's layout (m): the bunker's gap from the green's edge, its depth and length (a share of the green's radius, clamped), the chip
 *  mat's gap from the green's edge and its size */
const LAYOUT = { bunkerGap: 1, bunkerDepth: 4.4, bunkerLen: [0.95, 9, 15] as const, spotGap: 5.5, spotW: 3, spotD: 2 };
/** two facilities (and anything else built in the practice area) keep this far apart (m): past BUNKER_REACH, so the chipping bunker never
 *  counts for the putting green, and past LINK_M, so the bulldozer never takes them together */
export const GAP_M = 8;
/** the bulldozer takes a facility's cells (green, bunker, tee) that lie within this of each other (m): the green, its bunker and its chip mat */
export const LINK_M = 6.5;

/** what one facility lays: its kind, its green's outline (closed, tiles), its bunker's and its chip mat's (chipping only), and its centre */
export interface FacilityPlan { kind: PracticeId; green: number[]; bunker: number[] | null; spot: number[] | null; centre: Pt }
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

/** the facility's outlines for a spec: the putting green alone, or the chipping green with its bunker curled round its side (+v) and its chip
 *  mat on the far side (-u) */
export function practicePlan(o: PlanSpec): FacilityPlan {
  const m2 = clampSize(o.kind, o.m2), a = (((Math.round(o.turn) % TURNS) + TURNS) % TURNS) * Math.PI * 2 / TURNS, centre = { x: o.x, y: o.y };
  if (o.kind === 'putting') {
    const sh = PUTT_SHAPES[((Math.round(o.shape) % PUTT_SHAPES.length) + PUTT_SHAPES.length) % PUTT_SHAPES.length]!;
    return { kind: 'putting', green: place(organic(sh.pts, o.seed, 0.05), m2, a, o.x, o.y), bunker: null, spot: null, centre };
  }
  const green = place(organic(CHIP_SHAPE, o.seed, 0.045), m2, a, o.x, o.y);
  // the green's reach along +v (m) and along -u, in its own frame, to set the bunker and the mat off its edge
  const c = Math.cos(a), s = Math.sin(a);
  let vMax = 0, uMin = 0;
  for (let i = 0; i + 1 < green.length; i += 2) { const dx = (green[i]! - o.x) * 2, dy = (green[i + 1]! - o.y) * 2, u = dx * c + dy * s, v = -dx * s + dy * c; if (Math.abs(u) < 3 && v > vMax) vMax = v; if (Math.abs(v) < 3 && u < uMin) uMin = u; }
  const R = Math.sqrt(m2 / Math.PI), L = Math.min(LAYOUT.bunkerLen[2], Math.max(LAYOUT.bunkerLen[1], LAYOUT.bunkerLen[0] * R)), D = LAYOUT.bunkerDepth;
  // the bunker: a crescent bowed round the green (its inner side follows the green's curve), from bunkerGap to bunkerGap + D off its edge
  const ring: number[] = [], N = 10, r0 = vMax + LAYOUT.bunkerGap;
  const arc = (rad: number, i: number) => { const t = -0.5 + i / N, ang = (t * L) / (r0 + D / 2); return [Math.sin(ang) * rad, Math.cos(ang) * rad]; };
  for (let i = 0; i <= N; i++) { const [u, v] = arc(r0, i); ring.push(u!, v!); }
  for (let i = N; i >= 0; i--) { const t = -0.5 + i / N, bulge = 1 - 0.35 * (2 * t) ** 2, [u, v] = arc(r0 + D * bulge, i); ring.push(u!, v!); }
  const bunker = frame(roundedRing(ring, 1.2, 0.5), a, o.x, o.y);
  // the chip mat: a small rounded tee off the far side
  const u0 = uMin - LAYOUT.spotGap, w = LAYOUT.spotD, h = LAYOUT.spotW;
  const spot = frame(roundedRing([u0 - w, -h / 2, u0, -h / 2, u0, h / 2, u0 - w, h / 2], 0.4, 0.5), a, o.x, o.y);
  return { kind: 'chipping', green, bunker, spot, centre };
}

/** the grid cells a plan lays: green, bunker (not under the green) and tee (the chip mat, under neither), cell indices of g */
export interface PlanCells { green: number[]; bunker: number[]; tee: number[] }
export function planCells(g: Grid, p: FacilityPlan): PlanCells {
  const seen = new Set<number>(), take = (pts: number[] | null) => { const out: number[] = []; if (pts) polyCells(g, pts, i => { if (!seen.has(i)) { seen.add(i); out.push(i); } }); return out; };
  const green = take(p.green), bunker = take(p.bunker), tee = take(p.spot);
  return { green, bunker, tee };
}
/** the surface each part of a plan lays (SURF ids) */
export const PART_SURF = { green: SURF.green, bunker: SURF.bunker, tee: SURF.tee } as const;
/** what laying a plan's cells costs ($): each cell that changes, at its surface's seeded price (the brushes' price, 1 m² a cell) */
export function planCost(g: Grid, c: PlanCells): number {
  let n = 0;
  for (const k of ['green', 'bunker', 'tee'] as const) { const s = PART_SURF[k], unit = unitBuildCost(k); for (const i of c[k]) if (g.surf[i] !== s) n += unit; }
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
 *  there (null: none there, or outside the area). A painted facility of an old save is taken the same way */
export function facilityAt(g: Grid, box: readonly [number, number, number, number], x: number, y: number): { cells: number[]; green: number; bunker: number; tee: number } | null {
  if (x < box[0] || x >= box[2] || y < box[1] || y >= box[3]) return null;
  const at = cellAt(g, x, y), feat = (i: number) => { const v = g.surf[i]; return v === SURF.green || v === SURF.bunker || v === SURF.tee; };
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
  return { cells: out, green, bunker, tee };
}
/** what the bulldozer refunds for a facility's cells: half their seeded price (the course's sell-back rate, as a prop's) */
export const facilityRefund = (f: { green: number; bunker: number; tee: number }): number => Math.round((f.green * unitBuildCost('green') + f.bunker * unitBuildCost('bunker') + f.tee * unitBuildCost('tee')) / 2);
/** the bunker cells within practice.ts's reach of a plan's green (the chipping green needs BUNKER_MIN of them) */
export function bunkerInReach(g: Grid, c: PlanCells): number {
  const greens = c.green.map(i => cellCentre(g, i)), R = BUNKER_REACH * CELL_T; let n = 0;
  for (const i of c.bunker) { const q = cellCentre(g, i); if (greens.some(p => Math.abs(p.x - q.x) <= R && Math.abs(p.y - q.y) <= R && (p.x - q.x) ** 2 + (p.y - q.y) ** 2 <= R * R)) n++; }
  return n;
}
export { BUNKER_MIN };
