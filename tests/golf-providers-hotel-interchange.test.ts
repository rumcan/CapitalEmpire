import { test } from 'node:test';
import assert from 'node:assert/strict';

import { STRUCTURE, STRUCTURES } from '../src/game/golf/tents';
import { TIERS, tierInfo, missingFor } from '../src/game/golf/tour';
import {
  INTERCHANGE_EDGE_MAX_DIST,
  checkStructurePlacement,
  structuresNeeds,
  type PlacedEventStructure,
} from '../src/game/golf/eventtool';
import type { Rect } from '../src/game/golf/mode';

test('tour.ts restores hotelRooms in tier 4 and interchange in tier 5 (20 needs total, [1, 4, 9, 15, 20] cumulative)', () => {
  assert.deepEqual(TIERS.map(t => t.needs.length), [1, 4, 9, 15, 20]);
  assert.equal(tierInfo(5).needs.length, 20);
  assert.ok(tierInfo(4).needs.includes('hotelRooms'));
  assert.ok(tierInfo(5).needs.includes('interchange'));
});

test('tents.ts defines hotel (tier 3, rent+buy, rooms) and interchange (tier 4, buy-only, large footprint)', () => {
  assert.equal(STRUCTURES.length, 28);
  const hotel = STRUCTURE.hotel;
  assert.ok(hotel, 'hotel structure exists in STRUCTURE');
  assert.equal(hotel.tier, 3);
  assert.ok(hotel.rent > 0, 'hotel can be rented');
  assert.ok(hotel.buy > hotel.rent, 'hotel can be bought');
  assert.equal(hotel.unit, 'rooms');
  assert.ok(hotel.capacity >= 100);

  const interchange = STRUCTURE.interchange;
  assert.ok(interchange, 'interchange structure exists in STRUCTURE');
  assert.equal(interchange.tier, 4);
  assert.equal(interchange.rent, 0, 'interchange is buy-only');
  assert.ok(interchange.buy >= 200000, 'interchange is expensive');
  assert.ok(interchange.footprint.w >= 20 && interchange.footprint.h >= 12, 'interchange has a large footprint');
});

test('structuresNeeds maps hotel -> hotelRooms and interchange -> interchange', () => {
  const placed: PlacedEventStructure[] = [
    { id: 1, typeId: 'hotel', x: 20, y: 20, mode: 'rent' },
    { id: 2, typeId: 'interchange', x: 60, y: 0, mode: 'buy' },
  ];
  const have = structuresNeeds(placed, []);
  assert.equal(have.has('hotelRooms'), true);
  assert.equal(have.has('interchange'), true);
});

test('checkStructurePlacement enforces buy-only and parcel-edge nearest town road for interchange', () => {
  const parcels: Rect[] = [[0, 0, 200, 200]];
  const townPt = { x: 100, y: -20 }; // town road runs along the north edge (y = 0)

  // Renting interchange is rejected
  const rentCheck = checkStructurePlacement(
    { typeId: 'interchange', x: 80, y: 2, mode: 'rent' },
    { tier: 4, holes: [], existing: [], parcels, townPt },
  );
  assert.equal(rentCheck.ok, false);

  // Placing interchange in the parcel interior is rejected
  const interiorCheck = checkStructurePlacement(
    { typeId: 'interchange', x: 80, y: 80, mode: 'buy' },
    { tier: 4, holes: [], existing: [], parcels, townPt },
  );
  assert.equal(interiorCheck.ok, false);
  assert.match(interiorCheck.reason ?? '', /edge/i);

  // Placing interchange on the far south edge (away from townPt at y = -20) is rejected
  const wrongEdgeCheck = checkStructurePlacement(
    { typeId: 'interchange', x: 80, y: 200 - STRUCTURE.interchange!.footprint.h - 2, mode: 'buy' },
    { tier: 4, holes: [], existing: [], parcels, townPt },
  );
  assert.equal(wrongEdgeCheck.ok, false);
  assert.match(wrongEdgeCheck.reason ?? '', /town road/i);

  // Placing interchange at the north edge nearest townPt succeeds
  assert.ok(INTERCHANGE_EDGE_MAX_DIST > 0);
  const validEdgeCheck = checkStructurePlacement(
    { typeId: 'interchange', x: 80, y: 2, mode: 'buy' },
    { tier: 4, holes: [], existing: [], parcels, townPt },
  );
  assert.equal(validEdgeCheck.ok, true);
  assert.equal(validEdgeCheck.cost, STRUCTURE.interchange!.buy);
  assert.deepEqual(missingFor(5, { holes: 18, lengthM: 6800, have: new Set(tierInfo(5).needs) }), []);
});
