// T211 pace of play (src/game/golf/play/round.ts Field): groups wait for the group ahead, the owner's live group included. On the synthetic 18-hole
// course of golf-play.test.ts: no two groups are ever on one green; a group waiting on a tee starts the moment the group ahead clears its landing area;
// the finish times move later by the waits and no more; the marshal waves a held-up group through a slow one; the owner's group waits and is waited for;
// the same seed (and the owner's same inputs) gives the same round, waits included; the board's wait line and the wave toast.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import { DayFinish, FLIGHT_TIME, GREEN_CLEAR, LANDING_M, LiveGroup, PICK_UP, PUTT_FLIGHT, lastGroupOnLast, makeField, ordinal, playRound, stateAt, teeTimes, waitOf, waitText, waveLine } from '../src/game/golf/play';
import type { CourseView, Golfer, Group, Lie, OwnerTurn, PlayHole, Pt, RoundPlan, Shot } from '../src/game/golf/play';

/** the pars of the 18 holes, in play order: three 3s, eleven 4s, four 5s */
const PARS: (3 | 4 | 5)[] = [3, 4, 4, 5, 3, 4, 4, 4, 5, 4, 3, 4, 4, 4, 5, 4, 4, 5];
/** the holes (0-based) with a pond beside the line */
const POND = [5, 12];

/** the distance (tiles) from p to the segment a-b */
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

/** the synthetic course (as golf-play.test.ts): each hole on its own row 120 m apart, greens of 12 m round each pin, a fairway strip, two ponds, rough,
 *  and out of bounds beyond */
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

/** a golfer of a skill (a pro over 0.5) */
const mk = (id: number, skill: number): Golfer => ({ id, name: `Golfer ${String.fromCharCode(65 + id)}`, sex: 'm', pro: skill > 0.5, skill, look: 0 });
/** three threesomes of the given skills, teeing off `gap` minutes apart from 07:30: a slow group between two fast ones holds the third up */
function slowMiddle(skills: [number, number, number], gap: number): { f: Golfer[]; gs: Group[] } {
  const f = Array.from({ length: 9 }, (_, i) => mk(i, skills[Math.floor(i / 3)]!));
  return { f, gs: [0, 1, 2].map(k => ({ tee: 450 + k * gap, players: [3 * k, 3 * k + 1, 3 * k + 2] })) };
}
/** two threesomes 8 minutes apart: weak club golfers, then pros, who wait on them all day */
function slowFirst(): { f: Golfer[]; gs: Group[] } {
  const f = Array.from({ length: 6 }, (_, i) => mk(i, i < 3 ? 0.05 : 1));
  return { f, gs: [{ tee: 450, players: [0, 1, 2] }, { tee: 458, players: [3, 4, 5] }] };
}

const dur = (s: Shot) => s.club === 'putter' ? PUTT_FLIGHT : FLIGHT_TIME;
/** a group's shots on a hole, in time order */
const shotsOf = (p: RoundPlan, gs: Group[], g: number, h: number) => p.shots.filter(s => s.hole === h && gs[g]!.players.includes(s.golfer)).sort((a, b) => a.t - b.t);
/** a group's first strike on a hole */
const firstOn = (p: RoundPlan, gs: Group[], g: number, h: number) => shotsOf(p, gs, g, h)[0]!.t;

/** each group's time on each green, from its shots: from its first ball to come to rest on the green (or in the cup) to its last ball's end */
function greenSpans(p: RoundPlan, gs: Group[], h: number): { g: number; a: number; b: number }[] {
  const out: { g: number; a: number; b: number }[] = [];
  gs.forEach((_, g) => {
    const ss = shotsOf(p, gs, g, h); if (!ss.length) return;
    const on = ss.filter(s => s.lie === 'green' || s.holed);
    if (on.length) out.push({ g, a: Math.min(...on.map(s => s.t + dur(s))), b: Math.max(...ss.map(s => s.t + dur(s))) });
  });
  return out;
}
/** asserts that no two groups are ever on one green at once */
function noGreenOverlap(p: RoundPlan, gs: Group[], label: string): void {
  for (let h = 0; h < PARS.length; h++) {
    const sp = greenSpans(p, gs, h);
    for (let i = 0; i < sp.length; i++) for (let j = i + 1; j < sp.length; j++) {
      const x = sp[i]!, y = sp[j]!;
      assert.ok(x.b <= y.a || y.b <= x.a, `${label}: groups ${x.g} and ${y.g} on the green of hole ${h} at once ([${x.a.toFixed(2)}, ${x.b.toFixed(2)}] and [${y.a.toFixed(2)}, ${y.b.toFixed(2)}])`);
    }
  }
}

/** the minute a group's balls are out of the landing area of hole h, from its shots (every ball holed or past LANDING_M from the tee; all holed: plus
 *  GREEN_CLEAR) */
function clearOf(p: RoundPlan, gs: Group[], g: number, h: number, view: CourseView): number {
  const tee = view.holes[h]!.tee, ball = new Map<number, Pt>(), done = new Set<number>(), ids = gs[g]!.players, k = new Map<number, number>();
  for (const id of ids) { ball.set(id, tee); k.set(id, 0); }
  for (const s of shotsOf(p, gs, g, h)) {
    ball.set(s.golfer, s.to); k.set(s.golfer, k.get(s.golfer)! + 1 + s.penalty);
    if (s.holed || k.get(s.golfer)! >= PICK_UP) done.add(s.golfer);
    const all = ids.every(id => done.has(id)), clear = ids.every(id => done.has(id) || Math.hypot(ball.get(id)!.x - tee.x, ball.get(id)!.y - tee.y) * TILE_M > LANDING_M);
    if (clear) return s.t + dur(s) + (all ? GREEN_CLEAR : 0);
  }
  return Infinity;
}

test('pace: no two groups are ever on one green, over fields of tiers 1, 3 and 5 and the slow-group days', () => {
  const view = course();
  for (const tier of [1, 3, 5]) for (const seed of [1, 2, 3]) {
    const f = makeField(tier, seed), gs = teeTimes(f, seed);
    noGreenOverlap(playRound(view, f, gs, seed), gs, `tier ${tier} seed ${seed}`);
  }
  for (const seed of [1, 2, 3, 4]) {
    const a = slowFirst(); noGreenOverlap(playRound(view, a.f, a.gs, seed), a.gs, `slow first, seed ${seed}`);
    const b = slowMiddle([1, 0.05, 1], 8); noGreenOverlap(playRound(view, b.f, b.gs, seed), b.gs, `slow middle, seed ${seed}`);
  }
});

test('pace: a group waiting on a tee tees off the moment the group ahead clears its landing area, and never before; it waits for the green too', () => {
  const view = course(), { f, gs } = slowFirst(), seed = 5, p = playRound(view, f, gs, seed), waits = p.pace!.waits;
  const tee = waits.filter(w => w.at === 'tee'), green = waits.filter(w => w.at === 'green');
  assert.ok(tee.length >= 5, `the pros wait on several tees (${tee.length})`);
  assert.ok(green.length >= 1, `and for a green (${green.length})`);
  let long = 0;
  for (let h = 0; h < 18; h++) {
    const clear = clearOf(p, gs, 0, h, view), first = firstOn(p, gs, 1, h);
    assert.ok(first >= clear - 1e-9, `hole ${h}: the pros tee off at ${first.toFixed(2)}, the group ahead clears at ${clear.toFixed(2)}`);
    const w = tee.find(x => x.hole === h);
    if (w) {
      assert.equal(w.group, 1, 'the waiting group is the second');
      assert.ok(Math.abs(w.to - clear) < 1e-9, `hole ${h}: the wait ends as the group ahead clears (${w.to.toFixed(3)} vs ${clear.toFixed(3)})`);
      assert.ok(Math.abs(first - w.to) < 1e-9, `hole ${h}: and the first tee shot is struck then`);
      assert.ok(w.from < w.to, 'a wait has a length');
      // the playback: through a wait of more than a minute, the group stands on the tee, waiting (a short one can be over while it walks there)
      const mid = (w.from + w.to) / 2, st = w.to - w.from > 1 ? stateAt(p, view, mid).filter(s => gs[1]!.players.includes(s.golfer)) : [];
      if (st.length) long++;
      for (const s of st) {
        assert.equal(s.action, 'waiting', `hole ${h}: golfer ${s.golfer} waits on the tee at ${mid.toFixed(2)}`);
        assert.ok(Math.hypot(s.x - view.holes[h]!.tee.x, s.y - view.holes[h]!.tee.y) <= 3, 'on the tee (after the first, just behind it)');
      }
      // after the first tee they stand apart, each at his place, not on one point
      if (h > 0) for (let i = 0; i < st.length; i++) for (let k = i + 1; k < st.length; k++) assert.ok(Math.hypot(st[i]!.x - st[k]!.x, st[i]!.y - st[k]!.y) >= 1, `hole ${h}: golfers ${st[i]!.golfer} and ${st[k]!.golfer} apart`);
    }
  }
  assert.ok(long >= 2, `the playback checked on ${long} long tee waits`);
  // a wait for the green ends when the group ahead is off it: its last ball in, and GREEN_CLEAR
  for (const w of green) {
    const ss = shotsOf(p, gs, 0, w.hole), out = Math.max(...ss.map(s => s.t + dur(s))) + GREEN_CLEAR;
    assert.ok(Math.abs(w.to - out) < 1e-9, `hole ${w.hole}: the green wait ends as the group ahead is off it (${w.to.toFixed(3)} vs ${out.toFixed(3)})`);
  }
});

test('pace: the finish times move later by the waits: the same shots as the group alone, done no earlier, and no later than alone plus its waits', () => {
  const view = course();
  for (const [label, sc] of [['slow first', slowFirst()], ['slow middle', slowMiddle([1, 0.05, 1], 8)]] as const) for (const seed of [1, 2, 3]) {
    const p = playRound(view, sc.f, sc.gs, seed);
    sc.gs.forEach((gr, g) => {
      const alone = playRound(view, sc.f, [gr], seed), fin = (q: RoundPlan) => Math.max(...gr.players.map(id => q.done[id]!));
      const mine = (q: RoundPlan) => q.shots.filter(s => gr.players.includes(s.golfer)).map(s => [s.golfer, s.hole, s.stroke, s.from, s.to, s.club, s.lie]);
      assert.deepEqual(mine(p), mine(alone), `${label} seed ${seed} group ${g}: the waits only move the minutes`);
      const waited = p.pace!.waits.filter(w => w.group === g).reduce((a, w) => a + w.to - w.from, 0), late = fin(p) - fin(alone);
      assert.ok(late >= -1e-9, `${label} seed ${seed} group ${g}: not done sooner than alone (${late.toFixed(2)})`);
      assert.ok(late <= waited + 1e-6, `${label} seed ${seed} group ${g}: ${late.toFixed(2)} min later than alone, the waits ${waited.toFixed(2)}`);
      if (g === 0 && label === 'slow first') assert.equal(waited, 0, 'the first group waits on nobody');
      if (g === 1 && label === 'slow first') assert.ok(late > 20 && late >= 0.3 * waited, `the pros finish ${late.toFixed(0)} min later, of ${waited.toFixed(0)} min waited`);
    });
  }
});

test('pace: once a slow group holds two holes open, the marshal waves the held-up group through; it then plays ahead, and the slow group waits on it', () => {
  const view = course(), { f, gs } = slowMiddle([1, 0.05, 1], 8);
  for (const seed of [1, 2, 3]) {
    const p = playRound(view, f, gs, seed), waves = p.pace!.waves;
    assert.equal(waves.length, 1, `seed ${seed}: one wave-through (${JSON.stringify(waves)})`);
    const w = waves[0]!, h = w.hole;
    assert.equal(w.slow, 1, 'the slow group stands aside'); assert.equal(w.through, 2, 'the group behind it goes through');
    // when it was called: the slow group at the tee of h, the group ahead two holes on (teed off h + 2), the group behind on the hole before, held up
    assert.ok(firstOn(p, gs, 0, h + 2) <= w.t, 'the group ahead had teed off two holes on');
    assert.ok(firstOn(p, gs, 2, h - 1) <= w.t && firstOn(p, gs, 2, h) > w.t, 'the group behind was on the hole before');
    assert.ok(p.pace!.waits.some(x => x.group === 2 && x.hole === h - 1), 'the group behind was held up there');
    // before it the slow group played first; from it the group waved through does, and the slow group's tee shot waits on it
    for (let k = 0; k < h; k++) assert.ok(firstOn(p, gs, 1, k) < firstOn(p, gs, 2, k), `hole ${k}: the slow group first`);
    for (let k = h; k < 18; k++) assert.ok(firstOn(p, gs, 2, k) < firstOn(p, gs, 1, k), `hole ${k}: the group waved through first`);
    const aside = p.pace!.waits.find(x => x.group === 1 && x.hole === h && x.at === 'tee');
    assert.ok(aside && Math.abs(aside.from - w.t) < 1e-9, 'the slow group waits on the tee from the wave');
    assert.ok(Math.abs(aside!.to - clearOf(p, gs, 2, h, view)) < 1e-9, 'until the group waved through clears the landing area');
    noGreenOverlap(p, gs, `wave seed ${seed}`);
    // the slow group finishes last, the group waved through before it
    const fin = (g: number) => Math.max(...gs[g]!.players.map(id => p.done[id]!));
    assert.ok(fin(2) < fin(1), 'the group waved through finishes before the slow group');
  }
  // no wave-through without a slow group: the tier days run in tee order
  for (const tier of [1, 3, 5]) { const ff = makeField(tier, 2), gg = teeTimes(ff, 2); assert.equal(playRound(view, ff, gg, 2).pace!.waves.length, 0, `tier ${tier}`); }
});

/** the owner as the weak first group's first golfer, the pros 8 minutes behind: the pros wait on him */
function ownerFirst(): { f: Golfer[]; gs: Group[] } { const s = slowFirst(); s.f[0] = { ...s.f[0]!, owner: true, skill: 0.4, name: 'You' }; return s; }
const suggest = (t: OwnerTurn) => ({ holeIdx: t.holeIdx, stroke: t.stroke, club: t.suggested.club, aim: t.suggested.aim, power: t.suggested.power });

test('pace: the owner’s live group is waited for: the group behind does not tee off before he plays, waits on him as he goes, and plays on when he is done', () => {
  const view = course(), { f, gs } = ownerFirst(), seed = 11, p = playRound(view, f, gs, seed, { live: 0 }), lg = new LiveGroup(p, view, 0, seed);
  let t = lg.advance(), turns = 0;
  assert.ok(t && t.holeIdx === 0 && t.stroke === 1, 'his first turn: the first tee shot');
  assert.equal(p.shots.length, 0, 'nobody has struck before him');
  // play a few holes; at each turn, the group behind has struck only what the group ahead let it
  while (t && t.holeIdx < 6) {
    const behind = p.shots.filter(s => gs[1]!.players.includes(s.golfer));
    assert.ok(behind.every(s => s.t <= t!.t + 1e-9), 'the group behind never plays past the owner’s pending strike');
    lg.play(suggest(t)); t = lg.advance(); turns++;
  }
  assert.ok(turns > 10, `he played ${turns} shots`);
  assert.ok(gs[1]!.players.every(id => p.done[id] === Infinity), 'the group behind is not done while he plays');
  // mid-round, waiting on the owner: the board says where the group behind waits, if it waits at this minute
  const open = p.pace!.open.filter(w => w.group === 1);
  for (const w of open) if (w.from <= t!.t) assert.ok(waitText(p, view, gs[1]!.players[0]!, w.from)?.startsWith('waiting '), 'the open wait is on the board');
  // the rest by the caddie: every group done, the rules held all the way
  lg.caddie(); assert.equal(lg.advance(), null, 'the day is done');
  for (const id of [...gs[0]!.players, ...gs[1]!.players]) assert.ok(Number.isFinite(p.done[id]!), `golfer ${id} done`);
  noGreenOverlap(p, gs, 'the owner’s day');
  for (let h = 0; h < 18; h++) assert.ok(firstOn(p, gs, 1, h) >= clearOf(p, gs, 0, h, view) - 1e-9, `hole ${h}: the pros tee off after the owner’s group clears`);
  assert.ok(p.pace!.waits.some(w => w.group === 1), 'the pros waited on the owner’s group');
  assert.deepEqual(p.pace!.open, [], 'no wait open at the end');
});

test('pace: the owner’s group waits for the group ahead of it, like any other', () => {
  // the owner joins the second group, pros, behind the weak first group
  const view = course(), { f, gs } = slowFirst(), seed = 4;
  f[3] = { ...f[3]!, owner: true, skill: 0.4, name: 'You' };
  const p = playRound(view, f, gs, seed, { live: 1 }), lg = new LiveGroup(p, view, 1, seed);
  for (let t = lg.advance(), k = 0; t; t = lg.advance(), k++) { assert.ok(k < 400); lg.play(suggest(t)); }
  for (let h = 0; h < 18; h++) assert.ok(firstOn(p, gs, 1, h) >= clearOf(p, gs, 0, h, view) - 1e-9, `hole ${h}: the owner’s group tees off after the group ahead clears`);
  assert.ok(p.pace!.waits.some(w => w.group === 1), 'the owner’s group waited');
  noGreenOverlap(p, gs, 'the owner behind');
});

test('pace: deterministic: the same seed gives the same round, waits and wave-throughs included; the owner’s inputs replayed give the same waits (a reload)', () => {
  const view = course(), a = slowMiddle([1, 0.05, 1], 8), seed = 2;
  assert.equal(JSON.stringify(playRound(view, a.f, a.gs, seed)), JSON.stringify(playRound(view, a.f, a.gs, seed)));
  const { f, gs } = ownerFirst(), p = playRound(view, f, gs, seed, { live: 0 }), lg = new LiveGroup(p, view, 0, seed);
  for (let t = lg.advance(), k = 0; t && k < 25; t = lg.advance(), k++) lg.play(suggest(t));
  const q = playRound(view, f, gs, seed, { live: 0 }), lq = new LiveGroup(q, view, 0, seed);
  lq.replay(lg.inputs); lq.advance();
  assert.equal(JSON.stringify(q.pace), JSON.stringify(p.pace), 'the waits, open waits and arrivals so far');
  assert.equal(JSON.stringify(q.shots), JSON.stringify(p.shots), 'the shots so far');
  lg.caddie(); lg.advance(); lq.caddie(); lq.advance();
  assert.equal(JSON.stringify(q), JSON.stringify(p), 'the whole day after the caddie');
});

test('board: the wait line ("waiting on the 7th tee", "waiting for the 3rd green"), none when not waiting; the wave toast; ordinals', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd']);
  const view = course(), { f, gs } = slowFirst(), p = playRound(view, f, gs, 5);
  const tw = p.pace!.waits.find(w => w.at === 'tee')!, gw = p.pace!.waits.find(w => w.at === 'green')!, pro = gs[1]!.players[0]!;
  assert.equal(waitText(p, view, pro, (tw.from + tw.to) / 2), `waiting on the ${ordinal(tw.hole + 1)} tee`);
  assert.equal(waitText(p, view, pro, (gw.from + gw.to) / 2), `waiting for the ${ordinal(gw.hole + 1)} green`);
  assert.equal(waitText(p, view, pro, tw.to + 1e-6) === `waiting on the ${ordinal(tw.hole + 1)} tee`, false, 'not after the wait');
  assert.equal(waitOf(p, 0, tw.from + 0.01), null, 'the first group is not waiting');
  const s = slowMiddle([1, 0.05, 1], 8), q = playRound(view, s.f, s.gs, 1), w = q.pace!.waves[0]!;
  assert.equal(waveLine(q, view, w), `Marshal: The G. G group is waved through on the ${ordinal(w.hole + 1)}; the G. D group stands aside`);
  assert.match(waveLine({ ...q, golfers: [...q.golfers.slice(0, 6), { ...q.golfers[6]!, owner: true }, ...q.golfers.slice(7)] }, view, w), /^Marshal: Your group is waved through on the \d+(st|nd|rd|th); the G\. D group stands aside$/);
});

test('pace: no wave-through chain: a group waved through on a hole does not wave the next group on there (a packed tier-1 field with a slow second group)', () => {
  const view = course();
  let total = 0;
  for (const seed of [1, 2, 3, 7]) {
    const f = makeField(1, seed).map(x => ({ ...x })), gs = teeTimes(f, seed).map((gr, i) => ({ tee: 450 + 8 * i, players: gr.players.slice() }));
    for (const k of [0, 2]) for (const id of gs[k]!.players) Object.assign(f[id]!, { skill: 1, pro: true });
    for (const id of gs[1]!.players) Object.assign(f[id]!, { skill: 0.05, pro: false });
    const p = playRound(view, f, gs, seed), waves = p.pace!.waves;
    total += waves.length;
    for (const w of waves) assert.ok(!waves.some(x => x.hole === w.hole && x.slow === w.through), `seed ${seed}: the group waved through on hole ${w.hole} waves nobody there (${JSON.stringify(waves)})`);
    noGreenOverlap(p, gs, `packed seed ${seed}`);
    assert.ok(waves.length <= gs.length, `seed ${seed}: ${waves.length} wave-throughs for ${gs.length} groups`);
  }
  assert.ok(total >= 1, 'the slow group is waved past at least once');
});

test('pace and T210: after a wave-through the "last group on the 18th" is the slow group that stood aside (furthest back), not the group that went through', () => {
  const view = course(), { f, gs } = slowMiddle([1, 0.05, 1], 8);
  for (const seed of [1, 2, 3]) {
    const p = playRound(view, f, gs, seed), fin = (g: number) => Math.max(...gs[g]!.players.map(id => p.done[id]!));
    assert.equal(p.pace!.waves.length, 1, 'one wave-through');
    // the group waved through (latest tee) plays the 18th while the slow group is still behind: not the last group then
    const end = Math.max(...p.done);
    for (let m = gs[0]!.tee; m <= end; m += 0.5) { const lg = lastGroupOnLast(p, view, m); if (lg) assert.equal(lg.group, 1, `seed ${seed} at ${m}: the last group on the 18th is the slow group (got ${lg.group})`); }
    // the day's end latches the moment for the slow group, then the round over
    const d = new DayFinish(); let last: number | null = null, over = false;
    for (let m = gs[0]!.tee; m <= end + 1 && !over; m += 0.5) { const s = d.step(p, view, m); if (s.last && last === null) last = s.last.group; over = s.over; }
    assert.equal(last, 1, `seed ${seed}: the moment names the slow group`); assert.ok(over, 'and the round ends');
    assert.ok(fin(1) > fin(2), 'the slow group is in last');
  }
});
