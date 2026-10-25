// Tests for course dressing (golf/dressing.ts): verified sprite IDs, deterministic pins/tees/benches/trees, and painted cart path loop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateOldNine } from '../src/game/golf/coursegen';
import {
  BENCH_ID, DRESSING_SPRITE_IDS, MARKER_SCALE, PIN_RED_ID, PIN_YELLOW_ID,
  DRESS_CONIFER_SHARE, TEE_BACK_ID, TEE_FORWARD_ID, TEE_MIDDLE_ID, TREE_IDS,
  buildCartPathLoop, dressCourse, dressTree, withCartPathLoop,
} from '../src/game/golf/dressing';
import { deriveHoles, surfaceAt } from '../src/game/golf/holes';
import { courseAreas } from '../src/game/golf/paintcourse';
import { surfacePreset } from '../src/game/paint-presets';
import { CONIFER_IDS, LIVE_BROAD_DEAL, LIVE_CONIFER_DEAL, TREE_POOL_IDS, ownerSize } from '../src/game/forest';

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

  // 8 red pins + 1 yellow pin on the 9th hole, and no flag anywhere else (T111: the forward tee marker was a yellow flag)
  const pinsAtGreen = a.filter(p => (p.id === PIN_RED_ID || p.id === PIN_YELLOW_ID) && p.scale === MARKER_SCALE.pin);
  assert.equal(pinsAtGreen.length, 9);
  assert.equal(a.filter(p => p.id === PIN_RED_ID || p.id === PIN_YELLOW_ID).length, 9);
  assert.equal(pinsAtGreen.filter(p => p.id === PIN_RED_ID).length, 8);
  assert.equal(pinsAtGreen.filter(p => p.id === PIN_YELLOW_ID).length, 1);

  // 9 back, 9 middle, 9 forward tee markers, each kind at its marker scale
  assert.equal(a.filter(p => p.id === TEE_BACK_ID && p.scale === MARKER_SCALE.back).length, 9);
  assert.equal(a.filter(p => p.id === TEE_MIDDLE_ID && p.scale === MARKER_SCALE.middle).length, 9);
  assert.equal(a.filter(p => p.id === TEE_FORWARD_ID && p.scale === MARKER_SCALE.forward).length, 9);

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
  assert.ok(paints.some(p => p.tex === (surfacePreset('path') ?? 'spectatorPath')));
  // Holes on dressedLayout still derive cleanly with 0 warnings
  const holes = deriveHoles(dressedLayout.areas, dressedLayout.tees, dressedLayout.pins, dressedLayout.aims);
  assert.equal(holes.length, 9);
  assert.equal(holes.every(h => h.warnings.length === 0), true);
});

test('the trees lining the holes: every live tree of the forest pools can appear, at owner size, a third of them conifers', () => {
  // the pool: every tree of the forest pools but the dead snags (tree-sun.test.ts holds the pools to the library)
  assert.deepEqual([...TREE_IDS].sort(), TREE_POOL_IDS.filter(id => !/dead/.test(id)).sort());
  for (const id of TREE_IDS) assert.ok(DRESSING_SPRITE_IDS.has(id), `${id} is a dressing sprite`);
  // every live tree has its own band of the one draw
  const reach = new Set<string>();
  for (const [d, lo, hi] of [[LIVE_CONIFER_DEAL, 0, DRESS_CONIFER_SHARE], [LIVE_BROAD_DEAL, DRESS_CONIFER_SHARE, 1]] as const) {
    for (let k = 0; k < d.ids.length; k++) {
      const u = lo + ((k ? d.cum[k - 1]! : 0) + d.cum[k]!) / 2 * (hi - lo);
      assert.equal(dressTree(u), d.ids[k]); reach.add(dressTree(u));
    }
  }
  assert.equal(reach.size, TREE_IDS.length);
  // and courses dressed with many seeds plant them all, deterministically
  const layout = generateOldNine(SITE, 12), seen = new Map<string, number>(), treeSet = new Set<string>(TREE_IDS);
  let total = 0, conifers = 0;
  for (let seed = 1; seed <= 60; seed++) {
    for (const p of dressCourse(layout, seed)) {
      if (!treeSet.has(p.id)) continue;
      total++; if (CONIFER_IDS.has(p.id)) conifers++;
      seen.set(p.id, (seen.get(p.id) ?? 0) + 1);
      const k = ownerSize(p.id);
      assert.ok(p.scale >= 0.9 * k - 0.006 && p.scale <= 1.1 * k + 0.006, `${p.id} scale ${p.scale}: owner size ${k} +-10%`);
    }
  }
  for (const id of TREE_IDS) assert.ok((seen.get(id) ?? 0) > 0, `${id} lines a hole on some seed`);
  assert.ok(conifers / total > 0.25 && conifers / total < 0.42, `conifers ${conifers} of ${total}`);
  console.log(`dressing: ${total} trees over 60 seeds, ${seen.size} sprites, the rarest ${Math.min(...seen.values())} times`);
});
