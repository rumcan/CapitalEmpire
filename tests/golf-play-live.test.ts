// The owner's live group (docs/GOLF-PLAY.md decision 7, P4a, src/game/golf/play/live.ts) on the synthetic 18-hole course of golf-play.test.ts: the group
// is left out of playRound until its owner plays, the owner's turns and shots follow his input, a replay reaches the same state, the caddie finishes the
// group by the model (the same shots as the full round), the playback mid-round is sane, the standings and the champion wait for the group, and the
// day's pace (round.ts: the strikes of a group one routine apart; every golfer done by 18:45; the first group 3.5 to 5.5 hours).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import { LiveGroup, champion, makeField, playRound, routineOf, standings, stateAt, teeTimes } from '../src/game/golf/play';
import type { CourseView, Lie, OwnerTurn, PlayHole, Pt } from '../src/game/golf/play';

/** the pars of the 18 holes, in play order: three 3s, eleven 4s, four 5s */
const PARS: (3 | 4 | 5)[] = [3, 4, 4, 5, 3, 4, 4, 4, 5, 4, 3, 4, 4, 4, 5, 4, 4, 5];
/** the holes (0-based) with a pond beside the line */
const POND = [5, 12];

/** the distance (tiles) from p to the segment a-b */
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

/** the synthetic course (as golf-play.test.ts): each hole on its own row 120 m apart, the tee at x = 10 tiles, the pin straight along the row; greens,
 *  a fairway strip along each line, a pond beside two holes, rough within 80 m of a line, and out of bounds beyond */
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

/** a field of tier 3 with the owner in it (an amateur at skill 0.4, the first group by teeTimes), its tee times, the course and the owner's group index */
function world(seed: number) {
  const view = course(), f = makeField(3, seed), owner = f.find(g => !g.pro)!;
  owner.owner = true; owner.skill = 0.4;
  const gs = teeTimes(f, seed), gi = gs.findIndex(g => g.players.includes(owner.id));
  return { view, f, gs, gi, owner };
}

/** the input that plays a turn as the model suggests it */
const suggest = (t: OwnerTurn) => ({ holeIdx: t.holeIdx, stroke: t.stroke, club: t.suggested.club, aim: t.suggested.aim, power: t.suggested.power });

test('live: after playRound with live the day stops at the owner’s first strike: his group has no shots (done at Infinity), and the groups behind wait for him (T211)', () => {
  const { view, f, gs, gi } = world(3), p = playRound(view, f, gs, 3, { live: gi }), inLive = new Set(gs[gi]!.players);
  assert.equal(gi, 0, 'the owner is in the first group');
  assert.ok(p.shots.every(s => !inLive.has(s.golfer)), 'no shots for the live group');
  for (const id of inLive) { assert.deepEqual(p.strokes[id], new Array<number>(18).fill(0)); assert.equal(p.done[id], Infinity); }
  // every other group is behind him: nobody has teed off before he has, and nobody is done
  assert.equal(p.shots.length, 0, 'the groups behind wait for the owner’s group');
  for (const g of f) if (!inLive.has(g.id)) assert.equal(p.done[g.id], Infinity, `golfer ${g.id} not done yet`);
});

test('live: advance gives the owner his first turn on hole 0, from the tee, at the group tee time', () => {
  const { view, f, gs, gi, owner } = world(3);
  assert.equal(gi, 0, 'the owner is in the first group');
  const lg = new LiveGroup(playRound(view, f, gs, 3, { live: gi }), view, gi, 3), turn = lg.advance()!;
  assert.equal(turn.golfer, owner.id); assert.equal(turn.holeIdx, 0); assert.equal(turn.stroke, 1); assert.equal(turn.hole, 1); assert.equal(turn.par, PARS[0]);
  assert.equal(turn.t, gs[gi]!.tee, 'strikes at the tee time: nobody is ahead of him on the first tee');
  assert.deepEqual(turn.ball, view.holes[0]!.tee);
  assert.ok(turn.suggested.power > 0.3 && turn.suggested.power <= 1, 'a suggested power in range');
  assert.deepEqual(lg.advance(), turn, 'the same turn comes back until he plays it');
  assert.throws(() => lg.play({ holeIdx: 1, stroke: 1, club: 'wood3', aim: turn.pin, power: 1 }), /hole 1/, 'an input for another turn is refused');
});

test('live: a shot with the suggested input lands near the aim; an aim 30 degrees to the left lands left of the line', () => {
  const dists: number[] = [], angles: number[] = [];
  for (let seed = 1; seed <= 10; seed++) {
    const { view, f, gs, gi } = world(seed), lg = new LiveGroup(playRound(view, f, gs, seed, { live: gi }), view, gi, seed), t = lg.advance()!;
    const s = lg.play(suggest(t));
    dists.push(Math.hypot(s.to.x - t.suggested.aim.x, s.to.y - t.suggested.aim.y) * TILE_M);
    // the same tee shot, aimed 30 degrees to the left of the line (+y), a 100 m carry
    const from = t.ball, ang = Math.PI / 6, aim = { x: from.x + Math.cos(ang) * 50, y: from.y + Math.sin(ang) * 50 }, lg2 = new LiveGroup(playRound(view, f, gs, seed, { live: gi }), view, gi, seed);
    lg2.advance();
    const s2 = lg2.play({ holeIdx: 0, stroke: 1, club: 'wood3', aim, power: 100 / 177.75 });
    angles.push(Math.atan2(s2.to.y - from.y, s2.to.x - from.x) * 180 / Math.PI);
  }
  const mean = dists.reduce((a, b) => a + b, 0) / dists.length;
  assert.ok(mean < 30, `the suggested shot lands near the aim: mean ${mean.toFixed(1)} m off`);
  assert.ok(dists.filter(d => d < 60).length >= 7, `within the spread (a mishit is the rest): ${dists.map(d => d.toFixed(0))}`);
  const meanA = angles.reduce((a, b) => a + b, 0) / angles.length;
  assert.ok(meanA > 20 && meanA < 40, `30 degrees left of the line: mean ${meanA.toFixed(1)}`);
  assert.ok(angles.every(a => a > 10), `every landing left of the line: ${angles.map(a => a.toFixed(0))}`);
});

test('live: replaying the saved inputs into a new LiveGroup on a fresh plan reaches the same shots and turns', () => {
  const { view, f, gs, gi } = world(5), pa = playRound(view, f, gs, 5, { live: gi }), a = new LiveGroup(pa, view, gi, 5);
  for (let k = 0; k < 12; k++) {
    const t = a.advance();
    if (!t) break;
    const sg = t.suggested;
    a.play({ holeIdx: t.holeIdx, stroke: t.stroke, club: sg.club, aim: sg.aim, power: k % 2 ? sg.power * 0.8 : sg.power });
  }
  assert.ok(a.inputs.length >= 10, `inputs played: ${a.inputs.length}`);
  const pb = playRound(view, f, gs, 5, { live: gi }), b = new LiveGroup(pb, view, gi, 5);
  b.replay(a.inputs);
  assert.deepEqual(b.inputs, a.inputs, 'the same inputs');
  assert.equal(JSON.stringify(pb.shots), JSON.stringify(pa.shots), 'the same shots');
  assert.deepEqual(pb.strokes, pa.strokes); assert.deepEqual(pb.done, pa.done);
  assert.deepEqual(b.advance(), a.advance(), 'the same next turn');
});

test('live: the owner plays every turn with the suggested input to the end of the round; the group is done after 18 holes', () => {
  const { view, f, gs, gi } = world(8), p = playRound(view, f, gs, 8, { live: gi }), lg = new LiveGroup(p, view, gi, 8);
  let turns = 0;
  for (let t = lg.advance(); t; t = lg.advance()) { lg.play(suggest(t)); turns++; assert.ok(turns < 800, 'the round ends'); }
  assert.equal(lg.advance(), null, 'done');
  assert.equal(turns, lg.inputs.length);
  for (const id of gs[gi]!.players) { assert.ok(Number.isFinite(p.done[id]!), `golfer ${id} done`); assert.equal(p.strokes[id]!.length, 18); assert.ok(p.strokes[id]!.every(k => k >= 1), `golfer ${id} has strokes on every hole`); }
});

test('live: caddie finishes the group by the model, and the group then plays exactly as in the full round', () => {
  const { view, f, gs, gi } = world(7), full = playRound(view, f, gs, 7), p = playRound(view, f, gs, 7, { live: gi }), lg = new LiveGroup(p, view, gi, 7);
  assert.ok(lg.advance());
  lg.caddie();
  assert.equal(lg.advance(), null, 'done');
  const inG = new Set(gs[gi]!.players), mine = p.shots.filter(s => inG.has(s.golfer)), theirs = full.shots.filter(s => inG.has(s.golfer));
  assert.equal(JSON.stringify(mine), JSON.stringify(theirs), 'the caddied group plays the model: the same shots as the full round');
  for (const id of inG) assert.equal(p.done[id], full.done[id], `golfer ${id} done at the same minute`);
  assert.throws(() => lg.play({ holeIdx: 0, stroke: 1, club: 'wood3', aim: view.holes[0]!.pin, power: 1 }), /no owner turn/, 'nothing to play after the caddie');
});

test('live: mid-round the playback is sane: the group stands near the course, and the owner stands at his ball at his turn', () => {
  const { view, f, gs, gi, owner } = world(9), p = playRound(view, f, gs, 9, { live: gi }), lg = new LiveGroup(p, view, gi, 9);
  for (let k = 0; k < 9; k++) { const t = lg.advance()!; lg.play(suggest(t)); }
  const turn = lg.advance()!, st = stateAt(p, view, turn.t);
  const near = (x: number, y: number) => view.holes.some(h => segDist({ x, y }, h.tee, h.pin) <= 40);
  for (const id of gs[gi]!.players) {
    const s = st.find(x => x.golfer === id)!;
    assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y) && near(s.x, s.y), `golfer ${id} near the course (${s.action})`);
    assert.ok(['waiting', 'walk', 'address', 'swing', 'putt', 'holed', 'done'].includes(s.action), `sane action ${s.action}`);
  }
  const o = st.find(x => x.golfer === owner.id)!;
  assert.deepEqual(o.ball, turn.ball, 'his ball');
  assert.ok(Math.hypot(o.x - turn.ball.x, o.y - turn.ball.y) < 1e-9, 'standing at his ball');
});

test('live: the standings include the owner once he has teed off; the champion waits for the live group', () => {
  const { view, f, gs, gi, owner } = world(4), p = playRound(view, f, gs, 4, { live: gi }), lg = new LiveGroup(p, view, gi, 4);
  assert.equal(champion(p, view), null, 'no champion before the live group plays');
  assert.ok(!standings(p, view, gs[gi]!.tee - 1).some(s => s.golfer === owner.id), 'the owner is not on the board before his tee time');
  const t = lg.advance()!;
  assert.ok(standings(p, view, t.t).some(s => s.golfer === owner.id), 'on the board once he has teed off');
  for (let k = 0; k < 5; k++) lg.play(suggest(lg.advance()!));
  assert.equal(champion(p, view), null, 'still no champion mid-round');
  lg.caddie(); lg.advance();
  assert.ok(champion(p, view) !== null, 'a champion once the group is done');
});

test('live: constructing on a plan that already has the group shots is refused', () => {
  const { view, f, gs, gi } = world(2);
  assert.throws(() => new LiveGroup(playRound(view, f, gs, 2), view, gi, 2), /shots already/);
});

test('pace: a group strikes one at a time: each stroke is at least the routine of the one before it (its own club) after that one', () => {
  const { view, f, gs } = world(1), p = playRound(view, f, gs, 1), pro = new Map(f.map(g => [g.id, g.pro] as const));
  for (const gr of gs) {
    const ids = new Set(gr.players), shots = p.shots.filter(s => ids.has(s.golfer)).sort((a, b) => a.t - b.t);
    for (let i = 1; i < shots.length; i++) {
      const a = shots[i - 1]!, b = shots[i]!;
      if (a.hole !== b.hole) continue;
      assert.ok(b.t >= a.t + routineOf(a.club, pro.get(a.golfer)!) - 1e-9, `group at ${gr.tee}: strike ${i} ${(b.t - a.t).toFixed(2)} min after the one before`);
    }
  }
});

test('pace: over 6 seeds at tiers 1, 3 and 5, every golfer is done by 18:45, and the first group takes 3.5 to 5.5 hours', () => {
  const view = course();
  for (const tier of [1, 3, 5]) for (let seed = 1; seed <= 6; seed++) {
    const f = makeField(tier, seed), gs = teeTimes(f, seed), p = playRound(view, f, gs, seed);
    assert.ok(Math.max(...p.done) <= 18 * 60 + 45, `tier ${tier} seed ${seed}: last done at ${Math.max(...p.done).toFixed(0)}`);
    const g0 = gs[0]!, len = Math.max(...g0.players.map(id => p.done[id]!)) - g0.tee;
    assert.ok(len >= 210 && len <= 330, `tier ${tier} seed ${seed}: the first group takes ${(len / 60).toFixed(2)} h`);
  }
});
