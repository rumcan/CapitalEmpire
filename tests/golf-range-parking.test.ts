// The range's car park grows with the range (T146, plan P24 D49; the owner, 2026-10-26: "lets add a carpark building. server the golfers in
// parallel"): the car park building (a range card upgrade once the second tier makes parking the limit), the pro shop's counters serving in
// parallel, the cars a full car park turns away, and the skip counting the car park and the bays' turnover as the live range does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BAYS_A_COUNTER, GARAGE_ART, GARAGE_CARS, GARAGE_LEVELS, GARAGE_LEVEL_CARS, RANGE_UPGRADES, RangeSim, defaultRangeBiz, garageSlots, normalizeRangeBiz, rangeScene, rangeStats, rangeUpkeep,
  skippedVisits, upgradeWhy, withUpgrade, type CarSlot, type RangeBizSave, type RangeMoneyEvent, type RangeUpgradeId,
} from '../src/game/golf/rangebiz';
import { RangeHost, type RangeHostCtx } from '../src/game/golf/rangehost';
import { bayGrid } from '../src/game/event/carpark';
import { plotPoint } from '../src/game/golf/range';
import type { Rect } from '../src/game/golf/mode';

const plots: Record<0 | 1 | 2 | 3, Rect> = { 0: [500, 600, 70, 150], 1: [900, 300, 150, 70], 2: [200, 200, 70, 150], 3: [1200, 1300, 150, 70] };
const buy = (ids: RangeUpgradeId[], s = defaultRangeBiz()): RangeBizSave => ids.reduce((q, id) => withUpgrade(q, id), s);
const GROWN: RangeUpgradeId[] = ['greens', 'gravel', 'pave', 'bays8', 'bays12', 'bays24', 'targets', 'covered', 'lights', 'dispenser', 'proshop', 'kiosk', 'picker', 'tier2', 'academy'];
/** P24's grown range: 2,000 residents, $8 a bucket, props +40%, both practice greens' appeal */
const grown = { tier: 1, exits: 2, residents: 2000, propsAppeal: 0.4, practiceAppeal: 0.21 };
const DAY = 600, HOUR = DAY / 24;
/** the range car park of the test maps at facing 2 (frame u 49..69, v 2..18 beside the drive at u 72: 44 bays), its entrance on the drive */
const P = plots[2], entrance = { x: P[0] + 72, y: P[1] + 9 };
const lot = (r: Rect): CarSlot[] => bayGrid({ id: 1, x: r[0], y: r[1], w: r[2], h: r[3] }, 0, [entrance]);
const LOT44: Rect = [P[0] + 49, P[1] + 2, 20, 16];

/** a range at facing 2 from 06:00 to 23:00 and on through the night (steps of 0.1 s): the peaks it saw and its day */
function day(s: RangeBizSave, slots: (sc: ReturnType<typeof rangeScene>) => CarSlot[], seed = 11, upTo = 23) {
  const sc = rangeScene(P, 2, s), sim = new RangeSim(seed, 10), sl = slots(sc); sim.setScene(sc, sl, entrance);
  let held = 0, taken = 0, soldHour = 0, insideDrawn = 0, insideParked = 0, atDoor = 0;
  const events: RangeMoneyEvent[] = []; sim.onMoney = e => events.push(e);
  let booked = 0;
  for (let h = 6; h < upTo; h++) {
    const g0 = sim.today.golfers;
    for (let t = 0; t < HOUR; t += 0.1) {
      booked += sim.step(0.1, { hour: h + t / HOUR, day: 1 }, s, grown, DAY);
      held = Math.max(held, (sim as unknown as { slotBusy: boolean[] }).slotBusy.filter(Boolean).length); taken = Math.max(taken, sim.today.taken);
      if (sc.garage && Math.round(t * 10) % 20 === 0) {
        const v = sim.view(), r = sc.garage.ramp, d = sc.garage.door;
        for (let i = 0; i < v.nCars; i++) if (Math.hypot(v.cars[i]!.x - r.x, v.cars[i]!.y - r.y) < 0.05) insideDrawn++;
        insideParked = Math.max(insideParked, sim.parked(true));
        for (let i = 0; i < v.nPeople; i++) if (Math.hypot(v.people[i]!.x - d.x, v.people[i]!.y - d.y) < 0.6) atDoor++;
      }
    }
    soldHour = Math.max(soldHour, sim.today.golfers - g0);
  }
  if (upTo >= 23) for (let t = 0; t < 6 * HOUR; t += 0.1) booked += sim.step(0.1, { hour: 23 + 0.9 * t / (6 * HOUR), day: 1 }, s, grown, DAY);
  return { sim, sc, held, taken, soldHour, insideDrawn, insideParked, atDoor, events, booked, bays: sl.length };
}

test('the car park building: a range card upgrade after the second tier, its cost and upkeep, the counters by the bays', () => {
  const u = RANGE_UPGRADES.find(q => q.id === 'parking')!;
  assert.ok(u && u.cost >= 20000 && u.upkeep > 0 && u.upkeep < u.cost / 50, `$${u.cost}, $${u.upkeep} a month`);
  assert.match(u.effect, new RegExp(`${GARAGE_CARS} cars`));
  assert.equal(upgradeWhy(buy(['bays8', 'bays12', 'covered']), 'parking', 1e9), 'Build Second tier of bays first', 'offered once the second tier makes parking the limit');
  assert.equal(upgradeWhy(buy(['bays8', 'bays12', 'covered', 'tier2']), 'parking', 1e9), 'Build Pave the car park first', 'T239: beside a paved lot');
  assert.equal(upgradeWhy(buy(['bays8', 'bays12', 'covered', 'tier2', 'gravel', 'pave']), 'parking', 1e9), '');
  assert.equal(rangeUpkeep(buy(['bays8', 'bays12', 'covered', 'tier2', 'parking'])), 60 + 90 + 120 + 450 + u.upkeep);
  // the counters grow with the bays: one up to 9 bays, the second tier adding one
  const counters = (ids: RangeUpgradeId[]) => rangeStats(buy(ids)).counters;
  assert.deepEqual([counters([]), counters(['bays8']), counters(['bays8', 'bays12']), counters(['bays8', 'bays12', 'bays24']), counters(['bays8', 'bays12', 'bays24', 'covered', 'tier2'])], [1, 1, 2, 3, 4]);
  assert.equal(BAYS_A_COUNTER, 9);
  assert.ok(rangeStats(buy([...GROWN, 'parking'])).parking && !rangeStats(buy(GROWN)).parking);
});

test('the save: the building round-trips, an old save loads without it, a building without the second tier or a stray path flag is dropped', () => {
  const s = buy([...GROWN, 'parking']); s.garage = true;
  const back = normalizeRangeBiz(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(back.owned, s.owned); assert.equal(back.garage, true);
  // a save from before T146 (T133's shape): nothing new, no building
  const old = normalizeRangeBiz({ v: 1, owned: GROWN, price: 8, season: { takings: 5 }, total: { takings: 9 }, practice: {}, extras: {}, paths: true, tee: true });
  assert.deepEqual(old.owned, ['teeturf', 'grass', ...GROWN], 'a save from before T223 keeps its grass (and from before T239 its greens and paved lot: GROWN lists them first)'); assert.equal(old.garage, undefined); assert.ok(!rangeStats(old).parking);
  assert.deepEqual(normalizeRangeBiz({ v: 1, owned: ['bays8', 'parking'], price: 6, garage: true, desert: true }).owned, ['greens', 'gravel', 'pave', 'bays8'], 'the building needs the second tier (T239: an old save keeps its greens and paved lot)');
  assert.equal(normalizeRangeBiz({ v: 1, owned: ['bays8'], price: 6, garage: true }).garage, undefined, 'no path flag without the building');
});

test('the car park building\'s art: the parking garage whose covered levels hold GARAGE_CARS (T154)', () => {
  assert.equal(GARAGE_ART, 'ce:parking-garage-6storey');
  assert.equal(GARAGE_LEVELS * GARAGE_LEVEL_CARS, GARAGE_CARS, 'its five covered levels at 36 cars a level hold the 180');
});

test('the scene: the building on the lot\'s far half for every facing, clear of the lot, the shop, the kiosk, the paths and the tee box', () => {
  for (const f of [0, 1, 2, 3] as const) {
    const p = plots[f], s = buy([...GROWN, 'parking']), sc = rangeScene(p, f, s), g = sc.garage!;
    const F = (u: number, v: number) => plotPoint(p, f, u, v), inBox = (q: { x: number; y: number }, b: number[], m = 0) => q.x > b[0]! - m && q.x < b[2]! + m && q.y > b[1]! - m && q.y < b[3]! + m;
    const piece = sc.pieces.find(q => q.key === 'carpark')!;
    // T154: the parking garage's own art (no stand-in, no label), at a size, with its footprint
    assert.ok(piece && piece.id === GARAGE_ART && piece.label === undefined && piece.scale! > 0 && piece.fit === undefined && piece.foot, `facing ${f}: the parking garage, unlabelled, with its footprint`);
    assert.deepEqual(piece.foot, g.box);
    // on the old lot (u 49..69, v 2..18), its far half; the lot keeps the near half (u 58..69) beside the drive
    const a = F(49, 2), b = F(69, 18), old = [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)];
    assert.ok(g.box[0] >= old[0]! && g.box[1] >= old[1]! && g.box[2] <= old[2]! && g.box[3] <= old[3]!, 'on the old lot');
    const [lx, ly, lw, lh] = g.lot; assert.ok(lx >= old[0]! && ly >= old[1]! && lx + lw <= old[2]! && ly + lh <= old[3]!, 'the lot inside the old one');
    assert.ok(lx >= g.box[2] || lx + lw <= g.box[0] || ly >= g.box[3] || ly + lh <= g.box[1], 'the lot beside the building, not under it');
    assert.equal(lw * lh, 11 * 16, 'the lot keeps 11 x 16 tiles');
    // nothing of the scene stands on it but itself: the shop, the kiosk and its tables, the bench, the bins, the trolley, the yard
    for (const q of sc.pieces) if (q.key !== 'carpark') assert.ok(!inBox(q, g.box), `facing ${f}: ${q.key} off the building`);
    // the paths, the counters, the line, the bays and the tee box stay off it
    for (const l of sc.paths) for (let k = 0; k <= 20; k++) assert.ok(!inBox({ x: l.a.x + (l.b.x - l.a.x) * k / 20, y: l.a.y + (l.b.y - l.a.y) * k / 20 }, g.box), 'the cart paths off it');
    for (let k = 0; k <= 20; k++) assert.ok(!inBox({ x: g.path.a.x + (g.path.b.x - g.path.a.x) * k / 20, y: g.path.a.y + (g.path.b.y - g.path.a.y) * k / 20 }, g.box), 'its own path runs past it');
    for (const q of [...sc.counters, sc.queueAt, sc.carEdge, ...sc.bays.map(b => b.back)]) assert.ok(!inBox(q, g.box), 'the shop and the bays off it');
    for (let i = 0; i < sc.teeBox.length; i += 2) assert.ok(!inBox({ x: sc.teeBox[i]!, y: sc.teeBox[i + 1]! }, g.box, -0.01));
    // the ramp on its face to the lot, the door on its face to the path, the walk round it in the lot's aisle
    assert.ok(Math.abs(Math.hypot(g.into.x, g.into.y) - 1) < 1e-9 && !inBox(g.ramp, g.box) && inBox({ x: g.ramp.x + g.into.x, y: g.ramp.y + g.into.y }, g.box), 'the ramp heads in');
    assert.ok(!inBox(g.door, g.box) && inBox(g.door, g.box, 1), 'the door on its edge');
    assert.equal(sc.lotWalk.length, 1); assert.ok(!inBox(sc.lotWalk[0]!, g.box));
    // the counters stand apart on the plot, the first nearest the line
    assert.equal(sc.counters.length, 4); assert.equal(new Set(sc.counters.map(q => `${q.x},${q.y}`)).size, 4);
    const d0 = Math.hypot(sc.counters[0]!.x - sc.queueAt.x, sc.counters[0]!.y - sc.queueAt.y);
    assert.ok(sc.counters.every(q => Math.hypot(q.x - sc.queueAt.x, q.y - sc.queueAt.y) >= d0 - 1e-9));
    const bare = rangeScene(p, f, buy(GROWN)); assert.equal(bare.garage, null); assert.deepEqual(bare.lotWalk, []); assert.ok(!bare.pieces.some(q => q.key === 'carpark'));
  }
});

test('a 36-bay range at peak: the 44-bay lot turns cars away; with the building none, and the bays fill', () => {
  const s = buy(GROWN); s.price = 8;
  const before = day(s, () => lot(LOT44), 11, 19);
  assert.equal(before.bays, 44);
  assert.ok(before.sim.today.noPark > 50, `the full lot turns cars away (${before.sim.today.noPark})`);
  assert.ok(before.sim.today.lost >= before.sim.today.noPark);
  const g = buy([...GROWN, 'parking']); g.price = 8;
  const after = day(g, sc => [...lot(sc.garage!.lot), ...garageSlots(sc.garage!, GARAGE_CARS)], 11, 19);
  assert.equal(after.bays, 22 + GARAGE_CARS, 'the lot keeps 22 bays beside the building');
  assert.equal(after.sim.today.noPark, 0, `no car turned away for parking (held at most ${after.held} of ${after.bays})`);
  assert.ok(after.held < after.bays * 0.9, `room to spare (${after.held} of ${after.bays})`);
  assert.equal(after.taken, 36, 'the 36 bays fill at peak (the counters serve in parallel)');
  assert.ok(after.soldHour >= 30, `about 33 sold a town hour at peak (${after.soldHour})`);
  assert.ok(after.sim.today.golfers > before.sim.today.golfers * 1.8, `more golfers (${before.sim.today.golfers} → ${after.sim.today.golfers})`);
  // the building's cars are inside it while parked (not drawn at its ramp), its golfers walk out of its door
  assert.ok(after.insideParked > 20, `cars parked in the building (${after.insideParked})`);
  assert.ok(after.insideDrawn < 40, `the parked cars inside are not drawn (${after.insideDrawn} sightings of cars passing the ramp)`);
  assert.ok(after.atDoor > 0, 'golfers at its door');
});

test('the counters in parallel: a one-counter range of 36 bays would not fill them', () => {
  const g = buy([...GROWN, 'parking']); g.price = 8;
  const sc = rangeScene(P, 2, g), slots = [...lot(sc.garage!.lot), ...garageSlots(sc.garage!, GARAGE_CARS)];
  const one = { ...sc, counters: sc.counters.slice(0, 1) }, sim = new RangeSim(11, 10); sim.setScene(one, slots, entrance);
  let taken = 0;
  for (let h = 6; h < 16; h++) for (let t = 0; t < HOUR; t += 0.1) { sim.step(0.1, { hour: h + t / HOUR, day: 1 }, g, grown, DAY); taken = Math.max(taken, sim.today.taken); }
  assert.ok(taken < 30, `one counter keeps ${taken} of 36 bays busy`);
});

test('the skip agrees with the live range within 20%, never books past the car park, and the money events add up', () => {
  const g = buy([...GROWN, 'parking']); g.price = 8;
  const live = day(g, sc => [...lot(sc.garage!.lot), ...garageSlots(sc.garage!, GARAGE_CARS)]);
  const st = rangeStats(g, grown), caps = live.sim.skipLive(st, DAY);
  const skip = skippedVisits(g, grown, 0, DAY, DAY, caps);
  const off = skip.served / live.sim.today.golfers - 1;
  assert.ok(Math.abs(off) < 0.2, `the skip ${skip.served.toFixed(0)} against the live ${live.sim.today.golfers} (${(off * 100).toFixed(1)}%)`);
  assert.ok(skippedVisits(g, grown, 0, DAY, DAY).served > skip.served * 1.1, 'without counting the live range\'s limits the skip books more');
  // the car hours the skip counts are no fewer than the live cars' (so it never books past what the car park holds)
  assert.ok(live.sim.carStats.n > 100);
  const liveHours = live.sim.carStats.hours / live.sim.carStats.n, model = live.sim.carHours(st, DAY);
  assert.ok(model >= liveHours * 0.95 && model < liveHours * 1.4, `car hours: the model ${model.toFixed(2)}, the live cars ${liveHours.toFixed(2)}`);
  // a small car park caps the skip: no hour books more than its bays over the car hours
  for (const n of [10, 44]) {
    const small = { ...caps, parkBays: n }, r = skippedVisits(g, grown, 0, DAY, DAY, small);
    assert.ok(r.served <= n / caps.carHours * 15 + 1e-9, `${n} bays: ${r.served.toFixed(1)} served`);
    for (let h = 0; h < 24; h++) assert.ok(skippedVisits(g, grown, h, HOUR, DAY, small).served <= n / caps.carHours + 1e-9, `${n} bays, hour ${h}`);
  }
  // the 44-bay lot: the skip books about what the live range sells there (it was 4x before)
  const s = buy(GROWN); s.price = 8;
  const lot44 = day(s, () => lot(LOT44)), r44 = skippedVisits(s, grown, 0, DAY, DAY, lot44.sim.skipLive(rangeStats(s, grown), DAY));
  assert.ok(Math.abs(r44.served / lot44.sim.today.golfers - 1) < 0.25, `the 44-bay lot: skip ${r44.served.toFixed(0)}, live ${lot44.sim.today.golfers}`);
  // a skip step books with the sim's own caps
  const sim = new RangeSim(5, 10); sim.setScene(live.sc, [...lot(live.sc.garage!.lot), ...garageSlots(live.sc.garage!, GARAGE_CARS)], entrance);
  const g2 = buy([...GROWN, 'parking']); g2.price = 8; sim.step(DAY, { hour: 0, day: 2 }, g2, grown, DAY);
  assert.ok(Math.abs(g2.season.golfers - skip.served) < 1e-6, 'the skip step books skippedVisits with the live caps');
  // T147's hook: one event per sale, fee, coffee, lesson and lost golfer, where it happened; their takings are what was booked
  const sum = live.events.reduce((a, e) => a + e.amount, 0);
  assert.ok(Math.abs(sum - live.booked) < 1e-6, 'the events add up to the takings booked');
  const kinds = new Set(live.events.map(e => e.kind)); for (const k of ['bucket', 'coffee', 'lesson', 'lost'] as const) assert.ok(kinds.has(k), k);
  assert.ok(live.events.every(e => e.at && Number.isFinite(e.at.x)), 'each live event has its place');
  assert.ok(live.events.filter(e => e.kind === 'bucket').every(e => live.sc.counters.some(c => c.x === e.at!.x && c.y === e.at!.y)), 'a bucket is sold at a counter');
  assert.ok(live.events.filter(e => e.kind === 'lost').every(e => e.why), 'a lost golfer says why');
});

test('the host: buying the building shrinks the lot, lays its path once (an old save too), and the card shows the parking', () => {
  const biz = buy([...GROWN]); biz.paths = true;
  let fit: Rect | null = null, laid = 0, money = 1e6;
  const ctx: RangeHostCtx = {
    biz: () => biz, plot: () => ({ rect: P, facing: 2 }), carPark: () => ({ bays: lot(fit ?? LOT44), entrance }), fitPark: r => { fit = r; }, addPiece: () => null, removeProp: () => {}, setGround: () => {},
    layPaths: legs => { laid += legs.length; }, clearTrees: () => {}, money: () => money, spend: n => { money -= n; }, book: () => {}, demand: () => grown, dayLen: () => DAY, simT: () => 0,
    clock: () => ({ hour: 12, day: 1 }), save: () => {}, toast: () => {}, emit: () => {}, grid: () => null, layTee: () => false,
  };
  const h = new RangeHost(ctx, 3); h.sync();
  assert.equal(fit, null, 'no building: the lot stays'); assert.equal(laid, 0);
  let v = h.view()!; assert.deepEqual([v.parking.parked, v.parking.bays, v.parking.turned, v.parking.garage], [0, 44, 0, null]);
  assert.ok(v.upgrades.some(u => u.id === 'parking' && u.why === ''), 'offered on the card');
  assert.ok(h.buy('parking'));
  assert.deepEqual(fit, rangeScene(P, 2, biz).garage!.lot); assert.equal(laid, 1); assert.equal(biz.garage, true);
  h.sync(); v = h.view()!;
  assert.equal(v.parking.bays, 22 + GARAGE_CARS, 'the lot\'s 22 and the building\'s places'); assert.deepEqual(v.parking.garage, { parked: 0, cars: GARAGE_CARS });
  h.sync(true); assert.equal(laid, 1, 'the path is laid once');
  // an old save that owns the building but never laid its path (no garage flag) lays it on its first load
  const old = normalizeRangeBiz({ ...JSON.parse(JSON.stringify(biz)), garage: undefined }); Object.assign(biz, old); delete biz.garage;
  const h2 = new RangeHost(ctx, 4); h2.sync(); assert.equal(laid, 2); assert.equal(biz.garage, true);
});
