// The congestion over time (Sim.heatHist) and the parking demand (Sim.parkDemand): npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LaneGraph } from '../src/game/sim/lanes';
import { Sim } from '../src/game/sim/sim';
import { PD_CELL } from '../src/game/event/config';
import { MAP } from '../src/game/iso';

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

test('heat over time: heatHist starts at 0; cars at rest on a dseg raise it by 1 - 1/e of its target (delay per lane-km) after 360 s; an empty dseg stays 0', () => {
  const { g } = build([leg(100, 100, 400, 100), leg(100, 600, 400, 600)]);
  const sim = new Sim(g, 300, 7), A = dsegAt(g, 100, 100, 400, 100), B = dsegAt(g, 100, 600, 400, 600);
  assert.ok(sim.heatHist.length >= g.dsegs.length, `heatHist sized ${sim.heatHist.length}`);
  assert.ok(sim.heatHist.every(v => v === 0), 'starts at 0');
  // cars placed along A's lane wherever there is room, held at rest (no step: the jam stays put)
  const la = A.lanes[0]!;
  for (let s = 1; s < 290; s++) sim.spawnAt(la, s, -1, 0);
  let n = 0;
  for (let i = 0; i < sim.cap; i++) if (sim.alive[i] && sim.lane[i] === la) { sim.v[i] = 0; n++; }
  assert.ok(n >= 10, `${n} cars on A`);
  // each car at rest has a delay of 1 on its lane: the target is n over the dseg's lane-km
  const per = A.len / 1000 * A.lanes.length, target = n / per;
  for (let k = 0; k < 360; k++) (sim as any).heatTick();
  const frac = sim.heatHist[A.id]! / target;
  console.log(`heat over time: ${n} cars at rest, target ${target.toFixed(1)} per lane-km, after 360 s ${sim.heatHist[A.id]!.toFixed(1)} (${frac.toFixed(4)} of the target)`);
  assert.ok(Math.abs(frac - (1 - 1 / Math.E)) < 0.01, `after one time constant ${frac.toFixed(4)} of the target`);
  assert.equal(sim.heatHist[B.id], 0, 'an empty dseg stays 0');
});

test('parking demand: one event per tick for 3600 ticks settles at 60 cars per game hour in its cell (within 5%); the other cells stay 0', () => {
  const { g } = build([leg(100, 100, 400, 100)]);
  const sim = new Sim(g, 4, 9), N = MAP / PD_CELL;
  const x = 300.5, y = 500.5, c = Math.floor(y / PD_CELL) * N + Math.floor(x / PD_CELL);
  for (let k = 0; k < 3600; k++) { (sim as any).demandAt(x, y); (sim as any).heatTick(); }
  const v = sim.parkDemand[c]!;
  console.log(`parking demand: cell ${c} at ${v.toFixed(2)} cars per game hour`);
  assert.ok(Math.abs(v - 60) <= 3, `cell ${c} at ${v.toFixed(2)} cars per game hour`);
  for (let i = 0; i < sim.parkDemand.length; i++) if (i !== c) assert.equal(sim.parkDemand[i], 0, `cell ${i}`);
});
