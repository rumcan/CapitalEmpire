// The sim gate: the benchmark network with a fixed car count, run headless for some game days. Each game hour (600 steps) is
// recorded. Pass: after the first hour, active >= 98% of the target every hour; arrivals > 0 every hour; mean speed > 1 m/s every
// hour; towed / arrived < 1% and lost / arrived < 2% over the run. Exit code 1 when it fails.
//   npm run sim:gate -- [days = 10] [cars = 10000]      (the full gate is the default; the smoke run is 0.05 2000)
// Writes the summary to output/sim/gate.json (with every hour) and prints the summary to stdout.
import fs from 'node:fs';
import path from 'node:path';
import { RoadNetwork } from '../../src/game/network';
import { NetEditor } from '../../src/game/netops';
import { benchNetwork } from '../../src/game/bench-net';
import { LaneGraph } from '../../src/game/sim/lanes';
import { DT, Sim } from '../../src/game/sim/sim';
import { DAY } from '../../src/game/sim/trips';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const days = Number(process.argv[2] ?? 10), cars = Math.max(1, Math.round(Number(process.argv[3] ?? 10000)));
const steps = Math.round(days * DAY / DT), HOUR = Math.round(60 / DT);

interface Hour { hour: number; steps: number; active: number; minActive: number; speed: number; arrived: number; towed: number; lost: number; throttled: number; stepMeanMs: number; stepMaxMs: number; fails: string[] }

const e = new NetEditor(new RoadNetwork());
const tBuild = performance.now();
benchNetwork(e, 1);
const g = new LaneGraph(); g.update(e.net);
const built = Math.round(performance.now() - tBuild);
const sim = new Sim(g, cars, 1);
sim.profile = false;
sim.setTarget(cars);
console.log(`[gate] ${g.lanes.filter(Boolean).length} lanes, ${e.net.segs.size} segs; ${days} days (${steps} steps), ${cars} cars; built in ${built} ms`);

const times = new Float64Array(steps);
const hours: Hour[] = [];
let hStart = 0, hSum = 0, hMax = 0, hMin = Infinity, spSum = 0, spN = 0;
let snap = { arrived: 0, towed: 0, lost: 0, throttled: 0 };
const sampleSpeed = () => {
  let s = 0, n = 0;
  for (let i = 0; i < sim.cap; i++) if (sim.alive[i]) { s += sim.v[i]!; n++; }
  if (n) { spSum += s / n; spN++; }
};
/** closes the hour that ends at step k: its record, its checks, and a line to stdout for every 6th hour or a failing one */
function closeHour(k: number) {
  const st = sim.stats, n = k - hStart, h = hours.length + 1;
  if (!spN) sampleSpeed();
  const rec: Hour = {
    hour: h, steps: n, active: sim.active, minActive: hMin, speed: spSum / Math.max(1, spN),
    arrived: st.arrived - snap.arrived, towed: st.towed - snap.towed, lost: st.lost - snap.lost, throttled: st.throttled - snap.throttled,
    stepMeanMs: hSum / Math.max(1, n), stepMaxMs: hMax, fails: [],
  };
  if (h >= 2 && rec.minActive < 0.98 * cars) rec.fails.push(`active ${rec.minActive} under 98% of ${cars}`);
  if (rec.arrived <= 0) rec.fails.push('no arrivals');
  if (rec.speed <= 1) rec.fails.push(`mean speed ${rec.speed.toFixed(2)} m/s`);
  hours.push(rec);
  if (h % 6 === 0 || rec.fails.length || k === steps) console.log(line(rec));
  snap = { arrived: st.arrived, towed: st.towed, lost: st.lost, throttled: st.throttled };
  hStart = k; hSum = 0; hMax = 0; hMin = Infinity; spSum = 0; spN = 0;
}
const line = (r: Hour) => `hour ${String(r.hour).padStart(3)}  active ${r.active}/${cars} (min ${r.minActive})  speed ${r.speed.toFixed(2)} m/s  ` +
  `arrived ${r.arrived}  towed ${r.towed}  lost ${r.lost}  throttled ${r.throttled}  step ${r.stepMeanMs.toFixed(2)} ms mean, ${r.stepMaxMs.toFixed(2)} max` +
  (r.fails.length ? `  FAIL: ${r.fails.join('; ')}` : '');

const tRun = performance.now();
for (let k = 1; k <= steps; k++) {
  sim.step();
  const ms = sim.stats.stepMs;
  times[k - 1] = ms; hSum += ms; hMax = Math.max(hMax, ms);
  hMin = Math.min(hMin, sim.active);
  if (k % 10 === 0) sampleSpeed();
  if (k % HOUR === 0 || k === steps) closeHour(k);
}
const runS = (performance.now() - tRun) / 1000;

// whole-run checks and the step timing
const st = sim.stats, arrived = st.arrived;
const failures: string[] = [];
for (const r of hours) for (const f of r.fails) failures.push(`hour ${r.hour}: ${f}`);
if (arrived > 0 && st.towed / arrived >= 0.01) failures.push(`towed ${st.towed} of ${arrived} arrived (${(100 * st.towed / arrived).toFixed(2)}%, limit 1%)`);
if (arrived > 0 && st.lost / arrived >= 0.02) failures.push(`lost ${st.lost} of ${arrived} arrived (${(100 * st.lost / arrived).toFixed(2)}%, limit 2%)`);
if (arrived <= 0) failures.push('no vehicle arrived');
const sorted = times.slice().sort();
const p99 = sorted[Math.min(sorted.length - 1, Math.floor(0.99 * sorted.length))] ?? 0;
const mean = times.reduce((a, b) => a + b, 0) / Math.max(1, steps);
const summary = {
  days, cars, steps, runS: +runS.toFixed(1), pass: failures.length === 0, failures,
  arrived, spawned: st.spawned, towed: st.towed, lost: st.lost, throttled: st.throttled, respawned: st.respawned,
  towedPerArrived: arrived ? +(st.towed / arrived).toFixed(5) : null, lostPerArrived: arrived ? +(st.lost / arrived).toFixed(5) : null,
  minActiveAfterHour1: Math.min(...hours.filter(r => r.hour >= 2).map(r => r.minActive), Infinity),
  minSpeed: +Math.min(...hours.map(r => r.speed), Infinity).toFixed(2),
  stepMs: { mean: +mean.toFixed(3), p99: +p99.toFixed(3), max: +times.reduce((m, x) => Math.max(m, x), 0).toFixed(3), budgetPerStep: 25 },
};
const out = { ...summary, hours };
const dir = path.resolve('output/sim');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'gate.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(summary, null, 1));
process.exitCode = summary.pass ? 0 : 1;
