// T169 (#392; P25 #348): the lots of every use generated on the fly. The model has a use group per use (lots/learn.ts groupOf): houses, shops and
// offices, industry, the open uses (car parks, civic, tour), each with its own keep counts, pairs, densities and pools (lots/group-data.ts); a
// generated lot of the other uses keeps its frozen preset's base (its buildings, patches, fences, cars, car park furniture and street items) and
// the generator lays the rest by its group's model; no plant grows on paving but along the fence, no tree stands before the main building's face,
// nothing on a drive, a walk or the car park, cars only from the base (on paving). Model v3 ships industry and the open uses; the shops stay on
// their frozen presets (their generated lots looked worse); a v1 or v2 town composes exactly as before. Headless.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { compose, groupBaseItem, lotLayout, lotPreset, lotPresets, lotModelVersion, pickedPreset, setGeneratedLots, setLotModel, type ComposeState, type LotGeom } from '../src/game/lots/compose';
import { LATEST, LOT_MODELS } from '../src/game/lots/lot-models';
import { groupOf } from '../src/game/lots/learn';
import { groupsBlock, groupsFrom } from '../src/game/lots/group-data';
import { modelFile } from '../src/game/dev/dev-save';
import { examLots, GROUP_N } from '../src/game/lots/lot-exam';
import { footprintOf } from '../src/game/lots/preset-art';
import { frameOf, toFrame } from '../src/game/lots/preset-frame';
import { OVERLAP, share } from '../src/game/lots/compose-core';
import { LIBRARY } from '../src/game/library';
import { mulberry } from '../src/game/iso';
import { LU, LV } from '../src/game/lots/town';
import type { LotPreset, PresetUse } from '../src/game/lots/presets';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); };
const BY = new Map(LIBRARY.map(i => [i.id, i]));
const LUOF: Record<string, number> = { res: LU.RES, com: LU.COM, park: LU.COM, ind: LU.IND, tour: LU.TOUR, civic: LU.GOV };
/** the frozen presets of a use (the game's: not the owner's, not derived, no road) */
const frozen = (use: PresetUse) => lotPresets().filter(p => p.use === use && !p.curated && !p.approved && !p.whole && !p.derived && p.road === undefined);
/** lots drawing a use's frozen presets (forced, as the exam draws them): every facing, every state, along streets */
function lotsOf(use: PresetUse, n = 60): { g: LotGeom; st: ComposeState; p: LotPreset }[] {
  const list = frozen(use), N = [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 }], r = mulberry(0x169);
  return Array.from({ length: n }, (_, i) => {
    const p = list[Math.floor(r() * list.length)]!, nn = N[i % 4]!;
    return { p, g: { o: { x: 300 + 50 * (i % 20), y: 300 + 50 * Math.floor(i / 20) }, u: { x: -nn.y, y: nn.x }, n: nn, w: p.w, d: p.d }, st: { use: LUOF[use]!, level: p.state === 'upgraded' ? LV.UPGRADED : LV.BUILT, decline: p.state === 'declined' ? 2 : 0, seed: i, preset: p.id } };
  });
}

describe('lots on the fly for every use (T169)', () => {
  it('1. the use groups: houses, shops and offices, industry, the open uses (car parks, civic, tour); a farm draws its own preset', () => {
    assert.deepEqual((['res', 'com', 'ind', 'park', 'civic', 'tour', 'farm'] as const).map(groupOf), ['res', 'com', 'ind', 'open', 'open', 'open', null]);
  });
  it('2. v3 is the latest: it ships industry and the open uses, the shops stay on their frozen presets; its houses are v2\'s', () => {
    assert.equal(LATEST, 3);
    const g = groupsFrom(LOT_MODELS[3]);
    assert.equal(g.ind?.on, true); assert.equal(g.open?.on, true); assert.equal(g.com?.on, false);
    for (const k of ['counts', 'anchors', 'pairs', 'density'] as const) assert.deepEqual((LOT_MODELS[3] as Record<string, unknown>)[k], (LOT_MODELS[2] as Record<string, unknown>)[k], `the houses' ${k} as v2's`);
    // the groups ship: modelFile writes them and they read back the same
    const back = JSON.parse(modelFile(9, LOT_MODELS[3], 'test')!);
    assert.deepEqual(groupsFrom(back), g);
    assert.equal(groupsBlock({}), '');
  });
  it('3. a v1 or v2 town composes exactly as before (pinned on main before T169), and a v3 town\'s house lots as a v2 town\'s', (t) => {
    const sha = (f: string) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 12);
    const was = lotModelVersion();
    // every use: the frozen presets of each, every state and facing
    const lots = (['res', 'com', 'ind', 'park', 'civic', 'tour'] as const).flatMap(u => lotsOf(u, 20));
    setGeneratedLots(true);
    const hash = (v: number) => { setLotModel(v); return fnv(JSON.stringify(lots.map(l => compose(l.g, l.st)))); };
    const h1 = hash(1), h2 = hash(2), houses = lots.filter(l => l.p.use === 'res');
    setLotModel(2); const res2 = houses.map(l => JSON.stringify(compose(l.g, l.st)));
    setLotModel(3); const res3 = houses.map(l => JSON.stringify(compose(l.g, l.st)));
    setLotModel(was);
    assert.deepEqual(res3, res2, "v3's house lots are v2's");
    const data = [sha('src/game/lots/lot-presets.json'), sha('scripts/assets/scale-overrides.json'), sha('scripts/assets/removed.json')].join(',');
    if (data !== '86289001229b,83f0ac47e796,a083234bb6ef') { t.skip(`the owner's data changed (${data}): the pinned hashes no longer apply`); return; }
    assert.deepEqual([h1, h2], [PIN.v1, PIN.v2]);
  });
  it('4. per shipped group: the same lot lays the same, nothing outside it or overlapping beyond the rule, nothing on a drive, a walk or the car park', () => {
    setGeneratedLots(true); setLotModel(3);
    for (const use of ['ind', 'park', 'civic', 'tour'] as const) {
      let gen = 0;
      for (const l of lotsOf(use, 40)) {
        const L = lotLayout(l.g, l.st);
        assert.ok(L, `${l.p.id}: generated`); gen++;
        assert.equal(JSON.stringify(compose(l.g, l.st)), JSON.stringify(compose(l.g, l.st)), 'the same layout every time');
        assert.deepEqual(lotLayout(l.g, l.st), L);
        const lp = lotPreset(l.g, l.st)!, f = lp.frame, box = (pts: readonly number[]) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let i = 0; i + 1 < pts.length; i += 2) { x0 = Math.min(x0, pts[i]!); x1 = Math.max(x1, pts[i]!); y0 = Math.min(y0, pts[i + 1]!); y1 = Math.max(y1, pts[i + 1]!); } return [x0, y0, x1, y1]; };
        const hard = lp.fit.patches.filter(a => a.kind === 'drive' || a.kind === 'walk' || a.kind === 'lot').map(a => box(a.pts));
        for (const it of L!) {
          assert.notEqual(it.kind, 'car', 'no generated car (cars only from the base, on paving)');
          assert.ok(it.x >= 0 && it.x <= l.g.w && it.y <= l.g.d, `${it.id} in the lot`);
          if (it.kind === 'decal') continue;
          for (const b of hard) assert.ok(!(it.x > b[0]! + 0.3 && it.x < b[2]! - 0.3 && it.y > b[1]! + 0.3 && it.y < b[3]! - 0.3), `${it.id} on a drive, walk or car park of ${l.p.id}`);
        }
        // the drawn lot: every generated prop inside the lot, none overlapping another beyond the rule (fences and street items aside)
        const c = compose(l.g, l.st), fp = (q: (typeof c.props)[number]) => { const h = footprintOf(q.id, q.scale, q.flip); return [q.x + h[0], q.y + h[1], q.x + h[2], q.y + h[3]] as [number, number, number, number]; };
        const mine = c.props.filter(q => !q.from && !q.street && !/^(fencex|fencey)$/.test(BY.get(q.id)?.kind ?? ''));
        for (const q of mine) { const a = toFrame(f, q.x, q.y); assert.ok(a.x > -1 && a.x < l.g.w + 1 && a.y > -2 && a.y < l.g.d + 1, `${q.id} drawn in ${l.p.id}`); }
        for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) assert.ok(share(fp(mine[i]!), fp(mine[j]!)) <= OVERLAP + 1e-9, `${mine[i]!.id} on ${mine[j]!.id} in ${l.p.id}`);
      }
      assert.ok(gen >= 40, use);
    }
    void frameOf;
  });
  it('5. the base stays: every building, fence, car and car park piece of the frozen preset is drawn; the shops and the owner\'s presets compose as ?oldlots', () => {
    setLotModel(3);
    for (const use of ['ind', 'park', 'civic', 'tour'] as const) for (const l of lotsOf(use, 20)) {
      setGeneratedLots(false); const old = compose(l.g, l.st).props.filter(q => q.from && groupBaseItem(q.id, -1) && !q.street); setGeneratedLots(true);
      const now = compose(l.g, l.st).props.filter(q => q.from);
      for (const q of old) if (BY.get(q.id) && groupBaseItem(q.id, 0)) assert.ok(now.some(x => x.id === q.id && Math.abs(x.x - q.x) < 1e-6 && Math.abs(x.y - q.y) < 1e-6), `${l.p.id}: ${q.id} kept`);
    }
    // the shops (off in v3) and the owner's own presets of every use compose as with ?oldlots
    const owner = lotPresets().filter(p => p.use !== 'res' && p.use !== 'farm' && (p.approved || p.curated || p.whole));
    const lots = [...lotsOf('com', 30), ...owner.slice(0, 20).map((p, i) => ({ p, g: { o: { x: 900 + 40 * i, y: 900 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, w: p.w, d: p.d }, st: { use: LUOF[p.use]!, level: LV.BUILT, decline: 0, seed: i, preset: p.id } }))];
    setGeneratedLots(false); const old = lots.map(l => JSON.stringify(compose(l.g, l.st))); setGeneratedLots(true);
    assert.deepEqual(lots.map(l => JSON.stringify(compose(l.g, l.st))), old);
    void pickedPreset;
  });
  it('6. no plant on paving but along the fence; no tree before the main building\'s face', () => {
    setGeneratedLots(true); setLotModel(3);
    let plants = 0;
    for (const use of ['ind', 'park', 'civic', 'tour'] as const) for (const l of lotsOf(use, 40)) {
      const lp = lotPreset(l.g, l.st)!, L = lotLayout(l.g, l.st)!;
      const paved = lp.fit.patches.filter(a => a.kind === 'yard' && ['asphalt', 'concrete', 'slabs', 'paving'].includes(a.tex));
      for (const it of L) {
        if (it.kind !== 'tree' && it.kind !== 'bush' && it.kind !== 'flowerbed') continue;
        plants++;
        const inFence = it.x < 1.2 || it.x > l.g.w - 1.2 || it.y > l.g.d - 1.2;
        for (const a of paved) {
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let i = 0; i + 1 < a.pts.length; i += 2) { x0 = Math.min(x0, a.pts[i]!); x1 = Math.max(x1, a.pts[i]!); y0 = Math.min(y0, a.pts[i + 1]!); y1 = Math.max(y1, a.pts[i + 1]!); }
          assert.ok(inFence || !(it.x > x0 + 0.6 && it.x < x1 - 0.6 && it.y > y0 + 0.6 && it.y < y1 - 0.6), `${it.id} grows on ${a.tex} in ${l.p.id}`);
        }
      }
    }
    assert.ok(plants > 100, `${plants} plants laid`);
  });
  it('7. the exam has a row of each state for each use group, 12 lots each, numbered after the houses\' 50', () => {
    const a = examLots(lotPresets());
    for (const g of ['com', 'ind', 'open'] as const) {
      const ls = a.filter(l => l.group === g);
      assert.equal(ls.length, GROUP_N, g);
      for (const s of ['built', 'upgraded', 'declined'] as const) assert.equal(ls.filter(l => l.state === s).length, GROUP_N / 3, `${g} ${s}`);
      for (const l of ls) assert.ok(l.i >= 50 && groupOf(lotPresets().find(p => p.id === l.preset)!.use) === g);
    }
    assert.deepEqual(new Set(a.filter(l => l.group === 'open').map(l => l.use)), new Set(['park', 'civic', 'tour']));
  });
});
/** the hashes of test 3's lots under v1 and v2, measured on main at a651dd6 (before T169) */
const PIN = { v1: 'f7478701', v2: 'edf7ad52' };
