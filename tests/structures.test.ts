// Headless tests for the bridge and tunnel split: npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SK, type Leg } from '../src/game/network';
import { longestRun, splitByTerrain, structureLengths } from '../src/game/structures';
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
