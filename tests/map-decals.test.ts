// Headless tests for the map decals (src/game/map-decals.ts; the drawing needs a canvas and is checked in the browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DECAL_LAYERS, DEFAULT_DECALS, clampDecals, decalPics, flatSquash, placeDecals, type MapDecalsFile } from '../src/game/map-decals';

const BOX = [100, 100, 164, 164] as const, all = () => true;
const withLayer = (id: keyof MapDecalsFile['layers'], o: object) => { const f = clampDecals(null); f.layers[id] = { ...f.layers[id], ...o }; return f; };

test('map decals: no file gives the game defaults; bad values are held to the ranges', () => {
  assert.deepEqual(clampDecals(null).layers, DEFAULT_DECALS);
  const f = clampDecals({ layers: { grass: { on: 'x', count: 999, min: 2, max: 0.5, aMin: -1, aMax: 5, flip: 1, off: [0, 0, 99, 1.5, 3] } } } as never);
  const g = f.layers.grass, L = DECAL_LAYERS.find(l => l.id === 'grass')!;
  assert.equal(g.on, true); assert.equal(g.count, L.count[1]);
  assert.deepEqual([g.min, g.max, g.aMin, g.aMax], [0.5, 2, 0, 1]);
  assert.equal(g.flip, true); assert.deepEqual(g.off, [0, 3]);
});

test('map decals: placement is the same every time and each layer has its own stream', () => {
  const a = placeDecals(BOX, clampDecals(null), all), b = placeDecals(BOX, clampDecals(null), all);
  assert.deepEqual(a, b);
  const c = placeDecals(BOX, withLayer('grass', { count: 0 }), all);
  assert.equal(c.grass.length, 0);
  for (const id of ['nature', 'soil', 'leaves', 'tufts'] as const) assert.deepEqual(c[id], a[id]);
});

test('map decals: off layers, left-out pictures, ranges and the ground test', () => {
  assert.equal(placeDecals(BOX, withLayer('nature', { on: false }), all).nature.length, 0);
  const pics = decalPics('grass'), p = placeDecals(BOX, withLayer('grass', { off: [0, 1, 2, 3], min: 1.1, max: 1.2, aMin: 0.3, aMax: 0.4, flip: false }), all).grass;
  assert.ok(p.length > 0);
  for (let i = 0; i < p.length; i += 5) {
    assert.equal(p[i + 2], pics[4]);
    assert.ok(p[i + 3] >= 1.1 && p[i + 3] <= 1.2);
    assert.ok(p[i + 4] >= 0.3 && p[i + 4] <= 0.4);
  }
  assert.equal(placeDecals(BOX, clampDecals(null), () => false).grass.length, 0);
});

test('map decals: the saved file reads cleanly and has the nature patches off (the owner asked)', () => {
  const f = JSON.parse(readFileSync('src/game/map-decals.json', 'utf8'));
  const c = clampDecals(f);
  assert.equal(c.layers.nature.on, false);
  for (const L of DECAL_LAYERS) assert.ok(L.id in f.layers, `map-decals.json has ${L.id}`);
});

test('flat decals: top-down patches lie on the ground at half height, art already in the 2:1 view keeps its height', () => {
  assert.equal(flatSquash('decal:decal-06-orange-leaf-scatter', 231, 221), 0.5);
  assert.equal(flatSquash('scatter-grass-tufts', 231, 231), 0.5);
  assert.equal(flatSquash('gen:drift-2', 200, 111), 1);
  assert.equal(flatSquash('variation:expansion-can-litter-a379ec6f:1', 51, 42), 1);
  assert.equal(flatSquash('expansion:mud-tracks-x', 448, 219), 1);
  assert.equal(flatSquash('variation:expansion-gutter-leaves-sparse:1', 100, 84), 1);
});
