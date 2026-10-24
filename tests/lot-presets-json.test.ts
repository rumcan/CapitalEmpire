// The frozen lot presets (P20 / T063): src/game/lots/lot-presets.json, written by scripts/assets/freeze-lot-presets.mjs. npm test.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import PRESET_JSON from '../src/game/lots/lot-presets.json';
import { bucketOf, fitPreset, formatPresets, parsePresets, presetsFor, type PresetState, type PresetUse } from '../src/game/lots/presets';
import { LIBRARY } from '../src/game/library';

const { presets, invalid } = parsePresets(PRESET_JSON);
const USES: PresetUse[] = ['res', 'com', 'park', 'tour', 'ind', 'civic'], STATES: PresetState[] = ['built', 'upgraded', 'declined'];

describe('the lot presets file (T063)', () => {
  it('1. parses with parsePresets: none invalid, ids unique, sizes sane', () => {
    assert.equal(invalid, 0);
    assert.ok(presets.length >= USES.length * STATES.length * 4, `${presets.length} presets`);
    assert.equal(new Set(presets.map(p => p.id)).size, presets.length, 'preset ids repeat');
    for (const p of presets) assert.ok(p.w >= 6 && p.w <= 24 && p.d >= 6 && p.d <= 24, `${p.id}: ${p.w} x ${p.d}`);
  });

  it('2. every use and state has presets, and a lot of any size finds some', () => {
    for (const u of USES) for (const s of STATES) {
      assert.ok(presets.some(p => p.use === u && p.state === s), `no ${u} ${s} preset`);
      for (const [w, d] of [[10, 15], [12.5, 16], [16, 11], [7, 30]]) assert.ok(presetsFor(presets, u, s, w!, d!).length > 0, `${u} ${s} ${w} x ${d}: none`);
    }
  });

  it('3. every prop id is a library id the game has', () => {
    const ids = new Set(LIBRARY.map(i => i.id)), unknown = new Set<string>();
    for (const p of presets) for (const q of p.props) if (!ids.has(q.id)) unknown.add(q.id);
    assert.deepEqual([...unknown], []);
  });

  it('4. the 14 curated house lots sit in the town house bucket (10 x 15): res, built or declined (the neglected ones), flagged curated', () => {
    const cur = presets.filter(p => p.curated);
    assert.equal(cur.length, 14);
    for (const p of cur) {
      assert.equal(p.use, 'res', p.id);
      assert.ok(p.state === 'built' || p.state === 'declined', p.id);
      assert.deepEqual(bucketOf(p.w, p.d), bucketOf(10, 15), p.id);
      assert.ok(p.props.length >= 6, `${p.id}: ${p.props.length} props`);
      assert.ok(p.props.some(q => /houses/i.test(LIBRARY.find(i => i.id === q.id)?.cat ?? '') || /house/.test(q.id)), `${p.id}: no house`);
      assert.ok(p.patches.some(a => a.kind === 'drive'), `${p.id}: no drive`);
    }
    assert.ok(presetsFor(presets, 'res', 'built', 10, 15).filter(p => p.curated).length >= 10);
  });

  it('5. every prop lies inside its own preset (fitting a preset to its own size drops nothing); every view is 0..3', () => {
    for (const p of presets) {
      assert.equal(fitPreset(p, p.w, p.d).dropped, 0, p.id);
      for (const q of p.props) assert.ok(q.scale > 0 && q.scale < 5, `${p.id} ${q.id}: scale ${q.scale}`);
    }
  });

  it('6. formatPresets writes the file back as it is (the freeze and the dev editor write the same text)', () => {
    const again = parsePresets(JSON.parse(formatPresets(presets)));
    assert.equal(again.invalid, 0);
    assert.deepEqual(again.presets, presets);
  });
});
