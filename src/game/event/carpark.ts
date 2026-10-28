// Car parks (Phase 5 step 3a; stamps at any angle, docs/PARKING.md section 1): the rectangles beside a ground road, their entrances on that
// frontage road, and their bays in rows along it. A park may be turned (a, degrees) and have angled bays (bay 90 | 60 | 45); with a absent or 0
// and bay absent or 90 every function is the axis rect of the first version. Pure TS, no DOM: the City builds the parks and the sim's sinks
// read the entrances. Tiles of 2 m; the axis rects are integer.
import { MAP } from '../iso';
import { TC } from '../terrain/types';
import { SK, type Pt, type RoadNetwork, type Seg } from '../network';
import type { Site } from './site';
import { looseBays, type LooseGround } from '../golf/rangelot';
import { AISLE, BAY_D, BAY_W, ENTRANCE_EVERY, FRONT_GAP, LOT_TILE_COST, MAX_ENTRANCES, MIN_PARK } from './config';

/** a car park as the player places it: a rect (top-left corner x, y, sides w, h in tiles; integer corners for an axis rect) */
export interface CarParkDef {
  id: number; x: number; y: number; w: number; h: number;
  /** the angle of its w side, degrees (absent: 0, today's axis rect) */
  a?: number;
  /** the bays' angle to the aisle (absent: 90) */
  bay?: 90 | 60 | 45;
  /** T239: an unpaved lot (the range start's car park before it is paved): packed dirt or gravel, its cars in loose rows (golf/rangelot.ts
   *  looseBays: fewer bays, unmarked, a little askew); absent: paved */
  ground?: LooseGround;
}
/** a bay: its centre (world tiles), its facing (0 +x, 1 +y, 2 -x, 3 -y: the nearest of the four to its heading), its heading (hx, hy) and the row
 *  direction (tx, ty) along the frontage (both unit vectors, world) */
export interface Bay {
  x: number; y: number; dir: 0 | 1 | 2 | 3;
  /** its heading (unit; the way the car faces) */
  hx: number; hy: number;
  /** the row direction (unit, world) */
  tx: number; ty: number;
}
/** a built car park: its def, the frontage edge (side, in the park's own frame: 0 its x = w edge, 1 its y = h edge, 2 its x = 0 edge, 3 its y = 0
 *  edge), the frontage road seg (the real seg), the entrances (on its centre line), the bays (nearest an entrance first) and pv */
export interface CarPark extends CarParkDef {
  side: 0 | 1 | 2 | 3; seg: Seg; entrances: Pt[]; bays: Bay[];
  /** the unit vector from the frontage road into the park (world) */
  pv: Pt;
  /** an on-street run (see curb.ts): its sinks are on the run's own direction only */
  curb?: boolean;
}
/** a car park's counts for the frame: its id, bays, cars parked and cars turned away */
export interface ParkView { id: number; bays: number; parked: number; turned: number }
/** a park's frame: its origin o (world) and the unit vectors u (along its w side) and v (along its h side), world */
export interface ParkFrame { o: Pt; u: Pt; v: Pt }

/** the outward unit normal of each side (also the facing of a bay that faces its frontage): +x, +y, -x, -y */
const OUT: Pt[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
/** a bay angle's sine and cosine (to the aisle): the row pitch is BAY_W / s, the row depth BAY_D * s + BAY_W * c */
const BAY_SC: Record<90 | 60 | 45, { s: number; c: number }> = { 90: { s: 1, c: 0 }, 60: { s: Math.sqrt(3) / 2, c: 0.5 }, 45: { s: Math.SQRT1_2, c: Math.SQRT1_2 } };
/** the frontage's seg must overlap the edge by this many tiles at least */
const MIN_OVERLAP = 8;
/** the car park keeps this many tiles from the map's edges */
const EDGE = 8;

/** the frame of park d: origin (d.x, d.y), u = (cos a, sin a), v = (-sin a, cos a); a absent or 0 is the axis frame (exactly u = (1, 0), v = (0, 1)) */
export function parkFrame(d: CarParkDef): ParkFrame {
  const o = { x: d.x, y: d.y };
  if (!d.a) return { o, u: { x: 1, y: 0 }, v: { x: 0, y: 1 } };
  const r = d.a * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return { o, u: { x: c, y: s }, v: { x: -s, y: c } };
}
/** the local point (along w, along h) of world point p in d's frame: (dot(p - o, u), dot(p - o, v)) */
export function toLocal(d: CarParkDef, p: Pt): Pt {
  const F = parkFrame(d), dx = p.x - F.o.x, dy = p.y - F.o.y;
  return { x: dx * F.u.x + dy * F.u.y, y: dx * F.v.x + dy * F.v.y };
}
/** the world point of local point q of park d: o + u q.x + v q.y */
export function toWorld(d: CarParkDef, q: Pt): Pt {
  const F = parkFrame(d), w = vecW(F, q.x, q.y);
  return { x: F.o.x + w.x, y: F.o.y + w.y };
}
/** the world vector of the local vector (x, y) in frame F (rotation only; + 0 turns a -0 into 0) */
const vecW = (F: ParkFrame, x: number, y: number): Pt => ({ x: F.u.x * x + F.v.x * y + 0, y: F.u.y * x + F.v.y * y + 0 });
/** the 4 world corners of park d in order: local (0, 0), (w, 0), (w, h), (0, h) */
export function parkCorners(d: CarParkDef): Pt[] {
  return [toWorld(d, { x: 0, y: 0 }), toWorld(d, { x: d.w, y: 0 }), toWorld(d, { x: d.w, y: d.h }), toWorld(d, { x: 0, y: d.h })];
}
/** the world axis box of park d (its corners' box; for an axis park, its own rect) */
export function parkBox(d: CarParkDef): { x: number; y: number; w: number; h: number } {
  if (!d.a) return { x: d.x, y: d.y, w: d.w, h: d.h };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of parkCorners(d)) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
/** true if the world point p is inside park d (its local point in [0, w] x [0, h]) */
export function inPark(d: CarParkDef, p: Pt): boolean {
  const q = toLocal(d, p);
  return q.x >= 0 && q.x <= d.w && q.y >= 0 && q.y <= d.h;
}

/** the frontage of a car park: the ground road seg beside one of its edges (parallel to it, outside it, its verge within FRONT_GAP of the
 *  edge, overlapping the edge by at least MIN_OVERLAP tiles), the longest overlap wins (ties: the lower side), and the entrances: one per
 *  ENTRANCE_EVERY tiles of overlap (1 to MAX_ENTRANCES), evenly spaced along it, on the seg's centre line. Null if there is none.
 *  Worked in the park's own frame (toLocal of the segs; the entrances back by toWorld). */
export function frontage(net: RoadNetwork, d: CarParkDef): { side: 0 | 1 | 2 | 3; seg: Seg; entrances: Pt[] } | null {
  // a turned park's corners lie farther from its centre than half its longer side
  const r = (d.a ? Math.hypot(d.w, d.h) : Math.max(d.w, d.h)) / 2 + FRONT_GAP + 8;
  // a cart path (T084: noCars) is no frontage: no car could reach the park along it
  const near = [...net.segsNear(toWorld(d, { x: d.w / 2, y: d.h / 2 }), r)].filter(s => !s.cls.noCars);
  let best: { side: 0 | 1 | 2 | 3; seg: Seg; A: Pt; B: Pt; lo: number; ov: number; ea: 'x' | 'y' } | null = null;
  for (let si = 0; si < 4; si++) {
    const side = si as 0 | 1 | 2 | 3;
    const vert = side % 2 === 0, o = OUT[side]!;
    const edge = vert ? (o.x > 0 ? d.w : 0) : (o.y > 0 ? d.h : 0);
    const e1 = vert ? d.h : d.w, ea = vert ? 'y' : 'x';
    for (const s of near) {
      if (s.kind !== SK.GROUND) continue;
      const A = toLocal(d, s.a), B = toLocal(d, s.b);
      const along = vert ? B.y - A.y : B.x - A.x, L = Math.hypot(B.x - A.x, B.y - A.y);
      if (!L || Math.abs(along) / L <= 0.98) continue;
      const c = vert ? (A.x + B.x) / 2 : (A.y + B.y) / 2;
      if ((c - edge) * (vert ? o.x : o.y) < 0) continue;
      const verge = Math.abs(c - edge) - (s.cls.h + s.cls.walk);
      if (verge < 0 || verge > FRONT_GAP) continue;
      const lo = Math.max(0, vert ? Math.min(A.y, B.y) : Math.min(A.x, B.x)), hi = Math.min(e1, vert ? Math.max(A.y, B.y) : Math.max(A.x, B.x));
      const ov = hi - lo;
      if (ov < MIN_OVERLAP) continue;
      if (!best || ov > best.ov) best = { side, seg: s, A, B, lo, ov, ea };
    }
  }
  if (!best) return null;
  const { side, seg, A, B, lo, ov, ea } = best, n = Math.min(MAX_ENTRANCES, Math.max(1, Math.round(ov / ENTRANCE_EVERY)));
  const entrances: Pt[] = [];
  for (let k = 0; k < n; k++) {
    // the point of the centre line at the along-coordinate t (the seg is parallel to the edge, so its span along ea is not zero)
    const t = lo + (k + 0.5) * ov / n, lam = (t - A[ea]) / (B[ea] - A[ea]);
    entrances.push(toWorld(d, { x: A.x + (B.x - A.x) * lam, y: A.y + (B.y - A.y) * lam }));
  }
  return { side, seg, entrances };
}

/** the bays of a car park on the frontage side (sides as in CarPark): rows parallel to the frontage, depth from the frontage edge:
 *  [AISLE][row facing the frontage][row facing away][AISLE] repeated while a whole row fits. Each row holds the bays along the frontage, one
 *  tile clear at both ends, BAY_W / sin(bay) apart. A bay is BAY_D long, its heading (the facing turned by 90 - bay degrees towards the row
 *  direction) in the park's frame, then turned by the park's angle. A bay's point is its centre. Sorted by the distance to the nearest
 *  entrance (ties: the row order). */
export function bayGrid(d: CarParkDef, side: 0 | 1 | 2 | 3, entrances: Pt[]): Bay[] {
  const vert = side % 2 === 0, o = OUT[side]!, T: Pt = vert ? { x: 0, y: 1 } : { x: 1, y: 0 }, F = parkFrame(d);
  const { s, c } = BAY_SC[d.bay ?? 90];
  const pitch = BAY_W / s, depth = BAY_D * s + BAY_W * c;
  const L = vert ? d.h : d.w, D = vert ? d.w : d.h;
  const edgeX = o.x > 0 ? d.w : 0, edgeY = o.y > 0 ? d.h : 0;
  const n = Math.max(0, Math.floor((L - 2) / pitch)), bays: Bay[] = [];
  let pos = AISLE;
  for (let r = 0; pos + depth <= D; r++) {
    const dc = pos + depth / 2, dir = (r % 2 === 0 ? side : (side + 2) % 4) as 0 | 1 | 2 | 3, f = OUT[dir]!;
    const hw = vecW(F, s * f.x + c * T.x, s * f.y + c * T.y), tw = vecW(F, T.x, T.y);
    let wd = 0, bestDot = -Infinity;
    for (let k = 0; k < 4; k++) { const dot = hw.x * OUT[k]!.x + hw.y * OUT[k]!.y; if (dot > bestDot) { bestDot = dot; wd = k; } }
    for (let k = 0; k < n; k++) {
      const t = 1 + (k + 0.5) * pitch;
      const p = toWorld(d, vert ? { x: edgeX - o.x * dc, y: t } : { x: t, y: edgeY - o.y * dc });
      bays.push({ x: p.x, y: p.y, dir: wd as 0 | 1 | 2 | 3, hx: hw.x, hy: hw.y, tx: tw.x, ty: tw.y });
    }
    pos += depth; if (r % 2 === 1) pos += AISLE;
  }
  const keyed = bays.map(b => {
    let m = Infinity;
    for (const e of entrances) m = Math.min(m, Math.hypot(b.x - e.x, b.y - e.y));
    return { b, m };
  });
  keyed.sort((p, q) => p.m - q.m);
  return keyed.map(k => k.b);
}

/** a built car park of def d on net, or null: no frontage, or fewer than 10 bays. pv is the frontage's outward normal, turned into the world */
export function buildPark(net: RoadNetwork, d: CarParkDef): CarPark | null {
  const f = frontage(net, d);
  if (!f) return null;
  const grid = bayGrid(d, f.side, f.entrances);
  if (grid.length < 10) return null;
  const bays = d.ground ? looseBays(grid, d.ground) : grid;
  const F = parkFrame(d), pv = vecW(F, -OUT[f.side]!.x, -OUT[f.side]!.y);
  return { ...d, side: f.side, seg: f.seg, entrances: f.entrances, bays, pv };
}

/** the two long side lines of a bay, world, as [x0, y0, x1, y1, x0, y0, x1, y1]: each BAY_D long along the heading (hx, hy), centred on the bay,
 *  the two lines BAY_W / sin(bay) apart along the row direction (tx, ty) (so BAY_W apart across the row). sin is |cross(t, h)|; for 90 it is 1 */
export function bayLines(b: Bay, bay: 90 | 60 | 45 = 90): number[] {
  const s = bay === 90 ? 1 : Math.abs(b.tx * b.hy - b.ty * b.hx), half = BAY_W / s / 2, hl = BAY_D / 2, out: number[] = [];
  for (const sg of [-1, 1]) {
    const cx = b.x + sg * b.tx * half, cy = b.y + sg * b.ty * half;
    out.push(cx - b.hx * hl, cy - b.hy * hl, cx + b.hx * hl, cy + b.hy * hl);
  }
  return out;
}

/** a car park's cost, $ (its tiles at LOT_TILE_COST) */
export const parkCost = (d: CarParkDef): number => d.w * d.h * LOT_TILE_COST;

/** the distance from point p to segment ab */
function pointSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}
/** true if the segments ab and pq cross or touch */
function crosses(a: Pt, b: Pt, p: Pt, q: Pt): boolean {
  const o = (u: Pt, v: Pt, w: Pt) => (v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x);
  return o(a, b, p) * o(a, b, q) <= 0 && o(p, q, a) * o(p, q, b) <= 0;
}
/** the distance from segment ab to the rect {0, 0, w, h} (a park's local frame; 0 if they touch) */
function segRect(a: Pt, b: Pt, w: number, h: number): number {
  const inside = (p: Pt) => p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h;
  if (inside(a) || inside(b)) return 0;
  const C = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  let m = Infinity;
  for (let k = 0; k < 4; k++) {
    const p = C[k]!, q = C[(k + 1) % 4]!;
    if (crosses(a, b, p, q)) return 0;
    m = Math.min(m, pointSeg(p, a, b), pointSeg(q, a, b), pointSeg(a, p, q), pointSeg(b, p, q));
  }
  return m;
}

/** true if the convex quads p and q (corner lists, world) overlap: a separating axis test on the edge normals of both. Touching does not count */
export function quadsOverlap(p: Pt[], q: Pt[]): boolean {
  for (const P of [p, q]) for (let k = 0; k < P.length; k++) {
    const a = P[k]!, b = P[(k + 1) % P.length]!, nx = a.y - b.y, ny = b.x - a.x, L = Math.hypot(nx, ny);
    if (!L) continue;
    let p0 = Infinity, p1 = -Infinity, q0 = Infinity, q1 = -Infinity;
    for (const v of p) { const z = (v.x * nx + v.y * ny) / L; p0 = Math.min(p0, z); p1 = Math.max(p1, z); }
    for (const v of q) { const z = (v.x * nx + v.y * ny) / L; q0 = Math.min(q0, z); q1 = Math.max(q1, z); }
    if (p1 <= q0 + 1e-9 || q1 <= p0 + 1e-9) return false;
  }
  return true;
}

/** '' if car park d may be placed on the terrain classes cls (MAP x MAP) beside net, else the reason: a side under MIN_PARK; not EDGE
 *  tiles inside the map (its box); a tile whose centre is in the park not GROUND or PATCH; a road whose verge (centre line closer than its h +
 *  walk) reaches the park; the stadium's site (site, grown by 2 tiles, its box); another car park (others, by id: rects, or the corner quads
 *  when either is turned); no frontage (see frontage). Road segs are tested in the park's own frame */
export function parkValid(d: CarParkDef, cls: Uint8Array, net: RoadNetwork, site: Site | null, others: CarParkDef[]): string {
  if (d.w < MIN_PARK || d.h < MIN_PARK) return `too small: the sides must be at least ${MIN_PARK} tiles`;
  const box = parkBox(d);
  if (box.x < EDGE || box.y < EDGE || box.x + box.w > MAP - EDGE || box.y + box.h > MAP - EDGE) return `too close to the edge of the map (${EDGE} tiles)`;
  for (let y = Math.floor(box.y); y < box.y + box.h; y++) for (let x = Math.floor(box.x); x < box.x + box.w; x++) {
    if (!inPark(d, { x: x + 0.5, y: y + 0.5 })) continue;
    const c = cls[y * MAP + x];
    if (c !== TC.GROUND && c !== TC.PATCH) return 'not on buildable ground';
  }
  const r = (d.a ? Math.hypot(d.w, d.h) : Math.max(d.w, d.h)) / 2 + EDGE;
  for (const s of net.segsNear(toWorld(d, { x: d.w / 2, y: d.h / 2 }), r)) {
    if (segRect(toLocal(d, s.a), toLocal(d, s.b), d.w, d.h) < s.cls.h + s.cls.walk) return 'a road runs over it';
  }
  if (site && box.x < site.x + site.w + 2 && box.x + box.w > site.x - 2 && box.y < site.y + site.h + 2 && box.y + box.h > site.y - 2) return 'overlaps the stadium site';
  for (const o of others) {
    if (o.id === d.id) continue;
    const hit = !d.a && !o.a
      ? d.x < o.x + o.w && d.x + d.w > o.x && d.y < o.y + o.h && d.y + d.h > o.y
      : quadsOverlap(parkCorners(d), parkCorners(o));
    if (hit) return 'overlaps another car park';
  }
  if (!frontage(net, d)) return 'no road along its sides';
  return '';
}
