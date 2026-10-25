// The range business (plan P24 Phase 1, T129): a range start's driving range as a small business the player grows. The save, the upgrades and
// the demand are golf/rangesave.ts (re-exported here); this is the scene the game lays on the range plot (ground, cart paths, props, labels:
// all of it derived from the save, so an upgrade re-lays it) and RangeSim, the golfers you see: they drive in, park, queue at the shop,
// buy a bucket, hit it at a free mat (balls fly in arcs to the target greens and lie there until closing), walk back and drive off. Pure TS,
// no DOM, seeded: the engine draws what it says and books its sales. Times are sim seconds; the opening hours read the town day's clock.
import type { Pt } from '../network';
import type { Rect } from './mode';
import { RANGE_PLOT, plotPoint } from './range';
import { arrivalRate, hourWeight, rangeScale, rangeStats, saleValue, skippedVisits, type DemandCtx, type RangeBizSave } from './rangesave';
export * from './rangesave';
import { NEAR } from './rangestart';
import { GOLFER_CLIPS } from '../library';
import { clipFrame, golferRow, hash, rowToward, type CrowdPerson } from '../crowdview';
import { mulberry } from '../iso';

// ---------------------------------------------------------------- the scene

/** the plot frame's spots (u along the road 0..70, v away from it 0..150; the drive beside u = 70, see range.ts plotPoint) */
const U_MID = 35.5, BAY_W = 2.5, SLOTS = 24, STAND_V = 21, PATH_V = 16.2, TEE: [number, number, number, number] = [4, 67, 18, 24];
const SHOP = { u: 34, v: 8.5 }, COUNTER = { u: 34, v: 13.4 }, QUEUE_V = 14.5, CAR_EDGE_U = 48.4, YARD: [number, number, number, number] = [4, 22, 3, 13];
/** the target greens: distances from the tee line (tiles: 50..240 m), across the range (u) and radii (tiles) */
const TARGET_D = [25, 50, 75, 100, 120], TARGET_U = [28, 44, 32, 40, 36], TARGET_R = [3, 4, 4, 5, 4];
/** the far fence (v), the side fences (u) */
const FAR_V = 149.4, SIDE_U: [number, number] = [0.6, 69.4];

/** a prop of the scene: its key (stable while it stays), library id, world point, quarter turns from the picture's base view (preset-art turned),
 *  scale (absent: the library's own size) or fit (the footprint's W + D in tiles the picture spans: business art), and its stand-in label */
export interface ScenePiece { key: string; id: string; x: number; y: number; q: number; scale?: number; fit?: number; label?: string }
/** a ground patch of the scene: a world polygon (x y pairs) and its surface: a golf surface (laid with the course's own presets) or a ground texture */
export interface ScenePatch { pts: number[]; surf: 'fairway' | 'firstCut' | 'tee' | 'fringe' | 'green' | 'rough' | 'dirt' | 'grassDry' | 'asphaltDark' | 'gravel' | 'concrete' }
/** a target green in the scene: centre, radius and distance from the tee line (m) */
export interface SceneTarget { x: number; y: number; r: number; m: number }
/** the scene of a range (rangeScene) */
export interface RangeScene {
  facing: 0 | 1 | 2 | 3;
  pieces: ScenePiece[]; patches: ScenePatch[];
  /** the range's cart paths (cement slab), world legs: laid once (golf.range.paths) */
  paths: { a: Pt; b: Pt }[];
  /** every open bay: where its golfer stands, and the path point behind it */
  bays: { stand: Pt; back: Pt }[];
  /** the way the golfers hit (unit, world) and the target greens */
  aim: Pt; targets: SceneTarget[];
  /** the shop's counter (the queue's head), the queue's step (world, one golfer apart), the path at the shop, the path at the car park */
  counter: Pt; queueStep: Pt; queueAt: Pt; shopJoin: Pt; carEdge: Pt;
  /** the county road's junction with the drive, the drive's end, and the road's direction (unit, world, the frame's +u) and the side of the road
   *  toward the range (unit, world, the frame's +v) */
  J: Pt; driveEnd: Pt; roadDir: Pt; rangeSide: Pt;
  /** the distance numbers over their markers (street tier) and where the district map's "Driving Range" label stands */
  numbers: { x: number; y: number; text: string; low?: boolean }[]; label: Pt;
  /** the world box of the plot (x0 y0 x1 y1) */
  box: [number, number, number, number];
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

  // ---- the ground: the mown outfield in its first cut, the tee box in its fringe, the pads and mats of the open bays, the target greens, the
  // shop's packed dirt and the caravan's dry lawn
  patches.push({ pts: quad(0.3, 69.7, 16.8, 149.7), surf: 'firstCut' }, { pts: quad(2, 68, 24.6, 148), surf: 'fairway' });
  patches.push({ pts: quad(TEE[0] - 0.8, TEE[1] + 0.8, TEE[2] - 0.8, TEE[3] + 0.8), surf: 'firstCut' }, { pts: quad(TEE[0], TEE[1], TEE[2], TEE[3]), surf: 'tee' });
  const open = openSlots(st.bays);
  patches.push({ pts: quad(slotU(open[0]!) - 1.5, slotU(open[open.length - 1]!) + 1.5, STAND_V - 2, STAND_V + 2.2), surf: 'concrete' });
  for (const k of open) { const u = slotU(k); patches.push({ pts: quad(u - 1.05, u + 1.05, STAND_V - 1.4, STAND_V + 1.6), surf: 'asphaltDark' }, { pts: quad(u - 0.65, u + 0.65, STAND_V - 0.2, STAND_V + 1.2), surf: 'green' }); }
  const targets: SceneTarget[] = [];
  for (let i = 0; i < st.targets; i++) {
    const u = TARGET_U[i]!, v = STAND_V + TARGET_D[i]!, r = TARGET_R[i]!, c = P(u, v);
    patches.push({ pts: disc(u, v, r + 1.3), surf: 'firstCut' }, { pts: disc(u, v, r), surf: 'green' });
    targets.push({ x: c.x, y: c.y, r, m: TARGET_D[i]! * 2 });
  }
  patches.push({ pts: quad(28, 41, 3, 15.4), surf: 'dirt' }, { pts: quad(YARD[0], YARD[1], YARD[2], YARD[3]), surf: 'grassDry' });

  // ---- the paths: the back of the mats from the car park's edge, and spurs to the shop's counter and the yard's gate
  const L = (u0: number, v0: number, u1: number, v1: number) => ({ a: P(u0, v0), b: P(u1, v1) });
  const paths = [L(TEE[0] + 1, PATH_V, CAR_EDGE_U, PATH_V), L(COUNTER.u, PATH_V, COUNTER.u, COUNTER.v - 0.2), L(13, PATH_V, 13, YARD[3] + 0.4)];

  // ---- the shop (the tin-and-tarp shack, or the pro shop facing the golfers), the caravan and its fenced back yard
  if (st.proShop) put('shop', 'business:golf-pro-shop', SHOP.u, SHOP.v, toRange);
  // the tin-and-tarp shack (golf:clubhouse-shanty) has no four views yet, and a building without them is drawn as the grand clubhouse (newart.ts):
  // the rusty lean-to shed stands in for it, turned to face the golfers
  else put('shop', 'expansion:lean-to-shed', SHOP.u, SHOP.v, toRange, { label: 'Stand In for the tin-and-tarp pro shop' });
  put('caravan', 'expansion:pop-up-caravan', 9.5, 7.6);
  put('wash', 'expansion:washing-line', 18, 5.4); put('braai', 'expansion:barbecue', 17.6, 10.2);
  put('chair1', 'expansion:lawn-chair', 14.6, 11.2); put('chair2', 'expansion:lawn-chair', 19.8, 11.6); put('cooler', 'expansion:camping-cooler', 12.2, 11.6);
  put('hose', 'expansion:garden-hose', 5.6, 12); put('bins-yard', 'gen:trash-cans-row', 20.6, 3.8);
  fenceRun(pieces, P, 'yard-n', YARD[0], YARD[2], YARD[1], YARD[2], 'picket');
  fenceRun(pieces, P, 'yard-w', YARD[0], YARD[2], YARD[0], YARD[3], 'picket');
  fenceRun(pieces, P, 'yard-e', YARD[1], YARD[2], YARD[1], YARD[3], 'picket');
  fenceRun(pieces, P, 'yard-s1', YARD[0], YARD[3], 12, YARD[3], 'picket'); fenceRun(pieces, P, 'yard-s2', 14, YARD[3], YARD[1], YARD[3], 'picket');
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
  if (st.covered) for (let g = 0; g < open.length; g += 4) put(`roof${g}`, 'business:golf-driving-range', (slotU(open[g]!) + slotU(open[Math.min(open.length, g + 4) - 1]!)) / 2, STAND_V - 1.2, toRange, { fit: 10.5 });
  if (st.lights) {
    const spots: [number, number][] = [[1.6, 26], [68.4, 26], [1.6, 60], [68.4, 60], [1.6, 100], [68.4, 100], [1.6, 140], [68.4, 140]];
    spots.forEach(([u, v], i) => put(`light${i}`, 'world:streetlamp', u, v, 0, { scale: 1, ...(i === 0 ? { label: 'Stand In for Range floodlight' } : {}) }));
  }
  if (st.dispenser) put('dispenser', 'expansion:utility-cabinet', 39.6, 12.6, 0, { label: 'Stand In for Ball dispenser' });

  const bays = open.map(k => ({ stand: P(slotU(k), STAND_V), back: P(slotU(k), PATH_V) }));
  const o = P(0, 0), du = P(1, 0), dv = P(0, 1), c0 = P(0, 0), c1 = P(RANGE_PLOT[0], RANGE_PLOT[1]);
  const q0 = P(COUNTER.u, COUNTER.v), q1 = P(COUNTER.u + 0.8, COUNTER.v);
  return {
    facing, pieces, patches, paths, bays, aim: { x: dv.x - o.x, y: dv.y - o.y }, targets,
    counter: q0, queueStep: { x: q1.x - q0.x, y: q1.y - q0.y }, queueAt: P(COUNTER.u + 0.8, QUEUE_V), shopJoin: P(COUNTER.u, PATH_V), carEdge: P(CAR_EDGE_U, PATH_V),
    J: P(RANGE_PLOT[0] + 2, -NEAR), driveEnd: P(RANGE_PLOT[0] + 2, 16), roadDir: { x: du.x - o.x, y: du.y - o.y }, rangeSide: { x: dv.x - o.x, y: dv.y - o.y },
    numbers, label: P(35, 60), box: [Math.min(c0.x, c1.x), Math.min(c0.y, c1.y), Math.max(c0.x, c1.x), Math.max(c0.y, c1.y)],
  };
}

/** a straight fence from frame (u0, v0) to (u1, v1) as pieces end to end: chain-link (3.36 tiles a panel at its studio size) or picket (1.7: its pictures are shorter than their boxes),
 *  each the picture of the world axis it lies along (the -x or -y picture: a fence is never turned or mirrored) */
function fenceRun(out: ScenePiece[], P: (u: number, v: number) => Pt, key: string, u0: number, v0: number, u1: number, v1: number, kind: 'chain' | 'picket') {
  const a = P(u0, v0), b = P(u1, v1), len = Math.hypot(b.x - a.x, b.y - a.y), alongX = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const piece = kind === 'chain' ? 3.36 : 1.7, n = Math.max(1, Math.round(len / piece));
  const id = kind === 'chain' ? (alongX ? 'expansion:chainlink-x' : 'expansion:chainlink-y') : (alongX ? 'world:fence_picket_x' : 'world:fence_picket_y');
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; out.push({ key: `${key}${i}`, id, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, q: 0 }); }
}

// ---------------------------------------------------------------- the golfers

/** the stages of a visit */
const enum S { CarIn, WalkShop, Queue, WalkBay, Hit, WalkCar, CarOut, Done }
/** the walking speed (tiles/s: a brisk 2.4 m/s, as a sim second is more than two town minutes), the cars' speeds on the road, the drive and in the car park (tiles/s) */
const WALK = 1.4, ROAD_V = 9, DRIVE_V = 4.5, PARK_V = 2.5;
/** a swing's beats: address, the drive clip, the pause after; the ball leaves at the clip's impact (s) */
const ADDRESS = 1.2, CLIP = GOLFER_CLIPS.golf_drive.times[GOLFER_CLIPS.golf_drive.n - 1]! - GOLFER_CLIPS.golf_drive.times[0]!, PAUSE = 1.3, IMPACT = 1.22;
const SWING = ADDRESS + CLIP + PAUSE;
/** the most balls lying on the range, and of golfers queued patiently (town hours) */
const LYING_MAX = 800, PATIENCE_H = 2;

/** a car-park bay a range car parks in: its point and heading (unit), and the park's entrance */
export interface CarSlot { x: number; y: number; hx: number; hy: number }
/** a route: points and the speed of each leg (tiles/s), with the cumulative times */
interface Route { pts: Pt[]; v: number[]; at: number[] }
function route(pts: Pt[], v: number[]): Route {
  const at = [0];
  for (let i = 1; i < pts.length; i++) at.push(at[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y) / (v[i - 1] ?? v[v.length - 1]!));
  return { pts, v, at };
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
interface Visit { id: number; person: number; car: number; slot: number; stage: S; t: number; r: Route | null; bay: number; swings: number; queued: number; served: number; x: number; y: number; ang: number }
/** a ball in the air: from, to (tiles), launch time and flight time (s), and the arc's height (tiles) */
interface Ball { x0: number; y0: number; x1: number; y1: number; t0: number; T: number; h: number }
/** what the engine sees of the sim each frame */
export interface RangeDraw {
  /** the golfers on foot (walking, queued, hitting) as crowd people (group 1) */
  people: CrowdPerson[]; nPeople: number;
  /** the cars (driving or parked): point, heading (radians, world) and type */
  cars: { x: number; y: number; ang: number; type: number }[]; nCars: number;
}
/** the town clock as the sim reads it: the hour (fractional) and the day number */
export interface RangeClock { hour: number; day: number }
/** today's counts (since the town's midnight): golfers who bought, golfers lost, and the queue now */
export interface RangeToday { golfers: number; lost: number; queue: number; playing: number }

/** The golfers you see (plan 2.2). step() moves them on and returns the takings booked ($); the counts go into the save's season and total */
export class RangeSim {
  private visits: Visit[] = []; private queue: number[] = []; private balls: Ball[] = [];
  /** the lying balls, x y pairs (a ring of LYING_MAX) and how many */
  readonly lying = new Float32Array(LYING_MAX * 2); nLying = 0; private lyingAt = 0;
  private nextId = 1; private rnd: () => number; private t = 0; private serving = -1; private serveLeft = 0; private bayBusy: boolean[] = [];
  private scene: RangeScene | null = null; private slots: CarSlot[] = []; private entrance: Pt | null = null; private slotBusy: boolean[] = [];
  today: RangeToday = { golfers: 0, lost: 0, queue: 0, playing: 0 }; private day = -1;
  private draw: RangeDraw = { people: [], nPeople: 0, cars: [], nCars: 0 };
  /** the queue limit now, and the golfers who turned back at the shop this step (counted as lost by step) */
  private qMax = 5; private lost = 0;
  private tmp = { x: 0, y: 0, ang: 0 };
  constructor(seed: number, private golfers = 10) { this.rnd = mulberry(seed ^ 0x5eed7a); }

  /** the scene and the car park (its bays and entrance; none: no car park, no visitors): a new scene keeps the golfers, whose bays it keeps */
  setScene(scene: RangeScene, slots: CarSlot[], entrance: Pt | null): void {
    this.scene = scene; this.slots = slots; this.entrance = entrance;
    const nb = scene.bays.length;
    this.bayBusy.length = nb; for (let i = 0; i < nb; i++) this.bayBusy[i] = this.visits.some(v => v.bay === i && v.stage >= S.WalkBay && v.stage <= S.Hit);
    // a golfer whose bay is gone (the bays never shrink, but a load can change them) finishes now
    for (const v of this.visits) if (v.bay >= nb && v.stage >= S.WalkBay && v.stage <= S.Hit) this.leave(v);
    this.slotBusy = slots.map((_, i) => this.visits.some(v => v.slot === i && v.stage !== S.Done));
  }
  /** the balls in the air now: each one's point and height (tiles), written into out as x y h triples; returns how many */
  flying(out: Float32Array): number {
    let n = 0;
    for (const b of this.balls) { const k = (this.t - b.t0) / b.T; if (k < 0 || k > 1 || 3 * n + 2 >= out.length) continue; out[3 * n] = b.x0 + (b.x1 - b.x0) * k; out[3 * n + 1] = b.y0 + (b.y1 - b.y0) * k; out[3 * n + 2] = 4 * b.h * k * (1 - k); n++; }
    return n;
  }
  /** the golfers on the range now (walking to the shop, queued, at the mats or going back) */
  get onFoot(): number { let n = 0; for (const v of this.visits) if (v.stage >= S.WalkShop && v.stage <= S.WalkCar) n++; return n; }

  /** dt sim seconds on (dt of two minutes or more: a skip, booked by skippedVisits and the golfers cleared; the host steps a long frame in pieces).
   *  Returns the takings booked ($) */
  step(dt: number, clock: RangeClock, s: RangeBizSave, c: DemandCtx, dayLen: number): number {
    const sc = this.scene; if (!sc || dt <= 0) return 0;
    if (clock.day !== this.day) { this.day = clock.day; this.today.golfers = 0; this.today.lost = 0; }
    const st = rangeStats(s), value = saleValue(s, dayLen, st), scale = rangeScale(dayLen); this.qMax = st.qMax;
    let booked = 0;
    const sell = (n: number) => { const m = n * value; s.season.golfers += n; s.total.golfers += n; s.season.buckets += n * scale; s.total.buckets += n * scale; s.season.takings += m; s.total.takings += m; this.today.golfers += n; booked += m; };
    const lose = (n: number) => { s.season.lost += n; s.total.lost += n; this.today.lost += n; };
    if (dt >= 120) {
      const r = skippedVisits(s, c, clock.hour, dt, dayLen); sell(r.served); lose(r.lost);
      this.clear(); this.t += dt; return booked;
    }
    this.t += dt;
    const isOpen = hourWeight(clock.hour, st) > 0;
    // the arrivals: a Poisson stream at the hour's rate; a car turns away at a long queue or a full car park
    const rate = arrivalRate(s, c, clock.hour, dayLen, st);
    if (rate > 0 && this.rnd() < 1 - Math.exp(-rate * dt)) {
      // the driver sees the line at the shop (a golfer who walks up to a line that grew meanwhile may still turn back: see move)
      const waiting = this.queue.length;
      const slot = this.slotBusy.indexOf(false);
      if (waiting >= st.qMax || slot < 0 || !this.entrance) lose(1);
      else this.arrive(slot);
    }
    // the counter: the queue's head is served when a bay is free (its bay is held from the start of the sale)
    if (this.serving < 0 && this.queue.length && isOpen) {
      const bay = this.bayBusy.indexOf(false), head = this.visits.find(v => v.id === this.queue[0]);
      if (bay >= 0 && head && head.stage === S.Queue && this.atSpot(head)) { this.serving = head.id; this.serveLeft = st.serve; head.bay = bay; this.bayBusy[bay] = true; }
    }
    if (this.serving >= 0 && (this.serveLeft -= dt) <= 0) {
      const v = this.visits.find(q => q.id === this.serving); this.serving = -1;
      if (v) { this.queue.shift(); sell(1); v.served = this.t - st.serve; this.walk(v, S.WalkBay, [{ x: v.x, y: v.y }, sc.shopJoin, sc.bays[v.bay]!.back, sc.bays[v.bay]!.stand]); }
    }
    // closing: the queue goes home (lost); patience: a golfer queued two town hours leaves
    const patience = PATIENCE_H * dayLen / 24;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const v = this.visits.find(q => q.id === this.queue[i]); if (!v || v.id === this.serving) continue;
      if (!isOpen || this.t - v.queued > patience) { this.queue.splice(i, 1); lose(1); this.walk(v, S.WalkCar, this.toCar(v, { x: v.x, y: v.y })); }
    }
    for (const v of this.visits) this.move(v, dt, dayLen, sc);
    if (this.lost) { lose(this.lost); this.lost = 0; }
    // the queue's spots: each queued golfer walks up to its place in the line
    this.queue.forEach((id, k) => { const v = this.visits.find(q => q.id === id); if (v && v.stage === S.Queue) this.toward(v, this.queueSpot(k), dt); });
    this.balls = this.balls.filter(b => { if (this.t < b.t0 + b.T) return true; this.lie(b.x1, b.y1); return false; });
    this.visits = this.visits.filter(v => v.stage !== S.Done);
    // the balls are picked once the range is closed and empty (the picker cart is Phase 4)
    if (!isOpen && !this.visits.some(v => v.stage === S.Hit)) this.nLying = 0;
    this.today.queue = this.queue.length; this.today.playing = this.visits.filter(v => v.stage === S.Hit).length;
    return booked;
  }
  /** no golfers, cars or balls (a skip, a new game) */
  clear(): void { this.visits = []; this.queue = []; this.balls = []; this.serving = -1; this.nLying = 0; this.bayBusy.fill(false); this.slotBusy.fill(false); }

  /** a car turns in off the county road from either side, along the drive and into car-park bay `slot` */
  private arrive(slot: number): void {
    const sc = this.scene!, sl = this.slots[slot]!, e = this.entrance!, side = this.rnd() < 0.5 ? -1 : 1, d = sc.roadDir, n = sc.rangeSide;
    // driving toward +u keeps to the range's side of the road (right-hand traffic: a rotation of the frame, never a mirror), toward -u the far side
    const lane = side > 0 ? 0.9 : -0.9, from = { x: sc.J.x - d.x * side * 46 + n.x * lane, y: sc.J.y - d.y * side * 46 + n.y * lane };
    const turn = { x: sc.J.x + n.x * lane, y: sc.J.y + n.y * lane };
    const onDrive = project(e, sc.J, sc.driveEnd), back = { x: sl.x - sl.hx * 2.2, y: sl.y - sl.hy * 2.2 };
    const v: Visit = { id: this.nextId++, person: Math.floor(this.rnd() * this.golfers), car: Math.floor(this.rnd() * 5), slot, stage: S.CarIn, t: 0, r: null, bay: -1, swings: 0, queued: 0, served: 0, x: from.x, y: from.y, ang: 0 };
    v.r = route([from, turn, onDrive, e, back, { x: sl.x, y: sl.y }], [ROAD_V, DRIVE_V, DRIVE_V, PARK_V, PARK_V * 0.6]);
    this.slotBusy[slot] = true; this.visits.push(v);
  }
  /** the car's way out: from its bay back through the entrance, down the drive and off along the road either way */
  private outRoute(v: Visit): Route {
    const sc = this.scene!, sl = this.slots[v.slot]!, e = this.entrance!, side = this.rnd() < 0.5 ? -1 : 1, d = sc.roadDir, n = sc.rangeSide, lane = side > 0 ? 0.9 : -0.9;
    const back = { x: sl.x - sl.hx * 2.6, y: sl.y - sl.hy * 2.6 }, onDrive = project(e, sc.J, sc.driveEnd);
    const out = { x: sc.J.x + n.x * lane, y: sc.J.y + n.y * lane }, away = { x: sc.J.x + d.x * side * 46 + n.x * lane, y: sc.J.y + d.y * side * 46 + n.y * lane };
    return route([{ x: sl.x, y: sl.y }, back, e, onDrive, out, away], [PARK_V * 0.6, PARK_V, DRIVE_V, DRIVE_V, ROAD_V]);
  }
  /** the golfer's walk from p back to its car: along the path to the car park's edge, then to its bay's side */
  private toCar(v: Visit, p: Pt): Pt[] {
    const sc = this.scene!, sl = this.slots[v.slot]!;
    return [p, ...(v.stage === S.Hit || v.stage === S.WalkBay ? [sc.bays[v.bay]!.back] : [sc.shopJoin]), sc.carEdge, { x: sl.x + sl.hy * 1.2, y: sl.y - sl.hx * 1.2 }];
  }
  private walk(v: Visit, stage: S, pts: Pt[]): void { v.stage = stage; v.t = 0; v.r = route(pts, [WALK]); }
  /** the visit's golfer done with its bucket (or its bay gone): it walks back to its car */
  private leave(v: Visit): void { if (v.bay >= 0) this.bayBusy[v.bay] = false; this.walk(v, S.WalkCar, this.toCar(v, { x: v.x, y: v.y })); v.bay = -1; }
  private queueSpot(k: number): Pt { const sc = this.scene!; return k === 0 ? sc.counter : { x: sc.queueAt.x + sc.queueStep.x * (k - 1), y: sc.queueAt.y + sc.queueStep.y * (k - 1) }; }
  private atSpot(v: Visit): boolean { const p = this.queueSpot(this.queue.indexOf(v.id)); return Math.hypot(v.x - p.x, v.y - p.y) < 0.15; }
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
      case S.CarIn: if (along(v.r!, v.t, this.tmp)) { v.x = this.tmp.x; v.y = this.tmp.y; const sl = this.slots[v.slot]!; v.ang = Math.atan2(sl.hy, sl.hx); this.walk(v, S.WalkShop, [{ x: sl.x + sl.hy * 1.2, y: sl.y - sl.hx * 1.2 }, sc.carEdge, sc.shopJoin, this.queueSpot(this.queue.length)]); } else { v.x = this.tmp.x; v.y = this.tmp.y; v.ang = this.tmp.ang; } break;
      case S.WalkShop: {
        const done = along(v.r!, v.t, this.tmp); v.x = this.tmp.x; v.y = this.tmp.y; v.ang = this.tmp.ang;
        // at the shop: a line two past the limit sends the golfer back to the car (lost); else it joins the line
        if (done && this.queue.length >= this.qMax + 2) { this.lost++; this.walk(v, S.WalkCar, this.toCar(v, { x: v.x, y: v.y })); }
        else if (done) { v.stage = S.Queue; v.queued = this.t; this.queue.push(v.id); }
        break;
      }
      case S.WalkBay: { const done = along(v.r!, v.t, this.tmp); v.x = this.tmp.x; v.y = this.tmp.y; v.ang = this.tmp.ang; if (done) { v.stage = S.Hit; v.t = 0; v.swings = Math.max(2, Math.floor((dayLen / 24 - (this.t - v.served)) / SWING)); } break; }
      case S.Hit: {
        // each swing: address, the drive (the ball leaves at impact toward a target green, scattered), the pause; the bucket's last swing ends the visit
        const k = Math.floor(v.t / SWING), lt = v.t - k * SWING, prev = v.t - dt - k * SWING;
        if (k >= v.swings) { this.leave(v); break; }
        if (prev < ADDRESS + IMPACT && lt >= ADDRESS + IMPACT) this.launch(v, sc);
        break;
      }
      case S.WalkCar: { const done = along(v.r!, v.t, this.tmp); v.x = this.tmp.x; v.y = this.tmp.y; v.ang = this.tmp.ang; if (done) { v.stage = S.CarOut; v.t = 0; v.r = this.outRoute(v); } break; }
      case S.CarOut: { const done = along(v.r!, v.t, this.tmp); v.x = this.tmp.x; v.y = this.tmp.y; v.ang = this.tmp.ang; if (v.t > 1.5 && this.slotBusy[v.slot]) this.slotBusy[v.slot] = false; if (done) v.stage = S.Done; break; }
      default: break;
    }
  }
  /** a ball from v's bay toward one of the targets (a golfer's aim: nearer greens more often), scattered across and along the line */
  private launch(v: Visit, sc: RangeScene): void {
    const b = sc.bays[v.bay]!.stand, tg = sc.targets, i = Math.min(tg.length - 1, Math.floor(Math.pow(this.rnd(), 1.4) * tg.length)), t = tg[i]!;
    const dx = t.x - b.x, dy = t.y - b.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, len = L * (0.82 + 0.3 * this.rnd()), side = (this.rnd() - 0.5) * L * 0.22;
    const x1 = b.x + ux * len - uy * side, y1 = b.y + uy * len + ux * side;
    this.balls.push({ x0: b.x + ux * 0.6, y0: b.y + uy * 0.6, x1, y1, t0: this.t, T: 1.6 + len / 35, h: 4 + len * 0.16 });
  }

  /** the people and cars to draw (reused objects): every golfer on foot as a crowd person (walking: the walk clip toward its heading; queued:
   *  idle, facing the counter; at a mat: the address, the drive, then idle, aimed down the range) and every car on the road or parked */
  view(): RangeDraw {
    const d = this.draw, sc = this.scene, P = d.people, C = d.cars, G = GOLFER_CLIPS;
    let np = 0, nc = 0;
    if (sc) for (const v of this.visits) {
      if (v.stage === S.CarIn || v.stage === S.CarOut || (v.stage >= S.WalkShop && v.stage <= S.WalkCar)) {
        const sl = this.slots[v.slot], parked = v.stage !== S.CarIn && v.stage !== S.CarOut;
        const c = C[nc] ?? (C[nc] = { x: 0, y: 0, ang: 0, type: 0 }); nc++;
        if (parked && sl) { c.x = sl.x; c.y = sl.y; c.ang = Math.atan2(sl.hy, sl.hx); } else { c.x = v.x; c.y = v.y; c.ang = v.ang; }
        c.type = v.car;
      }
      if (v.stage < S.WalkShop || v.stage > S.WalkCar) continue;
      const p = P[np] ?? (P[np] = { x: 0, y: 0, group: 1, person: 0, row: 0, frame: 0 }); np++;
      p.x = v.x; p.y = v.y; p.group = 1; p.person = v.person;
      if (v.stage === S.Hit) {
        const k = Math.floor(v.t / SWING), lt = v.t - k * SWING;
        p.row = golferRow(sc.aim.x, sc.aim.y);
        p.frame = lt < ADDRESS ? G.golf_drive.start : lt < ADDRESS + CLIP ? clipFrame(G.golf_drive, G.golf_drive.times[0]! + lt - ADDRESS) : G.idle.start;
      } else if (v.stage === S.Queue && this.atSpot(v)) {
        // the head faces the shop's counter (toward the road), the rest of the line faces up it
        const head = this.queue[0] === v.id;
        p.row = head ? rowToward(-sc.aim.x, -sc.aim.y) : rowToward(-sc.queueStep.x, -sc.queueStep.y); p.frame = G.idle.start;
      }
      else { p.row = rowToward(Math.cos(v.ang), Math.sin(v.ang)); p.frame = clipFrame(G.walk, G.walk.times[0]! + ((this.t + hash(v.id, 3) * 2) % 1.4)); }
    }
    d.nPeople = np; d.nCars = nc;
    return d;
  }
}

/** the point of segment a-b nearest p */
function project(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1, k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
  return { x: a.x + dx * k, y: a.y + dy * k };
}
