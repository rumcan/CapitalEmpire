/** Tests for T003 grade separation: bridges over roads and tunnels under them (pure, Node). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crossingsOf, planProfile } from '../src/game/ext/grade/index.js';
import type { Crossing, Profile } from '../src/game/ext/grade/index.js';
import type { Pt } from '../src/game/network.js';

const pt = (x: number, y: number): Pt => ({ x, y });
const flatGround = () => 10; // flat terrain at 10 m
const hillGround = (x: number, _y: number): number => 0.08 * x; // 4% rise: x in tiles, 2 m per tile
const across = (x: number, deck: number): Crossing => ({ a: pt(x, -50), b: pt(x, 50), deck }); // deck = m above terrain
const ROUTE = [pt(0, 0), pt(300, 0)]; // 300 tiles = 600 m; a road crossing at tile 150 (300 m)

/** largest grade (fraction) between samples, and largest change of grade per metre */
function gradeStats(p: Profile): { maxG: number; maxRate: number } {
  let maxG = 0, maxRate = 0, prev = NaN;
  for (let i = 1; i < p.s.length; i++) {
    const g = (p.z[i]! - p.z[i - 1]!) / ((p.s[i]! - p.s[i - 1]!) * 2); // tiles x 2 = metres run
    maxG = Math.max(maxG, Math.abs(g));
    if (!Number.isNaN(prev)) maxRate = Math.max(maxRate, Math.abs(g - prev) / 2);
    prev = g;
  }
  return { maxG, maxRate };
}

/** index of the last bridge or tunnel sample */
function lastStructure(p: Profile): number {
  let last = -1;
  p.kinds.forEach((k, i) => { if (k === 'bridge' || k === 'tunnel') last = i; });
  return last;
}

/** metres of ramp before and after the bridge or tunnel (sample resolution 2 m) */
function rampMetres(p: Profile): { before: number; after: number } {
  const first = p.kinds.findIndex(k => k === 'bridge' || k === 'tunnel');
  return { before: (first - p.kinds.indexOf('ramp')) * 2, after: (p.kinds.lastIndexOf('ramp') - lastStructure(p)) * 2 };
}

/** height of the profile at tile s (nearest sample) */
const zAtTile = (p: Profile, s: number) => p.z[p.s.findIndex(v => Math.abs(v - s) < 0.01)]!;

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

test('planProfile over one road: 7 m above the crossed surface, ramps both sides, max grade', () => {
  const profile = planProfile(ROUTE, [across(150, 0)], flatGround, { over: true, maxGrade: 0.06 });
  const { maxG, maxRate } = gradeStats(profile);
  const r = rampMetres(profile);
  console.log(`over one road: ok=${profile.ok} bridge z=${zAtTile(profile, 150).toFixed(2)} max grade=${(maxG * 100).toFixed(2)}% ramps ${r.before.toFixed(0)} m / ${r.after.toFixed(0)} m`);
  assert.equal(profile.ok, true, profile.why);
  assert.equal(profile.why, '');
  // crossed surface 10 (ground) + 0 (deck) + 5.5 clearance + 1.5 deck thickness = 17
  assert.ok(Math.abs(zAtTile(profile, 150) - 17) < 0.01, `bridge at ${zAtTile(profile, 150)}, expected 17`);
  assert.ok(maxG <= 0.06 + 1e-9, `max grade ${maxG} exceeds 0.06`);
  assert.ok(maxRate <= 0.0012, `grade changes ${maxRate} per m, limit 0.12%`);
  assert.equal(profile.z[0], 10);
  assert.equal(profile.z[profile.z.length - 1], 10);
  assert.ok(profile.kinds.includes('bridge'));
  assert.ok(profile.kinds.includes('ramp'));
  assert.ok(profile.kinds.includes('ground'));
});

test('planProfile over two close roads as one long bridge', () => {
  const crossings = [across(140, 0), across(160, 0)]; // 20 tiles (40 m) apart: one structure
  const profile = planProfile(ROUTE, crossings, flatGround, { over: true, maxGrade: 0.06 });
  console.log(`two close roads: ok=${profile.ok} bridges=${profile.kinds.filter(k => k === 'bridge').length} ramps=${profile.kinds.filter(k => k === 'ramp').length}`);
  assert.equal(profile.ok, true, profile.why);
  assert.equal(profile.kinds[profile.s.findIndex(s => Math.abs(s - 150) < 0.01)], 'bridge');
  // no ground between the two crossings
  let groundBetween = 0;
  for (let i = 0; i < profile.s.length; i++) if (profile.s[i]! > 140 && profile.s[i]! < 160 && profile.kinds[i] === 'ground') groundBetween++;
  console.log(`  ground samples between 140-160: ${groundBetween} (expected 0 for one long bridge)`);
  assert.equal(groundBetween, 0);
  assert.ok(gradeStats(profile).maxG <= 0.06 + 1e-9);
  assert.ok(Math.abs(zAtTile(profile, 150) - 17) < 0.01);
});

test('too close to the ends: not ok with reason, and the profile still clears the crossing', () => {
  const route = [pt(0, 0), pt(100, 0)]; // 100 tiles
  const atStart = planProfile(route, [across(10, 0)], flatGround, { over: true, maxGrade: 0.06 });
  console.log(`too close to start: ok=${atStart.ok} why=${atStart.why}`);
  assert.equal(atStart.ok, false);
  assert.ok(atStart.why.includes('start'), `why should mention start: ${atStart.why}`);
  assert.ok(zAtTile(atStart, 10) >= 17 - 1e-9, `start crossing z ${zAtTile(atStart, 10)} must clear 17`);

  const atEnd = planProfile(route, [across(90, 0)], flatGround, { over: true, maxGrade: 0.06 });
  console.log(`too close to end: ok=${atEnd.ok} why=${atEnd.why}`);
  assert.equal(atEnd.ok, false);
  assert.ok(atEnd.why.includes('end'), `why should mention end: ${atEnd.why}`);
  assert.ok(zAtTile(atEnd, 90) >= 17 - 1e-9, `end crossing z ${zAtTile(atEnd, 90)} must clear 17`);
});

test('planProfile under a road: tunnel 6 m below the crossed surface, with vertical curves', () => {
  const profile = planProfile(ROUTE, [across(150, 0)], flatGround, { over: false, maxGrade: 0.06 });
  const { maxG, maxRate } = gradeStats(profile);
  const r = rampMetres(profile);
  console.log(`under one road: ok=${profile.ok} tunnel z=${zAtTile(profile, 150).toFixed(2)} max grade=${(maxG * 100).toFixed(2)}% ramps ${r.before.toFixed(0)} m / ${r.after.toFixed(0)} m`);
  assert.equal(profile.ok, true, profile.why);
  assert.ok(Math.abs(zAtTile(profile, 150) - 4) < 0.01, `tunnel z ${zAtTile(profile, 150)}, expected 4 (10 - 6)`);
  assert.ok(profile.kinds.includes('tunnel'));
  assert.ok(profile.kinds.includes('ramp'));
  assert.ok(maxG <= 0.06 + 1e-9);
  assert.ok(maxRate <= 0.0012, `grade changes ${maxRate} per m, limit 0.12%`);
});

test('over a 4% hillside: ok on a 600-tile route, 7 m above the crossed surface on the terrain', () => {
  const route = [pt(0, 0), pt(600, 0)];
  const profile = planProfile(route, [across(300, 0)], hillGround, { over: true, maxGrade: 0.06 });
  const { maxG, maxRate } = gradeStats(profile);
  const r = rampMetres(profile);
  const surface = hillGround(300, 0); // crossed road at tile 300 sits on 24 m of terrain
  console.log(`hillside 4% over (600 tiles): ok=${profile.ok} bridge ${zAtTile(profile, 300).toFixed(2)} m (surface ${surface} + 7), ramps uphill ${r.before.toFixed(0)} m / downhill ${r.after.toFixed(0)} m, max grade ${(maxG * 100).toFixed(2)}%`);
  assert.equal(profile.ok, true, profile.why);
  assert.ok(Math.abs(zAtTile(profile, 300) - (surface + 7)) < 0.01, `bridge ${zAtTile(profile, 300)}, expected ${surface + 7}`);
  assert.ok(Math.abs(profile.z[0]! - hillGround(0, 0)) < 1e-9, 'route start on the terrain');
  assert.ok(Math.abs(profile.z[profile.z.length - 1]! - hillGround(600, 0)) < 1e-9, 'route end on the terrain');
  assert.ok(maxG <= 0.06 + 1e-9, `max grade ${maxG} exceeds 0.06`);
  assert.ok(maxRate <= 0.0012, `grade changes ${maxRate} per m, limit 0.12%`);
});

test('the 4% hillside on a 300-tile route (crossing at tile 150) is not ok, and still clears the crossing', () => {
  // climbing from 0 m to 19 m over 294 m needs 6.5% on average before any vertical curve: the uphill side cannot fit
  const up = planProfile(ROUTE, [across(150, 0)], hillGround, { over: true, maxGrade: 0.06 });
  console.log(`hillside 4% over (300 tiles): ok=${up.ok} why=${up.why} bridge z=${zAtTile(up, 150).toFixed(2)}`);
  assert.equal(up.ok, false);
  assert.ok(up.why.includes('start') && up.why.includes('6.5%'), `why should name the start and the grade: ${up.why}`);
  assert.ok(zAtTile(up, 150) >= 19 - 1e-9, `clamped bridge z ${zAtTile(up, 150)} must clear 19 (crossed surface 12 + 7)`);
  // the same slope falling towards the crossing: the downhill side is the one that cannot fit
  const down = planProfile(ROUTE, [across(150, 0)], (x: number) => 0.08 * (300 - x), { over: true, maxGrade: 0.06 });
  console.log(`hillside 4% falling (300 tiles): ok=${down.ok} why=${down.why}`);
  assert.equal(down.ok, false);
  assert.ok(down.why.includes('end'), `why should name the end: ${down.why}`);
  assert.ok(zAtTile(down, 150) >= 19 - 1e-9);
});

test('grade never exceeds maxGrade (4% and 6%)', () => {
  for (const G of [0.04, 0.06]) {
    const p = planProfile(ROUTE, [across(150, 0)], flatGround, { over: true, maxGrade: G });
    const { maxG } = gradeStats(p);
    console.log(`flat over, max grade ${G * 100}%: ok=${p.ok} measured ${(maxG * 100).toFixed(3)}%`);
    assert.equal(p.ok, true, p.why);
    assert.ok(maxG <= G + 1e-9, `max grade ${maxG} exceeds ${G}`);
  }
  const hill = planProfile([pt(0, 0), pt(600, 0)], [across(300, 0)], hillGround, { over: true, maxGrade: 0.06 });
  assert.ok(gradeStats(hill).maxG <= 0.06 + 1e-9);
});

test('grade changes by at most 0.12% per metre (K = 8.4 or more)', () => {
  const flat = planProfile(ROUTE, [across(150, 0)], flatGround, { over: true, maxGrade: 0.06 });
  const tight = planProfile(ROUTE, [across(150, 0)], flatGround, { over: true, maxGrade: 0.06, k: 8.4 });
  const tunnel = planProfile(ROUTE, [across(150, 0)], flatGround, { over: false, maxGrade: 0.04, k: 8.4 });
  const a = gradeStats(flat), b = gradeStats(tight), c = gradeStats(tunnel);
  console.log(`grade change per m: K=15 ${(a.maxRate * 100).toFixed(4)}%, K=8.4 ${(b.maxRate * 100).toFixed(4)}%, tunnel K=8.4 4% ${(c.maxRate * 100).toFixed(4)}%`);
  assert.ok(a.maxRate <= 0.0012 && b.maxRate <= 0.0012 && c.maxRate <= 0.0012);
});

test('print ramp lengths for 4% and 6% (with vertical curves)', () => {
  // flat ground: ramp = rise / G + curve length, curve length = K x G(%) for the 0 -> G change at the foot
  const K = 15;
  for (const G of [0.06, 0.04]) {
    const bridge = rampMetres(planProfile(ROUTE, [across(150, 0)], flatGround, { over: true, maxGrade: G })).before;
    const analytic = 7 / G + K * 100 * G;
    console.log(`ramp at ${G * 100}% for 7 m (bridge): ${bridge.toFixed(0)} m measured, ${analytic.toFixed(1)} m = rise/G + curve ${(K * 100 * G).toFixed(0)} m`);
    assert.ok(Math.abs(bridge - analytic) < 2.5, `ramp ${bridge} vs ${analytic}`);
    const tunnel = rampMetres(planProfile(ROUTE, [across(150, 0)], flatGround, { over: false, maxGrade: G })).before;
    const analyticT = 6 / G + K * 100 * G;
    console.log(`ramp at ${G * 100}% for 6 m (tunnel): ${tunnel.toFixed(0)} m measured, ${analyticT.toFixed(1)} m`);
    assert.ok(Math.abs(tunnel - analyticT) < 2.5, `tunnel ramp ${tunnel} vs ${analyticT}`);
  }
});

test('vertical curves: no kinks (slope continuous)', () => {
  const profile = planProfile(ROUTE, [across(150, 0)], flatGround, { over: true, maxGrade: 0.06 });
  const grades: number[] = [];
  for (let i = 1; i < profile.s.length; i++) {
    const ds = profile.s[i]! - profile.s[i - 1]!;
    grades.push((profile.z[i]! - profile.z[i - 1]!) / (ds * 2));
  }
  let maxDelta = 0;
  for (let i = 1; i < grades.length; i++) maxDelta = Math.max(maxDelta, Math.abs(grades[i]! - grades[i - 1]!));
  console.log(`max slope ${(Math.max(...grades.map(Math.abs)) * 100).toFixed(2)}% max grade change per tile ${(maxDelta * 100).toFixed(3)}%`);
  // a 0 -> 6% kink would be a 6% jump; with 90 m curves the grade moves 0.13% per 2 m tile
  assert.ok(maxDelta < 0.002, `kink: delta ${maxDelta} too large, should be smoothed`);
});

test('crossingsOf vs planProfile integration: roads to profile', () => {
  const roads = [{ a: pt(150, -50), b: pt(150, 50), deck: 2 }]; // existing bridge deck 2 m above the ground
  const atDecks = crossingsOf(ROUTE, roads);
  assert.equal(atDecks.length, 1);
  assert.ok(Math.abs(atDecks[0]!.at - 150) < 0.1);
  assert.equal(atDecks[0]!.deck, 2);
  // surface = 10 + 2 = 12, so the new bridge sits at 12 + 5.5 + 1.5 = 19
  const profile = planProfile(ROUTE, [{ a: roads[0]!.a, b: roads[0]!.b, deck: 2 }], flatGround, { over: true, maxGrade: 0.06 });
  console.log(`integration: crossed deck 2 m -> bridge z at crossing ${zAtTile(profile, 150).toFixed(2)}`);
  assert.equal(profile.ok, true, profile.why);
  assert.ok(Math.abs(zAtTile(profile, 150) - 19) < 0.01);
});
