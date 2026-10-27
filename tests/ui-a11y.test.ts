// Accessibility first pass (plan P23-UX 6.2 P2-7, T179): the styled tooltip's parts and text (a locked rail tool says what unlocks it), and the
// UI scale (the offered scales, the clamp, the storage and its fallback when storage throws).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tipAttrs, tipText } from '../src/ui/tip';
import { railEntries, railTip } from '../src/ui/rail-items';
import { computeProgressiveUiState, type PlayerProgressFacts } from '../src/game/ext/progressive-ui';
import { UI_SCALES, UI_SCALE_KEY, clampUiScale, loadUiScale, saveUiScale } from '../src/ui/uiScale';

const facts = (over: Partial<PlayerProgressFacts> = {}): PlayerProgressFacts => ({ advancedMode: false, playableHoles: 0, seasonsDone: 0, invited: false, elapsedSeconds: 30, roadsBuilt: 0, carParksBuilt: 0, eventStructuresPlaced: 0, ...over });

test("a rail group's tooltip: its name and key; locked, what unlocks it (the stages' words)", () => {
  const es = railEntries(computeProgressiveUiState(facts()), true, 'course');
  const traffic = es.find(e => e.item.id === 'traffic')!, course = es.find(e => e.item.id === 'course')!, town = es.find(e => e.item.id === 'towndecor')!;
  const why3 = "Unlocks with your third hole or the tour's invitation";
  assert.deepEqual(railTip(traffic), { name: 'Traffic', key: 'R', why: why3 });
  assert.equal(tipText(railTip(traffic)), `Traffic (R) · ${why3}`);
  assert.deepEqual(railTip(course), { name: 'Course', key: 'C' }, 'an open group: no reason');
  assert.deepEqual(railTip(town), { name: 'Town decoration', key: 'A' }, 'open: its Props is (Paint stays locked inside it)');
  // the data attributes the tooltip layer reads
  assert.deepEqual(tipAttrs(railTip(traffic)), { 'data-tip': 'Traffic', 'data-tip-key': 'R', 'data-tip-why': why3 });
  assert.deepEqual(tipAttrs({ name: 'Grass' }), { 'data-tip': 'Grass' });
  // opened at stage 3, Traffic loses its reason
  const s3 = railEntries(computeProgressiveUiState(facts({ playableHoles: 3 })), true, 'course').find(e => e.item.id === 'traffic')!;
  assert.equal(tipText(railTip(s3)), 'Traffic (R)');
});

test('the UI scale: 90, 100, 110 and 125%; anything else to the nearest, nonsense to 100%', () => {
  assert.deepEqual([...UI_SCALES], [0.9, 1, 1.1, 1.25]);
  assert.equal(clampUiScale(1.25), 1.25); assert.equal(clampUiScale('0.9'), 0.9);
  assert.equal(clampUiScale(2), 1.25); assert.equal(clampUiScale(0.5), 0.9); assert.equal(clampUiScale(1.04), 1); assert.equal(clampUiScale(1.07), 1.1);
  for (const bad of [NaN, Infinity, 'big', '', null, undefined, {}]) assert.equal(clampUiScale(bad), 1, String(bad));
});

test('the UI scale is kept per browser, and falls back to 100% when storage is missing, holds nonsense, or throws', () => {
  const mem = new Map<string, string>(), store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  assert.equal(loadUiScale(store), 1, 'nothing stored');
  assert.equal(saveUiScale(1.25, store), 1.25); assert.equal(mem.get(UI_SCALE_KEY), '1.25');
  assert.equal(loadUiScale(store), 1.25);
  assert.equal(saveUiScale(3, store), 1.25, 'stored clamped');
  mem.set(UI_SCALE_KEY, 'huge'); assert.equal(loadUiScale(store), 1);
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(loadUiScale(broken), 1, 'a private window: 100%');
  assert.equal(saveUiScale(0.9, broken), 0.9, 'saving does not throw');
  assert.equal(loadUiScale(null), 1, 'no storage at all');
});
