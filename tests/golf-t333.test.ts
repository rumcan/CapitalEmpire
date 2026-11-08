// T333 (#959; the owner, 2026-11-04: "i added height to this green but i see nothing showing a grid with the slip for the putt. i also telport and
// dispear"). The break grid on a green raised by hand and in every kind of round (green.ts breakPinOf, FLAT_SLOPE); you moving continuously in your
// round (play/jumpfx.ts: the walk up to the address, the jump's fade and dust puff) and never nudged by the people spacer (spacing.ts, Drawable.pin).
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCourseHeightBrush, createCourseHeightField, sampleCourseGrid } from '../src/game/ext/course-height';
import { BREAK_STEP, breakBucket, breakPinOf, buildBreakGrid, type BreakTurn } from '../src/game/golf/play/green';
import { ADDRESS_PACE, JUMP_FADE_S, PUFF_S, jumpAlpha, livePuffs, puffAt, stepToward } from '../src/game/golf/play/jumpfx';
import { ADDRESS_BACK, SNAP_TILES, addressOf } from '../src/game/golf/play/yours';
import { PERSON_R, PeopleSpacer, spacePeople } from '../src/game/spacing';
import { GOLFER_BASE, GOLFER_CLIPS, GOLFER_FRAMES, WALK_DIRS } from '../src/game/library';
import type { Drawable } from '../src/game/sprites';

/** the arrows (every second lattice point, as the engine draws them) of a green round (cx, cy) of radius gr on field f, by colour bucket */
function arrows(f: ReturnType<typeof createCourseHeightField>, cx: number, cy: number, gr: number): number[] {
  const g = buildBreakGrid((x, y) => sampleCourseGrid(f.data, x, y), (x, y) => Math.hypot(x - cx, y - cy) <= gr, cx, cy, gr + 2);
  const b = [0, 0, 0, 0];
  for (let k = 0; k < g.n; k++) { if ((g.ij[2 * k]! & 1) || (g.ij[2 * k + 1]! & 1)) continue; b[breakBucket(g.pts[5 * k + 4]!)]!++; }
  return b;
}

test('a putt on a green raised by hand shows break arrows: the default brush, and a gentle wide raise', () => {
  const cx = 400.5, cy = 400.5;
  // the height tool's default dab (radius 6, level 2: 0.2 m) dragged over one side of the green
  const f = createCourseHeightField();
  for (let k = 0; k < 4; k++) applyCourseHeightBrush(f, { x: cx + 5, y: cy - 4 + k * 2, radiusTiles: 6, mode: 'raise', strength: 0.2 });
  const a = arrows(f, cx, cy, 10), moving = a[1]! + a[2]! + a[3]!;
  assert.ok(moving > 20, `default brush: ${a.join('/')} (flat/gentle/firm/steep)`);
  assert.ok(a[2]! + a[3]! > 0, 'a hand-made bank reads as firm or steep');
  // one gentle wide dab (radius 20, level 1: 0.1 m; at most 0.37% on the green): under the old flat line (0.4%) every point was a still dot
  const w = createCourseHeightField();
  applyCourseHeightBrush(w, { x: cx + 8, y: cy, radiusTiles: 20, mode: 'raise', strength: 0.1 });
  const b = arrows(w, cx, cy, 10);
  assert.ok(b[1]! + b[2]! + b[3]! > 0.5 * (b[0]! + b[1]! + b[2]! + b[3]!), `gentle wide raise: ${b.join('/')}`);
  // the green raised until it clamps (+3 m) is flat on top: no arrows there (the field's truth), and the lattice is still a grid
  assert.equal(BREAK_STEP, 0.5);
});

test('the break grid shows in every kind of round you play: your walk-on round, a match, the tournament', () => {
  const pin = { x: 10, y: 20 }, base: BreakTurn = { pin, club: null, putting: false, flying: false, onGreen: false, holed: false };
  // the tournament's open shot with the putter (it has no walk-on round: before T333 no grid showed)
  assert.deepEqual(breakPinOf({ ...base, club: 'putter', onGreen: true }), pin);
  // your ball at rest on the green, no shot open yet (walking up to it)
  assert.deepEqual(breakPinOf({ ...base, onGreen: true }), pin);
  // a putt rolling (it holds while a holed putt drops)
  assert.deepEqual(breakPinOf({ ...base, putting: true, holed: true }), pin);
  // not for a full shot, a chip in the air, a hole done, nor off the green
  assert.equal(breakPinOf({ ...base, club: 'pw', onGreen: true }), null);
  assert.equal(breakPinOf({ ...base, flying: true, onGreen: true }), null);
  assert.equal(breakPinOf({ ...base, holed: true, onGreen: true }), null);
  assert.equal(breakPinOf({ ...base }), null);
  assert.equal(breakPinOf(null), null);
});

test('the walk up to the address: from SNAP_TILES out you never move more than a step a frame (no snap)', () => {
  const ball = { x: 50, y: 50 }, aim = { x: 80, y: 50 }, a = addressOf(ball, aim), dt = 1 / 60, WALK = 0.7; // tiles/s (a person's walk)
  const you = { x: ball.x - SNAP_TILES + 0.01, y: ball.y + 0.3 };
  let worst = 0, n = 0;
  while (stepToward(you, a, WALK * dt) > 0 && n < 10000) { n++; }
  // the same walk measured frame by frame
  const p = { x: ball.x - SNAP_TILES + 0.01, y: ball.y + 0.3 };
  for (let k = 0; k < n + 2; k++) { const x = p.x, y = p.y; stepToward(p, a, WALK * dt); worst = Math.max(worst, Math.hypot(p.x - x, p.y - y)); }
  assert.ok(worst <= WALK * dt + 1e-9, `a step of ${worst} tiles`);
  assert.ok(Math.hypot(p.x - a.x, p.y - a.y) < 1e-9, 'at the address in the end');
  assert.ok(n > 60, `it takes a while (${n} frames), not one`);
  // a new aim behind you: you shuffle round the ball at ADDRESS_PACE, not in one frame (2 * ADDRESS_BACK across)
  const b = addressOf(ball, { x: 20, y: 50 }); let frames = 0;
  while (stepToward(p, b, ADDRESS_PACE * dt) > 0) frames++;
  assert.ok(frames >= Math.floor(2 * ADDRESS_BACK / (ADDRESS_PACE * dt)) - 1, `${frames} frames round the ball`);
});

test('a jump fades in with a dust puff, then is gone', () => {
  assert.equal(jumpAlpha(-Infinity), 1); assert.equal(jumpAlpha(Infinity), 1); assert.equal(jumpAlpha(NaN), 1);
  assert.equal(jumpAlpha(0), 0);
  let last = -1; for (let t = 0; t <= JUMP_FADE_S; t += 0.01) { const a = jumpAlpha(t); assert.ok(a >= last); last = a; }
  assert.equal(jumpAlpha(JUMP_FADE_S), 1);
  const rings: { r: number; a: number }[] = [];
  assert.ok(puffAt(0.1, rings).length > 0); assert.ok(rings.every(g => g.a > 0 && g.a <= 1 && g.r > 0));
  assert.equal(puffAt(PUFF_S, rings).length, 0); assert.equal(puffAt(-1, rings).length, 0);
  const P = [{ x: 0, y: 0, at: 0 }, { x: 1, y: 1, at: 1000 }];
  assert.equal(livePuffs(P, 1000 + PUFF_S * 1000 - 1).length, 1); assert.equal(P[0]!.at, 1000);
});

test('you are never nudged by the people spacer: a townsperson walking into you steps round you', () => {
  const NW = WALK_DIRS.length, youItem = GOLFER_BASE + (0 * NW + 2) * GOLFER_FRAMES + GOLFER_CLIPS.walk.start; // (a walking frame: not pinned by its clip)
  const mk = (item: number, x: number, y: number, pin?: boolean): Drawable => ({ item, x, y, flip: false, scale: 1, x0: x - 0.12, y0: y - 0.12, x1: x + 0.12, y1: y + 0.12, ...(pin ? { pin } : {}) });
  const sp = new PeopleSpacer(), refs: Drawable[] = [], other = GOLFER_BASE + (1 * NW + 2) * GOLFER_FRAMES + GOLFER_CLIPS.walk.start;
  let moved = 0, least = Infinity;
  for (let f = 0; f < 240; f++) {
    const t = f / 60, you = mk(youItem, 5 + 0.5 * t, 5, true), them = mk(other, 9 - 0.5 * t, 5.02);
    spacePeople(sp, [[you, them]], f ? 1 / 60 : 0, refs);
    moved = Math.max(moved, Math.hypot(you.x - (5 + 0.5 * t), you.y - 5));
    least = Math.min(least, Math.hypot(them.x - you.x, them.y - you.y));
  }
  assert.equal(moved, 0, `you were nudged ${moved} tiles`);
  assert.ok(least >= 2 * PERSON_R - 1e-6, `they came within ${least.toFixed(3)} of you`);
});
