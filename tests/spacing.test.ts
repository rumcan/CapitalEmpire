// T312: people step round each other (src/game/spacing.ts): the drawn offset layer. Two walkers on head-on and crossing paths never come within
// 2r, a packed gallery (crowdview's galleryPeople) has no overlaps, a golfer at address is never moved, and the offset eases back to none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERSON_R, PeopleSpacer, personLook, personPinned, spacePeople } from '../src/game/spacing';
import { galleryPeople, type CrowdPerson } from '../src/game/crowdview';
import { GOLFER_BASE, GOLFER_CLIPS, GOLFER_FRAMES, SPECTATOR_BASE, SPECTATOR_PEOPLE, WALK_DIRS } from '../src/game/library';
import type { Drawable } from '../src/game/sprites';

const DT = 1 / 60, R2 = 2 * PERSON_R, WALK = 0.7; // tiles/s (1.4 m/s)

/** walkers a and b moving from their starts at their velocities for `secs`; returns the least drawn distance and the drawn points' largest jump a frame */
function run(a: { x: number; y: number; vx: number; vy: number; pin?: boolean }, b: { x: number; y: number; vx: number; vy: number; pin?: boolean }, secs: number, look = [1, 2]) {
  const sp = new PeopleSpacer();
  let least = Infinity, jump = 0, last: number[] | null = null, aOff = 0;
  for (let f = 0; f * DT < secs; f++) {
    const t = f * DT, ax = a.x + a.vx * t, ay = a.y + a.vy * t, bx = b.x + b.vx * t, by = b.y + b.vy * t;
    sp.begin(); sp.add(ax, ay, look[0]!, 0, !!a.pin); sp.add(bx, by, look[1]!, 0, !!b.pin); sp.solve(f ? DT : 0);
    const p = [ax + sp.ox[0]!, ay + sp.oy[0]!, bx + sp.ox[1]!, by + sp.oy[1]!];
    least = Math.min(least, Math.hypot(p[2]! - p[0]!, p[3]! - p[1]!));
    aOff = Math.max(aOff, Math.hypot(sp.ox[0]!, sp.oy[0]!));
    if (last) for (let k = 0; k < 4; k += 2) jump = Math.max(jump, Math.hypot(p[k]! - last[k]! - (k ? b.vx : a.vx) * DT, p[k + 1]! - last[k + 1]! - (k ? b.vy : a.vy) * DT));
    last = p;
  }
  return { least, jump, aOff, sp };
}

test('two walkers head on never come within 2r, and pass without a jump', () => {
  const r = run({ x: 0, y: 0, vx: WALK, vy: 0 }, { x: 6, y: 0, vx: -WALK, vy: 0 }, 9);
  assert.ok(r.least >= R2 - 1e-6, `head on: ${r.least.toFixed(3)} < ${R2}`);
  assert.ok(r.jump < 0.05, `a jump of ${r.jump.toFixed(3)} tiles in a frame`);
  // slightly off the same line, and the same look (two people of one art)
  const s = run({ x: 0, y: 0.05, vx: WALK, vy: 0 }, { x: 6, y: 0, vx: -WALK, vy: 0 }, 9, [3, 3]);
  assert.ok(s.least >= R2 - 1e-6, `near head on: ${s.least.toFixed(3)}`);
});

test('two walkers on crossing paths never come within 2r', () => {
  for (const lag of [0, 0.1, 0.25, 0.5]) {
    const r = run({ x: -3, y: 0, vx: WALK, vy: 0 }, { x: 0, y: -3 - lag, vx: 0, vy: WALK }, 10);
    assert.ok(r.least >= R2 - 1e-6, `crossing (lag ${lag}): ${r.least.toFixed(3)}`);
    assert.ok(r.jump < 0.05, `crossing (lag ${lag}): a jump of ${r.jump.toFixed(3)}`);
  }
  // diagonal, and one overtaking another (twice his speed)
  const d = run({ x: -3, y: -3, vx: WALK * 0.7, vy: WALK * 0.7 }, { x: 3, y: -3, vx: -WALK * 0.7, vy: WALK * 0.7 }, 10);
  assert.ok(d.least >= R2 - 1e-6, `diagonal: ${d.least.toFixed(3)}`);
  const o = run({ x: -4, y: 0, vx: WALK * 2, vy: 0 }, { x: 0, y: 0, vx: WALK, vy: 0 }, 8);
  assert.ok(o.least >= R2 - 1e-6, `overtaking: ${o.least.toFixed(3)}`);
});

test('a golfer at address is never moved: the walker steps round him', () => {
  const r = run({ x: 0, y: 0, vx: 0, vy: 0, pin: true }, { x: -4, y: 0.02, vx: WALK, vy: 0 }, 12);
  assert.equal(r.aOff, 0, 'the golfer moved off his ball');
  assert.ok(r.least >= R2 - 1e-6, `the walker came within ${r.least.toFixed(3)}`);
  // the swing and putt frames pin, the walk does not
  const g = (f: number) => GOLFER_BASE + (2 * WALK_DIRS.length + 3) * GOLFER_FRAMES + f;
  assert.ok(personPinned(g(GOLFER_CLIPS.golf_drive.start + 4)) && personPinned(g(GOLFER_CLIPS.golf_putt.start + 1)));
  assert.ok(!personPinned(g(GOLFER_CLIPS.walk.start + 2)) && !personPinned(g(GOLFER_CLIPS.idle.start)));
  assert.ok(personLook(g(1)) >= 0 && personLook(g(1)) === personLook(g(GOLFER_CLIPS.golf_drive.start)));
  assert.equal(personLook(5), -1);
});

test('after the pass the offset eases back to none', () => {
  const r = run({ x: 0, y: 0, vx: WALK, vy: 0 }, { x: 4, y: 0, vx: -WALK, vy: 0 }, 14);
  assert.ok(Math.hypot(r.sp.ox[0]!, r.sp.oy[0]!) < 0.01 && Math.hypot(r.sp.ox[1]!, r.sp.oy[1]!) < 0.01, 'still offset long after the pass');
});

test('a packed gallery and grandstand have no overlaps, and stand still once spaced', () => {
  for (const kind of [0, 2]) {
    const G = [10, 10, 60, kind, 14, 10, 0, 0], P: CrowdPerson[] = [], n = galleryPeople(G, 0, 3, 1.5, SPECTATOR_PEOPLE.length, P);
    const D: Drawable[] = P.slice(0, n).map(p => ({ item: SPECTATOR_BASE + (p.person * WALK_DIRS.length + p.row) * 25 + p.frame, x: p.x, y: p.y, flip: false, scale: 1, x0: 0, y0: 0, x1: 0, y1: 0 }));
    const sp = new PeopleSpacer(), refs: Drawable[] = [];
    let close = 0, moved = 0;
    for (let f = 0; f < 90; f++) {
      const prev = D.map(d => [d.x, d.y]);
      P.slice(0, n).forEach((p, k) => { D[k]!.x = p.x; D[k]!.y = p.y; });
      spacePeople(sp, [D], f ? DT : 0, refs);
      if (f === 89) {
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (Math.hypot(D[i]!.x - D[j]!.x, D[i]!.y - D[j]!.y) < R2 - 1e-6) close++;
        moved = Math.max(...D.map((d, k) => Math.hypot(d.x - prev[k]![0]!, d.y - prev[k]![1]!)));
      }
    }
    assert.equal(close, 0, `${kind ? 'grandstand' : 'gallery'}: ${close} pairs inside 2r`);
    assert.ok(moved < 0.005, `${kind ? 'grandstand' : 'gallery'}: still shuffling (${moved.toFixed(4)} tiles a frame)`);
  }
});
