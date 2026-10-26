// A software 2D raster for the ground painter's chunk tests (T139's cart path bevel, T140's kerb face): a recording Path2D (installed as the
// global Path2D, so the network's features keep their outlines), exact coverage tests for a feature's stroke or fill, and a 2D context over
// a chunk-sized buffer that makes the calls cart-bevel.ts and kerb-face.ts make. Each pixel holds its alpha and one colour channel (the red,
// premultiplied), composited with Porter-Duff at the pixel's centre; drawImage is bilinear. Headless: no DOM, no canvas.
import assert from 'node:assert/strict';
import { CHUNK_H, CHUNK_W, HH, HW, tileOf } from '../../src/game/iso';
import type { Affine, BevelCtx } from '../../src/game/cart-bevel';
import type { BBox, Feature } from '../../src/game/network';

const TAU = Math.PI * 2;
/** a Path2D that keeps its outline, each subpath flattened to points (arcs in short chords), for the raster below */
export class RecPath {
  subs: { pts: number[]; closed: boolean }[] = [];
  private cur: { pts: number[]; closed: boolean } | null = null;
  moveTo(x: number, y: number) { this.cur = { pts: [x, y], closed: false }; this.subs.push(this.cur); }
  lineTo(x: number, y: number) { if (!this.cur) this.moveTo(x, y); else this.cur.pts.push(x, y); }
  closePath() { if (!this.cur) return; this.cur.closed = true; const [x, y] = this.cur.pts as [number, number]; this.moveTo(x, y); }
  rect(x: number, y: number, w: number, h: number) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath(); }
  arc(cx: number, cy: number, r: number, a0: number, a1: number, ccw = false) {
    const raw = ccw ? a0 - a1 : a1 - a0, sweep = raw >= TAU ? TAU : ((raw % TAU) + TAU) % TAU, n = Math.max(2, Math.ceil(sweep / (TAU / 256)));
    for (let i = 0; i <= n; i++) { const a = a0 + (ccw ? -1 : 1) * (sweep * i) / n; this.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); }
  }
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number) {
    if (!this.cur) { this.moveTo(x1, y1); return; }
    const k = this.cur.pts.length, x0 = this.cur.pts[k - 2]!, y0 = this.cur.pts[k - 1]!;
    const ax = x0 - x1, ay = y0 - y1, bx = x2 - x1, by = y2 - y1, la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (r <= 0 || la < 1e-12 || lb < 1e-12 || Math.abs(ax * by - ay * bx) < 1e-12 * la * lb) { this.lineTo(x1, y1); return; }
    const ux = ax / la, uy = ay / la, vx = bx / lb, vy = by / lb, th = Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy))), t = r / Math.tan(th / 2);
    const mx = ux + vx, my = uy + vy, ml = Math.hypot(mx, my), dc = r / Math.sin(th / 2), cx = x1 + (mx / ml) * dc, cy = y1 + (my / ml) * dc;
    const a0 = Math.atan2(y1 + uy * t - cy, x1 + ux * t - cx), a1 = Math.atan2(y1 + vy * t - cy, x1 + vx * t - cx);
    let d = a1 - a0; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
    this.arc(cx, cy, r, a0, a1, d < 0);
  }
}
// the network builds its features' outlines in Path2D: here they keep their points
(globalThis as unknown as { Path2D: unknown }).Path2D = RecPath;
const subsOf = (p: Path2D) => (p as unknown as RecPath).subs.filter(s => s.pts.length >= 4);

/** whether a stroke of width w (round joins, butt or round caps) along the subpaths covers (x, y) */
export function strokeCovers(p: Path2D, w: number, cap: CanvasLineCap, x: number, y: number) {
  const r2 = (w / 2) ** 2;
  for (const { pts, closed } of subsOf(p)) {
    const n = pts.length / 2, segs = closed ? n : n - 1;
    for (let k = 0; k < segs; k++) {
      const ax = pts[2 * k]!, ay = pts[2 * k + 1]!, bx = pts[(2 * (k + 1)) % (2 * n)]!, by = pts[(2 * (k + 1) + 1) % (2 * n)]!, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      if (L2 < 1e-18) continue;
      const t = ((x - ax) * dx + (y - ay) * dy) / L2;
      if (t >= 0 && t <= 1 && (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2 <= r2) return true;
    }
    for (let k = 0; k < n; k++) if ((closed || cap === 'round' || (k > 0 && k < n - 1)) && (x - pts[2 * k]!) ** 2 + (y - pts[2 * k + 1]!) ** 2 <= r2) return true;
  }
  return false;
}
/** whether the filled subpaths (each closed, the nonzero rule) cover (x, y) */
export function fillCovers(p: Path2D, x: number, y: number) {
  let wind = 0;
  for (const { pts } of subsOf(p)) {
    const n = pts.length / 2;
    for (let k = 0; k < n; k++) {
      const ax = pts[2 * k]!, ay = pts[2 * k + 1]!, bx = pts[(2 * k + 2) % (2 * n)]!, by = pts[(2 * k + 3) % (2 * n)]!;
      if (ay <= y) { if (by > y && (bx - ax) * (y - ay) - (x - ax) * (by - ay) > 0) wind++; } else if (by <= y && (bx - ax) * (y - ay) - (x - ax) * (by - ay) < 0) wind--;
    }
  }
  return wind !== 0;
}
/** a feature's outline box in tiles (its points, widened by half its stroke) */
export function boxOf(f: Feature): BBox {
  const pts = subsOf(f.path).flatMap(s => s.pts), r = f.kind === 'stroke' ? f.w / 2 : 0, xs = pts.filter((_, i) => i % 2 === 0), ys = pts.filter((_, i) => i % 2 === 1);
  return [Math.min(...xs) - r, Math.min(...ys) - r, Math.max(...xs) + r, Math.max(...ys) + r];
}
/** the surface: whether any of the features covers tile point (x, y) */
export const covers = (feats: readonly Feature[], boxes: readonly BBox[], x: number, y: number) => feats.some((f, i) => {
  const b = boxes[i]!; if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) return false;
  return f.kind === 'stroke' ? strokeCovers(f.path, f.w, f.cap, x, y) : fillCovers(f.path, x, y);
});

/** a chunk buffer: its alpha, its colour channel (premultiplied), and the box of pixels that may be non-zero */
export class Raster {
  a: Float32Array; v: Float32Array; bb: [number, number, number, number] | null = null;
  constructor(readonly W: number, readonly H: number) { this.a = new Float32Array(W * H); this.v = new Float32Array(W * H); }
  at(x: number, y: number) { return x < 0 || y < 0 || x >= this.W || y >= this.H ? 0 : this.a[y * this.W + x]!; }
  valAt(x: number, y: number) { return x < 0 || y < 0 || x >= this.W || y >= this.H ? 0 : this.v[y * this.W + x]!; }
}
export type Box4 = [number, number, number, number];
export const meet = (p: Box4 | null, q: Box4 | null): Box4 | null => { if (!p || !q) return null; const b: Box4 = [Math.max(p[0], q[0]), Math.max(p[1], q[1]), Math.min(p[2], q[2]), Math.min(p[3], q[3])]; return b[0] < b[2] && b[1] < b[3] ? b : null; };
export const join = (p: Box4 | null, q: Box4 | null): Box4 | null => !p ? q : !q ? p : [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[2], q[2]), Math.max(p[3], q[3])];
/** a fill or stroke style's alpha and colour channel (its red, 0..1): '#rgb', '#rrggbb', 'rgb(...)' or 'rgba(...)' */
export function styleOf(s: unknown): { a: number; v: number } {
  if (typeof s !== 'string') throw new Error(`a style the raster cannot paint: ${String(s)}`);
  let m = /^#([0-9a-f]{2})[0-9a-f]{4}$/i.exec(s); if (m) return { a: 1, v: parseInt(m[1]!, 16) / 255 };
  m = /^#([0-9a-f])[0-9a-f]{2}$/i.exec(s); if (m) return { a: 1, v: parseInt(m[1]! + m[1]!, 16) / 255 };
  m = /^rgba?\(\s*([\d.]+)\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(s); if (m) return { a: m[2] === undefined ? 1 : +m[2], v: +m[1]! / 255 };
  throw new Error(`a style the raster cannot paint: ${s}`);
}
/** the alpha a fill or stroke style paints with */
export const alphaOf = (s: unknown) => styleOf(s).a;
/** a 2D context over a Raster: the calls the bevel and the kerb face make, in alpha and one colour channel (Porter-Duff, premultiplied),
 *  sampled at pixel centres; drawImage is bilinear */
export class SoftCtx implements BevelCtx<Raster> {
  globalCompositeOperation: GlobalCompositeOperation = 'source-over'; globalAlpha = 1;
  fillStyle: string | CanvasGradient | CanvasPattern = '#000'; strokeStyle: string | CanvasGradient | CanvasPattern = '#000';
  lineWidth = 1; lineCap: CanvasLineCap = 'butt'; lineJoin: CanvasLineJoin = 'miter';
  private T = [1, 0, 0, 1, 0, 0];
  constructor(readonly r: Raster) {}
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) { this.T = [a, b, c, d, e, f]; }
  private identity() { const [a, b, c, d, e, f] = this.T; assert.ok(a === 1 && b === 0 && c === 0 && d === 1 && e === 0 && f === 0, 'drawn at the identity'); }
  /** composites a source (alpha src(x, y) inside the pixel box R, none outside it) with the current operation; its colour is the constant
   *  val, or (an image) val(x, y) premultiplied */
  private put(R: Box4 | null, src: (x: number, y: number) => number, val: number | ((x: number, y: number) => number)) {
    const { a, v, W } = this.r, ga = this.globalAlpha, op = this.globalCompositeOperation, full: Box4 = [0, 0, this.r.W, this.r.H];
    const box = meet(R, full), pv = typeof val === 'number' ? (_x: number, _y: number, s: number) => val * s : (x: number, y: number) => val(x, y) * ga;
    if (op === 'source-in' || op === 'destination-in') {
      const D = this.r.bb; if (!D) return;
      for (let y = D[1]; y < D[3]; y++) for (let x = D[0]; x < D[2]; x++) {
        const i = y * W + x, inR = box && x >= box[0] && x < box[2] && y >= box[1] && y < box[3];
        if (!inR) { a[i] = 0; v[i] = 0; continue; }
        const s = src(x, y) * ga;
        if (op === 'source-in') v[i] = pv(x, y, s) * a[i]!; else v[i] = v[i]! * s;
        a[i] = s * a[i]!;
      }
      this.r.bb = meet(D, box); return;
    }
    if (!box) return;
    assert.ok(op === 'source-over' || op === 'destination-out' || op === 'source-atop', `composite ${op}`);
    for (let y = box[1]; y < box[3]; y++) for (let x = box[0]; x < box[2]; x++) {
      const i = y * W + x, s = src(x, y) * ga; if (!s) continue;
      if (op === 'source-over') { v[i] = pv(x, y, s) + v[i]! * (1 - s); a[i] = s + a[i]! * (1 - s); }
      else if (op === 'destination-out') { v[i] = v[i]! * (1 - s); a[i] = a[i]! * (1 - s); }
      else v[i] = pv(x, y, s) * a[i]! + v[i]! * (1 - s);
    }
    if (op === 'source-over') this.r.bb = join(this.r.bb, box);
  }
  fillRect(x: number, y: number, w: number, h: number) { this.identity(); const k = styleOf(this.fillStyle); this.put([Math.ceil(x - 0.5), Math.ceil(y - 0.5), Math.ceil(x + w - 0.5), Math.ceil(y + h - 0.5)], () => k.a, k.v); }
  drawImage(img: Raster, dx: number, dy: number) {
    this.identity(); if (!img.bb) { this.put(null, () => 0, 0); return; }
    const b = img.bb, R: Box4 = [Math.floor(b[0] + dx) - 1, Math.floor(b[1] + dy) - 1, Math.ceil(b[2] + dx) + 1, Math.ceil(b[3] + dy) + 1];
    const lerp = (get: (i: number, j: number) => number) => (x: number, y: number) => { const u = x - dx, w = y - dy, i = Math.floor(u), j = Math.floor(w), s = u - i, t = w - j; return (1 - t) * ((1 - s) * get(i, j) + s * get(i + 1, j)) + t * ((1 - s) * get(i, j + 1) + s * get(i + 1, j + 1)); };
    this.put(R, lerp((i, j) => img.at(i, j)), lerp((i, j) => img.valAt(i, j)));
  }
  private shape(p: Path2D, hit: (x: number, y: number) => boolean, pad: number, k: { a: number; v: number }) {
    const [a, b, c, d, e, f] = this.T as [number, number, number, number, number, number], det = a * d - b * c;
    const pts = subsOf(p).flatMap(s => s.pts); if (!pts.length) { this.put(null, () => 0, 0); return; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < pts.length; i += 2) for (const [ox, oy] of [[-pad, -pad], [pad, -pad], [-pad, pad], [pad, pad]] as const) { const X = a * (pts[i]! + ox) + c * (pts[i + 1]! + oy) + e, Y = b * (pts[i]! + ox) + d * (pts[i + 1]! + oy) + f; x0 = Math.min(x0, X); y0 = Math.min(y0, Y); x1 = Math.max(x1, X); y1 = Math.max(y1, Y); }
    this.put([Math.floor(x0) - 1, Math.floor(y0) - 1, Math.ceil(x1) + 1, Math.ceil(y1) + 1], (x, y) => { const X = x + 0.5 - e, Y = y + 0.5 - f; return hit((d * X - c * Y) / det, (a * Y - b * X) / det) ? k.a : 0; }, k.v);
  }
  stroke(p: Path2D) { assert.equal(this.lineJoin, 'round'); const w = this.lineWidth, cap = this.lineCap; this.shape(p, (x, y) => strokeCovers(p, w, cap, x, y), w / 2, styleOf(this.strokeStyle)); }
  fill(p: Path2D) { this.shape(p, (x, y) => fillCovers(p, x, y), 0, styleOf(this.fillStyle)); }
}

/** the ground painter's chunk (i, j) at cache level L (renderer.ts paint): its transform, size and tile box */
export function chunk(i: number, j: number, L: number) {
  const X0 = i * CHUNK_W, Y0 = j * CHUNK_H, M: Affine = { a: HW * L, b: HH * L, c: -HW * L, d: HH * L, e: -X0 * L, f: -Y0 * L };
  const cs = [tileOf(X0, Y0), tileOf(X0 + CHUNK_W, Y0), tileOf(X0, Y0 + CHUNK_H), tileOf(X0 + CHUNK_W, Y0 + CHUNK_H)];
  const box: BBox = [Math.floor(Math.min(...cs.map(p => p.x))) - 1, Math.floor(Math.min(...cs.map(p => p.y))) - 1, Math.ceil(Math.max(...cs.map(p => p.x))) + 1, Math.ceil(Math.max(...cs.map(p => p.y))) + 1];
  return { M, W: Math.round(CHUNK_W * L), H: Math.round(CHUNK_H * L), box };
}
/** the chunks the tile box b reaches */
export function chunksOver(b: BBox) {
  const X = [b[0] - b[3], b[2] - b[1]].map(v => v * HW), Y = [b[0] + b[1], b[2] + b[3]].map(v => v * HH), out: [number, number][] = [];
  for (let i = Math.floor(X[0]! / CHUNK_W); i <= Math.floor(X[1]! / CHUNK_W); i++) for (let j = Math.floor(Y[0]! / CHUNK_H); j <= Math.floor(Y[1]! / CHUNK_H); j++) out.push([i, j]);
  return out;
}
/** the tile point at the centre of chunk pixel (x, y) under M, moved dy px down the screen */
export function tileAtPx(M: Affine, x: number, y: number, dy = 0) {
  const det = M.a * M.d - M.b * M.c, X = x + 0.5 - M.e, Y = y + 0.5 + dy - M.f;
  return { x: (M.d * X - M.c * Y) / det, y: (M.a * Y - M.b * X) / det };
}
