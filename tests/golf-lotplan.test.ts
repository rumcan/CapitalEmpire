// T237 (#694): how cars and golfers use a car park (the golf layout, event/carpark.ts lotPlan): every bay nose-in off an aisle, a cross aisle
// joining the aisles, a mouth through the first row at the entrance; a car drives in by the mouth along the aisles and never through a bay, and a
// golfer walks from the footpath along the aisles to the car, never across the rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg, type Pt } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { bayDrive, bayWalk, buildPark, lotExits, lotPlan, planOf, type Bay, type CarPark } from '../src/game/event/carpark';
import { AISLE, BAY_D, BAY_W } from '../src/game/event/config';
import { baysByDoor } from '../src/game/golf/walkserve';
import { polyAt } from '../src/game/golf/everydayview';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const ROAD_Y = 300;
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
function road(): RoadNetwork {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(200, ROAD_Y, 800, ROAD_Y)], CLASS.street, 0);
  e.commit();
  return e.net;
}
const verge = () => CLASS.street!.h + CLASS.street!.walk;
/** a w x h golf car park north of the street on its verge */
function park(w = 20, h = 16): CarPark { return buildPark(road(), { id: 3, x: 400, y: Math.floor(ROAD_Y - verge()) - h, w, h, cross: true })!; }

/** whether point p is inside bay b's rectangle (BAY_D along its heading, BAY_W across), shrunk by m */
const inBay = (p: Pt, b: Bay, m = 0.05) => { const dx = p.x - b.x, dy = p.y - b.y; return Math.abs(dx * b.hx + dy * b.hy) < BAY_D / 2 - m && Math.abs(dx * b.tx + dy * b.ty) < BAY_W / 2 - m; };
/** the points along a polyline every 0.1 tile */
function samples(pts: Pt[]): Pt[] { const out: Pt[] = []; for (let u = 0; u <= 1.0001; u += 0.002) { const q = polyAt(pts, u); out.push({ x: q.x, y: q.y }); } return out; }

test('the golf layout of a 20 x 16 lot: [row][aisle][row] twice, every row on an aisle, the cross aisle at the far end, a mouth at the entrance', () => {
  const pk = park(), P = lotPlan(pk, pk.side, pk.entrances);
  assert.equal(P.rows.length, 4); assert.equal(P.aisles.length, 2);
  for (const r of P.rows) assert.ok(Math.abs(P.aisles[r.aisle]! - (r.into > 0 ? r.q0 - AISLE / 2 : r.q1 + AISLE / 2)) < 1e-9, 'each row opens onto its aisle');
  assert.equal(P.n, 12);
  // the first row loses the bays in the mouth: 4 rows of 12, less those
  assert.ok(pk.bays.length > 40 && pk.bays.length < 48, `${pk.bays.length} bays`);
  for (const b of pk.bays) { const q = planOf(pk, pk.side, b); assert.ok(q.t < P.cross - AISLE / 2, 'no bay in the cross aisle'); }
});

test('every bay is nose-in: its heading points away from its aisle', () => {
  const pk = park(), P = lotPlan(pk, pk.side, pk.entrances);
  for (const b of pk.bays) {
    const q = planOf(pk, pk.side, b), r = P.rows.find(x => q.q >= x.q0 && q.q <= x.q1)!, aisle = P.aisles[r.aisle]!;
    const ahead = planOf(pk, pk.side, { x: b.x + b.hx, y: b.y + b.hy });
    assert.ok(Math.abs(ahead.q - aisle) > Math.abs(q.q - aisle), 'its nose away from the aisle');
  }
});

test('a car drives in by the mouth along the aisles to its bay, never through another bay; the first bays taken are those nearest the door', () => {
  const pk = park(), e = pk.entrances[0]!;
  for (const b of pk.bays) {
    const d = bayDrive(pk, b);
    assert.ok(d.length >= 3, 'mouth, aisle, its aisle point');
    const m = planOf(pk, pk.side, d[0]!);
    assert.ok(Math.abs(m.q) < 1e-6 && Math.abs(m.t - planOf(pk, pk.side, e).t) < 1e-6, 'it starts at the mouth, on the frontage edge at the entrance');
    for (const p of samples([e, ...d, b])) for (const o of pk.bays) if (o !== b) assert.ok(!inBay(p, o), 'never through another bay');
  }
  const door = { x: 430, y: pk.y - 10 }, order = baysByDoor(pk.bays, door);
  for (let i = 1; i < order.length; i++) assert.ok(Math.hypot(order[i]!.x - door.x, order[i]!.y - door.y) >= Math.hypot(order[i - 1]!.x - door.x, order[i - 1]!.y - door.y) - 1e-9);
});

test('a golfer walks from the footpath along the aisles to the car, never across the rows of bays', () => {
  const pk = park();
  // (from each of the lot's ways on foot: carpark.ts lotExits, where a footpath starts)
  const exits = lotExits(pk);
  assert.ok(exits.length >= 6);
  for (const f of exits) for (const b of pk.bays) {
    const w = bayWalk(pk, b, f);
    assert.ok(w.length >= 3 && w[0] === f);
    for (const p of samples(w)) for (const o of pk.bays) assert.ok(!inBay(p, o, 0.1), 'not across a bay');
  }
});

test('a car park without the golf layout keeps its first-version bays and straight ways', () => {
  const plain = buildPark(road(), { id: 4, x: 400, y: Math.floor(ROAD_Y - verge()) - 16, w: 20, h: 16 })!;
  assert.equal(plain.bays.length, 56);
  assert.deepEqual(bayDrive(plain, plain.bays[0]!), []); assert.deepEqual(bayWalk(plain, plain.bays[0]!, { x: 0, y: 0 }), []);
});
