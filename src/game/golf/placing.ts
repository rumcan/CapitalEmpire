// T288 (#873, the owner 2026-10-31: "every upgrade should be something the user can place himself when he buys it. it doesnt auto build
// everything. Let him also place the first parking lot. let him place the driving range and the practice area himself"): what the player buys
// comes into his hand as a placement ghost that follows the pointer; the ghost says why a spot is refused (off his land, on water, over the
// course, his home or another build) or what it costs; a click builds it there and nothing appears before. Esc or a right click puts it down.
// This is the one placement helper every placed build calls (the driving range, its first car park, the practice area, the range's upgrades;
// T214's club buildings can hand the engine a Placeable too): the engine keeps the one in hand (Engine.startPlacing), asks it for the spot under
// the pointer, draws its ghost and builds it on the click. Pure TS, no DOM; tiles of 2 m.
import type { Pt } from '../network';
import type { Rect } from './mode';
import { RANGE_FRONT, RANGE_PLOT, plotPoint } from './range';
import { NEAR, SETBACK } from './rangestart';

/** a build in hand: its name and price, the spot the pointer at tile (x, y) offers, why it cannot stand there ('' when it can: the money is the
 *  engine's check), its ghost (world polygons, x y pairs: the first is its outline) and its build there (pays, builds, says so; false when it did
 *  not). S is the build's own spot */
export interface Placeable<S = unknown> {
  id: string; name: string; cost: number;
  spot(x: number, y: number): S;
  why(s: S): string;
  polys(s: S): number[][];
  build(s: S): boolean;
}
/** the ghost's verdict at a spot with the treasury: refused (its reason), short of money, or fine (its name and price) */
export function placeVerdict<S>(p: Placeable<S>, s: S, money: number): { bad: boolean; label: string } {
  const why = p.why(s); if (why) return { bad: true, label: why };
  if (p.cost > money) return { bad: true, label: `Not enough money: ${p.name} costs $${p.cost.toLocaleString()}` };
  return { bad: false, label: `${p.name}${p.cost ? ` · $${p.cost.toLocaleString()}` : ''} · click to build here` };
}

/** what placing the range, its first car park and the practice area cost ($): the range's shack, mats and dirt tee box; the first car park as
 *  packed dirt (its gravel and paving are the range's upgrades); the practice area cleared and levelled (its greens are built on it after) */
export const RANGE_PLACE_COST = 15000, CAR_PARK_PLACE_COST = 2000, PRACTICE_PLACE_COST = 5000;

/** the plot frame's (u, v) of world tile (x, y): plotPoint's inverse for the facing */
export function framePt(plot: Rect, facing: 0 | 1 | 2 | 3, x: number, y: number): { u: number; v: number } {
  const [px, py] = plot, [W, D] = RANGE_PLOT;
  return facing === 2 ? { u: x - px, v: y - py } : facing === 0 ? { u: px + W - x, v: py + D - y } : facing === 1 ? { u: py + W - y, v: x - px } : { u: y - py, v: px + D - x };
}
/** a world rect (x y w h) of a frame's u0..u1 by v0..v1 */
function frameRect(plot: Rect, facing: 0 | 1 | 2 | 3, u0: number, u1: number, v0: number, v1: number): Rect {
  const a = plotPoint(plot, facing, u0, v0), b = plotPoint(plot, facing, u1, v1);
  return [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)];
}
/** a world rect as a polygon (x y pairs) */
export const rectPoly = (r: Rect): number[] => [r[0], r[1], r[0] + r[2], r[1], r[0] + r[2], r[1] + r[3], r[0], r[1] + r[3]];
/** whether two world rects (x y w h) overlap */
export const rectsMeet = (a: Rect, b: Rect): boolean => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

/** the driving range at a spot: its plot (world rect), its front (the range business's rect: the plot's first RANGE_FRONT tiles from the road),
 *  its set-back from the parcel's road edge (tiles), the drive (from J on the county road to its end beside the car park) and the front's door */
export interface RangeSpot { plot: Rect; front: Rect; setback: number; J: Pt; end: Pt; door: Pt; du: number; dv: number }
/** the range placed with the pointer at tile (x, y) (the front's middle under it), in the home's frame (home: the start's plot rect, its
 *  set-back SETBACK): slid along the county road (du, whole tiles) and back from it (dv >= 0: never nearer the road than the start's set-back,
 *  so its car park still fits in the frontage strip before it), its front always toward the road (golf.dir: the golfers hit away from it) */
export function rangeSpotAt(home: Rect, facing: 0 | 1 | 2 | 3, x: number, y: number): RangeSpot {
  const f = framePt(home, facing, x, y), du = Math.round(f.u - RANGE_PLOT[0] / 2), dv = Math.max(0, Math.round(f.v - RANGE_FRONT / 2));
  const o = plotPoint(home, facing, 0, 0), t = plotPoint(home, facing, du, dv), plot: Rect = [home[0] + t.x - o.x, home[1] + t.y - o.y, home[2], home[3]];
  const setback = SETBACK + dv, P = (u: number, v: number) => plotPoint(plot, facing, u, v);
  // (the drive and the door as the start laid them: rangestart.ts siteAt, the drive at u 72, DRIVE_GAP beside the plot)
  return { plot, front: frameRect(plot, facing, 0, RANGE_PLOT[0], 0, RANGE_FRONT), setback, J: P(RANGE_PLOT[0] + 2, -NEAR - setback), end: P(RANGE_PLOT[0] + 2, 16), door: P(RANGE_PLOT[0], RANGE_FRONT / 2), du, dv };
}
/** a rect of size (w, h) centred on tile (x, y), whole tiles */
export const rectAt = (x: number, y: number, w: number, h: number): Rect => [Math.round(x - w / 2), Math.round(y - h / 2), w, h];
/** the tile centres of a rect, every step tiles (the land and water checks sample them) */
export function rectSamples(r: Rect, step = 2): Pt[] {
  const out: Pt[] = [];
  for (let y = r[1] + 0.5; y < r[1] + r[3]; y += step) for (let x = r[0] + 0.5; x < r[0] + r[2]; x += step) out.push({ x, y });
  // (the far edges too, so a thin strip of a neighbour's land is never missed between two samples)
  for (let y = r[1] + 0.5; y < r[1] + r[3]; y += step) out.push({ x: r[0] + r[2] - 0.5, y });
  for (let x = r[0] + 0.5; x < r[0] + r[2]; x += step) out.push({ x, y: r[1] + r[3] - 0.5 });
  return out;
}
/** what a placement spot is checked against: whether a tile is the player's land, water, or course (a hole's surface) */
export interface LandCheck { owned(x: number, y: number): boolean; wet(x: number, y: number): boolean; course(x: number, y: number): boolean }
/** why a rect cannot be built on ('' when it can): off the player's land, on water, over the course */
export function landWhy(r: Rect, c: LandCheck): string {
  const pts = rectSamples(r);
  if (pts.some(p => !c.owned(p.x, p.y))) return 'Off your land: place it on your plot';
  if (pts.some(p => c.wet(p.x, p.y))) return 'Not on water';
  if (pts.some(p => c.course(p.x, p.y))) return 'The course is there';
  return '';
}
