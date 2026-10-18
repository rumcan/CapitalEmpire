// The towns gate: a new valley's three towns (harness.ts setupTowns: their street grids, then the stamp to TOWN_POP residents each), run for
// some game days. Each game second is one City.step(10) (stepSecond), and the gravel the planner lays is applied with a NetEditor and fed
// back as net ops, as the engine does. Per seed: each town's lots (states in use), built lots, residents and jobs after the stamp (and the
// stamp's time, ms); then at each game day's end each town's residents and built lots, the gravel legs laid so far, the active cars, and the
// City.step mean and max (ms) over that day.
// Pass per seed: after the stamp every town has residents >= 700 (an 8 x 8 grid holds about 1,000; terrain can cut a town); at the end every town's residents >= 0.95 x its stamped residents;
// the mean City.step under 25 ms (the town gate's budget).
//   npm run towns:gate -- [seeds = 1,2,3] [days = 2]
// Writes output/sim/towns-gate.json. Exit code 1 when a seed fails.
import fs from 'node:fs';
import path from 'node:path';
import { LU } from '../../src/game/lots/town';
import { DAY, setupTowns, stepSecond, type Harness } from './harness';

const seeds = (process.argv[2] ?? '1,2,3').split(',').map(Number).filter(n => Number.isFinite(n));
const days = Math.max(1, Math.round(Number(process.argv[3] ?? 2)));
/** the residents each town must have after the stamp, the share of them kept at the end, the step budget (ms) */
const MIN_STAMP = 700, KEEP = 0.95, BUDGET = 25;

interface TownRow { town: number; lots: number; built: number; pop: number; jobs: number }
interface DayRow { day: number; towns: TownRow[]; gravelLegs: number; active: number; stepMean: number; stepMax: number }
interface SeedResult { seed: number; centres: { x: number; y: number }[]; stampMs: number; stampEvents: number; stamped: TownRow[]; days: DayRow[]; end: TownRow[]; gravelLegs: number; active: number; stepMean: number; stepMax: number; failures: string[]; pass: boolean }

/** each town's lots (states in use), built lots, residents and jobs, from the town's totals and states */
function rows(H: Harness): TownRow[] {
  const town = H.city.town, out: TownRow[] = town.centres.map((_, k) => ({ town: k, lots: 0, built: town.builtK[k]!, pop: town.popK[k]!, jobs: 0 }));
  for (const s of town.states.values()) {
    const k = town.townOf(s.key);
    if (k < 0 || s.use === LU.NONE) continue;
    out[k]!.lots++; out[k]!.jobs += s.jobs;
  }
  return out;
}
const fmt = (r: TownRow) => `town ${r.town}: lots ${String(r.lots).padStart(4)}  built ${String(r.built).padStart(4)}  pop ${String(r.pop).padStart(5)}  jobs ${String(r.jobs).padStart(5)}`;

const results: SeedResult[] = [];
for (const seed of seeds) {
  const H = setupTowns(seed);
  const stamped = rows(H), centres = H.centres.map(c => ({ x: c.x, y: c.y }));
  console.log(`seed ${seed}: ${centres.length} towns at ${centres.map(c => `(${c.x}, ${c.y})`).join(' ')}; stamp ${H.stampMs.toFixed(1)} ms, ${H.stampEvents} complete events`);
  for (const r of stamped) console.log('  after the stamp ' + fmt(r));
  const days_: DayRow[] = [];
  let sum = 0, max = 0, n = 0, dSum = 0, dMax = 0, dN = 0;
  for (let s = 1; s <= days * DAY; s++) {
    stepSecond(H, s);
    const ms = H.stepMs; sum += ms; n++; dSum += ms; dN++; if (ms > max) max = ms; if (ms > dMax) dMax = ms;
    if (s % DAY === 0) {
      const day = s / DAY, tr = rows(H), dr: DayRow = { day, towns: tr, gravelLegs: H.gravelLegs, active: H.city.sim.active, stepMean: dN ? dSum / dN : 0, stepMax: dMax };
      days_.push(dr);
      for (const r of tr) console.log(`  day ${String(day).padStart(2)} ${fmt(r)}`);
      console.log(`  day ${String(day).padStart(2)} gravel legs ${H.gravelLegs}, cars ${H.city.sim.active}, step ${dr.stepMean.toFixed(2)} ms mean, ${dr.stepMax.toFixed(2)} max`);
      dSum = 0; dN = 0; dMax = 0;
    }
  }
  const end = rows(H), stepMean = n ? sum / n : 0;
  const failures: string[] = [];
  stamped.forEach((r, k) => { if (r.pop < MIN_STAMP) failures.push(`town ${k} pop ${r.pop} after the stamp under ${MIN_STAMP}`); });
  end.forEach((r, k) => { if (r.pop < KEEP * stamped[k]!.pop) failures.push(`town ${k} pop ${r.pop} at the end under ${KEEP} x ${stamped[k]!.pop}`); });
  if (stepMean >= BUDGET) failures.push(`step ${stepMean.toFixed(2)} ms mean (budget ${BUDGET})`);
  const res: SeedResult = { seed, centres, stampMs: H.stampMs, stampEvents: H.stampEvents, stamped, days: days_, end, gravelLegs: H.gravelLegs, active: H.city.sim.active, stepMean, stepMax: max, failures, pass: failures.length === 0 };
  results.push(res);
  for (const r of end) console.log('  at the end      ' + fmt(r));
  console.log(`seed ${seed}: gravel legs ${H.gravelLegs}, cars ${H.city.sim.active}, step ${stepMean.toFixed(2)} ms mean, ${max.toFixed(2)} max; ${res.pass ? 'PASS' : 'FAIL: ' + failures.join('; ')}`);
}

const pass = results.every(r => r.pass);
const dir = path.resolve('output/sim');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'towns-gate.json'), JSON.stringify({ seeds, days, pass, budget: BUDGET, minStamp: MIN_STAMP, keep: KEEP, results }, null, 1));
console.log(pass ? 'towns gate: PASS' : 'towns gate: FAIL');
process.exitCode = pass ? 0 : 1;
