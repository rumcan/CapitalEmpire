// T294 (#879, the owner: "the people playing golf change their images to different people and they teleport and disappear while playing golf"):
// the everyday playback (golf/everydayview.ts DayView, golf/play/view.ts PlayView, golf/play/pacer.ts) on the watchable pace, frame by frame at
// 60 fps: every golfer id is drawn once a frame at most, never faded (T266 faded a golfer out and cut him to his walk's end on nearly every walk),
// moves continuously (no cut of more than a few tiles a frame), and while his schedule has him on the round in the box he stays drawn. Run over
// a box whose edge the groups cross (holes 1-4 of the synthetic course) and over the whole course, through walk deadlines (every address).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import type { CourseView, GolferState, Lie, PlayHole, Pt } from '../src/game/golf/play';
import { stateOne } from '../src/game/golf/play';
import { dayPlan, dayRoster } from '../src/game/golf/everyday';
import { DayView } from '../src/game/golf/everydayview';
import { CART_CAP, WALK_CAP } from '../src/game/golf/pace';

const PARS: (3 | 4 | 5)[] = [3, 4, 4, 5, 3, 4, 4, 4, 5, 4, 3, 4, 4, 4, 5, 4, 4, 5];
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}
/** the golf play tests' synthetic course: each hole on its own row */
function course(): CourseView {
  const holes: PlayHole[] = PARS.map((par, h) => {
    const y = 20 + 60 * h, tee = { x: 10, y }, pin = { x: 10 + (par === 3 ? 160 : par === 4 ? 380 : 500) / TILE_M, y };
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
const VIEW = course();
/** the 10-minute town day's golf hours: town minutes a sim second */
const RATE = 1.5;

/** a morning of everyday golf at `speed` (sim seconds a real second) in the box: the faded person-frames, the largest step of a golfer between
 *  two frames, the steps over JUMP tiles, the vanishings (a walker drawn last frame, not now, his schedule on the round in the box), the
 *  duplicates (an id drawn twice in a frame) */
function morning(speed: number, box: [number, number, number, number], from = 380, to = 600) {
  const r = dayRoster(12345, 5, { quality: 80, rep: 50, holes: 18 }), plan = dayPlan(VIEW, r);
  const bays = Array.from({ length: 40 }, (_, i) => ({ x: -20 + (i % 10) * 1.25, y: -10 - Math.floor(i / 10) * 2.5, hx: 0, hy: 1 }));
  const v = new DayView(plan, r, VIEW, { door: { x: -5, y: 0 }, bays, entrance: { x: -25, y: -5 } }, null, { walk: WALK_CAP, cart: CART_CAP, car: 4.5 });
  const n = plan.golfers.length, lx = new Float64Array(n).fill(NaN), ly = new Float64Array(n).fill(NaN), cnt = new Uint8Array(n), DT = 1 / 60;
  const st: GolferState = { golfer: 0, hole: 0, x: 0, y: 0, action: 'waiting', ball: null, flight: null, strokes: 0, toPar: 0, thru: 0 };
  const out = { faded: 0, maxStep: 0, jumps: 0, vanished: 0, dups: 0, drawn: 0, where: '' };
  let now = 0, simT = 0;
  for (let minute = from; minute < to; minute += DT * speed * RATE) {
    v.update(minute, now, box[0], box[1], box[2], box[3], simT, RATE);
    cnt.fill(0);
    for (const p of v.people) {
      const id = p.golfer; out.drawn++;
      if (++cnt[id]! > 1) out.dups++;
      if ((p.alpha ?? 1) < 1) out.faded++;
      if (Number.isFinite(lx[id]!)) {
        const d = Math.hypot(p.x - lx[id]!, p.y - ly[id]!);
        if (d > out.maxStep) { out.maxStep = d; out.where = `id ${id} at ${minute.toFixed(2)}`; }
        if (d > 3 * speed) out.jumps++;
      }
      lx[id] = p.x; ly[id] = p.y;
    }
    for (let id = 0; id < n; id++) {
      if (cnt[id]) continue;
      if (Number.isFinite(lx[id]!) && plan.golfers[id]!.cart === undefined) {
        const s = stateOne(plan, VIEW, id, minute, st);
        if (s.action !== 'done' && s.action !== 'waiting' && s.x >= box[0] && s.x <= box[2] && s.y >= box[1] && s.y <= box[3]) out.vanished++;
      }
      lx[id] = NaN; ly[id] = NaN;
    }
    now += DT; simT += DT * speed;
  }
  return out;
}

test('T294: across the box edge and every walk deadline, at 1x: no golfer faded, cut, lost or drawn twice', () => {
  for (const box of [[0, 0, 200, 250], [-100, -100, 2000, 2000]] as [number, number, number, number][]) {
    const o = morning(1, box);
    assert.ok(o.drawn > 1000, `${o.drawn} person-frames drawn`);
    assert.equal(o.dups, 0, 'an id drawn twice in a frame');
    assert.equal(o.faded, 0, 'person-frames faded (T266 faded and cut them to their walk\'s end)');
    assert.equal(o.vanished, 0, 'walkers gone while their round is in the box');
    // (a walk is spread over all the time the schedule gives him: a brisk walk mostly, a fast one when it must be; the old cuts were 50-200 tiles)
    assert.ok(o.maxStep < 20, `largest step ${o.maxStep.toFixed(1)} tiles (${o.where})`);
    assert.ok(o.jumps < o.drawn * 0.01, `${o.jumps} steps over 3 tiles of ${o.drawn}`);
  }
});

test('T294: at the fastest speed (20x) still no golfer faded, lost or drawn twice', () => {
  const o = morning(20, [0, 0, 200, 250]);
  assert.equal(o.dups, 0); assert.equal(o.faded, 0); assert.equal(o.vanished, 0);
});
