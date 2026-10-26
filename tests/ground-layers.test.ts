// T134 (#253): dark, unbaked ground after a fresh start or a camera jump. Two faults met: a chunk baked at the new zoom level drew nothing while
// the zoom crossfade waited for the rest of the view (it had no older picture, and the planner map is only drawn under chunks with none), and
// a chunk at the view's edge could wait for ever for forest cells nothing planted, so the crossfade never started.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkLayers, type ChunkPictures } from '../src/game/ground-layers';
import { FOREST_VIEW_MARGIN, forestCellRange } from '../src/game/forest';
import { CHUNK_CASTER_REACH, LIVING_PLANT_MARGIN } from '../src/game/living-ground';
import { CHUNK_H, CHUNK_W, MAP, MID_H, MID_W, mulberry, worldX, worldY } from '../src/game/iso';

const L = 0.6, artL = 0.3;
const chunk = (o: Partial<ChunkPictures<string>>): ChunkPictures<string> => ({ tex: null, texL: 0, texArtL: 0, fadeFrom: null, prev: null, ...o });

test('a chunk baked at the new level with nothing older to show draws its picture while the crossfade waits for the rest of the view', () => {
  // the timeline of #253: the jump, the chunk's bake lands (its first picture: no fadeFrom), the rest of the view still baking (zoomBlend 0)
  for (const otherTier of [false, true]) {
    const lay = chunkLayers(chunk({ tex: 'new', texL: L, texArtL: artL }), L, artL, 0, otherTier);
    assert.equal(lay.base, 'new', 'its own picture at full strength, not nothing');
    assert.equal(lay.planner, false);
  }
});

test('every chunk state draws something at full strength: its picture, an older one, or the planner map under it', () => {
  for (const tex of [null, 'tex']) for (const ready of [false, true]) for (const fadeFrom of [null, 'fade']) for (const prev of [null, 'prev'])
    for (const zoomBlend of [0, 0.4, 1]) for (const otherTier of [false, true]) {
      if (!tex && (ready || fadeFrom || prev)) continue; // a picture before the edit or the zoom implies one now (GroundCache: evict drops them together)
      const t = chunk({ tex, texL: ready ? L : 0.45, texArtL: ready ? artL : 0.2, fadeFrom, prev }), lay = chunkLayers(t, L, artL, zoomBlend, otherTier);
      assert.ok(lay.planner || lay.base, `nothing drawn for ${JSON.stringify({ tex, ready, fadeFrom, prev, zoomBlend, otherTier })}`);
    }
});

test('an older picture shows until the crossfade starts, then the new one fades in over it', () => {
  const t = chunk({ tex: 'new', texL: L, texArtL: artL, fadeFrom: 'old' });
  assert.deepEqual([chunkLayers(t, L, artL, 0, false).base, chunkLayers(t, L, artL, 0, false).top], ['old', null]);
  const mid = chunkLayers(t, L, artL, 0.5, false);
  assert.deepEqual([mid.base, mid.top, mid.topAlpha], ['old', 'new', 0.5]);
  const done = chunkLayers(t, L, artL, 1, false);
  assert.deepEqual([done.base, done.top], ['new', null]);
});

test('a chunk still at the old level keeps it, and keeps it under the other tier\'s pieces after a tier change', () => {
  const t = chunk({ tex: 'old', texL: 0.45, texArtL: 0.2 });
  assert.deepEqual([chunkLayers(t, L, artL, 0, false).base, chunkLayers(t, L, artL, 0, false).top], ['old', null]);
  const tier = chunkLayers(t, L, artL, 0, true);
  assert.equal(tier.base, 'old', 'the other tier may cover only part of it: its own older picture fills the rest');
  assert.equal(tier.fallback, true);
});

test('a chunk with no picture yet shows the planner map', () => {
  const lay = chunkLayers(chunk({}), L, artL, 0, false);
  assert.deepEqual([lay.planner, lay.base, lay.fallback], [true, null, true]);
  assert.equal(chunkLayers(chunk({}), L, artL, 1, false).planner, true);
});

/** the visible chunks of a camera (engine.ts draw: X0..X1 = the view, chunks of CW x CH world px) */
function view(X: number, Y: number, ze: number, cw: number, ch: number, CW: number, CH: number) {
  const X0 = X - cw / 2 / ze, Y0 = Y - ch / 2 / ze, X1 = X + cw / 2 / ze, Y1 = Y + ch / 2 / ze;
  return { i0: Math.floor(X0 / CW), i1: Math.floor(X1 / CW), j0: Math.floor(Y0 / CH), j1: Math.floor(Y1 / CH) };
}
/** every chunk on screen finds the forest cells its casters wait for (casterReady) inside the cells the engine plants for the view (plantForest
 *  over the chunks on screen, with the living ground on); the first chunk that would wait for ever, or null */
function stuckChunk(X: number, Y: number, ze: number, cw: number, ch: number, CW: number, CH: number) {
  const { i0, i1, j0, j1 } = view(X, Y, ze, cw, ch, CW, CH);
  const plant = forestCellRange(i0 * CW, j0 * CH, (i1 + 1) * CW, (j1 + 1) * CH, LIVING_PLANT_MARGIN);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const need = forestCellRange(i * CW, j * CH, (i + 1) * CW, (j + 1) * CH, CHUNK_CASTER_REACH);
    if (need[0] < plant[0] || need[1] < plant[1] || need[2] > plant[2] || need[3] > plant[3]) return { i, j, need, plant };
  }
  return null;
}

test('a chunk at the view\'s edge never waits for a forest cell nothing plants (the stuck jump of #253)', () => {
  // the headless repro (1600 x 1000 at dpr 2, 10%): chunk (-42, 64) waited for cells (6, 25) and (6, 26), one tile past the planted range
  assert.equal(stuckChunk(-90217.41167866104, 59741.194377197375, 0.2, 3200, 2000, CHUNK_W, CHUNK_H), null);
  // anywhere on the map, at both ground tiers and a few window sizes
  const rnd = mulberry(253);
  for (let k = 0; k < 4000; k++) {
    const x = rnd() * MAP, y = rnd() * MAP, mid = rnd() < 0.4, ze = (mid ? 0.035 + rnd() * 0.08 : 0.12 + rnd() * 0.18) * (rnd() < 0.5 ? 1 : 2);
    const cw = Math.round(800 + rnd() * 3000), ch = Math.round(600 + rnd() * 1600);
    const s = stuckChunk(worldX(x, y), worldY(x, y), ze, cw, ch, mid ? MID_W : CHUNK_W, mid ? MID_H : CHUNK_H);
    assert.equal(s, null, `camera at tile (${x.toFixed(1)}, ${y.toFixed(1)}), ze ${ze.toFixed(3)}: ${JSON.stringify(s)}`);
  }
  assert.ok(FOREST_VIEW_MARGIN <= LIVING_PLANT_MARGIN, 'the living ground plants at least as far out as the trees need');
});
