// The halfway house (T187, #476; the owner: "course where all the golf course shit is like building club house and halfway house"): Course ›
// Buildings places it like the clubhouse (its front snapped to a path, R turns it), on the course land by a tee (between holes 9 and 10 is
// the classic spot), its front on a cart path. Its business is the clubhouse's kind with no cars of its own (business/catalogue.ts HALFWAY:
// golfers walk to it from the course): its takings are the golfers passing, a share of the clubhouse's visitors (halfwayTakings). Pure.
import type { Pt } from '../network';

/** what it costs to build, $ */
export const HALFWAY_COST = 18000;
/** the farthest its footprint may stand from a tee, tiles (80 m) */
export const HALFWAY_TEE_REACH = 40;
/** its front's reach to a path: the gap from its footprint to a path's verge at most this (tiles) */
export const HALFWAY_PATH_GAP = 2;
/** the golfers a clubhouse car brings (its party), the share of them who stop, and what each spends, $ */
export const HALFWAY_PARTY = 4, HALFWAY_STOP = 0.5, HALFWAY_SPEND = 4;

/** what the spot check reads of the map */
export interface HalfwaySpot {
  /** halfway houses standing */
  count: number;
  /** the tile is the player's land */
  owned(x: number, y: number): boolean;
  /** what the course has at a tile: 'play' (a fairway, green, tee, bunker or water), else '' (rough, grass) */
  surf(x: number, y: number): 'play' | '';
  /** the holes' tees */
  tees: readonly Pt[];
  /** the gap from the footprint to the nearest path or road's verge, tiles (below 0: on it; Infinity: none near) */
  pathGap: number;
  money: number;
}
/** the points of footprint r (x, y, w, h) the checks sample: a lattice of half tiles */
function samples(r: readonly [number, number, number, number]): Pt[] {
  const out: Pt[] = [], [x, y, w, h] = r, nx = Math.max(2, Math.ceil(w / 0.5)), ny = Math.max(2, Math.ceil(h / 0.5));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) out.push({ x: x + 0.05 + (w - 0.1) * i / nx, y: y + 0.05 + (h - 0.1) * j / ny });
  return out;
}
/** the gap from footprint r to point p (0 inside), tiles */
const gapTo = (r: readonly [number, number, number, number], p: Pt) => Math.hypot(Math.max(r[0] - p.x, 0, p.x - (r[0] + r[2])), Math.max(r[1] - p.y, 0, p.y - (r[1] + r[3])));
/** why the halfway house cannot stand on footprint r ('' when it can), in the order a player fixes them */
export function halfwaySpotWhy(r: readonly [number, number, number, number], s: HalfwaySpot): string {
  if (s.count >= 1) return 'One halfway house per course';
  if (!s.tees.length) return 'Build a hole first: the halfway house stands by a tee';
  const pts = samples(r);
  if (!pts.every(p => s.owned(p.x, p.y))) return 'On your land: the course';
  if (pts.some(p => s.surf(p.x, p.y) === 'play')) return 'Off the fairways, greens, tees, bunkers and water: on the rough or the grass beside them';
  if (!s.tees.some(t => gapTo(r, t) <= HALFWAY_TEE_REACH)) return `Near a tee: within ${HALFWAY_TEE_REACH * 2} m of one (between holes 9 and 10 is the classic spot)`;
  if (s.pathGap < 0) return 'Not on the path: beside it';
  if (s.pathGap > HALFWAY_PATH_GAP) return 'Its front on a cart path: draw one to it (Course › Cart paths & roads)';
  if (HALFWAY_COST > s.money) return `Not enough money: the halfway house costs $${HALFWAY_COST.toLocaleString()}`;
  return '';
}
/** the halfway house's takings for the clubhouse's new visitor cars: their golfers, the share who stop, what each spends ($, whole) */
export function halfwayTakings(newCars: number): number { return newCars > 0 ? Math.round(newCars * HALFWAY_PARTY * HALFWAY_STOP * HALFWAY_SPEND) : 0; }
