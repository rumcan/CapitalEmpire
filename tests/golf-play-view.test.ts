// The playback view (docs/GOLF-PLAY.md P2a, src/game/golf/play/view.ts): on a three-hole course with two golfers, a swing starts when its shot is crossed,
// a putt uses the address and takeaway frames, walking frames change with the time, a ball arcs and lands at the shot's end, nobody is drawn outside
// the tee window or after done, and update refills its arrays.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GOLFER_CLIPS } from '../src/game/library';
import { TILE_M } from '../src/game/golf/types';
import { PlayView, playRound, stateAt } from '../src/game/golf/play';
import type { CourseView, Golfer, Group, Lie, PlayHole, RoundPlan, Shot } from '../src/game/golf/play';

/** the pars of the three holes: a par 3 of 160 m, a par 4 of 380 m, a par 5 of 500 m */
const PARS: (3 | 4 | 5)[] = [3, 4, 5];

/** a three-hole course: each hole on its own row (y = 20 + 60 h) from the tee at x = 10 tiles, a green of 6 tiles round the pin, a fairway strip of
 *  7.5 tiles along the line, rough within 40 tiles, out of bounds beyond */
function view3(): CourseView {
  const holes: PlayHole[] = PARS.map((par, h) => {
    const y = 20 + 60 * h, tee = { x: 10, y }, pin = { x: 10 + (par === 3 ? 160 : par === 4 ? 380 : 500) / TILE_M, y };
    return { n: h + 1, par, tee, pin, line: [tee, pin] };
  });
  const lieAt = (x: number, y: number): Lie => {
    for (const h of holes) if (Math.hypot(x - h.pin.x, y - h.pin.y) <= 6) return 'green';
    let d = Infinity;
    for (const h of holes) {
      const dx = h.pin.x - h.tee.x, dy = h.pin.y - h.tee.y, L2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((x - h.tee.x) * dx + (y - h.tee.y) * dy) / L2));
      d = Math.min(d, Math.hypot(x - h.tee.x - dx * t, y - h.tee.y - dy * t));
    }
    return d <= 7.5 ? 'fairway' : d <= 40 ? 'rough' : 'out';
  };
  return { holes, lieAt };
}

/** two golfers: a pro (id 0) in the first group, teeing off at 450, and an amateur (id 1) in the second, at 500 */
const GOLFERS: Golfer[] = [
  { id: 0, name: 'Pro One', sex: 'm', pro: true, skill: 0.9, look: 0 },
  { id: 1, name: 'Ama Two', sex: 'w', pro: false, skill: 0.4, look: 1 },
];
const GROUPS: Group[] = [{ tee: 450, players: [0] }, { tee: 500, players: [1] }];

/** the whole day on the three holes, from a seed */
function playOf(seed: number): { view: CourseView; plan: RoundPlan } {
  const view = view3();
  return { view, plan: playRound(view, GOLFERS, GROUPS, seed) };
}

/** the first shot of a golfer that the predicate takes */
function shotOf(plan: RoundPlan, golfer: number, pred: (s: Shot) => boolean = () => true): Shot {
  const s = plan.shots.find(x => x.golfer === golfer && pred(x));
  assert.ok(s, `golfer ${golfer} has such a shot`);
  return s;
}

/** the frame of golfer 0 after an update at a minute and real second */
function frameOf(pv: PlayView, minute: number, now: number): number {
  pv.update(minute, now);
  const p = pv.people.find(q => q.golfer === 0);
  assert.ok(p, `golfer 0 is drawn at ${minute}`);
  return p.frame;
}

test('swing: the drive clip starts when its shot is crossed, runs for 2.2 s holding its finish, then he is idle', () => {
  const { view, plan } = playOf(1234), pv = new PlayView(plan, view), s = shotOf(plan, 0, x => x.club !== 'putter'), d = GOLFER_CLIPS.golf_drive;
  frameOf(pv, s.t - 0.05, 100); // before the shot: the address, not swung yet
  assert.equal(frameOf(pv, s.t + 0.01, 101), d.start, 'crossed: the swing starts at the first frame');
  assert.equal(frameOf(pv, s.t + 0.01, 101.5), d.start + 1, 'half a second in: the second frame (times[1] is 0.5 s)');
  assert.equal(frameOf(pv, s.t + 0.01, 103), d.start + 11, 'two seconds in: the finish');
  assert.equal(frameOf(pv, s.t + 0.01, 103.5), GOLFER_CLIPS.idle.start, 'past 2.2 s: idle');
});

test('swing: a shot already struck when the view starts (a page load mid-round) is not swung again', () => {
  const { view, plan } = playOf(1234), pv = new PlayView(plan, view), s = shotOf(plan, 0, x => x.club !== 'putter');
  pv.update(s.t + 0.3, 50);
  assert.ok(pv.balls.every(b => b.h === 0), 'no ball is in flight at the first update');
  assert.ok(pv.balls.some(b => b.x === s.to.x && b.y === s.to.y), 'the ball rests where the shot ended');
});

test('putt: the address and the takeaway frames for 1.2 s after the putt is crossed, then the address; the ball rolls without an arc', () => {
  const { view, plan } = playOf(1234), pv = new PlayView(plan, view), p = shotOf(plan, 0, x => x.club === 'putter'), d = GOLFER_CLIPS.golf_drive;
  frameOf(pv, p.t - 0.05, 200);
  assert.equal(frameOf(pv, p.t + 0.01, 201), d.start, 'the address at the putt');
  pv.update(p.t + 0.01, 201.4); // half of the 0.8 s roll
  const mx = (p.from.x + p.to.x) / 2, my = (p.from.y + p.to.y) / 2;
  const b = pv.balls.find(q => Math.abs(q.x - mx) < 1e-9 && Math.abs(q.y - my) < 1e-9);
  assert.ok(b, 'the putt is in the middle of its roll');
  assert.equal(b.h, 0, 'a putt has no arc');
  assert.equal(frameOf(pv, p.t + 0.01, 201.5), d.start + 1, 'the takeaway (floor(3 * 0.5 / 1.2) = 1)');
  assert.equal(frameOf(pv, p.t + 0.01, 201.95), d.start, 'back to the address by 1.2 s');
  assert.equal(frameOf(pv, p.t + 0.01, 203), d.start, 'after the window he stands at the address (the putt action)');
});

test('ball: a full shot arcs (h = 0.12 of its metres at the top of the flight) and rests at the end of the shot', () => {
  const { view, plan } = playOf(1234), pv = new PlayView(plan, view), s = shotOf(plan, 0, x => x.club !== 'putter' && x.club !== 'pw' && x.club !== 'sw');
  pv.update(s.t - 0.05, 100);
  pv.update(s.t + 0.01, 101);
  pv.update(s.t + 0.01, 101.7); // half of the 1.4 s flight
  const mx = s.from.x + (s.to.x - s.from.x) * 0.5, my = s.from.y + (s.to.y - s.from.y) * 0.5;
  const b = pv.balls.find(q => Math.abs(q.x - mx) < 1e-9 && Math.abs(q.y - my) < 1e-9);
  const metres = Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y) * TILE_M;
  assert.ok(b, 'the ball is at the middle of its flight');
  assert.ok(metres > 0 && Math.abs(b.h - 0.12 * metres) < 1e-9, `the top of the arc: ${b.h} m for a ${metres} m shot`);
  pv.update(s.t + 0.01, 102.5); // landed
  assert.ok(pv.balls.some(q => q.h === 0 && q.x === s.to.x && q.y === s.to.y), 'at rest where the shot ended');
  assert.ok(pv.balls.every(q => q.h === 0), 'no ball left in the air');
});

test('ball: a holed putt is drawn on its roll and not in the hole after it', () => {
  let plan: RoundPlan | null = null, shot: Shot | undefined;
  for (let seed = 1; seed <= 60 && !shot; seed++) { const v = playOf(seed); plan = v.plan; shot = v.plan.shots.find(x => x.holed); }
  assert.ok(plan && shot, 'some seed holes a putt');
  const view = view3(), pv = new PlayView(plan, view), h = shot;
  pv.update(h.t - 0.05, 10);
  pv.update(h.t + 0.01, 11);
  pv.update(h.t + 0.01, 11.4);
  assert.ok(pv.balls.some(q => Math.abs(q.x - (h.from.x + h.to.x) / 2) < 1e-9 && Math.abs(q.y - (h.from.y + h.to.y) / 2) < 1e-9), 'on the roll');
  pv.update(h.t + 0.01, 12);
  assert.ok(pv.balls.every(q => q.x !== h.to.x || q.y !== h.to.y), 'in the hole: not drawn');
});

test('walk: while he moves the walk cycle runs with the time (his walk frames), and he is idle once he stands', () => {
  const { view, plan } = playOf(1234), pv = new PlayView(plan, view), W = GOLFER_CLIPS.walk;
  // a stretch where he walks and moves at every step (right after a shot he walks in the state but stands at his ball: idle, by design)
  let m0 = -1;
  for (let m = 450; m < plan.done[0]! - 1 && m0 < 0; m += 0.05) {
    let prev = stateAt(plan, view, m)[0]!, walking = true;
    for (let k = 1; k <= 30 && walking; k++) {
      const s = stateAt(plan, view, m + k * 0.02)[0]!;
      walking = s.action === 'walk' && (s.x !== prev.x || s.y !== prev.y);
      prev = s;
    }
    if (walking) m0 = m;
  }
  assert.ok(m0 >= 0, 'golfer 0 walks for half a game minute');
  pv.update(m0, 300);
  const seen = new Set<number>();
  for (let k = 1; k <= 30; k++) { seen.add(frameOf(pv, m0 + 0.02 * k, 300 + 0.05 * k)); }
  assert.ok(seen.size >= 3, `the walk cycle changes with the time: ${[...seen].join(',')}`);
  assert.ok([...seen].every(f => f >= W.start && f < W.start + W.n), 'every frame is a walk frame');
  assert.equal(frameOf(pv, m0 + 0.6, 302), GOLFER_CLIPS.idle.start, 'stopped (the same minute): idle');
});

test('who is drawn: nobody before the tee window (drawn on the first tee from 10 minutes before the tee), nobody after done', () => {
  const { view, plan } = playOf(1234), pv = new PlayView(plan, view);
  pv.update(439.9, 10);
  assert.ok(pv.people.every(p => p.golfer !== 0), 'just before his window: not drawn');
  pv.update(440, 10);
  const w = pv.people.find(p => p.golfer === 0);
  assert.ok(w, 'his window: drawn');
  assert.deepEqual([w.x, w.y], [view.holes[0]!.tee.x, view.holes[0]!.tee.y], 'standing on the first tee');
  assert.equal(w.frame, GOLFER_CLIPS.idle.start, 'idle');
  pv.update(489.9, 10);
  assert.ok(pv.people.every(p => p.golfer !== 1), 'the second group is not drawn 10 minutes before its tee (500)');
  pv.update(490, 10);
  assert.ok(pv.people.some(p => p.golfer === 1), 'the second group is drawn from 490');
  pv.update(plan.done[0]! + 1, 20);
  assert.ok(pv.people.every(p => p.golfer !== 0), 'done: not drawn');
});

test('update: refills the same arrays and objects, so a warm view allocates nothing', () => {
  const { view, plan } = playOf(1234), pv = new PlayView(plan, view);
  pv.update(455, 1);
  const people = pv.people, p0 = people[0], balls = pv.balls;
  pv.update(456, 2);
  assert.equal(pv.people, people, 'the people array is the same');
  assert.equal(pv.people[0], p0, 'the first person is the same object');
  assert.equal(pv.balls, balls, 'the balls array is the same');
});
