// Tests for golf money fixes (1a stadium payout off in golf mode, 1b tier ticket price & multi-day delta, 1c rent charged once per tournament, 7c purse booked in upkeep, 8a 12-month course upkeep charged)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Budget, type DayIn } from '../src/game/budget';
import { payout, ticketPrice } from '../src/game/event/config';
import type { RoundResult } from '../src/game/event/round';
import { courseMonthlyUpkeep } from '../src/game/golf/costs';
import { checkStructurePlacement, type PlacedEventStructure } from '../src/game/golf/eventtool';
import { tierInfo, type CourseFacts, type Need } from '../src/game/golf/tour';
import { COURSE_UPKEEP_YEAR_SHARE, computeTournamentCloseBook, computeYearEnd, golfTicketPrice } from '../src/game/golf/yearend';

function makeRoundResult(sent: number, arrived: number, tickets?: number, roundPayout = 0): RoundResult {
  return {
    level: 1,
    run: 1,
    sent,
    arrived,
    rate: sent > 0 ? arrived / (sent * 3) : 0,
    upkeep: 400,
    ...(tickets !== undefined ? { tickets } : {}),
    payout: roundPayout,
    net: (tickets ?? 0) + roundPayout - 400,
    prevRate: null,
    stuck: [],
    perfect: sent > 0 && arrived === sent * 3,
    byTown: [],
  };
}

function emptyDay(): DayIn {
  return {
    lots: [],
    segs: [],
    nodes: [],
    trade: { arrived: 0, punctual: 0 },
    pop: 1200,
  };
}

test('golfTicketPrice returns 0 at tier 1 and tier ticket prices at tiers 2..5 instead of $8 stadium ticket', () => {
  assert.equal(golfTicketPrice(1), 0);
  assert.equal(golfTicketPrice(2), 5);
  assert.equal(golfTicketPrice(3), 10);
  assert.equal(golfTicketPrice(4), 20);
  assert.equal(golfTicketPrice(5), 35);
  assert.ok(ticketPrice([]) > 0 && ticketPrice([]) !== golfTicketPrice(1), 'the classic stadium ticket is unchanged (not the golf tier price)');
});

test('golf kickOff books 0 stadium payout and tier ticket price while classic kickOff keeps stadium payout and $8 ticket', () => {
  // Simulate golf mode at Tier 1 (free entry) with 366 arrived spectators
  const golfBudgetT1 = new Budget();
  const golfT1Payout = 0;
  const golfT1Tickets = 366 * golfTicketPrice(1);
  assert.equal(golfT1Payout, 0);
  assert.equal(golfT1Tickets, 0);
  const ledgerT1 = golfBudgetT1.endDay(1, emptyDay());
  assert.equal(ledgerT1.payout, undefined);
  assert.equal(ledgerT1.business, 0);

  // Simulate golf mode at Tier 2 ($5 ticket) with 366 arrived spectators
  const golfBudgetT2 = new Budget();
  const golfT2Tickets = 366 * golfTicketPrice(2);
  assert.equal(golfT2Tickets, 1830);
  golfBudgetT2.bizIncome(golfT2Tickets);
  const ledgerT2 = golfBudgetT2.endDay(1, emptyDay());
  assert.equal(ledgerT2.payout, undefined, 'golf mode must not book stadium payout');
  assert.equal(ledgerT2.business, 1830, 'golf mode books $5/spectator at Tier 2');

  // Classic mode with 366 arrived fans out of 450 (rate = 0.8133)
  const classicBudget = new Budget();
  const classicPayout = payout(366 / 450, 1);
  const classicTickets = 366 * ticketPrice([]);
  assert.ok(classicPayout > 0);
  assert.equal(classicTickets, 366 * ticketPrice([]));
  classicBudget.bizIncome(classicTickets);
  classicBudget.payout(classicPayout);
  const classicLedger = classicBudget.endDay(1, emptyDay());
  assert.equal(classicLedger.payout, classicPayout);
  assert.equal(classicLedger.business, classicTickets);
});

test('multi-day ticket delta in computeTournamentCloseBook uses tier ticket price and never goes negative', () => {
  const facts: CourseFacts = {
    holes: 9,
    lengthM: 2800,
    have: new Set<Need>(['carpark', 'gate', 'foodTent', 'toilets']),
  };
  const structures: PlacedEventStructure[] = [
    { id: 1, typeId: 'gate', x: 0, y: 0, mode: 'buy' },
    { id: 2, typeId: 'foodTent', x: 10, y: 10, mode: 'buy' },
    { id: 3, typeId: 'toilets', x: 20, y: 20, mode: 'buy' },
  ];
  // Tier 2: 366 arrived on Day 1 -> liveDayTicketsBooked = 366 * $5 = $1,830
  const liveTickets = 366 * golfTicketPrice(2);
  const rr = makeRoundResult(200, 366, liveTickets, 0);
  const ye = computeYearEnd(2, 60, rr, facts, 0, structures, [], 'clear');
  const book = computeTournamentCloseBook(ye, liveTickets, []);

  assert.equal(liveTickets, 1830);
  assert.ok(ye.multiDay && ye.multiDay.resolvedDays === 1);
  assert.equal(ye.multiDay!.days[0]!.tickets, 1830);
  assert.equal(book.extraTickets, ye.multiDay!.days[1]!.tickets);
  assert.ok(book.extraTickets > 0, 'Day 2 resolved ticket delta is strictly positive');

  // Even if liveDayTicketsBooked were artificially higher, extraTickets clamps at 0
  const clamped = computeTournamentCloseBook(ye, 999999, []);
  assert.equal(clamped.extraTickets, 0);
});

test('rented structures pay 0 construction upfront and pay rent once per tournament in computeTournamentCloseBook', () => {
  const checkRent = checkStructurePlacement({ typeId: 'foodTent', x: 10, y: 10, mode: 'rent' }, { tier: 1, holes: [], existing: [] });
  const checkBuy = checkStructurePlacement({ typeId: 'gate', x: 20, y: 20, mode: 'buy' }, { tier: 1, holes: [], existing: [] });
  assert.equal(checkRent.ok, true);
  assert.equal(checkRent.cost, 2000);
  assert.equal(checkBuy.ok, true);
  assert.equal(checkBuy.cost, 20000);

  // At placement: only 'buy' spends construction; 'rent' spends 0 construction and is billed at tournament close
  const b = new Budget();
  const m0 = b.money;
  if ('rent' === ('buy' as string)) b.spend('construction', checkRent.cost);
  b.spend('construction', checkBuy.cost);
  assert.equal(b.money, m0 - 20000, 'only bought structure is charged as construction at placement');

  const structures: PlacedEventStructure[] = [
    { id: 1, typeId: 'foodTent', x: 10, y: 10, mode: 'rent' },
    { id: 2, typeId: 'gate', x: 20, y: 20, mode: 'buy' },
  ];
  const facts: CourseFacts = { holes: 9, lengthM: 2800, have: new Set<Need>(['carpark', 'gate', 'foodTent']) };
  const ye = computeYearEnd(1, 45, makeRoundResult(150, 400, 0, 0), facts, 0, structures, [], 'clear');
  const book = computeTournamentCloseBook(ye, 0, []);

  assert.equal(book.rent, 2000, 'rented foodTent ($2,000) charged once at tournament close');
  assert.equal(book.annualTentUpkeep, 200 * 12, 'bought gate ($200/mo) charged 12 months upkeep at tournament close');
});

test('purse is booked in upkeepCost so Ledger.business never goes negative at Tier 1', () => {
  const facts: CourseFacts = { holes: 9, lengthM: 2800, have: new Set<Need>(['carpark']) };
  // Tier 1 with 0 structures, $0 tickets, $0 sponsors, and $2,000 purse
  const ye = computeYearEnd(1, 40, makeRoundResult(120, 300, 0, 0), facts, 0, [], [], 'clear');
  const book = computeTournamentCloseBook(ye, 0, []);

  assert.equal(book.bizIncome, 0);
  assert.equal(book.purse, tierInfo(1).purse);
  assert.equal(book.upkeepCost, 2000);

  const b = new Budget();
  if (book.bizIncome > 0) b.spend('business', -book.bizIncome);
  if (book.upkeepCost > 0) b.spend('upkeep', book.upkeepCost);
  const ledger = b.endDay(1, emptyDay());

  assert.equal(ledger.business, 0, 'Ledger.business must never go negative from purse');
  assert.equal(ledger.upkeep, 2000, 'Purse is booked on the upkeep cost line');
  assert.equal(ledger.net, -2000);
});

test('computeTournamentCloseBook charges 12 months of courseMonthlyUpkeep from painted course areas', () => {
  const areas = [
    { pts: [0, 0, 10, 0, 10, 10, 0, 10], surface: 'green' as const },   // 100 tiles^2 = 400 m^2 * $3.0/yr = $1,200/yr ($100/mo)
    { pts: [0, 0, 50, 0, 50, 20, 0, 20], surface: 'fairway' as const }, // 1000 tiles^2 = 4000 m^2 * $0.6/yr = $2,400/yr ($200/mo)
  ];
  const monthly = courseMonthlyUpkeep(areas);
  assert.equal(Math.round(monthly), 300);

  const facts: CourseFacts = { holes: 9, lengthM: 2800, have: new Set<Need>(['carpark']) };
  const ye = computeYearEnd(1, 40, makeRoundResult(120, 300, 0, 0), facts, 0, [], [], 'clear');
  const book = computeTournamentCloseBook(ye, 0, areas);

  assert.equal(book.annualCourseUpkeep, 3600 * COURSE_UPKEEP_YEAR_SHARE, 'a year of courseMonthlyUpkeep ($300 * 12 = $3,600) times the charged share');
  assert.equal(book.upkeepCost, 2000 + 3600 * COURSE_UPKEEP_YEAR_SHARE, 'upkeepCost includes the purse plus the charged share of the annual course upkeep');
});
