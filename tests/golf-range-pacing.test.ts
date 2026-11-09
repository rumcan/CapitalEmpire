// The first hour of the range ball loop (T386, #1043): hand-picking is necessary at first, the first tool comes quickly, and the money buys the next
// tool. A scripted player works the outfield without a break (his effective pick rate comes from the kit's numbers and the walking speeds: golf/rangeauto.ts tripBps)
// and buys the next tool of the tree as soon as the range's till pays for it; the range sells what the ball room holds at the demand the range's own formulas give
// (golf/rangesave.ts arrivalRate, the bays' turnover). The milestones are the minutes of play (at the 10-minute town day, speed 1). Part 2 adds the dirty balls, the tap and
// the washer, the first attendant and the robots. Run with PACING=1 for the timelines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_LOSS_FIELD, DAY_LOSS_STOCK, START_BALLS, pickKit, stockOf, visitBalls, type PickKit } from '../src/game/golf/rangeballs';
import { PLAYER_CART, PLAYER_RUN, PLAYER_WORKING, autoKit, bucketValue, robotBps, staffBps, tripBps, washBps } from '../src/game/golf/rangeauto';
import { RANGE_UPGRADES, arrivalRate, defaultRangeBiz, rangeStats, saleValue, upgradeWhy, withUpgrade, type RangeBizSave, type RangeUpgradeId } from '../src/game/golf/rangesave';

const DAY = 600;
/** the balls a second the scripted player brings in with a kit: the trip model at his pace, working without a break (PLAYER_WORKING of the time) */
export const pickBps = (kit: PickKit): number => PLAYER_WORKING * tripBps(kit, { run: PLAYER_RUN, cart: PLAYER_CART });
/** the order the scripted player buys the tools in (part 1) */
const ORDER: RangeUpgradeId[] = ['tube', 'basket', 'pushpick', 'picker', 'nightpick'];
/** and with part 2: the first hire once the push picker is bought, the washer once the cart's picks outrun the tap, then the night cart and the robots */
const ORDER2: RangeUpgradeId[] = ['tube', 'basket', 'pushpick', 'attendant', 'picker', 'washer', 'nightpick', 'robot'];

/** plays minutes of the first hour: returns when each tool was bought (minutes), the till and the balls sold. dirty: part 2's model (picked balls are dirty, the tap and the washer wash
 *  them, the sale takes the clean ones first and the dirty ones earn DIRTY_VALUE; the attendants and the robots pick) */
export function firstHour(minutes: number, o: { price?: number; order?: RangeUpgradeId[]; dirty?: boolean; auto?: boolean } = {}) {
  const order = o.order ?? ORDER, dirty = !!o.dirty, auto = o.auto ?? dirty;
  let s: RangeBizSave = { ...defaultRangeBiz(), price: o.price ?? 6 }; s.balls = { ...s.balls!, till: 0 };
  const vb = visitBalls(DAY), bought: Record<string, number> = {}; let clean = START_BALLS, dirt = 0, field = 0, till = 0, sold = 0, earned = 0, lastDay = 0;
  for (let t = 0; t < minutes * 60; t++) {
    const st = rangeStats(s), hour = (6.5 + t / (DAY / 24)) % 24, day = Math.floor((6.5 + t / (DAY / 24)) / 24);
    if (day !== lastDay) { lastDay = day; field -= field * DAY_LOSS_FIELD; clean -= clean * DAY_LOSS_STOCK; }
    // the visits the bays and the demand allow this second, as many as the ball room's buckets
    const bayCap = st.bays / (DAY / 24), want = Math.min(arrivalRate(s, { tier: 1, exits: 2, residents: 0 }, hour, DAY, st), bayCap), visits = Math.min(want, (clean + dirt) / vb);
    const takeC = Math.min(clean, visits * vb), takeD = visits * vb - takeC, m = visits * saleValue(s, DAY, st) * bucketValue(takeC, takeD);
    earned += m; till += m; sold += visits * vb; clean -= takeC; dirt -= takeD; field += visits * vb;
    const a = autoKit(s.owned), pk = pickKit(s.owned), bps = Math.min(pickBps(pk) + (auto ? staffBps(a, pk, hour, 7) + robotBps(a) : 0), field); field -= bps;
    if (dirty) { dirt += bps; const w = Math.min(dirt, washBps(a)); dirt -= w; clean += w; } else clean += bps;
    for (const id of order) { if (s.owned.includes(id)) continue; const why = upgradeWhy({ ...s, balls: { ...s.balls!, till } }, id, 1e9); if (why === '') { const u = RANGE_UPGRADES.find(q => q.id === id)!; till -= u.cost; s = withUpgrade(s, id); bought[id] = Math.round(t / 6) / 10; } break; }
  }
  return { bought, till: Math.round(till), earned: Math.round(earned), sold: Math.round(sold), stock: Math.round(stockOf({ clean, dirty: dirt })), field: Math.round(field) };
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

test('part 2, the first hour with the dirty balls: the first hire about 20 minutes in, the first machine (the washer, once the cart outruns the tap) about 45, robots after it', () => {
  const o = firstHour(75, { order: ORDER2, dirty: true });
  if (process.env.PACING) console.log('pacing2', JSON.stringify(o));
  assert.ok(o.bought.attendant! > o.bought.pushpick! && o.bought.attendant! >= 15 && o.bought.attendant! <= 26, `the first hire (${o.bought.attendant} minutes)`);
  assert.ok(o.bought.washer! > o.bought.picker! && o.bought.washer! >= 35 && o.bought.washer! <= 50, `the first machine, the washer (${o.bought.washer} minutes)`);
  assert.ok(o.bought.robot! > o.bought.washer!, `the robots after it (${o.bought.robot})`);
  // the dirty balls cost something until the washer: every ball clean at once would earn at least as much
  const clean = firstHour(40, { order: ORDER2, auto: true }), dirty = firstHour(40, { order: ORDER2, dirty: true, auto: true });
  assert.ok(dirty.earned <= clean.earned * 1.02 + 500, `dirty balls earn no more (${dirty.earned} against ${clean.earned})`);
});
