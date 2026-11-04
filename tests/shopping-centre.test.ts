// T298 (#883; the owner, 2026-11-02: "build small shopping center with multiple commercial stores circling a nice parking lot with lights and islands
// with plants etc."): the shopping centre. Its layout on every street heading and at a free angle (lots/centre.ts: the shops behind the car park facing the
// street, the wings facing across it, the bays, islands and lamps inside the car park, the entrance on the street, nothing overlapping), the town's side
// (lots/town.ts centreFor: a grown town makes one, its neighbours held as its parts, each named shop at most twice), and the composer (a centre drawn on
// its widened lot, its parts drawn as nothing).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LotMap, type Lot } from '../src/game/lots/lots';
import { LU, LV, Town, type LotState } from '../src/game/lots/town';
import { HEDGE, Lay, realTrees } from '../src/game/lots/autolot';
import { centreLot, type CentrePlan } from '../src/game/lots/centre';
import { CENTRE_W, bizNames, centreBiz, centreOf, findSpan, partOf, widen } from '../src/game/lots/centre-biz';
import { OVERLAP, share, type Box4, type LotGeom } from '../src/game/lots/compose-core';
import { frameOf, roadOf, toFrame } from '../src/game/lots/preset-frame';
import { faces, isVehicle, roadView, turned } from '../src/game/lots/preset-art';
import { SHOP_PALETTE, NAMED, BUSINESS } from '../src/game/lots/variety';
import { compose, setLotPresets } from '../src/game/lots/compose';
import { buildGroups } from '../src/game/lots/groups';
import { parsePresets } from '../src/game/lots/presets';
import { mulberry } from '../src/game/iso';
import PRESET_FIXTURE from './fixtures/lot-presets.json';

{ const f = parsePresets(PRESET_FIXTURE); setLotPresets(f.presets, f.meta); buildGroups(f.presets); }
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

/** a lot of w x d tiles whose street lies at angle t (radians; t = r pi / 4 is road r) */
function lotAt(t: number, w: number, d: number): LotGeom {
  return { o: { x: 300, y: 300 }, u: { x: Math.cos(t), y: -Math.sin(t) }, n: { x: -Math.sin(t), y: -Math.cos(t) }, w, d };
}
const inside = (b: Box4, o: Box4, m = 1e-6) => b[0] >= o[0] - m && b[1] >= o[1] - m && b[2] <= o[2] + m && b[3] <= o[3] + m;
const area = (b: Box4) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
const meet = (a: Box4, b: Box4) => area([Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]);
const STOP = 'expansion:wheel-stop', LAMP = 'world:streetlamp';

/** a centre laid on a lot (the Lay autolot fills; the palette from bakery on, the owner's trees and the hedge shrubs) */
function laid(lot: LotGeom, seed: number): { L: Lay; plan: CentrePlan | null } {
  const f = frameOf(lot), road = roadOf(lot.n), L = new Lay(f, lot.w, lot.d, 'com', 'built', road, 3, mulberry(seed));
  const plan = centreLot(L, SHOP_PALETTE, { trees: realTrees(), shrubs: HEDGE, ok: id => faces(id, road) }, seed);
  return { L, plan };
}

test('a centre on all eight street headings and at free angles: shops behind the car park facing the street, wings facing across it, the car park inside the lot, nothing overlapping', () => {
  const angles = [0, 1, 2, 3, 4, 5, 6, 7].map(r => r * Math.PI / 4).concat([0.3, 2.0, 4.4]);
  let made = 0;
  for (const t of angles) for (const [w, d] of [[36, 20], [30, 16], [26, 12.5]] as const) {
    const lot = lotAt(t, w, d), road = roadOf(lot.n), tag = `t${t.toFixed(2)} r${road} ${w}x${d}`;
    const { L, plan } = laid(lot, 7 + made);
    assert.ok(plan, `${tag}: no centre`); made++;
    const P = plan.park, lotBox: Box4 = [0, 0, w, d];
    // the shops: at least three (a screen-straight street has three shops with a screen-axis set), all inside the lot
    assert.ok(plan.shops.length + plan.wings.length >= 3, `${tag}: ${plan.shops.length} + ${plan.wings.length} shops`);
    for (const k of plan.shops) {
      const q = L.props[k]!, b = L.boxOf(q);
      assert.equal(q.view, 0, `${tag}: ${q.id} faces the street`);
      assert.ok(road % 2 ? roadView(q.id, road, 0) !== null : turned(q.id, 1).id !== q.id, `${tag}: ${q.id} has a picture facing this street`);
      assert.ok(inside(b, lotBox), `${tag}: ${q.id} inside the lot`);
      assert.ok(b[1] >= P[3] - 1e-6, `${tag}: ${q.id} stands behind the car park (${b[1].toFixed(2)} < ${P[3].toFixed(2)})`);
    }
    for (const k of plan.wings) {
      const q = L.props[k]!, b = L.boxOf(q), left = b[2] <= P[0] + 1e-6;
      assert.ok(left || b[0] >= P[2] - 1e-6, `${tag}: wing ${q.id} beside the car park`);
      assert.equal(q.view, left ? 1 : 3, `${tag}: wing ${q.id} faces across the car park`);
      assert.ok(inside(b, lotBox), `${tag}: wing ${q.id} inside the lot`);
    }
    // the entrance: from the street (y 0) into the car park, within its width
    assert.equal(plan.entrance[1], 0, `${tag}: the entrance opens on the street`);
    assert.ok(plan.entrance[0] >= P[0] - 1e-6 && plan.entrance[2] <= P[2] + 1e-6, `${tag}: the entrance leads into the car park`);
    // the car park: bays and islands inside it and the lot, no bay over another or an island
    assert.ok(inside(P, lotBox), `${tag}: the car park inside the lot`);
    assert.ok(plan.bays.length >= 8, `${tag}: ${plan.bays.length} bays`);
    assert.ok(plan.islands.length >= 2, `${tag}: ${plan.islands.length} islands`);
    for (const b of [...plan.bays, ...plan.islands]) assert.ok(inside(b, P), `${tag}: ${b.map(v => v.toFixed(2))} inside the car park`);
    plan.bays.forEach((a, i) => {
      for (const b of plan.bays.slice(i + 1)) assert.ok(meet(a, b) < 1e-6, `${tag}: two bays overlap`);
      for (const b of plan.islands) assert.ok(meet(a, b) < 1e-6, `${tag}: a bay overlaps an island`);
    });
    // the lamps: some on the car park's islands, the rest on the verge by the entrance
    const inPark = plan.lamps.filter(k => { const q = L.props[k]!; return q.x > P[0] && q.x < P[2] && q.y > P[1] && q.y < P[3]; });
    assert.ok(inPark.length >= 2, `${tag}: ${inPark.length} lamps in the car park`);
    for (const k of plan.lamps) { const q = L.props[k]!; assert.equal(q.id, LAMP); assert.ok(q.y >= -1.5 && q.y <= d && q.x >= 0 && q.x <= w, `${tag}: a lamp off the lot`); if (q.y > 0) assert.ok(plan.islands.some(b => inside([q.x, q.y, q.x, q.y], b)), `${tag}: a car park lamp on an island`); }
    // the cars: each in a bay; the wheel stops only on the map-axis streets
    assert.ok(plan.cars.length >= 1, `${tag}: no parked car`);
    for (const k of plan.cars) { const q = L.props[k]!; assert.ok(plan.bays.some(b => q.x > b[0] && q.x < b[2] && q.y > b[1] && q.y < b[3]), `${tag}: ${q.id} is in a bay`); }
    if (road % 2) assert.ok(!L.props.some(q => q.id === STOP), `${tag}: no wheel stop on a screen-straight street (no picture for that heading yet)`);
    // (on a map-axis street the stops; a street a few degrees off its axis lays a stop only where its picture fits the bay)
    else if (Math.abs(lot.n.x * lot.n.y) < 1e-9) assert.ok(L.props.filter(q => q.id === STOP).length >= plan.bays.length / 2, `${tag}: the bays' wheel stops`);
    // no two pieces (cars and their wheel stops aside: a stop lies under a car's nose) share more than the composer's OVERLAP
    const solid = L.props.map((q, k) => ({ q, k })).filter(({ q }) => !isVehicle(q.id) && q.id !== STOP);
    solid.forEach(({ q, k }, i) => { const a = L.boxOf(q); for (const { q: o } of solid.slice(i + 1)) { const s = share(a, L.boxOf(o)); assert.ok(s <= OVERLAP + 1e-9, `${tag}: ${q.id} (${k}) overlaps ${o.id} (${s.toFixed(2)})`); } });
    // one car park patch, its bay lines inside it
    const lots = L.patches.filter(p => p.kind === 'lot');
    assert.equal(lots.length, 1, `${tag}: one car park patch`);
    for (let i = 0; i + 1 < lots[0]!.lines!.length; i += 2) { const x = lots[0]!.lines![i]!, y = lots[0]!.lines![i + 1]!; assert.ok(x >= P[0] - 2e-3 && x <= P[2] + 2e-3 && y >= P[1] - 2e-3 && y <= P[3] + 2e-3, `${tag}: a bay line off the car park`); }
  }
  assert.equal(made, 33);
});

test('a U on a wide lot, an L on a middling one, a row on a narrow one; a lot too shallow is no centre', () => {
  assert.equal(laid(lotAt(0, 36, 20), 3).plan?.layout, 'U');
  assert.equal(laid(lotAt(0, 30, 16), 3).plan?.layout, 'L');
  assert.equal(laid(lotAt(0, 25, 16), 3).plan?.layout, 'row');
  assert.equal(laid(lotAt(0, 30, 9), 3).plan, null);
});

test('the span: lots side by side on one street line join to CENTRE_W; a shallow one, one facing the other way or one off the line does not', () => {
  const at = (key: string, x: number, w: number, d = 15, n = { x: 0, y: 1 }) => ({ key, o: { x, y: 100 }, u: { x: 1, y: 0 }, n, w, d });
  const a = at('a', 100, 12), b = at('b', 112, 13), c = at('c', 87.5, 12.5);
  const s = findSpan(a, [b, c]);
  assert.ok(s, 'a span');
  assert.deepEqual(s.parts, ['b'], 'the lot to the right first');
  assert.equal(s.span.l, 0); assert.equal(s.span.r, 13);
  assert.ok(12 + s.span.l + s.span.r >= CENTRE_W);
  assert.equal(findSpan(a, [at('b', 112, 13, 8)]), null, 'a shallow neighbour is no part');
  assert.equal(findSpan(a, [at('b', 112, 13, 15, { x: 0, y: -1 })]), null, 'a lot facing the other way is no part');
  assert.equal(findSpan(a, [{ ...b, o: { x: 112, y: 103 } }]), null, 'a lot off the street line is no part');
  // the business string round trip
  const biz = centreBiz({ l: 1.5, r: 12, d: 14, shops: ['town:bakery', 'world:video'] });
  assert.deepEqual(centreOf(biz), { l: 1.5, r: 12, d: 14, shops: ['town:bakery', 'world:video'] });
  assert.deepEqual(bizNames(biz), ['town:bakery', 'world:video']);
  assert.deepEqual(bizNames('^x'), []);
  assert.deepEqual(widen({ o: { x: 10, y: 0 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, w: 12, d: 15 }, { l: 2, r: 3, d: 14 }), { o: { x: 8, y: 0 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, w: 17, d: 14 });
});

// ---------- the town
const O = 40, STEP = 40, N = 10, at = (k: number) => O + k * STEP, last = at(N - 1);
/** a 10 x 10 street grid, its two middle lines avenues (the commercial district's class) */
function grid(): { lm: LotMap; lots: Lot[] } {
  const e = new NetEditor(new RoadNetwork());
  for (let k = 0; k < N; k++) {
    const c = k === 4 || k === 5 ? CLASS.avenue : CLASS.street;
    e.addLegs([{ a: { x: O, y: at(k) }, b: { x: last, y: at(k) } }], c, 0);
    e.addLegs([{ a: { x: at(k), y: O }, b: { x: at(k), y: last } }], c, 0);
  }
  e.commit();
  const lm = new LotMap();
  return { lm, lots: lm.update(e.net, null).added };
}
/** a grown town on the grid at tier 3, run until it has a centre (at most 10 game days); the centre's state */
function grown(seed: number) {
  const { lm, lots } = grid();
  const town = new Town(seed); town.onLots(lots, []); town.tier = 3;
  town.setCentres([{ x: (O + last) / 2, y: (O + last) / 2 }]);
  town.setGrown({ holes: 18, success: 1 });
  const ctx = { lots: lm, entry: { x: O, y: O }, reachable: () => true, water: () => 200 };
  const ev: { key: string; biz?: string }[] = [];
  let anchor: LotState | undefined;
  for (let h = 1; h <= 24 * 10 && !anchor; h++) { for (const e of town.tick(h * 60, ctx)) ev.push({ key: e.key, biz: e.biz }); anchor = [...town.states.values()].find(s => centreOf(s.biz)); }
  return { town, lots, lm, ctx, anchor, ev };
}
const counts = (town: Town) => { const m = new Map<string, number>(); for (const s of town.states.values()) if (s.level !== LV.EMPTY) for (const b of bizNames(s.biz)) m.set(b, (m.get(b) ?? 0) + 1); return m; };
const driver = (town: Town) => town as unknown as { set(s: LotState, use: number, level: number, decline: number, T: number): void; openness(l: Lot, ctx: unknown): number };

test('a grown town builds one shopping centre on a commercial lot and its empty neighbours, the parts held and drawn as nothing', () => {
  const { town, lots, ctx, anchor, ev } = grown(5);
  assert.ok(anchor, 'the grown town has a centre');
  assert.equal(anchor.use, LU.COM);
  const c = centreOf(anchor.biz)!, geo = lots.find(l => l.key === anchor.key)!;
  assert.ok(geo.w + c.l + c.r >= CENTRE_W, 'the centre is wider than its lot');
  assert.ok(c.shops.length >= 3 && new Set(c.shops).size === c.shops.length, `its shops differ: ${c.shops.join(', ')}`);
  const parts = [...town.states.values()].filter(s => partOf(s.biz) === anchor.key);
  assert.ok(parts.length >= 1, 'it covers its neighbours');
  for (const p of parts) {
    assert.equal(p.level, LV.EMPTY, 'a part stays empty');
    assert.ok(ev.some(e => e.key === p.key && e.biz === `^${anchor.key}`), 'the main thread hears of the part');
    assert.equal(driver(town).openness(lots.find(l => l.key === p.key)!, ctx), 0, 'the town grows nothing on a part');
    assert.equal(compose(lots.find(l => l.key === p.key)!, { use: LU.NONE, level: LV.EMPTY, decline: 0, seed: p.seed, biz: p.biz }).props.length, 0, 'a part draws nothing');
  }
  // only one centre to a town
  assert.equal([...town.states.values()].filter(s => centreOf(s.biz)).length, 1);
  // the centre drawn on its widened lot: its shops, everything inside the widened lot (the verge in front)
  const st = { use: LU.COM, level: LV.BUILT, decline: 0, seed: 50, tier: 3, biz: anchor.biz };
  const comp = compose(geo, st), wide = widen(geo, c), f = frameOf(wide);
  const shops = comp.props.filter(p => c.shops.some(s => p.id.includes(s.split(':')[1]!)));
  assert.ok(shops.length >= 3, `the centre shows its shops: ${comp.props.map(p => p.id).join(', ')}`);
  for (const p of comp.props) { const q = toFrame(f, p.x, p.y); assert.ok(q.x >= -1 && q.x <= wide.w + 1 && q.y >= -2.5 && q.y <= wide.d + 1, `${p.id} at (${q.x.toFixed(1)}, ${q.y.toFixed(1)}) inside the centre's lot`); }
});

test('each named shop of a centre counts against the cap: no business shows more than twice, the named ones neither', () => {
  const { town, lots, anchor } = grown(2);
  assert.ok(anchor);
  // forty more commercial lots on top of the town's own
  let n = 0;
  for (const l of lots) { const s = town.states.get(l.key)!; if (s.level !== LV.EMPTY || partOf(s.biz)) continue; driver(town).set(s, LU.COM, LV.BUILDING, 0, 0); if (++n >= 40) break; }
  const c = counts(town), max = Math.max(...c.values()), min = Math.min(...SHOP_PALETTE.map(id => c.get(id) ?? 0));
  assert.ok(max - min <= 1, `the businesses stay within one of each other (${[...c].join(' ')})`);
  for (const id of SHOP_PALETTE) if (NAMED.has(BUSINESS[id] ?? '')) assert.ok((c.get(id) ?? 0) <= Math.max(2, min + 1), `${id} shows ${c.get(id)} times`);
  // another town, lot by lot after its centre: a third copy of a business only once every business has two (the counts never more than one apart)
  const g = grown(4);
  assert.ok(g.anchor);
  let k = 0;
  for (const l of g.lots) {
    const s = g.town.states.get(l.key)!; if (s.level !== LV.EMPTY || partOf(s.biz)) continue;
    driver(g.town).set(s, LU.COM, LV.BUILDING, 0, 0);
    const cc = counts(g.town), lo = Math.min(...SHOP_PALETTE.map(id => cc.get(id) ?? 0)), hi = Math.max(...SHOP_PALETTE.map(id => cc.get(id) ?? 0));
    assert.ok(hi - lo <= 1, `after lot ${k}: ${[...cc].join(' ')}`);
    if (++k >= 30) break;
  }
});

test('a centre cleared lets its parts go; a restored centre takes them again', () => {
  const { town, lots, ctx, anchor } = grown(3);
  assert.ok(anchor);
  const parts = [...town.states.values()].filter(s => partOf(s.biz) === anchor.key).map(s => s.key);
  assert.ok(parts.length);
  // restore: the save holds the built lots only (the anchor with its business); the parts come back from its span
  const saved: [string, number, number, number, number, number, number?, string?][] = [...town.states.values()].filter(s => s.level !== LV.EMPTY).map(s => [s.key, s.use, s.level, s.decline, s.seed, s.since, s.tier ?? 3, s.biz] as [string, number, number, number, number, number, number?, string?]);
  const back = new Town(3); back.onLots(lots, []);
  const ev = back.restore(saved as never, 0);
  for (const k of parts) { assert.equal(back.states.get(k)!.biz, `^${anchor.key}`, 'a part taken again'); assert.ok(ev.some(e => e.key === k), 'and told to the main thread'); }
  // cleared (the bulldozer): the parts are free and composed again
  const e0 = town.clear(anchor.key);
  assert.ok(e0);
  for (const k of parts) assert.equal(town.states.get(k)!.biz, undefined, 'a part let go');
  const next = town.tick(town.t + 60, ctx);
  for (const k of parts) assert.ok(next.some(e => e.key === k), 'its clear event goes out with the next batch');
});
