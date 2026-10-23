// The four-view building art (T017: NE, SE, SW, NW, true rotations under a fixed sun) into the game. Re-run it whenever new sheets land:
//   node scripts/assets/prep-views.mjs [generated-buildings-folder]
// 1. Sync: for each subject in art/theme-consistency/generated/buildings (or the folder given: the art may sit in another checkout; its <slug>-4views-v<n>/ crops and <slug>-4views-v<n>.provenance.json,
//    whose id is the library id), the newest version with all four NE/SE/SW/NW.native.png crops is copied to art/building-views/<slug>/,
//    unless art/building-views/measures.json pins a version. Without the generated folder (a fresh clone) the copies already there are used.
// 2. Scale: each view is sized by its doorway (measures.json: a plain door's height in native px, tied to the picture's sha256) so the door
//    stands standardDoor game px tall at the building's owner scale. A view with no clear door takes the mean scale of its measured views;
//    a subject with none measured keeps the original sprite's width (and is reported, to be measured).
// 3. Footprint: the original boxes grow or shrink with the art (the NE view against the original's width); SE and NW turn them (hx <-> hy).
//    The ground point is the footprint's centre, found from the picture's lowest point (the near corner, +hx +hy).
// 4. Pack: every view at 0.6 x display size on 2048 pages with five mips (src/assets/views/views-<page>-<mip>.webp), and write
//    src/game/views-library.ts: appendViews puts NE in place of the original sprite and SE in place of its east art (east:<id>), keeping
//    every saved index, and appends the other views as view:<id>:se|sw|nw. Night glows are found again on the new pictures.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { findGlows } from './find-glows.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GEN = path.resolve(process.argv[2] ?? path.join(root, 'art/theme-consistency/generated/buildings')), STORE = path.join(root, 'art/building-views');
const OUT = path.join(root, 'src/assets/views'), REVIEW = path.join(root, 'output/views-review');
const DIRS = ['NE', 'SE', 'SW', 'NW'], PAGE = 2048, GUT = 16, MIP0 = 0.6;
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');
const measures = JSON.parse(fs.readFileSync(path.join(STORE, 'measures.json'), 'utf8'));
const pinned = new Map(Object.entries(measures.subjects).filter(([, s]) => s.pin).map(([id, s]) => [id, s.version]));

// 1. sync the newest (or pinned) version of every subject
if (fs.existsSync(GEN)) {
  const best = new Map();
  for (const d of fs.readdirSync(GEN)) {
    const m = /^(.+)-4views-v(\d+)$/.exec(d);
    if (!m || !DIRS.every(v => fs.existsSync(path.join(GEN, d, `${v}.native.png`))) || !fs.existsSync(path.join(GEN, `${d}.provenance.json`))) continue;
    const id = JSON.parse(fs.readFileSync(path.join(GEN, `${d}.provenance.json`), 'utf8')).id, b = best.get(id);
    if (pinned.has(id) ? pinned.get(id) === d : !b || b.n < +m[2]) best.set(id, { slug: m[1], version: d, n: +m[2] });
  }
  for (const [id, { slug, version }] of best) {
    const dir = path.join(STORE, slug), source = path.join(dir, 'source.json');
    const old = fs.existsSync(source) ? JSON.parse(fs.readFileSync(source, 'utf8')) : null, files = {};
    fs.mkdirSync(dir, { recursive: true });
    for (const v of DIRS) { const buf = fs.readFileSync(path.join(GEN, version, `${v}.native.png`)); files[v] = sha(buf); if (old?.files?.[v] !== files[v]) fs.writeFileSync(path.join(dir, `${v}.png`), buf); }
    fs.copyFileSync(path.join(GEN, `${version}.provenance.json`), path.join(dir, 'provenance.json'));
    fs.writeFileSync(source, JSON.stringify({ id, version, files }, null, 1) + '\n');
    if (old?.version !== version) console.log(`synced ${id}: ${version}`);
  }
}

// the original sprites (one item per line in the generated libraries) and the owner scales
const items = new Map();
for (const f of ['src/game/library.ts', 'src/game/east-library.ts'])
  for (const line of fs.readFileSync(path.join(root, f), 'utf8').split('\n')) { const m = /^\s*(\{"id":.*\}),?$/.exec(line); if (m) { const it = JSON.parse(m[1]); items.set(it.id, it); } }
const scales = fs.readFileSync(path.join(root, 'src/game/lots/scales.ts'), 'utf8');
const owner = id => +(new RegExp(`"${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}": ([0-9.]+)`).exec(scales)?.[1] ?? 1);

// 2-3. size, footprint and ground point of every view
const subjects = [], unmeasured = [];
for (const slug of fs.readdirSync(STORE).filter(d => fs.existsSync(path.join(STORE, d, 'source.json'))).sort()) {
  const { id, version, files } = JSON.parse(fs.readFileSync(path.join(STORE, slug, 'source.json'), 'utf8')), base = items.get(id);
  if (!base) { console.warn(`skipped ${id}: not in the library`); continue; }
  const k = owner(id), meas = measures.subjects[id], views = [];
  for (const v of DIRS) {
    const png = fs.readFileSync(path.join(STORE, slug, `${v}.png`)), { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // the lowest opaque row: the near corner of the footprint (+hx, +hy)
    let by = -1, bx = 0, n = 0;
    for (let y = info.height - 1; y >= 0 && by < 0; y--) { for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 128) { bx += x; n++; } if (n) by = y; }
    const m = meas?.views?.[v], door = m?.door && m.sha256 === files[v] ? m.door : 0;
    views.push({ dir: v, png, W: info.width, H: info.height, bx: bx / n, by: by + 1, door, s: door ? measures.standardDoor / (door * k) : 0 });
  }
  const measured = views.filter(x => x.s);
  if (measured.length) { const mean = measured.reduce((a, x) => a + x.s, 0) / measured.length; for (const x of views) if (!x.s) x.s = mean; }
  else { unmeasured.push(`${id} (${version})`); const s = base.quad[2] / views[0].W; for (const x of views) x.s = s; }
  const f = views[0].W * views[0].s / (base.quad[2] - base.quad[0]);
  for (const x of views) {
    const turn = x.dir === 'SE' || x.dir === 'NW';
    x.boxes = base.boxes.map(b => turn ? { hx: +(b.hy * f).toFixed(2), hy: +(b.hx * f).toFixed(2), dx: 0, dy: 0 } : { hx: +(b.hx * f).toFixed(2), hy: +(b.hy * f).toFixed(2), dx: 0, dy: 0 });
    const { hx, hy } = x.boxes[0];
    x.w = x.W * x.s; x.h = x.H * x.s; x.ax = x.bx * x.s - 32 * (hx - hy); x.ay = x.by * x.s - 16 * (hx + hy);
    x.glows = (await findGlows(x.png, { id, w: x.w, cat: base.cat })).map(g => ({ x: +g.x.toFixed(1), y: +g.y.toFixed(1), r: +g.r.toFixed(1) }));
  }
  subjects.push({ id, slug, version, base, views, f });
  console.log(`${id} ${version}: doors ${views.map(x => `${x.dir} ${x.door || '-'}`).join(', ')}; scale ${views.map(x => x.s.toFixed(3)).join('/')}; width ${base.quad[2].toFixed(0)} -> ${views[0].w.toFixed(0)} (footprint x${f.toFixed(2)})`);
}

// 4. shelf-pack onto as many 2048 pages as it takes
const all = subjects.flatMap(sub => sub.views.map(x => ({ sub, x, width: Math.round(x.w * MIP0), height: Math.round(x.h * MIP0) }))).sort((a, b) => b.height - a.height);
const pages = [[]];
let px = GUT, py = GUT, rowH = 0;
for (const p of all) {
  if (p.width + 2 * GUT > PAGE || p.height + 2 * GUT > PAGE) throw new Error(`${p.sub.id} ${p.x.dir} is larger than an atlas page`);
  if (px + p.width + GUT > PAGE) { px = GUT; py += rowH + GUT; rowH = 0; }
  if (py + p.height + GUT > PAGE) { pages.push([]); px = GUT; py = GUT; rowH = 0; }
  p.page = pages.length - 1; p.left = px; p.top = py; pages.at(-1).push(p);
  px += p.width + GUT; rowH = Math.max(rowH, p.height);
}
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(REVIEW, { recursive: true });
for (const [i, page] of pages.entries()) {
  const composite = await Promise.all(page.map(async p => ({ input: await sharp(p.x.png).resize(p.width, p.height, { kernel: 'lanczos3' }).png().toBuffer(), left: p.left, top: p.top })));
  const full = await sharp({ create: { width: PAGE, height: PAGE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(composite).png().toBuffer();
  for (let mip = 0; mip < 5; mip++) await sharp(full).resize(PAGE >> mip, PAGE >> mip).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(OUT, `views-${i}-${mip}.webp`));
}

// the library module: NE replaces the sprite, SE its east art, the rest are appended
const entry = (p, id, name) => {
  const { base } = p.sub, x = p.x;
  return { id, name, cat: base.cat, kind: base.kind, w: +x.w.toFixed(2), h: +x.h.toFixed(2), ax: +x.ax.toFixed(2), ay: +x.ay.toFixed(2), boxes: x.boxes,
    solid: base.solid, big: base.big, door: base.door, cost: base.cost, glows: x.glows,
    tex: [p.page, p.left / PAGE, p.top / PAGE, (p.left + p.width) / PAGE, (p.top + p.height) / PAGE], quad: [0, 0, +x.w.toFixed(2), +x.h.toFixed(2)] };
};
const replace = [], append = [], east = [];
for (const p of all.slice().sort((a, b) => a.sub.id.localeCompare(b.sub.id) || DIRS.indexOf(a.x.dir) - DIRS.indexOf(b.x.dir))) {
  const { id, base } = p.sub, dir = p.x.dir.toLowerCase();
  if (p.x.dir === 'NE') replace.push(entry(p, id, base.name));
  else if (p.x.dir === 'SE' && items.has(`east:${id}`)) replace.push(entry(p, `east:${id}`, items.get(`east:${id}`).name));
  else { append.push(entry(p, `view:${id}:${dir}`, `${base.name} (${p.x.dir} view)`)); if (p.x.dir === 'SE') east.push([id, `view:${id}:se`]); }
}
fs.writeFileSync(path.join(root, 'src/game/views-library.ts'), [
  '// Generated by scripts/assets/prep-views.mjs. Sources and door gauges are in art/building-views (from art/theme-consistency).',
  "import type { LibItem } from './types';",
  "import { OWNER_SCALE, REMOVED_IDS } from './lots/scales';",
  'const removed = new Set(REMOVED_IDS);',
  ...pages.flatMap((_, i) => Array.from({ length: 5 }, (_, m) => `import v${i}m${m} from '../assets/views/views-${i}-${m}.webp';`)),
  `const PAGES: string[][] = [${pages.map((_, i) => `[${Array.from({ length: 5 }, (_, m) => `v${i}m${m}`).join(', ')}]`).join(', ')}];`,
  '/** the NE view of each building (in place of its sprite) and the SE view of the shops with east art (in place of east:<id>) */',
  `const REPLACE: LibItem[] = [\n${replace.map(it => '  ' + JSON.stringify(it)).join(',\n')}\n];`,
  '/** the sprites drawn from the four-view art now (the east art among them is the SE view: turned, no longer the front mirrored) */',
  'export const VIEW_ART: ReadonlySet<string> = new Set(REPLACE.map(it => it.id));',
  '/** the other views, appended: view:<id>:se (the houses), view:<id>:sw, view:<id>:nw */',
  `const APPEND: LibItem[] = [\n${append.map(it => '  ' + JSON.stringify(it)).join(',\n')}\n];`,
  '/** the east-facing (+X) view of the buildings without east art: [sprite id, its SE view] (lettering.ts EAST_FACING) */',
  `export const VIEW_EAST: [string, string][] = ${JSON.stringify(east)};`,
  '/** Last of the appends: replaced sprites keep their index (saves hold it) and take the art of the new pages; the new views go at the end. */',
  'export function appendViews(library: LibItem[], pages: string[][]) {',
  '  const first = pages.length; pages.push(...PAGES);',
  '  const tex = (it: LibItem) => [first + it.tex[0], ...it.tex.slice(1)] as LibItem["tex"];',
  '  for (const it of REPLACE) { const i = library.findIndex(o => o.id === it.id); if (i >= 0) library[i] = { ...library[i]!, ...it, name: library[i]!.name, tex: tex(it) }; }',
  '  for (const it of APPEND) {',
  '    const base = it.id.slice(5, it.id.lastIndexOf(":"));',
  '    if (removed.has(base) || !library.some(o => o.id === base)) continue;',
  '    library.push({ ...it, tex: tex(it) });',
  '    if (OWNER_SCALE[base] !== undefined) OWNER_SCALE[it.id] = OWNER_SCALE[base]!;',
  '  }',
  '}', ''].join('\n'));

// review: every view at its game size (owner scale, at 0.3 zoom) side by side, a 98 px door mark beside each
const tiles = [];
for (const sub of subjects) for (const x of sub.views) {
  const k = owner(sub.id) * 0.3, w = Math.max(1, Math.round(x.w * k)), h = Math.max(1, Math.round(x.h * k)), mark = Math.round(measures.standardDoor * 0.3);
  const img = await sharp(x.png).resize(w, h).png().toBuffer();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w + 30}" height="${h + 22}"><text x="2" y="14" font-size="12" fill="#172a32" font-family="sans-serif">${sub.slug} ${x.dir}${x.door ? '' : ' *'}</text><rect x="${w + 12}" y="${h + 22 - mark}" width="8" height="${mark}" fill="#c0392b"/></svg>`;
  tiles.push({ input: await sharp({ create: { width: w + 30, height: h + 22, channels: 4, background: '#d8e0e3' } }).composite([{ input: img, left: 0, top: 22 }, { input: Buffer.from(svg), left: 0, top: 0 }]).png().toBuffer(), w: w + 30, h: h + 22 });
}
let cx = 0, cy = 0, ch = 0; const placed = [];
for (const t of tiles) { if (cx + t.w > 1600) { cx = 0; cy += ch + 8; ch = 0; } placed.push({ input: t.input, left: cx, top: cy }); cx += t.w + 8; ch = Math.max(ch, t.h); }
await sharp({ create: { width: 1600, height: cy + ch, channels: 4, background: '#d8e0e3' } }).composite(placed).png().toFile(path.join(REVIEW, 'contact.png'));
console.log(`Prepared ${all.length} views of ${subjects.length} buildings on ${pages.length} page(s); review: ${path.relative(root, REVIEW)}/contact.png`);
if (unmeasured.length) console.log(`Unmeasured (kept at the original width; add door gauges to art/building-views/measures.json): ${unmeasured.join(', ')}`);
