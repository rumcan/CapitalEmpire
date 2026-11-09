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
import { RangeHost, BALL_DRAW_MAX, BALL_POINT_FLOATS, type RangeHostCtx } from '../src/game/golf/rangehost';
import { mulberry, worldX, worldY } from '../src/game/iso';
import { normalizeGolfSave, type GolfSave, type Rect } from '../src/game/golf/mode';

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

// ---------------------------------------------------------------- the host: your hand work, the supplier, the till, the draw

function makeHost(owned: RangeUpgradeId[] = [], till = 0, money = 1e6) {
  const biz = owned.reduce((q, id) => withUpgrade(q, id), defaultRangeBiz()); biz.balls!.till = till; biz.balls!.clean = 0;
  const log = { spent: [] as number[], booked: [] as number[], invoices: [] as number[], toasts: [] as string[] }; let t = 0;
  const sc0 = rangeScene(plot, 2, biz);
  const ctx: RangeHostCtx = {
    biz: () => biz, plot: () => ({ rect: plot, facing: 2 }), carPark: () => ({ bays: lot(sc0), entrance: sc0.carEdge, key: 'lot' }), addPiece: () => null, removeProp: () => {}, setGround: () => {}, layPaths: () => {}, clearTrees: () => {},
    money: () => money, spend: n => { log.spent.push(n); }, book: n => { log.booked.push(n); }, balls: n => { log.invoices.push(n); },
    demand: () => busy, dayLen: () => 600, simT: () => t, clock: () => ({ hour: 12, day: 1 }),
    save: () => {}, toast: (m: string) => { log.toasts.push(m); }, emit: () => {}, grid: () => null, layTee: () => false,
  };
  const h = new RangeHost(ctx, 3); h.sync(); h.step();
  return { h, biz, bs: biz.balls!, sc: h.scene!, log, tick: (dt: number) => { t += dt; h.step(); } };
}
const near = (x: number, y: number, n: number, bs: BallSave) => { for (let i = 0; i < n; i++) bs.field.push(x + (i % 5) * 0.1, y + Math.floor(i / 5) * 0.1); };
const at = (x: number, y: number, dt = 0.5, pick = true, inCart = false, ox = x, oy = y) => ({ x, y, ox, oy, dt, pick, inCart });

test('the host: the scene has a ball room door; the card view says the stock, the outfield, the basket and the till', () => {
  const { h, sc, bs } = makeHost([], 1234); bs.clean = 300; near(60, 60, 12, bs);
  assert.ok(sc.ballRoom && Number.isFinite(sc.ballRoom.x));
  const v = h.view()!.balls!; assert.equal(v.clean, 300); assert.equal(v.buckets, 7); assert.equal(v.field, 12); assert.equal(v.till, 1234); assert.equal(v.out, false); assert.equal(v.vb, 40); assert.equal(v.kit.basket, HAND.basket);
  bs.clean = 39; assert.equal(h.view()!.balls!.out, true, 'under a bucket: out');
});

test('hand work: hold the key over balls and they go into the basket at your rate, up to its size; the ball room empties it', () => {
  const { h, bs, sc } = makeHost([]); near(60, 60, 40, bs);
  let got = 0; for (let i = 0; i < 40; i++) got += h.work(at(60.2, 60.1)).picked;
  assert.equal(got, HAND.basket, 'the basket fills and no more'); assert.equal(bs.basket, HAND.basket); assert.equal(fieldCount(bs), 40 - HAND.basket);
  assert.equal(h.work(at(60.2, 60.1)).picked, 0, 'a full basket picks nothing');
  // a rate: a second of picking is HAND.rate balls (not the whole pile at once)
  const b2 = makeHost([]); near(60, 60, 40, b2.bs); assert.equal(b2.h.work(at(60.2, 60.1, 1)).picked, Math.floor(HAND.rate));
  // not holding the key: nothing is picked
  const b3 = makeHost([]); near(60, 60, 10, b3.bs); assert.equal(b3.h.work(at(60.2, 60.1, 5, false)).picked, 0);
  // at the ball room the basket is emptied into the stock, counted as picked by hand
  const d = h.work(at(sc.ballRoom.x + 1, sc.ballRoom.y, 0.1, false));
  assert.equal(d.dumped, HAND.basket); assert.equal(bs.basket, 0); assert.equal(bs.clean, HAND.basket); assert.equal(bs.total.picked.hand, HAND.basket);
  // far from it: nothing is emptied
  bs.basket = 5; assert.equal(h.work(at(sc.ballRoom.x + 9, sc.ballRoom.y, 0.1, false)).dumped, 0);
});

test('the tools in hand: the tube is faster and reaches further, the push picker takes a swath as you walk, the cart takes the balls it drives over into its hopper', () => {
  const t = makeHost(['tube']); near(60, 60, 40, t.bs); assert.equal(t.h.work(at(60.2, 60.1, 1)).picked, Math.floor(TUBE.rate), 'the tube\'s rate');
  const r = makeHost(['tube']); r.bs.field.push(61.5, 60); assert.equal(r.h.work(at(60, 60, 1)).picked, 1, 'a ball 1.5 tiles off is within the tube\'s reach');
  const hand = makeHost([]); hand.bs.field.push(61.5, 60); assert.equal(hand.h.work(at(60, 60, 1)).picked, 0, 'but not a hand\'s');
  const p = makeHost(['tube', 'pushpick']); for (let i = 0; i < 30; i++) p.bs.field.push(55 + i * 0.5, 60.5 + (i % 3) * 0.3);
  const w = p.h.work({ x: 70, y: 60.5, ox: 55, oy: 60.5, dt: 0.1, pick: true, inCart: false }); assert.equal(w.picked, 30, 'walking 15 tiles with the push picker takes the whole line of balls, whatever the rate'); assert.equal(p.bs.basket, 30);
  const c = makeHost(['tube', 'pushpick', 'picker']); for (let i = 0; i < 60; i++) c.bs.field.push(50 + (i % 20) * 0.8, 60 + Math.floor(i / 20) * 2);
  const k = c.h.work({ x: 66, y: 62, ox: 50, oy: 62, dt: 0.1, pick: false, inCart: true }); assert.ok(k.picked >= 40, `the cart picks a ten metre swath as it drives (${k.picked})`); assert.equal(c.bs.hopper, k.picked); assert.equal(c.bs.basket, 0);
  const none = makeHost(['tube', 'pushpick']); near(60, 60, 5, none.bs); assert.equal(none.h.work({ x: 66, y: 60, ox: 60, oy: 60, dt: 0.1, pick: false, inCart: true }).picked, 0, 'a cart without the picker picks nothing');
  // the hopper is emptied at the ball room, counted as picked by the cart
  const e = makeHost(['tube', 'pushpick', 'picker']); e.bs.hopper = 77; const d = e.h.work(at(e.sc.ballRoom.x, e.sc.ballRoom.y + 1, 0.1, false, true));
  assert.equal(d.dumped, 77); assert.equal(e.bs.clean, 77); assert.equal(e.bs.total.picked.cart, 77);
});

test('a pick order: you walk from ball to ball, take the basket home when it is full or the pile is gone, and the order ends when it is emptied', () => {
  const { h, bs, sc } = makeHost([]); near(60, 60, 30, bs); near(64, 62, 4, bs);
  const pile = h.pileAt(60.3, 60.1)!; assert.ok(pile && pile.n >= 25, `a pile of balls under the pointer (${pile?.n})`); assert.equal(h.pileAt(5, 5), null, 'none lies there');
  h.startOrder(pile.x, pile.y); assert.equal(h.order!.phase, 'pick');
  // standing at the pile's edge: the balls round you are picked by work; nothing to walk to
  assert.equal(h.orderStep(60.2, 60.1, false), null);
  // out of reach of any ball: it says where to step
  const step = h.orderStep(66, 60, false); assert.ok(step && step.walk, 'steps to the nearest ball');
  // a full basket: it goes home
  bs.basket = HAND.basket; const back = h.orderStep(60, 60, false); assert.ok(back && back.back); assert.equal(h.order!.phase, 'back');
  assert.equal(h.orderStep(60, 60, true), null, 'on its way');
  assert.deepEqual(h.orderStep(sc.ballRoom.x + 2, sc.ballRoom.y, false), { back: true }, 'stopped short of the door with the basket still full: it goes on');
  h.work(at(sc.ballRoom.x + 2, sc.ballRoom.y, 0.1, false));
  assert.deepEqual(h.orderStep(sc.ballRoom.x + 2, sc.ballRoom.y, false), { done: true }); assert.equal(h.order, null);
  // an order on a pile that is gone is done at once
  const g = makeHost([]); g.h.startOrder(60, 60); assert.deepEqual(g.h.orderStep(60, 60, false), { done: true });
  const c = makeHost([]); near(60, 60, 5, c.bs); c.h.startOrder(60, 60); c.h.cancelOrder(); assert.equal(c.h.order, null);
});

test('the till and the gear: the tools are paid from the till and from the treasury; an order of balls is invoiced as the Range balls line', () => {
  const cost = RANGE_UPGRADES.find(u => u.id === 'tube')!.cost, t = makeHost([], cost - 1);
  assert.equal(t.h.buy('tube'), false); assert.match(t.log.toasts.at(-1)!, /Not enough in the range's till/); assert.deepEqual(t.log.spent, []);
  t.bs.till = cost + 50; assert.equal(t.h.buy('tube'), true); assert.deepEqual(t.log.spent, [cost]); assert.equal(t.bs.till, 50); assert.ok(t.biz.owned.includes('tube')); assert.match(t.log.toasts.at(-1)!, /from the range's till/);
  const poor = makeHost([], cost + 50, 100); assert.equal(poor.h.buy('tube'), false, 'the treasury must hold it too'); assert.equal(poor.bs.till, cost + 50);
  // the supplier
  const o = makeHost([], 1e6); assert.equal(o.h.orderBalls(1), false); assert.match(o.log.toasts.at(-1)!, /supplier's account first/); assert.deepEqual(o.log.invoices, []);
  const caseCost = Math.round(CASE_BALLS * BALL_COST), s = makeHost(['supplier'], 2.5 * caseCost);
  assert.equal(s.h.orderBalls(2), true); assert.deepEqual(s.log.invoices, [2 * caseCost]); assert.equal(s.bs.clean, 2 * CASE_BALLS); assert.equal(s.bs.till, 0.5 * caseCost);
  assert.equal(s.h.orderBalls(1), false, 'the till cannot pay a third'); assert.match(s.log.toasts.at(-1)!, /not enough in the range's till/);
  const d = makeHost(['supplier'], 1e6); d.h.orderBalls(CASES_A_DAY); assert.equal(d.h.orderBalls(1), false); assert.match(d.log.toasts.at(-1)!, /delivered today's cases/); assert.equal(d.h.view()!.balls!.casesLeft, 0);
});

test('the host sells the balls it has and credits the till with what it books', () => {
  const { h, bs, log, tick, biz } = makeHost([], 0); bs.clean = 12 * visitBalls(600);
  for (let i = 0; i < 4000; i++) tick(0.5);
  const booked = log.booked.reduce((a, n) => a + n, 0);
  assert.ok(booked > 3 * 240, `it sold (${booked})`); assert.ok(Math.abs(bs.till - booked) <= 2, `the till takes what is booked (${bs.till} of ${booked})`); assert.ok(h.sim.book === bs, 'the sim holds the save\'s book');
  assert.ok(biz.season.takings > 0);
});

test('the balls are drawn as one instanced set of points, thinned to the budget: shadows first, then the balls, only those in view', () => {
  const { h, bs } = makeHost([]); const S = BALL_POINT_FLOATS, out = new Float32Array(2 * BALL_DRAW_MAX * S);
  for (let i = 0; i < 6000; i++) bs.field.push(240 + (i % 100) * 0.4, 210 + Math.floor(i / 100) * 0.4);
  const all = h.fieldPoints(out, -1e9, -1e9, 1e9, 1e9); assert.ok(all > 0 && all <= BALL_DRAW_MAX, `thinned to the budget (${all})`); assert.ok(all >= BALL_DRAW_MAX * 0.7, 'but not thinned to nothing');
  assert.ok(out[5] > 0.3 && out[5] < 0.5, 'the shadows first: dark, soft'); assert.equal(out[all * S + 5], 1, 'then the balls: opaque white'); assert.equal(out[all * S + 2], 1);
  assert.ok(Math.abs(out[0] - out[all * S] + 1.6) < 1e-3 && Math.abs(out[1] - out[all * S + 1] - 1.4) < 1e-3, 'a shadow lies a little down and to the left of its ball');
  const view = h.fieldPoints(out, worldX(240, 210) - 40, worldY(240, 210) - 30, worldX(240, 210) + 40, worldY(240, 210) + 30); assert.ok(view > 0 && view < all, `only the balls in view (${view})`);
  const empty = makeHost([]); assert.equal(empty.h.fieldPoints(out, -1e9, -1e9, 1e9, 1e9), 0);
  const sparse = makeHost([]); sparse.bs.field.push(250, 220, 251, 221); assert.equal(sparse.h.fieldPoints(out, -1e9, -1e9, 1e9, 1e9), 2, 'every ball when few');
});

test('the golf save keeps the balls: the outfield, the basket, the till and the counts come back as they were saved', () => {
  const base = { v: 1, tier: 1, rep: 0, town: { x: 0, y: 0 }, course: [0, 0, 10, 10], parcel: [0, 0, 10, 10], dir: 2, tees: [], pins: [], aims: [], clubhouse: { x: 0, y: 0 } } as unknown as GolfSave;
  const r = defaultRangeBiz(); r.balls!.field.push(10.5, 20.25, 11, 21); r.balls!.basket = 7; r.balls!.till = 321.5; r.balls!.total.picked.hand = 40; r.balls!.dayNo = 4;
  const back = normalizeGolfSave(JSON.parse(JSON.stringify({ ...base, start: 'range', range: r })))!;
  assert.deepEqual(back.range!.balls, r.balls); assert.deepEqual(back.range!.owned, []);
  // a big outfield is a big but sane save (compact numbers: two decimals)
  const f = newBalls(); const rr = rnd(); for (let i = 0; i < FIELD_CAP; i++) landBalls(f, 20 + rr() * 60, 40 + rr() * 100, 1, rr); assert.equal(fieldCount(f), FIELD_CAP);
  const bytes = JSON.stringify(f).length; assert.ok(bytes < 200000, `a full outfield saves in ${bytes} bytes`);
});
