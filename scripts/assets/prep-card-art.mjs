// T336 (#962), #1286: the cards' paintings, each cut to a small WebP in src/assets/cards/<key>.webp, where the card (golf/cards/catalogue.ts `art`) and the vending machine
// find it. A card whose painting is missing falls back to a drawn glyph (ui/golf/CardArt.tsx). Two sources:
//   treats: TrickOrTreat's treat paintings (read-only art and idea source, with the owner's permission: "lets steal art from trickorTreat"); nothing is written there
//     node scripts/assets/prep-card-art.mjs [--src F:/Repos/TrickOrTreat/public/assets/treats] [--only masher,yoyo]
//   sheets (#1286): four ChatGPT sheets of twelve paintings each (3 across, 4 down, 16:9 cells on #120B1C, thin black gaps; prompts in
//     F:/ClaudeTemp/jam/queue-card-art.json). The cells are found by the black gaps, trimmed and cut to 16:9; a labelled contact sheet is written to check them by eye
//     node scripts/assets/prep-card-art.mjs --sheets [--sheet-dir D:/AI/chatgpt-bridge/in] [--contact F:/ClaudeTemp/jam/card-art/contact.png] [--only wonder-wedge]
import sharp from 'sharp';
import { mkdirSync, existsSync, statSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

/** the card art key -> the treat painting it comes from (TrickOrTreat's public/assets/treats/<file>.webp) */
export const PICKS = {
  masher: 'masher',     // Power Mash: a button-masher's controller
  batteries: 'batteries', // Range Rat: a Walkman at the range
  yoyo: 'yoyo',         // Trick Shot: a yo-yo (T337)
};
/** #1286: each sheet's twelve cells, row by row, left to right: the key each is written as (a card's id; `machine`: the Prize Machine itself) */
export const SHEETS = {
  'card-art-sheet-1view-c1.png': ['wonder-wedge', 'overspeed-sticks', 'lucky-marker', 'lead-tape', 'arm-lock', 'broomstick',
    'swing-hoop', 'mid-flight-whisper', 'hybrid-hero', 'tour-van-fitting', 'long-drive-shaft', 'flatstick'],
  'card-art-sheet-1view-c2.png': ['launch-monitor', 'pro-in-a-bottle', 'hot-driver', 'putting-mirror', 'routine-card', 'tall-tees',
    'hackout-boots', 'weighted-donut', 'yardage-book', 'persimmon', 'tour-balls', 'rocket-balls'],
  'card-art-sheet-1view-c3.png': ['bunker-rake', 'laser-rangefinder', 'fairway-finder', 'cold-beer', 'lesson-book', 'gamblers-dice',
    'slow-mo-app', 'speed-nerd', 'wind-whisperer', 'slope-mode', 'pace-robot', 'mic-caddie'],
  'card-art-sheet-1view-c4.png': ['skins-hustler', 'deck-driver', 'scramble-captain', 'sponsor-tent', 'carbon-bag', 'putter-whisperer',
    'read-the-feet', 'snowman-eraser', 'self-correcting-ball', 'ace-magnet', 'clutch-gene', 'machine'],
};
// 16:9, 320 px wide: a tile's picture at 2x and the card's detail at 1x
export const W = 320, H = 180;
const COLS = 3, ROWS = 4;

/** the spans between the dark gap bands along one axis: `dark[i]` is the share of line i's pixels that are near-black; a band is a run of lines mostly dark.
 *  The `n` spans of a plausible size are the cells (with an outer border or without), in order, each `inset` px in from its gaps; throws if there are not `n` */
export function cellSpans(dark, n, { band = 0.6, inset = 2 } = {}) {
  const spans = []; let st = 0;
  for (let i = 0; i <= dark.length; i++) {
    const gap = i === dark.length || dark[i] > band;
    if (gap) { if (i > st) spans.push([st, i - 1]); st = i + 1; }
  }
  const min = (dark.length / n) * 0.5, big = spans.filter(([a, b]) => b - a + 1 >= min);
  if (big.length !== n) throw new Error(`expected ${n} cells along an axis of ${dark.length} px, found ${big.length} (spans ${JSON.stringify(spans)})`);
  return big.map(([a, b]) => [a + inset, b - inset]);
}

/** a sheet's cells as { left, top, width, height } (row by row), found by its black gaps: a pixel is gap-dark when no channel reaches `lum` (the cells' ground is #120B1C) */
export async function sheetCells(file, { lum = 10 } = {}) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info, col = new Float64Array(w), row = new Float64Array(h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * c;
    if (Math.max(data[i], data[i + 1], data[i + 2]) < lum) { col[x]++; row[y]++; }
  }
  const xs = cellSpans(Array.from(col, v => v / h), COLS), ys = cellSpans(Array.from(row, v => v / w), ROWS), out = [];
  for (const [t, b] of ys) for (const [l, r] of xs) out.push({ left: l, top: t, width: r - l + 1, height: b - t + 1 });
  return out;
}

/** a cell trimmed to its centred 16:9 content */
export function to169({ left, top, width, height }) {
  if (width / height > 16 / 9) { const w = Math.round(height * 16 / 9); return { left: left + Math.floor((width - w) / 2), top, width: w, height }; }
  const h = Math.round(width * 9 / 16); return { left, top: top + Math.floor((height - h) / 2), width, height: h };
}

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
/** a labelled grid of the cut pictures, to check by eye that each shows its card */
async function contactSheet(items, to) {
  const per = 6, lab = 22, cw = W, ch = H + lab, rows = Math.ceil(items.length / per);
  const comps = await Promise.all(items.map(async ({ file, label }, i) => {
    const x = (i % per) * cw, y = Math.floor(i / per) * ch;
    const text = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${lab}"><rect width="100%" height="100%" fill="#000"/><text x="6" y="16" font-family="Segoe UI, Arial" font-size="14" fill="#fff">${esc(label)}</text></svg>`);
    return [{ input: await sharp(file).toBuffer(), left: x, top: y + lab }, { input: text, left: x, top: y }];
  }));
  mkdirSync(dirname(to), { recursive: true });
  await sharp({ create: { width: per * cw, height: rows * ch, channels: 3, background: '#222' } }).composite(comps.flat()).png().toFile(to);
  console.log(`contact sheet ${to}`);
}

async function main() {
  const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
  const only = opt('only', '') ? opt('only', '').split(',') : null, out = 'src/assets/cards';
  mkdirSync(out, { recursive: true });
  if (args.includes('--sheets')) {
    const dir = opt('sheet-dir', 'D:/AI/chatgpt-bridge/in'), contact = opt('contact', 'F:/ClaudeTemp/jam/card-art/contact.png'), done = [];
    // the card names, for the contact sheet's labels (the catalogue is TypeScript: its ids and names read as text)
    const names = new Map([...readFileSync('src/game/golf/cards/catalogue.ts', 'utf8').matchAll(/\{ id: '([^']+)', name: '([^']+)'/g)].map(m => [m[1], m[2]]));
    for (const [sheet, keys] of Object.entries(SHEETS)) {
      const from = join(dir, sheet);
      if (!existsSync(from)) { console.error(`missing ${from}`); process.exitCode = 1; continue; }
      const cells = await sheetCells(from);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (only && !only.includes(key)) continue;
        const to = join(out, `${key}.webp`);
        await sharp(from).extract(to169(cells[i])).resize(W, H, { fit: 'fill' }).webp({ quality: 78 }).toFile(to);
        console.log(`${to}  ${(statSync(to).size / 1024).toFixed(1)} KB  (${sheet} cell ${i + 1})`);
        done.push({ file: to, label: `${sheet.match(/c\d/)[0]}.${i + 1} ${key}: ${names.get(key) ?? 'the Prize Machine'}` });
      }
    }
    if (done.length) await contactSheet(done, contact);
    return;
  }
  const src = opt('src', 'F:/Repos/TrickOrTreat/public/assets/treats');
  for (const [key, file] of Object.entries(PICKS)) {
    if (only && !only.includes(key)) continue;
    const from = join(src, `${file}.webp`);
    if (!existsSync(from)) { console.error(`missing ${from}`); process.exitCode = 1; continue; }
    const to = join(out, `${key}.webp`);
    await sharp(from).resize(W, H, { fit: 'cover', position: 'centre' }).webp({ quality: 78 }).toFile(to);
    console.log(`${to}  ${(statSync(to).size / 1024).toFixed(1)} KB`);
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
