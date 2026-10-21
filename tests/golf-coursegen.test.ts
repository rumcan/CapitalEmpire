// The old nine-hole course generator (golf/coursegen.ts): nine holes with pins and tees, par 36, the length, the areas inside the site, and the seeded layout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateOldNine, OLD_NINE_PARS } from '../src/game/golf/coursegen';
import { TILE_M, type CourseArea, type CourseLayout } from '../src/game/golf/types';

/** a 300 x 450 tile site (600 x 900 m) */
const SITE = { x0: 100, y0: 100, x1: 400, y1: 550 };
/** a 200 x 250 tile site: too small for the full lengths */
const SMALL = { x0: 100, y0: 100, x1: 300, y1: 350 };
const HOLES = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** true when (x, y) is inside the flat outline pts (x0 y0 x1 y1 ...), by ray casting */
function inside(pts: number[], x: number, y: number): boolean {
  let c = false;
  const n = pts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[2 * i], yi = pts[2 * i + 1], xj = pts[2 * j], yj = pts[2 * j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** the areas painted with one surface, in paint order */
function areasOf(lay: CourseLayout, surface: CourseArea['surface']): CourseArea[] {
  return lay.areas.filter(a => a.surface === surface);
}

/** a hole's back tee to pin distance in metres, following its aim points in order */
function holeM(lay: CourseLayout, hole: number): number {
  const tee = lay.tees.find(t => t.hole === hole && t.kind === 'back')!;
  const pin = lay.pins.find(p => p.hole === hole)!;
  const pts = [tee, ...lay.aims.filter(a => a.hole === hole).sort((a, b) => a.order - b.order), pin];
  let m = 0;
  for (let i = 1; i < pts.length; i++) m += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) * TILE_M;
  return m;
}

test('nine holes, each with a pin and a back tee', () => {
  const lay = generateOldNine(SITE, 1);
  assert.deepEqual(lay.pins.map(p => p.hole), HOLES);
  assert.deepEqual(lay.tees.filter(t => t.kind === 'back').map(t => t.hole), HOLES);
  assert.equal(lay.tees.length, 27);
});

test('pars total 36 with two par 3s, five par 4s and two par 5s', () => {
  assert.equal(OLD_NINE_PARS.reduce((a, b) => a + b, 0), 36);
  assert.equal(OLD_NINE_PARS.filter(p => p === 3).length, 2);
  assert.equal(OLD_NINE_PARS.filter(p => p === 4).length, 5);
  assert.equal(OLD_NINE_PARS.filter(p => p === 5).length, 2);
  // a fairway for each par 4 and 5 (the par 3s have none)
  assert.equal(areasOf(generateOldNine(SITE, 1), 'fairway').length, 7);
});

test('back tee to pin, following the aims, is 2,200 to 3,000 m on a 300 x 450 site', () => {
  const lay = generateOldNine(SITE, 1);
  const total = HOLES.reduce((s, h) => s + holeM(lay, h), 0);
  assert.ok(total >= 2200 && total <= 3000, `total ${total.toFixed(0)} m`);
});

test('6 bunkers: 4 greenside and 2 fairway, each a 10-gon', () => {
  for (const seed of [1, 2, 3]) {
    const bunkers = areasOf(generateOldNine(SITE, seed), 'bunker');
    assert.equal(bunkers.length, 6, `seed ${seed}`);
    for (const b of bunkers) assert.equal(b.pts.length, 20);
  }
});

test('the aim points are numbered 0, 1, ... per hole', () => {
  const lay = generateOldNine(SITE, 1);
  for (const h of HOLES) {
    const orders = lay.aims.filter(a => a.hole === h).map(a => a.order);
    assert.deepEqual(orders, orders.map((_, i) => i));
  }
});

test('every area point is inside the site', () => {
  const lay = generateOldNine(SITE, 1);
  for (const a of lay.areas) {
    for (let i = 0; i < a.pts.length; i += 2) {
      assert.ok(a.pts[i] >= SITE.x0 && a.pts[i] <= SITE.x1, `${a.surface} x ${a.pts[i]}`);
      assert.ok(a.pts[i + 1] >= SITE.y0 && a.pts[i + 1] <= SITE.y1, `${a.surface} y ${a.pts[i + 1]}`);
    }
  }
});

test('each pin is inside its green, each back tee inside its tee rectangle', () => {
  const lay = generateOldNine(SITE, 1);
  const greens = areasOf(lay, 'green'), tees = areasOf(lay, 'tee');
  assert.equal(greens.length, 9);
  assert.equal(tees.length, 9);
  lay.pins.forEach((p, i) => assert.ok(inside(greens[i].pts, p.x, p.y), `pin ${p.hole}`));
  lay.tees.filter(t => t.kind === 'back').forEach((t, i) => assert.ok(inside(tees[i].pts, t.x, t.y), `back tee ${t.hole}`));
});

test('the same seed gives the same layout; seeds 1 and 2 differ', () => {
  assert.deepEqual(generateOldNine(SITE, 1), generateOldNine(SITE, 1));
  assert.notDeepEqual(generateOldNine(SITE, 1), generateOldNine(SITE, 2));
});

test('a 200 x 250 site still holds nine holes inside it, scaled down', () => {
  const lay = generateOldNine(SMALL, 1);
  assert.deepEqual(lay.pins.map(p => p.hole), HOLES);
  assert.deepEqual(lay.tees.filter(t => t.kind === 'back').map(t => t.hole), HOLES);
  for (const a of lay.areas) {
    for (let i = 0; i < a.pts.length; i += 2) {
      assert.ok(a.pts[i] >= SMALL.x0 && a.pts[i] <= SMALL.x1, `${a.surface} x`);
      assert.ok(a.pts[i + 1] >= SMALL.y0 && a.pts[i + 1] <= SMALL.y1, `${a.surface} y`);
    }
  }
  for (const p of lay.pins) assert.ok(p.x >= SMALL.x0 && p.x <= SMALL.x1 && p.y >= SMALL.y0 && p.y <= SMALL.y1);
});
