// The parking props' spots (docs/PARKING.md section 3): a car park on an x-axis road gets its entrance and exit gates on its side, 3.2 tiles apart and not
// turned; on a y-axis road they turn; an on-street run gets a P sign and a pay-and-display machine on the sidewalk; a park with no entrance gets nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Seg } from '../src/game/network';
import type { CarPark } from '../src/game/event/carpark';
import { gateSpots } from '../src/game/parking-props';

/** a straight ground road from a to b with a 3-tile half width and a 2-tile walk (the class fields the spots read) */
const road = (ax: number, ay: number, bx: number, by: number) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, cls: { h: 3, walk: 2 } }) as unknown as Seg;
/** a car park (or an on-street run) on seg s with its entrance e and pv */
const park = (s: Seg, pv: { x: number; y: number }, e: { x: number; y: number }, curb = false) => ({ id: 1, x: 0, y: 0, w: 0, h: 0, side: 0, seg: s, entrances: [e], bays: [], pv, curb }) as unknown as CarPark;
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('an x-axis road: the entrance and exit gates on the park side, 3.2 tiles apart, not turned; the P sign beyond them', () => {
  const spots = gateSpots(park(road(0, 10, 20, 10), { x: 0, y: 1 }, { x: 10, y: 10 }));
  assert.deepEqual(spots.map(s => s.item), ['ce:parking-entry', 'ce:parking-exit', 'ce:parking-sign']);
  const [en, ex, sg] = spots as [typeof spots[0], typeof spots[0], typeof spots[0]];
  assert.ok(spots.every(s => s.flip === false));
  near(en.x, 8.4); near(en.y, 16.2);
  near(ex.x, 11.6); near(ex.y, 16.2);
  near(ex.x - en.x, 3.2); near(ex.y, en.y);
  near(sg.x, 13.4); near(sg.y, 16.8);
});

test('a y-axis road: the gates turn (flip) and stay on the park side', () => {
  const spots = gateSpots(park(road(10, 0, 10, 20), { x: 1, y: 0 }, { x: 10, y: 10 }));
  assert.ok(spots.every(s => s.flip === true));
  const [en, ex] = spots as [typeof spots[0], typeof spots[0]];
  near(en.x, 16.2); near(en.y, 8.4);
  near(ex.x, 16.2); near(ex.y, 11.6);
  near(ex.y - en.y, 3.2);
});

test('an on-street run: a P sign on the pv side of its entrance and a pay-and-display machine 2 tiles along the road from it', () => {
  const spots = gateSpots(park(road(0, 10, 20, 10), { x: 0, y: 1 }, { x: 10, y: 10 }, true));
  assert.deepEqual(spots.map(s => s.item), ['ce:parking-sign', 'ce:parking-paystation']);
  const [sg, pay] = spots as [typeof spots[0], typeof spots[0]];
  near(sg.x, 10); near(sg.y, 14);
  near(pay.x, 12); near(pay.y, 14);
  assert.ok(spots.every(s => s.flip === false));
});

test('a park with no entrance has no props', () => {
  const p = { ...park(road(0, 10, 20, 10), { x: 0, y: 1 }, { x: 10, y: 10 }), entrances: [] } as unknown as CarPark;
  assert.deepEqual(gateSpots(p), []);
});
