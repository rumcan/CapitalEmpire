/** Highway interchange geometry generator (T004).
 *  Tiles are 2 m = 1 tile. Pure TS, no DOM.
 *  Each movement is a cubic Bezier tangent to its two roads; its height follows a smoothstep over arc length,
 *  so the grade is at most 1.5 * rise / length (kept under 6%). Radii are checked on the sampled curve.
 */
import type { Pt } from '../../network';

// ── types ──
export type InterchangeType = 'diamond' | 'parclo' | 'cloverleaf' | 'trumpet' | 'stack' | 'roundabout-interchange';
export interface RoadSpec { pts: Pt[]; lanes: number; oneWay: boolean }
export interface Ramp { pts: Pt[]; z: number[]; from: 'A' | 'B'; to: 'A' | 'B'; turn: 'L' | 'R'; lanes: number }
export interface Interchange { type: InterchangeType; over: 'A' | 'B'; ramps: Ramp[]; footprint: Pt[]; ok: boolean; why: string }

// ── constants ──
const MPT = 2; // metres per tile
const LOOP_M = 50; // loops and ordinary ramp curves, metres
const FLY_M = 150; // flyovers (stack and trumpet semi-direct), metres
const TAPER_T = 30; // merge/diverge taper, tiles (60 m): ramp arms at both ends are at least this long
const WEAVE_T = 75; // weaving distance between loop nodes on one road, tiles (150 m)
const OVER_M = 7; // deck height of the over road above the under road, metres
const CLEAR_M = 7; // 5.5 m clearance + 1.5 m deck between levels that cross
const MAX_GRADE = 0.06;
const LREQ_M = (1.5 * OVER_M) / MAX_GRADE * 1.02; // arc length that keeps a 7 m rise under 6% with smoothstep
const STEP_T = 4; // sample spacing, tiles (8 m)
const ARMS = [0.4, 0.6, 0.8, 1.0, 1.3, 1.7, 2.2]; // Bezier arm lengths as a fraction of the chord
const ANG_MIN = 25; // degrees, below this the crossing is too acute for the generator

// ── vec helpers ──
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const dot = (a: Pt, b: Pt): number => a.x * b.x + a.y * b.y;
const cross = (a: Pt, b: Pt): number => a.x * b.y - a.y * b.x;
const vlen = (a: Pt): number => Math.hypot(a.x, a.y);
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

// ── polylines ──
interface Line { pts: Pt[]; cum: number[]; total: number }
/** Arc-length table for a polyline. */
function line(pts: Pt[]): Line {
  const cum = [0];
  for (let i = 0; i + 1 < pts.length; i++) cum.push(cum[i]! + vlen(sub(pts[i + 1]!, pts[i]!)));
  return { pts, cum, total: cum[cum.length - 1]! };
}
/** Point and unit direction at arc length d (clamped to the line). */
function at(L: Line, d: number): { p: Pt; dir: Pt } {
  const x = clamp(d, 0, L.total);
  let i = 0;
  while (i + 2 < L.pts.length && x > L.cum[i + 1]!) i++;
  const a = L.pts[i]!, b = L.pts[i + 1]!, len = L.cum[i + 1]! - L.cum[i]!;
  if (len < 1e-9) return { p: a, dir: { x: 1, y: 0 } };
  const t = clamp((x - L.cum[i]!) / len, 0, 1);
  return { p: lerp(a, b, t), dir: mul(sub(b, a), 1 / len) };
}
/** Parametric intersection of p + t r with q + u s. Null when parallel. */
function segHit(p: Pt, r: Pt, q: Pt, s: Pt): { t: number; u: number } | null {
  const den = cross(r, s);
  if (Math.abs(den) < 1e-12) return null;
  const w = sub(q, p);
  return { t: cross(w, s) / den, u: cross(w, r) / den };
}
/** Closest point of a line to p, if within 1.5 tiles. */
function nearOn(L: Line, p: Pt): { pos: number; q: Pt } | null {
  let best: { d: number; pos: number; q: Pt } | null = null;
  for (let j = 0; j + 1 < L.pts.length; j++) {
    const a = L.pts[j]!, len = L.cum[j + 1]! - L.cum[j]!;
    if (len < 1e-9) continue;
    const dir = mul(sub(L.pts[j + 1]!, a), 1 / len);
    const t = clamp(dot(sub(p, a), dir), 0, len);
    const q = add(a, mul(dir, t)), d = vlen(sub(p, q));
    if (d < 1.5 && (!best || d < best.d)) best = { d, pos: L.cum[j]! + t, q };
  }
  return best ? { pos: best.pos, q: best.q } : null;
}
interface Xing { O: Pt; posA: number; posB: number }
/** Where road A and road B meet: a true crossing, or a T when one road ends on the other. */
function findX(A: Line, B: Line): Xing | null {
  for (let i = 0; i + 1 < A.pts.length; i++) for (let j = 0; j + 1 < B.pts.length; j++) {
    const ra = sub(A.pts[i + 1]!, A.pts[i]!), rb = sub(B.pts[j + 1]!, B.pts[j]!);
    const hit = segHit(A.pts[i]!, ra, B.pts[j]!, rb);
    if (!hit || hit.t < -1e-6 || hit.t > 1 + 1e-6 || hit.u < -1e-6 || hit.u > 1 + 1e-6) continue;
    const t = clamp(hit.t, 0, 1), u = clamp(hit.u, 0, 1);
    return { O: lerp(A.pts[i]!, A.pts[i + 1]!, t), posA: A.cum[i]! + t * (A.cum[i + 1]! - A.cum[i]!), posB: B.cum[j]! + u * (B.cum[j + 1]! - B.cum[j]!) };
  }
  for (const e of [A.pts[0]!, A.pts[A.pts.length - 1]!]) {
    const r = nearOn(B, e);
    if (r) return { O: r.q, posA: e === A.pts[0]! ? 0 : A.total, posB: r.pos };
  }
  for (const e of [B.pts[0]!, B.pts[B.pts.length - 1]!]) {
    const r = nearOn(A, e);
    if (r) return { O: r.q, posA: r.pos, posB: e === B.pts[0]! ? 0 : B.total };
  }
  return null;
}

// ── curve measures (metres unless noted) ──
/** Cubic Bezier sampled about every STEP_T tiles. */
function bezier(P0: Pt, P1: Pt, P2: Pt, P3: Pt): Pt[] {
  const len = vlen(sub(P1, P0)) + vlen(sub(P2, P1)) + vlen(sub(P3, P2));
  const n = Math.max(8, Math.ceil(len / STEP_T));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    out.push({ x: a * P0.x + b * P1.x + c * P2.x + d * P3.x, y: a * P0.y + b * P1.y + c * P2.y + d * P3.y });
  }
  return out;
}
/** Smallest circumradius of consecutive triples, metres. */
function radiusM(pts: Pt[]): number {
  let r = Infinity;
  for (let i = 0; i + 2 < pts.length; i++) {
    const a = pts[i]!, b = pts[i + 1]!, c = pts[i + 2]!;
    const ar = Math.abs(cross(sub(b, a), sub(c, a)));
    if (ar < 1e-12) continue;
    const R = (vlen(sub(b, a)) * vlen(sub(c, b)) * vlen(sub(c, a))) / (2 * ar);
    if (R < r) r = R;
  }
  return r * MPT;
}
/** Polyline length, metres. */
function lenM(pts: Pt[]): number {
  let l = 0;
  for (let i = 0; i + 1 < pts.length; i++) l += vlen(sub(pts[i + 1]!, pts[i]!));
  return l * MPT;
}
/** Heights from z0 to z1 along arc length, smoothstep (zero slope at both ends). */
function profile(pts: Pt[], z0: number, z1: number): number[] {
  const L = lenM(pts), z: number[] = [];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) s += vlen(sub(pts[i]!, pts[i - 1]!)) * MPT;
    const t = L > 0 ? clamp(s / L, 0, 1) : 0;
    z.push(z0 + (z1 - z0) * t * t * (3 - 2 * t));
  }
  return z;
}

// ── movements ──
interface Mv { from: 'A' | 'B'; f: 1 | -1; to: 'A' | 'B'; g: 1 | -1; kind: 'direct' | 'loop' | 'fly' }
/** True when x is closer than WEAVE_T to a node already used on the same road (identical nodes are shared, allowed). */
const tooClose = (used: number[], x: number): boolean => used.some(u => Math.abs(u - x) > 1e-6 && Math.abs(u - x) < WEAVE_T);
/** One ramp from road `LF` (crossing at posF, traffic direction f) to road `LT` (posT, direction g).
 *  `used` holds the node positions (tiles along each road) already taken; loops keep WEAVE_T clear of them. */
function buildRamp(LF: Line, posF: number, LT: Line, posT: number, m: Mv, used: Record<'A' | 'B', number[]>): { pts: Pt[]; p: number; q: number } | { why: string } {
  const rMin = m.kind === 'fly' ? FLY_M : LOOP_M;
  const base = m.kind === 'fly' ? 60 : m.kind === 'loop' ? 40 : 25;
  for (let ds = base; ; ds += 4) {
    const p = posF - m.f * ds, q = posT + m.g * ds;
    if (p < 0 || p > LF.total || q < 0 || q > LT.total) return { why: `${m.kind} ${m.from}->${m.to} does not fit on the roads (${m.kind === 'fly' ? 'flyover' : 'ramp'} needs ${m.kind === 'fly' ? 150 : 50} m radius)` };
    if (m.kind === 'loop' && (tooClose(used[m.from], p) || tooClose(used[m.to], q))) continue;
    const F = at(LF, p), T = at(LT, q);
    const P0 = F.p, t0 = mul(F.dir, m.f), P3 = T.p, t3 = mul(T.dir, m.g);
    const ch = vlen(sub(P3, P0));
    for (const k of ARMS) {
      const arm = Math.max(TAPER_T, k * ch);
      const pts = bezier(P0, add(P0, mul(t0, arm)), sub(P3, mul(t3, arm)), P3);
      if (radiusM(pts) >= rMin && lenM(pts) >= LREQ_M) return { pts, p, q };
    }
  }
}

// ── checks ──
/** Crossings between ramps and roads, and between ramps, closer than CLEAR_M. Returns '' when clean. */
function clashes(ramps: Ramp[], LA: Line, LB: Line, zA: number, zB: number): string {
  const near = (p: Pt, pts: Pt[]) => pts.some(q => vlen(sub(p, q)) < 4);
  for (let i = 0; i < ramps.length; i++) {
    const r = ramps[i]!;
    for (let k = 0; k + 1 < r.pts.length; k++) {
      const p = r.pts[k]!, rr = sub(r.pts[k + 1]!, p);
      for (const [L, zr, nm] of [[LA, zA, 'A'], [LB, zB, 'B']] as const) for (let j = 0; j + 1 < L.pts.length; j++) {
        const h = segHit(p, rr, L.pts[j]!, sub(L.pts[j + 1]!, L.pts[j]!));
        if (!h || h.t <= 0.02 || h.t >= 0.98 || h.u < 0 || h.u > 1) continue;
        const hp = add(p, mul(rr, h.t));
        if (near(hp, [r.pts[0]!, r.pts[r.pts.length - 1]!])) continue;
        const zc = r.z[k]! + (r.z[k + 1]! - r.z[k]!) * h.t;
        if (Math.abs(zc - zr) < CLEAR_M) return `ramp ${i} crosses road ${nm} at the same level`;
      }
    }
  }
  for (let i = 0; i < ramps.length; i++) for (let j = i + 1; j < ramps.length; j++) {
    const a = ramps[i]!, b = ramps[j]!;
    const ends = [a.pts[0]!, a.pts[a.pts.length - 1]!, b.pts[0]!, b.pts[b.pts.length - 1]!];
    for (let k = 0; k + 1 < a.pts.length; k++) for (let l = 0; l + 1 < b.pts.length; l++) {
      const p = a.pts[k]!, rr = sub(a.pts[k + 1]!, p), q = b.pts[l]!, ss = sub(b.pts[l + 1]!, q);
      const h = segHit(p, rr, q, ss);
      if (!h || h.t <= 0.02 || h.t >= 0.98 || h.u <= 0.02 || h.u >= 0.98) continue;
      const hp = add(p, mul(rr, h.t));
      if (near(hp, ends) && near(hp, [a.pts[0]!, a.pts[a.pts.length - 1]!]) && near(hp, [b.pts[0]!, b.pts[b.pts.length - 1]!])) continue;
      const za = a.z[k]! + (a.z[k + 1]! - a.z[k]!) * h.t, zb = b.z[l]! + (b.z[l + 1]! - b.z[l]!) * h.u;
      if (Math.abs(za - zb) < CLEAR_M) return `ramps ${i} and ${j} cross at the same level`;
    }
  }
  return '';
}
/** Axis-aligned rectangle around the points, padded by `pad` tiles. */
function footprintOf(pts: Pt[], pad: number): Pt[] {
  if (pts.length === 0) return [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
}

// ── main ──
/** Kind of a movement for a type. `left` = the ramp turns left (crosses the other road's side). */
function kindOf(type: InterchangeType, m: Mv, left: boolean): Mv['kind'] {
  if (type === 'trumpet') return 'fly';
  if (type === 'stack') return left ? 'fly' : 'direct';
  if (type === 'cloverleaf') return left ? 'loop' : 'direct';
  if (type === 'parclo') return m.from === 'A' && m.f === m.g ? 'loop' : 'direct';
  if (type === 'roundabout-interchange') return 'loop';
  return 'direct';
}

/** Ramps for one crossing of road A and road B, or ok=false with the reason. */
export function makeInterchange(A: RoadSpec, B: RoadSpec, type: InterchangeType): Interchange {
  const LA = line(A.pts), LB = line(B.pts);
  const over: 'A' | 'B' = A.lanes >= B.lanes ? 'A' : 'B';
  const fail = (why: string, ramps: Ramp[] = [], pts: Pt[] = []): Interchange => ({ type, over, ramps, footprint: footprintOf(pts, 6), ok: false, why });
  const X = findX(LA, LB);
  if (!X) return fail('no crossing');
  const L = { A: LA, B: LB }, pos = { A: X.posA, B: X.posB }, spec = { A, B };
  const dir = { A: at(LA, X.posA).dir, B: at(LB, X.posB).dir };
  const angDeg = Math.acos(clamp(Math.abs(dot(dir.A, dir.B)), 0, 1)) * 180 / Math.PI;
  if (angDeg < ANG_MIN && type !== 'trumpet') return fail(`angle too acute ${angDeg.toFixed(1)}deg`, [], [X.O]);

  const moves: Mv[] = [];
  for (const from of ['A', 'B'] as const) for (const f of [1, -1] as const) for (const to of ['A', 'B'] as const) {
    if (to === from) continue;
    for (const g of [1, -1] as const) {
      if (spec[from].oneWay && f !== 1) continue;
      if (spec[to].oneWay && g !== 1) continue;
      const tf = mul(dir[from], f), tt = mul(dir[to], g);
      if (pos[from] - f * 0.5 < 0 || pos[from] - f * 0.5 > L[from].total) continue;
      if (pos[to] + g * 0.5 < 0 || pos[to] + g * 0.5 > L[to].total) continue;
      const left = cross(tf, tt) > 0;
      const m: Mv = { from, f, to, g, kind: 'direct' };
      m.kind = kindOf(type, m, left);
      moves.push(m);
    }
  }
  if (moves.length === 0) return fail('no movement fits on these roads', [], [X.O]);

  // direct and flyover ramps first, loops last so they can keep WEAVE_T from every node already taken
  moves.sort((a, b) => (a.kind === 'loop' ? 1 : 0) - (b.kind === 'loop' ? 1 : 0));
  const used: Record<'A' | 'B', number[]> = { A: [], B: [] };
  const ramps: Ramp[] = [];
  const pts: Pt[] = [X.O];
  for (const m of moves) {
    const b = buildRamp(L[m.from], pos[m.from], L[m.to], pos[m.to], m, used);
    if ('why' in b) return fail(b.why, ramps, pts);
    used[m.from].push(b.p); used[m.to].push(b.q);
    const zF = m.from === over ? OVER_M : 0, zT = m.to === over ? OVER_M : 0;
    const z = profile(b.pts, zF, zT);
    const turn: 'L' | 'R' = cross(mul(dir[m.from], m.f), mul(dir[m.to], m.g)) > 0 ? 'L' : 'R';
    ramps.push({ pts: b.pts, z, from: m.from, to: m.to, turn, lanes: 1 });
    for (const p of b.pts) pts.push(p);
  }
  const why = clashes(ramps, LA, LB, over === 'A' ? OVER_M : 0, over === 'B' ? OVER_M : 0);
  return { type, over, ramps, footprint: footprintOf(pts, 6), ok: why === '', why };
}
