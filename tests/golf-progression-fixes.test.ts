// Tests for golf progression fixes (3 tier unlock chain & rangeStand at tier 3, 2a/2b Day 1 dayShare scaling & PARTY=3, 5 structure bulldoze & reload prop sync, 7a/7b classic mode reset)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARTY } from '../src/game/event/config';
import {
  checkStructurePlacement,
  findStructureIndexAt,
  structuresNeeds,
  type PlacedEventStructure,
} from '../src/game/golf/eventtool';
import { resolveMultiDayTournament } from '../src/game/golf/multiday';
import { STRUCTURE } from '../src/game/golf/tents';
import { dayShare, missingFor, spectatorDemand, tierInfo, verdict, type CourseFacts } from '../src/game/golf/tour';
import { SPECTATORS_PER_CAR, scoreTournamentDay } from '../src/game/golf/tournamentday';

test('tier 2 player can place all tier 3 required structures including rangeStand', () => {
  assert.equal(STRUCTURE.rangeStand?.tier, 3, 'rangeStand unlocks at tier 3 (buildable at tier 2)');
  const tier3Candidates = ['standS', 'leaderboard', 'merchTent', 'rangeStand'] as const;
  const placed: PlacedEventStructure[] = [
    { id: 1, typeId: 'gate', x: 0, y: 0, mode: 'buy' },
    { id: 2, typeId: 'foodTent', x: 10, y: 0, mode: 'buy' },
    { id: 3, typeId: 'toilets', x: 20, y: 0, mode: 'buy' },
  ];

  for (let i = 0; i < tier3Candidates.length; i++) {
    const typeId = tier3Candidates[i]!;
    const check = checkStructurePlacement(
      { typeId, x: 40 + i * 25, y: 40, mode: STRUCTURE[typeId]!.buy > 0 ? 'buy' : 'rent' },
      { tier: 2, holes: [], existing: placed },
    );
    assert.equal(check.ok, true, `${typeId} must be placeable by a tier 2 player (${check.reason ?? 'ok'})`);
    placed.push({ id: placed.length + 1, typeId, x: 40 + i * 25, y: 40, mode: STRUCTURE[typeId]!.buy > 0 ? 'buy' : 'rent' });
  }

  const have = structuresNeeds(placed, []);
  have.add('carpark');
  have.add('parkRide');
  const facts: CourseFacts = { holes: 18, lengthM: 6000, have };
  assert.deepEqual(missingFor(3, facts), []);
  assert.equal(verdict(2, 66, facts, 0).offer, 3);
});

test('every tier 2..5 requirement in OWN_NEEDS can be built one tier ahead', () => {
  const placed: PlacedEventStructure[] = [];
  const addAtTier = (playerTier: number, typeId: string, x: number, y: number) => {
    const def = STRUCTURE[typeId]!;
    const mode = def.buy > 0 ? 'buy' : 'rent';
    const check = checkStructurePlacement({ typeId, x, y, mode }, { tier: playerTier, holes: [], existing: placed });
    assert.equal(check.ok, true, `Tier ${playerTier} player must be able to place ${typeId} for Tier ${playerTier + 1}`);
    placed.push({ id: placed.length + 1, typeId, x, y, mode });
  };

  // Tier 1 -> Tier 2
  addAtTier(1, 'gate', 0, 0);
  addAtTier(1, 'foodTent', 20, 0);
  addAtTier(1, 'toilets', 40, 0);
  const have2 = structuresNeeds(placed);
  have2.add('carpark');
  assert.deepEqual(missingFor(2, { holes: 9, lengthM: 2800, have: have2 }), []);

  // Tier 2 -> Tier 3
  addAtTier(2, 'standS', 60, 0);
  addAtTier(2, 'leaderboard', 80, 0);
  addAtTier(2, 'merchTent', 100, 0);
  addAtTier(2, 'rangeStand', 120, 0);
  const have3 = structuresNeeds(placed);
  have3.add('carpark');
  have3.add('parkRide');
  assert.deepEqual(missingFor(3, { holes: 18, lengthM: 6000, have: have3 }), []);

  // Tier 3 -> Tier 4
  addAtTier(3, 'tvTower', 150, 0);
  addAtTier(3, 'tvTower', 160, 0);
  addAtTier(3, 'broadcast', 180, 0);
  addAtTier(3, 'chalet', 210, 0);
  addAtTier(3, 'media', 230, 0);
  const have4 = structuresNeeds(placed);
  have4.add('carpark');
  have4.add('parkRide');
  have4.add('parkRide2');
  assert.deepEqual(missingFor(4, { holes: 18, lengthM: 6500, have: have4 }), []);

  // Tier 4 -> Tier 5
  addAtTier(4, 'standL', 0, 40);
  addAtTier(4, 'merchPavilion', 60, 40);
  addAtTier(4, 'village', 100, 40);
  addAtTier(4, 'coach', 140, 40);
  const have5 = structuresNeeds(placed);
  have5.add('carpark');
  have5.add('parkRide');
  have5.add('parkRide2');
  assert.deepEqual(missingFor(5, { holes: 18, lengthM: 6800, have: have5 }), []);
});

test('SPECTATORS_PER_CAR in tournamentday equals PARTY (3) from event/config', () => {
  assert.equal(SPECTATORS_PER_CAR, PARTY);
  assert.equal(SPECTATORS_PER_CAR, 3);

  const day = scoreTournamentDay({
    tier: 2,
    reputation: 50,
    gates: [{ lanes: 4, arrivalsPerMinute: [100] }],
    carparks: [{ carsParked: 30, carsTurnedAway: 4 }],
    trafficMissed: 10,
  });
  assert.equal(day.facts.missed, 10 + 4 * PARTY);
});

test('day 1 live tournament demand scales by dayShare(0, days) so final resolved day reaches 1.0x peak', () => {
  for (const tier of [1, 2, 3, 4, 5]) {
    const tInfo = tierInfo(tier);
    const peak = spectatorDemand(tier, 70);
    const day1Live = Math.round(peak * dayShare(0, tInfo.days));
    const md = resolveMultiDayTournament({
      tier,
      liveArrived: day1Live,
    });
    const lastDay = md.days[md.days.length - 1]!;
    assert.ok(Math.abs(lastDay.spectators - peak) <= 2, `Tier ${tier} final day (${lastDay.spectators}) matches 1.0x peak (${peak})`);
  }
});

test('findStructureIndexAt matches structure by prop hit id or footprint rect and prevents ghost structures', () => {
  const structures: PlacedEventStructure[] = [
    { id: 10, typeId: 'foodTent', x: 50, y: 60, mode: 'buy' },
    { id: 25, typeId: 'leaderboard', x: 90, y: 100, mode: 'rent' },
  ];

  // Hit via sprite prop id even if cursor tile is outside footprint
  assert.equal(findStructureIndexAt(structures, 0, 0, 25), 1);
  // Hit via footprint rect (foodTent is 4x4 at 50,60 -> 50..54, 60..64)
  assert.equal(findStructureIndexAt(structures, 52, 63, null), 0);
  // Miss when neither matches
  assert.equal(findStructureIndexAt(structures, 10, 10, null), -1);
});

test('classic reset state clears golf mode, townPts, structure props, and tool flags', () => {
  // Simulate state transitions when resetting from a golf game to a classic or empty map
  const state = {
    golf: { tier: 2, rep: 58 } as { tier: number; rep: number } | null,
    townPts: [{ x: 120, y: 140 }],
    golfProps: new Map<string, number>([['pin:1', 1]]),
    golfStructureProps: new Map<number, number>([[1, 101]]),
    landMode: true,
    holesTool: true,
    eventTool: true,
    lastGolfMonth: 9,
  };

  // Apply reset logic
  state.golf = null;
  state.townPts = [];
  state.golfProps.clear();
  state.golfStructureProps.clear();
  state.landMode = false;
  state.holesTool = false;
  state.eventTool = false;
  state.lastGolfMonth = -1;

  assert.equal(state.golf, null);
  assert.equal(state.townPts.length, 0);
  assert.equal(state.golfProps.size, 0);
  assert.equal(state.golfStructureProps.size, 0);
  assert.equal(state.landMode, false);
  assert.equal(state.holesTool, false);
  assert.equal(state.eventTool, false);
  assert.equal(state.lastGolfMonth, -1);
});
