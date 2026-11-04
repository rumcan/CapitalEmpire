// T319 (#905): the break grid's fall, the cup's speed window, a putt breaking on a slope and holing or lipping out, the tracer's bend and life.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BREAK_STEP, CAPTURE_MS, CUP_DROP, CUP_EDGE_M, CUP_HOLD_S, CUP_LIP, CUP_NONE, CUP_SHAVE, PuttRoll, TRACER_FADE_S, TRACER_HOLD_S, breakAt, breakBucket,
  buildBreakGrid, captureSpeed, cupFate, loadBreakMode, loadTracers, saveBreakMode, saveTracers, shotBend, shotPoint, shotShape, speedLeft, tracerAlpha, tracerGone,
} from '../src/game/golf/play/green';
import { cupTime, flightOf, yourBallAt } from '../src/game/golf/play/yours';
import { TILE_M } from '../src/game/golf/types';

/** a green falling 2% toward +y (metres per metre; tiles of TILE_M) */
const tilt = (x: number, y: number) => -0.02 * y * TILE_M + 0 * x;
const row = { i: 0, n: 1, par: 4, strokes: 2, putts: 1, pen: 0, done: true };

test('the break grid points downhill from a known slope, as steep as it is', () => {
  const b = breakAt(tilt, 10, 10);
  assert.ok(Math.abs(b.dx) < 1e-9 && Math.abs(b.dy - 1) < 1e-9, 'downhill is +y');
  assert.ok(Math.abs(b.s - 0.02) < 1e-9, '2%');
  const d = breakAt((x, y) => 0.03 * (x + y) * TILE_M, 0, 0);
  assert.ok(Math.abs(d.dx + Math.SQRT1_2) < 1e-9 && Math.abs(d.dy + Math.SQRT1_2) < 1e-9, 'diagonal uphill +x+y: downhill -x-y');
  assert.deepEqual(breakAt(null, 0, 0), { dx: 0, dy: 0, s: 0 });
  assert.equal(breakBucket(0.001), 0); assert.equal(breakBucket(0.03), 3);
});

test('the break grid covers only the green, on its lattice', () => {
  const g = buildBreakGrid(tilt, (x, y) => Math.hypot(x - 50, y - 50) <= 5, 50, 50, 22);
  assert.ok(g.n > 300 && g.n < 400, `about pi 10^2 points (${g.n})`);
  for (let k = 0; k < g.n; k++) {
    const x = g.pts[5 * k]!, y = g.pts[5 * k + 1]!;
    assert.ok(Math.hypot(x - 50, y - 50) <= 5); assert.equal(x, g.ij[2 * k]! * BREAK_STEP);
    assert.ok(Math.abs(g.pts[5 * k + 3]! - 1) < 1e-6, 'all fall +y');
  }
});

test('the cup: drops within the speed window, lips out above it, the window narrows to the rim', () => {
  assert.equal(cupFate(1.0, 0), 'drop');
  assert.equal(cupFate(CAPTURE_MS + 0.05, 0), 'lip');
  assert.equal(cupFate(0.3, CUP_EDGE_M + 0.001), 'miss');
  assert.ok(captureSpeed(0.05) < captureSpeed(0.01) && captureSpeed(CUP_EDGE_M) === 0);
  assert.equal(cupFate(1.0, 0.06), 'lip', 'near the rim 1 m/s is too fast');
});

test('a holed putt breaks on the slope and reaches the cup inside the window, then drops', () => {
  const from = { x: 0, y: 0 }, pin = { x: 3, y: 0 }, p = new PuttRoll().set(from, pin, pin, true, tilt);
  assert.equal(p.fate, CUP_DROP);
  assert.equal(cupFate(p.vCup, 0), 'drop', 'in the window');
  const o = { x: 0, y: 0, h: 0 };
  p.at(0.5, o); assert.ok(o.y < -0.05, `starts above the line (uphill, -y) and breaks down (${o.y})`);
  p.at(1, o); assert.ok(Math.hypot(o.x - pin.x, o.y - pin.y) < 1e-9, 'ends in the cup');
  const f = flightOf(from, null, pin, true, false, row, false, { putt: p });
  assert.equal(f.hold, CUP_HOLD_S);
  const tc = cupTime(f)!; assert.ok(Math.abs(tc - (f.dur - f.hold)) < 1e-6, 'at the cup when the roll ends');
  f.t = f.dur - f.hold / 2; const b = yourBallAt(f); assert.ok(b.sink === 1 || b.sink > 0.5, 'dropping'); assert.ok(Math.hypot(b.x - 3, b.y) < 1e-9);
  // the speed falls along the way: a quarter of the time covers more than a quarter of the way
  assert.ok(p.share(0.25) > 0.25 && Math.abs(p.timeAt(p.share(0.4)) - 0.4) < 1e-9);
});

test('a putt that runs over the cup too fast lips out; a slow one shaves the rim (the model said it missed)', () => {
  const from = { x: 0, y: 0 }, pin = { x: 3, y: 0 };
  // 2 m past: speed at the cup sqrt(2 * 0.65 * 2) = 1.6 m/s, over the window: lips out, ends where the model said
  const fast = new PuttRoll().set(from, { x: 4, y: 0 }, pin, false, null);
  assert.equal(fast.fate, CUP_LIP); assert.ok(fast.vCup > CAPTURE_MS);
  const o = { x: 0, y: 0, h: 0 }; fast.at(fast.timeAt(fast.sCup), o); assert.ok(o.h > 0, 'it hops out');
  fast.at(1, o); assert.ok(Math.hypot(o.x - 4, o.y) < 1e-9);
  const f = flightOf(from, null, { x: 4, y: 0 }, false, false, row, false, { putt: fast }); assert.equal(f.hold, 0); assert.ok(cupTime(f)! > 0);
  // 0.3 m past: slow enough to drop, but it missed: its way is pushed off the cup to shave the rim
  const slow = new PuttRoll().set(from, { x: 3.15, y: 0 }, pin, false, null);
  assert.equal(slow.fate, CUP_SHAVE); assert.ok(speedLeft(0.3) < CAPTURE_MS);
  let best = Infinity; for (let k = 0; k <= 400; k++) { slow.at(k / 400, o); best = Math.min(best, Math.hypot(o.x - 3, o.y) * TILE_M); }
  assert.ok(best >= CUP_EDGE_M, `never over the cup (${best})`);
  slow.at(1, o); assert.ok(Math.hypot(o.x - 3.15, o.y) < 1e-9, 'ends where the model said');
  // a miss well wide never reaches the cup
  assert.equal(new PuttRoll().set(from, { x: 3.2, y: 1 }, pin, false, null).fate, CUP_NONE);
});

test('the tracer: a hook bends left of the aim, a slice right; it fades out after it lands', () => {
  const from = { x: 0, y: 0 }, aim = { x: 100, y: 0 };
  // left of a +x aim on screen (the tile frame keeps the screen's handedness, y down) is -y
  const hook = { x: 95, y: -20 }, slice = { x: 95, y: 20 };
  assert.ok(shotBend(from, aim, hook) < 0); assert.equal(shotShape(shotBend(from, aim, hook)), 'hook');
  assert.equal(shotShape(shotBend(from, aim, slice)), 'slice');
  assert.equal(shotShape(shotBend(from, aim, { x: 100, y: -5 })), 'draw');
  assert.equal(shotShape(shotBend(from, aim, { x: 100, y: 0.5 })), 'straight');
  // the flight starts along the aim and bends into the landing: at a quarter it is still close to the aim line
  const p = { x: 0, y: 0 }; shotPoint(from, aim, hook, 0.25, p); const q = { x: 0, y: 0 }; shotPoint(from, null, hook, 0.25, q);
  assert.ok(Math.abs(p.y) < Math.abs(q.y), 'curved, not straight to the landing');
  shotPoint(from, aim, hook, 1, p); assert.deepEqual(p, hook);
  assert.equal(tracerAlpha(-1), 1); assert.equal(tracerAlpha(TRACER_HOLD_S), 1);
  assert.ok(tracerAlpha(TRACER_HOLD_S + TRACER_FADE_S / 2) > 0.4 && tracerAlpha(TRACER_HOLD_S + TRACER_FADE_S / 2) < 0.6);
  assert.equal(tracerAlpha(TRACER_HOLD_S + TRACER_FADE_S), 0);
  assert.ok(!tracerGone(TRACER_HOLD_S) && tracerGone(TRACER_HOLD_S + TRACER_FADE_S));
});

test('the settings: the break grid when putting and tracers on by default, remembered', () => {
  const m = new Map<string, string>(), st = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
  assert.equal(loadBreakMode(st), 'putt'); assert.equal(loadTracers(st), true);
  saveBreakMode(st, 'always'); saveTracers(st, false);
  assert.equal(loadBreakMode(st), 'always'); assert.equal(loadTracers(st), false);
  assert.equal(loadBreakMode(null), 'putt');
});
