// #1174: a map size per save, and a map that grows to fit a placed course. The size is picked once per page (mapsize.ts, iso.ts); a save of another size reloads the page into
// it (save.ts adoptMapSize); the grown terrain (terrain/grow.ts) keeps the old map where it was; a pose off the east or south edge is offered the grow (golf/osm/placer.ts growPlan).
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MAP, MAP_MAX, MAP_POINTER_KEY, growSizeFor, pickMapSize, validMapSize, workerNameFor } from '../src/game/mapsize';
import { MAP, MAP_FIXED } from '../src/game/iso';
import { SAVE_VERSION, gzip, importSaveBytes, readSave, setSaveStore, upgradeSave, writeSave, type SaveStore, type SaveV5 } from '../src/game/save';
import { TC, HSTEP, type Terrain } from '../src/game/terrain/types';
import { RING_BLEND, applyGrown, extendHighway, movedHighway, packGrown } from '../src/game/terrain/grow';
import { RealPlacer, growPlan, type RealHost } from '../src/game/golf/osm/placer';
import { PLACE_EDGE, mapKm, placeLabel, popupText, type PlaceWorld } from '../src/game/golf/osm/place';
import { compensation } from '../src/game/budget';
import { rotateSpec } from '../src/game/golf/osm/rotate';
import { loadOsmSpec } from '../src/game/golf/osm';

describe('the map size is one per page, picked from the page, a worker or the pointer', () => {
  it('a new game is 4 km, and only whole 512-tile steps from 512 to 4096 are sizes', () => {
    assert.equal(DEFAULT_MAP, 2048);
    assert.equal(MAP, 2048); // (no pointer, no address, no CE_MAP in the tests)
    assert.equal(MAP_FIXED, false);
    for (const n of [512, 1024, 1536, 2048, 3072, 4096]) assert.equal(validMapSize(n), true, String(n));
    for (const n of [0, 256, 1000, 2049, 4608, -1024, NaN, Infinity, '1024', null, undefined]) assert.equal(validMapSize(n), false, String(n));
    assert.deepEqual(pickMapSize({}), { size: 2048, fixed: false });
  });
  it('the order: a worker’s name, the address, the environment, then the pointer; a bad value falls through', () => {
    assert.deepEqual(pickMapSize({ workerName: workerNameFor(1024), query: '?map=3072', stored: '2560' }), { size: 1024, fixed: true });
    assert.deepEqual(pickMapSize({ query: '?x=1&map=3072', stored: '2560' }), { size: 3072, fixed: true });
    assert.deepEqual(pickMapSize({ env: '1024', stored: '2560' }), { size: 1024, fixed: true });
    assert.deepEqual(pickMapSize({ stored: '2560' }), { size: 2560, fixed: false }); // the pointer: a save may move it
    assert.deepEqual(pickMapSize({ workerName: 'map=999', query: '?map=abc', env: 'x', stored: '12' }), { size: 2048, fixed: false });
    assert.deepEqual(pickMapSize({ workerName: '', query: '?remap=1024' }), { size: 2048, fixed: false }); // (not a key that merely ends in map)
    assert.equal(workerNameFor(1536), 'map=1536');
  });
  it('the size to grow to: the next 512 step that holds the far edge and the margin, never more than 4096, null when it already fits', () => {
    assert.equal(growSizeFor(2100, 4, 2048), 2560);
    assert.equal(growSizeFor(2556, 4, 2048), 2560);
    assert.equal(growSizeFor(2557, 4, 2048), 3072);
    assert.equal(growSizeFor(4092, 4, 2048), 4096);
    assert.equal(growSizeFor(4093, 4, 2048), null);
    assert.equal(growSizeFor(2044, 4, 2048), null);
    assert.equal(growSizeFor(NaN, 4, 2048), null);
    assert.equal(MAP_MAX, 4096);
  });
});

/** a browser-like storage for the tests (the real one is the page’s) */
function fakeStorage() { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); } }; }
function memStore(): SaveStore & { m: Map<string, ArrayBuffer> } {
  const m = new Map<string, ArrayBuffer>();
  return { m, get: async k => m.get(k), put: async (k, v) => { m.set(k, v); }, del: async k => { m.delete(k); }, keys: async () => [...m.keys()] };
}
const base = (map: number, extra: Partial<SaveV5> = {}): SaveV5 => ({ version: SAVE_VERSION, map, seed: 7, segs: [[10, 20, 30, 40, 'street', 0]], nodes: [], props: [], money: 900, day: 3, ...extra });

describe('a save keeps its own map size', () => {
  let local: ReturnType<typeof fakeStorage>, session: ReturnType<typeof fakeStorage>, store: ReturnType<typeof memStore>;
  beforeEach(() => {
    local = fakeStorage(); session = fakeStorage(); store = memStore();
    Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true });
    Object.defineProperty(globalThis, 'sessionStorage', { value: session, configurable: true });
    setSaveStore(store);
  });
  afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; delete (globalThis as { sessionStorage?: unknown }).sessionStorage; });

  it('a save of this page’s size loads; writing a save moves the pointer to its size', async () => {
    await writeSave(base(MAP));
    assert.equal(local.m.get(MAP_POINTER_KEY), String(MAP));
    const r = await readSave();
    assert.equal(r.status, 'ok');
    assert.equal(r.save?.map, MAP);
  });
  it('an old 2 km save (map 1024) is not sent to backup: it asks the page to reload into 1024, the slot untouched', async () => {
    await writeSave(base(1024));
    local.m.delete(MAP_POINTER_KEY); // (a page that started from the default pointer)
    const before = [...store.m.keys()];
    const r = await readSave();
    assert.equal(r.status, 'resize');
    assert.equal(r.map, 1024);
    assert.equal(local.m.get(MAP_POINTER_KEY), '1024'); // the next load of the page runs at 1024, where the save reads as ok
    assert.deepEqual([...store.m.keys()], before); // nothing was moved to a backup slot
    assert.equal(r.save, null);
  });
  it('a save that still does not match after the page reloaded into its size once is the old backup (no reload loop), and so is a size the game cannot run', async () => {
    await writeSave(base(1024)); local.m.delete(MAP_POINTER_KEY);
    assert.equal((await readSave()).status, 'resize');
    const again = await readSave(); // the same tab, the page did not take the pointer (e.g. ?map=)
    assert.equal(again.status, 'otherMap');
    assert.ok(again.backup && again.backedUp);
    await writeSave(base(3000)); session.m.clear();
    const bad = await readSave();
    assert.equal(bad.status, 'otherMap');
  });
  it('a save file of another size imports, moves the pointer to its size, and refuses a size the game cannot run', async () => {
    const ok = await importSaveBytes(await gzip(JSON.stringify(base(1536))));
    assert.deepEqual({ ok: ok.ok }, { ok: true });
    assert.equal(local.m.get(MAP_POINTER_KEY), '1536');
    const bad = await importSaveBytes(await gzip(JSON.stringify(base(1500))));
    assert.equal(bad.ok, false);
    assert.match(bad.why ?? '', /cannot run/);
  });
  it('upgradeSave reads a save at its own size only', () => {
    assert.equal(upgradeSave(base(1024)), null); // this page is 2048
    assert.equal(upgradeSave(base(1024), 1024)?.map, 1024);
    assert.equal(upgradeSave({ ...base(1024), version: 4 }, 1024)?.map, 1024); // (a v4 save migrates at its own size)
  });
});

/** a small terrain of `side` tiles for the grow tests: classes by a function of the tile, heights by a function of the sample (metres) */
function terrain(side: number, cls: (x: number, y: number) => number, h: (i: number, j: number) => number): Terrain {
  const hs = side / HSTEP, c = new Uint8Array(side * side), height = new Float32Array(hs * hs);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) c[y * side + x] = cls(x, y);
  for (let j = 0; j < hs; j++) for (let i = 0; i < hs; i++) height[j * hs + i] = h(i, j);
  return { seed: 7, attempt: 1, height, cls: c, waters: [{ kind: 'river', pts: [{ x: 0, y: 40, w: 4 }, { x: side - 1, y: 40, w: 4 }] }], mountainEdges: ['N'], highway: { x: side - 1, y: 30, edge: 'E' }, start: { x: 8, y: 8, size: 64 }, towns: [{ x: 16, y: 16, size: 64 }], chokepoints: [], model: 2 };
}

describe('the terrain of a grown map (terrain/grow.ts)', () => {
  const M = 128, N = 256;
  const old = terrain(M, (x, y) => (y >= 38 && y <= 42 ? TC.WATER : x > 100 && y < 20 ? TC.HILL : TC.GROUND), (i, j) => 10 + 0.25 * i + 0.5 * j);
  // the valley generated at the new size knows nothing of the old one: its own river elsewhere and its own heights
  const gen = () => terrain(N, (x, y) => (x >= 150 && x <= 154 ? TC.WATER : y > 200 ? TC.PATCH : TC.GROUND), () => 100);

  it('packs the old terrain, with the classes as runs and the heights in centimetres, and it survives JSON', () => {
    const g = packGrown(old, M);
    assert.equal(g.from, M);
    assert.equal(g.height.length, (M / HSTEP) ** 2);
    assert.ok(g.cls.length < M * M / 8, 'the classes are runs');
    const back = JSON.parse(JSON.stringify(g)) as typeof g;
    assert.deepEqual(back, g);
  });
  it('puts the old map back exactly where it was: every class, every height, the map data', () => {
    const g = JSON.parse(JSON.stringify(packGrown(old, M)));
    const t = applyGrown(gen(), g, N);
    for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) assert.equal(t.cls[y * N + x], old.cls[y * M + x], `${x},${y}`);
    const hm = M / HSTEP, hn = N / HSTEP;
    for (let j = 0; j < hm; j++) for (let i = 0; i < hm; i++) assert.ok(Math.abs(t.height[j * hn + i]! - old.height[j * hm + i]!) < 0.006, `${i},${j}`);
    assert.deepEqual(t.waters, old.waters);
    assert.deepEqual(t.towns, old.towns);
    assert.deepEqual(t.start, old.start);
    assert.equal(t.model, 2);
    assert.equal(t.cls.length, N * N);
    assert.equal(t.height.length, (N / HSTEP) ** 2);
  });
  it('the river that reached the old edge goes straight on to the new one; the new valley’s own water in the ring is left out', () => {
    const t = applyGrown(gen(), packGrown(old, M), N);
    for (let x = M; x < N; x++) for (let y = 38; y <= 42; y++) assert.equal(t.cls[y * N + x], TC.WATER, `${x},${y}`);
    for (let y = M; y < N; y++) for (let x = 150; x <= 154; x++) assert.notEqual(t.cls[y * N + x], TC.WATER, `the new valley’s river at ${x},${y}`);
    // south of the old map the ring is the new valley’s ground (its patches kept)
    assert.equal(t.cls[230 * N + 20], TC.PATCH);
    assert.equal(t.cls[M * N + 20], TC.GROUND);
  });
  it('the heights meet the old edge’s and blend into the new valley’s over RING_BLEND tiles', () => {
    const t = applyGrown(gen(), packGrown(old, M), N), hm = M / HSTEP, hn = N / HSTEP;
    const edge = old.height[3 * hm + (hm - 1)]!;
    assert.ok(Math.abs(t.height[3 * hn + hm - 1]! - edge) < 0.006);
    const next = t.height[3 * hn + hm]!; // the first new sample: a step of 8 tiles into the blend
    assert.ok(Math.abs(next - edge) < Math.abs(100 - edge), 'still near the old edge');
    const far = Math.ceil(RING_BLEND / HSTEP) + 1;
    assert.equal(t.height[3 * hn + hm - 1 + far]!, 100); // past the blend: the new valley’s own
    for (const v of t.height) assert.ok(Number.isFinite(v));
  });
  it('the highway on the east or south edge moves out to the new edge, the north and west ones stay; the county road is carried out to it', () => {
    assert.deepEqual(movedHighway({ x: M - 1, y: 30, edge: 'E' }, N), { x: N - 1, y: 30, edge: 'E' });
    assert.deepEqual(movedHighway({ x: 50, y: M - 1, edge: 'S' }, N), { x: 50, y: N - 1, edge: 'S' });
    assert.deepEqual(movedHighway({ x: 50, y: 0, edge: 'N' }, N), { x: 50, y: 0, edge: 'N' });
    assert.equal(applyGrown(gen(), packGrown(old, M), N).highway.x, N - 1);
    const segs: SaveV5['segs'] = [[10, 30, 60, 30, 'street', 0], [60, 30, M - 1, 30, 'road', 2, 0, 1]];
    const ext = extendHighway(segs, { x: M - 1, y: 30, edge: 'E' }, N);
    assert.ok(ext.length >= 1);
    assert.deepEqual([ext[0]![0], ext[0]![1]], [M - 1, 30]); // from the old entry
    assert.deepEqual([ext.at(-1)![2], ext.at(-1)![3]], [N - 1, 30]); // to the new edge
    for (let i = 0; i + 1 < ext.length; i++) assert.deepEqual([ext[i]![2], ext[i]![3]], [ext[i + 1]![0], ext[i + 1]![1]]); // joined end to end
    for (const s of ext) { assert.equal(s[4], 'road'); assert.equal(s[5], 2); assert.equal(s[6], 0); assert.equal(s[7], 1); assert.ok(Math.hypot(s[2] - s[0], s[3] - s[1]) <= 128); }
    const south = extendHighway([[40, 10, 40, M - 1, 'road', 0, 0]], { x: 40, y: M - 1, edge: 'S' }, N);
    assert.deepEqual([south.at(-1)![2], south.at(-1)![3]], [40, N - 1]);
    assert.deepEqual(extendHighway(segs, { x: 5, y: 0, edge: 'N' }, N), []);
    assert.deepEqual(extendHighway([], { x: M - 1, y: 30, edge: 'E' }, N), []); // no road reaches it
  });
  it('a terrain that does not grow (same size, bad sizes) is handed back as it came', () => {
    const g = packGrown(old, M), t = gen();
    assert.equal(applyGrown(t, g, M), t);
    assert.equal(applyGrown(t, { ...g, from: 100 }, N), t);
  });
});

/** a made-up world for the planner: an empty plain on a map of `map` tiles */
function world(map: number): PlaceWorld {
  return {
    map, owned: [], river: () => false, lots: [], farms: [], segs: [], pop: 0, townCentre: null, entries: [], targets: [], keep: [], money: 1e12, roundLive: false,
    segsNear: () => [], isCourseRoad: () => false, valuePerTile: () => 10, compensation: l => compensation(l),
  };
}

describe('a course placed past the edge grows the map (golf/osm/placer.ts growPlan)', () => {
  it('a pose off the east or south edge is planned on the grown map with `grow` set; the label and the pop-up say so', async () => {
    const spec = await loadOsmSpec('rondebosch'); assert.ok(spec);
    const t = rotateSpec(spec!, 0), w = world(2048);
    // the land’s middle 150 tiles from the east edge: the land is wider than that
    const p = growPlan(w, t, { x: 2048 - 150, y: 1000, deg: 0 }, 1000);
    assert.equal(p.fits, true);
    assert.deepEqual(p.grow, { from: 2048, to: 2560 });
    assert.equal(p.why, '');
    assert.match(placeLabel(p, 'Rondebosch').text, /grow the map to 5 km and place/);
    assert.match(popupText(p), /The map grows first, from 4 to 5 km a side, to the east and south/);
    assert.equal(mapKm(1024), '2');
    assert.equal(mapKm(3072), '6');
    const s = growPlan(w, t, { x: 1000, y: 2048 - 100, deg: 0 }, 1000);
    assert.ok(s.grow && s.grow.to > 2048 && s.fits);
  });
  it('a pose that fits is planned as before (no grow); one off the north or west edge, or too big for the biggest map, is refused', async () => {
    const spec = (await loadOsmSpec('rondebosch'))!, t = rotateSpec(spec, 0), w = world(2048);
    const ok = growPlan(w, t, { x: 1000, y: 1000, deg: 0 }, 1000);
    assert.equal(ok.grow, undefined); assert.equal(ok.fits, true);
    const west = growPlan(w, t, { x: 100, y: 1000, deg: 0 }, 1000);
    assert.equal(west.grow, undefined); assert.equal(west.fits, false); assert.equal(west.whyKind, 'map');
    const north = growPlan(w, t, { x: 1000, y: 50, deg: 0 }, 1000);
    assert.equal(north.grow, undefined); assert.equal(north.fits, false);
    const corner = growPlan(world(4096), t, { x: 4096 - 100, y: 1000, deg: 0 }, 1000); // already the biggest map
    assert.equal(corner.grow, undefined); assert.equal(corner.fits, false);
    assert.ok(PLACE_EDGE > 0);
  });
  it('the placing mode: a click past the east edge asks the pop-up, Place it lays with the grow, and the pose is passed on', async () => {
    const log = { laid: [] as Parameters<RealHost['lay']>[0][], toasts: [] as string[] };
    const h: RealHost = {
      map: 2048, world: () => world(2048), revision: () => '1', centre: () => ({ x: 1900, y: 1000 }),
      toast: t => { log.toasts.push(t); }, emit: () => {}, enter: () => {}, holes: () => 0, lay: c => { log.laid.push(c); return true; },
    };
    const r = new RealPlacer(h);
    assert.equal(await r.start('rondebosch'), true);
    const v = r.view()!;
    assert.ok(v.plan?.grow, 'the plan grows the map');
    assert.equal(v.label?.bad, false);
    r.click();
    assert.ok(r.confirming?.grow);
    assert.equal(r.confirm(), true);
    assert.equal(log.laid.length, 1);
    assert.deepEqual(log.laid[0]!.at, { x: 1900, y: 1000 });
    assert.ok(log.laid[0]!.plan.grow);
    assert.equal(r.active, false);
    // setPose (what the reload does): the course comes back at the pose with the pop-up one click away
    const q = new RealPlacer({ ...h, map: 2560, world: () => world(2560) });
    assert.equal(await q.start('rondebosch'), true);
    q.setPose(0, { x: 1900, y: 1000 });
    q.click();
    assert.ok(q.confirming && !q.confirming.grow && q.confirming.fits);
  });
  it('a course bigger than the biggest map in every turn is refused with the way out', async () => {
    const spec = (await loadOsmSpec('rondebosch'))!;
    const huge = { ...spec, id: 'huge', w: 6000, h: 6000 };
    const log = { toasts: [] as string[] };
    const r = new RealPlacer({ map: 2048, world: () => world(2048), revision: () => '1', centre: () => ({ x: 1000, y: 1000 }), toast: t => { log.toasts.push(t); }, emit: () => {}, enter: () => {}, holes: () => 0, lay: () => true });
    assert.equal(await r.startSpec(huge), false);
    assert.match(log.toasts.at(-1)!, /bigger than the biggest map/);
  });
});
