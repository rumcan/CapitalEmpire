import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statementOf, netWorthSeries, interestToDate, emergencyTotals, goalState, reportCard, GOAL, type Report } from '../src/game/golf/reports';

const rep = (month: number, lines: Report['lines'], nw: number, extra: Partial<Report> = {}): Report =>
  ({ month, label: `M${month}`, lines, cash: 1000, savings: 0, debt: 0, assets: nw, netWorth: nw, credit: 650, events: [], ...extra });

test('statement groups income and costs, and profit leaves out building and repayments', () => {
  const h = [rep(0, {}, 50000), rep(1, { range: 6000, greenFees: 2000, savingsInterest: 20, wages: -3000, upkeep: -1000, loanInterest: -300, loanPrincipal: -700, build: -9000, insurance: -150 }, 52000)];
  const s = statementOf(h)!;
  assert.equal(s.incomeTotal, 8020);
  assert.equal(s.costsTotal, 4450);
  assert.equal(s.profit, 3570);
  assert.equal(s.building, 9000); assert.equal(s.repaid, 700); assert.equal(s.interestPaid, 300);
  assert.equal(s.netWorthChange, 2000);
  assert.equal(statementOf([]), null);
});

test('series, interest and emergencies', () => {
  const h = [
    rep(0, { loanInterest: -100, savingsInterest: 10 }, 10),
    rep(1, { overdraftInterest: -50, emergency: -4000 }, 20, { emergencies: [{ id: 'pump', name: 'Pump', cost: 6000, insured: 2000, youPay: 4000 }] }),
    rep(2, { emergency: -3000 }, 30, { cash: -5 }),
  ];
  assert.deepEqual(netWorthSeries(h).map(p => p.value), [10, 20, 30]);
  assert.deepEqual(interestToDate(h), { paid: 150, earned: 10 });
  assert.deepEqual(emergencyTotals(h), { count: 2, cost: 9000, covered: 2000, outOfPocket: 7000, weathered: 1 });
});

test('NaN and missing lines are safe', () => {
  const h = [rep(0, { range: NaN, wages: undefined } as never, NaN)];
  const s = statementOf(h)!; assert.ok(Number.isFinite(s.profit) && Number.isFinite(s.netWorth));
  const c = reportCard(h, { holes: NaN, cash: NaN, netWorth: NaN, debt: NaN });
  assert.ok(Number.isFinite(c.score));
});

test('goal state and grades', () => {
  const good: Report[] = Array.from({ length: 24 }, (_, i) => rep(i, { range: 10000, wages: -2000 }, 100000 + i * 10000));
  const win = reportCard(good, { holes: 9, cash: 5000, netWorth: 260000, debt: 0 });
  assert.equal(win.grade, 'A'); assert.ok(win.final); assert.ok(win.goal.met);
  const poor = reportCard(good, { holes: 2, cash: -9000, netWorth: 20000, debt: 90000 });
  assert.equal(poor.grade, 'F'); assert.ok(!poor.goal.met);
  assert.ok(goalState([], { holes: 3, cash: 1, netWorth: 125000, debt: 0 }).netWorthPct === 0.5);
  assert.equal(GOAL.holes, 9);
  const nearly = reportCard(good, { holes: 8, cash: 5000, netWorth: 249000, debt: 0 });
  assert.ok(nearly.grade !== 'A');
});

import { pendingMoments, MOMENTS } from '../src/game/golf/reports';

test('money moments: due once, in order, and not again once recorded', () => {
  const none = { loans: [], history: [] as Report[], moments: [] as string[] };
  assert.deepEqual(pendingMoments(none, 100), []);
  assert.deepEqual(pendingMoments(none, -5), ['overdraft']);
  const h = [
    rep(0, { range: 5000, wages: -1000, loanInterest: -80 }, 120000, { debt: 5000 }),
    rep(1, { emergency: -4000 }, 100000, { emergencies: [{ id: 'pump', name: 'Pump', cost: 6000, insured: 0, youPay: 4000 }] }),
  ];
  const f = { loans: [{}], history: h, moments: [] as string[] };
  assert.deepEqual(pendingMoments(f, 10), ['emergencyBare', 'loan', 'interest', 'profit', 'nw100k']);
  f.moments.push('emergencyBare', 'loan');
  assert.deepEqual(pendingMoments(f, 10), ['interest', 'profit', 'nw100k']);
  const cov = { loans: [], history: [rep(0, {}, 1, { emergencies: [{ id: 'x', name: 'x', cost: 9000, insured: 3000, youPay: 6000 }] })], moments: [] };
  assert.deepEqual(pendingMoments(cov, 1), ['emergencyCovered']);
  for (const id of ['loan', 'interest', 'emergencyBare', 'emergencyCovered', 'profit', 'nw100k', 'overdraft', 'priceLoss']) assert.ok(MOMENTS[id].length > 10 && MOMENTS[id].length < 140, id);
});
