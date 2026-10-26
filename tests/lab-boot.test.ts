// The lot lab's light boot (T157, src/game/boot.ts and src/game/dev/lab-boot.ts): the game's boot options stay what the engine always did,
// only ?lotlab on a dev build boots light, the lab's map box holds the lab street at every road angle, the camera clamp is the old one for the
// game, the flat map is plain ground, the cached pack filter keeps what a light worker uses, and the lab's atlas plan keeps mip-0 cells.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_BOOT, GROUND_LEVERS, boxView, clampCentre, flatTerrain, lightPack, withGroundLevers } from '../src/game/boot';
import { LAB_BOX, LAB_EAGER_PHOTOS, LAB_ZOOM_MIN, bootFor, labBoot, labBox } from '../src/game/dev/lab-boot';
import { HH, HW, MAP, ZOOM_MIN, worldX, worldY } from '../src/game/iso';
import { HS, TC } from '../src/game/terrain/types';
import { MB, planAtlas } from '../src/game/atlas-pages';
import { EAGER_PHOTO } from '../src/game/grass-art';

test('the game boots as it always did: every option at the engine\'s old value', () => {
  assert.deepEqual({ ...GAME_BOOT }, {
    // T166 (#370): one ground worker, its textures made on first use (the grass tints up front), no texture cache read or written
    kind: 'game', groundWorkers: 1, sim: true, atlasMB: null, atlasKeep: null, groundPx: 48e6, tileSources: null, paintedSources: null, eagerPhotos: null,
    saveTextureCache: false, readTextureCache: false, softCanvases: false, lazyTextures: true, lazyTints: false, box: null, zoomMin: null, trees: true, moneyFloats: true, save: true, map: 'valley',
  });
  assert.ok(Object.isFrozen(GAME_BOOT));
});

test('T166: a dev build\'s ?ground=<levers> boots the game with exactly those ground levers on; old is the game before T166', () => {
  const old = withGroundLevers({ ...GAME_BOOT }, 'old');
  // before T166: a worker per spare core (null: the engine's 1 to 3), every texture up front, the cache read and written, GPU canvases
  assert.deepEqual({ groundWorkers: old.groundWorkers, lazyTextures: old.lazyTextures, softCanvases: old.softCanvases, saveTextureCache: old.saveTextureCache, readTextureCache: old.readTextureCache },
    { groundWorkers: null, lazyTextures: false, softCanvases: false, saveTextureCache: true, readTextureCache: true });
  // the kept levers are what GAME_BOOT has on
  assert.deepEqual(withGroundLevers({ ...GAME_BOOT }, 'lazy,one'), { ...GAME_BOOT });
  // one at a time; unknown names ignored; two after one wins
  assert.equal(withGroundLevers({ ...GAME_BOOT }, 'soft').softCanvases, true); assert.equal(withGroundLevers({ ...GAME_BOOT }, 'soft').lazyTextures, false);
  assert.equal(withGroundLevers({ ...GAME_BOOT }, 'lazy,one,two').groundWorkers, 2); assert.deepEqual(withGroundLevers({ ...GAME_BOOT }, 'lazy,one,nonsense'), { ...GAME_BOOT });
  assert.deepEqual(Object.keys(GROUND_LEVERS).sort(), ['cache', 'lazy', 'one', 'soft', 'two']);
  // only a dev build reads it, and never for the lab
  assert.deepEqual(bootFor('?ground=old', false), { ...GAME_BOOT }, 'a build ignores ?ground');
  assert.equal(bootFor('?ground=old', true).groundWorkers, null); assert.equal(bootFor('?ground=old', true).lazyTextures, false);
  assert.equal(bootFor('?lotlab&ground=old', true).kind, 'lab'); assert.equal(bootFor('?lotlab&ground=old', true).groundWorkers, 1);
});

test('only ?lotlab on a dev build boots light', () => {
  assert.equal(bootFor('?lotlab&dev', true).kind, 'lab');
  assert.equal(bootFor('?dev&lotlab', true).kind, 'lab');
  assert.equal(bootFor('?lotlab&dev', false).kind, 'game', 'a build never boots light');
  assert.equal(bootFor('', true).kind, 'game');
  assert.equal(bootFor('?dev', true).kind, 'game');
  assert.equal(bootFor('?bench=1', true).kind, 'game');
  assert.equal(bootFor('?lotlab&dev&fullboot', true).kind, 'game', 'the lab on the whole game, as before, to compare');
  assert.deepEqual(bootFor('?dev', true), { ...GAME_BOOT });
});

test('the light boot: one ground worker, no city worker, no trees or save, a small atlas and decode caches', () => {
  const b = labBoot();
  assert.equal(b.groundWorkers, 1);
  assert.equal(b.sim, false);
  assert.equal(b.trees, false);
  assert.equal(b.save, false);
  assert.equal(b.moneyFloats, false);
  assert.equal(b.map, 'flat');
  assert.equal(b.saveTextureCache, false, 'the browser cache holds one pack, the game\'s: the lab only reads it');
  assert.ok(b.atlasMB! > 0 && b.atlasMB! <= 32);
  assert.ok(b.atlasKeep! >= 1 && b.atlasKeep! < 6);
  assert.ok(b.groundPx < GAME_BOOT.groundPx);
  assert.ok(b.tileSources! >= 8, 'two tile-set families (the grass and a lawn) at one band: 4 tiles each');
  assert.ok(b.paintedSources! >= 4);
  assert.ok(b.zoomMin! >= ZOOM_MIN && b.zoomMin === LAB_ZOOM_MIN);
  for (const p of b.eagerPhotos!) assert.ok(EAGER_PHOTO.has(p), `${p} is one of the game's eager photos`);
  assert.ok(b.eagerPhotos!.includes('chipSeal'), 'a lot\'s concrete is the chip seal mosaic (renderer.ts), laid without asking');
  assert.deepEqual(b.box, labBox());
});

test('the lab box holds the lab street, its lot and the neighbours at every road angle', () => {
  // engine.ts stageLab: the street through the flat map's start block's centre, LEG tiles each way along D (an axis, or a diagonal on odd roads)
  const t = flatTerrain(), R = { x: t.start.x + t.start.size / 2, y: t.start.y + t.start.size / 2 }, LEG = 90, DEEP = 110, ALONG = 80, b = labBox();
  assert.equal(b[2] - b[0], LAB_BOX); assert.equal(b[3] - b[1], LAB_BOX);
  const h = Math.SQRT1_2, S = [{ x: 0, y: 1 }, { x: h, y: h }, { x: 1, y: 0 }, { x: h, y: -h }, { x: 0, y: -1 }, { x: -h, y: -h }, { x: -1, y: 0 }, { x: -h, y: h }];
  for (let road = 0; road < 8; road++) {
    const s = S[road]!, n = { x: -s.x, y: -s.y }, u = { x: -n.y, y: n.x }, D = road % 2 ? { x: Math.round(u.x / h), y: Math.round(u.y / h) } : u;
    const inside = (p: { x: number; y: number }, m: number, what: string) => assert.ok(p.x > b[0] + m && p.x < b[2] - m && p.y > b[1] + m && p.y < b[3] - m, `road ${road}: ${what} (${p.x.toFixed(0)}, ${p.y.toFixed(0)}) in the box`);
    // the street's ends, with room to see past them
    for (const k of [-1, 1]) inside({ x: R.x + k * LEG * D.x, y: R.y + k * LEG * D.y }, 20, 'the street end');
    // the lots: the lab lot at the middle, two neighbours each way along (ALONG tiles at most from the middle), three across; DEEP tiles deep either side
    for (const a of [-ALONG, ALONG]) for (const side of [-1, 1]) inside({ x: R.x + a * u.x + side * DEEP * n.x, y: R.y + a * u.y + side * DEEP * n.y }, 0, 'a lot far corner');
  }
});

test('the camera clamp: the game\'s is the old whole-map one; a box keeps the centre over it', () => {
  const old = (X: number, Y: number) => ({ X: Math.min(MAP * HW, Math.max(-MAP * HW, X)), Y: Math.min(MAP * HH * 2, Math.max(0, Y)) });
  for (const [X, Y] of [[0, 0], [-1e9, 1e9], [1e9, -5], [12345, 67890], [-MAP * HW - 1, MAP * HH * 2 + 1]] as [number, number][]) assert.deepEqual(clampCentre(X, Y, null), old(X, Y));
  const b = labBox(), v = boxView(b), c = { x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2 };
  assert.deepEqual(clampCentre(worldX(c.x, c.y), worldY(c.x, c.y), b), { X: worldX(c.x, c.y), Y: worldY(c.x, c.y) }, 'a centre inside stays');
  const far = clampCentre(-1e9, 1e9, b);
  assert.deepEqual(far, { X: v.X0, Y: v.Y1 });
  // the box's corners in world px: its view spans them all
  for (const [x, y] of [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]]) { const X = worldX(x!, y!), Y = worldY(x!, y!); assert.ok(X >= v.X0 && X <= v.X1 && Y >= v.Y0 && Y <= v.Y1); }
});

test('the flat map: plain ground everywhere, flat, no water or towns, its start block at the centre', () => {
  const t = flatTerrain();
  assert.equal(t.cls.length, MAP * MAP); assert.equal(t.height.length, HS * HS);
  assert.ok(t.cls.every(c => c === TC.GROUND)); assert.ok(t.height.every(h => h === 0));
  assert.deepEqual(t.waters, []); assert.deepEqual(t.towns, []); assert.deepEqual(t.chokepoints, []);
  assert.equal(t.start.x + t.start.size / 2, MAP / 2); assert.equal(t.start.y + t.start.size / 2, MAP / 2);
});

test('a light worker\'s cached pack: the eager photos it builds and the rest of the pack, without the photos and the lazy textures it skips', () => {
  const keep = lightPack(EAGER_PHOTO, new Set(LAB_EAGER_PHOTOS), new Set(['water', 'meadow']));
  for (const n of ['mosaic:base:0', 'mosaic:lit1:2', 'mosaic:lot:0', 'mosaic:chipSeal:0', 'photo:chipSeal', 'photo:dirt', 'mip:grass@0.3', 'mip:dirt@0.45', 'slabs', 'leaves', 'photo:preset:first-cut', 'mosaic:preset:first-cut:1'])
    assert.ok(keep(n), `${n} kept`);
  for (const n of ['mosaic:golfFairway:0', 'photo:golfFairway', 'photo:waterDark', 'mosaic:field:3', 'mip:water@0.3', 'mip:meadow@0.035'])
    assert.ok(!keep(n), `${n} left out`);
  const lazy = lightPack(EAGER_PHOTO, new Set(LAB_EAGER_PHOTOS), new Set(), true);
  assert.ok(lazy('photo:chipSeal') && !lazy('mosaic:chipSeal:0') && lazy('mosaic:base:0') && lazy('mosaic:preset:first-cut:0'), 'lazy mosaics: only the sources of the eager photos');
  const all = lightPack(EAGER_PHOTO, EAGER_PHOTO);
  for (const n of ['photo:golfFairway', 'mip:water@0.3', 'mosaic:base:0']) assert.ok(all(n), `${n}: nothing is left out without a light boot's sets`);
});

test('the lab\'s atlas: within its budget, every page resident at a coarse mip, cells to stream at mip 0', () => {
  for (const bpp of [1, 4]) {
    const b = labBoot().atlasMB! * MB * bpp, p = planAtlas({ pages: 65, size: 2048, levels: 5, bpp, budget: b, finest: 0 });
    assert.ok(p.bytes <= b, `bpp ${bpp}: ${p.bytes} <= ${b}`);
    assert.ok(p.lowBase <= 4);
    const t0 = p.tiers.find(t => t.base === 0);
    assert.ok(t0 && t0.slots >= 16, `bpp ${bpp}: ${t0?.slots} mip-0 slots, enough for a lot's sprites at the closest zoom`);
  }
});
