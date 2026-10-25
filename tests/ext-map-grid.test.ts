// The map grid and the course half grid (T100, src/game/ext/map-grid): the half grid's lines and the map grid's, the zoom fades, the setting,
// when the half grid shows and where, and the cart paths and drives on the half grid (snapping, building, saving, joining roads).
// Headless: npm test (no DOM, no GL; the shader's maths are mirrored by alphaAt).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HALF_T, LOOK, MAP_GRID_KEY, MAP_T, MAX_LAND, alphaAt, courseBuilding, frameDraws, gridFade, gridFrame, landAt, lineFrac, loadMapGrid, packLand, saveMapGrid, tilesPerPx, type GridFrame } from '../src/game/ext/map-grid/index.js';
import { CELL_T } from '../src/game/ext/course-grid/index.js';
import { CLASS, RoadNetwork, classOf, type ClassId, type Leg, type Pt } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { checkLegs, snapPoint, snapTo } from '../src/game/snap';
import { segRec, type SaveV5 } from '../src/game/save';
import { DISTRICT_Z, ZOOM_MAX, worldX, worldY } from '../src/game/iso';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
const frame = (z: number, map: boolean, half: boolean): GridFrame => gridFrame({ map: 0, minor: 0, major: 0, hw: 0.5, tpp: 1 }, z, 1, map, half);
const near = (a: number, b: number, e = 1e-9) => Math.abs(a - b) <= e;

// ---- the grid ----

test('the half grid is exactly half the map grid: 1 m cells, P21 course grid cells', () => {
  assert.equal(HALF_T * 2, MAP_T);
  assert.equal(HALF_T, CELL_T);
});

test('every second half grid line lies on a map grid line, drawn a touch stronger; the lines between are fainter', () => {
  const f = frame(ZOOM_MAX, false, true);
  // across a row of the map (y half way inside a cell, off every line), every point on a half grid line
  for (let k = 0; k <= 16; k++) {
    const x = 100 + k * HALF_T, onMap = lineFrac(x, MAP_T) === 0;
    const a = alphaAt(f, x, 100.25);
    assert.ok(near(a, onMap ? LOOK.major : LOOK.minor), `x ${x}: ${a}`);
  }
  assert.ok(LOOK.major > LOOK.minor && LOOK.major > LOOK.map, 'the coinciding lines read a touch stronger than both');
  // between the lines nothing is drawn
  for (const x of [100.25, 100.75, 101.25]) assert.equal(alphaAt(f, x, 100.25), 0, `x ${x}`);
  // and down a column the same: the iso grid is the same both ways
  for (let k = 0; k <= 8; k++) { const y = 50 + k * HALF_T; assert.ok(near(alphaAt(f, 50.25, y), lineFrac(y, MAP_T) === 0 ? LOOK.major : LOOK.minor)); }
});

test('the map grid draws only the 2 m lines; on the course land the half grid joins it and its 2 m lines win', () => {
  const map = frame(ZOOM_MAX, true, false);
  assert.ok(near(alphaAt(map, 100, 100.25), LOOK.map));
  assert.equal(alphaAt(map, 100.5, 100.25), 0, 'no 1 m lines without a course tool');
  const both = frame(ZOOM_MAX, true, true);
  assert.ok(near(alphaAt(both, 100, 100.25, 1), LOOK.major), 'on the land, the major line');
  assert.ok(near(alphaAt(both, 100.5, 100.25, 1), LOOK.minor));
  assert.ok(near(alphaAt(both, 100, 100.25, 0), LOOK.map), 'off the land, the map grid alone');
  assert.equal(alphaAt(both, 100.5, 100.25, 0), 0);
});

test('lines are thin: about a device pixel wide at every zoom the grid shows', () => {
  for (const z of [ZOOM_MAX, 0.2, 0.15]) {
    const f = frame(z, true, false), px = f.tpp; // tiles per device px across a line
    assert.ok(alphaAt(f, 100 + 0.9 * px, 100.25) > 0, `z ${z}: still on the line under a px off`);
    assert.equal(alphaAt(f, 100 + 1.6 * px, 100.25), 0, `z ${z}: off the line 1.6 px away`);
  }
  // tiles per px across a line: a tile's screen diamond is 128 x 64 world px, so its edge is crossed in sqrt(1/128^2 + 1/64^2) tiles a px
  assert.ok(near(tilesPerPx(1), Math.hypot(1 / 128, 1 / 64)));
});

test('the grid fades with the zoom: full close up, faint at the district tier, gone below it; the 1 m lines thin out first', () => {
  const close = gridFade(ZOOM_MAX);
  assert.equal(close.tile, 1); assert.equal(close.cell, 1);
  const mid = gridFade(0.15);
  assert.ok(mid.tile > 0.5 && mid.cell > 0.3, `15%: ${JSON.stringify(mid)}`);
  const district = gridFade(DISTRICT_Z);
  assert.ok(district.tile > 0 && district.tile < 0.3, `district: ${district.tile}`);
  assert.ok(district.cell < district.tile);
  assert.equal(gridFade(0.1).tile, 0); assert.equal(gridFade(0.1).cell, 0);
  assert.equal(frameDraws(frame(0.09, true, true)), false, 'nothing to draw far out');
  for (let z = 0.06; z <= ZOOM_MAX; z += 0.01) { const f = gridFade(z); assert.ok(f.cell <= f.tile + 1e-12, `z ${z}`); }
  // subtle: never more than a sixth opaque
  assert.ok(Math.max(LOOK.map, LOOK.minor, LOOK.major) <= 1 / 6);
});

// ---- the setting ----

test('the map grid setting: on in dev builds, off in production, remembered, ?grid= wins', () => {
  const store = new Map<string, string>(), s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  assert.equal(loadMapGrid(s, true), true, 'dev: on by default');
  assert.equal(loadMapGrid(s, false), false, 'production: off by default');
  saveMapGrid(s, false);
  assert.equal(store.get(MAP_GRID_KEY), '0');
  assert.equal(loadMapGrid(s, true), false, 'turned off in dev stays off after a reload');
  saveMapGrid(s, true);
  assert.equal(loadMapGrid(s, false), true, 'turned on in production stays on');
  assert.equal(loadMapGrid(s, false, '?grid=0'), false, 'the URL wins');
  assert.equal(loadMapGrid(s, false, '?bench=1&grid=1'), true);
  // no storage, or a storage that throws: the default
  assert.equal(loadMapGrid(null, true), true);
  const bad = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  assert.equal(loadMapGrid(bad, false), false); assert.doesNotThrow(() => saveMapGrid(bad, true));
});

test('the half grid shows while a course building tool is on, and only then', () => {
  assert.equal(courseBuilding('course', 'town', false), true, 'Course paint, Shape, pieces, the clubhouse');
  assert.equal(courseBuilding('road', 'course', false), true, 'Paths & drives');
  assert.equal(courseBuilding('select', 'town', true), true, 'an event structure being placed');
  assert.equal(courseBuilding('road', 'town', false), false, 'town roads');
  assert.equal(courseBuilding('bulldoze', 'course', false), false);
  assert.equal(courseBuilding('paint', 'town', false), false, 'the town Paint tool');
});

test('the course land for the shader: the course and its parcels; none is the whole view; too many become their bounds', () => {
  const out = new Float32Array(MAX_LAND * 4);
  assert.equal(packLand([], out), -1);
  assert.equal(packLand([[10, 20, 30, 40], [0, 0, 0, 5]], out), 1, 'empty rectangles are left out');
  assert.deepEqual([...out.slice(0, 4)], [10, 20, 40, 60]);
  assert.equal(landAt(out, 1, 25, 40), 1, 'inside');
  assert.ok(landAt(out, 1, 40.5, 40) > 0 && landAt(out, 1, 40.5, 40) < 1, 'fading just outside');
  assert.equal(landAt(out, 1, 45, 40), 0, 'gone a few tiles out');
  assert.equal(landAt(out, -1, 9999, 9999), 1, 'no land: everywhere');
  const many = Array.from({ length: MAX_LAND + 3 }, (_, i) => [i * 10, 5, 10, 10] as const);
  assert.equal(packLand(many, out), 1);
  assert.deepEqual([...out.slice(0, 4)], [0, 5, (MAX_LAND + 3) * 10, 15]);
});

// ---- cart paths and drives on the half grid ----

/** a committed network of the given legs per class */
function netOf(...parts: [ClassId, Leg[]][]): NetEditor {
  const e = new NetEditor(new RoadNetwork());
  for (const [id, legs] of parts) e.addLegs(legs, CLASS[id]!, 0);
  e.commit(true);
  return e;
}
const nodeAt = (net: RoadNetwork, x: number, y: number) => [...net.nodes.values()].find(n => near(n.x, x, 1e-6) && near(n.y, y, 1e-6));

test('path points snap to the 1 m half grid; town roads keep the 2 m lattice', () => {
  const net = new RoadNetwork();
  assert.deepEqual(snapPoint(net, { x: 120.3, y: 87.8 }, 2, HALF_T).p, { x: 120.5, y: 88 });
  assert.deepEqual(snapPoint(net, { x: 120.26, y: 87.7 }, 2, HALF_T).p, { x: 120.5, y: 87.5 });
  assert.deepEqual(snapPoint(net, { x: 120.3, y: 87.7 }, 2).p, { x: 120, y: 88 }, 'the default step is a map tile');
  assert.equal(snapPoint(net, { x: 120.3, y: 87.7 }, 2, HALF_T).kind, 'grid');
  for (const v of [0.1, 0.24, 0.26, 0.74, 0.76, 3.49, 3.51]) { const s = snapTo(v, HALF_T); assert.equal(s * 2, Math.round(s * 2)); assert.ok(Math.abs(s - v) <= 0.25 + 1e-12, `${v} -> ${s}`); }
  // a road and its node still win over the grid: a half grid point near a road lands on the road
  const e = netOf(['street', [leg(100, 100, 160, 100)]]);
  const s = snapPoint(e.net, { x: 130.3, y: 100.6 }, 2, HALF_T);
  assert.equal(s.kind, 'road'); assert.equal(s.p.y, 100);
  assert.equal(snapPoint(e.net, { x: 160.4, y: 100.2 }, 2, HALF_T).kind, 'end');
});

test('a cart path on the half grid builds like a road: it T-joins a street and a drive, crosses a path, and bends', () => {
  const e = netOf(['street', [leg(100, 100, 180, 100)]], ['drive-gravel', [leg(100, 140, 180, 140)]]);
  const cls = CLASS['cart-dirt']!;
  // from the street (a half grid point on it) south to the drive, with a bend on the half grid
  const legs = [leg(120.5, 100, 120.5, 118.5), leg(120.5, 118.5, 140.5, 118.5), leg(140.5, 118.5, 140.5, 140)];
  const from = snapPoint(e.net, { x: 120.5, y: 100.3 }, 2, HALF_T), to = snapPoint(e.net, { x: 140.5, y: 139.8 }, 2, HALF_T);
  assert.equal(from.kind, 'road'); assert.equal(to.kind, 'road');
  assert.equal(checkLegs(e.net, legs, from, to, cls), '');
  e.addLegs(legs, cls, 0); e.commit();
  const t1 = nodeAt(e.net, 120.5, 100), t2 = nodeAt(e.net, 140.5, 140);
  assert.ok(t1 && t1.arms.length === 3, 'a T on the street at the half grid point');
  assert.ok(t2 && t2.arms.length === 3, 'a T on the drive');
  assert.ok(nodeAt(e.net, 120.5, 118.5) && nodeAt(e.net, 140.5, 118.5), 'the bends are nodes on the half grid');
  // a walking path crossing it between the bends (8 tiles or more from each): a crossing node on the half grid
  const cross = [leg(130.5, 108.5, 130.5, 128.5)];
  assert.equal(checkLegs(e.net, cross, null, null, CLASS['cart-walk']!), '');
  e.addLegs(cross, CLASS['cart-walk']!, 0); e.commit();
  assert.equal(nodeAt(e.net, 130.5, 118.5)?.arms.length, 4);
});

test('junction spacing holds with half grid points: a new junction 15 m from another is refused, 16 m is fine', () => {
  const e = netOf(['street', [leg(100, 100, 180, 100)]], ['cart-dirt', [leg(130, 100, 130, 120)]]);
  const cls = CLASS['cart-dirt']!;
  assert.match(checkLegs(e.net, [leg(137.5, 100, 137.5, 120)], null, null, cls), /junction/i, '7.5 tiles from the T');
  assert.equal(checkLegs(e.net, [leg(138, 100, 138, 120)], null, null, cls), '', '8 tiles');
});

test('narrow paths bend finely: a lane-less path keeps its points its own corridor apart (at least a tile); roads keep 2 tiles', () => {
  const net = new RoadNetwork();
  // a path that jogs 1 m sideways round a green's edge: bends 1.5 tiles apart
  const jog = [leg(100, 100, 110, 100), leg(110, 100, 110, 101.5), leg(110, 101.5, 120, 101.5)];
  assert.equal(checkLegs(net, jog, null, null, CLASS['cart-dirt']!), '', 'a dirt path');
  assert.equal(checkLegs(net, jog, null, null, CLASS['cart-walk']!), '', 'a walking path');
  assert.notEqual(checkLegs(net, jog, null, null, CLASS.street!), '', 'a street is refused');
  assert.notEqual(checkLegs(net, jog, null, null, CLASS['drive-gravel']!), '', 'a drive (cars) is refused');
  // the 2 tile rule itself: a last piece 1.5 tiles long after a bend
  const zig = [leg(100, 100, 110, 100), leg(110, 100, 110, 101.5)];
  assert.match(checkLegs(net, zig, null, null, CLASS['drive-gravel']!), /junction/i, 'a drive keeps its points 2 tiles apart');
  assert.equal(checkLegs(net, zig, null, null, CLASS['cart-dirt']!), '', 'a dirt path may bend there');
  const short = [leg(100, 100, 110, 100), leg(110, 100, 110, 100.5)];
  assert.match(checkLegs(net, short, null, null, CLASS['cart-walk']!), /junction/i, 'half a tile is still too short a piece');
  const e = new NetEditor(new RoadNetwork()); e.addLegs(jog, CLASS['cart-dirt']!, 0); e.commit();
  assert.equal(e.net.segs.size, 3, 'it builds: three pieces');
});

test('a half grid path saves and loads: the same pieces at the same points, still joined to the road', () => {
  const e = netOf(['street', [leg(100, 100, 180, 100)]]);
  e.addLegs([leg(140.5, 100, 140.5, 112.5), leg(140.5, 112.5, 152, 112.5)], CLASS['cart-slab']!, 0); e.commit();
  const segs: SaveV5['segs'] = JSON.parse(JSON.stringify([...e.net.segs].map(segRec)));
  const back = new NetEditor(new RoadNetwork());
  for (const [ax, ay, bx, by, cls, style, kind, town] of segs) back.addLegs([{ a: { x: ax, y: ay }, b: { x: bx, y: by } }], classOf(cls), style as 0, [(kind ?? 0) as 0], town ? true : undefined);
  back.commit(true);
  const key = (n: RoadNetwork) => [...n.segs].map(s => `${s.cls.id}:${[s.a, s.b].map((p: Pt) => `${p.x},${p.y}`).sort().join('-')}`).sort();
  assert.deepEqual(key(back.net), key(e.net));
  assert.ok(key(back.net).some(k => k.includes('140.5,112.5')), 'the half grid points survive');
  assert.equal(nodeAt(back.net, 140.5, 100)?.arms.length, 3, 'the T with the street');
});

test('the camera maths the shader uses: the tile under a screen point inverts worldX/worldY', () => {
  // the fragment shader's t = ((X/64 + Y/32) / 2, (Y/32 - X/64) / 2)
  for (const [x, y] of [[0, 0], [100.5, 37.25], [2047, 1]]) {
    const X = worldX(x, y), Y = worldY(x, y), a = X / 64, b = Y / 32;
    assert.ok(near((a + b) / 2, x) && near((b - a) / 2, y));
  }
});
