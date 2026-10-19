// The junction tool's pure rules (src/game/junctions.ts): a junction's corners and which take a slipway (long approaches only), the plan a set of
// slipways leaves (none: plain lights; some: a slip node with the others off), and why a flag or slipways cannot be had. npm test (headless).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type ClassId, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { flagRule, isLights, junctionCorners, slipPlan, slipRule, slipsOn } from '../src/game/junctions';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
const C = 300;

/** a four-way, a T or a bend of one road class with arms of arm tiles, its graph built; the editor is returned (its net holds the node at C, C) */
function build(cls: ClassId, arm: number, shape: '4' | 'T' | 'bend' = '4'): NetEditor {
  const e = new NetEditor(new RoadNetwork());
  const legs = shape === '4' ? [leg(C - arm, C, C + arm, C), leg(C, C - arm, C, C + arm)]
    : shape === 'T' ? [leg(C - arm, C, C + arm, C), leg(C, C, C, C + arm)]
    : [leg(C - arm, C, C, C), leg(C, C, C, C + arm)];
  e.addLegs(legs, CLASS[cls], 0); e.commit();
  return e;
}
/** the node at the centre of the editor's net (read again after each commit: a rebuild can replace it) */
const at = (e: NetEditor) => e.net.nodeAt({ x: C, y: C })!;

test('a four-way with long approaches: every corner has a right turn and takes a slipway; the corners sit at the junction', () => {
  const e = build('arterial', 120), n = at(e), cs = junctionCorners(n);
  assert.equal(cs.length, 4);
  assert.ok(cs.every(c => c.right), 'each corner of a four-way has a right turn');
  assert.ok(cs.every(c => c.fits), 'each corner fits a slipway with 240 m approaches');
  assert.ok(cs.every(c => Math.hypot(c.at.x - C, c.at.y - C) < 10), 'the corner buttons sit at the junction');
  assert.equal(slipRule(n), '');
  assert.deepEqual(slipsOn(n), [], 'lights with no slipways: none is on');
});

test('short approaches: the corners take no slipway, and the rule says why', () => {
  const n = at(build('arterial', 12)), cs = junctionCorners(n);
  assert.ok(cs.every(c => !c.fits), 'a 24 m approach is too short for a slipway');
  assert.ok(cs.some(c => c.right), 'the corners still have right turns');
  assert.match(slipRule(n), /54 m/);
});

test('a T: two corners have a right turn (the straight-through corner has none)', () => {
  const cs = junctionCorners(at(build('arterial', 120, 'T')));
  assert.equal(cs.length, 3);
  assert.equal(cs.filter(c => c.right).length, 2);
});

test('the plan: no slipway is plain lights (signal); one or more make a slip node with the other right-turn corners off', () => {
  const e = build('arterial', 120), n = at(e), cs = junctionCorners(n), rights = cs.filter(c => c.right).map(c => c.deg);
  assert.deepEqual(slipPlan(n, []), { type: 'signal', off: [] });
  const one = slipPlan(n, [rights[0]!]);
  assert.equal(one.type, 'slip');
  assert.deepEqual(one.off.sort(), rights.slice(1).sort());
  assert.deepEqual(slipPlan(n, rights), { type: 'slip', off: [] }, 'every corner on: no slipOff (every corner has one)');
  // applied: one slipway on the lights, then read back
  e.setNodeType(n, 'slip'); e.setSlipOff(n, one.off); e.commit();
  const m = at(e);
  assert.equal(m.type, 'slip');
  assert.deepEqual(slipsOn(m), [rights[0]]);
  assert.equal(isLights(m), true);
});

test('isLights: signals and slip nodes are lights; a plain junction and a roundabout are not', () => {
  const e = build('arterial', 120), n = at(e);
  assert.equal(isLights(n), false);
  e.setNodeType(n, 'signal'); e.commit();
  assert.equal(isLights(at(e)), true);
  e.setNodeType(at(e), 'roundabout'); e.commit();
  assert.equal(isLights(at(e)), false);
});

test('flag rules: turn lanes need three roads and a two-lane road; roundabouts have their own lanes; a bend takes widened turns only', () => {
  const four = at(build('arterial', 120));
  assert.equal(flagRule(four, 'wide'), '');
  assert.equal(flagRule(four, 'tl'), '', 'an arterial is a two-lane road');
  assert.match(flagRule(at(build('lane', 120)), 'tl'), /two-lane/);
  assert.match(flagRule(at(build('arterial', 120, 'bend')), 'tl'), /three or more/);
  assert.equal(flagRule(at(build('arterial', 120, 'bend')), 'wide'), '');
  const e = build('arterial', 120), n = at(e);
  e.setNodeType(n, 'roundabout'); e.commit();
  assert.match(flagRule(at(e), 'wide'), /Roundabouts/);
});
