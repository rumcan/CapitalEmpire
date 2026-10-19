// Headless tests for the Paint tool's data model: npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_STYLE, areaAt, checkArea, clampStyle, crossings, edgeAngle, fromTuples, insidePoly, polyArea, simplify, snapPt, toTuple,
  type BorderSize, type BorderTex, type PaintArea, type PaintTex, type PaintTuple,
} from '../src/game/paint';

const SQUARE = [0, 0, 2, 0, 2, 2, 0, 2];
const BOWTIE = [0, 0, 10, 10, 10, 0, 0, 10];
const L_SHAPE = [0, 0, 4, 0, 4, 2, 2, 2, 2, 4, 0, 4];
const HEX = [1, 0, 0.5, 0.866, -0.5, 0.866, -1, 0, -0.5, -0.866, 0.5, -0.866].map(v => v + 10);
/** a value the save or a panel could hand over that the types would not allow (for the clamp tests) */
const junk = <T>(v: unknown) => v as T;

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
    { id: 1, pts: [0, 0, 8, 0, 8, 6, 0, 6], tex: 'slabs', scale: 1.5, angle: -30, border: 2, btex: 'kerb' },
    { id: 2, pts: L_SHAPE, tex: 'grass', scale: 0.25, angle: 45, border: 0, btex: 'dirt' },
  ];
  const tuples = areas.map(toTuple);
  const back = fromTuples(JSON.parse(JSON.stringify(tuples)) as PaintTuple[]);
  assert.deepEqual(back, areas);
  const bad: PaintTuple[] = [tuples[0], ['pad', 1, 0, 0, 'kerb', BOWTIE], tuples[1]];
  const kept = fromTuples(bad);
  assert.deepEqual(kept.map(a => a.id), [1, 2]);
  assert.deepEqual(kept, areas);
});

test('edgeAngle: a first edge along +y is 90, along -y is -90, along +x is 0 (as clampStyle keeps them)', () => {
  assert.equal(edgeAngle([0, 0, 0, 3, 3, 3, 3, 0]), 90);
  assert.equal(edgeAngle([0, 3, 0, 0, 3, 0, 3, 3]), -90);
  assert.equal(edgeAngle([0, 0, 3, 0, 3, 3, 0, 3]), 0);
  assert.equal(clampStyle({ ...DEFAULT_STYLE, angle: edgeAngle([0, 0, 0, 3, 3, 3, 3, 0]) }).angle, 90);
});
