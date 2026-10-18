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
