// The range business (plan P24 Phase 1, T129): a range start's driving range as a small business the player grows. The save, the upgrades and
// the demand are golf/rangesave.ts (re-exported here); this is the scene the game lays on the range plot (ground, cart paths, props, labels:
// all of it derived from the save, so an upgrade re-lays it) and RangeSim, the golfers you see: they drive in, park, queue at the shop,
// buy a bucket, hit it at a free mat (balls fly in arcs to the target greens and lie there until closing), walk back and drive off. Pure TS,
// no DOM, seeded: the engine draws what it says and books its sales. Times are sim seconds; the opening hours read the town day's clock.
import type { Pt } from '../network';
import type { Rect } from './mode';
import { RANGE_PLOT, plotPoint } from './range';
import { arrivalRate, hourWeight, practiceUsers, rangeScale, rangeStats, saleValue, skippedVisits, type DemandCtx, type RangeBizSave, type RangeStats, type SkipLive } from './rangesave';
import { KIOSK_QMAX, KIOSK_SERVE, KIOSK_SHARE, LESSON_SHARE, TIER2_BAYS, extraValue, homeStage, type ExtraId, type HomeStage } from './rangesave';
export * from './rangesave';
import { NEAR, RANGE_LOT } from './rangestart';
import { GOLFER_CLIPS, LIBRARY, STAFF_CLIPS } from '../library';
import { JAM } from '../features';
import { yardageSign } from './yardage-signs';
import { PUTT_IMPACT_S, WALK_RATE, clipFrame, golferRow, hash, rowToward, staffDrive, staffPerson, type CrowdPerson } from '../crowdview';
import { mulberry } from '../iso';
import { NO_PRACTICE, practiceArea, practiceAreaAt, type PracticeArea, type PracticeScan } from './practice';
import { starterPatches, starterPieces, starterSet, type StarterPiece } from './practicestarter';
import { PRACTICE_FEE, PRACTICE_IDS, PRACTICE_SHARE, type PracticeId } from './rangesave';
import { bucketsLeft, dropInPlay, fieldCount, landBalls, nearestBall, overnight, pickKit, pickNear, pickSwath, skipBalls, STAMP_KEEP, stockOf, stow, takeMix, visitBalls, wash, zeroCounts, type BallSave } from './rangeballs';
import { NET_SHARE, POLISH_VALUE, autoKit, bucketBalls, bucketValue, onShift, robotBps, staffBps, washBps, type AutoKit } from './rangeauto';
export * from './rangeballs';
import { DEFAULT_RANGE_LOOK, type RangeLook } from './range-look';
import { PIC_TILES } from './range-pics';
import { BallRoll, ballRoll } from './play/roll';
import { TILE_M } from './types';
import type { Lie } from './play/types';
import RANGE_PICS_FILE from '../../assets/ground/range-pics.json';
import RANGE_ART_FILE from './range-art.json';
import type { OffRoad } from '../offroad';
import { DESERT_IDS, desertScatter } from '../desert-props';
import { JUNK_BY_ID, scatterJunk, type JunkPile } from './junk';

// ---------------------------------------------------------------- the scene

/** the plot frame's spots (u along the road 0..70, v away from it 0..150; the drive beside u = 70, see range.ts plotPoint) */
const U_MID = 35.5, BAY_W = 2.5, SLOTS = 24, STAND_V = 21, PATH_V = 16.2, TEE: [number, number, number, number] = [4, 67, 18, 24];
/** J6c: the tee box in the plot frame (u0 u1 v0 v1, tiles): the practice view lays a bare range's earth round it (play/practice3p.ts bareEarthRects) */
export const RANGE_TEE: Readonly<[number, number, number, number]> = TEE;
const SHOP ={ u: 34, v: 8.5 }, COUNTER = { u: 34, v: 13.4 }, QUEUE_V = 14.5, CAR_EDGE_U = 48.4, YARD: [number, number, number, number] = [4, 22, 3, 13];
/** T386 (#1043): the ball room's door, where your basket (or your cart's hopper) is emptied into the ball room: beside the shop's front, by the ball trolley
 *  (a stand-in for the ball room until its art lands, GOLF-SPRITES) */
const BALLROOM = { u: 29.4, v: 12.4 };
/** the target greens: distances from the tee line (tiles: 50..240 m), across the range (u) and radii (tiles) */
const TARGET_D = [25, 50, 75, 100, 120], TARGET_U = [28, 44, 32, 40, 36], TARGET_R = [3, 4, 4, 5, 4];
/** T239: the golfers' aim with no target green built: the distance markers' line down the middle (tiles from the tee line: 50, 100, 150 m) */
const AIM_D = [25, 50, 75];
/** T239: the range car park's lot in the plot frame (u0 u1 v0 v1: site.carpark, rangestart.ts), the paved lot's lamps (at its corners, inset;
 *  beside the car park building, the lot left beside it), and
 *  the range front a walkway is read in (the shop, the lot and the tee box, grown by a few tiles) */
const LOT: [number, number, number, number] = [49, 69, 2, 18], LAMP_IN = 0.6;
/** T237: past the set-back lot's back edge, where its walkers step off it (tiles, v) */
const LOT_STEP = 0.6;
const FRONT_UV: [number, number, number, number] = [-2, 72, -2, 30];
/** the far fence (v), the side fences (u) */
const FAR_V = 149.4, SIDE_U: [number, number] = [0.6, 69.4];
/** T251: a ball rolling out stops this far (tiles) short of a fence */
const FENCE_GAP = 0.8;
/** T251: a range ball's roll after it lands: a share of its carry on the outfield (the fairway's, times 0.6 to 1.4), sideways a little (a cross slope
 *  of up to WOBBLE, m per m); round a target green, the hollow is HOLLOW tiles past its edge and gathers the balls landing within CATCH tiles of it
 *  (a raised green holds HOLD of those landing on it, a short check of GREEN_RUN of the carry); all within ROLL_S sim seconds */
const RUN = 0.08, WOBBLE = 0.03, HOLLOW = 1.4, CATCH = 3, HOLD = 0.4, GREEN_RUN = 0.02, ROLL_S = 1.1;
/** the land's grass the outfield leaves round the tee box (tiles): room for the raised tee's face at the Height slider's top (T127, T130) */
const TEE_GAP = 2.6;
/** how far a desert start's dirt tee box reaches past the tee cells (tiles, T223): over the course's first-cut collar round them (1 m) */
const TEE_DIRT_PAD = 0.55;
/** the second tier (T133): the upper deck is the covered-bay building again, drawn DECK_H world px up the screen over the lower roofs (its own
 *  mats then stand on the lower roofs' line: a double-deck stand), its first slot (the middle twelve of the 24) */
export const DECK_H = 190;
const DECK_SLOT0 = (SLOTS - TIER2_BAYS) / 2;
/** a covered-bay roof's (and the deck's) footprint across the range (v: from just off the path behind to just behind the golfers' spots) */
const ROOF_V: [number, number] = [16.9, 20.5];
/** the length of a covered-bay picture's mats along the tee line (tiles, at its fit of 10.5): the upper deck's golfers stand within it */
const DECK_SPAN = 6.6;
/** a ball's height unit in world px (rangehost drawOver: 32 x 1.4 px a unit) */
const BALL_PX = 44.8;
/** T251: a ball height unit in metres (a metre is 32 world px, the course's balls' HH): a bounce's metres over this */
const UNIT_M = BALL_PX / 32;
/** the coffee kiosk (T133): the kiosk, its counter (the line's head) and the line stepping back toward the path; its patio */
const KIOSK = { u: 44.6, v: 8.6 }, KIOSK_AT = { u: 44.6, v: 11.4 }, KIOSK_STEP = 0.8, PATIO: [number, number, number, number] = [41.4, 47.8, 4, 15.4];
/** the ball picker cart (T133): where it parks by day (beside the outfield at the tee end), its lanes down and up the outfield (u, from the far
 *  side in), their ends (v) and the swath it picks either side of its lane (tiles) */
const PICK_HOME = { u: 65.6, v: 26.2 }, PICK_LANES = 12, PICK_U: [number, number] = [65, 5], PICK_V: [number, number] = [27.4, 146.5];
export const PICK_SWATH = 3;
/** the player's home and yard by stage (T133: the caravan, the cottage, the house; frame u0 u1 v0 v1): the yard widens for the house */
const YARDS: readonly [number, number, number, number][] = [[4, 22, 3, 13], [4, 22, 3, 13], [3, 26, 2.2, 13]];
/** the pro shop's counters (T146): side by side along the shop's front from the first one (COUNTER), this far apart (tiles) */
const COUNTER_STEP = 1.3;
/** the car park building (T146, P24 D49): its footprint on the lot's far half (frame u0 u1 v0 v1: the lot is u 49..69, v 2..18; a walk is left
 *  between it and the tee box), its ramp off the lot's aisle (the cars drive in there and are inside), the door its walkers use (onto the cart
 *  path behind it), the lot left beside it, and the corner the lot's walkers take round it to the path */
const GARAGE: [number, number, number, number] = [49, 58, 2, 15], GARAGE_RAMP = { u: 58.4, v: 5 }, GARAGE_DOOR = { u: 53.5, v: 15.5 };
const LOT_BESIDE: [number, number, number, number] = [58, 69, 2, 18], LOT_CORNER = { u: 59.4, v: PATH_V };
/** the car park building's art (T154: the art model's parking garage, axis-library.ts): the 6-storey set, whose five covered parking levels (its
 *  flat roof is no deck) hold GARAGE_CARS at the art request's 36 cars a level (GOLF-SPRITES golf:range-carpark: 180 cars on five decks of 18 x 26 m);
 *  the 2- to 5-storey sets hold 72 to 144. Drawn from its screen-axis views (N, E, S, W, one per quarter turn) until its diagonal views exist */
export const GARAGE_ART = 'ce:parking-garage-6storey';
/** the cars a covered level of the car park building holds, and the levels of GARAGE_ART (5 x 36 = GARAGE_CARS) */
export const GARAGE_LEVEL_CARS = 36, GARAGE_LEVELS = 5;
/** its size: a screen-axis picture's footprint is a rectangle along the screen, so a turned one (its front 26 m, its depth 19 m at scale 1) fits
 *  the footprint's 9-tile side at about 0.6: (13 + 9.5) x 0.6 / sqrt 2 tiles each way */
const GARAGE_SCALE = 0.6;
/** T258: the range's ground pictures (golf/range-pics.ts; their measures in range-pics.json, prep-range-art.mjs) */
const PICS = RANGE_PICS_FILE.pics;
/** T258: the hitting mats' picture (GOLF-ART-LIST item 19): one bay a picture, BAY_W wide (the bays' pitch: the picture's left and right edges
 *  join, so the open bays make one strip of mats; the art list's 4.2 m is a little under the game's 5 m bays), as deep as its proportions make
 *  that (6.7 m), its middle MATS_V (where the stand-in's turf square was) */
const MATS_D = BAY_W * PICS.mats.h / PICS.mats.w, MATS_V = STAND_V + 0.5;
/** T258: the target green's picture (item 20): its fine-cut green's edge and its collar's outer edge (fractions of its half width), so a green
 *  of radius r tiles is a picture r / GREEN_IN half wide; the bullseye's (item 27) outer ring, laid as wide as a green with its collar */
const GREEN_IN = PICS.green.green, GREEN_OUT = PICS.green.out, BULL_OUT = PICS.bullseye.out;
/** T258: a green's picture is laid upright as painted (its x axis to the screen's right, its light at the upper right, whatever the facing) */
const PIC_UPRIGHT: Pt = { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
/** T258: the owner's ChatGPT pictures that have landed (prep-range-art.mjs): each slug's library ids, view 1 then view 2 (one for a one-view item) */
export const RANGE_ART: Readonly<Record<string, readonly string[]>> = (RANGE_ART_FILE as { views: Record<string, string[]> }).views;

/** a prop of the scene: its key (stable while it stays), library id, world point, quarter turns from the picture's base view (preset-art turned),
 *  scale (absent: the library's own size) or fit (the footprint's W + D in tiles the picture spans: business art), and its stand-in label */
export interface ScenePiece { key: string; id: string; x: number; y: number; q: number; scale?: number; fit?: number; label?: string; /** drawn this high above its spot (world px, T133: the upper deck) */ lift?: number;
  /** its footprint (world x0 y0 x1 y1, T133) in place of its picture's boxes: a covered-bay roof's or the deck's, behind its golfers */ foot?: [number, number, number, number] }
/** a ground patch of the scene: a world polygon (x y pairs) and its surface: a golf surface (laid with the course's own presets), the range's own
 *  presets (T132: 'outfield', the mown outfield with its stripes, and 'target', a target green; T223: 'desert', the desert start's outfield,
 *  'teeDirt' and 'teeTurf', the range's tee box before and after it is turfed, and 'yard', the caravan's and the cottage's desert yard:
 *  rangehost.ts patchTex) or a ground texture; edge:
 *  its outline's profile (paint-edges.ts: a target green is raised, its collars feathered; absent: crisp); mow: its mowing stripes are laid on
 *  top (the outfield); T258: 'mats', 'targetGreen' and 'bullseye', the range's pictures (GOLF-ART-LIST 19, 20, 27: golf/range-pics.ts) laid
 *  flat by their lay */
export interface ScenePatch { pts: number[]; surf: 'fairway' | 'firstCut' | 'tee' | 'fringe' | 'green' | 'rough' | 'dirt' | 'grassDry' | 'asphaltDark' | 'gravel' | 'concrete' | 'outfield' | 'target' | 'desert' | 'teeDirt' | 'teeTurf' | 'yard' | 'mats' | 'targetGreen' | 'bullseye'
    | 'dirtGreen' | 'scrape' | 'sand'; edge?: 'raised' | 'turf' | 'flat'; mow?: true;
  /** T258: a picture's lay (its surf one of the pictures) */ lay?: PicLay }
// (#1281: the surfaces 'dirtGreen', 'scrape' and 'sand' are the practice area's starter set (golf/practicestarter.ts): packed earth (the range's tee dirt), the earth rim of a
// crude bunker and its sand. None of them is a pad of the practice view: it draws the range's slabs, yards and tee dirt, not these)
/** T258: how a range picture lies on the ground: the corner of one picture (world tiles), its turn (degrees: its x axis along (cos a, sin a),
 *  its y axis a quarter turn on, so it is never mirrored) and its scale (its width in tiles over golf/range-pics.ts PIC_TILES) */
export interface PicLay { x: number; y: number; a: number; s: number }
/** T258: a picture w by h tiles laid with its x axis along the unit e, centred on c */
export function picLay(c: Pt, e: Pt, w: number, h: number): PicLay {
  const n = { x: -e.y, y: e.x };
  return { x: c.x - e.x * w / 2 - n.x * h / 2, y: c.y - e.y * w / 2 - n.y * h / 2, a: Math.atan2(e.y, e.x) * 180 / Math.PI, s: w / PIC_TILES };
}
/** T258: how far toward the screen's upper right a picture's painted light falls when its x axis lies along e: its upper right corner's
 *  direction (e less its y axis) on screen, dotted with the screen's upper right */
export function lightScore(e: Pt): number { const ux = e.x + e.y, uy = e.y - e.x; return (ux - uy) - (ux + uy) / 2; }
/** T258: rangeScene's options: the range's ground art as the studio has it (golf/range-look.ts), and the ChatGPT pictures that have landed by
 *  slug (default RANGE_ART) */
export interface SceneOpts { look?: RangeLook; art?: Readonly<Record<string, readonly string[]>>;
  /** J7e: the jam's range (default: the build's JAM): its distances are PNG yardage signs (yardage-signs.ts, looked up in `art` like every other picture) or
   *  nothing, never a number pill or a stand-in post */
  jam?: boolean }
/** T258: the patch that is a target green's own green, one a green whatever the look: the stand-in's 'target', the picture's raised inner disc
 *  (its picture's outer disc is its collar, feathered), or the bullseye */
export const isTargetGreen = (p: ScenePatch): boolean => p.surf === 'target' || p.surf === 'bullseye' || (p.surf === 'targetGreen' && p.edge !== 'flat');
/** a target green in the scene: centre, radius and distance from the tee line (m) */
export interface SceneTarget { x: number; y: number; r: number; m: number }
/** the scene of a range (rangeScene) */
export interface RangeScene {
  facing: 0 | 1 | 2 | 3;
  pieces: ScenePiece[]; patches: ScenePatch[];
  /** the tee box (a world polygon, x y pairs): the game lays it into the course grid as tee cells of no hole, so T127's tee banks raise it (T130) */
  teeBox: number[];
  /** T306 (#891): once the tee box is turfed, the strip of land between it and the outfield (TEE_GAP, left for the raised tee's face): the game
   *  lays it into the course grid as fairway of no hole on the land's own cells, so the turf runs to the outfield under the face (null: a dirt tee) */
  apron: number[] | null;
  /** the practice area beside the range (T130, golf/practice.ts) */
  practice: PracticeArea;
  /** #1281: the practice area's starter set (every piece, replaced ones too: the save lists the ids gone; golf/practicestarter.ts); none without one */
  starter: StarterPiece[];
  /** the range's cart paths (cement slab), world legs: laid once (golf.range.paths) */
  paths: { a: Pt; b: Pt }[];
  /** every open bay: where its golfer stands, and the path point behind it; lift: an upper-deck bay (T133), its golfer drawn this high (world
   *  px); academy: one of the academy's two lesson bays (T133) */
  bays: { stand: Pt; back: Pt; lift?: number; academy?: boolean }[];
  /** the academy's pro (T133): where the pro waits between lessons (null: no academy) */
  academy: { home: Pt } | null;
  /** the coffee kiosk (T133): its counter (the line's head), the line's step (world, one golfer apart) and the path point in front of it (null:
   *  none built) */
  kiosk: { counter: Pt; queueStep: Pt; join: Pt } | null;
  /** the ball picker cart (T133): where it parks, its heading there (radians, world) and its lanes over the outfield and back (null: none) */
  picker: { home: Pt; ang: number; lanes: Pt[] } | null;
  /** the player's home now (T133): 0 the caravan, 1 the cottage, 2 the house */
  home: HomeStage;
  /** T288: the home yard's gate (world, just outside it): where you first stand */
  homeGate: Pt;
  /** the way the golfers hit (unit, world) and the target greens; aims (T239): what the golfers aim at, the greens, or with none built the
   *  distance markers' line down the middle (50, 100 and 150 m) */
  aim: Pt; targets: SceneTarget[]; aims: SceneTarget[];
  /** the shop's first counter, the queue's step (world, one golfer apart), the line's head (the line steps back from it), the path at the shop,
   *  the path at the car park; counters (T146): every counter open, serving in parallel (the first is counter) */
  counter: Pt; queueStep: Pt; queueAt: Pt; shopJoin: Pt; carEdge: Pt; counters: Pt[];
  /** T386: the ball room's door (world): the balls you carry are emptied into the ball room within DUMP_REACH of it */
  ballRoom: Pt;
  /** the car park building (T146; null: not built): its footprint (world x0 y0 x1 y1), the ramp the cars drive into and the way in (unit, world),
   *  the door its walkers use, the range car park's rect beside it (world: the lot shrinks to the near half), the cart path laid round it once,
   *  where its "P" label stands */
  garage: { box: [number, number, number, number]; ramp: Pt; into: Pt; door: Pt; lot: Rect; path: { a: Pt; b: Pt }; label: Pt } | null;
  /** the lot's walkers' way between their cars and the path's end at the car park (carEdge): round the car park building (T146), else straight */
  lotWalk: Pt[];
  /** the county road's junction with the drive, the drive's end, and the road's direction (unit, world, the frame's +u) and the side of the road
   *  toward the range (unit, world, the frame's +v) */
  J: Pt; driveEnd: Pt; roadDir: Pt; rangeSide: Pt;
  /** the distance numbers over their markers (street tier) and where the district map's "Driving Range" label stands */
  numbers: { x: number; y: number; text: string; low?: boolean }[]; label: Pt;
  /** J7 (#1225): the junk lying on the range (RangeBizSave.junk): each pile's index in the save, its library id and name, its world spot and its
   *  distance from the tee line (m). Cinderlinks' practice range (J6) draws the same items from this (Engine.rangeJunk) */
  junk: RangeJunkSpot[];
  /** the world box of the plot (x0 y0 x1 y1) */
  box: [number, number, number, number];
  /** T239: the range front's world box (x0 y0 x1 y1: the shop, the car park and the tee box, a little grown), where the player's paths are read */
  front: [number, number, number, number];
  /** T239: the walking path the player laid joining the car park, the shop and the tee (walkwayOf; null: none, the walkers cross the dirt).
   *  The host sets it as the paths change */
  walk: Walkway | null;
  /** T239: the anchors a walkway joins (world): the car park lot's corners, the shop's counter, the tee box's back edge (its two ends) */
  anchors: { lot: Pt[]; shop: Pt; tee: [Pt, Pt] };
  /** where the outfield's mowing stripes start (world: the tee end of the outfield, its middle) */
  mowFrom: Pt;
  /** T251: the plot frame (its origin and its unit u and v, world) and the fences a rolling ball stops short of (the side fences' u, the far
   *  fence's v); absent: none */
  fence?: { o: Pt; u: Pt; v: Pt; u0: number; u1: number; v1: number };
}

/** the view index (0 NE .. 3 NW) whose front faces the frame's -v (the road) for a facing. The four-view sheets put the front in the NE and NW
 *  cells (art/building-views provenance: "A + B, B + C, C + D, D + A"), so the views' fronts face +y, -x, -y, +x: checked in the game on the
 *  covered bays (T129). The road side is -v: -y, +x, +y, -x for the facings 2, 1, 0, 3, which is the view of the facing's own number */
const roadView = (f: 0 | 1 | 2 | 3): number => f;
/** the bay slot k's u (k 0..23, centred on U_MID) and the slots open with n bays (the middle n) */
const slotU = (k: number) => U_MID + (k - (SLOTS - 1) / 2) * BAY_W;
export const openSlots = (n: number): number[] => Array.from({ length: n }, (_, i) => SLOTS / 2 - n / 2 + i);

/** T237: where no car park may go on a range plot (world rects): the tee box and the outfield behind it (the whole plot from the tee box's front
 *  edge back), and the shop with the home's yard (golf/parkplace.ts rangeKeepOutWhy) */
export function rangeKeepOut(plot: Rect, facing: 0 | 1 | 2 | 3, setback = 0): Rect[] {
  const R = (u0: number, u1: number, v0: number, v1: number): Rect => { const a = plotPoint(plot, facing, u0, v0), b = plotPoint(plot, facing, u1, v1); return [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)]; };
  // (a set-back range's car parks go in the frontage strip in front of it: the whole plot is the range's, its front kept for the car park building)
  if (setback > 0) return [R(0, RANGE_PLOT[0], 0, RANGE_PLOT[1])];
  return [R(0, RANGE_PLOT[0], TEE[2], RANGE_PLOT[1]), R(YARDS[2]![0] - 1, PATIO[1], 0, PATH_V)];
}
/** T237: the range's own car park in the plot frame (u0 u1 v0 v1) for a set-back (tiles): on the plot's front beside the drive (LOT, no set-back),
 *  or in the frontage strip in front of it, on the road's verge (rangestart.ts: the parcel's road edge is v = -setback) */
export function rangeLot(setback = 0): [number, number, number, number] { return setback > 0 ? [LOT[0], LOT[1], -setback, -setback + RANGE_LOT[1]] : LOT; }
/** T237: the shop's counter (world tiles) on a plot for a facing: the range's door for the walking rule (golf/walkserve.ts), as the scene's counter */
export function rangeCounter(plot: Rect, facing: 0 | 1 | 2 | 3): Pt { return plotPoint(plot, facing, COUNTER.u, COUNTER.v); }
/** the range's scene on its plot for a facing and the save (plan 2.1): deterministic; everything turns with the facing, nothing is mirrored */
/** J7: a junk pile as the scene has it (RangeScene.junk) */
export interface RangeJunkSpot { i: number; id: string; name: string; x: number; y: number; m: number }
/** J7 (#1225): a new jam range's junk, scattered from a seed over its outfield (golf/junk.ts scatterJunk): past the tee's apron and 30 m out, short of the
 *  far fence, off every target green the range can buy (with room round it) and the far corner's oasis */
export function newRangeJunk(seed: number): JunkPile[] {
  const v0 = Math.max(TEE[3] + TEE_GAP + 6, STAND_V + 15);
  return scatterJunk(seed, { u0: 7, u1: 63, v0, v1: FAR_V - 6, ok: (u, v) => TARGET_U.every((tu, i) => Math.hypot(u - tu, v - STAND_V - TARGET_D[i]!) > TARGET_R[i]! + 6) && !(u < 24 && v > FAR_V - 20) });
}
/** J7: how much larger than life the junk is drawn (a car at its true size is a smudge on the outfield at the closest zoom) */
export const JUNK_SCALE = 1.8;
/** J7d (#1234; the owner could not see the pallets): the small piles (pallets, tyres, a trunk: art under SMALL_JUNK_W px wide) larger still, so every pile reads as a
 *  thing at the range's zoom, not a speck among the scrub */
export const SMALL_JUNK_SCALE = 2.8, SMALL_JUNK_W = 110;
const JUNK_W = new Map(LIBRARY.filter(it => JUNK_BY_ID.has(it.id)).map(it => [it.id, it.w]));
export const junkScale = (id: string): number => ((JUNK_W.get(id) ?? SMALL_JUNK_W) < SMALL_JUNK_W ? SMALL_JUNK_SCALE : JUNK_SCALE);

/** J7: a spot's distance from the tee line (the mats' stand line), m */
export const junkMetres = (v: number): number => Math.max(0, Math.round((v - STAND_V) * TILE_M));
export function rangeScene(plot: Rect, facing: 0 | 1 | 2 | 3, s: RangeBizSave, opts: SceneOpts = {}): RangeScene {
  const st = rangeStats(s), P = (u: number, v: number) => plotPoint(plot, facing, u, v), toRoad = roadView(facing), toRange = (toRoad + 2) % 4;
  // T237: the plot's set-back from the road (a new game's: its car park in the frontage strip; an old save's 0: on the plot's front)
  const sb = s.setback ?? 0, lot = rangeLot(sb);
  const look = opts.look ?? DEFAULT_RANGE_LOOK, views = opts.art ?? RANGE_ART;
  /** T258: a piece's ChatGPT picture once it has landed (null: its stand-in still stands): view 1 (the front and right side) for a piece whose
   *  front faces +y or -x (the view index q 0 or 1: roadView), view 2 (the left side and front) for +x or -y; its back is never drawn, and the
   *  picture is placed as it is (q 0: never turned or mirrored) */
  const art = (slug: string, q: number): string | null => { const v = views[slug]; return v?.length ? v[v.length === 1 || q === 0 || q === 1 ? 0 : 1]! : null; };
  const quad = (u0: number, u1: number, v0: number, v1: number): number[] => { const a = P(u0, v0), b = P(u1, v0), c = P(u1, v1), d = P(u0, v1); return [a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]; };
  const disc = (u: number, v: number, r: number, n = 28): number[] => { const out: number[] = []; for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, p = P(u + Math.cos(a) * r, v + Math.sin(a) * r); out.push(p.x, p.y); } return out; };
  const pieces: ScenePiece[] = [], patches: ScenePatch[] = [];
  const put = (key: string, id: string, u: number, v: number, q = 0, o: Partial<ScenePiece> = {}) => { const p = P(u, v); pieces.push({ key, id, x: p.x, y: p.y, q, ...o }); };

  // ---- the ground: the mown outfield in its first cut beyond the tee box (the tee box and its own first-cut collar are the course grid's, T130:
  // painted areas draw over the course, so the outfield keeps TEE_GAP tiles off it, where the raised tee's bank or rock face hangs down onto the
  // land's grass), the pads and mats of the open bays on their concrete deck (over the tee box), the target greens, the shop's packed dirt and
  // the caravan's dry lawn
  // the outfield is the range's own preset with its mowing stripes laid on top (T132: they read at every zoom, across the line of play); a desert
  // start's (T223) is the desert, edge to edge, until the player grasses it
  if (st.grass) patches.push({ pts: quad(0.3, 69.7, TEE[3] + TEE_GAP, 149.7), surf: 'firstCut' }, { pts: quad(2, 68, TEE[3] + TEE_GAP + 0.6, 148), surf: 'outfield', mow: true });
  else patches.push({ pts: quad(0.3, 69.7, TEE[3] + TEE_GAP, 149.7), surf: 'desert' });
  // the tee box wears the range's own tee (T223): packed dirt at a desert start, its divot-scarred turf once turfed (the course's tees keep theirs).
  // The dirt reaches over the tee cells' first-cut collar (TEE_DIRT_PAD), so no green ring frames a desert tee; the turf keeps its collar
  const pad = st.teeTurf ? 0 : TEE_DIRT_PAD;
  patches.push({ pts: quad(TEE[0] - pad, TEE[1] + pad, TEE[2] - pad, TEE[3] + pad), surf: st.teeTurf ? 'teeTurf' : 'teeDirt' });
  const open = openSlots(st.lowerBays); // the tee box's mats (T133: the upper deck's bays are added below)
  patches.push({ pts: quad(slotU(open[0]!) - 1.5, slotU(open[open.length - 1]!) + 1.5, STAND_V - 2, STAND_V + 2.2), surf: 'concrete' });
  if (look.mats === 'picture' && open.length) {
    // T258: the mats' picture (item 19), one a bay along the open bays (one strip: its period is the bays' pitch), its top toward the targets
    // or turned half round, whichever keeps its painted light nearer the screen's upper right (a quarter turn would lay it across the bay)
    const o = P(0, 0), dv = P(0, 1), e1 = { x: -(dv.y - o.y), y: dv.x - o.x }, e = lightScore(e1) >= lightScore({ x: -e1.x, y: -e1.y }) ? e1 : { x: -e1.x, y: -e1.y };
    patches.push({ pts: quad(slotU(open[0]!) - BAY_W / 2, slotU(open[open.length - 1]!) + BAY_W / 2, MATS_V - MATS_D / 2, MATS_V + MATS_D / 2), surf: 'mats', lay: picLay(P(slotU(open[0]!), MATS_V), e, BAY_W, MATS_D) });
  } else for (const k of open) { const u = slotU(k); patches.push({ pts: quad(u - 1.05, u + 1.05, STAND_V - 1.4, STAND_V + 1.6), surf: 'asphaltDark' }, { pts: quad(u - 0.65, u + 0.65, STAND_V - 0.2, STAND_V + 1.2), surf: 'green' }); }
  const targets: SceneTarget[] = [];
  for (let i = 0; i < st.targets; i++) {
    const u = TARGET_U[i]!, v = STAND_V + TARGET_D[i]!, r = TARGET_R[i]!, c = P(u, v);
    if (look.greens === 'picture') {
      // T258: the target green's picture (item 20) laid upright at its size: its fine-cut green r tiles across, its lighter collar round it, the
      // whole picture's circle feathered into the outfield (the feather in its own outfield grass, past the collar); the green raised a little
      // with a sun-lit edge (T132's look, softer: the 'turf' bevel, so its shadow leaves the collar) by the same picture again inside r. The
      // bullseye (item 27, look.bullseye) is painted flat into the turf, as wide as a green with its collar, feathered at its outer ring
      const bull = i === look.bullseye, h = bull ? r * GREEN_OUT / GREEN_IN / BULL_OUT : r / GREEN_IN, lay = picLay(c, PIC_UPRIGHT, 2 * h, 2 * h);
      if (bull) patches.push({ pts: disc(u, v, BULL_OUT * h, 40), surf: 'bullseye', edge: 'flat', lay });
      else patches.push({ pts: disc(u, v, h, 40), surf: 'targetGreen', edge: 'flat', lay }, { pts: disc(u, v, r, 40), surf: 'targetGreen', edge: 'turf', lay });
    } else {
      // a target green reads as a green (T132): a first-cut collar and a fringe ring round the range's own green preset, raised with its sun-lit edge
      patches.push({ pts: disc(u, v, r + 1.8, 32), surf: 'firstCut', edge: 'flat' }, { pts: disc(u, v, r + 0.8, 32), surf: 'fringe' }, { pts: disc(u, v, r, 32), surf: 'target', edge: 'raised' });
    }
    targets.push({ x: c.x, y: c.y, r, m: TARGET_D[i]! * 2 });
  }
  const home = homeStage(s);
  // the shop's packed dirt, then the home's yard (T288: in the home's own frame, s.home, wherever the range was placed)
  patches.push({ pts: quad(28, 41, 3, 15.4), surf: 'dirt' });
  const homeAt = s.home ?? plot, PH = (u: number, v: number) => plotPoint(homeAt, facing, u, v);
  homePart(PH, pieces, patches, home, toRoad);
  if (st.kiosk) patches.push({ pts: quad(PATIO[0], PATIO[1], PATIO[2], PATIO[3]), surf: 'concrete' });
  if (st.parking) patches.push({ pts: quad(GARAGE[0], GARAGE[1], GARAGE[2], GARAGE[3]), surf: 'concrete' });

  // ---- the paths: the back of the mats from the car park's edge, and spurs to the shop's counter and the yard's gate
  const L = (u0: number, v0: number, u1: number, v1: number) => ({ a: P(u0, v0), b: P(u1, v1) });
  // (laid once: the yard's gate stays at YARD's south side whatever the home grows to). T239: a guided start lays none (the player lays its
  // walking path); an old save's first load lays them (rangehost sync)
  const paths = [L(TEE[0] + 1, PATH_V, CAR_EDGE_U, PATH_V), L(COUNTER.u, PATH_V, COUNTER.u, COUNTER.v - 0.2), L(13, PATH_V, 13, YARD[3] + 0.4)];
  // ---- T239: the paved car park's lamps (with its asphalt and painted bays: the engine's park ground); a dirt or gravel lot has none
  if (st.lot === 'paved') { const r = st.parking && !sb ? LOT_BESIDE : lot; [[r[0], r[2]], [r[1], r[2]], [r[0], r[3]], [r[1], r[3]]].forEach(([u, v], i) => put(`lot-lamp${i}`, 'world:streetlamp', u! + (u === r[0] ? LAMP_IN : -LAMP_IN), v! + (v === r[2] ? LAMP_IN : -LAMP_IN), 0, { scale: 1 })); }

  // ---- the shop (the tin-and-tarp shack, or the pro shop facing the golfers), the caravan and its fenced back yard
  if (st.proShop) put('shop', 'business:golf-pro-shop', SHOP.u, SHOP.v, toRange);
  // the tin-and-tarp shack (golf:clubhouse-shanty) has no four views yet, and a building without them is drawn as the grand clubhouse (newart.ts):
  // the rusty lean-to shed stands in for it, turned to face the golfers (T258: until the owner's two views land)
  else { const a = art('golf-clubhouse-shanty', toRange); if (a) put('shop', a, SHOP.u, SHOP.v); else put('shop', 'expansion:lean-to-shed', SHOP.u, SHOP.v, toRange, { label: 'Stand In for the tin-and-tarp pro shop' }); }
  // ---- the boundary: chain-link down both sides and across the far end
  fenceRun(pieces, P, 'side-a', SIDE_U[0], 17, SIDE_U[0], FAR_V, 'chain'); fenceRun(pieces, P, 'side-b', SIDE_U[1], 19, SIDE_U[1], FAR_V, 'chain');
  fenceRun(pieces, P, 'far', SIDE_U[0], FAR_V, SIDE_U[1], FAR_V, 'chain');
  // ---- T289: the desert start's outfield wears the desert's scrub, cacti, rocks and dead wood (the owner's desert sheets), thin near the bays
  // and thicker down the range, never on a target green's ground (every green the range can buy, with room round it), the side markers' and
  // floodlights' strip or the tee's apron; a small oasis (a pool, two date palms, reeds) in the far corner. Grassing the outfield clears them
  if (!st.grass) {
    const clear = (u: number, v: number) => u > 4.5 && u < 65.5 && v > TEE[3] + TEE_GAP + 5 && v < FAR_V - 2
      && TARGET_U.every((tu, i) => Math.hypot(u - tu, v - STAND_V - TARGET_D[i]!) > TARGET_R[i]! + 5)
      && !(u < 22 && v > FAR_V - 18);
    desertScatter(223289, [3, 67, TEE[3] + TEE_GAP + 4, FAR_V - 1], 5, 0.72, (u, v) => clear(u, v) && (v > 60 || (u * 7 + v * 13) % 10 < 5))
      .forEach((d, i) => put(`desert${i}`, d.id, d.u, d.v));
    const oasis: [string, number, number][] = [['oasis-pool', 12.5, FAR_V - 9], ['date-palm-pair', 5.5, FAR_V - 11], ['slender-date-palm', 19.5, FAR_V - 12.5], ['tall-cattails', 15.5, FAR_V - 6], ['cattail-clump', 8.5, FAR_V - 6.5], ['sandstone-boulder', 18.5, FAR_V - 7.5]];
    oasis.forEach(([slug, u, v], i) => { const id = `newprop:desert-${slug}`; if (DESERT_IDS.includes(id)) put(`oasis${i}`, id, u, v); });
  }
  // ---- J7 (#1225): the junk on an old jam range, each pile with its distance pill (numbers, low) like a yardage board: fun targets until cleared
  const junk: RangeJunkSpot[] = (s.junk ?? []).map((j, i) => { const p = P(j.u, j.v); return { i, id: j.id, name: JUNK_BY_ID.get(j.id)?.name ?? 'Junk', x: p.x, y: p.y, m: junkMetres(j.v) }; });
  (s.junk ?? []).forEach((j, i) => put(`junk${i}`, j.id, j.u, j.v, 0, { scale: junkScale(j.id) })); // (drawn larger than life: they read at the range's zoom)
  // ---- the sign at the drive, the bench and bins at the tee, a bag trolley by the shop
  // (T258: each drawn as the owner's ChatGPT picture once it lands, its label gone)
  // (T237: a set-back range's sign stands by the road at the drive's mouth, across the drive from its car park in the frontage strip)
  const SU = sb ? 75.5 : 64.5, SV = sb ? 1.4 - sb : 1.4;
  { const a = art('golf-range-sign', toRoad); if (a) put('sign', a, SU, SV); else put('sign', 'golf:leaderboard', SU, SV, toRoad, { fit: 4.5, label: 'Stand In for Driving Range sign' }); }
  put('bench', 'world:bench', 43, 15); put('bins-tee', 'gen:trash-cans-row', 25.5, 15); put('trolley', 'business:golf-bag-trolley', 29.4, 13.6);
  // ---- the distance markers down both sides every 50 m, flags on the greens, the yardage boards (upgrade)
  const numbers: RangeScene['numbers'] = [], post = art('golf-range-distance-post', 0), board = art('golf-range-yardage-board', toRoad);
  // J7e (#1258; the owner: "no vector distance signs. only png sprites allowed"): in the jam each distance is its ChatGPT yardage sign (a sprite) or nothing: the
  // markers and the greens get the sign of their distance (golf-range-yard-<m>, view 1 or view 2 by the range's facing, as the yardage board's: never turned or
  // mirrored) when it has a picture; no picture (the 240 m green's), no sign at all: no stand-in post and no number pill; the junk's distance is in its hover label
  const jam = opts.jam ?? JAM, sign = (m: number) => yardageSign(m, toRoad, art);
  if (jam) {
    for (let k = 1; k <= 5; k++) for (const [j, u] of [2.2, 67.8].entries()) { const id = sign(50 * k); if (id) put(`mark${k}-${j}`, id, u, STAND_V + 25 * k); }
    for (let i = 0; i < st.targets; i++) {
      put(`flag${i}`, 'business:golf-pin-red', TARGET_U[i]!, STAND_V + TARGET_D[i]!, 0, { scale: 0.32 });
      const id = sign(TARGET_D[i]! * 2); if (id) put(`board${i}`, id, TARGET_U[i]! + TARGET_R[i]! + 2.4, STAND_V + TARGET_D[i]! - 1);
    }
  }
  if (!jam) for (let k = 1; k <= 5; k++) for (const [j, u] of [2.2, 67.8].entries()) {
    if (post) put(`mark${k}-${j}`, post, u, STAND_V + 25 * k);
    else put(`mark${k}-${j}`, 'ce:parking-sign', u, STAND_V + 25 * k, 0, k === 1 && j === 0 ? { label: 'Stand In for Range distance marker' } : {});
    const p = P(u, STAND_V + 25 * k); numbers.push({ x: p.x, y: p.y, text: `${50 * k} m` });
  }
  if (!jam) for (let i = 0; i < st.targets; i++) {
    put(`flag${i}`, 'business:golf-pin-red', TARGET_U[i]!, STAND_V + TARGET_D[i]!, 0, { scale: 0.32 });
    if (st.targets > 3) { // the boards come with the 'targets' upgrade (T239: the first three greens have flags only)
      if (board) put(`board${i}`, board, TARGET_U[i]! + TARGET_R[i]! + 2.4, STAND_V + TARGET_D[i]! - 1);
      else put(`board${i}`, 'poi:fishing-board', TARGET_U[i]! + TARGET_R[i]! + 2.4, STAND_V + TARGET_D[i]! - 1, toRoad, { scale: 1.6, ...(i === 0 ? { label: 'Stand In for Range yardage board' } : {}) });
      const p = P(TARGET_U[i]! + TARGET_R[i]! + 2.4, STAND_V + TARGET_D[i]! - 1); numbers.push({ x: p.x, y: p.y, text: `${TARGET_D[i]! * 2} m`, low: true });
    }
  }
  // ---- the covered bays over each four open bays, the floodlights, the ball dispenser
  // (T133: each with the footprint of its four bays behind the golfers' spots, so the golfers in its bays and on the path behind it draw in the
  // right order from every side; the art's own boxes are a 1 x 1 placeholder)
  const roofFoot = (u0: number, u1: number): [number, number, number, number] => { const a = P(u0 - 1.2, ROOF_V[0]), b = P(u1 + 1.2, ROOF_V[1]); return [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)]; };
  // (T258: where the second tier stands, the double-deck stand's picture once it lands: one section of both storeys over the four bays, on
  // the ground in place of the covered bays' roof, and no lifted copy; its upper golfers keep DECK_H until the picture's deck height is read)
  const deckArt = st.tier2 ? art('golf-range-deck', toRange) : null, inDeck = (k0: number, k1: number) => !(k1 < DECK_SLOT0 || k0 >= DECK_SLOT0 + TIER2_BAYS);
  if (st.covered) for (let g = 0; g < open.length; g += 4) {
    const k0 = open[g]!, k1 = open[Math.min(open.length, g + 4) - 1]!, foot = roofFoot(slotU(k0), slotU(k1));
    if (deckArt && inDeck(k0, k1)) put(`roof${g}`, deckArt, (slotU(k0) + slotU(k1)) / 2, STAND_V - 1.2, 0, { foot });
    else put(`roof${g}`, 'business:golf-driving-range', (slotU(k0) + slotU(k1)) / 2, STAND_V - 1.2, toRange, { fit: 10.5, foot });
  }
  if (st.lights) {
    const spots: [number, number][] = [[1.6, 26], [68.4, 26], [1.6, 60], [68.4, 60], [1.6, 100], [68.4, 100], [1.6, 140], [68.4, 140]], a = art('golf-range-floodlight', toRange);
    spots.forEach(([u, v], i) => { if (a) put(`light${i}`, a, u, v); else put(`light${i}`, 'world:streetlamp', u, v, 0, { scale: 1, ...(i === 0 ? { label: 'Stand In for Range floodlight' } : {}) }); });
  }
  if (st.dispenser) { const a = art('golf-range-ball-dispenser', toRange); if (a) put('dispenser', a, 39.6, 12.6); else put('dispenser', 'expansion:utility-cabinet', 39.6, 12.6, 0, { label: 'Stand In for Ball dispenser' }); }
  // ---- the World of Golf extras (T133)
  // the second tier: the covered-bay building again over each lower roof under the middle twelve slots, drawn DECK_H up (its stand-in: a double
  // deck of the same roofs), a hair nearer the camera than the roof under it so it is drawn after it
  const decks: number[] = [];
  if (st.tier2) for (let g = 0; g < open.length; g += 4) {
    const k0 = open[g]!, k1 = open[Math.min(open.length, g + 4) - 1]!;
    if (!inDeck(k0, k1)) continue;
    const p = P((slotU(k0) + slotU(k1)) / 2, STAND_V - 1.2); decks.push((slotU(k0) + slotU(k1)) / 2);
    if (deckArt) continue; // (T258: the deck's own picture stands in the roof's place)
    const f = roofFoot(slotU(k0), slotU(k1));
    pieces.push({ key: `deck${g}`, id: 'business:golf-driving-range', x: p.x + 0.05, y: p.y + 0.05, q: toRange, fit: 10.5, lift: DECK_H, foot: [f[0] + 0.05, f[1] + 0.05, f[2] + 0.05, f[3] + 0.05], ...(pieces.some(q => q.key.startsWith('deck')) ? {} : { label: 'Stand In for the double-deck hitting stand' }) });
  }
  // the academy: its sign on the tee box by its two lesson bays (the two first open bays); the pro waits in front of them
  let academy: RangeScene['academy'] = null;
  if (st.academy && open.length >= 2) {
    put('academy-sign', 'poi:fishing-board', slotU(open[0]!) - 1.6, STAND_V + 2.8, toRoad, { scale: 1.6, label: 'Stand In for Golf academy sign' });
    academy = { home: P((slotU(open[0]!) + slotU(open[1]!)) / 2, STAND_V + 1.6) };
  }
  // the coffee kiosk by the shop on its patio, two patio tables, its line stepping back toward the path
  let kiosk: RangeScene['kiosk'] = null;
  if (st.kiosk) {
    const ka = art('golf-range-coffee-kiosk', toRange);
    if (ka) put('kiosk', ka, KIOSK.u, KIOSK.v); else put('kiosk', 'business:fishing-rental-kiosk', KIOSK.u, KIOSK.v, toRange, { fit: 5, label: 'Stand In for Coffee kiosk' });
    put('kiosk-table1', 'business:golf-patio-table', 42.4, 5.6, 0, { fit: 2.6 }); put('kiosk-table2', 'business:golf-patio-table', 47, 6.2, 0, { fit: 2.6 });
    const a = P(KIOSK_AT.u, KIOSK_AT.v), b = P(KIOSK_AT.u, KIOSK_AT.v + KIOSK_STEP);
    kiosk = { counter: a, queueStep: { x: b.x - a.x, y: b.y - a.y }, join: P(KIOSK_AT.u, PATH_V) };
  }
  // the ball picker cart: it parks beside the outfield at the tee end and drives PICK_LANES lanes down and up it after closing, then home
  let picker: RangeScene['picker'] = null;
  if (st.picker) {
    const lanes: Pt[] = [P(PICK_HOME.u, PICK_HOME.v)];
    for (let i = 0; i < PICK_LANES; i++) { const u = PICK_U[0] + (PICK_U[1] - PICK_U[0]) * i / (PICK_LANES - 1), up = i % 2 === 0; lanes.push(P(u, up ? PICK_V[0] : PICK_V[1]), P(u, up ? PICK_V[1] : PICK_V[0])); }
    lanes.push(P(PICK_HOME.u - 1, PICK_V[0] - 0.6), P(PICK_HOME.u, PICK_HOME.v));
    const h0 = P(PICK_HOME.u, PICK_HOME.v), h1 = P(PICK_HOME.u, PICK_HOME.v + 1);
    picker = { home: h0, ang: Math.atan2(h1.y - h0.y, h1.x - h0.x), lanes };
  }

  // the car park building (T146): on the lot's far half, its ramp facing the lot's aisle, its door onto the path (T154: the parking garage's art)
  let garage: RangeScene['garage'] = null;
  if (st.parking) {
    const a = P(GARAGE[0], GARAGE[2]), b = P(GARAGE[1], GARAGE[3]), box: [number, number, number, number] = [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)];
    put('carpark', GARAGE_ART, (GARAGE[0] + GARAGE[1]) / 2, (GARAGE[2] + GARAGE[3]) / 2, (toRoad + 1) % 4, { scale: GARAGE_SCALE, foot: box });
    const r0 = P(GARAGE_RAMP.u, GARAGE_RAMP.v), r1 = P(GARAGE_RAMP.u - 1, GARAGE_RAMP.v), l0 = P(LOT_BESIDE[0], LOT_BESIDE[2]), l1 = P(LOT_BESIDE[1], LOT_BESIDE[3]);
    garage = {
      box, ramp: r0, into: { x: r1.x - r0.x, y: r1.y - r0.y }, door: P(GARAGE_DOOR.u, GARAGE_DOOR.v),
      // (T237: a set-back range's lot stands in the frontage strip, clear of the building: it keeps its whole rect)
      lot: sb ? (() => { const a = P(lot[0], lot[2]), b = P(lot[1], lot[3]); return [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)] as [number, number, number, number]; })() : [Math.min(l0.x, l1.x), Math.min(l0.y, l1.y), Math.abs(l1.x - l0.x), Math.abs(l1.y - l0.y)],
      path: { a: P(CAR_EDGE_U, PATH_V), b: P(LOT_BESIDE[0], PATH_V) }, label: P((GARAGE[0] + GARAGE[1]) / 2, (GARAGE[2] + GARAGE[3]) / 2),
    };
  }
  const bays: RangeScene['bays'] = open.map((k, i) => ({ stand: P(slotU(k), STAND_V), back: P(slotU(k), PATH_V), ...(academy && i < 2 ? { academy: true } : {}) }));
  // the upper deck's bays (T133): TIER2_BAYS shared among the deck's sections (four each over twelve bays, three over 24), set along each
  // section's own mats (the picture spans about DECK_SPAN tiles: a golfer past it would hang in the air), DECK_H up, reached from the path behind
  decks.forEach((uc, i) => {
    const n = Math.floor(TIER2_BAYS / decks.length) + (i < TIER2_BAYS % decks.length ? 1 : 0), step = DECK_SPAN / n;
    for (let j = 0; j < n; j++) { const u = uc + (j - (n - 1) / 2) * step; bays.push({ stand: P(u, STAND_V), back: P(u, PATH_V), lift: DECK_H }); }
  });
  const o = P(0, 0), du = P(1, 0), dv = P(0, 1), c0 = P(0, 0), c1 = P(RANGE_PLOT[0], RANGE_PLOT[1]), f0 = P(FRONT_UV[0], FRONT_UV[2] - sb), f1 = P(FRONT_UV[1], FRONT_UV[3]);
  // the golfers' aim with no target green built (T239): the distance markers' line down the middle
  const aims = targets.length ? targets : AIM_D.map(d => { const c = P(U_MID, STAND_V + d); return { x: c.x, y: c.y, r: 4, m: d * 2 }; });
  const q0 = P(COUNTER.u, COUNTER.v), q1 = P(COUNTER.u + 0.8, COUNTER.v);
  // T288: the practice area where the player placed it (none yet: an empty box), else the plot's own spot (a save from before T288)
  const practice = s.practiceAt === null ? NO_PRACTICE : s.practiceAt ? practiceAreaAt(s.practiceAt, P(CAR_EDGE_U, PATH_V)) : practiceArea(plot, facing);
  // #1281: its starter set (dirt greens with flags and a crude bunker), laid with it: ground paint under the course and a few flag sprites, the pieces proper facilities replaced left out
  const starter = s.starter && practice.pts.length ? starterSet(practice.box, practice.entry, s.starter.seed) : [];
  if (starter.length) { patches.push(...starterPatches(starter, s.starter!.gone)); pieces.push(...starterPieces(starter, s.starter!.gone)); }
  return {
    facing, pieces, patches, teeBox: quad(TEE[0], TEE[1], TEE[2], TEE[3]), apron: st.teeTurf ? quad(0.3, 69.7, TEE[3], TEE[3] + TEE_GAP) : null,
    practice, starter,
    paths, bays, academy, kiosk, picker, home, homeGate: PH(13, YARDS[home]![3] + 1.6), aim: { x: dv.x - o.x, y: dv.y - o.y }, targets, aims,
    counter: q0, queueStep: { x: q1.x - q0.x, y: q1.y - q0.y }, queueAt: P(COUNTER.u + 0.8, QUEUE_V), shopJoin: P(COUNTER.u, PATH_V), carEdge: P(CAR_EDGE_U, PATH_V), ballRoom: P(BALLROOM.u, BALLROOM.v),
    // the counters side by side along the shop's front about its middle, the nearest to the line's head first (it calls the next golfer first)
    counters: Array.from({ length: st.counters }, (_, i) => COUNTER.u + (i - (st.counters - 1) / 2) * COUNTER_STEP).sort((a, b) => Math.abs(a - COUNTER.u - 0.8) - Math.abs(b - COUNTER.u - 0.8)).map(u => P(u, COUNTER.v)), garage,
    // (T237: from the path's end off the set-back lot's back edge, round the car park building's far side when it stands)
    lotWalk: sb ? (garage ? [P(LOT_CORNER.u, LOT_CORNER.v), P(LOT_CORNER.u, lot[3] + LOT_STEP)] : [P(CAR_EDGE_U, lot[3] + LOT_STEP)]) : garage ? [P(LOT_CORNER.u, LOT_CORNER.v)] : [],
    J: P(RANGE_PLOT[0] + 2, -NEAR - sb), driveEnd: P(RANGE_PLOT[0] + 2, 16), roadDir: { x: du.x - o.x, y: du.y - o.y }, rangeSide: { x: dv.x - o.x, y: dv.y - o.y },
    numbers, junk, label: P(35, 60), box: [Math.min(c0.x, c1.x), Math.min(c0.y, c1.y), Math.max(c0.x, c1.x), Math.max(c0.y, c1.y)],
    mowFrom: P(U_MID, TEE[3] + TEE_GAP + 0.6),
    fence: { o, u: { x: du.x - o.x, y: du.y - o.y }, v: { x: dv.x - o.x, y: dv.y - o.y }, u0: SIDE_U[0] + FENCE_GAP, u1: SIDE_U[1] - FENCE_GAP, v1: FAR_V - FENCE_GAP },
    front: [Math.min(f0.x, f1.x), Math.min(f0.y, f1.y), Math.max(f0.x, f1.x), Math.max(f0.y, f1.y)], walk: null,
    anchors: { lot: [P(lot[0], lot[2]), P(lot[1], lot[2]), P(lot[1], lot[3]), P(lot[0], lot[3])], shop: P(COUNTER.u, COUNTER.v), tee: [P(TEE[0], TEE[2]), P(TEE[1], TEE[2])] },
  };
}

// ---------------------------------------------------------------- T239: the walking path the player lays

/** the walking path the walkers use (world points): car, the path's point nearest the car park; shop, nearest the shop's counter; carShop, the
 *  way along the path from car to shop; for each bay of the scene (its index), shopBay the way from shop to the path's point nearest that bay's
 *  back and bayCar from there to car */
export interface Walkway { car: Pt; shop: Pt; carShop: Pt[]; shopBay: Pt[][]; bayCar: Pt[][] }
/** how near the path must come to the car park lot, the shop's counter and the tee box's back edge to join them (tiles: 6 m), and to a bay's
 *  back for the walkers to leave it there (else they leave it where it comes nearest the tee) */
export const WALK_REACH = 3, BAY_REACH = 3;
/** the path legs' points sampled this far apart (tiles) when the nearest point to an anchor is looked for */
const WALK_STEP = 0.25;
const ptSeg = (p: Pt, a: Pt, b: Pt): { d: number; t: number } => {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return { d: Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t), t };
};
const inPoly = (q: Pt[], x: number, y: number): boolean => {
  let k = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) { const a = q[i]!, b = q[j]!; if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) k = !k; }
  return k;
};
/** T459 (#1215): which of the walkway's three anchors (the car park lot, the shop's counter, the tee box's back edge) a path comes within
 *  WALK_REACH of, whether or not the paths join up: the guide's walking-path step says what is still missing */
export function walkwayReach(sc: Pick<RangeScene, 'anchors'>, legs: readonly { a: Pt; b: Pt }[]): { lot: boolean; shop: boolean; tee: boolean } {
  const { lot, shop, tee } = sc.anchors;
  const toLot = (p: Pt) => (inPoly(lot, p.x, p.y) ? 0 : Math.min(...lot.map((a, i) => ptSeg(p, a, lot[(i + 1) % 4]!).d)));
  const reaches = (dist: (p: Pt) => number) => legs.some(l => {
    const n = Math.max(1, Math.ceil(Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y) / WALK_STEP));
    for (let i = 0; i <= n; i++) { const t = i / n; if (dist({ x: l.a.x + (l.b.x - l.a.x) * t, y: l.a.y + (l.b.y - l.a.y) * t }) <= WALK_REACH) return true; }
    return false;
  });
  return { lot: reaches(toLot), shop: reaches(p => Math.hypot(p.x - shop.x, p.y - shop.y)), tee: reaches(p => ptSeg(p, tee[0], tee[1]).d) };
}
/** the walkway the player's path legs (world, the cart paths near the range front: any of the Cart paths & roads tool's paths) make, or null
 *  when no connected run of them comes within WALK_REACH of the car park lot, the shop's counter and the tee box's back edge all three.
 *  Deterministic: the legs are joined where they share an end point; each anchor takes the path's nearest point (sampled every WALK_STEP),
 *  and the ways are the shortest along the path between them */
export function walkwayOf(sc: Pick<RangeScene, 'anchors' | 'bays'>, legs: readonly { a: Pt; b: Pt }[]): Walkway | null {
  if (!legs.length) return null;
  const { lot, shop, tee } = sc.anchors;
  const toLot = (p: Pt) => (inPoly(lot, p.x, p.y) ? 0 : Math.min(...lot.map((a, i) => ptSeg(p, a, lot[(i + 1) % 4]!).d)));
  type Hit = { leg: number; t: number; d: number };
  const near = (dist: (p: Pt) => number, reach: number): Hit | null => {
    let best: Hit | null = null;
    legs.forEach((l, k) => {
      const n = Math.max(1, Math.ceil(Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y) / WALK_STEP));
      for (let i = 0; i <= n; i++) { const t = i / n, d = dist({ x: l.a.x + (l.b.x - l.a.x) * t, y: l.a.y + (l.b.y - l.a.y) * t }); if (d <= reach && (!best || d < best.d - 1e-9)) best = { leg: k, t, d }; }
    });
    return best;
  };
  const cA = near(toLot, WALK_REACH), sA = near(p => Math.hypot(p.x - shop.x, p.y - shop.y), WALK_REACH), tA = near(p => ptSeg(p, tee[0], tee[1]).d, WALK_REACH);
  if (!cA || !sA || !tA) return null;
  const bA = sc.bays.map(b => near(p => Math.hypot(p.x - b.back.x, p.y - b.back.y), BAY_REACH));
  // the graph: the legs' end points (joined where they meet) and the anchors' points, each leg split at the points on it
  const pts: Pt[] = [], ids = new Map<string, number>(), adj: { to: number; w: number }[][] = [];
  const node = (p: Pt, key?: string): number => {
    const k = key ?? `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`; let i = ids.get(k);
    if (i === undefined) { i = pts.length; ids.set(k, i); pts.push({ x: p.x, y: p.y }); adj.push([]); }
    return i;
  };
  const on: { t: number; id: number }[][] = legs.map(() => []);
  const at = (a: Hit, key: string): number => { const l = legs[a.leg]!, id = node({ x: l.a.x + (l.b.x - l.a.x) * a.t, y: l.a.y + (l.b.y - l.a.y) * a.t }, key); on[a.leg]!.push({ t: a.t, id }); return id; };
  const car = at(cA, 'car'), sh = at(sA, 'shop'), bayIds = bA.map((a, i) => (a ? at(a, `bay${i}`) : -1)), teeId = at(tA, 'tee');
  legs.forEach((l, k) => {
    const chain = [{ t: 0, id: node(l.a) }, ...on[k]!.sort((x, y) => x.t - y.t), { t: 1, id: node(l.b) }];
    for (let i = 1; i < chain.length; i++) { const a = chain[i - 1]!.id, b = chain[i]!.id; if (a === b) continue; const w = Math.hypot(pts[a]!.x - pts[b]!.x, pts[a]!.y - pts[b]!.y); adj[a]!.push({ to: b, w }); adj[b]!.push({ to: a, w }); }
  });
  const dijkstra = (src: number): { d: Float64Array; prev: Int32Array } => {
    const d = new Float64Array(pts.length).fill(Infinity), prev = new Int32Array(pts.length).fill(-1), done = new Uint8Array(pts.length); d[src] = 0;
    for (;;) {
      let u = -1; for (let i = 0; i < pts.length; i++) if (!done[i] && d[i]! < Infinity && (u < 0 || d[i]! < d[u]!)) u = i;
      if (u < 0) break; done[u] = 1;
      for (const e of adj[u]!) if (d[u]! + e.w < d[e.to]!) { d[e.to] = d[u]! + e.w; prev[e.to] = u; }
    }
    return { d, prev };
  };
  const fromCar = dijkstra(car), fromShop = dijkstra(sh);
  if (!Number.isFinite(fromCar.d[sh]!) || !Number.isFinite(fromCar.d[teeId]!)) return null;
  // the way from the search's source to node i (the points in walking order)
  const way = (r: { prev: Int32Array }, i: number): Pt[] => { const out: Pt[] = []; for (let k = i; k >= 0; k = r.prev[k]!) out.push(pts[k]!); return out.reverse(); };
  const bayEnd = bayIds.map(id => (id >= 0 && Number.isFinite(fromCar.d[id]!) ? id : teeId));
  return {
    car: pts[car]!, shop: pts[sh]!, carShop: way(fromCar, sh),
    shopBay: bayEnd.map(id => way(fromShop, id)), bayCar: bayEnd.map(id => way(fromCar, id).reverse()),
  };
}

/** the structures' footprints in the plot frame (T207: u0 u1 v0 v1, about each picture's spot): the shop (the pro shop, or the tin-and-tarp
 *  shack's stand-in), the player's home by stage, the coffee kiosk; the covered bays' roofs run from just behind the path behind them (a cart
 *  path laid along it passes) to just behind the golfers' spots */
const SHOP_FOOT: [number, number, number, number] = [31, 37, 5.5, 11.5], SHACK_FOOT: [number, number, number, number] = [32.3, 35.7, 7, 10];
const HOME_FOOT: readonly [number, number, number, number][] = [[6, 13, 5.6, 9.6], [6.4, 12.8, 4.2, 10.6], [5, 16, 2.8, 11.6]];
const HOME_WORDS: readonly string[] = ['your caravan', 'your cottage', 'your house'];
const KIOSK_FOOT: [number, number, number, number] = [KIOSK.u - 1.4, KIOSK.u + 1.4, KIOSK.v - 1.4, KIOSK.v + 1.4], BAYS_V: [number, number] = [17.2, ROOF_V[1]];
/** the range's buildings and pieces with a footprint (T207, #546): what the player's own cart paths and drives may not run into on the range's
 *  land, each a world box (x0 y0 x1 y1) named for the refusal ("Roads cannot cross the pro shop"): the shop, the player's home, the covered bays
 *  and the deck over them, the coffee kiosk and the car park building, as the save has them. The rest of the range's land (the yard, the sign,
 *  the grass between, the outfield and the tee box) is the player's to cross */
export function rangeStructures(plot: Rect, facing: 0 | 1 | 2 | 3, s: RangeBizSave): { name: string; box: [number, number, number, number] }[] {
  const st = rangeStats(s), P = (u: number, v: number) => plotPoint(plot, facing, u, v);
  const box = ([u0, u1, v0, v1]: readonly [number, number, number, number]): [number, number, number, number] => { const a = P(u0, v0), b = P(u1, v1); return [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)]; };
  const out: { name: string; box: [number, number, number, number] }[] = [{ name: 'the pro shop', box: box(st.proShop ? SHOP_FOOT : SHACK_FOOT) }];
  // (T288: the home in its own frame, wherever the range was placed)
  const home = homeStage(s), H = s.home ?? plot; { const [u0, u1, v0, v1] = HOME_FOOT[home]!, a = plotPoint(H, facing, u0, v0), b = plotPoint(H, facing, u1, v1); out.push({ name: HOME_WORDS[home]!, box: [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)] }); }
  const open = openSlots(st.lowerBays);
  if (st.covered || st.tier2) for (let g = 0; g < open.length; g += 4) {
    const k0 = open[g]!, k1 = open[Math.min(open.length, g + 4) - 1]!;
    if (!st.covered && (k1 < DECK_SLOT0 || k0 >= DECK_SLOT0 + TIER2_BAYS)) continue;
    out.push({ name: st.covered ? 'the covered bays' : 'the upper deck', box: box([slotU(k0) - 1.2, slotU(k1) + 1.2, BAYS_V[0], BAYS_V[1]]) });
  }
  if (st.kiosk) out.push({ name: 'the coffee kiosk', box: box(KIOSK_FOOT) });
  if (st.parking) out.push({ name: 'the car park building', box: box(GARAGE) });
  return out;
}

/** T288: the player's home with its yard in the home's frame P (its ground patch, the home and its props, the desert plants, the picket fence) */
function homePart(P: (u: number, v: number) => Pt, pieces: ScenePiece[], patches: ScenePatch[], home: HomeStage, toRoad: number): void {
  const Y = YARDS[home]!, quad = (u0: number, u1: number, v0: number, v1: number): number[] => { const a = P(u0, v0), b = P(u1, v0), c = P(u1, v1), d = P(u0, v1); return [a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]; };
  const put = (key: string, id: string, u: number, v: number, q = 0, o: Partial<ScenePiece> = {}) => { const p = P(u, v); pieces.push({ key, id, x: p.x, y: p.y, q, ...o }); };
  // the caravan's and the cottage's yard is the desert (T223: the range's 'yard' preset); the house's a mown lawn (T133)
  patches.push({ pts: quad(Y[0], Y[1], Y[2], Y[3]), surf: home === 2 ? 'firstCut' : 'yard' });
  homeYard(put, home, toRoad);
  // T289: the caravan's and the cottage's desert yard keeps a barrel cactus and an agave by its fence (the house's lawn has none)
  if (home < 2) for (const [k, id, u, v] of [['yard-cactus', 'newprop:desert-golden-barrel-cactus', 5, 7.6], ['yard-agave', 'newprop:desert-agave', 21.3, 12.5]] as const) if (DESERT_IDS.includes(id)) put(k, id, u, v);
  fenceRun(pieces, P, 'yard-n', Y[0], Y[2], Y[1], Y[2], 'picket');
  fenceRun(pieces, P, 'yard-w', Y[0], Y[2], Y[0], Y[3], 'picket');
  fenceRun(pieces, P, 'yard-e', Y[1], Y[2], Y[1], Y[3], 'picket');
  fenceRun(pieces, P, 'yard-s1', Y[0], Y[3], 12, Y[3], 'picket'); fenceRun(pieces, P, 'yard-s2', 14, Y[3], Y[1], Y[3], 'picket');
}
/** T288 (#873, the owner: "only his trailer and plot is there"): a bare start's scene before the range is placed: the player's home and its yard
 *  in the home's frame (home: the plot rect it was laid in), the yard's world box (x0 y0 x1 y1, the largest home's: the range keeps off it) and
 *  its gate (where you first stand) */
export function homeScene(home: Rect, facing: 0 | 1 | 2 | 3, s: RangeBizSave): { pieces: ScenePiece[]; patches: ScenePatch[]; box: [number, number, number, number]; gate: Pt } {
  const P = (u: number, v: number) => plotPoint(home, facing, u, v), st = homeStage(s), pieces: ScenePiece[] = [], patches: ScenePatch[] = [];
  homePart(P, pieces, patches, st, roadView(facing));
  return { pieces, patches, box: homeYardBox(home, facing), gate: P(13, YARDS[st]![3] + 1.6) };
}
/** T288: the home yard's world box (x0 y0 x1 y1) in its frame: the largest home's yard (the house's) with a tile round it */
export function homeYardBox(home: Rect, facing: 0 | 1 | 2 | 3): [number, number, number, number] {
  const Y = YARDS[2]!, a = plotPoint(home, facing, Y[0] - 1, Y[2] - 1), b = plotPoint(home, facing, Y[1] + 1, Y[3] + 1);
  return [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)];
}
/** T288: what the driving range takes on its plot (world rects x y w h) for the placement's checks: the tee box, the outfield and the path
 *  behind the mats (the plot's whole width from the path back), and the front beside the home's corner (the shop, the kiosk's patio, the car
 *  park building) out to the drive. The home's corner (u under 27, v under 16) is left: a range placed on its start spot keeps the home there */
export function rangeTakes(plot: Rect, facing: 0 | 1 | 2 | 3): Rect[] {
  const R = (u0: number, u1: number, v0: number, v1: number): Rect => { const a = plotPoint(plot, facing, u0, v0), b = plotPoint(plot, facing, u1, v1); return [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)]; };
  return [R(0, RANGE_PLOT[0], PATH_V - 1, RANGE_PLOT[1]), R(27, RANGE_PLOT[0] + 4, 0, PATH_V - 1)];
}
/** T288: an upgrade's footprint on the range (world polygons, x y pairs): what its placement ghost shows on the plot. The ground upgrades their
 *  ground (the tee box, the outfield, the car park), the target greens their discs, the bays their mats, the roofs and the deck their stand, the
 *  floodlights their masts, the buildings their footprints */
export function upgradeFoot(plot: Rect, facing: 0 | 1 | 2 | 3, s: RangeBizSave, id: RangeBizSave['owned'][number]): number[][] {
  const P = (u: number, v: number) => plotPoint(plot, facing, u, v), sb = s.setback ?? 0;
  const quad = (u0: number, u1: number, v0: number, v1: number): number[] => { const a = P(u0, v0), b = P(u1, v0), c = P(u1, v1), d = P(u0, v1); return [a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]; };
  const disc = (u: number, v: number, r: number, n = 20): number[] => { const out: number[] = []; for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, p = P(u + Math.cos(a) * r, v + Math.sin(a) * r); out.push(p.x, p.y); } return out; };
  const sq = (u: number, v: number, r: number) => quad(u - r, u + r, v - r, v + r);
  const st = rangeStats(s), lot = rangeLot(sb);
  const bays = (n: number) => { const o = openSlots(n); return [quad(slotU(o[0]!) - 1.5, slotU(o[o.length - 1]!) + 1.5, STAND_V - 2, STAND_V + 2.2)]; };
  switch (id) {
    case 'teeturf': return [quad(TEE[0], TEE[1], TEE[2], TEE[3])];
    case 'grass': return [quad(0.3, 69.7, TEE[3] + TEE_GAP, 149.7)];
    case 'greens': return [0, 1, 2].map(i => disc(TARGET_U[i]!, STAND_V + TARGET_D[i]!, TARGET_R[i]!));
    case 'targets': return [3, 4].map(i => disc(TARGET_U[i]!, STAND_V + TARGET_D[i]!, TARGET_R[i]!));
    case 'gravel': case 'pave': {
      if (s.lot) { const [x, y, w, h] = s.lot; return [[x, y, x + w, y, x + w, y + h, x, y + h]]; }
      return [quad(lot[0], lot[1], lot[2], lot[3])];
    }
    case 'bays8': return bays(8);
    case 'bays12': return bays(12);
    case 'bays24': return bays(24);
    case 'covered': case 'tier2': { const o = openSlots(st.lowerBays); return [quad(slotU(o[0]!) - 1.2, slotU(o[o.length - 1]!) + 1.2, ROOF_V[0], ROOF_V[1])]; }
    case 'lights': return [[1.6, 26], [68.4, 26], [1.6, 60], [68.4, 60], [1.6, 100], [68.4, 100], [1.6, 140], [68.4, 140]].map(([u, v]) => sq(u!, v!, 1.2));
    case 'dispenser': return [sq(39.6, 12.6, 1.2)];
    case 'proshop': return [quad(SHOP_FOOT[0], SHOP_FOOT[1], SHOP_FOOT[2], SHOP_FOOT[3])];
    case 'kiosk': return [quad(PATIO[0], PATIO[1], PATIO[2], PATIO[3])];
    case 'picker': return [sq(PICK_HOME.u, PICK_HOME.v, 1.6)];
    case 'academy': { const o = openSlots(st.lowerBays); return o.length >= 2 ? [quad(slotU(o[0]!) - 1.3, slotU(o[1]!) + 1.3, STAND_V - 2, STAND_V + 3.5)] : bays(4); }
    case 'parking': return [quad(GARAGE[0], GARAGE[1], GARAGE[2], GARAGE[3])];
    default: return [quad(0, RANGE_PLOT[0], 0, 26)];
  }
}

/** the player's home and its yard's props by stage (T133): the caravan with its washing line, braai, camp chairs and cooler; the cottage (a small
 *  house facing the road, a stand-in) with a brick braai, a swing seat, a birdhouse and flower beds; the house (the farmhouse with its porch) with
 *  a garage, a glasshouse, a fire pit and more beds. Keys stay where the piece stays, so a move re-lays only what changed */
function homeYard(put: (key: string, id: string, u: number, v: number, q?: number, o?: Partial<ScenePiece>) => void, home: HomeStage, toRoad: number): void {
  if (home === 0) {
    put('caravan', 'expansion:pop-up-caravan', 9.5, 7.6);
    put('wash', 'expansion:washing-line', 18, 5.4); put('braai', 'expansion:barbecue', 17.6, 10.2);
    put('chair1', 'expansion:lawn-chair', 14.6, 11.2); put('chair2', 'expansion:lawn-chair', 19.8, 11.6); put('cooler', 'expansion:camping-cooler', 12.2, 11.6);
    put('hose', 'expansion:garden-hose', 5.6, 12); put('bins-yard', 'gen:trash-cans-row', 20.6, 3.8);
    return;
  }
  if (home === 1) {
    put('cottage', 'world:house_4', 9.6, 7.4, toRoad, { label: "Stand In for the player's cottage" });
    put('wash', 'expansion:washing-line', 18, 5.4); put('braai', 'expansion:brick-barbecue', 17.6, 10.2);
    put('chair1', 'expansion:lawn-chair', 14.6, 11.2); put('chair2', 'expansion:lawn-chair', 19.8, 11.6); put('swing', 'expansion:patio-swing', 20, 8);
    put('birdhouse', 'expansion:birdhouse-post', 15.4, 4.6); put('bed1', 'world:bush_2', 5.6, 11.8); put('bed2', 'world:bush_2', 10.6, 12.2);
    put('hose', 'expansion:garden-hose', 5.2, 4.2); put('bins-yard', 'gen:trash-cans-row', 20.6, 3.8);
    return;
  }
  put('house', 'gen:house-farmhouse-wrap', 10.4, 7.2, toRoad);
  put('garage', 'static:garage_brick', 21.6, 5.6, toRoad); put('glasshouse', 'expansion:glasshouse', 22.4, 10.6, toRoad);
  put('braai', 'expansion:brick-barbecue', 17.8, 11.4); put('firepit', 'expansion:firepit', 15.4, 11.8); put('swing', 'expansion:patio-swing', 18.6, 8.6);
  put('chair1', 'expansion:lawn-chair', 14.2, 10.8); put('chair2', 'expansion:lawn-chair', 16.6, 12.4);
  put('bed1', 'world:bush_2', 4.6, 12); put('bed2', 'world:bush_2', 7.4, 12.3); put('bed3', 'world:bush_2', 16.6, 3.2); put('bed4', 'world:bush_2', 24.6, 12.2);
  put('planter1', 'town:planter_terracotta', 11.2, 12.4); put('planter2', 'town:planter_terracotta', 14.8, 12.4); put('bins-yard', 'gen:trash-cans-row', 25, 3.2);
}

/** a straight fence from frame (u0, v0) to (u1, v1) as pieces end to end: chain-link (3.36 tiles a panel at its studio size) or picket (1.7: its pictures are shorter than their boxes),
 *  each the picture of the world axis it lies along (the -x or -y picture: a fence is never turned or mirrored) */
function fenceRun(out: ScenePiece[], P: (u: number, v: number) => Pt, key: string, u0: number, v0: number, u1: number, v1: number, kind: 'chain' | 'picket') {
  const a = P(u0, v0), b = P(u1, v1), len = Math.hypot(b.x - a.x, b.y - a.y), alongX = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const piece = kind === 'chain' ? 3.36 : 1.7, n = Math.max(1, Math.round(len / piece));
  const id = kind === 'chain' ? (alongX ? 'expansion:chainlink-x' : 'expansion:chainlink-y') : (alongX ? 'world:fence_picket_x' : 'world:fence_picket_y');
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; out.push({ key: `${key}${i}`, id, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, q: 0 }); }
}

/** the range's name plate on the map in a range start (T132): its name and bays, plain capitals (the worker's business level, "L1", meant nothing
 *  there); below RANGE_LABEL_Z the range's own "Driving Range" map label stands instead */
export function rangeMapLabel(bays: number): string { return `DRIVING RANGE · ${bays} BAYS`; }
export const RANGE_LABEL_Z = 0.12;
/** the car park's label (T132): the worker's parked cars and the range's own (its golfers' cars are the range sim's, which the worker never
 *  sees), at most the bays */
export function parkLabel(worker: number, range: number, bays: number): string { return `P · ${Math.min(bays, Math.max(0, worker) + Math.max(0, range))}/${bays}`; }

// ---------------------------------------------------------------- the golfers

/** the stages of a visit */
const enum S { CarIn, WalkShop, Queue, WalkBay, Hit, /** to the coffee kiosk and in its line (T133) */ WalkKiosk, KioskQueue, WalkPractice, Practice, WalkCar, CarOut, Done }
/** the walking speed (tiles/s: a brisk 2.4 m/s, as a sim second is more than two town minutes), the cars' speeds on the road, the drive and in the car park (tiles/s) */
const WALK = 1.4, ROAD_V = 9, DRIVE_V = 4.5, PARK_V = 2.5;
/** T459: the paces the range's people walk and its cars drive at, at most (tiles a sim second): what the per-frame tests hold each mover to (golf-range-walk.test.ts) */
export const RANGE_PACE = { walk: WALK, road: ROAD_V } as const;
/** T321: a car's speed over the grass where no road reaches its car park (tiles/s) */
const OFF_V = 3;
/** a swing's beats: address, the drive clip, the pause after; the ball leaves at the clip's impact (s) */
const ADDRESS = 1.2, CLIP = GOLFER_CLIPS.golf_drive.times[GOLFER_CLIPS.golf_drive.n - 1]! - GOLFER_CLIPS.golf_drive.times[0]!, PAUSE = 1.3, IMPACT = 1.22;
const SWING = ADDRESS + CLIP + PAUSE;
/** the academy's pro is drawn as this golfer (T133), and the ball picker cart as this car type (a stand-in: the eight-way wagon, never mirrored) */
const PRO_PERSON = 3, PICKER_CAR = 1;
/** #1235: the academy's pro is the club's painted teaching pro (a staff person, never a customer's look) once packed, -1 until then */
const PRO_STAFF = staffPerson('staff_role_teachpro');
/** the most balls lying on the range, and of golfers queued patiently (town hours) */
const LYING_MAX = 800, PATIENCE_H = 2;
/** the practice facilities (T130): a golfer practises this long (town hours); a putt's beats (address, the stroke: T212's putt clip for PUTT_STROKE
 *  s, the ball leaving at its impact PUTT_HIT, the next putt after PUTT_T) and a chip's (the drive clip as the stand-in swing: SWING) */
const PRACTICE_H = 0.45, PUTT_ADDR = 1.3, PUTT_STROKE = 1.6, PUTT_HIT = PUTT_ADDR + PUTT_IMPACT_S, PUTT_T = 4;
/** the upper deck's stairs (T133): a golfer climbs over the leg from the path behind to its bay (tiles), so the lift ramps over it */
const STAIR = STAND_V - PATH_V;
/** the ball picker cart drives its lanes in this many town hours (T133), whatever the day's length */
export const PICK_HOURS = 7;

/** a car-park bay a range car parks in: its point and heading (unit); inside (T146): a place in the car park building (the point is its ramp:
 *  the car drives in there and is not drawn while parked), its golfer walking out of its door */
export interface CarSlot { x: number; y: number; hx: number; hy: number; inside?: boolean; door?: Pt;
  /** T237: its car park's entrance (absent: the range's, setScene's) and its car park's id (the car park's P · parked/bays label) */
  e?: Pt; pid?: number;
  /** T237: the drive from its car park's mouth along the aisles to the aisle point in front of it (carpark.ts bayDrive: the car parks nose-in
   *  from there), and its golfer's walk from the car park's footpath along the aisles to that point (bayWalk); absent or empty: straight */
  drive?: Pt[]; walk?: Pt[];
  /** the drive along the roads from the range drive's turn off the county road (J) to its car park's entrance (road-route.ts), for a car park
   *  neither on the range's drive nor on the county road (the owner, 2026-11-01: the cars drove straight over the course to such a car park);
   *  absent or empty: none */
  via?: Pt[];
  /** T321 (#912): the way to its car park's entrance when the range's own ways to it are off the roads (the county road or the drive deleted):
   *  along the main roads to their point nearest the entrance, then over the grass (offroad.ts); absent: the ways above */
  off?: OffRoad }
/** T321 (#912): the road lines a car to car park entrance e drives in the range's own ways (RangeSim inRoute, outRoute: from APPROACH tiles
 *  down the county road either side of the drive's turn J, along the drive to e's point on it, or along the county road to a car park on it, or
 *  via the roads from J), as polylines (world tiles) the engine checks against the roads: one off them, and the cars take the off-road way */
export function rangeCarLines(sc: Pick<RangeScene, 'J' | 'driveEnd' | 'roadDir'>, e: Pt, via?: readonly Pt[] | null): Pt[][] {
  const d = sc.roadDir, J = sc.J, along = (p: Pt): Pt[] => [{ x: p.x - d.x * 46, y: p.y - d.y * 46 }, { x: p.x + d.x * 46, y: p.y + d.y * 46 }];
  const lines = [along(J)], q = project(e, J, sc.driveEnd), off = Math.hypot(e.x - q.x, e.y - q.y) > 3, dl = Math.hypot(d.x, d.y) || 1;
  if (via?.length && off && Math.abs((e.x - J.x) * d.y - (e.y - J.y) * d.x) / dl >= 6) lines.push([J, via[0]!]);
  else if (off) { const k = (e.x - J.x) * d.x / dl + (e.y - J.y) * d.y / dl; lines.push(along({ x: J.x + d.x / dl * k, y: J.y + d.y / dl * k })); }
  else lines.push([J, q]);
  return lines;
}
/** the car park building's places as car slots (T146): GARAGE_CARS at its ramp, heading in, its walkers at its door */
export function garageSlots(g: NonNullable<RangeScene['garage']>, n: number): CarSlot[] {
  return Array.from({ length: n }, () => ({ x: g.ramp.x, y: g.ramp.y, hx: g.into.x, hy: g.into.y, inside: true, door: g.door }));
}
/** T152: the lanes the range's cars are drawn in. The drive (a 4 m course drive: two tiles) carries its cars on its two halves, DRIVE_HALF tiles
 *  either side of its line, keeping right as on the county road, so the cars in and out pass side by side. The car park building's ground floor
 *  is open along its face: its cars drive in RAMP_LANES lanes and out in RAMP_LANES more beside them, RAMP_SPREAD tiles apart across its face (a
 *  place's lane: its index, in turn), each from the drive to the ramp, so the line into it is not one car at a time through one door. Only the
 *  cars as drawn keep to their lanes (drawnRoute): the golfers' timetable runs on the drive's line and to the ramp's point, as before */
export const DRIVE_HALF = 0.5, RAMP_LANES = 2, RAMP_SPREAD = 1.2;
/** T152: the route a car is drawn on for its golfer's route r (in: from, turn, onto the drive, the entrance, short of its place, its place; out:
 *  the same the other way), d the county road's direction (the frame's +u): on the drive its own half (in: heading away from the road, its right
 *  is -d; out: +d), and into or out of the car park building (its place sl, slot its index) its lane across the building's face from the drive on */
function drawnRoute(r: Route, sl: CarSlot, slot: number, out: boolean, d: Pt): Route {
  const pts = r.pts.map(p => ({ x: p.x, y: p.y }));
  if (pts.length !== 6 || sl.off) return r;
  const move = (i: number, x: number, y: number) => { pts[i]!.x += x; pts[i]!.y += y; }, k = out ? DRIVE_HALF : -DRIVE_HALF;
  for (const i of out ? [2, 3, 4] : [1, 2, 3]) move(i, d.x * k, d.y * k);
  if (sl.inside) {
    const o = ((slot % RAMP_LANES) + (out ? RAMP_LANES : 0) - (2 * RAMP_LANES - 1) / 2) * RAMP_SPREAD;
    for (const i of out ? [0, 1, 2, 3] : [2, 3, 4, 5]) move(i, -sl.hy * o, sl.hx * o);
  }
  return route(pts, r.v);
}
/** the range's money as it happens (T146, for the floating money over the customers, T147): what (a bucket sold, a practice fee, a coffee, a
 *  lesson, or a golfer lost), how many golfers it is (a skip books fractions), the takings ($; 0 for the lost) and where (world tiles: the counter,
 *  the practice facility, the kiosk, the car or the line; null for a skip) */
export interface RangeMoneyEvent { kind: 'bucket' | 'practice' | 'coffee' | 'lesson' | 'lost'; n: number; amount: number; at: Pt | null; /** a lost golfer's reason (T386: 'balls': the ball room was out) */ why?: 'queue' | 'parking' | 'patience' | 'balls';
  /** a lost golfer's sale (T147: its red float): the buckets it would have bought ($; not charged, not in amount) */ missed?: number }
/** a route: points and the speed of each leg (tiles/s), with the cumulative times and lengths (tiles) */
interface Route { pts: Pt[]; v: number[]; at: number[]; len: number[] }
function route(pts: Pt[], v: number[]): Route {
  const at = [0], len = [0];
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y); len.push(len[i - 1]! + l); at.push(at[i - 1]! + l / (v[i - 1] ?? v[v.length - 1]!)); }
  return { pts, v, at, len };
}
/** T152: a range car as drawn, beside its golfer's timetable (the visit's route and clock, which the money and the counts keep): its route, the
 *  timetable's clock along it (due, s) and its own (c, never ahead of due nor more than LAG behind it), its point and heading (its route's leg's;
 *  waiting at its start, its first leg's), and whether it is leaving (out) from the car park building (inside). See RangeSim.drive */
interface RangeCar { r: Route; due: number; c: number; x: number; y: number; ang: number; out: boolean; inside: boolean }
/** T152: a range car keeps CAR_GAP tiles (centre to centre: the longest car, 5.5 m, and half a metre) behind the car ahead in its lane (a car
 *  within LANE_W tiles, a car's width, of its way ahead going its way), falling behind its timetable for it by at most LAG sim s: past that it
 *  drives on, closing up as before T152. A lane that carries its cars (the county road; the drive and the car park below about 1.5 and 0.8 cars
 *  a sim s) keeps them a car apart; the grown range's car park building takes up to 2 cars a sim s in and out through one drive and one ramp
 *  (P24's demand), more than one lane carries at a car's gap, and there the cars close up as before */
const CAR_GAP = 3, LANE_W = 0.9, LAG = 6;
/** T152: the golfers a car brings to the car park building (its occupancy, seeded per visit: 1 to 4, a mean of about 2; the cumulative shares).
 *  The building's golfers come at up to 2 a sim s (P24's demand), more than its drive, its entrance and its ramp carry at a car's gap one golfer
 *  a car: so a car there stands for its golfers, the first of them its driver (the car drawn), the others its passengers (no car of their own).
 *  Only the drawing changes: each golfer keeps its own visit, timetable, place in the building and takings. The surface lot's cars, drawn parked
 *  in their bays, stay one golfer a car */
export const SEATS: readonly number[] = [0.35, 0.7, 0.9, 1];
/** a car's occupancy from its driver's seed (h in 0..1): 1 + the first SEATS share above h */
export const seatsOf = (h: number): number => { let k = 0; while (k < SEATS.length - 1 && h >= SEATS[k]!) k++; return k + 1; };
/** the distance (tiles) along route r at t seconds in */
function arcAt(r: Route, t: number): number {
  const n = r.pts.length; if (n < 2 || t <= 0) return 0; if (t >= r.at[n - 1]!) return r.len[n - 1]!;
  let i = 1; while (i < n - 1 && r.at[i]! < t) i++;
  return r.len[i - 1]! + (t - r.at[i - 1]!) * (r.v[i - 1] ?? r.v[r.v.length - 1]!);
}
/** the time (s) route r reaches s tiles along it */
function timeAt(r: Route, s: number): number {
  const n = r.pts.length; if (n < 2 || s <= 0) return 0; if (s >= r.len[n - 1]!) return r.at[n - 1]!;
  let i = 1; while (i < n - 1 && r.len[i]! < s) i++;
  return r.at[i - 1]! + (s - r.len[i - 1]!) / (r.v[i - 1] ?? r.v[r.v.length - 1]!);
}
/** where a car at (x, y) heading (hx, hy) stands in route r's lane between s0 and s1 tiles along it: the distance along r of the first leg it is
 *  within LANE_W of going that leg's way (within 60 degrees: an oncoming or a crossing car is not in its lane), or up to CAR_GAP short of the
 *  leg's start (a car merging into it there: the far side's arrival turning into the drive) or past its end (a car straight ahead still, though
 *  this car turns off before it: the lanes into the car park building leave the drive a little apart); -1 off that stretch */
function onRoute(r: Route, s0: number, s1: number, x: number, y: number, hx: number, hy: number): number {
  const P = r.pts, L = r.len;
  for (let k = 1; k < P.length; k++) {
    const l = L[k]! - L[k - 1]!; if (L[k]! < s0 || l < 1e-9) continue; if (L[k - 1]! > s1) break;
    const a = P[k - 1]!, ux = (P[k]!.x - a.x) / l, uy = (P[k]!.y - a.y) / l, u = (x - a.x) * ux + (y - a.y) * uy, s = L[k - 1]! + u;
    if (u < -CAR_GAP || u > l + CAR_GAP || s < s0 || s > s1 || Math.abs((x - a.x) * uy - (y - a.y) * ux) >= LANE_W || hx * ux + hy * uy < 0.5) continue;
    return s;
  }
  return -1;
}
/** the point and heading of a route t seconds in (the end after it); written into o */
function along(r: Route, t: number, o: { x: number; y: number; ang: number }): boolean {
  const n = r.pts.length, end = r.at[n - 1]!;
  if (n < 2 || t >= end) { const p = r.pts[n - 1]!, q = r.pts[Math.max(0, n - 2)]!; o.x = p.x; o.y = p.y; o.ang = Math.atan2(p.y - q.y, p.x - q.x); return t >= end; }
  let i = 1; while (i < n - 1 && r.at[i]! < t) i++;
  const a = r.pts[i - 1]!, b = r.pts[i]!, k = (t - r.at[i - 1]!) / Math.max(1e-6, r.at[i]! - r.at[i - 1]!);
  o.x = a.x + (b.x - a.x) * k; o.y = a.y + (b.y - a.y) * k; o.ang = Math.atan2(b.y - a.y, b.x - a.x);
  return false;
}

/** a golfer's visit: id, the person drawn (index into the golfers), the car type, the car-park bay, the stage and its clock, its route, the bay
 *  (index into the scene's bays), the swing count, the time it queued and the time its sale began (its bay is held from then: the swings fill
 *  what is left of one town hour, so a bay takes a golfer an hour as the demand and skippedVisits count it) */
interface Visit { id: number; person: number; car: number; slot: number; stage: S; t: number; r: Route | null; bay: number; swings: number; queued: number; served: number; x: number; y: number; ang: number;
  /** the practice facility it walks to or plays (T130), its spot there (index into the facility's stands) and the cup it aims at */
  fac?: PracticeId; spot?: number; aim?: Pt;
  /** T133: wants a lesson at the academy, got one (its bay is a lesson bay), its upper-deck bay's stand and lift (the golfer drawn up there:
   *  the lift ramps on the stairs), and it went for a coffee */
  lesson?: boolean; taught?: boolean; up?: { x: number; y: number; h: number }; coffee?: boolean;
  /** T386: the balls of its bucket it has yet to hit (the ball loop: a swing lands its share, what is left lands when it leaves) */
  left?: number;
  /** T146: the counter it walks up to and is served at (index into the scene's counters), and when its car turned in (sim s) and whether it bought */
  desk?: number; born: number; bought?: boolean;
  /** T152: its car as drawn while it is on the road (driving or waiting at its start; none while parked or gone) */
  rc?: RangeCar }
/** a ball in the air: from, to (tiles), launch time and flight time (s), and the arc's height (tiles); roll: a putt rolling on the green (it slows
 *  to the cup and is holed or picked up: it never lies) */
interface Ball { x0: number; y0: number; x1: number; y1: number; t0: number; T: number; h: number; roll?: boolean; /** its start's height (units, T133: off the upper deck) */ h0?: number;
  /** T251: its bounce and roll after it lands (it lies where that stops); absent: it lies where it lands */
  after?: BallRoll;
  /** T386: the balls this swing stands for (the one you see and the others that land round it); a practice chip never lies on the outfield */
  n?: number; prac?: true }
/** a golfer, the pro or a coffee drinker as the engine draws it: a crowd person, lifted onto the upper deck (world px, T133) */
export type RangePerson = CrowdPerson & { lift: number; /** Stable visit id; zero is the academy pro. */ id: number };
/** what the engine sees of the sim each frame */
export interface RangeDraw {
  /** the golfers on foot (walking, queued, hitting) as crowd people (group 1), the academy's pro among them (T133) */
  people: RangePerson[]; nPeople: number;
  /** the cars (driving or parked): point, heading (radians, world), type and its golfer's visit (T228: its paint; -1 the ball picker) */
  cars: { x: number; y: number; ang: number; type: number; id: number }[]; nCars: number;
  /** the ball picker cart (T133; null: none): where it is, and whether it is out on its lanes (it is also the last of the cars; T459: or driving home from them, caught out by opening time) */
  picker: { x: number; y: number; out: boolean } | null;
  /** T386 part 2: the range attendants on shift and the robot pickers at work (their stand-ins): point, heading (radians, world), kind; T459: id is the hand's own slot (an attendant's
   *  shift, a robot's number) for as long as he works here; moving: on his way out to the pile or back (else standing at the door to drop his basket, or picking) */
  agents: { x: number; y: number; ang: number; kind: 'attendant' | 'robot'; moving: boolean; id: number; /** #1235: an attendant at the pile, picking (drawn with the pick clip) */ pick: boolean }[]; nAgents: number;
}
/** the town clock as the sim reads it: the hour (fractional) and the day number */
export interface RangeClock { hour: number; day: number }
/** today's counts (since the town's midnight): golfers who bought, golfers lost, and the queue now */
export interface RangeToday { golfers: number; lost: number; queue: number; playing: number;
  /** T133: today's coffees and lessons, the kiosk's line now and the golfers hitting upstairs */
  coffees: number; lessons: number; kioskQueue: number; upstairs: number;
  /** T146: today's cars turned away because the car park was full (also in lost), and the hitting bays taken now (from the sale to the bucket's end) */
  noPark: number; taken: number;
  /** T386: today's golfers who drove on because the ball room was out of balls (also in lost) */
  noBalls: number }

/** T251: a range ball's bounce and roll after it lands at (x, y), flown len tiles along (ux, uy). Near a target green (within CATCH tiles of the hollow
 *  round it) it gathers in that hollow, HOLLOW tiles past the green's edge: from beyond it rolls back down into it, from the green's edge out into it,
 *  and from the green itself (a raised green) it holds HOLD of the time (a short check) or runs off forward into the hollow behind; turned a little
 *  about the green, so the balls ring it. Elsewhere it runs out along the outfield by RUN of its carry (0.6 to 1.4 times), bent a little. It stops
 *  short of the fences. Its chances come from a hash of the landing, so the range's own stream (its golfers' business) is untouched */
export function rollOut(x: number, y: number, ux: number, uy: number, len: number, sc: Pick<RangeScene, 'targets' | 'fence'>): BallRoll {
  const qx = Math.floor(x * 1024), qy = Math.floor(y * 1024), h1 = hash(qx, qy), h2 = hash(qy ^ 0x5bd1e995, qx), land = { x, y };
  let ex = x, ey = y, lie: Lie = 'fairway', cross = 0, best = Infinity;
  let g: SceneTarget | null = null;
  for (const t of sc.targets) { const d = Math.hypot(x - t.x, y - t.y) - t.r - HOLLOW; if (d < CATCH && d < best) { best = d; g = t; } }
  if (g) {
    const dx = x - g.x, dy = y - g.y, d = Math.hypot(dx, dy), R = g.r + HOLLOW;
    if (d < g.r && h1 < HOLD) {
      // held: a short check on, kept on the green (short of its edge)
      const rr = g.r - 0.3, b = dx * ux + dy * uy, q = b * b - (d * d - rr * rr), edge = q > 0 ? Math.max(0, -b + Math.sqrt(q)) : 0, k = Math.min(len * GREEN_RUN * (0.5 + h2), edge);
      lie = 'green'; ex = x + ux * k; ey = y + uy * k;
    }
    else {
      // the way from the green's middle to where it gathers: through the landing (from the green itself, on forward), turned up to 0.25 rad
      let ax = d < g.r ? dx + ux * g.r : dx, ay = d < g.r ? dy + uy * g.r : dy; const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
      const a = (h2 - 0.5) * 0.5, c = Math.cos(a), sn = Math.sin(a), rx = ax * c - ay * sn, ry = ax * sn + ay * c;
      ex = g.x + rx * R; ey = g.y + ry * R; lie = d < g.r ? 'green' : (ex - x) * ux + (ey - y) * uy < 0 ? 'fescue' : 'fairway'; // (rolling back down: a low hop)
    }
  } else { const k = len * RUN * (0.6 + 0.8 * h1); ex = x + ux * k; ey = y + uy * k; cross = (h2 - 0.5) * 2 * WOBBLE; }
  // short of the fences: the way cut where it would cross one (none from a landing already past it)
  const f = sc.fence;
  if (f) {
    const fu = (px: number, py: number) => (px - f.o.x) * f.u.x + (py - f.o.y) * f.u.y, fv = (px: number, py: number) => (px - f.o.x) * f.v.x + (py - f.o.y) * f.v.y;
    const u0 = fu(x, y), v0 = fv(x, y), u1 = fu(ex, ey), v1 = fv(ex, ey);
    let k = 1;
    if (v1 > f.v1) k = Math.min(k, v0 >= f.v1 ? 0 : (f.v1 - v0) / (v1 - v0));
    if (u1 > f.u1) k = Math.min(k, u0 >= f.u1 ? 0 : (f.u1 - u0) / (u1 - u0));
    if (u1 < f.u0) k = Math.min(k, u0 <= f.u0 ? 0 : (u0 - f.u0) / (u0 - u1));
    if (k < 1) { ex = x + (ex - x) * k; ey = y + (ey - y) * k; }
  }
  return new BallRoll().set(land, { x: ex, y: ey }, lie, lie, len * TILE_M, ROLL_S, null, cross);
}

/** T459 (the owner, 2026-11-14: "the pro, i assume me, walks to pick up balls and teleports all over"): the range attendants and the robot pickers walk
 *  their rounds instead of being placed by a formula. Their spot was the ball room plus the round's share of the way to the pile; the pile is the ball
 *  nearest the room, found again every second, and as the attendant picked (12x as fast in the jam) it moved, so he jumped with it. Now each keeps his
 *  own spot and walks it at a walker's pace: out to the pile, picks there, back to the room, drops the balls, out again; a pile that moves is walked to.
 *  His shift ending (or his machine going) sends him home to drop his basket and go in at the door, not out of the picture where he stands.
 *  The paces: an attendant walks as the range's customers do (WALK, tiles a sim second), a robot trundles slower */
export const AGENT_SPEED = { attendant: WALK, robot: 1 } as const;
/** the sim seconds an attendant picks at the pile and empties his basket at the room */
export const AGENT_PICK_S = 6, AGENT_DROP_S = 1.5;
/** an attendant's or a robot's round: his spot (tiles), the leg he is on ('gone': he went in at the ball room's door), the sim seconds left of a pick or a drop, the
 *  way he faces (radians); to and has: the pile he set out for (kept when the field clears on his way: he still picks there; none: home); leave: his shift is over,
 *  he does not go out again (after his drop he goes in) */
export interface AgentWalk { x: number; y: number; leg: 'out' | 'pick' | 'back' | 'drop' | 'gone'; left: number; ang: number; to?: Pt; has?: boolean; leave?: boolean }
/** dt sim seconds of a round, never faster than speed (tiles a sim second): to the pile (the one he set out for when the field has cleared since; none at
 *  all: back to the room), picking, back, dropping; a leaver turns back from the field, drops and is gone. Pure, and allocation-free after the first pile */
export function walkAgent(a: AgentWalk, room: Pt, pile: Pt | null, dt: number, speed: number, pickS = AGENT_PICK_S, dropS = AGENT_DROP_S): void {
  let t = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  for (let guard = 0; guard < 12 && t > 1e-9 && a.leg !== 'gone'; guard++) {
    if (a.leg === 'pick' || a.leg === 'drop') {
      const s = Math.min(t, a.left); a.left -= s; t -= s;
      if (a.left > 1e-9) break;
      a.leg = a.leg === 'pick' ? 'back' : a.leave ? 'gone' : 'out'; continue;
    }
    if (a.leg === 'out') {
      if (a.leave) { a.leg = 'back'; a.has = false; continue; }   // (his shift ended on his way out: he turns round)
      if (pile) { const o = a.to ?? (a.to = { x: 0, y: 0 }); o.x = pile.x; o.y = pile.y; a.has = true; }
      if (!a.has) { a.leg = 'back'; continue; }                    // (no balls out when he set off: home)
    }
    const to = a.leg === 'out' ? a.to! : room, dx = to.x - a.x, dy = to.y - a.y, d = Math.sqrt(dx * dx + dy * dy), step = speed * t;   // (not Math.hypot: it allocates on every call)
    if (d > 1e-6) a.ang = Math.atan2(dy, dx);
    if (step < d) { a.x += (dx / d) * step; a.y += (dy / d) * step; break; }
    a.x = to.x; a.y = to.y; t -= speed > 0 ? d / speed : t;
    if (a.leg === 'out') { a.leg = 'pick'; a.left = pickS; a.has = false; } else { a.leg = 'drop'; a.left = dropS; }
  }
}
/** T459: the hands the range can have at once: its attendants (a slot a shift, the tree's three) then its robots (the nodes' six): each slot is one person or machine
 *  that keeps his own round for as long as he works here, so a change of crew never moves anybody but the one who comes or goes */
const HANDS_ATT = 3, HANDS_ROBOT = 6;

/** The golfers you see (plan 2.2). step() moves them on and returns the takings booked ($); the counts go into the save's season and total */
export class RangeSim {
  private visits: Visit[] = []; private queue: number[] = []; private balls: Ball[] = [];
  /** the lying balls, x y pairs (a ring of LYING_MAX) and how many */
  readonly lying = new Float32Array(LYING_MAX * 2); nLying = 0; private lyingAt = 0;
  private nextId = 1; private rnd: () => number; private t = 0; private bayBusy: boolean[] = [];
  /** T152: the seats left in the car park building's last car drawn in, and in its last car drawn out (its next golfers ride in it: SEATS) */
  private seatsIn = 0; private seatsOut = 0;
  /** the town day's length the last step ran at (sim s) */
  private dayLen = 0;
  /** the pro shop's counters (T146: serving in parallel): the golfer each serves (-1: free), its serve time left, and whether it has begun (the
   *  golfer has walked up to it) */
  private desks: { id: number; left: number; on: boolean }[] = [];
  /** the range's money as it happens (T146; T147 hangs the floating money on it): every sale, fee, coffee, lesson and lost golfer */
  onMoney: ((e: RangeMoneyEvent) => void) | null = null;
  /** the cars that left after a bucket (T146): how many and their town hours in the car park in all (a check on carHours) */
  readonly carStats = { n: 0, hours: 0 };
  private scene: RangeScene | null = null; private slots: CarSlot[] = []; private entrance: Pt | null = null; private slotBusy: boolean[] = [];
  today: RangeToday = { golfers: 0, lost: 0, queue: 0, playing: 0, coffees: 0, lessons: 0, kioskQueue: 0, upstairs: 0, noPark: 0, taken: 0, noBalls: 0 }; private day = -1;
  /** T386 (#1043): the range's balls (golf/rangeballs.ts), attached by the host from the save; null: balls without end and none lying (the range as it was
   *  before the ball loop: the older tests' sim). With them a bucket takes its balls out of the ball room (an empty one sells nothing), every ball hit lies
   *  on the outfield until it is picked up, and the night cart picks what it reaches. Set with setBalls */
  book: BallSave | null = null;
  setBalls(b: BallSave | null): void { if (b !== this.book) this.hands.fill(null); this.book = b; }   // (T459: another game's balls bring another game's crew)
  private draw: RangeDraw = { people: [], nPeople: 0, cars: [], nCars: 0, picker: null, agents: [], nAgents: 0 };
  /** the coffee kiosk's line (T133), the golfer served and its time left */
  private kq: number[] = []; private kServing = -1; private kLeft = 0;
  /** the academy's pro (T133): where it stands and faces, whether it walks, and since when it coaches the golfer it stands by (-1: waiting) */
  private pro = { x: 0, y: 0, ang: 0, walking: false, coach: -1, since: 0, placed: false };
  /** the ball picker cart (T133): its route, its time out on it (-1: parked), and it has picked tonight; T459: it is driving home from where opening time caught it (it picks nothing on the way) */
  private pick: Route | null = null; private pickT = -1; private picked = false; private pickAt = { x: 0, y: 0, ang: 0 }; private pickBack = false;
  /** the queue limit now, and the golfers who turned back at the shop this step (counted as lost by step, where each turned back) */
  private qMax = 5; private lost: Pt[] = [];
  private tmp = { x: 0, y: 0, ang: 0 };
  /** the practice facilities as the course grid holds them (T130: null, none read yet), each spot taken or free, and the golfers who began to
   *  practise this step (their fees are booked by step) */
  private practice: PracticeScan | null = null; private spotBusy: Record<PracticeId, boolean[]> = { putting: [], chipping: [] }; private used: PracticeId[] = [];
  /** today's golfers at each practice facility */
  practiceToday: Record<PracticeId, number> = { putting: 0, chipping: 0 };
  constructor(seed: number, private golfers = 10) { this.rnd = mulberry(seed ^ 0x5eed7a); }

  /** the scene and the car park (its bays and entrance; none: no car park, no visitors): a new scene keeps the golfers, whose bays it keeps */
  setScene(scene: RangeScene, slots: CarSlot[], entrance: Pt | null): void {
    this.scene = scene; this.slots = slots; this.entrance = entrance; this.lag.key = '';
    const nb = scene.bays.length;
    this.bayBusy.length = nb; for (let i = 0; i < nb; i++) this.bayBusy[i] = this.visits.some(v => v.bay === i && v.stage >= S.WalkBay && v.stage <= S.Hit);
    // a golfer whose bay is gone (the bays never shrink, but a load can change them) finishes now
    for (const v of this.visits) if (v.bay >= nb && v.stage >= S.WalkBay && v.stage <= S.Hit) this.leave(v);
    this.slotBusy = slots.map((_, i) => this.visits.some(v => v.slot === i && v.stage !== S.Done));
    // the counters (T146): more as the range grows; a golfer at a counter that went (a load) is served at the first
    const nd = Math.max(1, scene.counters.length);
    while (this.desks.length < nd) this.desks.push({ id: -1, left: 0, on: false });
    for (let i = nd; i < this.desks.length; i++) { const v = this.visits.find(q => q.id === this.desks[i]!.id); if (v) { if (v.bay >= 0) this.bayBusy[v.bay] = false; v.bay = -1; v.desk = undefined; this.queue.unshift(v.id); } }
    this.desks.length = nd;
    const low: number[] = [], up: number[] = [];
    scene.bays.forEach((b, i) => { if (b.lift) up.push(i); else if (!b.academy) low.push(i); });
    this.bayOrder = []; for (let k = 0; k < Math.max(low.length, up.length); k++) { if (k < low.length) this.bayOrder.push(low[k]!); if (k < up.length) this.bayOrder.push(up[k]!); }
    // the extras (T133): the picker's lanes (its speed set by step from the day's length); a kiosk or an academy that went sends its people on
    this.pick = scene.picker ? route(scene.picker.lanes, [1]) : null; if (!this.pick) { this.pickT = -1; this.pickBack = false; }
    if (!scene.kiosk) { for (const id of this.kq) { const v = this.visits.find(q => q.id === id); if (v) this.walk(v, S.WalkCar, this.toCar(v, { x: v.x, y: v.y })); } this.kq.length = 0; this.kServing = -1; }
    if (!scene.academy) { this.pro.placed = false; this.pro.coach = -1; }
  }
  /** the practice facilities as the course grid holds them now (T130): a golfer at a facility that closed, or at a spot that went, walks back */
  setPractice(p: PracticeScan | null): void {
    this.practice = p;
    for (const id of PRACTICE_IDS) {
      const f = p?.[id], n = f && f.state === 'open' ? f.stands.length : 0, busy = this.spotBusy[id];
      busy.length = n; for (let i = 0; i < n; i++) busy[i] = false;
      for (const v of this.visits) {
        if (v.fac !== id || (v.stage !== S.WalkPractice && v.stage !== S.Practice)) continue;
        if (v.spot! < n) busy[v.spot!] = true; else this.walk(v, S.WalkCar, this.toCar(v, { x: v.x, y: v.y }));
      }
    }
  }
  /** the balls in the air (or rolling on a practice green) now: each one's point and height (tiles), written into out as x y h triples; returns how many */
  flying(out: Float32Array): number {
    let n = 0; const p = this.rollPt;
    for (const b of this.balls) {
      const k0 = (this.t - b.t0) / b.T; if (k0 < 0 || 3 * n + 2 >= out.length) continue;
      if (k0 > 1) {
        // T251: bouncing and rolling on after its landing (heights in metres, out in units)
        const a = ballRoll.on ? b.after : undefined, e = this.t - b.t0 - b.T; if (!a || e >= a.rest) continue;
        a.at(e, p); out[3 * n] = p.x; out[3 * n + 1] = p.y; out[3 * n + 2] = p.h / UNIT_M; n++; continue;
      }
      const k = b.roll ? 1 - (1 - k0) * (1 - k0) : k0;
      out[3 * n] = b.x0 + (b.x1 - b.x0) * k; out[3 * n + 1] = b.y0 + (b.y1 - b.y0) * k; out[3 * n + 2] = b.roll ? 0 : (b.h0 ?? 0) * (1 - k) + 4 * b.h * k * (1 - k); n++;
    }
    return n;
  }
  /** T251: flying's point of a ball rolling */
  private rollPt = { x: 0, y: 0, h: 0 };
  /** T251 (the bench's busy range, bench.ts ?rangeBalls=N): this many balls kept in the air (0: none added), and their own stream */
  benchBalls = 0; private benchRnd: (() => number) | null = null;
  /** the golfers on the range now (walking to the shop, queued, at the mats or going back) */
  get onFoot(): number { let n = 0; for (const v of this.visits) if (v.stage >= S.WalkShop && v.stage <= S.WalkCar) n++; return n; }

  /** dt sim seconds on (dt of two minutes or more: a skip, booked by skippedVisits and the golfers cleared; the host steps a long frame in pieces).
   *  Returns the takings booked ($) */
  step(dt: number, clock: RangeClock, s: RangeBizSave, c: DemandCtx, dayLen: number): number {
    const sc = this.scene; if (!sc || dt <= 0) return 0;
    if (clock.day !== this.day) { this.day = clock.day; this.today.golfers = 0; this.today.lost = 0; this.today.coffees = 0; this.today.lessons = 0; this.today.noPark = 0; this.today.noBalls = 0; this.practiceToday.putting = 0; this.practiceToday.chipping = 0; }
    const B = this.book, auto = B ? autoKit(s.owned) : null, vb = auto ? bucketBalls(visitBalls(dayLen), auto) : visitBalls(dayLen); this.nets = !!auto?.nets;
    // T386: a new town day: the night's losses on the outfield and in the ball room (golf/rangeballs.ts overnight), the day's ball counts start again
    if (B && clock.day !== B.dayNo) { const nights = B.dayNo < 0 ? 0 : clock.day - B.dayNo; if (nights > 0) overnight(B, nights, this.rnd, s.owned.includes('stamp') ? STAMP_KEEP : 1); else if (B.dayNo >= 0) B.day = zeroCounts(); B.dayNo = clock.day; }
    const st = rangeStats(s, c), value = saleValue(s, dayLen, st), scale = rangeScale(dayLen); this.qMax = st.qMax; this.dayLen = dayLen;
    // the range's money, all of it here (T146): each sale, fee, coffee, lesson and lost golfer is counted in the save and told to onMoney with
    // where it happened (T147's floating money); booked is what step returns
    let booked = 0;
    const tell = (kind: RangeMoneyEvent['kind'], n: number, amount: number, at: Pt | null, why?: RangeMoneyEvent['why']) => { if (this.onMoney && n > 0) this.onMoney({ kind, n, amount, at, ...(why ? { why, missed: n * value } : {}) }); };
    const sell = (n: number, at: Pt | null, k = 1) => { const m = n * value * k; s.season.golfers += n; s.total.golfers += n; s.season.buckets += n * scale; s.total.buckets += n * scale; s.season.takings += m; s.total.takings += m; this.today.golfers += n; booked += m; tell('bucket', n, m, at); };
    const lose = (n: number, at: Pt | null, why: NonNullable<RangeMoneyEvent['why']>) => { s.season.lost += n; s.total.lost += n; this.today.lost += n; if (why === 'parking') this.today.noPark += n; if (why === 'balls') this.today.noBalls += n; tell('lost', n, 0, at, why); };
    // a practice facility's fees (T130): the business takings, as the buckets
    const fee = (id: PracticeId, n: number, at: Pt | null) => {
      const m = n * PRACTICE_FEE * scale, f = s.practice?.[id]; if (!f || n <= 0) return;
      f.season.golfers += n; f.total.golfers += n; f.season.takings += m; f.total.takings += m; s.season.takings += m; s.total.takings += m; booked += m; tell('practice', n, m, at);
    };
    // the extras' takings (T133): a coffee or a lesson, booked with the buckets as business takings and counted on the extra
    const extra = (id: ExtraId, n: number, at: Pt | null) => {
      const m = extraValue(id, n, dayLen), e = s.extras?.[id]; if (!e || n <= 0) return;
      e.season.golfers += n; e.total.golfers += n; e.season.takings += m; e.total.takings += m; s.season.takings += m; s.total.takings += m; booked += m;
      if (id === 'kiosk') this.today.coffees += n; else this.today.lessons += n;
      tell(id === 'kiosk' ? 'coffee' : 'lesson', n, m, at);
    };
    if (dt >= 120) {
      // a skip (T146: the car park counts, as the live range's cars hold their bays)
      const r = skippedVisits(s, c, clock.hour, dt, dayLen, this.skipLive(st, dayLen));
      // T386: with the ball loop the shop serves only the visits its balls allow (day by day: the night cart brings the balls back); the rest drove on
      let served = r.served;
      let mixed = 1;
      if (B && auto && sc.aims.length) {
        this.settle(sc); const pk = pickKit(s.owned); let avg = 0; for (let h = 0; h < 24; h++) avg += staffBps(auto, pk, h, B.shift) / 24; // (the staff's day: each shift a third of it)
        const o = skipBalls(B, r.served, vb, dt, dayLen, avg + robotBps(auto), washBps(auto), st.picker, () => this.aimPoint(sc), this.rnd, this.bounds(), auto.polish ? POLISH_VALUE : 1); served = o.served; mixed = o.value;
        if (r.served - served > 1e-6) lose(r.served - served, null, 'balls'); B.day.sold += Math.round(served * vb); B.total.sold += Math.round(served * vb);
      }
      sell(served, null, mixed); lose(r.lost, null, 'queue');
      const u = practiceUsers(s, served); for (const id of PRACTICE_IDS) fee(id, u[id], null);
      const kv = r.served > 0 ? served / r.served : 0; extra('kiosk', r.coffees * kv, null); extra('academy', r.lessons * kv, null);
      this.clear(); this.t += dt; return booked;
    }
    this.t += dt;
    const isOpen = hourWeight(clock.hour, st) > 0;
    // the arrivals: a Poisson stream at the hour's rate; a car turns away at a long queue or a full car park
    const rate = arrivalRate(s, c, clock.hour, dayLen, st);
    if (rate > 0 && this.rnd() < 1 - Math.exp(-rate * dt)) {
      // the driver sees the line at the shop (a golfer who walks up to a line that grew meanwhile may still turn back: see move)
      // the driver judges the line it will find (T146): the line now and the golfers on their way to it, less those the counters will have
      // served by the time it gets there (judging by the line alone, an hour before reaching it, overfilled it and then let it run dry)
      const waiting = this.queue.length + this.inbound() - this.lagServed(st, dayLen);
      const slot = this.slotBusy.indexOf(false);
      // T146: a car turned away by a full car park is counted on its own (the card's parking line)
      // (T237: no car park within walking distance of the shop is no parking, as a full one: golf/walkserve.ts)
      if (waiting >= st.qMax) lose(1, sc.J, 'queue');
      else if (slot < 0 || !this.entrance) lose(1, sc.J, 'parking');
      // T386: a driver who finds the ball room cannot fill a bucket for him (the buckets it holds are spoken for by the golfers already coming) drives on
      else if (B && bucketsLeft(B, vb) <= this.awaiting()) lose(1, sc.J, 'balls');
      else this.arrive(slot);
    }
    // the counters (T146: in parallel): a free counter calls the line's head when a bay is free (its bay is held from then), the golfer walks up
    // and is served there; the sale is booked at the counter
    for (let i = 0; i < this.desks.length; i++) {
      const d = this.desks[i]!, at = sc.counters[i] ?? sc.counter;
      if (d.id < 0) {
        if (!isOpen || !this.queue.length) continue;
        const head = this.visits.find(v => v.id === this.queue[0]); if (!head || head.stage !== S.Queue || !this.atSpot(head)) continue;
        const bay = this.pickBay(head); if (bay < 0) continue;
        if (B && stockOf(B) < vb * (1 + this.desks.reduce((n, q) => n + (q.id >= 0 ? 1 : 0), 0))) continue; // (T386: the ball room holds a bucket for it)
        this.queue.shift(); d.id = head.id; d.left = st.serve; d.on = false; head.desk = i; head.bay = bay; this.bayBusy[bay] = true;
        continue;
      }
      const v = this.visits.find(q => q.id === d.id); if (!v) { d.id = -1; continue; }
      if (!d.on) { if (Math.hypot(v.x - at.x, v.y - at.y) >= 0.15) continue; d.on = true; }
      if ((d.left -= dt) > 0) continue;
      d.id = -1; v.desk = undefined;
      // T386: the bucket's balls leave the ball room for the golfer's hands (the ball room emptied under it: it drives on)
      const mix = B ? takeMix(B, vb) : null;
      if (B && !mix) { if (v.bay >= 0) this.bayBusy[v.bay] = false; v.bay = -1; lose(1, at, 'balls'); this.walk(v, S.WalkCar, this.toCar(v, { x: v.x, y: v.y })); continue; }
      if (B) v.left = vb;
      v.bought = true; sell(1, at, mix ? bucketValue(mix.clean, mix.dirty, auto?.polish) : 1); v.served = this.t - st.serve;
      // the academy (T133): a golfer who wanted a lesson and got a lesson bay pays for it with the bucket
      const b = sc.bays[v.bay]!; if (v.lesson && b.academy) { v.taught = true; extra('academy', 1, at); }
      if (b.lift) v.up = { x: b.stand.x, y: b.stand.y, h: b.lift };
      // T239: along the player's walking path when one joins the shop and the tee, else across the dirt
      const w = sc.walk;
      this.walk(v, S.WalkBay, [{ x: v.x, y: v.y }, ...(w ? w.shopBay[v.bay] ?? [w.shop] : [sc.shopJoin]), b.back, b.stand]);
    }
    // the coffee kiosk (T133): its line's head is served, pays and goes on to the practice area or its car
    if (this.kServing < 0 && this.kq.length) {
      const head = this.visits.find(v => v.id === this.kq[0]);
      if (head && head.stage === S.KioskQueue && this.atKiosk(head)) { this.kServing = head.id; this.kLeft = KIOSK_SERVE; }
    }
    if (this.kServing >= 0 && (this.kLeft -= dt) <= 0) {
      const v = this.visits.find(q => q.id === this.kServing); this.kServing = -1; this.kq.shift();
      if (v) { extra('kiosk', 1, sc.kiosk ? sc.kiosk.counter : null); if (!this.toPractice(v, sc)) this.walk(v, S.WalkCar, this.toCar(v, { x: v.x, y: v.y })); }
    }
    // closing: the queue goes home (lost); patience: a golfer queued two town hours leaves
    const patience = PATIENCE_H * dayLen / 24;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const v = this.visits.find(q => q.id === this.queue[i]); if (!v) continue;
      if (!isOpen || this.t - v.queued > patience) { this.queue.splice(i, 1); lose(1, { x: v.x, y: v.y }, 'patience'); this.walk(v, S.WalkCar, this.toCar(v, { x: v.x, y: v.y })); }
    }
    for (const v of this.visits) this.move(v, dt, dayLen, sc);
    for (const p of this.lost) lose(1, p, 'queue');
    this.lost.length = 0;
    for (const id of this.used) { fee(id, 1, this.practice?.[id]?.centre ?? null); this.practiceToday[id]++; }
    this.used.length = 0;
    // the queue's spots: each queued golfer walks up to its place in the line, a golfer called to a counter (T146) up to it
    this.queue.forEach((id, k) => { const v = this.visits.find(q => q.id === id); if (v && v.stage === S.Queue) this.toward(v, this.queueSpot(k), dt); });
    this.desks.forEach((d, i) => { const v = d.id >= 0 ? this.visits.find(q => q.id === d.id) : undefined; if (v && v.stage === S.Queue) this.toward(v, sc.counters[i] ?? sc.counter, dt); });
    this.kq.forEach((id, k) => { const v = this.visits.find(q => q.id === id); if (v && v.stage === S.KioskQueue) this.toward(v, this.kioskSpot(k), dt); });
    // (T251: a ball lies where its bounce and roll stop)
    this.balls = this.balls.filter(b => { const a = ballRoll.on ? b.after : undefined; if (this.t < b.t0 + b.T + (a ? a.rest : 0)) return true; if (!b.roll && !(b.prac && this.book)) { if (a) this.lie(a.ex, a.ey, b.n); else this.lie(b.x1, b.y1, b.n); } return false; });
    // (T251, the bench's busy range: benchBalls balls kept in the air from the bays, on a stream of their own, so the range's business is as it was)
    if (this.benchBalls > 0 && sc.bays.length) { const r = this.benchRnd ?? (this.benchRnd = mulberry(0xba11)); for (let k = 0; this.balls.length < this.benchBalls && k < this.benchBalls; k++) this.launchFrom(Math.floor(r() * sc.bays.length), sc, r); }
    // T152: a visit stays while its car is still on the road (it fell behind its timetable: drive)
    this.visits = this.visits.filter(v => v.stage !== S.Done || v.rc);
    // the balls are picked once the range is closed and empty: at once (D15), or by the ball picker cart driving its lanes (T133)
    const empty = !isOpen && !this.visits.some(v => v.stage === S.Hit);
    // (T386: with the ball loop the balls lie until somebody picks them up: only the night cart, once it is bought, picks them here)
    if (!this.pick) { if (empty && !B) this.nLying = 0; }
    else this.drivePicker(dt, isOpen, empty, dayLen);
    this.movePro(dt, sc);
    if (B && auto) this.automate(dt, clock.hour, B, s, auto, sc);
    this.today.queue = this.queue.length; this.today.kioskQueue = this.kq.length;
    let hit = 0, up = 0; for (const v of this.visits) if (v.stage === S.Hit) { hit++; if (v.up) up++; }
    this.today.playing = hit; this.today.upstairs = up;
    let taken = 0; for (const b of this.bayBusy) if (b) taken++; this.today.taken = taken;
    return booked;
  }
  /** the ball picker cart (T133): out once the range is closed and empty, along its lanes at a speed that drives them in PICK_HOURS town hours,
   *  picking every lying ball within PICK_SWATH of the leg it drove this step; home once done. Opening time sends it home and the rest are picked */
  private drivePicker(dt: number, isOpen: boolean, empty: boolean, dayLen: number): void {
    const r = this.pick!, len = r.at[r.at.length - 1]!, speed = len / (PICK_HOURS * dayLen / 24);
    // (T386: with the ball loop, opening time sends the cart home and what it did not reach stays out on the range; T459: it drives home from where it is, it does not jump there)
    if (isOpen) { if (this.pickT >= 0 && !this.book) this.nLying = 0; if (this.pickT >= 0) this.pickBack = true; this.pickT = -1; this.picked = false; this.driveHome(dt, speed); return; }
    if (this.pickBack) { this.driveHome(dt, speed); return; }
    if (this.pickT < 0) { if (!empty || this.picked) return; this.pickT = 0; along(r, 0, this.pickAt); }
    const a = { x: this.pickAt.x, y: this.pickAt.y };
    this.pickT += dt * speed;
    const done = along(r, this.pickT, this.pickAt);
    this.sweep(a, this.pickAt, PICK_SWATH);
    if (done) { this.pickT = -1; this.picked = true; if (!this.book) this.nLying = 0; }
  }
  /** T459: the cart opening time caught out on its lanes drives on to its home spot at the speed of its lanes (dt sim seconds) */
  private driveHome(dt: number, speed: number): void {
    if (!this.pickBack) return;
    const h = this.scene!.picker!.home, p = this.pickAt, dx = h.x - p.x, dy = h.y - p.y, d = Math.sqrt(dx * dx + dy * dy), m = speed * dt;
    if (d <= m) { p.x = h.x; p.y = h.y; this.pickBack = false; return; }
    p.x += dx / d * m; p.y += dy / d * m; p.ang = Math.atan2(dy, dx);
  }
  /** the lying balls within w of the leg a-b are picked (the ring is packed again; T386: with the ball loop they come off the outfield into the ball room) */
  private sweep(a: Pt, b: Pt, w: number): void {
    const B = this.book; if (B) { stow(B, pickSwath(B, a.x, a.y, b.x, b.y, w, Infinity), 'night'); return; }
    const L = this.lying, n = this.nLying, dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1e-9, w2 = w * w;
    let k = 0;
    for (let i = 0; i < n; i++) {
      const x = L[2 * i]!, y = L[2 * i + 1]!, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L2)), ex = a.x + dx * t - x, ey = a.y + dy * t - y;
      if (ex * ex + ey * ey <= w2) continue;
      L[2 * k] = x; L[2 * k + 1] = y; k++;
    }
    this.nLying = k; this.lyingAt = k % LYING_MAX;
  }
  /** the academy's pro (T133): waits on the tee in front of its two lesson bays; with a lesson on it walks over and stands beside the golfer, facing it, now and then
   *  showing the swing (two lessons at once: it moves between them) */
  private movePro(dt: number, sc: RangeScene): void {
    const a = sc.academy, pr = this.pro; if (!a) return;
    if (!pr.placed) { pr.x = a.home.x; pr.y = a.home.y; pr.placed = true; pr.ang = Math.atan2(sc.aim.y, sc.aim.x); }
    const pupils = this.visits.filter(v => v.taught && v.stage === S.Hit);
    if (!pupils.some(v => v.id === pr.coach) || (pupils.length > 1 && this.t - pr.since > 25)) {
      const next = pupils.find(v => v.id !== pr.coach) ?? pupils[0];
      pr.coach = next ? next.id : -1; pr.since = this.t;
    }
    const v = this.visits.find(q => q.id === pr.coach), b = v ? sc.bays[v.bay] : undefined;
    // beside its pupil (toward the other lesson bay) and a step in front of the mats (out of the roof's footprint), else its own spot on the tee
    let tx = a.home.x, ty = a.home.y;
    if (v && b) { const side = sc.bays[0] === b ? 1 : -1; tx = b.stand.x + sc.roadDir.x * 1.2 * side + sc.aim.x * 0.35; ty = b.stand.y + sc.roadDir.y * 1.2 * side + sc.aim.y * 0.35; }
    const dx = tx - pr.x, dy = ty - pr.y, d = Math.hypot(dx, dy), m = WALK * dt;
    pr.walking = d > 0.05;
    if (d <= m) { pr.x = tx; pr.y = ty; } else { pr.x += dx / d * m; pr.y += dy / d * m; pr.ang = Math.atan2(dy, dx); }
    if (!pr.walking) pr.ang = v ? Math.atan2(v.y - pr.y, v.x - pr.x) : Math.atan2(sc.aim.y, sc.aim.x);
  }
  /** the bay the counter gives golfer v (-1: none free; T133): a golfer who wants a lesson takes a free lesson bay first; the rest take the other
   *  bays first, and a free lesson bay only when those are full (no lesson then). Without an academy: the first free bay */
  private pickBay(v: Visit): number {
    const B = this.scene!.bays, busy = this.bayBusy;
    if (v.lesson) for (let i = 0; i < B.length; i++) if (B[i]!.academy && !busy[i]) return i;
    for (const i of this.bayOrder) if (!busy[i]) return i;
    for (let i = 0; i < B.length; i++) if (!busy[i]) return i;
    return -1;
  }
  /** the order the counter fills the bays in (T133): the tee box's (not the academy's) and the upper deck's taken in turn, so both decks fill
   *  together; without a second tier the tee box's in order, as before */
  private bayOrder: number[] = [];
  /** the golfers on their way to the line (T146): driving in or walking up from their cars */
  private inbound(): number { let n = 0; for (const v of this.visits) if (v.stage === S.CarIn || v.stage === S.WalkShop) n++; return n; }
  /** the golfers the counters serve while a car turns in and its golfer walks up to the line (T146): the bays' turnover (bays / bayHours a town
   *  hour) times the town hours of that way in (the mean over the car park's bays); kept until the scene, the car park or the day changes */
  private lagServed(st: RangeStats, dayLen: number): number {
    const k = `${st.bays}:${dayLen}`; if (this.lag.key !== k) this.lag = { key: k, n: st.bays / this.bayHours(dayLen) * this.inHours(dayLen) };
    return this.lag.n;
  }
  private lag = { key: '', n: 0 };
  /** the town hours from a car turning in off the county road to its golfer at the line (T146): the drive to its bay and the walk up, the mean
   *  over the car park's bays (0 without one) */
  inHours(dayLen: number): number {
    const sc = this.scene, e = this.entrance, n = this.slots.length; let secs = 0;
    if (sc && e && n) {
      const d = sc.roadDir, from = { x: sc.J.x - d.x * 46, y: sc.J.y - d.y * 46 };
      for (const sl of this.slots) {
        const r = this.inRoute(sl, from, 0); secs += r.at[r.at.length - 1]!;
        secs += pathLen([this.carSide(sl), ...[...this.fromEdge(sl)].reverse(), sc.carEdge, sc.queueAt]) / WALK;
      }
      secs /= n;
    }
    return secs / (dayLen / 24);
  }
  /** no golfers, cars or balls (a skip, a new game) */
  /** the range's cars standing in the car park now (their golfers out on the range, the practice area or the walk back: T132, the car park's
   *  P · parked/bays counts them) */
  parked(inside?: boolean): number {
    let n = 0;
    for (const v of this.visits) if (v.stage > S.CarIn && v.stage < S.CarOut && (inside === undefined || !!this.slots[v.slot]?.inside === inside)) n++;
    return n;
  }
  /** the car park's bays the range's cars use (T146: the lot's and the car park building's) */
  get parkBays(): number { return this.slots.length; }
  /** the town hours a golfer's car holds its bay on average (T146: the skip counts the car park with it), worked out as the live range's cars
   *  spend them: the drive in off the county road (the bay is held from there) and out until the bay is freed, the walks between the car and the
   *  path's end at the car park (round the car park building, or from its door), on to the shop, up to a counter and served, the bucket (the bay
   *  is held a town hour from the sale, or the walk to it and two swings when they take longer) and the walk back; the kiosk's and the practice
   *  facilities' shares of the golfers with their detours and their times. The mean over the bays and the hitting bays. 0 without a scene or a
   *  car park */
  carHours(st: RangeStats, dayLen: number): number {
    const sc = this.scene, n = this.slots.length, e = this.entrance; if (!sc || !n || !e) return 0;
    const hourS = dayLen / 24, len = pathLen;
    const d = sc.roadDir, from = { x: sc.J.x - d.x * 46, y: sc.J.y - d.y * 46 };
    let car = 0;
    for (const sl of this.slots) {
      const r = this.inRoute(sl, from, 0); car += r.at[r.at.length - 1]! + 1.5;
      car += 2 * len([this.carSide(sl), ...[...this.fromEdge(sl)].reverse(), sc.carEdge]) / WALK;
    }
    car /= n;
    const shop = len([sc.carEdge, sc.shopJoin, sc.queueAt, sc.counter]) / WALK + st.serve;
    let back = 0;
    for (const b of sc.bays) back += len([b.stand, b.back, sc.carEdge]) / WALK;
    const bay = this.bayHours(dayLen) * hourS + back / Math.max(1, sc.bays.length);
    // at the busy range the car parks (T146): the line it finds (about qMax long) is served at the bays' turnover
    const rate = st.bays / this.bayHours(dayLen), wait = st.qMax / rate * hourS;
    let extra = 0;
    if (sc.kiosk) extra += KIOSK_SHARE * (2 * len([sc.carEdge, sc.kiosk.join, sc.kiosk.counter]) / WALK + KIOSK_SERVE);
    const pr = this.practice;
    if (pr) {
      let left = 1;
      for (const id of PRACTICE_IDS) {
        const f = pr[id]; if (f.state !== 'open' || !f.centre || !f.stands.length) continue;
        // a spot is held from the walk there to the last stroke, so the facility's spots take at most so many of the golfers an hour
        const walk = len([sc.carEdge, sc.practice.behind, sc.practice.entry, f.centre]) / WALK, held = PRACTICE_H + walk / hourS;
        const share = Math.min(left * PRACTICE_SHARE[id], f.stands.length / held / rate); left -= share;
        extra += share * (PRACTICE_H * hourS + 2 * walk);
      }
    }
    return (car + shop + wait + bay + extra) / hourS;
  }
  /** the town hours a golfer holds a hitting bay on average (T146): it is held from the sale for a town hour, or for the walk from the counter to
   *  it and two swings when they take longer (the far bays at a short day); the mean over the bays. 1 without a scene */
  bayHours(dayLen: number): number {
    const sc = this.scene; if (!sc || !sc.bays.length) return 1;
    const hourS = dayLen / 24, len = pathLen;
    let h = 0; for (const b of sc.bays) h += Math.max(hourS, len([sc.counter, sc.shopJoin, b.back, b.stand]) / WALK + 2 * SWING);
    return h / sc.bays.length / hourS;
  }
  /** what the live range's golfers take, as a skip counts it (T146): the car park's bays, carHours and bayHours (no car park: no bays, as the live
   *  range then has no visitors) */
  skipLive(st: RangeStats, dayLen: number): SkipLive {
    const carHours = this.carHours(st, dayLen);
    return { parkBays: carHours > 0 ? this.slots.length : 0, carHours: carHours > 0 ? carHours : 1, bayHours: this.bayHours(dayLen), inHours: this.inHours(dayLen) };
  }
  clear(): void {
    if (this.book && this.scene) this.settle(this.scene); // (T386: the balls golfers had bought and not yet hit land on the range first)
    this.visits = []; this.queue = []; this.balls = []; for (const d of this.desks) { d.id = -1; d.on = false; } this.nLying = 0; this.bayBusy.fill(false); this.slotBusy.fill(false); this.spotBusy.putting.fill(false); this.spotBusy.chipping.fill(false); this.used.length = 0;
    this.kq = []; this.kServing = -1; this.pickT = -1; this.pickBack = false; this.picked = false; this.pro.coach = -1; this.pro.placed = false; this.lyingAt = 0; this.seatsIn = 0; this.seatsOut = 0; this.hands.fill(null);
  }
  /** today's counts start again with the next step (a new game or a load: the town day starts again, maybe on the same day number: T135) */
  newDay(): void {
    this.day = -1; this.today = { golfers: 0, lost: 0, queue: 0, playing: 0, coffees: 0, lessons: 0, kioskQueue: 0, upstairs: 0, noPark: 0, taken: 0, noBalls: 0 }; this.practiceToday = { putting: 0, chipping: 0 };
  }

  /** a car turns in off the county road from either side, along the drive and into car-park bay `slot` */
  private arrive(slot: number): void {
    const sc = this.scene!, sl = this.slots[slot]!, side = this.rnd() < 0.5 ? -1 : 1, d = sc.roadDir, n = sc.rangeSide;
    // driving toward +u keeps to the range's side of the road (right-hand traffic: a rotation of the frame, never a mirror), toward -u the far side
    const lane = side > 0 ? 0.9 : -0.9, from = sl.off ? sl.off.road[0]! : { x: sc.J.x - d.x * side * 46 + n.x * lane, y: sc.J.y - d.y * side * 46 + n.y * lane };
    const v: Visit = { id: this.nextId++, person: Math.floor(this.rnd() * this.golfers), car: Math.floor(this.rnd() * 5), slot, stage: S.CarIn, t: 0, r: null, bay: -1, swings: 0, queued: 0, served: 0, x: from.x, y: from.y, ang: 0, born: this.t };
    // the academy (T133): a share of the golfers come for a lesson (drawn only with an academy, so a range without one plays as before)
    if (sc.academy && this.rnd() < LESSON_SHARE) v.lesson = true;
    v.r = this.inRoute(sl, from, lane);
    // T152: into the car park building a golfer rides in the last car's free seat, else drives its own (SEATS); elsewhere it drives
    if (!this.rides(v, sl, false)) v.rc = carOn(drawnRoute(v.r, sl, slot, false, d), false, !!sl.inside);
    this.slotBusy[slot] = true; this.visits.push(v);
  }
  /** T152: whether golfer v, parked in slot sl, rides in another golfer's car (in or out of the car park building: a seat left in its last car,
   *  seatsIn or seatsOut) rather than drawing its own; driving its own, it opens that car's other seats (seatsOf its seed). The sim's random
   *  stream is not drawn on (a seed by the visit's id), so the timetable and the takings are those of one golfer a car */
  private rides(v: Visit, sl: CarSlot | undefined, out: boolean): boolean {
    if (!sl?.inside) return false;
    const left = out ? this.seatsOut : this.seatsIn;
    if (left > 0) { if (out) this.seatsOut--; else this.seatsIn--; return true; }
    const k = seatsOf(hash(v.id, out ? 11 : 7)) - 1;
    if (out) this.seatsOut = k; else this.seatsIn = k;
    return false;
  }
  /** the car's way out: from its bay back through the entrance, down the drive and off along the road either way */
  private outRoute(v: Visit): Route {
    const sc = this.scene!, sl = this.slots[v.slot]!, e = sl.e ?? this.entrance!, side = this.rnd() < 0.5 ? -1 : 1, d = sc.roadDir, n = sc.rangeSide, lane = side > 0 ? 0.9 : -0.9;
    // backing out of its bay to the aisle, then (T237) back along the aisles to the mouth the way it came
    const way = sl.drive?.length ? [...sl.drive].reverse() : [{ x: sl.x - sl.hx * 2.6, y: sl.y - sl.hy * 2.6 }], vs = way.map((_, i) => (i === 0 ? PARK_V * 0.6 : PARK_V));
    // T321: no road to it: over the grass to the main roads' point nearest it, then off along them
    if (sl.off) { const { road, grass } = sl.off; return route([{ x: sl.x, y: sl.y }, ...way, ...[...grass].reverse(), ...[...road].reverse()], [...vs, PARK_V, ...grass.map(() => OFF_V), ...road.slice(1).map(() => ROAD_V)]); }
    // T237: a car park whose entrance is on the county road (a lot along the road's frontage) is left straight onto the road there
    const at = this.offDrive(e) ? e : sc.J, away = { x: at.x + d.x * side * 46 + n.x * lane, y: at.y + d.y * side * 46 + n.y * lane };
    const via = this.roadWay(sl, e);
    if (via) { const gone = { x: sc.J.x + d.x * side * 46 + n.x * lane, y: sc.J.y + d.y * side * 46 + n.y * lane }; return route([{ x: sl.x, y: sl.y }, ...way, e, ...[...via].reverse(), { x: sc.J.x + n.x * lane, y: sc.J.y + n.y * lane }, gone], [...vs, PARK_V, PARK_V, ...via.slice(1).map(() => ROAD_V), DRIVE_V, ROAD_V]); }
    if (this.offDrive(e)) return route([{ x: sl.x, y: sl.y }, ...way, e, { x: e.x + n.x * lane, y: e.y + n.y * lane }, away], [...vs, PARK_V, PARK_V, ROAD_V]);
    const onDrive = project(e, sc.J, sc.driveEnd), out = { x: sc.J.x + n.x * lane, y: sc.J.y + n.y * lane };
    return route([{ x: sl.x, y: sl.y }, ...way, e, onDrive, out, away], [...vs, PARK_V, DRIVE_V, DRIVE_V, ROAD_V]);
  }
  /** T237: whether a car park's entrance is off the range's drive (on the county road: a frontage lot), so its cars turn in and out there */
  private offDrive(e: Pt): boolean { const sc = this.scene!, q = project(e, sc.J, sc.driveEnd); return Math.hypot(e.x - q.x, e.y - q.y) > 3; }
  /** the roads to a car park off the range's drive and away from the county road (slot sl's via, from J), or null: its cars go by the drive or
   *  turn in off the county road as before */
  private roadWay(sl: CarSlot, e: Pt): Pt[] | null {
    const sc = this.scene!, d = sc.roadDir, dl = Math.hypot(d.x, d.y) || 1;
    if (!sl.via?.length || !this.offDrive(e) || Math.abs((e.x - sc.J.x) * d.y - (e.y - sc.J.y) * d.x) / dl < 6) return null;
    return sl.via;
  }
  /** the car's way in to its bay: from `from` on the county road (its lane `lane` off the line), the turn at the drive (J), along the drive to
   *  its car park's entrance, short of its bay and in (T237: a car park with its entrance on the road is turned into there, off the road) */
  private inRoute(sl: CarSlot, from: Pt, lane: number): Route {
    const sc = this.scene!, e = sl.e ?? this.entrance!, n = sc.rangeSide, bay = { x: sl.x, y: sl.y };
    // (T237: in by its car park's mouth and along the aisles to the aisle point in front of its bay, then nose-in; else short of its bay)
    const way = sl.drive?.length ? sl.drive : [{ x: sl.x - sl.hx * 2.2, y: sl.y - sl.hy * 2.2 }], vs = way.map(() => PARK_V);
    // T321: no road to it: along the main roads to their point nearest its entrance, then over the grass (from is the roads' start)
    if (sl.off) { const { road, grass } = sl.off; return route([...road, ...grass, ...way, bay], [...road.slice(1).map(() => ROAD_V), ...grass.map(() => OFF_V), ...vs, PARK_V * 0.6]); }
    const turn = { x: sc.J.x + n.x * lane, y: sc.J.y + n.y * lane }, via = this.roadWay(sl, e);
    if (via) return route([from, turn, ...via, e, ...way, bay], [ROAD_V, DRIVE_V, ...via.slice(1).map(() => ROAD_V), PARK_V, ...vs, PARK_V * 0.6]);
    if (this.offDrive(e)) return route([from, { x: e.x + n.x * lane, y: e.y + n.y * lane }, e, ...way, bay], [ROAD_V, PARK_V, ...vs, PARK_V * 0.6]);
    const onDrive = project(e, sc.J, sc.driveEnd);
    // (the old range's lot on the drive keeps its six-point way, which drawnRoute lays in the drive's lanes)
    if (!sl.drive?.length) return route([from, turn, onDrive, e, way[0]!, bay], [ROAD_V, DRIVE_V, DRIVE_V, PARK_V, PARK_V * 0.6]);
    return route([from, turn, onDrive, e, ...way, bay], [ROAD_V, DRIVE_V, DRIVE_V, ...vs, PARK_V * 0.6]);
  }
  /** T237: the range's cars standing in car park pid now (its P · parked/bays label: the range's share of a car park serving it) */
  parkedIn(pid: number): number {
    let n = 0;
    for (const v of this.visits) { const sl = this.slots[v.slot]; if (v.stage > S.CarIn && v.stage < S.CarOut && sl && !sl.inside && (sl.pid === undefined || sl.pid === pid)) n++; }
    return n;
  }
  /** the golfer's walk from p back to its car: along the path to the car park's edge, then to its bay's side; from a practice facility (T130) out
   *  of the practice area and round the back of the car park */
  private toCar(v: Visit, p: Pt): Pt[] {
    const sc = this.scene!, sl = this.slots[v.slot]!, side = this.carSide(sl), back = this.fromEdge(sl);
    if (v.fac && (v.stage === S.WalkPractice || v.stage === S.Practice)) return [p, sc.practice.entry, sc.practice.behind, side];
    // from the coffee kiosk's line (T133): out to the path in front of it
    if (sc.kiosk && (v.stage === S.WalkKiosk || v.stage === S.KioskQueue)) return [p, sc.kiosk.join, sc.carEdge, ...back, side];
    const atBay = v.stage === S.Hit || v.stage === S.WalkBay, w = sc.walk;
    // T239: back along the player's walking path when there is one (from the bay's path point, or from the shop), else across the dirt
    if (w) return [p, ...(atBay ? [sc.bays[v.bay]!.back, ...(w.bayCar[v.bay] ?? [w.car])] : [...w.carShop].reverse()), ...back, side];
    return [p, ...(atBay ? [sc.bays[v.bay]!.back] : [sc.shopJoin]), sc.carEdge, ...back, side];
  }
  /** where a car's golfer gets out and in (T146: the car park building's door, else beside its car) */
  private carSide(sl: CarSlot): Pt { return sl.door ?? { x: sl.x + sl.hy * 1.2, y: sl.y - sl.hx * 1.2 }; }
  /** the way from the path's end at the car park (carEdge) to a car (T146: the lot's walkers round the car park building; none from its door) */
  private fromEdge(sl: CarSlot): Pt[] {
    if (sl.door) return [];
    // T237: from the path's end to its car park's footpath (round the car park building when a set-back range has one), then along the aisles
    const sc = this.scene!;
    return sl.walk?.length ? [...(sc.garage && sc.lotWalk.length > 1 ? sc.lotWalk : []), ...sl.walk] : sc.lotWalk;
  }
  /** after its bucket (T130): a share of the golfers walk over to an open practice facility with a free spot (the putting green first, then the
   *  chipping green); true when this one does */
  private toPractice(v: Visit, sc: RangeScene): boolean {
    const p = this.practice; if (!p) return false;
    for (const id of PRACTICE_IDS) {
      const f = p[id]; if (f.state !== 'open' || !f.stands.length) continue;
      if (this.rnd() >= PRACTICE_SHARE[id]) continue;
      const spot = this.spotBusy[id].indexOf(false); if (spot < 0) continue;
      this.spotBusy[id][spot] = true; if (v.bay >= 0) this.bayBusy[v.bay] = false;
      const stand = f.stands[spot]!, cups = f.cups, aim = cups.length ? cups[Math.floor(this.rnd() * cups.length)]! : f.centre!;
      // from its bay's path point, or from the kiosk's line (T133)
      const from = v.bay >= 0 ? sc.bays[v.bay]!.back : sc.kiosk ? sc.kiosk.join : sc.carEdge;
      this.walk(v, S.WalkPractice, [{ x: v.x, y: v.y }, from, sc.carEdge, sc.practice.behind, sc.practice.entry, stand]);
      v.fac = id; v.spot = spot; v.aim = aim; v.bay = -1;
      return true;
    }
    return false;
  }
  private walk(v: Visit, stage: S, pts: Pt[]): void { v.stage = stage; v.t = 0; v.r = route(pts, [WALK]); }
  /** the visit's golfer done with its bucket (or its bay gone): it walks back to its car */
  private leave(v: Visit): void { this.spill(v); if (v.bay >= 0) this.bayBusy[v.bay] = false; this.walk(v, S.WalkCar, this.toCar(v, { x: v.x, y: v.y })); v.bay = -1; }
  /** T386: the balls of v's bucket it did not hit (it left early: a bay gone, a lesson cut short) land down the range now, so none is lost between hands */
  private spill(v: Visit): void {
    const B = this.book, sc = this.scene; if (!B || !sc || !v.left) return;
    const n = v.left, p = this.aimPoint(sc); v.left = 0; landBalls(B, p.x, p.y, n, this.rnd, this.bounds());
  }
  /** the line's k-th spot (T146: its head stands at queueAt, a step from the counters, and walks up to the counter that calls it) */
  private queueSpot(k: number): Pt { const sc = this.scene!; return { x: sc.queueAt.x + sc.queueStep.x * k, y: sc.queueAt.y + sc.queueStep.y * k }; }
  /** the coffee kiosk's line (T133): its k-th spot back from the counter, and whether v stands in its spot */
  private kioskSpot(k: number): Pt { const q = this.scene!.kiosk!; return { x: q.counter.x + q.queueStep.x * k, y: q.counter.y + q.queueStep.y * k }; }
  private atKiosk(v: Visit): boolean { const p = this.kioskSpot(this.kq.indexOf(v.id)); return Math.hypot(v.x - p.x, v.y - p.y) < 0.15; }
  /** after its bucket (T133): a share of the golfers go for a coffee at the kiosk first (its line short enough), then the practice area, else the car */
  private afterBucket(v: Visit, sc: RangeScene): void {
    if (sc.kiosk && !v.coffee && this.rnd() < KIOSK_SHARE && this.kq.length < KIOSK_QMAX) {
      v.coffee = true; this.bayBusy[v.bay] = false;
      this.walk(v, S.WalkKiosk, [{ x: v.x, y: v.y }, sc.bays[v.bay]!.back, sc.kiosk.join, this.kioskSpot(this.kq.length)]);
      v.bay = -1; return;
    }
    if (!this.toPractice(v, sc)) this.leave(v);
  }
  private atSpot(v: Visit): boolean { const k = this.queue.indexOf(v.id); if (k < 0) return false; const p = this.queueSpot(k); return Math.hypot(v.x - p.x, v.y - p.y) < 0.15; }
  /** a queued golfer steps toward p at walking speed */
  private toward(v: Visit, p: Pt, dt: number): void {
    const dx = p.x - v.x, dy = p.y - v.y, L = Math.hypot(dx, dy), m = WALK * dt;
    if (L <= m) { v.x = p.x; v.y = p.y; } else { v.x += dx / L * m; v.y += dy / L * m; v.ang = Math.atan2(dy, dx); }
  }
  /** a ball comes to rest at (x, y) (T386: with the ball loop, the n balls of its swing: the others round it, all lying on the outfield until picked up) */
  private lie(x: number, y: number, n = 1): void {
    const B = this.book;
    if (B) {
      // T386 part 2: a target green's net catches a share of the balls that land by it: they roll down its chute into the ball room, dirty, picked by nobody
      let m = n; const sc = this.scene;
      if (this.nets && sc && sc.targets.some(t => Math.hypot(x - t.x, y - t.y) <= t.r + CATCH)) { const k = Math.min(n, Math.floor(n * NET_SHARE + this.rnd())); if (k > 0) { B.inPlay = Math.max(0, B.inPlay - k); B.day.hit += k; B.total.hit += k; stow(B, k, 'net'); m = n - k; } }
      landBalls(B, x, y, m, this.rnd, this.bounds()); return;
    }
    const i = this.lyingAt; this.lying[2 * i] = x; this.lying[2 * i + 1] = y; this.lyingAt = (i + 1) % LYING_MAX; this.nLying = Math.min(LYING_MAX, this.nLying + 1);
  }
  /** T386 part 2: the nets' catch is on (the range owns them), the staff's and the washer's fractions of a ball carried between steps, and the pile the crew works (the nearest ball
   *  to the ball room, read again each town second) */
  get clockT(): number { return this.t; }
  private nets = false; private autoAcc = 0; private washAcc = 0; private front: Pt | null = null; private frontT = -9;
  /** T459: the hands at work on the range (HANDS_ATT attendant slots, then HANDS_ROBOT robot slots), each his own round (walkAgent; null: not here, inside the ball room). They are
   *  stepped with the sim (automate), so what view() hands out never depends on who looked or how often; and the two spots they are walked to and from (reused, no allocation) */
  private hands: (AgentWalk | null)[] = new Array<AgentWalk | null>(HANDS_ATT + HANDS_ROBOT).fill(null); private handHome: Pt = { x: 0, y: 0 }; private handPile: Pt = { x: 0, y: 0 };
  /** T386 part 2: one step of the staff and the machines: the attendants on shift (with your tools, not the cart) and the robots pick balls up, the nearest piles to the ball room first,
   *  into the ball room dirty; the tap and the washer wash what they can (the balls a second each can take); the hands walk their rounds (walkHands) */
  private automate(dt: number, hour: number, B: BallSave, s: RangeBizSave, a: AutoKit, sc: RangeScene): void {
    const pk = pickKit(s.owned), staff = staffBps(a, pk, hour, B.shift), rob = robotBps(a);
    this.autoAcc += (staff + rob) * dt;
    const n = Math.floor(this.autoAcc);
    if (n > 0) {
      this.autoAcc -= n;
      const got = pickNear(B, sc.ballRoom.x, sc.ballRoom.y, n);
      if (got > 0) { const ns = Math.round(got * staff / (staff + rob)); stow(B, ns, 'staff'); stow(B, got - ns, 'robot'); }
      if (got < n) this.autoAcc = 0; // (nothing left out there: it is not saved up)
    }
    this.washAcc += washBps(a) * dt;
    const w = Math.floor(this.washAcc);
    if (w > 0) { this.washAcc -= w; if (wash(B, w) < w) this.washAcc = 0; }
    if (this.t - this.frontT >= 1) { this.frontT = this.t; this.front = fieldCount(B) ? nearestBall(B, sc.ballRoom.x, sc.ballRoom.y, 1024) : null; }
    this.walkHands(dt, hour, B, a, sc);
  }
  /** T459: dt sim seconds of the hands' rounds. An attendant whose shift has begun (a robot owned) and is not out yet comes out of the ball room's door (a few seconds after his mate, so they
   *  do not walk in step); one whose shift is over (a machine gone) is sent home: he turns back from the field, drops his basket at the door and goes in, so nobody ever vanishes where he
   *  stands. Each walks at his own pace (AGENT_SPEED) between the door and the pile (the nearest ball to it), on a lane of his own a pace apart across the way */
  private walkHands(dt: number, hour: number, B: BallSave, a: AutoKit, sc: RangeScene): void {
    const room = sc.ballRoom, front = this.front, to = front ?? room, dx = to.x - room.x, dy = to.y - room.y, L2 = dx * dx + dy * dy, L = L2 > 0 ? Math.sqrt(L2) : 1, nx = -dy / L, ny = dx / L;
    const H = this.hands, home = this.handHome, pile = this.handPile, robots = Math.min(HANDS_ROBOT, a.robots);
    for (let w = 0; w < HANDS_ATT + HANDS_ROBOT; w++) {
      const att = w < HANDS_ATT, k = att ? w : w - HANDS_ATT, want = att ? k < a.attendants && onShift(k, hour, B.shift) : k < robots;
      let h = H[w] ?? null; if (!h && !want) continue;
      const side = (w % 3 - 1) * 0.9; home.x = room.x + nx * side; home.y = room.y + ny * side;
      if (!h) h = H[w] = { x: home.x, y: home.y, leg: 'drop', left: AGENT_DROP_S + k * 4, ang: Math.atan2(dy, dx), to: undefined, has: false, leave: false };   // (every field now: one shape for all)
      h.leave = !want;
      if (front) { pile.x = front.x + nx * side; pile.y = front.y + ny * side; }
      walkAgent(h, home, front ? pile : null, dt, att ? AGENT_SPEED.attendant : AGENT_SPEED.robot);
      if (h.leg === 'gone') H[w] = null;
    }
  }
  /** T386: the golfers waiting for a bucket (on their way to the line, in it, or at a counter): each will need the balls of one */
  private awaiting(): number { let n = 0; for (const v of this.visits) if (v.stage <= S.Queue && !v.bought) n++; return n; }
  /** T386: the fence the balls lie inside (the plot's box, a little in from the fences); null without a scene */
  private bounds(): readonly [number, number, number, number] | null { const b = this.scene?.box; return b ? [b[0] + 1.4, b[1] + 1.4, b[2] - 1.4, b[3] - 1.4] : null; }
  /** T386: a point down the range where a ball lands without a golfer to say (a skip's: about the distance markers, scattered across and along) */
  private aimPoint(sc: RangeScene, rnd: () => number = this.rnd): Pt {
    const t = sc.aims[Math.min(sc.aims.length - 1, Math.floor(Math.pow(rnd(), 1.4) * sc.aims.length))]!, u = { x: sc.aim.x, y: sc.aim.y }, L = Math.hypot(u.x, u.y) || 1;
    const along = (rnd() - 0.5) * 8, across = (rnd() - 0.5) * 12;
    return { x: t.x + u.x / L * along - u.y / L * across, y: t.y + u.y / L * along + u.x / L * across };
  }
  /** T386 (the bench's full outfield, the shots): n balls lie on the outfield in smears round the aims, from a stream of their own (the range's business is as it was); they
   *  join the pool. Returns the balls that lie (a full outfield loses the rest) */
  fill(n: number, seed = 0xf111): number {
    const B = this.book, sc = this.scene; if (!B || !sc) return 0;
    const r = mulberry(seed); let lay = 0;
    for (let i = 0; i < n; i++) { const p = this.aimPoint(sc, r); B.inPlay++; lay += landBalls(B, p.x, p.y, 1, r, this.bounds()); }
    return lay;
  }
  /** T386: the balls golfers have bought and not yet hit land now (a skip, a load, the sim cleared): where the golfers would have hit them */
  private settle(sc: RangeScene): void { const B = this.book; if (B && B.inPlay > 0) dropInPlay(B, () => this.aimPoint(sc), this.rnd, this.bounds()); }

  /** one visit moved on dt */
  private move(v: Visit, dt: number, dayLen: number, sc: RangeScene): void {
    v.t += dt;
    switch (v.stage) {
      case S.CarIn:
        if (along(v.r!, v.t, this.tmp)) {
          const sl = this.slots[v.slot]!; this.walk(v, S.WalkShop, [this.carSide(sl), ...[...this.fromEdge(sl)].reverse(), ...(sc.walk ? sc.walk.carShop : [sc.carEdge])]);
          // T459: the golfer steps out beside the car, where his walk begins, facing the way it goes (he was drawn on the car's middle for a frame, then 1.2 tiles aside)
          along(v.r!, 0, this.tmp); v.x = this.tmp.x; v.y = this.tmp.y; v.ang = this.tmp.ang;
        } else { v.x = this.tmp.x; v.y = this.tmp.y; v.ang = this.tmp.ang; }
        break;
      case S.WalkShop: {
        const done = along(v.r!, v.t, this.tmp); v.x = this.tmp.x; v.y = this.tmp.y; v.ang = this.tmp.ang;
        // at the path's end by the car park the golfer sees the line (T146: and joins it there, walking up to its place, so a line that moved up
        // while it walked is not left empty at its head): a line two past the limit sends it back to the car (lost)
        if (done && this.queue.length >= this.qMax + 2) { this.lost.push({ x: v.x, y: v.y }); this.walk(v, S.WalkCar, this.toCar(v, { x: v.x, y: v.y })); }
        else if (done) { v.stage = S.Queue; v.queued = this.t; this.queue.push(v.id); }
        break;
      }
      case S.WalkBay: { const done = along(v.r!, v.t, this.tmp); v.x = this.tmp.x; v.y = this.tmp.y; v.ang = this.tmp.ang; if (done) { v.stage = S.Hit; v.t = 0; v.swings = Math.max(2, Math.floor((dayLen / 24 - (this.t - v.served)) / SWING)); } break; }
      case S.Hit: {
        // each swing: address, the drive (the ball leaves at impact toward a target green, scattered), the pause; the bucket's last swing ends the visit
        const k = Math.floor(v.t / SWING), lt = v.t - k * SWING, prev = v.t - dt - k * SWING;
        if (k >= v.swings) { this.afterBucket(v, sc); break; }
        if (prev < ADDRESS + IMPACT && lt >= ADDRESS + IMPACT) this.launch(v, sc, k);
        break;
      }
      case S.WalkKiosk: { const done = along(v.r!, v.t, this.tmp); v.x = this.tmp.x; v.y = this.tmp.y; v.ang = this.tmp.ang; if (done) { v.stage = S.KioskQueue; this.kq.push(v.id); } break; }
      case S.WalkPractice: { const done = along(v.r!, v.t, this.tmp); v.x = this.tmp.x; v.y = this.tmp.y; v.ang = this.tmp.ang; if (done) { v.stage = S.Practice; v.t = 0; this.used.push(v.fac!); } break; }
      case S.Practice: {
        // putts (a short stroke, the ball rolling to the cup) or chips (the swing, a low arc onto the green) until its time is up
        const putt = v.fac === 'putting', T = putt ? PUTT_T : SWING, hit = putt ? PUTT_HIT : ADDRESS + IMPACT, k = Math.floor(v.t / T), lt = v.t - k * T, prev = v.t - dt - k * T;
        if (v.t >= PRACTICE_H * dayLen / 24 && lt > hit + 1.2) { this.spotBusy[v.fac!][v.spot!] = false; this.walk(v, S.WalkCar, this.toCar(v, { x: v.x, y: v.y })); break; }
        if (prev < hit && lt >= hit) this.practiseShot(v, putt);
        break;
      }
      case S.WalkCar: { const done = along(v.r!, v.t, this.tmp); v.x = this.tmp.x; v.y = this.tmp.y; v.ang = this.tmp.ang; if (done) { v.stage = S.CarOut; v.t = 0; v.r = this.outRoute(v); const sl = this.slots[v.slot]; if (!this.rides(v, sl, true)) v.rc = carOn(sl ? drawnRoute(v.r, sl, v.slot, true, sc.roadDir) : v.r, true, !!sl?.inside); } break; }
      // the bay is freed once, as the car pulls out (T132: it was freed again on every step of the drive out, so the next car's bay went free
      // under it and later cars piled into the same bay)
      case S.CarOut: { const done = along(v.r!, v.t, this.tmp); v.x = this.tmp.x; v.y = this.tmp.y; v.ang = this.tmp.ang; if (v.t > 1.5 && v.slot >= 0) { this.slotBusy[v.slot] = false; v.slot = -1; if (v.bought && this.dayLen > 0) { this.carStats.n++; this.carStats.hours += (this.t - v.born) / (this.dayLen / 24); } } if (done) v.stage = S.Done; break; }
      default: break;
    }
    // T152: its car as drawn keeps its distance, up to LAG behind the timetable
    if (v.rc) this.drive(v, v.rc, dt);
  }
  /** T152: car rc of visit v drawn on dt (its timetable's clock runs on dt): its own clock runs at the timetable's speeds, never ahead of it, and
   *  stops where the car would come closer than CAR_GAP to the car ahead in its lane (onRoute: going its way; the cars crossing it, where the
   *  drive meets the road and at the car park's entrance, and the oncoming ones on the one-lane drive pass as before: waiting for them locked the
   *  queue in and the queue out), unless that puts it more than LAG behind its timetable. An older car level with it goes first (cars waiting at
   *  one start: the road's end, the car park building's ramp), and of two merging cars each in the other's way the older goes first. A car waits
   *  at its start for room (an arrival is not drawn until it moves). A car behind its timetable cannot catch it up: it drives on after it (to its
   *  bay while its golfer gets out, down the road after its visit is done) and leaves the road (v.rc) at its route's end */
  private drive(v: Visit, rc: RangeCar, dt: number): void {
    rc.due += dt;
    const r = rc.r, c0 = rc.c, c1 = Math.min(rc.due, c0 + dt), s0 = arcAt(r, c0), s1 = arcAt(r, c1), hx = Math.cos(rc.ang), hy = Math.sin(rc.ang), reach = s1 - s0 + CAR_GAP + LANE_W;
    let lim = Infinity;
    // a car of the car park building waiting at its start (inside it, leaving; or not yet on the map, arriving) is not drawn: it waits for room
    // as long as it takes (its golfer's timetable runs on), so the building's line never closes up
    const hidden = rc.inside && c0 === 0;
    if (c1 > c0 && (hidden || c0 > rc.due - LAG)) for (const w of this.visits) {
      const q = w.rc; if (!q || w === v || Math.abs(q.x - rc.x) > reach || Math.abs(q.y - rc.y) > reach) continue;
      const s = onRoute(r, s0 - 1e-6, s1 + CAR_GAP, q.x, q.y, Math.cos(q.ang), Math.sin(q.ang));
      if (s < 0 || s - CAR_GAP >= lim) continue;
      if (w.id > v.id) {
        if (s <= s0 + 1e-6) continue;
        const sw = arcAt(q.r, q.c); if (onRoute(q.r, sw - 1e-6, sw + CAR_GAP, rc.x, rc.y, hx, hy) >= 0) continue;
      }
      lim = s - CAR_GAP;
    }
    const c = lim < s1 ? Math.min(c1, Math.max(c0, timeAt(r, lim), hidden ? 0 : rc.due - LAG)) : c1;
    if (c >= r.at[r.at.length - 1]!) { v.rc = undefined; return; }
    rc.c = c; if (c > 0) { along(r, c, this.tmp); rc.x = this.tmp.x; rc.y = this.tmp.y; rc.ang = this.tmp.ang; }
  }
  /** a practice shot from v toward its cup (T130): a putt rolls there (most drop, the rest stop short or run past), a chip flies a low arc and
   *  lands about the cup */
  private practiseShot(v: Visit, putt: boolean): void {
    const a = v.aim; if (!a) return;
    const dx = a.x - v.x, dy = a.y - v.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    if (putt) {
      const len = L * (0.85 + 0.25 * this.rnd()), side = (this.rnd() - 0.5) * 0.35;
      this.balls.push({ x0: v.x + ux * 0.25, y0: v.y + uy * 0.25, x1: v.x + ux * len - uy * side, y1: v.y + uy * len + ux * side, t0: this.t, T: 1.1 + len / 2.5, h: 0, roll: true });
    } else {
      const len = L * (0.8 + 0.35 * this.rnd()), side = (this.rnd() - 0.5) * L * 0.25, x1 = v.x + ux * len - uy * side, y1 = v.y + uy * len + ux * side;
      // (T251: a chip checks up on the practice green: a low bounce and a short roll on)
      const k = len * GREEN_RUN * 3, after = ballRoll.on ? new BallRoll().set({ x: x1, y: y1 }, { x: x1 + ux * k, y: y1 + uy * k }, 'green', 'green', len * TILE_M, ROLL_S, null) : undefined;
      this.balls.push({ x0: v.x + ux * 0.3, y0: v.y + uy * 0.3, x1, y1, t0: this.t, T: 0.8 + len / 10, h: 1 + len * 0.18, after, prac: true });
    }
  }
  /** a ball from v's bay toward one of the targets (a golfer's aim: nearer greens more often), scattered across and along the line */
  private launch(v: Visit, sc: RangeScene, k: number): void {
    // T386: the swing stands for its share of the bucket's balls (the last swing takes what is left): the one you see flies, the rest land round it
    const n = this.book && v.left ? Math.max(1, Math.round(v.left / Math.max(1, v.swings - k))) : 1; if (this.book && v.left) v.left = Math.max(0, v.left - n);
    this.launchFrom(v.bay, sc, this.rnd, n);
  }
  /** a ball from bay k toward the targets, its chances from the stream rnd (the range's own; the bench's busy range, its own); n: the balls of its swing (T386) */
  private launchFrom(bay: number, sc: RangeScene, rnd: () => number, n = 1): void {
    const b = sc.bays[bay]!.stand, tg = sc.aims, i = Math.min(tg.length - 1, Math.floor(Math.pow(rnd(), 1.4) * tg.length)), t = tg[i]!;
    const dx = t.x - b.x, dy = t.y - b.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, len = L * (0.82 + 0.3 * rnd()), side = (rnd() - 0.5) * L * 0.22;
    const x1 = b.x + ux * len - uy * side, y1 = b.y + uy * len + ux * side, lift = sc.bays[bay]!.lift;
    // off the upper deck (T133) the ball starts at the deck's height; T251: it bounces and rolls out after it lands
    this.balls.push({ x0: b.x + ux * 0.6, y0: b.y + uy * 0.6, x1, y1, t0: this.t, T: 1.6 + len / 35, h: 4 + len * 0.16, ...(lift ? { h0: lift / BALL_PX } : {}), after: ballRoll.on ? rollOut(x1, y1, ux, uy, len, sc) : undefined, ...(n > 1 ? { n } : {}) });
  }

  /** the people and cars to draw (reused objects): every golfer on foot as a crowd person (walking: the walk clip toward its heading; queued:
   *  idle, facing the counter; at a mat: the address, the drive, then idle, aimed down the range) and every car on the road or parked */
  view(): RangeDraw {
    const d = this.draw, sc = this.scene, P = d.people, C = d.cars, G = GOLFER_CLIPS;
    let np = 0, nc = 0;
    d.picker = null;
    if (sc) for (const v of this.visits) {
      // T152: a car on the road as drawn (drive): driving, or waiting at its start (an arrival waiting for room at the road's end is not on the map
      // yet; a car waiting to pull out stands parked, its first leg backing out of the bay, and in the car park building is not drawn)
      const rc = v.rc;
      if (rc) {
        if (rc.c > 0 || (rc.out && !rc.inside)) { const c = C[nc] ?? (C[nc] = { x: 0, y: 0, ang: 0, type: 0, id: -1 }); nc++; c.x = rc.x; c.y = rc.y; c.ang = rc.c > 0 ? rc.ang : rc.ang + Math.PI; c.type = v.car; c.id = v.id; }
      } else if (v.stage >= S.WalkShop && v.stage <= S.WalkCar) {
        // parked (in the car park building, T146: inside it, not drawn)
        const sl = this.slots[v.slot];
        if (sl && !sl.inside) { const c = C[nc] ?? (C[nc] = { x: 0, y: 0, ang: 0, type: 0, id: -1 }); nc++; c.x = sl.x; c.y = sl.y; c.ang = Math.atan2(sl.hy, sl.hx); c.type = v.car; c.id = v.id; }
      }
      if (v.stage < S.WalkShop || v.stage > S.WalkCar) continue;
      const p = P[np] ?? (P[np] = { x: 0, y: 0, group: 1, person: 0, row: 0, frame: 0, lift: 0, id: 0 }); np++;
      p.id = v.id; p.x = v.x; p.y = v.y; p.group = 1; p.person = v.person;
      // on the upper deck (T133): full height at its bay, ramping on the stairs from the path behind it
      p.lift = v.up ? v.up.h * Math.max(0, Math.min(1, 1 - Math.hypot(v.x - v.up.x, v.y - v.up.y) / STAIR)) : 0;
      if (v.stage === S.Hit) {
        const k = Math.floor(v.t / SWING), lt = v.t - k * SWING;
        p.row = golferRow(sc.aim.x, sc.aim.y);
        p.frame = lt < ADDRESS ? G.golf_drive.start : lt < ADDRESS + CLIP ? clipFrame(G.golf_drive, G.golf_drive.times[0]! + lt - ADDRESS) : G.idle.start;
      } else if (v.stage === S.Practice && v.aim) {
        // at a practice facility, facing the cup: a putt is the drive clip's address, its takeaway and its impact frame (a stand-in until the
        // putting clip, GOLF-SPRITES), a chip the whole drive clip (a stand-in until the chipping clip)
        p.row = golferRow(v.aim.x - v.x, v.aim.y - v.y);
        if (v.fac === 'putting') { const lt = v.t % PUTT_T, P = G.golf_putt; p.frame = lt < PUTT_ADDR ? P.start : lt < PUTT_ADDR + PUTT_STROKE ? clipFrame(P, P.times[0]! + lt - PUTT_ADDR) : G.idle.start; }
        else { const lt = v.t % SWING; p.frame = lt < ADDRESS ? G.golf_drive.start : lt < ADDRESS + CLIP ? clipFrame(G.golf_drive, G.golf_drive.times[0]! + lt - ADDRESS) : G.idle.start; }
      } else if (v.stage === S.Queue && v.desk !== undefined && this.desks[v.desk]?.on) {
        // at a counter (T146): facing it (toward the road)
        p.row = rowToward(-sc.aim.x, -sc.aim.y); p.frame = G.idle.start;
      } else if (v.stage === S.Queue && this.atSpot(v)) {
        // the line faces up it, toward the counters
        p.row = rowToward(-sc.queueStep.x, -sc.queueStep.y); p.frame = G.idle.start;
      } else if (v.stage === S.KioskQueue && sc.kiosk && this.atKiosk(v)) {
        // the coffee line (T133) faces the kiosk's counter
        p.row = rowToward(-sc.kiosk.queueStep.x, -sc.kiosk.queueStep.y); p.frame = G.idle.start;
      }
      else { p.row = rowToward(Math.cos(v.ang), Math.sin(v.ang)); p.frame = clipFrame(G.walk, G.walk.times[0]! + ((this.t * WALK_RATE + hash(v.id, 3) * 2) % 1.4)); }
    }
    // the academy's pro (T133): walking over, standing by its pupil facing it, every other swing of the pupil's showing the swing down the range
    const pr = this.pro;
    if (sc?.academy && pr.placed) {
      const p = P[np] ?? (P[np] = { x: 0, y: 0, group: 1, person: 0, row: 0, frame: 0, lift: 0, id: 0 }); np++;
      const staff = PRO_STAFF >= 0, Gw = staff ? STAFF_CLIPS.walk : G.walk, Gi = staff ? STAFF_CLIPS.idle : G.idle, Gd = staff ? staffDrive() : G.golf_drive;
      p.id = 0; p.x = pr.x; p.y = pr.y; p.group = staff ? 2 : 1; p.person = staff ? PRO_STAFF : PRO_PERSON % Math.max(1, this.golfers); p.lift = 0;
      const lt = (this.t - pr.since) % (2 * SWING);
      if (pr.walking) { p.row = rowToward(Math.cos(pr.ang), Math.sin(pr.ang)); p.frame = clipFrame(Gw, Gw.times[0]! + ((this.t * WALK_RATE) % 1.4)); }
      else if (pr.coach >= 0 && lt >= SWING && Gd) { const k = lt - SWING; p.row = golferRow(sc.aim.x, sc.aim.y); p.frame = k < ADDRESS ? Gd.start : k < ADDRESS + CLIP ? clipFrame(Gd, Gd.times[0]! + k - ADDRESS) : Gi.start; }
      else { p.row = rowToward(Math.cos(pr.ang), Math.sin(pr.ang)); p.frame = Gi.start; }
    }
    // the ball picker cart (T133): parked by the outfield by day, out on its lanes after closing (the last of the cars)
    if (sc?.picker) {
      const out = this.pickT >= 0 || this.pickBack, c = C[nc] ?? (C[nc] = { x: 0, y: 0, ang: 0, type: 0, id: -1 }); nc++; c.id = -1;
      if (out) { c.x = this.pickAt.x; c.y = this.pickAt.y; c.ang = this.pickAt.ang; } else { c.x = sc.picker.home.x; c.y = sc.picker.home.y; c.ang = sc.picker.ang; }
      c.type = PICKER_CAR; d.picker = { x: c.x, y: c.y, out };
    }
    d.nPeople = np; d.nCars = nc;
    // T386 part 2: the attendants on shift and the robots at work, walking between the ball room and the pile being picked. T459: each is his own slot's round
    // (walkHands, stepped with the sim: nothing moves here, so who looks, and how often, changes nothing); a slot's id is his, for as long as he works here
    d.nAgents = 0;
    if (this.book && sc) for (let w = 0; w < this.hands.length; w++) {
      const h = this.hands[w]; if (!h) continue;
      const kind = w < HANDS_ATT ? 'attendant' as const : 'robot' as const;
      const a = d.agents[d.nAgents] ?? (d.agents[d.nAgents] = { x: 0, y: 0, ang: 0, kind, moving: true, id: 0, pick: false });
      a.x = h.x; a.y = h.y; a.kind = kind; a.id = w; a.ang = h.ang;
      a.pick = kind === 'attendant' && h.leg === 'pick'; a.moving = h.leg === 'out' || h.leg === 'back'; d.nAgents++;
    }
    return d;
  }
}

/** T152: a car on the road at route r's start (see RangeCar) */
function carOn(r: Route, out: boolean, inside: boolean): RangeCar {
  const a = r.pts[0]!, b = r.pts[1] ?? a;
  return { r, due: 0, c: 0, x: a.x, y: a.y, ang: Math.atan2(b.y - a.y, b.x - a.x), out, inside };
}
/** a polyline's length (tiles) */
function pathLen(pts: Pt[]): number { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y); return L; }
/** the point of segment a-b nearest p */
function project(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1, k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
  return { x: a.x + dx * k, y: a.y + dy * k };
}
