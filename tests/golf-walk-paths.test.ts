// #1295 (the owner, 2026-11-14: "make sure people use walking paths if they are there and they can follow them"): people walk the paths the player lays (golf/pathroute.ts).
// The range's golfers keep their ordinary timetable (so what the range earns cannot change) and are drawn over the paths in the same time; the attendants and the pro walk them
// (nothing the business counts depends on where they are); you, clicking a route, are taken by them. Without paths everything is as it was, to the frame. Headless.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RangeSim, defaultRangeBiz, garageSlots, rangeScene, withUpgrade, RANGE_PACE, AGENT_SPEED, type CarSlot, type RangeMoneyEvent, type RangeUpgradeId } from '../src/game/golf/rangebiz';
import { newBalls } from '../src/game/golf/rangeballs';
import { looseBays } from '../src/game/golf/rangelot';
import { bayGrid } from '../src/game/event/carpark';
import { plotPoint } from '../src/game/golf/range';
import { PATH_PACE, PathNet } from '../src/game/golf/pathroute';
import { routeOf, clearOf } from '../src/game/golf/you';
import { gridPath } from '../src/game/offroad';
import { RangeHost, type RangeHostCtx } from '../src/game/golf/rangehost';
import type { Rect } from '../src/game/golf/mode';

type Pt = { x: number; y: number };
const PLOT: Rect = [200, 200, 70, 150], F = 2 as const, P = (u: number, v: number): Pt => plotPoint(PLOT, F, u, v), entrance = P(72, 9);
const lotBays = () => bayGrid({ id: 1, x: PLOT[0] + 49, y: PLOT[1] + 2, w: 20, h: 16 }, 0, [entrance]);
/** a path through (u, v) points of the plot's frame, as legs */
const legs = (...uv: [number, number][]) => uv.slice(1).map((q, i) => ({ a: P(uv[i]![0], uv[i]![1]), b: P(q[0], q[1]) }));
/** the lot as the engine hands it over: each bay with the walk from the car park's footpath (at its edge by the path's start) along its aisle to the bay (T237) */
const withFootpath = (bays: CarSlot[]): CarSlot[] => bays.map(b => ({ ...b, walk: [P(49.4, 15.6), { x: b.x - b.hx * 1.2, y: b.y - b.hy * 1.2 }] }));
const FULL: RangeUpgradeId[] = ['greens', 'bays8', 'bays12', 'covered', 'proshop', 'kiosk', 'tube', 'pushpick', 'attendant', 'attendant2', 'washer', 'robot'];
/** the set-back range of the new start (rangestart.ts: setback 18): its lot lies in the frontage strip in front of the plot, 18 tiles from the guide's first ring (the path's end at the car park),
 *  so a lot's bays are the lot's own corners' box and its entrance is on the drive; its walkers step off its back edge and cross the strip to the ring */
const SETBACK = 18;
function setbackLot(sc: ReturnType<typeof rangeScene>): { bays: CarSlot[]; entrance: Pt } {
  const xs = sc.anchors.lot.map(p => p.x), ys = sc.anchors.lot.map(p => p.y), x0 = Math.min(...xs), y0 = Math.min(...ys), e = P(72, -SETBACK + 8);
  return { bays: bayGrid({ id: 1, x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 }, 0, [e]), entrance: e };
}
/** the path laid along the guide's three rings: the car park's edge, the shack's counter, behind the mats (the scene's own points) */
const ringsOf = (sc: ReturnType<typeof rangeScene>) => [{ a: sc.anchors.edge, b: sc.anchors.shop }, { a: sc.anchors.shop, b: sc.anchors.behind }];
/** the walking path the guide asks for: from the car park's edge to the shack's counter and along behind the mats */
const GUIDE = legs([48.4, 16.2], [42, 14.5], [34, 14], [30, 16.8], [4, 16.8]);

// ---------------------------------------------------------------- no paths: exactly today's routes

/** a digest of every mover the range hands the engine to draw, frame by frame (the numbers below were taken on lead/live before this change) */
function digest(owned: RangeUpgradeId[], garage: boolean, dt: number, hours: number, seed: number, net: PathNet | null = null, setback = 0): { hash: string; people: number } {
  const s = owned.reduce((q, id) => withUpgrade(q, id), defaultRangeBiz()); s.balls = newBalls(); s.balls.clean = 400000; s.balls.shift = 7; if (setback) s.setback = setback;
  const sc = rangeScene(PLOT, F, s); sc.walkNet = net;
  const lot = setback ? setbackLot(sc) : { bays: lotBays(), entrance }, slots: CarSlot[] = garage && sc.garage ? [...lot.bays.slice(0, 12), ...garageSlots(sc.garage, 20)] : looseBays(lot.bays, 'dirt');
  const sim = new RangeSim(seed, 10); sim.setScene(sc, slots, lot.entrance); sim.setBalls(s.balls);
  let h = 2166136261 >>> 0, people = 0; const mix = (n: number) => { h = Math.imul(h ^ (Math.round(n * 1e5) | 0), 16777619) >>> 0; };
  const frames = Math.round(hours * 25 / dt), busy = { tier: 5, exits: 2, residents: 20000 };
  for (let f = 0; f < frames; f++) {
    const hr = 5 + f * dt / 25, clock = { hour: hr % 24, day: 1 + Math.floor(hr / 24) };
    for (let left = dt; left > 1e-9; left -= 0.5) sim.step(Math.min(0.5, left), clock, s, busy, 600);
    const d = sim.view();
    for (let k = 0; k < d.nPeople; k++) { const p = d.people[k]!; mix(p.id); mix(p.x); mix(p.y); mix(p.row); mix(p.frame); people++; }
    for (let k = 0; k < d.nAgents; k++) { const a = d.agents[k]!; mix(a.id); mix(a.x); mix(a.y); mix(a.ang); mix(a.moving ? 1 : 0); mix(a.pick ? 1 : 0); }
    for (let k = 0; k < d.nCars; k++) { const c = d.cars[k]!; mix(c.id); mix(c.x); mix(c.y); }
  }
  return { hash: h.toString(16), people };
}
const GROWN: RangeUpgradeId[] = ['greens', 'bays8', 'bays12', 'covered', 'proshop', 'kiosk', 'tube', 'pushpick', 'attendant', 'attendant2', 'washer', 'robot'];

test('#1295: without paths every person and car is drawn exactly where lead/live drew it, frame by frame (three seeded runs: a jam range, the grown range, the car park building)', () => {
  assert.deepEqual(digest(['tube'], false, 1 / 30, 16, 3), { hash: '11d4839d', people: 135846 });
  assert.deepEqual(digest(GROWN, false, 1 / 3, 30, 11), { hash: 'b2a9933a', people: 21640 });
  assert.deepEqual(digest([...GROWN, 'gravel', 'pave', 'tier2', 'parking'], true, 0.25, 24, 13), { hash: '9770d40c', people: 30222 });
  // a network of paths that are nowhere near the range changes nothing either: no leg is within reach, so no way is ever drawn over them
  const far = PathNet.of(legs([-300, -300], [-250, -300], [-250, -260]));
  assert.deepEqual(digest(['tube'], false, 1 / 30, 16, 3, far), { hash: '11d4839d', people: 135846 });
});

test('#1295: the same for the new start\'s set-back range (the lot in the frontage strip, 18 tiles from the guide\'s first ring): without paths every mover is drawn where lead/live drew it', () => {
  assert.deepEqual(digest(['tube'], false, 1 / 30, 16, 3, null, SETBACK), { hash: '7b06f191', people: 173238 });
  assert.deepEqual(digest(GROWN, false, 1 / 3, 30, 11, null, SETBACK), { hash: '79a93551', people: 24784 });
  assert.deepEqual(digest([...GROWN, 'gravel', 'pave', 'tier2', 'parking'], true, 0.25, 24, 13, null, SETBACK), { hash: '5a2af94b', people: 30995 });
});

// ---------------------------------------------------------------- the money does not change

interface Scenario { name: string; seed: number; owned: RangeUpgradeId[]; ample: boolean; day: number; h0: number; hours: number; dt: number; demand: { tier: number; exits: number; residents: number }; practice?: boolean; setback?: number }
const HIGH = { tier: 5, exits: 2, residents: 20000 }, MID = { tier: 3, exits: 2, residents: 6000 }, LOW = { tier: 1, exits: 2, residents: 1500 };
const SCENARIOS: Scenario[] = [
  { name: 'a busy old range, three days', seed: 7, owned: ['bays8', 'greens'], ample: false, day: 600, h0: 5, hours: 72, dt: 0.5, demand: HIGH },
  { name: 'a jam range with staff, mid demand', seed: 5, owned: ['tube', 'pushpick', 'attendant'], ample: true, day: 1440, h0: 5, hours: 30, dt: 1 / 3, demand: MID },
  { name: 'the grown range, a day and a half at 1/3 s', seed: 11, owned: FULL, ample: true, day: 600, h0: 5, hours: 36, dt: 1 / 3, demand: HIGH },
  { name: 'a short day (an hour is ten seconds), kiosk and academy', seed: 17, owned: ['bays8', 'kiosk', 'academy', 'proshop'], ample: false, day: 240, h0: 4, hours: 48, dt: 0.2, demand: LOW },
  { name: 'practice greens and a kiosk, 60 fps', seed: 23, owned: ['bays8', 'kiosk', 'greens'], ample: true, day: 600, h0: 6, hours: 10, dt: 1 / 60, demand: MID, practice: true },
  { name: 'the new start\'s set-back range, a busy day and a half', seed: 29, owned: ['tube', 'pushpick', 'attendant', 'bays8'], ample: true, day: 600, h0: 5, hours: 36, dt: 1 / 3, demand: HIGH, setback: SETBACK },
];
/** everything the range's business keeps from a run: takings, counts, today's counts, the car park's hours and every money event */
function business(c: Scenario, layout: ((sc: ReturnType<typeof rangeScene>) => PathNet | null) | null): string {
  const s = c.owned.reduce((q, id) => withUpgrade(q, id), defaultRangeBiz()); s.balls = newBalls(); if (c.ample) s.balls.clean = 400000; if (c.setback) s.setback = c.setback;
  const sc = rangeScene(PLOT, F, s); sc.walkNet = layout ? layout(sc) : null;
  const lot = c.setback ? setbackLot(sc) : { bays: lotBays(), entrance }, slots = c.setback ? looseBays(lot.bays, 'dirt') : withFootpath(looseBays(lot.bays, 'dirt'));
  const sim = new RangeSim(c.seed, 10); sim.setScene(sc, slots, lot.entrance); sim.setBalls(s.balls);
  const money: Record<string, number[]> = {}; sim.onMoney = (e: RangeMoneyEvent) => { const m = money[e.kind + (e.why ?? '')] ?? (money[e.kind + (e.why ?? '')] = [0, 0]); m[0]! += e.n; m[1]! += e.amount; };
  let booked = 0; const frames = Math.round(c.hours * (c.day / 24) / c.dt);
  for (let f = 0; f < frames; f++) {
    const hr = c.h0 + f * c.dt / (c.day / 24), clock = { hour: hr % 24, day: 1 + Math.floor(hr / 24) };
    for (let left = c.dt; left > 1e-9; left -= 0.5) booked += sim.step(Math.min(0.5, left), clock, s, c.demand, c.day);
    if (f % 5 === 0) sim.view();
  }
  return JSON.stringify({ booked, season: s.season, total: s.total, today: sim.today, practiceToday: sim.practiceToday, carStats: sim.carStats, money });
}
const LAYOUTS: Record<string, (sc: ReturnType<typeof rangeScene>) => PathNet | null> = {
  'the guide\'s path: car park edge, shack, behind the mats': () => PathNet.of(GUIDE),
  'car park to the shop only': () => PathNet.of(legs([50, 12], [42, 12], [34, 14])),
  'behind the mats only': () => PathNet.of(legs([48.4, 16.5], [4, 16.5])),
  'a path off the line, round by the road': () => PathNet.of([...legs([52, 6], [34, 6], [34, 14]), ...legs([34, 14], [30, 17.5], [8, 17.5])]),
  'laid along the guide\'s three rings (the scene\'s own points)': sc => PathNet.of(ringsOf(sc)),
};

test('#1295: the range earns exactly what it earned: with any path laid the takings, counts, money events and car hours of every scenario are those of the same scenario on the dirt', () => {
  for (const c of SCENARIOS) {
    const dirt = business(c, null), took = (JSON.parse(dirt) as { total: { takings: number; golfers: number } }).total;
    assert.ok(took.golfers >= 5 && took.takings > 0, `${c.name}: golfers came (${took.golfers}) and paid ($${took.takings})`);
    for (const [name, layout] of Object.entries(LAYOUTS)) assert.equal(business(c, layout), dirt, `${c.name}, ${name}`);
  }
});

// ---------------------------------------------------------------- customers on the path

/** each golfer's drawn walking outside the car park (u past its edge toward the shop), by whether it lies on the paths (within 0.35 tile): the whole of it (all), and the walk to his first stop, the line at the
 *  shop (first) */
function trace(netOf: PathNet | null | ((sc: ReturnType<typeof rangeScene>) => PathNet | null), hours = 6, dt = 1 / 30, owned: RangeUpgradeId[] = ['bays8', 'greens'], setback = 0) {
  const s = owned.reduce((q, id) => withUpgrade(q, id), defaultRangeBiz()); s.balls = newBalls(); s.balls.clean = 1e6; if (setback) s.setback = setback;
  const sc = rangeScene(PLOT, F, s), net = typeof netOf === 'function' ? netOf(sc) : netOf; sc.walkNet = net;
  const lot = setback ? setbackLot(sc) : { bays: lotBays(), entrance }, slots = setback ? looseBays(lot.bays, 'dirt') : withFootpath(looseBays(lot.bays, 'dirt'));
  const sim = new RangeSim(5, 10); sim.setScene(sc, slots, lot.entrance); sim.setBalls(s.balls);
  // (counted: the walking out of the car park, past its edge toward the shop; for a set-back range, from the guide's first ring on: the strip between its lot and the ring is dirt either way)
  const o = P(0, 0), du = { x: P(1, 0).x - o.x, y: P(1, 0).y - o.y }, dv = { x: P(0, 1).x - o.x, y: P(0, 1).y - o.y }, uOf = (p: Pt) => (p.x - o.x) * du.x + (p.y - o.y) * du.y, vOf = (p: Pt) => (p.x - o.x) * dv.x + (p.y - o.y) * dv.y;
  const skip = (p: Pt) => (setback ? vOf(p) < 15.5 || Math.hypot(p.x - sc.counter.x, p.y - sc.counter.y) < 3 : uOf(p) > 48.6);   // (and not the last 3 tiles to the counter: the line stands beside the path, a few steps off it)
  const last = new Map<number, Pt>(), per = new Map<number, { w: number; on: number; fw: number; fon: number; stopped: boolean }>(); let worst = 0, walked = 0;
  const demand = { tier: 3, exits: 2, residents: 6000 };
  for (let f = 0; f < Math.round(hours * 25 / dt); f++) {
    const h = 8 + f * dt / 25; sim.step(dt, { hour: h % 24, day: 1 }, s, demand, 600); const d = sim.view();
    for (let k = 0; k < d.nPeople; k++) {
      const p = d.people[k]!, q = last.get(p.id); last.set(p.id, { x: p.x, y: p.y });
      if (!q) continue;
      const m = Math.hypot(p.x - q.x, p.y - q.y); worst = Math.max(worst, m / dt);
      const g = per.get(p.id) ?? { w: 0, on: 0, fw: 0, fon: 0, stopped: false }; per.set(p.id, g);
      if (m < 1e-9) { if (g.fw > 0) g.stopped = true; continue; }   // (his first stop: the line, wherever it is)
      if (skip(p)) continue;                                        // (only the walking outside the car park)
      const onPath = net?.on(p.x, p.y, 0.35) ? m : 0; g.w += m; g.on += onPath; walked += m; if (!g.stopped) { g.fw += m; g.fon += onPath; }
    }
  }
  return { per, worst, walked, golfers: sim.today.golfers };
}

test('#1295: with the walking path the guide asks for, every customer is drawn on it for most of his walk from the car park to the shop; without it, on the dirt', () => {
  const net = PathNet.of(GUIDE)!, on = trace(net), off = trace(null);
  assert.ok(on.golfers >= 20 && on.per.size >= 20, `${on.per.size} customers walked`);
  const firsts = [...on.per.values()].filter(g => g.fw >= 8).map(g => g.fon / g.fw), all = [...on.per.values()].reduce((s, g) => ({ w: s.w + g.w, on: s.on + g.on }), { w: 0, on: 0 });
  assert.ok(firsts.length >= 20, `${firsts.length} walks to the line of a fair length`);
  const sorted = [...firsts].sort((p, q) => p - q), mean = firsts.reduce((s, k) => s + k, 0) / firsts.length, median = sorted[Math.floor(sorted.length / 2)]!, least = sorted[0]!;
  assert.ok(mean >= 0.85, `${(100 * mean).toFixed(0)}% of the walk from the car park to the line is on the path, on average`);
  assert.ok(median >= 0.95, `the middle customer was on it for ${(100 * median).toFixed(0)}% of it`);
  // (the few at the back of a long line walk on to their places beside the path, a few steps off it)
  assert.ok(least >= 0.4, `the customer who used it least was on it for ${(100 * least).toFixed(0)}% of that walk`);
  // (all his walking outside the car park includes the last steps to the mats and into the line, which no path covers)
  assert.ok(all.on / all.w >= 0.55, `${(100 * all.on / all.w).toFixed(0)}% of all the walking outside the car park is on the path`);
  // the same customers on the dirt: nobody is on the path (they walk across it where they cross it)
  const dirtOn = [...off.per.values()].reduce((s, g) => s + g.w, 0); assert.ok(dirtOn > 100 && off.golfers === on.golfers, 'the same customers came');
  // nobody jumped: the fastest frame of any customer is the end of one route and the first step into the line (two steps), with the path's pace on top
  assert.ok(on.worst <= (1 + PATH_PACE) * RANGE_PACE.walk + 1e-6, `fastest ${on.worst.toFixed(2)} tiles/s of ${((1 + PATH_PACE) * RANGE_PACE.walk).toFixed(2)}`);
  assert.ok(off.worst <= 2 * RANGE_PACE.walk + 1e-6, `fastest on the dirt ${off.worst.toFixed(2)}`);
});

test('#1295: the new start\'s set-back range: a path laid along the guide\'s three rings (the lot is 18 tiles from the first) is used by every customer from the first ring to the line', () => {
  const on = trace(sc => PathNet.of(ringsOf(sc)), 6, 1 / 30, ['bays8', 'greens'], SETBACK), off = trace(null, 6, 1 / 30, ['bays8', 'greens'], SETBACK);
  const firsts = [...on.per.values()].filter(g => g.fw >= 8).map(g => g.fon / g.fw);
  assert.ok(on.golfers >= 10 && firsts.length >= 10, `${on.golfers} customers, ${firsts.length} walks from the ring to the line`);
  const sorted = [...firsts].sort((p, q) => p - q), mean = firsts.reduce((s, k) => s + k, 0) / firsts.length, median = sorted[Math.floor(sorted.length / 2)]!;
  assert.ok(mean >= 0.8, `${(100 * mean).toFixed(0)}% of the walk from the first ring to the line is on the path, on average`);
  assert.ok(median >= 0.9, `the middle customer was on it for ${(100 * median).toFixed(0)}% of it`);
  assert.ok(sorted[0]! >= 0.35, `the customer who used it least: ${(100 * sorted[0]!).toFixed(0)}%`);
  assert.ok(off.golfers === on.golfers && [...off.per.values()].reduce((s, g) => s + g.on, 0) === 0, 'the same customers came, and on the dirt none is on a path');
  assert.ok(on.worst <= (1 + PATH_PACE) * RANGE_PACE.walk + 1e-6, `fastest ${on.worst.toFixed(2)} tiles/s`);
});

test('#1295: a path that only reaches the shop is used for that part of the way; one that wanders off the way is not used at all', () => {
  const shop = trace(PathNet.of(legs([48.4, 16.2], [42, 14.5], [34, 14]))!);
  let w = 0, on = 0; for (const g of shop.per.values()) { w += g.w; on += g.on; }
  assert.ok(on / w >= 0.3, `${(100 * on / w).toFixed(0)}% of the walking outside the car park is on the shop path`);
  const wander = PathNet.of(legs([52, 40], [34, 40], [34, 60]))!, away = trace(wander);
  let aw = 0, ao = 0; for (const g of away.per.values()) { aw += g.w; ao += g.on; }
  assert.equal(ao, 0, 'nobody walks 25 tiles away from the way to use a path there'); assert.ok(aw > 100);
});

// ---------------------------------------------------------------- the staff on the path

/** the attendant's walking: where he walked (outside the first two tiles of the ball room's door) and how much of it lay on the paths; his fastest frame */
function attendant(net: PathNet | null) {
  const s = ['tube', 'pushpick', 'attendant'].reduce((q, id) => withUpgrade(q, id as RangeUpgradeId), defaultRangeBiz()), book = newBalls(); s.balls = book; book.shift = 7;
  const sc = rangeScene(PLOT, F, s); sc.walkNet = net; const room = sc.ballRoom;
  const dir = { x: sc.aim.x, y: sc.aim.y }, L = Math.hypot(dir.x, dir.y);
  // a clump of balls well down the range, in line with the door
  for (let i = 0; i < 200; i++) book.field.push(P(29.4 + (i % 10) * 0.2, 70 + Math.floor(i / 10) * 0.2).x, P(29.4 + (i % 10) * 0.2, 70 + Math.floor(i / 10) * 0.2).y);
  void dir; void L;
  const sim = new RangeSim(3, 10); sim.setScene(sc, looseBays(lotBays(), 'dirt'), entrance); sim.setBalls(book);
  const dt = 1 / 30; let walked = 0, on = 0, worst = 0, frames = 0, out = 0, last: Pt | null = null;
  for (let f = 0; f < 30 * 25 * 3; f++) {
    const h = 7.2 + f * dt / 25; sim.step(dt, { hour: h % 24, day: 1 }, s, { tier: 1, exits: 2, residents: 0 }, 600); const d = sim.view();
    const a = d.agents.slice(0, d.nAgents).find(g => g.kind === 'attendant');
    if (!a) { last = null; continue; }
    if (last) { const m = Math.hypot(a.x - last.x, a.y - last.y); worst = Math.max(worst, m / dt); if (m > 1e-9 && Math.hypot(a.x - room.x, a.y - room.y) > 3) { walked += m; frames++; if (net?.on(a.x, a.y, 0.2)) on += m; out = Math.max(out, Math.hypot(a.x - room.x, a.y - room.y)); } }
    last = { x: a.x, y: a.y };
  }
  return { walked, on, worst, out, frames };
}

test('#1295: the attendant walks the path out to the balls and back when it leads there; with none, straight as he always has', () => {
  const field = PathNet.of(legs([29.4, 13], [29.4, 30], [29.4, 69]))!;
  const withPath = attendant(field), dirt = attendant(null);
  assert.ok(dirt.walked > 60 && withPath.walked > 60 && withPath.out > 40, `he walked far (${withPath.walked.toFixed(0)} tiles on the path's range, ${dirt.walked.toFixed(0)} on the dirt)`);
  assert.ok(withPath.on / withPath.walked >= 0.7, `${(100 * withPath.on / withPath.walked).toFixed(0)}% of his walking is on the path`);
  assert.equal(dirt.on, 0);
  assert.ok(withPath.worst <= AGENT_SPEED.attendant + 1e-6 && dirt.worst <= AGENT_SPEED.attendant + 1e-6, `never faster than he walks (${withPath.worst.toFixed(3)}, ${dirt.worst.toFixed(3)} of ${AGENT_SPEED.attendant})`);
});

// ---------------------------------------------------------------- you

test('#1295: your clicked route goes by a path that is close and leads the right way, along its bends; round what blocks, else as before', () => {
  const flat = () => 1, net = PathNet.of(legs([10, 10], [40, 10], [60, 30]))!;
  const a = { x: 0, y: 0 }, b = { x: 0, y: 0 }; void a; void b;
  const from = P(12, 12), to = P(58, 30), base = gridPath(from, to, flat, 256, 16);
  assert.deepEqual(routeOf(from, to, flat), base, 'no paths given: the route as before');
  const r = routeOf(from, to, flat, net), pathLegs = legs([10, 10], [40, 10], [60, 30]);
  assert.ok(r.length >= 4, 'to the path, along it, off it'); assert.ok(r.some(p => Math.hypot(p.x - P(40, 10).x, p.y - P(40, 10).y) < 1e-6), 'round the path\'s bend');
  for (let i = 1; i < r.length - 1; i++) { const p = r[i]!; assert.ok(Math.min(...pathLegs.map(l => { const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, t = Math.max(0, Math.min(1, ((p.x - l.a.x) * dx + (p.y - l.a.y) * dy) / (dx * dx + dy * dy))); return Math.hypot(l.a.x + dx * t - p.x, l.a.y + dy * t - p.y); })) < 1e-6, `point ${i} is on the path`); }
  assert.ok(r[0]!.x === from.x && r.at(-1)!.x === to.x, 'from you to the click');
  // something across the way to the path (a building: Infinity) keeps the route round it
  const wall = (x: number, y: number) => (Math.abs((x - P(11, 11).x) * 0.7 + (y - P(11, 11).y) * 0.7) < 1 && Math.abs((x - P(11, 11).x) * -0.7 + (y - P(11, 11).y) * 0.7) < 6 ? Infinity : 1);
  assert.ok(!clearOf([from, P(10, 10)], wall), 'the way to the path is blocked');
  const blocked = routeOf(from, to, wall, net); assert.ok(clearOf(blocked, wall), 'the route is clear of what blocks');
  // far from any path, or a click a few steps off: as before
  const far = P(80, 80), farTo = P(120, 100); assert.deepEqual(routeOf(far, farTo, flat, net), gridPath(far, farTo, flat, 256, 16));
  const near2 = P(12, 11), near2To = P(15, 11); assert.deepEqual(routeOf(near2, near2To, flat, net), gridPath(near2, near2To, flat, 256, 16), 'a few steps are walked straight');
});

// ---------------------------------------------------------------- the host

test('#1295: the host reads the paths round the range into the scene when the network changes, and the scene has none without any', () => {
  const boxes: number[][] = []; let ver = 1, pl: { a: Pt; b: Pt }[] = [];
  const biz = defaultRangeBiz(), ctx: RangeHostCtx = {
    biz: () => biz, plot: () => ({ rect: PLOT, facing: F }), carPark: () => ({ bays: lotBays(), entrance }), addPiece: () => null, removeProp: () => {}, setGround: () => {}, layPaths: () => {}, clearTrees: () => {},
    money: () => 1e6, spend: () => {}, book: () => {}, demand: () => ({ tier: 1, exits: 2, residents: 0 }), dayLen: () => 600, simT: () => 0, clock: () => ({ hour: 12, day: 1 }), save: () => {}, toast: () => {}, emit: () => {}, grid: () => null, layTee: () => false,
    pathLegs: b => { boxes.push([...b]); return pl; }, netVersion: () => ver,
  };
  const h = new RangeHost(ctx, 1); h.sync();
  const netOf = (): PathNet | null => h.scene!.walkNet;   // (a function call: the checks below are not narrowed by the one before)
  assert.equal(netOf(), null, 'no paths: no net'); assert.ok(boxes.length >= 2, 'asked for the front and for the wider box');
  const sc = h.scene!, wide = boxes.find(b => b[0]! <= sc.box[0] && b[3]! >= sc.box[3])!; assert.ok(wide && wide[2]! >= sc.box[2] && wide[1]! <= sc.box[1], 'the wide box holds the whole plot');
  assert.ok(wide[0]! <= sc.practice.box[0] && wide[2]! >= sc.practice.box[2], 'and the practice area beside it');
  pl = GUIDE; h.sync(); assert.equal(netOf(), null, 'read again only when the network changes'); ver++; h.sync();
  assert.equal(netOf()?.legs, GUIDE.length, 'the paths are in the scene');
  const net = netOf(); ver++; h.sync(); assert.equal(netOf(), net, 'the same paths: the same graph (not made again)');
  pl = []; ver++; h.sync(); assert.equal(netOf(), null, 'the paths bulldozed: the dirt again');
});
