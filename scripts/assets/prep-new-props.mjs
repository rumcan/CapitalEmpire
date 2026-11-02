// The owner's new generated props (the manifest's sheets in art/new-props/manifest.json, pictures in the owner's "All Generated Images" folder,
// read only). Each sheet is cut by its subjects, never by fixed halves: a subject is the union of its alpha > 24 components whose bounding boxes
// lie within 24 px of each other (a building's detached sign or step belongs to it); the four largest subjects are named by their centres (the
// two higher centres are the top row, each row left to right). Each item keeps only its own subject's pixels (alpha > 8 pixels that belong to a
// subject: the faint residue round it, not a neighbour's), cropped with 4 px of clear pixels. An item is CUT OFF when its alpha touches the edge of
// the sheet it was cut from (the generator clipped it); a cut-off item is flagged in items.json and in the contact sheets.
// Masters go to art/new-props/<slug>.webp (quality 95, alpha kept), their list to art/new-props/items.json ({ items }).
// Props (cat 'New: <manifest cat>', kind 'decor'): footprints hx / hy are half extents in metres (a first guess, from the manifest); the native
// projection is 64 x 32 px per 2 m tile, so an item's native width is 64 * (hx + hy) and its height follows the picture's aspect.
// Trees (cat 'Trees'): real trees (kind 'tree', like the world's and the generated trees). Each is one picture, listed as four library ids
// (gen:tree-<slug>:ne|se|sw|nw, the same picture for every view) so the tree pools (forest.ts species, the woods, the town, the golf holes) deal
// them like the others. Size: the sheet's trees share one scale, the tallest of them standing at its reference tree's height times its factor
// (hx / 1.5, the manifest's footprint against the standard 1.5 m tree); the reference is the library tree of its kind (conifer: spruce, maple:
// moderate maple, oak: oak, birch: birch), and its footprint, solid, big and cost are the reference's, scaled by the factor. The ground point is
// the foot of the trunk (prep-new-trees.mjs's rule).
// All items are packed at 0.6 x native (times the owner's studio size when bigger) onto as many 2048 atlas pages as they need
// (src/assets/new-props/new-props-<page>-<mip>.webp, five mips each), and src/game/new-props-library.ts lists them: appendNewProps appends their
// pages and items after every other library (no saved index moves), and exports the tree species for forest.ts. Contact sheets:
// output/new-props-review/contact-v2.jpg (every item at 240 px, cut-off flagged) and contact-buildings.jpg (buildings, event structures and
// range at 400 px).
//   node scripts/assets/prep-new-props.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { SCALE_OVERRIDES } from './overrides.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(root, 'art/new-props'), OUT = path.join(root, 'src/assets/new-props'), GAME = path.join(root, 'src/game/new-props-library.ts');
const review = path.join(root, 'output/new-props-review');
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
const PAGE = 2048, GUT = 16, MIPS = 5;
const STRONG = 24, SOFT = 8, GAP = 24, PAD = 4, MIN_SUBJECT = 200;
const DIRS = ['ne', 'se', 'sw', 'nw'], DIR_NAMES = ['NE', 'SE', 'SW', 'NW'];
/** the library's price by manifest category ($): decor 50, stalls and tents 500, structures 1500, vehicles 800 */
const COST = { 'Course props': 50, 'People': 50, 'Seating': 50, 'Stalls': 500, 'Stalls (shabby)': 500, 'Event structures': 500, 'Event structures (shabby)': 500, 'Lake props': 500, 'Vehicles': 800, 'Buildings': 1500, 'Range': 1500, 'Media': 1500 };
/** the trees' species, by the sheet's id (the eight hex digits after exec-): its name, and its kind (conifer, maple, oak or birch: the reference) */
const TREE_SPECIES = {
  '07b7ef26': ['dark fir', 'conifer'], '2a49c706': ['blue spruce', 'conifer'], '2da5b0af': ['thin blue fir', 'conifer'],
  '0847d8fc': ['red maple', 'maple'], '2f8aa47f': ['red maple round', 'maple'], '4dc9e75d': ['orange maple', 'maple'], 'b13529b8': ['small red maple', 'maple'],
  '41893bfe': ['orange oak', 'oak'], '640d3fb0': ['small orange tree', 'oak'], '804bdfb3': ['bare oak', 'oak'], 'eaab8128': ['orange tree', 'oak'], 'f2adc440': ['orange tree round', 'oak'],
  'f5874056': ['birch', 'birch'], 'f5b3b50f': ['small birch', 'birch'],
};
/** the reference library tree of each kind (its on-map height and footprint are the new tree's) */
const TREE_REF = { conifer: 'capital:tree-spruce-open', maple: 'capital:tree-maple-moderate', oak: 'capital:tree-oak-open', birch: 'capital:tree-birch-open' };
const libText = fs.readFileSync(path.join(root, 'src/game/library.ts'), 'utf8');
/** a library item, as src/game/library.ts has it (its JSON line) */
const libItem = id => {
  const m = new RegExp(`\\{"id":"${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^\\n]*\\}`).exec(libText);
  if (!m) throw new Error(`reference tree ${id} is not in src/game/library.ts`);
  return JSON.parse(m[0]);
};
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const slugOf = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** the components of pixels with alpha above thr (8-connected): lab (the component of each pixel, -1 none) and each { area, x0, y0, x1, y1, sx, sy } */
function components(data, W, H, thr) {
  const lab = new Int32Array(W * H).fill(-1), stack = new Int32Array(W * H), comps = [];
  for (let s = 0; s < W * H; s++) {
    if (lab[s] >= 0 || data[s * 4 + 3] <= thr) continue;
    const id = comps.length, c = { area: 0, x0: W, y0: H, x1: -1, y1: -1, sx: 0, sy: 0 };
    let n = 0; stack[n++] = s; lab[s] = id;
    while (n) {
      const q = stack[--n], x = q % W, y = (q - x) / W;
      c.area++; c.sx += x; c.sy += y; c.x0 = Math.min(c.x0, x); c.x1 = Math.max(c.x1, x); c.y0 = Math.min(c.y0, y); c.y1 = Math.max(c.y1, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const r = Y * W + X; if (lab[r] < 0 && data[r * 4 + 3] > thr) { lab[r] = id; stack[n++] = r; }
      }
    }
    comps.push(c);
  }
  return { lab, comps };
}

/** a sheet's four subjects, by its strong pixels: the owner (for each pixel of alpha > 8) of the subject it belongs to (-1: none), and the
 *  subjects in cell order (top left, top right, bottom left, bottom right, by their centres); throws when there are not four */
function subjectsOf(data, W, H) {
  // the strong components (alpha > 24, 8-connected), largest first: each of the four largest is a subject (a core); a smaller piece (under half a
  // core's area) whose box lies within GAP px of a core is that core's detached part (a sign, a step), and joins it. A piece of similar size is
  // a neighbour, never merged (the sheets set their subjects a few px apart)
  const strong = components(data, W, H, STRONG), R = GAP / 2;
  // a core's own pixels, and those within GAP px of them (its dilation, a window sum over an integral image)
  const dilate = own => {
    const S = new Int32Array((W + 1) * (H + 1)), d = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) S[(y + 1) * (W + 1) + x + 1] = own[y * W + x] + S[y * (W + 1) + x + 1] + S[(y + 1) * (W + 1) + x] - S[y * (W + 1) + x];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - R), x1 = Math.min(W, x + R + 1), y0 = Math.max(0, y - R), y1 = Math.min(H, y + R + 1);
      d[y * W + x] = S[y1 * (W + 1) + x1] - S[y0 * (W + 1) + x1] - S[y1 * (W + 1) + x0] + S[y0 * (W + 1) + x0] > 0 ? 1 : 0;
    }
    return d;
  };
  const cores = [], coreOf = new Int32Array(strong.comps.length).fill(-1);
  const order = strong.comps.map((c, id) => ({ ...c, id })).sort((a, b) => b.area - a.area || a.id - b.id);
  const addTo = (k, c) => {
    for (let p = 0; p < W * H; p++) if (strong.lab[p] === c.id) k.own[p] = 1;
    k.area += c.area; k.sx += c.sx; k.sy += c.sy; k.d = dilate(k.own); coreOf[c.id] = k.id;
  };
  for (const c of order) {
    if (c.area < MIN_SUBJECT) break;
    // a detached piece (under a quarter of a core's area) with a pixel within GAP px of the core joins it; a bigger piece is a neighbour
    const host = cores.find(k => c.area < 0.25 * k.area &&(() => { for (let p = 0; p < W * H; p++) if (k.d[p] && strong.lab[p] === c.id) return true; return false; })());
    if (host) addTo(host, c);
    else if (cores.length < 4) { const k = { id: cores.length, area: 0, sx: 0, sy: 0, own: new Uint8Array(W * H), d: null }; cores.push(k); addTo(k, c); }
  }
  if (cores.length < 4) throw new Error(`${cores.length} subject(s), the fourth ${cores[3]?.area ?? 0} px`);
  for (const g of cores) { g.cx = g.sx / g.area; g.cy = g.sy / g.area; }
  const rows = [...cores].sort((a, b) => a.cy - b.cy), cells = [...rows.slice(0, 2).sort((a, b) => a.cx - b.cx), ...rows.slice(2).sort((a, b) => a.cx - b.cx)];
  const cellOfCore = new Int8Array(4); cells.forEach((g, i) => { cellOfCore[g.id] = i; });
  // the strong pixels' subject, then each faint component (alpha > 8) goes to the subject its strong pixels vote for
  const on = new Uint8Array(W * H), k = new Int8Array(W * H).fill(-1);
  for (let p = 0; p < W * H; p++) if (strong.lab[p] >= 0 && coreOf[strong.lab[p]] >= 0) { on[p] = 1; k[p] = cellOfCore[coreOf[strong.lab[p]]]; }
  const soft = components(data, W, H, SOFT), votes = soft.comps.map(() => [0, 0, 0, 0]);
  for (let p = 0; p < W * H; p++) if (k[p] >= 0 && soft.lab[p] >= 0) votes[soft.lab[p]][k[p]]++;
  const owner = votes.map(v => { const m = Math.max(...v); return m > 0 ? v.indexOf(m) : -1; });
  const ownerOf = new Int8Array(W * H).fill(-1);
  for (let p = 0; p < W * H; p++) if (soft.lab[p] >= 0) ownerOf[p] = owner[soft.lab[p]];
  return { ownerOf, cells };
}

/** one item of a sheet: the owner's pixels in their own crop (4 px of clear pixels round them), and whether its alpha touches the sheet's edge */
async function cropOf(data, W, H, ownerOf, idx) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1, cutOff = false;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x; if (ownerOf[p] !== idx || data[p * 4 + 3] <= SOFT) continue;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    if (data[p * 4 + 3] > STRONG && (x === 0 || y === 0 || x === W - 1 || y === H - 1)) cutOff = true;
  }
  if (x1 < 0) throw new Error(`item ${idx}: no pixels`);
  const l = Math.max(0, x0 - PAD), t = Math.max(0, y0 - PAD), r = Math.min(W, x1 + 1 + PAD), b = Math.min(H, y1 + 1 + PAD), w = r - l, h = b - t;
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = (t + y) * W + l + x;
    if (ownerOf[p] === idx) data.copy(rgba, (y * w + x) * 4, p * 4, p * 4 + 4);
  }
  return { png: await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer(), rect: [l, t, w, h], cutOff };
}

fs.mkdirSync(DIR, { recursive: true }); fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(review, { recursive: true });
const items = [], failures = [], slugs = new Set(), species = { conifer: [], broadleaf: [] };
for (const s of manifest.sheets) {
  if (!s.names || s.names.length !== 4) { failures.push(`${s.sheet}: manifest lists ${s.names?.length ?? 0} names`); continue; }
  const isTree = s.cat === 'Trees';
  if (!isTree && !(s.cat in COST)) throw new Error(`${s.sheet}: no cost for category "${s.cat}"`);
  const sp = isTree ? TREE_SPECIES[s.sheet.slice(5, 13)] : null;
  if (isTree && !sp) throw new Error(`${s.sheet}: no tree species for it`);
  const { data, info } = await sharp(path.join(manifest.source, s.sheet)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), W = info.width, H = info.height;
  let subj;
  try { subj = subjectsOf(data, W, H); } catch (e) { failures.push(`${s.sheet} (${s.cat}): ${e.message}`); continue; }
  const parts = [];
  for (let i = 0; i < 4; i++) parts.push({ ...(await cropOf(data, W, H, subj.ownerOf, i)), cell: ['top left', 'top right', 'bottom left', 'bottom right'][i], name: s.names[i] });
  // the trees of a sheet share one scale: the tallest stands at its reference's height times the factor
  let scale = 1, ref = null, factor = 1;
  if (isTree) {
    ref = libItem(TREE_REF[sp[1]]); factor = s.hx / 1.5;
    const tallest = Math.max(...await Promise.all(parts.map(async p => (await sharp(p.png).metadata()).height)));
    scale = ref.h * factor / tallest;
  }
  const views = [];
  for (const p of parts) {
    let slug = slugOf(p.name); const base = slug; let n = 1; while (slugs.has(slug)) slug = `${base}-${++n}`; slugs.add(slug);
    await sharp(p.png).webp({ quality: 95, alphaQuality: 100 }).toFile(path.join(DIR, `${slug}.webp`));
    const meta = await sharp(p.png).metadata(), it = { id: `newprop:${slug}`, slug, name: p.name, cat: `New: ${s.cat}`, kind: isTree ? 'tree' : 'decor', hx: s.hx, hy: s.hx, sheet: s.sheet, cell: p.cell, rect: p.rect, cutOff: p.cutOff, png: p.png };
    if (isTree) {
      const { data: d, info: fi } = await sharp(p.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let fx = 0, nf = 0; for (let y = fi.height - 1; y >= fi.height - 3 && y >= 0; y--) for (let x = 0; x < fi.width; x++) if (d[(y * fi.width + x) * 4 + 3] > 128) { fx += x; nf++; }
      const footX = nf ? fx / nf : fi.width / 2, w = meta.width * scale, h = meta.height * scale;
      Object.assign(it, { w: round(w), h: round(h), ax: round(footX * scale), ay: round(h - 3 * factor), factor: round(factor), ref: sp[1], boxes: ref.boxes.map(b => ({ hx: round(b.hx * factor), hy: round(b.hy * factor), dx: 0, dy: 0 })), solid: ref.solid, big: ref.big, cost: ref.cost });
      it.views = DIRS.map(d => `gen:tree-${slug}:${d}`); views.push(...it.views);
    } else {
      const w = 64 * (s.hx + s.hx), h = w * meta.height / meta.width;
      Object.assign(it, { w: round(w), h: round(h), cost: COST[s.cat] });
    }
    items.push(it);
  }
  if (isTree) species[sp[1] === 'conifer' ? 'conifer' : 'broadleaf'].push({ name: sp[0], ids: views, w: 1 });
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
for (const f of fs.readdirSync(OUT)) if (/^new-props-\d+-\d\.webp$/.test(f)) fs.unlinkSync(path.join(OUT, f));
const byId = new Map(sized.map(p => [p.it.id, p]));
for (const pg of pages) {
  const composite = [];
  for (const p of pg.inputs) composite.push({ input: await sharp(p.it.png).resize(p.width, p.height, { kernel: 'lanczos3', fit: 'fill' }).sharpen({ sigma: 0.5 }).png().toBuffer(), left: p.x, top: p.y });
  const full = await sharp({ create: { width: PAGE, height: PAGE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(composite).png().toBuffer();
  for (let mip = 0; mip < MIPS; mip++) await sharp(full).resize(PAGE >> mip, PAGE >> mip).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(OUT, `new-props-${pg.n}-${mip}.webp`));
}

// the library's rows: a prop is one row (id newprop:<slug>); a tree is four rows (gen:tree-<slug>:<dir>) on the same picture. tex page = the local
// page (the game's appendNewProps adds the base)
const lib = [];
for (const it of items) {
  const p = byId.get(it.id), tex = [p.page, round(p.x / PAGE, 6), round(p.y / PAGE, 6), round((p.x + p.width) / PAGE, 6), round((p.y + p.height) / PAGE, 6)];
  if (it.kind === 'tree') {
    for (const [i, d] of DIRS.entries()) lib.push({ id: it.views[i], name: `${it.name} (${DIR_NAMES[i]})`, cat: it.cat, kind: 'tree', w: it.w, h: it.h, ax: it.ax, ay: it.ay, boxes: it.boxes,
      solid: it.solid, big: it.big, door: false, cost: it.cost, tex, quad: [0, 0, it.w, it.h] });
    continue;
  }
  const groundH = 32 * (it.hx + it.hy), w = it.w, h = it.h;
  lib.push({ id: it.id, name: it.name, cat: it.cat, kind: 'decor', w, h, ax: round(w / 2), ay: round(h - groundH / 2), boxes: [{ hx: it.hx, hy: it.hy, dx: 0, dy: 0 }],
    solid: 2, big: it.hx > 3, door: false, cost: it.cost, tex, quad: [0, 0, w, h] });
}
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
  '/** the new tree species (art/new-props, prep-new-props.mjs): each one\'s library ids (its trees\' four views, one picture), for the tree pools in forest.ts */',
  `export const NEW_CONIFER_SPECIES: { name: string; ids: string[]; w: number }[] = ${JSON.stringify(species.conifer)};`,
  `export const NEW_BROADLEAF_SPECIES: { name: string; ids: string[]; w: number }[] = ${JSON.stringify(species.broadleaf)};`,
  '/** the owner\'s new props and trees (art/new-props, prep-new-props.mjs): their own pages, appended after every other library (no saved index moves) */',
  'export function appendNewProps(library: LibItem[], pages: string[][]) {',
  '  const base = pages.length; for (const row of PAGE_MIPS) pages.push(row);',
  '  for (const item of ITEMS) if (!removed.has(item.id)) library.push({ ...item, tex: [base + item.tex[0], ...item.tex.slice(1)] as LibItem["tex"] });',
  '}', ''
].join('\n'));

// the contact sheets: every item at 240 px (all of them), and the buildings, event structures and range at 400 px; a cut-off item is framed red
const sheet = async (list, cell, box, cols, file) => {
  const LABEL = 46, CW = cell, CH = box + LABEL, comp = [];
  for (const [i, it] of list.entries()) {
    const left = (i % cols) * CW, top = Math.floor(i / cols) * CH;
    const pic = await sharp(it.png).resize(box - 10, box - 10, { fit: 'inside', kernel: 'lanczos3' }).png().toBuffer(), m = await sharp(pic).metadata();
    comp.push({ input: pic, left: left + Math.floor((CW - m.width) / 2), top: top + Math.floor((box - m.height) / 2) });
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const flag = it.cutOff ? `<rect x="2" y="2" width="${CW - 4}" height="${CH - 4}" fill="none" stroke="#c81e1e" stroke-width="5"/><text x="${CW - 10}" y="${box - 6}" text-anchor="end" font-family="sans-serif" font-size="${Math.max(14, Math.round(CW / 14))}" font-weight="bold" fill="#c81e1e">CUT OFF</text>` : '';
    comp.push({ input: Buffer.from(`<svg width="${CW}" height="${LABEL}"><text x="${CW / 2}" y="18" text-anchor="middle" font-family="sans-serif" font-size="${Math.max(13, Math.round(CW / 18))}" fill="#172a32">${esc(it.name)}</text><text x="${CW / 2}" y="36" text-anchor="middle" font-family="sans-serif" font-size="${Math.max(11, Math.round(CW / 22))}" fill="#4a5d66">${esc(it.cat.slice(5))} · ${it.cell}${it.cutOff ? ' · CUT OFF' : ''}</text>${flag}</svg>`), left, top: top + box });
  }
  await sharp({ create: { width: cols * CW, height: Math.ceil(list.length / cols) * CH, channels: 4, background: '#d8e0e3' } }).composite(comp).flatten({ background: '#d8e0e3' }).jpeg({ quality: 85 }).toFile(file);
};
await sheet(items, 260, 240, 8, path.join(review, 'contact-v2.jpg'));
const BUILDINGS = new Set(['Buildings', 'Event structures', 'Event structures (shabby)', 'Range']);
await sheet(items.filter(it => BUILDINGS.has(it.cat.slice(5))), 420, 400, 4, path.join(review, 'contact-buildings.jpg'));

const cutOff = items.filter(it => it.cutOff).map(it => it.id);
const area = pages.reduce((s, pg) => s + pg.inputs.reduce((t, p) => t + p.width * p.height, 0), 0);
console.log(`Cut ${items.length} items (${items.filter(it => it.kind === 'tree').length} trees, ${items.filter(it => it.kind === 'decor').length} props) from ${manifest.sheets.length} sheets; ${failures.length} sheet failure(s)`);
for (const f of failures) console.log(`failed: ${f}`);
console.log(`Cut off (touching the sheet's edge): ${cutOff.length}${cutOff.length ? ` (${cutOff.join(', ')})` : ''}`);
console.log(`Tree species: ${species.conifer.length} conifer, ${species.broadleaf.length} broadleaf; library rows ${lib.length}`);
console.log(`Packed ${sized.length} pictures onto ${pages.length} page(s) of ${PAGE} x ${PAGE} (${(100 * area / (pages.length * PAGE * PAGE)).toFixed(1)}% of their area); masters ${DIR}, library ${GAME}, contact sheets ${review}.`);
