// T269 (#810) part 3, the grounds staff (src/game/golf/staff.ts): the crew a course needs keeps every job on time; too few, and the jobs fall behind
// in their order (cups first): longer grass, slower greens, a lower condition and a quality factor under 1; unmoved cups cost reputation at the
// season's end; the wages are paid monthly; hiring is free and letting go costs a month's wage; the save round-trips and an old save gets a crew.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONDITION_MIN, GRASS_MM, INTERVAL, PIN_REP_WORST, QF_BASE, STAFF_MAX, STIMP, STIMP_MIN, WAGE, changeStaff, closeSeason, courseCondition, crewCard, crewNeed,
  freshStaff, holeCondition, normalizeStaff, overdue, payWages, pinReputation, qualityFactor, turf, wages, workDay, workNeed, type StaffState,
} from '../src/game/golf/staff';
import { normalizeCrewSave } from '../src/game/golf/crew';
import { normalizeGolfSave } from '../src/game/golf/mode';

const H9 = [1, 2, 3, 4, 5, 6, 7, 8, 9], H18 = Array.from({ length: 18 }, (_, i) => i + 1);
/** n days of work from day 0 */
function days(s: StaffState, n: number, holes: readonly number[]): StaffState { const end = s.day + n; for (let d = s.day + 1; d <= end; d++) s = workDay(s, d, holes); return s; }

test('the crew a course needs: a greenkeeper and a mower operator each nine holes, and their wages', () => {
  assert.deepEqual(crewNeed(0), { gk: 0, mo: 0 }); assert.deepEqual(crewNeed(9), { gk: 1, mo: 1 }); assert.deepEqual(crewNeed(18), { gk: 2, mo: 2 });
  assert.ok(workNeed(9).gk <= 420 && workNeed(18).gk > 420, 'one greenkeeper covers nine holes, not eighteen');
  assert.ok(workNeed(9).mo <= 600 && workNeed(18).mo > 600);
  assert.equal(wages({ gk: 2, mo: 2 }), 2 * WAGE.gk + 2 * WAGE.mo); assert.equal(wages(crewNeed(9)), 600); assert.equal(wages(crewNeed(18)), 1200);
});

test('with the crew it needs, every job is on time all season: condition 100, the greens at speed, every cup changed every day', () => {
  for (const holes of [H9, H18]) {
    const s = days(freshStaff(0, holes, 0), 30, holes);
    assert.equal(courseCondition(s), 100, `${holes.length} holes`);
    assert.deepEqual(turf(s).stimp, STIMP);
    assert.equal(s.today.cups.length, holes.length);
    for (const n of holes) for (const j of ['cups', 'sands', 'greens', 'fairways', 'rough'] as const) assert.equal(overdue(s, n, j), 0, `hole ${n} ${j}`);
    assert.equal(pinReputation(s.season), 0); assert.equal(s.season.holeDays, 30 * holes.length); assert.equal(s.season.stale, 0);
    assert.equal(qualityFactor(courseCondition(s)), 1);
  }
});

test('too few: the jobs fall behind in their order, cups first; the grass grows, the greens slow, the condition drops', () => {
  // one greenkeeper and one mower operator on eighteen holes: the cups and sands get done, the greens and the fairways fall behind
  const s = days({ ...freshStaff(0, H18, 0), staff: { gk: 1, mo: 1 } }, 14, H18);
  assert.equal(s.today.cups.length, 18, 'the cups are still changed: they come first');
  assert.ok(H18.some(n => overdue(s, n, 'greens') > 0), 'greens overdue');
  assert.ok(H18.some(n => overdue(s, n, 'rough') > 0 || overdue(s, n, 'fairways') > 0), 'mowing overdue');
  const c = courseCondition(s), t = turf(s);
  assert.ok(c < 100 && c >= CONDITION_MIN, `condition ${c}`);
  assert.ok(t.stimp < STIMP, `slower greens (${t.stimp})`); assert.ok(t.fairwayMM > GRASS_MM.fairways.cut || t.roughMM > GRASS_MM.rough.cut, 'longer grass');
  assert.ok(qualityFactor(c) < 1 && qualityFactor(c) >= QF_BASE);
  // none at all: nothing done, the pins stay, the condition at its floor in time
  const none = days({ ...freshStaff(0, H9, 0), staff: { gk: 0, mo: 0 } }, 40, H9);
  assert.equal(none.today.cups.length, 0); assert.equal(courseCondition(none), CONDITION_MIN); assert.equal(turf(none).stimp, STIMP_MIN);
  assert.equal(none.season.stale, 40 * 9); assert.equal(pinReputation(none.season), PIN_REP_WORST, 'the same pin all season: -3');
  // the most overdue hole first, so a short crew rotates round the course
  const half = days({ ...freshStaff(0, H18, 0), staff: { gk: 1, mo: 0 } }, 6, H18), cond = H18.map(n => holeCondition(half, n));
  assert.ok(Math.max(...cond) - Math.min(...cond) <= 20, `even across the holes (${cond.join(' ')})`);
});

test('the day\'s jobs: due by their intervals, dated today, spread over the rota; a new hole starts on time; the same day is not worked twice', () => {
  let s = freshStaff(10, H9, 0);
  for (const j of ['greens', 'fairways', 'rough'] as const) for (const n of H9) assert.ok(10 - s.holes[n]![j] < INTERVAL[j], `${j} on time and staggered`);
  for (let d = 11; d <= 24; d++) {
    s = workDay(s, d, H9);
    assert.deepEqual(s.today.cups, H9); assert.deepEqual(s.today.sands, H9);
    const g = s.today.greens.length; assert.ok(g >= 4 && g <= 5, `day ${d}: about half the greens (${g})`);
    for (const n of H9) for (const j of ['cups', 'sands', 'greens', 'fairways', 'rough'] as const) { assert.ok(d - s.holes[n]![j] < INTERVAL[j], `day ${d} hole ${n} ${j}`); if (s.today[j].includes(n)) assert.equal(s.holes[n]![j], d); }
  }
  assert.equal(workDay(s, 24, H9), s, 'the same day: as it is');
  const more = workDay(s, 25, [...H9, 10]); assert.ok(more.today.cups.includes(10)); assert.equal(more.holes[10]!.greens, 24, 'a new hole: done the day before');
});

test('the season\'s pin term and its close', () => {
  assert.equal(pinReputation({ holeDays: 0, stale: 0 }), 0); assert.equal(pinReputation({ holeDays: 90, stale: 60 }), -2); assert.equal(pinReputation({ holeDays: 90, stale: 9 }), 0);
  const s = closeSeason({ ...freshStaff(0, H9, 0), season: { holeDays: 50, stale: 20 } }); assert.deepEqual(s.season, { holeDays: 0, stale: 0 });
});

test('the wages: each month as it begins (a skip pays every month crossed), the crew as it is now; hire and let go', () => {
  const s0 = freshStaff(0, H18, 5);
  assert.deepEqual(payWages(s0, 5), { s: s0, due: 0 });
  const p = payWages(s0, 8.4); assert.equal(p.due, 3 * 1200); assert.equal(p.s.paid, 8);
  assert.deepEqual(payWages(s0, 2), { s: { ...s0, paid: 2 }, due: 0 }, 'a new clock: nothing paid');
  const h = changeStaff(s0, 'gk', 1)!; assert.equal(h.s.staff.gk, 3); assert.equal(h.cost, 0, 'hiring is free');
  const l = changeStaff(s0, 'mo', -1)!; assert.equal(l.s.staff.mo, 1); assert.equal(l.cost, WAGE.mo, 'letting go: a month\'s wage');
  assert.equal(changeStaff({ ...s0, staff: { gk: 0, mo: 0 } }, 'gk', -1), null); assert.equal(changeStaff({ ...s0, staff: { gk: STAFF_MAX, mo: 0 } }, 'gk', 1), null);
  const card = crewCard(l.s, 18);
  assert.deepEqual(card.need, { gk: 2, mo: 2 }); assert.equal(card.wages, 2 * WAGE.gk + WAGE.mo); assert.equal(card.holes, 18); assert.equal(card.condition, 100);
});

test('the save: a staff state round-trips through the crew and the golf save; an old save has none (the engine hires the crew it needs)', () => {
  const s = days(freshStaff(3, H9, 2, { gk: 1, mo: 0 }), 4, H9);
  const back = normalizeStaff(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(back, s);
  assert.equal(normalizeStaff(null), null); assert.equal(normalizeStaff({ day: 1 }), null);
  assert.deepEqual(normalizeStaff({ staff: { gk: 99, mo: -2 }, day: 4, holes: { 3: { cups: 1 } } })!.staff, { gk: STAFF_MAX, mo: 0 });
  assert.equal(normalizeStaff({ staff: { gk: 1, mo: 1 }, day: 4, holes: { 3: { cups: 1 } } })!.holes[3]!.greens, 4, 'a missing day: the save\'s day');
  assert.deepEqual(normalizeCrewSave({ phase: [], mown: [], staff: s }).staff, s);
  const base = { town: { x: 0, y: 0 }, course: [0, 0, 10, 10] as [number, number, number, number], clubhouse: { x: 1, y: 1 } };
  assert.equal(normalizeGolfSave(base)!.crew, undefined);
  assert.deepEqual(normalizeGolfSave({ ...base, crew: { phase: [], mown: [], staff: s } })!.crew!.staff, s);
  // freshStaff: the crew the course needs, everything done today, today's cups all moved
  const f = freshStaff(7, H18, 12);
  assert.deepEqual(f.staff, { gk: 2, mo: 2 }); assert.equal(f.day, 7); assert.equal(f.paid, 12); assert.deepEqual(f.today.cups, H18); assert.equal(courseCondition(f), 100);
});
