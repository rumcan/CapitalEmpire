// The owner's new generated props (the manifest's sheets in art/new-props/manifest.json, pictures in the owner's "All Generated Images" folder,
// read only): each sheet is cut into its four items by their subjects (axis-cells.mjs cutSheet), each item keeps its largest connected piece and
// every 200+ px piece (smaller specks are dropped), and is trimmed to its alpha bounding box (alpha > 8), as prep-golf.mjs does. Masters go to
// art/new-props/<slug>.webp (quality 95, alpha kept) and their list to art/new-props/items.json ({ items }: id, name, cat, hx, hy, sheet, cell,
// rect, w, h). Footprints hx / hy are half extents in metres (a first guess, from the manifest); the native projection is 64 x 32 px per 2 m
// tile, so an item's native width is 64 * (hx + hy) and its height follows the picture's aspect.
// Every item is a plain placeable decor prop (kind 'decor', no scatter; cat 'New: <manifest cat>'). The items are shelf-packed at 0.6 x native (times
// the owner's studio size when bigger) onto as many 2048 atlas pages as they need (src/assets/new-props/new-props-<page>-<mip>.webp, five mips
// each, as prep-golf writes its page), and src/game/new-props-library.ts lists them: appendNewProps appends their pages and items after every other
// library (no saved index moves). The contact sheet of every cut is output/new-props-review/contact.jpg.
//   node scripts/assets/prep-new-props.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { cutSheet, exact } from './axis-cells.mjs';
import { SCALE_OVERRIDES } from './overrides.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(root, 'art/new-props'), OUT = path.join(root, 'src/assets/new-props'), GAME = path.join(root, 'src/game/new-props-library.ts');
const review = path.join(root, 'output/new-props-review');
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
const KEYS = ['a', 'b', 'c', 'd'], CELLS = ['top left', 'top right', 'bottom left', 'bottom right'];
const PAGE = 2048, GUT = 16, MIPS = 5;
/** the library's price by manifest category ($): decor 50, stalls and tents 500, structures 1500, vehicles 800 */
const COST = { 'Trees': 50, 'Course props': 50, 'People': 50, 'Seating': 50, 'Stalls': 500, 'Stalls (shabby)': 500, 'Event structures': 500, 'Event structures (shabby)': 500, 'Lake props': 500, 'Vehicles': 800, 'Buildings': 1500, 'Range': 1500, 'Media': 1500 };
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/** the largest connected piece of a cut view and every 200+ px piece, trimmed to their alpha bounding box (alpha > 8): PNG bytes (prep-golf's readMaster) */
async function clean(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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
  if (!sizes.length) throw new Error('no artwork');
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

fs.mkdirSync(DIR, { recursive: true }); fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(review, { recursive: true });
const items = [], failures = [], warnings = [], slugs = new Set();
for (const s of manifest.sheets) {
  if (!s.names || s.names.length !== 4) { failures.push(`${s.sheet}: manifest lists ${s.names?.length ?? 0} names`); continue; }
  if (!(s.cat in COST)) throw new Error(`${s.sheet}: no cost for category "${s.cat}"`);
  const sheet = fs.readFileSync(path.join(manifest.source, s.sheet));
  let cut, mode = 'subject';
  try { cut = await cutSheet(sheet, KEYS); }
  catch (e) {
    // fallback: the sheet's four half cells, each cleaned as an item (flagged cut: 'cell' in items.json; check them on the contact sheet)
    mode = 'cell'; failures.push(`${s.sheet} (${s.cat}): subject cut failed (${e.message}); cut by its half cells`);
    const { width: W, height: H } = await sharp(sheet).metadata(), cw = Math.floor(W / 2), ch = Math.floor(H / 2);
    cut = { views: {}, rects: {}, crossed: [] };
    for (const [i, k] of KEYS.entries()) {
      const col = i % 2, row = Math.floor(i / 2), rect = { left: col * cw, top: row * ch, width: col ? W - cw : cw, height: row ? H - ch : ch };
      cut.rects[k] = rect; cut.views[k] = await exact(sheet, rect);
    }
  }
  if (mode === 'subject' && cut.crossed.length) warnings.push(`${s.sheet} (${s.cat}): subject crosses its half cell: ${cut.crossed.map(k => s.names[KEYS.indexOf(k)]).join(', ')}`);
  for (const [i, name] of s.names.entries()) {
    const k = KEYS[i], base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let slug = base, n = 1; while (slugs.has(slug)) slug = `${base}-${++n}`; slugs.add(slug);
    let png;
    try { png = await clean(cut.views[k]); } catch (e) { failures.push(`${s.sheet} ${name}: ${e.message}`); continue; }
    const meta = await sharp(png).metadata(), w = 64 * (s.hx + s.hx), h = w * meta.height / meta.width, r = cut.rects[k];
    await sharp(png).webp({ quality: 95, alphaQuality: 100 }).toFile(path.join(DIR, `${slug}.webp`));
    items.push({ id: `newprop:${slug}`, name, cat: `New: ${s.cat}`, hx: s.hx, hy: s.hx, sheet: s.sheet, cell: CELLS[i], rect: [r.left, r.top, r.width, r.height], ...(mode === 'cell' ? { cut: 'cell' } : {}), w: round(w), h: round(h), png });
  }
}
fs.writeFileSync(path.join(DIR, 'items.json'), JSON.stringify({ items: items.map(({ png, ...it }) => it) }, null, 1) + '\n');

// shelf-pack at 0.6 x the display size (the owner's studio size when bigger), tallest first, 16 px gutters, as many pages as needed
const pages = [];
let page = null;
const newPage = () => { page = { n: pages.length, x: GUT, y: GUT, rowH: 0, inputs: [] }; pages.push(page); };
newPage();
const sized = items.map((it, idx) => {
  const k = 0.6 * Math.max(1, SCALE_OVERRIDES[it.id] ?? 1), width = Math.max(1, Math.round(it.w * k)), height = Math.max(1, Math.round(it.h * k));
  if (width + 2 * GUT > PAGE || height + 2 * GUT > PAGE) throw new Error(`${it.id} is larger than an atlas page`);
  return { it, idx, width, height };
}).sort((a, b) => b.height - a.height || a.idx - b.idx);
for (const p of sized) {
  if (page.x + p.width + GUT > PAGE) { page.x = GUT; page.y += page.rowH + GUT; page.rowH = 0; }
  if (page.y + p.height + GUT > PAGE) newPage();
  if (page.x + p.width + GUT > PAGE) { page.x = GUT; page.y += page.rowH + GUT; page.rowH = 0; }
  p.page = page.n; p.x = page.x; p.y = page.y;
  page.inputs.push(p);
  page.x += p.width + GUT; page.rowH = Math.max(page.rowH, p.height);
}
// the packed rects, then the pages: each a 2048 square, five mips (prep-golf's mip levels)
for (const f of fs.readdirSync(OUT)) if (/^new-props-\d+-\d\.webp$/.test(f)) fs.unlinkSync(path.join(OUT, f));
const byId = new Map(sized.map(p => [p.it.id, p]));
for (const pg of pages) {
  const composite = [];
  for (const p of pg.inputs) composite.push({ input: await sharp(p.it.png).resize(p.width, p.height, { kernel: 'lanczos3', fit: 'fill' }).sharpen({ sigma: 0.5 }).png().toBuffer(), left: p.x, top: p.y });
  const full = await sharp({ create: { width: PAGE, height: PAGE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(composite).png().toBuffer();
  for (let mip = 0; mip < MIPS; mip++) await sharp(full).resize(PAGE >> mip, PAGE >> mip).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(OUT, `new-props-${pg.n}-${mip}.webp`));
}

// the library's items (ids newprop:<slug>), tex page = the local page (the game's appendNewProps adds the base)
const lib = items.map(it => {
  const p = byId.get(it.id), groundH = 32 * (it.hx + it.hy), w = it.w, h = it.h;
  const tex = [p.page, round(p.x / PAGE, 6), round(p.y / PAGE, 6), round((p.x + p.width) / PAGE, 6), round((p.y + p.height) / PAGE, 6)];
  const area = it.cat.slice(5);
  return { id: it.id, name: it.name, cat: it.cat, kind: 'decor', w, h, ax: round(w / 2), ay: round(h - groundH / 2), boxes: [{ hx: it.hx, hy: it.hy, dx: 0, dy: 0 }],
    solid: area === 'Trees' || area === 'People' ? 1 : 2, big: it.hx > 3, door: false, cost: COST[area], tex, quad: [0, 0, w, h] };
});
const LIBRARY_HEAD = [
  '// Generated by scripts/assets/prep-new-props.mjs. Source images are retained in art/new-props (items.json, the masters).',
  "import type { LibItem } from './types';",
  "import { REMOVED_IDS } from './lots/scales';",
  'const removed = new Set(REMOVED_IDS);',
  ...pages.flatMap(pg => Array.from({ length: MIPS }, (_, m) => `import n${pg.n}m${m} from '../assets/new-props/new-props-${pg.n}-${m}.webp';`)),
  `const PAGE_MIPS: string[][] = [${pages.map(pg => `[${Array.from({ length: MIPS }, (_, m) => `n${pg.n}m${m}`).join(', ')}]`).join(', ')}];`,
];
fs.writeFileSync(GAME, [
  ...LIBRARY_HEAD,
  `const ITEMS: LibItem[] = ${JSON.stringify(lib)};`,
  '/** the owner\'s new props (art/new-props, prep-new-props.mjs): their own pages, appended after every other library (no saved index moves) */',
  'export function appendNewProps(library: LibItem[], pages: string[][]) {',
  '  const base = pages.length; for (const row of PAGE_MIPS) pages.push(row);',
  '  for (const item of ITEMS) if (!removed.has(item.id)) library.push({ ...item, tex: [base + item.tex[0], ...item.tex.slice(1)] as LibItem["tex"] });',
  '}', ''
].join('\n'));

// the contact sheet of every cut, eight to a row, each with its name (ignored review output)
const COLS = 8, CW = 240, CH = 240, contact = [];
for (const [i, it] of items.entries()) {
  const left = (i % COLS) * CW, top = Math.floor(i / COLS) * CH;
  const thumb = await sharp(it.png).resize(220, 190, { fit: 'inside' }).png().toBuffer(), m = await sharp(thumb).metadata();
  contact.push({ input: thumb, left: left + Math.floor((CW - m.width) / 2), top: top + Math.floor((190 - m.height) / 2) });
  const label = it.name.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  contact.push({ input: Buffer.from(`<svg width="${CW}" height="44"><text x="${CW / 2}" y="16" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#172a32">${label}</text><text x="${CW / 2}" y="34" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#4a5d66">${it.cat.slice(5)} · ${it.cell}</text></svg>`), left, top: top + 192 });
}
await sharp({ create: { width: COLS * CW, height: Math.ceil(items.length / COLS) * CH, channels: 4, background: '#d8e0e3' } }).composite(contact).flatten({ background: '#d8e0e3' }).jpeg({ quality: 85 }).toFile(path.join(review, 'contact.jpg'));

const area = pages.reduce((s, pg) => s + pg.inputs.reduce((t, p) => t + p.width * p.height, 0), 0);
console.log(`Cut ${items.length} of ${manifest.sheets.length * 4} items from ${manifest.sheets.length} sheets (${failures.length} sheet failures)`);
for (const w of warnings) console.log(`warning: ${w}`);
for (const f of failures) console.log(`failed: ${f}`);
console.log(`Packed ${sized.length} items onto ${pages.length} page(s) of ${PAGE} x ${PAGE} (${(100 * area / (pages.length * PAGE * PAGE)).toFixed(1)}% of their area); masters in ${DIR}, library ${GAME}, contact sheet ${path.join(review, 'contact.jpg')}.`);
