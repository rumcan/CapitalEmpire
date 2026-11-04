// T315 (#900): the straight-on (screen-axis) views' shadows and their turned pictures. The owner, 2026-11-03: "the hard side on buildings look
// terrible. can we add a slight angle to these so they look better but still work for your lots, the shadows are also fucked", and "it needs a
// slight turn of 5 to 10 degrees ... we also have to account for that in the lots".
// Headless: every straight-on view has its own vector shadow; a straight-on building's contact is its footprint, a screen-aligned box, and its cast
// falls to the lower left at about its walls' height (not its whole picture laid flat from the front wall: the board the old draft made); the
// draft stands a box on a footprint ring; the turned footprint shows the right-hand wall; the packing's fit finds a turned picture's footprint
// centre on its base (steps in front left out); and the lots' fit of a straight-on view is its square footprint, whatever its picture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../src/game/library';
import { AXIS_HEADING } from '../src/game/axis-library';
import { AXIS_K, axisFoot, axisFootPoint, axisFootRing } from '../src/game/axis-foot';
import { VECTOR_SHADOWS, type VectorShadow } from '../src/game/shadow-vector';
import { draftItems, draftKindOf } from '../src/game/dev/shadow-draft-items';
import { draftShadow, type DraftPicture } from '../src/game/dev/shadow-draft';
import { CAST, castShear } from '../src/game/cast-shadow';
import { frameHalf } from '../src/game/lots/house-class';
import { drawnView, footprintOf, ownerScaleOf } from '../src/game/lots/preset-art';
import { fitTurnedFoot, footRing, turnedHeight } from '../scripts/assets/axis-turn.mjs';

const sun = castShear(CAST);
const entry = (id: string): VectorShadow | undefined => { const e = VECTOR_SHADOWS[id]; return e?.same ? VECTOR_SHADOWS[e.same] : e; };
const axisItems = draftItems().map(i => LIBRARY[i]!).filter(it => AXIS_HEADING[it.id]);

test('every straight-on view the game draws has its own vector shadow (no T141 map-axis diamond, no silhouette board)', () => {
  assert.ok(axisItems.length >= 200, `${axisItems.length} straight-on views drawn`);
  const missing = axisItems.filter(it => !VECTOR_SHADOWS[it.id]).map(it => it.id);
  assert.deepEqual(missing, [], `${missing.length} straight-on views without a vector shadow`);
});

test('a straight-on building: its contact is a screen-aligned box, its cast falls to the lower left about its walls\' height', () => {
  let n = 0;
  for (const it of axisItems) {
    if (draftKindOf(it) !== 'building') continue;
    const e = entry(it.id)!, f = axisFoot(it.id)!;
    // dead square, or turned a few degrees toward the sun (T315: the turned repaints, yaw -8: the right-hand wall shows)
    assert.ok(f && (f.yaw === 0 || (f.yaw < 0 && f.yaw >= -10)), `${it.id}: a dead-square or slightly turned footprint (yaw ${f?.yaw})`);
    assert.equal(e.c?.length, 1, `${it.id}: one contact ring`);
    const c = e.c![0]!, X = new Set(c.filter((_, i) => i % 2 === 0)), Y = new Set(c.filter((_, i) => i % 2 === 1));
    let ys: number[];
    if (f.yaw === 0) {
      assert.ok(c.length === 8 && X.size === 2 && Y.size === 2, `${it.id}: the contact is a screen-aligned box: ${JSON.stringify(c)}`);
      // the box: its front on the picture's base (half the depth below the anchor), its back as far above
      ys = [...Y].sort((a, b) => a - b);
      assert.ok(Math.abs(ys[0]! + ys[1]!) <= 2 && ys[1]! > 5, `${it.id}: the box is centred on the anchor, front ${ys[1]} back ${ys[0]}`);
    } else {
      // a turned footprint: four corners, no two on one screen row (the ring turned), about the anchor
      assert.ok(c.length === 8 && Y.size === 4, `${it.id}: the contact is the turned footprint: ${JSON.stringify(c)}`);
      ys = [Math.min(...Y), Math.max(...Y)];
      assert.ok(Math.abs(ys[0]! + ys[1]!) <= 0.25 * (ys[1]! - ys[0]!) + 4 && ys[1]! > 5, `${it.id}: the ring is about the anchor, front ${ys[1]} back ${ys[0]}`);
    }
    // the cast: no taller than the picture's height less the ground's depth it shows (the old board cast the whole picture); it reaches out to
    // the lower left of the footprint and never past its right-hand side (the sun is at the upper right)
    const s = (e.s ?? []).flat(), cx = [...X]; let hMax = 0, lx0 = Infinity, lx1 = -Infinity, ly1 = -Infinity;
    for (let i = 0; i < s.length; i += 3) { hMax = Math.max(hMax, s[i + 2]!); const x = s[i]! + s[i + 2]! * sun.sx, y = s[i + 1]! + s[i + 2]! * sun.sy; lx0 = Math.min(lx0, x); lx1 = Math.max(lx1, x); ly1 = Math.max(ly1, y); }
    assert.ok(s.length > 0, `${it.id}: casts`);
    assert.ok(hMax <= it.h - (ys[1]! - ys[0]!) * 0.5 + 2, `${it.id}: cast at most ${hMax} px tall, the picture ${it.h.toFixed(0)} with ${(ys[1]! - ys[0]!)} px of ground`);
    assert.ok(lx0 < Math.min(...cx) - 5 && lx1 <= Math.max(...cx, it.w - it.ax) + 12 && ly1 > ys[1]!, `${it.id}: the cast reaches the lower left (x ${lx0.toFixed(0)}..${lx1.toFixed(0)}, down to ${ly1.toFixed(0)}; the box x ${cx}, front ${ys[1]})`);
    n++;
  }
  assert.ok(n >= 150, `${n} straight-on buildings checked`);
});

test('the draft on a footprint ring: the contact is the ring, the walls cast their height and the roof lies back on the footprint', () => {
  // a straight-on box: front wall 100 wide x 60 tall standing on y 119, its flat roof's top face 40 px deep above it (the ground depth 40 px:
  // the footprint from y 79 to 119 about the anchor's row 99)
  const w = 120, h = 120, ax = 60, ay = 99;
  const rgba = new Uint8ClampedArray(w * h * 4); for (let y = 19; y < 120; y++) for (let x = 10; x < 110; x++) rgba[(y * w + x) * 4 + 3] = 255;
  const p: DraftPicture = { rgba, w, h, x0: 0.5 - ax, y0: 0.5 - ay, rx: 1, ry: 1 };
  const foot = [-50, 20, 50, 20, 50, -20, -50, -20];
  const d = draftShadow(p, 'building', sun, { foot })!;
  assert.deepEqual(d.c, [foot], 'the contact is the footprint');
  const s = d.s!.flat(); let hMax = 0; for (let i = 0; i < s.length; i += 3) hMax = Math.max(hMax, s[i + 2]!);
  assert.ok(hMax >= 55 && hMax <= 66, `the walls cast about their 60 px, not the picture's 100: ${hMax}`);
  // every cast vertex's foot on the footprint (between its back and front)
  for (let i = 0; i < s.length; i += 3) assert.ok(s[i + 1]! >= -21 && s[i + 1]! <= 21, `a foot at y ${s[i + 1]} lies on the footprint`);
  // the board the old draft made of it: the whole picture's height cast from the front line
  const old = draftShadow(p, 'building', sun)!, os = old.s!.flat(); let oMax = 0; for (let i = 0; i < os.length; i += 3) oMax = Math.max(oMax, os[i + 2]!);
  assert.ok(oMax > 90, `(the old draft cast ${oMax} px: the board)`);
});

test('the footprint: dead square it is a screen rectangle; turned 7 degrees toward the sun its right-hand end comes forward', () => {
  const sq = axisFootRing({ w: 4, d: 2, yaw: 0 });
  assert.deepEqual(sq.map(v => Math.round(v * 100) / 100), [-2 * AXIS_K, AXIS_K / 2, 2 * AXIS_K, AXIS_K / 2, 2 * AXIS_K, -AXIS_K / 2, -2 * AXIS_K, -AXIS_K / 2].map(v => Math.round(v * 100) / 100));
  const f = { w: 4, d: 2, yaw: -7 }, fl = axisFootPoint(f, -2, -1), fr = axisFootPoint(f, 2, -1), br = axisFootPoint(f, 2, 1);
  assert.ok(fr[1] > fl[1] && fr[1] > br[1], 'the front-right corner is the lowest');
  assert.ok(br[0] > fr[0] + 5, 'the right-hand wall shows: its back corner lies right of its front one');
  // the packing's ring is the same as the game's
  const pr = footRing(4, 2, -7).flat(), gr = axisFootRing(f);
  pr.forEach((v, i) => assert.ok(Math.abs(v - gr[i]!) < 1e-9));
  assert.equal(turnedHeight(300, 4, 2, 0), 300, 'no turn, no change');
});

test('the packing: a turned picture\'s footprint centre found on its base, steps in front and eaves left out', () => {
  // a turned box's base (picture px at 0.8 display px a px): its footprint 5 x 3 tiles at yaw -7, centre at (400, 300); steps 30 px lower in front
  // of the middle of the front wall, eaves 20 px wide at each end standing 40 px above the ground
  const s = 0.8, front = 5, depth = 3, yaw = -7, C = [400, 300];
  const ring = footRing(front, depth, yaw).map(([x, y]) => [C[0]! + x / s, C[1]! + y / s] as [number, number]);
  const near = (x: number) => { let hi = -Infinity; for (let i = 0; i < 4; i++) { const [ax, ay] = ring[i]!, [bx, by] = ring[(i + 1) % 4]!; if ((ax <= x) === (bx <= x)) continue; hi = Math.max(hi, ay + (by - ay) * (x - ax) / (bx - ax)); } return hi; };
  const xs = ring.map(p => p[0]), x0 = Math.ceil(Math.min(...xs)), x1 = Math.floor(Math.max(...xs));
  const bot = new Float64Array(x1 + 40).fill(-1);
  for (let x = x0; x <= x1; x++) bot[x] = Math.round(near(x));
  for (let x = 370; x < 410; x++) bot[x] = bot[x]! + 30;
  for (let x = x0 - 20; x < x0; x++) bot[x] = Math.round(near(x0) - 40);
  for (let x = x1 + 1; x < x1 + 21; x++) bot[x] = Math.round(near(x1) - 40);
  const f = fitTurnedFoot(bot, yaw, depth / front)!;
  assert.ok(Math.abs(f.cx - C[0]!) <= 2 && Math.abs(f.cy - C[1]!) <= 2, `the centre ${f.cx.toFixed(1)}, ${f.cy.toFixed(1)} (want ${C})`);
  assert.ok(Math.abs(f.front * s / AXIS_K - front) < 0.1, `the front ${(f.front * s / AXIS_K).toFixed(2)} tiles (want ${front})`);
  // the front known from the square views (the packing): the same centre, the front exactly that
  const k = fitTurnedFoot(bot, yaw, depth / front, 2, front * AXIS_K / s)!;
  assert.ok(Math.abs(k.cx - C[0]!) <= 2 && Math.abs(k.cy - C[1]!) <= 2, `the centre with a known front ${k.cx.toFixed(1)}, ${k.cy.toFixed(1)} (want ${C})`);
  assert.equal(k.front, front * AXIS_K / s);
  // the old anchor rule (the middle of the lowest row) lands on the steps, far off the centre in a turned picture without them, on the corner
  const lowest = Math.max(...bot.filter((_, x) => x < 370 || x >= 410)), atLow = [...bot].findIndex(v => v === lowest);
  assert.ok(Math.abs(atLow - C[0]!) > 80, `(without the fit the anchor would sit at the near corner, x ${atLow})`);
});

test('the lots fit a straight-on building by its square footprint (the library boxes), not its picture: a turned picture changes nothing there', () => {
  // a lot on a screen-straight road (road 1: the street along (1, 1) on the map): its front faces the street in the N view
  const f = { q: 0, u: { x: Math.SQRT1_2, y: -Math.SQRT1_2 }, n: { x: -Math.SQRT1_2, y: -Math.SQRT1_2 } };
  let n = 0;
  for (const it of axisItems) {
    if (draftKindOf(it) !== 'building' || AXIS_HEADING[it.id] !== 'N' || !it.id.startsWith('view:')) continue;
    const base = it.id.slice(5, it.id.lastIndexOf(':')); if (!LIBRARY.some(o => o.id === base)) continue;
    const t = drawnView(base, f, 0); if (t.id !== it.id) continue;
    assert.ok(t.diag, `${it.id}: drawn on its street with the square footing`);
    const h = frameHalf(f)({ id: base, x: 0, y: 0, scale: 1, view: 0 } as never), fp = footprintOf(it.id, ownerScaleOf(base), false);
    const want = Math.max(fp[2] - fp[0], fp[3] - fp[1]) / 2 / Math.SQRT2;
    assert.ok(Math.abs(h.ha - want) < 1e-9 && Math.abs(h.hb - want) < 1e-9, `${it.id}: fitted by its boxes (${h.ha.toFixed(2)} x ${h.hb.toFixed(2)})`);
    n++;
  }
  assert.ok(n >= 10, `${n} straight-on buildings fitted by their boxes`);
});
