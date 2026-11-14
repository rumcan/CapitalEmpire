// #1281 (the owner, 2026-11-14: "when you place the practice area it should place some dirt greens we flags and a crappy bunker etc ... the initial practice green you can
// place looks crap. remove the TEe box and make the bunker bigger. add some rough grass around the entire thing"): the practice area's starter set (golf/practicestarter.ts)
// and the proper facilities' new look (golf/practicebuild.ts): no chip mat, a real greenside bunker, a ragged band of rough round the whole of each facility.
// The set is ground paint and a few flag sprites, never a cell of the course grid: no facility, no golfer, no takings. A facility built over a piece replaces it; the build's
// undo step brings it back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUNKER_MIN, CHIP_MIN, PUTT_MIN, practiceArea, scanPractice } from '../src/game/golf/practice';
import { PRACTICE_SIZE, ROUGH, bunkerInReach, distanceField, facilityAt, facilityRefund, planCells, planCost, practicePlan, type PlanCells, type PlanSpec } from '../src/game/golf/practicebuild';
import { STARTER_FLAG, STARTER_FLAG_SCALE, STARTER_GREENS, cellSet, coveredBy, starterPatches, starterPieces, starterSeed, starterSet } from '../src/game/golf/practicestarter';
import { defaultRangeBiz, normalizeRangeBiz, practiceAppeal, rangeScene, type RangeBizSave, type ScenePiece } from '../src/game/golf/rangebiz';
import { RangeHost, type RangeHostCtx } from '../src/game/golf/rangehost';
import { SURF, cellAt, cellCentre, makeGrid, paintCells, paintDisc, type Grid } from '../src/game/ext/course-grid';
import type { Rect } from '../src/game/golf/mode';
import type { Prop } from '../src/game/types';
import { PaintTool, type PaintHost } from '../src/game/paint-tool';
import { inPractice } from '../src/game/golf/practice';
import { plotPoint } from '../src/game/golf/range';

const plot: Rect = [200, 200, 70, 150];
const AREA = practiceArea(plot, 2), BOX = AREA.box;
const RECT: [number, number, number, number] = [BOX[0], BOX[1], BOX[2] - BOX[0], BOX[3] - BOX[1]];
const P = (u: number, v: number) => plotPoint(plot, 2, u, v);
const grid = (): Grid => makeGrid(190, 190, 300, 420);
const start = { tier: 1, exits: 2, residents: 0 };
const spec = (kind: PlanSpec['kind'], u: number, v: number, extra: Partial<PlanSpec> = {}): PlanSpec => { const q = P(u, v); return { kind, x: q.x, y: q.y, m2: PRACTICE_SIZE[kind].def, turn: 0, shape: 0, seed: 1, ...extra }; };
/** lays a plan as the practice tool does: green, bunker, tee, rough, hole 0 */
function lay(g: Grid, s: PlanSpec, box: readonly [number, number, number, number] | undefined = BOX) {
  const p = practicePlan(s), c = planCells(g, p, box);
  paintCells(g, c.green, c.green.length, SURF.green, 0, 0); paintCells(g, c.bunker, c.bunker.length, SURF.bunker, 0, 0); paintCells(g, c.tee, c.tee.length, SURF.tee, 0, 0); paintCells(g, c.rough, c.rough.length, SURF.rough, 0, 0);
  return { p, c };
}
const featureOf = (c: PlanCells) => [...c.green, ...c.bunker, ...c.tee];
/** cell (cx, cy) of g in its grid frame */
const xy = (g: Grid, i: number): [number, number] => [i % g.w, (i - (i % g.w)) / g.w];

// ---- the first proper green: no chip mat, a real bunker, a band of rough

test('the chipping green has no chip mat and a real greenside bunker: about half the green wide along its edge and a third of it deep, within the practice scan\'s reach', () => {
  const g = grid(), { p, c } = lay(g, spec('chipping', 93, 19));
  assert.equal(p.spot, null, 'no chip mat in the plan'); assert.equal(c.tee.length, 0, 'and no tee cell laid');
  const diameter = 2 * Math.sqrt(c.green.length / Math.PI);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const i of c.bunker) { const [x, y] = xy(g, i); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const along = x1 - x0 + 1, deep = y1 - y0 + 1;   // (turn 0: the bunker lies on the green's +v side, its length along u)
  assert.ok(c.bunker.length >= 50 && c.bunker.length <= 95, `a bunker of ${c.bunker.length} m² (the old one was 38)`);
  assert.ok(along >= 0.4 * diameter && along <= 0.65 * diameter, `${along} m along a ${diameter.toFixed(1)} m green`);
  assert.ok(deep >= 0.28 * diameter && deep <= 0.45 * diameter, `${deep} m deep`);
  assert.ok(bunkerInReach(g, c) >= BUNKER_MIN, 'its cells within reach count for the chipping green');
  // it stays off the green: a gap of grass for the collar
  const gx = c.green.map(i => cellCentre(g, i));
  const near = Math.min(...c.bunker.map(i => { const q = cellCentre(g, i); return Math.min(...gx.map(r => Math.hypot(r.x - q.x, r.y - q.y))); })) * 2;
  assert.ok(near >= 1.2, `${near.toFixed(1)} m between green and sand`);
  // every size and turn keeps a bunker of the same proportions
  for (const m2 of [PRACTICE_SIZE.chipping.min, 400, PRACTICE_SIZE.chipping.max]) for (const turn of [0, 3, 5]) {
    const h = grid(), q = lay(h, spec('chipping', 93, 19, { m2, turn, seed: 4 }));
    assert.ok(q.c.bunker.length >= 45 && bunkerInReach(h, q.c) >= BUNKER_MIN, `m2 ${m2} turn ${turn}: ${q.c.bunker.length} cells`);
  }
});

test('a ragged band of rough rings the whole of each facility: under none of its cells, never over another surface, at least a metre and a half wide and at most five', () => {
  for (const [kind, shape] of [['chipping', 0], ['putting', 0], ['putting', 2], ['putting', 4]] as const) for (const seed of [1, 2, 9]) {
    const g = grid(), { c } = lay(g, spec(kind, 93, 19, { seed, shape })), feat = featureOf(c), rough = new Set(c.rough);
    assert.ok(c.rough.length > 120, `${kind} ${shape} ${seed}: a band of ${c.rough.length} m²`);
    for (const i of c.rough) assert.ok(!feat.includes(i), 'rough lies on no green, bunker or tee cell');
    // the facility's every cell is wholly ringed: all eight neighbours are its own or rough (no bare ground touches it)
    const own = new Set(feat);
    for (const i of feat) { const [x, y] = xy(g, i); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const k = (y + dy) * g.w + x + dx; assert.ok(own.has(k) || rough.has(k), `${kind}: a facility cell at the edge of the rough`); } }
    // and every rough cell is within ROUGH.max of a facility cell (the chamfer distance, a few percent over)
    const xs = feat.map(i => xy(g, i)[0]), ys = feat.map(i => xy(g, i)[1]), ox = Math.min(...xs) - 8, oy = Math.min(...ys) - 8, W = Math.max(...xs) - ox + 9, H = Math.max(...ys) - oy + 9, sd = new Uint8Array(W * H);
    for (const i of feat) { const [x, y] = xy(g, i); sd[(y - oy) * W + x - ox] = 1; }
    const d = distanceField(W, H, sd), ring: number[] = [];
    for (const i of c.rough) { const [x, y] = xy(g, i), v = d[(y - oy) * W + x - ox]!; assert.ok(v > 0 && v <= ROUGH.max, `${v} from the facility`); if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !rough.has((y + b!) * g.w + x + a!) && !own.has((y + b!) * g.w + x + a!))) ring.push(v); }
    // the outer edge is ragged: its distance from the facility wanders by a metre and a half or more, round the whole ring
    assert.ok(Math.max(...ring) - Math.min(...ring) >= 1.5, `${kind} ${shape} ${seed}: the edge wanders ${(Math.max(...ring) - Math.min(...ring)).toFixed(1)} m`);
    assert.ok(Math.min(...ring) >= ROUGH.min - 0.7, `the band is never thinner than ${ROUGH.min} m: ${Math.min(...ring).toFixed(2)}`);
  }
});

test('the band is the same shape wherever the facility goes (by whole cells), differs by seed, and is clipped to the practice area and to cells that hold nothing', () => {
  const g = grid(), a = planCells(g, practicePlan(spec('chipping', 93, 19, { seed: 5 })), BOX), b = planCells(g, practicePlan(spec('chipping', 98, 22, { seed: 5 })), BOX);
  const rel = (c: PlanCells, p: PlanSpec) => c.rough.map(i => { const [x, y] = xy(g, i); return [x - Math.round((p.x - g.x0) / 0.5), y - Math.round((p.y - g.y0) / 0.5)].join(','); }).sort();
  assert.deepEqual(rel(b, spec('chipping', 98, 22, { seed: 5 })), rel(a, spec('chipping', 93, 19, { seed: 5 })), 'moved 10 x 6 cells: the same band');
  const c2 = planCells(g, practicePlan(spec('chipping', 93, 19, { seed: 6 })), BOX);
  assert.notDeepEqual(c2.rough.map(i => i - c2.green[0]!).sort(), a.rough.map(i => i - a.green[0]!).sort(), 'another seed, another band');
  // clipped: a facility at the area's edge (its green inset one tile) lays rough only inside the area
  const edge = planCells(g, practicePlan(spec('putting', 83, 19)), BOX), edgeBare = planCells(g, practicePlan(spec('putting', 83, 19)));
  assert.ok(edgeBare.rough.length > edge.rough.length, 'without the area the band would spill over its edge');
  for (const i of edge.rough) { const q = cellCentre(g, i); assert.ok(inPractice({ box: BOX }, q.x, q.y), 'inside the area'); }
  // never over another surface: a cell already holding fescue is left to it
  const h = grid(), p = practicePlan(spec('putting', 93, 19)), free = planCells(h, p, BOX), k = free.rough[0]!;
  paintCells(h, [k], 1, SURF.fescue, 0, 0);
  const again = planCells(h, p, BOX);
  assert.ok(!again.rough.includes(k) && again.rough.length === free.rough.length - 1, 'the fescue cell is left alone');
});

test('the rough is priced with the facility (the brushes\' price, 80 cents a m²) and counts for nothing else: the scan reads the same facility', () => {
  for (const kind of ['putting', 'chipping'] as const) {
    const g = grid(), p = practicePlan(spec(kind, 93, 19)), c = planCells(g, p, BOX), unit = kind === 'putting' ? 6 * c.green.length : 6 * c.green.length + 4 * c.bunker.length;
    assert.equal(planCost(g, c), Math.round(unit + 0.8 * c.rough.length), `${kind}: green, sand and rough`);
    assert.ok(planCost(g, c) > unit, 'the rough adds to the price');
    // laid with and without its rough: the same state, size, centre and flags, so the golfers and the takings are the same
    const withR = grid(), without = grid(); lay(withR, spec(kind, 93, 19));
    { const q = planCells(without, p, BOX); paintCells(without, q.green, q.green.length, SURF.green, 0, 0); paintCells(without, q.bunker, q.bunker.length, SURF.bunker, 0, 0); }
    const a = scanPractice(withR, BOX), b = scanPractice(without, BOX), pick = (s: typeof a) => ({ state: s[kind].state, m2: s[kind].m2, centre: s[kind].centre, cups: s[kind].cups, built: s.built });
    assert.deepEqual(pick(a), pick(b), `${kind}: the scan is the same`);
    assert.equal(a[kind].state, 'open'); assert.ok(a[kind].m2 >= (kind === 'putting' ? PUTT_MIN : CHIP_MIN));
    const biz = defaultRangeBiz(); biz.practice[kind].open = true;
    assert.ok(Math.abs(practiceAppeal(biz) - 0.1) < 1e-9, 'the appeal is the same +10%');
    // the chipping stands: on the grass past the band while there is room (never on the rough), the bunker's two first
    if (kind === 'chipping') {
      assert.ok(a.chipping.stands.length >= 3 && a.chipping.stands.length === b.chipping.stands.length, `${a.chipping.stands.length} stands`);
      for (const s of a.chipping.stands) assert.notEqual(withR.surf[cellAt(withR, s.x, s.y)], SURF.rough, 'no stand on the rough');
    }
  }
});

test('the bulldozer takes a facility whole with its rough band (half its price back, the rough too), and leaves the other facility\'s band; it finds the facility from a cell of its band', () => {
  const g = grid(), put = lay(g, spec('putting', 85, 19)), chip = lay(g, spec('chipping', 104, 19, { turn: 4 })), at = chip.p.centre;
  const f = facilityAt(g, BOX, at.x, at.y)!;
  assert.equal(f.green, chip.c.green.length); assert.equal(f.bunker, chip.c.bunker.length); assert.equal(f.rough, chip.c.rough.length, 'all its rough: ' + f.rough);
  assert.equal(f.cells.length, f.green + f.bunker + f.tee + f.rough);
  assert.ok(f.cells.every(i => ([SURF.green, SURF.bunker, SURF.rough] as number[]).includes(g.surf[i]!)));
  assert.equal(facilityRefund(f), Math.round((6 * f.green + 4 * f.bunker + 0.8 * f.rough) / 2), 'half the price, rough included');
  // a rough cell of its band leads to it, one of the putting green's to that
  const rc = cellCentre(g, chip.c.rough[7]!), fr = facilityAt(g, BOX, rc.x, rc.y)!, pc = cellCentre(g, put.c.rough[7]!), fp = facilityAt(g, BOX, pc.x, pc.y)!;
  assert.equal(fr.cells.length, f.cells.length); assert.equal(fp.cells.length, put.c.green.length + put.c.rough.length);
  // removed: its cells back to the land's grass; the putting green keeps its band whole
  paintCells(g, f.cells, f.cells.length, SURF.none, 0, 0);
  for (const i of put.c.rough) assert.equal(g.surf[i], SURF.rough, 'the putting green\'s band stays');
  for (const i of chip.c.rough) assert.equal(g.surf[i], SURF.none, 'the chipping band goes with it');
  assert.equal(scanPractice(g, BOX).chipping.state, 'none'); assert.equal(scanPractice(g, BOX).putting.state, 'open');
  // rough no facility rings (a property's own paint) is nobody's
  const far = P(93, 33); paintDisc(g, far.x, far.y, 1.5, SURF.rough, 0, 0);
  assert.equal(facilityAt(g, BOX, far.x, far.y), null, 'a painted rough patch is no facility');
});

// ---- the starter set

test('the starter set: three dirt greens with a flag and one crude bunker, laid from the area\'s seed: the same for a seed, another for another, inside the area\'s margin and clear of the walk in', () => {
  const set = starterSet(BOX, AREA.entry, 1234), again = starterSet(BOX, AREA.entry, 1234), other = starterSet(BOX, AREA.entry, 99);
  assert.deepEqual(set, again, 'deterministic'); assert.notDeepEqual(set.map(p => p.centre), other.map(p => p.centre), 'by seed');
  assert.equal(set.length, STARTER_GREENS + 1); assert.deepEqual(set.map(p => p.id), [0, 1, 2, 3]);
  assert.deepEqual(set.map(p => p.kind), ['dirt', 'dirt', 'dirt', 'bunker']);
  for (const p of set) {
    assert.ok(p.pts.length >= 72 && p.pts.length % 2 === 0, 'a ragged ring of 36 points or more');
    for (let i = 0; i < p.pts.length; i += 2) assert.ok(p.pts[i]! > BOX[0] + 2 && p.pts[i]! < BOX[2] - 2 && p.pts[i + 1]! > BOX[1] + 2 && p.pts[i + 1]! < BOX[3] - 2, `${p.kind} ${p.id} inside the area`);
    assert.equal(p.kind === 'dirt', !!p.flag, 'a flag on each dirt green and none on the bunker'); assert.equal(p.kind === 'bunker', !!p.rim, 'the bunker has its earth rim');
  }
  // a dirt green is a few metres across, the bunker a scrape of a few more long than deep
  const size = (p: { pts: number[] }) => { const xs = p.pts.filter((_, i) => i % 2 === 0), ys = p.pts.filter((_, i) => i % 2 === 1); return [(Math.max(...xs) - Math.min(...xs)) * 2, (Math.max(...ys) - Math.min(...ys)) * 2]; };
  for (const p of set.filter(q => q.kind === 'dirt')) { const [w, h] = size(p); assert.ok(w >= 8 && w <= 16 && h >= 8 && h <= 16, `a dirt green ${w.toFixed(1)} x ${h.toFixed(1)} m`); }
  // the greens keep apart, and well off the walk in
  const greens = set.filter(p => p.kind === 'dirt');
  for (let i = 0; i < greens.length; i++) {
    assert.ok(Math.hypot(greens[i]!.centre.x - AREA.entry.x, greens[i]!.centre.y - AREA.entry.y) >= 6, 'off the walk in');
    for (let j = i + 1; j < greens.length; j++) assert.ok(Math.hypot(greens[i]!.centre.x - greens[j]!.centre.x, greens[i]!.centre.y - greens[j]!.centre.y) >= 6, 'greens apart');
  }
  // the whole range of seeds stays inside, and a sliver of an area gets none
  for (let s = 0; s < 40; s++) for (const p of starterSet(BOX, AREA.entry, s * 7919)) for (let i = 0; i < p.pts.length; i += 2) assert.ok(p.pts[i]! > BOX[0] && p.pts[i]! < BOX[2] && p.pts[i + 1]! > BOX[1] && p.pts[i + 1]! < BOX[3]);
  assert.deepEqual(starterSet([0, 0, 10, 10], { x: 0, y: 5 }, 1), [], 'too small an area: none');
  assert.notEqual(starterSeed(1, [300, 400, 36, 34]), starterSeed(1, [320, 400, 36, 34]), 'a seed by where the area lies');
});

test('the starter pieces as the scene lays them: dirt greens and the bunker\'s earth rim and sand as ground patches, a short yellow flag on each dirt green; the ones gone are left out', () => {
  const set = starterSet(BOX, AREA.entry, 7);
  const all = starterPatches(set, []), flags = starterPieces(set, []);
  assert.deepEqual(all.map(p => p.surf), ['dirtGreen', 'dirtGreen', 'dirtGreen', 'scrape', 'sand'], 'three greens, the bunker\'s rim then its sand');
  assert.ok(all.filter(p => p.surf === 'dirtGreen').every(p => p.edge === 'raised'), 'a gentle sun-lit mound'); assert.equal(all[4]!.edge, 'turf'); assert.equal(all[3]!.edge, 'flat'); assert.deepEqual(all[4]!.tone, { t: 1, ta: 0.07 }, 'the sand a little duller than the bunker sand of the course'); assert.equal(all[0]!.tone, undefined);
  assert.equal(flags.length, 3); for (const f of flags) { assert.equal(f.id, STARTER_FLAG); assert.equal(f.scale, STARTER_FLAG_SCALE); assert.ok(f.scale! < 0.26, 'a short flag: shorter than the red flags of the proper greens'); }
  assert.equal(new Set(flags.map(f => f.key)).size, 3, 'unique keys');
  const f0 = flags[0]!; assert.ok(set[0]!.pts.length > 0 && Math.hypot(f0.x - set[0]!.centre.x, f0.y - set[0]!.centre.y) < 1e-9, 'the flag on its green');
  assert.equal(starterPatches(set, [0]).length, 4); assert.equal(starterPieces(set, [0]).length, 2, 'a green gone: its patch and its flag');
  assert.deepEqual(starterPatches(set, [3]).map(p => p.surf), ['dirtGreen', 'dirtGreen', 'dirtGreen'], 'the bunker gone: both its patches');
  assert.equal(starterPatches(set, [0, 1, 2, 3]).length, 0); assert.equal(starterPieces(set, [0, 1, 2, 3]).length, 0);
});

test('the range scene carries the starter set of a placed area (and none otherwise): over the practice area, the area itself unchanged', () => {
  const none = defaultRangeBiz(); none.practiceAt = RECT;
  const s0 = rangeScene(plot, 2, none), sk = defaultRangeBiz(); sk.practiceAt = RECT; sk.starter = { seed: 11, gone: [] };
  const s1 = rangeScene(plot, 2, sk);
  assert.equal(s0.starter.length, 0); assert.equal(s1.starter.length, 4);
  assert.deepEqual(s1.practice, s0.practice, 'the area is the same'); assert.deepEqual(s1.practice.box, AREA.box);
  assert.equal(s1.patches.length, s0.patches.length + 5); assert.equal(s1.pieces.length, s0.pieces.length + 3);
  const extra = s1.patches.slice(s0.patches.length), pcs = s1.pieces.slice(s0.pieces.length);
  assert.deepEqual(extra.map(p => p.surf), ['dirtGreen', 'dirtGreen', 'dirtGreen', 'scrape', 'sand']);
  for (const p of extra) for (let i = 0; i < p.pts.length; i += 2) assert.ok(inPractice(AREA, p.pts[i]!, p.pts[i + 1]!), 'every patch inside the area');
  assert.ok(pcs.every(q => q.key.startsWith('starter-flag') && q.id === STARTER_FLAG));
  const sg = defaultRangeBiz(); sg.practiceAt = RECT; sg.starter = { seed: 11, gone: [1, 3] };
  const s2 = rangeScene(plot, 2, sg);
  assert.equal(s2.starter.length, 4, 'the set is whole in the scene; the save says what is gone'); assert.equal(s2.patches.length, s0.patches.length + 2); assert.equal(s2.pieces.length, s0.pieces.length + 2);
  // no area placed (a bare start's): no set even with one in the save
  const bare = defaultRangeBiz(); bare.practiceAt = null; bare.starter = { seed: 3, gone: [] };
  assert.equal(rangeScene(plot, 2, bare).starter.length, 0);
  // the set lies over no cell of the course grid: no facility, nothing to scan
  const g = grid(); assert.equal(scanPractice(g, s1.practice.box).built, false);
});

test('the save: the starter set (its seed and the pieces gone) round-trips, bad values are dropped, a save from before has none, and a bare start keeps none', () => {
  const b = defaultRangeBiz(); b.practiceAt = RECT; b.starter = { seed: 4000000000, gone: [0, 3] };
  const back = normalizeRangeBiz(JSON.parse(JSON.stringify(b)));
  assert.deepEqual(back.starter, { seed: 4000000000, gone: [0, 3] }); assert.deepEqual(back.practiceAt, RECT);
  assert.equal(normalizeRangeBiz({ v: 1, owned: [], price: 6, season: {}, total: {}, paths: true, practiceAt: RECT }).starter, undefined, 'an old save with a placed area: no starter set');
  assert.deepEqual(normalizeRangeBiz({ practiceAt: RECT, starter: { seed: 5.7, gone: [3, 3, -1, 99, 'x', 1] } }).starter, { seed: 5, gone: [1, 3] }, 'cleaned up');
  assert.equal(normalizeRangeBiz({ practiceAt: RECT, starter: { seed: 'x' } }).starter, undefined); assert.equal(normalizeRangeBiz({ practiceAt: RECT, starter: 4 }).starter, undefined);
  assert.equal(normalizeRangeBiz({ practiceAt: null, starter: { seed: 1, gone: [] } }).starter, undefined, 'not placed: none');
  assert.deepEqual(normalizeRangeBiz({ starter: { seed: 1, gone: [] } }).starter, { seed: 1, gone: [] }, 'the plot\'s own area (bought as land) keeps its set');
});

test('a facility built over the set replaces the pieces it covers: they leave the scene and the save, the build\'s undo brings them back, redo takes them away again', () => {
  const biz: RangeBizSave = defaultRangeBiz(); biz.practiceAt = RECT; biz.starter = { seed: 11, gone: [] };
  const g = grid(), added: string[] = [], removed: string[] = [], ground: string[][] = [];
  const ctx: RangeHostCtx = {
    biz: () => biz, plot: () => ({ rect: plot, facing: 2 }), carPark: () => null,
    addPiece: (_p: ScenePiece, key: string) => { added.push(key); return { auto: key } as unknown as Prop; }, removeProp: p => { removed.push(p.auto!); },
    setGround: (_k, patches) => { ground.push((patches ?? []).map(q => String(q.tex))); }, layPaths: () => {}, clearTrees: () => {},
    money: () => 1e6, spend: () => {}, book: () => {}, demand: () => start, dayLen: () => 600, simT: () => 0, clock: () => ({ hour: 12, day: 1 }),
    save: () => {}, toast: () => {}, emit: () => {}, grid: () => g, layTee: () => true,
  };
  const h = new RangeHost(ctx, 1); h.sync(true);
  const flagKeys = () => added.filter(k => k.startsWith('range:starter-flag')), sc = h.scene!;
  assert.equal(flagKeys().length, 3, 'three flags stand'); assert.equal(h.view()!.practiceStarter, 4, 'the card counts the set');
  assert.ok(ground.at(-1)!.includes('bunkerSand'), 'the bunker\'s sand is in the ground');
  // a chipping green built over the first dirt green (its centre)
  const piece = sc.starter[0]!, s0 = { kind: 'chipping' as const, x: piece.centre.x, y: piece.centre.y, m2: 280, turn: 0, shape: 0, seed: 1 };
  const c = planCells(g, practicePlan(s0), BOX);
  assert.deepEqual(coveredBy(sc.starter, [], g, cellSet(c.green, c.bunker, c.tee, c.rough)).includes(0), true, 'the plan covers piece 0');
  const aside = h.replaceStarters(c)!; assert.ok(aside, 'something was replaced');
  const gone = [...biz.starter!.gone]; assert.ok(gone.includes(0), 'piece 0 is gone from the save');
  h.sync();   // (the next frame: the save's key changed)
  assert.notEqual(h.scene, sc, 'the scene is laid again');
  assert.equal(h.scene!.pieces.filter(q => q.key.startsWith('starter-flag')).length, 3 - gone.filter(i => i < 3).length, 'their flags are gone from the scene');
  assert.ok(removed.includes('range:starter-flag0'), 'its flag prop removed'); assert.equal(h.view()!.practiceStarter, 4 - gone.length);
  const groundGone = ground.at(-1)!.length;
  aside.undo(); h.sync();
  assert.deepEqual(biz.starter!.gone, [], 'undo: the set is whole again'); assert.equal(h.view()!.practiceStarter, 4);
  assert.ok(ground.at(-1)!.length > groundGone, 'and its ground paint is back');
  assert.ok(flagKeys().length > 3, 'the flag is put up again');
  aside.redo(); h.sync();
  assert.deepEqual(biz.starter!.gone, gone, 'redo: replaced again');
  // no cells, no pieces replaced
  assert.equal(h.replaceStarters({ green: [], bunker: [], tee: [], rough: [] }), null);
});

test('the practice tool\'s undo step carries what a build changed outside the grid: undo calls it, redo calls it again, in order with the money', () => {
  const g = grid(), money = { v: 1e6 }, log: string[] = [];
  const host: PaintHost = {
    setLotGround() {}, emit() {}, save() {}, toast() {}, affine() {}, placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [],
    golfMode: () => true, currentMonth: () => 5, money: () => money.v, spend: n => { money.v -= n; },
    grid: () => g, gridChanged() {}, ownedAt: () => true, practiceAt: (x, y) => inPractice(AREA, x, y),
  };
  const tool = new PaintTool(host); tool.enterCourse(); tool.setHole(1);
  const c = planCells(g, practicePlan(spec('chipping', 93, 19)), BOX);
  tool.gridEdit('build the chipping green', gg => ({ diffs: [paintCells(gg, c.green, c.green.length, SURF.green, 0, 0)], spent: 700, aside: { undo: () => log.push(`undo@${money.v}`), redo: () => log.push(`redo@${money.v}`) } }));
  assert.equal(money.v, 1e6 - 700); assert.deepEqual(log, []);
  tool.undo(); assert.equal(g.surf[c.green[0]!], SURF.none); assert.equal(log.length, 1); assert.match(log[0]!, /^undo@/);
  tool.redo(); assert.equal(g.surf[c.green[0]!], SURF.green); assert.equal(log.length, 2); assert.match(log[1]!, /^redo@/);
  // a step with no aside stays as it was
  tool.gridEdit('plain', gg => ({ diffs: [paintCells(gg, c.green, c.green.length, SURF.fescue, 0, 0)], spent: 0 })); tool.undo(); assert.equal(log.length, 2);
});
