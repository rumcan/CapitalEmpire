// T233 (#674, the concept's build panel, docs/art/CONCEPT-LOOK.md step 10): cuts the build tool tiles sheet (art 174,
// art/theme-consistency/generated/ui/golf-build-tool-tiles-sheet-v1.png: twelve small isometric scenes on dark navy rounded tiles, 4 x 3 on a
// charcoal sheet, no lettering) into one square WebP per tile in src/assets/ui/tiles/, named by NAMES (row by row, left to right). Each tile is
// found on the sheet (the pixels that are not the charcoal ground), cut to its own box, its rounded corners made clear, and scaled to SIZE px
// (twice the flyouts' 72 px picture, so it stays sharp at 125% UI scale and on a 2x screen). ui/tool-tiles.ts names the tools each one shows on.
// Run: node scripts/assets/prep-ui-tool-tiles.mjs [sheet.png]
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SRC = process.argv[2] ?? 'art/theme-consistency/generated/ui/golf-build-tool-tiles-sheet-v1.png', OUT = 'src/assets/ui/tiles', SIZE = 144;
const NAMES = [
  ['tee', 'fairway', 'green', 'bunker'],
  ['pond', 'rough', 'trees', 'rocks'],
  ['cart-path', 'clubhouse', 'range-bays', 'flower-bed'],
];

const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;
// the sheet's ground: its top left pixel (the charcoal #1C1F26); a tile is anything clearly off it (the navy #1E2A44 is bluer by ~25)
const g = [data[0], data[1], data[2]];
const on = (x, y) => { const i = (y * W + x) * C; return Math.abs(data[i] - g[0]) + Math.abs(data[i + 1] - g[1]) + Math.abs(data[i + 2] - g[2]) > 24; };
/** the runs of a along [0, n) where more than a fifth of the m pixels across are on */
function bands(n, m, hit) {
  const out = []; let in_ = false, s = 0;
  for (let a = 0; a <= n; a++) {
    let c = 0; if (a < n) for (let b = 0; b < m; b++) if (hit(a, b)) c++;
    const yes = c > m / 5;
    if (yes && !in_) { in_ = true; s = a; } else if (!yes && in_) { in_ = false; if (a - s > 40) out.push([s, a]); }
  }
  return out;
}
const rows = bands(H, W, (y, x) => on(x, y)), cols = bands(W, H, (x, y) => on(x, y));
if (rows.length !== NAMES.length || cols.length !== NAMES[0].length) throw new Error(`expected a ${NAMES[0].length} x ${NAMES.length} grid, found ${cols.length} x ${rows.length}`);
mkdirSync(OUT, { recursive: true });
let n = 0;
for (const [r, [y0, y1]] of rows.entries()) for (const [c, [x0, x1]] of cols.entries()) {
  // the tile's box, a pixel in from its soft edge, made square; its corners clear (the sheet's tiles are rounded by about 12% of a side)
  const side = Math.min(x1 - x0, y1 - y0) - 2, left = x0 + Math.round((x1 - x0 - side) / 2), top = y0 + Math.round((y1 - y0 - side) / 2);
  const rad = Math.round(SIZE * 0.12);
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><rect width="${SIZE}" height="${SIZE}" rx="${rad}" ry="${rad}" fill="#fff"/></svg>`);
  await sharp(SRC).extract({ left, top, width: side, height: side }).resize(SIZE, SIZE, { kernel: 'lanczos3' }).ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .webp({ quality: 82, alphaQuality: 90, effort: 6 }).toFile(`${OUT}/${NAMES[r][c]}.webp`);
  n++;
}
console.log(`${n} tiles -> ${OUT} (${SIZE} px)`);
