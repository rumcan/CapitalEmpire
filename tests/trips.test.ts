// The trips (src/game/sim/trips.ts): the demand curve, the driveways, the lot trips and the access score. npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, dot, norm, perp, sub, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LaneGraph, laneAt } from '../src/game/sim/lanes';
import { DAY, demandAt, driveway } from '../src/game/sim/trips';
import { DT, Sim } from '../src/game/sim/sim';
import { zoneOf } from '../src/game/sim/routing';
import { LotMap, type Lot } from '../src/game/lots/lots';
import { LU, LV, Town, builtLots, type LotTuple } from '../src/game/lots/town';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });

test('demand curve: 0.35 at 3 h, 1.0 at 8 h and 17 h, 0.7 at 12 h, 0.5 at 22 h (within 0.05), and within [0.35, 1] all day', () => {
  const at = (h: number) => demandAt(h * 60);
  for (const [h, v] of [[3, 0.35], [8, 1], [12, 0.7], [17, 1], [22, 0.5]] as [number, number][]) {
    assert.ok(Math.abs(at(h) - v) <= 0.05, `${h} h: ${at(h).toFixed(3)} vs ${v}`);
  }
  for (let t = 0; t < DAY; t += 1) {
    const d = demandAt(t);
    assert.ok(d >= 0.35 - 1e-9 && d <= 1 + 1e-9 && Number.isFinite(d), `t ${t}: ${d}`);
  }
  assert.equal(demandAt(DAY), demandAt(0), 'the curve repeats every day');
});

test('driveway: a lot on each side of a two-way street joins the lane whose traffic has it on the right', () => {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(40, 100, 240, 100)], CLASS.street, 0); e.commit();
  const g = new LaneGraph(); g.update(e.net);
  const lots = new LotMap().update(e.net, null).added;
  for (const side of [1, -1]) {
    const lot = lots.find(l => l.side === side)!;
    const d = driveway(lot, g)!;
    const ln = g.lanes[d.lane]!, h = norm(sub({ x: ln.pts[2]!, y: ln.pts[3]! }, { x: ln.pts[0]!, y: ln.pts[1]! }));
    assert.ok(dot(perp(h), lot.n) > 0, 'the lane sits on the lot side of its heading, so the lot is on its right');
    assert.ok(h.x * lot.n.y > 0, 'the south side (n = +y) is driven east, the north side west');
    assert.equal(ln.idx, g.dsegs[ln.dseg]!.lanes.length - 1, 'the outermost lane');
    assert.ok(d.s >= 3 && d.s <= ln.len - 3, `s ${d.s} on a lane of ${ln.len} m`);
    const p = { x: 0, y: 0, hx: 0, hy: 0 }; laneAt(ln, d.s, p);
    assert.ok(Math.hypot(p.x - lot.front.x, p.y - lot.front.y) < 2.5, 'the driveway meets the frontage');
  }
});

/** a 6 x 6 grid of streets 40 tiles apart, its lots, and a town over them */
const O = 40, STEP = 40, N6 = 6, at6 = (k: number) => O + k * STEP, last6 = at6(N6 - 1);
function gridCity() {
  const e = new NetEditor(new RoadNetwork());
  for (let k = 0; k < N6; k++) { e.addLegs([leg(O, at6(k), last6, at6(k))], CLASS.street, 0); e.addLegs([leg(at6(k), O, at6(k), last6)], CLASS.street, 0); }
  e.commit(); const g = new LaneGraph(); g.update(e.net);
  const lm = new LotMap(); const lots = lm.update(e.net, null).added;
  const town = new Town(9); town.onLots(lots, []);
  return { g, lm, lots, town };
}
/** the built lots as states: 60 RES spread over the grid, then 15 COM and IND; returns the RES lots */
function populate(town: Town, lots: Lot[]): Lot[] {
  const every = Math.floor(lots.length / 75), pick = lots.filter((_, i) => i % every === 0).slice(0, 75);
  const seed = (l: Lot) => town.states.get(l.key)!.seed;
  const tuples: LotTuple[] = [
    ...pick.slice(0, 60).map(l => [l.key, LU.RES, LV.BUILT, 0, seed(l), 0] as LotTuple),
    ...pick.slice(60).map((l, i) => [l.key, i % 2 ? LU.IND : LU.COM, LV.BUILT, 0, seed(l), 0] as LotTuple),
  ];
  town.restore(tuples, 0);
  return pick.slice(0, 60);
}
/** a lots-mode sim over the town, with its spawns logged: from and to are the uses of the origin and destination lots (-1 unknown) */
function lotSim(g: LaneGraph, lm: LotMap, town: Town) {
  const sim = new Sim(g, 4000, 11); sim.mode = 'lots';
  const built = builtLots(town, lm), useAt = new Map<string, number>();
  for (const b of built) {
    const d = driveway(b.lot, g)!;
    useAt.set(`L${d.lane}|${d.s}`, b.use); useAt.set(`D${g.lanes[d.lane]!.dseg}|${d.s}`, b.use);
  }
  sim.setBuilt(built);
  const trips: { t: number; from: number; to: number }[] = [];
  const spawnAt = sim.spawnAt.bind(sim);
  sim.spawnAt = (lane, s, dest, destS) => {
    const r = spawnAt(lane, s, dest, destS);
    if (r >= 0) trips.push({ t: sim.t, from: useAt.get(`L${lane}|${s}`) ?? -1, to: useAt.get(`D${dest}|${destS}`) ?? -1 });
    return r;
  };
  return { sim, trips, built };
}
/** the sim run for days game days */
function runDays(sim: Sim, days: number) { const steps = Math.round(days * DAY / DT); for (let k = 0; k < steps; k++) sim.step(); }
const isJob = (u: number) => u === LU.COM || u === LU.IND || u === LU.GOV || u === LU.TOUR;
const hourOf = (t: number) => Math.floor(t / 60) % 24;

test('lot trips: over 2 game days morning trips go home to jobs, evening trips come home, most trips arrive, free flow reads about 1', () => {
  const { g, lm, lots, town } = gridCity();
  populate(town, lots);
  const { sim, trips } = lotSim(g, lm, town);
  runDays(sim, 2);
  assert.ok(trips.length > 100, `${trips.length} trips`);
  const morning = trips.filter(x => hourOf(x.t) >= 6 && hourOf(x.t) <= 11), evening = trips.filter(x => hourOf(x.t) >= 15 && hourOf(x.t) <= 21);
  const toJobs = morning.filter(x => x.from === LU.RES && isJob(x.to)).length / morning.length;
  const fromJobs = evening.filter(x => isJob(x.from) && x.to === LU.RES).length / evening.length;
  assert.ok(toJobs > 0.8, `morning trips RES to jobs: ${(100 * toJobs).toFixed(0)}%`);
  assert.ok(fromJobs > 0.8, `evening trips jobs to RES: ${(100 * fromJobs).toFixed(0)}%`);
  assert.ok(sim.stats.arrived / trips.length > 0.8, `arrived ${sim.stats.arrived} of ${trips.length}`);
  const zones = new Set(builtLots(town, lm).map(b => zoneOf(b.lot.c.x, b.lot.c.y)));
  for (const z of zones) assert.ok(sim.access[z]! >= 0.9 && sim.access[z]! <= 1.15, `free-flow access in zone ${z}: ${sim.access[z]}`);
});

test('access calibration: 50 cars on a 10x10 street grid read free flow (< 1.2), 600 cars read congested (> 1.3) in every zone with trips', () => {
  const run = (cars: number) => {
    const e = new NetEditor(new RoadNetwork());
    for (let k = 0; k <= 10; k++) { e.addLegs([leg(100, 100 + k * 40, 500, 100 + k * 40)], CLASS.street, 0); e.addLegs([leg(100 + k * 40, 100, 100 + k * 40, 500)], CLASS.street, 0); }
    e.commit(true); const g = new LaneGraph(); g.update(e.net);
    const sim = new Sim(g, cars, 3); sim.setTarget(cars); runDays(sim, 0.5);
    const zs = [...new Set([zoneOf(150, 150), zoneOf(300, 300), zoneOf(450, 450)])];
    return zs.map(z => sim.access[z]!);
  };
  const free = run(50), jam = run(600);
  console.log(`access calibration: 50 cars ${free.map(a => a.toFixed(2)).join(' ')}; 600 cars ${jam.map(a => a.toFixed(2)).join(' ')}`);
  for (const a of free) assert.ok(a < 1.2, `free flow reads ${a.toFixed(2)}`);
  for (const a of jam) assert.ok(a > 1.3, `congestion reads ${a.toFixed(2)}`);
});
