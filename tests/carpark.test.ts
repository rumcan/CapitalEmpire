// The car parks' headless tests (Phase 5 step 3a): the frontage, entrance and bays of a park beside a straight street, parkValid's reasons,
// and a City's park fed 30 cars (20 bays, one entrance): 20 parked, 10 turned away, admissions ENTRY_S apart, no car through a shut gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { City } from '../src/game/city';
import { MAP } from '../src/game/iso';
import { TC } from '../src/game/terrain/types';
import { buildPark, frontage, parkValid, type CarParkDef } from '../src/game/event/carpark';
import { ENTRY_S } from '../src/game/event/config';

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
  assert.equal(city.sim.sinks.length, 1, 'one sink: the one entrance');
  const sim = city.sim, P = sim.parks[0]!, K = sim.sinks[0]!;
  assert.equal(P.bays, 20);
  assert.equal(city.parkTest(1, 30), 30, '30 cars sent');
  const adm: number[] = [];
  let held = 0;
  for (let n = 0; n < 6000 && sim.active > 0; n++) {
    const t0 = sim.t, next0 = K.next, p0 = P.parked, u0 = P.turned;
    sim.step();
    if (P.parked > p0) { assert.ok(t0 >= next0 - 1e-9, `a car parked at ${t0} s while the gate was shut until ${next0} s`); adm.push(t0); }
    if (P.turned > u0) assert.ok(t0 >= next0 - 1e-9, `a car turned away at ${t0} s while the gate was shut until ${next0} s`);
    // the cars waiting within 30 m of the line while it is shut
    if (t0 < next0) for (let i = 0; i < sim.cap; i++) if (sim.alive[i] && sim.sink[i] === 0 && sim.s[i] >= K.s - 30 && sim.s[i] < K.s) held++;
  }
  assert.equal(P.parked, 20, 'parked');
  assert.equal(P.turned, 10, 'turned away');
  assert.equal(sim.active, 0, 'every car has gone');
  assert.equal(adm.length, 20, 'an admission per parked car');
  for (let k = 1; k < adm.length; k++) assert.ok(adm[k]! - adm[k - 1]! >= ENTRY_S - 1e-6, `admissions ${adm[k - 1]} and ${adm[k]} s apart`);
  console.log(`car park: ${P.parked} parked, ${P.turned} turned, first admissions at ${adm.slice(0, 3).join(', ')} s, ${held} car-steps near a shut gate`);
  // the counts follow the park across a rebuild by id, and empty on close
  city.setParks([PARK]);
  assert.equal(sim.parks[0]!.parked, 20, 'kept across setParks');
  assert.deepEqual(city.parkView(), [{ id: 1, bays: 20, parked: 20, turned: 10 }]);
  city.emptyParks();
  assert.equal(sim.parks[0]!.parked + sim.parks[0]!.turned, 0, 'emptied');
});

test('a queue behind a shut gate: three cars bunched upstream stop at the line, and one is admitted per ENTRY_S', () => {
  const city = new City(1);
  city.terrain(new Uint8Array(MAP * MAP), { x: 200, y: ROAD_Y }, 7);
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(200, ROAD_Y, 800, ROAD_Y)], CLASS.street, 0);
  city.netOps(e.commit(true));
  city.setParks([PARK]);
  const sim = city.sim, P = sim.parks[0]!, K = sim.sinks[0]!;
  // the gate is shut until 10 s (as after an admission); the westbound lane of the sink's dseg: three cars 16 m apart, 40 m to 72 m short
  K.next = 10;
  const lane = sim.g.dsegs[K.dseg]!.lanes[0]!;
  for (const back of [40, 56, 72]) assert.ok(sim.spawnAt(lane, K.s - back, K.dseg, K.s, 0, 0) >= 0, `a car ${back} m short of the line`);
  const adm: number[] = [];
  let stopped = 0;
  for (let n = 0; n < 1500 && P.parked < 3; n++) {
    const t0 = sim.t, p0 = P.parked;
    sim.step();
    if (P.parked > p0) adm.push(t0);
    // a car stopped within 3 m short of the line while it is shut: the queue holds
    if (t0 < K.next) for (let i = 0; i < sim.cap; i++) if (sim.alive[i] && sim.sink[i] === 0 && sim.v[i] < 0.5 && sim.s[i] < K.s && sim.s[i] > K.s - 3) stopped++;
  }
  assert.equal(P.parked, 3, 'all three parked');
  assert.ok(adm[0]! >= 10 - 1e-9, `the first car waited for the gate (admitted at ${adm[0]} s)`);
  assert.equal(adm.length, 3, 'three admissions');
  for (let k = 1; k < adm.length; k++) assert.ok(adm[k]! - adm[k - 1]! >= ENTRY_S - 1e-6, `admissions ${adm[k - 1]} and ${adm[k]} s apart`);
  assert.ok(stopped > 0, 'a car stood at the line while the gate was shut');
});
