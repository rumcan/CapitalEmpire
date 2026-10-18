// The shuttle buses and walkers' headless tests (Phase 5 step 6a): a straight street with a car park beside it (the party's cars park there), a
// stadium door on the street (B), a shuttle route from the car park's lot stop to a doors stop by B. The fans walk from the bays to the lot stop,
// board, ride, alight and walk to the door; with no route they walk to the door straight. The counts add up every second.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { City } from '../src/game/city';
import { MAP } from '../src/game/iso';
import { MPT } from '../src/game/sim/lanes';
import type { CarParkDef } from '../src/game/event/carpark';
import type { BusRouteDef } from '../src/game/event/bus';
import { ALIGHT_S, BOARD_S, BUS_SEATS, PARTY, WALK_V } from '../src/game/event/config';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

/** the street's centre line: y = ROAD_Y, from x 200 to 800 (a dead end at each end) */
const ROAD_Y = 300;
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
/** the car park north of the street: 30 x 12 tiles, 44 bays, one entrance on the street */
const PARK: CarParkDef = { id: 1, x: 400, y: 285, w: 30, h: 12 };
/** the stadium's door (B), north of the street, and the route: the lot stop west of the entrance (on the westbound lane the cars park from), the doors
 *  stop by B (also on the westbound lane), two buses of BUS_SEATS seats */
const DOOR = { x: 250, y: 296 };
const ROUTE: BusRouteDef = { id: 1, park: 1, sx: 395, sy: 298.5, dx: 250, dy: 298.5, buses: 2, seats: BUS_SEATS };

/** a city with the street, the car park (PARK) and the fake stadium site whose one door is DOOR; the routes given (none by default) */
function world(routes: BusRouteDef[] = []): City {
  const city = new City(1);
  city.terrain(new Uint8Array(MAP * MAP), { x: 200, y: ROAD_Y }, 7);
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(200, ROAD_Y, 800, ROAD_Y)], CLASS.street, 0);
  city.netOps(e.commit(true));
  city.setParks([PARK]);
  city.site = { x: 240, y: 290, w: 20, h: 6, c: { x: 250, y: 293 }, doors: [DOOR] };
  if (routes.length) city.setBusRoutes(routes);
  return city;
}

/** the surge of a round with the crowd given: the build ends at once, the surge begins (its own crowd has no homes: no cars from it) */
function startSurge(city: City, crowd: number[]): void {
  assert.equal(city.round.start(crowd), true, 'the round starts');
  assert.equal(city.startNow(), true, 'the surge begins');
  assert.ok(city.crowd, 'the crowd is out');
}

/** sends the party's cars: one attempt each call, from just upstream of the entrance's sink (the car's party is town 0); true when one is sent */
function sender(city: City): () => boolean {
  const sim = city.sim, K = sim.sinks[0]!, dg = sim.g.dsegs[K.dseg]!, lane = dg.lanes[dg.lanes.length - 1]!;
  return () => sim.spawnAt(lane, Math.max(0, K.s - 40), K.dseg, K.s, 0, 0, 0) >= 0;
}

/** the counts add up for town 0 now: the cars parked times the party's fans = the fans walking + at a lot stop + on a bus + at the doors */
function countsAddUp(city: City): { parked: number; fans: number } {
  const v = city.roundView().surge!, W = city.crowd!.walking()[0]!;
  const parked = v.parked[0]!;
  assert.equal(parked * PARTY, W + v.atStop[0]! + v.onBus[0]! + v.fans[0]!, `at ${city.sim.t} s: ${parked} parked: walking ${W}, at stop ${v.atStop[0]}, on bus ${v.onBus[0]}, at doors ${v.fans[0]}`);
  return { parked, fans: v.fans[0]! };
}

test('a shuttle round: 30 party cars park, their 90 fans reach the door; each second the counts add up; boardings and alightings keep their clocks', () => {
  const city = world([ROUTE]), sim = city.sim, send = sender(city);
  startSurge(city, [30]);
  assert.equal(sim.busN, 2, 'two buses at the lot stop');
  let left = 30, maxLoad = 0, boardGap = Infinity, alightGap = Infinity, fans = 0;
  const load = new Map<number, number>(), tBoard = new Map<number, number>(), tAlight = new Map<number, number>();
  for (let n = 0; n < 6000 && fans < 90; n++) {
    if (left && n % 10 === 0 && send()) left--;
    city.step(1);
    const t = sim.t;
    for (let i = 0; i < sim.cap; i++) {
      if (sim.bus[i]! < 0) continue;
      const L = sim.busLoad[i]!, p = load.get(i) ?? 0;
      if (L > p) { if (tBoard.has(i)) boardGap = Math.min(boardGap, t - tBoard.get(i)!); tBoard.set(i, t); }
      if (L < p) { if (tAlight.has(i)) alightGap = Math.min(alightGap, t - tAlight.get(i)!); tAlight.set(i, t); }
      load.set(i, L); maxLoad = Math.max(maxLoad, L);
    }
    if (sim.steps % 10 === 0) fans = countsAddUp(city).fans;
  }
  const v = city.roundView().surge!;
  assert.equal(v.parked[0], 30, 'all 30 cars parked');
  assert.equal(fans, 90, 'all 90 fans at the door');
  assert.ok(maxLoad > 0 && maxLoad <= BUS_SEATS, `a bus carried up to ${maxLoad} fans (seats ${BUS_SEATS})`);
  assert.ok(boardGap >= BOARD_S - 1e-6, `boardings ${boardGap.toFixed(2)} s apart at least`);
  assert.ok(alightGap >= ALIGHT_S - 1e-6, `alightings ${alightGap.toFixed(2)} s apart at least`);
  console.log(`shuttle: 90 fans at the door at ${sim.t.toFixed(0)} s; a bus carried up to ${maxLoad}; boardings ${BOARD_S} s apart (least ${boardGap.toFixed(2)}), alightings least ${alightGap.toFixed(2)} s apart`);
});

test('a bus loads up to its seats: 60 fans waiting at the lot stop board one by one, and the bus leaves full', () => {
  const city = world([ROUTE]), sim = city.sim;
  startSurge(city, [0]);
  city.crowd!.queue[0]!.push({ town: 0, n: 2 * BUS_SEATS });
  let maxLoad = 0, fans = 0;
  for (let n = 0; n < 6000 && fans < 2 * BUS_SEATS; n++) {
    city.step(1);
    for (let i = 0; i < sim.cap; i++) if (sim.bus[i]! >= 0) maxLoad = Math.max(maxLoad, sim.busLoad[i]!);
    fans = city.crowd!.fans[0]!;
  }
  assert.equal(maxLoad, BUS_SEATS, 'a bus filled to its seats, and never past them');
  assert.equal(fans, 2 * BUS_SEATS, 'every waiting fan reached the door');
  assert.equal(city.crowd!.waiting(0), 0, 'the queue is empty');
  console.log(`seats: ${2 * BUS_SEATS} fans carried in ${sim.t.toFixed(0)} s by two buses of ${BUS_SEATS}`);
});

test('without a route the fans walk to the door: the first fans arrive at the first park time + the walk / WALK_V', () => {
  const city = world(), sim = city.sim, send = sender(city);
  startSurge(city, [30]);
  const bay = city.parks[0]!.bays[0]!, walk = Math.hypot(bay.x - DOOR.x, bay.y - DOOR.y) * MPT / WALK_V;
  let left = 30, tPark = -1, tArr = -1, fans = 0;
  for (let n = 0; n < 6000 && fans < 90; n++) {
    if (left && n % 10 === 0 && send()) left--;
    city.step(1);
    const v = city.roundView().surge!;
    if (tPark < 0 && v.parked[0]! > 0) tPark = sim.t;
    if (tArr < 0 && v.fans[0]! > 0) tArr = sim.t;
    fans = v.fans[0]!;
    if (sim.steps % 10 === 0) countsAddUp(city);
  }
  assert.equal(fans, 90, 'all 90 fans at the door');
  assert.ok(tArr > 0 && tPark > 0, 'a car parked and a fan arrived');
  assert.ok(Math.abs(tArr - tPark - walk) <= 1.5, `the first fan arrived ${(tArr - tPark).toFixed(1)} s after the park, the walk is ${walk.toFixed(1)} s`);
  console.log(`walk: ${walk.toFixed(0)} s from the bay to the door; the first fans came ${(tArr - tPark).toFixed(1)} s after the first park; all 90 by ${sim.t.toFixed(0)} s`);
});

/** a town's stop on the street (its lot stop at x 300 on the westbound kerb lane, the same lane as the doors stop by DOOR, downstream of it), a route of
 *  town 0 (no car park: park 0) */
const TOWN_ROUTE: BusRouteDef = { id: 1, park: 0, town: 0, sx: 300, sy: 298.5, dx: 250, dy: 298.5, buses: 2, seats: BUS_SEATS };

test('a town bus: the parties whose homes are within BUS_WALK of the town stop walk to it and ride to the doors (no car for them); the counts add up', () => {
  // one town, its centre on the street near the stop: its homes grow along the street and the streets north of it. The cross streets give the town
  // land: a town short of land lays a gravel leg (its planner runs on the first step), and a new junction or a longer street drops the buses
  const city = new City(3), sim = city.sim;
  city.terrain(new Uint8Array(MAP * MAP), { x: 200, y: ROAD_Y }, 7, [{ x: 300, y: ROAD_Y }]);
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(200, ROAD_Y, 800, ROAD_Y)], CLASS.street, 0);
  for (const x of [220, 260, 340, 380]) e.addLegs([leg(x, ROAD_Y, x, 120)], CLASS.street, 0);
  e.addLegs([leg(220, 120, 380, 120)], CLASS.street, 0);
  city.netOps(e.commit(true));
  city.stamp(30);
  // the first step switches the sim to the lots' trips (its setTarget trims every vehicle): that runs before the surge places its buses
  assert.equal(city.step(1).grow, null, 'no gravel leg in the first step');
  city.setParks([PARK]);
  city.site = { x: 240, y: 290, w: 20, h: 6, c: { x: 250, y: 293 }, doors: [DOOR] };
  city.setBusRoutes([TOWN_ROUTE]);
  assert.equal(city.round.start([30]), true, 'the round starts');
  assert.equal(city.startNow(), true, 'the surge begins');
  assert.ok(city.crowd && city.surge, 'the crowd is out');
  assert.equal(sim.busN, 2, 'two buses at the lot stop');
  const C = city.crowd!;
  const quiet = () => C.walkers.length === 0 && C.waiting(0) === 0 && C.counts().onBus.every(x => x === 0) && sim.active === 0;
  let n = 0;
  for (; n < 8000 && !(n > 0 && city.round.stage !== 'surge' && quiet()); n++) {
    const r = city.step(1);
    assert.equal(r.grow, null, 'no gravel leg (it would cut the bus lane)');
    if (n % 10 === 0) {
      const v = city.roundView().surge!;
      const W = C.walking();
      const lhs = v.parked[0]! * PARTY + v.byBus[0]!;
      const rhs = W[0]! + v.atStop[0]! + v.onBus[0]! + v.fans[0]!;
      assert.equal(lhs, rhs, `at ${sim.t} s: parked x PARTY + by bus = walking + at the stop + on a bus + at the doors (town 0)`);
    }
  }
  const v = city.roundView().surge!;
  assert.ok(v.byBus[0]! > 0, `${v.byBus[0]} fans by bus`);
  assert.equal(v.onRoad[0]! + v.parked[0]! + v.turned[0]! + v.lost[0]! + v.stranded[0]! + v.byBus[0]! / PARTY, 30, 'on the road + parked + turned + lost + stranded + by bus = sent');
  assert.equal(v.fans[0], v.byBus[0]! + v.parked[0]! * PARTY, 'every fan of the bus and of the parked cars is at the doors');
  console.log(`town bus: ${v.byBus[0]} of town 0's ${30 * PARTY} fans by bus, ${v.parked[0]} cars parked, all at the doors by ${sim.t.toFixed(0)} s`);
});

test('a bus route keeps its buses through road edits: a split away from the route and a split on the route (between the stops) leave both buses serving both stops, and no bus slot is lost', () => {
  const city = new City(1), sim = city.sim;
  city.terrain(new Uint8Array(MAP * MAP), { x: 200, y: ROAD_Y }, 7);
  // the route's street, and a second street south of it (not joined) for the edit away from the route
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(200, ROAD_Y, 800, ROAD_Y), leg(200, 500, 800, 500)], CLASS.street, 0);
  city.netOps(e.commit(true));
  city.setParks([PARK]);
  city.site = { x: 240, y: 290, w: 20, h: 6, c: { x: 250, y: 293 }, doors: [DOOR] };
  city.setBusRoutes([ROUTE]);
  startSurge(city, [0]);
  const C = city.crowd!, FANS = 2 * BUS_SEATS;
  C.queue[0]!.push({ town: 0, n: FANS });
  const busSlots = () => { const out: number[] = []; for (let i = 0; i < sim.cap; i++) if (sim.bus[i]! >= 0) out.push(i); return out; };
  const slots0 = busSlots();
  assert.equal(slots0.length, 2, 'two buses at the lot stop');
  const load = new Map<number, number>();
  let boards = 0, alights = 0, minBuses = 2;
  const run = (max: number, until: () => boolean) => {
    for (let n = 0; n < max && !until(); n++) {
      city.step(1);
      for (const i of busSlots()) {
        const L = sim.busLoad[i]!, p = load.get(i) ?? 0;
        if (L > p) boards += L - p; else if (L < p) alights += p - L;
        load.set(i, L);
      }
      minBuses = Math.min(minBuses, sim.busN);
    }
  };
  const dwelling = () => busSlots().some(i => sim.busDwell[i]! > 0);
  run(1500, () => boards > 0);
  assert.ok(boards > 0, `boardings before the edits: ${boards}`);
  // an edit away from the route: a crossing on the street to the south splits its seg
  e.addLegs([leg(500, 450, 500, 550)], CLASS.street, 0);
  city.netOps(e.commit());
  run(300, () => false);
  // an edit on the route: a crossing at x 330 splits the street between the doors stop (x 250) and the lot stop (x 395); the buses are at a stop
  // (dwelling) when it lands, so their lanes are gone
  run(3000, dwelling);
  assert.ok(dwelling(), 'a bus is at a stop when the route is split');
  const b0 = boards, a0 = alights;
  e.addLegs([leg(330, 200, 330, 400)], CLASS.street, 0);
  city.netOps(e.commit());
  run(4000, () => C.fans[0]! >= FANS);
  assert.equal(minBuses, 2, 'no bus slot lost: two buses through both edits');
  assert.deepEqual(busSlots(), slots0, 'the same two buses');
  assert.ok(boards - b0 > 0, `boardings after the route split: ${boards - b0}`);
  assert.ok(alights - a0 > 0, `alightings after the route split: ${alights - a0}`);
  assert.equal(C.fans[0], FANS, 'every fan reached the doors');
  const R = sim.busRoutes[0]!;
  for (const i of busSlots()) {
    const T = sim.busLeg[i] ? R.lot : R.doors;
    assert.equal(sim.dest[i], T.dseg, `bus ${i} is pointed at its stop's dseg`);
  }
  console.log(`route edits: ${boards - b0} boardings and ${alights - a0} alightings after the route split; both buses kept; ${FANS} fans at the door by ${sim.t.toFixed(0)} s`);
});
