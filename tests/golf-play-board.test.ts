// The leaderboard's rows and the champion (docs/GOLF-PLAY.md decision 8, src/game/golf/play/board.ts): to par and the names as the board writes them,
// the shared positions, the owner's row below the top, F for a finished round, and the champion once everyone is done (ties shared).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardRows, champion, championLine, makeField, playRound, shortName, standings, teeTimes, toParText } from '../src/game/golf/play';
import type { CourseView, Golfer, Lie, PlayHole, RoundPlan, Standing } from '../src/game/golf/play';

/** a view of 18 par 4s (the course's par is 72); the lies are not read by the champion */
const PAR72: CourseView = { holes: Array.from({ length: 18 }, (_, h): PlayHole => ({ n: h + 1, par: 4, tee: { x: 0, y: h }, pin: { x: 10, y: h }, line: [] })), lieAt: () => 'fairway' };

/** a golfer with a name and an id */
const G = (id: number, name: string): Golfer => ({ id, name, sex: 'w', pro: true, skill: 0.8, look: 0 });

/** a plan of the golfers' totals (all strokes on the first hole: only the totals count here) and the minute each is done */
function planOf(totals: number[], done: number[]): RoundPlan {
  return { golfers: totals.map((_, i) => G(i, `Player ${i}`)), groups: [], shots: [], strokes: totals.map(t => [t, ...new Array<number>(17).fill(0)]), done };
}

test('to par: E, +3 and −2 with a real minus sign; a short name is the first initial and the surname', () => {
  assert.equal(toParText(0), 'E');
  assert.equal(toParText(3), '+3');
  assert.equal(toParText(-2), '−2');
  assert.equal(toParText(-2).charCodeAt(0), 0x2212);
  assert.equal(shortName('Carol Roberts'), 'C. Roberts');
  assert.equal(shortName('Madonna'), 'Madonna');
});

test('boardRows: the first limit standings, a shared position as T, F once all 18 holes are in', () => {
  const golfers = [G(0, 'Ann Lee'), G(1, 'Bo Smith'), G(2, 'Carol Roberts'), G(3, 'Dee Hall'), G(4, 'Ed Gray')];
  const st: Standing[] = [
    { golfer: 2, pos: 1, toPar: -3, thru: 18, strokes: 69 },
    { golfer: 0, pos: 2, toPar: -1, thru: 14, strokes: 49 },
    { golfer: 1, pos: 2, toPar: -1, thru: 18, strokes: 71 },
    { golfer: 3, pos: 4, toPar: 0, thru: 9, strokes: 36 },
    { golfer: 4, pos: 5, toPar: 2, thru: 4, strokes: 14 },
  ];
  const rows = boardRows(st, golfers, 2, null);
  assert.deepEqual(rows.map(r => [r.pos, r.name, r.toPar, r.thru, r.owner, r.golfer]), [
    ['1', 'C. Roberts', '−3', 'F', false, 2],
    ['T2', 'A. Lee', '−1', '14', false, 0],
  ], 'the top two, the tie at 2 shown as T2 with the holes thru');
  assert.equal(boardRows(st, golfers, 8, null).find(r => r.golfer === 1)!.thru, 'F', 'a golfer on 18 holes is F');
  assert.equal(boardRows(st, golfers, 8, null).find(r => r.golfer === 1)!.pos, 'T2', 'the tie is shown on both rows');
  assert.equal(boardRows(st, golfers, 8, null).length, 5, 'up to the limit, all five');
});

test('boardRows: the owner below the top gets his row after them, highlighted; inside the top no second row; not teed off, no row', () => {
  const golfers = [G(0, 'Ann Lee'), G(1, 'Bo Smith'), G(2, 'Carol Roberts'), G(3, 'Dee Hall'), G(4, 'Ed Gray')];
  const st: Standing[] = [
    { golfer: 2, pos: 1, toPar: -3, thru: 18, strokes: 69 },
    { golfer: 0, pos: 2, toPar: -1, thru: 14, strokes: 49 },
    { golfer: 1, pos: 2, toPar: -1, thru: 18, strokes: 71 },
    { golfer: 3, pos: 4, toPar: 0, thru: 9, strokes: 36 },
    { golfer: 4, pos: 5, toPar: 2, thru: 4, strokes: 14 },
  ];
  const below = boardRows(st, golfers, 2, 3);
  assert.equal(below.length, 3);
  assert.deepEqual([below[2]!.name, below[2]!.pos, below[2]!.toPar, below[2]!.thru, below[2]!.owner], ['D. Hall', '4', 'E', '9', true]);
  assert.deepEqual(below.map(r => r.owner), [false, false, true], 'only his row is highlighted');
  const inTop = boardRows(st, golfers, 3, 0);
  assert.equal(inTop.length, 3, 'in the top three: no second row');
  assert.deepEqual(inTop.map(r => r.owner), [false, true, false]);
  assert.equal(boardRows(st.filter(s => s.golfer !== 4), golfers, 2, 4).some(r => r.owner), false, 'not teed off: no row for him');
  assert.equal(boardRows(st, golfers, 2, 4)[2]!.toPar, '+2', 'a plus to par');
  assert.equal(boardRows([], golfers, 8, 0).length, 0, 'nobody has teed off: no rows');
});

test('champion: null before every golfer is done, the lowest total with every tie listed, null with no holes', () => {
  const plan = planOf([70, 70, 72], [100, 200, 300]);
  assert.equal(champion(plan, PAR72, 150), null, 'two are done, one is not');
  const c = champion(plan, PAR72, 300)!;
  assert.deepEqual([c.golfers, c.toPar, c.strokes], [[0, 1], -2, 70], 'the tied leaders, at −2');
  assert.deepEqual(champion(plan, PAR72)!.golfers, [0, 1], 'without a minute: the final result');
  assert.equal(championLine(plan, PAR72, 150), null);
  assert.equal(championLine(plan, PAR72, 300), 'Player 0 and Player 1 share the title at −2');
  assert.equal(championLine(planOf([68, 70, 72], [1, 2, 3]), PAR72, 3), 'Player 0 wins at −4');
  assert.equal(championLine(planOf([72, 74, 78], [1, 2, 3]), PAR72, 3), 'Player 0 wins at E');
  assert.equal(championLine(planOf([70, 70, 70, 74], [1, 2, 3, 4]), PAR72, 9), 'Player 0, Player 1 and Player 2 share the title at −2', 'three tied');
  assert.equal(champion(plan, { holes: [], lieAt: () => 'fairway' }, 300), null, 'no holes: no champion');
});

test('champion on a played round: the top of the final board is the champion, and the line has the champion’s full name', () => {
  const golfers = makeField(3, 6), gs = teeTimes(golfers, 6);
  // 18 par 4s in parallel lines 20 tiles apart, the pins 160 tiles out; the greens are the 6 tiles round each pin, the rest fairway
  const holes: PlayHole[] = Array.from({ length: 18 }, (_, h) => { const tee = { x: 0, y: 10 + 20 * h }, pin = { x: 160, y: tee.y }; return { n: h + 1, par: 4, tee, pin, line: [tee, pin] }; });
  const lieAt = (x: number, y: number): Lie => { const h = holes[Math.max(0, Math.min(17, Math.round((y - 10) / 20)))]!; return Math.hypot(x - h.pin.x, y - h.pin.y) <= 6 ? 'green' : 'fairway'; };
  const view: CourseView = { holes, lieAt }, plan = playRound(view, golfers, gs, 6), end = Math.max(...plan.done);
  const st = standings(plan, view, end + 1), c = champion(plan, view, end)!;
  assert.equal(st.length, golfers.length, 'everyone on the board at the end');
  assert.ok(st.every(s => s.thru === 18), 'all 18 holes in');
  assert.equal(st[0]!.toPar, c.toPar, 'the top of the board is at the champion’s to par');
  assert.ok(c.golfers.includes(st[0]!.golfer), 'the champion is on the top row');
  assert.equal(boardRows(st, golfers, 8, null)[0]!.thru, 'F');
  const name = golfers.find(g => g.id === c.golfers[0])!.name;
  assert.ok(championLine(plan, view, end)!.includes(name), 'the full name of the champion');
});
