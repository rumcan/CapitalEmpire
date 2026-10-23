/** Assemble four independently generated RGBA views without changing their artwork. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [category, slug, version = 'v1'] = process.argv.slice(2);
if (!category || !slug || !/^v\d+$/.test(version)) {
  throw Error('Usage: node scripts/assets/assemble-theme-consistency.mjs <category> <slug> [vN]');
}

const base = path.join('art', 'theme-consistency', 'generated', category);
const source = path.join(base, `${slug}-singles`);
const out = path.join(base, `${slug}-4views-${version}.png`);
const directions = ['NE', 'SE', 'SW', 'NW'];
const cell = 1024;
const spriteWidth = 720;
const composites = [];
const report = [];

for (const [index, direction] of directions.entries()) {
  const file = path.join(source, `${direction}.png`);
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw Error(`${file}: expected RGBA PNG`);

  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] <= 8) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left) throw Error(`${file}: no visible subject`);
  const width = right - left + 1;
  const height = bottom - top + 1;
  const resized = await sharp(file)
    .extract({ left, top, width, height })
    .resize({ width: spriteWidth, height: spriteWidth, fit: 'inside' })
    .png()
    .toBuffer({ resolveWithObject: true });
  const x = (index % 2) * cell + Math.floor((cell - resized.info.width) / 2);
  const y = Math.floor(index / 2) * cell + Math.floor((cell - resized.info.height) / 2);
  composites.push({ input: resized.data, left: x, top: y });
  report.push({ direction, file, sourceBounds: { left, top, width, height },
    sourceTouchesCanvas: left === 0 || top === 0 || right === info.width - 1 || bottom === info.height - 1,
    sheetBounds: { left: x, top: y, width: resized.info.width, height: resized.info.height } });
}

await fs.mkdir(base, { recursive: true });
await sharp({ create: { width: cell * 2, height: cell * 2, channels: 4, background: '#00000000' } })
  .composite(composites)
  .png()
  .toFile(out);
console.log(JSON.stringify({ out, views: report }, null, 2));
