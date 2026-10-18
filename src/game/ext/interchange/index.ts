/** Highway interchange geometry generator (T004).
 *  Tiles are 2 m = 1 tile. Pure TS, no DOM.
 *  Each type is a set of ramps. A ramp is a list of anchors (point, unit tangent, optional height in m);
 *  anchors are joined by cubic Beziers that keep the tangents, so every ramp is G1 at its anchors.
 *  Heights change between height anchors with a parabolic-blend profile (linear middle, quadratic ends,
 *  25% blends), so the peak slope is 4/3 * rise / length.
 */
import type { Pt } from '../../network';

// ── types ──
export type InterchangeType = 'diamond' | 'parclo' | 'cloverleaf' | 'trumpet' | 'stack' | 'roundabout-interchange';
export interface RoadSpec { pts: Pt[]; lanes: number; oneWay: boolean }
/** kind: 'direct' ramp, 'loop' (left turn, 270 deg or U), 'fly' (flyover, >= 150 m), 'terminal' (diamond-style
 *  ramp that ends at an at-grade terminal on the other road; the turns are made at the terminal, `turn` is the main one). */
export interface Ramp { pts: Pt[]; z: number[]; from: 'A' | 'B'; to: 'A' | 'B'; turn: 'L' | 'R'; lanes: number; kind: 'direct' | 'loop' | 'fly' | 'terminal' | 'slip' }
/** ring: closed polyline of the roundabout centre line (roundabout-interchange only). */
export interface Interchange { type: InterchangeType; over: 'A' | 'B'; ramps: Ramp[]; footprint: Pt[]; ok: boolean; why: string; ring?: Pt[] }

// ── constants ──
const MPT = 2; // metres per tile
const LOOP_M = 50; // loops and ramp curves, metres
const FLY_M = 150; // flyovers, metres
const TAPER_T = 30; // merge/diverge taper, tiles (60 m): ramp arms at both ends are at least this long
const OVER_M = 7; // deck height of the over road, metres
const CLEAR_M = 7; // 5.5 m clearance + 1.5 m deck between levels that cross
const BLEND = 0.25; // share of each ramp's rise that is a parabolic blend at each end
const MAX_GRADE = 0.06;
const STEP_T = 4; // sample spacing, tiles (8 m)
const ARMS = [0.4, 0.55, 0.7, 0.85, 1.0, 1.2, 1.5, 1.9]; // Bezier arm lengths as a fraction of each chord
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
function bezier(P0: Pt, P1: Pt, P2: Pt, P3: Pt, out: Pt[]): void {
  const len = vlen(sub(P1, P0)) + vlen(sub(P2, P1)) + vlen(sub(P3, P2));
  const n = Math.max(8, Math.ceil(len / STEP_T));
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    out.push({ x: a * P0.x + b * P1.x + c * P2.x + d * P3.x, y: a * P0.y + b * P1.y + c * P2.y + d * P3.y });
  }
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
/** Parabolic-blend fraction: 0..1 height share at arc fraction t (linear middle, quadratic ends). */
function blendF(t: number): number {
  const b = BLEND;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (t < b) return (t * t) / (2 * b * (1 - b));
  if (t > 1 - b) return 1 - ((1 - t) * (1 - t)) / (2 * b * (1 - b));
  return (t - b / 2) / (1 - b);
}
/** Heights for a ramp: `keys` are (sample index, height in m) pairs, sorted; between keys the blend profile runs over arc length. */
function heights(pts: Pt[], keys: { i: number; z: number }[]): number[] {
  const s: number[] = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1]! + vlen(sub(pts[i]!, pts[i - 1]!)) * MPT);
  const z: number[] = new Array(pts.length).fill(keys[0]!.z);
  for (let k = 0; k + 1 < keys.length; k++) {
    const a = keys[k]!, b = keys[k + 1]!, L = s[b.i]! - s[a.i]!;
    for (let i = a.i; i <= b.i; i++) z[i] = a.z + (b.z - a.z) * (L > 0 ? blendF((s[i]! - s[a.i]!) / L) : 0);
  }
  for (let i = keys[keys.length - 1]!.i + 1; i < pts.length; i++) z[i] = keys[keys.length - 1]!.z;
  return z;
}

// ── ramps from anchors ──
interface Anc { p: Pt; t: Pt; z?: number; arm?: number }
/** Joins anchors with Beziers that keep each tangent; returns sampled points and heights, or the reason it failed.
 *  Anchors with a fixed circle arm keep it; the others search arm lengths at each end. */
function ramp(anc: Anc[], rMin: number, valid: (pts: Pt[], z: number[]) => boolean): { pts: Pt[]; z: number[] } | string {
  let why = 'no arm lengths fit';
  const n = anc.length;
  for (const k0 of ARMS) for (const k1 of ARMS) {
    const pts: Pt[] = [anc[0]!.p], idx: number[] = [0];
    for (let i = 0; i + 1 < n; i++) {
      const a = anc[i]!, b = anc[i + 1]!, ch = vlen(sub(b.p, a.p));
      const fixed = a.arm !== undefined && b.arm !== undefined;
      const arm0 = fixed ? a.arm! : Math.max(i === 0 ? Math.min(TAPER_T, 0.6 * ch) : 0, k0 * ch);
      const arm1 = fixed ? b.arm! : Math.max(i + 2 === n ? Math.min(TAPER_T, 0.6 * ch) : 0, k1 * ch);
      bezier(a.p, add(a.p, mul(a.t, arm0)), sub(b.p, mul(b.t, arm1)), b.p, pts);
      idx.push(pts.length - 1);
    }
    const rad = radiusM(pts);
    if (rad < rMin) { why = `radius ${rad.toFixed(0)} m < ${rMin}`; continue; }
    const keys = anc.flatMap((a, j) => (a.z === undefined ? [] : [{ i: idx[j]!, z: a.z }]));
    if (keys.length < 2 || keys[0]!.i !== 0 || keys[keys.length - 1]!.i !== pts.length - 1) return 'anchors need heights at both ends';
    const z = heights(pts, keys);
    const g = gradeOf(pts, z);
    if (g > MAX_GRADE) { why = `grade ${(g * 100).toFixed(1)}%`; continue; }
    if (!valid(pts, z)) { why = 'crosses a road at the same level'; continue; }
    return { pts, z };
  }
  return why;
}
/** Largest |dz| / ds between consecutive samples (ds in metres). */
function gradeOf(pts: Pt[], z: number[]): number {
  let g = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const ds = vlen(sub(pts[i + 1]!, pts[i]!)) * MPT;
    if (ds > 0.5) g = Math.max(g, Math.abs(z[i + 1]! - z[i]!) / ds);
  }
  return g;
}

// ── checks ──
/** Ramp-road and ramp-ramp crossings closer than CLEAR_M. Returns '' when clean. */
function clashes(ramps: { pts: Pt[]; z: number[] }[], LA: Line, LB: Line, zA: number, zB: number): string {
  const near = (p: Pt, pts: Pt[]) => pts.some(q => vlen(sub(p, q)) < 4);
  for (let i = 0; i < ramps.length; i++) {
    const r = ramps[i]!;
    for (let k = 0; k + 1 < r.pts.length; k++) {
      const p = r.pts[k]!, rr = sub(r.pts[k + 1]!, p);
      for (const [L, zr, nm] of [[LA, zA, 'A'], [LB, zB, 'B']] as const) for (let j = 0; j + 1 < L.pts.length; j++) {
        const h = segHit(p, rr, L.pts[j]!, sub(L.pts[j + 1]!, L.pts[j]!));
        if (!h || h.t <= 0.02 || h.t >= 0.98 || h.u < 0 || h.u > 1) continue;
        if ([r.pts[0]!, r.pts[r.pts.length - 1]!].some(q => vlen(sub(add(p, mul(rr, h.t)), q)) < 10)) continue;
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

// ── topologies ──
/** One ramp of a type before geometry: anchors, endpoints, kind, main turn. */
interface Spec { from: 'A' | 'B'; to: 'A' | 'B'; kind: Ramp['kind']; turn: 'L' | 'R'; anc: Anc[] }
const D_DIA = 100; // diamond and parclo: distance from the crossing to the diverge/merge on A, tiles
const D_PAR = 80; // parclo: distance on A to the diagonal ramps, tiles
const T_NEAR = 20; // diamond: near terminal on B, tiles off A
const T_FAR = 34; // diamond and parclo: far terminal on B, tiles off A
const R_LOOP = 40; // parclo loop radius, tiles (80 m)
const R_CLOVER = 52; // cloverleaf loop and direct radius, tiles (104 m)
const R_FLY = 120; // stack and trumpet flyover radius, tiles (240 m)
const NEED_T = 80; // corner arcs are at least 160 m, so a 7 m rise stays under 6%
const R_SLIP = 25; // roundabout ring radius, tiles (50 m)
const D_SLIP = 95; // roundabout slip ramps: distance on A to the diverge/merge, tiles

/** Frame of one crossing: ax(x, y) is a point at x along A (y to A's left), bt(y) the point on B at A-offset y. */
interface Frame {
  O: Pt; ax: (x: number, y?: number) => Pt; bt: (y: number) => Pt; bx: (s: number) => Pt;
  ua: Pt; na: Pt; ub: Pt; zA: number; zB: number;
}
/** Circle tangent to both roads in quadrant (sa, sb), radius r: centre, tangent points, and their angles in the (ua, na) frame. */
interface Circ { C: Pt; R: number; thA: number; thB: number; phi: number }
function circFor(F: Frame, sa: 1 | -1, sb: 1 | -1, r: number): Circ {
  const ea = mul(F.ua, sa), eb = mul(F.ub, sb);
  const phi = Math.acos(clamp(dot(ea, eb), -1, 1));
  const C = add(F.O, mul(unitV(add(ea, eb)), r / Math.sin(phi / 2)));
  const angOf = (dirP: Pt) => Math.atan2(dot(dirP, F.na), dot(dirP, F.ua));
  const PA = add(F.O, mul(ea, dot(sub(C, F.O), ea))), PB = add(F.O, mul(eb, dot(sub(C, F.O), eb)));
  return { C, R: r, thA: angOf(sub(PA, C)), thB: angOf(sub(PB, C)), phi };
}
const unitV = (a: Pt): Pt => mul(a, 1 / (vlen(a) || 1));
/** Signed angle from a to b, in (-pi, pi]. */
const angD = (a: number, b: number): number => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d <= -Math.PI) d += 2 * Math.PI; return d; };
/** Anchors along circle c from angle a0 sweeping `sw` radians in n steps; tangents follow the sweep. */
function arcAnc(F: Frame, c: Circ, a0: number, sw: number, n: number): Anc[] {
  const out: Anc[] = [];
  for (let i = 0; i <= n; i++) {
    const th = a0 + (sw * i) / n, cs = Math.cos(th), sn = Math.sin(th);
    const p = add(c.C, add(mul(F.ua, c.R * cs), mul(F.na, c.R * sn)));
    const t = unitV(add(mul(F.ua, -sn), mul(F.na, cs)));
    out.push({ p, t: mul(t, Math.sign(sw) || 1), arm: (4 / 3) * Math.tan(Math.abs(sw) / (4 * n)) * c.R });
  }
  return out;
}
/** 270-degree loop (long way round) leaving road `from` on its outward ray of quadrant (sa, sb). */
function loopSpec(F: Frame, sa: 1 | -1, sb: 1 | -1, r: number, from: 'A' | 'B', to: 'A' | 'B', turn: 'L' | 'R', mid?: { i: number; z: number }, kind: Ramp['kind'] = 'loop', noBump = false): Spec {
  const c = circFor(F, sa, sb, noBump ? r : Math.max(r, NEED_T / (Math.PI - circFor(F, sa, sb, r).phi)));
  const th0 = from === 'A' ? c.thA : c.thB;
  const want = from === 'A' ? mul(F.ua, sa) : mul(F.ub, sb);
  const tan0 = unitV(add(mul(F.ua, -Math.sin(th0)), mul(F.na, Math.cos(th0))));
  const sg = dot(want, tan0) >= 0 ? 1 : -1;
  const anc = arcAnc(F, c, th0, sg * (Math.PI + c.phi), 3);
  anc[0]!.z = from === 'A' ? F.zA : F.zB;
  anc[3]!.z = to === 'A' ? F.zA : F.zB;
  if (mid !== undefined) anc[mid.i]!.z = mid.z;
  return { from, to, kind, turn, anc };
}
/** Minor (corner) arc in quadrant (sa, sb), from road `from` to the other road, arriving on the other road's outward ray. */
function directSpec(F: Frame, sa: 1 | -1, sb: 1 | -1, r: number, from: 'A' | 'B', turn: 'L' | 'R'): Spec {
  const c = circFor(F, sa, sb, Math.max(r, NEED_T / (Math.PI - circFor(F, sa, sb, r).phi)));
  const th0 = from === 'A' ? c.thA : c.thB, th1 = from === 'A' ? c.thB : c.thA;
  const sw = angD(th0, th1);
  const anc = arcAnc(F, c, th0, sw, 2);
  anc[0]!.z = from === 'A' ? F.zA : F.zB;
  anc[2]!.z = from === 'A' ? F.zB : F.zA;
  return { from, to: from === 'A' ? 'B' : 'A', kind: 'direct', turn, anc };
}

function specsFor(type: InterchangeType, F: Frame): Spec[] {
  const { ax, bt, ua, na, zA, zB } = F;
  const m = (v: Pt) => mul(v, -1);
  if (type === 'diamond') return [
    { from: 'A', to: 'B', kind: 'terminal', turn: 'L', anc: [{ p: ax(-D_DIA), t: ua, z: zA }, { p: bt(T_NEAR), t: ua, z: zB }] },
    { from: 'B', to: 'A', kind: 'terminal', turn: 'R', anc: [{ p: bt(-T_FAR), t: ua, z: zB }, { p: ax(D_DIA + 20), t: ua, z: zA }] },
    { from: 'A', to: 'B', kind: 'terminal', turn: 'L', anc: [{ p: ax(D_DIA), t: m(ua), z: zA }, { p: bt(-T_NEAR), t: m(ua), z: zB }] },
    { from: 'B', to: 'A', kind: 'terminal', turn: 'R', anc: [{ p: bt(T_FAR), t: m(ua), z: zB }, { p: ax(-D_DIA - 20), t: m(ua), z: zA }] },
  ];
  if (type === 'parclo') return [
    loopSpec(F, 1, 1, R_LOOP, 'A', 'B', 'L', undefined, 'loop', true), loopSpec(F, -1, -1, R_LOOP, 'A', 'B', 'L', undefined, 'loop', true), // diagonally opposite loops off A
    { from: 'B', to: 'A', kind: 'terminal', turn: 'R', anc: [{ p: bt(-T_FAR), t: ua, z: zB }, { p: ax(D_PAR), t: ua, z: zA }] },
    { from: 'B', to: 'A', kind: 'terminal', turn: 'R', anc: [{ p: bt(T_FAR), t: m(ua), z: zB }, { p: ax(-D_PAR), t: m(ua), z: zA }] },
  ];
  if (type === 'cloverleaf') return [
    loopSpec(F, 1, 1, R_CLOVER, 'A', 'B', 'L'), loopSpec(F, -1, -1, R_CLOVER, 'A', 'B', 'L'),
    loopSpec(F, -1, 1, R_CLOVER, 'B', 'A', 'L'), loopSpec(F, 1, -1, R_CLOVER, 'B', 'A', 'L'),
    directSpec(F, 1, 1, R_CLOVER, 'B', 'R'), directSpec(F, -1, 1, R_CLOVER, 'B', 'R'),
    directSpec(F, -1, -1, R_CLOVER, 'B', 'R'), directSpec(F, 1, -1, R_CLOVER, 'B', 'R'),
  ];
  if (type === 'stack') return [
    loopSpec(F, 1, 1, R_FLY, 'A', 'B', 'L', { i: 2, z: 21 }, 'fly'), loopSpec(F, -1, -1, R_FLY, 'A', 'B', 'L', { i: 2, z: 21 }, 'fly'),
    loopSpec(F, -1, 1, R_FLY, 'B', 'A', 'L', { i: 1, z: 14 }, 'fly'), loopSpec(F, 1, -1, R_FLY, 'B', 'A', 'L', { i: 1, z: 14 }, 'fly'),
    directSpec(F, 1, 1, R_CLOVER, 'B', 'R'), directSpec(F, -1, 1, R_CLOVER, 'B', 'R'),
    directSpec(F, -1, -1, R_CLOVER, 'B', 'R'), directSpec(F, 1, -1, R_CLOVER, 'B', 'R'),
  ];
  if (type === 'trumpet') return [
    directSpec(F, 1, -1, R_CLOVER, 'A', 'R'), directSpec(F, 1, 1, R_CLOVER, 'B', 'R'),
    loopSpec(F, 1, 1, R_CLOVER, 'A', 'B', 'L'), loopSpec(F, 1, -1, R_FLY, 'A', 'B', 'L', undefined, 'fly'),
  ];
  // roundabout-interchange: ring at ground under A (over); four slips, each entering or leaving the ring at 45-degree points
  const ringAt = (deg: number): { p: Pt; t: Pt } => {
    const th = deg * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th);
    return { p: add(F.O, add(mul(ua, R_SLIP * cs), mul(na, R_SLIP * sn))), t: unitV(add(mul(ua, -sn), mul(na, cs))) };
  };
  const r225 = ringAt(225), r315 = ringAt(315), r45 = ringAt(45), r135 = ringAt(135);
  return [
    { from: 'A', to: 'B', kind: 'slip', turn: 'R', anc: [{ p: ax(-D_SLIP), t: ua, z: zA }, { p: r225.p, t: r225.t, z: zB }] },
    { from: 'B', to: 'A', kind: 'slip', turn: 'R', anc: [{ p: r315.p, t: r315.t, z: zB }, { p: ax(D_SLIP), t: ua, z: zA }] },
    { from: 'A', to: 'B', kind: 'slip', turn: 'R', anc: [{ p: ax(D_SLIP), t: m(ua), z: zA }, { p: r45.p, t: r45.t, z: zB }] },
    { from: 'B', to: 'A', kind: 'slip', turn: 'R', anc: [{ p: r135.p, t: r135.t, z: zB }, { p: ax(-D_SLIP), t: m(ua), z: zA }] },
  ];
}

/** Ramps for one crossing of road A and road B, or ok=false with the reason. */
function build(A: RoadSpec, B: RoadSpec, type: InterchangeType): Interchange {
  const LA = line(A.pts), LB = line(B.pts);
  let over: 'A' | 'B' = A.lanes >= B.lanes ? 'A' : 'B';
  if (type === 'stack' || type === 'trumpet') over = 'B';
  const X = findX(LA, LB);
  const fail = (why: string, pts: Pt[] = []): Interchange => ({ type, over, ramps: [], footprint: footprintOf(pts, 6), ok: false, why });
  if (!X) return fail('no crossing');
  const dA = at(LA, X.posA).dir, dB = at(LB, X.posB).dir;
  const angDeg = Math.acos(clamp(Math.abs(dot(dA, dB)), 0, 1)) * 180 / Math.PI;
  if (angDeg < ANG_MIN) return fail(`angle too acute ${angDeg.toFixed(1)}deg`, [X.O]);

  // positions outside a road's extent mean the topology does not fit on the roads
  let short = '';
  const along = (L: Line, pos: number, d: number, nm: string): Pt => {
    const q = pos + d;
    if (q < -1e-6 || q > L.total + 1e-6) short ||= `road ${nm} too short for ${type}`;
    return at(L, clamp(q, 0, L.total)).p;
  };
  const O = X.O, ua = dA, ub = dB, na = { x: -ua.y, y: ua.x };
  const ax = (x: number, y = 0): Pt => {
    if (Math.abs(y) < 1e-9) return along(LA, X.posA, x, 'A');
    return add(O, add(mul(ua, x), mul(na, y)));
  };
  const bx = (s: number): Pt => along(LB, X.posB, s, 'B');
  const bt = (y: number): Pt => bx(y / dot(ub, na));
  const F: Frame = { O, ax, bt, bx, ua, na, ub, zA: over === 'A' ? OVER_M : 0, zB: over === 'B' ? OVER_M : 0 };
  const specs = specsFor(type, F);
  for (const s of specs) for (const a of [s.anc[0]!, s.anc[s.anc.length - 1]!]) {
    const d = sub(a.p, O);
    if (Math.abs(cross(d, ua)) < 1e-6 && (X.posA + dot(d, ua) < -1e-6 || X.posA + dot(d, ua) > LA.total + 1e-6)) short ||= `road A too short for ${type}`;
    if (Math.abs(cross(d, ub)) < 1e-6 && (X.posB + dot(d, ub) < -1e-6 || X.posB + dot(d, ub) > LB.total + 1e-6)) short ||= `road B too short for ${type}`;
  }
  if (short) return fail(short, [O]);

  const ramps: Ramp[] = [];
  const pts: Pt[] = [O];
  for (const s of specs) {
    const r = ramp(s.anc, s.kind === 'fly' ? FLY_M : LOOP_M, (pts, z) => clashes([{ pts, z }], LA, LB, F.zA, F.zB) === '');
    if (typeof r === 'string') return fail(`${s.kind} ${s.from}->${s.to} ${r}`, pts);
    ramps.push({ pts: r.pts, z: r.z, from: s.from, to: s.to, turn: s.turn, lanes: 1, kind: s.kind });
    for (const p of r.pts) pts.push(p);
  }
  let ring: Pt[] | undefined;
  if (type === 'roundabout-interchange') {
    ring = [];
    for (let i = 0; i <= 48; i++) ring.push(add(O, add(mul(ua, R_SLIP * Math.cos(i * Math.PI / 24)), mul(na, R_SLIP * Math.sin(i * Math.PI / 24)))));
    for (const p of ring) pts.push(p);
  }
  const why = clashes(ramps, LA, LB, F.zA, F.zB);
  return { type, over, ramps, footprint: footprintOf(pts, 6), ok: why === '', why, ...(ring ? { ring } : {}) };
}

/** Ramps for one crossing of road A and road B, or ok=false with the reason. A trumpet whose stem is B is built with the roles swapped. */
export function makeInterchange(A: RoadSpec, B: RoadSpec, type: InterchangeType): Interchange {
  const X = findX(line(A.pts), line(B.pts));
  const atEnd = (L: Line, pos: number) => pos < 1e-6 || pos > L.total - 1e-6;
  const stemB = type === 'trumpet' && X !== null && !atEnd(line(A.pts), X.posA) && atEnd(line(B.pts), X.posB);
  if (!stemB) return build(A, B, type);
  const sw = (x: 'A' | 'B'): 'A' | 'B' => (x === 'A' ? 'B' : 'A');
  const r = build(B, A, type);
  return { ...r, over: sw(r.over), ramps: r.ramps.map(m => ({ ...m, from: sw(m.from), to: sw(m.to) })) };
}
