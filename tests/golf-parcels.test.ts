// Tests for course land parcels (golf/parcels.ts): rect list ownership, adjacency rules, land/building pricing, and GolfSave.parcel bounds merge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Rect } from '../src/game/golf/mode';
import {
  BUILDING_SURCHARGE, adjacentBlockPrice, buyAdjacentBlock, courseParcelList,
  inParcels, inRect, isAdjacentBlock, mergeParcelBounds, parcelsAreaSqm,
  polyInParcels, rectAreaSqm, rectsOverlap, rectsTouchEdge,
} from '../src/game/golf/parcels';

test('mergeParcelBounds and courseParcelList merge course, venue, and carpark into GolfSave.parcel bounds', () => {
  const plan = {
    course: [400, 424, 300, 450] as Rect,
    venue: [530, 400, 40, 24] as Rect,
    carpark: [507, 384, 20, 16] as Rect,
  };
  const list = courseParcelList(plan);
  assert.equal(list.length, 3);
  assert.deepEqual(mergeParcelBounds(list), [400, 384, 300, 490]);
  assert.deepEqual(mergeParcelBounds([]), [0, 0, 0, 0]);
});

test('inRect, inParcels, polyInParcels, and parcelsAreaSqm handle multi-rect parcels without double counting', () => {
  const list: Rect[] = [[100, 100, 50, 50], [150, 100, 50, 50]];
  assert.equal(inRect(list[0]!, 125, 125), true);
  assert.equal(inParcels(list, 175, 125), true);
  assert.equal(inParcels(list, 210, 125), false);
  assert.equal(polyInParcels(list, [110, 110, 190, 110, 190, 140, 110, 140]), true);
  assert.equal(polyInParcels(list, [110, 110, 220, 110, 190, 140]), false);
  assert.equal(parcelsAreaSqm(list), 2 * 50 * 50 * 4);
  // overlapping rects do not double count
  assert.equal(parcelsAreaSqm([[0, 0, 10, 10], [5, 0, 10, 10]]), 15 * 10 * 4);
});

test('adjacency rules accept edge-sharing blocks and reject overlapping, detached, or corner-only blocks', () => {
  const base: Rect[] = [[400, 400, 300, 450]];
  assert.equal(rectsTouchEdge(base[0]!, [700, 400, 40, 40]), true);
  assert.equal(rectsTouchEdge(base[0]!, [700, 850, 40, 40]), false); // corner only
  assert.equal(rectsOverlap(base[0]!, [680, 400, 40, 40]), true);
  assert.equal(isAdjacentBlock(base, [700, 400, 40, 40]), true);
  assert.equal(isAdjacentBlock(base, [700, 850, 40, 40]), false);
  assert.equal(isAdjacentBlock(base, [680, 400, 40, 40]), false);
  assert.equal(isAdjacentBlock(base, [750, 400, 40, 40]), false);
});

test('adjacentBlockPrice prices by land class, keeps house buyout equal to empty land, and adds non-house building surcharges', () => {
  const r: Rect = [700, 400, 40, 40]; // 1600 tiles² = 6400 m²
  assert.equal(rectAreaSqm(r), 6400);
  const farmPrice = adjacentBlockPrice({ rect: r, landClass: 'farm' });
  const townEmpty = adjacentBlockPrice({ rect: r, landClass: 'town', houses: 0 });
  const townHouses = adjacentBlockPrice({ rect: r, landClass: 'town', houses: 8 });
  const withShops = adjacentBlockPrice({ rect: r, landClass: 'commercial', buildings: 2 });
  const grownTown = adjacentBlockPrice({ rect: r, landClass: 'farm', townPop: 3000 });
  assert.equal(farmPrice, 6400);
  assert.equal(townEmpty, 12800);
  assert.equal(townHouses, townEmpty, 'houses are bought out at the same land price (GOLF-PLAN 4.4)');
  assert.equal(withShops, 6400 * 4 + 2 * BUILDING_SURCHARGE);
  assert.ok(grownTown > farmPrice);
  assert.equal(adjacentBlockPrice({ rect: r, landClass: 'unbuildable' }), Infinity);
});

test('buyAdjacentBlock appends adjacent block, updates bounds, and enforces funds and adjacency', () => {
  const start: Rect[] = [[400, 400, 300, 450]];
  const adj = { rect: [700, 400, 40, 40] as Rect, landClass: 'farm' as const };
  const poor = buyAdjacentBlock(start, adj, 100);
  assert.equal(poor.ok, false);
  assert.equal(poor.reason, 'Insufficient funds');
  const detached = buyAdjacentBlock(start, { rect: [800, 400, 40, 40], landClass: 'farm' }, 50000);
  assert.equal(detached.ok, false);
  const ok = buyAdjacentBlock(start, adj, 50000);
  assert.equal(ok.ok, true);
  assert.equal(ok.parcels.length, 2);
  assert.deepEqual(ok.bounds, [400, 400, 340, 450]);
});
