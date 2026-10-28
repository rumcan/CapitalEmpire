// Pond edges (T231, src/game/golf/ponds.ts): a Stones pond's boulder pieces follow its shore (every stretch of shore has stones on it, every
// piece touches the shore), nothing lands on land (each piece's footprint lies on the pond's own water), the lily pads float on still water away
// from the edge and from a fountain, and all of it is deterministic (a change elsewhere in a pond moves no lily pad).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELL, LILY_EDGE, discCells, inPond, lilyPads, normalizePondMarks, pondAt, pondHasStones, setPondEdge, shorePieces, type Pond, type PondPiece, type Wet } from '../src/game/golf/ponds';
import { KIT_LILIES, KIT_POND_EDGE } from '../src/game/kit';
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
    assert.ok(pieces.every(q => [KIT_POND_EDGE.x, KIT_POND_EDGE.y, KIT_POND_EDGE.inner, KIT_POND_EDGE.outer].includes(q.id as never)), 'only the pond-edge pieces');
    // nothing on land: every cell under every footprint is the pond's
    for (const q of pieces) for (const [x, y] of cellsUnder(foot(q))) assert.ok(inPond(p, x, y), `${q.id} at ${q.x},${q.y} (x${q.s}) lies on dry cell ${x},${y}`);
    // follow the shore: every piece touches a shore cell (a water cell with dry land beside it, or the corner's cell next to one)
    const edges = shoreEdges(p), shoreCell = new Set(edges.map(([x, y]) => `${x},${y}`));
    const nearShore = (x: number, y: number) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (shoreCell.has(`${x + dx},${y + dy}`)) return true; return false; };
    for (const q of pieces) assert.ok(cellsUnder(foot(q)).some(([x, y]) => nearShore(x, y)), `${q.id} at ${q.x},${q.y} is off the shore`);
    // and the shore is lined: every shore edge has a piece over its cell or a neighbour's (a corner cluster covers the corner's cells)
    const covered = new Set<string>(); for (const q of pieces) for (const [x, y] of cellsUnder(foot(q))) covered.add(`${x},${y}`);
    const bare = edges.filter(([x, y]) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (covered.has(`${x + dx},${y + dy}`)) return false; return true; });
    assert.equal(bare.length, 0, `${bare.length} of ${edges.length} shore edges have no stones near: ${bare.slice(0, 4).map(e => e.join(',')).join(' ')}`);
    // deterministic
    assert.deepEqual(shorePieces(pondAt((cx + 0.5) * CELL, (cy + 0.5) * CELL, wet)!), pieces);
  });
}

test('lily pads float on still water away from the edge and from a fountain, and stay put when the pond changes elsewhere', () => {
  const cells = discCells(300, 300, 12), wet = wetOf(cells), p = pondAt(300, 300, wet)!;
  const fountain = { x: 300, y: 300 }, pads = lilyPads(p, [fountain]);
  assert.ok(pads.length >= 3, `${pads.length} lily pads on a 24-tile pond`);
  for (const q of pads) {
    assert.ok((KIT_LILIES as readonly string[]).includes(q.id));
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
