// The car parks' headless tests (Phase 5 step 3a): the frontage, entrance and bays of a park beside a straight street, parkValid's reasons,
// and a City's park fed 30 cars (20 bays, one entrance): 20 parked, 10 turned away, admissions ENTRY_S apart, cars off the road into the entry queue
// (no car stops on the road while the queue has room), and the queue's full hold (Phase 5 balance fix).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { City } from '../src/game/city';
import { MAP } from '../src/game/iso';
import { TC } from '../src/game/terrain/types';
import { buildPark, frontage, parkValid, type CarParkDef } from '../src/game/event/carpark';
import { ENTRY_Q, ENTRY_S } from '../src/game/event/config';
import type { ParkState, Sim, Sink } from '../src/game/sim/sim';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

/** the street's centre line: y = ROAD_Y, from x 200 to 800 (a dead end at each end) */
const ROAD_Y = 300;
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
/** the network of the straight street (committed) */
function road(): RoadNetwork {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(200, ROAD_Y, 800, ROAD_Y)], CLASS.street, 0);
  e.commit();
  return e.net;
}
/** a park north of the street: 15 x 12 tiles, its south edge 3 tiles from the centre line (one entrance, 20 bays) */
const PARK: CarParkDef = { id: 1, x: 400, y: 285, w: 15, h: 12 };

test('frontage: a park north of the street takes its south edge, one entrance on the centre line, its bays nearest the entrance first', () => {
  const net = road(), f = frontage(net, PARK);
  assert.ok(f, 'a frontage');
  assert.equal(f.side, 1, 'the south edge');
  assert.equal(f.entrances.length, 1, 'one entrance for 15 tiles of frontage');
  const e0 = f.entrances[0]!;
  assert.ok(Math.abs(e0.y - ROAD_Y) < 1e-9 && Math.abs(e0.x - 407.5) < 1e-9, `the entrance (${e0.x}, ${e0.y}) is the middle of the overlap, on the centre line`);
  const bp = buildPark(net, PARK);
  assert.ok(bp, 'a built park');
  assert.equal(bp.bays.length, 20, '20 bays: two rows of ten');
  const d = bp.bays.map(b => Math.hypot(b.x - e0.x, b.y - e0.y));
  assert.deepEqual(d, [...d].sort((p, q) => p - q), 'sorted by the distance to the entrance');
  for (const b of bp.bays) assert.ok(b.x > PARK.x && b.x < PARK.x + PARK.w && b.y > PARK.y && b.y < PARK.y + PARK.h, `bay (${b.x}, ${b.y}) inside the park`);
});

test('frontage: a park south of the street takes its north edge (side 3)', () => {
  const f = frontage(road(), { id: 3, x: 400, y: 303, w: 15, h: 12 });
  assert.ok(f, 'a frontage');
  assert.equal(f.side, 3, 'the north edge');
});

test('bays: a 60 x 40 park beside the street has about 60 * 40 / 6 bays (within 40%)', () => {
  const bp = buildPark(road(), { id: 2, x: 400, y: 257, w: 60, h: 40 });
  assert.ok(bp, 'a built park');
  const want = 60 * 40 / 6;
  assert.ok(Math.abs(bp.bays.length - want) <= 0.4 * want, `${bp.bays.length} bays against about ${want.toFixed(0)}`);
});

test('parkValid: a park beside the street is fine; over a road, too small, with no road beside it, or on another park, it says why', () => {
  const net = road(), cls = new Uint8Array(MAP * MAP);
  assert.equal(parkValid(PARK, cls, net, null, []), '');
  assert.match(parkValid({ ...PARK, y: 294 }, cls, net, null, []), /runs over it/);
  assert.match(parkValid({ ...PARK, w: 10 }, cls, net, null, []), /too small/);
  assert.match(parkValid({ id: 9, x: 100, y: 100, w: 30, h: 12 }, cls, net, null, []), /no road along/);
  assert.match(parkValid(PARK, cls, net, null, [{ id: 2, x: 410, y: 286, w: 12, h: 10 }]), /another car park/);
  const wet = cls.slice(); wet[290 * MAP + 405] = TC.WATER;
  assert.match(parkValid(PARK, wet, net, null, []), /buildable/);
});

test('a park of 20 bays and one entrance, 30 cars sent: 20 parked, 10 turned away, admissions ENTRY_S apart, no car through a shut gate', () => {
  const city = new City(1);
  city.terrain(new Uint8Array(MAP * MAP), { x: 200, y: ROAD_Y }, 7);
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(200, ROAD_Y, 800, ROAD_Y)], CLASS.street, 0);
  city.netOps(e.commit(true));
  city.setParks([PARK]);
  assert.equal(city.parks.length, 1, 'the park is built');
  assert.equal(city.sim.sinks.length, 2, 'two sinks: one per direction of the street at the entrance');
  const sim = city.sim, P = sim.parks[0]!;
  assert.equal(P.bays, 20);
  assert.equal(city.parkTest(1, 30), 30, '30 cars sent');
  // each sink has its own gate: its admissions are ENTRY_S apart (its next moves only when it admits a car); the bays are shared by the park's sinks
  const queued = () => sim.sinks.reduce((n, S) => n + S.q.length, 0);
  const adm: number[][] = sim.sinks.map(() => []);
  let held = 0, stoppedWithRoom = 0, maxQ = 0;
  for (let n = 0; n < 6000 && (sim.active > 0 || queued() > 0); n++) {
    const t0 = sim.t, next0 = sim.sinks.map(S => S.next), u0 = P.turned, q0 = sim.sinks.map(S => S.q.length);
    sim.step();
    maxQ = Math.max(maxQ, queued());
    sim.sinks.forEach((S, j) => { if (S.next !== next0[j]) { assert.ok(t0 >= next0[j]! - 1e-9, `a car parked at ${t0} s while the gate was shut until ${next0[j]} s`); adm[j]!.push(t0); } });
    // a car turned away found no bay left: the parked and the queued cars (over all sinks) hold them all
    if (P.turned > u0) assert.ok(P.parked + queued() >= P.bays, `a car turned away at ${t0} s with ${P.parked} parked and ${queued()} queued`);
    for (let i = 0; i < sim.cap; i++) {
      const j = sim.sink[i]!;
      if (!sim.alive[i] || j < 0) continue;
      const S = sim.sinks[j]!;
      if (sim.g.lanes[sim.lane[i]!]!.dseg !== S.dseg) continue;
      // the entry queue has room (at the start of the step): a car bound for the park does not stop on the road at the line
      if (q0[j]! < ENTRY_Q && sim.v[i]! < 0.5 && sim.s[i]! > S.s - 3 && sim.s[i]! <= S.s) stoppedWithRoom++;
      // a full queue holds the next car on the road, within 30 m of the line
      if (q0[j]! >= ENTRY_Q && sim.s[i]! > S.s - 30 && sim.s[i]! <= S.s) held++;
    }
  }
  const nAdm = adm.reduce((n, a) => n + a.length, 0);
  assert.equal(P.parked, 20, 'parked');
  assert.equal(P.turned, 10, 'turned away');
  assert.equal(sim.active, 0, 'every car has gone');
  assert.equal(queued(), 0, 'the queues are empty');
  assert.equal(nAdm, 20, 'an admission per parked car');
  for (const a of adm) for (let k = 1; k < a.length; k++) assert.ok(a[k]! - a[k - 1]! >= ENTRY_S - 1e-6, `admissions ${a[k - 1]} and ${a[k]} s apart at one sink`);
  assert.equal(stoppedWithRoom, 0, 'no car stopped on the road at the line while the queue had room');
  console.log(`car park: ${P.parked} parked, ${P.turned} turned, queues at most ${maxQ}, admissions per sink ${adm.map(a => a.length).join(' / ')}, ${held} car-steps held on the road at a full queue`);
  // the counts follow the park across a rebuild by id, and empty on close
  city.setParks([PARK]);
  assert.equal(sim.parks[0]!.parked, 20, 'kept across setParks');
  assert.deepEqual(city.parkView(), [{ id: 1, bays: 20, parked: 20, turned: 10 }]);
  city.emptyParks();
  assert.equal(sim.parks[0]!.parked + sim.parks[0]!.turned, 0, 'emptied');
});

/** a City with the street and PARK built (one sink, 20 bays): the sim, the park's counts and the sink */
function parkCity(): { city: City; sim: Sim; P: ParkState; K: Sink } {
  const city = new City(1);
  city.terrain(new Uint8Array(MAP * MAP), { x: 200, y: ROAD_Y }, 7);
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(200, ROAD_Y, 800, ROAD_Y)], CLASS.street, 0);
  city.netOps(e.commit(true));
  city.setParks([PARK]);
  return { city, sim: city.sim, P: city.sim.parks[0]!, K: city.sim.sinks[0]! };
}

test('the entry queue: three cars bunched upstream of a shut gate leave the road at the line into the queue (none stops on it); one is admitted per ENTRY_S from the gate\'s opening', () => {
  const { sim, P, K } = parkCity();
  // the gate is shut until 20 s; the westbound lane of the sink's dseg: three cars 16 m apart, 40 m to 72 m short of the line
  K.next = 20;
  const lane = sim.g.dsegs[K.dseg]!.lanes[0]!;
  for (const back of [40, 56, 72]) assert.ok(sim.spawnAt(lane, K.s - back, K.dseg, K.s, 0, 0) >= 0, `a car ${back} m short of the line`);
  const adm: number[] = [];
  let queued = 0, stopped = 0;
  for (let n = 0; n < 1500 && P.parked < 3; n++) {
    const t0 = sim.t, p0 = P.parked;
    sim.step();
    if (P.parked > p0) adm.push(t0);
    if (t0 < K.next) queued = Math.max(queued, K.q.length);
    // a car stopped on the road within 3 m short of the line while the gate is shut: none (the queue takes them off the road)
    if (t0 < K.next) for (let i = 0; i < sim.cap; i++) if (sim.alive[i] && sim.sink[i] === 0 && sim.v[i]! < 0.5 && sim.s[i]! < K.s && sim.s[i]! > K.s - 3) stopped++;
  }
  assert.equal(queued, 3, 'all three in the queue while the gate was shut');
  assert.equal(stopped, 0, 'no car stopped on the road at the line');
  assert.equal(P.parked, 3, 'all three parked');
  assert.equal(adm.length, 3, 'three admissions');
  assert.ok(adm[0]! >= 20 - 1e-9, `the first car waited for the gate (admitted at ${adm[0]} s)`);
  for (let k = 1; k < adm.length; k++) assert.ok(adm[k]! - adm[k - 1]! >= ENTRY_S - 1e-6, `admissions ${adm[k - 1]} and ${adm[k]} s apart`);
});

test('the entry queue, with the gate shut: a car bound elsewhere drives past the line while the queue has room; with ENTRY_Q cars queued, the next car holds on the road until the gate opens, then leaves it', () => {
  const { sim, P, K } = parkCity();
  K.next = 1e9;
  const dg = sim.g.dsegs[K.dseg]!, lane = dg.lanes[dg.lanes.length - 1]!;
  const send = () => sim.spawnAt(lane, Math.max(0, K.s - 40), K.dseg, K.s, 0, 0, -1);
  // three cars queued off the road
  for (let n = 0; n < 2000 && K.q.length < 3; n++) { if (n % 10 === 0) send(); sim.step(); }
  assert.equal(K.q.length, 3, 'three cars queued');
  // a car bound for a street past the line (no sink): it drives through at speed while the queue has room
  const through = sim.spawnAt(lane, Math.max(0, K.s - 60), K.dseg, K.s + 40, 0, -1, -1);
  assert.ok(through >= 0, 'the through car is spawned');
  let vMin = Infinity;
  for (let n = 0; n < 1500 && sim.alive[through]; n++) {
    sim.step();
    if (sim.alive[through] && sim.s[through]! >= K.s - 5 && sim.s[through]! <= K.s + 5) vMin = Math.min(vMin, sim.v[through]!);
  }
  assert.ok(!sim.alive[through], 'the through car reached its street');
  assert.ok(vMin > 3, `the through car passed the line at ${vMin.toFixed(1)} m/s or more`);
  assert.ok(K.q.length >= 3 && K.q.length < ENTRY_Q, `the queue (${K.q.length} cars) still has room: the through car did not join it`);
  // the queue fills to ENTRY_Q; the car after it stops on the road at the line
  for (let n = 0; n < 2000 && K.q.length < 10; n++) { if (n % 10 === 0) send(); sim.step(); }
  assert.equal(K.q.length, 10, 'ten cars queued');
  let h = -1;
  for (let n = 0; n < 600 && h < 0; n++) {
    if (n % 10 === 0) send();
    sim.step();
    for (let i = 0; i < sim.cap && h < 0; i++) if (sim.alive[i] && sim.sink[i] === 0 && sim.v[i]! < 0.5 && sim.s[i]! < K.s && sim.s[i]! > K.s - 3) h = i;
  }
  assert.ok(h >= 0, 'a car stopped on the road at the line');
  assert.equal(K.q.length, 10, 'the queue is still full');
  assert.equal(P.parked, 0, 'none parked: the gate is shut');
  // the gate opens: the queue admits one car per ENTRY_S, and the car on the road joins the queue
  K.next = 0;
  for (let n = 0; n < 200 && sim.alive[h]; n++) sim.step();
  assert.ok(!sim.alive[h], 'the held car left the road');
  assert.equal(P.turned, 0, 'no car turned away: the park had bays');
  assert.ok(P.parked >= 1, 'the gate admitted a car');
});

test('a straight street, both ends: a car from the west and one from the east each park at the sink on their own side, never leaving their dseg (no U-turn past the entrance)', () => {
  const { sim, P } = parkCity();
  const east = sim.sinks.findIndex(S => S.ux! > 0), west = sim.sinks.findIndex(S => S.ux! < 0);
  assert.ok(east >= 0 && west >= 0 && east !== west, 'one sink per direction of the street');
  // the car from the west starts on the eastbound dseg 20 m from the west end; the car from the east on the westbound dseg 20 m from the east end
  const ea = sim.spawnAt(sim.g.dsegs[sim.sinks[east]!.dseg]!.lanes[0]!, 20, sim.sinks[east]!.dseg, sim.sinks[east]!.s, 0, east);
  const wa = sim.spawnAt(sim.g.dsegs[sim.sinks[west]!.dseg]!.lanes[0]!, 20, sim.sinks[west]!.dseg, sim.sinks[west]!.s, 0, west);
  assert.ok(ea >= 0 && wa >= 0, 'both cars spawned');
  const dsegOf = (i: number) => sim.g.lanes[sim.lane[i]!]!.dseg;
  const d0 = dsegOf(ea), d1 = dsegOf(wa);
  assert.equal(d0, sim.sinks[east]!.dseg, 'the west car is on the eastbound dseg, the one with its sink');
  for (let n = 0; n < 3000 && (sim.alive[ea] || sim.alive[wa] || sim.sinks.some(S => S.q.length)); n++) {
    sim.step();
    if (sim.alive[ea]) assert.equal(dsegOf(ea), d0, 'the west car never leaves its dseg (no U-turn at the far end)');
    if (sim.alive[wa]) assert.equal(dsegOf(wa), d1, 'the east car never leaves its dseg (no U-turn at the far end)');
  }
  assert.equal(P.parked, 2, 'both parked');
  assert.equal(P.turned, 0, 'none turned away');
  assert.equal(sim.active, 0, 'both gone');
});
