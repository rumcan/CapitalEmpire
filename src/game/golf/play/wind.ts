// T334 (#960; the owner, 2026-11-04: "We want wind and diffrent flights based on fairway and rough"): the day's wind and what it does to a ball in flight.
// - The day's wind (dailyWind): a mean speed in mph, the compass bearing it blows FROM (degrees clockwise from the map's north, which is the top of the
//   screen), how gusty it is, and the seed of its gusts. Deterministic from the map's seed and the town day, so a reload has the same weather.
// - Through the day (windAt): gusts come and go on a clock in seconds (the engine's), the direction wobbles a little; a calm day is flat.
// - On a shot (windEffect): the wind along the shot shortens the carry (a headwind) or lengthens it (a tailwind, less so), the wind across drifts the ball
//   sideways; both grow with the carry, and with the club's exposure (a long high flight feels more than a low short one: WIND_CLUB, times the shot's
//   flight and its lie's height). A putt takes none (a putter never leaves the ground: it does not come through here).
// The model reads plain data (WindNow: the wind at the strike, kept with the saved input), never a clock, so a replay plays the same shot. Pure TS, no DOM,
// no Math.random; the tile frame is the game's (x and y as the map's axes: the screen's handedness, y down).
import type { Club } from './types';

/** the day's wind: its mean speed (mph), the bearing it blows from (compass degrees: 0 north, 90 east), its gustiness (0 steady .. 1 very gusty) and its seed */
export interface Wind { mph: number; from: number; gusty: number; seed: number }
/** the wind at an instant: its speed (mph, gusts in) and the bearing it blows from */
export interface WindNow { mph: number; from: number }
/** no wind at all (a calm that is exactly 0: the model reads it as none) */
export const NO_WIND: Readonly<Wind> = { mph: 0, from: 0, gusty: 0, seed: 0 };
/** the strongest wind the game has (mph): a saved wind is held to it */
export const WIND_MAX = 40;
/** the day's wind: from DAY_WIND_MIN to DAY_WIND_MAX mph (the owner's range) */
export const DAY_WIND_MIN = 4, DAY_WIND_MAX = 30;
/** under this many mph the day is called calm (the panel says so; the flags hang) */
export const CALM_MPH = 2.5;

/** how a club feels the wind (1: the driver's long, high flight; the wedges fly short, so less of it), and the multiplier of a shot's flight (a low shot 0.6,
 *  a high one 1.3: T334 part 2's shaping; a bunker shot comes out high: lies.ts high) */
export const WIND_CLUB: Readonly<Record<Club, number>> = { driver: 1, wood3: 1, wood5: 0.98, hybrid: 0.96, iron4: 0.95, iron5: 0.9, iron6: 0.85, iron7: 0.8, iron8: 0.75, iron9: 0.7, pw: 0.65, gw: 0.6, sw: 0.55, lw: 0.5, putter: 0 };
/** the wind's numbers, per mph and per unit of exposure: the sideways drift as a share of the carry (0.6%: a 10 mph crosswind moves a 200 m drive 12 m), the
 *  carry lost to a headwind (0.9% a mph: 10 mph costs a driver 9%) and gained from a tailwind (half of that) */
export const WIND_K = { cross: 0.006, head: 0.009, tail: 0.0045 } as const;
/** the carry factor stays inside this range whatever the wind */
const CARRY_RANGE = [0.55, 1.3] as const;

/** a 32-bit mixing step (a murmur-style finaliser) */
function mix(h: number, v: number): number { h = Math.imul(h ^ (v >>> 0), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; }
/** a float in [0, 1) for (seed, a, b): the same on every machine */
function unit(seed: number, a: number, b: number): number { return mix(mix(mix(0x57494e44, seed), a), b) / 4294967296; }
const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** the day's wind for a map seed and a town day: mostly light (3 to 12 mph), now and then a blustery day (up to 24 mph) and now and then a calm one; the
 *  prevailing wind is from the west (six days in ten from the west's quarter), the rest from anywhere */
export function dailyWind(seed: number, day: number): Wind {
  const u = (k: number) => unit(seed, day, k), s = u(1), blow = u(2) < 0.1;
  // the owner, 2026-11-14: "wind depends on the day. from 4mph to 30mph. same as normal golf games": a breezy 4-22 mph most days, a blowy one (1 in 10) up to 30
  const mph = Math.round((4 + 18 * s ** 1.4 + (blow ? 4 + 4 * u(3) : 0)) * 10) / 10;
  const from = u(4) < 0.6 ? 225 + 90 * u(5) : 360 * u(6);
  return { mph: Math.min(DAY_WIND_MAX, mph), from: Math.round(from) % 360, gusty: Math.round(1000 * Math.min(1, 0.15 + 0.85 * u(7) ** 1.3)) / 1000, seed: Math.floor(u(8) * 2147483647) };
}

/** the gust at time t (seconds, any clock): 0 in a lull .. 1 at the top of a gust; three slow waves (7, 13 and 23 s) of the wind's own phases, sharpened so
 *  gusts are short peaks between longer easy spells. Smooth: no jumps, so the flags and the trees never snap */
export function gustAt(w: Pick<Wind, 'seed'>, t: number): number {
  const p1 = unit(w.seed, 1, 1) * TAU, p2 = unit(w.seed, 2, 1) * TAU, p3 = unit(w.seed, 3, 1) * TAU;
  const g = 0.5 + 0.5 * (0.5 * Math.sin(TAU * t / 7 + p1) + 0.3 * Math.sin(TAU * t / 13 + p2) + 0.2 * Math.sin(TAU * t / 23 + p3));
  return clamp(g, 0, 1) ** 2.2;
}

/** the wind at time t (seconds): the mean speed pulled down in a lull and up in a gust by the day's gustiness, the direction wobbling by up to 12 degrees
 *  on a gusty day. Calm stays calm (a wind of 0 is 0 whenever) */
export function windAt(w: Wind, t: number): WindNow {
  if (w.mph <= 0) return { mph: 0, from: w.from };
  const g = gustAt(w, t), g0 = clamp(w.gusty, 0, 1);
  const mph = w.mph * (1 - 0.4 * g0 + 1.1 * g0 * g);
  const wob = 12 * g0 * Math.sin(TAU * t / 17 + unit(w.seed, 4, 1) * TAU);
  return { mph: Math.round(mph * 10) / 10, from: ((w.from + wob) % 360 + 360) % 360 };
}

/** the wind as a unit vector in the tile frame, the way it blows TOWARD: from the north (0) it blows to the south, tile (1, 1), from the west (270) to the
 *  east, tile (1, -1); the tile x axis runs down the screen's right, y down its left, so north is the screen's top (tile (-1, -1)) */
export function windToward(from: number): { x: number; y: number } {
  const f = from * Math.PI / 180;
  return { x: (Math.cos(f) - Math.sin(f)) * Math.SQRT1_2, y: (Math.cos(f) + Math.sin(f)) * Math.SQRT1_2 };
}

/** the wind on a shot that flies along the unit vector (ux, uy): the part with the ball (+ a tailwind, - a headwind) and the part across it (+ pushes it right as
 *  the golfer faces the shot, - left), both in mph */
export function windOnShot(n: WindNow | null | undefined, ux: number, uy: number): { tail: number; cross: number } {
  if (!n || !(n.mph > 0)) return { tail: 0, cross: 0 };
  const t = windToward(n.from);
  return { tail: n.mph * (t.x * ux + t.y * uy), cross: n.mph * (t.x * -uy + t.y * ux) };
}

/** what a wind does to one shot (see the file's head): `carry` is the factor on the carry, `drift` the sideways metres per metre of carry (+ right), `tail` and
 *  `cross` the wind's parts (mph), `exposure` how much of it the shot catches. `flight` is the shot's height multiplier (1; a high shot 1.3, a low one 0.6) */
export interface WindEffect { carry: number; drift: number; tail: number; cross: number; exposure: number }
export const NO_EFFECT: Readonly<WindEffect> = { carry: 1, drift: 0, tail: 0, cross: 0, exposure: 0 };
export function windEffect(n: WindNow | null | undefined, club: Club, ux: number, uy: number, flight = 1): WindEffect {
  const exposure = WIND_CLUB[club] * Math.max(0, flight);
  if (!n || !(n.mph > 0) || exposure <= 0) return { ...NO_EFFECT, exposure };
  const { tail, cross } = windOnShot(n, ux, uy);
  const carry = clamp(1 + (tail >= 0 ? WIND_K.tail : WIND_K.head) * exposure * tail, CARRY_RANGE[0], CARRY_RANGE[1]);
  return { carry, drift: WIND_K.cross * exposure * cross, tail, cross, exposure };
}

/** a wind as a save keeps it, or null when it is not one (numbers clamped: the speed to 0..WIND_MAX, the bearing to 0..360, the gusts to 0..1) */
export function readWind(v: unknown): Wind | null {
  const o = v as Partial<Wind> | null;
  if (!o || typeof o !== 'object' || ![o.mph, o.from, o.gusty, o.seed].every(n => typeof n === 'number' && Number.isFinite(n))) return null;
  return { mph: clamp(o.mph!, 0, WIND_MAX), from: ((o.from! % 360) + 360) % 360, gusty: clamp(o.gusty!, 0, 1), seed: Math.floor(o.seed!) };
}
/** a wind at an instant as a saved input keeps it, or null */
export function readWindNow(v: unknown): WindNow | null {
  const o = v as Partial<WindNow> | null;
  if (!o || typeof o !== 'object' || ![o.mph, o.from].every(n => typeof n === 'number' && Number.isFinite(n))) return null;
  return { mph: clamp(o.mph!, 0, WIND_MAX), from: ((o.from! % 360) + 360) % 360 };
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
/** the compass point of a bearing: "W" for 270 */
export const compassOf = (deg: number): string => POINTS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]!;
/** the wind as the player reads it: "Calm", or "12 mph from the W" (mph rounded) */
export function windText(n: WindNow): string { return n.mph < CALM_MPH ? 'Calm' : `${Math.round(n.mph)} mph from the ${compassOf(n.from)}`; }
/** the wind against a shot as the player reads it: "Calm", "Into the wind", "Helping", "Left to right", "Right to left", or a mix ("Into the wind, left to right") */
export function windRelText(e: Pick<WindEffect, 'tail' | 'cross'>, mph: number): string {
  if (mph < CALM_MPH) return 'Calm';
  const a = Math.abs(e.tail), c = Math.abs(e.cross), head = e.tail < 0 ? 'Into the wind' : 'Helping', side = e.cross > 0 ? 'left to right' : 'right to left';
  if (a >= 1.7 * c) return head;
  if (c >= 1.7 * a) return side[0]!.toUpperCase() + side.slice(1);
  return `${head}, ${side}`;
}
