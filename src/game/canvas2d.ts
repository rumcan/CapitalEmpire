import { mulberry } from './iso';

/** OffscreenCanvas helpers and tileable noise, shared by the ground textures (textures.ts) and the base grass mix (base-grass.ts, also bundled by the sprite studio) */
export type Cnv = OffscreenCanvas;
export type C2D = OffscreenCanvasRenderingContext2D;
/** every texture is built on OffscreenCanvas, so the same code runs in the ground workers and on the main thread */
export function canvas(w: number, h: number): Cnv { return new OffscreenCanvas(Math.max(1, w), Math.max(1, h)); }
export function ctx2d(c: Cnv, opts?: CanvasRenderingContext2DSettings): C2D { return c.getContext('2d', soft ? { ...opts, willReadFrequently: true } : opts) as C2D; }
/** a light boot's ground worker (T157: the lot lab, ground-protocol.ts WorkerLimits.soft) draws its canvases on the CPU: never on the GPU, where
 *  each one is a GPU texture and a copy in the GPU process too; set before the worker makes its first canvas */
let soft = false;
export function softCanvases(on: boolean) { soft = on; }
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** tileable value noise over a (W, H) period */
export function valueNoise(seed: number, cols: number, rows: number, W: number, H: number) {
  const r = mulberry(seed), g = new Float32Array(cols * rows); for (let i = 0; i < g.length; i++) g[i] = r();
  const cw = W / cols, ch = H / rows;
  return (x: number, y: number) => {
    const u = x / cw, v = y / ch, i0 = Math.floor(u), j0 = Math.floor(v), fu = u - i0, fv = v - j0;
    const su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv), ii = ((i0 % cols) + cols) % cols, jj = ((j0 % rows) + rows) % rows, i1 = (ii + 1) % cols, j1 = (jj + 1) % rows;
    const a = g[jj * cols + ii], b = g[jj * cols + i1], c = g[j1 * cols + ii], d = g[j1 * cols + i1];
    return (a + (b - a) * su) * (1 - sv) + (c + (d - c) * su) * sv;
  };
}
export function fbm(seed: number, W: number, H: number, cells: number, oct = 3) {
  const layers = Array.from({ length: oct }, (_, i) => valueNoise(seed + i * 17, cells << i, Math.max(1, Math.round(cells * H / W)) << i, W, H));
  return (x: number, y: number) => { let s = 0, a = 0.5, n = 0; for (let i = 0; i < oct; i++) { s += a * layers[i](x, y); n += a; a *= 0.5; } return s / n; };
}
/** a grey+alpha mask canvas from a scalar field */
export function maskFrom(W: number, H: number, f: (x: number, y: number) => number) {
  const c = canvas(W, H), g = ctx2d(c), d = g.createImageData(W, H), D = d.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4, a = clamp(f(x, y), 0, 1) * 255; D[o] = D[o + 1] = D[o + 2] = 255; D[o + 3] = a; }
  g.putImageData(d, 0, 0); return c;
}
