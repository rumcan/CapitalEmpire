// T214 (#559, plan P26 phase 1): the club's members (src/game/golf/club.ts): the fair price and the pool against P26's tables, the price's effect,
// the month's step against hand numbers, the founding drive, the deterministic skip (and after a reload), the hold at a season's turn, the
// equilibria of P26 4.5 (with the staff's terms, phase 4's), normalize, an old save's club (section 8: the members its card showed, $50, the
// founding drive done, the season booked once), the close book (the dues booked live are not booked again), and the one wage book (golf/staff.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BAR_SHOP_PRICE, BAR_SHOP_PRO, C_MIN, FOUNDING, J_BASE, LEGACY_DUES, MEMBER_UPKEEP, POOL_TOWN, PRICE_MAX, PRICE_MIN, PRICE_START,
  appeal, appealTerms, churnRate, clampPrice, closeSeason, fairBand, fairPrice, foundingDrive, holdTo, joinRate, legacyClub, legacyMembers, memberPool,
  membersView, monthStep, newClub, normalizeClubSave, priceEffect, seasonMemberships, stepTo, visitorsADay, type ClubInputs, type ClubSave,
} from '../src/game/golf/club';
import { annualMembershipIncome, computeTournamentCloseBook, computeYearEnd, GREEN_FEE_PER_ROUND, legacyMonthlyMembership, OFF_SEASON_PLAY_DAYS } from '../src/game/golf/yearend';
import { CLUB_WAGE, WAGE, clubTerms, freshStaff, normalizeStaff, payWages, wages } from '../src/game/golf/staff';
import type { CourseFacts, Need } from '../src/game/golf/tour';
import type { RoundResult } from '../src/game/event/round';

const near = (a: number, b: number, eps = 1e-9, what = '') => assert.ok(Math.abs(a - b) <= eps, `${what} ${a} vs ${b}`);
/** a club this month: an 18-hole course of quality 100 and reputation 100, the clubhouse at level 1, no waits, no staff, 1,000 residents, 50 visitors a day */
const INP: ClubInputs = { residents: 1000, quality: 100, rep: 100, holes: 18, visitors: 50, level: 1, waitAvg: 0, slow: 0 };
const club = (o: Partial<ClubSave> = {}): ClubSave => ({ ...newClub(10), founded: true, ...o });

test("the owner's questions at the lead's recommendations (P26 6.4): Q1 4% of the town, Q2 the 40% founding drive and 2% base sales, Q3 the wages, Q4 $8", () => {
  assert.equal(POOL_TOWN, 0.04);
  assert.equal(FOUNDING, 0.4); assert.equal(J_BASE, 0.02);
  assert.deepEqual({ ...CLUB_WAGE }, { head: 900, teach: 300, sec: 450 });
  assert.equal(BAR_SHOP_PRICE, 8); assert.equal(BAR_SHOP_PRO, 0.2);
  assert.equal(PRICE_START, 40); assert.equal(LEGACY_DUES, 50);
});

test('the fair price and its band: P26 4.1\'s table (its first 18\'s band, 66-90, was taken from the fair price rounded to $78; unrounded, 78.25, it is 67-90)', () => {
  const rows: [number, number, number, number, number, string][] = [
    [85, 56, 9, 1, 49, '42-56'], [85, 73, 9, 2, 56, '47-64'], [85, 75, 18, 2, 78, '67-90'], [85, 80, 18, 3, 85, '72-98'], [85, 80, 18, 5, 97, '82-112'],
  ];
  for (const [q, r, h, l, fair, band] of rows) {
    const f = fairPrice(q, r, h, l), b = fairBand(f);
    assert.equal(Math.round(f), fair, `fair at q ${q} r ${r} ${h} holes level ${l}`);
    assert.equal(`${Math.round(b[0])}-${Math.round(b[1])}`, band);
  }
  // the inputs are clamped (0..100, level at least 1)
  assert.equal(fairPrice(150, -5, 9, 0), fairPrice(100, 0, 9, 1));
});

test('the pool: 4% of the residents and 0.8 of the visitors a day (P26 4.3\'s table)', () => {
  for (const [res, vis, pool] of [[160, 39, 38], [823, 48, 71], [2600, 65, 156], [5541, 65, 274]]) assert.equal(Math.round(memberPool(res!, vis!)), pool);
  assert.equal(memberPool(-10, -3), 0);
});

test("the price's effect (P26 4.4's table) and the paying visitors once there are members (P26 4.6)", () => {
  for (const [k, e] of [[0.5, 2], [0.85, 1.3], [1, 1], [1.15, 0.7], [1.5, 0.1], [3, 0.1], [0.1, 2]]) near(priceEffect(k! * 60, 60), e!, 1e-9, `at ${k} F`);
  assert.equal(visitorsADay(40, 0), 40);
  near(visitorsADay(40, 100), 25, 1e-9, '100 members: 15 visitors a day fewer');
  assert.equal(visitorsADay(40, 1000), 20, 'never below half');
});

test('the appeal: its five terms (P26 4.4)', () => {
  const a = appealTerms(INP);
  near(a.quality, 1); near(a.rep, 1.3); near(a.clubhouse, 0.9); near(a.holes, 1.15); near(a.pace, 1);
  near(appeal(INP), 1.3 * 0.9 * 1.15);
  const b = appealTerms({ ...INP, quality: 0, rep: 0, level: 5, holes: 9, slow: 1 });
  near(b.quality, 0.5); near(b.rep, 0.7); near(b.clubhouse, 1.3); near(b.holes, 1); near(b.pace, 0.7);
  near(appealTerms({ ...INP, holes: 3 }).holes, 1 / 3); near(appealTerms({ ...INP, holes: 12 }).holes, 1);
  assert.equal(appeal({ ...INP, holes: 0 }), 0, 'no holes, no sales');
});

test('a month: sales, churn, dues and upkeep against hand numbers', () => {
  // fair = (15 + 30 + 15) x 1.4 = 84; at $84 the price's effect is 1; appeal 1.3455; j = 0.02 x 1.3455; the pool 0.04 x 1000 + 0.8 x 50 = 80
  const s = club({ members: 20, price: 84 }), r = monthStep(s, INP);
  const j = 0.02 * 1.3455, joined = j * 60, left = 0.02 * 20, members = 20 + joined - left;
  near(r.booked.joined, joined, 1e-9, 'joined'); near(r.booked.left, left, 1e-9, 'left');
  near(r.s.members, members, 1e-9, 'members'); near(r.booked.dues, members * 84, 1e-6, 'dues'); near(r.booked.upkeep, members * MEMBER_UPKEEP, 1e-9, 'upkeep');
  assert.equal(r.s.month, 11); assert.deepEqual(r.s.last, { joined: r.booked.joined, left: r.booked.left });
  near(r.s.season.dues, r.booked.dues); near(r.s.season.joined, joined);
  assert.equal(s.members, 20, 'the old club is not changed');
  // dear: churn 2% + 4% x (price / fair - 1); cheap: never below the floor
  near(churnRate(INP, 126), 0.02 + 0.04 * 0.5);
  near(churnRate({ ...INP, slow: 1 }, 84), 0.03, 1e-12, 'a slow course: +1%');
  near(churnRate({ ...INP, staff: { head: true, sec: true } }, 84), 0.02 - 0.008 - 0.004, 1e-12, "the staff's renewals (phase 4)");
  assert.equal(churnRate({ ...INP, staff: { head: true, sec: true } }, 10) >= C_MIN, true);
  near(joinRate({ ...INP, staff: { head: true, sec: false } }, 84), 0.045 * 1.3455, 1e-12, "the head pro's sales (phase 4)");
});

test('the founding drive: 40% of the pool, once', () => {
  const s = newClub(5), f = foundingDrive(s, INP);
  near(f.joined, 0.4 * 80); near(f.s.members, 32); assert.equal(f.s.founded, true); near(f.s.season.joined, 32);
  const again = foundingDrive(f.s, INP); assert.equal(again.joined, 0); assert.equal(again.s, f.s);
});

test('a skip steps every month it crossed, the same as month by month and after a reload; a turn back of less than a season holds', () => {
  const s = club({ members: 12, price: 60 });
  const one = stepTo(s, 15, () => INP);
  let c = s; for (let k = 0; k < 5; k++) c = monthStep(c, INP).s;
  assert.equal(one.booked.months, 5); assert.deepEqual(one.s, c);
  const reloaded = normalizeClubSave(JSON.parse(JSON.stringify(stepTo(s, 12, () => INP).s)))!;
  const two = stepTo(reloaded, 15, () => INP);
  near(two.s.members, one.s.members, 1e-9, 'after a reload'); near(two.s.season.dues, one.s.season.dues, 1e-6);
  // the same month: nothing; a month back (the clock read a unit early at a season's turn): held, nothing booked; a season back: a new clock
  assert.equal(stepTo(one.s, 15, () => INP).booked.months, 0);
  assert.equal(stepTo(one.s, 4, () => INP).s, one.s);
  assert.equal(stepTo(one.s, 3, () => INP).s.month, 3);
  assert.equal(holdTo(one.s, 20).month, 20); assert.equal(holdTo(one.s, 20).members, one.s.members); assert.equal(holdTo(one.s, 9), one.s);
});

test('the members settle where P26 4.5 says, at the fair price with appeal about 0.88: 47% of the pool, 77% with a head pro, 88% with the secretary too', () => {
  // quality 85, reputation 62, 9 holes, level 1: appeal = 0.925 x 1.072 x 0.9 x 1 = 0.892
  const base: ClubInputs = { ...INP, quality: 85, rep: 62, holes: 9 }, fair = fairPrice(85, 62, 9, 1);
  near(appeal(base), 0.88, 0.02, 'appeal');
  const settle = (staff?: { head: boolean; sec: boolean }) => {
    let c = club({ members: 0, price: fair }); for (let k = 0; k < 600; k++) c = monthStep(c, { ...base, staff }).s;
    return c.members / memberPool(base.residents, base.visitors);
  };
  near(settle(), 0.47, 0.01, 'no staff'); near(settle({ head: true, sec: false }), 0.77, 0.01, 'a head pro'); near(settle({ head: true, sec: true }), 0.88, 0.01, 'and a secretary');
});

test('normalize: junk is none, missing fields default, the price on its steps, the legacy months kept', () => {
  assert.equal(normalizeClubSave(null), null); assert.equal(normalizeClubSave({}), null); assert.equal(normalizeClubSave({ members: 3 }), null);
  const n = normalizeClubSave({ month: 7.6, members: -4, price: 43, founded: 1 } as unknown)!;
  assert.deepEqual(n, { members: 0, price: 45, founded: true, month: 7, last: { joined: 0, left: 0 }, season: { dues: 0, upkeep: 0, joined: 0, left: 0 } });
  assert.equal(normalizeClubSave({ ...n, price: 5000 })!.price, PRICE_MAX); assert.equal(normalizeClubSave({ ...n, price: 1 })!.price, PRICE_MIN);
  assert.equal(normalizeClubSave({ ...n, legacyMonths: 4 })!.legacyMonths, 4); assert.equal('legacyMonths' in normalizeClubSave({ ...n, legacyMonths: 0 })!, false);
  const full = club({ members: 12.345, price: 65, last: { joined: 1.5, left: 0.25 }, season: { dues: 1234.5, upkeep: 60, joined: 4, left: 1 }, legacyMonths: 3 });
  assert.deepEqual(normalizeClubSave(JSON.parse(JSON.stringify(full))), full);
  assert.equal(clampPrice(42), 40); assert.equal(clampPrice(43), 45); assert.equal(clampPrice(NaN), PRICE_START);
});

test("an old save's club (P26 section 8): the members its Clubhouse card showed, $50, the founding drive done; its season booked once, not twice nor half", () => {
  const inp = { quality: 82, rep: 47, holes: 9 }, card = Math.round(legacyMonthlyMembership(82, 47, 9) / 50);
  for (const k of [0, 3, 7, 11]) {
    // loaded in month k of the season: k + 1 months were the old rule's (the month under way included)
    const c = legacyClub(inp, 24 + k, k + 1, true);
    assert.equal(Math.round(c.members), card, 'the same count the card showed'); near(c.members * c.price, legacyMonthlyMembership(82, 47, 9), 1e-9);
    assert.equal(c.price, 50); assert.equal(c.founded, true); assert.equal(c.legacyMonths, k + 1); assert.equal(c.month, 24 + k);
    assert.equal(foundingDrive(c, INP).joined, 0, 'no windfall');
    // the rest of the season booked month by month, the pool set so the members hold (sales = churn), then the close: within $1 of the old rule
    const i0: ClubInputs = { ...INP, quality: 82, rep: 47, holes: 9, residents: 0, visitors: 0 }, j = joinRate(i0, 50), ch = churnRate(i0, 50);
    const i: ClubInputs = { ...i0, residents: c.members * (1 + ch / j) / POOL_TOWN };
    const end = stepTo(c, 35, () => i).s, annual = annualMembershipIncome(82, 47, 9), m = seasonMemberships(end, annual);
    near(end.members, c.members, 1e-6, 'the members held');
    assert.ok(Math.abs(m.total - annual) <= 1, `loaded in month ${k}: ${m.total} against the old rule's ${annual}`);
    near(m.legacy, annual * (k + 1) / 12, 0.5); assert.equal(m.booked, Math.round(end.season.dues));
    // the close drops the legacy months and starts the season again
    const next = closeSeason(end); assert.equal(next.legacyMonths, undefined); assert.equal(next.season.dues, 0); assert.equal(next.members, end.members);
  }
  // an old save with no clubhouse yet (a range start): no members, its founding drive when it builds one
  const none = legacyClub(inp, 5, 6, false);
  assert.equal(none.members, 0); assert.equal(none.founded, false); assert.equal(none.legacyMonths, undefined);
  near(legacyMembers(82, 47, 9), legacyMonthlyMembership(82, 47, 9) / 50);
});

test('the close book: the dues booked month by month are the Memberships line, not booked again; an old save\'s legacy months are', () => {
  const rr = { level: 1, run: 1, sent: 100, arrived: 250, rate: 0.83, upkeep: 400, payout: 0, net: -400, prevRate: null, stuck: [], perfect: false, byTown: [] } as unknown as RoundResult;
  const facts: CourseFacts = { holes: 9, lengthM: 2800, have: new Set<Need>(['carpark']) };
  const ye = computeYearEnd(1, 40, rr, facts, 0, [], [], 'clear', 80);
  const before = computeTournamentCloseBook(ye, 0, []);
  // the club: 9,000 of dues booked live and 1,500 of legacy months
  const live = computeTournamentCloseBook({ ...ye, membershipIncome: 10500, duesBooked: 9000 }, 0, []);
  assert.equal(live.membershipIncome, 10500);
  assert.equal(live.bizIncome, before.bizIncome - before.membershipIncome + 1500);
  assert.equal(live.net, before.net - before.membershipIncome + 10500);
  // dues booked over the line (never: it is clamped) book nothing back
  assert.equal(computeTournamentCloseBook({ ...ye, membershipIncome: 100, duesBooked: 900 }, 0, []).bizIncome, before.bizIncome - before.membershipIncome);
});

test("the card's view: the members rounded, the money a month, where the price stands", () => {
  const s = club({ members: 85.6, price: 85, last: { joined: 4.2, left: 0.6 }, season: { dues: 4000, upkeep: 100, joined: 12.4, left: 3.4 } });
  const v = membersView(s, INP);
  assert.equal(v.members, 86); assert.equal(v.joined, 4); assert.equal(v.left, 1); assert.equal(v.pool, 80);
  assert.equal(v.dues, 86 * 85); assert.equal(v.upkeep, 86 * 4);
  near(v.lost, (50 - visitorsADay(50, 86)) * GREEN_FEE_PER_ROUND * OFF_SEASON_PLAY_DAYS / 12);
  assert.equal(v.stand, 'fair');
  assert.equal(membersView({ ...s, price: 70 }, INP).stand, 'cheap'); assert.equal(membersView({ ...s, price: 100 }, INP).stand, 'dear');
  assert.deepEqual(v.season, { dues: 4000, joined: 12, left: 3 });
});

test('one wage book (T269): the club roles are paid with the crew in the same month; let go and kept by normalize; the terms', () => {
  const st = { ...freshStaff(10, [1, 2, 3], 4), staff: { gk: 1, mo: 1 }, club: { head: 1, sec: 1 } };
  assert.equal(wages(st.staff), WAGE.gk + WAGE.mo, 'the crew card: the crew alone');
  assert.equal(wages(st.staff, st.club), WAGE.gk + WAGE.mo + 900 + 450);
  assert.equal(payWages(st, 6).due, 2 * (WAGE.gk + WAGE.mo + 1350));
  assert.deepEqual(clubTerms(st), { head: true, sec: true }); assert.deepEqual(clubTerms(undefined), { head: false, sec: false });
  const n = normalizeStaff(JSON.parse(JSON.stringify({ ...st, club: { head: 4, teach: 2, sec: -1, junk: 3 } })))!;
  assert.deepEqual(n.club, { head: 1, teach: 2 });
  assert.equal('club' in normalizeStaff(JSON.parse(JSON.stringify({ ...st, club: undefined })))!, false, 'none: no field (an old save)');
});
