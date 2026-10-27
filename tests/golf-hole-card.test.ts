// The hole card (plan P23-UX 6.2 P2-4, T174; golf/holecard.ts): its facts from a fixture course, the pin and tee drags (never a re-plan or a
// charge, refused off their surface), Delete's stated refund, and renumbering (the routing follows the new numbers).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteNote, holeAreas, holeCard, markerMove, swapHoleNumbers, teeLengths, walkToNext } from '../src/game/golf/holecard';
import { SURF, cellAt, makeGrid } from '../src/game/ext/course-grid';
import { MONTH_BASE } from '../src/game/ext/course-grid/areas';
import { deriveHoles } from '../src/game/golf/holes';
import type { HoleView } from '../src/game/golf/holeview';
import type { AimPoint, CourseArea, Pin, TeeMark } from '../src/game/golf/types';

/** a rectangle as a polygon (tiles) */
const rect = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1];
/** the fixture course: hole 1 runs east from a tee at (10, 10) to a green round (90, 10); hole 2 runs south from a tee at (100, 30) to a green
 *  round (100, 130) (both in tiles); each with its tee box, fairway and green */
const AREAS: CourseArea[] = [
  { id: 1, surface: 'tee', pts: rect(6, 6, 14, 14) }, { id: 2, surface: 'fairway', pts: rect(14, 4, 84, 16) }, { id: 3, surface: 'green', pts: rect(84, 4, 96, 16) },
  { id: 4, surface: 'tee', pts: rect(96, 26, 104, 34) }, { id: 5, surface: 'fairway', pts: rect(94, 34, 106, 124) }, { id: 6, surface: 'green', pts: rect(94, 124, 106, 136) },
];
const PINS: Pin[] = [{ hole: 1, x: 90, y: 10 }, { hole: 2, x: 100, y: 130 }];
const TEES: TeeMark[] = [
  { hole: 1, kind: 'back', x: 8, y: 10 }, { hole: 1, kind: 'middle', x: 10, y: 10 }, { hole: 1, kind: 'forward', x: 12, y: 10 },
  { hole: 2, kind: 'back', x: 100, y: 28 }, { hole: 2, kind: 'middle', x: 100, y: 30 }, { hole: 2, kind: 'forward', x: 100, y: 32 },
];
const AIMS: AimPoint[] = [];
/** a hole view as Engine.courseHoleViews gives it, for hole n with these checks and warnings */
const view = (n: number, over: Partial<HoleView> = {}): HoleView => ({ n, started: true, par: 4, lengthM: 164, memberLengthM: 160, checks: [{ label: 'Green painted', ok: true }, { label: 'Tee painted', ok: true }, { label: 'Fairway painted', ok: true }, { label: 'Pin on the green', ok: true }, { label: 'Tee markers on the tee', ok: true }], warnings: [], ok: true, virtual: false, ...over });

test("the card's facts from a fixture course: lengths from each tee, the walk to the next tee, the surfaces' areas and their grow-in", () => {
  assert.deepEqual(teeLengths(1, PINS, TEES, AIMS), [{ kind: 'back', m: 164 }, { kind: 'middle', m: 160 }, { kind: 'forward', m: 156 }]);
  assert.deepEqual(teeLengths(3, PINS, TEES, AIMS), [], 'no pin, no lengths');
  assert.equal(walkToNext(1, PINS, TEES), Math.round(Math.hypot(100 - 90, 28 - 10) * 2));
  assert.equal(walkToNext(2, PINS, TEES), null, 'no hole 3');
  // a grid with hole 2's cells: 40 green cells seeded in month 3 (a green grows in over 6 months), 100 fairway cells established, 25 rough
  const g = makeGrid(0, 0, 60, 60);
  const put = (from: number, n: number, s: number, hole: number, month: number) => { for (let i = from; i < from + n; i++) { g.surf[i] = s; g.hole[i] = hole; g.month[i] = month; } };
  put(0, 40, SURF.green, 2, 3 + MONTH_BASE); put(100, 100, SURF.fairway, 2, 0); put(300, 25, SURF.rough, 2, 0); put(400, 10, SURF.tee, 1, 0);
  const a = holeAreas(g, 2, 5);
  assert.deepEqual(a.map(x => [x.surface, x.m2]), [['fairway', 100], ['green', 40], ['rough', 25]], 'the biggest first, a cell a m²');
  const green = a.find(x => x.surface === 'green')!;
  assert.ok(green.ready !== null && green.ready > 5, `the green still grows in at month 5 (ready ${green.ready})`);
  assert.equal(a.find(x => x.surface === 'fairway')!.ready, null, 'established fairway is grown in');
  assert.equal(holeAreas(g, 2, 60).find(x => x.surface === 'green')!.ready, null, 'grown in later');
  assert.equal(holeAreas(g, 2, 5, 2).find(x => x.surface === 'green')!.ready, green.ready! - 2, 'the grow cards bring it forward');
  assert.deepEqual(holeAreas(g, 1, 5).map(x => x.surface), ['tee']);
  assert.deepEqual(holeAreas(null, 2, 5), []);
});

test('each failing check carries the Fix that arms its tool; warnings are said with their numbers; Edit hole only for a planned hole', () => {
  const v = view(1, { ok: false, checks: [{ label: 'Green painted', ok: true }, { label: 'Tee painted', ok: false }, { label: 'Fairway painted', ok: false }, { label: 'Pin on the green', ok: false }, { label: 'Tee markers on the tee', ok: false }], warnings: ['Long walk to the next tee', 'Too close to hole 2', 'Most of the line is off the course'] });
  const c = holeCard(v, { pins: PINS, tees: TEES, aims: AIMS, areas: [], ready: null, planned: true });
  assert.equal(c.n, 1); assert.equal(c.par, 4); assert.equal(c.tees[0]!.m, 164);
  const fix = (t: string) => c.checks.find(k => k.text === t)?.fix;
  assert.equal(c.checks.find(k => k.text === 'Green painted')!.fix, null, 'an ok check has no Fix');
  assert.deepEqual(fix('Tee painted'), { kind: 'brush', surface: 'tee' });
  assert.deepEqual(fix('Fairway painted'), { kind: 'brush', surface: 'fairway' });
  assert.deepEqual(fix('Pin on the green'), { kind: 'marker', marker: 'pin' });
  assert.deepEqual(fix('Tee markers on the tee'), { kind: 'marker', marker: 'back' });
  const walk = c.checks.find(k => k.text.startsWith('A '))!;
  assert.equal(walk.text, `A ${walkToNext(1, PINS, TEES)} m walk to hole 2's tee`); assert.equal(walk.fix, null); assert.ok(walk.warn);
  assert.deepEqual(fix('Too close to hole 2: golfers there are in range'), { kind: 'edit' });
  assert.deepEqual(fix('Most of the line is off the course'), { kind: 'edit' });
  // painted by hand: no plan, so no Edit hole as a Fix
  const hand = holeCard(v, { pins: PINS, tees: TEES, aims: AIMS, areas: [], ready: null, planned: false });
  assert.equal(hand.planned, false);
  assert.ok(hand.checks.filter(k => k.warn).every(k => k.fix === null));
  // D7.3: existing data only: no quality, golfers or fees in the card
  assert.deepEqual(Object.keys(c).sort(), ['areas', 'checks', 'n', 'par', 'planned', 'ready', 'tees']);
});

test('a pin or tee drag moves only that marker, never a plan or money, and is refused off its surface with the reason', () => {
  const m = { pins: PINS, tees: TEES };
  const ok = markerMove(m, AREAS, 1, 'pin', 92, 12);
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.deepEqual(ok.pins.find(p => p.hole === 1), { hole: 1, x: 92, y: 12 });
    assert.deepEqual(ok.pins.find(p => p.hole === 2), PINS[1], 'the other pin stays');
    assert.deepEqual(ok.tees, TEES, 'the tees stay');
    assert.deepEqual(Object.keys(ok).sort(), ['ok', 'pins', 'tees'], 'only markers come back: no plan, no cost');
  }
  const off = markerMove(m, AREAS, 1, 'pin', 50, 10);
  assert.deepEqual(off, { ok: false, reason: 'A pin must be placed on a green' }, 'a pin on the fairway is refused');
  const tee = markerMove(m, AREAS, 2, 'middle', 101, 31);
  assert.ok(tee.ok && tee.tees.find(t => t.hole === 2 && t.kind === 'middle')!.x === 101);
  const teeOff = markerMove(m, AREAS, 2, 'forward', 100, 60);
  assert.equal(teeOff.ok, false); if (!teeOff.ok) assert.equal(teeOff.reason, 'A forward tee marker must be placed on a tee');
  assert.deepEqual(PINS[0], { hole: 1, x: 90, y: 10 }, 'the inputs are not changed');
});

test("Delete states its refund, and the refund is the rule's: none (course work is not refunded); it names the area that goes", () => {
  const n = deleteNote({ n: 3, areas: [{ surface: 'fairway', m2: 2600, ready: null }, { surface: 'green', m2: 550, ready: 7 }, { surface: 'tee', m2: 120, ready: null }] });
  assert.equal(n.refund, 0);
  assert.equal(n.m2, 3270);
  assert.match(n.text, /Up to 3,270 m² of hole 3/);
  assert.match(n.text, /No refund/);
  assert.match(n.text, /pin and tee markers go/);
});

test('renumbering: two holes trade numbers everywhere a number lives, and the routing follows (the walk check reads the new order)', () => {
  const g = makeGrid(0, 0, 40, 40);
  const c1 = cellAt(g, 5, 5), c2 = cellAt(g, 10, 10), c0 = cellAt(g, 15, 15);
  g.surf[c1] = SURF.green; g.hole[c1] = 1; g.surf[c2] = SURF.tee; g.hole[c2] = 2; g.surf[c0] = SURF.rough; g.hole[c0] = 4;
  const plans = [{ hole: 1, seed: 11 }, { hole: 2, seed: 22 }, { hole: 4, seed: 44 }];
  const areas: { hole?: number }[] = [{ hole: 1 }, { hole: 2 }, {}];
  const aims: AimPoint[] = [{ hole: 2, x: 100, y: 80, order: 0 }];
  const r = swapHoleNumbers(1, 2, { grid: g, pins: PINS, tees: TEES, aims, plans, areas });
  assert.equal(g.hole[c1], 2); assert.equal(g.hole[c2], 1); assert.equal(g.hole[c0], 4, 'other holes keep their numbers');
  assert.deepEqual(r.cells.sort((a, b) => a - b), [c1, c2].sort((a, b) => a - b));
  assert.deepEqual(r.plans.map(p => [p.hole, p.seed]), [[1, 22], [2, 11], [4, 44]], 'each plan keeps its shape under its new number, sorted');
  assert.deepEqual(areas.map(a => a.hole), [2, 1, undefined]);
  assert.deepEqual(r.aims, [{ hole: 1, x: 100, y: 80, order: 0 }]);
  assert.deepEqual(r.pins.map(p => [p.hole, p.x]), [[2, 90], [1, 100]]);
  // the routing follows: before, hole 1's green (90, 10) to hole 2's tee (100, 28) was the walk; after, the old hole 2 is hole 1, and its green
  // (100, 130) walks to the new hole 2's tee (8, 10)
  const before = deriveHoles(AREAS, TEES, PINS, AIMS), after = deriveHoles(AREAS, r.tees, r.pins, []);
  assert.equal(after.find(h => h.n === 1)!.lengthM, before.find(h => h.n === 2)!.lengthM, "the old hole 2's length is hole 1's now");
  assert.equal(after.find(h => h.n === 2)!.lengthM, before.find(h => h.n === 1)!.lengthM);
  assert.equal(walkToNext(1, r.pins, r.tees), Math.round(Math.hypot(100 - 8, 130 - 10) * 2), 'the walk check reads the new numbers');
  assert.ok(after.find(h => h.n === 1)!.warnings.includes('Long walk to the next tee'), 'and deriveHoles warns about the new long walk');
  assert.ok(!before.find(h => h.n === 1)!.warnings.includes('Long walk to the next tee'), 'which the old order did not have');
  // swapping back restores everything
  const back = swapHoleNumbers(1, 2, { grid: g, pins: r.pins, tees: r.tees, aims: r.aims, plans: r.plans, areas });
  assert.equal(g.hole[c1], 1); assert.deepEqual(back.pins, PINS); assert.deepEqual(back.tees, TEES); assert.deepEqual(areas.map(a => a.hole), [1, 2, undefined]);
  // a number nobody has: the hole simply moves there
  const moved = swapHoleNumbers(4, 9, { grid: g, pins: [], tees: [], aims: [], plans, areas: [] });
  assert.equal(g.hole[c0], 9); assert.deepEqual(moved.plans.map(p => p.hole), [1, 2, 9]);
});
