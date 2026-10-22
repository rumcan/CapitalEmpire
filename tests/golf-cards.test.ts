// Tests for golf mode draft cards (G5): pool of 12 golf cards, draft isolation from classic mode, GolfSave persistence, and all 10+ card effects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, DRAFT, PARTY } from '../src/game/event/config';
import { Round, draftFor } from '../src/game/event/round';
import { growInMonths } from '../src/game/golf/costs';
import type { PlacedEventStructure } from '../src/game/golf/eventtool';
import {
  COURSE_CONSULTANT_BONUS,
  EARLY_BIRD_SHIFT_MIN,
  EARLY_BIRD_TICKET_MUL,
  GOLF_CARDS,
  GREENKEEPER_MONTHS_REDUCTION,
  MEDIA_PARTNER_REP_BONUS,
  SPONSOR_DEAL_MUL,
  VOLUNTEER_CORPS_MUL,
  applyCourseConsultantQuality,
  applyEarlyBirdTicketPrice,
  applyMediaPartnerReputation,
  applyRainInsuranceToDayFacts,
  applyRainInsuranceToSatisfaction,
  applySponsorDealIncome,
  applyVolunteerCorpsCost,
  earlyBirdArrivalShare,
  effectiveGrowInMonths,
  findGolfCard,
  golfDraftFor,
  growInShareWithCards,
  hasExpressGates,
  hasFirstAidCoverage,
  parkRideNeedsWithCards,
} from '../src/game/golf/golfcards';
import type { GolfSave } from '../src/game/golf/mode';
import { computeSponsorIncome } from '../src/game/golf/sponsors';
import { STRUCTURE } from '../src/game/golf/tents';
import { tierInfo, type CourseFacts, type DayFacts, type Need } from '../src/game/golf/tour';
import { HEAT_SATISFACTION_PENALTY, applyWeatherToDayFacts, applyWeatherToSatisfaction } from '../src/game/golf/weather';
import { computeYearEnd, golfTicketPrice, measureGateFlows } from '../src/game/golf/yearend';

test('GOLF_CARDS defines at least 10 golf cards across road, transport, venue, and course categories', () => {
  assert.ok(GOLF_CARDS.length >= 10, `expected at least 10 golf cards, got ${GOLF_CARDS.length}`);
  const categories = new Set(GOLF_CARDS.map(c => c.category));
  assert.ok(categories.has('road'));
  assert.ok(categories.has('transport'));
  assert.ok(categories.has('venue'));
  assert.ok(categories.has('course'));

  const requiredIds = [
    'expressGates',
    'courseConsultant',
    'sponsorDeal',
    'shuttleFleet',
    'volunteerCorps',
    'rainInsurance',
    'firstAidPosts',
    'earlyBirdTickets',
    'mediaPartner',
    'greenkeeper',
  ] as const;
  for (const id of requiredIds) {
    const def = findGolfCard(id);
    assert.ok(def, `missing golf card ${id}`);
    assert.ok(def.name.length > 0 && def.desc.length > 0);
  }
});

test('draftFor and Round.sim offer classic CARDS in classic mode and GOLF_CARDS in golf mode', () => {
  const classicDraft = draftFor(1, 0, []);
  assert.ok(classicDraft && classicDraft.length === DRAFT);
  const classicIds = new Set<string>(CARDS.map(c => c.id));
  for (const id of classicDraft) {
    assert.ok(classicIds.has(id), `classic draft must only draw classic CARDS, got ${id}`);
  }

  const golfDraft = draftFor(1, 0, [], true);
  assert.ok(golfDraft && golfDraft.length === DRAFT);
  for (const id of golfDraft) {
    assert.ok(findGolfCard(id), `golf draft must draw from GOLF_CARDS, got ${id}`);
  }

  // Unlock cards already taken are not offered again in golfDraftFor, while upgrades remain eligible
  const allUnlocks = GOLF_CARDS.filter(c => c.kind === 'unlock').map(c => c.id);
  const upgradeOnlyDraft = golfDraftFor(3, 2, allUnlocks);
  assert.ok(upgradeOnlyDraft && upgradeOnlyDraft.length === DRAFT);
  for (const id of upgradeOnlyDraft) {
    assert.equal(findGolfCard(id)?.kind, 'upgrade', `unlock card ${id} should not repeat once taken`);
  }

  // Round in golf mode drafts golf cards and allows picking them
  const round = new Round();
  round.golf = true;
  assert.equal(round.start([50]), true);
  assert.equal(round.startNow(), true);
  assert.equal(round.sim(600), true);
  assert.ok(round.draft && round.draft.length === DRAFT);
  const picked = round.draft[0]!;
  assert.ok(findGolfCard(picked));
  assert.equal(round.pick(picked), true);
  assert.deepEqual(round.cards, [picked]);
});

test('GolfSave optional cards list persists picked golf cards without bumping save version', () => {
  const save: GolfSave = {
    v: 1,
    tier: 2,
    rep: 55,
    town: { x: 200, y: 200 },
    course: [100, 100, 120, 120],
    parcel: [80, 80, 160, 160],
    dir: 0,
    tees: [],
    pins: [],
    aims: [],
    clubhouse: { x: 140, y: 140 },
    cards: ['expressGates', 'courseConsultant', 'sponsorDeal'],
  };
  const roundtrip = JSON.parse(JSON.stringify(save)) as GolfSave;
  assert.equal(roundtrip.v, 1);
  assert.deepEqual(roundtrip.cards, ['expressGates', 'courseConsultant', 'sponsorDeal']);
});

test('wire and verify all 10 golf card effects across gate flows, quality, sponsors, shuttles, upkeep, weather, tickets, reputation, and grow-in', () => {
  // 1. Express gates: gate lanes count 1.5x in measureGateFlows, reducing queue wait and late count
  const baseFlow = measureGateFlows(1800, 2);
  const expressFlow = measureGateFlows(1800, 2, ['expressGates']);
  assert.equal(hasExpressGates(['expressGates']), true);
  assert.ok(expressFlow.avgQueueMin < baseFlow.avgQueueMin, 'Express gates must reduce average gate queue wait');
  assert.ok(expressFlow.onTime >= baseFlow.onTime, 'Express gates must increase or preserve on-time arrivals');

  // 2. Course consultant: +5 course quality per card
  assert.equal(applyCourseConsultantQuality(78, []), 78);
  assert.equal(applyCourseConsultantQuality(78, ['courseConsultant']), 78 + COURSE_CONSULTANT_BONUS);
  assert.equal(applyCourseConsultantQuality(98, ['courseConsultant']), 100);

  // 3. Sponsor deal: +15% sponsor income
  const baseSponsor = computeSponsorIncome(3, 80);
  const boostedSponsor = computeSponsorIncome(3, 80, ['sponsorDeal']);
  assert.equal(boostedSponsor, Math.round(baseSponsor * SPONSOR_DEAL_MUL));
  assert.equal(applySponsorDealIncome(baseSponsor, ['sponsorDeal']), boostedSponsor);

  // 4. Shuttle fleet: remote car parks (>= 80 tiles) satisfy parkRide and parkRide2 without bus routes
  const clubhouse = { x: 100, y: 100 };
  const remoteLots = [
    { id: 1, x: 200, y: 100, w: 20, h: 20 },
    { id: 2, x: 100, y: 220, w: 20, h: 20 },
  ];
  assert.deepEqual(parkRideNeedsWithCards(clubhouse, remoteLots, [], []), []);
  assert.deepEqual(parkRideNeedsWithCards(clubhouse, remoteLots, [], ['shuttleFleet']), ['parkRide', 'parkRide2']);

  // 5. Volunteer corps: structure rent and tent upkeep -20%
  const baseRent = STRUCTURE.foodTent!.rent;
  assert.equal(applyVolunteerCorpsCost(baseRent, ['volunteerCorps']), Math.round(baseRent * VOLUNTEER_CORPS_MUL));

  // 6. Rain insurance: weather stay-home and satisfaction penalties halved
  const rawFacts: DayFacts = { onTime: 800, late: 100, missed: 100, exitP95Min: 30, avgQueueMin: 8, viewing: 0.85 };
  const stormFacts = applyWeatherToDayFacts(rawFacts, 'storm');
  const insuredStormFacts = applyRainInsuranceToDayFacts(rawFacts, stormFacts, 'storm', ['rainInsurance']);
  const stormLost = (rawFacts.onTime + rawFacts.late) - (stormFacts.onTime + stormFacts.late);
  const insuredLost = (rawFacts.onTime + rawFacts.late) - (insuredStormFacts.onTime + insuredStormFacts.late);
  assert.equal(insuredLost, Math.round(stormLost * 0.5), 'Rain insurance must halve storm stay-home loss');
  const heatSat = applyWeatherToSatisfaction(80, 'heat', false);
  assert.equal(heatSat, 80 - HEAT_SATISFACTION_PENALTY);
  assert.equal(applyRainInsuranceToSatisfaction(80, heatSat, ['rainInsurance']), Math.round(80 - HEAT_SATISFACTION_PENALTY * 0.5));

  // 7. First-aid posts: heat penalty removed without placing a physical firstAid structure
  assert.equal(hasFirstAidCoverage([], []), false);
  assert.equal(hasFirstAidCoverage([], ['firstAidPosts']), true);
  assert.equal(applyWeatherToSatisfaction(80, 'heat', hasFirstAidCoverage([], ['firstAidPosts'])), 80);

  // 8. Early-bird tickets: ticket price +10% and earlier arrivals
  const baseTier2Ticket = tierInfo(2).ticket;
  assert.equal(golfTicketPrice(2, ['earlyBirdTickets']), applyEarlyBirdTicketPrice(baseTier2Ticket, ['earlyBirdTickets']));
  assert.equal(golfTicketPrice(2, ['earlyBirdTickets']), Math.round(baseTier2Ticket * EARLY_BIRD_TICKET_MUL * 100) / 100);
  assert.ok(earlyBirdArrivalShare(540, ['earlyBirdTickets']) > earlyBirdArrivalShare(540, []), 'Early-bird tickets must shift morning arrivals earlier');
  assert.equal(earlyBirdArrivalShare(540, ['earlyBirdTickets']), earlyBirdArrivalShare(540 + EARLY_BIRD_SHIFT_MIN, []));

  // 9. Media partner: reputation gain +3
  assert.equal(applyMediaPartnerReputation(52, ['mediaPartner']), 52 + MEDIA_PARTNER_REP_BONUS);

  // 10. Greenkeeper: grow-in months -1
  const baseGreenMonths = growInMonths('green', 'seed');
  assert.equal(effectiveGrowInMonths('green', 'seed', ['greenkeeper']), baseGreenMonths - GREENKEEPER_MONTHS_REDUCTION);
  assert.equal(growInShareWithCards('green', 'seed', baseGreenMonths - GREENKEEPER_MONTHS_REDUCTION, ['greenkeeper']), 1);

  // Full integration check through computeYearEnd
  const structures: PlacedEventStructure[] = [
    { id: 1, typeId: 'gate', x: 0, y: 0, mode: 'buy' },
    { id: 2, typeId: 'foodTent', x: 10, y: 0, mode: 'rent' },
  ];
  const roundResult = {
    level: 1,
    run: 2,
    sent: 200,
    arrived: 200 * PARTY,
    rate: 1,
    upkeep: 0,
    payout: 0,
    net: 0,
    prevRate: null,
    stuck: [],
    perfect: true,
    byTown: [],
  };
  const courseFacts: CourseFacts = {
    holes: 9,
    lengthM: 2800,
    have: new Set<Need>(['carpark', 'gate', 'foodTent', 'toilets']),
  };
  const yeBase = computeYearEnd(2, 50, roundResult, courseFacts, 0, structures, [], 'heat', 80, []);
  const yeCards = computeYearEnd(
    2,
    50,
    roundResult,
    courseFacts,
    0,
    structures,
    [],
    'heat',
    80,
    ['courseConsultant', 'sponsorDeal', 'volunteerCorps', 'firstAidPosts', 'earlyBirdTickets', 'mediaPartner'],
  );
  assert.ok((yeCards.greenFeeIncome ?? 0) > (yeBase.greenFeeIncome ?? 0), 'Course consultant must raise off-season green fees');
  assert.ok((yeCards.sponsorIncome ?? 0) > (yeBase.sponsorIncome ?? 0), 'Sponsor deal must raise sponsor income');
  assert.ok((yeCards.tentRentCost ?? 0) < (yeBase.tentRentCost ?? 0), 'Volunteer corps must reduce tent rent cost');
  assert.ok((yeCards.tentUpkeep ?? 0) < (yeBase.tentUpkeep ?? 0), 'Volunteer corps must reduce tent upkeep');
  assert.ok(yeCards.satisfaction > yeBase.satisfaction, 'First-aid posts must prevent heat satisfaction drop');
  assert.ok(yeCards.rep >= yeBase.rep + MEDIA_PARTNER_REP_BONUS, 'Media partner must boost final reputation');
  assert.ok((yeCards.multiDay?.totalTickets ?? 0) > (yeBase.multiDay?.totalTickets ?? 0), 'Early-bird tickets must boost multi-day ticket revenue');
});
