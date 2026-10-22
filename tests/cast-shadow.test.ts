// Headless tests for the cast shadows' settings (src/game/cast-shadow.ts; the drawing is gl.ts's VS_CAST and lot-render.mjs's castOf).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAST, CAST_DEFAULT, castShear, clampCast } from '../src/game/cast-shadow';

test('cast shadows: settings held to their ranges, the file read, the shear from the sun side and length', () => {
  assert.deepEqual(clampCast(null), CAST_DEFAULT);
  assert.deepEqual(clampCast({ on: false, angle: 999, length: -1, strength: 2 }), { on: false, angle: 360, length: 0.1, strength: 1 });
  assert.equal(typeof CAST.on, 'boolean');
  const left = castShear({ on: true, angle: 180, length: 0.5, strength: 0.3 });
  assert.ok(Math.abs(left.sx + 0.5) < 1e-9 && Math.abs(left.sy) < 1e-9, 'falling left: x only');
  const down = castShear({ on: true, angle: 90, length: 0.4, strength: 0.3 });
  assert.ok(Math.abs(down.sx) < 1e-9 && Math.abs(down.sy - 0.4) < 1e-9, 'falling down: y only');
});
