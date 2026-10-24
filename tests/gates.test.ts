// The course gates (LEAD.md M2.1): event/crowd.ts gate queues: fans walk to a gate, queue, are admitted at the gate's rate, and the waits are measured.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Crowd } from '../src/game/event/crowd';

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
