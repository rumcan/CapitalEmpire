// The budget (src/game/budget.ts): the property tax, compensation, upkeep, the daily ledger, loans and bankruptcy. Pure, no DOM: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LU, LV } from '../src/game/lots/town';
import { PAYOUT_BASE } from '../src/game/event/config';
import { Budget, DEBT_DAYS, LOAN, START_MONEY, compensation, lotTax, saleOf, segUpkeep, type BudgetSave, type DayIn, type Ledger, type LotIn } from '../src/game/budget';

const lot = (o: Partial<LotIn>): LotIn => ({ use: LU.RES, level: LV.BUILT, decline: 0, cls: 'street', access: 1, ...o });
const EMPTY_DAY: DayIn = { lots: [], segs: [], nodes: [], trade: { arrived: 0, punctual: 0 }, pop: 0 };

test('property tax: a built RES lot on a street at access 1 pays 12; on gravel at access 1.8, 12 * 0.7 * 0.6; derelict and unbuilt pay 0', () => {
  assert.equal(lotTax(lot({})), 12);
  assert.ok(Math.abs(lotTax(lot({ cls: 'gravel', access: 1.8 })) - 12 * 0.7 * 0.6) < 1e-9);
  assert.equal(lotTax(lot({ decline: 3 })), 0);
  assert.equal(lotTax(lot({ level: LV.BUILDING })), 0);
  assert.equal(lotTax(lot({ level: LV.EMPTY })), 0);
});

test('compensation: 0 for an empty lot; by use and level; a tenth of it when derelict', () => {
  assert.equal(compensation({ use: LU.RES, level: LV.EMPTY, decline: 0 }), 0);
  assert.equal(compensation({ use: LU.RES, level: LV.BUILDING, decline: 0 }), 500);
  assert.equal(compensation({ use: LU.COM, level: LV.BUILT, decline: 2 }), 1500);
  assert.equal(compensation({ use: LU.TOUR, level: LV.UPGRADED, decline: 0 }), 10000);
  assert.equal(compensation({ use: LU.RES, level: LV.BUILT, decline: 3 }), 200);
});

test('segment upkeep: 100 tiles of street ground is 150; the same as a bridge is 600', () => {
  assert.equal(segUpkeep({ cls: 'street', len: 100, kind: 0 }), 150);
  assert.equal(segUpkeep({ cls: 'street', len: 100, kind: 1 }), 600);
});

test('a toll and a payout book into the day: in the treasury now, the lines in the ledger and in net; a negative payout is a cost', () => {
  const b = new Budget(); b.money = 1000;
  b.toll(300); b.payout(-500);
  assert.equal(b.money, 800, 'in the treasury now');
  const L = b.endDay(1, EMPTY_DAY);
  assert.equal(L.toll, 300); assert.equal(L.payout, -500);
  assert.equal(L.net, -200); assert.equal(L.money, 800);
  b.payout(PAYOUT_BASE);
  const L2 = b.endDay(2, EMPTY_DAY);
  assert.equal(L2.payout, PAYOUT_BASE); assert.equal(L2.toll, undefined, 'the toll line is absent when none');
  assert.equal(L2.net, PAYOUT_BASE); assert.equal(L2.money, 800 + PAYOUT_BASE);
});

test('endDay books tax, takings, upkeep, signals and interest, and applies them to the treasury', () => {
  const b = new Budget(); b.loans = 2;
  const d: DayIn = {
    lots: [lot({}), lot({ use: LU.COM, level: LV.UPGRADED, cls: 'boulevard' }), lot({ level: LV.EMPTY })],
    segs: [{ cls: 'street', len: 100, kind: 0 }, { cls: 'street', len: 10, kind: 1 }],
    nodes: ['signal', 'roundabout', 'plain'],
    trade: { arrived: 10, punctual: 8 },
    pop: 4000,
  };
  // tax 12 + 70 = 82; takings 1.5 * 8 = 12; upkeep 150 + 60 = 210; signals 20 + 10 = 30; interest 2 * 25000 * 0.01 = 500
  const L = b.endDay(1, d);
  assert.deepEqual(L, { day: 1, property: 82, business: 12, grants: 0, upkeep: 210, signals: 30, interest: 500, construction: 0, compensation: 0, net: -646, money: START_MONEY - 646 });
  assert.equal(b.money, START_MONEY - 646);
  assert.deepEqual(b.history, [L]);
  assert.equal(b.debtDays, 0);
  assert.equal(b.bankrupt, false);
});

test('spending comes out of the treasury now, shows in the next ledger, and today resets; refunds net against construction', () => {
  const b = new Budget();
  b.spend('construction', 1000); b.refund(200); b.spend('compensation', 300);
  assert.equal(b.money, START_MONEY - 1100);
  assert.deepEqual(b.today, { construction: 800, compensation: 300, grants: 0, upkeepLive: 0 });
  const L1 = b.endDay(1, EMPTY_DAY);
  assert.deepEqual(L1, { day: 1, property: 0, business: 0, grants: 0, upkeep: 0, signals: 0, interest: 0, construction: 800, compensation: 300, net: -1100, money: START_MONEY - 1100 });
  assert.deepEqual(b.today, { construction: 0, compensation: 0, grants: 0, upkeepLive: 0 });
  const L2 = b.endDay(2, EMPTY_DAY);
  assert.equal(L2.construction, 0);
  assert.equal(L2.compensation, 0);
  assert.equal(L2.net, 0);
  assert.equal(L2.money, START_MONEY - 1100);
});

test('a grant goes into the treasury now and shows as income in the next ledger (net and money); today resets after', () => {
  const b = new Budget();
  b.grant(10000); b.spend('construction', 1000);
  assert.equal(b.money, START_MONEY + 9000);
  assert.equal(b.today.grants, 10000);
  const L1 = b.endDay(1, EMPTY_DAY);
  assert.deepEqual(L1, { day: 1, property: 0, business: 0, grants: 10000, upkeep: 0, signals: 0, interest: 0, construction: 1000, compensation: 0, net: 9000, money: START_MONEY + 9000 });
  assert.deepEqual(b.today, { construction: 0, compensation: 0, grants: 0, upkeepLive: 0 });
  const L2 = b.endDay(2, EMPTY_DAY);
  assert.equal(L2.grants, 0);
  assert.equal(L2.net, 0);
  assert.equal(L2.money, START_MONEY + 9000);
});

test('a save from before grants: its ledgers read with grants 0', () => {
  const old: BudgetSave = { base: 0, money: 1000, loans: 0, debtDays: 0, bankrupt: false, history: [{ day: 1, property: 5, business: 0, upkeep: 0, signals: 0, interest: 0, construction: 0, compensation: 0, net: 5, money: 1000 } as Ledger] };
  const b = Budget.from(old);
  assert.equal(b.history[0]!.grants, 0);
  assert.equal(b.history[0]!.net, 5);
  assert.equal(b.endDay(2, EMPTY_DAY).grants, 0);
});

test('loans: the limit is one unit per 2000 residents from one, at most 6; repay needs the cash', () => {
  const b = new Budget();
  assert.equal(b.maxLoans(0), 1);
  assert.equal(b.maxLoans(1999), 1);
  assert.equal(b.maxLoans(2000), 2);
  assert.equal(b.maxLoans(10000), 6);
  assert.equal(b.maxLoans(50000), 6);
  assert.equal(b.borrow(0), true);
  assert.equal(b.loans, 1);
  assert.equal(b.money, START_MONEY + LOAN);
  assert.equal(b.borrow(0), false);
  assert.equal(b.loans, 1);
  assert.equal(b.borrow(2000), true);
  assert.equal(b.loans, 2);
  b.money = LOAN - 1;
  assert.equal(b.repay(), false);
  b.money = 2 * LOAN;
  assert.equal(b.repay(), true);
  assert.equal(b.loans, 1);
  assert.equal(b.money, LOAN);
  assert.equal(new Budget().repay(), false);
});

test('bankruptcy: DEBT_DAYS days in the red in a row bankrupt the city; a day in the black resets the count; bankruptcy sticks', () => {
  const b = new Budget(); b.money = -1;
  for (let k = 1; k < DEBT_DAYS; k++) { b.endDay(k, EMPTY_DAY); assert.equal(b.debtDays, k); assert.equal(b.bankrupt, false); }
  b.endDay(DEBT_DAYS, EMPTY_DAY);
  assert.equal(b.debtDays, DEBT_DAYS);
  assert.equal(b.bankrupt, true);

  const c = new Budget(); c.money = -1;
  c.endDay(1, EMPTY_DAY); c.endDay(2, EMPTY_DAY); c.endDay(3, EMPTY_DAY);
  assert.equal(c.debtDays, 3);
  c.money = 5000;
  c.endDay(4, EMPTY_DAY);
  assert.equal(c.debtDays, 0);
  assert.equal(c.bankrupt, false);
  c.money = -1;
  for (let k = 5; k < 5 + DEBT_DAYS - 1; k++) c.endDay(k, EMPTY_DAY);
  assert.equal(c.bankrupt, false);
  c.endDay(20, EMPTY_DAY);
  assert.equal(c.bankrupt, true);
  c.money = 100000;
  c.endDay(21, EMPTY_DAY);
  assert.equal(c.debtDays, 0);
  assert.equal(c.bankrupt, true);
});

test('history keeps the newest 30 ledgers', () => {
  const b = new Budget();
  for (let k = 1; k <= 35; k++) b.endDay(k, EMPTY_DAY);
  assert.equal(b.history.length, 30);
  assert.equal(b.history[0]!.day, 6);
  assert.equal(b.history[29]!.day, 35);
});

test('toJSON and from round-trip; from(undefined, money) is a fresh budget with that money', () => {
  const b = new Budget(); b.spend('construction', 500); b.borrow(4000); b.endDay(1, EMPTY_DAY); b.money = -5; b.endDay(2, EMPTY_DAY);
  const s = JSON.parse(JSON.stringify(b.toJSON()));
  const r = Budget.from(s);
  assert.deepEqual(r.toJSON(), b.toJSON());
  assert.equal(r.money, b.money);
  assert.equal(r.loans, 1);
  assert.equal(r.debtDays, 1);
  assert.deepEqual(r.history, b.history);
  assert.equal(Budget.from(undefined, 12345).money, 12345);
  assert.equal(Budget.from(undefined).money, START_MONEY);
  assert.equal(Budget.from(undefined).loans, 0);
});

test('land sales: saleOf is 2000 x the class value x 0.3 on paved roads and nothing on gravel; sale() is income now and in the next ledger', () => {
  assert.equal(saleOf('road'), 660); assert.equal(saleOf('boulevard'), 840); assert.equal(saleOf('gravel'), 0);
  const b = new Budget(); b.money = 1000;
  b.sale(660);
  assert.equal(b.money, 1660, 'the sale is in the treasury at once');
  const L = b.endDay(1, EMPTY_DAY);
  assert.equal(L.sales, 660); assert.equal(L.net, 660); assert.equal(b.money, 1660);
  assert.equal(b.endDay(2, EMPTY_DAY).sales, undefined, 'a day with no sale has no sales line');
});
