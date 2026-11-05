// T342 (#970): start in Autumn or Desert (saved with the game; an old save is autumn); a desert game's holes plant desert plants (never an
// ordinary tree) while the player can still place every tree by hand; one Trees menu (no Palms brush) with an All / Autumn / Desert filter;
// and (the owner's add-on) damp dirt along the world's water in the desert.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP } from '../src/game/iso';
import { readSave, setSaveStore, upgradeSave, writeSave, type SaveV5 } from '../src/game/save';
import { CELL_T, SURF, makeGrid, paintDisc, paintStroke } from '../src/game/ext/course-grid';
import { cartLanes, frameHole, FRAME_TREE_IDS, type FrameSite, type Pt } from '../src/game/golf/holeframe';
import { DESERT_HOLE_IDS, DESERT_HOLE_SETS, desertFrameTree, desertHolePlant, desertPlantIds, isDesertHolePlant } from '../src/game/desert-planting';
import { PLANT_FILTERS, PLANT_KINDS, plantPool } from '../src/game/plant';
import { LIBRARY } from '../src/game/library';
import { REMOVED_IDS } from '../src/game/lots/scales';
import { DESERT_DIRT, DESERT_GROUND } from '../src/game/desert-theme';
import { DESERT_BANK_M, desertBank, influence, livingSignature } from '../src/game/living-ground';

const BY = new Map(LIBRARY.map(it => [it.id, it] as const));
const removed = new Set(REMOVED_IDS);
/** an ordinary (autumn) tree: the library's trees, the conifers and broadleaves the frames and the town plant */
const ordinary = (id: string) => BY.get(id)?.kind === 'tree';

test('a new game with Desert saves its theme and loads it; a save from before T342 loads as autumn', async () => {
  const mem = new Map<string, ArrayBuffer>();
  setSaveStore({ get: async (k: string) => mem.get(k), put: async (k: string, v: ArrayBuffer) => { mem.set(k, v); }, del: async (k: string) => { mem.delete(k); }, keys: async () => [...mem.keys()] } as never);
  const base: SaveV5 = { version: 5, map: MAP, seed: 7, segs: [], nodes: [], props: [], money: 900, day: 1, cam: { X: 0, Y: 0, z: 0.2 } } as unknown as SaveV5;
  await writeSave({ ...base, theme: 'desert' });
  const r = await readSave();
  assert.equal(r.status, 'ok'); assert.equal(r.save?.theme, 'desert');
  await writeSave({ ...base, theme: 'autumn' });
  assert.equal((await readSave()).save?.theme, 'autumn');
  // an old save has no theme: the engine reads anything but 'desert' as autumn
  const old = upgradeSave({ version: 5, map: MAP, seed: 3, segs: [], nodes: [], props: [], money: 0, day: 1, cam: { X: 0, Y: 0, z: 0.2 } } as never)!;
  assert.equal(old.theme, undefined);
  assert.notEqual(old.theme, 'desert');
});

/** one par 4 on a grid as New hole lays it (rough corridor, fairway, tee, green) and its frame site */
function holeSite(desert: boolean): FrameSite {
  const g = makeGrid(0, 0, 640, 320), line: Pt[] = [{ x: 60, y: 80 }, { x: 260, y: 80 }];
  paintStroke(g, 60, 80, 260, 80, 15, SURF.rough, 1, 0); paintStroke(g, 80, 80, 248, 80, 8, SURF.fairway, 1, 0);
  paintDisc(g, 60, 80, 4, SURF.tee, 1, 0); paintDisc(g, 260, 80, 7, SURF.green, 1, 0);
  return {
    hole: 1, seed: 1234, line, others: [], lanes: cartLanes([{ hole: 1, tee: line[0]!, pin: line[1]! }], null),
    grid: { x0: g.x0, y0: g.y0, w: g.w, h: g.h, surf: i => g.surf[i]!, hole: i => g.hole[i]! },
    ok: (x, y) => x > 10 && y > 10 && x < g.w * CELL_T - 10 && y < g.h * CELL_T - 10, desert,
  };
}

test('a hole framed in a desert game holds no ordinary tree: palms, desert trees, cacti, shrubs and rocks, sized by their owner sizes', () => {
  const autumn = frameHole(holeSite(false)).trees, desert = frameHole(holeSite(true)).trees;
  assert.ok(autumn.length > 20, `the autumn frame plants trees (${autumn.length})`);
  assert.ok(autumn.every(t => FRAME_TREE_IDS.includes(t.id)));
  // the same clumps at the same spots, only the plants differ
  assert.deepEqual(desert.map(t => [t.x, t.y, t.clump]), autumn.map(t => [t.x, t.y, t.clump]));
  for (const t of desert) { assert.ok(!ordinary(t.id), `${t.id} is no ordinary tree`); assert.ok(isDesertHolePlant(t.id), t.id); assert.ok(t.scale > 0); }
  const kinds = new Set(desert.map(t => DESERT_HOLE_SETS.find(s => s.ids.includes(t.id))!.name));
  assert.ok(kinds.has('palm') && kinds.size >= 3, `a mix of desert sets: ${[...kinds].join(', ')}`);
  // deterministic
  assert.deepEqual(frameHole(holeSite(true)).trees, desert);
});

test('the desert hole sets are library art, never an ordinary tree; a saved hole\'s trees turn desert by their spot', () => {
  assert.ok(DESERT_HOLE_IDS.length > 30);
  for (const id of DESERT_HOLE_IDS) { assert.ok(BY.has(id), `${id} is in the library`); assert.ok(!removed.has(id)); assert.ok(!ordinary(id), id); }
  for (let u = 0; u < 1; u += 0.013) assert.ok(isDesertHolePlant(desertHolePlant(u)));
  const t = desertFrameTree({ id: FRAME_TREE_IDS[0]!, x: 10.5, y: 20.25, scale: 1.1, flip: true });
  assert.ok(isDesertHolePlant(t.id)); assert.equal(t.flip, false); assert.equal(t.x, 10.5);
  assert.deepEqual(desertFrameTree({ id: FRAME_TREE_IDS[0]!, x: 10.5, y: 20.25, scale: 1.1 }).id, t.id);
  const palm = DESERT_HOLE_IDS[0]!; assert.equal(desertFrameTree({ id: palm, x: 1, y: 2, scale: 0.7 }).id, palm);
});

test('one Trees menu: no Palms brush; the palms are among the Trees; every ordinary tree can still be placed by hand in either filter but Desert', () => {
  assert.deepEqual(PLANT_KINDS.map(k => k.kind), ['trees', 'bushes', 'flowers']);
  assert.deepEqual(PLANT_FILTERS.map(f => f.id), ['all', 'autumn', 'desert']);
  const all = plantPool(LIBRARY, 'trees').map(p => p.id), autumn = plantPool(LIBRARY, 'trees', 'autumn').map(p => p.id), desert = plantPool(LIBRARY, 'trees', 'desert').map(p => p.id);
  // manual placement still offers the ordinary trees (All and Autumn), and All has the desert ones and the palms too
  for (const it of LIBRARY) if (it.kind === 'tree') { assert.ok(all.includes(it.id), it.id); assert.ok(autumn.includes(it.id), it.id); }
  assert.ok(desert.length > 5 && desert.every(id => all.includes(id) && !ordinary(id)), 'the desert trees are among All, none ordinary');
  assert.ok(desert.some(id => /palm/.test(id)) && desert.some(id => /joshua|acacia/.test(id)) && desert.some(id => /saguaro/.test(id)), 'palms, desert trees and tall cacti');
  assert.ok(!autumn.some(id => /palm/.test(id)), 'Autumn has no palm');
});

test('the Desert filter lists the desert bushes and flowers (T289 art); Autumn keeps today\'s', () => {
  for (const kind of ['bushes', 'flowers'] as const) {
    const d = plantPool(LIBRARY, kind, 'desert').map(p => p.id), a = plantPool(LIBRARY, kind, 'autumn').map(p => p.id);
    assert.ok(d.length >= 5, `${kind}: ${d.length} desert plants`);
    for (const id of d) assert.ok(BY.get(id)!.cat.startsWith('Desert:') || id.startsWith('kit:palm-'), `${id} is desert art`);
    assert.ok(a.length > 0 && a.every(id => !BY.get(id)!.cat.startsWith('Desert:')), `${kind}: Autumn has no desert art`);
    assert.deepEqual([...desertPlantIds(kind)].filter(id => BY.has(id)).sort(), [...d].sort());
  }
  assert.ok(plantPool(LIBRARY, 'flowers').some(p => p.id === 'town:hydrangea'));
});

test('the desert ground: near the world\'s water the ground maps to dirt, breaking up outward into blotches; the course\'s water and autumn as before', () => {
  assert.equal(DESERT_GROUND.lush!.family, DESERT_DIRT, 'the lush channel is laid as dirt in the desert');
  // a river along y = 50 (tiles), 8 tiles wide
  const river = { pts: [{ x: 0, y: 50, w: 8 }, { x: 120, y: 50, w: 8 }], bank: 2.6 };
  const box: [number, number, number, number] = [0, 0, 120, 120], src = { casters: new Float32Array(0), rivers: [river] };
  const dry = influence(box, 1, src), wet = influence(box, 1, { ...src, desert: true });
  const at = (g: typeof dry, x: number, y: number) => g.lush[(Math.floor(y) - g.iy0) * g.w + (Math.floor(x) - g.ix0)]!;
  // at the bank (2 m past it): whole dirt in the desert, on every sample along it
  let bank = 1; for (let x = 5; x < 115; x++) bank = Math.min(bank, at(wet, x, 50 + 4 + 2.6 + 1));
  assert.ok(bank > 0.9, `dirt all along the bank (${bank.toFixed(2)})`);
  // the band's outer edge breaks up: between 12 and 30 m out some samples are dirt and some sand
  const mid: number[] = []; for (let x = 0; x < 120; x++) for (const dy of [7, 8, 9, 10, 11]) mid.push(at(wet, x, 50 + 4 + 2.6 + dy) - at(dry, x, 50 + 4 + 2.6 + dy));
  assert.ok(mid.some(v => v > 0.5) && mid.some(v => v < 0.1), 'a blotchy, noise-broken edge, never a smooth band');
  // far out (past the blotches) nothing changes; the desert adds dirt, never takes it away
  for (let x = 0; x < 120; x += 7) assert.ok(Math.abs(at(wet, x, 110) - at(dry, x, 110)) < 1e-6);
  for (let q = 0; q < wet.lush.length; q++) assert.ok(wet.lush[q]! >= dry.lush[q]! - 1e-6);
  // the course's water (a shore with no ring) keeps its look: no damp dirt
  const course = { casters: new Float32Array(0), shores: [{ pts: [10, 10, 60, 10, 60, 30, 10, 30, 10, 10] }] };
  assert.deepEqual(influence(box, 1, { ...course, desert: true }).lush, influence(box, 1, course).lush);
  // deterministic, and the bake's signature tells the desert from the autumn
  assert.equal(desertBank(31.5, 70.25, 20), desertBank(31.5, 70.25, 20));
  assert.equal(desertBank(31.5, 70.25, DESERT_BANK_M * 3), 0);
  assert.notEqual(livingSignature(1, src), livingSignature(1, { ...src, desert: true }));
});
