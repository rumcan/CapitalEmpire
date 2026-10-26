// T145 (#300): the hand-painted terrain tile sets. The owner's rules (2026-10-26) as checks: only the art handoff's primary tiles ship,
// hash-bound to its canonical selections; three authored sets chosen by the camera's zoom band with hysteresis; two to four whole tile areas in
// view, switching before more than four; a few large FAR tiles on the overview; stable world-anchored whole-tile placement that panning,
// resizing, the device pixel ratio and a reload never change; tiles edge to edge without gaps at chunk borders; no mirror, turn or blend;
// separate gameplay layers; a stale chunk never keeps an old set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  STEPS, TILES, TILED_FAMILIES, TILES_REVISION, TILE_BANDS, bandOf, cellOf, cellsIn, coverageOf, nextStep, snappedCell, stepAt, tiledFamily,
  tileIndex, tileKey, tilePermutation, tileSize,
} from '../src/game/painted-tiles';
import { FAMILIES, clampLook, familyById, resolveFamily } from '../src/game/painted-families';
import { clampSurfaces, lookOfTex } from '../src/game/painted-surfaces';
import { chunkLayers, pictureCurrent, type ChunkPictures } from '../src/game/ground-layers';
import { grassZoomLevels } from '../src/game/painted-grass-lod';
import { CHUNK_H, CHUNK_W, LEVELS, MAP, MID_H, MID_LEVELS, MID_W, PLAN_H, PLAN_LEVELS, PLAN_W, PLANNER_Z, DISTRICT_Z, ZOOM_MAX, ZOOM_MIN, worldX, worldY } from '../src/game/iso';
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
const [VW, VH] = TILES.coverage.refViewport, H = TILES.coverage.hysteresis;
const areasAt = (fam: string, step: number, z: number, vw = VW, vh = VH) => coverageOf(vw, vh, z, tileSize(tiledFamily(fam)!.levels[bandOf(step)], step)).areas;

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

test('the coverage ladder: steps sqrt(2) apart cover the whole zoom range, each band its own set, NEAR street, MID district, FAR overview', () => {
  assert.equal(STEPS[0]!.zHi >= ZOOM_MAX, true); assert.equal(STEPS[STEPS.length - 1]!.zLo <= ZOOM_MIN, true);
  for (let k = 1; k < STEPS.length; k++) {
    assert.equal(STEPS[k]!.zHi, STEPS[k - 1]!.zLo, 'contiguous');
    assert.ok(Math.abs(STEPS[k]!.tileW / STEPS[k - 1]!.tileW - Math.SQRT2) < 0.001, 'each step a fixed world size, sqrt(2) the last');
    assert.ok(TILE_BANDS.indexOf(STEPS[k]!.band) >= TILE_BANDS.indexOf(STEPS[k - 1]!.band), 'bands in order near, mid, far');
  }
  assert.equal(bandOf(stepAt(ZOOM_MAX)), 'near'); assert.equal(bandOf(stepAt(0.2)), 'near'); assert.equal(bandOf(stepAt(DISTRICT_Z * 0.9)), 'mid');
  assert.equal(bandOf(stepAt(0.06)), 'mid'); assert.equal(bandOf(stepAt(PLANNER_Z * 0.85)), 'far'); assert.equal(bandOf(stepAt(ZOOM_MIN)), 'far');
  for (const b of TILE_BANDS) assert.ok(STEPS.some(s => s.band === b));
});

test('two to four whole tile areas at every zoom on the reference viewport, never more than four; a few large FAR tiles on the overview', () => {
  for (const fam of ['golden-fescue', 'lake']) {
    // with no history (a fresh start): 2 to 4 (to rounding)
    for (let z = ZOOM_MAX; z >= ZOOM_MIN; z /= 1.013) { const a = areasAt(fam, stepAt(z), z); assert.ok(a >= 1.99 && a <= 4.02, `${fam} z ${z}: ${a}`); }
    // zooming out then in through the whole range with the hysteresis: never more than four, never under 2 / H^2
    let k: number | null = null, minA = Infinity, maxA = 0;
    const walk = (z: number) => { k = nextStep(z, k); const a = areasAt(fam, k, z); minA = Math.min(minA, a); maxA = Math.max(maxA, a); };
    for (let z = ZOOM_MAX; z >= ZOOM_MIN; z /= 1.01) walk(z);
    for (let z = ZOOM_MIN; z <= ZOOM_MAX; z *= 1.01) walk(z);
    assert.ok(maxA <= 4.02, `${fam}: at most four tile areas (${maxA})`); assert.ok(minA >= 2 / (H * H) - 0.02, `${fam}: ${minA}`);
  }
  // the overview: the whole map in view, FAR tiles about a quarter of the map's width each
  const far = STEPS[stepAt(ZOOM_MIN)]!, mapW = 2 * MAP * 64;
  assert.equal(far.band, 'far'); assert.ok(mapW / far.tileW > 1 && mapW / far.tileW < 4, `${(mapW / far.tileW).toFixed(2)} FAR tiles across the map`);
  assert.ok(areasAt('golden-fescue', stepAt(ZOOM_MIN), ZOOM_MIN) <= 4);
});

test('band hysteresis: zooming out switches at the far end, zooming in only past the near end, and a camera resting at a boundary never flips', () => {
  const k = 3, b = STEPS[k]!.zLo; // the boundary between step 3 and step 4 (a band edge: NEAR-MID is 2|3, MID-FAR 6|7)
  assert.equal(nextStep(b * 1.001, k), k); assert.equal(nextStep(b, k), k + 1, 'out: at the boundary (four tile areas)');
  assert.equal(nextStep(b * 1.05, k + 1), k + 1, 'in: held past the boundary'); assert.equal(nextStep(b * H * 1.001, k + 1), k, 'in: past the hysteresis');
  // jitter round each band boundary: one switch, no flipping
  for (const edge of [2, 6]) {
    const zb = STEPS[edge]!.zLo; let s: number | null = edge, flips = 0;
    for (let i = 0; i < 200; i++) { const z = zb * (1 + 0.03 * Math.sin(i)); const n = nextStep(z, s); if (n !== s) flips++; s = n; }
    assert.ok(flips <= 1, `${flips} flips at the ${bandOf(edge)}/${bandOf(edge + 1)} edge`);
    assert.notEqual(bandOf(edge), bandOf(edge + 1));
  }
  // a camera jump lands on the zoom's own step; a bad saved step is ignored; a saved step inside its hysteresis is kept (a reload lays the same tiles)
  assert.equal(nextStep(0.01, 0), stepAt(0.01)); assert.equal(nextStep(0.2, 99), stepAt(0.2)); assert.equal(nextStep(0.2, null), stepAt(0.2));
  assert.equal(nextStep(STEPS[5]!.zHi * 1.03, 5), 5); assert.equal(nextStep(STEPS[5]!.zHi * 1.03, null), 4);
});

test('placement is world-anchored and stable: pan, resize and DPR never change a tile; every neighbour differs; no mirror or turn exists', () => {
  for (const f of TILED_FAMILIES) for (const b of TILE_BANDS) {
    const perm = tilePermutation(f.id, b);
    assert.deepEqual([...perm].sort(), [0, 1, 2, 3], 'a permutation of the four whole tiles'); assert.deepEqual(tilePermutation(f.id, b), perm, 'seeded: the same every time');
    for (let iy = -6; iy < 6; iy++) for (let ix = -6; ix < 6; ix++) {
      const me = tileIndex(perm, ix, iy);
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) assert.notEqual(tileIndex(perm, ix + dx!, iy + dy!), me, `${f.id} ${b} (${ix},${iy})+(${dx},${dy})`);
    }
  }
  // the tile under a world point depends on the point and the step only: the same for any camera position, window and DPR
  const fam = tiledFamily('golden-fescue')!, x = 1030.4, y = 977.9, X = worldX(x, y), Y = worldY(x, y);
  for (const z of [0.3, 0.12, 0.05, 0.02, 0.006]) {
    const k = stepAt(z), [w, h] = tileSize(fam.levels[bandOf(k)], k), cell = cellOf(X, Y, w, h);
    for (const dpr of [1, 1.5, 2]) { assert.equal(stepAt(z), k, 'the step never reads the dpr'); assert.ok(grassZoomLevels(z, dpr).rasterL > 0); }
    for (const [vw, vh] of [[1920, 1080], [1280, 720], [2560, 1440], [800, 1200]]) {
      // the view's rectangle anywhere around the point: the point's cell and tile are the same
      for (const pan of [-3000, 0, 4567]) { const X0 = X + pan - vw / 2 / z, Y0 = Y - pan - vh / 2 / z; const c = cellsIn(X0, Y0, X0 + vw / z, Y0 + vh / z, w, h).find(q => q.ix === cell[0] && q.iy === cell[1]); if (X >= X0 && X < X0 + vw / z && Y >= Y0 && Y < Y0 + vh / z) assert.ok(c); }
    }
  }
  // native aspect kept in the world: a tile's world size is the step's width by the level's own aspect (never squashed to the 2:1 diamond)
  for (const k of [0, 5, 11]) for (const f of TILED_FAMILIES) { const lv = f.levels[bandOf(k)], [w, h] = tileSize(lv, k); assert.ok(Math.abs(w / h - lv.native[0] / lv.native[1]) < 1e-9); }
  assert.equal(TILES.display.minVisibleTiles, 2); assert.equal(TILES.display.maxVisibleTiles, 4);
  assert.deepEqual({ m: (TILES.display as Record<string, unknown>).allowMirror, r: (TILES.display as Record<string, unknown>).allowRotate }, { m: false, r: false });
});

test('whole tiles butt edge to edge at every chunk border and cache level: snapped edges are shared, never a gap or an overlap', () => {
  const tiers: [number, number, readonly number[]][] = [[CHUNK_W, CHUNK_H, LEVELS], [MID_W, MID_H, MID_LEVELS], [PLAN_W, PLAN_H, PLAN_LEVELS]];
  for (const [cw, ch, levels] of tiers) for (const L of levels) {
    // a chunk's origin is a whole number of px at its level, so every chunk rounds a tile edge to the same global px
    assert.ok(Math.abs(cw * L - Math.round(cw * L)) < 1e-9 && Math.abs(ch * L - Math.round(ch * L)) < 1e-9, `${cw}x${ch} @ ${L}`);
    for (const k of [0, 4, 9]) {
      const [w, h] = tileSize(tiledFamily('lake')!.levels[bandOf(k)], k);
      for (let i = -3; i < 3; i++) {
        const a = snappedCell(i, i, w, h, L), r = snappedCell(i + 1, i, w, h, L), d = snappedCell(i, i + 1, w, h, L);
        assert.equal(a[2], r[0], 'right neighbour shares the edge'); assert.equal(a[3], d[1], 'lower neighbour shares the edge');
        assert.ok(Math.abs((a[2] - a[0]) - w * L) <= 1 && Math.abs((a[3] - a[1]) - h * L) <= 1, 'at most a px from the exact size');
      }
    }
  }
});

test('the tile sets join the families, laid as authored; fescue and water wear them, town grass and every legacy family are unchanged', () => {
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
  assert.equal(lookOfTex('water', S)!.family, 'water-pond', 'rivers and creeks keep the pond water');
  for (const t of ['grass', 'golfRough', 'golfFairway', 'golfGreen', 'meadow']) assert.ok(!familyById(lookOfTex(t, S)!.family)!.tiled, `${t} keeps its family`);
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

test('a stale chunk never keeps an old set: the step is in the chunk key for pictures that laid tiles, and the switch waits, then cuts', () => {
  const pic = (o: Partial<ChunkPictures<string>>): ChunkPictures<string> => ({ tex: 'old', texL: 0.6, texArtL: 0.3, fadeFrom: null, prev: null, texTs: 2, texTiled: true, ...o });
  assert.equal(pictureCurrent(pic({}), 0.6, 0.3, 2), true); assert.equal(pictureCurrent(pic({}), 0.6, 0.3, 3), false, 'a tiled picture at another step is stale');
  assert.equal(pictureCurrent(pic({ texTiled: false }), 0.6, 0.3, 3), true, 'a chunk with no tile set is not baked again for a step');
  assert.equal(pictureCurrent(pic({ tex: null }), 0.6, 0.3, 2), false);
  // while the view waits for the new step: the old set at full strength, never a mix of the two
  let lay = chunkLayers(pic({}), 0.6, 0.3, 0, false, 3); assert.equal(lay.base, 'old'); assert.equal(lay.top, null);
  lay = chunkLayers(pic({ tex: 'new', texTs: 3, fadeFrom: 'old' }), 0.6, 0.3, 0, false, 3); assert.equal(lay.base, 'old'); assert.equal(lay.top, null);
  // once every chunk on screen has it (the engine's cut: zoomBlend 1 at once): the new set alone
  lay = chunkLayers(pic({ tex: 'new', texTs: 3, fadeFrom: 'old' }), 0.6, 0.3, 1, false, 3); assert.equal(lay.base, 'new'); assert.equal(lay.top, null);
  // the workers' composition key carries the revision and the step
  assert.equal(tileKey(4), `${TILES_REVISION}#4`); assert.notEqual(tileKey(4), tileKey(5));
});
