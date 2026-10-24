// The driving range (plan P22 2.1.2 and 2.2, T086): the range plot's size, its draw of passing drivers, and its layout (the hut, the covered
// mats, the car park, the target greens and their flags, the distance boards and the floodlights) turned to the way its golfers hit. Pure TS,
// no DOM.
import type { Pt } from '../network';
import type { Rect } from './mode';

/** the range plot, [along the road, deep] tiles (140 x 300 m, a real range's size), its front (the business rect: hut, mats and car park) and
 *  its covered bays */
export const RANGE_PLOT: [number, number] = [70, 150];
export const RANGE_FRONT = 24, RANGE_BAYS = 12;
/** the target greens' distances from the tee line, tiles, and their radii */
export const RANGE_TARGETS = [25, 50, 75, 100, 125];
const TARGET_R = [3, 4, 4, 5, 5], TARGET_U = [28, 44, 32, 40, 36];
/** the residents a map exit's passing drivers count as for the range, by tier (1..5): 1,500 times [1, 1.3, 1.6, 2, 2.4] */
const PASS = [1, 1.3, 1.6, 2, 2.4];
export function RANGE_PASS_POP(tier: number): number { return 1500 * PASS[Math.min(PASS.length, Math.max(1, Math.round(tier))) - 1]!; }

/** the layout in the plot's own frame (u along the road, 0..70; v away from it, 0..150; the road side at v = 0, the drive beside u = 70):
 *  the hut faces the road, the car park is in the front's drive corner, the tee line runs along the back of the front */
const HUT = { u0: 30, u1: 46, v0: 3, v1: 13 }, PARK = { u0: 49, u1: 69, v0: 2, v1: 18 }, MATS = { u0: 3, u1: 45, v0: 16, v1: 22 }, TEE_V = 20;
const BOARD_U = 5, LIGHT_U = [1, 69], LIGHT_V = [35, 85, 135];

/** a target green (tiles: centre and radius) and its distance from the tee line (tiles) */
export interface RangeTarget { x: number; y: number; r: number; dist: number }
/** a range's layout, all in world tiles: the facing (the way the golfers hit: 0 north, 1 east, 2 south, 3 west), the hut's rect, its view (the
 *  four-view art's index, 0 NE .. 3 NW: its front faces the road) and its door, the mats' rect and tee line, the bays (where each golfer stands),
 *  the car park, the target greens (nearest first), the flags (one per green), the distance boards (one per green, facing the tee line) and the
 *  floodlights. Nothing is ever mirrored: every picture turns to a view */
export interface RangeLayout {
  facing: 0 | 1 | 2 | 3;
  hut: { rect: Rect; view: 0 | 1 | 2 | 3; door: Pt };
  mats: { rect: Rect; a: Pt; b: Pt };
  bays: Pt[];
  carpark: Rect;
  targets: RangeTarget[];
  flags: Pt[];
  boards: { x: number; y: number; view: 0 | 1 | 2 | 3; dist: number }[];
  lights: Pt[];
}

/** the world point of the plot frame's (u, v), turned (never mirrored) to the facing: south is the frame as it is (u +x, v +y), then each
 *  quarter turn. plot: the world rect (70 x 150 for north and south, 150 x 70 for east and west) */
export function plotPoint(plot: Rect, facing: 0 | 1 | 2 | 3, u: number, v: number): Pt {
  const [px, py] = plot, [W, D] = RANGE_PLOT;
  return facing === 2 ? { x: px + u, y: py + v } : facing === 0 ? { x: px + W - u, y: py + D - v } : facing === 1 ? { x: px + v, y: py + W - u } : { x: px + D - v, y: py + u };
}
/** the range plot (world rect) of a range business's front (its rect, RANGE_FRONT deep from the road) for a facing: the front runs on
 *  RANGE_PLOT[1] tiles the way the golfers hit */
export function plotOfFront(front: Rect, facing: 0 | 1 | 2 | 3): Rect {
  const [x, y] = front, [W, D] = RANGE_PLOT, back = D - RANGE_FRONT;
  return facing === 2 ? [x, y, W, D] : facing === 0 ? [x, y - back, W, D] : facing === 1 ? [x, y, D, W] : [x - back, y, D, W];
}
/** the world rect of the frame's u0..u1 by v0..v1 */
function plotRect(plot: Rect, f: 0 | 1 | 2 | 3, u0: number, u1: number, v0: number, v1: number): Rect {
  const a = plotPoint(plot, f, u0, v0), b = plotPoint(plot, f, u1, v1);
  return [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)];
}
/** the view (0 NE .. 3 NW: the front facing +y, +x, -y, -x; lots/preset-art.ts) of a picture whose front faces the frame's -v (the road) */
const roadView = (f: 0 | 1 | 2 | 3): 0 | 1 | 2 | 3 => ([0, 3, 2, 1] as const)[f];

/** the range's layout on its plot for a facing (see RangeLayout). Deterministic */
export function rangeLayout(plot: Rect, facing: 0 | 1 | 2 | 3): RangeLayout {
  const P = (u: number, v: number) => plotPoint(plot, facing, u, v), R = (r: { u0: number; u1: number; v0: number; v1: number }) => plotRect(plot, facing, r.u0, r.u1, r.v0, r.v1);
  const view = roadView(facing), step = (MATS.u1 - MATS.u0) / RANGE_BAYS;
  const targets = RANGE_TARGETS.map((d, i) => ({ ...P(TARGET_U[i]!, TEE_V + d), r: TARGET_R[i]!, dist: d }));
  return {
    facing,
    hut: { rect: R(HUT), view, door: P((HUT.u0 + HUT.u1) / 2, HUT.v0) },
    mats: { rect: R(MATS), a: P(MATS.u0, TEE_V), b: P(MATS.u1, TEE_V) },
    bays: Array.from({ length: RANGE_BAYS }, (_, i) => P(MATS.u0 + step * (i + 0.5), TEE_V)),
    carpark: R(PARK),
    targets,
    flags: targets.map(t => ({ x: t.x, y: t.y })),
    boards: RANGE_TARGETS.map(d => ({ ...P(BOARD_U, TEE_V + d), view, dist: d })),
    lights: LIGHT_U.flatMap(u => LIGHT_V.map(v => P(u, v))),
  };
}

// The clubhouse the player places (plan P22 2.5.2, T089): in a range start the clubhouse is a building on the player's land, beside a drive.
/** how far the clubhouse's footprint may stand from a drive or road verge, tiles (and the reach of its frontage snap) */
export const CLUB_REACH = 6;
/** what a clubhouse spot is checked against: the clubhouses placed already, whether a tile is the player's land, the range plot (null: none),
 *  whether a tile holds course (a grid surface), and the gap from the footprint to the nearest drive or road verge (tiles; below 0 when a road
 *  runs through it, Infinity with no road near) */
export interface ClubSpotCtx { clubs: number; owned: (x: number, y: number) => boolean; plot: Rect | null; course: (x: number, y: number) => boolean; roadGap: number }
/** why a clubhouse cannot stand on rect r ('' when it can), in order: a second clubhouse; off the player's land; over the range plot; over the
 *  course; a road through it; no drive or road verge within CLUB_REACH. The land and the course are sampled every tile (tile centres) */
export function clubhouseSpotWhy(r: Rect, c: ClubSpotCtx): string {
  if (c.clubs >= 1) return 'You have a clubhouse already';
  const [x0, y0, w, h] = r, cells: Pt[] = [];
  for (let y = y0 + 0.5; y < y0 + h; y += 1) for (let x = x0 + 0.5; x < x0 + w; x += 1) cells.push({ x, y });
  if (cells.some(p => !c.owned(p.x, p.y))) return 'Off your land: place it on your parcel';
  const p = c.plot;
  if (p && x0 < p[0] + p[2] && p[0] < x0 + w && y0 < p[1] + p[3] && p[1] < y0 + h) return 'The driving range is there';
  if (cells.some(q => c.course(q.x, q.y))) return 'The course is there';
  if (c.roadGap < 0) return 'A road runs through it';
  if (c.roadGap > CLUB_REACH) return `Place it beside a drive (within ${CLUB_REACH} tiles of one)`;
  return '';
}
/** whether a clubhouse can stand on rect r (clubhouseSpotWhy is '') */
export function clubhouseSpotOk(r: Rect, c: ClubSpotCtx): boolean { return clubhouseSpotWhy(r, c) === ''; }
