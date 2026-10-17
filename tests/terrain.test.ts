// Headless terrain tests: npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP } from '../src/game/iso';
import { generateTerrain, checkGuarantees, priorityFlood, flowDirs, flowAccum, traceDown, type Terrain } from '../src/game/terrain';

/** FNV-1a over the raw bytes of a typed array */
function fnv(a: ArrayBufferView): number {
  const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let h = 0x811c9dc5;
  for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 0x01000193);
  return h >>> 0;
}
const pct = (v: number) => (v * 100).toFixed(1) + '%';

const memo = new Map<number, Terrain>();
/** a generated terrain, cached per seed for the tests that only inspect the result */
function gen(seed: number): Terrain {
  let t = memo.get(seed);
  if (!t) { t = generateTerrain(seed); memo.set(seed, t); }
  return t;
}

test('the same seed gives the same terrain', () => {
  const a = generateTerrain(7), b = generateTerrain(7);
  assert.equal(fnv(a.cls), fnv(b.cls));
  assert.equal(fnv(a.height), fnv(b.height));
  assert.deepEqual(a.waters, b.waters);
  assert.deepEqual(a.highway, b.highway);
  assert.deepEqual(a.start, b.start);
});

test('different seeds give different maps', () => {
  assert.notEqual(fnv(gen(1).cls), fnv(gen(2).cls));
});

test('20 seeds pass the guarantees, generate in under 2 s each, and the river stays off the border', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const t0 = performance.now();
    const t = generateTerrain(seed);
    const ms = performance.now() - t0;
    memo.set(seed, t);
    const rep = checkGuarantees(t);
    console.log(`seed ${seed} attempt ${t.attempt} connected ${pct(rep.buildableConnected)} sideA ${pct(rep.sideA)} sideB ${pct(rep.sideB)} chokepoints [${t.chokepoints.map(c => c.kind).join(',')}] ${ms.toFixed(0)} ms`);
    assert.ok(rep.ok, `seed ${seed}: ${rep.reasons.join('; ')}`);
    assert.ok(ms < 2000, `seed ${seed} took ${ms.toFixed(0)} ms`);
    // every river point except the first 3 and last 4 keeps 24+ tiles from the map border; the last 4 are the
    // perpendicular exit (8-tile spacing puts the 4th-last point ~20 tiles out), so they are not a hugging river
    const pts = t.waters[0].pts;
    for (let k = 3; k < pts.length - 4; k++) {
      const p = pts[k], d = Math.min(p.x, p.y, MAP - p.x, MAP - p.y);
      assert.ok(d >= 24, `seed ${seed}: river point ${k} is ${d.toFixed(1)} tiles from the border`);
    }
  }
});

test('the river runs off the map at both ends and its widths stay in 20..40', () => {
  const edgeDist = (p: { x: number; y: number }) => Math.min(p.x, p.y, MAP - p.x, MAP - p.y);
  for (let seed = 1; seed <= 5; seed++) {
    const t = gen(seed), pts = t.waters[0].pts;
    assert.ok(edgeDist(pts[0]) <= 2, `seed ${seed}: first point ${edgeDist(pts[0]).toFixed(1)} tiles from the border`);
    assert.ok(edgeDist(pts[pts.length - 1]) <= 2, `seed ${seed}: last point ${edgeDist(pts[pts.length - 1]).toFixed(1)} tiles from the border`);
    for (const p of pts) assert.ok(p.w >= 20 && p.w <= 40, `seed ${seed}: width ${p.w}`);
    assert.ok(!t.mountainEdges.includes(t.highway.edge), `seed ${seed}: highway on a mountain edge ${t.highway.edge}`);
  }
});

test('flow accumulation collects a tilted plane into its low corner', () => {
  const n = 8;
  const h = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) h[y * n + x] = 10 + 0.5 * x + 0.3 * y;
  const f = priorityFlood(h, n), dir = flowDirs(f, n), acc = flowAccum(dir, n, f);
  const onBorder = (c: number) => { const x = c % n, y = (c - x) / n; return x === 0 || y === 0 || x === n - 1 || y === n - 1; };
  let outlet = 0;
  for (let i = 1; i < n * n; i++) if (acc[i] > acc[outlet]) outlet = i;
  assert.equal(outlet, 0, 'the lowest border corner collects the most flow');
  assert.ok(onBorder(outlet));
  assert.equal(acc[0], 7);
  for (let c = 0; c < n * n; c++) {
    const path = traceDown(dir, c);
    assert.ok(onBorder(path[path.length - 1]), `cell ${c} does not drain to the border`);
  }
});
