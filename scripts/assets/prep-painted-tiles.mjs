// The hand-painted terrain tile sets (T145, #300): each ready material family's three independently authored detail sets (NEAR, MID, FAR) of
// four large whole tiles, exactly as the art handoff delivers them, into the game's import path, plus the compact runtime manifest the game,
// the tests and the studio read (src/game/painted-tiles.json).
//
// The authority is art/theme-consistency/generated/ground/eight-tiles/READY-MATERIALS.json: only the families listed in its `ready` array ship
// as accepted art. For each one this script follows its canonical selection (its sha256 must match READY-MATERIALS), and per level ships the
// selected set's `primaryTiles` only (never the optional extras, proofs, raw generator outputs, repair guides, seam masters or held versions),
// each PNG's sha256 checked against the selection: any mismatch, missing file or unexpected size stops the script before anything is written.
// Nothing is repainted, recoloured, regraded, resized, cropped, rotated or mirrored: the WebP is the PNG's own pixels at its native size
// (a fully opaque alpha channel is dropped; a picture with real transparency keeps it).
//
// Provisional families (T153, #327): the owner wanted fairway, putting green and long grass in before their handoff. Each family in
// PROVISIONAL that READY-MATERIALS does not list ships provisionally: per level the newest complete set of four tiles in its
// `<level>-v<n>/` folders (a finished `tile-0x.png` set first, else the newest `tile-0x-v<k>.raw.png` set), each sha256 recorded with its
// source file, and the family marked `"provisional": true`. The raw generator outputs are not always the same size within a set (putting
// green MID: 1744x901, 1745x901, 1744x902): the set's native size is the four's common size (the smallest width and height), and a larger
// tile loses its extra right column / bottom row (top-left anchored, as the art pipeline's own manifest-v1 crops a raw variant to its master;
// at most a few px, recorded per tile as `crop`). Nothing is resampled. A provisional family without a complete set at every level is left out (with a warning), never guessed. Once the
// art session's handoff lists the family in READY-MATERIALS, re-running this script ships its canonical selection instead (no other change).
//
// Adding the next family: its handoff lands in READY-MATERIALS (with its canonical selection), run this script, then map it to a surface in
// src/game/painted-surfaces.json (or in the studio's Painted tab). KIND below names the kind of family each material is (the studio's picker).
// A material whose name a legacy painted family (painted-families.json) already has gets the game id `<material>-tiles`, so the old family
// stays selectable.
//
//   node scripts/assets/prep-painted-tiles.mjs [--art <checkout root holding art/>] [--out <root to write src/... under>] [--check]
// --check verifies the hashes and sizes and compares the manifest it would write with the one on disk, writing nothing.
// The art is read from this checkout's art/ folder, else from the main checkout's (a .claude/worktrees/<name> worktree), never written.
// --out (the tests' fixtures) writes the tiles and the manifest under another root instead of this checkout.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { ROOT } from './source.mjs';

const EIGHT = 'art/theme-consistency/generated/ground/eight-tiles';
const READY_REL = `${EIGHT}/READY-MATERIALS.json`;
const arg = k => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
const CHECK = process.argv.includes('--check');
const ART = path.resolve(arg('--art') ?? [ROOT, path.join(ROOT, '../../..')].find(r => fs.existsSync(path.join(r, READY_REL))) ?? ROOT);
const OUT = path.resolve(arg('--out') ?? ROOT);
const OUT_DIR = path.join(OUT, 'src/assets/ground/painted/tiles'), MANIFEST = path.join(OUT, 'src/game/painted-tiles.json');
const LEVELS = ['near', 'mid', 'far'];
/** WebP quality: 90 (lossy, effort 6, sharp YUV). The tiles are fine painted grass and water shown at their native pixels or below (T150):
 *  at 90 the per-pixel error stays below what the game's own bilinear resampling changes, at about a seventh of the PNG's bytes; lossless
 *  WebP would be several times bigger again for no visible gain. */
const QUALITY = 90;
/** the kind of family each material is (painted-families.ts PaintedKind: the studio lists a surface's fitting kinds first) */
const KIND = { 'golden-fescue': 'grass', lake: 'water', 'pale-green-bushes': 'grass', 'pine-straw': 'cut', 'sand-ripples': 'sand', 'sand-raked': 'sand', desert: 'sand', dirt: 'cut', 'sand-long-grass': 'sand', 'long-grass': 'grass', swamp: 'water', fairway: 'grass', 'putting-green': 'grass', 'first-cut': 'grass' };
const NAME = { 'golden-fescue': 'Golden fescue', lake: 'Lake water', 'sand-ripples': 'Sand ripples', fairway: 'Fairway', 'putting-green': 'Putting green', 'long-grass': 'Long grass' };
/** the families that ship provisionally until their handoff (T153, the lead's decision on #327): the course's fairway, green and rough */
const PROVISIONAL = ['fairway', 'putting-green', 'long-grass'];
const TILE_IDS = ['tile-01', 'tile-02', 'tile-03', 'tile-04'];
/** the legacy painted families' ids (painted-families.json): a tile set family whose material has one of these names gets `<material>-tiles` */
const LEGACY = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'src/game/painted-families.json'), 'utf8')).families.map(f => f.id));
const gameId = material => (LEGACY.has(material) ? `${material}-tiles` : material);

/* ---- the anchors (T150, #315): the one world size each set is laid at ----
 * The owner (2026-10-26, after T145's 12 zoom steps): "the textures are also rendering too big. they should be smaller and when you zoom they
 * are not zooming out correct ... if i am at the furthest zoom out level i feel like im seeing a zoomed in version of 1 of the texture images
 * instead of 4 tiles at their max native size". So each set draws at its native pixels (1 painting px = 1 device px) at its anchor zoom (a CSS
 * zoom, iso.ts): its world size is native / (anchor x DPR), one size for the display, and zooming is a real zoom (no steps inside a band). A
 * set is never drawn above its native pixels: zooming in past a set's switch switches to the finer set at once; zooming out, the finer set
 * shrinks below native until the coarser set takes over HYSTERESIS past its switch (FAR at ZOOM_MIN itself, the limit). The next set's tiles
 * are decoded once the zoom is within PRELOAD of its switch. How each anchor was found is in ANCHOR_HOW (and the PR).
 * T153 (#327), the owner: "remove the final furthest zoom out level and lets the closest zoom stay on when you zoom out for longer". ZOOM_MIN
 * rose one zoom step (1.25, a zoom button press) to 0.0075, and FAR follows it; NEAR stays on, shrinking, down to NEAR_UNTIL, where MID (then
 * at half its native size) takes over. NEAR_UNTIL is the owner's number to tune: edit anchors.nearUntil in painted-tiles.json (this script
 * keeps the manifest's value when it re-runs) or the default here. */
const ZOOM_MAX = 0.3, ZOOM_MIN = 0.0075;
const ANCHORS = { near: ZOOM_MAX, mid: 0.1, far: ZOOM_MIN }, HYSTERESIS = 1.04, PRELOAD = 1.414, NEAR_UNTIL = 0.05;
const ANCHOR_HOW = {
  near: "The near reference (material-screenshot-pipeline/references/owner-near.png, the camera near-shop-native.png comes from; its UI is the game's CSS size): the brick shop is 136 px wide; shop-sized buildings placed in the game at 30% and DPR 1 measure 131-138 px, and the boulevard's carriageway (69 px) gives 0.29: the camera was at the closest zoom, ZOOM_MAX 0.3.",
  mid: "The mid reference (owner-mid.png, the source of scene-backgrounds/golden-fescue/mid-anchored-v2): the same shop is 45.2 px (0.332 of NEAR) and the gas canopy 53.8 px (0.344): 0.3 x 0.338 = 0.1.",
  far: "The furthest zoom, ZOOM_MIN (the owner: the four FAR tiles at their native size there); T153 raised it one zoom step (x1.25) from 0.006 to 0.0075, the owner removing the furthest level. The far reference (owner-far.png: the shop about 25 px) was painted at about 0.055.",
};

const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
const rel = p => path.join(ART, p);
const fail = m => { console.error('prep-painted-tiles: ' + m); process.exit(1); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hex = m => '#' + m.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const readJson = p => { try { return JSON.parse(fs.readFileSync(rel(p), 'utf8')); } catch { return null; } };

const readyBuf = fs.existsSync(rel(READY_REL)) ? fs.readFileSync(rel(READY_REL)) : fail(`no ${READY_REL} under ${ART}`);
const ready = JSON.parse(readyBuf);
if (!Array.isArray(ready.ready)) fail('READY-MATERIALS has no ready list');
/** the manifest on disk (its nearUntil, the owner's number, is kept) */
const prevManifest = fs.existsSync(MANIFEST) ? (() => { try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch { return null; } })() : null;
const prevUntil = prevManifest?.anchors?.nearUntil;
const nearUntil = typeof prevUntil === 'number' && Number.isFinite(prevUntil) && prevUntil > 0 && prevUntil < 1 ? prevUntil : NEAR_UNTIL;

// ---- check everything first: nothing is written unless every hash and size matches
const plan = [];
for (const f of ready.ready) {
  const material = f.material, selPath = f.canonicalSelection?.file;
  if (!material || !selPath) fail(`${f.id}: no material or canonical selection`);
  const selBuf = fs.existsSync(rel(selPath)) ? fs.readFileSync(rel(selPath)) : fail(`${f.id}: missing ${selPath}`);
  if (sha256(selBuf) !== f.canonicalSelection.sha256) fail(`${f.id}: ${selPath} sha256 ${sha256(selBuf)} != READY-MATERIALS ${f.canonicalSelection.sha256}`);
  const sel = JSON.parse(selBuf);
  if (sel.id !== f.id) fail(`${f.id}: the selection is for ${sel.id}`);
  if (sel.displayContract && (sel.displayContract.allowMirror || sel.displayContract.allowRotate || sel.displayContract.allowFlip)) fail(`${f.id}: the selection allows mirror/rotate/flip, which the runtime never does`);
  const levels = {};
  for (const level of LEVELS) {
    const rl = f.levels?.[level], set = sel.sets?.[level];
    if (!rl || !set) fail(`${f.id} ${level}: missing in READY-MATERIALS or the selection`);
    if (set.folder !== rl.folder) fail(`${f.id} ${level}: folder ${set.folder} != READY ${rl.folder}`);
    const ids = set.primaryTiles.map(t => t.id);
    if (!same(ids, set.primaryTileIds) || !same(ids, rl.primaryTileIds)) fail(`${f.id} ${level}: primary tile ids differ (${ids} / ${set.primaryTileIds} / ${rl.primaryTileIds})`);
    if (ids.length !== 4) fail(`${f.id} ${level}: ${ids.length} primary tiles, want 4`);
    if (!same(set.nativePixels, rl.nativePixels)) fail(`${f.id} ${level}: native ${set.nativePixels} != READY ${rl.nativePixels}`);
    const vd = set.visualDecision;
    if (!vd?.file || vd.file !== rl.visualDecision) fail(`${f.id} ${level}: visual decision ${vd?.file} != READY ${rl.visualDecision}`);
    if (vd.sha256 && sha256(fs.readFileSync(rel(vd.file))) !== vd.sha256) fail(`${f.id} ${level}: ${vd.file} hash mismatch`);
    if (vd.decision && vd.decision !== 'accepted-for-art-appearance') fail(`${f.id} ${level}: decision ${vd.decision}`);
    const tiles = [];
    for (const t of set.primaryTiles) {
      if (!t.file.startsWith(set.folder + '/')) fail(`${f.id} ${level} ${t.id}: ${t.file} is outside ${set.folder}`);
      const buf = fs.existsSync(rel(t.file)) ? fs.readFileSync(rel(t.file)) : fail(`missing ${t.file}`);
      const h = sha256(buf); if (h !== t.sha256) fail(`${t.file}: sha256 ${h} != selection ${t.sha256}`);
      const meta = await sharp(buf).metadata();
      if (meta.width !== t.nativePixels[0] || meta.height !== t.nativePixels[1] || !same(t.nativePixels, set.nativePixels)) fail(`${t.file}: ${meta.width}x${meta.height}, selection ${t.nativePixels} / set ${set.nativePixels}`);
      tiles.push({ id: t.id, sha256: t.sha256, buf });
    }
    levels[level] = { folder: set.folder, native: set.nativePixels, decision: { file: vd.file, sha256: vd.sha256 ?? null }, tiles, revision: set.revision ?? path.basename(set.folder) };
  }
  plan.push({ material, id: gameId(material), materialId: f.id, key: f.canonicalSelection.sha256, selection: { file: selPath, sha256: f.canonicalSelection.sha256 }, light: sel.light ?? null, levels });
}

/* ---- the provisional families (T153): the newest complete set of four tiles per level, as the art session left them ---- */
const LEVEL_DIR = /^(near|mid|far)-v(\d+)$/;
/** a level's newest complete set in a family's folder: a finished `tile-0x.png` set (newest folder first), else a raw `tile-0x-v<k>.raw.png`
 *  set (newest folder, then newest k, first); null when no folder holds all four */
function provisionalSet(material, level) {
  const dir = `${EIGHT}/${material}`;
  if (!fs.existsSync(rel(dir))) return null;
  const folders = fs.readdirSync(rel(dir)).map(n => n.match(LEVEL_DIR)).filter(m => m && m[1] === level && fs.statSync(rel(`${dir}/${m[0]}`)).isDirectory()).sort((a, b) => +b[2] - +a[2]).map(m => m[0]);
  const all = ps => ps.every(p => fs.existsSync(rel(p)) && fs.statSync(rel(p)).isFile());
  for (const name of folders) {
    const files = TILE_IDS.map(id => `${dir}/${name}/${id}.png`);
    if (all(files)) return { folder: `${dir}/${name}`, revision: name, files, stage: 'finished tiles' };
  }
  for (const name of folders) {
    const ks = [...new Set(fs.readdirSync(rel(`${dir}/${name}`)).map(n => n.match(/^tile-0[1-4]-v(\d+)\.raw\.png$/)).filter(Boolean).map(m => +m[1]))].sort((a, b) => b - a);
    for (const k of ks) {
      const files = TILE_IDS.map(id => `${dir}/${name}/${id}-v${k}.raw.png`);
      if (all(files)) return { folder: `${dir}/${name}`, revision: name, files, stage: `raw generator outputs v${k}` };
    }
  }
  return null;
}
const readyMaterials = new Set(plan.map(p => p.material));
for (const material of PROVISIONAL) {
  if (readyMaterials.has(material)) { console.log(`${material}: in READY-MATERIALS, its canonical selection ships (no longer provisional)`); continue; }
  const levels = {};
  let light = null;
  for (const level of LEVELS) {
    const s = provisionalSet(material, level);
    if (!s) { console.warn(`prep-painted-tiles: ${material} ${level}: no complete set of four tiles; ${material} is left out`); break; }
    const tiles = [];
    for (const [i, file] of s.files.entries()) {
      const buf = fs.readFileSync(rel(file)), meta = await sharp(buf).metadata();
      tiles.push({ id: TILE_IDS[i], sha256: sha256(buf), buf, source: file, size: [meta.width, meta.height] });
    }
    // the set's native size: the four tiles' common size; a tile bigger than it keeps its top-left native pixels (never resampled)
    const native = [Math.min(...tiles.map(t => t.size[0])), Math.min(...tiles.map(t => t.size[1]))];
    for (const t of tiles) {
      const dw = t.size[0] - native[0], dh = t.size[1] - native[1];
      if (dw > 8 || dh > 8) fail(`${t.source}: ${t.size.join('x')} is more than 8 px off the set's ${native.join('x')}: not one set`);
      if (dw || dh) t.crop = { from: t.size, removedRight: dw, removedBottom: dh };
    }
    const report = readJson(`${s.folder}/prepare-report.json`), prov = readJson(s.files[0].replace(/(\.raw)?\.png$/, '.provenance.json'));
    light ??= prov?.lighting ?? null;
    const cropped = tiles.filter(t => t.crop).map(t => `${t.id} ${t.crop.from.join('x')}`);
    const status = [s.stage, cropped.length ? `cropped to the set's ${native.join('x')}: ${cropped.join(', ')}` : null, report?.status ? `prepare-report: ${report.status}${Array.isArray(report.dimensions) ? ` (master ${report.dimensions.join('x')})` : ''}` : null, prov?.reviewStatus ? `review: ${prov.reviewStatus}` : null].filter(Boolean).join('; ');
    levels[level] = { folder: s.folder, native, decision: { file: null, sha256: null }, tiles, revision: s.revision, status };
  }
  if (Object.keys(levels).length !== LEVELS.length) continue;
  const key = sha256(Buffer.from(LEVELS.flatMap(l => levels[l].tiles.map(t => t.sha256)).join(':')));
  plan.push({ material, id: gameId(material), materialId: `painted:${material}`, key, selection: null, provisional: true, light, levels });
}

// ---- write the WebPs and the manifest
const manifest = {
  v: 1,
  note: `Generated by scripts/assets/prep-painted-tiles.mjs from ${READY_REL} (hash-checked) and, for families marked provisional, the newest complete raw sets in their folders (hash-recorded; T153). Do not edit by hand, except anchors.nearUntil.`,
  source: { file: READY_REL, sha256: sha256(readyBuf), date: ready.date ?? null },
  revision: sha256(Buffer.from(plan.map(p => p.key).join(':'))).slice(0, 12),
  display: { minVisibleTiles: ready.displayContract?.minVisibleTiles ?? 2, maxVisibleTiles: ready.displayContract?.maxVisibleTiles ?? 4, allowMirror: false, allowRotate: false, allowFlip: false },
  anchors: { ...ANCHORS, nearUntil, hysteresis: HYSTERESIS, preload: PRELOAD, zoom: [ZOOM_MIN, ZOOM_MAX], how: ANCHOR_HOW },
  webp: { quality: QUALITY },
  families: [],
};
if (!CHECK) fs.mkdirSync(OUT_DIR, { recursive: true });
let kb = 0;
const written = new Set();
for (const p of plan) {
  const fam = { id: p.id, materialId: p.materialId, name: NAME[p.material] ?? p.material.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()), kind: KIND[p.material] ?? 'grass', revision: p.key.slice(0, 12), selection: p.selection, ...(p.provisional ? { provisional: true } : {}), light: p.light, mean: '#808080', levels: {} };
  const means = [];
  for (const level of LEVELS) {
    const L = p.levels[level], out = [];
    for (const t of L.tiles) {
      const file = `tiles/${p.id}/${level}/${t.id}.webp`, abs = path.join(OUT, 'src/assets/ground/painted', file);
      // a provisional tile bigger than its set keeps its top-left native pixels (crop); every other tile is the PNG as it is
      const pic = () => (t.crop ? sharp(t.buf).extract({ left: 0, top: 0, width: L.native[0], height: L.native[1] }) : sharp(t.buf));
      const stats = await sharp(t.crop ? await pic().png().toBuffer() : t.buf).stats(), opaque = stats.isOpaque;
      if (!CHECK) {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        await (opaque ? pic().removeAlpha() : pic()).webp({ quality: QUALITY, effort: 6, smartSubsample: true }).toFile(abs);
        // the WebP keeps the native size (never resized)
        const m = await sharp(abs).metadata(); if (m.width !== L.native[0] || m.height !== L.native[1]) fail(`${file}: wrote ${m.width}x${m.height}`);
      }
      written.add(path.resolve(abs));
      const mean = stats.channels.slice(0, 3).map(c => c.mean); if (level === 'near') means.push(mean);
      const bytes = fs.existsSync(abs) ? fs.statSync(abs).size : 0; kb += bytes / 1024;
      out.push({ id: t.id, file, sha256: t.sha256, mean: hex(mean), ...(t.source ? { source: t.source } : {}), ...(t.crop ? { crop: t.crop } : {}) });
      console.log(file.padEnd(52), `${L.native[0]}x${L.native[1]}`, hex(mean), `${Math.round(bytes / 1024)} KB`, opaque ? '' : '(alpha kept)', p.provisional ? '(provisional)' : '');
    }
    fam.levels[level] = { revision: L.revision, folder: L.folder, native: L.native, decision: L.decision, tiles: out, ...(L.status ? { status: L.status } : {}) };
  }
  fam.mean = hex([0, 1, 2].map(i => means.reduce((s, m) => s + m[i], 0) / means.length));
  manifest.families.push(fam);
}
const text = JSON.stringify(manifest, null, 1) + '\n';
if (CHECK) {
  const have = fs.existsSync(MANIFEST) ? fs.readFileSync(MANIFEST, 'utf8') : '';
  console.log(have === text ? 'check: every hash and size matches; the manifest is current' : 'check: hashes match, but the manifest on disk differs from what the script would write (run it without --check)');
  process.exit(have === text ? 0 : 2);
}
fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
fs.writeFileSync(MANIFEST, text);
// tiles of sets that no longer ship (a provisional set replaced by its canonical selection, a family gone) are removed with their empty folders
const prune = dir => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.resolve(dir, e.name);
    if (e.isDirectory()) { prune(abs); if (!fs.readdirSync(abs).length) fs.rmdirSync(abs); }
    else if (/\.(webp|png)$/.test(e.name) && !written.has(abs)) { fs.unlinkSync(abs); console.log('removed', path.relative(OUT, abs)); }
  }
};
prune(OUT_DIR);
const prov = manifest.families.filter(f => f.provisional).map(f => f.id);
console.log(`${manifest.families.length} families (${prov.length ? `provisional: ${prov.join(', ')}` : 'none provisional'}), ${manifest.families.length * 12} tiles, ${Math.round(kb)} KB; anchors near ${ANCHORS.near} (until ${nearUntil}), mid ${ANCHORS.mid}, far ${ANCHORS.far}; revision ${manifest.revision}`);
