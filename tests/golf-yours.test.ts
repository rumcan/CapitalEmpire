// T317 (#903; the owner, 2026-11-03: "drive to first tee and Tee off. you should be asked if you are playing all the holes and it should keep score ...
// walk/drive to his ball add a button to jump to ball ... it can snap to the hitting position when close"): your own round (golf/play/yours.ts): the
// hole choice, the scorecard and its save, the snap distance and the address, the cart's collision (golf/you.ts keyStep at the cart's pace, kept off
// the greens and bunkers), jump-to-ball's address, and that the tournament owner's shot is unchanged by the shared shot outcome (live.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADDRESS_BACK, CART_TILES, PICK_UP_OVER, SNAP_TILES, addressOf, cardTotals, cartMay, flightOf, holeOptions, nearBall, nextHole, normalizeYourRound, ordinal, pickHoles, playYours, rowOf, scoreName, startRound, yourBallAt, yourTurn, type YourRound } from '../src/game/golf/play/yours';
import { keyStep, makeYou } from '../src/game/golf/you';
import { normalizePlayer, startProfile } from '../src/game/golf/player';
import { LiveGroup, shotOutcome } from '../src/game/golf/play/live';
import { playRound } from '../src/game/golf/play/round';
import { rng } from '../src/game/golf/play/shot';
import type { CourseView, Golfer, Lie, PlayHole } from '../src/game/golf/play/types';

/** an 18-hole course: each hole 150 tiles (300 m) east along its own row, a green of radius 8 round the pin, a bunker beside it, fairway elsewhere */
const holes: PlayHole[] = Array.from({ length: 18 }, (_, h) => { const tee = { x: 0, y: 10 + 30 * h }, pin = { x: 150, y: tee.y }; return { n: h + 1, par: h % 6 === 2 ? 3 : 4, tee, pin, line: [tee, pin] }; });
const lieAt = (x: number, y: number): Lie => {
  const h = holes[Math.max(0, Math.min(17, Math.round((y - 10) / 30)))]!, d = Math.hypot(x - h.pin.x, y - h.pin.y);
  return d <= 8 ? 'green' : Math.hypot(x - h.pin.x, y - (h.pin.y + 12)) <= 3 ? 'bunker' : x < -5 ? 'out' : 'fairway';
};
const view: CourseView = { holes, lieAt };
const SK = { driving: 0.5, irons: 0.5, short: 0.5, putting: 0.5 };

test('the first tee offers all, the front 9 and the back 9 (sized to the course) and a pick', () => {
  const o18 = holeOptions(18);
  assert.deepEqual(o18.map(o => o.label), ['Play all 18', 'The front 9', 'The back 9', 'Pick holes']);
  assert.deepEqual(o18[1]!.holes, [0, 1, 2, 3, 4, 5, 6, 7, 8]); assert.deepEqual(o18[2]!.holes, [9, 10, 11, 12, 13, 14, 15, 16, 17]);
  assert.deepEqual(holeOptions(9).map(o => o.id), ['all', 'pick'], 'a nine-hole course: all 9 or a pick');
  assert.equal(holeOptions(9)[0]!.label, 'Play all 9');
  assert.deepEqual(holeOptions(12).map(o => o.label), ['Play all 12', 'The front 9', 'The back 3', 'Pick holes']);
  assert.deepEqual(holeOptions(0), []);
  assert.deepEqual(pickHoles(18, 'back'), [9, 10, 11, 12, 13, 14, 15, 16, 17]);
  assert.deepEqual(pickHoles(18, 'pick', [7, 2, 2, 40, -1, 3.5]), [2, 7], 'a pick in course order, once each, holes the course has');
  assert.deepEqual(pickHoles(9, 'front'), [], 'no front nine on a nine');
});

test('a round starts on the first chosen hole\'s tee with an empty card', () => {
  const r = startRound(view, pickHoles(18, 'back'), 3)!;
  assert.equal(r.at, 0); assert.equal(r.lie, 'tee'); assert.deepEqual(r.ball, holes[9]!.tee);
  assert.equal(r.card.length, 9); assert.equal(r.card[0]!.n, 10); assert.ok(r.card.every(c => c.strokes === 0 && !c.done));
  assert.equal(startRound(view, [40], 3), null, 'no hole the course has: no round');
  const t = yourTurn(view, r, SK)!;
  assert.equal(t.hole, 10); assert.equal(t.stroke, 1); assert.equal(t.lie, 'tee'); assert.equal(t.suggested.club, 'driver');
});

/** plays the hole to the end with the suggested shots (no meter) */
function playOut(r: YourRound, seed = 7): YourRound {
  for (let k = 0; k < 30 && !r.holed; k++) { const t = yourTurn(view, r, SK)!; r = playYours(view, r, SK, { club: t.suggested.club, aim: t.suggested.aim, power: t.suggested.power }, seed).round; }
  return r;
}

test('the scorecard keeps the strokes, the putts and the total; next hole goes to its tee; the last hole ends the round', () => {
  let r = startRound(view, [0, 1], 1)!;
  r = playOut(r);
  const row = r.card[0]!;
  assert.ok(r.holed && row.done, 'the hole is done');
  assert.ok(row.strokes >= 2 && row.strokes <= row.par + PICK_UP_OVER, `a sane score (${row.strokes})`);
  assert.ok(row.putts >= 0 && row.putts <= row.strokes);
  assert.ok(!r.over, 'one hole left');
  assert.throws(() => playYours(view, r, SK, { club: 'putter', aim: holes[0]!.pin, power: 1 }, 7), 'no shot once holed');
  const n = nextHole(view, r);
  assert.equal(n.at, 1); assert.equal(n.lie, 'tee'); assert.deepEqual(n.ball, holes[1]!.tee); assert.ok(!n.holed);
  r = playOut(n);
  assert.ok(r.over, 'the last hole done ends the round');
  assert.equal(nextHole(view, r), r, 'no hole after the last');
  const t = cardTotals(r.card);
  assert.equal(t.thru, 2); assert.equal(t.strokes, r.card[0]!.strokes + r.card[1]!.strokes); assert.equal(t.par, 8); assert.equal(t.toPar, t.strokes - 8);
});

test('a hole is picked up at par + 5', () => {
  let r = startRound(view, [0], 1)!;
  // putt from the tee, 300 m short each time: never in
  for (let k = 0; k < 20 && !r.holed; k++) r = playYours(view, r, SK, { club: 'putter', aim: { x: r.ball.x, y: r.ball.y + 50 }, power: 0.5 }, 3).round;
  assert.ok(r.holed && r.card[0]!.up, 'picked up');
  assert.equal(r.card[0]!.strokes, 4 + PICK_UP_OVER);
});

test('the round is saved with your profile and read back; a broken one is dropped', () => {
  let r = startRound(view, [2, 5], 4)!;
  const t = yourTurn(view, r, SK)!; r = playYours(view, r, SK, { club: t.suggested.club, aim: t.suggested.aim, power: t.suggested.power }, 9).round;
  const p = normalizePlayer(JSON.parse(JSON.stringify({ ...startProfile(), round: r })))!;
  assert.deepEqual(p.round, r, 'the round survives the save');
  assert.equal(normalizePlayer(JSON.parse(JSON.stringify(startProfile())))!.round, undefined, 'an old save has none');
  assert.equal(normalizeYourRound({ ...r, holes: [2] }), undefined, 'holes and card disagree');
  assert.equal(normalizeYourRound({ ...r, ball: { x: 'a', y: 1 } }), undefined);
});

test('the snap: near the ball (SNAP_TILES) you address it, ADDRESS_BACK behind it on the line to the aim', () => {
  const ball = { x: 50, y: 50 };
  assert.ok(nearBall(50 + SNAP_TILES - 0.01, 50, ball)); assert.ok(!nearBall(50 + SNAP_TILES + 0.01, 50, ball));
  const a = addressOf(ball, { x: 150, y: 50 });
  assert.ok(Math.abs(a.x - (50 - ADDRESS_BACK)) < 1e-9 && a.y === 50, 'behind the ball, away from the aim');
  assert.deepEqual(addressOf(ball, ball), ball, 'no line: at the ball');
  assert.ok(nearBall(a.x, a.y, ball), 'the address is within the snap (jump to ball lands you there)');
});

test('the cart drives at its pace on the keys, up to a green or a bunker and never onto one', () => {
  const c = makeYou(140, 2.5); c.speed = CART_TILES; // (north of hole 1's green, at y 10 round x 150)
  const ok = (x: number, y: number) => cartMay(lieAt(x, y));
  assert.ok(!cartMay('green') && !cartMay('tee') && !cartMay('bunker') && !cartMay('water') && cartMay('fairway') && cartMay('rough') && cartMay('out')); // (T377: nor on a tee box)
  // down the screen and to the right is +x +y on the map: toward the green; hold it for 10 s
  for (let k = 0; k < 600; k++) keyStep(c, 1, 1, false, 1 / 60, ok);
  assert.ok(ok(c.x, c.y), 'the cart is never on the green');
  assert.ok(Math.hypot(c.x - 140, c.y - 2.5) > 3, 'it drove up to the green\'s edge');
  assert.ok(Math.hypot(c.x - 150, c.y - 10) < 9, 'and stopped there');
  const w = makeYou(0, 0); w.speed = CART_TILES; keyStep(w, 0, 1, false, 1, () => true);
  assert.ok(Math.abs(Math.hypot(w.x, w.y) - CART_TILES) < 1e-9, 'a second\'s drive is CART_TILES');
  const p = makeYou(0, 0); keyStep(p, 0, 1, false, 1, () => true);
  assert.ok(Math.hypot(p.x, p.y) < CART_TILES / 2, 'a person walks far slower');
});

test('the flight lands, rolls and comes to rest where the shot did; a penalty shows its drop at the end', () => {
  const row = { i: 0, n: 1, par: 4, strokes: 1, putts: 0, pen: 0, done: false };
  const f = flightOf({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 110, y: 0 }, false, false, row, false);
  f.t = f.air / 2; const mid = yourBallAt(f); assert.ok(mid.h > 5 && Math.abs(mid.x - 50) < 1e-9, 'high in the middle');
  f.t = f.dur; assert.deepEqual(yourBallAt(f), { x: 110, y: 0, h: 0, sink: 0 });
  const pf = flightOf({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 40, y: 0 }, false, false, row, true);
  pf.t = pf.air + 0.01; assert.equal(yourBallAt(pf).x, 100); pf.t = pf.dur; assert.equal(yourBallAt(pf).x, 40);
  const putt = flightOf({ x: 0, y: 0 }, null, { x: 4, y: 0 }, true, false, row, false);
  assert.ok(putt.dur > 0.4 && putt.dur <= 3); putt.t = putt.dur; assert.deepEqual(yourBallAt(putt), { x: 4, y: 0, h: 0, sink: 0 });
});

test('score names and ordinals', () => {
  assert.equal(scoreName(1, 3), 'A hole in one!'); assert.equal(scoreName(3, 4), 'Birdie'); assert.equal(scoreName(4, 4), 'Par'); assert.equal(scoreName(6, 4), 'Double bogey'); assert.equal(scoreName(9, 4), '+5');
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st']);
});

test('the same shot from the same round: a reload plays it again; rowOf is the hole you are on', () => {
  const r = startRound(view, [0], 2)!, t = yourTurn(view, r, SK)!, inp = { club: t.suggested.club, aim: t.suggested.aim, power: t.suggested.power };
  assert.deepEqual(playYours(view, r, SK, inp, 5).shot, playYours(view, r, SK, inp, 5).shot);
  assert.equal(rowOf(r).n, 1);
});

test('the tournament owner\'s shot is unchanged: LiveGroup.play is shotOutcome on its own stream', () => {
  const g: Golfer[] = [{ id: 0, name: 'A', sex: 'm', pro: false, skill: 0.5, look: 0 }, { id: 1, name: 'You', sex: 'm', pro: false, skill: 0.4, look: 0, owner: true }];
  const plan = playRound(view, g, [{ tee: 480, players: [0, 1] }], 11, { live: 0 }), live = new LiveGroup(plan, view, 0, 11), turn = live.advance()!;
  const input = { holeIdx: turn.holeIdx, stroke: turn.stroke, club: turn.suggested.club, aim: turn.suggested.aim, power: turn.suggested.power, swing: { power: 0.95, acc: 0.01, boost: 0 } };
  const o = shotOutcome(view, view.holes[turn.holeIdx]!, turn.ball, turn.lie, 0.4, input, rng(11, 1, turn.holeIdx * 32 + turn.stroke));
  const s = live.play(input);
  assert.deepEqual(s.to, o.to); assert.equal(s.lie, o.lie);
});
