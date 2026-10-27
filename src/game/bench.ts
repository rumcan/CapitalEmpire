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
};
export type BenchScene = 'range' | 'fixture';

/** the grown-town scene's town time: 08:00, the morning peak (the fixture is saved at 06:30, the range's morning), and the time the tour
 *  waits after the clock moves, for the commute to fill the roads (15 s: 36 town minutes on the 10-minute town day) */
const SCENE_MINUTE = 8 * 60, WARM_MS = 15000;

/** The bench's game scenes (T098, issue #168), toured on the game the engine made in place of the synthetic city: `range` (?bench&start=range)
 *  the new range start; `fixture` (?bench&fixture=range20, dev/fixtures.ts) the range start's grown town at year 20, its town clock moved on
 *  to 08:00 and its commute let build for WARM_MS. The tour pans from the start's or the save's camera with the game's own traffic, once the
 *  game is ready and a loaded town's lots are composed (at most 30 s) */
export function benchGame(g: Game, scene: BenchScene) {
  g.benchMode = true;
  const t0 = performance.now();
  let warm = 0;
  g.onFrame = () => {
    if (!g.ready || (g.lotsPending > 0 && performance.now() - t0 < 30000)) return;
    if (scene === 'fixture' && !warm) { const T = g.traffic; T.setTownClock(jumpTo(T.town, T.simTime(performance.now()), SCENE_MINUTE, T.town.rate)); warm = performance.now(); }
    if (warm && performance.now() - warm < WARM_MS) return;
    g.onFrame = null;
    const at = townTimeOf(g.traffic.town, g.traffic.simTime(performance.now())), clock = `${String(at.hour).padStart(2, '0')}:${String(at.minute).padStart(2, '0')}`;
    const info = { scene, heap: mem() as unknown as number, segs: g.net.segs.size, nodes: g.net.nodes.size, props: g.props.size, lotProps: g.perf.lotProps, lotsPending: g.lotsPending, pop: g.perf.pop, built: g.perf.built, settleMs: Math.round(performance.now() - t0), clock, carsAtStart: g.perf.simActive };
    console.log('[bench] scene', info);
    startTour(g, info, SCENE_STAGES[scene]);
  };
}

function startTour(g: Game, info: Record<string, unknown>, stages: Stage[] = STAGES) {
  const results: Record<string, unknown>[] = [];
  let s = 0, t = -2, frames: number[] = [], cpu: number[] = [], inst = 0, draws = 0, upload = 0, up = 0;
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
    g.cam.X += st.vx * dt * dir; g.cam.Y += st.vy * dt * dir;
    if (st.z < PLANNER_Z / 3) { g.cam.X = 0; g.cam.Y = MAP * 32; }
    up = Math.max(up, g.ground.uploadsThisSecond);
    if (t > 1) { frames.push(g.perf.frameMs); cpu.push(g.perf.cpuMs); inst = Math.max(inst, g.perf.instances); draws = Math.max(draws, g.perf.draws); upload = Math.max(upload, g.perf.uploadKB); }
    if (t >= st.secs) {
      const sorted = [...cpu].sort((a, b) => a - b), q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
      const fAvg = frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length);
      results.push({ stage: st.name, fps: +(1000 / fAvg).toFixed(1), cpuAvgMs: +(cpu.reduce((a, b) => a + b, 0) / Math.max(1, cpu.length)).toFixed(2), cpuP95Ms: +q(0.95).toFixed(2), maxInstances: inst, maxDraws: draws, maxUploadKB: Math.round(upload), chunkUploadsPerSec: up, uploadMsPerSec: +g.ground.uploadMsPerSecond.toFixed(1), simTickMsMax: +stageSim.toFixed(2), cars: g.perf.simActive });
      s++; t = 0; frames = []; cpu = []; inst = draws = upload = up = 0; stageSim = 0; g.cam.X = startX; g.cam.Y = startY;
      if (s >= stages.length) {
        g.onFrame = null;
        if (info.course) { const at = info.course as { x: number; y: number }; paintStage(g, at, r => { results.push(r); wizardStage(g, at, r2 => { results.push(r2); finish(); }); }); return; }
        finish();
      }
    }
  };
  function finish() {
    const out = { ...info, cars: info.scene ? g.perf.simActive : BENCH_CARS, dpr: g.dpr, screen: `${g.cw}x${g.ch}`, groundBakes: g.ground.baked, avgBakeMs: +(g.ground.bakeMs / Math.max(1, g.ground.baked)).toFixed(1), groundCacheMB: Math.round(g.ground.residentPx * 4 / 1048576), groundCachePeakMB: Math.round(g.ground.peakPx * 4 / 1048576), sim: { active: g.perf.simActive, tickMsAvg: +(simSum / Math.max(1, simN)).toFixed(2), tickMsMax: +simMax.toFixed(2) }, stages: results };
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
