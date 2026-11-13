// Reports (jam ticket J3): what the month statement, the net-worth chart and the report card read, all derived from the MonthReport history
// that finance.ts keeps. Pure TS, no DOM, nothing here changes the game.
import type { Line, MonthReport } from './finance';
import type { Emergency } from './risk';

/** a report that may carry the month's emergencies (set by the month hook; older saves have none) */
export type Report = MonthReport & { emergencies?: Emergency[] };

export const INCOME_LINES: readonly Line[] = ['range', 'greenFees', 'members', 'events', 'shop', 'parking', 'otherIn'];
export const LINE_NAMES: Record<string, string> = {
  range: 'Driving range', greenFees: 'Green fees', members: 'Memberships', events: 'Events', shop: 'Pro shop', parking: 'Parking', otherIn: 'Other income',
  savingsInterest: 'Savings interest', wages: 'Wages', upkeep: 'Upkeep', build: 'Building', stock: 'Stock', otherOut: 'Other costs',
  loanInterest: 'Loan interest', markup: 'Murabaha markup', overdraftInterest: 'Overdraft interest', loanPrincipal: 'Loan repayments', emergency: 'Emergencies', insurance: 'Insurance',
};
/** the cost groups of the statement, in the order shown */
export const COST_GROUPS: readonly { name: string; lines: readonly Line[] }[] = [
  { name: 'Staff and upkeep', lines: ['wages', 'upkeep'] },
  { name: 'Stock and other', lines: ['stock', 'otherOut'] },
  { name: 'Interest paid', lines: ['loanInterest', 'overdraftInterest'] },
  { name: 'Murabaha markup', lines: ['markup'] },
  { name: 'Insurance', lines: ['insurance'] },
  { name: 'Emergencies (your share)', lines: ['emergency'] },
];

const fin = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0);
const get = (r: Pick<MonthReport, 'lines'> | undefined, l: Line): number => fin(r?.lines?.[l]);
const sum = (r: Pick<MonthReport, 'lines'> | undefined, ls: readonly Line[]): number => ls.reduce((a, l) => a + get(r, l), 0);

export interface Row { name: string; amount: number }
export interface Statement {
  label: string;
  income: Row[]; incomeTotal: number;
  /** costs shown as positive amounts */
  costs: Row[]; costsTotal: number;
  interestEarned: number; interestPaid: number;
  /** what the month earned: income and interest earned, less costs; building and loan repayments move money between pockets and are not in it */
  profit: number;
  /** cash spent on building and on repaying loan principal (not costs: they turn cash into a course or cut the debt) */
  building: number; repaid: number;
  netWorth: number; netWorthChange: number;
  emergencies: Emergency[];
}

/** the statement of the report at `i` of the history (the last by default) */
export function statementOf(history: readonly Report[], i = history.length - 1): Statement | null {
  const r = history[i];
  if (!r) return null;
  const income = INCOME_LINES.map(l => ({ name: LINE_NAMES[l], amount: get(r, l) })).filter(x => x.amount !== 0);
  const interestEarned = get(r, 'savingsInterest');
  if (interestEarned !== 0) income.push({ name: LINE_NAMES.savingsInterest, amount: interestEarned });
  const incomeTotal = income.reduce((a, x) => a + x.amount, 0);
  const costs = COST_GROUPS.map(g => ({ name: g.name, amount: -sum(r, g.lines) })).filter(x => x.amount !== 0);
  const costsTotal = costs.reduce((a, x) => a + x.amount, 0);
  const prev = history[i - 1];
  return {
    label: r.label, income, incomeTotal, costs, costsTotal,
    interestEarned, interestPaid: -sum(r, ['loanInterest', 'overdraftInterest']),
    profit: incomeTotal - costsTotal,
    building: -get(r, 'build'), repaid: -get(r, 'loanPrincipal'),
    netWorth: fin(r.netWorth), netWorthChange: prev ? fin(r.netWorth) - fin(prev.netWorth) : 0,
    emergencies: r.emergencies ?? [],
  };
}

export interface Point { label: string; value: number }
/** the net worth at each month end */
export function netWorthSeries(history: readonly Report[]): Point[] { return history.map(r => ({ label: r.label, value: fin(r.netWorth) })); }

/** interest paid (loans and overdraft) against interest earned (savings), over the whole history */
export function interestToDate(history: readonly Report[]): { paid: number; earned: number } {
  let paid = 0, earned = 0;
  for (const r of history) { paid -= sum(r, ['loanInterest', 'overdraftInterest']); earned += get(r, 'savingsInterest'); }
  return { paid, earned };
}

/** the emergencies of the history: how many, the bills' total, what insurance paid, and what came out of your pocket.
 *  A report without the detail still counts its emergency line as out of pocket. */
export function emergencyTotals(history: readonly Report[]): { count: number; cost: number; covered: number; outOfPocket: number; weathered: number } {
  let count = 0, cost = 0, covered = 0, outOfPocket = 0, weathered = 0;
  for (const r of history) {
    const list = r.emergencies;
    if (list && list.length) {
      for (const e of list) { count++; cost += fin(e.cost); covered += fin(e.insured); outOfPocket += fin(e.youPay); }
      if (fin(r.cash) >= 0) weathered += list.length;
    } else if (get(r, 'emergency') < 0) {
      count++; outOfPocket -= get(r, 'emergency'); cost -= get(r, 'emergency');
      if (fin(r.cash) >= 0) weathered++;
    }
  }
  return { count, cost, covered, outOfPocket, weathered };
}

// ---- the goal and the report card ----

/** the goal (JAM.md): by the end of season 2 */
export const GOAL = { months: 24, holes: 9, netWorth: 250_000 } as const;

export interface Live { holes: number; cash: number; netWorth: number; debt: number }
export interface GoalState {
  monthsDone: number; monthsLeft: number;
  holes: number; holesNeed: number; netWorth: number; netWorthNeed: number; overdraft: boolean;
  /** 0..1 each */
  holesPct: number; netWorthPct: number;
  met: boolean;
}

/** how far the club is from the goal now (the live numbers win over the last month end's) */
export function goalState(history: readonly Report[], live: Live): GoalState {
  const monthsDone = history.length;
  const holes = Math.max(0, Math.floor(fin(live.holes)));
  const nw = fin(live.netWorth);
  const overdraft = fin(live.cash) < 0;
  const holesPct = Math.min(1, holes / GOAL.holes);
  const netWorthPct = Math.min(1, Math.max(0, nw / GOAL.netWorth));
  return { monthsDone, monthsLeft: Math.max(0, GOAL.months - monthsDone), holes, holesNeed: GOAL.holes, netWorth: nw, netWorthNeed: GOAL.netWorth,
    overdraft, holesPct, netWorthPct, met: holes >= GOAL.holes && nw >= GOAL.netWorth && !overdraft };
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';
export interface Reason { ok: boolean; text: string }
export interface Card { grade: Grade; score: number; reasons: Reason[]; goal: GoalState; final: boolean }

const m = (n: number) => (n < 0 ? '-$' : '$') + Math.round(Math.abs(n)).toLocaleString('en-US');

/** the grade A to F with the reasons. 100 points: the goal (60: holes 20, net worth 25, no overdraft 15), debt left (15), interest paid against earned (10),
 *  emergencies weathered (15). A club that missed the goal cannot score above B. `final` is true once the two seasons are over. */
export function reportCard(history: readonly Report[], live: Live): Card {
  const goal = goalState(history, live);
  const { paid, earned } = interestToDate(history);
  const em = emergencyTotals(history);
  const income = history.reduce((a, r) => a + sum(r, INCOME_LINES), 0);
  const debt = Math.max(0, fin(live.debt));
  const assets = Math.max(1, fin(live.netWorth) + debt);

  const pHoles = 20 * goal.holesPct;
  const pNw = 25 * goal.netWorthPct;
  const pOver = goal.overdraft ? 0 : 15;
  const pDebt = 15 * (1 - Math.min(1, debt / assets));
  const drag = Math.max(0, paid - earned);
  const pInt = 10 * (1 - Math.min(1, drag / Math.max(1, 0.1 * income)));
  const pEm = em.count === 0 ? 15 : 15 * (em.weathered / em.count);
  const score = Math.round(pHoles + pNw + pOver + pDebt + pInt + pEm);

  let grade: Grade = score >= 85 ? 'A' : score >= 72 ? 'B' : score >= 58 ? 'C' : score >= 45 ? 'D' : 'F';
  if (!goal.met && grade === 'A') grade = 'B';

  const reasons: Reason[] = [
    { ok: goal.holes >= GOAL.holes, text: `${goal.holes} of ${GOAL.holes} holes built.` },
    { ok: goal.netWorth >= GOAL.netWorth, text: `Net worth ${m(goal.netWorth)} (the goal is ${m(GOAL.netWorth)}).` },
    { ok: !goal.overdraft, text: goal.overdraft ? 'The account is overdrawn: that costs about 34% a year.' : 'The account is in the black.' },
    { ok: debt <= 0.25 * assets, text: debt <= 0 ? 'No debt left.' : `Debt left: ${m(debt)}, ${Math.round((100 * debt) / assets)}% of what the club owns.` },
    { ok: drag <= 0, text: `Interest: ${m(paid)} paid, ${m(earned)} earned.` },
    { ok: em.count === 0 || em.weathered === em.count, text: em.count === 0 ? 'No emergencies hit.'
      : `${em.weathered} of ${em.count} emergencies weathered; insurance paid ${m(em.covered)}, you paid ${m(em.outOfPocket)}.` },
  ];
  return { grade, score, reasons, goal, final: goal.monthsDone >= GOAL.months };
}

// ---- money moments: one-line lessons, each shown once ----

/** the lessons, by id: plain, short, learned from what just happened to the player's own club */
export const MOMENTS: Record<string, string> = {
  loan: 'Your first loan. You will pay back more than you borrowed: the extra is interest, the price of using the bank\'s money.',
  interest: 'First month of interest paid. It is a cost every month until the loan is gone, and paying early saves some.',
  emergencyBare: 'A bill you were not ready for. Savings or insurance would have softened it.',
  emergencyCovered: 'Insured: the plan paid its share. A small steady premium protects you from a big, rare bill.',
  profit: 'Your first profitable month: income beat costs. That is how a club grows without borrowing.',
  nw100k: 'Net worth passed $100,000. It is everything you own minus everything you owe.',
  overdraft: 'The account went below zero. Overdrafts cost about 34% a year, far more than a loan. Cover it soon.',
  priceLoss: 'Raising the price lost you customers. A higher price only pays if enough golfers still say yes.',
};
/** the order they are offered in when several are due at once */
export const MOMENT_ORDER = ['overdraft', 'emergencyBare', 'emergencyCovered', 'loan', 'interest', 'profit', 'nw100k', 'priceLoss'] as const;

/** the moments that are true now and not shown yet, in MOMENT_ORDER ('priceLoss' comes from the game's own rules, via noteMoment) */
export function pendingMoments(f: { loans: readonly unknown[]; history: readonly Report[]; moments: readonly string[] }, cash: number): string[] {
  const h = f.history, done = new Set(f.moments);
  const due = new Set<string>();
  if (f.loans.length > 0 || h.some(r => fin(r.debt) > 0)) due.add('loan');
  if (h.some(r => get(r, 'loanInterest') < 0)) due.add('interest');
  if (h.some(r => get(r, 'emergency') < 0 || (r.emergencies?.length ?? 0) > 0)) {
    for (const r of h) for (const e of r.emergencies ?? []) {
      if (fin(e.insured) > 0) due.add('emergencyCovered');
      else if (fin(r.savings) < fin(e.cost)) due.add('emergencyBare');
    }
    if (!h.some(r => r.emergencies?.length) ) due.add('emergencyBare');
  }
  if (h.some(r => (statementOf([r], 0)?.profit ?? 0) > 0)) due.add('profit');
  if (h.some(r => fin(r.netWorth) >= 100_000)) due.add('nw100k');
  if (fin(cash) < 0 || h.some(r => fin(r.cash) < 0)) due.add('overdraft');
  return MOMENT_ORDER.filter(id => due.has(id) && !done.has(id));
}

/** a week of green fees, from the last month's: what flooded bunkers would cost (0 before any green fee came in) */
export function weeklyFees(history: readonly Report[]): number { return Math.max(0, get(history[history.length - 1], 'greenFees')) / 4; }
