/// <reference lib="webworker" />
// The city worker: its own road network and lane graph, the Sim stepped every 100 ms, and the cars packed into a frame that
// is posted to the main thread (SimClient). Edits arrive as ops and are replayed here. The parcels (LotMap) and the town
// (Town: land use and growth) follow the network here too, so the main thread never pays for them.
import type { NetOp } from '../ground-protocol';
import { RoadNetwork, type Node, type Pt, type Seg } from '../network';
import { applyOps } from '../netops';
import { MAP } from '../iso';
import { TC } from '../terrain/types';
import { LotMap, type Lot } from '../lots/lots';
import { GROWTH_OPTIONS, Town, type TownCtx, type TownEvent } from '../lots/town';
import { LaneGraph } from './lanes';
import { Sim } from './sim';
import type { FromSim, LotRec, SimStats, ToSim } from './protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const net = new RoadNetwork(); net.paintData = false; net.occRaster = null;
const g = new LaneGraph();
const sim = new Sim(g, 12000, 1);
/** wall-clock frame period, ms; the sim is stepped once per DT of its speed */
const FRAME_MS = 100, TICKS = 100;
/** the water distance field: 4-tile cells, distances capped at WATER_CAP tiles; the town posts its totals at least this often (sim s) */
const WATER_N = MAP >> 2, WATER_CAP = 200, TOWN_EVERY = 10;
let speed = 1, forcePost = false, wasAlive = false, graphMs = 0, lanes = 0, tick = 0;
/** the tick times of the last TICKS ticks (a ring) */
const ticks = new Float64Array(TICKS);
const post = (m: FromSim, transfer: Transferable[] = []) => scope.postMessage(m, transfer);
const fail = (err: unknown) => post({ t: 'error', message: (err as Error).stack || String(err) });

// the city: the parcels, the segs reachable from the highway entry, the town and what it needs from the terrain
const lots = new LotMap();
let reach = new Set<Seg>();
let cls: Uint8Array | null = null, water: Float32Array | null = null, optId = GROWTH_OPTIONS[0].id;
const ctx: TownCtx = { lots, entry: { x: 0, y: 0 }, reachable: (l: Lot) => reach.has(l.seg), water: waterAt };
let town = new Town(1), townPosted = 0;

/** the distance (tiles, capped) to the nearest WATER from a tile: 200 before the terrain arrives */
function waterAt(x: number, y: number): number {
  if (!water) return WATER_CAP;
  const cx = Math.min(WATER_N - 1, Math.max(0, Math.floor(x / 4))), cy = Math.min(WATER_N - 1, Math.max(0, Math.floor(y / 4)));
  return water[cy * WATER_N + cx];
}
/** the distance field to WATER on the 4-tile cells (a cell is wet if one of its tiles is): a two-pass chamfer, in tiles */
function waterField(terr: Uint8Array): Float32Array {
  const N = WATER_N, f = new Float32Array(N * N).fill(1e9), S = Math.SQRT2;
  for (let cy = 0; cy < N; cy++) for (let cx = 0; cx < N; cx++) {
    let wet = false;
    for (let j = 0; j < 4 && !wet; j++) for (let i = 0; i < 4; i++) if (terr[(cy * 4 + j) * MAP + cx * 4 + i] === TC.WATER) { wet = true; break; }
    if (wet) f[cy * N + cx] = 0;
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; let v = f[i];
    if (x > 0) v = Math.min(v, f[i - 1] + 1);
    if (y > 0) { v = Math.min(v, f[i - N] + 1); if (x > 0) v = Math.min(v, f[i - N - 1] + S); if (x < N - 1) v = Math.min(v, f[i - N + 1] + S); }
    f[i] = v;
  }
  for (let y = N - 1; y >= 0; y--) for (let x = N - 1; x >= 0; x--) {
    const i = y * N + x; let v = f[i];
    if (x < N - 1) v = Math.min(v, f[i + 1] + 1);
    if (y < N - 1) { v = Math.min(v, f[i + N] + 1); if (x < N - 1) v = Math.min(v, f[i + N + 1] + S); if (x > 0) v = Math.min(v, f[i + N - 1] + S); }
    f[i] = v;
  }
  for (let i = 0; i < f.length; i++) f[i] = Math.min(WATER_CAP, f[i] * 4);
  return f;
}
/** the segs reachable by road from the node nearest the entry (none for an empty network) */
function reachableFrom(entry: Pt): Set<Seg> {
  const out = new Set<Seg>(); let start: Node | null = null, best = Infinity;
  for (const n of net.nodes.values()) { const d = (n.x - entry.x) ** 2 + (n.y - entry.y) ** 2; if (d < best) { best = d; start = n; } }
  if (!start) return out;
  const seen = new Set<Node>([start]), q: Node[] = [start];
  for (let i = 0; i < q.length; i++) for (const s of q[i].segs) { out.add(s); const o = s.a === q[i] ? s.b : s.a; if (!seen.has(o)) { seen.add(o); q.push(o); } }
  return out;
}
const optionOf = (id: string) => GROWTH_OPTIONS.find(o => o.id === id) ?? GROWTH_OPTIONS[0];
const rec = (l: Lot): LotRec => ({ key: l.key, o: [l.o.x, l.o.y], u: [l.u.x, l.u.y], n: [l.n.x, l.n.y], w: l.w, d: l.d, cls: l.cls, corner: l.corner });

/** posts the town's events and totals: when forced, when there are events, or every TOWN_EVERY sim s */
function postTown(ev: TownEvent[], force: boolean) {
  if (!force && !ev.length && sim.t - townPosted < TOWN_EVERY) return;
  townPosted = sim.t;
  post({ t: 'town', events: ev.slice(), pop: town.pop, jobs: town.jobs, built: town.built });
}

/** a new valley: its terrain classes, the water field, the highway entry and the seed; the town starts again, at the sim time (no lots yet) */
function terrainOps(m: Extract<ToSim, { t: 'terrain' }>) {
  cls = m.cls; water = waterField(m.cls); ctx.entry = { x: m.entry[0], y: m.entry[1] };
  town = new Town(m.seed); town.option = optionOf(optId); town.tick(sim.t, ctx);
  postTown([], true);
}

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
  lotsOps();
}

/** after a network batch: the parcels that changed, the reachable segs, the town's lots; posts the changes */
function lotsOps() {
  const t0 = performance.now();
  const { added, removed } = lots.update(net, cls);
  reach = reachableFrom(ctx.entry);
  const ev = town.onLots(added, removed);
  if (added.length || removed.length) post({ t: 'lots', added: added.map(rec), removed });
  postTown(ev, true);
  const ms = performance.now() - t0;
  if (ms > 50) post({ t: 'log', message: `lots ${added.length} added, ${removed.length} removed in ${ms.toFixed(0)} ms` });
}

/** one wall-clock period: speed steps of the sim, the town to the sim time, then a frame unless there is nothing to show */
function frame() {
  const t0 = performance.now();
  for (let k = 0; k < speed; k++) sim.step();
  ticks[tick++ % TICKS] = performance.now() - t0;
  postTown(town.tick(sim.t, ctx), false);
  const alive = sim.active > 0;
  // with no cars, still a frame every second: the clock (signals, the town) reads simT from it
  if (!alive && !wasAlive && !forcePost && tick % 10 !== 0) return;
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
      case 'terrain': terrainOps(m); break;
      case 'target': sim.setTarget(m.n); forcePost = true; break;
      case 'speed': speed = m.k; break;
      case 'option': optId = m.id; town.option = optionOf(m.id); break;
    }
  } catch (err) { fail(err); }
};

setInterval(() => { try { frame(); } catch (err) { fail(err); } }, FRAME_MS);
