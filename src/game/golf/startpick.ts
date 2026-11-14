// J9 (#1268, the owner 2026-11-14: "the start should be placing the driving range and that should buit your house and buy the property. so the guy can start
// where he wants"): a new game begins with the valley bare and the driving range in hand. The ghost is the placement helper's (golf/placing.ts Placeable): the
// range's plot and front, its car park and drive, and the land the start buys (the parcel), green where a start fits (golf/rangestart.ts startSpotAt) and red
// with a short reason where it does not; a click lays the start there. This file holds what is pure: the words and the ghost's shapes. Pure TS, no DOM.
import type { Pt } from '../network';
import { RANGE_PLACE_COST, rectPoly } from './placing';
import type { CountyRoad, RangeSite, StartSpot } from './rangestart';

/** the camera's zoom while the start is chosen: far out over the middle of the map (the whole valid area is a diamond about 1,100 tiles across: the 4 km map's middle) */
export const START_PICK_ZOOM = 0.014;
/** the card's title */
export const START_CARD_TITLE = 'Choose where to start';
/** what a click does, in plain words (the jam's old range is bought with the land; a normal game builds its own range) */
export function startCardText(jam: boolean, cost: number = RANGE_PLACE_COST): string {
  const c = `$${cost.toLocaleString()}`;
  return jam
    ? `Click to place your driving range. This buys the land and the old range for ${c} and builds your house.`
    : `Click to place your driving range. This buys the land around it and builds your house; the range itself costs ${c}.`;
}
/** the ghost's label where a start fits (by the pointer) */
export function startOkText(cost: number = RANGE_PLACE_COST): string {
  return `Start here: range, land and house · $${cost.toLocaleString()}`;
}
/** the way the golfers hit for a facing (0 north, 1 east, 2 south, 3 west) */
export const FACING_WORDS = ['north', 'east', 'south', 'west'] as const;
/** the facing a turn from `from` gives (a quarter turn clockwise on the map: north, east, south, west; back: the other way) */
export function turnedFacing(from: 0 | 1 | 2 | 3, back = false): 0 | 1 | 2 | 3 { return ((from + (back ? 3 : 1)) % 4) as 0 | 1 | 2 | 3; }

/** a strip of half width w from a to c as a polygon (x y pairs) */
function strip(a: Pt, c: Pt, w: number): number[] {
  const dx = c.x - a.x, dy = c.y - a.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L * w, ny = dx / L * w;
  return [a.x + nx, a.y + ny, c.x + nx, c.y + ny, c.x - nx, c.y - ny, a.x - nx, a.y - ny];
}
/** the ghost's shapes (world polygons, x y pairs; the first is the outline the refusal's cross stands on): the range's plot, its front, the car park, the
 *  drive from the county road to the front, the land the start buys and, where a start fits, the county road it comes with (edge to edge) */
export function startPolys(site: RangeSite, road: CountyRoad | null = null): number[][] {
  const d = site.drive[0]!;
  return [rectPoly(site.rangePlot), rectPoly(site.rangeFront), rectPoly(site.carpark), strip(d.a, d.b, 1), rectPoly(site.parcel), ...(road ? road.legs.map(l => strip(l.a, l.b, 1.5)) : [])];
}
/** the ghost's shapes of a start spot, made once for the spot (and again when its county road is settled): the ghost is drawn every frame, and a frame allocates nothing */
const POLYS = new WeakMap<StartSpot, { road: CountyRoad | null; polys: number[][] }>();
export function spotPolys(sp: StartSpot): number[][] {
  let m = POLYS.get(sp); if (!m || m.road !== sp.road) POLYS.set(sp, m = { road: sp.road, polys: startPolys(sp.site, sp.road) });
  return m.polys;
}
/** how long the pointer rests on a spot (ms) before the ghost works out its county road (5 to 30 ms): a pointer on the move asks the spot's geometry only */
export const START_REST_MS = 140;
/** a click this soon (ms) after the start came into hand lays nothing: the second click of a double click on the Who card's button must not choose the start */
export const START_CLICK_GRACE_MS = 700;
/** how long (ms) the tutorial's card waits for the ground under the range's view after a start is laid: golf/firstview.ts waits up to WELCOME_WAIT_MS for a game's first view; the view
 *  the camera flies to at the click is baked by then or the map still shows its coarser pictures, so the card waits 4 s at most */
export const START_FIRST_VIEW_WAIT_MS = 4000;
