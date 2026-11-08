// T358 (#1003): "Find a real course": what is typed or pasted, Nominatim's hits and anchors, the polite client (one a second, kept answers, busy and down),
// the Overpass query and its mirrors, the look for golf near a place, the library (a fake store), the quality grade (Rondebosch full, Wingate partial,
// Bloemfontein outline only), the preview. Every network call is a fake: this file makes no live request.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import wingateRaw from './fixtures/osm/overpass-wingatepark.json';
import bloemRaw from './fixtures/osm/overpass-bloemfontein.json';
import nomWoodhill from './fixtures/osm/nominatim-woodhill.json';
import nomWingate from './fixtures/osm/nominatim-wingate.json';
import nomRonde from './fixtures/osm/nominatim-rondebosch.json';
import nearWoodhill from './fixtures/osm/near-woodhill.json';
import rondeboschJson from '../src/game/golf/osm/data/rondebosch.json';
import magnoliaJson from '../src/game/golf/osm/data/magnolia-national.json';
import woodhillJson from '../src/game/golf/osm/data/woodhill.json';
import { parseCourseQuery, refOfText, refText } from '../src/game/golf/osm/query';
import { BUSY_MESSAGE, DOWN_MESSAGE, Cancelled, Cooldown, Gate, MemoryAnswerCache, ServerBusy, ServerDown, type Net } from '../src/game/golf/osm/polite';
import { NominatimClient, anchorsOf, filterGolfHits, searchKey, type NomResult } from '../src/game/golf/osm/nominatim';
import { candidatesOf, courseQuery, nearQuery, runOverpass, type OverpassJson } from '../src/game/golf/osm/overpass';
import { buildModel, courseJsonOf } from '../src/game/golf/osm/fromosm';
import { CourseLibrary, MemoryStore } from '../src/game/golf/osm/library';
import { extentOf, madeUpLine, reportOf } from '../src/game/golf/osm/grade';
import { fetchPreview, hintOfCandidate, hintOfHit, previewOfKept, search, sizeLine, type FindDeps } from '../src/game/golf/osm/find';
import { paintPreview, previewOps, type Ctx2D } from '../src/game/golf/osm/preview';
import { specOf, osmCourseToSpec } from '../src/game/golf/osm';
import { scaleJson } from '../src/game/golf/osm/convert';
import type { OsmCourseJson } from '../src/game/golf/osm/types';

const ronde = rondeboschJson as unknown as OsmCourseJson, magnolia = magnoliaJson as unknown as OsmCourseJson, woodhill = woodhillJson as unknown as OsmCourseJson;

// ------------------------------------------------------------------------------------------------------------------------ fakes
interface Call { url: string; init?: RequestInit; at: number }
/** a Net whose fetch answers from `handler`, whose clock only moves when something sleeps, and whose deadlines never fire */
function fakeNet(handler: (url: string, init: RequestInit | undefined, n: number) => Response | Promise<Response>, t0 = 1_800_000_000_000) {
  const clock = { t: t0 }, calls: Call[] = [], deadlines: number[] = [];
  const net: Net = {
    fetch: async (url, init) => { calls.push({ url, init, at: clock.t }); return handler(url, init, calls.length); },
    now: () => clock.t, sleep: async ms => { clock.t += ms; },
    deadline: (ms, outer) => { deadlines.push(ms); return { signal: outer ?? new AbortController().signal, clear() {} }; },
  };
  return { net, calls, clock, deadlines };
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response => new Response(JSON.stringify(body), { status, headers });
const abortError = (): Error => Object.assign(new Error('aborted'), { name: 'AbortError' });
const deps = (net: Net): FindDeps => { const lib = new CourseLibrary(new MemoryStore()); return { net, lib, nominatim: new NominatimClient(net, lib.answers()) }; };

// ------------------------------------------------------------------------------------------------------------------------ what is typed
describe('what a player types or pastes (T358)', () => {
  it('a name is a name; empty is empty', () => {
    assert.deepEqual(parseCourseQuery('  Royal  Johannesburg '), { kind: 'name', text: 'Royal Johannesburg' });
    assert.deepEqual(parseCourseQuery('Way 18 Golf Club'), { kind: 'name', text: 'Way 18 Golf Club' }, 'a number inside a name is not an object id');
    assert.deepEqual(parseCourseQuery('Highway 12'), { kind: 'name', text: 'Highway 12' });
    assert.deepEqual(parseCourseQuery('   '), { kind: 'empty' });
  });
  it('way/123, relation/123 and node/123 (case, spaces, colon and hash forms) are objects', () => {
    assert.deepEqual(parseCourseQuery('way/4261725'), { kind: 'osm', ref: { type: 'way', id: 4261725 } });
    assert.deepEqual(parseCourseQuery(' Relation 5974410 '), { kind: 'osm', ref: { type: 'relation', id: 5974410 } });
    assert.deepEqual(parseCourseQuery('NODE:2420739937'), { kind: 'osm', ref: { type: 'node', id: 2420739937 } });
    assert.deepEqual(parseCourseQuery('way#12'), { kind: 'osm', ref: { type: 'way', id: 12 } });
    assert.equal(parseCourseQuery('way/0').kind, 'link', 'id 0 is nothing');
  });
  it('an openstreetmap.org link to an object is that object, wherever its path and position fragment sit', () => {
    for (const [url, want] of [
      ['https://www.openstreetmap.org/way/4261725', { type: 'way', id: 4261725 }],
      ['https://www.openstreetmap.org/relation/5974410#map=15/-25.8160/28.3178', { type: 'relation', id: 5974410 }],
      ['openstreetmap.org/browse/way/4261725', { type: 'way', id: 4261725 }],
      ['http://osm.org/node/2420739937?foo=1', { type: 'node', id: 2420739937 }],
      ['https://www.openstreetmap.org/api/0.6/way/4261725.json', { type: 'way', id: 4261725 }],
      ['https://nl.openstreetmap.org/way/4261725/history', { type: 'way', id: 4261725 }],
    ] as const) assert.deepEqual(parseCourseQuery(url), { kind: 'osm', ref: want }, url);
  });
  it('a link with a map position is a place; a bare link, or a link to another site, is neither (the card says so)', () => {
    assert.deepEqual(parseCourseQuery('https://www.openstreetmap.org/#map=16/-25.8250/28.2697'), { kind: 'place', lat: -25.825, lon: 28.2697 });
    assert.deepEqual(parseCourseQuery('https://www.openstreetmap.org/?mlat=-25.82&mlon=28.31'), { kind: 'place', lat: -25.82, lon: 28.31 });
    assert.deepEqual(parseCourseQuery('-25.82, 28.31'), { kind: 'place', lat: -25.82, lon: 28.31 });
    assert.equal(parseCourseQuery('https://www.openstreetmap.org/').kind, 'link');
    assert.equal(parseCourseQuery('https://example.com/way/123').kind, 'link');
    assert.deepEqual(parseCourseQuery('95, 10'), { kind: 'name', text: '95, 10' }, 'not a latitude');
  });
  it('an object reads back from its text', () => {
    assert.equal(refText({ type: 'way', id: 7 }), 'way/7');
    assert.deepEqual(refOfText('relation/55'), { type: 'relation', id: 55 });
    assert.equal(refOfText('lake/5'), null);
  });
});

// ------------------------------------------------------------------------------------------------------------------------ Nominatim's hits
describe('the hit filter and the anchors (T358; real Nominatim answers kept as fixtures)', () => {
  it('keeps what the map tags leisure=golf_course: Rondebosch is one hit with its town and country', () => {
    const hits = filterGolfHits(nomRonde as unknown as NomResult[]);
    assert.equal(hits.length, 1);
    assert.equal(hits[0]!.id, 'relation/10698368');
    assert.equal(hits[0]!.name, 'Rondebosch Golf Club');
    assert.equal(hits[0]!.country, 'South Africa');
  });
  it('a name that finds places but no golf course (Woodhill, Wingate) has no hits and anchors to look near', () => {
    assert.equal(filterGolfHits(nomWoodhill as unknown as NomResult[]).length, 0);
    assert.equal(filterGolfHits(nomWingate as unknown as NomResult[]).length, 0);
    const w = anchorsOf(nomWoodhill as unknown as NomResult[]);
    assert.equal(w[0]!.name, 'Woodhill Country Club', 'the club\'s own node (club=sport) is the best anchor');
    assert.ok(w.every(a => !/highway|parking/.test(a.what)), 'roads are not anchors');
    const g = anchorsOf(nomWingate as unknown as NomResult[]);
    assert.equal(g[0]!.name, 'Wingate Park', 'the suburb outranks the lone building called Wingate');
    assert.ok(!g.some(a => a.what.startsWith('building')), 'buildings are not anchors');
  });
  it('is leisure=golf_course only, once each, areas before points, at most ten, old "class" answers too', () => {
    const r = (id: number, type: 'node' | 'way' | 'relation', over: Partial<NomResult> = {}): NomResult => ({ osm_type: type, osm_id: id, lat: '1', lon: '2', category: 'leisure', type: 'golf_course', name: `C${id}`, ...over });
    const list: NomResult[] = [r(1, 'node'), r(2, 'way'), r(2, 'way'), r(3, 'way', { category: undefined, class: 'leisure' }), r(4, 'way', { type: 'pitch' }), r(5, 'way', { category: 'amenity' }), r(6, 'relation', { lat: 'x' }),
      ...Array.from({ length: 12 }, (_, i) => r(100 + i, 'way'))];
    const hits = filterGolfHits(list);
    assert.equal(hits.length, 10);
    assert.deepEqual(hits.slice(0, 2).map(h => h.id), ['way/2', 'way/3']);
    assert.ok(!hits.some(h => h.id === 'way/4' || h.id === 'way/5' || h.id === 'relation/6'));
    assert.ok(hits.every(h => h.ref.type !== 'node'), 'the node came last and was cut by the limit');
    assert.equal(filterGolfHits([r(1, 'node'), r(2, 'way')]).map(h => h.id).join(), 'way/2,node/1');
  });
});

// ------------------------------------------------------------------------------------------------------------------------ the polite client
describe('Nominatim, politely (T358)', () => {
  it('asks once, with the game named in a header, and keeps the answer: the same question again sends nothing', async () => {
    const { net, calls } = fakeNet(() => json(nomRonde));
    const c = new NominatimClient(net, new MemoryAnswerCache());
    const a = await c.search('Rondebosch Golf Club');
    assert.equal(a.hits.length, 1); assert.equal(a.fromCache, false);
    assert.equal(calls.length, 1);
    const u = new URL(calls[0]!.url);
    assert.equal(u.origin + u.pathname, 'https://nominatim.openstreetmap.org/search');
    assert.equal(u.searchParams.get('q'), 'Rondebosch Golf Club'); assert.equal(u.searchParams.get('format'), 'jsonv2'); assert.equal(u.searchParams.get('addressdetails'), '1');
    assert.match(String((calls[0]!.init?.headers as Record<string, string>)['X-Requested-With']), /CapitalEmpire/);
    const b = await c.search('  rondebosch   GOLF club ');
    assert.equal(b.fromCache, true); assert.equal(b.hits[0]!.id, a.hits[0]!.id);
    assert.equal(calls.length, 1, 'no second request');
    assert.equal(searchKey('A  b'), searchKey('a B'));
  });
  it('keeps a request at least 1.1 s behind the last one', async () => {
    const { net, calls } = fakeNet(() => json([]));
    const c = new NominatimClient(net, new MemoryAnswerCache());
    await c.search('one'); await c.search('two'); await c.search('three');
    assert.equal(calls.length, 3);
    assert.ok(calls[1]!.at - calls[0]!.at >= 1100 && calls[2]!.at - calls[1]!.at >= 1100, `gaps ${calls[1]!.at - calls[0]!.at}, ${calls[2]!.at - calls[1]!.at}`);
    const g = fakeNet(() => json([])), gate = new Gate(1100, g.net);
    const t0 = g.clock.t; await gate.slot(); await gate.slot(); assert.equal(g.clock.t - t0, 1100, 'the gate waits the gap once between two slots');
  });
  it('on a 429 says the servers are busy, then sends nothing for the minute (and the Retry-After wins), and works again after it', async () => {
    let status = 429;
    const { net, calls, clock } = fakeNet(() => (status === 200 ? json(nomRonde) : json({}, status, status === 429 ? { 'retry-after': '120' } : {})));
    const c = new NominatimClient(net, new MemoryAnswerCache());
    await assert.rejects(() => c.search('a'), (e: unknown) => e instanceof ServerBusy && (e as ServerBusy).retryAfterS === 120 && (e as Error).message === BUSY_MESSAGE);
    await assert.rejects(() => c.search('b'), ServerBusy);
    assert.equal(calls.length, 1, 'cooling down: the second search sent nothing');
    clock.t += 121_000; status = 200;
    assert.equal((await c.search('c')).hits.length, 1);
    assert.equal(calls.length, 2);
  });
  it('a refusal (403), a busy server (503) and a bad answer or no network are told apart: busy, busy, down', async () => {
    const mk = (h: () => Response) => new NominatimClient(fakeNet(h).net, new MemoryAnswerCache());
    await assert.rejects(() => mk(() => json({}, 403)).search('x'), ServerBusy);
    await assert.rejects(() => mk(() => json({}, 503)).search('x'), ServerBusy);
    await assert.rejects(() => mk(() => json({}, 500)).search('x'), (e: unknown) => e instanceof ServerDown && (e as Error).message === DOWN_MESSAGE);
    await assert.rejects(() => mk(() => json({ not: 'a list' })).search('x'), ServerDown);
    await assert.rejects(() => mk(() => { throw new TypeError('Failed to fetch'); }).search('x'), ServerDown);
  });
  it('a cooldown counts down and clears', () => {
    const { net, clock } = fakeNet(() => json([])), c = new Cooldown(net);
    c.check(); c.trip(30); assert.equal(c.left(), 30); assert.throws(() => c.check(), ServerBusy);
    clock.t += 31_000; assert.equal(c.left(), 0); c.check();
  });
});

// ------------------------------------------------------------------------------------------------------------------------ Overpass
describe('the Overpass query and its servers (T358)', () => {
  const WAY = `[out:json][timeout:120];
way(4261725)->.src;
.src map_to_area->.course;
(
  .src;
  nwr(area.course)["golf"];
  nwr(area.course)["natural"="water"];
  way(area.course)["waterway"~"^(stream|river|canal|ditch|drain)$"];
  nwr(area.course)["natural"~"^(wood|scrub)$"];
  nwr(area.course)["landuse"="forest"];
);
out geom;`;
  it('is the query scripts/dev/osm-course.mjs asks, word for word (a course mapped as a point takes what is within 1200 m)', () => {
    assert.equal(courseQuery({ type: 'way', id: 4261725 }), WAY);
    const node = courseQuery({ type: 'node', id: 5 });
    assert.ok(node.includes('node(5)->.src;') && node.includes('nwr(around.src:1200)["golf"];') && !node.includes('map_to_area'));
    const cache = 'E:/ClaudeTemp/T340/raw/overpass-way-4261725-9705c606.json.meta';
    if (existsSync(cache)) assert.equal(courseQuery({ type: 'way', id: 4261725 }), JSON.parse(readFileSync(cache, 'utf8')).query, 'the same text the script sent');
  });
  it('the look near a place asks for the golf courses and features round it and the areas that hold it', () => {
    const q = nearQuery(-25.8206, 28.3127);
    assert.ok(q.includes('around:3000,-25.820600,28.312700') && q.includes('is_in(-25.820600,28.312700)') && q.includes('["leisure"="golf_course"]') && q.includes('["golf"]'));
  });
  it('POSTs the query as a form to the main server and returns the answer with its server and time', async () => {
    const { net, calls } = fakeNet(() => json({ elements: [] }));
    const a = await runOverpass('QQ', net);
    assert.equal(a.server, 'https://overpass-api.de/api/interpreter'); assert.equal(calls.length, 1);
    assert.equal(calls[0]!.init?.method, 'POST'); assert.equal(calls[0]!.init?.body, 'data=QQ');
    assert.equal(a.fetchedAt, new Date(1_800_000_000_000).toISOString());
  });
  it('moves on to the mirrors on a busy answer, a hung server, a runtime-error remark, or nonsense, and stops at the first that answers', async () => {
    const seq = [() => json({}, 504), () => { throw abortError(); }, () => json({ elements: [], remark: 'runtime error: Query timed out' }), () => new Response('<html>nope</html>', { status: 200 })];
    const { net, calls } = fakeNet((_u, _i, n) => seq[n - 1]!());
    await assert.rejects(() => runOverpass('Q', net, { servers: ['a', 'b', 'c', 'd'] }), ServerBusy);
    assert.equal(calls.length, 4);
    const ok = fakeNet((_u, _i, n) => (n < 3 ? json({}, 429) : json({ elements: [{ type: 'node', id: 1 }] })));
    const a = await runOverpass('Q', ok.net);
    assert.equal(ok.calls.length, 3); assert.equal(a.server, 'https://overpass.kumi.systems/api/interpreter');
  });
  it('gives the main server a long while and each mirror less (a mirror that is down hangs), and says which server it asks', async () => {
    const { net, deadlines } = fakeNet(() => { throw abortError(); }), steps: string[] = [];
    await assert.rejects(() => runOverpass('Q', net, { onStep: t => steps.push(t) }), ServerDown);
    assert.deepEqual(deadlines, [130000, 60000, 45000, 45000]);
    assert.equal(steps.length, 4); assert.match(steps[0]!, /overpass-api\.de/); assert.match(steps[1]!, /maps\.mail\.ru/); assert.match(steps[2]!, /overpass\.kumi\.systems/); assert.match(steps[3]!, /overpass\.private\.coffee/);
    assert.match(steps[1]!, /did not answer|no answer/i, 'it says why it moved on');
  });
  it('leaves a server that hung alone for five minutes, and tries it again after', async () => {
    const { net, calls, clock } = fakeNet(url => { if (url === 'a') throw abortError(); return json({ elements: [] }); });
    const first = await runOverpass('Q', net, { servers: ['a', 'b'] });
    assert.equal(first.server, 'b'); assert.equal(calls.length, 2);
    await runOverpass('Q', net, { servers: ['a', 'b'] });
    assert.equal(calls.length, 3, 'a is left alone: only b is asked');
    clock.t += 6 * 60_000;
    await runOverpass('Q', net, { servers: ['a', 'b'] });
    assert.equal(calls.length, 5, 'after the wait a is tried again (and hangs again), then b');
  });
  it('sends nothing for the minute after every server was busy, then asks again', async () => {
    const { net, calls, clock } = fakeNet(() => json({}, 503));
    await assert.rejects(() => runOverpass('Q', net, { servers: ['a', 'b'] }), ServerBusy);
    assert.equal(calls.length, 2);
    await assert.rejects(() => runOverpass('Q', net, { servers: ['a', 'b'] }), (e: unknown) => e instanceof ServerBusy && (e as ServerBusy).retryAfterS > 0);
    assert.equal(calls.length, 2, 'cooling down: nothing was sent');
    clock.t += 61_000;
    await assert.rejects(() => runOverpass('Q', net, { servers: ['a', 'b'] }), ServerBusy);
    assert.equal(calls.length, 4, 'a minute later both are asked again');
  });
  it('says "down" when no server could be reached and "busy" when any one was busy; a cancel stops at once', async () => {
    await assert.rejects(() => runOverpass('Q', fakeNet(() => { throw new TypeError('Failed to fetch'); }).net), ServerDown);
    await assert.rejects(() => runOverpass('Q', fakeNet((_u, _i, n) => (n === 2 ? json({}, 429) : (() => { throw new TypeError('x'); })())).net), ServerBusy);
    const ctl = new AbortController(); ctl.abort();
    const f = fakeNet(() => json({ elements: [] }));
    await assert.rejects(() => runOverpass('Q', f.net, { signal: ctl.signal }), Cancelled);
    assert.equal(f.calls.length, 0);
  });
});

describe('the look for golf features near a place (T358: Woodhill\'s case)', () => {
  it('offers the estate that holds the golf features (and not the suburb round it, nor an empty farm patch)', () => {
    const c = candidatesOf(nearWoodhill as unknown as OverpassJson);
    assert.equal(c[0]!.id, 'relation/5974410');
    assert.equal(c[0]!.name, 'Woodhill Golf Estate'); assert.equal(c[0]!.kind, 'area'); assert.equal(c[0]!.what, 'residential area');
    assert.ok(c[0]!.features > 150, `${c[0]!.features} golf features inside`);
    assert.ok(c[0]!.sizeM[0] > 1500 && c[0]!.sizeM[0] < 3000);
    assert.ok(!c.some(x => x.name === 'Big Suburb' || x.id === 'way/2'));
  });
  it('lists a mapped golf course the name search missed first, whatever it holds', () => {
    const j: OverpassJson = { elements: [...(nearWoodhill as unknown as OverpassJson).elements, { type: 'way', id: 9, tags: { leisure: 'golf_course', name: 'Elsewhere GC' }, bounds: { minlat: -25.9, maxlat: -25.899, minlon: 28.1, maxlon: 28.101 } }] };
    const c = candidatesOf(j);
    assert.equal(c[0]!.id, 'way/9'); assert.equal(c[0]!.kind, 'course'); assert.equal(c[0]!.features, 0);
    assert.equal(c[1]!.id, 'relation/5974410');
  });
  it('is empty for an answer with nothing in it', () => { assert.deepEqual(candidatesOf({ elements: [] }), []); });
});

// ------------------------------------------------------------------------------------------------------------------------ the search
describe('a search, end to end on fakes (T358)', () => {
  const overpassNear = (j: unknown) => (url: string) => (url.includes('nominatim') ? json(nomWoodhill) : json(j));
  it('a name with golf-course hits lists them: one Nominatim request, no Overpass', async () => {
    const { net, calls } = fakeNet(() => json(nomRonde));
    const o = await search('Rondebosch', deps(net));
    assert.equal(o.kind, 'hits'); assert.equal(calls.length, 1); assert.ok(calls[0]!.url.includes('nominatim'));
    if (o.kind === 'hits') assert.equal(o.hits[0]!.ref.id, 10698368);
  });
  it('a name with no golf course looks near the first place it found, and offers the enclosing area (Woodhill)', async () => {
    const { net, calls } = fakeNet(overpassNear(nearWoodhill));
    const o = await search('Woodhill', deps(net));
    assert.equal(o.kind, 'near');
    assert.equal(calls.length, 2); assert.ok(calls[0]!.url.includes('nominatim') && calls[1]!.url.includes('overpass'));
    assert.ok(decodeURIComponent(String(calls[1]!.init?.body)).includes('-25.820597,28.312675'), 'near the club\'s own node');
    if (o.kind === 'near') { assert.equal(o.near.name, 'Woodhill Country Club, Pretoria'); assert.equal(o.candidates[0]!.id, 'relation/5974410'); }
  });
  it('a pasted object goes straight to its preview with no request; a place looks near it; nonsense says why', async () => {
    const a = fakeNet(() => json({}));
    assert.deepEqual(await search('https://www.openstreetmap.org/way/4261725', deps(a.net)), { kind: 'ref', ref: { type: 'way', id: 4261725 } });
    assert.equal(a.calls.length, 0);
    const p = fakeNet(() => json(nearWoodhill));
    const o = await search('-25.8206, 28.3127', deps(p.net));
    assert.equal(o.kind, 'near'); assert.equal(p.calls.length, 1); assert.ok(p.calls[0]!.url.includes('overpass'));
    for (const bad of ['', 'https://www.openstreetmap.org/', 'https://example.com/x']) { const r = await search(bad, deps(a.net)); assert.equal(r.kind, 'none', bad); }
    assert.equal(a.calls.length, 0);
  });
  it('the same search again asks nobody: the answers of Nominatim and of the near look are both kept', async () => {
    const { net, calls } = fakeNet(overpassNear(nearWoodhill)), d = deps(net);
    await search('Woodhill', d); assert.equal(calls.length, 2);
    const again = await search('  WOODHILL ', d);
    assert.equal(again.kind, 'near'); assert.equal(calls.length, 2, 'no request the second time');
  });
  it('nothing found, anywhere, says so', async () => {
    const { net } = fakeNet(url => (url.includes('nominatim') ? json([]) : json({ elements: [] })));
    const o = await search('Zzyzx Links', deps(net));
    assert.equal(o.kind, 'none'); if (o.kind === 'none') assert.match(o.message, /Zzyzx Links/);
    const w = fakeNet(url => (url.includes('nominatim') ? json(nomWingate) : json({ elements: [] })));
    const o2 = await search('Wingate', deps(w.net));
    assert.equal(o2.kind, 'none'); if (o2.kind === 'none') assert.match(o2.message, /Wingate Park/);
  });
  it('Wingate: the name finds a suburb, the look near it finds the course (a golf course the name search missed)', async () => {
    const near: OverpassJson = { elements: [{ type: 'way', id: 4261725, tags: { leisure: 'golf_course', name: 'Wingatepark Country Club' }, bounds: { minlat: -25.8300, maxlat: -25.8280, minlon: 28.2600, maxlon: 28.2640 } }] };
    const { net } = fakeNet(url => (url.includes('nominatim') ? json(nomWingate) : json(near)));
    const o = await search('Wingate', deps(net));
    assert.equal(o.kind, 'near');
    if (o.kind === 'near') {
      assert.equal(o.candidates[0]!.kind, 'course'); assert.equal(o.candidates[0]!.name, 'Wingatepark Country Club'); assert.equal(o.near.name, 'Wingate Park, Pretoria');
      const hint = hintOfCandidate(o.candidates[0]!, o.near);
      assert.deepEqual([hint.name, hint.place], ['Wingatepark Country Club', 'Pretoria, South Africa'], 'the place line comes from the place the look was made near');
    }
  });
});

// ------------------------------------------------------------------------------------------------------------------------ the library
describe('the library of downloaded courses (T358; a fake store)', () => {
  const info = (fetchedAt: string, name = 'Wingatepark Country Club') => ({ name, place: 'Pretoria, South Africa', server: 'https://overpass-api.de/api/interpreter', fetchedAt });
  it('keeps an answer with its fetch date and credit, lists newest first, reads it back as course JSON, and deletes it', async () => {
    const lib = new CourseLibrary(new MemoryStore());
    assert.deepEqual(await lib.list(), []);
    await lib.save('way/4261725', wingateRaw as unknown as OverpassJson, info('2026-11-08T10:00:00.000Z'));
    await lib.save('way/7792831', bloemRaw as unknown as OverpassJson, info('2026-11-09T10:00:00.000Z', 'Bloemfontein Golf Club'));
    const list = await lib.list();
    assert.deepEqual(list.map(r => r.id), ['way/7792831', 'way/4261725']);
    assert.equal(list[1]!.credit, '© OpenStreetMap contributors'); assert.match(list[1]!.licence, /ODbL/); assert.ok(list[1]!.bytes > 50000);
    const kept = (await lib.load('way/4261725'))!;
    assert.equal(kept.json.meta?.course?.name, 'Wingatepark Country Club'); assert.equal(kept.json.meta?.id, 'way/4261725');
    assert.equal(kept.json.features.green!.length, 3); assert.equal(kept.json.features.fairway!.length, 3);
    assert.equal(await lib.load('way/1'), undefined);
    await lib.remove('way/4261725');
    assert.deepEqual((await lib.list()).map(r => r.id), ['way/7792831']);
    assert.equal(await lib.load('way/4261725'), undefined);
  });
  it('a save over a kept course replaces its answer and date (Refresh) and keeps what the first save knew; what was found is kept for the list', async () => {
    const lib = new CourseLibrary(new MemoryStore());
    await lib.save('way/4261725', wingateRaw as unknown as OverpassJson, { ...info('2026-11-08T10:00:00.000Z'), at: { lat: -25.83, lon: 28.26 } });
    await lib.save('way/4261725', JSON.stringify(wingateRaw), info('2026-11-10T10:00:00.000Z'));
    const r = (await lib.get('way/4261725'))!;
    assert.equal(r.fetchedAt, '2026-11-10T10:00:00.000Z'); assert.deepEqual(r.at, { lat: -25.83, lon: 28.26 });
    await lib.setFound('way/4261725', { grade: 'partial', holes: 3, par: 13 });
    assert.equal((await lib.list())[0]!.grade, 'partial');
    await lib.setFound('way/9', { grade: 'full', holes: 18, par: 72 });
    assert.equal((await lib.list()).length, 1, 'a missing record is left missing');
  });
  it('is also where the search answers are kept', async () => {
    const lib = new CourseLibrary(new MemoryStore()), a = lib.answers();
    assert.equal(await a.get('k'), undefined);
    await a.put('k', [1, 2], 5);
    assert.deepEqual(await a.get('k'), { at: 5, value: [1, 2] });
  });
});

// ------------------------------------------------------------------------------------------------------------------------ the model, the grade, the preview
describe('the course JSON made in the browser (T358: the script\'s model, ported)', () => {
  it('is the script\'s own JSON, feature for feature, for every answer the script cached on this PC', () => {
    const dir = 'E:/ClaudeTemp/T340';
    if (!existsSync(`${dir}/raw`)) return;
    let checked = 0;
    for (const f of readdirSync(dir).filter(n => n.endsWith('.json') && !/^(bench|wingate-probe|woodhill-probe|woodhill-golf|golf-east)/.test(n))) {
      const j = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as { meta?: { course?: { osm?: string }; nominatim?: { lat: number; lon: number } }; boundary?: unknown; features?: unknown };
      const osm = j.meta?.course?.osm, m = /^(node|way|relation)\/(\d+)$/.exec(osm ?? '');
      if (!m) continue;
      const raws = readdirSync(`${dir}/raw`).filter(n => n.startsWith(`overpass-${m[1]}-${m[2]}-`) && n.endsWith('.json'));
      if (!raws.length) continue;
      const raw = JSON.parse(readFileSync(`${dir}/raw/${raws[0]}`, 'utf8')) as OverpassJson, ref = { type: m[1] as 'way', id: Number(m[2]) };
      const made = courseJsonOf(raw, ref, { at: j.meta?.nominatim ? { lat: j.meta.nominatim.lat, lon: j.meta.nominatim.lon } : undefined });
      assert.deepEqual(JSON.parse(JSON.stringify(made.features)), j.features, `${f}: features`);
      assert.deepEqual(JSON.parse(JSON.stringify(made.boundary ?? null)), j.boundary ?? null, `${f}: boundary`);
      checked++;
    }
    assert.ok(checked >= 3, `${checked} cached courses compared`);
  });
  it('projects about the middle of the boundary, joins multipolygon rings, and kinds each element', () => {
    const el = (id: number, tags: Record<string, string>, pts: [number, number][]) => ({ type: 'way' as const, id, tags, geometry: pts.map(([lon, lat]) => ({ lat, lon })) });
    const sq = (lon: number, lat: number, d: number): [number, number][] => [[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]];
    const raw: OverpassJson = { elements: [
      el(1, { leisure: 'golf_course', name: 'Test GC' }, sq(10, 20, 0.01)), el(2, { golf: 'green' }, sq(10.004, 20.004, 0.0005)), el(3, { golf: 'hole', ref: '1', par: '4' }, [[10.002, 20.002], [10.0045, 20.0045]]),
      { type: 'node', id: 4, lat: 20.0045, lon: 10.0045, tags: { golf: 'pin' } }, el(5, { natural: 'water' }, sq(10.007, 20.007, 0.001)), el(6, { waterway: 'stream' }, [[10.001, 20.009], [10.009, 20.001]]),
      el(7, { golf: 'mystery' }, sq(10.001, 20.001, 0.0001)), el(8, { highway: 'path' }, [[10, 20], [10.001, 20.001]]),
    ] };
    const m = buildModel(raw.elements, { type: 'way', id: 1 }, { lat: 0, lon: 0 });
    assert.ok(Math.abs(m.centre.lat - 20.005) < 1e-9 && Math.abs(m.centre.lon - 10.005) < 1e-9);
    assert.equal(m.boundary!.id, 'way/1');
    assert.equal(m.F.green!.length, 1); assert.equal(m.F.hole![0]!.ref, 1); assert.equal(m.F.hole![0]!.par, 4); assert.equal(m.F.pin!.length, 1);
    assert.equal(m.F.water!.length, 1); assert.equal(m.F.waterway!.length, 1); assert.equal(m.F.other!.length, 2, 'an unknown golf value and a path are "other"');
    const g = m.F.green![0]!.polys![0]!.outer;
    assert.ok(g.every(p => Math.abs(p[0]) < 600 && Math.abs(p[1]) < 600), 'metres about the centre');
    assert.ok(m.F.green![0]!.area! > 1000 && m.F.green![0]!.area! < 3000, `${m.F.green![0]!.area} m2`);
    const j = courseJsonOf(raw, { type: 'way', id: 1 }, { place: 'Nowhere' });
    assert.equal(j.meta?.course?.name, 'Test GC'); assert.equal(j.meta?.place, 'Nowhere'); assert.equal(j.meta?.credit, '© OpenStreetMap contributors'); assert.deepEqual(j.meta?.sizeM, [1045, 1112]);
  });
  it('joins the member ways of a multipolygon into one ring with its hole', () => {
    const w = (pts: [number, number][]) => pts.map(([lon, lat]) => ({ lat, lon }));
    const rel = { type: 'relation' as const, id: 9, tags: { type: 'multipolygon', leisure: 'golf_course', name: 'M' }, members: [
      { type: 'way', ref: 1, role: 'outer', geometry: w([[0, 0], [0.01, 0], [0.01, 0.01]]) }, { type: 'way', ref: 2, role: 'outer', geometry: w([[0.01, 0.01], [0, 0.01], [0, 0]]) },
      { type: 'way', ref: 3, role: 'inner', geometry: w([[0.003, 0.003], [0.006, 0.003], [0.006, 0.006], [0.003, 0.006], [0.003, 0.003]]) },
    ] };
    const m = buildModel([rel], { type: 'relation', id: 9 }, { lat: 0, lon: 0 });
    assert.equal(m.boundary!.polys!.length, 1); assert.equal(m.boundary!.polys![0]!.inner.length, 1);
    assert.ok(!m.boundary!.broken);
  });
});

describe('the quality grade (T358)', () => {
  const rawSpec = (raw: unknown, id: string, name: string) => {
    const ref = refOfText(id)!, j = courseJsonOf(raw as OverpassJson, ref, { id, name, place: 'Somewhere' }), spec = specOf(j, { id, name, place: 'Somewhere' });
    return { j, spec, report: reportOf(j, spec) };
  };
  it('Rondebosch is Full: 18 numbered hole lines, with its counts and its size', () => {
    const spec = specOf(ronde, { id: 'rondebosch', name: 'Rondebosch', place: 'Cape Town' }), r = reportOf(ronde, spec);
    assert.equal(r.grade, 'full'); assert.equal(r.label, 'Full'); assert.equal(r.holes, 18); assert.equal(r.par, 72);
    assert.deepEqual([r.counts.greens, r.counts.bunkers, r.counts.pins, r.counts.numbered], [18, 41, 18, 18]);
    assert.ok(r.fits && r.scalePct === 100); assert.match(sizeLine(r), /fits the 2 km map at true size/);
    assert.ok(r.landM[0] > 1200 && r.landM[1] > 1000, `${r.landM}`);
    assert.deepEqual(extentOf(ronde), r.landM);
  });
  it('Magnolia National and Woodhill are Full too (Woodhill scaled to fit the map, and the card says so)', () => {
    const m = reportOf(magnolia, specOf(magnolia, { id: 'm', name: 'M', place: '' }));
    assert.equal(m.grade, 'full'); assert.equal(m.holes, 18);
    const wh = reportOf(woodhill, specOf(woodhill, { id: 'w', name: 'W', place: '' }));
    assert.equal(wh.grade, 'full'); assert.equal(wh.scalePct, 90); assert.match(sizeLine(wh), /scaled to 90% to fit the 2 km map/);
  });
  it('Wingate Park is Partial: no hole lines, three holes worked out from its fairways, and the card says it is a guess', () => {
    const { report, spec } = rawSpec(wingateRaw, 'way/4261725', 'Wingatepark Country Club');
    assert.equal(report.grade, 'partial'); assert.equal(report.label, 'Partial'); assert.equal(spec.derived, true); assert.equal(report.holes, 3);
    assert.ok(spec.warnings.some(w => w.code === 'holes-derived'));
    assert.match(report.summary, /worked out from its fairways/); assert.match(report.summary, /a guess/);
    assert.deepEqual([report.counts.greens, report.counts.fairways, report.counts.tees, report.counts.pins, report.counts.holeLines], [3, 3, 10, 0, 0]);
    assert.ok(report.fits);
    assert.equal(report.madeUpLine, "3 pins at their greens' middles, 3 pars worked out from the lengths", 'what was made up, counted');
    assert.equal(madeUpLine([]), '');
  });
  it('Bloemfontein is Outline only: nothing to build holes from, so no holes and no Build', () => {
    const { report, spec } = rawSpec(bloemRaw, 'way/7792831', 'Bloemfontein Golf Club');
    assert.equal(report.grade, 'outline'); assert.equal(report.label, 'Outline only'); assert.equal(spec.holes.length, 0); assert.equal(report.holes, 0); assert.equal(report.fits, false);
    assert.match(report.summary, /only an outline/); assert.match(report.summary, /cannot build it/);
    assert.ok(spec.warnings.some(w => w.code === 'no-holes'));
    assert.ok(report.landM[0] > 2000, 'the boundary is 2.8 km wide');
  });
  it('a course that would have to shrink to under a third to fit the map is too big to build, and says so with the scale it would need', () => {
    const huge = scaleJson(ronde, 6), spec = specOf(huge, { id: 'h', name: 'H', place: '' }), r = reportOf(huge, spec);
    assert.equal(r.grade, 'full'); assert.equal(r.fits, false); assert.ok(r.scalePct > 0 && r.scalePct < 30, `${r.scalePct}%`);
    assert.match(sizeLine(r), /too big for the 2 km map \(it would have to shrink to \d+%\)/);
    const big = scaleJson(ronde, 1.8), r2 = reportOf(big, specOf(big, { id: 'b', name: 'B', place: '' }));
    assert.equal(r2.fits, true); assert.ok(r2.scalePct >= 50 && r2.scalePct < 100, `${r2.scalePct}%`);
  });
  it('a course with only some holes numbered is Partial, and a nine-hole course with nine lines is Full', () => {
    const cut = (keep: number): OsmCourseJson => ({ ...ronde, features: { ...ronde.features, hole: (ronde.features.hole ?? []).filter(h => (h.ref ?? 99) <= keep) } });
    const nine = reportOf(cut(9), specOf(cut(9), { id: 'r', name: 'R', place: '' }));
    assert.equal(nine.holes, 9); assert.equal(nine.grade, 'full');
    const twelve = reportOf(cut(12), specOf(cut(12), { id: 'r', name: 'R', place: '' }));
    assert.equal(twelve.holes, 12); assert.equal(twelve.grade, 'partial'); assert.match(twelve.summary, /Only 12 of the course's holes are numbered/);
  });
});

describe('importing a course from the answer (T358: fetch once, keep, grade)', () => {
  it('fetches with ONE Overpass query, keeps the answer in the library, grades it, and never asks again unless refreshed', async () => {
    const { net, calls, clock } = fakeNet(() => json(wingateRaw));
    const d = deps(net), ref = { type: 'way' as const, id: 4261725 };
    const p = await fetchPreview(ref, { name: 'Wingatepark Country Club', place: 'Pretoria, South Africa' }, d);
    assert.equal(calls.length, 1); assert.equal(calls[0]!.url, 'https://overpass-api.de/api/interpreter');
    assert.equal(decodeURIComponent(String(calls[0]!.init?.body)), `data=${courseQuery(ref)}`);
    assert.equal(p.report.grade, 'partial'); assert.equal(p.spec.holes.length, 3); assert.equal(p.record.name, 'Wingatepark Country Club'); assert.equal(p.record.place, 'Pretoria, South Africa');
    assert.equal(p.record.grade, 'partial');
    const listed = await d.lib.list();
    assert.equal(listed.length, 1); assert.equal(listed[0]!.grade, 'partial'); assert.equal(listed[0]!.holes, 3);
    const again = await fetchPreview(ref, {}, d);
    assert.equal(calls.length, 1, 'kept: no second request'); assert.equal(again.report.holes, 3);
    clock.t += 86_400_000;
    const fresh = await fetchPreview(ref, {}, d, { refresh: true });
    assert.equal(calls.length, 2, 'Refresh is the only refetch'); assert.equal(fresh.record.name, 'Wingatepark Country Club'); assert.ok(fresh.record.fetchedAt > p.record.fetchedAt);
    assert.equal((await previewOfKept('way/9', d)), undefined);
  });
  it('an outline-only course is fetched, kept (not asked again) and graded Outline only; the name comes from the map when the hint has none', async () => {
    const { net, calls } = fakeNet(() => json(bloemRaw)), d = deps(net);
    const p = await fetchPreview({ type: 'way', id: 7792831 }, {}, d);
    assert.equal(p.report.grade, 'outline'); assert.equal(p.record.name, 'Bloemfontein Golf Club'); assert.equal(calls.length, 1);
    assert.equal((await d.lib.list())[0]!.grade, 'outline');
  });
  it('a busy or unreachable Overpass keeps nothing', async () => {
    const d = deps(fakeNet(() => json({}, 429)).net);
    await assert.rejects(() => fetchPreview({ type: 'way', id: 1 }, {}, d), ServerBusy);
    assert.deepEqual(await d.lib.list(), []);
  });
  it('the hit\'s name, town and position travel with it', () => {
    const h = filterGolfHits(nomRonde as unknown as NomResult[])[0]!, hint = hintOfHit(h);
    assert.equal(hint.name, 'Rondebosch Golf Club'); assert.match(hint.place ?? '', /South Africa/); assert.ok(hint.at && Math.abs(hint.at.lat + 33.9) < 0.2);
  });
});

describe('the preview picture (T358)', () => {
  const box = { w: 480, h: 300 };
  it('draws every green, bunker, hole line and pin of Rondebosch inside the box, the holes numbered, the same each time', () => {
    const ops = previewOps(ronde, box);
    assert.equal(JSON.stringify(ops), JSON.stringify(previewOps(ronde, box)), 'deterministic');
    assert.equal(ops.filter(o => o.t === 'fill' && o.c === '#5cec84').length, 18, 'greens');
    assert.equal(ops.filter(o => o.t === 'fill' && o.c === '#f0dc98').length, 41, 'bunkers');
    assert.deepEqual(ops.filter(o => o.t === 'text').map(o => (o as { s: string }).s).sort((a, b) => Number(a) - Number(b)), Array.from({ length: 18 }, (_, i) => String(i + 1)));
    // (the rough, woods and water may run past the extent of the holes' features: the canvas clips them; everything of the holes themselves is inside)
    const golf = new Set(['#5cec84', '#f0dc98', '#d8e276', '#88c458', '#ffffff', '#080a0c', '#ec3434']);
    for (const o of ops.filter(q => q.t === 'text' || q.t === 'disc' || golf.has(q.c))) {
      const pts = o.t === 'fill' ? o.rings.flat() : o.t === 'line' ? o.pts : [o.x, o.y];
      for (let i = 0; i + 1 < pts.length; i += 2) assert.ok(pts[i]! >= -0.5 && pts[i]! <= box.w + 0.5 && pts[i + 1]! >= -0.5 && pts[i + 1]! <= box.h + 0.5, `${o.t} at ${pts[i]}, ${pts[i + 1]}`);
    }
  });
  it('draws the worked-out holes of a course with no hole lines in the guess colour, and nothing for an empty course', () => {
    const j = courseJsonOf(wingateRaw as unknown as OverpassJson, { type: 'way', id: 4261725 }), spec = specOf(j, { id: 'w', name: 'W', place: '' });
    const ops = previewOps(j, box, spec);
    assert.equal(ops.filter(o => o.t === 'text').length, 3, 'three numbered holes');
    assert.ok(ops.some(o => o.t === 'line' && o.c === '#ffc34a'), 'amber guess lines');
    assert.ok(!ops.some(o => o.t === 'line' && o.c === '#ffffff'), 'no white (mapped) hole lines');
    assert.deepEqual(previewOps({ features: {} }, box), []);
    assert.equal(osmCourseToSpec(j, { derive: false }).holes.length, 0, 'the derivation can be switched off');
  });
  it('runs on a canvas context: one fill per fill operation, with the even-odd rule', () => {
    const rec = { fills: 0, rules: new Set<string>(), strokes: 0, texts: 0 };
    const ctx = { fillStyle: '', strokeStyle: '', lineWidth: 0, globalAlpha: 1, font: '', lineJoin: 'round', lineCap: 'round',
      fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill(rule?: string) { rec.fills++; if (rule) rec.rules.add(rule); }, stroke() { rec.strokes++; }, arc() {}, fillText() { rec.texts++; } } as unknown as Ctx2D;
    const ops = previewOps(ronde, box);
    paintPreview(ctx, ops, box);
    assert.equal(rec.texts, 18);
    assert.equal(rec.fills, ops.filter(o => o.t === 'fill' || o.t === 'disc').length);
    assert.deepEqual([...rec.rules], ['evenodd']);
    assert.ok(rec.strokes > 18);
  });
});

describe('converting what was fetched (T358)', () => {
  it('an imported course shows the name the map gives it (the made-up name rule is for the featured list only)', () => {
    const j = courseJsonOf(wingateRaw as unknown as OverpassJson, { type: 'way', id: 4261725 }, { place: 'Pretoria, South Africa' }), spec = specOf(j, { id: 'way/4261725', name: j.meta!.course!.name!, place: j.meta!.place! });
    assert.equal(spec.name, 'Wingatepark Country Club'); assert.equal(spec.credit, '© OpenStreetMap contributors'); assert.equal(spec.id, 'way/4261725'); assert.equal(spec.place, 'Pretoria, South Africa');
    assert.deepEqual(spec.originM.map(v => Number.isFinite(v)), [true, true]);
  });
});
