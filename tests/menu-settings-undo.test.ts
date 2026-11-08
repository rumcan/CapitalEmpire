// T359 (#1006), part 1 (the owner, 2026-11-08: "ctrl/z should always work to reset your prev menu setting change"): the build menus' settings are
// undo steps, in time order with the ground edits, on the same stack: a texture pick, its size, angle or pan, the border texture, This hole /
// Course default, Apply to all holes, the look editor's values, a grass of your own, the brush's shape and size. A slider's drag is one step,
// put on the stack when the pointer lets go; Apply to all holes is one step; Ctrl+Y (Ctrl+Shift+Z) does them again; a text field keeps its
// own undo. Pure, Node: the Paint tool with a stand-in host.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SURF, cellAt, fillPolygon, makeGrid, paintDisc, type Grid } from '../src/game/ext/course-grid';
import { PaintTool, type PaintHost } from '../src/game/paint-tool';
import { isTextEntry } from '../src/game/text-entry';
import { styleWords, settingLabel } from '../src/game/setting-labels';
import { GRASS_FAMILIES, normalizeGrasses, type CustomGrass } from '../src/game/golf/grasses';
import type { LookBook } from '../src/game/golf/looks';

/** hole o's fairway look in the book, and whether the owner has looks at all (read through functions: assert.equal narrows an indexed read to its asserted type) */
const fw = (book: LookBook, o: string) => book[o]?.fairway;
const has = (book: LookBook, o: string) => o in book;

function rig() {
  const g: Grid = makeGrid(0, 0, 160, 160);
  fillPolygon(g, [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 80 }, { x: 0, y: 80 }], SURF.rough, 1, 0);
  const book: LookBook = {};
  const st = { courseLook: 0, owners: [] as string[], saves: 0, toasts: [] as string[], grasses: [] as CustomGrass[] };
  const host: PaintHost = { setLotGround() {}, emit() {}, save() { st.saves++; }, toast(t) { st.toasts.push(t); }, affine() {}, placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [], golfMode: () => true,
    money: () => 1e9, spend() {}, grid: () => g, gridChanged() {}, changed() {}, ownedAt: () => true, lookBook: () => book,
    courseLook: () => { st.courseLook++; }, lookChanged: o => { st.owners.push(o); },
    grasses: () => st.grasses, setGrasses: l => { st.grasses = normalizeGrasses(l); }, grassFamily: () => GRASS_FAMILIES[0]!.id, firstCutTex: () => ({ tex: 'golfFirstCut', sc: 1, a: 0 }) };
  const p = new PaintTool(host); p.enterCourse();
  const lay = (label = 'lay fairway', x = 50, y = 27) => p.gridEdit(label, grid => ({ diffs: [paintDisc(grid, x, y, 3, SURF.fairway, 1, 0)], spent: 0 }));
  const laid = (x = 50, y = 27) => g.surf[cellAt(g, x, y)] === SURF.fairway;
  /** presses Ctrl+Z / Ctrl+Y through the tool's own key handler, as the engine hands it */
  const key = (k: string, shiftKey = false) => p.key({ key: k, code: `Key${k.toUpperCase()}`, shiftKey, altKey: false, ctrlKey: true, metaKey: false, preventDefault() {} } as unknown as KeyboardEvent);
  return { g, book, st, p, lay, laid, key };
}

test('a texture pick on a hole is one step: Ctrl+Z puts the look back, Ctrl+Y does it again', () => {
  const { p, book, st, key } = rig();
  p.setHole(1);
  p.setStyle({ tex: 'dirt' });
  assert.equal(fw(book, 'h1')?.tex, 'dirt'); assert.equal(p.style.tex, 'dirt');
  assert.equal(p.canUndo, true); assert.match(p.undoLabel, /fairway texture \(hole 1\)/);
  st.owners.length = 0;
  assert.ok(key('z'));
  assert.notEqual(fw(book, 'h1')?.tex, 'dirt', 'the texture is back'); assert.notEqual(p.style.tex, 'dirt', 'and the panel shows it');
  assert.equal(has(book, 'h1'), false, 'hole 1 had no looks of its own before the pick: it has none again');
  assert.deepEqual(st.owners, ['h1'], 'only hole 1\'s cells are drawn again');
  assert.equal(p.canUndo, false, 'nothing else to undo');
  assert.ok(key('y'));
  assert.equal(fw(book, 'h1')?.tex, 'dirt', 'Ctrl+Y: the pick again'); assert.equal(p.style.tex, 'dirt');
  assert.ok(key('z', true), 'Ctrl+Shift+Z is a redo too'); // (nothing to redo now)
  assert.equal(fw(book, 'h1')?.tex, 'dirt');
  key('z'); assert.ok(key('z', true)); assert.equal(fw(book, 'h1')?.tex, 'dirt', 'undo then Ctrl+Shift+Z');
});

test('the Course default: a texture pick is a step; undo draws every chunk again', () => {
  const { p, st } = rig();
  const was = p.brush.fairway.style.tex;
  p.setLookDefault(true);
  p.setStyle({ tex: 'gravel' });
  assert.equal(p.brush.fairway.style.tex, 'gravel');
  st.courseLook = 0;
  p.undoTop();
  assert.equal(p.brush.fairway.style.tex, was, 'the course default\'s texture is back');
  assert.ok(st.courseLook >= 1, 'the course is drawn again');
  p.undoTop();
  assert.equal(p.lookDefault, false, 'then This hole / Course default is a step of its own: back on the hole');
  assert.equal(p.canUndo, false);
});

test('a slider\'s drag is one step, recorded on release, not one per pixel', () => {
  const { p, book } = rig();
  p.setHole(1); p.setStyle({ tex: 'dirt' }); // (a step before it)
  p.holdSetting(true);
  for (let a = 5; a <= 60; a += 5) p.setStyle({ angle: a }); // twelve changes of the angle slider
  assert.equal(fw(book, 'h1')?.angle, 60);
  assert.equal(p.undoLabel.includes('texture angle'), true, 'the open gesture is the first to go');
  p.holdSetting(false);
  p.undoTop();
  assert.equal(fw(book, 'h1')?.angle, 0, 'one Ctrl+Z took the whole drag back');
  assert.equal(fw(book, 'h1')?.tex, 'dirt', 'and not the pick before it');
  p.undoTop();
  assert.equal(has(book, 'h1'), false);
  assert.equal(p.canUndo, false, 'the drag was one step, the pick another');
});

test('a drag that has not been let go yet is taken back whole by Ctrl+Z', () => {
  const { p, book } = rig();
  p.setHole(1); p.holdSetting(true);
  for (let a = 5; a <= 30; a += 5) p.setStyle({ scale: 1 + a / 100 });
  p.undoTop(); // (the pointer is still down)
  assert.equal(has(book, 'h1'), false, 'the whole drag is gone');
  p.holdSetting(false);
  assert.equal(p.canUndo, false);
  assert.equal(p.canRedo, true, 'and can be done again');
  p.redoTop(); assert.equal(fw(book, 'h1')?.scale, 1.3);
});

test('discrete changes are a step each: stepping a texture size with the buttons, a click at a time', () => {
  const { p, book } = rig();
  p.setHole(1);
  p.setStyle({ scale: 1.25 }); p.setStyle({ scale: 1.5625 }); p.setStyle({ scale: 1.953125 });
  p.undoTop(); assert.equal(fw(book, 'h1')?.scale, 1.5625);
  p.undoTop(); assert.equal(fw(book, 'h1')?.scale, 1.25);
  p.undoTop(); assert.equal(has(book, 'h1'), false);
});

test('pan, the border texture, exposure, blend and Round off are steps; the same pick again is none', () => {
  const { p, book } = rig();
  p.setHole(2);
  p.setStyle({ ox: 1.5, oy: -0.5 }); assert.equal(fw(book, 'h2')?.ox, 1.5);
  p.setStyle({ btex: 'gravel' }); p.setStyle({ tone: 1, toneAmt: 0.2 }); p.setStyle({ mtex: 'dirt' }); p.setRoundOff({ round: true, smooth: 0.4 });
  const n = (() => { let c = 0; while (p.canUndo) { p.undoTop(); c++; } return c; })();
  assert.equal(n, 5, 'five steps');
  assert.equal(has(book, 'h2'), false);
  p.redoTop(); p.redoTop(); p.redoTop(); p.redoTop(); p.redoTop();
  assert.equal(fw(book, 'h2')?.btex, 'gravel'); assert.equal(fw(book, 'h2')?.mtex, 'dirt'); assert.equal(fw(book, 'h2')?.round, true); assert.equal(fw(book, 'h2')?.smooth, 0.4);
  // the same pick again changes nothing: no step (hole 2 has looks of its own now)
  while (p.canUndo) p.undoTop();
  p.setStyle({ angle: 5 }); p.setStyle({ angle: 5 });
  p.undoTop();
  assert.equal(p.canUndo, false, 'no second step for a pick that changed nothing');
});

test('the Edges sliders (Border, Shadow, Length, Height) and the brush\'s radius are steps too', () => {
  const { p, st } = rig();
  p.setLookDefault(true, false);
  const b0 = p.courseBorder('fairway'), s0 = p.courseShadow('fairway'), l0 = p.courseLength('fairway');
  p.setCourseBorder(5); p.setCourseShadow(0.7); p.setCourseLength(5); p.setBrushR(9);
  assert.equal(p.courseBorder('fairway'), 5); assert.equal(p.brush.fairway.r, 9);
  st.courseLook = 0;
  p.undoTop(); assert.equal(p.brush.fairway.r, 5, 'the brush\'s size is back');
  p.undoTop(); assert.equal(p.courseLength('fairway'), l0);
  p.undoTop(); assert.equal(p.courseShadow('fairway'), s0);
  p.undoTop(); assert.equal(p.courseBorder('fairway'), b0);
  assert.ok(st.courseLook >= 1, 'the course is drawn again for the Edges');
  assert.equal(p.canUndo, false);
});

test('the brush\'s shape and size, and Layer under / Replace: steps with their words', () => {
  const { p } = rig();
  const cells = p.brushCells, sq = p.squareCells, rep = p.paintReplace;
  p.setBrushShape('round'); assert.equal(p.brushCells, 0); assert.match(p.undoLabel, /brush shape/);
  p.setBrushShape('square'); p.setBrushCells(3); assert.equal(p.brushCells, 3); assert.match(p.undoLabel, /brush size/);
  p.setPaintReplace(!rep); assert.equal(p.paintReplace, !rep);
  p.undoTop(); assert.equal(p.paintReplace, rep);
  p.undoTop(); assert.equal(p.brushCells, sq, 'size 3 undone: the square it was');
  p.undoTop(); assert.equal(p.brushCells, 0, 'square undone: round again');
  p.undoTop(); assert.equal(p.brushCells, cells);
  assert.equal(p.canUndo, false);
});

test('Apply to all holes is one step', () => {
  const { p, book, g, lay } = rig();
  // three holes with looks of their own (a stroke seeds a hole's look from the course default)
  for (const [h, x] of [[1, 20], [2, 40], [3, 60]] as const) { p.setHole(h); p.gridEdit(`hole ${h}`, grid => ({ diffs: [paintDisc(grid, x, 27, 2, SURF.fairway, h, 0)], spent: 0 })); p.seedLooks(`h${h}`); }
  assert.deepEqual(Object.keys(book).sort(), ['h1', 'h2', 'h3']);
  void g; void lay;
  p.setHole(2); p.setStyle({ tex: 'dirt' });
  const steps = () => { let c = 0; const snap = p.canUndo; void snap; return c; };
  void steps;
  const before = p.brush.fairway.style.tex;
  const holes = p.applyLookToAll('fairway');
  assert.deepEqual(holes, [1, 2, 3]);
  for (const o of ['h1', 'h2', 'h3']) assert.equal(fw(book, o)?.tex, 'dirt'); assert.equal(p.brush.fairway.style.tex, 'dirt', 'and the course default');
  assert.match(p.undoLabel, /apply the fairway look to all holes/);
  p.undoTop();
  for (const o of ['h1', 'h3']) assert.notEqual(fw(book, o)?.tex, 'dirt', `${o} has its look back`);
  assert.equal(fw(book, 'h2')?.tex, 'dirt', 'hole 2 keeps the pick made before Apply to all holes (its own step)');
  assert.equal(p.brush.fairway.style.tex, before, 'the course default too');
  p.redoTop();
  for (const o of ['h1', 'h2', 'h3']) assert.equal(fw(book, o)?.tex, 'dirt');
  assert.equal(p.brush.fairway.style.tex, 'dirt');
});

test('settings and ground edits share the stack, in the order they were made', () => {
  const { p, book, laid, lay } = rig();
  p.setHole(1);
  p.setStyle({ tex: 'dirt' });          // 1 a setting
  lay();                                // 2 a stroke
  p.setBrushCells(3);                   // 3 a setting
  lay('lay more', 20, 60);              // 4 a stroke
  p.setStyle({ angle: 30 });            // 5 a setting
  const cells = () => [p.brushCells, laid(), laid(20, 60), fw(book, 'h1')?.tex, fw(book, 'h1')?.angle] as const;
  assert.deepEqual(cells(), [3, true, true, 'dirt', 30]);
  p.undoTop(); assert.deepEqual(cells(), [3, true, true, 'dirt', 0], '5 undone: the angle');
  p.undoTop(); assert.deepEqual(cells(), [3, true, false, 'dirt', 0], '4 undone: the second stroke');
  p.undoTop(); assert.deepEqual(cells(), [1, true, false, 'dirt', 0], '3 undone: the brush size');
  p.undoTop(); assert.deepEqual(cells(), [1, false, false, 'dirt', 0], '2 undone: the first stroke');
  p.undoTop(); assert.equal(fw(book, 'h1')?.tex === 'dirt', false, '1 undone: the texture');
  p.redoTop(); p.redoTop(); p.redoTop();
  assert.deepEqual(cells(), [3, true, false, 'dirt', 0], 'three redone, in order');
  p.redoTop(); p.redoTop();
  assert.deepEqual(cells(), [3, true, true, 'dirt', 30]);
});

test('a new change drops the redo steps; the stack is capped', () => {
  const { p } = rig();
  p.setHole(1); p.setStyle({ tex: 'dirt' }); p.setStyle({ angle: 10 });
  p.undoTop(); assert.equal(p.canRedo, true);
  p.setStyle({ angle: 20 });
  assert.equal(p.canRedo, false, 'a setting after an undo is the new future');
  for (let i = 0; i < 130; i++) p.setStyle({ angle: (i % 40) + 21 });
  let n = 0; while (p.canUndo && n < 500) { p.undoTop(); n++; }
  assert.ok(n <= 100, `at most 100 steps are kept (${n})`);
});

test('a grass of your own: an edit of a made grass is a step; the name typed in its box is not', () => {
  const { p, st } = rig();
  p.openGrass(); assert.ok(p.createGrass());
  p.undoTop(); assert.equal(st.grasses.length, 0, 'the grass made is a step already (T271)'); p.redoTop(); assert.equal(st.grasses.length, 1);
  const k = st.grasses[0]!.k;
  p.openGrass(k);
  const was = st.grasses[0]!.scale;
  p.editGrass({ scale: 2 }); assert.equal(st.grasses[0]!.scale, 2);
  p.editGrass({ name: 'L' }); p.editGrass({ name: 'Li' }); p.editGrass({ name: 'Lin' });
  assert.equal(st.grasses[0]!.name, 'Lin');
  p.undoTop();
  assert.equal(st.grasses[0]!.scale, was, 'Ctrl+Z took the grass\'s size back (the name typing made no step of its own)');
  assert.equal(p.grassDraft?.scale, was, 'and its editor shows it');
  p.redoTop(); assert.equal(st.grasses[0]!.scale, 2);
});

test("a setting changed in Edit hole is ordered against the hole's strokes and plan steps as a stroke is", () => {
  // (Edit hole keeps a mark per stroke: Ctrl+Z takes back the latest of a stroke or a plan step; a setting changed there has its mark too)
  const PX = 16, g = makeGrid(0, 0, 900, 600), book: LookBook = {}, st = { plans: [] as unknown[], money: 5_000_000 };
  const host: PaintHost = { setLotGround() {}, emit() {}, save() {}, toast() {}, affine: o => { o[0] = 0; o[1] = 0; o[2] = PX; o[3] = 0; o[4] = 0; o[5] = PX; }, placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [],
    golfMode: () => true, currentMonth: () => 2, money: () => st.money, spend: n => { st.money -= n; }, grid: () => g, gridChanged() {}, changed() {}, ownedAt: () => true, plans: () => st.plans, setPlans: pl => { st.plans = pl; },
    lookBook: () => book, courseLook() {}, lookChanged() {} };
  const p = new PaintTool(host); p.enterCourse();
  const ts = (x: number, y: number) => ({ x: x * PX, y: y * PX });
  assert.ok(p.setPlan()); const w = p.wizard;
  assert.equal(w.press({ x: 40, y: 75 }, 40 * PX, 75 * PX, ts), 'tee'); w.move({ x: 140, y: 75 }, 140 * PX, 75 * PX, ts);
  assert.equal(w.press({ x: 140, y: 75 }, 140 * PX, 75 * PX, ts), 'green'); assert.ok(p.buildPlan());
  assert.ok(p.editHole(1) && p.setEditBrush('fairway', 0), 'Edit hole 1 with the fairway brush in hand');
  assert.ok(p.editInHand);
  const laid = () => g.surf[cellAt(g, 100, 40)] === SURF.fairway;
  p.gridEdit('stroke', grid => ({ diffs: [paintDisc(grid, 100, 40, 2, SURF.fairway, 1, 0)], spent: 0 }));
  assert.equal(laid(), true);
  p.setStyle({ tex: 'dirt' });
  assert.equal(fw(book, 'h1')?.tex, 'dirt');
  p.undoTop(); assert.notEqual(fw(book, 'h1')?.tex, 'dirt', 'the setting first'); assert.equal(laid(), true, 'the stroke still laid');
  p.undoTop(); assert.equal(laid(), false, 'then the stroke');
  p.redoTop(); assert.equal(laid(), true, 'the stroke again first'); assert.notEqual(fw(book, 'h1')?.tex, 'dirt');
  p.redoTop(); assert.equal(fw(book, 'h1')?.tex, 'dirt', 'then the setting');
});

test('Ctrl+Z from a slider, a tick box or a button is the game\'s; from a text box it is the box\'s', () => {
  assert.equal(isTextEntry({ tagName: 'INPUT', type: 'text' }), true);
  assert.equal(isTextEntry({ tagName: 'INPUT', type: 'number' }), true);
  assert.equal(isTextEntry({ tagName: 'INPUT', type: 'search' }), true);
  assert.equal(isTextEntry({ tagName: 'TEXTAREA' }), true);
  assert.equal(isTextEntry({ tagName: 'DIV', isContentEditable: true }), true);
  for (const type of ['range', 'checkbox', 'radio', 'button', 'color', 'file']) assert.equal(isTextEntry({ tagName: 'INPUT', type }), false, type);
  assert.equal(isTextEntry({ tagName: 'BUTTON' }), false); assert.equal(isTextEntry(null), false);
});

test('the words of a step', () => {
  assert.equal(styleWords({ tex: 'dirt' }), 'texture'); assert.equal(styleWords({ btex: 'dirt' }), 'border texture'); assert.equal(styleWords({ ox: 1, oy: 2 }), 'texture position');
  assert.equal(styleWords({ mow: {} }), 'mowing lines'); assert.equal(styleWords({ zzz: 1 }), 'look');
  assert.equal(settingLabel('fairway', 'texture', 'h3'), 'fairway texture (hole 3)'); assert.equal(settingLabel('longGrass', 'shadow', 'default'), 'long grass shadow (course default)');
});
