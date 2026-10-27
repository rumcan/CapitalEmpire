// T209 (#554): the owner's tournament round resumes after a reload. Reproduction: a golf City plays its tournament day to 09:30, the save is what the
// engine writes (the lots, the sim time and the clock's shift, the town clock, the round, the books), and a second City loads it the way the city worker
// does (restore, loadRound, the townClock message). The day must come back as it was: the round in its surge, the town clock at the same minute and
// at a game minute per sim second. npm test (bundled by esbuild, run by node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { City } from '../src/game/city';
import { MAP } from '../src/game/iso';
import { GAME_DAY } from '../src/game/budget';
import { LV, type LotTuple } from '../src/game/lots/town';
import { retime, townTimeOf } from '../src/game/sim/townclock';
import type { CarParkDef } from '../src/game/event/carpark';
import type { BizDef } from '../src/game/business/state';
import type { GallerySpot } from '../src/game/golf/galleries';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });

/** the street's centre line (x 200 to 800) and the town's cross streets north of it (as bus.test.ts lays them) */
const ROAD_Y = 300;
const PARK: CarParkDef = { id: 1, x: 400, y: 285, w: 30, h: 12 };
const CLUB: BizDef = { id: 1, type: 'clubhouse', x: 600, y: 310, w: 40, h: 24 };
const GREENS: GallerySpot[] = [
  { x: 640, y: 380, kind: 'green', weight: 3, cap: 400, hole: 1, fx: 640, fy: 390, ax: 640, ay: 390 },
  { x: 680, y: 380, kind: 'green', weight: 3, cap: 400, hole: 2, fx: 680, fy: 390, ax: 680, ay: 390 },
  { x: 660, y: 420, kind: 'green', weight: 5, cap: 800, hole: 3, fx: 660, fy: 430, ax: 660, ay: 430 },
];

/** the world both cities share: one town along the street, the car park, the clubhouse (the site), a gate and three greens' galleries, golf on.
 *  stamp: the town is built here (the first city); the second city's town comes from the save instead */
function world(stamp: boolean): City {
  const city = new City(3);
  city.autoStadium = false;
  city.terrain(new Uint8Array(MAP * MAP), { x: 200, y: ROAD_Y }, 7, [{ x: 300, y: ROAD_Y }]);
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(200, ROAD_Y, 800, ROAD_Y)], CLASS.street, 0);
  for (const x of [220, 260, 340, 380, 460, 500]) e.addLegs([leg(x, ROAD_Y, x, 120)], CLASS.street, 0);
  e.addLegs([leg(220, 120, 500, 120)], CLASS.street, 0);
  city.netOps(e.commit(true));
  if (stamp) city.stamp(30);
  city.setParks([PARK]);
  city.setBusinesses([CLUB]);
  city.setGolf({ tier: 1, rep: 40 });
  city.setGates([{ x: 620, y: 305, lanes: 2 }]);
  city.setSpots(GREENS);
  return city;
}

/** the town minute of the day now */
const minute = (c: City) => townTimeOf(c.sim.town, c.sim.t).dayMin;

/** what the engine's save keeps of the city (Engine.save: lots, simT, shift, townClock, budget, career, round), through JSON as the save is */
function saveOf(c: City) {
  const lots: LotTuple[] = [...c.town.states.values()].filter(s => s.level !== LV.EMPTY).map(s => [s.key, s.use, s.level, s.decline, s.seed, s.since]);
  return JSON.parse(JSON.stringify({ lots, simT: c.sim.t, shift: c.sim.clock - c.sim.t, townClock: c.sim.town, budget: c.booksSave(), money: c.budget.money, career: c.career.toJSON(), round: c.roundView() }));
}

test('T209 repro: a save made at 09:30 on the tournament day loads as the same day (the round in its surge, the clock at 09:30 running a minute a second)', () => {
  const a = world(true);
  a.step(1);
  // 30 s short of the day's boundary: the season ends there and the tournament day starts (05:00, a game minute per sim second)
  a.sim.shift = GAME_DAY - 30 - a.sim.t;
  for (let k = 0; k < 100 && a.round.stage === 'free'; k++) a.step(10);
  assert.equal(a.round.stage, 'surge', 'the tournament day is under way');
  assert.equal(a.tourneyDay, true);
  while (minute(a) < 570) a.step(10);
  const s = saveOf(a), m = minute(a);

  // the load, as the city worker does it: townState (restore, loadRound), then townClock
  const b = world(false);
  b.restore(s.lots, s.simT, s.budget, s.money, s.career, s.shift);
  b.loadRound(s.round);
  b.sim.town = retime(s.townClock, b.sim.t, 1440 / b.sim.dayLen); b.tourneyDay = false;

  assert.equal(b.round.stage, 'surge', 'the round is still in its surge after the load');
  assert.equal(b.tourneyDay, true, 'the tournament day runs on');
  assert.ok(Math.abs(minute(b) - m) < 1e-6, `the town reads the save's minute (${minute(b)} vs ${m})`);
  assert.equal(b.sim.town.rate, 1, 'a game minute per sim second');
});
