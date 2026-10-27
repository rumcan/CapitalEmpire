// The town day's clock (P02/T048): town minutes as a piecewise-linear function of the sim time, so the day can change speed (the tournament
// day runs at 1 game minute per sim second) and jump forward to a set hour, with the hour and the day count continuous. Pure TS.

/** a clock piece: from sim time t0 the town minute is m0 + (t - t0) × rate (m0 counts minutes from day 1 00:00; rate: town minutes per sim second) */
export interface TownClock { t0: number; m0: number; rate: number }

/** a clock that starts at sim time 0 at minute 0 with a day of dayLen sim seconds */
export function townClockFor(dayLen: number): TownClock { return { t0: 0, m0: 0, rate: 1440 / dayLen }; }

/** the town minute (cumulative) at sim time t */
export function townMinute(c: TownClock, t: number): number { return c.m0 + (t - c.t0) * c.rate; }

/** day (1-based), hour (0..23), minute (0..59, the whole minutes of the hour) and the minute of the day (0..1439.99) at sim time t */
export function townTimeOf(c: TownClock, t: number): { day: number; hour: number; minute: number; dayMin: number } {
  const m = townMinute(c, t), d = Math.floor(m / 1440), dayMin = m - d * 1440, mi = Math.floor(dayMin);
  return { day: d + 1, hour: Math.floor(mi / 60), minute: mi % 60, dayMin };
}

/** the clock from sim time t on at a new rate, continuing from the minute it reads at t (no jump) */
export function retime(c: TownClock, t: number, rate: number): TownClock { return { t0: t, m0: townMinute(c, t), rate }; }

/** the clock from sim time t on at a new rate, jumping FORWARD to the next minute-of-day `at` (today's if it is still ahead, else tomorrow's) */
export function jumpTo(c: TownClock, t: number, at: number, rate: number): TownClock {
  const m = townMinute(c, t), dm = m - Math.floor(m / 1440) * 1440;
  return { t0: t, m0: at > dm ? m - dm + at : m - dm + 1440 + at, rate };
}

/** the sim time at which the clock reads town minute m (the inverse of townMinute on this piece; a stopped clock gives its t0). A town
 *  hour's trips leave at sim times, so their times go through this (LotTrips, T098: town minutes are not sim seconds) */
export function simTimeAt(c: TownClock, m: number): number { return c.rate > 0 ? c.t0 + (m - c.m0) / c.rate : c.t0; }

/** the town hour index (cumulative hours) at sim time t */
export function townHourIndex(c: TownClock, t: number): number { return Math.floor(townMinute(c, t) / 60); }
