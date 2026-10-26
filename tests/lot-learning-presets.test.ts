// T159 (#362; P25 #348 steps 3 and 4): the owner's presets as a head start (every item on them "kept here", a sample per preset, learnt again in
// place) and the lot gallery (whole lots judged Good or Bad; a Bad one teaches nothing about which item; the row of lots along the lab street).
// Headless; the presets file is only read.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildModel, formatLearning, keepRate, learningStats, mergeSamples, parseLearning, SECTORS, type Sample } from '../src/game/lots/learn';
import { presetSample, presetSamples, teaches } from '../src/game/dev/learn-presets';
import { galleryRow, GALLERY_MAX, STREET_SPAN } from '../src/game/dev/lot-gallery';
import { lotPresets } from '../src/game/lots/compose';
import { isFence } from '../src/game/lots/item-kinds';
import type { LotPreset } from '../src/game/lots/presets';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const AT = '2026-10-26T00:00:00Z';
describe('the presets as a head start, and the gallery (T159)', () => {
  it('1. every item on the owner\'s presets is a kept sample with its lot: the lab presets and the frozen ones they edited; no house, fence or derived', () => {
    const all = lotPresets(), list = presetSamples(all, AT), teach = all.filter(teaches);
    assert.ok(list.length > 10, `${list.length} presets teach`);
    assert.ok(teach.every(p => p.road !== undefined || p.curated) && !teach.some(p => p.derived || p.use === 'farm'));
    for (const s of list) {
      const p = all.find(q => `preset:${q.id}` === s.id)!;
      assert.equal(s.src, 'preset'); assert.ok(s.items.every(i => i.kept), 'every item kept');
      assert.equal(s.ctx.road, p.road ?? 0); assert.equal(s.ctx.w, p.w); assert.equal(s.ctx.use, p.use);
      assert.ok(s.items.every(i => SECTORS.includes(i.sector)), 'every item in a sector');
      assert.ok(!s.items.some(i => isFence(i.id)), 'no fence'); assert.ok(!s.items.some(i => i.id === s.ctx.house), 'not the house');
      assert.ok(s.items.length <= p.props.length + (p.decals?.length ?? 0) - (s.ctx.house ? 1 : 0));
    }
    // left out: a derived preset, a farm, the lab's own lots
    const p0 = all.find(p => p.road !== undefined)!, skip = (q: Partial<LotPreset>) => !teaches({ ...p0, ...q } as LotPreset);
    assert.ok(skip({ derived: 'm' }) && skip({ use: 'farm' }) && skip({ id: 'lab-gallery-3' }) && skip({ id: 'lab-wizard' }) && skip({ road: undefined, curated: undefined }));
    // a preset's sample is the same whenever it is made (its id names the preset): learnt again, it replaces itself
    assert.equal(presetSample(p0, AT).id, presetSample(p0, '2027-01-01T00:00:00Z').id);
    // the model starts from the owner's taste: everything kept, so the sectors they used rise above the prior
    const m = buildModel(list), st = learningStats(list);
    assert.equal(st.bySrc.preset, list.length); assert.equal(st.shares.length, 0, 'the presets keep everything: not in the wizard\'s trend');
    assert.ok([...m.values()].some(c => c.offered > 5 && c.kept === c.offered));
    assert.ok(keepRate(m, 'small', 'tree', 'fence') > 0.5 || keepRate(m, 'small', 'tree', 'back') > 0.5);
  });
  it('2. learning from the presets again replaces their samples in place; a wizard sample of a repeated id is not replaced', () => {
    const p = lotPresets().find(q => teaches(q))!, a = presetSample(p, AT), b: Sample = { ...a, at: '2027-01-01T00:00:00Z', items: a.items.slice(1) };
    const wiz: Sample = { ...a, id: 'w-1', src: undefined };
    let text = formatLearning({ v: 1, samples: [] });
    for (const add of [[a, wiz], [b, { ...wiz, items: [] }]]) { const r = mergeSamples(text, add); assert.ok(r.ok); text = r.ok ? r.text : ''; }
    const f = parseLearning(JSON.parse(text));
    assert.equal(f.samples.length, 2, 'never twice');
    assert.equal(f.samples.find(s => s.id === a.id)!.items.length, a.items.length - 1, 'the preset\'s newer sample');
    assert.equal(f.samples.find(s => s.id === 'w-1')!.items.length, wiz.items.length, 'a wizard sample is kept as first saved');
  });
  it('3. the gallery: a lot judged Good counts its items kept, one judged Bad teaches nothing; the counter', () => {
    const p = lotPresets().find(q => teaches(q))!, base = presetSample(p, AT);
    const good: Sample = { ...base, id: 'g1', src: 'gallery', verdict: 'up' }, bad: Sample = { ...base, id: 'g2', src: 'gallery', verdict: 'down' };
    const m = buildModel([good, bad]), it = base.items[0]!;
    const c = [...m.entries()].find(([k]) => k === `${base.ctx.cls}|${it.kind}|${it.sector}`)![1];
    assert.equal(c.offered, base.items.filter(i => i.kind === it.kind && i.sector === it.sector).length, 'the Good lot only');
    const st = learningStats([good, bad, { ...base, id: 'w', src: 'wizard', items: base.items.map((i, k) => ({ ...i, kept: k % 2 === 0 })) }]);
    assert.equal(st.judged, 2); assert.equal(st.up, 0.5); assert.deepEqual(st.bySrc, { wizard: 1, preset: 0, gallery: 2 }); assert.equal(st.shares.length, 1, 'the trend: wizard lots only');
  });
  it('4. the gallery\'s row: up to a dozen lots of the cell along the street, side by side, the lab lot in the middle, within the street', () => {
    for (const w of [8, 10, 12, 14, 16, 20, 24, 30, 40]) {
      const r = galleryRow(w), offs = Array.from({ length: r.n }, (_, k) => r.off(k));
      assert.ok(r.n >= 1 && r.n <= GALLERY_MAX); assert.equal(r.off(r.mid), 0, 'the lab lot');
      assert.ok(offs.every((o, k) => k === 0 || o - offs[k - 1]! >= w), `${w}: side by side, no overlap`);
      assert.ok(Math.max(...offs) + w - Math.min(...offs) <= STREET_SPAN + w, `${w}: within the street`);
    }
    assert.equal(galleryRow(10).n, GALLERY_MAX);
  });
});
