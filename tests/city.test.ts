// The city class (Phase 3 step 7), headless: a small street grid fed to a City as net ops grows built lots over 3 game days, and
// the town lays gravel legs back when it is short of land (fed back as net ops, as the engine does).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { City } from '../src/game/city';
import { MAP } from '../src/game/iso';
import { builtLots } from '../src/game/lots/town';
import type { Ledger } from '../src/game/budget';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

/** a 3 x 3 grid of streets, 40 tiles apart, from O; the entry at the corner; a dead-end street runs on from the far corner (the
 *  planner continues it when the town is short of land: the grid alone has no valid extension) */
const O = 40, STEP = 40, N = 3, at = (k: number) => O + k * STEP, last = at(N - 1);
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });

/** the street grid and its dead-end street as an editor (the ops of the first batch are committed by the test) */
function gridEditor(): NetEditor {
  const e = new NetEditor(new RoadNetwork());
  for (let k = 0; k < N; k++) {
    e.addLegs([leg(O, at(k), last, at(k))], CLASS.street, 0);
    e.addLegs([leg(at(k), O, at(k), last)], CLASS.street, 0);
  }
  e.addLegs([leg(last, last, last + 120, last)], CLASS.street, 0);
  return e;
}

test('a city fed a street grid grows built lots over 3 game days and lays gravel when short of land', () => {
  const e = gridEditor();
  const city = new City(7);
  city.terrain(new Uint8Array(MAP * MAP), { x: O, y: O }, 7);
  const first = city.netOps(e.commit(true));
  assert.ok(first.lotsAdded.length > 0, 'the grid has parcels');
  assert.equal(city.lanes > 0, true, 'the grid has lanes');

  let builds = 0, grows = 0, gravelLegs = 0;
  for (let s = 0; s < 3 * 1440; s++) {
    const r = city.step(10);
    for (const ev of r.events) if (ev.kind === 'build') builds++;
    if (r.grow) {
      grows++; gravelLegs += r.grow.length;
      e.addLegs(r.grow, CLASS.gravel, 2);
      city.netOps(e.commit());
    }
  }
  const built = builtLots(city.town, city.lots).length;
  assert.ok(builds > 0, `lots were started (${builds} builds)`);
  assert.ok(built > 0, `built lots after 3 game days (${built})`);
  assert.ok(grows > 0 && gravelLegs > 0, `gravel legs laid when short of land (${grows} extensions)`);
  assert.ok(city.town.pop > 0, 'the town has residents');
});

test('a city books its first game day when the sim clock passes 1440 s: one ledger, with road upkeep', () => {
  const city = new City(7);
  city.terrain(new Uint8Array(MAP * MAP), { x: O, y: O }, 7);
  city.netOps(gridEditor().commit(true));
  const ledgers: Ledger[] = [];
  for (let s = 0; s < 1450; s++) { const r = city.step(10); if (r.ledger) ledgers.push(r.ledger); }
  assert.equal(ledgers.length, 1, 'one game day closed');
  assert.equal(ledgers[0]!.day, 1, 'the ledger is day 1');
  assert.ok(ledgers[0]!.upkeep > 0, `road upkeep booked (${ledgers[0]!.upkeep})`);
  assert.equal(city.budget.history.length, 1, 'one ledger in the books');
});
