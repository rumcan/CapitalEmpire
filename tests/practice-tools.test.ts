// T206 (#540): the practice facilities' own building tools (golf/practicebuild.ts). A placed putting green and a chipping green with its
// bunker scan open in practice.ts (the cells they lay are the ones painting laid); the size never goes under the minimum; the outline is
// organic (no straight run); a spot outside the area, too near another facility or on a facility already open is refused; the bulldozer
// takes a facility whole (green, bunker and chip mat), an old save's painted one too; and old painted facilities still count.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PUTT_MIN, CHIP_MIN, BUNKER_MIN, practiceArea, practiceWords, scanPractice } from '../src/game/golf/practice';
import { PRACTICE_SIZE, PRACTICE_WHY, PUTT_SHAPES, GAP_M, TURNS, bunkerInReach, clampSize, facilityAt, facilityRefund, planCells, planCost, planWhy, practicePlan, type PlanSpec } from '../src/game/golf/practicebuild';
import { SURF, makeGrid, paintCells, paintDisc, type Grid } from '../src/game/ext/course-grid';
import { plotPoint } from '../src/game/golf/range';
import type { Rect } from '../src/game/golf/mode';
import { PRACTICE_BRUSH_WHY, PaintTool, type PaintHost } from '../src/game/paint-tool';
import { inPractice } from '../src/game/golf/practice';
import { cellAt } from '../src/game/ext/course-grid';

const plot: Rect = [200, 200, 70, 150];
const AREA = practiceArea(plot, 2), BOX = AREA.box;
const P = (u: number, v: number) => plotPoint(plot, 2, u, v);
const grid = (): Grid => makeGrid(190, 190, 300, 420);
/** lays a plan's cells as the tool does (hole 0) */
function lay(g: Grid, spec: PlanSpec) {
  const p = practicePlan(spec), c = planCells(g, p);
  paintCells(g, c.green, c.green.length, SURF.green, 0, 0); paintCells(g, c.bunker, c.bunker.length, SURF.bunker, 0, 0); paintCells(g, c.tee, c.tee.length, SURF.tee, 0, 0);
  return { p, c };
}
const spec = (kind: PlanSpec['kind'], u: number, v: number, extra: Partial<PlanSpec> = {}): PlanSpec => { const q = P(u, v); return { kind, x: q.x, y: q.y, m2: PRACTICE_SIZE[kind].def, turn: 0, shape: 0, seed: 1, ...extra }; };

test('a placed putting green and a chipping green with its bunker scan open (practice.ts unchanged)', () => {
  for (let shape = 0; shape < PUTT_SHAPES.length; shape++) for (let turn = 0; turn < TURNS; turn += 3) {
    const g = grid();
    lay(g, spec('putting', 86, 19, { shape, turn, seed: 7 + shape }));
    lay(g, spec('chipping', 104, 19, { turn, seed: 3 }));
    const s = scanPractice(g, BOX);
    assert.equal(s.putting.state, 'open', `putting (shape ${shape}, turn ${turn}): ${practiceWords(s.putting)}`);
    assert.equal(s.chipping.state, 'open', `chipping (turn ${turn}): ${practiceWords(s.chipping)}`);
    assert.ok(s.putting.cups.length >= 1, 'the putting green has its flags');
  }
});

test('the smallest facility of each kind still opens; the size never goes under the minimum', () => {
  assert.equal(clampSize('putting', 10), PUTT_MIN); assert.equal(clampSize('chipping', 10), CHIP_MIN);
  assert.equal(clampSize('putting', 1e6), PRACTICE_SIZE.putting.max);
  for (const turn of [0, 1, 2, 5]) {
    const g = grid();
    const a = lay(g, spec('putting', 86, 19, { m2: 1, turn, shape: 3 }));
    const b = lay(g, spec('chipping', 104, 19, { m2: 1, turn }));
    assert.ok(a.c.green.length >= PUTT_MIN * 0.96, `putting green ${a.c.green.length} m² alone`);
    assert.ok(bunkerInReach(g, b.c) >= BUNKER_MIN, `the practice bunker lies within reach: ${bunkerInReach(g, b.c)} cells`);
    const s = scanPractice(g, BOX);
    assert.equal(s.putting.state, 'open'); assert.equal(s.chipping.state, 'open');
  }
});

test('the putting green is organic: rounded, every outline different by its seed, no straight run', () => {
  const a = practicePlan(spec('putting', 90, 19, { seed: 1 })).green, b = practicePlan(spec('putting', 90, 19, { seed: 2 })).green;
  assert.notDeepEqual(a, b, 'the seed moves the wobble');
  // no three points in a row on one line over more than 2 m
  const n = a.length >> 1;
  for (let i = 0; i < n; i++) {
    const p = [a[2 * i]!, a[2 * i + 1]!], q = [a[2 * ((i + 1) % n)]!, a[2 * ((i + 1) % n) + 1]!], r = [a[2 * ((i + 2) % n)]!, a[2 * ((i + 2) % n) + 1]!];
    const cross = (q[0]! - p[0]!) * (r[1]! - p[1]!) - (q[1]! - p[1]!) * (r[0]! - p[0]!), len = Math.hypot(r[0]! - p[0]!, r[1]! - p[1]!);
    if (len > 1) assert.ok(Math.abs(cross) > 1e-6, `a straight run at point ${i}`);
  }
});

test('refused outside the area, too near another facility, or on a facility already open', () => {
  const g = grid();
  const out = practicePlan(spec('putting', 60, 19));
  assert.equal(planWhy(g, out, planCells(g, out), { box: BOX }).kind, 'outside');
  const edge = practicePlan(spec('putting', 76.5, 19));
  assert.equal(planWhy(g, edge, planCells(g, edge), { box: BOX }).why, PRACTICE_WHY.outside, 'the green with its fringe must lie inside');
  const ok = practicePlan(spec('putting', 86, 19));
  assert.equal(planWhy(g, ok, planCells(g, ok), { box: BOX }).why, '');
  assert.equal(planWhy(g, ok, planCells(g, ok), { box: BOX, owned: () => false }).kind, 'land');
  assert.equal(planWhy(g, ok, planCells(g, ok), { box: BOX, open: true }).why, PRACTICE_WHY.built.putting);
  lay(g, spec('putting', 84, 19));
  const near = practicePlan(spec('chipping', 84 + 12, 19));
  assert.equal(planWhy(g, near, planCells(g, near), { box: BOX }).kind, 'near', `${GAP_M} m clear of the putting green`);
  const far = practicePlan(spec('chipping', 104, 19, { turn: 2 }));
  assert.equal(planWhy(g, far, planCells(g, far), { box: BOX }).why, '');
  assert.ok(planCost(g, planCells(g, far)) > 0, 'it has a price');
});

test('the bulldozer takes a facility whole: the chipping green with its bunker and chip mat, not the putting green beside it', () => {
  const g = grid();
  const put = lay(g, spec('putting', 86, 19)), chip = lay(g, spec('chipping', 104, 19, { turn: 2 }));
  const at = chip.p.centre, f = facilityAt(g, BOX, at.x, at.y)!;
  assert.equal(f.green, chip.c.green.length); assert.equal(f.bunker, chip.c.bunker.length); assert.equal(f.tee, chip.c.tee.length);
  assert.ok(facilityRefund(f) > 0);
  // from its bunker too
  const b = chip.p.bunker!, fb = facilityAt(g, BOX, (b[0]! + b[b.length / 2]!) / 2, (b[1]! + b[b.length / 2 + 1]!) / 2);
  assert.ok(fb && fb.cells.length === f.cells.length, 'the bunker belongs to it');
  const fp = facilityAt(g, BOX, put.p.centre.x, put.p.centre.y)!;
  assert.equal(fp.cells.length, put.c.green.length, 'the putting green alone');
  assert.equal(facilityAt(g, BOX, P(60, 19).x, P(60, 19).y), null, 'nothing outside the area');
});

test('an old save\'s painted facilities still count, and the bulldozer takes them too', () => {
  const g = grid(), p = P(88, 19), c = P(104, 14), b = P(104, 21);
  paintDisc(g, p.x, p.y, 6, SURF.green, 0, 0); paintDisc(g, c.x, c.y, 4.5, SURF.green, 0, 0); paintDisc(g, b.x, b.y, 2, SURF.bunker, 0, 0);
  const s = scanPractice(g, BOX);
  assert.equal(s.putting.state, 'open'); assert.equal(s.chipping.state, 'open');
  const f = facilityAt(g, BOX, c.x, c.y)!; assert.ok(f.green > 0 && f.bunker > 0);
});

/** a PaintTool on the facing-2 grid whose practice area is AREA (the engine's practiceAt), with a treasury */
function painter() {
  const g = grid(), money = { v: 1e6 };
  const host: PaintHost = {
    setLotGround() {}, emit() {}, save() {}, toast() {}, affine() {}, placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [],
    golfMode: () => true, currentMonth: () => 5, money: () => money.v, spend: n => { money.v -= n; },
    grid: () => g, gridChanged() {}, ownedAt: () => true, practiceAt: (x, y) => inPractice(AREA, x, y),
  };
  const tool = new PaintTool(host); tool.enterCourse(); tool.setHole(1);
  return { g, tool, money };
}
const stroke = (tool: PaintTool, x: number, y: number) => { tool.cursor = { x, y }; tool.pointerDown({ x, y }, 0, 0); tool.pointerUp(0.5); };

test('the hole brushes are refused in the practice area: Green and Bunker lay nothing there, with the reason; elsewhere they paint', () => {
  const { g, tool } = painter(), inside = P(90, 19);
  for (const k of ['green', 'bunker'] as const) {
    const outside = k === 'green' ? P(40, 80) : P(40, 100);
    tool.setBrush(k); tool.setBrushCells(4);
    stroke(tool, inside.x, inside.y);
    const i = cellAt(g, inside.x, inside.y); assert.equal(g.surf[i], SURF.none, `${k}: nothing laid in the practice area`);
    assert.equal(tool.brushSkipWhy()!(inside.x, inside.y), PRACTICE_BRUSH_WHY);
    assert.equal(PRACTICE_BRUSH_WHY, 'Practice greens are built with Facilities ▸ Practice');
    stroke(tool, outside.x, outside.y);
    assert.equal(g.surf[cellAt(g, outside.x, outside.y)], k === 'green' ? SURF.green : SURF.bunker, `${k}: paints outside it`);
  }
  // an old save's painted facility stays (the grid is never rubbed out by the rule) and still counts
  paintDisc(g, P(88, 19).x, P(88, 19).y, 6, SURF.green, 0, 0);
  assert.equal(scanPractice(g, BOX).putting.state, 'open');
});

test("a facility is one undo step: gridEdit lays its cells and pays; undo takes both back; the bulldozer's refund is undone too", () => {
  const { g, tool, money } = painter(), sp = spec('chipping', 104, 19, { turn: 2 }), p = practicePlan(sp), c = planCells(g, p), cost = planCost(g, c);
  tool.gridEdit('build the chipping green and bunker', gg => ({ diffs: [paintCells(gg, c.green, c.green.length, SURF.green, 0, 0), paintCells(gg, c.bunker, c.bunker.length, SURF.bunker, 0, 0), paintCells(gg, c.tee, c.tee.length, SURF.tee, 0, 0)], spent: cost }));
  assert.equal(money.v, 1e6 - cost); assert.equal(scanPractice(g, BOX).chipping.state, 'open');
  assert.equal(tool.undoLabel, 'build the chipping green and bunker');
  tool.undo(); assert.equal(money.v, 1e6); assert.equal(scanPractice(g, BOX).built, false, 'all of it gone in one step');
  tool.redo(); assert.equal(scanPractice(g, BOX).chipping.state, 'open');
  const f = facilityAt(g, BOX, p.centre.x, p.centre.y)!, back = facilityRefund(f);
  tool.gridEdit('remove the chipping green and bunker', gg => ({ diffs: [paintCells(gg, f.cells, f.cells.length, SURF.none, 0, 0)], spent: -back }));
  assert.equal(scanPractice(g, BOX).built, false); assert.equal(money.v, 1e6 - cost + back);
  assert.equal(back, Math.round(cost / 2), 'half its price back');
  tool.undo(); assert.equal(scanPractice(g, BOX).chipping.state, 'open'); assert.equal(money.v, 1e6 - cost);
});
