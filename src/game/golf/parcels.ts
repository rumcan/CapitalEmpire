// Course land ownership as a rectangle list, adjacent block pricing by land class and buildings, adjacency checks, and GolfSave.parcel bounds (docs/GOLF-PLAN.md sections 3 and 4.4); the road rules on that land (T124: only the course's paths and drives; T355: streets too, never over a hole's playing surfaces). Pure TS, no DOM.
import type { Rect } from './mode';
import { TILE_M } from './types';
import { CELL_T, SURF, cellAt, type Grid } from '../ext/course-grid';
import { isCourseClass, type Family, type RoadClass } from '../network';

/** land class of a candidate block beside the course (GOLF-PLAN 4.4) */
export type ParcelLandClass = 'farm' | 'open' | 'town' | 'commercial' | 'industrial' | 'unbuildable';

/** base 1985 $/m² by land class (houses on a town block are bought out at the land price per GOLF-PLAN 4.4) */
export const LAND_PRICE_SQM: Record<ParcelLandClass, number> = {
  farm: 1,
  open: 1.25,
  town: 2,
  industrial: 3,
  commercial: 4,
  unbuildable: Infinity,
};

/** buyout surcharge ($) per non-residential building on a block (houses add $0 per GOLF-PLAN 4.4 so buying never becomes a demolition puzzle) */
export const BUILDING_SURCHARGE = 4000;

/** surcharge ($) per house on a block (0 per GOLF-PLAN 4.4: "the houses go and the price is the same as for empty land") */
export const HOUSE_SURCHARGE = 0;

/** gentle price rise per 1,000 town residents above the 1,000-resident start (GOLF-PLAN 3 and 4.4) */
export const POP_GROWTH_RATE = 0.05;

/** a candidate block to buy adjacent to the course parcel list */
export interface AdjacentBlock {
  rect: Rect;
  landClass: ParcelLandClass;
  /** residential houses on the block (bought out at the land price: $0 extra per house) */
  houses?: number;
  /** non-residential buildings (shops, works, farmsteads) on the block */
  buildings?: number;
  /** current town population (optional; scales price gently above 1,000 residents) */
  townPop?: number;
  /** T395: the map's side in tiles. Given, a block that leaves the map (or is bigger than MAX_BLOCK_SIDE) is refused: land that does not exist is never bought.
   *  Absent: no bound is checked (the callers before T395) */
  map?: number;
}

/** result of attempting to buy an adjacent block */
export interface BuyBlockResult {
  ok: boolean;
  parcels: Rect[];
  bounds: Rect;
  price: number;
  reason?: string;
}

/** whether a rectangle has positive width and height */
export function validRect(r: Rect): boolean { return r[2] > 0 && r[3] > 0; }

/** area of a single Rect [x, y, w, h] in square metres (1 tile² = TILE_M² = 4 m²) */
export function rectAreaSqm(r: Rect): number { return validRect(r) ? r[2] * r[3] * TILE_M * TILE_M : 0; }

/** merge a list of owned Rects [x, y, w, h] into a single bounding Rect [x, y, w, h] matching GolfSave.parcel style ([0, 0, 0, 0] when empty) */
export function mergeParcelBounds(parcels: readonly Rect[]): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of parcels) {
    if (!validRect(r)) continue;
    if (r[0] < x0) x0 = r[0];
    if (r[1] < y0) y0 = r[1];
    if (r[0] + r[2] > x1) x1 = r[0] + r[2];
    if (r[1] + r[3] > y1) y1 = r[1] + r[3];
  }
  return x0 <= x1 && y0 <= y1 ? [x0, y0, x1 - x0, y1 - y0] : [0, 0, 0, 0];
}

/** initial owned parcel list from a placed course plan (course, venue, carpark) */
export function courseParcelList(plan: { course: Rect; venue: Rect; carpark: Rect }): Rect[] {
  return [plan.course, plan.venue, plan.carpark];
}

/** whether point (x, y) in tiles lies inside or on the boundary of Rect r */
export function inRect(r: Rect, x: number, y: number): boolean {
  return validRect(r) && x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
}

/** whether point (x, y) in tiles lies in any Rect of the owned parcel list */
export function inParcels(parcels: readonly Rect[], x: number, y: number): boolean {
  for (const r of parcels) if (inRect(r, x, y)) return true;
  return false;
}

/** whether every corner of polygon pts (x0, y0, x1, y1, ...) lies in the owned parcel list */
export function polyInParcels(parcels: readonly Rect[], pts: readonly number[]): boolean {
  if (pts.length < 6) return false;
  for (let i = 0; i + 1 < pts.length; i += 2) if (!inParcels(parcels, pts[i]!, pts[i + 1]!)) return false;
  return true;
}

/** whether two Rects have a positive-area interior overlap */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  if (!validRect(a) || !validRect(b)) return false;
  return Math.min(a[0] + a[2], b[0] + b[2]) > Math.max(a[0], b[0]) && Math.min(a[1] + a[3], b[1] + b[3]) > Math.max(a[1], b[1]);
}

/** whether two non-overlapping Rects share a boundary edge segment of positive length (corner-only contact is false) */
export function rectsTouchEdge(a: Rect, b: Rect): boolean {
  if (!validRect(a) || !validRect(b) || rectsOverlap(a, b)) return false;
  const xTouch = a[0] + a[2] === b[0] || b[0] + b[2] === a[0];
  const yOverlap = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  if (xTouch && yOverlap > 0) return true;
  const yTouch = a[1] + a[3] === b[1] || b[1] + b[3] === a[1];
  const xOverlap = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  return yTouch && xOverlap > 0;
}

/** whether candidate Rect is disjoint in interior from all owned parcels and shares a positive-length edge with at least one */
export function isAdjacentBlock(parcels: readonly Rect[], candidate: Rect): boolean {
  if (!validRect(candidate) || parcels.length === 0) return false;
  for (const r of parcels) if (rectsOverlap(r, candidate)) return false;
  for (const r of parcels) if (rectsTouchEdge(r, candidate)) return true;
  return false;
}

/** the side of a block of land for sale, tiles (80 m) */
export const LAND_BLOCK = 40;
/** the longest side of a block that can be bought, tiles (512 m): a block of land for sale is LAND_BLOCK, and a computed one (a real-course import, a script) is at most a
 *  few of them. Past it a rect is no block: it is refused before anything walks its tiles or asks the network about it (T395) */
export const MAX_BLOCK_SIDE = 256;
/** T395 (#1062: a block of 1e9 tiles froze the tab, and one off the edge was bought and owned land that does not exist): the block asked for, cut at the map's edge, or why it
 *  cannot be bought. Refused: a rect that is not a number's worth of tiles (NaN, infinite, empty), a side past MAX_BLOCK_SIDE (judged as asked, before it is cut: a rect that
 *  wide is not a block that happens to run off the map), a block with none of it on the map. A block partly off the map comes back as the part that is on it (what exists is
 *  what is bought, and charged). Cheap and exact: no tile is walked, so the engine asks it first */
export function clampBlock(r: Rect, map: number): { rect: Rect } | { why: string } {
  if (![r[0], r[1], r[2], r[3], map].every(Number.isFinite) || !validRect(r)) return { why: 'Invalid block dimensions' };
  if (r[2] > MAX_BLOCK_SIDE || r[3] > MAX_BLOCK_SIDE) return { why: `Too big a block: at most ${MAX_BLOCK_SIDE} tiles a side` };
  const x0 = Math.max(0, r[0]), y0 = Math.max(0, r[1]), x1 = Math.min(map, r[0] + r[2]), y1 = Math.min(map, r[1] + r[3]);
  if (!(x1 > x0 && y1 > y0)) return { why: 'Off the map: there is no land to buy there' };
  return { rect: [x0, y0, x1 - x0, y1 - y0] };
}

/** the length (tiles) of the boundary two non-overlapping Rects share (0: apart, or touching at a corner only) */
export function sharedEdge(a: Rect, b: Rect): number {
  if (!validRect(a) || !validRect(b) || rectsOverlap(a, b)) return 0;
  if (a[0] + a[2] === b[0] || b[0] + b[2] === a[0]) return Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  if (a[1] + a[3] === b[1] || b[1] + b[3] === a[1]) return Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  return 0;
}

/** a road piece for the land check: its centre line (tiles) and its half width with its walk (tiles) */
export interface LandRoad { ax: number; ay: number; bx: number; by: number; hw: number }
/** whether segment a-b crosses or lies in rect r (Liang-Barsky clipping) */
function segHitsRect(r: Rect, ax: number, ay: number, bx: number, by: number): boolean {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay, p = [-dx, dx, -dy, dy], q = [ax - r[0], r[0] + r[2] - ax, ay - r[1], r[1] + r[3] - ay];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i]! < 0) return false; continue; }
    const t = q[i]! / p[i]!;
    if (p[i]! < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}
/** the distance (tiles) from point (x, y) to segment a-b */
function distToSeg(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}
/** whether any road's tiles (its centre line widened by its half width and walk) reach into block r: the block would take a public road */
export function blockOnRoad(r: Rect, roads: readonly LandRoad[]): boolean {
  const x1 = r[0] + r[2], y1 = r[1] + r[3], toRect = (x: number, y: number) => Math.hypot(Math.max(r[0] - x, 0, x - x1), Math.max(r[1] - y, 0, y - y1));
  for (const s of roads) {
    if (segHitsRect(r, s.ax, s.ay, s.bx, s.by)) return true;
    const d = Math.min(toRect(s.ax, s.ay), toRect(s.bx, s.by), distToSeg(r[0], r[1], s.ax, s.ay, s.bx, s.by), distToSeg(x1, r[1], s.ax, s.ay, s.bx, s.by), distToSeg(r[0], y1, s.ax, s.ay, s.bx, s.by), distToSeg(x1, y1, s.ax, s.ay, s.bx, s.by));
    if (d < s.hw) return true;
  }
  return false;
}

/** the road tool's reason for a town road over the course land (T124, the owner: "you should not be allowed to paint normal roads on the course
 *  only paths and drives") */
export const COURSE_LAND_MSG = 'Course land: build cart paths and drives with Cart paths & roads › Cart paths & drives';
/** how deep (tiles) a road's corridor must reach into the land to count as on it: a corridor that only touches the land's edge (a road
 *  ending square on the boundary, a road along the outside of it) is off the land */
const LAND_EPS = 0.01;
/** whether the corridor of leg a-b (its centre line widened by hw either side, square at the ends: a road ending at the land's edge stops
 *  there) overlaps rect r by more than LAND_EPS: the separating axis test on the rect's two axes and the corridor's two (exact, no sampling) */
function legInRect(r: Rect, ax: number, ay: number, bx: number, by: number, hw: number): boolean {
  if (!validRect(r)) return false;
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy); if (L < 1e-9) return false;
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux, ex = r[2] / 2, ey = r[3] / 2, hl = L / 2;
  const cx = (ax + bx) / 2 - (r[0] + ex), cy = (ay + by) / 2 - (r[1] + ey);
  const apart = (d: number, ra: number, rb: number) => Math.abs(d) >= ra + rb - LAND_EPS;
  return !(apart(cx, Math.abs(ux) * hl + Math.abs(nx) * hw, ex) || apart(cy, Math.abs(uy) * hl + Math.abs(ny) * hw, ey) ||
    apart(cx * ux + cy * uy, hl, ex * Math.abs(ux) + ey * Math.abs(uy)) || apart(cx * nx + cy * ny, hw, ex * Math.abs(nx) + ey * Math.abs(ny)));
}
/** whether any leg's corridor (half width hw, tiles) reaches into the land (rects; overlapping or touching rects are one piece of land: a
 *  corridor on the union overlaps one of them) */
export function legsOnLand(land: readonly Rect[], legs: readonly { a: { x: number; y: number }; b: { x: number; y: number } }[], hw: number): boolean {
  for (const l of legs) for (const r of land) if (legInRect(r, l.a.x, l.a.y, l.b.x, l.b.y, hw)) return true;
  return false;
}
/** whether tile point (x, y) lies inside the land, not on its edge (a point on the edge, where a town road may meet a course drive, is
 *  not; the seam between two touching rects is inside): the land holds a small square around the point */
export function pointInLand(land: readonly Rect[], x: number, y: number): boolean {
  const e = 2 * LAND_EPS;
  return inParcels(land, x - e, y - e) && inParcels(land, x + e, y - e) && inParcels(land, x - e, y + e) && inParcels(land, x + e, y + e);
}

/** T355 (#997; the owner, 2026-11-08: "the cart paths and roads button has streets specifically for your golf course but it wont let me draw them on the
 *  course"): the town road families that may be built on the course land, which supersedes T124 for them: the Small ones, the streets the Cart paths &
 *  roads panel lists first (Gravel, Lane, Street, and the street's One-way, Trees and One-way + trees). Every bigger family (Medium, Large, Rural:
 *  avenues, arterials, boulevards, roads) stays refused on the land with COURSE_LAND_MSG. Change this list and every route check follows */
export const COURSE_STREET_FAMILIES: readonly Family[] = ['small'];
/** whether a town road class may be built on the course land (T355: a street); the course's own cart paths and drives are not judged by it (isCourseClass) */
export function streetOnCourseOk(cls: { family: Family }): boolean { return COURSE_STREET_FAMILIES.includes(cls.family); }

/** the playing surfaces of a hole that a street may not be built over (T355, the owner: "tee, fairway, green, bunker, water hazard"), by course grid surface
 *  id (SURF), with the word the refusal calls each. The rough, the first cut, the long grass and the fescue are not here: a street replaces that ground */
export const STREET_REFUSED_SURFACES: Readonly<Record<number, string>> = { [SURF.tee]: 'tee', [SURF.fairway]: 'fairway', [SURF.green]: 'green', [SURF.bunker]: 'bunker', [SURF.water]: 'water hazard' };
/** STREET_REFUSED_SURFACES as a table by surface id (the scan reads it once a cell) */
const REFUSED = new Uint8Array(256).map((_, s) => (STREET_REFUSED_SURFACES[s] ? 1 : 0));
/** the refusal for a street over a hole's playing surface: "Hole 4's fairway is in the way" (hole 0, a surface of no hole such as the practice green or a
 *  pond of the property: "A water hazard is in the way") */
export function playWhy(surf: number, hole: number): string {
  const name = STREET_REFUSED_SURFACES[surf] ?? 'surface';
  return hole > 0 ? `Hole ${hole}'s ${name} is in the way` : `A ${name} is in the way`;
}
/** a hole's playing surface a street runs onto: what it is (surf, a SURF id), its hole (0: none), the refusal (playWhy) and the outline the preview
 *  draws red (a polygon, x y pairs: the stretch of the route over it, or the cell for a point) */
export interface PlayHit { surf: number; hole: number; why: string; outline: number[] }
/** the playing surface under tile point (x, y), or null: where a street's route may not start */
export function playAt(g: Grid, x: number, y: number): PlayHit | null {
  const i = cellAt(g, x, y); if (i < 0) return null;
  const s = g.surf[i]!; if (!REFUSED[s]) return null;
  const cx = i % g.w, cy = (i - cx) / g.w, x0 = g.x0 + cx * CELL_T, y0 = g.y0 + cy * CELL_T, h = g.hole[i]!;
  return { surf: s, hole: h, why: playWhy(s, h), outline: [x0, y0, x0 + CELL_T, y0, x0 + CELL_T, y0 + CELL_T, x0, y0 + CELL_T] };
}
/** the first playing surface (STREET_REFUSED_SURFACES) the corridors of legs reach onto, or null: the earliest leg that meets one, and in it the
 *  surface met first along the leg. A corridor is the leg widened by hw tiles either side, square at the ends (as legsOnLand's: a street ending at the
 *  edge of a fairway stops there), and "reaches onto" a 1 m cell of the course grid when it overlaps it by more than LAND_EPS (the SAT test of legInRect,
 *  exact, no sampling). The outline is the corridor over that surface's first run along the leg (a gap wider than half a tile ends the run) */
export function legsOnPlay(g: Grid, legs: readonly { a: { x: number; y: number }; b: { x: number; y: number } }[], hw: number): PlayHit | null {
  for (const l of legs) {
    const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, L = Math.hypot(dx, dy); if (L < 1e-9) continue;
    const ux = dx / L, uy = dy / L, nx = -uy * hw, ny = ux * hw;
    // the cells the corridor can touch (clipped to the grid), row by row: in each row of cells only the span of the corridor within that row's band
    // (a diagonal leg's box is mostly off its corridor), the playing cells among them tested exactly
    const px = [l.a.x + nx, l.b.x + nx, l.b.x - nx, l.a.x - nx], py = [l.a.y + ny, l.b.y + ny, l.b.y - ny, l.a.y - ny];
    const cx0 = Math.max(0, Math.floor((Math.min(...px) - g.x0) / CELL_T)), cx1 = Math.min(g.w - 1, Math.floor((Math.max(...px) - g.x0) / CELL_T));
    const cy0 = Math.max(0, Math.floor((Math.min(...py) - g.y0) / CELL_T)), cy1 = Math.min(g.h - 1, Math.floor((Math.max(...py) - g.y0) / CELL_T));
    const reach = (CELL_T / 2) * (Math.abs(ux) + Math.abs(uy)), near = CELL_T * Math.SQRT1_2, hits: { t0: number; t1: number; i: number }[] = [];
    for (let cy = cy0; cy <= cy1; cy++) {
      const Y0 = g.y0 + cy * CELL_T, Y1 = Y0 + CELL_T;
      let lo = Infinity, hi = -Infinity; // the corridor's x span in the band: its four edges clipped to the band (the corridor is convex)
      for (let k = 0; k < 4; k++) {
        const ex = px[k]!, ey = py[k]!, fx = px[(k + 1) & 3]!, fy = py[(k + 1) & 3]!, ddy = fy - ey;
        let t0 = 0, t1 = 1;
        if (ddy === 0) { if (ey < Y0 || ey > Y1) continue; } else { const ta = (Y0 - ey) / ddy, tb = (Y1 - ey) / ddy; t0 = Math.max(0, Math.min(ta, tb)); t1 = Math.min(1, Math.max(ta, tb)); if (t0 > t1) continue; }
        const xa = ex + (fx - ex) * t0, xb = ex + (fx - ex) * t1;
        if (xa < lo) lo = xa; if (xb < lo) lo = xb; if (xa > hi) hi = xa; if (xb > hi) hi = xb;
      }
      if (lo > hi) continue;
      const cxa = Math.max(cx0, Math.floor((lo - g.x0) / CELL_T)), cxb = Math.min(cx1, Math.floor((hi - g.x0) / CELL_T));
      for (let cx = cxa, i = cy * g.w + cxa; cx <= cxb; cx++, i++) {
        if (!REFUSED[g.surf[i]!]) continue;
        const x0 = g.x0 + cx * CELL_T, mx = x0 + CELL_T / 2 - l.a.x, my = Y0 + CELL_T / 2 - l.a.y;
        const t = mx * ux + my * uy, d = my * ux - mx * uy; // the cell's centre along the leg and across it
        if (t < -near || t > L + near || d > hw + near || d < -hw - near) continue; // (farther than its half diagonal, `near`, past the corridor: no overlap)
        if (!legInRect([x0, Y0, CELL_T, CELL_T], l.a.x, l.a.y, l.b.x, l.b.y, hw)) continue;
        hits.push({ t0: t - reach, t1: t + reach, i });
      }
    }
    if (!hits.length) continue;
    hits.sort((p, q) => p.t0 - q.t0 || p.i - q.i);
    const first = hits[0]!, surf = g.surf[first.i]!, hole = g.hole[first.i]!;
    let s0 = first.t0, s1 = first.t1;
    for (const h of hits) if (g.surf[h.i] === surf && g.hole[h.i] === hole && h.t0 <= s1 + CELL_T + 1e-9) s1 = Math.max(s1, h.t1);
    s0 = Math.max(0, s0); s1 = Math.min(L, s1);
    const ax = l.a.x + ux * s0, ay = l.a.y + uy * s0, bx = l.a.x + ux * s1, by = l.a.y + uy * s1;
    return { surf, hole, why: playWhy(surf, hole), outline: [ax + nx, ay + ny, bx + nx, by + ny, bx - nx, by - ny, ax - nx, ay - ny] };
  }
  return null;
}
/** the class gate of legsOnPlay (T355): what a route of class cls runs onto, a hole's playing surface (its corridor is the class's own: h + walk), or null.
 *  The course's own cart paths and drives cross them freely (isCourseClass: they are laid along the holes); a null grid (a classic game) has none */
export function playInWay(g: Grid | null | undefined, cls: Pick<RoadClass, 'id' | 'h' | 'walk'>, legs: readonly { a: { x: number; y: number }; b: { x: number; y: number } }[]): PlayHit | null {
  return g && !isCourseClass(cls.id) ? legsOnPlay(g, legs, cls.h + cls.walk) : null;
}
/** why a route of class cls may not start at tile point (x, y), '' when it may (T124, T355): a town road bigger than a street (not streetOnCourseOk)
 *  may not start inside the course land (COURSE_LAND_MSG; a point on the land's edge is fine, where it may meet a course drive); a street may not start
 *  on a hole's playing surface ("Hole 4's fairway is in the way"); a course path or drive starts anywhere */
export function startWhy(land: readonly Rect[], g: Grid | null | undefined, cls: Pick<RoadClass, 'id' | 'family'>, x: number, y: number): string {
  if (isCourseClass(cls.id)) return '';
  if (!streetOnCourseOk(cls) && pointInLand(land, x, y)) return COURSE_LAND_MSG;
  return (g && playAt(g, x, y)?.why) || '';
}

/** the block for sale under tile point (x, y): a size x size block holding the point that touches the owned land along an edge and overlaps
 *  none of it (isAdjacentBlock), inside the map (0..map), and not refused (refuse: a block that would take a public road); null when there
 *  is none. The blocks line up with the owned land itself: the candidates sit on lattices anchored on every owned rect's edges (a range
 *  start's parcel lies off the map's 40-tile lattice, so blocks on that lattice never touch it), then on the map's own lattice (old saves'
 *  blocks); the one sharing the longest edge with the owned land wins, ties going to the earlier anchor (the first parcel's edges first) */
export function blockAt(parcels: readonly Rect[], x: number, y: number, size = LAND_BLOCK, map = Infinity, refuse?: (r: Rect) => boolean): Rect | null {
  const ax: number[] = [], ay: number[] = [];
  for (const r of parcels) if (validRect(r)) { ax.push(r[0], r[0] + r[2]); ay.push(r[1], r[1] + r[3]); }
  if (!ax.length) return null;
  ax.push(0); ay.push(0);
  const snap = (v: number, a: number) => a + Math.floor((v - a) / size) * size;
  let best: Rect | null = null, most = 0;
  for (const a of ax) for (const b of ay) {
    const c: Rect = [snap(x, a), snap(y, b), size, size];
    if (c[0] < 0 || c[1] < 0 || c[0] + size > map || c[1] + size > map || !isAdjacentBlock(parcels, c)) continue;
    let len = 0; for (const r of parcels) len += sharedEdge(r, c);
    if (len > most && !refuse?.(c)) { best = c; most = len; }
  }
  return best;
}

/** whether a block holds water (unbuildable land), by isWater(x, y) on every step-th tile of it (the engine's land class samples so). T395: the walk is bounded: a rect that is
 *  no block (past MAX_BLOCK_SIDE a side, or not a number) is answered at once as unbuildable, never walked (a 1e9-tile block took the tab with it) */
export function blockOnWater(r: Rect, isWater: (x: number, y: number) => boolean, step = 4): boolean {
  if (!(r[2] <= MAX_BLOCK_SIDE && r[3] <= MAX_BLOCK_SIDE && Number.isFinite(r[0]) && Number.isFinite(r[1]))) return true;
  for (let y = r[1]; y < r[1] + r[3]; y += step) for (let x = r[0]; x < r[0] + r[2]; x += step) if (isWater(x, y)) return true;
  return false;
}

/** exact union area in m² of a list of Rects (overlapping rects are not double-counted) */
export function parcelsAreaSqm(parcels: readonly Rect[]): number {
  const valid = parcels.filter(validRect);
  if (!valid.length) return 0;
  const xs = Array.from(new Set(valid.flatMap(r => [r[0], r[0] + r[2]]))).sort((a, b) => a - b);
  const ys = Array.from(new Set(valid.flatMap(r => [r[1], r[1] + r[3]]))).sort((a, b) => a - b);
  let tiles = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const xm = (xs[i]! + xs[i + 1]!) / 2, dx = xs[i + 1]! - xs[i]!;
    for (let j = 0; j + 1 < ys.length; j++) {
      const ym = (ys[j]! + ys[j + 1]!) / 2, dy = ys[j + 1]! - ys[j]!;
      if (valid.some(r => xm > r[0] && xm < r[0] + r[2] && ym > r[1] && ym < r[1] + r[3])) tiles += dx * dy;
    }
  }
  return tiles * TILE_M * TILE_M;
}

/** price ($) to buy a block by its area, land class, buildings on it (houses add $0, non-residential buildings add BUILDING_SURCHARGE), and town population */
export function adjacentBlockPrice(block: AdjacentBlock): number {
  const rate = LAND_PRICE_SQM[block.landClass];
  if (!Number.isFinite(rate) || !validRect(block.rect)) return Infinity;
  const sqm = rectAreaSqm(block.rect);
  const housesCost = Math.max(0, block.houses ?? 0) * HOUSE_SURCHARGE;
  const bldgCost = Math.max(0, block.buildings ?? 0) * BUILDING_SURCHARGE;
  const popExtra = Math.max(0, (block.townPop ?? 1000) - 1000) / 1000 * POP_GROWTH_RATE;
  return Math.round((sqm * rate + housesCost + bldgCost) * (1 + popExtra));
}

/** attempt to buy an adjacent block: checks buildability, adjacency, no overlap, and cash >= price; returns updated parcel list and GolfSave.parcel bounds */
export function buyAdjacentBlock(parcels: readonly Rect[], block: AdjacentBlock, cash: number): BuyBlockResult {
  const cur = parcels.map(r => [...r] as Rect);
  const price = adjacentBlockPrice(block);
  if (!validRect(block.rect)) return { ok: false, parcels: cur, bounds: mergeParcelBounds(cur), price, reason: 'Invalid block dimensions' };
  // T395: with the map's size given, a block that leaves the map is no land (the engine cuts it at the edge first: clampBlock), and one past MAX_BLOCK_SIDE is no block
  if (block.map !== undefined) {
    const [x, y, w, h] = block.rect, m = block.map;
    if (![x, y, w, h, m].every(Number.isFinite)) return { ok: false, parcels: cur, bounds: mergeParcelBounds(cur), price, reason: 'Invalid block dimensions' };
    if (x < 0 || y < 0 || x + w > m || y + h > m) return { ok: false, parcels: cur, bounds: mergeParcelBounds(cur), price, reason: 'Off the map: there is no land to buy there' };
    if (w > MAX_BLOCK_SIDE || h > MAX_BLOCK_SIDE) return { ok: false, parcels: cur, bounds: mergeParcelBounds(cur), price, reason: `Too big a block: at most ${MAX_BLOCK_SIDE} tiles a side` };
  }
  if (block.landClass === 'unbuildable' || !Number.isFinite(price)) {
    return { ok: false, parcels: cur, bounds: mergeParcelBounds(cur), price, reason: 'Unbuildable land' };
  }
  if (cur.some(r => rectsOverlap(r, block.rect))) {
    return { ok: false, parcels: cur, bounds: mergeParcelBounds(cur), price, reason: 'Overlaps owned land' };
  }
  if (!isAdjacentBlock(cur, block.rect)) {
    return { ok: false, parcels: cur, bounds: mergeParcelBounds(cur), price, reason: 'Not adjacent to owned land' };
  }
  if (cash < price) {
    return { ok: false, parcels: cur, bounds: mergeParcelBounds(cur), price, reason: 'Insufficient funds' };
  }
  const next: Rect[] = [...cur, [...block.rect] as Rect];
  return { ok: true, parcels: next, bounds: mergeParcelBounds(next), price };
}
