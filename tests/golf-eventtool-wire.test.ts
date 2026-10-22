// Tests for golf event tool: structure placement rules, costs, footprints, and tour needs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkStructurePlacement,
  structurePlaceCost,
  structureRect,
  structuresNeeds,
  type PlacedEventStructure,
} from '../src/game/golf/eventtool';
import type { Hole } from '../src/game/golf/holes';
import type { Rect } from '../src/game/golf/mode';

test('checkStructurePlacement validates tier unlock and owned parcels', () => {
  const owned: Rect[] = [[0, 0, 100, 100]];
  const holes: Hole[] = [];

  // Tier 1 player attempting to place merchTent (tier 3: more than one tier ahead)
  const tierFail = checkStructurePlacement(
    { typeId: 'merchTent', x: 20, y: 20, mode: 'rent' },
    { tier: 1, holes, existing: [], parcels: owned }
  );
  assert.equal(tierFail.ok, false);
  assert.equal(tierFail.reason, 'Available from tier 2');

  // Tier 2 player placing foodTent outside owned land
  const outsideFail = checkStructurePlacement(
    { typeId: 'foodTent', x: 120, y: 20, mode: 'rent' },
    { tier: 2, holes, existing: [], parcels: owned }
  );
  assert.equal(outsideFail.ok, false);
  assert.equal(outsideFail.reason, 'Outside owned venue land');

  // Valid placement on owned land
  const valid = checkStructurePlacement(
    { typeId: 'foodTent', x: 20, y: 20, mode: 'rent' },
    { tier: 2, holes, existing: [], parcels: owned }
  );
  assert.equal(valid.ok, true);
  assert.equal(valid.cost, 2000);
});

test('checkStructurePlacement enforces hole corridor clearance', () => {
  const owned: Rect[] = [[0, 0, 200, 200]];
  const holes: Hole[] = [
    {
      n: 1,
      par: 4,
      lengthM: 350,
      memberLengthM: 320,
      line: [
        { x: 10, y: 50 },
        { x: 150, y: 50 },
      ],
      warnings: [],
    },
  ];

  // Within 15 tiles of hole 1 playing line (at y = 55, dist = 5 tiles)
  const corridorFail = checkStructurePlacement(
    { typeId: 'foodTent', x: 50, y: 55, mode: 'rent' },
    { tier: 2, holes, existing: [], parcels: owned }
  );
  assert.equal(corridorFail.ok, false);
  assert.equal(corridorFail.reason, 'Inside hole 1 playing corridor');

  // Safe distance outside playing corridor (at y = 70, dist = 20 tiles)
  const safe = checkStructurePlacement(
    { typeId: 'foodTent', x: 50, y: 70, mode: 'rent' },
    { tier: 2, holes, existing: [], parcels: owned }
  );
  assert.equal(safe.ok, true);
});

test('structuresNeeds detects tour requirements from placed event structures', () => {
  const placed: PlacedEventStructure[] = [
    { id: 1, typeId: 'foodTent', x: 10, y: 10, mode: 'rent' },
    { id: 2, typeId: 'toilets', x: 20, y: 10, mode: 'buy' },
    { id: 3, typeId: 'gate', x: 30, y: 10, mode: 'rent' },
    { id: 4, typeId: 'leaderboard', x: 40, y: 10, mode: 'rent' },
    { id: 5, typeId: 'tvTower', x: 50, y: 10, mode: 'rent' },
    { id: 6, typeId: 'tvTower', x: 60, y: 10, mode: 'rent' },
  ];

  const needs = structuresNeeds(placed);
  assert.ok(needs.has('foodTent'), 'should satisfy foodTent');
  assert.ok(needs.has('toilets'), 'should satisfy toilets');
  assert.ok(needs.has('gate'), 'should satisfy gate');
  assert.ok(needs.has('leaderboard'), 'should satisfy leaderboard');
  assert.ok(needs.has('tvTowers'), '2 tv towers should satisfy tvTowers');
});

test('structurePlaceCost and structureRect handle rent, buy, and rotation', () => {
  // Rent vs buy costs
  assert.equal(structurePlaceCost('foodTent', 'rent'), 2000);
  assert.equal(structurePlaceCost('foodTent', 'buy'), 15000);
  assert.equal(structurePlaceCost('foodTruck', 'buy'), Infinity); // cannot buy foodTruck

  // Footprint dimensions: foodTruck is w=3, h=2
  const unrotated = structureRect({ typeId: 'foodTruck', x: 10, y: 20, rotated: false });
  assert.deepEqual(unrotated, [10, 20, 3, 2]);

  const rotated = structureRect({ typeId: 'foodTruck', x: 10, y: 20, rotated: true });
  assert.deepEqual(rotated, [10, 20, 2, 3]);
});
