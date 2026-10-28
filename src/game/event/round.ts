// The event round's state machine (Phase 5 step 2b): free, build (wall-clock s, the stadium goes up), surge (sim s, the crowd comes to
// kick-off, the clock frozen), eval (the result waits to be closed, and the draft of cards is open until one is picked), then free again
// with one more run (a perfect run raises the level). Pure TS, no DOM.
import { BUILD_S, CARDS, DRAFT, PERFECT_RATE, SURGE_SEED, SURGE_S, type CardId } from './config';
import type { SurgeView, TownResult } from './surge';
import { mulberry } from '../iso';

/** the round's stage: free (no round), build, surge (kick-off to come), eval (the result is in last, to be closed) */
export type Stage = 'free' | 'build' | 'surge' | 'eval';
/** a bottleneck at kick-off (see City.report): its label, its place (tiles) and the vehicle-seconds it lost */
export interface Stuck { label: string; x: number; y: number; loss: number }
/** a round's result: its level, its run (the 1-based number of the round), the cars sent, arrived (the fans at the doors at kick-off: see City.kickOff), the arrival rate (arrived / (sent * PARTY)),
 *  the road and signal upkeep and loan interest paid while it ran, $, the tolls taken while it ran, $ (absent when none), the parking fees paid while it ran, $ (classic mode, City.parkFee; absent when none; books only, not in the net), the stadium's tickets, $ (a ticket per fan at the doors at kick-off, see ticketPrice; absent when none),
 *  the payout (signed, $: see config payout), the net (toll + tickets + payout - upkeep, $),
 *  the previous run's rate at the same stadium level (null: none), the top bottlenecks at kick-off, whether it was perfect (rate >= PERFECT_RATE), and each town's counts at kick-off (see TownResult) */
export interface RoundResult { level: number; run: number; sent: number; arrived: number; /** golf, going home (LEAD.md M2.3): the parked cars, how many have left their car park, when the leaving started and the last car left (sim s) */ leave?: { cars: number; gone: number; start: number; last: number; /** the 95th percentile of the cars' exit waits so far (party back at the bay to the car out of its car park, sim s = game minutes; LEAD.md M2.4) */ p95?: number }; /** golf, the course's gates at kick-off (LEAD.md M2.1): fans admitted, the mean and longest wait at a gate (sim s = game minutes), the fans still queuing, the fans admitted after waiting over the on-time grace (M2.4) */ gates?: { admitted: number; avgWait: number; maxWait: number; queuing: number; late?: number }; rate: number; upkeep: number; toll?: number; parking?: number; tickets?: number; payout: number; net: number; prevRate: number | null; stuck: Stuck[]; perfect: boolean; byTown: TownResult[] }
/** the game's first year: run 0 is START_YEAR (the calendar; the year is derived from the runs, so nothing new is saved) */
export const START_YEAR = 1985;
/** the year each signal tier opens (index = the tier: 0 fixed-time, 1 actuated, 2 adaptive) */
export const SIGNAL_TIER_YEAR = [1985, 1990, 2000];
/** the best signal tier open in year: the last tier whose year has come (before the first: 0) */
export function signalTierOpen(year: number): 0 | 1 | 2 { return Math.max(0, SIGNAL_TIER_YEAR.filter(y => year >= y).length - 1) as 0 | 1 | 2; }
/** the years the speed-limit tiers open (index = tier: +0, +20, +40, +60 km/h on every road; see network SPEED_BONUS_KMH) */
export const SPEED_TIER_YEAR = [1985, 1990, 1995, 2000];
/** the highest speed-limit tier open in year */
export function speedTierOpen(year: number): 0 | 1 | 2 | 3 { return Math.max(0, SPEED_TIER_YEAR.filter(y => year >= y).length - 1) as 0 | 1 | 2 | 3; }

/** the round as the UI sees it: its stage, level, runs, the year (START_YEAR + runs), the build and surge left (s), the crowd by town (cars), the upkeep
 *  paid so far this round ($), the tolls taken so far this round ($), the parking fees so far this round ($, absent in old saves), the last result, the surge's counts by town (while it runs or its result is in;
 *  null otherwise), the player level (xp), the cards taken (in order), and the draft open now (null: none) */
export interface RoundView { stage: Stage; level: number; runs: number; year: number; buildLeft: number; surgeLeft: number; crowd: number[]; upkeep: number; toll: number; parking?: number; last: RoundResult | null; surge: SurgeView | null; xp: number; cards: CardId[]; draft: CardId[] | null }
/** the round as saved (the view, without the surge and the year: a save restores the surge only as far as the round goes) */
export type RoundSave = Omit<RoundView, 'surge' | 'year'>;

/** the draft offered at kick-off: DRAFT distinct cards (fewer when the pool has fewer), drawn by a seeded stream (SURGE_SEED + 1000 * xp + runs)
 *  from the pool: every upgrade, and each unlock not yet taken; null when the pool is empty */
import { golfDraftFor } from '../golf/golfcards';
export function draftFor(xp: number, runs: number, taken: CardId[], golf = false): CardId[] | null {
  if (golf) return golfDraftFor(xp, runs, taken);
  const pool: CardId[] = CARDS.filter(c => c.kind === 'upgrade' || !taken.includes(c.id)).map(c => c.id);
  const rnd = mulberry(SURGE_SEED + 1000 * xp + runs), out: CardId[] = [];
  while (out.length < DRAFT && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]!);
  return out.length ? out : null;
}
/** a result as an old save has it (before the event's money: no payout, the net from its toll and upkeep, no previous rate or bottlenecks) */
function full(l: Omit<RoundResult, 'payout' | 'net' | 'prevRate' | 'stuck' | 'perfect'> & Partial<Pick<RoundResult, 'payout' | 'net' | 'prevRate' | 'stuck' | 'perfect'>>): RoundResult {
  return { payout: 0, net: (l.toll ?? 0) - l.upkeep, prevRate: null, stuck: [], perfect: l.rate >= PERFECT_RATE, ...l };
}

/** a city's event round: the stage and its clocks, the crowd, the upkeep paid this round, the last result, and the player's cards */
export class Round {
  /** the stage (see Stage) */
  stage: Stage = 'free';
  /** the round's level (the crowd grows with it) and the rounds closed so far */
  level = 1; runs = 0;
  /** the build's wall-clock s left, and the surge's sim s left */
  buildLeft = 0; surgeLeft = 0;
  /** the cars each town sends this round (see crowdFor), and the upkeep paid this round, $ */
  crowd: number[] = []; upkeep = 0;
  /** the tolls taken this round, $ (the toll booths; the round's build and surge, as its upkeep), and the parking fees paid this round, $ (City.parkFee
   *  per car parked; the same stages) */
  toll = 0; parking = 0;
  /** the last round's result (null until one is in eval) */
  last: RoundResult | null = null;
  /** the player level (starts at 1: each card taken raises it by one), the cards taken (in order: an unlock once, an upgrade again), and the draft
   *  open at kick-off (null: none; close needs it picked) */
  xp = 1; cards: CardId[] = []; draft: CardId[] | null = null; golf = false;

  /** starts a round with the crowd (free to build): the build lasts BUILD_S; false if a round is not free */
  start(crowd: number[]): boolean {
    if (this.stage !== 'free') return false;
    this.stage = 'build'; this.buildLeft = BUILD_S; this.upkeep = 0; this.toll = 0; this.parking = 0; this.crowd = crowd;
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
  /** dt sim s of the surge: true when kick-off comes (the eval begins, the result is last, and the draft is open); only in surge */
  sim(dt: number): boolean {
    if (this.stage !== 'surge') return false;
    this.surgeLeft -= dt;
    if (this.surgeLeft > 0) return false;
    this.surgeLeft = 0; this.stage = 'eval';
    let sent = 0; for (const c of this.crowd) sent += c;
    const prev = this.last;
    this.last = { level: this.level, run: this.runs + 1, sent, arrived: 0, rate: 0, upkeep: this.upkeep, ...(this.toll ? { toll: this.toll } : {}), ...(this.parking ? { parking: this.parking } : {}), payout: 0, net: 0,
      prevRate: prev && prev.level === this.level ? prev.rate : null, stuck: [], perfect: false, byTown: [] };
    this.draft = draftFor(this.xp, this.runs, this.cards, this.golf);
    return true;
  }
  /** the player takes a card of the open draft (eval only): it joins cards, xp goes up by one and the draft closes; false otherwise */
  pick(id: CardId): boolean {
    if (this.stage !== 'eval' || !this.draft?.includes(id)) return false;
    this.cards.push(id); this.xp++; this.draft = null;
    return true;
  }
  /** closes the eval: the round is free again and one more run is counted; a perfect run raises the level. Refused (false) while the draft is open,
   *  and unless in eval */
  close(): boolean {
    if (this.stage !== 'eval' || this.draft) return false;
    this.stage = 'free'; this.runs++;
    if (this.last?.perfect) this.level++;
    return true;
  }
  /** the round as the UI and the save see it */
  view(): RoundView {
    return { stage: this.stage, level: this.level, runs: this.runs, year: START_YEAR + this.runs, buildLeft: this.buildLeft, surgeLeft: this.surgeLeft, crowd: this.crowd, upkeep: this.upkeep, toll: this.toll, parking: this.parking, last: this.last, surge: null, xp: this.xp, cards: this.cards, draft: this.draft };
  }
  /** a round from a save: a build or surge saved mid-way restores as free (its crowd and upkeep dropped), keeping the level, the runs, the cards, the xp
   *  and the last result; an eval or a free round keeps its crowd, upkeep and draft too; no save: a fresh round (old saves: xp 1, no cards, no draft).
   *  live (T209: the tournament day resumes, see City.resumeDay): a surge comes back as a surge, with its sim s left to kick-off, its crowd, upkeep, tolls
   *  and parking (a build still restores as free) */
  static from(s?: RoundSave, live = false): Round {
    const r = new Round();
    if (!s) return r;
    r.level = s.level; r.runs = s.runs; r.last = s.last ? full(s.last) : null; r.xp = s.xp ?? 1; r.cards = s.cards ?? [];
    if (s.stage === 'build' || (s.stage === 'surge' && !live)) return r;
    r.stage = s.stage; r.crowd = s.crowd; r.upkeep = s.upkeep; r.toll = s.toll ?? 0; r.parking = s.parking ?? 0; r.draft = s.draft ?? null;
    if (s.stage === 'surge') r.surgeLeft = Math.max(0, s.surgeLeft);
    return r;
  }
}
