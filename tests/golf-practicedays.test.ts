// Tests for golf tournament practice days in multiday.ts (GOLF-PLAN 2.2 and tour.ts practiceDays).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARTY } from '../src/game/event/config';
import type { RoundResult } from '../src/game/event/round';
import type { PlacedEventStructure } from '../src/game/golf/eventtool';
import {
  PRACTICE_TICKET_SHARE,
  formatMultiDayStatus,
  resolveMultiDayTournament,
  resolveMultiDayWithPractice,
  resolvePracticeDays,
} from '../src/game/golf/multiday';
import { PRACTICE_SHARE, dayShare, tierInfo, type CourseFacts, type Need } from '../src/game/golf/tour';
import { HEAT_DRINK_MULTIPLIER, STORM_STAY_HOME_SHARE } from '../src/game/golf/weather';
import { computeTournamentCloseBook, computeYearEnd } from '../src/game/golf/yearend';

function makeRound(sent: number, arrived: number, tickets = 0): RoundResult {
  return {
    level: 1,
    run: 2,
    sent,
    arrived,
    rate: sent > 0 ? arrived / (sent * PARTY) : 0,
    upkeep: 300,
    ...(tickets ? { tickets } : {}),
    payout: 0,
    net: tickets - 300,
    prevRate: null,
    stuck: [],
    perfect: true,
    byTown: [],
  };
}

test('tiers 1..2 have 0 practice days while tiers 3..5 have 1, 2, and 3 practice days with negative dayIndex and PRACTICE_SHARE', () => {
  assert.equal(tierInfo(1).practiceDays, 0);
  assert.equal(tierInfo(2).practiceDays, 0);
  assert.equal(tierInfo(3).practiceDays, 1);
  assert.equal(tierInfo(4).practiceDays, 2);
  assert.equal(tierInfo(5).practiceDays, 3);
  assert.equal(PRACTICE_SHARE, 0.3);
  assert.equal(PRACTICE_TICKET_SHARE, 0.5);

  assert.equal(resolvePracticeDays({ tier: 1, liveArrived: 400 }).length, 0);
  assert.equal(resolvePracticeDays({ tier: 2, liveArrived: 1500 }).length, 0);

  const p3 = resolvePracticeDays({ tier: 3, liveArrived: 3500 });
  assert.equal(p3.length, 1);
  assert.equal(p3[0]!.dayIndex, -1);
  assert.equal(p3[0]!.isPractice, true);
  assert.equal(p3[0]!.isLive, false);
  assert.equal(p3[0]!.share, PRACTICE_SHARE);

  const p4 = resolvePracticeDays({ tier: 4, liveArrived: 6000 });
  assert.equal(p4.length, 2);
  assert.deepEqual(p4.map(d => d.dayIndex), [-2, -1]);

  const p5 = resolvePracticeDays({ tier: 5, liveArrived: 18000 });
  assert.equal(p5.length, 3);
  assert.deepEqual(p5.map(d => d.dayIndex), [-3, -2, -1]);
});

test('each practice day scales spectators by dayShare(-k)/dayShare(0, days) and charges half-price tickets', () => {
  // Tier 3: 3 tournament days -> dayShare(0, 3) = 0.7; practice dayShare(-1, 3) = PRACTICE_SHARE (0.3)
  const liveArrived = 3500; // spectators (not cars)
  const ticketPrice = tierInfo(3).ticket; // $10
  const expectedRatio = PRACTICE_SHARE / dayShare(0, tierInfo(3).days); // 0.3 / 0.7
  const expectedSpectators = Math.round(liveArrived * expectedRatio); // 1500
  const expectedTickets = Math.round(expectedSpectators * ticketPrice * PRACTICE_TICKET_SHARE); // 1500 * $5 = $7,500

  const [pDay] = resolvePracticeDays({
    tier: 3,
    liveArrived,
    liveTents: 7000,
    ticketPrice,
  });
  assert.ok(pDay);
  assert.equal(pDay.spectators, expectedSpectators);
  assert.equal(pDay.tickets, expectedTickets);
  assert.equal(pDay.tents, Math.round(7000 * expectedRatio));
  assert.equal(pDay.sponsors, 0);
  assert.equal(pDay.totalIncome, pDay.tickets + pDay.tents);
});

test('practice day weather affects attendance in storms and drink tent takings in heat', () => {
  const structures: PlacedEventStructure[] = [
    { id: 1, typeId: 'drinksTent', x: 0, y: 0, mode: 'rent' },
    { id: 2, typeId: 'foodTent', x: 10, y: 0, mode: 'rent' },
  ];

  const [clearDay] = resolvePracticeDays({
    tier: 3,
    liveArrived: 4200,
    structures,
    practiceWeather: ['clear'],
  });
  const [stormDay] = resolvePracticeDays({
    tier: 3,
    liveArrived: 4200,
    structures,
    practiceWeather: ['storm'],
  });
  const [heatDay] = resolvePracticeDays({
    tier: 3,
    liveArrived: 4200,
    structures,
    practiceWeather: ['heat'],
  });

  assert.ok(clearDay && stormDay && heatDay);
  assert.equal(stormDay.spectators, Math.round(clearDay.spectators * (1 - STORM_STAY_HOME_SHARE)));
  assert.ok(stormDay.tickets < clearDay.tickets, 'storm reduces practice day ticket revenue');
  assert.equal(heatDay.spectators, clearDay.spectators);
  assert.ok(HEAT_DRINK_MULTIPLIER > 1);
  assert.ok(heatDay.tents > clearDay.tents, 'heat boosts drink tent takings on practice day');
});

test('formatMultiDayStatus and resolveMultiDayWithPractice sum practice days into multi-day totals and format statusLine', () => {
  assert.equal(formatMultiDayStatus(1, 0, 0), '1 day live');
  assert.equal(formatMultiDayStatus(1, 1, 0), 'Day 1 live, 1 resolved');
  assert.equal(formatMultiDayStatus(1, 2, 1), 'Day 1 live, 2 resolved, 1 practice');
  assert.equal(formatMultiDayStatus(1, 3, 2), 'Day 1 live, 3 resolved, 2 practice');
  assert.equal(formatMultiDayStatus(1, 3, 3), 'Day 1 live, 3 resolved, 3 practice');

  const withoutPractice = resolveMultiDayTournament({
    tier: 3,
    liveArrived: 3500,
    liveTents: 7000,
    ticketPrice: 10,
    sponsorIncome: 50000,
    purse: 60000,
  });
  const withPractice = resolveMultiDayWithPractice({
    tier: 3,
    liveArrived: 3500,
    liveTents: 7000,
    ticketPrice: 10,
    sponsorIncome: 50000,
    purse: 60000,
    practiceWeather: ['clear'],
  });

  assert.equal(withPractice.practiceDays, 1);
  assert.equal(withPractice.statusLine, 'Day 1 live, 2 resolved, 1 practice');
  assert.equal(withPractice.days.length, 4); // 1 practice + 1 live + 2 resolved
  assert.equal(withPractice.days[0]!.isPractice, true);
  assert.equal(withPractice.days[1]!.isLive, true);

  const pDay = withPractice.practiceList![0]!;
  assert.equal(withPractice.totalSpectators, withoutPractice.totalSpectators + pDay.spectators);
  assert.equal(withPractice.totalTickets, withoutPractice.totalTickets + pDay.tickets);
  assert.equal(withPractice.totalTents, withoutPractice.totalTents + pDay.tents);
  assert.equal(withPractice.totalRevenue, withoutPractice.totalRevenue + pDay.tickets + pDay.tents);
});

test('computeYearEnd and computeTournamentCloseBook include practice day tickets and tents at Tier 3+', () => {
  const facts: CourseFacts = {
    holes: 18,
    lengthM: 6000,
    have: new Set<Need>(['carpark', 'gate', 'foodTent', 'toilets', 'grandstand18', 'leaderboard', 'merchTent', 'parkRide', 'range']),
  };
  const structures: PlacedEventStructure[] = [
    { id: 1, typeId: 'gate', x: 0, y: 0, mode: 'buy' },
    { id: 2, typeId: 'foodTent', x: 10, y: 0, mode: 'rent' },
  ];
  // 1,200 cars sent * PARTY (3) = 3,600 spectators arrived
  const round = makeRound(1200, 1200 * PARTY, 3600 * tierInfo(3).ticket);
  const ye = computeYearEnd(3, 68, round, facts, 0, structures, [], 'clear', 90);

  assert.ok(ye.multiDay);
  assert.equal(ye.multiDay.practiceDays, 1);
  assert.equal(ye.multiDay.statusLine, 'Day 1 live, 2 resolved, 1 practice');
  assert.equal(ye.multiDay.days.length, 4);

  const book = computeTournamentCloseBook(ye, round.tickets ?? 0, [], round.upkeep, 0);
  assert.equal(book.tickets, ye.multiDay.totalTickets);
  assert.equal(book.tents, ye.multiDay.totalTents);
});
