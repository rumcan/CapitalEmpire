// The tournament day's timeline (P02/T049): one town day at 1 game minute per sim second from 05:00. When the fans want to arrive and leave,
// when they set off, and who is late. Pure TS, no DOM. Times are minutes of the day (0..1440); 1 sim s = 1 minute on the tournament day.
import {
  GATES_OPEN,
  FIRST_TEE,
  PLAY_END,
  EXIT_END,
  arrivalShare,
  exitShare,
} from './calendar';
import { ON_TIME_GRACE_MIN } from './tournamentday';
import { mulberry } from '../iso';

/** the minute the tournament day starts (05:00) and its length in sim seconds (one minute each) */
export const DAY_START_MIN = 300;
export const TOURNEY_DAY_S = 1440;
/** a fan admitted after this minute is late (the first tee time plus the grace) */
export const LATE_AFTER_MIN = FIRST_TEE + ON_TIME_GRACE_MIN;
/** the latest the day may run before the town day takes over again (22:00), even with cars still out */
export const DAY_END_CAP_MIN = 1320;

/** the minute of the day at sim time s, for a tournament day that started (05:00) at sim time t0 */
export function minuteAt(s: number, t0: number): number {
  return DAY_START_MIN + (s - t0);
}

/** the sim time of minute m of the tournament day that started at t0 */
export function simAt(m: number, t0: number): number {
  return t0 + (m - DAY_START_MIN);
}

/** the minute by which share u (0..1) of the day's fans have arrived: the inverse of arrivalShare (bisection to 0.01 min) */
export function arrivalMinute(u: number): number {
  const target = Math.max(0, Math.min(1, u));
  if (target <= 0) return 420;
  if (target >= 1) return 780;
  let lo = 420, hi = 780;
  while (hi - lo > 0.005) {
    const mid = (lo + hi) / 2;
    if (arrivalShare(mid) < target) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

/** the minute by which share u of the fans have left: the inverse of exitShare (u = 0 gives 600, the first leavers) */
export function leaveMinute(u: number): number {
  const target = Math.max(0, Math.min(1, u));
  if (target <= 0) return 600;
  if (target >= 1) return EXIT_END;
  let lo = 600, hi = EXIT_END;
  while (hi - lo > 0.005) {
    const mid = (lo + hi) / 2;
    if (exitShare(mid) < target) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

/** n wanted arrival minutes, sorted: the quantiles (k + 0.5) / n of the arrival curve, each nudged by up to ±half a quantile step with mulberry(seed) (deterministic) */
export function wantedArrivals(n: number, seed: number): number[] {
  if (n <= 0) return [];
  const rng = mulberry(seed);
  const step = 1 / n;
  const out: number[] = new Array(n);
  for (let k = 0; k < n; k++) {
    const u0 = (k + 0.5) * step;
    const nudge = (rng() - 0.5) * step;
    const u = Math.max(0, Math.min(1, u0 + nudge));
    out[k] = arrivalMinute(u);
  }
  out.sort((a, b) => a - b);
  return out;
}

/** n wanted leave minutes, sorted, the same way on the exit curve */
export function wantedLeaves(n: number, seed: number): number[] {
  if (n <= 0) return [];
  const rng = mulberry(seed);
  const step = 1 / n;
  const out: number[] = new Array(n);
  for (let k = 0; k < n; k++) {
    const u0 = (k + 0.5) * step;
    const nudge = (rng() - 0.5) * step;
    const u = Math.max(0, Math.min(1, u0 + nudge));
    out[k] = leaveMinute(u);
  }
  out.sort((a, b) => a - b);
  return out;
}

/** the minute a party sets off: its wanted arrival minus its travel (sim seconds = minutes), never before DAY_START_MIN */
export function departMinute(arrive: number, travelS: number): number {
  return Math.max(DAY_START_MIN, arrive - travelS);
}

/** a travel estimate in sim seconds: a road distance (tiles of 2 m) at a speed (m per sim s; the town's cars average about 9) plus the walk from the bay to the gate (m, at walkV m per sim s) */
export function travelEstimate(roadTiles: number, carV = 9, walkM = 0, walkV = 1.4): number {
  const cV = carV > 0 ? carV : 1;
  const wV = walkV > 0 ? walkV : 1;
  return (roadTiles * 2) / cV + walkM / wV;
}

/** whether a fan admitted at minute m is late */
export function isLate(m: number): boolean {
  return m > LATE_AFTER_MIN;
}

/** the gates admit nobody before GATES_OPEN: the minute an early arriver is admitted at the earliest */
export function gateOpenFrom(m: number): number {
  return Math.max(m, GATES_OPEN);
}

/** which hole (1..holes) the featured group is playing at minute m: none (0) before FIRST_TEE or after PLAY_END; else it moves through the holes evenly from FIRST_TEE to PLAY_END */
export function featuredHole(m: number, holes: number): number {
  if (holes <= 0 || m < FIRST_TEE || m >= PLAY_END) return 0;
  const holeDuration = (PLAY_END - FIRST_TEE) / holes;
  const idx = Math.floor((m - FIRST_TEE) / holeDuration);
  return Math.min(holes, 1 + idx);
}
