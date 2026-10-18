// Approach flares at a slip junction: right-turners leave the queue on the painted slip road instead of waiting behind the red light.
// Headless: a four-way street crossing (arms of 120 tiles) with its node set to 'slip', seeded trips from every arm to another arm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg, type NodeType } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LaneGraph, checkGraph, type Movement } from '../src/game/sim/lanes';
import { Sim } from '../src/game/sim/sim';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const C = 300, L = 120;
const ENDS = { W: [C - L, C], E: [C + L, C], N: [C, C - L], S: [C, C + L] } as const;
type Arm = keyof typeof ENDS;
const ARMS: Arm[] = ['W', 'E', 'N', 'S'];
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });

/** a four-way street crossing through (C, C) with its node of the given type */
function crossing(type: NodeType): LaneGraph {
  const e = new NetEditor(new RoadNetwork()); e.net.paintData = false;
  e.addLegs([leg(C - L, C, C + L, C), leg(C, C - L, C, C + L)], CLASS.street, 0); e.commit();
  const g = new LaneGraph(); g.update(e.net);
  e.setNodeType(e.net.nodeAt({ x: C, y: C })!, type); e.commit(); g.update(e.net);
  return g;
}
/** the directed seg coming in from arm a, and the one going out to it */
const inD = (g: LaneGraph, a: Arm) => g.dsegs.find(d => d && d.from.x === ENDS[a][0] && d.from.y === ENDS[a][1])!;
const outD = (g: LaneGraph, a: Arm) => g.dsegs.find(d => d && d.to.x === ENDS[a][0] && d.to.y === ENDS[a][1])!;
const moveOf = (g: LaneGraph, from: Arm, to: Arm): Movement => g.moves.find(m => !!m && m.from === inD(g, from).id && m.to === outD(g, to).id)!;

/** seeded trips at `rate` veh/h from each arm (the rightmost lane) to another arm; the finished trips with their movement's endpoints and time (s) */
function run(g: LaneGraph, rate: number, minutes: number, seed: number) {
  const sim = new Sim(g, 3000, seed);
  let r = seed * 9301 + 49297; const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const next = new Map<Arm, number>(ARMS.map(a => [a, (rnd() * 3600) / rate]));
  const live = new Map<number, { from: Arm; to: Arm; t0: number }>(), done: { from: Arm; to: Arm; dt: number }[] = [];
  for (let k = 0; k < minutes * 600; k++) {
    for (const a of ARMS) while (sim.t >= next.get(a)!) {
      const others = ARMS.filter(b => b !== a), to = others[Math.floor(rnd() * others.length)]!, d = inD(g, a), o = outD(g, to);
      const i = sim.spawnAt(d.lanes[d.lanes.length - 1]!, 2, o.id, Math.min(30, o.len - 2));
      if (i >= 0) live.set(i, { from: a, to, t0: sim.t });
      next.set(a, next.get(a)! + (-Math.log(1 - rnd()) * 3600) / rate);
    }
    sim.step();
    for (const [i, v] of live) if (!sim.alive[i]) { done.push({ from: v.from, to: v.to, dt: sim.t - v.t0 }); live.delete(i); }
  }
  return { done, sim };
}
/** the free-flow time (s) of a trip: its movement's lanes at their speed limits, from the rightmost lane's 2 m mark to the exit's mark. Not a lone
 *  car run: a car that starts at a red light would count the light as free flow */
function freeTime(g: LaneGraph, from: Arm, to: Arm): number {
  const d = inD(g, from), o = outD(g, to), path = moveOf(g, from, to).paths.find(p => p[0] === d.lanes[d.lanes.length - 1])!, last = path.length - 1;
  let t = 0;
  path.forEach((id, j) => { const l = g.lanes[id]!; t += j === 0 ? (l.len - 2) / l.vmax : j === last ? Math.min(30, o.len - 2) / l.vmax : l.len / l.vmax; });
  return t;
}
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);

test('a slip crossing at 500 veh/h an arm: right-turners lose under half the delay of straight-on cars, and nothing is towed or lost', () => {
  const g = crossing('slip');
  assert.deepEqual(checkGraph(g), []);
  const { done, sim } = run(g, 500, 10, 5);
  const delay: Record<'R' | 'S' | 'L', number[]> = { R: [], S: [], L: [] };
  for (const x of done) { const t = moveOf(g, x.from, x.to).turn; if (t === 'R' || t === 'S' || t === 'L') delay[t].push(x.dt - freeTime(g, x.from, x.to)); }
  console.log(`slip flare: delay R ${mean(delay.R).toFixed(1)} s (${delay.R.length} cars), S ${mean(delay.S).toFixed(1)} s (${delay.S.length}), L ${mean(delay.L).toFixed(1)} s (${delay.L.length})`);
  assert.ok(delay.R.length > 10 && delay.S.length > 10);
  assert.ok(mean(delay.R) < 0.5 * mean(delay.S), `right ${mean(delay.R).toFixed(1)} s against straight ${mean(delay.S).toFixed(1)} s`);
  assert.equal(sim.stats.towed, 0);
  assert.equal(sim.stats.lost, 0);
});
