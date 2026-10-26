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
import { NEAR } from './rangestart';
import { GOLFER_CLIPS } from '../library';
import { clipFrame, golferRow, hash, rowToward, type CrowdPerson } from '../crowdview';
import { mulberry } from '../iso';
import { practiceArea, type PracticeArea, type PracticeScan } from './practice';
import { PRACTICE_FEE, PRACTICE_IDS, PRACTICE_SHARE, type PracticeId } from './rangesave';

// ---------------------------------------------------------------- the scene

/** the plot frame's spots (u along the road 0..70, v away from it 0..150; the drive beside u = 70, see range.ts plotPoint) */
const U_MID = 35.5, BAY_W = 2.5, SLOTS = 24, STAND_V = 21, PATH_V = 16.2, TEE: [number, number, number, number] = [4, 67, 18, 24];
const SHOP = { u: 34, v: 8.5 }, COUNTER = { u: 34, v: 13.4 }, QUEUE_V = 14.5, CAR_EDGE_U = 48.4, YARD: [number, number, number, number] = [4, 22, 3, 13];
/** the target greens: distances from the tee line (tiles: 50..240 m), across the range (u) and radii (tiles) */
const TARGET_D = [25, 50, 75, 100, 120], TARGET_U = [28, 44, 32, 40, 36], TARGET_R = [3, 4, 4, 5, 4];
/** the far fence (v), the side fences (u) */
const FAR_V = 149.4, SIDE_U: [number, number] = [0.6, 69.4];
/** the land's grass the outfield leaves round the tee box (tiles): room for the raised tee's face at the Height slider's top (T127, T130) */
const TEE_GAP = 2.6;
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

/** a prop of the scene: its key (stable while it stays), library id, world point, quarter turns from the picture's base view (preset-art turned),
 *  scale (absent: the library's own size) or fit (the footprint's W + D in tiles the picture spans: business art), and its stand-in label */
export interface ScenePiece { key: string; id: string; x: number; y: number; q: number; scale?: number; fit?: number; label?: string; /** drawn this high above its spot (world px, T133: the upper deck) */ lift?: number;
  /** its footprint (world x0 y0 x1 y1, T133) in place of its picture's boxes: a covered-bay roof's or the deck's, behind its golfers */ foot?: [number, number, number, number] }
/** a ground patch of the scene: a world polygon (x y pairs) and its surface: a golf surface (laid with the course's own presets), the range's own
 *  presets (T132: 'outfield', the mown outfield with its stripes, and 'target', a target green: rangehost.ts patchTex) or a ground texture; edge:
 *  its outline's profile (paint-edges.ts: a target green is raised, its collars feathered; absent: crisp); mow: its mowing stripes are laid on
 *  top (the outfield) */
export interface ScenePatch { pts: number[]; surf: 'fairway' | 'firstCut' | 'tee' | 'fringe' | 'green' | 'rough' | 'dirt' | 'grassDry' | 'asphaltDark' | 'gravel' | 'concrete' | 'outfield' | 'target'; edge?: 'raised' | 'flat'; mow?: true }
/** a target green in the scene: centre, radius and distance from the tee line (m) */
export interface SceneTarget { x: number; y: number; r: number; m: number }
/** the scene of a range (rangeScene) */
export interface RangeScene {
  facing: 0 | 1 | 2 | 3;
  pieces: ScenePiece[]; patches: ScenePatch[];
  /** the tee box (a world polygon, x y pairs): the game lays it into the course grid as tee cells of no hole, so T127's tee banks raise it (T130) */
  teeBox: number[];
  /** the practice area beside the range (T130, golf/practice.ts) */
  practice: PracticeArea;
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
  /** the way the golfers hit (unit, world) and the target greens */
  aim: Pt; targets: SceneTarget[];
  /** the shop's first counter, the queue's step (world, one golfer apart), the line's head (the line steps back from it), the path at the shop,
   *  the path at the car park; counters (T146): every counter open, serving in parallel (the first is counter) */
  counter: Pt; queueStep: Pt; queueAt: Pt; shopJoin: Pt; carEdge: Pt; counters: Pt[];
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
  /** the world box of the plot (x0 y0 x1 y1) */
  box: [number, number, number, number];
  /** where the outfield's mowing stripes start (world: the tee end of the outfield, its middle) */
  mowFrom: Pt;
}

/** the view index (0 NE .. 3 NW) whose front faces the frame's -v (the road) for a facing. The four-view sheets put the front in the NE and NW
 *  cells (art/building-views provenance: "A + B, B + C, C + D, D + A"), so the views' fronts face +y, -x, -y, +x: checked in the game on the
 *  covered bays (T129). The road side is -v: -y, +x, +y, -x for the facings 2, 1, 0, 3, which is the view of the facing's own number */
const roadView = (f: 0 | 1 | 2 | 3): number => f;
/** the bay slot k's u (k 0..23, centred on U_MID) and the slots open with n bays (the middle n) */
const slotU = (k: number) => U_MID + (k - (SLOTS - 1) / 2) * BAY_W;
export const openSlots = (n: number): number[] => Array.from({ length: n }, (_, i) => SLOTS / 2 - n / 2 + i);

/** the range's scene on its plot for a facing and the save (plan 2.1): deterministic; everything turns with the facing, nothing is mirrored */
export function rangeScene(plot: Rect, facing: 0 | 1 | 2 | 3, s: RangeBizSave): RangeScene {
  const st = rangeStats(s), P = (u: number, v: number) => plotPoint(plot, facing, u, v), toRoad = roadView(facing), toRange = (toRoad + 2) % 4;
  const quad = (u0: number, u1: number, v0: number, v1: number): number[] => { const a = P(u0, v0), b = P(u1, v0), c = P(u1, v1), d = P(u0, v1); return [a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]; };
  const disc = (u: number, v: number, r: number, n = 28): number[] => { const out: number[] = []; for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, p = P(u + Math.cos(a) * r, v + Math.sin(a) * r); out.push(p.x, p.y); } return out; };
  const pieces: ScenePiece[] = [], patches: ScenePatch[] = [];
  const put = (key: string, id: string, u: number, v: number, q = 0, o: Partial<ScenePiece> = {}) => { const p = P(u, v); pieces.push({ key, id, x: p.x, y: p.y, q, ...o }); };

  // ---- the ground: the mown outfield in its first cut beyond the tee box (the tee box and its own first-cut collar are the course grid's, T130:
  // painted areas draw over the course, so the outfield keeps TEE_GAP tiles off it, where the raised tee's bank or rock face hangs down onto the
  // land's grass), the pads and mats of the open bays on their concrete deck (over the tee box), the target greens, the shop's packed dirt and
  // the caravan's dry lawn
  // the outfield is the range's own preset with its mowing stripes laid on top (T132: they read at every zoom, across the line of play)
  patches.push({ pts: quad(0.3, 69.7, TEE[3] + TEE_GAP, 149.7), surf: 'firstCut' }, { pts: quad(2, 68, TEE[3] + TEE_GAP + 0.6, 148), surf: 'outfield', mow: true });
  const open = openSlots(st.lowerBays); // the tee box's mats (T133: the upper deck's bays are added below)
  patches.push({ pts: quad(slotU(open[0]!) - 1.5, slotU(open[open.length - 1]!) + 1.5, STAND_V - 2, STAND_V + 2.2), surf: 'concrete' });
  for (const k of open) { const u = slotU(k); patches.push({ pts: quad(u - 1.05, u + 1.05, STAND_V - 1.4, STAND_V + 1.6), surf: 'asphaltDark' }, { pts: quad(u - 0.65, u + 0.65, STAND_V - 0.2, STAND_V + 1.2), surf: 'green' }); }
  const targets: SceneTarget[] = [];
  for (let i = 0; i < st.targets; i++) {
    const u = TARGET_U[i]!, v = STAND_V + TARGET_D[i]!, r = TARGET_R[i]!, c = P(u, v);
    // a target green reads as a green (T132): a first-cut collar and a fringe ring round the range's own green preset, raised with its sun-lit edge
    patches.push({ pts: disc(u, v, r + 1.8, 32), surf: 'firstCut', edge: 'flat' }, { pts: disc(u, v, r + 0.8, 32), surf: 'fringe' }, { pts: disc(u, v, r, 32), surf: 'target', edge: 'raised' });
    targets.push({ x: c.x, y: c.y, r, m: TARGET_D[i]! * 2 });
  }
  const home = homeStage(s), Y = YARDS[home]!;
  // the caravan's yard is dry lawn; the cottage's and the house's a mown lawn (T133)
  patches.push({ pts: quad(28, 41, 3, 15.4), surf: 'dirt' }, { pts: quad(Y[0], Y[1], Y[2], Y[3]), surf: home ? 'firstCut' : 'grassDry' });
  if (st.kiosk) patches.push({ pts: quad(PATIO[0], PATIO[1], PATIO[2], PATIO[3]), surf: 'concrete' });
  if (st.parking) patches.push({ pts: quad(GARAGE[0], GARAGE[1], GARAGE[2], GARAGE[3]), surf: 'concrete' });

  // ---- the paths: the back of the mats from the car park's edge, and spurs to the shop's counter and the yard's gate
  const L = (u0: number, v0: number, u1: number, v1: number) => ({ a: P(u0, v0), b: P(u1, v1) });
  // (laid once: the yard's gate stays at YARD's south side whatever the home grows to)
  const paths = [L(TEE[0] + 1, PATH_V, CAR_EDGE_U, PATH_V), L(COUNTER.u, PATH_V, COUNTER.u, COUNTER.v - 0.2), L(13, PATH_V, 13, YARD[3] + 0.4)];

  // ---- the shop (the tin-and-tarp shack, or the pro shop facing the golfers), the caravan and its fenced back yard
  if (st.proShop) put('shop', 'business:golf-pro-shop', SHOP.u, SHOP.v, toRange);
  // the tin-and-tarp shack (golf:clubhouse-shanty) has no four views yet, and a building without them is drawn as the grand clubhouse (newart.ts):
  // the rusty lean-to shed stands in for it, turned to face the golfers
  else put('shop', 'expansion:lean-to-shed', SHOP.u, SHOP.v, toRange, { label: 'Stand In for the tin-and-tarp pro shop' });
  homeYard(put, home, toRoad);
  fenceRun(pieces, P, 'yard-n', Y[0], Y[2], Y[1], Y[2], 'picket');
  fenceRun(pieces, P, 'yard-w', Y[0], Y[2], Y[0], Y[3], 'picket');
  fenceRun(pieces, P, 'yard-e', Y[1], Y[2], Y[1], Y[3], 'picket');
  fenceRun(pieces, P, 'yard-s1', Y[0], Y[3], 12, Y[3], 'picket'); fenceRun(pieces, P, 'yard-s2', 14, Y[3], Y[1], Y[3], 'picket');
  // ---- the boundary: chain-link down both sides and across the far end
  fenceRun(pieces, P, 'side-a', SIDE_U[0], 17, SIDE_U[0], FAR_V, 'chain'); fenceRun(pieces, P, 'side-b', SIDE_U[1], 19, SIDE_U[1], FAR_V, 'chain');
  fenceRun(pieces, P, 'far', SIDE_U[0], FAR_V, SIDE_U[1], FAR_V, 'chain');
  // ---- the sign at the drive, the bench and bins at the tee, a bag trolley by the shop
  put('sign', 'golf:leaderboard', 64.5, 1.4, toRoad, { fit: 4.5, label: 'Stand In for Driving Range sign' });
  put('bench', 'world:bench', 43, 15); put('bins-tee', 'gen:trash-cans-row', 25.5, 15); put('trolley', 'business:golf-bag-trolley', 29.4, 13.6);
  // ---- the distance markers down both sides every 50 m, flags on the greens, the yardage boards (upgrade)
  const numbers: RangeScene['numbers'] = [];
  for (let k = 1; k <= 5; k++) for (const [j, u] of [2.2, 67.8].entries()) {
    put(`mark${k}-${j}`, 'ce:parking-sign', u, STAND_V + 25 * k, 0, k === 1 && j === 0 ? { label: 'Stand In for Range distance marker' } : {});
    const p = P(u, STAND_V + 25 * k); numbers.push({ x: p.x, y: p.y, text: `${50 * k} m` });
  }
  for (let i = 0; i < st.targets; i++) {
    put(`flag${i}`, 'business:golf-pin-red', TARGET_U[i]!, STAND_V + TARGET_D[i]!, 0, { scale: 0.32 });
    if (st.targets > 2) {
      put(`board${i}`, 'poi:fishing-board', TARGET_U[i]! + TARGET_R[i]! + 2.4, STAND_V + TARGET_D[i]! - 1, toRoad, { scale: 1.6, ...(i === 0 ? { label: 'Stand In for Range yardage board' } : {}) });
      const p = P(TARGET_U[i]! + TARGET_R[i]! + 2.4, STAND_V + TARGET_D[i]! - 1); numbers.push({ x: p.x, y: p.y, text: `${TARGET_D[i]! * 2} m`, low: true });
    }
  }
  // ---- the covered bays over each four open bays, the floodlights, the ball dispenser
  // (T133: each with the footprint of its four bays behind the golfers' spots, so the golfers in its bays and on the path behind it draw in the
  // right order from every side; the art's own boxes are a 1 x 1 placeholder)
  const roofFoot = (u0: number, u1: number): [number, number, number, number] => { const a = P(u0 - 1.2, ROOF_V[0]), b = P(u1 + 1.2, ROOF_V[1]); return [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)]; };
  if (st.covered) for (let g = 0; g < open.length; g += 4) { const k0 = open[g]!, k1 = open[Math.min(open.length, g + 4) - 1]!; put(`roof${g}`, 'business:golf-driving-range', (slotU(k0) + slotU(k1)) / 2, STAND_V - 1.2, toRange, { fit: 10.5, foot: roofFoot(slotU(k0), slotU(k1)) }); }
  if (st.lights) {
    const spots: [number, number][] = [[1.6, 26], [68.4, 26], [1.6, 60], [68.4, 60], [1.6, 100], [68.4, 100], [1.6, 140], [68.4, 140]];
    spots.forEach(([u, v], i) => put(`light${i}`, 'world:streetlamp', u, v, 0, { scale: 1, ...(i === 0 ? { label: 'Stand In for Range floodlight' } : {}) }));
  }
  if (st.dispenser) put('dispenser', 'expansion:utility-cabinet', 39.6, 12.6, 0, { label: 'Stand In for Ball dispenser' });
  // ---- the World of Golf extras (T133)
  // the second tier: the covered-bay building again over each lower roof under the middle twelve slots, drawn DECK_H up (its stand-in: a double
  // deck of the same roofs), a hair nearer the camera than the roof under it so it is drawn after it
  const decks: number[] = [];
  if (st.tier2) for (let g = 0; g < open.length; g += 4) {
    const k0 = open[g]!, k1 = open[Math.min(open.length, g + 4) - 1]!;
    if (k1 < DECK_SLOT0 || k0 >= DECK_SLOT0 + TIER2_BAYS) continue;
    const p = P((slotU(k0) + slotU(k1)) / 2, STAND_V - 1.2); decks.push((slotU(k0) + slotU(k1)) / 2);
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
    put('kiosk', 'business:fishing-rental-kiosk', KIOSK.u, KIOSK.v, toRange, { fit: 5, label: 'Stand In for Coffee kiosk' });
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
      lot: [Math.min(l0.x, l1.x), Math.min(l0.y, l1.y), Math.abs(l1.x - l0.x), Math.abs(l1.y - l0.y)],
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
  const o = P(0, 0), du = P(1, 0), dv = P(0, 1), c0 = P(0, 0), c1 = P(RANGE_PLOT[0], RANGE_PLOT[1]);
  const q0 = P(COUNTER.u, COUNTER.v), q1 = P(COUNTER.u + 0.8, COUNTER.v);
  return {
    facing, pieces, patches, teeBox: quad(TEE[0], TEE[1], TEE[2], TEE[3]), practice: practiceArea(plot, facing), paths, bays, academy, kiosk, picker, home, aim: { x: dv.x - o.x, y: dv.y - o.y }, targets,
    counter: q0, queueStep: { x: q1.x - q0.x, y: q1.y - q0.y }, queueAt: P(COUNTER.u + 0.8, QUEUE_V), shopJoin: P(COUNTER.u, PATH_V), carEdge: P(CAR_EDGE_U, PATH_V),
    // the counters side by side along the shop's front about its middle, the nearest to the line's head first (it calls the next golfer first)
    counters: Array.from({ length: st.counters }, (_, i) => COUNTER.u + (i - (st.counters - 1) / 2) * COUNTER_STEP).sort((a, b) => Math.abs(a - COUNTER.u - 0.8) - Math.abs(b - COUNTER.u - 0.8)).map(u => P(u, COUNTER.v)), garage, lotWalk: garage ? [P(LOT_CORNER.u, LOT_CORNER.v)] : [],
    J: P(RANGE_PLOT[0] + 2, -NEAR), driveEnd: P(RANGE_PLOT[0] + 2, 16), roadDir: { x: du.x - o.x, y: du.y - o.y }, rangeSide: { x: dv.x - o.x, y: dv.y - o.y },
    numbers, label: P(35, 60), box: [Math.min(c0.x, c1.x), Math.min(c0.y, c1.y), Math.max(c0.x, c1.x), Math.max(c0.y, c1.y)],
    mowFrom: P(U_MID, TEE[3] + TEE_GAP + 0.6),
  };
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
/** a swing's beats: address, the drive clip, the pause after; the ball leaves at the clip's impact (s) */
const ADDRESS = 1.2, CLIP = GOLFER_CLIPS.golf_drive.times[GOLFER_CLIPS.golf_drive.n - 1]! - GOLFER_CLIPS.golf_drive.times[0]!, PAUSE = 1.3, IMPACT = 1.22;
const SWING = ADDRESS + CLIP + PAUSE;
/** the academy's pro is drawn as this golfer (T133), and the ball picker cart as this car type (a stand-in: the eight-way wagon, never mirrored) */
const PRO_PERSON = 3, PICKER_CAR = 1;
/** the most balls lying on the range, and of golfers queued patiently (town hours) */
const LYING_MAX = 800, PATIENCE_H = 2;
/** the practice facilities (T130): a golfer practises this long (town hours); a putt's beats (address, the stroke, the ball leaving at PUTT_HIT,
 *  the next putt after PUTT_T) and a chip's (the drive clip as the stand-in swing: SWING) */
const PRACTICE_H = 0.45, PUTT_ADDR = 1.3, PUTT_STROKE = 0.55, PUTT_HIT = 1.6, PUTT_T = 3.6;
/** the upper deck's stairs (T133): a golfer climbs over the leg from the path behind to its bay (tiles), so the lift ramps over it */
const STAIR = STAND_V - PATH_V;
/** the ball picker cart drives its lanes in this many town hours (T133), whatever the day's length */
const PICK_HOURS = 7;

/** a car-park bay a range car parks in: its point and heading (unit); inside (T146): a place in the car park building (the point is its ramp:
 *  the car drives in there and is not drawn while parked), its golfer walking out of its door */
export interface CarSlot { x: number; y: number; hx: number; hy: number; inside?: boolean; door?: Pt }
/** the car park building's places as car slots (T146): GARAGE_CARS at its ramp, heading in, its walkers at its door */
export function garageSlots(g: NonNullable<RangeScene['garage']>, n: number): CarSlot[] {
  return Array.from({ length: n }, () => ({ x: g.ramp.x, y: g.ramp.y, hx: g.into.x, hy: g.into.y, inside: true, door: g.door }));
}
/** the range's money as it happens (T146, for the floating money over the customers, T147): what (a bucket sold, a practice fee, a coffee, a
 *  lesson, or a golfer lost), how many golfers it is (a skip books fractions), the takings ($; 0 for the lost) and where (world tiles: the counter,
 *  the practice facility, the kiosk, the car or the line; null for a skip) */
export interface RangeMoneyEvent { kind: 'bucket' | 'practice' | 'coffee' | 'lesson' | 'lost'; n: number; amount: number; at: Pt | null; /** a lost golfer's reason */ why?: 'queue' | 'parking' | 'patience';
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
 *  leg's start (a car merging into it there: the far side's arrival turning into the drive); -1 off that stretch */
function onRoute(r: Route, s0: number, s1: number, x: number, y: number, hx: number, hy: number): number {
  const P = r.pts, L = r.len;
  for (let k = 1; k < P.length; k++) {
    const l = L[k]! - L[k - 1]!; if (L[k]! < s0 || l < 1e-9) continue; if (L[k - 1]! > s1) break;
    const a = P[k - 1]!, ux = (P[k]!.x - a.x) / l, uy = (P[k]!.y - a.y) / l, u = (x - a.x) * ux + (y - a.y) * uy, s = L[k - 1]! + u;
    if (u < -CAR_GAP || u > l + 1e-9 || s < s0 || s > s1 || Math.abs((x - a.x) * uy - (y - a.y) * ux) >= LANE_W || hx * ux + hy * uy < 0.5) continue;
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
  /** T146: the counter it walks up to and is served at (index into the scene's counters), and when its car turned in (sim s) and whether it bought */
  desk?: number; born: number; bought?: boolean;
  /** T152: its car as drawn while it is on the road (driving or waiting at its start; none while parked or gone) */
  rc?: RangeCar }
/** a ball in the air: from, to (tiles), launch time and flight time (s), and the arc's height (tiles); roll: a putt rolling on the green (it slows
 *  to the cup and is holed or picked up: it never lies) */
interface Ball { x0: number; y0: number; x1: number; y1: number; t0: number; T: number; h: number; roll?: boolean; /** its start's height (units, T133: off the upper deck) */ h0?: number }
/** a golfer, the pro or a coffee drinker as the engine draws it: a crowd person, lifted onto the upper deck (world px, T133) */
export type RangePerson = CrowdPerson & { lift: number };
/** what the engine sees of the sim each frame */
export interface RangeDraw {
  /** the golfers on foot (walking, queued, hitting) as crowd people (group 1), the academy's pro among them (T133) */
  people: RangePerson[]; nPeople: number;
  /** the cars (driving or parked): point, heading (radians, world) and type */
  cars: { x: number; y: number; ang: number; type: number }[]; nCars: number;
  /** the ball picker cart (T133; null: none): where it is, and whether it is out on its lanes (it is also the last of the cars) */
  picker: { x: number; y: number; out: boolean } | null;
}
/** the town clock as the sim reads it: the hour (fractional) and the day number */
export interface RangeClock { hour: number; day: number }
/** today's counts (since the town's midnight): golfers who bought, golfers lost, and the queue now */
export interface RangeToday { golfers: number; lost: number; queue: number; playing: number;
  /** T133: today's coffees and lessons, the kiosk's line now and the golfers hitting upstairs */
  coffees: number; lessons: number; kioskQueue: number; upstairs: number;
  /** T146: today's cars turned away because the car park was full (also in lost), and the hitting bays taken now (from the sale to the bucket's end) */
  noPark: number; taken: number }

/** The golfers you see (plan 2.2). step() moves them on and returns the takings booked ($); the counts go into the save's season and total */
export class RangeSim {
  private visits: Visit[] = []; private queue: number[] = []; private balls: Ball[] = [];
  /** the lying balls, x y pairs (a ring of LYING_MAX) and how many */
  readonly lying = new Float32Array(LYING_MAX * 2); nLying = 0; private lyingAt = 0;
  private nextId = 1; private rnd: () => number; private t = 0; private bayBusy: boolean[] = [];
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
  today: RangeToday = { golfers: 0, lost: 0, queue: 0, playing: 0, coffees: 0, lessons: 0, kioskQueue: 0, upstairs: 0, noPark: 0, taken: 0 }; private day = -1;
  private draw: RangeDraw = { people: [], nPeople: 0, cars: [], nCars: 0, picker: null };
  /** the coffee kiosk's line (T133), the golfer served and its time left */
  private kq: number[] = []; private kServing = -1; private kLeft = 0;
  /** the academy's pro (T133): where it stands and faces, whether it walks, and since when it coaches the golfer it stands by (-1: waiting) */
  private pro = { x: 0, y: 0, ang: 0, walking: false, coach: -1, since: 0, placed: false };
  /** the ball picker cart (T133): its route, its time out on it (-1: parked), and it has picked tonight */
  private pick: Route | null = null; private pickT = -1; private picked = false; private pickAt = { x: 0, y: 0, ang: 0 };
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
    this.pick = scene.picker ? route(scene.picker.lanes, [1]) : null; if (!this.pick) this.pickT = -1;
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
    let n = 0;
    for (const b of this.balls) {
      const k0 = (this.t - b.t0) / b.T; if (k0 < 0 || k0 > 1 || 3 * n + 2 >= out.length) continue;
      const k = b.roll ? 1 - (1 - k0) * (1 - k0) : k0;
      out[3 * n] = b.x0 + (b.x1 - b.x0) * k; out[3 * n + 1] = b.y0 + (b.y1 - b.y0) * k; out[3 * n + 2] = b.roll ? 0 : (b.h0 ?? 0) * (1 - k) + 4 * b.h * k * (1 - k); n++;
    }
    return n;
  }
  /** the golfers on the range now (walking to the shop, queued, at the mats or going back) */
  get onFoot(): number { let n = 0; for (const v of this.visits) if (v.stage >= S.WalkShop && v.stage <= S.WalkCar) n++; return n; }

  /** dt sim seconds on (dt of two minutes or more: a skip, booked by skippedVisits and the golfers cleared; the host steps a long frame in pieces).
   *  Returns the takings booked ($) */
  step(dt: number, clock: RangeClock, s: RangeBizSave, c: DemandCtx, dayLen: number): number {
    const sc = this.scene; if (!sc || dt <= 0) return 0;
    if (clock.day !== this.day) { this.day = clock.day; this.today.golfers = 0; this.today.lost = 0; this.today.coffees = 0; this.today.lessons = 0; this.today.noPark = 0; this.practiceToday.putting = 0; this.practiceToday.chipping = 0; }
    const st = rangeStats(s, c), value = saleValue(s, dayLen, st), scale = rangeScale(dayLen); this.qMax = st.qMax; this.dayLen = dayLen;
    // the range's money, all of it here (T146): each sale, fee, coffee, lesson and lost golfer is counted in the save and told to onMoney with
    // where it happened (T147's floating money); booked is what step returns
    let booked = 0;
    const tell = (kind: RangeMoneyEvent['kind'], n: number, amount: number, at: Pt | null, why?: RangeMoneyEvent['why']) => { if (this.onMoney && n > 0) this.onMoney({ kind, n, amount, at, ...(why ? { why, missed: n * value } : {}) }); };
    const sell = (n: number, at: Pt | null) => { const m = n * value; s.season.golfers += n; s.total.golfers += n; s.season.buckets += n * scale; s.total.buckets += n * scale; s.season.takings += m; s.total.takings += m; this.today.golfers += n; booked += m; tell('bucket', n, m, at); };
    const lose = (n: number, at: Pt | null, why: NonNullable<RangeMoneyEvent['why']>) => { s.season.lost += n; s.total.lost += n; this.today.lost += n; if (why === 'parking') this.today.noPark += n; tell('lost', n, 0, at, why); };
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
      const r = skippedVisits(s, c, clock.hour, dt, dayLen, this.skipLive(st, dayLen)); sell(r.served, null); lose(r.lost, null, 'queue');
      const u = practiceUsers(s, r.served); for (const id of PRACTICE_IDS) fee(id, u[id], null);
      extra('kiosk', r.coffees, null); extra('academy', r.lessons, null);
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
      if (waiting >= st.qMax || !this.entrance) lose(1, sc.J, 'queue');
      else if (slot < 0) lose(1, sc.J, 'parking');
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
        this.queue.shift(); d.id = head.id; d.left = st.serve; d.on = false; head.desk = i; head.bay = bay; this.bayBusy[bay] = true;
        continue;
      }
      const v = this.visits.find(q => q.id === d.id); if (!v) { d.id = -1; continue; }
      if (!d.on) { if (Math.hypot(v.x - at.x, v.y - at.y) >= 0.15) continue; d.on = true; }
      if ((d.left -= dt) > 0) continue;
      d.id = -1; v.desk = undefined; v.bought = true; sell(1, at); v.served = this.t - st.serve;
      // the academy (T133): a golfer who wanted a lesson and got a lesson bay pays for it with the bucket
      const b = sc.bays[v.bay]!; if (v.lesson && b.academy) { v.taught = true; extra('academy', 1, at); }
      if (b.lift) v.up = { x: b.stand.x, y: b.stand.y, h: b.lift };
      this.walk(v, S.WalkBay, [{ x: v.x, y: v.y }, sc.shopJoin, b.back, b.stand]);
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
    this.balls = this.balls.filter(b => { if (this.t < b.t0 + b.T) return true; if (!b.roll) this.lie(b.x1, b.y1); return false; });
    // T152: a visit stays while its car is still on the road (it fell behind its timetable: drive)
    this.visits = this.visits.filter(v => v.stage !== S.Done || v.rc);
    // the balls are picked once the range is closed and empty: at once (D15), or by the ball picker cart driving its lanes (T133)
    const empty = !isOpen && !this.visits.some(v => v.stage === S.Hit);
    if (!this.pick) { if (empty) this.nLying = 0; }
    else this.drivePicker(dt, isOpen, empty, dayLen);
    this.movePro(dt, sc);
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
    if (isOpen) { if (this.pickT >= 0) this.nLying = 0; this.pickT = -1; this.picked = false; return; }
    if (this.pickT < 0) { if (!empty || this.picked) return; this.pickT = 0; along(r, 0, this.pickAt); }
    const a = { x: this.pickAt.x, y: this.pickAt.y };
    this.pickT += dt * speed;
    const done = along(r, this.pickT, this.pickAt);
    this.sweep(a, this.pickAt, PICK_SWATH);
    if (done) { this.pickT = -1; this.picked = true; this.nLying = 0; }
  }
  /** the lying balls within w of the leg a-b are picked (the ring is packed again) */
  private sweep(a: Pt, b: Pt, w: number): void {
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
      const d = sc.roadDir, onDrive = project(e, sc.J, sc.driveEnd), from = { x: sc.J.x - d.x * 46, y: sc.J.y - d.y * 46 };
      for (const sl of this.slots) {
        secs += route([from, sc.J, onDrive, e, { x: sl.x - sl.hx * 2.2, y: sl.y - sl.hy * 2.2 }, { x: sl.x, y: sl.y }], [ROAD_V, DRIVE_V, DRIVE_V, PARK_V, PARK_V * 0.6]).at[5]!;
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
    const d = sc.roadDir, onDrive = project(e, sc.J, sc.driveEnd), from = { x: sc.J.x - d.x * 46, y: sc.J.y - d.y * 46 };
    let car = 0;
    for (const sl of this.slots) {
      const back = { x: sl.x - sl.hx * 2.2, y: sl.y - sl.hy * 2.2 };
      car += route([from, sc.J, onDrive, e, back, { x: sl.x, y: sl.y }], [ROAD_V, DRIVE_V, DRIVE_V, PARK_V, PARK_V * 0.6]).at[5]! + 1.5;
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
    this.visits = []; this.queue = []; this.balls = []; for (const d of this.desks) { d.id = -1; d.on = false; } this.nLying = 0; this.bayBusy.fill(false); this.slotBusy.fill(false); this.spotBusy.putting.fill(false); this.spotBusy.chipping.fill(false); this.used.length = 0;
    this.kq = []; this.kServing = -1; this.pickT = -1; this.picked = false; this.pro.coach = -1; this.pro.placed = false; this.lyingAt = 0;
  }
  /** today's counts start again with the next step (a new game or a load: the town day starts again, maybe on the same day number: T135) */
  newDay(): void {
    this.day = -1; this.today = { golfers: 0, lost: 0, queue: 0, playing: 0, coffees: 0, lessons: 0, kioskQueue: 0, upstairs: 0, noPark: 0, taken: 0 }; this.practiceToday = { putting: 0, chipping: 0 };
  }

  /** a car turns in off the county road from either side, along the drive and into car-park bay `slot` */
  private arrive(slot: number): void {
    const sc = this.scene!, sl = this.slots[slot]!, e = this.entrance!, side = this.rnd() < 0.5 ? -1 : 1, d = sc.roadDir, n = sc.rangeSide;
    // driving toward +u keeps to the range's side of the road (right-hand traffic: a rotation of the frame, never a mirror), toward -u the far side
    const lane = side > 0 ? 0.9 : -0.9, from = { x: sc.J.x - d.x * side * 46 + n.x * lane, y: sc.J.y - d.y * side * 46 + n.y * lane };
    const turn = { x: sc.J.x + n.x * lane, y: sc.J.y + n.y * lane };
    const onDrive = project(e, sc.J, sc.driveEnd), back = { x: sl.x - sl.hx * 2.2, y: sl.y - sl.hy * 2.2 };
    const v: Visit = { id: this.nextId++, person: Math.floor(this.rnd() * this.golfers), car: Math.floor(this.rnd() * 5), slot, stage: S.CarIn, t: 0, r: null, bay: -1, swings: 0, queued: 0, served: 0, x: from.x, y: from.y, ang: 0, born: this.t };
    // the academy (T133): a share of the golfers come for a lesson (drawn only with an academy, so a range without one plays as before)
    if (sc.academy && this.rnd() < LESSON_SHARE) v.lesson = true;
    v.r = route([from, turn, onDrive, e, back, { x: sl.x, y: sl.y }], [ROAD_V, DRIVE_V, DRIVE_V, PARK_V, PARK_V * 0.6]); v.rc = carOn(v.r, false, false);
    this.slotBusy[slot] = true; this.visits.push(v);
  }
  /** the car's way out: from its bay back through the entrance, down the drive and off along the road either way */
  private outRoute(v: Visit): Route {
    const sc = this.scene!, sl = this.slots[v.slot]!, e = this.entrance!, side = this.rnd() < 0.5 ? -1 : 1, d = sc.roadDir, n = sc.rangeSide, lane = side > 0 ? 0.9 : -0.9;
    const back = { x: sl.x - sl.hx * 2.6, y: sl.y - sl.hy * 2.6 }, onDrive = project(e, sc.J, sc.driveEnd);
    const out = { x: sc.J.x + n.x * lane, y: sc.J.y + n.y * lane }, away = { x: sc.J.x + d.x * side * 46 + n.x * lane, y: sc.J.y + d.y * side * 46 + n.y * lane };
    return route([{ x: sl.x, y: sl.y }, back, e, onDrive, out, away], [PARK_V * 0.6, PARK_V, DRIVE_V, DRIVE_V, ROAD_V]);
  }
  /** the golfer's walk from p back to its car: along the path to the car park's edge, then to its bay's side; from a practice facility (T130) out
   *  of the practice area and round the back of the car park */
  private toCar(v: Visit, p: Pt): Pt[] {
    const sc = this.scene!, sl = this.slots[v.slot]!, side = this.carSide(sl), back = this.fromEdge(sl);
    if (v.fac && (v.stage === S.WalkPractice || v.stage === S.Practice)) return [p, sc.practice.entry, sc.practice.behind, side];
    // from the coffee kiosk's line (T133): out to the path in front of it
    if (sc.kiosk && (v.stage === S.WalkKiosk || v.stage === S.KioskQueue)) return [p, sc.kiosk.join, sc.carEdge, ...back, side];
    return [p, ...(v.stage === S.Hit || v.stage === S.WalkBay ? [sc.bays[v.bay]!.back] : [sc.shopJoin]), sc.carEdge, ...back, side];
  }
  /** where a car's golfer gets out and in (T146: the car park building's door, else beside its car) */
  private carSide(sl: CarSlot): Pt { return sl.door ?? { x: sl.x + sl.hy * 1.2, y: sl.y - sl.hx * 1.2 }; }
  /** the way from the path's end at the car park (carEdge) to a car (T146: the lot's walkers round the car park building; none from its door) */
  private fromEdge(sl: CarSlot): Pt[] { return sl.door ? [] : this.scene!.lotWalk; }
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
  private leave(v: Visit): void { if (v.bay >= 0) this.bayBusy[v.bay] = false; this.walk(v, S.WalkCar, this.toCar(v, { x: v.x, y: v.y })); v.bay = -1; }
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
  /** a ball comes to rest at (x, y) */
  private lie(x: number, y: number): void { const i = this.lyingAt; this.lying[2 * i] = x; this.lying[2 * i + 1] = y; this.lyingAt = (i + 1) % LYING_MAX; this.nLying = Math.min(LYING_MAX, this.nLying + 1); }

  /** one visit moved on dt */
  private move(v: Visit, dt: number, dayLen: number, sc: RangeScene): void {
    v.t += dt;
    switch (v.stage) {
      case S.CarIn: if (along(v.r!, v.t, this.tmp)) { v.x = this.tmp.x; v.y = this.tmp.y; const sl = this.slots[v.slot]!; v.ang = Math.atan2(sl.hy, sl.hx); this.walk(v, S.WalkShop, [this.carSide(sl), ...[...this.fromEdge(sl)].reverse(), sc.carEdge]); } else { v.x = this.tmp.x; v.y = this.tmp.y; v.ang = this.tmp.ang; } break;
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
        if (prev < ADDRESS + IMPACT && lt >= ADDRESS + IMPACT) this.launch(v, sc);
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
      case S.WalkCar: { const done = along(v.r!, v.t, this.tmp); v.x = this.tmp.x; v.y = this.tmp.y; v.ang = this.tmp.ang; if (done) { v.stage = S.CarOut; v.t = 0; v.r = this.outRoute(v); v.rc = carOn(v.r, true, !!this.slots[v.slot]?.inside); } break; }
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
    if (c1 > c0 && c0 > rc.due - LAG) for (const w of this.visits) {
      const q = w.rc; if (!q || w === v || Math.abs(q.x - rc.x) > reach || Math.abs(q.y - rc.y) > reach) continue;
      const s = onRoute(r, s0 - 1e-6, s1 + CAR_GAP, q.x, q.y, Math.cos(q.ang), Math.sin(q.ang));
      if (s < 0 || s - CAR_GAP >= lim) continue;
      if (w.id > v.id) {
        if (s <= s0 + 1e-6) continue;
        const sw = arcAt(q.r, q.c); if (onRoute(q.r, sw - 1e-6, sw + CAR_GAP, rc.x, rc.y, hx, hy) >= 0) continue;
      }
      lim = s - CAR_GAP;
    }
    const c = lim < s1 ? Math.min(c1, Math.max(c0, timeAt(r, lim), rc.due - LAG)) : c1;
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
      const len = L * (0.8 + 0.35 * this.rnd()), side = (this.rnd() - 0.5) * L * 0.25;
      this.balls.push({ x0: v.x + ux * 0.3, y0: v.y + uy * 0.3, x1: v.x + ux * len - uy * side, y1: v.y + uy * len + ux * side, t0: this.t, T: 0.8 + len / 10, h: 1 + len * 0.18 });
    }
  }
  /** a ball from v's bay toward one of the targets (a golfer's aim: nearer greens more often), scattered across and along the line */
  private launch(v: Visit, sc: RangeScene): void {
    const b = sc.bays[v.bay]!.stand, tg = sc.targets, i = Math.min(tg.length - 1, Math.floor(Math.pow(this.rnd(), 1.4) * tg.length)), t = tg[i]!;
    const dx = t.x - b.x, dy = t.y - b.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, len = L * (0.82 + 0.3 * this.rnd()), side = (this.rnd() - 0.5) * L * 0.22;
    const x1 = b.x + ux * len - uy * side, y1 = b.y + uy * len + ux * side, lift = sc.bays[v.bay]!.lift;
    // off the upper deck (T133) the ball starts at the deck's height
    this.balls.push({ x0: b.x + ux * 0.6, y0: b.y + uy * 0.6, x1, y1, t0: this.t, T: 1.6 + len / 35, h: 4 + len * 0.16, ...(lift ? { h0: lift / BALL_PX } : {}) });
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
        if (rc.c > 0 || (rc.out && !rc.inside)) { const c = C[nc] ?? (C[nc] = { x: 0, y: 0, ang: 0, type: 0 }); nc++; c.x = rc.x; c.y = rc.y; c.ang = rc.c > 0 ? rc.ang : rc.ang + Math.PI; c.type = v.car; }
      } else if (v.stage >= S.WalkShop && v.stage <= S.WalkCar) {
        // parked (in the car park building, T146: inside it, not drawn)
        const sl = this.slots[v.slot];
        if (sl && !sl.inside) { const c = C[nc] ?? (C[nc] = { x: 0, y: 0, ang: 0, type: 0 }); nc++; c.x = sl.x; c.y = sl.y; c.ang = Math.atan2(sl.hy, sl.hx); c.type = v.car; }
      }
      if (v.stage < S.WalkShop || v.stage > S.WalkCar) continue;
      const p = P[np] ?? (P[np] = { x: 0, y: 0, group: 1, person: 0, row: 0, frame: 0, lift: 0 }); np++;
      p.x = v.x; p.y = v.y; p.group = 1; p.person = v.person;
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
        if (v.fac === 'putting') { const lt = v.t % PUTT_T, D = G.golf_drive; p.frame = lt < PUTT_ADDR ? D.start : lt < PUTT_ADDR + PUTT_STROKE * 0.5 ? D.start + 1 : lt < PUTT_ADDR + PUTT_STROKE + 0.6 ? D.start + 5 : G.idle.start; }
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
      else { p.row = rowToward(Math.cos(v.ang), Math.sin(v.ang)); p.frame = clipFrame(G.walk, G.walk.times[0]! + ((this.t + hash(v.id, 3) * 2) % 1.4)); }
    }
    // the academy's pro (T133): walking over, standing by its pupil facing it, every other swing of the pupil's showing the swing down the range
    const pr = this.pro;
    if (sc?.academy && pr.placed) {
      const p = P[np] ?? (P[np] = { x: 0, y: 0, group: 1, person: 0, row: 0, frame: 0, lift: 0 }); np++;
      p.x = pr.x; p.y = pr.y; p.group = 1; p.person = PRO_PERSON % Math.max(1, this.golfers); p.lift = 0;
      const lt = (this.t - pr.since) % (2 * SWING);
      if (pr.walking) { p.row = rowToward(Math.cos(pr.ang), Math.sin(pr.ang)); p.frame = clipFrame(G.walk, G.walk.times[0]! + (this.t % 1.4)); }
      else if (pr.coach >= 0 && lt >= SWING) { const k = lt - SWING; p.row = golferRow(sc.aim.x, sc.aim.y); p.frame = k < ADDRESS ? G.golf_drive.start : k < ADDRESS + CLIP ? clipFrame(G.golf_drive, G.golf_drive.times[0]! + k - ADDRESS) : G.idle.start; }
      else { p.row = rowToward(Math.cos(pr.ang), Math.sin(pr.ang)); p.frame = G.idle.start; }
    }
    // the ball picker cart (T133): parked by the outfield by day, out on its lanes after closing (the last of the cars)
    if (sc?.picker) {
      const out = this.pickT >= 0, c = C[nc] ?? (C[nc] = { x: 0, y: 0, ang: 0, type: 0 }); nc++;
      if (out) { c.x = this.pickAt.x; c.y = this.pickAt.y; c.ang = this.pickAt.ang; } else { c.x = sc.picker.home.x; c.y = sc.picker.home.y; c.ang = sc.picker.ang; }
      c.type = PICKER_CAR; d.picker = { x: c.x, y: c.y, out };
    }
    d.nPeople = np; d.nCars = nc;
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
