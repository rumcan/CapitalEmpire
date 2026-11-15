// #1304 and #1300 (2026-11-15): the pictures from the ChatGPT bridge's queues (queue-icons1304.json, queue-shack1300*.json; the table in
// scripts/assets/art-1304-1300.mjs) into the game. Each part is a no-op until its pictures are in the bridge's in/ folder; the run lists what it
// still waits for. The game's code already looks for each file (Icon.tsx ICON_TILE, Emblem.tsx, painted-art.ts, golf/second-hand.ts, scenes.ts):
// a picture that lands is drawn; the old look stays the fallback and an option (ui-art-look.ts 'vector').
//   1. the icon tile sheets v14..v16 (in/golf-build-tool-tiles-sheet-1view-v14.png ...): the source copied to art/theme-consistency/generated/ui/
//      golf-build-tool-tiles-sheet-vN.png and cut by prep-ui-tool-tiles.mjs into src/assets/ui/tiles/<tile>.webp (144 px), its manifest in art/ui-tool-tiles/
//   2. the single pictures (in/<id>-1view-eN.png, the highest N): trimmed of their clear margin and saved as webp at their size (SINGLES[].out):
//      the emblems (src/assets/ui/emblems), the swing meter's face and the spin ball (src/assets/ui/art), the tee markers (src/assets/golf)
//   3. the desert litter sheets (in/desert-litter-*-1view-eN.png): cut on their grid, each piece trimmed (src/assets/desert-litter/<sheet>-<k>.webp + .json)
//   4. #1300's second-hand buildings (in/<id>-view1-sN.png and -view2-): copied to <generated>/buildings/<id>-view1-vN.png (and view2), where
//      prep-range-art.mjs packs them (range-art-items.json "secondHand": the metres); then it is run (--no-range to skip it, --no-shadows passed on)
//   5. #1300's scenes (in/scene-<slug>-second-hand-1view-sN.png): src/assets/scenes/<slug>-second-hand.webp (1024 px, q80) and its manifest row
//      (state 'second-hand'), the master kept at <generated>/scenes/<slug>/<slug>-second-hand-vN.png so prep-scenes.mjs keeps it
//   node scripts/assets/prep-1304-1300.mjs [--in D:/AI/chatgpt-bridge/in] [--gen <generated folder>] [--dry] [--no-range] [--no-shadows]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { BRIDGE, ICON_SHEETS, SINGLES, LITTER_SHEETS, SECOND_HAND, SCENES } from './art-1304-1300.mjs';
import { prepUiToolTiles } from './prep-ui-tool-tiles.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; }, flag = k => args.includes(`--${k}`);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const rel = f => path.relative(root, f).replaceAll('\\', '/');

/** the newest bridge file `${name}-${view}-${prefix}N.png` in dir (null: none) */
export function newestIn(dir, name, view, prefix) {
  const names = fs.existsSync(dir) ? fs.readdirSync(dir) : [], re = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-${view}-${prefix}(\\d+)\\.png$`);
  let best = null; for (const n of names) { const m = re.exec(n); if (m && (!best || +m[1] > best.n)) best = { n: +m[1], file: path.join(dir, n) }; }
  return best;
}
/** trims the clear margin round a transparent picture (a file or a PNG buffer; alpha <= 8), keeping a 2 px border */
async function trimmed(file) {
  const img = sharp(file).ensureAlpha(), { data, info } = await img.clone().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info; let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) throw Error(`${typeof file === 'string' ? path.basename(file) : 'a cell'} is fully transparent`);
  const l = Math.max(0, x0 - 2), t = Math.max(0, y0 - 2);
  return sharp(file).ensureAlpha().extract({ left: l, top: t, width: Math.min(W, x1 + 3) - l, height: Math.min(H, y1 + 3) - t });
}
/** a picture's corners are clear: the owner's rule is a transparent PNG (a picture on a flat backdrop is refused, never keyed) */
async function isTransparent(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), W = info.width, H = info.height;
  return [0, W - 1, (H - 1) * W, H * W - 1].every(i => data[i * 4 + 3] < 32);
}

/** runs every part; returns the lines it reports. opts: inDir, gen, dry, range (run prep-range-art), shadows */
export async function prep1304And1300({ inDir = path.join(BRIDGE, 'in'), gen = path.join(root, 'art/theme-consistency/generated'), dry = false, range = true, shadows = true, out = root } = {}) {
  const lines = [], wrote = [];
  const put = async (file, buf) => { if (dry) return; fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, buf); wrote.push(rel(file)); };

  // 1. the icon tile sheets
  for (const v of Object.keys(ICON_SHEETS)) {
    const named = path.join(inDir, `golf-build-tool-tiles-sheet-1view-${v}.png`), f = fs.existsSync(named) ? { file: named } : null; // (the sheet's version is its name: v14)
    if (!f) { lines.push(`icons ${v}: waiting for golf-build-tool-tiles-sheet-1view-${v}.png`); continue; }
    const src = path.join(gen, `ui/golf-build-tool-tiles-sheet-${v}.png`);
    if (dry) { lines.push(`icons ${v}: would cut ${path.basename(f.file)} (${ICON_SHEETS[v].length} tiles)`); continue; }
    fs.mkdirSync(path.dirname(src), { recursive: true }); fs.copyFileSync(f.file, src);
    fs.writeFileSync(src.replace(/\.png$/, '.provenance.json'), JSON.stringify({ schema: 1, ticket: '#1304', from: f.file.replaceAll('\\', '/'), sha256: sha(fs.readFileSync(f.file)), queue: 'queue-icons1304.json' }, null, 2) + '\n');
    const m = await prepUiToolTiles({ source: src, version: v, outputDir: path.join(out, 'src/assets/ui/tiles'), manifestFile: path.join(out, `art/ui-tool-tiles/sheet-${v}.json`) });
    lines.push(`icons ${v}: ${m.tiles.length} tiles cut into src/assets/ui/tiles`);
  }
  // 2. the single pictures
  for (const s of SINGLES) {
    const f = newestIn(inDir, s.id, '1view', 'e');
    if (!f) { lines.push(`${s.id}: waiting for ${s.id}-1view-e1.png`); continue; }
    if (!(await isTransparent(f.file))) { lines.push(`${s.id}: ${path.basename(f.file)} has no transparent background: not imported (ask ChatGPT again for a PNG with alpha)`); continue; }
    let img = await trimmed(f.file);
    if (s.id === 'swing-meter-face') img = sharp(await img.png().toBuffer()).resize(s.size, Math.round(s.size * 178 / 300), { fit: 'fill' });
    else if (s.id === 'spin-ball') img = sharp(await img.png().toBuffer()).resize(s.size, s.size, { fit: 'fill' });
    else img = sharp(await img.png().toBuffer()).resize(s.size, s.size, { fit: 'inside', withoutEnlargement: true });
    await put(path.join(out, s.out), await img.webp({ quality: 88, alphaQuality: 95, effort: 6 }).toBuffer());
    lines.push(`${s.id}: ${dry ? 'would write' : 'wrote'} ${s.out}`);
  }
  // 3. the desert litter sheets
  for (const s of LITTER_SHEETS) {
    const f = newestIn(inDir, s.id, '1view', 'e');
    if (!f) { lines.push(`${s.id}: waiting for ${s.id}-1view-e1.png`); continue; }
    if (!(await isTransparent(f.file))) { lines.push(`${s.id}: no transparent background: not imported`); continue; }
    const meta = await sharp(f.file).metadata(), cw = Math.floor(meta.width / s.cols), ch = Math.floor(meta.height / s.rows), pieces = [];
    for (let k = 0; k < s.cols * s.rows; k++) {
      const cell = await sharp(f.file).ensureAlpha().extract({ left: (k % s.cols) * cw, top: Math.floor(k / s.cols) * ch, width: cw, height: ch }).png().toBuffer();
      const buf = await (await trimmed(cell)).resize(256, 256, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85, alphaQuality: 95 }).toBuffer();
      const file = path.join(out, s.outDir, `${s.id}-${k}.webp`); await put(file, buf);
      pieces.push({ k, what: s.cells[k], file: rel(file), sha256: sha(buf) });
    }
    await put(path.join(out, s.outDir, `${s.id}.json`), JSON.stringify({ schema: 1, ticket: '#1304', source: f.file.replaceAll('\\', '/'), grid: [s.cols, s.rows], pieces }, null, 2) + '\n');
    lines.push(`${s.id}: ${dry ? 'would cut' : 'cut'} ${pieces.length} pieces into ${s.outDir} (the litter's draw switches to them in a follow-up: desert-litter.ts)`);
  }
  // 4. #1300's second-hand buildings: into prep-range-art's folder
  let toRange = 0;
  for (const b of SECOND_HAND) {
    const v1 = newestIn(inDir, b.id, 'view1', 's'), v2 = newestIn(inDir, b.id, 'view2', 's');
    if (!v1 || !v2) { lines.push(`${b.id}: waiting for ${!v1 ? 'view 1' : 'view 2'}`); continue; }
    for (const [view, f] of [['view1', v1], ['view2', v2]]) {
      if (!(await isTransparent(f.file))) { lines.push(`${b.id} ${view}: no transparent background: not imported`); continue; }
      const dest = path.join(gen, 'buildings', `${b.id}-${view}-v${f.n}.png`);
      if (!dry) { fs.mkdirSync(path.dirname(dest), { recursive: true }); if (!fs.existsSync(dest) || sha(fs.readFileSync(dest)) !== sha(fs.readFileSync(f.file))) { fs.copyFileSync(f.file, dest); toRange++; } }
    }
    lines.push(`${b.id}: ${dry ? 'would copy' : 'copied'} both views for prep-range-art`);
  }
  if (toRange && range && !dry) {
    const rargs = [path.join(root, 'scripts/assets/prep-range-art.mjs'), '--gen', gen, ...(shadows ? [] : ['--no-shadows'])];
    lines.push(execFileSync(process.execPath, rargs, { cwd: root, encoding: 'utf8' }).trim());
  }
  // 5. #1300's scenes
  const manFile = path.join(out, 'src/assets/scenes/manifest.json');
  for (const s of SCENES) {
    const f = newestIn(inDir, `scene-${s.slug}-second-hand`, '1view', 's');
    if (!f) { lines.push(`scene ${s.slug}: waiting for scene-${s.slug}-second-hand-1view-s1.png`); continue; }
    if (dry) { lines.push(`scene ${s.slug}: would write ${s.slug}-second-hand.webp`); continue; }
    const master = path.join(gen, 'scenes', s.slug, `${s.slug}-second-hand-v${f.n}.png`);
    fs.mkdirSync(path.dirname(master), { recursive: true }); fs.copyFileSync(f.file, master);
    const buf = await sharp(f.file).resize({ width: 1024 }).webp({ quality: 80 }).toBuffer(), meta = await sharp(buf).metadata();
    await put(path.join(out, `src/assets/scenes/${s.slug}-second-hand.webp`), buf);
    const man = JSON.parse(fs.readFileSync(manFile, 'utf8'));
    const row = { slug: s.slug, state: 'second-hand', file: `${s.slug}-second-hand.webp`, w: meta.width, h: meta.height, bytes: buf.length, width: 1024, quality: 80, version: f.n, source: rel(master), sha256: sha(buf) };
    man.pictures = [...man.pictures.filter(p => !(p.slug === s.slug && p.state === 'second-hand')), row];
    fs.writeFileSync(manFile, JSON.stringify(man, null, 2) + '\n');
    lines.push(`scene ${s.slug}: wrote ${row.file} (the scene card shows it in place of the shack picture)`);
  }
  return { lines, wrote };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = await prep1304And1300({ inDir: opt('in', path.join(BRIDGE, 'in')), gen: opt('gen', path.join(root, 'art/theme-consistency/generated')), dry: flag('dry'), range: !flag('no-range'), shadows: !flag('no-shadows'), out: opt('out', root) });
  console.log(r.lines.join('\n'));
}
