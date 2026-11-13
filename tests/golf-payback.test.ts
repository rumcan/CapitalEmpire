// J4 (#1207, docs/JAM.md): the payback and price readouts (src/game/golf/payback.ts) and the golf UI's money format (src/ui/golf/money.ts): the
// verdicts against hand numbers, the zero, negative and NaN guards, golf mode's months (a season is 12, a month is MONTH_LEN sim s), the range's
// upgrades and price ladder against its own demand model, the course's estimates, the membership ladder, and USD/AED with safe money.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NO_INCOME, PAYBACK_MAX_MONTHS, greenFeesMonth, halfwayMonth, holeExtra, memberPriceLadder, payback, paybackWords, perMonthFromSeason, perMonthFromSim,
  practiceExtra, rangePriceLadder, rangeSeason, rangeUpgradeExtra,
} from '../src/game/golf/payback';
import { MONTH_LEN } from '../src/game/golf/calendar';
import { RANGE_UPGRADES, defaultRangeBiz, type DemandCtx } from '../src/game/golf/rangesave';
import { PRICE_STEP, type ClubInputs } from '../src/game/golf/club';
import { AED_PER_USD, loadMoneyPrefs, money, moneyDelta, setMoneyPrefs } from '../src/ui/golf/money';

/** a quiet start (the 4 bays have room) and a busy one (they are full) */
const CTX: DemandCtx = { tier: 0, exits: 1, residents: 300 }, BUSY: DemandCtx = { tier: 1, exits: 2, residents: 3000 };
const DAY = 1440;

test('payback: cost over the net a month, rounded up', () => {
  const p = payback(12000, 100, 1100);
  assert.equal(p.net, 1000); assert.equal(p.months, 12); assert.equal(p.verdict, 'pays');
  assert.equal(payback(12001, 100, 1100).months, 13);
  assert.equal(paybackWords(p), 'Pays back in about 12 months');
  assert.equal(paybackWords(payback(500, 0, 1000)), 'Pays back in about a month');
});
test('payback: upkeep at or above the extra income never pays back', () => {
  assert.equal(payback(5000, 300, 300).verdict, 'never');
  assert.equal(payback(5000, 400, 300).verdict, 'never');
  assert.equal(payback(5000, 400, 300).months, null);
  assert.match(paybackWords(payback(5000, 400, 300)), /does not pay back/i);
});
test('payback: no extra income reads as none; nothing to pay is free', () => {
  assert.equal(payback(5000, 30, 0).verdict, 'none');
  assert.equal(payback(5000, 30, NO_INCOME / 2).verdict, 'none');
  assert.equal(payback(0, 0, 0).verdict, 'free');
  assert.equal(payback(0, 10, 100).verdict, 'free');
  assert.equal(payback(0, 10, 100).months, 0);
});
test('payback: past the ceiling is slow', () => {
  const p = payback(PAYBACK_MAX_MONTHS * 100 + 1, 0, 100);
  assert.equal(p.verdict, 'slow'); assert.equal(p.months, null);
  assert.equal(payback(PAYBACK_MAX_MONTHS * 100, 0, 100).months, PAYBACK_MAX_MONTHS);
});
test('payback: NaN, Infinity and negative inputs are guarded', () => {
  for (const bad of [NaN, Infinity, -Infinity, -50]) {
    const a = payback(bad, 10, 1000), b = payback(1000, bad, 1000), c = payback(1000, 10, bad);
    for (const p of [a, b, c]) {
      assert.ok(Number.isFinite(p.cost) && Number.isFinite(p.upkeep) && Number.isFinite(p.extra) && Number.isFinite(p.net));
      assert.ok(p.months === null || Number.isFinite(p.months));
      assert.ok(paybackWords(p).length > 0);
    }
  }
  assert.equal(payback(NaN, 10, 1000).verdict, 'free');
  assert.equal(payback(1000, NaN, 1000).months, 1);
  assert.equal(payback(1000, 10, NaN).verdict, 'none');
});
test('months: a season is 12 months, a month is MONTH_LEN sim s', () => {
  assert.equal(perMonthFromSeason(1200), 100);
  assert.equal(perMonthFromSim(50, MONTH_LEN), 50);
  assert.equal(perMonthFromSim(50, MONTH_LEN * 2), 25);
  assert.equal(perMonthFromSim(50, 0), 0);
  assert.equal(perMonthFromSim(50, NaN), 0);
  assert.equal(perMonthFromSeason(NaN), 0);
});

test('range: the season estimate is finite and positive at the start; bad day lengths are guarded', () => {
  const r = rangeSeason(defaultRangeBiz(), CTX, DAY);
  assert.ok(r.golfers > 0 && r.takings > 0, JSON.stringify(r));
  for (const d of [0, NaN, -5]) { const q = rangeSeason(defaultRangeBiz(), CTX, d); assert.ok(Number.isFinite(q.takings) && q.takings >= 0); }
});
test('range: an appeal upgrade brings extra income; an owned one none; every upgrade gives a finite verdict', () => {
  const s = defaultRangeBiz();
  assert.ok(rangeSeason(s, CTX, DAY).golfers < rangeSeason(s, BUSY, DAY).golfers, 'the quiet start has room');
  assert.ok(rangeUpgradeExtra(s, CTX, DAY, 'teeturf') > 0);
  // full bays: more appeal sends golfers who find no mat, more bays serve them
  assert.equal(rangeUpgradeExtra(s, BUSY, DAY, 'greens'), 0);
  assert.ok(rangeUpgradeExtra(s, BUSY, DAY, 'bays8') > 0);
  assert.equal(rangeUpgradeExtra({ ...s, owned: ['teeturf'] }, CTX, DAY, 'teeturf'), 0);
  for (const u of RANGE_UPGRADES) {
    const x = rangeUpgradeExtra(s, CTX, DAY, u.id), p = payback(u.cost, u.upkeep, x);
    assert.ok(Number.isFinite(x) && x >= 0, u.id);
    assert.ok(['pays', 'slow', 'never', 'none', 'free'].includes(p.verdict), u.id);
  }
});
test('range: a practice green brings extra income once, none when open', () => {
  const s = defaultRangeBiz();
  assert.ok(practiceExtra(s, CTX, DAY, 'putting') > 0);
  const open = { ...s, practice: { ...s.practice, putting: { ...s.practice.putting, open: true } } };
  assert.equal(practiceExtra(open, CTX, DAY, 'putting'), 0);
});
test('range: the price ladder is the price and a dollar either side; dearer means fewer golfers', () => {
  const s = defaultRangeBiz(), L = rangePriceLadder(s, CTX, DAY);
  assert.deepEqual(L.map(r => r.price), [s.price - 1, s.price, s.price + 1]);
  assert.deepEqual(L.map(r => r.now), [false, true, false]);
  assert.ok(L[0]!.golfers >= L[1]!.golfers && L[1]!.golfers >= L[2]!.golfers);
  // at the band's edge only one side is offered
  assert.deepEqual(rangePriceLadder({ ...s, price: 12 }, CTX, DAY).map(r => r.price), [11, 12]);
  assert.deepEqual(rangePriceLadder({ ...s, price: 3 }, CTX, DAY).map(r => r.price), [3, 4]);
});

test('course: green fees grow with the holes; a hole earns nothing without a clubhouse; bad inputs are guarded', () => {
  const c = { quality: 60, rep: 40, holes: 6 };
  // under five holes the course counts as half a nine (yearend.ts dailyGolfers): a third hole adds no visitors
  assert.equal(holeExtra({ ...c, holes: 3 }, true), 0);
  assert.ok(greenFeesMonth({ ...c, holes: 7 }) > greenFeesMonth(c));
  assert.ok(holeExtra(c, true) > 0);
  assert.equal(holeExtra(c, false), 0);
  assert.equal(greenFeesMonth({ quality: 60, rep: 40, holes: 0 }), 0);
  for (const bad of [NaN, -10, Infinity]) {
    assert.ok(Number.isFinite(greenFeesMonth({ quality: bad, rep: bad, holes: 3 })));
    assert.ok(Number.isFinite(holeExtra({ quality: 50, rep: 50, holes: bad }, true)));
    assert.ok(Number.isFinite(halfwayMonth({ quality: bad, rep: 50, holes: 9 })));
  }
  assert.ok(halfwayMonth({ quality: 60, rep: 40, holes: 9 }) > 0);
});

test('members: the dues ladder steps by the stepper; dearer dues sign fewer members', () => {
  const i: ClubInputs = { residents: 4000, quality: 60, rep: 40, holes: 9, visitors: 40, level: 1, waitAvg: 0, slow: 0 };
  const L = memberPriceLadder(50, 40, i);
  assert.deepEqual(L.map(r => r.price), [40 - PRICE_STEP, 40, 40 + PRICE_STEP]);
  assert.ok(L[0]!.golfers >= L[2]!.golfers);
  for (const r of L) assert.ok(Number.isFinite(r.takings));
  assert.deepEqual(memberPriceLadder(NaN, NaN, i).map(r => Number.isFinite(r.golfers) && Number.isFinite(r.takings)), memberPriceLadder(NaN, NaN, i).map(() => true));
});

test('money: USD and AED at the peg, safe money signs and arrows', () => {
  const mem = new Map<string, string>(), st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
  assert.deepEqual(loadMoneyPrefs(st), { currency: 'USD', safe: true });
  assert.equal(money(1200, 'USD'), '$1,200');
  assert.equal(money(1000, 'AED'), `AED ${Math.round(1000 * AED_PER_USD).toLocaleString('en-US')}`);
  assert.equal(money(NaN, 'USD'), '$0');
  assert.equal(money(-300, 'USD'), '−$300');
  setMoneyPrefs({ currency: 'USD', safe: true }, st);
  assert.equal(moneyDelta(1200), '+$1,200 ▲');
  assert.equal(moneyDelta(-300), '−$300 ▼');
  assert.equal(moneyDelta(0), '$0');
  setMoneyPrefs({ safe: false }, st);
  assert.equal(moneyDelta(-300), '−$300');
  setMoneyPrefs({ currency: 'AED' }, st);
  assert.deepEqual(loadMoneyPrefs(st), { currency: 'AED', safe: false });
  assert.equal(moneyDelta(100), `+AED ${Math.round(100 * AED_PER_USD)}`);
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.deepEqual(loadMoneyPrefs(broken), { currency: 'USD', safe: true });
  setMoneyPrefs({ currency: 'USD', safe: true }, broken);
});
