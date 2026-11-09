// T377 (#1033, the owner: "they should not be driving on tee boxes or greens and follow the cart paths", of the crew's carts as the field's and yours): the grounds
// crew's drives (the greenkeeper's cart, a mower between its jobs: src/game/golf/crew.ts) with the course's cart routes (golf/walkfield.ts) go round the tees,
// the greens, the bunkers and the water, and are the same day in all else; drawn straight, they cross them (the check below fails with no routes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELL_T, SURF, makeGrid, type Grid } from '../src/game/ext/course-grid';
import { fairwayStripeLook } from '../src/game/course-stripes';
import { finishStripeLook, DEFAULT_COURSE_FINISH } from '../src/game/course-finish';
import { crewCells, crewGround } from '../src/game/golf/crewground';
import { crewDay, holeWindows, type CrewDay, type CrewHole, type CrewInputs } from '../src/game/golf/crew';
import { greenAt } from '../src/game/golf/daypins';
import { CART, G, RouteCache, groundAt, type WalkField } from '../src/game/golf/walkfield';
import { buildWalkField } from '../src/game/golf/walkground';

const ALONG = finishStripeLook(DEFAULT_COURSE_FINISH, fairwayStripeLook())!;
const N = 9, YARD = { x: 2, y: 130 }, W = 400, H = 220;
/** the pond between the yard and the holes: tiles x 8..16, y 50..205 (the ways round it are its ends) */
const POND = { x0: 8, x1: 16, y0: 50, y1: 205 };
/** nine holes side by side, each in its own column x = 40 h (a green round (x, 60), a fairway from y 80 to 180, a bunker, a tee box at (x, 200)), and the pond */
function course(): { grid: Grid; holes: CrewHole[]; tees: { x: number; y: number }[] } {
  const g = makeGrid(0, 0, 2 * W, 2 * H), tees: { x: number; y: number }[] = [];
  for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
    const px = (i + 0.5) * CELL_T, py = (j + 0.5) * CELL_T;
    if (px >= POND.x0 && px <= POND.x1 && py >= POND.y0 && py <= POND.y1) g.surf[j * g.w + i] = SURF.water;
  }
  for (let h = 1; h <= N; h++) {
    const x = 40 * h; tees.push({ x, y: 200 });
    for (let j = 0; j < g.h; j++) for (let i = Math.floor((x - 20) / CELL_T); i < Math.floor((x + 20) / CELL_T); i++) {
      const px = (i + 0.5) * CELL_T, py = (j + 0.5) * CELL_T, k = j * g.w + i;
      let s: number = SURF.rough;
      if (((px - x) / 10) ** 2 + ((py - 60) / 8) ** 2 <= 1) s = SURF.green;
      else if (Math.abs(px - x) <= 8 && py >= 80 && py <= 180) s = SURF.fairway;
      else if (((px - x - 13) / 3) ** 2 + ((py - 62) / 2) ** 2 <= 1) s = SURF.bunker;
      else if (Math.abs(px - x) <= 3 && Math.abs(py - 200) <= 3) s = SURF.tee;
      g.surf[k] = s; g.hole[k] = h;
    }
  }
  const cells = crewCells(g), holes: CrewHole[] = [];
  for (let h = 1; h <= N; h++) {
    const x = 40 * h, gr = greenAt(g, h, x, 60, { x, y: 200 }), ground = crewGround(g, h, cells.get(h), [x, 200, x, 60], ALONG, gr, { x: x + 40, y: 200 });
    holes.push({ ground, oldCup: { x: x - 3, y: 57 }, newCup: { x: x + 3, y: 64 }, moved: true });
  }
  return { grid: g, holes, tees };
}
/** groups teeing off every 12 minutes from 07:00, 14 minutes a hole */
function playWindows() {
  const arrive = Array.from({ length: 20 }, (_, g) => Array.from({ length: N }, (_, h) => 420 + g * 12 + h * 14)), done = arrive.map(a => a[N - 1]! + 14);
  return holeWindows(arrive, done, N);
}
const pace = { walk: 1.4 / 1.5, cart: 2.8 / 1.5 };
/** the walk field of the course (the surfaces, the tee boxes) */
function fieldOf(c: ReturnType<typeof course>): WalkField {
  const g = c.grid;
  return buildWalkField(0, 0, W, H, {
    surf: (x, y) => { const i = Math.floor(x / CELL_T), j = Math.floor(y / CELL_T); return i < 0 || j < 0 || i >= g.w || j >= g.h ? -1 : g.surf[j * g.w + i]!; },
    wet: () => false, ways: [], teeBoxes: c.tees.map(t => ({ x: t.x, y: t.y, r: 3 })), holes: [],
  });
}
function inputs(c: ReturnType<typeof course>, route?: CrewInputs['route']): CrewInputs {
  const ns = c.holes.map(h => h.ground.n), w = playWindows();
  return { holes: c.holes, yard: YARD, gk: 2, mo: 2, greens: new Set(ns), sands: new Set(ns), fairways: new Set([ns[2]!, ns[6]!]), rough: new Set([ns[4]!]), ...w, pace, ...(route ? { route } : {}) };
}
/** the samples (every half tile along each drive leg) on a ground a cart never enters: [worker role, ground] */
function onBlocked(day: CrewDay, f: WalkField): { drives: number; samples: number; blocked: number; tiles: number } {
  let drives = 0, samples = 0, blocked = 0, tiles = 0;
  for (const w of day.workers) for (const l of w.legs) {
    if (l.act !== 'drive') continue;
    drives++;
    const L = Math.hypot(l.bx - l.ax, l.by - l.ay), n = Math.max(1, Math.ceil(L / 0.5)); tiles += L;
    for (let k = 0; k <= n; k++) {
      const t = k / n, g = groundAt(f, l.ax + (l.bx - l.ax) * t, l.ay + (l.by - l.ay) * t); samples++;
      if (g === G.tee || g === G.green || g === G.bunker || g === G.water) blocked++;
    }
  }
  return { drives, samples, blocked, tiles };
}

test('T377: the crew\'s drives, laid with the course\'s cart routes, never cross a tee, a green, a bunker or the pond; drawn straight they do', () => {
  const c = course(), f = fieldOf(c), rc = new RouteCache(f, CART, { pad: 12 });
  const route: CrewInputs['route'] = (ax, ay, bx, by) => rc.route({ x: ax, y: ay }, { x: bx, y: by }) ?? null;
  const straight = crewDay(inputs(c)), routed = crewDay(inputs(c, route));
  const a = onBlocked(straight, f), b = onBlocked(routed, f);
  console.log(`# crew drives straight: ${a.drives} legs, ${a.blocked} of ${a.samples} samples on a tee, green, bunker or water; routed: ${b.drives} legs, ${b.blocked} of ${b.samples} (${b.tiles.toFixed(0)} tiles driven, straight ${a.tiles.toFixed(0)}); ${rc.size} routes worked out`);
  assert.ok(a.blocked > 0, `the straight drives cross something (${a.blocked} samples): the check has teeth`);
  assert.equal(b.blocked, 0, `no routed drive sample on a tee, a green, a bunker or water (${b.blocked} of ${b.samples})`);
  assert.ok(b.drives > a.drives, 'a drive is laid as a leg to each point of its way');
  assert.ok(b.tiles < a.tiles * 2.2, `and the ways are not wild: ${b.tiles.toFixed(0)} tiles against ${a.tiles.toFixed(0)} straight`);
});

test('T377: a drive with no way (the water cuts the course in two, no bridge) is an away leg: the worker is carried across, never drawn on the water', () => {
  const c = course();
  // a cut-off piece: the hole 9 end of the course, no way to it from the yard
  const route: CrewInputs['route'] = (ax, _ay, bx, by) => (bx > 330 || ax > 330 ? [] : [{ x: bx, y: by }]);
  const day = crewDay(inputs(c, route)), legs = day.workers.flatMap(w => w.legs);
  assert.ok(legs.some(l => l.act === 'away' && (l.bx > 330 || l.ax > 330)), 'a drive to the cut-off end is an away leg');
  assert.ok(!legs.some(l => l.act === 'drive' && (l.bx > 330 || l.ax > 330) && Math.hypot(l.bx - l.ax, l.by - l.ay) > 30), 'and not a drive across');
  for (const w of day.workers) for (let i = 1; i < w.legs.length; i++) { assert.ok(Math.abs(w.legs[i]!.t0 - w.legs[i - 1]!.t1) < 1e-6, 'legs run end to end in time'); assert.ok(Math.hypot(w.legs[i]!.ax - w.legs[i - 1]!.bx, w.legs[i]!.ay - w.legs[i - 1]!.by) < 1e-6, 'and in place'); }
});

test('T377: the routes change the crew\'s drives and nothing else: the same cups, the same cut, the same jobs, legs end to end in time and in place', () => {
  const c = course(), f = fieldOf(c), rc = new RouteCache(f, CART, { pad: 12 });
  const route: CrewInputs['route'] = (ax, ay, bx, by) => rc.route({ x: ax, y: ay }, { x: bx, y: by }) ?? null;
  const straight = crewDay(inputs(c)), routed = crewDay(inputs(c, route));
  // (the minutes of a drive are shared among its legs by their lengths: the sums agree to the last digits of a float)
  const near = <T extends { t: number }>(a: T[], b: T[], what: string) => { assert.equal(a.length, b.length, what); a.forEach((x, i) => { assert.deepEqual({ ...x, t: 0 }, { ...b[i]!, t: 0 }, `${what} ${i}`); assert.ok(Math.abs(x.t - b[i]!.t) < 1e-6, `${what} ${i} at ${x.t} and ${b[i]!.t}`); }); };
  near(routed.cups, straight.cups, 'every cup at the same minute');
  near(routed.mown, straight.mown, 'the same bands cut at the same minutes');
  assert.equal(routed.workers.length, straight.workers.length);
  for (let k = 0; k < straight.workers.length; k++) {
    const s = straight.workers[k]!, r = routed.workers[k]!;
    assert.equal(r.role, s.role);
    // the legs that are not drives are the same legs (same minutes, same places, same acts)
    const key = (l: { act: string; t0: number; t1: number; ax: number; ay: number; bx: number; by: number }) => `${l.act} ${l.t0.toFixed(4)} ${l.t1.toFixed(4)} ${l.ax.toFixed(3)} ${l.ay.toFixed(3)} ${l.bx.toFixed(3)} ${l.by.toFixed(3)}`;
    assert.deepEqual(r.legs.filter(l => l.act !== 'drive').map(key), s.legs.filter(l => l.act !== 'drive').map(key), `${r.role} ${k}: the work is the same`);
    for (let i = 1; i < r.legs.length; i++) {
      const p = r.legs[i - 1]!, q = r.legs[i]!;
      assert.ok(Math.abs(q.t0 - p.t1) < 1e-6, 'legs run end to end in time');
      assert.ok(Math.hypot(q.ax - p.bx, q.ay - p.by) < 1e-6, 'and in place: no jumps');
    }
    assert.ok(Math.abs(r.legs[r.legs.length - 1]!.t1 - s.legs[s.legs.length - 1]!.t1) < 1e-6, 'the shift ends when it did');
  }
});
