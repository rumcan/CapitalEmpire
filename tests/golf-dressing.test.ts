// Tests for course dressing (golf/dressing.ts): verified sprite IDs, deterministic pins/tees/benches/trees, and painted cart path loop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateOldNine } from '../src/game/golf/coursegen';
import {
  BENCH_ID, DRESSING_SPRITE_IDS, PIN_RED_ID, PIN_YELLOW_ID,
  TEE_BACK_ID, TEE_FORWARD_ID, TEE_MIDDLE_ID, TREE_IDS,
  buildCartPathLoop, dressCourse, withCartPathLoop,
} from '../src/game/golf/dressing';
import { deriveHoles, surfaceAt } from '../src/game/golf/holes';
import { courseAreas } from '../src/game/golf/paintcourse';

const SITE = { x0: 100, y0: 100, x1: 400, y1: 550 };

test('dressCourse is deterministic per seed and emits only verified library sprite IDs with unflipped lettering', () => {
  const layout = generateOldNine(SITE, 4);
  const a = dressCourse(layout, 42);
  const b = dressCourse(layout, 42);
  const c = dressCourse(layout, 99);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);

  // Every emitted sprite id belongs to DRESSING_SPRITE_IDS (verified in business-library.ts and library.ts)
  for (const p of a) {
    assert.equal(DRESSING_SPRITE_IDS.has(p.id), true, `unverified sprite id ${p.id}`);
    assert.ok(p.scale > 0 && Number.isFinite(p.x) && Number.isFinite(p.y));
  }

  // 8 red pins + 1 yellow pin on the 9th hole + 9 forward tee markers (which also use PIN_YELLOW_ID at smaller scale)
  const pinsAtGreen = a.filter(p => (p.id === PIN_RED_ID || p.id === PIN_YELLOW_ID) && p.scale === 0.32);
  assert.equal(pinsAtGreen.length, 9);
  assert.equal(pinsAtGreen.filter(p => p.id === PIN_RED_ID).length, 8);
  assert.equal(pinsAtGreen.filter(p => p.id === PIN_YELLOW_ID).length, 1);

  // 9 back, 9 middle, 9 forward tee markers
  assert.equal(a.filter(p => p.id === TEE_BACK_ID).length, 9);
  assert.equal(a.filter(p => p.id === TEE_MIDDLE_ID).length, 9);
  assert.equal(a.filter(p => p.id === TEE_FORWARD_ID && p.scale === 0.18).length, 9);

  // 9 benches near tees, never mirrored (flip === false)
  const benches = a.filter(p => p.id === BENCH_ID);
  assert.equal(benches.length, 9);
  assert.equal(benches.every(p => p.flip === false), true);
});

test('dressCourse keeps all trees on rough outside the fairways, greens, bunkers, and playing corridors', () => {
  const layout = generateOldNine(SITE, 12);
  const props = dressCourse(layout, 12);
  const treeSet = new Set<string>(TREE_IDS);
  const trees = props.filter(p => treeSet.has(p.id));
  assert.ok(trees.length >= 15, `expected >= 15 trees, got ${trees.length}`);
  for (const t of trees) {
    const surf = surfaceAt(layout.areas, t.x, t.y);
    assert.equal(surf, 'rough', `tree at (${t.x}, ${t.y}) landed on ${surf}`);
    for (const pin of layout.pins) {
      assert.ok(Math.hypot(t.x - pin.x, t.y - pin.y) >= 12, 'tree too close to pin');
    }
  }
});

test('buildCartPathLoop and withCartPathLoop add painted path areas that pass courseAreas with 0 dropped pieces', () => {
  const layout = generateOldNine(SITE, 4);
  const loop = buildCartPathLoop(layout);
  assert.ok(loop.length >= 9);
  assert.equal(loop.every(a => a.surface === 'path'), true);

  const dressedLayout = withCartPathLoop(layout);
  const stats = { dropped: 0 };
  const paints = courseAreas(dressedLayout, stats);
  assert.equal(stats.dropped, 0);
  assert.ok(paints.some(p => p.tex === 'spectatorPath'));
  // Holes on dressedLayout still derive cleanly with 0 warnings
  const holes = deriveHoles(dressedLayout.areas, dressedLayout.tees, dressedLayout.pins, dressedLayout.aims);
  assert.equal(holes.length, 9);
  assert.equal(holes.every(h => h.warnings.length === 0), true);
});
