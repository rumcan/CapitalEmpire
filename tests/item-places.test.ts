// T171 (#400; P25): items know their place. Per item the samples place often enough, its anchors (the main building's front, back and sides, the
// kerb, a fence line, a paved edge, else a free spot) and its places along them (lots/places.ts), and per kind its rows; the generator lays a known
// item at one of its anchors and a row as a row (lot-gen.ts); model v4 ships them; a v1, v2 or v3 town composes exactly as before. Headless.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { anchorOf, buildPlaces, emptyPlaces, learnPlaces, placesData, placesFrom, placesOf, pointAt, rowOf, type PlaceLot } from '../src/game/lots/places';
import { generateLayout } from '../src/game/lots/lot-gen';
import { buildModel, sampleItem, type Box, type ItemKind, type Sample, type SectorLot } from '../src/game/lots/learn';
import { compose, lotPresets, lotModelVersion, setGeneratedLots, setLotModel, type ComposeState, type LotGeom } from '../src/game/lots/compose';
import { LATEST, LOT_MODELS } from '../src/game/lots/lot-models';
import { groupsFrom } from '../src/game/lots/group-data';
import { modelFile } from '../src/game/dev/dev-save';
import { mulberry } from '../src/game/iso';
import { LU, LV } from '../src/game/lots/town';
import type { PresetUse } from '../src/game/lots/presets';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); };
/** a lot of 16 x 20 with a 8 x 6 building, its front 6 tiles from the street, and a drive on its right */
const H: Box = [4, 6, 12, 12], DRIVE: Box = [13, 0, 15, 12];
const LOT: PlaceLot = { w: 16, d: 20, house: H, paved: [DRIVE] };
const SL: SectorLot = { w: 16, d: 20, house: H, drives: [[13, 0, 15, 0, 15, 12, 13, 12]] };
/** a sample of that lot: items kept where they stand */
const sample = (id: string, items: { id: string; kind: ItemKind; x: number; y: number }[]): Sample => ({ id, at: '', src: 'preset', ctx: { use: 'com', state: 'built', w: 16, d: 20, road: 0, house: 'x', cls: 'medium', hw: 8, hd: 6, hb: H, paved: [DRIVE] }, items: items.map(i => sampleItem(SL, i.id, i.kind, i.x, i.y, true)) });
const pools = { tree: [], bush: ['town:fern', 'town:hydrangea'], flowerbed: [], prop: ['world:bench', 'town:dumpster'], car: [], decal: [] } as Record<ItemKind, string[]>;
const half = () => ({ ha: 0.4, hb: 0.4 });

describe('items know their place (T171)', () => {
  it('1. a point\'s anchor and back: the front, the back, the sides, the kerb, the fences, a paved edge, a free spot', () => {
    const pts: [number, number, string][] = [[8, 4.5, 'front'], [8, 13, 'back'], [2.5, 9, 'left'], [12.3, 9, 'right'], [8, 0.4, 'kerb'], [0.5, 15, 'fence-l'], [15.5, 16, 'fence-r'], [8, 19.4, 'fence-b'], [14, 13, 'paved-b'], [7, 16, 'free']];
    for (const [x, y, a] of pts) {
      const r = anchorOf(LOT, x, y);
      assert.equal(r.a, a, `${x}, ${y}`);
      const p = pointAt(LOT, r.a, r.along, r.off, r.p ?? 0)!;
      assert.ok(Math.abs(p.x - x) < 1e-9 && Math.abs(p.y - y) < 1e-9, `${a} round trip`);
    }
    assert.equal(pointAt({ ...LOT, house: null }, 'front', 0.5, 1), null, 'no building, no front');
  });
  it('2. anchors learnt from samples: a bench by the door lands in front of the door; a dumpster behind the building lands behind it', () => {
    const ss = Array.from({ length: 12 }, (_, k) => sample(`s${k}`, [{ id: 'world:bench', kind: 'prop', x: 7 + (k % 3), y: 5 }, { id: 'town:dumpster', kind: 'prop', x: 9 + (k % 2), y: 13.5 }]));
    const t = buildPlaces(ss), b = placesOf(t, 'world:bench')!, d = placesOf(t, 'town:dumpster')!;
    assert.equal(b[0]!.a, 'front'); assert.ok(b[0]!.w > 0.9);
    assert.equal(d[0]!.a, 'back');
    let benches = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const L = generateLayout({ lot: SL, cls: 'medium', model: buildModel(ss), taken: [H], pools, half, seed, minOne: false, kinds: { bush: 0, tree: 0, flowerbed: 0, decal: 0, car: 0, prop: 0.6 }, places: { t, lot: LOT } });
      for (const it of L) {
        if (it.id === 'world:bench') { benches++; assert.ok(it.y < H[1] && it.y > H[1] - 1.6 && it.x > H[0] && it.x < H[2], `bench at ${it.x.toFixed(2)}, ${it.y.toFixed(2)}: before the door`); }
        if (it.id === 'town:dumpster') assert.ok(it.y > H[3] && it.y < H[3] + 2.5, `dumpster at ${it.y.toFixed(2)}: behind`);
      }
    }
    assert.ok(benches > 10, `${benches} benches laid`);
  });
  it('3. a hedge row learnt along the back fence runs along it, a spacing apart', () => {
    const ss = Array.from({ length: 10 }, (_, k) => sample(`h${k}`, Array.from({ length: 8 }, (_, i) => ({ id: i % 2 ? 'town:fern' : 'town:hydrangea', kind: 'bush' as const, x: 2 + 1.5 * i + 0.1 * (k % 3), y: 19.3 }))));
    const t = buildPlaces(ss), r = rowOf(t, 'bush', 'fence-b')!;
    assert.ok(r && r.share > 0.9 && Math.abs(r.gap - 1.5) < 0.05 && r.len >= 7, JSON.stringify(r));
    let rows = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const L = generateLayout({ lot: SL, cls: 'medium', model: buildModel(ss), taken: [H], pools, half, seed, minOne: false, kinds: { bush: 0.57, tree: 0, flowerbed: 0, decal: 0, car: 0, prop: 0 }, places: { t, lot: LOT } });
      const back = L.filter(it => it.kind === 'bush' && it.y > 18.4).sort((a, b) => a.x - b.x);
      if (back.length >= 4) { rows++; for (let i = 1; i < back.length; i++) assert.ok(Math.abs(back[i]!.x - back[i - 1]!.x - 1.5) < 0.2, `spacing ${(back[i]!.x - back[i - 1]!.x).toFixed(2)}`); }
      assert.deepEqual(L, generateLayout({ lot: SL, cls: 'medium', model: buildModel(ss), taken: [H], pools, half, seed, minOne: false, kinds: { bush: 0.57, tree: 0, flowerbed: 0, decal: 0, car: 0, prop: 0 }, places: { t, lot: LOT } }), 'the same seed, the same layout');
    }
    assert.ok(rows >= 10, `${rows} of 20 lots with a row along the back fence`);
  });
  it('4. places as data read back the same; an item seen fewer than 5 times keeps its kind\'s sectors', () => {
    const t = emptyPlaces();
    for (let k = 0; k < 6; k++) learnPlaces(t, LOT, [{ id: 'a', kind: 'prop', x: 8, y: 4.5, kept: true }, ...(k < 3 ? [{ id: 'b', kind: 'prop' as const, x: 8, y: 13, kept: true }] : [])]);
    assert.ok(placesOf(t, 'a')); assert.equal(placesOf(t, 'b'), null);
    assert.deepEqual(placesData(placesFrom(placesData(t))), placesData(t));
  });
  it('5. v4 is the latest: its houses\' counts, pairs and densities are v3\'s, it carries places, and the model file writes them back the same', () => {
    assert.equal(LATEST, 4);
    const v3 = LOT_MODELS[3] as Record<string, unknown>, v4 = LOT_MODELS[4] as Record<string, unknown>;
    for (const k of ['counts', 'anchors', 'pairs', 'density']) assert.deepEqual(v4[k], v3[k], k);
    const back = JSON.parse(modelFile(9, v4, 'test')!);
    assert.deepEqual(back.places, v4.places);
    assert.deepEqual(groupsFrom(back), groupsFrom(v4));
  });
  // (T202: the pinned hashes here followed the owner's presets, sizes and removals, and skipped since they changed: the rules they stood for)
  it('6. a v1, v2 or v3 town composes with its own model: the same every time, whatever another version composed meanwhile; a use its model does not generate draws its frozen preset as ?oldlots', () => {
    const LUOF: Record<string, number> = { res: LU.RES, com: LU.COM, park: LU.COM, ind: LU.IND, tour: LU.TOUR, civic: LU.GOV };
    const frozen = (use: string) => lotPresets().filter(p => p.use === use && !p.curated && !p.approved && !p.whole && !p.derived && p.road === undefined);
    const lotsOf = (use: PresetUse, n: number) => { const list = frozen(use), N = [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 }], r = mulberry(0x169); return Array.from({ length: n }, (_, i) => { const p = list[Math.floor(r() * list.length)]!, nn = N[i % 4]!; return { use, g: { o: { x: 300 + 50 * (i % 20), y: 300 + 50 * Math.floor(i / 20) }, u: { x: -nn.y, y: nn.x }, n: nn, w: p.w, d: p.d } as LotGeom, st: { use: LUOF[use]!, level: p.state === 'upgraded' ? LV.UPGRADED : LV.BUILT, decline: p.state === 'declined' ? 2 : 0, seed: i, preset: p.id } as ComposeState }; }); };
    const lots = (['res', 'com', 'ind', 'park', 'civic', 'tour'] as const).flatMap(u => lotsOf(u, 8)), was = lotModelVersion();
    const at = (v: number, gen = true) => { setGeneratedLots(gen); setLotModel(v); const out = lots.map(l => fnv(JSON.stringify(compose(l.g, l.st)))); setGeneratedLots(true); return out; };
    try {
      const first = [1, 2, 3].map(v => at(v));
      // the same every time, and after the other versions composed (no version leaks into another)
      assert.deepEqual([3, 2, 1].map(v => at(v)).reverse(), first);
      const old = at(LATEST, false);
      for (const v of [1, 2, 3]) {
        const groups = groupsFrom(LOT_MODELS[v]) as Record<string, { on?: boolean } | undefined>;
        lots.forEach((l, i) => {
          if (l.use === 'res') return;
          const g = l.use === 'com' ? 'com' : l.use === 'ind' ? 'ind' : 'open';
          if (!groups[g]?.on) assert.equal(first[v - 1]![i], old[i], `v${v} ${l.use}: not generated, its frozen preset as ?oldlots`);
        });
      }
      // the houses' taste came with v2: a v1 town's house lots are laid without it
      const res = lots.map((l, i) => (l.use === 'res' ? i : -1)).filter(i => i >= 0);
      assert.ok(res.some(i => first[0]![i] !== first[1]![i]), 'v1 and v2 lay the house lots differently');
    } finally { setLotModel(was); setGeneratedLots(true); }
  });
});
