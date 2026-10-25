// The painted grass (T082, #147) for the game: the art model's three levels of one surface (art/theme-consistency/generated/ground/painted-lod/
// <family>-lod-v<n>/{near,mid,far}.png, 1024 px, seamless, with provenance) as WebP in src/assets/ground/painted/<family>-<level>-v<n>.webp.
// The changes to the paintings: each level's mean colour is moved (a per-channel gain, at most a few %) to the three levels' common mean,
// so the game's crossfade between zoom levels never shifts the colour; then one grade for all three (SAT, CONTRAST below).
//   node scripts/assets/prep-painted-grass.mjs [family] [version]      (default: grass v1)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT } from './source.mjs';

const family = process.argv[2] ?? 'grass', version = process.argv[3] ?? 'v1', LEVELS = ['near', 'mid', 'far'];
// the grade, the same for all three levels (T082: the owner found the first grass "flat and over-saturated lime" beside the style reference):
// SAT pulls each pixel towards its own grey (the reference's greens are about 69% saturated in HSL, the art model's 82%); CONTRAST stretches
// the brush strokes' light and dark about the mean (the reference's turf has about 1.5x the art's luminance spread)
const SAT = 0.88, CONTRAST = 1.2;
const SRC = path.join(ROOT, `art/theme-consistency/generated/ground/painted-lod/${family}-lod-${version}`), OUT = path.join(ROOT, 'src/assets/ground/painted');
fs.mkdirSync(OUT, { recursive: true });
const pics = [];
for (const level of LEVELS) {
  const { data, info } = await sharp(path.join(SRC, `${level}.png`)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const mean = [0, 0, 0], n = info.width * info.height;
  for (let i = 0; i < data.length; i += 3) for (let k = 0; k < 3; k++) mean[k] += data[i + k] / n;
  pics.push({ level, data, info, mean });
}
const target = [0, 1, 2].map(k => pics.reduce((s, p) => s + p.mean[k], 0) / pics.length);
const targetY = 0.3 * target[0] + 0.59 * target[1] + 0.11 * target[2];
for (const p of pics) {
  const gain = target.map((t, k) => t / p.mean[k]), c = [0, 0, 0];
  for (let i = 0; i < p.data.length; i += 3) {
    for (let k = 0; k < 3; k++) c[k] = p.data[i + k] * gain[k];
    const Y = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2], Y2 = targetY + (Y - targetY) * CONTRAST;
    for (let k = 0; k < 3; k++) p.data[i + k] = Math.max(0, Math.min(255, Math.round(Y2 + (c[k] - Y) * SAT)));
  }
  const file = path.join(OUT, `${family}-${p.level}-${version}.webp`);
  await sharp(p.data, { raw: { width: p.info.width, height: p.info.height, channels: 3 } }).webp({ quality: 92, effort: 6 }).toFile(file);
  console.log(path.relative(ROOT, file), `${p.info.width}x${p.info.height}`, 'mean', p.mean.map(v => v.toFixed(1)).join(','), '-> gain', gain.map(v => v.toFixed(3)).join(','), Math.round(fs.statSync(file).size / 1024) + ' KB');
}
console.log('common mean', target.map(v => v.toFixed(1)).join(','));
