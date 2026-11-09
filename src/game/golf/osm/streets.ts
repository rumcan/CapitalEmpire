// The estate of a real course (T354, #996; the owner, 2026-11-08: "Add a way to add the estate streets if your golf course you are importing is also a golf estate"): its
// streets, from the map's `highway` ways, and where its houses stand, from the buildings' centres. Three pure steps (no network, no DOM, deterministic):
//  1. buildEstate (the converter): the streets at the land (a little way past its edge: the perimeter road), snapped into one network (a street that ends on another's side is joined to it). A street
//     that crosses a hole (a fairway, tee, green, bunker, pond, stream or a hole's line of play) is left out whole, and so is every piece the biggest network does not reach;
//     each is counted, for a warning. The buildings that are houses become anchors, off the course and off the streets themselves.
//  2. joinEstate (the game's plan): the network on the map and the one link that joins it to the entry road: from the street end that gives the shortest way out of the land
//     (clear of the playing surfaces, the clubhouse parcel and the car park) to a T on the road.
//  3. framesAtBuildings (the lots): T353's frontage frames along the streets (golf/estate.ts), the ones that hold a house of the map (each building takes the nearest frame within
//     reach), so the lots stand where the real houses do and every house faces its street.
import { CELL_T, SURF, type Grid } from '../../ext/course-grid';
import type { Leg, Pt } from '../../network';
import type { Frame } from '../estate';
import { boxOf, distToLine, inPoly, type Box, type P, type Poly } from './geom';

// ---------------------------------------------------------------------------------------------------------------------------------------------
// 1. the converter's part (metres, x east and y north, the frame of the JSON)
// ---------------------------------------------------------------------------------------------------------------------------------------------
/** the streets run this far past the land's edge, m, and are cut there: an estate's perimeter road lies just outside the land (Woodhill's, about 10 m), and a network cut at the edge
 *  falls apart into pieces that are joined only by the stretches outside it (at the edge itself, 43 of Woodhill's 100 pieces were left over; at 12 m, 6). The clubhouse parcel is 28 m
 *  from the land (start.ts GAP), so a street this far out never reaches it */
export const STREET_REACH = 20;
/** a building's centre must be this far inside the land's edge to be a house of the estate, m (a lot stands on the club's own land) */
export const HOUSE_INSET = 4;
/** a street's end this near another street (or its end) is on it: the mapper left a gap, or the vertex there was simplified away, m */
export const STREET_SNAP = 2;
/** a building this near a street's line stands on the road, not beside it: it is no house of the estate, m */
export const HOUSE_OFF_STREET = 3;

/** a street of the map: its polyline and its OSM `highway` class */
export interface StreetWay { pts: readonly P[]; hw: string }
/** what a street may not cross: the playing surfaces and hazards (polygons) and the holes' lines of play (polylines) */
export interface Blocks { polys: readonly Poly[]; lines: readonly (readonly P[])[] }
/** what buildEstate made of the streets: the network (a polyline each, its class), and the counts for the warnings and the PR */
export interface EstateBuilt {
  streets: StreetWay[];
  stats: {
    /** the map's streets given, and the pieces left after the land's edge cut them */ ways: number; pieces: number;
    /** the streets left out for crossing a hole (whole ways) */ crossing: number;
    /** the pieces left out for not being joined to the biggest network, and their length, m */ unconnected: number; unconnectedM: number;
    /** the network: its pieces, its length (m), its junctions (three streets or more) and its dead ends */ kept: number; lengthM: number; junctions: number; ends: number;
  };
}

/** the runs of a polyline inside a box: a segment that leaves it is cut where it crosses the edge, and the part outside is dropped */
export function clipLine(line: readonly P[], box: Box): P[][] {
  const out: P[][] = [];
  let run: P[] = [];
  const flush = () => { if (run.length >= 2) out.push(run); run = []; };
  const add = (p: P) => { const l = run[run.length - 1]; if (!l || Math.hypot(l[0] - p[0], l[1] - p[1]) > 1e-9) run.push(p); };
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]!, b = line[i + 1]!, dx = b[0] - a[0], dy = b[1] - a[1];
    let t0 = 0, t1 = 1, ok = true;
    // (Liang-Barsky: the part of the segment inside the box is t0..t1)
    for (const [p, q] of [[-dx, a[0] - box[0]], [dx, box[2] - a[0]], [-dy, a[1] - box[1]], [dy, box[3] - a[1]]] as const) {
      if (p === 0) { if (q < 0) { ok = false; break; } continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; } else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; }
    }
    if (!ok) { flush(); continue; }
    // (a point cut at the edge is rounded to a nanometre, so the edge's own coordinate comes out exactly)
    const cut = (t: number): P => [Math.round((a[0] + dx * t) * 1e9) / 1e9, Math.round((a[1] + dy * t) * 1e9) / 1e9];
    if (t0 > 0) { flush(); add(cut(t0)); } else add(a);
    add(t1 < 1 ? cut(t1) : b);
    if (t1 < 1) flush();
  }
  flush();
  return out;
}

const orient = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
/** whether segments a-b and c-d cross (a proper crossing: each segment's ends lie on either side of the other) */
function segsCross(a: P, b: P, c: P, d: P): boolean {
  const o1 = orient(a[0], a[1], b[0], b[1], c[0], c[1]), o2 = orient(a[0], a[1], b[0], b[1], d[0], d[1]), o3 = orient(c[0], c[1], d[0], d[1], a[0], a[1]), o4 = orient(c[0], c[1], d[0], d[1], b[0], b[1]);
  return ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0));
}
const boxMeet = (a: Box, b: Box): boolean => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
const segBox = (a: P, b: P): Box => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];

/** whether a polyline crosses what it may not: it has a point in a polygon (its vertices and the middle of each segment), crosses a polygon's edge, or crosses a hole's line of play */
export function crossesBlocks(pts: readonly P[], blocks: Blocks): boolean {
  const pb = blocks.polys.map(p => boxOf(p.outer)), lb = blocks.lines.map(l => boxOf(l));
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!, b = pts[i + 1]!, sb = segBox(a, b), mid: P = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    for (let k = 0; k < blocks.polys.length; k++) {
      const box = pb[k]; if (!box || !boxMeet(box, sb)) continue;
      const poly = blocks.polys[k]!;
      if (inPoly(poly, a[0], a[1]) || inPoly(poly, b[0], b[1]) || inPoly(poly, mid[0], mid[1])) return true;
      for (const ring of [poly.outer, ...poly.inner]) for (let m = 0, j = ring.length - 1; m < ring.length; j = m++) if (segsCross(a, b, ring[j]!, ring[m]!)) return true;
    }
    for (let k = 0; k < blocks.lines.length; k++) {
      const box = lb[k]; if (!box || !boxMeet(box, sb)) continue;
      const l = blocks.lines[k]!;
      for (let m = 0; m + 1 < l.length; m++) if (segsCross(a, b, l[m]!, l[m + 1]!)) return true;
    }
  }
  return false;
}

/** a piece of street while the network is made: its points (moved and added to as the pieces are snapped together), the way it came from and its class */
interface Piece { pts: P[]; way: number; hw: string }
const keyOf = (p: P): string => `${Math.round(p[0] * 20)},${Math.round(p[1] * 20)}`;
const lengthOf = (pts: readonly P[]): number => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]); return s; };

/** the pieces' ends joined to the pieces they meet: an end within `tol` of another piece moves onto it, onto a vertex of it when one is about as near as the foot of the perpendicular
 *  (a node that is already there is used, so no sliver of a segment is made) and else onto the foot, where the host gets a vertex of its own (an end that lies on the street's
 *  line already gets it too). Of two ends that meet, the later one moves onto the earlier (so they do not swap places), and an end that moves onto an end that moves follows it. The
 *  pieces are changed in place; returns how many ends were joined */
function snapEnds(pieces: Piece[], tol: number): number {
  // the segments, in a grid of 16 m cells (each in every cell its box grown by tol reaches)
  const CELL = 16, grid = new Map<string, { piece: number; seg: number }[]>();
  const cellOf = (v: number): number => Math.floor(v / CELL);
  pieces.forEach((pc, i) => {
    for (let s = 0; s + 1 < pc.pts.length; s++) {
      const a = pc.pts[s]!, b = pc.pts[s + 1]!;
      for (let cx = cellOf(Math.min(a[0], b[0]) - tol); cx <= cellOf(Math.max(a[0], b[0]) + tol); cx++) for (let cy = cellOf(Math.min(a[1], b[1]) - tol); cy <= cellOf(Math.max(a[1], b[1]) + tol); cy++) {
        const k = `${cx},${cy}`, l = grid.get(k);
        if (l) l.push({ piece: i, seg: s }); else grid.set(k, [{ piece: i, seg: s }]);
      }
    }
  });
  interface Move { key: number; piece: number; end: 0 | 1; was: P; to: P; host: number; seg: number; t: number; vertex: boolean }
  const moves: Move[] = [];
  pieces.forEach((pc, i) => {
    for (const end of [0, 1] as const) {
      const e = end === 0 ? pc.pts[0]! : pc.pts[pc.pts.length - 1]!, key = i * 2 + end;
      let best: (Move & { stay: boolean }) | null = null, bd = Infinity;
      for (const c of grid.get(`${cellOf(e[0])},${cellOf(e[1])}`) ?? []) {
        // (not the piece's own segment at this end: the end is a part of it)
        if (c.piece === i && c.seg === (end === 0 ? 0 : pc.pts.length - 2)) continue;
        const host = pieces[c.piece]!, a = host.pts[c.seg]!, b = host.pts[c.seg + 1]!, dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
        const t = L2 > 0 ? Math.max(0, Math.min(1, ((e[0] - a[0]) * dx + (e[1] - a[1]) * dy) / L2)) : 0, q: P = [a[0] + dx * t, a[1] + dy * t], d = Math.hypot(e[0] - q[0], e[1] - q[1]);
        if (d > tol) continue;
        const da = Math.hypot(e[0] - a[0], e[1] - a[1]), db = Math.hypot(e[0] - b[0], e[1] - b[1]), dv = Math.min(da, db), useVertex = dv <= tol && dv <= d + 0.5;
        // the vertex nearer to the end, and whether it is an end of its piece (0 or 1) that comes to this end instead (the one with the lower key stays)
        const vEnd = da <= db ? (c.seg === 0 ? 0 : -1) : (c.seg + 1 === host.pts.length - 1 ? 1 : -1), stay = useVertex && vEnd >= 0 && c.piece * 2 + vEnd > key, dd = useVertex ? dv : d;
        if (dd < bd - 1e-9) { bd = dd; best = { key, piece: i, end, was: e, to: useVertex ? (da <= db ? a : b) : q, host: c.piece, seg: c.seg, t, vertex: useVertex, stay }; }
      }
      if (best && !best.stay && (!best.vertex || best.to[0] !== e[0] || best.to[1] !== e[1])) moves.push(best);
    }
  });
  // an end that moves onto an end that moves goes where that one goes (the lower keys first)
  const went = new Map<P, P>();
  for (const m of moves.slice().sort((x, y) => x.key - y.key)) { if (m.vertex) m.to = went.get(m.to) ?? m.to; went.set(m.was, m.to); }
  // the vertices the hosts get (per host, in order along it; a node already within half a metre is used instead of a new one), then the ends move
  const adds = new Map<number, Move[]>();
  for (const m of moves) if (!m.vertex) { const l = adds.get(m.host) ?? []; l.push(m); adds.set(m.host, l); }
  for (const [hi, list] of adds) {
    const pc = pieces[hi]!, out: P[] = [];
    list.sort((x, y) => x.seg - y.seg || x.t - y.t);
    let k = 0;
    for (let s = 0; s < pc.pts.length; s++) {
      out.push(pc.pts[s]!);
      while (k < list.length && list[k]!.seg === s) {
        const m = list[k++]!, last = out[out.length - 1]!, next = pc.pts[s + 1]!;
        if (Math.hypot(m.to[0] - last[0], m.to[1] - last[1]) <= 0.5) m.to = last;
        else if (Math.hypot(m.to[0] - next[0], m.to[1] - next[1]) <= 0.5) m.to = next;
        else out.push(m.to);
      }
    }
    pc.pts = out;
  }
  for (const m of moves) { const pc = pieces[m.piece]!; if (m.end === 0) pc.pts[0] = m.to; else pc.pts[pc.pts.length - 1] = m.to; }
  return moves.length;
}

/** the network of the map's streets at the land (see the file's header): `box` is the land (metres), the streets run `reach` m (STREET_REACH) past its edge and are cut there; a street (a
 *  whole way) that crosses `blocks` is left out; the pieces are snapped together and only the biggest network stays */
export function buildEstate(ways: readonly StreetWay[], box: Box, blocks: Blocks, tol = STREET_SNAP, reach = STREET_REACH): EstateBuilt {
  const inner: Box = [box[0] - reach, box[1] - reach, box[2] + reach, box[3] + reach];
  const pieces: Piece[] = [];
  let crossing = 0;
  ways.forEach((w, wi) => {
    const runs = clipLine(w.pts, inner);
    if (!runs.length) return;
    if (crossesBlocks(w.pts, blocks)) { crossing++; return; }
    for (const r of runs) pieces.push({ pts: r.slice(), way: wi, hw: w.hw });
  });
  const total = pieces.length;
  snapEnds(pieces, tol);
  // the networks: the pieces that share a node (a vertex at the same place, to 5 cm)
  const parent = new Map<string, string>();
  const find = (k: string): string => { let r = k; while (parent.get(r) !== r) r = parent.get(r)!; for (let c = k; c !== r;) { const n = parent.get(c)!; parent.set(c, r); c = n; } return r; };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb); };
  for (const pc of pieces) for (let i = 0; i < pc.pts.length; i++) { const k = keyOf(pc.pts[i]!); if (!parent.has(k)) parent.set(k, k); if (i) union(keyOf(pc.pts[i - 1]!), k); }
  const lenOf = new Map<string, number>();
  for (const pc of pieces) { const r = find(keyOf(pc.pts[0]!)); lenOf.set(r, (lenOf.get(r) ?? 0) + lengthOf(pc.pts)); }
  let main = '', best = -1;
  for (const [r, l] of [...lenOf].sort((a, b) => (a[0] < b[0] ? -1 : 1))) if (l > best + 1e-9) { best = l; main = r; }
  const kept = pieces.filter(pc => find(keyOf(pc.pts[0]!)) === main), dropped = pieces.filter(pc => find(keyOf(pc.pts[0]!)) !== main);
  // junctions and dead ends of the network
  const deg = new Map<string, number>();
  for (const pc of kept) for (let i = 0; i < pc.pts.length; i++) { const k = keyOf(pc.pts[i]!), n = i === 0 || i === pc.pts.length - 1 ? 1 : 2; deg.set(k, (deg.get(k) ?? 0) + n); }
  let junctions = 0, ends = 0;
  for (const d of deg.values()) { if (d >= 3) junctions++; else if (d === 1) ends++; }
  return {
    streets: kept.map(pc => ({ pts: pc.pts, hw: pc.hw })),
    stats: { ways: ways.length, pieces: total, crossing, unconnected: dropped.length, unconnectedM: Math.round(dropped.reduce((s, pc) => s + lengthOf(pc.pts), 0)), kept: kept.length, lengthM: Math.round(kept.reduce((s, pc) => s + lengthOf(pc.pts), 0)), junctions, ends },
  };
}

/** the buildings that are houses of the estate: their centres inside the land (HOUSE_INSET short of its edge), not on a playing surface or hazard (`blocks`), and not on a street's
 *  own line (HOUSE_OFF_STREET) */
export function houseAnchors(centres: readonly P[], box: Box, blocks: readonly Poly[], streets: readonly StreetWay[], inset = HOUSE_INSET): P[] {
  const bb = blocks.map(p => boxOf(p.outer)), out: P[] = [];
  for (const c of centres) {
    if (c[0] < box[0] + inset || c[0] > box[2] - inset || c[1] < box[1] + inset || c[1] > box[3] - inset) continue;
    let bad = false;
    for (let k = 0; k < blocks.length && !bad; k++) { const b = bb[k]; if (b && c[0] >= b[0] && c[0] <= b[2] && c[1] >= b[1] && c[1] <= b[3] && inPoly(blocks[k]!, c[0], c[1])) bad = true; }
    for (let k = 0; k < streets.length && !bad; k++) if (distToLine(streets[k]!.pts, c[0], c[1]) < HOUSE_OFF_STREET) bad = true;
    if (!bad) out.push(c);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// 2. the game's plan: the streets on the map, and the link to the entry road (tiles)
// ---------------------------------------------------------------------------------------------------------------------------------------------
/** a rectangle on the map [x, y, width, height], tiles */
export type Rect = [number, number, number, number];
/** the side of the land the clubhouse parcel and the entry road are on */
export type Side = 'N' | 'E' | 'S' | 'W';
/** the way out of the land on a side: the unit vector from the land to the map's edge */
const OUT: Record<Side, Pt> = { N: { x: 0, y: -1 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 }, E: { x: 1, y: 0 } };

/** what joinEstate reads */
export interface JoinInput {
  /** the spec's streets (flat x, y, tiles of the spec's frame) and where the frame's corner lies on the map */ streets: readonly { pts: readonly number[] }[]; at: Pt;
  /** the entry road, from the map's edge to where the drive starts, and the side of the land it comes in on */ road: Leg; side: Side;
  /** what the link keeps clear of (the clubhouse parcel and the car park) */ keepOut: readonly Rect[];
  /** the course grid with the course painted in (null: nothing to keep clear of but the map) and the map's side, tiles */ grid: Grid | null; map: number;
}
/** what joinEstate made: the streets as legs on the map, the link to the road (one or two legs; none when it failed, and then `why` says), the number of nodes and the link's length */
export interface JoinResult { legs: Leg[]; link: Leg[]; nodes: number; linkTiles: number; why?: string }

/** how far from the road's inner end the link meets the road, tiles (a T on the road, clear of the drive and the junction at the road's end) */
export const LINK_OFF_END = 8;
/** the link keeps this far from the clubhouse parcel and the car park, tiles */
export const LINK_CLEAR = 3;
/** the playing surfaces and hazards the link may not cross (the rough, the fescue and the land's own ground it may) */
const NO_ROAD = new Set<number>([SURF.fairway, SURF.tee, SURF.green, SURF.bunker, SURF.water, SURF.waste]);

/** whether the segment a-b meets the rectangle r grown by `g` */
function segMeetsRect(a: Pt, b: Pt, r: Rect, g: number): boolean {
  const x0 = r[0] - g, y0 = r[1] - g, x1 = r[0] + r[2] + g, y1 = r[1] + r[3] + g, dx = b.x - a.x, dy = b.y - a.y;
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, a.x - x0], [dx, x1 - a.x], [-dy, a.y - y0], [dy, y1 - a.y]] as const) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t0 <= t1;
}
/** whether a straight link from a to b over the grid crosses a playing surface or a hazard (cells sampled every half tile; off the grid it is free) */
function linkOverCourse(g: Grid | null, a: Pt, b: Pt): boolean {
  if (!g) return false;
  const L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(L / CELL_T));
  for (let k = 0; k <= n; k++) {
    const x = a.x + ((b.x - a.x) * k) / n, y = a.y + ((b.y - a.y) * k) / n, cx = Math.floor((x - g.x0) / CELL_T), cy = Math.floor((y - g.y0) / CELL_T);
    if (cx < 0 || cy < 0 || cx >= g.w || cy >= g.h) continue;
    if (NO_ROAD.has(g.surf[cy * g.w + cx]!)) return true;
  }
  return false;
}

/** the streets of a spec on the map as legs, and the one link that joins their network to the entry road: from the street vertex inside the land whose way out (straight towards the map's
 *  edge on the road's side to the row where the link meets the road, then along that row to the road) is the shortest that crosses no playing surface or hazard and keeps clear of the
 *  clubhouse parcel and the car park. With no such way the streets are not laid (`why`): a network the town cannot reach is no estate */
export function joinEstate(i: JoinInput): JoinResult {
  const legs: Leg[] = [], nodes = new Map<string, Pt>();
  for (const s of i.streets) {
    const p = s.pts;
    for (let k = 0; k + 3 < p.length; k += 2) {
      const a: Pt = { x: i.at.x + p[k]!, y: i.at.y + p[k + 1]! }, b: Pt = { x: i.at.x + p[k + 2]!, y: i.at.y + p[k + 3]! };
      if (Math.hypot(b.x - a.x, b.y - a.y) < 0.05) continue;
      legs.push({ a, b });
      for (const q of [a, b]) nodes.set(`${Math.round(q.x * 50)},${Math.round(q.y * 50)}`, q);
    }
  }
  if (!legs.length) return { legs: [], link: [], nodes: 0, linkTiles: 0, why: 'no streets' };
  const o = OUT[i.side], perp: Pt = { x: -o.y, y: o.x }, aOf = (p: Pt): number => p.x * o.x + p.y * o.y, cOf = (p: Pt): number => p.x * perp.x + p.y * perp.y;
  const road = i.road, c0 = cOf(road.a), aEdge = aOf(road.a), aInner = aOf(road.b);
  // the row where the link meets the road: LINK_OFF_END out from its inner end, and no nearer the map's edge than 6 tiles
  const aj = Math.min(aInner + LINK_OFF_END, aEdge - 6);
  if (!(aj > aInner)) return { legs: [], link: [], nodes: nodes.size, linkTiles: 0, why: 'the entry road is too short to join' };
  const cands = [...nodes.values()].filter(n => aOf(n) < aj)
    .map(n => ({ n, len: aj - aOf(n) + Math.abs(cOf(n) - c0) })).sort((p, q) => p.len - q.len || p.n.x - q.n.x || p.n.y - q.n.y);
  const inMap = (p: Pt): boolean => p.x >= 2 && p.y >= 2 && p.x <= i.map - 3 && p.y <= i.map - 3;
  for (const { n, len } of cands) {
    const p1: Pt = { x: n.x + o.x * (aj - aOf(n)), y: n.y + o.y * (aj - aOf(n)) }, p2: Pt = { x: p1.x + perp.x * (c0 - cOf(p1)), y: p1.y + perp.y * (c0 - cOf(p1)) };
    if (!inMap(p1) || !inMap(p2)) continue;
    const link: Leg[] = [];
    if (Math.hypot(p1.x - n.x, p1.y - n.y) > 0.05) link.push({ a: n, b: p1 });
    if (Math.hypot(p2.x - p1.x, p2.y - p1.y) > 0.05) link.push({ a: p1, b: p2 });
    if (!link.length) continue;
    if (link.some(l => i.keepOut.some(r => segMeetsRect(l.a, l.b, r, LINK_CLEAR)) || linkOverCourse(i.grid, l.a, l.b))) continue;
    return { legs, link, nodes: nodes.size, linkTiles: Math.round(len) };
  }
  return { legs: [], link: [], nodes: nodes.size, linkTiles: 0, why: cands.length ? 'no way out of the land to the entry road is clear of the course and the clubhouse' : 'no street lies on the land\'s side of the entry road\'s end' };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// 3. the lots: T353's frames that hold a house of the map (tiles)
// ---------------------------------------------------------------------------------------------------------------------------------------------
/** how near (tiles) a building must be to a lot's rectangle to be taken for its house: a street's lot is 10 tiles wide and 15 deep (lots/lots.ts SIZE), and the map's house may stand just outside the lot the lattice gives it */
export const HOUSE_REACH = 6;

/** the distance from a point to a frame's rectangle (0 inside) */
export function rectDist(f: Pick<Frame, 'o' | 'u' | 'n' | 'w' | 'd'>, x: number, y: number): number {
  const dx = x - f.o.x, dy = y - f.o.y, a = dx * f.u.x + dy * f.u.y, b = dx * f.n.x + dy * f.n.y;
  return Math.hypot(Math.max(-a, 0, a - f.w), Math.max(-b, 0, b - f.d));
}

/** the frames of `frames` that hold a house: each anchor, in the order given, takes the nearest frame within `reach` that no earlier anchor took (ties: the earlier frame). A building
 *  with no frame in reach (no street beside it) gets none. The frames come back in their own order */
export function framesAtBuildings(frames: readonly Frame[], anchors: readonly Pt[], reach = HOUSE_REACH): Frame[] {
  const taken = new Set<number>();
  for (const a of anchors) {
    let best = -1, bd = Infinity;
    for (let k = 0; k < frames.length; k++) {
      if (taken.has(k)) continue;
      const f = frames[k]!, c0 = f.o.x + f.u.x * f.w / 2 + f.n.x * f.d / 2, c1 = f.o.y + f.u.y * f.w / 2 + f.n.y * f.d / 2;
      if (Math.abs(c0 - a.x) > f.w + f.d + reach || Math.abs(c1 - a.y) > f.w + f.d + reach) continue; // (a quick miss; a frame's rectangle is within w + d of its centre)
      const d = rectDist(f, a.x, a.y);
      if (d <= reach && d < bd - 1e-9) { bd = d; best = k; }
    }
    if (best >= 0) taken.add(best);
  }
  return frames.filter((_, k) => taken.has(k));
}
