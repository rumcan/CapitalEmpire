// The daily demand curve (src/game/sim/trips.ts): npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, demandAt } from '../src/game/sim/trips';

test('demand curve: 0.35 at 3 h, 1.0 at 8 h and 17 h, 0.7 at 12 h, 0.5 at 22 h (within 0.05), and within [0.35, 1] all day', () => {
  const at = (h: number) => demandAt(h * 60);
  for (const [h, v] of [[3, 0.35], [8, 1], [12, 0.7], [17, 1], [22, 0.5]] as [number, number][]) {
    assert.ok(Math.abs(at(h) - v) <= 0.05, `${h} h: ${at(h).toFixed(3)} vs ${v}`);
  }
  for (let t = 0; t < DAY; t += 1) {
    const d = demandAt(t);
    assert.ok(d >= 0.35 - 1e-9 && d <= 1 + 1e-9 && Number.isFinite(d), `t ${t}: ${d}`);
  }
  assert.equal(demandAt(DAY), demandAt(0), 'the curve repeats every day');
});
