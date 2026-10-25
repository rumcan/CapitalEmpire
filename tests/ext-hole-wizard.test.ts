/** The New hole wizard and plan handles (T102, plan P21 3.3 A): a plan from two clicks, handle edits (a bend, a width), the ghost's price
 * before the click, Build as the planDiff of the ghost with one undo step, hand touch-ups kept on an edit, delete, refused cells, and
 * golf.aims written from the plans (pure, Node: the wizard alone and the Paint tool's plan mode with a stand-in host). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SURF, cellAt, makeGrid, paintDisc, type Grid } from '../src/game/ext/course-grid';
import { gridAreas } from '../src/game/ext/course-grid/areas';
import { centreLine, decodePlan, planDiff, type HolePlan } from '../src/game/ext/hole-plan';
import { HoleWizard, aimsFromPlans, decodePlans, newPlan, snapPt, withWidthAt, type WizardHost } from '../src/game/ext/hole-wizard';
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

test('5. editing the green after touching up a bunker: the bunker stays; only changed cells change', () => {
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
  const spent0 = st.spent;
  assert.ok(tool.buildPlan());
  assert.deepEqual(at(145, 126), [SURF.bunker, 1], 'the bunker stays');
  assert.equal(at(gr.x + 8, gr.y - 3)[0], SURF.green, 'the green moved');
  assert.ok(st.spent - spent0 > 0 && st.spent - spent0 < 0.3 * full, `only the changed cells are charged: $${st.spent - spent0} of a $${full} hole`);
  assert.equal(decodePlans(st.plans).length, 1, 'still one plan');
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
