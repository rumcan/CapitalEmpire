// T396 (#1064; the owner, 2026-11-08: "ctrl/z should always work to reset your prev menu setting change"): the roads a player builds are steps on the same undo stack as the course,
// the paint, the props and the build menus' settings, in time order: a route is one step (its cost is refunded by undo and charged again by redo, its segs, junctions and the
// ground's re-bake follow), and Ctrl+Z / Ctrl+Y walk through routes, strokes and settings as they were made. Pure, Node: the Paint tool on a stand-in host with the
// engine's journal (net-undo.ts createNetJournal) over a RoadNetwork.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SURF, cellAt, makeGrid, paintDisc, type Grid } from '../src/game/ext/course-grid';
import { PaintTool, type PaintHost } from '../src/game/paint-tool';
import { CLASS, RoadNetwork, classOf, type Leg, type Pt } from '../src/game/network';
import { NetEditor, applyOps } from '../src/game/netops';
import { createNetJournal, netState } from '../src/game/net-undo';
import type { NetOp } from '../src/game/ground-protocol';
import type { LookBook } from '../src/game/golf/looks';
import { GRASS_FAMILIES, normalizeGrasses, type CustomGrass } from '../src/game/golf/grasses';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };
const P = (x: number, y: number): Pt => ({ x, y });
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: P(ax, ay), b: P(bx, by) });

/** the Paint tool on the course, a road network with the engine's journal on it, and a treasury */
function rig() {
  const g: Grid = makeGrid(0, 0, 160, 160), book: LookBook = {};
  const net = new RoadNetwork(); net.paintData = false;
  const edit = new NetEditor(net), mirror = new RoadNetwork(); mirror.paintData = false;
  const st = { money: 100000, commits: 0, grasses: [] as CustomGrass[], toasts: [] as string[], sent: [] as NetOp[][] };
  const commit = () => { st.commits++; const ops = edit.commit(); st.sent.push(ops); applyOps(mirror, ops); };
  const journal = createNetJournal({ net: () => net, edit: () => edit, commit });
  edit.onEdit = () => journal.touch();
  const host: PaintHost = { setLotGround() {}, emit() {}, save() {}, toast(t) { st.toasts.push(t); }, affine() {}, placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [], golfMode: () => true,
    money: () => st.money, spend: n => { st.money -= n; }, grid: () => g, gridChanged() {}, changed() {}, ownedAt: () => true, lookBook: () => book,
    courseLook() {}, lookChanged() {}, grasses: () => st.grasses, setGrasses: l => { st.grasses = normalizeGrasses(l); }, grassFamily: () => GRASS_FAMILIES[0]!.id, firstCutTex: () => ({ tex: 'golfFirstCut', sc: 1, a: 0 }),
    netJournal: journal };
  const p = new PaintTool(host); p.enterCourse();
  /** a route as the engine builds it: one step, the edits, the commit, the money spent (a cost) */
  const route = (label: string, legs: Leg[], cost: number, cls = CLASS.street!) => p.netStep(label, () => { edit.addLegs(legs, cls, 0); commit(); st.money -= cost; return cost; });
  const stroke = (x: number, y: number, cost = 0) => p.gridEdit('lay fairway', grid => ({ diffs: [paintDisc(grid, x, y, 3, SURF.fairway, 1, 0)], spent: cost }));
  const laid = (x: number, y: number) => g.surf[cellAt(g, x, y)] === SURF.fairway;
  /** where the world stands: the segs and junctions, the money, the strokes laid, the brush's shape */
  const now = () => ({ net: JSON.stringify(netState(net).segs.size) + '/' + net.nodes.size, money: st.money, a: laid(30, 30), b: laid(60, 60), cells: p.brushCells });
  return { g, net, edit, mirror, st, p, route, stroke, laid, now, journal, commit };
}

test('a route, a stroke, a setting and a second route: Ctrl+Z walks back through them in time order, refunding each cost; Ctrl+Y does them again', () => {
  const r = rig(), { p } = r;
  const s0 = r.now();
  r.route('build 80 m of street', [leg(40, 100, 80, 100)], 500); const s1 = r.now();
  r.stroke(30, 30, 100); const s2 = r.now();
  p.setBrushCells(2); const s3 = r.now();
  r.route('build 60 m of street', [leg(80, 100, 80, 130), leg(80, 130, 110, 130)], 300); const s4 = r.now();
  assert.equal(s4.money, 100000 - 500 - 100 - 300, 'the treasury paid for the two routes and the stroke'); assert.equal(s4.cells, 2);
  assert.match(p.undoLabel, /build 60 m of street/, 'the last step is the second route');
  const order = [s3, s2, s1, s0];
  for (const [i, want] of order.entries()) { p.undoTop(); assert.deepEqual(r.now(), want, `undo ${i + 1}`); }
  assert.equal(p.canUndo, false, 'nothing more to take back'); p.undoTop(); assert.deepEqual(r.now(), s0, 'one undo too many changes nothing');
  assert.equal(r.net.segs.size, 0, 'no road left'); assert.equal(r.st.money, 100000, 'every cost refunded');
  for (const [i, want] of [s1, s2, s3, s4].entries()) { p.redoTop(); assert.deepEqual(r.now(), want, `redo ${i + 1}`); }
  assert.equal(p.canRedo, false); p.redoTop(); assert.deepEqual(r.now(), s4);
  assert.equal(netState(r.mirror).segs.size, netState(r.net).segs.size, "the workers' network stands where the main thread's does after all of it");
});

test('a route undoes as one step with the ground re-baked: the network is committed again by undo and by redo (the engine re-bakes where it changed)', () => {
  const r = rig();
  r.route('build 80 m of street', [leg(40, 100, 80, 100), leg(80, 100, 80, 140)], 400);
  const c1 = r.st.commits; assert.equal(r.p.undoLabel, 'build 80 m of street');
  r.p.undoTop(); assert.equal(r.st.commits, c1 + 1, 'undo commits the network once, whatever the route had of legs'); assert.equal(r.net.segs.size, 0);
  r.p.redoTop(); assert.equal(r.st.commits, c1 + 2); assert.equal(r.net.segs.size, 2);
  assert.match(r.st.toasts.join('|'), /Undone: build 80 m of street/); assert.match(r.st.toasts.join('|'), /Redone: build 80 m of street/);
});

test('a route across an existing road: undo makes the road whole and takes the junction away; paint strokes between the routes keep their places in the order', () => {
  const r = rig();
  r.route('build 100 m of street', [leg(100, 50, 100, 150)], 700); const whole = r.now();
  r.stroke(30, 30); const withStroke = r.now();
  r.route('build 80 m of street', [leg(60, 100, 140, 100)], 560); assert.ok(r.net.nodes.size > 3, 'a junction where it crosses');
  r.p.undoTop(); assert.deepEqual(r.now(), withStroke, 'the crossing route is gone, the stroke stays'); assert.equal(r.net.segs.size, 1, 'the street is one seg again');
  r.p.undoTop(); assert.deepEqual(r.now(), whole, 'the stroke is taken back, the first route stays'); assert.equal(r.laid(30, 30), false);
  r.p.undoTop(); assert.equal(r.net.segs.size, 0); assert.equal(r.st.money, 100000);
  // a new action after an undo drops the redo steps, roads and all
  r.p.redoTop(); r.p.redoTop(); r.p.undoTop(); r.route('build 40 m of lane', [leg(10, 10, 30, 10)], 90, classOf('lane'));
  assert.equal(r.p.canRedo, false, 'the redo steps went with the new route');
});

test('a junction is a step too: its type and lights are taken back and done again, with their money', () => {
  const r = rig();
  r.route('build', [leg(100, 50, 100, 150), leg(60, 100, 140, 100)], 800);
  const at = () => r.net.nodeAt(P(100, 100))!, plain = r.now();
  r.p.netStep('install traffic lights', () => { r.edit.setNodeType(at(), 'signal'); r.edit.setSignal(at(), 1, undefined); r.edit.commit(); r.st.money -= 1200; return 1200; });
  assert.equal(at().type, 'signal'); const lit = r.now();
  r.p.undoTop(); assert.equal(at().type, 'plain'); assert.equal(at().sig, undefined); assert.equal(r.st.money, plain.money);
  r.p.redoTop(); assert.equal(at().type, 'signal'); assert.equal(at().sig, 1); assert.deepEqual(r.now(), lit);
});

test('the bulldozer takes a road: its stroke is a step with its refund, so a road built before and undone after is refunded once, never twice (no money from a bulldozed road)', () => {
  const r = rig();
  r.route('build 100 m of street', [leg(40, 100, 140, 100)], 1000);
  const built = r.now(); assert.equal(built.money, 99000);
  // the bulldozer's stroke as the engine runs it (bulldozeAt, treeStrokeEnd): a step opened, the network kept from the first road on, the refund counted, the step closed at the release
  r.p.openStep('bulldoze roads'); r.p.netInStep();
  const piece = r.net.pieceNear(P(90, 100))!; r.edit.removePiece(piece); r.commit(); r.st.money += 300; r.p.addSpent(-300);
  r.p.closeStep();
  const cut = r.now(); assert.equal(cut.money, 99300); assert.equal(r.p.undoLabel, 'bulldoze roads'); assert.equal(r.net.segs.size, 2, 'the road is in two pieces');
  r.p.undoTop(); assert.deepEqual(r.now(), built, 'the piece is back and its refund is taken back');
  r.p.undoTop(); assert.equal(r.net.segs.size, 0); assert.equal(r.st.money, 100000, 'the route refunded once: the treasury ends where it began, no gain from the bulldozer');
  r.p.redoTop(); r.p.redoTop(); assert.deepEqual(r.now(), cut, 'redo builds the route and takes the piece out again');
  // a stroke that took trees first and a road after (the step is open before the road): the road is in it too
  const r2 = rig(); r2.route('build', [leg(40, 100, 140, 100)], 1000);
  r2.p.openStep('bulldoze trees'); const before = r2.net.segs.size; r2.p.netInStep(); r2.edit.removePiece(r2.net.pieceNear(P(90, 100))!); r2.commit(); r2.p.closeStep();
  assert.ok(r2.net.segs.size > before); r2.p.undoTop(); assert.equal(r2.net.segs.size, before, 'the road the stroke took is back with its trees');
  // a stroke that took only trees (no road) keeps no network diff and spends nothing: its step is the props'
  const r3 = rig(); r3.p.openStep('bulldoze trees'); r3.p.closeStep(); assert.equal(r3.p.canUndo, false);
});

test('a step that changed no road, spent nothing and touched nothing leaves no step on the stack', () => {
  const r = rig();
  r.p.netStep('nothing', () => 0); assert.equal(r.p.canUndo, false, 'no step for an action that did nothing');
  r.route('build', [leg(40, 100, 80, 100)], 100); assert.equal(r.p.canUndo, true);
  r.p.netStep('nothing again', () => 0); assert.equal(r.p.undoLabel, 'build', 'and the route is still the last step');
});

test('the engine puts every road edit a player makes on the stack (paint.netStep), journals the network and answers Ctrl+Z from any tool (source order, as land-sale.test.ts reads the engine)', () => {
  const src = readFileSync('src/game/engine.ts', 'utf8');
  const body = (sig: string) => { const at = src.indexOf(sig); assert.ok(at > 0, `${sig} is where the test looks`); return src.slice(at, src.indexOf('\n  /**', at)); };
  for (const sig of ['  finishRoute() {', '  private laneClick() {', '  private laneReverse(', '  private installType(', '  setFlag(n: Node', '  setSlipways(n: Node', '  private flipJunction(', '  setSplit(n: Node', '  upgradeSignal(tier', '  private junctionRight(']) {
    assert.match(body(sig), /this\.paint\.netStep\(/, `${sig.trim()} is one undo step`);
  }
  // inside a step the edits go through the editor (it tells the journal), the commit is the engine's
  assert.match(src, /netJournal: this\.netJ,/, 'the Paint tool is handed the network journal'); assert.match(src, /this\.edit\.onEdit = \(\) => this\.netJ\.touch\(\);/, 'the editor tells it before each edit');
  assert.match(src, /createNetJournal\(\{ net: \(\) => this\.net, edit: \(\) => this\.edit, commit: \(\) => this\.netUndone\(\) \}\)/, 'undo and redo commit the network as any edit does (netUndone)');
  // the bulldozer's stroke keeps the roads it takes (and their refund) in its step
  assert.match(body('  private bulldozeAt('), /this\.treeStrokeOpen\('bulldoze roads'\); this\.paint\.netInStep\(\);[\s\S]*this\.paint\.addSpent\(-refund\)/, 'a road the bulldozer takes is in its stroke\'s step, with its refund');
  // Ctrl+Z / Ctrl+Y from any tool, after the tools that have their own (the brush, the car park, the props, the practice facilities)
  const at = src.indexOf("if (this.tool === 'practice' && this.practice.key(e)) { this.emit(); return; } // T206"), z = src.indexOf('this.paint.undoTop(); else this.paint.redoTop(); return; }', at), sw = src.indexOf('switch (e.key) {', at);
  assert.ok(at > 0 && z > at && z < sw, "Ctrl+Z, Ctrl+Y: the tools' own keys first, then the course's stack, before the letter keys");
});
