// T210 (#555): the tournament day's results wait for the last group (src/game/golf/play/finish.ts). The day's result is in at the 15:00 kick-off, but
// the results screen opens only once every golfer has holed out; first comes the "last group on the 18th" moment, once. Checked on the synthetic 18-hole
// course of golf-play-owner.test.ts with the day built as the engine builds it (dayRound): the results never before the last score, the moment once and
// before the results (also when a 20x step jumps the 18th), the owner in the field, a mid-round save and reload ending in the same results, and the gate
// (resultsDue): no field at once, the early leave, the play not built yet. Pure TS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import { DayFinish, OWNER_ADDRESS, champion, championLine, dayRound, lastGroupOnLast, resultsDue, roundOver, stateAt } from '../src/game/golf/play';
import type { CourseView, Lie, OwnerInput, OwnerTurn, PlayHole, Pt, RoundPlan } from '../src/game/golf/play';
import type { DayOwner } from '../src/game/golf/play';

const PARS: (3 | 4 | 5)[] = [3, 4, 4, 5, 3, 4, 4, 4, 5, 4, 3, 4, 4, 4, 5, 4, 4, 5];
const POND = [5, 12];
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}
/** the synthetic course of golf-play-owner.test.ts: 18 holes on rows, greens, fairways, two ponds, rough and out of bounds */
function course(): CourseView {
  const holes: PlayHole[] = PARS.map((par, h) => {
    const y = 20 + 60 * h, tee = { x: 10, y }, pin = { x: 10 + (par === 3 ? 160 : par === 4 ? 380 : 500) / TILE_M, y };
    return { n: h + 1, par, tee, pin, line: [tee, pin] };
  });
  const ponds = POND.map(h => ({ x: holes[h]!.tee.x + 100, y: holes[h]!.tee.y + 12.5 }));
  const lieAt = (x: number, y: number): Lie => {
    for (const h of holes) if (Math.hypot(x - h.pin.x, y - h.pin.y) <= 6) return 'green';
    for (const q of ponds) if (Math.hypot(x - q.x, y - q.y) <= 7.5) return 'water';
    let d = Infinity;
    for (const h of holes) d = Math.min(d, segDist({ x, y }, h.tee, h.pin));
    return d <= 7.5 ? 'fairway' : d <= 40 ? 'rough' : 'out';
  };
  return { holes, lieAt };
}
const VIEW = course();

/** the owner's input at a turn: the suggested shot */
const suggested = (t: OwnerTurn): OwnerInput => ({ holeIdx: t.holeIdx, stroke: t.stroke, club: t.suggested.club, aim: { x: t.suggested.aim.x, y: t.suggested.aim.y }, power: t.suggested.power });
/** the day as the engine runs it: the owner's turns played as they come due (his address, OWNER_ADDRESS before the strike) */
function playDue(r: ReturnType<typeof dayRound>, m: number) {
  const own = r.own; if (!own) return;
  while (own.turn && m >= own.turn.t - OWNER_ADDRESS) { own.live.play(suggested(own.turn)); own.turn = own.live.advance(); }
}
/** the last score of the round: the minute of the last stroke struck */
const lastScore = (plan: RoundPlan) => plan.shots.reduce((a, s) => Math.max(a, s.t), -Infinity);
/** the group with the latest tee time */
const lastTee = (plan: RoundPlan) => plan.groups.reduce((b, g, i) => (g.tee >= plan.groups[b]!.tee ? i : b), 0);

/** steps a tracker through the day every `dt` minutes from `from` (the owner's turns played as due), recording when the moment and the results came */
function run(r: ReturnType<typeof dayRound>, f: DayFinish, from: number, dt: number, to = 1440) {
  const ev: { kind: 'last' | 'over'; m: number; group?: number }[] = [];
  for (let m = from; m <= to; m += dt) {
    playDue(r, m);
    const s = f.step(r.plan, VIEW, m);
    if (s.last) ev.push({ kind: 'last', m, group: s.last.group });
    if (s.over) ev.push({ kind: 'over', m });
    // the gate: in the eval the results wait for the round
    assert.equal(resultsDue('eval', true, f, false), f.over, `at ${m}: the results are due exactly once the round is over`);
  }
  return ev;
}

test('T210: the results only after the last score; the moment once, before them, when the last group walks onto the 18th', () => {
  for (const seed of [11, 4242, 90001]) {
    const r = dayRound(VIEW, 1, seed, null), f = new DayFinish(), ev = run(r, f, 0, 0.5);
    const lasts = ev.filter(e => e.kind === 'last'), overs = ev.filter(e => e.kind === 'over');
    assert.equal(lasts.length, 1, `seed ${seed}: the moment fires once`);
    assert.equal(overs.length, 1, `seed ${seed}: the results come once`);
    const L = lasts[0]!, O = overs[0]!, endScore = lastScore(r.plan), endDone = Math.max(...r.plan.done);
    assert.ok(L.m < O.m, `seed ${seed}: the moment (${L.m}) before the results (${O.m})`);
    assert.ok(O.m >= endScore && O.m >= endDone, `seed ${seed}: the results (${O.m}) after the last score (${endScore}) and the walk off (${endDone})`);
    assert.ok(O.m - endDone <= 0.5, 'and at the first step after it');
    assert.equal(champion(r.plan, VIEW, O.m - 0.5), null, 'no champion a step before');
    assert.ok(championLine(r.plan, VIEW, O.m), 'the champion at the results');
    // the moment: the last tee time's group, every one of them on the round's 18th (hole index 17), not before
    assert.equal(L.group, lastTee(r.plan), 'the last group is the last tee time');
    const st = stateAt(r.plan, VIEW, L.m), g = r.plan.groups[L.group!]!;
    for (const id of g.players) assert.equal(st.find(s => s.golfer === id)!.hole, 17, `golfer ${id} is on the 18th`);
    assert.equal(lastGroupOnLast(r.plan, VIEW, L.m - 0.5), null, 'not a step before');
    assert.ok(L.m > 15 * 60, `the moment comes after the 15:00 kick-off (${L.m}): the results are later than today's`);
  }
});

test('T210: a 20x step that jumps the 18th still brings the moment first, then the results, each once', () => {
  const r = dayRound(VIEW, 1, 11, null), f = new DayFinish();
  assert.deepEqual(f.step(r.plan, VIEW, 14 * 60), { last: null, over: false }, 'mid-afternoon: nothing yet');
  const s = f.step(r.plan, VIEW, 22 * 60);
  assert.ok(s.last && s.over, 'one step past the end: the moment and the results together');
  assert.equal(s.last!.group, lastTee(r.plan), 'the group that finished last');
  assert.ok(f.lastAt <= f.overAt);
  assert.deepEqual(f.step(r.plan, VIEW, 22 * 60 + 1), { last: null, over: false }, 'nothing more after');
  // a 20x frame step (a game minute every 3 frames at 60 fps: 1/3 minute) gives the same end as a fine step
  const a = new DayFinish(), b = new DayFinish(), ea = run(r, a, 0, 1 / 3), eb = run(dayRound(VIEW, 1, 11, null), b, 0, 4);
  assert.equal(ea.length, 2); assert.equal(eb.length, 2, 'the 200 ms step at 20x (4 minutes): the moment and the results, each once');
  assert.ok(eb[1]!.m - ea[1]!.m < 4 + 1e-9, 'the results at most one step later');
});

test('T210: the owner in the field: the results wait for his group too, and his score is in them', () => {
  const r = dayRound(VIEW, 1, 4242, { owner: 'm', inputs: [], caddie: null }), f = new DayFinish(), ev = run(r, f, 0, 0.5);
  assert.deepEqual(ev.map(e => e.kind), ['last', 'over']);
  const own = r.own!;
  assert.equal(own.turn, null, 'his group is done');
  assert.ok(Number.isFinite(r.plan.done[own.id]!) && r.plan.done[own.id]! <= ev[1]!.m, 'he walked off before the results');
  assert.ok(r.plan.strokes[own.id]!.every(k => k > 0), 'his 18 holes are scored');
  // while his live group still plays (his done unknown) the round is never over
  const r2 = dayRound(VIEW, 1, 4242, { owner: 'm', inputs: [], caddie: null });
  assert.equal(roundOver(r2.plan, VIEW, 1440), false, 'his turn not played: not over even at midnight');
  assert.equal(resultsDue('eval', true, { over: roundOver(r2.plan, VIEW, 1440) }, false), false);
});

test('T210: a save made mid-round, reloaded (the day built again from the seed and the owner\'s inputs), still ends in the same results', () => {
  const seed = 90001, owner: DayOwner = { owner: 'w', inputs: [], caddie: null };
  const a = dayRound(VIEW, 1, seed, owner), fa = new DayFinish(), full = run(a, fa, 0, 0.5);
  // the same day to 12:30, saved: the owner's inputs so far (the engine's GolfPlaySave), then built again as a reload does and played on
  const b = dayRound(VIEW, 1, seed, owner), fb = new DayFinish(), before = run(b, fb, 0, 0.5, 12.5 * 60);
  assert.equal(before.length, 0, 'no moment and no results by 12:30');
  const saved: DayOwner = JSON.parse(JSON.stringify({ owner: 'w', inputs: b.own!.live.inputs, caddie: null }));
  const c = dayRound(VIEW, 1, seed, saved), fc = new DayFinish(), after = run(c, fc, 12.5 * 60 + 0.5, 0.5);
  assert.deepEqual(after, full, 'the moment and the results at the same minutes, the same group');
  assert.equal(championLine(c.plan, VIEW), championLine(a.plan, VIEW), 'the same champion');
  assert.deepEqual(c.plan.strokes, a.plan.strokes, 'the same scores');
  // a save after the moment (the last group on the 18th) and before the last putt: the results still come at the last score
  const L = full[0]!.m, O = full[1]!.m, mid = (L + O) / 2;
  const d = dayRound(VIEW, 1, seed, saved), fd = new DayFinish(), late = run(d, fd, mid, 0.5);
  assert.equal(late.filter(e => e.kind === 'over').length, 1);
  assert.ok(Math.abs(late.find(e => e.kind === 'over')!.m - O) <= 0.5, 'the results at the last score');
});

test('T210: the gate: outside the eval never; outside golf, with no field (no play), or asked for early, at once; the play not built yet, it waits', () => {
  const open = new DayFinish(), done = Object.assign(new DayFinish(), { over: true });
  assert.equal(resultsDue('surge', true, done, false), false, 'before kick-off: no results');
  assert.equal(resultsDue('free', false, null, false), false);
  assert.equal(resultsDue('eval', false, null, false), true, 'the stadium: at kick-off, as today');
  assert.equal(resultsDue('eval', true, null, false), true, 'a day with no field (no holes, no play): at once, as today');
  assert.equal(resultsDue('eval', true, undefined, false), false, 'the first frame after a load: the play not built yet');
  assert.equal(resultsDue('eval', true, open, false), false, 'golf goes on: the live board, no results');
  assert.equal(resultsDue('eval', true, open, true), true, 'the early leave (Results now): the screen as at kick-off today');
  assert.equal(resultsDue('eval', true, done, false), true, 'the last group in');
  // no holes: nothing to wait for
  const empty: CourseView = { holes: [], lieAt: () => 'fairway' }, f = new DayFinish();
  assert.equal(roundOver({ golfers: [], groups: [], shots: [], strokes: [], done: [] }, empty, 0), true);
  assert.equal(f.step({ golfers: [], groups: [], shots: [], strokes: [], done: [] }, empty, 0).over, true);
});
