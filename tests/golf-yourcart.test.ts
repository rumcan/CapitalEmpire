// T326 (#926; the owner, 2026-11-04: "why dont i have a golf cart?"): your cart easy to call and to find (golf/play/yourcart.ts): a call brings the
// cart within reach (driving the route at the cart's pace, golf/you.ts), a far call appears nearer first, the edge marker shows only off screen and
// points at the cart, and the cart parks off a tee and clear of a green on rough.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APPEAR_TILES, BRING_TILES, CALL_DRIVE, GREEN_CLEAR, appearSpot, callMode, callSpot, distText, edgeMarker, parkSpot, shouldPark, type ParkSurf } from '../src/game/golf/play/yourcart';
import { CART_REACH, CART_TILES } from '../src/game/golf/play/yours';
import { makeYou, routeOf, startWalk, stepYou } from '../src/game/golf/you';

const open = () => true;

test('a call: near it waits, within CALL_DRIVE it drives, farther it appears nearer first', () => {
  assert.equal(callMode(1, CART_REACH), 'here');
  assert.equal(callMode(CART_REACH + 0.1, CART_REACH), 'drive');
  assert.equal(callMode(CALL_DRIVE, CART_REACH), 'drive');
  assert.equal(callMode(59, CART_REACH), 'appear', 'the owner\'s cart, 59 tiles off at the car park');
  assert.ok(BRING_TILES > CART_REACH);
});

test('a call brings the cart within reach of you (it drives the route at its own pace)', () => {
  const you = { x: 100, y: 100 }, cart = makeYou(130, 100); cart.speed = CART_TILES;
  const spot = callSpot(you, cart, open)!;
  assert.ok(Math.hypot(spot.x - you.x, spot.y - you.y) <= CART_REACH, 'the spot is within reach');
  assert.ok(spot.x > you.x, 'on the side the cart comes from');
  startWalk(cart, routeOf(cart, spot, () => 1), true);
  let t = 0; while (cart.moving && t < 60) { stepYou(cart, 1 / 30); t += 1 / 30; }
  assert.ok(!cart.moving, 'it arrives');
  assert.ok(Math.hypot(cart.x - you.x, cart.y - you.y) <= CART_REACH, 'beside you: E gets you in');
  assert.ok(t < 30 / CART_TILES, `driven at the cart's run (${t.toFixed(1)} s)`);
});

test('a far call appears APPEAR_TILES off, on the way the cart comes, and on ground it may stand on', () => {
  const you = { x: 0, y: 0 }, from = { x: 0, y: 120 };
  const a = appearSpot(you, from, open)!;
  assert.ok(Math.abs(a.x) < 1e-9 && Math.abs(a.y - APPEAR_TILES) < 1e-9);
  // a pond across the line from APPEAR_TILES to APPEAR_TILES + 3: it appears just past it
  const pond = (_x: number, y: number) => !(y >= APPEAR_TILES && y < APPEAR_TILES + 3);
  const b = appearSpot(you, from, pond)!;
  assert.ok(pond(b.x, b.y) && b.y >= APPEAR_TILES + 3 && b.y <= APPEAR_TILES * 2);
  // shut in: none
  assert.equal(appearSpot(you, from, () => false), null);
  assert.equal(callSpot(you, from, () => false), null);
});

test('the call spot skips ground the cart may not stand on (a green beside you)', () => {
  const you = { x: 10, y: 10 }, from = { x: 30, y: 10 };
  const ok = (x: number) => x < 10; // (everything east of you is the green)
  const s = callSpot(you, from, ok)!;
  assert.ok(ok(s.x) && Math.hypot(s.x - you.x, s.y - you.y) <= CART_REACH);
});

test('the edge marker shows only off screen, on the edge, pointing at the cart', () => {
  assert.equal(edgeMarker(500, 300, 1000, 600), null, 'on screen: none');
  const r = edgeMarker(2000, 300, 1000, 600, 20)!;
  assert.ok(Math.abs(r.x - 980) < 1e-9 && Math.abs(r.y - 300) < 1e-9 && Math.abs(r.a) < 1e-9, 'right of the screen: on the right edge, pointing right');
  const l = edgeMarker(-500, -900, 1000, 600, 20)!;
  assert.ok(l.x >= 20 && l.x <= 980 && Math.abs(l.y - 20) < 1e-9, 'far up: on the top edge');
  assert.ok(l.a < 0, 'pointing up');
  assert.equal(distText(118), '120 m'); assert.equal(distText(1260), '1.3 km');
});

test('the cart parks off a tee and clear of a green, on rough', () => {
  // a green of radius 6 round (50, 50), a tee box 4 x 4 at (20..24, 48..52), fairway on the row y 46..54, rough elsewhere
  const surf = (x: number, y: number): ParkSurf => Math.hypot(x - 50, y - 50) <= 6 ? 'green' : x >= 20 && x <= 24 && y >= 48 && y <= 52 ? 'tee' : y >= 46 && y <= 54 ? 'other' : 'good';
  const greenNear = (x: number, y: number) => Math.max(0, Math.hypot(x - 50, y - 50) - 6);
  const onTee = { x: 22, y: 50 }, byGreen = { x: 50, y: 57.5 }, fairway = { x: 35, y: 50 };
  assert.ok(shouldPark(onTee, surf, greenNear)); assert.ok(shouldPark(byGreen, surf, greenNear)); assert.ok(!shouldPark(fairway, surf, greenNear), 'by your ball on the fairway it stays');
  for (const at of [onTee, byGreen]) {
    const p = parkSpot(at, open, surf, greenNear)!;
    assert.equal(surf(p.x, p.y), 'good', 'on the rough');
    assert.ok(greenNear(p.x, p.y) > GREEN_CLEAR, 'clear of the green');
    assert.ok(Math.hypot(p.x - at.x, p.y - at.y) <= 10, 'beside it');
  }
  assert.equal(parkSpot(onTee, () => false, surf, greenNear), null, 'nowhere to stand: it stays');
});
