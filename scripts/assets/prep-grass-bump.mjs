// T262 (#769): a bump (height) map for each painted grass family's tiles, for the grass's camera shine (src/game/grass-shine.ts).
//
// The owner, 2026-10-29: "generate a texture bumpmap for every grass type and lay that over as the specular highlight when your camera moves".
// For each family and band this reads its four colour tiles (src/assets/ground/painted/<file>, as painted-tiles.json lists them) and makes
// each one's height map: its luminance through a high-pass (the luminance less its Gaussian blur, sigma SIGMA native px: blade tops high, the
// gaps between them low, the painting's broad light and shade gone), normalised by the band's own spread (the four tiles together, so they
// agree across their seams) and stored single-channel at 128 + SPREAD z, at SCALE of the colour tile's size: the size a NEAR tile draws at
// at the closest zoom (T156: half native at 30%), so one bump texel is about one screen px there. Same tiling and period as the colour
// tile (the same cell, the same permutation: grass-shine.ts samples it where the bake laid the colour). Lossy WebP (a height map's
// small errors are invisible in a shine), greyscale.
//
// Re-run whenever a family is imported or re-painted (the manifest records each colour tile's sha256: a stale bump map is caught by the
// test). Phase 1 (the prototype) makes the fairway, the green and the town lawn's families, NEAR and MID; phase 2 every grass family.
//   node scripts/assets/prep-grass-bump.mjs [--only fam,fam] [--bands near,mid] [--check]
// --check compares what it would write with the manifest on disk and writes nothing.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT } from './source.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
/** the prototype's families (T262 phase 1): the fairway, the green and the town lawn (the rough wears the lawn's family too) */
export const PHASE1 = ['fairway-concept-run', 'green-concept-run', 'lawn-concept-run'];
/** the high-pass's blur, native px (the blades are 2-4 px wide: a blob larger than about 2 sigma counts as the painting's light, not a blade) */
export const SIGMA = 2.5;
/** the bump map's size against its colour tile's */
export const SCALE = 0.5;
/** the stored spread: 128 + SPREAD z (z the height in the band's standard deviations), clamped to 0..255 */
export const SPREAD = 40;
const QUALITY = 82;

const only = opt('only', PHASE1.join(',')).split(','), bands = opt('bands', 'near,mid').split(','), check = args.includes('--check');
const tilesJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/game/painted-tiles.json'), 'utf8'));
const SRC = path.join(ROOT, 'src/assets/ground/painted'), OUT = path.join(SRC, 'bump'), MANIFEST = path.join(ROOT, 'src/game/grass-bump.json');

/** a tile's luminance (0..1, native size) */
async function luminance(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height, out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (0.3 * data[3 * i] + 0.59 * data[3 * i + 1] + 0.11 * data[3 * i + 2]) / 255;
  return { lum: out, w: info.width, h: info.height };
}
/** a separable Gaussian blur, edges clamped (a tile's neighbour differs, so nothing wraps) */
function blur(src, w, h, sigma) {
  const r = Math.ceil(3 * sigma), k = new Float32Array(2 * r + 1); let s = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); s += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0; for (let i = -r; i <= r; i++) a += k[i + r] * src[y * w + Math.min(w - 1, Math.max(0, x + i))]; tmp[y * w + x] = a; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0; for (let i = -r; i <= r; i++) a += k[i + r] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x]; out[y * w + x] = a; }
  return out;
}
/** a box downsample to (W, H) */
function shrink(src, w, h, W, H) {
  const out = new Float32Array(W * H), sx = w / W, sy = h / H;
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    const x0 = Math.floor(X * sx), x1 = Math.max(x0 + 1, Math.floor((X + 1) * sx)), y0 = Math.floor(Y * sy), y1 = Math.max(y0 + 1, Math.floor((Y + 1) * sy));
    let a = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { a += src[y * w + x]; n++; } out[Y * W + X] = a / n;
  }
  return out;
}

const manifest = { v: 1, note: 'T262: the painted grass families\' bump maps (scripts/assets/prep-grass-bump.mjs); grass-shine.ts reads it', sigma: SIGMA, scale: SCALE, spread: SPREAD, families: [] };
let bytes = 0;
for (const id of only) {
  const fam = tilesJson.families.find(f => f.id === id);
  if (!fam) throw new Error(`no painted tile family ${id}`);
  if (fam.kind !== 'grass') throw new Error(`${id} is not a grass family (${fam.kind})`);
  const entry = { id, levels: {} };
  for (const band of bands) {
    const lv = fam.levels[band]; if (!lv) throw new Error(`${id} has no ${band} level`);
    const W = Math.round(lv.native[0] * SCALE), H = Math.round(lv.native[1] * SCALE);
    // the four tiles' high-passes, then one spread for the band (so the tiles agree across their seams)
    const hp = [];
    for (const t of lv.tiles) {
      const { lum, w, h } = await luminance(path.join(SRC, t.file));
      const b = blur(lum, w, h, SIGMA), d = new Float32Array(w * h);
      for (let i = 0; i < d.length; i++) d[i] = lum[i] - b[i];
      hp.push({ t, d: shrink(d, w, h, W, H) });
    }
    let s2 = 0, n = 0; for (const { d } of hp) for (const v of d) { s2 += v * v; n++; }
    const std = Math.sqrt(s2 / n), tiles = [];
    for (const { t, d } of hp) {
      const px = Buffer.alloc(W * H); let sat = 0;
      for (let i = 0; i < d.length; i++) { const v = Math.round(128 + SPREAD * d[i] / std); if (v < 0 || v > 255) sat++; px[i] = Math.max(0, Math.min(255, v)); }
      const file = `bump/${id}/${band}/${path.basename(t.file)}`, abs = path.join(SRC, file);
      const buf = await sharp(px, { raw: { width: W, height: H, channels: 1 } }).webp({ quality: QUALITY, effort: 6 }).toBuffer();
      bytes += buf.length;
      if (!check) { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, buf); }
      tiles.push({ file, of: t.file, sha256: t.sha256, saturated: +(sat / d.length).toFixed(4), bytes: buf.length });
    }
    entry.levels[band] = { size: [W, H], lumStd: +std.toFixed(5), tiles };
    console.log(`${id} ${band}: ${W}x${H}, luminance high-pass std ${std.toFixed(4)}, ${tiles.map(t => Math.round(t.bytes / 1024) + ' KB').join(' ')}`);
  }
  manifest.families.push(entry);
}
const text = JSON.stringify(manifest, null, 1) + '\n';
if (check) {
  const old = fs.existsSync(MANIFEST) ? fs.readFileSync(MANIFEST, 'utf8') : '';
  const strip = s => s.replace(/"bytes": \d+/g, '');
  console.log(strip(old) === strip(text) ? 'grass-bump.json is up to date' : 'grass-bump.json would change'); process.exitCode = strip(old) === strip(text) ? 0 : 1;
} else fs.writeFileSync(MANIFEST, text);
console.log(`${manifest.families.length} families, ${(bytes / 1048576).toFixed(2)} MB of bump maps`);
