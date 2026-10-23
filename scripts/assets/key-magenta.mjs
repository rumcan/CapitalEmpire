// Turn a picture painted on flat magenta into real alpha (ported from TrickOrTreat's scripts/town-variations/runner.mjs keyMagenta,
// for one item per picture). Magenta-ness is min(r, b) - g: 255 for #FF00FF, about 0 for whites, greys, reds, blues, yellows and navy
// shading (the prompt bans magenta, pink and purple on the object). A pixel mixing object colour c with magenta at coverage a has
// magenta-ness (1 - a) * bg, so a = 1 - score / bg and the pixel is un-mixed back to c: no fringe on thin rails or white canvas.
// Models never paint exact #FF00FF, so bg (score and colour) is the picture's own median background.
// The clean-up after it follows Corridor Crew's CorridorKey (CorridorKeyModule/core/color_utils.py, inference_engine.py): a despill that
// keeps the brightness (the tint moved into the other channels, not thrown away) with a strength, a soft speck clean-up (islands of the
// solid object smaller than `despeckle` px go, with their soft edges), a haze limit (see-through pixels further than `haze` px from the
// solid object fade out), and the option of un-mixing in linear light. Every option is a setting (KEY_DEFAULTS; gen-golf.mjs reads
// art/golf/items.json "key" and each item's own "key").
import sharp from 'sharp';

/** the keyer's settings: solid / clear the coverage above which a pixel is solid and below which it is clear; despill 'keep' (the tint
 *  into the other channels: brightness kept) or 'cut' (the tint thrown away: the old keyer), despillStrength 0..1 (blended with the
 *  un-despilled colour); despeckle the smallest island of solid object kept (px, 0 off); haze the furthest a see-through pixel may be
 *  from the solid object (px, 0 off), fading over hazeSoft px; linear: un-mix in linear light (sRGB decoded) instead of sRGB values */
export const KEY_DEFAULTS = { solid: 0.92, clear: 0.15, despill: 'keep', despillStrength: 1, despeckle: 400, haze: 40, hazeSoft: 6, linear: false };

const toLin = v => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
const toSrgb = x => { const v = x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(Math.max(0, x), 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(v * 255))); };
const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/** the keyed RGBA picture of a magenta-background PNG buffer or file (opts: see KEY_DEFAULTS) */
export async function keyMagenta(input, opts = {}) {
  const o = { ...KEY_DEFAULTS, ...opts };
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H;
  const median = v => v.sort((x, y) => x - y)[v.length >> 1];
  const bgR = [], bgG = [], bgB = [];
  for (let i = 0; i < data.length; i += 4 * 7) if (Math.min(data[i], data[i + 2]) - data[i + 1] > 128) { bgR.push(data[i]); bgG.push(data[i + 1]); bgB.push(data[i + 2]); }
  const M = bgR.length ? [median(bgR), median(bgG), median(bgB)] : [255, 0, 255];
  // the space the un-mixing works in: sRGB values (0..255) or linear light (0..1, scaled to 0..255 so the thresholds read the same)
  const L = o.linear ? v => toLin(v) * 255 : v => v, out = o.linear ? v => toSrgb(v / 255) : v => Math.max(0, Math.min(255, Math.round(v)));
  const ML = M.map(L), bgScore = Math.max(0.5, (Math.min(ML[0], ML[2]) - ML[1]) / 255);
  const alpha = new Float32Array(N), col = new Float32Array(3 * N);
  for (let p = 0, i = 0; p < N; p++, i += 4) {
    const r = L(data[i]), g = L(data[i + 1]), b = L(data[i + 2]), score = (Math.min(r, b) - g) / 255;
    col[3 * p] = r; col[3 * p + 1] = g; col[3 * p + 2] = b;
    if (score <= 0) { alpha[p] = data[i + 3] / 255; continue; }
    let a = Math.min(1, 1 - score / bgScore);
    if (a <= o.clear) { alpha[p] = 0; continue; }
    if (a >= o.solid) a = 1;
    alpha[p] = a;
    // un-mixed back to the object's colour
    for (let c = 0; c < 3; c++) col[3 * p + c] = (col[3 * p + c] - (1 - a) * ML[c]) / a;
  }
  // the soft speck clean-up and the haze limit (CorridorKey clean_matte): the solid object's islands (alpha > 0.5, 8-connected) under
  // `despeckle` px go; every pixel's alpha fades with its distance from the kept islands (haze, over hazeSoft)
  if (o.despeckle > 0 || o.haze > 0) {
    const lab = new Int32Array(N).fill(-1), keep = new Uint8Array(N), stack = new Int32Array(N); let comp = 0;
    for (let s = 0; s < N; s++) {
      if (lab[s] >= 0 || alpha[s] <= 0.5) continue;
      const members = []; let top = 0; stack[top++] = s; lab[s] = comp;
      while (top) { const q = stack[--top]; members.push(q); const x = q % W, y = (q / W) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const r = Y * W + X; if (lab[r] < 0 && alpha[r] > 0.5) { lab[r] = comp; stack[top++] = r; } } }
      if (members.length >= o.despeckle) for (const q of members) keep[q] = 1;
      comp++;
    }
    // distance (px) to the nearest kept pixel: a two-pass chamfer (3-4, divided by 3)
    const INF = 1e9, d = new Float32Array(N); for (let p = 0; p < N; p++) d[p] = keep[p] ? 0 : INF;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = y * W + x; let v = d[p];
      if (x > 0) v = Math.min(v, d[p - 1] + 3); if (y > 0) { v = Math.min(v, d[p - W] + 3); if (x > 0) v = Math.min(v, d[p - W - 1] + 4); if (x < W - 1) v = Math.min(v, d[p - W + 1] + 4); } d[p] = v; }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const p = y * W + x; let v = d[p];
      if (x < W - 1) v = Math.min(v, d[p + 1] + 3); if (y < H - 1) { v = Math.min(v, d[p + W] + 3); if (x < W - 1) v = Math.min(v, d[p + W + 1] + 4); if (x > 0) v = Math.min(v, d[p + W - 1] + 4); } d[p] = v; }
    // without a haze limit the specks' soft edges still go: the reach is then their own edge (CorridorKey's 25 px growth, scaled down)
    const reach = o.haze > 0 ? o.haze : 8, soft = Math.max(0.5, o.hazeSoft);
    for (let p = 0; p < N; p++) if (alpha[p] > 0) alpha[p] *= 1 - smooth(reach - soft, reach + soft, d[p] / 3);
  }
  // despill (CorridorKey despill: the screen colour's excess over the other channel): magenta-ness left in the object's colour,
  // s = min(r, b) - g; 'cut' takes s off r and b; 'keep' also adds 2s/3 to every channel, so r + g + b stays as it was
  const k = Math.max(0, Math.min(1, o.despillStrength));
  for (let p = 0, i = 0; p < N; p++, i += 4) {
    const a = alpha[p]; if (a <= 0) { data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0; continue; }
    let r = col[3 * p], g = col[3 * p + 1], b = col[3 * p + 2];
    const s = Math.min(r, b) - g;
    if (s > 0 && k > 0) {
      let nr = r - s, ng = g, nb = b - s;
      if (o.despill === 'keep') { const add = 2 * s / 3; nr += add; ng += add; nb += add; }
      r += (nr - r) * k; g += (ng - g) * k; b += (nb - b) * k;
    }
    data[i] = out(r); data[i + 1] = out(g); data[i + 2] = out(b); data[i + 3] = Math.round(a * 255);
  }
  return sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}
