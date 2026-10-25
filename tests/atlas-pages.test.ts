// Atlas page residency (T080, src/game/atlas-pages.ts): the plan stays inside GAME-PLAN 2.3's atlas budget at every dpr, the cells the view
// wants become resident at the mip it needs, a full tier evicts its least recently wanted cell and never one drawn this frame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AtlasPages, BORDER, GRID, MB, atlasBudget, chainBytes, neededLevel, planAtlas, rectBytes, slotRect, unitOf, type PageLoad, type PageWant } from '../src/game/atlas-pages';
import { atlasMip0 } from '../src/game/sizes';
import { ZOOM_MAX } from '../src/game/iso';
import { ATLAS_PAGES, ATLAS_SIZE } from '../src/game/library';

const PAGES = ATLAS_PAGES.length, SIZE = ATLAS_SIZE, LEVELS = ATLAS_PAGES[0]!.length;
const plan = (dpr: number, bpp = 1, pages = PAGES) => planAtlas({ pages, size: SIZE, levels: LEVELS, bpp, budget: atlasBudget(dpr) * bpp, finest: atlasMip0(dpr) ? 0 : 1 });
const want = (unit: number, level: number, onScreen = true, weight = 1): PageWant => ({ unit, level, onScreen, weight });

/** run update and finish (and upload) every load at once until nothing more is asked (or n rounds) */
function settle(a: AtlasPages, frame: number, wants: PageWant[], rounds = 40) {
  for (let r = 0; r < rounds; r++) {
    const loads: PageLoad[] = a.update(frame, wants, 1 << 12); if (!loads.length) return;
    for (const l of loads) if (a.done(l, true, frame)) a.uploaded(l);
  }
}

test('sizes: blocks, page chains, slots with their borders', () => {
  assert.equal(rectBytes(2048, 2048, 4), 16 * MB);
  assert.equal(rectBytes(2, 2, 1), 16, 'block formats round up to a whole 4 x 4 block');
  assert.equal(chainBytes(2048, 5, 0, 1), (4 + 1 + 0.25 + 0.0625 + 0.015625) * MB);
  const p = plan(2), t0 = p.tiers[0]!;
  assert.equal(p.grid, GRID);
  assert.equal(t0.cell, SIZE / GRID);
  assert.equal(t0.border >> (t0.levels - 1), BORDER, 'one 4 x 4 block of border at the slot\'s coarsest level');
  for (const t of p.tiers) for (let k = 0; k < t.levels; k++) assert.equal((t.slot >> k) % 4, 0, 'every slot level is whole blocks');
  // the slot's source rect: the cell plus its border, in the level's own texels
  const r = slotRect(p, t0, unitOf(3, 1, 2), t0.base);
  assert.deepEqual(r, { x: t0.cell - t0.border, y: 2 * t0.cell - t0.border, w: t0.slot, h: t0.slot, page: 3 });
  const r1 = slotRect(p, t0, unitOf(3, 1, 2), t0.base + 1);
  assert.equal(r1.w, t0.slot >> 1); assert.equal(r1.x, (t0.cell - t0.border) >> 1);
});

test('the plan holds the GAME-PLAN budget at dpr 1, 1.25, 1.5 and 2 (compressed), and the same cells at 4x in RGBA8', () => {
  for (const dpr of [1, 1.25, 1.5, 2]) {
    const p = plan(dpr), b = atlasBudget(dpr);
    assert.ok(p.bytes <= b, `dpr ${dpr}: ${(p.bytes / MB).toFixed(1)} MB over ${(b / MB).toFixed(0)} MB`);
    assert.equal(p.finest, dpr > 1 ? 0 : 1, 'mip 0 only above dpr 1 (sizes.ts atlasMip0)');
    assert.ok(p.lowBase > p.finest && p.lowBytes === PAGES * chainBytes(SIZE, LEVELS, p.lowBase, 1), 'every page has an always-resident low mip');
    assert.ok(p.tiers.length >= 1 && p.tiers[0]!.base === p.finest, 'a streamed tier reaches the finest mip the screen draws');
    assert.ok(p.tiers.every(t => t.slots > 0 && t.slots <= PAGES * GRID * GRID && t.levels === p.lowBase - t.base));
    const rgba = plan(dpr, 4);
    assert.deepEqual(rgba.tiers.map(t => t.slots), p.tiers.map(t => t.slots), 'the RGBA8 fallback keeps the same slots');
    assert.equal(rgba.bytes, p.bytes * 4);
  }
  // the bench city at the closest zoom draws 129 cells of 23 pages on a 1600 x 900 screen: all of them get mip 0 on a hi-dpi screen
  assert.ok(plan(2).tiers[0]!.slots >= 160, `only ${plan(2).tiers[0]!.slots} mip-0 cells`);
  assert.ok(plan(1).tiers[0]!.slots >= 160, `only ${plan(1).tiers[0]!.slots} mip-1 cells at dpr 1`);
  // a bigger art set still fits (the low set grows, the slots shrink)
  for (const pages of [80, 160]) for (const dpr of [1, 2]) { const p = plan(dpr, 1, pages); assert.ok(p.bytes <= atlasBudget(dpr), `${pages} pages dpr ${dpr}: ${(p.bytes / MB).toFixed(1)} MB`); }
  // a GL with only the minimum 256 array layers
  const small = planAtlas({ pages: PAGES, size: SIZE, levels: LEVELS, bpp: 1, budget: atlasBudget(2), finest: 0, maxLayers: 256 });
  assert.ok(small.tiers.every(t => t.slots <= 256));
});

test('the needed level: mip 0 at the closest zoom above dpr 1, mip 1 at dpr 1, coarser further out', () => {
  const p2 = plan(2), p1 = plan(1);
  assert.equal(neededLevel(ZOOM_MAX, 2, p2), 0);
  assert.equal(neededLevel(ZOOM_MAX, 1.25, plan(1.25)), 0, 'dpr 1.25 needs 0.375 device px per display px: more than mip 1 holds');
  assert.equal(neededLevel(ZOOM_MAX, 1, p1), 1);
  assert.equal(neededLevel(ZOOM_MAX / 2, 2, p2), 1);
  assert.equal(neededLevel(ZOOM_MAX / 4, 2, p2), 2);
  assert.equal(neededLevel(0.001, 2, p2), LEVELS - 1);
});

test('the cells the view wants become resident at the mip they need; near cells stop one mip coarser', () => {
  const a = new AtlasPages(plan(2)), lowBase = a.plan.lowBase;
  for (let u = 0; u < a.units; u++) assert.equal(a.levelOf(u), lowBase, 'before any streaming every cell draws from the low set');
  const A = unitOf(3, 0, 0), B = unitOf(7, 3, 3), C = unitOf(11, 2, 1);
  settle(a, 1, [want(A, 0), want(B, 0), want(C, 1, false)]);
  assert.equal(a.levelOf(A), 0); assert.equal(a.levelOf(B), 0);
  assert.equal(a.levelOf(C), 1, 'a near cell gets mip 1, not mip 0');
  assert.equal(a.levelOf(unitOf(20, 0, 0)), lowBase, 'an unwanted cell stays on the low set');
  // the shader code points at the slot holding the cell
  const c = AtlasPages.decode(a.lookup[A]!); assert.equal(c.tier, 1); assert.equal(c.level, 0);
  assert.equal(AtlasPages.decode(a.lookup[C]!).tier, 2, 'the near cell sits in the mip-1 tier');
  assert.ok(a.takeLookup()); assert.equal(a.takeLookup(), null, 'the lookup is only handed over when it changed');
  // the near cell comes on screen: it moves to a mip-0 slot
  settle(a, 2, [want(C, 0)]);
  assert.equal(a.levelOf(C), 0);
});

test('a cell sharpens coarse to fine, one level at a time, and is not asked for again before its upload lands', () => {
  const a = new AtlasPages(plan(2)), u = unitOf(5, 1, 1), w = [want(u, 0)];
  const [first] = a.update(1, w); assert.equal(first!.level, a.plan.lowBase - 1);
  assert.ok(a.done(first!, true));
  assert.equal(a.update(2, w).length, 0, 'still busy until the upload lands');
  a.uploaded(first!); assert.equal(a.levelOf(u), a.plan.lowBase - 1);
  const levels: number[] = [first!.level];
  for (let r = 0; r < 10; r++) for (const l of a.update(3 + r, w)) { levels.push(l.level); if (a.done(l, true)) a.uploaded(l); }
  assert.deepEqual(levels, Array.from({ length: a.plan.lowBase }, (_, i) => a.plan.lowBase - 1 - i));
  assert.equal(a.levelOf(u), 0);
});

test('LRU: a full tier evicts the least recently wanted cell, never one wanted this frame', () => {
  const p = planAtlas({ pages: 8, size: SIZE, levels: LEVELS, bpp: 1, budget: 24 * MB, finest: 0 }), a = new AtlasPages(p), n = p.tiers[0]!.slots;
  assert.ok(n >= 4 && n < 8 * GRID * GRID, `${n} slots`);
  // fill the mip-0 tier with cells 0 .. n-1, cell i last wanted at frame i + 1
  for (let i = 0; i < n; i++) settle(a, i + 1, [want(i, 0)]);
  assert.deepEqual(a.unitsIn(0).sort((x, y) => x - y), Array.from({ length: n }, (_, i) => i));
  // cell 0 wanted again: now cell 1 is the oldest
  settle(a, n + 1, [want(0, 0)]);
  settle(a, n + 2, [want(n + 10, 0)]);
  assert.ok(a.unitsIn(0).includes(n + 10) && a.unitsIn(0).includes(0) && !a.unitsIn(0).includes(1), 'cell 1 (the least recently wanted) went');
  assert.equal(a.levelOf(1), a.plan.lowBase, 'an evicted cell draws from the low set again');
  // the next eviction takes cell 2
  settle(a, n + 3, [want(n + 11, 0)]);
  assert.ok(!a.unitsIn(0).includes(2) && a.unitsIn(0).includes(3));
  // every cell of the tier wanted this frame: a new one gets no mip-0 slot (it goes to the coarser tier instead)
  const now = n + 4, held = a.unitsIn(0), wants = held.map(u => want(u, 0)).concat([want(n + 12, 0)]);
  settle(a, now, wants);
  assert.deepEqual(a.unitsIn(0).sort(), held.sort(), 'no cell drawn this frame was evicted');
  assert.equal(a.levelOf(n + 12), 1, 'the cell with no mip-0 slot draws from mip 1 meanwhile');
  assert.equal(a.stats.starved, 0);
});

test('on-screen cells come before near ones, and the bigger share of the screen first, when slots run short', () => {
  const p = planAtlas({ pages: 8, size: SIZE, levels: LEVELS, bpp: 1, budget: 24 * MB, finest: 0 }), a = new AtlasPages(p), n = p.tiers[0]!.slots;
  const near = Array.from({ length: n }, (_, i) => want(i, 0, false, 100)), big = want(n + 1, 0, true, 50), small = want(n + 2, 0, true, 1);
  const extra = Array.from({ length: n - 1 }, (_, i) => want(n + 3 + i, 0, true, 10));
  settle(a, 1, [...near, small, ...extra, big]);
  const held = a.unitsIn(0);
  assert.ok(held.includes(big.unit), 'the on-screen cell with the most pixels got a mip-0 slot');
  assert.ok(!held.includes(small.unit), 'the smallest on-screen cell waits when the tier is full');
  assert.ok(near.every(w => !held.includes(w.unit)), 'near cells give way to cells on screen');
});

test('the slot count never exceeds the plan, and a load for an evicted slot is dropped', () => {
  const p = planAtlas({ pages: 8, size: SIZE, levels: LEVELS, bpp: 1, budget: 3 * MB, finest: 1 }), a = new AtlasPages(p);
  const first = a.update(1, [want(2, 1)]);
  assert.equal(first.length, 1);
  // flood every tier so cell 2 is evicted before its load comes back
  for (let f = 2; f < 2 + 8 * GRID * GRID; f++) settle(a, f, [want(10 + f, 1)]);
  assert.equal(a.done(first[0]!, true), false, 'the stale load is not uploaded');
  a.uploaded(first[0]!);
  assert.equal(a.levelOf(2), p.lowBase);
  a.usage().forEach((n, t) => assert.ok(n <= p.tiers[t]!.slots));
});

test('a failed load is retried later, not every frame', () => {
  const a = new AtlasPages(plan(2)), w = [want(9, 0)];
  const [l] = a.update(10, w); assert.ok(l); assert.equal(a.done(l!, false, 10), false);
  assert.equal(a.update(11, w).length, 0, 'no retry right away');
  assert.equal(a.update(200, w).length, 1, 'retried later');
});
