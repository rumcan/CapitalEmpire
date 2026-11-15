/**
 * #1338: a built green gets natural contours (ext/green-contours): a tilt toward the front and one or two soft features, the steepest under
 * 4% (under 3% round the pin), blended into the collar, seeded by the game and the hole; New hole's Build lays them free in its undo step.
 * Pure, Node. Tiles of 2 m, cells of 1 m (0.5 tile), height samples every 2 tiles, metres.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELL_T, SURF, applyDiff, makeGrid, type Grid } from '../src/game/ext/course-grid';
import { CH_SIZE, CH_STEP, createCourseHeightField, sampleCourseGrid, type CourseHeightField } from '../src/game/ext/course-height';
import { planChanges, planGeom } from '../src/game/ext/hole-plan';
import { decodePlans, newPlan } from '../src/game/ext/hole-wizard';
import { applyHoleGround, shapeHoleGround } from '../src/game/ext/hole-ground';
import { GREEN_CONTOUR, applyGreenContour, contourGreen, greenApproach, greenContourSeed, type GreenContourInput } from '../src/game/ext/green-contours';
import { buildBreakGrid } from '../src/game/golf/play/green';
import { PaintTool, type PaintHost } from '../src/game/paint-tool';

type P = { x: number; y: number };
/** hole n from tee to green, built on grid g (cells laid), on a field shaped by T263 or not */
function built(tee: P, green: P, opts: { n?: number; g?: Grid; f?: CourseHeightField; shape?: boolean; bends?: P[] } = {}) {
  const n = opts.n ?? 1, g = opts.g ?? makeGrid(0, 0, 900, 1200), f = opts.f ?? createCourseHeightField();
  const plan = newPlan(n, { x: tee.x + 0.25, y: tee.y + 0.25 }, { x: green.x + 0.25, y: green.y + 0.25 }, opts.bends ?? []), geom = planGeom(plan);
  const diff = planChanges(g, null, plan, n, 2);
  const sh = opts.shape ? shapeHoleGround({ grid: g, hole: n, plan, geom, diff, field: f }) : null;
  applyDiff(g, diff, false); if (sh) applyHoleGround(f, sh);
  const inp = (seed = greenContourSeed(7, n, plan.seed), land: Float32Array | null = null): GreenContourInput => ({ field: f, grid: g, hole: n, approach: greenApproach(geom, plan.green), pin: plan.green, seed, land });
  return { g, f, plan, geom, inp };
}
const onGreenOf = (g: Grid, n: number) => (x: number, y: number) => { const cx = Math.floor((x - g.x0) / CELL_T), cy = Math.floor((y - g.y0) / CELL_T); if (cx < 0 || cy < 0 || cx >= g.w || cy >= g.h) return false; const c = cy * g.w + cx; return g.surf[c] === SURF.green && g.hole[c] === n; };
/** the putting read of hole n's green (green.ts buildBreakGrid on the ground): its slopes (m/m), sorted */
function readSlopes(g: Grid, n: number, f: CourseHeightField, pin: P, land: Float32Array | null = null): number[] {
  const h = (x: number, y: number) => sampleCourseGrid(f.data, x, y) + (land ? sampleCourseGrid(land, x, y) : 0);
  const bg = buildBreakGrid(h, onGreenOf(g, n), pin.x, pin.y, 30), s: number[] = [];
  for (let q = 0; q < bg.n; q++) s.push(bg.pts[q * 5 + 4]!);
  return s.sort((a, b) => a - b);
}
const pct = (s: number[], p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
const diffs = (a: Float32Array, b: Float32Array) => { let n = 0; for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) n++; return n; };

const HOLES: [P, P, P[]?][] = [[{ x: 40, y: 120 }, { x: 230, y: 120 }], [{ x: 40, y: 300 }, { x: 300, y: 330 }, [{ x: 180, y: 260 }]], [{ x: 40, y: 500 }, { x: 110, y: 520 }], [{ x: 400, y: 580 }, { x: 230, y: 560 }], [{ x: 420, y: 40 }, { x: 400, y: 260 }]];

test('the same hole and game contour the same; another game or hole contours otherwise', () => {
  const a = built(...HOLES[0]!.slice(0, 2) as [P, P]), b = built(...HOLES[0]!.slice(0, 2) as [P, P]);
  const ca = contourGreen(a.inp()), cb = contourGreen(b.inp());
  assert.ok(ca.k.length > 20, 'it lays contours');
  assert.deepEqual([...ca.k], [...cb.k]); assert.deepEqual([...ca.after], [...cb.after], 'deterministic');
  assert.equal(greenContourSeed(7, 1, 5), greenContourSeed(7, 1, 5));
  assert.notEqual(greenContourSeed(7, 1, 5), greenContourSeed(8, 1, 5), 'the game seed counts'); assert.notEqual(greenContourSeed(7, 1, 5), greenContourSeed(7, 2, 5), 'the hole counts');
  const cc = contourGreen(a.inp(greenContourSeed(8, 1, a.plan.seed)));
  assert.notDeepEqual([...ca.after], [...cc.after], 'another game, other contours');
});

test('contours on many holes and seeds: a tilt of 0.8-2% toward the back, 1-2 features of 0.12-0.35 m, the steepest under 4% and round the pin under 3%', () => {
  let kinds = new Set<string>();
  for (const [tee, green, bends] of HOLES) for (const shape of [false, true]) for (const seed of [1, 2, 3, 4, 5, 99, 12345]) {
    const h = built(tee, green, { shape, ...(bends ? { bends } : {}) }), c = contourGreen(h.inp(seed));
    assert.equal(c.skipped, undefined);
    assert.ok(c.features.length >= 1 && c.features.length <= 2);
    for (const f of c.features) { kinds.add(f.kind); assert.ok(Math.abs(f.h) <= GREEN_CONTOUR.ampMax + 1e-9, `${f.kind} ${f.h}`); }
    assert.ok(c.maxSlope <= GREEN_CONTOUR.maxSlope + 1e-6, `steepest ${c.maxSlope}`); assert.ok(c.pinSlope <= GREEN_CONTOUR.pinSlope + 1e-6, `pin ${c.pinSlope}`);
    assert.ok(c.tilt >= GREEN_CONTOUR.tiltMin - 1e-6 && c.tilt <= GREEN_CONTOUR.tiltMax + 1e-6, `tilt ${c.tilt}`);
    const ap = greenApproach(h.geom, h.plan.green); assert.ok(c.dir.x * ap.x + c.dir.y * ap.y >= Math.cos((GREEN_CONTOUR.turnDeg * Math.PI) / 180) - 1e-9, 'uphill is toward the back: it falls toward the approach');
    // the bound as the putting read sees it (2 m differences on the bilinear ground), laid in the field
    applyGreenContour(h.f, c);
    const s = readSlopes(h.g, 1, h.f, h.plan.green);
    assert.ok(s.at(-1)! <= GREEN_CONTOUR.maxSlope + 1e-4, `read steepest ${s.at(-1)}`);
  }
  assert.equal(kinds.size, 4, 'humps, swales, ridges and tiers all turn up');
  kinds = new Set();
});

test('the read varies: the slopes on a contoured green spread, where the plane had one even slope', () => {
  for (const [tee, green, bends] of HOLES) {
    const h = built(tee, green, { shape: true, ...(bends ? { bends } : {}) }), s0 = readSlopes(h.g, 1, h.f, h.plan.green);
    const c = contourGreen(h.inp()); applyGreenContour(h.f, c);
    const s1 = readSlopes(h.g, 1, h.f, h.plan.green), f = (v: number) => (v * 100).toFixed(2) + '%';
    console.log(`  plane: ${f(s0[0]!)} p10 ${f(pct(s0, 0.1))} p50 ${f(pct(s0, 0.5))} p90 ${f(pct(s0, 0.9))} max ${f(s0.at(-1)!)} | contoured (${c.features.map(q => q.kind).join('+')}, tilt ${f(c.tilt)}): min ${f(s1[0]!)} p10 ${f(pct(s1, 0.1))} p50 ${f(pct(s1, 0.5))} p90 ${f(pct(s1, 0.9))} max ${f(s1.at(-1)!)}`);
    assert.ok(pct(s1, 0.9) - pct(s1, 0.1) > pct(s0, 0.9) - pct(s0, 0.1) + 0.004, `the slopes spread ${pct(s1, 0.1)}..${pct(s1, 0.9)}`);
  }
});

test('nothing changes outside the green and its collar, nor on another hole', () => {
  const g = makeGrid(0, 0, 900, 1200), f = createCourseHeightField();
  built({ x: 40, y: 300 }, { x: 300, y: 330 }, { g, f, n: 2 });
  const h = built({ x: 40, y: 120 }, { x: 230, y: 120 }, { g, f }), c = contourGreen(h.inp());
  assert.ok(c.k.length > 0);
  // the samples within reach: hold + blend samples (and the bilinear sample) of a green cell of hole 1
  const reach = (GREEN_CONTOUR.hold + GREEN_CONTOUR.blend + 1) * CH_STEP;
  const gc: P[] = []; for (let i = 0; i < g.surf.length; i++) if (g.surf[i] === SURF.green && g.hole[i] === 1) gc.push({ x: g.x0 + ((i % g.w) + 0.5) * CELL_T, y: g.y0 + (Math.floor(i / g.w) + 0.5) * CELL_T });
  for (const k of c.k) {
    const X = ((k % CH_SIZE) + 0.5) * CH_STEP, Y = (Math.floor(k / CH_SIZE) + 0.5) * CH_STEP;
    assert.ok(gc.some(q => Math.hypot(q.x - X, q.y - Y) <= reach * Math.SQRT2), `sample ${k} in reach of the green`);
    for (let dy = -1; dy <= 1; dy += 2) for (let dx = -1; dx <= 1; dx += 2) {
      const cx = Math.floor((X + dx - g.x0) / CELL_T), cy = Math.floor((Y + dy - g.y0) / CELL_T); if (cx < 0 || cy < 0 || cx >= g.w || cy >= g.h) continue;
      assert.notEqual(g.hole[cy * g.w + cx], 2, 'off hole 2');
    }
  }
  // no lip: neighbouring samples move together at the edge (the change fades out over the blend)
  const dh = new Float32Array(CH_SIZE * CH_SIZE); for (let q = 0; q < c.k.length; q++) dh[c.k[q]!] = c.after[q]! - c.before[q]!;
  let jump = 0; for (const k of c.k) for (const nk of [k + 1, k - 1, k + CH_SIZE, k - CH_SIZE]) jump = Math.max(jump, Math.abs(dh[k]! - dh[nk]!));
  assert.ok(jump < 0.12, `largest step between neighbouring samples ${jump} m`);
});

test('a green shaped by hand is left as it is; the land under it is in the bound', () => {
  const h = built({ x: 40, y: 120 }, { x: 230, y: 120 });
  const pk = Math.floor(h.plan.green.y / CH_STEP) * CH_SIZE + Math.floor(h.plan.green.x / CH_STEP);
  h.f.data[pk] = 0.2; h.f.rev++;
  const c = contourGreen(h.inp());
  assert.equal(c.skipped, 'sculpted'); assert.equal(c.k.length, 0);
  // a land tilted 2.5% the wrong way (up toward the front): turned to fall toward the front, the steepest still under 4%
  const h2 = built({ x: 40, y: 120 }, { x: 230, y: 120 }), land = new Float32Array(CH_SIZE * CH_SIZE);
  for (let k = 0; k < land.length; k++) land[k] = -0.025 * ((k % CH_SIZE) + 0.5) * CH_STEP * 2 + 20;
  const c2 = contourGreen(h2.inp(3, land));
  assert.ok(c2.maxSlope <= GREEN_CONTOUR.maxSlope + 1e-6, `steepest ${c2.maxSlope}`);
  applyGreenContour(h2.f, c2);
  const hx = (x: number) => sampleCourseGrid(h2.f.data, x, h2.plan.green.y) + sampleCourseGrid(land, x, h2.plan.green.y);
  assert.ok(hx(h2.plan.green.x + 4) > hx(h2.plan.green.x - 4), 'the back (away from the tee) now stands higher');
});

// ---------- the Build (paint-tool): applied, free, one undo step ----------
const PX = 16;
function game(money = 5_000_000) {
  const g = makeGrid(0, 0, 900, 1200), f: CourseHeightField = createCourseHeightField();
  const st = { money, plans: [] as unknown[], toasts: [] as string[] };
  const host: PaintHost = {
    setLotGround() {}, emit() {}, save() {}, toast: t => { st.toasts.push(t); }, affine: o => { o[0] = 0; o[1] = 0; o[2] = PX; o[3] = 0; o[4] = 0; o[5] = PX; },
    placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [],
    golfMode: () => true, currentMonth: () => 2, money: () => st.money, spend: n => { st.money -= n; },
    grid: () => g, gridChanged() {}, changed: () => {},
    ownedAt: x => x < 400, landAt: x => x < 400, landWhy: x => (x < 400 ? '' : 'off'),
    plans: () => st.plans, setPlans: p => { st.plans = p; },
    courseHeight: () => f, heightChanged: () => {}, gameSeed: () => 42,
    journal: { begin: () => {}, end: () => null, undo: j => j, redo: j => j },
  };
  const tool = new PaintTool(host);
  tool.enterCourse();
  const down = (x: number, y: number) => { tool.pointerDown({ x, y }, x * PX, y * PX); tool.pointerUp(0.5); };
  const plan = (tx: number, ty: number, gx: number, gy: number) => { tool.setPlan(); down(tx, ty); down(gx, gy); };
  return { g, f, st, tool, plan };
}

for (const shape of [true, false]) test(`New hole's Build contours the green (Shape the ground ${shape ? 'on' : 'off'}), free, in its undo step; Undo puts it back exactly`, () => {
  const { g, f, st, tool, plan } = game();
  tool.setShapeGround(shape);
  plan(40, 120, 230, 120);
  const gh = tool.wizard.ghost()!, e = tool.groundCost(), money = st.money, before = f.data.slice();
  assert.ok(tool.buildPlan());
  assert.equal(money - st.money, gh.cost + (e?.cost ?? 0), 'the contours cost nothing: the price shown is the price paid');
  assert.match(st.toasts.at(-1)!, /green contoured/);
  const after = f.data.slice(), pin = decodePlans(st.plans)[0]!.green;
  const s = readSlopes(g, 1, f, pin);
  assert.ok(pct(s, 0.9) - pct(s, 0.1) > 0.006, 'the read varies');
  assert.ok(s.at(-1)! <= GREEN_CONTOUR.maxSlope + 1e-4, `steepest ${s.at(-1)}`);
  tool.undo();
  assert.equal(diffs(before, f.data), 0, 'Undo restores the field exactly'); assert.equal(st.money, money);
  tool.redo();
  assert.equal(diffs(after, f.data), 0, 'Redo lays the same contours');
});

test('Edit Hole Layout never contours the green again', () => {
  const { f, tool, plan } = game();
  plan(40, 120, 230, 120); assert.ok(tool.buildPlan());
  const before = f.data.slice();
  assert.ok(tool.editPlan(1));
  const gr = tool.wizard.handles().find(q => q.k === 'green')!;
  tool.pointerDown(gr, gr.x * PX, gr.y * PX); tool.pointerMove({ x: gr.x + 6, y: gr.y + 4 }, (gr.x + 6) * PX, (gr.y + 4) * PX); tool.pointerUp(0.5);
  assert.ok(tool.buildPlan());
  assert.equal(diffs(before, f.data), 0, 'every height as it was');
});

