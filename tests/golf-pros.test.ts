// T214 (#559, plan P26 phases 3-4): the club's pros (src/game/golf/pros.ts): the pro's office's and the teaching hut's spot reasons in their order,
// where a hut teaches, hiring (each role's lock, the names, the one wage book), letting go and the bulldozer (a month's wage each), a month's lessons
// (the range hut alone and with the academy, a green's hut, the cap, the members' lessons, a skip), the staff's sales credit, your lesson (its
// reasons, and T241's hook: the bonus on a practice session), the pros' beats through the day, the Staff card, and the save (normalize).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HUT_COST, HUT_MAX, HUT_REACH, LESSON_CAP, MEMBER_LESSON, OFFICE_CLUB_REACH, OFFICE_COST, PRO_DAY, PRO_HOME_S, PRO_WALK,
  dropProsAt, hirePro, hireWhy, hutPlace, hutSpotWhy, lessonWhy, lessonsMonth, letGoPro, officeSpotWhy, proName, proPose, proWages, staffCardView, staffWork,
  type HutSpot, type OfficeSpot, type ProPose, type StaffNeeds,
} from '../src/game/golf/pros';
import { CLUB_WAGE, clubTerms, freshStaff, normalizeStaff, payWages, wages, type StaffState } from '../src/game/golf/staff';
import { J_BASE, J_PRO, J_SEC, C_PRO, C_SEC } from '../src/game/golf/club';
import { LESSON, LESSON_SHARE } from '../src/game/golf/rangesave';
import { LESSON_BONUS, normalizePlayer, practise, startProfile } from '../src/game/golf/player';

const R = (x: number, y: number, w: number, h: number) => [x, y, w, h] as const;
const office = (o: Partial<OfficeSpot> = {}): OfficeSpot => ({ count: 0, clubhouse: [100, 100, 20, 12], owned: () => true, surf: () => '', room: '', pathGap: 1, money: 1e6, ...o });
const hut = (o: Partial<HutSpot> = {}): HutSpot => ({
  huts: [], owned: () => true, surf: () => '', room: '', money: 1e6,
  places: [{ at: 'range', rect: [0, 0, 20, 4], open: true }, { at: 'putting', rect: [0, 40, 8, 8], open: true }, { at: 'chipping', rect: [30, 40, 8, 8], open: false }], ...o,
});

test("the pro's office: each reason, in the order a player fixes them", () => {
  const r = R(122, 100, 4, 3);
  assert.equal(officeSpotWhy(r, office()), '');
  assert.match(officeSpotWhy(r, office({ count: 1 })), /One pro's office/);
  assert.match(officeSpotWhy(r, office({ clubhouse: null })), /Build the clubhouse first/);
  assert.equal(officeSpotWhy(r, office({ owned: () => false, money: 0 })), 'On your land');
  assert.match(officeSpotWhy(r, office({ surf: () => 'play' })), /Off the fairways/);
  assert.match(officeSpotWhy(r, office({ room: 'The clubhouse stands there: find a free spot' })), /clubhouse stands there/);
  assert.match(officeSpotWhy(R(100 + 20 + OFFICE_CLUB_REACH + 1, 100, 4, 3), office()), /Near the clubhouse: within 60 m/);
  assert.equal(officeSpotWhy(R(100 + 20 + OFFICE_CLUB_REACH, 100, 4, 3), office()), '', 'at the reach exactly: fine');
  assert.match(officeSpotWhy(r, office({ pathGap: -0.5 })), /Not on the path/);
  assert.match(officeSpotWhy(r, office({ pathGap: 2.5 })), /Its front on a path, drive or road/);
  assert.match(officeSpotWhy(r, office({ money: OFFICE_COST - 1 })), /Not enough money.*\$14,000/);
});

test('the teaching hut: where it teaches (the nearest open place with no hut), each reason in order', () => {
  assert.equal(hutPlace(R(21, 0, 2, 2), hut()), 'range');
  assert.equal(hutPlace(R(9, 50, 2, 2), hut()), 'putting');
  assert.equal(hutPlace(R(21, 0, 2, 2), hut({ huts: ['range'] })), null, 'the range has its hut');
  assert.equal(hutPlace(R(30, 50, 2, 2), hut()), null, 'the chipping green is not built');
  assert.equal(hutSpotWhy(R(21, 0, 2, 2), hut()), '');
  assert.match(hutSpotWhy(R(21, 0, 2, 2), hut({ huts: ['range', 'putting', 'chipping'] })), new RegExp(`At most ${HUT_MAX}`));
  assert.match(hutSpotWhy(R(21, 0, 2, 2), hut({ places: [] })), /build one first/);
  assert.match(hutSpotWhy(R(21, 0, 2, 2), hut({ huts: ['range', 'putting'] })), /Every range and practice green has its hut/);
  assert.equal(hutSpotWhy(R(21, 0, 2, 2), hut({ owned: () => false })), 'On your land');
  assert.match(hutSpotWhy(R(21, 0, 2, 2), hut({ surf: () => 'play' })), /Off the fairways/);
  assert.match(hutSpotWhy(R(21, 0, 2, 2), hut({ room: 'A car park stands there: find a free spot' })), /car park/);
  assert.match(hutSpotWhy(R(21, 0, 2, 2), hut({ huts: ['range'] })), /range hut stands already/);
  assert.match(hutSpotWhy(R(20 + HUT_REACH + 1, 0, 2, 2), hut()), /within 16 m/);
  assert.match(hutSpotWhy(R(21, 0, 2, 2), hut({ money: HUT_COST - 1 })), /\$4,000/);
});

const needs = (o: Partial<StaffNeeds> = {}): StaffNeeds => ({ clubhouse: true, office: 10, huts: [{ id: 11, at: 'range' }], holes: 9, ...o });
const fresh = (): StaffState => freshStaff(0, [1, 2, 3], 0, { gk: 1, mo: 1 });

test('hiring: each role unlocks as P26 2.1 says, one each (a teaching pro a hut)', () => {
  const s0 = fresh();
  assert.match(hireWhy(s0, 'head', 10, needs({ clubhouse: false })), /Needs the clubhouse/);
  assert.match(hireWhy(s0, 'head', null, needs({ office: null })), /Needs the pro's office/);
  assert.match(hireWhy(s0, 'sec', 10, needs()), /Needs a head pro/);
  assert.match(hireWhy(s0, 'teach', null, needs()), /Needs a teaching hut/);
  assert.equal(hireWhy(s0, 'teach', 11, needs()), '');
  const s1 = hirePro(s0, 'head', 10, 5, 42).s;
  assert.equal(hireWhy(s1, 'sec', 10, needs()), '');
  assert.match(hireWhy(s1, 'sec', 10, needs({ holes: 6 })), /Needs 9 holes/);
  assert.match(hireWhy(s1, 'head', 10, needs()), /You have a head pro/);
  const s2 = hirePro(s1, 'teach', 11, 5, 42).s;
  assert.match(hireWhy(s2, 'teach', 11, needs()), /has its teaching pro/);
  assert.deepEqual(s2.club, { head: 1, teach: 1 });
  assert.equal(s2.hires, 2);
  assert.deepEqual(clubTerms(s2), { head: true, sec: false });
});

test('names: seeded by the map and the hire count, the same each time, different hire to hire', () => {
  assert.equal(proName(7, 0, 'm'), proName(7, 0, 'm'));
  assert.notEqual(proName(7, 0, 'm') + proName(7, 1, 'm') + proName(7, 2, 'm'), proName(7, 0, 'm').repeat(3));
  assert.match(proName(7, 3, 'w'), /^[A-Z][a-z]+ [A-Z][a-z]+$/);
});

test('the one wage book: the club staff are paid with the crew each month; letting go and the bulldozer cost a month each', () => {
  let s = fresh();
  s = hirePro(s, 'head', 10, 0, 1).s; s = hirePro(s, 'sec', 10, 0, 1).s; s = hirePro(s, 'teach', 11, 0, 1).s;
  assert.equal(proWages(s), CLUB_WAGE.head + CLUB_WAGE.sec + CLUB_WAGE.teach);
  assert.equal(wages(s.staff, s.club), 320 + 280 + 1650);
  assert.equal(payWages(s, 2).due, 2 * (320 + 280 + 1650), 'a skip pays each month it crossed');
  const g = letGoPro(s, 1)!; assert.equal(g.gone.role, 'sec'); assert.equal(g.cost, 450); assert.deepEqual(g.s.club, { head: 1, teach: 1 });
  assert.equal(letGoPro(s, 9), null);
  const d = dropProsAt(s, new Set([11])); // the office bulldozed: the head pro and the secretary go
  assert.deepEqual(d.gone.map(p => p.role).sort(), ['head', 'sec']); assert.equal(d.cost, 1350); assert.deepEqual(d.s.club, { teach: 1 });
  const d2 = dropProsAt(s, new Set([10, 11])); assert.equal(d2.s, s); assert.equal(d2.cost, 0);
  const none = dropProsAt(s, new Set()); assert.equal(none.s.pros, undefined); assert.equal(none.s.club, undefined);
});

const counts = (range = 0, putting = 0, chipping = 0, academy = 0) => ({ range, putting, chipping, academy });

test("a month's lessons: the range hut (P24's share), after the academy's own, a green's hut, the cap, the members'", () => {
  const scale = 40, base = { scale, huts: ['range'] as const, members: 0, anyPro: true };
  // the first read books no hut lessons (no counts seen yet), only the counts
  const first = lessonsMonth(undefined, { ...base, counts: counts(100) }, 1);
  assert.deepEqual(first.at, {}); assert.deepEqual(first.seen, counts(100));
  // 10 new golfers: 1.5 lessons x $15 x the scale
  const r = lessonsMonth(counts(100), { ...base, counts: counts(110) }, 1);
  assert.equal(r.at.range!.takings, Math.round(10 * LESSON_SHARE * LESSON * scale)); assert.equal(r.at.range!.lessons, 10 * LESSON_SHARE * scale);
  // the academy took 1 of them
  const a = lessonsMonth(counts(100, 0, 0, 0), { ...base, counts: counts(110, 0, 0, 1) }, 1);
  assert.equal(a.at.range!.takings, Math.round((10 * LESSON_SHARE - 1) * LESSON * scale));
  // the cap: one lesson an hour per pro
  const c = lessonsMonth(counts(0), { ...base, counts: counts(1000) }, 1);
  assert.equal(c.at.range!.takings, Math.round(LESSON_CAP * LESSON * scale));
  assert.equal(lessonsMonth(counts(0), { ...base, counts: counts(1000) }, 3).at.range!.takings, Math.round(3 * LESSON_CAP * LESSON * scale), 'a skip: the cap of each month');
  // the putting green's hut: 8% at $12
  const p = lessonsMonth(counts(), { ...base, huts: ['putting'], counts: counts(0, 20) }, 1);
  assert.equal(p.at.putting!.takings, Math.round(20 * 0.08 * 12 * scale)); assert.equal(p.at.range, undefined);
  // no hut with a pro: nothing at the range; the members' lesson while any pro is on the staff
  const m = lessonsMonth(counts(), { ...base, huts: [], members: 120, counts: counts(50) }, 2);
  assert.deepEqual(m.at, {}); assert.equal(m.members.takings, Math.round(120 / 12 * 2 * MEMBER_LESSON));
  assert.equal(lessonsMonth(counts(), { ...base, huts: [], members: 120, anyPro: false, counts: counts() }, 1).members.takings, 0);
  assert.equal(lessonsMonth(counts(), { ...base, members: 120, counts: counts(50) }, 0).members.takings, 0, 'no month begun: nothing');
});

test("the staff's sales credit: their rates' share of the month's joined, their renewals of the members", () => {
  const w = staffWork(10, 100, true, true), all = J_BASE + J_PRO + J_SEC;
  assert.ok(Math.abs(w.head.sold - 10 * J_PRO / all) < 1e-9); assert.ok(Math.abs(w.sec.sold - 10 * J_SEC / all) < 1e-9);
  assert.ok(Math.abs(w.head.kept - 100 * C_PRO) < 1e-9); assert.ok(Math.abs(w.sec.kept - 100 * C_SEC) < 1e-9);
  assert.deepEqual(staffWork(10, 100, false, false), { head: { sold: 0, kept: 0 }, sec: { sold: 0, kept: 0 } });
});

test('your lesson: its reasons, and the bonus on the next practice session (T241 hook)', () => {
  assert.match(lessonWhy(null, 3, 600, false), /Hire a teaching pro/);
  assert.match(lessonWhy(null, 3, PRO_DAY[0] - 1, true), /07:00 to 18:00/);
  assert.equal(lessonWhy(null, 3, 600, true), '');
  assert.match(lessonWhy({ day: 3, with: 'A B', used: false }, 3, 600, true), /Booked/);
  assert.match(lessonWhy({ day: 3, with: 'A B', used: true }, 3, 600, true), /One lesson a day/);
  assert.equal(lessonWhy({ day: 2, with: 'A B', used: true }, 3, 600, true), '', 'yesterday\'s lesson: a new one today');
  const p = startProfile(), c = { day: 3, minute: 600, price: 6 };
  const plain = practise(p, 'bucket', c).entry, taught = practise(p, 'bucket', c, { bonus: LESSON_BONUS, price: 0 }).entry;
  assert.ok(Math.abs(taught.gains.driving! - plain.gains.driving! * (1 + LESSON_BONUS)) < 0.02);
  assert.equal(taught.lesson, true); assert.equal(taught.cost, plain.cost, 'your own pro: free');
  // the booking survives the save
  const n = normalizePlayer({ ...p, lesson: { day: 3, with: 'Ann Cox', used: true } })!;
  assert.deepEqual(n.lesson, { day: 3, with: 'Ann Cox', used: true });
  assert.equal(normalizePlayer({ ...p, lesson: { day: 'x' } })!.lesson, undefined);
});

test("the pros' beats: off duty outside 07:00-18:00; home, the walk, work, the walk back; fading at the day's ends", () => {
  const b = { home: { x: 0, y: 0 }, work: { x: 14, y: 0 }, seed: 0, demo: true }, o: ProPose = { x: 0, y: 0, face: 0, walking: false, walked: 0, work: -1, alpha: 1 };
  assert.equal(proPose(b, 0, PRO_DAY[0] - 1, o), null);
  assert.equal(proPose(b, 0, PRO_DAY[1], o), null);
  const at = (t: number) => { const q = proPose(b, t, 700, o)!; return { x: q.x, walking: q.walking, work: q.work }; };
  assert.deepEqual(at(1), { x: 0, walking: false, work: -1 });
  const walk = 14 / PRO_WALK, mid = at(PRO_HOME_S + walk / 2); assert.ok(mid.walking && Math.abs(mid.x - 7) < 1e-6);
  const w = at(PRO_HOME_S + walk + 3); assert.equal(w.x, 14); assert.ok(Math.abs(w.work - 3) < 1e-6);
  assert.ok(proPose(b, 0, PRO_DAY[0] + 5, o)!.alpha < 1); assert.equal(proPose(b, 0, 700, o)!.alpha, 1);
});

test('the Staff card: a section per building, open rows with their locks, the season foot; and the save keeps the hires', () => {
  let s = fresh();
  const empty = staffCardView(s, needs({ office: null, huts: [] }), 3, 3);
  assert.equal(empty.built, false); assert.equal(empty.wages, 0);
  assert.match(empty.sections[0]!.rows[0]!.why, /pro's office/);
  s = hirePro(s, 'head', 10, 1, 9).s; s = hirePro(s, 'teach', 11, 2, 9).s;
  s = { ...s, pros: s.pros!.map(p => p.role === 'teach' ? { ...p, work: { lessons: 86, takings: 1290, sold: 0, kept: 0 } } : p) };
  const v = staffCardView(s, needs({ huts: [{ id: 11, at: 'range' }, { id: 12, at: 'putting' }] }), 4, 4);
  assert.deepEqual(v.sections.map(x => x.title), ["Pro's office", 'Range hut', 'Putting green hut']);
  assert.equal(v.wages, 1200);
  assert.ok(v.sections[0]!.rows[0]!.hire); assert.equal(v.sections[0]!.rows[1]!.why, '', 'the secretary can be hired');
  assert.match(v.sections[1]!.rows[0]!.hire!.work, /86 lessons, \$1,290/);
  assert.equal(v.sections[2]!.rows[0]!.why, '', "the putting green's hut has no pro yet");
  assert.equal(v.season.wages, 900 * 3 + 300 * 2); assert.equal(v.season.brought, 1290);
  const back = normalizeStaff(JSON.parse(JSON.stringify(s)))!;
  assert.deepEqual(back.pros, s.pros); assert.deepEqual(back.club, s.club); assert.equal(back.hires, 2);
  // a save with too many of a role keeps the most; an old save (no pros) keeps its counts
  const many = normalizeStaff({ ...JSON.parse(JSON.stringify(s)), pros: [...s.pros!, { ...s.pros![0]! }] })!;
  assert.equal(many.pros!.length, 2);
  assert.deepEqual(normalizeStaff({ ...JSON.parse(JSON.stringify(fresh())), club: { head: 1 } })!.club, { head: 1 });
});
