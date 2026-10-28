/** T256 (#743): paint your property apart from holes; each hole and practice facility owns its paint and its looks; delete a hole with its
 *  paint or keep the paint; save a hole with its paint and looks to My holes. Pure, Node: the Paint tool with a stand-in golf host, the
 *  course grid, the chunk patches' owner looks and My holes. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SURF, cellAt, holeCellsDiff, makeGrid, paintDisc, type Grid } from '../src/game/ext/course-grid';
import { cellShares, coursePatch, stripeAreas, type CourseLooks } from '../src/game/ext/course-grid/patch';
import { aimsFromPlans, decodePlans } from '../src/game/ext/hole-wizard';
import { greenPolygon } from '../src/game/ext/hole-plan';
import { createCourseHeightField } from '../src/game/ext/course-height';
import { PaintTool, type PaintHost } from '../src/game/paint-tool';
import { BRUSH_PRESETS, type BrushKind } from '../src/game/paint';
import { courseLookSet, type LookStyle } from '../src/game/course-look';
import { holeOwner, lookWhat, normalizeBook, seedOwner, type LookBook } from '../src/game/golf/looks';
import { captureHole, facingOf, normalizeMyHoles, placeMyHole, turn } from '../src/game/golf/myholes';
import { normalizeGolfSave, type GolfSave } from '../src/game/golf/mode';
import type { AimPoint } from '../src/game/golf/types';

const PX = 16;
/** a stand-in golf game: the grid, money, plans, the looks book, a facility in hand; land at x < 400; the range's plot at 300 <= x < 400,
 *  y >= 500 (ownedAt keeps the holes off it, landAt lets Range › Build paint it) */
function game() {
  const g = makeGrid(0, 0, 900, 1200);
  const st = { money: 5_000_000, plans: [] as unknown[], aims: [] as AimPoint[], spent: 0, toasts: [] as string[], book: {} as LookBook, facility: null as 'putting' | 'chipping' | null, changed: [] as string[], journal: 0 };
  const range = (x: number, y: number) => x >= 300 && x < 400 && y >= 500;
  const host: PaintHost = {
    setLotGround() {}, emit() {}, save() {}, toast: t => { st.toasts.push(t); }, affine: o => { o[0] = 0; o[1] = 0; o[2] = PX; o[3] = 0; o[4] = 0; o[5] = PX; },
    placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [],
    golfMode: () => true, currentMonth: () => 2, money: () => st.money, spend: n => { st.money -= n; st.spent += n; },
    grid: () => g, gridChanged() {}, changed: () => {},
    ownedAt: (x, y) => x < 400 && !range(x, y), landAt: x => x < 400, landWhy: (x, y) => (range(x, y) ? 'range' : x < 400 ? '' : 'off'),
    plans: () => st.plans, setPlans: p => { const before = decodePlans(st.plans); st.plans = p; st.aims = aimsFromPlans(st.aims, before, decodePlans(p)); },
    lookBook: () => st.book, facility: () => st.facility, lookChanged: o => { st.changed.push(o); },
    journal: { begin: () => { st.journal++; }, end: () => null, undo: j => j, redo: j => j },
  };
  const tool = new PaintTool(host);
  tool.enterCourse();
  const at = (x: number, y: number) => [g.surf[cellAt(g, x, y)], g.hole[cellAt(g, x, y)]];
  const down = (x: number, y: number) => { tool.pointerDown({ x, y }, x * PX, y * PX); tool.pointerUp(0.5); };
  /** a brush dab at (x, y) (the square brush, 4 cells) */
  const dab = (x: number, y: number) => { tool.pointerMove({ x, y }, x * PX, y * PX); down(x, y); };
  /** New hole: tee at (tx, ty), green at (gx, gy), Build */
  const build = (tx: number, ty: number, gx: number, gy: number) => { tool.setPlan(); down(tx, ty); down(gx, gy); assert.ok(tool.buildPlan(), 'built'); };
  return { g, st, tool, at, down, dab, build };
}
/** the cells of hole n (indices) */
const cellsOf = (g: Grid, n: number) => { const out: number[] = []; for (let i = 0; i < g.hole.length; i++) if (g.hole[i] === n && g.surf[i]) out.push(i); return out; };

test('property paint (Range › Build) lays cells of no hole on your land, the range plot too, never a hole\'s; hole edits and deletes never touch it', () => {
  const { g, st, tool, at, dab, build } = game();
  build(40, 120, 230, 120);
  // Range › Build: fairway on the practice area and the range's plot (hole 0); never over hole 1's cells; never off your land
  tool.setProperty(true, 'fairway'); tool.setBrushCells(4);
  assert.equal(tool.brushHole, 0); assert.equal(tool.lookOwner, 'property');
  dab(100, 300); dab(350, 550);
  assert.deepEqual(at(100.25, 300.25), [SURF.fairway, 0], 'the property painted');
  assert.deepEqual(at(350.25, 550.25), [SURF.fairway, 0], "Range › Build paints the range's plot");
  const h1 = cellsOf(g, 1).length, holeCell = cellsOf(g, 1).find(i => g.surf[i] === SURF.rough)!;
  const hc = { x: g.x0 + ((holeCell % g.w) + 0.5) * 0.5, y: g.y0 + (Math.floor(holeCell / g.w) + 0.5) * 0.5 };
  tool.setBrush('bunker'); dab(hc.x, hc.y);
  assert.equal(g.hole[holeCell], 1, "the property's brush never takes a hole's cell"); assert.equal(cellsOf(g, 1).length, h1);
  assert.match(tool.brushSkipWhy()!(hc.x, hc.y), /Hole 1's/, 'the footprint says why');
  dab(420, 300); assert.deepEqual(at(420.25, 300.25), [SURF.none, 0], 'off your land: refused');
  // Erase in Range › Build rubs out the property's cells only
  tool.setBrush('fairway'); tool.rubOut = true; dab(hc.x, hc.y); tool.rubOut = false;
  assert.equal(g.hole[holeCell], 1, "Erase leaves the hole's cell");
  const prop = g.surf.slice(), propHole = g.hole.slice(), keep = (i: number) => !propHole[i] && prop[i];
  // the hole brush: the cursor says which
  tool.setProperty(false); assert.equal(tool.brushHole, 1); assert.equal(tool.lookOwner, 'h1');
  // an edit of hole 1 (its plan moved and built again), then its deletion: the property's cells stay as they were
  assert.ok(tool.editPlan(1));
  const gr = tool.wizard.handles().find(h => h.k === 'green')!;
  tool.pointerDown(gr, gr.x * PX, gr.y * PX); tool.pointerMove({ x: gr.x + 8, y: gr.y - 3 }, (gr.x + 8) * PX, (gr.y - 3) * PX); tool.pointerUp(0.5);
  assert.ok(tool.buildPlan(), 'hole 1 edited');
  assert.ok(tool.deleteHole(1, false));
  for (let i = 0; i < g.surf.length; i++) if (keep(i)) { assert.equal(g.surf[i], prop[i], `property cell ${i} kept`); assert.equal(g.hole[i], 0); }
  assert.equal(cellsOf(g, 1).length, 0, 'hole 1 is gone');
  assert.ok(st.toasts.some(t => /Hole 1 deleted/.test(t)));
});

test("delete with its grass clears exactly the hole's cells (touch-ups included) with its plan and looks, as one undo step; keep the grass leaves them as the property's", () => {
  const { g, st, tool, build } = game();
  build(40, 120, 230, 120); build(40, 300, 230, 300);
  // a touch-up of hole 1 with the brush, outside its plan, and some property paint beside it
  tool.setHole(1); tool.setBrush('bunker');
  paintDisc(g, 60, 150, 2, SURF.bunker, 1, 0);
  paintDisc(g, 60, 170, 2, SURF.waste, 0, 0);
  const before = { s: g.surf.slice(), h: g.hole.slice(), m: g.month.slice() }, mine = new Set(cellsOf(g, 1));
  assert.ok(st.book.h1 && st.book.h2, 'each built hole has its own looks');
  let extra = 0;
  assert.ok(tool.deleteHole(1, false, () => { extra++; }));
  assert.equal(extra, 1, 'the frame trees go in the same step (the engine removes them there)');
  for (let i = 0; i < g.surf.length; i++) {
    if (mine.has(i)) { assert.equal(g.surf[i], SURF.none, `cell ${i} cleared`); assert.equal(g.hole[i], 0); }
    else { assert.equal(g.surf[i], before.s[i], `cell ${i} untouched`); assert.equal(g.hole[i], before.h[i]); }
  }
  assert.equal(g.surf[cellAt(g, 60, 150)], SURF.none, 'the touch-up went too');
  assert.equal(g.surf[cellAt(g, 60, 170)], SURF.waste, "the property's paint stayed");
  assert.equal(decodePlans(st.plans).map(p => p.hole).join(), '2', 'its plan went'); assert.equal(st.book.h1, undefined, 'its looks went');
  tool.undo();
  assert.deepEqual([...g.surf], [...before.s], 'one undo brings it all back'); assert.deepEqual([...g.hole], [...before.h]);
  assert.equal(decodePlans(st.plans).length, 2); assert.ok(st.book.h1, 'its looks too');
  // keep the grass: the same cells, of no hole
  assert.ok(tool.deleteHole(1, true));
  for (const i of mine) { assert.equal(g.surf[i], before.s[i], 'the grass stays'); assert.equal(g.hole[i], 0, "as the property's"); assert.equal(g.month[i], before.m[i]); }
  assert.equal(cellsOf(g, 2).length, [...before.h].filter((h, i) => h === 2 && before.s[i]).length, 'hole 2 untouched');
});

test('holeCellsDiff: only the cells of the hole; keep moves them to no hole with their surface and month', () => {
  const g = makeGrid(0, 0, 40, 40);
  paintDisc(g, 5, 5, 2, SURF.fairway, 3, 7); paintDisc(g, 12, 5, 2, SURF.green, 4, 0); paintDisc(g, 5, 12, 2, SURF.rough, 0, 0);
  const n3 = cellsOf(g, 3).length, d = holeCellsDiff(g, 3, false), k = holeCellsDiff(g, 3, true);
  assert.equal(d.n, n3); assert.ok([...d.h0].every(h => h === 3)); assert.ok([...d.s1].every(s => s === SURF.none));
  assert.ok([...k.s1].every(s => s === SURF.fairway)); assert.ok([...k.h1].every(h => h === 0)); assert.ok([...k.m1].every(m => m === 7));
});

test('a look belongs to its owner: editing hole 3\'s bunker leaves hole 7, the property, the facilities and the default alone; only hole 3 is drawn again', () => {
  const { st, tool } = game();
  for (const o of ['h3', 'h7', 'property', 'putting']) seedOwner(st.book, o, k => tool.brush[k].style);
  const dflt = tool.brush.bunker.style.tex;
  tool.setHole(3); tool.setBrush('bunker');
  assert.equal(tool.lookOwner, 'h3'); assert.equal(lookWhat('bunker', tool.lookOwner), 'Bunkers on hole 3');
  tool.setStyle({ tex: 'dirt' });
  assert.equal(st.book.h3!.bunker!.tex, 'dirt');
  assert.equal(st.book.h7!.bunker!.tex, dflt, 'hole 7 keeps its own'); assert.equal(st.book.property!.bunker!.tex, dflt); assert.equal(st.book.putting!.bunker!.tex, dflt);
  assert.equal(tool.brush.bunker.style.tex, dflt, 'the course default is untouched');
  assert.deepEqual(st.changed, ['h3'], 'only hole 3 is drawn again');
  assert.equal(tool.brushLooks.bunker!.style.tex, 'dirt', "the cursor's puck wears hole 3's look");
  tool.setHole(7); assert.equal(tool.style.tex, dflt, "picking hole 7 shows its own look");
  // Edit hole edits the hole it has open
  assert.equal(lookWhat('bunker', 'default'), 'Course default (new holes)');
});

test('"Apply to all holes" gives every hole (and the default) the look; the property and the facilities keep theirs', () => {
  const { st, tool } = game();
  for (const o of ['h1', 'h2', 'h5', 'property', 'chipping']) seedOwner(st.book, o, k => tool.brush[k].style);
  const prop = st.book.property!.green!.tex;
  tool.setHole(2); tool.setBrush('green'); tool.setStyle({ tex: 'dirt' });
  assert.deepEqual(tool.applyLookToAll('green'), [1, 2, 5]);
  for (const o of ['h1', 'h2', 'h5']) assert.equal(st.book[o]!.green!.tex, 'dirt', o);
  assert.equal(tool.brush.green.style.tex, 'dirt', 'new holes start with it');
  assert.equal(st.book.property!.green!.tex, prop); assert.equal(st.book.chipping!.green!.tex, prop);
});

test("the property's and a facility's looks are their own; My looks' Course default edits the default only; a new hole starts from the default", () => {
  const { st, tool, build } = game();
  tool.setProperty(true, 'bunker');
  tool.setStyle({ tex: 'dirt' });
  assert.equal(st.book.property!.bunker!.tex, 'dirt'); assert.equal(lookWhat('bunker', tool.lookOwner), 'Bunkers on your property');
  st.facility = 'chipping'; tool.pickLook('bunker');
  assert.equal(tool.lookOwner, 'chipping'); assert.equal(lookWhat('bunker', 'chipping'), 'Bunkers on the chipping green');
  tool.setStyle({ tex: 'gravel' });
  assert.equal(st.book.chipping!.bunker!.tex, 'gravel'); assert.equal(st.book.property!.bunker!.tex, 'dirt', "the property's stays");
  st.facility = null; tool.setProperty(false);
  // the course default: a hole built after it starts from it, the holes before keep theirs
  build(40, 120, 230, 120);
  const h1 = st.book.h1!.fairway!.tex;
  tool.setLookDefault(true); tool.setBrush('fairway'); tool.setStyle({ tex: 'dirt' });
  assert.equal(tool.brush.fairway.style.tex, 'dirt'); assert.equal(st.book.h1!.fairway!.tex, h1, 'hole 1 keeps its own');
  tool.setLookDefault(false);
  build(40, 300, 230, 300);
  assert.equal(st.book.h2!.fairway!.tex, 'dirt', 'hole 2 starts from the default');
});

/** a course grid with a bunker of hole 1 and one of hole 2 side by side in one chunk */
function twoBunkers() {
  const g = makeGrid(0, 0, 256, 256);
  paintDisc(g, 20, 30, 6, SURF.fairway, 1, 0); paintDisc(g, 20, 30, 3, SURF.bunker, 1, 0);
  paintDisc(g, 44, 30, 6, SURF.fairway, 2, 0); paintDisc(g, 44, 30, 3, SURF.bunker, 2, 0);
  return g;
}
const pre = (_s: string, old: string) => ({ tex: old, sc: 1, a: 0 });
function looksOf(b: Partial<Record<BrushKind, { style: LookStyle }>>): CourseLooks { const s = courseLookSet(b, pre); return { surf: s.surf, collar: s.collar, band: s.band, ...(s.lipGrass ? { lipGrass: s.lipGrass } : {}), ...(s.round ? { round: s.round } : {}) }; }
const dflt = Object.fromEntries(BRUSH_PRESETS.map(p => [p.kind, { style: p.style }])) as Partial<Record<BrushKind, { style: LookStyle }>>;

test('the chunks wear each owner\'s look: two holes\' bunkers in one chunk in two sands; owners alike lay exactly as before (old saves unchanged)', () => {
  const g = twoBunkers(), base = looksOf(dflt), plain = coursePatch(g, 0, 0, base, 0);
  // every owner wearing the default: the very same patch
  const same = courseLookSet(dflt, pre), alike = coursePatch(g, 0, 0, { ...base, own: { looks: [same], hole: [0, 0, 0] } }, 0);
  assert.deepEqual(alike, plain, 'owners that look as the default change nothing');
  // hole 2's bunkers in another sand: the bunker layer keeps one and lays the other over its share
  const h2 = courseLookSet({ ...dflt, bunker: { style: { ...dflt.bunker!.style, tex: 'dirt' } } }, pre);
  const p = coursePatch(g, 0, 0, { ...base, own: { looks: [h2], hole: [-1, -1, 0] } }, 0)!;
  const bunker = p.course!.layers.find(l => l.s === SURF.bunker)!, fair = p.course!.layers.find(l => l.s === SURF.fairway)!;
  assert.equal(bunker.alts?.length, 1, 'one alternate look');
  assert.deepEqual(new Set([bunker.tex, bunker.alts![0]!.look.tex]), new Set([base.surf[SURF.bunker]!.tex, 'dirt']), 'both sands');
  const runs = bunker.alts![0]!.runs, inRuns = (x: number, y: number) => { for (let k = 0; k + 3 < runs.length; k += 4) if (x >= runs[k]! && x < runs[k + 2]! && y >= runs[k + 1]! && y < runs[k + 3]!) return true; return false; };
  const altIs2 = bunker.alts![0]!.look.tex === 'dirt';
  assert.equal(inRuns(44, 30), altIs2, "hole 2's bunker is in its share"); assert.equal(inRuns(20, 30), !altIs2, "hole 1's is not");
  assert.equal(fair.alts, undefined, 'the fairways look alike: no alternates');
  // only hole 2's cells in a chunk: its look is the layer's own, no alternates
  const g2 = makeGrid(0, 0, 256, 256); paintDisc(g2, 44, 30, 3, SURF.bunker, 2, 0);
  const q = coursePatch(g2, 0, 0, { ...base, own: { looks: [h2], hole: [-1, -1, 0] } }, 0)!.course!.layers.find(l => l.s === SURF.bunker)!;
  assert.equal(q.tex, 'dirt'); assert.equal(q.alts, undefined);
});

test('a facility\'s zone gives the cells of no hole in it the facility\'s look', () => {
  const g = makeGrid(0, 0, 256, 256); paintDisc(g, 20, 30, 3, SURF.green, 0, 0); paintDisc(g, 44, 30, 3, SURF.green, 0, 0);
  const base = looksOf(dflt), put = courseLookSet({ ...dflt, green: { style: { ...dflt.green!.style, tex: 'dirt' } } }, pre);
  const l = coursePatch(g, 0, 0, { ...base, own: { looks: [put], hole: [-1], zones: [0, 38, 24, 50, 36] } }, 0)!.course!.layers.find(q => q.s === SURF.green)!;
  assert.equal(l.alts?.length, 1); assert.ok([l.tex, l.alts![0]!.look.tex].includes('dirt'));
});

test('cellShares is T218\'s walk: stripeAreas gives the same shares through it', () => {
  const g = twoBunkers(), lines = new Map([[1, [10, 30, 30, 30]], [2, [34, 30, 54, 30]]]);
  const st = stripeAreas(g, 0, 0, lines)!, sh = cellShares(g, 0, 0, SURF.fairway, c => g.hole[c]!)!;
  assert.deepEqual(st.map(s => s.hole), sh.labels); assert.deepEqual(st.map(s => [...s.runs!]), sh.runs!.map(r => [...r]));
  assert.deepEqual(cellShares(g, 0, 0, SURF.fairway, () => 0), { labels: [0] }, 'one label: the whole chunk');
});

test('My holes: saving and placing a hole round-trips its cells, plan, heights and looks, turned or not', () => {
  const { g, st, tool, build } = game();
  build(40, 120, 230, 120);
  const f = createCourseHeightField(); f.data[60 * 1024 + 30] = 1.25; f.data[61 * 1024 + 31] = -0.5;
  tool.setHole(1); tool.setBrush('bunker'); tool.setStyle({ tex: 'dirt' });
  const plan = decodePlans(st.plans)[0]!;
  const h = captureHole(1, { grid: g, plan, tee: plan.tee, pin: plan.green, field: f, looks: st.book.h1, frame: [{ id: 'tree-a', x: plan.tee.x + 4, y: plan.tee.y + 6, flip: false, scale: 1 }], name: 'Long one', par: 4, m: 380 })!;
  assert.ok(h); assert.equal(h.facing, facingOf(plan.green.x - plan.tee.x, plan.green.y - plan.tee.y));
  assert.equal(h.cells.length / 3, cellsOf(g, 1).length, 'every cell of the hole'); assert.equal(h.looks!.bunker!.tex, 'dirt');
  assert.equal(h.heights!.length / 3, 2, 'its ground height edits'); assert.equal(h.props.length, 1);
  assert.deepEqual(normalizeMyHoles(JSON.parse(JSON.stringify([h]))), [h], 'it survives a save');
  // placed as it was saved, elsewhere: the same surfaces at the same offsets from the tee
  const g2 = makeGrid(0, 0, 900, 1200), tcx = Math.floor(plan.tee.x / 0.5), tcy = Math.floor(plan.tee.y / 0.5);
  for (const dq of [0, 1]) {
    const q = (h.facing + dq) % 4, P = placeMyHole(h, g2, tcx, tcy + 400, q, 4);
    assert.equal(P.cells.length, h.cells.length / 3);
    const src = new Map<number, number>(); for (const i of cellsOf(g, 1)) src.set(i, g.surf[i]!);
    for (const c of P.cells) {
      const cx = c.i % g2.w, cy = (c.i - cx) / g2.w, [a, b] = turn(cx - tcx, cy - tcy - 400, 4 - dq), i = (tcy + b) * g.w + tcx + a;
      assert.equal(src.get(i), c.s, `cell ${c.i}`);
    }
    // its plan moves and turns with it: the green's outline is the old one turned
    const p2 = P.plan!, [gx, gy] = turn(plan.green.x - (tcx + 0.5) * 0.5, plan.green.y - (tcy + 0.5) * 0.5, dq);
    assert.equal(p2.hole, 4); assert.ok(Math.abs(p2.green.x - ((tcx + 0.5) * 0.5 + gx)) < 1e-6 && Math.abs(p2.green.y - ((tcy + 400 + 0.5) * 0.5 + gy)) < 1e-6, 'the green');
    const c0 = centroid(greenPolygon(plan)), c1 = centroid(greenPolygon(p2)), [ex, ey] = turn(c0.x - plan.green.x, c0.y - plan.green.y, dq);
    assert.ok(Math.abs(c1.x - p2.green.x - ex) < 0.3 && Math.abs(c1.y - p2.green.y - ey) < 0.3, `the green's shape turns with it (${dq})`);
    assert.equal(P.heights.length, 2); assert.ok(P.heights.some(q2 => q2.h === 1.25) && P.heights.some(q2 => q2.h === -0.5));
  }
});
const centroid = (pts: { x: number; y: number }[]) => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });

test('From My holes: a saved hole placed with the Paint tool becomes the next free hole with its cells, plan and looks, priced, as one undo step', () => {
  const { g, st, tool, build } = game();
  build(40, 120, 230, 120);
  tool.setHole(1); tool.setBrush('bunker'); tool.setStyle({ tex: 'dirt' });
  const plan = decodePlans(st.plans)[0]!, h = captureHole(1, { grid: g, plan, tee: plan.tee, pin: plan.green, looks: st.book.h1, name: 'Copy' })!;
  tool.setMyHole(h); assert.equal(tool.mode, 'myhole');
  const gh = tool.myHoleGhost({ x: 40, y: 500 })!;
  assert.equal(gh.n, 2); assert.equal(gh.why, ''); assert.ok(gh.cost > 0, 'priced as New hole');
  const money = st.money;
  tool.pointerMove({ x: 40, y: 500 }, 40 * PX, 500 * PX); tool.pointerDown({ x: 40, y: 500 }, 40 * PX, 500 * PX); tool.pointerUp(0.5);
  assert.equal(cellsOf(g, 2).length, h.cells.length / 3, 'its cells as hole 2');
  assert.equal(money - st.money, gh.cost, 'charged its price');
  assert.deepEqual(decodePlans(st.plans).map(p => p.hole).sort(), [1, 2], 'with its plan');
  assert.equal(st.book.h2!.bunker!.tex, 'dirt', 'and its looks');
  tool.undo();
  assert.equal(cellsOf(g, 2).length, 0); assert.equal(st.book.h2, undefined); assert.equal(decodePlans(st.plans).length, 1);
  // over another hole: refused cells are left out (too many: refused)
  tool.setMyHole(h); assert.match(tool.myHoleGhost({ x: 40, y: 120 })!.why, /Hole 1 is there|left out/);
});

test('old saves: a save with no looks or My holes loads as it was; a bad book entry is dropped', () => {
  const s = { v: 1, tier: 1, rep: 0, town: { x: 0, y: 0 }, course: [0, 0, 10, 10], parcel: [0, 0, 10, 10], dir: 0, tees: [], pins: [], aims: [], clubhouse: { x: 1, y: 1 } } as unknown as GolfSave;
  const n = normalizeGolfSave(s)!;
  assert.equal('looks' in n, false); assert.equal('myHoles' in n, false);
  assert.equal(normalizeBook(undefined), undefined);
  const b = normalizeBook({ h3: { bunker: { tex: 'dirt' } }, nonsense: { bunker: {} }, property: 5 })!;
  assert.deepEqual(Object.keys(b), ['h3']); assert.equal(b.h3!.bunker!.tex, 'dirt'); assert.equal(b.h3!.bunker!.scale, BRUSH_PRESETS.find(p => p.kind === 'bunker')!.style.scale);
  assert.equal(holeOwner(0), 'property'); assert.equal(holeOwner(12), 'h12');
});
