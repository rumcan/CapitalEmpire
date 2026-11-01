// City blocks (src/game/blocks.ts): the faces a closed ring of ground streets encloses. A bridge does not wall a block, a huge loop is countryside,
// a dead-end street inside a block leaves it one block, and the keys follow the corners (same grid, same keys; a far street changes nothing).
// npm test (bundled by esbuild, run by node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, SK, type Leg, type SegKind } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { enclosedBlocks, blockDiff, type Block } from '../src/game/blocks';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
/** a committed network of streets (kinds optional, one per leg) */
function build(legs: Leg[], kinds?: SegKind[]): RoadNetwork {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs(legs, CLASS.street, 0, kinds);
  e.commit(true);
  return e.net;
}
/** the 40-tile square of four streets, as one closed chain of legs */
const SQUARE = [leg(0, 0, 40, 0), leg(40, 0, 40, 40), leg(40, 40, 0, 40), leg(0, 40, 0, 0)];
/** 4 streets each way at 0, 40, 80, 120: a 3 x 3 grid of 40-tile blocks */
const GRID = [0, 40, 80, 120].flatMap(v => [leg(0, v, 120, v), leg(v, 0, v, 120)]);
/** the block keys of a network, sorted */
const keysOf = (blocks: Block[]) => blocks.map(b => b.key).sort();

test('one square of four streets is one block of 1600 tiles²', () => {
  const blocks = enclosedBlocks(build(SQUARE));
  assert.equal(blocks.length, 1);
  assert.ok(Math.abs(blocks[0]!.area - 1600) <= 1, `area ${blocks[0]!.area}`);
  assert.equal(blocks[0]!.pts.length, 8);
});

test('a 3 x 3 street grid gives nine blocks of 1600 tiles²', () => {
  const blocks = enclosedBlocks(build(GRID));
  assert.equal(blocks.length, 9);
  for (const b of blocks) assert.ok(Math.abs(b.area - 1600) <= 1, `area ${b.area}`);
});

test('an open L and a single straight street give no blocks', () => {
  assert.equal(enclosedBlocks(build([leg(0, 0, 40, 0), leg(40, 0, 40, 40)])).length, 0);
  assert.equal(enclosedBlocks(build([leg(0, 0, 200, 0)])).length, 0);
});

test('a dead-end street poking into the square still leaves one block', () => {
  const blocks = enclosedBlocks(build([...SQUARE, leg(20, 0, 20, 20)]));
  assert.equal(blocks.length, 1);
  assert.ok(Math.abs(blocks[0]!.area - 1600) <= 1, `area ${blocks[0]!.area}`);
  assert.equal(blocks[0]!.key, enclosedBlocks(build(SQUARE))[0]!.key);
});

test('a square with one side a bridge is not a block', () => {
  assert.equal(enclosedBlocks(build(SQUARE, [SK.BRIDGE, SK.GROUND, SK.GROUND, SK.GROUND])).length, 0);
});

test('a 600 x 600 tile loop is countryside, not a block', () => {
  const big = [leg(0, 0, 600, 0), leg(600, 0, 600, 600), leg(600, 600, 0, 600), leg(0, 600, 0, 0)];
  assert.equal(enclosedBlocks(build(big)).length, 0);
});

test('block keys are stable across rebuilds and unaffected by a far-away street', () => {
  const k1 = keysOf(enclosedBlocks(build(GRID)));
  const k2 = keysOf(enclosedBlocks(build(GRID)));
  assert.deepEqual(k2, k1);
  const far = keysOf(enclosedBlocks(build([...GRID, leg(500, 500, 540, 500)])));
  assert.deepEqual(far, k1);
});

test('a street splitting one grid block gives drop 1, set 2', () => {
  const before = enclosedBlocks(build(GRID));
  const prev = new Map(before.map(b => [b.key, b] as const));
  const after = enclosedBlocks(build([...GRID, leg(40, 60, 80, 60)]));
  assert.equal(after.length, 10);
  const { set, drop } = blockDiff(prev, after);
  assert.equal(drop.length, 1);
  assert.equal(set.length, 2);
  assert.ok(drop.every(k => prev.has(k)));
  assert.ok(set.every(b => !prev.has(b.key)));
});

test('cart paths never close a block: a square of paved cart paths, and one cart path across a street block, leave the blocks as the streets make them', () => {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs(SQUARE, CLASS.cart!, 0); e.commit(true);
  assert.equal(enclosedBlocks(e.net).length, 0, 'four cart paths are no block');
  const f = new NetEditor(new RoadNetwork());
  f.addLegs(SQUARE, CLASS.street, 0); f.addLegs([leg(20, 0, 20, 40)], CLASS.cart!, 0); f.commit(true);
  assert.equal(enclosedBlocks(f.net).length, 1, 'a cart path does not split a street block');
});
