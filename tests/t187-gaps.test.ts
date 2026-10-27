// T187 (#476): the toolbar's gaps after the regroup. Each tool reachable from its group (Town decoration's Props and Buildings, Decoration's
// Props); props by place (the category table, the filter, where an item stands, the town's spot rule); the halfway house (its spot rule, its
// takings, its business and art, its save) and a town building's save.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAT_PLACE, DECOR, DECOR_BY_KEY, decorKeyOf, decorSpotWhy, lotTouches, placeOf, propTuple, shownIn, standsIn, tupleMarks, type Box, type DecorSpot } from '../src/game/golf/decor';
import { HALFWAY_COST, HALFWAY_TEE_REACH, halfwaySpotWhy, halfwayTakings, type HalfwaySpot } from '../src/game/golf/halfway';
import { BUSINESS, knownBusinesses } from '../src/game/business/catalogue';
import { businessArt } from '../src/game/business/art';
import { LIBRARY } from '../src/game/library';
import { RAIL, entryKey, pickEntry, railItemsOf, toolsIn } from '../src/ui/rail-items';

const by = (k: string) => DECOR_BY_KEY.get(k)!;

test('each tool is reachable from its group: Decoration › Props (the course), Town decoration › Props and Buildings (the town)', () => {
  const decor = RAIL.find(r => r.id === 'decor')!, town = RAIL.find(r => r.id === 'towndecor')!;
  assert.deepEqual(toolsIn(decor, true).map(entryKey), ['path', 'props:course:']);
  assert.deepEqual(toolsIn(town, true).map(entryKey), ['paint', 'props:town:', 'props:town:buildings']);
  assert.deepEqual(toolsIn(town, false).map(entryKey), ['paint', 'business'], 'the classic game keeps its Business tool');
  assert.deepEqual(railItemsOf('props').map(r => r.id), ['decor', 'towndecor']);
  assert.equal(pickEntry(town, true, null, 'props:town:buildings')?.label, 'Buildings', 'the entry opened last comes back');
  assert.equal(pickEntry(town, true, null)?.id, 'paint');
});

test('props by place: the category table, the filter by the group opened from, All, and where an item stands', () => {
  assert.equal(CAT_PLACE['Street furniture'], 'both'); assert.equal(CAT_PLACE['Business artwork'], 'course'); assert.equal(CAT_PLACE['Golf tournament'], 'course');
  assert.equal(placeOf(by('bench')), 'both'); assert.equal(placeOf(by('lamp')), 'both'); assert.equal(placeOf(by('flower-bed')), 'both');
  assert.equal(placeOf(by('trolley')), 'course'); assert.equal(placeOf(by('board')), 'course'); assert.equal(placeOf(by('statue')), 'course', 'the golfer statue stand-in');
  assert.equal(placeOf(by('fountain')), 'both'); assert.equal(placeOf(by('town-gazebo')), 'town', 'a town building is the town\'s whatever its category');
  assert.equal(placeOf({ group: 'plants', id: 'no:such' }), 'both', 'a category not listed: both');
  const course = DECOR.filter(d => shownIn(d, 'course')).map(d => d.key), town = DECOR.filter(d => shownIn(d, 'town')).map(d => d.key);
  assert.ok(course.includes('trolley') && course.includes('bench') && !course.includes('town-gazebo'));
  assert.ok(town.includes('bench') && town.includes('town-gazebo') && !town.includes('trolley') && !town.includes('board'));
  assert.equal(DECOR.filter(d => shownIn(d, 'course', true)).length, DECOR.length, 'All shows every item');
  assert.equal(standsIn(by('bench'), 'town'), 'town'); assert.equal(standsIn(by('bench'), 'course'), 'course'); assert.equal(standsIn(by('trolley'), 'town'), 'course');
  // every catalogue item has its picture in the library, the town's buildings too
  const ids = new Set(LIBRARY.map(i => i.id));
  for (const d of DECOR) assert.ok(ids.has(d.id), d.key);
  assert.deepEqual(DECOR.filter(d => d.group === 'buildings').map(d => [d.key, d.appeal]), [['town-gazebo', 0], ['town-fountain', 0], ['bus-shelter', 0], ['toilet-block', 0], ['chapel', 0]], 'decoration: no economy');
});

test("the town's spot rule: off your land, off the town's lots, on the grass between them", () => {
  const lots = [{ o: [10, 10], u: [1, 0], n: [0, 1], w: 10, d: 12 }];
  const spot = (owned = false): DecorSpot => ({ owned: () => owned, water: () => false, road: () => false, course: () => '', range: () => '', overlaps: () => '', lot: b => lotTouches(lots, b) });
  const free: Box = [30, 30, 33, 33], onLot: Box = [12, 12, 15, 15], edge: Box = [8, 8, 11, 11];
  assert.equal(decorSpotWhy(free, spot(), 'town'), '');
  assert.match(decorSpotWhy(onLot, spot(), 'town'), /Not on a town lot/);
  assert.match(decorSpotWhy(edge, spot(), 'town'), /Not on a town lot/, "touching a lot's corner");
  assert.match(decorSpotWhy(free, spot(true), 'town'), /off your land/);
  assert.match(decorSpotWhy(free, spot(false), 'course'), /Only on your land/, "the course's rule as before");
  assert.equal(lotTouches(lots, [0, 0, 2, 2]), false); assert.equal(lotTouches(lots, [9, 9, 30, 30]), true, 'a box holding a lot');
});

test('the halfway house: its spot (by a tee, off the play, its front on a path), its takings, its business and art, its save', () => {
  const base: HalfwaySpot = { count: 0, owned: () => true, surf: () => '', tees: [{ x: 50, y: 50 }], pathGap: 1, money: 100000 };
  const r: [number, number, number, number] = [55, 45, 8, 6];
  assert.equal(halfwaySpotWhy(r, base), '');
  assert.match(halfwaySpotWhy(r, { ...base, count: 1 }), /One halfway house/);
  assert.match(halfwaySpotWhy(r, { ...base, tees: [] }), /Build a hole first/);
  assert.match(halfwaySpotWhy(r, { ...base, owned: x => x < 58 }), /On your land/);
  assert.match(halfwaySpotWhy(r, { ...base, surf: x => (x > 60 ? 'play' : '') }), /Off the fairways/);
  assert.match(halfwaySpotWhy(r, { ...base, tees: [{ x: 50 + HALFWAY_TEE_REACH + 20, y: 200 }] }), /Near a tee/);
  assert.match(halfwaySpotWhy(r, { ...base, pathGap: 5 }), /cart path/);
  assert.match(halfwaySpotWhy(r, { ...base, pathGap: -1 }), /Not on the path/);
  assert.match(halfwaySpotWhy(r, { ...base, money: HALFWAY_COST - 1 }), /Not enough money/);
  assert.equal(halfwayTakings(10), 80, 'ten clubhouse cars: 40 golfers, half stop, $4 each'); assert.equal(halfwayTakings(0), 0); assert.equal(halfwayTakings(-3), 0);
  const H = BUSINESS.halfway;
  assert.equal(H.rate, 0, 'no cars of its own: City never routes cars to it'); assert.equal(H.max, 1); assert.equal(H.kind, BUSINESS.clubhouse.kind, "the clubhouse's kind");
  const def = { id: 7, type: 'halfway' as const, x: 55, y: 45, w: 8, h: 6 };
  const art = businessArt(def, LIBRARY, new Map(LIBRARY.map((i, k) => [i.id, k])));
  assert.equal(art.length, 1); assert.equal(LIBRARY[art[0]!.item]!.id.replace(/^view:/, '').replace(/:(nw|se|sw)$/, ''), 'business:golf-halfway-pavilion');
  // a save keeps it (the business list: knownBusinesses keeps a type the catalogue has), and a town building's prop keeps its catalogue key
  assert.deepEqual(knownBusinesses([def], 'test'), [def]);
  const t = propTuple('world:gazebo', { x: 31.5, y: 31.5, flip: false, scale: 1, decor: 'town-gazebo' });
  assert.deepEqual(JSON.parse(JSON.stringify(t)), ['world:gazebo', 31.5, 31.5, 0, 1, 0, 'town-gazebo']);
  assert.deepEqual(tupleMarks(JSON.parse(JSON.stringify(t))), { decor: 'town-gazebo' });
  assert.equal(decorKeyOf('chapel'), 'chapel');
});
