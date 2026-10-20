// Townspeople walking the sidewalks: pure TS, no DOM. The roads give sidewalk lines (each side of a road's centreline, at the
// kerb plus half the sidewalk, trimmed clear of the junctions); walkers stroll along them at about 1.4 m/s, stop now and then,
// cross to the nearest other sidewalk end at a junction or turn back at a dead end. Seeded (mulberry), allocation-free per step.
// The engine draws each walker from its facing (8 screen directions, from the velocity) and its walk frame (from the distance).
import { mulberry } from '../../iso';

type Pt = { x: number; y: number };
/** a road as the walkers see it: its centreline (tiles), the half width to the kerb and the sidewalk width (tiles) */
export interface WalkRoad { pts: Pt[]; h: number; walk: number; closed: boolean }
/** a sidewalk line: x, y pairs (tiles), the distance along it at each point (tiles), its length, and a spawn weight */
export interface Sidewalk { xy: Float64Array; cum: Float64Array; len: number; w: number }

/** 1.4 m/s in tiles per second (2 m per tile) */
export const WALK_SPEED = 0.7;
/** a sidewalk end links to the other ends at most this far away (tiles): round the corner, over the side road, or across the street */
export const CROSS = 7;
/** the walk cycle: metres per walk frame (1.4 m/s at 8 frames per second) */
export const STRIDE_M = 0.175;
/** screen facings in the people sheets' order */
export const FACINGS = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'] as const;

/** an open polyline offset by d to the left of its direction (tiles), mitred, the mitre capped at 2d */
function offset(pts: Pt[], d: number, closed: boolean): Pt[] {
  const n = pts.length, out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[i], c = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    let ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
    const lu = Math.hypot(ux, uy) || 1, lv = Math.hypot(vx, vy) || 1; ux /= lu; uy /= lu; vx /= lv; vy /= lv;
    if (i === 0 && !closed) { ux = vx; uy = vy; } if (i === n - 1 && !closed) { vx = ux; vy = uy; }
    let nx = -(uy + vy), ny = ux + vx; const ln = Math.hypot(nx, ny);
    if (ln < 1e-6) { nx = -uy; ny = ux; } else { nx /= ln; ny /= ln; }
    const cos = nx * -uy + ny * ux, k = Math.min(2, 1 / Math.max(0.5, cos));
    out.push({ x: b.x + nx * d * k, y: b.y + ny * d * k });
  }
  if (closed) out.push({ ...out[0] });
  return out;
}
/** a sidewalk from a polyline, cut back by t0 at its start and t1 at its end; null when nothing is left */
function line(pts: Pt[], t0: number, t1: number, w: number): Sidewalk | null {
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const L = cum[cum.length - 1], a = t0, b = L - t1;
  if (b - a < 1) return null;
  const xy: number[] = [], cs: number[] = [], at = (s: number) => { let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const f = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1); return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f }; };
  const p0 = at(a); xy.push(p0.x, p0.y); cs.push(0);
  for (let i = 1; i < cum.length - 1; i++) if (cum[i] > a && cum[i] < b) { xy.push(pts[i].x, pts[i].y); cs.push(cum[i] - a); }
  const p1 = at(b); xy.push(p1.x, p1.y); cs.push(b - a);
  return { xy: Float64Array.from(xy), cum: Float64Array.from(cs), len: b - a, w: w * (b - a) };
}
/** The sidewalk lines of a set of roads: both sides of each road with a sidewalk or verge (walk > 0.3 tiles), at the kerb plus
 *  half the sidewalk; an open road's lines are cut back by that offset plus half a tile at each end, clear of the junction.
 *  `weight` scales a road's share of the walkers (per tile of sidewalk; the default 1). */
export function sidewalks(roads: WalkRoad[], weight?: (r: WalkRoad) => number): Sidewalk[] {
  const out: Sidewalk[] = [];
  for (const r of roads) {
    if (r.walk <= 0.3 || r.pts.length < 2) continue;
    const d = r.h + r.walk / 2, cut = r.closed ? 0 : d + 0.5, w = weight ? weight(r) : 1;
    for (const side of [1, -1]) { const s = line(offset(r.pts, side * d, r.closed), cut, cut, w); if (s) out.push(s); }
  }
  return out;
}

/** the grid key of a point's CROSS-tile cell */
const cell = (x: number, y: number) => (Math.floor(x / CROSS) + 32768) * 65536 + Math.floor(y / CROSS) + 32768;

/** the screen facing (0-7 in FACINGS order) of a move (dx, dy) in tiles: the iso projection puts +x right-down, +y left-down */
export function facing(dx: number, dy: number): number {
  const sx = dx - dy, sy = (dx + dy) / 2, deg = (Math.atan2(sy, sx) * 180) / Math.PI;
  return ((Math.round((deg - 90) / 45) % 8) + 8) % 8;
}
/** a facing as a stored sheet row (S, SE, E, NE, N) and whether to mirror it (the west side is the east mirrored) */
export const FACING_ROW: readonly [number, boolean][] = [[0, false], [1, true], [2, true], [3, true], [4, false], [3, false], [2, false], [1, false]];

/** one walker in view (inBox): position (tiles), facing (0-7), walk frame (0 idle, 1-4), the person index */
export interface WalkerView { x: number; y: number; face: number; frame: number; person: number }

/** The walkers. Arrays sized to `cap`; populate() sets how many walk, step() moves them, inBox() reads them out. */
export class Pedestrians {
  /** walkers alive */
  n = 0;
  private side: Sidewalk[] = [];
  private ends: number[] = [];   // per sidewalk end (2i start, 2i+1 end): x, y in a flat array
  private r: () => number;
  private readonly cand = new Int32Array(8);
  /** the sidewalk ends by CROSS-tile cell (key cx * 65536 + cy, cells offset by 32768) */
  private grid = new Map<number, number[]>();
  private readonly sw: Int32Array; private readonly s: Float64Array; private readonly dir: Int8Array; private readonly spd: Float32Array;
  private readonly lat: Float32Array; private readonly dist: Float32Array; private readonly pause: Float32Array; private readonly who: Uint16Array;
  /** a crossing in progress: from (x0, y0) to (x1, y1), t in tiles walked of len; then sidewalk tgt from end tend */
  private readonly cx: Float32Array; private readonly ct: Float32Array; private readonly tgt: Int32Array; private readonly tend: Int8Array;
  readonly x: Float32Array; readonly y: Float32Array; readonly face: Uint8Array;

  constructor(seed: number, readonly people: number, readonly cap = 4096) {
    this.r = mulberry(seed >>> 0);
    this.sw = new Int32Array(cap); this.s = new Float64Array(cap); this.dir = new Int8Array(cap); this.spd = new Float32Array(cap);
    this.lat = new Float32Array(cap); this.dist = new Float32Array(cap); this.pause = new Float32Array(cap); this.who = new Uint16Array(cap);
    this.cx = new Float32Array(cap * 4); this.ct = new Float32Array(cap * 2); this.tgt = new Int32Array(cap); this.tend = new Int8Array(cap);
    this.x = new Float32Array(cap); this.y = new Float32Array(cap); this.face = new Uint8Array(cap);
  }
  get sidewalkCount() { return this.side.length; }

  /** take a new set of sidewalks (after a road edit): every walker is placed again, so none is left on a removed road */
  setSidewalks(list: Sidewalk[]) {
    this.side = list; this.ends = [];
    for (const w of list) { const k = w.xy.length; this.ends.push(w.xy[0], w.xy[1], w.xy[k - 2], w.xy[k - 1]); }
    this.grid.clear();
    for (let e = 0; e < this.ends.length / 2; e++) { const key = cell(this.ends[2 * e], this.ends[2 * e + 1]); let l = this.grid.get(key); if (!l) this.grid.set(key, (l = [])); l.push(e); }
    const n = this.n; this.n = 0; this.populate(n);
  }
  /** grow or shrink to n walkers (capped); new ones start at seeded points, the sidewalks weighted by their spawn weight */
  populate(n: number) {
    n = Math.max(0, Math.min(this.cap, Math.floor(n)));
    if (!this.side.length) { this.n = 0; return; }
    let total = 0; for (const w of this.side) total += w.w;
    for (let i = this.n; i < n; i++) {
      let pick = this.r() * total, k = 0; while (k < this.side.length - 1 && pick > this.side[k].w) { pick -= this.side[k].w; k++; }
      const w = this.side[k];
      this.sw[i] = k; this.s[i] = this.r() * w.len; this.dir[i] = this.r() < 0.5 ? 1 : -1; this.spd[i] = WALK_SPEED * (0.8 + 0.4 * this.r());
      this.lat[i] = (this.r() - 0.5) * 0.5; this.dist[i] = this.r() * 10; this.pause[i] = this.r() < 0.1 ? this.r() * 4 : 0;
      this.who[i] = Math.floor(this.r() * this.people); this.tgt[i] = -1;
      this.place(i, 0, 0);
    }
    this.n = n;
  }
  /** the position of walker i on its sidewalk (with its lateral offset), and its facing from the move (mx, my) */
  private place(i: number, mx: number, my: number) {
    const w = this.side[this.sw[i]], s = Math.max(0, Math.min(w.len, this.s[i])), c = w.cum, xy = w.xy;
    let k = 1; while (k < c.length - 1 && c[k] < s) k++;
    const f = (s - c[k - 1]) / ((c[k] - c[k - 1]) || 1), ux = xy[2 * k] - xy[2 * k - 2], uy = xy[2 * k + 1] - xy[2 * k - 1], lu = Math.hypot(ux, uy) || 1;
    const nx = this.x[i], ny = this.y[i];
    this.x[i] = xy[2 * k - 2] + ux * f - (uy / lu) * this.lat[i]; this.y[i] = xy[2 * k - 1] + uy * f + (ux / lu) * this.lat[i];
    if (mx || my) this.face[i] = facing(this.x[i] - nx, this.y[i] - ny);
    else this.face[i] = facing(ux * this.dir[i], uy * this.dir[i]);
  }
  /** at a sidewalk end: half the time the nearest other end (round the corner), else any end within CROSS tiles (a crossing);
   *  -1 when none is in reach */
  private link(k: number, end: number): number {
    const ex = this.ends[(2 * k + end) * 2], ey = this.ends[(2 * k + end) * 2 + 1], c = this.cand;
    let best = -1, bd = CROSS * CROSS, m = 0;
    const gx = Math.floor(ex / CROSS), gy = Math.floor(ey / CROSS);
    for (let jy = gy - 1; jy <= gy + 1; jy++) for (let jx = gx - 1; jx <= gx + 1; jx++) for (const e of this.grid.get((jx + 32768) * 65536 + jy + 32768) ?? []) {
      if (e >> 1 === k) continue;
      const dx = this.ends[2 * e] - ex, dy = this.ends[2 * e + 1] - ey, d = dx * dx + dy * dy;
      if (d >= CROSS * CROSS) continue;
      if (d < bd) { bd = d; best = e; }
      if (m < c.length) c[m++] = e;
    }
    return best < 0 || this.r() < 0.5 ? best : c[Math.floor(this.r() * m)];
  }
  /** advance every walker by dt seconds */
  step(dt: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.pause[i] > 0) { this.pause[i] -= dt; continue; }
      const v = this.spd[i] * dt;
      this.dist[i] += v * 2;
      if (this.tgt[i] >= 0) {
        // crossing: a straight walk from one sidewalk end to the next
        const o = i * 4, len = this.ct[2 * i + 1]; this.ct[2 * i] += v;
        const t = Math.min(1, this.ct[2 * i] / (len || 1)), px = this.x[i], py = this.y[i];
        this.x[i] = this.cx[o] + (this.cx[o + 2] - this.cx[o]) * t; this.y[i] = this.cx[o + 1] + (this.cx[o + 3] - this.cx[o + 1]) * t;
        this.face[i] = facing(this.x[i] - px, this.y[i] - py);
        if (t >= 1) { const k = this.tgt[i], w = this.side[k]; this.sw[i] = k; this.dir[i] = this.tend[i] ? -1 : 1; this.s[i] = this.tend[i] ? w.len : 0; this.tgt[i] = -1; }
        continue;
      }
      const w = this.side[this.sw[i]];
      this.s[i] += v * this.dir[i];
      if (this.s[i] <= 0 || this.s[i] >= w.len) {
        const end = this.s[i] >= w.len ? 1 : 0, e = this.link(this.sw[i], end);
        this.s[i] = end ? w.len : 0;
        if (e < 0) { this.dir[i] = end ? -1 : 1; this.pause[i] = 0.5 + this.r() * 2; this.place(i, 0, 0); continue; }
        const o = i * 4; this.cx[o] = this.x[i]; this.cx[o + 1] = this.y[i]; this.cx[o + 2] = this.ends[2 * e]; this.cx[o + 3] = this.ends[2 * e + 1];
        this.ct[2 * i] = 0; this.ct[2 * i + 1] = Math.hypot(this.cx[o + 2] - this.cx[o], this.cx[o + 3] - this.cx[o + 1]);
        this.tgt[i] = e >> 1; this.tend[i] = e & 1;
        continue;
      }
      this.place(i, v * this.dir[i], 1);
      if (this.r() < dt * 0.02) this.pause[i] = 1 + this.r() * 3;   // now and then someone stops for a few seconds
    }
  }
  /** the walk frame of walker i: 0 standing, else 1-4 by the metres walked */
  frame(i: number) { return this.pause[i] > 0 ? 0 : 1 + (Math.floor(this.dist[i] / STRIDE_M) & 3); }
  /** the walkers inside a tile box, written into out (reused objects, grown as needed); returns how many */
  inBox(x0: number, y0: number, x1: number, y1: number, out: WalkerView[]): number {
    let m = 0;
    for (let i = 0; i < this.n; i++) {
      const x = this.x[i], y = this.y[i]; if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const o = out[m] ?? (out[m] = { x: 0, y: 0, face: 0, frame: 0, person: 0 });
      o.x = x; o.y = y; o.face = this.face[i]; o.frame = this.frame(i); o.person = this.who[i]; m++;
    }
    return m;
  }
}
