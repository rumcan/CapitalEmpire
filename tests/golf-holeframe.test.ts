// T229 (#668): trees frame the holes (golf/holeframe.ts): clumps of 3 to 9 conifers and autumn broadleaves along the outer edge of a hole's rough,
// never in the line of play, on a path or on water, clear of the cart lanes and stepped back beside the landing zones; deterministic from the
// hole's seed; priced per tree; clumps with gaps; framing a hole again never doubles its trees. Also the frame tree's catalogue item and its save.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELL_T, SURF, cellAt, makeGrid, paintDisc, paintStroke, type Grid } from '../src/game/ext/course-grid';
import {
  FRAME_CONIFER_IDS, FRAME_RULES, FRAME_TREE_IDS, FRAME_TREE_KEY, FRAME_TREE_PRICE, cartLanes, clumpsOf, frameHole, framePrice, frameWhy, landingSpots, project,
  type FrameSite, type Pt,
} from '../src/game/golf/holeframe';
import { DECOR, DECOR_BY_KEY, propTuple, sellBack, tupleMarks } from '../src/game/golf/decor';
import { LIBRARY } from '../src/game/library';

/** a hole on the grid as New hole lays one: the rough corridor (15 tiles round the line), the fairway, the tee and the green */
function layHole(g: Grid, n: number, line: Pt[]) {
  for (let i = 0; i + 1 < line.length; i++) paintStroke(g, line[i]!.x, line[i]!.y, line[i + 1]!.x, line[i + 1]!.y, 15, SURF.rough, n, 0);
  const a = line[0]!, b = line[line.length - 1]!;
  for (let i = 0; i + 1 < line.length; i++) {
    const p = line[i]!, q = line[i + 1]!, L = Math.hypot(q.x - p.x, q.y - p.y), ux = (q.x - p.x) / L, uy = (q.y - p.y) / L;
    const s0 = i === 0 ? 20 : 0, s1 = i + 2 === line.length ? L - 12 : L;
    paintStroke(g, p.x + ux * s0, p.y + uy * s0, p.x + ux * s1, p.y + uy * s1, 8, SURF.fairway, n, 0);
  }
  paintDisc(g, a.x, a.y, 4, SURF.tee, n, 0);
  paintDisc(g, b.x, b.y, 7, SURF.green, n, 0);
}
/** a course of two parallel holes 60 tiles apart (a par 4 and a par 5), a pond between them and a path across the land */
function course() {
  const g = makeGrid(0, 0, 800, 480); // 400 x 240 tiles
  const h1: Pt[] = [{ x: 60, y: 90 }, { x: 240, y: 90 }], h2: Pt[] = [{ x: 330, y: 150 }, { x: 200, y: 160 }, { x: 60, y: 150 }];
  layHole(g, 1, h1); layHole(g, 2, h2);
  paintDisc(g, 150, 120, 4, SURF.water, 0, 0);
  return { g, h1, h2 };
}
/** the path strip the host refuses (x 168 to 171), and the land (10 tiles in from the grid's edge) */
const onPath = (x: number) => x > 167 && x < 172;
function site(g: Grid, hole: number, line: Pt[], others: Pt[][], o: Partial<FrameSite> = {}): FrameSite {
  return {
    hole, seed: hole * 101 + 7, line, others,
    grid: { x0: g.x0, y0: g.y0, w: g.w, h: g.h, surf: i => g.surf[i]!, hole: i => g.hole[i]! },
    lanes: cartLanes([{ hole: 1, tee: { x: 60, y: 90 }, pin: { x: 240, y: 90 } }, { hole: 2, tee: { x: 330, y: 150 }, pin: { x: 60, y: 150 } }], { x: 30, y: 120 }),
    ok: (x, y) => x > 10 && y > 10 && x < 390 && y < 230 && !onPath(x),
    ...o,
  };
}
const dSeg = (p: Pt, a: Pt, b: Pt) => project([a, b], p.x, p.y).d;

test('a frame: clumps along the rough\'s edge, never in the line of play, on a path or on water, clear of the lanes and the ends', () => {
  const { g, h1, h2 } = course(), s1 = site(g, 1, h1, [h2]), s2 = site(g, 2, h2, [h1]);
  for (const [s, line, other] of [[s1, h1, h2], [s2, h2, h1]] as const) {
    const { trees } = frameHole(s);
    assert.ok(trees.length >= 60 && trees.length <= 450, `hole ${s.hole}: ${trees.length} trees`);
    for (const t of trees) {
      for (const l of [line, other]) assert.ok(project(l, t.x, t.y).d >= FRAME_RULES.lineClear, `hole ${s.hole}: (${t.x}, ${t.y}) in a line of play`);
      const i = cellAt(g, t.x, t.y), surf = g.surf[i]!;
      assert.ok(surf === SURF.none, `hole ${s.hole}: (${t.x}, ${t.y}) on surface ${surf} (rough of hole ${g.hole[i]})`);
      assert.ok(!onPath(t.x), `hole ${s.hole}: (${t.x}, ${t.y}) on the path`);
      assert.ok(Math.hypot(t.x - 150, t.y - 120) > 4, 'not in the pond');
      for (const [a, b] of s.lanes) assert.ok(dSeg(t, a, b) >= FRAME_RULES.laneClear, `hole ${s.hole}: (${t.x}, ${t.y}) on a cart lane`);
      for (const e of [line[0]!, line[line.length - 1]!]) assert.ok(Math.hypot(t.x - e.x, t.y - e.y) >= FRAME_RULES.endClear);
      // on the band: just past the corridor's edge (15 tiles from the line here), within bandOut (+ the landing push) of it
      const d = project(line, t.x, t.y).d;
      assert.ok(d >= 15 + FRAME_RULES.bandIn - 0.6 && d <= 15 + FRAME_RULES.bandOut + FRAME_RULES.landingPush + 0.8, `hole ${s.hole}: ${d.toFixed(2)} from the line`);
      assert.equal(frameWhy(s, t.x, t.y), '', 'each tree passes the spot check');
    }
    // both sides of the hole are framed
    const side = (t: Pt) => Math.sign((line[1]!.x - line[0]!.x) * (t.y - line[0]!.y) - (line[1]!.y - line[0]!.y) * (t.x - line[0]!.x));
    assert.ok(trees.some(t => side(t) > 0) && trees.some(t => side(t) < 0), `hole ${s.hole}: both sides`);
  }
  // the spot check says why: the line of play, the corridor, a playing surface, the lane, the host
  assert.notEqual(frameWhy(s1, 150, 90), '');
  assert.equal(frameWhy(s1, 150, 100), 'corridor');
  assert.equal(frameWhy(s1, 169.5, 113), 'host', 'the path strip');
});

test('the landing zone: the frame steps back beside it (the hole\'s widest fairway, by the plan\'s width rules)', () => {
  assert.deepEqual(landingSpots(150), [], 'a par 3: none');
  assert.deepEqual(landingSpots(360), [Math.min(210, Math.round(100 + (360 - 13 - 100) * 0.55))], 'a par 4: the drive');
  assert.deepEqual(landingSpots(520), [210, 390], 'a par 5: the drive and the second shot');
  assert.deepEqual(landingSpots(360, [{ s: 100, w: 30 }, { s: 180, w: 44 }, { s: 300, w: 28 }, { s: 345, w: 22 }]), [180], "a plan's widest station");
  const { g, h1, h2 } = course(), s = site(g, 1, h1, [h2]), L = landingSpots(360)[0]! / 2; // tiles from the tee
  const { trees } = frameHole(s), beside = trees.filter(t => Math.abs(project(h1, t.x, t.y).s - L) <= FRAME_RULES.landingHalfM / 2);
  assert.ok(beside.length > 0, 'the landing zone is framed too');
  for (const t of beside) assert.ok(project(h1, t.x, t.y).d >= 15 + FRAME_RULES.bandIn + FRAME_RULES.landingPush - 0.6, `(${t.x}, ${t.y}) too near the landing zone`);
});

test('clumps of 3 to 9 trees with gaps between them, a mix of conifers and autumn broadleaves', () => {
  const { g, h1, h2 } = course();
  for (const s of [site(g, 1, h1, [h2]), site(g, 2, h2, [h1])]) {
    const { trees } = frameHole(s), groups = clumpsOf(trees, FRAME_RULES.gap);
    assert.ok(groups.length >= 12, `hole ${s.hole}: ${groups.length} clumps`);
    for (const gr of groups) {
      assert.ok(gr.length >= FRAME_RULES.min && gr.length <= FRAME_RULES.max, `a clump of ${gr.length}`);
      assert.equal(new Set(gr.map(i => trees[i]!.clump)).size, 1, 'a group is one clump');
    }
    // the gaps: every two trees of different clumps at least `gap` apart; within a clump each tree near another
    for (let i = 0; i < trees.length; i++) for (let j = i + 1; j < trees.length; j++) {
      const d = Math.hypot(trees[i]!.x - trees[j]!.x, trees[i]!.y - trees[j]!.y);
      assert.ok(d >= FRAME_RULES.treeMin - 1e-6, 'trees apart');
      if (trees[i]!.clump !== trees[j]!.clump) assert.ok(d >= FRAME_RULES.gap - 1e-6, 'a gap between clumps');
    }
    const conifers = trees.filter(t => FRAME_CONIFER_IDS.has(t.id)).length;
    assert.ok(conifers > 0 && conifers < trees.length, `hole ${s.hole}: ${conifers} conifers of ${trees.length}`);
    assert.ok(trees.every(t => FRAME_TREE_IDS.includes(t.id) && t.scale > 0.3 && t.scale < 5));
  }
  // every frame tree is a live library tree, none bare
  const lib = new Map(LIBRARY.map(i => [i.id, i]));
  for (const id of FRAME_TREE_IDS) { assert.equal(lib.get(id)?.kind, 'tree', id); assert.ok(!/dead|near-bare|patchy/.test(id), id); }
});

test('deterministic from the hole\'s seed', () => {
  const a = course(), b = course();
  const r1 = frameHole(site(a.g, 1, a.h1, [a.h2])), r2 = frameHole(site(b.g, 1, b.h1, [b.h2]));
  assert.deepEqual(r1, r2, 'the same hole, the same frame');
  const r3 = frameHole(site(a.g, 1, a.h1, [a.h2], { seed: 12345 }));
  assert.notDeepEqual(r3.trees.map(t => [t.x, t.y]), r1.trees.map(t => [t.x, t.y]), 'another seed, another frame');
});

test('framing a hole again never doubles its trees; an edited hole drops the trees now in play', () => {
  const { g, h1, h2 } = course(), s = site(g, 1, h1, [h2]);
  const first = frameHole(s).trees;
  const again = frameHole(s, first);
  assert.equal(again.trees.length, 0, 'nothing more to plant');
  assert.deepEqual(again.stale, [], 'nothing out of play');
  // half the frame bulldozed: framing again fills the open stretches only, each new clump a gap from the kept ones
  const kept = first.filter(t => t.clump % 2 === 0), refill = frameHole(s, kept);
  assert.ok(refill.trees.length > 0 && refill.trees.length + kept.length <= first.length + FRAME_RULES.max * 2, `${refill.trees.length} new beside ${kept.length}`);
  for (const t of refill.trees) for (const k of kept) assert.ok(Math.hypot(t.x - k.x, t.y - k.y) >= FRAME_RULES.gap - 1e-6);
  // the hole edited: its line moved 8 tiles over (the corridor with it): the trees now in its rough are out of play
  const moved = h1.map(p => ({ x: p.x, y: p.y + 8 })), g2 = makeGrid(0, 0, 800, 480); layHole(g2, 1, moved); layHole(g2, 2, h2);
  const edit = frameHole(site(g2, 1, moved, [h2]), first);
  assert.ok(edit.stale.length > 0, 'some trees stand in the new rough');
  for (const i of edit.stale) { const t = first[i]!; assert.ok(project(moved, t.x, t.y).d < 15 + 1 || g2.hole[cellAt(g2, t.x, t.y)] === 1, `(${t.x}, ${t.y}) is stale`); }
});

test('the price matches the trees; the frame tree is a hidden Props catalogue plant, half back when bulldozed, saved with its hole', () => {
  const { g, h1, h2 } = course(), { trees } = frameHole(site(g, 1, h1, [h2]));
  assert.equal(framePrice(trees.length), trees.length * FRAME_TREE_PRICE);
  assert.equal(framePrice(0), 0);
  const d = DECOR_BY_KEY.get(FRAME_TREE_KEY)!;
  assert.ok(d && d.hidden && d.kind === 'plant' && d.group === 'plants', 'a plant, not in the panel');
  assert.equal(d.price, FRAME_TREE_PRICE); assert.equal(sellBack(d), FRAME_TREE_PRICE / 2);
  assert.equal(DECOR.filter(x => x.hidden).map(x => x.key).join(), FRAME_TREE_KEY, 'the only hidden item');
  const t = propTuple('gen:tree-fir-tall:ne', { x: 1.5, y: 2.25, flip: false, scale: 0.9, decor: FRAME_TREE_KEY, frame: 7 });
  assert.deepEqual(t, ['gen:tree-fir-tall:ne', 1.5, 2.25, 0, 0.9, 0, FRAME_TREE_KEY, 7]);
  assert.deepEqual(tupleMarks(t), { decor: FRAME_TREE_KEY, frame: 7 });
  assert.deepEqual(tupleMarks(['x', 0, 0, 0, 1, 0, 'bench']), { decor: 'bench' }, 'an older tuple reads the same');
  assert.deepEqual(tupleMarks(['x', 0, 0, 0, 1, 0, 'nope', 3]), {}, 'no frame without its key');
});

test('the cart lanes: green to the next tee, the clubhouse to the first tee and the last green home', () => {
  const lanes = cartLanes([{ hole: 2, tee: { x: 5, y: 5 }, pin: { x: 6, y: 6 } }, { hole: 1, tee: { x: 1, y: 1 }, pin: { x: 2, y: 2 } }], { x: 0, y: 0 });
  assert.deepEqual(lanes, [[{ x: 2, y: 2 }, { x: 5, y: 5 }], [{ x: 0, y: 0 }, { x: 1, y: 1 }], [{ x: 6, y: 6 }, { x: 0, y: 0 }]]);
  assert.deepEqual(cartLanes([]), []);
  void CELL_T;
});
