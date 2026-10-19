// The player's stadium (Phase B step 1): siteAt rebuilds the site from its footprint, siteWhy says why a spot is refused, and a City with
// autoStadium off has no site until setStadium places one (refused mid-round); a default City still auto-places. npm test (bundled by esbuild, run by node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeStadium, siteAt, siteWhy } from '../src/game/event/site';
import { STADIUM_H, STADIUM_TOWN_MIN, STADIUM_W } from '../src/game/event/config';
import { City } from '../src/game/city';
import { MAP } from '../src/game/iso';
import { TC } from '../src/game/terrain/types';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

/** three town centres on open ground (tiles) */
const CENTRES = [{ x: 300, y: 300 }, { x: 1000, y: 400 }, { x: 600, y: 1000 }];

test('siteAt: the site placeStadium finds is the same when rebuilt from its footprint; the centre and the doors as the search builds them', () => {
  const s = placeStadium(new Uint8Array(MAP * MAP), CENTRES);
  assert.ok(s, 'a site on open ground');
  assert.deepEqual(siteAt(s.x, s.y, s.w, s.h), s);
  const d = siteAt(200, 300, STADIUM_W, STADIUM_H);
  assert.deepEqual(d.c, { x: 250, y: 340 });
  assert.deepEqual(d.doors, [{ x: 250, y: 297 }, { x: 302, y: 340 }, { x: 250, y: 382 }, { x: 197, y: 340 }]);
});

test('siteWhy: open ground far from the towns is fine; the map edge, a water tile and a spot by a town are each refused, with the reason', () => {
  const cls = new Uint8Array(MAP * MAP);
  const ok = siteAt(1400, 1400, STADIUM_W, STADIUM_H);
  assert.equal(siteWhy(ok, cls, CENTRES), '');
  assert.equal(siteWhy(siteAt(10, 1000, STADIUM_W, STADIUM_H), cls, CENTRES), 'Too close to the map edge');

  const wet = new Uint8Array(cls); wet[1440 * MAP + 1450] = TC.WATER;
  assert.equal(siteWhy(ok, wet, CENTRES), 'Needs open land (no water, creek, bank or hill)');
  const patch = new Uint8Array(cls); patch[1440 * MAP + 1450] = TC.PATCH;
  assert.equal(siteWhy(ok, patch, CENTRES), '', 'a patch is open land');

  // the site's centre is (1050, 1040): a town STADIUM_TOWN_MIN - 1 tiles from it is too close, one STADIUM_TOWN_MIN away is not
  const at = siteAt(1000, 1000, STADIUM_W, STADIUM_H);
  assert.equal(siteWhy(at, cls, [{ x: 1050 + STADIUM_TOWN_MIN - 1, y: 1040 }]), 'Too close to a town: stadiums stand outside the towns');
  assert.equal(siteWhy(at, cls, [{ x: 1050 + STADIUM_TOWN_MIN, y: 1040 }]), '');
});

test('City with autoStadium off: no site after the terrain and startRound refused; setStadium places it and the round starts; setStadium(null) is refused mid-round', () => {
  const city = new City(7);
  city.autoStadium = false;
  city.terrain(new Uint8Array(MAP * MAP), { x: 40, y: 40 }, 7, CENTRES);
  const spot = city.suggested;
  assert.ok(spot, 'the game still has its spot');
  assert.equal(city.site, null, 'the player places the stadium');
  assert.equal(city.startRound(), false, 'no round without a site');

  assert.equal(city.setStadium([spot.x, spot.y, spot.w, spot.h]), true);
  assert.deepEqual(city.site, spot);
  assert.equal(city.startRound(), true, 'with a site the round starts');
  assert.equal(city.setStadium(null), false, 'refused while the round is under way');
  assert.deepEqual(city.site, spot, 'the site stays');
});

test('a default City (autoStadium on) auto-places the stadium: its site is the suggested spot, the game placeStadium', () => {
  const city = new City(7);
  city.terrain(new Uint8Array(MAP * MAP), { x: 40, y: 40 }, 7, CENTRES);
  assert.ok(city.suggested, 'a spot with towns');
  assert.deepEqual(city.site, city.suggested);
  assert.deepEqual(city.suggested, placeStadium(new Uint8Array(MAP * MAP), CENTRES));
});
