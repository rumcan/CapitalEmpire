// T092 (#161, plan P22 2.2.2): the map exits feed the range start. A range start's county road runs edge to edge with two exits: the tourist
// catchment (city.ts planVisits) is one catchment an exit (visitExits: golf.exits), so the clubhouse's and the tourism businesses' tourists start at
// both exits' kerbs; a classic game and an old golf start keep their one highway entry. The driving range itself is the main thread's (P24 D2,
// golf/rangebiz.ts RangeSim): the worker plans it no cars, and its golfers come from RANGE_PASS_POP a map exit plus the residents (zero at the
// start), turning in off the county road from both directions, their takings booked.
// npm test (bundled by esbuild, run by node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { City } from '../src/game/city';
import { CLASS, RoadNetwork, type Leg, type Pt } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { MAP } from '../src/game/iso';
import { laneAt } from '../src/game/sim/lanes';
import { BUSINESS } from '../src/game/business/catalogue';
import { freshStats, type BizDef } from '../src/game/business/state';
import { GAME_DAY } from '../src/game/budget';
import { RangeSim, dayDemand, defaultRangeBiz, rangeScene, type CarSlot } from '../src/game/golf/rangebiz';
import { RANGE_PASS_POP } from '../src/game/golf/range';
import { bayGrid } from '../src/game/event/carpark';
import type { Rect } from '../src/game/golf/mode';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

/** the county road: straight across the map at y = Y, from the west edge (exit A) to the east edge (exit B); the town's seed across it */
const Y = 1000, A: Pt = { x: 0, y: Y }, B: Pt = { x: MAP - 1, y: Y }, SEED: Pt = { x: 1000, y: Y - 40 };
const leg = (a: Pt, b: Pt): Leg => ({ a, b });
/** the player's clubhouse and the range, beside the road on the course side, no lots */
const CLUB: BizDef = { id: 1, type: 'clubhouse', x: 980, y: Y + 3, w: 40, h: 24 };
const RANGE: BizDef = { id: 2, type: 'range', x: 1100, y: Y + 3, w: 70, h: 24 };
/** the clubhouse's level (its tourists are TOURIST_PER_LEVEL a level an exit; at level 1, 1,000 tiles from each exit, it plans about a car a day,
 *  too few to tell the exits apart) */
const LEVEL = 5;

/** a City on open ground with the county road and the businesses; golf: 'range' a range start (both exits), 'old' an old golf start, null classic */
function roadCity(golf: 'range' | 'old' | null, defs: BizDef[] = [CLUB, RANGE]): City {
  const city = new City(7);
  city.autoStadium = false;
  // the city's entry is the exit nearest the town's seed (engine.ts sendTerrain): A here
  city.terrain(new Uint8Array(MAP * MAP), A, 7, [SEED]);
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(A, B)], CLASS.road, 0, undefined, true);
  city.netOps(e.commit(true));
  if (golf === 'range') city.setGolf({ tier: 1, rep: 0, land: [], start: 'range', exits: [A, B] });
  else if (golf === 'old') city.setGolf({ tier: 1, rep: 0, land: [] });
  city.restoreBiz(defs.map(d => ({ ...freshStats(d.id), level: LEVEL }))); // (setBusinesses keeps a placed business's restored stats)
  city.setBusinesses(defs);
  return city;
}
type Dep = ReturnType<City['visits']['schedule']>[number];
/** the departures planned over the first `days` game days (each day's plan read as it starts), the city stepped through them */
function departures(city: City, days: number): Dep[] {
  const seen = new Map<string, Dep>(), take = () => { for (const d of city.visits.schedule()) seen.set(`${d.id}:${d.t}`, d); };
  take();
  for (let day = 0; day < days; day++) for (let s = 0; s < GAME_DAY; s++) { city.step(10); if (s === 5) take(); }
  return [...seen.values()];
}
/** the x of a departure's start (its drive's point on its lane) */
function startX(city: City, d: Dep): number {
  const g = (city as unknown as { g: { lanes: Parameters<typeof laneAt>[0][] } }).g, q = { x: 0, y: 0, hx: 0, hy: 0 };
  laneAt(g.lanes[d.drive!.lane]!, d.drive!.s, q); return q.x;
}

test("a range start: the clubhouse's tourists start at both exits' kerbs (no lots: a catchment an exit), the range gets no worker cars", () => {
  const city = roadCity('range'), ts = departures(city, 3);
  const tourists = ts.filter(d => d.id === CLUB.id && d.lot === null);
  assert.ok(tourists.length > 0, `the clubhouse plans tourist cars with no residents (${tourists.length})`);
  const xs = tourists.map(d => startX(city, d)), west = xs.filter(x => x < 20).length, east = xs.filter(x => x > MAP - 21).length;
  assert.equal(west + east, tourists.length, "every tourist starts at an exit's kerb");
  assert.ok(west > 0.25 * tourists.length && east > 0.25 * tourists.length, `from both exits (west ${west}, east ${east})`);
  assert.equal(ts.filter(d => d.id === RANGE.id).length, 0, "the range's golfers are the main thread's (P24 D2): no worker cars");
});

test("a range start: over its first game days the clubhouse's cars from both exits arrive at its door and the takings are booked", () => {
  const city = roadCity('range'), planned = departures(city, 3).filter(d => d.id === CLUB.id).length;
  for (let s = 0; s < 240; s++) city.step(10);
  const st = city.bizView().find(b => b.id === CLUB.id)!, type = BUSINESS.clubhouse, arrived = st.visitors;
  assert.ok(planned > 0 && arrived > 0, `${arrived} of ${planned} cars arrived`);
  // the cars split between the exits (the test above), so most arriving means cars from both arrived
  assert.ok(arrived >= 0.75 * planned, `most of the cars arrived (${arrived} of ${planned})`);
  assert.equal(st.revenue, arrived * type.pricePerVisitor * type.party, 'each arrival booked its party at the price');
});

test("a classic game and an old golf start keep one entry: the tourists start at the entry's kerb only", () => {
  for (const g of [null, 'old'] as const) {
    const city = roadCity(g, [CLUB]), tourists = departures(city, 3).filter(d => d.id === CLUB.id && d.lot === null);
    assert.ok(tourists.length > 0, `${g ?? 'classic'}: tourists planned`);
    assert.ok(tourists.every(d => startX(city, d) < 20), `${g ?? 'classic'}: all from the entry (exit A)`);
  }
});

test('the range draws RANGE_PASS_POP a map exit and plans with zero residents: its golfers turn in from both ways along the county road, the takings booked', () => {
  const s = defaultRangeBiz(), base = { tier: 1, residents: 0, propsAppeal: 0, practiceAppeal: 0 };
  assert.ok(RANGE_PASS_POP(1) > 0);
  assert.ok(Math.abs(dayDemand(s, { ...base, exits: 2 }) - 2 * dayDemand(s, { ...base, exits: 1 })) < 1e-9, 'two exits draw twice one');
  // the range on a plot by the road (as tests/range-car-gap.test.ts), its car park's bays, a town day from 06:00 to closing
  const P: Rect = [200, 200, 70, 150], entrance = { x: P[0] + 72, y: P[1] + 9 }, slots: CarSlot[] = bayGrid({ id: 1, x: P[0] + 49, y: P[1] + 2, w: 20, h: 16 }, 0, [entrance]);
  const sc = rangeScene(P, 2, s), sim = new RangeSim(5, 10), DAY = 600, HOUR = DAY / 24;
  sim.setScene(sc, slots, entrance);
  const seen = new Set<number>(), side = { a: 0, b: 0 };
  type V = { id: number; x: number; y: number };
  for (let h = 6; h < 22; h++) for (let t = 0; t < HOUR; t += 0.1) {
    sim.step(0.1, { hour: h + t / HOUR, day: 1 }, s, { ...base, exits: 2 }, DAY);
    for (const v of (sim as unknown as { visits: V[] }).visits) {
      if (seen.has(v.id)) continue; seen.add(v.id);
      const along = (v.x - sc.J.x) * sc.roadDir.x + (v.y - sc.J.y) * sc.roadDir.y;
      if (along < -10) side.a++; else if (along > 10) side.b++;
    }
  }
  assert.ok(sim.today.golfers > 10, `golfers served (${sim.today.golfers})`);
  assert.ok(side.a > 0.25 * seen.size && side.b > 0.25 * seen.size, `cars from both ways along the road (${side.a} and ${side.b} of ${seen.size})`);
  assert.ok(s.season.takings > 0, `the takings booked ($${s.season.takings})`);
});
