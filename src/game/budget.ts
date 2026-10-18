// The city's money: the treasury, the daily ledger (property tax and business takings in; upkeep, signal upkeep, loan interest,
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
/** upkeep per day: this share of the build cost per tile (times STRUCT_COST[kind] for bridges and tunnels) */
export const UPKEEP = 0.004;
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

/** one game day's books, whole dollars; costs are positive, net = property + business - upkeep - signals - interest - construction - compensation */
export interface Ledger {
  /** the game day */
  day: number;
  /** the property tax in */
  property: number;
  /** the business takings in */
  business: number;
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
/** the budget as saved: the treasury, loans, days in the red, bankruptcy and the ledgers */
export interface BudgetSave { money: number; loans: number; debtDays: number; bankrupt: boolean; history: Ledger[] }

/** The city's budget. Spending is taken from the treasury when it happens and shows in the next day's ledger; endDay books the rest. */
export class Budget {
  /** the treasury, $ */
  money = START_MONEY;
  /** the loan units taken (each LOAN, each paying LOAN_RATE a day) */
  loans = 0;
  /** the days in a row in the red */
  debtDays = 0;
  /** true once debtDays reached DEBT_DAYS (it stays so) */
  bankrupt = false;
  /** today's construction and compensation spending, $ (booked by the next endDay) */
  today = { construction: 0, compensation: 0 };
  /** the ledgers, newest last (at most 30) */
  history: Ledger[] = [];

  /** spends n $ on kind today: out of the treasury now, into the next ledger */
  spend(kind: 'construction' | 'compensation', n: number) { this.money -= n; this.today[kind] += n; }
  /** gives back n $ of today's construction */
  refund(n: number) { this.money += n; this.today.construction -= n; }
  /** the loan units a city of pop residents can hold: one more per 2000 residents, at most 6 */
  maxLoans(pop: number): number { return Math.min(6, 1 + Math.floor(pop / 2000)); }
  /** takes one loan unit (LOAN into the treasury) if the city of pop residents can hold another; false if not */
  borrow(pop: number): boolean { if (this.loans >= this.maxLoans(pop)) return false; this.loans++; this.money += LOAN; return true; }
  /** repays one loan unit (LOAN out of the treasury) if there is one and the treasury covers it; false if not */
  repay(): boolean { if (!this.loans || this.money < LOAN) return false; this.loans--; this.money -= LOAN; return true; }
  /** closes game day `day` from its trade, lots, roads and junctions: tax and takings in, upkeep, signal upkeep and interest out
   *  (today's spending is already out); the day's debt count and bankruptcy follow; returns the ledger */
  endDay(day: number, d: DayIn): Ledger {
    let property = 0, upkeep = 0, signals = 0;
    for (const l of d.lots) property += lotTax(l);
    for (const s of d.segs) upkeep += segUpkeep(s);
    for (const t of d.nodes) signals += SIGNAL_UPKEEP[t] ?? 0;
    const p = Math.round(property), b = Math.round(BUSINESS * d.trade.punctual), u = Math.round(upkeep), sg = Math.round(signals);
    const it = Math.round(this.loans * LOAN * LOAN_RATE), c = Math.round(this.today.construction), k = Math.round(this.today.compensation);
    this.money += p + b - u - sg - it;
    const L: Ledger = { day, property: p, business: b, upkeep: u, signals: sg, interest: it, construction: c, compensation: k, net: p + b - u - sg - it - c - k, money: this.money };
    this.today.construction = 0; this.today.compensation = 0;
    this.debtDays = this.money < 0 ? this.debtDays + 1 : 0;
    this.bankrupt ||= this.debtDays >= DEBT_DAYS;
    this.history.push(L); if (this.history.length > 30) this.history.shift();
    return L;
  }
  /** the save: the treasury, loans, days in the red, bankruptcy and a copy of the ledgers */
  toJSON(): BudgetSave { return { money: this.money, loans: this.loans, debtDays: this.debtDays, bankrupt: this.bankrupt, history: this.history.slice() }; }
  /** a budget from a save; from(undefined, money) is a fresh budget with that treasury (old saves; START_MONEY if none given) */
  static from(s?: BudgetSave, money?: number): Budget {
    const b = new Budget();
    if (!s) { b.money = money ?? START_MONEY; return b; }
    b.money = s.money; b.loans = s.loans; b.debtDays = s.debtDays; b.bankrupt = s.bankrupt; b.history = s.history.slice(-30);
    return b;
  }
}
