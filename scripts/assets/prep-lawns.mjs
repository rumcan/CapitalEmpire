// Bundle the three backyard lawn paintings for the city blocks: lush, worn and clover-flowers, at the 256 px screen repeat of the base grass.
// Reads the masters from the dir given as the first arg (default src/assets/ground/grass-v1/png under the repo root) and writes
// src/assets/ground/lawn-0.webp (lush), lawn-1.webp (worn) and lawn-2.webp (clover). src/game/lawn-art.ts imports them.
//   node scripts/assets/prep-lawns.mjs [mastersDir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'src/assets/ground');
const MASTERS = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'src/assets/ground/grass-v1/png');
const LAWNS = [['grass-backyard-lush.png', 'lawn-0.webp'], ['grass-backyard-worn.png', 'lawn-1.webp'], ['grass-backyard-clover-flowers.png', 'lawn-2.webp']];

fs.mkdirSync(OUT, { recursive: true });
for (const [src, dst] of LAWNS) {
  await sharp(path.join(MASTERS, src)).resize(256, 256, { fit: 'fill', kernel: 'lanczos3' }).webp({ quality: 92 }).toFile(path.join(OUT, dst));
  console.log(dst, fs.statSync(path.join(OUT, dst)).size, 'bytes');
}
