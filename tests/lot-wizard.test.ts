// T158 (#343): the lot wizard's learning (src/game/lots/learn.ts) and generator (src/game/dev/wizard-gen.ts): a sample records every offered
// item with its place relative to the house and the street edge, normalised by the lot, and kept or deleted; the sector of a place is the same
// on every road angle (the lot's own frame); the Beta keep rates move with a few samples and settle with many; the generator draws sectors by
// those rates, keeps every item in its sector and inside the lot, and never overlaps; two people's samples merge. Headless.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildModel, drawSector, formatLearning, keepRate, learn, learningStats, mergeSamples, modelData, modelFrom, parseLearning, PRIOR, readSample, sampleItem, sectorOf, sectorRects, SECTORS, type Box, type Model, type Sample, type SectorLot } from '../src/game/lots/learn';
import { frameOf, toFrame, toWorld } from '../src/game/lots/preset-frame';
import { roadFrame } from '../src/game/dev/lot-derive';
import { generateLayout } from '../src/game/lots/lot-gen';
import { kindOfId, kindPools } from '../src/game/lots/item-kinds';
import { mulberry } from '../src/game/iso';
import { mergeSamples as devMerge, LEARN_PATH } from '../src/game/dev/dev-save';
import FILE from '../src/game/lots/lot-learning.json';
import type { Road } from '../src/game/lots/presets';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

/** a 12 x 18 lot with a 6 x 5 house 4 tiles back in the middle and a drive on the left */
const LOT: SectorLot = { w: 12, d: 18, house: [3, 4, 9, 9], drives: [[1.2, 0, 2.8, 0, 2.8, 8, 1.2, 8]] };
const ctx = { use: 'res' as const, state: 'built' as const, w: 12, d: 18, road: 0 as Road, house: 'world:house_5', cls: 'small' as const, hw: 6, hd: 5 };
const sample = (id: string, items: [string, 'tree' | 'bush' | 'prop' | 'decal', number, number, boolean][]): Sample => ({ id, at: '2026-10-26T00:00:00Z', ctx, items: items.map(([i, k, x, y, kept]) => sampleItem(LOT, i, k, x, y, kept)) });

describe('the lot wizard (T158)', () => {
  it('1. a sample records each offered item: kind, place in the lot and normalised, side of the house and distance from its walls, street distance, sector, kept', () => {
    const t = sampleItem(LOT, 'trees:oak', 'tree', 6, 14, true);
    assert.deepEqual([t.nx, t.ny, t.side, t.house, t.street, t.sector, t.kept], [0.5, 0.778, 'back', 5, 14, 'back', true]);
    const b = sampleItem(LOT, 'bush', 'bush', 10.2, 6, false);
    assert.deepEqual([b.side, b.house, b.sector, b.kept], ['right', 1.2, 'near', false]);
    assert.equal(sampleItem(LOT, 'bin', 'prop', 5, -0.8, true).sector, 'verge');
    assert.equal(sampleItem(LOT, 'car', 'prop', 2, 1, true).sector, 'drive');
    const s = sample('a', [['trees:oak', 'tree', 6, 14, true], ['bush', 'bush', 10.2, 6, false]]);
    assert.deepEqual(readSample(JSON.parse(JSON.stringify(s))), s, 'a sample reads back');
    assert.equal(readSample({ ...s, items: [{ ...s.items[0], kind: 'rocket' }] }), null, 'a bad item makes it invalid');
    // the shipped file is empty: nobody's training data is committed with the code
    assert.equal(parseLearning(FILE).samples.length, 0);
  });
  it('2. sectors: every named sector, in order; the same place is the same sector on every road angle', () => {
    const at = (x: number, y: number) => sectorOf(LOT, x, y);
    assert.deepEqual([at(6, -1), at(0.5, 10), at(11.5, 10), at(6, 17.5), at(6, 10), at(2, 1), at(6, 2), at(6, 14), at(1.5, 6.5), at(10.8, 6.5), at(1.5, 1.5), at(10.8, 2), at(1.5, 14), at(10.8, 14)].map(s => s),
      ['verge', 'fence', 'fence', 'fence', 'near', 'drive', 'front', 'back', 'near', 'right', 'drive', 'front-right', 'back-left', 'back-right']);
    assert.equal(sectorOf({ ...LOT, drives: [] }, 1.5, 1.5), 'front-left');
    assert.equal(sectorOf({ w: 12, d: 18, house: null }, 6, 2), 'front', 'no house: the lot\'s middle third stands in for it');
    // each sector's rectangles hold points of that sector
    for (const s of SECTORS) for (const b of sectorRects(LOT, s)) { if (b[2] - b[0] < 0.1 || b[3] - b[1] < 0.1) continue; const c = sectorOf(LOT, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2); assert.ok(c === s || s === 'near' || ['fence', 'near', 'drive'].includes(c), `${s}: its middle is ${c}`); }
    // a lot on each road angle: a world point of a canonical place goes back to the same place and sector (the frame turns with the street)
    const pts: [number, number][] = [[6, -1], [6, 2], [6, 14], [1.6, 6.5], [10.8, 14], [0.5, 10]];
    for (let r = 0 as Road; r < 8; r = (r + 1) as Road) {
      const f = roadFrame(r), lot = frameOf({ o: { x: 500, y: 600 }, u: f.u, n: f.n, w: 12, d: 18 });
      for (const [x, y] of pts) { const w = toWorld(lot, x, y), q = toFrame(lot, w.x, w.y); assert.equal(sectorOf(LOT, q.x, q.y), sectorOf(LOT, x, y), `road ${r} (${x}, ${y})`); }
    }
  });
  it('3. the Beta keep rates: a half before any sample, a few samples move it, many settle it; learning one sample equals building again', () => {
    let m: Model = new Map();
    assert.equal(keepRate(m, 'small', 'tree', 'back'), PRIOR.a / (PRIOR.a + PRIOR.b));
    const kept = (n: number, k: boolean) => Array.from({ length: n }, (_, i) => sample(`k${k}${i}`, [['trees:oak', 'tree', 6, 14, k]]));
    m = buildModel(kept(3, true));
    assert.ok(keepRate(m, 'small', 'tree', 'back') >= 0.8, 'three kept: past 0.8');
    assert.equal(keepRate(m, 'medium', 'tree', 'back'), 0.5, 'another house class is its own');
    const many = [...kept(70, true), ...kept(30, false)], mm = buildModel(many);
    assert.ok(Math.abs(keepRate(mm, 'small', 'tree', 'back') - 0.7) < 0.01, 'many settle near the share kept');
    const inc = buildModel(many.slice(0, 50)); for (const s of many.slice(50)) learn(inc, s);
    assert.deepEqual([...inc].sort(), [...mm].sort());
  });
  it('4. sectors are drawn by the rates: a kind deleted everywhere but the back is offered mostly there', () => {
    const train: Sample[] = [];
    for (let i = 0; i < 30; i++) train.push(sample(`t${i}`, [['trees:oak', 'tree', 6, 14, true], ['trees:oak', 'tree', 6, 2, false], ['trees:oak', 'tree', 1.5, 14, false], ['trees:oak', 'tree', 10.8, 2, false], ['trees:oak', 'tree', 6, -1, false], ['trees:oak', 'tree', 0.5, 10, false], ['trees:oak', 'tree', 10.5, 6.5, false]]));
    const m = buildModel(train), r = mulberry(11), n: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) { const s = drawSector(m, 'small', 'tree', LOT, r)!; n[s] = (n[s] ?? 0) + 1; }
    assert.ok((n.back ?? 0) > 1000, `the back yard most: ${JSON.stringify(n)}`);
    assert.ok((n.front ?? 0) < 120 && (n.verge ?? 0) < 120, 'the deleted sectors rarely');
    assert.ok((n['back-left'] ?? 0) + (n['back-right'] ?? 0) > 0 || (n.left ?? 0) > 0, 'unseen sectors still tried now and then');
    assert.equal(drawSector(m, 'small', 'tree', LOT, r, new Set(SECTORS)), null, 'nowhere left');
  });
  it('5. the generator: generous, each item in its drawn sector and inside the lot, never over the house, the fences or another item', () => {
    const P = kindPools();
    assert.ok(P.tree.length > 3 && P.bush.length > 3 && P.prop.length > 3 && P.decal.length > 3, `pools: ${Object.entries(P).map(([k, v]) => `${k} ${v.length}`).join(', ')}`);
    const fence: Box = [0, 17.8, 12, 18], half = () => ({ ha: 0.6, hb: 0.6 });
    const train = Array.from({ length: 20 }, (_, i) => sample(`g${i}`, [['b', 'bush', 6, 2, true], ['b', 'bush', 6, 14, false], ['t', 'tree', 6, 14, true], ['t', 'tree', 6, 2, false]]));
    for (const model of [new Map(), buildModel(train)] as Model[]) for (let seed = 1; seed < 15; seed++) {
      const offers = generateLayout({ lot: LOT, cls: 'small', model, taken: [LOT.house!, fence], pools: P, half, seed });
      assert.ok(offers.length >= 14, `generous: ${offers.length} items`);
      const boxes: Box[] = [LOT.house!, fence];
      for (const o of offers) {
        const s = sectorOf(LOT, o.x, o.y);
        assert.ok(o.x >= 0 && o.x <= 12 && o.y >= -1.5 && o.y <= 18, `${o.id} inside`);
        if (o.kind === 'decal') continue;
        const b: Box = [o.x - 0.6, o.y - 0.6, o.x + 0.6, o.y + 0.6];
        assert.ok(b[0] >= -0.02 && b[2] <= 12.02 && b[3] <= 18.02 && (s === 'verge' || b[1] >= -0.02), `${o.id} footprint inside (${s})`);
        assert.ok(!boxes.some(x => Math.min(x[2], b[2]) - Math.max(x[0], b[0]) > 0.11 && Math.min(x[3], b[3]) - Math.max(x[1], b[1]) > 0.11), `${o.kind} at ${o.x},${o.y} overlaps nothing`);
        boxes.push(b);
      }
    }
    // trained (bushes kept in front, deleted behind; trees the other way): the generator follows
    const many = Array.from({ length: 12 }, (_, s) => generateLayout({ lot: LOT, cls: 'small', model: buildModel(train), taken: [LOT.house!], pools: P, half, seed: 100 + s })).flat();
    const where = (k: string, sec: string) => many.filter(o => o.kind === k && sectorOf(LOT, o.x, o.y) === sec).length;
    assert.ok(where('bush', 'front') > where('bush', 'back'), `bushes in front: ${where('bush', 'front')} vs ${where('bush', 'back')}`);
    assert.ok(where('tree', 'back') > where('tree', 'front'), `trees behind: ${where('tree', 'back')} vs ${where('tree', 'front')}`);
    // pure and seeded (P25: the game will compose its lots with it): the same input and seed, the same layout; another seed, another
    const input = { lot: LOT, cls: 'small' as const, model: buildModel(train), taken: [LOT.house!], pools: P, half, seed: 42 };
    assert.deepEqual(generateLayout(input), generateLayout({ ...input }));
    assert.notDeepEqual(generateLayout(input), generateLayout({ ...input, seed: 43 }));
  });
  it('7. P25: samples from the presets (every item kept) and the gallery (a whole lot up or down) share the format; the model ships as data', () => {
    const pre: Sample = { ...sample('preset-1', [['t', 'tree', 6, 14, true], ['b', 'bush', 6, 2, true]]), src: 'preset' };
    const up: Sample = { ...sample('gal-1', [['t', 'tree', 6, 14, true]]), src: 'gallery', verdict: 'up' }, down: Sample = { ...sample('gal-2', [['t', 'tree', 6, 2, true]]), src: 'gallery', verdict: 'down' };
    for (const s of [pre, up, down]) assert.deepEqual(readSample(JSON.parse(JSON.stringify(s))), s);
    assert.equal(readSample({ ...pre, src: 'rumour' }), null); assert.equal(readSample({ ...up, verdict: 'meh' }), null);
    const m = buildModel([pre, up, down]);
    assert.ok(keepRate(m, 'small', 'tree', 'back') > 0.7, 'kept by the preset and the thumbs up');
    assert.equal(keepRate(m, 'small', 'tree', 'front'), 0.5, 'a lot judged down teaches nothing about which item');
    const back = modelFrom(JSON.parse(JSON.stringify(modelData(m))));
    assert.deepEqual([...back].sort(), [...m].sort(), 'the model round-trips as data');
    assert.equal(modelFrom({ counts: { 'x|y': [1, 0], 'small|tree|back': [1, 3] } }).size, 0, 'bad entries dropped');
    // any preset item has a kind (a sprite the generator does not offer gets the nearest one)
    assert.equal(kindOfId('decal:decal-06-orange-leaf-scatter'), 'decal'); assert.equal(kindOfId('no-such-id'), 'prop');
    for (const id of kindPools().tree.slice(0, 3)) assert.equal(kindOfId(id), 'tree');
  });
  it('6. two people\'s samples merge (by id: none lost, none twice); a bad request is refused; the counter\'s trend', () => {
    const a = sample('alice-1', [['t', 'tree', 6, 14, true]]), b = sample('bob-1', [['t', 'tree', 6, 2, false]]);
    let text = formatLearning({ v: 1, samples: [] });
    const m1 = mergeSamples(text, [a]); assert.ok(m1.ok); text = m1.ok ? m1.text : '';
    const m2 = devMerge(text, [b, a]); assert.ok(m2.ok && m2.count === 2, 'the second save keeps the first; a repeat is skipped'); text = m2.ok ? m2.text : '';
    assert.deepEqual(parseLearning(JSON.parse(text)).samples.map(s => s.id), ['alice-1', 'bob-1']);
    assert.equal(mergeSamples(text, [{ id: 'x' }]).ok, false); assert.equal(mergeSamples(text, 'nope').ok, false); assert.equal(mergeSamples('{ broken', []).ok, false);
    assert.ok(mergeSamples('', [a]).ok, 'a missing file starts empty');
    assert.equal(LEARN_PATH, 'src/game/lots/lot-learning.json');
    const runs = [...Array.from({ length: 10 }, (_, i) => sample(`e${i}`, [['t', 'tree', 6, 14, true], ['t', 'tree', 6, 2, false], ['t', 'tree', 6, -1, false], ['t', 'tree', 1.5, 14, false]])), ...Array.from({ length: 10 }, (_, i) => sample(`l${i}`, [['t', 'tree', 6, 14, true], ['t', 'tree', 6, 15, true], ['t', 'tree', 6, 2, false]]))];
    const st = learningStats(runs);
    assert.equal(st.total, 20); assert.equal(st.byClass.small, 20); assert.equal(st.first, 0.25); assert.ok(Math.abs(st.last - 2 / 3) < 1e-9, 'the share kept rises');
  });
});
