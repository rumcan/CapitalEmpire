// T260 (#763; the owner, 2026-10-29: "the border needs to be set to none for everything except fairways and greens who have fringe and
// seconds cut as their borders by default"; "at the bottom theres an accordion for border that doesnt open anything"; "Edges is just a heading
// on hole one when i edit it"). A course Border can be none (the slider's left end): a width of 0 lays no band at all. By default the fairway's
// first cut and the green's fringe are laid as before; a tee, a bunker and a pond lay none until the player sets a Border. The Border section
// and More options › Edges never open empty, and the pucks show no band ring for a surface whose Border is none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { CELL_T, SURF, fillPolygon, makeGrid, type Grid } from '../src/game/ext/course-grid';
import { chunkOutlines } from '../src/game/ext/course-blobs';
import { BORDER_MIN_M, borderBase, clampBorder, coursePatch, courseStyles, type CourseLooks } from '../src/game/ext/course-grid/patch';
import { DRAW_ORDER, drawOrder, layerCode } from '../src/game/ext/course-walls';
import { DEFAULT_COURSE_FINISH, FINISH_OFF, borderDefault, finishBorders } from '../src/game/course-finish';
import { puckBandOf, type BrushLooks } from '../src/game/course-look';
import { BORDER_KINDS, GRID_KINDS, PaintTool, type PaintHost } from '../src/game/paint-tool';
import { CourseEdges, courseBorderAt, courseBorderPos } from '../src/ui/course/CourseEdges';
import type { Game } from '../src/game/engine';

const D = DEFAULT_COURSE_FINISH;
/** a localStorage stand-in (the Border rides with the brush look) */
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, String(v)); }, removeItem: (k: string) => { store.delete(k); } };
/** the Paint tool's host as the engine wires the Border: the course finish's defaults (T227), none round a tee, a bunker or a pond (T260) */
const host = (fin = D): PaintHost => ({ setLotGround() {}, emit() {}, save() {}, toast() {}, affine() {}, placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [], collarDefault: s => borderDefault(s, fin) });
const LOOKS: CourseLooks = {
  surf: [undefined, { tex: 'golfRough', sc: 1, a: 0 }, { tex: 'golfFescue', sc: 1, a: 0 }, { tex: 'waterDark', sc: 1, a: 0 }, { tex: 'golfFairway', sc: 1, a: 0 }, { tex: 'golfTee', sc: 1, a: 0 }, { tex: 'bunkerSand', sc: 1, a: 0 }, { tex: 'wasteSand', sc: 1, a: 0 }, { tex: 'golfGreen', sc: 1, a: 0 }],
  collar: { 'first-cut': { tex: 'golfFirstCut', sc: 1, a: 0 }, fringe: { tex: 'golfFringe', sc: 1, a: 0 }, lip: { tex: 'golfRough', sc: 1, a: 0 }, bank: { tex: 'rockyDirt', sc: 1, a: 0 } },
};
const box = (g: Grid, x0: number, y0: number, x1: number, y1: number, s: number) =>
  fillPolygon(g, [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], s, 1, 0);
/** a hole in chunk (0, 0): a fairway, a green off its end, a tee in the map grass, a bunker and a pond */
function course(): Grid {
  const g = makeGrid(0, 0, 200, 200);
  box(g, 10, 10, 36, 30, SURF.fairway); box(g, 42, 14, 52, 26, SURF.green); box(g, 3, 17, 7, 23, SURF.tee);
  box(g, 20, 34, 26, 38, SURF.bunker); box(g, 34, 40, 44, 50, SURF.water);
  return g;
}
const BANDLESS = [SURF.tee, SURF.bunker, SURF.water], BANDED = [SURF.fairway, SURF.green];
/** set cells of a cover (1 or a partial ring) */
const cells = (o: Uint8Array) => { let n = 0; for (const v of o) if (v) n++; return n; };

test('by default a tee, a bunker and a pond lay no collar cells; the fairway\'s first cut and the green\'s fringe are laid as before', () => {
  for (const fin of [D, FINISH_OFF]) {
    const tool = new PaintTool(host(fin)), border = finishBorders(tool.courseBorders(), fin);
    for (const s of BANDLESS) assert.equal(border[s], 0, `surface ${s}: none`);
    assert.equal(border[SURF.fairway], fin.on ? D.collarWidth : 2); assert.equal(border[SURF.green], fin.on ? D.collarWidth / 2 : 1);
    // the slider reads the same: none for a tee, a bunker and a pond, the first cut and the fringe as before
    assert.equal(tool.courseBorder('tee'), 0); assert.equal(tool.courseBorder('bunker'), 0); assert.equal(tool.courseBorder('water'), 0);
    assert.equal(tool.courseBorder('fairway'), border[SURF.fairway]); assert.equal(tool.courseBorder('green'), border[SURF.green]);
    // the collar entry stays at width 0, so the draw order's layer codes are the same
    const styles = courseStyles(border);
    for (const s of BANDLESS) assert.equal(styles[s]!.collar!.width, 0);
    assert.deepEqual(drawOrder(styles), [...DRAW_ORDER]);
    // the contours: no band and no collar cells for a tee, a bunker or a pond; a band for the fairway and the green
    const g = course(), outs = chunkOutlines(g, 0, 0, 64, styles, true), of = (s: number) => outs.find(o => o.surf === s)!;
    for (const s of BANDLESS) { const o = of(s); assert.ok(o.fill.length, `surface ${s} drawn`); assert.equal(o.collar, undefined, `surface ${s}: no band`); assert.equal(o.cover!.c, null, `surface ${s}: no collar cells`); }
    for (const s of BANDED) { const o = of(s); assert.ok(o.collar!.fill.length, `surface ${s}: its band`); assert.ok(cells(o.cover!.c!.occ) > cells(o.cover!.s.occ), `surface ${s}: collar cells`); }
    // the patch: no rings for a bandless surface, only the band's look (w 0: a tee's bank keeps its first cut's grass)
    const p = coursePatch(g, 0, 0, { ...LOOKS, border }, 0)!, layer = (s: number) => p.course!.layers.find(l => l.s === s)!;
    for (const s of BANDLESS) { const c = layer(s).collar!; assert.equal(c.w, 0); assert.equal(c.fill.length, 0); assert.equal(c.edges.length, 0); }
    assert.equal(layer(SURF.tee).collar!.tex, 'golfFirstCut', 'the tee\'s bank grass');
    assert.equal(layer(SURF.fairway).collar!.w, border[SURF.fairway]! * CELL_T); assert.ok(layer(SURF.fairway).collar!.fill.length);
    assert.equal(layer(SURF.green).collar!.w, border[SURF.green]! * CELL_T); assert.ok(layer(SURF.green).collar!.fill.length);
    // no wall stands on a collar that is not laid; the tee stands on its own edge, with its stairs (T127)
    const codes = new Set(BANDLESS.map(s => layerCode(s, true)));
    assert.ok(!p.course!.walls!.some(w => codes.has(w.lo)), 'no wall over a missing band');
    assert.ok(p.course!.walls!.some(w => w.hs === SURF.tee && w.f), 'the tee\'s bank');
    assert.ok((p.course!.st ?? []).length >= 5, 'the tee\'s stairs');
  }
  // the base widths without a host or a finish: the fairway's 2 m and the green's metre (BLOB_STYLE), the rest none
  assert.deepEqual([SURF.water, SURF.fairway, SURF.tee, SURF.bunker, SURF.green].map(borderBase), [0, 2, 0, 0, 1]);
});

test('a Border the player sets brings a tee\'s first cut back (and is kept); the slider\'s left end, none, takes it away again', () => {
  store.clear();
  const tool = new PaintTool(host()), g = course();
  const laid = () => coursePatch(g, 0, 0, { ...LOOKS, border: finishBorders(tool.courseBorders(), D) }, 0)!.course!.layers.find(l => l.s === SURF.tee)!.collar!;
  assert.equal(laid().fill.length, 0, 'none by default');
  tool.setCourseBorder(1, 'tee');
  assert.equal(tool.courseBorder('tee'), 1);
  assert.equal(finishBorders(tool.courseBorders(), D)[SURF.tee], 1, 'a set Border wins over the default');
  const c = laid(); assert.ok(c.fill.length, 'the first cut is back'); assert.equal(c.w, 1 * CELL_T); assert.equal(c.n, 'first-cut');
  // the tee's walls now stand on the band's outer edge (its platform), as before T260
  const outs = chunkOutlines(g, 0, 0, 64, courseStyles(finishBorders(tool.courseBorders(), D)), true);
  assert.ok(outs.find(o => o.surf === SURF.tee)!.cover!.c, 'collar cells');
  // remembered with the brush look: a new tool (a reload) keeps it
  assert.equal(new PaintTool(host()).courseBorder('tee'), 1);
  // the slider at its left end: none, no band; saved as none
  tool.setCourseBorder(courseBorderAt(0), 'tee');
  assert.equal(tool.courseBorder('tee'), 0); assert.equal(laid().fill.length, 0);
  assert.equal(new PaintTool(host()).courseBorder('tee'), 0);
  // the fairway's first cut can be none too, and a width above none is never below a hairline
  tool.setCourseBorder(0, 'fairway'); assert.equal(tool.courseBorder('fairway'), 0);
  tool.setCourseBorder(0.01, 'bunker'); assert.equal(tool.courseBorder('bunker'), BORDER_MIN_M);
  assert.equal(clampBorder(-2), 0); assert.equal(clampBorder(0.02), BORDER_MIN_M);
  // the slider: position 0 is none, 1 the hairline, and it goes round to the width it shows
  assert.equal(courseBorderPos(0), 0); assert.equal(courseBorderAt(0), 0);
  assert.equal(courseBorderPos(BORDER_MIN_M), 1); assert.ok(Math.abs(courseBorderAt(1) - BORDER_MIN_M) < 1e-3);
  for (const m of [0.5, 1, 2, 4, 8]) assert.ok(Math.abs(courseBorderAt(courseBorderPos(m)) - m) < 0.03, `${m} m`);
  store.clear();
});

test('the pucks and the cursor\'s chip show no band ring for a surface whose Border is none', () => {
  store.clear();
  const tool = new PaintTool(host()), b = tool.brush as BrushLooks;
  for (const k of ['tee', 'bunker', 'water'] as const) {
    assert.equal(puckBandOf(k, b, D), null, `${k}: none by default`);
    assert.equal(puckBandOf(k, b, D, tool.courseBorder(k)), null, `${k}: its Border none`);
    assert.ok(puckBandOf(k, b, D, 1), `${k}: a Border set shows its band`);
  }
  for (const k of ['fairway', 'green'] as const) {
    assert.ok(puckBandOf(k, b, D), `${k}: banded by default`); assert.ok(puckBandOf(k, b, D, tool.courseBorder(k)), `${k}: its Border`);
    assert.equal(puckBandOf(k, b, D, 0), null, `${k}: none when set to none`);
  }
  for (const k of ['rough', 'longGrass', 'waste']) assert.equal(puckBandOf(k, b, D, 1), null, `${k}: never a band`);
});

test('the Border section and More options › Edges never open empty: Border: none with a note, the slider at none for a bandless tee', () => {
  store.clear();
  const tool = new PaintTool(host()), game = { paint: tool } as unknown as Game;
  const html = (k: (typeof GRID_KINDS)[number]) => { tool.setBrush(k); return renderToStaticMarkup(createElement(CourseEdges, { game })); };
  for (const k of GRID_KINDS) {
    const h = html(k);
    assert.match(h, />Border</, `${k}: a Border line`);
    if (!BORDER_KINDS[k]) {
      assert.match(h, /data-border="none"[^>]*>none</, `${k}: Border: none`);
      assert.match(h, /has no border band on the course/, `${k}: the note`);
      assert.doesNotMatch(h, /type="range" aria-label="Border/, `${k}: no Border slider`); // T253: its Round off Smoothness slider is there
    } else assert.match(h, /type="range"/, `${k}: its slider`);
  }
  // a tee, a bunker and a pond start at none, with a note how to lay one; the fairway and the green at their widths
  for (const [k, band] of [['tee', 'first cut'], ['bunker', 'lip'], ['water', 'bank']] as const) {
    const h = html(k);
    assert.match(h, /aria-label="Border[^"]*"[^>]*value="0"|value="0"[^>]*aria-label="Border/, `${k}: the slider at none`);
    assert.match(h, /data-border="none"[^>]*>none</); assert.match(h, new RegExp(`No ${band} round the `));
  }
  for (const k of ['fairway', 'green'] as const) { const h = html(k); assert.match(h, /data-border="on"/); assert.doesNotMatch(h, /No (first cut|fringe) round/); }
  tool.setCourseBorder(1.5, 'tee'); assert.match(html('tee'), /data-border="on"[^>]*>1\.5 m</, 'set: its width');
  store.clear();
});
