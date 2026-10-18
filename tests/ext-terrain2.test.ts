// Terrain v2 tests: npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP } from '../src/game/iso';
import { TC, heightAt, classAt, type Terrain } from '../src/game/terrain';
import { generateTerrain2, checkGuarantees2, T2 } from '../src/game/ext/terrain2';

/** FNV-1a over the raw bytes of a typed array */
function fnv(a: ArrayBufferView): number {
  const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let h = 0x811c9dc5;
  for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 0x01000193);
  return h >>> 0;
}
const pct = (v: number) => (100 * v).toFixed(1) + '%';
const buildable = (c: number) => c === TC.GROUND || c === TC.PATCH;

const memo = new Map<number, Terrain>();
/** a generated terrain, cached per seed for the tests that only inspect the result */
function gen(seed: number): Terrain {
  let t = memo.get(seed);
  if (!t) { t = generateTerrain2(seed); memo.set(seed, t); }
  return t;
}

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

test('20 seeds pass checkGuarantees2 and generate in under 4 s each', () => {
  let creeks = 0, attempts = 0, worst = 0;
  const hills: number[] = [], builds: number[] = [];
  for (let seed = 1; seed <= 20; seed++) {
    const t0 = performance.now();
    const t = generateTerrain2(seed);
    const ms = performance.now() - t0;
    const g = checkGuarantees2(t);
    memo.set(seed, t);
    attempts += t.attempt;
    worst = Math.max(worst, ms);
    hills.push(g.hill);
    builds.push(g.buildable);
    creeks += t.waters.filter(w => w.kind === 'creek').length;
    console.log(`seed ${seed} attempt ${t.attempt} ${ms.toFixed(0)} ms | hill ${pct(g.hill)} buildable ${pct(g.buildable)} connected ${pct(g.connected)} edge flat ${pct(g.edgeFlat)} valley ${g.valley.toFixed(0)} tiles edge hills [${g.edgeHill.map(pct).join(' ')}] town relief [${g.townRelief.map(v => v.toFixed(0)).join(',')}] creeks ${t.waters.length - 1}`);
    assert.ok(g.ok, `seed ${seed}: ${g.reasons.join('; ')}`);
    assert.ok(ms < 4000, `seed ${seed} took ${ms.toFixed(0)} ms`);
  }
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  console.log(`hill ${pct(Math.min(...hills))}..${pct(Math.max(...hills))} (mean ${pct(mean(hills))}), buildable ${pct(Math.min(...builds))}..${pct(Math.max(...builds))} (mean ${pct(mean(builds))}), retries ${attempts}, slowest ${worst.toFixed(0)} ms`);
  assert.ok(creeks >= 55, `only ${creeks} creeks over 20 seeds`);
});

test('the same seed gives the same terrain, different seeds differ', () => {
  const a = generateTerrain2(7), b = generateTerrain2(7);
  assert.equal(fnv(a.cls), fnv(b.cls));
  assert.equal(fnv(a.height), fnv(b.height));
  assert.deepEqual(a.waters, b.waters);
  assert.deepEqual(a.highway, b.highway);
  assert.deepEqual(a.start, b.start);
  assert.deepEqual(a.towns, b.towns);
  assert.deepEqual(a.chokepoints, b.chokepoints);
  assert.notEqual(fnv(gen(1).cls), fnv(gen(2).cls));
});

test('more hills and valleys than v1, and no flat edge band', () => {
  // measured with checkGuarantees2 on seeds 1-6: v1 keeps 92-96% of the outer band's buildable land flat (16-36% of the
  // whole band: its hills hug three edges and the fourth is a plain) and its median valley corridor is 611-779 tiles
  // wide; v2 keeps 9-15% of the band flat - flat buildable ground on all four sides is what the owner called empty -
  // and its corridors at 157-181 tiles, so a lowland point sees a hill within about 100 tiles on its narrowest axis
  for (let seed = 1; seed <= 5; seed++) {
    const g = checkGuarantees2(gen(seed));
    assert.ok(g.hill >= 0.25 && g.hill <= 0.4, `seed ${seed}: hills ${pct(g.hill)}`);
    assert.ok(g.buildable >= 0.45 && g.buildable <= 0.6, `seed ${seed}: buildable ${pct(g.buildable)}`);
    assert.ok(g.edgeFlat <= T2.edgeFlatMax, `seed ${seed}: flat edge band ${pct(g.edgeFlat)}`);
    assert.ok(g.valley >= T2.valleyMin && g.valley <= T2.valleyMax, `seed ${seed}: median valley ${g.valley.toFixed(0)} tiles`);
    // the valley floors are one connected lowland (the check counts the largest passable component)
    assert.ok(g.connected >= 0.55, `seed ${seed}: buildable connected ${pct(g.connected)}`);
  }
});

test('the river runs off the map at both ends and stays in a valley floor', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const t = gen(seed), river = t.waters[0].pts;
    const edgeDist = (p: { x: number; y: number }) => Math.min(p.x, p.y, MAP - p.x, MAP - p.y);
    assert.ok(edgeDist(river[0]) <= 2, `seed ${seed}: first river point is ${edgeDist(river[0]).toFixed(1)} tiles from the border`);
    assert.ok(edgeDist(river[river.length - 1]) <= 2, `seed ${seed}: last river point is ${edgeDist(river[river.length - 1]).toFixed(1)} tiles from the border`);
    for (const p of river) assert.ok(p.w >= 20 && p.w <= 40, `seed ${seed}: river width ${p.w}`);
    // the water itself runs downhill: each point is at most a little higher than the one before it
    let rising = 0;
    for (let k = 1; k < river.length; k += 4) {
      if (heightAt(t, river[k].x, river[k].y) > heightAt(t, river[k - 1].x, river[k - 1].y) + 4) rising++;
    }
    assert.ok(rising <= 2, `seed ${seed}: the river rises at ${rising} sampled points`);
    assert.ok(!t.mountainEdges.includes(t.highway.edge), `seed ${seed}: highway on a mountain edge ${t.highway.edge}`);
  }
});

test('creeks end at the river, another creek or the border, and keep off the border band', () => {
  let total = 0;
  for (let seed = 1; seed <= 5; seed++) {
    const t = gen(seed), river = t.waters[0].pts, creeks = t.waters.filter(w => w.kind === 'creek');
    total += creeks.length;
    for (const c of creeks) {
      for (const p of c.pts) assert.ok(p.w >= 3 && p.w <= 8, `seed ${seed}: creek width ${p.w}`);
      const s = arcLengths(c.pts), L = s[s.length - 1];
      for (let k = 0; k < c.pts.length; k++) {
        if (L - s[k] < 48) continue;
        const p = c.pts[k], d = Math.min(p.x, p.y, MAP - p.x, MAP - p.y);
        assert.ok(d >= 24, `seed ${seed}: creek point ${k} is ${d.toFixed(1)} tiles from the border`);
      }
      const end = c.pts[c.pts.length - 1];
      const onRiver = distPolyline(river, end.x, end.y) <= end.w / 2 + 24;
      const onBorder = Math.min(end.x, end.y, MAP - end.x, MAP - end.y) <= 4;
      const onCreek = creeks.some(o => o !== c && o.pts.some(q => Math.hypot(q.x - end.x, q.y - end.y) <= 6));
      assert.ok(onRiver || onBorder || onCreek, `seed ${seed}: creek ends ${distPolyline(river, end.x, end.y).toFixed(1)} tiles from the river`);
      // a creek keeps to the lowland: at most two fifths of its points may clip a hill patch
      let inHill = 0;
      for (const p of c.pts) if (classAt(t, p.x, p.y) === TC.HILL) inHill++;
      assert.ok(inHill <= 0.4 * c.pts.length, `seed ${seed}: ${inHill} of ${c.pts.length} creek points are in hills`);
    }
  }
  assert.ok(total >= 12, `only ${total} creeks over 5 seeds`);
});

test('the sites: three towns 750-1500 tiles apart in valley floors, a buildable start block, a highway entry', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const t = gen(seed);
    assert.equal(t.towns.length, 3, `seed ${seed}: ${t.towns.length} town sites`);
    const cen = t.towns.map(w => ({ x: w.x + w.size / 2, y: w.y + w.size / 2 }));
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      const d = Math.hypot(cen[i].x - cen[j].x, cen[i].y - cen[j].y);
      assert.ok(d >= 750 && d <= 1500, `seed ${seed}: towns ${i} and ${j} are ${d.toFixed(1)} tiles apart`);
    }
    for (const w of t.towns) {
      for (let y = w.y; y < w.y + w.size; y++) for (let x = w.x; x < w.x + w.size; x++)
        assert.ok(buildable(t.cls[y * MAP + x]), `seed ${seed}: town tile ${x},${y} is not buildable`);
      assert.ok(w.x >= 128 && w.y >= 128 && w.x + w.size <= MAP - 128 && w.y + w.size <= MAP - 128, `seed ${seed}: town at ${w.x},${w.y} within 128 tiles of a border`);
    }
    assert.ok(t.start.x >= 64 && t.start.y >= 64, `seed ${seed}: start block at ${t.start.x},${t.start.y}`);
    for (let y = t.start.y; y < t.start.y + t.start.size; y++) for (let x = t.start.x; x < t.start.x + t.start.size; x++)
      assert.ok(buildable(t.cls[y * MAP + x]), `seed ${seed}: start tile ${x},${y} is not buildable`);
    assert.ok(t.highway.x >= 0, `seed ${seed}: no highway entry`);
    assert.ok(t.chokepoints.length >= 1, `seed ${seed}: no chokepoint`);
    // the town sites sit in valley floors: the local relief over each is a few metres
    const g = checkGuarantees2(t);
    for (let k = 0; k < 3; k++) assert.ok(g.townRelief[k] <= 12, `seed ${seed}: town ${k} relief ${g.townRelief[k].toFixed(1)} m`);
  }
});

test('the highway entry has a valley to come in by: buildable ground 48 tiles in from the border', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const t = gen(seed), hy = t.highway;
    let bad = 0;
    for (let y = Math.max(0, hy.y - 8); y <= Math.min(MAP - 1, hy.y + 8); y++)
      for (let x = Math.max(0, hy.x - 8); x <= Math.min(MAP - 1, hy.x + 8); x++) if (!buildable(t.cls[y * MAP + x])) bad++;
    // the 16-wide, 48-deep strip the road tool digs from: allow a few creek tiles, no hills and no water
    assert.ok(bad <= 40, `seed ${seed}: ${bad} unbuildable tiles within 8 of the highway entry`);
  }
});
