/** Tests for T127 (ext/course-walls): raised tees and greens rise on sloped banks, not hard walls; a tee from ROCK_FROM up (the default, as
 * high as a bunker is deep) has rocky sides, steeper the higher it is; every tee box gets stairs on its side facing the nearest cart path or
 * drive (else its fairway, else the camera), lined up with the 1 m grid; and two chunks give the same banks and stairs at their border
 * (pure, Node). Tile units (2 m); heights in metres; screen down is the tile direction (1, 1). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOB_STYLE, chunkOutlines } from '../src/game/ext/course-blobs/index.js';
import { CELL_T, SURF, fillPolygon, makeGrid, type Grid } from '../src/game/ext/course-grid/index.js';
import { coursePatch, type CourseLooks } from '../src/game/ext/course-grid/patch.js';
import { PaintTool, type PaintHost } from '../src/game/paint-tool.js';
import { heightLabel } from '../src/ui/course/CourseEdges.js';
import {
  BANK_RATIO, FaceForm, HEIGHT_RANGE, ROCK_FROM, STAIR_MIN_H, SURF_HEIGHT, WALL_DROP, WallMat, bankWidth, chunkWalls, coversOf, faceForm, faceVis,
  layerCode, slopeLight, stairSteps, surfHeights, teeStairs, type Stair, type WallRun,
} from '../src/game/ext/course-walls/index.js';

const { rough: ROUGH, fairway: FAIRWAY, tee: TEE, bunker: BUNKER, green: GREEN, water: WATER } = SURF;
const heightsWith = (tee: number) => surfHeights([undefined, undefined, undefined, undefined, undefined, tee]);

/** a 256 x 256 cell grid (128 tiles a side, chunks 0..1 each way) with rough over the middle */
function base(): Grid {
  const g = makeGrid(0, 0, 256, 256);
  fillPolygon(g, [{ x: 8, y: 8 }, { x: 120, y: 8 }, { x: 120, y: 120 }, { x: 8, y: 120 }], ROUGH, 1, 0);
  return g;
}
const rect = (g: Grid, s: number, x0: number, y0: number, x1: number, y1: number) => fillPolygon(g, [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], s, 1, 0);
/** the walls of chunk (cx, cy) as the chunk patches make them, with the surfaces at `heights` */
function walls(g: Grid, heights: readonly number[] = SURF_HEIGHT, cx = 0, cy = 0, size = 64): WallRun[] {
  const outs = chunkOutlines(g, cx, cy, size, BLOB_STYLE, true);
  return chunkWalls(g, outs.flatMap(o => [{ code: layerCode(o.surf, false), edges: o.edges }, ...(o.collar ? [{ code: layerCode(o.surf, true), edges: o.collar.edges }] : [])]), coversOf(outs), BLOB_STYLE, heights).walls;
}
const pts = (w: WallRun) => Array.from({ length: w.p.length / 3 }, (_, i) => ({ x: w.p[3 * i]!, y: w.p[3 * i + 1]!, dh: w.p[3 * i + 2]! }));
/** the widest bank a list of tee runs has (tiles on the ground) */
const widest = (ws: readonly WallRun[]) => Math.max(0, ...ws.flatMap(w => pts(w).map(p => bankWidth(w.r, p.dh))));
const teeRuns = (ws: readonly WallRun[]) => ws.filter(w => w.hs === TEE && w.m === WallMat.Turf);

test('1. the default tee stands as high as a bunker is deep; the Height slider sets a tee or a green within its range', () => {
  assert.equal(SURF_HEIGHT[TEE], -SURF_HEIGHT[BUNKER]!, 'tee 0.6 m = bunker 0.6 m deep');
  assert.ok(SURF_HEIGHT[TEE]! >= ROCK_FROM, 'the default tee has rocky sides');
  assert.equal(surfHeights(), SURF_HEIGHT);
  assert.equal(heightsWith(1.2)[TEE], 1.2);
  assert.equal(heightsWith(9)[TEE], HEIGHT_RANGE[TEE]![1], 'clamped to the slider');
  assert.equal(surfHeights([undefined, 5, undefined, -3])[ROUGH], 0, 'a fixed surface keeps its height');
  assert.equal(surfHeights([undefined, 5, undefined, -3])[WATER], SURF_HEIGHT[WATER]);
});

test('2. the bank width scales with the height (a low tee and a green on grass banks)', () => {
  // the form's run: a grass bank keeps 1 : BANK_RATIO, so the band round the platform is the height times the run
  for (const h of [0.2, 0.3, 0.45]) {
    const f = faceForm(TEE, WallMat.Turf, heightsWith(h));
    assert.equal(f.f, FaceForm.Bank, `a ${h} m tee is a grass bank`);
    assert.ok(Math.abs(bankWidth(f.r, h) - (h * BANK_RATIO) / 2) < 1e-9, `${h} m tall: ${(h * BANK_RATIO).toFixed(2)} m wide`);
  }
  // as the chunk walls give them: a tee in the rough at 0.3 m and at 0.45 m, the bank 1.5 times as wide
  const g = base(); rect(g, TEE, 26, 29, 38, 35);
  const lo = teeRuns(walls(g, heightsWith(0.3))), hi = teeRuns(walls(g, heightsWith(0.45)));
  assert.ok(lo.length > 0 && hi.length > 0, 'the tee has bank runs');
  for (const w of [...lo, ...hi]) assert.equal(w.f, FaceForm.Bank);
  const a = widest(lo), b = widest(hi);
  assert.ok(Math.abs(b / a - 1.5) < 0.02, `the bank widens with the height (${a.toFixed(3)} -> ${b.toFixed(3)} tiles)`);
  // a green: a gentle bank, never a wall
  const gg = base(); rect(gg, GREEN, 26, 26, 38, 36);
  const gw = walls(gg).filter(w => w.hs === GREEN && w.m === WallMat.Turf);
  assert.ok(gw.length > 0 && gw.every(w => w.f === FaceForm.Bank), 'a green on a grass bank');
  assert.ok(faceForm(GREEN, WallMat.Turf).r > faceForm(TEE, WallMat.Turf, heightsWith(0.3)).r, 'gentler than a tee\'s bank');
  // its foot reaches farther out than its drop reaches down the screen, so a bank shows past side-on (a wall: only toward the camera)
  assert.ok(faceVis(faceForm(TEE, WallMat.Turf, heightsWith(0.3)).r) > 0.5 && faceVis(0) === 0);
});

test('3. past the threshold a tee becomes a rock face, steeper the higher it stands; cut faces and the fairway stay walls', () => {
  assert.equal(faceForm(TEE, WallMat.Turf, heightsWith(ROCK_FROM - 0.01)).f, FaceForm.Bank, 'just under: a grass bank');
  assert.equal(faceForm(TEE, WallMat.Turf, heightsWith(ROCK_FROM)).f, FaceForm.Rock, 'from the threshold: rock');
  let last = Infinity;
  for (const h of [0.5, 0.6, 0.9, 1.2, 1.6]) {
    const f = faceForm(TEE, WallMat.Turf, heightsWith(h));
    assert.equal(f.f, FaceForm.Rock);
    assert.ok(f.r < last && f.r > 0, `steeper with height (${h} m: ${(2 * f.r).toFixed(2)} m a metre)`);
    last = f.r;
  }
  assert.ok(faceForm(TEE, WallMat.Turf, heightsWith(1.6)).r < faceForm(TEE, WallMat.Turf, heightsWith(0.3)).r / 2, 'a tall face is far steeper than a bank');
  assert.equal(faceForm(TEE, WallMat.Sand).f, FaceForm.Wall, 'a tee dropping into a bunker: the bunker\'s cut face');
  assert.equal(faceForm(GREEN, WallMat.Water).f, FaceForm.Wall, 'a green into a pond: the wet bank');
  assert.equal(faceForm(FAIRWAY, WallMat.Turf).f, FaceForm.Wall, 'the fairway\'s few centimetres');
  // as the chunk walls give them: the default tee's runs are rock
  const g = base(); rect(g, TEE, 26, 29, 38, 35);
  const ws = teeRuns(walls(g));
  assert.ok(ws.length > 0 && ws.every(w => w.f === FaceForm.Rock), 'the default tee is rock all round its visible sides');
  for (const w of ws) for (const p of pts(w).slice(1, -1)) assert.ok(Math.abs(p.dh - SURF_HEIGHT[TEE]!) < 1e-6, 'as tall as the tee above the rough');
  // the slope is lit by its normal against the sun at the upper right: turned to it lighter than flat, turned away darker
  assert.ok(slopeLight(-0.17, -0.99, 2.5) > 1.1 && slopeLight(0.17, 0.99, 2.5) < 0.8, 'lit toward the upper right, shaded at the lower left');
  assert.ok(Math.abs(slopeLight(0, 1, 1e6) - 1) < 0.01, 'a slope of nothing is flat ground');
});

test('4. stairs on the side facing the nearest cart path or drive, on the 1 m grid', () => {
  const g = base(); rect(g, TEE, 30, 30, 37, 33.5); // 14 x 7 cells
  const onGrid = (st: Stair) => {
    const a = st.ny !== 0 ? st.x : st.y, o = st.ny !== 0 ? g.x0 : g.y0;
    for (const e of [a - st.half, a + st.half]) assert.ok(Math.abs((e - o) / CELL_T - Math.round((e - o) / CELL_T)) < 1e-9, `the stairs end on a cell line (${e})`);
  };
  // a cart path along the tee's +y side, past its right half: stairs on that side, toward the path's nearest point
  {
    const [st] = teeStairs(g, [0, 0, 64, 64], [20, 38, 60, 38]);
    assert.ok(st, 'stairs'); assert.deepEqual([st!.nx, st!.ny], [0, 1], 'on the side facing +y');
    assert.ok(Math.abs(st!.y - 33.5) < 1e-9, 'on the side\'s outer cell line');
    assert.ok(st!.x - st!.half >= 30 && st!.x + st!.half <= 37, 'within the side'); onGrid(st!);
    assert.equal(st!.half, 0.5, 'two cells wide');
  }
  {
    const [st] = teeStairs(g, [0, 0, 64, 64], [44, 20, 44, 50]); // a drive along the +x side
    assert.deepEqual([st!.nx, st!.ny], [1, 0], 'facing the drive at +x'); assert.ok(Math.abs(st!.x - 37) < 1e-9); onGrid(st!);
  }
  {
    // the path nearer the tee's right end on the +y side: the stairs move right along that side
    const near = teeStairs(g, [0, 0, 64, 64], [36, 36, 50, 36])[0]!, far = teeStairs(g, [0, 0, 64, 64], [10, 36, 31, 36])[0]!;
    assert.ok(near.x > far.x, `toward the path (${far.x} -> ${near.x})`);
  }
  // no path in reach: the fairway (here at +x); no fairway either: the middle of the longer camera-facing side
  {
    const h = base(); rect(h, TEE, 30, 30, 37, 33.5); rect(h, FAIRWAY, 45, 20, 60, 45);
    const [st] = teeStairs(h, [0, 0, 64, 64], [200, 200, 210, 200]);
    assert.deepEqual([st!.nx, st!.ny], [1, 0], 'facing the fairway');
    const [c] = teeStairs(g, [0, 0, 64, 64], null);
    assert.deepEqual([c!.nx, c!.ny], [0, 1], 'the longer camera-facing side'); assert.ok(Math.abs(c!.x - 33.5) <= 0.5, `in its middle (${c!.x})`);
  }
  // never onto a bunker: a bunker along the +y side sends the stairs to the +x side
  {
    const h = base(); rect(h, TEE, 30, 30, 37, 33.5); rect(h, BUNKER, 29, 33.5, 38, 36);
    const [st] = teeStairs(h, [0, 0, 64, 64], [20, 38, 60, 38]);
    assert.deepEqual([st!.nx, st!.ny], [1, 0], 'not down into the bunker');
  }
  // a low tee is a step up: none; the steps' count follows the drop
  assert.equal(teeStairs(g, [0, 0, 64, 64], null, heightsWith(STAIR_MIN_H - 0.05)).length, 0);
  assert.equal(stairSteps(0.6), 3); assert.ok(stairSteps(1.4) > stairSteps(0.6));
});

test('5. chunk borders: a tee across x = 64 gives the same banks and stairs from both chunks', () => {
  const g = base(); rect(g, TEE, 58, 40, 70, 44);
  const L = teeRuns(walls(g, SURF_HEIGHT, 0, 0)), R = teeRuns(walls(g, SURF_HEIGHT, 1, 0));
  assert.ok(L.length > 0 && R.length > 0, 'both chunks have the tee\'s faces');
  let meets = 0;
  for (const w of L) for (const e of [pts(w)[0]!, pts(w)[pts(w).length - 1]!]) {
    if (Math.abs(e.x - 64) > 1e-9) continue;
    const o = R.flatMap(v => [pts(v)[0]!, pts(v)[pts(v).length - 1]!].map(p => ({ p, v }))).find(q => q.p.x === e.x && q.p.y === e.y);
    assert.ok(o, `the border end (${e.x}, ${e.y.toFixed(3)}) meets the other chunk's`);
    assert.ok(Math.abs(o!.p.dh - e.dh) < 1e-9 && o!.v.f === w.f && o!.v.r === w.r, 'with the same drop, form and run: the same foot');
    // the foot of a bank at a cut: out along the segment's normal (both chunks' end segments lie on one uncut segment) and down by the drop
    const foot = (v: WallRun, end: boolean) => { const q = pts(v), a = end ? q[q.length - 2]! : q[0]!, b = end ? q[q.length - 1]! : q[1]!, l = Math.hypot(b.x - a.x, b.y - a.y), nx = (b.y - a.y) / l, ny = -(b.x - a.x) / l, d = end ? b.dh : a.dh; return [nx * v.r * d + d * WALL_DROP, ny * v.r * d + d * WALL_DROP]; };
    const isLast = (v: WallRun) => { const q = pts(v), l = q[q.length - 1]!; return l.x === e.x && l.y === e.y; };
    const fa = foot(w, isLast(w)), fb = foot(o!.v, isLast(o!.v));
    assert.ok(Math.hypot(fa[0]! - fb[0]!, fa[1]! - fb[1]!) < 0.02, `the feet meet (${fa.map(v => v.toFixed(3))} vs ${fb.map(v => v.toFixed(3))})`);
    meets++;
  }
  assert.ok(meets >= 1, `the faces cross the border (${meets})`);
  const box = (cx: number) => [cx * 64 - 4, -4, cx * 64 + 68, 68];
  assert.deepEqual(teeStairs(g, box(0), [50, 50, 80, 50]), teeStairs(g, box(1), [50, 50, 80, 50]), 'the same stairs from both chunks');
});

test('6. the chunk patch carries the forms, runs and stairs; the Height slider reaches the walls', () => {
  const g = base(); rect(g, TEE, 26, 29, 38, 35);
  const LOOKS: CourseLooks = { surf: [undefined, ...Array.from({ length: 8 }, () => ({ tex: 'golfRough', sc: 1, a: 0 }))], collar: { 'first-cut': { tex: 'golfFirstCut', sc: 1, a: 0 }, fringe: { tex: 'golfFringe', sc: 1, a: 0 }, lip: { tex: 'golfRough', sc: 1, a: 0 }, bank: { tex: 'golfRough', sc: 1, a: 0 } } };
  const c = coursePatch(g, 0, 0, LOOKS, 0, undefined, [20, 40, 50, 40])!.course!;
  const tw = c.walls!.filter(w => w.hs === TEE && w.m === WallMat.Turf);
  assert.ok(tw.length > 0 && tw.every(w => w.f === FaceForm.Rock && (w.r ?? 0) > 0), 'rock runs with their run');
  assert.equal(c.st?.length, 5, 'one tee, one flight of stairs'); assert.deepEqual([c.st![2], c.st![3]], [0, 1], 'facing the path at +y');
  const low = coursePatch(g, 0, 0, { ...LOOKS, height: heightsWith(0.3) }, 0)!.course!;
  assert.ok(low.walls!.filter(w => w.hs === TEE && w.m === WallMat.Turf).every(w => w.f === FaceForm.Bank), 'set low: a grass bank');
  const high = coursePatch(g, 0, 0, { ...LOOKS, height: heightsWith(1.4) }, 0)!.course!;
  const hw = high.walls!.filter(w => w.hs === TEE && w.m === WallMat.Turf);
  assert.ok(hw.every(w => w.f === FaceForm.Rock && w.r! < tw[0]!.r!), 'set high: a steeper rock face');
  assert.ok(hw.some(w => Array.from(w.p).some((v, i) => i % 3 === 2 && Math.abs(v - 1.4) < 1e-6)), 'as tall as the slider says');
});

test('7. the Height slider in the Paint tool: per raised surface, clamped, remembered with the brush look, the course drawn again', () => {
  const g = makeGrid(0, 0, 200, 200), st = { looks: 0 };
  const host: PaintHost = {
    setLotGround() {}, emit() {}, save() {}, toast() {}, affine: o => { o[0] = 0; o[1] = 0; o[2] = 32; o[3] = 0; o[4] = 0; o[5] = 32; },
    placeProps: () => 0, golfMode: () => true, currentMonth: () => 0, money: () => 1e7, spend() {},
    grid: () => g, gridChanged() {}, changed() {}, ownedAt: () => true, courseLook: () => { st.looks++; },
  } as PaintHost;
  const tool = new PaintTool(host);
  tool.enterCourse();
  assert.equal(tool.surfaceHeight('tee'), SURF_HEIGHT[TEE], 'the tee starts at the default 0.6 m');
  assert.equal(tool.surfaceHeight('green'), SURF_HEIGHT[GREEN]);
  assert.equal(tool.surfaceHeight('bunker'), null, 'the bunkers keep their depth'); assert.equal(tool.surfaceHeight('fairway'), null);
  tool.setSurfaceHeight(1.2, 'tee');
  assert.equal(tool.surfaceHeight('tee'), 1.2); assert.equal(st.looks, 1, 'the course is drawn again');
  tool.setSurfaceHeight(99, 'tee'); assert.equal(tool.surfaceHeight('tee'), HEIGHT_RANGE[TEE]![1], 'clamped');
  const h = tool.surfaceHeights(); assert.equal(h[TEE], HEIGHT_RANGE[TEE]![1]); assert.equal(h[GREEN], undefined, 'untouched: the default');
  assert.match(heightLabel(0.6, true), /0\.60 m · rock/); assert.match(heightLabel(0.3, true), /bank/); assert.equal(heightLabel(0.25, false), '0.25 m');
});
