// The event's headless tests (Phase 5 step 2b): the stadium site on seeds 1-3, the crowd split, the round's stages, and a City's round
// (the clock frozen at 18:00, the upkeep paid as the sim runs, kick-off to eval, the close). npm test (bundled by esbuild, run by node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateTerrain } from '../src/game/terrain';
import { townCentres } from '../src/game/lots/seedtowns';
import { crowdFor, insideSite, placeStadium } from '../src/game/event/site';
import { CARDS, DRAFT, ENTRY_S, EVENT_START_MONEY, EXPRESS_ENTRY, L1_CARS, LEVEL_MUL, PAYOUT_BASE, PAYOUT_PIVOT, PENALTY, SITE_MAX, SITE_MIN, EVENT_CLOCK, BUILD_S, SURGE_S, payout } from '../src/game/event/config';
import { Round, draftFor, type RoundSave } from '../src/game/event/round';
import { City } from '../src/game/city';
import { GAME_DAY, START_MONEY } from '../src/game/budget';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { MAP } from '../src/game/iso';
import { TC } from '../src/game/terrain/types';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

test('placeStadium on seeds 1-3: a site, fully buildable, each town centre SITE_MIN..SITE_MAX away (or the relaxed bound), deterministic', () => {
  for (const seed of [1, 2, 3]) {
    const t = generateTerrain(seed), centres = townCentres(t);
    const s = placeStadium(t.cls, centres);
    assert.ok(s, `seed ${seed}: a site`);
    const ds = centres.map(c => Math.hypot(c.x - s.c.x, c.y - s.c.y));
    const far = Math.max(...ds), near = Math.min(...ds);
    console.log(`seed ${seed}: stadium centre (${s.c.x}, ${s.c.y}), footprint (${s.x}, ${s.y}) ${s.w} x ${s.h}; town distances ${ds.map(d => d.toFixed(0)).join(', ')} tiles (bound ${SITE_MIN}-${SITE_MAX})`);
    assert.ok(near >= SITE_MIN && far <= SITE_MAX, `seed ${seed}: the distances ${near.toFixed(0)}-${far.toFixed(0)} within the bound`);
    for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) {
      const c = t.cls[y * MAP + x];
      assert.ok(c === TC.GROUND || c === TC.PATCH, `seed ${seed}: tile (${x}, ${y}) buildable`);
    }
    assert.equal(s.doors.length, 4, 'four doors');
    for (const d of s.doors) assert.ok(!insideSite(s, d.x, d.y), 'each door outside the footprint');
    assert.deepEqual(placeStadium(t.cls, centres), s, `seed ${seed}: deterministic`);
  }
});

test('placeStadium with no centres is null; on an all-GROUND map the site is found and the search is deterministic', () => {
  const cls = new Uint8Array(MAP * MAP);
  assert.equal(placeStadium(cls, []), null);
  const centres = [{ x: 300, y: 300 }, { x: 1000, y: 400 }, { x: 600, y: 1000 }];
  const s = placeStadium(cls, centres);
  assert.ok(s, 'a site on open ground');
  assert.deepEqual(placeStadium(cls, centres), s);
  assert.equal(s.c.x % 16, 0, 'the centre is on the 16-tile lattice');
});

test('crowdFor: level 1 sends L1_CARS cars and level 2 sends L1_CARS * LEVEL_MUL, split by population share; zeros split evenly; the parts sum to the total', () => {
  const T1 = Math.round(L1_CARS), T2 = Math.round(L1_CARS * LEVEL_MUL), pops = [1000, 900, 1100];
  const c1 = crowdFor(1, pops);
  assert.equal(sum(c1), T1);
  c1.forEach((c, i) => assert.ok(Math.abs(c - T1 * pops[i]! / sum(pops)) < 1, `town ${i}: its population share of ${T1}`));
  assert.equal(sum(crowdFor(2, pops)), T2);
  for (const c of crowdFor(1, [0, 0, 0])) assert.ok(Math.abs(c - T1 / 3) < 1, 'zeros split evenly');
  for (const c of crowdFor(2, [0, 0, 0])) assert.ok(Math.abs(c - T2 / 3) < 1, 'zeros split evenly (level 2)');
  const seven = crowdFor(1, [1, 1, 1, 1, 1, 1, 1]);
  assert.equal(sum(seven), T1);
  assert.ok(Math.max(...seven) - Math.min(...seven) <= 1, 'largest remainder: the parts differ by at most one');
  assert.deepEqual(crowdFor(1, []), []);
});

test('Round: start, wall(600) into surge, sim(600) into eval, close into free with one run; a mid-surge save restores as free', () => {
  const r = new Round();
  assert.equal(r.start([3, 4]), true);
  assert.equal(r.stage, 'build'); assert.equal(r.buildLeft, BUILD_S);
  assert.equal(r.start([1]), false, 'a second start is refused');
  assert.equal(r.wall(BUILD_S), true, 'the build is done');
  assert.equal(r.stage, 'surge'); assert.equal(r.surgeLeft, SURGE_S);
  assert.equal(r.sim(SURGE_S / 2), false);
  assert.equal(r.sim(SURGE_S / 2), true, 'kick-off');
  assert.equal(r.stage, 'eval');
  assert.deepEqual(r.last, { level: 1, run: 1, sent: 7, arrived: 0, rate: 0, upkeep: 0, payout: 0, net: 0, prevRate: null, stuck: [], perfect: false, byTown: [] });
  assert.equal(r.close(), false, 'refused while the draft is open');
  assert.equal(r.pick(r.draft![0]!), true);
  assert.equal(r.close(), true);
  assert.equal(r.stage, 'free'); assert.equal(r.runs, 1);

  const m = new Round();
  m.start([5]); m.wall(BUILD_S);
  const mid = Round.from(JSON.parse(JSON.stringify(m.view())));
  assert.equal(mid.stage, 'free', 'a mid-surge save restores as free');
  assert.equal(mid.level, 1); assert.equal(mid.runs, 0); assert.equal(mid.last, null);
  const done = Round.from(JSON.parse(JSON.stringify(r.view())));
  assert.equal(done.stage, 'free'); assert.equal(done.runs, 1); assert.deepEqual(done.last, r.last, 'the last result is kept');
});

/** a 3 x 3 grid of streets, 40 tiles apart, with a dead-end street (as in clock.test.ts) */
const O = 40, STEP = 40, N = 3, at = (k: number) => O + k * STEP, last = at(N - 1);
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
function gridEditor(): NetEditor {
  const e = new NetEditor(new RoadNetwork());
  for (let k = 0; k < N; k++) {
    e.addLegs([leg(O, at(k), last, at(k))], CLASS.street, 0);
    e.addLegs([leg(at(k), O, at(k), last)], CLASS.street, 0);
  }
  e.addLegs([leg(last, last, last + 120, last)], CLASS.street, 0);
  return e;
}
/** three town centres on open ground (tiles) */
const CENTRES = [{ x: 300, y: 300 }, { x: 1000, y: 400 }, { x: 600, y: 1000 }];

test('City: no site without towns, and startRound is refused with no site or a round under way', () => {
  const bare = new City(1);
  assert.equal(bare.startRound(), false);
  assert.equal(bare.round.stage, 'free');
  const city = new City(7);
  city.terrain(new Uint8Array(MAP * MAP), { x: O, y: O }, 7, CENTRES);
  city.netOps(gridEditor().commit(true));
  assert.ok(city.site, 'the towns give a site');
  assert.equal(city.startRound(), true);
  assert.equal(city.startRound(), false, 'a second round is refused');
});

test('City round: the clock freezes at 18:00; money falls with the upkeep over build and surge; kick-off ends in eval; closeRound unfreezes', () => {
  const city = new City(7);
  city.terrain(new Uint8Array(MAP * MAP), { x: O, y: O }, 7, CENTRES);
  city.netOps(gridEditor().commit(true));
  const rate = city.upkeepRate();
  assert.ok(rate > 0, `the roads cost upkeep (${rate.toFixed(2)} $ a day)`);
  assert.equal(city.startRound(), true);
  assert.equal(city.round.stage, 'build');
  assert.equal(sum(city.round.crowd), Math.round(L1_CARS), 'the crowd of level 1');
  assert.equal(city.sim.frozen, true);
  assert.ok(Math.abs(city.sim.clock % GAME_DAY - EVENT_CLOCK) < 1e-6, 'the clock stands at 18:00');

  const m0 = city.budget.money, t0 = city.sim.t;
  for (let k = 0; k < 50; k++) city.step(100); // 500 sim s of build
  assert.equal(city.round.stage, 'build', 'the build waits for its wall-clock time');
  assert.ok(Math.abs(city.sim.clock % GAME_DAY - EVENT_CLOCK) < 1e-6, 'the clock stands through the build');
  city.wall(BUILD_S / 2); assert.equal(city.round.stage, 'build');
  city.wall(BUILD_S / 2); assert.equal(city.round.stage, 'surge', 'the build is done: the surge');

  let steps = 0;
  while (city.round.stage === 'surge' && steps++ < 200) city.step(100);
  assert.equal(city.round.stage, 'eval', 'kick-off ends in eval');
  assert.ok(city.round.last, 'a result');
  assert.equal(city.round.last.sent, Math.round(L1_CARS));
  assert.ok(Math.abs(city.sim.clock % GAME_DAY - EVENT_CLOCK) < 1e-6, 'the clock stands through the surge');

  // the payout is paid at kick-off (no home reaches the stadium: rate 0, the full penalty); the rest of the fall is the upkeep
  assert.equal(city.round.last.payout, payout(0, 1), 'the payout at kick-off');
  // the land sales the town made meanwhile (the hours it catches up at the freeze, on paved roads) are income, so they are added back
  const paid = m0 - city.budget.money + city.round.last.payout + (city.budget.today.sales ?? 0), expect = rate * (city.sim.t - t0) / GAME_DAY;
  assert.ok(paid > 0, 'money fell');
  assert.ok(Math.abs(paid - expect) <= 0.01 * expect, `paid ${paid.toFixed(2)} $ about rate x time / 1440 = ${expect.toFixed(2)} $`);
  assert.ok(Math.abs(city.round.last.upkeep - paid) <= 0.01 * paid, 'the result carries the upkeep paid');
  assert.equal(city.round.last.net, city.round.last.payout - city.round.last.upkeep, 'the net: the payout less the upkeep (no toll)');

  assert.equal(city.closeRound(), false, 'refused while the draft is open');
  assert.equal(city.round.draft?.length, DRAFT, 'three cards offered');
  assert.equal(city.pickCard(city.round.draft![0]!), true);
  assert.equal(city.round.xp, 2, 'the pick is a level'); assert.equal(city.round.cards.length, 1);
  assert.equal(city.closeRound(), true);
  assert.equal(city.round.stage, 'free'); assert.equal(city.round.runs, 1);
  assert.equal(city.sim.frozen, false, 'closeRound unfreezes the clock');
});

test('payout: the curve from the pivot: PENALTY at rate 0, half of it at half the pivot, 0 at the pivot, half PAYOUT_BASE midway above it, PAYOUT_BASE at 1; level 2 is x LEVEL_MUL', () => {
  const P = PAYOUT_PIVOT;
  assert.deepEqual([0, P / 2, P, (1 + P) / 2, 1].map(r => payout(r, 1)), [-PENALTY, -PENALTY / 2, 0, PAYOUT_BASE / 2, PAYOUT_BASE]);
  assert.equal(payout(1, 2), Math.round(PAYOUT_BASE * LEVEL_MUL));
  assert.equal(payout((1 + P) / 2, 2), Math.round(PAYOUT_BASE * LEVEL_MUL / 2));
});

test('City: a new valley with town centres starts with EVENT_START_MONEY; without centres (the single town) with START_MONEY', () => {
  const bare = new City(7);
  bare.terrain(new Uint8Array(MAP * MAP), { x: O, y: O }, 7);
  assert.equal(bare.budget.money, START_MONEY);
  const city = new City(7);
  city.terrain(new Uint8Array(MAP * MAP), { x: O, y: O }, 7, CENTRES);
  assert.equal(city.budget.money, EVENT_START_MONEY);
});

test('the draft: DRAFT distinct cards at kick-off (seeded); a pick moves xp and cards once; close is refused while the draft is open; an unlock is never offered twice', () => {
  assert.deepEqual(draftFor(1, 0, []), draftFor(1, 0, []), 'the draft is seeded');
  const r = new Round();
  for (let run = 0; run < 8; run++) {
    assert.equal(r.start([5]), true);
    r.wall(BUILD_S); r.sim(SURGE_S);
    const d = r.draft!;
    assert.ok(d, 'a draft at kick-off');
    assert.equal(new Set(d).size, d.length, 'distinct cards');
    const open = CARDS.filter(c => c.kind === 'upgrade' || !r.cards.includes(c.id)).length;
    assert.equal(d.length, Math.min(DRAFT, open), 'DRAFT cards, fewer only when the pool runs short');
    for (const id of d) assert.ok(CARDS.find(c => c.id === id)!.kind === 'upgrade' || !r.cards.includes(id), `${id}: a taken unlock is not offered`);
    assert.equal(r.close(), false, 'refused with the draft open');
    if (run === 0) assert.equal(r.pick(CARDS.map(c => c.id).find(id => !d.includes(id))!), false, 'a card not in the draft is refused');
    const id = d[run % d.length]!, xp = r.xp;
    assert.equal(r.pick(id), true);
    assert.equal(r.pick(id), false, 'the draft is closed after the pick');
    assert.equal(r.xp, xp + 1); assert.equal(r.cards[r.cards.length - 1], id); assert.equal(r.draft, null);
    assert.equal(r.close(), true);
  }
  assert.equal(r.xp, 9); assert.equal(r.cards.length, 8); assert.equal(r.runs, 8);
  for (const c of CARDS) if (c.kind === 'unlock') assert.ok(r.cards.filter(id => id === c.id).length <= 1, `${c.id} taken at most once`);
});

test('Round: a perfect run raises the level on close; prevRate is the previous rate at the same level, and null once the level has risen', () => {
  const r = new Round();
  r.start([5]); r.wall(BUILD_S); r.sim(SURGE_S);
  assert.equal(r.last!.prevRate, null, 'no run before');
  r.last!.rate = 0.6; assert.equal(r.pick(r.draft![0]!), true); assert.equal(r.close(), true);
  assert.equal(r.level, 1, 'a run below the perfect rate keeps the level');
  r.start([5]); r.wall(BUILD_S); r.sim(SURGE_S);
  assert.equal(r.last!.prevRate, 0.6, 'the previous run at this level');
  r.last!.rate = 1; r.last!.perfect = true; assert.equal(r.pick(r.draft![0]!), true); assert.equal(r.close(), true);
  assert.equal(r.level, 2, 'a perfect run raises the level');
  r.start([5]); r.wall(BUILD_S); r.sim(SURGE_S);
  assert.equal(r.last!.prevRate, null, 'a new level has no previous rate');
  assert.equal(r.last!.level, 2);
});

test('old saves: xp 1, no cards, no draft; an old result reads with no payout and the net of its upkeep', () => {
  const old = { stage: 'free', level: 2, runs: 3, buildLeft: 0, surgeLeft: 0, crowd: [], upkeep: 0, toll: 0, last: { level: 2, run: 3, sent: 10, arrived: 5, rate: 0.5, upkeep: 100, byTown: [] } } as unknown as RoundSave;
  const r = Round.from(old);
  assert.equal(r.xp, 1); assert.deepEqual(r.cards, []); assert.equal(r.draft, null);
  assert.equal(r.level, 2); assert.equal(r.last!.payout, 0); assert.equal(r.last!.net, -100); assert.equal(r.last!.perfect, false);
});

test('City: the cards in a save: express holds each entrance for ENTRY_S * EXPRESS_ENTRY, double-decker seats are at least 100 on every route', () => {
  const city = new City(1);
  city.terrain(new Uint8Array(MAP * MAP), { x: 200, y: 300 }, 7);
  const e = new NetEditor(new RoadNetwork()); e.addLegs([leg(200, 300, 800, 300)], CLASS.street, 0); city.netOps(e.commit(true));
  city.setBusRoutes([{ id: 1, park: 1, sx: 395, sy: 298.5, dx: 250, dy: 298.5, buses: 2, seats: 60 }]);
  assert.equal(city.sim.busRoutes[0]!.seats, 60);
  assert.equal(city.sim.entryS, ENTRY_S);
  const r = new Round(); r.cards = ['express', 'doubledecker']; r.xp = 3;
  city.loadRound(r.view());
  assert.equal(city.sim.entryS, ENTRY_S * EXPRESS_ENTRY);
  assert.equal(city.sim.busRoutes[0]!.seats, 100);
});

test('City with towns: a perfect run raises the level and grows each town to its residents times 1 + TOWN_GROWTH (as far as its land goes); a run below the perfect rate does not', () => {
  const city = new City(7);
  city.terrain(new Uint8Array(MAP * MAP), { x: O, y: O }, 7, CENTRES);
  city.netOps(gridEditor().commit(true));
  city.stamp(60);
  const before = city.town.popK.slice();
  const playRound = () => {
    assert.equal(city.startRound(), true);
    assert.equal(city.startNow(), true);
    let steps = 0; while (city.round.stage === 'surge' && steps++ < 200) city.step(100);
    assert.equal(city.round.stage, 'eval');
  };
  playRound();
  assert.equal(city.closeRound(), false, 'the draft is open');
  city.round.last!.perfect = true; // no home reaches the stadium here, so the rate is 0: the flag is set by hand, as a perfect rate would set it
  assert.equal(city.pickCard(city.round.draft![0]!), true);
  assert.equal(city.closeRound(), true);
  assert.equal(city.round.level, 2, 'the level rises');
  assert.ok(city.grown, 'the towns grew');
  assert.deepEqual(city.grown.pops, city.town.popK, 'the residents reached');
  before.forEach((p, k) => assert.ok(city.grown!.pops[k]! >= p, `town ${k} does not shrink`));
  assert.ok(city.grown.pops.some((p, k) => p > before[k]!), 'some town grew');
  playRound();
  assert.equal(city.round.last!.perfect, false, 'a run at rate 0 is not perfect');
  assert.equal(city.pickCard(city.round.draft![0]!), true);
  const pops = city.town.popK.slice();
  assert.equal(city.closeRound(), true);
  assert.equal(city.grown, null, 'no growth below the perfect rate');
  assert.deepEqual(city.town.popK, pops);
  assert.equal(city.round.level, 2, 'the level stays');
});

test('City with towns: the books take no property or business and the career waits; the roads still cost upkeep', () => {
  const city = new City(7);
  city.terrain(new Uint8Array(MAP * MAP), { x: O, y: O }, 7, CENTRES);
  // a bigger grid than gridEditor's (six streets each way): enough land for 250 residents, a milestone
  const e = new NetEditor(new RoadNetwork()), far = at(5);
  for (let k = 0; k < 6; k++) { e.addLegs([leg(O, at(k), far, at(k))], CLASS.street, 0); e.addLegs([leg(at(k), O, at(k), far)], CLASS.street, 0); }
  city.netOps(e.commit(true));
  city.stamp(300);
  assert.ok(city.town.pop >= 250, 'the towns are big enough for a milestone');
  const d = city.dayIn();
  assert.equal([...d.lots].length, 0, 'no lots pay property');
  assert.deepEqual(d.trade, { arrived: 0, punctual: 0 }, 'no trade pays business');
  assert.ok([...d.segs].length > 0, 'the roads are still there (upkeep)');
  city.step(20);
  assert.equal(city.career.reached, 0, 'no milestones with towns');
});
