// Unit tests for the lot presets (P20 / T062): npm test.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LV } from '../src/game/lots/town';
import { BUCKET, bucketOf, stateOf, presetsFor, streetHash, pickPreset, fitPreset, parsePresets } from '../src/game/lots/presets';
import type { LotPreset, PresetProp, PresetPatch, Fitted } from '../src/game/lots/presets';

/** a test preset of a use and state at w x d tiles, with the given props and patches */
function preset(id: string, use: LotPreset['use'], state: LotPreset['state'], w: number, d: number, props: PresetProp[] = [], patches: PresetPatch[] = []): LotPreset {
  return { id, use, state, w, d, props, patches };
}

describe('lot presets (T062)', () => {
  it('1. bucketOf rounds each side to the bucket step, never below one bucket', () => {
    assert.equal(BUCKET, 2);
    assert.deepEqual(bucketOf(9, 15), { w: 10, d: 16 });
    assert.deepEqual(bucketOf(10.9, 14.2), { w: 10, d: 14 });
    assert.deepEqual(bucketOf(11, 1), { w: 12, d: 2 });
    assert.deepEqual(bucketOf(0, 0), { w: 2, d: 2 });
  });

  it('2. stateOf: built or upgraded by level, declined at decline 2 or more, null while building or empty', () => {
    assert.equal(stateOf(LV.BUILT, 0), 'built');
    assert.equal(stateOf(LV.BUILT, 1), 'built');
    assert.equal(stateOf(LV.BUILT, 2), 'declined');
    assert.equal(stateOf(LV.UPGRADED, 1), 'upgraded');
    assert.equal(stateOf(LV.UPGRADED, 3), 'declined');
    assert.equal(stateOf(LV.BUILDING, 0), null);
    assert.equal(stateOf(LV.EMPTY, 0), null);
  });

  it('3. presetsFor: exact buckets in file order, else the nearest distance, [] for a use or state with no presets', () => {
    const a = preset('a', 'res', 'built', 10, 16);
    const b = preset('b', 'res', 'built', 10, 16);
    const c = preset('c', 'res', 'built', 14, 18);
    const d = preset('d', 'com', 'built', 10, 16);
    const all = [a, b, c, d];
    const res = [a, b, c];
    assert.deepEqual(presetsFor(all, 'res', 'built', 9, 15), [a, b]);
    assert.deepEqual(presetsFor(all, 'res', 'built', 13, 19), [c]);
    // 12 x 17 buckets to 12 x 18: c is 2 away (14 x 18), a and b are 4 away (10 x 16)
    const bk = bucketOf(12, 17);
    const dist = (p: LotPreset) => { const pb = bucketOf(p.w, p.d); return Math.abs(pb.w - bk.w) + Math.abs(pb.d - bk.d); };
    const best = Math.min(...res.map(dist));
    assert.deepEqual(presetsFor(all, 'res', 'built', 12, 17), res.filter(p => dist(p) === best));
    assert.deepEqual(presetsFor(all, 'res', 'built', 12, 17), [c]);
    // 12 x 15 buckets to 12 x 16: a and b tie at 2 away, c is 4 away
    assert.deepEqual(presetsFor(all, 'res', 'built', 12, 15), [a, b]);
    assert.deepEqual(presetsFor(all, 'ind', 'built', 10, 16), []);
    assert.deepEqual(presetsFor(all, 'res', 'declined', 10, 16), []);
  });

  it('4. pickPreset: the same inputs give the same preset, neighbour slots never repeat, an empty list gives undefined', () => {
    const list = [preset('a', 'res', 'built', 10, 16), preset('b', 'res', 'built', 10, 16), preset('c', 'res', 'built', 14, 18)];
    for (let s = 0; s < 10; s++) assert.equal(pickPreset(list, s, 'Oak Street')?.id, pickPreset(list, s, 'Oak Street')?.id);
    let prev: string | undefined;
    for (let s = 0; s < 10; s++) { const id = pickPreset(list, s, 'Oak Street')?.id; assert.ok(id); assert.notEqual(id, prev, `slot ${s}`); prev = id; }
    assert.equal(pickPreset([], 0, 'Oak Street'), undefined);
    // FNV-1a: the empty string is the offset basis, 'a' is 0xe40c292c
    assert.equal(streetHash(''), 2166136261);
    assert.equal(streetHash('a'), 0xe40c292c);
  });

  it('5. fitPreset: far-half points move by the size change, near-half points stay, props off the lot are dropped, patch points clamp', () => {
    const at = (f: Fitted) => f.props.map(q => [q.x, q.y]);
    const p = preset('p', 'res', 'built', 10, 15, [
      { id: 'a', x: 2, y: 3, scale: 1, view: 0 },
      { id: 'b', x: 8, y: 12, scale: 1, view: 0 },
      { id: 'c', x: 4.9, y: 7.4, scale: 1, view: 0 },
    ]);
    const before = JSON.stringify(p);
    const big = fitPreset(p, 11, 16);
    assert.deepEqual(at(big), [[2, 3], [9, 13], [4.9, 7.4]]);
    assert.equal(big.dropped, 0);
    const small = fitPreset(p, 9, 14);
    assert.deepEqual(at(small), [[2, 3], [7, 11], [4.9, 7.4]]);
    assert.equal(small.dropped, 0);
    const tiny = fitPreset(p, 4, 6);
    assert.deepEqual(at(tiny), [[2, 3], [2, 3]]);
    assert.equal(tiny.dropped, 1);
    assert.equal(JSON.stringify(p), before, 'the preset is not changed');
    assert.notEqual(big.props[0], p.props[0], 'props are new objects');

    const q = preset('q', 'res', 'built', 10, 15, [], [{ kind: 'lot', tex: 'grass', pts: [9.5, 14.5, 10.4, 5] }]);
    const qf = fitPreset(q, 9, 14);
    assert.equal(qf.patches.length, 1, 'patches are never dropped');
    assert.deepEqual(qf.patches[0]?.pts, [8.5, 13.5, 9, 5], 'the point pushed past the edge is clamped to 9');
  });

  it('6. parsePresets keeps a valid entry and skips the ones with no props or a view of 5, counting them invalid', () => {
    const good = { id: 'ok', use: 'res', state: 'built', w: 10, d: 15, props: [{ id: 'tree', x: 1, y: 2, scale: 1, view: 0 }], patches: [{ kind: 'lot', tex: 'grass', pts: [0, 0, 10, 0, 10, 15] }] };
    const noProps = { id: 'bad1', use: 'res', state: 'built', w: 10, d: 15, patches: [] };
    const badView = { ...good, id: 'bad2', props: [{ id: 'tree', x: 1, y: 2, scale: 1, view: 5 }] };
    const r = parsePresets([good, noProps, badView]);
    assert.equal(r.presets.length, 1);
    assert.equal(r.presets[0]?.id, 'ok');
    assert.equal(r.invalid, 2);
    assert.deepEqual(r.presets[0], good);
    assert.deepEqual(parsePresets('nope'), { presets: [], invalid: 0 });
  });
});
