// The first hour of the range ball loop (T386, #1043): hand-picking is necessary at first, the first tool comes quickly, and the money buys the next
// tool. A scripted player works the outfield without a break (his effective pick rate comes from the kit's numbers and the walking speeds, golf/rangeballs.ts
// and golf/you.ts) and buys the next tool of the tree as soon as the range's till pays for it; the range sells what the ball room holds at the demand the
// range's own formulas give (golf/rangesave.ts arrivalRate, the bays' turnover). The milestones are the minutes of play (at the 10-minute town day, speed 1).
// Run with PACING=1 for the timeline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_LOSS_FIELD, DAY_LOSS_STOCK, START_BALLS, pickKit, visitBalls, type PickKit } from '../src/game/golf/rangeballs';
import { RANGE_UPGRADES, arrivalRate, defaultRangeBiz, rangeStats, saleValue, upgradeWhy, withUpgrade, type RangeBizSave, type RangeUpgradeId } from '../src/game/golf/rangesave';
import { YOU_RUN } from '../src/game/golf/you';
import { CART_TILES } from '../src/game/golf/play/yours';

/** how the scripted player works: the tiles from the ball room to where the balls lie (the aims' piles are 33 to 83 tiles out, the nearer more often), the share
 *  of his time he really picks (clicks, turns, a look at the card), the balls a tile held where a swath passes (a pile's density) and the town day */
const TRIP_TILES = 28, WORKING = 0.85, DENSITY = 2, DAY = 600, START = { tier: 1, exits: 2, residents: 0 };
/** the balls a second the scripted player brings in with a kit, from the trips he makes: on foot at a run, to a pile and back with a full basket (the basket is
 *  filled at the kit's rate, or by the push picker's swath as he runs through the pile); in the cart at its speed with its hopper */
export function pickBps(kit: PickKit): number {
  if (kit.cart > 0) { const cyc = 2 * TRIP_TILES / CART_TILES + kit.hopper / (kit.cart * CART_TILES * DENSITY); return WORKING * kit.hopper / cyc; }
  if (kit.push > 0) { const cyc = 2 * TRIP_TILES / YOU_RUN + kit.basket / (kit.push * YOU_RUN * DENSITY); return WORKING * kit.basket / cyc; }
  const cyc = 2 * TRIP_TILES / YOU_RUN + kit.basket / kit.rate; return WORKING * kit.basket / cyc;
}
/** the order the scripted player buys the tools in */
const ORDER: RangeUpgradeId[] = ['tube', 'basket', 'pushpick', 'picker', 'nightpick'];

/** plays minutes of the first hour: returns when each tool was bought (minutes), the till and the balls sold */
export function firstHour(minutes: number, price = 6) {
  let s: RangeBizSave = { ...defaultRangeBiz(), price }; s.balls = { ...s.balls!, till: 0 };
  const vb = visitBalls(DAY), bought: Record<string, number> = {}; let stock = START_BALLS, field = 0, till = 0, sold = 0, earned = 0, lastDay = 0;
  for (let t = 0; t < minutes * 60; t++) {
    const st = rangeStats(s), hour = (6.5 + t / (DAY / 24)) % 24, day = Math.floor((6.5 + t / (DAY / 24)) / 24);
    if (day !== lastDay) { lastDay = day; const lf = field * DAY_LOSS_FIELD, ls = stock * DAY_LOSS_STOCK; field -= lf; stock -= ls; }
    // the visits the bays and the demand allow this second, as many as the ball room's buckets
    const bayCap = st.bays / (DAY / 24), want = Math.min(arrivalRate(s, START, hour, DAY, st), bayCap), visits = Math.min(want, stock / vb);
    const m = visits * saleValue(s, DAY, st); earned += m; till += m; sold += visits * vb; stock -= visits * vb; field += visits * vb;
    const bps = Math.min(pickBps(pickKit(s.owned)), field); field -= bps; stock += bps;
    for (const id of ORDER) { if (s.owned.includes(id)) continue; const why = upgradeWhy({ ...s, balls: { ...s.balls!, till } }, id, 1e9); if (why === '') { const u = RANGE_UPGRADES.find(q => q.id === id)!; till -= u.cost; s = withUpgrade(s, id); bought[id] = Math.round(t / 6) / 10; } break; }
  }
  return { bought, till: Math.round(till), earned: Math.round(earned), sold: Math.round(sold), stock: Math.round(stock), field: Math.round(field) };
}

test('the first hour: the first tool within a few minutes of hand-picking, each next tool a few more, and the range never stops earning', () => {
  const o = firstHour(60);
  if (process.env.PACING) console.log('pacing', JSON.stringify(o), 'bps by kit', ORDER.map((_, i) => pickBps(pickKit(ORDER.slice(0, i)))).map(n => n.toFixed(2)).join(' '));
  assert.ok(o.bought.tube! >= 1 && o.bought.tube! <= 4, `the ball tube comes quickly, but not before any ball is picked up (${o.bought.tube} minutes)`);
  assert.ok(o.bought.basket! > o.bought.tube! && o.bought.basket! <= 12, `then the basket within the first two town days (${o.bought.basket})`);
  assert.ok(o.bought.pushpick! > o.bought.basket! && o.bought.pushpick! <= 20, `the push picker by 20 minutes, about when the first hire comes (${o.bought.pushpick})`);
  assert.ok(o.bought.picker! > o.bought.pushpick! && o.bought.picker! >= 25 && o.bought.picker! <= 36, `the cart that tows a picker in the second half hour (${o.bought.picker})`);
  assert.ok(o.bought.nightpick! > o.bought.picker! && o.bought.nightpick! <= 46, `night picking just before the first machine's time (${o.bought.nightpick})`);
  assert.ok(o.earned > 20000, `the hour's takings (${o.earned})`);
});

test('by hand alone the range earns a fraction of what its bays could: picking is necessary (a hand-picked range sells about a tenth of its demand)', () => {
  const hand = pickBps(pickKit([])), demand = 40 * 0.2; // (visits a second at the start's busiest x a bucket's balls: about 8 balls a second)
  assert.ok(hand > 0.2 && hand < 0.7, `by hand about half a ball a second (${hand.toFixed(2)})`);
  assert.ok(hand < demand / 10, 'a tenth of what the bays could sell');
  const k = (...ids: string[]) => pickBps(pickKit(ids));
  assert.ok(k('tube') > hand && k('tube', 'basket') > k('tube') && k('tube', 'pushpick') > k('tube', 'basket') && k('tube', 'pushpick', 'picker') > 4 * k('tube', 'pushpick'), 'each tool is worth having');
});
