// T320 (#908, the owner 2026-11-03: "Slow speed for watching"): speeds below 1x. At the watching speed the everyday golfers on the 10-minute day are
// shown at a natural pace (the pacers' caps hold in real seconds below 1x: play/pacer.ts setPaceSpeed); the watch mode's speed switch (golf/watch.ts
// WatchSpeed) on following and back; the sim worker's steps below 1x (StepClock): the same steps as at 1x, spread over the frames, no drift.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import type { CourseView, Lie, PlayHole, Pt } from '../src/game/golf/play';
import { dayPlan, dayRoster } from '../src/game/golf/everyday';
import { DayView } from '../src/game/golf/everydayview';
import { CART_CAP, WALK_CAP } from '../src/game/golf/pace';
import { capScale, setPaceSpeed } from '../src/game/golf/play/pacer';
import { SPEEDS, StepClock, WATCH_SPEED, WatchSpeed, speedLabel } from '../src/game/golf/watch';

const PARS: (3 | 4 | 5)[] = [3, 4, 4, 5, 3, 4, 4, 4, 5, 4, 3, 4, 4, 4, 5, 4, 4, 5];
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}
/** a routed synthetic course: the holes go out and back, so each tee is near the green before (a real course's walk, ~3,500 tiles a round) */
function course(): CourseView {
  const holes: PlayHole[] = PARS.map((par, h) => {
    const L = (par === 3 ? 160 : par === 4 ? 380 : 500) / TILE_M, y = 20 + 60 * h, east = h % 2 === 0, x0 = east ? 10 : 260;
    const tee = { x: x0, y }, pin = { x: east ? x0 + L : x0 - L, y };
    return { n: h + 1, par, tee, pin, line: [tee, pin] };
  });
  const lieAt = (x: number, y: number): Lie => {
    for (const h of holes) if (Math.hypot(x - h.pin.x, y - h.pin.y) <= 6) return 'green';
    let d = Infinity;
    for (const h of holes) d = Math.min(d, segDist({ x, y }, h.tee, h.pin));
    return d <= 7.5 ? 'fairway' : d <= 40 ? 'rough' : 'out';
  };
  return { holes, lieAt };
}
/** the 10-minute town day's golf hours: town minutes a sim second */
const RATE = 1.5;

/** an hour of everyday golf at game speed k, 60 frames a real second: each walker's speed on screen in tiles a REAL second. Returns the moving
 *  person-frames' speeds, of the golfers who walk the round (no cart), and the longest run of frames (real s) a golfer was over `over` tiles/s */
function hour(k: number, over: number, from = 400, to = 460) {
  setPaceSpeed(k);
  try {
    const VIEW = course(), r = dayRoster(12345, 5, { quality: 80, rep: 50, holes: 18 }), plan = dayPlan(VIEW, r);
    const bays = Array.from({ length: 40 }, (_, i) => ({ x: -20 + (i % 10) * 1.25, y: -10 - Math.floor(i / 10) * 2.5, hx: 0, hy: 1 }));
    const v = new DayView(plan, r, VIEW, { door: { x: -5, y: 0 }, bays, entrance: { x: -25, y: -5 } }, null, { walk: WALK_CAP, cart: CART_CAP, car: 4.5 });
    const n = plan.golfers.length, lx = new Float64Array(n).fill(NaN), ly = new Float64Array(n).fill(NaN), run = new Float64Array(n), seen = new Uint8Array(n), DT = 1 / 60;
    const speeds: number[] = []; let longest = 0, overF = 0;
    let now = 0, simT = 0;
    for (let minute = from; minute < to; minute += DT * k * RATE) {
      v.update(minute, now, -1e4, -1e4, 1e4, 1e4, simT, RATE);
      seen.fill(0);
      for (const p of v.people) {
        const id = p.golfer; seen[id] = 1;
        if (plan.golfers[id]!.cart !== undefined) continue;
        if (Number.isFinite(lx[id]!)) {
          const s = Math.hypot(p.x - lx[id]!, p.y - ly[id]!) / DT;
          if (s > 0.05) speeds.push(s);
          if (s > over) { overF++; run[id]! += DT; longest = Math.max(longest, run[id]!); } else run[id] = 0;
        }
        lx[id] = p.x; ly[id] = p.y;
      }
      for (let id = 0; id < n; id++) if (!seen[id]) { lx[id] = NaN; run[id] = 0; }
      now += DT; simT += DT * k;
    }
    speeds.sort((a, b) => a - b);
    return { speeds, longest, overF, q: (f: number) => speeds[Math.floor(f * (speeds.length - 1))] ?? 0 };
  } finally { setPaceSpeed(1); }
}

test('T320: at the watching speed no everyday walker is shown above the walk cap (a 20% allowance for catching up, never for long)', () => {
  const o = hour(WATCH_SPEED, WALK_CAP * 1.2);
  assert.ok(o.speeds.length > 10000, `${o.speeds.length} moving person-frames`);
  assert.ok(o.q(0.5) <= WALK_CAP, `median ${o.q(0.5).toFixed(2)} tiles a real second (cap ${WALK_CAP})`);
  assert.ok(o.q(0.9) <= WALK_CAP * 1.15, `p90 ${o.q(0.9).toFixed(2)}`);
  assert.equal(o.overF, 0, `person-frames over 1.2x the cap (longest run ${o.longest.toFixed(2)} s)`);
});

test('T320: 1x is as T294 had it (the caps a sim second), and slower speeds show the golfers slower on screen', () => {
  setPaceSpeed(1); assert.equal(capScale(), 1);
  setPaceSpeed(20); assert.equal(capScale(), 1);
  setPaceSpeed(0); assert.equal(capScale(), 1);
  setPaceSpeed(1 / 16); assert.equal(capScale(), 16);
  setPaceSpeed(1);
  const a = hour(1 / 16, Infinity, 425, 445), b = hour(WATCH_SPEED, Infinity, 425, 445);
  assert.ok(b.q(0.5) < a.q(0.5), `median at 1/40x ${b.q(0.5).toFixed(2)} below 1/16x's ${a.q(0.5).toFixed(2)}`);
});

test('T320: the speed bar: below 1x down to the watching speed, the labels', () => {
  assert.deepEqual(SPEEDS, [WATCH_SPEED, 1 / 16, 1 / 4, 1 / 2, 1, 2, 4, 8, 20]);
  assert.equal(speedLabel(1 / 16), '1/16'); assert.equal(speedLabel(WATCH_SPEED), '1/40'); assert.equal(speedLabel(20), '20');
});

test('T320: following switches to the watching speed and leaving returns to the speed before', () => {
  const w = new WatchSpeed();
  assert.equal(w.set('follow', true, 4), WATCH_SPEED); assert.ok(w.on);
  assert.equal(w.set('follow', false, WATCH_SPEED), 4); assert.ok(!w.on);
  // the owner's round and a follow together: the speed comes back only when both are over
  assert.equal(w.set('own', true, 2), WATCH_SPEED);
  assert.equal(w.set('follow', true, WATCH_SPEED), null);
  assert.equal(w.set('own', false, WATCH_SPEED), null);
  assert.equal(w.set('follow', false, WATCH_SPEED), 2);
  // a speed the player chose while watching stands
  w.set('follow', true, 8);
  assert.equal(w.set('follow', false, 1), null);
  // already at the watching speed: no change either way
  assert.equal(w.set('follow', true, WATCH_SPEED), null);
  assert.equal(w.set('follow', false, WATCH_SPEED), null);
});

test('T320: the worker steps below 1x: the same steps over 1/k frames, no drift; 1x and faster unchanged', () => {
  for (const k of [1, 2, 4, 8, 20, 0]) { const c = new StepClock(); assert.equal(c.take(k), k); }
  for (const k of [1 / 2, 1 / 4, 1 / 16, WATCH_SPEED]) {
    const c = new StepClock(), frames = Math.round(1000 / k); let steps = 0, gaps = 0, last = -1;
    for (let f = 0; f < frames; f++) { const n = c.take(k); assert.ok(n === 0 || n === 1); if (n) { if (last >= 0) gaps = Math.max(gaps, f - last); last = f; steps += n; } }
    assert.equal(steps, 1000, `1000 steps in ${frames} frames at ${k}`);
    assert.ok(gaps <= Math.ceil(1 / k), `steps evenly spread (largest gap ${gaps} frames)`);
  }
});
