// T265 (#794): the river's swamp band and the tree belts along the rivers and creeks. Headless: npm test (bundled by esbuild, run by node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAP } from '../src/game/iso';
import { TC } from '../src/game/terrain';
import { CONIFER_IDS, FOREST_CELL, TREE_POOL_IDS, type ForestTree } from '../src/game/forest';
import { CREEK_BAND, RIVER_BAND, RIVER_SWAMP, RIVER_SWAMP_OUT, SWAMP, SWAMP_OUT, SwampField, riverStreams, riverStretchAt, swampStreams } from '../src/game/swamp';
import { RIVER_CUT, drawRiverCut, type CutCtx } from '../src/game/river-cut';
import { BELT, BELT_SNAG_DEAL, beltField, beltProfile, beltSwamp, riverBeltCell } from '../src/game/river-trees';
import type { Waterway } from '../src/game/terrain/types';

/** a straight river along x at y (tiles), w wide, its points 8 tiles apart (as the generator resamples it) */
const river = (y: number, w: number, x0 = 0, x1 = 1200): Waterway => ({ kind: 'river', pts: Array.from({ length: Math.floor((x1 - x0) / 8) + 1 }, (_, k) => ({ x: x0 + k * 8, y, w })) });
/** a wavy creek of width w from (x0, y0), n points about 6 tiles apart */
const creek = (x0: number, y0: number, n: number, w = 6): Waterway => ({ kind: 'creek', pts: Array.from({ length: n }, (_, k) => ({ x: x0 + k * 4.2 + 3 * Math.sin(k * 0.7), y: y0 + k * 4.3 + 2.5 * Math.cos(k * 0.5), w })) });
const ground = () => new Uint8Array(MAP * MAP).fill(TC.GROUND);

// ---- the river's band

test('T265 the river\'s band: past its bank, never on its water, in stretches and bays, never an even ribbon', () => {
  const R = river(300, 30), f = new SwampField(riverStreams([R]), RIVER_BAND), hw = 15;
  assert.deepEqual(riverStreams([R, creek(10, 10, 10)]), [R]);
  let some = 0, none = 0; const rims: number[] = [];
  for (let x = 100; x < 1100; x += 2) for (const side of [-1, 1]) {
    for (let d = 0; d < hw + 0.5; d += 0.5) assert.equal(f.cover(x, 300 + side * d), 0, `the water at ${x}, ${300 + side * d}`);
    // past the farthest reach (on the plain distance, less the soft union's most), nothing
    for (let d = hw + RIVER_SWAMP_OUT + RIVER_SWAMP.soft * Math.log(8); d < hw + RIVER_SWAMP_OUT + 12; d += 1.5) assert.equal(f.cover(x, 300 + side * d), 0, `past the reach at ${x}, ${d}`);
    let rim = 0; for (let d = hw + RIVER_SWAMP.bank + 0.5; d < hw + RIVER_SWAMP_OUT + 3; d += 0.25) if (f.cover(x, 300 + side * d) > 0.5) rim = d - hw; else break;
    if (rim > 0) { some++; rims.push(rim); } else none++;
  }
  const share = some / (some + none);
  assert.ok(share > 0.25 && share < 0.8, `the swamp shows past the bank along ${(share * 100).toFixed(0)}% of the banks: stretches with and without`);
  const mean = rims.reduce((s, v) => s + v, 0) / rims.length, sd = Math.sqrt(rims.reduce((s, v) => s + (v - mean) ** 2, 0) / rims.length);
  assert.ok(mean > RIVER_SWAMP.bank + 2, `it reaches well past the bank: ${mean.toFixed(1)} tiles past the water`);
  assert.ok(sd > 1.5, `bays and stretches: the rim's distance varies (sd ${sd.toFixed(2)} tiles)`);
  // the stretches come and go along the river (a slow noise): runs of swamp and runs without, each tens of tiles long
  const on = Array.from({ length: 500 }, (_, i) => riverStretchAt(100 + i * 2, 300 - hw - 6) > 0.5);
  let runs = 0; for (let i = 1; i < on.length; i++) if (on[i] !== on[i - 1]) runs++;
  assert.ok(runs >= 4 && runs < 60, `${runs} changes over 1,000 tiles of bank`);
});

test('T265 the river\'s band is wider on a wider river, and capped', () => {
  const narrow = new SwampField([river(300, 20)], RIVER_BAND), wide = new SwampField([river(300, 40)], RIVER_BAND), wider = new SwampField([river(300, 80)], RIVER_BAND);
  const reach = (f: SwampField, hw: number) => { let s = 0, n = 0; for (let x = 100; x < 1100; x += 3) { let rim = 0; for (let d = hw + 1; d < hw + RIVER_SWAMP_OUT + 3; d += 0.25) if (f.cover(x, 300 - d) > 0.5) rim = d - hw; if (rim > RIVER_SWAMP.bank) { s += rim; n++; } } return n ? s / n : 0; };
  const a = reach(narrow, 10), b = reach(wide, 20), c = reach(wider, 40);
  assert.ok(b > a + 1, `an 80 m river's swamp reaches further than a 40 m one's: ${b.toFixed(1)} vs ${a.toFixed(1)} tiles`);
  assert.ok(Math.abs(c - b) < 0.6, `capped: ${c.toFixed(1)} vs ${b.toFixed(1)}`);
  assert.ok(b > SWAMP.reach + 3, 'wider than a creek\'s');
});

test('T265 the river\'s band: every chunk lays the same cover, the point query agrees, and the creeks\' band is as before', () => {
  const f = new SwampField([river(300, 30)], RIVER_BAND), res = 4;
  // find a stretch with swamp
  let x0 = 100; while (x0 < 1000 && riverStretchAt(x0 + 20, 280) < 0.8) x0 += 10;
  const A = f.alpha(x0, 270, 40, 40, res)!, B = f.alpha(x0 + 20, 270, 40, 40, res)!;
  assert.ok(A && B, 'a stretch with swamp');
  let n = 0, lit = 0;
  for (let v = 0; v < A.H; v++) for (let u = 20 * res; u < A.W; u++) {
    const a = A.data[(v * A.W + u) * 4 + 3]!, b = B.data[(v * B.W + u - 20 * res) * 4 + 3]!; assert.equal(a, b, `sample ${u}, ${v}`);
    if (a > 0) lit++;
    if (u % 7 === 0 && v % 5 === 0) { assert.equal(a, Math.round(f.cover(x0 + (u + 0.5) / res, 270 + (v + 0.5) / res) * 255)); n++; }
  }
  assert.ok(n > 50 && lit > 100);
  // a district chunk (res 1) lays it too, and nothing on the water
  const D = f.alpha(x0, 250, 80, 100, 1)!; assert.ok(D);
  for (let v = 0; v < D.H; v++) { const y = 250 + v + 0.5; if (Math.abs(y - 300) < 15) for (let u = 0; u < D.W; u++) assert.equal(D.data[(v * D.W + u) * 4 + 3], 0); }
  // the creeks' band: T199's numbers, the default look
  assert.equal(CREEK_BAND.out, SWAMP_OUT); assert.equal(CREEK_BAND.soft, SWAMP.soft); assert.equal(CREEK_BAND.wide, false);
  const c = creek(500, 500, 30), g1 = new SwampField([c]), g2 = new SwampField([c], CREEK_BAND);
  assert.deepEqual(g1.alpha(520, 510, 40, 40, 4)!.data, g2.alpha(520, 510, 40, 40, 4)!.data);
  assert.equal(new SwampField(swampStreams([river(300, 30)])).empty, true, 'the streams\' field never holds the river');
});

// ---- the cut: short of a road and a lot

/** a path for the recorder: a polyline (stroked) or a polygon (filled and stroked) */
interface TP { pts: [number, number][] }
const segD = (px: number, py: number, a: [number, number], b: [number, number]) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l2)); return Math.hypot(a[0] + dx * t - px, a[1] + dy * t - py); };
const lineD = (p: TP, x: number, y: number, closed: boolean) => { let d = Infinity; for (let k = 0; k + 1 < p.pts.length; k++) d = Math.min(d, segD(x, y, p.pts[k]!, p.pts[k + 1]!)); if (closed) d = Math.min(d, segD(x, y, p.pts[p.pts.length - 1]!, p.pts[0]!)); return d; };
const inside = (p: TP, x: number, y: number) => { let c = false; const q = p.pts; for (let i = 0, j = q.length - 1; i < q.length; j = i++) if ((q[i]![1] > y) !== (q[j]![1] > y) && x < ((q[j]![0] - q[i]![0]) * (y - q[i]![1])) / (q[j]![1] - q[i]![1]) + q[i]![0]) c = !c; return c; };
/** what is left of the band (1) at (x, y) after the cut drawn onto a recorder (destination-out: each covering call takes its alpha) */
function leftAt(draw: (g: CutCtx<TP>) => void, closed: Set<TP>, x: number, y: number): number {
  let left = 1;
  const g: CutCtx<TP> = {
    globalAlpha: 1, lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', fillStyle: '', strokeStyle: '',
    fill(p) { if (inside(p, x, y)) left *= 1 - this.globalAlpha; },
    stroke(p) { if (lineD(p, x, y, closed.has(p)) <= this.lineWidth / 2) left *= 1 - this.globalAlpha; },
  };
  draw(g); return left;
}

test('T265 the river\'s swamp stops short of a road and a lot (river-cut.ts): whole cut over them and half the margin, soft past it', () => {
  const road: TP = { pts: [[0, 100], [200, 100]] }, walk: TP = { pts: [[0, 100], [200, 100]] }, lot: TP = { pts: [[50, 120], [70, 120], [70, 140], [50, 140]] };
  const bridge: TP = { pts: [[150, 0], [150, 90]] };
  const shapes = { feats: [{ kind: 'stroke' as const, path: walk, w: 9, cap: 'butt' as const }, { kind: 'stroke' as const, path: road, w: 6, cap: 'butt' as const }], bridges: [{ path: bridge, hw: 4 }], shapes: [{ path: lot, rule: 'nonzero' as const }] };
  const closed = new Set([lot]), at = (x: number, y: number) => leftAt(g => drawRiverCut(g, shapes), closed, x, y);
  // the road (its walk's edge 4.5 tiles off its line): gone over it and within half the margin, half within the margin, whole past it
  assert.equal(at(100, 100), 0); assert.equal(at(100, 104.5 + RIVER_CUT.road * 0.4), 0, 'within half the margin: none');
  assert.equal(at(100, 104.5 + RIVER_CUT.road * 0.8), 0.5, 'the outer half of the margin: soft');
  assert.equal(at(100, 104.5 + RIVER_CUT.road + 0.3), 1, 'past the margin: the swamp as it was');
  // a bridge: its deck and the margin
  assert.equal(at(150, 40), 0); assert.equal(at(150 + 4 + RIVER_CUT.road * 0.4, 40), 0); assert.equal(at(150 + 4 + RIVER_CUT.road + 0.3, 40), 1);
  // a lot: gone inside it and within half its margin, soft past that, whole past the margin
  assert.equal(at(60, 130), 0); assert.equal(at(70 + RIVER_CUT.lot * 0.4, 130), 0); assert.equal(at(70 + RIVER_CUT.lot * 0.8, 130), 0.5); assert.equal(at(70 + RIVER_CUT.lot + 0.3, 130), 1);
  assert.equal(at(100, 160), 1, 'nothing built: the swamp whole');
});

test('T265 the renderer: the river\'s band with the streams\', under the river\'s bank, cut short of what is built, its own dev switch', () => {
  const r = readFileSync(resolve('src/game/renderer.ts'), 'utf8'), step1 = r.slice(r.indexOf('// ---- 1. terrain:'), r.indexOf('const walk = net.walkF'));
  assert.match(r, /this\.riverField = new SwampField\(riverStreams\(waters\), RIVER_BAND\)/);
  assert.match(step1, /rv = this\.riverSwampOn\(\) \? this\.riverField\.alpha\(tx0, ty0, bw, bh, cres\) : null/);
  assert.match(step1, /this\.swampBand\(sw, rv, tx0, ty0, cres, rv \? this\.riverCut\(net, rv\.box, lite\) : null\)/, 'the cut: what lies near the river\'s band');
  assert.ok(step1.indexOf('this.riverField.alpha(') < step1.indexOf("layer('bank', g => shore(g, rivers, 3, 0.8))"), 'the river\'s swamp lies under its bank');
  assert.ok(step1.indexOf("layer('bank'") < step1.indexOf("this.waterOver(ctx, SITE.river"), 'the river keeps its water look and reflections over it');
  assert.equal(RIVER_SWAMP.bank, 3, 'the band rises under the bank the renderer lays 3 tiles past the water');
  const cut = r.slice(r.indexOf('private riverCut('), r.indexOf('drawRiverCut<Path2D>'));
  for (const k of ['net.walkF', 'net.asphF', 'net.bridges', 'p.course', 'p.paint', 'this.lotsIn(']) assert.ok(cut.includes(k), `the cut keeps the swamp off ${k}`);
  const gc = readFileSync(resolve('src/game/ground-cache.ts'), 'utf8'), wk = readFileSync(resolve('src/game/ground.worker.ts'), 'utf8');
  assert.match(gc, /setRiverSwamp\(on: boolean\) \{ if \(on === this\.riverSwamp\) return; this\.riverSwamp = on; this\.broadcast\(\{ t: 'riverSwamp', on \}\); this\.invalidateAll\(\); \}/);
  assert.match(wk, /case 'riverSwamp': painter\.riverSwamp = m\.on; break;/);
});

// ---- the tree belts

/** a map with a river along y = 300 (30 tiles wide) and a creek, its classes as the generator lays them (water, bank, creek) */
function wetMap() {
  const cls = ground(), R = river(300, 30, 0, 1000), C = creek(600, 500, 40, 6);
  for (let y = 270; y <= 330; y++) for (let x = 0; x < 1000; x++) { const e = Math.abs(y - 300) - 15; if (e <= 0) cls[y * MAP + x] = TC.WATER; else if (e <= 3) cls[y * MAP + x] = TC.BANK; }
  for (let k = 0; k + 1 < C.pts.length; k++) { const a = C.pts[k]!; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy <= 9) cls[Math.floor(a.y + dy) * MAP + Math.floor(a.x + dx)] = TC.CREEK; }
  return { cls, waters: [R, C] };
}
const W = wetMap(), F = beltField(7, W.waters);
const cellsOf = (x0: number, y0: number, x1: number, y1: number) => { const out: [number, number][] = []; for (let cj = Math.floor(y0 / FOREST_CELL); cj <= Math.floor(y1 / FOREST_CELL); cj++) for (let ci = Math.floor(x0 / FOREST_CELL); ci <= Math.floor(x1 / FOREST_CELL); ci++) out.push([ci, cj]); return out; };
const plantAll = (free: (x: number, y: number, r: number) => boolean = () => true) => cellsOf(0, 200, 999, 700).flatMap(([ci, cj]) => riverBeltCell(7, W.cls, null, F, ci, cj, free));
const all = plantAll();
const distOf = (t: ForestTree) => F.water.nearest(F.water.near(t.x, t.y, t.x, t.y), t.x, t.y, { d: 0, kind: 0, nx: 0, ny: 0, hw: 0 });

test('T265 the belts: deterministic cell by cell, thick near the bank and thinning out over 10-32 m, gaps where the water shows', () => {
  assert.deepEqual(riverBeltCell(7, W.cls, null, F, 5, 4, () => true), riverBeltCell(7, W.cls, null, F, 5, 4, () => true), 'the same cell, the same trees');
  assert.ok(all.length > 400, `${all.length} trees`);
  // on the river's banks (away from the creek): the density by distance past the bank, per tile of bank, on its far side (the near side and
  // the swamp thin the trees nearest the water: below), the river here without its swamp
  const dry: typeof F = { ...F, riverSwamp: new SwampField([], RIVER_BAND) };
  const plainRiver = cellsOf(0, 200, 999, 400).flatMap(([ci, cj]) => riverBeltCell(7, W.cls, null, dry, ci, cj, () => true)).filter(t => t.x > 40 && t.x < 560);
  const band = (a: number, b: number) => plainRiver.filter(t => { const e = 300 - t.y - 15 - BELT.river.bank; return e >= a && e < b; }).length / (b - a);
  const near = band(0, 5), mid = band(8, 14), far = band(14, 20);
  const river = all.filter(t => t.x > 40 && t.x < 560 && Math.abs(t.y - 300) < 60);
  assert.ok(near > mid * 1.4 && mid > far, `thick near the bank, thinning out: ${near.toFixed(1)}, ${mid.toFixed(1)}, ${far.toFixed(1)} a tile`);
  assert.equal(river.filter(t => Math.abs(t.y - 300) - 15 - BELT.river.bank >= BELT.reach).length, 0, 'none past 32 m');
  assert.equal(beltProfile(0), 1); assert.equal(beltProfile(BELT.reach), 0);
  // gaps: 16-tile stretches of bank with no more than a tree or two within 6 tiles of it, on both banks, and thickets with many
  let bare = 0, thick = 0, n = 0;
  for (let x = 40; x < 560; x += 16) for (const s of [-1, 1]) {
    const k = river.filter(t => t.x >= x && t.x < x + 16 && s * (t.y - 300) > 0 && Math.abs(t.y - 300) - 15 < BELT.river.bank + 6).length;
    n++; if (k <= 1) bare++; if (k >= 5) thick++; // (a thicket: five of the belt's big trees, crowns touching)
  }
  assert.ok(bare / n >= 0.15 && bare / n < 0.6, `${bare} of ${n} stretches (nearly) bare: the water shows`);
  assert.ok(thick / n >= 0.15, `${thick} of ${n} stretches a thicket`);
  // the camera's side (further down the screen: larger x + y) keeps fewer trees close to the bank than the far side
  const side = (s: number) => river.filter(t => s * (t.y - 300) > 0 && Math.abs(t.y - 300) - 15 - BELT.river.bank < 4).length;
  assert.ok(side(1) < side(-1) * 0.8, `near side ${side(1)} vs far side ${side(-1)}`);
});

test('T265 the belts: never in the water, on the bank\'s inner half, a creek\'s channel or a hill; none where the clearance fails (roads, lots, the course)', () => {
  for (const t of all) {
    const q = distOf(t), c = W.cls[Math.floor(t.y) * MAP + Math.floor(t.x)];
    assert.ok(q.d >= (q.kind === 0 ? BELT.river.min : BELT.creek.min), `${t.x.toFixed(1)}, ${t.y.toFixed(1)}: ${q.d.toFixed(2)} past the edge`);
    assert.ok(c !== TC.WATER && c !== TC.CREEK && c !== TC.HILL);
  }
  // a road across the river (x 300..310) and a course (x 700..800, y 200..300) kept clear by the engine's free: no belt tree there
  const blocked = (x: number, y: number, r: number) => (x > 300 - r && x < 310 + r) || (x > 700 - r && x < 800 + r && y > 200 - r && y < 300 + r);
  const kept = plantAll((x, y, r) => !blocked(x, y, r));
  assert.ok(kept.length > 0 && kept.length < all.length);
  for (const t of kept) assert.ok(!blocked(t.x, t.y, 1), `${t.x}, ${t.y}`);
  // a hill keeps its own forest
  const hill = W.cls.slice(); for (let y = 330; y < 400; y++) for (let x = 0; x < MAP; x++) hill[y * MAP + x] = TC.HILL;
  for (const [ci, cj] of cellsOf(0, 330, 999, 399)) for (const t of riverBeltCell(7, hill, null, F, ci, cj, () => true)) assert.ok(t.y < 330 || t.y >= 400);
});

test('T265 the belts: broadleaf first, some conifers, a few trees and dead snags in the swamp, never mirrored, the library\'s own trees', () => {
  const ids = new Set(TREE_POOL_IDS), conifers = all.filter(t => CONIFER_IDS.has(t.id)).length / all.length;
  assert.ok(conifers > 0.05 && conifers < 0.3, `conifers ${(conifers * 100).toFixed(0)}%`);
  const snags = new Set(BELT_SNAG_DEAL.ids), swampOf = (t: ForestTree) => Math.max(F.creekSwamp.cover(t.x, t.y), F.riverSwamp.cover(t.x, t.y));
  let wet = 0, agree = 0;
  for (const t of all) {
    assert.ok(ids.has(t.id), `${t.id} is a library tree of the pools`); assert.equal(t.flip, false, 'never mirrored (#775: the engine turns it by the sun)');
    const b = beltSwamp(F, distOf(t), t.x, t.y);
    if (snags.has(t.id)) { assert.ok(b > 0.5, 'a dead snag only in the swamp'); assert.ok(swampOf(t) > 0.05, 'where the ground lays swamp'); }
    if (swampOf(t) > 0.95) { wet++; if (b > 0.5) agree++; }
  }
  assert.ok(wet > 10 && agree / wet > 0.65, `the belt's swamp is the ground's, a little narrower (the plain distance): ${agree} of ${wet}`);
  assert.ok(new Set(all.map(t => t.id)).size > 25, 'many kinds: no visible repeat');
  // the creek's swamp: a few trees stand in it, more just past it
  const creekTrees = all.filter(t => t.x > 580 && t.y > 480), inSwamp = creekTrees.filter(t => F.creekSwamp.cover(t.x, t.y) > 0.9).length, rimOf = creekTrees.filter(t => { const d = distOf(t).d; return d > SWAMP.reach + 2 && d < SWAMP.reach + 7; }).length;
  assert.ok(inSwamp > 0, 'some trees stand in the swamp');
  const areaIn = SWAMP.reach, areaRim = 5;
  assert.ok(inSwamp / areaIn < rimOf / areaRim, `fewer in the swamp (${inSwamp}) than where it meets dry ground (${rimOf})`);
});

test('T265 the engine plants the belts with the forest, clears them by the same rules, and keeps the town trees out of them', () => {
  const e = readFileSync(resolve('src/game/engine.ts'), 'utf8'), cell = e.slice(e.indexOf('private plantCell('), e.indexOf('private beltClaims('));
  assert.match(cell, /riverBeltCell\(this\.terrain\.seed, this\.terrain\.cls, this\.slope, this\.belt, ci, cj, free, FOREST_CLEAR\)/, 'cleared as the forest is (treeClearance free, FOREST_CLEAR)');
  assert.match(cell, /out\.push\(\.\.\.belt\)/, 'in the forest cell\'s own list: dropped, re-planted and cleared by a Build with it');
  assert.match(e, /if \(this\.beltClaims\(x, y\)\) return false;/, 'no town tree in a belt');
  assert.match(e, /setRiverTrees\(on: boolean\) \{ if \(on === this\.beltOn\) return; this\.beltOn = on; this\.dropTownTrees\(0, 0, MAP, MAP\); \}/);
  assert.match(e, /this\.belt = beltField\(this\.terrain\.seed, this\.terrain\.waters\)/);
});
