import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paranormalFrame, paranormalNightStrength, type ParanormalSpriteKey } from '../src/game/ext/paranormal-render/frames';
import manifest from '../src/assets/paranormal/manifest.json';

test('native sheet frames stay inside every original sheet including four-row kids', () => {
  for (const key of Object.keys(manifest) as ParanormalSpriteKey[]) {
    const m = manifest[key];
    for (const time of [0, .14, 17.8, 240, 1440]) for (const facing of [0, Math.PI, Math.PI / 2, -Math.PI / 2]) {
      const f = paranormalFrame(key, time, 'walk', facing, 2);
      assert.ok(f.sx >= 0 && f.sx + f.sw <= m.cols * m.fw, key);
      assert.ok(f.sy >= 0 && f.sy + f.sh <= m.rows * m.fh, key);
      assert.ok(f.ax < f.sw && f.ay < f.sh, key);
      if (m.rows === 4) assert.ok(f.sy === m.fh || f.sy === 3 * m.fh);
    }
  }
});
test('moonlight is absent in warnings and at dawn; fades on the simulation clock', () => {
  const d = [{ kind: 'paranormal' as const, start: 45, end: 285 }];
  assert.equal(paranormalNightStrength(d, 20), 0);
  assert.equal(paranormalNightStrength(d, 45), 0);
  assert.equal(paranormalNightStrength(d, 49), .5);
  assert.equal(paranormalNightStrength(d, 100), 1);
  assert.equal(paranormalNightStrength(d, 281), .5);
  assert.equal(paranormalNightStrength(d, 285), 0);
  assert.equal(paranormalNightStrength([{ kind: 'storm', start: 45, end: 285 }], 100), 0);
  assert.equal(paranormalNightStrength([], 100), 0);
});
test('paused battle frames are repeatable and idle kids use only four native frames', () => {
  assert.deepEqual(paranormalFrame('tommy', 100, 'fight', 0, 2), paranormalFrame('tommy', 100, 'fight', 0, 2));
  for (let time = 0; time < 20; time += .1) {
    const f = paranormalFrame('jess', time, 'defeated', 0, 0);
    assert.equal(f.sy, 0); assert.ok(f.sx < 4 * manifest.jess.fw);
  }
});
