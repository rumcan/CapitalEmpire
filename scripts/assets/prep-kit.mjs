// The concept's kit (T231, #671; docs/art/CONCEPT-LOOK.md steps 5 and 8): the art agent's one-view and run-piece pictures (keyed on magenta,
// under art/theme-consistency/generated/: GOLF-ART-LIST items 36 boulders, 43 palms, 45 practice-green lamp posts, 158 pond-edge stones, 159 the
// fountain jet, 160 lily pads, 162 shrubs, 163 flower clumps, 164 the clipped hedge) cut, trimmed and sized into masters the repo keeps:
//   art/concept-kit/<slug>.webp  one picture each (a sheet's pieces, the jet's four frames and the lily clusters cut apart), at most 2x the
//                                 size the game draws it at (lossless WebP; never enlarged), so a fresh clone rebuilds without the sources
//   art/concept-kit/items.json   each master's library entry (id kit:<slug>, kind, footprint, anchor, display size, night glows) and its source
// prep-golf.mjs packs the masters onto the golf page (it had room: the golf art filled about 12% of it) and writes them into golf-library.ts
// (appendKit, the last library the game appends, so no saved index moves).
//   node scripts/assets/prep-kit.mjs [generated-folder]   (default: the main checkout's art/theme-consistency/generated)
//
// Sizes (the game's native px: a 2 m tile is 128 px wide; screen = ((X - Y) * 32, (X + Y) * 16) px for X, Y in metres): an upright is drawn at
// UP = 64 px a metre of its height or width (the people's scale: prep-sprites.mjs draws them at 64), each by the measure GOLF-ART-LIST gives
// (a boulder's, a shrub's and a flower clump's size across; a palm's, a lamp's and the jet's height). A run piece lies on the ground: its
// footprint (len x depth metres along its axis) is a diamond 32 x (len + depth) px wide, which the picture fills, so pieces join end to end.
// A lily cluster is a top-down picture laid flat: turned 45 degrees and squashed to half its height (the map's 2:1 diamond), d metres across
// at 45.25 px a metre (a metre across the screen). Nothing is mirrored: one picture each, the sun at the upper right as painted.
// Run pieces: RUN swapped the axes, so the LEFT piece of a sheet (lower left to upper right on screen) runs along the map's y axis.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { findGlows } from './find-glows.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const main = (() => { try { return path.dirname(path.resolve(root, execSync('git rev-parse --git-common-dir', { cwd: root }).toString().trim())); } catch { return root; } })();
const GEN = path.resolve(process.argv[2] ?? path.join(main, 'art/theme-consistency/generated'));
const OUT = path.join(root, 'art/concept-kit'), REVIEW = path.join(root, 'output/kit-review');
const UP = 64, ACROSS = 45.25, MASTER_MAX = 2;
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');

// ---- the kit: each source picture, how it is cut, and what each piece is
const one = (sheet, slug, name, kind, size, more = {}) => ({ sheet, cut: 'one', out: [{ slug, name, kind, ...size, ...more }] });
const SHRUBS = [['burning-bush', 'Burning bush', 1.5], ['golden-spirea', 'Golden spirea', 1.2], ['boxwood-ball', 'Boxwood ball', 1.0], ['red-twig-dogwood', 'Red-twig dogwood', 1.5], ['blue-juniper', 'Blue juniper', 1.2], ['plume-grass', 'Plume grass', 1.5]];
const FLOWERS = [['mums-red', 'Red mums'], ['mums-yellow', 'Yellow mums'], ['mums-orange', 'Orange mums'], ['mums-white', 'White mums'], ['mums-bronze', 'Bronze mums'], ['black-eyed-susans', 'Black-eyed Susans']];
const BOULDERS = [['small', 'Small boulder', 0.8], ['medium', 'Boulder', 1.5], ['large', 'Large boulder', 2.5]];
const PALMS = [['windmill-4m', 'Windmill palm, 4 m', 4], ['windmill-5m', 'Windmill palm, 5 m', 5], ['windmill-6m', 'Windmill palm, 6 m', 6],
  ['canary-6m', 'Canary palm, 6 m', 6], ['canary-8m', 'Canary palm, 8 m', 8], ['canary-10m', 'Canary palm, 10 m', 10],
  ['dwarf-fan-2m', 'Dwarf fan palm, 2 m', 2], ['dwarf-fan-3m', 'Dwarf fan palm, 3 m', 3], ['dwarf-fan-3-5m', 'Dwarf fan palm, 3.5 m', 3.5]];
export const KIT = [
  // 158: two run pieces and an inner and an outer corner. The art list's piece is 4 x 1 m; laid at that size its stones (seven along a piece)
  // came out about half a metre, small beside the boulders (36) at the uprights' scale, so a piece stands for 8 x 2 m: stones about a metre
  { sheet: 'landscaping/golf-pond-edge-boulders-pieces-v1.png', cut: 'pieces', out: [
    { slug: 'pond-edge-y', name: 'Pond-edge stones (along y)', kind: 'rock', run: { axis: 'y', len: 8, depth: 2 } },
    { slug: 'pond-edge-x', name: 'Pond-edge stones (along x)', kind: 'rock', run: { axis: 'x', len: 8, depth: 2 } },
    { slug: 'pond-edge-inner', name: 'Pond-edge stones (inner corner)', kind: 'rock', across: 2.2, box: 0.8 },
    { slug: 'pond-edge-outer', name: 'Pond-edge stones (outer corner)', kind: 'rock', across: 2.2, box: 0.8 },
  ] },
  // 164: the clipped hedge, 0.7 m deep and 0.9 m high: two run pieces and an end block, 4 m a piece (the privacy panels' length)
  { sheet: 'landscaping/golf-clipped-hedge-pieces-v1.png', cut: 'pieces', out: [
    { slug: 'hedge-y', name: 'Clipped hedge (along y)', kind: 'fencey', run: { axis: 'y', len: 4, depth: 0.7 } },
    { slug: 'hedge-x', name: 'Clipped hedge (along x)', kind: 'fencex', run: { axis: 'x', len: 4, depth: 0.7 } },
    { slug: 'hedge-end', name: 'Clipped hedge (end block)', kind: 'shrub', tall: 0.9, box: 0.4 },
  ] },
  // 159: the jet, four frames of a loop in four 344 px columns, 4 m high and 1.5 m across: cut alike so the frames stand on one spot
  { sheet: 'props/golf-fountain-jet-4frames-v1.png', cut: 'columns', n: 4, out: [0, 1, 2, 3].map(f => ({ slug: `fountain-jet-${f}`, name: `Fountain jet (frame ${f + 1})`, kind: 'fountain', tall: 4, box: 0.75 })) },
  // 160: four lily clusters, top-down, on a 2 x 2 grid, about 2.4 m across
  { sheet: 'landscaping/golf-lily-pads-top-v1.png', cut: 'grid2', out: ['a', 'b', 'c', 'd'].map(v => ({ slug: `lily-pads-${v}`, name: `Lily pads (${v})`, kind: 'decal', flat: 2.4 })) },
  // 162 shrubs, 163 flower clumps (0.6 m), 36 boulders, 43 palms, 45 lamp posts (3.5 m)
  ...SHRUBS.map(([s, n, m]) => one(`landscaping/golf-shrub-${s}-1view-v1.png`, `shrub-${s}`, n, 'shrub', { across: m, box: m * 0.35 })),
  ...FLOWERS.map(([s, n]) => one(`landscaping/golf-flowers-${s}-1view-v1.png`, `flowers-${s}`, n, 'flower', { across: 0.6, box: 0.25 })),
  ...BOULDERS.flatMap(([s, n, m]) => ['a', 'b', 'c'].map(v => one(`landscaping/golf-boulder-${s}-${v}-1view-v1.png`, `boulder-${s}-${v}`, `${n} (${v})`, 'rock', { across: m, box: m * 0.4 }))),
  ...PALMS.map(([s, n, m]) => one(`trees/golf-palm-${s}-1view-v1.png`, `palm-${s}`, n, 'palm', { tall: m, box: /dwarf/.test(s) ? 0.5 : 0.4 })),
  one('props/golf-practice-green-lamp-post-single-1view-v1.png', 'lamp-post-single', 'Practice green lamp post', 'lamp', { tall: 3.5, box: 0.2 }),
  one('props/golf-practice-green-lamp-post-twin-1view-v1.png', 'lamp-post-twin', 'Practice green lamp post, twin', 'lamp', { tall: 3.5, box: 0.25 }),
];
/** the library's cost of each kind (the lot lab's; the Props tool's prices are golf/decor.ts's) */
const COST = { fencex: 60, fencey: 60, rock: 300, fountain: 3500, decal: 40, shrub: 80, flower: 40, palm: 400, lamp: 450 };

// ---- pictures
const raw = async buf => sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
/** the connected pieces of an alpha mask (8-neighbours, alpha > 8), each its pixel count and box; grow > 0 joins specks within that many px */
function components(data, W, H, grow = 0) {
  const solid = new Uint8Array(W * H); for (let p = 0; p < W * H; p++) solid[p] = data[p * 4 + 3] > 8 ? 1 : 0;
  let mask = solid;
  if (grow > 0) { // a box dilation (separable) so a flower or a pebble a few px off its piece joins it
    const t = new Uint8Array(W * H), d = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) { let run = -1e9; for (let x = 0; x < W; x++) { if (solid[y * W + x]) run = x; t[y * W + x] = x - run <= grow ? 1 : 0; } run = 1e9; for (let x = W - 1; x >= 0; x--) { if (solid[y * W + x]) run = x; if (run - x <= grow) t[y * W + x] = 1; } }
    for (let x = 0; x < W; x++) { let run = -1e9; for (let y = 0; y < H; y++) { if (t[y * W + x]) run = y; d[y * W + x] = y - run <= grow ? 1 : 0; } run = 1e9; for (let y = H - 1; y >= 0; y--) { if (t[y * W + x]) run = y; if (run - y <= grow) d[y * W + x] = 1; } }
    mask = d;
  }
  const label = new Int32Array(W * H).fill(-1), stack = new Int32Array(W * H), out = [];
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || label[s] >= 0) continue;
    const id = out.length, c = { id, n: 0, x0: W, y0: H, x1: -1, y1: -1 }; let top = 0; stack[top++] = s; label[s] = id;
    while (top) {
      const p = stack[--top], px = p % W, py = (p - px) / W;
      if (solid[p]) { c.n++; c.x0 = Math.min(c.x0, px); c.x1 = Math.max(c.x1, px); c.y0 = Math.min(c.y0, py); c.y1 = Math.max(c.y1, py); }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = px + dx, y = py + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const q = y * W + x; if (mask[q] && label[q] < 0) { label[q] = id; stack[top++] = q; }
      }
    }
    out.push(c);
  }
  return { list: out.filter(c => c.n > 0), label };
}
/** a region of the picture, the pixels of the given labels only (others cleared) */
function crop(data, W, label, keep, x0, y0, x1, y1) {
  const w = x1 - x0 + 1, h = y1 - y0 + 1, out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p = (y0 + y) * W + x0 + x; if (!label || keep.has(label[p])) data.copy(out, (y * w + x) * 4, p * 4, p * 4 + 4); }
  return { w, h, rgba: out };
}
/** the alpha box of an rgba buffer */
function alphaBox(rgba, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rgba[(y * w + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}
/** the mean x of the opaque pixels in the picture's lowest rows (the base of a trunk or a post), px from its left */
function baseX(rgba, w, h) {
  let sum = 0, n = 0;
  for (let y = h - 1; y >= Math.max(0, h - Math.max(3, Math.round(h * 0.05))); y--) for (let x = 0; x < w; x++) { const a = rgba[(y * w + x) * 4 + 3]; if (a > 128) { sum += x; n++; } }
  return n ? sum / n : w / 2;
}

/** cut one source into its pieces: { rgba, w, h } each, in the order of the entry's out list */
async function cutSheet(entry, file) {
  const { data, info } = await raw(fs.readFileSync(file)), W = info.width, H = info.height;
  if (entry.cut === 'one') {
    // the largest piece and every piece of 200+ px (prep-golf.mjs's rule): small detached specks are left out
    const { list, label } = components(data, W, H), big = list.reduce((a, b) => (b.n > a.n ? b : a)), keep = new Set(list.filter(c => c === big || c.n >= 200).map(c => c.id));
    const ks = list.filter(c => keep.has(c.id)), x0 = Math.min(...ks.map(c => c.x0)), y0 = Math.min(...ks.map(c => c.y0)), x1 = Math.max(...ks.map(c => c.x1)), y1 = Math.max(...ks.map(c => c.y1));
    return [{ ...crop(data, W, label, keep, x0, y0, x1, y1), rect: [x0, y0, x1, y1] }];
  }
  if (entry.cut === 'pieces') {
    // the sheet's pieces: groups of pixels within 14 px of each other, the n biggest; read top row then bottom row, each left to right
    const n = entry.out.length, { list, label } = components(data, W, H, 14);
    const pieces = list.sort((a, b) => b.n - a.n).slice(0, n);
    if (pieces.length < n) throw new Error(`${entry.sheet}: ${pieces.length} pieces, ${n} expected`);
    const rowSplit = (Math.min(...pieces.map(c => (c.y0 + c.y1) / 2)) + Math.max(...pieces.map(c => (c.y0 + c.y1) / 2))) / 2;
    pieces.sort((a, b) => Number((a.y0 + a.y1) / 2 > rowSplit) - Number((b.y0 + b.y1) / 2 > rowSplit) || a.x0 - b.x0);
    return pieces.map(c => ({ ...crop(data, W, label, new Set([c.id]), c.x0, c.y0, c.x1, c.y1), rect: [c.x0, c.y0, c.x1, c.y1] }));
  }
  if (entry.cut === 'columns') {
    // equal columns; one box for all of them (the union of each column's alpha box), so the frames keep one anchor
    const n = entry.n, cw = Math.floor(W / n), boxes = [];
    for (let k = 0; k < n; k++) { const c = crop(data, W, null, null, k * cw, 0, k * cw + cw - 1, H - 1), b = alphaBox(c.rgba, c.w, c.h); if (!b) throw new Error(`${entry.sheet}: column ${k} is empty`); boxes.push(b); }
    const u = { x0: Math.min(...boxes.map(b => b.x0)), y0: Math.min(...boxes.map(b => b.y0)), x1: Math.max(...boxes.map(b => b.x1)), y1: Math.max(...boxes.map(b => b.y1)) };
    return boxes.map((_, k) => ({ ...crop(data, W, null, null, k * cw + u.x0, u.y0, k * cw + u.x1, u.y1), rect: [k * cw + u.x0, u.y0, k * cw + u.x1, u.y1] }));
  }
  if (entry.cut === 'grid2') {
    // a 2 x 2 grid, each cell trimmed to its alpha
    const hw = Math.floor(W / 2), hh = Math.floor(H / 2), out = [];
    for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const c = crop(data, W, null, null, cx * hw, cy * hh, cx * hw + hw - 1, cy * hh + hh - 1), b = alphaBox(c.rgba, c.w, c.h);
      if (!b) throw new Error(`${entry.sheet}: cell ${cx},${cy} is empty`);
      out.push({ ...crop(c.rgba, c.w, null, null, b.x0, b.y0, b.x1, b.y1), rect: [cx * hw + b.x0, cy * hh + b.y0, cx * hw + b.x1, cy * hh + b.y1] });
    }
    return out;
  }
  throw new Error(`unknown cut ${entry.cut}`);
}

/** a top-down picture laid flat on the map: turned 45 degrees (the map's +x runs to the screen's lower right) and squashed to half its height */
async function layFlat(p) {
  const turned = await sharp(p.rgba, { raw: { width: p.w, height: p.h, channels: 4 } }).rotate(45, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).raw().toBuffer({ resolveWithObject: true });
  const tw = turned.info.width, th = turned.info.height;
  const flat = await sharp(turned.data, { raw: { width: tw, height: th, channels: 4 } }).resize(tw, Math.max(1, Math.round(th / 2)), { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
  const b = alphaBox(flat.data, flat.info.width, flat.info.height);
  return { ...crop(flat.data, flat.info.width, null, null, b.x0, b.y0, b.x1, b.y1), rect: p.rect };
}

// ---- size, anchor and footprint of each piece (native display px at scale 1; boxes in metres)
function geometry(o, p) {
  const r3 = v => +v.toFixed(3);
  if (o.run) {
    // a run piece along its axis: the picture is its footprint's diamond, 32 x (len + depth) px wide. The hedge's length is read off its
    // picture: a box len x depth x high seen in 2:1 is 32 (len + depth) wide and 16 (len + depth) + UP x high tall, so
    // (len + depth) = UP x high / (32 h / w - 16)
    const len = o.run.len ?? Math.max(1, (UP * o.run.high) / (32 * p.h / p.w - 16) - o.run.depth), span = len + o.run.depth, w = 32 * span, k = w / p.w, h = p.h * k;
    const hx = o.run.axis === 'x' ? len / 2 : o.run.depth / 2, hy = o.run.axis === 'x' ? o.run.depth / 2 : len / 2;
    return { w: r3(w), h: r3(h), ax: r3(w / 2), ay: r3(h - 8 * span), boxes: [{ hx: r3(hx), hy: r3(hy), dx: 0, dy: 0 }], len: r3(len) };
  }
  if (o.flat) {
    // laid flat: d metres across the screen at ACROSS px a metre; the ground point its middle
    const w = ACROSS * o.flat, k = w / p.w, h = p.h * k, b = o.flat * 0.35;
    return { w: r3(w), h: r3(h), ax: r3(w / 2), ay: r3(h / 2), boxes: [{ hx: r3(b), hy: r3(b), dx: 0, dy: 0 }] };
  }
  // an upright: its height (tall) or its width (across) at UP px a metre; its ground point the base's centre (the mean x of its lowest rows,
  // half its footprint's diamond above its lowest pixel)
  const k = o.tall ? (UP * o.tall) / p.h : (UP * o.across) / p.w, w = p.w * k, h = p.h * k, box = o.box;
  return { w: r3(w), h: r3(h), ax: r3(baseX(p.rgba, p.w, p.h) * k), ay: r3(h - 16 * box), boxes: [{ hx: r3(box), hy: r3(box), dx: 0, dy: 0 }] };
}

// ---- run
if (!fs.existsSync(GEN)) throw new Error(`no generated art at ${GEN}: pass the folder (the main checkout's art/theme-consistency/generated)`);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(REVIEW, { recursive: true });
const items = [], review = [];
for (const entry of KIT) {
  const file = path.join(GEN, entry.sheet);
  if (!fs.existsSync(file)) { console.log(`${entry.sheet}: not made yet, skipped`); continue; }
  const buf = fs.readFileSync(file), prov = (() => { try { return JSON.parse(fs.readFileSync(file.replace(/\.png$/, '.provenance.json'), 'utf8')); } catch { return {}; } })();
  let pieces = await cutSheet(entry, file);
  if (entry.cut === 'grid2') pieces = await Promise.all(pieces.map(layFlat));
  for (const [i, o] of entry.out.entries()) {
    const p = pieces[i], g = geometry(o, p);
    // the master: at most MASTER_MAX x its drawn size (never enlarged)
    const mk = Math.min(1, (MASTER_MAX * g.w) / p.w), mw = Math.max(1, Math.round(p.w * mk)), mh = Math.max(1, Math.round(p.h * mk));
    const png = await sharp(p.rgba, { raw: { width: p.w, height: p.h, channels: 4 } }).resize(mw, mh, { kernel: 'lanczos3', fit: 'fill' }).webp({ lossless: true, effort: 6 }).toBuffer();
    fs.writeFileSync(path.join(OUT, `${o.slug}.webp`), png);
    const glows = o.kind === 'lamp' ? (await findGlows(png, { id: `kit:${o.slug}`, w: g.w, cat: 'Concept kit' })).map(q => ({ x: +q.x.toFixed(1), y: +q.y.toFixed(1), r: +q.r.toFixed(1) })) : [];
    const { len, ...geo } = g;
    items.push({
      id: `kit:${o.slug}`, name: o.name, cat: 'Concept kit', kind: o.kind, ...geo, solid: o.kind === 'decal' || o.kind === 'fountain' ? 0 : 1, big: false, door: false, cost: COST[o.kind] ?? 100,
      ...(glows.length ? { glows } : {}),
      ...(len !== undefined ? { run: { axis: o.run.axis, len } } : {}),
      src: { sheet: entry.sheet, rect: p.rect, sha256: sha(buf), id: prov.id, generationId: prov.generationId, model: prov.runModel ?? prov.model, review: prov.reviewStatus },
    });
    review.push({ slug: o.slug, png, g });
    console.log(`kit:${o.slug} ${o.kind}: ${p.w}x${p.h} px cut from ${entry.sheet} [${p.rect.join(',')}] -> ${g.w.toFixed(0)}x${g.h.toFixed(0)} display px${len !== undefined ? `, ${len.toFixed(2)} m a piece` : ''}${glows.length ? `, ${glows.length} glows` : ''}`);
  }
}
fs.writeFileSync(path.join(OUT, 'items.json'), JSON.stringify({
  note: 'Generated by scripts/assets/prep-kit.mjs from the art agent\'s keyed pictures (T231). prep-golf.mjs packs the masters (art/concept-kit/<slug>.webp) onto the golf page.',
  items,
}, null, 1) + '\n');
// a review sheet: every master at its display size on grey, with its name
const cols = 8, cell = 240, rows = Math.ceil(review.length / cols), comp = [];
for (const [i, r] of review.entries()) {
  const k = Math.min(1, (cell - 20) / Math.max(r.g.w, r.g.h - 0)), w = Math.max(1, Math.round(r.g.w * k)), h = Math.max(1, Math.round(r.g.h * k));
  comp.push({ input: await sharp(r.png).resize(w, h, { fit: 'fill' }).png().toBuffer(), left: (i % cols) * cell + Math.floor((cell - w) / 2), top: Math.floor(i / cols) * (cell + 20) + (cell - h) });
  comp.push({ input: Buffer.from(`<svg width="${cell}" height="20"><text x="${cell / 2}" y="14" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#172a32">${r.slug}</text></svg>`), left: (i % cols) * cell, top: Math.floor(i / cols) * (cell + 20) + cell });
}
await sharp({ create: { width: cols * cell, height: rows * (cell + 20), channels: 4, background: '#c9d2cf' } }).composite(comp).png().toFile(path.join(REVIEW, 'contact.png'));
console.log(`${items.length} kit pictures into ${path.relative(root, OUT)}; review sheet ${path.relative(root, path.join(REVIEW, 'contact.png'))}`);
