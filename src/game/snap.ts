// Road-tool snapping (pure: no DOM). snapPoint decides where a click lands (a node, a road or the tile grid); checkLegs refuses a
// route that would build on top of a road, crowd a junction or make a sharp join. Tiles are 2 m; distances below are in tiles.
import { MAP, clamp } from './iso';
import { CLASS, type Leg, type Node, type Pt, type RoadClass, type RoadNetwork, type Seg } from './network';

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

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** the distance from p to the segment ab */
function ptSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  const t = L2 > 0 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / L2, 0, 1) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

/** the distance between the segments pq and rs (0 where they cross) */
function segDist(p: Pt, q: Pt, r: Pt, s: Pt): number {
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

/** true when q lies in the interior of a road (not on a node) */
function onRoad(net: RoadNetwork, q: Pt): boolean {
  for (const s of net.segsNear(q, EPS)) if (projectOn(s, q).d <= EPS && dist(q, s.a) > EPS && dist(q, s.b) > EPS) return true;
  return false;
}

/** the reason a route of legs cannot be built, or '' when it can. `from` and `to` are the route's first and last snaps (a node they sit
 *  on is the one that point joins); cls is the class being built (its corridor is cls.h + cls.walk either side of the centre line).
 *  Rules: (1) a leg may not run along an existing road for more than MIN_RUN (bulldoze it first; the Add lane tool widens a road);
 *  (2) a leg's corridor may not overlap another road's corridor, except in a junction: where it starts or ends on that road's node, or
 *  where it meets the road at MIN_ANGLE or more; (3) a new junction (a route point on a road, or a leg crossing one) must be MIN_SEP
 *  tiles from every other node; (4) a leg that starts or ends on a node must make at least MIN_ANGLE with each of that node's arms */
export function checkLegs(net: RoadNetwork, legs: Leg[], from: Snap | null, to: Snap | null, cls: RoadClass = CLASS.street): string {
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
    for (const q of [l.a, l.b]) if (!nodeOf(q) && onRoad(net, q)) cand.push(q);
    const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, L = Math.hypot(dx, dy);
    for (const s of net.segsNear({ x: (l.a.x + l.b.x) / 2, y: (l.a.y + l.b.y) / 2 }, L / 2 + hw + MAX_HALF)) {
      const ex = s.b.x - s.a.x, ey = s.b.y - s.a.y, LS = Math.hypot(ex, ey);
      if (LS < EPS) continue;
      const den = dx * ey - dy * ex, hs = hw + s.cls.h + s.cls.walk;
      if (Math.abs(den) < 1e-9 * L * LS) { // parallel: along the road (rule 1), or beside it (rule 2)
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
      const wide = Math.abs(den) >= SIN_MIN * L * LS, onNode = [l.a, l.b].some(q => nodeOf(q) === s.a || nodeOf(q) === s.b);
      const onEnd = [l.a, l.b].some(q => ptSeg(q, s.a, s.b) <= EPS);
      if (!(onNode || (wide && (inside || onEnd)))) return CORRIDOR_MSG;
    }
  }
  for (const q of cand) {
    const own = nodeOf(q);
    for (const s of net.segsNear(q, MIN_SEP)) for (const n of [s.a, s.b]) if (n !== own && dist(n, q) < MIN_SEP) return JUNCTION_MSG;
  }
  for (const l of legs) {
    if (dist(l.a, l.b) < EPS) continue;
    for (const [q, o] of [[l.a, l.b], [l.b, l.a]] as const) {
      const n = nodeOf(q); if (!n) continue;
      const dx = o.x - q.x, dy = o.y - q.y, L = Math.hypot(dx, dy);
      for (const s of n.segs) {
        const other = s.a === n ? s.b : s.a, ax = other.x - n.x, ay = other.y - n.y, A = Math.hypot(ax, ay);
        if (A < EPS) continue;
        const c = (dx * ax + dy * ay) / (L * A);
        if (c > COS_SAME) continue; // along a stub under 0.5 tiles (rule 1 covers longer runs)
        if (c > COS_MIN) return ANGLE_MSG;
      }
    }
  }
  return '';
}
