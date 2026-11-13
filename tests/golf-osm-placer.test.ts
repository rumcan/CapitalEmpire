// T356 (#998): the placing mode (golf/osm/placer.ts) driven with a made-up host: a course taken in hand, turned, moved, priced, asked about, and either laid
// (Place it) or left untouched (Cancel, Esc, a pose that cannot go there); the grid diff that lays it (placegrid.ts); the Course menu's entry for it.
import { describe, it } from 'node:test';
import { MAP } from '../src/game/iso';
import assert from 'node:assert/strict';
import { RealPlacer, type RealHost } from '../src/game/golf/osm/placer';
import { goesPhrase, popupText, planPlace, type PlaceLot, type PlaceSeg, type PlaceWorld } from '../src/game/golf/osm/place';
import { compensation } from '../src/game/budget';
import { OSM_COURSES, loadOsmSpec } from '../src/game/golf/osm';
import { coverOutline, coverStrips, rectsArea, rotateSpec } from '../src/game/golf/osm/rotate';
import { gridBuildCost, placeDiff, scratchOf } from '../src/game/golf/osm/placegrid';
import { SURF, applyDiff, makeGrid } from '../src/game/ext/course-grid';
import { RAIL } from '../src/ui/rail-items';
import { menuOf, leavesOf, type MenuCtx } from '../src/ui/flyout-menu';
import { unitBuildCost } from '../src/game/golf/costs';
import { normalizeGolfSave, type GolfSave, type Rect } from '../src/game/golf/mode';

/** a host with a made-up world: an empty plain unless given lots or roads, the treasury as set, every call written down */
function host(over: { map?: number; money?: number; lots?: PlaceLot[]; segs?: PlaceSeg[]; holes?: number; lay?: RealHost['lay'] } = {}) {
  const log = { toasts: [] as { text: string; kind?: string }[], emits: 0, entered: 0, laid: [] as unknown[] };
  const state = { money: over.money ?? 1e12, rev: 0 };
  const lots = over.lots ?? [], segs = over.segs ?? [];
  const h: RealHost = {
    map: over.map ?? MAP,
    world: (_fresh?: boolean): PlaceWorld => ({
      map: over.map ?? MAP, owned: [], river: () => false, lots, farms: [], segs, pop: 0, townCentre: null, entries: [], targets: [], keep: [], money: state.money, roundLive: false,
      segsNear: (x, y, r) => segs.filter(s => Math.min(s.a.x, s.b.x) - r <= x && x <= Math.max(s.a.x, s.b.x) + r && Math.min(s.a.y, s.b.y) - r <= y && y <= Math.max(s.a.y, s.b.y) + r),
      isCourseRoad: () => false, valuePerTile: () => 10, compensation: l => compensation(l),
    }),
    revision: () => String(state.rev), centre: () => ({ x: 512, y: 512 }),
    toast: (text, kind) => { log.toasts.push({ text, kind }); }, emit: () => { log.emits++; }, enter: () => { log.entered++; },
    holes: () => over.holes ?? 0,
    lay: over.lay ?? (c => { log.laid.push(c); return true; }),
  };
  return { h, log, state };
}
const lot = (key: string, x: number, y: number): PlaceLot => ({ key, o: [x, y], u: [1, 0], n: [0, 1], w: 10, d: 15, use: 1, level: 2, decline: 0 });

describe('the placing mode (T356)', () => {
  it('takes a shipped course in hand: Select in hand, a hint, the course at the camera’s middle, not turned', async () => {
    const { h, log } = host(), r = new RealPlacer(h);
    assert.equal(r.active, false);
    assert.equal(await r.start('rondebosch'), true);
    assert.equal(r.active, true);
    assert.equal(r.deg, 0);
    assert.deepEqual(r.at, { x: 512, y: 512 });
    assert.equal(log.entered, 1);
    assert.match(log.toasts.at(-1)!.text, /R turns it/);
    const v = r.view()!;
    assert.equal(v.name, 'Rondebosch Golf Course');
    assert.equal(v.credit, '© OpenStreetMap contributors');
    assert.equal(v.holes, 18);
    assert.equal(v.popup, null);
    assert.ok(v.plan && v.label);
  });

  it('says so, and takes nothing in hand, for a course that is not shipped or one the map cannot hold in any turn', async () => {
    const a = host(), r = new RealPlacer(a.h);
    assert.equal(await r.start('augusta-national'), false);
    assert.equal(r.active, false);
    assert.match(a.log.toasts.at(-1)!.text, /not in this build/);
    // a map of 500 tiles holds a land 688 x 610 in no direction (the map cannot grow: the course is refused with the way out)
    const b = host({ map: 500 }), s = new RealPlacer(b.h);
    assert.equal(await s.start('rondebosch'), false);
    assert.equal(s.active, false);
    assert.match(b.log.toasts.at(-1)!.text, /bigger than the map in every direction.*cannot grow.*smaller or a scaled course/);
    // every shipped course fits the map (T444: Woodhill at true size on the 4 km map)
    for (const c of OSM_COURSES) { const x = host(), p = new RealPlacer(x.h); assert.equal(await p.start(c.id), true, c.id); }
  });

  it('turns with R (15° on, Shift+R back), from any angle to the next step, one degree with Alt, freely with the wheel; never past a whole turn', async () => {
    const { h } = host(), r = new RealPlacer(h);
    await r.start('rondebosch');
    r.turn(1); assert.equal(r.deg, 15);
    r.turn(1); r.turn(1); assert.equal(r.deg, 45);
    r.turn(-1); assert.equal(r.deg, 30);
    r.turn(1, true); assert.equal(r.deg, 31, 'Alt: one degree');
    r.turn(1); assert.equal(r.deg, 45, 'on to the next step');
    r.turnBy(-23.5); assert.equal(r.deg, 21.5);
    r.turn(-1); assert.equal(r.deg, 15, 'back to the step below');
    r.turn(-1); r.turn(-1); assert.equal(r.deg, 345, 'round the other way');
    for (let i = 0; i < 24; i++) r.turn(1);
    assert.equal(r.deg, 345, 'a whole turn is a whole turn');
    // the turned spec is the one rotateSpec makes, and the land’s box turns
    const t = r.turned()!, s = await loadOsmSpec('rondebosch');
    assert.deepEqual(t, rotateSpec(s!, 345));
  });

  it('follows the pointer in whole tiles, and prices where it stands: green with the price when the money holds', async () => {
    const { h } = host({ money: 1e9 }), r = new RealPlacer(h);
    await r.start('rondebosch');
    r.move({ x: 400.4, y: 520.6 });
    assert.deepEqual(r.at, { x: 400, y: 521 });
    const p = r.plan()!;
    assert.ok(p.ok && p.fits);
    assert.equal(p.demolish, 0);
    assert.ok(p.land.price > 1e6, `the land of ${p.land.ha} ha costs ${p.land.price}`);
    assert.ok(p.build > 100000, `the surfaces cost ${p.build}`);
    assert.equal(p.total, p.land.price + p.build);
    const l = r.view()!.label!;
    assert.equal(l.bad, false);
    assert.match(l.text, /^Rondebosch Golf Course · \$[\d,]+ · click to place$/);
    // the same plan is handed back until the pose or the world changes
    assert.equal(r.plan(), p);
  });

  it('is red with the shortfall when the money is short, and a click then opens nothing', async () => {
    const { h, log, state } = host({ money: 1000 }), r = new RealPlacer(h);
    await r.start('rondebosch');
    const p = r.plan()!;
    assert.equal(p.affordable, false);
    assert.equal(p.ok, false);
    assert.equal(p.short, p.total - 1000);
    const l = r.view()!.label!;
    assert.ok(l.bad);
    assert.match(l.text, /^Not enough money: \$[\d,]+ \(short \$[\d,]+\)$/);
    r.click();
    assert.equal(r.confirming, null, 'no pop-up for a course you cannot pay for');
    assert.match(log.toasts.at(-1)!.text, /Not enough money/);
    assert.equal(log.laid.length, 0);
    // the treasury grows and the same pose turns green
    state.money = 1e12; state.rev++;
    assert.ok(r.plan()!.ok);
  });

  it('is red off the map, and a click there says why and opens nothing', async () => {
    const { h, log } = host(), r = new RealPlacer(h);
    await r.start('rondebosch');
    r.move({ x: 100, y: 512 });
    assert.equal(r.plan()!.whyKind, 'map');
    r.click();
    assert.equal(r.confirming, null);
    assert.match(log.toasts.at(-1)!.text, /Off the map/);
    assert.equal(log.laid.length, 0);
  });

  it('asks before it lays: a click opens the pop-up that lists what goes; Cancel leaves everything as it was (nothing laid, nothing paid)', async () => {
    const lots = [lot('a', 500, 500), lot('b', 510, 500)], segs: PlaceSeg[] = [{ a: { x: 100, y: 512 }, b: { x: 900, y: 512 }, cls: { id: 'street', h: 2, walk: 2 }, kind: 0 }];
    const { h, log } = host({ lots, segs, holes: 9 }), r = new RealPlacer(h);
    await r.start('rondebosch');
    r.click();
    assert.ok(r.confirming, 'the pop-up is open');
    const v = r.view()!;
    assert.ok(v.popup);
    assert.match(v.popup!.text, /^This will buy [\d,]+ ha, demolish 2 houses and [\d.,]+ km of road \(\$[\d,]+\)\./);
    assert.match(v.popup!.text, /Roads cut by the course end at its boundary/);
    assert.equal(v.popup!.replaces, 9, 'the pop-up knows it replaces the nine holes');
    assert.deepEqual(v.popup!.lines.map(l => l.label.split(' ·')[0]), ['Land', 'Buildings bought out', 'Roads taken', 'The course laid']);
    // the pose cannot move or turn under the pop-up
    const at = r.at, deg = r.deg;
    r.move({ x: 300, y: 300 }); r.turn(1); r.turnBy(30);
    assert.deepEqual([r.at, r.deg], [at, deg]);
    r.closePopup();
    assert.equal(r.confirming, null);
    assert.equal(r.active, true, 'the course is still in hand');
    assert.equal(log.laid.length, 0, 'Cancel lays nothing');
    // Esc/cancel puts the course down: still nothing laid
    r.cancel();
    assert.equal(r.active, false);
    assert.equal(r.view(), null);
    assert.equal(log.laid.length, 0);
  });

  it('lays on Place it: the host gets the plan worked out again now, the spec and its turn; the mode ends', async () => {
    const lots = [lot('a', 500, 500)];
    const { h, log, state } = host({ lots }), r = new RealPlacer(h);
    await r.start('magnolia-national');
    r.turn(1); r.turn(1);
    r.click();
    assert.ok(r.confirming);
    const before = r.confirming!;
    state.rev++;
    assert.equal(r.confirm(), true);
    assert.equal(log.laid.length, 1);
    const c = log.laid[0] as { id: string; deg: number; plan: typeof before; turned: { rot?: number } };
    assert.equal(c.id, 'magnolia-national');
    assert.equal(c.deg, 30);
    assert.equal(c.turned.rot, 30);
    assert.deepEqual(c.plan.cover, before.cover);
    assert.equal(r.active, false, 'laid: the mode ends');
  });

  it('does not lay if, by the time Place it is pressed, the pose can no longer go there or the money has gone', async () => {
    const { h, log, state } = host(), r = new RealPlacer(h);
    await r.start('rondebosch');
    r.click();
    assert.ok(r.confirming);
    state.money = 5;
    assert.equal(r.confirm(), false);
    assert.equal(log.laid.length, 0);
    assert.equal(r.confirming, null);
    assert.match(log.toasts.at(-1)!.text, /Not enough money/);
    assert.equal(r.active, true, 'the course stays in hand');
  });

  it('keeps the course in hand when the host could not lay it', async () => {
    const { h } = host({ lay: () => false }), r = new RealPlacer(h);
    await r.start('rondebosch');
    r.click();
    assert.equal(r.confirm(), false);
    assert.equal(r.active, true);
  });

  it('puts a second pick in place of the first, and a course put down while it loads stays down', async () => {
    const { h } = host(), r = new RealPlacer(h);
    await r.start('rondebosch');
    await r.start('woodhill');
    assert.equal(r.id, 'woodhill');
    const p = r.start('magnolia-national'); r.cancel();
    assert.equal(await p, false);
    assert.equal(r.active, false);
  });
});

describe('the grid diff of a placed course (T356)', () => {
  const COVER: Rect[] = [[10, 10, 40, 30]];

  it('lays the painted spec into the cover and clears the old holes outside it, leaving the property’s own paint', () => {
    // (a hand-made scratch grid for the cover’s 40 x 30 tiles; the real courses’ own are checked below)
    const g = makeGrid(0, 0, 200, 160); // 100 x 80 tiles
    const scratch = makeGrid(10, 10, 80, 60); // the cover’s 40 x 30 tiles
    scratch.surf.fill(SURF.rough); scratch.hole.fill(0);
    for (let y = 10; y < 30; y++) for (let x = 20; x < 60; x++) { scratch.surf[y * scratch.w + x] = SURF.fairway; scratch.hole[y * scratch.w + x] = 4; }
    // old things on the grid: a hole 2 fairway outside the cover, a practice green (hole 0) outside, a hole 3 tee inside the cover, a carved cell inside
    const at = (x: number, y: number) => y * g.w + x;
    for (let x = 100; x < 120; x++) { g.surf[at(x, 100)] = SURF.fairway; g.hole[at(x, 100)] = 2; }
    for (let x = 100; x < 120; x++) { g.surf[at(x, 110)] = SURF.green; g.hole[at(x, 110)] = 0; }
    g.surf[at(30, 30)] = SURF.tee; g.hole[at(30, 30)] = 3; g.carve![at(31, 30)] = 1;
    const d = placeDiff(g, scratch, COVER, true);
    applyDiff(g, d, false);
    assert.equal(g.surf[at(25, 25)], SURF.rough, 'inside the cover: the scratch grid’s surface');
    assert.equal(g.surf[at(45, 45)], SURF.fairway); assert.equal(g.hole[at(45, 45)], 4);
    assert.equal(g.surf[at(30, 30)], SURF.rough, 'the old tee under it is gone'); assert.equal(g.hole[at(30, 30)], 0);
    assert.equal(g.carve![at(31, 30)], 0, 'a carve mark goes with it');
    assert.equal(g.surf[at(100, 100)], SURF.none, 'the old hole 2 outside the cover is cleared'); assert.equal(g.hole[at(100, 100)], 0);
    assert.equal(g.surf[at(100, 110)], SURF.green, 'the practice green (no hole) outside stays');
    assert.equal(g.surf[at(5, 5)], SURF.none, 'outside the cover and not a hole: untouched');
    // the diff is exactly the cells that changed, and undoing it restores the grid
    let changed = 0; for (let i = 0; i < d.n; i++) if (d.s0[i] !== d.s1[i] || d.h0[i] !== d.h1[i]) changed++;
    assert.equal(changed, d.n);
    applyDiff(g, d, true);
    assert.equal(g.surf[at(100, 100)], SURF.fairway); assert.equal(g.hole[at(100, 100)], 2); assert.equal(g.surf[at(30, 30)], SURF.tee); assert.equal(g.carve![at(31, 30)], 1);
  });

  it('leaves the cells on the river unpainted (none), and clears what was there: the river runs through the course', () => {
    const g = makeGrid(0, 0, 200, 160), scratch = makeGrid(10, 10, 80, 60);
    scratch.surf.fill(SURF.fairway); scratch.hole.fill(5);
    const row = 40 * g.w; // tile y 20: inside the cover
    g.surf[row + 26] = SURF.rough; // an old cell on the river: cleared
    const d = placeDiff(g, scratch, COVER, true, x => x >= 12 && x < 14); // tile x 12 to 14 (cells 24 to 27) is the river
    applyDiff(g, d, false);
    for (const cx of [24, 25, 26, 27]) assert.equal(g.surf[row + cx], SURF.none, `cell ${cx} is on the river`);
    assert.equal(g.surf[row + 23], SURF.fairway, 'beside the river: the course');
    assert.equal(g.surf[row + 28], SURF.fairway); assert.equal(g.hole[row + 28], 5);
    assert.equal(g.surf[row + 50], SURF.fairway);
  });

  it('keeps the old holes with clearHoles off, and leaves out the cells that would not change', () => {
    const g = makeGrid(0, 0, 200, 160), scratch = makeGrid(10, 10, 80, 60);
    g.surf[100 * g.w + 100] = SURF.fairway; g.hole[100 * g.w + 100] = 2;
    const d = placeDiff(g, scratch, COVER, false);
    assert.equal(d.n, 0, 'an empty scratch grid over an empty cover changes nothing');
    scratch.surf[0] = SURF.green; scratch.hole[0] = 1;
    assert.equal(placeDiff(g, scratch, COVER, false).n, 1);
    applyDiff(g, placeDiff(g, scratch, COVER, false), false);
    assert.equal(g.surf[100 * g.w + 100], SURF.fairway, 'with clearHoles off the old hole stays');
  });

  it('prices the surfaces of a painted grid at the paint tool’s rates: a cell is a square metre', () => {
    const g = makeGrid(0, 0, 100, 100);
    g.surf.fill(SURF.none);
    for (let i = 0; i < 1000; i++) g.surf[i] = SURF.rough;
    for (let i = 1000; i < 1100; i++) g.surf[i] = SURF.green;
    for (let i = 1100; i < 1150; i++) g.surf[i] = SURF.water;
    assert.equal(gridBuildCost(g), Math.round(1000 * unitBuildCost('rough', 'seed') + 100 * unitBuildCost('green', 'seed') + 50 * unitBuildCost('water', 'seed')));
    assert.equal(gridBuildCost(g), 800 + 600 + 500);
  });

  it('prices a real course from its painted spec: the same at every turn, to the rim of the rasteriser', async () => {
    const spec = (await loadOsmSpec('rondebosch'))!;
    const a = gridBuildCost(scratchOf(spec, 0, 0)), b = gridBuildCost(scratchOf(rotateSpec(spec, 90), 0, 0));
    assert.ok(a > 100000 && a < 5e6, `${a}`);
    assert.ok(Math.abs(a - b) <= a * 0.01, `unturned ${a}, turned ${b}`);
  });
});

describe('the outline of the cover (T356)', () => {
  it('is the four corners for one rectangle and a staircase that holds exactly the cover for a turned land', async () => {
    assert.deepEqual(coverOutline([[10, 20, 30, 40]]), [10, 20, 10, 60, 40, 60, 40, 20]);
    const spec = (await loadOsmSpec('rondebosch'))!, cover = coverStrips(rotateSpec(spec, 30).outline!.map((v, i) => v + (i % 2 ? 100 : 80)));
    const poly = coverOutline(cover);
    let a = 0; for (let i = 0, n = poly.length >> 1; i < n; i++) { const j = (i + 1) % n; a += poly[2 * i]! * poly[2 * j + 1]! - poly[2 * j]! * poly[2 * i + 1]!; }
    assert.equal(Math.abs(a) / 2, rectsArea(cover), 'the outline encloses the cover’s area');
  });
});

describe('Course › Place a real course (T356)', () => {
  const ctx = (o: Partial<MenuCtx> = {}): MenuCtx => ({
    golf: true, ui: null, roads: [], paths: [], junctions: [], surfaces: [], cares: [], propGroups: [], materials: [], plants: [], newHoleWhy: null, range: [],
    real: OSM_COURSES.map(c => ({ id: c.id, name: c.name, place: c.place, holes: c.holes, par: c.par })), ...o,
  });
  it('is a group in the Course flyout with a leaf for each shipped course, each taking its course in hand', () => {
    const rows = menuOf(RAIL.find(r => r.id === 'course')!, ctx());
    const g = rows.find(r => r.label === 'Place a real course…');
    assert.ok(g, 'the group');
    assert.deepEqual(g!.children!.map(r => r.label), ['Rondebosch Golf Course', 'Magnolia National', 'Woodhill Country Club']);
    assert.deepEqual(g!.children!.map(r => r.leaf?.act), OSM_COURSES.map(c => ({ k: 'real', id: c.id })));
    assert.ok(g!.children![0]!.note!.includes('Cape Town') && g!.children![0]!.note!.includes('18 holes'));
    assert.ok(leavesOf(rows).some(l => l.row.leaf?.act?.k === 'real'), 'reachable by a flyout path');
    assert.ok(rows.map(r => r.label).indexOf('Place a real course…') > rows.map(r => r.label).indexOf('Buildings'));
  });
  it('is not in a classic game or when the game ships no course', () => {
    assert.ok(!menuOf(RAIL.find(r => r.id === 'course')!, ctx({ golf: false })).some(r => r.label === 'Place a real course…'));
    assert.ok(!menuOf(RAIL.find(r => r.id === 'course')!, ctx({ real: [] })).some(r => r.label === 'Place a real course…'));
    assert.ok(!menuOf(RAIL.find(r => r.id === 'course')!, ctx({ real: undefined })).some(r => r.label === 'Place a real course…'));
  });
});

describe('what a placed course saves (T356)', () => {
  const base = { v: 1, tier: 1, rep: 0, town: { x: 10, y: 10 }, course: [0, 0, 50, 50], parcel: [0, 0, 100, 100], dir: 0, tees: [], pins: [], aims: [], clubhouse: { x: 5, y: 5 } } as unknown as GolfSave;
  const info = { id: 'rondebosch', name: 'Rondebosch Golf Course', place: 'Cape Town', credit: '© OpenStreetMap contributors', licence: 'ODbL', source: 'relation/1', holes: 18, par: 72, mappedPar: 72 };
  it('keeps the land’s rects (well formed ones only) and the course’s credit, its turn and that it was placed', () => {
    const g = normalizeGolfSave({ ...base, courseRects: [[10, 10, 40, 30], [0, 0, 0, 5], [1, 1, NaN, 2]] as Rect[], osm: { ...info, placed: true, turn: 30 } })!;
    assert.deepEqual(g.courseRects, [[10, 10, 40, 30]]);
    assert.equal(g.osm?.placed, true);
    assert.equal(g.osm?.turn, 30);
    assert.equal(g.osm?.credit, '© OpenStreetMap contributors');
    // a map-data game laid on the flat map has no `placed` (the loader then lays the flat map again) and no rects
    const flat = normalizeGolfSave({ ...base, osm: { ...info, entry: { x: 0, y: 512, edge: 'W' } } })!;
    assert.equal(flat.osm?.placed, undefined);
    assert.deepEqual(flat.osm?.entry, { x: 0, y: 512, edge: 'W' });
    assert.equal(flat.courseRects, undefined);
    // an ordinary game has neither
    const plain = normalizeGolfSave(base)!;
    assert.equal(plain.osm, undefined); assert.equal(plain.courseRects, undefined);
  });
  it('says only the hectares and the price in the pop-up when nothing stands on the land', () => {
    const w = { map: 1024, owned: [], river: () => false, lots: [], farms: [], segs: [], segsNear: () => [], pop: 0, townCentre: null, entries: [], targets: [], keep: [], money: 1e9, roundLive: false, isCourseRoad: () => false, valuePerTile: () => 0, compensation: () => 0 } as unknown as PlaceWorld;
    const p = planPlace(w, { w: 100, h: 50 }, { x: 500, y: 500, deg: 0 }, 1000);
    assert.equal(goesPhrase(p), '');
    assert.equal(popupText(p), 'This will buy 2 ha ($26,000).');
  });
});
