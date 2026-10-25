// The golf round (docs/GOLF-PLAY.md P1, src/game/golf/play/): the field and tee times, the shot model, the round and its playback, on a synthetic
// 18-hole course (three par 3s, eleven par 4s, four par 5s, a pond beside two holes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIRST_TEE, LAST_TEE } from '../src/game/golf/calendar';
import { TILE_M } from '../src/game/golf/types';
import { GOLFER_NAMES, carryM, chooseShot, gauss, hitShot, makeField, playRound, putt, rng, standings, stateAt, teeTimes } from '../src/game/golf/play';
import type { CourseView, Golfer, Lie, PlayHole, Pt, RoundPlan } from '../src/game/golf/play';

/** the pars of the 18 holes, in play order: three 3s, eleven 4s, four 5s */
const PARS: (3 | 4 | 5)[] = [3, 4, 4, 5, 3, 4, 4, 4, 5, 4, 3, 4, 4, 4, 5, 4, 4, 5];
/** the holes (0-based) with a pond beside the line */
const POND = [5, 12];

/** the distance (tiles) from p to the segment a-b */
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

/** the synthetic course: each hole on its own row 120 m apart, the tee at x = 10 tiles, the pin straight along the row; a green circle of 12 m
 *  round each pin, a fairway strip 30 m wide along each line, a 15 m pond 25 m beside the line 200 m out (two holes), rough within 80 m of a
 *  line, and out of bounds beyond */
function course(): CourseView {
  const holes: PlayHole[] = PARS.map((par, h) => {
    const y = 20 + 60 * h, tee = { x: 10, y }, pin = { x: 10 + (par === 3 ? 160 : par === 4 ? 380 : 500) / TILE_M, y };
    return { n: h + 1, par, tee, pin, line: [tee, pin] };
  });
  const ponds = POND.map(h => ({ x: holes[h].tee.x + 100, y: holes[h].tee.y + 12.5 }));
  const lieAt = (x: number, y: number): Lie => {
    for (const h of holes) if (Math.hypot(x - h.pin.x, y - h.pin.y) <= 6) return 'green';
    for (const q of ponds) if (Math.hypot(x - q.x, y - q.y) <= 7.5) return 'water';
    let d = Infinity;
    for (const h of holes) d = Math.min(d, segDist({ x, y }, h.tee, h.pin));
    return d <= 7.5 ? 'fairway' : d <= 40 ? 'rough' : 'out';
  };
  return { holes, lieAt };
}

/** the course's total par */
const PAR = PARS.reduce((a, b) => a + b, 0);

/** the average to par of the pros and of the amateurs over fresh fields and rounds (one per seed) at a tier */
function toPars(tier: number, seeds: number[], view: CourseView): { pro: number; am: number } {
  const acc = { pro: [0, 0], am: [0, 0] };
  for (const seed of seeds) {
    const f = makeField(tier, seed), plan = playRound(view, f, teeTimes(f, seed), seed);
    for (const g of f) { const k = g.pro ? acc.pro : acc.am; k[0] += plan.strokes[g.id].reduce((a, b) => a + b, 0) - PAR; k[1]++; }
  }
  return { pro: acc.pro[0] / acc.pro[1], am: acc.am[0] / acc.am[1] };
}

test('field: 24 to 72 golfers by tier, unique names, the pro share by tier, the same for the same seed', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(t => makeField(t, 11).length), [24, 36, 48, 60, 72]);
  for (const t of [1, 2, 3, 4, 5]) { const f = makeField(t, 7); assert.equal(new Set(f.map(g => g.name)).size, f.length, `unique names at tier ${t}`); }
  assert.equal(makeField(1, 7).filter(g => g.pro).length, Math.round(0.2 * 24), 'tier 1 pro share');
  assert.equal(makeField(5, 7).filter(g => g.pro).length, 72, 'tier 5 is all pros');
  const f = makeField(3, 99);
  assert.deepEqual(makeField(3, 99), f, 'same seed, same field');
  assert.notDeepEqual(makeField(3, 100), f, 'another seed, another field');
  assert.ok(f.every((g, i) => g.id === i && g.sex === f[0].sex), 'ids 0..n-1, one sex for the whole field');
  assert.ok(f.every(g => GOLFER_NAMES[g.sex].includes(g.name.split(' ')[0]) && GOLFER_NAMES.last.includes(g.name.split(' ')[1])), 'names from the lists');
  assert.ok(f.every(g => Number.isInteger(g.look) && g.look >= 0 && g.look <= 4), 'looks 0..4');
  assert.ok(f.every(g => g.pro ? g.skill >= 0.6 && g.skill <= 1 : g.skill >= 0.2 && g.skill <= 0.55), 'skill by pro or amateur');
  const men = Array.from({ length: 200 }, (_, s) => makeField(1, s + 1)[0].sex === 'm' ? 1 : 0).reduce((a: number, b) => a + b, 0) / 200;
  assert.ok(men > 0.5 && men < 0.7, `about 60% men, got ${men}`);
  assert.equal(GOLFER_NAMES.m.length, 40); assert.equal(GOLFER_NAMES.w.length, 40); assert.equal(GOLFER_NAMES.last.length, 80);
});

test('tee times: threesomes, the best last, the owner first, at least 8 minutes apart, from FIRST_TEE', () => {
  for (const t of [1, 3, 5]) {
    const f = makeField(t, 21), gs = teeTimes(f, 21), sk = (ids: number[]) => ids.map(id => f[id].skill);
    assert.ok(gs.every(g => g.players.length >= 2 && g.players.length <= 4), 'group sizes 2..4');
    assert.equal(gs.reduce((a, g) => a + g.players.length, 0), f.length, 'everyone plays once');
    assert.equal(gs[0].tee, FIRST_TEE);
    assert.ok(gs[gs.length - 1].tee <= LAST_TEE, 'the last tee within the day');
    for (let i = 1; i < gs.length; i++) {
      assert.ok(gs[i].tee - gs[i - 1].tee >= 8, `8 minutes apart at ${i}`);
      assert.ok(Math.max(...sk(gs[i - 1].players)) <= Math.min(...sk(gs[i].players)), 'the best last');
    }
  }
  // a remainder: the last group is 4 or 2
  const mk = (n: number): Golfer[] => Array.from({ length: n }, (_, id) => ({ id, name: `G ${id}`, sex: 'm' as const, pro: false, skill: id / n, look: 0 }));
  for (const n of [4, 25, 26]) { const gs = teeTimes(mk(n), 3); assert.ok(gs.every(g => g.players.length >= 2 && g.players.length <= 4), `sizes at ${n}`); assert.equal(gs.reduce((a, g) => a + g.players.length, 0), n); }
  // the owner goes in the first group, even as the best player
  const o = makeField(2, 8), best = o.reduce((a, g) => (g.skill > a.skill ? g : a));
  best.owner = true;
  assert.ok(teeTimes(o, 8)[0].players.includes(best.id), 'the owner in the first group');
});

test('putt: the make chance falls with distance, a pro makes more than an amateur from 3 m, a miss leaves the ball short of the hole', () => {
  const rate = (skill: number, d: number) => { let n = 0; for (let s = 1; s <= 4000; s++) if (putt(rng(s, 1, 1), skill, d).holed) n++; return n / 4000; };
  const [a, b, c, e] = [1, 3, 6, 10].map(d => rate(0.5, d));
  assert.ok(a > b && b > c && c > e, `ordered by distance: ${[a, b, c, e]}`);
  assert.ok(rate(0.9, 3) > rate(0.3, 3) + 0.05, 'a pro makes more from 3 m');
  for (let s = 1; s <= 200; s++) { const k = putt(rng(s, 2, 2), 0.5, 4); if (k.holed) assert.equal(k.leaveM, 0); else assert.ok(k.leaveM >= 0.3); }
});

test('shots: a dry shot keeps its ball; a shot into water is a penalty and drops on the last dry point; out of bounds goes back to the stroke', () => {
  // the water (or out of bounds) starts 30 tiles out: even a mishit (at least 44 tiles) lands in it
  const wv: CourseView = { holes: [], lieAt: (x: number) => (x > 30 ? 'water' : 'fairway') };
  for (let s = 1; s <= 20; s++) {
    const k = hitShot(rng(s, 1, 0), 1, 'tee', { x: 0, y: 0 }, { x: 150, y: 0 }, 'driver', wv);
    assert.equal(k.penalty, 1, 'water is a penalty');
    assert.ok(wv.lieAt(k.to.x, k.to.y) !== 'water' && k.to.x <= 30 + 1e-9 && k.to.x > 29, `dry drop at ${k.to.x}`);
    assert.equal(k.lie, 'fairway');
  }
  const ov: CourseView = { holes: [], lieAt: (x: number) => (x > 30 ? 'out' : 'fairway') };
  const o = hitShot(rng(3, 1, 0), 1, 'fairway', { x: 0, y: 0 }, { x: 150, y: 0 }, 'driver', ov);
  assert.deepEqual([o.penalty, o.to, o.lie], [1, { x: 0, y: 0 }, 'fairway'], 'stroke and distance');
  const fv: CourseView = { holes: [], lieAt: () => 'fairway' };
  assert.equal(hitShot(rng(4, 1, 0), 1, 'fairway', { x: 0, y: 0 }, { x: 30, y: 0 }, 'iron8', fv).penalty, 0);
});

test('clubs: a driver off a par 4 tee, the putter on the green, a wedge within reach of the pin; carry by skill; rng and gauss', () => {
  const v = course(), h = v.holes[1];
  assert.equal(chooseShot('tee', h.tee, h, 0.5, true).club, 'driver');
  assert.equal(chooseShot('green', { x: h.pin.x - 1, y: h.pin.y }, h, 0.5, false).club, 'putter');
  assert.equal(chooseShot('fairway', { x: h.pin.x - 15 / TILE_M, y: h.pin.y }, h, 0.5, false).club, 'sw');
  assert.equal(carryM('driver', 1), 250); assert.equal(carryM('driver', 0), 162.5);
  const xs = Array.from({ length: 5000 }, rng(5, 1, 2));
  assert.ok(xs.every(x => x >= 0 && x < 1));
  assert.deepEqual(Array.from({ length: 5 }, rng(5, 1, 2)), xs.slice(0, 5), 'the same stream for the same ids');
  assert.notDeepEqual(Array.from({ length: 5 }, rng(5, 2, 1)), xs.slice(0, 5), 'the streams of two ids differ');
  const r = rng(9, 9, 9); const gs = Array.from({ length: 20000 }, () => gauss(r));
  assert.ok(Math.abs(gs.reduce((a, b) => a + b, 0) / gs.length) < 0.03, 'gauss centred on 0');
});

test('round: deterministic for a seed, every golfer finishes 18 holes, shots sorted by t, groups do not overlap on a tee', () => {
  const view = course(), f = makeField(3, 4), gs = teeTimes(f, 4);
  const a = playRound(view, f, gs, 4), b = playRound(view, f, gs, 4);
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'same seed, same round');
  for (const g of f) { assert.equal(a.strokes[g.id].length, 18); assert.ok(a.strokes[g.id].every(k => k >= 1), 'a stroke on every hole'); assert.ok(a.done[g.id] > 0, 'finished'); }
  for (let i = 1; i < a.shots.length; i++) assert.ok(a.shots[i].t >= a.shots[i - 1].t, 'shots sorted by t');
  const firstOn = (gi: number, h: number) => Math.min(...a.shots.filter(s => s.hole === h && s.stroke === 1 && gs[gi].players.includes(s.golfer)).map(s => s.t));
  for (let h = 0; h < 18; h++) for (let gi = 1; gi < gs.length; gi++) assert.ok(firstOn(gi, h) >= firstOn(gi - 1, h) + 3 - 1e-9, `group ${gi} on hole ${h}`);
});

test('round: the synthetic course over 10 seeds: tier-5 pros between par-2 and par+3, tier-1 amateurs (no pros) between par+10 and par+24', () => {
  const v = course(), seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], t = toPars(5, seeds, v), a = toPars(1, seeds, v);
  assert.ok(t.pro >= -2 && t.pro <= 3, `pros ${t.pro.toFixed(2)} to par`);
  assert.ok(a.am >= 10 && a.am <= 24, `amateurs ${a.am.toFixed(2)} to par`);
});

test('round: no holes, nothing to play: no shots, done at the tee times', () => {
  const v: CourseView = { holes: [], lieAt: () => 'fairway' }, f = makeField(1, 2), gs = teeTimes(f, 2), p = playRound(v, f, gs, 2);
  assert.equal(p.shots.length, 0);
  for (const g of gs) for (const id of g.players) assert.equal(p.done[id], g.tee);
});

test('stateAt: waiting before the tee time, playing mid-round, done at the last green with the final score', () => {
  const view = course(), f = makeField(2, 9), gs = teeTimes(f, 9), p: RoundPlan = playRound(view, f, gs, 9);
  assert.ok(stateAt(p, view, gs[0].tee - 10).every(s => s.action === 'waiting' && s.ball === null && s.x === view.holes[0].tee.x));
  const mid = stateAt(p, view, gs[0].tee + 150);
  const actions = new Set(['walk', 'address', 'swing', 'putt', 'holed', 'waiting']);
  for (const s of mid) {
    assert.ok(actions.has(s.action) && s.hole >= 0 && s.hole < 18 && Number.isFinite(s.x) && Number.isFinite(s.y), `sane state ${s.action}`);
    if (s.flight) assert.ok(s.flight.u >= 0 && s.flight.u < 1, 'a ball in flight');
    if (s.action === 'swing') assert.ok(s.flight, 'the swing has the flight');
    if (s.action === 'address' || s.action === 'swing' || s.action === 'putt') assert.ok(segDist({ x: s.x, y: s.y }, view.holes[s.hole].tee, view.holes[s.hole].pin) < 40, 'on the course near the hole');
  }
  const fin = stateAt(p, view, 2000);
  assert.ok(fin.every(s => s.action === 'done' && s.thru === 18 && s.strokes === p.strokes[s.golfer].reduce((a, b) => a + b, 0)), 'done with the final strokes');
  assert.ok(fin.every(s => s.toPar === p.strokes[s.golfer].reduce((a, b) => a + b, 0) - PAR), 'to par against the course');
  // the strokes and holes thru count only the shots struck by the minute: they never fall
  let prevK = -1, prevT = -1;
  for (let m = 440; m <= 1300; m += 2) { const s = stateAt(p, view, m)[0]; assert.ok(s.strokes >= prevK && s.thru >= prevT, `monotone at ${m}`); prevK = s.strokes; prevT = s.thru; }
  assert.notEqual(stateAt(p, view, p.done[0] - 0.01)[0].action, 'done');
  assert.equal(stateAt(p, view, p.done[0])[0].action, 'done');
});

test('stateAt: with out, refills the given objects in place and matches a fresh call', () => {
  const view = course(), f = makeField(2, 9), gs = teeTimes(f, 9), p = playRound(view, f, gs, 9);
  const out = stateAt(p, view, 600), objs = out.slice();
  const again = stateAt(p, view, 900, out);
  assert.equal(again, out, 'the same array');
  assert.ok(again.every((s, i) => s === objs[i]), 'the same objects');
  assert.deepEqual(again, stateAt(p, view, 900), 'the same states as a fresh call');
});

test('standings: started golfers only, sorted by to par, ties share a position', () => {
  const view = course(), f = makeField(2, 9), gs = teeTimes(f, 9), p = playRound(view, f, gs, 9);
  assert.deepEqual(standings(p, view, gs[0].tee - 1), []);
  const m = gs[1].tee + 100, rows = standings(p, view, m);
  assert.equal(rows.length, gs.filter(g => g.tee <= m).reduce((a, g) => a + g.players.length, 0), 'only the started');
  assert.equal(rows[0].pos, 1);
  const st = stateAt(p, view, m);
  for (let i = 0; i < rows.length; i++) {
    assert.equal(rows[i].toPar, st[rows[i].golfer].toPar, 'the standings agree with the states');
    if (i === 0) continue;
    assert.ok(rows[i - 1].toPar <= rows[i].toPar, 'sorted by to par');
    if (rows[i - 1].toPar === rows[i].toPar) assert.equal(rows[i].pos, rows[i - 1].pos, 'ties share');
    else assert.ok(rows[i].pos > rows[i - 1].pos, 'the next position after a tie');
  }
});
