// Pack the golf-tournament art (art/golf/<id>.png, RGBA on transparent backgrounds, listed in art/golf/items.json) into its own
// supplemental atlas page, the way prep-construction.mjs packs the building-site art. Each master is one sprite: its largest connected
// piece and any 200+ px piece are kept (smaller detached specks are dropped), then it is trimmed to its alpha bounding box (alpha > 8).
// Items without a master yet are skipped. Footprints hx / hy are half extents in metres; world coordinates use 2 m tiles. Native
// projection is 64 x 32 px per tile, so a sprite's native width is 64 * (hx + hy) and its height follows the picture's aspect.
// Writes src/assets/golf/golf-<mip>.webp and src/game/golf-library.ts (appendGolf, after the construction art).
//   node scripts/assets/prep-golf.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { SCALE_OVERRIDES } from './overrides.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(root, 'art/golf'), out = path.join(root, 'src/assets/golf');
fs.mkdirSync(out, { recursive: true });
const { items: ITEMS_JSON } = JSON.parse(fs.readFileSync(path.join(SRC, 'items.json'), 'utf8'));
/** Label one master's connected pieces, keep the largest and every 200+ px piece, and trim to their alpha bounding box. */
async function readMaster(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, labels = new Int32Array(W * H).fill(-1), stack = new Int32Array(W * H), sizes = [];
  for (let start = 0; start < labels.length; start++) {
    if (labels[start] >= 0 || data[start * 4 + 3] <= 8) continue;
    const id = sizes.length; let pending = 1, size = 0;
    stack[0] = start; labels[start] = id;
    while (pending) {
      const p = stack[--pending], px = p % W, py = Math.floor(p / W); size++;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = px + dx, y = py + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const q = y * W + x;
        if (labels[q] < 0 && data[q * 4 + 3] > 8) { labels[q] = id; stack[pending++] = q; }
      }
    }
    sizes.push(size);
  }
  if (!sizes.length) throw new Error(`${file}: no artwork`);
  const largest = sizes.indexOf(Math.max(...sizes)), keep = sizes.map((s, i) => i === largest || s >= 200);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let p = 0; p < labels.length; p++) {
    if (labels[p] < 0 || !keep[labels[p]]) continue;
    const px = p % W, py = Math.floor(p / W);
    x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = (y0 + y) * W + x0 + x;
    if (labels[p] >= 0 && keep[labels[p]]) data.copy(rgba, (y * w + x) * 4, p * 4, p * 4 + 4);
  }
  return sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

const pieces = [];
for (const it of ITEMS_JSON) {
  const file = path.join(SRC, `${it.id}.png`);
  if (!fs.existsSync(file)) { console.log(`${it.id}: no master yet`); continue; }
  pieces.push({ id: `golf:${it.id}`, name: it.name, hx: it.hx, hy: it.hy, kind: it.kind, png: await readMaster(file) });
}

// Shelf-pack at 0.6 x native with 16 px gutters and five mips. The renderer requires every array layer to be 2048 square.
const GUT = 16, items = [], composite = [], review = path.join(root, 'output/golf-review');
fs.mkdirSync(review, { recursive: true });
for (const p of pieces) {
  const meta = await sharp(p.png).metadata();
  p.w = 64 * (p.hx + p.hy); p.h = p.w * meta.height / meta.width;
  // packed at 0.6 x the largest scale the game draws it at (the owner's studio size, when bigger), so nothing is stretched
  const k = 0.6 * Math.max(1, SCALE_OVERRIDES[p.id] ?? 1);
  p.width = Math.round(p.w * k); p.height = Math.round(p.h * k);
  await sharp(p.png).toFile(path.join(review, `${p.id.slice('golf:'.length)}.png`));
}
function fits(page) {
  let x = GUT, y = GUT, rowH = 0;
  for (const p of pieces) {
    if (p.width + 2 * GUT > page || p.height + 2 * GUT > page) return false;
    if (x + p.width + GUT > page) { x = GUT; y += rowH + GUT; rowH = 0; }
    if (y + p.height + GUT > page) return false;
    x += p.width + GUT; rowH = Math.max(rowH, p.height);
  }
  return true;
}
const PAGE = 2048;
if (!fits(PAGE)) throw new Error('Golf art exceeds the 2048 atlas page (oversized item or page overflow)');
let x = GUT, y = GUT, rowH = 0;
for (const p of pieces) {
  const { w, h, width, height } = p;
  if (x + width + GUT > PAGE) { x = GUT; y += rowH + GUT; rowH = 0; }
  if (width + 2 * GUT > PAGE || y + height + GUT > PAGE) throw new Error(`Atlas overflow packing ${p.id}`);
  composite.push({ input: await sharp(p.png).resize(width, height, { kernel: 'lanczos3' }).sharpen({ sigma: 0.5 }).png().toBuffer(), left: x, top: y });
  // Ground point is the footprint diamond's centre at the picture's foot; projection is 32 px per 2 m tile vertically.
  const groundH = 32 * (p.hx + p.hy);
  items.push({ id: p.id, name: p.name, cat: 'Golf tournament', kind: p.kind, w, h, ax: w / 2, ay: h - groundH / 2, boxes: [{ hx: p.hx, hy: p.hy, dx: 0, dy: 0 }], solid: 2, big: true, door: false, cost: 0,
    tex: [0, x / PAGE, y / PAGE, (x + width) / PAGE, (y + height) / PAGE], quad: [0, 0, w, h] });
  x += width + GUT; rowH = Math.max(rowH, height);
}
const full = await sharp({ create: { width: PAGE, height: PAGE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(composite).png().toBuffer();
for (let mip = 0; mip < 5; mip++) await sharp(full).resize(PAGE >> mip, PAGE >> mip).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(out, `golf-${mip}.webp`));
// Ignored review artifacts: full-resolution individual cutouts and an enlarged atlas showing the final packed pixels.
await sharp(full).extract({ left: 0, top: 0, width: x + GUT, height: y + rowH + GUT }).resize((x + GUT) * 4, (y + rowH + GUT) * 4, { kernel: 'nearest' }).flatten({ background: '#d8e0e3' }).png().toFile(path.join(review, 'atlas-4x.png'));
const contact = [];
for (const [i, p] of pieces.entries()) {
  const thumb = await sharp(p.png).resize(360, 330, { fit: 'inside' }).png().toBuffer(), meta = await sharp(thumb).metadata(), left = (i % 4) * 400, top = Math.floor(i / 4) * 400;
  contact.push({ input: thumb, left: left + Math.floor((400 - meta.width) / 2), top: top + Math.floor((350 - meta.height) / 2) });
  contact.push({ input: Buffer.from(`<svg width="400" height="40"><text x="200" y="25" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#172a32">${p.name}</text></svg>`), left, top: top + 350 });
}
await sharp({ create: { width: 1600, height: Math.max(1, Math.ceil(pieces.length / 4)) * 400, channels: 4, background: '#d8e0e3' } }).composite(contact).png().toFile(path.join(review, 'contact.png'));
fs.writeFileSync(path.join(root, 'src/game/golf-library.ts'), [
  '// Generated by scripts/assets/prep-golf.mjs. Source images are retained in art/golf.',
  "import type { LibItem } from './types';",
  "import { REMOVED_IDS } from './lots/scales';",
  'const removed = new Set(REMOVED_IDS);',
  ...Array.from({ length: 5 }, (_, i) => `import m${i} from '../assets/golf/golf-${i}.webp';`),
  `const ITEMS: LibItem[] = ${JSON.stringify(items)};`,
  '/** Append after the construction art, preserving every existing saved item index. */',
  'export function appendGolf(library: LibItem[], pages: string[][]) {',
  '  const page = pages.length; pages.push([m0, m1, m2, m3, m4]);',
  '  for (const item of ITEMS) if (!removed.has(item.id)) library.push({ ...item, tex: [page, ...item.tex.slice(1)] as LibItem["tex"] });',
  '}', ''
].join('\n'));
console.log(`Prepared ${items.length} golf sprites on one ${PAGE} x ${PAGE} supplemental page (rows to y ${y + rowH}); cutouts and contact sheet: ${review}.`);
