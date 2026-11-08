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

/** a walker buffer of one group at (10, 10) heading for (tx, ty): x, y, n, stage, tx, ty, id (the 7 floats of event/crowd.ts WALK_STRIDE) */
const walkBuf = (n: number, tx: number, ty: number, id = 4): Float32Array => Float32Array.of(10, 10, n, 3, tx, ty, id);

test('walkerPeople: min(n, 3) people facing the heading, on the walk frames, together near the party\'s point; none with no people or no fans', () => {
  const out: CrowdPerson[] = [];
  assert.equal(walkerPeople(walkBuf(5, 20, 10), 0, 0, 1, PEOPLE, out), 3, 'min(n, 3)');
  assert.equal(walkerPeople(walkBuf(2, 20, 10), 0, 0, 1, PEOPLE, out), 2);
  assert.equal(walkerPeople(walkBuf(1, 20, 10), 0, 0, 1, PEOPLE, out), 1);
  assert.equal(walkerPeople(walkBuf(0.4, 20, 10), 0, 0, 1, PEOPLE, out), 0, 'no fans');
  assert.equal(walkerPeople(walkBuf(3, 20, 10), 0, 0, 1, 0, out), 0, 'no people');
  for (const now of [0, 0.7, 3.3, 19, 240.2]) {
    const k = walkerPeople(walkBuf(3, 20, 10), 0, 0, now, PEOPLE, out);
    assert.equal(k, 3);
    // heading +x: screen right-down (SE, row 7)
    for (let j = 0; j < k; j++) {
      const p = out[j]!;
      assert.equal(p.row, 7, 'faces +x');
      assert.ok(p.frame >= 1 && p.frame <= 8, `a walk frame: ${p.frame}`);
      assert.ok(Math.hypot(p.x - 10, p.y - 10) < 1.5, `a party keeps together: (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) at ${now} s`);
    }
  }
  walkerPeople(walkBuf(3, 10, 10), 0, 0, 1, PEOPLE, out);
  assert.equal(out[0]!.row, 0, 'no heading: the diagonal toward the screen bottom');
});

test('walkerPeople (T377, #1033: "spectators walking in step, 3 at a time"): the three of a party are not in step: each has his own pace, phase and place, and the places drift', () => {
  const out: CrowdPerson[] = [];
  // the phase: all three on one frame in only a few of the samples (one phase for the party was every sample)
  let same = 0, samples = 0, worst = 0;
  for (let id = 1; id <= 60; id++) {
    let here = 0, n = 0;
    for (let t = 0; t < 40; t += 0.37) {
      walkerPeople(walkBuf(3, 20, 10, id), 0, 0, t, PEOPLE, out); samples++; n++;
      if (out[0]!.frame === out[1]!.frame && out[1]!.frame === out[2]!.frame) { same++; here++; }
    }
    worst = Math.max(worst, here / n);
  }
  console.log(`# the three of a party on one frame: ${(100 * same / samples).toFixed(1)}% of ${samples} samples (the party with most: ${(100 * worst).toFixed(0)}%); the old drawing: 100%`);
  assert.ok(same / samples < 0.06, `all three on one frame in ${(100 * same / samples).toFixed(1)}% of the samples`);
  assert.ok(worst < 0.6, `no party stays in step: its worst ${(100 * worst).toFixed(0)}%`);
  // the pace: the walk loop at 0.85 to 1.15 of its rate, a person's own (frames wrapping 8 to 1 over 28 s: 20 loops at the clip's own rate)
  const loops = (id: number, j: number): number => { let w = 0, prev = -1; for (let t = 0; t < 28; t += 0.02) { walkerPeople(walkBuf(3, 20, 10, id), 0, 0, t, PEOPLE, out); const f = out[j]!.frame; if (prev === 8 && f === 1) w++; prev = f; } return w; };
  const counts: number[] = []; for (let id = 1; id <= 20; id++) for (let j = 0; j < 3; j++) counts.push(loops(id, j));
  assert.ok(counts.every(c => c >= 16 && c <= 24), `every person walks at 0.85 to 1.15 of the clip's rate: ${counts.join(' ')} loops in 28 s`);
  assert.ok(Math.max(...counts) - Math.min(...counts) >= 3, `and the paces differ from person to person: ${Math.min(...counts)} to ${Math.max(...counts)} loops`);
  // the places: along the heading and across it a person drifts (a minute covers whole periods of the drift), and the three are not on a line of fixed spacing
  for (let id = 1; id <= 20; id++) {
    let a0 = Infinity, a1 = -Infinity, c0 = Infinity, c1 = -Infinity;
    for (let t = 0; t < 60; t += 0.1) { walkerPeople(walkBuf(3, 20, 10, id), 0, 0, t, PEOPLE, out); const p = out[1]!; a0 = Math.min(a0, p.x - 10); a1 = Math.max(a1, p.x - 10); c0 = Math.min(c0, p.y - 10); c1 = Math.max(c1, p.y - 10); }
    assert.ok(a1 - a0 >= 0.8, `party ${id}: his place along the heading drifts ${(a1 - a0).toFixed(2)} tiles`);
    assert.ok(c1 - c0 >= 0.25, `party ${id}: and across it ${(c1 - c0).toFixed(2)} tiles`);
  }
  const gaps = new Set<string>();
  for (let id = 1; id <= 30; id++) { walkerPeople(walkBuf(3, 20, 10, id), 0, 0, 5, PEOPLE, out); gaps.add((out[2]!.y - out[0]!.y).toFixed(3)); }
  assert.ok(gaps.size >= 28, `the spread of a party differs from party to party (${gaps.size} different in 30)`);
});

test('walkerPeople (T377): a person is the same person from frame to frame (the walker\'s own id seeds him, not its place in the buffer); every person of the roster walks', () => {
  const a: CrowdPerson[] = [], b: CrowdPerson[] = [], other = walkBuf(3, 20, 10, 9);
  // the same group in the buffer's first and third place: the same people, the same places and frames
  const two = Float32Array.of(...walkBuf(2, 30, 30, 8), ...walkBuf(3, 20, 10, 4)), three = Float32Array.of(...walkBuf(1, 30, 30, 7), ...walkBuf(2, 30, 30, 6), ...walkBuf(3, 20, 10, 4));
  const ka = walkerPeople(two, 7, 1, 6.5, PEOPLE, a), kb = walkerPeople(three, 14, 2, 6.5, PEOPLE, b);
  assert.equal(ka, kb);
  for (let j = 0; j < ka; j++) assert.deepEqual({ ...a[j]! }, { ...b[j]! }, `person ${j}`);
  // another group is other people in other places
  const c: CrowdPerson[] = []; walkerPeople(other, 0, 0, 6.5, PEOPLE, c);
  assert.ok(a.some((p, j) => p.person !== c[j]!.person || p.frame !== c[j]!.frame || Math.abs(p.x - c[j]!.x) > 1e-6), 'group 9 is not group 4');
  const seen = new Set<number>();
  for (let id = 1; id <= 400; id++) { const n = walkerPeople(walkBuf(3, 20, 10, id), 0, 0, 1, PEOPLE, a); for (let j = 0; j < n; j++) seen.add(a[j]!.person); }
  assert.equal(seen.size, PEOPLE, 'the whole roster walks');
  // the old 6-float buffer (x, y, n, stage, tx, ty) still reads, the buffer index its seed
  const old = Float32Array.of(10, 10, 3, 3, 20, 10), k6 = walkerPeople(old, 0, 4, 6.5, PEOPLE, c, 6), k7 = walkerPeople(walkBuf(3, 20, 10, 4), 0, 0, 6.5, PEOPLE, a);
  assert.equal(k6, k7);
  for (let j = 0; j < k6; j++) assert.deepEqual({ ...c[j]! }, { ...a[j]! }, `the old buffer, person ${j}`);
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
