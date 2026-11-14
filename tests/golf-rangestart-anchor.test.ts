// J9 (#1268, the owner 2026-11-14: "the start should be placing the driving range ... so the guy can start where he wants"): the range start around a chosen
// spot (golf/rangestart.ts startProbe, startSpotAt, planRangeStartAt). With no anchor the start is exactly today's; with one, every invariant the automatic
// start keeps holds, or the spot is refused with a reason.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { MAP } from '../src/game/iso';
import { SITE_MARGIN } from '../src/game/event/config';
import { BLOCK } from '../src/game/lots/roads';
import { SK, type Pt } from '../src/game/network';
import { TC, generateTerrain, type Terrain } from '../src/game/terrain';
import type { Rect } from '../src/game/golf/mode';
import { COURSE_SIZES } from '../src/game/golf/place';
import { RANGE_FRONT, RANGE_PLOT } from '../src/game/golf/range';
import { NEAR, SETBACK, START_WHY, STRAIGHT, TOWN_WINDOW, bridgeRuns, planRangeStart, planRangeStartAt, startProbe, startSpotAt, type RangeStart } from '../src/game/golf/rangestart';

const terrains = new Map<number, Terrain>();
const terrain = (s: number) => { let t = terrains.get(s); if (!t) terrains.set(s, t = generateTerrain(s)); return t; };
const buildable = (c: number) => c === TC.GROUND || c === TC.PATCH;
const playable = (c: number) => buildable(c) || c === TC.HILL;
const countIn = (t: Terrain, r: Rect, ok: (c: number) => boolean): number => { let n = 0; for (let y = r[1]; y < r[1] + r[3]; y++) for (let x = r[0]; x < r[0] + r[2]; x++) if (ok(t.cls[y * MAP + x]!)) n++; return n; };
const within = (a: Rect, b: Rect) => a[0] >= b[0] && a[1] >= b[1] && a[0] + a[2] <= b[0] + b[2] && a[1] + a[3] <= b[1] + b[3];
const onBorder = (p: Pt) => p.x <= 1 || p.y <= 1 || p.x >= MAP - 2 || p.y >= MAP - 2;
const hash = (v: unknown) => createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const REASONS: readonly string[] = Object.values(START_WHY);

/** the plan of planRangeStart for seeds 1 to 12 as it was before J9 (a hash of its JSON: the road, the site, the save and the camera point) */
const BASELINE: Record<number, string> = { 1: '45f2d996ad8e87ee', 2: '3d057f7c9f8cb5ea', 3: '3fbf216e8dbdc30f', 4: 'b6e9668ff1561b78', 5: '3d360cd82ed89bfe', 6: '03bcbac3abd53692', 7: '9a3bbabbc5e3ce29', 8: '6e1180a94a2c3852', 9: '85bf173d00c173f9', 10: 'd274f7e58fc6aee4', 11: '6f2b99d39cdc0f8c', 12: '70c1ca3cccc6236f' };

test('no anchor: planRangeStart gives the start it always gave, byte for byte, for seeds 1 to 12, with or without a probe', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const t = terrain(seed);
    assert.equal(hash(planRangeStart(t, seed)), BASELINE[seed], `seed ${seed}: the plan changed`);
    if (seed % 4 === 1) assert.equal(hash(planRangeStart(t, seed, startProbe(t, seed))), BASELINE[seed], `seed ${seed}: the plan changed with a probe`);
  }
});

/** every invariant the automatic start keeps (golf-rangestart.test.ts), checked on a start made around a chosen spot */
function invariants(t: Terrain, p: RangeStart, label: string): void {
  const { site, road, save } = p, { J, axis, parcel, rangePlot, rangeFront, carpark, drive, centre } = site;
  // the road: edge to edge, no tunnel, at most two bridge runs, straight through J (a lattice point) for STRAIGHT tiles each way
  for (const e of road.exits) assert.ok(onBorder(e), `${label}: the road leaves the map at ${e.x},${e.y}`);
  assert.ok(!road.kinds.includes(SK.TUNNEL), `${label}: no tunnel`);
  assert.ok(bridgeRuns(road.kinds) <= 2, `${label}: at most 2 bridge runs`);
  assert.deepEqual(road.legs[0]!.a, road.exits[0]); assert.deepEqual(road.legs[road.legs.length - 1]!.b, road.exits[1]);
  assert.ok(road.legs.some(l => (l.a.x === J.x && l.a.y === J.y) || (l.b.x === J.x && l.b.y === J.y)), `${label}: J is a vertex of the road`);
  assert.equal(J.x % BLOCK, 0, `${label}: J on the lattice`); assert.equal(J.y % BLOCK, 0);
  const a = axis === 'x' ? J.x : J.y; assert.ok(a >= STRAIGHT && a <= MAP - 1 - STRAIGHT, `${label}: ${STRAIGHT} tiles of straight road each way`);
  const along = (q: Pt) => (axis === 'x' ? q.x : q.y) - a, cover = road.legs.filter(l => (axis === 'x' ? l.a.y === J.y && l.b.y === J.y : l.a.x === J.x && l.b.x === J.x)).flatMap(l => [along(l.a), along(l.b)]);
  assert.ok(Math.min(...cover) <= -STRAIGHT && Math.max(...cover) >= STRAIGHT, `${label}: the road runs straight through J`);
  // the parcel holds a first nine (one of the course sizes) and is 98% playable; the range plot is dry; the front, car park and the drive's corridor are buildable
  assert.ok(COURSE_SIZES.some(([w, h]) => (parcel[2] === w && parcel[3] === h) || (parcel[2] === h && parcel[3] === w)), `${label}: a course-sized parcel`);
  assert.ok(countIn(t, parcel, playable) >= 0.98 * parcel[2] * parcel[3], `${label}: the parcel is playable`);
  assert.equal(countIn(t, rangePlot, playable), rangePlot[2] * rangePlot[3], `${label}: the range plot is dry`);
  for (const r of [rangeFront, carpark]) assert.equal(countIn(t, r, buildable), r[2] * r[3], `${label}: buildable`);
  for (const r of [rangePlot, rangeFront, carpark]) assert.ok(within(r, parcel), `${label}: inside the parcel`);
  assert.equal(site.setback, SETBACK); assert.deepEqual([Math.min(rangePlot[2], rangePlot[3]), Math.max(rangePlot[2], rangePlot[3])], [RANGE_PLOT[0], RANGE_PLOT[1]]);
  assert.equal(Math.min(rangeFront[2], rangeFront[3]), RANGE_FRONT);
  // the car park fronts the road (the parcel's road edge, NEAR off the road's centre line) and the town window across the road is 75% buildable
  const across = (q: Pt) => (axis === 'x' ? q.y - J.y : q.x - J.x) * site.side, aCar = Math.min(across({ x: carpark[0], y: carpark[1] }), across({ x: carpark[0] + carpark[2], y: carpark[1] + carpark[3] }));
  assert.equal(aCar, NEAR, `${label}: the car park on the road's side of the parcel`);
  assert.equal(across(centre), -40); const [tw, td] = TOWN_WINDOW, x = axis === 'x', near = -site.side > 0 ? NEAR : -NEAR - td;
  const win: Rect = x ? [J.x - tw / 2, J.y + near, tw, td] : [J.x + near, J.y - tw / 2, td, tw];
  assert.ok(countIn(t, win, buildable) >= 0.75 * tw * td, `${label}: the town window`);
  // everything but the road keeps SITE_MARGIN off the map's edges
  for (const r of [parcel, rangePlot, rangeFront, carpark, win]) assert.ok(r[0] >= SITE_MARGIN && r[1] >= SITE_MARGIN && r[0] + r[2] <= MAP - SITE_MARGIN && r[1] + r[3] <= MAP - SITE_MARGIN, `${label}: ${r} inside the margin`);
  for (const q of [drive[0]!.a, drive[0]!.b, centre]) assert.ok(q.x >= SITE_MARGIN && q.y >= SITE_MARGIN && q.x <= MAP - SITE_MARGIN && q.y <= MAP - SITE_MARGIN, `${label}: ${q.x},${q.y}`);
  // the golf state: a range start at tier 1 with the road's exits, the parcel as the course, no holes
  assert.equal(save.start, 'range'); assert.deepEqual(save.exits, road.exits); assert.equal(save.dir, site.dir); assert.deepEqual(save.parcel, parcel);
  assert.equal(save.tees.length + save.pins.length + save.aims.length, 0);
}

test('anchors over the map on three seeds: every spot that fits keeps every invariant of the automatic start, every other is refused with one of the reasons', () => {
  let fits = 0, refused = 0;
  for (const seed of [1, 4, 7]) {
    const t = terrain(seed), p = startProbe(t, seed);
    for (let y = 40; y < MAP; y += 120) for (let x = 40; x < MAP; x += 120) {
      const s = startSpotAt(p, x, y), r = planRangeStartAt(p, x, y);
      if (s.why) { refused++; assert.ok(REASONS.includes(s.why), `${s.why}`); assert.ok('why' in r && r.why === s.why); assert.equal(s.road, null); continue; }
      fits++; assert.ok(!('why' in r)); invariants(t, r as RangeStart, `seed ${seed} at ${x},${y}`);
      // the range front's middle is within half a lattice cell of the point (the spot snaps to the town's 40-tile lattice)
      const [fx, fy, fw, fh] = s.site.rangeFront; assert.ok(Math.abs(fx + fw / 2 - x) <= BLOCK / 2 + 1 && Math.abs(fy + fh / 2 - y) <= BLOCK / 2 + 1, `seed ${seed}: the front under the point ${x},${y}`);
    }
  }
  assert.ok(fits >= 30, `only ${fits} spots fit`); assert.ok(refused >= 300, `only ${refused} refused`);
});

test('a forced facing is honoured, the automatic one prefers the last facing and falls back to another, and a spot is the same every time', () => {
  const seed = 4, t = terrain(seed), p = startProbe(t, seed);
  let tried = 0;
  for (let y = 600; y < 1500; y += 80) for (let x = 600; x < 1500; x += 80) {
    const auto = startSpotAt(p, x, y); if (auto.why) continue;
    tried++;
    for (const d of [0, 1, 2, 3] as const) {
      const f = startSpotAt(p, x, y, d); assert.equal(f.dir, d); assert.equal(f.site.dir, d);
      if (!f.why) invariants(t, planRangeStartAt(p, x, y, d) as RangeStart, `forced ${d} at ${x},${y}`); else assert.ok(REASONS.includes(f.why));
      // the preferred facing wins where it fits
      if (!f.why) assert.equal(startSpotAt(p, x, y, null, d).dir, d);
    }
    // the same point and facing: the same spot, from a second probe too
    assert.equal(hash(startSpotAt(startProbe(t, seed), x, y)), hash(auto));
    if (tried >= 6) return;
  }
  assert.ok(tried >= 6, `only ${tried} spots fit`);
});

/** a flat map of GROUND (WATER where wet(x, y)) with one town site at the middle */
function flat(wet?: (x: number, y: number) => boolean): Terrain {
  const cls = new Uint8Array(MAP * MAP).fill(TC.GROUND); const MID = Math.round(MAP / 2 / BLOCK) * BLOCK;
  if (wet) for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) if (wet(x, y)) cls[y * MAP + x] = TC.WATER;
  return { seed: 1, attempt: 0, height: new Float32Array(256 * 256), cls, waters: [], mountainEdges: [], highway: { x: 0, y: MAP / 2, edge: 'W' }, start: { x: MID - 32, y: MID - 32, size: 64 }, towns: [{ x: MID - 32, y: MID - 32, size: 64 }], chokepoints: [] };
}

test('the reasons: the map edge, water at the shop, too little open land, no room for the town, water on the range land, a road that cannot cross the water', () => {
  const MID = MAP / 2;
  // an open map: the middle fits, a corner is too close to the edge, in every facing
  let p = startProbe(flat(), 1);
  for (const d of [0, 1, 2, 3] as const) { assert.equal(startSpotAt(p, MID, MID, d).why, ''); assert.equal(startSpotAt(p, 100, 100, d).why, START_WHY.edge); assert.equal(startSpotAt(p, MAP - 100, MID, d).why, START_WHY.edge); }
  // the road needs 600 tiles of straight run each way: a spot whose J is 400 tiles from the east edge along the road is too close to it
  assert.equal(startSpotAt(p, MAP - 560, MID, 2).why, START_WHY.edge);
  // water where the shop, the car park and the drive go (a pond at the middle's front): refused whatever the facing's road
  const pond = flat((x, y) => Math.hypot(x - MID, y - MID) < 30); p = startProbe(pond, 1);
  assert.equal(startSpotAt(p, MID, MID, 2).why, START_WHY.ground);
  // water in the outfield only, away from the front, car park and drive: the range plot is not dry (the facing south: its plot runs +y from the front)
  const lake = flat((x, y) => x >= MID - 20 && x < MID - 10 && y >= MID + 100 && y < MID + 120); p = startProbe(lake, 1);
  const sp = startSpotAt(p, MID, MID, 2); assert.ok(sp.why === START_WHY.wet || sp.why === START_WHY.parcel, `${sp.why}`);
  // a river across the whole map east of the spot: every road through J crosses it, over a bridge's longest span: no road
  const river = flat(x => x >= 1300 && x < 1500); p = startProbe(river, 1);
  assert.equal(startSpotAt(p, 1000, MID, 2).why, START_WHY.road);
  assert.equal(startSpotAt(p, 1000, MID, 2).road, null);
  // two narrow rivers: bridged, the spot fits
  const two = flat(x => (x >= 1500 && x < 1520) || (x >= 400 && x < 420)); p = startProbe(two, 1);
  const bridged = planRangeStartAt(p, 1000, MID, 2); assert.ok(!('why' in bridged), 'two narrow rivers are bridged'); assert.equal(bridgeRuns((bridged as RangeStart).road.kinds), 2);
});
