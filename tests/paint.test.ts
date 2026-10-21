// Headless tests for the Paint tool's data model: npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PaintTool } from '../src/game/paint-tool';
import { PHOTO_TEX, photoPeriod } from '../src/game/grass-art';
import {
  DEFAULT_STYLE, PAINT_TEXES, RADIUS_MAX, areaAt, boxOf, checkArea, clampStyle, crossings, edgeAngle, fromTuples, insertCorner, insidePoly, moveCorner, polyArea, removeCorner, roundCorners, rotatePts, scalePts, simplify, snapPt, toTuple, translatePts,
  type BorderSize, type BorderTex, type PaintArea, type PaintTex, type PaintTuple,
} from '../src/game/paint';

const SQUARE = [0, 0, 2, 0, 2, 2, 0, 2];
const BOWTIE = [0, 0, 10, 10, 10, 0, 0, 10];
const L_SHAPE = [0, 0, 4, 0, 4, 2, 2, 2, 2, 4, 0, 4];
const HEX = [1, 0, 0.5, 0.866, -0.5, 0.866, -1, 0, -0.5, -0.866, 0.5, -0.866].map(v => v + 10);
/** a value the save or a panel could hand over that the types would not allow (for the clamp tests) */
const junk = <T>(v: unknown) => v as T;

test('rocky dirt saves keep both paintings and border styles when reloaded into ground patches', () => {
  const tuples: PaintTuple[] = [
    ['rockyDirt', 1.5, 30, 2, 'rockyDirtAlt', SQUARE],
    ['rockyDirtAlt', 0.5, -45, 1, 'rockyDirt', L_SHAPE],
    ['dirt', 1, 0, 0, 'kerb', SQUARE],
  ];
  const sent = new Map<string, unknown>();
  const host = { setLotGround: (key: string, patches: unknown) => { sent.set(key, patches); }, emit() {}, save() {}, toast() {}, affine() {} };
  const first = new PaintTool(host);
  first.load(tuples);
  const saved = JSON.parse(JSON.stringify(first.save())) as PaintTuple[];
  const reloaded = new PaintTool(host);
  reloaded.load(saved);
  assert.deepEqual(reloaded.save(), tuples.map(t => [...t, 0, 0, 0.35, '#000000'])); // the save carries a radius (0: sharp) and an untoned tone
  assert.deepEqual(sent.get('paint:1'), [{ pts: SQUARE, tex: 'rockyDirt', paint: { s: 1.5, a: 30, b: 0.5, bt: 'rockyDirtAlt', z: 1 } }]);
  assert.deepEqual(sent.get('paint:2'), [{ pts: L_SHAPE, tex: 'rockyDirtAlt', paint: { s: 0.5, a: -45, b: 0.25, bt: 'rockyDirt', z: 2 } }]);
});

test('polyArea: the sign follows the winding, the value is the area in tiles²', () => {
  assert.equal(polyArea([0, 0, 1, 0, 1, 1, 0, 1]), 1);
  assert.equal(polyArea([0, 0, 4, 0, 4, 3, 0, 3]), 12);
  assert.equal(polyArea([0, 0, 0, 1, 1, 1, 1, 0]), -1);
});

test('checkArea: a valid square, then each failure reason in turn', () => {
  assert.equal(checkArea(SQUARE), '');
  assert.equal(checkArea([0, 0, 1, 1]), 'Needs 3 corners');
  assert.equal(checkArea(new Array(402).fill(0)), 'Too many corners');
  assert.equal(checkArea([-1, 0, 2, 0, 2, 2]), 'Off the map');
  assert.equal(checkArea([0, 0, 2048.5, 0, 2048.5, 2, 0, 2]), 'Off the map');
  assert.equal(checkArea([0, 0, 300, 0, 300, 2, 0, 2]), 'Too big (512 m max)');
  assert.equal(checkArea(BOWTIE), 'Edges cross');
  assert.equal(checkArea([0, 0, 0.5, 0, 0.5, 0.5, 0, 0.5]), 'Too small');
});

test('crossings: a bow-tie crosses, a convex hexagon does not, an L-shape is a valid area', () => {
  assert.notEqual(crossings(BOWTIE).length, 0);
  assert.deepEqual(crossings(HEX), []);
  assert.equal(checkArea(L_SHAPE), '');
  assert.equal(polyArea(L_SHAPE), 12);
});

test('snapPt: whole tiles when grid, quarter tiles when not', () => {
  assert.deepEqual(snapPt(3.4, 5.6, true), { x: 3, y: 6 });
  assert.deepEqual(snapPt(3.4, 5.6, false), { x: 3.5, y: 5.5 });
  assert.deepEqual(snapPt(3.13, -0.1, false), { x: 3.25, y: 0 });
});

test('simplify: a nearly straight line keeps its ends, a right-angle corner survives', () => {
  const line: number[] = [];
  for (let i = 0; i < 20; i++) line.push(i, (i % 2) * 0.05);
  assert.deepEqual(simplify(line), [0, 0, 19, 0.05]);
  const corner: number[] = [];
  for (let i = 0; i <= 10; i++) corner.push(i, 0);
  for (let j = 1; j <= 10; j++) corner.push(10, j);
  assert.deepEqual(simplify(corner), [0, 0, 10, 0, 10, 10]);
});

test('insidePoly: inside, outside, and a concave notch is outside', () => {
  assert.equal(insidePoly(L_SHAPE, 1, 1), true);
  assert.equal(insidePoly(L_SHAPE, 3, 1), true);
  assert.equal(insidePoly(L_SHAPE, 3, 3), false); // the notch
  assert.equal(insidePoly(L_SHAPE, 5, 5), false);
});

test('areaAt: the higher id wins where two areas overlap; null outside both', () => {
  const style = { ...DEFAULT_STYLE };
  const areas: PaintArea[] = [
    { id: 1, pts: [0, 0, 4, 0, 4, 4, 0, 4], ...style },
    { id: 2, pts: [2, 2, 6, 2, 6, 6, 2, 6], ...style, tex: 'grass' },
  ];
  assert.equal(areaAt(areas, 3, 3)?.id, 2);
  assert.equal(areaAt(areas, 1, 1)?.id, 1);
  assert.equal(areaAt(areas, 10, 10), null);
});

test('clampStyle: angles wrap into [-90, 90] (120 → -60, -100 → 80); 90 and -90 stay as they are', () => {
  assert.equal(clampStyle({ ...DEFAULT_STYLE, angle: 120 }).angle, -60);
  assert.equal(clampStyle({ ...DEFAULT_STYLE, angle: -100 }).angle, 80);
  assert.equal(clampStyle({ ...DEFAULT_STYLE, angle: 90 }).angle, 90);
  assert.equal(clampStyle({ ...DEFAULT_STYLE, angle: -90 }).angle, -90);
  assert.equal(clampStyle({ ...DEFAULT_STYLE, angle: 270 }).angle, -90);
});

test('clampStyle: scale, border and textures are clamped or defaulted', () => {
  assert.equal(clampStyle({ ...DEFAULT_STYLE, scale: 0.01 }).scale, 0.25);
  assert.equal(clampStyle({ ...DEFAULT_STYLE, scale: 10 }).scale, 4);
  assert.equal(clampStyle({ ...DEFAULT_STYLE, border: junk<BorderSize>(7) }).border, 3);
  assert.equal(clampStyle({ ...DEFAULT_STYLE, border: junk<BorderSize>(-1) }).border, 0);
  assert.equal(clampStyle({ ...DEFAULT_STYLE, border: junk<BorderSize>(1.6) }).border, 2);
  assert.equal(clampStyle({ ...DEFAULT_STYLE, tex: junk<PaintTex>('lava') }).tex, 'paving');
  assert.equal(clampStyle({ ...DEFAULT_STYLE, btex: junk<BorderTex>('lava') }).btex, 'kerb');
  assert.equal(clampStyle({ ...DEFAULT_STYLE, btex: 'dirt' }).btex, 'dirt');
});

test('save round trip: areas → tuples → JSON → areas gives the same areas; a bow-tie tuple is dropped', () => {
  const areas: PaintArea[] = [
    { id: 1, pts: [0, 0, 8, 0, 8, 6, 0, 6], tex: 'slabs', scale: 1.5, angle: -30, border: 2, btex: 'kerb', radius: 0, tone: 1, toneAmt: 0.6, tint: '#402010' },
    { id: 2, pts: L_SHAPE, tex: 'grass', scale: 0.25, angle: 45, border: 0, btex: 'dirt', radius: 0, tone: 2, toneAmt: 0.2, tint: '#fff8e0' },
  ];
  const tuples = areas.map(toTuple);
  const back = fromTuples(JSON.parse(JSON.stringify(tuples)) as PaintTuple[]);
  assert.deepEqual(back, areas);
  const bad: PaintTuple[] = [tuples[0], ['pad', 1, 0, 0, 'kerb', BOWTIE], tuples[1]];
  const kept = fromTuples(bad);
  assert.deepEqual(kept.map(a => a.id), [1, 2]);
  assert.deepEqual(kept, areas);
});

test('save round trip: a grass-v1 texture (golfGreen) keeps its name through toTuple → JSON → fromTuples', () => {
  const area: PaintArea = { id: 1, pts: [0, 0, 6, 0, 6, 6, 0, 6], tex: 'golfGreen', scale: 2, angle: 15, border: 1, btex: 'lawnWorn', radius: 0, tone: 0, toneAmt: 0.35, tint: '#000000' };
  const back = fromTuples(JSON.parse(JSON.stringify([toTuple(area)])) as PaintTuple[]);
  assert.deepEqual(back, [area]);
});

test('edgeAngle: a first edge along +y is 90, along -y is -90, along +x is 0 (as clampStyle keeps them)', () => {
  assert.equal(edgeAngle([0, 0, 0, 3, 3, 3, 3, 0]), 90);
  assert.equal(edgeAngle([0, 3, 0, 0, 3, 0, 3, 3]), -90);
  assert.equal(edgeAngle([0, 0, 3, 0, 3, 3, 0, 3]), 0);
  assert.equal(clampStyle({ ...DEFAULT_STYLE, angle: edgeAngle([0, 0, 0, 3, 3, 3, 3, 0]) }).angle, 90);
});

test('roundCorners: a 10x10 square at r 2 stays in its box with the rounded area; r 0 returns the same corners', () => {
  const sq = [0, 0, 10, 0, 10, 10, 0, 10];
  const out = roundCorners(sq, 2);
  for (let k = 0; k < out.length; k += 2) {
    assert.ok(Number.isFinite(out[k]) && out[k]! >= -1e-9 && out[k]! <= 10 + 1e-9, `x ${out[k]}`);
    assert.ok(Number.isFinite(out[k + 1]) && out[k + 1]! >= -1e-9 && out[k + 1]! <= 10 + 1e-9, `y ${out[k + 1]}`);
  }
  assert.ok(Math.abs(polyArea(out) - (100 - (4 - Math.PI) * 4)) < 0.5, `area ${polyArea(out)}`);
  assert.deepEqual(roundCorners(sq, 0), sq);
});

test('roundCorners: a radius bigger than half an edge is clamped; the points stay finite and in the box', () => {
  const sq = [0, 0, 10, 0, 10, 10, 0, 10];
  const out = roundCorners(sq, 50);
  assert.ok(out.length >= 8);
  for (let k = 0; k < out.length; k += 2) {
    assert.ok(Number.isFinite(out[k]) && out[k]! >= -1e-9 && out[k]! <= 10 + 1e-9);
    assert.ok(Number.isFinite(out[k + 1]) && out[k + 1]! >= -1e-9 && out[k + 1]! <= 10 + 1e-9);
  }
});

test('radius: old 6-element tuples load sharp; toTuple/fromTuples round-trip a radius; clampStyle keeps it in [0, RADIUS_MAX]', () => {
  const old = fromTuples([['paving', 1, 0, 0, 'kerb', SQUARE]]);
  assert.equal(old[0]?.radius, 0);
  const area: PaintArea = { id: 1, pts: SQUARE.map(v => v * 3), tex: 'pad', scale: 1, angle: 0, border: 1, btex: 'kerb', radius: 3.5, tone: 0, toneAmt: 0.35, tint: '#000000' };
  const tuple = toTuple(area);
  assert.equal(tuple[6], 3.5);
  assert.deepEqual(fromTuples(JSON.parse(JSON.stringify([tuple])) as PaintTuple[]), [area]);
  assert.equal(clampStyle({ ...DEFAULT_STYLE, radius: 99 }).radius, RADIUS_MAX);
  assert.equal(clampStyle({ ...DEFAULT_STYLE, radius: -3 }).radius, 0);
});

test('tone: clampStyle clamps the tone to 0..2, the strength to 0..1; a valid tint is kept (lower case), a bad one is the default for the mode', () => {
  assert.equal(clampStyle({ ...DEFAULT_STYLE, tone: junk<0 | 1 | 2>(7) }).tone, 2);
  assert.equal(clampStyle({ ...DEFAULT_STYLE, tone: junk<0 | 1 | 2>(-1) }).tone, 0);
  assert.equal(clampStyle({ ...DEFAULT_STYLE, tone: junk<0 | 1 | 2>(1.4) }).tone, 1);
  assert.equal(clampStyle({ ...DEFAULT_STYLE, toneAmt: 3 }).toneAmt, 1);
  assert.equal(clampStyle({ ...DEFAULT_STYLE, toneAmt: -0.5 }).toneAmt, 0);
  assert.equal(clampStyle({ ...DEFAULT_STYLE, tint: '#AABBCC' }).tint, '#aabbcc');
  assert.equal(clampStyle({ ...DEFAULT_STYLE, tint: 'red' }).tint, '#000000');
  assert.equal(clampStyle({ ...DEFAULT_STYLE, tone: 2, tint: 'red' }).tint, '#ffffff');
});

test('tone: toTuple/fromTuples round-trip the tone, strength and tint; a 6- or 7-element tuple loads untoned', () => {
  const area: PaintArea = { id: 1, pts: SQUARE.map(v => v * 3), tex: 'grass', scale: 1, angle: 0, border: 0, btex: 'kerb', radius: 0, tone: 2, toneAmt: 0.6, tint: '#f0e0c0' };
  const tuple = toTuple(area);
  assert.deepEqual([tuple[7], tuple[8], tuple[9]], [2, 0.6, '#f0e0c0']);
  assert.deepEqual(fromTuples(JSON.parse(JSON.stringify([tuple])) as PaintTuple[]), [area]);
  const old6 = fromTuples([['paving', 1, 0, 0, 'kerb', SQUARE]]);
  assert.deepEqual([old6[0]?.tone, old6[0]?.toneAmt, old6[0]?.tint], [0, 0.35, '#000000']);
  const old7 = fromTuples([['paving', 1, 0, 0, 'kerb', SQUARE, 2]]);
  assert.deepEqual([old7[0]?.tone, old7[0]?.radius], [0, 2]);
});

test('tone: the ground patch carries the tone only when it is on', () => {
  const base: PaintArea = { id: 4, pts: SQUARE, tex: 'paving', scale: 1, angle: 0, border: 0, btex: 'kerb', radius: 0, tone: 0, toneAmt: 0.35, tint: '#000000' };
  assert.equal(PaintTool.patch(base).paint?.t, undefined);
  assert.deepEqual(PaintTool.patch({ ...base, tone: 1, toneAmt: 0.5, tint: '#101010' }).paint, { s: 1, a: 0, b: 0, bt: 'kerb', z: 4, t: 1, ta: 0.5, tc: '#101010' });
});

test('lotAsphalt (Car park asphalt): a valid fill and border texture, after Worn asphalt; it round-trips through toTuple and fromTuples', () => {
  const ids = PAINT_TEXES.map(t => t.id);
  assert.equal(ids[ids.indexOf('lotAsphalt') - 1], 'asphaltWorn');
  assert.equal(clampStyle({ ...DEFAULT_STYLE, tex: junk<PaintTex>('lotAsphalt') }).tex, 'lotAsphalt');
  assert.equal(clampStyle({ ...DEFAULT_STYLE, btex: junk<BorderTex>('lotAsphalt') }).btex, 'lotAsphalt');
  const area: PaintArea = { id: 1, pts: SQUARE.map(v => v * 4), tex: 'lotAsphalt', scale: 1.5, angle: 0, border: 1, btex: 'lotAsphalt', radius: 0, tone: 0, toneAmt: 0.35, tint: '#000000' };
  assert.deepEqual(fromTuples(JSON.parse(JSON.stringify([toTuple(area)])) as PaintTuple[]), [area]);
});

test('moveCorner: the corner moves to the point rounded to quarter tiles; the input is not changed', () => {
  const before = SQUARE.slice();
  assert.deepEqual(moveCorner(SQUARE, 2, 3.3, 2.6), [0, 0, 2, 0, 3.25, 2.5, 0, 2]);
  assert.deepEqual(SQUARE, before);
});

test('insertCorner: a corner on edge e takes index e+1; the last edge (back to corner 0) appends', () => {
  assert.deepEqual(insertCorner(SQUARE, 0, 1, 0), [0, 0, 1, 0, 2, 0, 2, 2, 0, 2]);
  assert.deepEqual(insertCorner(SQUARE, 1, 2, 1), [0, 0, 2, 0, 2, 1, 2, 2, 0, 2]);
  assert.deepEqual(insertCorner(SQUARE, 3, 0, 1), [0, 0, 2, 0, 2, 2, 0, 2, 0, 1]);
});

test('removeCorner: drops corner i; a triangle cannot lose a corner (null)', () => {
  assert.deepEqual(removeCorner(SQUARE, 1), [0, 0, 2, 2, 0, 2]);
  const tri = removeCorner(SQUARE, 0)!;
  assert.equal(tri.length, 6);
  assert.equal(removeCorner(tri, 0), null);
});

test('translatePts: every corner moves by the offset, rounded to quarter tiles', () => {
  assert.deepEqual(translatePts(SQUARE, 1, 0.5), [1, 0.5, 3, 0.5, 3, 2.5, 1, 2.5]);
  assert.deepEqual(translatePts(SQUARE, 0.1, 0), [0, 0, 2, 0, 2, 2, 0, 2]);
});

test('rotatePts: 90° about the centre turns the square onto itself; 0° keeps it; other angles stay on quarter tiles', () => {
  assert.deepEqual(rotatePts(SQUARE, 1, 1, 90), [2, 0, 2, 2, 0, 2, 0, 0]);
  assert.deepEqual(rotatePts(SQUARE, 1, 1, 0), SQUARE);
  const r = rotatePts(SQUARE, 1, 1, 30);
  assert.ok(r.every(v => Math.round(v * 4) === v * 4));
});

test('scalePts: scales about an anchor corner; a factor of 0.5 about the far corner halves the square', () => {
  assert.deepEqual(scalePts(SQUARE, 0, 0, 2, 2), [0, 0, 4, 0, 4, 4, 0, 4]);
  assert.deepEqual(scalePts(SQUARE, 2, 2, 0.5, 0.5), [1, 1, 2, 1, 2, 2, 1, 2]);
});

test('boxOf: the axis-aligned box of the corners; rounding keeps quarter tiles', () => {
  assert.deepEqual(boxOf(L_SHAPE), [0, 0, 4, 4]);
  assert.deepEqual(boxOf(moveCorner(SQUARE, 0, 0.3, -0.2)), [0, -0.25, 2, 2]);
});

/** a host for the tool: sends and toasts are recorded; a tile is 10 css px along each axis */
function toolHost() {
  const sent: unknown[] = [], toasts: string[] = [];
  const host = {
    setLotGround: (k: string, p: unknown) => { sent.push([k, p]); }, emit() {}, save() {}, toast: (t: string) => { toasts.push(t); },
    affine(o: number[]) { o[0] = 0; o[1] = 0; o[2] = 10; o[3] = 0; o[4] = 0; o[5] = 10; },
  };
  return { host, sent, toasts };
}

test('shape editing: a closed shape is selected; a corner drag moves it (snapped); a drag that crosses reverts and says why', () => {
  const { host, toasts } = toolHost();
  const tool = new PaintTool(host);
  tool.pts = [0, 0, 4, 0, 4, 4, 0, 4];
  tool.key({ key: 'Enter' } as KeyboardEvent);
  assert.equal(tool.selected, 1);
  tool.pointerDown({ x: 4, y: 0 }, 40, 0);
  tool.pointerMove({ x: 3.4, y: 0.2 }, 34, 2);
  tool.pointerUp(1);
  assert.deepEqual(tool.areas[0]!.pts, [0, 0, 3, 0, 4, 4, 0, 4]);
  tool.pointerDown({ x: 4, y: 4 }, 40, 40);
  tool.pointerMove({ x: 0, y: 0 }, 0, 0);
  tool.pointerUp(1);
  assert.deepEqual(tool.areas[0]!.pts, [0, 0, 3, 0, 4, 4, 0, 4]);
  assert.equal(toasts.length, 1);
});

test('shape editing: a right press on a corner removes it, a triangle keeps its 3 corners; empty ground is not a corner', () => {
  const { host, toasts } = toolHost();
  const tool = new PaintTool(host);
  tool.pts = [0, 0, 4, 0, 4, 4, 0, 4];
  tool.key({ key: 'Enter' } as KeyboardEvent);
  assert.equal(tool.secondary({ x: 4, y: 0 }, 40, 0), true);
  assert.deepEqual(tool.areas[0]!.pts, [0, 0, 4, 4, 0, 4]);
  assert.equal(tool.secondary({ x: 4, y: 4 }, 40, 40), true);
  assert.deepEqual(tool.areas[0]!.pts, [0, 0, 4, 4, 0, 4]);
  assert.deepEqual(toasts, ['An area needs 3 corners']);
  assert.equal(tool.secondary({ x: 20, y: 20 }, 200, 200), false);
});

const GOLF_NEW: PaintTex[] = ['golfFringe', 'golfTee', 'golfFirstCut', 'golfFescue', 'bunkerSand', 'wasteSand', 'pineStraw', 'barkMulch', 'spectatorPath', 'woodChips'];
test('the photo Paint textures: the new golf and sand ids follow Rough, are valid fill and border textures, round-trip, and are photos', () => {
  const ids = PAINT_TEXES.map(t => t.id);
  assert.equal(ids.indexOf('golfFringe'), ids.indexOf('golfRough') + 1);
  for (const id of GOLF_NEW) {
    assert.equal(clampStyle({ ...DEFAULT_STYLE, tex: id }).tex, id, id);
    assert.equal(clampStyle({ ...DEFAULT_STYLE, btex: id }).btex, id, id);
    const area: PaintArea = { id: 1, pts: SQUARE.map(v => v * 4), tex: id, scale: 1.5, angle: 0, border: 1, btex: id, radius: 0, tone: 0, toneAmt: 0.35, tint: '#000000' };
    assert.deepEqual(fromTuples(JSON.parse(JSON.stringify([toTuple(area)])) as PaintTuple[]), [area], id);
    assert.ok(PHOTO_TEX.some(p => p.tex === id), `${id} has a photo`);
  }
  for (const p of PHOTO_TEX) assert.ok(ids.includes(p.tex as PaintTex), `${p.tex} is a Paint texture`);
});

test('photoPeriod: a mixed photo repeats over the mixed period; a plain tile over its own tiles (field: 4), or the mixed period when it has none', () => {
  assert.equal(photoPeriod({ mix: 4 }, 12), 12);
  assert.equal(photoPeriod({ mix: 0, tiles: 4 }, 12), 4);
  assert.equal(photoPeriod({ mix: 0 }, 12), 12);
  assert.equal(photoPeriod(PHOTO_TEX.find(p => p.tex === 'field')!, 12), 4);
  assert.equal(photoPeriod(PHOTO_TEX.find(p => p.tex === 'golfFairway')!, 12), 12);
});
