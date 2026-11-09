// Tests for course land parcels (golf/parcels.ts): rect list ownership, adjacency rules, land/building pricing, and GolfSave.parcel bounds merge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Rect } from '../src/game/golf/mode';
import {
  BUILDING_SURCHARGE, MAX_BLOCK_SIDE, adjacentBlockPrice, blockOnWater, buyAdjacentBlock, clampBlock, courseParcelList,
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

// ---- T395 (#1062): a block off the map is never bought, and a huge one never freezes the tab ----

/** the playtest's start: the parcel [720, 335, 240, 389] and the map's 1024 tiles; a block of open land (a quiet town) */
const T395_START: Rect[] = [[720, 335, 240, 389]];
const T395_OPEN = { landClass: 'open', houses: 0, buildings: 0, townPop: 0, map: 1024 } as const;

test('T395: buyAdjacentBlock refuses a block that leaves the map or is far too big, charges nothing and leaves the land as it was', () => {
  for (const rect of [[960, 400, 200, 60], [1100, 400, 60, 60], [960, -50, 60, 60], [960, 400, 1e9, 60], [-100, 400, 90, 60], [960, 400, Infinity, 60], [960, 400, NaN, 60]] as Rect[]) {
    const r = buyAdjacentBlock(T395_START, { rect, ...T395_OPEN }, 1e9);
    assert.equal(r.ok, false, JSON.stringify(rect));
    assert.match(r.reason ?? '', /map|edge|invalid/i, JSON.stringify(rect));
    assert.deepEqual(r.parcels, T395_START, `${JSON.stringify(rect)}: the land is as it was`);
  }
  // with no map given a block is judged as before (the callers from before T395 pass none): no bound is checked
  assert.equal(buyAdjacentBlock(T395_START, { rect: [960, 400, 200, 60], landClass: 'open' }, 1e9).ok, true, 'no map: not judged by it');
  const inside = buyAdjacentBlock(T395_START, { rect: [960, 400, 60, 60], ...T395_OPEN }, 1e9);
  assert.equal(inside.ok, true); assert.equal(inside.parcels.length, 2);
  // a block flush against the map's edge is on the map; a block of one tile beyond it is not
  assert.equal(buyAdjacentBlock(T395_START, { rect: [960, 400, 64, 60], ...T395_OPEN }, 1e9).ok, true, 'ends exactly at the edge (x 1024)');
  assert.equal(buyAdjacentBlock(T395_START, { rect: [960, 400, 65, 60], ...T395_OPEN }, 1e9).ok, false, 'one tile past it');
  // a block inside the map but bigger than any block (MAX_BLOCK_SIDE a side) is refused too
  const big = buyAdjacentBlock([[0, 0, 100, 100]], { rect: [100, 0, MAX_BLOCK_SIDE + 1, 50], ...T395_OPEN }, 1e12);
  assert.equal(big.ok, false); assert.match(big.reason ?? '', /big/i);
  assert.equal(buyAdjacentBlock([[0, 0, 100, 100]], { rect: [100, 0, MAX_BLOCK_SIDE, 50], ...T395_OPEN }, 1e12).ok, true);
});

test('T395: clampBlock cuts a block at the map\'s edge (the land that exists), refuses one with none of it on the map, and one nobody asked for in earnest', () => {
  assert.deepEqual(clampBlock([960, 400, 200, 60], 1024), { rect: [960, 400, 64, 60] }, 'the playtest\'s block: the 64 tiles on the map');
  assert.deepEqual(clampBlock([960, -50, 60, 60], 1024), { rect: [960, 0, 60, 10] }, 'cut at the top edge');
  assert.deepEqual(clampBlock([-20, -20, 40, 40], 1024), { rect: [0, 0, 20, 20] }, 'cut at the corner');
  assert.deepEqual(clampBlock([960, 400, 40, 40], 1024), { rect: [960, 400, 40, 40] }, 'a block on the map is as it was');
  for (const [rect, why] of [
    [[1100, 400, 60, 60], /off the map/i], [[1024, 400, 40, 40], /off the map/i], [[-60, 400, 40, 40], /off the map/i], [[500, 2000, 40, 40], /off the map/i],
    [[960, 400, 1e9, 60], /big/i], [[960, 400, MAX_BLOCK_SIDE + 1, 60], /big/i], [[0, 0, 60, 1e6], /big/i],
    [[NaN, 400, 40, 40], /invalid/i], [[960, 400, Infinity, 40], /invalid|big/i], [[960, 400, 0, 40], /invalid/i], [[960, 400, -40, 40], /invalid/i],
  ] as [Rect, RegExp][]) {
    const c = clampBlock(rect, 1024);
    assert.ok('why' in c, JSON.stringify(rect)); assert.match((c as { why: string }).why, why, JSON.stringify(rect));
  }
});

test('T395: blockOnWater never walks a block bigger than any block: a huge rect is answered at once, not after a hundred million tiles', () => {
  let calls = 0;
  const spy = () => { if (++calls > 1_000_000) throw new Error('walked far too many tiles'); return false; };
  assert.equal(blockOnWater([960, 400, 1e9, 60], spy), true, 'no block that size: counted as unbuildable at once');
  assert.equal(blockOnWater([960, 400, 60, 1e9], spy), true);
  assert.equal(blockOnWater([960, 400, NaN, 60], spy), true);
  assert.ok(calls < 1000, `${calls} tiles walked`);
  // a block as big as a block can be is walked as before (every 4th tile), and a wet one found
  calls = 0; assert.equal(blockOnWater([0, 0, MAX_BLOCK_SIDE, MAX_BLOCK_SIDE], spy), false); assert.equal(calls, (MAX_BLOCK_SIDE / 4) ** 2);
  assert.equal(blockOnWater([100, 100, 40, 40], (x, y) => x === 120 && y === 120), true);
});

test('T395: the engine cuts or refuses the block before it walks it (blockOnPublicRoad and blockLandClass ask the network and the tiles)', () => {
  const src = readFileSync('src/game/engine.ts', 'utf8'), at = src.indexOf('  buyLandBlock(asked: [number, number, number, number], price?: number): boolean {');
  assert.ok(at > 0, 'buyLandBlock is where the test looks');
  const body = src.slice(at, src.indexOf('\n  }\n', at));
  const iClamp = body.indexOf('clampBlock('), iRoad = body.indexOf('this.blockOnPublicRoad('), iClass = body.indexOf('this.blockLandClass('), iBuy = body.indexOf('buyAdjacentBlock(');
  assert.ok(iClamp > 0 && iRoad > iClamp && iClass > iClamp && iBuy > iClass, 'clampBlock first, then the road and the land class, then the purchase');
  assert.match(body, /buyAdjacentBlock\([^)]*map: MAP/, 'the purchase knows the map\'s size');
});
