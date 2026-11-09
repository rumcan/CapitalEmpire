// The range's staff and machines (T386, #1043 part 2; part 1 is golf/rangeballs.ts): what the ball loop does while you do something else. A range attendant picks
// balls up on a shift you set (with the tools you own, but not the cart) and tends the counter unless a dispenser stands; a ball washer scrubs the dirty balls picked
// up (a bucket of dirty balls earns DIRTY_VALUE of a clean one's price); robot pickers (a 1985 inventor's contraptions: a battery, a speed) trundle the outfield by
// themselves; target nets catch a share of the balls that land by the greens; a bucket counter stops the over-filled buckets. No belts: every stage has a throughput
// (balls an hour) and the flow panel says where the loop jams. Pure TS, no DOM. All rates are balls a sim second at the reference day (bps); perHour says them in balls a
// town hour.
import { DIRTY_VALUE, perHour, type PickKit } from './rangeballs';

/** you, the scripted player of the pacing test and the flow panel's estimate of what you bring in: your run (tiles a second: golf/you.ts YOU_RUN), your golf cart's speed (golf/play/yours.ts
 *  CART_TILES) and the share of your time you really pick (the trips, the turns, a look at the card) */
export const PLAYER_RUN = 1.9, PLAYER_CART = 2.4, PLAYER_WORKING = 0.85;
/** washing: the balls a second you rinse at the shack's tap (always there) and a ball washer scrubs (a tumbler) */
export const HAND_WASH = 2.5, WASHER_BPS = 14;
/** the range attendant: a shift of SHIFT_HOURS town hours (you set when it starts: SHIFT_STARTS), the share of it at the counter without a dispenser, and how well he picks
 *  against the trip model of a player working without a break (tripBps); his pace (tiles a second) */
export const SHIFT_HOURS = 8, COUNTER_SHARE = 0.4, ATTENDANT_SKILL = 0.8, ATTENDANT_PACE = 1.5;
/** T386 part 3: Pro shop training (the attendants pick at this skill) and the Staff golf cart (an attendant tows the picker at this many tiles a second) */
export const ATTENDANT_TRAINED = 1, ATTENDANT_CART = 2;
export const SHIFT_STARTS: readonly number[] = [7, 11, 15];
/** the robot pickers: each node's robots, the balls a second one picks while it runs, the town hours a charge runs it and the hours it then charges, the upgrades' factors
 *  (a bigger battery runs ROBOT_BAT times as long, a faster drive motor ROBOT_SPEED times as fast) */
export const ROBOTS_A_NODE = 2, ROBOT_BPS = 1.2, ROBOT_HOURS = 3, ROBOT_CHARGE = 1, ROBOT_BAT = 2, ROBOT_SPEED = 1.6;
/** T386 part 3: Fast chargers (the hours a charge takes) */
export const ROBOT_CHARGE_FAST = 0.5;
/** the target nets: the share of the balls that land within reach of a target green that roll into its net's chute (and are picked without anyone), and the bucket counter's
 *  cut of a bucket (it counts out exactly: a scoop less) */
export const NET_SHARE = 0.3, BUCKET_CUT = 0.9;
/** T386 part 3: the Ball polisher: a clean ball earns this much of its price */
export const POLISH_VALUE = 1.08;
/** the trip model (the pacing test's player and the attendants): the tiles from the ball room to the piles (the nearer piles go first), the balls a tile held where a swath
 *  passes (a pile's density) */
export const TRIP_TILES = 28, DENSITY = 2;

/** the balls a second a picker brings in working trips of `tiles` each way with a kit: on foot at `run` tiles a second, to a pile and back with a full basket (filled at the kit's
 *  rate, or by the push picker's swath as he runs through the pile); in the cart (cart: its tiles a second) with its hopper */
export function tripBps(kit: PickKit, o: { run: number; cart?: number; tiles?: number }): number {
  const tiles = o.tiles ?? TRIP_TILES;
  if (kit.cart > 0 && o.cart) { const cyc = 2 * tiles / o.cart + kit.hopper / (kit.cart * o.cart * DENSITY); return kit.hopper / cyc; }
  if (kit.push > 0) { const cyc = 2 * tiles / o.run + kit.basket / (kit.push * o.run * DENSITY); return kit.basket / cyc; }
  const cyc = 2 * tiles / o.run + kit.basket / kit.rate; return kit.basket / cyc;
}
/** the balls a second an attendant picks on his feet with your tools (not the cart's, until the Staff golf cart is bought), while he is picking: his skill (Pro shop training makes it
 *  ATTENDANT_TRAINED) of the trip model at his pace */
export const attendantBps = (kit: PickKit, a: Pick<AutoKit, 'skill' | 'cart'> = { skill: ATTENDANT_SKILL, cart: false }): number =>
  a.skill * (a.cart ? tripBps(kit, { run: ATTENDANT_PACE, cart: ATTENDANT_CART }) : tripBps({ ...kit, cart: 0, hopper: 0 }, { run: ATTENDANT_PACE }));

/** the staff and machines the upgrades owned give: attendants (0..3), their skill and whether they drive the cart, robots, the robot's battery hours, charge hours and speed factor, a washer and a
 *  polisher, the nets, the dispenser (the counter needs no attendant), the bucket counter */
export interface AutoKit { attendants: number; skill: number; cart: boolean; robots: number; robotHours: number; robotCharge: number; robotSpeed: number; washer: boolean; polish: boolean; nets: boolean; dispenser: boolean; counter: boolean }
export function autoKit(owned: readonly string[]): AutoKit {
  const has = (id: string) => owned.includes(id);
  return {
    attendants: (has('attendant') ? 1 : 0) + (has('attendant2') ? 1 : 0) + (has('attendant3') ? 1 : 0), skill: has('training') ? ATTENDANT_TRAINED : ATTENDANT_SKILL, cart: has('staffcart'),
    robots: ROBOTS_A_NODE * ((has('robot') ? 1 : 0) + (has('robot2') ? 1 : 0) + (has('robot3') ? 1 : 0)),
    robotHours: has('robotbat') ? ROBOT_HOURS * ROBOT_BAT : ROBOT_HOURS, robotCharge: has('chargers') ? ROBOT_CHARGE_FAST : ROBOT_CHARGE, robotSpeed: has('robotspd') ? ROBOT_SPEED : 1,
    washer: has('washer'), polish: has('polisher'), nets: has('nets'), dispenser: has('dispenser'), counter: has('counter'),
  };
}
/** whether attendant i (0, 1) is on his shift at town hour h when the first starts at `start` (the second starts a shift later: together they cover sixteen hours) */
export function onShift(i: number, h: number, start: number): boolean {
  const s = (start + i * SHIFT_HOURS) % 24, d = ((h - s) % 24 + 24) % 24; return d < SHIFT_HOURS;
}
/** the balls a second the attendants pick at town hour h (the first starts at `start`): each on his shift, less the counter's share unless a dispenser stands */
export function staffBps(a: AutoKit, pick: PickKit, h: number, start: number): number {
  let n = 0; for (let i = 0; i < a.attendants; i++) if (onShift(i, h, start)) n++;
  return n * attendantBps(pick, a) * (a.dispenser ? 1 : 1 - COUNTER_SHARE);
}
/** the balls a second the robots pick on average: each runs `robotHours` of every `robotHours + ROBOT_CHARGE` town hours, at the drive motor's speed */
export function robotBps(a: AutoKit): number { return a.robots * ROBOT_BPS * a.robotSpeed * a.robotHours / (a.robotHours + a.robotCharge); }
/** the balls a second that can be washed: the tap and the washer */
export const washBps = (a: AutoKit): number => HAND_WASH + (a.washer ? WASHER_BPS : 0);
/** the balls an hour (a town hour at this day length) the tree's staff and machine nodes each take through their stage, with the tools and machines owned now: an attendant picking on his shift
 *  (less the counter's share unless a dispenser stands), the washer's drum, a pair of robots (averaged over a charge). The node's card says it */
export function nodeRates(kit: PickKit, a: AutoKit, dayLen: number): Partial<Record<string, number>> {
  const h = (bps: number) => Math.round(perHour(bps, dayLen)), att = h(attendantBps(kit, a) * (a.dispenser ? 1 : 1 - COUNTER_SHARE));
  const pair = h(ROBOTS_A_NODE * ROBOT_BPS * a.robotSpeed * a.robotHours / (a.robotHours + a.robotCharge));
  return { attendant: att, attendant2: att, attendant3: att, washer: h(WASHER_BPS), robot: pair, robot2: pair, robot3: pair };
}
/** the balls a bucket holds with the bucket counter (the over-filled scoops stop) */
export const bucketBalls = (vb: number, a: AutoKit): number => (a.counter ? Math.max(8, Math.round(vb * BUCKET_CUT)) : vb);
/** a bucket's money as a share of a clean bucket's: the balls it holds, the dirty ones at DIRTY_VALUE (and, with the Ball polisher, the clean ones at POLISH_VALUE) */
export const bucketValue = (clean: number, dirty: number, polish = false): number => { const n = clean + dirty; return n > 0 ? (clean * (polish ? POLISH_VALUE : 1) + DIRTY_VALUE * dirty) / n : 1; };

/** a stage of the flow and what it can do */
export interface FlowStage { id: 'pick' | 'wash' | 'sell'; name: string; /** balls an hour it can take (a town hour) */ perHour: number; /** what it does now (balls an hour, today's so far) */ doing: number }
/** the flow panel's reading: outfield balls, picked (dirty) balls, clean balls and the buckets sold, the three stages between them with their throughputs (balls an hour), and
 *  the bottleneck: the stage that can take the fewest balls an hour, which is what the whole loop can keep up with. Picking counts you by hand at the trip model's rate
 *  (what you bring in working without a break) beside the staff, robots and nets */
export interface Flow { outfield: number; dirty: number; clean: number; stages: FlowStage[]; bottleneck: FlowStage['id']; sustains: number }
export function flowOf(o: { outfield: number; dirty: number; clean: number; pickBps: number; washBps: number; sellBps: number; doing: { pick: number; wash: number; sell: number }; dayLen: number }): Flow {
  const h = (bps: number) => Math.round(perHour(bps, o.dayLen));
  const stages: FlowStage[] = [
    { id: 'pick', name: 'Picking', perHour: h(o.pickBps), doing: Math.round(o.doing.pick) },
    { id: 'wash', name: 'Washing', perHour: h(o.washBps), doing: Math.round(o.doing.wash) },
    { id: 'sell', name: 'Dispensing', perHour: h(o.sellBps), doing: Math.round(o.doing.sell) },
  ];
  const low = stages.reduce((m, s) => (s.perHour < m.perHour ? s : m), stages[0]!);
  return { outfield: Math.round(o.outfield), dirty: Math.round(o.dirty), clean: Math.round(o.clean), stages, bottleneck: low.id, sustains: low.perHour };
}
/** the balls a second the golfers can take: the bays' turnover (bays a bucket's balls every bayHours town hours) */
export const sellBps = (bays: number, vb: number, bayHours: number, dayLen: number): number => bays * vb / (Math.max(0.1, bayHours) * Math.max(24, dayLen) / 24);
