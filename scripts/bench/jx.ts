// Junction test bench (lead's debug tool, kept in git since output/ is wiped from time to time). Each junction type with demand on every arm
// (left, straight, right evenly); per approach the mean delay (trip time less the free-flow time of one car alone), the 95th percentile, the
// throughput, any car stuck or towed, overlaps (cars on different lanes closer than 2.5 m) and the mean delay by turn.
//   npx esbuild scripts/bench/jx.ts --bundle --platform=node --format=esm --outfile=output/jx.mjs
//   node output/jx.mjs [vehPerHourPerArm = 120] [minutes = 15] [class = street] [case name prefix]
// env: RL=1|2|3 ring lanes of the roundabouts; SIGTIER=0|1|2 the lights' tier (fixed-time, actuated, adaptive) on the signal and slip cases;
//   SEEDS=n runs n seeds per case and prints the mean delay over all trips (one line per case; single runs are noisy near saturation)
import { CLASS, RoadNetwork, type Leg, type NodeType } from '../../src/game/network';
import { NetEditor } from '../../src/game/netops';
import { LK, LaneGraph, laneAt } from '../../src/game/sim/lanes';
import { Sim } from '../../src/game/sim/sim';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
const Q = Number(process.argv[2] ?? 120), MIN = Number(process.argv[3] ?? 15), CLS = process.argv[4] ?? 'street', L = 120, C = 300;
type Shape = '4' | 'T';
const cases: { name: string; shape: Shape; type: NodeType }[] = [
  { name: 'plain 4-way', shape: '4', type: 'plain' }, { name: 'plain T', shape: 'T', type: 'plain' },
  { name: 'all-way stop 4-way', shape: '4', type: 'stop' }, { name: 'all-way stop T', shape: 'T', type: 'stop' }, { name: 'mini 4-way', shape: '4', type: 'mini' }, { name: 'mini T', shape: 'T', type: 'mini' },
  { name: 'signal 4-way', shape: '4', type: 'signal' }, { name: 'signal T', shape: 'T', type: 'signal' },
  { name: 'slip 4-way', shape: '4', type: 'slip' }, { name: 'roundabout 4-way', shape: '4', type: 'roundabout' }, { name: 'roundabout T', shape: 'T', type: 'roundabout' },
];
const ENDS = { W: [C - L, C], E: [C + L, C], N: [C, C - L], S: [C, C + L] } as const;
type Arm = keyof typeof ENDS;
/** the turn from arm a to arm b: R, S or L (tile y points down: a positive cross product is a right turn) */
function turnOf(a: Arm, b: Arm): 'R' | 'S' | 'L' {
  const ux = C - ENDS[a][0], uy = C - ENDS[a][1], vx = ENDS[b][0] - C, vy = ENDS[b][1] - C;
  const d = ux * vx + uy * vy, c = ux * vy - uy * vx;
  return d > 0.5 * Math.hypot(ux, uy) * Math.hypot(vx, vy) ? 'S' : c > 0 ? 'R' : 'L';
}
function build(shape: Shape, type: NodeType, timed: boolean) {
  const e = new NetEditor(new RoadNetwork()); e.net.paintData = false;
  const cls = (CLASS as Record<string, (typeof CLASS)['street']>)[CLS]!;
  const legs = shape === '4' ? [leg(C - L, C, C + L, C), leg(C, C - L, C, C + L)] : [leg(C - L, C, C + L, C), leg(C, C, C, C + L)];
  e.addLegs(legs, cls, 0); e.commit();
  if (timed) {
    const n = e.net.nodeAt({ x: C, y: C })!; e.setNodeType(n, type);
    if (process.env.RL) e.setNodeFlags(n, false, false, Number(process.env.RL) as 1 | 2 | 3);
    if (process.env.SIGTIER && (type === 'signal' || type === 'slip')) e.setSignal(n, Number(process.env.SIGTIER) as 0 | 1 | 2, undefined);
    e.commit();
  }
  const g = new LaneGraph(); g.update(e.net);
  return g;
}
const arms = (shape: Shape): Arm[] => shape === '4' ? ['W', 'E', 'N', 'S'] : ['W', 'E', 'S'];
function run(shape: Shape, type: NodeType, rate: number, minutes: number, seed = 5) {
  const g = build(shape, type, true), sim = new Sim(g, 3000, seed);
  const inD = (a: Arm) => g.dsegs.find(d => d && d.from.x === ENDS[a][0] && d.from.y === ENDS[a][1])!;
  const outD = (a: Arm) => g.dsegs.find(d => d && d.to.x === ENDS[a][0] && d.to.y === ENDS[a][1])!;
  const A = arms(shape);
  // trips: per arm a Poisson-ish stream (seeded), destinations: the other arms evenly
  let r = seed * 9301 + 49297; const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const next: Record<string, number> = {}; for (const a of A) next[a] = rnd() * 3600 / rate;
  const live = new Map<number, { from: Arm; to: Arm; t0: number }>(), done: { from: Arm; to: Arm; dt: number }[] = [];
  let stuck = 0; const overlaps = new Map<string, number>();
  const kindName = (l: { kind: number; key: string }) => l.kind === LK.RING ? 'ring' : l.kind === LK.CONN ? (l.key[0] === 'E' ? 'entry' : l.key[0] === 'X' ? 'exit' : 'conn') : 'link';
  for (let k = 0; k < minutes * 600; k++) {
    for (const a of A) while (sim.t >= next[a]!) {
      const others = A.filter(b => b !== a), to = others[Math.floor(rnd() * others.length)]!, d = inD(a), o = outD(to);
      const i = sim.spawnAt(d.lanes[d.lanes.length - 1]!, 2, o.id, Math.min(30, o.len - 2));
      if (i >= 0) live.set(i, { from: a, to, t0: sim.t });
      next[a]! += -Math.log(1 - rnd()) * 3600 / rate;
    }
    sim.step();
    if (k % 100 === 0) {
      const P: { x: number; y: number; ln: number }[] = [], pt = { x: 0, y: 0, hx: 0, hy: 0 };
      for (let i = 0; i < sim.cap; i++) if (sim.alive[i]) { laneAt(g.lanes[sim.lane[i]!]!, sim.s[i]!, pt); P.push({ x: pt.x, y: pt.y, ln: sim.lane[i]! }); }
      for (let a = 0; a < P.length; a++) for (let b = a + 1; b < P.length; b++) {
        const pa = P[a]!, pb = P[b]!; if (pa.ln === pb.ln) continue;
        if (Math.hypot(pa.x - pb.x, pa.y - pb.y) * 2 < 2.5) { const key = [kindName(g.lanes[pa.ln]!), kindName(g.lanes[pb.ln]!)].sort().join('+'); overlaps.set(key, (overlaps.get(key) ?? 0) + 1); }
      }
    }
    for (const [i, v] of live) if (!sim.alive[i]) { done.push({ from: v.from, to: v.to, dt: sim.t - v.t0 }); live.delete(i); }
  }
  for (const [i] of live) if (sim.v[i]! < 0.5) stuck++;
  return { done, stuck, towed: sim.stats.towed, lost: sim.stats.lost, live: live.size, overlaps };
}
// the free-flow time of each movement: one car alone through a plain junction (no lights: a red wait is delay, not free-flow time)
const free = new Map<string, number>();
function freeTime(shape: Shape, type: NodeType, from: Arm, to: Arm): number {
  // a ring type's free-flow time is on its ring geometry; the others' is plain (a stop sign's wait is delay)
  const ring = type === 'roundabout' || type === 'mini', k = `${shape}${ring ? type : ''}${from}${to}`; if (free.has(k)) return free.get(k)!;
  const g = build(shape, ring ? type : 'plain', ring), sim = new Sim(g, 10, 1);
  const d = g.dsegs.find(q => q && q.from.x === ENDS[from][0] && q.from.y === ENDS[from][1])!, o = g.dsegs.find(q => q && q.to.x === ENDS[to][0] && q.to.y === ENDS[to][1])!;
  const i = sim.spawnAt(d.lanes[d.lanes.length - 1]!, 2, o.id, Math.min(30, o.len - 2)); let t = 0;
  while (sim.alive[i] && t < 6000) { sim.step(); t++; }
  free.set(k, t / 10); return t / 10;
}
const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))]! : 0; };
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
console.log(`junction bench: ${Q} veh/h per arm, ${MIN} min, ${CLS}${process.env.SIGTIER ? `, lights tier ${process.env.SIGTIER}` : ''}${process.env.RL ? `, ${process.env.RL} ring lanes` : ''}`);
const SEEDS = Number(process.env.SEEDS ?? 0);
for (const c of cases.filter(c => !process.argv[5] || c.name.startsWith(process.argv[5]))) {
  if (SEEDS > 0) {
    const all: number[] = [], per: string[] = []; let towed = 0, stuck = 0;
    for (let k = 0; k < SEEDS; k++) {
      const r = run(c.shape, c.type, Q, MIN, 5 + 7 * k), ds = r.done.map(x => x.dt - freeTime(c.shape, c.type, x.from, x.to));
      all.push(...ds); per.push(mean(ds).toFixed(1)); towed += r.towed; stuck += r.stuck;
    }
    console.log(`${c.name.padEnd(17)} | mean delay ${mean(all).toFixed(1)} s over ${all.length} trips, p95 ${pct(all, 0.95).toFixed(1)} s | per seed ${per.join(' ')} | stuck ${stuck} towed ${towed}`);
    continue;
  }
  const res = run(c.shape, c.type, Q, MIN);
  const delay = (x: { from: Arm; to: Arm; dt: number }) => x.dt - freeTime(c.shape, c.type, x.from, x.to);
  const byArm = arms(c.shape).map(a => { const ds = res.done.filter(x => x.from === a).map(delay); return `${a} ${ds.length} cars, delay mean ${mean(ds).toFixed(1)} s p95 ${pct(ds, 0.95).toFixed(1)} s`; });
  const byTurn = (['R', 'S', 'L'] as const).map(t => `${t} ${mean(res.done.filter(x => turnOf(x.from, x.to) === t).map(delay)).toFixed(1)}`).join(' ');
  console.log(`${c.name.padEnd(17)} | ${byArm.join(' | ')} | by turn ${byTurn} | stuck ${res.stuck} towed ${res.towed} lost ${res.lost} still on ${res.live} | overlaps ${JSON.stringify([...res.overlaps])}`);
}
