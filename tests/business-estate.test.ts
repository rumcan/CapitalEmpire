// The golf estate's lots (Phase B step 6, business/catalogue.ts and City.closeVisits): at each day's close an estate sells its golf course's level in lots
// (the best golf course with satisfaction at least ESTATE_SAT that had players that day), up to ESTATE_LOTS in all; the lots are the takings of that day (the ledger's business
// line). npm test (bundled by esbuild, run by node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { City } from '../src/game/city';
import { MAP } from '../src/game/iso';
import { BUSINESS, ESTATE_LOTS, ESTATE_SAT, LEVEL_XP } from '../src/game/business/catalogue';
import { freshStats, type BizDef } from '../src/game/business/state';
import type { Ledger } from '../src/game/budget';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

/** three town centres on open ground (tiles) */
const CENTRES = [{ x: 300, y: 300 }, { x: 1000, y: 400 }, { x: 600, y: 1000 }];
/** a golf course and its estate, away from every road (none here: no door is needed) */
const GOLF: BizDef = { id: 10, type: 'golf', x: 700, y: 60, w: 150, h: 110 };
const EST: BizDef = { id: 11, type: 'estate', x: 880, y: 60, w: 80, h: 60 };
const PRICE = BUSINESS.estate.pricePerVisitor;

/** a City on open ground with its towns stamped, the golf course at the given level and satisfaction, and the estate with `sold` lots sold before; with
 *  played (the default) the course had 5 players on each day closed (the counts the visits give the close; the course here has no road for real ones) */
function estateCity(golf: { level: number; sat: number }, sold = 0, played = true): City {
  const city = new City(7);
  city.autoStadium = false;
  city.terrain(new Uint8Array(MAP * MAP), { x: 40, y: 40 }, 7, CENTRES);
  city.setBusinesses([GOLF, EST]);
  city.restoreBiz([{ ...freshStats(GOLF.id), xp: LEVEL_XP[golf.level - 1]!, ...golf }, { ...freshStats(EST.id), visitors: sold }]);
  if (played) {
    const end = city.visits.endDay.bind(city.visits);
    city.visits.endDay = () => { const m = end(); m.set(GOLF.id, { planned: 5, spawned: 5, onTime: 5, late: 0, missed: 0 }); return m; };
  }
  return city;
}

/** steps the city until its next game day closes, and returns that day's ledger */
function closeDay(city: City): Ledger {
  for (let i = 0; i < 20000; i++) { const l = city.step(10).ledger; if (l) return l; }
  assert.fail('a game day closed');
}

test('an estate sells its golf course\'s level in lots at the day close, while the course has satisfaction at least ESTATE_SAT', () => {
  const city = estateCity({ level: 2, sat: 0.8 });
  const ledger = closeDay(city);
  const s = city.bizView().find(b => b.id === EST.id)!;
  assert.equal(s.visitors, 2, 'two lots: the golf level');
  assert.equal(s.today.visitors, 2, 'today shows the close\'s sales');
  assert.equal(s.revenue, 2 * PRICE, 'revenue = lots * price of one lot');
  assert.equal(s.today.revenue, 2 * PRICE);
  assert.equal(s.xp, 2, 'the lots count as xp');
  assert.equal(s.goodDays, 1, 'a day with lots sold is a good day');
  assert.equal(ledger.business, 2 * PRICE, 'the ledger\'s business line includes the lots');
});

test('an estate sells no lots while its golf course is below ESTATE_SAT', () => {
  // the close moves the satisfaction 30% toward the day's score (1 with the 5 players) first: 0.3 ends at 0.51, still under ESTATE_SAT
  const city = estateCity({ level: 2, sat: ESTATE_SAT - 0.3 });
  const ledger = closeDay(city);
  const s = city.bizView().find(b => b.id === EST.id)!;
  assert.equal(s.visitors, 0, 'no lots');
  assert.equal(s.revenue, 0);
  assert.equal(s.goodDays, 0, 'no lots, no good day');
  assert.equal(ledger.business, 0, 'no takings');
});

test('an estate stops at ESTATE_LOTS: with 23 sold it sells one more, then none', () => {
  const city = estateCity({ level: 2, sat: 0.8 }, ESTATE_LOTS - 1);
  closeDay(city);
  let s = city.bizView().find(b => b.id === EST.id)!;
  assert.equal(s.visitors, ESTATE_LOTS, 'sold out at the lot count');
  assert.equal(s.today.visitors, 1, 'only the last lot sells today');
  assert.equal(s.revenue, PRICE);
  closeDay(city);
  s = city.bizView().find(b => b.id === EST.id)!;
  assert.equal(s.visitors, ESTATE_LOTS, 'no more lots after the last one');
  assert.equal(s.today.visitors, 0, 'nothing sold the next day');
  assert.equal(s.revenue, PRICE);
});

test('an estate sells no lots after a day its golf course had no players (a course nobody can reach)', () => {
  const city = estateCity({ level: 2, sat: 0.8 }, 0, false);
  closeDay(city);
  assert.equal(city.bizView().find(b => b.id === EST.id)!.visitors, 0, 'no players, no lots');
});
