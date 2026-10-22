// Headless tests for the texture presets (src/game/paint-presets.ts) and the Paint blend (paint.ts mtex ...).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESET_SIZE, clampPreset, clampPresets, presetSlug } from '../src/game/paint-presets';
import type { GrassSide } from '../src/game/base-grass';
import { DEFAULT_STYLE, MENU_TEXES, clampStyle, fromTuples, toTuple, type PaintArea } from '../src/game/paint';

const side = { src: 'src/assets/ground/grass-capital-backyard.webp' } as GrassSide;

test('presets: a name is needed; ids are slugs; surfaces, sizes and colours are checked; repeats are dropped', () => {
  assert.equal(clampPreset({ name: '  ', a: side, b: side }), null);
  assert.equal(clampPreset({ name: 'Fairway', a: side }), null);
  const p = clampPreset({ name: 'Fairway Summer!', surface: 'fairway', size: 999, col: 'green', a: side, b: side })!;
  assert.equal(p.id, 'fairway-summer'); assert.equal(p.surface, 'fairway'); assert.equal(p.size, PRESET_SIZE[1]); assert.match(p.col, /^#[0-9a-f]{6}$/);
  assert.equal(clampPreset({ name: 'X', surface: 'lava' as never, a: side, b: side })!.surface, null);
  assert.equal(presetSlug('Golf - Green'), 'golf-green');
  const f = clampPresets({ presets: [{ name: 'A', a: side, b: side }, { name: 'a', a: side, b: side }, { name: '', a: side, b: side }] as never });
  assert.equal(f.presets.length, 1);
});

test('paint: the menu offers only presets', () => {
  for (const t of MENU_TEXES) assert.ok(t.id.startsWith('preset:'), t.id);
});

test('paint blend: saved and loaded with the area, held to its ranges, dropped without a known texture', () => {
  const a: PaintArea = { id: 1, pts: [0, 0, 6, 0, 6, 6, 0, 6], ...clampStyle({ ...DEFAULT_STYLE, tex: 'dirt', mtex: 'bunkerSand', mshare: 0.3, msoft: 0.2, mpatch: 2 }) };
  const [b] = fromTuples([JSON.parse(JSON.stringify(toTuple(a)))]);
  assert.equal(b!.mtex, 'bunkerSand'); assert.equal(b!.mshare, 0.3); assert.equal(b!.msoft, 0.2); assert.equal(b!.mpatch, 2);
  const c = clampStyle({ ...DEFAULT_STYLE, mtex: 'dirt', mshare: 9, msoft: -1, mpatch: 99 });
  assert.deepEqual([c.mshare, c.msoft, c.mpatch], [1, 0.01, 4]);
  const d = clampStyle({ ...DEFAULT_STYLE, mtex: 'nope' as never });
  assert.ok(!('mtex' in d) && !('mshare' in d));
  // an area without a blend saves as before (no extra tuple elements)
  assert.equal(toTuple({ id: 1, pts: a.pts, ...clampStyle({ ...DEFAULT_STYLE, tex: 'dirt' }) }).length, 10);
});
