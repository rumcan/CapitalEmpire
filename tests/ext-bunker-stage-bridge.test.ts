import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BunkerStageBridge, BUNKER_STAGE_CACHE_BYTES } from '../src/game/ext/bunker-look/stage-bridge';
import { clampBunkerSettings } from '../src/game/ext/bunker-look/settings';
import type { BunkerStageInput, BunkerStageReady, BunkerStageRequest, BunkerStageSprite } from '../src/game/ext/bunker-look/stage-types';

const input = (id = 'a', x = 10): BunkerStageInput => ({ id, revision: 'drawn-rugged-v1', ringsTiles: [Float64Array.from([x, 10, x + 8, 10, x + 8, 16, x, 16])], settings: clampBunkerSettings(undefined), sourcePatchKeys: ['cg:0:0'] });
function bitmap(width = 512, height = 1536) { return { width, height, closed: 0, close() { this.closed++; } }; }
function sprite(request: BunkerStageRequest, image = bitmap()): BunkerStageSprite {
  return { key: request.key, image: image as unknown as ImageBitmap, width: image.width, height: image.height, renderWidth: image.width, renderHeight: image.height / 3,
    stagePixels: [100, 100, 100], anchor: { x: 0, y: 0 }, boundsWorldPx: [0, 0, 1000, 800], dirtyBoundsTiles: request.dirtyBoundsTiles,
    rasterScale: 0.5, projection: request.projection, worldOriginTiles: request.guide.originTiles, geometryMode: 'authoritative-rings', decodedBytes: image.width * image.height * 4, bakeMs: 1, premultipliedAlpha: true };
}
const flush = async () => { await new Promise<void>(done => setImmediate(done)); };

test('stage bridge uses a literal32MiB source budget that accounts for the entire three-stage atlas and closes LRU clones', async () => {
  const originals: ReturnType<typeof bitmap>[] = [], consumers = new Map<string, BunkerStageReady>();
  const bridge = new BunkerStageBridge({ bake: async request => { const image = bitmap(); originals.push(image); return sprite(request, image); },
    cloneImage: async image => bitmap(image.width, image.height) as unknown as ImageBitmap, expected() {}, ready: value => { consumers.set(value.id, value); },
    drop: (id, key) => { const old = consumers.get(id); if (old?.key === key) { old.image.close(); consumers.delete(id); } } });
  bridge.sync(Array.from({ length: 11 }, (_, i) => input('b' + i, i * 12 + 10))); await flush();
  assert.equal(BUNKER_STAGE_CACHE_BYTES, 32 * 1024 * 1024); assert.equal(bridge.stats.maxSourceBytes, BUNKER_STAGE_CACHE_BYTES);
  assert.equal(bridge.stats.bytes, 30 * 1024 * 1024); assert.equal(bridge.stats.entries, 10); assert.equal(bridge.stats.evictions, 1);
  assert.equal(originals[0].closed, 1); assert.ok(bridge.stats.bytes <= BUNKER_STAGE_CACHE_BYTES);
  const mirroredBytes = [...consumers.values()].reduce((sum, value) => sum + value.width * value.height * 4, 0);
  assert.ok(mirroredBytes <= BUNKER_STAGE_CACHE_BYTES, 'consumer copies have their own same-set32MiB ceiling');
  bridge.dispose(); assert.equal(consumers.size, 0); assert.ok(originals.every(image => image.closed === 1));
});

test('expected keys precede pixels; immutable geometry/profile snapshots coalesce and supersede old work', async () => {
  const jobs: { request: BunkerStageRequest; resolve(value: BunkerStageSprite): void }[] = [], events: string[] = [], published: BunkerStageReady[] = [];
  const bridge = new BunkerStageBridge({ bake: request => new Promise(resolve => jobs.push({ request, resolve })), cloneImage: async () => bitmap() as unknown as ImageBitmap,
    expected: set => { events.push(...set.map(ref => 'expected:' + ref.key)); }, ready: value => { events.push('ready:' + value.key); published.push(value); }, drop() {} });
  const first = input(); bridge.sync([first]); bridge.sync([first]); assert.equal(jobs.length, 1);
  const changed = { ...input(), settings: clampBunkerSettings({ depth: 0.5, wall: 0.2 }) }; bridge.sync([changed]);
  const old = bitmap(); jobs[0].resolve(sprite(jobs[0].request, old)); await flush(); assert.equal(old.closed, 1); assert.equal(jobs.length, 2);
  jobs[1].resolve(sprite(jobs[1].request)); await flush();
  assert.equal(published.length, 1); assert.equal(published[0].key, jobs[1].request.key); assert.equal(bridge.isCurrent('a', jobs[0].request.key), false);
  assert.equal(jobs[1].request.appearance.depth, 0.5); assert.deepEqual(Array.from(jobs[1].request.ringsTiles[0]), Array.from(first.ringsTiles[0]));
  assert.ok(events.indexOf('expected:' + published[0].key) < events.indexOf('ready:' + published[0].key));
  bridge.sync([changed]); await flush(); assert.equal(jobs.length, 2, 'unchanged sync/camera reads never dispatch another bake');
  bridge.dispose(); published.forEach(value => value.image.close());
});

test('removal during asynchronous clone closes late pixels and a failed stage never disables native fallback', async () => {
  let finishClone!: (image: ImageBitmap) => void;
  const original = bitmap(), late = bitmap(), published: BunkerStageReady[] = [], drops: string[] = [];
  const bridge = new BunkerStageBridge({ bake: async request => sprite(request, original), cloneImage: () => new Promise(resolve => { finishClone = resolve; }),
    expected() {}, ready: value => { published.push(value); }, drop: id => { drops.push(id); } });
  bridge.sync([input()]); await flush(); bridge.sync([]); finishClone(late as unknown as ImageBitmap); await flush();
  assert.equal(original.closed, 1); assert.equal(late.closed, 1); assert.equal(published.length, 0); assert.ok(drops.includes('a')); bridge.dispose();
  const errors: unknown[] = [], failed = new BunkerStageBridge({ bake: async () => { throw new Error('GPU unavailable'); }, expected() {}, ready() { assert.fail('Failed bake must keep native fallback'); }, drop() {}, error: error => errors.push(error) });
  failed.sync([input()]); await flush(); assert.equal(failed.stats.ready, 0); assert.equal(failed.stats.errors, 1); assert.equal(errors.length, 1); failed.dispose();
});

test('metadata-only source updates and verified contour suspension reuse source pixels without another GPU bake', async () => {
  const requests: BunkerStageRequest[] = [], expected: string[][] = [], ready: BunkerStageReady[] = [];
  const bridge = new BunkerStageBridge({ bake: async request => { requests.push(request); return sprite(request); }, cloneImage: async () => bitmap() as unknown as ImageBitmap,
    expected: set => expected.push(set.flatMap(ref => ref.sourcePatchKeys)), ready: value => { ready.push(value); }, drop() {} });
  const first = input(); bridge.sync([first]); await flush();
  bridge.sync([{ ...first, sourcePatchKeys: ['cg:0:0', 'cg:1:0'] }]); await flush();
  assert.equal(requests.length, 1); assert.deepEqual(expected[expected.length - 1], ['cg:0:0', 'cg:1:0']);
  bridge.suspend(); assert.equal(bridge.isCurrent('a', ready[0].key), false); assert.equal(bridge.stats.entries, 1);
  bridge.sync([{ ...first, sourcePatchKeys: ['cg:0:0', 'cg:1:0'] }]); await flush();
  assert.equal(requests.length, 1, 'month/look re-contours do not recompute unchanged distance fields');
  assert.equal(ready.length, 2); assert.deepEqual(ready[1].sourcePatchKeys, ['cg:0:0', 'cg:1:0']);
  bridge.dispose(); ready.forEach(value => value.image.close());
});

test('a texture swap is a new bake key and carries the slot pictures to the worker', async () => {
  const jobs: BunkerStageRequest[] = [];
  const bridge = new BunkerStageBridge({ bake: async request => { jobs.push(request); return sprite(request); },
    cloneImage: async () => bitmap() as unknown as ImageBitmap, expected() {}, ready: value => value.image.close(), drop() {} });
  bridge.sync([input()]); await flush();
  assert.equal(jobs[0].materials.sand.id, 'bunker:sand');
  bridge.sync([{ ...input(), settings: clampBunkerSettings({ sandTex: 'bunker:wall-earth' }) }]); await flush();
  assert.equal(jobs.length, 2);
  assert.notEqual(jobs[1].key, jobs[0].key);
  assert.equal(jobs[1].materials.sand.id, 'bunker:wall-earth');
  bridge.sync([{ ...input(), settings: clampBunkerSettings({ sandTex: 'bunker:wall-earth', sandScale: 2 }) }]); await flush();
  assert.notEqual(jobs[2].key, jobs[1].key, 'a scale change re-bakes too');
  bridge.dispose();
});
