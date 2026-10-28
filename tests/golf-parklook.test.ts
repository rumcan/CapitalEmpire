// T237 (#694): a paved car park that looks like one (event/parklook.ts): kerbs open at the entrances, a planting island at both ends of each
// double row (a tree, then a lamp post with a shrub, in turn), a footpath to the door it serves that ends at a building's face; the same every
// time; nothing for an unpaved lot; no prop on a bay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { buildPark, inPark, toLocal, type CarPark } from '../src/game/event/carpark';
import { BAY_D, BAY_W } from '../src/game/event/config';
import { ISLAND_TREES, KERB_W, MOUTH, PATH_W, footpath, parkLook, rowGroups } from '../src/game/event/parklook';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const ROAD_Y = 300;
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
function road(): RoadNetwork {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(200, ROAD_Y, 800, ROAD_Y)], CLASS.street, 0);
  e.commit();
  return e.net;
}
/** a 20 x 16 car park north of the street, on its verge (its south edge the frontage: 4 rows, 56 bays) */
function park(ground?: 'dirt' | 'gravel'): CarPark {
  const verge = CLASS.street!.h + CLASS.street!.walk, y = Math.floor(ROAD_Y - verge) - 16;
  return buildPark(road(), { id: 7, x: 400, y, w: 20, h: 16, ...(ground ? { ground } : {}) })!;
}
const centre = (pts: number[]) => { let x = 0, y = 0; for (let k = 0; k < pts.length; k += 2) { x += pts[k]!; y += pts[k + 1]!; } return { x: x / (pts.length / 2), y: y / (pts.length / 2) }; };

test('the rows come in groups: [aisle][row][row][aisle], a single last row on its own', () => {
  assert.deepEqual(rowGroups(16, BAY_D), [[3, 8], [11, 16]]);
  assert.deepEqual(rowGroups(12, BAY_D), [[3, 8], [11, 11 + BAY_D]].filter(g => g[1] <= 12));
});

test('a paved car park: kerbs round it open at its entrance, two islands a group of rows, a tree then a lamp, a footpath to its door', () => {
  const pk = park(), look = parkLook(pk, { x: 410, y: pk.y - 20 });
  assert.equal(pk.bays.length, 56);
  // the kerb on the frontage: open MOUTH tiles about each entrance (no kerb patch's centre within it)
  const kerbs = look.over.filter(p => p.tex === 'slabs'), grass = look.over.filter(p => p.tex === 'grass');
  for (const e of pk.entrances) {
    const t = toLocal(pk, e).x;
    for (const k of kerbs) { const c = toLocal(pk, centre(k.pts)); if (c.y > pk.h - KERB_W - 0.01) assert.ok(Math.abs(c.x - t) > MOUTH / 2 - 0.01, 'the entrance is open'); }
  }
  // the islands: 2 groups of rows x 2 ends, each a kerb and its grass
  assert.equal(grass.length, 4);
  const trees = look.props.filter(p => ISLAND_TREES.includes(p.id)), lamps = look.props.filter(p => p.id === 'world:streetlamp');
  assert.equal(trees.length, 2); assert.equal(lamps.length, 2);
  // no prop stands on a bay (a bay: BAY_D along its heading, BAY_W across)
  for (const p of look.props) for (const b of pk.bays) {
    const dx = p.x - b.x, dy = p.y - b.y, along = Math.abs(dx * b.hx + dy * b.hy), across = Math.abs(dx * b.tx + dy * b.ty);
    assert.ok(along > BAY_D / 2 || across > BAY_W / 2, `${p.id} on a bay`);
  }
  for (const p of look.props) assert.ok(inPark(pk, p), 'the props inside the car park');
  // the footpath: PATH_W wide from its edge to the door
  assert.ok(look.path && look.path.tex === 'paving');
  const [ax, ay, bx, by, cx, cy] = look.path!.pts as [number, number, number, number, number, number];
  assert.ok(Math.abs(Math.hypot(cx - bx, cy - by) - PATH_W) < 1e-9);
  assert.ok(Math.abs(bx + cx - 2 * 410) < 1e-9 && Math.abs(by + cy - 2 * (pk.y - 20)) < 1e-9, 'it ends at the door');
  assert.ok(Math.abs((ay + look.path!.pts[7]!) / 2 - pk.y) < 1e-9 && ax >= pk.x - 1, 'it starts on the car park\'s edge');
  // the same every time
  assert.deepEqual(parkLook(park(), { x: 410, y: pk.y - 20 }), look);
});

test('a footpath ends half a tile short of a building in its way; none to a door too far or inside the park', () => {
  const pk = park(), door = { x: 410, y: pk.y - 30 }, wall: [number, number, number, number] = [400, pk.y - 26, 20, 10];
  const p = footpath(pk, door, [wall])!;
  const end = { x: (p.pts[2]! + p.pts[4]!) / 2, y: (p.pts[3]! + p.pts[5]!) / 2 };
  assert.ok(Math.abs(end.y - (wall[1] + wall[3] + 0.5)) < 1e-6, `ends at the wall's face (${end.y})`);
  assert.equal(footpath(pk, { x: 410, y: pk.y - 200 }), null);
  assert.equal(footpath(pk, { x: 410, y: pk.y + 5 }), null);
});

test('an unpaved lot has no look (T239: dirt and gravel are their ground alone)', () => {
  for (const g of ['dirt', 'gravel'] as const) assert.deepEqual(parkLook(park(g), { x: 0, y: 0 }), { over: [], path: null, props: [] });
});
