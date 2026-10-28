// T145 (#300) and T150 (#315): the hand-painted terrain tile sets. The owner's rules (2026-10-26) as checks: only the art handoff's primary
// tiles ship, hash-bound to its canonical selections; three authored sets chosen by the camera's zoom band with hysteresis; each set one world
// size, native at its anchor zoom (NEAR the closest zoom, MID the mid reference's camera, FAR the furthest zoom), never magnified at any zoom or
// DPR, a real zoom inside a band; stable world-anchored whole-tile placement that panning, resizing and a reload never change; tiles edge to
// edge without gaps at chunk borders; no mirror, turn or blend; separate gameplay layers; a stale chunk never keeps an old set.
// T153 (#327): the furthest zoom one step closer (FAR follows it), NEAR on down to nearUntil (5%), sand ripples on the waste areas, and the
// course's fairway, putting green and long grass in provisionally (the switch to their handoff: tests/painted-tiles-prep.test.ts).
// T162 (#350): the owner's own rough paintings, one a level, their edges healed in the asset step to tile with themselves (rough-owner): the
// rough and the decrepit lots' lawns wear them; long grass stays in the manifest, unmapped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  ANCHORS, TILES, TILED_FAMILIES, TILES_REVISION, TILE_BANDS, anchorAt, bandAt, bandOf, bandRange, bandsAhead, cellOf, cellsIn, coverageOf, drawnScale, farFrom, nearUntil,
  nextBand, snappedCell, specBand, specDpr, switchIn, switchOut, tiledFamily, tileIndex, tileKey, tilePermutation, tileScreenPx, tileSize, tileSpec,
  type TiledFamily,
} from '../src/game/painted-tiles';
import { FAMILIES, clampLook, familyById, resolveFamily } from '../src/game/painted-families';
import { clampSurfaces, knownFamily, lookOfTex } from '../src/game/painted-surfaces';
import { chunkLayers, pictureCurrent, type ChunkPictures } from '../src/game/ground-layers';
import { grassZoomLevels } from '../src/game/painted-grass-lod';
import { CHUNK_H, CHUNK_W, HW, LEVELS, MAP, MID_H, MID_LEVELS, MID_W, PLAN_H, PLAN_LEVELS, PLAN_W, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, clampZoom, mulberry, worldX, worldY } from '../src/game/iso';
import { DRAW_ORDER, layerCode } from '../src/game/ext/course-walls';
import { SURF } from '../src/game/ext/course-grid';
import { PRESETS } from '../src/game/paint-presets';
import surfacesFile from '../src/game/painted-surfaces.json';
import { HEAL_AS_MADE, HEAL_MATCH, HEAL_METHOD, HEAL_SHARED, bridgeWeight, cropPixels, crossMismatch, healShared, healWrap, healWrapWith, setMismatch, stripeCrop, stripePeriod, stripePhase, wrapMismatch } from '../scripts/assets/tile-heal.mjs';

const sha256 = (b: Buffer | string) => crypto.createHash('sha256').update(b).digest('hex');
const READY_REL = 'art/theme-consistency/generated/ground/eight-tiles/READY-MATERIALS.json';
/** the art checkout (this one, else the main checkout above a .claude/worktrees/<name> worktree), or null when the art is not on this PC */
const ART = [process.cwd(), path.resolve(process.cwd(), '../../..')].find(r => fs.existsSync(path.join(r, READY_REL))) ?? null;
const PAINTED = path.join(process.cwd(), 'src/assets/ground/painted');
/** a WebP's pixel size from its header (VP8, VP8L or VP8X) */
function webpSize(buf: Buffer): [number, number] {
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF'); assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return [(b & 0x3fff) + 1, ((b >>> 14) & 0x3fff) + 1]; }
  if (kind === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  throw new Error('not a webp: ' + kind);
}

/** the accepted families (READY-MATERIALS' canonical selections, in its order), then the provisional ones (T153: no handoff yet) */
// T170 (#395): long grass is through the art session's handoff (its canonical selection in READY-MATERIALS): accepted, no longer provisional
const ACCEPTED = ['painted:golden-fescue', 'painted:lake', 'painted:sand-ripples', 'painted:long-grass'];
// T191 (#497): the fringe, new, provisional (the art session's finished v1 sets, measured and shipped as made)
// T225 (#631): the RUN families (the art session's RUN sets, shipped as made, no handoff yet: #590, #612, #620, #625, #630) are provisional too,
// listed in the manifest's order (painted-tiles.json); the owner picks which one each surface wears (Studio › Painted)
const PROVISIONAL = ['painted:fairway', 'painted:putting-green', 'painted:fringe',
  'painted:first-cut-run', 'painted:tee-run', 'painted:desert-run', 'painted:swamp-run', 'painted:dirt-run', 'painted:sand-raked-run',
  'painted:putting-green-run', 'painted:rough-run', 'painted:pond-bank-run', 'painted:grow-in-run', 'painted:field-parking-run',
  'painted:flower-bed-soil-run', 'painted:range-tee-divots-run', 'painted:lawn-concept-run', 'painted:meadow-concept-run', 'painted:rough-concept-run', 'painted:fairway-concept-run', 'painted:first-cut-concept-run', 'painted:green-concept-run', 'painted:pond-concept-run'];
/** the owner's own paintings (T162) and the art session's fairway and putting-green paintings (T165): provisional too, one tile a level, from
 *  art/owner-supplied (committed in this repo); a level may instead be a provisional family's raw tiles healed with one shared strip (T165) */
// T191: the putting green with the v2 MID and FAR sets (NEAR the owner's painting), an owner family like putting-green-paint
const OWNER = ['owner:rough-20261026', 'paint:fairway-20261026', 'paint:putting-green-20261026', 'paint:putting-green-v2'];
const OWNER_DIR = 'art/owner-supplied/rough-20261026';
const SHARED = 'shared-strip-match-v1';
const FOUR = ['tile-01', 'tile-02', 'tile-03', 'tile-04'] as const;
/** a family's part of the revision: its canonical selection's sha256, or a provisional family's tiles' hashes; an owner family's with its heal
 *  (T162: the paintings' hashes and the heal; T165: per level the heal, its bridge, any crop and the tiles) */
const familyKey = (f: TiledFamily) => {
  if (f.selection) return f.selection.sha256;
  if (!f.owner) return sha256(TILE_BANDS.flatMap(b => f.levels[b].tiles.map(t => t.sha256)).join(':'));
  const h0 = f.levels.near.heal!;
  if (h0.method === 'wrap-bridge-v1') return sha256(TILE_BANDS.map(b => f.levels[b].tiles[0]!.sha256).join(':') + `|${h0.method}/${h0.band}`);
  return sha256(TILE_BANDS.map(b => {
    const lv = f.levels[b], h = lv.heal!;
    if (h.method === HEAL_AS_MADE) return `${b}:${h.method}:${lv.tiles.map(t => t.sha256).join(',')}`; // T170: a finished set, as made
    const c = `${b}:${h.method}/${h.band}@${h.centre!.x},${h.centre!.y}`;
    if (h.method === SHARED) return `${c}:${lv.tiles.map(t => t.sha256).join(',')}`;
    const t = lv.tiles[0]!, cr = t.crop?.x0 !== undefined ? `:crop ${t.crop.x0},${t.crop.y0},${t.crop.w}x${t.crop.h}` : '';
    return `${c}${cr}:${t.sha256}`;
  }).join('|'));
};

test('the manifest ships only the ready families\' primary tiles and the provisional families\' chosen four: four a level, three authored sets each, files at native size', () => {
  assert.deepEqual(TILED_FAMILIES.map(f => f.materialId), [...ACCEPTED, ...PROVISIONAL, ...OWNER]);
  const ids = { 'golden-fescue': { near: ['tile-01', 'tile-03', 'tile-06', 'tile-08'], mid: FOUR, far: FOUR }, lake: { near: FOUR, mid: FOUR, far: FOUR }, 'sand-ripples-tiles': { near: FOUR, mid: FOUR, far: FOUR }, 'long-grass': { near: FOUR, mid: FOUR, far: FOUR } } as const;
  const sets = { 'golden-fescue': { near: 'near-v3', mid: 'mid-v2', far: 'far-v4' }, lake: { near: 'near-v1', mid: 'mid-v1', far: 'far-v1' }, 'sand-ripples-tiles': { near: 'near-v1', mid: 'mid-v1', far: 'far-v1' }, 'long-grass': { near: 'near-v3', mid: 'mid-v2', far: 'far-v2' } } as const;
  for (const f of TILED_FAMILIES) {
    const files = new Set<string>(), material = f.materialId.replace(/^painted:/, '');
    assert.equal(!!f.provisional, PROVISIONAL.includes(f.materialId) || OWNER.includes(f.materialId), `${f.id}: provisional exactly while it has no handoff`);
    assert.equal(!!f.owner, OWNER.includes(f.materialId), `${f.id}: an owner family exactly when made from the owner's paintings`);
    if (f.provisional) assert.equal(f.selection, null, 'no canonical selection yet'); else assert.match(f.selection!.sha256, /^[0-9a-f]{64}$/);
    for (const b of TILE_BANDS) {
      const lv = f.levels[b];
      if (f.owner && (lv.heal?.method === SHARED || lv.heal?.method === HEAL_AS_MADE)) {
        // T165: a level that falls back to a provisional family's raw tiles, healed with one shared strip; T170: or to its finished tiles, as
        // made (checked in its own test below)
        assert.deepEqual(lv.tiles.map(t => t.id), FOUR); assert.equal(lv.decision.file, null); assert.ok(/-(shared|finished)$/.test(lv.revision), lv.revision);
        assert.ok(lv.folder.startsWith('art/theme-consistency/generated/ground/eight-tiles/'), lv.folder);
      } else if (f.owner) {
        // T162, T165: the painting of the level, one tile, from its own folder (hash-recorded; the heal is checked in its own test below)
        const dir = path.posix.dirname(f.owner);
        assert.deepEqual(lv.tiles.map(t => t.id), ['tile-01']); assert.equal(lv.decision.file, null); assert.equal(lv.folder, dir);
        assert.equal(lv.tiles[0]!.source, `${dir}/${b}.png`); assert.equal(lv.revision, `${b}-${path.posix.basename(dir)}`); assert.ok(lv.heal, `${f.id} ${b}: its heal recorded`);
      } else if (f.provisional) {
        // the newest complete set of four in the level's own folder, as the art session left it (raw generator outputs), hash-recorded.
        // T225 (#631): the RUN sets live in the art's run-grass folder (run-grass/<family>/<level>/<revision>), the others in eight-tiles
        assert.deepEqual(lv.tiles.map(t => t.id), FOUR); assert.equal(lv.decision.file, null, 'no visual decision yet');
        assert.match(lv.revision, new RegExp(`^${b}-(tiles-)?v\\d+[a-z]?$`));
        const set = f.id.endsWith('-run') ? `run-grass/${f.id.replace(/-run$/, '')}/${b}/${lv.revision.slice(b.length + 1)}` : `eight-tiles/${material}/${lv.revision}`;
        assert.equal(lv.folder, `art/theme-consistency/generated/ground/${set}`);
        assert.ok((lv.status ?? '').length > 10, `${f.id} ${b}: the art session's status for the set is recorded`);
        for (const t of lv.tiles) assert.match(t.source!, new RegExp(`^${lv.folder}/${t.id}(-v\\d+\\.raw)?\\.png$`), `${f.id} ${b} ${t.id}: its source PNG, from the set's own folder`);
        // a landscape set, at least 1024 px wide (the files' own size: 1742x902 or 1376x768 so far; each shipped file is checked at native size below)
        assert.ok(lv.native[0] >= 1024 && lv.native[0] > lv.native[1] * 1.7 && lv.native[0] < lv.native[1] * 2, `${f.id} ${b}: ${lv.native.join('x')}, a landscape set`);
      } else {
        assert.deepEqual(lv.tiles.map(t => t.id), ids[f.id as keyof typeof ids][b], `${f.id} ${b}: the primary tile ids, in order (never the extras)`);
        assert.equal(lv.revision, sets[f.id as keyof typeof sets][b]);
        for (const t of lv.tiles) assert.equal(t.source, undefined);
      }
      assert.equal(lv.native[0] > lv.native[1], true);
      for (const t of lv.tiles) {
        assert.equal(t.file, `tiles/${f.id}/${b}/${t.id}.webp`); assert.match(t.sha256, /^[0-9a-f]{64}$/); files.add(t.file);
        assert.deepEqual(webpSize(fs.readFileSync(path.join(PAINTED, t.file))), lv.native, `${t.file} keeps its native ${lv.native.join('x')}`);
      }
    }
    assert.equal(files.size, TILE_BANDS.reduce((n, b) => n + f.levels[b].tiles.length, 0), `${f.id}: distinct pictures: NEAR, MID and FAR are separate paintings, never one another's mips`);
    if (!f.owner) assert.equal(files.size, 12);
  }
  assert.deepEqual(tiledFamily('lake')!.levels.mid.native, [1744, 900], 'sizes read from the selection, never assumed');
  // the legacy painted family `sand-ripples` keeps its id (still selectable): the tile set is `sand-ripples-tiles`
  assert.ok(tiledFamily('sand-ripples-tiles') && !tiledFamily('sand-ripples')); assert.ok(familyById('sand-ripples') && !familyById('sand-ripples')!.tiled);
  // nothing else sits in the tiles folder: no proofs, extras, raw outputs or held versions
  const shipped = fs.readdirSync(path.join(PAINTED, 'tiles'), { recursive: true }).map(String).filter(p => p.endsWith('.webp') || p.endsWith('.png')).map(p => 'tiles/' + p.replace(/\\/g, '/')).sort();
  assert.deepEqual(shipped, TILED_FAMILIES.flatMap(f => TILE_BANDS.flatMap(b => f.levels[b].tiles.map(t => t.file))).sort());
  // the revision is the selections' hashes (and the provisional tiles' hashes)
  assert.equal(TILES_REVISION, sha256(TILED_FAMILIES.map(familyKey).join(':')).slice(0, 12));
  for (const f of TILED_FAMILIES) assert.equal(f.revision, familyKey(f).slice(0, 12));
});

test('the manifest is hash-bound to READY-MATERIALS and the canonical selections (when the art is on this PC)', t => {
  if (!ART) { t.skip('no art checkout here'); return; }
  // T170 (#395): the art folder is the art session's, and moves on by itself: a READY-MATERIALS, a canonical selection or a shipped source
  // other than the one the manifest recorded is not a failure of the code but the next art handoff, so the test skips with that note
  const art = (rel: string) => fs.readFileSync(path.join(ART, rel)), moved: string[] = [];
  const readyBuf = art(READY_REL), ready = JSON.parse(readyBuf.toString());
  if (sha256(readyBuf) !== TILES.source.sha256) moved.push(`READY-MATERIALS is ${sha256(readyBuf).slice(0, 8)}, the manifest was made from ${TILES.source.sha256.slice(0, 8)}`);
  for (const f of TILED_FAMILIES) {
    if (f.selection && (!fs.existsSync(path.join(ART, f.selection.file)) || sha256(art(f.selection.file)) !== f.selection.sha256)) moved.push(`${f.id}: its canonical selection changed`);
    if (f.owner) continue; // the owner's paintings are committed in this repo (art/owner-supplied), checked by the prep test
    for (const b of TILE_BANDS) for (const tl of f.levels[b].tiles) if (tl.source && fs.existsSync(path.join(ART, tl.source)) && sha256(art(tl.source)) !== tl.sha256) moved.push(`${tl.source} changed`);
  }
  if (moved.length) { t.skip(`art moved: re-run scripts/assets/prep-painted-tiles.mjs (an art handoff): ${moved.join('; ')}`); return; }
  assert.equal(TILES.source.sha256, sha256(readyBuf), 'the manifest was made from this READY-MATERIALS');
  assert.deepEqual(ready.ready.map((r: { id: string }) => r.id), TILED_FAMILIES.filter(f => !f.provisional).map(f => f.materialId), 'every ready family and only those (a provisional family READY lists now: re-run the prep script)');
  for (const r of ready.ready) {
    const f = TILED_FAMILIES.find(x => x.materialId === r.id)!, selBuf: Buffer = fs.readFileSync(path.join(ART, r.canonicalSelection.file)), sel = JSON.parse(selBuf.toString());
    assert.equal(sha256(selBuf), r.canonicalSelection.sha256); assert.equal(f.selection!.sha256, r.canonicalSelection.sha256);
    for (const b of TILE_BANDS) {
      const set = sel.sets[b], lv = f.levels[b];
      assert.deepEqual(lv.tiles.map(t => t.id), set.primaryTileIds); assert.deepEqual(lv.native, set.nativePixels); assert.equal(lv.folder, r.levels[b].folder);
      for (const [i, pt] of set.primaryTiles.entries()) {
        assert.equal(lv.tiles[i]!.sha256, pt.sha256);
        assert.equal(sha256(fs.readFileSync(path.join(ART, pt.file))), pt.sha256, `${pt.file}: the accepted PNG is unchanged`);
      }
      for (const x of set.optionalExtraTiles ?? []) assert.ok(!lv.tiles.some(t => t.sha256 === x.sha256), `${f.id} ${b}: optional extra ${x.id} never ships`);
    }
  }
  // the provisional tiles are the PNGs they name (a source the art session has since removed is only reported: re-run the prep script)
  for (const f of TILED_FAMILIES.filter(x => x.provisional && !x.owner)) for (const b of TILE_BANDS) for (const tl of f.levels[b].tiles) {
    const p = path.join(ART, tl.source!);
    if (!fs.existsSync(p)) { t.diagnostic(`${tl.source}: no longer in the art folder (re-run scripts/assets/prep-painted-tiles.mjs)`); continue; }
    assert.equal(sha256(fs.readFileSync(p)), tl.sha256, `${tl.source}: the hash the manifest recorded`);
  }
});

test('the zoom range (T156): the player cannot zoom out past 1.25%; a camera or a save below it is clamped to it', () => {
  assert.equal(ZOOM_MIN, 0.0125, 'the owner: "just dont let the player zoom out that far"'); assert.equal(ZOOM_STEP, 1.25);
  // the clamp the wheel, the keys, the buttons, a jump and a save load use
  for (const [z, want] of [[0.006, ZOOM_MIN], [0.0075, ZOOM_MIN], [0.001, ZOOM_MIN], [ZOOM_MIN, ZOOM_MIN], [0.05, 0.05], [0.31, ZOOM_MAX], [ZOOM_MAX, ZOOM_MAX], [NaN, ZOOM_MAX], [Infinity, ZOOM_MAX], [-1, ZOOM_MIN]] as const) assert.equal(clampZoom(z), want, `clampZoom(${z})`);
  // a save resting at an old furthest zoom (0.006, 0.0075) comes back at the new one, in FAR at a quarter of its native size
  for (const tb of [2, 1, 0, undefined]) assert.equal(nextBand(clampZoom(0.0075), tb), 2, `saved band ${tb}`);
  assert.ok(Math.abs(drawnScale(clampZoom(0.006), 2) - 0.25) < 1e-9);
  // the whole map at the furthest zoom: 3277 CSS px wide (it was 1966): it no longer fits a 1920 px screen; the minimap shows it whole
  assert.ok(Math.abs(2 * MAP * HW * ZOOM_MIN - 3276.8) < 0.01);
  assert.deepEqual(ANCHORS.zoom, [ZOOM_MIN, ZOOM_MAX]);
});

test('the anchors (T156): each set comes in at half its native size: NEAR at the closest zoom, MID at nearUntil, FAR at farFrom', () => {
  assert.deepEqual(TILE_BANDS, ['near', 'mid', 'far']);
  assert.equal(ANCHORS.near, 0.6, 'NEAR 0.5x at the closest zoom (the owner: "half the size ... when fully zoomed in")');
  assert.equal(ANCHORS.mid, 0.2); assert.equal(ANCHORS.far, 0.05); assert.ok(ANCHORS.far < ANCHORS.mid && ANCHORS.mid < ANCHORS.near);
  assert.deepEqual(TILE_BANDS.map((_, b) => anchorAt(b)), [ANCHORS.near, ANCHORS.mid, ANCHORS.far]);
  assert.deepEqual(ANCHORS.zoom, [ZOOM_MIN, ZOOM_MAX]);
  assert.ok(ANCHORS.hysteresis > 1 && ANCHORS.hysteresis <= 1.1, 'a few % of hysteresis'); assert.ok(ANCHORS.preload > ANCHORS.hysteresis);
  for (const b of TILE_BANDS) assert.ok(ANCHORS.how[b].length > 40, `${b}: how its anchor was set`);
  const u = ANCHORS.nearUntil!, f = ANCHORS.farFrom!, H = ANCHORS.hysteresis;
  assert.equal(u, 0.1, 'MID earlier (was 5%)'); assert.equal(nearUntil(), u); assert.equal(f, 0.025, 'FAR earlier still (was the furthest zoom)'); assert.equal(farFrom(), f);
  // where each comes in: half its native size; at the furthest zoom FAR is a quarter of it (about four tiles across a 1920 px screen)
  assert.ok(Math.abs(drawnScale(ZOOM_MAX, 0) - 0.5) < 1e-9); assert.ok(Math.abs(drawnScale(u, 1) - 0.5) < 1e-9); assert.ok(Math.abs(drawnScale(f, 2) - 0.5) < 1e-9);
  assert.ok(Math.abs(drawnScale(ZOOM_MIN, 2) - 0.25) < 1e-9);
  assert.equal(bandAt(ZOOM_MAX), 0); assert.equal(bandAt(0.2), 0); assert.equal(bandAt(u * H * 1.001), 0); assert.equal(bandAt(u * H), 1); assert.equal(bandAt(u), 1);
  assert.equal(bandAt(0.05), 1); assert.equal(bandAt(f * H * 1.001), 1); assert.equal(bandAt(f * H), 2); assert.equal(bandAt(f), 2); assert.equal(bandAt(ZOOM_MIN), 2);
  assert.equal(switchIn(0), Infinity); assert.ok(Math.abs(switchIn(1) - u * H) < 1e-15); assert.ok(Math.abs(switchOut(1) - u) < 1e-15);
  assert.ok(Math.abs(switchIn(2) - f * H) < 1e-15); assert.ok(Math.abs(switchOut(2) - f) < 1e-15);
  for (const b of [1, 2]) assert.ok(switchIn(b) <= anchorAt(b), `band ${b} gives way before it would be magnified`);
  assert.deepEqual(bandRange(0), [switchOut(1), ZOOM_MAX]); assert.deepEqual(bandRange(1), [switchOut(2), switchIn(1)]); assert.deepEqual(bandRange(2), [ZOOM_MIN, switchIn(2)]);
});

test('nearUntil and farFrom are the owner\'s numbers: the switches follow them, held so no set is magnified and each band keeps a range', () => {
  const wasU = ANCHORS.nearUntil, wasF = ANCHORS.farFrom, H = ANCHORS.hysteresis;
  try {
    for (const u of [0.15, 0.1, 0.05, 0.03]) {
      ANCHORS.nearUntil = u;
      assert.equal(nearUntil(), u); assert.equal(nextBand(u * 1.001, 0), 0); assert.equal(nextBand(u, 0), 1, `zooming out, MID at ${u}`);
      assert.equal(nextBand(u * H, 1), 1); assert.equal(nextBand(u * H * 1.001, 1), 0, 'zooming in, NEAR again just past the hysteresis');
      assert.ok(drawnScale(u * H, 1) < 1, 'MID below its native size where it gives way');
    }
    ANCHORS.nearUntil = 0.5; assert.ok(Math.abs(nearUntil() - ANCHORS.mid / H) < 1e-15, 'held: MID gives way at its anchor at the latest'); assert.equal(switchIn(1), ANCHORS.mid);
    ANCHORS.nearUntil = 0.0001; assert.ok(Math.abs(nearUntil() - farFrom() * H * H) < 1e-15, 'held above FAR\'s switch: MID always has a range');
    ANCHORS.nearUntil = undefined; assert.ok(Math.abs(nearUntil() - ANCHORS.mid / H) < 1e-15, 'no nearUntil: at MID\'s anchor');
    ANCHORS.nearUntil = wasU;
    for (const f of [0.04, 0.025, 0.015]) {
      ANCHORS.farFrom = f;
      assert.equal(farFrom(), f); assert.equal(nextBand(f * 1.001, 1), 1); assert.equal(nextBand(f, 1), 2, `zooming out, FAR at ${f}`);
      assert.equal(nextBand(f * H, 2), 2); assert.equal(nextBand(f * H * 1.001, 2), 1, 'zooming in, MID again just past the hysteresis');
      assert.ok(drawnScale(f * H, 2) < 1, 'FAR below its native size where it gives way');
    }
    ANCHORS.farFrom = 0.5; assert.ok(Math.abs(farFrom() - ANCHORS.far / H) < 1e-15, 'held: FAR never magnified');
    ANCHORS.farFrom = 0.0001; assert.equal(farFrom(), ZOOM_MIN, 'held at the furthest zoom');
    ANCHORS.farFrom = undefined; assert.ok(Math.abs(farFrom() - ANCHORS.far / H) < 1e-15, 'no farFrom: just inside FAR\'s anchor');
  } finally { ANCHORS.nearUntil = wasU; ANCHORS.farFrom = wasF; }
});

test('one fixed world size per set: native / (anchor x DPR), so at its anchor a tile is its native pixels wide on screen (1742 device px) at any DPR', () => {
  for (const f of TILED_FAMILIES) for (const [b, band] of TILE_BANDS.entries()) {
    const lv = f.levels[band], a = anchorAt(b);
    for (const dpr of [1, 1.25, 1.5, 2]) {
      const ts = tileSpec(b, dpr), [w, h] = tileSize(lv, ts);
      assert.equal(specBand(ts), b); assert.equal(specDpr(ts), dpr); assert.equal(bandOf(ts), band);
      // 1 painting px = 1 device px at the anchor: world px x CSS zoom x DPR = native px, in both axes (its own native aspect)
      assert.ok(Math.abs(w * a * dpr - lv.native[0]) < 1e-6 && Math.abs(h * a * dpr - lv.native[1]) < 1e-6, `${f.id} ${band} dpr ${dpr}`);
      assert.ok(Math.abs(w / h - lv.native[0] / lv.native[1]) < 1e-9, 'never squashed to the 2:1 diamond');
      assert.ok(Math.abs(tileScreenPx(lv, a, b) - lv.native[0]) < 1e-9, 'the readout: native px on screen at the anchor');
    }
    // the same world size wherever the camera is in the band: the size reads the band and the DPR only, never the zoom
    // (T153: a zoom inside the band's range; MID's anchor itself is NEAR's now, NEAR staying on down to nearUntil)
    const [lo, hi] = bandRange(b), inside = Math.sqrt(lo * hi);
    assert.equal(nextBand(inside, b), b); assert.deepEqual(tileSize(lv, tileSpec(b, 1)), tileSize(lv, tileSpec(nextBand(inside, b), 1)));
  }
  assert.equal(tiledFamily('golden-fescue')!.levels.near.native[0], 1742);
  // FAR at the furthest zoom on a 1920 x 1080 CSS view (T156): a quarter of its native 1742 x 902 px, so 4.4 x 4.8 tiles at DPR 1 (the owner: "atleast 4 tiles")
  const far = tiledFamily('golden-fescue')!.levels.far;
  for (const dpr of [1, 2]) { const c = coverageOf(1920, 1080, ZOOM_MIN, tileSize(far, tileSpec(2, dpr))); assert.ok(Math.abs(c.across - 1920 * dpr * 4 / 1742) < 1e-6 && Math.abs(c.down - 1080 * dpr * 4 / 902) < 1e-6); assert.ok(c.across >= 4); }
  // a junk or T145 spec reads as NEAR at DPR 1 (a chunk baked before T150 is simply stale)
  for (const junk of [0, 3, 11, -5, 1.5, NaN]) { assert.equal(specBand(junk), 0); assert.equal(specDpr(junk), 1); }
  assert.notEqual(tileSpec(0, 1), tileSpec(0, 2), 'a DPR change re-lays'); assert.notEqual(tileSpec(0, 1), tileSpec(1, 1));
  assert.equal(tileSpec(1, 0), tileSpec(1, 1), 'no DPR: 1'); assert.equal(tileSpec(5, 1), tileSpec(2, 1), 'bands clamp');
});

test('never magnified: at every zoom, zooming out and in and jumping, at DPR 1, 1.5 and 2, a set is drawn at or below its native pixels', () => {
  const rnd = mulberry(150);
  for (const f of TILED_FAMILIES) for (const dpr of [1, 1.5, 2]) {
    let b: number | null = null, worst = 0;
    const frame = (z: number) => {
      b = nextBand(z, b); const lv = f.levels[TILE_BANDS[b]!]!, devicePx = tileSize(lv, tileSpec(b, dpr))[0] * z * dpr;
      worst = Math.max(worst, devicePx / lv.native[0]);
      assert.ok(devicePx <= lv.native[0] * (1 + 1e-9), `${f.id} dpr ${dpr} z ${z}: ${devicePx.toFixed(1)} px > native ${lv.native[0]}`);
      // and with no history
      const c = bandAt(z), lc = f.levels[TILE_BANDS[c]!]!; assert.ok(tileSize(lc, tileSpec(c, dpr))[0] * z * dpr <= lc.native[0] * (1 + 1e-9));
    };
    for (let z = ZOOM_MAX; z > ZOOM_MIN; z /= 1.01) frame(z);
    frame(ZOOM_MIN);
    for (let z = ZOOM_MIN; z < ZOOM_MAX; z *= 1.01) frame(z);
    frame(ZOOM_MAX);
    for (let i = 0; i < 2000; i++) frame(ZOOM_MIN * (ZOOM_MAX / ZOOM_MIN) ** rnd()); // camera jumps (a hole, the overview, a reload)
    for (const a of [ANCHORS.mid, ANCHORS.far, nearUntil(), switchIn(1), farFrom(), switchIn(2)]) for (const k of [0.97, 0.999, 1, 1.001, 1.03]) frame(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, a * k)));
    assert.ok(worst >= 0.5 - 1e-9 && worst <= 0.5 * ANCHORS.hysteresis + 1e-9, `${f.id} dpr ${dpr}: each set comes in at half its native size (worst ${worst}), never above`);
  }
  // T156: at nearUntil (10%) NEAR is a sixth of its native size and MID about half of it
  assert.ok(Math.abs(drawnScale(ANCHORS.nearUntil!, 0) - 1 / 6) < 1e-9); assert.ok(drawnScale(switchIn(1), 1) <= 0.53);
});

test('a real zoom inside a band: no re-lay; the tiles shrink smoothly as the camera zooms out and the set switches only at the anchors', () => {
  const lv = (b: number) => tiledFamily('lake')!.levels[TILE_BANDS[b]!]!;
  for (const dpr of [1, 1.5, 2]) {
    let b: number | null = null, prevTs = -1, prevPx = Infinity;
    const switches: { z: number; from: number; to: number }[] = [];
    for (let z = ZOOM_MAX; ; z = Math.max(ZOOM_MIN, z / 1.005)) {
      const was = b; b = nextBand(z, b); const ts = tileSpec(b, dpr), px = tileSize(lv(b), ts)[0] * z * dpr;
      if (prevTs >= 0 && ts !== prevTs) switches.push({ z, from: was!, to: b });
      else if (prevTs >= 0) assert.ok(px < prevPx && px > prevPx / 1.0051, 'inside a band the same tiles shrink with the zoom, nothing else changes');
      prevTs = ts; prevPx = px;
      if (z === ZOOM_MIN) break;
    }
    assert.deepEqual(switches.map(s => [s.from, s.to]), [[0, 1], [1, 2]], 'NEAR to MID, MID to FAR, nothing else');
    const u = ANCHORS.nearUntil!;
    assert.ok(switches[0]!.z <= u * (1 + 1e-9) && switches[0]!.z > u / 1.006, `NEAR to MID at nearUntil (${switches[0]!.z})`);
    const f = ANCHORS.farFrom!;
    assert.ok(switches[1]!.z <= f * (1 + 1e-9) && switches[1]!.z > f / 1.006, `MID to FAR at farFrom (${switches[1]!.z})`);
  }
});

test('band hysteresis: zooming out a coarser set takes over at its switch, zooming in the finer one comes back a few % above it; a resting camera never flips', () => {
  const H = ANCHORS.hysteresis, m = ANCHORS.mid, u = ANCHORS.nearUntil!;
  assert.equal(nextBand(m, 0), 0, 'out: NEAR stays past MID\'s anchor (T153)'); assert.equal(nextBand(u * 1.001, 0), 0); assert.equal(nextBand(u, 0), 1, 'out: MID at nearUntil');
  assert.equal(nextBand(u * H, 1), 1, 'in: MID up to nearUntil x the hysteresis'); assert.equal(nextBand(u * H * 1.0001, 1), 0, 'in: past it NEAR');
  assert.equal(nextBand(m * 1.0001, 1), 0, 'in: MID is never magnified');
  const f = ANCHORS.farFrom!;
  assert.equal(nextBand(f * 1.0001, 1), 1); assert.equal(nextBand(f, 1), 2, 'out: FAR at farFrom');
  assert.equal(nextBand(f * H, 2), 2, 'in: FAR up to farFrom x the hysteresis'); assert.equal(nextBand(f * H * 1.0001, 2), 1, 'in: past it MID');
  assert.equal(nextBand(ZOOM_MIN, 0), 2, 'a jump from NEAR to the overview: FAR'); assert.equal(nextBand(0.05, 0), 1); assert.equal(nextBand(0.25, 2), 0, 'a jump in from FAR: NEAR');
  // jitter round MID's anchor and its switch: at most one switch, no flipping
  for (const [z0, amp, start] of [[u, 0.03, 0], [u, 0.03, 1], [u * H, 0.01, 0], [u * H, 0.01, 1], [u * Math.sqrt(H), 0.015, 0], [u * Math.sqrt(H), 0.015, 1], [f, 0.03, 1], [f, 0.03, 2], [f * Math.sqrt(H), 0.015, 2]] as const) {
    let b: number = start, flips = 0;
    for (let i = 0; i < 300; i++) { const z = z0 * (1 + amp * Math.sin(i * 0.7)); const n = nextBand(z, b); if (n !== b) flips++; b = n; }
    assert.ok(flips <= 1, `${flips} flips round ${z0} from ${start}`);
  }
  // a camera resting on an anchor stays in one band frame after frame
  for (const [z, b] of [[m, 0], [u, 1], [u * H, 1], [u * 1.02, 0], [ZOOM_MIN, 2], [ZOOM_MAX, 0]] as const) { let s: number = b; for (let i = 0; i < 50; i++) s = nextBand(z, s); assert.equal(s, nextBand(z, b)); }
  // a bad saved band is ignored; a saved band inside the hysteresis is kept (a reload lays the same tiles)
  assert.equal(nextBand(0.2, 99), bandAt(0.2)); assert.equal(nextBand(0.2, null), bandAt(0.2)); assert.equal(nextBand(0.2, 1.5), bandAt(0.2));
  assert.equal(nextBand(u * 1.02, 0), 0); assert.equal(nextBand(u * 1.02, null), 1);
});

test('the next set is decoded ahead once the camera nears its switch, and only then', () => {
  const P = ANCHORS.preload, u = ANCHORS.nearUntil!, H = ANCHORS.hysteresis;
  assert.deepEqual(bandsAhead(ZOOM_MAX, 0), []); assert.deepEqual(bandsAhead(u * P * 1.01, 0), []); assert.deepEqual(bandsAhead(u * P * 0.99, 0), [1]);
  assert.deepEqual(bandsAhead(u * H / P * 1.01, 1), [0], 'MID near its switch in: NEAR ahead'); assert.deepEqual(bandsAhead(u * H / P * 0.99, 1), []); assert.deepEqual(bandsAhead(0.05, 1), []);
  const f = ANCHORS.farFrom!;
  assert.deepEqual(bandsAhead(f * P * 0.99, 1), [2], 'MID near farFrom: FAR ahead'); assert.deepEqual(bandsAhead(f, 2), [1], 'FAR near its switch in: MID ahead'); assert.deepEqual(bandsAhead(ZOOM_MIN, 2), []);
  // whenever a switch happens, the set switched to was ahead on the frame before
  let b: number | null = 0, ahead: number[] = [];
  for (const z of [...Array.from({ length: 900 }, (_, i) => ZOOM_MAX / 1.005 ** i).filter(z => z > ZOOM_MIN), ZOOM_MIN, ...Array.from({ length: 900 }, (_, i) => ZOOM_MIN * 1.005 ** i).filter(z => z < ZOOM_MAX)]) {
    const n = nextBand(z, b); if (n !== b) assert.ok(ahead.includes(n), `${b} -> ${n} at ${z}: decoded ahead`); b = n; ahead = bandsAhead(z, b);
  }
});

test('placement is world-anchored and stable: pan and resize never change a tile; every neighbour differs; no mirror or turn exists', () => {
  for (const f of TILED_FAMILIES) for (const b of TILE_BANDS) {
    const n = f.levels[b].tiles.length, perm = tilePermutation(f.id, b, n);
    assert.deepEqual([...perm].sort(), Array.from({ length: n }, (_, i) => i), 'a permutation of the level\'s whole tiles'); assert.deepEqual(tilePermutation(f.id, b, n), perm, 'seeded: the same every time');
    for (let iy = -6; iy < 6; iy++) for (let ix = -6; ix < 6; ix++) {
      const me = tileIndex(perm, ix, iy); assert.ok(me >= 0 && me < n && f.levels[b].tiles[me], `${f.id} ${b}: a tile of the level`);
      // four tiles: no tile touches a copy of itself; the owner's one tile a level (T162) repeats, accepted for now (#350)
      if (n === 4) for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) assert.notEqual(tileIndex(perm, ix + dx!, iy + dy!), me, `${f.id} ${b} (${ix},${iy})+(${dx},${dy})`);
    }
  }
  // the tile under a world point depends on the point, the band and the DPR only (T150: the DPR is part of a set's world size): the same for
  // any camera position and window
  const fam = tiledFamily('golden-fescue')!, x = 1030.4, y = 977.9, X = worldX(x, y), Y = worldY(x, y);
  for (const z of [0.3, 0.12, 0.05, 0.02, ZOOM_MIN]) for (const dpr of [1, 1.5, 2]) {
    const k = tileSpec(bandAt(z), dpr), [w, h] = tileSize(fam.levels[bandOf(k)], k), cell = cellOf(X, Y, w, h);
    assert.ok(grassZoomLevels(z, dpr).rasterL > 0);
    for (const [vw, vh] of [[1920, 1080], [1280, 720], [2560, 1440], [800, 1200]]) {
      // the view's rectangle anywhere around the point: the point's cell and tile are the same
      for (const pan of [-3000, 0, 4567]) { const X0 = X + pan - vw / 2 / z, Y0 = Y - pan - vh / 2 / z; const c = cellsIn(X0, Y0, X0 + vw / z, Y0 + vh / z, w, h).find(q => q.ix === cell[0] && q.iy === cell[1]); if (X >= X0 && X < X0 + vw / z && Y >= Y0 && Y < Y0 + vh / z) assert.ok(c); }
    }
  }
  assert.equal(TILES.display.minVisibleTiles, 2); assert.equal(TILES.display.maxVisibleTiles, 4);
  assert.deepEqual({ m: (TILES.display as Record<string, unknown>).allowMirror, r: (TILES.display as Record<string, unknown>).allowRotate }, { m: false, r: false });
});

test('whole tiles butt edge to edge at every chunk border and cache level: snapped edges are shared, never a gap or an overlap', () => {
  const tiers: [number, number, readonly number[]][] = [[CHUNK_W, CHUNK_H, LEVELS], [MID_W, MID_H, MID_LEVELS], [PLAN_W, PLAN_H, PLAN_LEVELS]];
  for (const [cw, ch, levels] of tiers) for (const L of levels) {
    // a chunk's origin is a whole number of px at its level, so every chunk rounds a tile edge to the same global px
    assert.ok(Math.abs(cw * L - Math.round(cw * L)) < 1e-9 && Math.abs(ch * L - Math.round(ch * L)) < 1e-9, `${cw}x${ch} @ ${L}`);
    for (const k of [0, 1, 2].flatMap(b => [1, 1.5, 2].map(dpr => tileSpec(b, dpr)))) {
      const [w, h] = tileSize(tiledFamily('lake')!.levels[bandOf(k)], k);
      for (let i = -3; i < 3; i++) {
        const a = snappedCell(i, i, w, h, L), r = snappedCell(i + 1, i, w, h, L), d = snappedCell(i, i + 1, w, h, L);
        assert.equal(a[2], r[0], 'right neighbour shares the edge'); assert.equal(a[3], d[1], 'lower neighbour shares the edge');
        assert.ok(Math.abs((a[2] - a[0]) - w * L) <= 1 && Math.abs((a[3] - a[1]) - h * L) <= 1, 'at most a px from the exact size');
      }
    }
  }
});

test('the tile sets join the families, laid as authored; the map grass, rivers, the golf turf and tee and the town lawns resolve to tile sets through their textures; every legacy family stays as an option (T225: no pin on the owner\'s picks)', () => {
  for (const id of ['golden-fescue', 'lake', 'sand-ripples-tiles', 'fairway', 'putting-green', 'long-grass', 'rough-owner', 'fairway-paint', 'putting-green-paint']) {
    const f = familyById(id)!; assert.ok(f.tiled);
    assert.deepEqual(clampLook({ family: id, version: 'v9', scale: 2, tint: '#ff0000', tone: 0.4 }), { family: id, version: null, scale: 1, tint: '#ffffff', tone: 0 }, 'no scale, tint or tone over the art');
    const r = resolveFamily({ family: id, version: null, scale: 1 })!; assert.ok(r.tiled);
    assert.notEqual(r.near.file, r.mid.file); assert.notEqual(r.mid.file, r.far.file);
  }
  assert.equal(familyById('golden-fescue')!.kind, 'grass'); assert.equal(familyById('lake')!.kind, 'water'); assert.equal(familyById('sand-ripples-tiles')!.kind, 'sand');
  for (const id of ['fairway', 'putting-green', 'rough-owner', 'fairway-paint', 'putting-green-paint']) { assert.equal(familyById(id)!.kind, 'grass'); assert.equal(familyById(id)!.provisional, true, `${id}: provisional (the studio says so)`); }
  for (const id of ['golden-fescue', 'lake', 'sand-ripples-tiles', 'long-grass']) assert.ok(!familyById(id)!.provisional, id);
  assert.equal(familyById('long-grass')!.kind, 'grass'); // T170: through its handoff, accepted
  for (const id of ['emerald-short', 'sage-medium', 'sage-long', 'straw-long', 'water-pond', 'sand-raked', 'sand-ripples', 'underground-earth', 'first-painted']) { assert.ok(familyById(id) && !familyById(id)!.tiled, id); assert.ok(clampLook({ family: id, version: null, scale: 1, tint: '#ffffff', tone: 0 }), id); }
  assert.equal(FAMILIES.filter(f => f.tiled).length, TILED_FAMILIES.length);
  const S = clampSurfaces(surfacesFile);
  assert.equal(lookOfTex('golfFescue', S)!.family, 'golden-fescue'); assert.equal(lookOfTex('preset:fescue', S, PRESETS)!.family, 'golden-fescue');
  // T230 (#669): the ponds wear the concept's deep pond water (GOLF-ART-LIST 154); the rivers keep the brighter lake (the lead, 2026-10-28:
  // the concept's lake is a bright turquoise; water-look.ts shades both)
  for (const t of ['waterDark', 'waterDeep', 'waterClear']) assert.equal(lookOfTex(t, S)!.family, 'pond-concept-run', t);
  // the map's open grass draws golden fescue and rivers draw lake (the owner, 2026-10-26: "all the map water and grass needs to be replaced
  // aswell"; main 003153a); the course turf keeps its families
  assert.equal(lookOfTex('water', S)!.family, 'lake', 'rivers and creeks draw the lake');
  for (const t of ['grass', 'meadow']) assert.equal(lookOfTex(t, S)!.family, 'golden-fescue', `the map's ${t}`);
  // T153 (#327): the course's turf and waste areas wear the new sets, neutral (the tile sets are laid as authored); T165 (#365): the fairway,
  // the greens and their fringes the art session's paintings (fairway-paint, putting-green-paint), the old provisional sets kept unmapped
  // which tile set each wears is the owner's (Studio › Painted): each resolves to its surface's family, a hand-painted tile set laid as authored
  for (const [t, key] of [['golfFairway', 'fairway'], ['golfGreen', 'green'], ['golfFringe', 'fringe'], ['wasteSand', 'waste'], ['lawnBuilt', 'lawnBuilt'], ['lawnUpgraded', 'lawnUpgraded']] as const) {
    assert.equal(lookOfTex(t, S)!.family, S.surfaces[key]!.family, t); assert.ok(familyById(S.surfaces[key]!.family)!.tiled, `${key} wears a tile set`);
  }
  for (const id of ['fairway', 'putting-green']) assert.ok(tiledFamily(id), `${id} stays in the manifest (the old option)`);
  for (const p of ['fairway', 'green', 'fringe', 'rough', 'waste'] as const) { const l = lookOfTex(`preset:${p}`, S, PRESETS); if (l) assert.ok(knownFamily(l.family), `the ${p} preset`); }
  // the tee and the first cut: each texture resolves through lookOfTex to its surface's family, a tile set laid as authored (which one each wears is the owner's)
  for (const [t, key] of [['golfTee', 'tee'], ['golfFirstCut', 'firstCut']] as const) {
    assert.equal(lookOfTex(t, S)!.family, S.surfaces[key]!.family, t); assert.ok(familyById(S.surfaces[key]!.family)?.tiled, `${key} wears a tile set`);
  }
  for (const l of S.lawns) assert.ok(familyById(l.family)!.tiled, 'T189: every town lawn wears a tile set (the new paintings), laid as authored');
  assert.deepEqual(S.surfaces.fescue, { family: 'golden-fescue', version: null, scale: 1, tint: '#ffffff', tone: 0 });
  assert.deepEqual(S.surfaces.water, { family: 'pond-concept-run', version: null, scale: 1, tint: '#ffffff', tone: 0 }); // (T230: the concept's water)
});

test('separate gameplay layers: water and fescue keep their places in the course\'s layer order (fairway over rough, green over its ground)', () => {
  const rank = (s: number) => DRAW_ORDER.indexOf(layerCode(s, false));
  for (const s of [SURF.rough, SURF.fescue, SURF.water, SURF.fairway, SURF.green, SURF.bunker]) assert.ok(rank(s) >= 0, `surface ${s} is a layer`);
  assert.ok(rank(SURF.fairway) > rank(SURF.rough)); assert.ok(rank(SURF.green) > rank(SURF.fairway)); assert.ok(rank(SURF.green) > rank(SURF.rough));
  assert.ok(rank(SURF.fairway) > rank(SURF.fescue), 'fairway over the fescue'); assert.ok(rank(SURF.water) > rank(SURF.rough), 'water inside its own mask over the rough');
});

test('a stale chunk never keeps an old set: the tile spec (band and DPR) is in the chunk key for pictures that laid tiles, and the switch waits, then cuts', () => {
  const pic = (o: Partial<ChunkPictures<string>>): ChunkPictures<string> => ({ tex: 'old', texL: 0.6, texArtL: 0.3, fadeFrom: null, prev: null, texTs: 2, texTiled: true, ...o });
  assert.equal(pictureCurrent(pic({}), 0.6, 0.3, 2), true); assert.equal(pictureCurrent(pic({}), 0.6, 0.3, 3), false, 'a tiled picture at another step is stale');
  assert.equal(pictureCurrent(pic({ texTiled: false }), 0.6, 0.3, 3), true, 'a chunk with no tile set is not baked again for a step');
  assert.equal(pictureCurrent(pic({ tex: null }), 0.6, 0.3, 2), false);
  // while the view waits for the new step: the old set at full strength, never a mix of the two
  let lay = chunkLayers(pic({}), 0.6, 0.3, 0, false, 3); assert.equal(lay.base, 'old'); assert.equal(lay.top, null);
  lay = chunkLayers(pic({ tex: 'new', texTs: 3, fadeFrom: 'old' }), 0.6, 0.3, 0, false, 3); assert.equal(lay.base, 'old'); assert.equal(lay.top, null);
  // once every chunk on screen has it (the engine's cut: zoomBlend 1 at once): the new set alone
  lay = chunkLayers(pic({ tex: 'new', texTs: 3, fadeFrom: 'old' }), 0.6, 0.3, 1, false, 3); assert.equal(lay.base, 'new'); assert.equal(lay.top, null);
  // the workers' composition key carries the revision and the spec: another band or another DPR is another key
  const ts = tileSpec(1, 1.5); assert.equal(tileKey(ts), `${TILES_REVISION}#${ts}`);
  assert.notEqual(tileKey(tileSpec(0, 1)), tileKey(tileSpec(1, 1))); assert.notEqual(tileKey(tileSpec(0, 1)), tileKey(tileSpec(0, 2)));
});

test('the owner\'s rough (T162, #350): the paintings unchanged in the repo, one tile a level at their native size, edges healed so each tiles with itself', () => {
  const f = tiledFamily('rough-owner')!;
  assert.ok(f && f.provisional, 'provisional'); assert.equal(f.materialId, 'owner:rough-20261026'); assert.equal(f.owner, `${OWNER_DIR}/source.json`); assert.equal(f.name, 'Rough (owner)');
  const src = JSON.parse(fs.readFileSync(path.join(process.cwd(), f.owner!), 'utf8'));
  assert.deepEqual(src.family, { id: 'rough-owner', name: 'Rough (owner)', kind: 'grass', provisional: true });
  // the owner's three files as supplied (E:/ClaudeTemp/rough-owner-20261026/v2, from the codex session): their sha256 never changes
  const OWNER_SHA = { near: 'b3c9cdd3b41f44fd1e3814084dac01434114e4410c896c5e881c9f3ce6020ed5', mid: '6605fd9d40226a54a834e231f129d630cc1edfa36bd6e5157b43f3871b31ca09', far: '5bcc9981a3efeb10a18fcada96ee370a5e38a6ac43277ec90fee3809b7a731d8' } as const;
  const SIZE = { near: [1742, 903], mid: [1744, 902], far: [1742, 903] } as const;
  for (const b of TILE_BANDS) {
    const lv = f.levels[b], t = lv.tiles[0]!;
    assert.equal(lv.tiles.length, 1, `${b}: one tile`);
    assert.equal(sha256(fs.readFileSync(path.join(process.cwd(), t.source!))), OWNER_SHA[b], `${t.source}: the owner's file, unchanged`);
    assert.equal(t.sha256, OWNER_SHA[b]); assert.equal(src.levels[b].sha256, OWNER_SHA[b]); assert.equal(`${OWNER_DIR}/${src.levels[b].file}`, t.source);
    assert.deepEqual(lv.native, SIZE[b]); assert.deepEqual(src.levels[b].size, SIZE[b]);
    assert.deepEqual(webpSize(fs.readFileSync(path.join(PAINTED, t.file))), lv.native, `${t.file}: its native size (never resized)`);
    // the heal: before, the owner's seams (the wrap 2-3x the inside); after, on the WebP that ships, about its own inside difference
    const h = lv.heal!; assert.equal(h.method, HEAL_METHOD); assert.equal(h.band, 48);
    assert.ok(h.before.lr > 2 * h.before.h && h.before.tb > 2 * h.before.v, `${b}: the seams before (${h.before.lr} / ${h.before.tb} vs ${h.before.h} / ${h.before.v})`);
    assert.ok(h.healed.lr <= 1.25 * h.healed.h && h.healed.tb <= 1.25 * h.healed.v, `${b}: healed wrap ${h.healed.lr} / ${h.healed.tb}, about the inside ${h.healed.h} / ${h.healed.v}`);
    assert.ok(h.after.lr <= 1.25 * h.after.h && h.after.tb <= 1.25 * h.after.v, `${b}: as shipped (WebP) ${h.after.lr} / ${h.after.tb}, about its inside ${h.after.h} / ${h.after.v}`);
    assert.ok(h.after.lr < 0.6 * h.before.lr && h.after.tb < 0.6 * h.before.tb, `${b}: the seams gone`);
    assert.match(lv.status!, /the owner's painting .*one tile; edges healed/);
    // one tile a level: every cell shows it (the repetition is accepted for now)
    const perm = tilePermutation(f.id, b, lv.tiles.length); assert.deepEqual(perm, [0]);
    for (let iy = -3; iy < 3; iy++) for (let ix = -3; ix < 3; ix++) assert.equal(tileIndex(perm, ix, iy), 0);
  }
});

test('the edge heal (tile-heal.mjs): only the outer band changes, as a cross-fade with the painting\'s own middle; the wrap as continuous as the inside, corners included', () => {
  const w = 240, h = 200, ch = 3, band = 24, px = new Uint8Array(w * h * ch);
  // a painting that does not tile: two waves and a tone gradient left to right and top to bottom
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < ch; c++) px[(y * w + x) * ch + c] = Math.max(0, Math.min(255, Math.round(100 + 40 * Math.sin(x * 0.31 + y * 0.17 + c) + 25 * Math.sin(y * 0.23 - x * 0.05) + 0.2 * x - 0.15 * y)));
  const before = wrapMismatch(px, w, h, ch), out = healWrap(px, w, h, ch, band), after = wrapMismatch(out, w, h, ch);
  assert.ok(before.lr > 2 * before.h && before.tb > 2 * before.v, `the fixture has seams (${JSON.stringify(before)})`);
  assert.ok(after.lr <= 1.25 * after.h && after.tb <= 1.25 * after.v, `healed: ${JSON.stringify(after)}`);
  assert.equal(out.length, px.length);
  // the interior is untouched, to the value
  for (let y = band; y < h - band; y++) for (let x = band; x < w - band; x++) for (let c = 0; c < ch; c++) assert.equal(out[(y * w + x) * ch + c], px[(y * w + x) * ch + c]);
  // a row outside the top and bottom bands: each band pixel is its own value cross-faded with the bridge (the middle 2 x band px of the same
  // row, same order: nothing mirrored or turned), the bridge's weight 0 at the band's inner edge and 1 at the wrap
  const y = h / 2, d0 = w / 2 - band;
  for (let p = -band; p < band; p++) {
    const x = p < 0 ? w + p : p, k = bridgeWeight(p, band);
    for (let c = 0; c < ch; c++) assert.ok(Math.abs(out[(y * w + x) * ch + c]! - ((1 - k) * px[(y * w + x) * ch + c]! + k * px[(y * w + d0 + band + p) * ch + c]!)) <= 1, `x ${x}`);
  }
  assert.ok(bridgeWeight(-band, band) < 0.01 && bridgeWeight(band - 1, band) < 0.01 && bridgeWeight(-1, band) > 0.99 && bridgeWeight(0, band) > 0.99);
  for (let p = 0; p < band; p++) assert.ok(Math.abs(bridgeWeight(p, band) - bridgeWeight(-1 - p, band)) < 1e-12, 'symmetric about the wrap');
  // the corners agree: inside the top band (healed both ways) the left-right wrap is as continuous as elsewhere
  let corner = 0; for (let yy = 0; yy < band; yy++) for (let c = 0; c < 3; c++) corner += Math.abs(out[(yy * w + w - 1) * ch + c]! - out[(yy * w) * ch + c]!);
  assert.ok(corner / (band * 3) <= 1.25 * after.h, `corner rows: ${corner / (band * 3)}`);
  // a painting too small for its band is refused (the bridge would overlap a band)
  assert.throws(() => healWrap(px, w, h, ch, 60), /too small/); assert.throws(() => healWrap(px, w, h, ch, 0), /band/);
  // T165: the default heal is the middle bridge, unchanged (the rough ships byte for byte as T162 made it)
  const mid = healWrapWith(px, w, h, ch, band);
  assert.deepEqual(mid.centre, { x: w / 2, y: h / 2 }); assert.ok(Buffer.from(mid.pixels).equals(Buffer.from(out)), 'healWrap is healWrapWith with the middle bridge');
});

/* ---- T165 (#365): the fairway and putting-green paintings ---- */
/** a picture of diagonal mowing stripes (period px along x, py along y, stripe phase u = x / px + y / py) with grain, seeded */
function stripes(w: number, h: number, px: number, py: number, seed: number, amp = 30): Uint8Array {
  const out = new Uint8Array(w * h * 3), rnd = mulberry(seed);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = amp * Math.sin(2 * Math.PI * (x / px + y / py) + seed), g = (rnd() - 0.5) * 8;
    for (let c = 0; c < 3; c++) out[(y * w + x) * 3 + c] = Math.max(0, Math.min(255, Math.round([90, 140, 40][c]! + s * [0.6, 1, 0.3][c]! + g)));
  }
  return out;
}

test('the stripe crop (T165): the stripes\' periods by autocorrelation; a crop of whole periods lines them up straight across the wrap; only a crop', () => {
  const W = 300, H = 200, PX = 41.3, PY = 27.1, px = stripes(W, H, PX, PY, 3);
  const sx = stripePeriod(px, W, H, 3, 'x')!, sy = stripePeriod(px, W, H, 3, 'y')!;
  assert.ok(Math.abs(sx.period - PX) < 0.3 && Math.abs(sy.period - PY) < 0.3, `periods ${sx.period} x ${sy.period}`); assert.ok(sx.strength > 0.5 && sy.strength > 0.5);
  const c = stripeCrop(px, W, H, 3)!;
  assert.ok(c, 'stripes found');
  // whole periods each way, at least 80% of each side kept
  assert.ok(Math.abs(c.w - c.kx * c.periodX) <= 0.5 && Math.abs(c.h - c.ky * c.periodY) <= 0.5, `${c.w} = ${c.kx} x ${c.periodX}, ${c.h} = ${c.ky} x ${c.periodY}`);
  assert.ok(c.w >= 0.8 * W && c.h >= 0.8 * H && c.x0 + c.w <= W && c.y0 + c.h <= H);
  // the stripes' phase step across the wrap: 7.26 and 7.38 periods uncropped (a quarter period off and more), straight across once cropped
  assert.ok(c.phase.before.x > 5 && c.phase.before.y > 5, `before ${JSON.stringify(c.phase.before)}`);
  assert.ok(c.phase.after.x < 1.5 && c.phase.after.y < 1.5, `after ${JSON.stringify(c.phase.after)}`);
  // only a crop: the kept pixels are the picture's own, in place
  const cp = cropPixels(px, W, H, 3, c);
  for (let y = 0; y < c.h; y += 7) for (let x = 0; x < c.w; x += 5) for (let k = 0; k < 3; k++) assert.equal(cp[(y * c.w + x) * 3 + k], px[((c.y0 + y) * W + c.x0 + x) * 3 + k]);
  const ph = stripePhase(cp, c.w, c.h, 3, c.periodX, c.periodY);
  assert.ok(Math.abs(ph.x - c.phase.after.x) < 0.5 && Math.abs(ph.y - c.phase.after.y) < 0.5, 'the same measure on the cropped picture');
  // the matched bridge (wrap-bridge-match-v1) sits a whole number of periods from the wrap, so the stripes cross-fade in phase
  const r = healWrapWith(cp, c.w, c.h, 3, 24, { bridge: 'match' }), off = (v: number, p: number) => { const m = ((v % p) + p) % p; return Math.min(m, p - m); };
  assert.ok(off(r.centre.x, c.periodX) <= 2 && off(r.centre.y, c.periodY) <= 2, `bridge at ${JSON.stringify(r.centre)}`);
  const hp = stripePhase(r.pixels, c.w, c.h, 3, c.periodX, c.periodY), m = wrapMismatch(r.pixels, c.w, c.h, 3);
  assert.ok(hp.x < 2 && hp.y < 2, `healed stripes ${JSON.stringify(hp)}`); assert.ok(m.lr <= 1.25 * m.h && m.tb <= 1.25 * m.v, JSON.stringify(m));
  // grain alone has no stripes: no crop
  const flat = new Uint8Array(W * H * 3), rnd = mulberry(9); for (let i = 0; i < flat.length; i++) flat[i] = 100 + Math.round(rnd() * 20);
  assert.equal(stripeCrop(flat, W, H, 3), null);
});

test('the shared-strip heal (T165): four tiles cross-faded to one strip, so any tile\'s edge meets any tile\'s; each interior untouched', () => {
  const w = 200, h = 160, band = 24, tiles = [1, 2, 3, 4].map(s => stripes(w, h, 37 + s * 3.3, 29 - s * 1.7, s, 20));
  const res = healShared(tiles, w, h, 3, band), before = setMismatch(tiles, w, h, 3), after = setMismatch(res.tiles, w, h, 3);
  assert.ok(before.lr > 2 * before.h && before.tb > 2 * before.v, `the tiles do not meet (${JSON.stringify(before)})`);
  assert.ok(after.lr <= 1.25 * after.h && after.tb <= 1.25 * after.v, `healed: ${JSON.stringify(after)}`);
  for (const [i, t] of res.tiles.entries()) for (let y = band; y < h - band; y++) for (let x = band; x < w - band; x += 3) assert.equal(t[(y * w + x) * 3], tiles[i]![(y * w + x) * 3], `tile ${i} interior`);
  // every pair, each tile with itself included: its right edge meets the other's left edge as a neighbour pair, and bottom meets top
  for (const a of res.tiles) for (const b of res.tiles) { const c = crossMismatch(a, b, w, h, 3); assert.ok(c.lr <= 1.25 * after.h + 0.5 && c.tb <= 1.25 * after.v + 0.5, JSON.stringify(c)); }
  // the shared strip: at the wrap all four tiles carry (nearly) the same pixels
  for (let y = 0; y < h; y += 5) { const v = res.tiles.map(t => t[(y * w + w - 1) * 3 + 1]!); assert.ok(Math.max(...v) - Math.min(...v) <= 2, `row ${y}: ${v}`); }
});

test('the fairway and putting-green paintings (T165, #365): unchanged in the repo, healed at their edges, stripes measured, green MID the putting-green set', () => {
  const SHA = {
    'fairway-paint': { near: '14fcf2b2a1b4a848a46e23c98f92f2a5da11a62953d4d3c0dfadd7f564d0fc75', mid: '54743bfb086ca96e0d806832f6848d58732e25249cacdc6c20e1300d30089a1b', far: 'da2925ecca80faca8399762f5143cd464a324cf07d7977dbaa8aa1375892b688' },
    'putting-green-paint': { near: 'e61d1d0832558291773cdbfdbca7f39a69e02de9d15072a58f348cc76b3c16c4', mid: '489b6afd7f7226b334f1eb693c4b0fb885e768f381d1d7ceb1eb38f8fed419cd', far: '64ab32b0bfed474eb817c85009baf0c0934b95a15a674c68fd8015152feed06f' },
  } as const;
  for (const [id, name, mat] of [['fairway-paint', 'Fairway (painting)', 'fairway'], ['putting-green-paint', 'Putting green (painting)', 'putting-green']] as const) {
    const f = tiledFamily(id)!, dir = `art/owner-supplied/${mat}-20261026`;
    assert.ok(f && f.provisional && f.kind === 'grass'); assert.equal(f.name, name); assert.equal(f.materialId, `paint:${mat}-20261026`); assert.equal(f.owner, `${dir}/source.json`);
    const src = JSON.parse(fs.readFileSync(path.join(process.cwd(), f.owner!), 'utf8'));
    for (const b of TILE_BANDS) {
      const lv = f.levels[b], h = lv.heal!;
      // the source files as the art session made them: their sha256 never changes
      assert.equal(sha256(fs.readFileSync(path.join(process.cwd(), dir, `${b}.png`))), SHA[id][b], `${dir}/${b}.png unchanged`); assert.equal(src.levels[b].sha256, SHA[id][b]);
      for (const t of lv.tiles) assert.deepEqual(webpSize(fs.readFileSync(path.join(PAINTED, t.file))), lv.native, `${t.file}: its native size`);
      // healed (or, a finished set shipped as made, T170: as made): the wrap about its inside; as shipped: the lossy WebP adds about a level
      // across any tile edge; a healed level's seams gone
      assert.ok(h.healed.lr <= 1.25 * h.healed.h && h.healed.tb <= 1.25 * h.healed.v, `${id} ${b} healed ${JSON.stringify(h.healed)}`);
      assert.ok(h.after.lr <= h.after.h + 1.5 && h.after.tb <= h.after.v + 1.5, `${id} ${b} shipped ${JSON.stringify(h.after)}`);
      if (h.method === HEAL_AS_MADE) { assert.deepEqual(h.healed, h.before, `${id} ${b}: as made, no heal`); assert.equal(h.band, 0); }
      else {
        assert.ok(h.centre && Number.isInteger(h.centre.x) && Number.isInteger(h.centre.y), `${id} ${b}: the bridge recorded`);
        assert.ok(h.after.lr < 0.5 * h.before.lr && h.after.tb < 0.5 * h.before.tb, `${id} ${b}: the seams gone`);
      }
      if (id === 'putting-green-paint' && b === 'mid') {
        // the MID painting's bright corner repeats when tiled: the level is the provisional putting green's MID set (the same tiles as the old
        // option): its finished tiles shipped as made when they tile cleanly (T170, #395), else its raw tiles shared-strip healed (T165)
        const old = tiledFamily('putting-green')!.levels.mid, finished = /^finished tiles/.test(old.status ?? '');
        assert.equal(h.method, finished ? HEAL_AS_MADE : HEAL_SHARED); assert.equal(lv.revision, `${old.revision}-${finished ? 'finished' : 'shared'}`);
        assert.match(h.fallback!, /bright corner/); assert.equal(lv.tiles.length, 4);
        assert.deepEqual(lv.tiles.map(t => [t.sha256, t.source]), old.tiles.map(t => [t.sha256, t.source]), 'the same tiles as the old option'); assert.deepEqual(lv.native, old.native);
        if (finished) for (const t of lv.tiles) assert.match(t.source!, /\/tile-0[1-4]\.png$/, 'the finished tiles, not the raw generator outputs');
      } else {
        assert.equal(h.method, HEAL_MATCH); assert.equal(lv.tiles.length, 1); assert.equal(lv.tiles[0]!.sha256, SHA[id][b]);
        assert.deepEqual(lv.native, src.levels[b].size, `${id} ${b}: uncropped, the painting's own size`);
      }
      if (id === 'fairway-paint') {
        // the mowing stripes: measured; the best whole-period crop is applied only when it lines them up at least a quarter better (here not:
        // the painted stripes fan out like a slight perspective, so no crop lines them up along a whole edge)
        const s = h.stripes!; assert.ok(s.periodX! > 50 && s.periodY! > 30, JSON.stringify(s));
        const before = (s.phase!.x + s.phase!.y) / 2, best = (s.bestCrop!.phase.x + s.bestCrop!.phase.y) / 2;
        assert.equal(s.applied, best <= 0.75 * before, 'the crop decision follows the 25% rule'); assert.equal(s.applied, false);
        assert.equal(lv.tiles[0]!.crop, undefined);
      } else assert.equal(h.stripes, undefined);
    }
  }
  // the old provisional sets are kept as they were (the old option): four tiles a level (the art session's newest set), no heal
  for (const id of ['fairway', 'putting-green']) for (const b of TILE_BANDS) { const lv = tiledFamily(id)!.levels[b]; assert.equal(lv.tiles.length, 4); assert.equal(lv.heal, undefined); }
});

test("T191 (#497): the fringe (new) and the putting green's v2 MID and FAR ship as made; the old families keep the sets they shipped", () => {
  const fam = (id: string) => TILED_FAMILIES.find(f => f.id === id)!;
  const fr = fam('fringe'), v2 = fam('putting-green-v2'), old = fam('putting-green'), paint = fam('putting-green-paint');
  assert.ok(fr && v2 && old && paint);
  assert.equal(fr.name, 'Fringe'); assert.equal(fr.kind, 'grass'); assert.equal(fr.provisional, true);
  for (const l of ['near', 'mid', 'far'] as const) {
    const L = fr.levels[l];
    assert.equal(L.tiles.length, 4, `fringe ${l}: four tiles`);
    assert.match(L.folder, new RegExp(`eight-tiles/fringe/${l}-v1$`));
    assert.deepEqual(L.tiles.map(t => t.source!.split('/').pop()), ['tile-01.png', 'tile-02.png', 'tile-03.png', 'tile-04.png'], 'the exported tiles, never a repair input');
    assert.equal(L.heal!.method, 'finished-set-as-made'); assert.ok(L.heal!.before.lr <= 1.25 * L.heal!.before.h && L.heal!.before.tb <= 1.25 * L.heal!.before.v, `fringe ${l}: within 1.25x the inside`);
  }
  for (const l of ['mid', 'far'] as const) {
    const L = v2.levels[l];
    assert.match(L.folder, new RegExp(`eight-tiles/putting-green/${l}-v2$`)); assert.equal(L.tiles.length, 4); assert.equal(L.heal!.method, 'finished-set-as-made');
    assert.ok(L.heal!.before.lr <= 1.25 * L.heal!.before.h && L.heal!.before.tb <= 1.25 * L.heal!.before.v, `v2 ${l}: within 1.25x the inside`);
  }
  assert.equal(v2.levels.near.tiles[0]!.sha256, paint.levels.near.tiles[0]!.sha256, "v2's NEAR is the owner's putting-green painting");
  // T191 brought them in on every green surface; the owner tunes which surface wears which in Studio › Painted (#513 put the green back on
  // putting-green): the range's target greens resolve to a known family and the fringe surface to the fringe
  const S = clampSurfaces(surfacesFile);
  assert.ok(knownFamily(lookOfTex('preset:range-green', S)!.family)); assert.equal(lookOfTex('golfFringe', S)!.family, S.surfaces.fringe!.family);
  // the old families: pinned to the sets they shipped (the old option), never the v2 sets
  assert.match(old.levels.mid.folder, /putting-green\/mid-v1$/); assert.match(old.levels.far.folder, /putting-green\/far-v1$/); assert.match(paint.levels.mid.folder, /putting-green\/mid-v1$/);
});
