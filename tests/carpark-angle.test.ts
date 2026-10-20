// The car parks' turned stamps and angled bays (docs/PARKING.md section 1): the frame helpers, a turned park beside a diagonal street (its
// entrances on the centre line, pv away from the street, its bays inside), the 60 and 45 bays, bayLines, quadsOverlap and parkValid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg, type Pt } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { MAP } from '../src/game/iso';
import { TC } from '../src/game/terrain/types';
import {
  bayLines, buildPark, frontage, inPark, parkBox, parkCorners, parkFrame, parkValid, quadsOverlap, toLocal, toWorld,
  type Bay, type CarParkDef,
} from '../src/game/event/carpark';
import { BAY_D, BAY_W } from '../src/game/event/config';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const rad = (deg: number) => deg * Math.PI / 180;
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
/** a network of one street through the given legs (committed) */
function netOf(legs: Leg[]): RoadNetwork {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs(legs, CLASS.street, 0);
  e.commit();
  return e.net;
}

// the straight street of the axis tests (y = 300, x 200 to 800) and an axis park north of it
const ROAD_Y = 300;
const PARK: CarParkDef = { id: 1, x: 400, y: 285, w: 15, h: 12 };

// the diagonal street (on the line y = x) and a park turned 45 degrees beside it: its front edge (local y = 0) runs parallel to the street,
// g tiles from its centre line (the verge plus one tile), the park on the far side
const DA = 100, DB = 180, DW = 20, DH = 12;
const TURN = 45, rt = rad(TURN), U = { x: Math.cos(rt), y: Math.sin(rt) }, V = { x: -Math.sin(rt), y: Math.cos(rt) };
const GAP = CLASS.street.h + CLASS.street.walk + 1;
/** the diagonal park, its front edge centred on the street (mid = true) or moved onto it (mid = false: it runs over the street) */
function diagPark(id: number, mid: boolean, bay?: 90 | 60 | 45): CarParkDef {
  const m = (DA + DB) / 2, g = mid ? GAP : 0;
  const cx = m + V.x * g, cy = m + V.y * g;
  return { id, x: cx - U.x * DW / 2, y: cy - U.y * DW / 2, w: DW, h: DH, a: TURN, ...(bay ? { bay } : {}) };
}

test('a = 0: the frame is the axis frame, a pure shift; the corners and the box are the rect', () => {
  const d: CarParkDef = { id: 1, x: 5, y: 7, w: 3, h: 4 };
  assert.deepEqual(parkFrame(d), { o: { x: 5, y: 7 }, u: { x: 1, y: 0 }, v: { x: 0, y: 1 } });
  assert.deepEqual(toLocal(d, { x: 9, y: 10 }), { x: 4, y: 3 });
  assert.deepEqual(toWorld(d, { x: 4, y: 3 }), { x: 9, y: 10 });
  assert.deepEqual(parkCorners(d), [{ x: 5, y: 7 }, { x: 8, y: 7 }, { x: 8, y: 11 }, { x: 5, y: 11 }]);
  assert.deepEqual(parkBox(d), { x: 5, y: 7, w: 3, h: 4 });
  assert.ok(inPark(d, { x: 5, y: 7 }) && inPark(d, { x: 8, y: 11 }), 'the corners are in');
  assert.ok(!inPark(d, { x: 8.5, y: 8 }) && !inPark(d, { x: 4.9, y: 8 }), 'points outside are out');
});

test('toLocal(toWorld(q)) = q for a park turned 30 degrees', () => {
  const d: CarParkDef = { id: 1, x: 100, y: 50, w: 20, h: 10, a: 30 };
  for (const q of [{ x: 0, y: 0 }, { x: 3.5, y: 7.25 }, { x: 20, y: 10 }, { x: -4, y: 12 }]) {
    const b = toLocal(d, toWorld(d, q));
    assert.ok(Math.abs(b.x - q.x) < 1e-9 && Math.abs(b.y - q.y) < 1e-9, `(${q.x}, ${q.y}) comes back as (${b.x}, ${b.y})`);
  }
});

test('a = 0 and bay 90 give the same park and bays as the axis park without the fields', () => {
  const net = netOf([leg(200, ROAD_Y, 800, ROAD_Y)]);
  const plain = buildPark(net, PARK), tagged = buildPark(net, { ...PARK, a: 0, bay: 90 });
  assert.ok(plain && tagged, 'both built');
  assert.deepEqual(tagged.bays.map(b => [b.x, b.y, b.dir]), plain.bays.map(b => [b.x, b.y, b.dir]));
  assert.deepEqual(tagged.entrances, plain.entrances);
  assert.equal(tagged.side, plain.side);
  assert.deepEqual(plain.pv, { x: 0, y: -1 }, 'pv from the road (south) into the park: north');
});

test('a park turned 45 beside a diagonal street: entrances on its centre line, pv away from it, 10+ bays all inside', () => {
  const net = netOf([leg(DA, DA, DB, DB)]);
  const D = diagPark(5, true);
  const bp = buildPark(net, D);
  assert.ok(bp, 'a built park');
  assert.equal(frontage(net, D)?.side, 3, 'its front edge (local y = 0) is the frontage');
  assert.equal(bp.side, 3);
  assert.ok(bp.bays.length >= 10, `${bp.bays.length} bays`);
  for (const e of bp.entrances) assert.ok(Math.abs(e.x - e.y) / Math.SQRT2 < 1e-6, `entrance (${e.x}, ${e.y}) is on the centre line`);
  assert.ok(Math.abs(bp.pv.x - V.x) < 1e-9 && Math.abs(bp.pv.y - V.y) < 1e-9, `pv (${bp.pv.x}, ${bp.pv.y}) points away from the street`);
  const e0 = bp.entrances[0]!;
  for (const b of bp.bays) {
    assert.ok(inPark(D, b), `bay (${b.x}, ${b.y}) inside the park`);
    assert.ok((b.x - e0.x) * bp.pv.x + (b.y - e0.y) * bp.pv.y > 0, `bay (${b.x}, ${b.y}) is on the far side of the street`);
  }
});

test('bays at 60 and 45: fewer than at 90 on the same def; each heading is a unit vector 30 / 45 degrees from pv\'s line; each bay\'s lines BAY_D long and BAY_W apart', () => {
  const net = netOf([leg(200, ROAD_Y, 800, ROAD_Y)]);
  const base: CarParkDef = { id: 6, x: 400, y: 285, w: 20, h: 12 };
  const n90 = buildPark(net, base)!.bays.length;
  for (const [bay, deg] of [[60, 30], [45, 45]] as const) {
    const D: CarParkDef = { ...base, bay };
    const bp = buildPark(net, D);
    assert.ok(bp, `a built park at ${bay}`);
    assert.ok(bp.bays.length < n90, `${bay}: ${bp.bays.length} bays against ${n90} at 90`);
    for (const b of bp.bays) {
      assert.ok(inPark(D, b), 'inside the park');
      assert.ok(Math.abs(Math.hypot(b.hx, b.hy) - 1) < 1e-9, 'a unit heading');
      const ang = Math.acos(Math.min(1, Math.abs(b.hx * bp.pv.x + b.hy * bp.pv.y))) * 180 / Math.PI;
      assert.ok(Math.abs(ang - deg) < 1e-6, `heading ${ang.toFixed(6)} degrees from pv's line, want ${deg}`);
      const L = bayLines(b, bay);
      assert.ok(Math.abs(Math.hypot(L[2]! - L[0]!, L[3]! - L[1]!) - BAY_D) < 1e-9, 'a line BAY_D long');
      const mx0 = (L[0]! + L[2]!) / 2, my0 = (L[1]! + L[3]!) / 2, mx1 = (L[4]! + L[6]!) / 2, my1 = (L[5]! + L[7]!) / 2;
      const across = Math.abs((mx1 - mx0) * b.hy - (my1 - my0) * b.hx);
      assert.ok(Math.abs(across - BAY_W) < 1e-9, `the lines ${across.toFixed(6)} apart across the row, want BAY_W`);
    }
  }
});

test('bayLines: a 90 bay at dir 0 is today\'s two lines (y ± BAY_W / 2, from x − BAY_D / 2 to x + BAY_D / 2)', () => {
  const b: Bay = { x: 10, y: 20, dir: 0, hx: 1, hy: 0, tx: 0, ty: 1 };
  assert.deepEqual(bayLines(b), [10 - BAY_D / 2, 20 - BAY_W / 2, 10 + BAY_D / 2, 20 - BAY_W / 2, 10 - BAY_D / 2, 20 + BAY_W / 2, 10 + BAY_D / 2, 20 + BAY_W / 2]);
  assert.deepEqual(bayLines(b, 90), bayLines(b));
});

/** the corners of a square of half-side hs centred (cx, cy), turned by deg */
function square(cx: number, cy: number, hs: number, deg: number): Pt[] {
  const r = rad(deg), c = Math.cos(r), s = Math.sin(r);
  return [[-hs, -hs], [hs, -hs], [hs, hs], [-hs, hs]].map(([x, y]) => ({ x: cx + c * x! - s * y!, y: cy + s * x! + c * y! }));
}

test('quadsOverlap: overlapping rotated squares true; separated false; sharing an edge false', () => {
  assert.equal(quadsOverlap(square(0, 0, 1, 0), square(1.5, 0.5, 1, 45)), true, 'overlapping');
  assert.equal(quadsOverlap(square(0, 0, 1, 0), square(4, 0, 1, 45)), false, 'separated');
  assert.equal(quadsOverlap(square(0, 0, 1, 0), square(2, 0, 1, 0)), false, 'sharing an edge');
  assert.equal(quadsOverlap(square(0, 0, 1, 30), square(2 * Math.cos(rad(30)), 2 * Math.sin(rad(30)), 1, 30)), false, 'a turned pair sharing an edge');
});

test('parkValid of the turned park: all ground is fine; over the street it says a road runs over it; over another turned park it says so', () => {
  const net = netOf([leg(DA, DA, DB, DB)]), cls = new Uint8Array(MAP * MAP).fill(TC.GROUND);
  const D = diagPark(5, true);
  assert.equal(parkValid(D, cls, net, null, []), '');
  assert.match(parkValid(diagPark(5, false), cls, net, null, []), /a road runs over it/);
  const other = { ...D, id: 9, x: D.x + U.x, y: D.y + U.y };
  assert.match(parkValid(D, cls, net, null, [other]), /overlaps another car park/);
  const mid = toWorld(D, { x: D.w / 2, y: D.h / 2 }), wet = cls.slice();
  wet[Math.floor(mid.y) * MAP + Math.floor(mid.x)] = TC.WATER;
  assert.match(parkValid(D, wet, net, null, []), /buildable/);
});
