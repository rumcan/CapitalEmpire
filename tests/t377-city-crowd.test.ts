// T377 (#1033, the owner: "fix spectators walking in step 3 at a time and over water, greens, fairways or tee boxes"): the City's crowd on a golf day with a walk
// field (golf/walkfield.ts, set from the engine by City.setWalkField): the fans going to a gallery spot walk a way round the pond and the green, to ground a
// spectator may stand on, each group at a pace of its own; the ways are worked out a few a step; the frame's walker buffer has its 7 floats (x, y, n, stage, the
// point it is heading for now, id). The same day with no field walks them straight across (the tests above in t377-spectators-carts.test.ts say so for the crowd alone).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { City } from '../src/game/city';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { MAP } from '../src/game/iso';
import { WALK_STRIDE } from '../src/game/event/crowd';
import { G, SPECTATOR, SPECTATOR_GROW, SPECTATOR_WATER_GROW, dilate, groundAt, passable } from '../src/game/golf/walkfield';
import { buildWalkField } from '../src/game/golf/walkground';
import type { GallerySpot } from '../src/game/golf/galleries';

// the City's galleries need the Path2D painters of the network: in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

/** a golf city with a street and the golf mode on (as tests/gates.test.ts) */
function golfCity(): City {
  const city = new City(1);
  city.terrain(new Uint8Array(MAP * MAP), { x: 200, y: 300 }, 7);
  const e = new NetEditor(new RoadNetwork());
  const street: Leg = { a: { x: 200, y: 300 }, b: { x: 600, y: 300 } };
  e.addLegs([street], CLASS.street, 0);
  city.netOps(e.commit(true));
  city.setGolf({ tier: 1, rep: 0 });
  return city;
}
/** the spots: three greens beyond a pond (x 240 to 260, y 220 to 330) from the gate at (210, 300); the first spot is the middle of a green (x 296 to 304, y 246 to 254) */
const SPOTS: GallerySpot[] = [
  { x: 300, y: 250, kind: 'green', weight: 3, cap: 400, hole: 1, fx: 300, fy: 260, ax: 300, ay: 260 },
  { x: 330, y: 250, kind: 'green', weight: 3, cap: 400, hole: 2, fx: 330, fy: 260, ax: 330, ay: 260 },
  { x: 330, y: 300, kind: 'green', weight: 3, cap: 400, hole: 3, fx: 330, fy: 310, ax: 330, ay: 310 },
];
const GATE = { x: 210, y: 300 };
const f0 = buildWalkField(150, 200, 450, 350, {
  surf: (x, y) => (x >= 296 && x < 304 && y >= 246 && y < 254 ? 8 : 1), wet: (x, y) => x >= 240 && x < 260 && y >= 220 && y < 330, ways: [], teeBoxes: [], holes: [],
});
const sf = dilate(f0, SPECTATOR_GROW, SPECTATOR_WATER_GROW);
const blocked = (x: number, y: number): boolean => { const g = groundAt(f0, x, y); return g === G.tee || g === G.green || g === G.bunker || g === G.water; };

/** the day: 30 parties in at the gate bound for the spots; the city stepped until they are all in place; what was seen on the way */
function day(withField: boolean) {
  const city = golfCity(); if (withField) city.setWalkField(sf);
  city.setSpots(SPOTS); city.setFeatured([1]);
  assert.equal(city.round.start([0]), true, 'the round starts'); assert.equal(city.startNow(), true, 'the surge begins');
  const C = city.crowd!; assert.ok(C, 'a crowd');
  for (let k = 0; k < 30; k++) C.onIn?.(0, 1, GATE.x, GATE.y);
  const targets = C.walkers.map(w => ({ x: w.tx, y: w.ty })), pace = C.walkers.map(w => w.v!);
  let steps = 0, places = 0, bad = 0, withWay = -1, distinct = -1, bufOk = true; const ids = new Set<number>();
  while (C.walkers.length && steps < 4000) {
    city.step(1); steps++;
    if (steps === 1) { const got = C.walkers.filter(w => w.via !== undefined); withWay = got.length; distinct = new Set(got.map(w => `${Math.floor(w.tx)},${Math.floor(w.ty)}`)).size; }
    const buf = city.walkBuf(); if (buf.length !== WALK_STRIDE * C.walkers.length) bufOk = false;
    C.walkers.forEach((w, i) => { places++; if (blocked(w.x, w.y)) bad++; ids.add(buf[WALK_STRIDE * i + 6]!); });
  }
  return { city, C, steps, places, bad, withWay, distinct, bufOk, ids, targets, pace };
}

test('T377: with a walk field the City\'s fans never walk on the pond or the green, stand off the green, and all arrive; the old straight walk crosses them', () => {
  const old = day(false);
  console.log(`# the City's crowd, no field: ${old.bad} of ${old.places} places of groups on the pond or the green`);
  assert.equal(old.C.walkers.length, 0, 'they all arrive'); assert.ok(old.bad > 20, `${old.bad} of ${old.places} places on the pond or the green (the check has teeth)`);
  assert.ok(old.targets.some(t => blocked(t.x, t.y)), 'and the first spot is on the green: they are sent to stand on it');
  const d = day(true);
  console.log(`# the City's crowd, with the field: ${d.bad} of ${d.places} places on the pond or the green, ${d.steps} steps, ${d.withWay} of 30 ways after the first step`);
  assert.equal(d.C.walkers.length, 0, `they all arrive (${d.steps} steps)`); assert.equal(d.bad, 0, `${d.bad} of ${d.places} places on a pond or a green`);
  assert.ok(d.targets.every(t => passable(sf, SPECTATOR, t.x, t.y)), 'every target is ground a spectator may stand on: the first spot\'s fans are sent to the edge of the green, not onto it');
  assert.deepEqual(d.C.gallery.reduce((a, b) => a + b, 0), 30, 'every fan is at a spot');
  assert.ok(d.steps > old.steps, `the way round the pond is longer than the straight one (${d.steps} steps, ${old.steps})`);
});

test('T377: the City works out a few ways a step, hands the frame\'s walker buffer its id, and gives each group a pace of its own', () => {
  const d = day(true);
  assert.ok(d.withWay >= 1 && d.withWay < 30, `${d.withWay} of 30 groups had their way after the first step: the rest wait`);
  assert.ok(d.distinct >= 1 && d.distinct <= 3, `and those are ${d.distinct} different ways at most (the budget is 3 units a step; a way worked out is given to all that need it)`);
  assert.ok(d.bufOk, 'the buffer has 7 floats a group'); assert.ok(d.ids.size >= 25, `${d.ids.size} different ids in the buffer`); assert.ok(!d.ids.has(0), 'every group has an id');
  assert.ok(new Set(d.pace.map(v => v.toFixed(3))).size >= 25, 'the paces differ'); assert.ok(Math.min(...d.pace) >= 0.85 && Math.max(...d.pace) <= 1.15, `${Math.min(...d.pace)} to ${Math.max(...d.pace)}`);
  // a day with no golf has no pace of its own for the fans: the old one walking speed (the surge of a town event, the bus tests)
  const town = new City(1); town.terrain(new Uint8Array(MAP * MAP), { x: 200, y: 300 }, 7);
  const e = new NetEditor(new RoadNetwork()); e.addLegs([{ a: { x: 200, y: 300 }, b: { x: 600, y: 300 } }], CLASS.street, 0); town.netOps(e.commit(true));
  assert.equal(town.round.start([0]), true); assert.equal(town.startNow(), true);
  town.crowd!.add({ x: 0, y: 0, tx: 5, ty: 0, n: 3, town: 0, stage: 1, route: -1 });
  assert.equal(town.crowd!.walkers[0]!.v, 1, 'an event that is not golf: the one walking speed');
});
