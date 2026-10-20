// The taxi company in the City (Phase B step 5, ext/taxi.ts driven as sim cars): setBusinesses sets the dispatcher up with a rank at the company's
// door; a game day's requests are posted, the dispatcher's orders drive taxi cars (the sim's taxi tag), each ride is a served fare booked to the
// company's revenue and the ledger's business line; a taken-away company drops its taxis and their cars. npm test (bundled by esbuild, run by node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { City } from '../src/game/city';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { MAP } from '../src/game/iso';
import type { BizDef } from '../src/game/business/state';
import type { Ledger } from '../src/game/budget';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
/** three town centres on open ground (tiles), the first one in the middle of the street grid below */
const CENTRES = [{ x: 300, y: 300 }, { x: 1000, y: 400 }, { x: 600, y: 1000 }];
/** the street grid: the roads at 160, 200, ... 440 tiles, both ways, on the first centre */
const GRID = Array.from({ length: 8 }, (_, k) => 160 + 40 * k);
/** the taxi company beside the grid road at y 360 (6 tiles off it, 4 off the road at x 320): it covers no road line */
const TAXI: BizDef = { id: 7, type: 'taxi', x: 300, y: 366, w: 16, h: 12 };

/** a City on open ground with the street grid around the first centre, its towns stamped (homes built), and the given businesses placed */
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

/** the taxi cars alive in the sim (slots with the taxi tag) */
function taxiCars(city: City): number[] {
  const out: number[] = [];
  for (let i = 0; i < city.sim.cap; i++) if (city.sim.alive[i] && city.sim.taxi[i]! >= 0) out.push(i);
  return out;
}

test('setBusinesses with a taxi company sets its dispatcher up: six taxis, each at a rank on the road by the company', () => {
  const city = gridCity([TAXI]);
  assert.ok(city.taxis, 'the taxi company has a dispatcher');
  const at = (city as unknown as { taxiAt: { x: number; y: number }[] }).taxiAt;
  assert.equal(at.length, 6, 'six taxis');
  for (const p of at) assert.ok(Math.hypot(p.x - 308, p.y - 372) < 14, `a taxi at its rank (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) by the company`);
});

test('a game day: the company\'s rides are served and booked (revenue = the dispatcher\'s, within $1, the ledger\'s business line too)', () => {
  const city = gridCity([TAXI]);
  const T = city.taxis!;
  // the requests posted, and the orders the dispatcher issues (counted by wrapping its two entry points)
  let posted = 0, pickups = 0, drops = 0, ranks = 0;
  const req = T.request.bind(T), stepT = T.step.bind(T);
  T.request = (r) => { posted++; req(r); };
  T.step = (t, reached) => { const o = stepT(t, reached); for (const x of o) { if (x.kind === 'pickup') pickups++; else if (x.kind === 'dropoff') drops++; else ranks++; } return o; };
  // the taxi cars spawned, and the spawns refused (no room, or lost at once)
  let spawned = 0, refused = 0;
  const spawnAt = city.sim.spawnAt.bind(city.sim);
  city.sim.spawnAt = (...a: Parameters<typeof spawnAt>) => { const r = spawnAt(...a); if (a[8]! >= 0) { if (r >= 0) spawned++; else refused++; } return r; };
  let ledger: Ledger | null = null, businessLine = 0;
  for (let i = 0; i < 4000 && !ledger; i++) {
    const r = city.step(10);
    if (r.ledger) { ledger = r.ledger; businessLine = r.ledger.business; }
  }
  assert.ok(ledger, 'a game day closed');
  const stats = T.stats();
  const s = city.bizView().find(b => b.id === TAXI.id)!;
  console.log(`taxi day: requests ${posted}, pickups ${pickups}, drop-offs ${drops}, rank returns ${ranks}, car spawns ${spawned} (refused ${refused}), ` +
    `served ${stats.served}, gave up ${stats.gaveUp}, revenue $${stats.revenue.toFixed(2)}, costs $${stats.costs.toFixed(2)}, mean wait ${stats.meanWait.toFixed(1)} s`);
  assert.ok(posted > 0, `requests were posted (${posted})`);
  assert.ok(stats.served > 0, `rides were served (${stats.served}; ${posted} requests, ${spawned} car spawns)`);
  assert.ok(Math.abs(s.revenue - stats.revenue) <= 1, `the company's revenue ${s.revenue.toFixed(2)} is the dispatcher's ${stats.revenue.toFixed(2)}`);
  assert.equal(s.visitors, stats.served, 'the company\'s visitors are the rides served');
  assert.ok(Math.abs(businessLine - s.revenue) <= 1, `the ledger's business line ${businessLine} includes the takings ${s.revenue.toFixed(2)}`);
});

test('setBusinesses without the company drops its taxis: no dispatcher, and no taxi car left in the sim', () => {
  const city = gridCity([TAXI]);
  for (let i = 0; i < 300; i++) city.step(10);
  city.setBusinesses([]);
  assert.equal(city.taxis, null, 'no dispatcher without the company');
  assert.equal(taxiCars(city).length, 0, 'no taxi car is left alive');
});
