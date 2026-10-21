// Block lots (src/game/lots/blocklots.ts): the cut of a block's inner rectangle into cells, and the lots of a 3 x 3 street grid's middle block.
// npm test (bundled by esbuild, run by node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, SK, type Leg, type Pt } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { enclosedBlocks, type Block } from '../src/game/blocks';
import { subdivide, blockLots, type Cell } from '../src/game/lots/blocklots';
import { mulberry } from '../src/game/iso';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
/** a committed network of streets */
function build(legs: Leg[]): RoadNetwork {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs(legs, CLASS.street, 0);
  e.commit(true);
  return e.net;
}
/** 4 streets each way at 0, 40, 80, 120: a 3 x 3 grid of 40-tile blocks */
const GRID = [0, 40, 80, 120].flatMap(v => [leg(0, v, 120, v), leg(v, 0, v, 120)]);
/** the cells' areas sum to the rectangle and no two overlap by more than 0.01 */
function assertTiles(cells: Cell[], W: number, H: number) {
  const area = cells.reduce((s, c) => s + (c.x1 - c.x0) * (c.y1 - c.y0), 0);
  assert.ok(Math.abs(area - W * H) <= 1, `area ${area} vs ${W * H}`);
  for (const c of cells) assert.ok(Math.min(c.x1 - c.x0, c.y1 - c.y0) >= 6, `side under 6: ${JSON.stringify(c)}`);
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const p = cells[i]!, q = cells[j]!;
    const ox = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0), oy = Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0);
    assert.ok(!(ox > 0.01 && oy > 0.01), `cells overlap: ${JSON.stringify(p)} ${JSON.stringify(q)}`);
  }
}
/** does the cell touch the side it faces */
function touchesFront(c: Cell, W: number, H: number): boolean {
  return c.front === 0 ? c.y0 === 0 : c.front === 1 ? c.x1 === W : c.front === 2 ? c.y1 === H : c.x0 === 0;
}

test('subdivide(31, 31): the cells tile the square for 20 seeds, every side >= 6, every cell touches its front', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const cells = subdivide(31, 31, mulberry(seed));
    assertTiles(cells, 31, 31);
    for (const c of cells) assert.ok(touchesFront(c, 31, 31), `seed ${seed}: cell misses its front ${JSON.stringify(c)}`);
  }
});

// a jog needs a middle of at least 20 tiles, and 31 wide leaves at most 15 between the two end columns (8+ each), so 60 x 31 is used
test('subdivide(60, 31): some seeds jog the spine (two different spine depths)', () => {
  let jogs = 0;
  for (let seed = 1; seed <= 20; seed++) {
    // a jog shows as two top-row cells (side 0, between the end columns) whose depths (y1) differ
    const top = subdivide(60, 31, mulberry(seed)).filter(c => c.front === 0 && c.x0 > 0 && c.x1 < 60);
    if (new Set(top.map(c => c.y1)).size > 1) jogs++;
  }
  assert.ok(jogs >= 1, `no jog in 20 seeds`);
});

test('subdivide(60, 31): the spine runs along x (rows face sides 0 and 2)', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const cells = subdivide(60, 31, mulberry(seed));
    assertTiles(cells, 60, 31);
    assert.ok(cells.some(c => c.front === 0) && cells.some(c => c.front === 2), `seed ${seed}: no rows`);
    assert.ok(cells.every(c => c.front === 0 || c.front === 2 || c.front === 1 || c.front === 3));
  }
});

test('subdivide(31, 60): the spine runs along y (rows face sides 1 and 3), and the cells still tile', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const cells = subdivide(31, 60, mulberry(seed));
    assertTiles(cells, 31, 60);
    assert.ok(cells.some(c => c.front === 1) && cells.some(c => c.front === 3), `seed ${seed}: no rows`);
  }
});

test('blockLots on the middle block of a 3 x 3 street grid: 6-12 lots (10-14 tile widths), each on the street of its front, unit and orthogonal axes, inside the block', () => {
  const net = build(GRID);
  const blocks = enclosedBlocks(net);
  const mid = blocks.find((b: Block) => Math.min(...b.pts.filter((_, i) => i % 2 === 0)) === 40 && Math.min(...b.pts.filter((_, i) => i % 2 === 1)) === 40)!;
  assert.ok(mid, 'middle block found');
  const lots = blockLots(net, mid, null);
  assert.ok(lots, 'middle block is subdivided');
  console.log(`middle block: ${lots.length} lots`);
  assert.ok(lots.length >= 6 && lots.length <= 12, `lots ${lots.length}`);
  for (const l of lots) {
    // the front sits at the street's inset (h + walk + 0.5) from the street's line, and the seg is ground
    assert.equal(l.seg.kind, SK.GROUND);
    const dist = Math.hypot(l.front.x - l.seg.a.x, l.front.y - l.seg.a.y);
    assert.ok(dist >= l.seg.cls.h + l.seg.cls.walk, `front too close to its street: ${dist}`);
    assert.ok(Math.abs(Math.hypot(l.u.x, l.u.y) - 1) < 1e-6 && Math.abs(Math.hypot(l.n.x, l.n.y) - 1) < 1e-6, 'unit axes');
    assert.ok(Math.abs(l.u.x * l.n.x + l.u.y * l.n.y) < 1e-6, 'orthogonal axes');
    for (let i = 0; i < 4; i++) {
      const a = i & 1 ? l.w : 0, b = i & 2 ? l.d : 0;
      const p: Pt = { x: l.o.x + l.u.x * a + l.n.x * b, y: l.o.y + l.u.y * a + l.n.y * b };
      assert.ok(p.x >= 40 - 1e-6 && p.x <= 80 + 1e-6 && p.y >= 40 - 1e-6 && p.y <= 80 + 1e-6, `corner ${p.x},${p.y} leaves the block`);
    }
  }
});

test('blockLots: an open L (no block) gives null, and a block with no street on a side is not subdivided', () => {
  const open = build([leg(0, 0, 40, 0), leg(40, 0, 40, 40)]);
  assert.equal(enclosedBlocks(open).length, 0);
  const fake: Block = { key: 'block:none', pts: [0, 0, 40, 0, 40, 40, 0, 40], area: 1600, tex: 0 };
  assert.equal(blockLots(build([leg(0, 0, 40, 0)]), fake, null), null);
});
