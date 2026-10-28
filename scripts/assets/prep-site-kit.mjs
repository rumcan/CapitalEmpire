// The building-site kit (T232, #673; docs/art/CONCEPT-LOOK.md step 9): the art agent's keyed pictures (on magenta, under
// art/theme-consistency/generated/: GOLF-ART-LIST items 169 the timber frame going up, 170 lumber stacks, 171 dirt and gravel heaps) cut,
// trimmed and sized into masters the repo keeps:
//   art/construction/site-kit/<slug>.webp  one picture each (the frame's two views cut apart), at most 2x the size the game draws it at
//                                          (lossless WebP; never enlarged), so a fresh clone rebuilds without the sources
//   art/construction/site-kit/items.json   each master's footprint (metres), display size and ground point (native px) and its source
// prep-construction.mjs packs the masters onto the construction page after the digger (that page had room: its art filled the top 150 px
// rows of 2048), so no atlas page is added and the GPU plan is unchanged. 168 the excavator is blocked in RUN: the library's digger stands in.
//   node scripts/assets/prep-site-kit.mjs [generated-folder]   (default: the main checkout's art/theme-consistency/generated)
//
// Sizes (the game's native px: a 2 m tile is 128 px wide; screen = ((X - Y) * 32, (X + Y) * 16) px for X, Y in metres). A box-like piece
// (a lumber stack, the frame) is sized by its footprint: Lx x Ly metres is a diamond 32 (Lx + Ly) px wide, which the picture's width fills;
// the footprints follow each picture's own proportions (its two lower faces' widths). A heap is round: d metres across is 32 sqrt(2) d px
// wide. Its ground point is the middle of the picture's left and right ground corners (the lowest opaque pixel in its outermost columns),
// so a picture drawn a little steeper than the map's 2:1 still stands centred on its footprint. Nothing is mirrored: the game draws each
// picture as painted (the sun at the upper right), the frame's view 1 or view 2 by the lot's facing (compose.ts site).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const main = (() => { try { return path.dirname(path.resolve(root, execSync('git rev-parse --git-common-dir', { cwd: root }).toString().trim())); } catch { return root; } })();
const GEN = path.resolve(process.argv[2] ?? path.join(main, 'art/theme-consistency/generated'));
const OUT = path.join(root, 'art/construction/site-kit'), REVIEW = path.join(root, 'output/site-kit-review');
const MASTER_MAX = 2;
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');

/** the kit: each source, how it is cut, and each piece's id, name and size. box: the footprint (metres, Lx along the map's X, Ly along Y);
 *  round: a heap's diameter (metres) and its footprint's side (the box the lots keep clear) */
export const SITE_KIT = [
  { sheet: 'props/golf-lumber-stack-a-1view-v1.png', out: [{ slug: 'site-lumber-a', name: 'Lumber stack (long)', box: [1.8, 3.2] }] },
  { sheet: 'props/golf-lumber-stack-b-1view-v1.png', out: [{ slug: 'site-lumber-b', name: 'Lumber stack (tall, a plank leaning)', box: [1.6, 1.2] }] },
  { sheet: 'props/golf-lumber-stack-c-1view-v1.png', out: [{ slug: 'site-lumber-c', name: 'Lumber stack (under a tarp)', box: [1.4, 3.3] }] },
  { sheet: 'props/golf-heap-earth-1view-v1.png', out: [{ slug: 'site-heap-earth', name: 'Heap of earth', round: [3, 2.4] }] },
  { sheet: 'props/golf-heap-gravel-1view-v1.png', out: [{ slug: 'site-heap-gravel', name: 'Heap of gravel', round: [3, 2.4] }] },
  { sheet: 'props/golf-heap-sand-1view-v1.png', out: [{ slug: 'site-heap-sand', name: 'Heap of sand', round: [3, 2.4] }] },
  // 169: two views side by side (provisional). They read as one frame turned half round: the gable ends stay on the same two walls (lower
  // left and upper right) and the lumber inside moves from the front right to the back left. 12 x 9 m in the art list (108 m2); the picture's
  // plan is square, so 10.4 m a side
  { sheet: 'buildings/golf-timber-frame-2views-v1.png', cut: 'halves', out: [
    { slug: 'timber-frame-1', name: 'Timber frame going up (view 1)', box: [10.4, 10.4], big: true },
    { slug: 'timber-frame-2', name: 'Timber frame going up (view 2)', box: [10.4, 10.4], big: true },
  ] },
];

const raw = async buf => sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
/** the alpha box of an rgba region (alpha > 8), or null */
function alphaBox(data, W, x0, y0, x1, y1) {
  let bx0 = Infinity, by0 = Infinity, bx1 = -1, by1 = -1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (data[(y * W + x) * 4 + 3] > 8) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
  return bx1 < 0 ? null : { x0: bx0, y0: by0, x1: bx1, y1: by1 };
}
/** a region copied out */
function crop(data, W, b) {
  const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1, out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) data.copy(out, y * w * 4, ((b.y0 + y) * W + b.x0) * 4, ((b.y0 + y) * W + b.x1 + 1) * 4);
  return { w, h, rgba: out };
}
/** the ground corners of a trimmed picture: the lowest opaque pixel (alpha > 128) in its 3 outermost columns on each side, and the picture's
 *  lowest row */
function corners(p) {
  const low = (xs) => { let y = -1; for (const x of xs) for (let r = p.h - 1; r >= 0; r--) if (p.rgba[(r * p.w + x) * 4 + 3] > 128) { y = Math.max(y, r); break; } return y; };
  const yL = low([0, 1, 2]), yR = low([p.w - 1, p.w - 2, p.w - 3]);
  return { yL: yL < 0 ? p.h - 1 : yL, yR: yR < 0 ? p.h - 1 : yR };
}
/** a source cut into its pieces, in the order of the entry's out list */
async function cutSheet(entry, file) {
  const { data, info } = await raw(fs.readFileSync(file)), W = info.width, H = info.height;
  const boxes = [];
  if (entry.cut === 'halves') {
    // two views side by side: split at the middle of the widest run of clear columns near the sheet's middle
    const clear = x => { for (let y = 0; y < H; y++) if (data[(y * W + x) * 4 + 3] > 8) return false; return true; };
    let best = null;
    for (let x = Math.floor(W * 0.3); x < Math.ceil(W * 0.7); x++) {
      if (!clear(x)) continue; let e = x; while (e + 1 < W && clear(e + 1)) e++;
      if (!best || e - x > best[1] - best[0]) best = [x, e]; x = e;
    }
    if (!best) throw new Error(`${entry.sheet}: no clear gap between its two views`);
    const mid = Math.floor((best[0] + best[1]) / 2);
    for (const [x0, x1] of [[0, mid], [mid + 1, W - 1]]) { const b = alphaBox(data, W, x0, 0, x1, H - 1); if (!b) throw new Error(`${entry.sheet}: an empty view`); boxes.push(b); }
  } else boxes.push(alphaBox(data, W, 0, 0, W - 1, H - 1));
  return boxes.map(b => ({ ...crop(data, W, b), rect: [b.x0, b.y0, b.x1, b.y1] }));
}

/** a piece's display size, ground point and footprint (native px at scale 1; boxes as the library's: half extents in metres) */
function geometry(o, p) {
  const r3 = v => +v.toFixed(3), w = o.box ? 32 * (o.box[0] + o.box[1]) : 32 * Math.SQRT2 * o.round[0], k = w / p.w, h = p.h * k;
  const c = corners(p), ay = ((c.yL + c.yR) / 2 + 0.5) * k;
  const [hx, hy] = o.box ? [o.box[0] / 2, o.box[1] / 2] : [o.round[1] / 2, o.round[1] / 2];
  return { w: r3(w), h: r3(h), ax: r3(w / 2), ay: r3(Math.min(h, ay)), boxes: [{ hx: r3(hx), hy: r3(hy), dx: 0, dy: 0 }] };
}

if (!fs.existsSync(GEN)) throw new Error(`no generated art at ${GEN}: pass the folder (the main checkout's art/theme-consistency/generated)`);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(REVIEW, { recursive: true });
const items = [], review = [];
for (const entry of SITE_KIT) {
  const file = path.join(GEN, entry.sheet);
  if (!fs.existsSync(file)) throw new Error(`${entry.sheet}: not found under ${GEN}`);
  const buf = fs.readFileSync(file), prov = (() => { try { return JSON.parse(fs.readFileSync(file.replace(/\.png$/, '.provenance.json'), 'utf8')); } catch { return {}; } })();
  const pieces = await cutSheet(entry, file);
  for (const [i, o] of entry.out.entries()) {
    const p = pieces[i], g = geometry(o, p);
    const mk = Math.min(1, (MASTER_MAX * g.w) / p.w), mw = Math.max(1, Math.round(p.w * mk)), mh = Math.max(1, Math.round(p.h * mk));
    const webp = await sharp(p.rgba, { raw: { width: p.w, height: p.h, channels: 4 } }).resize(mw, mh, { kernel: 'lanczos3', fit: 'fill' }).webp({ lossless: true, effort: 6 }).toBuffer();
    fs.writeFileSync(path.join(OUT, `${o.slug}.webp`), webp);
    items.push({ id: `construction:${o.slug}`, name: o.name, ...g, big: !!o.big, src: { sheet: entry.sheet, rect: p.rect, sha256: sha(buf), id: prov.id, generationId: prov.generationId, model: prov.runModel ?? prov.model, review: prov.reviewStatus } });
    review.push({ slug: o.slug, webp, g });
    console.log(`construction:${o.slug}: ${p.w}x${p.h} px cut from ${entry.sheet} [${p.rect.join(',')}] -> ${g.w.toFixed(0)}x${g.h.toFixed(0)} display px, ground point ${g.ax.toFixed(0)},${g.ay.toFixed(0)}; master ${mw}x${mh}`);
  }
}
fs.writeFileSync(path.join(OUT, 'items.json'), JSON.stringify({
  note: 'Generated by scripts/assets/prep-site-kit.mjs from the art agent\'s keyed pictures (T232). prep-construction.mjs packs the masters (art/construction/site-kit/<slug>.webp) onto the construction page.',
  items,
}, null, 1) + '\n');
// a review sheet: every master at its display size on grey, its footprint's diamond under its ground point, and its name
const cell = 360, comp = [];
for (const [i, r] of review.entries()) {
  const k = Math.min(1, (cell - 20) / Math.max(r.g.w, r.g.h)), w = Math.max(1, Math.round(r.g.w * k)), h = Math.max(1, Math.round(r.g.h * k)), left = i * cell + Math.floor((cell - w) / 2), top = cell - h;
  const b = r.g.boxes[0], gx = left + r.g.ax * k, gy = top + r.g.ay * k, s = k * 2; // a box's half extents in metres: 32 px a metre along X and Y
  const pts = [[b.hx, -b.hy], [b.hx, b.hy], [-b.hx, b.hy], [-b.hx, -b.hy]].map(([X, Y]) => `${(gx + (X - Y) * 16 * s).toFixed(1)},${(gy + (X + Y) * 8 * s).toFixed(1)}`).join(' ');
  comp.push({ input: Buffer.from(`<svg width="${cell * review.length}" height="${cell + 24}"><polygon points="${pts}" fill="rgba(120,90,60,0.45)" stroke="#fff" stroke-dasharray="4 3"/></svg>`), left: 0, top: 0 });
  comp.push({ input: await sharp(r.webp).resize(w, h, { fit: 'fill' }).png().toBuffer(), left, top });
  comp.push({ input: Buffer.from(`<svg width="${cell}" height="20"><text x="${cell / 2}" y="14" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#172a32">${r.slug}</text></svg>`), left: i * cell, top: cell + 2 });
}
await sharp({ create: { width: cell * review.length, height: cell + 24, channels: 4, background: '#9aa88c' } }).composite(comp).png().toFile(path.join(REVIEW, 'contact.png'));
console.log(`${items.length} site-kit pictures into ${path.relative(root, OUT)}; review sheet ${path.relative(root, path.join(REVIEW, 'contact.png'))}`);
