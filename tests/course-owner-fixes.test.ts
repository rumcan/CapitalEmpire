/** The owner's course painting test (2026-10-25) and T121 readable grow-in: the New hole wizard starts again at hole 1 in a new game and
 * numbers from the holes on a load; a built hole's rough over the map grass is established at once; seeded fairway, green and tee draw
 * young grass from day one (a quarter grass, never bare soil) at every zoom tier; the Border slider sets the collar bands' width from a
 * hairline to several metres; the walls' Shadow is a hairline by default (pure, Node: the Paint tool with a stand-in host). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SURF, cellAt, laidMonth, makeGrid, paintDisc, type Grid } from '../src/game/ext/course-grid';
import { MONTH_BASE, growingHoles } from '../src/game/ext/course-grid/areas';
import { BLOB_STYLE, chunkOutlines, collarWeight } from '../src/game/ext/course-blobs';
import { BORDER_MAX_M, BORDER_MIN_M, coursePatch, courseStyles, courseEditReach, COURSE_EDIT_REACH, widestCollar, type CourseLooks } from '../src/game/ext/course-grid/patch';
import { growMask, seededStage } from '../src/game/ext/course-fx';
import { SEED_LOOKS, growDraws, seedShare } from '../src/game/ext/course-fx/seed';
import { DEFAULT_SHADOW, GREEN_FACE, SHADOW_HAIRLINE, WALL_SHADOW, defaultShadow, faceScale, shadowOwner, wallShade } from '../src/game/ext/course-walls';
import { aimsFromPlans, decodePlans } from '../src/game/ext/hole-wizard';
import { PaintTool, type PaintHost } from '../src/game/paint-tool';
import { monthIndexLabel } from '../src/game/golf/calendar';
import { BORDER_STEP_MAX, DEFAULT_STYLE, borderStep, borderW, clampStyle, fromTuples, toTuple } from '../src/game/paint';
import { BORDER_STEPS, paintBorderAt, paintBorderPos } from '../src/ui/course/CourseEdges';
import type { AimPoint } from '../src/game/golf/types';

const PX = 16;
/** a stand-in golf game for the Paint tool (as ext-hole-wizard's): the grid, money, plans and aims as the engine keeps them */
function game(month = 2) {
  const g = makeGrid(0, 0, 900, 600);
  const st = { money: 5_000_000, plans: [] as unknown[], aims: [] as AimPoint[], looks: 0, month };
  const host: PaintHost = {
    setLotGround() {}, emit() {}, save() {}, toast() {}, affine: o => { o[0] = 0; o[1] = 0; o[2] = PX; o[3] = 0; o[4] = 0; o[5] = PX; },
    placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [],
    golfMode: () => true, currentMonth: () => st.month, money: () => st.money, spend: n => { st.money -= n; },
    grid: () => g, gridChanged() {}, changed() {}, ownedAt: () => true, plans: () => st.plans,
    setPlans: p => { const before = decodePlans(st.plans); st.plans = p; st.aims = aimsFromPlans(st.aims, before, decodePlans(p)); },
    courseLook: () => { st.looks++; },
  };
  const tool = new PaintTool(host);
  tool.enterCourse();
  /** plans and builds a hole from the tee to the green (tiles) with the wizard, as two clicks and Build */
  const build = (tee: { x: number; y: number }, green: { x: number; y: number }) => {
    assert.ok(tool.setPlan());
    const w = tool.wizard, ts = (x: number, y: number) => ({ x: x * PX, y: y * PX });
    assert.equal(w.press(tee, tee.x * PX, tee.y * PX, ts), 'tee');
    w.move(green, green.x * PX, green.y * PX, ts);
    assert.equal(w.press(green, green.x * PX, green.y * PX, ts), 'green');
    assert.ok(tool.buildPlan(), 'built');
  };
  return { g, st, tool, build };
}

// ---------- 1. the wizard starts again on a new game and on a load ----------

test('1. a new game: the New hole wizard says hole 1 again, its plan, tee and undo steps from the last game are gone', () => {
  const { g, st, tool, build } = game();
  build({ x: 40, y: 75 }, { x: 140, y: 75 });
  assert.equal(tool.wizard.hole, 2, 'after hole 1 the wizard waits for hole 2');
  // the player opens New hole 2 and clicks a tee, then starts a new game from the gear menu (engine reset: paint.clear, then afterLoad)
  assert.ok(tool.setPlan());
  const ts = (x: number, y: number) => ({ x: x * PX, y: y * PX });
  tool.wizard.press({ x: 40, y: 200 }, 40 * PX, 200 * PX, ts);
  assert.equal(tool.wizard.step, 'green');
  assert.ok(tool.canUndo);
  st.plans = []; g.surf.fill(0); g.hole.fill(0); g.month.fill(0);
  tool.clear(); tool.newGame();
  assert.equal(tool.wizard.hole, 1, 'New hole 1');
  assert.equal(tool.wizard.step, 'tee');
  assert.equal(tool.wizard.plan, null); assert.equal(tool.wizard.tee, null); assert.equal(tool.wizard.base, null); assert.equal(tool.wizard.ripple, null);
  assert.equal(tool.brushHole, 1, 'the current hole is 1 again');
  assert.equal(tool.canUndo, false, 'the last game\'s undo steps are gone (they name its cells)');
  // building now tags the cells hole 1, the hole the panel watches
  build({ x: 40, y: 75 }, { x: 140, y: 75 });
  assert.equal(g.hole[cellAt(g, 140, 75)], 1);
  assert.deepEqual(decodePlans(st.plans).map(p => p.hole), [1]);
});

test('1b. a load: the wizard numbers from the loaded game\'s holes (the first free number)', () => {
  const { st, tool, build } = game();
  build({ x: 40, y: 75 }, { x: 140, y: 75 });
  build({ x: 40, y: 200 }, { x: 140, y: 200 });
  const saved = st.plans.slice();
  assert.ok(tool.setPlan());
  assert.equal(tool.wizard.hole, 3);
  // another game's state, then the save loads back (engine load: paint.load, then afterLoad)
  st.plans = [saved[1]!];
  tool.load([]); tool.newGame();
  assert.equal(tool.wizard.hole, 1, 'hole 1 is free in the loaded game');
  assert.equal(tool.canUndo, false);
  st.plans = saved;
  tool.load([]); tool.newGame();
  assert.equal(tool.wizard.hole, 3, 'holes 1 and 2 are built: the next is 3');
  assert.equal(tool.wizard.plan, null);
});

// ---------- 2. rough over the map grass is established ----------

test('2. Build: the rough laid over the map grass is established at once (no grow-in); fairway, green and tee are seeded', () => {
  const { g, tool, build } = game(2);
  build({ x: 40, y: 75 }, { x: 240, y: 75 });
  const seeded = 2 + MONTH_BASE, by = new Map<number, Set<number>>();
  for (let i = 0; i < g.surf.length; i++) { const s = g.surf[i]!; if (!s) continue; let m = by.get(s); if (!m) by.set(s, m = new Set()); m.add(g.month[i]!); }
  assert.deepEqual([...by.get(SURF.rough)!], [0], 'every rough cell is established');
  for (const s of [SURF.fairway, SURF.green, SURF.tee]) assert.deepEqual([...by.get(s)!], [seeded], `surface ${s} is seeded this month`);
  // the brush the same: rough over the map grass is established, over sand it is seeded, a fairway is seeded
  const d = paintDisc(g, 400, 200, 2, SURF.rough, 3, seeded);
  assert.ok(d.n > 0); for (let k = 0; k < d.n; k++) assert.equal(d.m1[k], 0);
  paintDisc(g, 420, 200, 1.5, SURF.bunker, 3, 0);
  const onSand = paintDisc(g, 420, 200, 1, SURF.rough, 3, seeded);
  assert.ok(onSand.n > 0); for (let k = 0; k < onSand.n; k++) assert.equal(onSand.m1[k], seeded, 'rough over sand is seeded');
  const fw = paintDisc(g, 400, 200, 1, SURF.fairway, 3, seeded);
  for (let k = 0; k < fw.n; k++) assert.equal(fw.m1[k], seeded);
  // laidMonth: fescue too; over another grass it keeps that grass's state
  assert.equal(laidMonth(SURF.fescue, SURF.none, 0, seeded), 0);
  assert.equal(laidMonth(SURF.rough, SURF.fairway, seeded - 1, seeded), seeded - 1);
  assert.equal(laidMonth(SURF.rough, SURF.water, 0, seeded), seeded);
  assert.equal(laidMonth(SURF.green, SURF.none, 0, seeded), seeded);
  assert.ok(tool.canUndo);
});

// ---------- 3. young grass from day one, at every tier ----------

/** a just built hole on a grid: the plan's cells, then the patch of the chunk over it */
function seededChunk() {
  const { g, build } = game(2);
  build({ x: 10, y: 30 }, { x: 55, y: 30 });
  return g;
}
const LOOKS: CourseLooks = {
  surf: [undefined, ...[1, 2, 3, 4, 5, 6, 7, 8].map(() => ({ tex: 'golfFairway', sc: 1, a: 0 }))],
  collar: { 'first-cut': { tex: 'golfFirstCut', sc: 1, a: 0 }, fringe: { tex: 'golfFringe', sc: 1, a: 0 }, lip: { tex: 'golfRough', sc: 1, a: 0 }, bank: { tex: 'golfRough', sc: 1, a: 0 } },
};

test('3. a seeded fairway, green and tee start at a quarter grass with thick young grass: never bare soil, the same draws for close and lite chunks', () => {
  assert.equal(seededStage(0), 1, 'a quarter grass from day one');
  assert.equal(seededStage(0.4), 2); assert.equal(seededStage(0.7), 3); assert.equal(seededStage(0.99), 3, 'full grass only when the grow-in is done');
  assert.equal(seededStage(1), 4);
  const g = seededChunk(), now = 2;
  const mask = growMask(g, 0, 0, 64, now + MONTH_BASE);
  assert.ok(!mask.includes(255), 'no cell shows bare soil (alpha 255)');
  assert.ok(mask.includes(191), 'the seeded cells show a quarter grass');
  const close = coursePatch(g, 0, 0, LOOKS, now)!, lite = coursePatch(g, 0, 0, LOOKS, now)!;
  const draws = growDraws(close.course!);
  assert.deepEqual(growDraws(lite.course!), draws, 'a district (lite) chunk draws exactly what a close chunk does');
  for (const s of [SURF.fairway, SURF.tee, SURF.green]) assert.ok(draws.some(d => d.s === s), `surface ${s} draws its young grass`);
  for (const d of draws) assert.equal(d.stage, 1, `surface ${d.s} at a quarter grass`);
  // the rough is established: none of its cells holds a grow-in alpha
  let rough = 0;
  for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) if (g.surf[j * g.w + i] === SURF.rough) { rough++; assert.equal(mask[j * 128 + i], 0, 'established rough'); }
  assert.ok(rough > 500, `${rough} rough cells`);
  // what shows of the soil: three quarters of the cells keep soil patches, of which the young grass covers most
  for (const s of [SURF.fairway, SURF.tee, SURF.green]) {
    const share = seedShare(SEED_LOOKS[s]!), soil = 0.75 * (1 - share);
    assert.ok(share >= 0.65, `surface ${s}: young grass covers ${share.toFixed(2)} of the soil`);
    assert.ok(soil <= 0.27, `surface ${s}: ${(soil * 100).toFixed(0)}% bare soil shows`);
  }
});

test('3b. T121: the holes still growing and when they are ready ("growing · ready Mar 1985")', () => {
  const g = seededChunk();
  // seeded in game month 2 (Nov 1984): the green takes 6 months, so the hole is ready in month 8 (May 1985)
  assert.deepEqual([...growingHoles(g, 2)], [[1, 8]]);
  assert.deepEqual([...growingHoles(g, 7)], [[1, 8]]);
  assert.deepEqual([...growingHoles(g, 8)], [], 'grown in');
  assert.equal(monthIndexLabel(0), 'Sep 1984'); assert.equal(monthIndexLabel(6), 'Mar 1985'); assert.equal(monthIndexLabel(8), 'May 1985'); assert.equal(monthIndexLabel(16), 'Jan 1986');
});

// ---------- 4. the Border slider ----------

/** a 10 x 10 cell green (cells 40..49) in the middle of a grid of map grass, and its fringe's outline */
function fringeBox(width: number): { x0: number; x1: number; y0: number; y1: number } {
  const g: Grid = makeGrid(0, 0, 128, 128);
  for (let j = 40; j < 50; j++) for (let i = 40; i < 50; i++) g.surf[j * g.w + i] = SURF.green;
  const border: number[] = []; border[SURF.green] = width;
  const o = chunkOutlines(g, 0, 0, 64, courseStyles(border)).find(q => q.surf === SURF.green)!;
  assert.ok(o.collar, `a fringe at ${width} m`);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const r of o.collar.fill) for (let k = 0; k < r.length; k += 2) { x0 = Math.min(x0, r[k]!); x1 = Math.max(x1, r[k]!); y0 = Math.min(y0, r[k + 1]!); y1 = Math.max(y1, r[k + 1]!); }
  return { x0, x1, y0, y1 };
}

test('4. the Border sets the collar band: a hairline at the slider\'s left end, several metres at its right, any width between', () => {
  // the green spans tiles 20..25; its fringe reaches out by the border's width (metres = cells = half tiles)
  const reach = (w: number) => { const b = fringeBox(w); return (b.x1 - b.x0 - 5) / 2 * 2; }; // metres past the green's sides
  const hair = reach(BORDER_MIN_M), huge = reach(BORDER_MAX_M), def = reach(1), half = reach(2.5);
  assert.ok(Math.abs(hair - BORDER_MIN_M) < 0.08, `hairline: ${hair.toFixed(3)} m`);
  assert.ok(Math.abs(def - 1) < 0.08, `the default fringe: ${def.toFixed(3)} m`);
  assert.ok(Math.abs(half - 2.5) < 0.12, `2.5 m: ${half.toFixed(3)} m`);
  assert.ok(Math.abs(huge - BORDER_MAX_M) < 0.25, `huge: ${huge.toFixed(3)} m`);
  // smooth: widths in between land in order
  let last = -1; for (const w of [0.1, 0.3, 0.6, 1, 1.4, 2, 3.7, 5, 8]) { const r = reach(w); assert.ok(r > last, `${w} m reaches ${r.toFixed(3)}`); last = r; }
  // the partial ring's weight: 0 and 1 at the ends, rising between
  assert.equal(collarWeight(0), 0); assert.equal(collarWeight(1), 1);
  assert.ok(collarWeight(0.25) > 0 && collarWeight(0.25) < collarWeight(0.75) && collarWeight(0.75) < 1);
  // the styles: only the collar width changes; the edit reach grows with the widest band
  const styles = courseStyles([undefined, undefined, undefined, 3, 0.5, 6, 2, undefined, 8]);
  assert.equal(styles[SURF.green]!.collar!.width, 8); assert.equal(styles[SURF.fairway]!.collar!.width, 0.5);
  assert.equal(styles[SURF.green]!.close, BLOB_STYLE[SURF.green]!.close);
  assert.equal(courseStyles([]), BLOB_STYLE);
  assert.equal(courseStyles([undefined, undefined, undefined, undefined, 99])[SURF.fairway]!.collar!.width, BORDER_MAX_M, 'clamped');
  assert.equal(COURSE_EDIT_REACH, courseEditReach(widestCollar(BLOB_STYLE)), 'the default reach as before');
  assert.ok(courseEditReach(widestCollar(styles)) >= COURSE_EDIT_REACH + 3);
});

test('4b. the Border slider in the Paint tool: per surface, remembered with the brush look, the course drawn again at once', () => {
  const { tool, st } = game();
  tool.setBrush('green');
  assert.equal(tool.courseBorder(), 1, 'the green\'s fringe is 1 m by default');
  assert.equal(tool.courseBorder('fairway'), 2);
  assert.equal(tool.courseBorder('rough'), null, 'the rough has no collar');
  tool.setCourseBorder(6);
  assert.equal(tool.courseBorder(), 6);
  assert.equal(st.looks, 1, 'the course is drawn again');
  tool.setCourseBorder(0, 'bunker');
  assert.equal(tool.courseBorder('bunker'), BORDER_MIN_M, 'never below a hairline');
  const b = tool.courseBorders();
  assert.equal(b[SURF.green], 6); assert.equal(b[SURF.bunker], BORDER_MIN_M); assert.equal(b[SURF.fairway], undefined, 'untouched: the default');
  // a style edit or a radius change keeps the border
  tool.setStyle({ angle: 30 }); tool.setBrushR(3);
  assert.equal(tool.courseBorder('green'), 6);
});

// ---------- 5. the Shadow ----------

test('5. the walls\' shadow is a hairline by default: a thin soft contact line, a faint short cast; strong is the old look', () => {
  assert.equal(DEFAULT_SHADOW, SHADOW_HAIRLINE);
  const h = wallShade();
  assert.deepEqual(h, wallShade(SHADOW_HAIRLINE));
  assert.ok(h.soft <= 0.04 && h.softPx <= 1, `contact stroke ${h.soft} tiles`);
  assert.ok(h.line <= 0.015, `contact line ${h.line} tiles`);
  assert.ok(h.cast <= 0.15 * WALL_SHADOW + 1e-9 && h.castA <= 0.15, `cast ${h.cast} tiles a metre at ${h.castA}`);
  const s = wallShade(1);
  assert.deepEqual([s.cast, s.castA, s.soft, s.softPx, s.softA, s.line, s.linePx, s.lineA], [WALL_SHADOW, 0.34, 0.12, 3, 0.45, 0.05, 1.5, 0.8], 'strong: the walls\' shadow as T099 drew it');
  const none = wallShade(0);
  assert.deepEqual([none.castA, none.softA, none.lineA], [0, 0, 0], '0: no shadow at all');
  const { tool, st } = game();
  tool.setBrush('fairway');
  assert.equal(tool.courseShadow(), SHADOW_HAIRLINE, 'a fairway starts at the hairline');
  assert.equal(tool.courseShadow('rough'), null, 'the rough has no walls of its own');
  tool.setCourseShadow(0.5);
  assert.equal(tool.courseShadow(), 0.5);
  assert.equal(tool.courseShadows()[SURF.fairway], 0.5); assert.equal(tool.courseShadows()[SURF.tee], undefined);
  assert.ok(st.looks <= 1);
  // the patch carries the Shadows by surface to the renderer, with the defaults filled in
  const g = seededChunk();
  const sh = coursePatch(g, 0, 0, { ...LOOKS, shadow: [undefined, undefined, undefined, undefined, 0.25] }, 2)!.course!.sh!;
  assert.equal(sh[SURF.fairway], 0.25); assert.equal(sh[SURF.green], 0); assert.equal(sh[SURF.tee], SHADOW_HAIRLINE);
  assert.equal(coursePatch(g, 0, 0, LOOKS, 2)!.course!.sh, undefined, 'absent: the renderer takes the defaults');
});

test('5b. no shadows under greens (the owner, 2026-10-25): a green\'s Shadow is none by default, its bank slim; a bunker\'s cut face takes the bunker\'s', () => {
  assert.equal(defaultShadow(SURF.green), 0);
  for (const s of [SURF.fairway, SURF.tee, SURF.bunker, SURF.water]) assert.equal(defaultShadow(s), SHADOW_HAIRLINE);
  const { tool } = game();
  assert.equal(tool.courseShadow('green'), 0, 'the green\'s Shadow slider starts at none');
  const w = wallShade(defaultShadow(SURF.green));
  assert.deepEqual([w.castA, w.softA, w.lineA], [0, 0, 0], 'no cast shadow and no contact shade under a green');
  // the walls of a green on the rough: their higher side is the green, drawn slim; a bunker beside it: its cut face is the bunker's
  const g: Grid = makeGrid(0, 0, 128, 128);
  for (let j = 40; j < 60; j++) for (let i = 40; i < 60; i++) g.surf[j * g.w + i] = SURF.rough;
  for (let j = 44; j < 54; j++) for (let i = 44; i < 54; i++) g.surf[j * g.w + i] = SURF.green;
  for (let j = 70; j < 76; j++) for (let i = 70; i < 76; i++) g.surf[j * g.w + i] = SURF.bunker;
  const c = coursePatch(g, 0, 0, LOOKS, 0)!.course!;
  const gw = c.walls!.filter(q => q.hs === SURF.green), bw = c.walls!.filter(q => q.m === 1);
  assert.ok(gw.length > 0, 'the green has walls'); assert.ok(bw.length > 0, 'the bunker has walls');
  for (const q of gw) { assert.equal(faceScale({ m: q.m, hs: q.hs! }), GREEN_FACE); assert.equal(shadowOwner({ m: q.m, hs: q.hs! }), SURF.green); }
  assert.ok(GREEN_FACE <= 0.5, 'a very slim face');
  for (const q of bw) { assert.equal(shadowOwner({ m: q.m, hs: q.hs ?? 0 }), SURF.bunker); assert.equal(faceScale({ m: q.m, hs: q.hs ?? 0 }), 1); }
});

// ---------- 6. the painted areas' Border is the same slider ----------

test('6. a painted area\'s Border is continuous: the old None, Small, Medium, Large are points on it, old saves draw as before', () => {
  assert.deepEqual([0, 1, 2, 3].map(borderW), [0, 0.25, 0.5, 1], 'the old steps keep their widths');
  assert.ok(Math.abs(borderW(0.4) - 0.1) < 1e-9, 'a fraction of step 1 is a hairline (0.2 m)');
  assert.equal(borderW(BORDER_STEP_MAX), 4, 'huge: 8 m');
  for (const b of [0, 0.3, 1, 1.7, 2, 2.5, 3, 4.2, 6]) assert.ok(Math.abs(borderStep(borderW(b)) - b) < 1e-9, `step ${b} round trips`);
  // the slider: position 0 is none, the old steps land in order, and it round-trips the step
  assert.equal(paintBorderPos(0), 0); assert.equal(paintBorderAt(0), 0);
  const pos = [1, 2, 3].map(paintBorderPos);
  assert.ok(pos[0]! > 0 && pos[0]! < pos[1]! && pos[1]! < pos[2]! && pos[2]! < BORDER_STEPS);
  for (const b of [1, 2, 3]) assert.ok(Math.abs(paintBorderAt(paintBorderPos(b)) - b) < 0.02, `step ${b} on the slider`);
  // clampStyle keeps a fractional step (no more rounding to the four buttons) and a save keeps it
  const st = clampStyle({ ...DEFAULT_STYLE, border: 2.37 });
  assert.equal(st.border, 2.37);
  const a = fromTuples([toTuple({ id: 1, pts: [0, 0, 10, 0, 10, 10, 0, 10], ...st })])[0]!;
  assert.equal(a.border, 2.37);
  assert.equal(fromTuples([toTuple({ id: 1, pts: [0, 0, 10, 0, 10, 10, 0, 10], ...clampStyle({ ...DEFAULT_STYLE, border: 3 }) })])[0]!.border, 3);
  assert.equal(PaintTool.patch(a).paint!.b, borderW(2.37), 'the ground draws its width');
});
