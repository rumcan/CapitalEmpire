/**
 * T263 (#771): New hole's Build shapes the new hole's ground (ext/hole-ground): gentle fairway rolls, mounds and swales, a tilted green, a
 * level tee, the edges blended out and kept off what is not the hole's; priced as earthworks, in the Build's undo step, behind "Shape the
 * ground" (on by default, remembered); saved holes carry it; Edit Hole Layout never reshapes. Pure, Node. Tiles of 2 m, cells of 1 m (0.5
 * tile), height samples every 2 tiles, metres.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SURF, applyDiff, cellCentre, makeGrid, paintDisc, type Grid } from '../src/game/ext/course-grid';
import { CH_SIZE, CH_STEP, GREEN_MAX_SLOPE, courseSlopeAt, createCourseHeightField, evaluateCourseHeightQuality, sampleCourseHeight, type CourseHeightField } from '../src/game/ext/course-height';
import { greenPolygon, planChanges, planGeom, teePolygon, widthAt, type HolePlan } from '../src/game/ext/hole-plan';
import { decodePlans, newPlan } from '../src/game/ext/hole-wizard';
import { HOLE_GROUND, applyHoleGround, knotAt, rollKnots, shapeHoleGround, type HoleGroundInput } from '../src/game/ext/hole-ground';
import { landingSpots } from '../src/game/golf/holeframe';
import { EARTHWORK_PER_M3, SHAPE_RATE_M3 } from '../src/game/golf/costs';
import { captureHole } from '../src/game/golf/myholes';
import { PaintTool, type PaintHost } from '../src/game/paint-tool';

type P = { x: number; y: number };
/** a plan of hole n from tee to green (tiles, on the cell grid), its geometry, and the cells its Build lays on an empty grid */
function hole(tee: P, green: P, bends: P[] = [], n = 1, g: Grid = makeGrid(0, 0, 900, 1200)) {
  const plan = newPlan(n, { x: tee.x + 0.25, y: tee.y + 0.25 }, { x: green.x + 0.25, y: green.y + 0.25 }, bends);
  return { g, plan, geom: planGeom(plan), diff: planChanges(g, null, plan, n, 2) };
}
const PAR4 = () => hole({ x: 40, y: 120 }, { x: 230, y: 120 });
const DOGLEG5 = () => hole({ x: 40, y: 300 }, { x: 300, y: 330 }, [{ x: 180, y: 260 }]);
const PAR3 = () => hole({ x: 40, y: 500 }, { x: 110, y: 520 });
/** shapes the hole on a level field, lays its cells and its heights; returns the field and the shaping */
function shaped(h: ReturnType<typeof hole>, extra: Partial<HoleGroundInput> = {}) {
  const f = createCourseHeightField();
  const sh = shapeHoleGround({ grid: h.g, hole: h.plan.hole, plan: h.plan, geom: h.geom, diff: h.diff, field: f, ...extra });
  applyDiff(h.g, h.diff, false); applyHoleGround(f, sh);
  return { f, sh };
}
/** the cells of hole n (indices) with surface s (any surface: 0) */
const cellsOf = (g: Grid, n: number, s = 0) => { const out: number[] = []; for (let i = 0; i < g.hole.length; i++) if (g.hole[i] === n && g.surf[i] && (!s || g.surf[i] === s)) out.push(i); return out; };
/** the line sample nearest s m */
const atS = (geom: ReturnType<typeof planGeom>, s: number) => { let k = 0; while (k < geom.s.length - 1 && geom.s[k]! < s) k++; return k; };

test('the fairway rolls: crest to trough 0.3-0.8 m over runs of 20-40 m, never steeper than about 3%, and never periodic', () => {
  const R = HOLE_GROUND.roll;
  for (const seed of [1, 2, 3, 77, 12345, 0xdeadbeef]) {
    const k = rollKnots(seed, 600), runs = new Set<number>();
    for (let q = 1; q < k.s.length; q++) {
      const run = k.s[q]! - k.s[q - 1]!, swing = Math.abs(k.v[q]! - k.v[q - 1]!);
      assert.ok(run >= R.minLenM - 1e-9 && run <= R.maxLenM + 1e-9, `run ${run}`);
      assert.ok(swing >= R.minM - 1e-9 && swing <= R.maxM + 1e-9, `swing ${swing}`);
      assert.ok(swing <= R.grade * run + 1e-9, 'the swing fits its run');
      runs.add(Math.round(run * 1000));
    }
    assert.ok(runs.size >= k.s.length - 2, 'no two runs alike: never periodic');
    for (let s = -20; s < 620; s += 0.5) assert.ok(Math.abs(knotAt(k, s + 0.25) - knotAt(k, s - 0.25)) / 0.5 <= (Math.PI / 2) * R.grade + 1e-6, `smooth and gentle at ${s}`);
  }
  assert.notDeepEqual([...rollKnots(1, 300).v], [...rollKnots(2, 300).v], 'seeded per hole');
});

test('a shaped par 4: its fairway rolls, mounds of 0.5-1.5 m in its rough and a swale; the landing zone stays under 4%; seeded and repeatable', () => {
  const h = PAR4(), f0 = createCourseHeightField(), inp = { grid: h.g, hole: 1, plan: h.plan, geom: h.geom, diff: h.diff, field: f0 };
  const a = shapeHoleGround(inp), b = shapeHoleGround(inp);
  assert.deepEqual([...a.k], [...b.k]); assert.deepEqual([...a.after], [...b.after], 'the same plan shapes the same ground');
  const h2 = hole({ x: 40, y: 120 }, { x: 230, y: 120 }, [], 2), c = shapeHoleGround({ grid: h2.g, hole: 2, plan: h2.plan, geom: h2.geom, diff: h2.diff, field: f0 });
  assert.notDeepEqual([...c.after].slice(0, 400), [...a.after].slice(0, 400), 'another hole, another ground');
  const { f, sh } = shaped(h), { geom, plan, g } = h;
  // the features: mounds of 0.5-1.5 m beside the fairway and round the green, a swale by the green
  const mounds = sh.features.filter(q => q.kind === 'mound'), hollows = sh.features.filter(q => q.kind === 'hollow');
  assert.ok(mounds.length >= 4, `${mounds.length} mounds`); assert.ok(hollows.length >= 1, 'a swale');
  for (const m of mounds) assert.ok(m.h >= HOLE_GROUND.mound.minM && m.h <= HOLE_GROUND.mound.maxM, `mound ${m.h}`);
  for (const q of hollows) assert.ok(-q.h >= HOLE_GROUND.hollow.minM - 0.05 && -q.h <= HOLE_GROUND.hollow.maxM, `hollow ${q.h}`);
  // the rolls along the fairway: 0.3 m or more of relief, inside ±0.8 m
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < geom.line.length; i++) {
    const s = geom.s[i]!; if (s < plan.fwStart + 10 || s > geom.lengthM - geom.greenR - 25) continue;
    const v = sampleCourseHeight(f, geom.line[i]!.x, geom.line[i]!.y); lo = Math.min(lo, v); hi = Math.max(hi, v);
  }
  assert.ok(hi - lo >= 0.3, `relief ${(hi - lo).toFixed(2)} m`); assert.ok(hi <= 0.8 && lo >= -0.8, `${lo.toFixed(2)}..${hi.toFixed(2)}`);
  // the rough stands up in mounds (0.5 m and more) and dips in the swale; nothing past ±1.6 m
  let rHi = -Infinity, rLo = Infinity;
  for (const i of cellsOf(g, 1, SURF.rough)) { const p = cellCentre(g, i), v = sampleCourseHeight(f, p.x, p.y); rHi = Math.max(rHi, v); rLo = Math.min(rLo, v); }
  assert.ok(rHi >= 0.5 && rHi <= 1.6, `the rough's mounds rise ${rHi.toFixed(2)} m`); assert.ok(rLo <= -0.2 && rLo >= -1.2, `and dip ${rLo.toFixed(2)} m`);
  // the landing zones: no slope steeper than 4% over the fairway's middle (8 m in from its edges) within 40 m of each landing spot
  const spots = landingSpots(geom.lengthM, plan.widths);
  assert.ok(spots.length >= 1);
  let steep = 0;
  for (const s0 of spots) for (let s = s0 - 40; s <= s0 + 40; s += 2) {
    const k = atS(geom, s), p = geom.line[k]!, hw = widthAt(plan, s, geom) / 2 - 8;
    for (let d = -hw; d <= hw; d += 2) steep = Math.max(steep, courseSlopeAt(f, p.x + (geom.nx[k]! * d) / 2, p.y + (geom.ny[k]! * d) / 2).mag);
  }
  assert.ok(steep <= 0.04, `landing zones at most ${(steep * 100).toFixed(1)}%`);
  // and the price: the earth moved is the cut carried to the fills
  assert.ok(sh.m3 > 500 && Math.abs(sh.m3 - Math.max(sh.cut, sh.fill)) < 1e-6, `${Math.round(sh.m3)} m³`);
});

test('the tee stays level and the green tilts 1-2% up from front to back, inside the green slope and quality rules', () => {
  for (const make of [PAR3, PAR4, DOGLEG5]) {
    const h = make(), { f, sh } = shaped(h), { g, plan, geom } = h, line = geom.line;
    // the tee: every tee cell at one height, and no slope in its middle
    const tees = cellsOf(g, 1, SURF.tee).map(i => { const p = cellCentre(g, i); return sampleCourseHeight(f, p.x, p.y); });
    assert.ok(tees.length > 100 && Math.max(...tees) - Math.min(...tees) < 1e-5, `the tee is level (${(Math.max(...tees) - Math.min(...tees)).toExponential(1)} m)`);
    // its middle (the line runs a point a metre: the tee spans -2.5 m to 25.5 m along it) has no slope
    const mid = line[12]!; assert.ok(courseSlopeAt(f, mid.x, mid.y).mag < 1e-5, `flat across its middle (${courseSlopeAt(f, mid.x, mid.y).mag})`);
    // the green: its tilt 1-2%, one plane over its middle, nowhere on it steeper than 2.5%
    assert.ok(sh.tilt >= HOLE_GROUND.green.tiltMin && sh.tilt <= HOLE_GROUND.green.tiltMax, `tilt ${sh.tilt}`);
    const pin = plan.green, back = line[Math.max(0, line.length - 41)]!, al = Math.hypot(pin.x - back.x, pin.y - back.y), ax = (pin.x - back.x) / al, ay = (pin.y - back.y) / al;
    const rT = geom.greenR / 2;
    for (const [u, v] of [[0, 0], [0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]] as const) {
      const x = pin.x + (ax * u - ay * v) * rT, y = pin.y + (ay * u + ax * v) * rT, m = courseSlopeAt(f, x, y).mag;
      assert.ok(Math.abs(m - sh.tilt) < 1e-3, `one plane: ${m.toFixed(4)} vs ${sh.tilt.toFixed(4)}`);
    }
    let gMax = 0; for (const i of cellsOf(g, 1, SURF.green)) { const p = cellCentre(g, i); gMax = Math.max(gMax, courseSlopeAt(f, p.x, p.y).mag); }
    assert.ok(gMax <= 0.025, `the green at most ${(gMax * 100).toFixed(2)}%`);
    const front = sampleCourseHeight(f, pin.x - ax * rT * 1.4, pin.y - ay * rT * 1.4), rear = sampleCourseHeight(f, pin.x + ax * rT * 1.4, pin.y + ay * rT * 1.4);
    assert.ok(rear - front >= 0.01 * rT * 2.8 * 2 * 0.95, `front low (${front.toFixed(2)}), back high (${rear.toFixed(2)})`);
    // the quality rules: no green steeper than GREEN_MAX_SLOPE at its edge, and the shaped hole earns the contour bonus
    const flat = (pts: P[]) => pts.flatMap(p => [p.x, p.y]);
    const q = evaluateCourseHeightQuality(f, [{ hole: 1, surface: 'green', pts: flat(greenPolygon(plan)) }, { hole: 1, surface: 'tee', pts: flat(teePolygon(line)) }, { hole: 1, surface: 'fairway', pts: flat(line.filter((_, k) => k % 40 === 0)) }]);
    assert.deepEqual(q.steepGreenHoles, [], `under ${GREEN_MAX_SLOPE * 100}% at the green's edge`); assert.ok(q.bonusPoints >= 1, 'the contours count');
  }
});

test("the edges blend out round the hole over the land's and the property's grass, and never touch another hole, water, the property's built surfaces, a road or cart path, the practice area or land you do not own", () => {
  const g = makeGrid(0, 0, 900, 1200);
  paintDisc(g, 120, 142, 5, SURF.rough, 2, 0); // hole 2's rough just off hole 1's corridor (it ends 15 tiles off the line, y 135)
  paintDisc(g, 70, 101, 3, SURF.green, 0, 0); // the property's putting green
  paintDisc(g, 100, 128, 2, SURF.water, 0, 0); // a pond in the hole's rough
  paintDisc(g, 110, 104, 3, SURF.fescue, 0, 0); // the property's fescue at the corridor's edge: ground, the edge blends over it
  const h = hole({ x: 40, y: 120 }, { x: 230, y: 120 }, [], 1, g);
  const path = { ax: 150, ay: 95, bx: 150, by: 146, halfWidthTiles: 1.5 }; // a cart path across the hole
  const practice = (x: number, y: number) => x >= 196 && x < 214 && y >= 98 && y < 106, owned = (_x: number, y: number) => y > 96;
  const { f, sh } = shaped(h, { roads: [path], practice, owned });
  assert.ok(sh.k.length > 500, 'the hole is shaped');
  // every tile of what is kept: exactly as it was (level)
  const kept: P[] = [];
  const base = (i: number) => !g.hole[i] && (g.surf[i] === SURF.rough || g.surf[i] === SURF.longGrass || g.surf[i] === SURF.fescue);
  for (let i = 0; i < g.surf.length; i++) if (g.surf[i] && ((g.hole[i] !== 1 && !base(i)) || g.surf[i] === SURF.water)) kept.push(cellCentre(g, i));
  for (let y = 90; y <= 150; y += 0.5) for (let x = 140; x <= 160; x += 0.5) if (Math.abs(x - 150) < 1.5 + 2 && y >= 95 && y <= 146) kept.push({ x, y });
  for (let y = 98; y < 106; y += 0.5) for (let x = 196; x < 214; x += 0.5) kept.push({ x, y });
  for (let y = 80; y <= 96; y += 0.5) for (let x = 20; x <= 260; x += 1) kept.push({ x, y });
  let worst = 0; for (const p of kept) worst = Math.max(worst, Math.abs(sampleCourseHeight(f, p.x, p.y)));
  assert.equal(worst, 0, `${kept.length} kept points stay level`);
  let fescue = 0; for (let i = 0; i < g.surf.length; i++) if (base(i)) { const p = cellCentre(g, i); fescue = Math.max(fescue, Math.abs(sampleCourseHeight(f, p.x, p.y))); }
  assert.ok(fescue > 0.01, "the edge blends over the property's fescue");
  // the shaping reaches at most 3 samples (6 tiles) past the hole's cells: nothing changes farther out
  const mine = cellsOf(g, 1).map(i => cellCentre(g, i)), near = new Set<number>();
  for (const p of mine) { const i = Math.floor(p.x / CH_STEP), j = Math.floor(p.y / CH_STEP); for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) near.add((j + dj) * CH_SIZE + i + di); }
  for (const k of sh.k) assert.ok(near.has(k), `sample ${k} lies within reach of the hole`);
});

// ---------- the Build (paint-tool): priced, one undo step, Shape the ground, Edit Hole Layout, My holes ----------
const PX = 16;
/** a stand-in golf game with a height field: land at x < 400 */
function game(money = 5_000_000) {
  const g = makeGrid(0, 0, 900, 1200), f: CourseHeightField = createCourseHeightField();
  const st = { money, plans: [] as unknown[], toasts: [] as string[], changed: 0 };
  const host: PaintHost = {
    setLotGround() {}, emit() {}, save() {}, toast: t => { st.toasts.push(t); }, affine: o => { o[0] = 0; o[1] = 0; o[2] = PX; o[3] = 0; o[4] = 0; o[5] = PX; },
    placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [],
    golfMode: () => true, currentMonth: () => 2, money: () => st.money, spend: n => { st.money -= n; },
    grid: () => g, gridChanged() {}, changed: () => {},
    ownedAt: x => x < 400, landAt: x => x < 400, landWhy: x => (x < 400 ? '' : 'off'),
    plans: () => st.plans, setPlans: p => { st.plans = p; },
    courseHeight: () => f, heightChanged: () => { st.changed++; },
    journal: { begin: () => {}, end: () => null, undo: j => j, redo: j => j },
  };
  const tool = new PaintTool(host);
  tool.enterCourse();
  const down = (x: number, y: number) => { tool.pointerDown({ x, y }, x * PX, y * PX); tool.pointerUp(0.5); };
  const plan = (tx: number, ty: number, gx: number, gy: number) => { tool.setPlan(); down(tx, ty); down(gx, gy); };
  return { g, f, st, tool, down, plan, host };
}
const diffs = (a: Float32Array, b: Float32Array) => { let n = 0; for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) n++; return n; };

test("New hole's Build shapes the ground in its own undo step, priced with the grass; Undo puts every height back exactly, Redo lays it again", () => {
  const { f, st, tool, plan } = game();
  tool.setShapeGround(true);
  plan(40, 120, 230, 120);
  const gh = tool.wizard.ghost()!, e = tool.groundCost()!;
  assert.ok(e && e.m3 > 500, 'the earthworks are worked out before the Build'); assert.equal(e.cost, Math.round(e.m3 * SHAPE_RATE_M3), 'at the shaping rate: built with the hole');
  assert.equal(SHAPE_RATE_M3 * 3, EARTHWORK_PER_M3, "a third of the Ground height brush's rework rate");
  assert.equal(tool.groundShape(), tool.groundShape(), 'once a ghost');
  const before = f.data.slice(), money = st.money;
  assert.ok(tool.buildPlan());
  assert.equal(money - st.money, gh.cost + e.cost, 'the Build charges the grass and the earthworks (the pill\'s price)');
  assert.match(st.toasts.at(-1)!, /ground shaped, [\d,]+ m³ \(\$[\d,]+\)/);
  assert.ok(st.changed >= 1, 'the ground re-bakes');
  const after = f.data.slice();
  assert.ok(diffs(before, after) > 500, 'the heights changed');
  assert.equal(tool.undoLabel, 'build hole 1');
  tool.undo();
  assert.equal(diffs(before, f.data), 0, 'Undo restores the field exactly'); assert.equal(st.money, money, 'and refunds it all');
  tool.redo();
  assert.equal(diffs(after, f.data), 0, 'Redo lays the same ground'); assert.equal(money - st.money, gh.cost + e.cost);
});

test('Shape the ground off: the Build lays the hole on the ground as it is; the choice is remembered', () => {
  const mem = new Map<string, string>(), g0 = globalThis as { localStorage?: unknown };
  const had = g0.localStorage;
  g0.localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
  try {
    const { f, st, tool, plan, host } = game();
    assert.equal(tool.shapeGround, true, 'on by default');
    tool.setShapeGround(false);
    assert.equal(mem.get('capitalempire.shapeGround'), '0');
    assert.equal(new PaintTool(host).shapeGround, false, 'remembered');
    plan(40, 120, 230, 120);
    assert.equal(tool.groundCost(), null, 'no earthworks');
    const gh = tool.wizard.ghost()!, money = st.money;
    assert.ok(tool.buildPlan());
    assert.equal(diffs(createCourseHeightField().data, f.data), 0, 'level as it was'); assert.equal(money - st.money, gh.cost, 'the grass alone');
    tool.setShapeGround(true); assert.equal(new PaintTool(host).shapeGround, true);
  } finally { if (had === undefined) delete g0.localStorage; else g0.localStorage = had; }
});

test('not enough money for the earthworks too: the Build lays the hole on the ground as it is, and says so', () => {
  const { f, st, tool, plan } = game();
  plan(40, 120, 230, 120);
  const gh = tool.wizard.ghost()!, e = tool.groundCost()!;
  st.money = gh.cost + Math.floor(e.cost / 2);
  assert.ok(tool.buildPlan());
  assert.equal(diffs(createCourseHeightField().data, f.data), 0, 'no height changed'); assert.equal(st.money, Math.floor(e.cost / 2), 'the grass paid for');
  assert.match(st.toasts.at(-1)!, /not enough money to shape the ground/);
});

test('Edit Hole Layout never reshapes the ground', () => {
  const { f, tool, plan } = game();
  plan(40, 120, 230, 120); assert.ok(tool.buildPlan());
  const before = f.data.slice();
  assert.ok(diffs(createCourseHeightField().data, before) > 500, 'hole 1 is shaped');
  assert.ok(tool.editPlan(1));
  assert.equal(tool.groundCost(), null, 'Edit Hole Layout prices no earthworks');
  const gr = tool.wizard.handles().find(q => q.k === 'green')!;
  tool.pointerDown(gr, gr.x * PX, gr.y * PX); tool.pointerMove({ x: gr.x + 10, y: gr.y + 6 }, (gr.x + 10) * PX, (gr.y + 6) * PX); tool.pointerUp(0.5);
  assert.ok(tool.buildPlan(), 'the layout moves');
  assert.equal(diffs(before, f.data), 0, 'every height as it was');
});

test('a saved hole (My holes) carries its shaping and places it again, priced as earthworks; Undo takes it back exactly', () => {
  const { g, f, st, tool, plan } = game();
  plan(40, 120, 230, 120); assert.ok(tool.buildPlan());
  const pl = decodePlans(st.plans)[0]! as HolePlan, moved: number[] = [];
  for (let k = 0; k < f.data.length; k++) if (Math.abs(f.data[k]!) >= 0.005) moved.push(k);
  const h = captureHole(1, { grid: g, plan: pl, tee: pl.tee, pin: pl.green, field: f, name: 'Rolling four' })!;
  assert.equal(h.heights!.length / 3, moved.length, 'every shaped sample is saved with it');
  tool.setMyHole(h);
  const gh = tool.myHoleGhost({ x: 40, y: 500 })!, earth = gh.placed.heights.reduce((a, q) => a + Math.max(0, q.h), 0), sunk = gh.placed.heights.reduce((a, q) => a + Math.max(0, -q.h), 0);
  assert.equal(gh.placed.heights.length, moved.length);
  const before = f.data.slice(), money = st.money;
  tool.pointerMove({ x: 40, y: 500 }, 40 * PX, 500 * PX); tool.pointerDown({ x: 40, y: 500 }, 40 * PX, 500 * PX); tool.pointerUp(0.5);
  for (const q of gh.placed.heights) assert.equal(f.data[q.k], Math.fround(q.h), 'its ground, placed again');
  assert.equal(money - st.money, gh.cost, 'charged the ghost\'s price');
  assert.ok(gh.cost >= Math.round(Math.max(earth, sunk) * 16 * SHAPE_RATE_M3), 'which takes in its earthworks');
  tool.undo();
  assert.equal(diffs(before, f.data), 0, 'Undo restores the field exactly');
});
