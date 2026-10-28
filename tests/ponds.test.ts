// Pond edges (T231, src/game/golf/ponds.ts): a Stones pond's rim follows its shore, the lily pads float on still water away from the edge and from a
// fountain, and all of it is deterministic (a change elsewhere in a pond moves none of the rim far away, and no lily pad).
// T234 (#683) part 2: the rim is boulder-led, as in the concept: large and medium boulders (item 36) a metre or two across, set every 1.5 to 3 m
// along the shore half on the bank and half in the water, short fills of the small stones in some breaks of a straight shore (at most a third of
// it), and planting (plume grass, shrubs, mums) on the bank in the gaps, about a plant to each 3 to 5 m. The rule on footprints: a boulder or a fill
// never stands more than 0.5 tile (1 m) out onto land; the planting is wholly on the bank (never on any water), within 2 tiles of the water.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { BIG_POND_CELLS, BOULDER_FOOT, CELL, FILL_COVER, LAND_REACH, LILY_EDGE, LILY_SIZE, PLANT_FOOT, PLANT_REACH, PLUME_FOOT, RIM_BLOCK, RIM_FILL, RIM_LARGE, RIM_MEDIUM, discCells, inPond, lilyPads, normalizePondMarks, pondAt, pondHasStones, setPondEdge, shorePieces, shoreRuns, type Pond, type PondPiece, type Wet } from '../src/game/golf/ponds';
import { KIT_BOULDERS, KIT_FLOWERS, KIT_LILIES, KIT_PLUME, KIT_POND_EDGE, KIT_SHRUBS } from '../src/game/kit';
import { LIBRARY } from '../src/game/library';

const BY = new Map(LIBRARY.map(it => [it.id, it]));
/** a piece's footprint (tiles), as the engine works it out (engine.ts footprint: a box's half extents in metres x scale / 2) */
function foot(q: PondPiece): [number, number, number, number] {
  const it = BY.get(q.id); assert.ok(it, `${q.id} is in the library`);
  const b = it!.boxes[0]!, hx = b.hx * q.s / 2, hy = b.hy * q.s / 2, dx = b.dx * q.s / 2, dy = b.dy * q.s / 2;
  return [q.x + dx - hx, q.y + dy - hy, q.x + dx + hx, q.y + dy + hy];
}
/** a wet lattice from a set of cells */
const wetOf = (cells: [number, number][]): Wet => { const s = new Set(cells.map(([x, y]) => `${x},${y}`)); return (x, y) => s.has(`${x},${y}`); };
const rect = (x: number, y: number, w: number, h: number): [number, number][] => Array.from({ length: w * h }, (_, k) => [x + (k % w), y + Math.floor(k / w)] as [number, number]);
const union = (...ls: [number, number][][]): [number, number][] => [...new Map(ls.flat().map(c => [c.join(','), c])).values()];

/** every cell a footprint covers (shrunk 2 mm, so a footprint ending on a cell line, its corners rounded to the mm, does not count the next cell) */
function cellsUnder(f: [number, number, number, number]): [number, number][] {
  const out: [number, number][] = [], e = 0.002;
  for (let cy = Math.floor((f[1] + e) / CELL); cy <= Math.floor((f[3] - e) / CELL); cy++) for (let cx = Math.floor((f[0] + e) / CELL); cx <= Math.floor((f[2] - e) / CELL); cx++) out.push([cx, cy]);
  return out;
}

const STONES: readonly string[] = [KIT_POND_EDGE.x, KIT_POND_EDGE.y];
const BOULDERS: readonly string[] = [...KIT_BOULDERS.small, ...KIT_BOULDERS.medium, ...KIT_BOULDERS.large];
const LARGE: readonly string[] = KIT_BOULDERS.large, MEDIUM: readonly string[] = KIT_BOULDERS.medium;
const PLANTS: readonly string[] = [...KIT_SHRUBS, ...KIT_FLOWERS];
const isBoulder = (q: PondPiece) => BOULDERS.includes(q.id), isStone = (q: PondPiece) => STONES.includes(q.id), isPlant = (q: PondPiece) => PLANTS.includes(q.id);

/** the distance (tiles) from a point to the nearest water cell of the pond: 0 on water (this test's own, not the engine's) */
function toWater(p: Pond, x: number, y: number): number {
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL); let best = Infinity;
  for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) {
    if (!inPond(p, cx + i, cy + j)) continue;
    const rx = (cx + i) * CELL, ry = (cy + j) * CELL, d = Math.hypot(Math.max(rx - x, 0, x - rx - CELL), Math.max(ry - y, 0, y - ry - CELL));
    if (d < best) best = d;
  }
  return best;
}
/** the furthest any point of a footprint lies from the pond's water (sampled every 0.05 tile, the edges and corners included, shrunk 1 mm) */
function reach(p: Pond, f: [number, number, number, number]): number {
  const e = 0.001, nx = Math.ceil((f[2] - f[0]) / 0.05), ny = Math.ceil((f[3] - f[1]) / 0.05); let worst = 0;
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) worst = Math.max(worst, toWater(p, f[0] + e + (f[2] - f[0] - 2 * e) * i / nx, f[1] + e + (f[3] - f[1] - 2 * e) * j / ny));
  return worst;
}
/** does any sampled point of a footprint lie on one of the wet cells */
function onWater(wet: Wet, f: [number, number, number, number]): boolean {
  const e = 0.001, nx = Math.ceil((f[2] - f[0]) / 0.05), ny = Math.ceil((f[3] - f[1]) / 0.05);
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) if (wet(Math.floor((f[0] + e + (f[2] - f[0] - 2 * e) * i / nx) / CELL), Math.floor((f[1] + e + (f[3] - f[1] - 2 * e) * j / ny) / CELL))) return true;
  return false;
}
/** the shore edges' midpoints (tiles) of a pond, from the runs; and the length of the shore (tiles: the outline's chords every 4 sides, so a staircase counts as the diagonal it is) */
function shoreOf(p: Pond): { mids: [number, number][]; length: number } {
  const mids: [number, number][] = []; let length = 0;
  for (const r of shoreRuns(p)) {
    const n = r.vx.length - 1;
    for (let i = 0; i < n; i++) mids.push([(r.vx[i]! + r.vx[i + 1]!) / 2 * CELL, (r.vy[i]! + r.vy[i + 1]!) / 2 * CELL]);
    for (let i = 0; i < n; i += 4) { const j = Math.min(n, i + 4); length += Math.hypot(r.vx[j]! - r.vx[i]!, r.vy[j]! - r.vy[i]!) * CELL; }
  }
  return { mids, length };
}
/** the distance from a point to a footprint (0 inside it) */
const toFoot = (f: [number, number, number, number], x: number, y: number) => Math.hypot(Math.max(f[0] - x, 0, x - f[2]), Math.max(f[1] - y, 0, y - f[3]));
/** the share of the shore's edges (midpoints) within 0.25 tile of a footprint of the pieces */
const shoreNear = (mids: [number, number][], pieces: PondPiece[]): number => { const fs = pieces.map(foot); return mids.filter(([x, y]) => fs.some(f => toFoot(f, x, y) <= 0.25)).length / mids.length; };
/** the rule on footprints, for every piece of a rim */
function checkRule(p: Pond, wet: Wet, pieces: PondPiece[]) {
  for (const q of pieces) {
    const f = foot(q);
    if (isPlant(q)) {
      assert.ok(!onWater(wet, f), `the plant ${q.id} at ${q.x},${q.y} (x${q.s}) stands on water`);
      assert.ok(reach(p, f) <= PLANT_REACH, `the plant ${q.id} at ${q.x},${q.y} is ${reach(p, f).toFixed(2)} tiles from the water`);
    } else {
      assert.ok(isBoulder(q) || isStone(q), `${q.id} is a boulder, a stone run piece or a plant`);
      assert.ok(reach(p, f) <= LAND_REACH + 0.002, `${q.id} at ${q.x},${q.y} (x${q.s}) stands ${reach(p, f).toFixed(3)} tiles out onto land (the most is ${LAND_REACH})`);
      assert.ok(onWater(p.wet ?? wet, f), `${q.id} at ${q.x},${q.y} stands wholly on land: it is meant to straddle the shore`);
    }
  }
}

const SHAPES: { name: string; cells: [number, number][] }[] = [
  { name: 'a round pond (radius 6 tiles)', cells: discCells(300, 300, 6) },
  { name: 'a rectangle 16 x 9 cells', cells: rect(400, 400, 16, 9) },
  // an L: a notch gives inner corners
  { name: 'an L-shaped pond', cells: [...rect(600, 600, 20, 6), ...rect(600, 606, 6, 14)] },
  { name: 'a big kidney (radius 15 and 10 tiles, overlapping)', cells: union(discCells(800, 800, 15), discCells(818, 806, 10)) },
  // a ring of water round an island
  { name: 'a pond with an island', cells: discCells(1000, 1000, 10).filter(([x, y]) => Math.hypot((x + 0.5) * CELL - 1000, (y + 0.5) * CELL - 1000) > 3) },
];

for (const shape of SHAPES) {
  test(`the rim follows the shore and keeps the rule on footprints: ${shape.name}`, () => {
    const wet = wetOf(shape.cells), [cx, cy] = shape.cells[Math.floor(shape.cells.length / 2)]!;
    const p = pondAt((cx + 0.5) * CELL, (cy + 0.5) * CELL, wet)!;
    assert.ok(p, 'the pond is found'); assert.equal(p.cells, shape.cells.length, 'every cell of the pond');
    const pieces = shorePieces(p);
    assert.ok(pieces.length > 0, 'a rim laid');
    assert.ok(pieces.every(q => isBoulder(q) || isStone(q) || isPlant(q)), 'only boulders, the small-stone run pieces and plants');
    // the rule: boulders and fills no more than half a tile out onto land and standing in the water too; plants on the bank
    checkRule(p, wet, pieces);
    // follow the shore: every boulder and fill's footprint is within half a tile of a shore edge, every plant within 1.6 tiles
    const { mids } = shoreOf(p);
    for (const q of pieces) { const f = foot(q); assert.ok(mids.some(([x, y]) => toFoot(f, x, y) <= (isPlant(q) ? 1.6 : 0.5)), `${q.id} at ${q.x},${q.y} is off the shore`); }
    // and the shore is mostly boulders: at least a third of its edges have one within 0.25 tile (a small pond or a short shore is a few boulders)
    assert.ok(shoreNear(mids, pieces.filter(isBoulder)) >= 0.33, `boulders by ${(100 * shoreNear(mids, pieces.filter(isBoulder))).toFixed(0)}% of the shore edges`);
    // deterministic
    assert.deepEqual(shorePieces(pondAt((cx + 0.5) * CELL, (cy + 0.5) * CELL, wet)!), pieces);
  });
}

test('the shore runs: every side between water and land once, the water on the right hand, each run in one block', () => {
  for (const shape of SHAPES) {
    const wet = wetOf(shape.cells), p = pondAt((shape.cells[0]![0] + 0.5) * CELL, (shape.cells[0]![1] + 0.5) * CELL, wet)!;
    const at = (cx: number, cy: number) => inPond(p, cx, cy);
    let sides = 0; for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) if (p.mask[j * p.w + i]) { const cx = p.x0 + i, cy = p.y0 + j; sides += +!at(cx, cy - 1) + +!at(cx + 1, cy) + +!at(cx, cy + 1) + +!at(cx - 1, cy); }
    const runs = shoreRuns(p); let n = 0;
    for (const r of runs) {
      n += r.vx.length - 1;
      const blocks = new Set<number>();
      for (let i = 0; i + 1 < r.vx.length; i++) {
        const dx = r.vx[i + 1]! - r.vx[i]!, dy = r.vy[i + 1]! - r.vy[i]!; assert.equal(Math.abs(dx) + Math.abs(dy), 1, 'a side a cell long');
        // the cell on the right of the side is water and the one on the left is not: right of (dx, dy) is (-dy, dx), the side's midpoint nudged by a quarter cell
        const mx = (r.vx[i]! + r.vx[i + 1]!) / 2, my = (r.vy[i]! + r.vy[i + 1]!) / 2, rc = [Math.floor(mx - dy * 0.25 + 1e-9 * 0), Math.floor(my + dx * 0.25)] as const, lc = [Math.floor(mx + dy * 0.25), Math.floor(my - dx * 0.25)] as const;
        assert.ok(at(rc[0], rc[1]) && !at(lc[0], lc[1]), `water on the right of side ${i} of a run of ${shape.name}`);
        blocks.add(Math.floor(rc[1] / RIM_BLOCK) * 4096 + Math.floor(rc[0] / RIM_BLOCK));
      }
      assert.equal(blocks.size, 1, 'a run keeps to one block of the lattice');
      if (r.closed) assert.ok(r.vx[0] === r.vx[r.vx.length - 1] && r.vy[0] === r.vy[r.vy.length - 1], 'a closed run ends where it began');
    }
    assert.equal(n, sides, `${shape.name}: every shore side is in a run once`);
  }
});

/** the big ponds the rim is judged on: a 30 x 15 tile rectangle, a round pond of 15 tiles' radius and the kidney (all of them BIG_POND_CELLS and over) */
const BIG: { name: string; cells: [number, number][]; at: [number, number] }[] = [
  { name: 'a rectangle 60 x 30 cells', cells: rect(400, 400, 60, 30), at: [430, 415] },
  { name: 'a round pond (radius 15 tiles)', cells: discCells(300, 300, 15), at: [600, 600] },
  { name: 'a big kidney', cells: SHAPES[3]!.cells, at: [1600, 1600] },
];
const pondOf = (cells: [number, number][], at: [number, number]) => pondAt((at[0] + 0.5) * CELL, (at[1] + 0.5) * CELL, wetOf(cells))!;

for (const shape of BIG) {
  test(`the rim is boulders with gaps and planting, as in the concept, on ${shape.name}`, () => {
    const p = pondOf(shape.cells, shape.at), wet = wetOf(shape.cells), pieces = shorePieces(p), { mids, length } = shoreOf(p), metres = length * 2;
    assert.ok(p.cells >= BIG_POND_CELLS);
    const boulders = pieces.filter(isBoulder), stones = pieces.filter(isStone), plants = pieces.filter(isPlant);
    // most of the rim is boulders: more of the shore has one by it than has a fill, and the fills are no more than a third of the shore
    assert.ok(boulders.length >= 5 * stones.length, `${boulders.length} boulders, ${stones.length} stone run pieces`);
    assert.ok(shoreNear(mids, boulders) >= 0.6, `boulders by ${(100 * shoreNear(mids, boulders)).toFixed(0)}% of the shore edges`);
    const fillLen = stones.reduce((a, q) => a + KIT_POND_EDGE.len * q.s, 0);
    assert.ok(fillLen <= length / 3 + 0.01, `fills ${fillLen.toFixed(1)} tiles of a shore of ${length.toFixed(1)}`);
    assert.ok(fillLen <= FILL_COVER * length * 1.05 + 0.01);
    for (const q of stones) assert.ok(q.s >= RIM_FILL[0] - 0.001 && q.s <= RIM_FILL[1] + 0.001, `a fill at ${q.s}`);
    // only the large and medium boulders (item 36), 1 to 2 m across (the footprint's side), of both sizes and of more than one shape, none mirrored (no flip field)
    assert.ok(boulders.every(q => LARGE.includes(q.id) || MEDIUM.includes(q.id)), 'large and medium boulders only');
    for (const q of boulders) {
      const metresAcross = (LARGE.includes(q.id) ? BOULDER_FOOT.large : BOULDER_FOOT.medium) * q.s * 2;
      assert.ok(metresAcross >= 0.75 && metresAcross <= 2.0 + 0.01, `${q.id} is ${metresAcross.toFixed(2)} m across`);
    }
    assert.ok(boulders.some(q => LARGE.includes(q.id)) && boulders.some(q => MEDIUM.includes(q.id)), 'large and medium boulders');
    assert.ok(new Set(boulders.map(q => q.id)).size >= 4, `${new Set(boulders.map(q => q.id)).size} boulder pictures`);
    assert.ok(new Set(boulders.map(q => q.s)).size >= 10, 'sizes vary');
    const large = boulders.filter(q => LARGE.includes(q.id)), medium = boulders.filter(q => MEDIUM.includes(q.id));
    assert.ok(Math.min(...large.map(q => q.s)) >= RIM_LARGE[0] * 0.7 - 0.001 && Math.max(...large.map(q => q.s)) <= RIM_LARGE[1] + 0.001);
    assert.ok(Math.min(...medium.map(q => q.s)) >= RIM_MEDIUM[0] * 0.7 - 0.001 && Math.max(...medium.map(q => q.s)) <= RIM_MEDIUM[1] + 0.001);
    // a boulder every 1.5 to 3 m of shore (the shore's metres over the boulders), and each boulder's nearest neighbour a metre or two away
    const every = metres / boulders.length; assert.ok(every >= 1.5 && every <= 3.2, `a boulder every ${every.toFixed(2)} m`);
    const nn = boulders.map(a => Math.min(...boulders.filter(b => b !== a).map(b => Math.hypot(a.x - b.x, a.y - b.y)))), meanNn = nn.reduce((a, b) => a + b, 0) / nn.length;
    assert.ok(meanNn >= 0.5 && meanNn <= 1.4, `the nearest boulder is ${meanNn.toFixed(2)} tiles off on average`);
    // planting: plume grass, shrubs and mums among them, one plant to each 3 to 5 m of shore (a little slack), all on the bank
    const each = metres / plants.length; assert.ok(each >= 2.8 && each <= 6, `a plant every ${each.toFixed(2)} m`);
    assert.ok(plants.some(q => q.id === KIT_PLUME), 'plume grass'); assert.ok(plants.some(q => (KIT_SHRUBS as readonly string[]).includes(q.id) && q.id !== KIT_PLUME), 'a shrub'); assert.ok(plants.some(q => (KIT_FLOWERS as readonly string[]).includes(q.id)), 'mums');
    // the rule on footprints
    checkRule(p, wet, pieces);
    // deterministic: the same pond twice, and found again from another of its cells
    assert.deepEqual(shorePieces(pondOf(shape.cells, shape.at)), pieces);
    assert.deepEqual(shorePieces(pondAt((shape.cells[7]![0] + 0.5) * CELL, (shape.cells[7]![1] + 0.5) * CELL, wetOf(shape.cells))!), pieces);
  });
}

test('a straight shore takes short fills of the small stones; the stones follow the shore line and are shorter than the stretch', () => {
  const cells = rect(400, 400, 60, 30), p = pondOf(cells, [430, 415]), pieces = shorePieces(p), stones = pieces.filter(isStone);
  assert.ok(stones.length >= 2, `${stones.length} fills on a rectangle`);
  for (const q of stones) {
    const f = foot(q), len = KIT_POND_EDGE.len * q.s;
    assert.ok(len >= KIT_POND_EDGE.len * RIM_FILL[0] - 0.01 && len <= KIT_POND_EDGE.len * RIM_FILL[1] + 0.01, `a fill ${len.toFixed(2)} tiles long`);
    // along the long sides (x pieces) or the short ones (y pieces) of the rectangle, in the water (a little onto the bank at most)
    assert.ok((q.id === KIT_POND_EDGE.x) === (f[2] - f[0] > f[3] - f[1]), 'the piece along x lies along x');
  }
});

test('a small pond (under 500 cells) takes medium boulders and a few plants, no large ones', () => {
  for (const r of [3, 5, 6]) {
    const cells = discCells(300, 300, r), wet = wetOf(cells), p = pondAt(300, 300, wet)!, pieces = shorePieces(p);
    assert.ok(p.cells < BIG_POND_CELLS, `${p.cells} cells`);
    assert.ok(pieces.filter(isBoulder).length >= 6, `${pieces.filter(isBoulder).length} boulders round a pond of ${r} tiles' radius`);
    assert.ok(pieces.filter(isBoulder).every(q => MEDIUM.includes(q.id)), 'medium boulders only');
    assert.ok(pieces.filter(isPlant).length >= 3 && pieces.filter(isPlant).length <= pieces.filter(isBoulder).length, `${pieces.filter(isPlant).length} plants`);
    checkRule(p, wet, pieces);
  }
});

test('the planting keeps off all water, another pond\'s as well', () => {
  // two ponds a cell apart (not one pond: the 4-neighbour water is split by a strip of land one cell wide)
  const a = rect(400, 400, 60, 30), b = rect(461, 400, 40, 30), both = union(a, b), wet = wetOf(both), p = pondAt(430 * CELL + 0.25, 415 * CELL + 0.25, wet)!;
  assert.equal(p.cells, a.length, 'the first pond only');
  const pieces = shorePieces(p), plants = pieces.filter(isPlant);
  assert.ok(plants.length >= 10);
  for (const q of plants) assert.ok(!onWater(wet, foot(q)), `the plant at ${q.x},${q.y} stands on water`);
  // boulders still stand only on this pond's shore: no more than 0.5 tile out onto land (the strip between is a cell wide)
  checkRule(p, wet, pieces);
});

test('a stretch of shore is laid from its own place: a bay dug on the far side moves none of the rim far from it', () => {
  const cells = rect(400, 400, 60, 30), p = pondOf(cells, [430, 415]), pieces = shorePieces(p);
  // a bay on the east side (the column x = 459 is the pond's last): everything west of the blocks it touches (x < 218) stays put
  const grown = union(cells, discCells(232, 207.5, 4)), p2 = pondOf(grown, [430, 415]), pieces2 = shorePieces(p2);
  assert.ok(p2.cells > p.cells, 'the bay is part of the pond');
  const west = pieces.filter(q => q.x < 218), west2 = pieces2.filter(q => q.x < 218);
  assert.ok(west.length >= 40, `${west.length} pieces on the west side`);
  assert.deepEqual(west2, west);
  assert.notDeepEqual(pieces2, pieces, 'the east side changed');
});

test('the fillers\' boxes: the library boxes are what ponds.ts fits them by, so a boulder or a plant is the size the rim thinks', () => {
  const side = (id: string) => { const b = BY.get(id)!.boxes[0]!; assert.equal(b.hx, b.hy); assert.equal(b.dx, 0); assert.equal(b.dy, 0); return b.hx; };
  assert.equal(side(KIT_PLUME), PLUME_FOOT);
  for (const id of KIT_BOULDERS.small) assert.equal(side(id), BOULDER_FOOT.small);
  for (const id of KIT_BOULDERS.medium) assert.equal(side(id), BOULDER_FOOT.medium);
  for (const id of KIT_BOULDERS.large) assert.equal(side(id), BOULDER_FOOT.large);
  for (const id of PLANTS) assert.equal(side(id), PLANT_FOOT[id], id);
  // the run pieces: 4 x 1 tiles
  const x = BY.get(KIT_POND_EDGE.x)!.boxes[0]!, y = BY.get(KIT_POND_EDGE.y)!.boxes[0]!;
  assert.deepEqual([x.hx, x.hy, y.hx, y.hy], [KIT_POND_EDGE.len, KIT_POND_EDGE.depth, KIT_POND_EDGE.depth, KIT_POND_EDGE.len]);
});

test('lily pads float on still water away from the edge and from a fountain, and stay put when the pond changes elsewhere', () => {
  const cells = discCells(300, 300, 12), wet = wetOf(cells), p = pondAt(300, 300, wet)!;
  const fountain = { x: 300, y: 300 }, pads = lilyPads(p, [fountain]);
  assert.ok(pads.length >= 3, `${pads.length} lily pads on a 24-tile pond`);
  for (const q of pads) {
    assert.ok((KIT_LILIES as readonly string[]).includes(q.id));
    assert.ok(q.s >= LILY_SIZE[0] - 0.001 && q.s <= LILY_SIZE[1] + 0.001, `a cluster at ${q.s}`);
    // on water, LILY_EDGE cells from the shore all round, and every cell under it the pond's
    const c = [Math.floor(q.x / CELL), Math.floor(q.y / CELL)] as const;
    for (let dy = -LILY_EDGE; dy <= LILY_EDGE; dy++) for (let dx = -LILY_EDGE; dx <= LILY_EDGE; dx++) assert.ok(inPond(p, c[0] + dx, c[1] + dy), `a lily pad at ${q.x},${q.y} is within ${LILY_EDGE} cells of the shore`);
    for (const [x, y] of cellsUnder(foot(q))) assert.ok(inPond(p, x, y), `a lily pad at ${q.x},${q.y} reaches land`);
    assert.ok(Math.hypot(q.x - fountain.x, q.y - fountain.y) >= 2, 'clear of the fountain');
  }
  // a bay dug out on the far side moves no pad on this side
  const grown = wetOf([...cells, ...discCells(318, 300, 6)]), p2 = pondAt(300, 300, grown)!, pads2 = lilyPads(p2, [fountain]);
  for (const q of pads.filter(q => q.x < 300)) assert.ok(pads2.some(r => r.id === q.id && r.x === q.x && r.y === q.y && r.s === q.s), 'a pad on the other side stays put');
  assert.deepEqual(lilyPads(p, [fountain]), pads, 'deterministic');
});

test('a puddle and the open lake get no edge; a dry spot is no pond', () => {
  assert.equal(pondAt(10, 10, () => false), null, 'dry');
  assert.equal(pondAt(10, 10, () => true, 5000), null, 'water past the limit (a lake) is no pond');
  const puddle = pondAt(0.25, 0.25, wetOf([[0, 0], [1, 0], [0, 1]]))!;
  assert.ok(puddle); assert.deepEqual(shorePieces(puddle), []); assert.deepEqual(lilyPads(puddle), []);
});

test('the edge marks: a pond is Stones when a mark stands in it; Natural takes every mark in it out', () => {
  const a = pondAt(300, 300, wetOf(discCells(300, 300, 5)))!, b = pondAt(400, 400, wetOf(discCells(400, 400, 5)))!;
  let marks = setPondEdge([], a, true, 300, 300);
  assert.ok(pondHasStones(marks, a)); assert.ok(!pondHasStones(marks, b));
  marks = setPondEdge(marks, b, true, 401, 399); marks = setPondEdge(marks, a, true, 302, 301); // a second mark in a replaces the first
  assert.equal(marks.length, 4);
  marks = setPondEdge(marks, a, false, 300, 300);
  assert.ok(!pondHasStones(marks, a)); assert.ok(pondHasStones(marks, b));
  assert.deepEqual(normalizePondMarks([1, 2, 'x', 4, 5, NaN, 7]), [1, 2]);
  assert.deepEqual(normalizePondMarks(null), []);
});

test('the lily pad pictures read as green pads with white flowers (T234: the autumn art was olive and orange, a gold dot at 30% zoom)', () => {
  for (const v of ['a', 'b', 'c', 'd']) {
    const file = resolve(`art/concept-kit/lily-pads-${v}.webp`);
    const code = `import sharp from 'sharp'; const d = await sharp(${JSON.stringify(file)}).ensureAlpha().raw().toBuffer(); process.stdout.write(d.toString('base64'));`;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', maxBuffer: 1 << 24 });
    assert.equal(r.status, 0, r.stderr);
    const px = Buffer.from(r.stdout, 'base64');
    let n = 0, green = 0, pale = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3]! < 200) continue; n++;
      const R = px[i]! / 255, G = px[i + 1]! / 255, B = px[i + 2]! / 255, mx = Math.max(R, G, B), d = mx - Math.min(R, G, B);
      const h = d === 0 ? 0 : (mx === R ? ((G - B) / d + 6) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4) * 60;
      if (mx > 0.8 && d / mx < 0.35 && (h < 40 || h > 300)) pale++; // a petal: bright, barely saturated, a little pink
      else if (d / mx >= 0.2 && h >= 80 && h <= 150) green++;
    }
    assert.ok(green / n >= 0.7, `lily-pads-${v}: ${(100 * green / n).toFixed(0)}% of its pixels are green`);
    assert.ok(pale >= 80, `lily-pads-${v}: ${pale} white petal pixels (the flowers)`);
  }
});
