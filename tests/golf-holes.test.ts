// Headless tests for the golf holes (docs/GOLF-PLAN.md section 4.2): npm test (bundled by esbuild, run by node --test; no DOM).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courseStats, deriveHoles, holeLine, lineLength, parFromLength, surfaceAt } from '../src/game/golf/holes';
import type { CourseArea, GolfSurface, Pin, TeeMark } from '../src/game/golf/types';

/** a rectangle as a course area (tiles) */
const box = (id: number, surface: GolfSurface, x0: number, y0: number, x1: number, y1: number): CourseArea => ({ id, surface, pts: [x0, y0, x1, y0, x1, y1, x0, y1] });
/** the two-hole course: rough everywhere, then each hole's fairway, tee and green (a later area paints over an earlier one) */
const ROUGH = box(1, 'rough', 0, 0, 600, 400);
const F1 = box(2, 'fairway', 12, 44, 105, 56), T1 = box(3, 'tee', 5, 45, 15, 55), G1 = box(4, 'green', 104, 45, 118, 55);
const F2 = box(5, 'fairway', 124, 76, 136, 284), T2 = box(6, 'tee', 125, 75, 135, 85), G2 = box(7, 'green', 125, 275, 135, 285);
const BASE: CourseArea[] = [ROUGH, F1, T1, G1, F2, T2, G2];
/** BASE with the areas that share an id replaced */
const withAreas = (...repl: CourseArea[]): CourseArea[] => BASE.map(a => repl.find(r => r.id === a.id) ?? a);
/** hole 1: back tee (10, 50), middle (8, 50), pin (110, 50), 200 m straight; hole 2: back tee (130, 80), pin (130, 280), 400 m */
const TEES: TeeMark[] = [{ hole: 1, x: 10, y: 50, kind: 'back' }, { hole: 1, x: 8, y: 50, kind: 'middle' }, { hole: 2, x: 130, y: 80, kind: 'back' }];
const PINS: Pin[] = [{ hole: 1, x: 110, y: 50 }, { hole: 2, x: 130, y: 280 }];

test('surfaceAt: the topmost area containing the point wins; an even-odd notch is outside; null outside every area', () => {
  assert.equal(surfaceAt(BASE, 110, 50), 'green');
  assert.equal(surfaceAt(BASE, 60, 50), 'fairway');
  assert.equal(surfaceAt(BASE, 2, 2), 'rough');
  assert.equal(surfaceAt(BASE, 700, 700), null);
  assert.equal(surfaceAt([], 0, 0), null);
  const L: CourseArea = { id: 9, surface: 'bunker', pts: [0, 0, 10, 0, 10, 4, 4, 4, 4, 10, 0, 10] };
  assert.equal(surfaceAt([L], 2, 8), 'bunker');
  assert.equal(surfaceAt([L], 8, 8), null);
});

test('parFromLength: par 3 up to 230 m, par 4 up to 430 m, par 5 beyond', () => {
  assert.equal(parFromLength(230), 3);
  assert.equal(parFromLength(231), 4);
  assert.equal(parFromLength(430), 4);
  assert.equal(parFromLength(431), 5);
});

test('deriveHoles: a straight hole of 230, 231, 430 or 431 m gets par 3, 4, 4, 5', () => {
  const holes = [125, 125.5, 225, 225.5].map(x => deriveHoles([ROUGH], [{ hole: 1, x: 10, y: 200, kind: 'back' }], [{ hole: 1, x, y: 200 }], [])[0]);
  assert.deepEqual(holes.map(h => [h.lengthM, h.par]), [[230, 3], [231, 4], [430, 4], [431, 5]]);
});

test('holeLine: the tee, the aim points in order, then the pin; lineLength sums the segments in tiles', () => {
  const line = holeLine({ x: 0, y: 0 }, [{ x: 3, y: 4, order: 2 }, { x: 0, y: 4, order: 1 }], { x: 3, y: 0 });
  assert.deepEqual(line, [{ x: 0, y: 0 }, { x: 0, y: 4 }, { x: 3, y: 4 }, { x: 3, y: 0 }]);
  assert.equal(lineLength(line), 11);
});

test('deriveHoles: the two-hole course has known lengths, par and no warnings', () => {
  const holes = deriveHoles(BASE, TEES, PINS, []);
  assert.deepEqual(holes.map(h => h.n), [1, 2]);
  assert.deepEqual(holes.map(h => [h.par, h.lengthM, h.memberLengthM, h.warnings]), [[3, 200, 204, []], [4, 400, 400, []]]);
  assert.deepEqual(holes[0].line, [{ x: 10, y: 50 }, { x: 110, y: 50 }]);
});

test('deriveHoles: a pin off the green, a tee off the tee and a line over other ground each warn', () => {
  const pinOff = deriveHoles(BASE, TEES, [{ hole: 1, x: 80, y: 50 }, PINS[1]], []);
  assert.deepEqual(pinOff[0].warnings, ['The pin is not on a green']);
  const teeOff = deriveHoles(BASE, [TEES[0], TEES[1], { hole: 2, x: 130, y: 60, kind: 'back' }], PINS, []);
  assert.deepEqual(teeOff.map(h => h.warnings), [[], ['The back tee is not on a tee']]);
  const over = deriveHoles([...BASE, box(8, 'other', 20, 40, 98, 60)], TEES, PINS, []);
  assert.deepEqual(over.map(h => h.warnings), [['Most of the line is off the course'], []]);
});

test('deriveHoles: holes 20 tiles apart are too close (both warn); a 100-tile walk to the next tee is too long', () => {
  // hole 2 runs back along y = 70, 20 tiles from hole 1, and starts beside hole 1's pin
  const near = withAreas(box(5, 'fairway', 8, 66, 112, 74), box(6, 'tee', 105, 65, 115, 75), box(7, 'green', 5, 65, 15, 75));
  const close = deriveHoles(near, [TEES[0], TEES[1], { hole: 2, x: 110, y: 70, kind: 'back' }], [PINS[0], { hole: 2, x: 10, y: 70 }], []);
  assert.deepEqual(close.map(h => h.warnings), [['Too close to hole 2'], ['Too close to hole 1']]);
  const far = deriveHoles(withAreas(box(6, 'tee', 295, 195, 305, 205)), [TEES[0], TEES[1], { hole: 2, x: 300, y: 200, kind: 'back' }], PINS, []);
  assert.deepEqual(far.map(h => h.warnings), [['Long walk to the next tee'], []]);
});

test('deriveHoles: a dogleg aim point lengthens the hole and its par', () => {
  const [h] = deriveHoles(BASE, TEES.slice(0, 2), PINS.slice(0, 1), [{ hole: 1, x: 60, y: 150, order: 1 }]);
  assert.deepEqual([h.lengthM, h.memberLengthM, h.par, h.warnings], [447, 449, 5, []]);
});

test('deriveHoles: a hole with no pin or no tee markers is kept with length 0, par 4 and its warning', () => {
  const noPin = deriveHoles(BASE, TEES, [PINS[0]], []);
  assert.deepEqual(noPin[1], { n: 2, par: 4, lengthM: 0, memberLengthM: 0, line: [], warnings: ['No pin'] });
  const noTee = deriveHoles(BASE, [TEES[0], TEES[1]], PINS, []);
  assert.deepEqual(noTee[1], { n: 2, par: 4, lengthM: 0, memberLengthM: 0, line: [], warnings: ['No tee markers'] });
});

test('courseStats: totals over the playable holes only, with the par mix', () => {
  const holes = deriveHoles(BASE, TEES, PINS, []);
  assert.deepEqual(courseStats(holes), { holes: 2, par: 7, lengthM: 600, memberLengthM: 604, mix: { 3: 1, 4: 1, 5: 0 } });
  const stub = deriveHoles(BASE, [{ hole: 3, x: 10, y: 300, kind: 'back' }], [], []);
  const withStub = courseStats([...holes, ...stub]);
  assert.deepEqual([withStub.holes, withStub.par, withStub.lengthM], [2, 7, 600]);
});
