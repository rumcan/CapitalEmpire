// The surge (Phase 5 step 4): the plan of the crowd (every car sent, the town with no joined car park stranded, departures in the first
// DEPART_END of the surge with a bell at its middle), a sim run of 30 party cars into a car park that they all reach before kick-off with
// the counts adding up, and the everyday lot trips that stay on joined roads. npm test (bundled by esbuild, run by node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { City } from '../src/game/city';
import { MAP } from '../src/game/iso';
import { LaneGraph } from '../src/game/sim/lanes';
import { DT, Sim } from '../src/game/sim/sim';
import { driveway, type Built } from '../src/game/sim/trips';
import { LotMap, type Lot } from '../src/game/lots/lots';
import { LU } from '../src/game/lots/town';
import { reachableSegs, seededRnd } from '../src/game/lots/roads';
import { SURGE_S, SURGE_SEED, DEPART_END } from '../src/game/event/config';
import { Surge, type SurgeHome, type SurgePark } from '../src/game/event/surge';
import type { CarParkDef } from '../src/game/event/carpark';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });

test('plan: every car is sent; a town with no joined car park is all stranded; the departures fill [t0, t0 + SURGE_S * DEPART_END] with a mean near the middle', () => {
  // the homes are not used by the plan itself (only their town, population and component), so stand-ins will do
  const home = (key: string, town: number, pop: number, comp: number): SurgeHome => ({ lot: { key } as unknown as Lot, town, pop, comp });
  const homes: SurgeHome[][] = [[home('a', 0, 3, 0), home('b', 0, 1, 0)], [home('c', 1, 2, 0)], [home('d', 2, 2, 1)]];
  // one park joined to the towns 0 and 1 (component 0), one on another component (1): the third town has no road to any park
  const parks: SurgePark[] = [{ comp: 0, bays: 40, sinks: [0] }, { comp: 2, bays: 10, sinks: [1] }];
  const s = new Surge();
  s.plan([300, 200, 100], homes, parks, seededRnd(SURGE_SEED), 1000);
  const v = s.view();
  assert.deepEqual(v.sent, [300, 200, 100], 'sent = crowd');
  assert.deepEqual(v.stranded, [0, 0, 100], 'the third town is stranded at once');
  assert.deepEqual(v.parked, [0, 0, 0], 'nothing parked yet');
  const ts = s.times();
  assert.equal(ts.length, 500, 'every car of the two joined towns is scheduled');
  for (const t of ts) assert.ok(t >= 1000 && t <= 1000 + SURGE_S * DEPART_END, `departure at ${t}`);
  assert.deepEqual(ts, [...ts].sort((a, b) => a - b), 'in time order');
  const mean = ts.reduce((a, b) => a + b, 0) / ts.length - 1000;
  assert.ok(Math.abs(mean - SURGE_S * DEPART_END / 2) <= 40, `mean departure ${mean.toFixed(1)} s after t0`);
});

/** a City with two streets: the car park's street (y = 300, x 200 to 800) and a second street (y = 700, x 200 to 400) that no road joins to it,
 *  and the car park (30 x 12 tiles, north of the first street: 44 bays, one entrance) */
function surgeCity(): { city: City; PARK: CarParkDef } {
  const city = new City(1);
  city.terrain(new Uint8Array(MAP * MAP), { x: 200, y: 300 }, 7);
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(200, 300, 800, 300)], CLASS.street, 0);
  e.addLegs([leg(200, 700, 400, 700)], CLASS.street, 0);
  city.netOps(e.commit(true));
  const PARK: CarParkDef = { id: 2, x: 400, y: 285, w: 30, h: 12 };
  city.setParks([PARK]);
  return { city, PARK };
}

test('surge: 30 cars from two towns joined to the car park all park before kick-off; the counts add up; a town with no road to the park is stranded', () => {
  const { city } = surgeCity();
  assert.equal(city.parks.length, 1, 'the car park is built');
  const sim = city.sim, g = city.g, park = city.parks[0]!;
  const joined = reachableSegs(city.net, { x: 200, y: 300 });
  const comp = (l: Lot) => (joined.has(l.seg) ? 0 : 1);
  // the homes whose driveway can reach the entrance: a driveway on the entrance's own dseg past it has no way round on this dead-end street
  // (the surge counts those as stranded, as LotTrips drops them), so the run takes the others
  const sinkDseg = sim.sinks[0]!.dseg, sinkS = sim.sinks[0]!.s;
  const reaches = (l: Lot) => { const d = driveway(l, g); return !!d && (g.lanes[d.lane]!.dseg !== sinkDseg || d.s < sinkS); };
  const homes: SurgeHome[][] = [[], [], []];
  for (const l of city.lots.lots.values()) {
    const k = l.c.y > 500 ? 2 : l.c.x < 500 ? 0 : 1;
    if (k === 2 || reaches(l)) homes[k]!.push({ lot: l, town: k, pop: 1, comp: comp(l) });
  }
  assert.ok(homes[0]!.length && homes[1]!.length && homes[2]!.length, 'lots on each street');
  const parks: SurgePark[] = [{ comp: comp({ seg: park.seg } as Lot), bays: park.bays.length, sinks: sim.sinks.map((_, j) => j) }];
  const s = new Surge();
  const crowd = [15, 15, 10];
  s.plan(crowd, homes, parks, seededRnd(SURGE_SEED), sim.t);
  const drain = () => { for (let k = 0; k < sim.partyOut.length; k += 2) s.event(sim.partyOut[k]!, sim.partyOut[k + 1]!); sim.partyOut.length = 0; };
  // the surge as City.step runs it: the sim steps, then the surge spawns and the exits are counted
  const kick = sim.t + SURGE_S;
  while (sim.t < kick - DT / 2) { sim.step(); s.step(sim, g); drain(); }
  const atKick = s.result();
  assert.equal(atKick[0]!.late + atKick[1]!.late, 0, 'no car of the joined towns is late at kick-off');
  assert.equal(atKick[0]!.parked + atKick[1]!.parked, 30, '30 cars parked before kick-off');
  assert.equal(atKick[2]!.stranded, 10, 'the third town is stranded');
  for (let n = 0; n < 6000 && sim.active > 0; n++) { sim.step(); s.step(sim, g); drain(); }
  const v = s.view(), r = s.result();
  assert.equal(sim.active, 0, 'every car has gone');
  for (let k = 0; k < 3; k++) {
    const sum = r[k]!.parked + r[k]!.turned + r[k]!.lost + v.onRoad[k]! + r[k]!.stranded;
    assert.equal(sum, crowd[k], `town ${k}: parked + turned away + lost + on the road + stranded = sent`);
    assert.equal(v.onRoad[k], 0, `town ${k}: none on the road`);
  }
  assert.equal(r[0]!.lost + r[1]!.lost, 0, 'no car lost');
  console.log(`surge: parked ${r.map(t => t.parked).join(' / ')}, turned ${r.map(t => t.turned).join(' / ')}, stranded ${r.map(t => t.stranded).join(' / ')} of ${crowd.join(' / ')}`);
});

/** a city over two groups of streets that no road joins (A: y = 100 and 160 with a link at x = 40; B: y = 400 and 460), with lots on all of them */
function twoGroups() {
  const e = new NetEditor(new RoadNetwork());
  for (const y of [100, 160]) e.addLegs([leg(40, y, 240, y)], CLASS.street, 0);
  e.addLegs([leg(40, 100, 40, 160)], CLASS.street, 0);
  for (const y of [400, 460]) e.addLegs([leg(40, y, 240, y)], CLASS.street, 0);
  e.addLegs([leg(40, 400, 40, 460)], CLASS.street, 0);
  e.commit();
  const g = new LaneGraph(); g.update(e.net);
  const lots = new LotMap().update(e.net, null).added;
  const joined = reachableSegs(e.net, { x: 40, y: 100 });
  const built: Built[] = lots.map((l, i) => (i % 2 ? { lot: l, use: LU.COM, pop: 0, jobs: 8 } : { lot: l, use: LU.RES, pop: 8, jobs: 0 }));
  return { g, joined, built };
}

test('lot trips: with two groups of lots on roads that are not joined, no trip is spawned from one group to the other (with the check off, some are)', () => {
  const { g, joined, built } = twoGroups();
  const run = (check: boolean) => {
    const sim = new Sim(g, 4000, 11); sim.mode = 'lots';
    if (check) sim.lotTrips.joined = (a, b) => joined.has(a.seg) === joined.has(b.seg);
    sim.setBuilt(built);
    let trips = 0, cross = 0;
    const spawnAt = sim.spawnAt.bind(sim);
    sim.spawnAt = (lane, s, dest, destS, tag, sink, party) => {
      const r = spawnAt(lane, s, dest, destS, tag, sink, party);
      if (r >= 0) { trips++; if (joined.has(g.dsegs[g.lanes[lane]!.dseg]!.seg) !== joined.has(g.dsegs[dest]!.seg)) cross++; }
      return r;
    };
    for (let k = 0; k < Math.round(720 / DT); k++) sim.step();
    return { trips, cross };
  };
  const on = run(true), off = run(false);
  assert.ok(on.trips > 20, `${on.trips} trips with the check`);
  assert.equal(on.cross, 0, 'no trip between the groups');
  assert.ok(off.cross > 0, `${off.cross} trips between the groups without the check (the test has teeth)`);
});

test('City round, end to end (no homes built, so every car is stranded): the surge is in the view, the result is in at kick-off, and the close drops it', () => {
  const O = 40, N = 3, at = (k: number) => O + k * 40, last = at(N - 1);
  const e = new NetEditor(new RoadNetwork());
  for (let k = 0; k < N; k++) { e.addLegs([leg(O, at(k), last, at(k))], CLASS.street, 0); e.addLegs([leg(at(k), O, at(k), last)], CLASS.street, 0); }
  const city = new City(7);
  city.terrain(new Uint8Array(MAP * MAP), { x: O, y: O }, 7, [{ x: 300, y: 300 }, { x: 1000, y: 400 }, { x: 600, y: 1000 }]);
  city.netOps(e.commit(true));
  assert.equal(city.startRound(), true);
  assert.equal(city.startNow(), true, 'the build ends now: the surge begins');
  assert.ok(city.surge, 'the surge is planned');
  const crowd = city.round.crowd.slice();
  assert.deepEqual(city.roundView().surge?.stranded, crowd, 'no home is built: every town\'s crowd is stranded');
  for (let k = 0; k < 100 && city.round.stage === 'surge'; k++) city.step(100);
  assert.equal(city.round.stage, 'eval', 'kick-off');
  const L = city.round.last!;
  assert.equal(L.sent, crowd.reduce((a, b) => a + b, 0));
  assert.equal(L.arrived, 0);
  assert.equal(L.rate, 0);
  assert.deepEqual(L.byTown.map(t => t.stranded), crowd, 'the result has each town\'s stranded crowd');
  assert.deepEqual(L.byTown.map(t => t.late), crowd.map(() => 0), 'nothing late: nothing was sent');
  assert.deepEqual(city.roundView().surge?.stranded, crowd, 'the eval view carries the counts');
  assert.equal(city.pickCard(city.round.draft![0]!), true, 'a card of the draft is taken first (the close needs it)');
  assert.equal(city.closeRound(), true);
  assert.equal(city.surge, null, 'the close drops the surge');
  assert.equal(city.roundView().surge, null);
});
