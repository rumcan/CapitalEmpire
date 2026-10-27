// T183: the lot lab's ground brush: a stroke merges into the lot's one patch of its material; erase; a hole stays one polygon; diagonal cells stay
// two pieces; the patches before a stroke are its undo; brush sizes.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BRUSH_SIZES, CELL, applyStroke, brushCells, cellsOf, grid, inside, polygons, rectCells, stepBrush, strokeCells, traceLoops } from '../src/game/dev/lot-paint';
import type { PresetPatch } from '../src/game/lots/presets';

const W = 10, D = 12, concrete = { kind: 'lot' as const, tex: 'concrete' }, dirt = { kind: 'yard' as const, tex: 'dirt' };
const count = (g: { on: Uint8Array }) => g.on.reduce((s, v) => s + v, 0);
const drive: PresetPatch = { kind: 'drive', tex: 'paving', pts: [1, 0, 3, 0, 3, 6, 1, 6] };

describe('the ground brush (T183)', () => {
  it('a round brush covers the cells whose centres it holds, snapped to the half-tile grid', () => {
    const g = grid(W, D);
    assert.equal(g.nx, W / CELL); assert.equal(g.ny, D / CELL);
    assert.equal(brushCells(g, 5, 5, 0.5).length, 4, 'the smallest brush: the four cells round the point');
    assert.ok(brushCells(g, 5, 5, 2).length > brushCells(g, 5, 5, 1).length);
    assert.deepEqual(BRUSH_SIZES[0], 0.5); assert.equal(BRUSH_SIZES[BRUSH_SIZES.length - 1], 4);
    assert.equal(stepBrush(1, 1), 1.5); assert.equal(stepBrush(1, -1), 0.5); assert.equal(stepBrush(4, 1), 4); assert.equal(stepBrush(0.5, -1), 0.5);
  });
  it('a stroke merges into ONE patch of its material, beside the other patches', () => {
    const g = grid(W, D);
    const a = applyStroke([drive], concrete, W, D, strokeCells(g, [4, 2, 8, 2], 1), false);
    const mine = a.filter(p => p.tex === 'concrete');
    assert.equal(mine.length, 1, 'one patch');
    assert.ok(a.includes(drive), 'the drive is kept as it was');
    // a second, overlapping stroke: still one patch, now bigger
    const b = applyStroke(a, concrete, W, D, strokeCells(g, [8, 2, 8, 9], 1), false);
    assert.equal(b.filter(p => p.tex === 'concrete').length, 1);
    assert.ok(count(cellsOf(b, 'concrete', W, D)) > count(cellsOf(a, 'concrete', W, D)));
    assert.ok(inside(b.find(p => p.tex === 'concrete')!.pts, 8.25, 8.75), 'the second stroke is in the patch');
    // another material is its own patch
    const c = applyStroke(b, dirt, W, D, rectCells(g, 0, 10, 4, 12), false);
    assert.equal(c.filter(p => p.tex === 'dirt').length, 1);
    assert.equal(c.filter(p => p.tex === 'concrete').length, 1);
  });
  it('erase takes the cells out of that material only; a hole keeps the patch one polygon', () => {
    const g = grid(W, D);
    const pad = applyStroke([drive], concrete, W, D, rectCells(g, 2, 2, 8, 8), false);
    const before = count(cellsOf(pad, 'concrete', W, D));
    const holed = applyStroke(pad, concrete, W, D, brushCells(g, 5, 5, 1), true);
    const mine = holed.filter(p => p.tex === 'concrete');
    assert.equal(mine.length, 1, 'one polygon with its hole joined by a seam');
    assert.equal(count(cellsOf(holed, 'concrete', W, D)), before - brushCells(g, 5, 5, 1).length, 'the hole is cut out (the nonzero fill of the joined polygon)');
    assert.ok(!inside(mine[0]!.pts, 5.25, 5.25) && inside(mine[0]!.pts, 2.25, 2.25));
    assert.ok(holed.includes(drive), 'erasing concrete leaves the paving drive alone');
    // erase everything: the material's patch goes
    const gone = applyStroke(holed, concrete, W, D, rectCells(g, 0, 0, W, D), true);
    assert.equal(gone.filter(p => p.tex === 'concrete').length, 0);
  });
  it('cells touching only at a corner stay two pieces; the stroke before is the undo', () => {
    const g = grid(4, 4); g.on[0] = 1; g.on[1 * g.nx + 1] = 1;
    assert.equal(traceLoops(g).length, 2);
    assert.equal(polygons(g).length, 2);
    const start: PresetPatch[] = [drive], after = applyStroke(start, concrete, W, D, brushCells(grid(W, D), 6, 6, 1), false);
    assert.notEqual(after, start); assert.deepEqual(start, [drive], 'the patches before the stroke are untouched: one undo step puts them back');
  });
  it('lined patches (parking bays) are never merged', () => {
    const bays: PresetPatch = { kind: 'lot', tex: 'concrete', pts: [0, 0, 4, 0, 4, 4, 0, 4], lines: [1, 0, 1, 4] };
    const a = applyStroke([bays], concrete, W, D, rectCells(grid(W, D), 5, 5, 8, 8), false);
    assert.ok(a.includes(bays)); assert.equal(a.length, 2);
  });
});

import { selectAfter } from '../src/game/dev/wizard-lot';
describe("the wizard's select (T183)", () => {
  it('a click selects one item, Shift or Ctrl+click toggles, a box selects (or adds), the ground clears', () => {
    const none = new Set<number>();
    assert.deepEqual([...selectAfter(none, { item: 3, add: false, box: null })], [3]);
    assert.deepEqual([...selectAfter(new Set([3]), { item: 5, add: false, box: null })], [5], 'a plain click replaces the selection');
    assert.deepEqual([...selectAfter(new Set([3]), { item: 5, add: true, box: null })].sort(), [3, 5], 'Shift or Ctrl+click adds');
    assert.deepEqual([...selectAfter(new Set([3, 5]), { item: 5, add: true, box: null })], [3], 'and takes out again');
    assert.deepEqual([...selectAfter(new Set([3]), { item: -1, add: false, box: [1, 2] })].sort(), [1, 2], 'a box selects what is in it');
    assert.deepEqual([...selectAfter(new Set([3]), { item: -1, add: true, box: [1, 2] })].sort(), [1, 2, 3], 'Shift+box adds');
    assert.deepEqual([...selectAfter(new Set([3]), { item: -1, add: false, box: null })], [], 'a click on the ground clears');
    const s = new Set([4]); selectAfter(s, { item: 1, add: true, box: null }); assert.deepEqual([...s], [4], 'the selection before is untouched (a new set)');
  });
});
