// T181: a lot's lawn is laid as authored; the ground's automatic overlays (the living ground's variants, the grass condition picture) leave it
// alone, while a road block's grass, the course and the map grass keep them, and the Grass panel's health colours still show over a lawn.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { grassOverlay, isLotLawn, livingKeepsOff } from '../src/game/lawn-overlay';
import { blockLawn, lotLawn } from '../src/game/lawns';
import type { Block } from '../src/game/blocks';

const geom = { o: { x: 100, y: 100 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, w: 12, d: 16 };
const yard = lotLawn('lot-a', geom, ['lawn-one'], 'built')!;
const block = blockLawn({ key: 'block-a', pts: [90, 90, 140, 90, 140, 130, 90, 130] } as unknown as Block, ['lawn-one'], { id: null, share: 0.6 })!;
const notTiled = () => false, tiledAll = () => true, grassy = (t: string) => /grass|lawn|preset:/.test(t);

describe('a lot lawn is laid as authored (T181)', () => {
  it("tells a lot's yard from a road block's grass", () => {
    assert.ok(yard && block);
    assert.equal(isLotLawn(yard), true);
    assert.equal(isLotLawn(block), false);
    assert.equal(isLotLawn({ tex: 'grass' } as { lawn?: { z: number } }), false);
    for (const st of ['built', 'upgraded', 'declined'] as const) assert.equal(isLotLawn(lotLawn('lot-b', geom, ['lawn-one'], st)!), true, st);
  });
  it('the grass condition picture: never over a yard; the health colours still show; everything else as before', () => {
    assert.equal(grassOverlay(yard, false, notTiled), 'none', 'no condition picture over a lot lawn');
    assert.equal(grassOverlay(yard, true, notTiled), 'heat', "the Grass panel's health colours still show over it");
    assert.equal(grassOverlay(block, false, notTiled), 'picture', "a road block's grass keeps it (the town's grass, unchanged)");
    assert.equal(grassOverlay({ tex: 'grass' }, false, notTiled), 'picture', 'a town park keeps it');
    assert.equal(grassOverlay({ tex: 'grass' }, false, tiledAll), 'none', 'a hand-painted tile set keeps its art (T145, unchanged)');
    assert.equal(grassOverlay({ tex: 'grass' }, true, tiledAll), 'heat');
    assert.equal(grassOverlay({ tex: 'golfSod' }, true, notTiled), 'none', 'fresh sod: nothing (unchanged)');
    assert.equal(grassOverlay({ tex: 'asphalt' }, false, notTiled), 'none', 'not grass: nothing');
  });
  it('the living ground leaves a yard alone; block grass, map grass and the old cut-outs as before', () => {
    assert.equal(livingKeepsOff(yard, grassy, notTiled), true, "a lot's lawn is cut out of the variants");
    assert.equal(livingKeepsOff(block, grassy, notTiled), false, "a road block's grass keeps the variety");
    assert.equal(livingKeepsOff({ tex: 'asphalt' }, grassy, notTiled), true, 'hard ground is left alone (unchanged)');
    assert.equal(livingKeepsOff({ tex: 'grass' }, grassy, notTiled), false, 'grass paint keeps the variety (unchanged)');
    assert.equal(livingKeepsOff({ tex: 'grass' }, grassy, tiledAll), true, 'a hand-painted tile set is left alone (unchanged)');
    assert.equal(livingKeepsOff({ tex: 'marks' }, grassy, notTiled), false, 'decals: not a cut-out (unchanged)');
    assert.equal(livingKeepsOff({ tex: 'asphalt', top: true }, grassy, notTiled), false, 'road markings: not a cut-out (unchanged)');
    assert.equal(livingKeepsOff({ tex: 'asphalt', layby: {} }, grassy, notTiled), false, 'a lay-by: not a cut-out (unchanged)');
  });
});
