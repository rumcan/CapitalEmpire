// T324 (#924): the street lamps' light pools lie straight below their heads, for every lamp picture (the town lamp, the four turned views),
// mirrored or not, and their one shape is the ground circle's projection (a 2:1 ellipse on screen) for every road heading.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../src/game/library';
import { lampGround, poolAt, poolStampAlpha, poolStampMatrix, POOL_R, POOL_STAMP } from '../src/game/lamp-pool';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { NIGHT_DEFAULT, propLights, type NightLight } from '../src/game/night-light';
import type { Prop } from '../src/game/types';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

/** world tiles to screen px at zoom 1 (iso.ts: a 128 x 64 px tile diamond) */
const sx = (x: number, y: number) => (x - y) * 64, sy = (x: number, y: number) => (x + y) * 32;
const lamps = LIBRARY.filter(it => it.kind === 'lamp' && /streetlamp/.test(it.id));
const near = (a: number, b: number, eps: number, msg: string) => assert.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);

test('the lamp pictures: the town lamp and its four turned views, each with its head glows', () => {
  for (const id of ['world:streetlamp', 'view:world:streetlamp:n', 'view:world:streetlamp:e', 'view:world:streetlamp:s', 'view:world:streetlamp:w']) {
    const it = lamps.find(l => l.id === id); assert.ok(it, `${id} in the library`);
    assert.ok(it.glows?.some(g => g.r >= 6), `${id} has a head glow`);
  }
});

test('each lamp view: the pool centre is the ground point straight below the head (screen x of the head, ground row of the pole foot)', () => {
  for (const it of lamps) for (const flip of [false, true]) for (const scale of [0.9, 1, 1.2]) {
    const p = { x: 300.3, y: 412.7, flip, scale }, P = lampGround(it, p);
    // the head: the large glows' mean across the picture, mirrored with it, scaled (world px from the anchor at zoom 1)
    const heads = it.glows!.filter(g => g.r >= 6), gx = heads.reduce((s, g) => s + g.x, 0) / heads.length;
    const headX = sx(p.x, p.y) + (flip ? it.ax - gx : gx - it.ax) * scale;
    // the pole's foot: the footprint's centre
    const b = it.boxes[0]!, fx = p.x + (flip ? b.dy : b.dx) * scale / 2, fy = p.y + (flip ? b.dx : b.dy) * scale / 2;
    near(sx(P.x, P.y), headX, 1e-6, `${it.id} flip ${flip} x${scale}: screen x`);
    near(sy(P.x, P.y), sy(fx, fy), 1e-6, `${it.id} flip ${flip} x${scale}: on the foot's ground row`);
    // the heads stand over the pole: never more than a fifth of a tile from the foot
    assert.ok(Math.hypot(P.x - fx, P.y - fy) < 0.2, `${it.id}: ${Math.hypot(P.x - fx, P.y - fy)} tiles from the foot`);
  }
});

test('an arm lamp: a head drawn out to one side puts the pool out there, mirrored with the picture', () => {
  const it = { ax: 20, boxes: [{ hx: 0.6, hy: 0.6, dx: 0, dy: 0 }], glows: [{ x: 84, y: 30, r: 12 }, { x: 22, y: 150, r: 3 }] };
  const P = lampGround(it, { x: 100, y: 100, flip: false, scale: 1 }), Q = lampGround(it, { x: 100, y: 100, flip: true, scale: 1 });
  near(sx(P.x, P.y) - sx(100, 100), 64, 1e-9, 'out 64 px to the right'); near(sy(P.x, P.y), sy(100, 100), 1e-9, 'on the ground row');
  near(sx(Q.x, Q.y) - sx(100, 100), -64, 1e-9, 'mirrored: 64 px to the left');
});

test('the night overlay\'s lamp light sits on the same point as the road pool', () => {
  for (const it of lamps) {
    const p = { item: 0, x: 50, y: 60, flip: false, scale: 0.9, x0: 0, y0: 0, x1: 0, y1: 0, uid: 1 } as unknown as Prop, out: NightLight[] = [];
    propLights(p, it, NIGHT_DEFAULT, (x, y) => ({ x: sx(x, y), y: sy(x, y) }), 1, out);
    const P = lampGround(it, p), pool = out.find(l => l.ry === l.rx / 2)!;
    assert.ok(pool, `${it.id}: a ground pool`);
    near(pool.sx, sx(P.x, P.y), 1e-6, `${it.id}: overlay x`); near(pool.sy, sy(P.x, P.y), 1e-6, `${it.id}: overlay y`);
  }
});

test('the pool\'s profile: brightest under the head, falling off softly to nothing at its rim (no edge)', () => {
  assert.equal(poolAt(0), 1); assert.equal(poolAt(POOL_R), 0); assert.equal(poolAt(POOL_R * 1.5), 0);
  for (let r = 0; r < POOL_R; r += 0.05) assert.ok(poolAt(r + 0.05) <= poolAt(r), `falls at ${r}`);
  assert.ok(poolAt(POOL_R * 0.97) < 0.001, 'the rim fades to nothing');
  const n = POOL_STAMP, a = poolStampAlpha(n);
  assert.ok(a[(n / 2) * n + n / 2]! > 0.99, 'the stamp is brightest at its centre');
  for (let u = 0; u < n; u++) { assert.ok(a[u]! < 1e-6, 'the stamp\'s top row is dark'); assert.ok(a[u * n]! < 1e-6, 'its left column is dark'); }
  // round: the same at the same distance in every direction
  near(a[(n / 2) * n + n / 2 + 40]!, a[(n / 2 + 40) * n + n / 2]!, 1e-6, 'round');
});

test('the pool\'s shape is the ground circle\'s projection: a 2:1 ellipse on screen, centred on the pool, for every road heading', () => {
  const iso = [64, 32, -64, 32, 7, -3];   // the ground's world-to-picture transform at zoom 1 (and a chunk's offset)
  const at = (m: number[], u: number, v: number) => [m[0]! * u + m[2]! * v + m[4]!, m[1]! * u + m[3]! * v + m[5]!] as const;
  const x = 210.4, y = 187.9, m = poolStampMatrix(iso, x, y), n = POOL_STAMP, [cx, cy] = at(m, n / 2, n / 2);
  near(cx, sx(x, y) + 7, 1e-9, 'stamp centre x on the pool'); near(cy, sy(x, y) - 3, 1e-9, 'stamp centre y on the pool');
  const A = 64 * Math.SQRT2 * POOL_R, B = 32 * Math.SQRT2 * POOL_R;
  for (let k = 0; k < 64; k++) {
    const t = (k / 64) * Math.PI * 2, [px, py] = at(m, n / 2 + (n / 2) * Math.cos(t), n / 2 + (n / 2) * Math.sin(t));
    // on the ellipse with semi-axes A (screen x) and B (screen y): 2:1, its axes screen-straight
    near(((px - cx) / A) ** 2 + ((py - cy) / B) ** 2, 1, 1e-9, `rim point ${k}`);
    // and it is the ground circle of radius POOL_R: back on the ground, POOL_R from the pool
    const dx = px - cx, dy = py - cy, wx = (dx / 64 + dy / 32) / 2, wy = (dy / 32 - dx / 64) / 2;
    near(Math.hypot(wx, wy), POOL_R, 1e-9, `ground radius ${k}`);
  }
});

test('the network keeps the pool right below the head (no curb snap) on streets of all 8 headings; a lamp far from a road lights none', () => {
  const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
  for (let h = 0; h < 8; h++) {
    const ang = (h * Math.PI) / 4, ux = Math.cos(ang), uy = Math.sin(ang), C = 400;
    const e = new NetEditor(new RoadNetwork()); e.addLegs([leg(C - 30 * ux, C - 30 * uy, C + 30 * ux, C + 30 * uy)], CLASS.street, 0); e.commit();
    const off = CLASS.street.h + 0.8, lamp = { x: C - uy * off + ux * 5, y: C + ux * off + uy * 5 }, far = { x: C + 200, y: C - 200 };
    e.net.setLamps([lamp, far]);
    assert.equal(e.net.pools.length, 1, `heading ${h * 45}°: one pool`);
    near(e.net.pools[0]!.x, lamp.x, 1e-9, `heading ${h * 45}°: x`); near(e.net.pools[0]!.y, lamp.y, 1e-9, `heading ${h * 45}°: y`);
  }
});
