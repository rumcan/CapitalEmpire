// Headless test: the town keeps off the golf land (City.setGolf land): no lot starts on the course or the player's parcels, and the town's lots
// inside the course are cleared (also the ones that come after the golf state, every game hour); houses on the other parcels stay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { City } from '../src/game/city';
import { MAP } from '../src/game/iso';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });

/** a city with a long street at y 300 from x 200 to 800, grown for n steps */
function grown(n: number): City {
  const city = new City(5);
  city.terrain(new Uint8Array(MAP * MAP), { x: 200, y: 300 }, 7);
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(200, 300, 800, 300)], CLASS.street, 0);
  city.netOps(e.commit(true));
  for (let i = 0; i < n; i++) city.step(10);
  return city;
}
/** the built (or building) lots whose box lies in x0..x1 */
function builtIn(city: City, x0: number, x1: number): number {
  let n = 0;
  for (const [key, s] of city.town.states) { if (s.level < 1) continue; const l = city.lots.lots.get(key)!; const xs = [l.o.x, l.o.x + l.u.x * l.w, l.o.x + l.n.x * l.d]; if (Math.max(...xs) > x0 && Math.min(...xs) < x1) n++; }
  return n;
}

test('golf land: the course is cleared of town lots, the other parcels keep theirs, and nothing new starts on either', () => {
  const city = grown(4400); // about 3 game days
  const before = builtIn(city, 400, 600), parcel = builtIn(city, 600, 700);
  assert.ok(before > 0 && parcel > 0, `the town grew along the street (${before}, ${parcel})`);
  const ev = city.setGolf({ tier: 1, rep: 0, land: [[400, 250, 200, 100], [600, 250, 100, 100]] });
  assert.equal(ev.length, before); assert.ok(ev.every(e => e.kind === 'clear'));
  assert.equal(builtIn(city, 400, 600), 0); assert.equal(builtIn(city, 600, 700), parcel);
  for (let i = 0; i < 4400; i++) city.step(10);
  assert.equal(builtIn(city, 400, 600), 0, 'nothing new on the course'); assert.equal(builtIn(city, 600, 700), parcel, 'nothing new on the parcel');
  assert.ok(builtIn(city, 200, 400) + builtIn(city, 700, 800) > 0);
});
