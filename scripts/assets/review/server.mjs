// The sprite studio: the owner's screen for fixing the game's sprites.
//   Library: every sprite as the game has it (cut from the atlas) and every lot decal (leaf drifts, stains: the decal strip), beside a person for scale: remove it from the game, or make it
//            bigger or smaller everywhere it is placed (scripts/assets/removed.json, scale-overrides.json). Each card is the picture the game draws at the size it
//            draws it (an old building as its new-art stand-in; review/size-report.ts runs the game's own code), with the size it is sharp to at the closest
//            zoom: a size past its picture's own pixels is refused. The game reads scale-overrides.json at runtime: a size shows after a reload of the game.
//   Lots:    the baked house lots: click any sprite in one to move, resize, flip or delete it there (lot-edits.json)
//   People:  every townsperson's walk (art/people3d, 8 facings x idle + 8 walk frames), animated: fix any frame that faces the wrong way (mirror it, use another frame in its
//            place, or drop in a new picture): walker-fixes.json, the pictures in scripts/assets/walker-frames (walker-fix.mjs)
//   Holes:   the golf hole presets (src/game/golf/hole-presets.json, 18 slots): areas and props edited on a canvas, or a generated hole from a seed (holes.js)
//   Ground:  the map's base grass: two pictures (any ground picture or grass photo) with size and colour controls, mixed as the game mixes them,
//            previewed on a block of 4 houses inside 4 streets; Save writes src/game/base-grass.json and src/assets/ground/base-grass-a/-b.webp (ground.js);
//            and the map decals over it (nature patches, bare soil, grass patches, leaf scatters, tufts): Save decals writes src/game/map-decals.json
//   Rebuild: runs the asset steps again, then npm run build, so the game takes the changes.
//   node scripts/assets/review/server.mjs [--port 5179]   then open http://127.0.0.1:5179/
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, buildSync } from 'esbuild';
import sharp from 'sharp';
// no file cache: sharp keeps the atlas pages it read open, and on Windows the Rebuild then cannot delete them (EPERM)
sharp.cache(false);
import { ROOT, TOT } from '../source.mjs';
import { readRemoved, writeRemoved } from '../removed.mjs';
import { readLotEdits, readScales, readWalkerFixes, writeLotEdits, writeScales, writeWalkerFixes } from '../overrides.mjs';
import { LIB, drawOrder, rectOf, render } from '../lot-render.mjs';
import { mapScale } from '../lot-layout.mjs';
import { boundsOf, lotVariants } from '../lot-variants.mjs';
import { fixCode, newFramePath, parseFix } from '../walker-fix.mjs';

const PORT = +(process.argv[process.argv.indexOf('--port') + 1] || 5179) || 5179;
const ATLAS = path.join(ROOT, 'src/assets/atlas'), CACHE = path.join(ROOT, 'output/review/thumbs');
fs.mkdirSync(CACHE, { recursive: true });
const LOT_RES = 0.45;

// ---------------------------------------------------------------- sizes: every sprite as the game draws it (review/size-report.ts)
const SIZE_SRC = path.join(ROOT, 'scripts/assets/review/size-report.ts'), SIZE_OUT = path.join(ROOT, 'output/review/size-report.mjs');
const SIZE_INPUTS = [SIZE_SRC, path.join(ROOT, 'scripts/assets/scale-overrides.json'), ...['library', 'views-library', 'trees-library', 'cars-library', 'east-library', 'business-library',
  'construction-library', 'golf-library', 'newart', 'sizes', 'lots/scales', 'lots/studio-base'].map(f => path.join(ROOT, 'src/game', `${f}.ts`))];
let sizes = { stamp: '', data: {} }, sizing = null;
/** the size report: id -> { scale, base, sizeId, drawn: { id, name, quad, scale, fill, cap } | null, sharp, native, and the picture's atlas rect and page },
 *  rebuilt when a library, the scales or the studio's sizes change (fresh: false takes the last one as it is) */
async function sizeReport(fresh = true) {
  if (!fresh && sizes.stamp) return sizes.data;
  const stamp = SIZE_INPUTS.map(f => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } }).join(',');
  if (stamp === sizes.stamp) return sizes.data;
  sizing ??= (async () => {
    try {
      // the atlas pages as their file paths (the thumbnails are cut from them), every other import as the game has it
      await build({ entryPoints: [SIZE_SRC], bundle: true, platform: 'node', format: 'esm', outfile: SIZE_OUT, logLevel: 'silent',
        plugins: [{ name: 'atlas-paths', setup(b) { b.onLoad({ filter: /\.(webp|png)$/ }, a => ({ contents: `export default ${JSON.stringify(a.path)};`, loader: 'js' })); } }] });
      const out = await new Promise((ok, fail) => execFile(process.execPath, [SIZE_OUT], { cwd: ROOT, maxBuffer: 256 << 20 }, (e, so) => (e ? fail(e) : ok(so))));
      sizes = { stamp, data: JSON.parse(out) };
    } catch (e) { console.warn(`size report failed (the Library shows the sprites without their game sizes): ${e.message}`); sizes = { stamp, data: sizes.data }; }
    finally { sizing = null; }
  })();
  await sizing; return sizes.data;
}
await sizeReport();

// ---------------------------------------------------------------- the game's sprites (src/game/library.ts)
function library() {
  const src = fs.readFileSync(path.join(ROOT, 'src/game/library.ts'), 'utf8'), out = [];
  for (const m of src.matchAll(/^ {2}(\{"id".*\}),$/gm)) { const e = JSON.parse(m[1]); out.push({ id: e.id, name: e.name, cat: e.cat, kind: e.kind, tex: e.tex, w: e.w, h: e.h, quad: e.quad }); }
  // the lot decals (src/game/lot-decals.ts): packed at their scale (prep-decals.mjs), so their rect is the game size; w/h here are the native size
  const decals = fs.readFileSync(path.join(ROOT, 'src/game/lot-decals.ts'), 'utf8'), seen = new Set(out.map(s => s.id));
  for (const m of decals.matchAll(/^ {2}(\{"id".*\}),$/gm)) { const e = JSON.parse(m[1]), it = LIB.get(e.id); if (!seen.has(e.id)) out.push({ id: e.id, name: e.id, cat: 'Decals', kind: 'decal', w: Math.round(it?.w ?? e.w), h: Math.round(it?.h ?? e.h), rect: [e.x, e.y, e.w, e.h] }); }
  // the libraries the game appends at runtime: each file's items, with the mip-0 page of the item's tex[0]
  // as the game does (REMOVED_IDS in src/game/lots/scales.ts): a removed sprite is left out, and an east view goes with its front (no 'east:')
  const have = new Set(out.map(s => s.id)), gone = readRemoved();
  for (const a of APPENDED) {
    const txt = a.re.exec(fs.readFileSync(path.join(ROOT, a.file), 'utf8'))[1].replace(/,(\s*)\]/g, '$1]');
    for (const e of JSON.parse(txt)) if (!have.has(e.id) && !gone[e.id] && !gone[e.id.replace(/^east:/, '')]) { have.add(e.id); out.push({ id: e.id, name: e.name, cat: e.cat, kind: e.kind, tex: e.tex, w: e.w, h: e.h, quad: e.quad, ax: e.ax, ay: e.ay, page: path.join(ROOT, a.page(e.tex[0])) }); }
  }
  // the game's own pictures (size-report.ts): the four-view art in place of the old pictures it replaced, and the libraries not listed above (the
  // generated trees); a building's other views (view:<id>:se|sw|nw) are not cards of their own: they take their building's size and removal
  const at = new Map(out.map((s, i) => [s.id, i]));
  for (const [id, e] of Object.entries(sizes.data)) {
    const i = at.get(id), pic = { tex: e.tex, w: e.w, h: e.h, quad: e.quad, ax: e.ax, ay: e.ay, page: e.page };
    if (i !== undefined) { if (!out[i].rect && e.page) Object.assign(out[i], pic); }
    else if (!id.startsWith('view:') && !gone[id] && e.page) { out.push({ id, name: e.name, cat: e.cat, kind: e.kind, ...pic }); at.set(id, out.length - 1); }
  }
  const people = JSON.parse(/WALKER_PEOPLE[^=]*= (\[.*\]);/.exec(src)?.[1] ?? '[]'), wf = JSON.parse('[' + (/const WF = \[(.*)\];/.exec(src)?.[1] ?? '') + ']');
  // WF holds every frame of every person (per person: WALK_DIRS x WALK_FRAMES frames of 9 numbers); the first one (idle, facing S) is the picture
  const perPerson = (/WALK_DIRS = (\[[^\]]*\])/.exec(src) ? JSON.parse(/WALK_DIRS = (\[[^\]]*\])/.exec(src)[1]).length : 0) * +(/WALK_FRAMES = (\d+)/.exec(src)?.[1] ?? 0);
  people.forEach((p, i) => { const o = i * perPerson * 9; if (perPerson && wf.length > o + 8) out.push({ id: p.id, name: p.id.replace(/^person:/, ''), cat: 'Townspeople', kind: 'walker', tex: wf.slice(o, o + 5), w: p.w, h: p.h, quad: wf.slice(o + 5, o + 9), ax: p.ax, ay: p.ay }); });
  return out;
}
// the appended libraries: the item array (one line in cars and businesses, several in east) and the page file for a page index
const APPENDED = [
  { file: 'src/game/cars-library.ts', re: /ITEMS: LibItem\[\] = (\[[\s\S]*?\]);\n/, page: p => `src/assets/cars/cars-${p}.webp` },
  { file: 'src/game/east-library.ts', re: /ITEMS: LibItem\[\] = (\[[\s\S]*?\]);\n/, page: p => `src/assets/east/east-${p}-0.webp` },
  { file: 'src/game/business-library.ts', re: /items: LibItem\[\] = (\[[^\n]*\]);\n/, page: p => `src/assets/businesses/integrated/business-${p}-0.webp` },
  { file: 'src/game/construction-library.ts', re: /ITEMS: LibItem\[\] = (\[[\s\S]*?\]);\n/, page: p => `src/assets/construction/construction-${p}.webp` },
  { file: 'src/game/golf-library.ts', re: /ITEMS: LibItem\[\] = (\[[\s\S]*?\]);\n/, page: p => `src/assets/golf/golf-${p}.webp` },
];
const safe = id => id.replace(/[^a-z0-9_.-]/gi, '_');
const DECAL_PAGE = path.join(ROOT, 'src/assets/ground/lot-decals.webp');
/** a sprite's picture as the game has it, cut from the atlas, or a lot decal's from its strip (cached on disk, so a removed sprite still shows after a rebuild) */
async function thumb(id) {
  const f = path.join(CACHE, safe(id) + '.png'), stamp = f + '.json';
  const s = library().find(x => x.id === id);
  // Removed sprites and decals lose their entry; their last picture must survive a rebuild.
  if (!s?.tex && !s?.rect) return fs.existsSync(f) ? fs.readFileSync(f) : null;
  const page = s.rect ? DECAL_PAGE : s.page ?? path.join(ATLAS, `sprites-${s.tex[0]}-0.webp`), stat = fs.statSync(page);
  const version = JSON.stringify([s.rect ?? s.tex, s.quad, stat.size, stat.mtimeMs]);
  if (fs.existsSync(f) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === version) return fs.readFileSync(f);
  const m = await sharp(page).metadata();
  let left, top, width, height;
  if (s.rect) [left, top, width, height] = s.rect;
  else { const [, u0, v0, u1, v1] = s.tex; left = Math.round(u0 * m.width); top = Math.round(v0 * m.height); width = Math.max(1, Math.round((u1 - u0) * m.width)); height = Math.max(1, Math.round((v1 - v0) * m.height)); }
  const png = await sharp(page).extract({ left, top, width, height }).resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  fs.writeFileSync(f, png); fs.writeFileSync(stamp, version); return png;
}

// ---------------------------------------------------------------- lots: the variants with the owner's edits, their pictures and hit boxes
function lotState(id) {
  const v = lotVariants().find(x => x.id === id); if (!v) return null;
  const edits = readLotEdits()[id] ?? {};
  // every raw placement with its edit applied (deleted ones left out), remembering its index (edits are keyed by it)
  // (a rejected house's delete is spent on its replacement: v.raw has the new house at v.houseIdx, see lot-variants.mjs)
  const items = v.raw.map((p, i) => { const e = v.swapped && i === v.houseIdx ? undefined : edits[i]; if (e?.del) return null; return { ...p, idx: i, x: +(p.x + (e?.dx ?? 0)).toFixed(3), y: +(p.y + (e?.dy ?? 0)).toFixed(3), scale: e?.scale ?? p.scale, flip: e?.flip ?? p.flip, edited: !!e }; }).filter(Boolean);
  const box = boundsOf(items, v.W, v.D);
  return { v, items, box, edits };
}
const lotPics = new Map();
async function lotPicture(id) {
  const st = lotState(id); if (!st) return null;
  const key = id + JSON.stringify(st.edits); if (lotPics.has(key)) return lotPics.get(key);
  const png = await render(st.items, st.box, LOT_RES, { background: { r: 70, g: 82, b: 42, alpha: 1 } });
  if (lotPics.size > 40) lotPics.clear(); lotPics.set(key, png); return png;
}

// ---------------------------------------------------------------- people: the 3D renders (art/people3d/<id>/) with the fixes applied
const PEOPLE_DIRS = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'];
const PEOPLE3D = path.join(ROOT, 'art/people3d');
function people() {
  const out = [];
  for (const d of fs.existsSync(PEOPLE3D) ? fs.readdirSync(PEOPLE3D).sort() : []) {
    const sheet = path.join(PEOPLE3D, d, 'sheet.webp'), json = path.join(PEOPLE3D, d, 'sheet.json');
    if (!fs.existsSync(sheet) || !fs.existsSync(json)) continue;
    const m = JSON.parse(fs.readFileSync(json, 'utf8')); out.push({ id: m.id, sheet, m });
  }
  return out;
}
/** the frames (per direction) with a dropped-in picture for this person, as 'DIR-k' */
const newFrameList = p => PEOPLE_DIRS.flatMap(d => p.m.frames.map((_, k) => k).filter(k => fs.existsSync(newFramePath(ROOT, p.id, d, k))).map(k => `${d}-${k}`));
/** a frame with its fix applied (as the game draws it), or as the sheet has it when asDrawn */
async function frame(pid, d, k, asDrawn) {
  const p = people().find(x => x.id === pid); if (!p) return null;
  const { m } = p, fix = asDrawn ? null : parseFix(readWalkerFixes()[pid]?.[d]?.[k]);
  const cut = (dir, fr) => sharp(p.sheet).extract({ left: fr * m.frameWidth, top: m.directions.indexOf(dir) * m.frameHeight, width: m.frameWidth, height: m.frameHeight }).png().toBuffer();
  const dropped = fix?.kind === 'new' ? newFramePath(ROOT, pid, d, k) : null;
  let buf;
  if (fix?.kind === 'use') buf = await cut(fix.dir ?? d, fix.frame);
  else if (dropped && fs.existsSync(dropped)) buf = await sharp(dropped).resize(m.frameWidth, m.frameHeight, { fit: 'contain', position: 'bottom', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  else buf = await cut(d, k);
  if (fix?.kind === 'mirror' || fix?.mirror) buf = await sharp(buf).flop().png().toBuffer();
  return sharp(buf).resize(Math.round(m.frameWidth * 0.5), Math.round(m.frameHeight * 0.5)).png().toBuffer();
}

// ---------------------------------------------------------------- rebuild
let job = null;
function rebuild() {
  if (job && !job.done) return job;
  const steps = ['scripts/assets/prep-decals.mjs', 'scripts/assets/nature-patches.mjs', 'scripts/assets/prep-sprites.mjs', 'scripts/assets/prep-scales.mjs', 'scripts/assets/prep-construction.mjs', 'scripts/assets/audit-sprites.mjs'];
  job = { log: '', done: false, code: 0, step: '', started: Date.now() };
  const run = i => {
    if (i >= steps.length) return build();
    job.step = steps[i]; job.log += `\n> node ${steps[i]}\n`;
    const p = spawn(process.execPath, [steps[i]], { cwd: ROOT, env: { ...process.env, TOT_REPO: TOT } });
    p.stdout.on('data', d => { job.log += d; }); p.stderr.on('data', d => { job.log += d; });
    p.on('close', code => { if (code) { job.done = true; job.code = code; job.log += `\nFailed (${code}).\n`; } else run(i + 1); });
  };
  // the last step: the production build, so the test server on 5174 (vite preview of dist/) serves the new sprites
  const build = () => {
    job.step = 'npm run build'; job.log += '\n> npm run build\n';
    const p = spawn('npm run build', { cwd: ROOT, shell: true, env: { ...process.env, TOT_REPO: TOT } });
    p.stdout.on('data', d => { job.log += d; }); p.stderr.on('data', d => { job.log += d; });
    p.on('close', code => { job.done = true; if (code) { job.code = code; job.log += `\nFailed (${code}).\n`; } else job.log += '\nAll done: reload the game (5174 serves the new build; the 5173 dev server reloads by itself).\n'; });
  };
  run(0); return job;
}


// ---------------------------------------------------------------- golf hole presets (the Holes tab; src/game/golf/hole-presets.json)
const OUT = path.join(ROOT, 'output/studio'), HOLES = path.join(ROOT, 'src/game/golf/hole-presets.json'), GRASS_ART = path.join(ROOT, 'src/game/grass-art.ts');
const HL_ENTRY = path.join(ROOT, 'scripts/assets/review/hole-lib.ts'), HL_LOADERS = { '.webp': 'empty', '.png': 'empty', '.jpg': 'empty' };
const LOCAL = 1024; // a hole's local frame (src/game/golf/holepreset.ts: the tee at 0) is offset this far when its outline is checked (the map's centre)
const HOLE_N = 18, FLOWERS = ['town:hydrangea', 'town:fern', 'town:ornamental_grass'], FLAG = 'golf:flagstick', FLAG_FALLBACK = 'business:golf-pin-red';
fs.mkdirSync(OUT, { recursive: true });
buildSync({ entryPoints: [HL_ENTRY], bundle: true, platform: 'node', format: 'esm', outfile: path.join(OUT, 'hole-lib.mjs'), loader: HL_LOADERS, logLevel: 'silent' });
buildSync({ entryPoints: [HL_ENTRY], bundle: true, platform: 'browser', format: 'esm', outfile: path.join(OUT, 'hole-lib.js'), loader: HL_LOADERS, logLevel: 'silent' });
const HL = await import(pathToFileURL(path.join(OUT, 'hole-lib.mjs')).href);
/** the stored holes: 18 slots, null where empty (no file yet: all empty) */
function readHoles() {
  let d = null; try { d = JSON.parse(fs.readFileSync(HOLES, 'utf8')); } catch { /* no file yet */ }
  return { v: 1, holes: Array.from({ length: HOLE_N }, (_, i) => d?.holes?.[i] ?? null) };
}
const r3 = v => Math.round(v * 1000) / 1000;
/** a seeded random (mulberry32) */
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** a hole preset for the seed, its props given sprite ids (a seeded pick, flip and scale; the flag keeps its map scale): the stored format */
function generateHole(seed) {
  const rm = readRemoved(), list = library().filter(s => !rm[s.id]), ids = new Set(list.map(s => s.id));
  const trees = list.filter(s => s.kind === 'tree' && !/dead/.test(s.id)).map(s => s.id), bushes = list.filter(s => s.kind === 'bush').map(s => s.id), flowers = FLOWERS.filter(id => ids.has(id));
  const flag = ids.has(FLAG) ? FLAG : FLAG_FALLBACK, rnd = rng(seed * 7919), hole = HL.holePreset(seed), props = [];
  const pick = a => a[Math.floor(rnd() * a.length)];
  for (const p of hole.props) {
    if (p.kind === 'flag') { props.push({ id: flag, x: r3(p.x), y: r3(p.y), flip: false, scale: r3(mapScale(flag)) }); continue; }
    const pool = p.kind === 'tree' ? trees : p.kind === 'bush' ? bushes : flowers;
    if (!pool.length) continue;
    const id = pick(pool), flip = rnd() < 0.5, scale = r3(mapScale(id) * (0.9 + 0.2 * rnd()));
    props.push({ id, x: r3(p.x), y: r3(p.y), flip, scale });
  }
  return { name: 'Hole', areas: hole.areas.map(a => ({ tex: a.tex, border: a.border, btex: a.btex, radius: a.radius, pts: a.pts.map(r3) })), props };
}
/** a hole as it is stored (the Save body), or the message why it is not valid (a bad area is named by its number) */
function checkHole(h) {
  if (!h || typeof h !== 'object' || Array.isArray(h)) return 'not a hole';
  if (typeof h.name !== 'string') return 'name must be text';
  const TEX = new Set(HL.PAINT_TEXES.map(t => t.id)), BTEX = new Set(HL.BORDER_TEXES.map(t => t.id));
  if (!Array.isArray(h.areas) || !Array.isArray(h.props)) return 'areas and props must be lists';
  const areas = [], props = [], gone = readRemoved(), known = new Set(library().map(s => s.id));
  for (const [i, a] of h.areas.entries()) {
    const at = `area ${i + 1}`;
    if (typeof a?.tex !== 'string' || !TEX.has(a.tex)) return `${at}: unknown texture`;
    if (!Number.isInteger(a.border) || a.border < 0 || a.border > 3) return `${at}: border must be 0-3`;
    if (typeof a.btex !== 'string' || !BTEX.has(a.btex)) return `${at}: unknown border texture`;
    if (typeof a.radius !== 'number' || !(a.radius >= 0 && a.radius <= HL.RADIUS_MAX)) return `${at}: corner radius must be 0-${HL.RADIUS_MAX}`;
    if (a.kind !== undefined && typeof a.kind !== 'string') return `${at}: kind must be text`;
    if (!Array.isArray(a.pts) || a.pts.length < 6 || a.pts.length % 2 || !a.pts.every(Number.isFinite)) return `${at}: corners must be x, y pairs (at least 3)`;
    const bad = HL.checkArea(a.pts.map(v => v + LOCAL)); if (bad) return `${at}: ${bad}`; // the local frame (tee at 0) is checked at the map centre
    areas.push({ tex: a.tex, border: a.border, btex: a.btex, radius: a.radius, ...(a.kind !== undefined ? { kind: a.kind } : {}), pts: a.pts.map(r3) });
  }
  for (const [i, p] of h.props.entries()) {
    const at = `prop ${i + 1}`;
    if (typeof p?.id !== 'string' || !known.has(p.id)) return `${at}: unknown sprite`;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return `${at}: position must be a number`;
    if (typeof p.flip !== 'boolean') return `${at}: flip must be true or false`;
    if (!(p.scale >= 0.1 && p.scale <= 5)) return `${at}: scale must be 0.1 to 5`;
    if (gone[p.id]) continue; // a sprite removed from the game leaves its props out
    props.push({ id: p.id, x: r3(p.x), y: r3(p.y), flip: p.flip, scale: r3(p.scale) });
  }
  return { name: h.name.trim().slice(0, 40) || 'Hole', areas, props };
}

// ---------------------------------------------------------------- the base grass (the Ground tab; src/game/base-grass.ts)
const GL_ENTRY = path.join(ROOT, 'scripts/assets/review/ground-lib.ts'), BG_FILE = path.join(ROOT, 'src/game/base-grass.json');
const MD_FILE = path.join(ROOT, 'src/game/map-decals.json'), DECAL_ART = { nature: 'nature.webp', decals: 'decals.webp', soil: 'soil.webp' };
const BG_PIC = k => path.join(ROOT, `src/assets/ground/base-grass-${k}.webp`), BG_THUMBS = path.join(OUT, 'ground-thumbs');
buildSync({ entryPoints: [GL_ENTRY], bundle: true, platform: 'node', format: 'esm', outfile: path.join(OUT, 'ground-lib.mjs'), loader: HL_LOADERS, logLevel: 'silent' });
buildSync({ entryPoints: [GL_ENTRY], bundle: true, platform: 'browser', format: 'esm', outfile: path.join(OUT, 'ground-lib.js'), loader: HL_LOADERS, logLevel: 'silent' });
const GL = await import(pathToFileURL(path.join(OUT, 'ground-lib.mjs')).href);
fs.mkdirSync(BG_THUMBS, { recursive: true });
/** the pictures the base grass and the texture presets can be made from, by group: every ground picture of the game, the grass-v1 set, the grass care set and its decals, and the grass photos */
const GROUND_SRC = [
  { group: 'Game ground', dir: 'src/assets/ground', re: /\.(webp|png|jpg)$/i, skip: /^base-grass-[ab]\.webp$/ },
  { group: 'Grass v1', dir: 'src/assets/ground/grass-v1/png', re: /\.(webp|png|jpg)$/i },
  // the grass care set (2026-10-23, arena T016): every surface in each condition (lawns, golf grasses, loam, sandy soil, verges), and its decals
  { group: 'Grass care', dir: 'src/assets/ground/grass-management', re: /\.(webp|png|jpg)$/i },
  { group: 'Grass care decals', dir: 'src/assets/ground/grass-management/decals', re: /\.(webp|png|jpg)$/i },
  { group: 'Grass photos', dir: 'art/grass-photo', re: /\.(webp|png|jpg)$/i },
];
function groundSources() {
  const out = [];
  for (const g of GROUND_SRC) {
    const dir = path.join(ROOT, g.dir); if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).sort()) if (g.re.test(f) && !g.skip?.test(f) && fs.statSync(path.join(dir, f)).isFile()) out.push({ group: g.group, src: `${g.dir}/${f}`, name: f.replace(/\.[a-z]+$/i, '') });
  }
  return out;
}
/** a repo path the Ground tab may read (one of the sources), as an absolute path, else null */
function groundAbs(src) { return typeof src === 'string' && groundSources().some(s => s.src === src) ? path.join(ROOT, src) : null; }
function readGround() {
  let f = null; try { f = JSON.parse(fs.readFileSync(BG_FILE, 'utf8')); } catch { /* none yet */ }
  const def = { src: 'src/assets/ground/grass-capital-backyard.webp' }, defB = { src: 'src/assets/ground/grass-capital-meadow.webp' };
  return { v: 1, saved: !!f?.saved, ...(f?.stamp ? { stamp: f.stamp } : {}), a: GL.clampSide(f?.a ?? def), b: GL.clampSide(f?.b ?? defB), mix: GL.clampMix(f?.mix ?? {}) };
}
// the texture presets (the Ground tab's Texture presets; src/game/paint-presets.ts): the list, and each one's baked picture
const PRESETS_FILE = path.join(ROOT, 'src/game/paint-presets.json'), PRESET_PIC = id => path.join(ROOT, `src/assets/ground/preset-${id}.webp`);
function readPresets() { let f = null; try { f = JSON.parse(fs.readFileSync(PRESETS_FILE, 'utf8')); } catch { /* none yet */ } return GL.clampPresets(f); }
function writePresets(f) { fs.writeFileSync(PRESETS_FILE, JSON.stringify(f, null, 1) + '\n'); }
function readDecals() { let f = null; try { f = JSON.parse(fs.readFileSync(MD_FILE, 'utf8')); } catch { /* none yet */ } return GL.clampDecals(f); }
const TYPES = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg' };
let PHOTOS = null;
/** the Paint photo textures: texture id → its file in src/assets/ground (read once from the imports and PHOTO_TEX of grass-art.ts) */
function photos() {
  if (PHOTOS) return PHOTOS;
  const src = fs.readFileSync(GRASS_ART, 'utf8'), file = new Map();
  for (const m of src.matchAll(/^import (\w+) from '\.\.\/assets\/ground\/([^']+)';/gm)) file.set(m[1], m[2]);
  PHOTOS = new Map();
  for (const m of src.matchAll(/\{ tex: '(\w+)', src: (\w+)/g)) if (file.has(m[2])) PHOTOS.set(m[1], file.get(m[2]));
  return PHOTOS;
}

const body = req => new Promise(res => { let s = ''; req.on('data', d => { s += d; }); req.on('end', () => { try { res(JSON.parse(s || '{}')); } catch { res({}); } }); });
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), json = o => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  const png = b => { if (!b) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-cache' }); res.end(b); };
  const P = url.pathname;
  try {
    if (P === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(fs.readFileSync(path.join(ROOT, 'scripts/assets/review/studio.html'), 'utf8')); }
    // library
    if (P === '/api/sprites') {
      const rep = await sizeReport(), list = library(), have = new Set(list.map(s => s.id)), rm = readRemoved(), sc = readScales();
      for (const id of Object.keys(rm)) if (!have.has(id)) list.push({ id, name: rm[id].name ?? id, cat: rm[id].cat ?? 'Removed', kind: rm[id].kind ?? '', tex: null, w: rm[id].w ?? 100, h: rm[id].h ?? 100, quad: rm[id].quad, ax: rm[id].ax, ay: rm[id].ay });
      // every golf sprite under one heading: the tournament art (golf:) and the business art's course pieces and buildings (business:golf-)
      for (const s of list) if (/^(golf:|business:golf-)/.test(s.id)) s.cat = 'Golf';
      for (const s of list) { s.base = s.kind === 'car' ? 0.8 : s.kind === 'walker' || s.kind === 'decal' || s.cat === 'Lots' ? 1 : mapScale(s.id); s.scale = s.kind === 'car' ? 0.8 : sc[s.id] ?? s.base; s.quad ??= [0, 0, s.w, s.h]; delete s.tex; delete s.page; }
      // the game's sizes (size-report.ts): the scale it places each sprite at, what a reset falls back to, the id whose size it takes (a building's
      // views share one), what it is drawn as and how big, the scale it is sharp to at the closest zoom and the most its source pixels allow
      for (const s of list) {
        const e = rep[s.id]; if (!e || s.kind === 'car' || s.kind === 'walker' || s.kind === 'decal') continue;
        Object.assign(s, { scale: e.scale, base: e.base, sizeId: e.sizeId, drawn: e.drawn, sharp: e.sharp, native: e.native });
      }
      // the townspeople, for the cursor: each one's trimmed picture and where its feet are (the anchor) inside it, in native px
      const walkers = list.filter(s => s.kind === 'walker' && !rm[s.id]).map(s => ({ id: s.id, name: s.name, quad: s.quad, ax: s.ax, ay: s.ay }));
      return json({ sprites: list, removed: rm, walkers });
    }
    if (P.startsWith('/thumb/')) return png(await thumb(decodeURIComponent(P.slice(7))));
    if (req.method === 'POST' && (P === '/api/remove' || P === '/api/restore')) {
      const { id } = await body(req), rm = readRemoved(), s = library().find(x => x.id === id);
      if (P === '/api/remove' && id) { await thumb(id).catch(() => null); rm[id] = { ...rm[id], at: new Date().toISOString(), ...Object.fromEntries(['name', 'cat', 'kind', 'w', 'h', 'quad', 'ax', 'ay'].filter(k => s?.[k] !== undefined).map(k => [k, s[k]])) }; }
      else delete rm[id];
      writeRemoved(rm); return json({ removed: rm });
    }
    if (req.method === 'POST' && P === '/api/scale') {
      const { id: asked, factor, reset } = await body(req), sc = readScales(), rep = await sizeReport(false), e = rep[asked];
      // the size is the building's for any of its views (sizeId); a lot decal's base is 1 (prep-decals packs it at its scale), a sprite's is the
      // game's own fallback (its table scale) when the game has it, else the owner's map scale
      const id = e?.sizeId ?? asked, own = rep[id] ?? e;
      const base = (library().find(x => x.id === asked)?.kind ?? readRemoved()[asked]?.kind) === 'decal' ? 1 : own?.base ?? mapScale(id);
      const cur = sc[id] ?? own?.scale ?? base, next = reset ? base : +(cur * factor).toFixed(3);
      // never past its picture's own pixels: the smallest limit of the pictures that take this size (a building's four views; a stand-in's atlas)
      const limit = Math.min(...Object.values(rep).filter(x => x.sizeId === id && x.native != null).map(x => x.native));
      if (!reset && factor > 1 && next > limit * 1.001) return json({ id, scale: cur, base, refused: `pixelates above x${limit.toFixed(2)}: its picture has no more pixels` });
      if (reset) delete sc[id]; else sc[id] = next;
      writeScales(sc); return json({ id, scale: sc[id] ?? base, base });
    }
    // lots
    if (P === '/api/lots') return json(lotVariants().map(v => ({ id: v.id, name: v.name, edits: Object.keys(readLotEdits()[v.id] ?? {}).length })));
    if (P.startsWith('/lot/')) return png(await lotPicture(decodeURIComponent(P.slice(5)).replace(/\.png$/, '')));
    if (P.startsWith('/api/lot/')) {
      const st = lotState(decodeURIComponent(P.slice(9))); if (!st) return json(null);
      const order = drawOrder(st.items).map(({ s, it }) => { const [l, t, w, h] = rectOf(s, it); return { idx: s.idx, id: s.id, name: it.name, flat: !!it.flat, x: s.x, y: s.y, scale: s.scale, flip: s.flip, edited: s.edited, r: [(l - st.box[0]) * LOT_RES, (t - st.box[1]) * LOT_RES, w * LOT_RES, h * LOT_RES] }; });
      return json({ id: st.v.id, name: st.v.name, w: Math.round((st.box[2] - st.box[0]) * LOT_RES), h: Math.round((st.box[3] - st.box[1]) * LOT_RES), items: order });
    }
    if (req.method === 'POST' && P === '/api/lot-edit') {
      const { lot, idx, op } = await body(req), all = readLotEdits(), e = (all[lot] ??= {}), cur = e[idx] ?? {}, v = lotVariants().find(x => x.id === lot), raw = v?.raw[idx];
      if (!raw) return json({ ok: false });
      const step = 0.25, scale = cur.scale ?? raw.scale;
      if (op === 'x+') cur.dx = +((cur.dx ?? 0) + step).toFixed(2); if (op === 'x-') cur.dx = +((cur.dx ?? 0) - step).toFixed(2);
      if (op === 'y+') cur.dy = +((cur.dy ?? 0) + step).toFixed(2); if (op === 'y-') cur.dy = +((cur.dy ?? 0) - step).toFixed(2);
      if (op === 'bigger') cur.scale = +(scale * 1.08).toFixed(3); if (op === 'smaller') cur.scale = +(scale / 1.08).toFixed(3);
      if (op === 'flip') cur.flip = !(cur.flip ?? raw.flip);
      // deleting the lot's house rejects it: another house of its pool takes its spot (lot-variants.mjs); a replacement deleted in turn
      // joins the lot's houseRejects, so the next one is tried; reset on the house brings the original back
      const isHouse = +idx === v.houseIdx;
      if (op === 'delete') { cur.del = true; if (isHouse && v.swapped) e.houseRejects = [...new Set([...(e.houseRejects ?? []), raw.id])]; }
      if (op === 'reset' && isHouse) delete e.houseRejects;
      if (op === 'reset') delete e[idx]; else e[idx] = cur;
      if (!Object.keys(e).length) delete all[lot];
      writeLotEdits(all); return json({ ok: true });
    }
    // people
    if (P === '/api/people') { const fx = readWalkerFixes(); return json(people().map(p => ({ id: p.id, dirs: PEOPLE_DIRS, frames: p.m.frames.length, fixes: fx[p.id] ?? {}, newFrames: newFrameList(p), meta: p.m }))); }
    if (P === '/api/frames-needed') {
      const out = []; for (const [id, rows] of Object.entries(readWalkerFixes())) for (const [dir, row] of Object.entries(rows)) for (const [k, op] of Object.entries(row)) if (op === 'new') out.push({ id, dir, frame: +k, has: fs.existsSync(newFramePath(ROOT, id, dir, k)) });
      return json(out);
    }
    if (P.startsWith('/frame/')) { const [pid, d, k] = decodeURIComponent(P.slice(7)).split('|'); return png(await frame(pid, d, +k, url.searchParams.get('orig') === '1')); }
    if (req.method === 'POST' && P === '/api/walker-fix') {
      const b = await body(req), { id, dir, frame: k } = b, fx = readWalkerFixes();
      // a body without op toggles mirror, as it did before the studio had other fixes
      const code = b.op === undefined ? (fx[id]?.[dir]?.[k] === 'mirror' ? '' : 'mirror') : b.op, fix = parseFix(code);
      if ((code !== '' && !fix) || !people().some(p => p.id === id) || !PEOPLE_DIRS.includes(dir) || !(+k >= 0 && +k <= 8)) { res.writeHead(400); return res.end('bad fix'); }
      const row = ((fx[id] ??= {})[dir] ??= {});
      if (code) row[k] = fixCode(fix); else delete row[k];
      if (!Object.keys(row).length) delete fx[id][dir]; if (!Object.keys(fx[id]).length) delete fx[id];
      writeWalkerFixes(fx); return json({ fixes: fx[id] ?? {} });
    }
    if (req.method === 'POST' && P === '/api/walker-frame') {
      const { id, dir, frame: k, png: b64 } = await body(req), f = +k;
      if (!people().some(p => p.id === id) || !PEOPLE_DIRS.includes(dir) || !(f >= 0 && f <= 8)) { res.writeHead(400); return res.end('bad frame'); }
      let pic; try { pic = await sharp(Buffer.from(b64 ?? '', 'base64')).png().toBuffer(); } catch { res.writeHead(400); return res.end('not a picture'); }
      const file = newFramePath(ROOT, id, dir, f); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, pic);
      const fx = readWalkerFixes(), row = ((fx[id] ??= {})[dir] ??= {});
      if (row[f] !== 'new') { row[f] = 'new'; writeWalkerFixes(fx); }
      return json({ fixes: fx[id], has: true });
    }
    if (req.method === 'POST' && P === '/api/rebuild') return json(rebuild());
    if (P === '/api/status') return json(job && { ...job, log: job.log.slice(-600) });
    // golf hole presets
    if (req.method === 'GET' && P === '/api/holes') return json(readHoles());
    if (req.method === 'POST' && P === '/api/holes') {
      const { n, hole } = await body(req);
      if (!(Number.isInteger(n) && n >= 1 && n <= HOLE_N)) { res.writeHead(400); return res.end('bad slot'); }
      let clean = null;
      if (hole !== null) { clean = checkHole(hole); if (typeof clean === 'string') { res.writeHead(400); return res.end(clean); } }
      const data = readHoles(); data.holes[n - 1] = clean;
      fs.writeFileSync(HOLES, JSON.stringify(data, null, 1) + '\n'); return json(data);
    }
    if (P === '/api/hole-generate') return json(generateHole(Math.trunc(+url.searchParams.get('seed')) || 0));
    if (P.startsWith('/tex/')) {
      const f = photos().get(decodeURIComponent(P.slice(5))), abs = f && path.join(ROOT, 'src/assets/ground', f);
      if (!abs || !fs.existsSync(abs)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(abs)] ?? 'application/octet-stream', 'cache-control': 'no-cache' }); return res.end(fs.readFileSync(abs));
    }
    // the base grass
    if (req.method === 'GET' && P === '/api/ground') {
      const rm = readRemoved(), sc = readScales(), houses = library().filter(x => x.kind === 'house' && x.tex && !rm[x.id]).map(x => ({ id: x.id, name: x.name, quad: x.quad ?? [0, 0, x.w, x.h], ax: x.ax, ay: x.ay, scale: sc[x.id] ?? mapScale(x.id) }));
      return json({ file: readGround(), sources: groundSources(), houses, ranges: GL.RANGES, defaults: { side: GL.DEFAULT_SIDE, mix: GL.DEFAULT_MIX }, decals: readDecals() });
    }
    if (req.method === 'GET' && P === '/api/presets') return json({ ...readPresets(), surfaces: GL.PRESET_SURFACES, size: GL.PRESET_SIZE });
    if (req.method === 'POST' && P === '/api/preset') {
      // { preset, png: the baked seamless picture (base64), replaces: the id it was saved under before (a rename) }
      const { preset, png, replaces } = await body(req), p = GL.clampPreset(preset);
      if (!p || !groundAbs(p.a.src) || !groundAbs(p.b.src)) { res.writeHead(400); return res.end('give it a name and pick a picture for A and for B'); }
      let pic; try { pic = await sharp(Buffer.from(png ?? '', 'base64')).webp({ quality: 90 }).toBuffer(); } catch { res.writeHead(400); return res.end('not a picture'); }
      const m = await sharp(pic).metadata(); if (!(m.width >= 64 && m.width <= 4096 && m.width === m.height)) { res.writeHead(400); return res.end('the picture must be square, 64-4096 px'); }
      const { channels } = await sharp(pic).stats(); p.col = '#' + channels.slice(0, 3).map(c => Math.round(c.mean).toString(16).padStart(2, '0')).join('');
      const f = readPresets(), old = typeof replaces === 'string' ? replaces : p.id;
      if (old !== p.id && f.presets.some(q => q.id === p.id)) { res.writeHead(400); return res.end(`a preset called ${p.name} is there already`); }
      const at = f.presets.findIndex(q => q.id === old);
      if (at >= 0) f.presets[at] = p; else f.presets.push(p);
      if (old !== p.id) fs.rmSync(PRESET_PIC(old), { force: true });
      fs.writeFileSync(PRESET_PIC(p.id), pic); writePresets(f); return json({ ...f, saved: p.id });
    }
    if (req.method === 'POST' && P === '/api/preset-blocks') {
      // { blocks: a preset id or null (any lawn preset), blockShare }: the road blocks' grass
      const { blocks, blockShare } = await body(req), f = readPresets();
      const out = GL.clampPresets({ ...f, blocks: blocks ?? null, blockShare: typeof blockShare === 'number' ? blockShare : f.blockShare });
      writePresets(out); return json(out);
    }
    if (req.method === 'POST' && P === '/api/preset-lawn') {
      // { id, lawn }: the Town lawns picker switches one preset on or off for the lawns (its picture stays as baked)
      const { id, lawn } = await body(req), f = readPresets(), p = f.presets.find(q => q.id === id);
      if (!p || typeof lawn !== 'boolean') { res.writeHead(400); return res.end('no such preset'); }
      p.lawn = lawn; writePresets(f); return json(f);
    }
    if (req.method === 'POST' && P === '/api/preset-delete') {
      const { id } = await body(req), f = readPresets();
      f.presets = f.presets.filter(q => q.id !== id); fs.rmSync(PRESET_PIC(String(id)), { force: true }); writePresets(f); return json(f);
    }
    if (req.method === 'POST' && P === '/api/decals') {
      const { file } = await body(req);
      if (!file || typeof file !== 'object') { res.writeHead(400); return res.end('no settings'); }
      const out = { ...GL.clampDecals(file), stamp: new Date().toISOString() };
      fs.writeFileSync(MD_FILE, JSON.stringify(out, null, 1) + '\n'); return json({ file: out });
    }
    if (P.startsWith('/decal-art/')) {
      const f = DECAL_ART[P.slice(11)]; if (!f) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': 'image/webp', 'cache-control': 'no-cache' }); return res.end(fs.readFileSync(path.join(ROOT, 'src/assets/ground', f)));
    }
    if (P === '/ground-src') {
      const abs = groundAbs(url.searchParams.get('p')); if (!abs) { res.writeHead(404); return res.end(); }
      if (url.searchParams.get('thumb') !== '1') { res.writeHead(200, { 'content-type': TYPES[path.extname(abs).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-cache' }); return res.end(fs.readFileSync(abs)); }
      const st = fs.statSync(abs), f = path.join(BG_THUMBS, safe(url.searchParams.get('p')) + `-${st.size}-${Math.round(st.mtimeMs)}.png`);
      if (!fs.existsSync(f)) fs.writeFileSync(f, await sharp(abs).resize(96, 96, { fit: 'cover' }).png().toBuffer());
      return png(fs.readFileSync(f));
    }
    if (req.method === 'POST' && P === '/api/ground') {
      const { file, a, b } = await body(req);
      if (!file || typeof file !== 'object' || !groundAbs(file.a?.src) || !groundAbs(file.b?.src)) { res.writeHead(400); return res.end('pick a picture for A and for B'); }
      const pics = [];
      for (const b64 of [a, b]) { try { pics.push(await sharp(Buffer.from(b64 ?? '', 'base64')).webp({ quality: 92 }).toBuffer()); } catch { res.writeHead(400); return res.end('not a picture'); } }
      for (const [k, buf] of [['a', pics[0]], ['b', pics[1]]]) { const m = await sharp(buf).metadata(); if (!(m.width >= 16 && m.width <= 4096 && m.width === m.height)) { res.writeHead(400); return res.end(`picture ${k.toUpperCase()} must be square, 16-4096 px`); } }
      const out = { v: 1, saved: true, stamp: new Date().toISOString(), a: GL.clampSide(file.a), b: GL.clampSide(file.b), mix: GL.clampMix(file.mix ?? {}) };
      fs.writeFileSync(BG_PIC('a'), pics[0]); fs.writeFileSync(BG_PIC('b'), pics[1]);
      fs.writeFileSync(BG_FILE, JSON.stringify(out, null, 1) + '\n'); return json({ file: out });
    }
    if (req.method === 'POST' && P === '/api/ground-unsave') {
      // back to the game's grass: the settings go back to the game's (the backyard + meadow pair, the original mix), not saved, and the two pictures go
      fs.rmSync(BG_FILE, { force: true }); for (const k of ['a', 'b']) fs.rmSync(BG_PIC(k), { force: true });
      const f = readGround();
      fs.writeFileSync(BG_FILE, JSON.stringify(f, null, 1) + '\n'); return json({ file: f });
    }
    if (P === '/ground-lib.js' || P === '/ground.js') { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' }); return res.end(fs.readFileSync(P === '/ground.js' ? path.join(ROOT, 'scripts/assets/review/ground.js') : path.join(OUT, 'ground-lib.js'))); }
    if (P === '/hole-lib.js') { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' }); return res.end(fs.readFileSync(path.join(OUT, 'hole-lib.js'))); }
    if (P === '/holes.js') { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' }); return res.end(fs.readFileSync(path.join(ROOT, 'scripts/assets/review/holes.js'))); }
    res.writeHead(404); res.end();
  } catch (e) { res.writeHead(500); res.end(String(e.stack || e)); }
}).listen(PORT, '127.0.0.1', () => console.log(`sprite studio: http://127.0.0.1:${PORT}/`));
