// Pack the curated town-builder sprites (TrickOrTreat public export, public/assets/town-built) into GPU atlas pages.
//   node scripts/assets/prep-sprites.mjs
// Scale contract: the export's w,h,ax,ay are display px at the builder's native 128 px per tile. The game never zooms
// closer than 30%, which on a dpr-2 screen is 0.6 device px per native px, so mip 0 is 0.6x native for a sprite drawn
// at scale 1. A sprite the game draws bigger (the owner's lot scales, the forest) is packed at 0.6x its largest scale,
// as far as its painted source goes, so it is never stretched at the closest zoom (scripts/assets/audit-sprites.mjs).
// Besides the export (the sprites the owner's painted town uses), every upright sprite of a local TrickOrTreat town
// builder library is packed too (source.mjs libraryItems), so the whole art set is available. Every page also
// ships 0.3x, 0.15x, 0.075x and 0.0375x mips (the whole page downsampled, so one set of UVs serves every level).
// Sprites are trimmed to their alpha and padded with a gutter wide enough to survive the smallest mip.
// Writes src/assets/atlas/sprites-<page>-<mip>.webp and src/game/library.ts.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT, fromBranch, fromExport, libraryItems } from './source.mjs';

export const MIP0 = 0.6, MIPS = 5, PAGE = 2048, GUT = 16, ALIGN = 16;
const OUT = path.join(ROOT, 'src/assets/atlas');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });

const town = JSON.parse((await fromExport('town.json')).toString());
const items = town.items, fromLib = await libraryItems(new Set(Object.keys(items)));
for (const [id, it] of Object.entries(fromLib)) items[id] = it;

// the largest scale the game draws each id at: the owner's lot table (+5% composer jitter) and the forest (up to 1.5). The table is
// read from its source (prep-scales.mjs then writes it into scales.ts for the ids packed here), so the run order does not matter
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SCALES = JSON.parse((await fromBranch('town/builder-in-repo', 'scripts/town-builder/places-v5/scales.json')).toString('utf8'));
const OWNER = Object.fromEntries(Object.entries(SCALES).filter(([, v]) => typeof v?.scale === 'number').map(([k, v]) => [k, v.scale]));
const FOREST = new Set([...read('src/game/forest.ts').matchAll(/'([a-z]+:[^']+)'/g)].map(m => m[1]));
const maxScale = id => Math.max(1, (OWNER[id] ?? 0) * 1.05, FOREST.has(id) ? 1.5 : 0);
// every item of one export category (the Lot Composer kit takes whole categories)
const all = c => Object.keys(items).filter(id => items[id].cat === c);
// an id may sit in several lists: the first list that names it wins (see `seen` in step 1)
const SEL = {
  'Houses': ['world:house_1', 'world:house_3', 'world:house_4', 'gen:house-duplex', 'gen:house-l-ranch', 'gen:house-ranch-long', 'gen:house-splitlevel', 'gen:house-l-shape', 'gen:house-farmhouse-wrap', 'static:garage_timber', 'static:garage_brick', ...all('Houses'), 'expansion:ranch-rear', 'expansion:garage-rear', ...all('House backs')],
  'Shops & services': ['town:bakery', 'town:grocery', 'town:pharmacy', 'town:laundromat', 'town:postoffice', 'town:firestation', 'town:fish_tackle', 'world:diner', 'world:arcade', 'world:video_rental', 'ref:building-gas-canopy', ...all('Shops & services')],
  'Landmarks': ['world:church', 'world:gazebo', 'world:watertower', 'ref:landmark-windmill', 'world:barn', 'world:primary_school', ...all('Landmarks & venues'), ...all('Park & sports')],
  'Trees & plants': ['world:tree_oak_0', 'world:tree_oak_1', 'world:tree_oak_2', 'world:tree_pine_0', 'world:tree_pine_1', 'ref:tree-maple-crimson', 'ref:tree-birch-gold', 'ref:tree-spruce-blue', 'world:bush_0', 'world:bush_1', 'world:hedge', 'town:hydrangea', ...all('Trees & plants')],
  'Vehicles': Object.keys(items).filter(id => items[id].cat === 'Vehicles'),
  'Street furniture': ['world:streetlamp', 'world:hydrant', 'world:mailbox', 'world:bench', 'world:trashcan', 'town:stop_sign', 'town:street_sign', 'town:traffic_light', 'town:bus_stop', 'town:phone_booth', 'town:utility_pole', 'town:bike_rack', 'town:picnic_table', 'town:planter_square', ...all('City utility details'), 'town:dumpster', 'town:delivery_crates', ...all('Street furniture')],
  'Halloween': ['world:pumpkin_0', 'world:pumpkin_1', 'world:scarecrow', 'ref:halloween-hay-bales', 'ref:halloween-pumpkin-cluster', 'world:candy_stand', 'gen:inflatable-pumpkin', 'ref:halloween-sheet-ghost', ...all('Halloween')],
  'Fences': ['world:fence_picket_x', 'world:fence_picket_y', 'world:fence_iron_x', 'world:fence_iron_y', 'gen:fence-privacy-wood', ...all('Correct-angle fences'), ...all('Fences & walls')],
  'Yard': ['gen:trash-cans-row', 'gen:kids-bikes', 'expansion:trampoline', 'expansion:doghouse', 'expansion:basketball-hoop', 'expansion:washing-line', ...all('Backyard structures'), ...all('Backyard furniture'), ...all('Backyard stories'), ...all('POI dressing')],
  'Industry': [...all('Scrapyard clutter'), ...all('Derelict town'), ...all('New industrial buildings')],
  // from the full TrickOrTreat library (after the export's lists, so existing sprites keep their order)
  'More houses': [...all('House rear & side views')],
  'Road signs': [...all('Road signs')],
  'Arcade': [...all('Arcade furniture'), ...all('Arcade decor')],
  'Odds & ends': [...all('Town odds & ends'), ...all('Halloween yard details')],
};
const COST = { 'More houses': 9000, 'Road signs': 150, 'Arcade': 600, 'Odds & ends': 200, 'Houses': 9000, 'Shops & services': 24000, 'Landmarks': 40000, 'Trees & plants': 250, 'Vehicles': 3500, 'Street furniture': 300, 'Halloween': 120, 'Fences': 90, 'Yard': 400, 'Industry': 300 };
// export categories whose kind the engine needs to see differently (derelict houses are not occupied houses)
const KIND_OF_CAT = { 'Derelict town': 'building', 'Scrapyard clutter': 'decor' };

// ---- 1. every sprite at mip-0 size, trimmed to its alpha
const sprites = [], seen = new Set();
for (const [cat, ids] of Object.entries(SEL)) for (const id of ids) {
  if (seen.has(id)) continue; seen.add(id);
  const it = items[id]; if (!it) { console.warn('missing', id); continue; }
  let buf;
  if (it.src) buf = fs.readFileSync(it.src);
  else { const file = it.file.split('/').pop(); try { buf = await fromExport('sprites-hd/' + file); } catch { buf = await fromExport('sprites/' + file); } }
  // packed at its largest drawn scale, but never past the painted source's own pixels
  const res = Math.min(MIP0 * maxScale(id), (await sharp(buf).metadata()).width / it.w);
  const W = Math.max(1, Math.round(it.w * res)), H = Math.max(1, Math.round(it.h * res));
  const { data } = await sharp(buf).ensureAlpha().resize(W, H, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) { console.warn('empty', id); continue; }
  const cw = x1 - x0 + 1, chh = y1 - y0 + 1, crop = Buffer.alloc(cw * chh * 4);
  for (let y = 0; y < chh; y++) data.copy(crop, y * cw * 4, ((y0 + y) * W + x0) * 4, ((y0 + y) * W + x1 + 1) * 4);
  const area = it.boxes.reduce((s, b) => s + b.hx * b.hy * 4, 0) || 1, base = COST[cat];
  const cost = Math.round(base * (0.6 + 0.4 * Math.min(3, area / (base > 5000 ? 30 : 1))) / 10) * 10;
  sprites.push({ id, cat, it, cost, crop, cw, ch: chh, qx0: x0 / res, qy0: y0 / res, qx1: (x1 + 1) / res, qy1: (y1 + 1) / res });
}

// ---- 2. shelf packing into PAGE x PAGE pages (positions aligned so every mip lands on whole pixels)
const al = v => Math.ceil(v / ALIGN) * ALIGN;
const order = sprites.map((_, i) => i).sort((a, b) => sprites[b].ch - sprites[a].ch);
const pages = []; let page = null;
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

// ---- 3. pages and their mips
const files = [];
for (let p = 0; p < pages.length; p++) {
  const comp = pages[p].sprites.map(s => ({ input: s.crop, raw: { width: s.cw, height: s.ch, channels: 4 }, left: s.px, top: s.py }));
  const full = await sharp({ create: { width: PAGE, height: PAGE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comp).png().toBuffer();
  const row = [];
  for (let m = 0; m < MIPS; m++) {
    const size = PAGE >> m, name = `sprites-${p}-${m}.webp`;
    let img = sharp(full); if (m) img = img.resize(size, size, { kernel: 'lanczos3' }).sharpen({ sigma: 0.45 + 0.1 * m });
    await img.webp({ quality: m ? 90 : 88, alphaQuality: 100, effort: 6 }).toFile(path.join(OUT, name));
    row.push(name);
  }
  files.push(row);
}

// ---- 4. library.ts
const imports = [], pageRows = [];
files.forEach((row, p) => { const vars = row.map((f, m) => { const v = `p${p}m${m}`; imports.push(`import ${v} from '../assets/atlas/${f}';`); return v; }); pageRows.push(`[${vars.join(', ')}]`); });
const lib = sprites.map(s => {
  const it = s.it, e = { id: s.id, name: it.name, cat: s.cat, kind: KIND_OF_CAT[it.cat] ?? it.kind, w: it.w, h: it.h, ax: it.ax, ay: it.ay, boxes: it.boxes, solid: it.solid, big: it.big, door: !!it.door, cost: s.cost };
  if (it.glows) e.glows = it.glows; if (it.doorAt) e.doorAt = it.doorAt;
  e.tex = [s.page, +(s.px / PAGE).toFixed(6), +(s.py / PAGE).toFixed(6), +((s.px + s.cw) / PAGE).toFixed(6), +((s.py + s.ch) / PAGE).toFixed(6)];
  e.quad = [+s.qx0.toFixed(2), +s.qy0.toFixed(2), +s.qx1.toFixed(2), +s.qy1.toFixed(2)];
  return e;
});
fs.writeFileSync(path.join(ROOT, 'src/game/library.ts'), [
  '// Generated by scripts/assets/prep-sprites.mjs from the Maple Falls town export (TrickOrTreat public/assets/town-built/town.json).',
  '// w,h,ax,ay are display px at the native 128 px-per-tile scale; boxes are footprints in metres (2 m per tile).',
  '// tex = [page, u0, v0, u1, v1] in the atlas; quad = the trimmed picture inside the w x h display rectangle.',
  "import type { LibItem } from './types';",
  ...imports, '',
  `/** atlas pages: one row per page, one url per mip (scale ${MIP0} x 2^-mip of native) */`,
  `export const ATLAS_PAGES: string[][] = [${pageRows.join(', ')}];`,
  `export const ATLAS_SIZE = ${PAGE};`,
  `export const ATLAS_MIP0 = ${MIP0};`,
  'export const LIBRARY: LibItem[] = [',
  ...lib.map(e => '  ' + JSON.stringify(e) + ','),
  '];', ''].join('\n'));
const used = sprites.reduce((s, x) => s + (x.cw + 2 * GUT) * (x.ch + 2 * GUT), 0);
console.log(`sprites ${sprites.length}, pages ${pages.length}, fill ${(used / (pages.length * PAGE * PAGE) * 100).toFixed(0)}%`);
