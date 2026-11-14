// T459 (the owner, 2026-11-14: "the pro/the picker teleports all over"): everyone the range draws WALKS. The range sim is stepped as the host steps it (pieces of at most half a second), a
// frame at a time, over whole town days, and each person and car it hands the engine to draw (RangeSim.view) is followed from frame to frame: nobody moves farther in one frame than his
// pace allows (the customers' and staff's walk, the robots' trundle, the cars' road speed, the night cart's lanes), nobody turns up or goes out of the picture anywhere but at a door (a
// golfer's car, the ball room's door) and the staff face the way they walk. The business is not touched: the other golf-range tests keep their numbers.
//
// The moments that must stay smooth are all in the runs: the range opening and closing, the first golfer of the day, a shift beginning and ending (the attendant walks home and goes in at the
// door), a job changing (the player sets another shift while he is out in the field), the nearest pile moving faster than a walker (the jam's staff pick 12 times as fast), the basket
// emptied at the ball room's door, the cart caught out on its lanes by opening time. (The till is money only: nothing walks it anywhere.) Skips (two minutes of sim time in one step) clear the range
// and are not frames.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATH_PACE, PathNet } from '../src/game/golf/pathroute';
import { AGENT_SPEED, PICK_HOURS, RANGE_PACE, RangeSim, defaultRangeBiz, garageSlots, rangeScene, rangeStats, withUpgrade, type CarSlot, type RangeUpgradeId } from '../src/game/golf/rangebiz';
import { newBalls, pickNear } from '../src/game/golf/rangeballs';
import { scanPractice } from '../src/game/golf/practice';
import { SURF, makeGrid, paintDisc } from '../src/game/ext/course-grid';
import { plotPoint } from '../src/game/golf/range';
import { GOLFER_CLIPS, STAFF_BASE, STAFF_CLIPS, STAFF_FRAMES, STAFF_PEOPLE, WALK_DIRS } from '../src/game/library';
import { rowToward } from '../src/game/crowdview';
import { RangeHost, type RangeHostCtx } from '../src/game/golf/rangehost';
import { YOU_RUN, YOU_WALK, makeYou, routeOf, startWalk, stepYou } from '../src/game/golf/you';
import type { Rect } from '../src/game/golf/mode';

const plot: Rect = [200, 200, 70, 150], DAY = 600, HOUR_S = DAY / 24, busy = { tier: 5, exits: 2, residents: 20000 };
/** the grown range: every extra (a second tier, the academy and its pro, the kiosk, the night cart), two attendants and the robots */
const FULL: RangeUpgradeId[] = ['greens', 'bays8', 'bays12', 'covered', 'lights', 'proshop', 'tier2', 'academy', 'kiosk', 'tube', 'pushpick', 'picker', 'nightpick', 'attendant', 'attendant2', 'washer', 'robot'];
const lot = (sc: ReturnType<typeof rangeScene>, n = 30): CarSlot[] => Array.from({ length: n }, (_, i) => ({ x: sc.carEdge.x + sc.roadDir.x * (1 + i * 1.5), y: sc.carEdge.y + sc.roadDir.y * (1 + i * 1.5), hx: sc.rangeSide.x, hy: sc.rangeSide.y }));

type Kind = 'golfer' | 'pro' | 'attendant' | 'robot' | 'car' | 'cart';
interface Opts {
  owned: RangeUpgradeId[]; h0: number; hours: number; dt: number; shift?: number;
  /** balls a sim second the staff of the jam would take off the field, the nearest first (the pile then moves faster than a walker) */
  eat?: number;
  /** balls to a clump of the field (twelve clumps down the range) */
  clump?: number;
  /** the golfers park in the car park building (its door) as well as the lot */
  garage?: boolean;
  /** the practice greens are there (golfers putt and chip) */
  practice?: boolean;
  /** #1295: the walking paths laid (the scene's walkNet): the golfers are then drawn over them (a frame of theirs is up to 1 + PATH_PACE steps), the staff turn at their corners */
  net?: PathNet | null;
  /** called after each frame's step (the targeted tests act on the range here); returns true to stop */
  each?: (f: { book: ReturnType<typeof newBalls>; sc: ReturnType<typeof rangeScene>; hour: number; open: number; t: number; view: ReturnType<RangeSim['view']> }) => boolean;
}
const hh = (h: number): string => `${String(Math.floor(h % 24)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

/** the range stepped a frame at a time, every mover of view() followed; what was seen, and what broke the rules */
function audit(o: Opts) {
  const s = o.owned.reduce((q, id) => withUpgrade(q, id), defaultRangeBiz()), book = newBalls(); book.shift = o.shift ?? 7; s.balls = book;
  const sc = rangeScene(plot, 2, s), slots: CarSlot[] = o.garage && sc.garage ? [...lot(sc, 6), ...garageSlots(sc.garage, 20)] : lot(sc), room = sc.ballRoom;
  sc.walkNet = o.net ?? null;
  // a field spread down the range: twelve clumps, so the nearest ball to the ball room (the pile) moves on as the staff pick
  const au = Math.hypot(sc.aim.x, sc.aim.y) || 1, ax = sc.aim.x / au, ay = sc.aim.y / au;
  for (let k = 0; k < 12; k++) { const t = sc.aims[k % sc.aims.length]!; for (let i = 0; i < (o.clump ?? 60); i++) { const d = ((k >> 2) - 1) * 8 + (i % 10) * 0.3, c = (k % 4 - 1.5) * 6 + Math.floor(i / 10) * 0.3; book.field.push(t.x + ax * d - ay * c, t.y + ay * d + ax * c); } }
  const sim = new RangeSim(11, 10); sim.setScene(sc, slots, sc.carEdge); sim.setBalls(book);
  if (o.practice !== false) {
    const g = makeGrid(190, 190, 300, 420), P = (u: number, v: number) => plotPoint(plot, 2, u, v), p1 = P(88, 14), p2 = P(100, 28), p3 = P(100, 33.5);
    paintDisc(g, p1.x, p1.y, 5, SURF.green, 0, 0); paintDisc(g, p2.x, p2.y, 4, SURF.green, 0, 0); paintDisc(g, p3.x, p3.y, 1.6, SURF.bunker, 0, 0);
    sim.setPractice(scanPractice(g, sc.practice.box)); s.practice.putting.open = true; s.practice.chipping.open = true;
  }
  const lanes = sc.picker ? sc.picker.lanes : [], laneLen = lanes.reduce((n, p, i) => n + (i ? Math.hypot(p.x - lanes[i - 1]!.x, p.y - lanes[i - 1]!.y) : 0), 0), cartV = laneLen / (PICK_HOURS * HOUR_S);
  const pace: Record<Kind, number> = { golfer: (o.net ? 1 + PATH_PACE : 2) * RANGE_PACE.walk, pro: RANGE_PACE.walk, attendant: AGENT_SPEED.attendant, robot: AGENT_SPEED.robot, car: RANGE_PACE.road, cart: cartV };
  const dt = o.dt, frames = Math.round(o.hours * HOUR_S / dt), open = rangeStats(s).open;
  const last = new Map<string, { x: number; y: number; kind: Kind }>(), now = new Set<string>(), bad: string[] = [];
  const worst: Record<Kind, number> = { golfer: 0, pro: 0, attendant: 0, robot: 0, car: 0, cart: 0 }, appeared = { ...worst }, vanished = { ...worst };
  const seen = { picks: 0, stood: 0, farthest: 0, robotPath: 0, proPath: 0, cartOut: 0, cartOutAfterOpening: 0, cartHome: true, walkFrames: 0, wrongWay: 0, att: new Set<number>(), golferFrames: 0, golferOn: 0, attFrames: 0, attOn: 0 };
  const note = (m: string) => { if (bad.length < 12) bad.push(m); };
  let f = 0, hour = o.h0, eatAcc = 0;
  const atDoor = (x: number, y: number) => Math.hypot(x - room.x, y - room.y) <= 1.2;                                         // (a lane across the door)
  const atCar = (x: number, y: number) => slots.some(sl => Math.hypot(x - sl.x, y - sl.y) <= 1.3 || (sl.door !== undefined && Math.hypot(x - sl.door.x, y - sl.door.y) <= 0.05));
  // the legitimate places to turn up and to go: a golfer at his car's door, an attendant or a robot at the ball room's door; the pro and the cart are there from the first frame; a car drives in off
  // the county road and out along it (the edge of what is drawn) and is not a person
  const legit = (kind: Kind, x: number, y: number): boolean => kind === 'golfer' ? atCar(x, y) : kind === 'attendant' || kind === 'robot' ? atDoor(x, y) : kind === 'car' ? true : f === 0;
  const see = (key: string, kind: Kind, x: number, y: number, ang?: number) => {
    now.add(key); const p = last.get(key);
    if (!p) { last.set(key, { x, y, kind }); appeared[kind]++; if (!legit(kind, x, y)) note(`${key} turned up at (${x.toFixed(1)}, ${y.toFixed(1)}), ${hh(hour)}: not at a door`); return; }
    const m = Math.hypot(x - p.x, y - p.y), lim = pace[kind] * dt;
    worst[kind] = Math.max(worst[kind], m / lim);
    if (m > lim + 1e-6) note(`${key} moved ${m.toFixed(3)} tiles in a ${dt.toFixed(4)} s frame at ${hh(hour)} (at most ${lim.toFixed(3)}): from (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) to (${x.toFixed(1)}, ${y.toFixed(1)})`);
    // the staff face the way they go
    if (ang !== undefined && m > 1e-9) { seen.walkFrames++; if (Math.cos(ang) * (x - p.x) + Math.sin(ang) * (y - p.y) < 0.999 * m) { seen.wrongWay++; if (!o.net) note(`${key} moved ${m.toFixed(3)} tiles facing ${(ang * 57.3).toFixed(0)} degrees at ${hh(hour)}`); } }   // (with paths laid he turns at their corners: a frame round one faces the new leg)
    if (kind === 'pro') seen.proPath += m; if (kind === 'robot') seen.robotPath += m;
    p.x = x; p.y = y;
  };
  const face = { checked: 0, off: 0 }, WALKF = GOLFER_CLIPS.walk;
  for (; f < frames; f++) {
    const t = f * dt; hour = (o.h0 + t / HOUR_S) % 24; const clock = { hour, day: 1 + Math.floor((o.h0 + t / HOUR_S) / 24) };
    // (the host steps a long frame in pieces of half a second)
    for (let left = dt; left > 1e-9; left -= 0.5) sim.step(Math.min(0.5, left), clock, s, busy, DAY);
    if (o.eat) { eatAcc += o.eat * dt; const n = Math.floor(eatAcc); if (n > 0) { eatAcc -= n; pickNear(book, room.x, room.y, n); } }
    const d = sim.view(); now.clear();
    for (let k = 0; k < d.nPeople; k++) {
      const p = d.people[k]!, key = p.id === 0 ? 'pro' : `golfer ${p.id}`, before = last.get(key), px = before?.x ?? p.x, py = before?.y ?? p.y;
      see(key, p.id === 0 ? 'pro' : 'golfer', p.x, p.y);
      if (o.net && before && p.id !== 0 && Math.hypot(p.x - px, p.y - py) > 1e-9) { seen.golferFrames++; if (o.net.on(p.x, p.y, 0.4)) seen.golferOn++; }
      // a golfer in his walk clip faces the way he moves (a step round a corner of his route turns a frame early: only a share of the frames may differ)
      if (before && p.id !== 0 && p.frame >= WALKF.start && p.frame < WALKF.start + WALKF.n) { const mx = p.x - px, my = p.y - py; if (Math.hypot(mx, my) > 0.5 * RANGE_PACE.walk * dt) { face.checked++; const r = rowToward(mx, my); if (Math.min((p.row - r + 8) % 8, (r - p.row + 8) % 8) > 1) face.off++; } }
    }
    for (let k = 0; k < d.nAgents; k++) {
      const a = d.agents[k]!; see(`${a.kind} ${a.id}`, a.kind, a.x, a.y, a.ang);
      if (o.net && a.kind === 'attendant' && a.moving) { seen.attFrames++; if (o.net.on(a.x, a.y, 0.3)) seen.attOn++; }
      if (a.kind === 'attendant') { seen.att.add(a.id); if (a.pick) seen.picks++; else if (!a.moving) seen.stood++; seen.farthest = Math.max(seen.farthest, Math.hypot(a.x - room.x, a.y - room.y)); }
    }
    for (let k = 0; k < d.nCars; k++) { const c = d.cars[k]!; if (c.id >= 0) see(`car ${c.id}`, 'car', c.x, c.y); }
    if (d.picker) {
      see('cart', 'cart', d.picker.x, d.picker.y);
      if (d.picker.out) { seen.cartOut++; if (hour >= open && hour < open + 5) seen.cartOutAfterOpening++; } else if (Math.hypot(d.picker.x - sc.picker!.home.x, d.picker.y - sc.picker!.home.y) > 1e-9) seen.cartHome = false;
    }
    for (const [key, p] of last) if (!now.has(key)) {
      vanished[p.kind]++; last.delete(key);
      if (!(p.kind === 'car' || ((p.kind === 'golfer') && atCar(p.x, p.y)) || ((p.kind === 'attendant') && atDoor(p.x, p.y)))) note(`${key} went out of the picture at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}), ${hh(hour)}: not at a door`);
    }
    if (o.each?.({ book, sc, hour, open, t, view: d })) { f++; break; }
  }
  return { bad, worst, appeared, vanished, seen, face, frames: f, s, sc, book, sim, cartV };
}

test('T459: the grown range, a frame at a time over a day and more: nobody jumps, turns up or goes out of the picture but at a door, the staff face the way they walk', () => {
  // 1x (a 60 fps frame is 1/60 sim s), 20x (1/3 s) and the longest piece the host steps (half a second); from 03:00: the night cart is out on its lanes when the range opens at 07:00,
  // the first attendant comes on at 07:00, the second at 15:00 (the first goes home), the second goes home after 23:00
  for (const [dt, hours] of [[1 / 60, 30], [1 / 3, 54], [0.5, 54]] as const) {
    const r = audit({ owned: FULL, h0: 3, hours, dt });
    assert.deepEqual(r.bad, [], `dt ${dt.toFixed(4)}`);
    // what the run covered (so it cannot pass by standing still)
    assert.ok(r.appeared.golfer >= 25 && r.appeared.car >= 25, `golfers came and went (${r.appeared.golfer})`);
    assert.ok(r.appeared.attendant >= 3 && r.vanished.attendant >= 2, `shifts began (${r.appeared.attendant}) and ended (${r.vanished.attendant}): each at the ball room's door`);
    assert.ok(r.seen.att.has(0) && r.seen.att.has(1), 'both attendants worked');
    assert.ok(r.seen.picks > 0 && r.seen.stood > 0 && r.seen.farthest > 15, `the attendants picked at the pile (${r.seen.picks} frames), stood at the door to drop (${r.seen.stood}) and went far (${r.seen.farthest.toFixed(0)} tiles)`);
    assert.ok(r.seen.robotPath > 50, `the robots trundled (${r.seen.robotPath.toFixed(0)} tiles)`); assert.equal(r.vanished.robot, 0, 'a robot never goes');
    assert.ok(r.seen.proPath > 5, `the academy's pro walked to his pupils (${r.seen.proPath.toFixed(0)} tiles)`); assert.equal(r.vanished.pro, 0);
    assert.ok(r.seen.cartOut > 0 && r.seen.cartOutAfterOpening > 0 && r.seen.cartHome, 'the night cart was caught out on its lanes by opening time, and drove home');
    assert.ok(r.seen.walkFrames > 500 && r.seen.wrongWay === 0, `the staff walked (${r.seen.walkFrames} frames) facing the way they went`);
    assert.ok(r.face.checked > 300 && r.face.off / r.face.checked < 0.01, `the golfers faced the way they walked (${r.face.off} of ${r.face.checked} frames off by more than a turn)`);
    // the fastest frame of each kind, as a share of its allowance (a golfer's is two steps: the end of his route and his first step in the line fall in one frame)
    for (const k of ['pro', 'attendant', 'robot', 'car', 'cart'] as const) assert.ok(r.worst[k] <= 1 + 1e-6, `${k}: ${r.worst[k].toFixed(3)}`);
    assert.ok(r.worst.golfer <= 1 + 1e-6, `golfer: ${r.worst.golfer.toFixed(3)} of two steps`);
  }
});

test('#1295 (T459 with walking paths laid): the grown range over a day and more with the guide\'s path and a path out onto the field: nobody jumps, turns up or goes out of the picture but at a door, the golfers are drawn on the path and the attendants walk it', () => {
  // (the plot's frame: from the car park's edge to the shack and along behind the mats, and from the ball room's door out over the tee box and down the range)
  const P = (u: number, v: number) => plotPoint(plot, 2, u, v), legs = (...uv: [number, number][]) => uv.slice(1).map((q, i) => ({ a: P(uv[i]![0], uv[i]![1]), b: P(q[0], q[1]) }));
  const net = PathNet.of([...legs([48.4, 16.2], [42, 14.5], [34, 14], [30, 16.8], [4, 16.8]), ...legs([29.4, 13], [29.4, 30], [36, 100])])!;
  for (const [dt, hours] of [[1 / 60, 30], [1 / 3, 54], [0.5, 54]] as const) {
    const r = audit({ owned: FULL, h0: 3, hours, dt, net });
    assert.deepEqual(r.bad, [], `dt ${dt.toFixed(4)}`);
    assert.ok(r.appeared.golfer >= 25 && r.appeared.car >= 25, `golfers came and went (${r.appeared.golfer})`);
    assert.ok(r.appeared.attendant >= 3 && r.vanished.attendant >= 2, `shifts began (${r.appeared.attendant}) and ended (${r.vanished.attendant}): each at the ball room's door`);
    assert.ok(r.seen.picks > 0 && r.seen.stood > 0 && r.seen.farthest > 15, `the attendants picked at the pile, stood at the door to drop and went far (${r.seen.farthest.toFixed(0)} tiles)`);
    assert.ok(r.seen.proPath > 5, `the academy's pro walked to his pupils (${r.seen.proPath.toFixed(0)} tiles)`);
    assert.ok(r.seen.walkFrames > 500 && r.seen.wrongWay / r.seen.walkFrames < 0.03, `the staff faced the way they went but at the paths' corners (${r.seen.wrongWay} of ${r.seen.walkFrames} frames)`);
    assert.ok(r.face.checked > 300 && r.face.off / r.face.checked < 0.02, `the golfers faced the way they walked (${r.face.off} of ${r.face.checked} frames off by more than a turn)`);
    for (const k of ['pro', 'attendant', 'robot', 'car', 'cart'] as const) assert.ok(r.worst[k] <= 1 + 1e-6, `${k}: ${r.worst[k].toFixed(3)}`);
    assert.ok(r.worst.golfer <= 1 + 1e-6, `golfer: ${r.worst.golfer.toFixed(3)} of the most a frame may be (the end of a route, the first step in the line, and the path's pace)`);
    // the paths are used
    assert.ok(r.seen.golferFrames > 1000 && r.seen.golferOn / r.seen.golferFrames > 0.3, `${r.seen.golferOn} of ${r.seen.golferFrames} frames the golfers walked were on a path`);
    assert.ok(r.seen.attFrames > 500 && r.seen.attOn / r.seen.attFrames > 0.2, `${r.seen.attOn} of ${r.seen.attFrames} frames the attendants walked out and back were on a path`);
  }
});

test('T459: golfers who park in the car park building come out of its door and go in at it', () => {
  const r = audit({ owned: [...FULL, 'gravel', 'pave', 'parking'], h0: 6, hours: 20, dt: 1 / 30, garage: true });
  assert.ok(r.sc.garage, 'the car park building stands'); assert.deepEqual(r.bad, []);
  assert.ok(r.appeared.golfer >= 25, `${r.appeared.golfer} golfers`);
});

test('T459: the jam\'s staff pick 12 times as fast: the nearest pile moves faster than a walker, and he still walks to a pile, picks, and walks home', () => {
  // 8 balls a sim second taken off the field, the nearest first (the sim's own staff take them from the same end): the pile the attendant set out for is gone before he gets there
  const r = audit({ owned: ['tube', 'pushpick', 'attendant', 'washer', 'robot'], h0: 7, hours: 10, dt: 1 / 60, eat: 8, clump: 150, practice: false });
  assert.deepEqual(r.bad, []);
  assert.ok(r.seen.picks > 100 && r.seen.farthest > 15, `he picked (${r.seen.picks} frames) out on the range (${r.seen.farthest.toFixed(0)} tiles from the door)`);
  assert.ok(r.worst.attendant > 0.999 && r.worst.robot > 0.999, 'and they walked at their pace, as fast as they walk and no faster');
});

test('T459: a job changes while he is out in the field (the player sets another shift): he turns back, walks home at his pace, drops his basket and goes in at the door', () => {
  const dt = 1 / 60; let trigger = -1, d0 = 0, prev = 0, gone = -1, pos = { x: 0, y: 0 };
  const r = audit({
    owned: ['tube', 'pushpick', 'attendant'], h0: 8, hours: 6, dt, practice: false, clump: 150,
    each: ({ book, sc, view, t }) => {
      const a = view.agents.slice(0, view.nAgents).find(g => g.kind === 'attendant');
      if (trigger < 0) {
        if (a) { const d = Math.hypot(a.x - sc.ballRoom.x, a.y - sc.ballRoom.y); if (a.moving && d > 20 && d > prev) { trigger = t; d0 = d; book.shift = 15; } prev = d; }     // (out on his way, 20 tiles from the door: his shift is now 15:00 to 23:00)
        return false;
      }
      if (!a) { gone = t; return true; }
      pos = { x: a.x, y: a.y }; return false;
    },
  });
  assert.deepEqual(r.bad, []);
  assert.ok(trigger >= 0, 'he went out into the field'); assert.ok(gone > trigger, 'and went in');
  const room = r.sc.ballRoom, walk = (gone - trigger);
  assert.ok(Math.hypot(pos.x - room.x, pos.y - room.y) <= 1.2, `at the ball room's door (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)} against ${room.x}, ${room.y})`);
  // home at his own pace: no faster than he walks, and not stuck on the way (the drop at the door takes a moment)
  assert.ok(walk >= (d0 - 1.2) / AGENT_SPEED.attendant - 0.1, `${walk.toFixed(1)} s for ${d0.toFixed(0)} tiles`); assert.ok(walk <= (d0 + 1.2) / AGENT_SPEED.attendant + 2.5, `${walk.toFixed(1)} s for ${d0.toFixed(0)} tiles is no hurry home`);
});

test('T459: the night cart caught out on its lanes by opening time drives home, picking nothing on the way, instead of jumping there', () => {
  const owned: RangeUpgradeId[] = ['greens', 'bays8', 'tube', 'pushpick', 'picker', 'nightpick'];
  let outAtOpening = 0, picked = -1, home = false;
  const r = audit({
    owned, h0: 3, hours: 6, dt: 1 / 60, practice: false,
    each: ({ book, hour, open, view }) => {
      if (hour >= open && picked < 0) { picked = book.total.picked.night; if (view.picker?.out) outAtOpening++; }
      if (hour >= open + 0.2 && view.picker && !view.picker.out) home = true;
      return false;
    },
  });
  assert.deepEqual(r.bad, []); assert.equal(outAtOpening, 1, 'the cart is out on its lanes when the range opens'); assert.ok(home && r.seen.cartHome, 'and it is parked at home soon after');
  assert.equal(r.book.total.picked.night, picked, 'the night cart picks nothing once the range is open');
  assert.ok(r.worst.cart > 0.999 && r.worst.cart <= 1 + 1e-6, `it drove at its lanes' speed (${r.worst.cart.toFixed(3)} of ${r.cartV.toFixed(2)} tiles a second)`);
});

test('T459: who looks changes nothing: the range stepped without a single view() is the range stepped with one every frame', () => {
  const run = (look: boolean) => {
    const s = FULL.reduce((q, id) => withUpgrade(q, id), defaultRangeBiz()), book = newBalls(); s.balls = book;
    const sc = rangeScene(plot, 2, s), sim = new RangeSim(5, 10); sim.setScene(sc, lot(sc), sc.carEdge); sim.setBalls(book);
    for (let k = 0; k < 12; k++) for (let i = 0; i < 60; i++) book.field.push(230 + k * 3 + (i % 10) * 0.3, 205 + (k % 3) * 12 + Math.floor(i / 10) * 0.3);
    let booked = 0;
    for (let f = 0; f < 6000; f++) {
      const h = 5 + f * 0.1 / HOUR_S; booked += sim.step(0.1, { hour: h % 24, day: 1 + Math.floor(h / 24) }, s, busy, DAY);
      if (look && f % 3 === 0) sim.view();
    }
    const d = sim.view(), round = (n: number) => Math.round(n * 1e6) / 1e6;
    return JSON.stringify({ booked, season: s.season, balls: book.total, agents: d.agents.slice(0, d.nAgents).map(a => [a.kind, a.id, round(a.x), round(a.y), round(a.ang), a.moving, a.pick]), people: d.people.slice(0, d.nPeople).map(p => [p.id, round(p.x), round(p.y), p.row, p.frame]), cars: d.cars.slice(0, d.nCars).map(c => [c.id, round(c.x), round(c.y)]) });
  };
  const a = run(true), b = run(false); assert.ok(JSON.parse(a).agents.length > 0, 'the crew is at work'); assert.equal(a, b);
});

/** a range host on a controllable clock (as the engine drives it: simT is the sim's time, in sim seconds) with the given upgrades and a field of balls at (fx, fy) */
function hostOf(owned: RangeUpgradeId[], fx: number, fy: number, n = 400) {
  const biz = owned.reduce((q, id) => withUpgrade(q, id), defaultRangeBiz()), bs = biz.balls!; bs.till = 0;
  for (let i = 0; i < n; i++) bs.field.push(fx + (i % 20) * 0.3, fy + Math.floor(i / 20) * 0.3);
  let T = 0; const sc0 = rangeScene(plot, 2, biz), ctx: RangeHostCtx = {
    biz: () => biz, plot: () => ({ rect: plot, facing: 2 }), carPark: () => ({ bays: lot(sc0), entrance: sc0.carEdge, key: 'lot' }), addPiece: () => null, removeProp: () => {}, setGround: () => {}, layPaths: () => {}, clearTrees: () => {},
    money: () => 1e6, spend: () => {}, book: () => {}, demand: () => busy, dayLen: () => DAY, simT: () => T, clock: () => ({ hour: 9, day: 1 }), save: () => {}, toast: () => {}, emit: () => {}, grid: () => null, layTee: () => false,
  };
  const h = new RangeHost(ctx, 3); h.sync(); h.step();
  return { h, bs, tick: (dt: number) => { T += dt; h.step(); } };
}

test("T459 (the host): an attendant standing at the ball room's door is drawn standing, a walking one walking and a picking one picking", () => {
  const { h, tick } = hostOf(['tube', 'pushpick', 'attendant'], 240, 215);
  const staff = STAFF_PEOPLE.findIndex(p => p.id === 'staff:staff_range_m'); assert.ok(staff >= 0, 'the painted attendant is in the library');
  const clips = { idle: STAFF_CLIPS.idle, walk: STAFF_CLIPS.walk, pick: STAFF_CLIPS.pick }, got = { idle: 0, walk: 0, pick: 0 };
  for (let f = 0; f < 3600; f++) {
    tick(1 / 30);
    const d = h.sim.view(), a = d.agents.slice(0, d.nAgents).find(g => g.kind === 'attendant'); if (!a) continue;
    const mv = h.movers_(-1e9, -1e9, 1e9, 1e9).find(m => m.x === a.x && m.y === a.y); assert.ok(mv, 'he is drawn');
    const row = rowToward(Math.cos(a.ang), Math.sin(a.ang)), frame = (mv!.item - STAFF_BASE - (staff * WALK_DIRS.length + row) * STAFF_FRAMES);
    assert.ok(frame >= 0 && frame < STAFF_FRAMES, 'his own person, facing the way he walks');
    const kind = a.pick ? 'pick' : a.moving ? 'walk' : 'idle', c = clips[kind];
    assert.ok(frame >= c.start && frame < c.start + c.n, `${kind}: frame ${frame}`); got[kind]++;
  }
  assert.ok(got.idle > 0 && got.walk > 0 && got.pick > 0, `all three seen (${JSON.stringify(got)})`);
});

test('T459 (you): picking balls up yourself, a pile at a time and home to the ball room: you walk or run along your route, never faster in a frame', () => {
  // Engine.rangeHandWork's wiring, a real-time frame at a time (you walk at a person's pace whatever the sim's speed; the engine itself needs a whole town): click a pile (walk to it, then the
  // pick order), the balls round you picked as you stand among them, the order's next step (the next ball, or the basket home at a run), startWalk from where you stand, stepYou along the route
  const { h, bs } = hostOf(['tube'], 250, 250, 300), sc = h.scene!, room = sc.ballRoom, flat = () => 1;
  const mv = makeYou(sc.shopJoin.x + 1.5, sc.shopJoin.y + 0.5), dt = 1 / 60, pile = h.pileAt(250.3, 250.3)!;
  assert.ok(pile && pile.n > 50, 'a pile to click');
  startWalk(mv, routeOf({ x: mv.x, y: mv.y }, pile, flat), false);
  let worst = 0, picked = 0, dumped = 0, ran = false, frames = 0, ordered = false;
  for (; frames < 60 * 600; frames++) {
    const ox = mv.x, oy = mv.y, run = mv.run, lim = (run ? YOU_RUN : YOU_WALK) * dt;
    if (stepYou(mv, dt) && !ordered) { h.startOrder(pile.x, pile.y); ordered = true; }                  // (you arrive at the pile you clicked: the order begins)
    const m = Math.hypot(mv.x - ox, mv.y - oy); worst = Math.max(worst, m / lim); assert.ok(m <= lim + 1e-9, `frame ${frames}: you moved ${m.toFixed(4)} tiles (at most ${lim.toFixed(4)})`);
    if (!ordered) continue;
    const w = h.work({ x: mv.x, y: mv.y, ox, oy, dt, pick: h.order?.phase === 'pick', inCart: false }); picked += w.picked; dumped += w.dumped;
    const st = h.order ? h.orderStep(mv.x, mv.y, mv.moving) : null;
    if (st?.walk) startWalk(mv, [{ x: mv.x, y: mv.y }, st.walk], false);
    else if (st?.back) { startWalk(mv, routeOf({ x: mv.x, y: mv.y }, room, flat), true); ran = true; }
    if (ordered && !h.order && !mv.moving) break;
  }
  assert.ok(picked > 10 && dumped > 10, `you picked ${picked} and emptied ${dumped} into the ball room`); assert.ok(ran && worst > 0.999, `and ran the basket home (the fastest frame ${worst.toFixed(3)} of a run's)`);
  assert.ok(Math.hypot(mv.x - room.x, mv.y - room.y) < 0.1, 'at the ball room'); assert.equal(bs.total.picked.hand, dumped, 'the balls you emptied are counted as picked by hand');
});
