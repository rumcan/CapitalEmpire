// T207 (#546) The road tool's controls (the owner, 2026-10-27: "change right click to be the same as backspace when building all roads and enter
// or double click to build road"): a right-click takes back the last point (the first: the route is dropped), as Backspace does; Enter or a
// double-click builds, the double-click's second click adding no point; the Keys sheet says so. route-input.ts is what the engine asks
// (Game.routeInput, roadClick); a stand-in road tool here plays the browser's events through it. Headless: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOUBLE_MS, isSecondTap, routeAct, type RouteInput, type Tap } from '../src/game/route-input';
import { keySheet } from '../src/ui/keymap';

/** a stand-in road tool: the engine's roadClick, routeInput and finishRoute as far as the route's points go */
class Tool {
  route: { x: number; y: number }[] = []; built: { x: number; y: number }[][] = []; private tap: Tap | null = null;
  click(t: number, mx: number, my: number) {
    const tap = { t, mx, my }, second = isSecondTap(this.tap, tap); this.tap = second ? null : tap;
    if (routeAct('click', this.route.length, second) === 'point') this.route.push({ x: Math.round(mx / 10), y: Math.round(my / 10) });
  }
  input(i: Exclude<RouteInput, 'click'>) {
    const a = routeAct(i, this.route.length);
    if (a === 'back') this.route.pop(); else if (a === 'cancel') this.route = []; else if (a === 'build') { this.built.push(this.route); this.route = []; }
  }
}

test('a right-click takes back the last point, as Backspace does; on the first point it drops the route', () => {
  for (const i of ['right', 'backspace'] as const) {
    const g = new Tool();
    g.click(0, 100, 100); g.click(1000, 300, 100); g.click(2000, 300, 300);
    g.input(i); assert.deepEqual(g.route, [{ x: 10, y: 10 }, { x: 30, y: 10 }], i);
    g.input(i); assert.deepEqual(g.route, [{ x: 10, y: 10 }], i);
    g.input(i); assert.deepEqual(g.route, [], `${i}: the first point drops the route`);
    g.input(i); assert.deepEqual(g.route, [], `${i}: nothing to take back`);
    assert.equal(g.built.length, 0, `${i} never builds`);
  }
  assert.equal(routeAct('right', 5), 'back'); assert.equal(routeAct('right', 1), 'cancel'); assert.equal(routeAct('right', 0), 'none');
});

test('a double-click builds the route as drawn: its second click adds no duplicate point and no leg of no length', () => {
  const g = new Tool();
  g.click(0, 100, 100); g.click(800, 300, 100);
  // the double-click on the last point: the browser's click, click, dblclick (the second click a pixel or two off)
  g.click(2000, 300, 300); g.click(2000 + 180, 302, 301); g.input('double');
  assert.deepEqual(g.built, [[{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 30 }]]);
  assert.deepEqual(g.route, []);
  // two slow clicks at the same spot are two clicks (the second is a point, as before); a quick one far off too
  assert.equal(isSecondTap({ t: 0, mx: 0, my: 0 }, { t: DOUBLE_MS + 1, mx: 0, my: 0 }), false);
  assert.equal(isSecondTap({ t: 0, mx: 0, my: 0 }, { t: 100, mx: 40, my: 0 }), false);
  assert.equal(isSecondTap({ t: 0, mx: 0, my: 0 }, { t: 100, mx: 3, my: 2 }), true);
  // a double-click on the route's first point: no route to build, nothing added
  const h = new Tool(); h.click(0, 100, 100); h.click(150, 101, 100); h.input('double');
  assert.deepEqual(h.route, [{ x: 10, y: 10 }]); assert.equal(h.built.length, 0);
});

test('Enter builds the route; with one point or none it does nothing', () => {
  const g = new Tool();
  g.input('enter'); assert.equal(g.built.length, 0);
  g.click(0, 100, 100); g.input('enter'); assert.equal(g.built.length, 0); assert.equal(g.route.length, 1);
  g.click(1000, 100, 400); g.input('enter');
  assert.deepEqual(g.built, [[{ x: 10, y: 10 }, { x: 10, y: 40 }]]);
  assert.equal(routeAct('enter', 2), 'build'); assert.equal(routeAct('double', 2), 'build'); assert.equal(routeAct('enter', 1), 'none');
});

test('the Keys sheet\'s roads and paths card: Enter and a double-click build, Backspace and a right-click take back a point', () => {
  const s = keySheet({ golf: true, range: true, ui: null }).find(x => x.id === 'in:road');
  assert.ok(s, 'the card');
  assert.equal(s.title, 'Roads and paths in hand');
  const row = (k: string) => s.rows.find(r => r.keys === k)?.what;
  assert.equal(row('Enter, double-click'), 'build the route');
  assert.match(row('Backspace, right-click') ?? '', /^take back the last point/);
});
