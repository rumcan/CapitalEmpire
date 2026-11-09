// T378 (#1034), part 2: the course names catalogue. The build script's pure half (scripts/dev/osm-catalogue-lib.mjs: the regions and their queries, how an Overpass answer
// becomes entries, the nearest places, Full, the chunks), the format it writes read back by src/game/golf/osm/catalogue.ts, the filter (case and accent blind, any word of the
// name or town, "wing" finds Wingatepark Country Club), and the loader (lazy, the player's country first, three files at a time, the list narrows over what has arrived,
// a failed file does not stop the rest). Every file and answer is made up here: this file makes no live request.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import * as L from '../scripts/dev/osm-catalogue-lib.mjs';
import {
  Catalogue, CATALOGUE_DIR, LIST_MAX, catalogueBase, chunkOrder, countriesByCount, filterCatalogue, fold, fullOf, parseChunk, parseIndex, refOfTag, regionOfLocale, wordsOf,
  type CatalogueEntry, type CatalogueIndex,
} from '../src/game/golf/osm/catalogue';

// ------------------------------------------------------------------------------------------------------------------------ made-up map data
type El = L.OverpassEl;
const way = (id: number, name: string, b: [number, number, number, number], tags: Record<string, string> = {}): El => ({ type: 'way', id, bounds: { minlat: b[0], minlon: b[1], maxlat: b[2], maxlon: b[3] }, tags: { leisure: 'golf_course', name, ...tags } });
const node = (id: number, name: string, lat: number, lon: number, tags: Record<string, string> = {}): El => ({ type: 'node', id, lat, lon, tags: { leisure: 'golf_course', name, ...tags } });
const hole = (id: number, ref: number | string, lat: number, lon: number): El => ({ type: 'way', id, center: { lat, lon }, tags: { golf: 'hole', ref: String(ref) } });
const holes = (from: number, n: number, lat: number, lon: number): El[] => Array.from({ length: n }, (_, i) => hole(from + i, i + 1, lat + i * 0.0001, lon + i * 0.0001));

const PLACES = L.parsePlacesCsv([
  '-25.7461\t28.1881\tPretoria\tcity', '-25.8310\t28.2800\tWingate Park\tsuburb', '-25.8800\t28.2000\tIrene\ttown', '-33.9249\t18.4241\tCape Town\tcity', '-33.9590\t18.4700\tRondebosch\tsuburb',
  'junk line', '1\t2\t\tcity', 'x\ty\tz\tcity', '-26.0\t28.0\tNowhere\tmountain',
].join('\n'));
const ZA_ANSWER = { elements: [
  way(4261725, 'Wingatepark Country Club', [-25.8330, 28.2790, -25.8286, 28.2818]), ...holes(9000, 18, -25.8320, 28.2795),
  way(10698368, 'Rondebosch Golf Club', [-33.9570, 18.4900, -33.9480, 18.4960]), ...holes(9100, 17, -33.9560, 18.4905),
  way(12785152, 'Glendower', [-26.1600, 28.1350, -26.1520, 28.1430]), ...holes(9200, 9, -26.1590, 28.1360),
  node(77, 'Pitch & Putt Park', -26.0, 28.0),
  way(80, 'Golf de Montréal', [-26.30, 28.30, -26.29, 28.31]), way(81, 'Östersund Golfklubb', [-26.40, 28.40, -26.39, 28.41]), way(82, 'Straße der Golfer', [-26.50, 28.50, -26.49, 28.51]),
  way(83, '東京ゴルフ倶楽部', [-26.60, 28.60, -26.59, 28.61], { 'name:en': 'Tokyo Golf Club' }),
  node(84, 'Duplicate Golf Club', -26.7000, 28.7000), way(85, 'Duplicate Golf Club', [-26.7005, 28.6995, -26.6995, 28.7005]),
  way(86, 'Pretoria Country Club', [-25.80, 28.20, -25.79, 28.21], { 'addr:city': 'Pretoria', 'addr:suburb': 'Waterkloof' }),
  way(87, 'Royal Westgate', [-26.80, 28.80, -26.79, 28.81], { alt_name: 'The Old Course;Westgate GC' }),
  way(88, 'x', [-26.9, 28.9, -26.89, 28.91]), { type: 'way', id: 89, tags: { leisure: 'golf_course', name: 'No position' } },
] } as { elements: El[] };

// ------------------------------------------------------------------------------------------------------------------------ the script's library
describe('the catalogue script: the regions and the queries (T378)', () => {
  it('asks South Africa first, then the US by state, the UK and Ireland, Australia, Canada and New Zealand, then the rest by their number of courses', () => {
    const plan = L.regionsPlan();
    assert.equal(plan[0]!.id, 'za');
    const us = plan.filter(r => r.cc === 'US');
    assert.equal(us.length, 51, 'fifty states and DC');
    assert.deepEqual(plan.slice(1, 52).map(r => r.cc), Array(51).fill('US'), 'the US right after South Africa');
    assert.deepEqual(plan.filter(r => r.cc !== 'US').slice(0, 7).map(r => r.cc), ['ZA', 'GB', 'IE', 'AU', 'CA', 'NZ', 'JP']);
    assert.equal(new Set(plan.map(r => r.id)).size, plan.length, 'every region has its own id');
    assert.equal(new Set(L.COUNTRIES.map(c => c[0])).size, L.COUNTRIES.length, 'no country twice');
    for (let i = 8; i < L.COUNTRIES.length; i++) assert.ok(L.COUNTRIES[i]![1] <= L.COUNTRIES[i - 1]![1], `the rest are in the order of their courses: ${L.COUNTRIES[i]![0]}`);
    assert.deepEqual(L.regionsPlan(['za', 'li']).map(r => r.id), ['za', 'li'], '--countries limits the plan (any case), in the plan\'s order');
  });
  it('asks one query for a country (the US one for a state): the named golf courses as tags and bounding boxes, no geometry, and the numbered hole lines in the same answer', () => {
    const q = L.coursesQuery(L.regionsPlan(['ZA'])[0]!);
    assert.equal(q, ['[out:json][timeout:300];', 'area["ISO3166-1"="ZA"]->.a;', 'nwr(area.a)["leisure"="golf_course"]["name"]->.c;', '.c out tags bb;', 'way(area.a)["golf"="hole"]["ref"]->.h;', '.h out tags center;'].join('\n'));
    assert.ok(!/out geom|out body/.test(q), 'no geometry');
    const fl = L.coursesQuery(L.regionsPlan(['US'])[0]!, 180);
    assert.ok(fl.includes('area["ISO3166-2"="US-FL"]->.a;') && fl.startsWith('[out:json][timeout:180];'));
  });
  it('asks the named places of a country as tab-separated text (the US: once, for the whole country)', () => {
    const q = L.placesQuery(L.regionsPlan(['ZA'])[0]!);
    assert.ok(q.startsWith('[out:csv(::lat, ::lon, name, place; false)]') && q.includes('node(area.a)["place"~"^(city|town|village|suburb|hamlet)$"]["name"];') && q.endsWith('out;'));
    assert.ok(L.placesQuery(L.usPlaces, ['city', 'town']).includes('area["ISO3166-1"="US"]->.a;'));
  });
  it('is polite: its own User-Agent with no address, ten seconds at least between requests, a cache on disk, back-off', () => {
    assert.equal(L.UA, 'CapitalEmpire-catalogue/1.0 (dev script)');
    assert.ok(!/@|mailto|\.com|\.org/i.test(L.UA), 'the owner\'s address is not in it');
    const cli = readFileSync('scripts/dev/osm-course-catalogue.mjs', 'utf8');
    assert.ok(cli.includes("Math.max(10, Number(opt('gap', 10)))"), 'the gap can be raised, never lowered below ten seconds');
    assert.ok(cli.includes("'E:/ClaudeTemp/T378/cache'"), 'the cache is under E:/ClaudeTemp/T378/cache');
    assert.ok(/res\.status === 429/.test(cli) && /\[502, 503, 504, 509\]/.test(cli) && /retry-after/.test(cli), 'it backs off on 429 and 5xx');
    assert.ok(/stale map data/.test(cli), 'a mirror with old data is not used (kumi answered Texas from July with 139 of some 900 courses)');
    assert.ok(L.SERVERS[0]!.includes('overpass-api.de') && L.SERVERS.length >= 2);
  });
});

describe('the catalogue script: places and entries (T378)', () => {
  it('reads the places of a table and leaves the rows that do not read', () => {
    assert.equal(PLACES.length, 5);
    assert.deepEqual(PLACES[1], { lat: -25.831, lon: 28.28, name: 'Wingate Park', kind: 'suburb' });
  });
  it('gives a course its own place and its town: Wingatepark is in Wingate Park, Pretoria (a city within 20 km beats the nearer town of Irene)', () => {
    const p = new L.Places(PLACES);
    assert.deepEqual(p.near(-25.8308, 28.2804), { local: 'Wingate Park', town: 'Pretoria' });
    assert.deepEqual(p.near(-33.9525, 18.4932), { local: 'Rondebosch', town: 'Cape Town' });
    assert.deepEqual(p.near(-26.1558, 28.1396), { local: '', town: '' }, 'nothing near: no place (more than 40 km from the nearest)');
  });
  it('takes the town from a town when the nearest city is more than 20 km off, and from a far city only when there is no town', () => {
    const p = new L.Places([{ lat: 0, lon: 0, name: 'Bigcity', kind: 'city' }, { lat: 0.25, lon: 0, name: 'Smalltown', kind: 'town' }, { lat: 0.3, lon: 0.3, name: 'Hamlet', kind: 'hamlet' }]);
    assert.equal(p.near(0.26, 0).town, 'Smalltown', 'the city is 29 km off, the town 1 km');
    assert.equal(new L.Places([{ lat: 0, lon: 0, name: 'Bigcity', kind: 'city' }]).near(0.2, 0).town, 'Bigcity', 'only a city, 22 km: it is the town');
    assert.equal(new L.Places([{ lat: 0, lon: 0, name: 'Bigcity', kind: 'city' }]).near(0.5, 0).town, '', 'a city 55 km off is nobody\'s town');
    assert.equal(p.near(0.3, 0.31).local, 'Hamlet');
  });
  it('makes an entry of every named golf course: the reference by type, the name, the place, the centre to 4 decimals, the size in 10 m, the hole lines and the other names', () => {
    const es = L.entriesOf(ZA_ANSWER, { places: new L.Places(PLACES), cc: 'ZA' }), by = (name: string) => es.find(e => e[1] === name)!;
    assert.equal(es.length, 12, 'twelve named courses with a position (the unnamed-by-length and the position-less are left out; the duplicate point is still here)');
    const w = by('Wingatepark Country Club');
    assert.deepEqual(w.slice(0, 8), ['w4261725', 'Wingatepark Country Club', 'Wingate Park, Pretoria', -25.8308, 28.2804, 28, 49, 18]);
    assert.equal(by('Pitch & Putt Park')[0], 'n77'); assert.equal(by('Pitch & Putt Park')[5], 0, 'a point has no size');
    assert.equal(by('Pretoria Country Club')[2], 'Waterkloof, Pretoria', 'the course\'s own address beats the places');
    assert.equal(by('Royal Westgate')[8], 'The Old Course | Westgate GC', 'other names for the filter');
    assert.equal(by('Tokyo Golf Club')[1], 'Tokyo Golf Club'); assert.ok(by('Tokyo Golf Club')[8].includes('東京ゴルフ倶楽部'), 'the English name is shown and the native name still finds it');
    assert.equal(by('Glendower')[2], '', 'no place near: none');
  });
  it('counts the hole lines numbered 1..18 inside a course (each to the smallest outline that holds it): the game calls 9 or 18 Full', () => {
    const es = L.entriesOf(ZA_ANSWER, { places: null }), by = (name: string) => es.find(e => e[1] === name)!;
    assert.equal(by('Wingatepark Country Club')[7], 18); assert.equal(by('Rondebosch Golf Club')[7], 17); assert.equal(by('Glendower')[7], 9); assert.equal(by('Golf de Montréal')[7], 0);
    assert.deepEqual([18, 17, 9, 0].map(fullOf), [true, false, true, false]);
    // a hole line with no number, a number above 18, or none inside a course counts for nothing; two courses that overlap: the smaller keeps the hole
    const j = { elements: [way(1, 'Big Resort', [0, 0, 0.02, 0.02]), way(2, 'Small Course', [0.005, 0.005, 0.008, 0.008]), hole(10, 1, 0.006, 0.006), hole(11, 'A', 0.006, 0.006), hole(12, 19, 0.006, 0.006), hole(13, 2, 0.015, 0.015), hole(14, 3, 5, 5)] };
    const r = L.entriesOf(j, {}), n = (name: string) => r.find(e => e[1] === name)![7];
    assert.equal(n('Small Course'), 1, 'the hole inside both belongs to the smaller'); assert.equal(n('Big Resort'), 1, 'only hole 2, outside the small one');
  });
  it('adds the US state to the place, and is not fooled by empty and odd names', () => {
    const es = L.entriesOf({ elements: [way(1, 'Peachtree GC', [33.7, -84.4, 33.71, -84.39], { 'addr:city': 'Atlanta' }), way(2, 'Far Out GC', [10, 10, 10.01, 10.01]), way(3, ' ', [1, 1, 2, 2]), way(4, 'Name  with   spaces', [1, 1, 2, 2])] }, { suffix: 'GA' });
    assert.equal(es[0]![2], 'Atlanta, GA'); assert.equal(es[1]![2], 'GA'); assert.equal(es.length, 3); assert.equal(es[2]![1], 'Name with spaces');
  });
  it('shows the native name when the map has no Latin or English one, and the English name when it has', () => {
    assert.equal(L.displayName({ name: '東京ゴルフ倶楽部' }), '東京ゴルフ倶楽部');
    assert.equal(L.displayName({ name: '東京ゴルフ倶楽部', 'name:en': 'Tokyo Golf Club' }), 'Tokyo Golf Club');
    assert.equal(L.displayName({ name: 'Östersund Golfklubb', 'name:en': 'Ostersund' }), 'Östersund Golfklubb');
    assert.equal(L.otherNames({ name: 'A', alt_name: 'a;B', short_name: 'B' }, 'A'), 'B', 'no repeats, case blind');
  });
  it('is one course when a point and an outline of the same name lie within 600 m (the bigger outline stays); two of one name far apart are two', () => {
    const es = L.dedupe(L.entriesOf(ZA_ANSWER, {}));
    const d = es.filter(e => e[1] === 'Duplicate Golf Club');
    assert.equal(d.length, 1); assert.equal(d[0]![0], 'w85');
    const far = L.dedupe(L.entriesOf({ elements: [way(1, 'Same Name GC', [0, 0, 0.001, 0.001]), way(2, 'Same Name GC', [1, 1, 1.001, 1.001])] }, {}));
    assert.equal(far.length, 2);
  });
});

describe('the catalogue script: the chunks (T378)', () => {
  const entries = (cc: string, n: number): L.Entry[] => Array.from({ length: n }, (_, i) => [`w${i + 1}`, `${cc} course ${String(i).padStart(4, '0')}`, '', 1, 2, 10, 10, 0, '', cc] as L.Entry);
  it('a country with 150 courses or more is a chunk of its own; the small ones are packed together, up to 700, each entry with its country code', () => {
    const chunks = L.packChunks([{ cc: 'ZA', entries: entries('ZA', 300) }, ...['LU', 'MT', 'CY', 'IS', 'FJ', 'BB', 'KY', 'AW', 'CW', 'BM'].map(cc => ({ cc, entries: entries(cc, 100) }))]);
    assert.deepEqual(chunks.map(c => [c.id, c.cc, c.entries.length]), [['za', 'ZA', 300], ['rest1', '', 700], ['rest2', '', 300]]);
    assert.ok(chunks[0]!.entries.every(e => e[9] === ''), 'a chunk of one country leaves the country out of its entries');
    assert.ok(chunks[1]!.entries.every(e => e[9] !== '') && new Set(chunks[1]!.entries.map(e => e[9])).size === 7);
  });
  it('sorts each chunk by name, accents and case folded, and writes compact JSON that reads back (the empty tail of an entry is left out)', () => {
    const [c] = L.packChunks([{ cc: 'ZA', entries: L.entriesOf(ZA_ANSWER, { places: new L.Places(PLACES) }).concat(entries('ZA', 200)), at: '2026-11-09' }]);
    const names = c!.entries.map(e => L.fold(e[1]));
    assert.deepEqual(names, [...names].sort());
    const text = L.chunkText(c!, '2026-11-09'), f = JSON.parse(text) as { v: number; cc: string; credit: string; at: string; e: unknown[][] };
    assert.equal(f.v, 1); assert.equal(f.cc, 'ZA'); assert.equal(f.credit, '© OpenStreetMap contributors'); assert.equal(f.at, '2026-11-09'); assert.equal(f.e.length, c!.entries.length);
    assert.ok(f.e.every(r => r.length >= 8 && r.length <= 10));
    assert.equal(f.e.find(r => r[1] === 'Glendower')!.length, 8, 'no other names, no country: eight fields');
    assert.ok(text.split('\n').length === c!.entries.length + 3, 'one entry a line');
  });
  it('is read back by the game: every entry, with its country, hole lines and Full', () => {
    const names = new Map([['ZA', 'South Africa'], ['LU', 'Luxembourg']]);
    const za = parseChunk(JSON.parse(L.chunkText({ id: 'za', cc: 'ZA', entries: L.entriesOf(ZA_ANSWER, { places: new L.Places(PLACES) }) }, 'x')), names);
    const lu = parseChunk(JSON.parse(L.chunkText({ id: 'rest1', cc: '', entries: entries('LU', 3) }, 'x')), names);
    assert.equal(za.length, 12); assert.ok(za.every(e => e.cc === 'ZA' && e.country === 'South Africa'), 'the chunk\'s own country');
    assert.ok(lu.every(e => e.cc === 'LU' && e.country === 'Luxembourg'), 'a pack\'s entries carry their own');
    const w = za.find(e => e.name === 'Wingatepark Country Club')!;
    assert.equal(w.id, 'way/4261725'); assert.deepEqual(w.ref, { type: 'way', id: 4261725 }); assert.equal(w.place, 'Wingate Park, Pretoria'); assert.equal(w.holes, 18); assert.equal(w.full, true);
    assert.equal(w.w, 280); assert.equal(w.h, 490);
  });
});

describe('the catalogue script: regions asked in batches (T378)', () => {
  // on 2026-11-09 every query took 50 to 95 s whatever its size (Luxembourg, six courses: 79 s; Florida with 10 000 hole lines: 76 s), so regions are asked together
  const R = (...ids: string[]) => L.regionsPlan().filter(r => ids.includes(r.id));
  it('asks several regions in ONE request, each one\'s courses and hole lines followed by a count that marks where they end', () => {
    const q = L.batchQuery(R('za', 'us-fl'), 240);
    assert.equal(q, [
      '[out:json][timeout:240];',
      'area["ISO3166-1"="ZA"]->.a1;', 'nwr(area.a1)["leisure"="golf_course"]["name"]->.c1;', '.c1 out tags bb;', '.c1 out count;', 'way(area.a1)["golf"="hole"]["ref"]->.h1;', '.h1 out tags center;', '.h1 out count;',
      'area["ISO3166-2"="US-FL"]->.a2;', 'nwr(area.a2)["leisure"="golf_course"]["name"]->.c2;', '.c2 out tags bb;', '.c2 out count;', 'way(area.a2)["golf"="hole"]["ref"]->.h2;', '.h2 out tags center;', '.h2 out count;',
    ].join('\n'));
  });
  const count = (n: number): L.OverpassEl => ({ type: 'count', id: 0, tags: { nodes: '0', ways: String(n), relations: '0', total: String(n) } });
  it('takes a batch\'s answer apart into one answer a region, the shape a single region\'s answer has (as the real server answered Luxembourg and Liechtenstein in one request)', () => {
    const lu = [way(1, 'Golf Club Grand Ducal', [49.63, 6.2, 49.64, 6.21]), way(2, 'Golf de Clervaux', [50.05, 5.99, 50.06, 6.0])], luHoles = [hole(10, 1, 49.635, 6.205), hole(11, 2, 49.636, 6.206), hole(12, 1, 50.055, 5.995)];
    const answer = { version: 0.6, osm3s: { timestamp_osm_base: '2026-11-09T14:36:49Z' }, elements: [...lu, count(2), ...luHoles, count(3), count(0), hole(20, 1, 47.15, 9.5), count(1)] };
    const parts = L.splitBatch(answer, R('lu', 'li'));
    assert.deepEqual(parts.map(p => p.region.id), ['lu', 'li']);
    assert.equal(parts[0]!.answer.elements.length, 5); assert.equal(parts[1]!.answer.elements.length, 1, 'Liechtenstein: no named course, one hole line');
    assert.deepEqual(parts[0]!.answer.osm3s, { timestamp_osm_base: '2026-11-09T14:36:49Z' }, 'the answer\'s header goes with each part');
    assert.ok(parts.every(p => !p.answer.elements.some(e => e.type === 'count')), 'no count in a part');
    const es = L.entriesOf(parts[0]!.answer, { cc: 'LU' });
    assert.deepEqual(es.map(e => [e[1], e[7]]), [['Golf Club Grand Ducal', 2], ['Golf de Clervaux', 1]], 'a part reads as any region\'s answer: the holes belong to their course');
  });
  it('refuses an answer whose counts do not agree with what came, or that has the wrong number of sets (a cut-off answer is never kept)', () => {
    const rs = R('lu', 'li');
    assert.throws(() => L.splitBatch({ elements: [way(1, 'A', [0, 0, 1, 1]), count(2), count(0), count(0), count(0)] }, rs), /a count says 2 but 1 elements/);
    assert.throws(() => L.splitBatch({ elements: [way(1, 'A', [0, 0, 1, 1]), count(1), count(0)] }, rs), /2 sets came, 4 were asked for/);
    assert.throws(() => L.splitBatch({ elements: [count(0), count(0), count(0), count(0), way(1, 'A', [0, 0, 1, 1])] }, rs), /sets came/);
    assert.throws(() => L.splitBatch({ elements: [] }, rs), /0 sets came/);
    assert.throws(() => L.splitBatch(null, rs), /0 sets came/);
    assert.equal(L.splitBatch({ elements: [count(0), count(0), count(0), count(0)] }, rs).length, 2, 'two empty regions are fine');
  });
  it('asks the places of several countries in ONE request: their areas united', () => {
    const q = L.placesBatchQuery(R('gb', 'ie'), ['city', 'town']);
    assert.equal(q, ['[out:csv(::lat, ::lon, name, place; false)][timeout:300];', '(area["ISO3166-1"="GB"]; area["ISO3166-1"="IE"];)->.a;', 'node(area.a)["place"~"^(city|town)$"]["name"];', 'out;'].join('\n'));
  });
  it('batches the regions in the order they are asked: five US states to a request, the small countries together, a big country alone, cached regions left out', () => {
    const plan = L.regionsPlan(), ids = (b: L.Region[][]) => b.map(x => x.map(r => r.id).join('+'));
    const all = ids(L.batchPlan(plan));
    assert.equal(all[0], 'za+us-fl+us-ca+us-tx+us-mi', 'South Africa with the first US states: the batch takes regions while their courses stay within its budget, five states at most');
    assert.ok(all.every(b => b.split('+').length <= 12), 'twelve regions at most');
    assert.ok(all.includes('gb') && all.includes('ca'), 'a country of thousands of courses is a request of its own');
    assert.ok(all.some(b => b.includes('lu') && b.split('+').length > 5), 'the small countries many to a request');
    assert.deepEqual(plan.map(r => r.id).sort(), all.flatMap(b => b.split('+')).sort(), 'every region once');
    assert.equal(all.flatMap(b => b.split('+')).filter(id => id.startsWith('us-')).length, 51);
    const left = ids(L.batchPlan(plan, r => !['za', 'us-fl', 'us-ca'].includes(r.id)));
    assert.equal(left[0], 'us-tx+us-mi+us-ny+us-oh+us-pa', 'the ones kept are skipped, the rest batched from the front');
    assert.ok(all.length < 40, `${all.length} requests for ${plan.length} regions`);
  });
});

// ------------------------------------------------------------------------------------------------------------------------ the game's side
const NAMES = new Map([['ZA', 'South Africa'], ['US', 'United States'], ['GB', 'United Kingdom'], ['FR', 'France'], ['DE', 'Germany']]);
const row = (ref: string, name: string, place: string, cc: string, o: { w?: number; h?: number; holes?: number; alt?: string } = {}) => [ref, name, place, 1, 2, o.w ?? 100, o.h ?? 100, o.holes ?? 0, o.alt ?? '', cc];
const mini = (rows: unknown[][]): CatalogueEntry[] => parseChunk({ v: 1, cc: '', e: rows }, NAMES);
const CATALOGUE: CatalogueEntry[] = mini([
  row('w4261725', 'Wingatepark Country Club', 'Wingate Park, Pretoria', 'ZA', { holes: 18 }),
  row('w100', 'Wingate Golf Club', 'Wingate, County Durham', 'GB'),
  row('w101', 'Wing Golf Club', 'Wing, Rutland', 'GB'),
  row('w102', 'Swinging Hills Golf Course', 'Atlanta, GA', 'US', { w: 20, h: 20 }),
  row('w103', 'Pretoria Country Club', 'Waterkloof, Pretoria', 'ZA', { holes: 9, w: 300, h: 200 }),
  row('w104', 'Country Club of Pretoria North', 'Pretoria', 'ZA'),
  row('w105', 'Golf de Montréal', 'Montréal', 'FR'),
  row('w106', 'Straße der Golfer', 'Düsseldorf', 'DE'),
  row('w107', 'Royal Westgate', 'Canterbury', 'GB', { alt: 'The Old Course | Westgate GC' }),
  row('w108', 'Ostfold Golfklubb', 'Östersund', 'DE'),
  row('w109', "St Andrew's Links", "St Andrews, Fife", 'GB'),
  row('n110', 'Pitch & Putt', 'Wingate Park, Pretoria', 'ZA', { w: 0, h: 0 }),
]);

describe('what the files hold, as the game reads them (T378)', () => {
  it('folds case, accents and the letters NFD cannot take apart, and splits a text into words (an apostrophe joins)', () => {
    assert.equal(fold('Östersund Montréal STRAßE Æble Ølstykke Łódź Đakovo Œuvre Işık'), 'ostersund montreal strasse aeble olstykke lodz dakovo oeuvre isik');
    assert.deepEqual(wordsOf("St Andrew's Links, (Old) Course-2"), ['st', 'andrews', 'links', 'old', 'course', '2']);
    assert.deepEqual(wordsOf('  '), []);
  });
  it('reads a reference ("w4261725" is a way) and the reference of a hole count (9 or 18 is Full)', () => {
    assert.deepEqual(refOfTag('w4261725'), { type: 'way', id: 4261725 }); assert.deepEqual(refOfTag('r5'), { type: 'relation', id: 5 }); assert.deepEqual(refOfTag('n9'), { type: 'node', id: 9 });
    for (const bad of ['x5', 'w', 'w-5', '', 5, null, 'way/5', 'w12345678901234']) assert.equal(refOfTag(bad), null, String(bad));
    assert.deepEqual([0, 8, 9, 17, 18].map(fullOf), [false, false, true, false, true]);
  });
  it('reads an index and leaves out what is wrong with it (a chunk file with a name that is not a plain file name is never fetched)', () => {
    const ok: CatalogueIndex = { v: 1, built: '2026-11-09', credit: '© OpenStreetMap contributors', licence: 'ODbL', total: 7, countries: [{ cc: 'ZA', country: 'South Africa', n: 5 }, { cc: 'LU', country: 'Luxembourg', n: 2 }],
      chunks: [{ file: 'za.abcd1234.json', id: 'za', cc: 'ZA', n: 5, ccs: { ZA: 5 }, bytes: 10, gz: 5, at: '2026-11-09' }, { file: '../../secret.json', id: 'x', cc: '', n: 1, ccs: {}, bytes: 1, gz: 1, at: '' }, { file: 'a/b.json', id: 'y', cc: '', n: 1, ccs: {}, bytes: 1, gz: 1, at: '' }] };
    const i = parseIndex(ok)!;
    assert.deepEqual(i.chunks.map(c => c.file), ['za.abcd1234.json']); assert.equal(i.countries.length, 2);
    assert.equal(parseIndex(null), null); assert.equal(parseIndex({ v: 2, chunks: [], countries: [] }), null); assert.equal(parseIndex({ v: 1 }), null); assert.equal(parseIndex('x'), null);
  });
  it('reads a chunk row by row: a row that does not read is left out, the rest stand', () => {
    const es = parseChunk({ v: 1, cc: 'ZA', e: [row('w1', 'Good', 'Town', ''), ['bad'], null, row('w2', '', 'x', ''), ['w3', 'No position', '', 'a', 'b', 0, 0, 0], row('x4', 'Bad ref', '', ''), ['w5', 'Far', '', 99, 200, 0, 0, 0], row('w6', 'Holes', '', '', { holes: 40 })] }, NAMES);
    assert.deepEqual(es.map(e => e.name), ['Good', 'Holes']); assert.equal(es[1]!.holes, 18, 'clamped to 18'); assert.equal(es[0]!.country, 'South Africa');
    assert.deepEqual(parseChunk(null), []); assert.deepEqual(parseChunk({ e: 'nope' }), []);
  });
});

describe('the filter list (T378: "wing" finds Wingatepark Country Club)', () => {
  const names = (q: string, o: Parameters<typeof filterCatalogue>[2] = {}) => filterCatalogue(CATALOGUE, q, o).rows.map(e => e.name);
  it('narrows as the player types: "wing" lists the courses with a word starting "wing", then "wingatep" is the one', () => {
    const wing = names('wing');
    assert.ok(wing.includes('Wingatepark Country Club') && wing.includes('Wingate Golf Club') && wing.includes('Wing Golf Club'));
    assert.ok(wing.includes('Swinging Hills Golf Course'), 'and a course with "wing" inside a word, after those');
    assert.ok(wing.indexOf('Swinging Hills Golf Course') > wing.indexOf('Wingatepark Country Club'), 'the substring comes after the word starts');
    assert.deepEqual(names('wingatep'), ['Wingatepark Country Club']);
    assert.deepEqual(names('wingatepark country'), ['Wingatepark Country Club']);
  });
  it('matches any word of the name or of the town or the country, every word typed having to match', () => {
    assert.deepEqual(names('pretoria').sort(), ['Country Club of Pretoria North', 'Pitch & Putt', 'Pretoria Country Club', 'Wingatepark Country Club'], 'the town');
    assert.deepEqual(names('country club pretoria').sort(), ['Country Club of Pretoria North', 'Pretoria Country Club', 'Wingatepark Country Club']);
    assert.deepEqual(names('club of north'), ['Country Club of Pretoria North'], 'words of the name, in any order');
    assert.deepEqual(names('south africa putt'), ['Pitch & Putt'], 'the country');
    assert.deepEqual(names('fife'), ["St Andrew's Links"], 'a town word');
    assert.deepEqual(names('zzz'), []); assert.deepEqual(names('wing zzz'), []);
  });
  it('does not care about capitals or accents, in the name, the town or what is typed', () => {
    assert.deepEqual(names('MONTREAL'), ['Golf de Montréal']); assert.deepEqual(names('montréal'), ['Golf de Montréal']);
    assert.deepEqual(names('strasse'), ['Straße der Golfer']); assert.deepEqual(names('STRAßE'), ['Straße der Golfer']);
    assert.deepEqual(names('dusseldorf'), ['Straße der Golfer'], 'the town');
    assert.deepEqual(names('ostersund').sort(), ['Ostfold Golfklubb'], 'Östersund the town');
    assert.deepEqual(names('andrews'), ["St Andrew's Links"], 'an apostrophe does not split a word'); assert.deepEqual(names("andrew's"), ["St Andrew's Links"]);
  });
  it('finds a course by one of its other names', () => {
    assert.deepEqual(names('old course'), ['Royal Westgate']); assert.deepEqual(names('westgate gc'), ['Royal Westgate']);
  });
  it('ranks a match in the name over one in the town, the name\'s first word over a later one, a Full and a bigger course over a smaller, the player\'s country first', () => {
    assert.equal(names('country')[0], 'Country Club of Pretoria North', 'a name that starts with the word beats one where it is the second word');
    assert.equal(names('pretoria')[0], 'Pretoria Country Club', 'the name that starts with Pretoria beats those in Pretoria');
    assert.ok(names('pretoria').indexOf('Pretoria Country Club') < names('pretoria').indexOf('Wingatepark Country Club'));
    const pref = names('wing', { prefer: 'ZA' }), plain = names('wing');
    assert.equal(pref[0], 'Wingatepark Country Club', 'the player is in South Africa'); assert.ok(plain.length === pref.length);
    assert.equal(names('wing', { prefer: 'GB' })[0] !== 'Wingatepark Country Club', true, 'in Britain the British Wing courses are first');
  });
  it('limits to a country, and with nothing typed lists that country\'s courses by name (nothing for no country)', () => {
    assert.deepEqual(names('wing', { cc: 'GB' }).sort(), ['Wing Golf Club', 'Wingate Golf Club']);
    assert.deepEqual(names('', { cc: 'ZA' }), ['Country Club of Pretoria North', 'Pitch & Putt', 'Pretoria Country Club', 'Wingatepark Country Club']);
    assert.deepEqual(filterCatalogue(CATALOGUE, '', {}), { rows: [], matched: 0, words: [] }); assert.deepEqual(filterCatalogue(CATALOGUE, '   ', {}).rows, []);
  });
  it('lists at most LIST_MAX courses and says how many matched', () => {
    const big = mini(Array.from({ length: 300 }, (_, i) => row(`w${i + 1}`, `Golf Club ${i}`, 'Town', 'ZA')));
    const f = filterCatalogue(big, 'golf');
    assert.equal(f.rows.length, LIST_MAX); assert.equal(f.matched, 300); assert.deepEqual(f.words, ['golf']);
    assert.equal(filterCatalogue(big, 'golf', { limit: 5 }).rows.length, 5);
    assert.equal(filterCatalogue(big, 'golf club 299').matched, 1);
  });
  it('is quick over the whole world\'s names (35 000 courses: a keystroke in a few tens of milliseconds)', () => {
    const many = mini(Array.from({ length: 35000 }, (_, i) => row(`w${i + 1}`, `Golf ${String.fromCharCode(65 + (i % 26))}${i} Country Club ${i % 7}`, `Town ${i % 997}`, ['ZA', 'US', 'GB', 'FR'][i % 4]!)));
    const t0 = performance.now();
    for (const q of ['g', 'gol', 'golf cou', 'club 3 town 12']) filterCatalogue(many, q, { prefer: 'ZA' });
    assert.ok(performance.now() - t0 < 1500, `four keystrokes took ${Math.round(performance.now() - t0)} ms`);
  });
  it('reads the player\'s country from the browser\'s languages', () => {
    assert.equal(regionOfLocale(['en-ZA', 'en']), 'ZA'); assert.equal(regionOfLocale(['en', 'af-NA']), 'NA', 'the first that names a region'); assert.equal(regionOfLocale('en-GB'), 'GB');
    assert.equal(regionOfLocale(['en', 'fr']), ''); assert.equal(regionOfLocale(undefined), ''); assert.equal(regionOfLocale(['!!!']), '');
  });
});

describe('the loader: lazy, the player\'s country first, three files at a time (T378)', () => {
  const idx = (): CatalogueIndex => ({
    v: 1, built: '2026-11-09', credit: '© OpenStreetMap contributors', licence: 'ODbL 1.0', total: 9,
    countries: [{ cc: 'ZA', country: 'South Africa', n: 2 }, { cc: 'US', country: 'United States', n: 3 }, { cc: 'GB', country: 'United Kingdom', n: 2 }, { cc: 'FR', country: 'France', n: 1 }, { cc: 'DE', country: 'Germany', n: 1 }],
    chunks: [
      { file: 'za.1.json', id: 'za', cc: 'ZA', n: 2, ccs: { ZA: 2 }, bytes: 1, gz: 1, at: '' }, { file: 'us.1.json', id: 'us', cc: 'US', n: 3, ccs: { US: 3 }, bytes: 1, gz: 1, at: '' },
      { file: 'gb.1.json', id: 'gb', cc: 'GB', n: 2, ccs: { GB: 2 }, bytes: 1, gz: 1, at: '' }, { file: 'rest1.1.json', id: 'rest1', cc: '', n: 2, ccs: { FR: 1, DE: 1 }, bytes: 1, gz: 1, at: '' },
    ],
  });
  const files = (): Record<string, unknown> => ({
    'catalogue/index.json': idx(),
    'catalogue/za.1.json': { v: 1, cc: 'ZA', e: [row('w1', 'Wingatepark Country Club', 'Wingate Park, Pretoria', ''), row('w2', 'Rondebosch Golf Club', 'Cape Town', '')] },
    'catalogue/us.1.json': { v: 1, cc: 'US', e: [row('w3', 'Augusta National', 'Augusta, GA', ''), row('w4', 'Pebble Beach', 'Pebble Beach, CA', ''), row('w1', 'Wingatepark Country Club', 'duplicate id', '')] },
    'catalogue/gb.1.json': { v: 1, cc: 'GB', e: [row('w5', 'Wingate Golf Club', 'Wingate', ''), row('w6', 'St Andrews Old Course', 'St Andrews', '')] },
    'catalogue/rest1.1.json': { v: 1, cc: '', e: [row('w7', 'Golf de Montréal', 'Montréal', 'FR'), row('w8', 'Straße der Golfer', 'Düsseldorf', 'DE')] },
  });
  /** a loader on those files; `log` is every URL asked, in order; `max` the most requests at once; `fail` the URLs that cannot be read (empty it to let them through) */
  const loader = (over: Record<string, unknown> = {}, failing: string[] = []) => {
    const f = { ...files(), ...over }, log: string[] = [], state = { now: 0, max: 0 }, fail = [...failing];
    const get = async (url: string): Promise<unknown> => {
      log.push(url); state.now++; state.max = Math.max(state.max, state.now);
      await new Promise(r => setTimeout(r, 1));
      state.now--;
      if (fail.includes(url) || !(url in f)) throw new Error(`HTTP 404 for ${url}`);
      return f[url];
    };
    return { cat: new Catalogue(get, 'catalogue/'), log, state, fail };
  };

  it('asks nothing until it is opened, then the index first and every chunk once', async () => {
    const { cat, log } = loader();
    assert.equal(log.length, 0); assert.equal(cat.status, 'idle'); assert.equal(cat.entries.length, 0);
    await cat.open();
    assert.equal(log[0], 'catalogue/index.json'); assert.deepEqual([...log].sort(), ['catalogue/gb.1.json', 'catalogue/index.json', 'catalogue/rest1.1.json', 'catalogue/us.1.json', 'catalogue/za.1.json']);
    assert.equal(cat.status, 'ready'); assert.equal(cat.done, 4); assert.equal(cat.of, 4); assert.equal(cat.failed, 0);
    await cat.open(); assert.equal(log.length, 5, 'opening again asks nothing more');
  });
  it('loads the player\'s country\'s file first, then the rest in the index\'s order', async () => {
    const { cat, log } = loader();
    await cat.open('GB');
    assert.deepEqual(log.slice(0, 2), ['catalogue/index.json', 'catalogue/gb.1.json']);
    assert.deepEqual(log.slice(2), ['catalogue/za.1.json', 'catalogue/us.1.json', 'catalogue/rest1.1.json']);
    assert.deepEqual(chunkOrder(idx(), 'DE').map(c => c.id), ['rest1', 'za', 'us', 'gb'], 'a country inside a pack finds its pack');
    assert.deepEqual(chunkOrder(idx(), 'XX').map(c => c.id), ['za', 'us', 'gb', 'rest1']); assert.deepEqual(chunkOrder(idx()).map(c => c.id), ['za', 'us', 'gb', 'rest1']);
  });
  it('asks three files at a time at most', async () => {
    const many = idx(); many.chunks = Array.from({ length: 12 }, (_, i) => ({ file: `c${i}.json`, id: `c${i}`, cc: 'ZA', n: 1, ccs: { ZA: 1 }, bytes: 1, gz: 1, at: '' }));
    const over: Record<string, unknown> = { 'catalogue/index.json': many };
    for (let i = 0; i < 12; i++) over[`catalogue/c${i}.json`] = { v: 1, cc: 'ZA', e: [row(`w${i + 1}`, `Course ${i}`, '', '')] };
    const { cat, state } = loader(over);
    await cat.open();
    assert.equal(cat.entries.length, 12); assert.equal(state.max, 3);
  });
  it('tells the card after every step, and the list narrows over what has arrived', async () => {
    const { cat } = loader(), seen: { files: number; courses: number; wing: number }[] = [];
    cat.subscribe(() => seen.push({ files: cat.done, courses: cat.entries.length, wing: filterCatalogue(cat.entries, 'wing').matched }));
    const v0 = cat.version;
    await cat.open('ZA');
    assert.ok(cat.version > v0 + 4, 'a step for the index, one per file and one for the end');
    assert.ok(seen.some(s => s.files === 1 && s.wing === 1), 'after the first file (South Africa) Wingatepark is already there');
    assert.ok(seen.some(s => s.courses === 0) || seen[0]!.courses === 0, 'and before the index nothing is');
    assert.equal(seen.at(-1)!.courses, 8, 'in the end all the courses, a duplicate id once'); assert.equal(seen.at(-1)!.wing, 2);
    assert.equal(cat.entries.find(e => e.id === 'way/1')!.place, 'Wingate Park, Pretoria', 'the first one read stays');
  });
  it('a file that cannot be read does not stop the others; Try again asks for that one only', async () => {
    const { cat, log, fail } = loader({}, ['catalogue/us.1.json']);
    await cat.open();
    assert.equal(cat.status, 'ready'); assert.equal(cat.failed, 1); assert.equal(cat.done, 3); assert.equal(cat.entries.length, 6);
    assert.match(cat.error, /1 of 4 files of course names could not be read/); assert.match(cat.summary(), /^6 golf courses in 5 countries\. 1 of 4 files of course names could not be read\.$/);
    fail.length = 0; log.length = 0;
    await cat.retry();
    assert.deepEqual(log, ['catalogue/us.1.json'], 'only the file that failed');
    assert.equal(cat.failed, 0); assert.equal(cat.entries.length, 8); assert.equal(cat.error, ''); assert.equal(cat.status, 'ready');
  });
  it('says so when the index cannot be read, and Try again asks for it again', async () => {
    const { cat, log, fail } = loader({}, ['catalogue/index.json']);
    await cat.open();
    assert.equal(cat.status, 'failed'); assert.match(cat.error, /could not be read/); assert.equal(log.length, 1, 'no chunk is asked without an index'); assert.equal(cat.summary(), cat.error);
    fail.length = 0;
    await cat.retry('ZA');
    assert.equal(cat.status, 'ready'); assert.equal(cat.entries.length, 8);
    const bad = loader({ 'catalogue/index.json': { v: 9 } });
    await bad.cat.open(); assert.equal(bad.cat.status, 'failed'); assert.match(bad.cat.error, /not in this build/);
    const none = loader({}, ['catalogue/za.1.json', 'catalogue/us.1.json', 'catalogue/gb.1.json', 'catalogue/rest1.1.json']);
    await none.cat.open(); assert.equal(none.cat.status, 'failed', 'an index and no course at all is a failure too'); assert.match(none.cat.error, /could not be read/);
  });
  it('words what it has: how many courses in how many countries, and how far the loading is', async () => {
    const { cat } = loader(), said: string[] = [];
    assert.equal(cat.summary(), 'Loading the course names...');
    cat.subscribe(() => said.push(cat.summary()));
    await cat.open('ZA');
    assert.ok(said.some(t => /^\d+ of 9 golf courses in 5 countries \(loading: \d of 4 files\)$/.test(t)), `while loading: ${said.join(' | ')}`);
    assert.equal(cat.summary(), '8 golf courses in 5 countries');
  });
  it('lists the countries, the one with the most courses first (then by name)', () => {
    assert.deepEqual(countriesByCount(idx()).map(c => c.cc), ['US', 'ZA', 'GB', 'FR', 'DE']);
  });
  it('looks for its files under the page\'s base: catalogue/ (public/catalogue/ in the repository)', () => {
    assert.equal(CATALOGUE_DIR, 'catalogue/'); assert.equal(catalogueBase(), './catalogue/', 'with no bundler, the page\'s own folder');
  });
});

describe('the catalogue is not in the game\'s start-up bundle (T378)', () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : []; });
  it('no module of src imports a catalogue file or the catalogue\'s module statically, except the module itself (the picker loads it when it opens)', () => {
    for (const f of walk('src')) {
      const text = readFileSync(f, 'utf8').replace(/\\/g, '/');
      assert.ok(!/from\s+['"][^'"]*public\/catalogue/.test(text) && !/import\(['"][^'"]*public\/catalogue/.test(text), `${f} imports a catalogue file`);
      // (other modules are called catalogue too: the businesses', the cards': a specifier counts when it resolves to src/game/golf/osm/catalogue)
      const here = dirname(resolve(f)), target = resolve('src/game/golf/osm/catalogue');
      const statics = [...text.matchAll(/^(?:import|export)\s+(?!type\b)[^;]*from\s+['"]([^'"]+)['"]/gm)].filter(m => m[1]!.startsWith('.') && resolve(here, m[1]!) === target);
      assert.equal(statics.length, 0, `${f} imports the catalogue module statically`);
    }
    const picker = readFileSync('src/ui/golf/CoursePicker.tsx', 'utf8');
    assert.ok(/import\('\.\.\/\.\.\/game\/golf\/osm\/catalogue'\)/.test(picker), 'the picker imports it dynamically');
  });
  it('the data lives in public/catalogue/ as plain JSON files (never inside the code)', () => {
    const dir = 'public/catalogue';
    const files = readdirSync(dir);
    assert.ok(files.includes('index.json'));
    const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as CatalogueIndex;
    assert.ok(parseIndex(index), 'the shipped index reads');
    for (const c of index.chunks) assert.ok(files.includes(c.file), `${c.file} is listed and there`);
    assert.deepEqual(files.filter(f => f !== 'index.json').sort(), index.chunks.map(c => c.file).sort(), 'and nothing else is there');
  });
});
