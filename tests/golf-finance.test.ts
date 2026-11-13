// J2: the Bank's pure model (src/game/golf/finance.ts): amortisation, murabaha, savings, overdraft, credit score and the guards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newFinance, book, loadFinance, amortisedPayment, creditApr, quoteBank, signBank, quoteMurabaha, signMurabaha, murabahaRebate, settleCost, repay,
  deposit, withdraw, monthEnd, effectiveApr, debtOf, isBankrupt, overdraftStreak, insuredLoss, assetsAtCost, balanceBooks, booksGap, cashLinesSum, HISTORY_CAP, CREDIT_START, LATE_FEE,
} from '../src/game/golf/finance';

const close = (a: number, b: number, eps = 0.011) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
test('a new bank is empty at credit 650 and book sums a month', () => {
  const f = newFinance();
  assert.equal(f.credit, CREDIT_START); assert.equal(f.loans.length, 0); assert.equal(f.history.length, 0);
  book(f, 'range', 100); book(f, 'range', 50.5); book(f, 'wages', -40);
  assert.equal(f.cur.range, 150.5); assert.equal(f.cur.wages, -40);
});

test('book ignores NaN, Infinity and zero', () => {
  const f = newFinance();
  book(f, 'range', NaN); book(f, 'range', Infinity); book(f, 'range', -Infinity); book(f, 'range', 0);
  assert.deepEqual(f.cur, {});
});

test('amortisation matches P r / (1 - (1 + r)^-n) and the schedule sums to the total', () => {
  const P = 100_000, n = 24, apr = 12, r = 0.01;
  const exp = (P * r) / (1 - Math.pow(1 + r, -n));
  close(amortisedPayment(P, apr, n), exp);
  const f = newFinance(); f.credit = 850; // 7%
  const q = quoteBank(f, 100_000, 24);
  assert.ok(q.ok); close(q.aprPct, 7);
  const s = signBank(f, 100_000, 24); assert.ok(s.ok); assert.equal(s.cash, 100_000);
  let interest = 0, principal = 0;
  const loan = f.loans[0]!;
  for (let i = 0; i < 24; i++) {
    const before = f.loans[0]?.balance ?? 0;
    const { report } = monthEnd(f, { cash: 1e6, assets: 0 });
    interest += -(report.lines.loanInterest ?? 0); principal += -(report.lines.loanPrincipal ?? 0);
    if (i < 23) close(before - (f.loans[0]?.balance ?? 0), loan.payment - (report.lines.loanInterest ? -report.lines.loanInterest : 0), 0.02);
  }
  assert.equal(f.loans.length, 0); // paid off
  close(principal, 100_000, 0.05);
  close(interest, q.interest, 0.5); // the last payment absorbs the cent rounding
});

test('compound interest: the first month charges balance x APR / 12', () => {
  const f = newFinance(); f.credit = 850;
  signBank(f, 50_000, 12);
  const { report } = monthEnd(f, { cash: 1e6, assets: 0 });
  close(-(report.lines.loanInterest ?? 0), 50_000 * 0.07 / 12);
});

test('APR rises as credit falls and +2 with heavy debt payments', () => {
  close(creditApr(850), 7); close(creditApr(300), 19); close(creditApr(650), 7 + 12 * 200 / 550);
  const f = newFinance();
  assert.equal(quoteBank(f, 50_000, 12).dtiAprPct, 0); // no income history yet: no test
  book(f, 'range', 1000);
  monthEnd(f, { cash: 1e6, assets: 0 }); // last month's income $1000
  const q = quoteBank(f, 50_000, 12);
  assert.equal(q.dtiAprPct, 2); close(q.aprPct, creditApr(f.credit) + 2);
  book(f, 'range', 1_000_000); monthEnd(f, { cash: 1e6, assets: 0 });
  assert.equal(quoteBank(f, 5_000, 60).dtiAprPct, 0);
});

test('bank loan limits and bad input', () => {
  const f = newFinance();
  for (const a of [NaN, -5000, 0, 4999, 250_001, Infinity]) assert.equal(quoteBank(f, a, 12).ok, false);
  assert.equal(quoteBank(f, 10_000, 7).ok, false);
  assert.equal(quoteBank(f, 10_000, NaN).ok, false);
  assert.equal(signBank(f, NaN, 12).ok, false); assert.equal(f.loans.length, 0);
  assert.ok(quoteBank(f, 5_000, 12).ok); assert.ok(quoteBank(f, 250_000, 60).ok);
});

test('murabaha: total = cost x (1 + 4.5% a year of the term), equal instalments, no growth', () => {
  const q = quoteMurabaha(20_000, 24);
  assert.ok(q.ok); close(q.markupPct, 9); close(q.total, 20_000 * 1.09); close(q.payment, 20_000 * 1.09 / 24);
  const f = newFinance();
  const s = signMurabaha(f, 20_000, 24, 'Irrigation'); assert.ok(s.ok); assert.equal(s.cash, 20_000);
  let paid = 0;
  for (let i = 0; i < 24; i++) { const r = monthEnd(f, { cash: 1e6, assets: 0 }); paid += -r.cashChange; }
  close(paid, 21_800, 0.05); assert.equal(f.loans.length, 0);
  assert.equal(quoteMurabaha(4_999, 12).ok, false); assert.equal(quoteMurabaha(NaN, 12).ok, false); assert.equal(quoteMurabaha(10_000, 5).ok, false);
});

test('murabaha balance is the price and never grows', () => {
  const f = newFinance(); signMurabaha(f, 12_000, 12, 'Mowers');
  const total = f.loans[0]!.balance; close(total, 12_000 * 1.045);
  for (let i = 0; i < 5; i++) { monthEnd(f, { cash: 1e6, assets: 0 }); assert.ok(f.loans[0]!.balance <= total); }
  close(f.loans[0]!.balance, total - 5 * f.loans[0]!.payment, 0.05);
});

test('murabaha early settlement rebates half the unearned markup', () => {
  const f = newFinance(); signMurabaha(f, 24_000, 24, 'Clubhouse'); // markup 9% = 2160
  for (let i = 0; i < 6; i++) monthEnd(f, { cash: 1e6, assets: 0 });
  const l = f.loans[0]!;
  const unearned = 2160 * 18 / 24; // 1620
  close(murabahaRebate(l), unearned / 2); // 810
  close(settleCost(l), l.balance - 810);
  assert.equal(repay(f, l.id, 100, 1e6).ok, false); // must settle in full
  assert.equal(repay(f, l.id, 1e6, 100).ok, false); // cannot afford
  const r = repay(f, l.id, 1e6, 1e6); assert.ok(r.ok && r.closed); close(r.paid, settleCost(l));
  assert.equal(f.loans.length, 0);
});

test('murabaha late instalment costs a flat $50 and no interest', () => {
  const f = newFinance(); signMurabaha(f, 12_000, 12, 'Pump');
  const pay = f.loans[0]!.payment;
  const r = monthEnd(f, { cash: 100, assets: 0 });
  close(r.cashChange, -(pay + LATE_FEE) + (r.report.lines.overdraftInterest ?? 0));
  assert.equal(f.loans[0]!.missed, 1);
  assert.equal(r.report.lines.otherOut, -LATE_FEE);
  assert.equal(r.report.lines.overdraftInterest !== undefined, true); // the cash went negative: that is the overdraft's interest, not the loan's
  close(f.loans[0]!.balance, 12_000 * 1.045 - pay, 0.01); // the price did not grow
});

test('bank prepay: part payment re-amortises, full payment closes, no penalty', () => {
  const f = newFinance(); f.credit = 850; signBank(f, 60_000, 36);
  const l = f.loans[0]!;
  const p0 = l.payment;
  const r = repay(f, l.id, 20_000, 1e6); assert.ok(r.ok && !r.closed);
  close(l.balance, 40_000); assert.ok(l.payment < p0);
  close(l.payment, amortisedPayment(40_000, 7, 36), 0.01);
  assert.equal(repay(f, l.id, 50_000, 10_000).ok, false); // not enough cash
  const r2 = repay(f, l.id, 1e9, 1e9); assert.ok(r2.ok && r2.closed); close(r2.paid, 40_000); assert.equal(f.loans.length, 0);
  assert.equal(repay(f, 999, 10, 10).ok, false); assert.equal(repay(f, 1, NaN, 10).ok, false);
});

test('savings: deposit, withdraw, 4%/12 a month for 12 months', () => {
  const f = newFinance();
  assert.equal(deposit(f, 10_000, 5_000), 5_000); // cannot deposit more cash than you have
  assert.equal(deposit(f, -5, 1000), 0); assert.equal(deposit(f, NaN, 1000), 0);
  assert.equal(withdraw(f, 2_000), 2_000); assert.equal(f.savings, 3_000);
  assert.equal(withdraw(f, 1e9), 3_000); assert.equal(f.savings, 0); assert.equal(withdraw(f, 10), 0);
  deposit(f, 10_000, 10_000);
  for (let i = 0; i < 12; i++) monthEnd(f, { cash: 1000, assets: 0 });
  close(f.savings, 10_000 * Math.pow(1 + 0.04 / 12, 12), 0.2); // 10,407.42
  assert.ok(f.savings > 10_400 && f.savings < 10_410);
  assert.equal(f.history[11]!.lines.savingsInterest! > 0, true);
});

test('overdraft: negative cash pays 2.5% a month and costs credit', () => {
  const f = newFinance();
  const r = monthEnd(f, { cash: -10_000, assets: 0 });
  close(r.cashChange, -250); close(r.report.cash, -10_250); close(r.report.lines.overdraftInterest!, -250);
  assert.equal(f.credit, CREDIT_START + 5 - 10);
  const ok = monthEnd(newFinance(), { cash: 5_000, assets: 0 });
  assert.equal(ok.cashChange, 0); assert.equal(ok.report.lines.overdraftInterest, undefined);
});

test('bankruptcy: overdraft past $50k or three month ends in a row', () => {
  const f = newFinance();
  assert.equal(isBankrupt(f, -50_001), true); assert.equal(isBankrupt(f, -50_000), false); assert.equal(isBankrupt(f, 0), false);
  monthEnd(f, { cash: -1000, assets: 0 }); monthEnd(f, { cash: -1000, assets: 0 });
  assert.equal(overdraftStreak(f), 2); assert.equal(isBankrupt(f, -1000), false);
  monthEnd(f, { cash: -1000, assets: 0 });
  assert.equal(overdraftStreak(f), 3); assert.equal(isBankrupt(f, 0), true);
  const g = newFinance(); monthEnd(g, { cash: -1, assets: 0 }); monthEnd(g, { cash: 100, assets: 0 }); monthEnd(g, { cash: -1, assets: 0 });
  assert.equal(overdraftStreak(g), 1);
});

test('credit score: +5 on time (to 850), -40 a missed payment, -10 in overdraft, floor 300', () => {
  const f = newFinance();
  monthEnd(f, { cash: 1000, assets: 0 }); assert.equal(f.credit, 655);
  f.credit = 848; monthEnd(f, { cash: 1000, assets: 0 }); assert.equal(f.credit, 850);
  monthEnd(f, { cash: 1000, assets: 0 }); assert.equal(f.credit, 850);
  signBank(f, 10_000, 12);
  monthEnd(f, { cash: 0, assets: 0 }); // cannot cover the payment: -40, and the overdraft -10
  assert.equal(f.credit, 800);
  f.credit = 310; monthEnd(f, { cash: -1000, assets: 0 }); assert.equal(f.credit, 300);
  const q = quoteBank(newFinance(), 10_000, 12), q2 = quoteBank(f, 10_000, 12);
  assert.ok(q2.aprPct > q.aprPct);
});

test('a missed bank payment is still taken and the account goes negative', () => {
  const f = newFinance(); signBank(f, 10_000, 12);
  const pay = f.loans[0]!.payment;
  const r = monthEnd(f, { cash: 50, assets: 0 });
  assert.ok(r.cashChange <= -pay); assert.ok(r.report.cash < 0); assert.equal(f.loans[0]!.missed, 1);
  assert.ok(r.report.events.some((e) => /Could not cover/.test(e)));
});

test('insurance premium is charged monthly and insuredLoss applies the deductible', () => {
  const f = newFinance(); f.insurance = 'basic';
  const r = monthEnd(f, { cash: 10_000, assets: 0 });
  assert.equal(r.cashChange, -150); assert.equal(r.report.lines.insurance, -150);
  assert.deepEqual(insuredLoss('none', 8000), { youPay: 8000, insurerPays: 0 });
  assert.deepEqual(insuredLoss('basic', 12_000), { youPay: 5000 + 7000 * 0.3, insurerPays: 7000 * 0.7 });
  assert.deepEqual(insuredLoss('full', 10_000), { youPay: 1000 + 900, insurerPays: 8100 });
  assert.deepEqual(insuredLoss('full', NaN), { youPay: 0, insurerPays: 0 });
});

test('month report: net worth, debt, lines reset, history capped at 60', () => {
  const f = newFinance(); signBank(f, 50_000, 60);
  book(f, 'range', 8000); book(f, 'wages', -3000);
  const r = monthEnd(f, { cash: 20_000, assets: 100_000, label: 'Sep 1984' });
  assert.equal(r.report.label, 'Sep 1984'); assert.equal(r.report.month, 0); assert.equal(f.month, 1);
  assert.equal(r.report.lines.range, 8000); assert.deepEqual(f.cur, {});
  close(r.report.debt, debtOf(f));
  close(r.report.netWorth, r.report.cash + r.report.savings + 100_000 - r.report.debt);
  for (let i = 0; i < 80; i++) monthEnd(f, { cash: 1e6, assets: 0 });
  assert.equal(f.history.length, HISTORY_CAP);
});

test('NaN and negative guards in monthEnd', () => {
  const f = newFinance();
  const r = monthEnd(f, { cash: NaN, assets: NaN });
  assert.equal(r.cashChange, 0); assert.ok(Number.isFinite(r.report.netWorth));
  const r2 = monthEnd(f, { cash: 100, assets: -500 });
  assert.equal(r2.report.assets, 0);
  assert.ok(Number.isFinite(f.credit));
});

test('effectiveApr: a flat 4.5% markup costs more than 4.5% a year', () => {
  const q = quoteMurabaha(10_000, 12);
  const e = effectiveApr(10_000, q.payment, 12);
  assert.ok(e > 7 && e < 9, String(e)); // about 8.2%
  assert.equal(effectiveApr(0, 10, 12), 0); assert.equal(effectiveApr(NaN, 10, 12), 0);
});

test('save round trip, old saves and junk give a usable bank', () => {
  const f = newFinance(); signBank(f, 10_000, 12); book(f, 'range', 5); monthEnd(f, { cash: 1000, assets: 0 });
  const g = loadFinance(JSON.parse(JSON.stringify(f)));
  assert.deepEqual(g, f);
  for (const bad of [undefined, null, 5, 'x', {}, { v: 2 }, { v: 1, loans: 'no', credit: NaN, savings: -5, history: 3 }]) {
    const h = loadFinance(bad); assert.equal(h.v, 1); assert.ok(Array.isArray(h.loans)); assert.ok(h.credit >= 300 && h.credit <= 850); assert.ok(h.savings >= 0);
  }
  const n = f.nextId; signBank(g, 10_000, 12); assert.equal(g.loans[g.loans.length - 1]!.id, n);
});

test('assetsAtCost sums the build line over the history and this month, refunds count', () => {
  const f = newFinance();
  assert.equal(assetsAtCost(f), 0);
  book(f, 'build', -10_000); monthEnd(f, { cash: 1e6, assets: 0 });
  book(f, 'build', -5_000); book(f, 'build', 1_000);
  assert.equal(assetsAtCost(f), 14_000);
  book(f, 'build', 100_000); assert.equal(assetsAtCost(f), 0); // never negative
});

test('murabaha markup is booked on its own line, never as loan interest', () => {
  const f = newFinance(); signMurabaha(f, 12_000, 12, 'Pump');
  const r = monthEnd(f, { cash: 1e6, assets: 0 });
  close(-(r.report.lines.markup ?? 0), 12_000 * 0.045 / 12, 0.02);
  assert.equal(r.report.lines.loanInterest, undefined);
  close(-(r.report.lines.loanPrincipal ?? 0), 12_000 / 12, 0.02); // the cost share of the instalment
  const g = newFinance(); signMurabaha(g, 24_000, 24, 'Clubhouse'); for (let i = 0; i < 6; i++) monthEnd(g, { cash: 1e6, assets: 0 });
  const l = g.loans[0]!; const rebate = murabahaRebate(l);
  repay(g, l.id, 1e6, 1e6);
  assert.equal(g.cur.loanInterest, undefined); assert.ok((g.cur.markup ?? 0) < 0);
  assert.ok(rebate > 0);
});

test('opening assets count at cost with what is built later; old saves read none', () => {
  const f = newFinance(); f.opening = 40_000;
  assert.equal(assetsAtCost(f), 40_000);
  book(f, 'build', -10_000); assert.equal(assetsAtCost(f), 50_000);
  assert.equal(loadFinance(JSON.parse(JSON.stringify(f))).opening, 40_000);
  assert.equal(loadFinance({ v: 1, opening: NaN }).opening, undefined);
  assert.equal(assetsAtCost(newFinance()), 0);
});

test('balanceBooks: the month lines add up to the treasury change less the bank own moves', () => {
  const f = newFinance();
  book(f, 'range', 1000); book(f, 'wages', -300); book(f, 'savingsInterest', 5); // savings interest is not cash
  assert.equal(cashLinesSum(f), 700);
  // the treasury rose by 700 + a $20,000 loan paid in + $350 nothing booked
  assert.equal(booksGap(f, 21_050, 20_000), 350);
  assert.equal(balanceBooks(f, 21_050, 20_000), 350);
  assert.equal(f.cur.otherIn, 350);
  assert.equal(booksGap(f, 21_050, 20_000), 0); // now balanced
  assert.equal(balanceBooks(f, 21_050, 20_000), 0);
  // money left with no line: booked as otherOut
  const h = newFinance(); book(h, 'range', 100);
  assert.equal(balanceBooks(h, -400, 0), -500); assert.equal(h.cur.otherOut, -500);
  assert.equal(cashLinesSum(h), -400);
  // NaN never poisons the books
  const n = newFinance(); assert.equal(balanceBooks(n, NaN, NaN), 0);
});
