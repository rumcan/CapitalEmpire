// The golf venue's gates, toilets and viewing (GOLF-PLAN section 5.3): the entrance gate lanes and their queue by minute (a deterministic FIFO),
// the cubicles a crowd needs, and the viewing space at the featured holes. Pure TS, no DOM.

/** spectators a gate lane admits an hour (scan and bag check) */
export const GATE_LANE_PER_HOUR = 600;
/** the "Express gates" card: the lanes admit this many times their rate */
export const EXPRESS_GATES = 1.5;

/** spectators a minute the gates admit: lanes x the lane rate, times EXPRESS_GATES with the card */
export function gateRate(lanes: number, express: boolean): number { return lanes * GATE_LANE_PER_HOUR / 60 * (express ? EXPRESS_GATES : 1); }

/** the gates' queue: spectators waiting at the end of each minute, the longest and the arrival-weighted average wait (minutes) */
export interface GateQueue { queue: number[]; maxWaitMin: number; avgWaitMin: number }

/** a deterministic FIFO by minute: arrivals join the queue, up to gateRate leave each minute; an arrival waits queue / rate (minutes) once
 *  joined; avgWaitMin weights each minute's wait by its arrivals */
export function gateQueue(arrivalsPerMinute: number[], lanes: number, express: boolean): GateQueue {
  const rate = gateRate(lanes, express);
  const queue: number[] = [];
  let q = 0, maxWaitMin = 0, sumWait = 0, sumArrivals = 0;
  for (const a of arrivalsPerMinute) {
    q += a;
    if (a > 0) {
      const wait = rate > 0 ? q / rate : Infinity;
      maxWaitMin = Math.max(maxWaitMin, wait); sumWait += a * wait; sumArrivals += a;
    }
    q = Math.max(0, q - rate);
    queue.push(q);
  }
  return { queue, maxWaitMin, avgWaitMin: sumArrivals > 0 ? sumWait / sumArrivals : 0 };
}

/** the toilet cubicles a crowd needs: one per 120 spectators (a common event guideline is one per 100 to 150) */
export function toiletsNeeded(spectators: number): number { return Math.ceil(spectators / 120); }

/** the share of the toilet need the cubicles meet (1 at most; 1 with no crowd) */
export function toiletScore(cubicles: number, spectators: number): number {
  const need = toiletsNeeded(spectators);
  return need > 0 ? Math.min(1, cubicles / need) : 1;
}

/** the viewing score at the featured holes: grandstand seats plus two spectators a metre of rope line, against 0.6 of the crowd (1 at most;
 *  1 with no crowd) */
export function viewingScore(o: { seats: number; ropeM: number; spectators: number }): number {
  if (o.spectators <= 0) return 1;
  return Math.min(1, (o.seats + 2 * o.ropeM) / (0.6 * o.spectators));
}
