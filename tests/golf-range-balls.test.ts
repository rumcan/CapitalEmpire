// The range ball loop as pure data (T386, #1043: golf/rangeballs.ts) and in the range's sim (golf/rangebiz.ts RangeSim with a book attached): the supply, a
// sale, the balls that land and stay, the night's losses, picking by hand and by swath, the supplier, the save and its migration, the skip, and the sim
// that sells only the balls it has and lands every ball it hits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BALLS_VISIT, BALL_COST, CASES_A_DAY, CASE_BALLS, DAY_LOSS_FIELD, FIELD_CAP, HAND, LEGACY_BALLS_A_BAY, LEGACY_TILL_CAP, START_BALLS, TUBE,
  ballsNear, bucketsLeft, dropInPlay, dump, fieldCount, landBalls, legacyBalls, nearestBall, newBalls, normalizeBalls, orderBalls, overnight, perHour, pickAround, pickKit, pickSwath,
  poolOf, removeRandom, skipBalls, stow, takeBucket, visitBalls, type BallSave,
} from '../src/game/golf/rangeballs';
import { RANGE_UPGRADES, RangeSim, defaultRangeBiz, normalizeRangeBiz, rangeScene, rangeStats, upgradeWhy, withUpgrade, type CarSlot, type RangeUpgradeId } from '../src/game/golf/rangebiz';
import { mulberry } from '../src/game/iso';
import type { Rect } from '../src/game/golf/mode';

const rnd = () => mulberry(0xba11);
const lay = (b: BallSave, pts: [number, number][]) => { for (const [x, y] of pts) b.field.push(x, y); };

test('a bucket holds BALLS_VISIT balls at the 10-minute day and scales with the day length; balls an hour follow the day', () => {
  assert.equal(visitBalls(600), BALLS_VISIT);
  assert.equal(visitBalls(1200), 2 * BALLS_VISIT); assert.equal(visitBalls(300), BALLS_VISIT / 2);
  assert.ok(visitBalls(10) >= 8, 'never a handful');
  assert.equal(perHour(1, 600), 25, 'a ball a sim second is 25 balls a town hour at the reference day');
  assert.equal(perHour(1, 1440), 60);
});

test('the supply: a sale takes a bucket out of the ball room and no more than it holds; every ball hit lies on the outfield and the pool never changes', () => {
  const b = newBalls(), vb = visitBalls(600);
  assert.equal(b.clean, START_BALLS); assert.equal(fieldCount(b), 0); assert.equal(poolOf(b), START_BALLS);
  assert.equal(bucketsLeft(b, vb), Math.floor(START_BALLS / vb));
  assert.ok(takeBucket(b, vb)); assert.equal(b.clean, START_BALLS - vb); assert.equal(b.inPlay, vb); assert.equal(b.day.sold, vb);
  assert.equal(poolOf(b), START_BALLS, 'the golfer\'s hands are part of the pool');
  // a swing lands its share: the first ball where it falls, the rest round it, all inside the fence
  const fence = [10, 10, 20, 20] as const, r = rnd();
  assert.equal(landBalls(b, 15, 15, 8, r, fence), 8); assert.equal(b.inPlay, vb - 8); assert.equal(fieldCount(b), 8);
  assert.deepEqual([b.field[0], b.field[1]], [15, 15], 'the ball you see lands where it was hit');
  for (let i = 0; i < b.field.length; i += 2) { assert.ok(b.field[i]! >= 10 && b.field[i]! <= 20 && b.field[i + 1]! >= 10 && b.field[i + 1]! <= 20); assert.ok(Math.hypot(b.field[i]! - 15, b.field[i + 1]! - 15) < 4.5, 'a swing\'s balls lie close together'); }
  landBalls(b, 18, 12, vb - 8, r, fence); assert.equal(b.inPlay, 0); assert.equal(fieldCount(b), vb); assert.equal(poolOf(b), START_BALLS);
  assert.equal(b.day.hit, vb);
  // a ball the ball room cannot fill
  b.clean = vb - 1; assert.equal(takeBucket(b, vb), false); assert.equal(b.clean, vb - 1); assert.equal(bucketsLeft(b, vb), 0);
  // stray balls: a golfer who left early drops what is left
  b.inPlay = 5; dropInPlay(b, () => ({ x: 12, y: 12 }), r, fence); assert.equal(b.inPlay, 0); assert.equal(fieldCount(b), vb + 5);
});

test('the outfield holds FIELD_CAP balls: past it a ball is lost in the rough', () => {
  const b = newBalls(), r = rnd();
  b.field = new Array(FIELD_CAP * 2 - 2).fill(1); assert.equal(fieldCount(b), FIELD_CAP - 1);
  b.inPlay = 3; assert.equal(landBalls(b, 5, 5, 3, r), 1, 'one more fits'); assert.equal(fieldCount(b), FIELD_CAP); assert.equal(b.day.lost, 2); assert.equal(b.total.lost, 2);
  assert.equal(b.inPlay, 0);
});

test('picking: the nearest balls within reach first, no more than asked, a swath along a leg; each ball leaves the outfield once', () => {
  const b = newBalls(); lay(b, [[10, 10], [10.5, 10], [11, 10], [14, 10], [10, 30]]);
  assert.equal(ballsNear(b, 10, 10, 1.2), 3); assert.equal(ballsNear(b, 10, 10, 0.2), 1);
  assert.deepEqual(nearestBall(b, 12, 10, 3), { x: 11, y: 10 }); assert.equal(nearestBall(b, 50, 50, 3), null);
  assert.equal(pickAround(b, 10, 10, 1.2, 2), 2, 'two of the three within reach'); assert.equal(fieldCount(b), 3);
  assert.equal(ballsNear(b, 10, 10, 0.2), 0, 'the nearest went first (the one under your feet)'); assert.equal(ballsNear(b, 11, 10, 0.2), 1, 'the farthest of the three stays');
  assert.equal(pickAround(b, 10, 10, 1.2, 0), 0); assert.equal(pickAround(b, 40, 40, 1.2, 9), 0);
  // a swath: the roller driven from (10,10) to (14,10) takes the balls within its half width of the leg
  const c = newBalls(); lay(c, [[10, 10], [12, 10.8], [13, 12.5], [14, 10], [12, 20]]);
  assert.equal(pickSwath(c, 10, 10, 14, 10, 1, Infinity), 3, 'the three within one tile of the leg'); assert.equal(fieldCount(c), 2);
  assert.equal(pickSwath(c, 10, 10, 14, 10, 1, Infinity), 0, 'nothing is picked twice');
  const d = newBalls(); lay(d, [[1, 1], [1.5, 1], [2, 1], [2.5, 1]]); assert.equal(pickSwath(d, 1, 1, 3, 1, 1, 2), 2, 'a full hopper takes no more'); assert.equal(fieldCount(d), 2);
});

test('a load into the ball room is counted by who picked it; the pool is whole again', () => {
  const b = newBalls(); lay(b, [[1, 1], [1.2, 1], [1.4, 1]]); b.clean = 0;
  const n = pickAround(b, 1.2, 1, 1, 9); b.basket += n; assert.equal(poolOf(b), 3);
  assert.equal(dump(b, 'basket', 'hand'), 3); assert.equal(b.basket, 0); assert.equal(b.clean, 3); assert.equal(b.day.picked.hand, 3); assert.equal(b.total.picked.hand, 3);
  assert.equal(dump(b, 'basket', 'hand'), 0, 'an empty basket dumps nothing');
  stow(b, 40, 'night'); assert.equal(b.clean, 43); assert.equal(b.total.picked.night, 40);
  b.hopper = 6; assert.equal(dump(b, 'hopper', 'cart'), 6); assert.equal(b.total.picked.cart, 6);
});

test('overnight: a share of the balls lying out and of the stock is lost, the day\'s counts start again, a skip charges at most five nights', () => {
  const b = newBalls(); for (let i = 0; i < 1000; i++) b.field.push(i % 50, Math.floor(i / 50)); b.clean = 1000; b.day.hit = 77; b.day.picked.hand = 5;
  const r = mulberry(7), lost = overnight(b, 1, r);
  assert.ok(Math.abs(fieldCount(b) - 1000 * (1 - DAY_LOSS_FIELD)) <= 1, `about ${DAY_LOSS_FIELD * 100}% of the outfield's balls went (${1000 - fieldCount(b)})`);
  assert.ok(b.clean < 1000 && b.clean >= 994, `a few of the stock wore out (${1000 - b.clean})`);
  assert.equal(lost, 1000 - fieldCount(b) + 1000 - b.clean); assert.equal(b.total.lost, lost); assert.equal(b.day.hit, 0); assert.equal(b.day.picked.hand, 0); assert.equal(b.day.lost, lost);
  const c = newBalls(); for (let i = 0; i < 1000; i++) c.field.push(i % 50, 1); overnight(c, 40, mulberry(7)); assert.ok(fieldCount(c) > 1000 * Math.pow(1 - DAY_LOSS_FIELD, 5) - 5, 'at most five nights are charged');
  const d = newBalls(); d.field = [1, 1]; assert.equal(overnight(d, 0, r), 0, 'no night, no loss');
});

test('the supplier: a case is CASE_BALLS balls at BALL_COST each, CASES_A_DAY a day, and only what the till pays for', () => {
  const b = newBalls(), price = CASE_BALLS * BALL_COST;
  assert.ok(BALL_COST > 8, 'a ball costs more than the dearest bucket earns it, so ordering is a top-up and never the loop');
  const o = orderBalls(b, 2, 0, 10 * price); assert.equal(o.cases, 2); assert.equal(o.cost, Math.round(2 * price)); assert.equal(b.clean, START_BALLS + 2 * CASE_BALLS); assert.equal(b.day.bought, 2 * CASE_BALLS);
  assert.equal(orderBalls(b, 5, 2, 10 * price).cases, CASES_A_DAY - 2, 'the day\'s deliveries are capped');
  assert.equal(orderBalls(b, 1, CASES_A_DAY, 10 * price).cases, 0);
  assert.equal(orderBalls(b, 3, 0, 1.5 * price).cases, 1, 'the till pays for one case only'); assert.equal(orderBalls(b, 1, 0, price - 1).cases, 0);
});

test('the save: it round-trips through JSON, bad numbers and a field past the cap are dropped, a save from before T386 gets a stock for its bays', () => {
  const b = newBalls(); b.till = 1234.567; b.basket = 12; lay(b, [[10.12, 20.34], [11, 21]]); b.total.picked.robot = 4; b.dayNo = 3;
  const back = normalizeBalls(JSON.parse(JSON.stringify(b)))!; assert.deepEqual(back, { ...b, till: 1234.57 });
  assert.equal(normalizeBalls(undefined), undefined); assert.equal(normalizeBalls('x'), undefined);
  const junk = normalizeBalls({ clean: -4, inPlay: NaN, basket: 'a', field: [1, 2, NaN, 3, 4, 5, 6], till: Infinity, day: { picked: { hand: 'x', robot: 3.6 } }, dayNo: 'q' })!;
  assert.equal(junk.clean, 0); assert.equal(junk.inPlay, 0); assert.equal(junk.basket, 0); assert.deepEqual(junk.field, [1, 2, 4, 5], 'a pair with a bad number goes, the pairs after it are read'); assert.equal(junk.till, 0);
  assert.equal(junk.day.picked.hand, 0); assert.equal(junk.day.picked.robot, 4); assert.equal(junk.dayNo, -1);
  assert.equal(normalizeBalls({ field: new Array(FIELD_CAP * 2 + 400).fill(3) })!.field.length, FIELD_CAP * 2, 'the outfield never loads past its cap');
  const L = legacyBalls(12, 90000); assert.equal(L.clean, 12 * LEGACY_BALLS_A_BAY); assert.equal(L.till, LEGACY_TILL_CAP); assert.equal(legacyBalls(4, 1500).till, 1500); assert.equal(legacyBalls(0, NaN).till, 0);
  assert.ok(legacyBalls(1, 0).clean >= START_BALLS);
});

test('old saves: the range saved before the ball loop loads with a stock for its bays and a till of its takings; with the T133 cart it keeps its night picking', () => {
  const old = { v: 1, owned: ['bays8', 'bays12'], price: 6, season: { takings: 5000 }, total: { takings: 22000, golfers: 10 }, practice: {}, guided: true, desert: true };
  const n = normalizeRangeBiz(old); assert.ok(n.balls, 'a ball book'); assert.equal(n.balls!.clean, rangeStats(n).bays * LEGACY_BALLS_A_BAY); assert.equal(n.balls!.till, 22000);
  assert.deepEqual(n.owned, ['bays8', 'bays12']);
  const cart = normalizeRangeBiz({ ...old, owned: ['bays8', 'picker'] });
  assert.deepEqual(cart.owned, ['tube', 'pushpick', 'bays8', 'picker', 'nightpick'], 'the cart kept: its tools first, night picking after it');
  assert.ok(rangeStats(cart).picker, 'the night cart drives as before');
  // a save that has its balls keeps them, and is not given the cart again
  const kept = normalizeRangeBiz({ ...old, owned: ['bays8'], balls: { clean: 77, till: 5 } }); assert.equal(kept.balls!.clean, 77); assert.equal(kept.balls!.till, 5);
  assert.deepEqual(normalizeRangeBiz({ ...old, owned: ['bays8', 'picker'], balls: { clean: 1 } }).owned, ['bays8'], 'a new save cannot own the pull-behind picker without its push picker');
  const fresh = defaultRangeBiz(); assert.equal(fresh.balls!.clean, START_BALLS);
  assert.deepEqual(normalizeRangeBiz(JSON.parse(JSON.stringify(fresh))), fresh);
  assert.ok(normalizeRangeBiz(undefined).balls!.clean >= START_BALLS * 4, 'a range start saved with no range gets its stock too');
});

test('what the tools do: each one is better than the last, and each needs the one before', () => {
  const kit = (...ids: string[]) => pickKit(ids);
  const hand = kit(), tube = kit('tube'), basket = kit('basket'), push = kit('tube', 'pushpick'), cart = kit('tube', 'pushpick', 'picker'), gang = kit('tube', 'pushpick', 'picker', 'gang');
  assert.deepEqual([hand.reach, hand.rate, hand.basket, hand.push, hand.cart], [HAND.reach, HAND.rate, HAND.basket, 0, 0]);
  assert.ok(tube.tube && tube.rate === TUBE.rate && tube.reach > hand.reach && tube.rate > 2 * hand.rate, 'the tube reaches further and is more than twice as fast');
  assert.ok(basket.basket === 2 * HAND.basket && basket.rate === hand.rate);
  assert.ok(push.push > 0 && push.basket > basket.basket); assert.ok(cart.cart > push.push * 1.5 && cart.hopper >= 400); assert.ok(gang.cart > cart.cart && gang.hopper > cart.hopper);
  assert.equal(upgradeWhy(defaultRangeBiz(), 'pushpick', 1e9), 'Build Ball tube first');
  assert.equal(upgradeWhy({ ...defaultRangeBiz(), owned: ['tube', 'pushpick'] }, 'picker', 1e9).startsWith('Not enough in the range\'s till'), true, 'the cart is bought with the till');
});

test('the tools are bought with the till: the treasury is not enough', () => {
  const cost = RANGE_UPGRADES.find(u => u.id === 'tube')!.cost, s = defaultRangeBiz(); s.balls!.till = cost - 1; assert.match(upgradeWhy(s, 'tube', 1e9), /Not enough in the range's till/);
  s.balls!.till = cost; assert.equal(upgradeWhy(s, 'tube', 1e9), ''); assert.match(upgradeWhy(s, 'tube', 100), /Not enough money/, 'and the treasury must hold it too');
  assert.equal(upgradeWhy(withUpgrade(s, 'tube'), 'tube', 1e9), 'Built');
});

test('a skip: the shop serves what its balls allow, day by day; the night cart brings the balls back, the machines pick by day', () => {
  const at = () => ({ x: 20, y: 20 }), vb = visitBalls(600);
  const a = newBalls(); a.clean = 10 * vb;
  assert.equal(skipBalls(a, 100, vb, 600, 600, 0, false, at, rnd(), null), 10, 'ten buckets of balls, ten visits, however many wanted');
  assert.equal(a.clean, 0); assert.equal(fieldCount(a), 10 * vb, 'every ball sold lies out'); assert.equal(poolOf(a), 10 * vb);
  const n = newBalls(); n.clean = 10 * vb;
  const served = skipBalls(n, 100, vb, 3 * 600, 600, 0, true, at, rnd(), null);
  assert.ok(served > 25 && served <= 30, `with the night cart each day's balls come back: ten a day for three days (${served})`);
  const m = newBalls(); m.clean = 10 * vb;
  assert.ok(skipBalls(m, 100, vb, 600, 600, 20 * vb / 600, false, at, rnd(), null) > 10, 'machines that pick all day bring balls back before the day is out');
  assert.equal(skipBalls(newBalls(), 0, vb, 600, 600, 0, true, at, rnd(), null), 0);
  const z = newBalls(); z.clean = 0; assert.equal(skipBalls(z, 50, vb, 600, 600, 0, false, at, rnd(), null), 0, 'an empty ball room sells nothing');
  const r = removeRandom(a, 5, rnd()); assert.equal(r, 5);
});

// ---------------------------------------------------------------- the sim

const plot: Rect = [200, 200, 70, 150];
/** a car park of n bays along the path's end (the sim needs a point, a heading and an entrance) */
function lot(sc: ReturnType<typeof rangeScene>, n = 20): CarSlot[] {
  return Array.from({ length: n }, (_, i) => ({ x: sc.carEdge.x + sc.roadDir.x * (1 + i * 1.5), y: sc.carEdge.y + sc.roadDir.y * (1 + i * 1.5), hx: sc.rangeSide.x, hy: sc.rangeSide.y }));
}
const busy = { tier: 5, exits: 2, residents: 20000 };
/** the sim's clock: the town day starts at 06:30 (a new range game's morning) and runs 600 s; the range is open 07:00 to 18:00, so 285 s in is closing time */
const hourClock = (t: number, dayLen: number) => ({ hour: (6.5 + t / (dayLen / 24)) % 24, day: 1 + Math.floor((6.5 + t / (dayLen / 24)) / 24) });
const CLOSING = 288;
/** the sim from town time t0 for `seconds` in steps of half a second, with a book or none; returns the sim and what happened */
function run(book: BallSave | null, owned: RangeUpgradeId[] = [], seconds = CLOSING, sim?: RangeSim, t0 = 0, s0?: ReturnType<typeof defaultRangeBiz>) {
  const s = s0 ?? owned.reduce((q, id) => withUpgrade(q, id), defaultRangeBiz()); if (book) s.balls = book;
  const sc = rangeScene(plot, 2, s), r = sim ?? new RangeSim(11, 10); if (!sim) { r.setScene(sc, lot(sc), sc.carEdge); r.setBalls(book); }
  let booked = 0; const lost: string[] = [];
  r.onMoney = e => { if (e.kind === 'lost') lost.push(e.why ?? ''); };
  for (let t = 0; t < seconds; t += 0.5) booked += r.step(0.5, hourClock(t0 + t, 600), s, busy, 600);
  return { r, s, sc, booked, lost };
}

test('the sim without a ball book is the range as it was: balls without end, picked at once at closing', () => {
  const o = run(null, ['bays8']); assert.ok(o.booked > 0); assert.ok(o.r.nLying > 20, `balls lie on the range by day (${o.r.nLying})`);
  run(null, ['bays8'], 200, o.r, CLOSING, o.s); assert.equal(o.r.nLying, 0, 'picked at closing');
});

test('with a book the shop sells only the balls it has: it runs dry, the drivers drive on (lost, no balls), and the pool never changes', () => {
  const b = newBalls(); b.clean = 6 * visitBalls(600); const pool = poolOf(b);
  const o = run(b, ['bays8']);
  assert.ok(o.booked > 0, 'it sold'); assert.equal(b.day.sold, b.total.sold); assert.ok(b.total.sold <= 6 * visitBalls(600), `no more than its balls (${b.total.sold})`);
  assert.equal(b.total.sold, 6 * visitBalls(600), 'and it sold them all');
  assert.ok(o.lost.includes('balls'), 'drivers drove on: no balls'); assert.ok(o.r.today.noBalls > 0 && o.r.today.noBalls <= o.r.today.lost);
  assert.equal(poolOf(b), pool, 'every ball is in the ball room, a golfer\'s hands or on the outfield'); assert.equal(fieldCount(b) + b.inPlay, 6 * visitBalls(600), 'the balls sold lie out (or are in a hand about to be hit)');
  assert.equal(b.clean, 0); assert.equal(b.day.hit, fieldCount(b) + 0 * b.inPlay);
  assert.equal(o.s.season.takings, o.booked); assert.ok(o.booked > 5 * 240, 'six buckets, the money of six visits');
});

test('with a book the sim books the same takings for the same visits as without one while the balls last', () => {
  const b = newBalls(); b.clean = 1e6; const o = run(b, ['bays8']), p = run(null, ['bays8']);
  assert.ok(Math.abs(o.booked - p.booked) < 0.12 * p.booked, `the same takings with balls to spare (${Math.round(o.booked)} against ${Math.round(p.booked)})`);
  assert.ok(o.lost.every(w => w !== 'balls'));
});

test('with a book the balls stay: closing time does not pick them, only the night cart does, in its lanes, into the ball room', () => {
  const owned: RangeUpgradeId[] = ['bays8', 'tube', 'pushpick', 'picker', 'nightpick'];
  const b = newBalls(); b.clean = 60 * visitBalls(600); const o = run(b, owned), out = fieldCount(b);
  assert.ok(out > 200, `a day's balls lie out (${out})`); const v0 = o.r.view(); assert.ok(v0.picker && !v0.picker.out, 'the cart is parked by day');
  const clean0 = b.clean; let outAt = 0;
  for (let t = 0; t < 270; t += 0.5) { o.r.step(0.5, hourClock(CLOSING + t, 600), o.s, busy, 600); if (o.r.view().picker?.out) outAt++; }
  assert.ok(outAt > 0, 'the cart drove out after closing'); assert.ok(fieldCount(b) <= 0.02 * out + 2, `and picked the balls on its lanes (${fieldCount(b)} of ${out} left)`); assert.ok(b.clean > clean0, 'into the ball room'); assert.ok(b.total.picked.night > 0.9 * out);
  const bare = newBalls(); bare.clean = 60 * visitBalls(600); const p = run(bare, ['bays8']); assert.ok(fieldCount(bare) > 200);
  for (let t = 0; t < 200; t += 0.5) p.r.step(0.5, hourClock(CLOSING + t, 600), p.s, busy, 600);
  assert.ok(fieldCount(bare) > 200, 'without the cart nothing picks them: they lie out until you do');
});

test('with a book a new town day costs the balls lying out their night\'s loss, once', () => {
  const b = newBalls(); b.clean = 30 * visitBalls(600); const o = run(b, ['bays8']); const before = fieldCount(b); b.dayNo = 1;
  const s = o.s; o.r.step(0.5, { hour: 6.6, day: 2 }, s, busy, 600); const after = fieldCount(b);
  assert.ok(after < before && after >= before * (1 - 3 * DAY_LOSS_FIELD), `the night took a few (${before} -> ${after})`); assert.equal(b.dayNo, 2);
  const lostNow = b.total.lost; o.r.step(0.5, { hour: 6.7, day: 2 }, s, busy, 600); assert.equal(b.total.lost, lostNow, 'the same day takes nothing more');
});

test('with a book a sim that is cleared (a load, a new game) lands the balls its golfers had bought and not hit: none is lost between hands', () => {
  const b = newBalls(); b.clean = 30 * visitBalls(600); const pool = poolOf(b), o = run(b, ['bays8'], 70);
  assert.ok(b.inPlay > 0, `golfers hold balls they have not hit (${b.inPlay})`); o.r.clear();
  assert.equal(b.inPlay, 0); assert.equal(poolOf(b), pool);
});

test('a skip with a book serves only the balls there are; the balls land on the outfield; the pool is kept', () => {
  const b = newBalls(); b.clean = 8 * visitBalls(600); const pool = poolOf(b);
  const o = run(b, ['bays8'], 1);
  o.r.step(1000, { hour: 7, day: 1 }, o.s, busy, 600);
  assert.ok(b.total.sold <= 8 * visitBalls(600) + 2, `no more than its balls (${b.total.sold})`); assert.ok(o.s.season.takings > 0);
  assert.ok(Math.abs(poolOf(b) - pool) <= 2, `the pool is kept (${pool} -> ${poolOf(b)})`); assert.ok(fieldCount(b) > 0);
  const c = newBalls(); c.clean = 1e6; const q = run(c, ['bays8'], 1); q.r.step(1000, { hour: 7, day: 1 }, q.s, busy, 600); assert.ok(q.s.season.takings > o.s.season.takings * 2, 'with balls to sell the skip books what it did before');
});
