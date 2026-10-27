// A grown town keeps its started lots (T177, issue #437; lots/lots.ts LotMap.update's keep): a lot the town has started or built keeps its
// footprint when new streets re-partition the frontage (a side street's junction, a block closed behind it), the new lots partition round it
// (no overlaps, every lot on a frontage of the network), and only a road through it takes it away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LotMap, lotRingClear, ringClear, type Lot } from '../src/game/lots/lots';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
/** the separating-axis overlap test, with the rules' 0.25-tile tolerance */
function overlapT(p: Lot, q: Lot): boolean {
  const dx = q.c.x - p.c.x, dy = q.c.y - p.c.y;
  for (const ax of [p.u, p.n, q.u, q.n]) {
    const r = (l: Lot) => Math.abs(l.u.x * ax.x + l.u.y * ax.y) * l.w / 2 + Math.abs(l.n.x * ax.x + l.n.y * ax.y) * l.d / 2;
    if (Math.abs(dx * ax.x + dy * ax.y) >= r(p) + r(q) - 0.25) return false;
  }
  return true;
}
/** a town's gravel main street (y 100, x 40..360) with its frontage lots, all of them started or built */
function town() {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(40, 100, 360, 100)], CLASS.gravel, 0); e.commit();
  const lm = new LotMap(); lm.update(e.net, null);
  return { e, lm, kept: new Map([...lm.lots].map(([k, l]) => [k, { o: { ...l.o }, w: l.w, d: l.d, l }])) };
}
/** a grown town's next streets: two side streets at the lattice points (x 120 and 160, south), then a back street closing the 40-tile block between them (subdivided into its own lots) */
function grow(e: NetEditor, lm: LotMap, keep?: (key: string) => boolean) {
  const removed: string[] = [];
  for (const L of [leg(120, 100, 120, 140), leg(160, 100, 160, 140), leg(120, 140, 160, 140)]) {
    e.addLegs([L], CLASS.gravel, 0); e.commit();
    removed.push(...lm.update(e.net, null, keep).removed);
  }
  return removed;
}

test('without the rule, new streets take lots the town had started (the churn T177 measured); with it, every one stands as it stood', () => {
  const a = town(), lost = grow(a.e, a.lm).filter(k => a.kept.has(k) && !a.lm.lots.has(k));
  assert.ok(lost.length > 0, 'the closed block takes some frontage lots: its own lots replace them');
  const b = town(), keep = (k: string) => b.kept.has(k);
  grow(b.e, b.lm, keep);
  for (const [k, was] of b.kept) {
    const l = b.lm.lots.get(k);
    assert.ok(l, `${k} kept`);
    assert.equal(l, was.l, `${k}: the same lot (its building stays)`);
    assert.ok(Math.abs(l!.o.x - was.o.x) < 1e-9 && Math.abs(l!.o.y - was.o.y) < 1e-9 && l!.w === was.w && l!.d === was.d, `${k}: its footprint unchanged`);
  }
});

test('the new lots partition round the kept ones: no overlaps, every lot fronts a seg of the network, the closed block still gets lots', () => {
  const b = town(), keep = (k: string) => b.kept.has(k);
  grow(b.e, b.lm, keep);
  const lots = [...b.lm.lots.values()];
  for (let i = 0; i < lots.length; i++) for (let j = i + 1; j < lots.length; j++) assert.ok(!overlapT(lots[i]!, lots[j]!), `${lots[i]!.key} overlaps ${lots[j]!.key}`);
  for (const l of lots) assert.ok(b.e.net.segs.has(l.seg), `${l.key} fronts a seg of the network`);
  // the block between the side streets (x 120..240, y 100..160) has new lots besides the kept frontage on the main street
  const inBlock = lots.filter(l => l.c.x > 120 && l.c.x < 160 && l.c.y > 100 && l.c.y < 140 && !b.kept.has(l.key));
  assert.ok(inBlock.length >= 1, `the closed block gets ${inBlock.length} new lots round the kept ones`);
});

test('only empty lots shrink or go; a road laid through a kept lot takes it (the planner never lays one: lots/roads.ts valid)', () => {
  const b = town();
  // keep only the lots on the south side (n points +y); the north side is empty and may change freely
  const south = new Set([...b.kept].filter(([, v]) => v.l.n.y > 0).map(([k]) => k)), keep = (k: string) => south.has(k);
  grow(b.e, b.lm, keep);
  for (const k of south) assert.ok(b.lm.lots.has(k), `${k} kept`);
  // a street laid straight through a kept lot's middle (x at its centre, south from the main street)
  const victim = [...south].map(k => b.lm.lots.get(k)!).find(l => l.c.x > 250 && l.c.x < 350)!;
  b.e.addLegs([leg(victim.c.x, 100, victim.c.x, 140)], CLASS.gravel, 0); b.e.commit();
  const r = b.lm.update(b.e.net, null, keep);
  assert.ok(r.removed.includes(victim.key) && !b.lm.lots.has(victim.key), 'a road through it takes it');
});

// T195 (#507): a mini-roundabout (a painted island in the crossing) keeps no lot out (lotRingClear 0), so a corner lot the town has started
// stands when the crossing gets one; a roundabout's circle still does (ringClear). Measured on the range gate's minis player, seed 1, seasons
// 6-12: 4-93 built or building lots a season lost (their centres 11.5-14 tiles from a mini) before, none after
test('a mini-roundabout keeps no lot out; a roundabout still keeps its circle clear', () => {
  for (const type of ['mini', 'roundabout'] as const) {
    const e = new NetEditor(new RoadNetwork());
    e.addLegs([leg(40, 100, 360, 100)], CLASS.gravel!, 0); e.addLegs([leg(200, 20, 200, 180)], CLASS.gravel!, 0); e.commit();
    const node = e.net.nodeAt({ x: 200, y: 100 })!;
    e.setNodeType(node, type); e.commit();
    assert.ok(node.rb > 0 && ringClear(node) > node.rb, `a ${type} has a circle (rb ${node.rb})`);
    assert.equal(lotRingClear(node), type === 'mini' ? 0 : ringClear(node), type);
  }
});
