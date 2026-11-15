// #1345 (the owner: "ball hit into the cliff just sits there and you have to play it from the side of a cliff. can we make Cliff balls a lateral penalty with a drop"):
// the view's cliff mask (play/cliffs3p.ts) read by the model from version 7 (live.ts CLIFF_V): a ball at rest in the rocks takes one penalty stroke and is dropped
// at the edge where it went in (shot.ts cliffDrop), within two club lengths, no nearer the hole, on playable ground; a putt the same; an older input and a view
// with no mask play as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLIFF_DROP_TILES, CLIFF_V, MODEL_V, cliffDrop, cliffGrid, cliffHit, cliffMaskOf, cliffView, keepCliffs, rng, shotOutcome } from '../src/game/golf/play';
import { shotMsg } from '../src/game/golf/play/shot3p';
import type { CourseView, Lie, PlayHole, Pt } from '../src/game/golf/play';

const hole: PlayHole = { n: 1, par: 5, tee: { x: 0, y: 0 }, pin: { x: 300, y: 0 }, line: [{ x: 0, y: 0 }, { x: 300, y: 0 }] };
/** a flat fairway; `water` and the rocks (`rock`, the view's mask) where the callers say */
function course(rock: ((x: number, y: number) => boolean) | null, water: (x: number, y: number) => boolean = () => false): CourseView {
  return { holes: [hole], lieAt: (x, y): Lie => (water(x, y) ? 'water' : 'fairway'), ...(rock ? { cliffAt: rock } : {}) };
}
const band = (x: number) => x >= 60 && x < 160;   // the rocks: a band across the hole from 120 m to 320 m out
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const drive = (v: number) => ({ club: 'driver' as const, aim: { x: 100, y: 0 }, power: 1, v });

test('the model version is 7 and the cliffs are its', () => { assert.equal(MODEL_V, 7); assert.equal(CLIFF_V, 7); });

test('a drive that comes to rest in the rocks: one penalty stroke, dropped at the edge where it went in, no nearer the hole, on playable ground', () => {
  const v = course((x) => band(x));
  for (let s = 1; s <= 40; s++) {
    const o = shotOutcome(v, hole, hole.tee, 'tee', 0.6, drive(7), rng(11, s, 3));
    assert.ok(o.landing, 'a full shot has a landing');
    if (!band(o.landing!.rest.x)) continue;   // (it carried past or fell short of the rocks)
    assert.equal(o.penalty, 1, `seed ${s}: a penalty`);
    assert.equal(o.landing!.restLie, 'cliff', `seed ${s}: the rest is in the rocks`);
    assert.ok(!band(o.to.x) && o.lie === 'fairway', `seed ${s}: dropped on the fairway, out of the rocks (${o.to.x.toFixed(2)})`);
    // the edge where it went in: the last point of its way outside the rocks, just short of x 60
    assert.ok(o.to.x < 60 && o.to.x > 60 - 0.25 - CLIFF_DROP_TILES - 1e-9, `seed ${s}: by the edge (${o.to.x.toFixed(2)})`);
    assert.ok(dist(o.to, hole.pin) >= 240 - 1e-6, `seed ${s}: no nearer the hole than the edge`);
  }
});

test('the drop: the edge itself when it is playable; else the nearest playable point within two club lengths, no nearer the hole; else further back; else the stroke again', () => {
  const pin = { x: 300, y: 0 }, from = { x: 0, y: 0 };
  // a ball that flew into the rocks at x 100: the edge is where its way left the fairway, at 59.75 (quarter-tile steps back from the rest)
  const a = cliffDrop(cliffView(course((x) => band(x))), [from, { x: 100, y: 0 }, { x: 100, y: 0 }], pin, from, 'tee');
  assert.deepEqual([+a.to.x.toFixed(2), a.to.y, a.lie], [59.75, 0, 'fairway']);
  // water at the edge: the nearest point round it that is dry and no nearer the hole
  const wet = (x: number, y: number) => x > 58.5 && x < 60 && Math.abs(y) < 0.4;
  const b = cliffDrop(cliffView(course((x) => band(x), wet)), [from, { x: 100, y: 0 }], pin, from, 'tee');
  assert.ok(b.lie === 'fairway' && !wet(b.to.x, b.to.y) && !band(b.to.x), JSON.stringify(b));
  assert.ok(dist(b.to, { x: 59.75, y: 0 }) <= CLIFF_DROP_TILES + 1e-9 && dist(b.to, pin) >= dist({ x: 59.75, y: 0 }, pin) - 1e-9, JSON.stringify(b));
  // water all round the edge: further back along its way
  const moat = (x: number) => x > 54 && x < 60;
  const c = cliffDrop(cliffView(course((x) => band(x), moat)), [from, { x: 100, y: 0 }], pin, from, 'tee');
  assert.ok(c.lie === 'fairway' && c.to.x <= 54 && c.to.x > 53, JSON.stringify(c));
  // water all the way back to the tee: the first dry point is the tee's own spot
  const d = cliffDrop(cliffView(course((x) => band(x), (x) => x > 0.1 && x < 60)), [from, { x: 100, y: 0 }], pin, from, 'tee');
  assert.deepEqual([d.to.x, d.lie], [0, 'fairway']);
  // nowhere playable at all: the stroke again, from where it was struck, its own lie
  const e = cliffDrop(cliffView(course((x) => band(x), (x) => x < 60)), [from, { x: 100, y: 0 }], pin, from, 'tee');
  assert.deepEqual([e.to, e.lie], [from, 'tee']);
});

test('an input from before version 7, and a view with no mask, play exactly as before: no cliffs', () => {
  const v = course((x) => band(x)), none = course(null);
  for (let s = 1; s <= 30; s++) {
    const old = shotOutcome(v, hole, hole.tee, 'tee', 0.6, drive(6), rng(11, s, 3)), plain = shotOutcome(none, hole, hole.tee, 'tee', 0.6, drive(6), rng(11, s, 3));
    assert.deepEqual(old, plain, `seed ${s}: version 6 never reads the rocks`);
    assert.equal(old.penalty, 0); assert.notEqual(old.lie, 'cliff');
    const noMask = shotOutcome(none, hole, hole.tee, 'tee', 0.6, drive(7), rng(11, s, 3));
    assert.deepEqual(noMask, plain, `seed ${s}: version 7 with no mask is version 6`);
  }
});

test('a putt into the rocks: one penalty stroke, dropped at their edge; its message rolls to the rocks and says so', () => {
  const near: PlayHole = { n: 1, par: 4, tee: { x: 0, y: 0 }, pin: { x: 10, y: 0 }, line: [{ x: 0, y: 0 }, { x: 10, y: 0 }] };
  const v: CourseView = { holes: [near], lieAt: (): Lie => 'green', cliffAt: (x) => x > 10.6 };
  let hit = 0;
  for (let s = 1; s <= 60; s++) {
    const o = shotOutcome(v, near, { x: 4, y: 0 }, 'green', 0.3, { club: 'putter', aim: { x: 10, y: 0 }, power: 1.5, v: 7 }, rng(5, s, 1));
    if (!o.penalty) continue; hit++;
    assert.equal(o.landing!.restLie, 'cliff'); assert.ok(o.landing!.rest.x > 10.6);
    assert.ok(o.to.x <= 10.6 && o.to.x > 10.6 - 0.25 - CLIFF_DROP_TILES && o.lie === 'green', JSON.stringify(o.to));   // (at the edge, on the green)
    const shot = { golfer: 0, hole: 0, stroke: 1, t: 0, from: { x: 4, y: 0 }, to: o.to, club: 'putter' as const, lie: o.lie, penalty: o.penalty, holed: o.holed, landing: o.landing };
    const m = shotMsg({ shot }, { x: 0, y: 0 });
    assert.equal(m.restLie, 'cliff'); assert.ok(m.drop && m.dropLie === 'green');
    assert.ok(Math.abs(m.rest[0] - o.landing!.rest.x * 2) < 1e-6, 'it rolls to its rest in the rocks');
  }
  assert.ok(hit > 0, 'a strong putt runs into the rocks');
});

test('the mask: read from the view\'s frame into tiles, unpacked, looked up; the save keeps one a course, the newest first', () => {
  // a 4 x 2 mask of 2 m cells whose corner is 10 m east and 6 m north of the course's centre (tile 100, 200): cells (1,0) and (2,1) are cliffs
  const M = cliffMaskOf({ v: 1, t: 'cliffs', course: 'ce-dune', x0: 10, y0: -6, cell: 2, w: 4, h: 2, r: [0, 1, 1, 1, 0, 4, 1, 1, 0, 1] }, { x: 100, y: 200 });
  assert.ok(M); assert.deepEqual([M!.x0, M!.y0, M!.cell], [105, 197, 1]);
  const G = cliffGrid(M!);
  assert.equal(cliffHit(G, 106.5, 197.5), true); assert.equal(cliffHit(G, 107.5, 198.5), true);
  assert.equal(cliffHit(G, 105.5, 197.5), false); assert.equal(cliffHit(G, 104.9, 197.5), false); assert.equal(cliffHit(G, 106.5, 199.1), false); assert.equal(cliffHit(null, 106.5, 197.5), false);
  assert.equal(cliffMaskOf({ v: 1, t: 'cliffs', course: 'x', x0: 0, y0: 0, cell: 0, w: 1, h: 1, r: [0, 1] }, { x: 0, y: 0 }), null);
  assert.equal(cliffMaskOf({ v: 1, t: 'cliffs', course: 'x', x0: 0, y0: 0, cell: 2, w: 1, h: 1, r: [0] }, { x: 0, y: 0 }), null);
  const k = keepCliffs(keepCliffs(keepCliffs(undefined, { ...M!, course: 'a' }), { ...M!, course: 'b' }), { ...M!, course: 'a', w: 9 });
  assert.deepEqual(k.map(c => [c.course, c.w]), [['a', 9], ['b', 4]]);
});
