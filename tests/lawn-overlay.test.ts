// T181: the grass condition picture leaves a lot's lawn alone (the health colours still show over it); a road block's grass, the course and
// the map grass keep it. T181b: the living ground's streaks are on lawns again, its occlusion wash is off.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { grassOverlay, isLotLawn } from '../src/game/lawn-overlay';
import { LIVING_AO } from '../src/game/living-ground';
import { blockLawn, lotLawn } from '../src/game/lawns';
import type { Block } from '../src/game/blocks';

const geom = { o: { x: 100, y: 100 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, w: 12, d: 16 };
const yard = lotLawn('lot-a', geom, ['lawn-one'], 'built')!;
const block = blockLawn({ key: 'block-a', pts: [90, 90, 140, 90, 140, 130, 90, 130] } as unknown as Block, ['lawn-one'], { id: null, share: 0.6 })!;
const notTiled = () => false, tiledAll = () => true;

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
  it('the living ground: its streaks on every lawn again, its occlusion wash off (T181b)', () => {
    assert.equal(LIVING_AO, false, 'the cool occlusion multiply over the ground is off');
  });
});
