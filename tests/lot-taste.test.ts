// T161 (#379; P25 #348 step 6): the lot generator's pairs (items that go together) and densities by state (built tidy, upgraded lush, decrepit
// junky), learnt from the samples and shipped with the model (v2), and the 50-lot exam. Headless.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildTaste, learnTaste, pairRate, pairTable, stateKinds, tasteData, tasteFrom, PAIR_R, PAIRED } from '../src/game/lots/taste';
import { generateLayout, type GenInput } from '../src/game/lots/lot-gen';
import { buildModel, modelData, sampleItem, type Sample, type SectorLot } from '../src/game/lots/learn';
import { kindPools } from '../src/game/lots/item-kinds';
import { lotPresets, lotLayout, setGeneratedLots, setLotModel, lotModelVersion, type ComposeState, type LotGeom } from '../src/game/lots/compose';
import { LATEST, LOT_MODELS } from '../src/game/lots/lot-models';
import { presetSamples } from '../src/game/dev/learn-presets';
import { modelFile } from '../src/game/dev/dev-save';
import { examLots, examPreset, examRows, EXAM_N, EXAM_ROADS, EXAM_STATES } from '../src/game/lots/lot-exam';
import { LU, LV } from '../src/game/lots/town';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const samples = presetSamples(lotPresets(), '2026-10-27T00:00:00.000Z'), taste = buildTaste(samples);
/** a bare lot for the generator: w x d, a house in the middle */
const bare = (w: number, d: number): SectorLot => ({ w, d, house: [w / 2 - 3, d / 2 - 3, w / 2 + 3, d / 2 + 3] });
const gen = (o: Partial<GenInput> & { seed: number }) => generateLayout({ lot: bare(14, 18), cls: 'medium', model: buildModel(samples), taken: [], pools: kindPools(), half: () => ({ ha: 0.5, hb: 0.5 }), ...o });

describe('the lot generator\'s taste: pairs and densities by state (T161)', () => {
  it('1. pairs are learnt from the owner\'s presets: the doghouse with its sandbox, the mailbox with the bins; never a car or a decal', () => {
    assert.ok(pairRate(taste, 'expansion:doghouse', 'expansion:sandbox') > 0.6, 'doghouse and sandbox');
    assert.ok(pairRate(taste, 'world:mailbox', 'gen:trash-cans-row') > 0.5, 'mailbox and bins');
    assert.ok(pairRate(taste, 'expansion:hvac-unit', 'expansion:utility-cabinet') > 0.5, 'hvac and its cabinet');
    const t = pairTable(taste, kindPools())!;
    assert.ok(t && t.size > 10, 'the generator gets a pair table');
    for (const [, list] of t) for (const p of list) {
      assert.ok(PAIRED.has(p.kind), `${p.id} is a ${p.kind}`);
      for (let i = 0; i < p.offs.length; i += 2) assert.ok(Math.hypot(p.offs[i]!, p.offs[i + 1]!) <= PAIR_R + 0.01);
    }
  });
  it('2. densities by state: built keeps its density, upgraded is lusher, decrepit junkier; the samples move it, the character holds it', () => {
    const b = stateKinds(taste, 'built')!, u = stateKinds(taste, 'upgraded')!, d = stateKinds(taste, 'declined')!;
    assert.deepEqual(Object.values(b), [1, 1, 1, 1, 1, 1]);
    assert.ok(u.bush > 1.2 && u.flowerbed > 1.2 && u.tree > 1, `upgraded ${JSON.stringify(u)}`);
    assert.ok(d.prop > 1.1 && d.flowerbed < 0.6 && d.bush < 1, `declined ${JSON.stringify(d)}`);
    // a declined lot strewn with props raises the declined props further
    const lot = bare(12, 16), junk: Sample = { id: 'j', at: '', ctx: { use: 'res', state: 'declined', w: 12, d: 16, road: 0, house: null, cls: 'medium', hw: 6, hd: 6 }, items: Array.from({ length: 20 }, (_, i) => sampleItem(lot, 'expansion:leaf-bags', 'prop', 1 + (i % 10), i < 10 ? 1 : 14, true)) };
    const more = learnTaste(buildTaste(samples), junk);
    assert.ok(stateKinds(more, 'declined')!.prop > d.prop);
    // a taste with no densities (v1) gives the generator none
    assert.equal(stateKinds(tasteFrom({ counts: {} }), 'upgraded'), undefined);
    assert.equal(pairTable(tasteFrom({}), kindPools()), undefined);
  });
  it('3. the taste ships: modelFile writes it and it reads back the same; a model without one writes none', () => {
    const data = { ...modelData(buildModel(samples)), ...tasteData(taste) }, text = modelFile(9, data, 'test')!;
    assert.ok(text);
    const back = JSON.parse(text);
    assert.deepEqual(back.counts, data.counts);
    const t2 = tasteFrom(back);
    assert.deepEqual(pairTable(t2, kindPools()), pairTable(taste, kindPools()));
    // (T201: within the file's rounding: it keeps 3 decimals, and the owner's presets decide which side of a rounding a value lands on)
    for (const s of EXAM_STATES) {
      const a = stateKinds(t2, s), b = stateKinds(taste, s);
      assert.deepEqual(Object.keys(a ?? {}).sort(), Object.keys(b ?? {}).sort(), s);
      for (const k of Object.keys(b ?? {})) assert.ok(Math.abs((a as Record<string, number>)[k]! - (b as Record<string, number>)[k]!) <= 0.002, `${s} ${k}: ${(a as Record<string, number>)[k]} read back for ${(b as Record<string, number>)[k]}`);
    }
    const plain = modelFile(9, modelData(buildModel(samples)), 'test')!;
    assert.ok(!/"pairs"|"density"/.test(plain), 'no taste, no taste blocks');
  });
  it('4. the generator: with neither pairs nor kinds it lays as before; pairs stand by their anchors and change how items stand, not how many', () => {
    for (let s = 1; s <= 20; s++) assert.deepEqual(gen({ seed: s }), gen({ seed: s, kinds: undefined, pairs: undefined }));
    const pairs = pairTable(taste, kindPools())!, count = (L: ReturnType<typeof gen>, k: string) => L.filter(i => i.kind === k).length;
    let without = 0, with_ = 0, partners = 0;
    for (let s = 1; s <= 300; s++) {
      const a = gen({ seed: s }), b = gen({ seed: s, pairs });
      for (const k of ['tree', 'bush', 'flowerbed', 'prop']) { without += count(a, k); with_ += count(b, k); }
      for (const it of b) {
        if (it.with === undefined) continue;
        partners++;
        const an = b[it.with]!;
        assert.ok(Math.hypot(it.x - an.x, it.y - an.y) <= PAIR_R + 0.4, `${it.id} by ${an.id}`);
        assert.ok(it.x >= 0 && it.x <= 14 && it.y <= 18);
        assert.ok(pairs.get(an.id)?.some(p => p.id === it.id), `${it.id} is a partner of ${an.id}`);
      }
    }
    assert.ok(partners > 100, `${partners} partners laid`);
    assert.ok(with_ <= without * 1.05, `items with pairs ${with_}, without ${without}`);
  });
  it('5. the game: v2 is the latest and lays pairs; its decrepit lots are junkier and its upgraded lusher than its built ones', () => {
    assert.ok(LOT_MODELS[2] && LATEST >= 2);
    setGeneratedLots(true); const was = lotModelVersion(); setLotModel(2);
    // the frozen house presets of each state (the generated ones: a built lot of the owner's sizes would draw their approved preset), each on lots
    // of every facing along streets
    const N = [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 }], by: Record<string, { n: number; prop: number; bush: number; flowerbed: number; pairs: number }> = {};
    const frozen = (s: string) => lotPresets().filter(p => examPreset(p) && p.state === s);
    for (let i = 0; i < 240; i++) {
      const s = (['built', 'upgraded', 'declined'] as const)[i % 3]!, list = frozen(s), p = list[Math.floor(i / 3) % list.length]!;
      const n = N[i % 4]!, g: LotGeom = { o: { x: 200 + 30 * (i % 20), y: 200 + 40 * Math.floor(i / 20) }, u: { x: -n.y, y: n.x }, n, w: p.w, d: p.d };
      const st: ComposeState = { use: LU.RES, level: s === 'upgraded' ? LV.UPGRADED : LV.BUILT, decline: s === 'declined' ? 2 : 0, seed: i, preset: p.id };
      const L = lotLayout(g, st); if (!L) continue;
      const a = (by[s] ??= { n: 0, prop: 0, bush: 0, flowerbed: 0, pairs: 0 }); a.n++;
      for (const it of L) { if (it.kind === 'prop' || it.kind === 'bush' || it.kind === 'flowerbed') a[it.kind]++; if (it.with !== undefined) a.pairs++; }
    }
    setLotModel(was);
    const m = (s: string, k: 'prop' | 'bush' | 'flowerbed' | 'pairs') => by[s]![k] / by[s]!.n;
    assert.ok(by.built && by.upgraded && by.declined && by.built.n > 20, JSON.stringify(by));
    assert.ok(m('declined', 'prop') > m('built', 'prop') && m('declined', 'flowerbed') < m('built', 'flowerbed'), 'decrepit: more props, fewer flowers');
    assert.ok(m('upgraded', 'bush') > m('built', 'bush') && m('upgraded', 'flowerbed') > m('built', 'flowerbed'), 'upgraded: more bushes and flowers');
    assert.ok(m('built', 'pairs') > 0.5, 'pairs laid in the game');
  });
  it('6. the exam: 50 fixed lots, every state on every axis road, frozen presets running small to large; rows fit the lab street', () => {
    const a = examLots(lotPresets()), b = examLots(lotPresets());
    assert.deepEqual(a, b);
    assert.equal(a.filter(l => !l.group).length, EXAM_N, 'the houses\' 50 (T169: then each use group\'s rows)');
    for (const r of EXAM_ROADS) for (const s of EXAM_STATES) assert.ok(a.some(l => !l.group && l.road === r && l.state === s), `road ${r} ${s}`);
    const byId = new Map(lotPresets().map(p => [p.id, p]));
    for (const l of a.filter(q => !q.group)) { const p = byId.get(l.preset)!; assert.ok(examPreset(p) && p.state === l.state && p.w === l.w && p.d === l.d); }
    for (const s of EXAM_STATES) { const ar = a.filter(l => !l.group && l.state === s).map(l => l.w * l.d); assert.ok(ar[ar.length - 1]! > ar[0]!, `${s} runs small to large`); }
    const rows = examRows(a);
    assert.deepEqual(rows.flat().map(l => l.i).sort((x, y) => x - y), a.map(l => l.i));
    for (const r of rows) { assert.ok(r.length <= 7 && r.every(l => l.road === r[0]!.road)); assert.ok(r.reduce((t, l) => t + l.w + 3, 0) <= 150 || r.length === 1); }
  });
});
