// The World of Golf extras (plan P24 Phase 4b, T133: golf/rangesave.ts and golf/rangebiz.ts): the second tier of bays, the academy, the coffee
// kiosk, the ball picker cart and the player's home growing from the caravan to the house. Each extra is a range card upgrade with its cost, its
// upkeep, its effect and its change on the map; the home grows by the lifetime takings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACADEMY_BAYS, COFFEE, DECK_H, EXTRA_APPEAL, GROUND_APPEAL, HOME_AT, KIOSK_SHARE, LESSON, LESSON_SHARE, PICK_SWATH, RANGE_UPGRADES, RangeSim, TIER2_BAYS,
  defaultRangeBiz, homeStage, normalizeRangeBiz, rangeNewSeason, rangeScale, rangeScene, rangeStats, rangeUpkeep, skippedVisits, upgradeWhy, withUpgrade,
  type CarSlot, type RangeBizSave, type RangeUpgradeId,
} from '../src/game/golf/rangebiz';
import { RangeHost, type RangeHostCtx } from '../src/game/golf/rangehost';
import { RANGE_STAND_INS } from '../src/game/golf/range-look';
import type { Rect } from '../src/game/golf/mode';

const plots: Record<0 | 1 | 2 | 3, Rect> = { 0: [500, 600, 70, 150], 1: [900, 300, 150, 70], 2: [200, 200, 70, 150], 3: [1200, 1300, 150, 70] };
const FACINGS = [0, 1, 2, 3] as const;
const start = { tier: 1, exits: 2, residents: 0 }, busy = { tier: 5, exits: 2, residents: 20000 };
const buy = (ids: RangeUpgradeId[], s = defaultRangeBiz()): RangeBizSave => ids.reduce((q, id) => withUpgrade(q, id), s);
const BASE: RangeUpgradeId[] = ['bays8', 'bays12', 'greens', 'targets', 'covered', 'dispenser', 'proshop'];
const EVERY: RangeUpgradeId[] = [...BASE, 'bays24', 'lights', 'kiosk', 'picker', 'tier2', 'academy', 'gravel', 'pave', 'parking', 'teeturf', 'grass'];

test('the extras are range card upgrades: their costs, upkeep and what each needs first', () => {
  const by = new Map(RANGE_UPGRADES.map(u => [u.id, u]));
  for (const id of ['tier2', 'academy', 'kiosk', 'picker'] as const) {
    const u = by.get(id)!; assert.ok(u.cost > 0 && u.upkeep > 0 && u.upkeep < u.cost / 50, `${id}: $${u.cost}, $${u.upkeep} a month`);
  }
  const d = defaultRangeBiz();
  assert.equal(upgradeWhy(d, 'tier2', 1e9), 'Build 12 hitting bays first');
  assert.equal(upgradeWhy(buy(['bays8', 'bays12']), 'tier2', 1e9), 'Build Covered bays first', 'the second tier needs the covered bays too');
  assert.equal(upgradeWhy(buy(['bays8', 'bays12', 'covered']), 'tier2', 1e9), '');
  assert.equal(upgradeWhy(d, 'academy', 1e9), 'Build Pro shop first');
  assert.equal(upgradeWhy(d, 'picker', 1e9), 'Build 8 hitting bays first');
  assert.equal(upgradeWhy(d, 'kiosk', 9000), '', 'the kiosk needs nothing first');
  // the upkeep goes through T132's monthly upkeep
  assert.equal(rangeUpkeep(buy(['kiosk'])), 80);
  assert.equal(rangeUpkeep(buy(EVERY)), RANGE_UPGRADES.reduce((a, u) => a + u.upkeep, 0));
});

test('what the extras do to the stats: twelve bays upstairs, the appeal, the hours stay', () => {
  const base = buy(BASE), s0 = rangeStats(base), s1 = rangeStats(buy(['tier2'], base)), all = rangeStats(buy(EVERY));
  assert.equal(s1.bays, s0.bays + TIER2_BAYS); assert.equal(s1.lowerBays, 12); assert.ok(s1.tier2);
  assert.ok(Math.abs(s1.appeal - s0.appeal - EXTRA_APPEAL.tier2) < 1e-9);
  assert.equal(all.bays, 36); assert.equal(all.lowerBays, 24); assert.equal(all.qMax, 4 + 9);
  assert.ok(all.academy && all.kiosk && all.picker);
  assert.ok(Math.abs(all.appeal - (1.6 + 0.1 + 0.05 + 0.03 + 0.05 + GROUND_APPEAL.teeturf + GROUND_APPEAL.grass)) < 1e-9); // T223: the ground upgrades too
  assert.equal(all.close, 22); assert.equal(rangeStats(buy(['kiosk', 'picker'], buy(['bays8']))).close, 18);
});

test('the save: the extras round-trip, an old save migrates with zero counts, a second tier without its prerequisites is dropped', () => {
  const s = buy(EVERY); s.extras.kiosk.season.golfers = 3; s.extras.academy.total.takings = 1200;
  const back = normalizeRangeBiz(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(back.owned, s.owned); assert.deepEqual(back.extras, s.extras);
  const old = normalizeRangeBiz({ v: 1, owned: ['bays8', 'tier2', 'academy'], price: 6, season: { takings: 5 }, practice: {} });
  assert.deepEqual(old.owned, ['teeturf', 'grass', 'greens', 'gravel', 'pave', 'bays8'], 'the second tier (no 12 bays or cover) and the academy (no pro shop) are dropped; the grass of a save from before T223 is kept');
  assert.deepEqual(old.extras, defaultRangeBiz().extras, 'a save from before T133 has no coffees or lessons');
  rangeNewSeason(s); assert.equal(s.extras.kiosk.season.golfers, 0); assert.equal(s.extras.academy.total.takings, 1200);
});

test('the scene: the deck, its upper bays, the academy, the kiosk and the picker cart stand on the plot for every facing', () => {
  for (const f of FACINGS) {
    const p = plots[f], inPlot = (x: number, y: number) => x >= p[0] - 1e-6 && y >= p[1] - 1e-6 && x <= p[0] + p[2] + 1e-6 && y <= p[1] + p[3] + 1e-6;
    for (const ids of [[...BASE, 'tier2', 'academy', 'kiosk', 'picker'], EVERY] as RangeUpgradeId[][]) {
      const s = buy(ids); s.total.takings = HOME_AT[1];
      const sc = rangeScene(p, f, s), st = rangeStats(s);
      for (const q of sc.pieces) assert.ok(inPlot(q.x, q.y), `facing ${f}: ${q.key} on the plot`);
      assert.equal(new Set(sc.pieces.map(q => q.key)).size, sc.pieces.length, 'unique keys');
      assert.equal(sc.bays.length, st.bays); assert.equal(sc.bays.filter(b => b.lift === DECK_H).length, TIER2_BAYS, 'twelve bays upstairs');
      assert.equal(rangeScene(p, f, s, { look: RANGE_STAND_INS }).patches.filter(q => q.surf === 'asphaltDark').length, st.lowerBays, 'pads only on the tee box');
      assert.equal(sc.patches.filter(q => q.surf === 'mats').length, 1, 'T258: the mats\' picture only on the tee box');
      const decks = sc.pieces.filter(q => q.key.startsWith('deck'));
      assert.equal(decks.length, st.lowerBays === 12 ? 3 : 4, 'the deck over the lower roofs under the middle twelve slots');
      assert.ok(decks.every(q => q.lift === DECK_H && q.id === 'business:golf-driving-range'));
      assert.equal(decks.filter(q => q.label).length, 1, 'one stand-in label');
      for (const q of decks) { const r = sc.pieces.find(o => o.key === q.key.replace('deck', 'roof'))!; assert.ok(Math.abs(q.x - r.x - 0.05) < 1e-9 && Math.abs(q.y - r.y - 0.05) < 1e-9, 'a hair nearer the camera than the roof it stands on'); assert.deepEqual(q.foot!.map((v, i) => +(v - r.foot![i]!).toFixed(9)), [0.05, 0.05, 0.05, 0.05]); }
      // the roofs' footprints (D48) lie behind every golfer's spot, so the golfers draw in front of them or behind them as the range faces
      const roofs = sc.pieces.filter(q => q.key.startsWith('roof'));
      assert.ok(roofs.length > 0 && roofs.every(q => q.foot && q.foot[2] - q.foot[0] > 3 && q.foot[3] - q.foot[1] > 3));
      for (const q of [...roofs, ...decks]) for (const b of sc.bays) { const [x0, y0, x1, y1] = q.foot!; assert.ok(!(b.stand.x > x0 && b.stand.x < x1 && b.stand.y > y0 && b.stand.y < y1), `facing ${f}: a bay's spot outside ${q.key}'s footprint`); }
      assert.equal(sc.bays.filter(b => b.academy).length, ACADEMY_BAYS); assert.ok(sc.bays[0]!.academy && sc.bays[1]!.academy && !sc.bays[0]!.lift);
      assert.ok(sc.academy && inPlot(sc.academy.home.x, sc.academy.home.y)); assert.ok(sc.pieces.some(q => q.key === 'academy-sign' && q.label));
      assert.ok(sc.kiosk && inPlot(sc.kiosk.counter.x, sc.kiosk.counter.y)); assert.ok(sc.pieces.some(q => q.key === 'kiosk' && q.label === 'Stand In for Coffee kiosk'));
      assert.ok(sc.picker && sc.picker.lanes.every(q => inPlot(q.x, q.y)), 'the cart keeps to the plot');
      // its lanes cover the outfield across the range
      const across = sc.picker!.lanes.map(q => (q.x - sc.bays[0]!.stand.x) * sc.roadDir.x + (q.y - sc.bays[0]!.stand.y) * sc.roadDir.y);
      assert.ok(Math.max(...across) - Math.min(...across) > 55);
    }
    const bare = rangeScene(p, f, defaultRangeBiz());
    assert.equal(bare.kiosk, null); assert.equal(bare.picker, null); assert.equal(bare.academy, null); assert.ok(bare.bays.every(b => !b.lift && !b.academy));
  }
});

test('the home grows from the caravan to the cottage to the house with the lifetime takings; the yard grows with it', () => {
  const s = defaultRangeBiz();
  assert.equal(homeStage(s), 0); s.total.takings = HOME_AT[0] - 1; assert.equal(homeStage(s), 0);
  s.total.takings = HOME_AT[0]; assert.equal(homeStage(s), 1); s.total.takings = HOME_AT[1]; assert.equal(homeStage(s), 2);
  for (const f of FACINGS) {
    const at = (t: number) => { const q = defaultRangeBiz(); q.total.takings = t; return rangeScene(plots[f], f, q); };
    const c = at(0), m = at(HOME_AT[0]), h = at(HOME_AT[1]);
    assert.ok(c.pieces.some(q => q.key === 'caravan') && !c.pieces.some(q => q.key === 'cottage' || q.key === 'house'));
    assert.ok(m.pieces.some(q => q.key === 'cottage' && q.id === 'world:house_4' && q.label) && !m.pieces.some(q => q.key === 'caravan'));
    assert.ok(h.pieces.some(q => q.key === 'house' && q.id === 'gen:house-farmhouse-wrap') && h.pieces.some(q => q.key === 'garage'));
    // the house faces the road, as the shop's sign does: the facing's own view
    assert.equal(h.pieces.find(q => q.key === 'house')!.q, f);
    const yardProps = (sc: typeof c) => sc.pieces.filter(q => !/^(yard-|side-|far|mark|flag|board|light|roof|deck)/.test(q.key) && !['shop', 'sign', 'bench', 'bins-tee', 'trolley'].includes(q.key)).length;
    assert.ok(yardProps(c) < yardProps(m) && yardProps(m) < yardProps(h), `the yard fills up (${yardProps(c)}, ${yardProps(m)}, ${yardProps(h)})`);
    assert.equal(c.home, 0); assert.equal(h.home, 2);
    assert.equal(h.patches.filter(q => q.surf === 'firstCut').length, c.patches.filter(q => q.surf === 'firstCut').length + 1, 'a mown lawn, not the dry one');
  }
  // the host re-lays the yard when the home grows and toasts the move once (never on a load)
  const biz = defaultRangeBiz(), toasts: string[] = []; biz.total.takings = HOME_AT[0] + 10;
  const added: string[] = [];
  const ctx: RangeHostCtx = {
    biz: () => biz, plot: () => ({ rect: plots[2], facing: 2 }), carPark: () => null, addPiece: (_p, key) => { added.push(key); return null; }, removeProp: () => {}, setGround: () => {}, layPaths: () => {}, clearTrees: () => {},
    money: () => 1e6, spend: () => {}, book: () => {}, demand: () => start, dayLen: () => 600, simT: () => 0, clock: () => ({ hour: 12, day: 1 }),
    save: () => {}, toast: t => { toasts.push(t); }, emit: () => {}, grid: () => null, layTee: () => false,
  };
  const h = new RangeHost(ctx, 3); h.sync();
  assert.ok(added.includes('range:cottage')); assert.equal(toasts.length, 0, 'loading in the cottage is no move');
  biz.total.takings = HOME_AT[1]; h.sync();
  assert.ok(added.includes('range:house')); assert.equal(toasts.length, 1); assert.match(toasts[0]!, /house/);
  assert.equal(h.view()!.home.name, 'House'); assert.equal(h.view()!.home.next, null);
});

/** a range at facing 2 with a 40-bay car park beside the drive, at hour h, run for secs (steps of 0.1 s); returns the sim and what it saw */
function run(s: RangeBizSave, secs: number, hour: number, c = busy, sim?: RangeSim) {
  const plot = plots[2], sc = rangeScene(plot, 2, s);
  const slots: CarSlot[] = Array.from({ length: 40 }, (_, i) => ({ x: plot[0] + 50 + (i % 8) * 2.4, y: plot[1] + 3 + Math.floor(i / 8) * 3, hx: 0, hy: 1 }));
  const r = sim ?? new RangeSim(11, 10); r.setScene(sc, slots, { x: plot[0] + 69, y: plot[1] + 10 });
  let booked = 0, upstairs = 0, kioskQ = 0, highBall = 0, lifted = 0, proNear = 0, pickerOut = 0;
  const fl = new Float32Array(480);
  for (let t = 0; t < secs; t += 0.1) {
    booked += r.step(0.1, { hour, day: 1 }, s, c, 600);
    upstairs = Math.max(upstairs, r.today.upstairs); kioskQ = Math.max(kioskQ, r.today.kioskQueue);
    const n = r.flying(fl); for (let i = 0; i < n; i++) highBall = Math.max(highBall, fl[3 * i + 2]!);
    const v = r.view(); for (let i = 0; i < v.nPeople; i++) lifted = Math.max(lifted, v.people[i]!.lift);
    if (v.picker?.out) pickerOut++;
    if (sc.academy) {
      const pro = v.people[v.nPeople - 1]!;
      for (let i = 0; i < v.nPeople - 1; i++) { const q = v.people[i]!; if (Math.hypot(q.x - pro.x, q.y - pro.y) < 1.6 && Math.hypot(q.x - sc.bays[0]!.stand.x, q.y - sc.bays[0]!.stand.y) < 3) { proNear++; break; } }
    }
  }
  return { r, sc, booked, upstairs, kioskQ, highBall, lifted, proNear, pickerOut };
}

test('the second tier: golfers climb to the upper deck, hit from it (the balls start up there) and the bays count', () => {
  const s = buy([...BASE, 'tier2']), o = run(s, 500, 17);
  assert.ok(o.upstairs > 0, `golfers hit upstairs (${o.upstairs})`);
  assert.ok(Math.abs(o.lifted - DECK_H) < 1e-9, 'drawn at the deck\'s height at their bays');
  assert.ok(o.r.today.playing <= 24);
  assert.ok(o.highBall > 0, 'balls in the air');
  // the bare range plays as before: no one upstairs, no lift
  const bare = run(defaultRangeBiz(), 200, 12, start); assert.equal(bare.upstairs, 0); assert.equal(bare.lifted, 0);
});

test('the coffee kiosk: a share of golfers queue at it after their bucket and pay for a coffee, booked with the takings', () => {
  const s = buy(['kiosk']), o = run(s, 600, 17);
  const k = s.extras.kiosk.season;
  assert.ok(k.golfers >= 3, `coffees sold (${k.golfers})`); assert.ok(o.kioskQ >= 1, `a line at the kiosk (${o.kioskQ})`);
  assert.equal(k.takings, k.golfers * COFFEE * rangeScale(600));
  assert.ok(Math.abs(s.season.takings - (s.season.golfers * 240 + k.takings)) < 1e-6, 'the coffees are in the season\'s takings');
  assert.ok(Math.abs(o.booked - s.season.takings) < 1e-6);
  const share = k.golfers / s.season.golfers; assert.ok(share > 0.15 && share < 0.7, `about ${KIOSK_SHARE} of the golfers (${share.toFixed(2)})`);
  assert.equal(o.r.today.coffees, k.golfers);
});

test('the academy: golfers who want a lesson take a lesson bay and pay $15 more; the pro stands by them', () => {
  const s = buy(['bays8', 'proshop', 'academy']), o = run(s, 900, 17);
  const a = s.extras.academy.season;
  assert.ok(a.golfers >= 2, `lessons given (${a.golfers})`);
  assert.equal(a.takings, a.golfers * LESSON * rangeScale(600));
  assert.ok(a.golfers / s.season.golfers < LESSON_SHARE * 2.5, 'a share of the golfers');
  assert.ok(o.proNear > 0, 'the pro seen beside a golfer at a lesson bay');
  const v = o.r.view(); assert.ok(v.nPeople >= 1 && v.people[v.nPeople - 1]!.person === 3, 'the pro is drawn');
});

test('the ball picker cart drives its lanes after closing and picks the balls; without it they go at once (D15)', () => {
  const s = buy(['bays8', 'picker']), o = run(s, 300, 15);
  const lying = o.r.nLying; assert.ok(lying > 20, `balls lie on the range (${lying})`);
  const v0 = o.r.view(); assert.ok(v0.picker && !v0.picker.out, 'parked by day');
  // closing: the last buckets finish, then the cart goes out and the balls go as it passes
  const night = run(s, 260, 19, busy, o.r);
  assert.ok(night.pickerOut > 0, 'the cart drives out');
  assert.ok(o.r.nLying < lying, `picked as it passes (${o.r.nLying} of ${lying} left)`);
  run(s, 200, 21, busy, o.r);
  assert.equal(o.r.nLying, 0, 'all picked by the end of its lanes'); assert.ok(!o.r.view().picker!.out, 'home again');
  assert.ok(PICK_SWATH * 2 * 12 >= 60, 'twelve lanes of its swath cover the outfield');
  const bare = buy(['bays8']), b = run(bare, 300, 15); assert.ok(b.r.nLying > 0); run(bare, 400, 19, busy, b.r); assert.equal(b.r.nLying, 0);
});

test('a skip books the extras\' expected coffees and lessons', () => {
  const s = buy(['bays8', 'proshop', 'academy', 'kiosk']), sim = new RangeSim(3, 10), sc = rangeScene(plots[2], 2, s);
  sim.setScene(sc, [{ x: 260, y: 210, hx: 0, hy: 1 }], { x: 269, y: 210 });
  // (T146: the skip counts the sim's car park, its one bay here)
  const r = skippedVisits(s, start, 0, 600, 600, sim.skipLive(rangeStats(s), 600));
  assert.ok(r.coffees > 0 && Math.abs(r.coffees - r.served * KIOSK_SHARE) < 1e-9);
  assert.ok(r.lessons > 0 && r.lessons <= r.served * LESSON_SHARE + 1e-9 && r.lessons <= ACADEMY_BAYS * 11 + 1e-9);
  const booked = sim.step(600, { hour: 0, day: 1 }, s, start, 600);
  assert.ok(Math.abs(s.extras.kiosk.season.golfers - r.coffees) < 1e-9 && Math.abs(s.extras.academy.season.golfers - r.lessons) < 1e-9);
  assert.ok(Math.abs(booked - s.season.takings) < 1e-6);
  assert.equal(skippedVisits(defaultRangeBiz(), start, 0, 600, 600).lessons, 0);
  assert.ok(skippedVisits(s, start, 0, 600, 600).lessons >= r.lessons, 'without the car park counted the skip books at least as many');
});
