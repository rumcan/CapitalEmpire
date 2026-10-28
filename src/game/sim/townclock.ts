// The town day's clock (P02/T048): town minutes as a piecewise-linear function of the sim time, so the day can change speed (the tournament
// day runs at 1 game minute per sim second) and jump forward to a set hour, with the hour and the day count continuous. Pure TS.
// T266 (#800): a clock may carry a day/night profile (DayProfile): the golf hours run slower than the day's mean rate and the night faster, the
// day keeping its length in sim seconds; every function here reads it, so whatever goes through them (the trips' times, the night, the hour) follows.

/** T266: a day/night profile: the minutes of the day from a to b (0 <= a < b < 1440) take k times the sim time a minute of the flat clock takes
 *  (k > 1: slower), the other minutes j = (1440 - k (b - a)) / (1440 - (b - a)) times (faster), so a day lasts as long as the flat clock's */
export interface DayProfile { a: number; b: number; k: number }

/** a clock piece: from sim time t0 the town minute is m0 + (t - t0) × rate (m0 counts minutes from day 1 00:00; rate: town minutes per sim second).
 *  T266: with prof, rate is the day's mean rate and the minutes run through the profile (see townMinute) */
export interface TownClock { t0: number; m0: number; rate: number; prof?: DayProfile | null }

/** a clock that starts at sim time 0 at minute 0 with a day of dayLen sim seconds */
export function townClockFor(dayLen: number): TownClock { return { t0: 0, m0: 0, rate: 1440 / dayLen }; }

/** T266: the golf hours of the day/night clock (game minutes of the day): 06:00 to 20:00, the first car in to the last group's car out */
export const GOLF_HOURS_A = 360, GOLF_HOURS_B = 1200;
/** T266: the profile that runs the golf hours [a, b) at `day` town minutes a sim second on a day of mean rate `rate` (null: the day is already that
 *  slow, so the flat clock). k stays below 0.95 of its limit, so the night keeps a twentieth of its flat length at least */
export function profileFor(rate: number, day: number, a = GOLF_HOURS_A, b = GOLF_HOURS_B): DayProfile | null {
  const D = b - a, k = Math.min(rate / day, 0.95 * 1440 / D);
  return k > 1 + 1e-9 && D > 0 && D < 1440 ? { a, b, k } : null;
}
/** the profile's night factor j (see DayProfile) */
const nightK = (p: DayProfile): number => (1440 - p.k * (p.b - p.a)) / (1440 - (p.b - p.a));
/** the flat clock's minute that takes as much sim time from day 1 00:00 as cumulative town minute m does on profile p (monotonic, w(m + 1440) =
 *  w(m) + 1440) */
function warp(p: DayProfile, m: number): number {
  const d = Math.floor(m / 1440), x = m - d * 1440, j = nightK(p);
  return d * 1440 + (x < p.a ? x * j : x < p.b ? p.a * j + (x - p.a) * p.k : p.a * j + (p.b - p.a) * p.k + (x - p.b) * j);
}
/** the inverse of warp */
function unwarp(p: DayProfile, u: number): number {
  const d = Math.floor(u / 1440), y = u - d * 1440, j = nightK(p), A = p.a * j, B = A + (p.b - p.a) * p.k;
  return d * 1440 + (y < A ? y / j : y < B ? p.a + (y - A) / p.k : p.b + (y - B) / j);
}

/** the town minute (cumulative) at sim time t */
export function townMinute(c: TownClock, t: number): number {
  const p = c.prof; return p ? unwarp(p, warp(p, c.m0) + (t - c.t0) * c.rate) : c.m0 + (t - c.t0) * c.rate;
}

/** T266: the clock's rate at sim time t, town minutes a sim second (the rate itself on a flat clock) */
export function localRate(c: TownClock, t: number): number {
  const p = c.prof; if (!p) return c.rate;
  const m = townMinute(c, t), x = m - Math.floor(m / 1440) * 1440;
  return c.rate / (x >= p.a && x < p.b ? p.k : nightK(p));
}

/** day (1-based), hour (0..23), minute (0..59, the whole minutes of the hour) and the minute of the day (0..1439.99) at sim time t */
export function townTimeOf(c: TownClock, t: number): { day: number; hour: number; minute: number; dayMin: number } {
  const m = townMinute(c, t), d = Math.floor(m / 1440), dayMin = m - d * 1440, mi = Math.floor(dayMin);
  return { day: d + 1, hour: Math.floor(mi / 60), minute: mi % 60, dayMin };
}

/** the clock from sim time t on at a new rate, continuing from the minute it reads at t (no jump); T266: with the profile prof (the clock's own by
 *  default; null: flat) */
export function retime(c: TownClock, t: number, rate: number, prof: DayProfile | null | undefined = c.prof): TownClock {
  const r: TownClock = { t0: t, m0: townMinute(c, t), rate }; if (prof) r.prof = prof; return r;
}

/** the clock from sim time t on at a new rate, jumping FORWARD to the next minute-of-day `at` (today's if it is still ahead, else tomorrow's);
 *  T266: with the profile prof (the clock's own by default; null: flat) */
export function jumpTo(c: TownClock, t: number, at: number, rate: number, prof: DayProfile | null | undefined = c.prof): TownClock {
  const m = townMinute(c, t), dm = m - Math.floor(m / 1440) * 1440;
  const r: TownClock = { t0: t, m0: at > dm ? m - dm + at : m - dm + 1440 + at, rate }; if (prof) r.prof = prof; return r;
}

/** the sim time at which the clock reads town minute m (the inverse of townMinute on this piece; a stopped clock gives its t0). A town
 *  hour's trips leave at sim times, so their times go through this (LotTrips, T098: town minutes are not sim seconds) */
export function simTimeAt(c: TownClock, m: number): number {
  if (!(c.rate > 0)) return c.t0;
  const p = c.prof; return c.t0 + (p ? warp(p, m) - warp(p, c.m0) : m - c.m0) / c.rate;
}

/** the town hour index (cumulative hours) at sim time t */
export function townHourIndex(c: TownClock, t: number): number { return Math.floor(townMinute(c, t) / 60); }
