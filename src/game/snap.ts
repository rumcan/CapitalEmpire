// Road-tool snapping (pure: no DOM). snapPoint decides where a click lands (a node, a road or the tile grid); checkLegs refuses a
// route that would build on top of a road, crowd a junction or make a sharp join. Tiles are 2 m; distances below are in tiles.
import { MAP, clamp } from './iso';
import { CLASS, type Leg, type Node, type PieceSel, type Pt, type RoadClass, type RoadNetwork, type Seg } from './network';

/** where a road point lands: a node (kind 'node', or 'end' for a dead end), a point on a road ('road'), or the tile grid */
export interface Snap { p: Pt; kind: 'node' | 'end' | 'road' | 'grid'; node?: Node; seg?: Seg }

/** the closest two junctions may be (8 tiles = 16 m); a road point this close to an end snaps to that end */
export const MIN_SEP = 8, MIN_ANGLE = 30;

const EPS = 0.02;                       // tolerance (tiles) for a point lying on a road or a node
const MIN_RUN = 0.5;                    // a leg running along a road for more than this (tiles) is a road already there
const MAX_HALF = 6.1;                   // the widest road's corridor half width (tiles), with a margin
const SIN_MIN = Math.sin(MIN_ANGLE * Math.PI / 180), COS_MIN = Math.cos(MIN_ANGLE * Math.PI / 180), COS_SAME = Math.cos(Math.PI / 180);
const JUNCTION_MSG = 'Too close to a junction: keep 16 m apart', ANGLE_MSG = 'Too sharp a join (under 30°)';
const ROAD_MSG = 'A road is already there: bulldoze it first', CORRIDOR_MSG = 'Too close to another road';
const RING_MSG = 'Roads join a roundabout at its centre', SELF_MSG = 'The road runs into itself';
/** how far past a point a roundabout's node can be and its circle still reach it (the biggest ring and its walk, with a margin) */
const RING_NEAR = 22;
/** a roundabout's (or a mini's) reach, tiles: its circle and the widest arm's walk; 0 for any other node */
const ringReach = (n: Node) => (n.rb > 0 ? n.rb + Math.max(0, ...n.arms.map(a => a.walk)) : 0);

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** the distance from p to the segment ab */
function ptSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  const t = L2 > 0 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / L2, 0, 1) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

/** the distance between the segments pq and rs (0 where they cross) */
export function segDist(p: Pt, q: Pt, r: Pt, s: Pt): number {
  const d1x = q.x - p.x, d1y = q.y - p.y, d2x = s.x - r.x, d2y = s.y - r.y, den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) > 1e-12) {
    const wx = r.x - p.x, wy = r.y - p.y, t = (wx * d2y - wy * d2x) / den, u = (wx * d1y - wy * d1x) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(ptSeg(p, r, s), ptSeg(q, r, s), ptSeg(r, p, q), ptSeg(s, p, q));
}

/** the nearest point on seg s's centre line to p (clamped to the seg), and its distance */
function projectOn(s: Seg, p: Pt): { q: Pt; d: number } {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, L2 = dx * dx + dy * dy;
  const t = L2 > 0 ? clamp(((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / L2, 0, 1) : 0;
  const q = { x: s.a.x + dx * t, y: s.a.y + dy * t };
  return { q, d: dist(p, q) };
}

/** the node a point of kind node/end sits on */
function nodeSnap(n: Node): Snap { return { p: { x: n.x, y: n.y }, kind: n.segs.length === 1 ? 'end' : 'node', node: n }; }

/** where a road-tool click at p lands, within rTiles: the nearest node (exact position); else the nearest point on a road, pulled to the
 *  road's nearer end when that end is within MIN_SEP; else the tile grid (clamped to the map, as the road tool always did) */
export function snapPoint(net: RoadNetwork, p: Pt, rTiles: number): Snap {
  // a road's whole surface snaps to it: the reach is its half width and verge plus the pointer radius (a click on an arterial's kerb
  // joins its centre line; a T made at the kerb would stop short as a dead end), and a node's reach is that of its widest arm
  const wide = (s: Seg) => s.cls.h + s.cls.walk + rTiles, segs = net.segsNear(p, rTiles + 8);
  // a roundabout's whole circle snaps to its node: a road joins a ring only at its centre (one stopped on the ring ran its lanes onto it)
  let ring: Node | null = null, rgd = Infinity;
  for (const s of net.segsNear(p, rTiles + RING_NEAR)) for (const n of [s.a, s.b]) { const d = dist(n, p); if (d <= ringReach(n) + rTiles && d < rgd) { rgd = d; ring = n; } }
  if (ring) return nodeSnap(ring);
  let node: Node | null = null, nd = Infinity;
  for (const s of segs) for (const n of [s.a, s.b]) {
    const reach = Math.max(rTiles, ...n.segs.map(q => q.cls.h + q.cls.walk)), d = dist(n, p);
    if (d <= reach && d < nd) { nd = d; node = n; }
  }
  if (node) return nodeSnap(node);
  let seg: Seg | null = null, rd = Infinity, road: Pt = p;
  for (const s of segs) { const r = projectOn(s, p); if (r.d <= wide(s) && r.d < rd) { rd = r.d; seg = s; road = r.q; } }
  if (seg) {
    const near = dist(seg.a, road) <= dist(seg.b, road) ? seg.a : seg.b;
    if (dist(near, road) < MIN_SEP) return nodeSnap(near);
    return { p: road, kind: 'road', seg };
  }
  return { p: { x: clamp(Math.round(p.x), 2, MAP - 2), y: clamp(Math.round(p.y), 2, MAP - 2) }, kind: 'grid' };
}

/** true when q lies in the interior of a road (not on a node); a seg in skip (bulldozed by Replace) is not a road */
function onRoad(net: RoadNetwork, q: Pt, skip?: Set<Seg>): boolean {
  for (const s of net.segsNear(q, EPS)) if (!skip?.has(s) && projectOn(s, q).d <= EPS && dist(q, s.a) > EPS && dist(q, s.b) > EPS) return true;
  return false;
}

/** the reason a route of legs cannot be built, or '' when it can. `from` and `to` are the route's first and last snaps (a node they sit
 *  on is the one that point joins); cls is the class being built (its corridor is cls.h + cls.walk either side of the centre line).
 *  Rules: (1) a leg may not run along an existing road for more than MIN_RUN (bulldoze it first; the Add lane tool widens a road);
 *  (2) a leg's corridor may not overlap another road's corridor, except in a junction: where it starts or ends on that road's node, or
 *  where it meets the road at MIN_ANGLE or more; (3) a new junction (a route point on a road, or a leg crossing one) must be MIN_SEP
 *  tiles from every other node; (4) a leg that starts or ends on a node must make at least MIN_ANGLE with each of that node's arms;
 *  (5) a leg may not enter a roundabout's circle; (6) the route against itself: a join may not double back (under MIN_ANGLE with the leg
 *  before it), two legs that are not neighbours may not lie within two corridors of each other (a closed loop's first and last legs
 *  meet at its start, so there only the join's angle counts), and a new junction must be 2 tiles from every other route point.
 *  skip (Replace on): the segs the route bulldozes, which are judged as gone (no rule sees them) */
export function checkLegs(net: RoadNetwork, legs: Leg[], from: Snap | null, to: Snap | null, cls: RoadClass = CLASS.street, skip?: Set<Seg>): string {
  const hw = cls.h + cls.walk;
  /** the node a point sits on: the route's snapped node if it is one of the ends, else the node at that spot */
  const nodeOf = (q: Pt): Node | null => {
    if (from?.node && dist(q, from.p) < EPS) return from.node;
    if (to?.node && dist(q, to.p) < EPS) return to.node;
    return net.nodeAt(q) ?? null;
  };
  const cand: Pt[] = [];
  for (const l of legs) {
    if (dist(l.a, l.b) < EPS) continue;
    for (const q of [l.a, l.b]) if (!nodeOf(q) && onRoad(net, q, skip)) cand.push(q);
    const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, L = Math.hypot(dx, dy);
    for (const s of net.segsNear({ x: (l.a.x + l.b.x) / 2, y: (l.a.y + l.b.y) / 2 }, L / 2 + hw + MAX_HALF)) {
      if (skip?.has(s)) continue;
      const ex = s.b.x - s.a.x, ey = s.b.y - s.a.y, LS = Math.hypot(ex, ey);
      if (LS < EPS) continue;
      const den = dx * ey - dy * ex, hs = hw + s.cls.h + s.cls.walk;
      // parallel to 1e-4 (a diagonal through non-integer points is a hair off: at 1e-9 a route ran on top of one; the stress test, 2026-10-19)
      if (Math.abs(den) < 1e-4 * L * LS) { // parallel: along the road (rule 1), or beside it (rule 2)
        const lat = Math.max(Math.abs(dx * (s.a.y - l.a.y) - dy * (s.a.x - l.a.x)), Math.abs(dx * (s.b.y - l.a.y) - dy * (s.b.x - l.a.x))) / L;
        if (lat <= EPS) {
          const ta = ((s.a.x - l.a.x) * dx + (s.a.y - l.a.y) * dy) / L, tb = ((s.b.x - l.a.x) * dx + (s.b.y - l.a.y) * dy) / L;
          if (Math.min(L, Math.max(ta, tb)) - Math.max(0, Math.min(ta, tb)) > MIN_RUN) return ROAD_MSG;
        } else if (segDist(l.a, l.b, s.a, s.b) < hs) return CORRIDOR_MSG;
        continue;
      }
      const wx = s.a.x - l.a.x, wy = s.a.y - l.a.y, t = (wx * ey - wy * ex) / den, u = (wx * dy - wy * dx) / den;
      const inside = t >= -1e-9 && t <= 1 + 1e-9 && u > 1e-9 && u < 1 - 1e-9; // crosses the road's interior
      if (inside) { const x = { x: l.a.x + t * dx, y: l.a.y + t * dy }; if (!nodeOf(x)) cand.push(x); }
      if (segDist(l.a, l.b, s.a, s.b) >= hs) continue;
      // the corridors overlap: allowed only in a junction (rule 2)
      // (a leg passing over one of the road's nodes at a wide angle joins it there too: drawn over an old road through its junctions)
      const wide = Math.abs(den) >= SIN_MIN * L * LS, onNode = [l.a, l.b].some(q => nodeOf(q) === s.a || nodeOf(q) === s.b) || (wide && (ptSeg(s.a, l.a, l.b) <= EPS || ptSeg(s.b, l.a, l.b) <= EPS));
      const onEnd = [l.a, l.b].some(q => ptSeg(q, s.a, s.b) <= EPS);
      if (!(onNode || (wide && (inside || onEnd)))) return CORRIDOR_MSG;
    }
  }
  // new junctions apart from each other too (a route crossing one road on both sides of a corner made two, 4 tiles apart)
  for (let i = 0; i < cand.length; i++) for (let j = i + 1; j < cand.length; j++) { const d = dist(cand[i]!, cand[j]!); if (d > EPS && d < MIN_SEP) return JUNCTION_MSG; }
  for (const q of cand) {
    const own = nodeOf(q);
    for (const s of net.segsNear(q, MIN_SEP)) for (const n of [s.a, s.b]) if (n !== own && dist(n, q) < MIN_SEP && !skip?.has(s)) return JUNCTION_MSG;
  }
  for (const l of legs) {
    if (dist(l.a, l.b) < EPS) continue;
    for (const [q, o] of [[l.a, l.b], [l.b, l.a]] as const) {
      const n = nodeOf(q); if (!n) continue;
      const dx = o.x - q.x, dy = o.y - q.y, L = Math.hypot(dx, dy);
      for (const s of n.segs) {
        if (skip?.has(s)) continue;
        const other = s.a === n ? s.b : s.a, ax = other.x - n.x, ay = other.y - n.y, A = Math.hypot(ax, ay);
        if (A < EPS) continue;
        const c = (dx * ax + dy * ay) / (L * A);
        if (c > COS_SAME) continue; // along a stub under 0.5 tiles (rule 1 covers longer runs)
        if (c > COS_MIN) return ANGLE_MSG;
      }
    }
  }
  // (6) the route against itself, over its own legs (the short ones skipped)
  const r = legs.filter(l => dist(l.a, l.b) >= EPS), closed = r.length > 2 && dist(r[0]!.a, r[r.length - 1]!.b) < EPS;
  /** true when the join from leg `into` to leg `out` (at into.b = out.a) is not a doubling back: the reversed incoming leg makes at least MIN_ANGLE with the outgoing one */
  const joinOk = (into: Leg, out: Leg): boolean => {
    const ux = into.a.x - into.b.x, uy = into.a.y - into.b.y, vx = out.b.x - out.a.x, vy = out.b.y - out.a.y;
    return (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy)) <= COS_MIN;
  };
  for (let i = 0; i + 1 < r.length; i++) if (!joinOk(r[i]!, r[i + 1]!)) return ANGLE_MSG;
  if (closed && !joinOk(r[r.length - 1]!, r[0]!)) return ANGLE_MSG;
  for (let i = 0; i < r.length; i++) for (let j = i + 2; j < r.length; j++) {
    if (closed && i === 0 && j === r.length - 1) continue;
    if (segDist(r[i]!.a, r[i]!.b, r[j]!.a, r[j]!.b) < 2 * hw) return SELF_MSG;
  }
  // a new junction too close to a route corner or end left a road piece under a tile long (2 tiles, not MIN_SEP: a bend is no junction, and a
  // route that leaves a road and bends a few tiles on is fine)
  // the points the route will split the network at (its own points, the new junctions, the nodes it passes over) must be 2 tiles apart or one:
  // closer, they left road pieces under a tile long (a route corner 0.9 tiles from a node on its line; a last leg 0.9 tiles long)
  const splits: Pt[] = [...cand]; for (const l of legs) splits.push(l.a, l.b);
  for (const l of legs) for (const s of net.segsNear({ x: (l.a.x + l.b.x) / 2, y: (l.a.y + l.b.y) / 2 }, dist(l.a, l.b) / 2 + 2)) if (!skip?.has(s)) for (const n of [s.a, s.b]) if (ptSeg(n, l.a, l.b) <= EPS) splits.push(n);
  for (let i = 0; i < splits.length; i++) for (let j = i + 1; j < splits.length; j++) { const d = dist(splits[i]!, splits[j]!); if (d > EPS && d < 2) return JUNCTION_MSG; }
  // (5) a leg may not enter a roundabout's circle (with its walk and the leg's corridor) except to end on its node
  for (const l of legs) {
    if (dist(l.a, l.b) < EPS) continue;
    const L = dist(l.a, l.b);
    for (const s of net.segsNear({ x: (l.a.x + l.b.x) / 2, y: (l.a.y + l.b.y) / 2 }, L / 2 + hw + RING_NEAR)) for (const n of [s.a, s.b]) {
      const r = ringReach(n); if (r <= 0 || nodeOf(l.a) === n || nodeOf(l.b) === n) continue;
      // a leg from a node next to the ring (an arm's far end) only keeps its centre line off the circle: its corridor meets the arm's there
      const nextTo = [l.a, l.b].some(q => { const m = nodeOf(q); return !!m && m.segs.some(x => x.a === n || x.b === n); });
      if (ptSeg(n, l.a, l.b) < r + (nextTo ? 0 : hw)) return RING_MSG;
    }
  }
  return '';
}

/** the road pieces a route bulldozes when Replace is on: each existing seg that checkLegs would refuse the route over (a leg runs along it,
 *  lies beside it inside the corridor, or meets it at a shallow angle). A seg a leg crosses at SIN_MIN or more, MIN_SEP or more from the
 *  seg's ends, is kept: the crossing becomes a junction, as now. So is a seg a route end joins at that angle (the join is the route's). Any
 *  other clashing leg is sampled every half tile along the seg; the samples its corridor touches give one interval, padded so the new dead
 *  ends clear the corridor (an interval reaching an end of the seg takes the whole arm). cls is the class being built */
export function replaceCuts(net: RoadNetwork, legs: Leg[], cls: RoadClass): PieceSel[] {
  const out: PieceSel[] = [];
  if (!legs.length) return out;
  const hw = cls.h + cls.walk, segs = new Set<Seg>(), q = { x: 0, y: 0 };
  for (const l of legs) {
    const L = dist(l.a, l.b);
    if (L < EPS) continue;
    for (const s of net.segsNear({ x: (l.a.x + l.b.x) / 2, y: (l.a.y + l.b.y) / 2 }, L / 2 + hw + MAX_HALF)) segs.add(s);
  }
  /** true when p lies on the route (an end, a bend or a leg's interior) */
  const onRoute = (p: Pt) => legs.some(l => ptSeg(p, l.a, l.b) < EPS);
  /** true when leg l meets seg s cleanly (see above), so that leg does not cut s */
  const keep = (l: Leg, s: Seg): boolean => {
    // s has a node on the route (the route ends at it, bends there or passes over it): s joins the route there, and is kept when it leaves
    // that node at MIN_ANGLE or more from every way the route leaves it (straight on beyond a route end is kept; doubling back along it is not)
    for (const [q, o] of [[s.a, s.b], [s.b, s.a]] as const) {
      if (!onRoute(q)) continue;
      const ox = o.x - q.x, oy = o.y - q.y, LO = Math.hypot(ox, oy);
      let ok = true;
      for (const m of legs) {
        const ways: [number, number][] = dist(m.a, q) < EPS ? [[m.b.x - m.a.x, m.b.y - m.a.y]] : dist(m.b, q) < EPS ? [[m.a.x - m.b.x, m.a.y - m.b.y]]
          : ptSeg(q, m.a, m.b) < EPS ? [[m.b.x - m.a.x, m.b.y - m.a.y], [m.a.x - m.b.x, m.a.y - m.b.y]] : [];
        for (const [wx, wy] of ways) if ((wx * ox + wy * oy) / (Math.hypot(wx, wy) * LO) > COS_MIN) ok = false;
      }
      return ok;
    }
    const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, ex = s.b.x - s.a.x, ey = s.b.y - s.a.y, den = dx * ey - dy * ex, LS = Math.hypot(ex, ey);
    if (Math.abs(den) < SIN_MIN * Math.hypot(dx, dy) * LS) return false; // parallel or shallow
    const wx = s.a.x - l.a.x, wy = s.a.y - l.a.y, t = (wx * ey - wy * ex) / den, u = (wx * dy - wy * dx) / den;
    if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return false; // the two do not meet
    // a crossing of s's interior: kept (a new junction) when MIN_SEP from s's nodes
    return u * LS >= MIN_SEP && LS - u * LS >= MIN_SEP;
  };
  for (const s of segs) {
    const ex = s.b.x - s.a.x, ey = s.b.y - s.a.y, LS = Math.hypot(ex, ey);
    if (LS < EPS) continue;
    const hs = hw + s.cls.h + s.cls.walk;
    let t0 = Infinity, t1 = -Infinity;
    for (const l of legs) {
      if (dist(l.a, l.b) < EPS || segDist(l.a, l.b, s.a, s.b) >= hs || keep(l, s)) continue;
      const N = Math.ceil(LS * 2);
      for (let i = 0; i <= N; i++) {
        const t = Math.min(i / 2, LS); q.x = s.a.x + ex * t / LS; q.y = s.a.y + ey * t / LS;
        if (ptSeg(q, l.a, l.b) < hs) { if (t < t0) t0 = t; if (t > t1) t1 = t; }
      }
    }
    if (t1 < t0) continue;
    // long enough that the two new dead ends (with their turning circles) do not touch the route, as RoadNetwork.pieceNear
    const pad = s.cls.h + s.cls.bulb + 1;
    let a = Math.max(0, t0 - pad), b = Math.min(LS, t1 + pad);
    if (a < 2) a = 0;
    if (LS - b < 2) b = LS;
    let joinA = false, joinB = false, endA: Pt | null = null, endB: Pt | null = null;
    // a route end on s (replacing a stretch of it): the cut stops there, so the rest of s joins the new road at that point (padded, it left a gap)
    for (const [e, l, away] of [[legs[0]!.a, legs[0]!, legs[0]!.b], [legs[legs.length - 1]!.b, legs[legs.length - 1]!, legs[legs.length - 1]!.a]] as const) {
      if (ptSeg(e, s.a, s.b) >= EPS || keep(l, s)) continue;
      const te = ((e.x - s.a.x) * ex + (e.y - s.a.y) * ey) / LS, ta = ((away.x - s.a.x) * ex + (away.y - s.a.y) * ey) / LS;
      if (te < a - EPS || te > b + EPS) continue;
      // exactly there (rounded on to s's node, a route end short of it would be left apart from it)
      if (ta > te) { a = te < EPS ? 0 : te; joinA = true; } else { b = LS - te < EPS ? LS : te; joinB = true; }
      if (ta > te) endA = e; else endB = e;
    }
    // the other new dead ends clear the new road and the roads around (see RoadNetwork.clearCut); an end the route joins stays where it is
    const [ca, cb] = net.clearCut(s, a, b, legs.map(l => ({ a: l.a, b: l.b, hw })));
    if (!joinA) a = ca; if (!joinB) b = cb;
    // a joined end is the route's own point (its projection on s, a few thousandths off, made a second node beside the route's end)
    out.push({ seg: s, p0: joinA && a > 0 && endA ? { ...endA } : { x: s.a.x + ex * a / LS, y: s.a.y + ey * a / LS }, p1: joinB && b < LS && endB ? { ...endB } : { x: s.a.x + ex * b / LS, y: s.a.y + ey * b / LS } });
  }
  return out;
}

/** the hidden stubs a route clears at a roundabout it starts or ends on: an arm of the ring's node that ends in a dead end inside the ring's
 *  circle (left there by bulldozing it piece by piece; under the ring's paving it is not seen, but the road tool still found a road there:
 *  the owner, 2026-10-19). Each is taken whole, Replace on or off */
export function ringStubs(net: RoadNetwork, legs: Leg[]): PieceSel[] {
  const out: PieceSel[] = [];
  if (!legs.length) return out;
  for (const e of [legs[0]!.a, legs[legs.length - 1]!.b]) {
    const n = net.nodeAt(e); if (!n || ringReach(n) <= 0) continue;
    for (const s of n.segs) { const m = s.a === n ? s.b : s.a; if (m.segs.length === 1 && dist(m, n) <= ringReach(n) + EPS && !out.some(c => c.seg === s)) out.push({ seg: s, p0: s.a, p1: s.b }); }
  }
  return out;
}
