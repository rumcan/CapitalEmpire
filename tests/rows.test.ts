// The bay rows' headless tests (docs/PARKING.md section 1): a row's bays, lines and paving at 90, 60 and 45 degrees, rowCheck's reasons, the lots
// rows form, and a lot as a car park beside a street.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { MAP } from '../src/game/iso';
import { TC } from '../src/game/terrain/types';
import { BAY_D } from '../src/game/event/config';
import { LOT_ID0, ROW_MAX, lotPark, rowBays, rowCheck, rowGeom, rowLines, rowLots, rowQuad, type BayRowDef } from '../src/game/event/rows';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

/** a row from a to b on side, at bay angle bay, id id */
const row = (id: number, ax: number, ay: number, bx: number, by: number, bay: 90 | 60 | 45 = 90, side: 1 | -1 = 1): BayRowDef => ({ id, ax, ay, bx, by, side, bay, col: 'white' });
/** |a − b| < 1e-6 */
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} vs ${b}`);
/** a network of one straight street along y, from x 200 to 800 */
function street(y: number): RoadNetwork {
  const e = new NetEditor(new RoadNetwork());
  const leg: Leg = { a: { x: 200, y }, b: { x: 800, y } };
  e.addLegs([leg], CLASS.street, 0);
  e.commit();
  return e.net;
}

test('a 90 degree row of 12.5 tiles along +x: 10 bays, centres BAY_D / 2 off the front line on side 1, heading n, 11 ticks and a back line', () => {
  const d = row(1, 100, 100, 112.5, 100), G = rowGeom(d);
  assert.equal(G.count, 10);
  const bs = rowBays(d);
  assert.equal(bs.length, 10);
  bs.forEach((b, k) => {
    near(b.x, 100 + 1.25 * (k + 0.5)); near(b.y, 100 + BAY_D / 2);
    near(b.hx, 0); near(b.hy, 1); near(b.tx, 1); near(b.ty, 0);
    assert.equal(b.dir, 1, 'faces +y');
  });
  const L = rowLines(d);
  assert.equal(L.length, 48, '11 ticks and a back line: 12 lines of 4 numbers');
  for (let k = 0; k <= 10; k++) {
    near(L[4 * k]!, 100 + 1.25 * k); near(L[4 * k + 1]!, 100); near(L[4 * k + 2]!, 100 + 1.25 * k); near(L[4 * k + 3]!, 100 + BAY_D);
  }
  near(L[44]!, 100); near(L[45]!, 100 + BAY_D); near(L[46]!, 112.5); near(L[47]!, 100 + BAY_D);
  const Q = rowQuad(d);
  assert.equal(Q.length, 8, 'four corners');
  near(Q[0]!, 99.75); near(Q[1]!, 99.75); near(Q[2]!, 112.75); near(Q[3]!, 99.75);
  near(Q[4]!, 112.75); near(Q[5]!, 102.75); near(Q[6]!, 99.75); near(Q[7]!, 102.75);
});

test('60 and 45 degree rows of 12.5 tiles: fewer bays than 90, unit headings 30 and 45 degrees from n, leaning towards b', () => {
  const n90 = rowBays(row(1, 100, 100, 112.5, 100)).length;
  for (const [bay, deg, want] of [[60, 30, 8], [45, 45, 7]] as const) {
    const d = row(2, 100, 100, 112.5, 100, bay), bs = rowBays(d);
    assert.equal(bs.length, want, `${bay} degree bays`);
    assert.ok(bs.length < n90, 'fewer than the 90 degree bays');
    for (const b of bs) {
      near(Math.hypot(b.hx, b.hy), 1); near(Math.hypot(b.tx, b.ty), 1);
      near(Math.acos(b.hy) * 180 / Math.PI, deg);
      assert.ok(b.hx > 0, 'leans towards b');
    }
    const L = rowLines(d);
    near(L[2]!, 100 + Math.cos(bay * Math.PI / 180) * BAY_D); near(L[3]!, 100 + Math.sin(bay * Math.PI / 180) * BAY_D);
  }
});

test('side -1 mirrors the bays onto the other side of the front line', () => {
  const bs = rowBays(row(1, 100, 100, 112.5, 100, 90, -1));
  assert.equal(bs.length, 10);
  for (const b of bs) { near(b.y, 100 - BAY_D / 2); near(b.hx, 0); near(b.hy, -1); assert.equal(b.dir, 3, 'faces -y'); }
  const angled = rowBays(row(2, 100, 100, 112.5, 100, 60, -1));
  for (const b of angled) { near(b.hy, -Math.sin(Math.PI / 3)); assert.ok(b.hx > 0, 'still leans towards b'); }
});

test('rowCheck: a row on clear ground is fine; each failure gives its reason', () => {
  const cls = new Uint8Array(MAP * MAP), ok = row(1, 400, 400, 412.5, 400);
  assert.equal(rowCheck(ok, cls, [], [], MAP), '');
  assert.equal(rowCheck(row(2, 400, 400, 401.5, 400), cls, [], [], MAP), 'too short: at least 2 bays');
  assert.equal(rowCheck(row(3, 100, 400, 100 + ROW_MAX + 1, 400), cls, [], [], MAP), 'too long (240 m max)');
  assert.equal(rowCheck(row(4, 2, 400, 14.5, 400), cls, [], [], MAP), 'too close to the edge of the map');
  const wet = cls.slice(); wet[401 * MAP + 405] = TC.WATER;
  assert.equal(rowCheck(ok, wet, [], [], MAP), 'not on buildable ground');
  const patch = cls.slice(); patch[401 * MAP + 405] = TC.PATCH;
  assert.equal(rowCheck(ok, patch, [], [], MAP), '', 'a patch of ground is buildable');
  assert.equal(rowCheck(ok, cls, [{ a: { x: 200, y: 300 }, b: { x: 800, y: 300 }, hw: 6 }], [], MAP), '', 'a road 100 tiles away');
  assert.equal(rowCheck(row(5, 400, 303, 412.5, 303), cls, [{ a: { x: 200, y: 300 }, b: { x: 800, y: 300 }, hw: 6 }], [], MAP), 'a road runs over it');
  assert.equal(rowCheck(ok, cls, [], [row(2, 400, 401, 412.5, 401)], MAP), 'overlaps another row');
  assert.equal(rowCheck(ok, cls, [], [row(1, 400, 401, 412.5, 401)], MAP), '', 'its own id is not another row');
  assert.equal(rowCheck(ok, cls, [], [row(2, 400, 400, 412.5, 400, 90, -1)], MAP), '', 'touching rows do not overlap');
});

test('rowLots: rows 3 tiles apart are one lot, a row 30 tiles away is its own; a chain of rows 5 tiles apart is one lot', () => {
  const A = row(1, 400, 400, 412.5, 400), B = row(2, 400, 405.5, 412.5, 405.5), C = row(3, 400, 430, 412.5, 430);
  assert.deepEqual(rowLots([C, B, A]).map(l => l.map(r => r.id)), [[1, 2], [3]]);
  const D = row(4, 400, 407.5, 412.5, 407.5), E = row(5, 400, 415, 412.5, 415);
  assert.deepEqual(rowLots([E, A, D]).map(l => l.map(r => r.id)), [[1, 4, 5]], 'transitive');
  assert.deepEqual(rowLots([]), []);
});

test('lotPark: a lot 6 tiles from a street: entrance on the street, pv into the lot, bays nearest first; no street in reach: null', () => {
  const net = street(300), lot = [row(1, 400, 306, 412.5, 306), row(2, 400, 311, 412.5, 311, 90, -1)];
  const p = lotPark(net, lot);
  assert.ok(p, 'a car park');
  assert.equal(p.id, LOT_ID0 + 1);
  near(p.entrances[0]!.y, 300); near(p.entrances[0]!.x, 406.25);
  assert.equal(p.seg.a.y, 300); assert.equal(p.seg.b.y, 300);
  near(p.pv.x, 0); near(p.pv.y, 1);
  assert.equal(p.bays.length, 20, 'both rows');
  const dist = p.bays.map(b => Math.hypot(b.x - p.entrances[0]!.x, b.y - p.entrances[0]!.y));
  assert.deepEqual(dist, [...dist].sort((a, b) => a - b), 'sorted by the distance to the entrance');
  assert.equal(lotPark(street(600), [row(1, 400, 400, 412.5, 400)]), null, 'no street within ROW_REACH');
  assert.equal(lotPark(net, []), null, 'no rows, no park');
});
