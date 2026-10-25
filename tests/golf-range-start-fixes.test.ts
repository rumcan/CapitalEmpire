/** Range starts (T115, the P23 critique's D5.1-D5.4): land for sale lines up with the owned parcel, so a range start can buy land on every
 * open side and the course grid grows onto it (old saves' blocks still work); the grow-in is one state for every zoom tier and each seeded
 * surface reads as what it will be; the brush paints the player's own parcel and names the driving range's plot as the reason it refuses
 * there (pure, Node: golf/parcels.ts, ext/course-grid, ext/course-fx/seed.ts, and a Paint tool with a stand-in host). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP } from '../src/game/iso';
import { TC, generateTerrain, type Terrain } from '../src/game/terrain';
import type { Rect } from '../src/game/golf/mode';
import { planRangeStart, type RangeStart } from '../src/game/golf/rangestart';
import { LAND_BLOCK, blockAt, blockOnRoad, blockOnWater, buyAdjacentBlock, isAdjacentBlock, sharedEdge, type LandRoad } from '../src/game/golf/parcels';
import { CLASS, SK } from '../src/game/network';
import { SURF, cellAt, cellCentre, fitGrid, landGridBox, makeGrid, paintDisc, type Grid } from '../src/game/ext/course-grid';
import { plantMonth } from '../src/game/ext/course-grid/areas';
import { coursePatch, type CourseLooks } from '../src/game/ext/course-grid/patch';
import { SEED_LOOKS, growDraws, parseCol, seedColour, seedShare, seedSprouts, seedTint, sproutRes } from '../src/game/ext/course-fx/seed';
import { LAND_WHY, PaintTool, type PaintHost } from '../src/game/paint-tool';

// ---------- 1. land for sale in a range start ----------
const terrains = new Map<number, Terrain>(), plans = new Map<number, RangeStart | null>();
const plan = (s: number) => { if (!plans.has(s)) { const t = generateTerrain(s); terrains.set(s, t); plans.set(s, planRangeStart(t, s)); } return plans.get(s)!; };
const wet = (t: Terrain) => (x: number, y: number) => x >= 0 && x < MAP && y >= 0 && y < MAP && t.cls[y * MAP + x] === TC.WATER;
/** the course grid's margin round the land (engine COURSE_GRID_PAD) */
const PAD = 32;
type Side = 'N' | 'S' | 'E' | 'W';
/** the side of a range start's parcel on the road: the course lies away from it (dir 0 north: the road is on the south side) */
const roadSide = (dir: number): Side => (['S', 'W', 'N', 'E'] as const)[dir]!;
/** the blocks for sale found by probing a band 0..40 tiles off one side of rect r (as the pointer would), unbuildable (water) ones dropped */
function blocksOff(parcels: readonly Rect[], r: Rect, side: Side, t: Terrain, refuse?: (b: Rect) => boolean): Rect[] {
  const [px, py, pw, ph] = r, out = new Map<string, Rect>();
  for (let d = 0.5; d < LAND_BLOCK; d += 3) for (let s = 0.5; s < (side === 'N' || side === 'S' ? pw : ph); s += 5) {
    const x = side === 'W' ? px - d : side === 'E' ? px + pw + d : px + s, y = side === 'N' ? py - d : side === 'S' ? py + ph + d : py + s;
    const b = blockAt(parcels, x, y, LAND_BLOCK, MAP, refuse);
    if (b && !blockOnWater(b, wet(t))) out.set(b.join(','), b);
  }
  return [...out.values()];
}

test('1a. a range start has land for sale on every open side, each block lined up with the parcel and touching it', () => {
  let checked = 0;
  for (const seed of [1, 2, 3, 4]) {
    const p = plan(seed); if (!p) continue;
    const t = terrains.get(seed)!, parcel = p.save.parcel, parcels = [parcel];
    for (const side of ['N', 'S', 'E', 'W'] as const) {
      if (side === roadSide(p.save.dir)) continue; // across the county road from the parcel lies the town's side
      const bs = blocksOff(parcels, parcel, side, t);
      assert.ok(bs.length >= 1, `seed ${seed}: no block for sale on the ${side} side of ${parcel}`);
      for (const b of bs) {
        assert.ok(isAdjacentBlock(parcels, b) && sharedEdge(parcel, b) > 0, `seed ${seed} ${side}: ${b} touches the parcel`);
        // lined up: the block's edge on the parcel's side is the parcel's edge, and its run along that edge steps from a parcel corner
        const along = side === 'N' || side === 'S' ? [b[0], parcel[0], parcel[0] + parcel[2]] : [b[1], parcel[1], parcel[1] + parcel[3]];
        assert.ok((along[0]! - along[1]!) % LAND_BLOCK === 0 || (along[0]! + LAND_BLOCK - along[2]!) % LAND_BLOCK === 0, `seed ${seed} ${side}: ${b} steps from a corner of ${parcel}`);
      }
      checked++;
    }
  }
  assert.ok(checked >= 9, `checked ${checked} open sides`);
});

test('1b. buying a block extends the owned land and the course grid; the next block lines up with the bought one', () => {
  const p = plan(1)!; assert.ok(p, 'seed 1 has a range start');
  const parcel = p.save.parcel, course = p.save.course, dir = p.save.dir, [px, py, pw, ph] = parcel;
  // the far side (away from the road), in its middle
  const far = (d: number): [number, number] => dir === 0 ? [px + pw / 2, py - d] : dir === 2 ? [px + pw / 2, py + ph + d] : dir === 1 ? [px + pw + d, py + ph / 2] : [px - d, py + ph / 2];
  const block = blockAt([parcel], ...far(10), LAND_BLOCK, MAP)!;
  assert.ok(block, 'a block beyond the far side');
  const g0 = (() => { const b = landGridBox([course, parcel], PAD, MAP)!; const g = makeGrid(b[0], b[1], b[2], b[3]); paintDisc(g, px + 30, py + ph / 2, 4, SURF.green, 1, 0); return g; })();
  const res = buyAdjacentBlock([parcel], { rect: block, landClass: 'open' }, 1e6);
  assert.ok(res.ok, res.reason);
  assert.deepEqual(res.parcels, [parcel, block]);
  assert.equal(res.price, 40 * 40 * 4 * 1.25, 'an open 80 x 80 m block at $1.25 a m²');
  // the grid grows onto the block (engine fitCourseGrid: landGridBox of the course and every parcel, then fitGrid); the painted green stays
  const bx = block[0] + block[2] - 0.25, by = block[1] + block[3] - 0.25, far2 = far(LAND_BLOCK + PAD + 4);
  assert.ok(cellAt(g0, far2[0], far2[1]) < 0, 'the old grid ends short of the block and its margin');
  const g1 = fitGrid(g0, landGridBox([course, ...res.parcels], PAD, MAP)!)!;
  assert.ok(g1, 'the grid grew');
  assert.ok(g1.w * g1.h > g0.w * g0.h);
  assert.ok(cellAt(g1, bx, by) >= 0 && cellAt(g1, far(LAND_BLOCK + PAD - 1)[0], far(LAND_BLOCK + PAD - 1)[1]) >= 0, 'the block and its margin are on the grid');
  assert.equal(g1.surf[cellAt(g1, px + 30, py + ph / 2)], SURF.green, 'the old cells moved with the grid');
  assert.equal(fitGrid(g1, landGridBox([course, ...res.parcels], PAD, MAP)!), null, 'nothing more to grow');
  // keep going out: the block beyond the bought one touches it, flush with it
  const next = blockAt(res.parcels, ...far(LAND_BLOCK + 10), LAND_BLOCK, MAP)!;
  assert.ok(next && sharedEdge(block, next) === LAND_BLOCK, `next ${next} sits flush on ${block}`);
  assert.ok(buyAdjacentBlock(res.parcels, { rect: next, landClass: 'open' }, 1e6).ok);
});

test('1c. old saves: a parcel on the map lattice and its bought blocks get the same blocks as before; none inside the land or off the map', () => {
  const parcel: Rect = [400, 400, 320, 440];
  // the old rule: floor(x / 40) * 40; on a lattice edge the new rule gives the same block
  for (const [x, y] of [[390, 420], [399, 839], [520, 395], [725, 610]] as const) {
    const old: Rect = [Math.floor(x / 40) * 40, Math.floor(y / 40) * 40, 40, 40];
    assert.deepEqual(blockAt([parcel], x, y), old, `at ${x}, ${y}`);
  }
  // a save that bought old blocks keeps growing from them
  const bought: Rect[] = [parcel, [360, 400, 40, 40]];
  assert.deepEqual(blockAt(bought, 350, 410), [320, 400, 40, 40]);
  // inside the owned land, far from it, or off the map: nothing for sale
  assert.equal(blockAt([parcel], 500, 500), null);
  assert.equal(blockAt([parcel], 200, 200), null);
  assert.equal(blockAt([[0, 0, 100, 100]], 120, 50, LAND_BLOCK, 110), null, 'a block past the map edge');
  assert.equal(blockAt([], 10, 10), null);
});

test('1d. a public road stays public: no block for sale in a range start covers a road tile; the course grows on the other three sides', () => {
  // the check itself: a road crossing a block, its verge reaching in, beside it, and a diagonal one
  const road: LandRoad[] = [{ ax: 0, ay: 100, bx: 400, by: 100, hw: 3.75 }];
  assert.equal(blockOnRoad([100, 60, 40, 40], road), true, 'the road along its edge');
  assert.equal(blockOnRoad([100, 80, 40, 40], road), true, 'the road across it');
  assert.equal(blockOnRoad([100, 103, 40, 40], road), true, 'its verge reaches in');
  assert.equal(blockOnRoad([100, 104, 40, 40], road), false, 'beside it');
  assert.equal(blockOnRoad([100, 160, 40, 40], [{ ax: 0, ay: 0, bx: 300, by: 300, hw: 2 }]), false);
  assert.equal(blockOnRoad([150, 120, 40, 40], [{ ax: 0, ay: 0, bx: 300, by: 300, hw: 2 }]), true);
  let checked = 0;
  for (const seed of [1, 2, 3, 4]) {
    const p = plan(seed); if (!p) continue;
    const t = terrains.get(seed)!, parcel = p.save.parcel, parcels = [parcel];
    // the county road's tiles: every leg but a tunnel, at the road's half width and walk (the range's gravel drive is the course's own)
    const roads: LandRoad[] = p.road.legs.filter((_, i) => p.road.kinds[i] !== SK.TUNNEL).map(l => ({ ax: l.a.x, ay: l.a.y, bx: l.b.x, by: l.b.y, hw: CLASS.road!.h + CLASS.road!.walk }));
    const refuse = (b: Rect) => blockOnRoad(b, roads);
    for (const side of ['N', 'S', 'E', 'W'] as const) {
      const bs = blocksOff(parcels, parcel, side, t, refuse);
      for (const b of bs) assert.equal(blockOnRoad(b, roads), false, `seed ${seed} ${side}: ${b} takes no road tile`);
      if (side === roadSide(p.save.dir)) {
        // the road side: the blocks that touch the parcel there all take the road, so none is for sale
        const unchecked = blocksOff(parcels, parcel, side, t);
        assert.ok(unchecked.length > 0 && unchecked.every(refuse), `seed ${seed}: the road-side blocks would all take the road`);
        assert.equal(bs.length, 0, `seed ${seed}: nothing for sale across the road from the parcel`);
      } else { assert.ok(bs.length >= 1, `seed ${seed}: the ${side} side still has land for sale`); checked++; }
    }
  }
  assert.ok(checked >= 9, `checked ${checked} open sides`);
});

// ---------- 2. the grow-in: one state for every zoom tier, each surface its own young grass ----------
const LOOKS: CourseLooks = {
  surf: [undefined, { tex: 'golfRough', sc: 1, a: 0 }, { tex: 'golfFescue', sc: 1, a: 0 }, { tex: 'waterDark', sc: 1, a: 0 }, { tex: 'golfFairway', sc: 1, a: 0 }, { tex: 'golfTee', sc: 1, a: 0 }, { tex: 'bunkerSand', sc: 1, a: 0 }, { tex: 'wasteSand', sc: 1, a: 0 }, { tex: 'golfGreen', sc: 1, a: 0 }],
  collar: { 'first-cut': { tex: 'golfFirstCut', sc: 1, a: 0 }, fringe: { tex: 'golfFringe', sc: 1, a: 0 }, lip: { tex: 'golfRough', sc: 1, a: 0 }, bank: { tex: 'rockyDirt', sc: 1, a: 0 } },
};
/** a seeded hole in chunk (1, 1): rough round it, a fairway, a tee and a green, all seeded in game month 2, and a bunker (sand: no grow-in) */
function seededHole(): Grid {
  const g = makeGrid(0, 0, 300, 300), m = plantMonth('seed', 2);
  for (let y = 70; y < 120; y += 0.5) for (let x = 66; x < 126; x += 0.5) { const i = cellAt(g, x, y); g.surf[i] = SURF.rough; g.hole[i] = 1; g.month[i] = m; }
  for (let y = 86; y < 104; y += 0.5) for (let x = 80; x < 112; x += 0.5) { const i = cellAt(g, x, y); g.surf[i] = SURF.fairway; g.month[i] = m; }
  paintDisc(g, 72, 95, 3, SURF.tee, 1, m); paintDisc(g, 117, 95, 5, SURF.green, 1, m); paintDisc(g, 100, 108, 3, SURF.bunker, 1, 0);
  return g;
}
const drawn = (p: ReturnType<typeof coursePatch>) => growDraws(p!.course!).map(d => `${d.s}:${d.stage}:${d.cells}`).sort();

test('2a. a patch\'s grow look is the same for close and district (lite) chunks at the same month, and moves on with the months', () => {
  const g = seededHole();
  // the engine sends one patch per course chunk; the close chunks and the district chunks over it both draw it (renderer drawCourses calls
  // growDraws for either: it reads the patch's month mask and nothing of the zoom)
  const forClose = coursePatch(g, 1, 1, LOOKS, 2)!, forDistrict = coursePatch(g, 1, 1, LOOKS, 2)!;
  assert.deepEqual(growDraws(forClose.course!), growDraws(forDistrict.course!));
  assert.deepEqual(drawn(forClose).map(k => k.split(':').slice(0, 2).join(':')), ['1:1', '4:1', '5:1', '8:1'], 'just seeded: rough, fairway, tee and green all at a quarter grass (T121); sand never grows');
  assert.deepEqual(drawn(coursePatch(g, 1, 1, LOOKS, 2.2)), drawn(forClose), 'within a stage the look holds');
  // 1.5 months on: the rough (2 months) three quarters grown, the fairway and tee (3) half, the green (6) a quarter
  const later = growDraws(coursePatch(g, 1, 1, LOOKS, 3.5)!.course!);
  assert.deepEqual([...new Set(later.map(d => d.stage))].sort(), [1, 2, 3], `stages ${later.map(d => d.stage)}`);
  assert.equal(coursePatch(g, 1, 1, LOOKS, 9)!.course!.grow, undefined, 'grown in: no mask');
  assert.deepEqual(growDraws(coursePatch(g, 1, 1, LOOKS, 9)!.course!), []);
  // the young grass's pattern is the same sprouts at either tier, drawn at the chunk's own resolution (antialiased, not minified away)
  assert.deepEqual(seedSprouts(SEED_LOOKS[SURF.green]!, 8 * 7919), seedSprouts(SEED_LOOKS[SURF.green]!, 8 * 7919));
  assert.equal(sproutRes(21), 21); assert.equal(sproutRes(3.4), 3); assert.equal(sproutRes(0.4), 2); assert.equal(sproutRes(90), 24);
});

test('2b. while seeded, the green, tee, fairway and rough each look different: their own young grass over the same soil', () => {
  const soil = '#6b5a4a', kinds = [SURF.green, SURF.tee, SURF.fairway, SURF.rough] as const;
  const dist = (a: string, b: string) => { const p = parseCol(a), q = parseCol(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
  for (let i = 0; i < kinds.length; i++) for (let j = i + 1; j < kinds.length; j++) {
    const a = SEED_LOOKS[kinds[i]!]!, b = SEED_LOOKS[kinds[j]!]!;
    assert.ok(dist(seedColour(a, soil), seedColour(b, soil)) >= 20, `surfaces ${kinds[i]} and ${kinds[j]}: ${seedColour(a, soil)} vs ${seedColour(b, soil)}`);
    assert.ok(dist(seedTint(a), seedTint(b)) >= 25, `tints ${seedTint(a)} vs ${seedTint(b)}`);
  }
  // dense to sparse: the green covers most soil, then the tee, the fairway (in drill rows), the rough least
  const share = kinds.map(k => seedShare(SEED_LOOKS[k]!));
  assert.ok(share[0]! > share[1]! && share[1]! > share[2]! && share[2]! > share[3]!, `shares ${share.map(s => s.toFixed(2))}`);
  assert.ok(SEED_LOOKS[SURF.fairway]!.rows > 0 && kinds.filter(k => SEED_LOOKS[k]!.rows > 0).length === 1, 'only the fairway comes up in rows');
  for (const k of kinds) assert.ok(dist(seedColour(SEED_LOOKS[k]!, soil), soil) >= 8, `surface ${k} is not bare soil`);
  // every surface that grows in has a look; water and sand do not grow
  for (const k of [SURF.rough, SURF.fescue, SURF.fairway, SURF.tee, SURF.green]) assert.ok(SEED_LOOKS[k], `surface ${k}`);
  assert.equal(SEED_LOOKS[SURF.bunker], undefined); assert.equal(SEED_LOOKS[SURF.water], undefined);
});

// ---------- 3. the brush on your own range plot ----------
/** a stand-in range start: a 150 x 150 tile parcel at (20, 20), the range's plot in its road corner (35 x 75), the engine's land rules */
function rangeGame() {
  const g = makeGrid(0, 0, 400, 400), toasts: string[] = [], plans: { v: unknown[] } = { v: [] };
  const owned = (x: number, y: number) => x >= 20 && x < 170 && y >= 20 && y < 170, plot = (x: number, y: number) => x >= 20 && x < 55 && y >= 20 && y < 95;
  const host: PaintHost = {
    setLotGround() {}, emit() {}, save() {}, toast: t => { toasts.push(t); }, affine: o => { o[0] = 0; o[1] = 0; o[2] = 16; o[3] = 0; o[4] = 0; o[5] = 16; },
    placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [], golfMode: () => true, currentMonth: () => 0, money: () => 1e9, spend() {},
    grid: () => g, gridChanged() {}, plans: () => plans.v, setPlans: p => { plans.v = p; },
    ownedAt: (x, y) => owned(x, y) && !plot(x, y), landWhy: (x, y) => (plot(x, y) ? 'range' : owned(x, y) ? '' : 'off'),
  };
  const tool = new PaintTool(host); tool.enterCourse();
  return { g, tool, toasts };
}

test('3. in a range start your parcel paints outside the range\'s plot; the plot says the driving range stands there', () => {
  const { g, tool } = rangeGame();
  tool.setBrush('fairway');
  const why = tool.brushSkipWhy()!, skip = tool.brushSkip()!;
  let paintable = 0, onPlot = 0, off = 0;
  for (let y = 10.25; y < 180; y += 2) for (let x = 10.25; x < 180; x += 2) {
    const w = why(x, y), inPlot = x >= 20 && x < 55 && y >= 20 && y < 95, own = x >= 20 && x < 170 && y >= 20 && y < 170;
    if (inPlot) { assert.equal(w, 'The driving range stands here', `${x}, ${y}`); assert.equal(skip(x, y), true); onPlot++; }
    else if (own) { assert.equal(w, '', `${x}, ${y} is your land`); assert.equal(skip(x, y), false); paintable++; }
    else { assert.equal(w, LAND_WHY.off); off++; }
  }
  assert.ok(paintable > 4000 && onPlot > 500 && off > 1000, `${paintable} paintable, ${onPlot} on the plot, ${off} off the land`);
  // a dab on the parcel paints; a dab on the plot leaves it alone
  tool.setBrushR(2);
  tool.pointerDown({ x: 120.25, y: 120.25 }, 0, 0); tool.pointerUp(0.5);
  assert.equal(g.surf[cellAt(g, 120.25, 120.25)], SURF.fairway, 'painted on your parcel');
  tool.pointerDown({ x: 35.25, y: 50.25 }, 0, 0); tool.pointerUp(0.5);
  assert.equal(g.surf[cellAt(g, 35.25, 50.25)], SURF.none, 'the range plot stays the range\'s');
  const c = cellCentre(g, cellAt(g, 35.25, 50.25)); assert.equal(why(c.x, c.y), LAND_WHY.range);
  // the New hole wizard: a tee on the range's plot is refused with the range as the reason; on the parcel it builds
  assert.ok(tool.setPlan());
  const down = (x: number, y: number) => { tool.pointerDown({ x, y }, x * 16, y * 16); tool.pointerUp(0.5); };
  down(40, 60); down(40, 160);
  assert.equal(tool.wizard.check().why, 'The tee is on the driving range');
  tool.cancelPlan();
  assert.ok(tool.setPlan());
  down(100, 30); down(100, 160);
  assert.equal(tool.wizard.check().ok, true, tool.wizard.check().why);
  assert.ok(tool.buildPlan());
  assert.equal(g.surf[cellAt(g, 100.25, 100.25)], SURF.fairway, 'the hole is built on your parcel');
});
