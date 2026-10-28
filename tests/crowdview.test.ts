// The crowd's people (docs/PEOPLE-IN-GAME.md): src/game/crowdview.ts, the seeded hash, the clips' frames, the spectators on a gallery, the queues,
// the walking parties. Pure TS: no DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipFrame, galleryPeople, golferRow, hash, queuePeople, rowToward, walkerPeople, type CrowdPerson } from '../src/game/crowdview';
import { SPECTATOR_CLIPS, SPECTATOR_FRAMES, SPECTATOR_PEOPLE } from '../src/game/library';

const PEOPLE = SPECTATOR_PEOPLE.length;
/** a gallery buffer with one spot: x, y, fans, kind, fx, fy, ax, ay */
const spotBuf = (kind: number, fans: number, x = 20, y = 20, fx = 20, fy = 10, ax = fx, ay = fy): Float32Array => Float32Array.of(x, y, fans, kind, fx, fy, ax, ay);

test('hash: deterministic, a float in [0, 1), spread out, and order matters', () => {
  let lo = 1, hi = 0, sum = 0;
  for (let a = 0; a < 200; a++) for (let b = 0; b < 50; b++) {
    const h = hash(a, b);
    assert.equal(h, hash(a, b));
    assert.ok(h >= 0 && h < 1, `${h}`);
    lo = Math.min(lo, h); hi = Math.max(hi, h); sum += h;
  }
  assert.ok(lo < 0.05 && hi > 0.95, `range ${lo} .. ${hi}`);
  assert.ok(Math.abs(sum / 10000 - 0.5) < 0.02, `mean ${sum / 10000}`);
  assert.notEqual(hash(1, 2), hash(2, 1));
});

test('clipFrame: a loop wraps after its last frame (which lasts the mean gap); a one-shot holds its last frame; n = 1 is always its start; t < 0 the first', () => {
  const walk = SPECTATOR_CLIPS.walk, cheer = SPECTATOR_CLIPS.cheer, idle = SPECTATOR_CLIPS.idle, clap = SPECTATOR_CLIPS.clap;
  assert.equal(clipFrame(walk, 0), walk.start);
  assert.equal(clipFrame(walk, 0.2), walk.start + 1);
  assert.equal(clipFrame(walk, walk.times[7]! + 0.01), walk.start + 7, 'the last frame');
  const span = walk.times[7]! - walk.times[0]!, total = span + span / 7;
  assert.equal(clipFrame(walk, total + 0.01), walk.start, 'wraps to the first frame');
  assert.equal(clipFrame(walk, 3 * total + 0.2), walk.start + 1, 'and again');
  assert.equal(clipFrame(cheer, cheer.times[0]! + 0.1), cheer.start, 'a one-shot starts at its first frame');
  assert.equal(clipFrame(cheer, cheer.times[0]! + 100), cheer.start + cheer.n - 1, 'and holds its last after the end');
  assert.equal(clipFrame(idle, 5), idle.start, 'a one-frame clip');
  assert.equal(clipFrame(walk, -1), walk.start, 't < 0 is the first frame');
  assert.equal(clipFrame(clap, clap.times[0]! + 0.12), clap.start + 1, 'the clap times start at their first value');
});

test('rowToward and golferRow: a tile direction to its sheet row (S 0, E 6, N 4); the golfer aiming toward screen right is row 0 (S)', () => {
  assert.equal(rowToward(1, 1), 0, 'S');
  assert.equal(rowToward(-1, -1), 4, 'N');
  assert.equal(rowToward(1, -1), 6, 'E (screen right)');
  assert.equal(golferRow(1, -1), 0, 'aim toward screen right: the golfer faces S');
  assert.equal(golferRow(1, 1), 2, 'aim toward the screen bottom: turned clockwise, the golfer faces W');
});

test('galleryPeople: the counts cap (60 a spot, 90 a grandstand), none with no fans or no people, fractions round, the same spot the same people', () => {
  const out: CrowdPerson[] = [];
  assert.equal(galleryPeople(spotBuf(0, 500), 0, 3, 100, PEOPLE, out), 60);
  assert.equal(galleryPeople(spotBuf(2, 500), 0, 3, 100, PEOPLE, out), 90);
  assert.equal(galleryPeople(spotBuf(0, 0), 0, 3, 100, PEOPLE, out), 0);
  assert.equal(galleryPeople(spotBuf(0, 500), 0, 3, 100, 0, out), 0, 'no people, nothing drawn');
  assert.equal(galleryPeople(spotBuf(0, 7.4), 0, 3, 100, PEOPLE, out), 7, 'rounded');
  const a: CrowdPerson[] = [], b: CrowdPerson[] = [];
  const na = galleryPeople(spotBuf(0, 40), 0, 5, 33.3, PEOPLE, a), nb = galleryPeople(spotBuf(0, 40), 0, 5, 33.3, PEOPLE, b);
  assert.equal(na, nb);
  assert.deepEqual(a.slice(0, na), b.slice(0, nb));
});

test('galleryPeople: a green\'s fans face the focus (their row is toward it), and the rows step back from the focus', () => {
  const out: CrowdPerson[] = [], focus = { x: 20, y: 10 };
  const n = galleryPeople(spotBuf(0, 30, 20, 20, focus.x, focus.y), 0, 7, 12.5, PEOPLE, out);
  assert.equal(n, 30);
  for (let s = 0; s < n; s++) {
    const p = out[s]!;
    assert.equal(p.row, rowToward(focus.x - p.x, focus.y - p.y), `fan ${s} faces the focus`);
    assert.equal(p.group, 0);
    assert.ok(p.person >= 0 && p.person < PEOPLE, `person ${p.person}`);
  }
  const d = (p: CrowdPerson) => Math.hypot(focus.x - p.x, focus.y - p.y);
  assert.ok(d(out[10]!) > d(out[0]!) + 0.2, 'the second row is a row back from the first');
});

test('galleryPeople: every frame is one of the person\'s frames; standing fans clap, cheer or idle; a grandstand sits (and sits and claps)', () => {
  const out: CrowdPerson[] = [], seen = new Set<number>(), seat = new Set<number>(), kinds = [0, 1, 3];
  for (const kind of kinds) for (let now = 0; now < 40; now += 0.5) {
    const n = galleryPeople(spotBuf(kind, 60, 30, 30, 30.7071, 30.7071), 0, 2, now, PEOPLE, out);
    for (let s = 0; s < n; s++) { const p = out[s]!; assert.ok(p.frame >= 0 && p.frame < SPECTATOR_FRAMES, `frame ${p.frame}`); seen.add(p.frame); }
  }
  for (let now = 0; now < 40; now += 0.5) {
    const n = galleryPeople(spotBuf(2, 90, 30, 30, 30.7071, 30.7071), 0, 2, now, PEOPLE, out);
    for (let s = 0; s < n; s++) { const p = out[s]!; assert.equal(p.row, 0, 'the seats face row 0 (S)'); assert.ok(p.frame >= 19 && p.frame < SPECTATOR_FRAMES, `seat frame ${p.frame}`); seat.add(p.frame); }
  }
  const idle = SPECTATOR_CLIPS.idle.start, clap = [9, 10, 11, 12], cheer = [13, 14, 15, 16, 17, 18];
  for (const f of seen) assert.ok(f === idle || clap.includes(f) || cheer.includes(f), `standing frame ${f}`);
  assert.ok(clap.some(f => seen.has(f)) && cheer.some(f => seen.has(f)) && seen.has(idle), `clap, cheer and idle all show: ${[...seen]}`);
  assert.ok(seat.has(19) || seat.has(20), 'sitting');
  assert.ok([21, 22, 23, 24].some(f => seat.has(f)), 'sitting and clapping');
});

test('walkerPeople: min(n, 3) people side by side across the heading, facing it, on the walk frames; none with no people or no fans', () => {
  const out: CrowdPerson[] = [], W = (n: number, tx: number, ty: number) => Float32Array.of(10, 10, n, 3, tx, ty);
  assert.equal(walkerPeople(W(5, 20, 10), 0, 4, 1, PEOPLE, out), 3, 'min(n, 3)');
  assert.equal(walkerPeople(W(2, 20, 10), 0, 4, 1, PEOPLE, out), 2);
  assert.equal(walkerPeople(W(0.4, 20, 10), 0, 4, 1, PEOPLE, out), 0, 'no fans');
  assert.equal(walkerPeople(W(3, 20, 10), 0, 4, 1, 0, out), 0, 'no people');
  const k = walkerPeople(W(3, 20, 10), 0, 4, 1, PEOPLE, out);
  assert.equal(k, 3);
  // heading +x: screen right-down (SE, row 7); the party stands across the heading, 0.4 tiles apart
  for (let j = 0; j < k; j++) {
    const p = out[j]!;
    assert.equal(p.row, 7, 'faces +x');
    assert.ok(p.frame >= 1 && p.frame <= 8, `a walk frame: ${p.frame}`);
    assert.equal(p.frame, out[0]!.frame, 'one phase for the party');
    assert.ok(Math.abs(p.x - 10) < 1e-9, 'across the heading only');
  }
  assert.ok(Math.abs(out[2]!.y - out[0]!.y - 0.8) < 1e-9, 'three people 0.4 tiles apart');
  walkerPeople(W(3, 10, 10), 0, 4, 1, PEOPLE, out);
  assert.equal(out[0]!.row, 0, 'no heading: the diagonal toward the screen bottom');
});

test('queuePeople: min(count, 24) idle people in a grid centred on the point, each facing it; none with no people', () => {
  const out: CrowdPerson[] = [];
  assert.equal(queuePeople(10, 10, 10, 4, 30, 2, 0, PEOPLE, out), 24, 'capped');
  assert.equal(queuePeople(10, 10, 10, 4, 5, 2, 0, PEOPLE, out), 5);
  assert.equal(queuePeople(10, 10, 10, 4, 0, 2, 0, PEOPLE, out), 0);
  assert.equal(queuePeople(10, 10, 10, 4, 5, 2, 0, 0, out), 0, 'no people');
  const n = queuePeople(10, 10, 10, 4, 24, 2, 7, PEOPLE, out);
  let mx = 0, my = 0;
  for (let s = 0; s < n; s++) {
    const p = out[s]!;
    assert.equal(p.frame, SPECTATOR_CLIPS.idle.start, 'idle');
    assert.equal(p.row, rowToward(10 - p.x, 4 - p.y), 'facing the point');
    mx += p.x; my += p.y;
  }
  assert.ok(Math.abs(mx / n - 10) < 0.2 && Math.abs(my / n - 10) < 0.2, `centred on (10, 10): ${mx / n}, ${my / n}`);
});

test('the roster (T203): the teens and the kids are spectators with every clip; the kids sit lower; staff are not packed; a big crowd shows everyone', () => {
  const ids = SPECTATOR_PEOPLE.map(p => p.id.replace(/^spectator:/, '')), at = (id: string) => SPECTATOR_PEOPLE[ids.indexOf(id)]!;
  for (const id of ['spec_teen_boy', 'spec_teen_girl', 'spec_k_boy_cap', 'spec_k_girl_pigtails']) assert.ok(ids.includes(id), `${id} is not a spectator`);
  assert.ok(ids.every(id => id.startsWith('spec_')), `only spec_* are spectators: ${ids.join(' ')}`);
  for (const p of SPECTATOR_PEOPLE) assert.ok(p.seat > 0.25 && p.seat < p.m / 2, `${p.id}: seat ${p.seat} m for ${p.m} m tall`);
  for (const kid of ['spec_k_boy_cap', 'spec_k_girl_pigtails']) {
    assert.ok(at(kid).m < 1.45 && at(kid).h < at('spec_teen_boy').h, `${kid} is a child's height`);
    assert.ok(at(kid).seat < at('spec_teen_boy').seat, `${kid} sits lower than a teen`);
  }
  // twenty full greens: every person shows up somewhere (the seeded pick spreads over the whole table)
  const out: CrowdPerson[] = [], seen = new Set<number>();
  for (let spot = 0; spot < 20; spot++) { const n = galleryPeople(spotBuf(0, 60), 0, spot, 10, PEOPLE, out); for (let s = 0; s < n; s++) seen.add(out[s]!.person); }
  assert.equal(seen.size, PEOPLE, `people shown: ${seen.size} of ${PEOPLE}`);
});
