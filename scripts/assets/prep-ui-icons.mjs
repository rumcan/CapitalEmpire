// Cuts the owner's UI icon sheet (docs/ui/icon-sheet.webp: gold-on-charcoal icons on a transparent ground, 6 rows) into one
// trimmed, square 64 px WebP per icon in src/assets/ui/icons/, named by NAMES (row by row, left to right).
// Run: node scripts/assets/prep-ui-icons.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SRC = 'docs/ui/icon-sheet.webp', OUT = 'src/assets/ui/icons', SIZE = 64;
const NAMES = [
  ['leaf', 'road', 'house', 'junction', 'bulldozer', 'bus', 'power', 'civic'],
  ['tree', 'buildings', 'bank', 'people', 'briefcase', 'sun', 'income', 'gear'],
  ['trophy', 'calendar', 'info', 'compass', 'terrain', 'layers', 'chart', 'camera'],
  ['pause', 'play', 'fast', 'skip', 'rewind', 'start', 'zoom-in', 'zoom-out'],
  ['pin', 'oneway', 'trees', 'sidewalk', 'forest', 'road-edge', 'hills', 'fullscreen'],
  ['help', 'up', 'down', 'left', 'right', 'back2', 'forward2', 'swap', 'open', 'close'],
];

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, op = (x, y) => data[(y * W + x) * 4 + 3] > 40;
/** the runs of a along [0, n) where more than 2 of the m pixels across are opaque */
function bands(n, m, hit) {
  const out = []; let on = false, s = 0;
  for (let a = 0; a <= n; a++) {
    let c = 0; if (a < n) for (let b = 0; b < m; b++) if (hit(a, b)) c++;
    if (c > 2 && !on) { on = true; s = a; } else if (c <= 2 && on) { on = false; out.push([s, a]); }
  }
  return out;
}
const rows = bands(H, W, (y, x) => op(x, y));
if (rows.length !== NAMES.length) throw new Error(`expected ${NAMES.length} rows, found ${rows.length}`);
mkdirSync(OUT, { recursive: true });
let n = 0;
for (const [r, [y0, y1]] of rows.entries()) {
  const cols = bands(W, y1 - y0, (x, b) => op(x, y0 + b)).filter(([a, b]) => b - a > 8);
  if (cols.length !== NAMES[r].length) throw new Error(`row ${r + 1}: expected ${NAMES[r].length} icons, found ${cols.length}`);
  for (const [i, [x0, x1]] of cols.entries()) {
    // trim to the icon's own rows inside the band, pad to a square, scale to SIZE
    const w = x1 - x0, h = y1 - y0, side = Math.max(w, h) + 4;
    await sharp(SRC).extract({ left: x0, top: y0, width: w, height: h })
      .extend({ top: Math.floor((side - h) / 2), bottom: Math.ceil((side - h) / 2), left: Math.floor((side - w) / 2), right: Math.ceil((side - w) / 2), background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .resize(SIZE, SIZE).webp({ quality: 90, alphaQuality: 100 }).toFile(`${OUT}/${NAMES[r][i]}.webp`);
    n++;
  }
}
console.log(`${n} icons -> ${OUT}`);
