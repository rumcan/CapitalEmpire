import { mulberry } from './iso';
import { canvas, clamp, ctx2d, fbm, maskFrom, smooth, type Cnv } from './canvas2d';

/** The map's base grass: two pictures (A and B) hex-mixed in soft patches, B laid over A where a low-frequency mask says so, then a tone and
 *  warm/cool drift over the whole. The settings are the owner's (the sprite studio's Ground tab writes src/game/base-grass.json and the two
 *  adjusted pictures src/assets/ground/base-grass-a.webp / -b.webp); with the defaults the mix is the one the game always had. */

/** one of the two pictures: where it comes from (a path in the repo), its size and its colour adjustments (applied by the studio before saving) */
export interface GrassSide {
  /** repo path of the source picture (src/assets/ground/..., src/assets/ground/grass-v1/png/..., art/grass-photo/...) */
  src: string;
  /** the picture's repeat size: 1 = 256 px (the game's painted grasses), 2 = twice as big on the ground */
  scale: number;
  /** a tint colour laid over the picture at tintAmt (0 = none) */
  tint: string; tintAmt: number;
  /** 1 = unchanged */
  bright: number; contrast: number; sat: number;
  /** hue turn in degrees */
  hue: number;
}
/** how A and B are mixed */
export interface GrassMix {
  /** how much of the ground B covers (0..1; 0.5 = about half) */
  share: number;
  /** how soft the A/B boundary is (half the width of the blend, in mask units; 0.12 = the game's) */
  soft: number;
  /** the size of the hex patches each picture is laid in (1 = 154 px, the game's) */
  patch: number;
  /** the brightness swing over the map (0.1 = 0.9 to 1.1) */
  tone: number;
  /** the warm / cool drift (0.08 = the game's) */
  warm: number;
}
/** the file the studio writes (src/game/base-grass.json); saved false (or no pictures) keeps the game's grass */
export interface BaseGrassFile { v: 1; saved: boolean; stamp?: string; a: GrassSide; b: GrassSide; mix: GrassMix }
/** what the ground workers get with the art: the mix and the two pictures' size in native px (256 x scale); stamp changes the texture cache key */
export interface BaseGrassArt { mix: GrassMix; px: [number, number]; stamp?: string }

export const DEFAULT_MIX: GrassMix = { share: 0.5, soft: 0.12, patch: 1, tone: 0.1, warm: 0.08 };
export const DEFAULT_SIDE: Omit<GrassSide, 'src'> = { scale: 1, tint: '#808080', tintAmt: 0, bright: 1, contrast: 1, sat: 1, hue: 0 };
/** the slider ranges the studio offers (and clampMix / clampSide hold values to) */
export const RANGES = {
  scale: [0.25, 8], tintAmt: [0, 1], bright: [0.4, 1.8], contrast: [0.4, 1.8], sat: [0, 2], hue: [-180, 180],
  share: [0, 1], soft: [0.01, 0.5], patch: [0.25, 4], tone: [0, 0.4], warm: [0, 0.3],
} as const;
const fin = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const rng = (k: keyof typeof RANGES, v: unknown, d: number) => clamp(fin(v, d), RANGES[k][0], RANGES[k][1]);
const HEX = /^#[0-9a-f]{6}$/i;
export function clampSide(s: Partial<GrassSide> & { src: string }): GrassSide {
  const D = DEFAULT_SIDE;
  return { src: s.src, scale: rng('scale', s.scale, D.scale), tint: typeof s.tint === 'string' && HEX.test(s.tint) ? s.tint.toLowerCase() : D.tint, tintAmt: rng('tintAmt', s.tintAmt, D.tintAmt), bright: rng('bright', s.bright, D.bright), contrast: rng('contrast', s.contrast, D.contrast), sat: rng('sat', s.sat, D.sat), hue: rng('hue', s.hue, D.hue) };
}
export function clampMix(m: Partial<GrassMix>): GrassMix {
  const D = DEFAULT_MIX;
  return { share: rng('share', m.share, D.share), soft: rng('soft', m.soft, D.soft), patch: rng('patch', m.patch, D.patch), tone: rng('tone', m.tone, D.tone), warm: rng('warm', m.warm, D.warm) };
}

/** the colour adjustments of one side, in place on RGBA pixels: brightness, contrast (about mid grey), saturation and hue (about the pixel's luma), then the tint */
export function adjustPixels(D: Uint8ClampedArray, s: Omit<GrassSide, 'src' | 'scale'>) {
  const t = parseInt(s.tint.slice(1), 16), tr = (t >> 16) & 255, tg = (t >> 8) & 255, tb = t & 255, ta = s.tintAmt;
  const h = s.hue * Math.PI / 180, cosH = Math.cos(h), sinH = Math.sin(h);
  // the hue turn as a matrix in RGB (the usual luma-preserving rotation)
  const m = [
    0.299 + 0.701 * cosH + 0.168 * sinH, 0.587 - 0.587 * cosH + 0.330 * sinH, 0.114 - 0.114 * cosH - 0.497 * sinH,
    0.299 - 0.299 * cosH - 0.328 * sinH, 0.587 + 0.413 * cosH + 0.035 * sinH, 0.114 - 0.114 * cosH + 0.292 * sinH,
    0.299 - 0.300 * cosH + 1.250 * sinH, 0.587 - 0.588 * cosH - 1.050 * sinH, 0.114 + 0.886 * cosH - 0.203 * sinH,
  ];
  const plain = s.hue === 0;
  for (let o = 0; o < D.length; o += 4) {
    let r = D[o] * s.bright, g = D[o + 1] * s.bright, b = D[o + 2] * s.bright;
    r = (r - 128) * s.contrast + 128; g = (g - 128) * s.contrast + 128; b = (b - 128) * s.contrast + 128;
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    r = y + (r - y) * s.sat; g = y + (g - y) * s.sat; b = y + (b - y) * s.sat;
    if (!plain) { const R = r, G = g, B = b; r = m[0] * R + m[1] * G + m[2] * B; g = m[3] * R + m[4] * G + m[5] * B; b = m[6] * R + m[7] * G + m[8] * B; }
    if (ta > 0) { r += (tr * y / 128 - r) * ta; g += (tg * y / 128 - g) * ta; b += (tb * y / 128 - b) * ta; }
    D[o] = r; D[o + 1] = g; D[o + 2] = b;
  }
}

/** the base grass texture (W x H, tileable): gA and gB are the two pictures at their game size; mix as above (DEFAULT_MIX = the game's original) */
export function mixGrass(gA: Cnv, gB: Cnv, mix: GrassMix, W: number, H: number, author: number): Cnv {
  const c = canvas(W, H), g = ctx2d(c), HG = 192 * author * mix.patch, cols = Math.max(1, Math.round(W / HG)), rows = Math.max(1, Math.round(H / (HG * 0.866))), dx = W / cols, dy = H / rows;
  const R = HG * 0.72, feather = HG * 0.42, P = Math.ceil(R * 2) + 2, patch = canvas(P, P), pg = ctx2d(patch);
  const soft = canvas(P, P); { const sg = ctx2d(soft), gr = sg.createRadialGradient(P / 2, P / 2, 0, P / 2, P / 2, R); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(feather / R, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); sg.fillStyle = gr; sg.fillRect(0, 0, P, P); }
  const layer = (img: Cnv, seed: number) => {
    const l = canvas(W, H), lg = ctx2d(l), rr = mulberry(seed), pat = lg.createPattern(img, 'repeat')!;
    lg.fillStyle = pat; lg.fillRect(0, 0, W, H);
    const order: [number, number][] = []; for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) order.push([i, j]);
    for (let i = order.length - 1; i > 0; i--) { const j = (rr() * (i + 1)) | 0; [order[i], order[j]] = [order[j], order[i]]; }
    for (const [i, j] of order) {
      const ox = rr() * img.width, oy = rr() * img.height;
      pg.globalCompositeOperation = 'source-over'; pg.clearRect(0, 0, P, P); pg.fillStyle = pat; pg.save(); pg.translate(-ox, -oy); pg.fillRect(ox, oy, P, P); pg.restore();
      pg.globalCompositeOperation = 'destination-in'; pg.drawImage(soft, 0, 0);
      const X = (i + 0.5 + (j & 1 ? 0.5 : 0)) * dx - P / 2, Y = (j + 0.5) * dy - P / 2;
      for (const wx of [-W, 0, W]) for (const wy of [-H, 0, H]) { const x = X + wx, y = Y + wy; if (x > -P && x < W && y > -P && y < H) lg.drawImage(patch, x, y); }
    }
    return l;
  };
  g.drawImage(layer(gA, 21), 0, 0);
  // B over A where the low-frequency mask is past the centre (1 - share), blended over +-soft
  const mixF = fbm(31, W, H, 3, 3), B = layer(gB, 23), bg = ctx2d(B), c0 = 1 - mix.share;
  bg.globalCompositeOperation = 'destination-in'; bg.drawImage(maskFrom(W, H, (x, y) => mix.share >= 1 ? 1 : mix.share <= 0 ? 0 : smooth(c0 - mix.soft, c0 + mix.soft, mixF(x, y))), 0, 0);
  g.drawImage(B, 0, 0);
  // tone (1 +- tone) and a warm/cool drift (+- warm), like the builder's fbm tone/warm terms
  const tone = fbm(37, W, H, 5, 3), warm = fbm(41, W, H, 2, 2), d = g.getImageData(0, 0, W, H), D = d.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4, tb = 1 - mix.tone + 2 * mix.tone * tone(x, y), tw = (warm(x, y) - 0.5) * 2 * mix.warm; D[o] = clamp(D[o] * tb * (1 + tw), 0, 255); D[o + 1] = clamp(D[o + 1] * tb * (1 + tw * 0.4), 0, 255); D[o + 2] = clamp(D[o + 2] * tb * (1 - tw * 0.6), 0, 255); }
  g.putImageData(d, 0, 0);
  return c;
}
