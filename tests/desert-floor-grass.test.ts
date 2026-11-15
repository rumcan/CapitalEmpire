/** Tests for #1311 (the owner, 2026-11-14: "remove this grass decal from the desert floor but leave it on the roads"): in the desert the floor (open ground, the
 * lots) lays no dry grass: the lots' grass-tuft decals stand only in the verge by the road, the scatter on open ground leaves out the straw tufts; the roads'
 * litter and the kerb's dry tufts keep theirs. Outside the desert nothing changes. Pure, Node (the wiring read from the source). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LEAVES } from '../src/game/ground-art';
import { LOT_DECALS } from '../src/game/lot-decals';
import { DESERT_FLOOR_SKIP_GROUPS, MARK_PAD, STRAW_CELLS, floorLitterCell, lotMarkShown, markOnVerge } from '../src/game/desert-litter';

test('the desert floor\'s litter holds no straw tuft; the roads\' litter still does', () => {
  assert.ok(STRAW_CELLS.size > 0);
  for (const i of STRAW_CELLS) { const l = LEAVES.find(q => q.i === i)!; assert.ok(l && !l.round && i % 4 === 2, `${i}: a long cell drawn as a straw tuft`); }
  const floor = LEAVES.filter(l => floorLitterCell(true, l.i)).map(l => l.i), road = LEAVES.map(l => l.i); // (the roads' litter picks from every cell)
  assert.ok(!floor.some(i => STRAW_CELLS.has(i)), 'no straw on the desert floor');
  assert.ok(road.some(i => STRAW_CELLS.has(i)), 'the roads keep their straw');
  assert.ok(floor.length > LEAVES.length / 2, 'the rest of the floor litter stays (sand, pebbles, brush, tumbleweed)');
  for (const l of LEAVES) assert.equal(floorLitterCell(false, l.i), true, 'outside the desert nothing changes');
});

test('the lots\' grass tufts: off the desert lot floor, kept in the verge by the road', () => {
  const dry = LOT_DECALS.find(d => d.id === 'decal:decal-02-dry-golden-grass')!;
  assert.ok(dry); assert.ok(DESERT_FLOOR_SKIP_GROUPS.includes(dry.group), 'the dry golden grass decal is one the floor leaves out');
  const floorGroups = [...new Set(LOT_DECALS.map(d => d.group))].filter(gp => lotMarkShown(true, gp, false));
  assert.ok(!floorGroups.includes('tufts'), 'the desert lot floor\'s decal groups hold no grass tufts');
  assert.ok(floorGroups.includes('leaves'), 'its desert litter decals stay');
  assert.equal(lotMarkShown(true, 'tufts', true), true, 'the verge keeps them');
  for (const gp of new Set(LOT_DECALS.map(d => d.group))) assert.equal(lotMarkShown(false, gp, false), true, `${gp}: outside the desert nothing changes`);
  // a lot 10 x 8 tiles at the origin, front edge along y = 0: its marks patch is the lot grown MARK_PAD tiles, the front edge first
  const pts = [-2, -2, 12, -2, 12, 10, -2, 10];
  assert.equal(MARK_PAD, 2);
  assert.equal(markOnVerge(pts, 5, -1), true, 'in front of the lot');
  assert.equal(markOnVerge(pts, 5, 0.5), false, 'on the lot');
  assert.equal(markOnVerge(pts, 5, 9), false, 'at the back');
  assert.equal(markOnVerge([], 0, 0), false);
});

test('the bake\'s wiring: the floor scatter and the lot marks ask, the roads\' litter and the kerb\'s tufts do not', () => {
  const src = readFileSync(resolve('src/game/renderer.ts'), 'utf8');
  const litter = src.slice(src.indexOf('private drawLitter('), src.indexOf('// T220: the fallen leaves, over the litter'));
  const road = litter.slice(litter.indexOf('for (const l of net.leaves)'), litter.indexOf('// a sparse scatter'));
  assert.ok(road.length > 0 && !road.includes('floorLitterCell'), 'the roads\' litter lays every cell');
  assert.match(litter.slice(litter.indexOf('// a sparse scatter')), /floorLitterCell\(desertFloor, idx\)/, 'the open floor\'s scatter skips the straw in the desert');
  const marks = src.slice(src.indexOf('private drawMarks('), src.indexOf('private drawLeafFall('));
  assert.match(marks, /lotMarkShown\(true, d\.group, markOnVerge\(p\.pts, x, y\)\)/);
  assert.match(src, /DESERT_TUFT : \[/, 'the kerb\'s dry tufts are drawn as before');
});
