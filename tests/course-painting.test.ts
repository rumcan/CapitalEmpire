// T238 (#697; the owner, 2026-10-28): course painting. "editinghole should be where you can also paint and add to the holes grass": Edit hole
// carries the Shape by hand brushes, a stroke paints into the open hole (one undo step, ordered against the plan's own steps), the plan's
// handles still drag and the paint stays when Edit hole closes. "give me a round isometric brish option so i can draw round bunkers and
// greens": every surface brush is Square or Round, Round a circle on the map (a 2:1 ellipse on screen) of the slider's size, remembered.
// "the current course rough being a long grass option the player can add": Long grass, a new course-grid surface (id 9: old saves load
// unchanged) drawn between the rough and the fescue, wearing the owner's rough paintings, priced like the rough and played as heavy rough.
// Headless: the Paint tool with stand-in hosts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRUSH_PRESETS, SURFACE_BRUSHES } from '../src/game/paint';
import { GRID_KINDS, PaintTool, type PaintHost } from '../src/game/paint-tool';
import { CELL_T, SURF, SURF_ORDER, cellAt, decodeGrid, encodeGrid, makeGrid, paintDisc, surfAbove, type Grid } from '../src/game/ext/course-grid';
import { SURF_SURFACE, gridAreas } from '../src/game/ext/course-grid/areas';
import { DRAW_ORDER, collarAfter, layerCode } from '../src/game/ext/course-walls';
import { aimsFromPlans, decodePlans } from '../src/game/ext/hole-wizard';
import { SURFACE_COST, surfaceOfTex, unitBuildCost } from '../src/game/golf/costs';
import { makeCourseView } from '../src/game/golf/play';
import { hitShot, rng } from '../src/game/golf/play/shot';
import type { Hole } from '../src/game/golf/holes';
import type { AimPoint } from '../src/game/golf/types';
import { BRUSH_STAGE } from '../src/game/ext/progressive-ui';
import { SURFACES, clampSurfaces, lookOfTex } from '../src/game/painted-surfaces';
import FILE from '../src/game/painted-surfaces.json';

/** a localStorage stand-in (the brush shape and sizes are remembered) */
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, String(v)); }, removeItem: (k: string) => { store.delete(k); } };

const HOST = { setLotGround() {}, emit() {}, save() {}, toast() {}, affine() {}, placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [] };
/** a golf game's Paint tool on a fresh course grid (all the land yours, 1,000,000 $) */
function golfTool() {
  const g = makeGrid(80, 180, 80, 80), money = { cash: 1e6 };
  const tool = new PaintTool({ ...HOST, golfMode: () => true, grid: () => g, gridChanged() {}, gridAreas: () => gridAreas(g), ownedAt: () => true, landWhy: () => '', money: () => money.cash, spend: (n: number) => { money.cash -= n; } });
  tool.course = true;
  return { g, tool, money };
}
/** a press and release at the tool's cursor: the cells it changed */
function click(g: Grid, tool: PaintTool): number[] {
  const before = g.surf.slice(), out: number[] = [];
  tool.pointerDown(tool.cursor!, 0, 0); tool.pointerUp(0.5);
  for (let i = 0; i < g.surf.length; i++) if (g.surf[i] !== before[i]) out.push(i);
  return out;
}
const centre = (g: Grid, i: number) => ({ x: g.x0 + ((i % g.w) + 0.5) * CELL_T, y: g.y0 + (Math.floor(i / g.w) + 0.5) * CELL_T });

// ---------- Edit hole paints (the golf-edit-hole.test.ts stand-in: 16 css px a tile, your land x < 300) ----------
const PX = 16;
function golf() {
  const g = makeGrid(0, 0, 1000, 1400);
  const st = { money: 5_000_000, plans: [] as unknown[], aims: [] as AimPoint[], toasts: [] as string[] };
  const host: PaintHost = {
    ...HOST, toast: t => { st.toasts.push(t); }, affine: o => { o[0] = 0; o[1] = 0; o[2] = PX; o[3] = 0; o[4] = 0; o[5] = PX; },
    golfMode: () => true, currentMonth: () => 2, money: () => st.money, spend: n => { st.money -= n; },
    grid: () => g, gridChanged() {}, ownedAt: x => x < 300, plans: () => st.plans,
    setPlans: p => { const before = decodePlans(st.plans); st.plans = p; st.aims = aimsFromPlans(st.aims, before, decodePlans(p)); },
    fitView() {},
  };
  const tool = new PaintTool(host); tool.enterCourse();
  const at = (p: { x: number; y: number }) => [p, p.x * PX, p.y * PX] as const;
  const down = (x: number, y: number) => { tool.pointerDown(...at({ x, y })); tool.pointerUp(0.5); };
  const stroke = (a: { x: number; y: number }, b: { x: number; y: number }) => { tool.pointerDown(...at(a)); tool.pointerMove(...at(b)); tool.pointerUp(0.5); };
  tool.setBrushCells(2);
  assert.ok(tool.setPlan()); down(40, 120); down(230, 120); assert.ok(tool.buildPlan());
  assert.ok(tool.setPlan()); down(40, 260); down(230, 260); assert.ok(tool.buildPlan());
  tool.setBrush('fairway');
  return { g, st, tool, w: tool.wizard, stroke };
}
/** a rough cell of hole n well away from the plan's handles (a press there is the brush's), as its centre in tiles */
function roughSpot(o: ReturnType<typeof golf>, n: number) {
  const { g, w } = o, hs = w.handles();
  for (let i = 0; i < g.surf.length; i++) {
    if (g.surf[i] !== SURF.rough || g.hole[i] !== n) continue;
    const c = centre(g, i);
    if (c.x < 60 || c.x > 200 || hs.some(h => Math.hypot(h.x - c.x, h.y - c.y) < 4)) continue;
    if (cellAt(g, c.x + 2, c.y) < 0 || g.surf[cellAt(g, c.x + 2, c.y)] !== SURF.rough) continue;
    return c;
  }
  throw new Error('no rough cell');
}

test('Edit hole carries the brushes: a stroke paints into the open hole, the plan stays open with its handles', () => {
  const o = golf(), { g, tool, w } = o;
  assert.ok(tool.editHole(1)); assert.equal(tool.mode, 'plan'); assert.equal(tool.editingHole, 1);
  assert.ok(tool.setEditBrush('longGrass'), 'a surface picked in the card');
  assert.equal(tool.mode, 'brush'); assert.equal(tool.planOpen, true); assert.equal(tool.editingHole, 1, 'still Edit hole 1'); assert.equal(w.base?.hole, 1);
  assert.equal(tool.brushKind, 'longGrass');
  tool.brushHole = 2; // the hole the brush had last does not matter: Edit hole paints into its own hole
  const p = roughSpot(o, 1), before = g.surf.slice(), holes = g.hole.slice(), undos = tool.undoLabel;
  o.stroke(p, { x: p.x + 1.5, y: p.y });
  const changed: number[] = []; for (let i = 0; i < g.surf.length; i++) if (g.surf[i] !== before[i] || g.hole[i] !== holes[i]) changed.push(i);
  assert.ok(changed.length >= 4, `the stroke laid cells (${changed.length})`);
  for (const i of changed) { assert.equal(g.surf[i], SURF.longGrass, 'long grass'); assert.equal(g.hole[i], 1, 'its cells belong to the open hole'); }
  assert.notEqual(tool.undoLabel, undos); assert.match(tool.undoLabel, /longGrass/, 'one undo step: the stroke');
  assert.equal(tool.editingHole, 1, 'Edit hole stays open');
  // a stroke in the other hole's rough still joins the open hole
  const q = roughSpot(o, 2); o.stroke(q, q);
  const j = cellAt(g, q.x, q.y); assert.equal(g.surf[j], SURF.longGrass); assert.equal(g.hole[j], 1, 'painted in Edit hole 1: hole 1\'s');
});

test('one undo step a stroke: Ctrl+Z takes back the latest of a stroke or a plan drag, Ctrl+Y does them again in turn, Edit hole stays open', () => {
  const o = golf(), { g, tool, w } = o;
  assert.ok(tool.editHole(1)); assert.ok(tool.setEditBrush('longGrass'));
  const p = roughSpot(o, 1), snap0 = g.surf.slice();
  o.stroke(p, { x: p.x + 1, y: p.y });
  const snap1 = g.surf.slice(); assert.notDeepEqual(snap1, snap0);
  // the green's handle still drags with the brush in hand (a press on a handle is the plan's), painting nothing
  const gr = w.handles().find(h => h.k === 'green')!, g0 = { ...w.plan!.green };
  o.stroke(gr, { x: gr.x + 8, y: gr.y + 4 });
  assert.notDeepEqual(w.plan!.green, g0, 'the green was dragged'); assert.deepEqual(g.surf, snap1, 'the drag painted nothing');
  assert.equal(tool.mode, 'brush', 'the brush stays in hand');
  // a second stroke
  o.stroke({ x: p.x, y: p.y + 1 }, { x: p.x + 1, y: p.y + 1 });
  const snap2 = g.surf.slice(); assert.notDeepEqual(snap2, snap1);
  tool.undoTop(); assert.deepEqual(g.surf, snap1, 'the second stroke goes first'); assert.notDeepEqual(w.plan!.green, g0, 'the drag stays');
  tool.undoTop(); assert.deepEqual(w.plan!.green, g0, 'then the green drag'); assert.deepEqual(g.surf, snap1, 'the first stroke stays');
  tool.undoTop(); assert.deepEqual(g.surf, snap0, 'then the first stroke');
  assert.equal(tool.editingHole, 1, 'Edit hole is still open'); assert.equal(w.base?.hole, 1);
  tool.redoTop(); assert.deepEqual(g.surf, snap1, 'the first stroke again');
  tool.redoTop(); assert.notDeepEqual(w.plan!.green, g0, 'the drag again'); assert.deepEqual(g.surf, snap1);
  tool.redoTop(); assert.deepEqual(g.surf, snap2, 'the second stroke again');
  // Ctrl+Z from the keyboard does the same
  tool.key({ key: 'z', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, preventDefault() {} } as unknown as KeyboardEvent);
  assert.deepEqual(g.surf, snap1);
});

test('Esc puts the brush down (the plan\'s handles alone), the number keys pick one; leaving Edit hole keeps the paint', () => {
  const o = golf(), { g, tool } = o;
  assert.ok(tool.editHole(1));
  const key = (k: string) => tool.key({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, preventDefault() {} } as unknown as KeyboardEvent);
  assert.equal(key('8'), true); assert.equal(tool.mode, 'brush'); assert.equal(tool.brushKind, 'longGrass', 'key 8 is Long grass (T252: no cart path brush)'); assert.equal(tool.editingHole, 1);
  assert.equal(key('5'), true); assert.equal(tool.brushKind, 'bunker');
  assert.equal(key('Escape'), true); assert.equal(tool.mode, 'plan', 'Esc puts the brush down'); assert.equal(tool.editingHole, 1, 'Edit hole stays open');
  assert.ok(tool.setEditBrush('longGrass'));
  const p = roughSpot(o, 1); o.stroke(p, p);
  const i = cellAt(g, p.x, p.y); assert.equal(g.surf[i], SURF.longGrass);
  tool.setBrush('fairway'); // Done
  assert.equal(tool.editingHole, 0); assert.equal(tool.planOpen, false); assert.equal(g.surf[i], SURF.longGrass, 'the paint stays');
  assert.equal(g.hole[i], 1);
  // Build closes Edit hole with the brush in hand: the paint stays, the plan is rebuilt around it
  assert.ok(tool.editHole(1)); assert.ok(tool.setEditBrush('longGrass')); o.stroke({ x: p.x + 1, y: p.y }, { x: p.x + 1, y: p.y });
  const k = cellAt(g, p.x + 1, p.y); assert.equal(g.surf[k], SURF.longGrass);
  const gr = o.w.handles().find(h => h.k === 'green')!; o.stroke(gr, { x: gr.x + 6, y: gr.y + 3 }); // a plan change to build (the handle drags with the brush in hand)
  assert.equal(tool.mode, 'brush'); assert.ok(o.w.dirty);
  assert.ok(tool.buildPlan()); assert.equal(tool.planOpen, true, 'the wizard waits for the next tee (plan mode)'); assert.equal(tool.mode, 'plan'); assert.equal(tool.editingHole, 0);
  assert.equal(g.surf[k], SURF.longGrass, 'the paint stays through the Build');
});

// ---------- the round brush ----------
test('the Round brush: a circle on the map of the slider\'s radius, centred on a cell corner (a 2:1 ellipse on screen); every surface takes it; remembered', () => {
  const { g, tool } = golfTool();
  tool.setBrush('green'); tool.setBrushCells(3);
  tool.setBrushShape('round'); assert.equal(tool.brushShape, 'round'); assert.equal(tool.brushCells, 0); assert.equal(tool.brushSquare(), 0);
  tool.setBrushR(4);
  tool.cursor = { x: 100.3, y: 200.2 };
  const cells = click(g, tool), cx = 100.5, cy = 200; // the dab lands on the nearest cell corner (snapDab)
  const want: number[] = []; for (let i = 0; i < g.surf.length; i++) { const c = centre(g, i); if ((c.x - cx) ** 2 + (c.y - cy) ** 2 <= 16) want.push(i); }
  assert.deepEqual(cells, want, 'exactly the cells whose centres lie within the radius: a circle on the map');
  for (const i of cells) assert.equal(g.surf[i], SURF.green);
  // round on the map: as wide along x as along y, and symmetric about its centre on both axes and across the diagonal
  const pts = cells.map(i => centre(g, i)), xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  assert.equal(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const key = (x: number, y: number) => `${x},${y}`, set = new Set(pts.map(p => key(p.x, p.y)));
  for (const p of pts) { assert.ok(set.has(key(2 * cx - p.x, p.y)) && set.has(key(p.x, 2 * cy - p.y)), 'mirror symmetric'); assert.ok(set.has(key(cx + (p.y - cy), cy + (p.x - cx))), 'the same across the diagonal: no stair-step bias'); }
  // on screen (x - y, (x + y) / 2: the 2:1 iso) the circle is an ellipse twice as wide as it is tall
  const sx = pts.map(p => p.x - p.y), sy = pts.map(p => (p.x + p.y) / 2), ratio = (Math.max(...sx) - Math.min(...sx)) / (Math.max(...sy) - Math.min(...sy));
  assert.ok(Math.abs(ratio - 2) < 0.05, `2:1 on screen (${ratio.toFixed(3)})`);
  const n = Math.PI * 64; assert.ok(Math.abs(cells.length - n) / n < 0.1, `about pi r² cells (${cells.length}; r = 8 cells)`);
  // every surface brush takes it: a round bunker
  tool.setBrush('bunker'); tool.setBrushR(2); tool.cursor = { x: 110, y: 210 };
  const b = click(g, tool); assert.ok(b.length > 40); for (const i of b) assert.equal(g.surf[i], SURF.bunker);
  // Square again comes back at the square's last size; both are remembered for the next session
  tool.setBrushShape('square'); assert.equal(tool.brushCells, 3, 'the square\'s last size');
  tool.setBrushShape('round');
  const next = golfTool().tool; assert.equal(next.brushShape, 'round', 'Round is remembered'); assert.equal(next.squareCells, 3);
  next.setBrushShape('square'); assert.equal(next.brushCells, 3);
  // Run is the square brush's: picking it takes Square back at its size
  next.setBrushShape('round'); next.setBrushRun(true); assert.equal(next.brushCells, 3); next.setBrushRun(false);
});

test('round strokes make round greens and bunkers: the outline the course draws is round (no stair steps), its collar too', () => {
  const g = makeGrid(0, 0, 200, 200);
  paintDisc(g, 50, 50, 8, SURF.green, 1, 0); paintDisc(g, 70, 50, 3, SURF.bunker, 1, 0);
  const areas = gridAreas(g), green = areas.find(a => a.s === SURF.green && !a.collar)!, fringe = areas.find(a => a.s === SURF.green && a.collar === 'fringe');
  assert.ok(green && fringe, 'the green and its fringe');
  // every point of the green's outline lies close to the circle (the droplet outline rounds the cells' steps)
  const pts = green.outer, d: number[] = []; for (let k = 0; k < pts.length; k += 2) d.push(Math.hypot(pts[k]! - 50, pts[k + 1]! - 50));
  assert.ok(Math.max(...d) - Math.min(...d) < 0.6, `the green's outline is round (radius ${Math.min(...d).toFixed(2)} to ${Math.max(...d).toFixed(2)} tiles)`);
  assert.ok(areas.some(a => a.s === SURF.bunker && a.collar === 'lip'), 'the round bunker keeps its lip');
});

// ---------- Long grass ----------
test('Long grass is a brush (T252: key 8, the cart path brush gone, at stage 2), a grid surface between the rough and the fescue', () => {
  const k = SURFACE_BRUSHES.findIndex(b => b.kind === 'longGrass');
  assert.equal(k, 7, 'key 8'); assert.equal(SURFACE_BRUSHES[6]!.kind, 'waste', 'after the Waste area'); assert.ok(!SURFACE_BRUSHES.some(b => b.kind === 'path'), 'no cart path brush');
  assert.ok(BRUSH_PRESETS.some(b => b.kind === 'path'), 'the cart path keeps its look (old saves, the Stamps)');
  assert.equal(SURFACE_BRUSHES[k]!.name, 'Long grass'); assert.ok(GRID_KINDS.includes('longGrass')); assert.equal(BRUSH_STAGE.longGrass, BRUSH_STAGE.rough);
  assert.equal(surfaceOfTex(SURFACE_BRUSHES[k]!.style.tex), 'longGrass'); assert.equal(SURF_SURFACE[SURF.longGrass], 'longGrass');
  assert.equal(SURF.longGrass, 9, 'the next free id: ids 0-8 keep their meaning');
  assert.deepEqual(SURF_ORDER, [SURF.none, SURF.rough, SURF.longGrass, SURF.fescue, SURF.water, SURF.fairway, SURF.tee, SURF.bunker, SURF.waste, SURF.green]);
  assert.ok(surfAbove(SURF.longGrass, SURF.rough) && surfAbove(SURF.fescue, SURF.longGrass) && surfAbove(SURF.fairway, SURF.longGrass));
  const rank = (s: number) => DRAW_ORDER.indexOf(layerCode(s, false));
  assert.ok(rank(SURF.rough) < rank(SURF.longGrass) && rank(SURF.longGrass) < rank(SURF.fescue), 'drawn between the rough and the fescue');
  assert.equal(collarAfter(SURF.bunker), SURF.green, 'the bunker\'s lip is still laid after the green');
});

test('Long grass lays: over the rough and the map grass, under the fairway and the green; Erase gives back the rough', () => {
  const { g, tool } = golfTool();
  tool.setBrush('rough'); tool.setBrushCells(4); tool.cursor = { x: 100, y: 200 }; click(g, tool);
  const i = cellAt(g, 100, 200); assert.equal(g.surf[i], SURF.rough);
  assert.equal(tool.key({ key: '8', preventDefault() {} } as unknown as KeyboardEvent), true); assert.equal(tool.brushKind, 'longGrass', 'key 8 arms it');
  tool.setBrushCells(2); const laid = click(g, tool); assert.ok(laid.length >= 4); for (const j of laid) assert.equal(g.surf[j], SURF.longGrass);
  tool.cursor = { x: 110, y: 210 }; const open = click(g, tool); assert.ok(open.length >= 4, 'over the map grass'); for (const j of open) assert.equal(g.surf[j], SURF.longGrass);
  // the rough slides under it (long grass is drawn above the rough), the fairway goes over it
  tool.setBrush('rough'); tool.cursor = { x: 100, y: 200 }; assert.equal(click(g, tool).length, 0, 'the rough keeps out of it');
  tool.setBrush('fairway'); tool.setBrushCells(1); click(g, tool); assert.equal(g.surf[i], SURF.fairway, 'the fairway paints over it');
  // Erase takes long grass back to the rough
  tool.setBrush('longGrass'); tool.setBrushCells(1); tool.rubOut = true; tool.cursor = { x: 110, y: 210 }; click(g, tool);
  assert.equal(g.surf[cellAt(g, 110, 210)], SURF.rough, 'rubbed out to the rough');
  // the grid's areas: a long grass blob that reads as the long grass surface and its texture
  const la = gridAreas(g).find(a => a.s === SURF.longGrass && !a.collar)!; assert.ok(la); assert.equal(la.surface, 'longGrass'); assert.equal(la.tex, 'golfLongGrass');
});

test('Long grass is priced like the rough', () => {
  assert.deepEqual(SURFACE_COST.longGrass, SURFACE_COST.rough);
  const bill = (kind: 'longGrass' | 'rough') => { const { tool, money, g } = golfTool(); tool.setBrush(kind); tool.setBrushCells(2); tool.cursor = { x: 100.3, y: 200.6 }; const n = click(g, tool).length; return { n, spent: 1e6 - money.cash }; };
  const a = bill('longGrass'), b = bill('rough'); assert.equal(a.n, b.n); assert.equal(a.spent, b.spent); assert.ok(a.spent > 0);
  assert.equal(unitBuildCost('longGrass'), unitBuildCost('rough'));
});

test('Long grass plays as heavy rough: the deep grass lie, a shorter and wilder shot than from the rough', () => {
  const hole: Hole = { n: 1, par: 4, lengthM: 300, memberLengthM: 280, line: [{ x: 90, y: 190 }, { x: 200, y: 300 }], warnings: [] };
  const g = makeGrid(80, 180, 80, 80);
  paintDisc(g, 95, 195, 4, SURF.rough, 1, 0); paintDisc(g, 110, 210, 4, SURF.longGrass, 1, 0);
  const view = makeCourseView([hole], (x, y) => { const k = cellAt(g, x, y); return k >= 0 ? SURF_SURFACE[g.surf[k]!] ?? null : null; });
  assert.equal(view.lieAt(95, 195), 'rough'); assert.equal(view.lieAt(110, 210), 'fescue', 'long grass is the deep grass lie');
  const shots = (lie: 'rough' | 'fescue') => {
    // the mean carry (tiles) and the mean angle off the aim line (the spread scatters by angle)
    let carry = 0, off = 0; const from = { x: 110, y: 210 }, aim = { x: 150, y: 250 }, aimA = Math.atan2(aim.y - from.y, aim.x - from.x);
    for (let k = 0; k < 400; k++) { const s = hitShot(rng(7, k, 1), 0.7, lie, from, aim, 'iron6', view); carry += Math.hypot(s.to.x - from.x, s.to.y - from.y); off += Math.abs(Math.atan2(s.to.y - from.y, s.to.x - from.x) - aimA); }
    return { carry: carry / 400, off: off / 400 };
  };
  const r = shots('rough'), l = shots('fescue');
  assert.ok(l.carry < r.carry, `shorter from long grass (${l.carry.toFixed(1)} < ${r.carry.toFixed(1)} tiles)`);
  assert.ok(l.off > r.off, `wilder from long grass (${(l.off * 180 / Math.PI).toFixed(2)}° > ${(r.off * 180 / Math.PI).toFixed(2)}° off line)`);
});

test('Long grass saves and loads; an old save (made before T238) loads unchanged', () => {
  const g = makeGrid(10, 20, 30, 20);
  paintDisc(g, 15, 25, 3, SURF.rough, 2, 0); paintDisc(g, 18, 26, 2, SURF.longGrass, 2, 70); paintDisc(g, 21, 28, 1.5, SURF.green, 2, 66);
  const back = decodeGrid(JSON.parse(JSON.stringify(encodeGrid(g))))!;
  assert.ok(back); assert.deepEqual(back.surf, g.surf); assert.deepEqual(back.hole, g.hole); assert.deepEqual(back.month, g.month);
  assert.ok(back.surf.includes(SURF.longGrass));
  // an old save, encoded by main's course grid before T238 (surfaces 0-8, holes, months): every value comes back as it was
  const OLD = { v: 1, x0: 10, y0: 20, w: 6, h: 3, s: 'AQABAQECAQMBBAEFAQYBBwEIAgECBAIIAQYBAgEA', hl: 'AQABAgEDAQEBAgEDAQEBAgEDAQEBAgEDAQEBAgEDAQEBAgEA', m: 'AQABQQFCAUMBRAFFAUYBRwFIAUkBSgFLAUwBTQFOAU8BUAEA' };
  const old = decodeGrid(OLD)!;
  const s = [0, 1, 2, 3, 4, 5, 6, 7, 8, 1, 1, 4, 4, 8, 8, 6, 2, 0];
  assert.deepEqual([...old.surf], s, 'the surfaces keep their ids (none of them became long grass)');
  assert.deepEqual([...old.hole], s.map((v, i) => (v ? 1 + (i % 3) : 0)));
  assert.deepEqual([...old.month], s.map((v, i) => (v ? 64 + i : 0)));
  assert.deepEqual(encodeGrid(old), { ...OLD }, 'and saves back byte for byte');
});

test('Painted › Long grass wears the owner\'s rough paintings (rough-owner), editable in the studio; the rough keeps the town lawns\' grass', () => {
  const S = clampSurfaces(FILE);
  const def = SURFACES.find(s => s.key === 'longGrass')!; assert.ok(def, 'a painted surface key'); assert.equal(def.group, 'Golf'); assert.deepEqual(def.tex, ['golfLongGrass']);
  assert.equal(S.surfaces.longGrass?.family, 'rough-owner');
  assert.equal(lookOfTex('golfLongGrass', S)!.family, 'rough-owner', 'its texture wears it');
  assert.equal(lookOfTex('golfRough', S)!.family, S.surfaces.rough!.family, 'the rough as it was (#696)');
});

test('picking a surface paints it: Erase left on from before is put down (the owner: Bunker in hand drew rough)', () => {
  const o = golf(), { tool } = o;
  assert.ok(tool.editHole(1)); assert.ok(tool.setEditBrush('longGrass'));
  tool.rubOut = true; // Erase on
  assert.ok(tool.setEditBrush('bunker')); assert.equal(tool.rubOut, false, 'Edit hole: a surface picked ends Erase');
  tool.rubOut = true; tool.setBrush('green'); assert.equal(tool.rubOut, false, 'Shape by hand: the same');
});
