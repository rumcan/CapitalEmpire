/// <reference lib="webworker" />
// The traffic simulation worker: its own road network and lane graph, the Sim stepped every 100 ms, and the cars packed
// into a frame that is posted to the main thread (SimClient). Edits arrive as ops and are replayed here.
import type { NetOp } from '../ground-protocol';
import { RoadNetwork } from '../network';
import { applyOps } from '../netops';
import { LaneGraph } from './lanes';
import { Sim } from './sim';
import type { FromSim, SimStats, ToSim } from './protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const net = new RoadNetwork(); net.paintData = false; net.occRaster = null;
const g = new LaneGraph();
const sim = new Sim(g, 12000, 1);
/** wall-clock frame period, ms; the sim is stepped once per DT of its speed */
const FRAME_MS = 100, TICKS = 100;
let speed = 1, forcePost = false, wasAlive = false, graphMs = 0, lanes = 0, tick = 0;
/** the tick times of the last TICKS ticks (a ring) */
const ticks = new Float64Array(TICKS);
const post = (m: FromSim, transfer: Transferable[] = []) => scope.postMessage(m, transfer);
const fail = (err: unknown) => post({ t: 'error', message: (err as Error).stack || String(err) });

/** replays the ops; the lane graph is updated after every rebuild, so each part of the edit is measured on its own */
function netOps(ops: NetOp[]) {
  const t0 = performance.now();
  let part: NetOp[] = [];
  for (const op of ops) {
    part.push(op);
    if (op.k === 'rebuild') { applyOps(net, part); g.update(net); part = []; }
  }
  if (part.length) applyOps(net, part);
  sim.onGraph();
  graphMs = performance.now() - t0;
  lanes = 0; for (const ln of g.lanes) if (ln) lanes++;
  if (graphMs > 50) post({ t: 'log', message: `net ops ${ops.length} and graph in ${graphMs.toFixed(0)} ms` });
}

/** one wall-clock period: speed steps of the sim, then a frame unless there is nothing to show */
function frame() {
  const t0 = performance.now();
  for (let k = 0; k < speed; k++) sim.step();
  ticks[tick++ % TICKS] = performance.now() - t0;
  const alive = sim.active > 0;
  if (!alive && !wasAlive && !forcePost) return;
  forcePost = false; wasAlive = alive;
  let maxTickMs = 0; for (const v of ticks) if (v > maxTickMs) maxTickMs = v;
  const buf = new Float32Array(sim.cap * 4); sim.writeFrame(buf);
  const stats: SimStats = { active: sim.active, target: sim.target, lanes, stepMs: sim.stats.stepMs, tickMs: ticks[(tick - 1) % TICKS], maxTickMs, graphMs, respawned: sim.stats.respawned, simT: sim.t };
  post({ t: 'frame', cap: sim.cap, buf, stats }, [buf.buffer]);
}

scope.onmessage = (e: MessageEvent<ToSim>) => {
  const m = e.data;
  try {
    switch (m.t) {
      case 'net': netOps(m.ops); break;
      case 'target': sim.setTarget(m.n); forcePost = true; break;
      case 'speed': speed = m.k; break;
    }
  } catch (err) { fail(err); }
};

setInterval(() => { try { frame(); } catch (err) { fail(err); } }, FRAME_MS);
