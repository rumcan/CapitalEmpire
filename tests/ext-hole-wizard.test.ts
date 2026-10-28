/** The New hole wizard and plan handles (T102, plan P21 3.3 A): a plan from two clicks, handle edits (a bend, a width), the ghost's price
 * before the click, Build as the planDiff of the ghost with one undo step, hand touch-ups kept on an edit, delete, refused cells, and
 * golf.aims written from the plans. T119 (P23 4.4) finishes it: the wizard's own undo (clicks and drags first, never the last hole), the Esc
 * stages, every row of the check table (blocks, warnings, the fixes; the practice area of P24 D24), Seed and Sod, the money line, the
 * number picker, and the camera's framing (pure, Node: the wizard alone and the Paint tool's plan mode with a stand-in host). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SURF, cellAt, makeGrid, paintDisc, type Grid } from '../src/game/ext/course-grid';
import { gridAreas } from '../src/game/ext/course-grid/areas';
import { centreLine, decodePlan, planDiff, type HolePlan } from '../src/game/ext/hole-plan';
import { HoleWizard, NO_CHANGES, TEE_VIEW_M, aboutMoney, aimsFromPlans, decodePlans, frameView, newPlan, planShape, snapPt, withWidthAt, type WizardHost } from '../src/game/ext/hole-wizard';
import { worldX, worldY } from '../src/game/iso';
import { PaintTool, type PaintHost } from '../src/game/paint-tool';
import { deriveHoles } from '../src/game/golf/holes';
import type { AimPoint } from '../src/game/golf/types';

/** 16 css px a tile, origin at 0 (the stand-in projection) */
const PX = 16;
const toScreen = (x: number, y: number) => ({ x: x * PX, y: y * PX });

/** a bare wizard on a grid: $2 a cell, plenty of money, land everywhere unless own says no */
function bare(g: Grid, plans: HolePlan[] = [], own?: (i: number) => boolean, money = 1e9) {
  const host: WizardHost = { grid: () => g, plans: () => plans, month: () => 64, price: s => (s ? 2 : 0), money: () => money, ...(own ? { allow: own } : {}) };
  return new HoleWizard(host);
}
/** a press of the wizard at tile (x, y) */
const press = (w: HoleWizard, x: number, y: number) => w.press({ x, y }, x * PX, y * PX, toScreen);
const move = (w: HoleWizard, x: number, y: number) => w.move({ x, y }, x * PX, y * PX, toScreen);

/** a stand-in golf game for the Paint tool: the grid, money, plans and aims as the engine keeps them (setPlans writes aims) */
function game() {
  const g = makeGrid(0, 0, 900, 600);
  const st = { money: 5_000_000, plans: [] as unknown[], aims: [] as AimPoint[], spent: 0, changed: 0, toasts: [] as string[] };
  const host: PaintHost = {
    setLotGround() {}, emit() {}, save() {}, toast: t => { st.toasts.push(t); }, affine: o => { o[0] = 0; o[1] = 0; o[2] = PX; o[3] = 0; o[4] = 0; o[5] = PX; },
    placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [],
    golfMode: () => true, currentMonth: () => 2, money: () => st.money, spend: n => { st.money -= n; st.spent += n; },
    grid: () => g, gridChanged() {}, changed: () => { st.changed++; },
    ownedAt: x => x < 400, plans: () => st.plans,
    setPlans: p => { const before = decodePlans(st.plans); st.plans = p; st.aims = aimsFromPlans(st.aims, before, decodePlans(p)); },
  };
  const tool = new PaintTool(host);
  tool.enterCourse();
  const at = (x: number, y: number) => [g.surf[cellAt(g, x, y)], g.hole[cellAt(g, x, y)]];
  return { g, st, tool, at, down: (x: number, y: number) => { tool.pointerDown({ x, y }, x * PX, y * PX); tool.pointerUp(0.5); } };
}

test('1. two clicks plan a whole hole: tee, then green gives a par 4 with fairway, green, tee and rough in the ghost', () => {
  const g = makeGrid(0, 0, 600, 300), w = bare(g);
  w.start(4);
  assert.equal(press(w, 20, 75), 'tee');
  assert.equal(w.step, 'green');
  move(w, 25, 75);
  const tooShort = w.plan;
  assert.equal(tooShort, null, 'a green 10 m from the tee is too short: no plan yet');
  move(w, 210, 75);
  assert.ok(w.plan, 'the live plan follows the pointer');
  assert.equal(press(w, 210, 75), 'green');
  assert.equal(w.step, 'shape');
  const gh = w.ghost()!;
  assert.equal(gh.info.par, 4);
  assert.ok(Math.abs(gh.info.lengthM - 380) <= 2, `length ${gh.info.lengthM}`);
  const by = new Map<number, number>();
  for (let k = 0; k < gh.diff.n; k++) by.set(gh.diff.s1[k]!, (by.get(gh.diff.s1[k]!) ?? 0) + 1);
  for (const s of [SURF.rough, SURF.fairway, SURF.tee, SURF.green]) assert.ok((by.get(s) ?? 0) > 100, `surface ${s}: ${by.get(s)} cells`);
  assert.equal(gh.cost, 2 * gh.laid, 'every laid cell at $2');
  assert.equal(g.rev, 0, 'the ghost is a dry run: the grid is untouched');
  // the plan points sit on cell centres (everything snaps)
  assert.deepEqual(w.plan!.tee, snapPt({ x: 20, y: 75 }));
  assert.match(w.label().text, /^Hole 4 · par 4 · 38\d m · \$[\d,]+$/);
});

test('2. dragging the line adds a bend the line passes through; aims follow; the built hole has no dogleg warning', () => {
  const { g, st, tool } = game();
  assert.ok(tool.setPlan());
  const w = tool.wizard;
  const down = (x: number, y: number) => { tool.pointerDown({ x, y }, x * PX, y * PX); };
  down(30, 100); tool.pointerUp(0.5);
  down(150, 200); tool.pointerUp(0.5);
  assert.equal(w.step, 'shape');
  // press on the middle of the line and drag it out: a bend
  const mid = centreLine(w.plan!)[Math.floor(centreLine(w.plan!).length / 2)]!;
  tool.pointerDown(mid, mid.x * PX, mid.y * PX);
  assert.equal(w.drag?.k, 'bend');
  tool.pointerMove({ x: 140, y: 110 }, 140 * PX, 110 * PX); tool.pointerUp(0.5);
  assert.equal(w.plan!.bends.length, 1);
  const line = centreLine(w.plan!), b = w.plan!.bends[0]!;
  assert.ok(Math.min(...line.map(p => Math.hypot(p.x - b.x, p.y - b.y))) < 0.5, 'the line runs through the bend');
  assert.ok(tool.buildPlan());
  assert.deepEqual(st.aims.map(a => [a.hole, a.x, a.y, a.order]), [[1, b.x, b.y, 0]], 'golf.aims written from the plan');
  const holes = deriveHoles(gridAreas(g), [{ hole: 1, x: w.plans()[0]!.tee.x, y: w.plans()[0]!.tee.y, kind: 'back' }], [{ hole: 1, x: w.plans()[0]!.green.x, y: w.plans()[0]!.green.y }], st.aims);
  assert.deepEqual(holes[0]!.warnings, [], `warnings: ${holes[0]!.warnings.join('; ')}`);
});

test('3. a width handle changes the price before the click, and the grid only on Build', () => {
  const g = makeGrid(0, 0, 600, 300), w = bare(g);
  w.start(1); press(w, 20, 75); press(w, 210, 75);
  const before = w.ghost()!.cost, rev = g.rev;
  const wl = w.handles().find(h => h.k === 'wl' && h.i === 1)!; // the landing zone's left edge
  assert.ok(wl, 'a left width handle at the landing zone');
  assert.equal(press(w, wl.x, wl.y), 'drag');
  w.move({ x: wl.x, y: wl.y + 4 }, wl.x * PX, (wl.y + 4) * PX, toScreen); w.release(); // 8 m out (the left normal of an eastward line is +y)
  const after = w.ghost()!.cost;
  assert.ok(w.plan!.widths[1]!.w > 40, `landing width ${w.plan!.widths[1]!.w}`);
  assert.ok(after > before, `price ${before} -> ${after}`);
  assert.equal(g.rev, rev, 'nothing painted yet');
  // withWidthAt clamps
  assert.equal(withWidthAt(w.plan!, 1, 'left', { x: wl.x, y: 300 }).widths[1]!.w, 60);
  assert.equal(withWidthAt(w.plan!, 1, 'right', { x: wl.x, y: 300 }).widths[1]!.w, 12, 'the right edge dragged across the line: the narrowest');
});

test('4. Build lays exactly the ghost (= planDiff), charges it, saves the plan, and one undo takes it all back', () => {
  const { g, st, tool, down } = game();
  tool.setPlan(); down(40, 120); down(230, 120);
  const w = tool.wizard, plan = w.plan!, gh = w.ghost()!;
  // the same plan through planDiff on a copy of the grid
  const copy: Grid = { ...g, surf: g.surf.slice(), hole: g.hole.slice(), month: g.month.slice() };
  const ref = planDiff(copy, null, plan, 1, w['host'].month(), i => { const cx = i % g.w; return (cx + 0.5) * 0.5 < 400; });
  const surf0 = g.surf.slice(), money0 = st.money;
  assert.ok(tool.buildPlan(), 'built');
  assert.deepEqual(g.surf, copy.surf, 'the grid is what planDiff makes');
  assert.equal(gh.diff.n, ref.n);
  assert.equal(money0 - st.money, gh.cost, 'charged the ghost price');
  assert.equal(decodePlan(st.plans[0])!.hole, 1, 'the plan is saved');
  assert.equal(w.step, 'tee', 'the wizard waits for the next hole');
  assert.equal(w.hole, 2, 'the next free hole');
  assert.equal(tool.brushHole, 1, 'the built hole is current (its par and length show)');
  assert.ok(w.ripple, 'the ripple plays');
  tool.undo();
  assert.deepEqual(g.surf, surf0, 'one undo: every cell back');
  assert.equal(st.money, money0, 'refunded');
  assert.deepEqual(st.plans, [], 'the plan is gone');
  assert.deepEqual(st.aims, []);
  tool.redo();
  assert.deepEqual(g.surf, copy.surf, 'redo lays it again');
  assert.equal(decodePlans(st.plans).length, 1);
});

test('5. editing the green after touching up a bunker (T254: Edit Hole Layout): the bunker stays, and no cell changes at all', () => {
  const { g, st, tool, down, at } = game();
  tool.setPlan(); down(40, 120); down(230, 120); tool.buildPlan();
  const full = st.spent;
  // the player paints a bunker beside the fairway at the landing zone, by hand
  paintDisc(g, 145, 126, 2.5, SURF.bunker, 1, 0);
  assert.deepEqual(at(145, 126), [SURF.bunker, 1]);
  // a click on the built hole's line opens its plan
  tool.setPlan();
  const w = tool.wizard;
  tool.pointerMove({ x: 120, y: 120 }, 120 * PX, 120 * PX);
  assert.equal(w.lineHole, 1);
  down(120, 120);
  assert.equal(w.step, 'shape'); assert.ok(w.base, 'editing hole 1');
  // drag the green 16 m farther and 6 m up
  const gr = w.handles().find(h => h.k === 'green')!;
  tool.pointerDown(gr, gr.x * PX, gr.y * PX); tool.pointerMove({ x: gr.x + 8, y: gr.y - 3 }, (gr.x + 8) * PX, (gr.y - 3) * PX); tool.pointerUp(0.5);
  const spent0 = st.spent, cells = [g.surf.join(','), g.hole.join(','), g.month.join(',')].join('|');
  assert.ok(tool.buildPlan());
  assert.deepEqual(at(145, 126), [SURF.bunker, 1], 'the bunker stays');
  // T254 (the owner, 2026-10-28: "if you edit the layout it does not plant new grass"): the layout moves, the grass does not
  assert.equal([g.surf.join(','), g.hole.join(','), g.month.join(',')].join('|'), cells, 'not one cell painted, cleared or regrown');
  assert.equal(st.spent - spent0, 0, `nothing charged (a $${full} hole)`);
  assert.equal(decodePlans(st.plans).length, 1, 'still one plan');
  assert.ok(Math.abs(decodePlans(st.plans)[0]!.green.x - (gr.x + 8)) < 1, 'the plan (the line of play) took the new green');
});

test('6. delete clears the planned cells (touch-ups stay), as one undo step', () => {
  const { g, st, tool, down, at } = game();
  tool.setPlan(); down(40, 120); down(230, 120); tool.buildPlan();
  paintDisc(g, 145, 126, 2, SURF.bunker, 1, 0);
  const surf1 = g.surf.slice();
  assert.ok(tool.editPlan(1));
  assert.ok(tool.deletePlan());
  assert.deepEqual(at(200, 120), [SURF.none, 0], 'the fairway is gone');
  assert.deepEqual(at(145, 126), [SURF.bunker, 1], 'the bunker stays');
  assert.deepEqual(st.plans, []);
  tool.undo();
  assert.deepEqual(g.surf, surf1, 'undo brings the hole back');
  assert.equal(decodePlans(st.plans).length, 1);
});

test('7. refused cells: off your land they are left out (red in the ghost); a tee or green off the land refuses the build', () => {
  const g = makeGrid(0, 0, 700, 300), own = (i: number) => (i % g.w) * 0.5 < 200;
  const w = bare(g, [], own);
  w.start(1); press(w, 20, 75); press(w, 260, 75);
  const gh = w.ghost()!;
  assert.ok(gh.refused > 1000, `refused ${gh.refused}`);
  assert.ok(!gh.greenOk);
  assert.equal(w.check().ok, false);
  assert.equal(w.check().why, 'The green is off your land');
  assert.equal(w.label().bad, true);
  // money: a plan the treasury cannot pay is refused with both amounts
  const poor = bare(makeGrid(0, 0, 600, 300), [], undefined, 1000);
  poor.start(1); press(poor, 20, 75); press(poor, 210, 75);
  assert.match(poor.check().why, /^Not enough money: \$[\d,]+ \(you have \$1,000\)$/);
});

test('8. aimsFromPlans: planned holes take their bends, others keep theirs, a removed plan takes its aims away', () => {
  const p3 = newPlan(3, { x: 0, y: 0 }, { x: 200, y: 50 }, [{ x: 80, y: 40 }, { x: 140, y: 30 }]);
  const manual: AimPoint[] = [{ hole: 2, x: 5, y: 5, order: 0 }, { hole: 3, x: 1, y: 1, order: 0 }];
  const a = aimsFromPlans(manual, [], [p3]);
  assert.deepEqual(a.map(q => [q.hole, q.x, q.y, q.order]), [[2, 5, 5, 0], [3, 80, 40, 0], [3, 140, 30, 1]]);
  assert.deepEqual(aimsFromPlans(a, [p3], []).map(q => q.hole), [2]);
});

test('9. speed: a drag step (re-plan and ghost) of a 3-bend hole stays within a few ms', () => {
  const g = makeGrid(0, 0, 800, 600), w = bare(g);
  w.start(1); press(w, 20, 20); press(w, 230, 200);
  const plan = w.plan!;
  w.plan = { ...plan, bends: [{ x: 80, y: 30 }, { x: 140, y: 90 }, { x: 200, y: 120 }] };
  w.ghost();
  const gr = w.handles().find(h => h.k === 'green')!;
  press(w, gr.x, gr.y);
  // the best of 3 rounds of 20 steps: the full suite runs files in parallel, and one loaded round reached 15.4 ms (about 2 ms alone)
  let ms = Infinity;
  for (let round = 0; round < 3; round++) {
    const t0 = performance.now();
    for (let k = 0; k < 20; k++) { w.move({ x: gr.x + k * 0.5, y: gr.y + k * 0.25 }, 0, 0, toScreen); w.ghost(); }
    ms = Math.min(ms, (performance.now() - t0) / 20);
  }
  console.log(`hole-wizard drag step: ${ms.toFixed(2)} ms (re-plan + ghost, 3 bends, ${w.ghost()!.info.lengthM} m, ${w.ghost()!.diff.n} cells)`);
  // the target is 4 ms (the bench); the suite only catches a real slowdown
  assert.ok(ms < 30, `drag step ${ms} ms`);
});

// ---------- T119: New hole, finished (P23 4.4) ----------

/** a key press for the Paint tool (with Ctrl when ctrl) */
const key = (k: string, ctrl = false, shift = false) => ({ key: k, code: '', ctrlKey: ctrl, metaKey: false, altKey: false, shiftKey: shift, preventDefault() {} }) as unknown as KeyboardEvent;
/** a range start's golf game for the Paint tool (a 500 x 700 tile grid): your land x < 300, the driving range's plot 300 <= x < 400, not yours beyond; the practice
 *  area's box, the public roads and the money as given; fitView records each camera framing */
function golf(o: { practice?: [number, number, number, number]; land?: [number, number, number, number]; roads?: { ax: number; ay: number; bx: number; by: number; name: string }[]; money?: number } = {}) {
  const g = makeGrid(0, 0, 1000, 1400);
  const st = { money: o.money ?? 5_000_000, plans: [] as unknown[], aims: [] as AimPoint[], toasts: [] as string[], fits: [] as { pts: { x: number; y: number }[]; zoomIn: boolean }[] };
  const host: PaintHost = {
    setLotGround() {}, emit() {}, save() {}, toast: t => { st.toasts.push(t); }, affine: o2 => { o2[0] = 0; o2[1] = 0; o2[2] = PX; o2[3] = 0; o2[4] = 0; o2[5] = PX; },
    placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [],
    golfMode: () => true, currentMonth: () => 2, money: () => st.money, spend: n => { st.money -= n; },
    grid: () => g, gridChanged() {}, ownedAt: x => x < 300, landWhy: x => (x < 300 ? '' : x < 400 ? 'range' : 'off'), plans: () => st.plans,
    setPlans: p => { const before = decodePlans(st.plans); st.plans = p; st.aims = aimsFromPlans(st.aims, before, decodePlans(p)); },
    fitView: (pts, zoomIn) => { st.fits.push({ pts, zoomIn }); },
    practiceBox: () => o.practice ?? null, publicRoads: () => o.roads ?? [], landBox: () => o.land ?? null,
  };
  const tool = new PaintTool(host); tool.enterCourse();
  const down = (x: number, y: number) => { tool.pointerDown({ x, y }, x * PX, y * PX); tool.pointerUp(0.5); };
  const drag = (from: { x: number; y: number }, to: { x: number; y: number }) => { tool.pointerDown(from, from.x * PX, from.y * PX); tool.pointerMove(to, to.x * PX, to.y * PX); tool.pointerUp(0.5); };
  const plan = (a: [number, number], b: [number, number]) => { assert.ok(tool.setPlan()); down(...a); down(...b); assert.equal(tool.wizard.step, 'shape'); };
  return { g, st, tool, w: tool.wizard, down, drag, plan };
}
const rows = (w: HoleWizard) => w.checks().map(r => `${r.kind}:${r.id}`);
const row = (w: HoleWizard, id: string) => w.checks().find(r => r.id === id);

test('10. the wizard\'s own undo: Ctrl+Z takes back the drag, then the green, then the tee; only then the course\'s last step (the last hole)', () => {
  const { st, tool, w, down, drag, plan } = golf();
  plan([40, 120], [230, 120]); assert.ok(tool.buildPlan(), 'hole 1 built');
  assert.ok(tool.setPlan()); assert.equal(w.hole, 2);
  down(40, 260); down(230, 260);
  const gr = w.handles().find(h => h.k === 'green')!, g0 = { ...w.plan!.green };
  drag(gr, { x: gr.x + 10, y: gr.y + 4 });
  assert.notDeepEqual(w.plan!.green, g0, 'the green moved');
  assert.equal(tool.topUndo, 'move the green', 'the ↶ tooltip names the drag');
  tool.key(key('z', true));
  assert.deepEqual(w.plan!.green, g0, 'Ctrl+Z: the drag is taken back');
  assert.equal(w.step, 'shape');
  tool.key(key('y', true)); assert.notDeepEqual(w.plan!.green, g0, 'Ctrl+Y: the drag again');
  tool.key(key('z', true)); tool.key(key('z', true));
  assert.equal(w.step, 'green', 'then the green click'); assert.deepEqual(w.tee, snapPt({ x: 40, y: 260 }), 'the tee stays');
  tool.key(key('z', true));
  assert.equal(w.step, 'tee', 'then the tee click'); assert.equal(w.tee, null);
  assert.equal(decodePlans(st.plans).length, 1, 'hole 1 is still built');
  tool.key(key('y', true)); assert.equal(w.step, 'green', 'Ctrl+Y puts the tee back'); tool.key(key('z', true));
  // nothing of New hole left on screen: Ctrl+Z is the course's again, and takes back hole 1's build
  assert.equal(tool.topUndo, 'build hole 1');
  tool.key(key('z', true));
  assert.equal(decodePlans(st.plans).length, 0, 'the course\'s undo: hole 1 is taken back');
  assert.equal(w.hole, 1, 'the wizard waits for the first free number');
  // an edit open with nothing changed yet: Ctrl+Z never reaches the course's steps
  tool.redo(); assert.ok(tool.editPlan(1));
  tool.key(key('z', true));
  assert.equal(decodePlans(st.plans).length, 1, 'the built hole stays');
  assert.match(st.toasts.at(-1)!, /Esc steps back/);
});

test('10b. the Props tool\'s steps stay on the course\'s undo while New hole is open; a course undo keeps a new plan on screen', () => {
  const { st, tool, w, plan } = golf();
  plan([40, 120], [230, 120]);
  const money0 = st.money;
  tool.step('place a bench', () => { st.money -= 150; return 150; }); // as golf/propstool.ts does through PaintTool.step
  assert.equal(st.money, money0 - 150);
  tool.undo(); // the Props tool's Ctrl+Z (its ctx.undo is PaintTool.undo)
  assert.equal(st.money, money0, 'the bench is refunded');
  assert.equal(w.step, 'shape', 'the plan on screen stays'); assert.ok(w.plan);
  tool.redo(); assert.equal(st.money, money0 - 150);
});

test('11. Esc steps back one stage: a drag in hand is dropped, shaping goes back to the green (the tee stays), then the tee, then out of New hole', () => {
  const { tool, w, down } = golf();
  assert.ok(tool.setPlan()); down(40, 120); down(230, 120);
  // a tee dragged in the shape step: Esc in the middle of the drag puts it back
  const t = w.handles().find(h => h.k === 'tee')!, t0 = { ...w.plan!.tee };
  tool.pointerDown(t, t.x * PX, t.y * PX); tool.pointerMove({ x: t.x - 6, y: t.y }, (t.x - 6) * PX, t.y * PX);
  assert.notDeepEqual(w.plan!.tee, t0);
  assert.equal(tool.key(key('Escape')), true); assert.deepEqual(w.plan!.tee, t0, 'Esc drops the drag in hand'); assert.equal(w.step, 'shape');
  tool.pointerUp(0.5);
  // move the tee for real, then Esc: back to the green step with the moved tee
  tool.pointerDown(t, t.x * PX, t.y * PX); tool.pointerMove({ x: t.x - 6, y: t.y }, (t.x - 6) * PX, t.y * PX); tool.pointerUp(0.5);
  const moved = { ...w.plan!.tee };
  assert.equal(tool.key(key('Escape')), true);
  assert.equal(w.step, 'green'); assert.deepEqual(w.tee, moved, 'the tee stays where it was dragged'); assert.equal(tool.mode, 'plan');
  assert.equal(tool.key(key('Escape')), true);
  assert.equal(w.step, 'tee'); assert.equal(w.tee, null); assert.equal(w.hole, 1, 'the same number');
  assert.equal(tool.key(key('Escape')), true);
  assert.equal(tool.mode, 'brush', 'out of New hole: the Holes panel stays, nothing planned');
  assert.equal(tool.key(key('Escape')), false, 'the next Esc is the engine\'s (out to Select)');
});

test('12. the check table\'s blocks: off your land, the driving range, the practice area, the money (Seed as the fix), no changes', () => {
  const { tool, w, plan } = golf({ practice: [100, 200, 140, 240] });
  plan([40, 120], [450, 120]);
  assert.equal(w.check().why, 'The green is off your land'); assert.equal(w.check().at, 'green');
  assert.equal(rows(w)[0], 'block:land'); assert.deepEqual(row(w, 'land')!.show, [w.plan!.green], 'Show me goes to the green');
  tool.cancelPlan(); plan([40, 120], [350, 120]);
  assert.equal(w.check().why, 'The green is on the driving range: golfers hit here'); assert.equal(rows(w)[0], 'block:range');
  tool.cancelPlan(); plan([40, 220], [120, 220]);
  assert.equal(w.check().why, 'The green is on the practice area: golfers practise there'); assert.equal(rows(w)[0], 'block:practice');
  tool.cancelPlan(); plan([120, 220], [210, 220]);
  assert.equal(w.check().why, 'The tee is on the practice area: golfers practise there');
  // money: Sod costs more than the treasury; the fix is Seed, which fits
  tool.cancelPlan(); plan([40, 120], [230, 120]);
  const k = w.costs()!;
  assert.ok(k.sod > 3 * k.seed, `sod $${k.sod} vs seed $${k.seed}`);
  const g2 = golf({ money: Math.round((k.seed + k.sod) / 2) });
  g2.tool.plantKind = 'sod'; g2.plan([40, 120], [230, 120]);
  const m = row(g2.w, 'money')!;
  assert.equal(m.kind, 'block'); assert.equal(m.fix, 'seed'); assert.match(m.text, /^Not enough money: \$[\d,]+ \(you have \$[\d,]+\)$/);
  g2.tool.plantKind = 'seed';
  assert.equal(g2.w.check().ok, true, 'Seed fits the treasury');
  // an edit that changes nothing
  assert.ok(g2.tool.buildPlan()); assert.ok(g2.tool.editPlan(1));
  assert.equal(g2.w.check().why, NO_CHANGES); assert.equal(rows(g2.w)[0], 'block:same');
});

test('13. the check table\'s warnings: cells left out (by why), too close, a long walk, a road across, the practice area; and the checks passed', () => {
  const { tool, w, plan } = golf({ practice: [120, 100, 160, 140], roads: [{ ax: 200, ay: 0, bx: 200, by: 600, name: 'Maple Ave' }] });
  plan([40, 120], [230, 120]);
  assert.equal(w.check().ok, true, 'warnings never block Build');
  const p = row(w, 'practice-cells')!;
  assert.equal(p.text, 'Crosses the practice area: those cells stay practice'); assert.equal(p.kind, 'warn');
  assert.ok(w.ghost()!.practice > 500, `${w.ghost()!.practice} cells on the practice area`);
  assert.equal(row(w, 'road')!.text, 'Crosses Maple Ave: carts need a crossing');
  assert.ok(Math.abs(row(w, 'road')!.show![0]!.x - 200) < 0.01, 'Show me goes to the crossing');
  assert.deepEqual(rows(w).filter(r => r.startsWith('ok')), ['ok:ok-land', 'ok:ok-near'], 'passed: land and no hole near (there is a road)');
  assert.ok(tool.buildPlan());
  // hole 2 beside hole 1 (40 m apart) and far from its green, its green by the driving range
  plan([40, 140], [290, 140]);
  assert.equal(row(w, 'near')!.text, '40 m from hole 1\'s line: golfers there are in range');
  const g1 = w.plans()[0]!.green, walk = Math.round(Math.hypot(w.plan!.tee.x - g1.x, w.plan!.tee.y - g1.y) * 2);
  assert.equal(row(w, 'walk')!.text, `${walk} m walk from hole 1's green`);
  const left = row(w, 'left')!;
  assert.match(left.text, /^[\d,]+ m² left out: (the driving range|hole 1) [\d,]+ m², (the driving range|hole 1) [\d,]+ m²$/, left.text);
  assert.equal(w.ghost()!.refused, Number(left.text.split(' ')[0]!.replace(/,/g, '')), 'a cell is 1 m²');
  assert.equal(left.show!.length, 2, 'Show me frames the cells left out');
  // a hole away from the others passes them all
  const far = golf(); far.plan([40, 300], [230, 300]);
  assert.deepEqual(rows(far.w), ['ok:ok-land', 'ok:ok-road', 'ok:ok-near']);
});

test('14. Seed and Sod: both prices from the same cells, the split by surface adds up to the price, and the money line\'s words', () => {
  const { tool, w, plan } = golf();
  plan([40, 120], [230, 120]);
  const k = w.costs()!, gh = w.ghost()!;
  assert.equal(k.seed, gh.cost, 'Seed is the default');
  const split = w.split(); let sum = 0; for (const v of split.values()) sum += v.cost;
  assert.ok(Math.abs(sum - gh.cost) <= split.size, `split $${sum} vs $${gh.cost}`);
  assert.ok((split.get(SURF.green)?.cells ?? 0) > 300 && (split.get(SURF.tee)?.cells ?? 0) > 100);
  tool.plantKind = 'sod';
  assert.equal(w.ghost()!.cost, k.sod, 'with Sod the price is the Sod price');
  assert.equal(aboutMoney(282_400), '$282k'); assert.equal(aboutMoney(1_210_500), '$1.2M'); assert.equal(aboutMoney(950), '$950');
  assert.equal(aboutMoney(999_700), '$1.0M'); assert.equal(aboutMoney(Infinity), 'unlimited');
});

test('15. numbers: New hole offers the free numbers up to the last one and "after" it; the hole is built under the number picked', () => {
  const { st, tool, w, plan, down } = golf();
  plan([40, 120], [230, 120]); tool.buildPlan();
  plan([40, 300], [230, 300]); tool.buildPlan();
  plan([40, 480], [230, 480]); tool.buildPlan();
  assert.deepEqual(tool.planNumbers().map(o => o.n), [4]);
  // hole 2 taken out: 2 is free, and after 3 comes 4
  assert.ok(tool.editPlan(2)); assert.ok(tool.deletePlan());
  assert.ok(tool.setPlan());
  assert.equal(w.hole, 2, 'New hole 2: the first free number');
  assert.deepEqual(tool.planNumbers(), [{ n: 2, label: 'Hole 2' }, { n: 4, label: 'After 3: hole 4' }]);
  tool.setPlanHole(3); assert.equal(w.hole, 2, 'a number in use is refused');
  tool.setPlanHole(4); assert.equal(w.hole, 4);
  down(40, 560); down(230, 560);
  assert.equal(w.plan!.hole, 4);
  tool.key(key('Escape')); tool.key(key('Escape')); assert.equal(w.hole, 4, 'Esc keeps the number');
  down(40, 560); down(230, 560);
  assert.ok(tool.buildPlan());
  assert.deepEqual(decodePlans(st.plans).map(p => p.hole), [1, 3, 4]);
});

test('16. the camera: after the tee it eases out to 450 m round the tee (kept to your land), after the green it fits the plan, beside the panel', () => {
  const { st, w, down, tool } = golf();
  assert.ok(tool.setPlan());
  down(100, 150);
  assert.equal(st.fits.length, 1); assert.equal(st.fits[0]!.zoomIn, false, 'the tee only eases out');
  const r = Math.max(...st.fits[0]!.pts.map(p => Math.hypot(p.x - w.tee!.x, p.y - w.tee!.y)));
  assert.ok(Math.abs(r * 2 - TEE_VIEW_M) < 1, `everything within ${TEE_VIEW_M} m of the tee`);
  // with your land's box, the circle keeps to it (the green can only go on your land)
  const fenced = golf({ land: [60, 100, 300, 400] });
  assert.ok(fenced.tool.setPlan()); fenced.down(100, 150);
  for (const p of fenced.st.fits[0]!.pts) assert.ok(p.x >= 60 && p.x <= 300 && p.y >= 100 && p.y <= 400, `(${p.x}, ${p.y}) on the land's box`);
  assert.ok(fenced.st.fits[0]!.pts.some(p => p.x === 300) && fenced.st.fits[0]!.pts.some(p => p.y === 100));
  down(250, 150);
  assert.equal(st.fits.length, 2); assert.equal(st.fits[1]!.zoomIn, true, 'the plan is fitted, closer or farther');
  const xs = st.fits[1]!.pts.map(p => p.x);
  assert.ok(Math.min(...xs) <= w.plan!.tee.x && Math.max(...xs) >= w.plan!.green.x, 'the plan\'s tee and green are in the frame');
  // the framing itself: at 1600 x 1000 with the panel on the left 400 px, the circle fills the free map and stays in it
  const free = { l: 400, t: 90, r: 1600, b: 1000 }, cam = { X: 0, Y: 0, z: 0.3 };
  const v = frameView(st.fits[0]!.pts, free, 1600, 1000, cam, false, 0.006, 0.3)!;
  const sx = (p: { x: number; y: number }) => (worldX(p.x, p.y) - v.X) * v.z + 800, sy = (p: { x: number; y: number }) => (worldY(p.x, p.y) - v.Y) * v.z + 500;
  for (const p of st.fits[0]!.pts) assert.ok(sx(p) >= free.l && sx(p) <= free.r && sy(p) >= free.t && sy(p) <= free.b, `(${sx(p)}, ${sy(p)}) in the free map`);
  assert.ok(v.z > 0.02 && v.z < 0.04, `zoom ${v.z}`);
  const small = frameView(st.fits[0]!.pts, { l: 400, t: 90, r: 1366, b: 768 }, 1366, 768, cam, false, 0.006, 0.3)!;
  console.log(`New hole tee framing: ${(v.z * 100).toFixed(1)}% at 1600 x 1000, ${(small.z * 100).toFixed(1)}% at 1366 x 768 (panel 400 px)`);
  // already farther out with the circle in view: the camera stays
  const outCam = { X: worldX(100.25, 150.25) - (1000 - 800) / 0.02, Y: worldY(100.25, 150.25) - (545 - 500) / 0.02, z: 0.02 };
  assert.deepEqual(frameView(st.fits[0]!.pts, free, 1600, 1000, outCam, false, 0.006, 0.3), outCam);
});

test('17. planShape: straight, a dogleg left or right as the golfer sees it, two bends', () => {
  const p = (b: { x: number; y: number }[]) => newPlan(1, { x: 0, y: 0 }, { x: 200, y: 0 }, b);
  assert.equal(planShape(p([])), 'straight');
  assert.equal(planShape(p([{ x: 100, y: 3 }])), 'straight', 'a few degrees is straight');
  // heading east (+x) with y running down the map, a bend to +y and back is a left turn at the bend
  assert.equal(planShape(p([{ x: 100, y: 40 }])), 'dogleg left');
  assert.equal(planShape(p([{ x: 100, y: -40 }])), 'dogleg right');
  assert.equal(planShape(p([{ x: 60, y: 30 }, { x: 140, y: -30 }])), 'double dogleg');
});
