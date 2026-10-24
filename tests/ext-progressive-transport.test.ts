// Headless tests for the transport panel controls (T039): npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { busHowTo, parkPanelControls, tollHowTo, type ParkControl } from '../src/game/ext/progressive-ui';

const FULL_ORDER: readonly ParkControl[] = [
  'modeRect',
  'modeRows',
  'modeCurb',
  'rowAngle',
  'rowColour',
  'fee',
  'counts',
  'demandToggle',
  'parkList',
  'parkTest',
];

function isSubsequence<T>(sub: T[], full: readonly T[]): boolean {
  let i = 0;
  for (const item of full) {
    if (i < sub.length && sub[i] === item) i++;
  }
  return i === sub.length;
}

describe('transport panel controls (T039)', () => {
  it('golf beginner (not advanced, not dev) shows only rectangle, fee and list', () => {
    const res = parkPanelControls({ golf: true, advanced: false, dev: false });
    assert.deepEqual(res, ['modeRect', 'fee', 'parkList']);
  });

  it('golf with advanced shows every control except parkTest in union order', () => {
    const res = parkPanelControls({ golf: true, advanced: true, dev: false });
    assert.deepEqual(res, [
      'modeRect',
      'modeRows',
      'modeCurb',
      'rowAngle',
      'rowColour',
      'fee',
      'counts',
      'demandToggle',
      'parkList',
    ]);
  });

  it('classic (golf false, advanced false) shows the full set without parkTest', () => {
    const res = parkPanelControls({ golf: false, advanced: false, dev: false });
    assert.deepEqual(res, [
      'modeRect',
      'modeRows',
      'modeCurb',
      'rowAngle',
      'rowColour',
      'fee',
      'counts',
      'demandToggle',
      'parkList',
    ]);
  });

  it('dev adds parkTest in every case', () => {
    const beginnerDev = parkPanelControls({ golf: true, advanced: false, dev: true });
    assert.deepEqual(beginnerDev, ['modeRect', 'fee', 'parkList', 'parkTest']);

    const classicDev = parkPanelControls({ golf: false, advanced: false, dev: true });
    assert.deepEqual(classicDev, FULL_ORDER);

    const advancedDev = parkPanelControls({ golf: true, advanced: true, dev: true });
    assert.deepEqual(advancedDev, FULL_ORDER);
  });

  it('bus how-to targets clubhouse gates in golf and stadium in classic; toll how-to matches for both', () => {
    const busGolf = busHowTo(true);
    assert.ok(busGolf.lead.includes('course gates'), `busGolf lead: ${busGolf.lead}`);

    const busClassic = busHowTo(false);
    assert.ok(busClassic.lead.includes('stadium'), `busClassic lead: ${busClassic.lead}`);

    assert.deepEqual(tollHowTo(true), tollHowTo(false));
  });

  it('control order is stable: all 8 boolean combinations are a subsequence of the union order', () => {
    for (const golf of [false, true]) {
      for (const advanced of [false, true]) {
        for (const dev of [false, true]) {
          const list = parkPanelControls({ golf, advanced, dev });
          assert.ok(
            isSubsequence(list, FULL_ORDER),
            `subsequence failed for { golf: ${golf}, advanced: ${advanced}, dev: ${dev} }: ${JSON.stringify(list)}`
          );
        }
      }
    }
  });
});
