// T314 (#899; the owner, 2026-11-03: "these lots have no trees for some reason and no fences and the yards have a lot of hard cutoff ground dirt textures
// that look unnatural. i want to have a lot of trees on the vertical lots to hide any weird unnatural issues"). A generated house lot (autolot.ts) on
// each screen-straight heading (odd roads) holds 3 to 8 trees, its owned boundary planted (a hedge just inside the owned side line, and the back when it
// owns it, never over the drive), and no bare ground bigger than a small worn patch, never a rectangle; two lots back to back on roads 3 and 7 plant
// their shared back line once; on the other roads the owned board fence stays. An approved straight-road preset is dressed the same (dressStraight).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoLot, dressStraight } from '../src/game/lots/autolot';
import { frameOf } from '../src/game/lots/preset-frame';
import { type LotGeom } from '../src/game/lots/compose-core';
import { LIBRARY } from '../src/game/library';
import { buildGroups } from '../src/game/lots/groups';
import { parsePresets, type Fitted, type PresetPatch } from '../src/game/lots/presets';
import PRESET_FIXTURE from './fixtures/lot-presets.json';

buildGroups(parsePresets(PRESET_FIXTURE).presets);

const byId = new Map(LIBRARY.map(it => [it.id, it] as const));
const isTree = (id: string) => byId.get(id)?.kind === 'tree';
const HEDGE = /^(landscape:bush-deep-green|landscape:bush-sage-round|world:bush_0)$/;
const FENCE = /fence-privacy/;
/** a lot of w x d tiles on road r (as autolot.test.ts lays them) */
function lotOn(r: number, w: number, d: number): LotGeom {
  const t = r * Math.PI / 4, n = { x: -Math.sin(t), y: -Math.cos(t) }, u = { x: Math.cos(t), y: -Math.sin(t) };
  return { o: { x: 300, y: 300 }, u, n, w, d };
}
const box = (pts: readonly number[]) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]!); x1 = Math.max(x1, pts[i]!); y0 = Math.min(y0, pts[i + 1]!); y1 = Math.max(y1, pts[i + 1]!); } return [x0, y0, x1, y1] as const; };
/** the bare ground a lot lays: every patch of a bare texture or a bed */
const bare = (ps: readonly PresetPatch[]) => ps.filter(a => a.kind === 'bed' || /dirt|field|gravel|rocky|sand|waste/.test(a.tex));
/** a small worn patch at most (tiles², its box: a play set's worn ground is about 4 x 3.3 tiles) */
const WORN_MAX = 14;
const SIZES: [number, number][] = [[14, 12], [16, 20], [20, 24], [33.5, 10], [13, 15]];

test('a straight-street house lot: 3 to 8 trees, its owned side (and back) hedged clear of the drive, no bare rectangle or big bare patch', () => {
  let lots = 0;
  for (const r of [1, 3, 5, 7]) for (const [w, d] of SIZES) for (const t of ['house', 'corner'] as const) for (let s = 0; s < 4; s++) {
    const lot = lotOn(r, w, d), p = autoLot(lot, 'res', 2, 101 + 37 * s + r, 'built', t);
    assert.ok(p, `${t} r${r} ${w}x${d} is null`);
    lots++;
    const tag = `${p.id} r${r} ${w}x${d} s${s}`, trees = p.props.filter(q => isTree(q.id)).length;
    assert.ok(trees >= 3 && trees <= 8, `${tag}: ${trees} trees`);
    // the hedge on the owned side line: the shrubs within 1.5 tiles of one side line, behind the front set-back
    const hedge = p.props.filter(q => HEDGE.test(q.id));
    const onSide = (x: number) => hedge.filter(q => Math.abs(q.x - x) < 1.5 && q.y > 3).length;
    assert.ok(Math.max(onSide(0), onSide(w)) >= 2, `${tag}: no side hedge (${hedge.length} shrubs)`);
    assert.ok(!p.props.some(q => FENCE.test(q.id)), `${tag}: an iso fence panel on a screen-straight line`);
    // never over the drive
    for (const dr of p.patches.filter(a => a.kind === 'drive')) {
      const b = box(dr.pts);
      for (const q of hedge) assert.ok(!(q.x > b[0] - 0.2 && q.x < b[2] + 0.2 && q.y > b[1] - 0.2 && q.y < b[3] + 0.2), `${tag}: a hedge shrub on the drive`);
    }
    // no bare rectangle, no big bare patch
    for (const a of bare(p.patches)) {
      const b = box(a.pts);
      assert.ok(a.pts.length > 8, `${tag}: a bare ${a.kind} rectangle`);
      assert.ok((b[2] - b[0]) * (b[3] - b[1]) <= WORN_MAX, `${tag}: a bare patch of ${((b[2] - b[0]) * (b[3] - b[1])).toFixed(1)} tiles²`);
    }
    // the same inputs, the same lot
    assert.equal(JSON.stringify(autoLot(lot, 'res', 2, 101 + 37 * s + r, 'built', t)), JSON.stringify(p));
  }
  assert.equal(lots, 4 * SIZES.length * 2 * 4);
});

test('two straight-street lots back to back (roads 3 and 7, and 1 and 5) plant their shared back line once', () => {
  for (const [a, b] of [[3, 7], [1, 5]]) for (let s = 0; s < 6; s++) {
    const backHedge = (r: number) => autoLot(lotOn(r, 16, 20), 'res', 2, 7 + s, 'built', 'house')!.props.filter(q => HEDGE.test(q.id) && q.y > 18).length;
    const na = backHedge(a), nb = backHedge(b);
    assert.ok((na > 0) !== (nb > 0), `roads ${a} and ${b} seed ${s}: back hedges ${na} and ${nb} (exactly one should own it)`);
  }
});

test('on the other roads a house lot keeps its owned board fence, and gets its trees', () => {
  for (const r of [0, 2, 4, 6]) {
    const p = autoLot(lotOn(r, 16, 20), 'res', 2, 9 + r, 'built', 'house')!, trees = p.props.filter(q => isTree(q.id)).length;
    assert.ok(p.props.some(q => FENCE.test(q.id)), `road ${r}: no fence`);
    assert.ok(trees >= 3 && trees <= 8, `road ${r}: ${trees} trees`);
  }
});

test('an approved preset on a screen-straight road is dressed: trees to 3..8, the owned hedge, its bare and paved rectangles made small and soft', () => {
  const lot = lotOn(1, 14, 18), f = frameOf(lot), house = autoLot(lot, 'res', 2, 5, 'built', 'house')!.props[0]!;
  const fit: Fitted = {
    props: [house], from: [0], dropped: 0, decals: [],
    patches: [
      { kind: 'drive', tex: 'paving', pts: [1, 0, 3.6, 0, 3.6, 5, 1, 5] },
      { kind: 'yard', tex: 'paving', pts: [0, 12, 14, 12, 14, 18, 0, 18] },
      { kind: 'bed', tex: 'field', pts: [1, 1, 13, 1, 13, 4, 1, 4] },
    ],
  };
  const out = dressStraight(fit, f, lot, 'res', 'built', 42);
  assert.notEqual(out, fit);
  assert.deepEqual(out.props[0], house, 'the preset\'s own props stay first, as they were');
  assert.equal(out.from.length, out.props.length);
  assert.ok(out.from.slice(1).every(k => k === -1), 'the added props come from -1');
  const trees = out.props.filter(q => isTree(q.id)).length;
  assert.ok(trees >= 3 && trees <= 8, `${trees} trees`);
  assert.ok(out.props.some(q => HEDGE.test(q.id)), 'no hedge');
  assert.ok(out.patches.some(a => a.kind === 'drive'), 'the drive is kept');
  for (const a of out.patches.filter(a => a.kind !== 'drive')) {
    const b = box(a.pts), area = (b[2] - b[0]) * (b[3] - b[1]);
    assert.ok(a.pts.length > 8, `a ${a.kind} rectangle left`);
    assert.ok(area <= WORN_MAX, `a ${a.kind} of ${area.toFixed(1)} tiles² left`);
  }
  assert.equal(JSON.stringify(dressStraight(fit, f, lot, 'res', 'built', 42)), JSON.stringify(out), 'not deterministic');
  // any other road or use: the fit as it is
  assert.equal(dressStraight(fit, frameOf(lotOn(0, 14, 18)), lotOn(0, 14, 18), 'res', 'built', 42), fit);
  assert.equal(dressStraight(fit, f, lot, 'com', 'built', 42), fit);
});
