// Traffic validation scenarios, after Treiber's traffic-simulation.de: a ring road (fundamental diagram), an on-ramp merge and a
// lane drop. Headless: npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg, type RoadClass } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LaneGraph, checkGraph } from '../src/game/sim/lanes';
import { DT, Sim } from '../src/game/sim/sim';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

type Pt2 = [number, number];
const leg = (a: Pt2, b: Pt2): Leg => ({ a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] } });
/** a network of the given legs (from, to, class), committed and with its lane graph */
function road(legs: [Pt2, Pt2, RoadClass][]): { e: NetEditor; g: LaneGraph } {
  const e = new NetEditor(new RoadNetwork());
  for (const [a, b, c] of legs) e.addLegs([leg(a, b)], c, 0);
  e.commit(); const g = new LaneGraph(); g.update(e.net);
  return { e, g };
}
/** the dseg that runs from point a to point b */
function dsegOf(g: LaneGraph, a: Pt2, b: Pt2): number {
  for (const d of g.dsegs) if (d && d.from.x === a[0] && d.from.y === a[1] && d.to.x === b[0] && d.to.y === b[1]) return d.id;
  throw new Error(`no dseg from ${a} to ${b}`);
}
/** the smallest front-to-rear gap between consecutive vehicles on any lane (Infinity if none) */
function worstGap(sim: Sim): number {
  let worst = Infinity;
  for (const q of sim.onLane) for (let k = 1; k < q.length; k++) worst = Math.min(worst, sim.s[q[k - 1]!]! - sim.len[q[k - 1]!]! - sim.s[q[k]!]!);
  return worst;
}
/** the dsegs of one direction of a closed loop, in driving order (each dseg's one movement leads to the next) */
function loopOf(g: LaneGraph): number[] {
  const start = g.dsegs.find(d => d)!.id, loop = [start];
  let d = g.dsegs[start]!;
  for (;;) {
    const nx = g.moves[d.out[0]!]!.to;
    if (nx === start || loop.length > 1000) break;
    loop.push(nx); d = g.dsegs[nx]!;
  }
  return loop;
}
/** a fixed-rate inflow: perMin vehicles a minute at s = 2 m on lane, heading for (dest, destS); a try with no room is dropped */
interface Feed { lane: number; perMin: number; dest: number; destS: number; tag: number; acc: number; want: number; got: number; wantLate: number; gotLate: number }
const feedOf = (lane: number, perMin: number, dest: number, destS: number, tag: number): Feed =>
  ({ lane, perMin, dest, destS, tag, acc: 0, want: 0, got: 0, wantLate: 0, gotLate: 0 });
/** one step of an inflow: its tries for this step; tags and born record each new vehicle's feed and spawn time (sim s) */
function feed(sim: Sim, f: Feed, tags: Uint8Array, born: Float64Array, lateFrom: number) {
  f.acc += f.perMin * DT / 60;
  while (f.acc >= 1) {
    f.acc -= 1; f.want++; const late = sim.t >= lateFrom; if (late) f.wantLate++;
    const i = sim.spawnAt(f.lane, 2, f.dest, f.destS);
    if (i < 0) continue;
    f.got++; if (late) f.gotLate++; tags[i] = f.tag; born[i] = sim.t;
  }
}

test('ring road (fundamental diagram): flow rises from 10 to 25 veh/km, the speed falls by 70 veh/km; no overlaps, nothing towed', () => {
  const S = 300, c: Pt2[] = [[100, 100], [100 + S, 100], [100 + S, 100 + S], [100, 100 + S]];
  const { g } = road(c.map((p, k) => [p, c[(k + 1) % 4]!, CLASS.road] as [Pt2, Pt2, RoadClass]));
  assert.deepEqual(checkGraph(g), []);
  const loop = loopOf(g), lens = loop.map(d => g.lanes[g.dsegs[d]!.lanes[0]!]!.len);
  const total = lens.reduce((a, b) => a + b, 0);
  const rows: { dens: number; speed: number; flow: number; placed: number }[] = [];
  for (const dens of [10, 25, 50, 70]) {
    const sim = new Sim(g, 400, 41), n = Math.round(dens * total / 1000);
    // the vehicles spread evenly over the loop (spawnAt keeps 8 m clear, so a very dense placement can fall short)
    let placed = 0;
    for (let k = 0; k < n; k++) {
      let p = (k + 0.5) * total / n, j = 0;
      while (j < loop.length - 1 && p >= lens[j]!) { p -= lens[j]!; j++; }
      if (sim.spawnAt(g.dsegs[loop[j]!]!.lanes[0]!, p, -1, 0) >= 0) placed++;
    }
    let sum = 0, cnt = 0, worst = Infinity;
    for (let k = 1; k <= 6000; k++) {
      sim.step();
      if (k % 100 === 0) worst = Math.min(worst, worstGap(sim));
      if (k > 4000) for (let i = 0; i < sim.cap; i++) if (sim.alive[i]) { sum += sim.v[i]!; cnt++; }
    }
    const density = placed / (total / 1000), speed = sum / Math.max(1, cnt);
    rows.push({ dens, speed, flow: density * speed * 3.6, placed });
    assert.ok(worst > -0.01, `overlap ${worst.toFixed(3)} m at ${dens} veh/km`);
    assert.equal(sim.stats.towed, 0, `towed at ${dens} veh/km`);
  }
  for (const r of rows) console.log(`scenario ring: ${r.dens} veh/km asked, ${r.placed} placed = ${(r.placed * 1000 / total).toFixed(1)} veh/km; ` +
    `mean speed ${r.speed.toFixed(2)} m/s; flow ${r.flow.toFixed(0)} veh/h`);
  const r10 = rows[0]!, r25 = rows[1]!, r90 = rows[3]!;
  assert.ok(r25.flow > r10.flow, `flow at 25 (${r25.flow.toFixed(0)}) > flow at 10 (${r10.flow.toFixed(0)})`);
  assert.ok(r90.speed < r25.speed, `speed at 90 (${r90.speed.toFixed(2)}) < speed at 25 (${r25.speed.toFixed(2)})`);
});

test('on-ramp: a street joins a boulevard at a T; 6 veh/min from the street and 20 veh/min through (a stop-controlled right turn takes 5 s gaps after a full stop: about 6-8/min here; at 40/min through it is blocked, as in reality) for 20 sim minutes: over 70% of the ramp gets in, no overlaps, nothing towed', () => {
  const { g } = road([[[100, 300], [400, 300], CLASS.boulevard], [[400, 300], [700, 300], CLASS.boulevard], [[400, 500], [400, 300], CLASS.street]]);
  assert.deepEqual(checkGraph(g), []);
  const west = dsegOf(g, [100, 300], [400, 300]), east = dsegOf(g, [400, 300], [700, 300]), south = dsegOf(g, [400, 500], [400, 300]);
  const destS = g.lanes[g.dsegs[east]!.lanes[0]!]!.len - 5;
  const sim = new Sim(g, 300, 51);
  const ramp = feedOf(g.dsegs[south]!.lanes[0]!, 6, east, destS, 1), through = feedOf(g.dsegs[west]!.lanes[0]!, 20, east, destS, 2);
  const tags = new Uint8Array(sim.cap), born = new Float64Array(sim.cap), prev = new Uint8Array(sim.cap);
  const arrivedLate = [0, 0, 0], lateFrom = 180;
  let worst = Infinity;
  // 20 sim minutes of demand, then 4 minutes with none so that the last vehicles arrive
  for (let k = 1; k <= 14400; k++) {
    if (k <= 12000) { feed(sim, ramp, tags, born, lateFrom); feed(sim, through, tags, born, lateFrom); }
    prev.set(sim.alive);
    sim.step();
    if (k % 10 === 0) worst = Math.min(worst, worstGap(sim));
    for (let i = 0; i < sim.cap; i++) if (prev[i] && !sim.alive[i] && born[i]! >= lateFrom) arrivedLate[tags[i]!]!++;
  }
  const st = sim.stats, share = arrivedLate[1]! / Math.max(1, ramp.gotLate);
  console.log(`scenario on-ramp: ramp spawned ${ramp.got} (${ramp.gotLate} after 3 min, ${ramp.want - ramp.got} refused), ` +
    `${arrivedLate[1]} of them arrived; through ${through.got} spawned, ${arrivedLate[2]} arrived after 3 min; ` +
    `ramp share ${(100 * share).toFixed(1)}%; worst gap ${worst.toFixed(3)} m; towed ${st.towed}, lost ${st.lost}`);
  assert.ok(ramp.gotLate > 80, `${ramp.gotLate} ramp spawns after 3 min`);
  assert.ok(share > 0.7, `${arrivedLate[1]} of ${ramp.gotLate} ramp vehicles arrived after 3 min`);
  assert.ok(worst > -0.01, `overlap ${worst.toFixed(3)} m`);
  assert.equal(st.towed, 0, 'nothing towed');
  assert.equal(st.lost, 0, 'nothing lost');
});

test('lane drop: a two-lane boulevard becomes a street at a two-arm node; 25 veh/min (1500/h, near the capacity of a street lane) on the outer lane: no overlaps, over 80% of the demand after warm-up gets through, nothing towed', () => {
  const { g } = road([[[100, 300], [400, 300], CLASS.boulevard], [[400, 300], [700, 300], CLASS.street]]);
  assert.deepEqual(checkGraph(g), []);
  const west = dsegOf(g, [100, 300], [400, 300]), east = dsegOf(g, [400, 300], [700, 300]);
  const destS = g.lanes[g.dsegs[east]!.lanes[0]!]!.len - 5;
  const sim = new Sim(g, 300, 61);
  const f = feedOf(g.dsegs[west]!.lanes[1]!, 25, east, destS, 1), lateFrom = 300;
  const tags = new Uint8Array(sim.cap), born = new Float64Array(sim.cap), prev = new Uint8Array(sim.cap);
  let arrivedLate = 0, worst = Infinity;
  // 20 sim minutes of demand, then 4 minutes with none so that the last vehicles get through
  for (let k = 1; k <= 14400; k++) {
    if (k <= 12000) feed(sim, f, tags, born, lateFrom);
    prev.set(sim.alive);
    sim.step();
    if (k % 10 === 0) worst = Math.min(worst, worstGap(sim));
    for (let i = 0; i < sim.cap; i++) if (prev[i] && !sim.alive[i] && born[i]! >= lateFrom) arrivedLate++;
  }
  const st = sim.stats, ratio = arrivedLate / Math.max(1, f.wantLate);
  console.log(`scenario lane drop: ${f.wantLate} asked after 5 min, ${f.gotLate} let in, ${arrivedLate} got through east ` +
    `(${(100 * ratio).toFixed(1)}% of the demand; ${(arrivedLate / 15).toFixed(1)} veh/min over 15 min); worst gap ${worst.toFixed(3)} m; towed ${st.towed}, lost ${st.lost}`);
  assert.ok(worst > -0.01, `overlap ${worst.toFixed(3)} m`);
  assert.ok(ratio > 0.8, `${arrivedLate} of ${f.wantLate} got through`);
  assert.equal(st.towed, 0, 'nothing towed');
  assert.equal(st.lost, 0, 'nothing lost');
});
