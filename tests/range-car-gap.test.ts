// The range's cars keep their distance (T152, issue #325; the owner's shots of T146 and T147: "the incoming cars stack on top of each other on the
// range drive and the county road"). A range car keeps a car's length behind the car ahead in its lane (the county road, the drive, the car park),
// an arrival waits at the road's end for room, and the cars bound for the car park building queue in a line into its ramp. The golfers keep their
// timetable (golf/rangebiz.ts RangeCar, RangeSim.drive), so the counts and the money are what they were. The checks read the cars as view() draws them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GARAGE_CARS, RangeSim, defaultRangeBiz, garageSlots, rangeScene, withUpgrade, type CarSlot, type RangeBizSave, type RangeUpgradeId } from '../src/game/golf/rangebiz';
import { bayGrid } from '../src/game/event/carpark';
import type { Rect } from '../src/game/golf/mode';

/** the test map's range at facing 2 (as golf-range-parking.test.ts): the plot, the car park's entrance on the drive, the 44-bay lot */
const P: Rect = [200, 200, 70, 150], entrance = { x: P[0] + 72, y: P[1] + 9 };
const LOT44: Rect = [P[0] + 49, P[1] + 2, 20, 16];
const lot = (r: Rect): CarSlot[] => bayGrid({ id: 1, x: r[0], y: r[1], w: r[2], h: r[3] }, 0, [entrance]);
const GROWN: RangeUpgradeId[] = ['bays8', 'bays12', 'bays24', 'targets', 'covered', 'lights', 'dispenser', 'proshop', 'kiosk', 'picker', 'tier2', 'academy'];
const buy = (ids: RangeUpgradeId[]): RangeBizSave => { const s = ids.reduce((q, id) => withUpgrade(q, id), defaultRangeBiz()); s.price = 8; return s; };
/** P24's grown range: 2,000 residents, props +40%, both practice greens' appeal */
const grown = { tier: 1, exits: 2, residents: 2000, propsAppeal: 0.4, practiceAppeal: 0.21 };
const DAY = 600, HOUR = DAY / 24;
/** a car's length (tiles): the longest car, 5.5 m */
const LEN = 2.75;

type Car = { x: number; y: number; ang: number };
/** the sim's private parts these tests drive and look at */
type Inside = { rnd: () => number; arrive(slot: number): void; visits: { id: number; stage: number; rc?: { out: boolean } }[] };
const inside = (sim: RangeSim) => sim as unknown as Inside;
/** the cars view() draws (the ball picker cart, drawn last, left out) */
function drawn(sim: RangeSim): Car[] { const v = sim.view(); return v.cars.slice(0, v.nCars - (v.picker ? 1 : 0)).map(c => ({ ...c })); }
/** the arrivals still on their way in (T152's cars on the road, or a visit driving in) */
const arriving = (sim: RangeSim): number => inside(sim).visits.filter(v => (v.rc ? !v.rc.out : v.stage === 0)).length;
/** the closest two cars going one way in one lane (headings within 60 degrees, within 0.8 tiles across): their distance along (tiles; Infinity: none) */
function closest(cars: Car[]): number {
  let m = Infinity;
  for (const a of cars) for (const b of cars) {
    if (a === b) continue;
    const hx = Math.cos(a.ang), hy = Math.sin(a.ang);
    if (hx * Math.cos(b.ang) + hy * Math.sin(b.ang) < 0.5) continue;
    const dx = b.x - a.x, dy = b.y - a.y, along = dx * hx + dy * hy;
    if (along >= 0 && Math.abs(dx * hy - dy * hx) < 0.8) m = Math.min(m, along);
  }
  return m;
}
/** cars turning in at once off the county road, all from one side (the sim's draw stubbed for them: the range's side, from -roadDir), bound for the
 *  given car-park bays */
function arrivals(sim: RangeSim, slots: number[]): void {
  const S = inside(sim), rnd = S.rnd;
  S.rnd = () => 0.75;
  for (const k of slots) S.arrive(k);
  S.rnd = rnd;
}
/** a range with its car park at night (the shop shut: no other arrivals): the scene, the sim and a step of 0.1 s */
function range(s: RangeBizSave, slots: (sc: ReturnType<typeof rangeScene>) => CarSlot[]) {
  const sc = rangeScene(P, 2, s), sim = new RangeSim(7, 10); sim.setScene(sc, slots(sc), entrance);
  return { sc, sim, step: () => sim.step(0.1, { hour: 3, day: 1 }, s, grown, DAY) };
}

test('two cars in a lane: never closer than a car length, the second queuing behind the first all the way in', () => {
  const { sim, step } = range(buy(GROWN), () => lot(LOT44));
  arrivals(sim, [0, 1]);
  let near = Infinity, both = 0;
  for (let k = 0; k < 250; k++) {
    step();
    const cars = drawn(sim), d = closest(cars);
    if (arriving(sim) === 2 && cars.length === 2) both++;
    assert.ok(d >= LEN - 1e-6, `step ${k}: the cars ${d.toFixed(2)} tiles apart`);
    near = Math.min(near, d);
  }
  assert.ok(both > 50, `both on the road a while (${both} steps)`);
  assert.ok(near < 3.5, `the second followed close behind (${near.toFixed(2)} tiles at the closest)`);
  assert.equal(arriving(sim), 0, 'both parked');
});

test('a spawn waits for room: the second arrival is not on the road until the first is a car length on', () => {
  const { sc, sim, step } = range(buy(GROWN), () => lot(LOT44));
  // the road's end the range's side comes from (RangeSim.arrive: 46 tiles up the county road, in the lane 0.9 tiles toward the range)
  const from = { x: sc.J.x - sc.roadDir.x * 46 + sc.rangeSide.x * 0.9, y: sc.J.y - sc.roadDir.y * 46 + sc.rangeSide.y * 0.9 };
  arrivals(sim, [0, 1]);
  step();
  assert.equal(drawn(sim).length, 1, 'the first drives on, the second waits at the road\'s end, not drawn');
  let k = 0;
  for (; k < 50 && drawn(sim).length < 2; k++) step();
  const cars = drawn(sim), lead = Math.max(...cars.map(c => Math.hypot(c.x - from.x, c.y - from.y)));
  assert.equal(cars.length, 2, `it starts (after ${k + 1} steps)`);
  assert.ok(lead >= LEN, `the first was ${lead.toFixed(2)} tiles on when it started`);
});

test('a queue at the car park building\'s ramp forms a line: four cars in one lane, a car length apart, each driving in in turn', () => {
  const { sc, sim, step } = range(buy([...GROWN, 'parking']), sc => [...lot(sc.garage!.lot), ...garageSlots(sc.garage!, GARAGE_CARS)]);
  const n = lot(sc.garage!.lot).length, ramp = sc.garage!.ramp;
  arrivals(sim, [n, n + 1, n + 2, n + 3]);
  let line = 0, inBuilding = 0;
  for (let k = 0; k < 400; k++) {
    step();
    const cars = drawn(sim), d = closest(cars);
    assert.ok(d >= LEN - 1e-6, `step ${k}: two cars ${d.toFixed(2)} tiles apart`);
    // in the car park, on the way to the ramp
    line = Math.max(line, cars.filter(c => Math.hypot(c.x - ramp.x, c.y - ramp.y) < 16).length);
    inBuilding = Math.max(inBuilding, sim.parked(true));
  }
  assert.ok(line >= 3, `a line of ${line} cars in the car park at once`);
  assert.equal(inBuilding, 4, 'all four drove in');
});

test('a busy day at the grown range: every car leaves the road by morning (the in and out queues never lock)', () => {
  const s = buy([...GROWN, 'parking']), sc = rangeScene(P, 2, s), sim = new RangeSim(11, 10);
  sim.setScene(sc, [...lot(sc.garage!.lot), ...garageSlots(sc.garage!, GARAGE_CARS)], entrance);
  let most = 0;
  for (let h = 6; h < 23; h++) for (let t = 0; t < HOUR; t += 0.1) {
    sim.step(0.1, { hour: h + t / HOUR, day: 1 }, s, grown, DAY);
    most = Math.max(most, inside(sim).visits.filter(v => v.rc || v.stage === 0 || v.stage === 10).length);
  }
  for (let t = 0; t < 6 * HOUR; t += 0.1) sim.step(0.1, { hour: 23 + 0.9 * t / (6 * HOUR), day: 1 }, s, grown, DAY);
  assert.ok(most > 20, `a busy day (${most} cars on the road at once)`);
  assert.ok(sim.today.golfers > 300, `the day's golfers (${sim.today.golfers})`);
  assert.equal(inside(sim).visits.length, 0, 'no car left on the road');
  assert.equal(drawn(sim).length, 0, 'no car drawn but the picker cart');
});
