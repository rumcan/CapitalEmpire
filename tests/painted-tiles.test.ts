// T145 (#300) and T150 (#315): the hand-painted terrain tile sets. The owner's rules (2026-10-26) as checks: only the art handoff's primary
// tiles ship, hash-bound to its canonical selections; three authored sets chosen by the camera's zoom band with hysteresis; each set one world
// size, native at its anchor zoom (NEAR the closest zoom, MID the mid reference's camera, FAR the furthest zoom), never magnified at any zoom or
// DPR, a real zoom inside a band; stable world-anchored whole-tile placement that panning, resizing and a reload never change; tiles edge to
// edge without gaps at chunk borders; no mirror, turn or blend; separate gameplay layers; a stale chunk never keeps an old set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  ANCHORS, TILES, TILED_FAMILIES, TILES_REVISION, TILE_BANDS, anchorAt, bandAt, bandOf, bandsAhead, cellOf, cellsIn, coverageOf, nextBand, snappedCell,
  specBand, specDpr, tiledFamily, tileIndex, tileKey, tilePermutation, tileScreenPx, tileSize, tileSpec,
} from '../src/game/painted-tiles';
import { FAMILIES, clampLook, familyById, resolveFamily } from '../src/game/painted-families';
import { clampSurfaces, lookOfTex } from '../src/game/painted-surfaces';
import { chunkLayers, pictureCurrent, type ChunkPictures } from '../src/game/ground-layers';
import { grassZoomLevels } from '../src/game/painted-grass-lod';
import { CHUNK_H, CHUNK_W, LEVELS, MID_H, MID_LEVELS, MID_W, PLAN_H, PLAN_LEVELS, PLAN_W, ZOOM_MAX, ZOOM_MIN, mulberry, worldX, worldY } from '../src/game/iso';
import { DRAW_ORDER, layerCode } from '../src/game/ext/course-walls';
import { SURF } from '../src/game/ext/course-grid';
import { PRESETS } from '../src/game/paint-presets';
import surfacesFile from '../src/game/painted-surfaces.json';

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

test('the manifest ships only the ready families\' primary tiles: four a level, three authored sets each, files at native size', () => {
  assert.deepEqual(TILED_FAMILIES.map(f => f.materialId), ['painted:golden-fescue', 'painted:lake']);
  const ids = { 'golden-fescue': { near: ['tile-01', 'tile-03', 'tile-06', 'tile-08'], mid: ['tile-01', 'tile-02', 'tile-03', 'tile-04'], far: ['tile-01', 'tile-02', 'tile-03', 'tile-04'] }, lake: { near: ['tile-01', 'tile-02', 'tile-03', 'tile-04'], mid: ['tile-01', 'tile-02', 'tile-03', 'tile-04'], far: ['tile-01', 'tile-02', 'tile-03', 'tile-04'] } } as const;
  const sets = { 'golden-fescue': { near: 'near-v3', mid: 'mid-v2', far: 'far-v4' }, lake: { near: 'near-v1', mid: 'mid-v1', far: 'far-v1' } } as const;
  for (const f of TILED_FAMILIES) {
    const files = new Set<string>();
    for (const b of TILE_BANDS) {
      const lv = f.levels[b];
      assert.deepEqual(lv.tiles.map(t => t.id), ids[f.id as keyof typeof ids][b], `${f.id} ${b}: the primary tile ids, in order (never the extras)`);
      assert.equal(lv.revision, sets[f.id as keyof typeof sets][b]);
      assert.equal(lv.native[0] > lv.native[1], true);
      for (const t of lv.tiles) {
        assert.equal(t.file, `tiles/${f.id}/${b}/${t.id}.webp`); assert.match(t.sha256, /^[0-9a-f]{64}$/); files.add(t.file);
        assert.deepEqual(webpSize(fs.readFileSync(path.join(PAINTED, t.file))), lv.native, `${t.file} keeps its native ${lv.native.join('x')}`);
      }
    }
    assert.equal(files.size, 12, `${f.id}: twelve distinct pictures: NEAR, MID and FAR are separate paintings, never one another's mips`);
  }
  assert.deepEqual(tiledFamily('lake')!.levels.mid.native, [1744, 900], 'sizes read from the selection, never assumed');
  // nothing else sits in the tiles folder: no proofs, extras, raw outputs or held versions
  const shipped = fs.readdirSync(path.join(PAINTED, 'tiles'), { recursive: true }).map(String).filter(p => p.endsWith('.webp') || p.endsWith('.png')).map(p => 'tiles/' + p.replace(/\\/g, '/')).sort();
  assert.deepEqual(shipped, TILED_FAMILIES.flatMap(f => TILE_BANDS.flatMap(b => f.levels[b].tiles.map(t => t.file))).sort());
  // the revision is the selections' hashes
  assert.equal(TILES_REVISION, sha256(TILED_FAMILIES.map(f => f.selection.sha256).join(':')).slice(0, 12));
  for (const f of TILED_FAMILIES) assert.equal(f.revision, f.selection.sha256.slice(0, 12));
});

test('the manifest is hash-bound to READY-MATERIALS and the canonical selections (when the art is on this PC)', t => {
  if (!ART) { t.skip('no art checkout here'); return; }
  const readyBuf = fs.readFileSync(path.join(ART, READY_REL)), ready = JSON.parse(readyBuf.toString());
  assert.equal(TILES.source.sha256, sha256(readyBuf), 'the manifest was made from this READY-MATERIALS');
  assert.deepEqual(ready.ready.map((r: { id: string }) => r.id), TILED_FAMILIES.map(f => f.materialId), 'every ready family and only those');
  for (const r of ready.ready) {
    const f = TILED_FAMILIES.find(x => x.materialId === r.id)!, selBuf: Buffer = fs.readFileSync(path.join(ART, r.canonicalSelection.file)), sel = JSON.parse(selBuf.toString());
    assert.equal(sha256(selBuf), r.canonicalSelection.sha256); assert.equal(f.selection.sha256, r.canonicalSelection.sha256);
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
});

test('the anchors (T150): NEAR at the closest zoom, MID at the mid reference\'s camera, FAR at the furthest zoom; how each was found is recorded', () => {
  assert.deepEqual(TILE_BANDS, ['near', 'mid', 'far']);
  assert.equal(ANCHORS.near, ZOOM_MAX, 'the near reference was taken at the closest zoom'); assert.equal(ANCHORS.far, ZOOM_MIN, 'FAR is native at the furthest zoom');
  assert.equal(ANCHORS.mid, 0.1, 'the mid reference\'s camera'); assert.ok(ANCHORS.far < ANCHORS.mid && ANCHORS.mid < ANCHORS.near);
  assert.deepEqual(TILE_BANDS.map((_, b) => anchorAt(b)), [ANCHORS.near, ANCHORS.mid, ANCHORS.far]);
  assert.deepEqual(ANCHORS.zoom, [ZOOM_MIN, ZOOM_MAX]);
  assert.ok(ANCHORS.hysteresis > 1 && ANCHORS.hysteresis <= 1.1, 'a few % of hysteresis'); assert.ok(ANCHORS.preload > ANCHORS.hysteresis);
  for (const b of TILE_BANDS) assert.ok(ANCHORS.how[b].length > 40, `${b}: how its anchor was found`);
  // a fresh start: the coarsest set not magnified at the zoom
  assert.equal(bandAt(ZOOM_MAX), 0); assert.equal(bandAt(0.2), 0); assert.equal(bandAt(0.1001), 0); assert.equal(bandAt(0.1), 1); assert.equal(bandAt(0.05), 1);
  assert.equal(bandAt(ZOOM_MIN * 1.001), 1); assert.equal(bandAt(ZOOM_MIN), 2);
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
    assert.deepEqual(tileSize(lv, tileSpec(b, 1)), tileSize(lv, tileSpec(nextBand(a, b), 1)));
  }
  assert.equal(tiledFamily('golden-fescue')!.levels.near.native[0], 1742);
  // FAR at the furthest zoom on a 1920 x 1080 CSS view: its native 1742 x 902 px, so 1.10 x 1.20 tiles at DPR 1 and 2.20 x 2.40 at DPR 2
  const far = tiledFamily('golden-fescue')!.levels.far;
  for (const dpr of [1, 2]) { const c = coverageOf(1920, 1080, ZOOM_MIN, tileSize(far, tileSpec(2, dpr))); assert.ok(Math.abs(c.across - 1920 * dpr / 1742) < 1e-6 && Math.abs(c.down - 1080 * dpr / 902) < 1e-6); }
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
    for (const a of [ANCHORS.near, ANCHORS.mid, ANCHORS.far]) for (const k of [0.97, 0.999, 1, 1.001, 1.03]) frame(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, a * k)));
    assert.ok(Math.abs(worst - 1) < 1e-9, `${f.id} dpr ${dpr}: native is reached (${worst}) and never passed`);
  }
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
    assert.ok(switches[0]!.z <= ANCHORS.mid / ANCHORS.hysteresis && switches[0]!.z > ANCHORS.mid / ANCHORS.hysteresis / 1.006, `NEAR to MID just past MID's anchor (${switches[0]!.z})`);
    assert.equal(switches[1]!.z, ZOOM_MIN, 'MID to FAR at the furthest zoom, FAR\'s anchor');
  }
});

test('band hysteresis: zooming out a coarser set takes over a few % past its anchor, zooming in the finer one at once; a resting camera never flips', () => {
  const H = ANCHORS.hysteresis, m = ANCHORS.mid;
  assert.equal(nextBand(m, 0), 0, 'out: NEAR shrinks a little past MID\'s anchor'); assert.equal(nextBand(m / H * 1.001, 0), 0); assert.equal(nextBand(m / H, 0), 1, 'out: then MID');
  assert.equal(nextBand(m, 1), 1, 'in: MID up to its anchor (native)'); assert.equal(nextBand(m * 1.0001, 1), 0, 'in: past it NEAR at once, MID never magnified');
  assert.equal(nextBand(ZOOM_MIN * 1.0001, 1), 1); assert.equal(nextBand(ZOOM_MIN, 1), 2, 'out: FAR at the furthest zoom (its anchor: no room below it)');
  assert.equal(nextBand(ZOOM_MIN * 1.0001, 2), 1, 'in: FAR is left at once');
  assert.equal(nextBand(ZOOM_MIN, 0), 2, 'a jump from NEAR to the overview: FAR'); assert.equal(nextBand(0.05, 0), 1); assert.equal(nextBand(0.25, 2), 0, 'a jump in from FAR: NEAR');
  // jitter round MID's anchor and its switch: at most one switch, no flipping
  // (FAR is native at the furthest zoom itself, so it shows only there: a camera moving off the limit leaves it at once, never magnified)
  for (const [z0, amp, start] of [[m, 0.03, 0], [m, 0.03, 1], [m / H, 0.01, 0], [m / H, 0.01, 1]] as const) {
    let b: number = start, flips = 0;
    for (let i = 0; i < 300; i++) { const z = z0 * (1 + amp * Math.sin(i * 0.7)); const n = nextBand(z, b); if (n !== b) flips++; b = n; }
    assert.ok(flips <= 1, `${flips} flips round ${z0} from ${start}`);
  }
  // a camera resting on an anchor stays in one band frame after frame
  for (const [z, b] of [[m, 0], [m, 1], [m / H, 1], [ZOOM_MIN, 2], [ZOOM_MAX, 0]] as const) { let s: number = b; for (let i = 0; i < 50; i++) s = nextBand(z, s); assert.equal(s, nextBand(z, b)); }
  // a bad saved band is ignored; a saved band inside the hysteresis is kept (a reload lays the same tiles)
  assert.equal(nextBand(0.2, 99), bandAt(0.2)); assert.equal(nextBand(0.2, null), bandAt(0.2)); assert.equal(nextBand(0.2, 1.5), bandAt(0.2));
  assert.equal(nextBand(m * 0.98, 0), 0); assert.equal(nextBand(m * 0.98, null), 1);
});

test('the next set is decoded ahead once the camera nears its switch, and only then', () => {
  const P = ANCHORS.preload, m = ANCHORS.mid;
  assert.deepEqual(bandsAhead(ZOOM_MAX, 0), []); assert.deepEqual(bandsAhead(m * P * 1.01, 0), []); assert.deepEqual(bandsAhead(m * P * 0.99, 0), [1]);
  assert.deepEqual(bandsAhead(m / P * 1.01, 1), [0], 'MID near its anchor: NEAR ahead'); assert.deepEqual(bandsAhead(0.03, 1), []);
  assert.deepEqual(bandsAhead(ZOOM_MIN * P * 0.99, 1), [2], 'MID near the furthest zoom: FAR ahead'); assert.deepEqual(bandsAhead(ZOOM_MIN, 2), [1]);
  // whenever a switch happens, the set switched to was ahead on the frame before
  let b: number | null = 0, ahead: number[] = [];
  for (const z of [...Array.from({ length: 900 }, (_, i) => ZOOM_MAX / 1.005 ** i).filter(z => z > ZOOM_MIN), ZOOM_MIN, ...Array.from({ length: 900 }, (_, i) => ZOOM_MIN * 1.005 ** i).filter(z => z < ZOOM_MAX)]) {
    const n = nextBand(z, b); if (n !== b) assert.ok(ahead.includes(n), `${b} -> ${n} at ${z}: decoded ahead`); b = n; ahead = bandsAhead(z, b);
  }
});

test('placement is world-anchored and stable: pan and resize never change a tile; every neighbour differs; no mirror or turn exists', () => {
  for (const f of TILED_FAMILIES) for (const b of TILE_BANDS) {
    const perm = tilePermutation(f.id, b);
    assert.deepEqual([...perm].sort(), [0, 1, 2, 3], 'a permutation of the four whole tiles'); assert.deepEqual(tilePermutation(f.id, b), perm, 'seeded: the same every time');
    for (let iy = -6; iy < 6; iy++) for (let ix = -6; ix < 6; ix++) {
      const me = tileIndex(perm, ix, iy);
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) assert.notEqual(tileIndex(perm, ix + dx!, iy + dy!), me, `${f.id} ${b} (${ix},${iy})+(${dx},${dy})`);
    }
  }
  // the tile under a world point depends on the point, the band and the DPR only (T150: the DPR is part of a set's world size): the same for
  // any camera position and window
  const fam = tiledFamily('golden-fescue')!, x = 1030.4, y = 977.9, X = worldX(x, y), Y = worldY(x, y);
  for (const z of [0.3, 0.12, 0.05, 0.02, 0.006]) for (const dpr of [1, 1.5, 2]) {
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

test('the tile sets join the families, laid as authored; fescue, water, the map grass and rivers wear them; town lawns, course turf and every legacy family are unchanged', () => {
  for (const id of ['golden-fescue', 'lake']) {
    const f = familyById(id)!; assert.ok(f.tiled);
    assert.deepEqual(clampLook({ family: id, version: 'v9', scale: 2, tint: '#ff0000', tone: 0.4 }), { family: id, version: null, scale: 1, tint: '#ffffff', tone: 0 }, 'no scale, tint or tone over the art');
    const r = resolveFamily({ family: id, version: null, scale: 1 })!; assert.ok(r.tiled);
    assert.notEqual(r.near.file, r.mid.file); assert.notEqual(r.mid.file, r.far.file);
  }
  assert.equal(familyById('golden-fescue')!.kind, 'grass'); assert.equal(familyById('lake')!.kind, 'water');
  for (const id of ['emerald-short', 'sage-medium', 'straw-long', 'water-pond', 'sand-raked', 'underground-earth', 'first-painted']) { assert.ok(familyById(id) && !familyById(id)!.tiled, id); assert.ok(clampLook({ family: id, version: null, scale: 1, tint: '#ffffff', tone: 0 }), id); }
  assert.equal(FAMILIES.filter(f => f.tiled).length, TILED_FAMILIES.length);
  const S = clampSurfaces(surfacesFile);
  assert.equal(lookOfTex('golfFescue', S)!.family, 'golden-fescue'); assert.equal(lookOfTex('preset:fescue', S, PRESETS)!.family, 'golden-fescue');
  for (const t of ['waterDark', 'waterDeep', 'waterClear']) assert.equal(lookOfTex(t, S)!.family, 'lake', t);
  // the map's open grass draws golden fescue and rivers draw lake (the owner, 2026-10-26: "all the map water and grass needs to be replaced
  // aswell"; main 003153a); the course turf keeps its families
  assert.equal(lookOfTex('water', S)!.family, 'lake', 'rivers and creeks draw the lake');
  for (const t of ['grass', 'meadow']) assert.equal(lookOfTex(t, S)!.family, 'golden-fescue', `the map's ${t}`);
  for (const t of ['golfRough', 'golfFairway', 'golfGreen']) assert.ok(!familyById(lookOfTex(t, S)!.family)!.tiled, `${t} keeps its family`);
  for (const l of S.lawns) assert.ok(!familyById(l.family)!.tiled, 'no town lawn wears fescue');
  assert.deepEqual(S.surfaces.fescue, { family: 'golden-fescue', version: null, scale: 1, tint: '#ffffff', tone: 0 });
  assert.deepEqual(S.surfaces.water, { family: 'lake', version: null, scale: 1, tint: '#ffffff', tone: 0 });
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
