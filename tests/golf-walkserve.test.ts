// T237 (#694): the walking-distance rule (golf/walkserve.ts). The owner, 2026-10-29: "work out a spesific distance a parking lot hasto be for it
// to count as walking distance for patron ... the user must know if it is now connected to the range or course etc". A car park serves a venue
// when its nearest bay is within WALK_SERVE_M (150 m) of the venue's door; further away it adds no bays (its drivers turn away as at a full one).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M, TOO_FAR, WALK_SERVE_M, WALK_SERVE_TILES, baysByDoor, lotsLine, servesOf, serveLine, servingParks, walkM, walkServes, type Venue } from '../src/game/golf/walkserve';
import { MIN_PARK_RIDE_DIST_TILES } from '../src/game/golf/parkride';

const range: Venue = { id: 'range', door: { x: 0, y: 0 } }, club: Venue = { id: 'clubhouse', door: { x: 40, y: 0 } };

test('one constant: 150 m of walking is 75 tiles of 2 m, and a park-and-ride lot lies past it', () => {
  assert.equal(WALK_SERVE_M, 150);
  assert.equal(WALK_SERVE_TILES * TILE_M, WALK_SERVE_M);
  // the shuttle's lots (parkride.ts) start beyond walking distance, so a walking lot is never a park-and-ride lot by distance alone
  assert.ok(MIN_PARK_RIDE_DIST_TILES * TILE_M >= WALK_SERVE_M);
});

test('the walk is from the nearest bay, in whole metres; with no bays, from the nearest point of the rect', () => {
  assert.equal(walkM([{ x: 30, y: 0 }, { x: 10, y: 0 }], { x: 0, y: 0 }), 20);
  assert.equal(walkM([], { x: 0, y: 0 }, [3, 4, 10, 10]), 10); // (the corner 3, 4: 5 tiles)
  assert.equal(walkM([], { x: 5, y: 5 }, [0, 0, 10, 10]), 0); // (inside)
  assert.equal(walkM([], { x: 0, y: 0 }), Infinity);
  assert.ok(walkServes(150) && !walkServes(151));
});

test('a car park serves the venues within the walk, nearest first, and says so', () => {
  const bays = [{ x: 20, y: 0 }];
  const s = servesOf(bays, [range, club]);
  assert.deepEqual(s.map(q => [q.venue.id, q.m]), [['range', 40], ['clubhouse', 40]]); // (a tie keeps the venues' order)
  assert.equal(serveLine(s), 'Serves: Range (40 m walk), Clubhouse (40 m walk)');
  const near = servesOf([{ x: 35, y: 0 }], [range, club]);
  assert.equal(serveLine(near), 'Serves: Clubhouse (10 m walk), Range (70 m walk)');
  // the edge: 75 tiles is 150 m, in; 76 is out
  assert.equal(servesOf([{ x: 75, y: 0 }], [range]).length, 1);
  assert.equal(servesOf([{ x: 76, y: 0 }], [range]).length, 0);
});

test('a far car park reads "Too far to walk to anything"', () => {
  const far = servesOf([{ x: 300, y: 300 }], [range, club]);
  assert.equal(far.length, 0);
  assert.equal(serveLine(far), TOO_FAR);
  assert.equal(TOO_FAR, 'Too far to walk to anything');
});

test('a venue with several doors (a tournament\'s gates) is listed once, by its nearest door', () => {
  const s = servesOf([{ x: 0, y: 0 }], [{ id: 'gates', door: { x: 50, y: 0 } }, { id: 'gates', door: { x: 10, y: 0 } }]);
  assert.equal(s.length, 1);
  assert.equal(s[0]!.m, 20);
  assert.equal(serveLine(s), 'Serves: Tournament gates (20 m walk)');
});

test('only the car parks in walking reach serve a door, nearest walk first; a car park with no bays never does', () => {
  const parks = [{ id: 1, bays: [{ x: 60, y: 0 }] }, { id: 2, bays: [{ x: 10, y: 0 }] }, { id: 3, bays: [{ x: 200, y: 0 }] }, { id: 4, bays: [] }];
  const s = servingParks(parks, { x: 0, y: 0 }, p => p.bays);
  assert.deepEqual(s.map(q => [q.park.id, q.m]), [[2, 20], [1, 120]]);
  assert.equal(lotsLine(s.map(q => ({ id: q.park.id, bays: q.park.bays.length, m: q.m }))), 'Car parks: #2 1 bays (20 m walk), #1 1 bays (120 m walk)');
  assert.equal(lotsLine([]), 'No car park within 150 m walk');
});

test('the bays are taken nearest the venue door first (ties: the car park\'s own order)', () => {
  const bays = [{ x: 9, y: 0, k: 'a' }, { x: 1, y: 0, k: 'b' }, { x: 5, y: 0, k: 'c' }, { x: -5, y: 0, k: 'd' }];
  assert.deepEqual(baysByDoor(bays, { x: 0, y: 0 }).map(b => b.k), ['b', 'c', 'd', 'a']);
});
