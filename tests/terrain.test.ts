// Headless terrain tests: npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP } from '../src/game/iso';
import { TC, generateTerrain, checkGuarantees, priorityFlood, flowDirs, flowAccum, traceDown, type Terrain } from '../src/game/terrain';

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
  assert.deepEqual(a.towns, b.towns);
});

test('different seeds give different maps', () => {
  assert.notEqual(fnv(gen(1).cls), fnv(gen(2).cls));
});

/** cumulative arc length along a polyline, in tiles (entry k is the length up to point k) */
function arcLengths(pts: { x: number; y: number }[]): number[] {
  const s = [0];
  for (let k = 1; k < pts.length; k++) s.push(s[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
  return s;
}

/** distance from (x, y) to a polyline, in tiles */
function distPolyline(pts: { x: number; y: number }[], x: number, y: number): number {
  let best = Infinity;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L2)) : 0;
    best = Math.min(best, Math.hypot(a.x + dx * t - x, a.y + dy * t - y));
  }
  return best;
}

test('20 seeds pass the guarantees, generate in under 4 s each (a retry included; the worker PC averages 0.36 s, the dev PC is several times slower), and the river and creeks stay sane', () => {
  let creekTotal = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const t0 = performance.now();
    const t = generateTerrain(seed);
    const ms = performance.now() - t0;
    memo.set(seed, t);
    const rep = checkGuarantees(t);
    const river = t.waters.find(w => w.kind === 'river')!.pts;
    const creeks = t.waters.filter(w => w.kind === 'creek');
    creekTotal += creeks.length;
    console.log(`seed ${seed} attempt ${t.attempt} connected ${pct(rep.buildableConnected)} sideA ${pct(rep.sideA)} sideB ${pct(rep.sideB)} chokepoints [${t.chokepoints.map(c => c.kind).join(',')}] creeks ${creeks.length} ${ms.toFixed(0)} ms`);
    assert.ok(rep.ok, `seed ${seed}: ${rep.reasons.join('; ')}`);
    assert.ok(ms < 4000, `seed ${seed} took ${ms.toFixed(0)} ms`);
    // river: points within 48 tiles of arc length from either end are the entry and exit; all others keep 24+ tiles from the border
    const rs = arcLengths(river), rLen = rs[rs.length - 1];
    for (let k = 0; k < river.length; k++) {
      if (rs[k] < 48 || rLen - rs[k] < 48) continue;
      const p = river[k], d = Math.min(p.x, p.y, MAP - p.x, MAP - p.y);
      assert.ok(d >= 24, `seed ${seed}: river point ${k} is ${d.toFixed(1)} tiles from the border`);
    }
    for (const c of creeks) {
      for (const p of c.pts) assert.ok(p.w >= 3 && p.w <= 8, `seed ${seed}: creek width ${p.w}`);
      // creek: points within 48 tiles of arc length from its end are the river/junction end; all others keep 24+ tiles from the border
      const cs = arcLengths(c.pts), cLen = cs[cs.length - 1];
      for (let k = 0; k < c.pts.length; k++) {
        if (cLen - cs[k] < 48) continue;
        const p = c.pts[k], d = Math.min(p.x, p.y, MAP - p.x, MAP - p.y);
        assert.ok(d >= 24, `seed ${seed}: creek point ${k} is ${d.toFixed(1)} tiles from the border`);
      }
      // a creek ends at the river, at the border, or at another creek
      const end = c.pts[c.pts.length - 1];
      const onRiver = distPolyline(river, end.x, end.y) <= end.w / 2 + 24;
      const onBorder = Math.min(end.x, end.y, MAP - end.x, MAP - end.y) <= 4;
      const onCreek = creeks.some(o => o !== c && o.pts.some(q => Math.hypot(q.x - end.x, q.y - end.y) <= 6));
      assert.ok(onRiver || onBorder || onCreek, `seed ${seed}: creek ends ${distPolyline(river, end.x, end.y).toFixed(1)} tiles from the river`);
    }
    // the start block is buildable and creek-free
    for (let y = t.start.y; y < t.start.y + t.start.size; y++) for (let x = t.start.x; x < t.start.x + t.start.size; x++)
      assert.notEqual(t.cls[y * MAP + x], TC.CREEK, `seed ${seed}: creek in the start block`);
    // three town sites 750..1500 tiles apart (centre to centre), creek-free, at least 128 tiles from every border
    assert.equal(t.towns.length, 3, `seed ${seed}: ${t.towns.length} town sites`);
    const tcen = t.towns.map(w => ({ x: w.x + 32, y: w.y + 32 }));
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      const d = Math.hypot(tcen[i].x - tcen[j].x, tcen[i].y - tcen[j].y);
      assert.ok(d >= 750 && d <= 1500, `seed ${seed}: towns ${i} and ${j} are ${d.toFixed(1)} tiles apart`);
    }
    for (const w of t.towns) {
      for (let y = w.y; y < w.y + w.size; y++) for (let x = w.x; x < w.x + w.size; x++)
        assert.notEqual(t.cls[y * MAP + x], TC.CREEK, `seed ${seed}: creek in a town site`);
      assert.ok(w.x >= 128 && w.y >= 128 && w.x + w.size <= MAP - 128 && w.y + w.size <= MAP - 128, `seed ${seed}: town site at ${w.x},${w.y} within 128 tiles of a border`);
    }
  }
  assert.ok(creekTotal >= 30, `only ${creekTotal} creeks over 20 seeds`);
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
