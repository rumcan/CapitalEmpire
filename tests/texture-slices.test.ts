// T168: the lazy textures made in slices. fbmRows (grime's and wear's noise a row at a time) gives fbm's values to the last bit, so the
// textures it draws keep their pixels; the Course tool's prewarm list is every brush's fill and border texture, each once. (That a texture
// made in slices is the one made at once is checked in the browser: the ground's pixel diff, PR #389.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fbm, fbmRows } from '../src/game/canvas2d';
import { drain } from '../src/game/textures';
import { BRUSH_PRESETS, brushTextures } from '../src/game/paint';

test('fbmRows gives fbm values exactly, row by row', () => {
  for (const [seed, W, H, cells, oct] of [[1, 256, 256, 8, 3], [77, 300, 170, 5, 4], [5, 64, 128, 3, 1], [9001, 512, 256, 12, 3], [3, 97, 61, 7, 2]] as const) {
    const f = fbm(seed, W, H, cells, oct), row = fbmRows(seed, W, H, cells, oct), out = new Float64Array(W);
    for (const y of [0, 1, H >> 1, H - 1, H + 3, -2]) {
      row(y, out);
      for (let x = 0; x < W; x++) assert.equal(out[x], f(x, y), `seed ${seed} ${W}x${H} cells ${cells} oct ${oct} at ${x},${y}`);
    }
  }
});

test('fbmRows: a row read again after others gives the same values (no state carried over)', () => {
  const row = fbmRows(42, 128, 128, 6, 3), a = new Float64Array(128), b = new Float64Array(128);
  row(10, a); row(90, b); row(10, b);
  assert.deepEqual([...b], [...a]);
});

test('drain runs a sliced build to its end and returns its result', () => {
  let steps = 0;
  function* build() { for (let i = 0; i < 5; i++) { steps++; yield; } return 'made'; }
  assert.equal(drain(build()), 'made');
  assert.equal(steps, 5);
});

test('brushTextures: every brush fill, and its border texture when it has a border, each once', () => {
  const t = brushTextures();
  assert.equal(new Set(t).size, t.length, 'no repeats');
  for (const b of BRUSH_PRESETS) {
    assert.ok(t.includes(b.style.tex), `${b.name} fill ${b.style.tex}`);
    if (b.style.border > 0) assert.ok(t.includes(b.style.btex), `${b.name} border ${b.style.btex}`);
  }
  const want = new Set(BRUSH_PRESETS.flatMap(b => [b.style.tex, ...(b.style.border > 0 ? [b.style.btex] : [])]));
  assert.equal(t.length, want.size, 'nothing beyond the brushes');
});
