import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CELL_T, SURF, applyDiff, cellAt, cellCentre, decodeGrid, diffBox, diffCost, encodeGrid, fillPolygon,
  growGrid, makeGrid, mergeDiffs, paintDisc, paintStroke,
  type Grid, type GridDiff,
} from '../src/game/ext/course-grid/index';
import { mulberry } from '../src/game/iso';

/** how many cells of a layer hold v */
const countOf = (a: ArrayLike<number>, v: number): number => { let c = 0; for (let i = 0; i < a.length; i++) if (a[i] === v) c++; return c; };
/** a deep copy of a grid's layers */
const copy = (g: Grid): Grid => ({ ...g, surf: g.surf.slice(), hole: g.hole.slice(), month: g.month.slice() });
/** the raw bytes behind a typed array */
const bytes = (a: ArrayBufferView): Buffer => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
/** the same geometry and the same bytes in all three layers (rev is not compared) */
const sameGrid = (a: Grid, b: Grid): boolean => a.x0 === b.x0 && a.y0 === b.y0 && a.w === b.w && a.h === b.h && bytes(a.surf).equals(bytes(b.surf)) && bytes(a.hole).equals(bytes(b.hole)) && bytes(a.month).equals(bytes(b.month));
/** money per cell by SURF id, for the cost tests */
const PRICE = [0, 2, 3, 5, 10, 12, 8, 4, 20];
const price = (s: number): number => PRICE[s];

describe('ext/course-grid (T072)', () => {
  it('has 0.5-tile cells, and a disc of r = 2.5 tiles at a cell centre sets the 81 cells of radius 5 cells', () => {
    assert.equal(CELL_T, 0.5);
    const g = makeGrid(0, 0, 20, 20);
    assert.equal(cellAt(g, 5.25, 5.25), 210);
    assert.equal(cellAt(g, -0.1, 0), -1);
    assert.equal(cellAt(g, 10, 0), -1);
    assert.deepEqual(cellCentre(g, 210), { x: 5.25, y: 5.25 });
    const d = paintDisc(g, 5.25, 5.25, 2.5, SURF.fairway, 3, 7);
    assert.equal(d.n, 81); // lattice points with i*i + j*j <= 25
    assert.deepEqual(diffBox(d), { x0: 2.5, y0: 2.5, x1: 8, y1: 8 });
    assert.equal(g.rev, 1);
    assert.equal(g.surf[215], SURF.fairway); // 5 cells east, on the rim
    assert.equal(g.surf[293], SURF.fairway); // (3, 4), on the rim
    assert.equal(g.surf[294], SURF.none); // (4, 4), 5.7 cells away
    assert.equal(g.hole[210], 3);
    assert.equal(g.month[210], 7);
  });

  it("'below' does not paint fairway over a green, 'any' does; 'below' on the same surface changes only hole and month", () => {
    const g = makeGrid(0, 0, 20, 20);
    paintDisc(g, 5.25, 5.25, 2.5, SURF.green, 1, 2);
    const greens = copy(g);
    const below = paintDisc(g, 5.25, 5.25, 2.5, SURF.fairway, 4, 9, { over: 'below' });
    assert.equal(below.n, 0);
    assert.ok(sameGrid(g, greens));
    assert.equal(g.rev, 1); // nothing changed, so no bump
    const all = paintDisc(g, 5.25, 5.25, 2.5, SURF.fairway, 4, 9);
    assert.equal(all.n, 81);
    assert.equal(countOf(g.surf, SURF.fairway), 81);
    assert.equal(countOf(g.surf, SURF.green), 0);
    const same = paintDisc(g, 5.25, 5.25, 2.5, SURF.fairway, 6, 11, { over: 'below' });
    assert.equal(same.n, 81);
    assert.equal(countOf(g.surf, SURF.fairway), 81);
    assert.equal(g.hole[210], 6);
    assert.equal(g.month[210], 11);
    assert.equal(paintDisc(makeGrid(0, 0, 20, 20), 5.25, 5.25, 2.5, SURF.fairway, 4, 9, { over: 'below' }).n, 81);
  });

  it('rub out turns fairway to rough, then rough to none; a none cell holds no hole or month', () => {
    const g = makeGrid(0, 0, 20, 20);
    paintDisc(g, 5.25, 5.25, 2.5, SURF.fairway, 3, 7);
    const r1 = paintDisc(g, 5.25, 5.25, 2.5, SURF.rough, 0, 0, { rub: true });
    assert.equal(r1.n, 81);
    assert.equal(countOf(g.surf, SURF.rough), 81);
    assert.equal(g.hole[210], 3); // rough keeps its hole and month
    assert.equal(g.month[210], 7);
    const r2 = paintDisc(g, 5.25, 5.25, 2.5, SURF.rough, 0, 0, { rub: true });
    assert.equal(r2.n, 81);
    assert.equal(countOf(g.surf, SURF.none), 400);
    assert.equal(g.hole[210], 0);
    assert.equal(g.month[210], 0);
    assert.equal(paintDisc(g, 5.25, 5.25, 2.5, SURF.rough, 0, 0, { rub: true }).n, 0);
    const h = makeGrid(0, 0, 20, 20);
    paintDisc(h, 5.25, 5.25, 2.5, SURF.green, 1, 1);
    paintDisc(h, 5.25, 5.25, 2.5, SURF.rough, 0, 0, { rub: true });
    assert.equal(countOf(h.surf, SURF.rough), 81); // a green rubs out to rough too
  });

  it('allow refuses cells: they keep their values and are left out of the diff', () => {
    const g = makeGrid(0, 0, 20, 20);
    const d = paintDisc(g, 5.25, 5.25, 2.5, SURF.fairway, 1, 1, { allow: (i) => i % 2 === 0 });
    assert.equal(d.n, 43); // even indices are the even columns of the disc: dx = -4, -2, 0, 2, 4
    assert.ok(d.idx.every((i) => i % 2 === 0));
    assert.equal(countOf(g.surf, SURF.fairway), 43);
    assert.equal(g.surf[215], SURF.none); // refused, on the rim
  });

  it('apply, undo and redo restore the arrays byte for byte, also after the grid grows; a merged diff undoes two steps at once', () => {
    const rnd = mulberry(5);
    const g = makeGrid(0, 0, 40, 40);
    const ops: Array<(q: Grid) => GridDiff> = [
      (q) => paintStroke(q, 2, 2, 17, 15, 3, SURF.fairway, 1, 4),
      (q) => paintDisc(q, 10, 10, 2.5, SURF.green, 2, 5, { over: 'below' }),
      (q) => fillPolygon(q, [{ x: 3, y: 12 }, { x: 18, y: 12 }, { x: 12, y: 19 }], SURF.tee, 3, 6),
      (q) => paintDisc(q, 9, 9, 3, SURF.rough, 0, 0, { rub: true }),
      (q) => paintStroke(q, 4, 18, 4, 4, 2, SURF.bunker, 1, 8),
      (q) => paintDisc(q, 6 + rnd() * 10, 6 + rnd() * 10, 1 + rnd() * 3, SURF.water, 4, 9, { over: 'below' }),
    ];
    const steps: GridDiff[] = [], before: Grid[] = [], after: Grid[] = [];
    for (const op of ops) { before.push(copy(g)); steps.push(op(g)); after.push(copy(g)); }
    assert.ok(steps[0].n > 0);
    for (let k = ops.length - 1; k >= 0; k--) { applyDiff(g, steps[k], true); assert.ok(sameGrid(g, before[k]), `undo ${k}`); }
    for (let k = 0; k < ops.length; k++) { applyDiff(g, steps[k], false); assert.ok(sameGrid(g, after[k]), `redo ${k}`); }

    // the grid grows: the same steps still undo and redo on the cells at the same tiles
    assert.throws(() => growGrid(g, 0, 0, 10, 10), RangeError);
    const big = growGrid(g, -5, -5, 70, 70);
    for (let k = ops.length - 1; k >= 0; k--) applyDiff(big, steps[k], true);
    assert.equal(countOf(big.surf, SURF.none), 70 * 70);
    for (let k = 0; k < ops.length; k++) applyDiff(big, steps[k], false);
    for (let cy = 0; cy < 40; cy++) for (let cx = 0; cx < 40; cx++) assert.equal(big.surf[(cy + 10) * 70 + cx + 10], g.surf[cy * 40 + cx]);
    assert.equal(70 * 70 - countOf(big.surf, SURF.none), 1600 - countOf(g.surf, SURF.none));

    // one merged diff undoes two steps at once
    const h = makeGrid(0, 0, 20, 20);
    const d1 = paintDisc(h, 5.25, 5.25, 2.5, SURF.fairway, 1, 1);
    const d2 = paintDisc(h, 5.25, 5.25, 2, SURF.green, 2, 2);
    const m = mergeDiffs(d1, d2);
    assert.equal(m.n, 81);
    const hDone = copy(h);
    applyDiff(h, m, true);
    assert.equal(countOf(h.surf, SURF.none), 400);
    assert.equal(countOf(h.hole, 0), 400);
    applyDiff(h, m, false);
    assert.ok(sameGrid(h, hDone));

    // a 10 x 10 cell grid, filled with a 5 x 5 tile square, takes 100 cells
    assert.equal(fillPolygon(makeGrid(0, 0, 10, 10), [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }], SURF.tee, 1, 1).n, 100);
  });

  it('round-trips a random grid; 1 M cells of four blobs save under 64 kB; a bad save gives null', (t) => {
    const rnd = mulberry(6);
    const g = makeGrid(-3, 4.5, 37, 53);
    for (let i = 0; i < g.surf.length; i++) { g.surf[i] = Math.floor(rnd() * 9); g.hole[i] = Math.floor(rnd() * 19); g.month[i] = Math.floor(rnd() * 65536); }
    const back = decodeGrid(JSON.parse(JSON.stringify(encodeGrid(g))));
    assert.ok(back);
    assert.ok(sameGrid(back, g));

    const big = makeGrid(0, 0, 1000, 1000);
    const blobs = [SURF.fairway, SURF.green, SURF.rough, SURF.water];
    for (let k = 0; k < 4; k++) paintDisc(big, 60 + rnd() * 440, 60 + rnd() * 440, 30 + rnd() * 60, blobs[k], k + 1, 3 + 10 * k);
    const json = JSON.stringify(encodeGrid(big));
    t.diagnostic(`1 M cells, four blobs: save ${json.length} bytes of JSON`);
    assert.ok(json.length < 65536, `save is ${json.length} bytes`);
    const back2 = decodeGrid(JSON.parse(json));
    assert.ok(back2);
    assert.ok(sameGrid(back2, big));

    const good = encodeGrid(makeGrid(0, 0, 4, 4));
    assert.ok(decodeGrid(good));
    assert.equal(decodeGrid(null), null);
    assert.equal(decodeGrid('grid'), null);
    assert.equal(decodeGrid({ ...good, v: 2 }), null);
    assert.equal(decodeGrid({ ...good, s: good.s.slice(0, -4) }), null);
    assert.equal(decodeGrid({ ...good, s: good.s + '!' }), null);
    assert.equal(decodeGrid({ ...good, hl: 'AAAA' }), null);
    assert.equal(decodeGrid({ ...good, w: 1e9 }), null);
    assert.equal(decodeGrid({ ...good, x0: 0.3 }), null);
    const bad = makeGrid(0, 0, 2, 2);
    bad.surf[0] = 9;
    assert.equal(decodeGrid(encodeGrid(bad)), null);
  });

  it('diffCost is the hand count times the price over new surfaces; rub out and none are free', () => {
    const g = makeGrid(0, 0, 20, 20);
    const laid = paintDisc(g, 5.25, 5.25, 2.5, SURF.fairway, 1, 1);
    assert.equal(diffCost(laid, price), 81 * 10);
    const green = paintDisc(g, 5.25, 5.25, 2, SURF.green, 2, 2); // radius 4 cells: 49 cells, all fairway
    assert.equal(green.n, 49);
    assert.equal(diffCost(green, price), 49 * 20);
    assert.equal(diffCost(paintDisc(g, 5.25, 5.25, 2.5, SURF.fairway, 1, 1, { over: 'below' }), price), 0);
    const rub = paintDisc(g, 5.25, 5.25, 2.5, SURF.rough, 0, 0, { rub: true }); // green and fairway to rough
    assert.equal(rub.n, 81);
    assert.equal(diffCost(rub, price), 0);
    assert.equal(diffCost(paintDisc(g, 5.25, 5.25, 2.5, SURF.rough, 0, 0, { rub: true }), price), 0); // rough to none
    assert.equal(diffCost(paintDisc(g, 5.25, 5.25, 2.5, SURF.rough, 0, 0), price), 81 * 2); // rough laid on map grass
  });

  it('is deterministic: the same seeded script gives the same diffs, cells and save', () => {
    const run = (): string => {
      const rnd = mulberry(42), g = makeGrid(0, 0, 60, 60), diffs: GridDiff[] = [];
      for (let k = 0; k < 20; k++) {
        const ax = rnd() * 30, ay = rnd() * 30, bx = rnd() * 30, by = rnd() * 30;
        const s = [SURF.fairway, SURF.green, SURF.tee, SURF.bunker, SURF.water][k % 5];
        diffs.push(paintStroke(g, ax, ay, bx, by, 1 + rnd() * 3, s, 1 + (k % 18), k, { over: k % 2 ? 'below' : 'any' }));
        if (k % 7 === 6) diffs.push(paintDisc(g, rnd() * 30, rnd() * 30, 2, SURF.rough, 0, 0, { rub: true }));
      }
      return JSON.stringify({ diffs, save: encodeGrid(g), cost: diffs.map((d) => diffCost(d, price)) });
    };
    const a = run(), b = run();
    assert.equal(a, b);
    assert.ok(a.length > 1000);
  });
});
