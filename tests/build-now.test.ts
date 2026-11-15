// The map's BUILD NOW button's placement (#1325, src/ui/build-now.ts): beside the planned outline at the side away from the panels, clear of the tee, the green, the route and the
// panels, kept in the free map, and held there (off the tee and the green) when the outline fills the map.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GAP, KEEP_R, newPlace, panelsLeft, placeBuildNow, type Rect } from '../src/ui/build-now';

const FREE: Rect = { l: 8, t: 90, r: 1432, b: 840 };
const BW = 260, BH = 54;
const box = (x: number, y: number, w: number, h: number, pts: number[] = []) => { const p = newPlace(); p.x = x; p.y = y; p.w = w; p.h = h; p.pts.set(pts); p.n = pts.length; return p; };
const at = (o: ReturnType<typeof box>, avoid: Rect[] = [], preferLeft = false, free = FREE) => { const out = { x: 0, y: 0 }; placeBuildNow(o, BW, BH, free, avoid, preferLeft, out); return out; };

test('the button stands at the outline\'s right, a gap off it, level with its middle (panels on the left)', () => {
  const o = box(300, 300, 400, 200), p = at(o);
  assert.equal(p.x, 700 + GAP);
  assert.equal(p.y, 400 - BH / 2);
});

test('panels on the right: the left side first', () => {
  const o = box(600, 300, 300, 200), p = at(o, [], true);
  assert.equal(p.x, 600 - GAP - BW);
});

test('no room on the preferred side: the other side, then below, then above', () => {
  assert.equal(at(box(1100, 300, 300, 200)).x, 1100 - GAP - BW, 'no room at the right: the left');
  const o = box(20, 300, 1400, 200);
  const p = at(o);
  assert.equal(p.y, 500 + GAP, 'a wide outline: below it');
  const q = at(box(20, 300, 1400, 500));
  assert.equal(q.y, 300 - GAP - BH, 'no room below either: above it');
});

test('a panel in the way pushes it to another side', () => {
  const o = box(300, 300, 400, 200), panel: Rect = { l: 690, t: 250, r: 1000, b: 600 };
  const p = at(o, [panel]);
  assert.ok(!(p.x < panel.r && p.x + BW > panel.l && p.y < panel.b && p.y + BH > panel.t), 'clear of the panel');
});

test('it is always whole inside the free map', () => {
  for (const o of [box(-300, -300, 500, 500), box(1300, 700, 400, 400), box(0, 0, 1440, 900), box(700, 400, 1, 1)]) {
    const p = at(o);
    assert.ok(p.x >= FREE.l && p.y >= FREE.t && p.x + BW <= FREE.r && p.y + BH <= FREE.b, `inside for ${JSON.stringify([o.x, o.y, o.w, o.h])}: ${p.x},${p.y}`);
  }
});

test('the outline fills the map: the button is held inside it and still keeps off the tee and the green', () => {
  const tee = [60, 140], green = [1380, 800], o = box(0, 0, 1440, 900, [...tee, ...green]);
  const p = at(o);
  for (let i = 0; i < o.n; i += 2) {
    const dx = Math.max(p.x - o.pts[i]!, 0, o.pts[i]! - (p.x + BW)), dy = Math.max(p.y - o.pts[i + 1]!, 0, o.pts[i + 1]! - (p.y + BH));
    assert.ok(Math.hypot(dx, dy) >= KEEP_R, `clear of the point ${o.pts[i]},${o.pts[i + 1]}`);
  }
});

test('a road\'s end: beside the end, off the route that comes into it', () => {
  // the route runs in from the left along y = 400 to its end at (700, 400): the button cannot stand on the left side
  const pts: number[] = []; for (let x = 100; x <= 700; x += 24) pts.push(x, 400);
  const o = box(694, 394, 12, 12, pts), p = at(o, [], true); // (the panels on the right: the left side first, which the route spoils)
  for (let i = 0; i < o.n; i += 2) {
    const dx = Math.max(p.x - o.pts[i]!, 0, o.pts[i]! - (p.x + BW)), dy = Math.max(p.y - o.pts[i + 1]!, 0, o.pts[i + 1]! - (p.y + BH));
    assert.ok(Math.hypot(dx, dy) >= KEEP_R, `clear of the route point ${o.pts[i]},${o.pts[i + 1]}`);
  }
});

test('panelsLeft: the side where the panels\' area is', () => {
  assert.equal(panelsLeft([{ l: 0, t: 0, r: 400, b: 800 }], 1440), true);
  assert.equal(panelsLeft([{ l: 1000, t: 0, r: 1440, b: 800 }, { l: 0, t: 0, r: 100, b: 100 }], 1440), false);
  assert.equal(panelsLeft([], 1440), false);
});
