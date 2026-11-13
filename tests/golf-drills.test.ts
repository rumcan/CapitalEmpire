// J6 (#1223): practice from behind the golfer. The drills' rules (play/drills.ts): each judges a shot by what the model decided, counts hits (one of each
// mark for shaping and flight), pays once, and opens its shot on the course (unlocks.ts earned). The practice course and driver (play/practice3p.ts): the
// range's outfield, tee and greens and the chipping green made into a course, endless balls from the drill's spot, no hole ever ends, a pick moves the ball.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import type { GameSkills, Pt } from '../src/game/golf/play';
import { DRILLS, DRILL_IDS, drillGains, drillOpens, drillProgress, judgeDrill, normalizeDrills, recordDrill, type DrillShot } from '../src/game/golf/play/drills';
import { EARN, earned, practiceEarned } from '../src/game/golf/play/unlocks';
import { handicapOf, normalizePlayer, startProfile, START_SKILLS } from '../src/game/golf/player';
import { PracticeDriver, practiceCourse, spotBall, PUTT_M, type PracticeIn } from '../src/game/golf/play/practice3p';
import { Play3p } from '../src/game/golf/play/play3p';
import { isHostMsg, isViewMsg, type HostMsg, type TurnMsg, type ShotMsg } from '../src/game/golf/play/protocol3p';

const m = (v: number) => v / TILE_M;   // metres as tiles
/** a range at the origin hitting south (+y): the mats at y 0, greens at 50 .. 250 m down the middle */
const greens = [50, 100, 150, 200, 250].map((d, i) => ({ x: 35, y: m(d), r: i < 2 ? 4 : 5, distM: d }));
const shot = (o: Partial<DrillShot>): DrillShot => ({ spot: 'range', club: 'iron7', shape: null, landing: null, landLie: null, rest: { x: 35, y: 0 }, restLie: 'fairway', holed: false,
  pin: { x: 35, y: m(100) }, greens, from: 'tee', ...o });

test('drills: distance control counts a ball that stops within 10 m of the 100 m flag, not one 11 m off', () => {
  assert.equal(judgeDrill('distance', shot({ rest: { x: 35 + m(9.5), y: m(100) } })).hit, true);
  const miss = judgeDrill('distance', shot({ rest: { x: 35, y: m(111) } }));
  assert.equal(miss.hit, false); assert.match(miss.note, /11 m from the 100 m flag/);
});
test('drills: shot shaping needs a draw and a fade landed on the 150 m green; a straight ball or a miss does not count', () => {
  const g = { x: 35, y: m(150) };
  assert.equal(judgeDrill('shaping', shot({ landing: g, rest: g })).hit, false, 'straight');
  const d = judgeDrill('shaping', shot({ shape: { curve: -1, flight: 0 }, landing: g, rest: { x: 35, y: m(160) } }));
  assert.equal(d.hit, true); assert.equal(d.mark, 'draw');
  assert.equal(judgeDrill('shaping', shot({ shape: { curve: 1, flight: 0 }, landing: { x: 35 + m(20), y: m(150) }, rest: { x: 35 + m(25), y: m(150) } })).hit, false, 'a fade 10 m past the edge');
  let sv = recordDrill(undefined, 'shaping', d).save;
  assert.deepEqual(drillProgress(sv, 'shaping'), { got: 1, need: 2, done: false });
  sv = recordDrill(sv, 'shaping', d).save;   // (a second draw adds nothing)
  assert.equal(drillProgress(sv, 'shaping').got, 1);
  const r = recordDrill(sv, 'shaping', { hit: true, mark: 'fade', note: '' });
  assert.equal(r.paid, 'shaping'); assert.ok(r.save.done.includes('shaping')); assert.equal(drillProgress(r.save, 'shaping').done, true);
});
test('drills: flight takes a high and a low ball onto any target green', () => {
  const on = { x: 35, y: m(200) };
  assert.equal(judgeDrill('flight', shot({ shape: { curve: 0, flight: 1 }, landing: on, rest: on })).mark, 'high');
  assert.equal(judgeDrill('flight', shot({ shape: { curve: 0, flight: -1 }, landing: { x: 35, y: m(120) }, rest: { x: 35, y: m(125) } })).hit, false);
});
test('drills: the short game: up and down within 2 m, putts holed, bunker shots out onto the green; from the wrong spot nothing counts', () => {
  const pin = { x: 0, y: 0 };
  assert.equal(judgeDrill('updown', shot({ spot: 'chip', pin, rest: { x: m(1.8), y: 0 } })).hit, true);
  assert.equal(judgeDrill('updown', shot({ spot: 'chip', pin, rest: { x: m(2.5), y: 0 } })).hit, false);
  assert.equal(judgeDrill('putting', shot({ spot: 'putt', club: 'putter', pin, holed: true, rest: pin })).hit, true);
  assert.equal(judgeDrill('putting', shot({ spot: 'putt', club: 'putter', pin, rest: { x: m(0.4), y: 0 }, restLie: 'green' })).hit, false);
  assert.equal(judgeDrill('bunker', shot({ spot: 'sand', club: 'sw', pin, rest: { x: m(4), y: 0 }, restLie: 'green', from: 'bunker' })).hit, true);
  assert.equal(judgeDrill('bunker', shot({ spot: 'sand', club: 'sw', pin, rest: { x: m(4), y: 0 }, restLie: 'bunker', from: 'bunker' })).hit, false);
  assert.equal(judgeDrill('putting', shot({ spot: 'range', holed: true })).hit, false, 'a putt drill is played on the green');
});
test('drills: a drill pays once; five hits finish distance control and its reward lowers the handicap; a done drill takes no more', () => {
  let sv = undefined as ReturnType<typeof recordDrill>['save'] | undefined, paid: string | null = null;
  for (let k = 0; k < DRILLS.distance.need; k++) { const r = recordDrill(sv, 'distance', { hit: true, note: '' }); sv = r.save; paid = r.paid ?? paid; }
  assert.equal(paid, 'distance');
  assert.equal(recordDrill(sv, 'distance', { hit: true, note: '' }).paid, null, 'paid once');
  assert.equal(recordDrill(sv, 'distance', { hit: false, note: '' }).paid, null);
  const s1 = drillGains({ ...START_SKILLS }, 'distance');
  assert.equal(s1.irons, START_SKILLS.irons + 4); assert.equal(s1.accuracy, START_SKILLS.accuracy + 4);
  assert.ok(handicapOf(s1) < handicapOf(START_SKILLS), 'the handicap comes down');
  // every drill done: about two strokes in all (the cap: each pays once)
  let all = { ...START_SKILLS }; for (const id of DRILL_IDS) all = drillGains(all, id);
  const cut = handicapOf(START_SKILLS) - handicapOf(all);
  assert.ok(cut > 0.8 && cut < 3, `all drills take ${cut.toFixed(2)} off`);
  assert.equal(drillGains({ ...START_SKILLS, putting: 98 }, 'putting').putting, 100, 'never past 100');
});
test('drills: the save reads back, junk is dropped, and an old profile has none', () => {
  const sv = normalizeDrills({ v: 1, hits: { distance: 3, putting: 99, bogus: 2 }, marks: { shaping: ['draw', 'loop'] }, done: ['flight', 'flight', 'nope'] })!;
  assert.deepEqual(sv.hits, { distance: 3, putting: DRILLS.putting.need });
  assert.deepEqual(sv.marks, { shaping: ['draw'] }); assert.deepEqual(sv.done, ['flight']);
  assert.equal(normalizeDrills(null), undefined);
  const old = normalizePlayer(startProfile())!; assert.equal(old.drills, undefined);
  const back = normalizePlayer(JSON.parse(JSON.stringify({ ...startProfile(), drills: sv })))!;
  assert.deepEqual(back.drills, sv);
});
test('unlocks: the shaping drill opens the curve, flight the flight, putting the putt read; a new golfer has none; practice lets him try the curve and flight', () => {
  const none = earned({ skills: START_SKILLS });
  assert.equal(none.draw, false); assert.equal(none.high, false); assert.equal(none.read, false);
  assert.match(none.why.read!, /Putting drill/);
  const done = earned({ skills: START_SKILLS, drills: ['shaping', 'flight', 'putting'] });
  assert.equal(done.draw && done.fade && done.high && done.low && done.read, true);
  assert.equal(done.why.draw, undefined);
  assert.equal(earned({ skills: { ...START_SKILLS, putting: EARN.readPutt } }).read, true, 'a good putter reads greens anyway');
  assert.deepEqual([...drillOpens(['distance', 'putting'])], ['read']);
  const pr = practiceEarned(none);
  assert.equal(pr.draw && pr.fade && pr.high && pr.low, true); assert.equal(pr.read, false, 'the read is earned, not lent'); assert.equal(pr.boost, none.boost);
});

// ---- the practice course and driver
const sq = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1];
const disc = (x: number, y: number, r: number) => { const p: number[] = []; for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; p.push(x + Math.cos(a) * r, y + Math.sin(a) * r); } return p; };
/** the range above, and a practice area east of it: a chipping green of radius 6 at (120, 40) with a bunker beside it */
const pin: Pt = { x: 120, y: 40 };
const input: PracticeIn = {
  outfield: sq(0, -3, 70, 130), teeBox: sq(4, -3, 67, 1), bays: [10, 20, 30, 40, 50].map(x => ({ x, y: 0 })), greens: greens.map(g => ({ x: g.x, y: g.y, r: g.r, m: g.distM })),
  area: [100, 20, 140, 60], areas: [{ id: 1, surface: 'green', pts: disc(120, 40, 6) }, { id: 2, surface: 'bunker', pts: disc(129, 40, 2.5) }],
  chip: { cup: pin, stands: [{ x: 130, y: 40 }, { x: 120, y: 51 }] }, name: 'Test practice',
};
const sk: GameSkills = { driving: 0.5, irons: 0.5, short: 0.5, putting: 0.5 };

test('practice3p: the course has the range hole and the chipping green, the lies the model reads, and the spots the drills play from', () => {
  const c = practiceCourse(input);
  assert.deepEqual(c.idx, { range: 0, short: 1 });
  assert.equal(c.view.lieAt(30, 0), 'tee'); assert.equal(c.view.lieAt(35, m(100)), 'green'); assert.equal(c.view.lieAt(35, m(70)), 'fairway');
  assert.equal(c.view.lieAt(120, 40), 'green'); assert.equal(c.view.lieAt(130, 40), 'bunker');
  assert.deepEqual(c.mat, { x: 30, y: 0 }, 'the middle mat');
  assert.deepEqual(c.chip!.sand, { x: 130, y: 40 }); assert.deepEqual(c.chip!.stand, { x: 120, y: 51 });
  assert.equal(c.input.holes!.length, 2); assert.equal(c.input.pins.length, 2);
  for (let k = 0; k < 8; k++) {   // putts: on the green, 3 to 6 m from the cup, not the same twice in a row
    const b = spotBall(c, 'putt', k), d = Math.hypot(b.x - pin.x, b.y - pin.y) * TILE_M;
    assert.equal(c.view.lieAt(b.x, b.y), 'green'); assert.ok(d >= PUTT_M[0] - 1e-6 && d <= PUTT_M[1] + 1e-6, `putt ${k}: ${d.toFixed(2)} m`);
    assert.notDeepEqual(b, spotBall(c, 'putt', k + 1));
  }
});
test('practice3p: endless balls from the mat through Play3p; each one judged; no hole ends; a pick moves the ball to the chipping spot', () => {
  const c = practiceCourse(input), judged: string[] = [];
  let save = undefined as ReturnType<typeof recordDrill>['save'] | undefined;
  const drv = new PracticeDriver(c, 'range', sk, 5, { drills: () => save ?? null, judged: (id, call) => { judged.push(id); save = recordDrill(save, id, call).save; } });
  assert.equal(drv.active, 'distance', 'the first drill not done');
  const play = new Play3p({ view: c.view, holes: [0], skills: sk, sex: 'm', seed: 1, frame: { x: 60, y: 30 }, driver: drv });
  let ms: HostMsg[] = play.start();
  for (let k = 0; k < 6; k++) {
    const t = ms.filter((x): x is TurnMsg => x.t === 'turn').pop()!;
    assert.equal(t.stroke, k + 1); assert.equal(t.lie, 'tee'); assert.equal(t.holeIdx, 0);
    ms = play.input({ holeIdx: t.holeIdx, stroke: t.stroke, club: t.suggested.club, aim: t.suggested.aim, power: t.suggested.power });
    assert.equal(ms.filter((x): x is ShotMsg => x.t === 'shot').length, 1);
    assert.ok(!ms.some(x => x.t === 'holeEnd'), 'a practice hole never ends');
  }
  assert.equal(judged.length, 6); assert.equal(drv.balls, 6);
  // the short game: the bunker drill plays from the sand, a pick moves the ball
  const sd = new PracticeDriver(c, 'short', sk, 5, { drills: () => null, judged: () => {} });
  assert.equal(sd.canPlay('distance'), false); assert.equal(sd.canPlay('bunker'), true);
  const sp = new Play3p({ view: c.view, holes: [1], skills: sk, sex: 'm', seed: 1, frame: { x: 60, y: 30 }, driver: sd });
  const t0 = sp.start().find((x): x is TurnMsg => x.t === 'turn')!;
  assert.equal(sd.active, 'updown'); assert.notEqual(t0.lie, 'bunker');
  assert.equal(sd.pick('bunker'), true);
  const t1 = sp.refresh().find((x): x is TurnMsg => x.t === 'turn')!;
  assert.equal(t1.lie, 'bunker'); assert.equal(t1.stroke, t0.stroke);
  sd.pick('putting'); const t2 = sp.refresh().find((x): x is TurnMsg => x.t === 'turn')!;
  assert.equal(t2.lie, 'green'); assert.equal(t2.suggested.club, 'putter');
});
test('protocol3p: practice and pick are messages of the bridge', () => {
  assert.equal(isHostMsg({ v: 1, t: 'practice' }), true);
  assert.equal(isViewMsg({ v: 1, t: 'pick', drill: 'distance' }), true);
});
test('practice3p: a drill just done moves the next ball on to the next drill not done here', () => {
  const c = practiceCourse(input);
  let save = normalizeDrills({ v: 1, hits: { distance: DRILLS.distance.need - 1 }, marks: {}, done: [] });
  const drv = new PracticeDriver(c, 'range', sk, 5, { drills: () => save ?? null, judged: (id) => { save = recordDrill(save, id, { hit: true, note: '' }).save; } });
  assert.equal(drv.active, 'distance');
  const t = drv.turn(); drv.play({ holeIdx: t.holeIdx, stroke: t.stroke, club: t.suggested.club, aim: t.suggested.aim, power: t.suggested.power });
  assert.ok(save!.done.includes('distance'));
  assert.equal(drv.active, 'shaping');
});
