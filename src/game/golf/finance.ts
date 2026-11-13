// The Bank (jam ticket J2, docs/JAM.md "The shared contract" and "Numbers"): the golf club's money rules as pure TS, no DOM, runs in node.
// Bank loans with monthly compounding, murabaha (Islamic financing: a fixed markup, never interest), savings, the overdraft, the credit
// score, and the monthly ledger every other system books into with `book`. The cash itself stays the budget's treasury: this module only
// says how much the cash changes (monthEnd's cashChange, the cash a loan pays out) and the caller applies it.
//
// Sign rule for `book`: + money in, - money out. Bookkeeping only: the engine has already moved the treasury for the live flows.

/** every line of the monthly statement */
export type Line = 'range' | 'greenFees' | 'members' | 'events' | 'shop' | 'parking' | 'otherIn'
  | 'wages' | 'upkeep' | 'build' | 'stock' | 'otherOut'
  | 'loanInterest' | 'loanPrincipal' | 'savingsInterest' | 'overdraftInterest' | 'emergency' | 'insurance';

/** one loan. bank: balance is the principal still owed, aprPct the yearly rate, payment the level monthly payment. murabaha: principal is the
 *  cost the bank paid, markupPct the whole markup fixed at signing (4.5% a year of the term, so 9% for 24 months), aprPct that flat yearly
 *  rate, balance the instalments still to pay (the price never grows), payment the equal instalment. missed counts late payments. */
export interface Loan { id: number; kind: 'bank' | 'murabaha'; label: string; principal: number; balance: number; aprPct: number;
  markupPct: number; termMonths: number; payment: number; paidMonths: number; missed: number; startMonth: number }

/** one closed month's statement */
export interface MonthReport { month: number; label: string; lines: Partial<Record<Line, number>>; cash: number; savings: number;
  debt: number; assets: number; netWorth: number; credit: number; events: string[] }

/** the whole bank state, saved with the golf save (plain JSON) */
export interface FinanceSave { v: 1; month: number; savings: number; loans: Loan[]; credit: number;
  insurance: 'none' | 'basic' | 'full'; cur: Partial<Record<Line, number>>; history: MonthReport[]; moments: string[]; nextId: number }

// ---- the numbers (docs/JAM.md "Numbers"; named so the balance pass can change them in one place) ----
/** the credit score of a new club */
export const CREDIT_START = 650;
/** the credit score range */
export const CREDIT_MIN = 300;
export const CREDIT_MAX = 850;
/** credit points: all paid on time (a month), a missed payment, a month in overdraft */
export const CREDIT_ON_TIME = 5;
export const CREDIT_MISSED = -40;
export const CREDIT_OVERDRAFT = -10;
/** bank loan: smallest, largest, step, terms in months */
export const BANK_MIN = 5_000;
export const BANK_MAX = 250_000;
export const BANK_STEP = 5_000;
export const TERMS: readonly number[] = [12, 24, 36, 60];
/** bank loan: the base yearly rate %, the most the credit score adds (score 850: +0, score 300: +CREDIT_APR_MAX) */
export const BASE_APR = 7;
export const CREDIT_APR_MAX = 12;
/** bank loan: debt payments above this share of last month's income add DTI_APR to the rate */
export const DTI_LIMIT = 0.4;
export const DTI_APR = 2;
/** murabaha: the smallest purchase, the markup % a year of the term, the share of the unearned markup given back on early settlement,
 *  the flat late charge $ (given to charity, never interest) */
export const MURABAHA_MIN = 5_000;
export const MURABAHA_MARKUP_PA = 4.5;
export const MURABAHA_REBATE = 0.5;
export const LATE_FEE = 50;
/** savings: the yearly rate % (credited monthly as rate/12) */
export const SAVINGS_APR = 4;
/** overdraft: the monthly rate on the shortfall; bankrupt past OVERDRAFT_BUST $ or after OVERDRAFT_MONTHS month ends in a row */
export const OVERDRAFT_MONTHLY = 0.025;
export const OVERDRAFT_BUST = 50_000;
export const OVERDRAFT_MONTHS = 3;
/** the statements and moments kept */
export const HISTORY_CAP = 60;
export const MOMENTS_CAP = 20;
/** insurance: the monthly premium, the deductible you pay first, the share of the rest the insurer pays */
export const INSURANCE: Record<FinanceSave['insurance'], { premium: number; deductible: number; cover: number }> = {
  none: { premium: 0, deductible: 0, cover: 0 },
  basic: { premium: 150, deductible: 5_000, cover: 0.7 },
  full: { premium: 400, deductible: 1_000, cover: 0.9 },
};

const INCOME_LINES: Line[] = ['range', 'greenFees', 'members', 'events', 'shop', 'parking', 'otherIn'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** a finite number or 0 */
const fin = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
/** whole cents */
const r2 = (x: number): number => Math.round(x * 100) / 100;
const clampCredit = (c: number): number => Math.min(CREDIT_MAX, Math.max(CREDIT_MIN, Math.round(fin(c))));

/** a fresh bank: no loans, no savings, the starting credit score */
export function newFinance(): FinanceSave {
  return { v: 1, month: 0, savings: 0, loans: [], credit: CREDIT_START, insurance: 'none', cur: {}, history: [], moments: [], nextId: 1 };
}

/** book an amount on a statement line for this month: + money in, - money out. A NaN or infinite amount is ignored (never poisons the books) */
export function book(f: FinanceSave, line: Line, amount: number): void {
  if (!Number.isFinite(amount) || amount === 0) return;
  f.cur[line] = r2((f.cur[line] ?? 0) + amount);
}

/** keep a notable thing for the money moments list */
function moment(f: FinanceSave, text: string): void {
  f.moments.push(text);
  if (f.moments.length > MOMENTS_CAP) f.moments.splice(0, f.moments.length - MOMENTS_CAP);
}

/** a saved FinanceSave read back safely: anything missing or wrong gives a fresh bank (old saves have none) */
export function loadFinance(raw: unknown): FinanceSave {
  const d = newFinance();
  if (!raw || typeof raw !== 'object') return d;
  const o = raw as Partial<FinanceSave>;
  if (o.v !== 1) return d;
  const loans: Loan[] = Array.isArray(o.loans) ? o.loans.filter((l) => l && (l.kind === 'bank' || l.kind === 'murabaha') && Number.isFinite(l.balance) && Number.isFinite(l.payment) && Number.isFinite(l.termMonths)).map((l) => ({
    id: fin(l.id), kind: l.kind, label: String(l.label ?? ''), principal: fin(l.principal), balance: Math.max(0, fin(l.balance)), aprPct: fin(l.aprPct),
    markupPct: fin(l.markupPct), termMonths: Math.max(1, fin(l.termMonths)), payment: Math.max(0, fin(l.payment)), paidMonths: Math.max(0, fin(l.paidMonths)),
    missed: Math.max(0, fin(l.missed)), startMonth: fin(l.startMonth) })) : [];
  const cur: Partial<Record<Line, number>> = {};
  if (o.cur && typeof o.cur === 'object') for (const k of Object.keys(o.cur) as Line[]) { const v = (o.cur as Record<string, unknown>)[k]; if (Number.isFinite(v)) cur[k] = v as number; }
  const history = Array.isArray(o.history) ? o.history.filter((h) => h && typeof h === 'object' && Number.isFinite(h.month)).slice(-HISTORY_CAP) : [];
  return {
    v: 1, month: Math.max(0, Math.round(fin(o.month))), savings: Math.max(0, fin(o.savings)), loans, credit: clampCredit(o.credit ?? CREDIT_START),
    insurance: o.insurance === 'basic' || o.insurance === 'full' ? o.insurance : 'none', cur, history,
    moments: Array.isArray(o.moments) ? o.moments.filter((m) => typeof m === 'string').slice(-MOMENTS_CAP) : [],
    nextId: Math.max(1, Math.round(fin(o.nextId)) || 1, ...loans.map((l) => l.id + 1)),
  };
}

// ---- reading the books ----
/** what the club owes: the bank balances plus the murabaha instalments still to pay */
export function debtOf(f: FinanceSave): number { return r2(f.loans.reduce((s, l) => s + l.balance, 0)); }
/** the loan payments due each month */
export function monthlyDue(f: FinanceSave): number { return r2(f.loans.reduce((s, l) => s + Math.min(l.payment, l.balance), 0)); }
/** last month's operating income (the income lines of the newest statement), 0 before the first month end */
export function lastIncome(f: FinanceSave): number {
  const h = f.history[f.history.length - 1];
  if (!h) return 0;
  return INCOME_LINES.reduce((s, k) => s + Math.max(0, h.lines[k] ?? 0), 0);
}
/** cash + savings + assets - debt */
export function netWorthOf(f: FinanceSave, cash: number, assets: number): number { return r2(fin(cash) + f.savings + Math.max(0, fin(assets)) - debtOf(f)); }
/** how many month ends in a row (counting back from the newest) closed with the cash below zero */
export function overdraftStreak(f: FinanceSave): number {
  let n = 0;
  for (let i = f.history.length - 1; i >= 0 && f.history[i]!.cash < 0; i--) n++;
  return n;
}
/** golf-mode bankruptcy: the overdraft is past OVERDRAFT_BUST, or it has lasted OVERDRAFT_MONTHS month ends in a row (the live cash counts for the first test only) */
export function isBankrupt(f: FinanceSave, cash: number): boolean {
  return fin(cash) < -OVERDRAFT_BUST || overdraftStreak(f) >= OVERDRAFT_MONTHS;
}
/** what the insurer and you each pay of a loss at an insurance level */
export function insuredLoss(level: FinanceSave['insurance'], loss: number): { youPay: number; insurerPays: number } {
  const l = Math.max(0, fin(loss)); const t = INSURANCE[level] ?? INSURANCE.none;
  const over = Math.max(0, l - t.deductible); const ins = r2(over * t.cover);
  return { youPay: r2(l - ins), insurerPays: ins };
}

// ---- bank loans ----
/** the level monthly payment P r / (1 - (1 + r)^-n), r the monthly rate; with a zero rate P / n */
export function amortisedPayment(principal: number, aprPct: number, months: number): number {
  const p = Math.max(0, fin(principal)); const n = Math.max(1, Math.round(fin(months))); const r = Math.max(0, fin(aprPct)) / 1200;
  if (r === 0) return r2(p / n);
  return r2((p * r) / (1 - Math.pow(1 + r, -n)));
}
/** the yearly rate % the credit score alone asks: 7% at 850 up to 19% at 300 */
export function creditApr(credit: number): number {
  const c = clampCredit(credit);
  return BASE_APR + (CREDIT_APR_MAX * (CREDIT_MAX - c)) / (CREDIT_MAX - CREDIT_MIN);
}

/** a quote for a bank loan: nothing is signed */
export interface BankQuote { ok: boolean; reason?: string; amount: number; term: number; aprPct: number; creditAprPct: number; dtiAprPct: number; dti: number;
  payment: number; total: number; interest: number }
/** quote a bank loan of `amount` over `term` months. The debt-to-income test counts the loan payments you already have plus this one at the credit rate;
 *  before the first month end there is no income to test against, so it adds nothing. */
export function quoteBank(f: FinanceSave, amount: number, term: number): BankQuote {
  const a = fin(amount); const t = Math.round(fin(term));
  const base = creditApr(f.credit);
  const q: BankQuote = { ok: false, amount: a, term: t, aprPct: base, creditAprPct: base, dtiAprPct: 0, dti: 0, payment: 0, total: 0, interest: 0 };
  if (!(a >= BANK_MIN) || a > BANK_MAX) { q.reason = `Loans run from $${BANK_MIN.toLocaleString('en-US')} to $${BANK_MAX.toLocaleString('en-US')}.`; return q; }
  if (!TERMS.includes(t)) { q.reason = 'Pick a term of 12, 24, 36 or 60 months.'; return q; }
  const own = amortisedPayment(a, base, t);
  const inc = lastIncome(f);
  if (f.history.length > 0) {
    q.dti = inc > 0 ? (monthlyDue(f) + own) / inc : Infinity;
    if (q.dti > DTI_LIMIT) q.dtiAprPct = DTI_APR;
  }
  q.aprPct = base + q.dtiAprPct;
  q.payment = amortisedPayment(a, q.aprPct, t);
  q.total = r2(q.payment * t);
  q.interest = r2(q.total - a);
  q.ok = true;
  return q;
}
/** sign a bank loan. Returns the loan and the cash it pays out (add it to the treasury) */
export function signBank(f: FinanceSave, amount: number, term: number, label = 'Bank loan'): { ok: boolean; reason?: string; loan?: Loan; cash: number } {
  const q = quoteBank(f, amount, term);
  if (!q.ok) return { ok: false, reason: q.reason, cash: 0 };
  const loan: Loan = { id: f.nextId++, kind: 'bank', label, principal: q.amount, balance: q.amount, aprPct: q.aprPct, markupPct: 0, termMonths: q.term,
    payment: q.payment, paidMonths: 0, missed: 0, startMonth: f.month };
  f.loans.push(loan);
  moment(f, `Borrowed $${q.amount.toLocaleString('en-US')} from the bank at ${q.aprPct.toFixed(1)}% for ${q.term} months.`);
  return { ok: true, loan, cash: q.amount };
}

// ---- murabaha ----
/** a quote for a murabaha purchase: nothing is signed */
export interface MurabahaQuote { ok: boolean; reason?: string; cost: number; term: number; markupPct: number; markup: number; total: number; payment: number;
  lateFee: number; effectiveAprPct: number }
/** the yearly rate % that would give equal monthly payments of `payment` for `months` on `principal` (what a flat markup really costs), by bisection */
export function effectiveApr(principal: number, payment: number, months: number): number {
  const p = fin(principal); const pay = fin(payment); const n = Math.max(1, Math.round(fin(months)));
  if (!(p > 0) || pay * n <= p) return 0;
  let lo = 0; let hi = 100;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (amortisedPayment(p, mid, n) > pay) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}
/** quote murabaha for one purchase of `cost`: price = cost x (1 + 4.5% x years of the term), equal instalments, fixed for good */
export function quoteMurabaha(cost: number, term: number): MurabahaQuote {
  const c = fin(cost); const t = Math.round(fin(term));
  const q: MurabahaQuote = { ok: false, cost: c, term: t, markupPct: 0, markup: 0, total: 0, payment: 0, lateFee: LATE_FEE, effectiveAprPct: 0 };
  if (!(c >= MURABAHA_MIN)) { q.reason = `Murabaha is for one purchase of $${MURABAHA_MIN.toLocaleString('en-US')} or more.`; return q; }
  if (c > BANK_MAX) { q.reason = `The bank finances up to $${BANK_MAX.toLocaleString('en-US')}.`; return q; }
  if (!TERMS.includes(t)) { q.reason = 'Pick a term of 12, 24, 36 or 60 months.'; return q; }
  q.markupPct = (MURABAHA_MARKUP_PA * t) / 12;
  q.markup = r2((c * q.markupPct) / 100);
  q.total = r2(c + q.markup);
  q.payment = r2(q.total / t);
  q.effectiveAprPct = effectiveApr(c, q.payment, t);
  q.ok = true;
  return q;
}
/** sign murabaha for the named purchase `label`. Returns the loan and the cash the bank pays toward the purchase (add it to the treasury) */
export function signMurabaha(f: FinanceSave, cost: number, term: number, label: string): { ok: boolean; reason?: string; loan?: Loan; cash: number } {
  const q = quoteMurabaha(cost, term);
  if (!q.ok) return { ok: false, reason: q.reason, cash: 0 };
  const loan: Loan = { id: f.nextId++, kind: 'murabaha', label: label || 'Murabaha purchase', principal: q.cost, balance: q.total, aprPct: MURABAHA_MARKUP_PA,
    markupPct: q.markupPct, termMonths: q.term, payment: q.payment, paidMonths: 0, missed: 0, startMonth: f.month };
  f.loans.push(loan);
  moment(f, `Bought "${loan.label}" with murabaha: $${q.total.toLocaleString('en-US')} in ${q.term} fixed instalments.`);
  return { ok: true, loan, cash: q.cost };
}
/** the rebate on settling a murabaha early: half of the markup not yet earned (the instalments still to come) */
export function murabahaRebate(l: Loan): number {
  if (l.kind !== 'murabaha' || l.termMonths <= 0) return 0;
  const left = Math.max(0, l.termMonths - l.paidMonths);
  const unearned = (l.principal * l.markupPct / 100) * (left / l.termMonths);
  return r2(Math.min(l.balance, unearned * MURABAHA_REBATE));
}
/** what clearing a loan now costs: the balance (bank) or the balance less the rebate (murabaha) */
export function settleCost(l: Loan): number { return r2(Math.max(0, l.balance - murabahaRebate(l))); }

/** pay a loan off early, no penalty. A bank loan takes any amount up to its balance (a part payment keeps the term and lowers the payment);
 *  a murabaha is settled in full (the amount must be at least settleCost, you pay settleCost). `cash` is what you have: you cannot prepay into the overdraft.
 *  Returns the cash paid out (take it from the treasury). */
export function repay(f: FinanceSave, id: number, amount: number, cash: number): { ok: boolean; reason?: string; paid: number; closed: boolean } {
  const l = f.loans.find((x) => x.id === id);
  const a = fin(amount);
  if (!l) return { ok: false, reason: 'No such loan.', paid: 0, closed: false };
  if (!(a > 0)) return { ok: false, reason: 'Enter an amount.', paid: 0, closed: false };
  let pay: number;
  if (l.kind === 'murabaha') {
    pay = settleCost(l);
    if (a + 0.005 < pay) return { ok: false, reason: `A murabaha is settled in full: $${pay.toLocaleString('en-US')}.`, paid: 0, closed: false };
  } else pay = r2(Math.min(a, l.balance));
  if (pay > fin(cash) + 0.005) return { ok: false, reason: 'Not enough cash.', paid: 0, closed: false };
  if (l.kind === 'murabaha') {
    const rebate = murabahaRebate(l);
    const unpaidMarkup = r2(Math.max(0, (l.principal * l.markupPct / 100) * ((l.termMonths - l.paidMonths) / l.termMonths) - rebate));
    book(f, 'loanInterest', -Math.min(unpaidMarkup, pay));
    book(f, 'loanPrincipal', -(pay - Math.min(unpaidMarkup, pay)));
    moment(f, `Settled "${l.label}" early and saved $${rebate.toLocaleString('en-US')} of markup.`);
    f.loans = f.loans.filter((x) => x.id !== id);
    return { ok: true, paid: pay, closed: true };
  }
  book(f, 'loanPrincipal', -pay);
  l.balance = r2(l.balance - pay);
  if (l.balance < 0.01) { moment(f, `Paid off "${l.label}" early.`); f.loans = f.loans.filter((x) => x.id !== id); return { ok: true, paid: pay, closed: true }; }
  l.payment = amortisedPayment(l.balance, l.aprPct, Math.max(1, l.termMonths - l.paidMonths));
  return { ok: true, paid: pay, closed: false };
}

// ---- savings ----
/** move cash into savings. `cash` is what you have (no saving into the overdraft). Returns the amount moved (take it from the treasury) */
export function deposit(f: FinanceSave, amount: number, cash: number): number {
  const a = r2(Math.min(fin(amount), Math.max(0, fin(cash))));
  if (!(a > 0)) return 0;
  f.savings = r2(f.savings + a);
  return a;
}
/** move savings back to cash. Returns the amount moved (add it to the treasury) */
export function withdraw(f: FinanceSave, amount: number): number {
  const a = r2(Math.min(fin(amount), f.savings));
  if (!(a > 0)) return 0;
  f.savings = r2(f.savings - a);
  return a;
}
/** the interest a savings balance earns in one month */
export function savingsMonthly(balance: number): number { return r2((Math.max(0, fin(balance)) * SAVINGS_APR) / 1200); }

// ---- the month end ----
/** close a month: pay the insurance and every instalment (a payment the cash cannot cover is still taken and counts as missed), charge the
 *  overdraft interest, credit the savings interest to savings, move the credit score, write the statement and start the next month.
 *  `cash` is the treasury now, `assets` what the club owns (built holes, land, stock), `label` the month's name ("Sep 1984").
 *  Returns the change to apply to the treasury (instalments, premiums, fees and overdraft interest, all <= 0) and the statement. */
export function monthEnd(f: FinanceSave, o: { cash: number; assets: number; label?: string }): { cashChange: number; report: MonthReport } {
  const cash0 = fin(o.cash); const assets = Math.max(0, fin(o.assets));
  const events: string[] = [];
  let run = cash0;
  let missed = 0;
  const prem = INSURANCE[f.insurance]?.premium ?? 0;
  if (prem > 0) { book(f, 'insurance', -prem); run -= prem; }
  const keep: Loan[] = [];
  for (const l of f.loans) {
    const r = l.aprPct / 1200;
    let due: number; let interest: number;
    if (l.kind === 'bank') {
      interest = r2(l.balance * r);
      due = l.paidMonths + 1 >= l.termMonths ? r2(l.balance + interest) : Math.min(l.payment, r2(l.balance + interest));
      interest = Math.min(interest, due);
    } else {
      due = l.paidMonths + 1 >= l.termMonths ? l.balance : Math.min(l.payment, l.balance);
      const total = l.principal * (1 + l.markupPct / 100);
      interest = total > 0 ? r2((due * (l.principal * l.markupPct / 100)) / total) : 0;
    }
    const late = run < due - 0.005;
    run -= due;
    book(f, 'loanInterest', -interest);
    book(f, 'loanPrincipal', -(due - interest));
    l.balance = r2(l.kind === 'bank' ? l.balance - (due - interest) : l.balance - due);
    l.paidMonths += 1;
    if (late) {
      missed++; l.missed += 1;
      events.push(`Could not cover the payment on ${l.label}: your credit score dropped.`);
      if (l.kind === 'murabaha') { book(f, 'otherOut', -LATE_FEE); run -= LATE_FEE; events.push(`Late charge $${LATE_FEE} on ${l.label}, given to charity (never interest).`); }
    }
    if (l.paidMonths >= l.termMonths || l.balance < 0.01) { events.push(`${l.label} is paid off.`); moment(f, `Paid off "${l.label}".`); } else keep.push(l);
  }
  f.loans = keep;
  let credit = f.credit;
  if (missed === 0) credit += CREDIT_ON_TIME; else credit += CREDIT_MISSED * missed;
  if (run < 0) {
    const odi = r2(-run * OVERDRAFT_MONTHLY);
    book(f, 'overdraftInterest', -odi); run -= odi;
    credit += CREDIT_OVERDRAFT;
    events.push(`In overdraft: $${odi.toLocaleString('en-US')} interest (${(OVERDRAFT_MONTHLY * 100).toFixed(1)}% a month).`);
  }
  f.credit = clampCredit(credit);
  const si = savingsMonthly(f.savings);
  if (si > 0) { f.savings = r2(f.savings + si); book(f, 'savingsInterest', si); }
  const cashNow = r2(run);
  const debt = debtOf(f);
  const report: MonthReport = { month: f.month, label: o.label ?? `Month ${f.month + 1}`, lines: { ...f.cur }, cash: cashNow, savings: f.savings, debt, assets: r2(assets),
    netWorth: r2(cashNow + f.savings + assets - debt), credit: f.credit, events };
  f.history.push(report);
  if (f.history.length > HISTORY_CAP) f.history.splice(0, f.history.length - HISTORY_CAP);
  f.cur = {};
  f.month += 1;
  return { cashChange: r2(cashNow - cash0), report };
}

/** "Sep 1984" style label of the calendar month index (0 = Jan) and year, for callers without the calendar */
export function monthLabel(m: number, year: number): string { return `${MONTH_NAMES[((Math.round(fin(m)) % 12) + 12) % 12]} ${year}`; }
