// T208 everyday golf (src/game/golf/everyday.ts, everydayview.ts): the day's golfers pay what greenFeeIncome expects (within a tolerance); members pay
// no fee; no everyday play on a tournament day; two groups never share a green (T211's rule holds for the everyday field); a save mid-day resumes; the
// roster and the round are the same from the same seed and day; the pace term; the playback draws only the groups on screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import { FLIGHT_TIME, PUTT_FLIGHT } from '../src/game/golf/play';
import type { CourseView, Group, Lie, PlayHole, Pt, RoundPlan, Shot } from '../src/game/golf/play';
import { DAY_FIRST_TEE, DAY_LAST_TEE, DAY_TEE_GAP, DayBook, dayCourse, PACE_REP_GOOD, PACE_REP_SLOW, checkInsTo, dayMembers, dayPace, dayPlan, dayRoster, feeScale, normalizeDaySave, paceReputation, type DayInputs } from '../src/game/golf/everyday';
import { DayView } from '../src/game/golf/everydayview';
import { GREEN_FEE_PER_ROUND, OFF_SEASON_PLAY_DAYS, computeTournamentCloseBook, computeYearEnd, dailyGolfers, greenFeeIncome } from '../src/game/golf/yearend';
import { SEASON_LEN } from '../src/game/golf/calendar';
import type { CourseFacts, Need } from '../src/game/golf/tour';
import type { RoundResult } from '../src/game/event/round';

/** the pars of the 18 holes */
const PARS: (3 | 4 | 5)[] = [3, 4, 4, 5, 3, 4, 4, 4, 5, 4, 3, 4, 4, 4, 5, 4, 4, 5];
/** the distance (tiles) from p to the segment a-b */
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}
/** the synthetic course of the golf play tests: each hole on its own row, greens 12 m round each pin, a fairway strip, rough, out of bounds beyond */
function course(): CourseView {
  const holes: PlayHole[] = PARS.map((par, h) => {
    const y = 20 + 60 * h, tee = { x: 10, y }, pin = { x: 10 + (par === 3 ? 160 : par === 4 ? 380 : 500) / TILE_M, y };
    return { n: h + 1, par, tee, pin, line: [tee, pin] };
  });
  const lieAt = (x: number, y: number): Lie => {
    for (const h of holes) if (Math.hypot(x - h.pin.x, y - h.pin.y) <= 6) return 'green';
    let d = Infinity;
    for (const h of holes) d = Math.min(d, segDist({ x, y }, h.tee, h.pin));
    return d <= 7.5 ? 'fairway' : d <= 40 ? 'rough' : 'out';
  };
  return { holes, lieAt };
}
const VIEW = course();
const CLUB: DayInputs = { quality: 80, rep: 50, holes: 18 };
const SEED = 12345;

test('roster: the same from the same seed and day; twos to fours; tee times in the day, at least the gap apart; ids 0..n-1', () => {
  const a = dayRoster(SEED, 7, CLUB), b = dayRoster(SEED, 7, CLUB), c = dayRoster(SEED, 8, CLUB);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.golfers.map(g => g.name), c.golfers.map(g => g.name));
  assert.ok(a.groups.length > 5);
  a.golfers.forEach((g, i) => assert.equal(g.id, i));
  for (const gr of a.groups) { assert.ok(gr.players.length >= 2 && gr.players.length <= 4, `group of ${gr.players.length}`); }
  for (let i = 0; i < a.groups.length; i++) {
    const t = a.groups[i]!.tee; assert.ok(t >= DAY_FIRST_TEE && t <= DAY_LAST_TEE, `tee ${t}`);
    if (i) assert.ok(t - a.groups[i - 1]!.tee >= DAY_TEE_GAP - 1, `gap ${t - a.groups[i - 1]!.tee}`);
    const inf = a.info[i]!; assert.ok(inf.checkIn < inf.tee && inf.arrive < inf.checkIn);
  }
  assert.equal(a.members + a.visitors, a.golfers.length);
  assert.ok(a.members > 0 && a.visitors > 0);
});

test('money: a day\'s golfers pay what greenFeeIncome expected, within a tolerance; a season of town days books it through the scale', () => {
  for (const inp of [CLUB, { quality: 40, rep: 10, holes: 9 }, { quality: 95, rep: 90, holes: 18 }] as DayInputs[]) {
    const expect = greenFeeIncome(inp.quality, inp.rep, inp.holes);
    // one day, as greenFeeIncome counts it (dailyGolfers x the fee x the billing days), within the day-to-day spread
    const one = dayRoster(SEED, 3, inp).fees * OFF_SEASON_PLAY_DAYS;
    assert.ok(Math.abs(one - expect) <= 0.2 * expect + GREEN_FEE_PER_ROUND * OFF_SEASON_PLAY_DAYS * 2, `one day ${one} vs ${expect}`);
    // forty days average within 5%
    let sum = 0; for (let d = 1; d <= 40; d++) sum += dayRoster(SEED, d, inp).fees;
    const avg = sum / 40 * OFF_SEASON_PLAY_DAYS; assert.ok(Math.abs(avg - expect) <= 0.05 * expect, `forty days ${avg.toFixed(0)} vs ${expect}`);
    // the visitors are dailyGolfers' count, on average
    let vis = 0; for (let d = 1; d <= 40; d++) vis += dayRoster(SEED, d, inp).visitors;
    assert.ok(Math.abs(vis / 40 - dailyGolfers(inp.quality, inp.rep, inp.holes)) <= 0.05 * dailyGolfers(inp.quality, inp.rep, inp.holes) + 1);
  }
  // the scale: a season (SEASON_LEN sim s) of town days of 600 sim s books the season's billing days
  assert.ok(Math.abs(feeScale(600) * SEASON_LEN / 600 - OFF_SEASON_PLAY_DAYS) < 1e-9);
});

test('money: members pay no fee; a group pays its visitors\' green fees at check-in, in check-in order', () => {
  const r = dayRoster(SEED, 4, CLUB);
  for (const g of r.info) assert.equal(g.fee, g.member ? 0 : g.size * GREEN_FEE_PER_ROUND);
  assert.equal(r.fees, r.visitors * GREEN_FEE_PER_ROUND);
  const mid = r.info[r.order[Math.floor(r.order.length / 2)]!]!.checkIn, c = checkInsTo(r, 0, mid), all = checkInsTo(r, c.paid, Infinity);
  assert.equal(c.fees + all.fees, r.fees); assert.equal(c.members + all.members, r.members); assert.equal(c.visitors + all.visitors, r.visitors);
  assert.equal(all.paid, r.order.length);
  // a club with members only (no visitors: a busy count of 0) books nothing
  const m = dayRoster(SEED, 4, { ...CLUB, busy: 0 }); assert.ok(m.members > 0); assert.equal(m.visitors, 0); assert.equal(m.fees, 0);
  assert.ok(dayMembers({ quality: 80, rep: 50, holes: 18 }) > dayMembers({ quality: 80, rep: 10, holes: 18 }));
});

/** each group's time on each green, from its shots (as golf-play-pace.test.ts) */
const dur = (s: Shot) => s.club === 'putter' ? PUTT_FLIGHT : FLIGHT_TIME;
function noGreenOverlap(p: RoundPlan, gs: Group[]): void {
  const of = new Map<number, number>(); gs.forEach((g, i) => g.players.forEach(id => of.set(id, i)));
  for (let h = 0; h < 18; h++) {
    const span = new Map<number, { a: number; b: number }>();
    for (const s of p.shots) {
      if (s.hole !== h) continue;
      const g = of.get(s.golfer)!, e = span.get(g) ?? { a: Infinity, b: -Infinity };
      if (s.lie === 'green' || s.holed) e.a = Math.min(e.a, s.t + dur(s));
      e.b = Math.max(e.b, s.t + dur(s)); span.set(g, e);
    }
    const sp = [...span.entries()].filter(([, e]) => Number.isFinite(e.a));
    for (let i = 0; i < sp.length; i++) for (let j = i + 1; j < sp.length; j++) {
      const x = sp[i]![1], y = sp[j]![1];
      assert.ok(x.b <= y.a || y.b <= x.a, `groups ${sp[i]![0]} and ${sp[j]![0]} on the green of hole ${h} at once`);
    }
  }
}

test('round: the everyday field plays the course in T211\'s order; two groups never share a green; everyone is done by evening; the same twice', () => {
  const r = dayRoster(SEED, 5, CLUB), t0 = performance.now(), p = dayPlan(VIEW, r), ms = performance.now() - t0;
  console.log(`[everyday] ${r.golfers.length} golfers in ${r.groups.length} groups played in ${ms.toFixed(0)} ms; pace`, dayPace(p));
  noGreenOverlap(p, r.groups);
  for (const g of r.golfers) { assert.ok(Number.isFinite(p.done[g.id]!)); assert.ok(p.done[g.id]! < 24 * 60, `done ${p.done[g.id]}`); }
  assert.deepEqual(dayPlan(VIEW, dayRoster(SEED, 5, CLUB)).shots, p.shots);
  // a busy day (the bench's hundred-plus): still no shared green
  const b = dayRoster(SEED, 5, { ...CLUB, busy: 140 }); noGreenOverlap(dayPlan(VIEW, b), b.groups);
});

test('round: a 9-hole course is a 9-hole everyday round, so a group on its second loop never meets one on its first on a green', () => {
  // the tournament's view of a 9-hole course lists it twice (courseview.ts): the same line objects again
  const nine = VIEW.holes.slice(0, 9), twice: CourseView = { holes: [...nine, ...nine], lieAt: VIEW.lieAt };
  const v = dayCourse(twice); assert.equal(v.holes.length, 9); assert.equal(dayCourse(VIEW).holes.length, 18);
  const r = dayRoster(SEED, 6, { ...CLUB, holes: 9, busy: 90 }), p = dayPlan(v, r);
  assert.ok(p.shots.every(s => s.hole < 9));
  noGreenOverlap(p, r.groups);
});

test('pace term: a quick course gains, a slow one loses, nothing with no play', () => {
  assert.equal(paceReputation(0, 10), PACE_REP_GOOD);
  assert.equal(paceReputation(60, 10), PACE_REP_SLOW);
  assert.ok(paceReputation(15, 10) < PACE_REP_GOOD && paceReputation(15, 10) > PACE_REP_SLOW);
  assert.equal(paceReputation(60, 0), 0);
});

test('book: check-ins booked as the minute passes them, scaled; no play on a tournament day; the paid fees stay; a save mid-day resumes', () => {
  const scale = feeScale(600), inputs = () => CLUB, none = () => null;
  const book = new DayBook(SEED, null);
  // a fresh book mid-morning books nothing for the check-ins already past
  assert.equal(book.step(2, 600, true, inputs, scale, none).fees, 0);
  const r2 = book.rosterOf()!, paid0 = book.save!.paid; assert.ok(paid0 > 0);
  // on through the day: the rest of day 2's fees
  let fees = 0; for (let m = 600; m <= 1440; m += 7) fees += book.step(2, m, true, inputs, scale, none).fees;
  const rest = checkInsTo(r2, paid0, Infinity).fees * scale; assert.ok(Math.abs(fees - rest) < 1e-6, `${fees} vs ${rest}`);
  // day 3 in two halves, with a save (JSON) in the middle: the resumed book books the same as one that ran on
  const run = new DayBook(SEED, JSON.parse(JSON.stringify(book.save)));
  let a = 0, b = 0;
  for (let m = 0; m < 700; m += 5) { a += book.step(3, m, true, inputs, scale, none).fees; b += run.step(3, m, true, inputs, scale, none).fees; }
  const saved = normalizeDaySave(JSON.parse(JSON.stringify(book.save)))!, res = new DayBook(SEED, saved);
  for (let m = 700; m < 1440; m += 5) { a += book.step(3, m, true, inputs, scale, none).fees; b += res.step(3, m, true, inputs, scale, none).fees; }
  assert.ok(Math.abs(a - b) < 1e-6 && a > 0, `${a} vs ${b}`);
  assert.ok(Math.abs(a - dayRoster(SEED, 3, CLUB).fees * scale) < 1e-6, 'the whole of day 3 was booked once');
  // a tournament day (the round not free): no check-in is booked, the day stays closed after the round is free again
  const t = new DayBook(SEED, null); t.step(4, 0, true, inputs, scale, none);
  let tf = 0; for (let m = 0; m < 1440; m += 5) tf += t.step(4, m, m < 300 ? true : m < 900 ? false : true, inputs, scale, none).fees;
  const before = checkInsTo(t.rosterOf()!, 0, 300).fees * scale; assert.equal(tf, before, 'only the check-ins before the tournament began');
  assert.ok(t.save!.closed);
  // the next day plays again; its first check-in pays
  let nf = 0; for (let m = 0; m < 1440; m += 5) nf += t.step(5, m, true, inputs, scale, none).fees; assert.ok(nf > 0);
  // a skip across two whole days books them, and the season counts them
  const s = new DayBook(SEED, null); s.step(6, 0, true, inputs, scale, none); s.step(9, 10, true, inputs, scale, none);
  const exp = (dayRoster(SEED, 6, CLUB).fees + dayRoster(SEED, 7, CLUB).fees + dayRoster(SEED, 8, CLUB).fees) * scale;
  assert.ok(Math.abs(s.season().fees - exp) < 1e-6); assert.equal(s.season().days, 3);
  assert.equal(s.endSeason().days, 3); assert.equal(s.season().days, 0);
});

test('view: arrivals by car, the walk to the clubhouse, the round, the walk back; only the groups on screen are played back', () => {
  const r = dayRoster(SEED, 5, CLUB), p = dayPlan(VIEW, r);
  const bays = Array.from({ length: 40 }, (_, i) => ({ x: -20 + (i % 10) * 1.25, y: -10 - Math.floor(i / 10) * 2.5, hx: 0, hy: 1 }));
  const ground = { door: { x: -5, y: 0 }, bays, entrance: { x: -25, y: -5 } };
  const v = new DayView(p, r, VIEW, ground), first = r.info[0]!;
  // the first group's car driving in, then parked; its golfers walking to the door
  v.update(first.arrive - 0.5, 0, -100, -100, 2000, 2000); assert.ok(v.cars.length >= 1); assert.equal(v.people.length, 0);
  v.update(first.arrive + 0.5, 1, -100, -100, 2000, 2000); assert.equal(v.people.length, r.groups[0]!.players.length); assert.ok(v.cars.length >= 1);
  // mid-morning, the whole course in view: golfers on it; a box far away: none drawn, and no round played back
  v.update(660, 2, -100, -100, 2000, 2000); const all = v.people.length; assert.ok(all > 10, `${all} on screen`);
  v.update(660, 3, 5000, 5000, 5100, 5100); assert.equal(v.people.length, 0); assert.equal(v.balls.length, 0);
  assert.ok(v.outNow(660) >= all - 2);
  // a busy 18-hole day: a hundred and more out at once; the playback's cost per frame with all of them on screen, and with none (logged)
  const br = dayRoster(SEED, 5, { ...CLUB, busy: 220 }), tp = performance.now(), bp = dayPlan(VIEW, br), planMs = performance.now() - tp, bv = new DayView(bp, br, VIEW, ground);
  const out = bv.outNow(720); assert.ok(out >= 100, `${out} out at noon`);
  let t0 = performance.now(); for (let k = 0; k < 200; k++) bv.update(720 + k * 0.05, k / 60, -100, -100, 2000, 2000);
  const onMs = (performance.now() - t0) / 200, drawn = bv.people.length;
  t0 = performance.now(); for (let k = 0; k < 200; k++) bv.update(730 + k * 0.05, k / 60, 5000, 5000, 5100, 5100);
  console.log(`[everyday] ${br.golfers.length} golfers, ${br.groups.length} groups played in ${planMs.toFixed(0)} ms; ${out} out at noon: ${drawn} drawn ${onMs.toFixed(3)} ms a frame; none on screen ${((performance.now() - t0) / 200).toFixed(3)} ms a frame`);
  // the evening: every car gone
  v.update(23 * 60, 4, -100, -100, 2000, 2000); assert.equal(v.cars.length, 0); assert.equal(v.people.length, 0); assert.equal(v.parkedNow(23 * 60), 0);
});

test('close book: the green fees the season played are its line, already in the treasury: not booked again; without them the expectation as before', () => {
  const rr = { level: 1, run: 1, sent: 100, arrived: 250, rate: 0.83, upkeep: 400, payout: 0, net: -400, prevRate: null, stuck: [], perfect: false, byTown: [] } as unknown as RoundResult;
  const facts: CourseFacts = { holes: 9, lengthM: 2800, have: new Set<Need>(['carpark']) };
  const ye = computeYearEnd(1, 40, rr, facts, 0, [], [], 'clear', 80);
  const before = computeTournamentCloseBook(ye, 0, []);
  assert.equal(before.greenFeeIncome, ye.greenFeeIncome);
  const played = computeTournamentCloseBook({ ...ye, greenFeesPlayed: 12345 }, 0, []);
  assert.equal(played.greenFeeIncome, 12345);
  assert.equal(played.bizIncome, before.bizIncome - before.greenFeeIncome);
  assert.equal(played.net, before.net - before.greenFeeIncome + 12345);
});
