// The main thread's side of the traffic simulation: it posts edits and settings to the sim worker, keeps the last two
// frames, and interpolates the cars between them so they move smoothly at 60 fps while the sim runs at 10 Hz.
import SimWorker from './sim.worker?worker&inline';
import type { NetOp } from '../ground-protocol';
import type { Drawable } from '../sprites';
import { facings } from '../traffic';
import type { FromSim, SimStats, ToSim } from './protocol';

/** frames arrive this often, ms: a car is drawn between the last two frames over that time */
const FRAME_MS = 100;
/** a car that moved this far (tiles) between two frames was respawned or re-planned: drawn at its new place, not lerped */
const JUMP = 3;
const EMPTY: SimStats = { active: 0, target: 0, lanes: 0, stepMs: 0, tickMs: 0, maxTickMs: 0, graphMs: 0, respawned: 0, simT: 0 };

/** The cars of the sim worker, as typed arrays indexed by slot (n = the sim's slot count, 0 before the first frame). */
export class SimClient {
  private worker: Worker;
  /** the desired vehicle count (the sim clamps it to its slots) */
  target = 0;
  /** the stats of the last frame received */
  stats: SimStats = { ...EMPTY };
  n = 0;
  alive = new Uint8Array(0); px = new Float32Array(0); py = new Float32Array(0);
  /** 4-facing index of the heading: 0 +x, 1 +y, 2 -x, 3 -y */
  head = new Uint8Array(0); kind = new Uint8Array(0); brake = new Uint8Array(0); tunnel = new Uint8Array(0);
  private prev: Float32Array | null = null; private cur: Float32Array | null = null; private tCur = 0;
  private pool: Drawable[] = [];

  /** starts the sim worker on a copy of the network described by ops */
  constructor(ops: NetOp[]) {
    this.worker = new SimWorker();
    this.worker.onmessage = (e: MessageEvent<FromSim>) => this.onMessage(e.data);
    this.post({ t: 'net', ops });
  }
  private post(m: ToSim) { this.worker.postMessage(m); }
  /** replaces the worker's network (the same ops the ground workers get) */
  netOps(ops: NetOp[]) { if (ops.length) this.post({ t: 'net', ops }); }
  /** sets the number of cars the sim keeps on the network */
  setTarget(n: number) { this.target = n; this.post({ t: 'target', n }); }
  /** the sim speed: 0 pauses, 1 is real time, 2, 4 and 8 are faster */
  setSpeed(k: number) { this.post({ t: 'speed', k }); }
  terminate() { this.worker.terminate(); }

  private onMessage(m: FromSim) {
    if (m.t === 'log') { console.log('[sim]', m.message); return; }
    if (m.t === 'error') { console.error('[sim]', m.message); return; }
    this.stats = m.stats;
    if (m.cap !== this.n) this.resize(m.cap);
    this.prev = this.cur; this.cur = m.buf; this.tCur = performance.now();
  }
  private resize(cap: number) {
    this.n = cap; this.prev = null;
    this.alive = new Uint8Array(cap); this.px = new Float32Array(cap); this.py = new Float32Array(cap);
    this.head = new Uint8Array(cap); this.kind = new Uint8Array(cap); this.brake = new Uint8Array(cap); this.tunnel = new Uint8Array(cap);
  }

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
      this.kind[i] = flags >> 4; this.brake[i] = (flags >> 1) & 1; this.tunnel[i] = (flags >> 2) & 1;
    }
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
