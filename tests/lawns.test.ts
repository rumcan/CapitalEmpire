// Headless tests for the town's lawns (src/game/lawns.ts): a lot's lawn covers the lot in a lawn preset picked by its key; a block's grass is
// one in soft patches; no lawn presets, no lawns; the presets' Use on lawns switch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockLawn, lotLawn } from '../src/game/lawns';
import { clampPreset } from '../src/game/paint-presets';

const g = { o: { x: 10, y: 20 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, w: 8, d: 12 };

test('a lot\'s lawn: the whole lot, a lawn preset picked by its key (the same key, the same pick), all of it, under the blocks\' grass order', () => {
  const ids = ['a', 'b', 'c'], l = lotLawn('lot-1', g, ids)!;
  assert.deepEqual(l.pts, [10, 20, 18, 20, 18, 32, 10, 32]);
  assert.ok(ids.map(i => `preset:${i}`).includes(l.tex as string));
  assert.deepEqual(lotLawn('lot-1', g, ids), l);
  assert.equal(l.lawn!.share, 1); assert.equal(l.lawn!.z, 1); assert.ok(l.lawn!.a === 0 || l.lawn!.a === 90);
  const picks = new Set(Array.from({ length: 60 }, (_, i) => lotLawn('lot-' + i, g, ids)!.tex)); assert.equal(picks.size, 3, 'lots spread over the presets');
  assert.equal(lotLawn('lot-1', g, []), null);
});

test('a block\'s grass: soft patches of one lawn preset over the block, under the lots', () => {
  const blk = { key: 'blk', pts: [0, 0, 40, 0, 40, 30, 0, 30], area: 1200, tex: 0 }, any = { id: null, share: 0.55 };
  const b = blockLawn(blk, ['x'], any)!;
  assert.equal(b.tex, 'preset:x'); assert.equal(b.lawn!.share, 0.55); assert.equal(b.lawn!.z, 0); assert.deepEqual(b.pts, [0, 0, 40, 0, 40, 30, 0, 30]);
  assert.equal(blockLawn(blk, [], any), null);
  // the owner's block preset wins over the lawn presets, at the owner's cover
  const f = blockLawn(blk, ['x'], { id: 'fescue', share: 1 })!; assert.equal(f.tex, 'preset:fescue'); assert.equal(f.lawn!.share, 1);
  assert.equal(blockLawn(blk, [], { id: 'fescue', share: 1 })!.tex, 'preset:fescue');
});

test('Use on lawns: on by default for grass presets, off for sand, water and paths, and the owner\'s switch wins', () => {
  const p = (surface: string | null, lawn?: boolean) => clampPreset({ name: 'P', surface: surface as never, a: { src: 'a' }, b: { src: 'b' }, ...(lawn === undefined ? {} : { lawn }) } as never)!.lawn;
  assert.equal(p(null), true); assert.equal(p('fairway'), true); assert.equal(p('bunker'), false); assert.equal(p('water'), false); assert.equal(p('fairway', false), false); assert.equal(p('bunker', true), true);
});
