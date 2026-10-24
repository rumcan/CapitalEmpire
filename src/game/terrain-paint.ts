// Pure terrain painting helpers: hillshade, soft class coverage and waterway shapes (no DOM types: runs in Node and workers).
import { MAP, clamp } from './iso';
import { HS, HSTEP, TC, sampleField, type WaterPoint } from './terrain/types';
import { fbm, smoothstep, type Noise } from './terrain/noise';
import type { BBox } from './network';
import { SUN_LIGHT, sampleCourseGrid } from './ext/course-height';
import { PRESETS, surfacePreset, type PaintPreset } from './paint-presets';
import type { PaintTex } from './paint';

/** the woodland floor's texture (TC.HILL; the owner, 2026-10-24: "the map has this vector texture and it should be Fescue texture"): the
 *  course's fescue (paint-presets.ts surfacePreset: the preset standing for the fescue surface, else the owner's preset named Fescue, the
 *  Paint tool's), else the course's old fescue photo, so the woodland and the course's fescue always match. The ground painter lays it in
 *  tile space at scale 1, as a painted course area (renderer.ts paintPhoto), through the woodland's soft noise-edged mask; a pure choice,
 *  so the bake needs no rebuild step */
export function woodlandTex(presets: readonly Pick<PaintPreset, 'id' | 'surface'>[] = PRESETS): PaintTex {
  return surfacePreset('fescue', presets) ?? 'golfFescue';
}
/** the woodland floor's texture with the presets the game was built with (woodlandTex) */
export const WOODLAND_TEX: PaintTex = woodlandTex();

/** a canvas-like path target (Path2D satisfies it) */
export interface PathSink { moveTo(x: number, y: number): void; lineTo(x: number, y: number): void; arc(x: number, y: number, r: number, a0: number, a1: number): void; closePath(): void }

const EXAG = 1.5;
/** the light: the sun at the upper right of the isometric screen; shadows fall at 145°, as the cast shadows (SUN_LIGHT) */
const { lx, ly, lz } = SUN_LIGHT;

/** hillshade per height sample: 0 on flat ground, < 0 in shadow, > 0 lit */
export function shadeField(height: Float32Array): Float32Array {
  const out = new Float32Array(HS * HS);
  for (let j = 0; j < HS; j++) {
    const j0 = Math.max(0, j - 1), j1 = Math.min(HS - 1, j + 1), dy = (j1 - j0) * HSTEP * 2;
    for (let i = 0; i < HS; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(HS - 1, i + 1), dx = (i1 - i0) * HSTEP * 2;
      const gx = (height[j * HS + i1] - height[j * HS + i0]) / dx, gy = (height[j1 * HS + i] - height[j0 * HS + i]) / dy;
      const nx = -EXAG * gx, ny = -EXAG * gy, nz = 1, nl = Math.hypot(nx, ny, nz);
      out[j * HS + i] = (nx * lx + ny * ly + nz * lz) / nl - lz;
    }
  }
  return out;
}

/** writes the shade pixel for the shade value s at data[k..k+3]: dark where in shadow (s < 0), pale where lit */
function shadePixel(data: Uint8ClampedArray, k: number, s: number): void {
  if (s < 0) { data[k] = 14; data[k + 1] = 10; data[k + 2] = 34; data[k + 3] = Math.min(0.5, -s * 1.6) * 255; }
  else { data[k] = 190; data[k + 1] = 200; data[k + 2] = 230; data[k + 3] = Math.min(0.12, s * 0.6) * 255; }
}

/** an RGBA overlay of the shade over tiles [x0, x0+w) x [y0, y0+h) at res px per tile; course (optional) is the course height's shade, added to the terrain's */
export function shadeRGBA(shade: Float32Array, x0: number, y0: number, w: number, h: number, res: number, course: Float32Array | null = null): { data: Uint8ClampedArray; W: number; H: number } {
  const W = Math.max(1, Math.ceil(w * res)), H = Math.max(1, Math.ceil(h * res));
  const data = new Uint8ClampedArray(W * H * 4);
  for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
    const tx = x0 + (u + 0.5) / res, ty = y0 + (v + 0.5) / res, k = (v * W + u) * 4;
    if (tx < 0 || ty < 0 || tx >= MAP || ty >= MAP) continue; // off the map: no shade (clamped samples would streak)
    shadePixel(data, k, sampleField(shade, tx, ty) + (course ? sampleCourseGrid(course, tx, ty) : 0));
  }
  return { data, W, H };
}

/** an RGBA overlay of the course height's shade alone (the same colours as shadeRGBA) over tiles [x0, x0+w) x [y0, y0+h) at res px per tile; null when nothing in the box is shaded (flat), so the caller can skip it */
export function courseShadeRGBA(course: Float32Array, x0: number, y0: number, w: number, h: number, res: number): { data: Uint8ClampedArray; W: number; H: number } | null {
  const W = Math.max(1, Math.ceil(w * res)), H = Math.max(1, Math.ceil(h * res));
  const data = new Uint8ClampedArray(W * H * 4);
  let any = false;
  for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
    const tx = x0 + (u + 0.5) / res, ty = y0 + (v + 0.5) / res, k = (v * W + u) * 4;
    if (tx < 0 || ty < 0 || tx >= MAP || ty >= MAP) continue; // off the map: no shade (clamped samples would streak)
    shadePixel(data, k, sampleCourseGrid(course, tx, ty));
    if (data[k + 3]! > 0) any = true;
  }
  return any ? { data, W, H } : null;
}

/** one 3-tap box blur pass over a gw x gh grid, along x (dx=1) or y (dx=0), clamped at the edges */
function boxPass(src: Float32Array, dst: Float32Array, gw: number, gh: number, horiz: boolean) {
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const a = horiz ? Math.max(0, x - 1) : x, b = horiz ? Math.min(gw - 1, x + 1) : x;
    const c = horiz ? y : Math.max(0, y - 1), d = horiz ? y : Math.min(gh - 1, y + 1);
    dst[y * gw + x] = (src[c * gw + a] + src[y * gw + x] + src[d * gw + b]) / 3;
  }
}

/** soft, noise-edged coverage of one terrain class (RGB 0, alpha only), or null when there is none in the box */
export function classAlpha(cls: Uint8Array, want: number, x0: number, y0: number, w: number, h: number, res: number, noise: Noise): { data: Uint8ClampedArray; W: number; H: number } | null {
  const P = 3, W = Math.max(1, Math.ceil(w * res)), H = Math.max(1, Math.ceil(h * res));
  const gx0 = Math.floor(x0) - P, gy0 = Math.floor(y0) - P, GW = Math.ceil(x0 + w) + P - gx0, GH = Math.ceil(y0 + h) + P - gy0;
  const g = new Float32Array(GW * GH), tmp = new Float32Array(GW * GH);
  let any = false;
  for (let y = 0; y < GH; y++) {
    const ty = clamp(gy0 + y, 0, MAP - 1);
    for (let x = 0; x < GW; x++) {
      const tx = clamp(gx0 + x, 0, MAP - 1), c = cls[ty * MAP + tx];
      const v = c === want ? 1 : c === TC.CREEK ? 0.5 : 0;
      g[y * GW + x] = v; if (v > 0) any = true;
    }
  }
  if (!any) return null;
  boxPass(g, tmp, GW, GH, true); boxPass(tmp, g, GW, GH, false);
  boxPass(g, tmp, GW, GH, true); boxPass(tmp, g, GW, GH, false);
  const data = new Uint8ClampedArray(W * H * 4); any = false;
  for (let v = 0; v < H; v++) {
    const ty = y0 + (v + 0.5) / res, fy = clamp(ty - gy0 - 0.5, 0, GH - 1), jy = Math.min(GH - 2, Math.floor(fy)), sy = fy - jy;
    for (let u = 0; u < W; u++) {
      const tx = x0 + (u + 0.5) / res, fx = clamp(tx - gx0 - 0.5, 0, GW - 1), ix = Math.min(GW - 2, Math.floor(fx)), sx = fx - ix;
      const k = jy * GW + ix, top = g[k] + (g[k + 1] - g[k]) * sx, bot = g[k + GW] + (g[k + GW + 1] - g[k + GW]) * sx;
      const f = top + (bot - top) * sy, n = 0.28 * fbm(noise, tx / 6, ty / 6, 3);
      const a = Math.round(smoothstep(0.38, 0.62, f + n) * 255);
      data[(v * W + u) * 4 + 3] = a; if (a > 0) any = true;
    }
  }
  return any ? { data, W, H } : null;
}

/** adds the waterway shape, grown by `extra` tiles, as capsules (pieces near box only); true if anything was added */
export function waterShape(sink: PathSink, pts: WaterPoint[], extra: number, box: BBox, widthScale = 1): boolean {
  const [bx0, by0, bx1, by1] = box, rad = (p: WaterPoint) => Math.max(0.05, p.w / 2 * widthScale + extra);
  let any = false;
  for (const p of pts) {
    const r = rad(p);
    if (p.x + r < bx0 || p.x - r > bx1 || p.y + r < by0 || p.y - r > by1) continue;
    sink.moveTo(p.x + r, p.y); sink.arc(p.x, p.y, r, 0, Math.PI * 2); sink.closePath(); any = true;
  }
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1], ra = rad(a), rb = rad(b), g = Math.max(ra, rb);
    if (Math.max(a.x, b.x) + g < bx0 || Math.min(a.x, b.x) - g > bx1 || Math.max(a.y, b.y) + g < by0 || Math.min(a.y, b.y) - g > by1) continue;
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    if (!(len > 1e-6)) continue;
    const dxn = dx / len, dyn = dy / len, nx = -dyn, ny = dxn;
    sink.moveTo(b.x - nx * rb, b.y - ny * rb); sink.lineTo(b.x + nx * rb, b.y + ny * rb);
    sink.lineTo(a.x + nx * ra, a.y + ny * ra); sink.lineTo(a.x - nx * ra, a.y - ny * ra); sink.closePath(); any = true;
  }
  return any;
}

/** the bbox of the points, grown by half the widest water plus pad */
export function waterBox(pts: WaterPoint[], pad: number): BBox {
  let wmax = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p.w > wmax) wmax = p.w; if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; }
  const g = wmax / 2 + pad;
  return [x0 - g, y0 - g, x1 + g, y1 + g];
}

/** slope magnitude per height sample (metres per metre, central differences): about 0.9 is typical on the hills */
export function slopeField(height: Float32Array): Float32Array {
  const out = new Float32Array(HS * HS);
  for (let j = 0; j < HS; j++) {
    const j0 = Math.max(0, j - 1), j1 = Math.min(HS - 1, j + 1), dy = (j1 - j0) * HSTEP * 2;
    for (let i = 0; i < HS; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(HS - 1, i + 1), dx = (i1 - i0) * HSTEP * 2;
      out[j * HS + i] = Math.hypot((height[j * HS + i1] - height[j * HS + i0]) / dx, (height[j1 * HS + i] - height[j0 * HS + i]) / dy);
    }
  }
  return out;
}

/** bare rock on the steep faces (RGB 0, alpha only): slope past about 1.2 fades in, the edge wobbles with noise; null when there is none in the box */
export function rockAlpha(slope: Float32Array, x0: number, y0: number, w: number, h: number, res: number, noise: Noise): { data: Uint8ClampedArray; W: number; H: number } | null {
  const W = Math.max(1, Math.ceil(w * res)), H = Math.max(1, Math.ceil(h * res));
  const data = new Uint8ClampedArray(W * H * 4); let any = false;
  for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
    const tx = x0 + (u + 0.5) / res, ty = y0 + (v + 0.5) / res;
    if (tx < 0 || ty < 0 || tx >= MAP || ty >= MAP) continue; // off the map: no rock
    const a = Math.round(smoothstep(1.2, 1.6, sampleField(slope, tx, ty) + 0.25 * fbm(noise, tx / 10, ty / 10, 3)) * 255);
    data[(v * W + u) * 4 + 3] = a; if (a > 0) any = true;
  }
  return any ? { data, W, H } : null;
}
