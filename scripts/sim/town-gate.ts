import { planWhy } from '../../src/game/lots/roads';
// The town gate: the city (game/city.ts) headless from the highway into the start block, for up to some game days. Each game second
// is one City.step(10); the gravel the town lays is applied with a NetEditor and fed back as net ops, as the engine does. Each
// game hour is recorded and each game day printed. Pass: pop >= 5000 within the days; no game day with zero builds before pop 5000
// (unless every zone with lots is over 1.8 access: "jam-limited", a fail); mean step time (one City.step call) under 25 ms.
// The jam check: for each zone whose access stayed over 1.8 for a game day (judged on the access copy the town used in each
// second), the builds in that zone and in the other zones meanwhile (expected 0 and > 0).
//   npm run town:gate -- [seed = 1] [days = 40] [cars = 0]  (random background cars; the town's own trips start with the first house)
// Writes output/sim/town-gate.json (every hour) and prints the daily lines and the summary. Exit code 1 when it fails.
import fs from 'node:fs';
import path from 'node:path';
import { City } from '../../src/game/city';
import { CLASS, RoadNetwork, type Leg, type Pt } from '../../src/game/network';
import { NetEditor } from '../../src/game/netops';
import { highwayRoute, splitByTerrain } from '../../src/game/structures';
import { classAt, generateTerrain } from '../../src/game/terrain';
import { builtLots, LV } from '../../src/game/lots/town';
import { zoneOf } from '../../src/game/sim/routing';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const seed = Number(process.argv[2] ?? 1), days = Math.max(1, Math.round(Number(process.argv[3] ?? 40))), cars = Math.max(0, Math.round(Number(process.argv[4] ?? 0)));
/** game hour and day in sim s (one call = one sim second), the goal population, the step budget (ms), the access limits */
const HOUR = 60, DAY = 1440, GOAL = 5000, BUDGET = 25, HI = 1.3, JAM = 1.8;

interface Hour { hour: number; pop: number; jobs: number; built: number; gravel: number; paved: number; cars: number; speed: number; arrived: number; shareHi: number | null; shareJam: number | null; worst: number | null; builds: number; stepMeanMs: number; stepMaxMs: number }
interface Episode { zone: number; fromH: number; toH: number; buildsInZone: number; buildsElsewhere: number }
interface Day { day: number; popStart: number; builds: number; pop: number; jamLimited: boolean }

// the valley and the city: the highway only (no starter town), from the map edge into the start block centre
const t = generateTerrain(seed);
const city = new City(1);
const editor = new NetEditor(new RoadNetwork());
editor.net.paintData = false;
const hw = CLASS.road.h + CLASS.road.walk, cls = (x: number, y: number) => classAt(t, x, y);
const startC: Pt = { x: t.start.x + t.start.size / 2, y: t.start.y + t.start.size / 2 };
const h = t.highway;
const entry: Pt = h.x >= 0 ? { x: h.x, y: h.y } : startC;
if (h.x >= 0) {
  const pts = highwayRoute(h, startC, hw, cls), legs0: Leg[] = [];
  for (let i = 1; i < pts.length; i++) legs0.push({ a: pts[i - 1]!, b: pts[i]! });
  const { legs, kinds } = splitByTerrain(legs0, hw, cls);
  editor.addLegs(legs, CLASS.road, 0, kinds);
} else console.log('[town] no highway on this valley: nothing can reach the lots');
city.terrain(t.cls, entry, seed);
city.netOps(editor.commit(true));
city.sim.setTarget(cars);
console.log(`[town] seed ${seed}, up to ${days} game days, ${cars} cars; ${city.net.segs.size} segs (highway) from (${entry.x.toFixed(0)}, ${entry.y.toFixed(0)})`);

const hours: Hour[] = [], days_: Day[] = [], episodes: Episode[] = [];
/** the jam runs: per zone, the sim seconds over JAM in a row, the second it began, and the builds during the run (in the zone, elsewhere) */
const run = new Int32Array(256), runFrom = new Int32Array(256), inZone = new Int32Array(256), elsewhere = new Int32Array(256);
const buildZones: number[] = [];
let hBuilds = 0, hStepSum = 0, hStepMax = 0, hSteps = 0, hSpeedSum = 0, hSpeedN = 0;
let arrivedAt = 0, popReachedDay = -1, allStepSum = 0, allStepMax = 0, allSteps = 0, jamLimitedDay = -1, zeroDay = -1;
let popStart = 0, dayBuilds = 0, gravelLegs = 0, day = 0;

/** the mean speed of the live cars (m/s), sampled every 10 sim s */
function sampleSpeed() {
  const sim = city.sim;
  for (let i = 0; i < sim.cap; i++) if (sim.alive[i]) { hSpeedSum += sim.v[i]!; hSpeedN++; }
}
/** the zones with a lot not EMPTY, and whether every one of them is over JAM (the town's access copy) */
function lotZones(): { zones: number; allJam: boolean } {
  const zs = new Set<number>();
  for (const s of city.town.states.values()) if (s.level !== LV.EMPTY) { const l = city.lots.lots.get(s.key); if (l) zs.add(zoneOf(l.c.x, l.c.y)); }
  let allJam = zs.size > 0;
  for (const z of zs) if (!(city.town.access[z]! > JAM)) allJam = false;
  return { zones: zs.size, allJam };
}
/** closes the game hour hIdx (0-based, ending now): its record */
function closeHour(hIdx: number) {
  const town = city.town, bl = builtLots(town, city.lots);
  let nHi = 0, nJam = 0, worst: number | null = null;
  const has = new Set<number>();
  for (const b of bl) { const z = zoneOf(b.lot.c.x, b.lot.c.y); has.add(z); if (town.access[z]! > HI) nHi++; if (town.access[z]! > JAM) nJam++; }
  for (const z of has) if (worst === null || town.access[z]! > worst) worst = town.access[z]!;
  let gravel = 0, paved = 0;
  for (const s of city.net.segs) { if (s.cls.id === 'gravel') gravel++; else paved++; }
  hours.push({
    hour: hIdx + 1, pop: town.pop, jobs: town.jobs, built: town.built, gravel, paved, cars: city.sim.active,
    speed: hSpeedN ? hSpeedSum / hSpeedN : 0, arrived: city.sim.stats.arrived - arrivedAt, shareHi: bl.length ? nHi / bl.length : null,
    shareJam: bl.length ? nJam / bl.length : null, worst, builds: hBuilds, stepMeanMs: hSteps ? hStepSum / hSteps : 0, stepMaxMs: hStepMax,
  });
  arrivedAt = city.sim.stats.arrived; hBuilds = 0; hStepSum = 0; hStepMax = 0; hSteps = 0; hSpeedSum = 0; hSpeedN = 0;
}
const pct = (v: number | null) => v === null ? '  -' : `${String(Math.round(100 * v)).padStart(3)}%`;
function dayLine(d: number, rec: Hour) {
  console.log(`day ${String(d).padStart(2)}  pop ${String(rec.pop).padStart(5)}  jobs ${String(rec.jobs).padStart(5)}  built ${String(rec.built).padStart(5)}  ` +
    `segs gravel ${rec.gravel} paved ${rec.paved}  cars ${rec.cars}  speed ${rec.speed.toFixed(1)} m/s  arrived ${rec.arrived}  ` +
    `>1.3 ${pct(rec.shareHi)} >1.8 ${pct(rec.shareJam)}  worst ${rec.worst === null ? '-' : rec.worst.toFixed(2)}  builds ${dayBuilds}  ` +
    `step ${rec.stepMeanMs.toFixed(2)} ms mean, ${rec.stepMaxMs.toFixed(2)} max`);
}

for (let s = 1; s <= days * DAY; s++) {
  const t0 = performance.now();
  const r = city.step(10);
  const ms = performance.now() - t0;
  hStepSum += ms; hStepMax = Math.max(hStepMax, ms); hSteps++; allStepSum += ms; allStepMax = Math.max(allStepMax, ms); allSteps++;
  // the jam runs by the access copy this second's tick used; then this second's builds against the open runs
  for (let z = 0; z < 256; z++) {
    if (city.town.access[z]! > JAM) { if (run[z] === 0) { runFrom[z] = s; inZone[z] = 0; elsewhere[z] = 0; } run[z]++; }
    else if (run[z] > 0) { if (run[z] >= DAY) episodes.push({ zone: z, fromH: runFrom[z]! / HOUR, toH: (s - 1) / HOUR, buildsInZone: inZone[z]!, buildsElsewhere: elsewhere[z]! }); run[z] = 0; }
  }
  buildZones.length = 0;
  for (const ev of r.events) {
    if (ev.kind !== 'build') continue;
    const l = city.lots.lots.get(ev.key); if (!l) continue;
    buildZones.push(zoneOf(l.c.x, l.c.y)); hBuilds++; dayBuilds++;
  }
  for (const bz of buildZones) for (let z = 0; z < 256; z++) if (run[z] > 0) { if (z === bz) inZone[z]!++; else elsewhere[z]!++; }
  if (r.grow) {
    gravelLegs += r.grow.length;
    editor.addLegs(r.grow, CLASS.gravel, 2);
    city.netOps(editor.commit());
  }
  if (s % 10 === 0) sampleSpeed();
  if (s % HOUR === 0) closeHour(s / HOUR - 1);
  if (s % DAY === 0) console.log('grow', JSON.stringify(city.growStats), JSON.stringify(planWhy));
  if (s % DAY === 0) {
    day++;
    const rec = hours[hours.length - 1]!, zl = lotZones();
    if (popStart < GOAL && dayBuilds === 0) {
      if (zl.allJam) { if (jamLimitedDay < 0) jamLimitedDay = day; }
      else if (zeroDay < 0) zeroDay = day;
    }
    days_.push({ day, popStart, builds: dayBuilds, pop: city.town.pop, jamLimited: zl.allJam });
    dayLine(day, rec);
    if (popReachedDay < 0 && city.town.pop >= GOAL) popReachedDay = day;
    popStart = city.town.pop; dayBuilds = 0;
    if (popReachedDay >= 0) break;
  }
}
// the runs still open when the gate stops: episodes too if they lasted a game day
for (let z = 0; z < 256; z++) if (run[z]! >= DAY) episodes.push({ zone: z, fromH: runFrom[z]! / HOUR, toH: (day * DAY) / HOUR, buildsInZone: inZone[z]!, buildsElsewhere: elsewhere[z]! });
for (const ep of episodes) {
  console.log(`jam zone ${ep.zone} over ${JAM} for ${(ep.toH - ep.fromH).toFixed(0)} h (sim hours ${ep.fromH.toFixed(0)}-${ep.toH.toFixed(0)}): builds in zone ${ep.buildsInZone} (expected 0), ` +
    `elsewhere ${ep.buildsElsewhere} (expected > 0)` + (ep.buildsInZone === 0 && ep.buildsElsewhere > 0 ? ': a jam stops growth locally' : ''));
}
const failures: string[] = [];
if (popReachedDay < 0) failures.push(`pop ${city.town.pop} under ${GOAL} after ${day} days`);
if (jamLimitedDay > 0) failures.push(`jam-limited: no builds on day ${jamLimitedDay} before pop ${GOAL}, every zone with lots over ${JAM}`);
if (zeroDay > 0) failures.push(`no builds on day ${zeroDay} before pop ${GOAL}`);
const meanStep = allSteps ? allStepSum / allSteps : 0;
if (meanStep >= BUDGET) failures.push(`step ${meanStep.toFixed(2)} ms mean (budget ${BUDGET})`);
const summary = {
  seed, days: day, cars, pass: failures.length === 0, failures, popReachedDay, pop: city.town.pop, jobs: city.town.jobs, built: city.town.built,
  gravelLegs, jamEpisodes: episodes.length, stepMs: { mean: +meanStep.toFixed(3), max: +allStepMax.toFixed(3), perCall: 'one City.step(10), one sim s', budget: BUDGET },
};
const dir = path.resolve('output/sim');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'town-gate.json'), JSON.stringify({ ...summary, hours, days: days_, episodes }, null, 1));
console.log(JSON.stringify(summary, null, 1));
process.exitCode = summary.pass ? 0 : 1;
