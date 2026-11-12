// The golf holes (docs/GOLF-PLAN.md section 4.2): the playing line, lengths, par and warnings, derived from the painted course. Pure TS, no DOM.
import type { AimPoint, CourseArea, GolfSurface, Pin, TeeKind, TeeMark } from './types';
import { TILE_M } from './types';
import { TEE_KINDS, TEE_SET } from './teesets';

/** a point in tiles */
export type Pt = { x: number; y: number };
/** one tee set of a hole (T254): its kind, its length to the pin (m), its par and its playing line (tiles: its tee, the aims, the pin) */
export interface HoleSet { kind: TeeKind; lengthM: number; par: 3 | 4 | 5; line: Pt[] }
/** a derived hole: its number, par (from the length), the championship and member lengths (metres), the playing line (tiles) and its warnings. T254:
 *  sets, each tee set's length, par and line, back to front (a hole with a line has one at least; the line and lengthM are the first set's) */
export interface Hole { n: number; par: 3 | 4 | 5; lengthM: number; memberLengthM: number; line: Pt[]; warnings: string[]; sets?: HoleSet[] }
/** the course totals over its playable holes (those with a pin and a tee) */
export interface CourseStats { holes: number; par: number; lengthM: number; memberLengthM: number; mix: { 3: number; 4: number; 5: number } }

/** the warning a hole gets when its pin is not on a green (T399: the prep checklist counts a hole complete only without it) */
export const PIN_OFF_GREEN = 'The pin is not on a green';

/** the surfaces a ball can be played from (the off-course test) */
const PLAYABLE = new Set<GolfSurface>(['green', 'fringe', 'tee', 'fairway', 'firstCut', 'rough', 'longGrass', 'fescue', 'bunker']);
/** the spacing (tiles) at which the line is sampled for the off-course test */
const STEP = 1;
/** holes whose lines come closer than this (tiles, 60 m) are too close */
const CLOSE = 30;
/** the ends of each line (tiles) that the too-close test ignores */
const END_CUT = 10;
/** the longest walk from a pin to the next tee (tiles, 150 m) */
const WALK = 75;

/** the surface of the topmost area (the last in paint order) whose outline contains (x, y), or null */
export function surfaceAt(areas: CourseArea[], x: number, y: number): GolfSurface | null {
  for (let i = areas.length - 1; i >= 0; i--) { const p = areas[i].pts, o = outlineOf(p); if (x >= o.b[0] && x <= o.b[2] && y >= o.b[1] && y <= o.b[3] && inRow(o, p, x, y)) return areas[i].surface; }
  return null;
}
/** T438: what surfaceAt keeps of an outline (outlines are replaced, not edited in place; a change of length is seen): its box (x0, y0, x1, y1), read
 *  before the polygon test, and the crossings of its last few rows. A point on no painted cell tested every area's polygon edge by edge (some 85 us a
 *  point on a painted course of 259 areas: the view's lie grid took seconds); a row's crossings are worked out once and each point is a binary search.
 *  The same even-odd test as inPoly, the same arithmetic: the same answer */
interface Outline { n: number; b: [number, number, number, number]; rows: Map<number, Float64Array> }
const OUTLINES = new WeakMap<readonly number[], Outline>();
function outlineOf(p: readonly number[]): Outline {
  const c = OUTLINES.get(p); if (c && c.n === p.length) return c;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < p.length; i += 2) { const x = p[i]!, y = p[i + 1]!; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const o: Outline = { n: p.length, b: [x0, y0, x1, y1], rows: new Map() }; OUTLINES.set(p, o); return o;
}
/** T438: the areas bucketed on a coarse grid (each cell lists, topmost first, the areas whose box touches it), for surfaceAtIx. For a list that is not
 *  changed after (the engine's area lists are rebuilt, not edited) */
export interface AreaIndex { areas: readonly CourseArea[]; cell: number; x0: number; y0: number; w: number; h: number; start: Int32Array; list: Int32Array }
export function areaIndex(areas: readonly CourseArea[], cell = 16): AreaIndex {
  const boxes = areas.map(a => outlineOf(a.pts).b);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of boxes) if (b[0] <= b[2]) { x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
  if (!Number.isFinite(x0)) return { areas, cell, x0: 0, y0: 0, w: 0, h: 0, start: new Int32Array(1), list: new Int32Array(0) };
  const gx = Math.floor(x0 / cell), gy = Math.floor(y0 / cell), w = Math.floor(x1 / cell) - gx + 1, h = Math.floor(y1 / cell) - gy + 1;
  const count = new Int32Array(w * h + 1), span = (b: readonly number[]) => [Math.floor(b[0]! / cell) - gx, Math.floor(b[1]! / cell) - gy, Math.floor(b[2]! / cell) - gx, Math.floor(b[3]! / cell) - gy] as const;
  for (const b of boxes) { if (!(b[0] <= b[2])) continue; const [i0, j0, i1, j1] = span(b); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) count[j * w + i + 1]!++; }
  for (let k = 1; k <= w * h; k++) count[k] += count[k - 1]!;
  const start = count.slice(), fill = count.slice(0, w * h), list = new Int32Array(start[w * h]!);
  for (let a = areas.length - 1; a >= 0; a--) { const b = boxes[a]!; if (!(b[0] <= b[2])) continue; const [i0, j0, i1, j1] = span(b); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) list[fill[j * w + i]!++] = a; }
  return { areas, cell, x0: gx, y0: gy, w, h, start, list };
}
/** surfaceAt over an index: the same answer (the topmost area whose outline holds the point), looking only at the areas of the point's cell */
export function surfaceAtIx(ix: AreaIndex, x: number, y: number): GolfSurface | null {
  const i = Math.floor(x / ix.cell) - ix.x0, j = Math.floor(y / ix.cell) - ix.y0;
  if (i < 0 || j < 0 || i >= ix.w || j >= ix.h) return null;
  const k = j * ix.w + i;
  for (let q = ix.start[k]!; q < ix.start[k + 1]!; q++) {
    const a = ix.areas[ix.list[q]!]!, p = a.pts, o = outlineOf(p);
    if (x >= o.b[0] && x <= o.b[2] && y >= o.b[1] && y <= o.b[3] && inRow(o, p, x, y)) return a.surface;
  }
  return null;
}
function inRow(o: Outline, p: readonly number[], x: number, y: number): boolean {
  if (p.length < 64) return inPoly(p as number[], x, y);   // (a small outline: straight through)
  let xs = o.rows.get(y);
  if (!xs) {
    const q: number[] = [];
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      const xi = p[i]!, yi = p[i + 1]!, xj = p[j]!, yj = p[j + 1]!;
      if ((yi > y) !== (yj > y)) q.push((xj - xi) * (y - yi) / (yj - yi) + xi);
    }
    xs = Float64Array.from(q).sort();
    if (o.rows.size >= 8) o.rows.clear();
    o.rows.set(y, xs);
  }
  // inside when an odd number of crossings lie beyond x (inPoly's x < crossing)
  let lo = 0, hi = xs.length; while (lo < hi) { const m = (lo + hi) >> 1; if (xs[m]! > x) hi = m; else lo = m + 1; }
  return ((xs.length - lo) & 1) === 1;
}

/** validation result for moving a tee marker or pin */
export interface MarkerValidation { ok: boolean; reason?: string }

/** validates that a pin lies on a green and a tee marker lies on a tee area */
export function validateMarkerPlacement(
 areas: CourseArea[],
 kind: 'pin' | TeeKind,
 x: number,
 y: number,
): MarkerValidation {
 const surface = surfaceAt(areas, x, y);
 if (kind === 'pin') {
 if (surface !== 'green') return { ok: false, reason: 'A pin must be placed on a green' };
 } else {
 if (surface !== 'tee') return { ok: false, reason: `A ${TEE_SET[kind].colour} tee marker must be placed on a tee` };
 }
 return { ok: true };
 }

/** even-odd point in polygon; pts is x0 y0 x1 y1 ... */
function inPoly(p: number[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** the par for a hole of m metres: 3 up to 230 m, 4 up to 430 m, 5 beyond */
export function parFromLength(m: number): 3 | 4 | 5 { return m <= 230 ? 3 : m <= 430 ? 4 : 5; }

/** the playing line in tiles: the tee, the hole's aim points in order, then the pin */
export function holeLine(tee: Pt, aims: { x: number; y: number; order: number }[], pin: Pt): Pt[] {
  return [tee, ...aims.slice().sort((a, b) => a.order - b.order), pin].map(p => ({ x: p.x, y: p.y }));
}

/** the length of a polyline in tiles */
export function lineLength(pts: Pt[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return s;
}

/** the points of a polyline every STEP tiles along it, the last point included */
function samples(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  if (!pts.length) return out;
  let acc = 0, next = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i], q = pts[i + 1], L = Math.hypot(q.x - p.x, q.y - p.y);
    for (; L > 0 && next <= acc + L; next += STEP) { const u = (next - acc) / L; out.push({ x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u }); }
    acc += L;
  }
  if (acc > next - STEP + 1e-9) out.push({ x: pts[pts.length - 1].x, y: pts[pts.length - 1].y });
  return out;
}

/** the part of a polyline between arc lengths a and b (tiles) */
function along(pts: Pt[], a: number, b: number): Pt[] {
  const out: Pt[] = [];
  let acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i], q = pts[i + 1], L = Math.hypot(q.x - p.x, q.y - p.y);
    if (L > 0 && acc + L >= a && acc <= b) {
      const u0 = Math.max(a, acc) - acc, u1 = Math.min(b, acc + L) - acc;
      out.push({ x: p.x + (q.x - p.x) * u0 / L, y: p.y + (q.y - p.y) * u0 / L }, { x: p.x + (q.x - p.x) * u1 / L, y: p.y + (q.y - p.y) * u1 / L });
    }
    acc += L;
  }
  return out;
}

/** the distance from point p to segment a-b */
function ptSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

/** the distance between segments a-b and c-d (0 where they cross) */
function segDist(a: Pt, b: Pt, c: Pt, d: Pt): number {
  const o = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  if (o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0) return 0;
  return Math.min(ptSeg(a, c, d), ptSeg(b, c, d), ptSeg(c, a, b), ptSeg(d, a, b));
}

/** the least distance between the segments of two polylines (tiles) */
function minDist(A: Pt[], B: Pt[]): number {
  let m = Infinity;
  for (let i = 0; i + 1 < A.length; i++) for (let j = 0; j + 1 < B.length; j++) m = Math.min(m, segDist(A[i], A[i + 1], B[j], B[j + 1]));
  return m;
}

/** the holes on a course: one per hole number with a pin or a tee, sorted by number, each with its lengths, par and warnings */
export function deriveHoles(areas: CourseArea[], tees: TeeMark[], pins: Pin[], aims: AimPoint[]): Hole[] {
  const ns = Array.from(new Set([...pins.map(p => p.hole), ...tees.map(t => t.hole)])).sort((a, b) => a - b);
  const holes: Hole[] = [], starts: (Pt | null)[] = [], pinAt: (Pt | null)[] = [], trims: Pt[][] = [];
  for (const n of ns) {
    const pin = pins.find(p => p.hole === n) ?? null;
    const back = tees.find(t => t.hole === n && t.kind === 'back') ?? null;
    const mid = tees.find(t => t.hole === n && t.kind === 'middle') ?? null;
    // the line starts at the set furthest back (T254: blue, white, yellow, red)
    const mine = TEE_KINDS.flatMap(k => tees.find(t => t.hole === n && t.kind === k) ?? []), start = mine[0] ?? null;
    const holeAims = aims.filter(a => a.hole === n);
    const warnings: string[] = [];
    if (!pin) warnings.push('No pin');
    if (!start) warnings.push('No tee markers');
    if (pin && surfaceAt(areas, pin.x, pin.y) !== 'green') warnings.push(PIN_OFF_GREEN);
    if (back && surfaceAt(areas, back.x, back.y) !== 'tee') warnings.push('The back tee is not on a tee');
    const line = pin && start ? holeLine(start, holeAims, pin) : [];
    const lengthM = line.length ? Math.round(lineLength(line) * TILE_M) : 0;
    const memberLengthM = pin && mid ? Math.round(lineLength(holeLine(mid, holeAims, pin)) * TILE_M) : lengthM;
    if (line.length) {
      const S = samples(line);
      let on = 0;
      for (const s of S) { const f = surfaceAt(areas, s.x, s.y); if (f && PLAYABLE.has(f)) on++; }
      if (on < 0.7 * S.length) warnings.push('Most of the line is off the course');
    }
    // T254: each set's own line, length and par
    const sets = pin && line.length ? mine.map(t => { const l = holeLine(t, holeAims, pin), m = Math.round(lineLength(l) * TILE_M); return { kind: t.kind, lengthM: m, par: parFromLength(m), line: l }; }) : [];
    holes.push({ n, par: line.length ? parFromLength(lengthM) : 4, lengthM, memberLengthM, line, warnings, ...(sets.length ? { sets } : {}) });
    starts.push(start ? { x: start.x, y: start.y } : null);
    pinAt.push(pin ? { x: pin.x, y: pin.y } : null);
    const L = line.length ? lineLength(line) : 0;
    trims.push(L > 2 * END_CUT ? along(line, END_CUT, L - END_CUT) : []);
  }
  for (let a = 0; a < holes.length; a++) for (let b = a + 1; b < holes.length; b++) {
    if (trims[a].length > 1 && trims[b].length > 1 && minDist(trims[a], trims[b]) < CLOSE) {
      holes[a].warnings.push(`Too close to hole ${holes[b].n}`);
      holes[b].warnings.push(`Too close to hole ${holes[a].n}`);
    }
  }
  for (let i = 0; i + 1 < holes.length; i++) {
    const pin = pinAt[i], next = starts[i + 1];
    if (pin && holes[i + 1].n === holes[i].n + 1 && next && Math.hypot(pin.x - next.x, pin.y - next.y) > WALK) holes[i].warnings.push('Long walk to the next tee');
  }
  return holes;
}

/** the course totals: holes, par, lengths and the par mix, over the playable holes only (a pin and a tee) */
export function courseStats(holes: Hole[]): CourseStats {
  const s: CourseStats = { holes: 0, par: 0, lengthM: 0, memberLengthM: 0, mix: { 3: 0, 4: 0, 5: 0 } };
  for (const h of holes) if (h.line.length) { s.holes++; s.par += h.par; s.lengthM += h.lengthM; s.memberLengthM += h.memberLengthM; s.mix[h.par]++; }
  return s;
}
