// Pack the east-facing shop art (art/east-facing/<name>.png, one picture per front shop: the front mirrored left to right, its sign
// written to read right) into its own supplemental atlas, the way prep-cars.mjs packs the cars.
//   node scripts/assets/prep-east.mjs
// Each east item is the front's library item MIRRORED, exactly as the engine mirrors a flipped sprite (sprites.ts spriteRect, lots/compose.ts
// boxOf): ax -> w - ax, every box hx<->hy and dx<->dy, the quad x0 -> w - x2 and x2 -> w - x0. Drawn unflipped it is the front drawn flipped.
// The picture fills the front's own atlas rectangle at mip 0 (its tex rect, the trimmed sprite at 0.6 x native), so the outlines line up:
// the east picture is trimmed to its alpha and fitted into the front's trimmed size (the front is cut from the atlas, src/assets/atlas).
// Writes src/assets/east/east-<page>-<mip>.webp and src/game/east-library.ts (EAST_PAIRS: [front id, east id], appendEast).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { readRemoved } from './removed.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(root, 'art/east-facing'), ATLAS = path.join(root, 'src/assets/atlas'), OUT = path.join(root, 'src/assets/east');
const PAGE = 2048, GUT = 16, ALIGN = 16, MIPS = 5;
const r2 = v => +v.toFixed(2);
const REMOVED = readRemoved();

// the front items: the JSON lines of src/game/library.ts (one item per line, as prep-sprites.mjs writes them)
const LIB = new Map(fs.readFileSync(path.join(root, 'src/game/library.ts'), 'utf8').split('\n').filter(l => l.startsWith('  {"id":'))
  .map(l => { const it = JSON.parse(l.trim().replace(/,$/, '')); return [it.id, it]; }));

/** the bounds (inclusive) of the pixels with alpha above 2 in an RGBA buffer */
function bounds(data, W, H) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) throw new Error('an empty picture');
  return { x0, y0, x1, y1 };
}

// ---- 1. each east picture, fitted into its front's mip-0 rectangle; each item mirrored from its front
const names = fs.readdirSync(SRC).filter(f => f.endsWith('.png')).sort();
const sprites = [], pairs = [], items = [];
for (const f of names) {
  // <name> is the front's id with ':' replaced by '_' (town_grocery = town:grocery); the prefix (town, world, ref) has no '_'
  const name = f.slice(0, -4), cut = name.indexOf('_'), frontId = `${name.slice(0, cut)}:${name.slice(cut + 1)}`;
  const front = LIB.get(frontId);
  // a front the owner removed in the sprite studio has no east view either (restore the front and pack again to bring it back)
  if (!front && REMOVED[frontId]) { console.log(`${frontId}: removed in the studio, its east view left out`); continue; }
  if (!front) throw new Error(`${f}: no library item ${frontId}`);
  if (front.doorAt || front.block) throw new Error(`${frontId}: doorAt and block are not mirrored yet`);
  const [page, u0, v0, u1, v1] = front.tex, PX = Math.round(u0 * PAGE), PY = Math.round(v0 * PAGE), PW = Math.round((u1 - u0) * PAGE), PH = Math.round((v1 - v0) * PAGE);
  // the front at mip 0, trimmed to its alpha: the size the east picture is drawn at
  const atlas = await sharp(path.join(ATLAS, `sprites-${page}-0.webp`)).extract({ left: PX, top: PY, width: PW, height: PH }).ensureAlpha().raw().toBuffer();
  const ob = bounds(atlas, PW, PH), ow = ob.x1 - ob.x0 + 1, oh = ob.y1 - ob.y0 + 1;
  // the east master, trimmed to its alpha and fitted into the front's trimmed size
  const master = await sharp(path.join(SRC, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const mb = bounds(master.data, master.info.width, master.info.height), mw = mb.x1 - mb.x0 + 1, mh = mb.y1 - mb.y0 + 1;
  const fitted = await sharp(master.data, { raw: { width: master.info.width, height: master.info.height, channels: 4 } })
    .extract({ left: mb.x0, top: mb.y0, width: mw, height: mh }).resize(ow, oh, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer();
  const crop = await sharp({ create: { width: PW, height: PH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: fitted, raw: { width: ow, height: oh, channels: 4 }, left: ob.x0, top: ob.y0 }]).raw().toBuffer();
  sprites.push({ id: `east:${frontId}`, crop, cw: PW, ch: PH });
  // the east item: the front's metadata mirrored (the same as the engine's flip of the front)
  const it = { ...front, id: `east:${frontId}`, name: `${front.name} (east)`, ax: r2(front.w - front.ax), boxes: front.boxes.map(b => ({ hx: b.hy, hy: b.hx, dx: b.dy, dy: b.dx })),
    quad: [r2(front.w - front.quad[2]), front.quad[1], r2(front.w - front.quad[0]), front.quad[3]] };
  if (front.glows) it.glows = front.glows.map(g => ({ ...g, x: r2(front.w - g.x) }));
  items.push(it);
  pairs.push([frontId, `east:${frontId}`]);
}

// ---- 2. shelf packing into PAGE x PAGE pages, 16 px gutters on a 16 px grid (every mip lands on whole pixels)
const pages = [];
{
  const al = v => Math.ceil(v / ALIGN) * ALIGN;
  const order = sprites.map((_, i) => i).sort((a, b) => sprites[b].ch - sprites[a].ch);
  let page = null;
  const newPage = () => { page = { shelves: [], sprites: [] }; pages.push(page); };
  newPage();
  for (const i of order) {
    const s = sprites[i], w = al(s.cw + 2 * GUT), h = al(s.ch + 2 * GUT);
    if (w > PAGE || h > PAGE) throw new Error(`${s.id} is too big for a ${PAGE} page`);
    const place = pg => {
      for (const sh of pg.shelves) if (h <= sh.h && sh.x + w <= PAGE) { const at = [sh.x, sh.y]; sh.x += w; return at; }
      const y = pg.shelves.reduce((m, sh) => Math.max(m, sh.y + sh.h), 0); if (y + h > PAGE) return null;
      pg.shelves.push({ y, h, x: w }); return [0, y];
    };
    let at = place(page); if (!at) { newPage(); at = place(page); }
    s.page = pages.length - 1; s.px = at[0] + GUT; s.py = at[1] + GUT; page.sprites.push(s);
  }
}

// ---- 3. pages and their mips (as prep-cars.mjs: webp q92, alpha 100)
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (let p = 0; p < pages.length; p++) {
  const comp = pages[p].sprites.map(s => ({ input: s.crop, raw: { width: s.cw, height: s.ch, channels: 4 }, left: s.px, top: s.py }));
  const full = await sharp({ create: { width: PAGE, height: PAGE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comp).png().toBuffer();
  for (let m = 0; m < MIPS; m++) await sharp(full).resize(PAGE >> m, PAGE >> m).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(OUT, `east-${p}-${m}.webp`));
}

// ---- 4. east-library.ts: each item's tex is [local page, u0, v0, u1, v1]; appendEast offsets the page
const byId = new Map(sprites.map(s => [s.id, s]));
const lib = items.map(it => {
  const s = byId.get(it.id);
  return { ...it, tex: [s.page, +(s.px / PAGE).toFixed(6), +(s.py / PAGE).toFixed(6), +((s.px + s.cw) / PAGE).toFixed(6), +((s.py + s.ch) / PAGE).toFixed(6)] };
});
const imports = [], pageRows = [];
pages.forEach((_, p) => { const vars = []; for (let m = 0; m < MIPS; m++) { const v = `e${p}m${m}`; imports.push(`import ${v} from '../assets/east/east-${p}-${m}.webp';`); vars.push(v); } pageRows.push(`[${vars.join(', ')}]`); });
fs.writeFileSync(path.join(root, 'src/game/east-library.ts'), [
  '// Generated by scripts/assets/prep-east.mjs. Source images are retained in art/east-facing.',
  "import type { LibItem } from './types';",
  "import { REMOVED_IDS } from './lots/scales';",
  "const removed = new Set(REMOVED_IDS);",
  ...imports,
  `const PAGES: string[][] = [${pageRows.join(', ')}];`,
  `const ITEMS: LibItem[] = [`,
  ...lib.map(e => '  ' + JSON.stringify(e) + ','),
  '];',
  '/** the east-facing art of the front shops: [front sprite id, east sprite id]. lettering.ts draws a flipped front as its east sprite, unflipped */',
  `export const EAST_PAIRS: [string, string][] = ${JSON.stringify(pairs)};`,
  '/** Append after the cars, on their own supplemental pages: each east item is its front mirrored, so drawn unflipped it is the front flipped. */',
  'export function appendEast(library: LibItem[], pages: string[][]) {',
  '  const first = pages.length; pages.push(...PAGES);',
  '  // a removed east view goes too: its front (the id without "east:") is removed, or the east id itself',
  '  for (const item of ITEMS) if (!removed.has(item.id) && !removed.has(item.id.replace(/^east:/, ""))) library.push({ ...item, tex: [first + item.tex[0], ...item.tex.slice(1)] as LibItem["tex"] });',
  '}', ''
].join('\n'));
console.log(`Prepared ${sprites.length} east-facing shops on ${pages.length} supplemental page(s): ${pairs.map(p => p[0]).join(', ')}.`);
