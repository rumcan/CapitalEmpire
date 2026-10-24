// Headless tests for the Course tool's Height brush (T027b): npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCourseHeightField, sampleCourseHeight, type CourseHeightField, type CourseTileBox } from '../src/game/ext/course-height';
import { PaintTool, type PaintHost } from '../src/game/paint-tool';

/** a host over one course height field: the toasts, the boxes the height changed in and the money spent are recorded; extra overrides any hook */
function host(field: CourseHeightField, toasts: string[] = [], boxes: CourseTileBox[] = [], extra: Partial<PaintHost> = {}) {
  return { setLotGround() {}, emit() {}, save() {}, toast: (t: string) => { toasts.push(t); }, affine() {}, placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [], courseHeight: () => field, heightChanged: (b: CourseTileBox) => { boxes.push(b); }, ...extra };
}

/** a key press for the tool (as the course tests send them) */
const key = (tool: PaintTool, k: string) => tool.key({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, preventDefault() {} } as KeyboardEvent);

/** a drag over the points (pointerDown on the first, pointerMove over the rest, pointerUp) */
function drag(tool: PaintTool, pts: [number, number][]) {
  const [x0, y0] = pts[0]!;
  tool.pointerDown({ x: x0, y: y0 }, 0, 0);
  for (const [x, y] of pts.slice(1)) tool.pointerMove({ x, y }, 0, 0);
  tool.pointerUp(0);
}

describe('course height brush (T027b)', () => {
  it('a raise drag lifts the ground under the cursor; undo takes the whole drag back and redo lays it again', () => {
    const f = createCourseHeightField(), boxes: CourseTileBox[] = [];
    const tool = new PaintTool(host(f, [], boxes) as PaintHost);
    tool.enterCourse(); tool.setHeight({ mode: 'raise', r: 8, level: 3 });
    drag(tool, [[300, 300], [306, 300], [312, 300]]);
    assert.ok(sampleCourseHeight(f, 306, 300) > 0);
    assert.ok(boxes.length >= 2);
    assert.equal(tool.canUndo, true);
    tool.undo();
    assert.ok(f.data.every(v => v === 0));
    tool.redo();
    assert.ok(sampleCourseHeight(f, 306, 300) > 0);
  });

  it('lower digs the ground down; flatten then brings it back toward level', () => {
    const f = createCourseHeightField(), tool = new PaintTool(host(f) as PaintHost);
    tool.enterCourse(); tool.setHeight({ mode: 'lower', r: 8, level: 3 });
    drag(tool, [[300, 300]]);
    const low = sampleCourseHeight(f, 300, 300);
    assert.ok(low < 0);
    tool.setHeight({ mode: 'flatten', r: 8, level: 5 });
    for (let i = 0; i < 5; i++) { tool.pointerDown({ x: 300, y: 300 }, 0, 0); tool.pointerUp(0); }
    assert.ok(Math.abs(sampleCourseHeight(f, 300, 300)) < Math.abs(low));
  });

  it('in golf mode a raise drag spends the earthworks, and undo refunds all of it', () => {
    const f = createCourseHeightField(), spent: number[] = [];
    const tool = new PaintTool(host(f, [], [], { golfMode: () => true, money: () => 1e9, spend: (n: number) => { spent.push(n); }, ownedLand: () => true }) as PaintHost);
    tool.enterCourse(); tool.setHeight({ mode: 'raise', r: 8, level: 3 });
    drag(tool, [[300, 300], [306, 300], [312, 300]]);
    assert.ok(spent.reduce((a, b) => a + b, 0) > 0);
    tool.undo();
    assert.ok(Math.abs(spent.reduce((a, b) => a + b, 0)) < 1);
  });

  it('with no money the brush refuses every dab: the field stays flat and one toast says so', () => {
    const f = createCourseHeightField(), toasts: string[] = [];
    const tool = new PaintTool(host(f, toasts, [], { golfMode: () => true, money: () => 0, ownedLand: () => true }) as PaintHost);
    tool.enterCourse(); tool.setHeight({ mode: 'raise', r: 8, level: 3 });
    drag(tool, [[300, 300], [306, 300], [312, 300]]);
    assert.ok(f.data.every(v => v === 0));
    assert.equal(toasts.filter(t => t.startsWith('Not enough money')).length, 1);
    assert.equal(toasts.length, 1);
  });

  it('off your land the brush refuses: the field stays flat and the toast says the land is not yours', () => {
    const f = createCourseHeightField(), toasts: string[] = [];
    const tool = new PaintTool(host(f, toasts, [], { golfMode: () => true, money: () => 1e9, ownedLand: () => false }) as PaintHost);
    tool.enterCourse(); tool.setHeight({ mode: 'raise', r: 8, level: 3 });
    drag(tool, [[300, 300], [306, 300], [312, 300]]);
    assert.ok(f.data.every(v => v === 0));
    assert.equal(toasts[0], 'Outside your land');
    assert.equal(toasts.length, 1);
  });

  it('enterPaint leaves height mode for draw, and the ] key widens the brush in height mode', () => {
    const f = createCourseHeightField(), tool = new PaintTool(host(f) as PaintHost);
    tool.enterCourse(); tool.setHeight({ mode: 'raise', r: 6 });
    assert.equal(key(tool, ']'), true);
    assert.equal(tool.heightR, 7);
    tool.enterPaint();
    assert.equal(tool.mode, 'draw');
  });

  it('classic mode (no golf) lays the dabs and never spends', () => {
    const f = createCourseHeightField(), spent: number[] = [];
    const tool = new PaintTool(host(f, [], [], { spend: (n: number) => { spent.push(n); } }) as PaintHost);
    tool.enterCourse(); tool.setHeight({ mode: 'raise', r: 8, level: 3 });
    drag(tool, [[300, 300], [306, 300], [312, 300]]);
    assert.ok(sampleCourseHeight(f, 306, 300) > 0);
    assert.equal(spent.length, 0);
  });
});
