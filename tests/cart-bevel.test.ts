// The cart paths' sun bevel lines up with the paths (T139). The ground painter bakes the ground in chunks; each cart path's light rim, shade
// rim and the slabs' cast shade (cart-bevel.ts) are drawn here on a software raster (alpha only, the 2D-context calls the bevel makes) for
// every chunk a path crosses, at the closest and a far cache level, and each pixel is checked against the path's own surface, the network's
// features: a lit pixel lies within the rim's depth of an edge facing the sun, a shaded one of an edge facing away, the rims run the whole
// length of those edges, and the cast is the surface stepped at 145°. The paths cross the chunks' seams along and across them, bend and fork
// at a chunk corner. T084 slid the chunk's mask by a pixel offset instead, which drew a bevel bar across a path at every chunk seam (the
// owner's screenshot, 2026-10-26); the last test shows the checks catch it. Headless: npm test (no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHUNK_H, CHUNK_W, HH, HW, tileOf } from '../src/game/iso';
import { CART_CAST, CART_RIM, CART_SURFACE, cartCast, cartRim, drawPaths, fromSun, type Affine, type BevelCtx } from '../src/game/cart-bevel';
import { SUN_TILE_DIR } from '../src/game/ext/course-height';
import { CLASS, RoadNetwork, type BBox, type ClassId, type Feature, type Leg, type Pt } from '../src/game/network';
import { NetEditor } from '../src/game/netops';

const TAU = Math.PI * 2;
/** a Path2D that keeps its outline, each subpath flattened to points (arcs in short chords), for the raster below */
class RecPath {
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
function strokeCovers(p: Path2D, w: number, cap: CanvasLineCap, x: number, y: number) {
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
function fillCovers(p: Path2D, x: number, y: number) {
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
function boxOf(f: Feature): BBox {
  const pts = subsOf(f.path).flatMap(s => s.pts), r = f.kind === 'stroke' ? f.w / 2 : 0, xs = pts.filter((_, i) => i % 2 === 0), ys = pts.filter((_, i) => i % 2 === 1);
  return [Math.min(...xs) - r, Math.min(...ys) - r, Math.max(...xs) + r, Math.max(...ys) + r];
}
/** the surface: whether any of the features covers tile point (x, y) */
const covers = (feats: readonly Feature[], boxes: readonly BBox[], x: number, y: number) => feats.some((f, i) => {
  const b = boxes[i]!; if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) return false;
  return f.kind === 'stroke' ? strokeCovers(f.path, f.w, f.cap, x, y) : fillCovers(f.path, x, y);
});

/** a chunk buffer: its alpha, and the box of pixels that may be non-zero */
class Raster {
  a: Float32Array; bb: [number, number, number, number] | null = null;
  constructor(readonly W: number, readonly H: number) { this.a = new Float32Array(W * H); }
  at(x: number, y: number) { return x < 0 || y < 0 || x >= this.W || y >= this.H ? 0 : this.a[y * this.W + x]!; }
}
type Box4 = [number, number, number, number];
const meet = (p: Box4 | null, q: Box4 | null): Box4 | null => { if (!p || !q) return null; const b: Box4 = [Math.max(p[0], q[0]), Math.max(p[1], q[1]), Math.min(p[2], q[2]), Math.min(p[3], q[3])]; return b[0] < b[2] && b[1] < b[3] ? b : null; };
const join = (p: Box4 | null, q: Box4 | null): Box4 | null => !p ? q : !q ? p : [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[2], q[2]), Math.max(p[3], q[3])];
/** the alpha a fill or stroke style paints with */
const alphaOf = (s: unknown) => { const m = typeof s === 'string' && /^rgba\(.*,\s*([\d.]+)\s*\)$/.exec(s); return m ? +m[1]! : 1; };
/** a 2D context over a Raster: the calls the bevel makes, in alpha (Porter-Duff), sampled at pixel centres; drawImage is bilinear */
class SoftCtx implements BevelCtx<Raster> {
  globalCompositeOperation: GlobalCompositeOperation = 'source-over'; globalAlpha = 1;
  fillStyle: string | CanvasGradient | CanvasPattern = '#000'; strokeStyle: string | CanvasGradient | CanvasPattern = '#000';
  lineWidth = 1; lineCap: CanvasLineCap = 'butt'; lineJoin: CanvasLineJoin = 'miter';
  private T = [1, 0, 0, 1, 0, 0];
  constructor(readonly r: Raster) {}
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) { this.T = [a, b, c, d, e, f]; }
  private identity() { const [a, b, c, d, e, f] = this.T; assert.ok(a === 1 && b === 0 && c === 0 && d === 1 && e === 0 && f === 0, 'drawn at the identity'); }
  /** composites a source (alpha src(x, y) inside the pixel box R, none outside it) with the current operation */
  private put(R: Box4 | null, src: (x: number, y: number) => number) {
    const { a, W } = this.r, ga = this.globalAlpha, op = this.globalCompositeOperation, full: Box4 = [0, 0, this.r.W, this.r.H];
    const box = meet(R, full);
    if (op === 'source-in' || op === 'destination-in') {
      const D = this.r.bb; if (!D) return;
      for (let y = D[1]; y < D[3]; y++) for (let x = D[0]; x < D[2]; x++) { const i = y * W + x, inR = box && x >= box[0] && x < box[2] && y >= box[1] && y < box[3]; a[i] = inR ? src(x, y) * ga * a[i]! : 0; }
      this.r.bb = meet(D, box); return;
    }
    if (!box) return;
    assert.ok(op === 'source-over' || op === 'destination-out', `composite ${op}`);
    for (let y = box[1]; y < box[3]; y++) for (let x = box[0]; x < box[2]; x++) { const i = y * W + x, s = src(x, y) * ga; a[i] = op === 'source-over' ? s + a[i]! * (1 - s) : a[i]! * (1 - s); }
    if (op === 'source-over') this.r.bb = join(this.r.bb, box);
  }
  fillRect(x: number, y: number, w: number, h: number) { this.identity(); const k = alphaOf(this.fillStyle); this.put([Math.ceil(x - 0.5), Math.ceil(y - 0.5), Math.ceil(x + w - 0.5), Math.ceil(y + h - 0.5)], () => k); }
  drawImage(img: Raster, dx: number, dy: number) {
    this.identity(); if (!img.bb) { this.put(null, () => 0); return; }
    const b = img.bb, R: Box4 = [Math.floor(b[0] + dx) - 1, Math.floor(b[1] + dy) - 1, Math.ceil(b[2] + dx) + 1, Math.ceil(b[3] + dy) + 1];
    this.put(R, (x, y) => { const u = x - dx, v = y - dy, i = Math.floor(u), j = Math.floor(v), s = u - i, t = v - j; return (1 - t) * ((1 - s) * img.at(i, j) + s * img.at(i + 1, j)) + t * ((1 - s) * img.at(i, j + 1) + s * img.at(i + 1, j + 1)); });
  }
  private shape(p: Path2D, hit: (x: number, y: number) => boolean, pad: number, k: number) {
    const [a, b, c, d, e, f] = this.T as [number, number, number, number, number, number], det = a * d - b * c;
    const pts = subsOf(p).flatMap(s => s.pts); if (!pts.length) { this.put(null, () => 0); return; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < pts.length; i += 2) for (const [ox, oy] of [[-pad, -pad], [pad, -pad], [-pad, pad], [pad, pad]] as const) { const X = a * (pts[i]! + ox) + c * (pts[i + 1]! + oy) + e, Y = b * (pts[i]! + ox) + d * (pts[i + 1]! + oy) + f; x0 = Math.min(x0, X); y0 = Math.min(y0, Y); x1 = Math.max(x1, X); y1 = Math.max(y1, Y); }
    this.put([Math.floor(x0) - 1, Math.floor(y0) - 1, Math.ceil(x1) + 1, Math.ceil(y1) + 1], (x, y) => { const X = x + 0.5 - e, Y = y + 0.5 - f; return hit((d * X - c * Y) / det, (a * Y - b * X) / det) ? k : 0; });
  }
  stroke(p: Path2D) { assert.equal(this.lineJoin, 'round'); const w = this.lineWidth, cap = this.lineCap; this.shape(p, (x, y) => strokeCovers(p, w, cap, x, y), w / 2, alphaOf(this.strokeStyle)); }
  fill(p: Path2D) { this.shape(p, (x, y) => fillCovers(p, x, y), 0, alphaOf(this.fillStyle)); }
}

/** the ground painter's chunk (i, j) at cache level L (renderer.ts paint): its transform, size and tile box */
function chunk(i: number, j: number, L: number) {
  const X0 = i * CHUNK_W, Y0 = j * CHUNK_H, M: Affine = { a: HW * L, b: HH * L, c: -HW * L, d: HH * L, e: -X0 * L, f: -Y0 * L };
  const cs = [tileOf(X0, Y0), tileOf(X0 + CHUNK_W, Y0), tileOf(X0, Y0 + CHUNK_H), tileOf(X0 + CHUNK_W, Y0 + CHUNK_H)];
  const box: BBox = [Math.floor(Math.min(...cs.map(p => p.x))) - 1, Math.floor(Math.min(...cs.map(p => p.y))) - 1, Math.ceil(Math.max(...cs.map(p => p.x))) + 1, Math.ceil(Math.max(...cs.map(p => p.y))) + 1];
  return { M, W: Math.round(CHUNK_W * L), H: Math.round(CHUNK_H * L), box };
}
/** the chunks the tile box b reaches */
function chunksOver(b: BBox) {
  const X = [b[0] - b[3], b[2] - b[1]].map(v => v * HW), Y = [b[0] + b[1], b[2] + b[3]].map(v => v * HH), out: [number, number][] = [];
  for (let i = Math.floor(X[0]! / CHUNK_W); i <= Math.floor(X[1]! / CHUNK_W); i++) for (let j = Math.floor(Y[0]! / CHUNK_H); j <= Math.floor(Y[1]! / CHUNK_H); j++) out.push([i, j]);
  return out;
}

/** one chunk's bake of a surface kind's bevel: the paths' mask, the two rims and the cast, as the painter draws them */
type RimDraw = (g: SoftCtx, m: Raster, feats: readonly Feature[], M: Affine, W: number, H: number, s: number) => void;
const fixedRim: RimDraw = (g, m, feats, M, W, H, s) => cartRim(g, m, feats, M, W, H, '#fff', s);
/** T084's rim: the chunk's mask slid by the pixel offset of a (0, s) tile step, with drawImage */
const slidRim: RimDraw = (g, m, _feats, M, W, H, s) => {
  g.drawImage(m, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-out'; g.drawImage(m, M.c * s, M.d * s); g.globalCompositeOperation = 'source-over';
};

/** a layout: its legs, and its straight runs (from, to) whose middles are checked for a whole rim on both long edges */
interface Layout { name: string; legs: Leg[]; runs: [Pt, Pt][] }
const P = (x: number, y: number): Pt => ({ x, y }), leg = (a: Pt, b: Pt): Leg => ({ a, b });
// every layout meets the corner of four ground chunks, tile (1031.25, 1000): the seams x - y = 31.25 (screen-vertical) and x + y = 2031.25
// (screen-horizontal) cross the paths, or run along inside them
const LAYOUTS: Layout[] = [
  { name: 'a straight run along x', legs: [leg(P(1024.3, 1000.2), P(1038.3, 1000.2))], runs: [[P(1024.3, 1000.2), P(1038.3, 1000.2)]] },
  { name: 'a straight run along y', legs: [leg(P(1031.4, 993.1), P(1031.4, 1007.1))], runs: [[P(1031.4, 993.1), P(1031.4, 1007.1)]] },
  { name: 'a run down the screen, along a seam', legs: [leg(P(1025.3, 994.1), P(1037.3, 1006.1))], runs: [[P(1025.3, 994.1), P(1037.3, 1006.1)]] },
  { name: 'a run across the screen, along a seam', legs: [leg(P(1025.3, 1006.1), P(1037.3, 994.1))], runs: [[P(1025.3, 1006.1), P(1037.3, 994.1)]] },
  { name: 'a bend', legs: [leg(P(1024.3, 1000.2), P(1031.4, 1000.2)), leg(P(1031.4, 1000.2), P(1031.4, 1007.3))], runs: [] },
  { name: 'a spur toward the sun', legs: [leg(P(1024.3, 1000.2), P(1031.4, 1000.2)), leg(P(1031.4, 1000.2), P(1038.3, 1000.2)), leg(P(1031.4, 1000.2), P(1031.4, 993.3))], runs: [] },
];
/** the bevelled cart path classes: their surfaces have a painted look with rims */
const BEVELLED = (['cart-walk', 'cart-dirt', 'cart-slab', 'cart'] as const).filter(id => CART_SURFACE.has(CLASS[id]!.tex));
const LEVELS_CHECKED = [0.6, 0.15];

/** the surface kind's features as the painter gets them for chunk c (renderer.ts paint: the view round the chunk, the visible asphalt) */
function featsFor(net: RoadNetwork, tex: string, box: BBox) {
  const vis = (b: BBox) => b[2] >= box[0] && b[0] <= box[2] && b[3] >= box[1] && b[1] <= box[3];
  return net.view([box[0] - 8, box[1] - 8, box[2] + 8, box[3] + 8], false).asphF.filter(f => vis(f.bbox) && f.tex === tex);
}
function netOf(id: ClassId, legs: Leg[]) { const e = new NetEditor(new RoadNetwork()); e.addLegs(legs, CLASS[id]!, 0); e.commit(true); return e.net; }

/** the pixels where one class's bevel leaves its surface, over every chunk a layout reaches, at cache level L: stray lit or shaded pixels (not
 *  within the rim's depth of an edge facing toward, or away from, the sun), gaps in a rim along a straight run's edge, and cast pixels off the
 *  stepped surface; a few of each, with the chunk and the place */
function bevelFaults(id: ClassId, lay: Layout, L: number, rim: RimDraw) {
  const cls = CLASS[id]!, net = netOf(id, lay.legs), sun = SUN_TILE_DIR, look = CART_SURFACE.get(cls.tex)!;
  // the surface: the whole path's features, whichever chunk they fall in
  const all = net.view([900, 900, 1200, 1200], false).asphF.filter(f => f.tex === cls.tex), boxes = all.map(boxOf);
  const on = (x: number, y: number) => covers(all, boxes, x, y);
  const b = boxes.reduce((p, q) => [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[2], q[2]), Math.max(p[3], q[3])]);
  // px per tile along the sun's ground direction; the checks allow half a pixel of sampling
  const tol = 0.5 / (L * Math.hypot(HW * (sun.x - sun.y), HH * (sun.x + sun.y))), cast = fromSun(CART_CAST);
  const faults: string[] = []; let chunks = 0, litPx = 0, shadePx = 0, atBorder = 0;
  /** a fault at pixel (x, y) of a W x H chunk: the first few kept as text, and those within 6 px of the chunk's border counted */
  const note = (what: string, i: number, j: number, p: Pt, x: number, y: number, W: number, H: number) => {
    if (x < 6 || y < 6 || x >= W - 6 || y >= H - 6) atBorder++;
    if (faults.length < 6) faults.push(`${what} in chunk ${i},${j} at tile (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
  };
  for (const [i, j] of chunksOver(b)) {
    const { M, W, H, box } = chunk(i, j, L), feats = featsFor(net, cls.tex, box); if (!feats.length) continue;
    chunks++;
    const m = new Raster(W, H); drawPaths(new SoftCtx(m), feats, M);
    const lit = new Raster(W, H), shade = new Raster(W, H); rim(new SoftCtx(lit), m, feats, M, W, H, CART_RIM); rim(new SoftCtx(shade), m, feats, M, W, H, -CART_RIM);
    const det = M.a * M.d - M.b * M.c, tileAt = (x: number, y: number): Pt => { const X = x + 0.5 - M.e, Y = y + 0.5 - M.f; return { x: (M.d * X - M.c * Y) / det, y: (M.a * Y - M.b * X) / det }; };
    /** whether the surface ends within depth (plus the tolerance) of p, looking dir (+1 toward the sun, -1 away) */
    const nearEdge = (p: Pt, dir: number, depth: number) => { for (let t = 0; t <= depth + tol + 1e-9; t += tol / 4) if (!on(p.x + dir * sun.x * t, p.y + dir * sun.y * t)) return true; return false; };
    for (const [r, dir, what] of [[lit, 1, 'a light rim pixel off the sun-facing edges'], [shade, -1, 'a shade rim pixel off the edges facing away']] as const) {
      const bb = r.bb; if (!bb) continue;
      for (let y = bb[1]; y < bb[3]; y++) for (let x = bb[0]; x < bb[2]; x++) {
        if (r.a[y * W + x]! <= 0.5) continue;
        if (dir > 0) litPx++; else shadePx++;
        const p = tileAt(x, y); if (!nearEdge(p, dir, CART_RIM)) note(what, i, j, p, x, y, W, H);
      }
    }
    // the rims run the whole length of a straight run's long edges, away from its ends (the end bulbs and their own rims)
    for (const [A, B] of lay.runs) {
      const len = Math.hypot(B.x - A.x, B.y - A.y), u = { x: (B.x - A.x) / len, y: (B.y - A.y) / len }, margin = cls.h + cls.bulb + 0.6;
      const mb = m.bb; if (!mb) continue;
      for (let y = mb[1]; y < mb[3]; y++) for (let x = mb[0]; x < mb[2]; x++) {
        if (m.a[y * W + x]! <= 0.5) continue;
        const p = tileAt(x, y), s = (p.x - A.x) * u.x + (p.y - A.y) * u.y; if (s < margin || s > len - margin) continue;
        for (const [r, dir, what] of [[lit, 1, 'a gap in the light rim'], [shade, -1, 'a gap in the shade rim']] as const) {
          const t = CART_RIM - tol; if (t <= 0) continue;
          if (!on(p.x + dir * sun.x * t, p.y + dir * sun.y * t) && r.a[y * W + x]! <= 0.5) note(what, i, j, p, x, y, W, H);
        }
      }
    }
    // the cast: the surface stepped CART_CAST from the sun, wherever the stepped surface is plain (not within the tolerance of its edge)
    if (look.cast) {
      const c = new Raster(W, H), ca = alphaOf(look.cast); cartCast(new SoftCtx(c), feats, M, W, H, look.cast);
      const reach = join(c.bb, m.bb); if (!reach) continue;
      for (let y = Math.max(0, reach[1] - 8); y < Math.min(H, reach[3] + 8); y++) for (let x = Math.max(0, reach[0] - 8); x < Math.min(W, reach[2] + 8); x++) {
        const p = tileAt(x, y), q = { x: p.x - cast.x, y: p.y - cast.y }, inside = on(q.x, q.y);
        if ([[tol, 0], [-tol, 0], [0, tol], [0, -tol]].some(([dx, dy]) => on(q.x + dx!, q.y + dy!) !== inside)) continue;
        if ((c.a[y * W + x]! > ca / 2) !== inside) note(inside ? 'a gap in the cast shade' : 'a stray cast shade pixel', i, j, p, x, y, W, H);
      }
    }
  }
  return { faults, chunks, litPx, shadePx, atBorder };
}

test('every bevelled cart path class: the dirt walking path, the dirt path and the cement slabs (the paved path has no bevel)', () => {
  assert.deepEqual(BEVELLED, ['cart-walk', 'cart-dirt', 'cart-slab']);
  assert.ok(!CART_SURFACE.has(CLASS.cart!.tex), 'the paved cart path is drawn as asphalt, with the plain roads\' soft edge');
});

test('the bevel steps along the sun\'s ground direction: the light rim on the edges facing the upper right, the cast and shade at 145°', () => {
  const s = fromSun(1), sx = (s.x - s.y) * HW, sy = (s.x + s.y) * HH;
  assert.ok(Math.abs(Math.atan2(sy, sx) * 180 / Math.PI - 145) < 1e-6, 'a step from the sun points 145° on screen');
});

for (const id of BEVELLED) for (const lay of LAYOUTS) {
  test(`${id}, ${lay.name}: the light rim, the shade rim and the cast line up with the path in every chunk it crosses`, () => {
    for (const L of LEVELS_CHECKED) {
      const { faults, chunks, litPx, shadePx } = bevelFaults(id, lay, L, fixedRim);
      assert.ok(chunks >= 2, `${lay.name} crosses a chunk seam (${chunks} chunks)`);
      assert.ok(litPx > 0 && shadePx > 0, `at L ${L} the path has both rims (${litPx} lit, ${shadePx} shaded px)`);
      assert.deepEqual(faults, [], `at cache level ${L}`);
    }
  });
}

test('the checks catch T084\'s slid mask: a bevel bar along the chunk\'s border, across the path wherever it crosses a seam', () => {
  for (const id of BEVELLED) for (const lay of LAYOUTS) for (const L of LEVELS_CHECKED) {
    const { faults, atBorder } = bevelFaults(id, lay, L, slidRim);
    assert.ok(atBorder > 0 && faults.some(f => f.includes('rim pixel off')), `${id}, ${lay.name} at L ${L}: ${faults.join('; ') || 'no fault found'}`);
  }
});
