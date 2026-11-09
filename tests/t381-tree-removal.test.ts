// T381 (#1037, the owner, 2026-11-08: "I wanted to bulldoze some trees but I could not." / "tried the Rub out button on paint for trees and it does nothing."):
// why each failed, and the fix. Rub out (engine unplantProps) took only the props a plant brush placed (Prop.plant); the bulldozer picked only props
// (propAt: "forest trees are not props: never picked", and a road's own trees were skipped as auto props). The map's trees (the forest, the river belts
// of T265 in the forest's cells, and the town's street trees) are sprites planted per cell by pure functions of the seed (forest.ts, river-trees.ts,
// towntrees.ts), so there was nothing to remove and nothing to remember: a cell planted again would bring a removed tree back. Now every tree has a key
// (its source place: treecut.ts), a taken tree's key is kept (and saved), the cells plant without it, and undo gives it back.
// The in-game run (rub out and bulldoze each kind of tree, undo, save and load) is scripts/dev/t381-tree-removal-shots.mjs.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAP } from '../src/game/iso';
import { TC, generateTerrain } from '../src/game/terrain';
import { makeNoise } from '../src/game/terrain/noise';
import { slopeField } from '../src/game/terrain-paint';
import { FOREST_CELL, forestCell, type ForestTree } from '../src/game/forest';
import { townTreeCell } from '../src/game/towntrees';
import { BELT, beltField, riverBeltCell } from '../src/game/river-trees';
import { BLADE_R, TreeCut, keyPos, treeKey } from '../src/game/treecut';
import { PaintTool, type PaintHost } from '../src/game/paint-tool';

const seed = 1, t = generateTerrain(seed), slope = slopeField(t.height), clearing = makeNoise(t.seed ^ 0x5f0e), clump = makeNoise(t.seed ^ 0x7c1a), belt = beltField(t.seed, t.waters);
const N = MAP / FOREST_CELL, always = () => true;
/** the forest, the town's and the river belts' trees of every cell of the map (the town's with every spot "in a town") */
function cellsWith(kind: 'forest' | 'town' | 'belt', min: number): { ci: number; cj: number; trees: ForestTree[] }[] {
  const out: { ci: number; cj: number; trees: ForestTree[] }[] = [];
  for (let cj = 0; cj < N; cj++) for (let ci = 0; ci < N; ci++) {
    const trees = kind === 'forest' ? forestCell(t.seed, t.cls, t.height, slope, clearing, ci, cj) : kind === 'town' ? townTreeCell(t.seed, t.cls, clump, ci, cj, always, always) : riverBeltCell(t.seed, t.cls, slope, belt, ci, cj, always, 1);
    if (trees.length >= min) out.push({ ci, cj, trees });
  }
  return out;
}

describe('T381: a tree\'s key is its place', () => {
  it('treeKey and keyPos agree to 1/64 of a tile and tell neighbouring trees apart', () => {
    for (const [x, y] of [[1.2, 3.4], [511.99, 0.01], [1023.5, 1023.5], [64, 64]] as const) { const p = keyPos(treeKey(x, y)); assert.ok(Math.abs(p.x - x) <= 1 / 128 + 1e-9 && Math.abs(p.y - y) <= 1 / 128 + 1e-9, `${x}, ${y}`); }
    assert.notEqual(treeKey(10, 10), treeKey(10 + 1 / 32, 10)); assert.notEqual(treeKey(10, 10), treeKey(10, 10 + 1 / 32)); assert.notEqual(treeKey(10, 20), treeKey(20, 10));
    assert.equal(treeKey(10.001, 10.001), treeKey(10, 10), 'the same place to the key\'s precision');
  });
  it('the forest\'s, the belts\' and the town\'s trees of the map have all their own keys (no two trees share one)', () => {
    const seen = new Map<number, string>();
    for (const kind of ['forest', 'town', 'belt'] as const) for (const c of cellsWith(kind, 1)) for (const tr of c.trees) {
      const k = treeKey(tr.x, tr.y), was = seen.get(k); assert.ok(!was, `${kind} tree at ${tr.x}, ${tr.y} shares a key with a ${was} tree`); seen.set(k, kind);
    }
    assert.ok(seen.size > 500, `${seen.size} trees on the map`);
  });
});

describe('T381: the cells plant without the trees taken away, and the same without them every time', () => {
  for (const kind of ['forest', 'town', 'belt'] as const) it(`${kind}: planting a cell again (the same pure function) gives the same trees in the same places, minus the taken ones, plus them again when given back`, () => {
    const cells = cellsWith(kind, 4); assert.ok(cells.length > 0, `a ${kind} cell with trees`);
    const c = cells[0]!, again = cellsWith(kind, 4)[0]!;
    assert.deepEqual(c.trees.map(q => [q.x, q.y]), again.trees.map(q => [q.x, q.y]), 'the same places every time');
    const cut = new TreeCut(), gone = [c.trees[0]!, c.trees[2]!];
    for (const g of gone) assert.ok(cut.add(treeKey(g.x, g.y)));
    const kept = cut.keep(c.trees);
    assert.equal(kept.length, c.trees.length - 2); for (const g of gone) assert.ok(!kept.includes(g));
    assert.deepEqual(kept.map(q => q.id), c.trees.filter(q => !gone.includes(q)).map(q => q.id), 'the rest are as they were, in order');
    // the cell planted again later (the camera came back, something was built beside it, the belts were switched): still without them
    const replant = cut.keep(cellsWith(kind, 4)[0]!.trees); assert.equal(replant.length, kept.length);
    // given back (undo): all of them again
    for (const g of gone) assert.ok(cut.remove(treeKey(g.x, g.y)));
    assert.equal(cut.keep(cellsWith(kind, 4)[0]!.trees).length, c.trees.length);
    assert.ok(!cut.remove(treeKey(gone[0]!.x, gone[0]!.y)), 'a key given back twice is not there the second time');
  });
  it('keep gives the same array back when nothing in it is taken (no copy per cell planted)', () => {
    const c = cellsWith('forest', 2)[0]!, cut = new TreeCut(); assert.equal(cut.keep(c.trees), c.trees);
    cut.add(treeKey(1, 1)); assert.equal(cut.keep(c.trees), c.trees, 'a taken tree elsewhere');
  });
});

describe('T381: the save keeps what was taken', () => {
  it('save and load round trip, sorted; nothing taken saves nothing; junk in a save is dropped', () => {
    const cut = new TreeCut(); assert.equal(cut.save(), undefined);
    cut.add(treeKey(300.5, 20)); cut.add(treeKey(10, 10)); cut.addAuto('tree@40.00,50.00'); cut.addAuto('rbtree@1.00,2.00');
    const s = cut.save()!; assert.deepEqual(s.trees, [treeKey(10, 10), treeKey(300.5, 20)].sort((a, b) => a - b)); assert.deepEqual(s.auto, ['rbtree@1.00,2.00', 'tree@40.00,50.00']);
    const back = new TreeCut(); back.load(JSON.parse(JSON.stringify(s)));
    assert.equal(back.size, 4); assert.ok(back.has(treeKey(10, 10)) && back.has(treeKey(300.5, 20)) && back.hasAuto('tree@40.00,50.00'));
    const junk = new TreeCut(); junk.load({ trees: [1.5, -3, NaN, 2 ** 60, treeKey(5, 5)], auto: ['', 'x'.repeat(100), 'tree@1.00,1.00', 7 as unknown as string] });
    assert.equal(junk.size, 2); assert.ok(junk.has(treeKey(5, 5)) && junk.hasAuto('tree@1.00,1.00'));
    junk.load(undefined); assert.equal(junk.size, 0);
  });
});

describe('T381: the game uses it (the engine, the paint tool, the bulldozer)', () => {
  const src = (p: string) => readFileSync(p, 'utf8');
  it('Rub out takes the trees of the map with a count; the cells plant without the taken; the save and the journal carry them', () => {
    const eng = src('src/game/engine.ts'), pt = src('src/game/paint-tool.ts');
    assert.match(eng, /private cutMapTrees\(/); assert.match(eng, /this\.treeCut\.keep\(forestCell\(/, 'the forest'); assert.match(eng, /this\.treeCut\.keep\(riverBeltCell\(/, 'the river belts');
    assert.match(eng, /this\.treeCut\.keep\(townTreeCell\(/, 'the trees of the town'); assert.match(eng, /this\.treeCut\.hasAuto\(k\)/, 'the trees of the road');
    assert.match(eng, /unplantProps\(x: number, y: number, r: number, trees = false\)/); assert.match(eng, /if \(trees\) n \+= this\.cutMapTrees\(x, y, r\)/);
    assert.match(eng, /tk: treeKey\(tr\.x, tr\.y\)/, 'every tree sprite has its key');
    assert.match(eng, /\.\.\.\(this\.treeCut\.size \? \{ cutTrees: this\.treeCut\.save\(\) \} : \{\}\)/, 'the save'); assert.match(eng, /this\.treeCut\.load\(d\.cutTrees\)/, 'the load');
    assert.match(eng, /type PropLog = \{ added: Prop\[\]; removed: Prop\[\]; cut: TreeRec\[\]; cutAuto: AutoProp\[\] \}/); assert.match(eng, /j\.added\.length \|\| j\.removed\.length \|\| j\.cut\.length \|\| j\.cutAuto\.length/, 'a step of cuts alone is a step');
    assert.match(eng, /if \(back\) this\.uncutTrees\(j\.cut\); else this\.recutTrees\(j\.cut\)/, 'undo gives them back, redo takes them again');
    assert.match(pt, /this\.host\.unplant\(t\.x, t\.y, s\.r, this\.plantBrush === 'trees'\)/, 'the Trees brush rubs out the trees of the map too');
    assert.match(pt, /Rubbed out \$\{pl\.n\} \$\{noun\}/, 'and says how many');
    // (the engine's adapter of the paint host: the first in-game run found it dropped the flag, so the Trees brush rubbed out the planted trees only)
    assert.match(eng, /unplant: \(x, y, r, trees\) => this\.unplantProps\(x, y, r, trees\)/, 'the engine hands the Trees flag on to unplantProps');
  });
  it('Rub out of the paint tool asks the host for the trees of the map with the Trees brush only, and says what it took', () => {
    const asked: { x: number; y: number; r: number; trees: boolean | undefined }[] = [], said: string[] = []; let took = 0;
    const host = { setLotGround() {}, emit() {}, save() {}, toast: (m: string) => { said.push(m); }, affine() {}, placeProps: () => 0, plant: () => 0, unplant: (x: number, y: number, r: number, trees?: boolean) => { asked.push({ x, y, r, trees }); return took; }, plantPool: () => [] } as unknown as PaintHost;
    const tool = new PaintTool(host), rub = (kind: 'trees' | 'bushes', n: number) => { took = n; tool.setPlant(kind); tool.rubOut = true; tool.cursor = { x: 50, y: 60 }; tool.pointerDown({ x: 50, y: 60 }, 0, 0); tool.pointerUp(0.5); };
    rub('trees', 7); assert.equal(asked.length, 1); assert.equal(asked[0]!.trees, true, 'the Trees brush rubs out the trees of the map too'); assert.ok(asked[0]!.r > 0);
    assert.deepEqual(said.slice(-1), ['Rubbed out 7 trees']);
    rub('trees', 1); assert.deepEqual(said.slice(-1), ['Rubbed out 1 tree']);
    rub('trees', 0); assert.deepEqual(said.slice(-1), ['No trees under the brush to rub out'], 'none: it says so, not nothing');
    rub('bushes', 4); assert.equal(asked.at(-1)!.trees, false, 'the Bushes brush takes the placed plants only, never a tree of the map');
    assert.deepEqual(said.slice(-1), ['Rubbed out 4 plants']);
  });
  it('the bulldozer takes a tree by a click and trees by a drag, as one undo step, and says how many', () => {
    const eng = src('src/game/engine.ts');
    assert.match(eng, /if \(this\.bulldozeTree\(mx, my\)\) return;/, 'the click'); assert.match(eng, /\} else this\.bladeTrees\(t\);/, 'the drag');
    assert.match(eng, /this\.paint\.openStep\('bulldoze trees'\)/); assert.match(eng, /if \(this\.treeStroke\) this\.treeStrokeEnd\(\);/, 'closed at the release');
    assert.match(eng, /Removed \$\{s\.n\} tree\$\{s\.n === 1 \? '' : 's'\}/);
    assert.ok(BLADE_R > 0.5 && BLADE_R < 4);
    assert.ok(BELT.reach > 0 && TC.HILL === 2);
  });
});
