// #1276 (the owner, 2026-11-14: "change the way the road building works so it is a click and drag and release builds like in sim city"): the road tool's
// press, drag and release. The press that begins a route is a click as ever and also a drag's start; dragged on, its release builds the run from the press to the
// pointer (the preview all along is the ordinary one: same ghost, cost and reasons); a press and release on the same spot is the old click, click, double-click.
// Esc, Backspace or a right click during the drag drop it. route-input.ts RouteGesture is what the engine asks; a stand-in road tool here plays the browser's
// events through it, mirroring the engine's glue (roadPress, the guards at the top of pointerDown, pointerMove's hook, roadRelease, cancelRoute), and the
// engine's source is read for that glue. Neighbour of route-input.test.ts (T207: right click, Backspace, Enter, double-click), whose expectations stand. Headless: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DRAG_MIN_TILES, DRAG_PX, isSecondTap, routeAct, RouteGesture, type RouteInput, type Tap } from '../src/game/route-input';
import { keySheet } from '../src/ui/keymap';

/** a stand-in road tool for the drag (css px on the map, 10 px a tile; a stand-in route's length is the straight line from its last point to the pointer) */
class DragTool {
  route: { x: number; y: number }[] = []; built: { x: number; y: number }[][] = []; toasts: string[] = []; builds = 0;
  readonly g = new RouteGesture(); private tap: Tap | null = null;
  /** a reason the end of the route is refused with (a red ghost), and whether the money is short (finishRoute refuses) */
  refuse = ''; poor = false;
  hover: { x: number; y: number } | null = null;
  private tile = (mx: number, my: number) => ({ x: Math.round(mx / 10), y: Math.round(my / 10) });
  /** roadClick: the first point starts the route, each later one adds a point, the second click of a double-click none */
  private click(t: number, mx: number, my: number) {
    const tap = { t, mx, my }, second = isSecondTap(this.tap, tap); this.tap = second ? null : tap;
    if (routeAct('click', this.route.length, second) === 'point') this.route.push(this.tile(mx, my));
  }
  /** pointerDown: a drag in hand takes a right press as its cancel and ignores another finger; a fresh left press means the release was lost; then roadPress */
  down(t: number, mx: number, my: number, o: { button?: number; primary?: boolean } = {}) {
    if (this.g.down) { if (o.button === 2) { this.cancelRoute(); return; } if (o.primary === false) return; this.g.cancel(); }
    const began = !this.route.length; this.click(t, mx, my);
    if (began && this.route.length === 1) this.g.begin(mx, my);
  }
  move(mx: number, my: number, buttons = 1) { this.hover = this.tile(mx, my); if (this.g.down && this.g.move(mx, my, buttons) === 'cancel') this.cancelRoute(); }
  /** pointerUp: roadRelease */
  up() {
    if (!this.g.down) return;
    const last = this.route[this.route.length - 1], h = this.hover;
    if (!last || !h) { this.g.cancel(); return; }
    if (this.g.end(Math.hypot(h.x - last.x, h.y - last.y)) !== 'build') return;
    this.tap = null;
    if (this.refuse) { this.toasts.push(this.refuse); this.cancelRoute(); return; }
    this.route.push(h); this.finish();
    if (this.route.length) this.cancelRoute();
  }
  finish() { if (this.poor) { this.toasts.push('Not enough money'); return; } this.built.push(this.route); this.builds++; this.route = []; }
  cancelRoute() { this.route = []; this.g.cancel(); }
  input(i: Exclude<RouteInput, 'click'>) {
    const a = routeAct(i, this.route.length);
    if (a === 'back') { this.route.pop(); if (!this.route.length) this.g.cancel(); } else if (a === 'cancel') this.cancelRoute(); else if (a === 'build') this.finish();
  }
}

test('press, drag, release builds the run from the press to the pointer, once', () => {
  const t = new DragTool();
  t.down(0, 100, 100); assert.deepEqual(t.route, [{ x: 10, y: 10 }]); assert.ok(t.g.down, 'the press began the route: a drag may follow');
  t.move(150, 100); t.move(250, 100); t.move(400, 100);
  assert.ok(t.g.dragged); assert.equal(t.builds, 0, 'nothing is built while the pointer is down: only the preview');
  t.up();
  assert.deepEqual(t.built, [[{ x: 10, y: 10 }, { x: 40, y: 10 }]]); assert.deepEqual(t.route, []); assert.ok(!t.g.down);
  t.up(); t.up(); assert.equal(t.builds, 1, 'a second release builds nothing more');
  // the next drag starts afresh, and a quick one from the spot the last began (a star of roads from one hub) is not taken for a double-click's second click
  t.down(300, 100, 100); t.move(100, 300); t.up();
  assert.equal(t.builds, 2); assert.deepEqual(t.built[1], [{ x: 10, y: 10 }, { x: 10, y: 30 }]);
});

test('Esc, Backspace or a right click during the drag drop it; the release then builds nothing', () => {
  // Esc (the engine's escHand: the route in hand is cancelled)
  let t = new DragTool(); t.down(0, 100, 100); t.move(400, 100); t.cancelRoute(); assert.deepEqual(t.route, []); assert.ok(!t.g.down);
  t.move(500, 100); t.up(); assert.equal(t.builds, 0, 'Esc: nothing built');
  // Backspace on the route's only point: the route is dropped, and with it the drag
  t = new DragTool(); t.down(0, 100, 100); t.move(400, 100); t.input('backspace'); assert.ok(!t.g.down); t.up(); assert.equal(t.builds, 0);
  // a right click joining the held left button (the browser's pointermove with buttons 3): the route is dropped
  t = new DragTool(); t.down(0, 100, 100); t.move(300, 100, 1); t.move(310, 100, 3); assert.deepEqual(t.route, []); assert.ok(!t.g.down);
  t.move(320, 100, 1); t.up(); assert.equal(t.builds, 0, 'a right click: nothing built');
  // a right press where the browser gives one (it cancels, and the press does no pan of its own)
  t = new DragTool(); t.down(0, 100, 100); t.move(300, 100); t.down(5, 300, 100, { button: 2 }); assert.deepEqual(t.route, []); t.up(); assert.equal(t.builds, 0);
  // the right-click ladder's own step on the single point (routeAct 'right' with one point) is the same cancel
  assert.equal(routeAct('right', 1), 'cancel');
});

test('a press and release on the same spot is the click it always was: the route is begun and stays in hand for click, click, double-click', () => {
  const t = new DragTool();
  t.down(0, 100, 100); t.move(103, 102); assert.ok(!t.g.dragged, 'a few pixels of wobble is no drag'); t.up();
  assert.equal(t.builds, 0); assert.deepEqual(t.route, [{ x: 10, y: 10 }], 'the first click began the route'); assert.ok(!t.g.down, 'the press is spent');
  // the old way on from there: a click for each point, the second click of a double-click adds none, and the double-click builds
  t.move(300, 100); t.down(1000, 300, 100); t.up(); t.move(300, 300); t.down(2000, 300, 300); t.up();
  t.down(2200, 302, 301); t.up(); t.input('double');
  assert.deepEqual(t.built, [[{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 30 }]]); assert.equal(t.builds, 1);
  // Enter builds as before, and the press into a route in hand is only a click, never a drag: it adds its point and its release builds nothing
  const u = new DragTool(); u.down(0, 100, 100); u.up(); u.move(500, 100); u.down(1000, 500, 100); assert.ok(!u.g.down, 'a press into a route in hand arms no drag');
  u.move(800, 400); u.up(); assert.equal(u.builds, 0); assert.deepEqual(u.route, [{ x: 10, y: 10 }, { x: 50, y: 10 }]);
  u.input('enter'); assert.equal(u.builds, 1);
  // the threshold: DRAG_PX of travel is still a click, a pixel more is a drag
  const v = new DragTool(); v.down(0, 100, 100); v.move(100 + DRAG_PX, 100); assert.ok(!v.g.dragged); v.move(100 + DRAG_PX + 1, 100); assert.ok(v.g.dragged);
});

test('a drag too short to be a road is a wobbled click; a refused end says why and drops the route; short money builds nothing and drops it', () => {
  // dragged past the threshold but ending a tile from the start: a click (the route stays begun), no refusal for a road nobody drew
  const t = new DragTool(); t.refuse = 'Too close to a junction'; t.down(0, 100, 100); t.move(111, 100); t.move(112, 100); assert.ok(t.g.dragged); t.up();
  assert.deepEqual(t.route, [{ x: 10, y: 10 }]); assert.deepEqual(t.toasts, []); assert.equal(t.builds, 0);
  assert.ok(DRAG_MIN_TILES >= 2, 'a road under about 4 m is no road');
  // a real drag to a spot the rules refuse (the ghost was red): the reason is said, the route is dropped, the next press starts afresh
  const u = new DragTool(); u.refuse = 'A building is in the way'; u.down(0, 100, 100); u.move(400, 100); u.up();
  assert.deepEqual(u.toasts, ['A building is in the way']); assert.deepEqual(u.route, []); assert.equal(u.builds, 0);
  u.refuse = ''; u.down(5000, 100, 100); u.move(100, 400); u.up(); assert.equal(u.builds, 1, 'the next drag builds');
  // not enough money: finishRoute says so; the drag's route does not linger
  const w = new DragTool(); w.poor = true; w.down(0, 100, 100); w.move(400, 100); w.up();
  assert.deepEqual(w.toasts, ['Not enough money']); assert.deepEqual(w.route, []); assert.ok(!w.g.down); assert.equal(w.builds, 0);
});

test('a lost release, a second finger, and a stale press never leave the tool stuck', () => {
  // the release was missed (the pointer let go outside the window): the next move shows no button down: no drag, nothing built, the route stays begun
  const t = new DragTool(); t.down(0, 100, 100); t.move(300, 100); t.move(320, 100, 0); assert.ok(!t.g.down);
  t.up(); assert.equal(t.builds, 0); assert.deepEqual(t.route, [{ x: 10, y: 10 }]);
  // a second finger while the first drags is ignored; the first still builds
  const u = new DragTool(); u.down(0, 100, 100); u.move(300, 100); u.down(50, 60, 60, { primary: false }); assert.ok(u.g.down); assert.deepEqual(u.route, [{ x: 10, y: 10 }]);
  u.up(); assert.equal(u.builds, 1);
  // a left press while a drag is still marked down (its release never came): the old drag is dropped and this press is a click into the route in hand
  const w = new DragTool(); w.down(0, 100, 100); w.move(300, 100); w.down(3000, 500, 500); assert.ok(!w.g.down, 'no drag any more'); assert.deepEqual(w.route, [{ x: 10, y: 10 }, { x: 50, y: 50 }]);
  w.up(); assert.equal(w.builds, 0);
  // the gesture alone: nothing down, nothing to do
  const g = new RouteGesture(); assert.equal(g.move(10, 10, 3), 'none'); assert.equal(g.end(50), 'none'); g.cancel(); assert.ok(!g.down);
});

test('the engine\'s glue: the press that began the route arms the drag, the release builds it, every way of dropping the route drops the drag; the hint and the Keys sheet say so', () => {
  const eng = readFileSync('src/game/engine.ts', 'utf8'), app = readFileSync('src/App.tsx', 'utf8');
  assert.match(eng, /case 'road': this\.roadPress\(mx, my\); break;/, 'the road tool\'s left press goes through roadPress');
  assert.match(eng, /private roadPress\(mx: number, my: number\) \{\s*const began = !this\.route\.length;\s*this\.roadClick\(mx, my\);\s*if \(began && this\.route\.length === 1\) this\.routeGesture\.begin\(mx, my\);/, 'only the press that began the route arms the drag');
  assert.match(eng, /if \(this\.routeGesture\.down\) this\.roadRelease\(\);/, 'pointerUp hands the release to roadRelease');
  assert.match(eng, /this\.routeGesture\.down && this\.routeGesture\.move\(mx, my, e\.buttons\) === 'cancel'\) this\.cancelRoute\(\)/, 'pointerMove watches for the right click');
  assert.match(eng, /cancelRoute\(\) \{ this\.route = \[\]; this\.routeFrom = this\.routeLast = null; this\.routeGesture\.cancel\(\);/, 'cancelRoute (Esc, Cancel, a tool change) ends the drag');
  assert.match(eng, /undoRoutePoint\(\) \{ this\.route\.pop\(\); if \(!this\.route\.length\) this\.routeGesture\.cancel\(\);/, 'taking back the only point ends it too');
  // roadClick still takes the clicks the scripts and the stress test make, and the release builds through the same judge and builder as a click and Enter
  assert.match(eng, /private roadClick\(mx: number, my: number\) \{[\s\S]*?this\.addRoutePoint\(this\.tileAt\(mx, my\)\);/);
  assert.match(eng, /private roadRelease\(\) \{[\s\S]*?this\.addRoutePoint\(t\)[\s\S]*?this\.finishRoute\(\);/);
  // the hint line and the panel say it, and click, click, double-click is named as still working
  assert.match(app, /g\.routeDragging \? `Let go to build/);
  assert.match(app, /Press, drag and let go to build a \$\{g\.cls\.name\.toLowerCase\(\)\} \(it bends at 45°\), or click to start a route/);
  assert.match(app, /Drag from where it starts to where it ends and let go to build it[^<]*Or click point by point: double-click the last point or press Enter to build/);
  const s = keySheet({ golf: true, range: true, ui: null }).find(x => x.id === 'in:road')!, row = (k: string) => s.rows.find(r => r.keys === k)?.what ?? '';
  assert.match(row('Press, drag, let go'), /^build the run from the press to the pointer; Esc or a right click while you drag cancels it/);
  assert.match(row('Q'), /^bends of 45° \(every game starts with them\) or 90°/);
  assert.match(s.rows[0]!.keys, /^1 – \d+$/, 'the class keys stay the first row');
});
