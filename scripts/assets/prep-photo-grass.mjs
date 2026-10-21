// Bundle the three grass photos for the Paint tool's photo grasses (textures.ts GRASS_PHOTO, mosaic()).
// Reads fairway.png, fairway-sod.png and rough.png from the masters dir given as the first arg (default art/grass-photo under the repo root),
// writes src/assets/ground/paint-photo-*.webp at each master's native size (no resizing: the mosaic and the mip chain do the scaling,
// so a painted area scaled up to 4x keeps the photo's detail), quality 92, and prints each one's size and mean colour (hex, the Paint panel swatch in paint.ts).
// src/game/grass-art.ts imports the webps.
//   node scripts/assets/prep-photo-grass.mjs [mastersDir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'src/assets/ground');
const MASTERS = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'art/grass-photo');
const JOBS = [
  { src: 'fairway.png', dst: 'paint-photo-fairway.webp' },
  { src: 'fairway-sod.png', dst: 'paint-photo-fairway-sod.webp' },
  { src: 'rough.png', dst: 'paint-photo-rough.webp' },
];

fs.mkdirSync(OUT, { recursive: true });
for (const j of JOBS) {
  await sharp(path.join(MASTERS, j.src)).webp({ quality: 92 }).toFile(path.join(OUT, j.dst));
  const { width, height } = await sharp(path.join(OUT, j.dst)).metadata();
  const { channels } = await sharp(path.join(OUT, j.dst)).stats();
  const hex = channels.slice(0, 3).map(c => Math.round(c.mean).toString(16).padStart(2, '0')).join('');
  console.log(j.dst, `${width}x${height}`, fs.statSync(path.join(OUT, j.dst)).size, 'bytes', '#' + hex);
}
