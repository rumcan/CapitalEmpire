// T396 (#1064; the owner, 2026-11-08: "ctrl/z should always work to reset your prev menu setting change"; the playtest: "Ctrl+Z after building a road doesn't
// remove it, the segment count is unchanged by undo"): a road step's diff (net-undo.ts): a route over empty land, across an existing road (which it cuts in two),
// Replace (pieces taken out first), Upgrade (a class changed in place), a one-way run reversed, a junction's type, options, slipways and lights; undo puts the
// network back exactly (its segs, its nodes, its junctions), redo does it again, and the workers' copies (the ops the editor sends) end where the main
// thread's network does. Pure, Node: a RoadNetwork and its NetEditor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, classOf, type Leg, type Pt } from '../src/game/network';
import { NetEditor, applyOps } from '../src/game/netops';
import { createNetJournal, diffNet, netState, type NetState } from '../src/game/net-undo';
import type { NetOp } from '../src/game/ground-protocol';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const P = (x: number, y: number): Pt => ({ x, y });
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: P(ax, ay), b: P(bx, by) });
/** a main-thread network and its editor, the journal on it as the engine wires it, and a worker's copy fed every op the editor commits */
function rig() {
  const net = new RoadNetwork(); net.paintData = false;
  const edit = new NetEditor(net), mirror = new RoadNetwork(); mirror.paintData = false;
  const sent: NetOp[][] = [];
  const commit = () => { const ops = edit.commit(); sent.push(ops); applyOps(mirror, ops); };
  const journal = createNetJournal({ net: () => net, edit: () => edit, commit });
  edit.onEdit = () => journal.touch();
  /** an action as the engine runs it: a step open, the edits, the commit, the step closed (its diff) */
  const step = (run: () => void) => { journal.begin(); run(); commit(); return journal.end(); };
  return { net, edit, mirror, journal, step, commit, sent };
}
/** a state as comparable text: the segs (key, class, style, kind, owner) and the junctions with something on them */
const text = (s: NetState) => JSON.stringify({ segs: [...s.segs].map(([k, v]) => [k, v.val]).sort(), nodes: [...s.nodes].sort() });
const nodesOf = (n: RoadNetwork) => n.nodes.size;

/** a plain network: a street north-south through (100, 50) to (100, 150) and an avenue east-west beside it, both built in one go */
function base() {
  const r = rig();
  r.step(() => { r.edit.addLegs([leg(100, 50, 100, 150)], CLASS.street!, 0); r.edit.addLegs([leg(30, 20, 170, 20)], classOf('avenue'), 0); });
  return r;
}

test('a route over empty land is one step: undo takes its segs away, redo lays them again (the playtest: the segment count was unchanged by undo)', () => {
  const { net, edit, mirror, journal, step } = base();
  const s0 = text(netState(net)), segs0 = net.segs.size;
  const d = step(() => edit.addLegs([leg(40, 100, 80, 100), leg(80, 100, 80, 130)], CLASS.street!, 0));
  assert.ok(d, 'the route made a diff'); assert.equal(net.segs.size, segs0 + 2); const s1 = text(netState(net));
  journal.undo(d!); assert.equal(net.segs.size, segs0, 'undo: the segments are back to before'); assert.equal(text(netState(net)), s0, 'exactly as it was');
  journal.redo(d!); assert.equal(net.segs.size, segs0 + 2); assert.equal(text(netState(net)), s1, 'redo: as it was built');
  journal.undo(d!); assert.equal(text(netState(net)), s0, 'and again');
  assert.equal(text(netState(mirror)), text(netState(net)), "the workers' network is where the main thread's is");
});

test('a route across an existing road cuts it in two; undo makes the road whole again and removes the junction, redo cuts it again', () => {
  const { net, edit, mirror, journal, step } = base();
  const s0 = text(netState(net)), segs0 = net.segs.size, nodes0 = nodesOf(net);
  const d = step(() => edit.addLegs([leg(60, 100, 140, 100)], CLASS.street!, 0));
  assert.equal(net.segs.size, segs0 + 3, 'the street is cut in two and the route in two'); assert.equal(nodesOf(net), nodes0 + 3, 'a junction where they cross, and the route\'s two ends');
  const s1 = text(netState(net));
  journal.undo(d!); assert.equal(net.segs.size, segs0); assert.equal(nodesOf(net), nodes0, 'the junction is gone'); assert.equal(text(netState(net)), s0);
  const whole = [...net.segs].find(s => s.cls.id === 'street')!; assert.equal(Math.hypot(whole.b.x - whole.a.x, whole.b.y - whole.a.y), 100, 'the street is one seg of 100 tiles again');
  journal.redo(d!); assert.equal(text(netState(net)), s1);
  assert.equal(text(netState(mirror)), text(netState(net)));
});

test('Replace: the pieces a route takes out are put back with it taken away, and a step with a bridge keeps its kind', () => {
  const { net, edit, journal, step } = base();
  const s0 = text(netState(net));
  const d = step(() => {
    const piece = net.pieceNear(P(100, 100))!; edit.removePiece(piece); // the bulldozed piece (Replace)
    edit.addLegs([leg(60, 100, 140, 100)], classOf('avenue'), 1, [1]); // an avenue on a bridge, line style 1
  });
  const bridge = [...net.segs].filter(s => s.kind === 1); assert.ok(bridge.length >= 1, 'a bridge seg');
  const s1 = text(netState(net));
  journal.undo(d!); assert.equal(text(netState(net)), s0, 'the piece is back, the bridge gone');
  journal.redo(d!); assert.equal(text(netState(net)), s1); assert.ok([...net.segs].some(s => s.kind === 1 && s.style === 1 && s.cls.id === 'avenue'), 'class, style and kind kept');
});

test('Upgrade: a class changed in place is a step; undo puts the old class back (and the money is the step\'s)', () => {
  const { net, edit, mirror, journal, step } = base();
  const s0 = text(netState(net));
  const d = step(() => edit.addLegs([leg(100, 50, 100, 150)], classOf('avenue'), 0, [0]));
  assert.ok([...net.segs].every(s => s.cls.id !== 'street' || s.a.x !== 100), 'the street is an avenue now'); const s1 = text(netState(net));
  journal.undo(d!); assert.equal(text(netState(net)), s0); assert.ok([...net.segs].some(s => s.cls.id === 'street' && s.a.x === 100));
  journal.redo(d!); assert.equal(text(netState(net)), s1);
  assert.equal(text(netState(mirror)), text(netState(net)));
});

test('a one-way run reversed (the Upgrade tool\'s right click) is a step: undo turns it round again', () => {
  const r = rig();
  r.step(() => r.edit.addLegs([leg(20, 60, 90, 60)], classOf('street.ow'), 0));
  const one = [...r.net.segs][0]!, a = { ...one.a }, b = { ...one.b };
  assert.ok(one.cls.oneway, 'a one-way class');
  const s0 = text(netState(r.net));
  const d = r.step(() => { const s = [...r.net.segs][0]!; r.edit.addLegs([{ a: P(s.b.x, s.b.y), b: P(s.a.x, s.a.y) }], s.cls, s.style, [s.kind]); });
  const rev = [...r.net.segs][0]!; assert.equal(rev.a.x, b.x); assert.equal(rev.b.x, a.x, 'reversed');
  r.journal.undo(d!); const back = [...r.net.segs][0]!; assert.equal(back.a.x, a.x); assert.equal(back.b.x, b.x); assert.equal(text(netState(r.net)), s0);
  r.journal.redo(d!); assert.equal([...r.net.segs][0]!.a.x, b.x);
});

test('a junction\'s type, options, slipways and lights are a step: undo gives back the plain junction, redo the lights and the slipways', () => {
  const { net, edit, mirror, journal, step } = base();
  step(() => edit.addLegs([leg(40, 100, 160, 100)], CLASS.street!, 0)); // the crossing at (100, 100)
  const at = () => net.nodeAt(P(100, 100))!; assert.equal(at().arms.length >= 3 || at().segs.length === 4, true);
  const s0 = text(netState(net));
  const d1 = step(() => { edit.setNodeType(at(), 'signal'); edit.setSignal(at(), 1, undefined); });
  assert.equal(at().type, 'signal'); assert.equal(at().sig, 1); const s1 = text(netState(net));
  const d2 = step(() => { edit.setNodeType(at(), 'slip'); edit.setSlipOff(at(), [90]); edit.setNodeFlags(at(), true, true); });
  assert.equal(at().type, 'slip'); assert.deepEqual(at().slipOff, [90]); assert.equal(at().wide, true); const s2 = text(netState(net));
  journal.undo(d2!); assert.equal(text(netState(net)), s1); assert.equal(at().type, 'signal'); assert.equal(at().wide, false); assert.equal(at().slipOff, undefined);
  journal.undo(d1!); assert.equal(text(netState(net)), s0); assert.equal(at().type, 'plain'); assert.equal(at().sig, undefined);
  journal.redo(d1!); assert.equal(text(netState(net)), s1); journal.redo(d2!); assert.equal(text(netState(net)), s2);
  assert.equal(text(netState(mirror)), text(netState(net)));
});

test('undo of a route is exact in time order across several steps, and a bulldozed piece (a step too) comes back first', () => {
  const { net, edit, journal, step } = base();
  const s0 = text(netState(net));
  const d1 = step(() => edit.addLegs([leg(40, 100, 100, 100)], CLASS.street!, 0)); const s1 = text(netState(net));
  const d2 = step(() => edit.addLegs([leg(100, 100, 160, 100)], classOf('avenue'), 0)); const s2 = text(netState(net));
  journal.undo(d2!); assert.equal(text(netState(net)), s1); journal.undo(d1!); assert.equal(text(netState(net)), s0);
  journal.redo(d1!); journal.redo(d2!); assert.equal(text(netState(net)), s2);
  // the bulldozer takes a piece of the second route (its stroke is a step: PaintTool.netInStep): undo puts the piece back, then the route goes
  const d3 = step(() => { const piece = net.pieceNear(P(130, 100))!; edit.removePiece(piece); }); const s3 = text(netState(net)); assert.notEqual(s3, s2, 'a gap in the avenue');
  journal.undo(d3!); assert.equal(text(netState(net)), s2, 'the piece is back: the avenue whole again');
  journal.undo(d2!); assert.equal(text(netState(net)), s1); journal.undo(d1!); assert.equal(text(netState(net)), s0);
  journal.redo(d1!); journal.redo(d2!); journal.redo(d3!); assert.equal(text(netState(net)), s3, 'and redo takes the piece out again');
});

test('a piece cut outside any step (no diff holds it) is found or missed without a throw: undoing the step takes what it finds, never puts back more than it changed', () => {
  const { net, edit, journal, step } = base();
  const d1 = step(() => edit.addLegs([leg(40, 100, 100, 100)], CLASS.street!, 0));
  const d2 = step(() => edit.addLegs([leg(100, 100, 160, 100)], classOf('avenue'), 0));
  const piece = net.pieceNear(P(130, 100))!; edit.removePiece(piece); edit.commit(); // (outside a step)
  assert.doesNotThrow(() => journal.undo(d2!)); assert.doesNotThrow(() => journal.undo(d1!));
  assert.ok([...net.segs].every(s => !(s.a.x === 40 && s.a.y === 100) && !(s.b.x === 40 && s.b.y === 100)), 'the first route is gone');
  assert.ok([...net.segs].some(s => s.cls.id === 'avenue' && s.a.y === 20), 'the base roads are still there');
});

test('a step that changed nothing has no diff; a step of edits that cancel out has none either; the journal holds nothing outside a step', () => {
  const { net, edit, journal, step } = base();
  assert.equal(step(() => { /* no edit */ }), null, 'no edit: no diff');
  const s0 = text(netState(net));
  const same = step(() => edit.addLegs([leg(100, 50, 100, 150)], CLASS.street!, 0)); // the street laid over itself
  assert.equal(same, null, 'the same class laid over itself changes nothing'); assert.equal(text(netState(net)), s0);
  // an edit outside a step is not held: the next step's diff does not include it
  edit.addLegs([leg(10, 10, 20, 10)], CLASS.street!, 0); edit.commit();
  const d = step(() => edit.addLegs([leg(10, 30, 20, 30)], CLASS.street!, 0));
  assert.equal(d!.inn.length, 1, 'only the step\'s own seg');
  journal.undo(d!); assert.ok([...net.segs].some(s => s.a.x === 10 && s.a.y === 10), 'the earlier edit stays');
});

test('diffNet: the segs out and in, and the junctions at their ends before and after; nothing for equal states', () => {
  const { net, edit, step } = base();
  const a = netState(net);
  assert.equal(diffNet(a, netState(net)), null);
  const d = step(() => edit.addLegs([leg(60, 100, 140, 100)], CLASS.street!, 0))!;
  assert.equal(d.out.length, 1, 'the street that was cut'); assert.ok(d.inn.length >= 4, 'its two halves and the route\'s two');
  assert.deepEqual(d.nodes, [], 'no junction of a type: plain nodes hold nothing to put back');
  // a junction that carries something is in the diff at both its states
  const lit = step(() => { const n = net.nodeAt(P(100, 100))!; edit.setNodeType(n, 'signal'); edit.setSignal(n, 1, undefined); })!;
  assert.equal(lit.nodes.length, 1); assert.equal(lit.nodes[0]!.before, null); assert.equal(lit.nodes[0]!.after![2], 'signal');
  assert.equal(lit.out.length, 0); assert.equal(lit.inn.length, 0, 'no seg changed');
});
