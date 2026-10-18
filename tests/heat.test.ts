// The congestion heat map (Sim.heatTick, Sim.heatGeometry): npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LaneGraph } from '../src/game/sim/lanes';
import { Sim } from '../src/game/sim/sim';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
/** a lane graph of streets: the editor is returned with it, for more edits */
function build(legs: Leg[]): { e: NetEditor; g: LaneGraph } {
  const e = new NetEditor(new RoadNetwork()); e.addLegs(legs, CLASS.street, 0); e.commit();
  const g = new LaneGraph(); g.update(e.net); return { e, g };
}
/** the dseg running from (ax, ay) to (bx, by), tiles (a street's first leg direction is a to b) */
function dsegAt(g: LaneGraph, ax: number, ay: number, bx: number, by: number) {
  const d = g.dsegs.find(x => !!x && x.from.x === ax && x.from.y === ay && x.to.x === bx && x.to.y === by);
  assert.ok(d, `a dseg ${ax},${ay} to ${bx},${by}`); return d!;
}

test('heat: a queue behind a red signal reads a ratio under 0.25 and a high density after 30 sim s; a free road reads above 0.75; an emptied approach relaxes to 1 and 0', () => {
  // a crossing of two 240 m streets at (300, 300), its signal red on the approach A (from 180 to 300 along y 300) for 45 s from t = 0
  // (the plan's green is lengthened to 40 s and its offset zeroed); B: a 1200 m street (100..700 along y 600), cars driven at its limit
  const { e, g } = build([leg(180, 300, 420, 300), leg(300, 180, 300, 420), leg(100, 600, 700, 600)]);
  const c = e.net.nodeAt({ x: 300, y: 300 })!;
  e.setNodeType(c, 'signal'); e.commit(); g.update(e.net);
  const sp = g.signals.get(c);
  assert.ok(sp, 'a signal plan at the crossing');
  sp.green = 40; sp.offset = 0;
  const sim = new Sim(g, 40, 3), A = dsegAt(g, 180, 300, 300, 300), B = dsegAt(g, 100, 600, 700, 600);
  // cars placed along A's lane wherever there is room, at rest: the signal holds them, so they queue back from the line
  const la = A.lanes[0]!, lb = B.lanes[0]!;
  let queued = 0;
  for (let s = 1; s < 230; s++) if (sim.spawnAt(la, s, -1, 0) >= 0) queued++;
  assert.ok(queued >= 10, `${queued} cars fit on A`);
  for (let k = 0; k < 4; k++) { const i = sim.spawnAt(lb, 40 * k, -1, 0); assert.ok(i >= 0, `car ${k} on B`); sim.v[i] = g.lanes[lb]!.vmax; }
  for (let k = 0; k < 300; k++) sim.step();
  const qa = sim.heatRatio[A.id]!, da = sim.heatDens[A.id]!, fb = sim.heatRatio[B.id]!;
  console.log(`sim heat: queue ratio ${qa.toFixed(3)}, density ${da.toFixed(0)} veh/km/lane; free road ratio ${fb.toFixed(3)}`);
  assert.ok(qa < 0.25, `queued ratio ${qa.toFixed(3)}`);
  assert.ok(da > 40, `queued density ${da.toFixed(1)}`);
  assert.ok(fb > 0.75, `free ratio ${fb.toFixed(3)}`);
  // emptied: the ratio relaxes to 1 and the density to 0 (a 5 s EMA: 30 s leaves 0.8^30 of the gap)
  for (let i = 0; i < sim.cap; i++) if (sim.alive[i] && sim.lane[i] === la) sim.despawn(i);
  for (let k = 0; k < 300; k++) sim.step();
  assert.ok(sim.heatRatio[A.id]! > 0.95, `emptied ratio ${sim.heatRatio[A.id]!.toFixed(3)}`);
  assert.ok(sim.heatDens[A.id]! < 1, `emptied density ${sim.heatDens[A.id]!.toFixed(3)}`);
});

test('heat: heatVersion moves only when the dseg list changes; heatGeometry gives each live dseg its ends, one lane offset to a side, and NaN for a dead id', () => {
  const { e, g } = build([leg(100, 100, 160, 100)]);
  const sim = new Sim(g, 4, 5), v0 = sim.heatVersion;
  sim.onGraph();
  assert.equal(sim.heatVersion, v0, 'no change, no bump');
  const geom = sim.heatGeometry();
  assert.equal(geom.length, 6 * g.dsegs.length);
  for (const d of g.dsegs) {
    if (!d) continue;
    const o = 6 * d.id;
    assert.deepEqual([geom[o], geom[o + 1], geom[o + 2], geom[o + 3]], [d.from.x, d.from.y, d.to.x, d.to.y]);
    assert.equal(geom[o + 5], d.lanes.length);
    assert.ok(Number.isFinite(geom[o + 4]) && geom[o + 4] !== 0, `offset ${geom[o + 4]}`);
  }
  e.addLegs([leg(100, 200, 160, 200)], CLASS.street, 0); e.commit(); g.update(e.net); sim.onGraph();
  assert.ok(sim.heatVersion > v0, 'a new road bumps the version');
  const more = sim.heatGeometry();
  assert.equal(more.length, 6 * g.dsegs.length);
  for (let d = 0; d < g.dsegs.length; d++) for (let k = 0; k < 6; k++) assert.equal(Number.isNaN(more[6 * d + k]), !g.dsegs[d], `dseg ${d} field ${k}`);
});
