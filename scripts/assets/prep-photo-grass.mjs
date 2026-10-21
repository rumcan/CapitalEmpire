// Bundle the Paint tool's photo textures (textures.ts PHOTO_TEX, mosaic()): every generated ground photo in art/grass-photo, plus the concrete and the three golf grasses.
// Reads each master from the masters dir given as the first arg (default art/grass-photo under the repo root),
// writes src/assets/ground/paint-photo-*.webp at each master's native size (no resizing: the mosaic and the mip chain do the scaling,
// so a painted area scaled up to 4x keeps the photo's detail), and prints each one's size and mean colour (hex, the Paint panel swatch in paint.ts).
// The first four are quality 92; the generated photos are quality 90.
// src/game/grass-art.ts imports the webps.
//   node scripts/assets/prep-photo-grass.mjs [mastersDir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'src/assets/ground');
const MASTERS = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'art/grass-photo');
/** the generated ground photos, by master name (art/grass-photo/<name>.png) */
const GENERATED = ['asphalt-worn', 'road-gravel', 'dirt', 'field', 'grass', 'lawn-lush', 'lawn-worn', 'lawn-clover', 'golf-green', 'meadow-lush', 'meadow-flowers',
  'golf-fringe', 'golf-tee', 'golf-first-cut', 'golf-fescue', 'bunker-sand', 'waste-sand', 'pine-straw', 'bark-mulch', 'spectator-path', 'wood-chips',
  // the owner's photos of 2026-10-21 (output/grass): the new textures (the replacements overwrite their masters above)
  'grass-dry', 'asphalt', 'asphalt-patched', 'gravel', 'chip-seal', 'concrete-stained', 'concrete-cracked', 'concrete-old', 'concrete-weathered', 'water', 'water-deep', 'water-clear'];
const JOBS = [
  { src: 'fairway.png', dst: 'paint-photo-fairway.webp', q: 92 },
  { src: 'fairway-sod.png', dst: 'paint-photo-fairway-sod.webp', q: 92 },
  { src: 'rough.png', dst: 'paint-photo-rough.webp', q: 92 },
  { src: 'concrete.png', dst: 'paint-photo-concrete.webp', q: 92 },
  ...GENERATED.map(n => ({ src: n + '.png', dst: `paint-photo-${n}.webp`, q: 90 })),
];

fs.mkdirSync(OUT, { recursive: true });
for (const j of JOBS) {
  await sharp(path.join(MASTERS, j.src)).webp({ quality: j.q }).toFile(path.join(OUT, j.dst));
  const { width, height } = await sharp(path.join(OUT, j.dst)).metadata();
  const { channels } = await sharp(path.join(OUT, j.dst)).stats();
  const hex = channels.slice(0, 3).map(c => Math.round(c.mean).toString(16).padStart(2, '0')).join('');
  console.log(j.dst, `${width}x${height}`, fs.statSync(path.join(OUT, j.dst)).size, 'bytes', '#' + hex);
}
