// T090 (#159, plan P22 2.3.2-2.3.3, 2.1.5): a range start's grown town. On a synthetic range start (a straight county road edge to edge, the town's
// seed 40 tiles across it, the owned parcel on the other side): the town's own lots (on its roads, the county road and its streets, of any
// class, and gravel) grow at (GROWN_BASE + GROWN_PER_HOLE x holes + GROWN_PER_BUILT x built) x success a season, the player's paved roads at
// PAVED_RATE; its picks fall off from the anchored centre (grownRing); a lot builds in GROWN_BUILD_S; the first lot starts in the first growth
// hour; a tournament sets the success (no stamp); the career milestones pay their grants in range starts only; a lot on a town road sells nothing.
// npm test (bundled by esbuild, run by node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { City, grownSuccess } from '../src/game/city';
import { CLASS, RoadNetwork, type Leg, type Pt } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { MAP } from '../src/game/iso';
import { NEAR } from '../src/game/golf/rangestart';
import { GROWN_BASE, GROWN_BUILD_S, GROWN_PER_HOLE, PAVED_RATE } from '../src/game/event/config';
import { grownRing, LV, type Town, type TownEvent } from '../src/game/lots/town';
import type { LotMap } from '../src/game/lots/lots';
import type { Budget } from '../src/game/budget';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const Y = 1000, A: Pt = { x: 0, y: Y }, B: Pt = { x: MAP - 1, y: Y }, J: Pt = { x: 1000, y: Y }, SEED: Pt = { x: 1000, y: Y - 40 };
const PARCEL: [number, number, number, number] = [J.x - 70, Y + NEAR, 300, 450];
/** a growth hour (sim s) */
const HOUR = 60;
type Inside = { town: Town; lots: LotMap; budget: Budget; feeKeys: Set<string> };

/** a City on open ground with the county road (a town road) and a golf state: 'range' a range start (holes, success), 'old' an old golf start */
function grownCity(kind: 'range' | 'old' = 'range', holes = 0, townBoost = 1) {
  const city = new City(3);
  city.autoStadium = false;
  city.terrain(new Uint8Array(MAP * MAP), A, 3, [SEED], undefined, true);
  city.setBudget(null, null, true);
  const editor = new NetEditor(new RoadNetwork());
  editor.net.paintData = false;
  editor.addLegs([{ a: A, b: B }], CLASS.road, 0, undefined, true);
  city.netOps(editor.commit(true));
  if (kind === 'range') city.setGolf({ tier: 1, rep: 0, land: [PARCEL], start: 'range', exits: [A, B], holes, townBoost });
  else city.setGolf({ tier: 1, rep: 0, land: [PARCEL] });
  return { city, editor };
}
/** sim seconds: City.step(10) each, the town's legs applied as the engine does (gravel, a town road); the town's events collected */
function run(city: City, editor: NetEditor, n: number, events: TownEvent[] = [], legs: (s: number) => Leg[] | null = () => null): TownEvent[] {
  for (let s = 1; s <= n; s++) {
    const r = city.step(10); events.push(...r.events.map(e => ({ ...e })));
    if (r.grow) { editor.addLegs(r.grow, CLASS.gravel, 2, undefined, true); city.netOps(editor.commit()); }
    const mine = legs(s); if (mine) { editor.addLegs(mine, CLASS.street, 0); city.netOps(editor.commit()); }
  }
  return events;
}
const builds = (ev: TownEvent[]) => ev.filter(e => e.kind === 'build');

test('24 growth hours start GROWN_BASE lots with no holes (30 +- 2), and with 9 holes GROWN_BASE + 9 x GROWN_PER_HOLE (57 +- 2)', () => {
  for (const [holes, want] of [[0, GROWN_BASE], [9, GROWN_BASE + 9 * GROWN_PER_HOLE]] as const) {
    const { city, editor } = grownCity('range', holes), n = builds(run(city, editor, 24 * HOUR)).length;
    assert.ok(Math.abs(n - want) <= 2, `holes ${holes}: ${n} lots started in a season (${want} +- 2)`);
  }
});

test("the first growth hour starts a lot, and a grown town's lot completes GROWN_BUILD_S after it starts", () => {
  const { city, editor } = grownCity(), ev = run(city, editor, HOUR);
  const first = builds(ev)[0];
  assert.ok(first, 'a lot started in the first growth hour');
  const done = run(city, editor, GROWN_BUILD_S + HOUR).find(e => e.kind === 'complete' && e.key === first!.key);
  assert.ok(done, 'it completed');
  assert.ok(Math.abs(done!.since - first!.since - GROWN_BUILD_S) <= HOUR, `after ${done!.since - first!.since} sim s (${GROWN_BUILD_S}, to the growth hour)`);
});

test("the own pick takes lots on the town's roads (the county road, its gravel); PAVED_RATE lots come only from the player's paved road", () => {
  const { city, editor } = grownCity();
  // the player's own paved street off the county road at x 1400, north, its lots the PAVED_RATE pick's only land
  const street: Leg = { a: { x: 1400, y: Y }, b: { x: 1400, y: Y - 200 } };
  const hours = 24, ev = run(city, editor, hours * HOUR, [], s => (s === 1 ? [street] : null));
  const I = city as unknown as Inside, built = builds(ev).map(e => I.lots.lots.get(e.key)!).filter(Boolean);
  const own = built.filter(l => l.seg.town || l.cls === 'gravel'), player = built.filter(l => !l.seg.town && l.cls !== 'gravel');
  assert.equal(own.length + player.length, built.length);
  assert.ok(own.some(l => l.seg.cls.id === 'road'), 'the county road (a town road, class road) grows lots of the own pick');
  assert.ok(player.every(l => Math.abs(l.c.x - 1400) < 20), "the player's lots are on the player's street");
  assert.ok(player.length > 0 && player.length <= PAVED_RATE * hours, `${player.length} lots on the player's street (at most ${PAVED_RATE} an hour)`);
});

test('the compact rings: a lot 400 tiles out weighs at most a tenth of one 50 tiles out while the town is young (the ring alone; a pick also has the contiguity, exp(-d / 40))', () => {
  for (const b of [0, 5]) assert.ok(grownRing(400, b) <= 0.1 * grownRing(50, b), `built ${b}: ${(grownRing(400, b) / grownRing(50, b)).toFixed(3)}`);
  // the ring widens with the town: at 100 built lots the same two weigh closer
  assert.ok(grownRing(400, 100) / grownRing(50, 100) > grownRing(400, 0) / grownRing(50, 0));
});

test('a tournament sets the success (clamped 0.7-1.8), no stamp; the town grows faster with it', () => {
  assert.equal(grownSuccess(0), 0.7); assert.equal(grownSuccess(1), 1.8); assert.ok(Math.abs(grownSuccess(0.0625) - 1.2) < 1e-9);
  const slow = builds(run(...Object.values(grownCity('range', 0, 1)) as [City, NetEditor], 24 * HOUR)).length;
  const fast = builds(run(...Object.values(grownCity('range', 0, 1.6)) as [City, NetEditor], 24 * HOUR)).length;
  assert.ok(fast > slow * 1.4, `success 1.6 starts ${fast} lots a season against ${slow} at 1`);
});

test('the career milestones pay their grants in range starts (Village at 250 residents) and not in an old golf game; a town-road lot sells nothing', () => {
  for (const kind of ['range', 'old'] as const) {
    const { city, editor } = grownCity(kind), I = city as unknown as Inside;
    run(city, editor, HOUR);
    const before = I.budget.money; I.town.pop = 260; run(city, editor, HOUR + 1);
    const paid = I.budget.money - before;
    if (kind === 'range') assert.ok(paid >= 10000 - 1e-6 || I.budget.money >= before + 10000 - 50, `range start: the Village grant (${paid})`);
    else assert.ok(paid < 10000, `old golf start: no grant (${paid})`);
  }
  const { city, editor } = grownCity(), I = city as unknown as Inside;
  run(city, editor, 6 * HOUR);
  const done = [...I.town.states.values()].filter(s => s.level >= LV.BUILT);
  assert.ok(done.length > 0, 'lots completed');
  assert.equal(I.feeKeys.size, 0, 'no lot on a town road paid the player');
});
