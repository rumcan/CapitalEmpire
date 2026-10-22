// Tests for the Event tool module (golf/eventtool.ts): corridor/parcel/tier placement rules, rent vs buy costs, and catchment takings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateOldNine } from '../src/game/golf/coursegen';
import {
  checkStructurePlacement, evaluateEventToolDay, structurePlaceCost,
  structureRect, structuresNeeds, type PlacedEventStructure,
} from '../src/game/golf/eventtool';
import { deriveHoles } from '../src/game/golf/holes';

const SITE = { x0: 0, y0: 0, x1: 300, y1: 450 };
const LAYOUT = generateOldNine(SITE, 5);
const HOLES = deriveHoles(LAYOUT.areas, LAYOUT.tees, LAYOUT.pins, LAYOUT.aims);

test('checkStructurePlacement enforces tier locks, rent/buy rules, hole corridors, and TIO border allowance', () => {
  assert.deepEqual(structureRect({ typeId: 'drinksTent', x: 10, y: 20, rotated: true }), [10, 20, 4, 5]);
  assert.equal(structurePlaceCost('foodTent', 'rent'), 2000);
  assert.equal(structurePlaceCost('foodTent', 'buy'), 15000);
  assert.equal(structurePlaceCost('foodTruck', 'buy'), Infinity); // rent only
  assert.equal(structurePlaceCost('helipad', 'rent'), Infinity); // buy only

  // Tier lock: merchTent requires tier 3
  const locked = checkStructurePlacement({ typeId: 'merchTent', x: 150, y: 225, mode: 'rent' }, { tier: 1, holes: HOLES, existing: [] });
  assert.equal(locked.ok, false);

  // Corridor block: midpoint of hole 1 line is on the fairway centreline
  const line1 = HOLES[0]!.line;
  const mx = Math.round((line1[0]!.x + line1[line1.length - 1]!.x) / 2);
  const my = Math.round((line1[0]!.y + line1[line1.length - 1]!.y) / 2);
  const inCorridor = checkStructurePlacement({ typeId: 'foodTent', x: mx - 2, y: my - 2, mode: 'rent' }, { tier: 2, holes: HOLES, existing: [] });
  assert.equal(inCorridor.ok, false);
  assert.match(inCorridor.reason ?? '', /corridor/);

  // Grandstand S (TIO) is allowed 10 tiles off the hole 1 horizontal line (inside 15-tile corridor, outside 8-tile TIO core)
  const standBorder = checkStructurePlacement({ typeId: 'standS', x: mx - 4, y: my - 13, mode: 'rent' }, { tier: 2, holes: HOLES, existing: [] });
  assert.equal(standBorder.ok, true);

  // Clear open space in the middle of the course
  const clear = checkStructurePlacement({ typeId: 'foodTent', x: 150, y: 225, mode: 'rent' }, { tier: 1, holes: HOLES, existing: [] });
  assert.equal(clear.ok, true);
  assert.equal(clear.cost, 2000);
});

test('evaluateEventToolDay distributes crowd across holes and gates by catchmentWeight and computes takings, queues, and needs', () => {
  const gatePt = LAYOUT.clubhouse;
  const p1 = LAYOUT.pins[0]!;
  const oneTent: PlacedEventStructure[] = [
    { id: 1, typeId: 'foodTent', x: p1.x + 20, y: p1.y, mode: 'rent', priceCard: 'normal' },
    { id: 2, typeId: 'gate', x: gatePt.x, y: gatePt.y, mode: 'buy' },
    { id: 3, typeId: 'toilets', x: gatePt.x + 10, y: gatePt.y, mode: 'rent' },
  ];
  const twoTents: PlacedEventStructure[] = [
    ...oneTent,
    { id: 4, typeId: 'foodTent', x: gatePt.x - 15, y: gatePt.y - 20, mode: 'rent', priceCard: 'normal' },
  ];
  const day1 = evaluateEventToolDay({ placed: oneTent, holes: HOLES, gates: [gatePt], tier: 3, spectators: 6000 });
  const day2 = evaluateEventToolDay({ placed: twoTents, holes: HOLES, gates: [gatePt], tier: 3, spectators: 6000 });
  assert.ok(day2.sellingRevenue > day1.sellingRevenue, 'second tent captures more catchment and capacity');
  assert.equal(day1.gateLanes, 4);
  assert.equal(day1.toiletCubicles, 12);
  assert.equal(day1.rentCost, 2400); // foodTent 2000 + toilets 400
  assert.equal(day1.monthlyUpkeep, 200); // gate buy 20000 * 0.01
  const needs = structuresNeeds(oneTent, HOLES);
  assert.equal(needs.has('gate'), true);
  assert.equal(needs.has('foodTent'), true);
  assert.equal(needs.has('toilets'), true);
});
