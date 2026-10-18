/** Grade separation: per-tile elevation profile for bridges over and tunnels under roads. Pure TS. */
import type { Pt } from '../../network';

/** Existing road segment to clear: centre line, and deck height in metres above the terrain (0 = ground road) */
export interface Crossing { a: Pt; b: Pt; deck: number /* m above terrain */ }

/** Elevation profile along a new route */
export interface Profile {
  /** distance along route in tiles (1 tile = 2 m), 0 = start */
  s: number[];
  /** height in metres (absolute, terrain + structure) */
  z: number[];
  /** kind per sample */
  kinds: ('ground' | 'ramp' | 'bridge' | 'tunnel')[];
  /** true when every ramp fits within the route and between crossings */
  ok: boolean;
  /** reason when not ok */
  why: string;
}

/** Bridge deck thickness (m): the bridge road surface sits this far above the underside of the upper deck */
export const DECK_THICKNESS = 1.5;
/** Default vertical curve constant: curve length (m) = K x |grade change (%)| */
export const CURVE_K = 15;
/** Level bridge span beyond each crossing (m): half the crossed road's width (4 m) plus a 2 m margin */
const BRIDGE_HALF = 6;
/** Minimum ground (m) between the ramps of two separate structures; closer ones merge into one bridge */
const MIN_GAP = 10;
const EPS = 1e-9;

/** Helpers */
const vlen = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

/** segment intersection of p1-p2 and q1-q2: interior only (excludes endpoints within EPS), returns point or null */
function segIntersect(p1: Pt, p2: Pt, q1: Pt, q2: Pt): Pt | null {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
  const d2x = q2.x - q1.x, d2y = q2.y - q1.y;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-12) return null;
  const w1x = q1.x - p1.x, w1y = q1.y - p1.y;
  const t = (w1x * d2y - w1y * d2x) / den;
  const u = (w1x * d1y - w1y * d1x) / den;
  // interior only: strictly inside (exclude endpoints)
  if (t <= EPS || t >= 1 - EPS || u <= EPS || u >= 1 - EPS) return null;
  return { x: p1.x + d1x * t, y: p1.y + d1y * t };
}

/** total length of polyline route in tiles, and leg data */
function routeInfo(route: Pt[]) {
  const legs: { a: Pt; b: Pt; len: number; cum0: number; cum1: number }[] = [];
  let L = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]!, b = route[i]!;
    const len = vlen(a, b);
    legs.push({ a, b, len, cum0: L, cum1: L + len });
    L += len;
  }
  return { legs, L };
}

/** point at distance s along route (tiles) */
function pointAt(route: Pt[], legs: ReturnType<typeof routeInfo>['legs'], L: number, s: number): Pt {
  if (s <= 0) return route[0]!;
  if (s >= L) return route[route.length - 1]!;
  for (const leg of legs) if (s >= leg.cum0 - 1e-9 && s <= leg.cum1 + 1e-9) {
    const t = leg.len < EPS ? 0 : (s - leg.cum0) / leg.len;
    return { x: leg.a.x + (leg.b.x - leg.a.x) * t, y: leg.a.y + (leg.b.y - leg.a.y) * t };
  }
  return route[route.length - 1]!;
}

/** distance along the route (tiles) of point pt, projected onto leg */
function legAt(leg: { a: Pt; b: Pt; len: number; cum0: number }, pt: Pt): number {
  const denom = leg.len * leg.len;
  if (denom <= EPS) return leg.cum0;
  const tt = ((pt.x - leg.a.x) * (leg.b.x - leg.a.x) + (pt.y - leg.a.y) * (leg.b.y - leg.a.y)) / denom;
  return leg.cum0 + Math.max(0, Math.min(1, tt)) * leg.len;
}

/** crossingsOf: find where route crosses existing roads */
export function crossingsOf(route: Pt[], roads: { a: Pt; b: Pt; deck: number }[]): { at: number; deck: number }[] {
  if (route.length < 2) return [];
  const { legs } = routeInfo(route);
  const out: { at: number; deck: number }[] = [];
  for (const road of roads) {
    for (const leg of legs) {
      const pt = segIntersect(leg.a, leg.b, road.a, road.b);
      if (pt) out.push({ at: legAt(leg, pt), deck: road.deck });
    }
  }
  out.sort((a, b) => a.at - b.at);
  return out;
}

/** One ramp on one side of a structure. Distances in metres from the side's route end (the bridge is at D).
 *  Ground-following up to x0, then a grade that changes with parabolic vertical curves: g0 -> Gs over LA, level Gs
 *  over P, Gs -> 0 over LC at the bridge. lin = straight fallback that does not fit (not ok). */
interface Side {
  x0: number; z0: number; g0: number; Gs: number; LA: number; P: number; LC: number;
  lin: boolean; slope: number;
  /** average grade (fraction) the straight fallback needs; Infinity when there is no room at all */
  need: number;
}

/** Height at distance x (m from the side's route end) on a side's ramp */
function sideZ(sd: Side, x: number): number {
  if (sd.lin) return sd.z0 + sd.slope * x;
  const v = x - sd.x0;
  if (v <= sd.LA) return sd.z0 + sd.g0 * v + (sd.LA > EPS ? (sd.Gs - sd.g0) * v * v / (2 * sd.LA) : 0);
  const zA = sd.z0 + (sd.g0 + sd.Gs) * sd.LA / 2;
  if (v <= sd.LA + sd.P) return zA + sd.Gs * (v - sd.LA);
  const w = Math.min(v - sd.LA - sd.P, sd.LC);
  return zA + sd.Gs * sd.P + (sd.LC > EPS ? sd.Gs * (w - w * w / (2 * sd.LC)) : 0);
}

/** Ramp starting on the ground at x0 with grade Gs (sign = climb or fall towards the bridge) that lands exactly on T at D.
 *  Returns the largest x0 (shortest ramp) that fits, or null. The terrain slope at x0 (slopeAt) sets the first curve. */
function rampFor(gU: (x: number) => number, slopeAt: (x: number) => number, D: number, T: number, Gs: number, K: number): Side | null {
  const LC = K * 100 * Math.abs(Gs);
  const probe = (x0: number) => {
    const z0 = gU(x0), g0 = slopeAt(x0);
    const LA = K * 100 * Math.abs(Gs - g0);
    const P = D - x0 - LA - LC;
    const F = z0 + (g0 + Gs) * LA / 2 + Gs * P + Gs * LC / 2 - T;
    return { F, P, z0, g0, LA };
  };
  const h = Math.max(0.5, D / 400);
  const n = Math.ceil(D / h);
  let prevX = 0, prevF = 0, havePrev = false;
  for (let i = 0; i <= n; i++) {
    const x0 = Math.max(0, D - i * h);
    const p = probe(x0);
    if (p.P < -EPS) { havePrev = false; continue; }
    if (havePrev && p.F * prevF <= 0) {
      let lo = x0, flo = p.F, hi = prevX;
      for (let k = 0; k < 60; k++) {
        const mid = (lo + hi) / 2, fm = probe(mid).F;
        if (fm * flo <= 0) hi = mid; else { lo = mid; flo = fm; }
      }
      const x = (lo + hi) / 2;
      const q = probe(x);
      if (q.P < -1e-6) return null;
      return { x0: x, z0: q.z0, g0: q.g0, Gs, LA: q.LA, P: Math.max(0, q.P), LC, lin: false, slope: 0, need: 0 };
    }
    prevX = x0; prevF = p.F; havePrev = true;
  }
  return null;
}

/** Side ramp to a level bridge at T, D metres from the route end. Tries plateau grades from -G to +G (uphill and downhill
 *  approaches differ, so a gentler plateau can fit where the full grade cannot) and keeps the shortest ramp that fits.
 *  If none fits, falls back to a straight line from the ground at the route end to T at D (not ok). */
function solveSide(gU: (x: number) => number, slopeAt: (x: number) => number, D: number, T: number, G: number, K: number): Side {
  if (D > EPS) {
    let best: Side | null = null;
    const steps = 12;
    for (let j = -steps; j <= steps; j++) {
      const sd = rampFor(gU, slopeAt, D, T, G * j / steps, K);
      if (sd && (!best || sd.x0 > best.x0)) best = sd;
    }
    if (best) return best;
  }
  const z0 = gU(0);
  const slope = D > EPS ? (T - z0) / D : 0;
  return { x0: 0, z0, g0: 0, Gs: 0, LA: 0, P: 0, LC: 0, lin: true, slope, need: D > EPS ? Math.abs(slope) : Infinity };
}

/** One bridge or tunnel: the crossings it clears, its road height T, and the ramps on each side */
interface Group {
  infos: { d: number; T: number }[];
  d0: number; d1: number; T: number; bL: number; bR: number;
  left: Side; right: Side;
}

/** planProfile: elevation profile with clearance, grade limits and vertical curves (K m per %), bridges or tunnels.
 *  Ramps are worked out against the terrain along the route, each side separately. A structure that cannot fit falls back
 *  to a straight clamp that still clears its crossings, with ok=false and the average grade it would need. */
export function planProfile(
  route: Pt[],
  crossings: Crossing[],
  ground: (x: number, y: number) => number,
  opts: { over: boolean; maxGrade: number; clearance?: number; k?: number },
): Profile {
  const clearance = opts.clearance ?? (opts.over ? 5.5 : 6);
  const G = opts.maxGrade;
  const K = opts.k ?? CURVE_K;

  if (route.length < 2) {
    return { s: [0], z: [ground(route[0]!.x, route[0]!.y)], kinds: ['ground'], ok: false, why: 'route too short' };
  }

  const { legs, L } = routeInfo(route);
  const M = 2 * L; // route length in metres
  const groundS = (s: number) => { const p = pointAt(route, legs, L, s); return ground(p.x, p.y); };
  const gAt = (d: number) => groundS(Math.min(Math.max(d, 0), M) / 2); // terrain height at route distance d (m)
  const slopeOf = (g: (x: number) => number) => (x: number) => {
    const a = Math.max(0, x - 1), b = Math.min(M, x + 1);
    return b > a ? (g(b) - g(a)) / (b - a) : 0;
  };

  // crossing points (route m) and the height the new road must have there
  const infos: { d: number; T: number }[] = [];
  const add = (at: number, deck: number) => {
    const S = groundS(at) + deck; // crossed road surface: terrain plus its deck
    infos.push({ d: 2 * at, T: opts.over ? S + clearance + DECK_THICKNESS : S - clearance });
  };
  for (const c of crossings as (Crossing & { at?: number })[]) {
    if (typeof c.at === 'number') add(c.at, c.deck);
    else for (const leg of legs) {
      const pt = segIntersect(leg.a, leg.b, c.a, c.b);
      if (pt) add(legAt(leg, pt), c.deck);
    }
  }
  infos.sort((a, b) => a.d - b.d);

  const make = (list: { d: number; T: number }[]): Group => {
    const d0 = list[0]!.d, d1 = list[list.length - 1]!.d;
    const T = opts.over ? Math.max(...list.map(i => i.T)) : Math.min(...list.map(i => i.T));
    const bL = Math.max(0, d0 - BRIDGE_HALF), bR = Math.min(M, d1 + BRIDGE_HALF);
    const gL = (x: number) => gAt(x);
    const gR = (x: number) => gAt(M - x);
    return {
      infos: list, d0, d1, T, bL, bR,
      left: solveSide(gL, slopeOf(gL), bL, T, G, K),
      right: solveSide(gR, slopeOf(gR), M - bR, T, G, K),
    };
  };

  // one group per crossing, then merge neighbours whose ramps would meet (or leave less than MIN_GAP of ground)
  const groups: Group[] = infos.map(i => make([i]));
  let merged = true;
  while (merged) {
    merged = false;
    for (let k = 0; k + 1 < groups.length; k++) {
      const a = groups[k]!, b = groups[k + 1]!;
      const aRampEnd = M - a.right.x0; // route m where a's right ramp meets the ground
      const bRampStart = b.left.x0; // route m where b's left ramp leaves the ground
      if (bRampStart - aRampEnd < MIN_GAP) {
        groups.splice(k, 2, make([...a.infos, ...b.infos]));
        merged = true;
        break;
      }
    }
  }

  const fails: string[] = [];
  const needText = (sd: Side) => Number.isFinite(sd.need) ? `${(sd.need * 100).toFixed(1)}% average grade` : 'a vertical step';
  for (const g of groups) {
    if (g.left.lin) fails.push(`crossing at ${(g.d0 / 2).toFixed(1)} tiles too close to start (needs ${needText(g.left)}, max ${(G * 100).toFixed(1)}%)`);
    if (g.right.lin) fails.push(`crossing at ${(g.d1 / 2).toFixed(1)} tiles too close to end (needs ${needText(g.right)}, max ${(G * 100).toFixed(1)}%)`);
  }
  const ok = fails.length === 0;
  const why = fails.join('; ');

  // per-tile samples along the route
  const s: number[] = [];
  for (let sv = 0; sv < L - 1e-9; sv++) s.push(sv);
  s.push(L);
  const z: number[] = [];
  const kinds: Profile['kinds'] = [];
  for (const sv of s) {
    const d = 2 * sv;
    let zz = gAt(d);
    let kind: Profile['kinds'][number] = 'ground';
    for (const g of groups) {
      if (d < g.left.x0 - EPS) break; // before this structure's ramp: ground
      if (d <= g.bL + EPS) { zz = sideZ(g.left, d); kind = 'ramp'; break; }
      if (d <= g.bR + EPS) { zz = g.T; kind = opts.over ? 'bridge' : 'tunnel'; break; }
      if (d <= M - g.right.x0 + EPS) { zz = sideZ(g.right, M - d); kind = 'ramp'; break; }
    }
    z.push(zz);
    kinds.push(kind);
  }

  return { s, z, kinds, ok, why };
}
