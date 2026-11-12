## core Core
Shared numbers and helpers. The random and noise functions are Cinderdeep's own.
R: The view is 960 x 540 pixels: three times Cinderdeep's 320 x 180 each way.
R: The ground is painted at 56 pixels per metre across and 28 per metre in depth; heights are kept at 48 steps per metre. The camera's own numbers (distance, height, horizon row, focal length) live here.
R: The sun is at the upper right; shadows fall to the lower left.
R: A colour is packed with a light level in its top byte: 1 to 200 is lit by the sun, 201 to 230 is water of a depth, 255 glows by itself.
File: game.js
Check: const RS = 
Check: function vnoise(

````js file=game.js
'use strict';
// Cinderlinks. Compiled by fidelity.ps1 from cinderlinks.fd.md: each section below is one part (holon) of the distillation.

// ---- core: sizes, random, noise, colour
const RS = typeof RSCALE === 'number' && RSCALE >= 0.25 && RSCALE <= 1 ? RSCALE : 1, IRS = 1 / RS;   // the picture's scale: 1 = 960 x 540; the page may ask for less (?scale=0.5): fewer, bigger pixels
const VW = Math.round(120 * RS) * 8, VH = Math.round(540 * RS);
const PPM = 56, PPV = 28, ZP = 48;          // ground px per metre across and up the screen; px per metre of height
const D0 = 14, HC = 3.6, FOC = PPM * D0 * RS, DS = D0 * RS, HZ0 = Math.round(190 * RS);   // (DS / distance: the size a sculpture is drawn at)
let HZ = HZ0;                                // the horizon's screen row: it moves when the camera looks up or down   // the camera: metres behind the golfer, metres above his feet, the horizon's screen row, the focal length in px
const SUNX = 0.546, SUNY = -0.496, SUNZ = 0.675;   // to the sun, in plan (x right, y toward the camera, z up)
const SHU = -0.944, SHV = 0.429;            // a shadow's ground-px offset per px of height
const LVX = 0.52, LVY = -0.62, LVZ = 0.59;  // the same sun for upright art (x right, y down the screen, z toward the camera)

let rs = 0x2f6b9e31;
function rnd() { rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; return (rs >>> 0) / 4294967296; }
function rndi(n) { return (rnd() * n) | 0; }
function mulberry32(a) {
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function sstep(a, b, x) { const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return t * t * (3 - 2 * t); }
function hash2(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s) {   // value noise, smoothly interpolated
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s, oct) {  // layered value noise
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < oct; o++) { sum += amp * vnoise(x * f, y * f, s + o * 1013); norm += amp; amp *= 0.5; f *= 2.03; }
  return sum / norm;
}

// a colour ramp, dark to light: '#rrggbb' strings -> packed 0x00bbggrr numbers
function ramp(list) { return Uint32Array.from(list, (h) => { const n = parseInt(h.slice(1), 16); return ((n & 255) << 16) | (n & 0xff00) | (n >> 16); }); }
// a ramp between two ramps of the same length (t = 0 gives a, t = 1 gives b)
function mixRamp(a, b, t) {
  return Uint32Array.from(a, (ca, k) => { const cb = b[k];
    const r = lerp(ca & 255, cb & 255, t), g = lerp((ca >> 8) & 255, (cb >> 8) & 255, t), bl = lerp((ca >> 16) & 255, (cb >> 16) & 255, t);
    return (Math.round(bl) << 16) | (Math.round(g) << 8) | Math.round(r); });
}
function rampAt(rp, t) { const n = rp.length; let k = (t * n) | 0; if (k < 0) k = 0; else if (k >= n) k = n - 1; return rp[k]; }
````
