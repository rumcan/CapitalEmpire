// Bay rows (docs/PARKING.md section 1): a drag lays a row of bays along its front line (the aisle side), at 90, 60 or 45 degrees. Rows that sit
// close together form a lot, which the City and the sim read as one car park (lotPark). Pure TS, no DOM. Tiles of 2 m.
import { TC } from '../terrain/types';
import { SK, add, dot, mul, norm, perp, sub, vlen, type Pt, type RoadNetwork, type Seg } from '../network';
import type { Bay, CarPark } from './carpark';
import { BAY_D, BAY_W } from './config';

/** rows within this many tiles of each other form one lot */
export const LOT_JOIN = 6;
/** a lot's entrance road must be within this many tiles of one of its bays */
export const ROW_REACH = 24;
/** $ per bay */
export const ROW_BAY_COST = 40;
/** the longest row, tiles */
export const ROW_MAX = 120;
/** a lot's park id = LOT_ID0 + its lowest row id */
export const LOT_ID0 = 100000;
/** how far a row's paving grows past its bays on every side, tiles (neighbouring rows' paving overlaps) */
const PAVE = 0.25;
/** the slack of the point and separating-axis tests, tiles */
const EPS = 1e-9;

/** a row of bays as the player drags it: the front line a→b (the aisle side), the bays on `side` of it (1: perp(u), −1: the other side), their angle to the line, the line colour */
export interface BayRowDef { id: number; ax: number; ay: number; bx: number; by: number; side: 1 | -1; bay: 90 | 60 | 45; col: 'white' | 'yellow' }
/** a row's geometry (rowGeom): u the unit front direction a→b, n the unit normal from the front line into the bays, len the front length, pitch
 *  the bays' spacing along the front (BAY_W / sin), depth the bays' depth (BAY_D sin + BAY_W cos), count the whole bays, h the unit heading into a
 *  bay (n sin + u cos), s and c the sine and cosine of the bay angle */
export interface RowGeom { u: Pt; n: Pt; len: number; pitch: number; depth: number; count: number; h: Pt; s: number; c: number }

/** the sine and cosine of each bay angle (to the aisle) */
const SC: Record<90 | 60 | 45, { s: number; c: number }> = { 90: { s: 1, c: 0 }, 60: { s: Math.sqrt(3) / 2, c: 0.5 }, 45: { s: Math.SQRT1_2, c: Math.SQRT1_2 } };
/** the four facings: 0 +x, 1 +y, 2 −x, 3 −y */
const FACE: Pt[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];

/** the geometry of row d (see RowGeom). perp(u) is (−u.y, u.x): side 1 points to +y, the right of a→b as drawn on the y-down map. A zero-length row has u (0, 0) and count 0 */
export function rowGeom(d: BayRowDef): RowGeom {
  const D = sub({ x: d.bx, y: d.by }, { x: d.ax, y: d.ay }), len = vlen(D), u = norm(D), n = mul(perp(u), d.side);
  const { s, c } = SC[d.bay], pitch = BAY_W / s;
  return { u, n, len, pitch, depth: BAY_D * s + BAY_W * c, count: Math.floor(len / pitch), h: add(mul(n, s), mul(u, c)), s, c };
}

/** the facing (0 +x, 1 +y, 2 −x, 3 −y) nearest to the unit vector h */
function facing(h: Pt): 0 | 1 | 2 | 3 {
  let best = 0, bd = -Infinity;
  for (let k = 0; k < 4; k++) { const t = dot(h, FACE[k]!); if (t > bd) { bd = t; best = k; } }
  return best as 0 | 1 | 2 | 3;
}

/** the bays of row d (count of them): bay k's front span runs from a + u·k·pitch to a + u·(k+1)·pitch; its centre is the span's midpoint + h·BAY_D/2;
 *  heading h, row direction u, facing the nearest of the four to h */
export function rowBays(d: BayRowDef): Bay[] {
  const G = rowGeom(d), A = { x: d.ax, y: d.ay }, dir = facing(G.h), out: Bay[] = [];
  for (let k = 0; k < G.count; k++) {
    const m = add(A, mul(G.u, (k + 0.5) * G.pitch)), p = add(m, mul(G.h, BAY_D / 2));
    out.push({ x: p.x, y: p.y, dir, hx: G.h.x, hy: G.h.y, tx: G.u.x, ty: G.u.y });
  }
  return out;
}

/** the painted lines of row d as x0 y0 x1 y1 …: the count + 1 separators (from the front point a + u·k·pitch, going h·BAY_D, so angled ones lean),
 *  then the back line joining the far ends of the first and last separators */
export function rowLines(d: BayRowDef): number[] {
  const G = rowGeom(d), A = { x: d.ax, y: d.ay }, out: number[] = [];
  for (let k = 0; k <= G.count; k++) { const p = add(A, mul(G.u, k * G.pitch)), q = add(p, mul(G.h, BAY_D)); out.push(p.x, p.y, q.x, q.y); }
  const f0 = add(A, mul(G.h, BAY_D)), fn = add(add(A, mul(G.u, G.count * G.pitch)), mul(G.h, BAY_D));
  out.push(f0.x, f0.y, fn.x, fn.y);
  return out;
}

/** the footprint of row d as 4 world corners in order, grown by g tiles on every side (along u and along n): the bays' parallelogram, front line at
 *  n = 0, back line at n = BAY_D·sin, its far corners shifted by u·BAY_D·cos; the front end e = a + u·count·pitch */
function quadOf(d: BayRowDef, g: number): Pt[] {
  const G = rowGeom(d), A = { x: d.ax, y: d.ay }, L = G.count * G.pitch, dc = BAY_D * G.c, dn = BAY_D * G.s;
  const P: [number, number][] = [[-g, -g], [L + g, -g], [L + dc + g, dn + g], [dc - g, dn + g]];
  return P.map(([s, t]): Pt => ({ x: A.x + G.u.x * s + G.n.x * t, y: A.y + G.u.y * s + G.n.y * t }));
}

/** the footprint to pave: the row's quad grown by PAVE tiles on every side, as x0 y0 … x3 y3 (neighbouring rows' paving overlaps) */
export function rowQuad(d: BayRowDef): number[] { return quadOf(d, PAVE).flatMap(p => [p.x, p.y]); }

/** true if p lies in the convex quad Q (corners in order; the boundary counts) */
function inQuad(Q: Pt[], p: Pt): boolean {
  let pos = false, neg = false;
  for (let i = 0; i < 4; i++) {
    const a = Q[i]!, b = Q[(i + 1) % 4]!, k = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (k > EPS) pos = true; else if (k < -EPS) neg = true;
    if (pos && neg) return false;
  }
  return true;
}

/** the distance from point p to the segment a–b */
function pointSegDist(a: Pt, b: Pt, p: Pt): number {
  const D = sub(b, a), L2 = dot(D, D), t = L2 ? Math.max(0, Math.min(1, dot(sub(p, a), D) / L2)) : 0;
  return vlen(sub(p, add(a, mul(D, t))));
}

/** the side of the line a→b that p is on (the cross product) */
const sideOf = (a: Pt, b: Pt, p: Pt): number => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);

/** true if the segments a–b and c–d cross properly */
function crosses(a: Pt, b: Pt, c: Pt, d: Pt): boolean { return sideOf(a, b, c) * sideOf(a, b, d) < 0 && sideOf(c, d, a) * sideOf(c, d, b) < 0; }

/** the distance between the segment a–b and the convex quad Q (0 if they meet) */
function segQuadDist(a: Pt, b: Pt, Q: Pt[]): number {
  if (inQuad(Q, a) || inQuad(Q, b)) return 0;
  let m = Infinity;
  for (let i = 0; i < 4; i++) {
    const p = Q[i]!, q = Q[(i + 1) % 4]!;
    if (crosses(a, b, p, q)) return 0;
    m = Math.min(m, pointSegDist(p, q, a), pointSegDist(p, q, b), pointSegDist(a, b, p));
  }
  return m;
}

/** true if the convex quads A and B overlap (the separating-axis test; touching does not count) */
function quadsOverlap(A: Pt[], B: Pt[]): boolean {
  for (const P of [A, B]) for (let i = 0; i < 4; i++) {
    const e = sub(P[(i + 1) % 4]!, P[i]!), ax = perp(e);
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const p of A) { const t = dot(p, ax); a0 = Math.min(a0, t); a1 = Math.max(a1, t); }
    for (const p of B) { const t = dot(p, ax); b0 = Math.min(b0, t); b1 = Math.max(b1, t); }
    if (a1 <= b0 + EPS || b1 <= a0 + EPS) return false;
  }
  return true;
}

/** the distance between the convex quads A and B (0 if they overlap or touch) */
function quadDist(A: Pt[], B: Pt[]): number {
  if (quadsOverlap(A, B)) return 0;
  let m = Infinity;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      m = Math.min(m, pointSegDist(B[j]!, B[(j + 1) % 4]!, A[i]!), pointSegDist(A[j]!, A[(j + 1) % 4]!, B[i]!));
    }
  }
  return m;
}

/** '' or the reason row d cannot go, in order: fewer than 2 bays, too long, too close to the map's edge, a tile under the paving not buildable ground
 *  (only TC.GROUND and TC.PATCH are), a road (centre line a–b, half width hw) within hw of the paving, another row's bays overlapping this row's */
export function rowCheck(d: BayRowDef, cls: Uint8Array, roads: { a: Pt; b: Pt; hw: number }[], others: BayRowDef[], mapSize: number): string {
  const G = rowGeom(d);
  if (G.count < 2) return 'too short: at least 2 bays';
  if (G.len > ROW_MAX) return 'too long (240 m max)';
  const Q = quadOf(d, PAVE);
  for (const p of Q) if (p.x < 2 || p.y < 2 || p.x > mapSize - 2 || p.y > mapSize - 2) return 'too close to the edge of the map';
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of Q) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  for (let y = Math.floor(y0); y < y1; y++) for (let x = Math.floor(x0); x < x1; x++) {
    if (!inQuad(Q, { x: x + 0.5, y: y + 0.5 })) continue;
    const c = cls[y * mapSize + x];
    if (c !== TC.GROUND && c !== TC.PATCH) return 'not on buildable ground';
  }
  for (const r of roads) if (segQuadDist(r.a, r.b, Q) < r.hw) return 'a road runs over it';
  const R = quadOf(d, 0);
  for (const o of others) if (o.id !== d.id && quadsOverlap(R, quadOf(o, 0))) return 'overlaps another row';
  return '';
}

/** the rows grouped into lots: rows whose bay footprints come within LOT_JOIN tiles of each other share a lot (transitively); each lot's rows sorted
 *  by id, the lots sorted by their lowest id */
export function rowLots(rows: BayRowDef[]): BayRowDef[][] {
  const n = rows.length, par = rows.map((_, i) => i), Q = rows.map(r => quadOf(r, 0));
  const find = (i: number): number => { while (par[i] !== i) { par[i] = par[par[i]!]!; i = par[i]!; } return i; };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (quadDist(Q[i]!, Q[j]!) <= LOT_JOIN) par[find(i)] = find(j);
  const groups = new Map<number, BayRowDef[]>();
  rows.forEach((r, i) => { const k = find(i); let g = groups.get(k); if (!g) groups.set(k, g = []); g.push(r); });
  const lots = [...groups.values()];
  for (const g of lots) g.sort((p, q) => p.id - q.id);
  return lots.sort((p, q) => p[0]!.id - q[0]!.id);
}

/** the lot (its rows) as a car park for the City and the sim: id LOT_ID0 + its lowest row id, bays all its rows' bays, the entrance on the nearest
 *  ground road of length 6 or more with a bay centre within ROW_REACH of it: the projection of the lot's centre on that road, 2 tiles clear of its
 *  ends; pv the road's normal towards the lot; bays nearest the entrance first. Null if no road qualifies or the lot has no bays */
export function lotPark(net: RoadNetwork, rows: BayRowDef[]): CarPark | null {
  const bays: Bay[] = [];
  for (const r of rows) for (const b of rowBays(r)) bays.push(b);
  if (!bays.length) return null;
  let cx = 0, cy = 0;
  for (const b of bays) { cx += b.x; cy += b.y; }
  const c = { x: cx / bays.length, y: cy / bays.length };
  let best: { seg: Seg; u: Pt; e: Pt; d: number } | null = null;
  for (const s of net.segsNear(c, ROW_REACH + 40)) {
    if (s.kind !== SK.GROUND) continue;
    const L = vlen(sub(s.b, s.a));
    if (L < 6) continue;
    const d = pointSegDist(s.a, s.b, c);
    if (best && d >= best.d) continue;
    let near = Infinity;
    for (const b of bays) near = Math.min(near, pointSegDist(s.a, s.b, b));
    if (near > ROW_REACH) continue;
    const u = mul(sub(s.b, s.a), 1 / L), t = Math.min(L - 2, Math.max(2, dot(sub(c, s.a), u)));
    best = { seg: s, u, e: add(s.a, mul(u, t)), d };
  }
  if (!best) return null;
  // pv: the road's normal on the lot's side (square to the road, so the city's entrance sinks find the road running along it)
  const { seg, u, e } = best, n = perp(u), pv = dot(n, sub(c, e)) >= 0 ? n : mul(n, -1);
  bays.sort((p, q) => Math.hypot(p.x - e.x, p.y - e.y) - Math.hypot(q.x - e.x, q.y - e.y));
  let lo = Infinity;
  for (const r of rows) lo = Math.min(lo, r.id);
  return { id: LOT_ID0 + lo, x: e.x, y: e.y, w: 0, h: 0, side: 0, seg, entrances: [e], bays, pv };
}
