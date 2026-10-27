// The four-view building art (T017: NE, SE, SW, NW, true rotations under a fixed sun) into the game. Re-run it whenever new sheets land:
//   node scripts/assets/prep-views.mjs [generated-buildings-folder ...]
// 1. Sync: for each subject in the generated folders (the ones given, else the main checkout's art/theme-consistency/generated/buildings, where
//    the art model delivers, then the theme-consistency worktree's and this checkout's; a version found in several is taken from the first):
//    its <slug>-4views-v<n>/ crops and <slug>-4views-v<n>.provenance.json, whose id is the library id. The newest version with all four
//    NE/SE/SW/NW.native.png crops and no integrationStatus "blocked" is copied to art/building-views/<slug>/, unless
//    art/building-views/measures.json pins a version. The import review's verdicts live in measures.json too: "rejected" { version: reason }
//    keeps a version out whatever the art model marked it, "accepted" { version: note } lets in a sheet the art model parked as awaiting review. A 'ready' version with no crops yet is cut from its sheet (<version>.png) in memory by
//    four-view-cells.mjs (the art model's cell rules) and marked cropsBy in its source.json. Without the generated folders (a fresh clone) the copies already there are used.
// 2. Scale: each view is sized by its doorway (measures.json: a plain door's height in native px, tied to the picture's sha256) so the door
//    stands standardDoor game px tall at the building's gauge scale (measures.json gaugeScale: its owner scale when it was first gauged, written
//    back then, so a size set later in the sprite studio scales the building and survives a re-import). A view with no clear door takes the
//    mean scale of its measured views; a subject with none measured keeps the original sprite's width (and is reported, to be measured).
//    A view may be sized past its picture's own pixels (its owner scale, the studio's size or the table's asks it): it is packed upscaled (lanczos3,
//    softer) up to 3x its pixels, and reported past that. Business artwork keeps its width (drawn at a share of its parcel); the game caps its drawing (newart.ts lookOf).
// 3. Footprint: the original boxes grow or shrink with the art (the NE view against the original's width); SE and NW turn them (hx <-> hy).
//    The ground point is the footprint's centre, found from the picture's lowest point (the near corner, +hx +hy).
// 4. Pack: every view at 0.6 x display size times its owner scale (as big as it is drawn at the closest zoom), or times the largest size any old
//    building drawn as it as a stand-in needs (src/game/newart.ts standInNeeds, run through stand-in-needs.ts), up to 3x its picture's own
//    pixels (upscaled past them), on 2048 pages with five mips (src/assets/views/views-<page>-<mip>.webp), and write
//    src/game/views-library.ts: appendViews puts NE in place of the original sprite and SE in place of its east art (east:<id>), keeping
//    every saved index, and appends the other views as view:<id>:se|sw|nw. Night glows are found again on the new pictures.
// 5. Coverage: art/building-views/COVERAGE.md lists every building of the game (art/theme-consistency/inventory.json, and any library sprite
//    of a building kind it misses) as done (its four views in the game) or missing (none generated yet, or every version withheld, and why).
//    No building is ever mirrored (src/game/mirror.ts): a missing one is drawn as its old picture, unflipped, until its views land.
import fs from 'node:fs';
import { presetScales } from './preset-scales.mjs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync, execSync } from 'node:child_process';
import { build } from 'esbuild';
import sharp from 'sharp';
import { findGlows } from './find-glows.mjs';
import { cropFourViews } from './four-view-cells.mjs';
import { readScales } from './overrides.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BUILDINGS = 'art/theme-consistency/generated/buildings', STORE = path.join(root, 'art/building-views');
// the main checkout (this one, or the one a worktree belongs to): the art model delivers into its generated folder
const main = (() => { try { return path.dirname(path.resolve(root, execSync('git rev-parse --git-common-dir', { cwd: root }).toString().trim())); } catch { return root; } })();
const GENS = [...new Set(process.argv.length > 2 ? process.argv.slice(2).map(d => path.resolve(d))
  : [path.join(main, BUILDINGS), path.join(main, 'worktrees/theme-consistency', BUILDINGS), path.join(root, BUILDINGS)])].filter(d => fs.existsSync(d));
const OUT = path.join(root, 'src/assets/views'), REVIEW = path.join(root, 'output/views-review');
const DIRS = ['NE', 'SE', 'SW', 'NW'], PAGE = 2048, GUT = 16, MIP0 = 0.6;
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');
const measures = JSON.parse(fs.readFileSync(path.join(STORE, 'measures.json'), 'utf8'));
const pinned = new Map(Object.entries(measures.subjects).filter(([, s]) => s.pin).map(([id, s]) => [id, s.version]));

// 1. sync the newest (or pinned) version of every subject; the versions withheld (blocked or incomplete) are kept for the coverage report
const withheld = new Map(), withhold = (id, version, why) => { if (!withheld.has(id)) withheld.set(id, []); withheld.get(id).push(`${version}: ${why}`); };
if (GENS.length) {
  const best = new Map(), seen = new Set();
  for (const GEN of GENS) for (const file of fs.readdirSync(GEN)) {
    const m = /^(.+)-4views-v(\d+)\.provenance\.json$/.exec(file), d = m && `${m[1]}-4views-v${m[2]}`, prov = path.join(GEN, file);
    if (!m || seen.has(d)) continue;
    seen.add(d);
    const provenance = JSON.parse(fs.readFileSync(prov, 'utf8')), id = provenance.id;
    // a version the import review turned down (measures.json "rejected": { version: reason }) stays out, whatever the art model marked it
    if (measures.rejected?.[d]) { withhold(id, d, `rejected at import: ${measures.rejected[d]}`); console.log(`rejected ${id} (${d}): ${measures.rejected[d]}`); continue; }
    // a sheet the art model parked as awaiting review that the import review checked and approved (measures.json "accepted": { version: note }) counts as 'ready'
    const ready = provenance.integrationStatus === 'ready' || !!measures.accepted?.[d];
    if (provenance.integrationStatus === 'blocked' && !ready) { withhold(id, d, provenance.integrationReason ?? 'blocked'); console.log(`withheld ${id} (${d}): ${provenance.integrationReason}`); continue; }
    // a reviewed ('ready') sheet with no crops yet is cut in memory by the art model's cell rules (four-view-cells.mjs)
    let crops = null;
    const missing = DIRS.filter(v => !fs.existsSync(path.join(GEN, d, `${v}.native.png`))), sheet = path.join(GEN, `${d}.png`);
    if (missing.length && ready && fs.existsSync(sheet)) {
      try { crops = await cropFourViews(fs.readFileSync(sheet)); }
      catch (error) { withhold(id, d, `no ${missing.join('/')} crop yet; cutting its sheet failed: ${error.message}`); console.log(`withheld ${id} (${d}): cutting its sheet failed: ${error.message}`); continue; }
    } else if (missing.length) { withhold(id, d, `no ${missing.join('/')} crop yet`); continue; }
    const b = best.get(id);
    if (pinned.has(id) ? pinned.get(id) === d : !b || b.n < +m[2]) best.set(id, { slug: m[1], version: d, n: +m[2], GEN, crops });
  }
  console.log(`sources: ${GENS.map(d => path.relative(root, d) || '.').join(', ')}`);
  for (const [id, { slug, version, GEN, crops }] of best) {
    const dir = path.join(STORE, slug), source = path.join(dir, 'source.json');
    const old = fs.existsSync(source) ? JSON.parse(fs.readFileSync(source, 'utf8')) : null, files = {};
    fs.mkdirSync(dir, { recursive: true });
    for (const v of DIRS) { const buf = crops ? crops.views[v] : fs.readFileSync(path.join(GEN, version, `${v}.native.png`)); files[v] = sha(buf); if (old?.files?.[v] !== files[v]) fs.writeFileSync(path.join(dir, `${v}.png`), buf); }
    fs.copyFileSync(path.join(GEN, `${version}.provenance.json`), path.join(dir, 'provenance.json'));
    fs.writeFileSync(source, JSON.stringify({ id, version, files, ...(crops ? { cropsBy: 'prep-views (four-view-cells.mjs)' } : {}) }, null, 1) + '\n');
    if (old?.version !== version) console.log(`synced ${id}: ${version}`);
    if (crops) { console.log(`cropped ${id} (${version}) from its reviewed sheet`); if (crops.warnings.length) console.warn(`crop warnings ${id} (${version}): ${crops.warnings.join('; ')}`); }
  }
}

// the original sprites (every {"id": ...} object literal in the generated libraries) and the owner scales
const items = new Map();
for (const f of ['library', 'east-library', 'business-library', 'construction-library', 'golf-library', 'cars-library']) {
  const text = fs.readFileSync(path.join(root, `src/game/${f}.ts`), 'utf8');
  for (let i = text.indexOf('{"id":"'); i >= 0; i = text.indexOf('{"id":"', i + 1)) {
    let depth = 0, quote = false, j = i;
    for (; j < text.length; j++) { const c = text[j]; if (quote) { if (c === '\\') j++; else if (c === '"') quote = false; } else if (c === '"') quote = true; else if (c === '{') depth++; else if (c === '}' && --depth === 0) break; }
    const it = JSON.parse(text.slice(i, j + 1)); if (!items.has(it.id)) items.set(it.id, it); i = j;
  }
}
const scales = fs.readFileSync(path.join(root, 'src/game/lots/scales.ts'), 'utf8'), studio = readScales();
// the scale a building is drawn at: the studio's size now (scale-overrides.json, read by the game at runtime), else the table's (scales.ts)
const owner = id => studio[id] ?? +(new RegExp(`"${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}": ([0-9.]+)`).exec(scales)?.[1] ?? 1);
// the stand-ins (src/game/newart.ts: a building of the art inventory without its four views is drawn as the new-art building of its family
// nearest its size, filling its footprint): each is packed for the largest size any building drawn as it needs (that building's scale x their
// footprints' ratio), so a swapped building is as sharp at its size as one with its own views. The game's own rule, run as the game runs it
// (stand-in-needs.ts bundled, the libraries as they are now: a subject synced for the first time this run is counted from the next run)
fs.mkdirSync(REVIEW, { recursive: true });
const NEED = await (async () => {
  const outfile = path.join(REVIEW, 'stand-in-needs.mjs');
  try {
    await build({ entryPoints: [path.join(root, 'scripts/assets/stand-in-needs.ts')], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent', loader: { '.webp': 'empty', '.png': 'empty' } });
    return JSON.parse(execFileSync(process.execPath, [outfile], { cwd: root, maxBuffer: 64 << 20 }).toString());
  } catch (error) { console.warn(`stand-in sizes not read (every building packed for its own size only): ${error.message}`); return {}; }
})();
/** the scale a building's views are packed for: its own (the studio's size, else the table's), or more when a building drawn as it needs more */
// T190: a lot preset that draws a building bigger (up to 1.5 times its size) counts as drawn: its views are packed that big
const PRESET_SCALE = presetScales(root);
const packFor = id => Math.max(1, owner(id) * (PRESET_SCALE.get(id) ?? 1), NEED[id] ?? 0);
// the buildings of the game: the inventory's buildings and baked lots (east:<id> is its subject's east view), and any library sprite of a
// building kind the inventory has not seen (not one it files elsewhere or leaves out, such as the golf equipment, nor a removed id)
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'art/theme-consistency/inventory.json'), 'utf8'));
const seenIds = new Set(['items', 'excluded', 'excludedNonSubjects', 'sourceOnly'].flatMap(k => (inventory[k] ?? []).map(x => x.id)));
const removedIds = new Set([.../export const REMOVED_IDS[^=]*= \[([^\]]*)\]/.exec(scales)[1].matchAll(/"([^"]+)"/g)].map(m => m[1]));
const BUILDING_KINDS = new Set(['house', 'building', 'venue', 'lot', 'business', 'gazebo', 'arcade']), subjectOf = new Map();
for (const x of inventory.items) if (x.category === 'buildings' || x.category === 'composite-lots') subjectOf.set(x.id, x.subject ?? x.id);
for (const [id, it] of items) if (BUILDING_KINDS.has(it.kind) && !removedIds.has(id) && !seenIds.has(id)) subjectOf.set(id, id.replace(/^east:/, ''));

// 2-3. size, footprint and ground point of every view
const subjects = [], unmeasured = [], capped = [];
let gauged = 0;
for (const slug of fs.readdirSync(STORE).filter(d => fs.existsSync(path.join(STORE, d, 'source.json'))).sort()) {
  const { id, version, files } = JSON.parse(fs.readFileSync(path.join(STORE, slug, 'source.json'), 'utf8')), base = items.get(id);
  if (!base) { console.warn(`skipped ${id}: not in the library`); continue; }
  const k = owner(id), meas = measures.subjects[id], views = [];
  // the gauge's scale: frozen at the first gauging (written back below), so the studio's size multiplies the gauged size from then on
  const kg = meas?.gaugeScale ?? k;
  for (const v of DIRS) {
    const png = fs.readFileSync(path.join(STORE, slug, `${v}.png`)), { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // the lowest opaque row: the near corner of the footprint (+hx, +hy)
    let by = -1, bx = 0, n = 0;
    for (let y = info.height - 1; y >= 0 && by < 0; y--) { for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 128) { bx += x; n++; } if (n) by = y; }
    const m = meas?.views?.[v], door = m?.door && m.sha256 === files[v] ? m.door : 0;
    views.push({ dir: v, png, W: info.width, H: info.height, bx: bx / n, by: by + 1, door, s: door ? measures.standardDoor / (door * kg) : 0 });
  }
  // business artwork is drawn at a share of its parcel (business/art.ts), whatever its size here: it keeps the original width, no door gauge
  const business = base.kind === 'business', measured = business ? [] : views.filter(x => x.s);
  if (measured.length) { const mean = measured.reduce((a, x) => a + x.s, 0) / measured.length; for (const x of views) if (!x.s) x.s = mean; }
  else { if (!business && !meas?.noGauge) unmeasured.push(`${id} (${version})`); const s = (base.quad[2] - base.quad[0]) / views[0].W; for (const x of views) x.s = s; }
  if (measured.length && meas && meas.gaugeScale === undefined) { meas.gaugeScale = +k.toFixed(3); gauged++; }
  // never past 3x the picture's own pixels at the closest zoom: drawn at k, a view is 0.6 x W x s x k device px wide from its W native px
  if (!business) {
    const cap = 3 / (MIP0 * k), over = Math.max(...views.map(x => x.s / cap));
    if (over > 1.001) { for (const x of views) x.s = Math.min(x.s, cap); capped.push(`${id} (x${over.toFixed(2)} past 3x its pixels at scale ${k.toFixed(2)}: drawn ${(100 / over).toFixed(0)}% as big)`); }
  }
  const f = business ? 1 : views[0].W * views[0].s / (base.quad[2] - base.quad[0]);
  for (const x of views) {
    const turn = x.dir === 'SE' || x.dir === 'NW';
    x.boxes = base.boxes.map(b => turn ? { hx: +(b.hy * f).toFixed(2), hy: +(b.hx * f).toFixed(2), dx: 0, dy: 0 } : { hx: +(b.hx * f).toFixed(2), hy: +(b.hy * f).toFixed(2), dx: 0, dy: 0 });
    const { hx, hy } = x.boxes[0];
    x.w = x.W * x.s; x.h = x.H * x.s;
    // business art: the ground point is a quarter of the width above the picture's lowest point (a footprint diamond as wide as the art)
    if (business) { x.ax = x.bx * x.s; x.ay = x.by * x.s - x.w / 4; }
    else { x.ax = x.bx * x.s - 32 * (hx - hy); x.ay = x.by * x.s - 16 * (hx + hy); }
    x.glows = base.glows?.length ? (await findGlows(x.png, { id, w: x.w, cat: base.cat })).map(g => ({ x: +g.x.toFixed(1), y: +g.y.toFixed(1), r: +g.r.toFixed(1) })) : undefined;
  }
  subjects.push({ id, slug, version, base, views, f });
  console.log(`${id} ${version}: ${business ? 'business art, original width' : `doors ${views.map(x => `${x.dir} ${x.door || '-'}`).join(', ')}`}; scale ${views.map(x => x.s.toFixed(3)).join('/')}; width ${base.quad[2].toFixed(0)} -> ${views[0].w.toFixed(0)} (footprint x${f.toFixed(2)})`);
}

// 4. shelf-pack onto as many 2048 pages as it takes
// each view at its drawn size at the closest zoom (0.6 x its owner scale, at least 1, or the size the buildings drawn as it need), upscaled past
// its picture's own pixels up to 3x them; no headroom for the Lot Composer's +5% (the GPU memory: the game caps those few draws at the picture's
// pixels, newart.ts lookOf)
const packAt = (sub, x) => Math.min(3 * x.W / x.w, MIP0 * packFor(sub.id));
const standIns = subjects.filter(sub => (NEED[sub.id] ?? 0) > owner(sub.id) * 1.001).map(sub => { const x = sub.views[0], got = packAt(sub, x) / MIP0; return `${sub.id} x${NEED[sub.id].toFixed(2)} (own x${owner(sub.id).toFixed(2)}${got < NEED[sub.id] * 0.999 ? `, capped at x${got.toFixed(2)}: 3x its pixels` : ''})`; });
const all = subjects.flatMap(sub => sub.views.map(x => ({ sub, x, width: Math.max(1, Math.round(x.w * packAt(sub, x))), height: Math.max(1, Math.round(x.h * packAt(sub, x))) }))).sort((a, b) => b.height - a.height);
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
  '/** the four-view art is never mirrored: a flip (the world axes swapped) is the building turned, NE <-> SE and SW <-> NW */',
  `const VIEW_TURN: Record<string, string> = ${JSON.stringify(Object.fromEntries(subjects.flatMap(({ id }) => {
    const se = items.has(`east:${id}`) ? `east:${id}` : `view:${id}:se`, sw = `view:${id}:sw`, nw = `view:${id}:nw`;
    return [[id, se], [se, id], [sw, nw], [nw, sw]];
  })))};`,
  '/** a sprite and flip as it is drawn: the four-view art turned to its partner view, unflipped; anything else as it is */',
  'export function unmirror(id: string, flip: boolean): [string, boolean] { const t = flip ? VIEW_TURN[id] : undefined; return t ? [t, false] : [id, flip]; }',
  '/** the buildings of the game (art/theme-consistency/inventory.json and the library sprites of a building kind): never mirrored (mirror.ts) */',
  `export const BUILDING_IDS: ReadonlySet<string> = new Set(${JSON.stringify([...subjectOf.keys()].sort())});`,
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
if (capped.length) console.log(`Capped at 3x their pixels (drawn smaller than the door gauge or the original width asks): ${capped.join(', ')}`);
if (standIns.length) console.log(`Packed past their own size as stand-ins (the largest size a building drawn as them needs): ${standIns.join(', ')}`);
if (gauged) { fs.writeFileSync(path.join(STORE, 'measures.json'), `${JSON.stringify(measures, null, 1)}\n`); console.log(`Froze the gauge scale of ${gauged} subject(s) in art/building-views/measures.json`); }
if (unmeasured.length) console.log(`Unmeasured (kept at the original width; add door gauges to art/building-views/measures.json): ${unmeasured.join(', ')}`);

// 5. coverage: every building subject, done (its views in the game) or missing (withheld versions and why, or none generated yet)
const done = new Map(subjects.map(s => [s.id, s.version])), bySubject = new Map();
for (const [id, subject] of subjectOf) { if (!bySubject.has(subject)) bySubject.set(subject, []); bySubject.get(subject).push(id); }
const rows = [...bySubject].sort(([a], [b]) => a.localeCompare(b)).map(([subject, ids]) => {
  const name = (items.get(subject) ?? items.get(ids[0]))?.name ?? '', also = ids.filter(i => i !== subject), lot = items.get(subject)?.kind === 'lot';
  const status = done.has(subject) ? `done: ${done.get(subject)}` : withheld.has(subject) ? `missing: withheld (${withheld.get(subject).join('; ')})` : lot ? 'missing: baked lot, not in the generation plan' : 'missing: not generated yet';
  return { subject, name: name.replace(/\|/g, '/'), also, status };
});
const missing = rows.filter(r => !r.status.startsWith('done'));
fs.writeFileSync(path.join(STORE, 'COVERAGE.md'), [
  '# Building art coverage', '',
  'Generated by `node scripts/assets/prep-views.mjs` (re-run it when new sheets land). Every building of the game: **done** has its four generated views',
  '(NE, SE, SW, NW) in the game; **missing** is still drawn as its old picture, and never mirrored (src/game/mirror.ts): a flipped one is drawn unflipped',
  'until its views land, so it may face the other way but its light stays on the right.', '',
  `**${rows.length - missing.length} done, ${missing.length} missing** of ${rows.length} building subjects (${subjectOf.size} library sprites; east:<id> is its subject's east view).`, '',
  '| subject | name | status |', '| --- | --- | --- |',
  ...rows.map(r => `| \`${r.subject}\`${r.also.length ? ` (+ ${r.also.map(a => `\`${a}\``).join(', ')})` : ''} | ${r.name} | ${r.status} |`), ''].join('\n'));
console.log(`Coverage: ${rows.length - missing.length} of ${rows.length} building subjects done, ${missing.length} missing (${missing.filter(r => r.status.includes('withheld')).length} withheld); art/building-views/COVERAGE.md`);
