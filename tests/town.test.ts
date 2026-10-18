// Headless town tests: npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg, type Pt } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LotMap, type Lot } from '../src/game/lots/lots';
import { GROWTH_OPTIONS, LU, LV, Town, zoneGrowth, type LotState, type LotTuple, type TownCtx, type TownEvent } from '../src/game/lots/town';
import { zoneOf } from '../src/game/sim/routing';
import { reachableFrom } from '../src/game/lots/roads';
import { townGrid, TOWN_BLOCKS } from '../src/game/lots/seedtowns';
import { TC } from '../src/game/terrain/types';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const HOUR = 60, DAY = 1440;
/** a 10x10 grid of streets, 40 tiles apart, from O; the entry at the corner */
const O = 40, STEP = 40, N = 10, at = (k: number) => O + k * STEP, last = at(N - 1);
const ENTRY: Pt = { x: O, y: O };
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
type Logged = TownEvent & { t: number };

/** the lots of the grid (a LotMap over the network; its streets of class cls) */
function gridLots(cls = CLASS.street): { lm: LotMap; lots: Lot[] } {
  const e = new NetEditor(new RoadNetwork());
  for (let k = 0; k < N; k++) {
    e.addLegs([leg(O, at(k), last, at(k))], cls, 0);
    e.addLegs([leg(at(k), O, at(k), last)], cls, 0);
  }
  e.commit();
  const lm = new LotMap(); const r = lm.update(e.net, null);
  return { lm, lots: r.added };
}
const distTo = (lm: LotMap, key: string) => { const c = lm.lots.get(key)!.c; return Math.hypot(c.x - ENTRY.x, c.y - ENTRY.y); };
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const ctxOf = (lm: LotMap): TownCtx => ({ lots: lm, entry: ENTRY, reachable: () => true, water: () => 200 });
/** the states that are finished (BUILT or UPGRADED) */
const finished = (town: Town): LotState[] => [...town.states.values()].filter(s => s.level >= LV.BUILT);
/** the states that are not EMPTY (building or finished) */
const occupied = (town: Town): LotState[] => [...town.states.values()].filter(s => s.level !== LV.EMPTY);

/** run a town over `days` game days, one tick per game hour; `before(h)` runs before the tick of hour h (scenario changes); centres: the town centres (with towns) */
function run(lm: LotMap, lots: Lot[], seed: number, days: number, o: { option?: string; centres?: Pt[]; before?: (h: number, town: Town) => void } = {}) {
  const town = new Town(seed);
  if (o.option) town.option = GROWTH_OPTIONS.find(g => g.id === o.option)!;
  if (o.centres) town.setCentres(o.centres);
  town.onLots(lots, []);
  const ctx = ctxOf(lm), log: Logged[] = [];
  for (let h = 1; h <= days * 24; h++) {
    o.before?.(h, town);
    for (const e of town.tick(h * HOUR, ctx)) log.push({ ...e, t: h * HOUR });
  }
  return { town, log };
}

test('zoneGrowth: 1 below 1.3, 0.5 at 1.55, 0 from 1.8 up', () => {
  const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
  near(zoneGrowth(1), 1); near(zoneGrowth(1.3), 1); near(zoneGrowth(1.55), 0.5);
  near(zoneGrowth(1.8), 0); near(zoneGrowth(3), 0);
});

test('10x10 street grid, 10 game days: built lots form a blob around the entry, growth ~10%/day after day 3, every use but TOUR appears, jobs/pop 0.3-0.9', () => {
  const { lm, lots } = gridLots();
  let day5 = 0, day7 = 0;
  const { town } = run(lm, lots, 1, 10, { before: (h, t) => {
    if (h === 5 * 24 + 1) day5 = mean(finished(t).map(s => distTo(lm, s.key)));
    if (h === 7 * 24 + 1) day7 = finished(t).length;
  } });
  const day10 = finished(town).length;
  const all = [...lm.lots.values()];
  const dAll = mean(all.map(l => Math.hypot(l.c.x - ENTRY.x, l.c.y - ENTRY.y)));
  const uses = new Map<number, number>();
  for (const s of occupied(town)) uses.set(s.use, (uses.get(s.use) ?? 0) + 1);
  const ratio = day10 / day7, occ = occupied(town), comShare = (uses.get(LU.COM) ?? 0) / occ.length;
  console.log(`[town] 10 days: lots ${all.length}, finished day 7 ${day7}, day 10 ${day10} (ratio ${ratio.toFixed(3)}), mean dist built at day 5 ${day5.toFixed(1)} vs all ${dAll.toFixed(1)} tiles (ratio ${(day5 / dAll).toFixed(3)})`);
  console.log(`[town] COM share of built+building ${comShare.toFixed(3)}`);
  console.log(`[town] uses (not EMPTY): RES ${uses.get(LU.RES) ?? 0}, COM ${uses.get(LU.COM) ?? 0}, IND ${uses.get(LU.IND) ?? 0}, TOUR ${uses.get(LU.TOUR) ?? 0}, GOV ${uses.get(LU.GOV) ?? 0}; pop ${town.pop}, jobs ${town.jobs}, jobs/pop ${(town.jobs / town.pop).toFixed(3)}`);
  assert.ok(day5 < 0.85 * dAll, `day 5: built lots ${day5} vs all ${dAll} tiles from the entry`);
  assert.ok(ratio >= 1.4 && ratio <= 2.0, `day 10 / day 7 = ${ratio}`);
  for (const u of [LU.RES, LU.COM, LU.IND, LU.GOV]) assert.ok((uses.get(u) ?? 0) > 0, `use ${u} appears`);
  assert.ok(comShare >= 0.1 && comShare <= 0.3, `COM share ${comShare}`);
  assert.equal(uses.get(LU.TOUR) ?? 0, 0, 'no TOUR without water');
  assert.ok(town.jobs / town.pop >= 0.3 && town.jobs / town.pop <= 0.9, `jobs/pop ${town.jobs / town.pop}`);
});

test('access 2.5 in the entry zone from day 4: that zone stops growing and declines and clears, other zones keep growing', () => {
  const { lm, lots } = gridLots();
  const Z0 = zoneOf(ENTRY.x, ENTRY.y);
  const zoneOfKey = (key: string) => { const c = lm.lots.get(key)!.c; return zoneOf(c.x, c.y); };
  const { log } = run(lm, lots, 1, 16, { before: (h, t) => { if (h === 4 * 24) t.access[Z0] = 2.5; } });
  const after = (e: Logged) => e.t >= 4 * DAY;
  const count = (f: (e: Logged) => boolean) => log.filter(f).length;
  // precondition: the zone has lots built before day 4 to decline (seed 3 builds none there by then)
  assert.ok(count(e => e.t < 4 * DAY && e.kind === 'build' && zoneOfKey(e.key) === Z0) > 0, 'the entry zone has lots before day 4');
  const buildsZ0 = count(e => after(e) && e.kind === 'build' && zoneOfKey(e.key) === Z0);
  const buildsElse = count(e => after(e) && e.kind === 'build' && zoneOfKey(e.key) !== Z0);
  const declinesZ0 = count(e => after(e) && e.kind === 'decline' && zoneOfKey(e.key) === Z0);
  const clearsZ0 = count(e => e.kind === 'clear' && zoneOfKey(e.key) === Z0);
  console.log(`[town] access 2.5 in zone ${Z0} from day 4 (16 days): builds there ${buildsZ0}, builds elsewhere ${buildsElse}, declines there ${declinesZ0}, clears there ${clearsZ0}`);
  assert.equal(buildsZ0, 0, 'no build in the bad zone after day 4');
  assert.ok(buildsElse > 0, 'other zones keep growing');
  assert.ok(declinesZ0 > 0, 'declines in the bad zone');
  assert.ok(clearsZ0 > 0, 'some derelict lots cleared');
});

test('determinism: the same seed and calls give the same events; another seed differs', () => {
  const { lm, lots } = gridLots();
  const a = run(lm, lots, 7, 4).log, b = run(lm, lots, 7, 4).log, c = run(lm, lots, 8, 4).log;
  assert.ok(a.length > 0);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('growth options: industry gives more IND lots than balanced on the same grid', () => {
  const { lm, lots } = gridLots();
  const ind = (opt: string) => occupied(run(lm, lots, 5, 8, { option: opt }).town).filter(s => s.use === LU.IND).length;
  const balanced = ind('balanced'), industry = ind('industry');
  console.log(`[town] IND lots after 8 days: balanced ${balanced}, industry ${industry}`);
  assert.ok(industry > balanced, `industry ${industry} vs balanced ${balanced}`);
});

test('onLots with removed keys emits gone and takes the lot out of pop and jobs', () => {
  const { lm, lots } = gridLots();
  const { town } = run(lm, lots, 9, 6);
  const s = finished(town).find(q => q.pop + q.jobs > 0)!;
  assert.ok(s, 'a finished lot with pop or jobs');
  const { key, use, level, decline, pop, jobs, seed, since } = s;
  const pop0 = town.pop, jobs0 = town.jobs;
  const ev = town.onLots([], [key]);
  assert.deepEqual(ev, [{ key, kind: 'gone', use, level, decline, seed, since }]);
  assert.equal(town.pop, pop0 - pop);
  assert.equal(town.jobs, jobs0 - jobs);
  assert.ok(!town.states.has(key));
});

test('restore: a saved town comes back with the same pop, jobs and built lots, and a complete event per restored lot', () => {
  const { lm, lots } = gridLots();
  const { town } = run(lm, lots, 4, 8);
  const saved: LotTuple[] = [...town.states.values()].filter(s => s.level !== LV.EMPTY).map(s => [s.key, s.use, s.level, s.decline, s.seed, s.since]);
  assert.ok(saved.length > 10, 'some lots built');
  const back = new Town(4);
  back.onLots(lots, []);
  const ev = back.restore(saved, town.t);
  assert.equal(back.pop, town.pop);
  assert.equal(back.jobs, town.jobs);
  assert.equal(back.built, town.built);
  assert.equal(back.t, town.t);
  assert.equal(ev.length, saved.length);
  assert.ok(ev.every(e => e.kind === 'complete'));
  for (const [key, use, level, decline, seed, since] of saved) {
    const s = back.states.get(key)!;
    assert.deepEqual([s.use, s.level, s.decline, s.seed, s.since], [use, level, decline, seed, since]);
  }
  // the keys that no longer exist are dropped
  const gone = new Town(4); gone.onLots(lots.slice(1), []);
  assert.equal(gone.restore([[lots[0].key, LU.RES, LV.BUILT, 0, 1, 0]], 0).length, 0);
});

/** the lots of the town grids of some centres (all GROUND): one LotMap over every grid, and its network */
function townLots(centres: Pt[]): { net: RoadNetwork; lm: LotMap; lots: Lot[] } {
  const e = new NetEditor(new RoadNetwork()); e.net.paintData = false;
  for (const c of centres) {
    const g = townGrid(c, TOWN_BLOCKS, () => TC.GROUND);
    e.addLegs(g.legs.filter((_, k) => g.cls[k] === 'street'), CLASS.street, 0);
    e.addLegs(g.legs.filter((_, k) => g.cls[k] === 'avenue'), CLASS.avenue, 0);
  }
  e.commit();
  const lm = new LotMap(); const r = lm.update(e.net, null);
  return { net: e.net, lm, lots: r.added };
}
/** a key string of the occupied states (sorted): the lot keys, uses and levels */
const stateKey = (t: Town) => JSON.stringify([...t.states.values()].filter(s => s.level !== LV.EMPTY).map(s => [s.key, s.use, s.level]).sort((p, q) => (p[0] as string) < (q[0] as string) ? -1 : (p[0] as string) > (q[0] as string) ? 1 : 0));

test('stamp: two towns 1000 tiles apart each reach 400 residents; lots belong to their nearest centre; the same calls give the same states', () => {
  const C: Pt[] = [{ x: 500, y: 600 }, { x: 1500, y: 600 }];
  const build = () => {
    const { lm, lots } = townLots(C);
    const town = new Town(3); town.setCentres(C); town.onLots(lots, []);
    const ev = town.stamp({ lots: lm, entry: C[0], reachable: () => true, water: () => 200 }, 400, 0);
    return { lm, town, ev };
  };
  const a = build(), b = build();
  const occ = [...a.town.states.values()].filter(s => s.level !== LV.EMPTY);
  const perTownLots = C.map((_, k) => occ.filter(s => a.town.townOf(s.key) === k).length);
  const pops = C.map((_, k) => a.town.popK[k]);
  console.log(`[town] stamp 2 towns x 400 residents: pop per town ${pops}, lots not EMPTY per town ${perTownLots}, lots ${a.lm.lots.size}, events ${a.ev.length}`);
  pops.forEach((p, k) => assert.ok(p >= 400, `town ${k} pop ${p}: its land ran out`));
  assert.equal(pops[0] + pops[1], a.town.pop, 'the town pops add up to the total');
  assert.equal(a.ev.length, occ.length, 'one complete event per lot placed');
  assert.ok(a.ev.every(e => e.kind === 'complete' && (e.level === LV.BUILT || e.level === LV.UPGRADED)), 'lots are BUILT or UPGRADED');
  assert.ok(a.ev.every(e => e.level === LV.BUILT || a.lm.lots.get(e.key)!.seg.cls.id !== 'gravel'), 'no UPGRADED gravel');
  for (const s of occ) {
    const c = a.lm.lots.get(s.key)!.c, d = C.map(p => Math.hypot(p.x - c.x, p.y - c.y));
    assert.equal(a.town.townOf(s.key), d.indexOf(Math.min(...d)), `lot ${s.key} in its nearest town`);
  }
  assert.equal(stateKey(a.town), stateKey(b.town), 'two identical runs give the same states');
});

test('no centres: no town totals, townOf is -1 and stamp places nothing; the per-town totals add up to the global ones, also after setCentres', () => {
  const { lm, lots } = gridLots();
  const { town } = run(lm, lots, 2, 6);
  assert.deepEqual([town.centres.length, town.popK.length, town.townOf(lots[0].key)], [0, 0, -1]);
  assert.deepEqual(town.stamp(ctxOf(lm), 400, 0), []);
  const sumsOk = (t: Town) => {
    const st = [...t.states.values()];
    return t.popK.reduce((x, y) => x + y, 0) === t.pop && t.builtK.reduce((x, y) => x + y, 0) === t.built && t.govK.reduce((x, y) => x + y, 0) === st.filter(s => s.use === LU.GOV).length;
  };
  const withC = new Town(2); withC.setCentres([ENTRY, { x: last, y: last }]); withC.onLots(lots, []);
  for (let h = 1; h <= 6 * 24; h++) withC.tick(h * HOUR, ctxOf(lm));
  assert.ok(sumsOk(withC), 'totals after growth');
  withC.setCentres([{ x: last, y: O }]);
  assert.ok(sumsOk(withC), 'totals after setCentres');
  assert.equal(withC.townOf(lots[0].key), 0);
});

test('reachableFrom: an anchor whose nearest node is within its reach gives its network; a farther one gives nothing', () => {
  const C: Pt[] = [{ x: 500, y: 600 }, { x: 1500, y: 600 }];
  const { net } = townLots(C);
  assert.equal(reachableFrom(net, [C[0], C[1]], [100, 100]).size, net.segs.size, 'both networks');
  const one = reachableFrom(net, [C[0]], [100]);
  assert.ok(one.size > 0 && one.size < net.segs.size, `one network: ${one.size} of ${net.segs.size} segs`);
  assert.equal(reachableFrom(net, [C[0]], [1]).size, 0, 'the anchor is too far from its node');
  assert.equal(reachableFrom(net, [], []).size, 0);
});

test('with town centres the town grows on gravel slowly (5 + 0.02 built lots a game day), and the paved roads fill fast (6 lots a game hour)', () => {
  const gravel = gridLots(CLASS.gravel), paved = gridLots(CLASS.street);
  const builds = (g: { lm: LotMap; lots: Lot[] }, centres?: Pt[]) => run(g.lm, g.lots, 5, 1, { centres }).log.filter(e => e.kind === 'build').length;
  const plain = builds(gravel), townGravel = builds(gravel, [ENTRY]), townPaved = builds(paved, [ENTRY]);
  console.log(`day 1 builds: no centres (gravel) ${plain}, centres (gravel) ${townGravel}, centres (paved) ${townPaved}`);
  assert.ok(townGravel > 0, 'the town still grows on gravel');
  assert.ok(townGravel * 2 < plain, `the gravel growth with centres is slower (${townGravel} vs ${plain} a day)`);
  assert.ok(townPaved > 6 * townGravel, `the paved roads fill faster (${townPaved} vs ${townGravel} on gravel)`);
  assert.ok(townPaved >= 100, `the paved roads grow about 6 lots an hour (${townPaved} a day)`);
});

test('a lot bought out: EMPTY with a clear event, held 2 game days (no growth on it, the other lots grow), and it regrows after; an EMPTY lot is not bought', () => {
  const { lm, lots } = gridLots();
  const town = new Town(5); town.onLots(lots, []);
  const ctx = ctxOf(lm), tick = (h: number) => town.tick(h * HOUR, ctx);
  for (let h = 1; h <= 3 * 24; h++) tick(h);
  const bought = finished(town)[0];
  assert.ok(bought, 'a finished lot to buy out');
  const key = bought.key, T0 = town.t, hold = T0 + 2 * DAY;
  const e = town.clear(key);
  assert.ok(e && e.kind === 'clear' && e.level === LV.EMPTY && e.use === LU.NONE, 'the clear event: EMPTY, no use');
  assert.equal(town.states.get(key)!.level, LV.EMPTY, 'the lot is EMPTY now');
  assert.equal(town.holdUntil.get(key), hold, 'held until 2 game days on');
  assert.equal(town.clear(key), null, 'an EMPTY lot cannot be bought out again');
  // the hold: the lot stays EMPTY hour by hour while the town grows on the other lots
  let grewOthers = false;
  for (let h = Math.floor(T0 / HOUR) + 1; h * HOUR < hold; h++) {
    for (const ev of tick(h)) if (ev.key !== key && ev.kind === 'build') grewOthers = true;
    assert.equal(town.states.get(key)!.level, LV.EMPTY, `held at ${h * HOUR} s`);
  }
  assert.ok(grewOthers, 'the town grows on its other lots meanwhile');
  // after the hold the lot can be built on again
  let regrownAt = -1;
  for (let h = hold / HOUR; h < hold / HOUR + 10 * 24 && regrownAt < 0; h++) { tick(h); if (town.states.get(key)!.level !== LV.EMPTY) regrownAt = town.t; }
  assert.ok(regrownAt >= hold, `regrown ${((regrownAt - T0) / DAY).toFixed(2)} game days after the purchase`);
});
