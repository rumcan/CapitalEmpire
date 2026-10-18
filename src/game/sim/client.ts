// The main thread's side of the traffic simulation: it posts edits and settings to the sim worker, keeps the last two
// frames, and interpolates the cars between them so they move smoothly at 60 fps while the sim runs at 10 Hz.
import SimWorker from './sim.worker?worker&inline';
import type { NetOp } from '../ground-protocol';
import type { Drawable } from '../sprites';
import { facings } from '../traffic';
import { worldX, worldY } from '../iso';
import { zoneOf } from './routing';
import { POINT_STRIDE } from '../gl';
import type { FromSim, LotRec, SimStats, ToSim } from './protocol';
import { LV, type LotTuple, type TownEvent } from '../lots/town';
import type { Leg } from '../network';
import { VTYPES } from './sim';

/** frames arrive this often, ms: a car is drawn between the last two frames over that time */
const FRAME_MS = 100;
/** a car that moved this far (tiles) between two frames was respawned or re-planned: drawn at its new place, not lerped */
const JUMP = 3;
const EMPTY: SimStats = { active: 0, target: 0, lanes: 0, stepMs: 0, tickMs: 0, maxTickMs: 0, graphMs: 0, respawned: 0, simT: 0 };
/** half a car's length per vehicle type, tiles (the lights sit at its front and rear) */
const HALF = VTYPES.map(v => v.len / 4);

/** a parcel as the worker sent it, with the town's use, level, decline, the lot's seed and the sim s of its last change (0, 0, 0, 0, 0 = EMPTY) */
export interface LotView extends LotRec { use: number; level: number; decline: number; seed: number; since: number }

/** point counts of SimClient.lights: the lamps (small points, written first) and the beam glows */
export interface LightCounts { small: number; beams: number }

/** writes one light point at tile (tx, ty) as world px + rgba into out at k; returns the next index */
function put(out: Float32Array, k: number, tx: number, ty: number, r: number, g: number, b: number, a: number): number {
  out[k] = worldX(tx, ty); out[k + 1] = worldY(tx, ty); out[k + 2] = r; out[k + 3] = g; out[k + 4] = b; out[k + 5] = a;
  return k + POINT_STRIDE;
}

/** The city worker's side: the cars of the sim, as typed arrays indexed by slot (n = the sim's slot count, 0 before the first frame), the parcels and the town. */
export class SimClient {
  private worker: Worker;
  /** the parcels by key (geometry and the town's state) */
  lots = new Map<string, LotView>();
  /** the town's residents, jobs and built lots (from the last town message) and the growth option id */
  pop = 0; jobs = 0; built = 0; option = 'balanced';
  /** the access per zone (256, 1 = free flow) from the last town message, and the zones with a built lot (1) */
  access: Float32Array = new Float32Array(256).fill(1); builtZone = new Uint8Array(256);
  /** called with the events of each town message (after the lots are updated) */
  onTown?: (events: TownEvent[]) => void;
  /** called with the gravel extension the town plans (the engine builds it, or skips it); the worker waits for its net ops */
  onGrow?: (legs: Leg[]) => void;
  /** the desired vehicle count (the sim clamps it to its slots) */
  target = 0;
  /** the stats of the last frame received */
  stats: SimStats = { ...EMPTY };
  n = 0;
  alive = new Uint8Array(0); px = new Float32Array(0); py = new Float32Array(0);
  /** 4-facing index of the heading: 0 +x, 1 +y, 2 -x, 3 -y */
  head = new Uint8Array(0); kind = new Uint8Array(0); brake = new Uint8Array(0); tunnel = new Uint8Array(0);
  /** the current frame's heading per slot, radians; the turn signal per slot: 0 none, 1 left, 2 right */
  ang = new Float32Array(0); sig = new Uint8Array(0);
  private prev: Float32Array | null = null; private cur: Float32Array | null = null; private tCur = 0;
  private lc: LightCounts = { small: 0, beams: 0 };
  /** the sim speed last set (sim seconds per second) */
  private speed = 1;
  private pool: Drawable[] = [];

  /** starts the city worker, empty: the terrain and the network follow (terrain, then netOps) */
  constructor() {
    this.worker = new SimWorker();
    this.worker.onmessage = (e: MessageEvent<FromSim>) => this.onMessage(e.data);
  }
  private post(m: ToSim) { this.worker.postMessage(m); }
  /** replaces the worker's network (the same ops the ground workers get) */
  netOps(ops: NetOp[]) { if (ops.length) this.post({ t: 'net', ops }); }
  /** a new valley: its terrain classes (copied), the highway entry (tiles) and the seed; the town starts again. Send before the net ops. */
  terrain(cls: Uint8Array, entry: [number, number], seed: number) { this.post({ t: 'terrain', cls, entry, seed }); }
  /** the town's growth option by id (see GROWTH_OPTIONS) */
  setOption(id: string) { this.option = id; this.post({ t: 'option', id }); }
  /** a saved town for the worker (its lots and the sim clock, s): after the net ops of a load */
  townState(lots: LotTuple[], simT: number) { this.post({ t: 'townState', lots, simT }); }
  /** sets the number of cars the sim keeps on the network */
  setTarget(n: number) { this.target = n; this.post({ t: 'target', n }); }
  /** the sim speed: 0 pauses, 1 is real time, 2, 4 and 8 are faster */
  setSpeed(k: number) { this.speed = k; this.post({ t: 'speed', k }); }
  terminate() { this.worker.terminate(); }

  private onMessage(m: FromSim) {
    if (m.t === 'log') { console.log('[sim]', m.message); return; }
    if (m.t === 'error') { console.error('[sim]', m.message); return; }
    if (m.t === 'lots') { this.applyLots(m.added, m.removed); return; }
    if (m.t === 'grow') {
      const legs: Leg[] = [];
      for (let i = 0; i + 3 < m.legs.length; i += 4) legs.push({ a: { x: m.legs[i], y: m.legs[i + 1] }, b: { x: m.legs[i + 2], y: m.legs[i + 3] } });
      this.onGrow?.(legs); return;
    }
    if (m.t === 'town') {
      for (const e of m.events) { const v = this.lots.get(e.key); if (v) { v.use = e.use; v.level = e.level; v.decline = e.decline; v.seed = e.seed; v.since = e.since; } }
      this.pop = m.pop; this.jobs = m.jobs; this.built = m.built; this.access = m.access;
      this.builtZone.fill(0);
      for (const v of this.lots.values()) if (v.level >= LV.BUILT && v.use) this.builtZone[zoneOf(v.o[0] + v.u[0] * v.w / 2 + v.n[0] * v.d / 2, v.o[1] + v.u[1] * v.w / 2 + v.n[1] * v.d / 2)] = 1;
      this.onTown?.(m.events); return;
    }
    this.stats = m.stats;
    if (m.cap !== this.n) this.resize(m.cap);
    this.prev = this.cur; this.cur = m.buf; this.tCur = performance.now();
  }
  /** the parcels changed: the removed keys go, the added ones are set (a key re-added keeps its town state) */
  private applyLots(added: LotRec[], removed: string[]) {
    const keep = new Set<string>();
    for (const r of added) keep.add(r.key);
    for (const k of removed) if (!keep.has(k)) this.lots.delete(k);
    for (const r of added) { const old = this.lots.get(r.key); this.lots.set(r.key, { ...r, use: old?.use ?? 0, level: old?.level ?? 0, decline: old?.decline ?? 0, seed: old?.seed ?? 0, since: old?.since ?? 0 }); }
  }
  private resize(cap: number) {
    this.n = cap; this.prev = null;
    this.alive = new Uint8Array(cap); this.px = new Float32Array(cap); this.py = new Float32Array(cap);
    this.head = new Uint8Array(cap); this.kind = new Uint8Array(cap); this.brake = new Uint8Array(cap); this.tunnel = new Uint8Array(cap);
    this.ang = new Float32Array(cap); this.sig = new Uint8Array(cap);
  }

  /** the sim's time now, s: the time of the last frame, moved on at the sim speed since it arrived (0 before the first frame) */
  simTime(now: number): number { return this.cur ? this.stats.simT + Math.max(0, now - this.tCur) / 1000 * this.speed : 0; }

  /** unpacks the current frame into the arrays, lerping each car from its place in the previous frame (at now) */
  update(_now: number) {
    const cur = this.cur;
    if (!cur) return;
    // performance.now(), not the rAF time: a frame that arrived after the rAF timestamp would get a negative alpha
    const prev = this.prev, alpha = Math.min(1, Math.max(0, (performance.now() - this.tCur) / FRAME_MS));
    for (let i = 0; i < this.n; i++) {
      const k = 4 * i, flags = cur[k + 3] | 0;
      if (!(flags & 1)) { this.alive[i] = 0; continue; }
      this.alive[i] = 1;
      let x = cur[k], y = cur[k + 1];
      if (prev && (prev[k + 3] | 0) & 1) {
        const x0 = prev[k], y0 = prev[k + 1], dx = x - x0, dy = y - y0;
        if (dx * dx + dy * dy < JUMP * JUMP) { x = x0 + dx * alpha; y = y0 + dy * alpha; }
      }
      this.px[i] = x; this.py[i] = y;
      const a = cur[k + 2], dx = Math.cos(a), dy = Math.sin(a);
      this.head[i] = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 0 : 2) : (dy > 0 ? 1 : 3);
      this.kind[i] = flags >> 5; this.brake[i] = (flags >> 1) & 1; this.tunnel[i] = (flags >> 2) & 1;
      this.ang[i] = a; this.sig[i] = (flags >> 3) & 3;
    }
  }

  /** car light points for the cars in a tile box (night): the lamps (small, written first), then the beam glows.
   *  Writes POINT_STRIDE floats per point into out (world px, rgba; at most 7 points per car); returns the counts in
   *  points, in a reused object. blink: show the turn signals. _ze is unused (the sizes are the caller's). */
  lights(x0: number, y0: number, x1: number, y1: number, _ze: number, blink: boolean, out: Float32Array): LightCounts {
    let k = 0;
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i] || this.tunnel[i]) continue;
      const x = this.px[i], y = this.py[i]; if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const a = this.ang[i], hx = Math.cos(a), hy = Math.sin(a), rx = -hy, ry = hx, hl = HALF[this.kind[i] % HALF.length]!;
      const fx = x + hx * hl, fy = y + hy * hl, bx = x - hx * hl, by = y - hy * hl;
      k = put(out, k, fx + rx * 0.28, fy + ry * 0.28, 1, 0.93, 0.75, 0.9);
      k = put(out, k, fx - rx * 0.28, fy - ry * 0.28, 1, 0.93, 0.75, 0.9);
      const ta = this.brake[i] ? 1 : 0.55;
      k = put(out, k, bx + rx * 0.3, by + ry * 0.3, 1, 0.12, 0.08, ta);
      k = put(out, k, bx - rx * 0.3, by - ry * 0.3, 1, 0.12, 0.08, ta);
      const sg = this.sig[i];
      if (blink && sg) {
        const q = sg === 1 ? -0.36 : 0.36, cx = rx * q, cy = ry * q, fh = hl * 0.95;
        k = put(out, k, x + hx * fh + cx, y + hy * fh + cy, 1, 0.6, 0.1, 1);
        k = put(out, k, x - hx * fh + cx, y - hy * fh + cy, 1, 0.6, 0.1, 1);
      }
    }
    const small = k / POINT_STRIDE;
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i] || this.tunnel[i]) continue;
      const x = this.px[i], y = this.py[i]; if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const a = this.ang[i], hx = Math.cos(a), hy = Math.sin(a), hl = HALF[this.kind[i] % HALF.length]! + 1.6;
      k = put(out, k, x + hx * hl, y + hy * hl, 1, 0.93, 0.75, 0.28);
    }
    this.lc.small = small; this.lc.beams = k / POINT_STRIDE - small;
    return this.lc;
  }

  /** drawables for the cars inside a tile box (reused objects; tunnel cars are not drawn) */
  visible(x0: number, y0: number, x1: number, y1: number): Drawable[] {
    const F = facings(), out: Drawable[] = []; let k = 0;
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i] || this.tunnel[i]) continue;
      const x = this.px[i], y = this.py[i]; if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const f = F[this.kind[i] % F.length][this.head[i]];
      let d = this.pool[k]; if (!d) this.pool.push((d = { item: 0, x: 0, y: 0, flip: false, scale: 1, x0: 0, y0: 0, x1: 0, y1: 0 }));
      d.item = f.item; d.flip = f.flip; d.x = x - f.ox; d.y = y - f.oy; d.x0 = x - f.hx; d.x1 = x + f.hx; d.y0 = y - f.hy; d.y1 = y + f.hy;
      out.push(d); k++;
    }
    return out;
  }
}
