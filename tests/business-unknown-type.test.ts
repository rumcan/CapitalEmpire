// A save naming a business type today's catalogue does not have (one made by another branch) loads with that business dropped and one warning
// naming the type (T135): the engine's load and the city's setBusinesses keep the known businesses, and the city's visit plan no longer throws
// on every step. npm test (bundled by esbuild, run by node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { City } from '../src/game/city';
import type { BizDef } from '../src/game/business/state';
import { knownBusinesses } from '../src/game/business/catalogue';
import { MAP } from '../src/game/iso';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

/** a save's businesses: a clubhouse, a type from another branch, and a diner */
const SAVED = [
  { id: 1, type: 'clubhouse', x: 1000, y: 1000, w: 40, h: 24 },
  { id: 2, type: 'pro-shop-v9', x: 1100, y: 1000, w: 12, h: 12 },
  { id: 3, type: 'diner', x: 1200, y: 1000, w: 12, h: 10 },
] as unknown as BizDef[];

/** runs f with console.warn caught: the warnings it wrote */
function warnings(f: () => void): string[] {
  const out: string[] = [], was = console.warn;
  console.warn = (...a: unknown[]) => { out.push(a.join(' ')); };
  try { f(); } finally { console.warn = was; }
  return out;
}

test('knownBusinesses keeps the types the catalogue has and drops the rest with one warning naming them', () => {
  let kept: BizDef[] = [];
  const w = warnings(() => { kept = knownBusinesses(SAVED, 'load'); });
  assert.deepEqual(kept.map(d => d.id), [1, 3]);
  assert.equal(w.length, 1, 'one warning');
  assert.match(w[0]!, /pro-shop-v9/);
  assert.equal(warnings(() => knownBusinesses(kept, 'load')).length, 0, 'no warning when every type is known');
  assert.deepEqual(knownBusinesses([{ type: 'constructor' }], 'load'), [], 'a name off the object prototype is no type either');
});

test("the city drops the unknown type and steps on (its visit plan read the missing type's kind every step)", () => {
  const city = new City(7); city.autoStadium = false;
  city.terrain(new Uint8Array(MAP * MAP), { x: 40, y: 40 }, 7, [{ x: 300, y: 300 }, { x: 1000, y: 400 }]);
  const w = warnings(() => city.setBusinesses(SAVED));
  assert.equal(w.length, 1);
  assert.deepEqual(city.businesses.map(b => b.type), ['clubhouse', 'diner']);
  assert.doesNotThrow(() => { for (let k = 0; k < 20; k++) city.step(10); });
});
