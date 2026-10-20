// The businesses in the City (Phase B step 2): setBusinesses keeps each one's stats by id and its site follows the stadium entry; the stadium stays while a
// round runs; restoreBiz fills the stats; setStadium still works; bizView gives the stadium the round's level. siteWhy's water rule is here too. npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { City } from '../src/game/city';
import { freshStats, type BizDef } from '../src/game/business/state';
import { START_SAT } from '../src/game/business/catalogue';
import { siteAt, siteWhy } from '../src/game/event/site';
import { STADIUM_H, STADIUM_W } from '../src/game/event/config';
import { MAP } from '../src/game/iso';
import { TC } from '../src/game/terrain/types';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

/** three town centres on open ground (tiles) */
const CENTRES = [{ x: 300, y: 300 }, { x: 1000, y: 400 }, { x: 600, y: 1000 }];
const STAD: BizDef = { id: 1, type: 'stadium', x: 1400, y: 1400, w: STADIUM_W, h: STADIUM_H };
const BAR: BizDef = { id: 2, type: 'sportsbar', x: 1000, y: 1000, w: 14, h: 10 };
const DINER: BizDef = { id: 3, type: 'diner', x: 1100, y: 1000, w: 12, h: 10 };

/** a City with autoStadium off on open ground, as the browser's worker has it */
function fresh(): City {
  const city = new City(7);
  city.autoStadium = false;
  city.terrain(new Uint8Array(MAP * MAP), { x: 40, y: 40 }, 7, CENTRES);
  return city;
}

test('setBusinesses keeps each business\'s stats by id across calls; a removed one placed again starts fresh', () => {
  const city = fresh();
  city.setBusinesses([BAR, DINER]);
  assert.equal(city.businesses.length, 2);
  city.restoreBiz([{ ...freshStats(2), level: 2, revenue: 500 }]);
  city.setBusinesses([BAR, DINER]);
  const kept = city.bizView().find(b => b.id === 2)!;
  assert.equal(kept.revenue, 500, 'the stats stay across a call');
  assert.equal(kept.level, 2);
  city.setBusinesses([DINER]);
  city.setBusinesses([BAR, DINER]);
  assert.equal(city.bizView().find(b => b.id === 2)!.revenue, 0, 'a business removed and placed again starts fresh');
});

test('the site is siteAt of the stadium entry, and null with no stadium', () => {
  const city = fresh();
  city.setBusinesses([BAR]);
  assert.equal(city.site, null, 'no stadium, no site');
  city.setBusinesses([BAR, STAD]);
  assert.deepEqual(city.site, siteAt(STAD.x, STAD.y, STAD.w, STAD.h));
  city.setBusinesses([BAR]);
  assert.equal(city.site, null, 'the stadium removed: no site');
});

test('while a round is under way the stadium stays: a list without it, or with another spot for it, leaves the stadium as it was', () => {
  const city = fresh();
  city.setBusinesses([STAD]);
  assert.equal(city.startRound(), true);
  city.setBusinesses([BAR]);
  assert.deepEqual(city.site, siteAt(STAD.x, STAD.y, STAD.w, STAD.h), 'the site stays');
  assert.equal(city.businesses.filter(b => b.type === 'stadium').length, 1, 'the stadium is kept');
  city.setBusinesses([{ ...STAD, x: 1300 }, BAR]);
  assert.deepEqual(city.site, siteAt(STAD.x, STAD.y, STAD.w, STAD.h), 'the spot does not move');
  assert.ok(city.businesses.some(b => b.type === 'sportsbar'), 'the others do change');
});

test('restoreBiz fills the placed businesses\' stats by id, the others stay fresh, and bizView returns copies', () => {
  const city = fresh();
  city.setBusinesses([STAD, BAR]);
  const saved = { ...freshStats(2), level: 3, xp: 1500, sat: 0.5, goodDays: 4, revenue: 9000, visitors: 120, today: { visitors: 7, late: 1, missed: 2, revenue: 80 } };
  city.restoreBiz([saved]);
  const v = city.bizView().find(b => b.id === 2)!;
  assert.equal(v.level, 3);
  assert.equal(v.xp, 1500);
  assert.equal(v.sat, 0.5);
  assert.equal(v.goodDays, 4);
  assert.equal(v.revenue, 9000);
  assert.equal(v.visitors, 120);
  assert.deepEqual(v.today, saved.today);
  assert.equal(city.bizView().find(b => b.id === 1)!.sat, START_SAT, 'an id not saved keeps fresh stats');
  v.level = 9;
  assert.equal(city.bizView().find(b => b.id === 2)!.level, 3, 'bizView returns copies');
});

test('setStadium still places the stadium (its own id, else the next after the highest), takes it away with null, and is refused mid-round', () => {
  const city = fresh();
  assert.equal(city.setStadium([STAD.x, STAD.y, STAD.w, STAD.h]), true);
  assert.deepEqual(city.site, siteAt(STAD.x, STAD.y, STAD.w, STAD.h));
  assert.equal(city.businesses.find(b => b.type === 'stadium')!.id, 1, 'the first id is 1');
  assert.equal(city.setStadium(null), true);
  assert.equal(city.site, null);
  city.setBusinesses([BAR]);
  assert.equal(city.setStadium([STAD.x, STAD.y, STAD.w, STAD.h]), true);
  assert.equal(city.businesses.find(b => b.type === 'stadium')!.id, 3, 'the next after the highest id');
  assert.equal(city.startRound(), true);
  assert.equal(city.setStadium(null), false, 'refused while the round is under way');
  assert.deepEqual(city.site, siteAt(STAD.x, STAD.y, STAD.w, STAD.h), 'the site stays');
});

test('bizView: the stadium\'s level is the round\'s, the others\' level is their stored one', () => {
  const city = fresh();
  city.setBusinesses([STAD, BAR]);
  city.restoreBiz([{ ...freshStats(2), level: 2 }]);
  city.round.level = 3;
  const views = city.bizView();
  assert.equal(views.find(b => b.type === 'stadium')!.level, 3);
  assert.equal(views.find(b => b.type === 'sportsbar')!.level, 2);
});

test('siteWhy with water: a water-side spot needs a water tile within 6 tiles of its footprint; townMin 0 skips the town check', () => {
  const cls = new Uint8Array(MAP * MAP), at = siteAt(1000, 1000, 60, 40), far = [{ x: 200, y: 200 }];
  const msg = 'Must stand by water (a lake or a river within 12 m)';
  assert.equal(siteWhy(at, cls, far, 150, true), msg, 'no water near');
  const near = new Uint8Array(cls); near[1020 * MAP + 1063] = TC.WATER;
  assert.equal(siteWhy(at, near, far, 150, true), '', 'a lake 3 tiles off the east edge');
  const away = new Uint8Array(cls); away[1020 * MAP + 1070] = TC.WATER;
  assert.equal(siteWhy(at, away, far, 150, true), msg, 'a lake 10 tiles off is too far');
  assert.equal(siteWhy(at, cls, [{ x: 1030, y: 1020 }], 0, false), '', 'townMin 0: no town check');
});
