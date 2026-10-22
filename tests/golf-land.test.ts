// Tests for golf land ownership, boundary checks, and adjacent block purchases
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adjacentBlockPrice,
  buyAdjacentBlock,
  isAdjacentBlock,
  mergeParcelBounds,
  polyInParcels,
  type AdjacentBlock,
} from '../src/game/golf/parcels';
import type { Rect } from '../src/game/golf/mode';

test('polyInParcels validates that paint areas are fully inside owned parcels', () => {
  const owned: Rect[] = [
    [0, 0, 100, 100],
    [100, 0, 50, 100],
  ];

  // Polygon entirely within the first parcel
  const inside = [10, 10, 50, 10, 50, 50, 10, 50];
  assert.ok(polyInParcels(owned, inside), 'polygon within owned land should pass');

  // Polygon with one corner outside owned land
  const outside = [10, 10, 160, 10, 50, 50, 10, 50];
  assert.ok(!polyInParcels(owned, outside), 'polygon with corner outside owned land should fail');
});

test('buyAdjacentBlock verifies adjacency, computes price, and updates parcels and bounds', () => {
  const owned: Rect[] = [[0, 0, 40, 40]];
  const candidate: AdjacentBlock = {
    rect: [40, 0, 40, 40],
    landClass: 'farm',
    townPop: 1000,
  };

  assert.ok(isAdjacentBlock(owned, candidate.rect), 'candidate sharing edge should be adjacent');

  // Price for 40x40 tiles = 6400 m² farm at $1/m² = $6400
  const price = adjacentBlockPrice(candidate);
  assert.equal(price, 6400);

  // Attempt with insufficient cash
  const poorRes = buyAdjacentBlock(owned, candidate, 5000);
  assert.ok(!poorRes.ok);
  assert.equal(poorRes.reason, 'Insufficient funds');

  // Successful purchase
  const res = buyAdjacentBlock(owned, candidate, 10000);
  assert.ok(res.ok);
  assert.equal(res.parcels.length, 2);
  assert.deepEqual(res.bounds, [0, 0, 80, 40]);
});

test('isAdjacentBlock rejects non-adjacent, corner-only, and overlapping blocks', () => {
  const owned: Rect[] = [[0, 0, 40, 40]];

  // Disjoint block
  assert.ok(!isAdjacentBlock(owned, [80, 0, 40, 40]), 'disjoint block should not be adjacent');

  // Corner-only contact
  assert.ok(!isAdjacentBlock(owned, [40, 40, 40, 40]), 'corner-only contact should not be adjacent');

  // Overlapping block
  assert.ok(!isAdjacentBlock(owned, [20, 0, 40, 40]), 'overlapping block should not be adjacent');
});

test('mergeParcelBounds handles absent parcels defaulting to bounding parcel', () => {
  const parcel: Rect = [100, 200, 300, 400];
  const legacyParcels = undefined;
  const effectiveParcels: Rect[] = legacyParcels ?? [parcel];

  assert.equal(effectiveParcels.length, 1);
  assert.deepEqual(effectiveParcels[0], parcel);
  assert.deepEqual(mergeParcelBounds(effectiveParcels), parcel);
});
