// Headless tests for the course height data wiring (T027): the brush's earth estimate and box, the undo journal, the paint tool's piece height ops and
// earthworks price, and the golf save chunks. npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CourseHeightJournal,
  applyCourseHeightBrush,
  brushBox,
  createCourseHeightField,
  estimateCourseBrushM3,
  loadCourseHeight,
  saveCourseHeight,
  type CourseHeightBrushDab,
  type CourseHeightField,
  type CourseTileBox,
} from '../src/game/ext/course-height';
import { pieceCost } from '../src/game/ext/course-pieces';
import { normalizeGolfSave } from '../src/game/golf/mode';
import { PaintTool, type PaintHost } from '../src/game/paint-tool';

/** a host that records nothing and does nothing; extra members override it */
function host(extra: Partial<PaintHost> = {}): PaintHost {
  return { setLotGround() {}, emit() {}, save() {}, toast() {}, affine() {}, placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [], ...extra };
}

/** a copy of a field (its data and rev) */
function copyField(f: CourseHeightField): CourseHeightField { return { data: new Float32Array(f.data), rev: f.rev }; }

/** whether every sample of the field is zero */
function allZero(f: CourseHeightField): boolean { return f.data.every(v => v === 0); }

describe('course height wiring (T027)', () => {
  it('estimateCourseBrushM3 equals the earth a raise dab really moves (Σ|Δh| × 16), and changes nothing', () => {
    const f = createCourseHeightField(), before = new Float32Array(f.data), rev = f.rev;
    const dab: CourseHeightBrushDab = { x: 300, y: 300, radiusTiles: 8, mode: 'raise', strength: 0.5 };
    const m3 = estimateCourseBrushM3(f, dab);
    assert.equal(f.rev, rev);
    assert.ok(f.data.every((v, i) => v === before[i]));
    const g = copyField(f);
    applyCourseHeightBrush(g, dab);
    let sum = 0;
    for (let i = 0; i < before.length; i++) sum += Math.abs(g.data[i]! - before[i]!);
    assert.ok(m3 > 0);
    assert.ok(Math.abs(m3 - sum * 16) < 1e-3);
  });

  it('brushBox contains the box applyCourseHeightBrush returns, for each brush mode', () => {
    const pre = createCourseHeightField();
    applyCourseHeightBrush(pre, { x: 200, y: 200, radiusTiles: 10, mode: 'raise', strength: 1 });
    for (const mode of ['raise', 'lower', 'smooth', 'flatten'] as const) {
      const dab: CourseHeightBrushDab = { x: 204, y: 200, radiusTiles: 8, mode, strength: 0.5 };
      const r = applyCourseHeightBrush(copyField(pre), dab);
      const b = brushBox(dab);
      assert.ok(r, `${mode} changes the pre-raised field`);
      assert.ok(b[0] <= r![0] && b[1] <= r![1] && b[2] >= r![2] && b[3] >= r![3], `${mode}: brushBox ${b} contains ${r}`);
    }
  });

  it('the undo journal: a recorded edit undoes to zero and redoes to the edited heights; an edit that changes nothing is no step', () => {
    const f = createCourseHeightField(), j = new CourseHeightJournal();
    const dab: CourseHeightBrushDab = { x: 300, y: 300, radiusTiles: 8, mode: 'raise', strength: 0.5 };
    j.begin();
    assert.equal(j.recording, true);
    j.touch(f, brushBox(dab));
    applyCourseHeightBrush(f, dab);
    const step = j.end(f);
    assert.ok(step && step.keys.length >= 1);
    const post = copyField(f);
    j.apply(f, step!, 'before');
    assert.ok(allZero(f));
    j.apply(f, step!, 'after');
    assert.ok(f.data.every((v, i) => v === post.data[i]));
    j.begin();
    j.touch(f, brushBox(dab));
    assert.equal(j.end(f), null);
  });

  it('a piece with a raised tee lays height in the field, one undo step, and redo puts it back', () => {
    const f = createCourseHeightField(), boxes: CourseTileBox[] = [];
    const tool = new PaintTool(host({ courseHeight: () => f, heightChanged: b => { boxes.push(b); } }));
    tool.enterCourse();
    tool.setPiece('tee-raised');
    tool.pointerMove({ x: 300, y: 300 }, 0, 0);
    tool.pointerDown({ x: 300, y: 300 }, 0, 0);
    assert.ok(f.data.some(v => v !== 0));
    assert.ok(boxes.length >= 1);
    tool.undo();
    assert.ok(allZero(f));
    tool.redo();
    assert.ok(f.data.some(v => v !== 0));
  });

  it('golf mode: a raised tee costs its earthworks on top of the piece price; a piece with no height ops costs the same', () => {
    const f = createCourseHeightField();
    const golf = { courseHeight: () => f, golfMode: () => true, money: () => 1e9, spend() {} };
    const tool = new PaintTool(host(golf));
    tool.enterCourse();
    tool.setPiece('tee-raised');
    tool.pointerMove({ x: 300, y: 300 }, 0, 0);
    assert.ok(tool.piece!.cost > pieceCost(tool.piece!.areas, tool.plantKind));
    tool.setPiece('fairway-corridor');
    tool.pointerMove({ x: 300, y: 300 }, 0, 0);
    assert.equal(tool.piece!.cost, pieceCost(tool.piece!.areas, tool.plantKind));
  });

  it('the golf save keeps the height chunks, and loadCourseHeight(saveCourseHeight(f)) restores the field to centimetres', () => {
    const f = createCourseHeightField();
    applyCourseHeightBrush(f, { x: 100, y: 100, radiusTiles: 6, mode: 'raise', strength: 1 });
    const g = normalizeGolfSave({ town: { x: 0, y: 0 }, course: [0, 0, 10, 10], clubhouse: { x: 1, y: 1 }, height: saveCourseHeight(f) });
    assert.deepEqual(g?.height, saveCourseHeight(f));
    const back = loadCourseHeight(saveCourseHeight(f));
    assert.ok(back.data.every((v, i) => Math.abs(v - f.data[i]!) <= 0.005 + 1e-6));
  });
});
