// T239 (#699), Phase A: the range start as a guided build. The car park starts as packed dirt (loose rows, no bays or lamps) and is gravelled,
// then paved, as range upgrades; no cement walkway beside the tee: the walkers cross the dirt until the player lays a walking path joining the
// car park, the shop and the tee; no target greens until the player builds them; the practice area is land to buy (Land for sale) before
// Facilities › Practice builds on it. Old saves keep their car park, walkway, greens and practice area. Headless.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGACY_UPGRADES, LOT_SHARE, RANGE_UPGRADES, RangeSim, TARGET_APPEAL, WALK_REACH, defaultRangeBiz, lotGround, normalizeRangeBiz, rangeScene, rangeStats,
  upgradeWhy, walkwayOf, withUpgrade, type CarSlot, type RangeBizSave, type RangeUpgradeId,
} from '../src/game/golf/rangebiz';
import { RangeHost, type RangeHostCtx } from '../src/game/golf/rangehost';
import { looseBays } from '../src/game/golf/rangelot';
import { bayGrid } from '../src/game/event/carpark';
import { plotPoint } from '../src/game/golf/range';
import { PRACTICE_LOT_NAME, practiceArea } from '../src/game/golf/practice';
import { PRACTICE_SIZE, PRACTICE_WHY, planCells, planWhy, practicePlan } from '../src/game/golf/practicebuild';
import { makeGrid } from '../src/game/ext/course-grid';
import { LandSale, landOffers, offerFacts, type LandHost } from '../src/game/golf/land-sale';
import { adjacentBlockPrice } from '../src/game/golf/parcels';
import { normalizeGolfSave, type GolfSave, type Rect } from '../src/game/golf/mode';

const PLOT: Rect = [200, 200, 70, 150], F = 2 as const, P = (u: number, v: number) => plotPoint(PLOT, F, u, v);
const buy = (ids: RangeUpgradeId[], s = defaultRangeBiz()): RangeBizSave => ids.reduce((q, id) => withUpgrade(q, id), s);
const by = new Map(RANGE_UPGRADES.map(u => [u.id, u]));
/** the range car park of the test plot (frame u 49..69, v 2..18, beside the drive at u 72: 44 bays), its entrance on the drive */
const entrance = P(72, 9), LOT44: Rect = [PLOT[0] + 49, PLOT[1] + 2, 20, 16];
const lotBays = () => bayGrid({ id: 1, x: LOT44[0], y: LOT44[1], w: LOT44[2], h: LOT44[3] }, 0, [entrance]);
const near = (a: { x: number; y: number }, b: { x: number; y: number }, d = 1e-6) => Math.hypot(a.x - b.x, a.y - b.y) <= d;
/** a walking path in the plot frame: from the car park's edge round a bend at (42, 12), to the shop's counter, then behind the mats */
const BEND = { u: 42, v: 12 };
const PATH_UV: [number, number][] = [[50, 12], [BEND.u, BEND.v], [34, 14], [30, 16.5], [8, 16.5]];
const pathLegs = (uv = PATH_UV) => uv.slice(1).map((q, i) => ({ a: P(uv[i]![0], uv[i]![1]), b: P(q[0], q[1]) }));

test('the new upgrades: Target greens, then the car park gravelled and paved; their order, costs and effects on the card', () => {
  const g = by.get('greens')!, gr = by.get('gravel')!, pv = by.get('pave')!;
  assert.deepEqual([g.cost, gr.cost, pv.cost], [2500, 3000, 8000]);
  for (const u of [g, gr, pv]) { assert.ok(u.upkeep > 0 && u.upkeep < u.cost / 50, `${u.id}: $${u.upkeep} a month`); assert.ok(u.effect.length > 20, `${u.id} says what it does`); }
  assert.match(gr.effect, /80%/); assert.match(gr.effect, /55%/); assert.match(pv.effect, /painted bays and lamps/);
  const d = defaultRangeBiz();
  assert.equal(upgradeWhy(d, 'greens', 1e9), ''); assert.equal(upgradeWhy(d, 'gravel', 1e9), '');
  assert.equal(upgradeWhy(d, 'pave', 1e9), 'Build Gravel the car park first', 'paving comes after the gravel');
  assert.equal(upgradeWhy(buy(['gravel']), 'pave', 1e9), '');
  assert.equal(upgradeWhy(d, 'targets', 1e9), 'Build Target greens first', 'the two more greens and the boards come after the first three');
  assert.equal(upgradeWhy(buy(['bays8', 'bays12', 'covered', 'tier2']), 'parking', 1e9), 'Build Pave the car park first', 'the car park building beside a paved lot');
  // the card lists them before the bays (the guide's order: greens, the car park)
  const ids = RANGE_UPGRADES.map(u => u.id);
  assert.ok(ids.indexOf('greens') < ids.indexOf('bays8') && ids.indexOf('gravel') < ids.indexOf('pave') && ids.indexOf('pave') < ids.indexOf('bays8'));
});

test('the stats: no greens, then three, then five; the lot dirt, gravel, paved; the greens\' appeal adds up to the old five\'s', () => {
  const s0 = rangeStats(defaultRangeBiz()), s1 = rangeStats(buy(['greens'])), s2 = rangeStats(buy(['greens', 'targets']));
  assert.deepEqual([s0.targets, s1.targets, s2.targets], [0, 3, 5]);
  assert.ok(Math.abs(s1.appeal - s0.appeal - TARGET_APPEAL.greens) < 1e-9 && Math.abs(s2.appeal - s0.appeal - 0.25) < 1e-9, 'the five greens keep the +25% they had before T239');
  assert.deepEqual([lotGround(defaultRangeBiz()), lotGround(buy(['gravel'])), lotGround(buy(['gravel', 'pave']))], ['dirt', 'gravel', 'paved']);
  assert.equal(rangeStats(buy(['gravel', 'pave'])).lot, 'paved');
});

test('the fresh start: no target greens, no flags, no boards; the golfers aim down the markers\' line; no lamps on the dirt lot', () => {
  const sc = rangeScene(PLOT, F, defaultRangeBiz());
  assert.equal(sc.targets.length, 0); assert.equal(sc.patches.filter(p => p.surf === 'target').length, 0);
  assert.ok(!sc.pieces.some(p => p.key.startsWith('flag') || p.key.startsWith('board') || p.key.startsWith('lot-lamp')));
  assert.deepEqual(sc.aims.map(a => a.m), [50, 100, 150], 'the aim: the 50, 100 and 150 m markers down the middle');
  assert.ok(sc.pieces.some(p => p.key.startsWith('mark')), 'the distance markers stand');
  const g = rangeScene(PLOT, F, buy(['greens']));
  assert.equal(g.targets.length, 3); assert.equal(g.pieces.filter(p => p.key.startsWith('flag')).length, 3); assert.ok(!g.pieces.some(p => p.key.startsWith('board')), 'the boards come with the targets upgrade');
  assert.deepEqual(g.aims, g.targets);
  assert.equal(rangeScene(PLOT, F, buy(['greens', 'targets'])).pieces.filter(p => p.key.startsWith('board')).length, 5);
  const paved = rangeScene(PLOT, F, buy(['gravel', 'pave']));
  assert.equal(paved.pieces.filter(p => p.key.startsWith('lot-lamp')).length, 4, 'the paved lot has its lamps');
  assert.equal(rangeScene(PLOT, F, buy(['gravel'])).pieces.filter(p => p.key.startsWith('lot-lamp')).length, 0);
  // the balls fly at the markers' line with no green built
  const sim = new RangeSim(3, 10), slots: CarSlot[] = lotBays(); sim.setScene(sc, slots, entrance);
  const s = defaultRangeBiz(), dem = { tier: 1, exits: 2, residents: 0 };
  let flew = 0; const buf = new Float32Array(3 * 160);
  for (let t = 0; t < 600 && !flew; t += 0.2) { sim.step(0.2, { hour: 9 + t / 25, day: 1 }, s, dem, 600); flew = sim.flying(buf); }
  assert.ok(flew > 0, 'golfers hit with no green to aim at');
});

test('the loose lot: dirt holds 55% of the paved bays, gravel 80%, each nudged and turned a little, the same every time, inside the lot', () => {
  const paved = lotBays(), dirt = looseBays(paved, 'dirt'), gravel = looseBays(paved, 'gravel');
  assert.equal(paved.length, 44);
  assert.equal(dirt.length, Math.floor(44 * LOT_SHARE.dirt)); assert.equal(gravel.length, Math.floor(44 * LOT_SHARE.gravel));
  assert.ok(dirt.length < gravel.length && gravel.length < paved.length, 'gravel: more cars');
  assert.deepEqual(looseBays(paved, 'dirt'), dirt, 'deterministic');
  const off = dirt.filter(b => !paved.some(q => near(q, b)));
  assert.ok(off.length > dirt.length / 2, 'loose: most stand off their painted spot');
  const askew = dirt.filter(b => !paved.some(q => Math.abs(q.hx - b.hx) < 1e-9 && Math.abs(q.hy - b.hy) < 1e-9));
  assert.ok(askew.length > dirt.length / 2, 'and turned a little');
  for (const b of dirt) {
    assert.ok(b.x > LOT44[0] && b.x < LOT44[0] + LOT44[2] && b.y > LOT44[1] && b.y < LOT44[1] + LOT44[3], 'inside the lot');
    assert.ok(Math.abs(Math.hypot(b.hx, b.hy) - 1) < 1e-9, 'a unit heading');
    for (const q of dirt) if (q !== b) assert.ok(Math.hypot(q.x - b.x, q.y - b.y) >= 1, 'no two cars touch: a car is 1.8 m wide, the bays 2.5 m apart');
  }
});

test('the walkway: none without a path, or with one that misses the shop; a path joining the car park, the shop and the tee is used', () => {
  const sc = rangeScene(PLOT, F, defaultRangeBiz());
  assert.equal(sc.paths.length, 3, 'the old start\'s walkway is still in the scene (an old save lays it) ...');
  assert.equal(walkwayOf(sc, []), null, '... but a guided start lays none: the walkers cross the dirt');
  assert.equal(walkwayOf(sc, pathLegs([[50, 12], [42, 12]])), null, 'a path from the car park that stops short of the shop and the tee');
  assert.equal(walkwayOf(sc, pathLegs([[30, 16.5], [8, 16.5]])), null, 'a path behind the mats alone');
  assert.equal(walkwayOf(sc, pathLegs([[49 - WALK_REACH - 9, 12], ...PATH_UV.slice(2)])), null, 'a path that does not reach the car park');
  const w = walkwayOf(sc, pathLegs())!;
  assert.ok(w, 'joined: the car park, the shop and the tee');
  assert.ok(near(w.car, P(50, 12), 0.3), 'its car park end'); assert.ok(near(w.shop, P(34, 14), 0.3), 'its shop end');
  assert.ok(w.carShop.some(p => near(p, P(BEND.u, BEND.v))), 'from the car park to the shop along the path, round its bend');
  assert.equal(w.shopBay.length, sc.bays.length); assert.equal(w.bayCar.length, sc.bays.length);
  const legs = pathLegs(), onPath = (p: { x: number; y: number }) => legs.some(l => { const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, t = Math.max(0, Math.min(1, ((p.x - l.a.x) * dx + (p.y - l.a.y) * dy) / (dx * dx + dy * dy))); return Math.hypot(l.a.x + dx * t - p.x, l.a.y + dy * t - p.y) < 1e-6; });
  let behind = 0;
  for (const [i, b] of sc.bays.entries()) {
    const end = w.shopBay[i]!.at(-1)!; assert.ok(onPath(end), `bay ${i}: the walk ends on the path`);
    if (Math.hypot(end.x - b.back.x, end.y - b.back.y) <= 3 + 1e-6) behind++; // (else where the path comes nearest the tee: the walkers cross from there)
    assert.ok(near(w.bayCar[i]![0]!, end) && near(w.bayCar[i]!.at(-1)!, w.car), `bay ${i}: back to the car park`);
  }
  assert.ok(behind >= 2, `the bays the path runs behind leave it there (${behind})`);
  // two legs that cross the same point join there (the tee spur off the middle of the path)
  const t = walkwayOf(sc, pathLegs([[50, 12], [34, 14]]).concat(pathLegs([[42, 13], [42, 16.5], [10, 16.5]])));
  assert.equal(t, null, 'legs that only cross (no shared point) are not joined');
});

test('the walkers: across the dirt without a path; along the laid walking path once there is one', () => {
  const run = (legs: { a: { x: number; y: number }; b: { x: number; y: number } }[] | null) => {
    const sc = rangeScene(PLOT, F, defaultRangeBiz()); sc.walk = legs ? walkwayOf(sc, legs) : null;
    const sim = new RangeSim(5, 10); sim.setScene(sc, looseBays(lotBays(), 'dirt'), entrance);
    const s = defaultRangeBiz(), dem = { tier: 1, exits: 2, residents: 1500 }, bend = P(BEND.u, BEND.v);
    let atBend = 0, walkers = 0;
    for (let t = 0; t < 25 * 6; t += 0.1) {
      sim.step(0.1, { hour: 9 + t / 25, day: 1 }, s, dem, 600);
      const v = sim.view(); for (let i = 0; i < v.nPeople; i++) { walkers++; if (near(v.people[i]!, bend, 0.35)) atBend++; }
    }
    return { atBend, walkers, golfers: sim.today.golfers };
  };
  const dirt = run(null), path = run(pathLegs());
  assert.ok(dirt.walkers > 0 && path.walkers > 0 && dirt.golfers > 0 && path.golfers > 0);
  assert.equal(dirt.atBend, 0, 'no golfer goes round the path\'s bend on the dirt');
  assert.ok(path.atBend > 0, 'the golfers walk the path round its bend');
});

test('the host: the lot\'s ground follows the upgrades; a guided start lays no walkway, an old save lays its own once; the walkway follows the paths', () => {
  const grounds: string[] = []; let laid = 0, legs = pathLegs(), ver = 1, money = 1e6;
  const mk = (biz: RangeBizSave): RangeHostCtx => ({
    biz: () => biz, plot: () => ({ rect: PLOT, facing: F }), carPark: () => ({ bays: lotBays(), entrance }), addPiece: () => null, removeProp: () => {}, setGround: () => {},
    layPaths: l => { laid += l.length; }, clearTrees: () => {}, money: () => money, spend: n => { money -= n; }, book: () => {}, demand: () => ({ tier: 1, exits: 2, residents: 0 }),
    dayLen: () => 600, simT: () => 0, clock: () => ({ hour: 12, day: 1 }), save: () => {}, toast: () => {}, emit: () => {}, grid: () => null, layTee: () => false,
    parkGround: g => { if (grounds.at(-1) !== g) grounds.push(g); }, pathLegs: () => legs, netVersion: () => ver,
  });
  const biz = defaultRangeBiz(), h = new RangeHost(mk(biz), 1); h.sync();
  assert.deepEqual(grounds, ['dirt']); assert.equal(laid, 0, 'no walkway laid at a guided start'); assert.equal(biz.paths, undefined);
  assert.ok(h.hasWalkway(), 'the player\'s path joins them');
  legs = []; h.sync(); assert.ok(h.hasWalkway(), 'read again only when the network changes'); ver++; h.sync(); assert.ok(!h.hasWalkway(), 'the path bulldozed: the dirt again');
  assert.ok(h.buy('gravel')); h.sync(); assert.ok(h.buy('pave')); h.sync();
  assert.deepEqual(grounds, ['dirt', 'gravel', 'paved']);
  // an old save (no guided flag, its walkway never laid): it owns the paved lot and the greens, and lays the walkway once
  const old = normalizeRangeBiz({ v: 1, owned: ['bays8'], price: 6, season: {}, total: {}, desert: true });
  assert.equal(old.paths, false); grounds.length = 0;
  const h2 = new RangeHost(mk(old), 2); h2.sync(); assert.equal(laid, 3, 'its three legs'); assert.equal(old.paths, true); h2.sync(true); assert.equal(laid, 3, 'once');
  assert.deepEqual(grounds, ['paved']);
});

test('old saves keep their car park, walkway and greens; a second load keeps them as they are', () => {
  const old = normalizeRangeBiz({ v: 1, owned: ['bays8', 'targets'], price: 7, season: {}, total: {}, paths: true, tee: true, desert: true });
  assert.deepEqual(old.owned, [...LEGACY_UPGRADES, 'bays8', 'targets']); assert.equal(old.guided, true); assert.equal(old.paths, true);
  const st = rangeStats(old); assert.equal(st.targets, 5); assert.equal(st.lot, 'paved');
  const sc = rangeScene(PLOT, F, old);
  assert.equal(sc.targets.length, 5); assert.equal(sc.pieces.filter(p => p.key.startsWith('lot-lamp')).length, 4);
  assert.deepEqual(normalizeRangeBiz(JSON.parse(JSON.stringify(old))), old, 'loaded again, it stays as it is');
  // a new range round-trips guided, with no walkway to lay
  const d = defaultRangeBiz(); assert.deepEqual(normalizeRangeBiz(JSON.parse(JSON.stringify(d))), d); assert.equal(d.paths, undefined);
  // one that had its targets but somehow no greens still keeps the targets (the greens come first in its owned list)
  assert.ok(normalizeRangeBiz({ v: 1, owned: ['targets'] }).owned.includes('targets'));
});

/** a land host: the start's land 300 x 450 at (180, 150) and its practice area for sale (its rect, the plot's frame u 75..111, v 2..36) */
function land(forSale: Rect | null): LandHost {
  return {
    map: 2048, parcels: () => [[180, 150, 300, 450] as Rect], classOf: () => ({ landClass: 'open', houses: 0, buildings: 0 }), onRoad: () => false, pop: () => 1000,
    version: () => 'v', special: () => (forSale ? [{ rect: forSale, name: PRACTICE_LOT_NAME }] : []),
  };
}
const PB = practiceArea(PLOT, F).box, LOTR: Rect = [Math.round(PB[0]), Math.round(PB[1]), Math.round(PB[2] - PB[0]), Math.round(PB[3] - PB[1])];

test('the practice area for sale: a named parcel in Land for sale, priced like a block of its land, its card says what it is for', () => {
  const offers = landOffers(land(LOTR)), o = offers[0]!;
  assert.equal(o.name, PRACTICE_LOT_NAME); assert.deepEqual(o.rect, LOTR); assert.equal(o.why, null);
  assert.equal(o.price, adjacentBlockPrice({ rect: LOTR, landClass: 'open', houses: 0, buildings: 0, townPop: 1000 }));
  assert.ok(o.price > 3000 && o.price < 12000, `about the guided start's other first builds: $${o.price}`);
  assert.equal(offers.filter(q => q.name).length, 1);
  assert.match(offerFacts(o, [[180, 150, 300, 450]]).adds, /Facilities › Practice/);
  assert.ok(!landOffers(land(null)).some(q => q.name), 'bought: no longer offered');
  // a click inside it opens its card; Buy buys exactly it at its price
  const sale = new LandSale(land(LOTR)), c = sale.click(LOTR[0] + 5, LOTR[1] + 5);
  assert.equal(c?.name, PRACTICE_LOT_NAME);
  assert.deepEqual(sale.buy(1e6), { ok: true, rect: LOTR, price: o.price });
  assert.equal((sale.buy(10) as { why: string }).why.startsWith('Not enough money'), true);
});

test('Facilities › Practice refuses the practice area while it is for sale, with the reason, and builds on it once bought', () => {
  const g = makeGrid(190, 190, 300, 420), q = P(86, 19);
  const plan = practicePlan({ kind: 'putting', x: q.x, y: q.y, m2: PRACTICE_SIZE.putting.def, turn: 0, shape: 0, seed: 1 }), cells = planCells(g, plan);
  const r = planWhy(g, plan, cells, { box: PB, owned: () => false, forSale: true });
  assert.deepEqual(r, { why: PRACTICE_WHY.forSale, kind: 'land' }); assert.match(r.why, /Land for sale/);
  assert.deepEqual(planWhy(g, plan, cells, { box: PB, owned: () => true, forSale: false }), { why: '', kind: '' }, 'bought: it builds');
  const out = P(60, 19), p2 = practicePlan({ kind: 'putting', x: out.x, y: out.y, m2: PRACTICE_SIZE.putting.def, turn: 0, shape: 0, seed: 1 });
  assert.equal(planWhy(g, p2, planCells(g, p2), { box: PB, forSale: true }).why, PRACTICE_WHY.outside, 'off the area: outside first');
});

test('the save: a guided start\'s practice area for sale round-trips; an old save has none (its practice area stays its land); junk is dropped', () => {
  const base = { v: 1, tier: 1, rep: 0, town: { x: 0, y: 0 }, course: [0, 0, 10, 10], parcel: [0, 0, 10, 10], dir: 2, tees: [], pins: [], aims: [], clubhouse: { x: 0, y: 0 } } as unknown as GolfSave;
  const g = normalizeGolfSave(JSON.parse(JSON.stringify({ ...base, start: 'range', range: defaultRangeBiz(), practiceLot: LOTR })))!;
  assert.deepEqual(g.practiceLot, LOTR);
  assert.equal(normalizeGolfSave({ ...base, start: 'range' })!.practiceLot, undefined, 'an old save owns its practice area');
  assert.equal(normalizeGolfSave({ ...base, start: 'range', practiceLot: [1, 2, 'x', 4] as unknown as Rect })!.practiceLot, undefined);
  assert.equal(normalizeGolfSave({ ...base, start: 'range', practiceLot: [1, 2, 0, 4] })!.practiceLot, undefined);
  assert.equal(normalizeGolfSave({ ...base, practiceLot: LOTR })!.practiceLot, undefined, 'not a range start: none');
});
