// T316 (#902): the classic 3-click swing meter for the owner's own shots (the owner, 2026-11-03: "the classic 3 click swing ... the half circle one").
// Click 1 starts the backswing: the marker climbs the arc from the snap line. Click 2 sets the power where the marker is (100% at the top mark; past
// it is the overswing: more distance and more spread); the marker turns back at once. Click 3, on the way back, sets the accuracy: its offset from the
// snap line is the miss, left when early (the marker still above the line), right when late (past it), straight inside the sweet spot. Space presses
// during the swing ("spamming a keyboard button ... to add power") add a small capped boost and narrow the sweet spot. Your skill (T241, the club's part
// of the game) slows the marker and widens the sweet spot.
// The meter is pure here (times in seconds in, an outcome out); the outcome (power, accuracy, boost), never the click times, is what the save keeps and
// the replay plays (live.ts OwnerInput.swing). Pure TS, no DOM.
import { TILE_M } from '../types';
import type { Club, Shot } from './types';

/** the meter, in meter units u: 0 is the snap line (where the swing starts and should end), 1 the 100% power mark, TOP the arc's end (the most
 *  overswing; the marker turns back there by itself), LOW the arc's end past the snap line (the worst late click; the swing ends there by itself) */
export const METER = { top: 1.2, low: -0.2 } as const;
/** the time (s) the marker takes from the snap line to 100% at skill 0 and at skill 1 (a better golfer gets a slower marker); the way back is as fast */
export const METER_TIME = [0.7, 1.3] as const;
/** the sweet spot's half width (meter units) around the snap line at skill 0 and at skill 1 */
export const SWEET = [0.025, 0.07] as const;
/** the key-spam boost: power added per Space press during the swing, the cap, how much a full boost narrows the sweet spot and widens the spread */
export const BOOST = { per: 0.01, max: 0.06, narrow: 0.4, spread: 0.3 } as const;
/** the miss: degrees off the aim per meter unit outside the sweet spot and the most, for a full shot and a putt; a full shot past HOOK_DEG is a hook or a
 *  slice (curving: a hook runs on, a slice carries short), under it a pull or a push */
export const MISS = { fullDeg: 90, fullMax: 18, puttDeg: 30, puttMax: 8, hookDeg: 5, hookRoll: 1.5, sliceCarry: 0.96 } as const;
/** the overswing: a full shot carries half of the power past 100% (1.2 on the meter carries 110%) and its spread grows by this per unit past 100% */
export const OVER = { carry: 0.5, spread: 3 } as const;
/** the least power a swing gives (a click 2 at once is a dribble, not nothing) */
export const MIN_SWING_POWER = 0.05;
/** the share of the model's random direction spread a meter shot keeps: the meter's own miss takes over the direction (the distance spread stays) */
export const METER_ANG = 0.5;

/** v clamped to [lo, hi] */
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** the meter's outcome, saved and replayed: power (meter units at click 2, 0..TOP: 1 is 100%), acc (meter units at click 3, signed: + early, - late,
 *  LOW..TOP) and boost (the key-spam power added, 0..BOOST.max) */
export interface SwingOutcome { power: number; acc: number; boost: number }
/** a miss's shape: straight, pull (left) or push (right) for a small miss, hook (left) or slice (right) for a big one */
export type SwingShape = 'straight' | 'pull' | 'push' | 'hook' | 'slice';
/** what a swing does to the shot: the power played (a share of the club's full carry; a putt's share of its length to the pin), the miss in degrees off
 *  the aim (+ right, - left, as the golfer faces the aim), the spread factor (overswing and boost), the shape, and the carry and roll factors (a slice
 *  carries short, a hook runs on) */
export interface SwingEffect { power: number; deg: number; spread: number; shape: SwingShape; carry: number; roll: number }

/** the time (s) the marker takes from the snap line to 100% for a skill (0..1) */
export const swingTime = (skill: number): number => METER_TIME[0] + (METER_TIME[1] - METER_TIME[0]) * clamp(skill, 0, 1);
/** the boost of n Space presses: BOOST.per each, at most BOOST.max */
export const boostOf = (presses: number): number => Math.min(BOOST.max, Math.max(0, Math.floor(presses)) * BOOST.per);
/** the sweet spot's half width (meter units) for a skill (0..1) and a boost: a full boost narrows it by BOOST.narrow */
export const sweetSpot = (skill: number, boost = 0): number =>
  (SWEET[0] + (SWEET[1] - SWEET[0]) * clamp(skill, 0, 1)) * (1 - BOOST.narrow * clamp(boost, 0, BOOST.max) / BOOST.max);

/** the meter mark (u) of a full shot's power share p (overswing: 1 + (p - 1) / OVER.carry), and of a putt's (u = p); for the aim's mark on the arc */
export function meterMark(p: number, putting: boolean): number {
  if (putting || p <= 1) return clamp(p, 0, METER.top);
  return clamp(1 + (p - 1) / OVER.carry, 0, METER.top);
}

/** what a swing's outcome does to the shot, for the club's skill (0..1) and a putt or a full shot (see SwingEffect). Pure: the same outcome and skill always
 *  give the same effect, so a replay plays the same shot */
export function swingEffect(o: SwingOutcome, skill: number, putting: boolean): SwingEffect {
  const boost = clamp(o.boost, 0, BOOST.max), pw = clamp(o.power, 0, METER.top), acc = clamp(o.acc, METER.low, METER.top);
  const w = sweetSpot(skill, boost), off = Math.abs(acc) <= w ? 0 : (Math.abs(acc) - w) * Math.sign(acc);
  // early (acc > 0) misses left (-), late misses right (+)
  const k = putting ? MISS.puttDeg : MISS.fullDeg, mx = putting ? MISS.puttMax : MISS.fullMax, deg = off === 0 ? 0 : -Math.sign(off) * Math.min(mx, Math.abs(off) * k);
  const big = !putting && Math.abs(deg) >= MISS.hookDeg;
  const shape: SwingShape = deg === 0 ? 'straight' : deg < 0 ? (big ? 'hook' : 'pull') : (big ? 'slice' : 'push');
  if (putting) return { power: Math.max(MIN_SWING_POWER, pw + boost), deg, spread: 1, shape, carry: 1, roll: 1 };
  const base = pw <= 1 ? pw : 1 + OVER.carry * (pw - 1);
  const spread = (1 + OVER.spread * Math.max(0, pw - 1)) * (1 + BOOST.spread * boost / BOOST.max);
  return { power: Math.max(MIN_SWING_POWER, base + boost), deg, spread, shape, carry: shape === 'slice' ? MISS.sliceCarry : 1, roll: shape === 'hook' ? MISS.hookRoll : 1 };
}

/** a swing outcome as the save keeps it, or null when it is not well formed (numbers clamped to the meter) */
export function readSwing(v: unknown): SwingOutcome | null {
  const o = v as Partial<SwingOutcome> | null;
  if (!o || typeof o !== 'object' || ![o.power, o.acc, o.boost].every(n => typeof n === 'number' && Number.isFinite(n))) return null;
  return { power: clamp(o.power!, 0, METER.top), acc: clamp(o.acc!, METER.low, METER.top), boost: clamp(o.boost!, 0, BOOST.max) };
}

/** the meter's phase: ready (before click 1), up (the backswing, before click 2), back (the downswing, before click 3), done */
export type SwingPhase = 'ready' | 'up' | 'back' | 'done';

/** one swing on the meter, driven by times in seconds (any clock, e.g. performance.now() / 1000). click() is the swing button (Enter, a mouse click),
 *  press() the Space spam; pos(t) is where to draw the marker; outcome() once done */
export class SwingMeter {
  phase: SwingPhase = 'ready';
  /** u per second up and back (1 / swingTime(skill)) */
  readonly speed: number;
  /** the Space presses counted during the swing */
  presses = 0;
  /** the power set at click 2 (or TOP, by itself), and the accuracy at click 3 (or LOW, by itself); null until set */
  power: number | null = null; acc: number | null = null;
  private t0 = 0; private t1 = 0;

  constructor(skill: number) { this.speed = 1 / swingTime(skill); }

  /** the marker's u at time t (s): 0 before the swing; climbing from click 1; turning back at click 2 (or the top); the outcome's acc once done */
  pos(t: number): number {
    this.tick(t);
    if (this.phase === 'ready') return 0;
    if (this.phase === 'up') return (t - this.t0) * this.speed;
    if (this.phase === 'back') return this.power! - (t - this.t1) * this.speed;
    return this.acc!;
  }

  /** the automatic turns at time t: at the top the power is TOP and the marker comes back; past LOW the swing ends at LOW */
  tick(t: number): void {
    if (this.phase === 'up' && (t - this.t0) * this.speed >= METER.top) { this.power = METER.top; this.t1 = this.t0 + METER.top / this.speed; this.phase = 'back'; }
    if (this.phase === 'back' && this.power! - (t - this.t1) * this.speed <= METER.low) { this.acc = METER.low; this.phase = 'done'; }
  }

  /** the swing button at time t: starts the swing, sets the power, or sets the accuracy. Returns the phase after it */
  click(t: number): SwingPhase {
    this.tick(t);
    if (this.phase === 'ready') { this.t0 = t; this.phase = 'up'; }
    else if (this.phase === 'up') { this.power = Math.max(0, (t - this.t0) * this.speed); this.t1 = t; this.phase = 'back'; }
    else if (this.phase === 'back') { this.acc = this.power! - (t - this.t1) * this.speed; this.phase = 'done'; }
    return this.phase;
  }

  /** a Space press at time t: counts during the swing (up or back), not before or after */
  press(t: number): void { this.tick(t); if (this.phase === 'up' || this.phase === 'back') this.presses++; }

  /** the boost so far */
  boost(): number { return boostOf(this.presses); }

  /** the outcome once done, else null */
  outcome(): SwingOutcome | null {
    return this.phase === 'done' ? { power: this.power!, acc: this.acc!, boost: this.boost() } : null;
  }
}

/** the miss as the player reads it: "Straight", "Hook, 7° left", "Push, 2° right" */
export function shapeText(e: Pick<SwingEffect, 'shape' | 'deg'>): string {
  if (e.shape === 'straight') return 'Straight';
  const name = e.shape[0]!.toUpperCase() + e.shape.slice(1), d = Math.abs(e.deg);
  return `${name}, ${d < 1 ? d.toFixed(1) : Math.round(d)}° ${e.deg < 0 ? 'left' : 'right'}`;
}

/** the clubs as the player reads them */
export const CLUB_NAME: Readonly<Record<Club, string>> = { driver: 'Driver', wood3: '3-wood', iron4: '4-iron', iron6: '6-iron', iron8: '8-iron', pw: 'Pitching wedge', sw: 'Sand wedge', putter: 'Putter' };

/** a played shot as the player reads it after the swing: the club, the miss, its carry and total (metres; null where there is none: a putt has no carry,
 *  a penalty no total) and one line of text: "Driver: Hook, 7° left · carry 182 m, total 195 m" */
export interface ShotReport { club: Club; shape: string; carryM: number | null; totalM: number | null; text: string }
/** the report of a played shot (live.ts play's Shot) and its swing's effect (null: no meter) */
export function shotReport(s: Shot, eff: Pick<SwingEffect, 'shape' | 'deg'> | null): ShotReport {
  const shape = eff ? shapeText(eff) : '', m = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(b.x - a.x, b.y - a.y) * TILE_M;
  const head = `${CLUB_NAME[s.club]}${shape ? `: ${shape}` : ''}`;
  if (s.club === 'putter') {
    const totalM = s.penalty ? null : m(s.from, s.to);
    return { club: s.club, shape, carryM: null, totalM, text: `${head} · ${s.holed ? 'holed' : s.penalty ? 'off the green, +1' : `rolled ${totalM!.toFixed(1)} m`}` };
  }
  const carryM = s.landing ? m(s.from, s.landing.at) : null, totalM = s.penalty ? null : s.landing ? m(s.from, s.landing.rest) : m(s.from, s.to);
  const where = s.penalty ? (s.landing?.restLie === 'water' ? 'in the water, +1' : 'out of bounds, +1') : `total ${Math.round(totalM!)} m`;
  return { club: s.club, shape, carryM, totalM, text: `${head} · ${carryM !== null ? `carry ${Math.round(carryM)} m, ` : ''}${where}${s.holed ? ', holed!' : ''}` };
}
