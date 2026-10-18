// Before and after a change (Phase 4 step 3d): the snapshots the city takes at each game hour, the windows between two of them
// (a rush window, or the last two game hours), and the comparison of two windows. Pure TS, no DOM; the city keeps the hours (City.hours).
import { FREE } from './sim/sim';

/** a game hour's snapshot, taken at its start: h is the absolute game hour (sim s / 60). lost, arrived, ratioSum, ratioN, abandoned and builds are
 *  cumulative since the sim started (or the terrain, for builds); pop and built are the town's at that moment */
export interface HourStat { h: number /* absolute game hour at its start */; lost: number; arrived: number; ratioSum: number; ratioN: number; abandoned: number; builds: number; pop: number; built: number }
/** the rush windows of a day, hours of the day: from the start of the first hour to the start of the second */
export const RUSHES: [number, number][] = [[7, 9], [16, 18]];
/** how far back lastRush looks, game hours */
const SEARCH_H = 48;

/** a window between the snapshots h0 and h1 (absolute game hours), rush or not, and what changed over it: time lost per trip (s), trips completed,
 *  the mean trip time over free flow (0 with no trips), trips abandoned, lots started, and the change of the residents */
export interface Window { h0: number; h1: number; rush: boolean; lostPerTrip: number /* s */; trips: number; ratio: number /* mean trip time over free flow: (ratioSum diff / ratioN diff) / FREE, 0 if no trips */; abandoned: number; builds: number; popChange: number }

/** the snapshot of absolute hour h, or undefined */
const snapAt = (hours: HourStat[], h: number) => hours.find(s => s.h === h);

/** the window from snapshot h0 to snapshot h1 (both must be in hours), or null */
export function windowOf(hours: HourStat[], h0: number, h1: number, rush: boolean): Window | null {
  const a = snapAt(hours, h0), b = snapAt(hours, h1);
  if (!a || !b) return null;
  const trips = b.arrived - a.arrived, n = b.ratioN - a.ratioN;
  return { h0, h1, rush, lostPerTrip: (b.lost - a.lost) / Math.max(1, trips), trips, ratio: n > 0 ? (b.ratioSum - a.ratioSum) / n / FREE : 0, abandoned: b.abandoned - a.abandoned, builds: b.builds - a.builds, popChange: b.pop - a.pop };
}

/** the latest rush window that ends by beforeH (absolute game hours) and whose snapshots exist, searched back SEARCH_H hours; with no rush on record,
 *  the latest two complete game hours (rush false); null if neither is there */
export function lastRush(hours: HourStat[], beforeH: number): Window | null {
  for (let h1 = beforeH; h1 >= beforeH - SEARCH_H; h1--) {
    const hod = ((h1 % 24) + 24) % 24;
    for (const [a, b] of RUSHES) if (hod === b) { const w = windowOf(hours, h1 - (b - a), h1, true); if (w) return w; }
  }
  for (let h1 = beforeH; h1 >= beforeH - SEARCH_H; h1--) { const w = windowOf(hours, h1 - 2, h1, false); if (w) return w; }
  return null;
}

/** the first rush window that starts at or after afterH (absolute game hours): its start and end, absolute hours */
export function nextRush(afterH: number): [number, number] {
  for (let d = Math.floor(afterH / 24); ; d++) for (const [a, b] of RUSHES) if (d * 24 + a >= afterH) return [d * 24 + a, d * 24 + b];
}

/** one compared quantity: its name, the value before and after, the change in per cent of before, and whether after is the better */
export interface Delta { name: string; before: number; after: number; pct: number; better: boolean }

/** the five compared quantities of window a (after) against window b (before): time lost per trip, trips completed, trip time over free flow,
 *  trips abandoned and lots started; lower is better for the first, third and fourth */
export function compare(b: Window, a: Window): Delta[] {
  const row = (name: string, x: number, y: number, lowerBetter: boolean): Delta => ({ name, before: x, after: y, pct: (y - x) / Math.max(Math.abs(x), 1e-9) * 100, better: lowerBetter ? y < x : y > x });
  return [
    row('Time lost per trip', b.lostPerTrip, a.lostPerTrip, true),
    row('Trips completed', b.trips, a.trips, false),
    row('Trip time vs free flow', b.ratio, a.ratio, true),
    row('Trips abandoned', b.abandoned, a.abandoned, true),
    row('Lots started', b.builds, a.builds, false),
  ];
}
