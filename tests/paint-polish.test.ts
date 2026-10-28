// T252 (#731; the owner, 2026-10-28): course painting's polish. "change the icon the the puck with the actual texture with the border it has":
// each Holes swatch is the surface's puck, drawn as the brush cursor's chip is (its own painted family through its look, and the border the
// course lays round it); "bunker is selected but it shows the fairway puck": the chip follows the surface in hand in Shape by hand and in Edit
// hole, and Erase's chip is an eraser; "remove cart path from that menu": no cart path brush, Long grass on key 8; "add the sculpting too to
// raise and lower and flatten ground to the hole editing": Edit hole's Ground height. Headless: the Paint tool, the cursor and the panels with
// stand-ins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { BRUSH_PRESETS, SURFACE_BRUSHES } from '../src/game/paint';
import { PaintTool, type PaintHost } from '../src/game/paint-tool';
import { CourseCursor, BADGE, paintBadge, swatchPuck, type CursorTexture, type CursorView, type SpriteCanvas } from '../src/game/ext/course-cursor';
import { SURF, cellAt, makeGrid } from '../src/game/ext/course-grid';
import { gridAreas } from '../src/game/ext/course-grid/areas';
import { aimsFromPlans, decodePlans } from '../src/game/ext/hole-wizard';
import { createCourseHeightField } from '../src/game/ext/course-height';
import { COLLAR_TINT, DEFAULT_COURSE_FINISH, FINISH_OFF } from '../src/game/course-finish';
import { SURFACE_BAND, puckBandOf, type BrushLooks } from '../src/game/course-look';
import { clampSurfaces, lookOfTex } from '../src/game/painted-surfaces';
import { PRESETS } from '../src/game/paint-presets';
import { numberKeyUse } from '../src/game/tool-modes';
import { puckLookOf } from '../src/ui/course/swatch-puck';
import { SurfaceSwatches } from '../src/ui/course/BrushControls';
import { computeProgressiveUiState } from '../src/game/ext/progressive-ui';
import type { Game } from '../src/game/engine';
import FILE from '../src/game/painted-surfaces.json';

/** a localStorage stand-in (the brush shape and sizes are remembered) */
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, String(v)); }, removeItem: (k: string) => { store.delete(k); } };
const HOST = { setLotGround() {}, emit() {}, save() {}, toast() {}, affine() {}, placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [] };
const SURFACES = clampSurfaces(FILE);
/** the painted family a texture wears (painted-surfaces.json, through the presets) */
const familyOf = (tex: string) => lookOfTex(tex, SURFACES, PRESETS)?.family ?? null;
const fileFamily = (key: string) => (FILE.surfaces as Record<string, { family: string }>)[key]!.family;

/** a 2D context that records each call by name and each property it is given */
function recorder() {
  const ops: string[] = [], sets: string[] = [];
  const ctx = new Proxy({ canvas: { width: 64, height: 48 } } as Record<string, unknown>, {
    get(o, p: string) {
      if (p in o) return o[p];
      return (..._a: unknown[]) => { ops.push(p); return p === 'createLinearGradient' || p === 'createRadialGradient' ? { addColorStop() {} } : undefined; };
    },
    set(o, p: string, v) { o[p] = v; sets.push(`${p}=${String(v)}`); return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, ops, sets };
}
/** a canvas factory of recorded canvases */
function canvases() {
  const made: ReturnType<typeof recorder>[] = [];
  const make = (w: number, h: number): SpriteCanvas => { const r = recorder(); made.push(r); return { width: w, height: h, getContext: () => r.ctx }; };
  return { make, made };
}
/** a texture source that records the textures asked for (and has none: the swatch colours stand in) */
function picker() { const picks: string[] = []; const tex: CursorTexture = { pick: t => { picks.push(t); return null; }, rev: () => 0 }; return { tex, picks }; }
const view = (z: number, dpr = 1): CursorView => ({ ze: z * dpr, camX: 0, camY: 0, cw: 1600 * dpr, ch: 1000 * dpr, dpr });

// ---------- no cart path brush ----------
test('no cart path brush: the swatches and the keys 1-8 leave it out (Course › Cart paths & roads lays them), Long grass is key 8; its look stays', () => {
  assert.deepEqual(SURFACE_BRUSHES.map(b => b.kind), ['fairway', 'green', 'tee', 'rough', 'bunker', 'water', 'waste', 'longGrass']);
  assert.ok(BRUSH_PRESETS.some(b => b.kind === 'path'), 'the cart path keeps its look: old saves\' cart-path areas and the Stamps wear it');
  assert.deepEqual(numberKeyUse('course', 8), { k: 'surface', i: 7 }); assert.equal(numberKeyUse('course', 9), null);
  const g = makeGrid(80, 180, 80, 80);
  const tool = new PaintTool({ ...HOST, golfMode: () => true, grid: () => g, gridChanged() {}, gridAreas: () => gridAreas(g), ownedAt: () => true, landWhy: () => '', money: () => 1e6, spend() {} });
  tool.course = true; tool.setBrush('fairway');
  const key = (k: string) => tool.key({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, preventDefault() {} } as unknown as KeyboardEvent);
  for (let n = 1; n <= 8; n++) { assert.equal(key(String(n)), true); assert.equal(tool.brushKind, SURFACE_BRUSHES[n - 1]!.kind, `key ${n}`); assert.notEqual(tool.brushKind, 'path'); }
  assert.equal(tool.brushKind, 'longGrass', 'key 8 is Long grass');
  assert.equal(key('9'), false, 'key 9 picks nothing'); assert.equal(tool.brushKind, 'longGrass');
  // the panel: no cart path swatch even once the stage opens the cart path (its Stamps piece)
  const ui = computeProgressiveUiState({ advancedMode: true, playableHoles: 9, seasonsDone: 3, invited: true, elapsedSeconds: 9999, roadsBuilt: 9, carParksBuilt: 1, eventStructuresPlaced: 3, stageReached: 3 });
  assert.ok((ui.visibleCourseBrushes as string[]).includes('path'), 'stage 3: the cart path piece is open');
  const fake = { toolUi: () => ui, paint: { brush: tool.brush } } as unknown as Game;
  const h = renderToStaticMarkup(createElement(SurfaceSwatches, { game: fake, on: 'longGrass', pick: () => {} }));
  assert.equal((h.match(/data-swatch=/g) ?? []).length, 8); assert.doesNotMatch(h, /data-swatch="path"|Cart path/);
  assert.match(h, /data-swatch="longGrass"[^>]*title="Long grass \(key 8\)"/);
  // under plain node no pucks: the swatch keeps its marked disc (as Icon.tsx goes without pictures)
  assert.match(h, /data-puck="mark"/); assert.doesNotMatch(h, /data-puck="texture"/);
});

// ---------- the swatches ----------
test('the swatch uses the surface\'s family: its puck wears the painted tile its look names, with the border the course lays round it', () => {
  const brush = new PaintTool({ ...HOST }).brush as BrushLooks;
  for (const b of SURFACE_BRUSHES) {
    const look = puckLookOf(b.kind, brush)!;
    assert.equal(familyOf(look.st.tex), fileFamily(b.kind), `${b.name} wears its painted family`);
    // T260: by default only the fairway's first cut and the green's fringe are laid; a tee, a bunker and a pond have none
    assert.equal(look.pb?.name ?? null, b.kind === 'fairway' || b.kind === 'green' ? SURFACE_BAND[b.kind]! : null, `${b.name}'s border`);
    // with a Border set, every banded surface shows its band
    assert.equal(puckLookOf(b.kind, brush, 1)!.pb?.name ?? null, SURFACE_BAND[b.kind] ?? null, `${b.name}'s border, set`);
  }
  const band = (kind: string, fin = DEFAULT_COURSE_FINISH) => puckBandOf(kind, brush, fin, 1)!;
  // the green's fringe, the fairway's and the tee's first cut: the collar's own family, in the course finish's darker collar tone
  assert.equal(familyOf(band('green').tex.tex), fileFamily('fringe'));
  for (const k of ['fairway', 'tee']) { assert.equal(band(k).name, 'first-cut'); assert.equal(familyOf(band(k).tex.tex), fileFamily('firstCut')); assert.equal(band(k).tone?.tc, COLLAR_TINT); }
  assert.equal(band('green').tone?.tc, COLLAR_TINT);
  // the bunker's lip: in the fairway's first cut with the finish (T227), in the rough's grass without it
  assert.equal(familyOf(band('bunker').tex.tex), fileFamily('firstCut')); assert.equal(band('bunker').tone?.tc, COLLAR_TINT);
  assert.equal(familyOf(band('bunker', FINISH_OFF).tex.tex), fileFamily('rough')); assert.equal(band('bunker', FINISH_OFF).tone, null);
  // the pond's bank in the rough's grass (its wet soil painted over it); the rough, the long grass and the waste area plain
  assert.equal(band('water').name, 'bank'); assert.equal(familyOf(band('water').tex.tex), fileFamily('rough'));
  for (const k of ['rough', 'longGrass', 'waste']) assert.equal(puckBandOf(k, brush, DEFAULT_COURSE_FINISH), null, `${k}: plain`);
  // the puck is drawn from those textures: the surface's own, then its border's
  for (const b of SURFACE_BRUSHES) {
    const look = puckLookOf(b.kind, brush)!, { tex, picks } = picker(), { make } = canvases();
    const { whole } = swatchPuck(make, b.kind, look.st, look.pb, 44, 2, tex);
    assert.ok(picks.includes(look.st.tex), `${b.name}: its own texture`);
    if (look.pb) assert.ok(picks.includes(look.pb.tex.tex), `${b.name}: its border's texture`);
    assert.equal(whole, false, 'a picture still loading: drawn again when it lands');
  }
  // a look changed (My looks): the puck follows it
  const mine = { ...brush, bunker: { style: { ...brush.bunker!.style, tex: 'golfFairway' } } } as BrushLooks;
  const { tex, picks } = picker(), look = puckLookOf('bunker', mine)!;
  swatchPuck(canvases().make, 'bunker', look.st, look.pb, 44, 1, tex);
  assert.ok(picks.includes('golfFairway'), 'the bunker in its new look');
});

// ---------- the cursor ----------
/** a golf game's Paint tool on a course grid with its cursor wired as the engine wires it, recording the textures each chip asks for */
function cursorRig() {
  const g = makeGrid(0, 0, 200, 200), money = { cash: 1e6 };
  const tool = new PaintTool({ ...HOST, golfMode: () => true, grid: () => g, gridChanged() {}, gridAreas: () => gridAreas(g), ownedAt: () => true, landWhy: () => '', money: () => money.cash, spend: (n: number) => { money.cash -= n; } });
  tool.course = true; tool.setBrush('fairway'); tool.cursor = { x: 40.2, y: 50.7 };
  const { tex, picks } = picker(), { make, made } = canvases();
  const cur = new CourseCursor({ canvas: make, texture: tex, why: () => tool.brushSkipWhy(), cost: () => tool.brushCellCost(), rev: () => g.rev * 64 + tool.brushHole * 2 + (tool.rubOut ? 1 : 0), money: () => money.cash, finish: () => DEFAULT_COURSE_FINISH });
  /** one frame: the textures the chips drawn in it asked for */
  const frame = (t = 1000) => { const n = picks.length; cur.draw(recorder().ctx, view(0.3), tool, t); return picks.slice(n); };
  return { g, tool, cur, picks, made, frame };
}
test('the cursor follows the surface in hand: its chip is the surface\'s puck (its look and its border); Erase shows an eraser', () => {
  const { tool, cur, made, frame } = cursorRig(), brush = tool.brush as BrushLooks;
  for (const kind of ['bunker', 'fairway', 'green', 'water', 'longGrass'] as const) {
    tool.setBrush(kind);
    const n = made.length, asked = frame(), look = puckLookOf(kind, brush)!;
    assert.ok(made.length > n, `${kind}: a chip of its own`);
    assert.ok(asked.includes(look.st.tex), `${kind}: the chip wears the surface in hand (${asked.join(', ')})`);
    if (look.pb) assert.ok(asked.includes(look.pb.tex.tex), `${kind}: with its border`);
    assert.equal(cur.last.shown, true);
  }
  // the bunker never shows the fairway's puck
  tool.setBrush('bunker'); const asked = frame(2000), fw = brush.fairway!.style.tex;
  assert.ok(!asked.includes(fw) || puckBandOf('bunker', brush, DEFAULT_COURSE_FINISH, 1)!.tex.tex !== fw, 'no fairway face on the bunker chip');
  // Erase: an eraser (its pink rubber and paper sleeve), the dashed line round it, the eraser on its badge; no surface's face
  tool.rubOut = true; const n = made.length, erased = frame(3000);
  assert.equal(cur.state.kind === 'erase' || cur.state.kind === 'nochange', true);
  const chip = made[n]!; assert.ok(chip, 'a chip of its own');
  assert.ok(chip.sets.includes('fillStyle=#ef9097'), 'the rubber'); assert.ok(chip.sets.includes('fillStyle=#f1f3f7'), 'the sleeve');
  assert.ok(chip.ops.includes('setLineDash'), 'the dashed line round it');
  assert.deepEqual(erased, [], 'no surface texture on its face');
  // the eraser badge draws inside its badge
  const r = recorder(); paintBadge(r.ctx, 'eraser', 100, 60, 1); assert.ok(r.ops.includes('fill') && r.ops.includes('rotate'));
  assert.ok(BADGE.r > 0);
});

// ---------- Edit hole: the cursor, the looks, Ground height ----------
const PX = 16;
/** two built holes (the course-painting.test.ts stand-in: 16 css px a tile, your land x < 300), with the ground's height field */
function golf() {
  const g = makeGrid(0, 0, 1000, 1400), f = createCourseHeightField();
  const st = { money: 5_000_000, plans: [] as unknown[], aims: [] as never[], heightBoxes: 0 };
  const host: PaintHost = {
    ...HOST, affine: o => { o[0] = 0; o[1] = 0; o[2] = PX; o[3] = 0; o[4] = 0; o[5] = PX; },
    golfMode: () => true, currentMonth: () => 2, money: () => st.money, spend: n => { st.money -= n; },
    grid: () => g, gridChanged() {}, ownedAt: x => x < 300, plans: () => st.plans,
    setPlans: p => { const before = decodePlans(st.plans); st.plans = p; st.aims = aimsFromPlans(st.aims, before, decodePlans(p)) as never[]; },
    fitView() {}, courseHeight: () => f, heightChanged: () => { st.heightBoxes++; },
  };
  const tool = new PaintTool(host); tool.enterCourse();
  const at = (p: { x: number; y: number }) => [p, p.x * PX, p.y * PX] as const;
  const down = (x: number, y: number) => { tool.pointerDown(...at({ x, y })); tool.pointerUp(0.5); };
  const stroke = (a: { x: number; y: number }, b: { x: number; y: number }) => { tool.pointerDown(...at(a)); tool.pointerMove(...at(b)); tool.pointerUp(0.5); };
  tool.setBrushCells(2);
  assert.ok(tool.setPlan()); down(40, 120); down(230, 120); assert.ok(tool.buildPlan());
  assert.ok(tool.setPlan()); down(40, 260); down(230, 260); assert.ok(tool.buildPlan());
  tool.setBrush('fairway');
  return { g, f, st, tool, w: tool.wizard, stroke, at };
}
const key = (tool: PaintTool, k: string) => tool.key({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, preventDefault() {} } as unknown as KeyboardEvent);

test('Edit hole: the cursor shows the surface in hand there too (Bunker in hand: the bunker\'s puck)', () => {
  const { tool } = golf(), brush = tool.brush as BrushLooks;
  assert.ok(tool.editHole(1)); assert.ok(tool.setEditBrush('bunker'));
  tool.cursor = { x: 120, y: 132 };
  const { tex, picks } = picker(), cur = new CourseCursor({ canvas: canvases().make, texture: tex, why: () => tool.brushSkipWhy(), cost: () => tool.brushCellCost(), money: () => 1e9 });
  cur.draw(recorder().ctx, view(0.3), tool, 1000);
  assert.ok(picks.includes(brush.bunker!.style.tex), 'the bunker\'s sand'); assert.ok(!picks.includes(brush.fairway!.style.tex), 'not the fairway');
  key(tool, '2'); cur.draw(recorder().ctx, view(0.3), tool, 1100);
  assert.equal(tool.brushKind, 'green'); assert.ok(picks.includes(brush.green!.style.tex), 'key 2: the green\'s puck');
});

test('Edit hole\'s Ground height: Raise, Lower, Smooth, Flatten round the open hole, the plan\'s handles still drag, one undo step a stroke', () => {
  const o = golf(), { g, f, tool, w } = o;
  assert.ok(tool.editHole(1)); assert.equal(tool.mode, 'plan');
  assert.ok(tool.setEditHeight({ mode: 'raise', r: 6, level: 3 }), 'Ground height picked in the card');
  assert.equal(tool.mode, 'height'); assert.equal(tool.planOpen, true); assert.equal(tool.editingHole, 1, 'still Edit hole 1'); assert.equal(tool.editInHand, true);
  assert.equal(tool.heightMode, 'raise'); assert.equal(tool.heightR, 6); assert.equal(tool.heightLevel, 3);
  // a stroke raises the ground: one undo step, Edit hole stays open
  const z0 = f.data.slice(), undos = tool.undoLabel;
  o.stroke({ x: 120, y: 150 }, { x: 126, y: 150 });
  assert.ok(f.data.some((v, i) => v !== z0[i]), 'the ground moved'); assert.match(tool.undoLabel, /raise ground/); assert.notEqual(tool.undoLabel, undos);
  assert.equal(tool.editingHole, 1); assert.equal(tool.mode, 'height');
  // the settings change without leaving Edit hole ([ ] and the panel's buttons)
  assert.equal(key(tool, ']'), true); assert.equal(tool.heightR, 7); assert.equal(tool.editingHole, 1, '] keeps Edit hole');
  tool.setHeight({ mode: 'flatten' }); assert.equal(tool.heightMode, 'flatten'); assert.equal(tool.editingHole, 1, 'a mode keeps Edit hole');
  // the green's handle still drags with the height brush in hand, and moves no ground
  const gr = w.handles().find(h => h.k === 'green')!, g0 = { ...w.plan!.green }, z1 = f.data.slice();
  o.stroke(gr, { x: gr.x + 8, y: gr.y + 4 });
  assert.notDeepEqual(w.plan!.green, g0, 'the green was dragged'); assert.deepEqual(f.data, z1, 'the drag moved no ground'); assert.equal(tool.mode, 'height');
  // Ctrl+Z takes back the latest: the drag, then the stroke; Edit hole stays open
  tool.undoTop(); assert.deepEqual(w.plan!.green, g0, 'the drag first');
  tool.undoTop(); assert.deepEqual(Array.from(f.data), Array.from(z0), 'then the stroke'); assert.equal(tool.editingHole, 1);
  tool.redoTop(); assert.deepEqual(Array.from(f.data), Array.from(z1), 'the stroke again');
  // picking a surface puts the height brush down; Ground height puts the surface brush down; Esc puts it down for the handles
  assert.equal(key(tool, '5'), true); assert.equal(tool.mode, 'brush'); assert.equal(tool.brushKind, 'bunker'); assert.equal(tool.editingHole, 1);
  assert.ok(tool.setEditHeight()); assert.equal(tool.mode, 'height'); assert.equal(tool.heightMode, 'flatten', 'its settings kept');
  assert.equal(key(tool, 'Escape'), true); assert.equal(tool.mode, 'plan'); assert.equal(tool.editingHole, 1, 'Esc: the handles alone');
  // no Edit hole: false; Done leaves it
  assert.ok(tool.setEditHeight()); tool.setBrush('fairway'); assert.equal(tool.editingHole, 0); assert.equal(tool.setEditHeight(), false);
  assert.ok(g.surf[cellAt(g, 120, 120)] !== SURF.none, 'the hole is still there');
});
