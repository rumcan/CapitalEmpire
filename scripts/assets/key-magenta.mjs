// Turn a picture painted on flat magenta into real alpha (ported from TrickOrTreat's scripts/town-variations/runner.mjs keyMagenta,
// for one item per picture). Magenta-ness is min(r, b) - g: 255 for #FF00FF, about 0 for whites, greys, reds, blues, yellows and navy
// shading (the prompt bans magenta, pink and purple on the object). A pixel mixing object colour c with magenta at coverage a has
// magenta-ness (1 - a) * bg, so a = 1 - score / bg and the pixel is un-mixed back to c: no fringe on thin rails or white canvas.
// Models never paint exact #FF00FF, so bg (score and colour) is the picture's own median background.
import sharp from 'sharp';

/** the keyed RGBA picture of a magenta-background PNG buffer or file */
export async function keyMagenta(input, { solid = 0.92, clear = 0.15 } = {}) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const median = v => v.sort((x, y) => x - y)[v.length >> 1];
  const bgR = [], bgG = [], bgB = [];
  for (let i = 0; i < data.length; i += 4 * 7) if (Math.min(data[i], data[i + 2]) - data[i + 1] > 128) { bgR.push(data[i]); bgG.push(data[i + 1]); bgB.push(data[i + 2]); }
  const M = bgR.length ? [median(bgR), median(bgG), median(bgB)] : [255, 0, 255], bgScore = Math.max(0.5, (Math.min(M[0], M[2]) - M[1]) / 255);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], score = (Math.min(r, b) - g) / 255;
    if (score <= 0) continue;
    let a = Math.min(1, 1 - score / bgScore);
    if (a <= clear) { data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0; continue; }
    if (a >= solid) a = 1;
    const unmix = (c, m) => Math.max(0, Math.min(255, Math.round((c - (1 - a) * m) / a)));
    let nr = unmix(r, M[0]), ng = unmix(g, M[1]), nb = unmix(b, M[2]);
    // despill what is left: r and b no higher than g where both exceed it
    const spill = Math.min(nr, nb) - ng; if (spill > 0) { nr -= spill; nb -= spill; }
    data[i] = nr; data[i + 1] = ng; data[i + 2] = nb; data[i + 3] = Math.round(a * 255);
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}
