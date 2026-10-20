// The parking's City tests (PARKING.md sections 1 and 2): an on-street run on an arterial drops its kerb lane (one lane fewer that way, the other
// way kept), the curb park is built (id -1, curb, one sink on its own direction); a bay-row lot beside a street is a car park (id LOT_ID0 + its
// lowest row id) with sinks; and each car parked pays the parking fee (5 $ a car) into the books, today.parking counting it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, keyOf, type Leg, type RoadClass } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { City } from '../src/game/city';
import { MAP } from '../src/game/iso';
import { CURB_MIN_BAYS } from '../src/game/event/config';
import { LOT_ID0, type BayRowDef } from '../src/game/event/rows';
import type { CurbDef } from '../src/game/event/curb';
import type { DSeg } from '../src/game/sim/lanes';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

/** the main road's centre line (tiles): y = ROAD_Y, from x 200 to 800 */
const ROAD_Y = 300;
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
/** the directed seg key from (ax, ay) to (bx, by), as lanes.ts keys it */
const dk = (ax: number, ay: number, bx: number, by: number) => `${keyOf({ x: ax, y: ay })}>${keyOf({ x: bx, y: by })}`;
/** a row from a to b on side, at bay angle bay, id id */
const row = (id: number, ax: number, ay: number, bx: number, by: number, side: 1 | -1 = 1): BayRowDef => ({ id, ax, ay, bx, by, side, bay: 90, col: 'white' });
/** a city on a flat valley with the network the legs make (committed as one batch) */
function build(addLegs: (e: NetEditor) => void): City {
  const city = new City(1);
  city.terrain(new Uint8Array(MAP * MAP), { x: 200, y: ROAD_Y }, 7);
  const e = new NetEditor(new RoadNetwork());
  addLegs(e);
  city.netOps(e.commit(true));
  return city;
}
/** the arterial from x 200 to 800 with a street across it at x 400 and 600 (junctions), the run between them */
const arterialCity = (cls: RoadClass = CLASS.arterial): City => build(e => {
  e.addLegs([leg(200, ROAD_Y, 800, ROAD_Y)], cls, 0);
  e.addLegs([400, 600].map(x => leg(x, ROAD_Y - 100, x, ROAD_Y + 100)), CLASS.street, 0);
});
/** the directed dseg with key k */
const dseg = (city: City, k: string): DSeg => city.g.dsegs.find((d): d is DSeg => !!d && d.key === k)!;

test('an on-street run on an arterial: its kerb lane is dropped (one lane fewer that way), the other way keeps its lanes; the curb park is built (id -1, curb) with one sink, on its own direction', () => {
  const city = arterialCity();
  const east = dk(400, ROAD_Y, 600, ROAD_Y), west = dk(600, ROAD_Y, 400, ROAD_Y);
  const RUN: CurbDef = { id: 1, ax: 400, ay: ROAD_Y, bx: 600, by: ROAD_Y };
  const before = dseg(city, east).lanes.length;
  assert.ok(before >= 2, 'the arterial has 2+ lanes that way');
  city.setParking([], [RUN], 5);
  assert.equal(dseg(city, east).lanes.length, before - 1, 'the run loses its kerb lane');
  assert.equal(dseg(city, west).lanes.length, before, 'the other way keeps its lanes');
  const i = city.parks.findIndex(p => p.id === -1), P = city.parks[i];
  assert.ok(P, 'the curb park is built');
  assert.equal(P.curb, true, 'marked as an on-street run');
  assert.ok(P.bays.length >= CURB_MIN_BAYS, `${P.bays.length} bays`);
  const sinks = city.sim.sinks.filter(S => S.park === i);
  assert.equal(sinks.length, 1, 'one sink: its own direction only (no U-turn into the kerb)');
  assert.equal(city.g.dsegs[sinks[0]!.dseg]!.key, east, 'the sink is on the run\'s eastbound dseg');
  assert.equal(city.sim.parks.length, city.parks.length, 'a sim park state per park');
});

test('a bay-row lot of two rows beside a street: a car park with id LOT_ID0 + its lowest row id, 20 bays, and sinks on the street', () => {
  const city = build(e => e.addLegs([leg(200, 300, 800, 300)], CLASS.street, 0));
  city.setParking([row(1, 400, 306, 412.5, 306), row(2, 400, 311, 412.5, 311, -1)], [], 5);
  const i = city.parks.findIndex(p => p.id === LOT_ID0 + 1), P = city.parks[i];
  assert.ok(P, 'the lot is a car park');
  assert.equal(P.bays.length, 20, 'both rows\' bays');
  assert.ok(!P.curb, 'not an on-street run');
  const sinks = city.sim.sinks.filter(S => S.park === i);
  assert.equal(sinks.length, 2, 'one sink per direction of the street at the entrance');
});

test('the parking fee: each car parked since the last step pays parkFee (5 $), into the books and today.parking', () => {
  const city = build(e => e.addLegs([leg(200, ROAD_Y, 800, ROAD_Y)], CLASS.street, 0));
  city.setParking([], [], 5);
  assert.equal(city.parkFee, 5);
  const m0 = city.budget.money;
  // two cars parked in the last step (a pair per car: the park index and the origin zone)
  city.sim.parkedNow.push(0, 0, 0, 0);
  city.step(1);
  assert.equal(city.budget.money - m0, 10, 'two cars at 5 $ each reach the treasury');
  assert.equal(city.budget.today.parking, 10, 'today.parking counts them');
  assert.equal(city.sim.parkedNow.length, 0, 'the log is cleared after the fee');
});
