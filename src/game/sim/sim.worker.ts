/// <reference lib="webworker" />
// The city worker: a thin shell around one City (game/city.ts). Messages in (edits, terrain, targets, speed), messages out: the cars
// packed into a frame every FRAME_MS (SimClient reads them), the parcels that changed, the town's events and totals, the town's
// gravel extensions and the timing logs. The city logic itself is in City, so the town gate runs the same code headless.
import type { NetOp } from '../ground-protocol';
import { City } from '../city';
import type { Lot } from '../lots/lots';
import type { TownEvent } from '../lots/town';
import type { FromSim, LotRec, SimStats, ToSim } from './protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
/** wall-clock frame period, ms; the sim is stepped once per DT of its speed. A skip (fast-forward) runs for SKIP_MS of each frame */
const FRAME_MS = 100, SKIP_MS = 70, TOWN_EVERY = 10;
const city = new City(1);
let speed = 1, forcePost = false, wasAlive = false, townPosted = 0;
/** the sim time a fast-forward runs to, s; -1 when none */
let skipUntil = -1;
const post = (m: FromSim, transfer: Transferable[] = []) => scope.postMessage(m, transfer);
const fail = (err: unknown) => post({ t: 'error', message: (err as Error).stack || String(err) });
const rec = (l: Lot): LotRec => ({ key: l.key, o: [l.o.x, l.o.y], u: [l.u.x, l.u.y], n: [l.n.x, l.n.y], w: l.w, d: l.d, cls: l.cls, corner: l.corner });

/** posts the town's events and totals: when forced, when there are events, or every TOWN_EVERY sim s */
function postTown(ev: TownEvent[], force: boolean) {
  if (!force && !ev.length && city.sim.t - townPosted < TOWN_EVERY) return;
  townPosted = city.sim.t;
  const town = city.town;
  post({ t: 'town', events: ev.slice(), pop: town.pop, jobs: town.jobs, built: town.built, access: town.access });
}

/** a new valley: the city takes its terrain; the town starts again (no lots yet) and posts its totals */
function terrainOps(m: Extract<ToSim, { t: 'terrain' }>) {
  city.terrain(m.cls, { x: m.entry[0], y: m.entry[1] }, m.seed);
  postTown([], true);
}

/** replays the ops; the city logs the timings that are slow (over 50 ms) */
function netOps(ops: NetOp[]) {
  const r = city.netOps(ops);
  if (city.graphMs > 50) post({ t: 'log', message: `net ops ${ops.length} and graph in ${city.graphMs.toFixed(0)} ms` });
  if (r.lotsAdded.length || r.lotsRemoved.length) post({ t: 'lots', added: r.lotsAdded.map(rec), removed: r.lotsRemoved });
  postTown(r.events, true);
  if (city.lotsMs > 50) post({ t: 'log', message: `lots ${r.lotsAdded.length} added, ${r.lotsRemoved.length} removed in ${city.lotsMs.toFixed(0)} ms` });
}

/** one wall-clock period: speed steps of the sim (or, while skipping, as many 20-step blocks as SKIP_MS allows), the town to the sim time, the planner, then a frame unless there is nothing to show */
function frame() {
  const skipping = skipUntil > city.sim.t;
  if (skipping) {
    const t0 = performance.now();
    while (city.sim.t < skipUntil && performance.now() - t0 < SKIP_MS) {
      const r = city.step(20);
      postTown(r.events, false);
      if (r.grow) post({ t: 'grow', legs: r.grow.flatMap(l => [l.a.x, l.a.y, l.b.x, l.b.y]) });
    }
    if (city.sim.t >= skipUntil) { skipUntil = -1; forcePost = true; }
  } else {
    const r = city.step(speed);
    postTown(r.events, false);
    if (r.grow) post({ t: 'grow', legs: r.grow.flatMap(l => [l.a.x, l.a.y, l.b.x, l.b.y]) });
  }
  const sim = city.sim, alive = sim.active > 0;
  // with no cars, still a frame every second: the clock (signals, the town) reads simT from it; while skipping, a frame every period
  if (!skipping && !alive && !wasAlive && !forcePost && city.calls % 10 !== 0) return;
  forcePost = false; wasAlive = alive;
  const buf = new Float32Array(sim.cap * 4); sim.writeFrame(buf);
  const stats: SimStats = { active: sim.active, target: sim.target, lanes: city.lanes, stepMs: sim.stats.stepMs, tickMs: city.tickMs, maxTickMs: city.maxTickMs, graphMs: city.graphMs, respawned: sim.stats.respawned, simT: sim.t, skipping: skipUntil > sim.t };
  post({ t: 'frame', cap: sim.cap, buf, stats }, [buf.buffer]);
}

scope.onmessage = (e: MessageEvent<ToSim>) => {
  const m = e.data;
  try {
    switch (m.t) {
      case 'net': netOps(m.ops); break;
      case 'terrain': terrainOps(m); break;
      case 'target': city.sim.setTarget(m.n); forcePost = true; break;
      case 'speed': speed = m.k; break;
      case 'skip': skipUntil = m.until; forcePost = true; break;
      case 'option': city.option(m.id); break;
      case 'townState': postTown(city.restore(m.lots, m.simT), true); break;
    }
  } catch (err) { fail(err); }
};

setInterval(() => { try { frame(); } catch (err) { fail(err); } }, FRAME_MS);
