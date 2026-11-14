// #1298 (the owner's play-test, 2026-11-14: "I painted fescue over the practice and pittingarea and this is how it went ... some box around the practice greens are not letting it paint there
// and I can[not] bulldoze or remove the old sand pit and dirt green"; and "the range texture painter is specifically there so you can also paint on the driving range ... but when i paint
// there it doesnt show above the fairway grass"): the layer order of the range's ground against the course's painted cells, and the practice area's starter pieces going three ways (built
// over, painted over, bulldozed on their own). The pixels are checked by scripts/dev/practice-paint-shots.mjs; this is the pure part.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COURSE_RANK, paintOrder, paintRank, paintTier } from '../src/game/paint-order';
import type { CoursePatch, LotPatch } from '../src/game/ground-protocol';
import { practiceArea } from '../src/game/golf/practice';
import { PracticeTool, type PracticeHostCtx } from '../src/game/golf/practicetool';
import { PAINTED_SHARE, paintedOver, starterAt, starterName, starterSet } from '../src/game/golf/practicestarter';
import { defaultRangeBiz, rangeScene, withUpgrade, type RangeBizSave, type ScenePiece } from '../src/game/golf/rangebiz';
import { RangeHost, type RangeHostCtx } from '../src/game/golf/rangehost';
import { SURF, cellAt, makeGrid, paintDisc, type Grid } from '../src/game/ext/course-grid';
import type { Rect } from '../src/game/golf/mode';
import type { Prop } from '../src/game/types';
import { PaintTool, type PaintHost } from '../src/game/paint-tool';
import { inPractice } from '../src/game/golf/practice';

const plot: Rect = [200, 200, 70, 150];
const AREA = practiceArea(plot, 2), BOX = AREA.box;
const RECT: [number, number, number, number] = [BOX[0], BOX[1], BOX[2] - BOX[0], BOX[3] - BOX[1]];
const grid = (): Grid => makeGrid(190, 190, 300, 420);
const start = { tier: 1, exits: 2, residents: 0 };

// ---- the layer order

const SQUARE = [0, 0, 1, 0, 1, 1, 0, 1];
const area = (z: number, u?: true): LotPatch => ({ pts: SQUARE, tex: 'dirt', paint: { s: 1, a: 0, b: 0, bt: 'kerb', z, ...(u ? { u: 1 as const } : {}) } });
const course = (): LotPatch => ({ pts: SQUARE, tex: 'grass', course: { cx: 0, cy: 0, size: 64, z: 0, layers: [] } as CoursePatch });

test('the range\'s ground under the course, the course under the painted areas: an area flagged under draws first whatever its z, the course chunks together, then the areas by z', () => {
  const list = [area(5), course(), area(-1e6 + 3), area(-1e6 + 9, true), area(-3, true), area(0), course(), area(-1e6 + 1, true)];
  list.sort(paintOrder);
  assert.deepEqual(list.map(paintTier), [0, 0, 0, 1, 1, 2, 2, 2], 'under the course, the course, over it');
  assert.deepEqual(list.slice(0, 3).map(p => p.paint!.z), [-1e6 + 1, -1e6 + 9, -3], 'the areas under the course keep their own order');
  assert.deepEqual(list.slice(5).map(p => p.paint!.z), [-1e6 + 3, 0, 5], 'the areas over it too');
  // an area ordered far below zero (a painted area sent to the back) is still over the course, as before
  assert.ok(paintOrder(area(-1e9), course()) > 0 && paintOrder(area(1e9, true), course()) < 0);
  // a sort is stable on equals: the course's chunks never swap
  const c1 = course(), c2 = course(); assert.equal(paintOrder(c1, c2), 0);
});

test('the soft bands read the same order: an area under the course ranks below it, a painted area above it, lawns and lot ground below both, car parks above', () => {
  const above = (a: readonly number[], b: readonly number[]) => (a[0] !== b[0] ? a[0]! > b[0]! : a[1] !== b[1] ? a[1]! > b[1]! : a[2]! > b[2]!);
  const c = paintRank(course()), under = paintRank(area(-1e6, true)), over = paintRank(area(-1e6)), lawn = [0, 5, 0], park = [3, 0, 0];
  assert.deepEqual(c, [...COURSE_RANK]);
  assert.ok(above(c, under) && !above(under, c), 'the course over the area under it');
  assert.ok(above(over, c) && !above(c, over), 'the painted area over the course (as before: even one at -1e6)');
  assert.ok(above(c, lawn) && above(park, over), 'lawns under it all, car parks over');
  assert.ok(above(paintRank(area(7, true)), paintRank(area(-7, true))), 'the areas under the course by z');
});

test('the scene flags the ground the player paints over (the outfield, bare or grassed; the starter set) and leaves the range\'s fixed pieces over the course', () => {
  for (const owned of [[], ['teeturf', 'grass']] as const) {
    const b = defaultRangeBiz(); for (const id of owned) Object.assign(b, withUpgrade(b, id as never)); b.practiceAt = RECT; b.starter = { seed: 11, gone: [] };
    const sc = rangeScene(plot, 2, b), under = sc.patches.filter(p => p.under), over = sc.patches.filter(p => !p.under);
    assert.deepEqual(under.map(p => p.surf), owned.length ? ['firstCut', 'outfield', 'dirtGreen', 'dirtGreen', 'dirtGreen', 'scrape', 'sand'] : ['desert', 'dirtGreen', 'dirtGreen', 'dirtGreen', 'scrape', 'sand'], `${owned.length ? 'grassed' : 'bare'}: the outfield and the starter set`);
    assert.ok(over.length >= 4 && over.some(p => p.surf === 'teeDirt' || p.surf === 'teeTurf') && over.some(p => p.surf === 'concrete'), 'the tee box and the mats\' deck stay over the course');
    assert.ok(!over.some(p => p.surf === 'desert' || p.surf === 'outfield' || p.surf === 'sand'), 'and none of the ground');
  }
});

test('the range host sends the flag with its ground (PatchPaint.u), only on the patches the scene flags', () => {
  const biz: RangeBizSave = defaultRangeBiz(); biz.practiceAt = RECT; biz.starter = { seed: 11, gone: [] };
  let sent: LotPatch[] = [];
  const g = grid(), ctx: RangeHostCtx = {
    biz: () => biz, plot: () => ({ rect: plot, facing: 2 }), carPark: () => null,
    addPiece: (_p: ScenePiece, key: string) => ({ auto: key } as unknown as Prop), removeProp: () => {},
    setGround: (k, patches) => { if (k === 'range:ground') sent = patches ?? []; }, layPaths: () => {}, clearTrees: () => {},
    money: () => 1e6, spend: () => {}, book: () => {}, demand: () => start, dayLen: () => 600, simT: () => 0, clock: () => ({ hour: 12, day: 1 }),
    save: () => {}, toast: () => {}, emit: () => {}, grid: () => g, layTee: () => true,
  };
  const h = new RangeHost(ctx, 1); h.sync(true);
  const sc = h.scene!;
  assert.equal(sent.length, sc.patches.length);
  sc.patches.forEach((p, i) => assert.equal(sent[i]!.paint!.u, p.under ? 1 : undefined, `${p.surf}`));
  assert.ok(sent.filter(p => p.paint!.u).length >= 6, 'the outfield and the five starter patches');
  // every z is as it was (the order among the areas is the scene's own)
  sc.patches.forEach((_, i) => assert.equal(sent[i]!.paint!.z, -1e6 + i));
});

// ---- the starter pieces: finding one, and what counts as painted over

const SET = starterSet(BOX, AREA.entry, 7);
const dirts = SET.filter(p => p.kind === 'dirt'), bunker = SET.find(p => p.kind === 'bunker')!;

test('a starter piece is found under a point inside its outline (a bunker\'s: its earth rim) and a little beyond it, the nearest of two; a piece gone is not found', () => {
  for (const p of SET) {
    assert.equal(starterAt(SET, [], p.centre.x, p.centre.y)?.id, p.id, `${p.kind} ${p.id} under its middle`);
    assert.equal(starterAt(SET, [p.id], p.centre.x, p.centre.y), null, 'gone: not there');
    const far = { x: p.centre.x + 9, y: p.centre.y + 9 }; assert.ok(!starterAt(SET, [], far.x, far.y) || starterAt(SET, [], far.x, far.y)!.id !== p.id, 'well off it: not it');
  }
  // the bunker's rim counts, not only its sand: a point just inside any vertex of the rim is the bunker
  const rim = bunker.rim!, sand = bunker.pts;
  for (let i = 0; i + 1 < rim.length; i += 6) {
    const vx = rim[i]!, vy = rim[i + 1]!, k = 0.15, x = vx + (bunker.centre.x - vx) * k, y = vy + (bunker.centre.y - vy) * k;
    assert.equal(starterAt(SET, [], x, y)?.id, bunker.id, 'just inside its rim');
  }
  assert.ok(rim.length > sand.length * 0 && Math.hypot(rim[0]! - bunker.centre.x, rim[1]! - bunker.centre.y) > 0);
  assert.equal(starterName(dirts[0]!), 'dirt green'); assert.equal(starterName(bunker), 'sand scrape');
  assert.equal(starterAt([], [], 1, 1), null);
});

/** lays surface s on the cells of a disc of radius r tiles at (x, y) */
const dab = (g: Grid, x: number, y: number, r: number, s: number = SURF.fescue) => paintDisc(g, x, y, r, s, 0, 0);

test('a piece counts as painted over when a third of its cells hold a surface: a stroke brushing its edge, or one thin line across it, leaves it standing', () => {
  const p = dirts[0]!;
  // nothing painted: nothing covered
  let g = grid(); assert.deepEqual(paintedOver(SET, [], g), []);
  // one thin line across its middle (a 1 m brush: the flag's cell is painted): still standing; a dab over the better part of it: gone
  g = grid(); for (let k = -3; k <= 3; k += 0.5) dab(g, p.centre.x + k, p.centre.y, 0.3);
  assert.notEqual(g.surf[cellAt(g, p.centre.x, p.centre.y)], SURF.none, 'its middle is painted'); assert.deepEqual(paintedOver(SET, [], g), [], 'a thin line across it');
  g = grid(); dab(g, p.centre.x, p.centre.y, 2.0); assert.deepEqual(paintedOver(SET, [], g), [p.id], 'a dab over half of it');
  // a stroke along its rim only: well under a third of it, its middle bare
  g = grid(); for (let a = 0; a < Math.PI * 2; a += 0.35) dab(g, p.centre.x + Math.cos(a) * 3.1, p.centre.y + Math.sin(a) * 3.1, 0.5);
  assert.equal(g.surf[cellAt(g, p.centre.x, p.centre.y)], SURF.none); assert.deepEqual(paintedOver(SET, [], g), [], 'a ring round it: still standing');
  // a wide stroke round its middle (the middle itself left bare), past the share: gone
  g = grid(); for (let a = 0; a < Math.PI * 2; a += 0.25) dab(g, p.centre.x + Math.cos(a) * 1.6, p.centre.y + Math.sin(a) * 1.6, 1.0);
  assert.ok(g.surf[cellAt(g, p.centre.x, p.centre.y)] === SURF.none, 'its middle bare');
  assert.deepEqual(paintedOver(SET, [], g), [p.id], 'a wide ring over most of it');
  // the edit's box limits the look: a dab far from it leaves it
  g = grid(); dab(g, p.centre.x, p.centre.y, 2.0); assert.deepEqual(paintedOver(SET, [], g, [BOX[0], BOX[1], BOX[0] + 1, BOX[1] + 1]), [], 'an edit elsewhere');
  assert.deepEqual(paintedOver(SET, [p.id], g), [], 'a piece gone is not covered again');
  assert.ok(PAINTED_SHARE > 0.2 && PAINTED_SHARE < 0.6);
  // a whole area painted: every piece
  g = grid(); for (let y = BOX[1] + 1; y < BOX[3]; y += 3) for (let x = BOX[0] + 1; x < BOX[2]; x += 3) dab(g, x, y, 2.4, SURF.longGrass);
  assert.deepEqual(paintedOver(SET, [], g), SET.map(q => q.id), 'all four');
});

// ---- the three ways a piece goes: the host's steps

function hostWith(g: Grid, biz: RangeBizSave) {
  const log: { toasts: string[]; saves: number } = { toasts: [], saves: 0 };
  const ctx: RangeHostCtx = {
    biz: () => biz, plot: () => ({ rect: plot, facing: 2 }), carPark: () => null,
    addPiece: (_p: ScenePiece, key: string) => ({ auto: key } as unknown as Prop), removeProp: () => {},
    setGround: () => {}, layPaths: () => {}, clearTrees: () => {},
    money: () => 1e6, spend: () => {}, book: () => {}, demand: () => start, dayLen: () => 600, simT: () => 0, clock: () => ({ hour: 12, day: 1 }),
    save: () => { log.saves++; }, toast: t => { log.toasts.push(t); }, emit: () => {}, grid: () => g, layTee: () => true,
  };
  const h = new RangeHost(ctx, 1); h.sync(true);
  return { h, log, ctx };
}

test('painted over: the Texture Painter\'s step takes the pieces it covers with it, in its own undo step: undo brings them back, redo takes them away again', () => {
  const biz: RangeBizSave = defaultRangeBiz(); biz.practiceAt = RECT; biz.starter = { seed: 7, gone: [] };
  const g = grid(), { h } = hostWith(g, biz), sc = h.scene!;
  assert.equal(sc.starter.length, 4);
  const p0 = sc.starter.find(p => p.kind === 'dirt')!, money = { v: 1e6 };
  const ph: PaintHost = {
    setLotGround() {}, emit() {}, save() {}, toast() {}, affine() {}, placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [],
    golfMode: () => true, currentMonth: () => 5, money: () => money.v, spend: n => { money.v -= n; },
    grid: () => g, gridChanged() {}, ownedAt: () => true, practiceAt: (x, y) => inPractice(AREA, x, y),
    paintedOver: d => h.paintedOver(g, d),
  };
  const tool = new PaintTool(ph); tool.enterCourse(); tool.setHole(1);
  // a stroke off every piece: nothing goes (and no extra step)
  const far = { x: BOX[0] + 1.5, y: BOX[1] + 1.5 };
  tool.gridEdit('brush long grass', gg => ({ diffs: [dab(gg, far.x, far.y, 1.2, SURF.longGrass)], spent: 0 }));
  assert.deepEqual(biz.starter!.gone, [], 'a dab in a corner leaves them all');
  // a stroke over the first dirt green: it goes, the others stay
  tool.gridEdit('brush long grass', gg => ({ diffs: [dab(gg, p0.centre.x, p0.centre.y, 2.5, SURF.longGrass)], spent: 0 }));
  assert.deepEqual(biz.starter!.gone, [p0.id], 'the painted-over piece is gone');
  h.sync(); assert.equal(h.scene!.pieces.filter(q => q.key.startsWith('starter-flag')).length, 2, 'and its flag with it');
  assert.equal(h.scene!.patches.length, sc.patches.length - 1);
  tool.undo(); assert.deepEqual(biz.starter!.gone, [], 'undo: the piece comes back with the cells taken away');
  assert.equal(g.surf[cellAt(g, p0.centre.x, p0.centre.y)], SURF.none);
  tool.redo(); assert.deepEqual(biz.starter!.gone, [p0.id], 'redo: painted over again, gone again');
  assert.equal(g.surf[cellAt(g, p0.centre.x, p0.centre.y)], SURF.longGrass);
  // the undo steps are in order: the corner dab's, then this one
  tool.undo(); tool.undo(); assert.deepEqual(biz.starter!.gone, []); assert.equal(g.surf[cellAt(g, far.x, far.y)], SURF.none);
  // a rub out (no surface laid) takes none of them
  tool.redo(); tool.redo();
  tool.gridEdit('rub out', gg => ({ diffs: [paintDisc(gg, sc.starter[3]!.centre.x, sc.starter[3]!.centre.y, 2, SURF.rough, 0, 0, { rub: true })], spent: 0 }));
  assert.ok(!(biz.starter!.gone as number[]).includes(3), 'a rub out over the bunker leaves it');
});

test('bulldozed on their own: the Bulldoze tool takes a dirt green with its flag or the sand scrape for nothing, as one undo step; a piece gone is not found again', () => {
  const biz: RangeBizSave = defaultRangeBiz(); biz.practiceAt = RECT; biz.starter = { seed: 7, gone: [] };
  const g = grid(), { h } = hostWith(g, biz), sc = h.scene!, money = { v: 123456 }, toasts: string[] = [];
  const ph: PaintHost = {
    setLotGround() {}, emit() {}, save() {}, toast() {}, affine() {}, placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [],
    golfMode: () => true, currentMonth: () => 5, money: () => money.v, spend: n => { money.v -= n; },
    grid: () => g, gridChanged() {}, ownedAt: () => true, practiceAt: (x, y) => inPractice(AREA, x, y),
  };
  const paint = new PaintTool(ph); paint.enterCourse(); paint.setHole(1);
  const ctx: PracticeHostCtx = {
    area: () => AREA, grid: () => g, owned: () => true, open: () => false, tileAt: (mx, my) => ({ x: mx, y: my }), money: () => money.v, month: () => 5,
    gridStep: (label, run) => paint.gridEdit(label, run), undo: () => paint.undo(), redo: () => paint.redo(), lookAt: () => {},
    starterAt: (x, y) => h.starterAt(x, y), dropStarters: ids => h.dropStarters(ids),
    save: () => {}, toast: t => { toasts.push(t); }, emit: () => {},
  };
  const tool = new PracticeTool(ctx);
  const dirt = sc.starter.find(p => p.kind === 'dirt')!, sand = sc.starter.find(p => p.kind === 'bunker')!;
  // the hover finds them (the outline and its name), the click removes: free
  assert.equal(tool.starterAt(dirt.centre.x, dirt.centre.y)?.name, 'dirt green'); assert.equal(tool.starterAt(sand.centre.x, sand.centre.y)?.name, 'sand scrape');
  assert.equal(tool.starterAt(BOX[0] + 0.5, BOX[1] + 0.5), null, 'bare ground: none');
  assert.equal(tool.removeAt(dirt.centre.x, dirt.centre.y), true);
  assert.deepEqual(biz.starter!.gone, [dirt.id]); assert.equal(money.v, 123456, 'free'); assert.match(toasts.at(-1)!, /^Removed the dirt green \(free\)/);
  h.sync(); assert.equal(h.scene!.pieces.filter(q => q.key.startsWith('starter-flag')).length, 2, 'its flag went too');
  assert.equal(tool.removeAt(dirt.centre.x, dirt.centre.y), false, 'there is nothing there now');
  assert.equal(tool.removeAt(sand.centre.x, sand.centre.y), true); assert.deepEqual(biz.starter!.gone, [dirt.id, sand.id].sort((a, b) => a - b)); assert.match(toasts.at(-1)!, /^Removed the sand scrape/);
  h.sync(); assert.equal(h.scene!.patches.filter(p => p.surf === 'sand' || p.surf === 'scrape').length, 0, 'both of its patches');
  // each is one undo step, in order: the sand comes back first, then the green with its flag
  paint.undo(); assert.deepEqual(biz.starter!.gone, [dirt.id]); h.sync(); assert.equal(h.scene!.patches.filter(p => p.surf === 'sand').length, 1);
  paint.undo(); assert.deepEqual(biz.starter!.gone, []); paint.redo(); assert.deepEqual(biz.starter!.gone, [dirt.id]);
  assert.equal(money.v, 123456, 'nothing was ever paid or paid back');
});

// ---- the practice view: what the player painted on the outfield lies in it

import { practiceCourse } from '../src/game/golf/play/practice3p';
test('the practice view takes what the player painted on the outfield: a bunker and a pond lie over the outfield and under the target greens and the tee, as the game draws them', () => {
  const sq = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1];
  const disc = (x: number, y: number, r: number, n = 24) => Array.from({ length: n }, (_, k) => [x + Math.cos(k / n * Math.PI * 2) * r, y + Math.sin(k / n * Math.PI * 2) * r]).flat();
  const area = (id: number, surface: 'bunker' | 'water' | 'rough', pts: number[]) => ({ id, surface, pts });
  const base = { outfield: sq(0, 4, 70, 130), teeBox: sq(4, -3, 67, 1), bays: [{ x: 30, y: 0 }], greens: [{ x: 35, y: 50, r: 4, m: 100 }], area: null, areas: [], chip: null, outfieldSurface: 'fairway' as const };
  const none = practiceCourse(base), c = practiceCourse({ ...base, painted: [area(1, 'bunker', disc(20, 40, 3)), area(2, 'water', disc(50, 90, 5)), area(3, 'rough', disc(35, 50, 7))] });
  assert.notEqual(none.view.lieAt(20, 40), 'bunker', 'nothing painted: the outfield');
  assert.equal(c.view.lieAt(20, 40), 'bunker', 'the ball lies in the painted bunker'); assert.equal(c.view.lieAt(50, 90), 'water', 'and drops in the painted pond');
  assert.equal(c.view.lieAt(70.5, 90), none.view.lieAt(70.5, 90), 'off it: as before');
  assert.equal(c.view.lieAt(35, 50), 'green', 'a rough painted over the target green leaves the green on top, as the game draws it');
  assert.equal(c.view.lieAt(35, 56), 'rough', 'round it, the rough');
  // the file the view loads holds them too: after the outfield, before the tee and the greens
  const s = c.input.areas.map(a => a.surface); assert.deepEqual(s.slice(0, 5), ['fairway', 'bunker', 'water', 'rough', 'tee']); assert.equal(s.at(-1), 'green');
  // the same range without a painted area is the file it was
  assert.deepEqual(none.input.areas.map(a => a.surface), ['fairway', 'tee', 'green']);
});
