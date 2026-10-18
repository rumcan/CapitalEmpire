// The event round's state machine (Phase 5 step 2b): free, build (wall-clock s, the stadium goes up), surge (sim s, the crowd comes to
// kick-off, the clock frozen), eval (the result waits to be closed), then free again with one more run. Pure TS, no DOM.
import { BUILD_S, SURGE_S } from './config';
import type { SurgeView, TownResult } from './surge';

/** the round's stage: free (no round), build, surge (kick-off to come), eval (the result is in last, to be closed) */
export type Stage = 'free' | 'build' | 'surge' | 'eval';
/** a round's result: its level, its run (the 1-based number of the round), the cars sent, arrived (the fans at the doors at kick-off: see City.kickOff), the arrival rate (arrived / (sent * PARTY)),
 *  the road and signal upkeep and loan interest paid while it ran, $, the tolls taken while it ran, $, and each town's counts at kick-off (see TownResult) */
export interface RoundResult { level: number; run: number; sent: number; arrived: number; rate: number; upkeep: number; toll?: number; byTown: TownResult[] }
/** the round as the UI sees it: its stage, level, runs, the build and surge left (s), the crowd by town (cars), the upkeep paid so far
 *  this round ($), the tolls taken so far this round ($), the last result, and the surge's counts by town (while it runs or its result is in; null otherwise) */
export interface RoundView { stage: Stage; level: number; runs: number; buildLeft: number; surgeLeft: number; crowd: number[]; upkeep: number; toll: number; last: RoundResult | null; surge: SurgeView | null }
/** the round as saved (the view, without the surge: a save restores the surge only as far as the round goes) */
export type RoundSave = Omit<RoundView, 'surge'>;

/** a city's event round: the stage and its clocks, the crowd, the upkeep paid this round and the last result */
export class Round {
  /** the stage (see Stage) */
  stage: Stage = 'free';
  /** the round's level (the crowd grows with it) and the rounds closed so far */
  level = 1; runs = 0;
  /** the build's wall-clock s left, and the surge's sim s left */
  buildLeft = 0; surgeLeft = 0;
  /** the cars each town sends this round (see crowdFor), and the upkeep paid this round, $ */
  crowd: number[] = []; upkeep = 0;
  /** the tolls taken this round, $ (the toll booths; the round's build and surge, as its upkeep) */
  toll = 0;
  /** the last round's result (null until one is in eval) */
  last: RoundResult | null = null;

  /** starts a round with the crowd (free to build): the build lasts BUILD_S; false if a round is not free */
  start(crowd: number[]): boolean {
    if (this.stage !== 'free') return false;
    this.stage = 'build'; this.buildLeft = BUILD_S; this.upkeep = 0; this.toll = 0; this.crowd = crowd;
    return true;
  }
  /** the build's wall-clock time: dt s off the build; true when it is done (the surge begins); only in build */
  wall(dt: number): boolean {
    if (this.stage !== 'build') return false;
    this.buildLeft -= dt;
    if (this.buildLeft > 0) return false;
    this.buildLeft = 0; this.beginSurge();
    return true;
  }
  /** ends the build now (the surge begins); false unless in build */
  startNow(): boolean {
    if (this.stage !== 'build') return false;
    this.buildLeft = 0; this.beginSurge();
    return true;
  }
  /** the surge begins: SURGE_S sim s to kick-off */
  beginSurge(): void { this.stage = 'surge'; this.surgeLeft = SURGE_S; }
  /** dt sim s of the surge: true when kick-off comes (the eval begins, and last is the result); only in surge */
  sim(dt: number): boolean {
    if (this.stage !== 'surge') return false;
    this.surgeLeft -= dt;
    if (this.surgeLeft > 0) return false;
    this.surgeLeft = 0; this.stage = 'eval';
    let sent = 0; for (const c of this.crowd) sent += c;
    this.last = { level: this.level, run: this.runs + 1, sent, arrived: 0, rate: 0, upkeep: this.upkeep, ...(this.toll ? { toll: this.toll } : {}), byTown: [] };
    return true;
  }
  /** closes the eval: the round is free again and one more run is counted; false unless in eval */
  close(): boolean {
    if (this.stage !== 'eval') return false;
    this.stage = 'free'; this.runs++;
    return true;
  }
  /** the round as the UI and the save see it */
  view(): RoundView {
    return { stage: this.stage, level: this.level, runs: this.runs, buildLeft: this.buildLeft, surgeLeft: this.surgeLeft, crowd: this.crowd, upkeep: this.upkeep, toll: this.toll, last: this.last, surge: null };
  }
  /** a round from a save: a build or surge saved mid-way restores as free (its crowd and upkeep dropped), keeping the level, the runs and
   *  the last result; an eval or a free round keeps its crowd and upkeep too; no save: a fresh round */
  static from(s?: RoundSave): Round {
    const r = new Round();
    if (!s) return r;
    r.level = s.level; r.runs = s.runs; r.last = s.last;
    if (s.stage === 'build' || s.stage === 'surge') return r;
    r.stage = s.stage; r.crowd = s.crowd; r.upkeep = s.upkeep; r.toll = s.toll ?? 0;
    return r;
  }
}
