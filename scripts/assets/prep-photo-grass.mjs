// Bundle the three grass photos for the Paint tool's photo grasses, laid in tile space like the asphalt mosaic (textures.ts mosaic()).
// Reads fairway.png, fairway-sod.png and rough.png from the masters dir given as the first arg (default art/grass-photo under the repo root),
// writes src/assets/ground/paint-photo-*.webp and prints each one's size and mean colour (hex, the Paint panel swatch in paint.ts).
// src/game/grass-art.ts imports the webps.
//   node scripts/assets/prep-photo-grass.mjs [mastersDir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'src/assets/ground');
const MASTERS = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'art/grass-photo');
const MOSAIC_TILES = 12, MOSAIC_PX = 96; // src/game/textures.ts
const PPM = 55.2; // src/game/ground-art.ts: source px per metre that mosaic() expects
const ROUGH_PX = Math.round(PPM * 6); // a 6 m photo
const JOBS = [
  { src: 'fairway.png', dst: 'paint-photo-fairway.webp', px: MOSAIC_TILES * MOSAIC_PX, quality: 86 },
  { src: 'fairway-sod.png', dst: 'paint-photo-fairway-sod.webp', px: MOSAIC_TILES * MOSAIC_PX, quality: 86 },
  { src: 'rough.png', dst: 'paint-photo-rough.webp', px: ROUGH_PX, quality: 90 },
];

fs.mkdirSync(OUT, { recursive: true });
for (const j of JOBS) {
  await sharp(path.join(MASTERS, j.src)).resize(j.px, j.px, { fit: 'fill', kernel: 'lanczos3' }).webp({ quality: j.quality }).toFile(path.join(OUT, j.dst));
  const { channels } = await sharp(path.join(OUT, j.dst)).stats();
  const hex = channels.slice(0, 3).map(c => Math.round(c.mean).toString(16).padStart(2, '0')).join('');
  console.log(j.dst, `${j.px}x${j.px}`, fs.statSync(path.join(OUT, j.dst)).size, 'bytes', '#' + hex);
}
