/** The Phase-0 benchmark: a synthetic 4 km city (a 40-tile street grid with avenues and boulevards, ~500k props,
 *  10k test cars) and a scripted camera tour through every zoom tier that records frame times.
 *  Open the game with ?bench. Results land in window.__bench (and the console) when the tour ends. */
import type { Game } from './engine';
import { MAP, PLANNER_Z, mulberry, worldX, worldY } from './iso';
import { jumpTo, townTimeOf } from './sim/townclock';
import { LIBRARY } from './library';
import { benchLayout, benchNetwork, M0 } from './bench-net';
import { makeGrid } from './ext/course-grid';
import { rasterAreas } from './ext/course-grid/areas';
import { courseChunksIn } from './ext/course-grid/patch';
import { generateOldNine } from './golf/coursegen';
import { courseAreas } from './golf/paintcourse';
import { surfaceOfTex } from './golf/costs';
import { roundCorners } from './paint';
import { HoleWizard, newPlan } from './ext/hole-wizard';
import type { TileCacheStats } from './textures';

export const BENCH_CARS = 10000;

const mem = () => { const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory; return m ? Math.round(m.usedJSHeapSize / 1048576) + ' MB' : '?'; };
/** size = the fraction of the full 4 km grid to fill (1 = everything) */
export function buildBenchmark(g: Game, size = 1) {
  g.benchMode = true;
  const t0 = performance.now(), rnd = mulberry(99);
  const { lines, at, last } = benchLayout(size);
  benchNetwork(g.edit, size);
  const tNet = performance.now();
  console.log('[bench] network', g.net.segs.size, 'segs', Math.round(tNet - t0), 'ms, heap', mem());
  // ---- props: every block gets two rows of houses, yards, trees, fences, parked cars and clutter
  const ids = (cat: string) => LIBRARY.map((it, i) => (it.cat === cat ? i : -1)).filter(i => i >= 0);
  const houses = LIBRARY.map((it, i) => (it.kind === 'house' ? i : -1)).filter(i => i >= 0), shops = ids('Shops & services');
  const trees = ids('Trees & plants'), yard = [...ids('Yard'), ...ids('Halloween')], furniture = ids('Street furniture').filter(i => LIBRARY[i].kind !== 'lamp');
  const fences = ids('Fences'), cars = ids('Vehicles').filter(i => !LIBRARY[i].big || LIBRARY[i].boxes[0].hx < 4);
  const pick = (a: number[]) => a[(rnd() * a.length) | 0];
  const put = (i: number, x: number, y: number, flip = false, k = 1) => g.addProp(i, x, y, flip, k);
  for (let bx = 0; bx + 1 < lines; bx++) for (let by = 0; by + 1 < lines; by++) {
    const x0 = at(bx) + 4, x1 = at(bx + 1) - 4, y0 = at(by) + 4, y1 = at(by + 1) - 4, row = (bx * 7 + by * 3) % 11 === 0 ? shops : houses;
    // houses facing the south street (+y) and backs to the north street
    for (const [fy, flip] of [[y1 - 4, false], [y0 + 5, false]] as [number, boolean][]) {
      for (let x = x0 + 4; x < x1 - 3; x += 8.5) {
        const i = pick(row), it = LIBRARY[i], b = it.boxes[0];
        put(i, x - b.dx / 2, fy - b.dy / 2, flip, 0.9);
        put(pick(trees), x + 4, fy - 4 + rnd() * 2, rnd() < 0.5, 0.8 + rnd() * 0.3);
        for (let c = 0; c < 4; c++) put(pick(yard), x - 3 + rnd() * 6, fy + 2.4 + rnd() * 0.6, rnd() < 0.5, 0.9);
        put(pick(cars), x + 3.2, fy + 1.5, false, 1);
      }
    }
    // a garden band in the middle: trees, bushes, fences
    const my = (y0 + y1) / 2;
    for (let x = x0 + 1; x < x1 - 1; x += 2) put(pick(fences), x, my, false, 1);
    for (let n = 0; n < 60; n++) put(pick(trees), x0 + rnd() * (x1 - x0), my - 3 + rnd() * 6, rnd() < 0.5, 0.7 + rnd() * 0.5);
    for (let n = 0; n < 50; n++) put(pick(yard), x0 + rnd() * (x1 - x0), my - 6 + rnd() * 12, rnd() < 0.5, 0.9);
    for (let n = 0; n < 10; n++) put(pick(furniture), x0 + rnd() * (x1 - x0), y1 + 1.2, false, 0.9);
  }
  console.log('[bench] props', g.props.size, Math.round(performance.now() - tNet), 'ms, heap', mem());
  const lamps = g.lampsAlongRoads(g.net, 2);
  const tProps = performance.now();
  g.setTraffic(BENCH_CARS);
  const mid = (M0 + last) / 2 + 3;
  g.cam = { X: worldX(mid, mid), Y: worldY(mid, mid), z: 0.3 };
  // ?bench&course=1 (bench.mjs --course): a course on screen (T077): the old nine laid into a course grid under the tour's start
  const qs = new URLSearchParams(location.search), course = qs.get('course') === '1' ? benchCourse(g, mid) : 0, send = Number(qs.get('courseSend'));
  if (send > 0) g.courseSendMs = send; // ?courseSend=ms (bench.mjs --courseSend): the least time between two chunk sends while painting
  const hold = Number(qs.get('courseHold')); if (qs.has('courseHold') && hold >= 0) g.ground.courseHoldMs = hold; // ?courseHold=ms: the re-bake hold
  if (course) console.log('[bench] course', course, 'chunks');
  const info = { heap: mem() as unknown as number, segs: g.net.segs.size, nodes: g.net.nodes.size, props: g.props.size, lamps, buildNetMs: Math.round(tNet - t0), buildPropsMs: Math.round(tProps - tNet) };
  console.log('[bench] built', info);
  startTour(g, course ? { ...info, course: { x: mid, y: mid } } : info);
}

/** the benchmark's course: the generated old nine on a 300 x 450 tile site centred on tile (mid, mid), its golf areas laid into a course
 *  grid (established turf, no holes) and every chunk sent, with no golf game; returns how many chunks were sent */
function benchCourse(g: Game, mid: number): number {
  const site = { x0: Math.round(mid - 150), y0: Math.round(mid - 225), x1: Math.round(mid + 150), y1: Math.round(mid + 225) };
  const grid = makeGrid(site.x0 - 32, site.y0 - 32, (site.x1 - site.x0 + 64) * 2, (site.y1 - site.y0 + 64) * 2);
  rasterAreas(grid, courseAreas(generateOldNine(site, 1)).map(a => ({ pts: roundCorners(a.pts, a.radius), surface: surfaceOfTex(a.tex), month: 0 })));
  g.courseGrid = grid; g.resendCourse();
  return courseChunksIn(grid, [grid.x0, grid.y0, grid.x0 + grid.w * 0.5, grid.y0 + grid.h * 0.5]).length; // the chunks asked for (they land from the course worker)
}

interface Stage { name: string; z: number; vx: number; vy: number; secs: number }
const STAGES: Stage[] = [
  { name: 'street 30% pan', z: 0.3, vx: 900, vy: 300, secs: 6 },
  { name: 'street 17% pan', z: 0.17, vx: 1600, vy: 600, secs: 6 },
  { name: 'district 8% pan', z: 0.08, vx: 4000, vy: 1500, secs: 6 },
  { name: 'district 4.5% pan', z: 0.045, vx: 6000, vy: 2500, secs: 6 },
  { name: 'planner 2%', z: 0.02, vx: 12000, vy: 4000, secs: 5 },
  { name: 'planner whole map', z: 0.0065, vx: 0, vy: 0, secs: 5 },
];
const stage = (name: string) => STAGES.find(st => st.name === name)!;
/** the game scenes' stages (T098, plan P22 2.7.4): the new range start at 17% and 4.5% (target: frame <= 4 ms, instances <= 5k), and the grown
 *  town at 30% and 8% (against GAME-PLAN 2.3's budgets) */
export const SCENE_STAGES: Record<BenchScene, Stage[]> = {
  range: [stage('street 17% pan'), stage('district 4.5% pan')],
  fixture: [stage('street 30% pan'), stage('district 8% pan')],
  // T208: the old start's course on an ordinary day (?bench&start=town, &golfers=N for a busy day): 30% and 15% over the course, slow pans
  golf: [{ name: 'course 30% pan', z: 0.3, vx: 500, vy: 200, secs: 6 }, { name: 'course 15% pan', z: 0.15, vx: 900, vy: 350, secs: 6 }],
};
export type BenchScene = 'range' | 'fixture' | 'golf';
/** T272 (?zooms=30,15,8, bench.mjs --zooms 30,15,8): a scene's tour at these zooms (%) instead of its own, each panned at the speed of the
 *  nearest of STAGES' zooms */
export function zoomStages(spec: string | null): Stage[] | null {
  const zs = (spec ?? '').split(',').map(Number).filter(z => Number.isFinite(z) && z > 0);
  if (!zs.length) return null;
  return zs.map(p => { const z = p / 100, near = STAGES.slice(0, 4).reduce((a, b) => (Math.abs(b.z - z) < Math.abs(a.z - z) ? b : a)); return { name: `tour ${p}% pan`, z, vx: near.vx, vy: near.vy, secs: 6 }; });
}
/** T272: the tile caches' counts summed over the ground workers (as their last bakes reported them) */
function tileTotals(g: Game): TileCacheStats {
  const out: TileCacheStats = { decodes: {}, redecodes: {}, drops: {}, scaleMs: 0, scales: 0, bytes: 0, peakBytes: 0, painted: { decodes: 0, redecodes: 0, drops: 0 }, drawn: 0, drawnBytes: 0 };
  const add = (a: Record<string, number>, b: Record<string, number>) => { for (const [k, v] of Object.entries(b)) a[k] = (a[k] ?? 0) + v; };
  for (const t of g.ground.tileStats) {
    if (!t) continue;
    add(out.decodes, t.decodes); add(out.redecodes, t.redecodes); add(out.drops, t.drops);
    out.scaleMs += t.scaleMs; out.scales += t.scales; out.bytes += t.bytes; out.peakBytes += t.peakBytes;
    out.drawn += t.drawn; out.drawnBytes += t.drawnBytes; out.painted.decodes += t.painted.decodes; out.painted.redecodes += t.painted.redecodes; out.painted.drops += t.painted.drops;
  }
  return out;
}
/** T272: one stage's bakes (from bake b0 on: their ms, their wait for decodes, their ms scaling tiles, median and p95) and what the tile caches
 *  did meanwhile (against the counts at its start, s0): decodes, redecodes and drops in all and by family, the caches' MB now and at most */
function tileStage(g: Game, b0: number, s0: TileCacheStats): Record<string, unknown> {
  const n = Math.min(g.ground.baked - b0, g.ground.bakeLog.length), ms: number[] = [], prep: number[] = [], scale: number[] = [], work: number[] = [];
  for (let k = g.ground.baked - n; k < g.ground.baked; k++) { const i = k % g.ground.bakeLog.length, a = g.ground.bakeLog[i]!, b = g.ground.prepLog[i] ?? 0; ms.push(a); prep.push(b); scale.push(g.ground.scaleLog[i] ?? 0); work.push(a + b); }
  const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return +(s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0).toFixed(2); };
  const s1 = tileTotals(g), d = (a: Record<string, number>, b: Record<string, number>) => { const o: Record<string, number> = {}; for (const [k, v] of Object.entries(a)) { const x = v - (b[k] ?? 0); if (x) o[k] = x; } return o; };
  const dec = d(s1.decodes, s0.decodes), re = d(s1.redecodes, s0.redecodes), dr = d(s1.drops, s0.drops), sum = (o: Record<string, number>) => Object.values(o).reduce((p, v) => p + v, 0);
  const fams = new Set([...Object.keys(dec), ...Object.keys(dr)]), byFamily: Record<string, [number, number, number]> = {};
  for (const f of [...fams].sort()) byFamily[f] = [dec[f] ?? 0, re[f] ?? 0, dr[f] ?? 0];
  return {
    bakes: ms.length, bakeMedianMs: q(ms, 0.5), bakeP95Ms: q(ms, 0.95), prepMedianMs: q(prep, 0.5), prepP95Ms: q(prep, 0.95), scaleMedianMs: q(scale, 0.5), scaleP95Ms: q(scale, 0.95), workMedianMs: q(work, 0.5), workP95Ms: q(work, 0.95),
    decodes: sum(dec), redecodes: sum(re), drops: sum(dr), scales: s1.scales - s0.scales, scaleMs: +(s1.scaleMs - s0.scaleMs).toFixed(1),
    paintedDecodes: s1.painted.decodes - s0.painted.decodes, paintedRedecodes: s1.painted.redecodes - s0.painted.redecodes,
    drawnPictures: s1.drawn, drawnMB: +(s1.drawnBytes / 1048576).toFixed(1), tileCacheMB: +(s1.bytes / 1048576).toFixed(1), tileCachePeakMB: +(s1.peakBytes / 1048576).toFixed(1), groundCacheMB: Math.round(g.ground.residentPx * 4 / 1048576),
    byFamily,
  };
}
/** T265 (#794, ?bench&fixture=range20&river=1, bench.mjs --river 1): the grown town's river where it runs through the town, the camera following
 *  the river (back and forth along its line) at 30%, 15% and 8%, with the belts and the river's swamp in view; then the bake check (bakeStage) */
export const RIVER_STAGES: Stage[] = [{ name: 'river 30% pan', z: 0.3, vx: 900, vy: 300, secs: 6 }, { name: 'river 15% pan', z: 0.15, vx: 900, vy: 350, secs: 6 }, { name: 'river 8% pan', z: 0.08, vx: 4000, vy: 1500, secs: 6 }];
/** T265: the river's line from its point nearest (x, y): the camera's world px at s world px along it (either way, clamped to its ends) */
function riverFollow(g: Game, x: number, y: number): ((s: number) => { X: number; Y: number }) | null {
  const r = g.terrain?.waters.find(w => w.kind === 'river'); if (!r || r.pts.length < 2) return null;
  const P = r.pts.map(p => ({ X: worldX(p.x, p.y), Y: worldY(p.x, p.y) })), L = [0];
  for (let k = 1; k < P.length; k++) L.push(L[k - 1]! + Math.hypot(P[k]!.X - P[k - 1]!.X, P[k]!.Y - P[k - 1]!.Y));
  let k0 = 0, d = Infinity; r.pts.forEach((p, k) => { const e = Math.hypot(p.x - x, p.y - y); if (e < d) { d = e; k0 = k; } });
  const s0 = L[k0]!;
  return s => {
    const t = Math.max(0, Math.min(L[L.length - 1]!, s0 + s)); let k = 1; while (k < L.length - 1 && L[k]! < t) k++;
    const f = (t - L[k - 1]!) / Math.max(1e-6, L[k]! - L[k - 1]!); return { X: P[k - 1]!.X + (P[k]!.X - P[k - 1]!.X) * f, Y: P[k - 1]!.Y + (P[k]!.Y - P[k - 1]!.Y) * f };
  };
}

/** the grown-town scene's town time: 08:00, the morning peak (the fixture is saved at 06:30, the range's morning), and the time the tour
 *  waits after the clock moves, for the commute to fill the roads (15 s: 36 town minutes on the 10-minute town day) */
const SCENE_MINUTE = 8 * 60, WARM_MS = 15000;
/** T208: the course scene's town time, 11:00: the morning's groups are all out and the afternoon's are teeing off */
const GOLF_MINUTE = 11 * 60;

/** The bench's game scenes (T098, issue #168), toured on the game the engine made in place of the synthetic city: `range` (?bench&start=range)
 *  the new range start; `fixture` (?bench&fixture=range20, dev/fixtures.ts) the range start's grown town at year 20, its town clock moved on
 *  to 08:00 and its commute let build for WARM_MS. The tour pans from the start's or the save's camera with the game's own traffic, once the
 *  game is ready and a loaded town's lots are composed (at most 30 s) */
export function benchGame(g: Game, scene: BenchScene) {
  g.benchMode = true; g.ground.setTileStats(true); // (T272: each bake reports the tile cache's counts)
  if (new URLSearchParams(location.search).get('tourOnly') === '1') (g.ground as unknown as { firstBakes: Map<string, number> | null }).firstBakes = new Map();
  // T265: ?belts=0 (bench.mjs --belts 0): the tree belts off for the run (Engine.setRiverTrees), the forest and the town trees as before
  if (new URLSearchParams(location.search).get('belts') === '0') (g as unknown as { setRiverTrees?: (on: boolean) => void }).setRiverTrees?.(false);
  // T265: ?riverSwamp=0 (bench.mjs --riverSwamp 0): the river's swamp off for the run (GroundCache.setRiverSwamp)
  if (new URLSearchParams(location.search).get('riverSwamp') === '0') (g.ground as unknown as { setRiverSwamp?: (on: boolean) => void }).setRiverSwamp?.(false);
  const t0 = performance.now();
  let warm = 0;
  g.onFrame = () => {
    if (!g.ready || (g.lotsPending > 0 && performance.now() - t0 < 30000)) return;
    if (scene === 'fixture' && !warm) { const T = g.traffic; T.setTownClock(jumpTo(T.town, T.simTime(performance.now()), SCENE_MINUTE, T.town.rate)); warm = performance.now(); }
    // T208: the course scene at GOLF_MINUTE (the most golfers out on an ordinary day), the camera over the course's middle
    if (scene === 'golf' && !warm) {
      const T = g.traffic; T.setTownClock(jumpTo(T.town, T.simTime(performance.now()), GOLF_MINUTE, T.town.rate)); warm = performance.now();
    }
    if (warm && performance.now() - warm < WARM_MS) return;
    g.onFrame = null;
    // T208: the course scene's camera over the middle of the golfers out (else the course's middle)
    if (scene === 'golf') { const f = g.dayFocus(), c = g.golf?.course; if (f) g.lookAt(f.x, f.y, 0.3); else if (c) g.lookAt(c[0] + c[2] / 2, c[1] + c[3] / 2, 0.3); }
    const at = townTimeOf(g.traffic.town, g.traffic.simTime(performance.now())), clock = `${String(at.hour).padStart(2, '0')}:${String(at.minute).padStart(2, '0')}`;
    const info = { scene, ...(scene === 'golf' ? { golfersOut: g.dayOutNow() } : {}), heap: mem() as unknown as number, segs: g.net.segs.size, nodes: g.net.nodes.size, props: g.props.size, lotProps: g.perf.lotProps, lotsPending: g.lotsPending, pop: g.perf.pop, built: g.perf.built, settleMs: Math.round(performance.now() - t0), clock, carsAtStart: g.perf.simActive };
    console.log('[bench] scene', info);
    // T265: ?river=1, the river through the town (its point nearest the first town's centre)
    const town = g.townPts[0], follow = scene === 'fixture' && new URLSearchParams(location.search).get('river') === '1' && town ? riverFollow(g, town.x, town.y) : null;
    // (?river=1&bakeab=1, bench.mjs --river 1 --bakeab 1: only the bake check, on a fresh page: no tour before it, so no long session's heap and
    //  caches in the paints)
    if (follow && new URLSearchParams(location.search).get('bakeab') === '1') {
      const c = follow(0); bakeStage(g, c, [0.3, 0.15, 0.08], r => { const out = { ...info, river: true, bakeOnly: true, stages: r }; (window as unknown as { __bench: unknown }).__bench = out; console.log('[bench] results', JSON.stringify(out, null, 1)); });
      return;
    }
    if (follow) { const c = follow(0); g.cam.X = c.X; g.cam.Y = c.Y; startTour(g, { ...info, river: true }, RIVER_STAGES, follow); return; }
    startTour(g, info, zoomStages(new URLSearchParams(location.search).get('zooms')) ?? SCENE_STAGES[scene]);
  };
}

function startTour(g: Game, info: Record<string, unknown>, stages: Stage[] = STAGES, follow: ((s: number) => { X: number; Y: number }) | null = null) {
  const results: Record<string, unknown>[] = [];
  let s = 0, t = -2, frames: number[] = [], cpu: number[] = [], inst = 0, draws = 0, upload = 0, up = 0;
  /** T265: the most ms a frame's tree planting took this stage (perf.plantMs, the hitch check), the frames that planted, the distance along the river */
  let plantMax = 0, plantFrames = 0, along = 0; const bake0 = g.ground.baked;
  /** T272: the stage's first bake and the tile caches' counts at its start (tileStage) */
  let sb0 = g.ground.baked, ss0 = tileTotals(g); g.ground.setTileStats(true);
  /** the sim worker's tick time: the max per stage, and the average and max over the whole tour */
  let stageSim = 0, simSum = 0, simN = 0, simMax = 0;
  const startX = g.cam.X, startY = g.cam.Y;
  g.onFrame = (_now, dt) => {
    if (!g.ready) return;
    const tick = g.perf.simTickMs;
    stageSim = Math.max(stageSim, tick); simSum += tick; simN++; simMax = Math.max(simMax, tick);
    t += dt;
    const st = stages[s];
    g.cam.z = st.z;
    const dir = Math.floor(Math.max(0, t) / 3) % 2 ? -1 : 1;
    if (follow) { along += Math.hypot(st.vx, st.vy) * dt * dir; const c = follow(along); g.cam.X = c.X; g.cam.Y = c.Y; }
    else { g.cam.X += st.vx * dt * dir; g.cam.Y += st.vy * dt * dir; }
    const pm = (g.perf as { plantMs?: number }).plantMs ?? 0; if (t > 1 && pm > 0) { plantMax = Math.max(plantMax, pm); plantFrames++; }
    if (st.z < PLANNER_Z / 3) { g.cam.X = 0; g.cam.Y = MAP * 32; }
    up = Math.max(up, g.ground.uploadsThisSecond);
    if (t > 1) { frames.push(g.perf.frameMs); cpu.push(g.perf.cpuMs); inst = Math.max(inst, g.perf.instances); draws = Math.max(draws, g.perf.draws); upload = Math.max(upload, g.perf.uploadKB); }
    if (t >= st.secs) {
      const sorted = [...cpu].sort((a, b) => a - b), q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
      const fAvg = frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length);
      results.push({ stage: st.name, fps: +(1000 / fAvg).toFixed(1), cpuAvgMs: +(cpu.reduce((a, b) => a + b, 0) / Math.max(1, cpu.length)).toFixed(2), cpuP95Ms: +q(0.95).toFixed(2), maxInstances: inst, maxDraws: draws, maxUploadKB: Math.round(upload), chunkUploadsPerSec: up, uploadMsPerSec: +g.ground.uploadMsPerSecond.toFixed(1), simTickMsMax: +stageSim.toFixed(2), cars: g.perf.simActive, ...(follow ? { plantMsMax: +plantMax.toFixed(2), plantFrames } : {}), tiles: tileStage(g, sb0, ss0) });
      sb0 = g.ground.baked; ss0 = tileTotals(g); g.ground.setTileStats(true); // (the next stage's working set counted afresh)
      s++; t = 0; frames = []; cpu = []; inst = draws = upload = up = 0; stageSim = 0; g.cam.X = startX; g.cam.Y = startY; plantMax = 0; plantFrames = 0; along = 0;
      if (s >= stages.length) {
        g.onFrame = null;
        // (?tourOnly=1, bench.mjs --tourOnly 1: the tour alone, without the bake and frame checks after it)
        if (follow && new URLSearchParams(location.search).get('tourOnly') === '1') { info.firstBakes = Object.fromEntries((g.ground as unknown as { firstBakes: Map<string, number> | null }).firstBakes ?? []); finish(bakeStats(g, bake0)); return; }
        if (follow) { const bakes = bakeStats(g, bake0); bakeStage(g, follow(0), [0.3, 0.15, 0.08], r => { results.push(...r); frameStage(g, follow, r2 => { results.push(...r2); finish(bakes); }); }); return; }
        if (info.course) { const at = info.course as { x: number; y: number }; paintStage(g, at, r => { results.push(r); wizardStage(g, at, r2 => { results.push(r2); finish(); }); }); return; }
        finish();
      }
    }
  };
  function finish(tourBakes?: Record<string, number>) {
    const trees = { forest: g.perf.forest, townTrees: g.perf.townTrees, belt: (g.perf as { belt?: number }).belt ?? 0 };
    const out = { ...info, ...(tourBakes ? { tourBakes, trees } : {}), cars: info.scene ? g.perf.simActive : BENCH_CARS, dpr: g.dpr, screen: `${g.cw}x${g.ch}`, groundBakes: g.ground.baked, avgBakeMs: +(g.ground.bakeMs / Math.max(1, g.ground.baked)).toFixed(1), groundCacheMB: Math.round(g.ground.residentPx * 4 / 1048576), groundCachePeakMB: Math.round(g.ground.peakPx * 4 / 1048576), shineMB: +(g.ground.shineBytes / 1048576).toFixed(2), sim: { active: g.perf.simActive, tickMsAvg: +(simSum / Math.max(1, simN)).toFixed(2), tickMsMax: +simMax.toFixed(2) }, stages: results };
    (window as unknown as { __bench: unknown }).__bench = out;
    console.log('[bench] results', JSON.stringify(out, null, 1));
    g.toast('Benchmark finished: results in the console', 'good');
  }
}

/** the New hole wizard's drag (T102, with ?course=1): 4 s at 30% over the course, the green of a 3-bend par 5 (about 560 m, 40,000 cells)
 *  dragged half a tile every frame; per frame the main-thread ms of the re-plan and the ghost (the cells a Build would lay, their price
 *  and outlines: ext/hole-wizard), the budget being 4 ms */
function wizardStage(g: Game, at: { x: number; y: number }, done: (r: Record<string, unknown>) => void) {
  g.cam = { X: worldX(at.x, at.y), Y: worldY(at.x, at.y), z: 0.3 };
  const w = new HoleWizard({ grid: () => g.courseGrid, plans: () => [], month: () => 64, price: s => (s ? 2 : 0), money: () => Infinity });
  const green = { x: at.x + 70.25, y: at.y + 90.25 };
  w.start(10);
  w.plan = newPlan(10, { x: at.x - 110.25, y: at.y - 100.25 }, green, [{ x: at.x - 60, y: at.y - 80 }, { x: at.x - 10, y: at.y - 20 }, { x: at.x + 50, y: at.y + 20 }]);
  w.step = 'shape';
  w.drag = { k: 'green', i: 0, x: green.x, y: green.y };
  let t = -1, k = 0, cells = 0, len = 0;
  const ms: number[] = [];
  const stats = (a: number[]) => { const s = [...a].sort((p, q) => p - q), q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0; return { avg: +(a.reduce((p, v) => p + v, 0) / Math.max(1, a.length)).toFixed(2), p95: +q(0.95).toFixed(2), max: +(s[s.length - 1] ?? 0).toFixed(2) }; };
  g.onFrame = (_now, dt) => {
    t += dt;
    if (t < 0) return;
    const t0 = performance.now();
    k++; w.dragTo({ x: green.x + (k % 40) * 0.5, y: green.y + (k % 7) * 0.5 });
    const gh = w.ghost();
    ms.push(performance.now() - t0);
    if (gh) { cells = gh.diff.n; len = gh.info.lengthM; }
    if (t >= 4) { g.onFrame = null; done({ stage: 'hole wizard drag 30%', drags: ms.length, ghostMs: stats(ms), cells, lengthM: len }); }
  };
}

/** the scripted paint stroke (T077b, with ?course=1): 6 s at 30% over the course, a 3-tile green dab every frame moving 0.5 tile along a
 *  zigzag (so every dab changes cells), then 2 s to settle. Per frame: the dab's own ms, the course work on the main thread (the dab, the
 *  chunk sends and replies: perf.courseMs) plus the lot ground's flush to the workers, the frame's cpu; per send, its lag after the first
 *  change it carries; and the ground bakes it caused (count and mean worker ms) */
function paintStage(g: Game, at: { x: number; y: number }, done: (r: Record<string, unknown>) => void) {
  g.cam = { X: worldX(at.x, at.y), Y: worldY(at.x, at.y), z: 0.3 };
  let t = -2, x = at.x - 24, y = at.y - 12, dir = 1, row = 0, lastLag = -1;
  const dab: number[] = [], main: number[] = [], cpu: number[] = [], lag: number[] = [], frame: number[] = [], job: number[] = [], b0 = { n: 0, ms: 0 };
  let lastJob = g.perf.courseJobMs, lastNow = 0, ups = 0, upMs = 0, t1 = 0, upMsMouse = -1;
  const stats = (a: number[]) => { const s = [...a].sort((p, q) => p - q), q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0; return { avg: +(a.reduce((p, v) => p + v, 0) / Math.max(1, a.length)).toFixed(2), p95: +q(0.95).toFixed(2), max: +(s[s.length - 1] ?? 0).toFixed(2) }; };
  g.onFrame = (now, dt) => {
    t += dt;
    if (t < 0) return;
    if (!b0.n && !b0.ms) { b0.n = g.ground.baked || 1e-9; b0.ms = g.ground.bakeMs; }
    if (t < 6) {
      const nx = x + 0.5 * dir, t0 = performance.now(), n = g.courseDab(x, y, nx, y, 3, 8), tb = performance.now();
      if (n) dab.push(tb - t0);
      x = nx; if (Math.abs(x - at.x) > 24) { dir = -dir; row++; y = at.y - 12 + row * 4; }
    } else if (upMsMouse < 0) { const tm = performance.now(); g.gridAreaList(); upMsMouse = performance.now() - tm; } // the mouse-up: the holes' areas asked for again
    main.push(g.perf.courseMs + g.perf.lotFlushMs); cpu.push(g.perf.cpuMs); if (lastNow) frame.push(now - lastNow); lastNow = now;
    if (g.perf.courseJobMs !== lastJob) { lastJob = g.perf.courseJobMs; job.push(lastJob); }
    if (performance.now() - t1 > 1000) { t1 = performance.now(); ups += g.ground.uploadsThisSecond; upMs += g.ground.uploadMsPerSecond; }
    if (g.perf.courseLagMs !== lastLag) { const first = lastLag < 0; lastLag = g.perf.courseLagMs; if (!first) lag.push(lastLag); } // (the first value is the last send before the stage)
    if (t >= 8) {
      g.onFrame = null;
      const bakes = g.ground.baked - Math.floor(b0.n);
      done({ stage: 'course paint 30%', mouseUpMs: +upMsMouse.toFixed(2), areasJobMs: +g.perf.areasJobMs.toFixed(1), areasApplyMs: +g.perf.areasApplyMs.toFixed(2), dabs: dab.length, fps: +(1000 / (frame.reduce((p, v) => p + v, 0) / Math.max(1, frame.length))).toFixed(1), frameMs: stats(frame), dabMs: stats(dab), courseMainMsPerFrame: stats(main), cpuMs: stats(cpu), sends: lag.length, sendLagMs: stats(lag), workerJobMs: stats(job), uploadsPerSec: +(ups / 8).toFixed(1), uploadMsPerSec: +(upMs / 8).toFixed(1), groundBakes: bakes, avgBakeMs: +((g.ground.bakeMs - b0.ms) / Math.max(1, bakes)).toFixed(1) });
    }
  };
}

/** T265: the median, p95 and count of the ground bakes since bake b0 (GroundCache bakeLog, a ring of BAKE_LOG) */
function bakeStats(g: Game, b0: number): Record<string, number> {
  const n = Math.min(g.ground.baked - b0, g.ground.bakeLog.length), a: number[] = [];
  for (let k = g.ground.baked - n; k < g.ground.baked; k++) a.push(g.ground.bakeLog[k % g.ground.bakeLog.length]!);
  a.sort((p, q) => p - q);
  const q = (p: number) => a[Math.min(a.length - 1, Math.floor(p * a.length))] ?? 0;
  return { bakes: a.length, medianMs: +q(0.5).toFixed(2), p95Ms: +q(0.95).toFixed(2), avgMs: +(a.reduce((p, v) => p + v, 0) / Math.max(1, a.length)).toFixed(2) };
}
/** T265: the bake check over the river (the camera still at c): at each zoom every chunk is baked again (invalidateAll), 4 s a run, three runs,
 *  and the bakes' median taken over the three; with the river's swamp switch (GroundCache.setRiverSwamp, the branch) on and off by turns,
 *  else (main) as it is */
function bakeStage(g: Game, c: { X: number; Y: number }, zooms: number[], done: (r: Record<string, unknown>[]) => void) {
  const gc = g.ground as unknown as { setRiverSwamp?: (on: boolean) => void; invalidateAll(): void; bakeAB?: (kind: 'g' | 'm', reps: number, cold?: boolean) => Promise<{ on: number[]; off: number[] }> }, out: Record<string, unknown>[] = [];
  // (the branch: each worker paints its last bakes again with the river's swamp on and off by turns, only the paint timed: bakeABStage)
  if (gc.bakeAB) { bakeABStage(g, c, zooms, gc.bakeAB.bind(gc), done); return; }
  const runs: { z: number; swamp: boolean | null }[] = [], REPS = 3;
  for (const z of zooms) for (let r = 0; r < REPS; r++) { if (gc.setRiverSwamp) runs.push({ z, swamp: true }, { z, swamp: false }); else runs.push({ z, swamp: null }); }
  const pooled = new Map<string, number[]>();
  let k = 0, t = 0, b0 = 0;
  const next = () => {
    if (k >= runs.length) {
      gc.setRiverSwamp?.(true); g.onFrame = null;
      for (const [stage, a] of pooled) { a.sort((p, q) => p - q); const q = (p: number) => a[Math.min(a.length - 1, Math.floor(p * a.length))] ?? 0; out.push({ stage, bakes: a.length, medianMs: +q(0.5).toFixed(2), p95Ms: +q(0.95).toFixed(2), avgMs: +(a.reduce((p, v) => p + v, 0) / Math.max(1, a.length)).toFixed(2) }); }
      done(out); return;
    }
    const r = runs[k]!; g.cam = { X: c.X, Y: c.Y, z: r.z }; t = 0; b0 = -1;
    g.onFrame = (_now, dt) => {
      t += dt;
      if (b0 < 0 && t > 1.5) { if (r.swamp !== null) gc.setRiverSwamp!(r.swamp); gc.invalidateAll(); b0 = g.ground.baked; }
      if (b0 >= 0 && t > 5.5) {
        const stage = `bake ${Math.round(r.z * 100)}%${r.swamp === null ? '' : r.swamp ? ' river swamp on' : ' river swamp off'}`, a = pooled.get(stage) ?? [];
        for (let b = Math.max(b0, g.ground.baked - g.ground.bakeLog.length); b < g.ground.baked; b++) a.push(g.ground.bakeLog[b % g.ground.bakeLog.length]!);
        pooled.set(stage, a); k++; next();
      }
    };
  };
  next();
}

/** T265: the belts' frame check along the river (the same page, so the PC's other load falls alike on both): at 30%, 15% and 8%, the belts
 *  on and off by turns (Engine.setRiverTrees, the branch; main as it is), three times each: 2.5 s for the cells to be planted again, then 4 s of
 *  the river pan, the frames' cpu ms pooled (avg, p95) with the most instances */
function frameStage(g: Game, follow: (s: number) => { X: number; Y: number }, done: (r: Record<string, unknown>[]) => void) {
  const eg = g as unknown as { setRiverTrees?: (on: boolean) => void }, out: Record<string, unknown>[] = [];
  const runs: { st: Stage; on: boolean | null }[] = [];
  for (const st of RIVER_STAGES) for (let r = 0; r < 3; r++) { if (eg.setRiverTrees) runs.push({ st, on: true }, { st, on: false }); else runs.push({ st, on: null }); }
  const pooled = new Map<string, { cpu: number[]; inst: number }>();
  let k = 0, t = 0, along = 0;
  const next = () => {
    if (k >= runs.length) {
      eg.setRiverTrees?.(true); g.onFrame = null;
      for (const [stage, v] of pooled) { const a = [...v.cpu].sort((p, q) => p - q), q = (p: number) => a[Math.min(a.length - 1, Math.floor(p * a.length))] ?? 0; out.push({ stage, frames: a.length, cpuAvgMs: +(a.reduce((p, x) => p + x, 0) / Math.max(1, a.length)).toFixed(2), cpuP95Ms: +q(0.95).toFixed(2), maxInstances: v.inst }); }
      done(out); return;
    }
    const r = runs[k]!; if (r.on !== null) eg.setRiverTrees!(r.on);
    t = -2.5; along = 0; const c0 = follow(0); g.cam = { X: c0.X, Y: c0.Y, z: r.st.z };
    const stage = `frames ${r.st.name}${r.on === null ? '' : r.on ? ' belts on' : ' belts off'}`, v = pooled.get(stage) ?? { cpu: [], inst: 0 }; pooled.set(stage, v);
    g.onFrame = (_now, dt) => {
      t += dt; if (t < 0) return;
      const dir = Math.floor(t / 2) % 2 ? -1 : 1; along += Math.hypot(r.st.vx, r.st.vy) * dt * dir; const c = follow(along); g.cam.X = c.X; g.cam.Y = c.Y; g.cam.z = r.st.z;
      if (t > 0.2) { v.cpu.push(g.perf.cpuMs); v.inst = Math.max(v.inst, g.perf.instances); }
      if (t >= 4) { k++; next(); }
    };
  };
  next();
}

/** T265: the swamp's bake check on the branch: at each zoom, over the river (the camera still at c) 3.5 s for the view's chunks to be baked,
 *  (the view baked again), then every worker paints its last bakes of that tier again three times, the river's swamp on and off by turns (GroundCache bakeAB: one
 *  worker, one chunk, back to back, so the PC's other load falls alike on both); the paints' median, p95 and mean, on and off */
function bakeABStage(g: Game, c: { X: number; Y: number }, zooms: number[], ab: (kind: 'g' | 'm', reps: number, cold?: boolean) => Promise<{ on: number[]; off: number[] }>, done: (r: Record<string, unknown>[]) => void) {
  const out: Record<string, unknown>[] = [];
  const stats = (a: number[]) => { const s = [...a].sort((p, q) => p - q), q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0; return { paints: s.length, medianMs: +q(0.5).toFixed(2), p95Ms: +q(0.95).toFixed(2), avgMs: +(s.reduce((p, v) => p + v, 0) / Math.max(1, s.length)).toFixed(2) }; };
  let k = 0, t = 0;
  const next = () => {
    if (k >= zooms.length) { g.onFrame = null; done(out); return; }
    const z = zooms[k]!; g.cam = { X: c.X, Y: c.Y, z }; t = 0; let asked = false, fresh = false;
    g.onFrame = (_now, dt) => {
      t += dt; if (!fresh && t > 0.5) { fresh = true; g.ground.invalidateAll(); } // (the view baked again at this zoom: the workers' last bakes are its chunks)
      if (asked || t < 4.5) return;
      asked = true; const kind = g.perf.tier === 'district' ? 'm' : 'g';
      // (warm: the bands' alphas kept from the chunk's last bake, as an edit's or another level's bake finds them; cold: made again, a first bake's)
      const one = (cold: boolean) => ab(kind, 3, cold).then(r => {
        // (and the paired difference: each chunk's paint with the swamp less the same chunk's without, back to back; its median)
        const on = stats(r.on), off = stats(r.off), d = r.on.map((v, i) => v - r.off[i]!).sort((p, q) => p - q), dm = d.length ? d[d.length >> 1]! : 0, tag = `bake ${Math.round(z * 100)}% (${kind}${cold ? ', cold' : ''})`;
        out.push({ stage: `${tag} river swamp on`, ...on }, { stage: `${tag} river swamp off`, ...off, medianDeltaMs: +(on.medianMs - off.medianMs).toFixed(2), pairedMedianDeltaMs: +dm.toFixed(2) });
      });
      void one(true).then(() => one(false)).then(() => { k++; next(); });
    };
  };
  next();
}
