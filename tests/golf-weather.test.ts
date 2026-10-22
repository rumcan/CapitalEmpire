// Tests for seeded tournament weather calendar and pure weather effects (G8)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HEAT_DRINK_MULTIPLIER,
  HEAT_SATISFACTION_PENALTY,
  RAIN_DELAY_MIN,
  STORM_STAY_HOME_SHARE,
  TOURNAMENT_MONTH,
  applyWeatherToDayFacts,
  applyWeatherToSatisfaction,
  applyWeatherToTentRevenue,
  canonicalTournamentYear,
  getTournamentWeather,
  hasFirstAidStructure,
  weatherCalendar,
  weatherProbabilities,
  type WeatherCondition,
} from '../src/game/golf/weather';
import { ON_TIME_GRACE_MIN } from '../src/game/golf/tournamentday';
import { computeYearEnd } from '../src/game/golf/yearend';
import { evaluateEventToolDay, type PlacedEventStructure } from '../src/game/golf/eventtool';
import type { CourseFacts, DayFacts } from '../src/game/golf/tour';
import type { RoundResult } from '../src/game/event/round';

const sampleFacts: DayFacts = {
  onTime: 900,
  late: 100,
  missed: 50,
  exitP95Min: 40,
  avgQueueMin: 4,
  viewing: 0.85,
};

test('weatherCalendar is deterministic per seed and year and favours clear or heat in August', () => {
  assert.equal(canonicalTournamentYear(1), 1985);
  assert.equal(canonicalTournamentYear(1985), 1985);

  const calA = weatherCalendar(42, 1, 4, TOURNAMENT_MONTH);
  const calB = weatherCalendar(42, 1985, 4, TOURNAMENT_MONTH);
  assert.equal(calA.length, 4);
  assert.deepEqual(calA.map(d => d.condition), calB.map(d => d.condition));
  assert.equal(getTournamentWeather(42, 1, 2).condition, calA[2]!.condition);

  const augProbs = weatherProbabilities(7);
  const janProbs = weatherProbabilities(0);
  assert.ok(augProbs.clear + augProbs.heat >= 0.7, 'August is mostly clear or heat');
  assert.ok(augProbs.storm > 0, 'August has thunderstorm probability');
  assert.ok(augProbs.heat > janProbs.heat, 'August has higher heat probability than January');

  const seen = new Set<WeatherCondition>();
  for (let yr = 1; yr <= 40; yr++) {
    seen.add(getTournamentWeather(1337, yr).condition);
  }
  assert.ok(seen.size >= 4, 'seeded stream produces multiple weather conditions over years');
});

test('rain delays first tee using 45-minute grace period to shift on-time arrivals into late', () => {
  const res = applyWeatherToDayFacts(sampleFacts, 'rain');
  const expectedShare = (RAIN_DELAY_MIN + sampleFacts.avgQueueMin * 0.5) / ON_TIME_GRACE_MIN;
  const expectedShift = Math.round(sampleFacts.onTime * expectedShare);

  assert.equal(res.onTime, sampleFacts.onTime - expectedShift);
  assert.equal(res.late, sampleFacts.late + expectedShift);
  assert.equal(res.onTime + res.late, sampleFacts.onTime + sampleFacts.late);
  assert.equal(res.missed, sampleFacts.missed);
  assert.equal(res.exitP95Min, sampleFacts.exitP95Min);
});

test('storm cuts attendance by 25 percent and triggers an early concentrated exit wave', () => {
  const res = applyWeatherToDayFacts(sampleFacts, 'storm');
  const originalArrived = sampleFacts.onTime + sampleFacts.late;
  const newArrived = res.onTime + res.late;
  const stayedHome = originalArrived - newArrived;

  assert.equal(stayedHome, Math.round(originalArrived * STORM_STAY_HOME_SHARE));
  assert.equal(res.missed, sampleFacts.missed + stayedHome);
  assert.ok(res.exitP95Min < sampleFacts.exitP95Min, 'early exit wave shortens exit P95');
  assert.ok(res.avgQueueMin > sampleFacts.avgQueueMin, 'concentrated exit crowd increases queue wait');
});

test('heat raises drinks and water takings and lowers satisfaction unless first aid is placed', () => {
  const placed: PlacedEventStructure[] = [
    { id: 1, typeId: 'foodTent', x: 0, y: 0, mode: 'rent' },
    { id: 2, typeId: 'drinksTent', x: 10, y: 0, mode: 'rent' },
    { id: 3, typeId: 'kiosk', x: 20, y: 0, mode: 'rent' },
  ];
  const evalDay = evaluateEventToolDay({ placed, holes: [], gates: [], tier: 2, spectators: 1000 });
  const clearRev = applyWeatherToTentRevenue(evalDay.totalRevenue, 'clear', evalDay.byStructure);
  const heatRev = applyWeatherToTentRevenue(evalDay.totalRevenue, 'heat', evalDay.byStructure);
  const drinkSnackBase = evalDay.byStructure
    .filter(s => s.kind === 'drink' || s.kind === 'snack')
    .reduce((sum, s) => sum + s.day.revenue, 0);

  assert.equal(clearRev, evalDay.totalRevenue);
  assert.equal(heatRev, Math.round(evalDay.totalRevenue + drinkSnackBase * (HEAT_DRINK_MULTIPLIER - 1)));
  assert.ok(heatRev > clearRev, 'heat raises drinks and water kiosk revenue');

  assert.equal(hasFirstAidStructure(placed), false);
  assert.equal(applyWeatherToSatisfaction(82, 'heat', false), 82 - HEAT_SATISFACTION_PENALTY);

  const withAid: PlacedEventStructure[] = [...placed, { id: 4, typeId: 'firstAid', x: 30, y: 0, mode: 'rent' }];
  assert.equal(hasFirstAidStructure(withAid), true);
  assert.equal(applyWeatherToSatisfaction(82, 'heat', true), 82);
});

test('clear and overcast conditions leave facts, revenue, and satisfaction unchanged', () => {
  assert.deepEqual(applyWeatherToDayFacts(sampleFacts, 'clear'), sampleFacts);
  assert.deepEqual(applyWeatherToDayFacts(sampleFacts, 'overcast'), sampleFacts);
  assert.equal(applyWeatherToSatisfaction(78, 'clear', false), 78);
  assert.equal(applyWeatherToTentRevenue(5000, 'clear'), 5000);
});

test('computeYearEnd wires weather into facts, tent takings, satisfaction, and result weather line', () => {
  const roundResult: RoundResult = {
    level: 1,
    run: 1,
    sent: 200,
    arrived: 500,
    rate: 500 / 600,
    upkeep: 100,
    payout: 0,
    net: 0,
    prevRate: null,
    stuck: [],
    perfect: false,
    byTown: [],
  };
  const courseFacts: CourseFacts = { holes: 9, lengthM: 2800, have: new Set(['carpark', 'gate']) };
  const structures: PlacedEventStructure[] = [
    { id: 1, typeId: 'gate', x: 0, y: 0, mode: 'buy' },
    { id: 2, typeId: 'drinksTent', x: 15, y: 0, mode: 'rent' },
  ];

  const clearYe = computeYearEnd(2, 50, roundResult, courseFacts, 0, structures, [], 'clear');
  const rainYe = computeYearEnd(2, 50, roundResult, courseFacts, 0, structures, [], 'rain');
  const stormYe = computeYearEnd(2, 50, roundResult, courseFacts, 0, structures, [], 'storm');
  const heatYe = computeYearEnd(2, 50, roundResult, courseFacts, 0, structures, [], 'heat');

  assert.equal(clearYe.weather?.condition, 'clear');
  assert.ok(rainYe.facts.onTime < clearYe.facts.onTime && rainYe.facts.late > clearYe.facts.late);
  assert.ok(stormYe.facts.missed > clearYe.facts.missed);
  assert.ok((heatYe.tentRevenue ?? 0) > (clearYe.tentRevenue ?? 0));
  assert.ok(heatYe.satisfaction < clearYe.satisfaction);
});
