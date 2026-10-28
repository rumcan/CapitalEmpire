// Pond edges (T231, src/game/golf/ponds.ts): a Stones pond's boulder pieces follow its shore (every piece touches the shore, the shore is lined bar
// its gaps), nothing lands on land (each piece's footprint lies on the pond's own water), the lily pads float on still water away from the edge and
// from a fountain, and all of it is deterministic (a change elsewhere in a pond moves no lily pad).
// T234 (#683): the rim is a natural one, not a ring wall: its run pieces vary in size and in how far they stand in from the shore, short gaps (about
// 10% of the shore) hold a tuft of plume grass or a single boulder, the corners at the end of a straight stretch are as they were, and the lily
// pads are bigger and green.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { BOULDER_FOOT, CELL, CLUSTER_SHRINK, CORNER_BIG, CORNER_SMALL, LILY_EDGE, LILY_SIZE, PLUME_FOOT, RIM_IN, RIM_SCALE, discCells, inPond, lilyPads, normalizePondMarks, pondAt, pondHasStones, setPondEdge, shorePieces, type Pond, type PondPiece, type Wet } from '../src/game/golf/ponds';
import { KIT_BOULDERS, KIT_LILIES, KIT_PLUME, KIT_POND_EDGE } from '../src/game/kit';
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
/** every cell a footprint covers (shrunk 2 mm, so a footprint ending on a cell line, its corners rounded to the mm, does not count the next cell) */
function cellsUnder(f: [number, number, number, number]): [number, number][] {
  const out: [number, number][] = [], e = 0.002;
  for (let cy = Math.floor((f[1] + e) / CELL); cy <= Math.floor((f[3] - e) / CELL); cy++) for (let cx = Math.floor((f[0] + e) / CELL); cx <= Math.floor((f[2] - e) / CELL); cx++) out.push([cx, cy]);
  return out;
}
/** the shore edges of a pond: [cx, cy, side] for a water cell with a dry neighbour on that side (0 north, 1 south, 2 west, 3 east) */
function shoreEdges(p: Pond): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) {
    const cx = p.x0 + i, cy = p.y0 + j; if (!inPond(p, cx, cy)) continue;
    [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(([dx, dy], side) => { if (!inPond(p, cx + dx!, cy + dy!)) out.push([cx, cy, side]); });
  }
  return out;
}

const STONES: readonly string[] = [KIT_POND_EDGE.x, KIT_POND_EDGE.y, KIT_POND_EDGE.inner, KIT_POND_EDGE.outer];
const BOULDERS: readonly string[] = [...KIT_BOULDERS.small, ...KIT_BOULDERS.medium, ...KIT_BOULDERS.large];
/** the shore edges with no stone (a run piece or a corner cluster) over their own cell: the gaps (a tuft or a boulder in one is not stone) */
function bareEdges(p: Pond, pieces: PondPiece[]): [number, number, number][] {
  const covered = new Set<string>(); for (const q of pieces) if (STONES.includes(q.id)) for (const [x, y] of cellsUnder(foot(q))) covered.add(`${x},${y}`);
  return shoreEdges(p).filter(([x, y]) => !covered.has(`${x},${y}`));
}
const rect = (x: number, y: number, w: number, h: number): [number, number][] => Array.from({ length: w * h }, (_, k) => [x + (k % w), y + Math.floor(k / w)] as [number, number]);

const SHAPES: { name: string; cells: [number, number][] }[] = [
  { name: 'a round pond (radius 6 tiles)', cells: discCells(300, 300, 6) },
  { name: 'a rectangle 16 x 9 cells', cells: Array.from({ length: 16 * 9 }, (_, k) => [400 + (k % 16), 400 + Math.floor(k / 16)] as [number, number]) },
  // an L: a notch gives inner corners
  { name: 'an L-shaped pond', cells: [...Array.from({ length: 20 * 6 }, (_, k) => [600 + (k % 20), 600 + Math.floor(k / 20)] as [number, number]), ...Array.from({ length: 6 * 14 }, (_, k) => [600 + (k % 6), 606 + Math.floor(k / 6)] as [number, number])] },
  { name: 'a big kidney (radius 15 and 10 tiles, overlapping)', cells: [...new Map([...discCells(800, 800, 15), ...discCells(818, 806, 10)].map(c => [c.join(','), c])).values()] },
];

for (const shape of SHAPES) {
  test(`stones follow the shore and stay on the water: ${shape.name}`, () => {
    const wet = wetOf(shape.cells), [cx, cy] = shape.cells[Math.floor(shape.cells.length / 2)]!;
    const p = pondAt((cx + 0.5) * CELL, (cy + 0.5) * CELL, wet)!;
    assert.ok(p, 'the pond is found'); assert.equal(p.cells, shape.cells.length, 'every cell of the pond');
    const pieces = shorePieces(p);
    assert.ok(pieces.length > 0, 'stones laid');
    assert.ok(pieces.every(q => STONES.includes(q.id) || q.id === KIT_PLUME || BOULDERS.includes(q.id)), 'only the pond-edge stones, plume grass tufts and boulders');
    // nothing on land: every cell under every footprint is the pond's
    for (const q of pieces) for (const [x, y] of cellsUnder(foot(q))) assert.ok(inPond(p, x, y), `${q.id} at ${q.x},${q.y} (x${q.s}) lies on dry cell ${x},${y}`);
    // follow the shore: every piece touches a shore cell (a water cell with dry land beside it, or the corner's cell next to one)
    const edges = shoreEdges(p), shoreCell = new Set(edges.map(([x, y]) => `${x},${y}`));
    const nearShore = (x: number, y: number) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (shoreCell.has(`${x + dx},${y + dy}`)) return true; return false; };
    for (const q of pieces) assert.ok(cellsUnder(foot(q)).some(([x, y]) => nearShore(x, y)), `${q.id} at ${q.x},${q.y} is off the shore`);
    // and the shore is lined bar its gaps: at most a quarter of the shore edges have no stone over their cell (about a tenth: the rim's gaps), and
    // none has no stone, tuft or boulder within three cells (a gap is a metre or three, not a stretch)
    const bare = bareEdges(p, pieces);
    assert.ok(bare.length <= edges.length * 0.25, `${bare.length} of ${edges.length} shore edges have no stone`);
    const any = new Set<string>(); for (const q of pieces) for (const [x, y] of cellsUnder(foot(q))) any.add(`${x},${y}`);
    const lone = bare.filter(([x, y]) => { for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (any.has(`${x + dx},${y + dy}`)) return false; return true; });
    assert.equal(lone.length, 0, `${lone.length} shore edges are far from any piece: ${lone.slice(0, 4).map(e => e.join(',')).join(' ')}`);
    // deterministic
    assert.deepEqual(shorePieces(pondAt((cx + 0.5) * CELL, (cy + 0.5) * CELL, wet)!), pieces);
  });
}

/** the big ponds the rim is judged on: a 30 x 15 tile rectangle, a round pond of 15 tiles' radius and the kidney (all of them BIG_POND_CELLS and over) */
const BIG: { name: string; cells: [number, number][]; at: [number, number] }[] = [
  { name: 'a rectangle 60 x 30 cells', cells: rect(400, 400, 60, 30), at: [430, 415] },
  { name: 'a round pond (radius 15 tiles)', cells: discCells(300, 300, 15), at: [600, 600] },
  { name: 'a big kidney', cells: SHAPES[3]!.cells, at: [1600, 1600] },
];
const pondOf = (cells: [number, number][], at: [number, number]) => pondAt((at[0] + 0.5) * CELL, (at[1] + 0.5) * CELL, wetOf(cells))!;

for (const shape of BIG) {
  test(`the rim is not a ring wall: gaps, varied pieces, tufts and boulders, on ${shape.name}`, () => {
    const p = pondOf(shape.cells, shape.at), pieces = shorePieces(p), edges = shoreEdges(p);
    // gaps: about a tenth of the shore has no stone over it (from 3% to 25%)
    const bare = bareEdges(p, pieces), share = bare.length / edges.length;
    assert.ok(share >= 0.03 && share <= 0.25, `gaps are ${(share * 100).toFixed(1)}% of the shore`);
    // varied run pieces: their sizes spread over a good range, and every one within the stretch's cap (RIM_SCALE's top, over the mean)
    const runs = pieces.filter(q => q.id === KIT_POND_EDGE.x || q.id === KIT_POND_EDGE.y), sizes = runs.map(q => q.s);
    assert.ok(new Set(sizes).size >= 6, `${new Set(sizes).size} run piece sizes in ${runs.length} pieces`);
    assert.ok(Math.max(...sizes) / Math.min(...sizes) >= 1.25, `sizes ${Math.min(...sizes)} to ${Math.max(...sizes)}`);
    assert.ok(Math.max(...sizes) <= RIM_SCALE[1] + 0.001, `a run piece at ${Math.max(...sizes)}`);
    // tufts of plume grass and single boulders in the gaps and on joints, each of size 0.8 to 1.2
    const tufts = pieces.filter(q => q.id === KIT_PLUME), boulders = pieces.filter(q => BOULDERS.includes(q.id));
    assert.ok(tufts.length >= 1, 'a tuft of plume grass in a gap'); assert.ok(boulders.length >= 1, 'a single boulder');
    for (const q of [...tufts, ...boulders]) assert.ok(q.s >= RIM_SCALE[0] - 0.001 && q.s <= RIM_SCALE[1] + 0.001, `${q.id} at ${q.s}`);
    // the corners: only the cluster pictures at their sizes (shrunk by a staircase's loosening at most to CLUSTER_SHRINK)
    for (const q of pieces.filter(q => q.id === KIT_POND_EDGE.inner || q.id === KIT_POND_EDGE.outer)) {
      assert.ok(q.s <= CORNER_BIG + 0.001 && q.s >= CORNER_SMALL * CLUSTER_SHRINK - 0.001, `a corner cluster at ${q.s}`);
      assert.ok(q.s >= (q.s > CORNER_SMALL + 0.001 ? CORNER_BIG * CLUSTER_SHRINK : CORNER_SMALL * CLUSTER_SHRINK) - 0.001);
    }
    // deterministic: the same pond twice, and found again from another of its cells
    assert.deepEqual(shorePieces(pondOf(shape.cells, shape.at)), pieces);
    assert.deepEqual(shorePieces(pondAt((shape.cells[7]![0] + 0.5) * CELL, (shape.cells[7]![1] + 0.5) * CELL, wetOf(shape.cells))!), pieces);
  });
}

test('a rectangular pond: its four corners are as they were; its run pieces stand in from the shore line by different amounts, never out', () => {
  const cells = rect(400, 400, 60, 30), p = pondOf(cells, [430, 415]), pieces = shorePieces(p);
  // the four corners (outer clusters, a tile over their block): untouched by the loosening (a staircase's only)
  const outer = pieces.filter(q => q.id === KIT_POND_EDGE.outer);
  assert.equal(outer.length, 4); assert.ok(outer.every(q => q.s === CORNER_BIG), 'the corners keep their size');
  assert.deepEqual(outer.map(q => [q.x, q.y]).sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!), [[200.5, 200.5], [200.5, 214.5], [229.5, 200.5], [229.5, 214.5]]);
  // the offsets of the run pieces along the long sides (axis x) from the shore line: a few distinct amounts, all in [0, RIM_IN], none out
  const north = 400 * CELL, south = 430 * CELL, offsets: number[] = [];
  for (const q of pieces.filter(q => q.id === KIT_POND_EDGE.x)) {
    const f = foot(q); offsets.push(q.y < (north + south) / 2 ? f[1] - north : south - f[3]);
  }
  assert.ok(offsets.length >= 8, `${offsets.length} run pieces`);
  assert.ok(offsets.every(o => o >= -0.002 && o <= RIM_IN + 0.002), `offsets ${Math.min(...offsets)} to ${Math.max(...offsets)}`);
  assert.ok(new Set(offsets.map(o => Math.round(o * 20))).size >= 3, 'the pieces stand in by different amounts');
});

test('a stretch of shore is laid from its own place: a bay dug on the far side moves none of its pieces', () => {
  const cells = rect(400, 400, 60, 30), p = pondOf(cells, [430, 415]), pieces = shorePieces(p);
  // a bay on the east side (the column x = 459 is the pond's last): the west column's pieces (x < 202) stay put
  const grown = [...new Map([...cells, ...discCells(232, 207.5, 4)].map(c => [c.join(','), c])).values()], p2 = pondOf(grown, [430, 415]), pieces2 = shorePieces(p2);
  assert.ok(p2.cells > p.cells, 'the bay is part of the pond');
  const west = pieces.filter(q => q.x < 202), west2 = pieces2.filter(q => q.x < 202);
  assert.ok(west.length >= 8, `${west.length} pieces on the west side`);
  assert.deepEqual(west2, west);
  assert.deepEqual(pieces2.filter(q => q.y < 202 && q.x < 228), pieces.filter(q => q.y < 202 && q.x < 228), 'the north shore is laid the same');
  assert.notDeepEqual(pieces2, pieces, 'the east side changed');
});

test('the gap fillers: the library boxes are what ponds.ts fits them by, so a tuft or boulder never lands on land', () => {
  const side = (id: string) => { const b = BY.get(id)!.boxes[0]!; assert.equal(b.hx, b.hy); assert.equal(b.dx, 0); assert.equal(b.dy, 0); return b.hx; };
  assert.equal(side(KIT_PLUME), PLUME_FOOT);
  for (const id of KIT_BOULDERS.small) assert.equal(side(id), BOULDER_FOOT.small);
  for (const id of KIT_BOULDERS.medium) assert.equal(side(id), BOULDER_FOOT.medium);
  for (const id of KIT_BOULDERS.large) assert.equal(side(id), BOULDER_FOOT.large);
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
