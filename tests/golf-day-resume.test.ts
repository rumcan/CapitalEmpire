// T209 (#554): the owner's tournament round resumes after a reload. A golf City plays its tournament day while the owner plays in the field (his turns
// due as the engine opens them: OWNER_ADDRESS before his strike), and the save is what the engine writes (the lots, the sim time and the clock's shift,
// the town clock, the round, the books, the owner's play, and the tournament day: City.daySave). A second City loads it the way the city worker does
// (townState: restore and loadRound; townClock; resumeDay) and the golf round is built again as the engine builds it (dayRound). The day must come back as
// it was: the round in its surge (or its eval), the clocks, the crowd and the car parks, the leaderboard, and the owner at his ball with his next shot;
// played on, the board and his score must end as in the run that never reloaded. A save without a tournament day is as before, and a save from before
// T209 loads as before. npm test (bundled by esbuild, run by node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { City } from '../src/game/city';
import { MAP } from '../src/game/iso';
import { GAME_DAY } from '../src/game/budget';
import { LV, type LotTuple } from '../src/game/lots/town';
import { retime, townTimeOf } from '../src/game/sim/townclock';
import { PARTY } from '../src/game/event/config';
import { normalizeDaySave } from '../src/game/event/daysave';
import { upgradeSave, withTourney, type SaveV5 } from '../src/game/save';
import { normalizeGolfSave, type GolfPlaySave } from '../src/game/golf/mode';
import { TILE_M } from '../src/game/golf/types';
import { OWNER_ADDRESS, POWER, PUTT_POWER, allowedClubs, boardRows, championLine, dayRound, standings } from '../src/game/golf/play';
import type { Club, CourseView, Lie, OwnerInput, OwnerTurn, PlayHole, Pt } from '../src/game/golf/play';
import type { CarParkDef } from '../src/game/event/carpark';
import type { BizDef } from '../src/game/business/state';
import type { GallerySpot } from '../src/game/golf/galleries';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });

// ---------- the city: one town along a street, its car park, the clubhouse (the site), a gate and three greens' galleries, golf on ----------
const ROAD_Y = 300;
const PARK: CarParkDef = { id: 1, x: 530, y: 273, w: 50, h: 24 };
const CLUB: BizDef = { id: 1, type: 'clubhouse', x: 600, y: 310, w: 40, h: 24 };
const GREENS: GallerySpot[] = [
  { x: 620, y: 340, kind: 'green', weight: 3, cap: 400, hole: 1, fx: 620, fy: 350, ax: 620, ay: 350 },
  { x: 650, y: 340, kind: 'green', weight: 3, cap: 400, hole: 2, fx: 650, fy: 350, ax: 650, ay: 350 },
  { x: 635, y: 360, kind: 'green', weight: 5, cap: 800, hole: 3, fx: 635, fy: 370, ax: 635, ay: 370 },
];
const TIER = 1;

/** the world both cities share, in the engine's load order (the network, the car parks, the businesses, golf, the gates and spots). stamp: the town is
 *  built here (the city that plays the day); the loading city's town comes from the save instead */
function world(stamp: boolean): City {
  const city = new City(3);
  city.autoStadium = false;
  city.terrain(new Uint8Array(MAP * MAP), { x: 200, y: ROAD_Y }, 7, [{ x: 300, y: ROAD_Y }]);
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(200, ROAD_Y, 800, ROAD_Y)], CLASS.street, 0);
  for (const x of [220, 260, 340, 380, 460, 500]) e.addLegs([leg(x, ROAD_Y, x, 120)], CLASS.street, 0);
  e.addLegs([leg(220, 120, 500, 120)], CLASS.street, 0);
  city.netOps(e.commit(true));
  if (stamp) city.stamp(30);
  city.setParks([PARK]);
  city.setBusinesses([CLUB]);
  city.setGolf({ tier: TIER, rep: 40 });
  city.setGates([{ x: 600, y: 305, lanes: 2 }]);
  city.setSpots(GREENS);
  return city;
}

/** the town minute of the day now */
const minute = (c: City) => townTimeOf(c.sim.town, c.sim.t).dayMin;

// ---------- the course: the synthetic 18 holes of golf-play-owner.test.ts ----------
const PARS: (3 | 4 | 5)[] = [3, 4, 4, 5, 3, 4, 4, 4, 5, 4, 3, 4, 4, 4, 5, 4, 4, 5];
const POND = [5, 12];
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}
function course(): CourseView {
  const holes: PlayHole[] = PARS.map((par, h) => {
    const y = 20 + 60 * h, tee = { x: 10, y }, pin = { x: 10 + (par === 3 ? 160 : par === 4 ? 380 : 500) / TILE_M, y };
    return { n: h + 1, par, tee, pin, line: [tee, pin] };
  });
  const ponds = POND.map(h => ({ x: holes[h]!.tee.x + 100, y: holes[h]!.tee.y + 12.5 }));
  const lieAt = (x: number, y: number): Lie => {
    for (const h of holes) if (Math.hypot(x - h.pin.x, y - h.pin.y) <= 6) return 'green';
    for (const q of ponds) if (Math.hypot(x - q.x, y - q.y) <= 7.5) return 'water';
    let d = Infinity;
    for (const h of holes) d = Math.min(d, segDist({ x, y }, h.tee, h.pin));
    return d <= 7.5 ? 'fairway' : d <= 40 ? 'rough' : 'out';
  };
  return { holes, lieAt };
}

/** the owner's k-th input: the suggested shot moved a little, the power moved within its range, a 3-wood on every third full shot */
function varied(t: OwnerTurn, k: number): OwnerInput {
  const s: OwnerInput = { holeIdx: t.holeIdx, stroke: t.stroke, club: t.suggested.club, aim: { x: t.suggested.aim.x, y: t.suggested.aim.y }, power: t.suggested.power };
  const putting = s.club === 'putter', r = putting ? PUTT_POWER : POWER;
  const club: Club = k % 3 === 1 && !putting && allowedClubs(t.lie, t.lie === 'tee').includes('wood3') ? 'wood3' : s.club;
  const power = Math.min(r[1]!, Math.max(r[0]!, s.power * (k % 2 ? 0.9 : 1.1)));
  return { ...s, club, power, aim: { x: s.aim.x + (k % 4) * 0.7, y: s.aim.y - (k % 2) * 0.5 } };
}

/** the day's golf as the engine runs it on a city: the round of the key (dayRound), the owner's turns played as they come due (his address is
 *  OWNER_ADDRESS before his strike; the engine pauses there and his hit plays it) */
interface Golf { view: CourseView; seed: number; r: ReturnType<typeof dayRound> }
function golfOf(view: CourseView, seed: number, owner: GolfPlaySave): Golf { return { view, seed, r: dayRound(view, TIER, seed, owner) }; }
/** plays the owner's turns due by the minute; returns how many */
function playDue(g: Golf, m: number): number {
  const own = g.r.own!; let n = 0;
  while (own.turn && m >= own.turn.t - OWNER_ADDRESS) { own.live.play(varied(own.turn, own.live.inputs.length)); own.turn = own.live.advance(); n++; }
  return n;
}
/** the board as the engine's panel shows it at a minute: the top 8 and the owner's row */
const board = (g: Golf, m: number) => boardRows(standings(g.r.plan, g.view, m), g.r.plan.golfers, 8, g.r.own?.id ?? null);
const ownerStrokes = (g: Golf) => g.r.plan.strokes[g.r.own!.id]!.reduce((a, b) => a + b, 0);

/** the town's saved lots (the engine saves the lots that are not EMPTY) */
const lotsOf = (c: City): LotTuple[] => [...c.town.states.values()].filter(s => s.level !== LV.EMPTY).map(s => [s.key, s.use, s.level, s.decline, s.seed, s.since]);
/** what the engine's save keeps (Engine.save), through JSON as the save is: the lots, the sim time, the clock's shift, the town clock, the books, the round,
 *  the owner's play (GolfSave.play) and the tournament day (withTourney: City.daySave) */
function saveOf(c: City, play: GolfPlaySave) {
  const d = { version: 5, map: MAP, seed: 7, segs: [], nodes: [], props: [], money: c.budget.money, day: 1, lots: lotsOf(c), simT: c.sim.t, shift: c.sim.clock - c.sim.t,
    townClock: c.sim.town, budget: c.booksSave(), career: c.career.toJSON(), round: c.roundView(), golf: { play } } as unknown as SaveV5;
  return JSON.parse(JSON.stringify(withTourney(d, c.daySave()))) as SaveV5 & { golf: { play: GolfPlaySave } };
}
/** the load, as the engine and the city worker do it: townState (restore, loadRound), townClock (the normal rate, no tournament day), then resumeDay */
function load(s: SaveV5): { city: City; resumed: boolean } {
  const b = world(false);
  b.restore(s.lots ?? [], s.simT ?? 0, s.budget, s.money, s.career, s.shift ?? 0);
  b.loadRound(s.round);
  b.sim.town = retime(s.townClock!, b.sim.t, 1440 / b.sim.dayLen); b.tourneyDay = false;
  const resumed = s.tourney ? b.resumeDay(s.round, s.tourney) : false;
  return { city: b, resumed };
}

/** the city's tournament day started (the season's end 30 s on: the tournament day at 05:00, a game minute per sim second) */
function startDay(): City {
  const a = world(true);
  a.step(1);
  a.sim.shift = GAME_DAY - 30 - a.sim.t;
  for (let k = 0; k < 100 && a.round.stage === 'free'; k++) a.step(10);
  assert.equal(a.round.stage, 'surge', 'the tournament day is under way');
  assert.equal(a.tourneyDay, true);
  return a;
}
/** a game minute of the day (10 sim steps = 1 sim s) with the owner's turns due by then */
function stepMinute(c: City, g: Golf) { c.step(10); playDue(g, minute(c)); }
/** per town: the cars parked, turned away, lost, stranded, still on the road or gone by bus (the rest are still to leave home) */
function accounted(c: City): number[] {
  const v = c.roundView().surge!;
  return v.sent.map((_, k) => v.parked[k]! + v.turned[k]! + v.lost[k]! + v.stranded[k]! + v.onRoad[k]! + v.byBus[k]! / PARTY);
}
/** once every car has left home (kick-off): every car sent is accounted for */
function addsUp(c: City, what: string) {
  const v = c.roundView().surge!;
  accounted(c).forEach((n, k) => assert.equal(n, v.sent[k], `${what}, town ${k}: parked + turned + lost + stranded + on the road + by bus = sent`));
}

test('T209: a save at 09:30 on the tournament day, with the owner part-way round, resumes as the same day: the board and his next shot as they were, and played on, the board and his score as if no reload', () => {
  const a = startDay(), view = course(), key = a.round.runs, seed = 0x5eed + key;
  const ga = golfOf(view, seed, { key, owner: 'm', inputs: [], caddie: null });
  assert.ok(ga.r.own?.turn, 'the owner has his first turn');
  while (minute(a) < 570) stepMinute(a, ga);
  const m = minute(a), played = ga.r.own!.live.inputs.length;
  assert.ok(played >= 10 && ga.r.own!.turn, `the owner is part-way round at 09:30 (${played} shots, his next on hole ${ga.r.own!.turn!.hole})`);
  assert.ok(a.crowd && a.crowd.gallery.some(n => n > 0) && a.roundView().surge!.parked.some(n => n > 0), 'the crowd is in: cars parked and fans at the galleries');

  // the save, and the load
  const s = saveOf(a, { key, owner: 'm', inputs: ga.r.own!.live.inputs.slice(), caddie: null });
  assert.ok(s.tourney, 'the save keeps the tournament day');
  const { city: b, resumed } = load(s);
  assert.equal(resumed, true, 'the day resumes');

  // the round and the clocks
  assert.equal(b.round.stage, 'surge', 'the round is in its surge');
  assert.equal(b.round.runs, key, 'the same tournament (its key)');
  assert.equal(b.round.surgeLeft, a.round.surgeLeft, 'the same time to kick-off');
  assert.equal(b.tourneyDay, true, 'the tournament day runs on');
  assert.ok(Math.abs(minute(b) - m) < 1e-9, `the town reads the save's minute (${minute(b)} vs ${m})`);
  assert.equal(b.sim.town.rate, 1, 'a game minute per sim second');
  assert.equal(b.sim.frozen, true, 'the game clock is frozen through the round');
  assert.equal(b.sim.clock, a.sim.clock, 'at the same game time');

  // the golf, built again from the save as the engine builds it: the board, the owner's score and his next turn (his ball) as they were
  const gb = golfOf(view, seed, s.golf.play);
  assert.deepEqual(board(gb, minute(b)), board(ga, m), 'the leaderboard');
  assert.equal(ownerStrokes(gb), ownerStrokes(ga), 'the owner\'s strokes so far');
  assert.deepEqual(gb.r.own!.turn, ga.r.own!.turn, 'the owner\'s next shot: the hole, the stroke, his ball, the lie and the suggestion');
  assert.deepEqual(standings(gb.r.plan, view, m), standings(ga.r.plan, view, m), 'every golfer\'s standing');

  // the crowd and the car parks
  const va = a.roundView().surge!, vb = b.roundView().surge!;
  for (const f of ['sent', 'parked', 'turned', 'lost', 'stranded', 'onRoad', 'byBus', 'fans'] as const) assert.deepEqual(vb[f], va[f], `the surge's ${f} by town`);
  assert.deepEqual(b.crowd!.gallery, a.crowd!.gallery, 'the fans at each gallery');
  assert.deepEqual(b.crowd!.counts(), a.crowd!.counts(), 'the fans at the doors, at the stops, on the buses and at the gates');
  assert.deepEqual(b.crowd!.gate, a.crowd!.gate, 'the gates\' measurements');
  assert.equal(b.crowd!.walkers.length, a.crowd!.walkers.length, 'the walking groups');
  a.crowd!.walkers.forEach((w, i) => { const q = b.crowd!.walkers[i]!; assert.ok(Math.abs(q.x - w.x) < 0.01 && Math.abs(q.y - w.y) < 0.01 && q.n === w.n && q.stage === w.stage && q.route === w.route, `walker ${i}`); });
  assert.deepEqual(b.parkView(), a.parkView(), 'the car parks\' counts');
  const queued = (c: City) => c.sim.sinks.reduce((n, K) => n + K.q.filter(t => t >= 0).length, 0);
  let onRoad = 0; for (let i = 0; i < a.sim.cap; i++) if (a.sim.alive[i] && a.sim.party[i]! >= 0) onRoad++;
  assert.equal(queued(b), onRoad + queued(a), 'the party cars that were on the road queue at the car park\'s entrance');
  assert.deepEqual(accounted(b), accounted(a), 'every car accounted for as before the load (the rest still to leave home)');

  // played on in both: the owner's turns as they come, to the end of his round
  for (let k = 0; k < 900 && (ga.r.own!.turn || gb.r.own!.turn); k++) { stepMinute(a, ga); stepMinute(b, gb); assert.ok(Math.abs(minute(a) - minute(b)) < 1e-6, 'the clocks keep together'); }
  assert.equal(ga.r.own!.turn, null, 'the owner finished his round');
  assert.equal(gb.r.own!.turn, null, 'the owner finished his round after the reload too');
  assert.deepEqual(gb.r.own!.live.inputs, ga.r.own!.live.inputs, 'the same shots');
  assert.equal(ownerStrokes(gb), ownerStrokes(ga), 'the owner\'s score');
  assert.deepEqual(board(gb, Infinity), board(ga, Infinity), 'the final leaderboard');
  assert.equal(championLine(gb.r.plan, view), championLine(ga.r.plan, view), 'the champion');
  // the crowd played on to kick-off in both: every car is accounted for, and the fans in come out close (the cars that were on the road at the save
  // queued at the entrance at once, and the crowd's own draws start again, so not to the fan)
  for (let k = 0; k < 900 && (a.round.stage === 'surge' || b.round.stage === 'surge'); k++) { a.step(10); b.step(10); }
  assert.equal(b.round.stage, 'eval', 'kick-off after the reload');
  addsUp(a, 'kick-off, never reloaded'); addsUp(b, 'kick-off after the reload');
  const fans = (c: City) => c.round.last!.arrived;
  assert.ok(Math.abs(fans(b) - fans(a)) <= 0.1 * fans(a) + PARTY, `the fans in at kick-off: ${fans(b)} after the reload, ${fans(a)} without`);
  assert.ok(b.crowd!.gallery.some(n => n > 0), 'the galleries have their fans');
  console.log(`T209: saved at ${m} with ${played} shots played; the owner shot ${ownerStrokes(gb)} in both runs; ${championLine(gb.r.plan, view)}; fans in at kick-off ${fans(a)} / ${fans(b)}`);
});

test('T209: a save in the eval (after kick-off, the crowd going home) resumes: the round in its eval, the leaving where it was, and the day ends as before', () => {
  const a = startDay();
  while (a.round.stage === 'surge') a.step(10);
  assert.equal(a.round.stage, 'eval', 'kick-off: the eval');
  while (minute(a) < 990) a.step(10);
  const lv = a.leave!;
  assert.ok(lv && lv.next > 0 && lv.gone < lv.cars, `the crowd is going home (${lv.next} released, ${lv.gone} of ${lv.cars} gone)`);
  const s = saveOf(a, { key: a.round.runs, owner: 'm', inputs: [], caddie: null });
  const { city: b, resumed } = load(s);
  assert.equal(resumed, true);
  assert.equal(b.round.stage, 'eval');
  assert.deepEqual(b.round.last, a.round.last, 'the result');
  assert.equal(b.sim.town.rate, 1, 'the tournament day\'s clock');
  assert.ok(Math.abs(minute(b) - minute(a)) < 1e-9);
  assert.deepEqual(b.leave, a.leave, 'going home: the order, the next to leave, the cars waiting and the counts');
  assert.deepEqual(b.crowd!.gallery, a.crowd!.gallery);
  assert.deepEqual(b.parkView(), a.parkView());
  // played on: every parked car leaves, and the day ends (the clock back to the normal rate) by 22:00
  for (let k = 0; k < 500 && b.tourneyDay; k++) b.step(10);
  assert.equal(b.tourneyDay, false, 'the tournament day is over');
  assert.ok(b.leave!.gone >= b.leave!.cars || minute(b) >= 1320 - 1, `the leaving finished (${b.leave!.gone} of ${b.leave!.cars})`);
});

test('T209: a save without a tournament day is byte for byte as before (no tourney key); the day is saved only in a golf round\'s surge or eval', () => {
  const free = world(true);
  assert.equal(free.round.stage, 'free');
  assert.equal(free.daySave(), null, 'a free round: no tournament day');
  const d = { version: 5, map: MAP, seed: 7, segs: [], nodes: [], props: [], money: 1, day: 3, round: free.roundView() } as unknown as SaveV5;
  assert.equal(withTourney(d, null), d, 'the same save object');
  assert.equal(JSON.stringify(withTourney(d, free.daySave())), JSON.stringify(d), 'the same bytes');
  assert.equal('tourney' in withTourney(d, null), false);
  // a classic (stadium) round's surge: no tournament day either
  const classic = new City(3);
  classic.terrain(new Uint8Array(MAP * MAP), { x: 200, y: ROAD_Y }, 7);
  classic.site = { x: 600, y: 310, w: 40, h: 24, c: { x: 620, y: 322 }, doors: [{ x: 620, y: 305 }] };
  assert.equal(classic.startRound(), true); assert.equal(classic.startNow(), true);
  assert.equal(classic.round.stage, 'surge');
  assert.equal(classic.daySave(), null, 'a classic surge keeps today\'s save');
  // the golf day: saved in its surge, and no more once the round closes
  const a = startDay();
  assert.ok(a.daySave(), 'the surge of the tournament day is saved');
  while (a.round.stage === 'surge') a.step(100);
  assert.ok(a.daySave(), 'and its eval');
  if (a.round.draft) a.pickCard(a.round.draft[0]!);
  assert.equal(a.closeRound(), true);
  assert.equal(a.daySave(), null, 'the closed round: nothing more');
});

/** a fixture by name (tests/fixtures/saves) */
function fixture(name: string): string {
  try { return fs.readFileSync(new URL(`./fixtures/saves/${name}`, import.meta.url), 'utf8'); }
  catch { return fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/saves', name), 'utf8'); }
}

test('T209: a save from before (golf-v5-tourney-midday.json: the surge and the owner\'s play, no tourney) loads as it did: the round free, the play kept in the golf state', () => {
  const raw = JSON.parse(fixture('golf-v5-tourney-midday.json')) as SaveV5;
  const up = upgradeSave(raw);
  assert.ok(up, 'the save reads');
  assert.deepEqual(up, raw, 'unchanged by the upgrade');
  assert.equal(up.tourney, undefined);
  assert.equal(up.round?.stage, 'surge');
  const g = normalizeGolfSave(up.golf);
  assert.deepEqual(g?.play, raw.golf!.play, 'the owner\'s play is kept');
  const { city, resumed } = load(up);
  assert.equal(resumed, false, 'no day to resume');
  assert.equal(city.round.stage, 'free', 'the surge loads as free, as before T209');
  assert.equal(city.round.runs, up.round!.runs);
  assert.equal(city.tourneyDay, false);
  // a malformed day, or a day with a round that is not live, does not resume either
  assert.equal(normalizeDaySave({ t: 1 }), null);
  const b = world(false);
  b.loadRound(up.round);
  assert.equal(b.resumeDay(up.round, { t: 'x' }), false, 'a malformed day');
  assert.equal(b.resumeDay({ ...up.round!, stage: 'free' }, startDay().daySave()), false, 'a free round');
  assert.equal(b.round.stage, 'free');
});
