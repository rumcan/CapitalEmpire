// Car parks (Phase 5 step 3a): the rectangles beside a ground road, their entrances on that frontage road, and their bays in rows
// along it. Pure TS, no DOM: the City builds the parks and the sim's sinks read the entrances. Tiles of 2 m; the rects are integer.
import { MAP } from '../iso';
import { TC } from '../terrain/types';
import { SK, type Pt, type RoadNetwork, type Seg } from '../network';
import type { Site } from './site';
import { AISLE, BAY_D, BAY_W, ENTRANCE_EVERY, FRONT_GAP, LOT_TILE_COST, MAX_ENTRANCES, MIN_PARK } from './config';

/** a car park as the player places it: an axis-aligned rect (top-left tile x, y, size w, h in tiles; integer corners) */
export interface CarParkDef { id: number; x: number; y: number; w: number; h: number }
/** a bay: its centre (tiles) and its facing (0 +x, 1 +y, 2 -x, 3 -y) */
export interface Bay { x: number; y: number; dir: 0 | 1 | 2 | 3 }
/** a built car park: its def, the frontage edge (side: 0 x=x+w (east), 1 y=y+h (south), 2 x=x (west), 3 y=y (north)), the frontage road
 *  seg, the entrances (on its centre line), and the bays (nearest an entrance first) */
export interface CarPark extends CarParkDef { side: 0 | 1 | 2 | 3; seg: Seg; entrances: Pt[]; bays: Bay[] }
/** a car park's counts for the frame: its id, bays, cars parked and cars turned away */
export interface ParkView { id: number; bays: number; parked: number; turned: number }

/** the outward unit normal of each side (also the facing of a bay that faces its frontage): +x, +y, -x, -y */
const OUT: Pt[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
/** the frontage's seg must overlap the edge by this many tiles at least */
const MIN_OVERLAP = 8;
/** the car park keeps this many tiles from the map's edges */
const EDGE = 8;

/** the frontage of a car park: the ground road seg beside one of its edges (parallel to it, outside it, its verge within FRONT_GAP of the
 *  edge, overlapping the edge by at least MIN_OVERLAP tiles), the longest overlap wins (ties: the lower side), and the entrances: one per
 *  ENTRANCE_EVERY tiles of overlap (1 to MAX_ENTRANCES), evenly spaced along it, on the seg's centre line. Null if there is none. */
export function frontage(net: RoadNetwork, d: CarParkDef): { side: 0 | 1 | 2 | 3; seg: Seg; entrances: Pt[] } | null {
  const r = Math.max(d.w, d.h) / 2 + FRONT_GAP + 8;
  const near = net.segsNear({ x: d.x + d.w / 2, y: d.y + d.h / 2 }, r);
  let best: { side: 0 | 1 | 2 | 3; seg: Seg; lo: number; ov: number; ea: 'x' | 'y' } | null = null;
  for (let si = 0; si < 4; si++) {
    const side = si as 0 | 1 | 2 | 3;
    const vert = side % 2 === 0, o = OUT[side]!;
    const edge = vert ? d.x + (o.x > 0 ? d.w : 0) : d.y + (o.y > 0 ? d.h : 0);
    const e0 = vert ? d.y : d.x, e1 = e0 + (vert ? d.h : d.w), ea = vert ? 'y' : 'x';
    for (const s of near) {
      if (s.kind !== SK.GROUND) continue;
      const along = vert ? s.b.y - s.a.y : s.b.x - s.a.x, L = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
      if (!L || Math.abs(along) / L <= 0.98) continue;
      const c = vert ? (s.a.x + s.b.x) / 2 : (s.a.y + s.b.y) / 2;
      if ((c - edge) * (vert ? o.x : o.y) < 0) continue;
      const verge = Math.abs(c - edge) - (s.cls.h + s.cls.walk);
      if (verge < 0 || verge > FRONT_GAP) continue;
      const lo = Math.max(e0, vert ? Math.min(s.a.y, s.b.y) : Math.min(s.a.x, s.b.x)), hi = Math.min(e1, vert ? Math.max(s.a.y, s.b.y) : Math.max(s.a.x, s.b.x));
      const ov = hi - lo;
      if (ov < MIN_OVERLAP) continue;
      if (!best || ov > best.ov) best = { side, seg: s, lo, ov, ea };
    }
  }
  if (!best) return null;
  const { side, seg, lo, ov, ea } = best, n = Math.min(MAX_ENTRANCES, Math.max(1, Math.round(ov / ENTRANCE_EVERY)));
  const entrances: Pt[] = [];
  for (let k = 0; k < n; k++) {
    // the point of the centre line at the along-coordinate t (the seg is parallel to the edge, so its span along ea is not zero)
    const t = lo + (k + 0.5) * ov / n, lam = (t - seg.a[ea]) / (seg.b[ea] - seg.a[ea]);
    entrances.push({ x: seg.a.x + (seg.b.x - seg.a.x) * lam, y: seg.a.y + (seg.b.y - seg.a.y) * lam });
  }
  return { side, seg, entrances };
}

/** the bays of a car park on the frontage side (sides as in CarPark): rows parallel to the frontage, depth from the frontage edge:
 *  [AISLE][BAY_D row facing the frontage][BAY_D row facing away][AISLE] repeated while a whole row fits; each row is BAY_W bays along the
 *  frontage, one tile clear at both ends. A bay's point is its centre. Sorted by the distance to the nearest entrance (ties: the row order). */
export function bayGrid(d: CarParkDef, side: 0 | 1 | 2 | 3, entrances: Pt[]): Bay[] {
  const vert = side % 2 === 0, o = OUT[side]!;
  const L = vert ? d.h : d.w, D = vert ? d.w : d.h;
  const edgeX = d.x + (o.x > 0 ? d.w : 0), edgeY = d.y + (o.y > 0 ? d.h : 0);
  const n = Math.max(0, Math.floor((L - 2) / BAY_W)), bays: Bay[] = [];
  let pos = AISLE;
  for (let r = 0; pos + BAY_D <= D; r++) {
    const dc = pos + BAY_D / 2, dir = (r % 2 === 0 ? side : (side + 2) % 4) as 0 | 1 | 2 | 3;
    for (let k = 0; k < n; k++) {
      const t = 1 + (k + 0.5) * BAY_W;
      bays.push(vert ? { x: edgeX - o.x * dc, y: d.y + t, dir } : { x: d.x + t, y: edgeY - o.y * dc, dir });
    }
    pos += BAY_D; if (r % 2 === 1) pos += AISLE;
  }
  const keyed = bays.map(b => {
    let m = Infinity;
    for (const e of entrances) m = Math.min(m, Math.hypot(b.x - e.x, b.y - e.y));
    return { b, m };
  });
  keyed.sort((p, q) => p.m - q.m);
  return keyed.map(k => k.b);
}

/** a built car park of def d on net, or null: no frontage, or fewer than 10 bays */
export function buildPark(net: RoadNetwork, d: CarParkDef): CarPark | null {
  const f = frontage(net, d);
  if (!f) return null;
  const bays = bayGrid(d, f.side, f.entrances);
  if (bays.length < 10) return null;
  return { ...d, side: f.side, seg: f.seg, entrances: f.entrances, bays };
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
/** the distance from segment ab to the rect d (0 if they touch) */
function segRect(a: Pt, b: Pt, d: CarParkDef): number {
  const x0 = d.x, y0 = d.y, x1 = d.x + d.w, y1 = d.y + d.h;
  const inside = (p: Pt) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
  if (inside(a) || inside(b)) return 0;
  const C = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  let m = Infinity;
  for (let k = 0; k < 4; k++) {
    const p = C[k]!, q = C[(k + 1) % 4]!;
    if (crosses(a, b, p, q)) return 0;
    m = Math.min(m, pointSeg(p, a, b), pointSeg(q, a, b), pointSeg(a, p, q), pointSeg(b, p, q));
  }
  return m;
}

/** '' if car park d may be placed on the terrain classes cls (MAP x MAP) beside net, else the reason: a side under MIN_PARK; not EDGE
 *  tiles inside the map; a tile not GROUND or PATCH; a road whose verge (centre line closer than its h + walk) reaches the rect; the
 *  stadium's site (site, grown by 2 tiles); another car park (others, by id); no frontage (see frontage) */
export function parkValid(d: CarParkDef, cls: Uint8Array, net: RoadNetwork, site: Site | null, others: CarParkDef[]): string {
  if (d.w < MIN_PARK || d.h < MIN_PARK) return `too small: the sides must be at least ${MIN_PARK} tiles`;
  if (d.x < EDGE || d.y < EDGE || d.x + d.w > MAP - EDGE || d.y + d.h > MAP - EDGE) return `too close to the edge of the map (${EDGE} tiles)`;
  for (let y = d.y; y < d.y + d.h; y++) for (let x = d.x; x < d.x + d.w; x++) {
    const c = cls[y * MAP + x];
    if (c !== TC.GROUND && c !== TC.PATCH) return 'not on buildable ground';
  }
  const r = Math.max(d.w, d.h) / 2 + EDGE;
  for (const s of net.segsNear({ x: d.x + d.w / 2, y: d.y + d.h / 2 }, r)) {
    if (segRect(s.a, s.b, d) < s.cls.h + s.cls.walk) return 'a road runs over it';
  }
  if (site && d.x < site.x + site.w + 2 && d.x + d.w > site.x - 2 && d.y < site.y + site.h + 2 && d.y + d.h > site.y - 2) return 'overlaps the stadium site';
  for (const o of others) {
    if (o.id !== d.id && d.x < o.x + o.w && d.x + d.w > o.x && d.y < o.y + o.h && d.y + d.h > o.y) return 'overlaps another car park';
  }
  if (!frontage(net, d)) return 'no road along its sides';
  return '';
}
