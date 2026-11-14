// T258 (#755): the driving range's art into the game (the owner, 2026-10-29: "how is replaceing the temporary building images you added coming.
// i see some bad ones at the driving range facilities"). Two parts, each a no-op until its pictures land:
//
// 1. The ground pictures (GOLF-ART-LIST section 1, code C, under <generated>/ground/run-top/): 19 the hitting mat (its left and right edges
//    join), 20 the target green, 27 the bullseye green. Each is sized for the ground and saved as src/assets/ground/range-<key>.webp, with its
//    source, sha256 and measures (the green's radii as fractions of its half width) in src/assets/ground/range-pics.json; the ground painter
//    lays them flat (golf/range-pics.ts, rangebiz.ts rangeScene, rangehost.ts). A picture is made again only when its source changed.
//
// 2. The buildings and signs the owner makes in ChatGPT (docs/art/CHATGPT-IMAGE-QUEUE.md "First: the driving range's stand-ins"; the slugs
//    and the art list's metres in src/game/golf/range-art-items.json), under <generated>/buildings/: <slug>-view1-vN.png and <slug>-view2-vN.png
//    (code A: both views are needed; view 1 the front and right side, the front facing the screen's lower left; view 2 the left side and front,
//    the front facing the lower right) or <slug>-1view-vN.png (code B), the highest N. For each one found that is new or changed:
//      - the magenta keyed out (key-magenta.mjs) and the picture trimmed (its largest piece and every piece of 200+ px); an item with "decontaminate": true
//        in range-art-items.json also has the key colour's spill cleaned off its rim (decontaminate: a ragged dirt patch painted into the magenta left a pink edge);
//      - sized to the art list's metres: a building by its footprint (its width spans the footprint's diamond, 32 px a metre of width plus
//        depth: T232's site kit), a mast or post by its height (64 px a metre: T231's uprights); its ground point the middle of its left and
//        right ground corners (a mast's: its base);
//      - saved as a master art/range-kit/<slug>-<view>.webp (lossless, at most 2x the size the game draws it) with its library entry in
//        art/range-kit/items.json (id range:<slug>-<view>), so a fresh clone rebuilds without the sources;
//      - packed onto the golf page after the concept kit (prep-golf.mjs; appended last to the library: no saved index moves). If the page has
//        no room, nothing is kept and the run says so;
//      - listed in src/game/golf/range-art.json, which rangebiz.ts rangeScene reads: the piece is drawn as its picture (view 1 when its front
//        faces +y or -x, view 2 when +x or -y; never turned or mirrored) and loses its "Stand In for ..." label;
//      - its vector shadow drafted (scripts/dev/draft-shadows.mjs --only, on a vite dev server this script starts on --port and stops).
//
// Nothing found or nothing changed: nothing is written (the run lists what it looked for).
//   node scripts/assets/prep-range-art.mjs [--gen <generated-folder>] [--force] [--dry] [--port 5186] [--no-shadows]
//   (default --gen: the main checkout's art/theme-consistency/generated)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { keyMagenta } from './key-magenta.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; }, flag = k => args.includes(`--${k}`);
const main = (() => { try { return path.dirname(path.resolve(root, execSync('git rev-parse --git-common-dir', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim())); } catch { return root; } })();
const GEN = path.resolve(opt('gen', path.join(main, 'art/theme-consistency/generated')));
const FORCE = flag('force'), DRY = flag('dry'), PORT = +opt('port', '5186'), SHADOWS = !flag('no-shadows');
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');
const rel = f => path.relative(root, f).replace(/\\/g, '/');
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, o) => { if (!DRY) fs.writeFileSync(f, JSON.stringify(o, null, 1) + '\n'); };
const provOf = file => readJson(file.replace(/(\.raw)?\.png$/, '.provenance.json'), {});

// ---------------------------------------------------------------- 1. the ground pictures
const GROUND = path.join(root, 'src/assets/ground'), PICS_FILE = path.join(GROUND, 'range-pics.json');
/** the ground pictures: source (under GEN), the shipped file, its width (px), whether it tiles left to right, and its measures (as fractions of
 *  the picture's half width, from its centre: green the inner green's edge, out the collar's outer edge where the outfield starts; a radial
 *  scan of the source, 2026-10-29) */
export const PICS = [
  // 19: 896 x 1200, one bay; 320 px wide is 128 px a tile at the game's 5 m bay (2.5 tiles), about 3x what the closest zoom draws
  { key: 'mats', item: 19, src: 'ground/run-top/golf-range-mats/golf-range-mats-top-v1.png', width: 320, tileX: true, measures: {} },
  // 20: 1024 square; the fine-cut green to 0.765, the lighter collar to 0.89, its darker edge ring to 0.905, the outfield in the corners
  { key: 'green', item: 20, src: 'ground/run-top/golf-range-target-green/golf-range-target-green-top-v1.raw.png', width: 1024, measures: { green: 0.765, out: 0.905 } },
  // 27: 1024 square; the yellow bullseye, red, white, red and white rings to 0.945, the outfield beyond
  { key: 'bullseye', item: 27, src: 'ground/run-top/golf-range-bullseye-target/golf-range-bullseye-target-top-v1.raw.png', width: 1024, measures: { out: 0.945 } },
];
async function groundPictures() {
  const old = readJson(PICS_FILE, { pics: {} }), pics = { ...old.pics }, lines = [];
  let changed = false;
  for (const p of PICS) {
    const file = path.join(GEN, p.src), out = path.join(GROUND, `range-${p.key}.webp`);
    if (!fs.existsSync(file)) { lines.push(`  ${p.key} (item ${p.item}): no source at ${p.src}${pics[p.key] ? ', the shipped picture kept' : ''}`); continue; }
    const buf = fs.readFileSync(file), h = sha(buf);
    if (!FORCE && pics[p.key]?.sha256 === h && fs.existsSync(out)) { lines.push(`  ${p.key} (item ${p.item}): unchanged (${rel(out)})`); continue; }
    const meta = await sharp(buf).metadata(), W = p.width, H = Math.round(meta.height * W / meta.width);
    let img;
    if (p.tileX) {
      // resampled as three copies side by side, the middle kept, so the left and right edges still join
      const one = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true }), row = one.info.width * 3, three = Buffer.alloc(row * one.info.height * 3);
      for (let y = 0; y < one.info.height; y++) for (let k = 0; k < 3; k++) one.data.copy(three, (y * one.info.width * 3 + k * one.info.width) * 3, y * row, (y + 1) * row);
      img = sharp(three, { raw: { width: one.info.width * 3, height: one.info.height, channels: 3 } }).resize(W * 3, H, { kernel: 'lanczos3', fit: 'fill' }).extract({ left: W, top: 0, width: W, height: H });
    } else img = sharp(buf).removeAlpha().resize(W, H, { kernel: 'lanczos3', fit: 'fill' });
    const webp = await img.webp({ quality: 90, effort: 6 }).toBuffer();
    if (!DRY) fs.writeFileSync(out, webp);
    const prov = provOf(file);
    pics[p.key] = { file: rel(out), w: W, h: H, item: p.item, ...p.measures, src: p.src, sha256: h, id: prov.id ?? prov.item, model: prov.runModel ?? prov.model };
    changed = true;
    lines.push(`  ${p.key} (item ${p.item}): made ${rel(out)} ${W}x${H} (${(webp.length / 1024).toFixed(0)} KB) from ${p.src}`);
  }
  if (changed) writeJson(PICS_FILE, { note: 'Generated by scripts/assets/prep-range-art.mjs (T258): the range\'s ground pictures (GOLF-ART-LIST 19, 20, 27), laid flat by the ground painter (golf/range-pics.ts). Measures: fractions of the picture\'s half width from its centre (green: the inner green\'s edge; out: where the outfield starts).', pics });
  return { changed, lines };
}

// ---------------------------------------------------------------- 2. the buildings and signs
// (#1235, the owner 2026-11-14: "no vector distance signs. only png sprites": the yardage signs, one per distance with its number painted on,
// are packed the same way but listed apart ("yard"): rangeScene's stand-in pieces stay "items"; the range code picks the signs by slug)
const ITEMS_JSON = readJson(path.join(root, 'src/game/golf/range-art-items.json'), { items: [] });
const ITEMS = [...ITEMS_JSON.items, ...(ITEMS_JSON.yard ?? [])];
const KIT = path.join(root, 'art/range-kit'), KIT_FILE = path.join(KIT, 'items.json'), VIEWS_FILE = path.join(root, 'src/game/golf/range-art.json');
const UP = 64, MASTER_MAX = 2;
/** the newest version of each of an item's files under GEN/buildings (null: none): A items view1 and view2, B items 1view */
export function findRangeArt(gen = GEN, items = ITEMS) {
  const dir = path.join(gen, 'buildings'), names = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const newest = (slug, view) => {
    const re = new RegExp(`^${slug}-${view}-v(\\d+)\\.png$`); let best = null;
    for (const n of names) { const m = re.exec(n); if (m && (!best || +m[1] > best.v)) best = { v: +m[1], file: path.join(dir, n) }; }
    return best?.file ?? null;
  };
  return items.map(it => {
    const views = it.code === 'B' ? [newest(it.slug, '1view')] : [newest(it.slug, 'view1'), newest(it.slug, 'view2')];
    const have = views.filter(Boolean).length;
    return { it, views, status: have === 0 ? 'none' : have < views.length ? 'partial' : 'ready' };
  });
}
/** the keyed picture trimmed: its largest piece and every piece of 200+ px (smaller specks dropped), as rgba */
async function cutOne(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), W = info.width, H = info.height;
  const lab = new Int32Array(W * H).fill(-1), stack = new Int32Array(W * H), sizes = [];
  for (let s = 0; s < W * H; s++) {
    if (lab[s] >= 0 || data[s * 4 + 3] <= 8) continue;
    const id = sizes.length; let top = 0, n = 0; stack[top++] = s; lab[s] = id;
    while (top) {
      const q = stack[--top], x = q % W, y = (q - x) / W; n++;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const r = Y * W + X; if (lab[r] < 0 && data[r * 4 + 3] > 8) { lab[r] = id; stack[top++] = r; } }
    }
    sizes.push(n);
  }
  if (!sizes.length) throw new Error('nothing left after keying');
  const big = sizes.indexOf(Math.max(...sizes)), keep = sizes.map((n, i) => i === big || n >= 200);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let q = 0; q < W * H; q++) if (lab[q] >= 0 && keep[lab[q]]) { const x = q % W, y = (q - x) / W; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const q = (y0 + y) * W + x0 + x; if (lab[q] >= 0 && keep[lab[q]]) data.copy(rgba, (y * w + x) * 4, q * 4, q * 4 + 4); }
  return { w, h, rgba, rect: [x0, y0, x1, y1] };
}
/** the key colour's spill on a ragged outline (the redone shop's dirt patch, painted into the magenta, 2026-11-14, left a pink rim): within `depth` px of the
 *  outline a see-through pixel, and a solid one that is bluer and less green than the solid colour round it, takes that colour (its alpha stays); a thin feature
 *  has no solid inside, so it stays as painted. An item's "decontaminate": true in range-art-items.json; changes p.rgba in place and returns how many pixels it recoloured */
export function decontaminate(p, depth = 6, reach = 9) {
  const { w, h, rgba } = p, N = w * h, d = new Float32Array(N), D3 = depth * 3, W1 = w + 1;
  // each opaque pixel's distance (chamfer 3-4, /3 = px) to the see-through outside; the picture's own border counts as one step from it
  for (let q = 0; q < N; q++) d[q] = rgba[q * 4 + 3] > 8 ? 1e9 : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const q = y * w + x; let v = d[q]; if (x === 0 || y === 0 || x === w - 1 || y === h - 1) v = Math.min(v, 3);
    if (x > 0) v = Math.min(v, d[q - 1] + 3); if (y > 0) { v = Math.min(v, d[q - w] + 3); if (x > 0) v = Math.min(v, d[q - w - 1] + 4); if (x < w - 1) v = Math.min(v, d[q - w + 1] + 4); } d[q] = v; }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const q = y * w + x; let v = d[q];
    if (x < w - 1) v = Math.min(v, d[q + 1] + 3); if (y < h - 1) { v = Math.min(v, d[q + w] + 3); if (x < w - 1) v = Math.min(v, d[q + w + 1] + 4); if (x > 0) v = Math.min(v, d[q + w - 1] + 4); } d[q] = v; }
  // summed-area tables of the solid inside (alpha over 250, deeper than `depth`): its red, green, blue and pixel count
  const S = [0, 1, 2, 3].map(() => new Float64Array(W1 * (h + 1)));
  for (let y = 0; y < h; y++) { const s = [0, 0, 0, 0];
    for (let x = 0; x < w; x++) { const q = y * w + x; if (rgba[q * 4 + 3] > 250 && d[q] > D3) { s[0] += rgba[q * 4]; s[1] += rgba[q * 4 + 1]; s[2] += rgba[q * 4 + 2]; s[3]++; }
      for (let c = 0; c < 4; c++) S[c][(y + 1) * W1 + x + 1] = S[c][y * W1 + x + 1] + s[c]; } }
  const box = (c, x0, y0, x1, y1) => S[c][(y1 + 1) * W1 + x1 + 1] - S[c][y0 * W1 + x1 + 1] - S[c][(y1 + 1) * W1 + x0] + S[c][y0 * W1 + x0];
  const out = Buffer.from(rgba); let n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const q = y * w + x; if (rgba[q * 4 + 3] === 0 || d[q] > D3) continue;
    const x0 = Math.max(0, x - reach), x1 = Math.min(w - 1, x + reach), y0 = Math.max(0, y - reach), y1 = Math.min(h - 1, y + reach), k = box(3, x0, y0, x1, y1);
    if (k < 12) continue;
    const mr = box(0, x0, y0, x1, y1) / k, mg = box(1, x0, y0, x1, y1) / k, mb = box(2, x0, y0, x1, y1) / k;
    if (rgba[q * 4 + 3] < 250 || (rgba[q * 4 + 2] - mb > 12 && mg - rgba[q * 4 + 1] > 8)) { out[q * 4] = Math.round(mr); out[q * 4 + 1] = Math.round(mg); out[q * 4 + 2] = Math.round(mb); n++; }
  }
  // a thin strand (a wire basket's mesh) has no solid inside to take a colour from, and the key colour's tint stays in it as a reddish pink (red well over green,
  // blue not far under it: wood and dirt have blue well under green): such a pixel, see-through or beside a see-through one, is grey, its green's value
  const hole = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h && rgba[(Y * w + X) * 4 + 3] < 128) return true; } return false; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const q = y * w + x, r = out[q * 4], g = out[q * 4 + 1], b = out[q * 4 + 2], a = out[q * 4 + 3];
    if (a > 0 && r > g + 20 && b > g - 10 && (a < 250 || hole(x, y))) { out[q * 4] = out[q * 4 + 1] = out[q * 4 + 2] = Math.min(255, g + 6); n++; } }
  out.copy(rgba); return n;
}
/** the lowest opaque pixel (alpha > 128) in a trimmed picture's 3 outermost columns each side (its left and right ground corners) */
function corners(p, below = 0.4) {
  const low = xs => { let y = -1; for (const x of xs) for (let r = p.h - 1; r >= 0; r--) if (p.rgba[(r * p.w + x) * 4 + 3] > 128) { y = Math.max(y, r); break; } return y; };
  // (an overhanging roof's eave reaches past the walls: an edge column with nothing below `below` of the height (a roof's eave, an awning) is skipped,
  // up to 35% of the width in (a sign's posts stand well inside its board), so the ground corner is the wall's; an item's wallBelow in range-art-items.json sets it: the coffee
  // kiosk's awning reaches 0.62 down, so it takes 0.65; #1235 stand-ins)
  const lim = Math.round(p.w * 0.35), wall = x => low([x]) >= p.h * below;
  let l = 0, r = p.w - 1;
  while (l < lim && !wall(l)) l++;
  while (p.w - 1 - r < lim && !wall(r)) r--;
  if (l >= lim) l = 0; if (p.w - 1 - r >= lim) r = p.w - 1;
  const yL = low([l, l + 1, l + 2]), yR = low([r, r - 1, r - 2]);
  return { yL: yL < 0 ? p.h - 1 : yL, yR: yR < 0 ? p.h - 1 : yR };
}
/** the mean x of the opaque pixels in the lowest rows (a mast's or a post's base) */
function baseX(p) {
  let s = 0, n = 0;
  for (let y = p.h - 1; y >= Math.max(0, p.h - Math.max(3, Math.round(p.h * 0.03))); y--) for (let x = 0; x < p.w; x++) if (p.rgba[(y * p.w + x) * 4 + 3] > 128) { s += x; n++; }
  return n ? s / n : p.w / 2;
}
/** a picture's display size, ground point and footprint (native px at scale 1; half extents in metres). View 1's front runs along the map's
 *  X (it faces +Y), view 2's along Y (it faces +X) */
export function geometry(it, view, p) {
  const r3 = v => +v.toFixed(3), [W, D] = it.box, [bx, by] = view === 2 ? [D, W] : [W, D];
  let w, h, ax, ay;
  if (it.size === 'tall') { h = UP * it.high; const k = h / p.h; w = p.w * k; ax = baseX(p) * k; ay = h - 8 * (W + D); }
  else { w = 32 * (W + D); const k = w / p.w, c = corners(p, it.wallBelow); h = p.h * k; ax = w / 2; ay = Math.min(h, ((c.yL + c.yR) / 2 + 0.5) * k); }
  return { w: r3(w), h: r3(h), ax: r3(ax), ay: r3(ay), boxes: [{ hx: r3(bx / 2), hy: r3(by / 2), dx: 0, dy: 0 }] };
}
const viewName = (it, k) => (it.code === 'B' ? '1view' : `view${k + 1}`);
async function buildings() {
  const found = findRangeArt(), lines = [], kit = readJson(KIT_FILE, { items: [] }), entries = [...kit.items], made = [], masters = [];
  for (const { it, views, status } of found) {
    const head = `  ${it.slug} (item ${it.item}, ${it.code})`;
    if (status === 'none') { lines.push(`${head}: no file yet`); continue; }
    if (status === 'partial') { lines.push(`${head}: ${views.filter(Boolean).map(f => path.basename(f)).join(', ')} found, waiting for ${it.code === 'A' ? (views[0] ? 'view 2' : 'view 1') : 'its view'}: nothing changed`); continue; }
    for (const [k, file] of views.entries()) {
      const vn = viewName(it, k), id = `range:${it.slug}-${vn}`, buf = fs.readFileSync(file), h = sha(buf), at = entries.findIndex(e => e.id === id);
      if (!FORCE && at >= 0 && entries[at].src?.sha256 === h && fs.existsSync(path.join(KIT, `${it.slug}-${vn}.webp`))) { lines.push(`${head} ${vn}: unchanged (${id})`); continue; }
      const p = await cutOne(await keyMagenta(buf)), spill = it.decontaminate ? decontaminate(p) : 0, g = geometry(it, k + 1, p), prov = provOf(file);
      const mk = Math.min(1, (MASTER_MAX * g.w) / p.w), mw = Math.max(1, Math.round(p.w * mk)), mh = Math.max(1, Math.round(p.h * mk));
      const webp = await sharp(p.rgba, { raw: { width: p.w, height: p.h, channels: 4 } }).resize(mw, mh, { kernel: 'lanczos3', fit: 'fill' }).webp({ lossless: true, effort: 6 }).toBuffer();
      masters.push({ file: path.join(KIT, `${it.slug}-${vn}.webp`), webp });
      const e = { id, name: `${it.name}${it.code === 'B' ? '' : ` (view ${k + 1})`}`, cat: 'Range art', kind: 'business', ...g, solid: 1, big: it.box[0] * it.box[1] >= 20, door: false, cost: 0,
        src: { file: rel(file).startsWith('..') ? path.basename(file) : rel(file), rect: p.rect, sha256: h, id: prov.id, model: prov.runModel ?? prov.model } };
      if (at >= 0) entries[at] = e; else entries.push(e);
      made.push(id);
      lines.push(`${head} ${vn}: keyed ${p.w}x${p.h} px from ${path.basename(file)} -> ${g.w.toFixed(0)}x${g.h.toFixed(0)} display px (${it.size === 'tall' ? `${it.high} m high` : `${it.box.join(' x ')} m`}), ground point ${g.ax.toFixed(0)},${g.ay.toFixed(0)}; master ${mw}x${mh}${it.decontaminate ? `; ${spill} rim pixels cleaned of the key colour's spill` : ''}`);
    }
  }
  if (!made.length || DRY) return { made, lines };
  // the masters and their entries, the golf page packed again; on any failure (no room on the page) nothing is kept
  const keepKit = fs.existsSync(KIT_FILE) ? fs.readFileSync(KIT_FILE) : null, keepMasters = masters.map(m => ({ ...m, old: fs.existsSync(m.file) ? fs.readFileSync(m.file) : null }));
  fs.mkdirSync(KIT, { recursive: true });
  for (const m of masters) fs.writeFileSync(m.file, m.webp);
  writeJson(KIT_FILE, { note: 'Generated by scripts/assets/prep-range-art.mjs from the owner\'s ChatGPT pictures (T258). prep-golf.mjs packs the masters (art/range-kit/<id>.webp) onto the golf page; golf/range-art.json lists the ones the game draws.', items: entries });
  try { execFileSync(process.execPath, [path.join(root, 'scripts/assets/prep-golf.mjs')], { cwd: root, stdio: 'inherit' }); }
  catch (e) {
    if (keepKit) fs.writeFileSync(KIT_FILE, keepKit); else fs.rmSync(KIT_FILE, { force: true });
    for (const m of keepMasters) if (m.old) fs.writeFileSync(m.file, m.old); else fs.rmSync(m.file, { force: true });
    throw new Error(`the golf page could not take the range art (nothing kept): ${e.message}`);
  }
  // the views the game draws: every slug whose views are all packed
  const ids = new Set(entries.map(e => e.id)), views = {};
  for (const it of ITEMS) { const v = (it.code === 'B' ? [0] : [0, 1]).map(k => `range:${it.slug}-${viewName(it, k)}`); if (v.every(id => ids.has(id))) views[it.slug] = v; }
  writeJson(VIEWS_FILE, { ...readJson(VIEWS_FILE, {}), views });
  return { made, lines };
}
/** the new pictures' vector shadows: draft-shadows.mjs --only on a vite dev server started here (and stopped) */
async function draftShadows(ids) {
  const vite = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((ok, no) => {
      const t = setTimeout(() => no(new Error(`vite did not start on ${PORT}`)), 60000);
      const on = d => { if (/Local/.test(String(d))) { clearTimeout(t); ok(); } };
      vite.stdout.on('data', on); vite.stderr.on('data', on); vite.on('exit', c => { clearTimeout(t); no(new Error(`vite exited (${c}): is ${PORT} taken?`)); });
    });
    execFileSync(process.execPath, [path.join(root, 'scripts/dev/draft-shadows.mjs'), '--base', `http://127.0.0.1:${PORT}/`, '--only', ids.join(',')], { cwd: root, stdio: 'inherit' });
  } finally {
    if (process.platform === 'win32') { try { execSync(`taskkill /pid ${vite.pid} /T /F`, { stdio: 'ignore' }); } catch { /* gone */ } } else vite.kill('SIGTERM');
  }
}

// ---------------------------------------------------------------- run (only when started as a script)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`prep-range-art${DRY ? ' (dry run: nothing written)' : ''}: looking in ${GEN}`);
  const g = await groundPictures();
  console.log(`ground pictures (19 mats, 20 target green, 27 bullseye):\n${g.lines.join('\n')}`);
  const b = await buildings();
  console.log(`buildings and signs (${path.join(GEN, 'buildings')}):\n${b.lines.join('\n')}`);
  if (b.made.length && !DRY) {
    console.log(`packed ${b.made.length} picture(s) onto the golf page: ${b.made.join(', ')}; ${rel(VIEWS_FILE)} updated`);
    if (SHADOWS) { console.log('drafting their vector shadows...'); await draftShadows(b.made); }
    else console.log(`vector shadows NOT drafted (--no-shadows): run node scripts/dev/draft-shadows.mjs --base <dev server> --only ${b.made.join(',')}`);
  }
  console.log(g.changed || b.made.length ? `done${DRY ? ' (dry run)' : ''}` : 'nothing new: nothing changed');
}
