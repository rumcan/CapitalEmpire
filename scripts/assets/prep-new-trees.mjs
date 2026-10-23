// The generated four-view trees (the other AI's sheets, 2026-10-23): each sheet is one tree in four true rotations on a transparent 2 x 2 grid
// (top left NE, top right SE, bottom left SW, bottom right NW) under the fixed sun from the right. Every view becomes a tree in the library
// (gen:tree-<name>:ne|se|sw|nw), so the lots, the scatter, the farms and the golf holes deal them like the other trees.
//   node scripts/assets/prep-new-trees.mjs
// Sources are copied once into art/trees-generated/<name>.png (sources.json keeps where each came from). Each tree takes the on-map height of
// the library tree of its kind (REF) times its factor, one scale for its four views; its footprint is the reference's, scaled the same way;
// its ground point is the foot of the trunk. Writes src/assets/trees-gen/trees-gen-<mip>.webp and src/game/trees-library.ts (appendTrees).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(root, 'art/trees-generated'), OUT = path.join(root, 'src/assets/trees-gen'), PAGE = 2048, GUT = 16, MIP0 = 0.6;
const GEN = 'C:/Users/Francois Smit/.codex/generated_images/01a15fe8-e26f-72b1-94e3-874ef3d8db8b';
/** name, display name, source picture, the library tree whose size it takes, height factor */
const TREES = [
  ['maple-scarlet', 'Scarlet maple', 'exec-ced18307-f387-4ee3-8abb-47abb64e24fc.png', 'capital:tree-maple-open', 1],
  ['oak-amber', 'Amber oak', 'exec-15b8299a-76fe-44c4-8e4a-3b8c7f3b66f2.png', 'capital:tree-oak-open', 1],
  ['spruce-young', 'Young spruce', 'exec-5224e8f5-7bcf-4adf-a62f-9c8f39d90e38.png', 'capital:tree-spruce-open', 0.65],
  ['aspen-young', 'Young aspen', 'exec-ffe2eac7-0d07-40a4-9ec7-226277e9d723.png', 'capital:tree-birch-open', 0.85],
  ['fir-tall', 'Tall fir', 'exec-bad650c5-cbd6-41db-84a0-02ccae46ff10.png', 'capital:tree-spruce-open', 1],
  ['oak-crimson', 'Crimson oak', 'exec-91f7e757-6f58-4457-bf90-760913281bf1.png', 'capital:tree-oak-open', 1],
  ['maple-ember', 'Ember maple', 'exec-8e86e0b3-58cc-468e-966b-13b460825991.png', 'capital:tree-maple-open', 0.9],
];
const DIRS = ['NE', 'SE', 'SW', 'NW'];

// copy the sources in (once: the repository keeps them)
fs.mkdirSync(SRC, { recursive: true });
const sourcesFile = path.join(SRC, 'sources.json'), sources = fs.existsSync(sourcesFile) ? JSON.parse(fs.readFileSync(sourcesFile, 'utf8')) : {};
for (const [name, , file] of TREES) {
  const to = path.join(SRC, `${name}.png`);
  if (!fs.existsSync(to)) { fs.copyFileSync(path.join(GEN, file), to); }
  sources[name] = { from: `${GEN}/${file}`, sha256: crypto.createHash('sha256').update(fs.readFileSync(to)).digest('hex') };
}
fs.writeFileSync(sourcesFile, JSON.stringify(sources, null, 1) + '\n');

// the reference trees
const lib = fs.readFileSync(path.join(root, 'src/game/library.ts'), 'utf8');
const item = id => JSON.parse(new RegExp(`\\{"id":"${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^\\n]*\\}`).exec(lib)[0]);

/** the four cells of a sheet, each trimmed to its art (alpha > 8; specks under 2% of the tree's largest piece are dropped), with the foot of
 *  the trunk (the lowest opaque rows' middle) */
async function cells(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), W = info.width, H = info.height;
  const out = [];
  for (let c = 0; c < 4; c++) {
    const cx0 = (c % 2) * Math.floor(W / 2), cy0 = Math.floor(c / 2) * Math.floor(H / 2), cw = Math.floor(W / 2), chh = Math.floor(H / 2);
    const at = (x, y) => ((cy0 + y) * W + cx0 + x) * 4, lab = new Int32Array(cw * chh).fill(-1), sizes = [];
    for (let s0 = 0; s0 < cw * chh; s0++) {
      if (lab[s0] >= 0 || data[at(s0 % cw, Math.floor(s0 / cw)) + 3] <= 8) continue;
      const id = sizes.length, st = [s0]; lab[s0] = id; let n = 0;
      while (st.length) { const q = st.pop(), x = q % cw, y = Math.floor(q / cw); n++;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= cw || Y >= chh) continue; const r = Y * cw + X; if (lab[r] < 0 && data[at(X, Y) + 3] > 8) { lab[r] = id; st.push(r); } } }
      sizes.push(n);
    }
    const keep = Math.max(...sizes) * 0.02, rgba = Buffer.alloc(cw * chh * 4);
    let x0 = cw, y0 = chh, x1 = -1, y1 = -1;
    for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) { const l = lab[y * cw + x]; if (l < 0 || sizes[l] < keep) continue; data.copy(rgba, (y * cw + x) * 4, at(x, y), at(x, y) + 4); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 < 0) throw new Error(`${file}: cell ${c} is empty`);
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    let fx = 0, n = 0;
    for (let y = y1; y >= y1 - 2; y--) for (let x = x0; x <= x1; x++) if (rgba[(y * cw + x) * 4 + 3] > 128) { fx += x - x0; n++; }
    const png = await sharp(rgba, { raw: { width: cw, height: chh, channels: 4 } }).extract({ left: x0, top: y0, width: w, height: h }).png().toBuffer();
    out.push({ dir: DIRS[c], png, W: w, H: h, footX: n ? fx / n : w / 2 });
  }
  return out;
}

const all = [];
for (const [name, label, , refId, factor] of TREES) {
  const ref = item(refId), views = await cells(path.join(SRC, `${name}.png`));
  const s = ref.h * factor / views[0].H; // one scale for the four views: the NE view as tall as the reference (times the factor)
  for (const v of views) all.push({ name, label, ref, factor, ...v, w: v.W * s, h: v.H * s, ax: v.footX * s, ay: v.H * s - 3 * factor });
}

// pack onto one page (more if needed)
const packed = all.map(p => ({ p, width: Math.round(p.w * MIP0), height: Math.round(p.h * MIP0) })).sort((a, b) => b.height - a.height);
const pages = [[]]; let px = GUT, py = GUT, rowH = 0;
for (const q of packed) {
  if (px + q.width + GUT > PAGE) { px = GUT; py += rowH + GUT; rowH = 0; }
  if (py + q.height + GUT > PAGE) { pages.push([]); px = GUT; py = GUT; rowH = 0; }
  q.page = pages.length - 1; q.left = px; q.top = py; pages.at(-1).push(q); px += q.width + GUT; rowH = Math.max(rowH, q.height);
}
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
for (const [i, page] of pages.entries()) {
  const composite = await Promise.all(page.map(async q => ({ input: await sharp(q.p.png).resize(q.width, q.height, { kernel: 'lanczos3' }).png().toBuffer(), left: q.left, top: q.top })));
  const full = await sharp({ create: { width: PAGE, height: PAGE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(composite).png().toBuffer();
  for (let mip = 0; mip < 5; mip++) await sharp(full).resize(PAGE >> mip, PAGE >> mip).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(OUT, `trees-gen-${i}-${mip}.webp`));
}
const items = packed.slice().sort((a, b) => TREES.findIndex(t => t[0] === a.p.name) - TREES.findIndex(t => t[0] === b.p.name) || DIRS.indexOf(a.p.dir) - DIRS.indexOf(b.p.dir)).map(q => {
  const { p } = q, r = p.ref;
  return { id: `gen:tree-${p.name}:${p.dir.toLowerCase()}`, name: `${p.label} (${p.dir})`, cat: r.cat, kind: 'tree', w: +p.w.toFixed(2), h: +p.h.toFixed(2), ax: +p.ax.toFixed(2), ay: +p.ay.toFixed(2),
    boxes: r.boxes.map(b => ({ hx: +(b.hx * p.factor).toFixed(2), hy: +(b.hy * p.factor).toFixed(2), dx: 0, dy: 0 })), solid: r.solid, big: r.big, door: false, cost: r.cost,
    tex: [q.page, q.left / PAGE, q.top / PAGE, (q.left + q.width) / PAGE, (q.top + q.height) / PAGE], quad: [0, 0, +p.w.toFixed(2), +p.h.toFixed(2)] };
});
fs.writeFileSync(path.join(root, 'src/game/trees-library.ts'), [
  '// Generated by scripts/assets/prep-new-trees.mjs. Sources are in art/trees-generated (the other AI\'s four-view tree sheets).',
  "import type { LibItem } from './types';",
  "import { OWNER_SCALE, REMOVED_IDS } from './lots/scales';",
  'const removed = new Set(REMOVED_IDS);',
  ...pages.flatMap((_, i) => Array.from({ length: 5 }, (_, m) => `import t${i}m${m} from '../assets/trees-gen/trees-gen-${i}-${m}.webp';`)),
  `const PAGES: string[][] = [${pages.map((_, i) => `[${Array.from({ length: 5 }, (_, m) => `t${i}m${m}`).join(', ')}]`).join(', ')}];`,
  `const ITEMS: LibItem[] = [\n${items.map(it => '  ' + JSON.stringify(it)).join(',\n')}\n];`,
  '/** Appended after the four-view buildings: new indices only. Their size is in w and h (owner scale 1, as the library trees they match). */',
  'export function appendTrees(library: LibItem[], pages: string[][]) {',
  '  const first = pages.length; pages.push(...PAGES);',
  '  for (const it of ITEMS) if (!removed.has(it.id)) { library.push({ ...it, tex: [first + it.tex[0], ...it.tex.slice(1)] as LibItem["tex"] }); OWNER_SCALE[it.id] ??= 1; }',
  '}', ''].join('\n'));
console.log(`${items.length} trees from ${TREES.length} sheets on ${pages.length} page(s)`);
