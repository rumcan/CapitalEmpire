// Where the farms stand (ext/farms/farmmap.ts): country roads get parcels, town and event land does not, removed roads take their
// parcels, and no town lot overlaps a farm. Headless: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP } from '../src/game/iso';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { FarmMap, parcelsOverlap, type FarmEnv, type LotFrame } from '../src/game/ext/farms';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
const CLEAR = new Uint8Array(MAP * MAP);
const NO_TOWN: FarmEnv = { towns: [], site: null, parks: [] };

/** a network of the given legs (gravel: a country road), committed in full */
function build(legs: Leg[]): { net: RoadNetwork; e: NetEditor } {
  const net = new RoadNetwork(), e = new NetEditor(net);
  e.addLegs(legs, CLASS.gravel, 0); e.commit(true);
  return { net, e };
}

test('a country road far from towns gets parcels; a road near a town gets none', () => {
  const { net } = build([leg(200, 1000, 700, 1000)]);
  const far = new FarmMap();
  const r = far.update(net, { cls: CLEAR, seed: 42 }, { ...NO_TOWN, towns: [{ x: 1500, y: 1500 }] }, new Map(), true);
  assert.ok(far.farms.size >= 10, `far road: ${far.farms.size} farms`);
  assert.equal(r.added.length, far.farms.size, 'every farm is reported as added');
  const near = new FarmMap();
  const { net: net2 } = build([leg(200, 1000, 700, 1000)]);
  near.update(net2, { cls: CLEAR, seed: 42 }, { ...NO_TOWN, towns: [{ x: 450, y: 1100 }] }, new Map(), true);
  assert.equal(near.farms.size, 0, 'a road 100 tiles from a town centre has no farms');
  console.log(`[farms] the map: ${far.farms.size} farms on a 500-tile road 1500 tiles from the town; none within 300 tiles of a town`);
});

test('the event site and the car parks keep farms 150 tiles away', () => {
  const { net } = build([leg(200, 1000, 700, 1000)]);
  const m = new FarmMap();
  m.update(net, { cls: CLEAR, seed: 42 }, { ...NO_TOWN, site: { x: 440, y: 1100, w: 20, h: 20 } }, new Map(), true);
  assert.equal(m.farms.size, 0, 'a site 100 tiles from the midpoint: no farms');
  m.update(net, { cls: CLEAR, seed: 42 }, { ...NO_TOWN, parks: [{ x: 0, y: 0, w: 1, h: 1 }] }, new Map(), true);
  assert.ok(m.farms.size >= 10, 'a park far away: the farms come back');
});

test('removing the seg removes its parcels', () => {
  const { net, e } = build([leg(200, 1000, 700, 1000)]);
  const m = new FarmMap(), world = { cls: CLEAR, seed: 42 };
  m.update(net, world, NO_TOWN, new Map(), true);
  const before = [...m.farms.keys()];
  assert.ok(before.length >= 10, `${before.length} farms before the removal`);
  // a removal takes one piece at a time: walk the seg and take every piece found
  for (let x = 200; x <= 700; x += 10) { const p = net.pieceNear({ x, y: 1000 }); if (p) e.removePiece(p); }
  e.commit();
  const r = m.update(net, world, NO_TOWN, new Map(), false);
  for (const f of m.farms.values()) assert.ok(net.segs.has(f.seg), `${f.p.key} still fronts a seg that is gone`);
  assert.equal(m.farms.size, 0, `${m.farms.size} farms left after the seg went`);
  assert.deepEqual([...r.removed].sort(), [...before].sort(), 'every parcel is reported as removed');
});

test('an edit far away keeps the farms of the untouched seg; a crossing road takes the parcels in its way', () => {
  const { net, e } = build([leg(200, 1000, 700, 1000)]);
  const m = new FarmMap(), world = { cls: CLEAR, seed: 42 };
  m.update(net, world, NO_TOWN, new Map(), true);
  const before = [...m.farms.keys()];
  e.addLegs([leg(1800, 300, 1900, 300)], CLASS.gravel, 0); e.commit();
  const far = m.update(net, world, NO_TOWN, new Map(), false);
  assert.equal(far.removed.length, 0, 'a far edit removes nothing');
  assert.ok(before.every(k => m.farms.has(k)), 'the first road keeps its farms');
  e.addLegs([leg(400, 800, 400, 1200)], CLASS.arterial, 0); e.commit();
  const cross = m.update(net, world, NO_TOWN, new Map(), false);
  assert.ok(cross.removed.length > 0 && m.farms.size < before.length + far.added.length, 'the crossing road takes parcels');
});

test('no town lot overlaps a farm parcel: a lot on a farm takes it out, and the farms left never overlap a lot', () => {
  const { net } = build([leg(200, 1000, 700, 1000)]);
  const m = new FarmMap(), world = { cls: CLEAR, seed: 42 };
  m.update(net, world, NO_TOWN, new Map(), true);
  const victim = [...m.farms.values()][0]!.p;
  const lots = new Map<string, LotFrame>([['lot|1', { o: [victim.o.x, victim.o.y], u: [victim.u.x, victim.u.y], n: [victim.n.x, victim.n.y], w: victim.w, d: victim.d }]]);
  const r = m.update(net, world, NO_TOWN, lots, false);
  assert.ok(r.removed.includes(victim.key), 'the farm under the town lot is dropped');
  const farms = [...m.farms.values()].map(f => f.p);
  for (const f of farms) assert.ok(!parcelsOverlap(f, victim) || f.key !== victim.key, `${f.key} still overlaps the lot`);
  for (let i = 0; i < farms.length; i++) for (let j = i + 1; j < farms.length; j++) assert.ok(!parcelsOverlap(farms[i]!, farms[j]!), `${farms[i]!.key} overlaps ${farms[j]!.key}`);
  for (const [, l] of lots) for (const f of farms) assert.ok(!parcelsOverlap(f, { ...f, key: 'lot', o: { x: l.o[0]!, y: l.o[1]! }, u: { x: l.u[0]!, y: l.u[1]! }, n: { x: l.n[0]!, y: l.n[1]! }, w: l.w, d: l.d }), `${f.key} overlaps a lot`);
});
