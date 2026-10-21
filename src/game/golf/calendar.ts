// The golf year and a tournament day's timeline (docs/GOLF-PLAN.md sections 2 and 5.5): the months of the year, the day's clock marks, and
// how the spectators arrive through the gates and leave the gates over the day. One sim s is one game minute (0..1440 for a day, see
// EVENT_CLOCK in event/config.ts). Pure TS, no DOM.
import { START_YEAR } from '../event/round';

/** the month names, Jan..Dec */
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
/** the clock units per month: one game day is one year, so twelve months of 120 units each */
export const MONTH_LEN = 120;

/** the month (0..11) of a clock value, clamped to the year */
export function monthOf(clock: number): number { return Math.min(11, Math.max(0, Math.floor(clock / MONTH_LEN))); }
/** the month's name of a clock value (see monthOf) */
export function monthName(clock: number): string { return MONTH_NAMES[monthOf(clock)]; }
/** the calendar year of a run: START_YEAR plus the runs so far */
export function yearOf(runs: number): number { return START_YEAR + runs; }

/** the staff and volunteers arrive (05:30, tier 3+) */
export const STAFF_IN = 330;
/** the shuttles start (06:30, 30 minutes before the gates) */
export const SHUTTLES_START = 390;
/** the gates open (07:00) */
export const GATES_OPEN = 420;
/** the first tee time (07:30) */
export const FIRST_TEE = 450;
/** the last tee time (13:30) */
export const LAST_TEE = 810;
/** the play ends (18:30) */
export const PLAY_END = 1110;
/** the exit wave is over (19:30): the shuttles stop 30 minutes after the gates close */
export const EXIT_END = 1170;

/** the normal CDF's error function (Abramowitz and Stegun 7.1.26, error below 1.5e-7) */
function erf(x: number): number {
  const s = x < 0 ? -1 : 1, a = Math.abs(x), t = 1 / (1 + 0.3275911 * a);
  return s * (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a));
}
/** the standard normal CDF at z */
function phi(z: number): number { return 0.5 * (1 + erf(z / Math.SQRT2)); }
/** a normal(mean, sd) curve's share between a and b, at t: 0 at or before a, 1 at or after b, a smooth S-curve in between (the normal CDF rescaled to a..b) */
function bellShare(t: number, a: number, b: number, mean: number, sd: number): number {
  if (t <= a) return 0;
  if (t >= b) return 1;
  const lo = phi((a - mean) / sd), hi = phi((b - mean) / sd);
  return (phi((t - mean) / sd) - lo) / (hi - lo);
}

/** the cumulative share of a day's spectators through the gates by clock t: 0 before GATES_OPEN, 1 at 780 (13:00) and after. A normal bell
 *  (mean 600 = 10:00, sd 60) rescaled to GATES_OPEN..780, so the densest part is about 540–660 (the arrival peak 09:00–11:00) */
export function arrivalShare(t: number): number { return bellShare(t, GATES_OPEN, 780, 600, 60); }

/** the cumulative share of a day's spectators who have left the gates by clock t: 0 before 600 (10:00). 10% leaves linearly over 600–1020
 *  (the early leavers), then the other 90% over 1020–EXIT_END as a normal bell (mean 1095 = 18:15, sd 30) rescaled to that span, so most of it
 *  leaves in 1050–1140. 1 at EXIT_END and after */
export function exitShare(t: number): number {
  if (t <= 600) return 0;
  if (t < 1020) return 0.1 * (t - 600) / 420;
  return 0.1 + 0.9 * bellShare(t, 1020, EXIT_END, 1095, 30);
}
