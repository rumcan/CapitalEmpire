// The way along the roads (src/game/road-route.ts; the owner, 2026-11-01: the range's cars drove straight over the course to a new car park):
// the shortest drive on the car roads, never by a cart path, and none when an end is off the roads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { roadRoute } from '../src/game/road-route';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
const lenOf = (p: { x: number; y: number }[]) => p.slice(1).reduce((s, q, i) => s + Math.hypot(q.x - p[i]!.x, q.y - p[i]!.y), 0);

/** a county road along y 0, a side street up x 50 to a car park at (50, 60), and a cart path straight from (0, 0) to it */
function town(): RoadNetwork {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(0, 0, 100, 0), leg(50, 0, 50, 60)], CLASS.street, 0);
  e.addLegs([leg(0, 0, 50, 60)], CLASS.cart!, 0);
  e.commit(true);
  return e.net;
}

test('the drive goes along the roads (the county road, then the side street), never by the cart path across', () => {
  const r = roadRoute(town(), { x: 0, y: 1 }, { x: 51, y: 58 })!;
  assert.ok(r, 'a route');
  assert.deepEqual(r[0], { x: 0, y: 0 }, 'from the road at the start');
  assert.ok(r.some(p => Math.abs(p.x - 50) < 1e-6 && Math.abs(p.y) < 1e-6), 'by the junction at (50, 0)');
  assert.ok(Math.abs(r[r.length - 1]!.x - 50) < 1e-6 && Math.abs(r[r.length - 1]!.y - 58) < 1e-6, 'to the side street by the car park');
  assert.ok(Math.abs(lenOf(r) - 108) < 1e-6, `the road way, 108 tiles (the cart path would be 78): ${lenOf(r)}`);
});

test('no route when an end is off the roads; one road: straight along it', () => {
  assert.equal(roadRoute(town(), { x: 0, y: 1 }, { x: 90, y: 60 }), null, 'the far end is 40 tiles from any road');
  const r = roadRoute(town(), { x: 60, y: 1 }, { x: 90, y: -1 })!;
  assert.equal(r.length, 2); assert.ok(Math.abs(lenOf(r) - 30) < 1e-6);
});

test('an end on a junction is that junction once (no leg of no length)', () => {
  const r = roadRoute(town(), { x: 50, y: 0 }, { x: 50, y: 58 })!;
  assert.deepEqual(r, [{ x: 50, y: 0 }, { x: 50, y: 58 }]);
  const s = roadRoute(town(), { x: 0, y: 0 }, { x: 50, y: 58 })!;
  for (let i = 1; i < s.length; i++) assert.ok(Math.hypot(s[i]!.x - s[i - 1]!.x, s[i]!.y - s[i - 1]!.y) > 1e-6, `leg ${i} has a length`);
});
