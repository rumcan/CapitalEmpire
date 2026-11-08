// T356 (#998) with T358 (#1003): the player's downloaded courses on the Course › Place a real course menu: the library's list kept for the menu (kept.ts), a
// downloaded course taken in hand by the placing mode (its spec read back from the library as a new game would build it, holes worked out from the fairways
// and all), and the menu rows under a caption of their own. The library is the in-memory one; no request is made.
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import wingateRaw from './fixtures/osm/overpass-wingatepark.json';
import { CourseLibrary, MemoryStore, type CourseRecord } from '../src/game/golf/osm/library';
import { clearKept, keptCourses, refreshKept, watchKept } from '../src/game/golf/osm/kept';
import { previewOfKept, type FindDeps } from '../src/game/golf/osm/find';
import type { OverpassJson } from '../src/game/golf/osm/overpass';
import { RealPlacer, realInfoOf, type RealHost } from '../src/game/golf/osm/placer';
import type { PlaceWorld } from '../src/game/golf/osm/place';
import { rotateSpec } from '../src/game/golf/osm/rotate';
import { OSM_COURSES } from '../src/game/golf/osm';
import { RAIL } from '../src/ui/rail-items';
import { leavesOf, menuOf, type MenuCtx } from '../src/ui/flyout-menu';

const ID = 'way/4261725';
const when = '2026-11-08T10:00:00.000Z';
const raw = wingateRaw as unknown as OverpassJson;
/** a library holding Wingate Park, read back once (as the picker's preview does: that is what puts its holes and par on the record) */
async function library(): Promise<CourseLibrary> {
  const lib = new CourseLibrary(new MemoryStore());
  await lib.save(ID, raw, { name: 'Wingatepark Country Club', place: 'Pretoria, South Africa', server: 'https://overpass-api.de/api/interpreter', fetchedAt: when });
  assert.ok(await previewOfKept(ID, { lib } as unknown as FindDeps));
  return lib;
}
/** a host with an empty plain and all the money there is; `kept` is how it reads a downloaded course back */
function host(kept?: RealHost['kept']) {
  const log = { toasts: [] as string[], laid: [] as Parameters<RealHost['lay']>[0][] };
  const h: RealHost = {
    map: 1024,
    world: (): PlaceWorld => ({
      map: 1024, owned: [], river: () => false, lots: [], farms: [], segs: [], pop: 0, townCentre: null, entries: [], targets: [], keep: [], money: 1e12, roundLive: false,
      segsNear: () => [], isCourseRoad: () => false, valuePerTile: () => 10, compensation: () => 0,
    }),
    revision: () => '0', centre: () => ({ x: 512, y: 512 }), toast: t => { log.toasts.push(t); }, emit: () => undefined, enter: () => undefined, holes: () => 0,
    lay: c => { log.laid.push(c); return true; }, ...(kept ? { kept } : {}),
  };
  return { h, log };
}
const keptFrom = (lib: CourseLibrary): NonNullable<RealHost['kept']> => async id => {
  const p = await previewOfKept(id, { lib } as unknown as FindDeps);
  return p && p.spec.holes.length ? { info: realInfoOf(p.spec), spec: p.spec } : null;
};

describe('the downloaded courses the menu lists (T356 with T358)', () => {
  beforeEach(() => clearKept());

  it('lists the library once, newest first, tells its watchers only when the list changed, and leaves out a course with no holes or none read yet', async () => {
    const lib = await library();
    let heard = 0; const stop = watchKept(() => { heard++; });
    assert.deepEqual(keptCourses(), [], 'nothing before the first listing');
    await refreshKept(lib);
    assert.deepEqual(keptCourses().map(r => r.id), [ID]);
    assert.equal(keptCourses()[0]!.holes, 3);
    assert.equal(heard, 1);
    await refreshKept(lib);
    assert.equal(heard, 1, 'the same list: nobody told');
    // a map that held no hole is in the library (for its preview) but cannot be placed; one never read has no count yet
    await lib.save('way/2', raw, { name: 'Outline', place: '', server: 's', fetchedAt: '2026-11-09T10:00:00.000Z' });
    await lib.setFound('way/2', { grade: 'outline', holes: 0, par: 0 });
    await lib.save('way/3', raw, { name: 'Unread', place: '', server: 's', fetchedAt: '2026-11-10T10:00:00.000Z' });
    await refreshKept(lib);
    assert.deepEqual(keptCourses().map(r => r.id), [ID]);
    assert.equal(heard, 1);
    // another course read: it is listed, the newer fetch first
    await lib.save('way/4', raw, { name: 'Second', place: 'Elsewhere', server: 's', fetchedAt: '2026-11-11T10:00:00.000Z' });
    await lib.setFound('way/4', { grade: 'partial', holes: 9, par: 36 });
    await refreshKept(lib);
    assert.deepEqual(keptCourses().map(r => r.id), ['way/4', ID]);
    assert.equal(heard, 2);
    // a course deleted from the library drops out of the next listing
    await lib.remove('way/4');
    await refreshKept(lib);
    assert.deepEqual(keptCourses().map(r => r.id), [ID]);
    assert.equal(heard, 3);
    stop();
    await lib.remove(ID); await refreshKept(lib);
    assert.deepEqual(keptCourses(), []);
    assert.equal(heard, 3, 'a stopped watcher hears no more');
  });

  it('never rejects: a library that cannot be read leaves the list as it was', async () => {
    const lib = await library();
    await refreshKept(lib);
    const broken = { list: async () => { throw new Error('IndexedDB is blocked'); } } as unknown as CourseLibrary;
    await refreshKept(broken);
    assert.deepEqual(keptCourses().map(r => r.id), [ID]);
  });
});

describe('a downloaded course in hand (T356 with T358)', () => {
  it('is read back from the library and taken in hand with its own name, holes and id; the holes worked out from the fairways stay a guess', async () => {
    const lib = await library(), { h, log } = host(keptFrom(lib)), r = new RealPlacer(h);
    assert.equal(await r.start(ID), true);
    assert.equal(r.active, true);
    const v = r.view()!;
    assert.equal(v.id, ID); assert.equal(v.name, 'Wingatepark Country Club'); assert.equal(v.holes, 3); assert.equal(v.place, 'Pretoria, South Africa');
    assert.equal(r.spec!.derived, true, 'no hole lines on the map: the holes are a guess');
    assert.match(log.toasts.at(-1)!, /Wingatepark Country Club: move it to a spot/);
    // turned, the guess stays marked and the unturned corner is kept (the preview reads it only on a spec as converted)
    const t = rotateSpec(r.spec!, 45);
    assert.equal(t.derived, true); assert.deepEqual(t.originM, r.spec!.originM); assert.equal(t.holes.length, 3);
    // placed: the host is told the id the game will save, and the spec it came from
    r.click(); assert.ok(r.confirming, 'the pop-up');
    assert.equal(r.confirm(), true);
    assert.equal(log.laid.length, 1);
    assert.equal(log.laid[0]!.id, ID); assert.equal(log.laid[0]!.info.id, ID); assert.equal(log.laid[0]!.info.holes, 3); assert.equal(log.laid[0]!.spec.derived, true);
    assert.equal(r.active, false);
  });

  it('says so, and takes nothing in hand, for a course the library no longer keeps or cannot read, or when the host has no library', async () => {
    const lib = await library();
    const gone = host(keptFrom(lib)), a = new RealPlacer(gone.h);
    assert.equal(await a.start('way/999'), false);
    assert.equal(a.active, false); assert.match(gone.log.toasts.at(-1)!, /no longer kept in this browser/);
    const bad = host(async () => { throw new Error('IndexedDB is blocked'); }), b = new RealPlacer(bad.h);
    assert.equal(await b.start(ID), false);
    assert.equal(b.active, false); assert.match(bad.log.toasts.at(-1)!, /no longer kept/);
    const none = host(), c = new RealPlacer(none.h);
    assert.equal(await c.start(ID), false);
    assert.match(none.log.toasts.at(-1)!, /not in this build/, 'no library: as an id the game does not ship');
    // a shipped course is still a shipped course (never asked of the library)
    let asked = 0; const d = host(async () => { asked++; return null; }), e = new RealPlacer(d.h);
    assert.equal(await e.start('rondebosch'), true); assert.equal(asked, 0);
  });

  it('a course picked while another is still loading wins, and one put down meanwhile stays down', async () => {
    const lib = await library(), slow = keptFrom(lib);
    let release!: () => void; const gate = new Promise<void>(res => { release = res; });
    const { h } = host(async id => { await gate; return slow(id); }), r = new RealPlacer(h);
    const first = r.start(ID);
    const second = r.start('rondebosch');
    assert.equal(await second, true);
    release();
    assert.equal(await first, false, 'the later pick won');
    assert.equal(r.id, 'rondebosch');
    const third = r.start(ID); r.cancel(); release();
    assert.equal(await third, false); assert.equal(r.active, false);
  });
});

describe('a course the search found, in hand from its spec (T356: Place it in my map on the new-game card)', () => {
  it('takes the previewed spec in hand over the game map as a menu course is taken, Select in hand, and Cancel puts it down with nothing bought', async () => {
    const lib = await library(), spec = (await previewOfKept(ID, { lib } as unknown as FindDeps))!.spec, { h, log } = host(), r = new RealPlacer(h);
    let entered = 0; h.enter = () => { entered++; };
    assert.equal(await r.startSpec(spec), true);
    assert.equal(r.active, true); assert.equal(entered, 1, 'the cards that hide the map shut');
    assert.equal(r.id, ID); assert.equal(r.view()!.name, 'Wingatepark Country Club'); assert.equal(r.view()!.holes, 3);
    assert.equal(r.spec, spec, 'the very spec the preview built');
    assert.match(log.toasts.at(-1)!, /Wingatepark Country Club: move it to a spot and click to place it · R turns it .* Esc puts it down/);
    r.cancel();
    assert.equal(r.active, false); assert.equal(log.laid.length, 0, 'nothing laid');
  });
  it('is placed through the same pop-up: the host is told the id the game will save', async () => {
    const lib = await library(), spec = (await previewOfKept(ID, { lib } as unknown as FindDeps))!.spec, { h, log } = host(), r = new RealPlacer(h);
    assert.equal(await r.startSpec(spec), true);
    r.click(); assert.ok(r.confirming, 'the pop-up');
    r.closePopup(); assert.equal(r.confirming, null); assert.equal(r.active, true, 'Cancel in the pop-up leaves the course in hand');
    r.click(); assert.equal(r.confirm(), true);
    assert.equal(log.laid.length, 1); assert.equal(log.laid[0]!.id, ID); assert.equal(log.laid[0]!.spec, spec);
  });
  it('replaces a course already in hand, and says why when the map holds it in no turn', async () => {
    const lib = await library(), spec = (await previewOfKept(ID, { lib } as unknown as FindDeps))!.spec, a = host(), r = new RealPlacer(a.h);
    assert.equal(await r.start('rondebosch'), true);
    assert.equal(await r.startSpec(spec), true); assert.equal(r.id, ID, 'the later one is in hand');
    const small = host(), s = new RealPlacer({ ...small.h, map: 100 });
    assert.equal(await s.startSpec(spec), false); assert.equal(s.active, false);
    assert.match(small.log.toasts.at(-1)!, /Wingatepark Country Club \(from map data\) is bigger than the map in every direction.*cannot grow/);
  });
});

describe('Course › Place a real course lists the downloaded courses (T356 with T358)', () => {
  const rec = (id: string, name: string, holes: number, par: number): CourseRecord => ({ id, name, place: 'Pretoria, South Africa', credit: '', licence: '', fetchedAt: when, server: 's', bytes: 1, holes, par });
  const shipped = OSM_COURSES.map(c => ({ id: c.id, name: c.name, place: c.place, holes: c.holes, par: c.par }));
  const ctx = (real: MenuCtx['real']): MenuCtx => ({ golf: true, ui: null, roads: [], paths: [], junctions: [], surfaces: [], cares: [], propGroups: [], materials: [], plants: [], newHoleWhy: null, range: [], real });
  const group = (c: MenuCtx) => menuOf(RAIL.find(r => r.id === 'course')!, c).find(r => r.label === 'Place a real course…');

  it('puts them under a caption of their own after the shipped ones, each taking its course in hand by its library id', () => {
    const k = rec(ID, 'Wingatepark Country Club', 3, 12), g = group(ctx([...shipped, { id: k.id, name: k.name, place: k.place, holes: k.holes!, par: k.par!, kept: true }]))!;
    assert.deepEqual(g.children!.map(r => r.label), ['Featured', 'Rondebosch Golf Course', 'Magnolia National', 'Woodhill Country Club', 'Downloaded courses', 'Wingatepark Country Club']);
    assert.deepEqual(g.children!.filter(r => r.caption).map(r => r.label), ['Featured', 'Downloaded courses']);
    const last = g.children!.at(-1)!;
    assert.deepEqual(last.leaf?.act, { k: 'real', id: ID });
    assert.equal(last.note, 'Pretoria, South Africa · 3 holes · par 12');
    assert.ok(leavesOf(menuOf(RAIL.find(r => r.id === 'course')!, ctx([...shipped, { id: k.id, name: k.name, place: k.place, holes: 3, par: 12, kept: true }]))).some(l => l.row.leaf?.act?.k === 'real' && l.row.leaf.act.id === ID), 'reachable by a flyout path');
  });
  it('is the three shipped courses alone, with no captions, when nothing is downloaded', () => {
    assert.deepEqual(group(ctx(shipped))!.children!.map(r => r.label), ['Rondebosch Golf Course', 'Magnolia National', 'Woodhill Country Club']);
  });
  it('is there for a downloaded course alone as well (the shipped list emptied)', () => {
    const g = group(ctx([{ id: ID, name: 'Wingatepark Country Club', place: 'Pretoria', holes: 3, par: 12, kept: true }]))!;
    assert.deepEqual(g.children!.map(r => r.label), ['Downloaded courses', 'Wingatepark Country Club'], 'no caption over nothing');
  });
});
