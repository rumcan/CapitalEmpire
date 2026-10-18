// The walkers' placeholder art (Phase 5 step 6): the first row (four walking frames) of three TrickOrTreat character sheets, cut into one
// strip of 12 cells of 32 x 32 px (hero 0 frames 0-3, hero 1, hero 2). TrickOrTreat is read-only: this reads its sheets and writes ours.
//   node scripts/assets/prep-walkers.mjs
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs';

const SRC = path.resolve('../TrickOrTreat/public/assets/characters');
const OUT = path.resolve('src/assets/characters/walkers.png');
/** the sheets (6 columns x 4 rows of cells), the frames of the first row taken, the cell size out */
const HEROES = ['hero_sam.png', 'hero_jess.png', 'hero_tommy.png'], FRAMES = 4, CELL = 32;

const cells = [];
for (const f of HEROES) {
  const img = sharp(path.join(SRC, f)), m = await img.metadata(), c = Math.round(m.width / 6);
  for (let k = 0; k < FRAMES; k++) {
    const buf = await sharp(path.join(SRC, f)).extract({ left: k * c, top: 0, width: c, height: c }).resize(CELL, CELL, { kernel: 'lanczos3' }).png().toBuffer();
    cells.push({ input: buf, left: cells.length * CELL, top: 0 });
  }
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
await sharp({ create: { width: CELL * cells.length, height: CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(cells).png().toFile(OUT);
console.log(`walkers: ${cells.length} cells of ${CELL} px -> ${path.relative(process.cwd(), OUT)}`);
