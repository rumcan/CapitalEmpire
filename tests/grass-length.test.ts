// T285 (#869): grass lengths 1 (the green) .. 5 (the fescue); a longer grass's shade runs along a shorter one's edge, none between equal ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGrid, paintCells, SURF } from '../src/game/ext/course-grid';
import { coursePatch, type CourseLooks } from '../src/game/ext/course-grid/patch';
import { DEFAULT_LENGTH, BAND_LENGTH, lengthOfCode } from '../src/game/ext/course-walls/spill';
import { layerCode } from '../src/game/ext/course-walls';

const tex = { tex: 'grass', sc: 1, a: 0 };
const looks = (length?: (number | undefined)[]): CourseLooks => ({ surf: Array.from({ length: 10 }, (_, s) => (s ? tex : undefined)), collar: { 'first-cut': tex, fringe: tex, lip: tex, bank: tex },
  border: [], ...(length ? { length } : {}) });
/** a rough block with a fairway block cut into it (no first cut band: Border none) */
function course() {
  const g = makeGrid(0, 0, 64, 64), rough: number[] = [], fw: number[] = [];
  for (let y = 4; y < 60; y++) for (let x = 4; x < 60; x++) (x >= 20 && x < 44 && y >= 20 && y < 44 ? fw : rough).push(y * g.w + x);
  paintCells(g, rough, rough.length, SURF.rough, 1, 0); paintCells(g, fw, fw.length, SURF.fairway, 1, 0);
  return g;
}
const noBand = (l: CourseLooks): CourseLooks => ({ ...l, border: Object.assign([], { [SURF.fairway]: 0, [SURF.green]: 0, [SURF.tee]: 0 }) });

test('the default lengths: the green 1, the fairway 2, the rough 3, the long grass 4, the fescue 5; the bands a step above', () => {
  assert.equal(DEFAULT_LENGTH[SURF.green], 1); assert.equal(DEFAULT_LENGTH[SURF.fairway], 2); assert.equal(DEFAULT_LENGTH[SURF.rough], 3);
  assert.equal(DEFAULT_LENGTH[SURF.longGrass], 4); assert.equal(DEFAULT_LENGTH[SURF.fescue], 5); assert.equal(DEFAULT_LENGTH[SURF.bunker], undefined, 'not grass');
  assert.equal(BAND_LENGTH['first-cut'], 3); assert.equal(BAND_LENGTH.fringe, 2);
  assert.equal(lengthOfCode(layerCode(SURF.rough, false), [undefined, 5]), 5, 'a Length set wins');
  assert.equal(lengthOfCode(layerCode(SURF.water, false), undefined), undefined);
});

test('a longer grass beside a shorter one: a shade run on the shorter one\'s edge, as long as the difference; none when they are equal', () => {
  const g = course();
  const shade = coursePatch(g, 0, 0, noBand(looks()), 0)!.course!.shade ?? [];
  const fw = shade.filter(r => r.c === layerCode(SURF.fairway, false));
  assert.ok(fw.length > 0, 'the rough (3) shades the fairway (2)'); assert.ok(fw.every(r => r.d === 1));
  assert.ok(!shade.some(r => r.c === layerCode(SURF.rough, false) && r.d <= 0));
  const same = coursePatch(g, 0, 0, noBand(looks(Object.assign([], { [SURF.rough]: 2 }))), 0)!.course!.shade ?? [];
  assert.equal(same.filter(r => r.c === layerCode(SURF.fairway, false)).length, 0, 'equal lengths cast no shade');
  const tall = coursePatch(g, 0, 0, noBand(looks(Object.assign([], { [SURF.rough]: 5, [SURF.fairway]: 1 }))), 0)!.course!.shade ?? [];
  assert.ok(tall.filter(r => r.c === layerCode(SURF.fairway, false)).every(r => r.d === 4), 'the difference 5 - 1');
});
