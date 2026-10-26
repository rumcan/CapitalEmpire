// The course gates (LEAD.md M2.1): event/crowd.ts gate queues: fans walk to a gate, queue, are admitted at the gate's rate, and the waits are measured.
// The galleries in the day (T051b, at the end): the City moves the fans every 30 game minutes toward the featured holes, and draws the arrivals by them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Crowd } from '../src/game/event/crowd';
import { City } from '../src/game/city';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { MAP } from '../src/game/iso';
import { jumpTo } from '../src/game/sim/townclock';
import type { GallerySpot } from '../src/game/golf/galleries';

// the City's galleries need the Path2D painters of the network: in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

test('gates: a walker group bound for a gate queues there; admit lets fans in in order (splitting a party) and counts them inside', () => {
  const C = new Crowd(2, 0); C.setGates(2);
  C.now = 10;
  C.add({ x: 0, y: 0, tx: 3, ty: 4, n: 3, town: 0, stage: 2, route: 1 });
  C.add({ x: 0, y: 0, tx: 0, ty: 1, n: 3, town: 1, stage: 2, route: 1 });
  C.step(2);
  assert.equal(C.atGate(1), 3, 'the near group queues at once');
  C.step(5);
  assert.equal(C.atGate(1), 6, 'the far one joins behind it');
  let c = C.counts();
  assert.deepEqual(c.atGate, [3, 3]); assert.deepEqual(c.fans, [0, 0]);
  C.now = 20;
  assert.equal(C.admit(1, 4), 4);
  c = C.counts();
  // the near group (town 1) reached the gate first, so it is at the head of the queue
  assert.deepEqual(c.fans, [1, 3], 'the head party first, then part of the next'); assert.deepEqual(c.atGate, [2, 0]);
  assert.equal(C.admit(1, 10), 2); assert.equal(C.admit(0, 10), 0);
  assert.equal(C.gate.admitted, 6);
  assert.ok(C.gate.waitMax === 10 && C.gate.waitSum === 60, `waits: ${JSON.stringify(C.gate)}`);
});

test('gates: a group bound for a gate that is not there goes inside at once; the counts add up', () => {
  const C = new Crowd(1, 0);
  C.add({ x: 0, y: 0, tx: 0, ty: 0.5, n: 3, town: 0, stage: 2, route: 4 });
  C.step(1);
  const c = C.counts();
  assert.deepEqual(c.fans, [3]); assert.deepEqual(c.atGate, [0]);
});

test('galleries in the crowd: fans in (through a gate or a door) go on as a stage 3 group to their spot and stand there', () => {
  const C = new Crowd(1, 0); C.setGates(1); C.setSpots(2);
  const ins: [number, number, number, number][] = [];
  C.onIn = (town, n, x, y) => { ins.push([town, n, x, y]); C.add({ x, y, tx: x + 2, ty: y, n, town, stage: 3, route: 1 }); };
  C.add({ x: 0, y: 0, tx: 0, ty: 1, n: 3, town: 0, stage: 2, route: 0 });
  C.add({ x: 0, y: 0, tx: 1, ty: 0, n: 3, town: 0, stage: 1, route: -1 });
  C.step(1.5);
  assert.deepEqual(ins, [[0, 3, 1, 0]], 'the door group is in at its door'); assert.equal(C.atGate(0), 3);
  assert.equal(C.admit(0, 10, 5, 5), 3);
  assert.deepEqual(ins[1], [0, 3, 5, 5], 'admitted at the gate');
  C.step(3);
  assert.deepEqual(C.gallery, [0, 6]); assert.deepEqual(C.counts().fans, [6], 'inside counts them once');
});

test('going home: a stage 4 group walks back to its car\'s bay and calls onBack with the car', () => {
  const C = new Crowd(2, 0), back: [number, number][] = [];
  C.onBack = (town, route) => back.push([town, route]);
  C.add({ x: 0, y: 0, tx: 4, ty: 0, n: 3, town: 1, stage: 4, route: 7 });
  C.step(2); assert.deepEqual(back, []);
  C.step(3); assert.deepEqual(back, [[1, 7]]);
  assert.deepEqual(C.counts().fans, [0, 0], 'leaving is not arriving');
});

test('late (P02/T050): with lateAt, a fan admitted after it is late whatever the wait, and one admitted by it is not; with none, a wait over the grace is', () => {
  const C = new Crowd(1, 0); C.setGates(1); C.lateAt = 100;
  C.now = 0; C.add({ x: 0, y: 0, tx: 0, ty: 0, n: 3, town: 0, stage: 2, route: 0 }); C.step(1);
  C.now = 90; C.admit(0, 3);
  assert.deepEqual([C.gate.admitted, C.gate.late], [3, 0], 'admitted at 90, before lateAt: on time');
  C.now = 0; C.add({ x: 0, y: 0, tx: 0, ty: 0, n: 3, town: 0, stage: 2, route: 0 }); C.step(1);
  C.now = 110; C.admit(0, 3);
  assert.deepEqual([C.gate.admitted, C.gate.late], [6, 3], 'admitted at 110, after lateAt: late');
  // no lateAt: the old rule, a wait over the grace is late
  const D = new Crowd(1, 0); D.setGates(1); D.grace = 45;
  D.now = 0; D.add({ x: 0, y: 0, tx: 0, ty: 0, n: 3, town: 0, stage: 2, route: 0 }); D.step(1);
  D.now = 50; D.admit(0, 3);
  assert.deepEqual([D.gate.admitted, D.gate.late], [3, 3], 'waited 50 over the grace of 45: late');
});

/** a golf city with a street (the network the City's crowd is set on, as the bus tests build it) and the golf mode on */
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

/** three greens of a three-hole course, weight and room alike; the spots of holes 2 and 3 are a few tiles from hole 1's */
const GREENS: GallerySpot[] = [
  { x: 300, y: 250, kind: 'green', weight: 3, cap: 400, hole: 1, fx: 300, fy: 260, ax: 300, ay: 260 },
  { x: 305, y: 250, kind: 'green', weight: 3, cap: 400, hole: 2, fx: 305, fy: 260, ax: 305, ay: 260 },
  { x: 300, y: 255, kind: 'green', weight: 3, cap: 400, hole: 3, fx: 300, fy: 265, ax: 300, ay: 265 },
];

test('galleries in the day (T051b): at a 30-minute mark the fans leave an over-full spot as a stage 3 walker to the featured green; every fan is still counted', () => {
  const city = golfCity();
  city.setSpots(GREENS); city.setFeatured([3]);
  assert.equal(city.round.start([0]), true, 'the round starts');
  assert.equal(city.startNow(), true, 'the surge begins');
  const C = city.crowd!;
  C.gallery[0] = 300;
  const total = () => C.gallery.reduce((a, b) => a + b, 0) + C.walking().reduce((a, b) => a + b, 0);
  // not on the tournament day: no moves
  city.step(1);
  assert.equal(C.walkers.length, 0, 'the fans stay off the tournament day');
  // 08:00 (a 30-minute mark), a game minute per sim second: hole 1's spot is over its share and hole 3 is featured
  city.tourneyDay = true;
  city.sim.town = jumpTo(city.sim.town, city.sim.t, 480, 1);
  city.step(1);
  assert.deepEqual(C.walkers.map(w => [w.stage, w.route, w.n]), [[3, 2, 75]], 'a quarter of the 300 fans walk to hole 3\'s green');
  assert.deepEqual(C.gallery, [225, 0, 0], 'they are off their spot at once');
  assert.equal(total(), 300);
  // a step is DT (0.1 s) of sim time and a game minute (the clock's rate): the walk of ~9 tiles lands in under 130 steps, before the next 30-minute mark (300 steps)
  for (let k = 0; k < 250 && C.walkers.length; k++) { city.step(1); assert.equal(total(), 300, `the fans added up after ${k + 1} steps`); }
  assert.equal(C.walkers.length, 0, 'the walk is over');
  assert.deepEqual(C.gallery, [225, 0, 75], 'they stand at the featured green once they arrive');
  assert.equal(total(), 300);
});

test('galleries in the day (T051b): an arriving party picks its spot by the draw, so the featured green takes most of them', () => {
  const city = golfCity();
  city.setSpots(GREENS); city.setFeatured([3]);
  assert.equal(city.round.start([0]), true, 'the round starts');
  assert.equal(city.startNow(), true, 'the surge begins');
  const C = city.crowd!;
  // the draws with hole 3 featured: 3, 3 and 9 (its bump), so about three in five parties go to it
  for (let k = 0; k < 300; k++) C.onIn?.(0, 1, 0, 0);
  const got = [0, 0, 0];
  for (const w of C.walkers) got[w.route]!++;
  assert.ok(got[2]! > 150, `the featured green took ${got[2]} of 300 parties (${got})`);
});
