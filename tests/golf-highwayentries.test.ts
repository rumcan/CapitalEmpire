// Unit tests for the highway crowd rules module (P03 / T054): npm test.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  highwayCrowdShare,
  entryCountForTier,
  carScale,
  policeDayCost,
  splitTournamentCrowd,
  entrySourceLabel,
  inboundIndices,
} from '../src/game/golf/highwayentries';
import { mulberry } from '../src/game/iso';

describe('highway crowd rules (T054)', () => {
  it('1. highwayCrowdShare clamps tier and gives exact shares', () => {
    assert.equal(highwayCrowdShare(1), 0);
    assert.equal(highwayCrowdShare(5), 0.85);
    assert.equal(highwayCrowdShare(9), 0.85);
    assert.equal(highwayCrowdShare(0), 0);
  });

  it('2. entryCountForTier, carScale and policeDayCost across tiers', () => {
    assert.deepEqual([1, 2, 3, 4, 5].map(entryCountForTier), [1, 1, 2, 3, 3]);
    assert.deepEqual([1, 2, 3, 4, 5].map(carScale), [1, 1, 2, 4, 6]);
    assert.equal(policeDayCost(1), 500);
    assert.equal(policeDayCost(4), 2000);
  });

  it('3. splitTournamentCrowd splits crowd properly and preserves total sum', () => {
    assert.deepEqual(splitTournamentCrowd(120, 1), [120, 0]);
    assert.deepEqual(splitTournamentCrowd(100, 2), [45, 55]);
    assert.deepEqual(splitTournamentCrowd(1000, 4), [200, 267, 267, 266]);

    const rng = mulberry(42);
    for (let i = 0; i < 200; i++) {
      const total = Math.floor(rng() * 10000);
      const tier = 1 + Math.floor(rng() * 5);
      const parts = splitTournamentCrowd(total, tier);
      const sum = parts.reduce((a, b) => a + b, 0);
      assert.equal(sum, total, `sum mismatch for total ${total}, tier ${tier}`);
    }

    const neg = splitTournamentCrowd(-5, 3);
    assert.equal(neg.reduce((a, b) => a + b, 0), 0);
  });

  it('4. entrySourceLabel produces correct labels in golf and classic modes', () => {
    assert.equal(entrySourceLabel(0, true), 'Town');
    assert.equal(entrySourceLabel(1, true, 1), 'Highway');
    assert.equal(entrySourceLabel(2, true, 3), 'Highway 2');
    assert.equal(entrySourceLabel(0, false), 'Town A');
    assert.equal(entrySourceLabel(1, false), 'Town B');
  });

  it('5. inboundIndices identifies pieces driving inward, tie returns []', () => {
    const pieces = [
      { from: { x: 0, y: 100 }, to: { x: 20, y: 100 } },
      { from: { x: 20, y: 100 }, to: { x: 0, y: 100 } },
    ];
    assert.deepEqual(inboundIndices({ x: 0, y: 100 }, pieces), [0]);

    // equidistant tie returns []
    const tiePiece = [
      { from: { x: 0, y: 100 }, to: { x: 20, y: 100 } },
    ];
    assert.deepEqual(inboundIndices({ x: 10, y: 100 }, tiePiece), []);
  });
});
