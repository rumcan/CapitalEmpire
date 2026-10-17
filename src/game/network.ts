import { MAP, mulberry } from './iso';
import type { LineStyle } from './types';
export type Surface = 'asphalt' | 'asphaltDark' | 'asphaltWorn';
export type WalkKind = 'slabs' | 'gravel';

/* ---------- road classes ---------- */
export type ClassId = 'lane' | 'street' | 'road' | 'avenue' | 'boulevard';
export type NodeType = 'plain' | 'signal' | 'slip' | 'roundabout';
export interface Pt { x: number; y: number }
export interface Leg { a: Pt; b: Pt }
export type BBox = [number, number, number, number];

export interface RoadClass {
  id: ClassId; name: string; desc: string;
  /** asphalt half width (tiles of 2 m) */
  h: number;
  /** verge / sidewalk width and kind */
  walk: number; walkTex: WalkKind;
  /** planted median width (0 = none) */
  median: number;
  /** paved shoulder width inside the yellow edge line (0 = none) */
  shoulder: number;
  tex: Surface;
  rConcave: number;
  /** extra radius of the dead-end turning circle */
  bulb: number;
  cost: number; order: number; crosswalk: boolean;
  /** offset of the dashed white lane divider (0 = none) */
  laneLine: number;
  centre: 'style' | 'dashed' | 'none';
  laneCentres: number[];
}
export const CLASSES: RoadClass[] = [
  { id: 'lane', name: 'Lane', desc: 'Single lane · 4 m · footpath', h: 1, walk: 0.6, walkTex: 'slabs', median: 0, shoulder: 0, tex: 'asphaltWorn', rConcave: 0.8, bulb: 0, cost: 70, order: 0, crosswalk: false, laneLine: 0, centre: 'none', laneCentres: [0] },
  { id: 'street', name: 'Street', desc: '2 lanes · 6.5 m · sidewalks', h: 1.625, walk: 1.025, walkTex: 'slabs', median: 0, shoulder: 0, tex: 'asphalt', rConcave: 1.75, bulb: 1, cost: 150, order: 1, crosswalk: true, laneLine: 0, centre: 'style', laneCentres: [0.8] },
  { id: 'road', name: 'Road', desc: '2 lanes + shoulders · 12 m · yellow edge lines', h: 3, walk: 0.75, walkTex: 'gravel', median: 0, shoulder: 1, tex: 'asphaltDark', rConcave: 2.5, bulb: 0, cost: 220, order: 2, crosswalk: false, laneLine: 0, centre: 'dashed', laneCentres: [1] },
  { id: 'avenue', name: 'Avenue', desc: '2 lanes · tree-lined median · 14 m', h: 3.5, walk: 1.025, walkTex: 'slabs', median: 2, shoulder: 0, tex: 'asphaltDark', rConcave: 2.5, bulb: 1, cost: 320, order: 3, crosswalk: true, laneLine: 0, centre: 'none', laneCentres: [2.25] },
  { id: 'boulevard', name: 'Boulevard', desc: '4 lanes · tree-lined median · 20 m', h: 5, walk: 1.025, walkTex: 'slabs', median: 2, shoulder: 0, tex: 'asphaltDark', rConcave: 3, bulb: 1, cost: 480, order: 4, crosswalk: true, laneLine: 3, centre: 'none', laneCentres: [2, 4] },
];
export const CLASS = Object.fromEntries(CLASSES.map(c => [c.id, c])) as Record<ClassId, RoadClass>;
export const JUNCTIONS: { id: NodeType; name: string; desc: string; cost: number; minDeg: number }[] = [
  { id: 'plain', name: 'Plain', desc: 'Rounded corners and crossings', cost: 0, minDeg: 3 },
  { id: 'signal', name: 'Traffic lights', desc: 'Signals, stop lines', cost: 2500, minDeg: 3 },
  { id: 'slip', name: 'Lights + slipways', desc: 'Signals with channelised turn lanes', cost: 6000, minDeg: 3 },
  { id: 'roundabout', name: 'Roundabout', desc: 'Circle with a planted island', cost: 8000, minDeg: 2 },
];
export const R_SLIP = 12, SLIP_LANE = 2.2, RB_LANE = 2.5;

/* ---------- vectors ---------- */
export const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
export const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
export const cross = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x;
export const vlen = (a: Pt) => Math.hypot(a.x, a.y);
export const norm = (a: Pt): Pt => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; };
export const perp = (a: Pt): Pt => ({ x: -a.y, y: a.x });
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const TAU = Math.PI * 2;
const angDelta = (a0: number, a1: number) => { let d = a1 - a0; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
export const keyOf = (p: Pt) => p.x.toFixed(3) + ',' + p.y.toFixed(3);
const snap = (p: Pt): Pt => ({ x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 });
function lineHit(p1: Pt, d1: Pt, p2: Pt, d2: Pt): Pt | null { const den = cross(d1, d2); if (Math.abs(den) < 1e-9) return null; return add(p1, mul(d1, cross(sub(p2, p1), d2) / den)); }
export function polyPath(pts: Pt[]) { const p = new Path2D(); pts.forEach((q, i) => (i ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y))); p.closePath(); return p; }
export function linePath(pts: Pt[], closed: boolean) { const p = new Path2D(); pts.forEach((q, i) => (i ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y))); if (closed) p.closePath(); return p; }
function discPath(c: Pt, r: number) { const p = new Path2D(); p.arc(c.x, c.y, Math.max(0.01, r), 0, TAU); return p; }
export function bboxOf(pts: Pt[], pad: number): BBox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}
/** keep the part of a convex polygon with dot(q - p, n) >= 0 */
function clipPoly(poly: Pt[], p: Pt, n: Pt): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], da = dot(sub(a, p), n), db = dot(sub(b, p), n);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push(add(a, mul(sub(b, a), t))); }
  }
  return out;
}
/** shorten (positive) or extend (negative) a polyline at both ends */
export function trimPolyline(pts: Pt[], startInset: number, endInset: number): Pt[] | null {
  let p = pts.map(q => ({ ...q }));
  const cut = (arr: Pt[], inset: number): Pt[] | null => {
    if (inset <= 0) {
      const a = arr[0], b = arr[1], l = vlen(sub(b, a)) || 1;
      arr[0] = { x: a.x + ((a.x - b.x) / l) * -inset, y: a.y + ((a.y - b.y) / l) * -inset }; return arr;
    }
    let rem = inset;
    while (arr.length >= 2) {
      const a = arr[0], b = arr[1], l = vlen(sub(b, a));
      if (l > rem + 0.3) { arr[0] = { x: a.x + ((b.x - a.x) / l) * rem, y: a.y + ((b.y - a.y) / l) * rem }; return arr; }
      rem -= l; arr.shift();
    }
    return null;
  };
  const r1 = cut(p, startInset); if (!r1) return null; p = r1.reverse();
  const r2 = cut(p, endInset); if (!r2) return null;
  return r2.reverse();
}
/** offset an axis-aligned polyline sideways (miter joins) */
export function offsetPolyline(pts: Pt[], o: number, closed: boolean) {
  const n = pts.length, out: Pt[] = [];
  const normal = (a: Pt, b: Pt) => { const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; return { x: -dy / l, y: dx / l }; };
  for (let i = 0; i < n; i++) {
    const prev = i > 0 ? pts[i - 1] : closed ? pts[n - 1] : null, next = i < n - 1 ? pts[i + 1] : closed ? pts[0] : null;
    let nx = 0, ny = 0;
    if (prev) { const nn = normal(prev, pts[i]); nx += nn.x; ny += nn.y; }
    if (next) { const nn = normal(pts[i], next); nx += nn.x; ny += nn.y; }
    if (prev && next) { const l2 = (nx * nx + ny * ny) / 2 || 1; nx /= l2; ny /= l2; } else { const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l; }
    out.push({ x: pts[i].x + nx * o, y: pts[i].y + ny * o });
  }
  return out;
}
/** a polyline with its corners replaced by arcs (radius r, clamped to the adjacent segments) */
export type Piece = { run: true; a: Pt; b: Pt } | { run: false; ctrl: Pt; from: Pt; to: Pt; r: number };
export function roundPieces(pts: Pt[], r: number, closed: boolean): Piece[] {
  const n = pts.length; if (n < 2) return [];
  const dk = new Array<number>(n).fill(0), rk = new Array<number>(n).fill(0);
  for (let k = closed ? 0 : 1; k < (closed ? n : n - 1); k++) {
    const p = pts[(k - 1 + n) % n], c = pts[k], q = pts[(k + 1) % n];
    const u = norm(sub(p, c)), v = norm(sub(q, c)), phi = Math.acos(clamp(dot(u, v), -1, 1));
    if (phi > Math.PI - 0.02 || phi < 0.05) continue;
    const t = Math.tan(phi / 2), rr = Math.min(r, 0.49 * vlen(sub(p, c)) * t, 0.49 * vlen(sub(q, c)) * t);
    rk[k] = rr; dk[k] = rr / t;
  }
  const out: Piece[] = [], runs = closed ? n : n - 1;
  for (let k = 0; k < runs; k++) {
    const a = pts[k], b = pts[(k + 1) % n], d = norm(sub(b, a)), k1 = (k + 1) % n;
    const s = add(a, mul(d, dk[k])), e = sub(b, mul(d, dk[k1]));
    out.push({ run: true, a: s, b: e });
    if (rk[k1] > 0 && (closed || k1 < n - 1)) { const nd = norm(sub(pts[(k1 + 1) % n], b)); out.push({ run: false, ctrl: b, from: e, to: add(b, mul(nd, dk[k1])), r: rk[k1] }); }
  }
  return out;
}
export function roundedPath(pts: Pt[], r: number, closed: boolean) {
  const path = new Path2D(), pieces = roundPieces(pts, r, closed);
  pieces.forEach((p, i) => { if (p.run) { if (i === 0) path.moveTo(p.a.x, p.a.y); else path.lineTo(p.a.x, p.a.y); path.lineTo(p.b.x, p.b.y); } else path.arcTo(p.ctrl.x, p.ctrl.y, p.to.x, p.to.y, p.r); });
  if (closed) path.closePath();
  return path;
}
/** walk along a polyline calling fn every `step` tiles starting at `first` from each end */
function walkAlong(pts: Pt[], closed: boolean, first: number, step: number, fn: (p: Pt, i: number) => void) {
  const n = pts.length, runs = closed ? n : n - 1; let total = 0;
  for (let k = 0; k < runs; k++) total += vlen(sub(pts[(k + 1) % n], pts[k]));
  let next = first, acc = 0, i = 0;
  for (let k = 0; k < runs; k++) {
    const a = pts[k], b = pts[(k + 1) % n], l = vlen(sub(b, a));
    while (next <= acc + l && next <= total - first + 1e-6) { const t = (next - acc) / l; fn(add(a, mul(sub(b, a), t)), i++); next += step; }
    acc += l;
  }
}

/* ---------- data ---------- */
export interface Node { x: number; y: number; segs: Seg[]; type: NodeType; arms: Arm[]; rb: number }
/** how a segment is built: on the ground, on a bridge, or in a tunnel */
export const SK = { GROUND: 0, BRIDGE: 1, TUNNEL: 2 } as const; export type SegKind = 0 | 1 | 2;
export interface Seg { a: Node; b: Node; cls: RoadClass; style: LineStyle; kind: SegKind }
export interface Arm { seg: Seg; other: Node; dir: Pt; nrm: Pt; ang: number; len: number; cls: RoadClass; h: number; walk: number; reachEdge: number; reachCentre: number; lineInset: number; medianInset: number; xw: number; stop: number; hasOpp: boolean }
export interface Feature { kind: 'stroke' | 'poly' | 'disc'; path: Path2D; w: number; tex: string; order: number; bbox: BBox; cap: 'butt' | 'round'; kerb: boolean }
/** a run of sidewalk slabs: straight (along a segment side) or radial (around a corner fillet, a bulb or a roundabout) */
export type SlabRun = { kind: 'straight'; a: Pt; b: Pt; n: Pt; w0: number; w1: number; visible: boolean; seed: number } | { kind: 'arc'; c: Pt; r0: number; r1: number; a0: number; a1: number; seed: number };
/** a street-lamp reflection pool: lamp point on the curb (tiles) */
export interface Pool { x: number; y: number; strength: number }
export interface LineRec { pts: Pt[]; closed: boolean; width: number; color: string; dash: [number, number] | null; r: number; offset: number; bbox: BBox }
export interface Poly { path: Path2D; bbox: BBox }
export type DecalType = 'manhole' | 'drain' | 'oil' | 'patch';
export interface Decal { t: DecalType; x: number; y: number; ang: number; s: number; seed: number }
/** a fallen leaf on the ground (tile space): rotation, size factor, colour index */
export interface Leaf { x: number; y: number; ang: number; s: number; c: number }
/** a grass tuft spilling over the kerb's outer edge; ang points onto the sidewalk */
export interface Tuft { x: number; y: number; ang: number; v: number }
/** a polished wheel path (tile space polyline) */
export interface Wear { pts: Pt[]; closed: boolean; r: number; h: number; offsets: number[]; bbox: BBox }
export interface Tyre { x: number; y: number; ang: number; start: number; lat: number[]; len: number }
export interface Route { nodes: Node[]; segs: Seg[]; pts: Pt[]; cls: RoadClass; style: LineStyle; kind: SegKind; closed: boolean; a0?: Arm; a1?: Arm }
export interface AutoProp { kind: 'tree' | 'light' | 'rbtree'; x: number; y: number; i: number }
export interface PieceSel { seg: Seg; p0: Pt; p1: Pt }
export interface Island { x: number; y: number; r: number }

const YELLOW = '#d6b23b', WHITE = 'rgba(238,238,230,0.92)';

function segIntersections(P: Pt, Q: Pt, A: Pt, B: Pt): [number, number][] {
  const d1 = sub(Q, P), d2 = sub(B, A), den = cross(d1, d2), w = sub(A, P), eps = 1e-9;
  if (Math.abs(den) > 1e-9) {
    const t = cross(w, d2) / den, u = cross(w, d1) / den;
    if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return [];
    return [[clamp(t, 0, 1), clamp(u, 0, 1)]];
  }
  if (Math.abs(cross(w, d1)) > 1e-7) return [];
  const out: [number, number][] = [], L1 = dot(d1, d1), L2 = dot(d2, d2);
  const tA = dot(sub(A, P), d1) / L1, tB = dot(sub(B, P), d1) / L1, uP = dot(sub(P, A), d2) / L2, uQ = dot(sub(Q, A), d2) / L2;
  if (tA > eps && tA < 1 - eps) out.push([tA, 0]); if (tB > eps && tB < 1 - eps) out.push([tB, 1]);
  if (uP > eps && uP < 1 - eps) out.push([0, uP]); if (uQ > eps && uQ < 1 - eps) out.push([1, uQ]);
  return out;
}
function cornerPatch(N: Pt, a: Pt, hA: number, b: Pt, hB: number, phi: number, R: number) {
  const nA = perp(a), nB = perp(b);
  const C = lineHit(add(N, mul(nA, hA)), a, sub(N, mul(nB, hB)), b); if (!C) return null;
  const d = R / Math.tan(phi / 2), TA = add(C, mul(a, d)), TB = add(C, mul(b, d));
  const bis = norm(add(a, b)), Q = add(C, mul(bis, R / Math.sin(phi / 2)));
  const path = new Path2D(); path.moveTo(TA.x, TA.y); path.arcTo(C.x, C.y, TB.x, TB.y, Math.max(0, R)); path.lineTo(C.x, C.y); path.closePath();
  return { path, bbox: bboxOf([C, TA, TB], 0.3), C, TA, TB, Q, bis, d };
}
function rbFillet(N: Pt, a: Pt, h: number, R: number, r: number, side: 1 | -1) {
  const n = mul(perp(a), side), q = (R + r) ** 2 - (h + r) ** 2;
  if (q <= 0 || R <= h + 0.05) return null;
  const Q = add(add(N, mul(a, Math.sqrt(q))), mul(n, h + r));
  const Te = sub(Q, mul(n, r)), Tc = add(N, mul(sub(Q, N), R / (R + r))), X = add(add(N, mul(a, Math.sqrt(R * R - h * h))), mul(n, h));
  const path = new Path2D(); path.moveTo(Te.x, Te.y); path.lineTo(X.x, X.y);
  const a0 = Math.atan2(X.y - N.y, X.x - N.x), a1 = Math.atan2(Tc.y - N.y, Tc.x - N.x);
  path.arc(N.x, N.y, R, a0, a1, angDelta(a0, a1) < 0);
  const b0 = Math.atan2(Tc.y - Q.y, Tc.x - Q.x), b1 = Math.atan2(Te.y - Q.y, Te.x - Q.x);
  path.arc(Q.x, Q.y, r, b0, b1, angDelta(b0, b1) < 0);
  path.closePath();
  return { path, bbox: bboxOf([Te, X, Tc], 0.3) };
}
function slipIsland(N: Pt, A: Arm, B: Arm, Q: Pt, R: number) {
  const g = 0.6, Ri = R + SLIP_LANE;
  const C2 = lineHit(add(N, mul(A.nrm, A.h + g)), A.dir, sub(N, mul(B.nrm, B.h + g)), B.dir); if (!C2) return null;
  // first crossing of the offset edge line with the slip lane's inner circle (the island's far corner)
  const hit = (dir: Pt) => { const w = sub(C2, Q), b = dot(dir, w), c = dot(w, w) - Ri * Ri, disc = b * b - c; if (disc < 0) return -1; return -b - Math.sqrt(disc); };
  const tA = hit(A.dir), tB = hit(B.dir); if (tA < 0.9 || tB < 0.9 || dot(sub(C2, Q), sub(C2, Q)) < Ri * Ri + 1.2) return null;
  const PA = add(C2, mul(A.dir, tA)), PB = add(C2, mul(B.dir, tB)), mid = add(C2, mul(sub(PA, C2), 0.5));
  const path = new Path2D(); path.moveTo(mid.x, mid.y); path.lineTo(PA.x, PA.y);
  const a0 = Math.atan2(PA.y - Q.y, PA.x - Q.x), a1 = Math.atan2(PB.y - Q.y, PB.x - Q.x);
  path.arc(Q.x, Q.y, Ri, a0, a1, angDelta(a0, a1) < 0);
  path.arcTo(C2.x, C2.y, mid.x, mid.y, 0.6); path.closePath();
  return { path, bbox: bboxOf([C2, PA, PB], 0.3) };
}

/* ---------- spatial indexes ---------- */
/** everything one route or one node draws on the ground, with its bounds (tile space) */
export interface Fx {
  key: number; bbox: BBox;
  walkF: Feature[]; asphF: Feature[]; medianF: Feature[]; islandF: Feature[]; rbIslands: Island[];
  lines: LineRec[]; zebra: Poly[]; bars: Poly[]; decals: Decal[]; tyres: Tyre[]; autoProps: AutoProp[]; slabRuns: SlabRun[];
  /** litter (leaves, tufts, curb joints, wheel wear) is generated when a painter first needs it and cached (LRU):
   *  a 4 km network has millions of leaves, far too many to keep for every route at once */
  lazy: (() => Litter) | null; litter: Litter | null;
}
export interface Litter { leaves: Leaf[]; tufts: Tuft[]; wear: Wear[]; joints: { a: Pt; b: Pt }[] }
/** the ground features inside a box, merged in a stable order (what a chunk painter needs) */
export type FxView = Pick<Fx, (typeof FX_LISTS)[number]> & Litter & { pools: Pool[] };
const emptyFx = (key: number): Fx => ({ key, bbox: [0, 0, 0, 0], walkF: [], asphF: [], medianF: [], islandF: [], rbIslands: [], lines: [], zebra: [], bars: [], decals: [], tyres: [], autoProps: [], slabRuns: [], lazy: null, litter: null });
const emptyLitter = (): Litter => ({ leaves: [], tufts: [], wear: [], joints: [] });
const FX_LISTS = ['walkF', 'asphF', 'medianF', 'islandF', 'rbIslands', 'lines', 'zebra', 'bars', 'decals', 'tyres', 'slabRuns'] as const;
const LITTER_LISTS = ['leaves', 'tufts', 'wear', 'joints'] as const;
const LITTER_CACHE = 4000;
function hashStr(s: string) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }

/** a uniform grid over the map holding items by the cells their box touches */
export class Grid<T> {
  cells = new Map<number, Set<T>>(); private where = new Map<T, number[]>();
  constructor(public size: number) {}
  private span(b: BBox) { const s = this.size; return [Math.floor(b[0] / s), Math.floor(b[1] / s), Math.floor(b[2] / s), Math.floor(b[3] / s)]; }
  add(item: T, b: BBox) {
    const [x0, y0, x1, y1] = this.span(b), keys: number[] = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const k = (y + 4096) * 16384 + (x + 4096); let c = this.cells.get(k); if (!c) this.cells.set(k, (c = new Set())); c.add(item); keys.push(k); }
    this.where.set(item, keys);
  }
  remove(item: T) { const keys = this.where.get(item); if (!keys) return; for (const k of keys) { const c = this.cells.get(k); if (c) { c.delete(item); if (!c.size) this.cells.delete(k); } } this.where.delete(item); }
  query(b: BBox, out = new Set<T>()) {
    const [x0, y0, x1, y1] = this.span(b);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const c = this.cells.get((y + 4096) * 16384 + (x + 4096)); if (c) for (const i of c) out.add(i); }
    return out;
  }
  clear() { this.cells.clear(); this.where.clear(); }
}
const segBox = (s: Seg): BBox => [Math.min(s.a.x, s.b.x), Math.min(s.a.y, s.b.y), Math.max(s.a.x, s.b.x), Math.max(s.a.y, s.b.y)];
export const unionBox = (a: BBox | null, b: BBox): BBox => (a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : [...b] as BBox);

/** rasterises ground features into the occupancy grid; injected so the network also runs where there is no canvas */
export type OccRaster = (net: RoadNetwork, box: BBox) => void;

/* ---------- the network ---------- */
export class RoadNetwork {
  nodes = new Map<string, Node>(); segs = new Set<Seg>(); version = 0;
  routes = new Set<Route>(); pools: Pool[] = [];
  occ = new Uint8Array(MAP * MAP);
  /** the ground box the last rebuild changed (null = nothing), and the auto props it added and removed */
  lastDirty: BBox | null = null; autoAdded: AutoProp[] = []; autoRemoved: AutoProp[] = [];
  private segGrid = new Grid<Seg>(16); private fxGrid = new Grid<Fx>(32); private poolGrid = new Grid<Pool>(32);
  private routeOf = new Map<Seg, Route>(); private routeFx = new Map<Route, Fx>(); private nodeFx = new Map<Node, Fx>();
  private touched = new Set<Node>(); private removed = new Set<Seg>();
  private litterLRU = new Set<Fx>();
  /** false on the main thread: it only needs geometry and occupancy, the ground workers paint */
  paintData = true;
  occRaster: OccRaster | null = typeof OffscreenCanvas !== 'undefined' ? canvasOccRaster : null;

  nodeAt(p: Pt) { return this.nodes.get(keyOf(snap(p))); }
  private node(p: Pt): Node { const s = snap(p), k = keyOf(s); let n = this.nodes.get(k); if (!n) { n = { x: s.x, y: s.y, segs: [], type: 'plain', arms: [], rb: 0 }; this.nodes.set(k, n); } return n; }
  private link(a: Node, b: Node, cls: RoadClass, style: LineStyle, kind: SegKind) { const s: Seg = { a, b, cls, style, kind }; a.segs.push(s); b.segs.push(s); this.segs.add(s); this.segGrid.add(s, segBox(s)); this.touched.add(a); this.touched.add(b); return s; }
  private unlink(s: Seg) {
    this.segs.delete(s); this.segGrid.remove(s); this.removed.add(s);
    for (const n of [s.a, s.b]) { const i = n.segs.indexOf(s); if (i >= 0) n.segs.splice(i, 1); if (!n.segs.length) this.nodes.delete(keyOf(n)); this.touched.add(n); }
  }
  /** a node that may have been dropped by unlink() is put back before it gets new segments */
  private keep(n: Node) { this.nodes.set(keyOf(n), n); return n; }
  private splitSeg(s: Seg, pts: Pt[]) {
    const d = sub(s.b, s.a), L2 = dot(d, d);
    const ordered = pts.map(p => ({ p, t: dot(sub(p, s.a), d) / L2 })).filter(q => q.t > 1e-6 && q.t < 1 - 1e-6).sort((p, q) => p.t - q.t);
    if (!ordered.length) return;
    const chain = [s.a, ...ordered.map(q => this.node(q.p)), s.b];
    const cls = s.cls, style = s.style, kind = s.kind; this.unlink(s);
    for (let i = 0; i + 1 < chain.length; i++) if (chain[i] !== chain[i + 1]) this.link(this.keep(chain[i]), this.keep(chain[i + 1]), cls, style, kind);
  }
  private addSegment(P: Pt, Q: Pt, cls: RoadClass, style: LineStyle, kind: SegKind = 0) {
    const d = sub(Q, P); if (vlen(d) < 1e-6) return;
    const cutsOld = new Map<Seg, Pt[]>(), cutsNew: { t: number; pt: Pt }[] = [];
    const near = this.segGrid.query([Math.min(P.x, Q.x) - 0.01, Math.min(P.y, Q.y) - 0.01, Math.max(P.x, Q.x) + 0.01, Math.max(P.y, Q.y) + 0.01]);
    for (const s of near) for (const [tN, tO] of segIntersections(P, Q, s.a, s.b)) {
      const pt = snap(tO <= 1e-6 ? s.a : tO >= 1 - 1e-6 ? s.b : tN <= 1e-6 ? P : tN >= 1 - 1e-6 ? Q : add(P, mul(d, tN)));
      if (tO > 1e-6 && tO < 1 - 1e-6) { let l = cutsOld.get(s); if (!l) cutsOld.set(s, (l = [])); l.push(pt); }
      if (tN > 1e-6 && tN < 1 - 1e-6) cutsNew.push({ t: tN, pt });
    }
    for (const [s, pts] of cutsOld) this.splitSeg(s, pts);
    const pts = [snap(P), ...cutsNew.sort((p, q) => p.t - q.t).map(c => c.pt), snap(Q)];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = this.node(pts[i]), b = this.node(pts[i + 1]); if (a === b) continue;
      const ex = a.segs.find(s => s.a === b || s.b === b);
      if (ex) { if (ex.cls !== cls || ex.style !== style || ex.kind !== kind) { ex.cls = cls; ex.style = style; ex.kind = kind; this.touched.add(a); this.touched.add(b); } } else this.link(a, b, cls, style, kind);
    }
  }
  /** add legs (kinds[i] is leg i's structure kind, ground by default); pass rebuild=false to batch several calls before one rebuild() */
  addLegs(legs: Leg[], cls: RoadClass, style: LineStyle, rebuild = true, kinds?: SegKind[]) { legs.forEach((l, i) => this.addSegment(l.a, l.b, cls, style, kinds?.[i] ?? 0)); if (rebuild) this.rebuild(); }
  legsLength(legs: Leg[]) { return legs.reduce((s, l) => s + vlen(sub(l.b, l.a)), 0); }
  segsNear(p: Pt, r: number) { return this.segGrid.query([p.x - r, p.y - r, p.x + r, p.y + r]); }
  /** the 3-tile piece of road under a point, or null */
  pieceNear(p: Pt): PieceSel | null {
    let best: PieceSel | null = null, bd = Infinity;
    for (const s of this.segsNear(p, 12)) {
      const d = sub(s.b, s.a), L = vlen(d), u = mul(d, 1 / L), t = clamp(dot(sub(p, s.a), u), 0, L), q = add(s.a, mul(u, t)), dist = vlen(sub(p, q));
      if (dist > s.cls.h + s.cls.walk + 0.3 || dist >= bd) continue;
      // long enough that the two new dead ends (with their turning circles) do not touch
      const half = Math.max(1.5, s.cls.h + s.cls.bulb + 1);
      let s0 = Math.max(0, t - half), s1 = Math.min(L, t + half); if (s0 < 2) s0 = 0; if (L - s1 < 2) s1 = L;
      bd = dist; best = { seg: s, p0: add(s.a, mul(u, s0)), p1: add(s.a, mul(u, s1)) };
    }
    return best;
  }
  removePiece(sel: PieceSel, rebuild = true) {
    const s = sel.seg, d = sub(s.b, s.a), L2 = dot(d, d);
    const cls = s.cls, style = s.style, kind = s.kind, inner = (p: Pt) => { const t = dot(sub(p, s.a), d) / L2; return t > 1e-6 && t < 1 - 1e-6; };
    const a = s.a, b = s.b; this.unlink(s);
    const p0 = snap(sel.p0), p1 = snap(sel.p1);
    if (inner(p0)) this.link(this.keep(a), this.node(p0), cls, style, kind);
    if (inner(p1)) this.link(this.node(p1), this.keep(b), cls, style, kind);
    if (rebuild) this.rebuild();
  }
  setNodeType(n: Node, type: NodeType, rebuild = true) { n.type = type; this.touched.add(n); if (rebuild) this.rebuild(); }
  nearestNode(p: Pt, minDeg: number, maxDist: number): Node | null {
    let best: Node | null = null, bd = maxDist;
    for (const s of this.segsNear(p, maxDist)) for (const n of [s.a, s.b]) { if (n.segs.length < minDeg) continue; const d = Math.hypot(n.x - p.x, n.y - p.y); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  occAt(x: number, y: number) { const tx = Math.floor(x), ty = Math.floor(y); return tx < 0 || ty < 0 || tx >= MAP || ty >= MAP ? 0 : this.occ[ty * MAP + tx]; }
  /** highest occupancy code inside a tile rect: 0 free, 1 sidewalk/verge, 2 asphalt, 3 median */
  rectOcc(x0: number, y0: number, x1: number, y1: number) {
    let m = 0;
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(MAP, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(MAP, Math.ceil(x1)); x++) { const v = this.occ[y * MAP + x]; if (v > m) m = v; }
    return m;
  }
  /** every auto prop on the map (median trees, roundabout trees, traffic lights) */
  get autoProps() { const out: AutoProp[] = []; for (const f of this.routeFx.values()) out.push(...f.autoProps); for (const f of this.nodeFx.values()) out.push(...f.autoProps); return out; }
  get fxCount() { return this.routeFx.size + this.nodeFx.size; }
  /** the ground features that can touch a box, merged in a stable order */
  view(b: BBox, withLitter = true): FxView {
    const fx = [...this.fxGrid.query(b)].filter(f => f.bbox[2] >= b[0] && f.bbox[0] <= b[2] && f.bbox[3] >= b[1] && f.bbox[1] <= b[3]).sort((p, q) => p.key - q.key);
    const v = { pools: [...this.poolGrid.query(b)] } as FxView;
    for (const k of FX_LISTS) (v as unknown as Record<string, unknown[]>)[k] = fx.flatMap(f => f[k] as unknown[]);
    const lit = withLitter ? fx.map(f => this.litterOf(f)) : [];
    for (const k of LITTER_LISTS) (v as unknown as Record<string, unknown[]>)[k] = lit.flatMap(l => l[k] as unknown[]);
    v.walkF.sort((p, q) => p.order - q.order); v.asphF.sort((p, q) => p.order - q.order);
    return v;
  }
  private litterOf(f: Fx): Litter {
    if (f.litter) { this.litterLRU.delete(f); this.litterLRU.add(f); return f.litter; }
    f.litter = f.lazy ? f.lazy() : emptyLitter(); this.litterLRU.add(f);
    if (this.litterLRU.size > LITTER_CACHE) for (const old of this.litterLRU) { if (this.litterLRU.size <= LITTER_CACHE * 0.8) break; old.litter = null; this.litterLRU.delete(old); }
    return f.litter;
  }
  clear() {
    this.litterLRU.clear();
    this.nodes.clear(); this.segs.clear(); this.routes.clear(); this.routeOf.clear(); this.routeFx.clear(); this.nodeFx.clear();
    this.segGrid.clear(); this.fxGrid.clear(); this.poolGrid.clear(); this.pools = []; this.occ.fill(0); this.touched.clear(); this.removed.clear(); this.version++;
  }

  /** Rebuild what the edits since the last rebuild touched: the touched nodes and their neighbours, every route through
   *  them and the routes of removed segments. full = rebuild everything (after a load). */
  rebuild(full = false) {
    this.version++;
    let dirty: BBox | null = null;
    const removedAuto: AutoProp[] = [], addedAuto: AutoProp[] = [];
    const dropFx = (f: Fx | undefined) => { if (!f) return; dirty = unionBox(dirty, f.bbox); this.fxGrid.remove(f); this.litterLRU.delete(f); removedAuto.push(...f.autoProps); };
    const A = new Set<Node>();
    if (full) {
      for (const f of this.routeFx.values()) dropFx(f); for (const f of this.nodeFx.values()) dropFx(f);
      this.routeFx.clear(); this.nodeFx.clear(); this.routes.clear(); this.routeOf.clear();
      for (const n of this.nodes.values()) A.add(n);
    } else for (const n of this.touched) { A.add(n); for (const s of n.segs) A.add(s.a === n ? s.b : s.a); }
    const live = [...A].filter(n => n.segs.length && this.nodes.get(keyOf(n)) === n);
    for (const n of live) {
      n.arms = n.segs.map(s => { const other = s.a === n ? s.b : s.a, d = sub(other, n), L = vlen(d), dir = mul(d, 1 / L); return { seg: s, other, dir, nrm: perp(dir), ang: Math.atan2(dir.y, dir.x), len: L, cls: s.cls, h: s.cls.h, walk: s.cls.walk, reachEdge: 0, reachCentre: 0, lineInset: 0, medianInset: 0, xw: -1, stop: -1, hasOpp: false }; }).sort((p, q) => p.ang - q.ang);
      n.rb = n.type === 'roundabout' && n.arms.length >= 2 ? Math.max(4.5, Math.max(...n.arms.map(a => a.h)) + 3) : 0;
    }
    for (const n of live) this.analyseNode(n);
    // routes through the changed nodes go, and are walked again from their segments
    const stale = new Set<Route>();
    for (const n of A) for (const s of n.segs) { const r = this.routeOf.get(s); if (r) stale.add(r); }
    for (const s of this.removed) { const r = this.routeOf.get(s); if (r) stale.add(r); }
    const free = new Set<Seg>();
    for (const r of stale) { dropFx(this.routeFx.get(r)); this.routeFx.delete(r); this.routes.delete(r); for (const s of r.segs) { this.routeOf.delete(s); if (this.segs.has(s)) free.add(s); } }
    for (const n of live) for (const s of n.segs) if (!this.routeOf.has(s)) free.add(s);
    for (const r of this.buildRoutes(free)) {
      this.routes.add(r); for (const s of r.segs) this.routeOf.set(s, r);
      const f = this.routeFeatures(r); this.routeFx.set(r, f); this.fxGrid.add(f, f.bbox); dirty = unionBox(dirty, f.bbox); addedAuto.push(...f.autoProps);
    }
    for (const n of A) {
      dropFx(this.nodeFx.get(n)); this.nodeFx.delete(n);
      if (!n.segs.length || this.nodes.get(keyOf(n)) !== n) continue;
      const f = this.nodeFeatures(n); if (!f) continue;
      this.nodeFx.set(n, f); this.fxGrid.add(f, f.bbox); dirty = unionBox(dirty, f.bbox); addedAuto.push(...f.autoProps);
    }
    this.touched.clear(); this.removed.clear();
    // auto props that merely moved between owners are not changes
    const k = (a: AutoProp) => `${a.kind}@${a.x.toFixed(2)},${a.y.toFixed(2)}`, had = new Set(removedAuto.map(k)), has = new Set(addedAuto.map(k));
    this.autoAdded = addedAuto.filter(a => !had.has(k(a))); this.autoRemoved = removedAuto.filter(a => !has.has(k(a)));
    this.lastDirty = dirty;
    if (dirty) { if (full) this.occ.fill(0); this.occRaster?.(this, full ? [0, 0, MAP, MAP] : dirty); }
  }
  private analyseNode(n: Node) {
    const arms = n.arms, k = arms.length;
    const junction = k >= 3 || n.rb > 0, signal = n.type === 'signal' || n.type === 'slip';
    for (const a of arms) {
      let reachEdge = 0, reachCentre = 0; a.hasOpp = false;
      for (const b of arms) {
        if (b === a) continue;
        const th = Math.acos(clamp(dot(a.dir, b.dir), -1, 1));
        if (th > Math.PI * 165 / 180) { a.hasOpp = true; continue; }
        const s = Math.max(Math.sin(th), 0.3);
        reachEdge = Math.max(reachEdge, (b.h + a.h * Math.abs(Math.cos(th))) / s); reachCentre = Math.max(reachCentre, b.h / s);
      }
      if (n.rb) reachEdge = reachCentre = n.rb;
      a.reachEdge = reachEdge; a.reachCentre = reachCentre; a.xw = -1; a.stop = -1;
      if (k === 1) { a.lineInset = a.cls.bulb > 0 ? -(a.cls.bulb - 0.3) : 0.25; a.medianInset = a.h + 0.5; }
      else if (junction) {
        a.xw = a.cls.crosswalk ? reachEdge + 0.5 : -1;
        // no crossing on an arm too short to hold one: leave room for the far end's bulb or junction
        const room = a.other.segs.length === 1 ? a.h + a.cls.bulb + 0.5 : a.other.segs.length >= 3 || a.other.type === 'roundabout' ? a.h + 2.5 : 0.5;
        if (a.xw >= 0 && a.xw + 1.4 > a.len - room) a.xw = -1;
        a.stop = signal && k >= 3 ? (a.xw >= 0 ? a.xw + 1.4 + 0.3 : reachEdge + 0.6) : -1;
        a.lineInset = (a.xw >= 0 ? a.xw + 1.8 : reachCentre + 0.6) + (a.stop >= 0 ? 0.5 : 0) + (n.rb ? 0.4 : 0);
        a.medianInset = a.lineInset + 0.8;
      } else if (k === 2 && (arms[0].cls !== arms[1].cls || arms[0].seg.style !== arms[1].seg.style)) {
        const o = arms[0] === a ? arms[1] : arms[0]; a.lineInset = 0; a.medianInset = o.cls.median > 0 ? 0 : 1.5;
      } else { a.lineInset = 0; a.medianInset = 0; }
    }
  }
  /** chains of the given segments between terminal nodes, then the rings left over */
  private buildRoutes(free: Set<Seg>) {
    const visited = new Set<Seg>(), routes: Route[] = [];
    const terminal = (n: Node) => n.arms.length !== 2 || n.rb > 0 || n.arms[0].cls !== n.arms[1].cls || n.arms[0].seg.style !== n.arms[1].seg.style || n.arms[0].seg.kind !== n.arms[1].seg.kind;
    const walk = (start: Node, s0: Seg, ring: boolean) => {
      const nodes = [start], segs: Seg[] = []; let cur = start, s = s0;
      for (let guard = 0; guard < 100000; guard++) {
        visited.add(s); segs.push(s); const nx = s.a === cur ? s.b : s.a; nodes.push(nx); cur = nx;
        if (terminal(nx) || (ring && nx === start)) break;
        s = nx.segs[0] === s ? nx.segs[1] : nx.segs[0]; if (visited.has(s) || !free.has(s)) break;
      }
      return { nodes, segs };
    };
    const less = (p: Pt, q: Pt) => p.x < q.x || (p.x === q.x && p.y < q.y);
    const make = ({ nodes, segs }: { nodes: Node[]; segs: Seg[] }, s: Seg, closed: boolean): Route => {
      let list = closed ? nodes.slice(0, -1) : nodes;
      // a canonical direction (and start, for rings), so a route looks the same however it was walked
      if (!closed) { if (less(list[list.length - 1], list[0])) list = [...list].reverse(); }
      else {
        let m = 0; for (let i = 1; i < list.length; i++) if (less(list[i], list[m])) m = i;
        list = [...list.slice(m), ...list.slice(0, m)];
        if (list.length > 2 && less(list[list.length - 1], list[1])) list = [list[0], ...list.slice(1).reverse()];
      }
      const r: Route = { nodes: list, segs, pts: list.map(q => ({ x: q.x, y: q.y })), cls: s.cls, style: s.style, kind: s.kind, closed };
      if (!closed) { const n0 = list[0], n1 = list[list.length - 1]; r.a0 = n0.arms.find(a => a.other === list[1] && a.seg.cls === s.cls); r.a1 = n1.arms.find(a => a.other === list[list.length - 2] && a.seg.cls === s.cls); r.a0 ??= n0.arms[0]; r.a1 ??= n1.arms[0]; }
      return r;
    };
    for (const s of free) for (const n of [s.a, s.b]) if (terminal(n)) for (const s2 of n.segs) if (free.has(s2) && !visited.has(s2)) routes.push(make(walk(n, s2, false), s2, false));
    for (const s of free) if (!visited.has(s)) { const w = walk(s.a, s, true); routes.push(make(w, s, w.nodes[w.nodes.length - 1] === s.a)); }
    return routes;
  }

  private routeFeatures(r: Route): Fx {
    const p0 = r.pts[0], pN = r.pts[r.pts.length - 1];
    const fx = emptyFx(hashStr(`r${Math.min(p0.x, pN.x)},${Math.min(p0.y, pN.y)},${Math.max(p0.x, pN.x)},${Math.max(p0.y, pN.y)},${r.pts.length},${r.cls.id}`));
    const cls = r.cls, path = linePath(r.pts, r.closed), bb = bboxOf(r.pts, cls.h + cls.walk + 0.5);
    fx.walkF.push(feat('stroke', path, 2 * (cls.h + cls.walk), cls.walkTex, walkOrder(cls.walkTex), bb));
    fx.asphF.push(feat('stroke', path, 2 * cls.h, cls.tex, cls.order, bb, 'butt', kerbed(cls)));
    const rl = cls.h + 1.75;
    if (kerbed(cls)) {
      const n = r.pts.length, runs = r.closed ? n : n - 1;
      for (let k = 0; k < runs; k++) {
        const a = r.pts[k], b = r.pts[(k + 1) % n], d = sub(b, a), L = vlen(d); if (L < 0.05) continue;
        const u = mul(d, 1 / L), nv = perp(u);
        for (const side of [1, -1]) { const nn = mul(nv, side); fx.slabRuns.push({ kind: 'straight', a, b, n: nn, w0: cls.h, w1: cls.h + cls.walk, visible: -(nn.x + nn.y) > 0.2, seed: (Math.abs(a.x * 73 + a.y * 151 + k * 7 + side * 3) | 0) }); }
      }
    }
    if (cls.median > 0) {
      const pts = r.closed ? r.pts : trimPolyline(r.pts, r.a0!.medianInset, r.a1!.medianInset);
      const mlen = pts ? pts.reduce((s, p, i) => (i ? s + vlen(sub(p, pts[i - 1])) : 0), 0) : 0;
      if (pts && pts.length >= 2 && (r.closed || mlen >= 3)) {
        fx.medianF.push(feat('stroke', roundedPath(pts, rl, r.closed), cls.median, 'grass', 0, bboxOf(pts, cls.median), 'round'));
        walkAlong(pts, r.closed, 2.2, 4, (p, i) => fx.autoProps.push({ kind: 'tree', x: p.x, y: p.y, i }));
      }
    }
    const base = r.closed ? r.pts : trimPolyline(r.pts, r.a0!.lineInset, r.a1!.lineInset);
    if (base && base.length >= 2) {
      const bb2 = bboxOf(base, cls.h + 0.5);
      const push = (width: number, color: string, dash: [number, number] | null, offset: number) => fx.lines.push({ pts: base, closed: r.closed, width, color, dash, r: rl, offset, bbox: bb2 });
      if (cls.shoulder > 0) { const e = cls.h - cls.shoulder; for (const s of [1, -1]) { push(cls.shoulder, 'rgba(255,255,255,0.035)', null, s * (e + cls.shoulder / 2)); push(0.1, YELLOW, null, s * e); } }
      if (cls.laneLine > 0) for (const s of [1, -1]) push(0.1, WHITE, [1.2, 1.2], s * cls.laneLine);
      const centre = cls.centre === 'style' ? (r.style === 0 ? 'dashed' : r.style === 1 ? 'double' : 'none') : cls.centre;
      if (centre === 'dashed') push(0.12, YELLOW, cls.id === 'road' ? [2, 1.4] : [1.6, 1.2], 0);
      else if (centre === 'double') { push(0.1, YELLOW, null, 0.17); push(0.1, YELLOW, null, -0.17); }
    }
    if (this.paintData) { this.decalsFor(r, fx.decals); fx.lazy = () => { const l = emptyLitter(); this.routeLitter(r, l); return l; }; }
    fx.bbox = bboxOf(r.pts, cls.h + cls.walk + 1.5);
    return fx;
  }

  private nodeFeatures(n: Node): Fx | null {
    const arms = n.arms, k = arms.length; if (!k) return null;
    const fx = emptyFx(hashStr(`n${n.x},${n.y}`)), N = { x: n.x, y: n.y };
    const { walkF, asphF, medianF, islandF, rbIslands, lines, zebra, bars, tyres, slabRuns } = fx, auto = fx.autoProps;
    let bb: BBox = bboxOf([N], 1);
    if (k === 1) {
      const a = arms[0], ra = a.h + a.cls.bulb, bbw = bboxOf([N], ra + a.walk + 0.3);
      walkF.push(feat('disc', discPath(N, ra + a.walk), 0, a.cls.walkTex, walkOrder(a.cls.walkTex), bbw));
      asphF.push(feat('disc', discPath(N, ra), 0, a.cls.tex, a.cls.order, bbw, 'butt', kerbed(a.cls)));
      if (kerbed(a.cls)) slabRuns.push({ kind: 'arc', c: N, r0: ra, r1: ra + a.walk, a0: a.ang + 0.3, a1: a.ang + TAU - 0.3, seed: (Math.abs(n.x * 31 + n.y * 17) | 0) });
    } else if (n.rb) {
      const R = n.rb, wmax = Math.max(...arms.map(a => a.walk)), top = arms.reduce((p, q) => (q.cls.order > p.cls.order ? q : p)), bbd = bboxOf([N], R + wmax + 0.3);
      walkF.push(feat('disc', discPath(N, R + wmax), 0, top.cls.walkTex, walkOrder(top.cls.walkTex), bbd));
      asphF.push(feat('disc', discPath(N, R), 0, top.cls.tex, top.cls.order, bbd, 'butt', kerbed(top.cls)));
      if (kerbed(top.cls)) slabRuns.push({ kind: 'arc', c: N, r0: R, r1: R + wmax, a0: 0, a1: TAU, seed: (Math.abs(n.x * 31 + n.y * 17) | 0) });
      for (const a of arms) for (const side of [1, -1] as const) {
        const f = rbFillet(N, a.dir, a.h, R, 1.5, side); if (f) asphF.push(feat('poly', f.path, 0, a.cls.tex, a.cls.order, f.bbox, 'butt', kerbed(a.cls)));
        const g = rbFillet(N, a.dir, a.h + a.walk, R + wmax, Math.max(0.2, 1.5 - a.walk), side); if (g) walkF.push(feat('poly', g.path, 0, a.cls.walkTex, walkOrder(a.cls.walkTex), g.bbox));
      }
      rbIslands.push({ x: n.x, y: n.y, r: R - RB_LANE });
      auto.push({ kind: 'rbtree', x: n.x, y: n.y, i: 0 });
      for (const a of arms) {
        const rn = { x: a.dir.y, y: -a.dir.x }, m = a.cls.median / 2, at = add(N, mul(a.dir, R + 0.35));
        const p0 = add(at, mul(rn, m + 0.2)), p1 = add(at, mul(rn, a.h - 0.2));
        lines.push({ pts: [p0, p1], closed: false, width: 0.3, color: WHITE, dash: [0.45, 0.3], r: 0, offset: 0, bbox: bboxOf([p0, p1], 0.5) });
      }
    } else {
      for (let i = 0; i < k; i++) {
        const A = arms[i], B = arms[(i + 1) % k];
        const phi = (((B.ang - A.ang) % TAU) + TAU) % TAU;
        if (phi < 0.12 || phi > Math.PI - 0.05) continue;
        const tan = Math.tan(phi / 2), minLen = Math.min(A.len, B.len);
        let R = n.type === 'slip' ? R_SLIP : Math.min(A.cls.rConcave, B.cls.rConcave);
        R = Math.min(R, 0.45 * minLen * tan); if (R < 0.15) continue;
        const wide = A.cls.order >= B.cls.order ? A : B;
        const cp = cornerPatch(N, A.dir, A.h, B.dir, B.h, phi, R); if (!cp) continue;
        asphF.push(feat('poly', cp.path, 0, wide.cls.tex, wide.cls.order, cp.bbox, 'butt', kerbed(wide.cls)));
        const wp = cornerPatch(N, A.dir, A.h + A.walk, B.dir, B.h + B.walk, phi, Math.max(0.08, R - (A.walk + B.walk) / 2));
        if (wp) { const wt = (A.walk >= B.walk ? A : B).cls.walkTex; walkF.push(feat('poly', wp.path, 0, wt, walkOrder(wt), wp.bbox)); }
        if (kerbed(A.cls) || kerbed(B.cls)) {
          const wk = Math.max(A.walk, B.walk), aa = Math.atan2(cp.TA.y - cp.Q.y, cp.TA.x - cp.Q.x), ab = Math.atan2(cp.TB.y - cp.Q.y, cp.TB.x - cp.Q.x);
          let d = angDelta(aa, ab); if (Math.abs(d) < 1e-6) d = 0.01;
          slabRuns.push({ kind: 'arc', c: cp.Q, r0: Math.max(0.05, R - wk), r1: R + 0.02, a0: d > 0 ? aa : ab, a1: d > 0 ? ab : aa, seed: (Math.abs(n.x * 13 + n.y * 29 + i * 5) | 0) });
        }
        if (n.type === 'slip' && R >= 9) { const isl = slipIsland(N, A, B, cp.Q, R); if (isl) islandF.push(feat('poly', isl.path, 0, 'pad', 0, isl.bbox)); }
        if ((n.type === 'signal' || n.type === 'slip') && k >= 3) { const p = add(cp.C, mul(cp.bis, R / Math.sin(phi / 2) - R + 0.6)); auto.push({ kind: 'light', x: p.x, y: p.y, i }); }
      }
      if (k === 2 && arms[0].cls !== arms[1].cls && dot(arms[0].dir, arms[1].dir) < -0.96) {
        const [wide, narrow] = arms[0].h >= arms[1].h ? [arms[0], arms[1]] : [arms[1], arms[0]];
        const T = Math.min(2.5, 0.6 * narrow.len), nn = perp(narrow.dir), E = add(N, mul(narrow.dir, T));
        const poly = (hw: number, hn: number) => [add(N, mul(nn, hw)), add(E, mul(nn, hn)), sub(E, mul(nn, hn)), sub(N, mul(nn, hw))];
        const pa = poly(wide.h, narrow.h), pw = poly(wide.h + wide.walk, narrow.h + narrow.walk);
        asphF.push(feat('poly', polyPath(pa), 0, wide.cls.tex, wide.cls.order, bboxOf(pa, 0.3), 'butt', kerbed(wide.cls)));
        walkF.push(feat('poly', polyPath(pw), 0, wide.cls.walkTex, walkOrder(wide.cls.walkTex), bboxOf(pw, 0.3)));
      }
      if (k >= 3) for (const A of arms) for (const B of arms) {
        if (A === B || A.cls.order <= B.cls.order) continue;
        const th = Math.acos(clamp(dot(A.dir, B.dir), -1, 1)); if (th < 0.2 || th > Math.PI - 0.26) continue;
        const pts: Pt[] = [];
        for (const [sa, sb] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) { const p = lineHit(add(N, mul(A.nrm, sa * A.h)), A.dir, add(N, mul(B.nrm, sb * B.h)), B.dir); if (p) pts.push(p); }
        if (pts.length < 4) continue;
        const poly = B.hasOpp ? pts : clipPoly(pts, N, B.dir);
        if (poly.length >= 3) asphF.push(feat('poly', polyPath(poly), 0, A.cls.tex, A.cls.order, bboxOf(poly, 0.3), 'butt', kerbed(A.cls)));
      }
    }
    if (k >= 3 || n.rb) for (const a of arms) {
      const rn = { x: a.dir.y, y: -a.dir.x }, m = a.cls.median / 2;
      if (a.xw >= 0) {
        const count = Math.max(2, Math.floor((2 * a.h - 0.3) / 0.7)), total = count * 0.38 + (count - 1) * 0.32, p = new Path2D();
        for (let i = 0; i < count; i++) {
          const l0 = -total / 2 + i * 0.7, l1 = l0 + 0.38;
          const q = [add(add(N, mul(a.dir, a.xw)), mul(a.nrm, l0)), add(add(N, mul(a.dir, a.xw + 1.4)), mul(a.nrm, l0)), add(add(N, mul(a.dir, a.xw + 1.4)), mul(a.nrm, l1)), add(add(N, mul(a.dir, a.xw)), mul(a.nrm, l1))];
          p.moveTo(q[0].x, q[0].y); for (let j = 1; j < 4; j++) p.lineTo(q[j].x, q[j].y); p.closePath();
        }
        zebra.push({ path: p, bbox: bboxOf([add(N, mul(a.dir, a.xw))], a.h + 1.5) });
      }
      if (a.stop >= 0) {
        const q = [add(add(N, mul(a.dir, a.stop)), mul(rn, m + 0.15)), add(add(N, mul(a.dir, a.stop + 0.35)), mul(rn, m + 0.15)), add(add(N, mul(a.dir, a.stop + 0.35)), mul(rn, a.h - 0.15)), add(add(N, mul(a.dir, a.stop)), mul(rn, a.h - 0.15))];
        bars.push({ path: polyPath(q), bbox: bboxOf(q, 0.3) });
      }
      if (a.h >= 2 && a.len > (a.stop >= 0 ? a.stop : a.reachEdge) + 7) {
        const lane = (m + a.h) / 2, start = a.stop >= 0 ? a.stop + 0.5 : a.xw >= 0 ? a.xw + 1.6 : a.reachEdge + 0.4;
        tyres.push({ x: n.x, y: n.y, ang: a.ang, start, lat: [lane - 0.55, lane + 0.55], len: 4.5 });
        bb = unionBox(bb, bboxOf([add(N, mul(a.dir, start + 4.5))], a.h + 1));
      }
    }
    if (this.paintData && (k === 1 || n.rb)) fx.lazy = () => { const l = emptyLitter(); this.nodeLitter(n, l); return l; };
    // leaves reach at most a sidewalk past the curb
    if (k === 1) bb = unionBox(bb, bboxOf([N], arms[0].h + arms[0].cls.bulb + arms[0].walk + 1));
    if (n.rb) bb = unionBox(bb, bboxOf([N], n.rb + 2));
    for (const list of [walkF, asphF, medianF, islandF]) for (const f of list) bb = unionBox(bb, f.bbox);
    for (const list of [lines, zebra, bars]) for (const f of list) bb = unionBox(bb, f.bbox);
    for (const a of auto) bb = unionBox(bb, [a.x - 1, a.y - 1, a.x + 1, a.y + 1]);
    for (const s of slabRuns) if (s.kind === 'arc') bb = unionBox(bb, bboxOf([s.c], s.r1 + 0.5));
    fx.bbox = [bb[0] - 0.5, bb[1] - 0.5, bb[2] + 0.5, bb[3] + 0.5];
    return fx;
  }

  /** Fallen leaves exactly as the builder scatters them (town-scene.mjs placeLeaves): gutter clumps, strays onto the
   *  road, clumps on the sidewalk and along its outer edge, plus curb joints and polished wheel paths. */
  private litterRun(fx: Litter, P: Pt, u: Pt, nIn: Pt, len: number, walk: number, r: () => number, g: () => number, curbed: boolean, half: number) {
    const lenM = len * 2, pts: [number, number, string][] = [];
    if (curbed) {
      for (let a = 0; a < lenM;) { a += 0.8 + r() * 3; if (a >= lenM) break; if (r() < 0.25) continue; const n = 4 + Math.floor(r() * r() * 24); for (let i = 0; i < n; i++) pts.push([clamp(a + g() * 0.65, 0, lenM - 0.01), 0.06 + Math.abs(g()) * 0.24 + r() * r() * 0.5, 'gutter']); }
    } else for (let a = 0; a < lenM;) { a += 1.6 + r() * 4; if (a >= lenM) break; if (r() < 0.5) continue; const n = 2 + Math.floor(r() * r() * 10); for (let i = 0; i < n; i++) pts.push([clamp(a + g() * 0.65, 0, lenM - 0.01), 0.06 + Math.abs(g()) * 0.3 + r() * r() * 0.6, 'gutter']); }
    for (let a = 0; a < lenM;) { a += 0.7 + r() * 2.2; if (a >= lenM) break; const d = 0.35 - Math.log(1 - r() * 0.985) * 0.75; if (d < Math.min(3.15, half * 2 - 0.3)) pts.push([a, d, 'stray']); }
    const walkM = walk * 2;
    if (curbed) for (let a = 0; a < lenM; a += 5) { if (r() > 0.38) continue; const c0 = a + r() * 5, n = 4 + Math.floor(r() * 12), edge = r() < 0.6; for (let i = 0; i < n; i++) pts.push([clamp(c0 + g() * 1.1, 0, lenM - 0.01), edge ? -(walkM - 0.15 - Math.abs(g()) * 0.45) : -(0.35 + r() * (walkM - 0.5)), 'walk']); }
    for (let a = 0; a < lenM; a += 0.6 + r() * 1.6) { if (r() < 0.45) continue; const n = 1 + Math.floor(r() * 4); for (let i = 0; i < n; i++) pts.push([clamp(a + g() * 0.3, 0, lenM - 0.01), -(walkM + 0.04 + Math.abs(g()) * 0.3), 'edge']); }
    for (const [al, d, kind] of pts) { const p = add(add(P, mul(u, al / 2)), mul(nIn, d / 2)); fx.leaves.push({ x: p.x, y: p.y, ang: r() * Math.PI * 2, s: leafSize(r, kind), c: kind === 'edge' ? 1 : 0 }); }
    if (curbed && r() < 0.5) for (let a = 0.3 + r() * 1.5; a < len; a += 0.4 + r() * 1.4) if (r() < 0.5) { const p = add(add(P, mul(u, a)), mul(nIn, -walk)); fx.tufts.push({ x: p.x, y: p.y, ang: Math.atan2(-nIn.y, -nIn.x), v: (r() * 3) | 0 }); }
  }
  private routeLitter(rt: Route, fx: Litter) {
    const cls = rt.cls, curbed = cls.walkTex === 'slabs', p0 = rt.pts[0];
    const rng = mulberry((((p0.x * 2654435) ^ (p0.y * 40503) ^ (rt.pts.length * 977)) >>> 0) ^ 0x5bd1e995), g = gaussOf(rng);
    const wl = rt.closed ? rt.pts : trimPolyline(rt.pts, Math.max(0, rt.a0!.lineInset), Math.max(0, rt.a1!.lineInset));
    if (wl && wl.length >= 2) { const offs: number[] = []; for (const lc of cls.laneCentres) for (const sgn of [1, -1]) offs.push(sgn * (lc - 0.42), sgn * (lc + 0.42)); fx.wear.push({ pts: wl, closed: rt.closed, r: cls.h + 1.75, h: cls.h, offsets: offs, bbox: bboxOf(wl, cls.h + 0.5) }); }
    const endInset = (n: Node, a: Arm) => n.rb ? n.rb + 1.8 : n.arms.length >= 3 ? a.reachEdge + (n.type === 'slip' ? R_SLIP : cls.rConcave) + 0.3 : n.arms.length === 2 ? 0.6 : 0;
    const base = rt.closed ? rt.pts : trimPolyline(rt.pts, endInset(rt.nodes[0], rt.a0!), endInset(rt.nodes[rt.nodes.length - 1], rt.a1!));
    if (!base || base.length < 2) return;
    const n = base.length, runs = rt.closed ? n : n - 1;
    for (let k = 0; k < runs; k++) {
      const a = base[k], b = base[(k + 1) % n], d = sub(b, a), L = vlen(d); if (L < 0.3) continue;
      const u = mul(d, 1 / L), nv = perp(u);
      for (const side of [1, -1]) { const nIn = mul(nv, -side), P = add(a, mul(nv, side * cls.h)); this.litterRun(fx, P, u, nIn, L, cls.walk, rng, g, curbed, cls.h); }
      if (cls.median > 0) for (const side of [1, -1]) { const nIn = mul(nv, side), P = add(a, mul(nv, side * cls.median / 2)); this.litterRun(fx, P, u, nIn, L, 0, rng, g, false, cls.median / 2); }
      if (curbed) { const nSlab = Math.max(1, Math.round(L / 1.25)); for (let j = 0; j <= nSlab; j++) { const q = add(a, mul(u, (L * j) / nSlab)); for (const side of [1, -1]) { const c0 = add(q, mul(nv, side * cls.h)), c1 = add(q, mul(nv, side * (cls.h + 0.12))); fx.joints.push({ a: c0, b: c1 }); } } }
    }
  }
  private nodeLitter(n: Node, fx: Litter) {
    if (n.arms.length === 1 && n.arms[0].cls.walkTex === 'slabs') {
      const a = n.arms[0], R = a.h + a.cls.bulb, rng = mulberry(((n.x * 7919) ^ (n.y * 104729) ^ 0x9e37) >>> 0), g = gaussOf(rng), back = a.ang + Math.PI;
      const span = Math.PI * 2 - 0.9, start = back - span / 2 + Math.PI, steps = Math.ceil(span * R / 2.5);
      for (let i = 0; i < steps; i++) { const t0 = start + (span * i) / steps, t1 = start + (span * (i + 1)) / steps, P = { x: n.x + Math.cos(t0) * R, y: n.y + Math.sin(t0) * R }, Q = { x: n.x + Math.cos(t1) * R, y: n.y + Math.sin(t1) * R }, d = sub(Q, P), L = vlen(d); if (L < 0.05) continue; const u = mul(d, 1 / L), nIn = norm(sub(n, P)); this.litterRun(fx, P, u, nIn, L, a.walk, rng, g, true, R); }
    }
    if (n.rb) {
      const rng = mulberry(((n.x * 7919) ^ (n.y * 104729)) >>> 0), g = gaussOf(rng), R = n.rb, steps = Math.ceil(Math.PI * 2 * R / 2.5);
      for (let i = 0; i < steps; i++) { const t0 = (Math.PI * 2 * i) / steps, t1 = (Math.PI * 2 * (i + 1)) / steps, P = { x: n.x + Math.cos(t0) * R, y: n.y + Math.sin(t0) * R }, Q = { x: n.x + Math.cos(t1) * R, y: n.y + Math.sin(t1) * R }, d = sub(Q, P), L = vlen(d), u = mul(d, 1 / L), nIn = norm(sub(n, P)); this.litterRun(fx, P, u, nIn, L, 1, rng, g, true, R); }
      const ri = R - RB_LANE;
      for (let i = 0; i < steps; i++) { const t0 = (Math.PI * 2 * i) / steps, t1 = (Math.PI * 2 * (i + 1)) / steps, P = { x: n.x + Math.cos(t0) * ri, y: n.y + Math.sin(t0) * ri }, Q = { x: n.x + Math.cos(t1) * ri, y: n.y + Math.sin(t1) * ri }, d = sub(Q, P), L = vlen(d), u = mul(d, 1 / L), nIn = norm(sub(P, n)); this.litterRun(fx, P, u, nIn, L, 0, rng, g, false, RB_LANE); }
    }
  }
  /** Street lamps (world positions, tiles) snap to the nearest curb within 2.5 tiles; the pool sits on the curb point.
   *  Returns the boxes whose ground changed. */
  setLamps(lamps: Pt[]): BBox[] {
    const pools: Pool[] = [];
    for (const l of lamps) {
      let best: { d: number; p: Pt } | null = null;
      for (const s of this.segsNear(l, 12)) {
        const d = sub(s.b, s.a), L = vlen(d), u = mul(d, 1 / L), t = clamp(dot(sub(l, s.a), u), 0, L), q = add(s.a, mul(u, t)), off = sub(l, q), dist = vlen(off);
        const side = dist > 1e-6 ? mul(off, 1 / dist) : perp(u), curb = add(q, mul(side, s.cls.h)), dc = Math.abs(dist - s.cls.h);
        if (dc < 2.5 && (!best || dc < best.d)) best = { d: dc, p: curb };
      }
      if (best) pools.push({ x: best.p.x, y: best.p.y, strength: 1 });
    }
    const key = (p: Pool) => p.x.toFixed(3) + ',' + p.y.toFixed(3), before = new Set(this.pools.map(key)), after = new Set(pools.map(key)), changed: BBox[] = [];
    for (const p of this.pools) if (!after.has(key(p))) changed.push([p.x - 9, p.y - 9, p.x + 9, p.y + 9]);
    for (const p of pools) if (!before.has(key(p))) changed.push([p.x - 9, p.y - 9, p.x + 9, p.y + 9]);
    this.pools = pools; this.poolGrid.clear(); for (const p of pools) this.poolGrid.add(p, [p.x - 9, p.y - 9, p.x + 9, p.y + 9]);
    return changed;
  }
  private decalsFor(r: Route, out: Decal[]) {
    const cls = r.cls, p0 = r.pts[0], rng = mulberry(((p0.x * 73856093) ^ (p0.y * 19349663) ^ (cls.order * 83492791)) >>> 0);
    const curbed = cls.walkTex === 'slabs';
    const weights: [DecalType, number][] = curbed ? [['manhole', 2], ['drain', 2.5], ['oil', 1.5], ['patch', cls.id === 'lane' ? 2.5 : 1]] : [['manhole', 0.4], ['oil', 2], ['patch', 2]];
    const wsum = weights.reduce((s, w) => s + w[1], 0);
    const pick = () => { let v = rng() * wsum; for (const [t, w] of weights) { v -= w; if (v <= 0) return t; } return weights[0][0]; };
    const n = r.pts.length, runs = r.closed ? n : n - 1;
    for (let k = 0; k < runs; k++) {
      const a = r.pts[k], b = r.pts[(k + 1) % n], d = sub(b, a), L = vlen(d), dir = mul(d, 1 / L), nrm = perp(dir), ang = Math.atan2(dir.y, dir.x);
      const s0 = (k === 0 && !r.closed ? Math.max(0, r.a0!.lineInset) : 0) + 1.5, s1 = L - (k === runs - 1 && !r.closed ? Math.max(0, r.a1!.lineInset) : 0) - 1.5;
      for (let s = s0 + rng() * 3; s < s1; s += 3.5 + rng() * 4) {
        const t = pick(), sign = rng() < 0.5 ? 1 : -1, lane = cls.laneCentres[(rng() * cls.laneCentres.length) | 0] * sign;
        let lat = 0;
        switch (t) {
          case 'manhole': lat = lane + (rng() - 0.5) * 0.3; break;
          case 'drain': lat = (cls.h - 0.32) * sign; break;
          case 'oil': lat = lane + (rng() - 0.5) * 0.8; break;
          case 'patch': lat = lane + (rng() - 0.5) * 0.4; break;
        }
        const p = add(add(a, mul(dir, s)), mul(nrm, lat));
        out.push({ t, x: p.x, y: p.y, ang, s: (t === 'patch' && cls.id === 'lane' ? 0.6 : 0.85) + rng() * 0.3, seed: (rng() * 1e6) | 0 });
      }
    }
  }
}

const feat = (kind: Feature['kind'], path: Path2D, w: number, tex: string, order: number, bbox: BBox, cap: Feature['cap'] = 'butt', kerb = true): Feature => ({ kind, path, w, tex, order, bbox, cap, kerb });
const kerbed = (c: RoadClass) => c.walkTex === 'slabs';
const walkOrder = (t: string) => (t === 'slabs' ? 1 : 0);
const gaussOf = (r: () => number) => () => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
const leafSize = (r: () => number, k: string) => { const u = r(); return (k === 'stray' ? 0.96 : 1) * (u < 0.22 ? 0.11 + r() * 0.08 : u < 0.58 ? 0.2 + r() * 0.1 : u < 0.88 ? 0.32 + r() * 0.15 : 0.49 + r() * 0.16); };

/** occupancy for a box: the ground features drawn into a 1 px-per-tile canvas (red walk, green asphalt, blue median) */
function canvasOccRaster(net: RoadNetwork, box: BBox) {
  const x0 = Math.max(0, Math.floor(box[0]) - 1), y0 = Math.max(0, Math.floor(box[1]) - 1), x1 = Math.min(MAP, Math.ceil(box[2]) + 1), y1 = Math.min(MAP, Math.ceil(box[3]) + 1);
  const W = x1 - x0, H = y1 - y0; if (W <= 0 || H <= 0) return;
  const c = new OffscreenCanvas(W, H), ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(1, 0, 0, 1, -x0, -y0); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round';
  const v = net.view([x0, y0, x1, y1], false);
  const draw = (list: Feature[], color: string) => { for (const f of list) { ctx.lineCap = f.cap; if (f.kind === 'stroke') { ctx.strokeStyle = color; ctx.lineWidth = f.w; ctx.stroke(f.path); } else { ctx.fillStyle = color; ctx.fill(f.path); } } };
  draw(v.walkF, '#ff0000'); draw(v.asphF, '#00ff00'); draw(v.medianF, '#0000ff'); draw(v.islandF, '#ff0000');
  ctx.fillStyle = '#0000ff'; for (const i of v.rbIslands) { ctx.beginPath(); ctx.arc(i.x, i.y, i.r, 0, TAU); ctx.fill(); }
  const data = ctx.getImageData(0, 0, W, H).data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, r = data[i] > 127, g = data[i + 1] > 127, b = data[i + 2] > 127; net.occ[(y0 + y) * MAP + x0 + x] = b ? 3 : g ? 2 : r ? 1 : 0; }
}
