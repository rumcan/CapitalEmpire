// T360 (#1015; the owner, 2026-11-09: "we still have a river that looks like a canal?"): the natural river of terrain model 2. Headless: npm test
// (bundled by esbuild, run by node --test). The river meanders (no long straight run), its width swings (wider in the bends), its banks differ (a
// point bar on the inside of a bend, the cut bank on the outside, each bank its own bays and points), it is the same river for the same seed, and a
// save from before keeps the river it was built beside (terrain model 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAP, mulberry } from '../src/game/iso';
import { TC, TERRAIN_MODEL, classAt, generateTerrain, terrainModelOf, type Terrain, type WaterPoint } from '../src/game/terrain';
import { STRUCT_MAX, groundClass, splitByTerrain } from '../src/game/structures';
import { SK, type Leg } from '../src/game/network';
import { BAR_SHARE, NAT, W_MAX, meanderLine, resampleLine, shapeRiver } from '../src/game/terrain/river';
import { hash2, makeNoise } from '../src/game/terrain/noise';
import { CUT, barShape } from '../src/game/terrain-paint';
import { MapWater, waterRuns } from '../src/game/map-water';
import { RIVER_BAND, RIVER_BAND_NAT, RIVER_NAT, SwampField, natReachAt, riverBandOf2, riverStreams } from '../src/game/swamp';
import { BELT, beltField, riverBeltCell } from '../src/game/river-trees';
import { FOREST_CELL } from '../src/game/forest';
import type { Waterway } from '../src/game/terrain/types';

function fnv(a: ArrayBufferView): number {
  const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let h = 0x811c9dc5;
  for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i]!, 0x01000193);
  return h >>> 0;
}
/** a hash of every waterway's points (kind, count, then x, y, w of each): the old river's, as the old generator made it */
function hashWaters(ws: readonly Waterway[]): number {
  const f: number[] = [];
  for (const w of ws) { f.push(w.kind === 'river' ? 1 : 2, w.pts.length); for (const p of w.pts) f.push(p.x, p.y, p.w); }
  return fnv(Float64Array.from(f));
}
const memo = new Map<string, Terrain>();
const gen = (seed: number, model: number = TERRAIN_MODEL): Terrain => { const k = `${seed}:${model}`; let t = memo.get(k); if (!t) memo.set(k, t = generateTerrain(seed, model)); return t; };
const riverOf = (t: Terrain): WaterPoint[] => t.waters.find(w => w.kind === 'river')!.pts;

// ---- measures of a river's shape

/** the points smoothed (a moving average over k points either side) */
const smoothed = (p: readonly WaterPoint[], k: number) => p.map((_, i) => { let x = 0, y = 0, n = 0; for (let j = Math.max(0, i - k); j <= Math.min(p.length - 1, i + k); j++) { x += p[j]!.x; y += p[j]!.y; n++; } return { x: x / n, y: y / n }; });
const arcsOf = (p: readonly { x: number; y: number }[]) => { const s = [0]; for (let i = 1; i < p.length; i++) s.push(s[i - 1]! + Math.hypot(p[i]!.x - p[i - 1]!.x, p[i]!.y - p[i - 1]!.y)); return s; };
/** the heading at each point over about 2 x half tiles of arc, unwrapped */
function headings(p: readonly { x: number; y: number }[], s: readonly number[], half: number): number[] {
  const th: number[] = [];
  for (let i = 0; i < p.length; i++) { let a = i, b = i; while (a > 0 && s[i]! - s[a]! < half) a--; while (b < p.length - 1 && s[b]! - s[i]! < half) b++; th.push(Math.atan2(p[b]!.y - p[a]!.y, p[b]!.x - p[a]!.x)); }
  for (let i = 1; i < th.length; i++) { let d = th[i]! - th[i - 1]!; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; th[i] = th[i - 1]! + d; }
  return th;
}
/** the longest run of the river (tiles of arc) whose heading stays within dTheta radians in all: a ruler-straight reach, a canal */
function longestStraight(river: readonly WaterPoint[], dTheta = 0.35, half = 10): number {
  const sp = smoothed(river, 4), s = arcsOf(sp), th = headings(sp, s, half);
  let best = 0;
  for (let i = 0; i < th.length; i++) {
    let lo = th[i]!, hi = th[i]!, e = i;
    while (e + 1 < th.length) { const t = th[e + 1]!; if (Math.max(hi, t) - Math.min(lo, t) > dTheta) break; hi = Math.max(hi, t); lo = Math.min(lo, t); e++; }
    best = Math.max(best, s[e]! - s[i]!); if (e === th.length - 1) break;
  }
  return best;
}
/** the signed turning (radians a tile; positive: the heading grows) at each point over `half` tiles either side */
function turning(river: readonly WaterPoint[], half = 30): number[] {
  const sp = smoothed(river, 4), s = arcsOf(sp), th = headings(sp, s, 10), k: number[] = [];
  for (let i = 0; i < th.length; i++) { let a = i, b = i; while (a > 0 && s[i]! - s[a]! < half) a--; while (b < th.length - 1 && s[b]! - s[i]! < half) b++; k.push(b > a ? (th[b]! - th[a]!) / (s[b]! - s[a]!) : 0); }
  return k;
}
const mean = (v: readonly number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const sd = (v: readonly number[]) => { const m = mean(v); return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); };
const corr = (a: readonly number[], b: readonly number[]) => { const ma = mean(a), mb = mean(b); let c = 0, va = 0, vb = 0; for (let i = 0; i < a.length; i++) { c += (a[i]! - ma) * (b[i]! - mb); va += (a[i]! - ma) ** 2; vb += (b[i]! - mb) ** 2; } return c / Math.sqrt(va * vb || 1); };

// ---- the old river is the old river (a save from before T360 keeps it)

test('a save without a terrain model is model 1: terrainModelOf, and the latest is the natural river', () => {
  assert.equal(TERRAIN_MODEL, 2);
  assert.equal(terrainModelOf(undefined), 1);
  assert.equal(terrainModelOf(null), 1);
  assert.equal(terrainModelOf('2'), 1);
  assert.equal(terrainModelOf(NaN), 1);
  assert.equal(terrainModelOf(0), 1);
  assert.equal(terrainModelOf(1), 1);
  assert.equal(terrainModelOf(2), 2);
  assert.equal(terrainModelOf(2.9), 2);
  assert.equal(terrainModelOf(99), TERRAIN_MODEL, 'a save from a newer build keeps the newest river this build can make');
  assert.equal(gen(7).model, TERRAIN_MODEL);
  assert.equal(gen(7, 1).model, 1);
  assert.equal(generateTerrain(7).model, 1, 'a call without a model is the old valley, as a save without one is');
  assert.equal(fnv(generateTerrain(7).cls), fnv(gen(7, 1).cls));
  assert.equal(gen(7).waters[0]!.nat, true);
  assert.equal(gen(7, 1).waters[0]!.nat, undefined);
});

test('the game stamps the terrain model in its saves and builds the valley of a load by it (a save without one: model 1); a new game asks for the latest', () => {
  const e = readFileSync(resolve('src/game/engine.ts'), 'utf8'), sv = readFileSync(resolve('src/game/save.ts'), 'utf8');
  assert.match(sv, /terrainModel\?: number;/);
  assert.match(e, /terrainModel: this\.terrain\.model \?\? TERRAIN_MODEL,/, 'the save');
  assert.match(e, /this\.genTerrain\(d\.seed, terrainModelOf\(d\.terrainModel\)\)/, 'the load: the model of the save, model 1 without one');
  assert.match(e, /private genTerrain\(seed: number, model: number = this\.devTerrain \|\| TERRAIN_MODEL\) \{ this\.useTerrain\(generateTerrain\(seed, model\), seed\); \}/, 'a new game: the latest');
  // (and nothing else in the engine makes a valley by a bare generateTerrain: a map made without the model would be the old river)
  assert.equal((e.match(/generateTerrain\(/g) ?? []).length, 1);
});

/** the old generator's maps (taken from lead/live before T360): the class grid's and the waterways' hashes, a seed each */
const OLD: readonly [number, number, number][] = [
  [1, 4203995818, 3996214917], [2, 3368225484, 3709549715], [3, 331651335, 3165639884], [7, 878236055, 2388974901], [13, 3826656724, 2006434788], [42, 2572766161, 3339362247], [100, 159438908, 4269907959],
];
test('model 1 (a save from before) is the old valley bit for bit: the same classes and the same river, no meander, no bar', () => {
  for (const [seed, cls, waters] of OLD) {
    const t = gen(seed, 1);
    assert.equal(fnv(t.cls), cls, `seed ${seed}: the classes are the old ones`);
    assert.equal(hashWaters(t.waters), waters, `seed ${seed}: the waterways are the old ones`);
    assert.equal(t.attempt, 0);
    for (const w of t.waters) for (const p of w.pts) assert.equal(p.bar, undefined, 'the old river has no point bar');
    for (const p of riverOf(t)) assert.ok(p.w >= 20 && p.w <= 40, `seed ${seed}: width ${p.w}`);
  }
});

/** the natural river's hash: every waterway rounded to a thousandth of a tile (kind, count, then x, y, w and bar of each point), so the last bit of a float is no part of it */
function hashWatersNat(ws: readonly Waterway[]): number {
  const f: number[] = [];
  for (const w of ws) { f.push(w.kind === 'river' ? 1 : 2, w.pts.length); for (const p of w.pts) f.push(Math.round(p.x * 1000), Math.round(p.y * 1000), Math.round(p.w * 1000), Math.round((p.bar ?? 0) * 1000)); }
  return fnv(Float64Array.from(f));
}
/** model 2's maps as T360 made them: a save stamped 2 builds its valley again from these numbers, a seed each */
const NAT_PINNED: readonly [number, number, number][] = [
  [1, 2219442668, 403532857], [2, 459471939, 2387361220], [3, 1602431070, 530944695], [7, 4237105600, 1961143410], [13, 4003714651, 2200979767], [42, 3588255045, 3660263270], [100, 636312604, 776269099],
];
test('model 2 is a contract too: a save stamped 2 gets the same classes and the same river (a change to the natural river is a model 3, not an edit of model 2)', () => {
  for (const [seed, cls, waters] of NAT_PINNED) {
    const t = gen(seed, 2);
    assert.equal(fnv(t.cls), cls, `seed ${seed}: the classes of model 2 changed (make it a new terrain model, TERRAIN_MODEL + 1)`);
    assert.equal(hashWatersNat(t.waters), waters, `seed ${seed}: the waterways of model 2 changed (make it a new terrain model, TERRAIN_MODEL + 1)`);
  }
});

test('the same seed gives the same natural river, and different seeds different ones', () => {
  const a = generateTerrain(7, TERRAIN_MODEL), b = generateTerrain(7, TERRAIN_MODEL);
  assert.equal(fnv(a.cls), fnv(b.cls));
  assert.deepEqual(a.waters, b.waters);
  assert.deepEqual(a.chokepoints, b.chokepoints);
  assert.notEqual(fnv(gen(1).cls), fnv(gen(2).cls));
  assert.notDeepEqual(riverOf(gen(1)).slice(0, 80).map(p => p.x), riverOf(gen(2)).slice(0, 80).map(p => p.x));
  // the natural river is not the old one
  assert.notEqual(fnv(gen(7).cls), fnv(gen(7, 1).cls));
});

// ---- the course: it meanders

test('the river meanders: no long straight run (the old one had reaches of hundreds of tiles), and it is a good deal longer than its chord', () => {
  const N = 200, worst: string[] = [];
  let longest = 0, sum = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const r = riverOf(gen(seed)), run = longestStraight(r);
    longest = Math.max(longest, run); sum += run; if (run > N) worst.push(`${seed}: ${run.toFixed(0)}`);
    const s = arcsOf(r), chord = Math.hypot(r[r.length - 1]!.x - r[0]!.x, r[r.length - 1]!.y - r[0]!.y), sinuosity = s[s.length - 1]! / chord;
    assert.ok(sinuosity > 1.1 && sinuosity < 1.6, `seed ${seed}: sinuosity ${sinuosity.toFixed(2)}`);
  }
  assert.deepEqual(worst, [], `a reach of the river is straighter than ${N} tiles (heading within 20 degrees): the longest ${longest.toFixed(0)}`);
  assert.ok(sum / 100 < 160, `the river's longest reach within 20 degrees averages ${(sum / 100).toFixed(0)} tiles`);
  // the measure itself: the old river's reaches run from 200 to 600 tiles
  let oldSum = 0; for (const seed of [1, 2, 3, 7, 13, 42]) oldSum += longestStraight(riverOf(gen(seed, 1)));
  assert.ok(oldSum / 6 > 2 * (sum / 100), `the old rivers' longest reaches average ${(oldSum / 6).toFixed(0)} tiles, the natural ones' ${(sum / 100).toFixed(0)}`);
});

test('the river enters at one border and leaves at the opposite one, and keeps off the others', () => {
  const edge = (p: { x: number; y: number }) => Math.min(p.x, p.y, MAP - p.x, MAP - p.y);
  for (let seed = 1; seed <= 20; seed++) {
    const t = gen(seed), r = riverOf(t), s = arcsOf(r), L = s[s.length - 1]!;
    assert.ok(edge(r[0]!) <= 2 && edge(r[r.length - 1]!) <= 2, `seed ${seed}: it runs off the map at both ends`);
    for (let k = 0; k < r.length; k++) if (s[k]! > 48 && L - s[k]! > 48) assert.ok(edge(r[k]!) >= 24, `seed ${seed}: point ${k} is ${edge(r[k]!).toFixed(1)} tiles from a border`);
    // (never a fold: no two stretches of the line closer than a river's width, apart from the neighbours)
    for (let i = 0; i < r.length; i += 5) for (let j = i + 1; j < r.length; j += 3) {
      if (s[j]! - s[i]! < 90) continue;
      assert.ok(Math.hypot(r[i]!.x - r[j]!.x, r[i]!.y - r[j]!.y) > (r[i]!.w + r[j]!.w) / 2 + 6, `seed ${seed}: the river runs into itself between ${i} and ${j}`);
    }
  }
});

test('the creeks meander too: no straight run longer than the flow grid left (the old ones had reaches of 200 tiles), their width swings within 2.5 to 9', () => {
  let n = 0, worst = 0, oldWorst = 0;
  for (let seed = 1; seed <= 12; seed++) {
    for (const w of gen(seed).waters) if (w.kind === 'creek' && w.pts.length > 20) { n++; worst = Math.max(worst, longestStraight(w.pts, 0.35, 8)); for (const p of w.pts) assert.ok(p.w >= 2.5 - 1e-9 && p.w <= 9 + 1e-9, `seed ${seed}: creek width ${p.w}`); }
    for (const w of gen(seed, 1).waters) if (w.kind === 'creek' && w.pts.length > 20) oldWorst = Math.max(oldWorst, longestStraight(w.pts, 0.35, 8));
  }
  assert.ok(n >= 20, `${n} creeks`);
  assert.ok(worst <= 130, `a creek runs straight for ${worst.toFixed(0)} tiles`);
  assert.ok(oldWorst > worst + 30, `the old creeks' longest straight run ${oldWorst.toFixed(0)} against ${worst.toFixed(0)}`);
});

// ---- the width swings: wider in the bends

test('the width varies along the river: wider at the bends and the pools, narrower on the crossings, within its bounds', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const r = riverOf(gen(seed)), ws = r.map(p => p.w);
    assert.ok(Math.min(...ws) >= NAT.wMin - 1e-9 && Math.max(...ws) <= NAT.wMax + 1e-9, `seed ${seed}: ${Math.min(...ws).toFixed(1)}..${Math.max(...ws).toFixed(1)}`);
    assert.ok(Math.max(...ws) / Math.min(...ws) > 1.5, `seed ${seed}: a river of one width: ${Math.min(...ws).toFixed(1)}..${Math.max(...ws).toFixed(1)}`);
    assert.ok(sd(ws) / mean(ws) > 0.07, `seed ${seed}: the width hardly swings (${(sd(ws) / mean(ws)).toFixed(3)})`);
    const k = turning(r).map(Math.abs);
    assert.ok(corr(ws, k) > 0.25, `seed ${seed}: the bends are not wider (${corr(ws, k).toFixed(2)})`);
  }
  // the old river's width was a slow noise of 20 to 40
  const old = riverOf(gen(1, 1)).map(p => p.w); assert.ok(sd(old) / mean(old) < 0.14);
});

// ---- the banks: bays and points, a point bar inside a bend and the cut bank outside

test('the edges are jagged: the width changes from point to point (small bays and points), each bank with its own', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const r = riverOf(gen(seed)), ws = r.map(p => p.w);
    let d2 = 0; for (let i = 1; i + 1 < ws.length; i++) d2 += Math.abs(ws[i - 1]! - 2 * ws[i]! + ws[i + 1]!); d2 /= ws.length - 2;
    assert.ok(d2 > 0.15, `seed ${seed}: the edge is smooth (${d2.toFixed(3)} tiles of change from point to point)`);
  }
  // the banks differ: the stored point is the middle of the two banks, which sits off the line the river was drawn on (a symmetric river sits on it)
  for (const seed of [1, 2, 3, 4]) {
    const r = mulberry(seed), nk = (k: number) => makeNoise(hash2(seed, k));
    const a = { x: 100 + 800 * r(), y: 0 }, b = { x: 100 + 800 * r(), y: MAP };
    const line = meanderLine(nk(13), a, b, MAP), pts = shapeRiver(line, { width: nk(9), left: nk(15), right: nk(16), pool: nk(17) }), c = resampleLine(line, NAT.step);
    assert.equal(pts.length, c.length);
    const off: number[] = [];
    for (let i = 2; i + 2 < c.length; i++) { const p = c[i - 2]!, q = c[i + 2]!, l = Math.hypot(q.x - p.x, q.y - p.y) || 1; off.push(((pts[i]!.x - c[i]!.x) * -(q.y - p.y) + (pts[i]!.y - c[i]!.y) * (q.x - p.x)) / l); }
    assert.ok(sd(off) > 0.35 && Math.max(...off.map(Math.abs)) > 1, `seed ${seed}: the banks are mirror images (the middle of them strays ${sd(off).toFixed(2)} tiles, at most ${Math.max(...off.map(Math.abs)).toFixed(2)})`);
    assert.ok(off.some(v => v > 0.5) && off.some(v => v < -0.5), 'now one bank is further out, now the other');
  }
});

test('a point bar lies on the inside of every bend, none where the river crosses, and its sand never outgrows the water it belongs to', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const r = riverOf(gen(seed)), k = turning(r);
    let bars = 0, agree = 0, widest = 0;
    for (let i = 0; i < r.length; i++) {
      const b = r[i]!.bar ?? 0; widest = Math.max(widest, Math.abs(b));
      assert.ok(Math.abs(b) <= BAR_SHARE * r[i]!.w + 0.01, `seed ${seed}: a bar ${b} wide on water ${r[i]!.w.toFixed(1)} wide`);
      if (Math.abs(b) > 1) { bars++; if (Math.sign(b) === Math.sign(k[i]!)) agree++; }
    }
    assert.ok(bars > r.length * 0.3, `seed ${seed}: bars along ${((bars / r.length) * 100).toFixed(0)}% of the river`);
    assert.ok(agree / bars > 0.95, `seed ${seed}: the bar is on the inside of the bend at ${((agree / bars) * 100).toFixed(0)}% of its points`);
    assert.ok(widest > 5 && widest <= BAR_SHARE * W_MAX + 0.01, `seed ${seed}: the widest bar ${widest.toFixed(1)} tiles`);
    // where one bend gives way to the next the two bars' horns meet at nothing (the sign changes between two points: both are slight); the bars
    // follow the bends (their width goes with the turning), and there are stretches without one
    for (let i = 0; i + 1 < r.length; i++) if ((r[i]!.bar ?? 0) * (r[i + 1]!.bar ?? 0) < 0) assert.ok(Math.abs(r[i]!.bar!) < 2.5 && Math.abs(r[i + 1]!.bar!) < 2.5, `seed ${seed}: the bar changes sides at ${r[i]!.bar} to ${r[i + 1]!.bar}`);
    const ab = r.map(p => Math.abs(p.bar ?? 0)), none = ab.filter(v => v < 0.5).length / ab.length;
    assert.ok(corr(ab, k.map(Math.abs)) > 0.7, `seed ${seed}: the bars do not follow the bends (${corr(ab, k.map(Math.abs)).toFixed(2)})`);
    assert.ok(none > 0.04 && none < 0.5, `seed ${seed}: ${(none * 100).toFixed(0)}% of the river has no bar`);
  }
  // the creeks have none
  for (const w of gen(3).waters) if (w.kind === 'creek') for (const p of w.pts) assert.equal(p.bar, undefined);
});

test('the classes follow the water: its banks are 3 tiles wide and as wide as the bar on the inside of a bend, the cut bank 3 tiles', () => {
  for (const seed of [1, 2, 3]) {
    const t = gen(seed), r = riverOf(t);
    let checked = 0;
    for (let i = 10; i + 10 < r.length; i += 7) {
      const p = r[i]!, b = p.bar ?? 0; if (Math.abs(b) < 6) continue;
      const a = r[i - 2]!, c = r[i + 2]!, l = Math.hypot(c.x - a.x, c.y - a.y), nx = -(c.y - a.y) / l, ny = (c.x - a.x) / l, side = Math.sign(b);
      const at = (d: number, sd: number) => { const x = Math.floor(p.x + nx * sd * d), y = Math.floor(p.y + ny * sd * d); return x >= 0 && y >= 0 && x < MAP && y < MAP ? t.cls[y * MAP + x] : -1; };
      // along the normal through the point: water to its half width, the bar's bank past it on the bar's side, 3 tiles of bank on the other
      assert.equal(at(p.w / 2 - 3, side), TC.WATER);
      const inBank = at(p.w / 2 + Math.abs(b) * 0.7, side); assert.ok(inBank === TC.BANK || inBank === TC.WATER, `seed ${seed} point ${i}: the bar's side is class ${inBank} at 0.7 of the bar`);
      const outBank = at(p.w / 2 + 5.5, -side); assert.notEqual(outBank, TC.BANK, `seed ${seed} point ${i}: the cut bank's side is bank 5.5 tiles out`);
      checked++;
    }
    assert.ok(checked >= 3, `seed ${seed}: ${checked} bends checked`);
  }
});

test('a bridge site, the start block, the three town sites and the highway are found on the natural river\'s maps as before', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const t = gen(seed);
    assert.equal(t.towns.length, 3, `seed ${seed}: town sites`); assert.ok(t.start.x >= 0, `seed ${seed}: start block`); assert.ok(t.highway.x >= 0, `seed ${seed}: highway`);
    assert.ok(t.chokepoints.some(c => c.kind === 'bridge'), `seed ${seed}: a bridge site`);
    const bridge = t.chokepoints.find(c => c.kind === 'bridge')!, r = riverOf(t);
    assert.ok(Math.min(...r.map(p => Math.hypot(p.x - bridge.x, p.y - bridge.y))) < 1e-6, `seed ${seed}: the bridge site lies on the river`);
  }
});

// ---- roads and bridges

/** the bridge runs of a straight road across the map (axis x: along y = c; y: along x = c) over the terrain: their number and the longest, tiles */
function bridgeRuns(t: Terrain, axis: 'x' | 'y', c: number): { runs: number; longest: number } {
  const leg: Leg = axis === 'x' ? { a: { x: 0, y: c }, b: { x: MAP - 1, y: c } } : { a: { x: c, y: 0 }, b: { x: c, y: MAP - 1 } };
  const { legs, kinds } = splitByTerrain([leg], 3, (x, y) => groundClass(classAt(t, x, y)));
  let runs = 0, run = 0, longest = 0;
  for (let i = 0; i < legs.length; i++) {
    if (kinds[i] !== SK.BRIDGE) { run = 0; continue; }
    if (i === 0 || kinds[i - 1] !== SK.BRIDGE) { runs++; run = 0; }
    run += Math.hypot(legs[i]!.b.x - legs[i]!.a.x, legs[i]!.b.y - legs[i]!.a.y); longest = Math.max(longest, run);
  }
  return { runs, longest };
}
test('roads and bridges: a straight road across the river bridges it once (the river never doubles back along its way), a road along it crosses its meanders', () => {
  let across = 0, along = 0, alongMulti = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const t = gen(seed), r = riverOf(t), chord = { x: r[r.length - 1]!.x - r[0]!.x, y: r[r.length - 1]!.y - r[0]!.y }, cross: 'x' | 'y' = Math.abs(chord.x) < Math.abs(chord.y) ? 'x' : 'y', other = cross === 'x' ? 'y' : 'x';
    for (let c = 80; c < MAP - 80; c += 40) {
      const a = bridgeRuns(t, cross, c); across++;
      assert.equal(a.runs, 1, `seed ${seed}: the road at ${cross}=${c} crosses the river in ${a.runs} bridges`);
      assert.ok(a.longest <= STRUCT_MAX[SK.BRIDGE]! * 0.75, `seed ${seed}: the bridge at ${cross}=${c} is ${a.longest.toFixed(0)} tiles long`);
      const b = bridgeRuns(t, other, c); if (b.runs > 0) { along++; if (b.runs > 1) alongMulti++; }
    }
  }
  assert.ok(across >= 300);
  assert.ok(along > 20 && alongMulti > along * 0.2, `roads along the river's way cross it again and again: ${alongMulti} of ${along}`);
});

test("the map's water as the course's joins read it (T338, T344: map-water.ts) is the water the classes say: the same tiles to a few in a thousand", () => {
  for (const seed of [1, 4, 9]) {
    const t = gen(seed), mw = new MapWater(waterRuns(t.waters, k => (k === 'creek' ? 0.35 : 1))), r = riverOf(t);
    let water = 0, bad = 0, dry = 0, wetDry = 0;
    for (let i = 0; i < r.length; i += 12) {
      const p = r[i]!, R = p.w / 2 + 8;
      for (let y = Math.max(0, Math.floor(p.y - R)); y <= Math.min(MAP - 1, Math.ceil(p.y + R)); y++) for (let x = Math.max(0, Math.floor(p.x - R)); x <= Math.min(MAP - 1, Math.ceil(p.x + R)); x++) {
        const isWater = t.cls[y * MAP + x] === TC.WATER, inMap = mw.at(x + 0.5, y + 0.5);
        if (isWater) { water++; if (!inMap) bad++; } else if (t.cls[y * MAP + x] !== TC.CREEK) { dry++; if (inMap) wetDry++; }
      }
    }
    assert.ok(water > 5000 && dry > 5000, `${water} water tiles and ${dry} dry ones looked at`);
    assert.ok(bad <= water * 0.003, `seed ${seed}: ${bad} of ${water} water tiles are not the map's water to the joins`);
    assert.ok(wetDry <= dry * 0.003, `seed ${seed}: ${wetDry} of ${dry} dry tiles are the map's water to the joins`);
  }
});

// ---- the renderer's side: the bars and cut banks, the sided band, the belt

/** a straight river along x at y with its bar on the +N side (N = (-ty, tx) = (0, 1) for a river running along +x: below it, y larger) */
const barRiver = (bar: number, w = 30): Waterway => ({ kind: 'river', nat: true, pts: Array.from({ length: 121 }, (_, k) => ({ x: 100 + k * 3, y: 300, w, bar })) });
class Sink { quads: number[][] = []; cur: number[] = []; moveTo(x: number, y: number) { this.cur = [x, y]; } lineTo(x: number, y: number) { this.cur.push(x, y); } arc() { /* none */ } closePath() { this.quads.push(this.cur); } }
test('barShape: the bar a strip on the bar\'s side from a tile inside the water to the bar\'s width past it; the cut bank the other side, narrow', () => {
  const R = barRiver(9), box: [number, number, number, number] = [0, 0, 1000, 1000];
  const bar = new Sink(), cut = new Sink();
  assert.ok(barShape(bar, R.pts, box, 'bar')); assert.ok(barShape(cut, R.pts, box, 'cut'));
  assert.equal(bar.quads.length, R.pts.length - 1);
  for (const q of bar.quads) { const ys = [q[1]!, q[3]!, q[5]!, q[7]!]; assert.ok(Math.min(...ys) >= 300 + 15 - CUT.inside - 1e-9 && Math.max(...ys) <= 300 + 15 + 9 + 1e-9 && Math.max(...ys) > 300 + 15 + 8.9, `a bar strip spans y ${Math.min(...ys)}..${Math.max(...ys)}`); }
  for (const q of cut.quads) { const ys = [q[1]!, q[3]!, q[5]!, q[7]!]; assert.ok(Math.max(...ys) <= 300 - 15 + CUT.inside + 1e-9 && Math.min(...ys) < 300 - 15 - CUT.min + 0.1 && Math.min(...ys) >= 300 - 15 - CUT.max - 1e-9, `a cut strip spans y ${Math.min(...ys)}..${Math.max(...ys)}`); }
  // grown by the feather, the strip reaches further out; the box keeps the strips off other chunks; the old river, a creek and a river without a bar have none
  const g = new Sink(); barShape(g, R.pts, box, 'bar', 0.7); assert.ok(Math.max(...g.quads.map(q => Math.max(q[1]!, q[3]!, q[5]!, q[7]!))) > 300 + 15 + 9.6);
  assert.equal(barShape(new Sink(), R.pts, [0, 0, 50, 50], 'bar'), false);
  assert.equal(barShape(new Sink(), barRiver(0).pts, box, 'bar'), false);
  assert.equal(barShape(new Sink(), barRiver(0).pts, box, 'cut'), false);
  // the other side: a bar on the -N side turns them over
  const flip = barRiver(-9), fb = new Sink(), fc = new Sink(); barShape(fb, flip.pts, box, 'bar'); barShape(fc, flip.pts, box, 'cut');
  assert.ok(fb.quads.every(q => Math.max(q[1]!, q[3]!, q[5]!, q[7]!) <= 300 - 15 + CUT.inside + 1e-9), 'the bar on the other side');
  assert.ok(fc.quads.every(q => Math.min(q[1]!, q[3]!, q[5]!, q[7]!) >= 300 + 15 - CUT.inside - 1e-9), 'the cut bank on the other side');
});

test('the natural river\'s band: a look of its own for a natural river, the old one\'s for the old; the marsh begins past the bar and is thin on the cut bank', () => {
  assert.equal(riverBandOf2([barRiver(0)]), RIVER_BAND_NAT);
  assert.equal(riverBandOf2([{ kind: 'river' }]), RIVER_BAND);
  assert.equal(riverBandOf2([{ kind: 'creek', nat: true }]), RIVER_BAND);
  // the reach by side: past the bar on its side, thinned on the cut side, as it was where there is neither
  let thinner = 0, wider = 0, n = 0;
  for (let x = 100; x < 1000; x += 5) for (const y of [260, 340]) {
    const none = natReachAt(x, y, 15, 0), bar = natReachAt(x, y, 15, 8), cut = natReachAt(x, y, 15, -8);
    n++; if (Math.abs(bar - (none + RIVER_NAT.barK * 8)) < 1e-9) wider++; if (cut <= none + 1e-9 && cut >= none * (1 - RIVER_NAT.cutK) - 1e-9) thinner++;
  }
  assert.equal(wider, n); assert.equal(thinner, n);
  // on the field: the bar's side (the +N side, below the river) holds its band farther out than the cut bank's (above it)
  const f = new SwampField(riverStreams([barRiver(8)]), RIVER_BAND_NAT);
  const rim = (x: number, side: number) => { let r = 0; for (let d = 16; d < 16 + 40; d += 0.25) if (f.cover(x, 300 + side * d) > 0.5) r = d - 15; return r; };
  let bs = 0, cs = 0, m = 0;
  for (let x = 130; x < 440; x += 4) { const a = rim(x, 1), b = rim(x, -1); bs += a; cs += b; m++; }
  assert.ok(bs / m > cs / m + 4, `the bar's side reaches ${(bs / m).toFixed(1)} tiles past the water, the cut bank's ${(cs / m).toFixed(1)}`);
  // the band keeps the old river's guarantees: none on the water, none past its reach
  for (let x = 130; x < 440; x += 6) for (const side of [-1, 1]) {
    for (let d = 0; d < 14; d += 0.5) assert.equal(f.cover(x, 300 + side * d), 0, `water at ${x}, ${d}`);
    for (let d = 15 + RIVER_BAND_NAT.out + 4; d < 15 + RIVER_BAND_NAT.out + 14; d += 1.5) assert.equal(f.cover(x, 300 + side * d), 0, `past the reach at ${x}, ${d}`);
  }
  // the band's look has the room for the widest bar there can be
  assert.ok(RIVER_BAND_NAT.out >= RIVER_NAT.bank + RIVER_NAT.cap + RIVER_NAT.bay + BAR_SHARE * W_MAX);
});

test('the river\'s trees: none stand on a point bar (its sand is bare), the belt begins past it; on the old river it is as it was', () => {
  const ground = new Uint8Array(MAP * MAP).fill(TC.GROUND), R = barRiver(9);
  const f = beltField(5, [R]), q = { d: 0, kind: 0, nx: 0, ny: 0, hw: 0, sbar: 0 };
  let trees = 0, near = 0, cutNear = 0;
  for (let ci = 2; ci < 8; ci++) for (let cj = Math.floor((300 - 60) / FOREST_CELL); cj <= Math.floor((300 + 60) / FOREST_CELL); cj++) {
    for (const t of riverBeltCell(5, ground, null, f, ci, cj, () => true)) {
      const list = f.water.near(t.x - 1, t.y - 1, t.x + 1, t.y + 1); f.water.nearest(list, t.x, t.y, q); trees++;
      if (q.sbar > 0) { if (q.d < q.sbar + BELT.river.min) near++; } else if (q.sbar < 0 && q.d < BELT.river.min) cutNear++;
    }
  }
  assert.ok(trees > 40, `${trees} trees`);
  assert.equal(near, 0, 'a tree on the sand');
  assert.ok(cutNear > 0, 'on the cut bank they stand closer than the old belt allowed');
  // a river without bars: the nearest a tree stands is the old belt's
  const g = beltField(5, [{ kind: 'river', pts: R.pts.map(p => ({ x: p.x, y: p.y, w: p.w })) }]);
  let min = Infinity;
  for (let ci = 2; ci < 8; ci++) for (let cj = Math.floor((300 - 60) / FOREST_CELL); cj <= Math.floor((300 + 60) / FOREST_CELL); cj++) for (const t of riverBeltCell(5, ground, null, g, ci, cj, () => true)) { const list = g.water.near(t.x - 1, t.y - 1, t.x + 1, t.y + 1); g.water.nearest(list, t.x, t.y, q); min = Math.min(min, q.d); }
  assert.ok(min >= BELT.river.min - 1e-9, `the old river's nearest tree ${min.toFixed(2)}`);
});
