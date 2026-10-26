// Accepted garage diagonal views, appended after every existing library so base/N/E/S/W IDs and saved indices stay intact.
// node scripts/assets/prep-garage-views.mjs [generated-buildings-folder ...]
// prep-views.mjs calls this too. Only integrationStatus:'ready', four native crops and the matching game ID may enter.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { trimmed, measure } from './axis-cells.mjs';
import { findGlows } from './find-glows.mjs';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIRS = ['NE', 'SE', 'SW', 'NW'], ID = /^ce:parking-garage-([2-6])storey$/, PAGE = 2048, GUT = 16, MIP0 = 0.6;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const parseItems = f => [...fs.readFileSync(f, 'utf8').matchAll(/^\s*(\{"id".*\}),?$/gm)].map(m => JSON.parse(m[1]));
const num = n => +n.toFixed(2);

/** Sync and pack reviewed diagonal garage sprites. Units: native PNG pixels; footprints are 2 m world tiles. */
export async function prepGarageViews(folders = [], { root = HERE } = {}) {
  const main = (() => { try { return path.dirname(path.resolve(root, execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim())); } catch { return root; } })();
  const relative = 'art/theme-consistency/generated/buildings';
  const sources = [...new Set(folders.length ? folders.map(f => path.resolve(f)) : [path.join(main, relative), path.join(main, 'worktrees/theme-consistency', relative), path.join(root, relative)])].filter(f => fs.existsSync(f));
  const STORE = path.join(root, 'art/garage-views'), OUT = path.join(root, 'src/assets/garage-views');
  const axis = new Map(parseItems(path.join(root, 'src/game/axis-library.ts')).map(it => [it.id, it]));
  const best = new Map();
  for (const folder of sources) for (const file of fs.readdirSync(folder)) {
    const m = /^(parking-garage-([2-6])storey)-4views-v(\d+)\.provenance\.json$/.exec(file);
    if (!m) continue;
    const provenance = read(path.join(folder, file)), id = `ce:${m[1]}`, version = file.slice(0, -'.provenance.json'.length);
    if (provenance.id !== id || !ID.test(provenance.id)) throw Error(`${file}: game id must be ${id}`);
    if (provenance.integrationStatus !== 'ready') { console.log(`withheld ${id} ${version}: visual review not ready`); continue; }
    if (provenance.storeys !== +m[2]) throw Error(`${file}: reviewed storey count differs from its game id`);
    if (!axis.has(id)) throw Error(`${id}: no existing axis garage in the game library`);
    const files = DIRS.map(dir => path.join(folder, version, `${dir}.native.png`));
    if (!files.every(f => fs.existsSync(f))) { console.log(`withheld ${id} ${version}: all four native crops are required`); continue; }
    const sheet = path.join(folder, `${version}.png`);
    if (!fs.existsSync(sheet)) throw Error(`${version}: missing source sheet`);
    const bytes = fs.readFileSync(sheet), expected = provenance.sheetSha256 ?? provenance.export?.sheetSha256;
    if (expected && sha(bytes) !== expected) throw Error(`${version}: source sheet hash mismatch`);
    if (!best.has(id) || best.get(id).n < +m[3]) best.set(id, { id, slug: m[1], version, n: +m[3], provenance, provenanceFile: path.join(folder, file), files, sheetSha256: sha(bytes) });
  }
  fs.mkdirSync(STORE, { recursive: true });
  for (const source of best.values()) {
    const dir = path.join(STORE, source.slug); fs.mkdirSync(dir, { recursive: true });
    const files = {};
    for (const [i, direction] of DIRS.entries()) {
      const png = fs.readFileSync(source.files[i]), expected = source.provenance.export?.views?.[direction]?.nativeSha256;
      if (expected && sha(png) !== expected) throw Error(`${source.id} ${direction}: native crop hash mismatch`);
      fs.writeFileSync(path.join(dir, `${direction}.png`), png); files[direction] = sha(png);
    }
    fs.copyFileSync(source.provenanceFile, path.join(dir, 'provenance.json'));
    fs.writeFileSync(path.join(dir, 'source.json'), JSON.stringify({ id: source.id, version: source.version, storeys: source.provenance.storeys, sheetSha256: source.sheetSha256, files, integrationStatus: 'ready' }, null, 1) + '\n');
  }
  const records = fs.readdirSync(STORE).filter(d => fs.existsSync(path.join(STORE, d, 'source.json'))).sort().map(slug => ({ slug, ...read(path.join(STORE, slug, 'source.json')) }));
  const scalesFile = path.join(root, 'scripts/assets/scale-overrides.json'), scales = fs.existsSync(scalesFile) ? read(scalesFile) : {};
  const subjects = [], all = [];
  for (const source of records) {
    if (!ID.test(source.id) || source.integrationStatus !== 'ready') throw Error(`${source.id}: stored source is not a reviewed garage`);
    const base = axis.get(source.id); if (!base) throw Error(`${source.id}: missing base garage`);
    const views = [];
    for (const direction of DIRS) {
      const raw = fs.readFileSync(path.join(STORE, source.slug, `${direction}.png`));
      if (sha(raw) !== source.files[direction]) throw Error(`${source.id} ${direction}: stored source hash mismatch`);
      const crop = await trimmed(raw), m = await measure(crop.png), s = 64 * (13 + 9) / m.bw;
      const hx = direction === 'SE' || direction === 'NW' ? 9 : 13, hy = direction === 'SE' || direction === 'NW' ? 13 : 9;
      const w = m.W * s, h = m.H * s, scale = Math.min(3 * m.W / w, MIP0 * Math.max(1, scales[source.id] ?? 1));
      const glows = await findGlows(crop.png, { id: source.id, w, cat: base.cat });
      const item = { ...base, id: `view:${source.id}:${direction.toLowerCase()}`, name: `${base.name} (${direction} diagonal view)`, w: num(w), h: num(h), ax: num(m.bx * s - 32 * (hx - hy)), ay: num(m.by * s - 16 * (hx + hy)), boxes: [{ hx, hy, dx: 0, dy: 0 }], glows: glows.length ? glows.map(g => ({ x: num(g.x), y: num(g.y), r: num(g.r) })) : undefined, quad: [0, 0, num(w), num(h)] };
      const entry = { item, png: crop.png, nativeWidth: m.W, width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
      if (entry.width + 2 * GUT > PAGE || entry.height + 2 * GUT > PAGE) throw Error(`${item.id}: larger than an atlas page`);
      views.push(item.id); all.push(entry);
    }
    subjects.push([source.id, views]);
  }
  // Keep existing diagonal IDs in their previous order if a later storey arrives; new IDs go last.
  const moduleFile = path.join(root, 'src/game/garage-views-library.ts');
  const previous = fs.existsSync(moduleFile) ? new Map(parseItems(moduleFile).map((it, i) => [it.id, i])) : new Map();
  all.sort((a, b) => (previous.get(a.item.id) ?? Infinity) - (previous.get(b.item.id) ?? Infinity) || a.item.id.localeCompare(b.item.id));
  const pages = []; let x = GUT, y = GUT, rowH = 0;
  for (const entry of all) {
    if (!pages.length) pages.push([]);
    if (x + entry.width + GUT > PAGE) { x = GUT; y += rowH + GUT; rowH = 0; }
    if (y + entry.height + GUT > PAGE) { pages.push([]); x = GUT; y = GUT; rowH = 0; }
    entry.page = pages.length - 1; entry.left = x; entry.top = y;
    entry.item.tex = [entry.page, x / PAGE, y / PAGE, (x + entry.width) / PAGE, (y + entry.height) / PAGE];
    pages.at(-1).push(entry); x += entry.width + GUT; rowH = Math.max(rowH, entry.height);
  }
  fs.mkdirSync(OUT, { recursive: true });
  for (const [i, entries] of pages.entries()) {
    const images = await Promise.all(entries.map(async p => ({ input: await sharp(p.png).resize(p.width, p.height, { kernel: 'lanczos3' }).png().toBuffer(), left: p.left, top: p.top })));
    const full = await sharp({ create: { width: PAGE, height: PAGE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(images).png().toBuffer();
    for (let mip = 0; mip < 5; mip++) await sharp(full).resize(PAGE >> mip, PAGE >> mip).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(OUT, `garage-${i}-${mip}.webp`));
  }
  const old = fs.readFileSync(moduleFile, 'utf8'), body = old.slice(old.indexOf('/** Append accepted diagonals'));
  fs.writeFileSync(moduleFile, [
    '// Generated by scripts/assets/prep-garage-views.mjs. Accepted native sources live in art/garage-views.',
    "import type { LibItem } from './types';", "import { OWNER_SCALE, REMOVED_IDS } from './lots/scales';",
    ...pages.flatMap((_, i) => Array.from({ length: 5 }, (_, mip) => `import g${i}m${mip} from '../assets/garage-views/garage-${i}-${mip}.webp';`)),
    `const PAGES: string[][] = [${pages.map((_, i) => `[${Array.from({ length: 5 }, (_, mip) => `g${i}m${mip}`).join(',')}]`).join(',')}];`,
    `const ITEMS: LibItem[] = [\n${all.map(p => '  ' + JSON.stringify(p.item)).join(',\n')}\n];`,
    '/** Garage diagonal pictures [NE, SE, SW, NW]; the original garage ID remains its N picture. Units: sprite IDs. */',
    `export const GARAGE_VIEW_SETS: Readonly<Record<string, readonly [string, string, string, string]>> = ${JSON.stringify(Object.fromEntries(subjects))};`,
    '/** Source width in native pixels, keyed by appended diagonal sprite ID. */',
    `export const GARAGE_NATIVE_WIDTH: Readonly<Record<string, number>> = ${JSON.stringify(Object.fromEntries(all.map(p => [p.item.id, p.nativeWidth])))};`, body,
  ].join('\n'));
  fs.writeFileSync(path.join(STORE, 'DIRECTIONS.md'), '# Garage direction contract\n\nThe original garage ID stays N (front faces screen down). Existing view:<id>:e/s/w remain unchanged. New view:<id>:ne/se/sw/nw are true diagonal quarter turns, front facing world +y/+x/-y/-x; footprint edges have screen slopes ±0.5. They are appended after all pre-existing libraries, share their base garage size, and are never mirrored. Studio shows eight labelled thumbnails; the dev editor can place explicit diagonal IDs and R turns within that diagonal set.\n\nAutomatic eight-heading road selection remains T154 Phase 2. No claim is made that adding PNGs selects them automatically on all lots.\n\nFootprint: 26 m frontage × 18 m depth (13×9 world tiles), swapped for SE/NW. Native source pixels are preserved in this store; normal atlas packing/filtering is separate.\n\nKnown pre-existing issue: axis drafts labelled 4/5/6 storeys appear to show 3/4/5 covered levels. These are preserved pending separate owner/art correction, never silently relabelled by this importer.\n');
  console.log(`garage diagonals: ${subjects.length} accepted subjects, ${all.length} pictures, ${pages.length} atlas pages (axis art unchanged)`);
  return { subjects: subjects.length, views: all.length, pages: pages.length };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2), at = args.indexOf('--root'), options = at >= 0 ? { root: path.resolve(args.splice(at, 2)[1]) } : {};
  await prepGarageViews(args, options);
}
