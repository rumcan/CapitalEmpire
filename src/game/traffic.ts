/** Phase-0 test traffic: cars that drive the network at a steady speed in their lane and pick a random way at every
 *  junction (no car following yet; the real simulation comes in Phase 2). It exists to load the renderer the way
 *  thousands of moving cars will. Positions are kept in typed arrays; drawables are filled in only for cars on screen. */
import { mulberry } from './iso';
import { LIBRARY } from './library';
import type { RoadNetwork, Seg } from './network';
import type { Drawable } from './sprites';

const byId = (id: string) => LIBRARY.findIndex(i => i.id === id);
/** per car type and heading (+x, +y, -x, -y): sprite, flip, and the footprint around the lane point */
interface Facing { item: number; flip: boolean; ox: number; oy: number; hx: number; hy: number }
let FACINGS: Facing[][] = [];
function facings() {
  if (FACINGS.length) return FACINGS;
  const c = { e: byId('static:compact_e'), s: byId('static:compact_s'), w: byId('static:compact_w'), n: byId('static:compact_n'), van: byId('static:van_e'), vanB: byId('static:van_e-v2'), pick: byId('static:pickup_n'), pickB: byId('static:pickup_n-v2'), nb: byId('static:compact_n-v2') };
  const sets: [number, boolean][][] = [[[c.e, false], [c.s, false], [c.w, false], [c.n, false]]];
  if (c.van >= 0) sets.push([[c.van, false], [c.van, true], [c.w, false], [c.nb >= 0 ? c.nb : c.n, false]]);
  if (c.vanB >= 0) sets.push([[c.vanB, false], [c.vanB, true], [c.w, false], [c.n, false]]);
  if (c.pick >= 0) sets.push([[c.e, false], [c.s, false], [c.pick, true], [c.pick, false]]);
  if (c.pickB >= 0) sets.push([[c.e, false], [c.s, false], [c.pickB, true], [c.pickB, false]]);
  FACINGS = sets.map(set => set.map(([item, flip]) => {
    const b = LIBRARY[item].boxes[0];
    return { item, flip, ox: (flip ? b.dy : b.dx) / 2, oy: (flip ? b.dx : b.dy) / 2, hx: (flip ? b.hy : b.hx) / 2, hy: (flip ? b.hx : b.hy) / 2 };
  }));
  return FACINGS;
}
export const CAR_COLOURS = [[0.95, 0.85, 0.55], [0.9, 0.45, 0.35], [0.6, 0.8, 0.95], [0.85, 0.85, 0.85], [0.7, 0.9, 0.6]];
/** segment geometry cached on the segment object */
type SegG = Seg & { _len?: number; _ux?: number; _uy?: number };
const geo = (s: SegG) => { if (s._len === undefined) { const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, L = Math.hypot(dx, dy); s._len = L; s._ux = dx / L; s._uy = dy / L; } return s as Required<SegG>; };

export class TestTraffic {
  seg: Seg[] = []; t: Float32Array; fwd: Uint8Array; speed: Float32Array; kind: Uint8Array;
  /** lane position (tiles) and heading index per car, refreshed every step */
  px: Float32Array; py: Float32Array; head: Uint8Array;
  private pool: Drawable[] = [];
  private rnd = mulberry(1234);
  constructor(public net: RoadNetwork, public n: number) {
    this.t = new Float32Array(n); this.fwd = new Uint8Array(n); this.speed = new Float32Array(n); this.kind = new Uint8Array(n);
    this.px = new Float32Array(n); this.py = new Float32Array(n); this.head = new Uint8Array(n);
    const segs = [...net.segs]; if (!segs.length) { this.n = 0; return; }
    const cum: number[] = []; let acc = 0; for (const s of segs) { acc += geo(s)._len; cum.push(acc); }
    const F = facings();
    for (let i = 0; i < n; i++) {
      const v = this.rnd() * acc; let lo = 0, hi = cum.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < v) lo = m + 1; else hi = m; }
      const s = segs[lo]; this.seg.push(s);
      this.t[i] = this.rnd() * geo(s)._len; this.fwd[i] = this.rnd() < 0.5 ? 1 : 0;
      this.speed[i] = 4 + this.rnd() * 3.5; this.kind[i] = (this.rnd() * F.length) | 0;
    }
  }
  /** advance dt seconds */
  step(dt: number) {
    const segs = this.net.segs;
    for (let i = 0; i < this.n; i++) {
      let s = this.seg[i] as SegG; if (!segs.has(s)) s = this.respawn(i);
      let g = geo(s);
      this.t[i] += this.speed[i] * dt;
      for (let guard = 0; this.t[i] > g._len && guard < 4; guard++) {
        this.t[i] -= g._len;
        const at = this.fwd[i] ? s.b : s.a, k = at.segs.length;
        let next = s;
        if (k > 1) { let r = (this.rnd() * (k - 1)) | 0; for (const q of at.segs) { if (q === s) continue; if (r-- === 0) { next = q; break; } } }
        this.fwd[i] = next === s ? (at === s.a ? 1 : 0) : next.a === at ? 1 : 0;
        s = next; this.seg[i] = s; g = geo(s);
      }
      const dx = this.fwd[i] ? g._ux : -g._ux, dy = this.fwd[i] ? g._uy : -g._uy;
      const along = this.fwd[i] ? this.t[i] : g._len - this.t[i], lc = s.cls.laneCentres, lane = lc[lc.length - 1 - (i & (lc.length > 1 ? 1 : 0))];
      // right-hand traffic: the lane is on the driver's right, which is perp(dir) in tile space
      this.px[i] = s.a.x + g._ux * along - dy * lane; this.py[i] = s.a.y + g._uy * along + dx * lane;
      this.head[i] = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 0 : 2) : (dy > 0 ? 1 : 3);
    }
  }
  /** drawables for the cars inside a tile box (reused objects) */
  visible(x0: number, y0: number, x1: number, y1: number): Drawable[] {
    const F = facings(), out: Drawable[] = []; let k = 0;
    for (let i = 0; i < this.n; i++) {
      const x = this.px[i], y = this.py[i]; if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const f = F[this.kind[i]][this.head[i]];
      let d = this.pool[k]; if (!d) this.pool.push((d = { item: 0, x: 0, y: 0, flip: false, scale: 1, x0: 0, y0: 0, x1: 0, y1: 0 }));
      d.item = f.item; d.flip = f.flip; d.x = x - f.ox; d.y = y - f.oy; d.x0 = x - f.hx; d.x1 = x + f.hx; d.y0 = y - f.hy; d.y1 = y + f.hy;
      out.push(d); k++;
    }
    return out;
  }
  private respawn(i: number) { const segs = [...this.net.segs]; const s = segs[(this.rnd() * segs.length) | 0]; this.seg[i] = s; this.t[i] = 0; return s; }
}
