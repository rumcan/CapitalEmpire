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
// at most a few px, recorded per tile as `crop`). Nothing is resampled. An explicit held/blocked/rejected appearance review excludes that set,
// including its raw drafts. A provisional family without a complete set at every level is left out (with a warning), never guessed. Once the
// art session's handoff lists the family in READY-MATERIALS, re-running this script ships its canonical selection instead (no other change).
//
// The owner's own paintings (T162, #350): each folder in OWNER (art/owner-supplied/<set>/, committed in this repo) holds the owner's paintings
// exactly as supplied, one a level ({near,mid,far}.png), and its source.json (the family's id, name and kind, each file's sha256 and size):
// a hash or size mismatch stops the script. Each painting ships as its level's one tile (tile-01; the repetition of one tile is accepted for
// now, the lead on #350), provisional, after its edges are healed here once so it tiles with itself (tile-heal.mjs healWrap: the outer
// HEAL_BAND px of each edge cross-faded through a strip of the painting's own middle, the interior untouched; never mirrored, rotated,
// resized or regraded). The wrap mismatch before and after (on the WebP that ships) is recorded per level against the painting's own
// neighbour difference inside; the script stops if a healed wrap is more than HEAL_LIMIT times the inside. The heal (method and band) is part
// of the family's revision, so changing it re-bakes every chunk that laid it. The owner's art is read from this checkout, or from --art.
// T165 (#365): the art session's fairway and putting-green paintings come in the same way (art/owner-supplied/{fairway,putting-green}-20261026,
// families fairway-paint and putting-green-paint), healed with the bridge matched to each seam zone; the fairway's mowing stripes are measured
// and cropped to whole periods where that lines them up across the wrap; the putting green's MID level falls back to the raw provisional MID
// tiles healed with one shared strip (see OWNER). The provisional fairway and putting-green families stay as they were, the old option.
// T170 (#395): once the art session finishes that MID set (tile-0x.png, made with a common collar so any tile meets any tile), it ships as
// made when it tiles cleanly as it is (across any two tiles within HEAL_LIMIT x the inside): the shared strip is kept for a raw set only.
// T191 (#497; the owner: "theres a bunch of new art from the art generator. can you add it to the game, should be some grass in there too"):
// fringe, a new material (eight-tiles/fringe/{near,mid,far}-v1: finished sets, the four tiles each level's export-report.json names), ships
// provisionally as made when it tiles cleanly (MEASURED: its seams across any two tiles recorded, healed with one shared strip if not); the
// putting green's v2 MID and FAR sets ship in a new family, putting-green-v2 (NEAR: the owner's putting-green painting, as putting-green-paint
// has it), as made when they meet themselves. The old families are pinned to the sets they shipped (PIN), so they stay byte-identical: the old
// option. The scene paintings (scene-backgrounds/fringe *-background-anchored-v1, putting-green *-uniform-background-v2) heal to x1.02-1.08 the
// inside, the sets to x0.97-1.16 as made: the sets ship (four tiles a level, never one painting repeated: the owner's no-repeating-pattern rule).
//
// Adding the next family: its handoff lands in READY-MATERIALS (with its canonical selection), run this script, then map it to a surface in
// src/game/painted-surfaces.json (or in the studio's Painted tab). KIND below names the kind of family each material is (the studio's picker).
// A material whose name a legacy painted family (painted-families.json) already has gets the game id `<material>-tiles`, so the old family
// stays selectable.
//
//   node scripts/assets/prep-painted-tiles.mjs [--art <checkout root holding art/>] [--owner-art <root holding art/owner-supplied>] [--out <root to write src/... under>] [--check]
// --check verifies the hashes and sizes and compares the manifest it would write with the one on disk, writing nothing.
// The art is read from this checkout's art/ folder, else from the main checkout's (a .claude/worktrees/<name> worktree), never written.
// --out (the tests' fixtures) writes the tiles and the manifest under another root instead of this checkout.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { ROOT } from './source.mjs';
import { HEAL_AS_MADE as HEAL_NONE, HEAL_MATCH, HEAL_METHOD, HEAL_SHARED, cropPixels, healShared, healWrapWith, setMismatch, stripeCrop, wrapMismatch } from './tile-heal.mjs';

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
const KIND = { 'range-tee-divots-run': 'grass', 'pond-bank-run': 'cut', 'grow-in-run': 'cut', 'field-parking-run': 'grass', 'flower-bed-soil-run': 'cut', 'first-cut-run': 'grass', 'tee-run': 'grass', 'desert-run': 'sand', 'swamp-run': 'water', 'dirt-run': 'cut', 'sand-raked-run': 'sand', 'putting-green-run': 'grass', 'rough-run': 'grass', 'golden-fescue': 'grass', lake: 'water', 'pale-green-bushes': 'grass', 'pine-straw': 'cut', 'sand-ripples': 'sand', 'sand-raked': 'sand', desert: 'sand', dirt: 'cut', 'sand-long-grass': 'sand', 'long-grass': 'grass', swamp: 'water', fairway: 'grass', 'putting-green': 'grass', 'first-cut': 'grass' };
const NAME = { 'range-tee-divots-run': 'Range tee, divots (RUN, quilted)', 'pond-bank-run': 'Pond bank (RUN, quilted)', 'grow-in-run': 'Grow-in soil (RUN, quilted)', 'field-parking-run': 'Field parking (RUN, quilted)', 'flower-bed-soil-run': 'Flower bed soil (RUN, quilted)', 'first-cut-run': 'First cut (RUN, quilted)', 'tee-run': 'Tee (RUN, quilted)', 'desert-run': 'Desert (painted, quilted)', 'swamp-run': 'Swamp (RUN, quilted)', 'dirt-run': 'Dirt (painted, quilted)', 'sand-raked-run': 'Raked sand (painted, quilted)', 'putting-green-run': 'Putting green (painted, quilted)', 'rough-run': 'Rough (RUN, quilted)', 'golden-fescue': 'Golden fescue', lake: 'Lake water', 'sand-ripples': 'Sand ripples', fairway: 'Fairway', 'putting-green': 'Putting green', 'long-grass': 'Long grass', fringe: 'Fringe' };
/** the families that ship provisionally until their handoff (T153, the lead's decision on #327): the course's fairway, green and rough; T191:
 *  the fringe */
const PROVISIONAL = ['fairway', 'putting-green', 'long-grass', 'fringe', 'first-cut-run', 'tee-run', 'desert-run', 'swamp-run', 'dirt-run', 'sand-raked-run', 'putting-green-run', 'rough-run', 'pond-bank-run', 'grow-in-run', 'field-parking-run', 'flower-bed-soil-run', 'range-tee-divots-run'];
/** the RUN.world families (2026-10-27, the owner's ground texture method, docs/art/GROUND-TEXTURE-METHOD.md): tile 1 a level painted by RUN into
 *  a game screenshot and cleaned, tiles 2-4 quilted from it (the agent's E:/ClaudeTemp/ART-RUN/FIRST-CUT-README.md); the approved finished set a
 *  level is `<dir>/<level>/<set>/tile-0x.png` with its export-report.json, under the art checkout (--art) as the art session's sets are. Shipped
 *  provisionally and MEASURED, as made when they tile cleanly. The owner approved first cut for the game on 2026-10-27 ("yes merge") */
const RUN_SETS = { 'first-cut-run': { dir: 'art/theme-consistency/generated/ground/run-grass/first-cut', set: 'tiles-v3b' }, 'tee-run': { dir: 'art/theme-consistency/generated/ground/run-grass/tee', set: 'tiles-v1b' },
  // the art session's desert scene painting, its shop quilted away, tiles 2-4 quilted from it (no RUN call; the owner: "remove that store")
  'desert-run': { dir: 'art/theme-consistency/generated/ground/run-grass/desert', set: 'tiles-v2' },
  // swamp: no clean painting existed, so tile 1 a level is RUN's swamp painted into the game's meadow (the owner's method), tiles 2-4 quilted
  'swamp-run': { dir: 'art/theme-consistency/generated/ground/run-grass/swamp', set: 'tiles-v1' },
  // the art session's dirt scene painting, its store quilted away like the desert's, tiles 2-4 quilted (no RUN call)
  'dirt-run': { dir: 'art/theme-consistency/generated/ground/run-grass/dirt', set: 'tiles-v2' },
  // the art session's building-free raked-sand painting, tiles 2-4 quilted with large patches that follow the rake grooves (no RUN call)
  'sand-raked-run': { dir: 'art/theme-consistency/generated/ground/run-grass/sand-raked', set: 'tiles-v2' },
  // the art session's building-free putting-green paintings (MID/FAR the uniform v2), tiles 2-4 quilted (no RUN call)
  'putting-green-run': { dir: 'art/theme-consistency/generated/ground/run-grass/putting-green', set: 'tiles-v1' },
  // the rough: tile 1 a level RUN-painted into the game's meadow (the owner's method), tiles 2-4 quilted; offered, the owner's rough-owner stays on the course
  'rough-run': { dir: 'art/theme-consistency/generated/ground/run-grass/rough', set: 'tiles-v1' },
  // the pond bank (GOLF-ART-LIST 131): wet mud, puddles, reeds and stones, tile 1 a level RUN-painted into the game's meadow, tiles 2-4 quilted
  'pond-bank-run': { dir: 'art/theme-consistency/generated/ground/run-grass/pond-bank', set: 'tiles-v1' },
  // grow-in (132): raked soil with tiny seedlings, no rows; the same method
  'grow-in-run': { dir: 'art/theme-consistency/generated/ground/run-grass/grow-in', set: 'tiles-v1' },
  // field parking (133): mown grass with tyre ruts and worn patches; the same method (no surface wears it yet)
  'field-parking-run': { dir: 'art/theme-consistency/generated/ground/run-grass/field-parking', set: 'tiles-v1' },
  // flower bed soil (135): dark bark mulch, a few petals; the same method (MID v2 without its big petals; NEAR and FAR v2 = v1)
  'flower-bed-soil-run': { dir: 'art/theme-consistency/generated/ground/run-grass/flower-bed-soil', set: 'tiles-v2' },
  // the range tee's divot-scarred turf (21): RUN added the wear to the tee-run's own tee frames, tiles 2-4 quilted (for the range tee: T223)
  'range-tee-divots-run': { dir: 'art/theme-consistency/generated/ground/run-grass/range-tee-divots', set: 'tiles-v1' } };
/** T191: a provisional family pinned to the sets it shipped (its newest folder moved on: the new set ships in a family of its own) */
const PIN = { 'putting-green': { mid: 'mid-v1', far: 'far-v1' } };
/** T191: provisional families whose finished sets are measured across any two tiles (shipped as made within HEAL_LIMIT, else one shared strip) */
const MEASURED = new Set(['fringe', 'first-cut-run', 'tee-run', 'desert-run', 'swamp-run', 'dirt-run', 'sand-raked-run', 'putting-green-run', 'rough-run', 'pond-bank-run', 'grow-in-run', 'field-parking-run', 'flower-bed-soil-run', 'range-tee-divots-run']);
/** the owner's own paintings (T162, #350): their folders, each with its source.json; the heal's band (px of each edge) and its limit (a healed
 *  wrap at most this many times the painting's own neighbour difference inside) */
/** T165 (#365): also the art session's fairway and putting-green paintings. Per folder: `bridge` 'match' heals with the bridge where the
 *  painting best matches its seam zone (tile-heal.mjs wrap-bridge-match-v1; absent: the middle, wrap-bridge-v1, as T162 shipped the rough);
 *  `stripes` measures the mowing stripes and crops to whole stripe periods when that lines them up across the wrap at least STRIPE_GAIN
 *  better (STRIPE_MIN_FRAC of each side kept at least); `shared` names levels that fall back to the issue's shared-strip heal of a
 *  provisional family's raw tiles (the putting green's MID painting has a bright corner that repeats as a block pattern when tiled) */
const OWNER = [
  { folder: 'art/owner-supplied/rough-20261026' },
  { folder: 'art/owner-supplied/fairway-20261026', bridge: 'match', stripes: true },
  { folder: 'art/owner-supplied/putting-green-20261026', bridge: 'match', shared: { mid: 'putting-green' } },
  // T191: the putting green with the art session's v2 MID and FAR sets (as made when they meet themselves), NEAR the owner's painting as above
  { folder: 'art/owner-supplied/putting-green-20261026', bridge: 'match', id: 'putting-green-v2', name: 'Putting green (v2)', materialId: 'paint:putting-green-v2', shared: { mid: 'putting-green@mid-v2', far: 'putting-green@far-v2' },
    why: { mid: "the art session's putting-green v2 MID set (T191)", far: "the art session's putting-green v2 FAR set (T191)" } },
];
const HEAL_BAND = 48, HEAL_LIMIT = 1.25, STRIPE_MIN_FRAC = 0.8, STRIPE_GAIN = 0.25;
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
// T156, the owner (2026-10-26): "half the size the fescue is displayed at, when fully zoomed in, bring in the next fescue earlier and the
// final fescue even earlier and make the final fescue smaller and atleast 4 tiles", then "just dont let the player zoom out that far". Each
// set comes in at half its native size: NEAR at the closest zoom (anchor 0.6, so 0.5x at 30%), MID at NEAR_UNTIL 10% (anchor 0.2), FAR at
// FAR_FROM 2.5% (anchor 0.05); ZOOM_MIN 1.25% (iso.ts), where FAR is 0.25x, about four tiles across a 1920 px screen. Never above native.
const ZOOM_MAX = 0.3, ZOOM_MIN = 0.0125;
const ANCHORS = { near: 0.6, mid: 0.2, far: 0.05 }, HYSTERESIS = 1.04, PRELOAD = 1.414, NEAR_UNTIL = 0.1, FAR_FROM = 0.025;
// T150's and T153's anchors were found from the owner's references (the near shop 136 px at 30%: 0.3; the mid shop 0.338 of it: 0.1; the
// furthest zoom: 0.0075); T156 halved each set's size from there (the texts below, as the manifest has carried them since T156).
const ANCHOR_HOW = {
  near: "T156 (the owner: \"half the size the fescue is displayed at, when fully zoomed in\"): 0.6, so NEAR is 0.5x native at the closest zoom (30%). Before: 0.3 from the near reference (the shop 136 px at 30%).",
  mid: "T156 (the owner: \"bring in the next fescue earlier\"): MID comes in at nearUntil 10% at half its native size, anchor 0.2. Before: 0.1 from the mid reference.",
  far: "T156 (the owner: \"the final fescue even earlier and make the final fescue smaller and atleast 4 tiles\", \"just dont let the player zoom out that far\"): FAR comes in at farFrom 2.5% at half its native size, anchor 0.05; the furthest zoom is now 1.25% (FAR 0.25x, about four tiles across 1920 px).",
};

const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
const rel = p => path.join(ART, p);
const fail = m => { console.error('prep-painted-tiles: ' + m); process.exit(1); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hex = m => '#' + m.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const r2 = v => Math.round(v * 100) / 100;
const readJson = p => { try { return JSON.parse(fs.readFileSync(rel(p), 'utf8')); } catch { return null; } };

const readyBuf = fs.existsSync(rel(READY_REL)) ? fs.readFileSync(rel(READY_REL)) : fail(`no ${READY_REL} under ${ART}`);
const ready = JSON.parse(readyBuf);
if (!Array.isArray(ready.ready)) fail('READY-MATERIALS has no ready list');
/** the manifest on disk (its nearUntil, the owner's number, is kept) */
const prevManifest = fs.existsSync(MANIFEST) ? (() => { try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch { return null; } })() : null;
const prevUntil = prevManifest?.anchors?.nearUntil;
const nearUntil = typeof prevUntil === 'number' && Number.isFinite(prevUntil) && prevUntil > 0 && prevUntil < 1 ? prevUntil : NEAR_UNTIL;
const prevFar = prevManifest?.anchors?.farFrom;
const farFrom = typeof prevFar === 'number' && Number.isFinite(prevFar) && prevFar > 0 && prevFar < 1 ? prevFar : FAR_FROM;

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
    const decisionBuf = fs.readFileSync(rel(vd.file));
    if (vd.sha256 && sha256(decisionBuf) !== vd.sha256) fail(`${f.id} ${level}: ${vd.file} hash mismatch`);
    if (JSON.parse(decisionBuf).decision !== 'accepted-for-art-appearance') fail(`${f.id} ${level}: ${vd.file} does not accept the artwork`);
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

const m2 = m => ({ lr: r2(m.lr), tb: r2(m.tb), h: r2(m.h), v: r2(m.v) });
/** the heal's own result is held to HEAL_LIMIT x the inside, on its pixels (the WebP's numbers are recorded as they ship) */
const withinLimit = (m, what) => { if (m.lr > HEAL_LIMIT * m.h || m.tb > HEAL_LIMIT * m.v) fail(`${what}: healed wrap LR ${r2(m.lr)} / TB ${r2(m.tb)} is more than ${HEAL_LIMIT}x the inside (${r2(m.h)} / ${r2(m.v)}): widen HEAL_BAND`); };
/* ---- the provisional families (T153): the newest complete set of four tiles per level, as the art session left them ---- */
const LEVEL_DIR = /^(near|mid|far)-v(\d+)$/;
/** a level's newest complete set in a family's folder: a finished `tile-0x.png` set (newest folder first), else a raw `tile-0x-v<k>.raw.png`
 *  set (newest folder, then newest k, first); null when no folder holds all four */
function provisionalSet(material, level, only = null) {
  // The owner's green MID fallback must follow a ready family's explicit selection, even if newer experiments exist on disk.
  // Its canonical selection and actual appearance decision were hash-checked above.
  const accepted = plan.find(p => p.material === material && p.selection);
  if (accepted) {
    const set = JSON.parse(fs.readFileSync(rel(accepted.selection.file), 'utf8')).sets[level];
    return { folder: set.folder, revision: set.revision ?? path.basename(set.folder), files: set.primaryTiles.map(t => t.file), stage: 'finished tiles' };
  }
  // the RUN.world families (the owner's ground texture method, docs/art/GROUND-TEXTURE-METHOD.md): one approved finished set a level
  const run = RUN_SETS[material];
  if (run) { const folder = `${run.dir}/${level}/${run.set}`, files = TILE_IDS.map(id => `${folder}/${id}.png`); return files.every(f => fs.existsSync(rel(f))) ? { folder, revision: `${level}-${run.set}`, files, stage: 'finished tiles' } : null; }
  const dir = `${EIGHT}/${material}`;
  if (!fs.existsSync(rel(dir))) return null;
  const folders = fs.readdirSync(rel(dir)).map(n => n.match(LEVEL_DIR)).filter(m => m && m[1] === level && fs.statSync(rel(`${dir}/${m[0]}`)).isDirectory() && (!only || m[0] === only)).sort((a, b) => +b[2] - +a[2]).map(m => m[0]).filter(name => {
    const reviewDir = `${dir}/${name}/review`;
    if (!fs.existsSync(rel(reviewDir))) return true;
    const held = fs.readdirSync(rel(reviewDir)).filter(n => /^appearance-(?:decision|review)(?:-v\d+)?\.json$/.test(n)).some(n => {
      const review = readJson(`${reviewDir}/${n}`);
      if (!review) fail(`${reviewDir}/${n}: invalid appearance review`);
      return review?.visualAccepted === false || /^(?:held|blocked|rejected)(?:$|[- :])/i.test(review?.decision ?? '');
    });
    if (held) console.warn(`${material} ${level}: ${name} is held by its appearance review; not a provisional candidate`);
    return !held;
  });
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
    const s = provisionalSet(material, level, PIN[material]?.[level] ?? null);
    if (!s) { console.warn(`prep-painted-tiles: ${material} ${level}: no complete set of four tiles; ${material} is left out`); break; }
    // T191: a finished set's four tiles are the ones its export report names (never a repair input or a guide)
    const rep = readJson(`${s.folder}/export-report.json`);
    if (rep?.variants && s.stage === 'finished tiles') { const named = rep.variants.map(v => String(v.file ?? '').split('/').pop()); if (!s.files.every(f => named.includes(f.split('/').pop()))) fail(`${s.folder}: its tiles are not the ones export-report.json names`); }
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
    // T191: a measured family: its seams across any two tiles; as made within HEAL_LIMIT x the inside, else one shared strip (as T165/T170)
    if (MEASURED.has(material)) {
      const dec = await Promise.all(tiles.map(t => (t.crop ? sharp(t.buf).extract({ left: 0, top: 0, width: native[0], height: native[1] }) : sharp(t.buf)).raw().toBuffer({ resolveWithObject: true })));
      const [w, ht, ch] = [native[0], native[1], dec[0].info.channels], px = dec.map(d => d.data);
      const before = setMismatch(px, w, ht, ch), asMade = s.stage === 'finished tiles' && before.lr <= HEAL_LIMIT * before.h && before.tb <= HEAL_LIMIT * before.v;
      const res = asMade ? null : healShared(px, w, ht, ch, HEAL_BAND), pics = res ? res.tiles : px, done = res ? setMismatch(res.tiles, w, ht, ch) : before;
      withinLimit(done, `${s.folder} (${res ? 'shared strip' : 'finished set'})`);
      tiles.forEach((t, i) => { t.raw = { data: pics[i], width: w, height: ht, channels: ch }; });
      const fallback = `the art session's ${s.stage === 'finished tiles' ? 'finished' : 'raw'} ${s.revision} tiles (T191)`;
      levels[level].heal = res ? { method: HEAL_SHARED, band: HEAL_BAND, centre: res.centre, fallback, before: m2(before), healed: m2(done) } : { method: HEAL_NONE, band: 0, fallback, before: m2(before), healed: m2(done) };
      levels[level].status = null;
    }
  }
  if (Object.keys(levels).length !== LEVELS.length) continue;
  const key = sha256(Buffer.from(LEVELS.flatMap(l => levels[l].tiles.map(t => t.sha256)).join(':')));
  plan.push({ material, id: gameId(material), materialId: `painted:${material}`, key, selection: null, provisional: true, light, levels });
}

/* ---- the owner's own paintings (T162, #350): one painting a level, hash-checked, its edges healed here once to tile with itself ---- */
/** where the owner's art is read: this checkout (it is committed here), or --art (the tests' fixtures) */
// (--owner-art: the owner's committed art from another checkout than --art: run from a worktree on main with --art at the art session's
// checkout, the owner's paintings are this worktree's own; without it a checkout on an older branch drops the owner's families)
const OWNER_ART = path.resolve(arg('--owner-art') ?? arg('--art') ?? ROOT);
const orel = p => path.join(OWNER_ART, p);
/** the interior (inside the outer HEAL_BAND px of each edge) of a healed picture is its source's exactly */
const sameInterior = (a, b, w, ht, ch, what) => { for (let y = HEAL_BAND; y < ht - HEAL_BAND; y++) for (let i = (y * w + HEAL_BAND) * ch, e = (y * w + w - HEAL_BAND) * ch; i < e; i++) if (a[i] !== b[i]) fail(`${what}: the heal changed the interior at (${Math.floor(i / ch) % w}, ${y})`); };
for (const o of OWNER) {
  const folder = o.folder, srcRel = `${folder}/source.json`;
  if (!fs.existsSync(orel(srcRel))) { console.warn(`prep-painted-tiles: no ${srcRel} under ${OWNER_ART}; its family is left out`); continue; }
  const src = JSON.parse(fs.readFileSync(orel(srcRel), 'utf8')), fam = src.family ?? {};
  if (!fam.id || !fam.name || !src.levels) fail(`${srcRel}: no family id, name or levels`);
  if (src.displayContract && (src.displayContract.allowMirror || src.displayContract.allowRotate || src.displayContract.allowFlip)) fail(`${srcRel}: allows mirror/rotate/flip, which the runtime never does`);
  const levels = {}, keyParts = [];
  for (const level of LEVELS) {
    const sharedFrom = o.shared?.[level];
    if (sharedFrom) {
      // T165: this level falls back to the raw provisional set of `sharedFrom`, healed with one shared strip (any tile meets any tile); T191:
      // 'material@folder' names the folder (putting-green@mid-v2), else the family's pinned or newest set
      const [sm, sf] = sharedFrom.split('@'), s = provisionalSet(sm, level, sf ?? PIN[sm]?.[level] ?? null);
      if (!s) fail(`${folder} ${level}: no provisional ${sharedFrom} ${level} set for the shared-strip heal`);
      const raws = [];
      for (const [i, file] of s.files.entries()) { const buf = fs.readFileSync(rel(file)), { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true }); raws.push({ id: TILE_IDS[i], sha256: sha256(buf), source: file, data, w: info.width, h: info.height, ch: info.channels }); }
      const w = Math.min(...raws.map(r => r.w)), ht = Math.min(...raws.map(r => r.h)), ch = raws[0].ch;
      if (raws.some(r => r.ch !== ch || r.w - w > 8 || r.h - ht > 8)) fail(`${s.folder}: the four tiles are not one set`);
      // the set's common size, top-left anchored (as the provisional families ship it); nothing resampled
      const px = raws.map(r => (r.w === w && r.h === ht ? r.data : cropPixels(r.data, r.w, r.h, ch, { x0: 0, y0: 0, w, h: ht })));
      // T170 (#395): a finished set (the art session's tiles, made to meet one another: a common collar) that already tiles cleanly across
      // any two of its tiles ships as made; the shared strip would only add seams of its own (the putting green's MID: across any two tiles
      // LR 1.88 / TB 2.45 as made, 3.21 / 3.26 healed, inside 2.5 / 3.2). A raw set, or a finished one that does not, is healed as T165 did
      const before = setMismatch(px, w, ht, ch), asMade = s.stage === 'finished tiles' && before.lr <= HEAL_LIMIT * before.h && before.tb <= HEAL_LIMIT * before.v;
      const res = asMade ? null : healShared(px, w, ht, ch, HEAL_BAND);
      res?.tiles.forEach((t, i) => sameInterior(t, px[i], w, ht, ch, raws[i].source));
      const pics = res ? res.tiles : px, done = res ? setMismatch(res.tiles, w, ht, ch) : before;
      withinLimit(done, `${folder} ${level} (${res ? 'shared strip' : 'finished set'})`);
      const tiles = raws.map((r, i) => ({ id: r.id, sha256: r.sha256, source: r.source, raw: { data: pics[i], width: w, height: ht, channels: ch }, ...(r.w !== w || r.h !== ht ? { crop: { from: [r.w, r.h], removedRight: r.w - w, removedBottom: r.h - ht } } : {}) }));
      const fallback = o.why?.[level] ? `${o.why[level]}: ${res ? `raw ${s.revision} tiles, healed with one shared strip` : `finished ${s.revision} tiles, as the art session made them`}` : `the painting ${src.levels[level]?.file ?? level} is not used (tiled, its bright corner repeats as a block pattern); ${sharedFrom}'s ${res ? `raw ${s.revision} tiles` : `finished ${s.revision} tiles, as the art session made them,`} instead`;
      levels[level] = { folder: s.folder, native: [w, ht], decision: { file: null, sha256: null }, tiles, revision: `${s.revision}-${res ? 'shared' : 'finished'}`, status: null,
        heal: res ? { method: HEAL_SHARED, band: HEAL_BAND, centre: res.centre, fallback, before: m2(before), healed: m2(done) } : { method: HEAL_NONE, band: 0, fallback, before: m2(before), healed: m2(done) } };
      keyParts.push(res ? `${level}:${HEAL_SHARED}/${HEAL_BAND}@${res.centre.x},${res.centre.y}:${tiles.map(t => t.sha256).join(',')}` : `${level}:${HEAL_NONE}:${tiles.map(t => t.sha256).join(',')}`);
      continue;
    }
    const sl = src.levels[level];
    if (!sl?.file || !/^[0-9a-f]{64}$/.test(sl.sha256 ?? '')) fail(`${srcRel} ${level}: no file or sha256`);
    const file = `${folder}/${sl.file}`, buf = fs.existsSync(orel(file)) ? fs.readFileSync(orel(file)) : fail(`missing ${file}`);
    const h = sha256(buf); if (h !== sl.sha256) fail(`${file}: sha256 ${h} != ${srcRel} ${sl.sha256}`);
    const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true }), ch = info.channels;
    if (Array.isArray(sl.size) && (info.width !== sl.size[0] || info.height !== sl.size[1])) fail(`${file}: ${info.width}x${info.height}, ${srcRel} says ${sl.size.join('x')}`);
    // T165: the mowing stripes: their periods, and the whole-period crop that lines them up best across the wrap, used when it gains enough
    let px = data, w = info.width, ht = info.height, crop = null, stripes = null;
    if (o.stripes) {
      const c = stripeCrop(data, w, ht, ch, { minFrac: STRIPE_MIN_FRAC });
      if (!c) stripes = { found: false };
      else {
        const b = (c.phase.before.x + c.phase.before.y) / 2, a = (c.phase.after.x + c.phase.after.y) / 2, use = a <= (1 - STRIPE_GAIN) * b;
        stripes = { periodX: r2(c.periodX), periodY: r2(c.periodY), phase: { x: r2(c.phase.before.x), y: r2(c.phase.before.y) }, bestCrop: { x0: c.x0, y0: c.y0, w: c.w, h: c.h, periods: [c.kx, c.ky], phase: { x: r2(c.phase.after.x), y: r2(c.phase.after.y) } }, applied: use };
        if (use) { crop = { x0: c.x0, y0: c.y0, w: c.w, h: c.h }; px = cropPixels(data, w, ht, ch, crop); w = c.w; ht = c.h; }
      }
    }
    const healed = healWrapWith(px, w, ht, ch, HEAL_BAND, { bridge: o.bridge ?? 'middle' });
    sameInterior(healed.pixels, px, w, ht, ch, file);
    const before = wrapMismatch(data, info.width, info.height, ch), done = wrapMismatch(healed.pixels, w, ht, ch);
    withinLimit(done, file);
    const method = o.bridge === 'match' ? HEAL_MATCH : HEAL_METHOD;
    const tile = { id: TILE_IDS[0], sha256: h, source: file, raw: { data: healed.pixels, width: w, height: ht, channels: ch }, ...(crop ? { crop: { from: [info.width, info.height], ...crop } } : {}) };
    levels[level] = { folder, native: [w, ht], decision: { file: null, sha256: null }, tiles: [tile], revision: `${level}-${path.basename(folder)}`, status: null,
      heal: { method, band: HEAL_BAND, ...(o.bridge === 'match' ? { centre: healed.centre } : {}), ...(stripes ? { stripes } : {}), before: m2(before), healed: m2(done) } };
    keyParts.push(`${level}:${method}/${HEAL_BAND}@${healed.centre.x},${healed.centre.y}${crop ? `:crop ${crop.x0},${crop.y0},${crop.w}x${crop.h}` : ''}:${h}`);
  }
  // the revision: the paintings' hashes and the heal (and, T165, its bridges, crops and fallback tiles): another heal re-bakes every chunk
  // that laid it. The rough (T162: the middle bridge, no crop) keeps its key.
  const plain = !o.bridge && !o.stripes && !o.shared;
  const key = plain ? sha256(Buffer.from(LEVELS.map(l => levels[l].tiles[0].sha256).join(':') + `|${HEAL_METHOD}/${HEAL_BAND}`)) : sha256(Buffer.from(keyParts.join('|')));
  plan.push({ material: o.id ?? fam.id, id: gameId(o.id ?? fam.id), materialId: o.materialId ?? src.id ?? `owner:${path.basename(folder)}`, name: o.name ?? fam.name, kind: fam.kind ?? 'grass', key, selection: null, provisional: fam.provisional !== false, owner: srcRel, light: src.light ?? null, levels });
}

// ---- write the WebPs and the manifest
const manifest = {
  v: 1,
  note: `Generated by scripts/assets/prep-painted-tiles.mjs from ${READY_REL} (hash-checked) and, for families marked provisional, the newest complete raw sets in their folders (hash-recorded; T153), and for the owner's own paintings their files in art/owner-supplied (hash-checked against their source.json, edges healed by scripts/assets/tile-heal.mjs; T162). Do not edit by hand, except anchors.nearUntil and anchors.farFrom.`,
  source: { file: READY_REL, sha256: sha256(readyBuf), date: ready.date ?? null },
  revision: sha256(Buffer.from(plan.map(p => p.key).join(':'))).slice(0, 12),
  display: { minVisibleTiles: ready.displayContract?.minVisibleTiles ?? 2, maxVisibleTiles: ready.displayContract?.maxVisibleTiles ?? 4, allowMirror: false, allowRotate: false, allowFlip: false },
  anchors: { ...ANCHORS, nearUntil, hysteresis: HYSTERESIS, preload: PRELOAD, zoom: [ZOOM_MIN, ZOOM_MAX], how: ANCHOR_HOW, farFrom },
  webp: { quality: QUALITY },
  families: [],
};
if (!CHECK) fs.mkdirSync(OUT_DIR, { recursive: true });
let kb = 0;
const written = new Set();
for (const p of plan) {
  const fam = { id: p.id, materialId: p.materialId, name: p.name ?? NAME[p.material] ?? p.material.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()), kind: p.kind ?? KIND[p.material] ?? 'grass', revision: p.key.slice(0, 12), selection: p.selection, ...(p.provisional ? { provisional: true } : {}), ...(p.owner ? { owner: p.owner } : {}), light: p.light, mean: '#808080', levels: {} };
  const means = [];
  for (const level of LEVELS) {
    const L = p.levels[level], out = [], decoded = [];
    for (const t of L.tiles) {
      const file = `tiles/${p.id}/${level}/${t.id}.webp`, abs = path.join(OUT, 'src/assets/ground/painted', file);
      // a provisional tile bigger than its set keeps its top-left native pixels (crop); an owner's painting is its healed pixels (raw, T162);
      // every other tile is the PNG as it is
      const pic = () => (t.raw ? sharp(Buffer.from(t.raw.data.buffer, t.raw.data.byteOffset, t.raw.data.byteLength), { raw: { width: t.raw.width, height: t.raw.height, channels: t.raw.channels } })
        : t.crop ? sharp(t.buf).extract({ left: 0, top: 0, width: L.native[0], height: L.native[1] }) : sharp(t.buf));
      const stats = await (t.raw ? pic() : sharp(t.crop ? await pic().png().toBuffer() : t.buf)).stats(), opaque = stats.isOpaque;
      const webp = () => (opaque ? pic().removeAlpha() : pic()).webp({ quality: QUALITY, effort: 6, smartSubsample: true });
      if (t.raw) {
        // a healed picture: its WebP decoded again, for the level's numbers as they ship (below)
        const buf = await webp().toBuffer(), dec = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
        if (dec.info.width !== L.native[0] || dec.info.height !== L.native[1]) fail(`${file}: encoded ${dec.info.width}x${dec.info.height}`);
        decoded.push(dec);
        if (!CHECK) { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, buf); }
      } else if (!CHECK) {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        await webp().toFile(abs);
        // the WebP keeps the native size (never resized)
        const m = await sharp(abs).metadata(); if (m.width !== L.native[0] || m.height !== L.native[1]) fail(`${file}: wrote ${m.width}x${m.height}`);
      }
      written.add(path.resolve(abs));
      const mean = stats.channels.slice(0, 3).map(c => c.mean); if (level === 'near') means.push(mean);
      const bytes = fs.existsSync(abs) ? fs.statSync(abs).size : 0; kb += bytes / 1024;
      out.push({ id: t.id, file, sha256: t.sha256, mean: hex(mean), ...(t.source ? { source: t.source } : {}), ...(t.crop ? { crop: t.crop } : {}) });
      console.log(file.padEnd(52), `${L.native[0]}x${L.native[1]}`, hex(mean), `${Math.round(bytes / 1024)} KB`, opaque ? '' : '(alpha kept)', p.provisional ? '(provisional)' : '');
    }
    // a healed level (T162, T165): its numbers before (the source), healed (its pixels) and after (the WebP that ships), each against its own
    // inside difference (the lossy WebP's error, about 3 levels a pixel, is independent on the two sides of a tile edge, so it adds a level or
    // two across any wrap, the other tile sets' edges alike); a shared-strip set's across every pair of its tiles. Its status says what it is.
    let heal = null, status = L.status;
    if (L.heal) {
      const [w, ht, ch] = [decoded[0].info.width, decoded[0].info.height, decoded[0].info.channels];
      const a = L.heal.method === HEAL_SHARED || L.heal.method === HEAL_NONE ? setMismatch(decoded.map(d => d.data), w, ht, ch) : wrapMismatch(decoded[0].data, w, ht, ch);
      heal = { ...L.heal, after: m2(a) };
      const nums = `wrap LR ${heal.before.lr} -> ${heal.after.lr} (inside ${heal.after.h}), TB ${heal.before.tb} -> ${heal.after.tb} (inside ${heal.after.v})`;
      const st = heal.stripes, stripeNote = !st ? '' : st.found === false ? '; no stripes found'
        : `; stripes ${st.periodX} x ${st.periodY} px, their phase step across the wrap ${st.phase.x} / ${st.phase.y} px, ${st.applied ? `cropped to ${st.bestCrop.periods.join(' x ')} periods (${st.bestCrop.phase.x} / ${st.bestCrop.phase.y} px)` : `uncropped (the best whole-period crop, ${st.bestCrop.periods.join(' x ')} periods, lines them up only to ${st.bestCrop.phase.x} / ${st.bestCrop.phase.y} px)`}`;
      status = heal.method === HEAL_NONE ? `${heal.fallback}: four tiles that meet one another as made (${heal.method}, no heal); across any two tiles ${nums}`
        : heal.method === HEAL_SHARED ? `${heal.fallback}: four tiles, every edge cross-faded to one shared strip (${heal.method}, ${heal.band} px, bridge at x ${heal.centre.x}, y ${heal.centre.y}); across any two tiles ${nums}`
        : heal.method === HEAL_METHOD ? `the owner's painting (${p.materialId}), one tile; edges healed to tile with itself (${heal.method}, ${heal.band} px): ${nums}`
        : `the painting (${p.materialId}), one tile; edges healed to tile with itself (${heal.method}, ${heal.band} px, bridge at x ${heal.centre.x}, y ${heal.centre.y}): ${nums}${stripeNote}`;
      console.log(`${p.id} ${level}: ${status}`);
    }
    fam.levels[level] = { revision: L.revision, folder: L.folder, native: L.native, decision: L.decision, tiles: out, ...(status ? { status } : {}), ...(heal ? { heal } : {}) };
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
console.log(`${manifest.families.length} families (${prov.length ? `provisional: ${prov.join(', ')}` : 'none provisional'}), ${manifest.families.reduce((s, f) => s + LEVELS.reduce((n, l) => n + f.levels[l].tiles.length, 0), 0)} tiles, ${Math.round(kb)} KB; anchors near ${ANCHORS.near} (until ${nearUntil}), mid ${ANCHORS.mid}, far ${ANCHORS.far}; revision ${manifest.revision}`);
