/** The Phase-0 benchmark: a synthetic 4 km city (a 40-tile street grid with avenues and boulevards, ~500k props,
 *  10k test cars) and a scripted camera tour through every zoom tier that records frame times.
 *  Open the game with ?bench. Results land in window.__bench (and the console) when the tour ends. */
import type { Game } from './engine';
import { MAP, PLANNER_Z, mulberry, worldX, worldY } from './iso';
import { LIBRARY } from './library';
import { CLASS, type NodeType } from './network';

const GRID = 40, M0 = 96, LINES = Math.floor((MAP - 2 * M0) / GRID) + 1;
export const BENCH_CARS = 10000;

const mem = () => { const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory; return m ? Math.round(m.usedJSHeapSize / 1048576) + ' MB' : '?'; };
/** size = the fraction of the full 4 km grid to fill (1 = everything) */
export function buildBenchmark(g: Game, size = 1) {
  g.benchMode = true;
  const t0 = performance.now(), rnd = mulberry(99);
  const lines = Math.max(3, Math.round(LINES * Math.sqrt(size))), at = (k: number) => M0 + k * GRID, last = at(lines - 1);
  const clsOf = (k: number) => (k % 15 === 0 ? CLASS.boulevard : k % 5 === 0 ? CLASS.avenue : CLASS.street);
  for (let k = 0; k < lines; k++) {
    g.edit.addLegs([{ a: { x: M0, y: at(k) }, b: { x: last, y: at(k) } }], clsOf(k), 0);
    g.edit.addLegs([{ a: { x: at(k), y: M0 }, b: { x: at(k), y: last } }], clsOf(k), 0);
  }
  g.net.rebuild(true);
  for (let a = 0; a < lines; a++) for (let b = 0; b < lines; b++) {
    const big = a % 5 === 0 && b % 5 === 0; if (!big) continue;
    const n = g.net.nodeAt({ x: at(a), y: at(b) }); if (!n) continue;
    const type: NodeType = a % 15 === 0 && b % 15 === 0 ? 'plain' : (a + b) % 10 === 0 ? 'roundabout' : 'signal';
    if (type !== 'plain') g.edit.setNodeType(n, type);
  }
  g.net.rebuild();
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
  const info = { heap: mem() as unknown as number, segs: g.net.segs.size, nodes: g.net.nodes.size, props: g.props.size, lamps, buildNetMs: Math.round(tNet - t0), buildPropsMs: Math.round(tProps - tNet) };
  console.log('[bench] built', info);
  startTour(g, info);
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

function startTour(g: Game, info: Record<string, number>) {
  const results: Record<string, unknown>[] = [];
  let s = 0, t = -2, frames: number[] = [], cpu: number[] = [], inst = 0, draws = 0, upload = 0, up = 0;
  const startX = g.cam.X, startY = g.cam.Y;
  g.onFrame = (_now, dt) => {
    if (!g.ready) return;
    t += dt;
    const st = STAGES[s];
    g.cam.z = st.z;
    const dir = Math.floor(Math.max(0, t) / 3) % 2 ? -1 : 1;
    g.cam.X += st.vx * dt * dir; g.cam.Y += st.vy * dt * dir;
    if (st.z < PLANNER_Z / 3) { g.cam.X = 0; g.cam.Y = MAP * 32; }
    up = Math.max(up, g.ground.uploadsThisSecond);
    if (t > 1) { frames.push(g.perf.frameMs); cpu.push(g.perf.cpuMs); inst = Math.max(inst, g.perf.instances); draws = Math.max(draws, g.perf.draws); upload = Math.max(upload, g.perf.uploadKB); }
    if (t >= st.secs) {
      const sorted = [...cpu].sort((a, b) => a - b), q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
      const fAvg = frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length);
      results.push({ stage: st.name, fps: +(1000 / fAvg).toFixed(1), cpuAvgMs: +(cpu.reduce((a, b) => a + b, 0) / Math.max(1, cpu.length)).toFixed(2), cpuP95Ms: +q(0.95).toFixed(2), maxInstances: inst, maxDraws: draws, maxUploadKB: Math.round(upload), chunkUploadsPerSec: up, uploadMsPerSec: +g.ground.uploadMsPerSecond.toFixed(1) });
      s++; t = 0; frames = []; cpu = []; inst = draws = upload = up = 0; g.cam.X = startX; g.cam.Y = startY;
      if (s >= STAGES.length) {
        g.onFrame = null;
        const out = { ...info, cars: BENCH_CARS, dpr: g.dpr, screen: `${g.cw}x${g.ch}`, groundBakes: g.ground.baked, avgBakeMs: +(g.ground.bakeMs / Math.max(1, g.ground.baked)).toFixed(1), stages: results };
        (window as unknown as { __bench: unknown }).__bench = out;
        console.log('[bench] results', JSON.stringify(out, null, 1));
        g.toast('Benchmark finished: results in the console', 'good');
      }
    }
  };
}
