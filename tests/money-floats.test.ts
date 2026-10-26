// Money floats up where it is made (T147, #306; the owner, 2026-10-26: "show green +$400 or what ever you make float up from a customer when we
// make money and -$300 when we dont in red"): each money event makes one float with its sign, amount and place at the street zoom, merged per
// place at the mid zoom, none at the district and overview zooms; the caps; the range's money (its sales, fees, coffees, lessons and lost
// golfers), the toll booths' and the businesses' money from the city worker with its place.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FLOAT_LIFE, FLOAT_LIVE_MAX, FLOAT_MID_Z, FLOAT_NEW_MAX, FLOAT_STREET_Z, LOST_WHY, LINE, MAX_LIFT, MERGE_WINDOW, MID_CELL, MoneyFloats, NEAR_PX, RISE_PX, addCash, drawMoneyFloats,
  floatHeight, floatNote, floatPose, floatTier, moneyText, rangeFloat, type MoneyEvent,
} from '../src/game/moneyfloats';
import { DISTRICT_Z, HW, MAP } from '../src/game/iso';
import { RangeSim, defaultRangeBiz, rangeScene, withUpgrade, type CarSlot, type RangeBizSave, type RangeMoneyEvent, type RangeUpgradeId } from '../src/game/golf/rangebiz';
import { bayGrid } from '../src/game/event/carpark';
import type { Rect } from '../src/game/golf/mode';
import { CLASS, RoadNetwork, keyOf, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LaneGraph, type DSeg } from '../src/game/sim/lanes';
import { Sim } from '../src/game/sim/sim';
import { plazaKey, type TollDef } from '../src/game/event/toll';
import { START_BOOTHS } from '../src/game/event/config';
import { City } from '../src/game/city';
import { BUSINESS } from '../src/game/business/catalogue';
import type { BizDef } from '../src/game/business/state';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const STREET = 0.3, MID = 0.15;
const ev = (x: number, y: number, amount: number, kind: MoneyEvent['kind'] = 'in', more: Partial<MoneyEvent> = {}): MoneyEvent => ({ x, y, amount, kind, ...more });

test('the labels: green +$X in, red -$X out and lost, commas for thousands (not the machine\'s locale), cents only under $10', () => {
  assert.equal(moneyText({ kind: 'in', amount: 400 }), '+$400');
  assert.equal(moneyText({ kind: 'out', amount: 300 }), '-$300');
  assert.equal(moneyText({ kind: 'lost', amount: 8 }), '-$8');
  assert.equal(moneyText({ kind: 'in', amount: 1240 }), '+$1,240');
  assert.equal(moneyText({ kind: 'in', amount: 1234567.4 }), '+$1,234,567');
  assert.equal(moneyText({ kind: 'in', amount: 2.5 }), '+$2.50');
  assert.equal(moneyText({ kind: 'in', amount: 12.5 }), '+$13');
  // a lost sale says so under its amount: its reason close up, the count in a place's total
  assert.equal(floatNote({ kind: 'lost', note: '', n: 1, merged: false }), 'lost sale');
  assert.equal(floatNote({ kind: 'lost', note: LOST_WHY.parking, n: 1, merged: false }), 'lost · car park full');
  assert.equal(floatNote({ kind: 'lost', note: LOST_WHY.queue, n: 4, merged: true }), '4 sales lost');
  assert.equal(floatNote({ kind: 'in', note: '', n: 3, merged: true }), '');
});

test('the zoom tiers: one float per transaction from the street zoom in, merged per place at the mid zoom, none at the district and overview zooms', () => {
  assert.equal(FLOAT_MID_Z, DISTRICT_Z);
  assert.ok(FLOAT_STREET_Z > FLOAT_MID_Z && FLOAT_STREET_Z <= 0.3);
  assert.deepEqual([0.3, FLOAT_STREET_Z, 0.19, 0.15, DISTRICT_Z, 0.11, 0.05, 0.01].map(floatTier), ['street', 'street', 'mid', 'mid', 'mid', 'none', 'none', 'none']);
  const fl = new MoneyFloats();
  for (const z of [0.11, 0.05, 0.01]) assert.equal(fl.add(ev(10, 10, 50), 0, z), null, `none at zoom ${z}`);
  assert.equal(fl.live.length, 0);
});

test('street zoom: each money event is one float with its sign, amount and place; floats together on screen make a column a line apart, apart they do not', () => {
  const fl = new MoneyFloats(); fl.frame(0);
  const a = fl.add(ev(10, 20, 8), 0, STREET)!, b = fl.add(ev(40, 50, 300, 'out'), 0, STREET)!, c = fl.add(ev(60, 70, 12, 'lost', { note: 'lost · gave up waiting' }), 0, STREET)!;
  assert.equal(fl.live.length, 3);
  assert.deepEqual([a.kind, a.amount, a.x, a.y, a.merged], ['in', 8, 10, 20, false]);
  assert.deepEqual([b.kind, b.amount, b.x, b.y], ['out', 300, 40, 50]);
  assert.deepEqual([c.kind, c.amount, c.note], ['lost', 12, 'lost · gave up waiting']);
  assert.ok([a, b, c].every(f => f.lift === 0), 'apart: each on its own point\'s first line');
  // a coffee and a lesson at the same counter at once: two floats, the second a line above the first, over the first one's point
  const d = fl.add(ev(10.5, 20.5, 6), 0.1, STREET)!;
  assert.notEqual(d, a); assert.deepEqual([d.x, d.y], [10, 20]);
  assert.ok(Math.abs(floatHeight(d, 0.1) - floatHeight(a, 0.1) - LINE) < 1e-9, 'a line above it');
  // the column rises at one speed: still a line apart later
  assert.ok(Math.abs(floatHeight(d, 1) - floatHeight(a, 1) - LINE) < 1e-9);
  // once the first has risen a line, the next starts on the first line again
  const e2 = fl.add(ev(10, 20, 6), LINE / RISE_PX * FLOAT_LIFE + 0.2, STREET)!;
  assert.equal(e2.lift, 0);
  // a burst at one spot past the column's lines is added to the float of its kind there
  const g = new MoneyFloats(); g.frame(0); const fs = Array.from({ length: 6 }, () => g.add(ev(10, 20, 5), 0, STREET)!);
  assert.equal(g.live.length, MAX_LIFT / LINE + 1); assert.ok(g.live.every(f => f.lift <= MAX_LIFT));
  assert.equal(g.live.reduce((a2, f) => a2 + f.amount, 0), 30, 'the money still adds up'); void fs;
  // no money, or no place: no float
  assert.equal(fl.add(ev(1, 1, 0), 1, STREET), null);
  assert.equal(fl.add(ev(NaN, 1, 5), 1, STREET), null);
});

test('mid zoom: the money of a place in its merge window is one running total at the place\'s point; in, out and lost apart; places apart', () => {
  const fl = new MoneyFloats(); fl.frame(0);
  const range = { group: 'range', gx: 500, gy: 600 };
  let t = 0; for (let k = 0; k < 6; k++, t += MERGE_WINDOW / 8) fl.add(ev(505 + k, 610, 8, 'in', range), t, MID);
  fl.add(ev(490, 640, 8, 'lost', { ...range, note: LOST_WHY.parking }), t, MID); fl.add(ev(491, 640, 8, 'lost', range), t, MID);
  const ins = fl.live.filter(f => f.kind === 'in'), lost = fl.live.filter(f => f.kind === 'lost');
  assert.equal(ins.length, 1, 'one green float over the range'); assert.equal(lost.length, 1, 'one red lost float over the range');
  assert.deepEqual([ins[0]!.amount, ins[0]!.n, ins[0]!.x, ins[0]!.y, ins[0]!.merged], [48, 6, 500, 600, true]);
  assert.equal(lost[0]!.amount, 16); assert.equal(floatNote(lost[0]!), '2 sales lost');
  assert.ok(Math.abs(floatHeight(ins[0]!, t) - floatHeight(lost[0]!, t)) >= LINE - 1e-9, 'the lost total is drawn on its own line');
  // after the window the next money starts a new total
  const next = fl.add(ev(505, 610, 8, 'in', range), MERGE_WINDOW + 0.01, MID)!;
  assert.notEqual(next, ins[0]); assert.equal(next.amount, 8);
  for (const f of fl.live) if (f !== next) assert.ok(Math.abs(floatHeight(f, MERGE_WINDOW + 0.01) - floatHeight(next, MERGE_WINDOW + 0.01)) >= LINE - 1e-9, 'the new total clear of the others');
  // with no group, money in one MID_CELL cell merges at its first point; another cell is another place
  const g = new MoneyFloats(); g.frame(0);
  const p = g.add(ev(MID_CELL * 3 + 1, MID_CELL * 2 + 1, 5), 0, MID)!; g.add(ev(MID_CELL * 3 + 9, MID_CELL * 2 + 9, 5), 0.1, MID);
  const q = g.add(ev(MID_CELL * 5 + 1, MID_CELL * 2 + 1, 5), 0.1, MID)!;
  assert.equal(g.live.length, 2); assert.deepEqual([p.amount, p.x], [10, MID_CELL * 3 + 1]); assert.notEqual(p, q);
});

test('the caps: at most FLOAT_NEW_MAX new floats a frame and FLOAT_LIVE_MAX on screen; money over them is added to the float at its spot, else dropped', () => {
  const fl = new MoneyFloats(); fl.frame(0);
  for (let k = 0; k < 20; k++) fl.add(ev(10 + 10 * k, 10, 5), 0, STREET);
  assert.equal(fl.live.length, FLOAT_NEW_MAX, 'capped this frame');
  assert.equal(fl.dropped, 20 - FLOAT_NEW_MAX, 'the rest had no float at their spot');
  // money at a spot with a float is added to it, so what floats up still adds up
  const first = fl.live[0]!; fl.add(ev(10, 10, 7), 0, STREET);
  assert.equal(first.amount, 12); assert.equal(first.n, 2);
  // the next frame takes new floats again, up to the live cap
  let t = 0;
  for (let f = 0; f < 20; f++) { t += 0.01; fl.frame(t); for (let k = 0; k < FLOAT_NEW_MAX; k++) fl.add(ev(500 + 10 * (f * FLOAT_NEW_MAX + k), 500, 5), t, STREET); }
  assert.equal(fl.live.length, FLOAT_LIVE_MAX);
  // their life over, they are gone
  fl.frame(t + FLOAT_LIFE); assert.equal(fl.live.length, 0);
});

test('the rise and fade: from the point, fading in, full, then out by the end of its life (about 1.5 s)', () => {
  assert.ok(FLOAT_LIFE >= 1.2 && FLOAT_LIFE <= 2);
  const at = (t: number) => floatPose({ born: 10 }, 10 + t);
  assert.deepEqual(at(0), { rise: 0, alpha: 0 });
  assert.equal(at(FLOAT_LIFE * 0.3).alpha, 1);
  assert.ok(at(FLOAT_LIFE * 0.8).alpha < 1 && at(FLOAT_LIFE * 0.8).rise > at(FLOAT_LIFE * 0.3).rise);
  assert.deepEqual(at(FLOAT_LIFE), { rise: 1, alpha: 0 });
});

test('drawing: each float\'s label (and a lost sale\'s caption) is written once with an outline, at most three font changes a frame', () => {
  const fl = new MoneyFloats(); fl.frame(0);
  fl.add(ev(10, 10, 8), 0, STREET); fl.add(ev(30, 30, 300, 'out'), 0, STREET); fl.add(ev(50, 50, 8, 'lost', { note: LOST_WHY.queue }), 0, STREET);
  fl.add(ev(200, 200, 40, 'in', { group: 'range', gx: 200, gy: 200 }), 0, MID);
  const filled: string[] = [], stroked: string[] = []; let fonts = 0;
  const ctx = { setTransform() {}, strokeText: (t: string) => stroked.push(t), fillText: (t: string) => filled.push(t), set font(_: string) { fonts++; } } as unknown as CanvasRenderingContext2D;
  drawMoneyFloats(ctx, fl.live, 0.5, (x, y) => ({ x, y }), 0.3, 1, 1000, 1000);
  assert.deepEqual(filled.sort(), ['+$40', '+$8', '-$300', '-$8', 'lost · line too long'].sort());
  assert.deepEqual(stroked.sort(), filled.sort());
  assert.equal(fonts, 3);
});

// ---- the range's money (T146's RangeSim.onMoney) ----
const P: Rect = [200, 200, 70, 150], entrance = { x: P[0] + 72, y: P[1] + 9 };
const LOT44: Rect = [P[0] + 49, P[1] + 2, 20, 16];
const GROWN: RangeUpgradeId[] = ['bays8', 'bays12', 'bays24', 'targets', 'covered', 'lights', 'dispenser', 'proshop', 'kiosk', 'picker', 'tier2', 'academy'];
const grown = { tier: 1, exits: 2, residents: 2000, propsAppeal: 0.4, practiceAppeal: 0.21 };
const DAY = 600, HOUR = DAY / 24;

test('the range: each sale, coffee, lesson and lost golfer floats up once where it happened, green with its takings or red with the bucket it would have bought', t => {
  const s: RangeBizSave = GROWN.reduce((q, id) => withUpgrade(q, id), defaultRangeBiz()); s.price = 8;
  const sc = rangeScene(P, 2, s), sim = new RangeSim(11, 10), slots: CarSlot[] = bayGrid({ id: 1, x: LOT44[0], y: LOT44[1], w: LOT44[2], h: LOT44[3] }, 0, [entrance]);
  sim.setScene(sc, slots, entrance);
  const events: RangeMoneyEvent[] = [], floats: { e: RangeMoneyEvent; f: ReturnType<MoneyFloats['add']> }[] = [];
  const fl = new MoneyFloats(); let now = 0;
  sim.onMoney = e => { events.push(e); const m = rangeFloat(e, sc.counter); floats.push({ e, f: m ? fl.add(m, now, STREET) : null }); };
  let booked = 0;
  for (let h = 12; h < 20; h++) for (let u = 0; u < HOUR; u += 0.1) { now += 0.1; fl.frame(now); booked += sim.step(0.1, { hour: h + u / HOUR, day: 1 }, s, grown, DAY); }
  const kinds = new Set(events.map(e => e.kind)); for (const k of ['bucket', 'coffee', 'lesson', 'lost'] as const) assert.ok(kinds.has(k), `a ${k} happened`);
  // each event floats once at its place with its sign: a float of its own, or (a burst at one spot past the column's lines: cars turned away together)
  // added to the newest float of its kind there, so the money still adds up
  assert.ok(floats.every(({ f }) => f), 'no money event dropped');
  for (const { e, f } of floats) {
    assert.ok(Math.hypot(f!.x - e.at!.x, f!.y - e.at!.y) < 2 * NEAR_PX / (HW * STREET), 'at its place (a column over a float near it)');
    if (e.kind === 'lost') { assert.equal(f!.kind, 'lost'); assert.ok(e.missed! > 0 && e.amount === 0, 'a lost golfer is not charged'); assert.equal(f!.note, LOST_WHY[e.why!]); }
    else assert.equal(f!.kind, 'in');
  }
  const uniq = [...new Set(floats.map(({ f }) => f!))], own = floats.filter(({ f }) => f!.n === 1).length;
  const ownIn = floats.filter(({ e, f }) => e.kind !== 'lost' && f!.n === 1).length, nIn = floats.filter(({ e }) => e.kind !== 'lost').length;
  t.diagnostic(`own floats: ${own} of ${floats.length}; the sales ${ownIn} of ${nIn} (the rest added to a float at their spot: bursts of cars turned away)`);
  assert.ok(ownIn > 0.8 * nIn && own > 0.5 * floats.length, `most events have a float of their own (${own} of ${floats.length}, the sales ${ownIn} of ${nIn})`);
  const sum = (k: string) => uniq.filter(f => f.kind === k).reduce((a, f) => a + f.amount, 0);
  assert.ok(Math.abs(sum('in') - booked) < 1e-6, `the green floats add up to the takings booked ($${booked.toFixed(0)})`);
  assert.ok(Math.abs(sum('lost') - events.reduce((a, e) => a + (e.missed ?? 0), 0)) < 1e-6, 'the red floats add up to the sales lost');
  assert.ok(floats.some(({ e }) => e.kind === 'lost' && e.why === 'parking'), 'a car the full car park turned away floats red');
  // a skip's money has no place: no float
  assert.equal(rangeFloat({ kind: 'bucket', n: 30, amount: 240, at: null }, sc.counter), null);
  // at the mid zoom the range's money is merged over its shop
  const m = rangeFloat({ kind: 'coffee', n: 1, amount: 4, at: { x: 1, y: 2 } }, sc.counter)!;
  assert.deepEqual([m.group, m.gx, m.gy], ['range', sc.counter.x, sc.counter.y]);
});

// ---- the city worker's money with its place (City.takeCash, posted with the frame) ----
test('the worker\'s money: x, y, signed $ and lost, as green in, red out and red lost floats', () => {
  const fl = new MoneyFloats(); fl.frame(0);
  addCash(fl, [10, 10, 4, 0, 30, 30, -120, 0, 50, 50, -16, 1], 0, STREET);
  assert.deepEqual(fl.live.map(f => [f.kind, f.amount, f.x, f.y]), [['in', 4, 10, 10], ['out', 120, 30, 30], ['lost', 16, 50, 50]]);
});

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
test('the toll booths: each car served is one point at its booth (the City floats its toll there)', () => {
  const Y = 300, PLAZA = [leg(100, Y, 120, Y), leg(120, Y, 150, Y), leg(150, Y, 170, Y)], GATE: TollDef = { id: 1, ax: 120, ay: Y, bx: 150, by: Y, booths: START_BOOTHS };
  const e = new NetEditor(new RoadNetwork()); e.addLegs(PLAZA, CLASS.street, 0); e.commit();
  const g = new LaneGraph(); g.update(e.net); g.setTolls([GATE], e.net);
  const dk = (ax: number, ay: number, bx: number, by: number) => `${keyOf({ x: ax, y: ay })}>${keyOf({ x: bx, y: by })}`;
  const dseg = (k: string): DSeg => g.dsegs.find((d): d is DSeg => !!d && d.key === k)!;
  const sim = new Sim(g, 200, 5), from = dseg(dk(100, Y, 120, Y)), dest = dseg(dk(150, Y, 170, Y));
  assert.ok(dseg(plazaKey(GATE)));
  let sent = 0;
  for (let k = 0; k < 6000 && sim.stats.arrived < 20; k++) { if (sent < 20 && sim.spawnAt(from.lanes[0]!, 1, dest.id, dest.len - 2) !== -1) sent++; sim.step(); }
  assert.equal(sim.tolls, 20);
  assert.equal(sim.tollAt.length, 40, 'a point per car served');
  for (let k = 0; k < sim.tollAt.length; k += 2) { const x = sim.tollAt[k]!, y = sim.tollAt[k + 1]!; assert.ok(x > 118 && x < 152 && Math.abs(y - Y) < 12, `paid at the plaza (${x.toFixed(1)}, ${y.toFixed(1)})`); }
});

test('a town business: each visit\'s takings float green at the business, a lost car red with the sale it would have made; the cash is taken once', () => {
  const CENTRES = [{ x: 300, y: 300 }, { x: 1000, y: 400 }, { x: 600, y: 1000 }], GRID = Array.from({ length: 8 }, (_, k) => 160 + 40 * k);
  const BAR: BizDef = { id: 2, type: 'sportsbar', x: 300, y: 366, w: 14, h: 10 };
  const city = new City(7); city.autoStadium = false;
  city.terrain(new Uint8Array(MAP * MAP), { x: 40, y: 40 }, 7, CENTRES);
  const e = new NetEditor(new RoadNetwork());
  for (const v of GRID) { e.addLegs([leg(GRID[0]!, v, GRID[GRID.length - 1]!, v)], CLASS.street, 0); e.addLegs([leg(v, GRID[0]!, v, GRID[GRID.length - 1]!)], CLASS.street, 0); }
  city.netOps(e.commit(true));
  assert.equal(city.stamp(300).length > 0, true);
  assert.equal(city.takeCash(), null, 'the towns built at once float no fees');
  city.setBusinesses([BAR]);
  const per = BUSINESS.sportsbar.pricePerVisitor * BUSINESS.sportsbar.party, cx = BAR.x + BAR.w / 2, cy = BAR.y + BAR.h / 2;
  let green = 0, red = 0, ledger = null;
  for (let i = 0; i < 4000 && !ledger; i++) {
    ledger = city.step(10).ledger;
    const c = city.takeCash(); if (!c) continue;
    for (let k = 0; k < c.length; k += 4) {
      if (Math.abs(c[k]! - cx) > 1e-3 || Math.abs(c[k + 1]! - cy) > 1e-3) continue;
      if (c[k + 3] === 1) { assert.equal(c[k + 2], -per); red++; } else { assert.equal(c[k + 2], per); green++; }
    }
  }
  assert.ok(ledger, 'a game day closed');
  const s = city.bizView().find(b => b.id === BAR.id)!;
  assert.ok(s.visitors > 0);
  assert.equal(green, s.visitors, `a green float per visit (${green})`);
  assert.equal(city.takeCash(), null, 'taken once');
  void red;
});
