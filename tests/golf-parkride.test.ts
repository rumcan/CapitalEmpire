// Tests for remote park-and-ride lot detection and tour Need satisfaction (G6)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_PARK_RIDE_DIST_TILES,
  distFromClubhouse,
  hasBusRouteForPark,
  isParkAndRideLot,
  parkCentre,
  parkRideNeeds,
  type ParkRideBusInput,
  type ParkRideLotInput,
} from '../src/game/golf/parkride';
import type { Pt } from '../src/game/network';

const clubhouse: Pt = { x: 200, y: 200 };

test('returns empty needs when clubhouse is null or no car parks or bus routes exist', () => {
  const remotePark: ParkRideLotInput = { id: 1, x: 300, y: 200, w: 20, h: 20 };
  const route: ParkRideBusInput = { id: 1, park: 1, sx: 300, sy: 200, dx: 200, dy: 200, buses: 8, seats: 60 };

  assert.deepEqual(parkRideNeeds(null, [remotePark], [route]), []);
  assert.deepEqual(parkRideNeeds(clubhouse, [], [route]), []);
  assert.deepEqual(parkRideNeeds(clubhouse, [remotePark], []), []);
});

test('rejects car parks whose centre is closer than 80 tiles to the clubhouse', () => {
  // Centre at (279, 200) -> distance 79 < 80
  const nearPark: ParkRideLotInput = { id: 1, x: 269, y: 190, w: 20, h: 20 };
  const route: ParkRideBusInput = { id: 1, park: 1, sx: 270, sy: 200, dx: 205, dy: 200, buses: 8, seats: 60 };

  assert.deepEqual(parkCentre(nearPark), { x: 279, y: 200 });
  assert.equal(distFromClubhouse(clubhouse, nearPark), 79);
  assert.equal(isParkAndRideLot(clubhouse, nearPark, [route]), false);
  assert.deepEqual(parkRideNeeds(clubhouse, [nearPark], [route]), []);
});

test('rejects remote car parks that have no matching or active bus route', () => {
  // Centre at (280, 200) -> exact boundary distance 80 >= MIN_PARK_RIDE_DIST_TILES
  const boundaryPark: ParkRideLotInput = { id: 2, x: 270, y: 190, w: 20, h: 20 };
  const otherParkRoute: ParkRideBusInput = { id: 1, park: 99, buses: 8, seats: 60 };
  const zeroBusRoute: ParkRideBusInput = { id: 2, park: 2, buses: 0, seats: 60 };

  assert.equal(distFromClubhouse(clubhouse, boundaryPark), MIN_PARK_RIDE_DIST_TILES);
  assert.equal(hasBusRouteForPark(2, [otherParkRoute]), false);
  assert.equal(hasBusRouteForPark(2, [zeroBusRoute]), false);
  assert.deepEqual(parkRideNeeds(clubhouse, [boundaryPark], [otherParkRoute, zeroBusRoute]), []);
});

test('satisfies parkRide when one remote car park at least 80 tiles away has a bus route', () => {
  // Centre at (280, 200) -> distance 80
  const park1: ParkRideLotInput = { id: 1, x: 270, y: 190, w: 20, h: 20 };
  // Multiple routes to the same park still count as 1 park-and-ride lot
  const routes: ParkRideBusInput[] = [
    { id: 1, park: 1, sx: 270, sy: 200, dx: 205, dy: 200, buses: 8, seats: 60 },
    { id: 2, park: 1, sx: 270, sy: 205, dx: 205, dy: 200, buses: 4, seats: 60 },
  ];

  assert.equal(isParkAndRideLot(clubhouse, park1, routes), true);
  assert.deepEqual(parkRideNeeds(clubhouse, [park1], routes), ['parkRide']);
});

test('satisfies both parkRide and parkRide2 when two distinct remote car parks have bus routes', () => {
  const nearOnSite: ParkRideLotInput = { id: 1, x: 210, y: 190, w: 20, h: 20 }; // dist 20
  const remoteNorth: ParkRideLotInput = { id: 2, x: 190, y: 90, w: 20, h: 20 }; // centre (200, 100), dist 100
  const remoteEast: ParkRideLotInput = { id: 3, x: 310, y: 190, w: 20, h: 20 };  // centre (320, 200), dist 120
  const routes: ParkRideBusInput[] = [
    { id: 1, park: 1, buses: 8, seats: 60 },
    { id: 2, park: 2, buses: 8, seats: 60 },
    { id: 3, park: 3, buses: 8, seats: 60 },
  ];

  assert.deepEqual(parkRideNeeds(clubhouse, [nearOnSite, remoteNorth, remoteEast], routes), ['parkRide', 'parkRide2']);
});
