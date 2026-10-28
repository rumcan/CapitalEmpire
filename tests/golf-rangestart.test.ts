// The range start plan (golf/rangestart.ts, plan P22 2.1, T085): the county road edge to edge, the range's site beside it and the golf state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { MAP } from '../src/game/iso';
import { SITE_MARGIN } from '../src/game/event/config';
import { BLOCK } from '../src/game/lots/roads';
import { CLASS, SK, type Leg, type Pt } from '../src/game/network';
import { TC, generateTerrain, type Edge, type Terrain } from '../src/game/terrain';
import { normalizeGolfSave } from '../src/game/golf/mode';
import { GOLF_REP_START } from '../src/game/golf/start';
import type { Rect } from '../src/game/golf/mode';
import { NEAR, SETBACK, SEED_ACROSS, STRAIGHT, TOWN_WINDOW, bridgeRuns, placeRangeSite, planRangeStart, regionalRoute, type RangeStart } from '../src/game/golf/rangestart';
import { plotOfFront, plotPoint, rangeLayout } from '../src/game/golf/range';
import { rangeLot } from '../src/game/golf/rangebiz';

const VERGE = CLASS.road!.h + CLASS.road!.walk;
const terrains = new Map<number, Terrain>();
/** the terrain of a seed (cached: each takes about half a second) */
const terrain = (s: number) => { let t = terrains.get(s); if (!t) terrains.set(s, t = generateTerrain(s)); return t; };
const plans = new Map<number, RangeStart | null>();
const plan = (s: number) => { if (!plans.has(s)) plans.set(s, planRangeStart(terrain(s), s)); return plans.get(s)!; };
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);

/** a flat terrain of GROUND (WATER where wet(x, y)) with these mountain edges and one town site at the map centre */
function flat(mountainEdges: Edge[], wet?: (x: number, y: number) => boolean): Terrain {
  const cls = new Uint8Array(MAP * MAP).fill(TC.GROUND);
  if (wet) for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) if (wet(x, y)) cls[y * MAP + x] = TC.WATER;
  return { seed: 1, attempt: 0, height: new Float32Array(256 * 256), cls, waters: [], mountainEdges, highway: { x: 0, y: 1024, edge: 'W' }, start: { x: 992, y: 992, size: 64 },
    towns: [{ x: 992, y: 992, size: 64 }], chokepoints: [] };
}
/** the tiles of r that pass ok */
function countIn(t: Terrain, r: Rect, ok: (c: number) => boolean): number {
  let n = 0;
  for (let y = r[1]; y < r[1] + r[3]; y++) for (let x = r[0]; x < r[0] + r[2]; x++) if (ok(t.cls[y * MAP + x]!)) n++;
  return n;
}
const buildable = (c: number) => c === TC.GROUND || c === TC.PATCH;
const playable = (c: number) => buildable(c) || c === TC.HILL;
const within = (a: Rect, b: Rect) => a[0] >= b[0] && a[1] >= b[1] && a[0] + a[2] <= b[0] + b[2] && a[1] + a[3] <= b[1] + b[3];
const onBorder = (p: Pt) => p.x <= 1 || p.y <= 1 || p.x >= MAP - 2 || p.y >= MAP - 2;
const edgeOf = (p: Pt): Edge => (p.y <= 1 ? 'N' : p.y >= MAP - 2 ? 'S' : p.x <= 1 ? 'W' : 'E');
/** the across-road coordinate of a world point relative to J (+: the course side) */
const across = (s: RangeStart, p: Pt) => (s.site.axis === 'x' ? p.y - s.site.J.y : p.x - s.site.J.x) * s.site.side;
/** the across-road span [min, max] of a rect relative to J */
function spanAcross(s: RangeStart, r: Rect): [number, number] {
  const a = across(s, { x: r[0], y: r[1] }), b = across(s, { x: r[0] + r[2], y: r[1] + r[3] });
  return [Math.min(a, b), Math.max(a, b)];
}

test('seeds 1-12: at least 10 give a plan, with the save a range start at tier 1 and no holes', () => {
  const ok = SEEDS.filter(s => plan(s));
  assert.ok(ok.length >= 10, `only ${ok.length} of 12 seeds fit: ${ok.join(',')}`);
  for (const s of ok) {
    const p = plan(s)!;
    assert.equal(p.save.start, 'range'); assert.equal(p.save.tier, 1); assert.equal(p.save.rep, GOLF_REP_START);
    assert.deepEqual(p.save.exits, p.road.exits);
    assert.deepEqual(p.save.town, p.site.centre); assert.deepEqual(p.save.course, p.site.parcel); assert.deepEqual(p.save.parcel, p.site.parcel);
    assert.equal(p.save.tees.length + p.save.pins.length + p.save.aims.length, 0);
    assert.ok(within([p.save.clubhouse.x - 3, p.save.clubhouse.y - 3, 6, 6], [p.site.rangeFront[0] - 3, p.site.rangeFront[1] - 3, p.site.rangeFront[2] + 6, p.site.rangeFront[3] + 6]), 'the clubhouse point is the front door');
  }
});

test('the road ends on the border at two edges, with no tunnel and at most 2 bridge runs; open edges win where the axis has them', () => {
  for (const s of SEEDS) {
    const p = plan(s); if (!p) continue;
    const { road } = p;
    for (const e of road.exits) assert.ok(onBorder(e), `seed ${s}: exit ${e.x},${e.y} on the border`);
    assert.deepEqual(road.edges, road.exits.map(edgeOf), `seed ${s}: the edges match the exits`);
    assert.ok(!road.kinds.includes(SK.TUNNEL), `seed ${s}: no tunnel`);
    assert.ok(bridgeRuns(road.kinds) <= 2, `seed ${s}: at most 2 bridge runs`);
    // the legs chain from exits[0] to exits[1]
    assert.deepEqual(road.legs[0]!.a, road.exits[0]); assert.deepEqual(road.legs[road.legs.length - 1]!.b, road.exits[1]);
    for (let i = 1; i < road.legs.length; i++) assert.ok(Math.hypot(road.legs[i]!.a.x - road.legs[i - 1]!.b.x, road.legs[i]!.a.y - road.legs[i - 1]!.b.y) < 1e-6, `seed ${s}: leg ${i} chains`);
    // with both edges of its axis open, neither end is on a mountain edge
    const t = terrain(s), ends: Edge[] = p.site.axis === 'x' ? ['W', 'E'] : ['N', 'S'];
    if (!ends.some(e => t.mountainEdges.includes(e))) for (const e of road.edges) assert.ok(!t.mountainEdges.includes(e), `seed ${s}: an open end`);
  }
  // a flat map with mountains north and south: an east-west road with two open ends
  const ns = regionalRoute(flat(['N', 'S']), { x: 1000, y: 1000 }, 'x')!;
  assert.deepEqual([...ns.edges].sort(), ['E', 'W']);
  // mountains east and south: the north-south road bends at most once per half and reaches the open north edge
  const es = regionalRoute(flat(['E', 'S']), { x: 1000, y: 1000 }, 'y')!;
  assert.ok(es.edges.includes('N'), 'the open north edge');
});

test('the road: a river wider than a bridge fails, two river crossings are bridged, three are refused', () => {
  const J = { x: 1000, y: 1000 };
  // a 160-tile river across the whole map east of J: every east half crosses it, over STRUCT_MAX
  assert.equal(regionalRoute(flat([], (x) => x >= 1700 && x < 1860), J, 'x'), null);
  // two narrow rivers: two bridge runs
  const two = regionalRoute(flat([], (x) => (x >= 1700 && x < 1720) || (x >= 200 && x < 220)), J, 'x')!;
  assert.equal(bridgeRuns(two.kinds), 2);
  // three narrow rivers that no bend escapes (full-height stripes): refused
  assert.equal(regionalRoute(flat([], (x) => (x >= 1700 && x < 1720) || (x >= 1800 && x < 1820) || (x >= 200 && x < 220)), J, 'x'), null);
});

test('within 600 tiles of J the road is one axis-aligned run through J, and J is on the 40-tile lattice', () => {
  for (const s of SEEDS) {
    const p = plan(s); if (!p) continue;
    const { J, axis } = p.site;
    assert.equal(J.x % BLOCK, 0); assert.equal(J.y % BLOCK, 0);
    const near = p.road.legs.filter(l => Math.min(Math.hypot(l.a.x - J.x, l.a.y - J.y), Math.hypot(l.b.x - J.x, l.b.y - J.y)) < STRAIGHT);
    for (const l of near) {
      if (axis === 'x') { assert.equal(l.a.y, J.y, `seed ${s}: on the axis`); assert.equal(l.b.y, J.y); }
      else { assert.equal(l.a.x, J.x, `seed ${s}: on the axis`); assert.equal(l.b.x, J.x); }
    }
    // the axis line covers [J - 600, J + 600]
    const along = (q: Pt) => (axis === 'x' ? q.x : q.y) - (axis === 'x' ? J.x : J.y);
    const cover = p.road.legs.filter(l => (axis === 'x' ? l.a.y === J.y && l.b.y === J.y : l.a.x === J.x && l.b.x === J.x)).flatMap(l => [along(l.a), along(l.b)]);
    assert.ok(Math.min(...cover) <= -STRAIGHT && Math.max(...cover) >= STRAIGHT, `seed ${s}: straight for 600 tiles each way`);
    assert.ok(p.road.legs.some(l => (l.a.x === J.x && l.a.y === J.y) || (l.b.x === J.x && l.b.y === J.y)), `seed ${s}: J is a vertex`);
    // the ground legs come in pieces of at most 200 tiles straight (283 on a diagonal), joined on the lattice
    p.road.legs.forEach((l, i) => {
      if (p.road.kinds[i] !== SK.GROUND) return;
      assert.ok(Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y) <= 200 * Math.SQRT2 + 20 + 1e-6, `seed ${s}: leg ${i} is a short piece`);
      if (i > 0 && p.road.kinds[i - 1] === SK.GROUND) assert.ok(l.a.x % BLOCK === 0 && l.a.y % BLOCK === 0, `seed ${s}: the join ${l.a.x},${l.a.y} is on the lattice`);
    });
  }
});

test('the parcel lies on one side 2-6 tiles off the verge and is 98% playable; the range front and car park are buildable, inside it; T237: the plot set back, the car park in the frontage strip', () => {
  for (const s of SEEDS) {
    const p = plan(s); if (!p) continue;
    const t = terrain(s), { parcel, rangeFront, rangePlot, carpark } = p.site;
    const [a] = spanAcross(p, parcel);
    assert.ok(a - VERGE >= 2 && a - VERGE <= 6, `seed ${s}: the near edge ${a - VERGE} tiles off the verge`);
    assert.ok(countIn(t, parcel, playable) >= 0.98 * parcel[2] * parcel[3], `seed ${s}: the parcel is playable`);
    for (const r of [rangeFront, carpark]) assert.equal(countIn(t, r, buildable), r[2] * r[3], `seed ${s}: buildable`);
    for (const r of [rangePlot, rangeFront, carpark]) assert.ok(within(r, parcel), `seed ${s}: inside the parcel`);
    // T237 (#694): the plot stands SETBACK behind the parcel's road edge; the car park is in the frontage strip that leaves, on the road
    assert.ok(within(rangeFront, rangePlot), `seed ${s}: the plot holds the front`);
    assert.equal(p.site.setback, SETBACK);
    assert.equal(spanAcross(p, rangePlot)[0] - a, SETBACK, `seed ${s}: the plot ${SETBACK} tiles behind the parcel's road edge`);
    assert.ok(within(carpark, p.site.strip) && within(p.site.strip, parcel), `seed ${s}: the car park in the frontage strip`);
    assert.equal(spanAcross(p, carpark)[0], a, `seed ${s}: the car park on the parcel's road edge`);
    assert.ok(spanAcross(p, carpark)[1] < spanAcross(p, rangePlot)[0], `seed ${s}: the car park short of the plot (and of its tee box)`);
    assert.equal(Math.min(p.site.strip[2], p.site.strip[3]), SETBACK);
    assert.deepEqual([Math.min(rangePlot[2], rangePlot[3]), Math.max(rangePlot[2], rangePlot[3])], [70, 150]);
    assert.equal(Math.min(rangeFront[2], rangeFront[3]), 24);
  }
});

test('the town window across the road is 75% buildable and the seed is 40 tiles across the road from J', () => {
  for (const s of SEEDS) {
    const p = plan(s); if (!p) continue;
    const t = terrain(s), { J, axis, centre } = p.site, x = axis === 'x';
    assert.equal(across(p, centre), -SEED_ACROSS, `seed ${s}: the far side`);
    assert.equal(x ? centre.x : centre.y, x ? J.x : J.y);
    const along = TOWN_WINDOW[0], deep = TOWN_WINDOW[1], near = -p.site.side > 0 ? NEAR : -NEAR - deep;
    const win: Rect = x ? [J.x - along / 2, J.y + near, along, deep] : [J.x + near, J.y - along / 2, deep, along];
    assert.ok(countIn(t, win, buildable) >= 0.75 * along * deep, `seed ${s}: the town window`);
  }
});

test('the drive is one leg from J, at most 20 tiles past the verge and the set-back, its end on the range front', () => {
  for (const s of SEEDS) {
    const p = plan(s); if (!p) continue;
    const { drive, J, carpark } = p.site;
    assert.equal(drive.length, 1); assert.deepEqual(drive[0]!.a, J);
    const L = Math.hypot(drive[0]!.b.x - J.x, drive[0]!.b.y - J.y);
    assert.ok(L - VERGE > 0 && L - VERGE <= 20 + SETBACK, `seed ${s}: ${L - VERGE} tiles past the verge`);
    // (T237: the car park is on the road in the frontage strip, beside the drive's start; the drive runs on to the range's front)
    const e = drive[0]!.b, [f0, f1] = spanAcross(p, p.site.rangeFront), g = (q: Pt) => Math.hypot(Math.max(carpark[0] - q.x, 0, q.x - carpark[0] - carpark[2]), Math.max(carpark[1] - q.y, 0, q.y - carpark[1] - carpark[3]));
    assert.ok(across(p, e) > f0 && across(p, e) < f1, `seed ${s}: the drive's end is on the range front`);
    assert.ok(g({ x: (J.x + e.x) / 2, y: (J.y + e.y) / 2 }) <= 4 || g(J) <= 12, `seed ${s}: the car park beside the drive`);
    assert.ok(across(p, e) > 0, `seed ${s}: the drive runs to the course side`);
  }
});

test('everything but the road lies at least 64 tiles from the map edges', () => {
  const ok = (r: Rect) => r[0] >= SITE_MARGIN && r[1] >= SITE_MARGIN && r[0] + r[2] <= MAP - SITE_MARGIN && r[1] + r[3] <= MAP - SITE_MARGIN;
  for (const s of SEEDS) {
    const p = plan(s); if (!p) continue;
    const { parcel, rangePlot, rangeFront, carpark, drive, centre } = p.site;
    for (const r of [parcel, rangePlot, rangeFront, carpark]) assert.ok(ok(r), `seed ${s}: ${r}`);
    for (const q of [drive[0]!.a, drive[0]!.b, centre]) assert.ok(ok([q.x, q.y, 0, 0]), `seed ${s}: ${q.x},${q.y}`);
  }
});

test('the plan is deterministic per seed, placeRangeSite agrees with it, and normalizeGolfSave keeps start and exits', () => {
  const s = SEEDS.find(k => plan(k))!;
  assert.deepEqual(planRangeStart(terrain(s), s), plan(s));
  assert.deepEqual(placeRangeSite(terrain(s), s), plan(s)!.site);
  const g = normalizeGolfSave(JSON.parse(JSON.stringify(plan(s)!.save))) as unknown as { start: string; exits: Pt[] };
  assert.equal(g.start, 'range'); assert.deepEqual(g.exits, plan(s)!.road.exits);
});

test("the site agrees with the range's layout (T086): its car park is the layout's, and the front gives back the plot (the course grid's no-go)", () => {
  for (const s of SEEDS) {
    const p = plan(s); if (!p) continue;
    const l = rangeLayout(p.site.rangePlot, p.site.dir);
    // T237: the car park is the scene's set-back lot (rangebiz.ts rangeLot) in the frontage strip
    const [u0, u1, v0, v1] = rangeLot(p.site.setback), A = plotPoint(p.site.rangePlot, p.site.dir, u0, v0), B = plotPoint(p.site.rangePlot, p.site.dir, u1, v1);
    assert.deepEqual([Math.min(A.x, B.x), Math.min(A.y, B.y), Math.abs(B.x - A.x), Math.abs(B.y - A.y)], p.site.carpark, `seed ${s}: one car park`);
    assert.deepEqual(plotOfFront(p.site.rangeFront, p.site.dir), p.site.rangePlot, `seed ${s}: the plot from the front`);
    // the hut faces the road: its door is nearer the road than its centre
    const c = { x: l.hut.rect[0] + l.hut.rect[2] / 2, y: l.hut.rect[1] + l.hut.rect[3] / 2 };
    assert.ok(across(p, l.hut.door) < across(p, c), `seed ${s}: the hut faces the road`);
  }
});

test('a debug picture of seeds 1-4 (output/rangestart-seeds.svg)', () => {
  const C = 16, W = MAP / C, parts: string[] = [];
  const rect = (r: Rect, fill: string, stroke = 'none') => `<rect x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}" fill="${fill}" stroke="${stroke}" stroke-width="6"/>`;
  [1, 2, 3, 4].forEach((s, i) => {
    const t = terrain(s), p = plan(s), g: string[] = [];
    for (let cy = 0; cy < W; cy++) for (let cx = 0; cx < W; cx++) {
      const c = t.cls[(cy * C + C / 2) * MAP + cx * C + C / 2]!;
      if (c === TC.WATER) g.push(rect([cx * C, cy * C, C, C], '#4a8fd6')); else if (c === TC.HILL) g.push(rect([cx * C, cy * C, C, C], '#6e9a5a'));
    }
    for (const e of t.mountainEdges) g.push(`<text x="${e === 'W' ? 20 : e === 'E' ? MAP - 120 : MAP / 2}" y="${e === 'N' ? 90 : e === 'S' ? MAP - 30 : MAP / 2}" font-size="80" fill="#552">M</text>`);
    if (p) {
      const { site, road } = p, win = TOWN_WINDOW;
      const x = site.axis === 'x', near = -site.side > 0 ? NEAR : -NEAR - win[1];
      g.push(rect(x ? [site.J.x - win[0] / 2, site.J.y + near, win[0], win[1]] : [site.J.x + near, site.J.y - win[0] / 2, win[1], win[0]], 'none', '#c80'));
      g.push(rect(site.parcel, 'rgba(255,255,255,.35)', '#fff'), rect(site.rangePlot, '#9fd67f', '#264'), rect(site.rangeFront, '#e9d48a'), rect(site.carpark, '#777'));
      const line = (l: Leg, col: string, w: number) => `<line x1="${l.a.x}" y1="${l.a.y}" x2="${l.b.x}" y2="${l.b.y}" stroke="${col}" stroke-width="${w}"/>`;
      road.legs.forEach((l, k) => g.push(line(l, road.kinds[k] === SK.BRIDGE ? '#d22' : '#222', 14)));
      g.push(line(site.drive[0]!, '#a63', 10), `<circle cx="${site.centre.x}" cy="${site.centre.y}" r="24" fill="#c33"/>`);
    }
    g.push(`<text x="40" y="${MAP - 60}" font-size="110" fill="#000">seed ${s}${p ? '' : ': no plan'}</text>`);
    parts.push(`<g transform="translate(${(i % 2) * (MAP + 60)},${Math.floor(i / 2) * (MAP + 60)})"><rect width="${MAP}" height="${MAP}" fill="#d9cfa6"/>${g.join('')}</g>`);
  });
  mkdirSync('output', { recursive: true });
  writeFileSync('output/rangestart-seeds.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${2 * MAP + 60} ${2 * MAP + 60}" width="1600" height="1600">${parts.join('')}</svg>`);
});
