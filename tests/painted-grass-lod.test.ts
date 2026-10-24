import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grassDetailWeights, grassFamilyKey, grassDetailSourceKey, grassFamilyPeriod, grassZoomLevels, trimPaintedSources, type PaintedGrassFamily } from '../src/game/painted-grass-lod';

test('decoded painted source LRU protects the visible batch and ordinary photo fallback', () => {
  const sources = new Map<string, number>([['old-photo-grass', 10]]);
  for (let i = 0; i < 40; i++) sources.set('@painted:' + i, i);
  const visible = new Set(Array.from({ length: 30 }, (_, i) => '@painted:' + i));
  trimPaintedSources(sources, visible);
  assert.equal(sources.size, 31, 'A visible batch larger than the budget remains intact');
  assert.ok([...visible].every(key => sources.has(key)));
  trimPaintedSources(sources, new Set(['@painted:0']));
  assert.equal(sources.size, 25, 'Overage is released once the visible batch shrinks');
  assert.ok(sources.has('@painted:0'));
  assert.equal(sources.has('@painted:1'), false, 'Least recent unprotected source evicted first');
  assert.equal(sources.get('old-photo-grass'), 10, 'Existing photo textures never participate');
});

test('camera zoom chooses the same authored art on DPR1 and DPR2 while raster sharpness remains independent', () => {
  for (const zoom of [.04, .055, .099, .101, .14, .15, .199, .201, .3]) {
    const a = grassZoomLevels(zoom, 1), b = grassZoomLevels(zoom, 2);
    assert.equal(a.artL, b.artL);
    assert.equal(a.district, b.district);
    assert.deepEqual(grassDetailWeights(a.artL), grassDetailWeights(b.artL));
    assert.ok(b.rasterL >= a.rasterL);
  }
  assert.equal(grassZoomLevels(.15, 1).artL, .15);
  assert.equal(grassZoomLevels(.15, 2).artL, .15);
  assert.notEqual(grassZoomLevels(.15, 1).rasterL, grassZoomLevels(.15, 2).rasterL);
  // Small camera movements inside one existing cache band never create an art-bake identity per frame.
  assert.deepEqual(grassZoomLevels(.151, 2), grassZoomLevels(.19, 2));
});

test('authored grass detail blends continuously, bounded to two sources at every cache level', () => {
  assert.deepEqual(grassDetailWeights(.035), [{ detail: 'far', weight: 1 }]);
  assert.deepEqual(grassDetailWeights(.14), [{ detail: 'mid', weight: 1 }]);
  assert.deepEqual(grassDetailWeights(.3), [{ detail: 'near', weight: 1 }]);
  for (let L = 0; L <= .61; L += .001) {
    const weights = grassDetailWeights(L);
    assert.ok(weights.length >= 1 && weights.length <= 2);
    assert.ok(weights.every(w => w.weight > 0 && w.weight <= 1));
    assert.ok(Math.abs(weights.reduce((sum, w) => sum + w.weight, 0) - 1) < 1e-12);
    const next = grassDetailWeights(L + .00001);
    for (const detail of ['far', 'mid', 'near']) assert.ok(Math.abs((weights.find(w => w.detail === detail)?.weight ?? 0) - (next.find(w => w.detail === detail)?.weight ?? 0)) < .001);
  }
});

test('an authored family retains its 8m footprint and invalidates every source cache on art revision', () => {
  const family: PaintedGrassFamily = { far: 'far-v1', mid: 'mid-v1', near: 'near-v1', worldMetres: 8 };
  assert.equal(grassFamilyPeriod(family), 4);
  const changed = { ...family, near: 'near-v2' };
  assert.notEqual(grassFamilyKey('grass', family), grassFamilyKey('grass', changed));
  assert.notEqual(grassDetailSourceKey('grass', family, 'far'), grassDetailSourceKey('grass', changed, 'far'));
  assert.notEqual(grassDetailSourceKey('grass', family, 'far'), grassDetailSourceKey('grass', family, 'mid'));
  for (const L of [NaN, -1, Infinity]) assert.deepEqual(grassDetailWeights(L), [{ detail: 'far', weight: 1 }]);
});
