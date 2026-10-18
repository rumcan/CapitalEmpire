/** Grade separation: per-tile elevation profile for bridges over and tunnels under roads. Pure TS. */
import type { Pt } from '../../network';

/** Existing road segment to clear (centre line and deck height in metres) */
export interface Crossing { a: Pt; b: Pt; deck: number /* m */ }

/** Elevation profile along a new route */
export interface Profile {
  /** distance along route in tiles (1 tile = 2 m), 0 = start */
  s: number[];
  /** height in metres (absolute, terrain + structure) */
  z: number[];
  /** kind per sample */
  kinds: ('ground' | 'ramp' | 'bridge' | 'tunnel')[];
  /** true when ramps fit within route and between crossings */
  ok: boolean;
  /** reason when not ok */
  why: string;
}

/** Helpers */
const EPS = 1e-9;
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

/** crossingsOf: find where route crosses existing roads */
export function crossingsOf(route: Pt[], roads: { a: Pt; b: Pt; deck: number }[]): { at: number; deck: number }[] {
  if (route.length < 2) return [];
  const { legs } = routeInfo(route);
  const out: { at: number; deck: number }[] = [];
  for (const road of roads) {
    for (const leg of legs) {
      const pt = segIntersect(leg.a, leg.b, road.a, road.b);
      if (!pt) continue;
      // Use projection t along leg: dot(pt - leg.a, leg.b - leg.a)/len^2
      const denom = leg.len * leg.len;
      let tt = 0;
      if (denom > EPS) {
        const apx = pt.x - leg.a.x, apy = pt.y - leg.a.y;
        const abx = leg.b.x - leg.a.x, aby = leg.b.y - leg.a.y;
        tt = (apx * abx + apy * aby) / denom;
      }
      tt = Math.max(0, Math.min(1, tt));
      const at = leg.cum0 + tt * leg.len;
      out.push({ at, deck: road.deck });
    }
  }
  out.sort((a, b) => a.at - b.at);
  return out;
}

/** ramp length in tiles for rise (m) at maxGrade (fraction, e.g. 0.06) */
function rampTiles(riseM: number, maxGrade: number): number {
  if (Math.abs(riseM) < 1e-9) return 0;
  return Math.abs(riseM) / (maxGrade * 2);
}

/** planProfile: elevation profile with clearance and grade limits, vertical curves */
export function planProfile(
  route: Pt[],
  crossings: Crossing[],
  ground: (x: number, y: number) => number,
  opts: { over: boolean; maxGrade: number; clearance?: number },
): Profile {
  const clearance = opts.clearance ?? (opts.over ? 5.5 : 6);
  const maxGrade = opts.maxGrade;
  const overhang = 3; // tiles each side of crossing to fully span road width
  const minGap = 5; // tiles of ground needed between separate bridges
  const Vc = 4; // vertical curve total length in tiles (both ends combined)

  if (route.length < 2) {
    return { s: [0], z: [ground(route[0]!.x, route[0]!.y)], kinds: ['ground'], ok: false, why: 'route too short' };
  }

  const { legs, L } = routeInfo(route);
  const pointAtFn = (s: number) => pointAt(route, legs, L, s);
  const groundAt = (s: number) => {
    const p = pointAtFn(s);
    return ground(p.x, p.y);
  };

  // Find at positions for each crossing (if not already resolved)
  type CInfo = { at: number; deck: number; target: number; rise: number; need: number; raw: Crossing };
  const infos: CInfo[] = [];
  for (const c of crossings as unknown as (Crossing & { at?: number })[]) {
    if (typeof (c as unknown as { at: number }).at === 'number') {
      const at = (c as unknown as { at: number }).at;
      const deck = (c as Crossing).deck ?? (c as unknown as { deck: number }).deck ?? 0;
      const target = opts.over ? deck + clearance : deck - clearance;
      const g = groundAt(at);
      const rise = target - g;
      const need = rampTiles(rise, maxGrade) + Vc / 2; // include vertical curve allowance
      infos.push({ at, deck, target, rise, need, raw: c as Crossing });
    } else {
      // compute intersections for this crossing segment
      const cross = c as Crossing;
      for (const leg of legs) {
        const pt = segIntersect(leg.a, leg.b, cross.a, cross.b);
        if (!pt) continue;
        const denom = leg.len * leg.len;
        let tt = 0;
        if (denom > EPS) {
          const apx = pt.x - leg.a.x, apy = pt.y - leg.a.y;
          const abx = leg.b.x - leg.a.x, aby = leg.b.y - leg.a.y;
          tt = (apx * abx + apy * aby) / denom;
        }
        tt = Math.max(0, Math.min(1, tt));
        const at = leg.cum0 + tt * leg.len;
        const deck = cross.deck;
        const target = opts.over ? deck + clearance : deck - clearance;
        const g = groundAt(at);
        const rise = target - g;
        const need = rampTiles(rise, maxGrade) + Vc / 2;
        infos.push({ at, deck, target, rise, need, raw: cross });
      }
    }
  }
  infos.sort((a, b) => a.at - b.at);

  // Handle no crossings: ground-following profile
  if (!infos.length) {
    const s: number[] = [];
    const z: number[] = [];
    const kinds: Profile['kinds'] = [];
    const n = Math.ceil(L);
    for (let i = 0; i <= n; i++) {
      const sv = i < n ? i : L;
      if (sv > L + 1e-9) break;
      s.push(sv);
      z.push(groundAt(sv));
      kinds.push('ground');
      if (sv >= L - 1e-9) break;
    }
    // ensure last point exactly L
    if (Math.abs(s[s.length - 1]! - L) > 1e-9) {
      s.push(L);
      z.push(groundAt(L));
      kinds.push('ground');
    }
    return { s, z, kinds, ok: true, why: '' };
  }

  // Group close crossings into one bridge/tunnel — keep left/right needs separate for hills
  type Group = { infos: CInfo[]; leftAt: number; rightAt: number; target: number; leftNeed: number; rightNeed: number };
  let groups: Group[] = infos.map(ci => ({
    infos: [ci],
    leftAt: ci.at,
    rightAt: ci.at,
    target: ci.target,
    leftNeed: ci.need,
    rightNeed: ci.need,
  }));
  const recomputeGroup = (g: Group) => {
    g.leftAt = Math.min(...g.infos.map(i => i.at));
    g.rightAt = Math.max(...g.infos.map(i => i.at));
    g.target = opts.over ? Math.max(...g.infos.map(i => i.target)) : Math.min(...g.infos.map(i => i.target));
    // iterative refinement for each side (hills)
    let leftNeed = rampTiles(g.target - groundAt((g.leftAt + g.rightAt) / 2), maxGrade) + Vc / 2;
    let rightNeed = leftNeed;
    for (let iter = 0; iter < 10; iter++) {
      const bridgeStart = g.leftAt - overhang;
      const rampStart = bridgeStart - leftNeed;
      const leftGround = groundAt(Math.max(0, Math.min(L, rampStart)));
      const newLeft = rampTiles(g.target - leftGround, maxGrade) + Vc / 2;
      const bridgeEnd = g.rightAt + overhang;
      const rampEnd = bridgeEnd + rightNeed;
      const rightGround = groundAt(Math.max(0, Math.min(L, rampEnd)));
      const newRight = rampTiles(g.target - rightGround, maxGrade) + Vc / 2;
      if (Math.abs(newLeft - leftNeed) < 0.01 && Math.abs(newRight - rightNeed) < 0.01) break;
      leftNeed = newLeft; rightNeed = newRight;
    }
    g.leftNeed = leftNeed; g.rightNeed = rightNeed;
  };
  groups.forEach(recomputeGroup);

  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i + 1 < groups.length; i++) {
      const a = groups[i]!, b = groups[i + 1]!;
      const aBridgeEnd = a.rightAt + overhang;
      const bBridgeStart = b.leftAt - overhang;
      const aRampEnd = aBridgeEnd + a.rightNeed;
      const bRampStart = bBridgeStart - b.leftNeed;
      const gap = bRampStart - aRampEnd;
      if (gap < minGap - 1e-9) {
        const combined: Group = { infos: [...a.infos, ...b.infos], leftAt: 0, rightAt: 0, target: 0, leftNeed: 0, rightNeed: 0 };
        recomputeGroup(combined);
        groups.splice(i, 2, combined);
        merged = true;
        break;
      }
    }
  }

  type Interval = { rampStart: number; bridgeStart: number; bridgeEnd: number; rampEnd: number; target: number; group: Group };
  const intervals: Interval[] = groups.map(g => {
    const bridgeStart = g.leftAt - overhang;
    const bridgeEnd = g.rightAt + overhang;
    const rampStart = bridgeStart - g.leftNeed;
    const rampEnd = bridgeEnd + g.rightNeed;
    return { rampStart, bridgeStart, bridgeEnd, rampEnd, target: g.target, group: g };
  });

  // Feasibility checks
  let ok = true;
  let why = '';
  if (intervals.length) {
    const first = intervals[0]!;
    const last = intervals[intervals.length - 1]!;
    if (first.rampStart < -1e-9) {
      ok = false;
      why = `crossing at ${first.group.leftAt.toFixed(1)} too close to start (needs ${first.group.leftNeed.toFixed(1)} tiles, has ${first.group.leftAt.toFixed(1)})`;
    } else if (last.rampEnd > L + 1e-9) {
      ok = false;
      why = `crossing at ${last.group.rightAt.toFixed(1)} too close to end (needs ${last.group.rightNeed.toFixed(1)} tiles, has ${(L - last.group.rightAt).toFixed(1)})`;
    } else {
      // check inter-group gap already handled by merging, but if still gap <0 after merging, report too close to each other
      for (let i = 0; i + 1 < intervals.length; i++) {
        const a = intervals[i]!, b = intervals[i + 1]!;
        if (b.rampStart < a.rampEnd - 1e-9) {
          ok = false;
          why = `crossings at ${a.group.leftAt.toFixed(1)} and ${b.group.leftAt.toFixed(1)} too close to each other (gap ${(b.rampStart - a.rampEnd).toFixed(1)} tiles)`;
          break;
        }
      }
    }
  }

  // Generate per-tile profile
  const sArr: number[] = [];
  const nTiles = Math.ceil(L);
  for (let i = 0; i <= nTiles; i++) {
    const sv = i < nTiles ? i : L;
    if (sv > L + 1e-9) break;
    sArr.push(sv);
    if (Math.abs(sv - L) < 1e-9) break;
  }
  // Ensure we cover L exactly if not integer and not already
  if (sArr.length && Math.abs(sArr[sArr.length - 1]! - L) > 1e-9) sArr.push(L);

  const zArr: number[] = [];
  const kindsArr: Profile['kinds'] = [];

  // Helper to compute height for ramp with vertical curves
  const rampHeight = (s: number, s0: number, z0: number, s1: number, z1: number, maxG: number): number => {
    const total = s1 - s0;
    if (total < EPS) return z0;
    const rise = z1 - z0;
    // Use piecewise with vertical curves
    // If total is very short, fall back to smoothstep across whole
    if (total <= Vc + 1e-9) {
      // smoothstep across whole ramp
      const t = (s - s0) / total;
      const sm = t * t * (3 - 2 * t); // smoothstep 0..1, zero slope at ends
      return z0 + rise * sm;
    }
    const half = Vc / 2;
    if (s <= s0 + half) {
      // first curve: grade 0 -> maxGrade
      const t = (s - s0) / half;
      const sign = Math.sign(rise) || 1;
      const g = maxG * sign;
      return z0 + g * half * t * t;
    } else if (s >= s1 - half) {
      const sign = Math.sign(rise) || 1;
      const g = maxG * sign;
      const tp = (s - (s1 - half)) / half;
      const zb = z1 - g * half;
      return zb + g * half * (2 * tp - tp * tp);
    } else {
      // middle linear
      const sign = Math.sign(rise) || 1;
      const g = maxG * sign;
      const za = z0 + g * half;
      return za + g * 2 * (s - (s0 + half));
    }
  };

  // For each s, determine interval and compute z
  for (const s of sArr) {
    let found = false;
    for (const it of intervals) {
      if (s >= it.rampStart - 1e-9 && s < it.bridgeStart - 1e-9) {
        // left ramp
        const z0 = groundAt(it.rampStart);
        const z1 = it.target;
        zArr.push(rampHeight(s, it.rampStart, z0, it.bridgeStart, z1, maxGrade));
        kindsArr.push('ramp');
        found = true;
        break;
      } else if (s >= it.bridgeStart - 1e-9 && s <= it.bridgeEnd + 1e-9) {
        zArr.push(it.target);
        kindsArr.push(opts.over ? 'bridge' : 'tunnel');
        found = true;
        break;
      } else if (s > it.bridgeEnd + 1e-9 && s <= it.rampEnd + 1e-9) {
        const z0 = it.target;
        const z1 = groundAt(it.rampEnd);
        zArr.push(rampHeight(s, it.bridgeEnd, z0, it.rampEnd, z1, maxGrade));
        kindsArr.push('ramp');
        found = true;
        break;
      }
    }
    if (!found) {
      zArr.push(groundAt(s));
      kindsArr.push('ground');
    }
  }

  // If not ok, still return profile but ok false

  // Ensure kinds length matches s and z
  return { s: sArr, z: zArr, kinds: kindsArr, ok, why };
}
