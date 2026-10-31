import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { activeBunkerStages, nativeBunkerCourse } from '../src/game/ext/bunker-look/stage-ownership';
import { BunkerStageRegistry } from '../src/game/ext/bunker-look/stage-registry';
import type { BunkerStageReady, BunkerStageRef } from '../src/game/ext/bunker-look/stage-types';
import type { CourseLayer, CoursePatch, CourseRim, CourseWall } from '../src/game/ground-protocol';

const square = (x: number, size = 4) => Float32Array.from([x, 1, x + size, 1, x + size, 5, x, 5]);
const edges = (q: Float32Array) => Float32Array.from([...q, q[0], q[1]]);
const ref = (id: string, x: number): BunkerStageRef => ({ id, key: id + ':v1', ringsTiles: [Float64Array.from(square(x))], sourcePatchKeys: ['cg:0:0'], dirtyBoundsTiles: [-20, -20, 80, 80] });
const layer = (s: number, fill: Float32Array[]): CourseLayer => ({ s, tex: s === 6 ? 'bunkerSand' : 'golfGreen', sc: 1, a: 0, e: s === 6 ? 'sunken' : 'raised', fill, edges: fill.map(edges), soft: [], joint: [] });
function course(shared = false): CoursePatch {
  const sand = layer(6, [square(1), square(10), square(40)]);
  sand.collar = { n: 'lip', tex: 'golfRough', sc: 1, a: 0, w: shared ? 1 : 0, fill: shared ? [Float32Array.from([0, 0, 16, 0, 16, 6, 0, 6]), Float32Array.from([39, 0, 45, 0, 45, 6, 39, 6])] : [], edges: [], soft: [] };
  const wall = (x: number, extra: Partial<CourseWall> = {}): CourseWall => ({ p: Float32Array.from([x, 1, 0.6, x + 4, 1, 0.6]), lo: 12, m: 1, hs: 1, ...extra });
  const rim = (x: number, hi: number): CourseRim => ({ p: Float32Array.from([x, 1, x + 4, 1]), hi });
  return { cx: 0, cy: 0, size: 64, layers: [sand, layer(8, [square(50)])],
    walls: [wall(1), wall(1, { hs: 5 }), wall(10), wall(50, { lo: 16, m: 0 }), wall(55, { lo: 6, m: 2 })],
    rims: [rim(1, 2), rim(10, 14), rim(50, 16)], z: 0 };
}
function ready(reference: BunkerStageRef) {
  const image = { width: 10, height: 24, closes: 0, close() { this.closes++; } };
  const sprite: BunkerStageReady = { ...reference, image: image as unknown as ImageBitmap, width: 10, height: 24, renderWidth: 10, renderHeight: 8, boundsWorldPx: [0, 0, 200, 120], rasterScale: 0.05 };
  return { image, sprite };
}

test('native stage replacement removes only the ready feature and preserves tee rock input and unrelated walls/rims', () => {
  const source = course(), a = ref('a', 1), b = ref('b', 10), c = ref('c', 40);
  const value = nativeBunkerCourse(source, [a, b, c], new Set(['a']));
  assert.equal(source.layers[0].fill.length, 3); assert.equal(value.course.layers[0].fill.length, 2);
  assert.equal(value.course.layers[1], source.layers[1], 'the neighbouring green retains its original data');
  assert.equal(value.course.walls?.length, 3); assert.equal(value.teeSand.length, 1); assert.equal(value.teeSand[0].hs, 5);
  assert.equal(value.course.walls?.[1], source.walls?.[3]); assert.equal(value.course.walls?.[2], source.walls?.[4]);
  assert.deepEqual(value.course.rims?.map(r => r.hi), [14, 16], 'the owned rim is removed even when its hi belongs to a higher neighbour');
  assert.equal(value.course.rims?.[1], source.rims?.[2]);
});

test('shared collar readiness and eviction affect that local group without coupling an unrelated bunker', () => {
  const source = course(true), refs = [ref('a', 1), ref('b', 10), ref('c', 40)], current = new Map([['a', refs[0].key], ['c', refs[2].key]]);
  assert.deepEqual([...activeBunkerStages([source], refs, current)], ['c']);
  current.set('b', refs[1].key); assert.deepEqual([...activeBunkerStages([source], refs, current)].sort(), ['a', 'b', 'c']);
  current.delete('b'); assert.deepEqual([...activeBunkerStages([source], refs, current)], ['c']);
});

test('worker registry rejects stale images, restores local native fallback on eviction, and closes every owned copy', () => {
  const source = course(true), a = ref('a', 1), b = ref('b', 10), registry = new BunkerStageRegistry();
  registry.setCourses([['cg:0:0', source]], []); registry.expect([a, b], []);
  const first = ready(a), second = ready(b), stale = ready({ ...a, key: 'old' });
  registry.install([first.sprite, stale.sprite], []); assert.equal(stale.image.closes, 1); assert.equal(registry.stats.active, 0);
  registry.install([second.sprite], []); assert.equal(registry.stats.active, 2); assert.equal(registry.nativeCourse(source).course.layers[0].fill.length, 1);
  registry.install([], [{ id: 'b', key: b.key }]); assert.equal(second.image.closes, 1); assert.equal(registry.stats.active, 0);
  assert.equal(registry.nativeCourse(source).course, source);
  registry.dispose(); assert.equal(first.image.closes, 1);
});

test('an edited bunker keeps its previous picture until the re-bake lands; a failed re-bake falls back to native', () => {
  const a = ref('a', 1), registry = new BunkerStageRegistry(), source = course(), first = ready(a);
  registry.setCourses([['cg:0:0', source]], []); registry.expect([a], []); registry.install([first.sprite], []);
  assert.equal(registry.stats.active, 1);
  const edited = { ...a, key: 'new' };
  registry.expect([edited], []); assert.equal(first.image.closes, 0); assert.equal(registry.stats.active, 1);
  assert.equal(registry.nativeCourse(source).course.layers[0].fill.length, 2, 'the held picture still replaces its native bunker');
  const next = ready(edited); registry.install([next.sprite], []); assert.equal(first.image.closes, 1); assert.equal(registry.stats.active, 1);
  registry.expect([{ ...a, key: 'newer' }], []); assert.equal(next.image.closes, 0);
  registry.install([], [{ id: 'a', key: 'newer' }]); assert.equal(next.image.closes, 1); assert.equal(registry.stats.active, 0); assert.equal(registry.stats.bytes, 0);
  assert.equal(registry.nativeCourse(source).course, source);
  registry.dispose(); assert.equal(first.image.closes, 1); assert.equal(next.image.closes, 1);
});

const originalPath = globalThis.Path2D;
before(() => { globalThis.Path2D = class { moveTo() {} lineTo() {} closePath() {} rect() {} } as unknown as typeof Path2D; });
after(() => { globalThis.Path2D = originalPath; });
test('only explicit floor12/wall12/lip13 source rows draw, each once, with context and chunk seams preserved', () => {
  const a = ref('a', 1), registry = new BunkerStageRegistry(), source = course(), image = ready(a);
  registry.setCourses([['cg:0:0', source]], []); registry.expect([a], []); registry.install([image.sprite], []);
  const calls: unknown[][] = [], ctx = { canvas: { width: 1000, height: 1000 }, save() {}, restore() {}, setTransform() {}, clip() {}, drawImage: (...args: unknown[]) => calls.push(args) } as unknown as CanvasRenderingContext2D;
  for (const stage of ['floor', 'wall', 'lip'] as const) registry.draw(ctx, stage, [0, 0, 64, 64], 0.3, 20, 10, [source]);
  assert.deepEqual(calls.map(call => call.slice(1, 5)), [[0, 0, 10, 8], [0, 8, 10, 8], [0, 16, 10, 8]]);
  assert.ok(calls.every(call => JSON.stringify(call.slice(5)) === JSON.stringify([-6, -3, 60, 36])));
  calls.length = 0; registry.draw(ctx, 'floor', [0, 0, 64, 64], 0.3, 120, 10, [source]);
  assert.deepEqual(calls[0].slice(5), [-36, -3, 60, 36], 'neighbouring chunks use the same world-projected raster instead of rebaking clipped pieces');
  registry.dispose();
});
