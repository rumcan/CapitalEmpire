// The names wiring's headless tests (T012): a route's key is its geometry only, the nearest town is within 400 tiles,
// a route keeps its name for as long as its geometry does (an unrelated edit elsewhere does not rename it), and a widened
// road keeps its stem with the new class's suffix.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Names, RoadNames, TOWN_REACH, nearestTown, routeKey } from '../src/game/ext/names/index';

/** a road name without its trailing class word, for the widening check */
const stem = (s: string): string => s.replace(/\s+(Street|Avenue|Boulevard|Lane)$/, '');
/** a route-like object as the network's Route reads for naming: its canonical points and its class id */
const route = (pts: { x: number; y: number }[], id: string) => ({ pts, cls: { id } });
const PTS = [{ x: 100, y: 200 }, { x: 140, y: 200 }, { x: 140, y: 260 }];

test('route key: the geometry rounded to 0.01 tile, in the caller order, with no class', () => {
  assert.equal(routeKey(PTS), routeKey(PTS.map(p => ({ ...p }))), 'the same points, the same key');
  assert.notEqual(routeKey(PTS), routeKey([...PTS].reverse()), 'the route order is part of the geometry');
  assert.equal(routeKey([{ x: 1.001, y: 2 }]), routeKey([{ x: 1, y: 2 }]), 'rounded to 0.01 tile');
  assert.notEqual(routeKey(PTS), routeKey(PTS.slice(0, 2)), 'a changed route is a new key');
});

test('nearest town: the nearest centre within 400 tiles, none out in the country', () => {
  const c = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 1000, y: 1000 }];
  assert.equal(TOWN_REACH, 400);
  assert.equal(nearestTown({ x: 120, y: 0 }, c), 0);
  assert.equal(nearestTown({ x: 250, y: 0 }, c), 1);
  assert.equal(nearestTown({ x: 500, y: 0 }, c), 1, 'nearest, not first: 200 tiles from town 1, 500 from town 0');
  assert.equal(nearestTown({ x: -500, y: 0 }, c), -1, 'out of reach of all three');
  assert.equal(nearestTown({ x: 0, y: 0 }, []), -1, 'no towns');
});

test('road names: the same route keeps its name after an unrelated route is named first', () => {
  const centres = [{ x: 120, y: 230 }];
  const alone = new RoadNames(new Names(77), centres).nameOf(route(PTS, 'street'));
  const busy = new RoadNames(new Names(77), centres);
  busy.nameOf(route([{ x: 900, y: 900 }, { x: 950, y: 900 }], 'street'));
  busy.nameOf(route([{ x: 900, y: 950 }, { x: 950, y: 950 }], 'avenue'));
  assert.equal(busy.nameOf(route(PTS, 'street')), alone, 'an unrelated edit elsewhere does not rename it');
  assert.match(alone, / Street$/);
});

test('road names: the nearest town scopes the name; a road out of reach has none', () => {
  const n = new Names(77), rn = new RoadNames(n, [{ x: 120, y: 230 }]);
  assert.equal(rn.nameOf(route(PTS, 'street')), n.road(routeKey(PTS), 'street', n.town(0)), 'scoped to town 0');
  const far = route([{ x: 1500, y: 1500 }, { x: 1550, y: 1500 }], 'street');
  assert.equal(rn.nameOf(far), n.road(routeKey(far.pts), 'street'), 'out in the country: no town scope');
});

test('road names: a widened road keeps its stem and takes the new suffix', () => {
  const rn = new RoadNames(new Names(8), [{ x: 120, y: 230 }]);
  const before = rn.nameOf(route(PTS, 'street')), after = rn.nameOf(route(PTS, 'avenue'));
  assert.equal(stem(before), stem(after), `${before} widened is ${after}: the same stem`);
  assert.match(before, / Street$/);
  assert.match(after, / Avenue$/);
  assert.equal(rn.nameOf(route(PTS, 'street')), before, 'the first name of a class is kept');
});
