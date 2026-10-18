import { planWhy, reachableSegs } from '../../src/game/lots/roads';
// The town gate: the city (game/city.ts) headless from the highway into the start block, for up to some game days. Each game second
// is one City.step(10); the gravel the town lays is applied with a NetEditor and fed back as net ops, as the engine does. Each
// game hour is recorded and each game day printed. Pass: pop >= 5000 within the days; no game day with zero builds before pop 5000
// (unless every zone with lots is over 1.8 access: "jam-limited", a fail); mean step time (one City.step call) under 25 ms.
// The jam check: for each zone whose access stayed over 1.8 for a game day (judged on the access copy the town used in each
// second), the builds in that zone and in the other zones meanwhile (expected 0 and > 0).
//   npm run town:gate -- [seed = 1] [days = 40] [cars = 0] [keep]  (keep: run all the days even after pop 5000, to watch the jams; random background cars; the town's own trips start with the first house)
// The player (brief step 7b): when the town is land-locked (growStats.none rose in each of the last 3 game hours, legs did not), at
// most once per 2 game days the gate builds one bridge street over the water (findBridge: the shortest water crossing first).
// Writes output/sim/town-gate.json (every hour) and prints the daily lines and the summary. Exit code 1 when it fails.
import fs from 'node:fs';
import path from 'node:path';
import { City } from '../../src/game/city';
import { CLASS, RoadNetwork, SK, type Leg, type Node, type Pt, type Seg } from '../../src/game/network';
import { NetEditor } from '../../src/game/netops';
import { highwayRoute, splitByTerrain } from '../../src/game/structures';
import { classAt, generateTerrain } from '../../src/game/terrain';
import { MAP } from '../../src/game/iso';
import { TC } from '../../src/game/terrain/types';
import { builtLots, LV } from '../../src/game/lots/town';
import { zoneOf } from '../../src/game/sim/routing';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const seed = Number(process.argv[2] ?? 1), days = Math.max(1, Math.round(Number(process.argv[3] ?? 40))), cars = Math.max(0, Math.round(Number(process.argv[4] ?? 0))), keep = process.argv[5] === 'keep';
/** game hour and day in sim s (one call = one sim second), the goal population, the step budget (ms), the access limits */
const HOUR = 60, DAY = 1440, GOAL = 5000, BUDGET = 25, HI = 1.3, JAM = 1.8;
/** the player's bridge: the street's corridor half width, the land the far bank gives (tiles), the longest leg, the water part at most,
 *  the verge gap kept from other roads, the map margin (tiles); the four axis directions */
const BRIDGE_HW = CLASS.street.h + CLASS.street.walk, BRIDGE_LAND = 40, BRIDGE_MAX = 260, BRIDGE_WATER = 150, BRIDGE_VERGE = 6, BRIDGE_MARGIN = 16;
const AXES: Pt[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

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
/** the planner's growStats at each game hour's end, and the player's bridges (the second of the last one, the count) */
const growHist: { none: number; legs: number }[] = [];
let lastBridge = -Infinity, bridges = 0;

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

/** the distance from p to the centre line of a seg */
function segDist(p: Pt, s: Seg): number {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, L2 = dx * dx + dy * dy;
  let k = L2 > 0 ? ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / L2 : 0; k = k < 0 ? 0 : k > 1 ? 1 : k;
  return Math.hypot(s.a.x + dx * k - p.x, s.a.y + dy * k - p.y);
}
/** the built centre: the mean of the built lots (the entry while none is built), as the town planner's */
function builtCentre(): Pt {
  let sx = 0, sy = 0, m = 0;
  for (const s of city.town.states.values()) if (s.level >= LV.BUILT) { const l = city.lots.lots.get(s.key); if (l) { sx += l.c.x; sy += l.c.y; m++; } }
  return m ? { x: sx / m, y: sy / m } : entry;
}
/** a bridge: the start A (a node of a reachable ground road), the axis u, the length L and the water part W (tiles), the start's distance d to the built centre */
interface Bridge { a: Pt; u: Pt; L: number; W: number; d: number }
/** the leg from node n along u, if it is a bridge: no hill on the centre line, the margin kept, water (WATER) crossed in at most BRIDGE_WATER
 *  tiles, then BRIDGE_LAND tiles of GROUND or PATCH beyond the far bank (the leg stops there), and the land parts keep BRIDGE_VERGE
 *  clear of other roads' verges (the start excepted) */
function bridgeAlong(n: Node, u: Pt, cen: Pt): Bridge | null {
  const A = { x: n.x, y: n.y };
  let first = -1, last = -1, run = 0, end = -1;
  for (let i = 0; i < BRIDGE_MAX && end < 0; i++) {
    const tx = Math.floor(A.x + u.x * (i + 0.5)), ty = Math.floor(A.y + u.y * (i + 0.5));
    if (tx < BRIDGE_MARGIN || ty < BRIDGE_MARGIN || tx >= MAP - BRIDGE_MARGIN || ty >= MAP - BRIDGE_MARGIN) return null;
    const c = cls(tx, ty);
    if (c === TC.HILL) return null;
    if (c === TC.WATER) { if (first < 0) first = i; last = i; run = 0; }
    else if (c === TC.GROUND || c === TC.PATCH) { if (first >= 0 && ++run >= BRIDGE_LAND) end = i + 1; }
    else if (first >= 0) run = 0;
  }
  if (first < 0 || end < 0 || last + 1 - first > BRIDGE_WATER) return null;
  const L = end, W = last + 1 - first, E = { x: A.x + u.x * L, y: A.y + u.y * L };
  for (const s of city.net.segsNear({ x: (A.x + E.x) / 2, y: (A.y + E.y) / 2 }, L / 2 + 40)) {
    const need = BRIDGE_HW + s.cls.h + s.cls.walk + BRIDGE_VERGE, adj = s.a === n || s.b === n;
    for (let k = 0; k <= 2 * L; k++) {
      const t = k / 2;
      if (t >= first && t < last + 1) continue;
      if (adj && t < need) continue;
      if (segDist({ x: A.x + u.x * t, y: A.y + u.y * t }, s) < need) return null;
    }
  }
  return { a: A, u, L, W, d: Math.hypot(A.x - cen.x, A.y - cen.y) };
}
/** the player's bridge: over all dead ends and nodes of 1-3 arms on a reachable ground road, the four axis directions with no arm;
 *  the shortest water crossing first, then the start nearest the built centre; null when none fits */
function findBridge(): Bridge | null {
  const reach = reachableSegs(city.net, entry), cen = builtCentre();
  let best: Bridge | null = null;
  for (const n of city.net.nodes.values()) {
    if (n.segs.length > 3 || !n.segs.some(s => s.kind === SK.GROUND && reach.has(s))) continue;
    for (const u of AXES) {
      if (n.segs.some(s => { const o = s.a === n ? s.b : s.a, vx = o.x - n.x, vy = o.y - n.y, l = Math.hypot(vx, vy); return l > 0 && vx * u.x + vy * u.y > 0.98 * l; })) continue;
      const b = bridgeAlong(n, u, cen);
      if (b && (!best || b.W < best.W || (b.W === best.W && b.d < best.d))) best = b;
    }
  }
  return best;
}
/** the bridge as the engine's road tool: the street's leg split by terrain (the water parts become bridges), applied and fed to the city */
function buildBridge(b: Bridge) {
  const legs0: Leg[] = [{ a: b.a, b: { x: b.a.x + b.u.x * b.L, y: b.a.y + b.u.y * b.L } }];
  const { legs, kinds } = splitByTerrain(legs0, BRIDGE_HW, cls);
  editor.addLegs(legs, CLASS.street, 0, kinds);
  city.netOps(editor.commit());
}
/** land-locked: the planner found no land (growStats.none rose) in each of the last 3 game hours, and proposed no leg in them */
function landLocked(): boolean {
  const n = growHist.length;
  if (n < 4) return false;
  for (let k = 1; k <= 3; k++) { const a = growHist[n - k]!, b = growHist[n - k - 1]!; if (a.none <= b.none || a.legs !== b.legs) return false; }
  return true;
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
  if (s % HOUR === 0) {
    growHist.push({ none: city.growStats.none, legs: city.growStats.legs });
    const b = landLocked() && s - lastBridge >= 2 * DAY ? findBridge() : null;
    if (b) {
      buildBridge(b); lastBridge = s; bridges++;
      console.log(`day ${Math.floor((s - 1) / DAY) + 1}: player bridge from (${b.a.x.toFixed(0)}, ${b.a.y.toFixed(0)}) length ${b.L.toFixed(0)}, water ${b.W}`);
    }
  }
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
    if (popReachedDay >= 0 && !keep) break;
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
  gravelLegs, bridges, jamEpisodes: episodes.length, stepMs: { mean: +meanStep.toFixed(3), max: +allStepMax.toFixed(3), perCall: 'one City.step(10), one sim s', budget: BUDGET },
};
const dir = path.resolve('output/sim');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'town-gate.json'), JSON.stringify({ ...summary, hours, days: days_, episodes }, null, 1));
console.log(JSON.stringify(summary, null, 1));
process.exitCode = summary.pass ? 0 : 1;
