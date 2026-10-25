// The range business (plan P24 Phase 1, T129: golf/rangesave.ts and golf/rangebiz.ts): the save and its migration, the upgrades, the demand and
// the money, the scene the game lays on the range plot, and the golfers who drive in, queue, hit balls and leave.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMAND_RATE, PRICE_MAX, PRICE_MIN, RANGE_UPGRADES, RangeSim, START_BAYS, arrivalRate, dayDemand, defaultRangeBiz, normalizeRangeBiz, priceFactor,
  rangeScale, rangeScene, rangeStats, saleValue, skippedVisits, upgradeWhy, withPrice, withUpgrade, type CarSlot, type RangeBizSave, type RangeUpgradeId,
} from '../src/game/golf/rangebiz';
import { normalizeGolfSave, type GolfSave, type Rect } from '../src/game/golf/mode';
import { RANGE_PASS_POP } from '../src/game/golf/range';

const plots: Record<0 | 1 | 2 | 3, Rect> = { 0: [500, 600, 70, 150], 1: [900, 300, 150, 70], 2: [200, 200, 70, 150], 3: [1200, 1300, 150, 70] };
const FACINGS = [0, 1, 2, 3] as const;
const ALL: RangeUpgradeId[] = ['bays8', 'bays12', 'bays24', 'targets', 'covered', 'lights', 'dispenser', 'proshop'];
const all = (): RangeBizSave => ALL.reduce((s, id) => withUpgrade(s, id), defaultRangeBiz());
const start = { tier: 1, exits: 2, residents: 0 };

test('a new range: 4 bays, $6, nothing bought, no counts; the save normalizes and migrates', () => {
  const d = defaultRangeBiz();
  assert.deepEqual(d.owned, []); assert.equal(d.price, 6); assert.equal(rangeStats(d).bays, START_BAYS); assert.equal(d.season.takings, 0);
  assert.deepEqual(normalizeRangeBiz(undefined), d);
  assert.deepEqual(normalizeRangeBiz('junk'), d);
  const n = normalizeRangeBiz({ owned: ['bays12', 'bays8', 'nope', 'lights', 'lights'], price: 40, season: { golfers: 3, takings: -5 }, paths: true });
  assert.deepEqual(n.owned, ['bays8', 'lights'], 'an unknown upgrade, a duplicate and one bought before its prerequisite are dropped');
  assert.equal(n.price, PRICE_MAX); assert.equal(n.season.golfers, 3); assert.equal(n.season.takings, 0); assert.equal(n.paths, true);
  assert.equal(normalizeRangeBiz({ price: 1 }).price, PRICE_MIN);
  // golf/mode.ts: a range start's save without a range gets the starting range; with one keeps it; an old start's save gets none
  const base = { v: 1, tier: 1, rep: 0, town: { x: 0, y: 0 }, course: [0, 0, 10, 10], parcel: [0, 0, 10, 10], dir: 2, tees: [], pins: [], aims: [], clubhouse: { x: 0, y: 0 } } as unknown as GolfSave;
  assert.deepEqual(normalizeGolfSave({ ...base, start: 'range' })!.range, d);
  assert.deepEqual(normalizeGolfSave(JSON.parse(JSON.stringify({ ...base, start: 'range', range: withPrice(withUpgrade(d, 'lights'), 9) })))!.range!.owned, ['lights']);
  assert.equal(normalizeGolfSave(base)!.range, undefined);
});

test('the upgrades: their order, their costs, and what each does to the stats', () => {
  assert.equal(RANGE_UPGRADES.length, 12, 'the eight of Phase 1 and the four World of Golf extras (T133: golf-range-extras.test.ts)');
  const d = defaultRangeBiz();
  assert.equal(upgradeWhy(d, 'bays12', 1e9), 'Build 8 hitting bays first');
  assert.match(upgradeWhy(d, 'proshop', 1000), /Not enough money/);
  assert.equal(upgradeWhy(d, 'bays8', 8000), '');
  assert.equal(upgradeWhy(withUpgrade(d, 'bays8'), 'bays8', 1e9), 'Built');
  const s0 = rangeStats(d), s1 = rangeStats(all());
  assert.deepEqual([s0.bays, s0.targets, s0.close, s0.serve, s0.extra, s0.ref, s0.appeal, s0.qMax], [4, 2, 18, 3, 0, 6, 1, 5]);
  assert.deepEqual([s1.bays, s1.targets, s1.close, s1.serve, s1.extra, s1.ref, s1.qMax], [24, 5, 22, 0.8, 2, 9, 10]);
  assert.ok(Math.abs(s1.appeal - 1.6) < 1e-9);
  assert.equal(rangeStats(withUpgrade(d, 'proshop')).serve, 2, 'the pro shop serves faster than the shack, the dispenser fastest');
  assert.equal(RANGE_UPGRADES.filter(u => ALL.includes(u.id)).reduce((a, u) => a + u.cost, 0), 160000, 'the Phase 1 range costs $160,000 (plan 2.3)');
});

test('the demand: 0.0183 per pass-pop and resident a day at the start, falling with the price, zero when closed, the evening only under lights', () => {
  const d = defaultRangeBiz(), want = DEMAND_RATE * RANGE_PASS_POP(1) * 2;
  assert.ok(Math.abs(dayDemand(d, start) - want) < 1e-9); assert.ok(want > 50 && want < 60, `about 55 golfers a day at the start (${want})`);
  assert.ok(dayDemand(d, { ...start, residents: 2000 }) > dayDemand(d, start));
  assert.ok(dayDemand(withPrice(d, 10), start) < dayDemand(d, start) && dayDemand(withPrice(d, 4), start) > dayDemand(d, start));
  assert.equal(priceFactor(6, 6), 1); assert.equal(priceFactor(100, 6), 0.25); assert.equal(priceFactor(1, 9), 2.5);
  assert.equal(arrivalRate(d, start, 3, 600), 0); assert.equal(arrivalRate(d, start, 20, 600), 0);
  assert.ok(arrivalRate(withUpgrade(d, 'lights'), start, 20, 600) > 0);
  assert.ok(arrivalRate(d, start, 17, 600) > arrivalRate(d, start, 8, 600), 'the after-work peak beats the morning');
  // the money: price plus the shop spend, times the customers a golfer stands for (40 at the default 10-minute day, in step with the day)
  assert.equal(rangeScale(600), 40); assert.equal(rangeScale(1200), 80);
  assert.equal(saleValue(d, 600), 240); assert.equal(saleValue(withUpgrade(d, 'proshop'), 600), 320);
});

test('a skipped day books what the bays could take: the demand capped by bays x open hours', () => {
  const d = defaultRangeBiz(), r = skippedVisits(d, start, 0, 600, 600);
  assert.ok(r.served <= 44 + 1e-9 && r.served > 40, `at most 4 bays x 11 hours: the quiet morning leaves room (${r.served})`);
  assert.ok(Math.abs(r.served + r.lost - dayDemand(d, start)) < 0.5, 'served and lost make the demand');
  const big = skippedVisits(withUpgrade(withUpgrade(d, 'bays8'), 'bays12'), start, 0, 600, 600);
  assert.ok(Math.abs(big.lost) < 1e-6 && big.served > r.served, 'twelve bays take the whole start demand');
});

test('the scene: inside the plot for every facing, the mats and greens follow the upgrades, fences run along their own axis, keys are unique', () => {
  for (const f of FACINGS) {
    const p = plots[f], inPlot = (x: number, y: number) => x >= p[0] - 1e-6 && y >= p[1] - 1e-6 && x <= p[0] + p[2] + 1e-6 && y <= p[1] + p[3] + 1e-6;
    for (const s of [defaultRangeBiz(), all()]) {
      const sc = rangeScene(p, f, s), st = rangeStats(s);
      for (const q of sc.pieces) assert.ok(inPlot(q.x, q.y), `facing ${f}: ${q.key} at ${q.x},${q.y} on the plot`);
      for (const pa of sc.patches) for (let i = 0; i < pa.pts.length; i += 2) assert.ok(inPlot(pa.pts[i]!, pa.pts[i + 1]!), `facing ${f}: a ${pa.surf} patch on the plot`);
      for (const l of sc.paths) assert.ok(inPlot(l.a.x, l.a.y) && inPlot(l.b.x, l.b.y), 'the paths on the plot');
      assert.equal(new Set(sc.pieces.map(q => q.key)).size, sc.pieces.length, 'unique keys');
      assert.equal(sc.bays.length, st.bays); assert.equal(sc.patches.filter(q => q.surf === 'asphaltDark').length, st.bays, 'a pad under each open bay');
      assert.equal(sc.targets.length, st.targets); assert.equal(sc.pieces.filter(q => q.key.startsWith('flag')).length, st.targets);
      assert.equal(sc.pieces.filter(q => q.key.startsWith('board')).length, st.targets > 2 ? st.targets : 0);
      assert.equal(sc.pieces.filter(q => q.key.startsWith('light')).length, st.lights ? 8 : 0);
      assert.equal(sc.pieces.filter(q => q.key.startsWith('roof')).length, st.covered ? st.bays / 4 : 0);
      assert.equal(sc.pieces.find(q => q.key === 'shop')!.id, st.proShop ? 'business:golf-pro-shop' : 'expansion:lean-to-shed');
      for (const k of ['caravan', 'wash', 'braai', 'sign', 'mark1-0']) assert.ok(sc.pieces.some(q => q.key === k), `the ${k}`);
      for (const q of sc.pieces.filter(q => /fence|chainlink/.test(q.id))) {
        const run = q.key.replace(/\d+$/, ''), mates = sc.pieces.filter(m => m.key.replace(/\d+$/, '') === run);
        if (mates.length < 2) continue;
        const alongX = Math.abs(mates[1]!.x - mates[0]!.x) > Math.abs(mates[1]!.y - mates[0]!.y);
        assert.ok(alongX ? /-x$|_x$/.test(q.id) : /-y$|_y$/.test(q.id), `facing ${f}: ${q.key} (${q.id}) runs along ${alongX ? 'x' : 'y'}`);
      }
      // the golfers hit away from the road: the aim points from the tee line toward the far fence, the greens lie down the range
      const b = sc.bays[0]!.stand;
      for (const t of sc.targets) assert.ok((t.x - b.x) * sc.aim.x + (t.y - b.y) * sc.aim.y > 20, 'each green lies down the range');
      assert.ok(sc.numbers.length >= 10, 'distance numbers down both sides');
    }
  }
});

/** a range at facing 2 with a 12-bay car park beside the drive, at hour h, run for secs (steps of 0.1 s); returns the sim, the save and what it booked */
function run(s: RangeBizSave, secs: number, hour: number, c = start, sim?: RangeSim) {
  const plot = plots[2], sc = rangeScene(plot, 2, s);
  const slots: CarSlot[] = Array.from({ length: 12 }, (_, i) => ({ x: plot[0] + 52 + (i % 6) * 2.6, y: plot[1] + 6 + Math.floor(i / 6) * 6, hx: 0, hy: 1 }));
  const r = sim ?? new RangeSim(7, 10); r.setScene(sc, slots, { x: plot[0] + 69, y: plot[1] + 10 });
  let booked = 0, sawQueue = 0, sawFlying = 0, sawHit = 0;
  const fl = new Float32Array(300);
  for (let t = 0; t < secs; t += 0.1) {
    booked += r.step(0.1, { hour, day: 1 }, s, c, 600);
    sawQueue = Math.max(sawQueue, r.today.queue); sawFlying = Math.max(sawFlying, r.flying(fl)); sawHit = Math.max(sawHit, r.today.playing);
  }
  return { r, booked, sawQueue, sawFlying, sawHit };
}

test('golfers drive in, buy a bucket, hit balls in arcs and leave; each sale books the price times the scale', () => {
  const s = defaultRangeBiz(), o = run(s, 400, 12);
  assert.ok(s.season.golfers >= 5, `golfers bought buckets (${s.season.golfers})`);
  assert.equal(o.booked, s.season.golfers * saleValue(s, 600)); assert.equal(s.season.takings, o.booked); assert.equal(s.total.takings, o.booked);
  assert.equal(s.season.buckets, s.season.golfers * 40);
  assert.ok(o.sawHit > 0 && o.sawHit <= START_BAYS, `at most the bays hit at once (${o.sawHit})`);
  assert.ok(o.sawFlying > 0, 'balls in the air'); assert.ok(o.r.nLying > 0, 'balls lying on the range');
  const v = o.r.view();
  assert.ok(v.nCars > 0, 'cars drawn'); assert.ok(v.people.slice(0, v.nPeople).every(p => p.group === 1 && p.row >= 0 && p.row < 8), 'golfers drawn as golfers');
  // the same seed plays the same day
  const s2 = defaultRangeBiz(); run(s2, 400, 12); assert.deepEqual(s2.season, s.season);
});

test('a crowd bigger than the bays makes a queue at the shop and turns cars away; closing sends the queue home and clears the balls', () => {
  const s = defaultRangeBiz(), busy = { tier: 5, exits: 2, residents: 20000 }, o = run(s, 300, 17, busy);
  assert.ok(o.sawQueue >= 3, `a queue at the shop (${o.sawQueue})`);
  assert.ok(s.season.lost > 0, `cars drove on (${s.season.lost})`);
  assert.ok(o.r.today.lost === s.season.lost);
  // closing time (no floodlights): no one new, the queue goes, the last buckets finish, the balls are picked
  const before = s.season.golfers, after = run(s, 400, 19, busy, o.r);
  assert.ok(s.season.golfers <= before + 1, 'nobody new buys after closing (a sale at the counter when it closed still finishes)');
  assert.equal(after.r.onFoot, 0, 'everyone has gone'); assert.equal(after.r.nLying, 0, 'the balls are picked');
  // with floodlights the evening plays on
  const lit = withUpgrade(defaultRangeBiz(), 'lights'); run(lit, 300, 20, busy);
  assert.ok(lit.season.golfers > 0);
});

test('a skip books the expected sales at once and clears the golfers', () => {
  const s = defaultRangeBiz(), sim = new RangeSim(3, 10), sc = rangeScene(plots[2], 2, s);
  sim.setScene(sc, [{ x: 260, y: 210, hx: 0, hy: 1 }], { x: 269, y: 210 });
  const booked = sim.step(600, { hour: 0, day: 1 }, s, start, 600); // a skip: two minutes and more at once
  assert.ok(s.season.golfers > 40 && s.season.golfers <= 44, `${s.season.golfers}`); assert.ok(Math.abs(booked - s.season.golfers * 240) < 1e-6); assert.equal(sim.onFoot, 0);
});
