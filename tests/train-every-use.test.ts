// T173 (#406; P25): the lot lab trains every use. The wizard and the gallery lay a lot of the lab's type with the game's own path and the live model
// (dev/live-model.ts: the presets as the head start, the owner's samples on top, each group its own), and their samples train the group of their
// lot's use; Ship model plans the next version with its exam picture (dev-save.ts shipPlan); v1-v4 towns compose as before. Headless.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { compose, layModelFrom, lotPresets, lotModelVersion, setGeneratedLots, setLotModel, type ComposeState, type LotGeom } from '../src/game/lots/compose';
import { LATEST, LOT_MODELS } from '../src/game/lots/lot-models';
import { groupsFrom } from '../src/game/lots/group-data';
import { groupStats, liveModelData, ownerWeight, sampleGroup } from '../src/game/dev/live-model';
import { lotSample, makeLot } from '../src/game/dev/wizard-lot';
import { shipPlan } from '../src/game/dev/dev-save';
import { frameOf } from '../src/game/lots/preset-frame';
import { LIBRARY } from '../src/game/library';
import { isBuilding } from '../src/game/mirror';
import { mulberry } from '../src/game/iso';
import { LU, LV } from '../src/game/lots/town';
import type { LotPreset, PresetUse } from '../src/game/lots/presets';
import type { Sample } from '../src/game/lots/learn';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const BY = new Map(LIBRARY.map(i => [i.id, i]));
const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); };
const frozen = (use: PresetUse) => lotPresets().filter(p => p.use === use && !p.curated && !p.approved && !p.whole && !p.derived && p.road === undefined);
/** a lot of a preset's size facing +y, and its frame (the wizard lays the preset's own frame) */
const lotOf = (p: LotPreset): LotGeom => ({ o: { x: 400, y: 400 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, w: p.w, d: p.d });
const L4 = LOT_MODELS[4] as Record<string, unknown>;
/** a wizard lot of a frozen preset of a use (as the lab shows it: whole), laid with the untrained live model, and its sample */
function wizardOf(use: PresetUse, k: number, seed: number) {
  const p = frozen(use)[k]!, data = liveModelData(lotPresets(), [], L4), lot = makeLot({ ...p, whole: true }, frameOf(lotOf(p)), layModelFrom(data, true), seed);
  return { p, lot };
}

describe('train every use in the lot lab (T173)', () => {
  // (T201: until 2026-10-27 this compared the live model with v4's numbers, which were learnt from the presets of their day: the owner edits the
  // presets in the studio, so the rules stand instead of the numbers)
  it("1. the live model with no training is the presets' own: the same every time, shaped as the shipped one, and it follows the presets", () => {
    const P = lotPresets(), d = liveModelData(P, [], L4) as Record<string, unknown>;
    assert.deepEqual(liveModelData(P, [], L4), d, 'the same every time');
    // shaped as v4: its blocks, and its groups with v4's on and off
    for (const k of ['counts', 'anchors', 'pairs', 'density', 'places']) assert.ok(d[k] !== undefined, `${k} learnt`);
    const g = groupsFrom(d), g4 = groupsFrom(L4);
    assert.deepEqual(Object.keys(g).sort(), Object.keys(g4).sort(), "v4's groups");
    for (const k of Object.keys(g4) as (keyof typeof g4)[]) assert.equal(g[k]!.on, g4[k]!.on, `${k}: on as v4`);
    // learnt from the presets: without a use's frozen presets that use's group learns another model; the houses' counts follow the house presets
    const noInd = liveModelData(P.filter(p => p.use !== 'ind'), [], L4) as Record<string, unknown>;
    assert.notDeepEqual(groupsFrom(noInd).ind, g.ind, 'the works follow their presets'); assert.deepEqual(groupsFrom(noInd).com, g.com, 'the shops do not');
    const fewer = liveModelData(P.filter((p, i) => p.use !== 'res' || i % 2 === 0), [], L4) as Record<string, unknown>;
    assert.notDeepEqual(fewer.counts, d.counts, 'the houses follow their presets');
  });
  it('2. a shop lot\'s sample trains the shops, not the houses; a house lot\'s the houses, not the shops; a gallery lot judged Bad trains nothing', () => {
    const { lot } = wizardOf('com', 3, 11), base = liveModelData(lotPresets(), [], L4);
    assert.ok(lot.items.length > 3, `${lot.items.length} items offered`);
    lot.items.forEach((it, i) => { it.deleted = i % 2 === 0; });
    const s = lotSample(lot, { use: 'com', state: 'built', road: 0 });
    assert.equal(sampleGroup(s), 'com');
    const d = liveModelData(lotPresets(), [s], L4) as Record<string, unknown>, g0 = groupsFrom(base), g1 = groupsFrom(d);
    assert.deepEqual(d.counts, (base as Record<string, unknown>).counts, 'the houses untouched');
    assert.notDeepEqual(g1.com!.counts, g0.com!.counts, 'the shops trained');
    assert.deepEqual(g1.ind, g0.ind); assert.deepEqual(g1.open, g0.open);
    // the shops' head start is about four times the houses': a shop sample counts four times
    assert.equal(ownerWeight(frozen('com').length, 87), 4);
    const h = wizardOf('res', 5, 12).lot; h.items.forEach((it, i) => { it.deleted = i % 3 === 0; });
    const hs = lotSample(h, { use: 'res', state: 'built', road: 0 }), dh = liveModelData(lotPresets(), [hs], L4) as Record<string, unknown>;
    assert.notDeepEqual(dh.counts, (base as Record<string, unknown>).counts, 'the houses trained');
    assert.deepEqual(groupsFrom(dh), g0, 'the groups untouched');
    const bad: Sample = { ...s, id: 'bad', src: 'gallery', verdict: 'down' };
    assert.deepEqual(groupsFrom(liveModelData(lotPresets(), [bad], L4)), g0, 'a lot judged Bad trains nothing');
    const st = groupStats([s, hs, bad]);
    assert.deepEqual([st.res.samples, st.com.samples, st.ind.samples, st.com.judged], [1, 2, 0, 1]);
  });
  it('3. the wizard and the gallery on an industrial lot lay industry\'s items round its buildings; on a shop lot the shops\' set', () => {
    const ind = new Set(Object.values(groupsFrom(L4).ind!.pools).flat()), com = new Set(Object.values(groupsFrom(L4).com!.pools).flat());
    for (let k = 0; k < 12; k++) {
      const { p, lot } = wizardOf('ind', k * 7, k + 1);
      assert.equal(lot.group, 'ind');
      for (const it of lot.items) if (it.kind !== 'decal') assert.ok(ind.has(it.id), `${p.id}: ${it.id} is industry's`);
      // the base: every building and car of the preset stays
      const want = p.props.filter(q => q.y >= 0 && (BY.get(q.id) && (isBuilding(BY.get(q.id)!) || BY.get(q.id)!.cat === 'Vehicles'))).length;
      assert.ok(lot.base.props.filter(q => q.y >= 0 && (BY.get(q.id) && (isBuilding(BY.get(q.id)!) || BY.get(q.id)!.cat === 'Vehicles'))).length >= want, `${p.id}: its buildings and cars stay`);
    }
    let kerb = 0;
    for (let k = 0; k < 12; k++) { const { lot } = wizardOf('com', k * 9, k + 3); assert.equal(lot.group, 'com'); for (const it of lot.items) { if (it.kind !== 'decal') assert.ok(com.has(it.id), it.id); if (it.id === 'world:bench' && it.y < 1.6) kerb++; } }
    assert.ok(kerb >= 8, `${kerb} benches at the kerb on 12 shop lots`);
    // the same seed lays the same lot
    assert.deepEqual(wizardOf('com', 4, 9).lot.items, wizardOf('com', 4, 9).lot.items);
  });
  it('4. Ship plans the next version: its exam picture, its model, then the index with LATEST bumped; a picture not a JPEG ships nothing', () => {
    const jpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]).toString('base64')}`;
    const plan = shipPlan([1, 2, 3, 4], liveModelData(lotPresets(), [], L4), 'test', jpeg)!;
    assert.equal(plan.version, 5);
    assert.deepEqual(plan.files.map(f => f.name), ['v5.exam.jpg', 'v5.json', 'index.ts']);
    assert.deepEqual([...(plan.files[0]!.content as Uint8Array).slice(0, 2)], [0xff, 0xd8]);
    const model = JSON.parse(plan.files[1]!.content as string);
    assert.equal(model.v, 5); assert.ok(model.groups.com.places.inventory);
    assert.match(plan.files[2]!.content as string, /LATEST = 5;/);
    assert.match(plan.files[2]!.content as string, /import v5 from '\.\/v5\.json';/);
    assert.equal(shipPlan([1, 2, 3, 4], liveModelData(lotPresets(), [], L4), 'test', 'data:image/png;base64,iVBORw0KGgo=')?.version, undefined);
    assert.deepEqual(shipPlan([1, 2, 3, 4], liveModelData(lotPresets(), [], L4), 'test')!.files.map(f => f.name), ['v5.json', 'index.ts']);
    assert.equal(LATEST, 4, 'nothing shipped by the test');
  });
  it('5. v1-v4 towns compose exactly as before (pinned on main before T173)', (t) => {
    const sha = (f: string) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 12);
    const data = [sha('src/game/lots/lot-presets.json'), sha('scripts/assets/scale-overrides.json'), sha('scripts/assets/removed.json')].join(',');
    if (data !== '86289001229b,83f0ac47e796,a083234bb6ef') { t.skip(`the owner's data changed (${data})`); return; }
    const LUOF: Record<string, number> = { res: LU.RES, com: LU.COM, park: LU.COM, ind: LU.IND, tour: LU.TOUR, civic: LU.GOV };
    const lotsOf = (use: PresetUse, n: number) => { const list = frozen(use), N = [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 }], r = mulberry(0x169); return Array.from({ length: n }, (_, i) => { const p = list[Math.floor(r() * list.length)]!, nn = N[i % 4]!; return { g: { o: { x: 300 + 50 * (i % 20), y: 300 + 50 * Math.floor(i / 20) }, u: { x: -nn.y, y: nn.x }, n: nn, w: p.w, d: p.d } as LotGeom, st: { use: LUOF[use]!, level: p.state === 'upgraded' ? LV.UPGRADED : LV.BUILT, decline: p.state === 'declined' ? 2 : 0, seed: i, preset: p.id } as ComposeState }; }); };
    const lots = (['res', 'com', 'ind', 'park', 'civic', 'tour'] as const).flatMap(u => lotsOf(u, 20)), was = lotModelVersion();
    setGeneratedLots(true);
    const h = [1, 2, 3, 4].map(v => { setLotModel(v); return fnv(JSON.stringify(lots.map(l => compose(l.g, l.st)))); });
    setLotModel(was);
    assert.deepEqual(h, ['f7478701', 'edf7ad52', 'b0534b73', '6501f3d8']);
  });
});
