// T091 (#160, plan P22 2.3.1-2.3.2, 2.3.5-2.3.6): a range start's grown town keeps its roads off the course. On a synthetic range start (a straight
// county road edge to edge, the town's seed 40 tiles across it from the junction J, the owned parcel on the other side): the planner never lays a
// leg within 6 tiles of the golf land (City.blocked, every golf game), short() counts only the lots that can build (RoadPlanCtx.canBuild), the
// first leg branches off the road at J on the seed's side, a leg toward the golf land loses to an equal one away from it (RoadPlanCtx.penalty),
// and the grown town's industrial district is 80 x 80 on its side, 200-280 tiles toward the nearer exit (districts.ts grownIndustrialRect).
// npm test (bundled by esbuild, run by node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { City } from '../src/game/city';
import { CLASS, RoadNetwork, type Leg, type Pt, type Seg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { MAP } from '../src/game/iso';
import { needsLand, planExtension, seededRnd, type RoadPlanCtx } from '../src/game/lots/roads';
import { GROWN_IND_FROM, grownIndustrialRect } from '../src/game/lots/districts';
import type { LotMap } from '../src/game/lots/lots';
import type { Town } from '../src/game/lots/town';
import { NEAR } from '../src/game/golf/rangestart';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

/** the county road along y = Y (exits A west, B east), J on it, the seed 40 tiles north of J, the parcel south of the road (P22 2.1.2's layout:
 *  300 along, s in [J - 70, J + 230], 450 deep from V = NEAR tiles off the road's line, as golf/rangestart.ts lays it) */
const Y = 1000, A: Pt = { x: 0, y: Y }, B: Pt = { x: MAP - 1, y: Y }, J: Pt = { x: 1000, y: Y }, SEED: Pt = { x: 1000, y: Y - 40 };
const PARCEL: [number, number, number, number] = [J.x - 70, Y + NEAR, 300, 450];

type Inside = { net: RoadNetwork; lots: LotMap; town: Town; cls: Uint8Array };
/** a City on open ground with the county road (a town road, as the engine lays it) and a range start's golf state, and the editor that applies its legs */
function rangeCity(golf = true) {
  const city = new City(3);
  city.autoStadium = false;
  // the city's entry is the exit nearest the seed (engine.ts sendTerrain)
  city.terrain(new Uint8Array(MAP * MAP), A, 3, [SEED], undefined, golf);
  const editor = new NetEditor(new RoadNetwork());
  editor.net.paintData = false;
  editor.addLegs([{ a: A, b: B }], CLASS.road, 0, undefined, true);
  city.netOps(editor.commit(true));
  if (golf) city.setGolf({ tier: 1, rep: 0, land: [PARCEL], start: 'range', exits: [A, B] });
  return { city, editor };
}
/** sim seconds 1..n: City.step(10) each, the town's legs applied as the engine does (gravel, a town road); returns the legs laid */
function run(city: City, editor: NetEditor, n: number): Leg[] {
  const out: Leg[] = [];
  for (let s = 0; s < n; s++) { const r = city.step(10); if (r.grow) { out.push(...r.grow); editor.addLegs(r.grow, CLASS.gravel, 2, undefined, true); city.netOps(editor.commit()); } }
  return out;
}
/** the distance from a seg (its centre line) to a rect */
function segRect(s: { a: Pt; b: Pt }, [x, y, w, h]: [number, number, number, number]): number {
  let m = Infinity;
  for (let i = 0; i <= 40; i++) {
    const t = i / 40, px = s.a.x + (s.b.x - s.a.x) * t, py = s.a.y + (s.b.y - s.a.y) * t;
    m = Math.min(m, Math.hypot(Math.max(x - px, 0, px - x - w), Math.max(y - py, 0, py - y - h)));
  }
  return m;
}

test('50 planner hours: the town lays its streets, never nearer the golf land than 6 tiles (the county road itself is that far)', () => {
  const { city, editor } = rangeCity(), legs = run(city, editor, 50 * 60);
  assert.ok(legs.length >= 5, `the town laid ${legs.length} legs`);
  const near = Math.min(...legs.map(l => segRect(l, PARCEL)));
  assert.ok(near >= 6 - 1e-6, `the nearest leg is ${near.toFixed(1)} tiles from the parcel`);
  // and every town street the network holds (the county road aside) keeps that room too
  const segs = [...(city as unknown as Inside).net.segs].filter((s: Seg) => s.cls.id === 'gravel');
  assert.ok(segs.length > 0 && segs.every(s => segRect(s, PARCEL) >= 6 - 1e-6));
});

test('the first leg branches off the county road at J, on the seed\'s side (the first growth hour)', () => {
  const { city, editor } = rangeCity(), legs = run(city, editor, 60);
  assert.ok(legs.length >= 1, 'a leg in the first game hour');
  const l = legs[0]!, a = Math.abs(l.a.y - Y) < 1 ? l.a : l.b, b = a === l.a ? l.b : l.a;
  assert.ok(Math.abs(a.y - Y) < 1 && Math.abs(a.x - J.x) <= 1, `it starts on the road at J (${a.x}, ${a.y})`);
  assert.ok(b.y < Y - 5, `it heads to the seed's side (to ${b.x}, ${b.y})`);
});

test('short(): true when the only EMPTY lots in reach are on golf land (canBuild); an old golf start keeps the course off the roads too', () => {
  const { city, editor } = rangeCity();
  run(city, editor, 20 * 60);
  const I = city as unknown as Inside;
  const base: RoadPlanCtx = { net: I.net, lots: I.lots, town: I.town, cls: I.cls, entry: SEED, rnd: seededRnd(1), centre: SEED, towns: true };
  const any = needsLand({ ...base }), none = needsLand({ ...base, canBuild: () => false });
  assert.equal(none, true, 'no lot can build: short of land');
  assert.equal(needsLand({ ...base, canBuild: () => true }), any, 'canBuild true counts as before');
  // an old golf start (golf, no range start): its land blocks the town's roads as well (plan 2.3.5: every golf game)
  const old = new City(3); old.autoStadium = false; old.terrain(new Uint8Array(MAP * MAP), A, 3, [SEED], undefined, true);
  old.setGolf({ tier: 1, rep: 0, land: [PARCEL] });
  const blocked = (old as unknown as { blocked(x: number, y: number): boolean }).blocked;
  assert.equal(blocked(PARCEL[0] + 10, PARCEL[1] + 10), true, 'on the land');
  assert.equal(blocked(PARCEL[0] - 4, PARCEL[1] + 10), true, 'within 6 of it');
  assert.equal(blocked(PARCEL[0] - 9, PARCEL[1] + 10), false, 'beyond 6');
});

test('the penalty: a leg toward the golf land loses to an equal leg away from it', () => {
  const { city, editor } = rangeCity(false);
  run(city, editor, 5);
  const I = city as unknown as Inside, cen = { x: J.x, y: Y };
  // no golf here: the centre on the road, the legs off it either side score the same but for the penalty on the south (the land's) side
  const ctx = (penalty?: (m: Pt) => number): RoadPlanCtx => ({ net: I.net, lots: I.lots, town: I.town, cls: I.cls, entry: cen, rnd: seededRnd(5), centre: cen, towns: true, canBuild: () => false, penalty });
  const sideOf = (legs: Leg[] | null) => { assert.ok(legs && legs.length); const l = legs![0]!; return Math.sign((l.a.y + l.b.y) / 2 - Y); };
  const south = (m: Pt) => (m.y > Y && Math.hypot(Math.max(PARCEL[0] - m.x, 0, m.x - PARCEL[0] - PARCEL[2]), Math.max(PARCEL[1] - m.y, 0, m.y - PARCEL[1] - PARCEL[3])) < 40 ? 40 : 0);
  for (let k = 0; k < 5; k++) assert.equal(sideOf(planExtension(ctx(south))), -1, 'with the penalty the leg goes north, away from the land');
  const sides = new Set<number>(); for (let k = 0; k < 20; k++) sides.add(sideOf(planExtension({ ...ctx(), rnd: seededRnd(100 + k) })));
  assert.ok(sides.has(1), 'without it a leg may go south (an equal score)');
});

test('the grown town\'s industrial district: 80 x 80, on its side, 200-280 tiles from the seed toward the nearer exit, off the golf land', () => {
  const east = { x: 1, y: 0 }, r = grownIndustrialRect(SEED, east, [PARCEL])!;
  assert.ok(r, 'it fits');
  assert.deepEqual([r[2], r[3]], [80, 80]);
  assert.ok(r[0] - SEED.x >= 200 - 1e-9 && r[0] + r[2] - SEED.x <= 280 + 1e-9, `200-280 tiles east of the seed (${r[0]}..${r[0] + r[2]})`);
  assert.ok(Math.abs(r[1] + r[3] / 2 - SEED.y) < 1e-9, "centred on the seed's line, on the town's side of the road");
  const [x, y, w] = PARCEL;
  assert.ok(r[1] + r[3] <= y - 6 || r[0] >= x + w + 6 || r[0] + r[2] <= x - 6, 'off the golf land (and 6 tiles of it)');
  // a parcel in the way: none
  assert.equal(grownIndustrialRect(SEED, east, [[SEED.x + 220, SEED.y - 20, 40, 40]]), null);
  assert.equal(GROWN_IND_FROM, 250);
});
