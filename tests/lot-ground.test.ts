// Headless tests for the lot ground helpers: npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lotBatch, patchBox, quadBox, type LotPatch } from '../src/game/ground-protocol';

const quad = (x0: number, y0: number, x1: number, y1: number, tex: LotPatch['tex'] = 'paving'): LotPatch => ({ pts: [x0, y0, x1, y0, x1, y1, x0, y1], tex });

test('quadBox: the floored and ceiled tile box of a quad', () => {
  assert.deepEqual(quadBox([10.5, 3.2, 14, 3.2, 14, 7.9, 10.5, 7.9]), [10, 3, 14, 8]);
});

test('patchBox: union of patches, null when empty', () => {
  assert.equal(patchBox([]), null);
  assert.deepEqual(patchBox([quad(1, 1, 4, 4), quad(10, -2, 12, 3, 'asphalt')]), [1, -2, 12, 4]);
});

test('lotBatch: sets and drops split, last write per key wins', () => {
  const a = quad(0, 0, 2, 2), b = quad(5, 5, 6, 6, 'dirt'), pending = new Map<string, LotPatch[] | null>();
  pending.set('k1', [a]); pending.set('k2', null); pending.set('k1', [b]); pending.set('k3', null); pending.set('k3', [a]);
  const { set, drop } = lotBatch(pending);
  assert.deepEqual(set.sort((x, y) => x[0].localeCompare(y[0])), [['k1', [b]], ['k3', [a]]]);
  assert.deepEqual(drop, ['k2']);
});
