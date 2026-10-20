// The visit businesses' day (Phase B step 3, business/visits.ts): plan makes the day's departures from the homes, in the opening hours, from `from` on;
// a visit business's door is on the road beside it (none far from a road); a game day's cars arrive, book their takings (revenue = visitors * price *
// party, the ledger's business line, the bar's upkeep), and the day's close resets today and moves satisfaction; a business taken away drops its cars.
// npm test (bundled by esbuild, run by node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { City } from '../src/game/city';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { MAP } from '../src/game/iso';
import { laneAt } from '../src/game/sim/lanes';
import type { Lot } from '../src/game/lots/lots';
import { Visits, type VisitBiz, type VisitHome } from '../src/game/business/visits';
import { BUSINESS, START_SAT, dailyDemand } from '../src/game/business/catalogue';
import type { BizDef } from '../src/game/business/state';
import { GAME_DAY, type Ledger } from '../src/game/budget';
import { seededRnd } from '../src/game/lots/roads';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
/** three town centres on open ground (tiles), the first one in the middle of the street grid below */
const CENTRES = [{ x: 300, y: 300 }, { x: 1000, y: 400 }, { x: 600, y: 1000 }];
/** the street grid: the roads at 160, 200, ... 440 tiles, both ways, on the first centre */
const GRID = Array.from({ length: 8 }, (_, k) => 160 + 40 * k);
const BAR: BizDef = { id: 2, type: 'sportsbar', x: 300, y: 366, w: 14, h: 10 };
const FAR: BizDef = { id: 3, type: 'sportsbar', x: 900, y: 900, w: 14, h: 10 };

/** a City on open ground with the street grid around the first centre, its towns stamped (homes built, so the day's plan has them), and the given businesses placed */
function gridCity(defs: BizDef[] = []): City {
  const city = new City(7);
  city.autoStadium = false;
  city.terrain(new Uint8Array(MAP * MAP), { x: 40, y: 40 }, 7, CENTRES);
  const e = new NetEditor(new RoadNetwork());
  for (const v of GRID) {
    e.addLegs([leg(GRID[0]!, v, GRID[GRID.length - 1]!, v)], CLASS.street, 0);
    e.addLegs([leg(v, GRID[0]!, v, GRID[GRID.length - 1]!)], CLASS.street, 0);
  }
  city.netOps(e.commit(true));
  city.stamp(300);
  city.setBusinesses(defs);
  return city;
}

test('plan: round(dailyDemand) departures, all in the opening hours, none before from; a business with no door plans none', () => {
  const day = 3 * GAME_DAY, lot = { key: 'h' } as unknown as Lot;
  const homes: VisitHome[][] = [[{ lot, town: 0, pop: 1000 }]];
  const type = BUSINESS.sportsbar, catchment = [{ pop: 1000, tripMin: 0 }];
  const want = Math.round(dailyDemand(type, 1, catchment, 0.8));
  const bar: VisitBiz = { id: 5, type, level: 1, sat: 0.8, door: { dseg: 0, s: 5 }, tripMin: [0] };
  const v = new Visits();
  v.plan(day, day, [bar], homes, [1000], seededRnd(11));
  const ts = v.schedule();
  assert.equal(ts.length, want, 'the day\'s demand, rounded');
  assert.equal(v.counts(5).planned, want);
  for (const d of ts) {
    assert.ok(d.t >= day + 16 * 60 && d.t < day + 24 * 60, `departure ${d.t} inside the hours`);
    assert.equal(d.id, 5);
    assert.equal(d.lot, lot);
  }
  assert.deepEqual(ts.map(d => d.t), [...ts].map(d => d.t).sort((a, b) => a - b), 'in time order');

  const later = new Visits();
  const from = day + 20 * 60;
  later.plan(day, from, [bar], homes, [1000], seededRnd(11));
  assert.ok(later.schedule().every(d => d.t >= from), 'none before from');
  assert.ok(later.schedule().length < want, 'the hours before from are not kept');

  const none = new Visits();
  none.plan(day, day, [{ ...bar, id: 6, door: null }], homes, [1000], seededRnd(11));
  assert.equal(none.schedule().length, 0, 'no door, no cars');
});

test('drop: a demolished business\'s cars go, the others stay', () => {
  const day = GAME_DAY, lot = { key: 'h' } as unknown as Lot;
  const homes: VisitHome[][] = [[{ lot, town: 0, pop: 1000 }]];
  const v = new Visits();
  const mk = (id: number): VisitBiz => ({ id, type: BUSINESS.sportsbar, level: 1, sat: 0.8, door: { dseg: 0, s: 5 }, tripMin: [0] });
  v.plan(day, day, [mk(5), mk(6)], homes, [1000], seededRnd(3));
  assert.ok(v.schedule().some(d => d.id === 5), 'business 5 has cars');
  assert.ok(v.schedule().some(d => d.id === 6), 'business 6 has cars');
  v.drop(5);
  assert.equal(v.schedule().some(d => d.id === 5), false, 'no cars of business 5 are left');
  assert.ok(v.schedule().some(d => d.id === 6), 'business 6 keeps its cars');
  assert.equal(v.counts(5).planned, 0, 'its counts go with it');
});

test('bizDoor: a bar beside a road gets a door on it; a bar far from every road gets none', () => {
  const city = gridCity([BAR, FAR]);
  const bizDoor = (b: BizDef) => (city as unknown as { bizDoor(b: BizDef): { dseg: number; s: number } | null }).bizDoor(b);
  const door = bizDoor(BAR);
  assert.ok(door, 'the bar by the road has a door');
  const d = city.g.dsegs[door!.dseg]!, ln = city.g.lanes[d.lanes[d.lanes.length - 1]!]!, q = { x: 0, y: 0, hx: 0, hy: 0 };
  laneAt(ln, door!.s, q);
  assert.ok(Math.abs(q.y - GRID[5]!) <= 6 || Math.abs(q.x - GRID[4]!) <= 6, `the door (${q.x.toFixed(1)}, ${q.y.toFixed(1)}) is on a road within 6 tiles`);
  assert.equal(bizDoor(FAR), null, 'a bar far from any road has no door');
});

test('a game day: the bar\'s cars arrive; its takings are revenue = visitors * price * party, in the ledger\'s business line, the upkeep has its 200; the close resets today and moves satisfaction', () => {
  const city = gridCity([BAR]);
  const type = BUSINESS.sportsbar, per = type.pricePerVisitor * type.party;
  let ledger: Ledger | null = null;
  for (let i = 0; i < 4000 && !ledger; i++) ledger = city.step(10).ledger;
  assert.ok(ledger, 'a game day closed');
  const s = city.bizView().find(b => b.id === BAR.id)!;
  assert.ok(s.visitors > 0, `the bar had visitors (${s.visitors})`);
  assert.equal(s.revenue, s.visitors * per, 'revenue = visitors * price * party');
  assert.equal(ledger!.business, s.revenue, 'the ledger\'s business line is the takings');
  assert.ok(ledger!.upkeep >= type.upkeepPerDay, `the upkeep includes the bar's ${type.upkeepPerDay}`);
  assert.equal(s.today.visitors, 0, 'today is reset at the close');
  assert.equal(s.today.revenue, 0);
  assert.notEqual(s.sat, START_SAT, 'satisfaction moved toward the day\'s score');
});

test('setBusinesses: a placed bar has its cars planned; a taken-away one has none left', () => {
  const city = gridCity([BAR]);
  assert.ok(city.visits.schedule().some(d => d.id === BAR.id), 'the bar has cars planned');
  city.setBusinesses([]);
  assert.equal(city.visits.schedule().some(d => d.id === BAR.id), false, 'a demolished bar\'s cars are dropped');
});

test('a bar beside a road not joined to the towns\' roads (in the same routing zone) plans no cars, so none are lost', () => {
  const city = new City(7);
  city.autoStadium = false;
  city.terrain(new Uint8Array(MAP * MAP), { x: 40, y: 40 }, 7, CENTRES);
  const e = new NetEditor(new RoadNetwork());
  for (const v of GRID) {
    e.addLegs([leg(GRID[0]!, v, GRID[GRID.length - 1]!, v)], CLASS.street, 0);
    e.addLegs([leg(v, GRID[0]!, v, GRID[GRID.length - 1]!)], CLASS.street, 0);
  }
  // a short street east of the grid, in the zone of the grid's east edge, joined to nothing
  e.addLegs([leg(470, 380, 530, 380)], CLASS.street, 0);
  city.netOps(e.commit(true));
  city.stamp(300);
  const island: BizDef = { id: 4, type: 'sportsbar', x: 488, y: 386, w: 14, h: 10 };
  city.setBusinesses([island]);
  const bizDoor = (city as unknown as { bizDoor(b: BizDef): { dseg: number; s: number } | null }).bizDoor(island);
  assert.ok(bizDoor, 'the island bar has a door on its own street');
  assert.equal(city.visits.schedule().length, 0, 'no town can reach it: no cars planned');
});
