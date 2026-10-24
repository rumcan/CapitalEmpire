// The golf calendar and tour (GOLF-PLAN sections 5 and 8): the arrival and exit curves are monotone and end at 0 and 1, the months and the
// year read right, the tiers' needs are cumulative, the reputation, the day's satisfaction, the tier offer and demotion, the crowd and the day
// shares follow the rules. Pure: npm test (bundled by esbuild, run by node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrivalShare, exitShare, monthName, monthOf, yearOf, GATES_OPEN, EXIT_END, MONTH_LEN, SEASON_LEN } from '../src/game/golf/calendar';
import { INVITE_LEAD, TIERS, PRACTICE_SHARE, daySatisfaction, dayShare, invitationNeeds, invitedFacts, missingFor, reputationAfter, spectatorDemand, tournamentDue, verdict, type CourseFacts, type Need } from '../src/game/golf/tour';

/** a course with the given holes, length and needs */
const course = (holes: number, lengthM: number, have: readonly Need[]): CourseFacts => ({ holes, lengthM, have: new Set(have) });
/** a course that has every need of a tier, at the tier's holes and length */
const fullFor = (tier: number): CourseFacts => course(TIERS[tier - 1].holes, TIERS[tier - 1].minLengthM, TIERS[tier - 1].needs);
/** equal to within a float error */
const near = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 1e-9, msg ?? `${a} is ${b}`);

test('arrivalShare is monotone, 0 before the gates open, 1 from 13:00 on, and its densest part is 540–660', () => {
  let prev = -1, best = -1, bestAt = -1;
  for (let t = 0; t <= 1440; t++) {
    const s = arrivalShare(t);
    assert.ok(s >= prev, `non-decreasing at ${t}`);
    assert.ok(s >= 0 && s <= 1, `in 0..1 at ${t}`);
    if (t > 0 && s - prev > best) { best = s - prev; bestAt = t; }
    prev = s;
  }
  assert.equal(arrivalShare(0), 0);
  assert.equal(arrivalShare(GATES_OPEN), 0);
  assert.equal(arrivalShare(780), 1);
  assert.equal(arrivalShare(1439), 1);
  assert.ok(arrivalShare(600) > 0.2 && arrivalShare(600) < 0.8, 'about half the crowd is in by 10:00');
  assert.ok(bestAt >= 540 && bestAt <= 660, `the fastest arrivals fall at ${bestAt}`);
});

test('exitShare is monotone, 0 before 10:00, 10% out by 17:00, 1 at the end of the exit wave and after', () => {
  let prev = -1;
  for (let t = 0; t <= 1440; t++) {
    const s = exitShare(t);
    assert.ok(s >= prev, `non-decreasing at ${t}`);
    assert.ok(s >= 0 && s <= 1, `in 0..1 at ${t}`);
    prev = s;
  }
  assert.equal(exitShare(0), 0);
  assert.equal(exitShare(600), 0);
  near(exitShare(1020), 0.1);
  assert.equal(exitShare(EXIT_END), 1);
  assert.equal(exitShare(1439), 1);
  assert.ok(exitShare(1140) - exitShare(1050) > 0.5, 'most of the crowd leaves in 17:30–19:00');
});

test('monthOf: the year is 12 months of 120 clock units, clamped; names and the year follow the runs', () => {
  assert.equal(monthOf(0), 0);
  assert.equal(monthOf(119), 0);
  assert.equal(monthOf(120), 1);
  assert.equal(monthOf(1439), 11);
  assert.equal(monthOf(-5), 0);
  assert.equal(monthOf(5000), 11);
  assert.equal(monthName(0), 'Jan');
  assert.equal(monthName(1439), 'Dec');
  assert.equal(yearOf(0), 1985);
  assert.equal(yearOf(3), 1988);
});

test('the tiers are 1..5, the needs are cumulative, and the course rules rise with the tier', () => {
  assert.deepEqual(TIERS.map(t => t.tier), [1, 2, 3, 4, 5]);
  assert.deepEqual(TIERS.map(t => t.needs.length), [1, 4, 9, 15, 20]);
  for (let i = 1; i < TIERS.length; i++) assert.deepEqual(TIERS[i].needs.slice(0, TIERS[i - 1].needs.length), TIERS[i - 1].needs, `tier ${i + 1} has tier ${i}'s needs first`);
  assert.equal(new Set(TIERS[4].needs).size, 20, 'all 20 needs, each once');
  assert.deepEqual(TIERS.map(t => t.holes), [9, 9, 18, 18, 18]);
  assert.deepEqual(TIERS.map(t => t.minLengthM), [0, 0, 5800, 6400, 6700]);
  assert.deepEqual(TIERS.map(t => t.reputation), [0, 55, 65, 75, 85]);
  assert.deepEqual(TIERS.map(t => t.ticket), [0, 5, 10, 20, 35]);
  assert.deepEqual(TIERS.map(t => t.purse), [2000, 10000, 60000, 400000, 1000000]);
  assert.deepEqual(TIERS.map(t => t.sponsor), [0, 10000, 50000, 250000, 1000000]);
  assert.deepEqual(TIERS.map(t => t.tv), [0, 0, 0, 300000, 1500000]);
  assert.deepEqual(TIERS.map(t => t.days), [1, 2, 3, 4, 4]);
  assert.deepEqual(TIERS.map(t => t.practiceDays), [0, 0, 1, 2, 3]);
  assert.ok(TIERS[1].needs.includes('gate') && TIERS[1].needs.includes('toilets') && TIERS[1].needs.includes('carpark'));
  assert.ok(TIERS[2].needs.includes('grandstand18') && !TIERS[1].needs.includes('grandstand18'));
});

test('reputationAfter moves 30% of the way toward the score and stays in 0..100', () => {
  near(reputationAfter(50, 100), 65);
  near(reputationAfter(50, 0), 35);
  near(reputationAfter(40, 40), 40);
  assert.equal(reputationAfter(100, 200), 100);
  assert.equal(reputationAfter(0, -50), 0);
});

test('daySatisfaction: the four parts are weighted 40/20/20/20 and each is clamped', () => {
  const perfect = { onTime: 100, late: 0, missed: 0, exitP95Min: 20, avgQueueMin: 2, viewing: 1 };
  near(daySatisfaction(perfect), 100);
  near(daySatisfaction({ onTime: 0, late: 0, missed: 0, exitP95Min: 120, avgQueueMin: 30, viewing: 0 }), 40, 'nobody is arrival 1; the rest at the floor');
  near(daySatisfaction({ onTime: 0, late: 0, missed: 50, exitP95Min: 200, avgQueueMin: 99, viewing: 0 }), 0, 'all missed, the worst exit and queue');
  near(daySatisfaction({ onTime: 0, late: 10, missed: 0, exitP95Min: 30, avgQueueMin: 5, viewing: 1 }), 80, 'a late guest counts half');
  near(daySatisfaction({ ...perfect, exitP95Min: 75 }), 90, 'an exit at 75 min is halfway: 10 of the 20');
  near(daySatisfaction({ ...perfect, exitP95Min: 10, avgQueueMin: 0, viewing: 7 }), 100, 'exit, queue and viewing clamp to 1');
  near(daySatisfaction({ ...perfect, viewing: 0.5 }), 90);
});

test('missingFor lists the needs the course lacks, then holes and length when it is short', () => {
  assert.deepEqual(missingFor(1, course(9, 0, ['carpark'])), []);
  assert.deepEqual(missingFor(2, course(9, 0, ['carpark'])), ['gate', 'foodTent', 'toilets']);
  assert.deepEqual(missingFor(2, course(9, 0, ['gate', 'foodTent', 'toilets'])), ['carpark']);
  assert.deepEqual(missingFor(3, course(9, 5000, TIERS[1].needs)), ['holes', 'length', 'grandstand18', 'leaderboard', 'merchTent', 'parkRide', 'range']);
  assert.deepEqual(missingFor(3, fullFor(3)), []);
  assert.deepEqual(missingFor(5, fullFor(4)), ['length', 'grandstands', 'merchPavilion', 'hospitalityVillage', 'interchange', 'coachTerminal'], 'the 6,400 m course is 300 m short of 6,700');
  assert.deepEqual(missingFor(5, { ...fullFor(4), lengthM: 6700 }), ['grandstands', 'merchPavilion', 'hospitalityVillage', 'interchange', 'coachTerminal']);
});

test('verdict offers the next tier only with its needs and reputation', () => {
  assert.equal(verdict(1, 60, fullFor(2), 0).offer, 2);
  assert.equal(verdict(1, 54, fullFor(2), 0).offer, null, 'reputation short of 55');
  assert.equal(verdict(1, 90, course(9, 0, ['carpark']), 0).offer, null, 'a need missing');
  assert.equal(verdict(2, 70, { ...fullFor(3), holes: 9 }, 0).offer, null, 'the 18 holes are missing');
  assert.equal(verdict(2, 70, { ...fullFor(3), lengthM: 5799 }, 0).offer, null, 'the course is 1 m short');
  assert.equal(verdict(5, 100, fullFor(5), 0).offer, null, 'tier 5 is the top');
  assert.equal(verdict(4, 75, fullFor(5), 0).offer, null, 'reputation 75 short of 85');
  assert.equal(verdict(4, 85, fullFor(5), 0).offer, 5);
});

test('verdict: poor is under the threshold less 15, and demotion comes on the second poor year, never below tier 1', () => {
  assert.equal(verdict(3, 50, fullFor(3), 0).poor, false, '50 is not under 65 - 15');
  assert.equal(verdict(3, 49, fullFor(3), 0).poor, true);
  assert.equal(verdict(3, 49, fullFor(3), 0).demote, false, 'the first poor year is a warning');
  assert.equal(verdict(3, 49, fullFor(3), 1).demote, true, 'the second poor year demotes');
  assert.equal(verdict(2, 39, fullFor(2), 1).demote, true);
  assert.equal(verdict(1, 0, fullFor(1), 5).poor, false, 'tier 1 is never poor');
  assert.equal(verdict(1, 0, fullFor(1), 5).demote, false, 'never below tier 1');
  assert.equal(verdict(3, 90, fullFor(3), 3).demote, false, 'a good year does not demote');
});

test('spectatorDemand runs from the tier minimum to its maximum with the reputation', () => {
  assert.equal(spectatorDemand(1, 0), 300);
  assert.equal(spectatorDemand(1, 100), 600);
  assert.equal(spectatorDemand(5, 0), 30000);
  assert.equal(spectatorDemand(5, 100), 50000);
  assert.equal(spectatorDemand(2, 33), 1830);
  for (const t of TIERS) {
    let prev = -1;
    for (const r of [0, 25, 50, 75, 100]) {
      const d = spectatorDemand(t.tier, r);
      assert.ok(d >= t.spectators[0] && d <= t.spectators[1], `tier ${t.tier} at ${r} is in its range`);
      assert.ok(d >= prev, 'rises with the reputation');
      prev = d;
    }
  }
});

test('dayShare builds to the last day, with the last N of 0.6, 0.7, 0.85, 1 for N days, and practice days at 0.3', () => {
  assert.deepEqual([0, 1, 2, 3].map(i => dayShare(i, 4)), [0.6, 0.7, 0.85, 1]);
  assert.deepEqual([0, 1, 2].map(i => dayShare(i, 3)), [0.7, 0.85, 1]);
  assert.deepEqual([0, 1].map(i => dayShare(i, 2)), [0.85, 1]);
  assert.equal(dayShare(0, 1), 1);
  assert.equal(PRACTICE_SHARE, 0.3);
  assert.equal(dayShare(-1, 4), 0.3);
  assert.equal(dayShare(-3, 1), 0.3);
});

test("the tour's invitation (plan P22 T088): a range start needs 9 holes, a car park and the clubhouse; the old start needs none and its tiers are unchanged", () => {
  assert.deepEqual(invitationNeeds('range'), { holes: 9, carpark: true, clubhouse: true });
  assert.equal(invitationNeeds(undefined), null, 'the old start is invited from the start');
  // the old start's tier 1 is as it was: 9 holes and a car park, so a course with both misses nothing
  assert.deepEqual(TIERS[0].needs, ['carpark']); assert.equal(TIERS[0].holes, 9);
  assert.deepEqual(missingFor(1, course(9, 2700, ['carpark'])), []);
  // the checklist
  const none = invitedFacts({ holes: 0, carpark: true, clubhouse: false });
  assert.equal(none.met, false); assert.equal(none.text, '0 of 9 holes · car park ✓ · clubhouse ✗');
  assert.equal(invitedFacts({ holes: 6, carpark: true, clubhouse: true }).met, false, 'six holes are not enough');
  assert.equal(invitedFacts({ holes: 9, carpark: false, clubhouse: true }).met, false, 'no car park');
  const all = invitedFacts({ holes: 12, carpark: true, clubhouse: true });
  assert.equal(all.met, true); assert.equal(all.text, '9 of 9 holes · car park ✓ · clubhouse ✓');
});

test('the 3-month rule: invited 3 months or more before a season boundary, the tournament is held there; later, at the next boundary', () => {
  assert.equal(INVITE_LEAD, 3 * MONTH_LEN);
  const b = 5 * SEASON_LEN;
  assert.equal(tournamentDue(undefined, b), false, 'not invited');
  assert.equal(tournamentDue(b - 4 * MONTH_LEN, b), true, 'invited 4 months before');
  assert.equal(tournamentDue(b - 3 * MONTH_LEN, b), true, 'exactly 3 months before');
  assert.equal(tournamentDue(b - 2 * MONTH_LEN, b), false, 'invited 2 months before: not this season');
  assert.equal(tournamentDue(b - 2 * MONTH_LEN, b + SEASON_LEN), true, '...but at the next boundary');
});
