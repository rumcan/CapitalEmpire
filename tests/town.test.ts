// Headless town tests: npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg, type Pt } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LotMap, type Lot } from '../src/game/lots/lots';
import { GROWTH_OPTIONS, LU, LV, Town, zoneGrowth, type LotState, type TownCtx, type TownEvent } from '../src/game/lots/town';
import { zoneOf } from '../src/game/sim/routing';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const HOUR = 60, DAY = 1440;
/** a 10x10 grid of streets, 40 tiles apart, from O; the entry at the corner */
const O = 40, STEP = 40, N = 10, at = (k: number) => O + k * STEP, last = at(N - 1);
const ENTRY: Pt = { x: O, y: O };
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
type Logged = TownEvent & { t: number };

/** the lots of the grid (a LotMap over the network) */
function gridLots(): { lm: LotMap; lots: Lot[] } {
  const e = new NetEditor(new RoadNetwork());
  for (let k = 0; k < N; k++) {
    e.addLegs([leg(O, at(k), last, at(k))], CLASS.street, 0);
    e.addLegs([leg(at(k), O, at(k), last)], CLASS.street, 0);
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

/** run a town over `days` game days, one tick per game hour; `before(h)` runs before the tick of hour h (scenario changes) */
function run(lm: LotMap, lots: Lot[], seed: number, days: number, o: { option?: string; before?: (h: number, town: Town) => void } = {}) {
  const town = new Town(seed);
  if (o.option) town.option = GROWTH_OPTIONS.find(g => g.id === o.option)!;
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
  const { key, use, level, decline, pop, jobs } = s;
  const pop0 = town.pop, jobs0 = town.jobs;
  const ev = town.onLots([], [key]);
  assert.deepEqual(ev, [{ key, kind: 'gone', use, level, decline }]);
  assert.equal(town.pop, pop0 - pop);
  assert.equal(town.jobs, jobs0 - jobs);
  assert.ok(!town.states.has(key));
});
