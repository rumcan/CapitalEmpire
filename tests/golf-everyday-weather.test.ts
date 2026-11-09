// T347 (#989): everyday golfers and a money match's opponent play in the day's wind, the lie's kinds and the slope, through the model the player and the tournament's field use (src/game/golf/everyday.ts dayConditions,
// dayPlan, DaySave.wx; play/match.ts oppShot and skipMatch with an EnvFor). The checks: the day's conditions are the world's wind of that town day; a day played in them is deterministic, differs from the day without them, costs the
// golfers strokes in a headwind and is no dearer to work out than a few times the plain day; a day saved from before (no `wx`) plays as it did and the next day has it; the pace of a settled day is worked out in the weather it was played in;
// the opponent's shot takes the conditions of its ball (and a putt none), a skipped match plays both sides in them; and with no conditions every shot is the shot of before (golden values captured from the unchanged code).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import { dailyWind, envOf, windToward } from '../src/game/golf/play';
import type { Conditions, CourseView, Lie, PlayHole, Pt, ShotEnv } from '../src/game/golf/play';
import { DayBook, dayConditions, dayPace, dayPlan, dayRoster, normalizeDaySave, type DayInputs, type DaySave } from '../src/game/golf/everyday';
import { matchHoles, opponentOf, oppShot, playMatchYours, skipMatch, startMatch } from '../src/game/golf/play/match';
import { normalizeGolfSave } from '../src/game/golf/mode';

const fnv = (s: string): string => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); };
const PARS: (3 | 4 | 5)[] = [3, 4, 4, 5, 3, 4, 4, 4, 5, 4, 3, 4, 4, 4, 5, 4, 4, 5];
function segDist(p: Pt, a: Pt, b: Pt): number { const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0; return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t); }
/** the synthetic course of tests/golf-everyday.test.ts: each hole on its own row, greens 12 m round each pin, a fairway strip, rough, out of bounds beyond */
function course(): CourseView {
  const holes: PlayHole[] = PARS.map((par, h) => { const y = 20 + 60 * h, tee = { x: 10, y }, pin = { x: 10 + (par === 3 ? 160 : par === 4 ? 380 : 500) / TILE_M, y }; return { n: h + 1, par, tee, pin, line: [tee, pin] }; });
  const lieAt = (x: number, y: number): Lie => { for (const h of holes) if (Math.hypot(x - h.pin.x, y - h.pin.y) <= 6) return 'green'; let d = Infinity; for (const h of holes) d = Math.min(d, segDist({ x, y }, h.tee, h.pin)); return d <= 7.5 ? 'fairway' : d <= 40 ? 'rough' : 'out'; };
  return { holes, lieAt };
}
const VIEW = course(), CLUB: DayInputs = { quality: 80, rep: 50, holes: 18 }, SEED = 12345;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const totals = (p: ReturnType<typeof dayPlan>) => p.strokes.map(r => r.reduce((a, b) => a + b, 0));

test('dayConditions: the town day’s wind (the one the world blows that day), the same every time and another each day; the course’s heights go along', () => {
  const a = dayConditions(SEED, 5, null), b = dayConditions(SEED, 5, null);
  assert.deepEqual(a.wind, dailyWind(SEED, 5)); assert.deepEqual(a, b); assert.notDeepEqual(dayConditions(SEED, 6, null).wind, a.wind); assert.equal(a.height, null);
  const h = (x: number, y: number) => 0.01 * (x + y); assert.equal(dayConditions(SEED, 5, h).height, h);
});

test('everyday: with no conditions the day is the day of before (golden values captured from the unchanged code); with them it is deterministic, another day, and the golfers meet the wind', () => {
  const r = dayRoster(SEED, 5, CLUB), plain = dayPlan(VIEW, r), again = dayPlan(VIEW, r, undefined);
  assert.equal(plain.shots.length, 4495); assert.equal(fnv(JSON.stringify(plain.shots)), '29c350', 'no conditions: the same shots'); assert.equal(fnv(JSON.stringify(plain.strokes)), '51b61d48'); assert.equal(fnv(JSON.stringify(plain.pace)), '6ef96a31');
  assert.equal(JSON.stringify(again.shots), JSON.stringify(plain.shots));
  const busy = dayRoster(SEED, 9, { ...CLUB, busy: 140 }), bp = dayPlan(VIEW, busy);
  assert.equal(bp.shots.length, 12374); assert.equal(fnv(JSON.stringify(bp.shots)), '5925f3e1'); assert.equal(fnv(JSON.stringify(bp.strokes)), '9c9ace8f'); assert.equal(fnv(JSON.stringify(bp.pace)), 'c8d8f595');
  // with the day's conditions: the same every time, another day than the plain one, the same golfers and holes
  const cond = dayConditions(SEED, 5, null), a = dayPlan(VIEW, r, cond), b = dayPlan(VIEW, r, cond);
  assert.equal(JSON.stringify(a.shots), JSON.stringify(b.shots), 'deterministic'); assert.notEqual(JSON.stringify(a.shots), JSON.stringify(plain.shots));
  assert.equal(a.strokes.length, plain.strokes.length); assert.ok(a.shots.every(s => Number.isFinite(s.to.x) && Number.isFinite(s.to.y)) && a.done.every(d => Number.isFinite(d)), 'every ball and every golfer finishes');
  assert.ok(a.strokes.every(row => row.every(s => s >= 1)) && Math.abs(mean(totals(a)) - mean(totals(plain))) < 0.25 * mean(totals(plain)), `a day’s wind and the lie’s kinds move the scores a little: ${mean(totals(a)).toFixed(1)} against ${mean(totals(plain)).toFixed(1)} a round`);
  // a stiff wind against the golfers costs them strokes: the bearing whose blow has the most -x (the holes run along +x), against the same day with the lie’s kinds only
  const against = [0, 45, 90, 135, 180, 225, 270, 315].map(from => ({ from, x: windToward(from).x })).sort((p, q) => p.x - q.x)[0]!.from;
  const calm = dayPlan(VIEW, r, { wind: null, height: null }), head = dayPlan(VIEW, r, { wind: { mph: 18, from: against, gusty: 0, seed: 1 }, height: null }), tail = dayPlan(VIEW, r, { wind: { mph: 18, from: (against + 180) % 360, gusty: 0, seed: 1 }, height: null });
  assert.ok(mean(totals(head)) > mean(totals(calm)) + 1, `18 mph into the golfers’ faces: ${mean(totals(head)).toFixed(1)} against ${mean(totals(calm)).toFixed(1)} strokes a round`);
  assert.ok(mean(totals(head)) > mean(totals(tail)) + 1.5, `a headwind against a tailwind: ${mean(totals(head)).toFixed(1)} against ${mean(totals(tail)).toFixed(1)}`);
});

test('everyday: the conditions cost the day under about twice as long to work out (it is once a day, not each frame), and the pace and the groups hold as before', () => {
  const r = dayRoster(SEED, 9, { ...CLUB, busy: 140 }), cond = dayConditions(SEED, 9, (x, y) => 0.004 * Math.sin(x / 9) + 0.004 * Math.cos(y / 7));
  const time = (c?: Conditions) => { let best = Infinity; for (let k = 0; k < 3; k++) { const t0 = performance.now(); dayPlan(VIEW, r, c); best = Math.min(best, performance.now() - t0); } return best; };
  const plain = time(), withCond = time(cond);
  assert.ok(withCond < plain * 2.5 + 25, `a busy day: ${plain.toFixed(0)} ms plain, ${withCond.toFixed(0)} ms in its conditions`);
  const p = dayPlan(VIEW, r, cond), pace = dayPace(p);
  assert.ok(pace.groups > 20 && Number.isFinite(pace.waitMin) && pace.roundMin > 100 && pace.roundMin < 700, `a round in the conditions: ${JSON.stringify(pace)}`);
});

test('the day’s weather mark: a day the book starts has it, a day saved from before has none and plays out as it was (the next one has it), and each settled day’s pace is asked for in the weather it was played in', () => {
  const save = (day: number, wx?: boolean): DaySave => ({ day, inp: CLUB, paid: 0, closed: false, today: { members: 0, visitors: 0, fees: 0 }, season: { days: 0, members: 0, visitors: 0, turned: 0, fees: 0, groups: 0, waitMin: 0 }, ...(wx ? { wx: true as const } : {}) });
  // a fresh book (a new game, a save with no day): its day plays in its weather
  const fresh = new DayBook(SEED, null); fresh.step(5, 400, true, () => CLUB, 10, () => null);
  assert.equal(fresh.save!.wx, true);
  // a save that holds a day from before T347 (no mark): the day goes on without it; the day after is the book's own, with it
  const calls: [number, boolean][] = [], pace = (r: { day: number }, wx: boolean) => { calls.push([r.day, wx]); return null; };
  const old = new DayBook(SEED, normalizeDaySave(JSON.parse(JSON.stringify(save(5)))));
  old.step(5, 500, true, () => CLUB, 10, pace); assert.equal(old.save!.wx, undefined, 'the day in progress plays as it did');
  old.step(6, 10, true, () => CLUB, 10, pace); assert.equal(old.save!.wx, true, 'the next day has the weather'); assert.deepEqual(calls, [[5, false]], 'the day that ended without it is asked for without it');
  // a skip over whole days: each is a new day, with the weather
  calls.length = 0; old.step(9, 10, true, () => CLUB, 10, pace);
  assert.deepEqual(calls, [[6, true], [7, true], [8, true]]); assert.equal(old.save!.wx, true);
  // a tournament day closes the day (no play, no pace) and the day after starts with it again
  const closed = new DayBook(SEED, normalizeDaySave(save(5, true))); closed.step(5, 500, false, () => CLUB, 10, pace); closed.step(6, 10, true, () => CLUB, 10, pace);
  assert.equal(closed.save!.wx, true);
  // the mark goes through a save: normalizeDaySave keeps it and only it (true or nothing), and the golf save carries the day whole
  assert.equal(normalizeDaySave(save(5, true))!.wx, true); assert.equal(normalizeDaySave({ ...save(5), wx: 'yes' } as never)!.wx, undefined); assert.equal(normalizeDaySave({ ...save(5), wx: false } as never)!.wx, undefined);
  const g = normalizeGolfSave({ town: { x: 1, y: 1 }, course: [0, 0, 9, 9], clubhouse: { x: 1, y: 1 }, everyday: JSON.parse(JSON.stringify(save(7, true))) } as never)!;
  assert.equal(g.everyday!.wx, true); assert.equal(normalizeGolfSave({ town: { x: 1, y: 1 }, course: [0, 0, 9, 9], clubhouse: { x: 1, y: 1 }, everyday: save(7) } as never)!.everyday!.wx, undefined);
});

// ---- a money match's opponent ----
const mHoles: PlayHole[] = Array.from({ length: 18 }, (_, h) => { const tee = { x: 0, y: 10 + 30 * h }, pin = { x: 150, y: tee.y }; return { n: h + 1, par: (h % 6 === 2 ? 3 : 4) as 3 | 4, tee, pin, line: [tee, pin] }; });
const mView: CourseView = { holes: mHoles, lieAt: (x, y) => { const h = mHoles[Math.max(0, Math.min(17, Math.round((y - 10) / 30)))]!, d = Math.hypot(x - h.pin.x, y - h.pin.y); return d <= 8 ? 'green' : x < -5 ? 'out' : 'fairway'; } };
const SK = { driving: 0.5, irons: 0.5, short: 0.5, putting: 0.5 };

test('match: with no conditions the opponent and a skipped match are as before (golden values captured from the unchanged code); with them the opponent’s full shot takes the conditions of its ball, a putt none', () => {
  const r9 = startMatch(mView, matchHoles(18, 9), 4, opponentOf('Mia Lopez', 16), 100, 2)!, a9 = playMatchYours(mView, r9, SK, { club: 'driver', aim: { x: 120, y: 10 }, power: 1 }, 7).round, o9 = oppShot(mView, a9, 7);
  assert.equal(fnv(JSON.stringify(o9.shot)), '5a0f3106'); assert.equal(fnv(JSON.stringify(o9.round.match)), 'ba6a01fd'); assert.deepEqual(oppShot(mView, a9, 7, undefined).shot, o9.shot);
  const rs = startMatch(mView, matchHoles(18, 18), 4, opponentOf('Mia Lopez', 18), 150, 1)!, end = skipMatch(mView, rs, SK, 11);
  assert.equal(fnv(JSON.stringify(end.match)), '19cd132b'); assert.equal(fnv(JSON.stringify(end.card)), 'ba19a6f'); assert.deepEqual(skipMatch(mView, rs, SK, 11, undefined), end);
  // the opponent's drive from the tee in a crosswind: the env is asked for their ball, their lie and their aim, the shot takes it (the landing moves downwind), deterministic
  const asked: { ball: Pt; lie: Lie; aim: Pt }[] = [], wind = { mph: 20, from: 0 }, envFor = (ball: Pt, lie: Lie, aim: Pt): ShotEnv => { asked.push({ ball: { ...ball }, lie, aim: { ...aim } }); return envOf(wind, undefined, null, ball, lie, aim); };
  const w = oppShot(mView, a9, 7, envFor), w2 = oppShot(mView, a9, 7, (b, l, aim) => envOf(wind, undefined, null, b, l, aim));
  assert.equal(asked.length, 1); assert.equal(asked[0]!.lie, 'tee'); assert.deepEqual(asked[0]!.ball, mHoles[0]!.tee);
  assert.deepEqual(w.shot, w2.shot, 'the same conditions, the same shot'); assert.notDeepEqual(w.shot.landing!.at, o9.shot.landing!.at);
  assert.ok(Math.abs(w.shot.landing!.at.y - o9.shot.landing!.at.y) > 3 || Math.abs(w.shot.landing!.at.x - o9.shot.landing!.at.x) > 3, `a 20 mph wind moves the ball: ${JSON.stringify(w.shot.landing!.at)} against ${JSON.stringify(o9.shot.landing!.at)}`);
  // a putt takes none: put the opponent on the green and the env is never asked for
  const onGreen = { ...a9, match: { ...a9.match!, ball: { x: mHoles[0]!.pin.x - 3, y: mHoles[0]!.pin.y }, lie: 'green' as Lie, strokes: 2 } };
  let calls = 0; const p = oppShot(mView, onGreen, 7, (b, l, aim) => { calls++; return envOf(wind, undefined, null, b, l, aim); });
  assert.equal(p.shot.club, 'putter'); assert.equal(calls, 0, 'a putt never leaves the ground');
});

test('skipMatch: both sides play the rest of the match in the conditions (every full shot of yours and theirs is asked for), deterministic, and the same match without them is another result', () => {
  const rs = startMatch(mView, matchHoles(18, 18), 4, opponentOf('Mia Lopez', 18), 150, 1)!;
  const wind = { mph: 14, from: 90 }, run = (n: { c: number }) => skipMatch(mView, rs, SK, 11, (b, l, aim) => { n.c++; return envOf(wind, undefined, null, b, l, aim); });
  const n1 = { c: 0 }, n2 = { c: 0 }, a = run(n1), b = run(n2), plain = skipMatch(mView, rs, SK, 11);
  assert.deepEqual(a, b, 'deterministic'); assert.equal(a.over, true); assert.ok(n1.c > 60, `the conditions were asked for ${n1.c} full shots`);
  assert.notDeepEqual(a.match!.ocard, plain.match!.ocard, 'their card is another in a wind'); assert.notDeepEqual(a.card.map(c => c.strokes), plain.card.map(c => c.strokes), 'so is yours: the caddie’s shots meet it too');
});
