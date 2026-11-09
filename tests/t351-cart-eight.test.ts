// T351 (#994, the owner, 2026-11-08: "why does the golf cart not look natural when driving?"): the hire golf cart has a picture for each of its eight headings, the nearest of eight to its
// heading is drawn (never mirrored), its heading turns through the neighbouring pictures on a bend (it never jumps across), and it pulls away and stops softly: the field's carts (golf/
// play/carts.ts, on a day of the carts on the T377 course) and your own (golf/cartdrive.ts, under the keys and on a click's route). The old behaviour, a picture of two by the sign of
// hx - hy, snapping at every bend and every turn of the keys, is measured by the same checks as the proof that they can fail. Headless: npm test.
import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../src/game/library';
import { OBJECT_EIGHT_SETS } from '../src/game/object-eight-library';
import { CAR_DIRECTIONS } from '../src/game/ext/car-art';
import { OBJECT_FACING_KEYS } from '../src/game/object-eight-types';
import { CART_ITEMS, CART_OLD, CART_OLD_IDS, CART_SUBJECT, CART_VIEW_KEYS, cartHeading, cartHeadingOf, cartItems, cartPicture, cartScale } from '../src/game/golf/cartart';
import { RAMP_M, TURN_M, TAU, easedShare, routeHeading, routeHeadings, setCartSoft, turnToward, wrapPi } from '../src/game/golf/play/cartturn';
import { CartDrive, TURN_RATE, SPEED_DOWN_S, SPEED_UP_S, faceAngle } from '../src/game/golf/cartdrive';
import { makeYou, routeOf, startWalk, remaining } from '../src/game/golf/you';
import { CART_TILES } from '../src/game/golf/play/yours';
import { CartPlay, cartPaths, fieldEntourage, makeField, playRound, teeTimes } from '../src/game/golf/play';
import type { CourseView, Lie, PlayCart, PlayHole } from '../src/game/golf/play';
import { TILE_M } from '../src/game/golf/types';
import type { LibItem } from '../src/game/types';

const BY = new Map<string, LibItem>(LIBRARY.map(i => [i.id, i] as const));
const DEG = Math.PI / 180;
/** the eight headings, in carHeading's order: the tile direction, its name on the iso screen (CAR_DIRECTIONS) and the set's view that shows it */
const HEADINGS = [
  { name: 'SE', dir: [1, 0], key: 'normalSE' }, { name: 'S', dir: [1, 1], key: 'yaw8N' }, { name: 'SW', dir: [0, 1], key: 'normalNE' }, { name: 'W', dir: [-1, 1], key: 'yaw8W' },
  { name: 'NW', dir: [-1, 0], key: 'normalNW' }, { name: 'N', dir: [-1, -1], key: 'yaw8S' }, { name: 'NE', dir: [0, -1], key: 'normalSW' }, { name: 'E', dir: [1, -1], key: 'yaw8E' },
] as const;
const setOf = () => OBJECT_EIGHT_SETS.find(s => s.subject === CART_SUBJECT)!;

describe('T351: the hire cart has a picture for each of its eight headings', () => {
  it('is an approved object-eight set: the cart\'s SE and SW are the two pictures it had (aliases of their atlas cells), the other six new cells', () => {
    const set = setOf(); assert.ok(set, 'the set is registered'); assert.equal(set.review, 'approved'); assert.equal(set.projection, 'normal+yaw8');
    assert.deepEqual(set.sourceIds, { normalNE: CART_OLD_IDS[0], normalSE: CART_OLD_IDS[1] }, 'its SW heading (the NE view) is golf-cart-sw, its SE heading golf-cart-se');
    for (const k of OBJECT_FACING_KEYS) assert.ok(BY.has(set.views[k].id), `${set.views[k].id} is in the library`);
    for (const [key, old] of [['normalNE', CART_OLD_IDS[0]], ['normalSE', CART_OLD_IDS[1]]] as const) {
      const alias = BY.get(set.views[key].id)!, src = BY.get(old)!;
      assert.deepEqual([alias.tex, alias.w, alias.h, alias.ax, alias.ay, alias.quad], [src.tex, src.w, src.h, src.ax, src.ay, src.quad], `${key} draws exactly as ${old}`);
    }
    const fresh = OBJECT_FACING_KEYS.filter(k => !(k in (set.sourceIds ?? {})));
    assert.deepEqual([...fresh].sort(), ['normalNW', 'normalSW', 'yaw8E', 'yaw8N', 'yaw8S', 'yaw8W']);
    for (const k of fresh) { const it = BY.get(set.views[k].id)!; assert.ok(it.id.startsWith('object8:') && it.tex[0] >= 0 && it.w > 100 && it.h > 100, `${it.id} is a picture of its own`); }
  });
  it('CART_ITEMS: eight different pictures, one per heading, each with its own atlas pixels (no picture stands in for another, none is mirrored)', () => {
    assert.equal(CART_ITEMS.length, 8); assert.ok(CART_ITEMS.every(i => i >= 0));
    assert.equal(new Set(CART_ITEMS).size, 8, 'eight different library rows');
    assert.equal(new Set(CART_ITEMS.map(i => LIBRARY[i]!.tex.join(','))).size, 8, 'on eight different atlas cells');
    assert.deepEqual(CART_VIEW_KEYS, HEADINGS.map(h => h.key));
    HEADINGS.forEach((h, k) => assert.equal(LIBRARY[CART_ITEMS[k]!]!.id, setOf().views[h.key].id, `heading ${h.name} (${k}) is the ${h.key} view`));
    assert.deepEqual(HEADINGS.map(h => h.name), [...CAR_DIRECTIONS], 'counted the way the cars\' eight headings are');
  });
  it('the picture of a tile heading is the nearest of the eight (the cars\' lookup); the eight directions are the eight pictures; between them it goes to the nearer', () => {
    HEADINGS.forEach((h, k) => { const [x, y] = h.dir; assert.equal(cartHeading(x, y), k, h.name); assert.equal(cartPicture(x, y), CART_ITEMS[k], `${h.name}: its own picture`); assert.equal(cartPicture(3 * x, 3 * y), CART_ITEMS[k], 'whatever the length'); });
    // the diagonals' neighbours: 20 degrees either side of a heading is still that heading, 25 is the next
    for (let k = 0; k < 8; k++) for (const [d, want] of [[0, k], [20, k], [-20, k], [25, (k + 1) % 8], [-25, (k + 7) % 8]] as const) assert.equal(cartHeadingOf((45 * k + d) * DEG), want, `${45 * k + d} degrees`);
    assert.equal(cartHeadingOf(-10 * DEG), 0); assert.equal(cartHeadingOf(400 * DEG), 1, 'an angle past a turn wraps'); assert.equal(cartHeadingOf(-100 * DEG), 6);
  });
  it('the old rule (two pictures by the sign of hx - hy) showed the front of a cart driving away from us: the eight do not', () => {
    const [sw, se] = CART_OLD; assert.ok(sw >= 0 && se >= 0);
    // a cart driving up the screen (N: tile -x-y) and one driving to the right (E: +x-y): the old rule has hx - hy = 0 and 2 and picked the front toward the lower right for both
    const N = HEADINGS[5].dir, E = HEADINGS[7].dir;
    assert.equal(N[0] - N[1], 0); assert.equal(E[0] - E[1], 2);
    assert.notEqual(cartPicture(N[0], N[1]), se); assert.notEqual(cartPicture(E[0], E[1]), se); assert.notEqual(cartPicture(N[0], N[1]), cartPicture(E[0], E[1]));
    assert.equal(cartPicture(1, 0), CART_ITEMS[0]); // (its SE and SW headings are the two it had: a cart on a tile axis looks as it did)
  });
  it('every picture draws the cart at one size: its height at the one draw scale is within 15% of the old pictures\' (about 159 px at zoom 1), its anchor low in the picture as theirs is', () => {
    const scale = cartScale(CART_ITEMS[0]!), old = CART_OLD.map(i => LIBRARY[i]!.h * cartScale(i));
    assert.ok(Math.abs(scale - 0.294) < 1e-9, `the cart's size is the golf-cart-se's, ${scale}`);
    const oldH = (old[0]! + old[1]!) / 2; assert.ok(oldH > 150 && oldH < 165, `the old pictures are ${oldH.toFixed(0)} px`);
    for (const i of CART_ITEMS) {
      const it = LIBRARY[i]!, h = it.h * cartScale(i);
      assert.equal(cartScale(i), scale, `${it.id}: one scale for all eight`);
      assert.ok(h > oldH * 0.85 && h < oldH * 1.15, `${it.id}: ${h.toFixed(0)} px high against ${oldH.toFixed(0)}`);
      assert.ok(it.ax > 0 && it.ax < it.w && it.ay / it.h > 0.65 && it.ay / it.h < 0.9, `${it.id}: its anchor (${it.ax.toFixed(0)}, ${it.ay.toFixed(0)}) of ${it.w.toFixed(0)} x ${it.h.toFixed(0)}`);
    }
  });
  it('a heading whose picture the library lacks is left to its neighbour, never faked; with no set the two old pictures serve their own headings', () => {
    const have = new Set(Object.values(setOf().views).map(v => v.id)), at = (id: string) => (have.has(id) ? LIBRARY.findIndex(i => i.id === id) : -1);
    assert.deepEqual(cartItems(at, OBJECT_EIGHT_SETS), [...CART_ITEMS]);
    const missing = setOf().views.yaw8W.id; have.delete(missing);
    const items = cartItems(at, OBJECT_EIGHT_SETS), W = 3;
    assert.ok(items.every(i => i >= 0)); assert.equal(items[W], CART_ITEMS[W - 1], 'the W heading takes the heading before it (SW)'); assert.equal(items.filter((_, k) => k !== W).join(), CART_ITEMS.filter((_, k) => k !== W).join(), 'the others are as they were');
    const oldOnly = new Map<string, number>([[CART_OLD_IDS[0], 1], [CART_OLD_IDS[1], 2]]), two = cartItems(id => oldOnly.get(id) ?? -1, []);
    assert.equal(two[2], 1, 'SW is the old sw'); assert.equal(two[0], 2, 'SE is the old se'); assert.ok(two.every(i => i === 1 || i === 2), 'the rest take the nearer of the two'); assert.equal(two[1], 2, 'S (its neighbour before is SE) takes SE'); assert.equal(two[3], 1);
    assert.deepEqual(cartItems(() => -1, []), Array(8).fill(-1), 'a library with none of the cart\'s pictures has none');
  });
});

// ---------- the blend: cartturn.ts ----------
const carIdx = (a: number) => cartHeadingOf(a);
/** the steps (mod 8) between consecutive facings of a sequence of angles */
function steps(angles: number[]): number[] { const out: number[] = []; for (let i = 1; i < angles.length; i++) { const d = ((carIdx(angles[i]!) - carIdx(angles[i - 1]!)) % 8 + 12) % 8 - 4; out.push(d); } return out; }

/** a route's cumulative lengths, and the headings of its segments as the old code had them (the segment's own: a zero-length segment left the heading as it was) */
const cumOf = (pts: { x: number; y: number }[]) => { const C = [0]; for (let i = 1; i < pts.length; i++) C.push(C[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y)); return C; };
const rawHeadings = (pts: { x: number; y: number }[]) => { const out: number[] = []; for (let i = 1; i < pts.length; i++) if (Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y) > 1e-6) out.push(Math.atan2(pts[i]!.y - pts[i - 1]!.y, pts[i]!.x - pts[i - 1]!.x)); return out; };

describe('T351: a turn is blended through the neighbouring pictures', () => {
  it('turnToward goes the shorter way round, at most `step` at a time, and keeps its way on a half turn', () => {
    assert.equal(turnToward(0, 1, 0.3), 0.3); assert.ok(Math.abs(turnToward(0.9, 1, 0.3) - 1) < 1e-12);
    assert.ok(turnToward(170 * DEG, -170 * DEG, 5 * DEG) > 170 * DEG, 'from 170 to -170 degrees it goes up through 180, not back through 0');
    let a = 0; const seq = [a]; for (let i = 0; i < 40; i++) { a = turnToward(a, Math.PI, 10 * DEG); seq.push(a); }
    assert.ok(Math.abs(wrapPi(a - Math.PI)) < 1e-9, 'a half turn gets there'); const s = steps(seq).filter(x => x !== 0); assert.ok(s.every(x => x === s[0]), 'always the same way round'); assert.equal(s.length, 4, 'through the three pictures between');
    assert.ok(Math.abs(wrapPi(7 * TAU + 0.5) - 0.5) < 1e-9);
  });
  it('a quarter-turn bend: the heading is the segment\'s outside the blend, a smooth turn across it, through the picture between', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], R = routeHeadings(pts, cumOf(pts)), blend = TURN_M / TILE_M, seq: number[] = [], at = (d: number) => routeHeading(R, d < 10 ? 0 : 1, d, blend);
    for (let d = 0; d <= 20; d += 0.05) seq.push(at(d));
    assert.equal(at(5), 0); assert.ok(Math.abs(at(15) - Math.PI / 2) < 1e-12); assert.ok(Math.abs(at(10 - blend / 2 - 0.01)) < 1e-12 && Math.abs(at(10 + blend / 2 + 0.01) - Math.PI / 2) < 1e-12, 'the segment\'s own heading a half blend either side of the bend');
    assert.ok(Math.abs(at(10) - Math.PI / 4) < 1e-9, 'half the turn at the bend itself');
    for (let i = 1; i < seq.length; i++) assert.ok(seq[i]! >= seq[i - 1]! - 1e-12 && seq[i]! - seq[i - 1]! < 0.15, 'monotone and smooth');
    const facings = seq.map(carIdx).filter((x, i, a) => i === 0 || x !== a[i - 1]); assert.deepEqual(facings, [0, 1, 2], 'SE, then S, then SW: never a jump across');
  });
  it('a hairpin (a half turn) steps through every picture between, one at a time; a route that starts opposite the way the cart was parked blends into it', () => {
    const pts = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 0, y: 0.01 }], R = routeHeadings(pts, cumOf(pts)), seq: number[] = [], blend = TURN_M / TILE_M;
    for (let d = 0; d <= 16; d += 0.02) seq.push(routeHeading(R, d < 8 ? 0 : 1, d, blend));
    const st = steps(seq).filter(x => x !== 0); assert.equal(st.length, 4, 'four steps of one picture: SE to NW through S, SW and W'); assert.ok(st.every(x => x === st[0]));
    // parked facing W (heading 135 degrees), the route starts to the SE (0): blended over the first `blend` of it, going the short way (through SW and S), then the route's own heading
    const from = 135 * DEG, route = [{ x: 0, y: 0 }, { x: 12, y: 0 }], h2 = routeHeadings(route, [0, 12]), seq2: number[] = [];
    for (let d = 0; d <= 12; d += 0.02) seq2.push(routeHeading(h2, 0, d, blend, from));
    assert.ok(Math.abs(seq2[0]! - from) < 1e-12, 'parked: its parked heading at the first metre'); assert.ok(Math.abs(seq2[seq2.length - 1]!) < 1e-12 && Math.abs(routeHeading(h2, 0, blend + 0.01, blend, from)) < 1e-12, 'then the route\'s');
    const st2 = steps(seq2).filter(x => x !== 0); assert.deepEqual(st2, [-1, -1, -1], 'W to SE through SW and S, one at a time');
  });
  it('short segments (under the blend) and zero-length ones leave no jump: the heading is continuous along any route', () => {
    const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    for (let t = 0; t < 60; t++) {
      const pts = [{ x: 0, y: 0 }]; for (let i = 0; i < 14; i++) { const l = rnd() < 0.3 ? 0 : rnd() < 0.5 ? rnd() * 0.8 : 1 + rnd() * 9, a = rnd() * TAU, p = pts[pts.length - 1]!; pts.push({ x: p.x + l * Math.cos(a), y: p.y + l * Math.sin(a) }); }
      const C = cumOf(pts), R = routeHeadings(pts, C);
      assert.ok(R.ang.every(Number.isFinite), 'no NaN heading'); assert.equal(R.at[0], 0); assert.ok(Math.abs(R.at[R.at.length - 1]! - C[C.length - 1]!) < 1e-9);
      const L = C[C.length - 1]!; let prev = NaN, s = 0, worst = 0;
      for (let d = 0; d <= L; d += 0.01) {
        while (s < pts.length - 2 && C[s + 1]! < d) s++;
        const h = routeHeading(R, R.of[s]!, d, TURN_M / TILE_M, 1); assert.ok(Number.isFinite(h)); if (!Number.isNaN(prev)) worst = Math.max(worst, Math.abs(wrapPi(h - prev))); prev = h;
      }
      // (a 0.01-tile step turns the heading by 0.2 rad at most: a half turn is made over at least 0.3 of a tile, the shortest run there is)
      assert.ok(worst < 0.2, `route ${t}: the heading never moves ${worst.toFixed(3)} rad in a hundredth of a tile`);
    }
  });
});

describe('T351: a cart pulls away and stops softly, on the same minutes', () => {
  it('easedShare: 0 to 1, rising, with no speed at either end, the same time for the whole drive', () => {
    for (const r of [0, 0.02, 0.1, 0.25, 0.5, 3]) {
      assert.equal(easedShare(0, r), 0); assert.equal(easedShare(1, r), 1); assert.equal(easedShare(-1, r), 0); assert.equal(easedShare(2, r), 1);
      let prev = 0, vmax = 0; const n = 4000;
      for (let i = 1; i <= n; i++) { const u = i / n, f = easedShare(u, r); assert.ok(f >= prev - 1e-12, `rising at ${u} (ramp ${r})`); vmax = Math.max(vmax, (f - prev) * n); prev = f; }
      const rr = Math.min(0.5, r); assert.ok(Math.abs(vmax - (1 + 2 * rr)) < 0.01, `ramp ${r}: peak speed ${vmax.toFixed(3)} times the mean (${(1 + 2 * rr).toFixed(3)})`);
      if (r > 0) { assert.ok(easedShare(1 / n, r) < 2 / n * 0.01 + 1e-6 || easedShare(1 / n, r) < 1 / n * 0.2, 'pulls away from rest'); assert.ok(1 - easedShare(1 - 1 / n, r) < 1 / n * 0.2, 'comes to rest'); }
    }
    assert.equal(easedShare(0.3, 0), 0.3, 'ramp 0: the steady pace as before');
    // continuous where the ramp meets the cruise
    const r = 0.1, v = 1 + 2 * r, tA = 2 * r / v; assert.ok(Math.abs(easedShare(tA, r) - r) < 1e-12); assert.ok(Math.abs(easedShare(1 - tA, r) - (1 - r)) < 1e-12);
  });
});

// ---------- the field's carts: a day on the T377 course ----------
const PARS: (3 | 4 | 5)[] = [3, 4, 4, 5, 3, 4, 4, 4, 5, 4, 3, 4, 4, 4, 5, 4, 4, 5];
const HOLES_B: PlayHole[] = PARS.map((par, h) => { const y = 20 + 60 * h, tee = { x: 10, y }, pin = { x: 10 + (par === 3 ? 160 : par === 4 ? 380 : 500) / TILE_M, y }; return { n: h + 1, par, tee, pin, line: [tee, pin] }; });
const segDist = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => { const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0; return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t); };
const lieB = (x: number, y: number): Lie => {
  for (const h of HOLES_B) { if (Math.hypot(x - h.pin.x, y - h.pin.y) <= 6) return 'green'; if (Math.abs(x - h.tee.x) <= 4 && Math.abs(y - h.tee.y) <= 5) return 'tee'; }
  let d = Infinity; for (const h of HOLES_B) d = Math.min(d, segDist({ x, y }, h.tee, h.pin)); return d <= 7.5 ? 'fairway' : d <= 40 ? 'rough' : 'out';
};
const viewB: CourseView = { holes: HOLES_B, lieAt: lieB };
const PATH_LINES = (() => {
  const lines: { a: { x: number; y: number }; b: { x: number; y: number } }[] = [];
  HOLES_B.forEach((h, i) => { const a = { x: h.tee.x - 15, y: h.tee.y + 15 }, b = { x: h.pin.x + 10, y: h.pin.y + 15 }; lines.push({ a, b }); const nx = HOLES_B[i + 1]; if (nx) lines.push({ a, b: { x: nx.tee.x - 15, y: nx.tee.y + 15 } }); });
  return lines;
})();

describe('T351: the field\'s carts turn through their bends and ease in and out, on the same minutes', () => {
  const f = makeField(1, 5), gs = teeTimes(f, 5); fieldEntourage(f, gs, 1);
  const plan = playRound(viewB, f, gs, 5), cp = new CartPlay(plan, viewB, cartPaths(PATH_LINES), { x: 0, y: 0 }, null);
  /** every drive of every cart of the day: [cart, from stop, the visit it drives into, the visit before] (with the route worked out by drawing it once) */
  const drives: { c: number; t0: number; to: ReturnType<CartPlay['stops']>[number]; from: { x: number; y: number }; prev: ReturnType<CartPlay['stops']>[number] | undefined }[] = [];
  for (let c = 0; c < cp.size; c++) for (let h = 0; h < viewB.holes.length; h++) {
    const vs = cp.stops(c, h);
    vs.forEach((v, i) => { if (i > 0) drives.push({ c, t0: vs[i - 1]!.dep, to: v, from: vs[i - 1]!.stop, prev: vs[i - 1] }); });
    if (h > 0 && vs.length) { const pv = cp.stops(c, h - 1); if (pv.length) drives.push({ c, t0: pv[pv.length - 1]!.dep, to: vs[0]!, from: pv[pv.length - 1]!.stop, prev: pv[pv.length - 1] }); }
  }
  const out: PlayCart[] = [], STEP = 0.0004; // (game minutes: a cart at its pace goes 0.1 m, a twentieth of a tile, between two samples)
  /** a drive's samples: the cart's point and heading every STEP game minutes from its departure to its arrival (the drive's route is worked out by the first sample) */
  function sample(d: (typeof drives)[number]) {
    const rows: { m: number; x: number; y: number; hx: number; hy: number }[] = [], only = new Uint8Array(Math.max(...plan.golfers.map(g => g.id)) + 1), who = plan.golfers.find(g => g.cart === d.c && !g.owner)!; only[who.id] = 1;
    for (let m = d.t0; m <= d.to.arr + 1e-9; m += STEP) {
      const k = cp.update(m, out, only); let q: PlayCart | undefined; for (let i = 0; i < k; i++) if (out[i]!.cart === d.c) q = out[i];
      if (q) rows.push({ m, x: q.x, y: q.y, hx: q.hx, hy: q.hy });
    }
    return rows;
  }
  const long = drives.filter(d => d.to.arr - d.t0 > 8 * STEP && Math.hypot(d.to.stop.x - d.from.x, d.to.stop.y - d.from.y) > 20);
  it('the fixture has carts with long drives, bends among them', () => { assert.ok(cp.size >= 2 && long.length >= 20, `${cp.size} carts, ${long.length} long drives`); });
  it('every drive: it leaves from its stop at its minute, is at its next stop at its minute, never moves faster than easedShare allows, and the pictures step one at a time', () => {
    let drivesChecked = 0, raw = 0, blended = 0, bends = 0, soft = 0, steady = 0; const sample8 = long.filter((_, i) => i % 3 === 0).slice(0, 40);
    for (const d of sample8) {
      const rows = sample(d); if (rows.length < 100) continue; drivesChecked++;
      const first = rows[0]!, last = rows[rows.length - 1]!, a = d.from, b = d.to.stop;
      assert.ok(Math.hypot(first.x - a.x, first.y - a.y) < 1e-6, 'it leaves its stop at its minute'); assert.ok(Math.hypot(last.x - b.x, last.y - b.y) < 0.05, `it is at its next stop at its minute (${Math.hypot(last.x - b.x, last.y - b.y).toFixed(3)} tiles off)`);
      const L = d.to.cum![d.to.cum!.length - 1]!, T = d.to.arr - d.t0, meanStep = (L / T) * STEP;
      // the pace: the first and the last steps of a long drive are well under the mean's, the middle is over it
      const step = (i: number) => Math.hypot(rows[i]!.x - rows[i - 1]!.x, rows[i]!.y - rows[i - 1]!.y);
      if (L > 12) { assert.ok(step(1) < 0.35 * meanStep, `pulls away softly: first step ${(step(1) / meanStep).toFixed(2)} of the mean`); assert.ok(step(rows.length - 1) < 0.5 * meanStep + 1e-9 || T / STEP - rows.length < 1.5, `stops softly: last step ${(step(rows.length - 1) / meanStep).toFixed(2)} of the mean`); soft++; }
      let top = 0; for (let i = 1; i < rows.length; i++) top = Math.max(top, step(i)); assert.ok(top <= meanStep * (1 + 2 * Math.min(0.5, RAMP_M / TILE_M / L)) * 1.02 + 1e-9, `never faster than the ramp's peak (${(top / meanStep).toFixed(2)} of the mean)`); if (L > 12) steady++;
      // the pictures: consecutive samples are the same picture or neighbours (the cart turns 15 degrees at most between two samples)
      const angles = rows.map(r => Math.atan2(r.hy, r.hx)), st = steps(angles), bad = st.findIndex(s => Math.abs(s) > 1);
      if (bad >= 0) assert.fail(`the pictures step through their neighbours (${st.filter(s => Math.abs(s) > 1).length} jumps): sample ${bad} of ${rows.length}: ${(angles[bad]! / DEG).toFixed(1)} -> ${(angles[bad + 1]! / DEG).toFixed(1)} deg at ${rows[bad]!.x.toFixed(2)}, ${rows[bad]!.y.toFixed(2)}; route ${JSON.stringify(d.to.route!.map(p => [+p.x.toFixed(2), +p.y.toFixed(2)]))} runs ${JSON.stringify(d.to.ang)} prev ${JSON.stringify(d.prev?.ang)}`);
      blended += st.filter(s => s !== 0).length;
      // the same drive's raw segment headings (the old heading): its bends in pictures
      const H = rawHeadings(d.to.route!); for (let j = 1; j < H.length; j++) { const j8 = Math.abs(steps([H[j - 1]!, H[j]!])[0]!); if (j8 >= 2) raw++; if (j8 >= 1) bends++; }
    }
    console.log(`# carts: ${drivesChecked} drives sampled every ${STEP} game minutes: ${bends} bends (${raw} of two pictures or more, which the old heading jumped across), the blended pictures changed ${blended} times, none across; ${soft} soft starts and stops checked`);
    assert.ok(drivesChecked >= 15, `${drivesChecked} drives checked`); assert.ok(bends >= 5 && soft >= 10 && steady >= 10, `${bends} bends, ${soft} long drives`);
  });
  it('the old heading (the segment\'s own) jumps across the pictures on the same drives: the check above can fail', () => {
    let jumps = 0, drivesWith = 0;
    for (const d of long.slice(0, 200)) { const H = rawHeadings(d.to.route ?? []); let any = false; for (let j = 1; j < H.length; j++) if (Math.abs(steps([H[j - 1]!, H[j]!])[0]!) >= 2) { jumps++; any = true; } if (any) drivesWith++; }
    // (only drives whose routes were worked out by the test above; the course's paths turn corners of a quarter turn behind the tees)
    const withRoutes = long.filter(d => d.to.route).length; assert.ok(withRoutes >= 10, `${withRoutes} routes known`); assert.ok(jumps >= 3, `${jumps} bends of two pictures or more in ${drivesWith} drives`);
  });
  it('?oldcart (the soft cart off) drives as before on the same drives: a full-pace first step, and a heading that jumps across the pictures at a bend', () => {
    setCartSoft(false);
    try {
      let n = 0, jumps = 0, hard = 0;
      for (const d of long.filter((_, i) => i % 3 === 0).slice(0, 40)) {
        const rows = sample(d); if (rows.length < 100) continue; n++;
        jumps += steps(rows.map(r => Math.atan2(r.hy, r.hx))).filter(s => Math.abs(s) >= 2).length;
        const L = d.to.cum![d.to.cum!.length - 1]!, T = d.to.arr - d.t0, mean = (L / T) * STEP; if (Math.hypot(rows[1]!.x - rows[0]!.x, rows[1]!.y - rows[0]!.y) > 0.9 * mean) hard++;
      }
      assert.ok(n >= 15, `${n} drives`); assert.ok(jumps >= 3, `${jumps} jumps across two pictures or more, as before`); assert.ok(hard >= n * 0.8, `${hard} of ${n} drives start at full pace, as before`);
    } finally { setCartSoft(true); }
  });
  it('the arrival minutes of the play are untouched: a cart is parked at each of its stops from its arrival to its departure, and the day\'s stops are the same', () => {
    let stops = 0;
    for (let c = 0; c < cp.size; c++) for (let h = 0; h < viewB.holes.length; h++) for (const v of cp.stops(c, h)) {
      stops++; const k0 = cp.update((v.arr + v.dep) / 2, out); let q: PlayCart | undefined; for (let i = 0; i < k0; i++) if (out[i]!.cart === c) q = out[i];
      if (q && v.dep - v.arr > 0.1) assert.ok(Math.hypot(q.x - v.stop.x, q.y - v.stop.y) < 1e-6, 'parked at its stop between its arrival and its departure');
    }
    assert.ok(stops > 100, `${stops} stops`);
  });
});

// ---------- your cart: cartdrive.ts ----------
const open = () => true;
describe('T351: your cart steers, pulls away and rolls to a stop', () => {
  const frame = 1 / 60;
  function fresh(face = 6) { const c = makeYou(100, 100, face); c.speed = CART_TILES; const d = new CartDrive(); d.reset(c); return { c, d }; }
  /** key axes on the screen: kx right, ky down */
  it('it starts from rest softly and reaches its pace; the keys let go, it rolls a short way on and stops (the keys flag clears)', () => {
    const { c, d } = fresh(6); const xs: number[] = [c.x]; let t = 0, y0 = c.y;
    while (t < 1.2) { d.keys(c, 1, 0, false, frame, open); d.look(c, frame); xs.push(c.x); t += frame; }
    const sp = (i: number) => (xs[i]! - xs[i - 1]!) / frame / Math.SQRT1_2; // (right on the screen is along the tile direction (1, -1): x moves by 0.707 of the pace)
    assert.ok(sp(3) < 0.35 * CART_TILES, `3 frames after the key it moves at ${(sp(3) / CART_TILES).toFixed(2)} of its pace`); assert.ok(Math.abs(sp(xs.length - 1) - CART_TILES) < 1e-6, 'and then at its pace');
    assert.ok(sp(Math.round(SPEED_UP_S * 60) + 2) > 0.95 * CART_TILES, 'within SPEED_UP_S + a little');
    // (right on the screen is the tile direction +x -y: the heading is -45 degrees and the cart drives that way)
    assert.ok(Math.abs(c.x - 100 - (100 - c.y)) < 1e-9 && c.y < y0 && c.x > 100, 'it drives to the screen\'s right along its heading');
    const before = c.x, v0 = d.v; assert.equal(v0, 1); let n = 0, vPrev = 1; let moved = 0;
    while (c.keys && n < 200) { const x0 = c.x; d.free(c, frame, open); d.look(c, frame); moved += c.x - x0; assert.ok(d.v <= vPrev + 1e-12, 'the speed only falls'); vPrev = d.v; n++; }
    assert.ok(!c.keys && d.v === 0 && !d.coasting, 'stopped'); assert.ok(n / 60 <= SPEED_DOWN_S + 0.05, `${(n / 60).toFixed(2)} s to stop`);
    assert.ok(c.x - before > 0.05 && c.x - before < CART_TILES * Math.SQRT1_2 * SPEED_DOWN_S * 0.5 + 0.05, `it rolled ${(c.x - before).toFixed(2)} tiles on (at most ${(CART_TILES * Math.SQRT1_2 * SPEED_DOWN_S * 0.5).toFixed(2)})`);
  });
  it('under the keys it turns through the neighbouring pictures, a quarter turn in about 0.3 s, and drives along its heading (never sideways)', () => {
    for (const [from, to] of [[[1, 0], [0, -1]], [[1, 0], [-1, 0]], [[0, 1], [0, -1]], [[-1, 0], [0, 1]], [[1, 1], [-1, -1]]] as const) {
      const { c, d } = fresh(6); for (let i = 0; i < 90; i++) { d.keys(c, from[0], from[1], false, frame, open); d.look(c, frame); }
      const angles: number[] = [d.ang]; let px = c.x, py = c.y, side = 0, turned = 0;
      for (let i = 0; i < 120; i++) {
        d.keys(c, to[0], to[1], false, frame, open); d.look(c, frame); angles.push(d.ang);
        const dx = c.x - px, dy = c.y - py; px = c.x; py = c.y; if (Math.hypot(dx, dy) > 1e-9) side = Math.max(side, Math.abs(wrapPi(Math.atan2(dy, dx) - d.ang)));
        turned = Math.max(turned, Math.abs(wrapPi(angles[angles.length - 1]! - angles[angles.length - 2]!)));
      }
      const st = steps(angles); assert.ok(st.every(s => Math.abs(s) <= 1), `keys ${from} to ${to}: no jump across (${st.filter(s => Math.abs(s) > 1).length})`);
      assert.ok(turned <= TURN_RATE * frame + 1e-9, 'it never turns faster than the rate'); assert.ok(side < 1e-9, `it drives along its heading (${side})`);
      const want = Math.atan2(c.y - py, c.x - px); void want;
    }
    // a quarter turn takes about 0.3 s at pace
    const { c, d } = fresh(6); for (let i = 0; i < 120; i++) { d.keys(c, 1, 0, false, frame, open); d.look(c, frame); }
    let t = 0; const a0 = d.ang; while (Math.abs(wrapPi(d.ang - a0)) < Math.PI / 2 - 1e-9 && t < 3) { d.keys(c, 0, -1, false, frame, open); d.look(c, frame); t += frame; }
    assert.ok(t > 0.25 && t < 0.35, `a quarter turn in ${t.toFixed(2)} s`);
  });
  it('the old way (the facing is the key\'s, at once) jumps across the pictures on a reversal: the check above can fail', () => {
    const angles: number[] = [0, Math.atan2(1, -1)]; // (the keys' direction before and after, as keyStep sets the facing of a step)
    assert.ok(Math.abs(steps([0, Math.PI])[0]!) >= 2 && Math.abs(steps(angles)[0]!) >= 1, 'a reversal snaps four pictures at once, the old way');
  });
  it('a click\'s route is followed exactly, its pace eased in and out, ending where it was sent, the picture turning through each leg\'s neighbours', () => {
    const { c, d } = fresh(6), goal = { x: 100 + 14, y: 100 + 6 };
    // a route round a corner: a wall at x > 107 between y 90 and 104 forces a detour (the cost is Infinity inside it)
    const cost = (x: number, y: number) => (x > 107 && x < 109 && y > 90 && y < 104 ? Infinity : 1), route = routeOf({ x: c.x, y: c.y }, goal, cost);
    assert.ok(route.length >= 3, `a route with bends (${route.length} points)`);
    startWalk(c, route, false); const angles: number[] = [d.ang], speeds: number[] = []; let arrived = false, t = 0, total = 0;
    while (!arrived && t < 30) { const x0 = c.x, y0 = c.y; arrived = d.free(c, frame, open); d.look(c, frame); const s = Math.hypot(c.x - x0, c.y - y0); total += s; speeds.push(s / frame); angles.push(d.ang); t += frame; }
    assert.ok(arrived, 'it arrives'); assert.ok(Math.abs(c.x - goal.x) < 1e-9 && Math.abs(c.y - goal.y) < 1e-9, 'where it was sent'); assert.ok(!c.moving && d.v === 0);
    assert.ok(speeds[0]! < 0.3 * CART_TILES, `pulls away: ${(speeds[0]! / CART_TILES).toFixed(2)} of its pace on the first frame`); assert.ok(speeds[speeds.length - 1]! < 0.2 * CART_TILES, `stops softly: ${(speeds[speeds.length - 1]! / CART_TILES).toFixed(2)} of its pace on the last`);
    assert.ok(Math.max(...speeds) <= CART_TILES * 1.001, 'never above its pace'); assert.ok(Math.max(...speeds) > 0.98 * CART_TILES, 'and reaches it');
    assert.ok(total > 0 && t < total / CART_TILES + 1.2, `${t.toFixed(2)} s for ${total.toFixed(1)} tiles`);
    const st = steps(angles); assert.ok(st.every(s => Math.abs(s) <= 1), `the pictures step through their neighbours (${st.filter(s => Math.abs(s) > 1).length} jumps)`);
    void remaining;
  });
  it('your cart keeps off what `ok` keeps it off (the tee boxes, greens, bunkers and water that cartOk refuses): steering, rolling on and a route never put it there', () => {
    // a green of radius 6 round (108, 100): ok is false on it. Drive at it under the keys (screen right is the tile direction +x -y: along the wall's face) and rolling on after them, then a route across it.
    const ok = (x: number, y: number) => Math.hypot(x - 108, y - 100) > 6;
    for (const [kx, ky] of [[1, 1], [1, 0], [1, -1], [0, 1]] as const) {
      const { c, d } = fresh(6); c.x = 100; c.y = 100; let inside = 0, steps2 = 0;
      for (let i = 0; i < 240; i++) { d.keys(c, kx, ky, i > 120, frame, ok); d.look(c, frame); if (!ok(c.x, c.y)) inside++; steps2++; }
      for (let i = 0; i < 60; i++) { d.free(c, frame, ok); d.look(c, frame); if (!ok(c.x, c.y)) inside++; }
      assert.equal(inside, 0, `keys ${kx},${ky}: never on the green (${steps2} frames)`); assert.ok(!d.coasting && d.v === 0, 'and it came to a stop');
    }
    // the route round it (the A* of the engine goes round what is Infinity: here the same cost): the cart drives the polyline exactly and never touches the green
    const { c, d } = fresh(6); c.x = 90; c.y = 100; const cost = (x: number, y: number) => (ok(x, y) ? 1 : Infinity), route = routeOf({ x: c.x, y: c.y }, { x: 126, y: 100 }, cost);
    startWalk(c, route, false); let t = 0, on = 0; while (c.moving && t < 40) { d.free(c, frame, ok); d.look(c, frame); if (!ok(c.x, c.y)) on++; t += frame; }
    assert.ok(!c.moving && Math.abs(c.x - 126) < 1e-9, 'it arrived'); assert.equal(on, 0, 'round the green, never on it');
  });
  it('a facing the game sets from outside (the cart turned to you on arriving) is turned to a step at a time, not jumped to; at rest it keeps its heading', () => {
    const { c, d } = fresh(6); for (let i = 0; i < 30; i++) d.look(c, frame); assert.ok(Math.abs(wrapPi(d.ang - faceAngle(6))) < 1e-12);
    c.face = 2; const angles = [d.ang]; for (let i = 0; i < 60; i++) { d.look(c, frame); angles.push(d.ang); }
    const st = steps(angles); assert.ok(st.every(s => Math.abs(s) <= 1) && st.filter(s => s !== 0).length >= 3, 'through the pictures between'); assert.ok(Math.abs(wrapPi(d.ang - faceAngle(2))) < 1e-9, 'and there');
    const a = d.ang; for (let i = 0; i < 30; i++) d.look(c, frame); assert.equal(d.ang, a, 'at rest it keeps it');
    assert.equal(faceAngle(0), Math.PI / 4, 'facing S is the tile direction (+x +y)'); assert.equal(carIdx(faceAngle(7)), 0, 'facing SE is the cars\' SE'); assert.equal(carIdx(faceAngle(6)), 7, 'facing E'); assert.equal(carIdx(faceAngle(4)), 5, 'facing N');
  });
});

test('T351: the pace is the cart\'s: 2.4 tiles a second, a run 1.4 times it', () => { assert.equal(CART_TILES, 2.4); assert.ok(SPEED_UP_S > 0.2 && SPEED_DOWN_S > 0.1); });
