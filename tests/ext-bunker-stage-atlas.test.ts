import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUNKER_STAGES, bunkerStageRect, packBunkerStageAtlas } from '../src/game/ext/bunker-look/stage-atlas';

test('geometry stages partition the unchanged approved pixels independently of material colour', () => {
  const colour = Uint8ClampedArray.from([20, 10, 5, 255, 250, 240, 200, 160, 80, 70, 20, 240, 0, 0, 0, 0]);
  const ids = Uint8ClampedArray.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0]);
  const atlas = packBunkerStageAtlas(colour, ids, 4, 1);
  assert.deepEqual(atlas.pixels, [1, 1, 1]); assert.deepEqual([atlas.width, atlas.height], [4, 3]);
  for (let i = 0; i < colour.length; i += 4) {
    const parts = BUNKER_STAGES.map((_, stage) => atlas.data.subarray(stage * colour.length + i, stage * colour.length + i + 4));
    const visible = parts.filter(p => p[3]);
    if (colour[i + 3]) { assert.equal(visible.length, 1); assert.deepEqual(visible[0], colour.subarray(i, i + 4)); }
    else assert.equal(visible.length, 0);
  }
  assert.deepEqual(bunkerStageRect(4, 1, 'wall'), [0, 1, 4, 1]);
});

test('antialiased semantic boundaries keep original alpha in exactly one native stage', () => {
  const colour = Uint8ClampedArray.from([200, 100, 50, 128, 90, 150, 20, 255]);
  const ids = Uint8ClampedArray.from([100, 150, 5, 220, 120, 0, 130, 255]);
  const atlas = packBunkerStageAtlas(colour, ids, 2, 1);
  assert.deepEqual(atlas.pixels, [0, 1, 1]);
  assert.deepEqual(atlas.data.subarray(8, 12), colour.subarray(0, 4));
  assert.deepEqual(atlas.data.subarray(20, 24), colour.subarray(4, 8));
  const bytes = atlas.width * atlas.height * 4; assert.equal(bytes, colour.byteLength * 3, 'the single owned atlas accurately accounts for all derived resources');
});

test('missing geometry IDs or mismatched/oversized passes fail before installing any replacement', () => {
  assert.throws(() => packBunkerStageAtlas(Uint8ClampedArray.from([2, 3, 4, 255]), new Uint8ClampedArray(4), 1, 1), /classification/);
  assert.throws(() => packBunkerStageAtlas(new Uint8ClampedArray(4), new Uint8ClampedArray(8), 1, 1), /identical/);
  assert.throws(() => packBunkerStageAtlas(new Uint8ClampedArray(4), new Uint8ClampedArray(4), 513, 1), /512/);
});
