/** Tests for T003 grade separation: bridges over roads and tunnels under them (pure, Node). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crossingsOf, planProfile } from '../src/game/ext/grade/index.js';
import type { Crossing } from '../src/game/ext/grade/index.js';
import type { Pt } from '../src/game/network.js';

const pt = (x: number, y: number): Pt => ({ x, y });
const flatGround = () => 10; // flat terrain at 10 m
const hillGround = (x: number, _y: number): number => 10 + 0.05 * x; // 5% slope: 10 m at x=0, 15 m at x=100

function maxGradeOf(profile: { s: number[]; z: number[] }): number {
  let max = 0;
  for (let i = 1; i < profile.s.length; i++) {
    const ds = profile.s[i]! - profile.s[i - 1]!;
    const dz = Math.abs(profile.z[i]! - profile.z[i - 1]!);
    const grade = dz / (ds * 2); // tiles *2 = metres run
    if (grade > max) max = grade;
  }
  return max;
}

test('crossingsOf: finds at along route', () => {
  const route = [pt(0, 0), pt(200, 0)]; // east-west 200 tiles =400 m
  const roads = [
    { a: pt(100, -50), b: pt(100, 50), deck: 0 },
    { a: pt(150, -30), b: pt(150, 30), deck: 0 },
  ];
  const crossings = crossingsOf(route, roads);
  console.log(`crossingsOf: ${crossings.length} found, at=${crossings.map(c => c.at.toFixed(1)).join(', ')}`);
  assert.equal(crossings.length, 2);
  assert.ok(Math.abs(crossings[0]!.at - 100) < 0.1);
  assert.ok(Math.abs(crossings[1]!.at - 150) < 0.1);
  assert.equal(crossings[0]!.deck, 0);
});

test('planProfile over one road: ramps both sides, max grade, 5.5 m clearance', () => {
  const route = [pt(0, 0), pt(200, 0)];
  const crossing: Crossing = { a: pt(100, -50), b: pt(100, 50), deck: 10 };
  const profile = planProfile(route, [crossing], flatGround, { over: true, maxGrade: 0.06 });
  console.log(`over one road: ok=${profile.ok} why=${profile.why} s=${profile.s.length} kinds=${profile.kinds.slice(49, 55).join(',')}`);
  // ok
  assert.equal(profile.ok, true);
  assert.equal(profile.why, '');
  // clearance at crossing (s=100)
  const idx = profile.s.findIndex(s => Math.abs(s - 100) < 0.6);
  const zAt = profile.z[idx]!;
  console.log(`  z at crossing (s=100) = ${zAt.toFixed(2)} m, expected >=5.5 over deck (0) + ground 10 =15.5`);
  assert.ok(zAt >= 15.4, `z ${zAt} should be >=15.5 (ground 10 + clearance 5.5)`);
  assert.ok(zAt < 18, `z ${zAt} not too high (allow deck thick 1.5)`);
  // max grade
  const mg = maxGradeOf(profile);
  console.log(`  max grade = ${(mg * 100).toFixed(2)}% (limit 6%)`);
  assert.ok(mg <= 0.061, `max grade ${mg} exceeds 0.06`);
  // kinds contain bridge and ramp
  assert.ok(profile.kinds.includes('bridge'));
  assert.ok(profile.kinds.includes('ramp'));
  assert.ok(profile.kinds.includes('ground'));
  // ramp length check: for 5.5 m rise at 6%, tiles =5.5/(0.06*2)=45.83
  const rampLen = 5.5 / (0.06 * 2);
  console.log(`  expected ramp ~${rampLen.toFixed(1)} tiles at 6% for 5.5 m`);
  // find ramp extent: first ramp to bridge
  const firstBridge = profile.kinds.indexOf('bridge');
  const firstRamp = profile.kinds.indexOf('ramp');
  assert.ok(firstRamp >= 0 && firstBridge > firstRamp);
});

test('planProfile over two close roads as one long bridge', () => {
  const route = [pt(0, 0), pt(200, 0)];
  const c1: Crossing = { a: pt(90, -50), b: pt(90, 50), deck: 10 };
  const c2: Crossing = { a: pt(110, -50), b: pt(110, 50), deck: 10 }; // 20 tiles (40 m) apart, close
  const profile = planProfile(route, [c1, c2], flatGround, { over: true, maxGrade: 0.06 });
  console.log(`two close roads: ok=${profile.ok} kinds bridges=${profile.kinds.filter(k=>k==='bridge').length} ramps=${profile.kinds.filter(k=>k==='ramp').length}`);
  assert.equal(profile.ok, true);
  // should be one continuous bridge covering both, not two separate bridges with ground between
  // Check that between s=90 and s=110, kinds are not ground (should be bridge throughout)
  const midIdx = profile.s.findIndex(s => Math.abs(s - 100) < 0.6);
  assert.ok(midIdx >=0);
  assert.ok(profile.kinds[midIdx] === 'bridge', `mid between crossings should be bridge, got ${profile.kinds[midIdx]}`);
  // there should not be ground between the two crossings
  let groundBetween = 0;
  for (let i=0;i<profile.s.length;i++) if (profile.s[i]! > 90 && profile.s[i]! < 110 && profile.kinds[i]==='ground') groundBetween++;
  console.log(`  ground samples between 90-110: ${groundBetween} (expected 0 for one long bridge)`);
  assert.equal(groundBetween, 0);
  // max grade still respected
  const mg = maxGradeOf(profile);
  assert.ok(mg <= 0.061);
});

test('planProfile too close to end: not ok with reason', () => {
  const route = [pt(0, 0), pt(100, 0)]; // 100 tiles
  const crossing: Crossing = { a: pt(10, -50), b: pt(10, 50), deck: 10 }; // 10 tiles from start, needs ~45 tiles ramp
  const profile = planProfile(route, [crossing], flatGround, { over: true, maxGrade: 0.06 });
  console.log(`too close to start: ok=${profile.ok} why=${profile.why}`);
  assert.equal(profile.ok, false);
  assert.ok(profile.why.toLowerCase().includes('start') || profile.why.toLowerCase().includes('close'), `why should mention start: ${profile.why}`);
  // same for end
  const crossingEnd: Crossing = { a: pt(90, -50), b: pt(90, 50), deck: 10 }; // 10 from end of 100
  const profile2 = planProfile(route, [crossingEnd], flatGround, { over: true, maxGrade: 0.06 });
  console.log(`too close to end: ok=${profile2.ok} why=${profile2.why}`);
  assert.equal(profile2.ok, false);
  assert.ok(profile2.why.toLowerCase().includes('end') || profile2.why.toLowerCase().includes('close'));
});

test('planProfile under a road: tunnel -6 m', () => {
  const route = [pt(0, 0), pt(200, 0)];
  const crossing: Crossing = { a: pt(100, -50), b: pt(100, 50), deck: 10 };
  const profile = planProfile(route, [crossing], flatGround, { over: false, maxGrade: 0.06 });
  console.log(`under one road: ok=${profile.ok} kinds=${profile.kinds.filter(k=>k==='tunnel').length} tunnels`);
  assert.equal(profile.ok, true);
  const idx = profile.s.findIndex(s => Math.abs(s - 100) < 0.6);
  const zAt = profile.z[idx]!;
  console.log(`  z at crossing = ${zAt.toFixed(2)} m, expected ~4 (deck 10 -6)`);
  assert.ok(zAt > 3 && zAt < 5, `tunnel z ${zAt} should be ~4`);
  assert.ok(profile.kinds.includes('tunnel'));
  assert.ok(profile.kinds.includes('ramp'));
  const mg = maxGradeOf(profile);
  console.log(`  max grade = ${(mg*100).toFixed(2)}%`);
  assert.ok(mg <= 0.061);
});

test('planProfile over hill-side road: terrain heights vary', () => {
  const route = [pt(0, 0), pt(300, 0)]; // east-west 300 tiles, ground slopes 5% uphill (2.5% grade)
  const crossing: Crossing = { a: pt(150, -50), b: pt(150, 50), deck: hillGround(150, 0) };
  const profile = planProfile(route, [crossing], hillGround, { over: true, maxGrade: 0.06 });
  console.log(`hill-side over: ok=${profile.ok} z at 0=${profile.z[0]!.toFixed(1)} z at 150=${profile.z[profile.s.indexOf(150)]?.toFixed(1)} z at 300=${profile.z[profile.z.length-1]!.toFixed(1)}`);
  // ground-following at ends should be near terrain
  assert.ok(Math.abs(profile.z[0]! - hillGround(0,0)) < 0.5, `start ground ${profile.z[0]} vs terrain ${hillGround(0,0)}`);
  assert.ok(Math.abs(profile.z[profile.z.length-1]! - hillGround(300,0)) < 0.5);
  const idx = profile.s.findIndex(s => Math.abs(s - 150) < 0.6);
  const zAt = profile.z[idx]!;
  const deck = hillGround(150,0);
  console.log(`  deck ${deck} target ${deck+5.5} zAt ${zAt.toFixed(2)}`);
  assert.ok(zAt >= deck + 5.4);
  assert.equal(profile.ok, true);
  const mg = maxGradeOf(profile);
  console.log(`  max grade ${(mg*100).toFixed(2)}%`);
  assert.ok(mg <= 0.061, `max grade ${mg} exceeds 0.06`);
});

test('print ramp lengths for 4% and 6%', () => {
  const rise = 5.5; // m clearance over
  const len6 = rise / (0.06 * 2);
  const len4 = rise / (0.04 * 2);
  console.log(`ramp length at 6% for ${rise} m rise: ${len6.toFixed(2)} tiles (${(len6*2).toFixed(1)} m)`);
  console.log(`ramp length at 4% for ${rise} m rise: ${len4.toFixed(2)} tiles (${(len4*2).toFixed(1)} m)`);
  assert.ok(Math.abs(len6 - 45.83) < 0.1);
  assert.ok(Math.abs(len4 - 68.75) < 0.1);
  const riseTun = 6;
  const len6t = riseTun / (0.06 * 2);
  const len4t = riseTun / (0.04 * 2);
  console.log(`tunnel ramp at 6% for ${riseTun} m: ${len6t.toFixed(2)} tiles`);
  console.log(`tunnel ramp at 4% for ${riseTun} m: ${len4t.toFixed(2)} tiles`);
  assert.ok(Math.abs(len6t - 50) < 0.1);
  assert.ok(Math.abs(len4t - 75) < 0.1);
  const route = [pt(0,0), pt(300,0)];
  const crossing: Crossing = { a: pt(150,-50), b: pt(150,50), deck: 10 };
  const p6 = planProfile(route, [crossing], flatGround, { over: true, maxGrade: 0.06 });
  const p4 = planProfile(route, [crossing], flatGround, { over: true, maxGrade: 0.04 });
  const rampTiles = (p: typeof p6) => p.kinds.filter(k=>k==='ramp').length; // approx per-tile count of ramp samples
  console.log(`  actual ramp tiles in profile at 6%: ~${rampTiles(p6)} (expect ~${(len6*2).toFixed(0)} samples? linear)`);
  console.log(`  actual ramp tiles in profile at 4%: ~${rampTiles(p4)}`);
  assert.ok(p6.ok && p4.ok);
});

test('crossingsOf vs planProfile integration: roads to profile', () => {
  const route = [pt(0,0), pt(200,0)];
  const roads = [{ a: pt(100,-50), b: pt(100,50), deck: 2 }]; // existing bridge deck at 2 m
  const atDecks = crossingsOf(route, roads);
  assert.equal(atDecks.length, 1);
  assert.ok(Math.abs(atDecks[0]!.at - 100) < 0.1);
  assert.equal(atDecks[0]!.deck, 2);
  // use that to build profile clearing existing bridge: target = deck +5.5 =7.5
  const profile = planProfile(route, [{ a: roads[0]!.a, b: roads[0]!.b, deck: 2 }], flatGround, { over: true, maxGrade: 0.06 });
  const idx = profile.s.findIndex(s=>Math.abs(s-100)<0.6);
  console.log(`integration: deck 2 -> target 7.5, z at crossing ${profile.z[idx]!.toFixed(2)}`);
  assert.ok(profile.z[idx]! >= 7.4);
});

test('vertical curves: no kinks (slope continuous)', () => {
  const route = [pt(0,0), pt(200,0)];
  const crossing: Crossing = { a: pt(100,-50), b: pt(100,50), deck: 10 };
  const profile = planProfile(route, [crossing], flatGround, { over: true, maxGrade: 0.06 });
  // check slope change per tile is gradual (no jump > maxGrade)
  const grades: number[] = [];
  for (let i=1;i<profile.s.length;i++) {
    const ds = profile.s[i]! - profile.s[i-1]!;
    const dz = profile.z[i]! - profile.z[i-1]!;
    grades.push(dz/(ds*2));
  }
  // find max slope change between consecutive grades
  let maxDelta = 0;
  for (let i=1;i<grades.length;i++) maxDelta = Math.max(maxDelta, Math.abs(grades[i]! - grades[i-1]!));
  console.log(`max slope ${(Math.max(...grades.map(Math.abs))*100).toFixed(2)}% max delta per tile ${(maxDelta*100).toFixed(2)}%`);
  assert.ok(maxDelta < 0.015, `kink: delta ${maxDelta} too large, needs K=10 vertical curves (<0.3% per m)`);
});
