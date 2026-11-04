// T289 (#874): the owner's desert and oasis prop sheets (F:/Art/newArt, read only: four 1536 x 1024 sheets of many props each, and download.png's
// six singles; "download (1).png" is the same file as 260dbf3a and is skipped) cut into single props.
// Cut: the components of alpha > 128 pixels (8-connected; the sheets' faint haze joins neighbours at lower alpha); a component of under SMALL px (a pebble, a stray leaf, a lily pad) joins the larger
// component nearest it within JOIN px (a prop's own scattered base), else it stands alone and is dropped when under MIN px. Each fainter pixel
// (alpha > 8) within GROW px of a prop goes to the nearest one (its soft edge), the rest of the haze to none. Every candidate keeps its sheet and crop box (provenance). A candidate whose alpha
// touches the sheet's edge is flagged CUT OFF.
// Stage 1, `--cut`: every candidate as output/desert-props-cut/<key>.png and a numbered sheet (output/desert-props-cut/sheet-<src>.jpg) to classify
// them by. art/desert-props/manifest.json then names each key: { name, kind, m, dim } (kind palm | tree | cactus | shrub | grass | reed | rock |
// wood | water | lily; m its size in metres: its height (dim 'h') or its footprint's width (dim 'w')), or { drop: '<why>' }.
// Stage 2 (no flag): the named props as masters art/desert-props/<slug>.webp and art/desert-props/items.json (display size at 64 world px a metre, the
// kit's scale: a 10 m palm is 640 px tall, a footprint d m across is 64 d px wide; the ground point is the centre of the base's lowest band, a
// quarter of the base's width above its bottom). prep-new-props.mjs packs them (after its own items, in the room left on its last page) and lists
// them in new-props-library.ts. `--sheet <file>` also writes the review sheet of every prop (each fitted to its cell) and <file>-scale (each at its true relative size).
//   node scripts/assets/prep-desert-props.mjs --cut          (the candidates to classify)
//   node scripts/assets/prep-desert-props.mjs [--sheet F:/ClaudeTemp/T289/props-sheet.png]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = process.env.DESERT_ART ?? 'F:/Art/newArt';
const DIR = path.join(root, 'art/desert-props'), CUT = path.join(root, 'output/desert-props-cut');
/** the sources, by key: the four sheets and download.png (download (1).png is 260dbf3a's bytes) */
const SOURCES = { a: '260dbf3a-625a-4247-bf44-68e1391b4d89.png', b: '4f69e360-aacb-4f59-a481-3baf1c0e2f3c.png', c: '527a9264-ca03-4b9f-9d49-a0d7e5775f84.png', d: '844203c4-d49a-4f61-afd2-e2e8d6c718a9.png', e: 'download.png' };
const STRONG = 128, SOFT = 8, SMALL = 1500, JOIN = 12, MIN = 700, GROW = 8, PAD = 4;
/** world px per metre (the kit's scale) */
const PPM = 64;
const args = process.argv.slice(2), opt = k => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : null; };
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const slugOf = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** the components of pixels with alpha above thr (8-connected): lab (each pixel's component, -1 none) and each { area, x0, y0, x1, y1 } */
function components(data, W, H, thr) {
  const lab = new Int32Array(W * H).fill(-1), stack = new Int32Array(W * H), comps = [];
  for (let s = 0; s < W * H; s++) {
    if (lab[s] >= 0 || data[s * 4 + 3] <= thr) continue;
    const id = comps.length, c = { area: 0, x0: W, y0: H, x1: -1, y1: -1 };
    let n = 0; stack[n++] = s; lab[s] = id;
    while (n) {
      const q = stack[--n], x = q % W, y = (q - x) / W;
      c.area++; c.x0 = Math.min(c.x0, x); c.x1 = Math.max(c.x1, x); c.y0 = Math.min(c.y0, y); c.y1 = Math.max(c.y1, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const r = Y * W + X; if (lab[r] < 0 && data[r * 4 + 3] > thr) { lab[r] = id; stack[n++] = r; }
      }
    }
    comps.push(c);
  }
  return { lab, comps };
}

/** a sheet's props: the owner (prop index, -1 none) of every pixel of alpha > 8, and each prop's { x0, y0, x1, y1, area } in reading order */
function propsOf(data, W, H) {
  const strong = components(data, W, H, STRONG), C = strong.comps;
  // the distance from each strong pixel to the nearest pixel of each big component, by a multi-source BFS over the big components (JOIN px)
  const big = C.map(c => c.area >= SMALL), near = new Int32Array(W * H).fill(-1), dist = new Int16Array(W * H).fill(32767);
  let q = []; for (let p = 0; p < W * H; p++) { const l = strong.lab[p]; if (l >= 0 && big[l]) { near[p] = l; dist[p] = 0; q.push(p); } }
  for (let d = 1; d <= JOIN && q.length; d++) {
    const nq = [];
    for (const p of q) { const x = p % W, y = (p - x) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const r = Y * W + X; if (dist[r] > d) { dist[r] = d; near[r] = near[p]; nq.push(r); } } }
    q = nq;
  }
  // a small component joins the big one most of its pixels lie nearest; else it stands alone
  const parent = C.map((_, i) => i);
  const votes = new Map();
  for (let p = 0; p < W * H; p++) { const l = strong.lab[p]; if (l < 0 || big[l] || near[p] < 0) continue; const k = l * 1e6 + near[p]; votes.set(k, (votes.get(k) ?? 0) + 1); }
  const bestOf = new Map();
  for (const [k, n] of votes) { const l = Math.floor(k / 1e6), t = k % 1e6; const b = bestOf.get(l); if (!b || n > b.n) bestOf.set(l, { t, n }); }
  for (const [l, b] of bestOf) parent[l] = b.t;
  // the props: big components with their joined pieces, and lone small ones of MIN px or more
  const groups = new Map();
  for (let i = 0; i < C.length; i++) { const g = parent[i]; if (!groups.has(g)) groups.set(g, { x0: W, y0: H, x1: -1, y1: -1, area: 0, members: [] }); const G = groups.get(g), c = C[i];
    G.members.push(i); G.area += c.area; G.x0 = Math.min(G.x0, c.x0); G.y0 = Math.min(G.y0, c.y0); G.x1 = Math.max(G.x1, c.x1); G.y1 = Math.max(G.y1, c.y1); }
  const props = [...groups.values()].filter(G => G.area >= MIN);
  // reading order: rows by the box's bottom (a row's bases line up), then left to right
  props.sort((a, b) => a.y1 - b.y1);
  const rows = []; for (const p of props) { const r = rows.find(r => Math.abs(r.y - p.y1) < 60); if (r) r.list.push(p); else rows.push({ y: p.y1, list: [p] }); }
  const ordered = rows.flatMap(r => r.list.sort((a, b) => a.x0 - b.x0));
  const propOfComp = new Int32Array(C.length).fill(-1);
  ordered.forEach((G, i) => { for (const m of G.members) propOfComp[m] = i; });
  // every other pixel of alpha > 8 within GROW px of a prop's core pixels goes to the nearest prop (a breadth-first grow from the cores)
  const ownerOf = new Int32Array(W * H).fill(-1);
  let front = [];
  for (let p = 0; p < W * H; p++) { const l = strong.lab[p]; if (l >= 0 && propOfComp[l] >= 0) { ownerOf[p] = propOfComp[l]; front.push(p); } }
  for (let d = 1; d <= GROW && front.length; d++) {
    const next = [];
    for (const p of front) { const x = p % W, y = (p - x) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const r = Y * W + X; if (ownerOf[r] < 0 && data[r * 4 + 3] > SOFT) { ownerOf[r] = ownerOf[p]; next.push(r); } } }
    front = next;
  }
  return { ownerOf, n: ordered.length };
}

/** one prop: its own pixels in their crop (PAD px of clear pixels round them), its crop box on the sheet, and whether it touches the sheet's edge */
async function cropOf(data, W, H, ownerOf, idx) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1, cutOff = false;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x; if (ownerOf[p] !== idx || data[p * 4 + 3] <= SOFT) continue;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    if (data[p * 4 + 3] > STRONG && (x === 0 || y === 0 || x === W - 1 || y === H - 1)) cutOff = true;
  }
  const l = Math.max(0, x0 - PAD), t = Math.max(0, y0 - PAD), r = Math.min(W, x1 + 1 + PAD), b = Math.min(H, y1 + 1 + PAD), w = r - l, h = b - t;
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p = (t + y) * W + l + x; if (ownerOf[p] === idx) data.copy(rgba, (y * w + x) * 4, p * 4, p * 4 + 4); }
  return { rgba, w, h, rect: [l, t, w, h], cutOff };
}

/** every candidate of every source: { key, src, sheet, rgba, w, h, rect, cutOff } */
async function cutAll() {
  const out = [];
  for (const [src, file] of Object.entries(SOURCES)) {
    const { data, info } = await sharp(path.join(SRC, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { ownerOf, n } = propsOf(data, info.width, info.height);
    for (let i = 0; i < n; i++) {
      const c = { key: `${src}${String(i).padStart(2, '0')}`, src, sheet: file, ...(await cropOf(data, info.width, info.height, ownerOf, i)) }, sp = SPLITS[c.key];
      if (sp) out.push(...splitOf(c, sp)); else out.push(c);
    }
  }
  return out;
}
/** the manifest's splits: a candidate that holds two props whose pixels touch (two trees' crowns, a pool and a stump), cut along a line of its
 *  own crop ('x:<px>' a vertical line, 'y:<px>' a horizontal one) into <key>L / <key>R or <key>T / <key>B */
const SPLITS = fs.existsSync(path.join(DIR, 'manifest.json')) ? JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8')).splits ?? {} : {};
function splitOf(c, sp) {
  const [axis, at] = [sp[0], +sp.slice(2)], parts = [], M = 40, W = c.w, H = c.h;
  // each pixel's side: seeds beyond M px of the line on either side, grown together through the opaque pixels (the fronts meet where the two
  // props touch, following their shapes); a pixel neither front reaches takes the line's side
  const sideOf = new Int8Array(W * H).fill(-1); let front = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = axis === 'x' ? x : y, p = y * W + x; if (c.rgba[p * 4 + 3] <= SOFT) continue;
    if (v < at - M) { sideOf[p] = 0; front.push(p); } else if (v > at + M) { sideOf[p] = 1; front.push(p); } }
  while (front.length) {
    const next = [];
    for (const p of front) { const x = p % W, y = (p - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const r = Y * W + X; if (sideOf[r] < 0 && c.rgba[r * 4 + 3] > SOFT) { sideOf[r] = sideOf[p]; next.push(r); } } }
    front = next;
  }
  for (const side of [0, 1]) {
    const inSide = (x, y) => { const k = sideOf[y * W + x]; return k >= 0 ? k === side : ((axis === 'x' ? x : y) < at) === (side === 0); };
    let x0 = c.w, y0 = c.h, x1 = -1, y1 = -1;
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (inSide(x, y) && c.rgba[(y * c.w + x) * 4 + 3] > SOFT) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const l = Math.max(0, x0 - PAD), t = Math.max(0, y0 - PAD), w = Math.min(c.w, x1 + 1 + PAD) - l, h = Math.min(c.h, y1 + 1 + PAD) - t, rgba = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inSide(l + x, t + y)) c.rgba.copy(rgba, (y * w + x) * 4, ((t + y) * c.w + l + x) * 4, ((t + y) * c.w + l + x) * 4 + 4);
    parts.push({ ...c, key: c.key + (axis === 'x' ? 'LR' : 'TB')[side], rgba, w, h, rect: [c.rect[0] + l, c.rect[1] + t, w, h] });
  }
  return parts;
}
const pngOf = c => sharp(c.rgba, { raw: { width: c.w, height: c.h, channels: 4 } }).png().toBuffer();

/** a labelled grid of pictures (each fitted in a box, or at a common scale), on a light ground */
async function gridSheet(list, file, { box = 200, cols = 10, scale = null, label }) {
  const LABEL = 34, comp = [];
  const cells = await Promise.all(list.map(async it => {
    let pic = await pngOf(it);
    if (scale) { const w = Math.max(1, Math.round(it.w * scale * it.k)), h = Math.max(1, Math.round(it.h * scale * it.k)); pic = await sharp(pic).resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer(); }
    else pic = await sharp(pic).resize(box - 8, box - 8, { fit: 'inside', kernel: 'lanczos3' }).png().toBuffer();
    const m = await sharp(pic).metadata(); return { pic, w: m.width, h: m.height };
  }));
  const CW = scale ? Math.max(box, ...cells.map(c => c.w + 8)) : box, rowsH = [];
  for (let r = 0; r < Math.ceil(list.length / cols); r++) rowsH.push((scale ? Math.max(40, ...cells.slice(r * cols, r * cols + cols).map(c => c.h + 8)) : box) + LABEL);
  let top = 0;
  for (let r = 0; r < rowsH.length; r++) {
    for (let k = 0; k < cols; k++) {
      const i = r * cols + k; if (i >= list.length) break; const c = cells[i], left = k * CW, bh = rowsH[r] - LABEL;
      comp.push({ input: c.pic, left: left + Math.floor((CW - c.w) / 2), top: top + (scale ? bh - c.h - 4 : Math.floor((bh - c.h) / 2)) });
      const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
      const [l1, l2] = label(list[i]);
      comp.push({ input: Buffer.from(`<svg width="${CW}" height="${LABEL}"><text x="${CW / 2}" y="14" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#172a32">${esc(l1)}</text><text x="${CW / 2}" y="29" text-anchor="middle" font-family="sans-serif" font-size="11" fill="${list[i].cutOff ? '#c81e1e' : '#4a5d66'}">${esc(l2)}</text></svg>`), left, top: top + bh });
    }
    top += rowsH[r];
  }
  const img = sharp({ create: { width: cols * CW, height: top, channels: 4, background: '#d9d4c4' } }).composite(comp).flatten({ background: '#d9d4c4' });
  await (file.endsWith('.png') ? img.png() : img.jpeg({ quality: 85 })).toFile(file);
}

const cands = await cutAll();
if (args.includes('--cut')) {
  fs.rmSync(CUT, { recursive: true, force: true }); fs.mkdirSync(CUT, { recursive: true });
  for (const c of cands) await sharp(await pngOf(c)).toFile(path.join(CUT, `${c.key}.png`));
  for (const src of Object.keys(SOURCES)) await gridSheet(cands.filter(c => c.src === src), path.join(CUT, `sheet-${src}.jpg`), { box: 150, cols: 10, label: c => [c.key, `${c.w}x${c.h}${c.cutOff ? ' CUT' : ''}`] });
  console.log(`${cands.length} candidates: ${Object.keys(SOURCES).map(s => `${s} ${cands.filter(c => c.src === s).length}`).join(', ')}; ${CUT}`);
  process.exit(0);
}

// stage 2: the named props
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8')).props;
const KINDS = { palm: 'palm', tree: 'palm', cactus: 'shrub', shrub: 'shrub', grass: 'shrub', reed: 'shrub', rock: 'rock', wood: 'rock', water: 'pond', lily: 'decal' };
const CAT = { palm: 'Desert: palms', tree: 'Desert: trees', cactus: 'Desert: cacti', shrub: 'Desert: shrubs', grass: 'Desert: grasses', reed: 'Desert: reeds', rock: 'Desert: rocks', wood: 'Desert: driftwood', water: 'Desert: oasis water', lily: 'Desert: oasis water' };
const COST = { palm: 400, tree: 300, cactus: 120, shrub: 70, grass: 40, reed: 60, rock: 150, wood: 60, water: 800, lily: 40 };
const missing = cands.filter(c => !manifest[c.key]).map(c => c.key);
if (missing.length) throw new Error(`manifest.json names no entry for ${missing.join(', ')} (run --cut and classify them)`);
for (const f of fs.existsSync(DIR) ? fs.readdirSync(DIR) : []) if (f.endsWith('.webp')) fs.unlinkSync(path.join(DIR, f));
fs.mkdirSync(DIR, { recursive: true });
const items = [], dropped = [], slugs = new Set();
for (const c of cands) {
  const e = manifest[c.key];
  if (e.drop) { dropped.push({ key: c.key, why: e.drop }); continue; }
  if (!KINDS[e.kind]) throw new Error(`${c.key}: kind ${e.kind}?`);
  let slug = `desert-${slugOf(e.name)}`; const base = slug; let n = 1; while (slugs.has(slug)) slug = `${base}-${++n}`; slugs.add(slug);
  // the base: the opaque span of the picture's lowest rows (its bottom 12%)
  let bx0 = c.w, bx1 = -1, by1 = 0;
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.rgba[(y * c.w + x) * 4 + 3] > 128) by1 = Math.max(by1, y);
  for (let y = Math.max(0, Math.floor(by1 - 0.12 * c.h)); y <= by1; y++) for (let x = 0; x < c.w; x++) if (c.rgba[(y * c.w + x) * 4 + 3] > 128) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); }
  const k = e.dim === 'w' ? e.m * PPM / c.w : e.m * PPM / c.h, w = c.w * k, h = c.h * k, baseW = (bx1 - bx0 + 1) * k;
  const baseM = baseW / PPM, ax = (bx0 + bx1 + 1) / 2 * k, ay = Math.max(h * 0.5, (by1 + 1) * k - Math.min(baseW / 4, 0.35 * h));
  const hx = round(Math.max(0.15, Math.min(e.kind === 'water' ? baseM * 0.45 : baseM * 0.3, 4)));
  await sharp(await pngOf(c)).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(DIR, `${slug}.webp`));
  items.push({ id: `newprop:${slug}`, slug, name: e.name, cat: CAT[e.kind], type: e.kind, kind: KINDS[e.kind], m: e.m, dim: e.dim, w: round(w), h: round(h), ax: round(ax), ay: round(ay),
    hx, cost: COST[e.kind], sheet: c.sheet, rect: c.rect, cutOff: c.cutOff, k });
  c.k = k; c.item = items[items.length - 1];
}
fs.writeFileSync(path.join(DIR, 'items.json'), JSON.stringify({ source: SRC, scale: `${PPM} world px a metre`, items: items.map(({ k, ...it }) => it), dropped }, null, 1) + '\n');
const byType = {}; for (const it of items) byType[it.type] = (byType[it.type] ?? 0) + 1;
console.log(`${items.length} props (${Object.entries(byType).map(([t, n]) => `${n} ${t}`).join(', ')}), ${dropped.length} dropped, from ${cands.length} candidates; masters ${DIR}`);
const sheetFile = opt('sheet');
if (sheetFile) {
  const kept = cands.filter(c => c.item).sort((a, b) => Object.keys(CAT).indexOf(a.item.type) - Object.keys(CAT).indexOf(b.item.type) || b.item.h - a.item.h);
  const label = c => [c.item.name.slice(0, 28), `${c.item.type} ${c.item.m} m${c.item.dim === 'w' ? ' wide' : ''} · ${c.key}${c.cutOff ? ' CUT' : ''}`];
  await gridSheet(kept, sheetFile, { box: 170, cols: 16, label });
  // the same props at their true relative size (0.5 x the display size: a 2 m prop 64 px tall)
  const scaleFile = sheetFile.replace(/(\.\w+)$/, '-scale$1');
  await gridSheet(kept, scaleFile, { box: 120, cols: 18, scale: 0.5, label });
  console.log(`review sheets ${sheetFile}, ${scaleFile}`);
}
