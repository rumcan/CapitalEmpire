// The city's money: the treasury, the daily ledger (property tax, business takings and grants in; upkeep, signal upkeep, loan interest,
// construction and compensation out), loans, and bankruptcy after DEBT_DAYS days in the red. Pure TS, no DOM, runs in node.
import { LV } from './lots/town';
import { STRUCT_COST } from './structures';
import { CLASS, type ClassId } from './network';

/** the treasury of a new city, $ */
export const START_MONEY = 80000;
/** one loan unit, $: borrow adds it to the treasury, repay takes it back */
export const LOAN = 25000;
/** interest per loan unit per game day */
export const LOAN_RATE = 0.01;
/** days in the red in a row that bankrupt the city */
export const DEBT_DAYS = 5;
/** one game day, sim s (one sim second is one game minute) */
export const GAME_DAY = 1440;
/** property tax per day by use (index LU) and level (BUILT, UPGRADED), $ at frontage value 1 and access 1 */
export const PROPERTY: number[][] = [
  [0, 0], // NONE
  [12, 20], // RES
  [30, 50], // COM
  [24, 40], // IND
  [36, 60], // TOUR
  [0, 0], // GOV
];
/** land value by frontage class (unknown classes count as 1) */
export const CLASS_VALUE: Record<string, number> = { gravel: 0.7, lane: 0.9, street: 1, road: 1.1, avenue: 1.25, boulevard: 1.4 };
/** the share of the tax kept by decline (0 ok, 1 shabby, 2 boarded, 3 derelict) */
export const DECLINE_VALUE = [1, 0.7, 0.3, 0];
/** compensation paid when a lot is cleared, $ by use (index LU) and level (BUILDING, BUILT, UPGRADED) */
export const COMPENSATION: number[][] = [
  [0, 0, 0], // NONE
  [500, 2000, 3500], // RES
  [500, 5000, 8000], // COM
  [500, 4000, 6000], // IND
  [500, 6000, 10000], // TOUR
  [500, 8000, 8000], // GOV
];
/** $ per customer or worker who arrived at a non-RES lot, times their punctuality */
export const BUSINESS = 1.5;
/** upkeep per day: this share of the build cost per tile (1%: a road costs its price again in 100 days, so roads must earn their keep through the lots they serve) (times STRUCT_COST[kind] for bridges and tunnels) */
export const UPKEEP = 0.01;
/** signal upkeep per day by junction type (others 0), $ */
export const SIGNAL_UPKEEP: Record<string, number> = { signal: 20, slip: 40, roundabout: 10 };

/** the access ratio's value: 1 at free flow, 0.6 at 1.8, clamped to [0.25, 1] */
export function accessValue(a: number): number { return Math.min(1, Math.max(0.25, 1.5 - 0.5 * a)); }

/** a lot as the budget sees it */
export interface LotIn {
  /** the use (LU) */
  use: number;
  /** the level (LV) */
  level: number;
  /** the decline (0 ok .. 3 derelict) */
  decline: number;
  /** the frontage class */
  cls: string;
  /** the access ratio (1 = free flow) */
  access: number;
}
/** a stretch of road as the budget sees it */
export interface SegIn {
  /** the class */
  cls: string;
  /** the length, tiles */
  len: number;
  /** the structure kind (SK: ground, bridge, tunnel) */
  kind: number;
}
/** the day's trade: customers and workers who arrived at non-RES lots, and their punctuality sum */
export interface TradeIn {
  /** the arrivals */
  arrived: number;
  /** the sum of their punctuality */
  punctual: number;
}
/** what the day's ledger is made of */
export interface DayIn {
  /** the lots */
  lots: Iterable<LotIn>;
  /** the road stretches */
  segs: Iterable<SegIn>;
  /** the junction types */
  nodes: Iterable<string>;
  /** the day's trade */
  trade: TradeIn;
  /** the residents */
  pop: number;
}

/** a lot's property tax per day, $ (0 unless built): the use and level's rate times the frontage value, access and decline */
export function lotTax(l: LotIn): number {
  if (l.level < LV.BUILT) return 0;
  return PROPERTY[l.use]![l.level - LV.BUILT]! * (CLASS_VALUE[l.cls] ?? 1) * accessValue(l.access) * DECLINE_VALUE[l.decline]!;
}
/** the compensation for clearing a lot, $ (0 if empty): the use and level's sum, a tenth of it if derelict, else by decline */
export function compensation(l: { use: number; level: number; decline: number }): number {
  if (l.level === LV.EMPTY) return 0;
  return Math.round(COMPENSATION[l.use]![l.level - LV.BUILDING]! * (l.decline >= 3 ? 0.1 : DECLINE_VALUE[l.decline]!));
}
/** a stretch's upkeep per day, $: its length times the class cost, the upkeep share, times the structure's multiplier */
export function segUpkeep(s: SegIn): number { return s.len * CLASS[s.cls as ClassId]!.cost * UPKEEP * STRUCT_COST[s.kind]!; }

/** one game day's books, whole dollars; costs are positive, net = property + business + grants - upkeep - signals - interest - construction - compensation */
export interface Ledger {
  /** the game day */
  day: number;
  /** the property tax in */
  property: number;
  /** the business takings in */
  business: number;
  /** the milestone grants in */
  grants: number;
  /** the road upkeep out */
  upkeep: number;
  /** the signal upkeep out */
  signals: number;
  /** the loan interest out */
  interest: number;
  /** the construction spent today, out */
  construction: number;
  /** the compensation paid today, out */
  compensation: number;
  /** the day's change in the treasury */
  net: number;
  /** the treasury after the day */
  money: number;
}
/** the budget as saved: the sim s of day 1's midnight (base), the treasury, loans, days in the red, bankruptcy and the ledgers */
export interface BudgetSave { base: number; money: number; loans: number; debtDays: number; bankrupt: boolean; history: Ledger[] }

/** The city's budget. Spending and grants move the treasury when they happen and show in the next day's ledger; endDay books the rest. */
export class Budget {
  /** sim s of day 1's midnight: the game day is Math.floor((t - base) / GAME_DAY) + 1 (see dayOf) */
  base = 0;
  /** the treasury, $ */
  money = START_MONEY;
  /** the loan units taken (each LOAN, each paying LOAN_RATE a day) */
  loans = 0;
  /** the days in a row in the red */
  debtDays = 0;
  /** true once debtDays reached DEBT_DAYS (it stays so) */
  bankrupt = false;
  /** today's construction and compensation spending and grants, $ (booked by the next endDay) */
  today = { construction: 0, compensation: 0, grants: 0 };
  /** the ledgers, newest last (at most 30) */
  history: Ledger[] = [];
  /** dev sandbox: spending is booked in the ledger but the treasury does not move, and endDay keeps it and the debt at their values (not saved) */
  unlimited = false;

  /** the game day (1 from base on) of sim time t, s; a microsecond is forgiven, as the clock adds DT = 0.1 s and drifts a hair
   *  (1440 calls of DT land on 1439.9999999998), so the midnight is booked on the step that reaches it */
  dayOf(t: number): number { return Math.floor((t - this.base + 1e-6) / GAME_DAY) + 1; }
  /** spends n $ on kind today: out of the treasury now, into the next ledger */
  spend(kind: 'construction' | 'compensation', n: number) { if (!this.unlimited) this.money -= n; this.today[kind] += n; }
  /** gives back n $ of today's construction */
  refund(n: number) { this.money += n; this.today.construction -= n; }
  /** pays n $ of milestone grant into the treasury now: shows as income in the next ledger */
  grant(n: number) { this.money += n; this.today.grants += n; }
  /** the loan units a city of pop residents can hold: one more per 2000 residents, at most 6 */
  maxLoans(pop: number): number { return Math.min(6, 1 + Math.floor(pop / 2000)); }
  /** takes one loan unit (LOAN into the treasury) if the city of pop residents can hold another; false if not */
  borrow(pop: number): boolean { if (this.loans >= this.maxLoans(pop)) return false; this.loans++; this.money += LOAN; return true; }
  /** repays one loan unit (LOAN out of the treasury) if there is one and the treasury covers it; false if not */
  repay(): boolean { if (!this.loans || this.money < LOAN) return false; this.loans--; this.money -= LOAN; return true; }
  /** closes game day `day` from its trade, lots, roads and junctions: tax and takings in, upkeep, signal upkeep and interest out
   *  (today's spending is already out); the day's debt count and bankruptcy follow; returns the ledger */
  endDay(day: number, d: DayIn): Ledger {
    const m0 = this.money; // the treasury before the day's flows (kept when unlimited)
    let property = 0, upkeep = 0, signals = 0;
    for (const l of d.lots) property += lotTax(l);
    for (const s of d.segs) upkeep += segUpkeep(s);
    for (const t of d.nodes) signals += SIGNAL_UPKEEP[t] ?? 0;
    const p = Math.round(property), b = Math.round(BUSINESS * d.trade.punctual), u = Math.round(upkeep), sg = Math.round(signals);
    const it = Math.round(this.loans * LOAN * LOAN_RATE), c = Math.round(this.today.construction), k = Math.round(this.today.compensation), g = Math.round(this.today.grants);
    this.money += p + b - u - sg - it; // the grants and today's spending are in the treasury already
    const L: Ledger = { day, property: p, business: b, grants: g, upkeep: u, signals: sg, interest: it, construction: c, compensation: k, net: p + b + g - u - sg - it - c - k, money: this.money };
    this.today.construction = 0; this.today.compensation = 0; this.today.grants = 0;
    if (this.unlimited) { this.money = m0; this.debtDays = 0; this.bankrupt = false; }
    else { this.debtDays = this.money < 0 ? this.debtDays + 1 : 0; this.bankrupt ||= this.debtDays >= DEBT_DAYS; }
    this.history.push(L); if (this.history.length > 30) this.history.shift();
    return L;
  }
  /** the save: the treasury, loans, days in the red, bankruptcy and a copy of the ledgers */
  toJSON(): BudgetSave { return { base: this.base, money: this.money, loans: this.loans, debtDays: this.debtDays, bankrupt: this.bankrupt, history: this.history.slice() }; }
  /** a budget from a save (base 0 if the save has none; ledgers from before grants read as no grant); from(undefined, money) is a fresh budget with that treasury (old saves; START_MONEY if none given) */
  static from(s?: BudgetSave, money?: number): Budget {
    const b = new Budget();
    if (!s) { b.money = money ?? START_MONEY; return b; }
    b.base = s.base ?? 0; b.money = s.money; b.loans = s.loans; b.debtDays = s.debtDays; b.bankrupt = s.bankrupt; b.history = s.history.slice(-30).map(l => ({ ...l, grants: l.grants ?? 0 }));
    return b;
  }
}
