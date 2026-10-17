import { mulberry } from '../iso';

/** a 2D noise function, about [-1, 1] */
export type Noise = (x: number, y: number) => number;

const SQRT2 = Math.SQRT2;
/** quintic fade curve 6t^5 - 15t^4 + 10t^3 */
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** 2D Perlin gradient noise, about [-1, 1]; permutation and gradients come from mulberry(seed) */
export function makeNoise(seed: number): Noise {
  const r = mulberry(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const gx = new Float64Array(256), gy = new Float64Array(256);
  for (let i = 0; i < 256; i++) { const a = r() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const u = fade(xf), v = fade(yf);
    const g00 = perm[perm[X] + Y], g10 = perm[perm[X + 1] + Y], g01 = perm[perm[X] + Y + 1], g11 = perm[perm[X + 1] + Y + 1];
    const n00 = gx[g00] * xf + gy[g00] * yf;
    const n10 = gx[g10] * (xf - 1) + gy[g10] * yf;
    const n01 = gx[g01] * xf + gy[g01] * (yf - 1);
    const n11 = gx[g11] * (xf - 1) + gy[g11] * (yf - 1);
    const nx0 = n00 + u * (n10 - n00), nx1 = n01 + u * (n11 - n01);
    return SQRT2 * (nx0 + v * (nx1 - nx0));
  };
}

/** fractal sum of `oct` octaves, normalised back to about [-1, 1] */
export function fbm(n: Noise, x: number, y: number, oct: number, lac = 2, gain = 0.5): number {
  let s = 0, amp = 1, norm = 0, f = 1;
  for (let o = 0; o < oct; o++) { s += amp * n(x * f, y * f); norm += amp; amp *= gain; f *= lac; }
  return s / norm;
}

/** ridged multifractal: sum of (1 - |n|)^2 octaves, normalised to [0, 1] */
export function ridged(n: Noise, x: number, y: number, oct: number): number {
  let s = 0, amp = 1, norm = 0, f = 1;
  for (let o = 0; o < oct; o++) { const v = 1 - Math.abs(n(x * f, y * f)); s += amp * v * v; norm += amp; amp *= 0.5; f *= 2; }
  return s / norm;
}

/** Hermite step from 0 at e0 to 1 at e1; works when e0 > e1 (a falling curve) */
export function smoothstep(e0: number, e1: number, x: number): number {
  const d = e1 - e0;
  const t = d === 0 ? (x < e0 ? 0 : 1) : Math.min(1, Math.max(0, (x - e0) / d));
  return t * t * (3 - 2 * t);
}

/** integer hash of two ints, for deriving sub-seeds; unsigned */
export function hash2(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return h >>> 0;
}
