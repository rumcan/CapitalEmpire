// The range's look (plan P22 T096, issue #165): the range scene (golf/rangebiz.ts rangeScene, P24 T129-T146) stands on its plot and turns with
// the plot's facing, never mirrored; its ground's turf is managed grass in the right families (the outfield the driving-range family, the target
// greens greens: ext/grass-management PRESET_FAMILY).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultRangeBiz, isTargetGreen, rangeScene, withUpgrade, type RangeBizSave, type RangeUpgradeId } from '../src/game/golf/rangebiz';
import { plotPoint } from '../src/game/golf/range';
import { RANGE_PRESET } from '../src/game/golf/rangehost';
import { PRESET_FAMILY, grassSurface } from '../src/game/ext/grass-management/catalog';
import type { Rect } from '../src/game/golf/mode';

const plots: Record<0 | 1 | 2 | 3, Rect> = { 0: [500, 600, 70, 150], 1: [900, 300, 150, 70], 2: [200, 200, 70, 150], 3: [1200, 1300, 150, 70] };
const FACINGS = [0, 1, 2, 3] as const;
const ALL: RangeUpgradeId[] = ['bays8', 'bays12', 'bays24', 'targets', 'covered', 'lights', 'dispenser', 'proshop', 'teeturf', 'grass'];
const saves: [string, RangeBizSave][] = [['a new range', defaultRangeBiz()], ['every upgrade', ALL.reduce((s, id) => withUpgrade(s, id), defaultRangeBiz())]];

/** a world point in the plot's own frame (u along the road, v away from it): plotPoint inverted */
function frame(plot: Rect, f: 0 | 1 | 2 | 3, x: number, y: number) {
  const o = plotPoint(plot, f, 0, 0), a = plotPoint(plot, f, 1, 0), b = plotPoint(plot, f, 0, 1);
  const ux = a.x - o.x, uy = a.y - o.y, vx = b.x - o.x, vy = b.y - o.y, dx = x - o.x, dy = y - o.y, det = ux * vy - uy * vx;
  return { u: (dx * vy - dy * vx) / det, v: (ux * dy - uy * dx) / det };
}
/** a picture id without its axis suffix (the fences' runs: -x / -y, _x / _y) */
const axisless = (id: string) => id.replace(/([-_])[xy]$/, '$1');

test('every prop stands at the same spot of the plot for every facing, and turns with it: four-view art a quarter a facing, axis runs swap, nothing mirrored', () => {
  for (const [name, s] of saves) {
    const sc = FACINGS.map(f => rangeScene(plots[f], f, s));
    for (const p0 of sc[0]!.pieces) {
      const at0 = frame(plots[0], 0, p0.x, p0.y);
      const turns = new Set<number>(), still = new Set<number>();
      for (const f of FACINGS) {
        const p = sc[f]!.pieces.find(q => q.key === p0.key);
        assert.ok(p, `${name}: ${p0.key} at facing ${f}`);
        const at = frame(plots[f], f, p.x, p.y);
        assert.ok(Math.abs(at.u - at0.u) < 1e-6 && Math.abs(at.v - at0.v) < 1e-6, `${name}: ${p0.key} at the same spot of the plot at facing ${f}`);
        assert.ok(at.u >= -1e-6 && at.u <= 70 + 1e-6 && at.v >= -1e-6 && at.v <= 150 + 1e-6, `${name}: ${p0.key} on the plot`);
        assert.ok(Number.isInteger(p.q) && p.q >= 0 && p.q <= 3, `${name}: ${p0.key} turns by whole quarters (q ${p.q})`);
        assert.ok(!/flip|mirror/i.test(JSON.stringify(p)), `${name}: ${p0.key} carries no flip`);
        // a quarter turn a facing (four-view art turns with the plot), or the same picture every way (a one-view prop)
        const d = (p.q - p0.q + 4) % 4; if (d === f) turns.add(f); if (d === 0) still.add(f);
        // an axis run (a fence) swaps its picture's axis with the facing's, and only that
        if (p.id !== p0.id) assert.equal(axisless(p.id), axisless(p0.id), `${name}: ${p0.key} changes only its run's axis (${p0.id} -> ${p.id})`);
        assert.equal(p.id, sc[f % 2]!.pieces.find(q => q.key === p0.key)!.id, `${name}: ${p0.key} draws the same picture on facings ${f % 2} and ${f}`);
      }
      assert.ok(turns.size === 4 || still.size === 4, `${name}: ${p0.key} turns a quarter a facing or never (${[...turns]} / ${[...still]})`);
    }
    // the shop and the covered bays are four-view art, so they turn; the road sign and the boards face the road with the plot
    for (const k of ['shop', 'sign']) assert.deepEqual(FACINGS.map(f => (sc[f]!.pieces.find(q => q.key === k)!.q - sc[0]!.pieces.find(q => q.key === k)!.q + 4) % 4), [0, 1, 2, 3], `${name}: the ${k} turns`);
  }
});

test('the ground turns with the plot too: every patch the same in the plot frame for every facing; the outfield and the target greens on the range presets', () => {
  for (const [name, s] of saves) {
    const sc = FACINGS.map(f => rangeScene(plots[f], f, s));
    assert.equal(new Set(sc.map(x => x.patches.length)).size, 1, `${name}: as many patches every way`);
    sc[0]!.patches.forEach((pa, i) => {
      for (const f of FACINGS) {
        const pb = sc[f]!.patches[i]!;
        assert.equal(pb.surf, pa.surf);
        for (let k = 0; k < pa.pts.length; k += 2) {
          const a = frame(plots[0], 0, pa.pts[k]!, pa.pts[k + 1]!), b = frame(plots[f], f, pb.pts[k]!, pb.pts[k + 1]!);
          assert.ok(Math.abs(a.u - b.u) < 1e-6 && Math.abs(a.v - b.v) < 1e-6, `${name}: patch ${i} (${pa.surf}) corner ${k / 2} at facing ${f}`);
        }
      }
    });
    // a new range's outfield is the desert (T223), a grassed one the mown outfield with its stripes
    const grass = s.owned.includes('grass');
    assert.equal(sc[0]!.patches.filter(p => p.surf === (grass ? 'outfield' : 'desert')).length, 1, `${name}: one outfield`);
    assert.equal(sc[0]!.patches.filter(p => p.surf === (grass ? 'desert' : 'outfield')).length, 0, `${name}: no other outfield`);
    if (grass) assert.ok(sc[0]!.patches.find(p => p.surf === 'outfield')!.mow, `${name}: the outfield carries its mowing stripes`);
    else assert.ok(!sc[0]!.patches.find(p => p.surf === 'desert')!.mow, `${name}: the desert has no stripes`);
    assert.equal(sc[0]!.patches.filter(isTargetGreen).length, sc[0]!.targets.length, `${name}: a target green under each flag`);
  }
});

test('the range turf is managed grass: the outfield in the driving-range family, the target greens greens (T096)', () => {
  assert.equal(PRESET_FAMILY[RANGE_PRESET.outfield], 'driving-range');
  assert.equal(PRESET_FAMILY[RANGE_PRESET.target], 'golf-green');
  assert.equal(grassSurface(`preset:${RANGE_PRESET.outfield}`, false, null), 'driving-range');
  assert.equal(grassSurface(`preset:${RANGE_PRESET.target}`, false, null), 'golf-green');
  // the course's presets keep their surface's family, and a preset with neither stays unmanaged
  assert.equal(grassSurface('preset:some-fairway', false, 'fairway'), 'golf-fairway');
  assert.equal(grassSurface('preset:some-paving', false, null), null);
});
