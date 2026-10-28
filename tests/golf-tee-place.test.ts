// T268 (#809; the owner, 2026-10-29: "should be able to place the diffrent tees white/red/blue/yellow yourself"): each tee set placed, moved and
// removed by hand (golf/teeplace.ts and the Paint tool's teeStep): the box facing the line of play within the tee's limits, its refusals, its
// price (the turf and the level pad), one undo step with the markers, the old ground put back on a move or a removal (a recorded box's own cells
// and heights; an older box's to the grass round it), the records' save, and the yardages, scorecard and golfers following the placed boxes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SURF, cellAt, makeGrid, paintDisc } from '../src/game/ext/course-grid';
import { CH_SIZE, CH_STEP, createCourseHeightField, sampleCourseHeight, type CourseHeightField } from '../src/game/ext/course-height';
import { aimsFromPlans, decodePlans } from '../src/game/ext/hole-wizard';
import { PaintTool, type PaintHost } from '../src/game/paint-tool';
import type { AimPoint, Pin, TeeBoxRec, TeeKind, TeeMark } from '../src/game/golf/types';
import {
  TEE_SCALE_MAX, TEE_SCALE_MIN, boxAngle, boxOutline, clampTeeScale, handOver, layDown, normalizeTeeBoxes, oldBox, packPad, packUnder, planTee,
  snapTurn, swapTeeBoxes, takeUp, teeAim, teeBoxM, teeKey, unpackPad, unpackUnder, levelPad, type TeeCourse, type TeeRoad,
} from '../src/game/golf/teeplace';
import { teeLengths } from '../src/game/golf/holecard';
import { deriveHoles } from '../src/game/golf/holes';
import { buildCourseStatsPanel } from '../src/game/golf/coursestats';
import { holeFrom, makeCourseView } from '../src/game/golf/play/courseview';
import { normalizeGolfSave, type GolfSave } from '../src/game/golf/mode';
import { unitBuildCost } from '../src/game/golf/costs';
import type { LookBook } from '../src/game/golf/looks';

const PX = 16;
/** a golf game for the Paint tool with the engine's markers and box records (markersKey carries them, as the engine's does), a height field
 *  sloping 0.5% east (-1.5 m at x 0 to 1.5 m at x 300), your land west of x 300, and a street running north-south at x 120 */
function golf() {
  const g = makeGrid(0, 0, 1000, 1400), f: CourseHeightField = createCourseHeightField();
  for (let j = 0; j < 400; j++) for (let i = 0; i < 150; i++) f.data[j * CH_SIZE + i] = Math.fround(0.02 * i - 1.5); // 0.5% east (2 cm a 4 m sample)
  const st = { money: 5_000_000, plans: [] as unknown[], aims: [] as AimPoint[], toasts: [] as string[], pins: [] as Pin[], tees: [] as TeeMark[], boxes: {} as Record<string, TeeBoxRec>, heights: 0, looks: { h1: { green: { tex: 'golfGreen' } } } as unknown as LookBook };
  const host: PaintHost = {
    setLotGround() {}, emit() {}, save() {}, toast: t => { st.toasts.push(t); }, affine: o => { o[0] = 0; o[1] = 0; o[2] = PX; o[3] = 0; o[4] = 0; o[5] = PX; },
    placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [],
    golfMode: () => true, currentMonth: () => 2, money: () => st.money, spend: n => { st.money -= n; },
    grid: () => g, gridChanged() {}, ownedAt: x => x < 300, plans: () => st.plans, courseHeight: () => f, heightChanged: () => { st.heights++; },
    setPlans: p => { const before = decodePlans(st.plans); st.plans = p; st.aims = aimsFromPlans(st.aims, before, decodePlans(p)); },
    lookBook: () => st.looks,
    markersKey: () => JSON.stringify([st.pins, st.tees, st.boxes]), setMarkers: k => { [st.pins, st.tees, st.boxes] = JSON.parse(k); },
    markersOf: n => ({ pin: st.pins.find(p => p.hole === n) ?? null, tees: st.tees.filter(t => t.hole === n) }),
  };
  const tool = new PaintTool(host); tool.enterCourse();
  const down = (x: number, y: number) => { tool.pointerDown({ x, y }, x * PX, y * PX); tool.pointerUp(0.5); };
  const street: TeeRoad = { ax: 120, ay: 0, bx: 120, by: 60, hw: 2.6, name: 'street' };
  /** the course as the engine hands it to golf/teeplace.ts */
  const course = (): TeeCourse => ({ grid: g, field: f, pins: st.pins, tees: st.tees, aims: st.aims, boxes: st.boxes, own: x => x < 300, roadsNear: () => [street], golf: true, unit: unitBuildCost('tee', 'seed') });
  /** places (or moves) hole n's set as the engine does: one teeStep with the old box taken up, the box laid, the record handed over, the marker */
  const place = (n: number, kind: TeeKind, x: number, y: number, s = 1, turn = 0, moving = false) => {
    const c = course(), old = moving ? oldBox(c, n, kind) : null, p = planTee(c, n, kind, x, y, boxAngle({ x, y }, teeAim(n, st.pins, st.aims), turn), s, old, true);
    if (p.why) return { p, ok: false };
    tool.teeStep(`place the ${kind} tee`, e => {
      const r = layDown(c, n, p, e); handOver(st.boxes, n, kind, p.old, r.rec);
      st.tees = [...st.tees.filter(t => !(t.hole === n && t.kind === kind)), { hole: n, kind, x: p.x, y: p.y, auto: true }];
    });
    return { p, ok: true };
  };
  const remove = (n: number, kind: TeeKind) => {
    const old = oldBox(course(), n, kind);
    tool.teeStep(`remove the ${kind} tee`, e => { takeUp(old, e); handOver(st.boxes, n, kind, old, null); st.tees = st.tees.filter(t => !(t.hole === n && t.kind === kind)); });
    return old;
  };
  return { st, g, f, tool, w: tool.wizard, down, course, place, remove, street };
}
/** hole 1 built with New hole (east along y 120: tee 40, green 230), its white tee and flag where the marker fit places them */
function oneHole() {
  const o = golf();
  assert.ok(o.tool.setPlan()); o.down(40, 120); o.down(230, 120); assert.ok(o.tool.buildPlan());
  const p = decodePlans(o.st.plans)[0]!;
  o.st.pins = [{ hole: 1, x: p.green.x, y: p.green.y, auto: true }];
  o.st.tees = [{ hole: 1, kind: 'middle', x: p.tee.x, y: p.tee.y, auto: true }];
  o.tool.setBrush(o.tool.brushKind);
  return { ...o, plan: p };
}
const gridKey = (g: ReturnType<typeof makeGrid>) => [Array.from(g.surf), Array.from(g.hole), Array.from(g.month)].map(a => a.join(',')).join('|');
const fieldKey = (f: CourseHeightField) => Array.from(f.data.subarray(0, 400 * CH_SIZE)).join(',');
const lengthOf = (st: { pins: Pin[]; tees: TeeMark[]; aims: AimPoint[] }, k: TeeKind) => teeLengths(1, st.pins, st.tees, st.aims).find(t => t.kind === k)?.m;

test('the tee\'s limits: the size steps 0.7 to 2 (10 x 6 to 28 x 16 m), R turns 15°, and the box faces the line of play (its first aim, else the pin)', () => {
  assert.equal(clampTeeScale(0.3), TEE_SCALE_MIN); assert.equal(clampTeeScale(5), TEE_SCALE_MAX); assert.equal(clampTeeScale(1.27), 1.3);
  assert.deepEqual(teeBoxM(TEE_SCALE_MIN), { len: 9.8, wid: 5.6 }); assert.deepEqual(teeBoxM(TEE_SCALE_MAX), { len: 28, wid: 16 });
  assert.equal(snapTurn(22), 15); assert.equal(snapTurn(-180 - 15), 165); assert.equal(snapTurn(190), -165);
  const pins: Pin[] = [{ hole: 1, x: 100, y: 0 }], aims: AimPoint[] = [{ hole: 1, order: 0, x: 0, y: 50 } as AimPoint];
  assert.deepEqual(teeAim(1, pins, []), { x: 100, y: 0 }); assert.deepEqual(teeAim(1, pins, aims), { x: 0, y: 50 }, 'the first bend first');
  assert.ok(Math.abs(boxAngle({ x: 0, y: 0 }, { x: 0, y: 50 }) - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(boxAngle({ x: 0, y: 0 }, { x: 100, y: 0 }, 15) - Math.PI / 12) < 1e-9, 'R turns it off the line');
  // a 14 x 8 m box along the heading, twice the length at size 2
  const span = (pts: number[]) => { let x0 = Infinity, x1 = -Infinity; for (let k = 0; k < pts.length; k += 2) { x0 = Math.min(x0, pts[k]!); x1 = Math.max(x1, pts[k]!); } return x1 - x0; };
  assert.ok(Math.abs(span(boxOutline(0, 0, 0, 1)) - 7) < 1e-9); assert.ok(Math.abs(span(boxOutline(0, 0, 0, 2)) - 14) < 1e-9);
});

test('Place: the box laid as the hole\'s tee turf, priced like a tee with its level pad, in one undo step with its marker and record; undo and redo', () => {
  const o = oneHole(), g0 = gridKey(o.g), f0 = fieldKey(o.f), m0 = o.st.money, key0 = JSON.stringify([o.st.pins, o.st.tees, o.st.boxes]);
  // the blue 25 m behind the white, on the hole's rough
  const far = sampleCourseHeight(o.f, o.plan.tee.x - 14 + 30, 120); // (New hole's Build shaped the ground: as it was before the tee)
  const { p, ok } = o.place(1, 'back', o.plan.tee.x - 14, 120);
  assert.ok(ok, p.why); assert.ok(p.cells.length > 90 && p.cells.length < 110, `about 98 cells of a 14 x 8 m box: ${p.cells.length}`);
  assert.equal(o.g.surf[cellAt(o.g, p.x, p.y)], SURF.tee); assert.equal(o.g.hole[cellAt(o.g, p.x, p.y)], 1);
  assert.ok(p.turfCost > 0 && p.earth > 0, 'the turf and the pad\'s earthworks on a 0.5% slope'); assert.equal(m0 - o.st.money, p.cost, 'paid what the ghost said');
  // the pad: level under the box (the bilinear height at its ends and sides is the same)
  const at = (dx: number, dy: number) => sampleCourseHeight(o.f, p.x + dx, p.y + dy), h = at(0, 0);
  for (const [dx, dy] of [[-3, 0], [3, 0], [0, -1.8], [0, 1.8], [-3, 1.5]] as const) assert.ok(Math.abs(at(dx, dy) - h) < 1e-4, `level at ${dx},${dy}: ${at(dx, dy)} vs ${h}`);
  assert.equal(sampleCourseHeight(o.f, p.x + 30, p.y), far, 'the ground well past it is as it was');
  // its record: the cells it changed, as they were (rough of the hole, or the land)
  const rec = o.st.boxes[teeKey(1, 'back')]!; assert.ok(rec && rec.n === 1 && rec.s === 1 && rec.z);
  const under = unpackUnder(rec.u); assert.ok(under.length > 80 && under.every(c => c.s !== SURF.tee), `${under.length} cells under it`);
  assert.ok(Math.abs(lengthOf(o.st, 'back')! - lengthOf(o.st, 'middle')! - 28) <= 1, 'the blue plays 28 m longer than the white');
  // one undo step: the grass, the ground, the money, the marker and the record all go back
  o.tool.undo();
  assert.equal(gridKey(o.g), g0); assert.equal(fieldKey(o.f), f0); assert.equal(o.st.money, m0); assert.equal(JSON.stringify([o.st.pins, o.st.tees, o.st.boxes]), key0);
  o.tool.redo();
  assert.equal(o.g.surf[cellAt(o.g, p.x, p.y)], SURF.tee); assert.equal(o.st.money, m0 - p.cost); assert.ok(o.st.tees.some(t => t.kind === 'back') && o.st.boxes[teeKey(1, 'back')]);
});

test('refused, with the reason: on water, a road, another hole, the green, land you do not own, and nearer the pin than 60 m; Add tee leaves the refused cells out', () => {
  const o = oneHole(), c = o.course(), why = (x: number, y: number, strict = true) => planTee(o.course(), 1, 'senior', x, y, boxAngle({ x, y }, teeAim(1, o.st.pins, o.st.aims)), 1, null, strict);
  paintDisc(o.g, 90, 150, 4, SURF.water, 0, 0);
  paintDisc(o.g, 160, 160, 6, SURF.fairway, 2, 0);
  assert.equal(why(90, 150).why, 'Water is there');
  assert.equal(why(120, 40).why, 'A street is there');
  assert.equal(why(160, 160).why, 'Hole 2 is there');
  assert.equal(why(o.plan.green.x, o.plan.green.y).why, 'The green is there');
  assert.equal(why(298, 120).why, 'Not your land');
  assert.match(why(o.plan.green.x - 20, 120).why, /^Too near the green/);
  assert.equal(why(90, 120).why, '', 'on the hole\'s fairway it goes');
  void c;
  // Add tee (not strict): half on the pond, the dry half is laid
  const half = why(93, 152, false); assert.equal(half.why, ''); assert.ok(half.out > 0 && half.cells.length > 0 && half.cells.every(i => o.g.surf[i] !== SURF.water));
  // a refused spot changes nothing
  const g0 = gridKey(o.g), m0 = o.st.money; assert.equal(o.place(1, 'senior', 90, 150).ok, false); assert.equal(gridKey(o.g), g0); assert.equal(o.st.money, m0);
});

test('Move: the box goes where it is put, its old ground (cells and heights) back as it was, in one undo step; the yardage and the scorecard follow', () => {
  const o = oneHole(), g0 = gridKey(o.g), f0 = fieldKey(o.f);
  const a = o.place(1, 'back', o.plan.tee.x - 14, 120).p, afterPlace = gridKey(o.g), m1 = o.st.money;
  const before = lengthOf(o.st, 'back')!;
  // 30 m further back and across, bigger and turned a step
  const b = o.place(1, 'back', a.x - 15, 128, 1.3, 15, true);
  assert.ok(b.ok, b.p.why); assert.ok(b.p.old?.rec && b.p.old.back && b.p.old.back.n > 80 && b.p.old.hb, 'its record\'s cells and heights go back');
  // the old box's cells are as they were before it was laid (the new box is clear of it)
  const g = o.g, oldI = cellAt(g, a.x, a.y), base = g0.split('|').map(s => s.split(','));
  assert.equal(String(g.surf[oldI]), base[0]![oldI]); assert.equal(String(g.hole[oldI]), base[1]![oldI]); assert.equal(String(g.month[oldI]), base[2]![oldI]);
  assert.equal(g.surf[cellAt(g, b.p.x, b.p.y)], SURF.tee);
  // the old pad's ground is back (well clear of the new pad)
  const k = Math.floor(a.y / CH_STEP) * CH_SIZE + Math.floor(a.x / CH_STEP), base0 = f0.split(',');
  assert.equal(o.f.data[k], Number(base0[k]), 'the old pad\'s heights back');
  assert.equal(o.st.money, m1 - b.p.cost, 'the new box is paid for, the old ground goes back free');
  const after = lengthOf(o.st, 'back')!; assert.ok(after > before + 25, `the blue's yardage follows: ${before} -> ${after} m`);
  // the scorecard and the course rating read the moved marker
  const card = buildCourseStatsPanel({ areas: [], pins: o.st.pins, tees: o.st.tees, aims: o.st.aims, clubhouse: { x: 0, y: 0 } });
  assert.deepEqual(card.rows[0]!.sets.map(s => s.lengthM), [after, lengthOf(o.st, 'middle')], 'the scorecard\'s columns');
  // the golfers from the blue tee off the moved box
  const h = deriveHoles([], o.st.tees, o.st.pins, o.st.aims), view = makeCourseView(h, () => 'fairway');
  const blue = holeFrom(view.holes[0]!, 'back').tee; assert.ok(Math.hypot(blue.x - b.p.x, blue.y - b.p.y) < 1e-6, 'the blue golfers tee off where the box went');
  // one undo step takes the move back (the old box laid again, the new one gone)
  o.tool.undo(); assert.equal(gridKey(o.g), afterPlace); assert.equal(o.st.money, m1); assert.equal(lengthOf(o.st, 'back'), before);
});

test('Remove: the set and its box go, the ground as it was (never the hole\'s last set: the engine refuses it); an older box goes back to the grass round it; a box another set stands on stays', () => {
  const o = oneHole(), g0 = gridKey(o.g), f0 = fieldKey(o.f);
  o.place(1, 'back', o.plan.tee.x - 14, 120);
  const old = o.remove(1, 'back'); assert.ok(old?.rec);
  assert.equal(gridKey(o.g), g0, 'the cells as they were'); assert.equal(fieldKey(o.f), f0, 'the ground as it was'); assert.deepEqual(o.st.boxes, {});
  o.tool.undo(); assert.ok(o.st.tees.some(t => t.kind === 'back') && o.st.boxes[teeKey(1, 'back')], 'undo brings it back');
  // the white is New hole's own tee (no record): moved, its tee cells go back to the hole's grass round them
  const whiteAt = cellAt(o.g, o.plan.tee.x, o.plan.tee.y), w0 = oldBox(o.course(), 1, 'middle')!;
  assert.equal(w0.rec, false); assert.ok(w0.cells!.length > 200 && w0.back && w0.back.n === w0.cells!.length);
  assert.ok([SURF.rough, SURF.fairway, SURF.none].includes(w0.back!.s1[0] as 0), `the grass round it: ${w0.back!.s1[0]}`);
  assert.ok(o.place(1, 'middle', o.plan.tee.x + 20, 120, 1, 0, true).ok);
  assert.notEqual(o.g.surf[whiteAt], SURF.tee, 'the old white tee is grass again');
  // the yellow placed on the blue's box: the blue's box is shared, so moving the blue leaves it (the yellow takes its record)
  const blue = o.st.boxes[teeKey(1, 'back')]!;
  o.st.tees = [...o.st.tees, { hole: 1, kind: 'senior', x: blue.x + 1, y: blue.y }];
  const sh = oldBox(o.course(), 1, 'back')!; assert.deepEqual(sh.shared, ['senior']); assert.equal(sh.back, null);
  assert.ok(o.place(1, 'back', blue.x - 15, 120, 1, 0, true).ok);
  assert.equal(o.g.surf[cellAt(o.g, blue.x, blue.y)], SURF.tee, 'the shared box stays'); assert.deepEqual(o.st.boxes[teeKey(1, 'senior')], blue, 'the yellow has its record');
});

test('Edit Hole Layout open: a tee step is the course\'s last undo, before the plan\'s own drags', () => {
  const o = oneHole();
  assert.ok(o.tool.editHole(1)); const m0 = o.st.money;
  assert.ok(o.place(1, 'forward', o.plan.tee.x + 40, 120).ok); assert.ok(o.st.money < m0);
  o.tool.undoTop(); assert.equal(o.st.money, m0, 'Ctrl+Z takes the tee back first'); assert.ok(!o.st.tees.some(t => t.kind === 'forward'));
});

test('the records: packed and unpacked as they were; a save keeps the well-formed ones; a renumber moves them; an old save has none and keeps its tees', () => {
  const g = makeGrid(0, 0, 100, 100), d = paintDisc(g, 10, 10, 2, SURF.tee, 1, 7);
  const u = unpackUnder(packUnder(d)); assert.equal(u.length, d.n); assert.ok(u.every(c => c.s === SURF.none && c.h === 0 && c.m === 0));
  assert.ok(u.every(c => d.idx.includes(cellAt(g, c.x, c.y))), 'the cells found again by their tiles');
  const f = createCourseHeightField(); for (let i = 0; i < 40; i++) f.data[5 * CH_SIZE + i] = i * 0.05;
  const pad = levelPad(k => f.data[k]!, boxOutline(20, 11, 0, 1)), z = unpackPad(packPad(pad));
  assert.ok(pad.k.length > 4); assert.deepEqual(z.map(q => q.k), Array.from(pad.k)); assert.ok(z.every((q, i) => q.before === pad.before[i] && q.after === pad.after[i]));
  const rec: TeeBoxRec = { x: 1, y: 2, a: 0.5, s: 1.2, n: 3, u: 'AAAA' };
  assert.deepEqual(normalizeTeeBoxes({ '3:back': rec, '3:purple': rec, 'x:middle': rec, '4:senior': { ...rec, s: 9 }, '5:forward': { x: 1 } }), { '3:back': rec, '4:senior': { ...rec, s: TEE_SCALE_MAX } });
  assert.deepEqual(Object.keys(swapTeeBoxes({ '3:back': rec, '5:middle': rec, '7:forward': rec }, 3, 5)!).sort(), ['3:middle', '5:back', '7:forward']);
  const old = normalizeGolfSave({ v: 1, tier: 1, rep: 0, town: { x: 0, y: 0 }, course: [0, 0, 10, 10], parcel: [0, 0, 10, 10], dir: 0, tees: [{ hole: 1, kind: 'middle', x: 3, y: 4 }], pins: [], aims: [], clubhouse: { x: 0, y: 0 }, teeSets: 1 } as GolfSave)!;
  assert.equal(old.teeBoxes, undefined); assert.deepEqual(old.tees, [{ hole: 1, kind: 'middle', x: 3, y: 4 }]);
  const kept = normalizeGolfSave({ ...old, teeBoxes: { '1:middle': rec } })!; assert.deepEqual(kept.teeBoxes, { '1:middle': rec });
});
