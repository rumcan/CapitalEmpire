// The names module's headless tests (T012): no duplicate road names in 2,000 draws per town (and per class),
// stable names for the same seed and keys across instances, junction names with the bigger road first, the
// per-class formats, and 20 printed samples of each kind for an eyeball (towns, every road class, the grid,
// junctions, bridges, tunnels, stations, businesses).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Names, ordinal, roadRank, shortName } from '../src/game/ext/names/index';

/** a road name without its trailing class word, for the widening check */
const stem = (s: string): string => s.replace(/\s+(Street|Avenue|Boulevard|Lane)$/, '');

test('towns: stable for the same seed and index in any ask order, distinct, a new seed renames the valley', () => {
  const a = new Names(42), b = new Names(42), c = new Names(43);
  const first = Array.from({ length: 50 }, (_, i) => a.town(i));
  assert.deepEqual(Array.from({ length: 50 }, (_, i) => b.town(49 - i)).reverse(), first, 'same seed, reverse ask order');
  assert.equal(new Set(Array.from({ length: 200 }, (_, i) => a.town(i))).size, 200, '200 towns, no repeat');
  assert.ok(first.filter((t, i) => t !== c.town(i)).length >= 45, 'another seed, (nearly) every town renamed');
  assert.ok(first.every(t => t.length > 2 && !/undefined|NaN/.test(t)));
  console.log(`names towns (20 of ${a.townCount} before prefixes): ${first.slice(0, 20).join(' | ')}`);
});

test('roads: no duplicate names in 2,000 draws per town', () => {
  const n = new Names(7), t0 = performance.now();
  for (let t = 0; t < 3; t++) {
    const town = n.town(t), got = new Set<string>();
    for (let i = 0; i < 2000; i++) got.add(n.road(`${town}-r${i}`, 'street', town));
    assert.equal(got.size, 2000, `${town}: 2,000 streets, no repeat`);
  }
  console.log(`names roads: 3 towns x 2,000 streets in ${(performance.now() - t0).toFixed(1)} ms`);
});

test('roads: 2,000 draws of every class are distinct and in the class format', () => {
  const named: [string, RegExp][] = [['gravel', / Lane$/], ['lane', / Lane$/], ['street', / Street$/], ['avenue', / Avenue$/], ['boulevard', / Boulevard$/]];
  const numbered: [string, RegExp][] = [['road', /^County Road \d+$/], ['arterial', /^Route \d+$/], ['highway', /^I-\d+$/]];
  for (const [cls, re] of [...named, ...numbered]) {
    const n = new Names(99), got = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const s = n.road(`k${i}`, cls, 'Test Town');
      assert.match(s, re, `${cls}: ${s}`);
      got.add(s);
    }
    assert.equal(got.size, 2000, `${cls}: 2,000 draws, no repeat`);
  }
  // a stem is spent once per town across the named classes: no Maple Street beside a Maple Avenue
  const n = new Names(5), stems = new Set<string>();
  for (let i = 0; i < 500; i++) stems.add(stem(n.road(`m${i}`, i % 2 ? 'avenue' : 'street', 'Test Town')).toLowerCase());
  assert.equal(stems.size, 500, 'mixed streets and avenues share no stem in one town');
  assert.match(new Names(1).road('x', 'not-a-class'), / Street$/, 'an unknown class names a street');
  assert.match(new Names(1).road('x', 'AVE'), / Avenue$/, 'aliases are case-insensitive');
  assert.match(new Names(1).road('x', 'interstate'), /^I-\d+$/, "'interstate' is a highway");
});

test('roads: stable for the same keys across instances; a widened road keeps its stem', () => {
  const draws = (n: Names): string[] => Array.from({ length: 60 }, (_, i) => n.road(`route-${i}`, ['lane', 'street', 'avenue', 'road', 'arterial', 'boulevard', 'highway'][i % 7]!, n.town(i % 3)));
  const a = new Names(1234);
  assert.deepEqual(draws(new Names(1234)), draws(a), 'same seed, same keys, same order: the same map of names');
  assert.equal(a.road('route-1', 'street', a.town(1)), a.road('route-1', 'street', a.town(1)), 'a repeat call is the same string');
  assert.notDeepEqual(draws(new Names(1235)), draws(a), 'another seed renames the roads');
  const w = new Names(8), before = w.road('main-rd', 'street', 'Test Town'), after = w.road('main-rd', 'avenue', 'Test Town');
  assert.equal(stem(before), stem(after), `${before} widened keeps its stem as ${after}`);
});

test('grid and ordinals: 3rd Street and its kin, in line order', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112, 113].map(ordinal),
    ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th', '112th', '113th']);
  const n = new Names(3);
  assert.equal(n.grid(3), '3rd Street');
  assert.equal(n.grid(5, 'avenue'), '5th Avenue');
  assert.equal(new Set(Array.from({ length: 200 }, (_, i) => n.grid(i + 1))).size, 200, '200 grid lines, no repeat');
  console.log(`names grid (20): ${Array.from({ length: 20 }, (_, i) => n.grid(i + 1, i % 4 === 3 ? 'avenue' : 'street')).join(' | ')}`);
});

test('junctions: the bigger road first, short forms, repeats and empties handled', () => {
  const n = new Names(11);
  assert.equal(n.junction(['3rd Street', 'Maple Avenue']), 'Maple Ave & 3rd St');
  assert.equal(n.junction(['Maple Avenue', 'Maple Avenue', 'Elm Street']), 'Maple Ave & Elm St', 'a through road counts once');
  assert.equal(n.junction(['Maple Avenue', 'Maple Ave', 'Elm Street']), 'Maple Ave & Elm St', 'the full and short form of one road count once');
  assert.equal(n.junction(['Elm Street', 'Route 9', 'I-84']), 'I-84 & Route 9');
  assert.equal(n.junction(['County Road 12', 'Sunset Boulevard']), 'Sunset Blvd & CR 12');
  assert.equal(n.junction(['Elm Street', 'Oak Street']), 'Elm St & Oak St', 'a tie keeps the caller order');
  assert.equal(n.junction(['Maple Ave', '3rd St']), 'Maple Ave & 3rd St', 'short forms in, short forms out');
  assert.equal(n.junction(['Maple Avenue']), 'Maple Ave');
  assert.equal(n.junction([]), '');
  assert.equal(n.junction(['', '  ']), '');
  assert.ok(roadRank('I-84') > roadRank('Route 9') && roadRank('Route 9') > roadRank('X Boulevard')
    && roadRank('X Boulevard') > roadRank('X Avenue') && roadRank('X Avenue') > roadRank('County Road 3')
    && roadRank('X Road') > roadRank('X Street') && roadRank('X Street') > roadRank('X Lane'), 'the rank ladder');
  assert.equal(shortName('Maple Avenue'), 'Maple Ave');
  assert.equal(shortName(shortName('County Road 12')), 'CR 12', 'shortening is idempotent');
  const pairs = Array.from({ length: 20 }, (_, i) => n.junction([n.road(`j${i}a`, 'street', 'Test Town'), n.road(`j${i}b`, i % 3 ? 'avenue' : 'arterial', 'Test Town')]));
  console.log(`names junctions (20): ${pairs.join(' | ')}`);
});

test('bridges, tunnels and stations: stable, in form, and honest about what they cross', () => {
  const n = new Names(21);
  for (let i = 0; i < 50; i++) {
    const road = n.road(`b${i}`, i % 2 ? 'avenue' : 'arterial', 'Test Town');
    assert.match(n.bridge(road, true), /Bridge$/, `over water: ${road}`);
    assert.match(n.bridge(road, false), /(Overpass|Viaduct)$/, `not over water: ${road}`);
    assert.match(n.tunnel(road), /Tunnel$/, road);
    assert.equal(n.bridge(road, true), n.bridge(road, true), 'a bridge name is stable');
  }
  assert.equal(n.bridge('Old Stone Bridge', true), 'Old Stone Bridge', 'already a bridge');
  assert.equal(n.tunnel('Liberty Tunnel'), 'Liberty Tunnel');
  assert.match(n.bridge('Bridge Avenue', true), /Bridge$/, 'a road called Bridge Avenue is a road, and bridges');
  assert.equal(n.station('Maple Avenue'), 'Maple Avenue Station');
  assert.equal(n.station('Maple Ave & 3rd St'), 'Maple Ave & 3rd St Station');
  assert.equal(n.station('Union Station'), 'Union Station');
  assert.match(n.station(''), /Station$/, 'nothing nearby still names a station');
  const roads = Array.from({ length: 20 }, (_, i) => n.road(`s${i}`, 'street', 'Test Town'));
  console.log(`names bridges over water (20): ${roads.map(r => n.bridge(r, true)).join(' | ')}`);
  console.log(`names bridges not over water (20): ${roads.map(r => n.bridge(r, false)).join(' | ')}`);
  console.log(`names tunnels (20): ${roads.map(r => n.tunnel(r)).join(' | ')}`);
  console.log(`names stations (20): ${roads.map(r => n.station(r)).join(' | ')}`);
});

test('businesses: named by type and place, stable, the spec examples in reach', () => {
  const n = new Names(31);
  assert.equal(n.business('stadium', 'Riverside'), 'Riverside Stadium');
  assert.match(n.business('tackle', 'Bass Lake'), /Tackle/, 'the Bass Lake tackle shop');
  assert.equal(n.business('tackle', 'Bass Lake'), n.business('tackle', 'Bass Lake'), 'stable for the same inputs');
  const cases: [string, string, RegExp][] = [
    ['stadium', 'Riverside', /Stadium$/], ['sports-bar', 'Maplewood', /Sports Bar$/], ['tackle', 'Bass Lake', /Tackle/],
    ['diner', 'Elk Creek', /Diner$/], ['bakery', 'Elk Creek', /Bakery$/], ['hotel', 'Riverton', /Hotel$/],
    ['motel', 'Route 9', /Motel$/], ['golf', 'Pine Valley', /(Golf Course|Country Club)$/], ['golf-estate', 'Pine Valley', /Estates$/],
    ['casino', 'Riverside', /Casino$/], ['taxi', 'Maplewood', /Taxi Co\.$/], ['bus-company', 'Riverton', /Bus Lines$/],
    ['garage', 'Mill Creek', /Garage$/], ['hardware', 'Stonebridge', /Hardware$/], ['farm', 'Sugar Valley', /(Farm|Farms)$/],
    ['marina', 'Bass Lake', /Marina$/], ['cinema', 'Riverton', /Theater$/], ['bookstore', 'Maplewood', /^Maplewood Bookstore$/],
    ['fishing-resort', 'Bass Lake', /Resort$/], ['cafe', 'Cedar Grove', /Cafe$/],
  ];
  for (const [type, place, re] of cases) assert.match(n.business(type, place), re, `${type} at ${place}`);
  assert.ok(n.business('stadium', '').endsWith('Stadium'), 'no place still names the business');
  console.log(`names businesses (20): ${cases.map(([t, p]) => n.business(t, p)).join(' | ')}`);
});

test('samples: 20 of every road class for an eyeball', () => {
  const n = new Names(2026), town = n.town(0);
  for (const cls of ['gravel', 'lane', 'street', 'road', 'avenue', 'arterial', 'boulevard', 'highway']) {
    const got = Array.from({ length: 20 }, (_, i) => n.road(`${cls}-${i}`, cls, town));
    assert.equal(new Set(got).size, 20, cls);
    console.log(`names ${cls} (20): ${got.join(' | ')}`);
  }
});
