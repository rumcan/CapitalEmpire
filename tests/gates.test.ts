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
  assert.deepEqual(c.fans, [3, 1], 'the head party first, then part of the next'); assert.deepEqual(c.atGate, [0, 2]);
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
