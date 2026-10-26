// Crops the v2 surface swatches from the v2 captures (today's painted grass, #194), so the mockups' discs show what the game draws.
//   node docs/plans/P23-ux/mockups/swatches-v2.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url)), IN = process.env.OUT || 'E:/ClaudeTemp/ux/v2', OUT = path.join(HERE, 'tex2');
fs.mkdirSync(OUT, { recursive: true });
// [name, capture, left, top, size]
const crops = [
  ['fairway', '1600-grown-30-bg', 760, 400, 140],
  ['green', '1600-green-30-bg', 850, 385, 80],
  ['rough', '1600-grown-17-bg', 1250, 110, 100],
  ['grass', '1600-grown-30-bg', 140, 260, 140],
  ['dirt', '1600-built-17-bg', 500, 560, 100],
];
for (const [name, cap, left, top, size] of crops) {
  await sharp(path.join(IN, cap + '.png')).extract({ left, top, width: size, height: size }).resize(160, 160).webp({ quality: 78 }).toFile(path.join(OUT, name + '.webp'));
  console.log(name);
}
// the surfaces with no painted capture yet keep v1's photo swatches (tee, bunker, water)
for (const n of ['tee', 'bunker', 'water', 'path', 'dirt', 'concrete', 'gravel']) {
  const src = path.join(HERE, 'tex', n + '.webp'), dst = path.join(OUT, n === 'dirt' ? 'dirtpath.webp' : n + '.webp');
  if (fs.existsSync(src)) fs.copyFileSync(src, dst);
}
console.log('done');
