// #1276 (the owner, 2026-11-14: "make 45 degree bends the default ... always"), then #1317 (the same day: "remove the 45 degree angle for now"): the road tool's routing
// between two route points. route-legs.ts is what the engine asks (Game.legsTo: the preview, a click and a drag's release all use it). The 45 degree bend (a diagonal run and
// a straight one, one bend between) is OFF behind one constant, BEND_45: the default is the right angle in every build and after every load, Q does nothing, no chip, hint,
// Help line or Keys sheet row speaks of 45 degrees; Shift draws one straight run either way. The 45 routing itself stays tested here (explicitly, with the bend given), so
// it comes back when the constant does. The default is a constant the game starts with: it is not in the save. Headless: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BEND_45, DEFAULT_BEND, bendInUse, legsLength, routeLegs } from '../src/game/route-legs';
import type { Leg, Pt } from '../src/game/network';

const P = (x: number, y: number): Pt => ({ x, y });
/** a leg's direction on the lattice: 0 along x, 45 and 135 diagonals, 90 along y (-1: off the lattice, within eps) */
const heading = (l: Leg, eps = 1e-9): number => {
  const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax < eps && ay < eps) return -2; // a leg of no length
  if (ay < eps) return 0; if (ax < eps) return 90; if (Math.abs(ax - ay) < eps) return dx * dy > 0 ? 45 : 135; return -1;
};
/** the turn (degrees) from leg a to leg b where they meet */
const turn = (a: Leg, b: Leg): number => {
  const u = Math.atan2(a.b.y - a.a.y, a.b.x - a.a.x), v = Math.atan2(b.b.y - b.a.y, b.b.x - b.a.x);
  let d = Math.abs(v - u) * 180 / Math.PI; if (d > 180) d = 360 - d; return Math.round(d * 1e6) / 1e6;
};
const chain = (legs: Leg[], from: Pt, to: Pt, eps = 1e-9) => {
  assert.ok(Math.hypot(legs[0]!.a.x - from.x, legs[0]!.a.y - from.y) < eps, 'the first leg starts at the press');
  for (let i = 1; i < legs.length; i++) assert.ok(Math.hypot(legs[i]!.a.x - legs[i - 1]!.b.x, legs[i]!.a.y - legs[i - 1]!.b.y) < eps, 'each leg starts where the last ends');
  assert.ok(Math.hypot(legs[legs.length - 1]!.b.x - to.x, legs[legs.length - 1]!.b.y - to.y) < eps, 'the last leg ends at the pointer');
};

test('the 45 degree bend is off for now (#1317): the default is the right angle, a constant the engine starts every game with and no save holds; while it is off nothing sets 45', () => {
  assert.equal(BEND_45, false); assert.equal(DEFAULT_BEND, 90);
  // the bend the legs are made with: always the right angle while it is off (a 45 set by a script, the stress test or an old call changes nothing); switched on, the mode in hand
  for (const b of [45, 90] as const) assert.equal(bendInUse(b), 90, `${b} is a right angle while it is off`);
  assert.equal(bendInUse(45, true), 45); assert.equal(bendInUse(90, true), 90);
  const eng = readFileSync('src/game/engine.ts', 'utf8'), app = readFileSync('src/App.tsx', 'utf8');
  // a new game, every build, every load or reload: the Game's field is the constant (a loaded save leaves the page to reload, so a Game is always new)
  assert.match(eng, /bendMode: BendMode = DEFAULT_BEND\b/, 'the field starts at the default');
  assert.match(eng, /import \{[^}]*\bDEFAULT_BEND\b[^}]*\} from '\.\/route-legs'/);
  assert.match(eng, /routeLegs\(from, p, bendInUse\(this\.bendMode\), straight, this\.roadStep\(\)\)/, 'every leg is made with the bend in use');
  // nothing in the engine sets the bend but the Q key, and the Q key is on only while the bend is: no `case 'q'` in keyDown (the Keys sheet would have to list it); the Fine
  // tuning chips are the panel's own and only drawn while it is on; no save or load code knows the word
  const sets = [...eng.matchAll(/\.bendMode\s*=[^=]/g)];
  assert.equal(sets.length, 1, `the engine sets the bend in one place (${sets.length})`);
  assert.match(eng, /if \(BEND_45 && \(e\.key === 'q' \|\| e\.key === 'Q'\)\) \{ this\.bendMode = this\.bendMode === 90 \? 45 : 90;/, 'Q toggles between the two, while the 45 degree bend is on');
  const keyDown = eng.slice(eng.indexOf('  keyDown(e: KeyboardEvent) {'), eng.indexOf('  keyUp(e: KeyboardEvent) {'));
  assert.ok(!/case 'q'/.test(keyDown), 'no case q in keyDown');
  assert.deepEqual([...app.matchAll(/game\.bendMode = (\w+)/g)].map(m => m[1]), ['b'], 'the Fine tuning chips set the bend they show');
  assert.match(app, /\{BEND_45 && <>\s*<span[^>]*>Bends<\/span>\s*\{\(\[45, 90\] as const\)\.map\(b =>/, 'the chips are drawn only while the 45 degree bend is on (the default first)');
  for (const f of ['src/game/save.ts', 'src/game/types.ts', 'src/game/golf/rangesave.ts']) assert.ok(!/bendMode/.test(readFileSync(f, 'utf8')), `${f} does not save the bend`);
});

test('by default a route is a right angle: along the longer side, then the other; never a diagonal leg (Shift draws those)', () => {
  const grids: { step: number; pts: Pt[] }[] = [{ step: 1, pts: [] }, { step: 0.5, pts: [] }];
  for (let x = 4; x <= 44; x += 2) for (let y = 4; y <= 44; y += 2) grids[0]!.pts.push(P(x, y));
  for (let x = 10; x <= 24; x += 0.5) for (let y = 10; y <= 24; y += 0.5) grids[1]!.pts.push(P(x, y));
  let n = 0;
  for (const g of grids) for (const from of [P(24, 24), P(10, 30), P(17.5, 12.5)]) for (const to of g.pts) {
    const legs = routeLegs(from, to, bendInUse(DEFAULT_BEND), false, g.step);
    if (!legs.length) { assert.ok(from.x === to.x && from.y === to.y); continue; }
    n++; chain(legs, from, to, 1e-9); assert.ok(legs.length <= 2, 'at most one bend');
    for (const l of legs) assert.ok(heading(l) === 0 || heading(l) === 90, `an axis leg: ${JSON.stringify(l)}`);
    if (legs.length === 2) { assert.equal(turn(legs[0]!, legs[1]!), 90, 'a right angle'); const a = Math.hypot(legs[0]!.b.x - legs[0]!.a.x, legs[0]!.b.y - legs[0]!.a.y), b = Math.hypot(legs[1]!.b.x - legs[1]!.a.x, legs[1]!.b.y - legs[1]!.a.y); assert.ok(a >= b - 1e-9, 'the longer side first'); }
  }
  assert.ok(n > 500, `${n} routes judged`);
  const l = routeLegs(P(10, 10), P(30, 18), bendInUse(DEFAULT_BEND));
  assert.deepEqual([l[0]!.a, ...l.map(q => q.b)], [P(10, 10), P(30, 10), P(30, 18)], 'along x first, then y: the route of a click is what it was before #1276');
  // Shift's one straight run is the same either way (it is not the bend)
  assert.deepEqual(routeLegs(P(10, 10), P(30, 24), bendInUse(DEFAULT_BEND), true), [{ a: P(10, 10), b: P(27, 27) }]);
});

test('45 degrees (off for now, BEND_45): a diagonal run, one bend, a straight run along the axis: the corner is where the shorter side runs out', () => {
  const cases: [Pt, Pt, Pt[]][] = [
    // from, to, the route's points (start, the corner when there is one, the end)
    [P(10, 10), P(30, 18), [P(10, 10), P(18, 18), P(30, 18)]],      // wider than tall: down-right 8, then along x
    [P(10, 10), P(18, 30), [P(10, 10), P(18, 18), P(18, 30)]],      // taller than wide: then along y
    [P(50, 50), P(30, 44), [P(50, 50), P(44, 44), P(30, 44)]],      // up and to the left
    [P(10, 40), P(25, 35), [P(10, 40), P(15, 35), P(25, 35)]],      // right and up
    [P(40, 10), P(33, 31), [P(40, 10), P(33, 17), P(33, 31)]],      // left and down
    [P(10, 10), P(20, 20), [P(10, 10), P(20, 20)]],                 // exactly on the diagonal: no bend
    [P(10, 10), P(30, 10), [P(10, 10), P(30, 10)]],                 // along x: straight
    [P(10, 10), P(10, -5), [P(10, 10), P(10, -5)]],                 // along y: straight
    [P(10.5, 10.5), P(14, 20), [P(10.5, 10.5), P(14, 14), P(14, 20)]], // on the course's half grid
  ];
  for (const [from, to, pts] of cases) {
    const legs = routeLegs(from, to, 45);
    assert.deepEqual([legs[0]!.a, ...legs.map(l => l.b)], pts, `${from.x},${from.y} -> ${to.x},${to.y}`);
    chain(legs, from, to);
    assert.ok(legs.length <= 2, 'at most one bend');
  }
  assert.deepEqual(routeLegs(P(7, 7), P(7, 7), 45), [], 'a press and release on the same point: no legs');
  // the diagonal comes first and the straight run is along the longer side
  const legs = routeLegs(P(10, 10), P(30, 18), 45);
  assert.equal(heading(legs[0]!), 45); assert.equal(heading(legs[1]!), 0); assert.equal(turn(legs[0]!, legs[1]!), 45, 'the bend is 45 degrees');
  assert.equal(heading(routeLegs(P(10, 10), P(18, 30), 45)[1]!), 90);
  // the corner sits at the shorter side's length from the press, on the pointer's side
  assert.ok(Math.abs(legsLength(legs) - (8 * Math.SQRT2 + 12)) < 1e-9, 'legs 8 diagonal tiles and 12 straight');
});

test('no leg is ever off the 0 / 45 / 90 lattice, from any press to any pointer, on the town grid, the half grid and off it', () => {
  const grids: { step: number; pts: Pt[] }[] = [
    { step: 1, pts: [] }, { step: 0.5, pts: [] }, { step: 1, pts: [] },
  ];
  for (let x = 4; x <= 44; x++) for (let y = 4; y <= 44; y++) grids[0]!.pts.push(P(x, y));
  for (let x = 10; x <= 24; x += 0.5) for (let y = 10; y <= 24; y += 0.5) grids[1]!.pts.push(P(x, y));
  // off the grid (a node or a point on a road that a press snapped to): a pointer at any offset; the lattice holds to the float's last digits
  for (let k = 0; k < 400; k++) grids[2]!.pts.push(P(+(4 + ((k * 7919) % 4000) / 100).toFixed(3), +(4 + ((k * 104729) % 4000) / 100).toFixed(3)));
  const froms = [P(24, 24), P(10, 30), P(17.5, 12.5), P(12.345, 31.789)];
  let n = 0;
  for (const g of grids) for (const from of froms) for (const to of g.pts) {
    for (const bend of [45, 90] as const) for (const straight of [false, true]) {
      const legs = routeLegs(from, to, bend, straight, g.step);
      if (!legs.length) { assert.ok((from.x === to.x && from.y === to.y) || straight, "no legs only for the same point (or a Shift run too short to be one)"); continue; }
      n++;
      assert.ok(legs.length <= 2, `${legs.length} legs`);
      // each leg on the lattice (a straight run's end is the pointer projected on a direction: the pointer need not be its end)
      for (const l of legs) { const h = heading(l, 1e-6); assert.ok(h >= 0, `off the lattice: ${JSON.stringify(l)} (${bend}${straight ? ' straight' : ''})`); }
      if (!straight) chain(legs, from, to, 1e-6);
      if (!straight && bend === 45 && legs.length === 2) assert.equal(turn(legs[0]!, legs[1]!), 45, 'one bend, of 45 degrees');
      if (!straight && bend === 90 && legs.length === 2) assert.equal(turn(legs[0]!, legs[1]!), 90, 'a right angle');
      if (!straight && bend === 45) assert.ok(legs.length === 1 || heading(legs[0]!) % 90 !== 0, 'the first leg is the diagonal, the second along the axis');
    }
  }
  assert.ok(n > 20000, `${n} routes judged`);
});

test('the other modes stay: 90 degrees is a right angle along the longer side first; Shift is one straight run in the eight directions', () => {
  const l90 = routeLegs(P(10, 10), P(30, 18), 90);
  assert.deepEqual([l90[0]!.a, ...l90.map(l => l.b)], [P(10, 10), P(30, 10), P(30, 18)], 'along x first, then y');
  const t90 = routeLegs(P(10, 10), P(18, 30), 90);
  assert.deepEqual([t90[0]!.a, ...t90.map(l => l.b)], [P(10, 10), P(10, 30), P(18, 30)], 'along y first, then x');
  // Shift: near an axis (2.4 to 1 or more) along it, else on the diagonal as long as the two sides' mean (to the grid)
  assert.deepEqual(routeLegs(P(10, 10), P(30, 18), 45, true), [{ a: P(10, 10), b: P(30, 10) }], 'wide: along x');
  assert.deepEqual(routeLegs(P(10, 10), P(18, 30), 90, true), [{ a: P(10, 10), b: P(10, 30) }], 'tall: along y');
  assert.deepEqual(routeLegs(P(10, 10), P(30, 24), 45, true), [{ a: P(10, 10), b: P(27, 27) }], 'about 45: the diagonal, 17 each way');
  assert.deepEqual(routeLegs(P(10, 10), P(15.5, 14.5), 45, true, 0.5), [{ a: P(10, 10), b: P(15, 15) }], 'on the half grid the diagonal keeps to it');
  // a bend mode does not change a Shift run
  assert.deepEqual(routeLegs(P(10, 10), P(30, 24), 90, true), routeLegs(P(10, 10), P(30, 24), 45, true));
});

test('the bend mode is the only difference between the 45 and 90 routes: same end, one more bend at 45 than the straight runs', () => {
  for (const to of [P(30, 18), P(18, 30), P(5, 3), P(40, 40)]) {
    const a = routeLegs(P(20, 20), to, 45), b = routeLegs(P(20, 20), to, 90);
    assert.deepEqual(a[a.length - 1]!.b, b[b.length - 1]!.b, 'both end on the pointer');
    // the 45 route is the shorter way (a diagonal cuts the corner)
    assert.ok(legsLength(a) <= legsLength(b) + 1e-9, `${legsLength(a)} <= ${legsLength(b)}`);
  }
});
