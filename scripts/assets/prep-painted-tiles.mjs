// The hand-painted terrain tile sets (T145, #300): each ready material family's three independently authored detail sets (NEAR, MID, FAR) of
// four large whole tiles, exactly as the art handoff delivers them, into the game's import path, plus the compact runtime manifest the game,
// the tests and the studio read (src/game/painted-tiles.json).
//
// The authority is art/theme-consistency/generated/ground/eight-tiles/READY-MATERIALS.json: only the families listed in its `ready` array ship.
// For each one this script follows its canonical selection (its sha256 must match READY-MATERIALS), and per level ships the selected set's
// `primaryTiles` only (never the optional extras, proofs, raw generator outputs, repair guides, seam masters or held versions), each PNG's
// sha256 checked against the selection: any mismatch, missing file or unexpected size stops the script before anything is written.
// Nothing is repainted, recoloured, regraded, resized, cropped, rotated or mirrored: the WebP is the PNG's own pixels at its native size
// (a fully opaque alpha channel is dropped; a picture with real transparency keeps it).
//
// Adding the next family: its handoff lands in READY-MATERIALS (with its canonical selection), run this script, then map it to a surface in
// src/game/painted-surfaces.json (or in the studio's Painted tab). KIND below names the kind of family each material is (the studio's picker).
//
//   node scripts/assets/prep-painted-tiles.mjs [--art <checkout root holding art/>] [--check]
// --check verifies the hashes and sizes and compares the manifest it would write with the one on disk, writing nothing.
// The art is read from this checkout's art/ folder, else from the main checkout's (a .claude/worktrees/<name> worktree), never written.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { ROOT } from './source.mjs';

const READY_REL = 'art/theme-consistency/generated/ground/eight-tiles/READY-MATERIALS.json';
const arg = k => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
const CHECK = process.argv.includes('--check');
const ART = path.resolve(arg('--art') ?? [ROOT, path.join(ROOT, '../../..')].find(r => fs.existsSync(path.join(r, READY_REL))) ?? ROOT);
const OUT_DIR = path.join(ROOT, 'src/assets/ground/painted/tiles'), MANIFEST = path.join(ROOT, 'src/game/painted-tiles.json');
const LEVELS = ['near', 'mid', 'far'];
/** WebP quality: 90 (lossy, effort 6, sharp YUV). The tiles are fine painted grass and water shown at 0.5x to 1.6x of their native pixels:
 *  at 90 the per-pixel error stays far below what the game's own bilinear resampling changes, at about a seventh of the PNG's bytes; lossless
 *  WebP would be several times bigger again for no visible gain. */
const QUALITY = 90;
/** the kind of family each material is (painted-families.ts PaintedKind: the studio lists a surface's fitting kinds first) */
const KIND = { 'golden-fescue': 'grass', lake: 'water', 'pale-green-bushes': 'grass', 'pine-straw': 'cut', 'sand-ripples': 'sand', 'sand-raked': 'sand', desert: 'sand', dirt: 'cut', 'sand-long-grass': 'sand', 'long-grass': 'grass', swamp: 'water', fairway: 'grass', 'putting-green': 'grass', 'first-cut': 'grass' };
const NAME = { 'golden-fescue': 'Golden fescue', lake: 'Lake water' };

/* ---- the coverage ladder (the camera, iso.ts): how big one tile is in the world at each zoom ----
 * The owner (2026-10-26): two to four complete tile areas across the visible terrain; switch to the next detail set before more than four
 * show; the map overview uses a few large FAR tiles; never stretch a texture continuously under the camera. Two to four tile areas is a zoom
 * range of only sqrt(2), and the game zooms 50x (ZOOM_MIN 0.006 to ZOOM_MAX 0.3), so three fixed world sizes cannot hold it: each band lays
 * its own set at a few discrete world sizes (steps), sqrt(2) apart, picked by the CSS zoom (never the device pixel ratio or the window size,
 * so a resize or a DPR change never changes a tile) with hysteresis. On the reference viewport a step shows exactly 2 whole tile areas at its
 * closest zoom and 4 at its farthest; zooming out switches at 4, zooming back in only HYSTERESIS past the boundary (down to 1.7 areas).
 * The bands follow the game's tiers: NEAR the street zooms, MID the district zooms, FAR the planner map and the overview. */
const ZOOM_MAX = 0.3, ZOOM_MIN = 0.006;
const REF_VIEWPORT = [1920, 1080], AREAS = [2, 4], STEP_RATIO = Math.SQRT2, HYSTERESIS = 1.08;
/** the reference tile aspect (height / width: the 1742 x 902 sets; each level keeps its own native aspect for its height) */
const REF_ASPECT = 902 / 1742;
/** ZOOM_MAX at the middle of step 0 (2 sqrt 2 tile areas) */
const Z0 = ZOOM_MAX * Math.sqrt(STEP_RATIO);
const BANDS = { near: [0, 2], mid: [3, 6], far: [7, 99] };
/** world px (zoom 1) to metres along the screen's horizontal: a 2 m tile's diagonal is 128 world px */
const M_PER_WORLD_X = 2 * Math.SQRT2 / 128;
function ladder() {
  const [vw, vh] = REF_VIEWPORT, steps = [];
  const wAt2 = Math.sqrt(vw * vh / (AREAS[0] * REF_ASPECT)); // the tile's CSS width when 2 tile areas show
  for (let k = 0; ; k++) {
    const zHi = Z0 / STEP_RATIO ** k, zLo = zHi / STEP_RATIO, tileW = wAt2 / zHi;
    const band = Object.entries(BANDS).find(([, [a, b]]) => k >= a && k <= b)[0];
    steps.push({ band, zHi: +zHi.toFixed(6), zLo: +zLo.toFixed(6), tileW: Math.round(tileW), metres: Math.round(tileW * M_PER_WORLD_X) });
    if (zLo <= ZOOM_MIN) break;
  }
  return steps;
}

const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
const rel = p => path.join(ART, p);
const fail = m => { console.error('prep-painted-tiles: ' + m); process.exit(1); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hex = m => '#' + m.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

const readyBuf = fs.existsSync(rel(READY_REL)) ? fs.readFileSync(rel(READY_REL)) : fail(`no ${READY_REL} under ${ART}`);
const ready = JSON.parse(readyBuf);
if (!Array.isArray(ready.ready)) fail('READY-MATERIALS has no ready list');
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
      tiles.push({ t, buf });
    }
    levels[level] = { set, rl, tiles, revision: set.revision ?? path.basename(set.folder) };
  }
  plan.push({ f, sel, selSha: f.canonicalSelection.sha256, levels });
}

// ---- write the WebPs and the manifest
const manifest = {
  v: 1,
  note: `Generated by scripts/assets/prep-painted-tiles.mjs from ${READY_REL} (hash-checked). Do not edit by hand.`,
  source: { file: READY_REL, sha256: sha256(readyBuf), date: ready.date ?? null },
  revision: sha256(Buffer.from(plan.map(p => p.selSha).join(':'))).slice(0, 12),
  display: { minVisibleTiles: ready.displayContract?.minVisibleTiles ?? 2, maxVisibleTiles: ready.displayContract?.maxVisibleTiles ?? 4, allowMirror: false, allowRotate: false, allowFlip: false },
  coverage: { refViewport: REF_VIEWPORT, areas: AREAS, stepRatio: +STEP_RATIO.toFixed(6), hysteresis: HYSTERESIS, zoom: [ZOOM_MIN, ZOOM_MAX], steps: ladder() },
  webp: { quality: QUALITY },
  families: [],
};
if (!CHECK) fs.mkdirSync(OUT_DIR, { recursive: true });
let kb = 0;
for (const { f, sel, selSha, levels } of plan) {
  const material = f.material, fam = { id: material, materialId: f.id, name: NAME[material] ?? material.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()), kind: KIND[material] ?? 'grass', revision: selSha.slice(0, 12), selection: { file: f.canonicalSelection.file, sha256: selSha }, light: sel.light ?? null, mean: '#808080', levels: {} };
  const means = [];
  for (const level of LEVELS) {
    const L = levels[level], out = [];
    for (const { t, buf } of L.tiles) {
      const file = `tiles/${material}/${level}/${t.id}.webp`, abs = path.join(ROOT, 'src/assets/ground/painted', file);
      const stats = await sharp(buf).stats(), opaque = stats.isOpaque;
      if (!CHECK) {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        await (opaque ? sharp(buf).removeAlpha() : sharp(buf)).webp({ quality: QUALITY, effort: 6, smartSubsample: true }).toFile(abs);
        // the WebP keeps the native size (never resized)
        const m = await sharp(abs).metadata(); if (m.width !== t.nativePixels[0] || m.height !== t.nativePixels[1]) fail(`${file}: wrote ${m.width}x${m.height}`);
      }
      const mean = stats.channels.slice(0, 3).map(c => c.mean); if (level === 'near') means.push(mean);
      const bytes = fs.existsSync(abs) ? fs.statSync(abs).size : 0; kb += bytes / 1024;
      out.push({ id: t.id, file, sha256: t.sha256, mean: hex(mean) });
      console.log(file.padEnd(46), `${t.nativePixels[0]}x${t.nativePixels[1]}`, hex(mean), `${Math.round(bytes / 1024)} KB`, opaque ? '' : '(alpha kept)');
    }
    fam.levels[level] = { revision: L.revision, folder: L.set.folder, native: L.set.nativePixels, decision: { file: L.set.visualDecision.file, sha256: L.set.visualDecision.sha256 ?? null }, tiles: out };
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
fs.writeFileSync(MANIFEST, text);
console.log(`${manifest.families.length} families, ${manifest.families.length * 12} tiles, ${Math.round(kb)} KB; ${manifest.coverage.steps.length} coverage steps; revision ${manifest.revision}`);
