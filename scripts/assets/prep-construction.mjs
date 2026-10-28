// Pack the owner's building-site art (2026-10-21: a digger and sixteen construction materials, art/construction/*.png on transparent
// backgrounds) into its own supplemental atlas page, the way prep-cars.mjs packs the cars.
//   materials-sheet.png: a 4 x 4 grid, read row by row (MATERIALS below);
//   digger-sheet.png: four views in a 2 x 2 grid; only the bottom-right one is drawn in the game's isometric view (the side, front and
//   back views are straight on, never used on lots), so only it is packed. It faces +X (its arm reaches down-right); flipped it faces +Y.
//   site-kit/ (T232): the building-site kit's masters and items.json (prep-site-kit.mjs: lumber stacks, heaps, the timber frame's two
//   views), packed after the digger with the display size and ground point the kit gives.
// Footprints hx / hy are half extents in metres; world coordinates use 2 m tiles. Native projection is 64 x 32 px per tile, so a
// sprite's native width is 64 * (hx + hy) and its height follows the picture's aspect. Writes src/assets/construction/construction-<mip>.webp
// and src/game/construction-library.ts (appendConstruction, after the business art).
//   node scripts/assets/prep-construction.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(root, 'art/construction'), out = path.join(root, 'src/assets/construction');
fs.mkdirSync(out, { recursive: true });
/** the materials sheet's cells, row by row: id, name, half extents (m: hx along X, hy along Y; the long bundles lie along Y) */
const MATERIALS = [
  ['timber-stack', 'Timber stack', 0.5, 1.4], ['brick-pallet', 'Pallet of bricks', 0.6, 0.55], ['block-pallet', 'Pallet of cinder blocks', 0.6, 0.55], ['roof-tile-pallet', 'Pallet of roof tiles', 0.6, 0.55],
  ['gravel-pile', 'Gravel pile', 1.0, 1.0], ['sand-pile', 'Sand pile', 1.0, 1.0], ['cement-bag-pallet', 'Pallet of cement bags', 0.6, 0.55], ['tile-crate', 'Crate of tiles', 0.6, 0.6],
  ['pipe-bundle', 'Bundle of steel pipes', 0.5, 1.5], ['steel-beams', 'Stack of steel beams', 0.5, 1.7], ['rebar-bundle', 'Bundle of rebar', 0.45, 1.7], ['pallet-stack', 'Stack of empty pallets', 0.6, 0.55],
  ['stone-pallet', 'Pallet of stone blocks', 0.6, 0.55], ['mortar-tools', 'Mortar bucket and tools', 0.6, 0.55], ['lumber-stack', 'Lumber stack', 0.5, 1.4], ['mesh-rolls', 'Rolls of wire mesh', 0.6, 0.6],
];
/** Label the whole sheet before assigning shapes to cells: artwork may cross the nominal grid lines. */
async function readSheet(file, cols, rows) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, labels = new Int32Array(W * H).fill(-1), stack = new Int32Array(W * H), components = [], cells = Array(cols * rows).fill(null);
  for (let start = 0; start < labels.length; start++) {
    if (labels[start] >= 0 || data[start * 4 + 3] <= 8) continue;
    const id = components.length; let pending = 1, size = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
    stack[0] = start; labels[start] = id;
    while (pending) {
      const p = stack[--pending], px = p % W, py = Math.floor(p / W); size++;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = px + dx, y = py + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const q = y * W + x;
        if (labels[q] < 0 && data[q * 4 + 3] > 8) { labels[q] = id; stack[pending++] = q; }
      }
    }
    const component = { id, size, left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
    components.push(component);
    const cell = Math.floor((y0 + y1) / 2 * rows / H) * cols + Math.floor((x0 + x1) / 2 * cols / W);
    if (!cells[cell] || size > cells[cell].size) cells[cell] = component;
  }
  for (let cell = 0; cell < cells.length; cell++) if (!cells[cell] || cells[cell].size < 1000) throw new Error(`${file}: missing artwork in cell ${cell}`);
  return { data, W, labels, cells };
}
/** Preserve the chosen component's original RGBA; remove detached flecks and every neighbouring shape. */
async function cut(sheet, cell) {
  const b = sheet.cells[cell], rgba = Buffer.alloc(b.width * b.height * 4);
  for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) {
    const p = (b.top + y) * sheet.W + b.left + x;
    if (sheet.labels[p] === b.id) sheet.data.copy(rgba, (y * b.width + x) * 4, p * 4, p * 4 + 4);
  }
  return sharp(rgba, { raw: { width: b.width, height: b.height, channels: 4 } }).png().toBuffer();
}

const materials = await readSheet(path.join(SRC, 'materials-sheet.png'), 4, 4), digger = await readSheet(path.join(SRC, 'digger-sheet.png'), 2, 2);
const pieces = [];
for (const [k, [id, name, hx, hy]] of MATERIALS.entries()) {
  pieces.push({ id: `construction:${id}`, name, hx, hy, png: await cut(materials, k), big: false });
}
// the digger: about 6 m across its tracks and arm along X, 3 m wide
pieces.push({ id: 'construction:digger', name: 'Digger (excavator)', hx: 3.0, hy: 1.5, png: await cut(digger, 3), big: true });
// T232: the building-site kit (lumber stacks, heaps, the timber frame's two views), cut and sized by prep-site-kit.mjs into
// art/construction/site-kit: packed after the digger, so the pieces above keep their place on the page (and their UVs); their display size,
// ground point and footprint are the kit's own (items.json)
const KIT_DIR = path.join(SRC, 'site-kit'), kit = JSON.parse(fs.readFileSync(path.join(KIT_DIR, 'items.json'), 'utf8')).items;
for (const k of kit) {
  pieces.push({ id: k.id, name: k.name, hx: k.boxes[0].hx, hy: k.boxes[0].hy, png: await sharp(path.join(KIT_DIR, `${k.id.slice('construction:'.length)}.webp`)).png().toBuffer(), big: k.big, geo: k });
}

// Shelf-pack at 0.6 x native with 16 px gutters and five mips. The renderer requires every array layer to be 2048 square.
const GUT = 16, items = [], composite = [], review = path.join(root, 'output/construction-review');
fs.mkdirSync(review, { recursive: true });
for (const p of pieces) {
  const meta = await sharp(p.png).metadata();
  p.w = p.geo ? p.geo.w : 64 * (p.hx + p.hy); p.h = p.geo ? p.geo.h : p.w * meta.height / meta.width;
  p.width = Math.round(p.w * 0.6); p.height = Math.round(p.h * 0.6);
  await sharp(p.png).toFile(path.join(review, `${p.id.slice('construction:'.length)}.png`));
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
if (!fits(PAGE)) throw new Error('Construction art exceeds the 2048 atlas page (oversized item or page overflow)');
let x = GUT, y = GUT, rowH = 0;
for (const p of pieces) {
  const { w, h, width, height } = p;
  if (x + width + GUT > PAGE) { x = GUT; y += rowH + GUT; rowH = 0; }
  if (width + 2 * GUT > PAGE || y + height + GUT > PAGE) throw new Error(`Atlas overflow packing ${p.id}`);
  composite.push({ input: await sharp(p.png).resize(width, height, { kernel: 'lanczos3' }).sharpen({ sigma: 0.5 }).png().toBuffer(), left: x, top: y });
  // Ground point is the footprint diamond's centre at the picture's foot; projection is 32 px per 2 m tile vertically.
  const groundH = 32 * (p.hx + p.hy);
  items.push({ id: p.id, name: p.name, cat: 'Construction', kind: 'decor', w, h, ax: p.geo ? p.geo.ax : w / 2, ay: p.geo ? p.geo.ay : h - groundH / 2, boxes: [{ hx: p.hx, hy: p.hy, dx: 0, dy: 0 }], solid: 2, big: p.big, door: false, cost: 0,
    tex: [0, x / PAGE, y / PAGE, (x + width) / PAGE, (y + height) / PAGE], quad: [0, 0, w, h] });
  x += width + GUT; rowH = Math.max(rowH, height);
}
const full = await sharp({ create: { width: PAGE, height: PAGE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(composite).png().toBuffer();
for (let mip = 0; mip < 5; mip++) await sharp(full).resize(PAGE >> mip, PAGE >> mip).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(out, `construction-${mip}.webp`));
// Ignored review artifacts: full-resolution individual cutouts and an enlarged atlas showing the final packed pixels.
await sharp(full).extract({ left: 0, top: 0, width: x + GUT, height: y + rowH + GUT }).resize((x + GUT) * 4, (y + rowH + GUT) * 4, { kernel: 'nearest' }).flatten({ background: '#d8e0e3' }).png().toFile(path.join(review, 'atlas-4x.png'));
const contact = [];
for (const [i, p] of pieces.entries()) {
  const thumb = await sharp(p.png).resize(360, 330, { fit: 'inside' }).png().toBuffer(), meta = await sharp(thumb).metadata(), left = (i % 4) * 400, top = Math.floor(i / 4) * 400;
  contact.push({ input: thumb, left: left + Math.floor((400 - meta.width) / 2), top: top + Math.floor((350 - meta.height) / 2) });
  contact.push({ input: Buffer.from(`<svg width="400" height="40"><text x="200" y="25" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#172a32">${p.name}</text></svg>`), left, top: top + 350 });
}
await sharp({ create: { width: 1600, height: Math.ceil(pieces.length / 4) * 400, channels: 4, background: '#d8e0e3' } }).composite(contact).png().toFile(path.join(review, 'contact.png'));
fs.writeFileSync(path.join(root, 'src/game/construction-library.ts'), [
  '// Generated by scripts/assets/prep-construction.mjs. Source images are retained in art/construction.',
  "import type { LibItem } from './types';",
  "import { REMOVED_IDS } from './lots/scales';",
  'const removed = new Set(REMOVED_IDS);',
  ...Array.from({ length: 5 }, (_, i) => `import m${i} from '../assets/construction/construction-${i}.webp';`),
  `const ITEMS: LibItem[] = ${JSON.stringify(items)};`,
  '/** Append after the business art, preserving every existing saved item index. */',
  'export function appendConstruction(library: LibItem[], pages: string[][]) {',
  '  const page = pages.length; pages.push([m0, m1, m2, m3, m4]);',
  '  for (const item of ITEMS) if (!removed.has(item.id)) library.push({ ...item, tex: [page, ...item.tex.slice(1)] as LibItem["tex"] });',
  '}', ''
].join('\n'));
console.log(`Prepared ${items.length} construction sprites on one ${PAGE} x ${PAGE} supplemental page (rows to y ${y + rowH}); cutouts and contact sheet: ${review}.`);
