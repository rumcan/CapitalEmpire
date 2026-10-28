// T271 (#812; the owner, 2026-10-29: "I would like to be able to create my own grass preset. option 9 should be create your own under shape by
// hand"): the course's own grasses. A cell painted with one keeps the surface it plays as (surf) and names the grass in the look layer; the
// drawn course sees it as a draw id of its own. Saved and reloaded, it plays as its base, old saves load unchanged, and deleting it repaints its
// cells as the surface it plays as.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOM0, MAX_GRASSES, SURF, applyDiff, decodeGrid, drawView, encodeGrid, fillPolygon, grassId, grassSlot, lookCellsDiff, looksUsed, makeGrid, mergeDiffs, paintDisc, setLook, type Grid } from '../src/game/ext/course-grid';
import { gridAreas } from '../src/game/ext/course-grid/areas';
import { coursePatch, courseStyles, type CourseLooks } from '../src/game/ext/course-grid/patch';
import { DRAW_ORDER, layerCode } from '../src/game/ext/course-walls';
import { GRASS_FAMILIES, PLAY_SURF, clampGrass, freeSlot, golfSurfaceOf, grassLooks, grassTex, newGrass, normalizeGrasses, ownTex, type CustomGrass } from '../src/game/golf/grasses';
import { normalizeGolfSave, type GolfSave } from '../src/game/golf/mode';
import { clampSurfaces, lookOfTex } from '../src/game/painted-surfaces';
import { shineGroup } from '../src/game/grass-shine';
import { PaintTool, type PaintHost } from '../src/game/paint-tool';
import type { LotPatch } from '../src/game/ground-protocol';

const LOOKS: CourseLooks = {
  surf: [undefined, { tex: 'golfRough', sc: 1, a: 0 }, { tex: 'golfFescue', sc: 1, a: 0 }, { tex: 'waterDark', sc: 1, a: 0 }, { tex: 'golfFairway', sc: 1, a: 0 }, { tex: 'golfTee', sc: 1, a: 0 }, { tex: 'bunkerSand', sc: 1, a: 0 }, { tex: 'wasteSand', sc: 1, a: 0 }, { tex: 'golfGreen', sc: 1, a: 0 }, { tex: 'golfLongGrass', sc: 1, a: 0 }],
  collar: { 'first-cut': { tex: 'golfFirstCut', sc: 1, a: 0 }, fringe: { tex: 'golfFringe', sc: 1, a: 0 }, lip: { tex: 'golfRough', sc: 1, a: 0 }, bank: { tex: 'rockyDirt', sc: 1, a: 0 } },
};
const FAM = GRASS_FAMILIES[0]!.id;
/** LOOKS with the grasses laid in at their draw ids (as the engine's courseLooks: golf/grasses.ts grassLooks) */
function withGrasses(list: CustomGrass[]): CourseLooks {
  const gl = grassLooks(list, LOOKS.collar['first-cut']), put = <T,>(a: readonly (T | undefined)[] | undefined, b: (T | undefined)[]) => { const o = a ? a.slice() : []; b.forEach((v, s) => { if (v !== undefined) o[s] = v; }); return o; };
  return { ...LOOKS, surf: put(LOOKS.surf, gl.surf), band: put(LOOKS.band, gl.band), border: put(LOOKS.border, gl.border), shadow: put(LOOKS.shadow, gl.shadow), round: put(LOOKS.round, gl.round), base: gl.base, ...(gl.stripes ? { stripes: gl.stripes } : {}) };
}
/** a course: rough everywhere, a fairway down the middle of chunk (0, 0) */
function course(): Grid {
  const g = makeGrid(0, 0, 160, 160);
  fillPolygon(g, [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 80 }, { x: 0, y: 80 }], SURF.rough, 1, 0);
  fillPolygon(g, [{ x: 10, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 34 }, { x: 10, y: 34 }], SURF.fairway, 1, 0);
  return g;
}
const json = (p: LotPatch | null) => JSON.stringify(p, (_k, v) => (v instanceof Float32Array ? Array.from(v) : v instanceof Uint8Array ? Array.from(v) : v));

test('a custom grass rides on the surface it plays as: surf holds the play, the look layer the slot, the draw id its own', () => {
  const g = course();
  const d = paintDisc(g, 50, 27, 4, SURF.fairway, 1, 0, { look: 2 });
  assert.ok(d.n > 0);
  const i = 27 * 2 * g.w + 50 * 2;
  assert.equal(g.surf[i], SURF.fairway, 'plays as a fairway');
  assert.equal(g.look![i], 2);
  assert.equal(g.draw![i], grassId(2));
  assert.equal(grassSlot(grassId(2)), 2);
  assert.equal(drawView(g).surf[i], grassId(2));
  const plain = course(); assert.equal(drawView(plain), plain, 'no custom cell: the view is the grid itself');
  // another brush lays its own look; a rub out takes the look with the surface; undo puts the look back
  const d2 = paintDisc(g, 50, 27, 1, SURF.fairway, 1, 0);
  assert.equal(g.look![i], 0); assert.equal(g.draw![i], SURF.fairway);
  applyDiff(g, d2, true);
  assert.equal(g.look![i], 2); assert.equal(g.draw![i], grassId(2));
  const d3 = paintDisc(g, 50, 27, 1, SURF.rough, 0, 0, { rub: true });
  assert.equal(g.surf[i], SURF.rough); assert.equal(g.look![i], 0);
  applyDiff(g, d3, true); assert.equal(g.look![i], 2);
  // a merged diff carries the slot (undo of a whole stroke)
  const a = paintDisc(g, 60, 27, 2, SURF.fairway, 1, 0, { look: 3 }), b = paintDisc(g, 61, 27, 2, SURF.fairway, 1, 0, { look: 3 }), m = mergeDiffs(a, b);
  applyDiff(g, m, true); assert.equal(g.look![27 * 2 * g.w + 61 * 2], 0);
  applyDiff(g, m, false); assert.equal(g.look![27 * 2 * g.w + 61 * 2], 3);
  // a look on a surface no grass plays as (a bunker) draws as that surface
  const t = makeGrid(0, 0, 8, 8); paintDisc(t, 2, 2, 1, SURF.bunker, 1, 0, { look: 1 });
  assert.ok(!t.look, 'a bunker never takes a custom grass');
});

test('saved and reloaded: the look layer goes in the save only when a cell wears a grass; old saves load and save unchanged', () => {
  const plain = course(), s0 = encodeGrid(plain);
  assert.equal(s0.k, undefined, 'no custom grass: no look layer in the save');
  const back = decodeGrid(s0)!;
  assert.ok(!back.look && !back.draw, 'an old save has no look layer');
  assert.deepEqual(encodeGrid(back), s0, 'and saves exactly as it was');
  const g = course(); paintDisc(g, 50, 27, 4, SURF.fairway, 1, 0, { look: 1 });
  const s1 = encodeGrid(g); assert.equal(typeof s1.k, 'string');
  assert.ok(s1.k!.length < 200, `the look layer is a few bytes a row of cells (${s1.k!.length} for a 16 m disc)`);
  const r = decodeGrid(s1)!;
  assert.deepEqual(Array.from(r.look!), Array.from(g.look!));
  assert.deepEqual(Array.from(r.draw!), Array.from(g.draw!));
  assert.deepEqual(Array.from(r.surf), Array.from(g.surf));
  assert.equal(decodeGrid({ ...s1, k: encodeGrid({ ...g, look: new Uint8Array(g.w * g.h).fill(MAX_GRASSES + 1) }).k }), null, 'a slot past the last is a bad save');
});

test('the presets: normalised, one per slot, saved in the game save; an old game save has none', () => {
  const g = newGrass(1, FAM);
  assert.equal(g.plays, 'fairway'); assert.equal(g.stripes, true);
  assert.deepEqual(normalizeGrasses([g, { ...g, name: 'again' }, { k: 9, plays: 'rough' }, { k: 2, plays: 'nope' }, null]), [g], 'one per slot, a bad slot or play dropped');
  const c = clampGrass({ ...g, k: 3, plays: 'rough', stripes: true, scale: 9, family: 'no-such', name: '  A very long name for a custom grass  ' })!;
  assert.equal(c.stripes, false, 'stripes are a fairway-like grass\'s only');
  assert.equal(c.scale, 4); assert.equal(c.family, GRASS_FAMILIES[0]!.id); assert.ok(c.name.length <= 24 && !c.name.startsWith(' '));
  assert.equal(freeSlot([{ k: 1 }, { k: 2 }, { k: 4 }]), 3);
  const base = { town: { x: 0, y: 0 }, course: [0, 0, 10, 10], clubhouse: { x: 1, y: 1 }, tees: [], pins: [], aims: [] } as unknown as GolfSave;
  assert.equal(normalizeGolfSave(base)!.grasses, undefined, 'an old save has no grasses');
  assert.deepEqual(normalizeGolfSave({ ...base, grasses: [g] })!.grasses, [g]);
  assert.deepEqual(normalizeGolfSave(JSON.parse(JSON.stringify({ ...base, grasses: [g] })))!.grasses, [g], 'through JSON and back');
});

test('plays as its base: the cells are that surface for play and the areas; the first cut is rough cells with the first cut\'s lie', () => {
  assert.equal(PLAY_SURF.firstCut, SURF.rough); assert.equal(golfSurfaceOf('firstCut'), 'firstCut');
  for (const p of ['fairway', 'rough', 'longGrass', 'fescue'] as const) assert.equal(golfSurfaceOf(p), p);
  const g = course(); paintDisc(g, 55, 60, 5, SURF.fairway, 2, 0, { look: 1 });
  const areas = gridAreas(g, [2]);
  assert.ok(areas.some(a => a.s === SURF.fairway && a.hole === 2 && !a.collar), 'a custom fairway is a fairway area of its hole');
  assert.ok(areas.every(a => a.s < CUSTOM0));
});

test('the drawn course: a custom grass is a layer of its own in its family, at its base\'s edge, with the base\'s collars over it', () => {
  const list = [{ ...newGrass(1, FAM), border: 0 }, { ...newGrass(2, FAM), plays: 'rough' as const, stripes: false, border: 0 }];
  const looks = withGrasses(list), g = course();
  paintDisc(g, 50, 27, 4, SURF.fairway, 1, 0, { look: 1 });
  paintDisc(g, 25, 50, 5, SURF.rough, 1, 0, { look: 2 });
  const p = coursePatch(g, 0, 0, looks, 0)!, own = p.course!.layers.find(l => l.s === grassId(1))!, rough = p.course!.layers.find(l => l.s === grassId(2))!;
  assert.ok(own && own.fill.length, 'the custom fairway is drawn');
  assert.equal(own.tex, grassTex(list[0]!)); assert.equal(own.b, SURF.fairway); assert.equal(own.e, 'turf', 'its base\'s edge');
  assert.ok(own.stripes?.length, 'a fairway-like grass with stripes carries them');
  assert.ok(rough && rough.b === SURF.rough && !rough.stripes);
  assert.ok(!p.course!.layers.some(l => l.s === SURF.fairway && l.b !== undefined), 'the saved surfaces carry no base');
  // the fairway's first cut lies over a custom rough as over the rough; a custom fairway draws in the draw order after the fescue
  const st = courseStyles(looks.border, looks.base);
  assert.ok(st[SURF.fairway]!.collar!.over.includes(grassId(2)) && !st[SURF.fairway]!.collar!.over.includes(grassId(1)));
  assert.equal(st[grassId(1)]!.relax, st[SURF.fairway]!.relax);
  assert.ok(DRAW_ORDER.indexOf(layerCode(grassId(1), false)) > DRAW_ORDER.indexOf(layerCode(SURF.fescue, false)) && DRAW_ORDER.indexOf(layerCode(grassId(1), false)) < DRAW_ORDER.indexOf(layerCode(SURF.water, false)));
});

test('a course with no custom grass lays exactly the patches it laid before (the grasses in the looks change nothing)', () => {
  const g = course(), looks = withGrasses([newGrass(1, FAM)]);
  assert.equal(json(coursePatch(g, 0, 0, looks, 0)), json(coursePatch(g, 0, 0, LOOKS, 0)));
});

test('delete repaints its cells as the surface it plays as: the patch is the plain fairway\'s, and undo brings the grass back', () => {
  const looks = withGrasses([newGrass(1, FAM)]), g = course(), plain = course();
  paintDisc(g, 50, 27, 4, SURF.fairway, 1, 0, { look: 1 }); paintDisc(plain, 50, 27, 4, SURF.fairway, 1, 0);
  const d = lookCellsDiff(g, 1); assert.ok(d.n > 0);
  applyDiff(g, d, false);
  assert.deepEqual(Array.from(g.surf), Array.from(plain.surf), 'every cell keeps what it plays as');
  assert.equal(looksUsed(g).size, 0);
  assert.equal(json(coursePatch(g, 0, 0, looks, 0)), json(coursePatch(plain, 0, 0, looks, 0)), 'drawn as the plain fairway');
  applyDiff(g, d, true); assert.deepEqual([...looksUsed(g)], [1]);
});

test('the contour worker takes the look layer with the grid and its cells: its draw ids are the main thread\'s', () => {
  // (course-contour applyToCourse: a 'grid' message's look goes through setLook, a 'cells' message's slots as the diff's k0 = k1)
  const g = course(); paintDisc(g, 50, 27, 4, SURF.fairway, 1, 0, { look: 1 });
  const w: Grid = { x0: g.x0, y0: g.y0, w: g.w, h: g.h, surf: g.surf.slice(), hole: g.hole.slice(), month: g.month.slice(), rev: 0 }; setLook(w, g.look!.slice());
  assert.deepEqual(Array.from(w.draw!), Array.from(g.draw!));
  const d = paintDisc(g, 30, 60, 3, SURF.rough, 1, 0, { look: 2 });
  applyDiff(w, { x0: d.x0, y0: d.y0, w: d.w, n: d.n, idx: d.idx, s0: d.s1, h0: d.h1, m0: d.m1, s1: d.s1, h1: d.h1, m1: d.m1, k0: d.k1, k1: d.k1 }, false);
  assert.deepEqual(Array.from(w.draw!), Array.from(g.draw!));
  // a worker grid with no look layer yet takes one from the first cells that name a grass
  const w2: Grid = { x0: g.x0, y0: g.y0, w: g.w, h: g.h, surf: course().surf, hole: course().hole, month: course().month, rev: 0 }, g2 = course();
  const d2 = paintDisc(g2, 50, 27, 4, SURF.fairway, 1, 0, { look: 1 });
  applyDiff(w2, { x0: d2.x0, y0: d2.y0, w: d2.w, n: d2.n, idx: d2.idx, s0: d2.s1, h0: d2.h1, m0: d2.m1, s1: d2.s1, h1: d2.h1, m1: d2.m1, k0: d2.k1, k1: d2.k1 }, false);
  assert.deepEqual(Array.from(w2.draw!), Array.from(g2.draw!));
  assert.equal(json(coursePatch(w, 0, 0, withGrasses([newGrass(1, FAM), { ...newGrass(2, FAM), plays: 'rough', stripes: false }]), 0)), json(coursePatch(g, 0, 0, withGrasses([newGrass(1, FAM), { ...newGrass(2, FAM), plays: 'rough', stripes: false }]), 0)));
});

test('never a wash: the grass is its painted family with no tint and no tone (the exposure is the texture\'s own), and it shines as its play', () => {
  const t = grassTex({ plays: 'longGrass', family: FAM });
  assert.deepEqual(ownTex(t), { play: 'longGrass', family: FAM });
  const look = lookOfTex(t, clampSurfaces(null))!;
  assert.equal(look.family, FAM); assert.equal(look.tint, '#ffffff'); assert.equal(look.tone, 0);
  assert.equal(shineGroup(grassTex({ plays: 'fairway', family: FAM })), 'fairway');
  assert.equal(shineGroup(grassTex({ plays: 'firstCut', family: FAM })), 'firstCut');
  assert.equal(shineGroup(grassTex({ plays: 'fescue', family: FAM })), 'fescue');
});

/** a localStorage stand-in for the Paint tool */
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, String(v)); }, removeItem: (k: string) => { store.delete(k); } };

test('the Paint tool: Create your own makes a grass (one undo step), its brush lays it, delete repaints its cells and undo brings both back', () => {
  let list: CustomGrass[] = [];
  const g = course();
  const host: PaintHost = { setLotGround() {}, emit() {}, save() {}, toast() {}, affine() {}, placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [], golfMode: () => true, money: () => 1e9, spend() {},
    grid: () => g, gridChanged() {}, grasses: () => list, setGrasses: l => { list = normalizeGrasses(l); }, grassFamily: () => FAM, firstCutTex: () => LOOKS.collar['first-cut'] };
  const p = new PaintTool(host); p.enterCourse();
  p.openGrass();
  assert.ok(p.grassDraft && p.grassDraft.k === 0 && p.grassDraft.family === FAM, 'a new grass in the fairway\'s family');
  p.editGrass({ name: 'Links', plays: 'firstCut' });
  assert.equal(list.length, 0, 'a draft is not made until Create');
  assert.ok(p.createGrass());
  assert.equal(list.length, 1); assert.equal(list[0]!.name, 'Links'); assert.equal(p.grassInHand, 1); assert.equal(p.brushSurf(), SURF.rough, 'the first cut lays rough cells');
  p.undoTop(); assert.equal(list.length, 0, 'undo takes the grass back'); p.redoTop(); assert.equal(list.length, 1);
  p.setGrass(1);
  p.gridEdit('lay it', grid => ({ diffs: [paintDisc(grid, 50, 27, 3, p.brushSurf(), 1, 0, { look: p.grassInHand })], spent: 0 }));
  const n = looksUsed(g); assert.deepEqual([...n], [1]);
  assert.ok(p.deleteGrass(1) > 0);
  assert.equal(list.length, 0); assert.equal(looksUsed(g).size, 0); assert.equal(p.grassInHand, 0);
  p.undoTop(); assert.equal(list.length, 1, 'undo brings the grass back'); assert.deepEqual([...looksUsed(g)], [1], 'and its cells');
  // picking a surface's own swatch puts the grass down; the same surface taken up again keeps it
  p.setGrass(1); p.setBrush(p.brushKind); assert.equal(p.grassInHand, 1); p.setBrush(p.brushKind, 0); assert.equal(p.grassInHand, 0);
});
