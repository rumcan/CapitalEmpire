// Headless tests for the bridge and tunnel split: npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SK, type Leg } from '../src/game/network';
import { highwayRoute, longestRun, splitByTerrain, structureLengths } from '../src/game/structures';
import { TC } from '../src/game/terrain/types';

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
const near = (v: number, want: number, tol = 0.3) => assert.ok(Math.abs(v - want) < tol, `${v} is not within ${tol} of ${want}`);
/** water for 10 <= x < 20, hill for 40 <= x < 60, ground elsewhere */
const landscape = (x: number) => (x >= 10 && x < 20 ? TC.WATER : x >= 40 && x < 60 ? TC.HILL : TC.GROUND);
/** water for 10 <= x < 20 and 21 <= x < 30: a 1 tile gap between the two */
const twinWater = (x: number) => ((x >= 10 && x < 20) || (x >= 21 && x < 30) ? TC.WATER : TC.GROUND);

test('a leg over water and a hill splits into ground, bridge, ground, tunnel, ground', () => {
  const { legs, kinds } = splitByTerrain([leg(0, 5, 80, 5)], 1, (x) => landscape(x));
  assert.deepEqual(kinds, [SK.GROUND, SK.BRIDGE, SK.GROUND, SK.TUNNEL, SK.GROUND]);
  near(legs[1].a.x, 8.5); near(legs[1].b.x, 21.5);
  near(legs[3].a.x, 40); near(legs[3].b.x, 60);
});

test('a 1 tile gap between two water crossings is absorbed into one bridge', () => {
  const { legs, kinds } = splitByTerrain([leg(0, 5, 80, 5)], 1, (x) => twinWater(x));
  assert.deepEqual(kinds, [SK.GROUND, SK.BRIDGE, SK.GROUND]);
  near(legs[1].a.x, 8.5); near(legs[1].b.x, 31.5);
});

test('a leg entirely on ground stays one ground leg, and the lengths add up', () => {
  const ground = () => TC.GROUND;
  const flat = splitByTerrain([leg(0, 5, 30, 5)], 1, ground);
  assert.equal(flat.legs.length, 1);
  assert.deepEqual(flat.kinds, [SK.GROUND]);
  assert.deepEqual(flat.legs[0], leg(0, 5, 30, 5));
  assert.deepEqual(structureLengths(flat.legs, flat.kinds), [30, 0, 0]);
  assert.equal(longestRun(flat.legs, flat.kinds, SK.BRIDGE), 0);
  assert.equal(longestRun(flat.legs, flat.kinds, SK.GROUND), 30);
  const split = splitByTerrain([leg(0, 5, 80, 5)], 1, landscape);
  const [g, b, t] = structureLengths(split.legs, split.kinds);
  near(b, 13, 1e-6); near(t, 20, 1e-6); near(g, 47, 1e-6);
  near(longestRun(split.legs, split.kinds, SK.BRIDGE), 13, 1e-6);
  near(longestRun(split.legs, split.kinds, SK.TUNNEL), 20, 1e-6);
});

test('the highway bends over the water to the target: 24 tiles straight in, then one right angle, the corner without hill', () => {
  const classAt = (x: number, y: number) => (y >= 50 && y < 60 ? TC.WATER : x >= 100 && y >= 100 ? TC.HILL : TC.GROUND);
  const pts = highwayRoute({ x: 0, y: 20, edge: 'W' }, { x: 80, y: 140 }, 3.75, classAt);
  assert.deepEqual(pts[0], { x: 0, y: 20 });
  assert.deepEqual(pts[1], { x: 24, y: 20 });
  assert.deepEqual(pts[pts.length - 1], { x: 80, y: 140 });
  for (let i = 1; i < pts.length; i++) assert.ok(pts[i].x === pts[i - 1].x || pts[i].y === pts[i - 1].y, 'a leg is not axis-aligned');
  const legs: Leg[] = []; for (let i = 1; i < pts.length; i++) legs.push({ a: pts[i - 1], b: pts[i] });
  const { kinds } = splitByTerrain(legs, 3.75, classAt);
  assert.ok(!kinds.includes(SK.TUNNEL), 'the chosen highway goes through a hill');
});

test('the highway takes the corner that avoids a hill when the other corner would tunnel', () => {
  // water across y 50..60 for every x (both candidates bridge it); hill at x >= 100 for y 60..120 (only the x-first corner hits it)
  const classAt = (x: number, y: number) => (y >= 50 && y < 60 ? TC.WATER : x >= 100 && y >= 60 && y < 120 ? TC.HILL : 0);
  const pts = highwayRoute({ x: 0, y: 20, edge: 'W' }, { x: 130, y: 140 }, 3.75, classAt);
  assert.deepEqual(pts[pts.length - 1], { x: 130, y: 140 });
  assert.deepEqual(pts[2], { x: 24, y: 140 });
  const legs: Leg[] = pts.slice(1).map((b, i) => ({ a: pts[i], b }));
  assert.equal(splitByTerrain(legs, 3.75, classAt).kinds.includes(SK.TUNNEL), false);
});
