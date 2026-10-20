// Bundle the eight grass-v1 paintings for the Paint tool's grass textures, at the 256 px screen repeat of the base grass.
// Reads grass-<id>.png from the masters dir given as the first arg (default src/assets/ground/grass-v1/png under the repo root),
// writes src/assets/ground/paint-grass-<id>.webp and prints each one's mean colour (hex, the Paint panel swatch in paint.ts).
// src/game/grass-art.ts imports the webps.
//   node scripts/assets/prep-paint-grass.mjs [mastersDir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'src/assets/ground');
const MASTERS = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'src/assets/ground/grass-v1/png');
const IDS = ['backyard-lush', 'backyard-worn', 'backyard-clover-flowers', 'golf-putting-green', 'golf-worn-fairway', 'golf-rough', 'meadow-lush', 'meadow-flowers-patches'];

fs.mkdirSync(OUT, { recursive: true });
for (const id of IDS) {
  const dst = `paint-grass-${id}.webp`;
  await sharp(path.join(MASTERS, `grass-${id}.png`)).resize(256, 256, { fit: 'fill', kernel: 'lanczos3' }).webp({ quality: 92 }).toFile(path.join(OUT, dst));
  const { channels } = await sharp(path.join(OUT, dst)).stats();
  const hex = channels.slice(0, 3).map(c => Math.round(c.mean).toString(16).padStart(2, '0')).join('');
  console.log(dst, fs.statSync(path.join(OUT, dst)).size, 'bytes', '#' + hex);
}
