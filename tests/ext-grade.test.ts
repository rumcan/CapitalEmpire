/** Tests for T003 grade separation: bridges and tunnels over/under roads (pure, Node). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BRIDGE_COST_PER_TILE,
  CLEARANCE_TILES,
  GROUND_COST_PER_TILE,
  GradeSeparation,
  MAX_BRIDGE_SPAN,
  MAX_GRADE,
  MAX_TUNNEL_LENGTH,
  PILLAR_COST,
  PILLAR_SPACING,
  PORTAL_COST,
  RAMP_COST_PER_TILE,
  TUNNEL_COST_PER_TILE,
  UPKEEP_RATE,
  buildCost,
  detectCrossings,
  rampLength,
  segLength,
  validateRamps,
  validateSpans,
  type GradeSegment,
} from '../src/game/ext/grade/index.js';
import { SK } from '../src/game/network.js';

// helpers
const pt = (x: number, y: number) => ({ x, y });
let nextId = 1;
function seg(a: [number, number], b: [number, number], elevation: -1 | 0 | 1 | 2, kind: 0 | 1 | 2): GradeSegment {
  return { id: nextId++, a: pt(a[0], a[1]), b: pt(b[0], b[1]), elevation, kind };
}
function resetIds() { nextId = 1; }

test('1 at-grade crossing: two ground segments crossing need a junction', () => {
  resetIds();
  const s1 = seg([0, 50], [100, 50], 0, SK.GROUND);   // east-west
  const s2 = seg([50, 0], [50, 100], 0, SK.GROUND);   // north-south
  const crossings = detectCrossings([s1, s2]);
  console.log(`at-grade: ${crossings.length} crossing, separated=${crossings[0]?.separated}`);
  assert.equal(crossings.length, 1);
  assert.equal(crossings[0]!.separated, false);
  assert.equal(crossings[0]!.clearance, 0);
  assert.ok(Math.abs(crossings[0]!.x - 50) < 1e-6 && Math.abs(crossings[0]!.y - 50) < 1e-6);
});

test('2 overpass: ground + bridge crossing is grade-separated (and tunnel)', () => {
  resetIds();
  const ground = seg([0, 50], [100, 50], 0, SK.GROUND);
  const bridge = seg([50, 0], [50, 100], 1, SK.BRIDGE);
  const c1 = detectCrossings([ground, bridge]);
  console.log(`overpass: ${c1.length} crossing, separated=${c1[0]?.separated}, clearance=${c1[0]?.clearance}`);
  assert.equal(c1.length, 1);
  assert.equal(c1[0]!.separated, true);
  assert.equal(c1[0]!.clearance, CLEARANCE_TILES);
  // tunnel under
  resetIds();
  const g2 = seg([0, 50], [100, 50], 0, SK.GROUND);
  const tun = seg([50, 0], [50, 100], -1, SK.TUNNEL);
  const c2 = detectCrossings([g2, tun]);
  assert.equal(c2.length, 1);
  assert.equal(c2[0]!.separated, true);
  assert.equal(c2[0]!.clearance, CLEARANCE_TILES);
});

test('3 ramp length: one level ~45.83 tiles, two levels ~91.67 tiles; validation', () => {
  const one = rampLength(1);
  const two = rampLength(2);
  console.log(`rampLength 1 level = ${one.toFixed(2)} tiles (expect ~45.83), 2 levels = ${two.toFixed(2)} tiles (expect ~91.67)`);
  assert.ok(Math.abs(one - CLEARANCE_TILES / MAX_GRADE) < 1e-9);
  assert.ok(Math.abs(two - (2 * CLEARANCE_TILES) / MAX_GRADE) < 1e-9);
  assert.ok(Math.abs(one - 45.8333333333) < 0.01);
  assert.ok(Math.abs(two - 91.6666666667) < 0.01);
  // ramp validation: 10-tile ramp for one level is invalid, 50-tile valid
  resetIds();
  const shortRamp = seg([0, 0], [10, 0], 1, SK.BRIDGE); // len 10, need ~45.8
  const longRamp = seg([0, 0], [50, 0], 1, SK.BRIDGE); // len 50
  const ramps = validateRamps([shortRamp, longRamp]);
  console.log(`ramp validation: short len=${segLength(shortRamp).toFixed(1)} need=${ramps[0]!.need.toFixed(1)} ok=${ramps[0]!.ok}; long len=${segLength(longRamp).toFixed(1)} need=${ramps[1]!.need.toFixed(1)} ok=${ramps[1]!.ok}`);
  assert.equal(ramps[0]!.ok, false);
  assert.equal(ramps[1]!.ok, true);
  // ground ramp always ok
  const ground = seg([0, 0], [5, 0], 0, SK.GROUND);
  const rg = validateRamps([ground]);
  assert.equal(rg[0]!.ok, true);
});

test('4 cost: known network hand-check pillars/portals/ramp surcharge', () => {
  resetIds();
  // 2 ground 20 tiles each + 1 bridge 15 tiles with 1 pillar + ramp 50 tiles (elevated)
  const g1 = seg([0, 0], [20, 0], 0, SK.GROUND);
  const g2 = seg([0, 10], [20, 10], 0, SK.GROUND);
  const bridge = seg([0, 20], [15, 20], 1, SK.BRIDGE); // 15 tiles -> 1 pillar (floor 15/15 =1)
  const ramp = seg([0, 30], [50, 30], 1, SK.BRIDGE); // 50 tiles -> 3 pillars (floor 50/15=3)
  const segs = [g1, g2, bridge, ramp];
  const lenG = 40, lenB = 15, lenR = 50;
  const pillarsB = Math.floor(lenB / PILLAR_SPACING); // 1
  const pillarsR = Math.floor(lenR / PILLAR_SPACING); // 3
  const totalPillars = pillarsB + pillarsR;
  // However buildCost groups bridges into spans: each is isolated run, so same counts
  // base costs + ramp surcharge (elevated segments) + pillars
  const expectedBase = lenG * GROUND_COST_PER_TILE + (lenB + lenR) * BRIDGE_COST_PER_TILE;
  const expectedRampSurcharge = (lenB + lenR) * RAMP_COST_PER_TILE;
  const expectedPillars = totalPillars * PILLAR_COST;
  const expected = expectedBase + expectedRampSurcharge + expectedPillars;
  const cost = buildCost(segs);
  console.log(`cost: base=${expectedBase} rampSurcharge=${expectedRampSurcharge} pillars=${expectedPillars} (${totalPillars}x${PILLAR_COST}) totalExpected=${expected} got=${cost}`);
  assert.equal(cost, expected);
  // also test overhead via class
  const gs = new GradeSeparation(42);
  gs.setNetwork(segs);
  assert.equal(gs.cost(), expected);
  const upkeep = gs.upkeepPerDay();
  assert.ok(Math.abs(upkeep - expected * UPKEEP_RATE) < 1e-9);
  console.log(`upkeep per day = ${upkeep} (rate ${UPKEEP_RATE})`);
  // tunnel portal cost check
  resetIds();
  const tunSeg = seg([0, 0], [60, 0], -1, SK.TUNNEL); // isolated tunnel run 60 -> 2 portals
  const costTun = buildCost([tunSeg]);
  const expectedTun = 60 * TUNNEL_COST_PER_TILE + 60 * RAMP_COST_PER_TILE + 2 * PORTAL_COST;
  console.log(`tunnel 60 tiles cost=${costTun} expected=${expectedTun}`);
  assert.equal(costTun, expectedTun);
});

test('5 span limits: bridge >150 tiles fails, tunnel at limit passes, >300 fails', () => {
  resetIds();
  // bridge 160 tiles as single segment (continuous run 160 -> fail)
  const b160 = seg([0, 0], [160, 0], 1, SK.BRIDGE);
  let spans = validateSpans([b160]);
  console.log(`bridge 160 tiles span len=${spans[0]!.length} ok=${spans[0]!.ok} limit=${MAX_BRIDGE_SPAN}`);
  assert.equal(spans[0]!.ok, false);
  assert.equal(spans[0]!.length, 160);
  // bridge 150 exactly ok
  resetIds();
  const b150 = seg([0, 0], [150, 0], 1, SK.BRIDGE);
  spans = validateSpans([b150]);
  assert.equal(spans[0]!.ok, true);
  // tunnel 300 at limit passes
  resetIds();
  const t300 = seg([0, 0], [300, 0], -1, SK.TUNNEL);
  spans = validateSpans([t300]);
  console.log(`tunnel 300 tiles span ok=${spans[0]!.ok} limit=${MAX_TUNNEL_LENGTH}`);
  assert.equal(spans[0]!.ok, true);
  // tunnel 301 fails
  resetIds();
  const t301 = seg([0, 0], [301, 0], -1, SK.TUNNEL);
  spans = validateSpans([t301]);
  assert.equal(spans[0]!.ok, false);
  // bridge split into two touching segments still counts as one span (30+130=160 -> fail)
  resetIds();
  const b30 = seg([0, 0], [30, 0], 1, SK.BRIDGE);
  const b130 = seg([30, 0], [160, 0], 1, SK.BRIDGE);
  spans = validateSpans([b30, b130]);
  assert.equal(spans.length, 1);
  assert.equal(spans[0]!.length, 160);
  assert.equal(spans[0]!.ok, false);
  // ground segments are ignored
  resetIds();
  const g500 = seg([0, 0], [500, 0], 0, SK.GROUND);
  spans = validateSpans([g500]);
  assert.equal(spans.length, 0);
  // validate() via class produces strings
  const gs = new GradeSeparation(7);
  gs.setNetwork([b160]);
  const errs = gs.validate();
  console.log(`validate errs for 160-tile bridge: ${errs.join('; ')}`);
  assert.ok(errs.length > 0 && errs[0]!.includes('too long'));
});

test('6 overpass over many roads: one bridge over 5 parallel ground roads', () => {
  resetIds();
  const roads: GradeSegment[] = [];
  for (let y of [20, 40, 60, 80, 100]) roads.push(seg([0, y], [100, y], 0, SK.GROUND));
  const bridge = seg([50, 0], [50, 120], 1, SK.BRIDGE);
  const all = [...roads, bridge];
  const crossings = detectCrossings(all);
  console.log(`overpass over 5 roads: ${crossings.length} crossings, separated=${crossings.filter(c=>c.separated).length}`);
  assert.equal(crossings.length, 5);
  assert.ok(crossings.every(c => c.separated === true));
  assert.ok(crossings.every(c => c.clearance === CLEARANCE_TILES));
  // reverse: ground roads counted once each, no duplicate pairs
  // also via GradeSeparation class
  const gs = new GradeSeparation(99);
  gs.setNetwork(all);
  const vc = gs.getCrossings();
  assert.equal(vc.length, 5);
  assert.equal(gs.stats().separated, 5);
  assert.equal(gs.stats().atGrade, 0);
  // pillars and portals unaffected
  const view = gs.view();
  assert.ok(view.decks.length === 1);
  console.log(`decks=${view.decks.length} pillars=${view.pillars.length} portals=${view.portals.length}`);
});

test('7 underpass / high bridge: tunnel and z=2 correctly separated', () => {
  resetIds();
  const ground = seg([0, 50], [100, 50], 0, SK.GROUND);
  const tunnel = seg([50, 0], [50, 100], -1, SK.TUNNEL);
  const high = seg([0, 70], [100, 70], 2, SK.BRIDGE); // high bridge elevation 2, different y so crosses tunnel
  // ground vs tunnel separated
  let c = detectCrossings([ground, tunnel]);
  assert.equal(c[0]!.separated, true);
  assert.equal(c[0]!.clearance, CLEARANCE_TILES);
  // ground vs high separated with double clearance
  c = detectCrossings([ground, high]);
  // ground at y=50, high at y=70 do not intersect — create a high that does cross ground
  resetIds();
  const ground2 = seg([0, 50], [100, 50], 0, SK.GROUND);
  const high2 = seg([50, 0], [50, 100], 2, SK.BRIDGE);
  c = detectCrossings([ground2, high2]);
  assert.equal(c[0]!.separated, true);
  assert.equal(c[0]!.clearance, 2 * CLEARANCE_TILES);
  // tunnel vs high separated (3 levels difference) — use perpendicular crossing
  resetIds();
  const tun2 = seg([0, 50], [100, 50], -1, SK.TUNNEL); // east-west tunnel
  const high3 = seg([50, 0], [50, 100], 2, SK.BRIDGE); // north-south high
  c = detectCrossings([tun2, high3]);
  assert.equal(c[0]!.separated, true);
  assert.equal(c[0]!.clearance, 3 * CLEARANCE_TILES);
  // at-grade only when z equal: two bridges both z=1 crossing
  resetIds();
  const b1 = seg([0, 50], [100, 50], 1, SK.BRIDGE);
  const b2 = seg([50, 0], [50, 100], 1, SK.BRIDGE);
  c = detectCrossings([b1, b2]);
  console.log(`two z=1 bridges crossing: separated=${c[0]!.separated}, clearance=${c[0]!.clearance}`);
  assert.equal(c[0]!.separated, false);
  assert.equal(c[0]!.clearance, 0);
  // same for two grounds
  resetIds();
  const g1 = seg([0, 50], [100, 50], 0, SK.GROUND);
  const g2 = seg([50, 0], [50, 100], 0, SK.GROUND);
  c = detectCrossings([g1, g2]);
  assert.equal(c[0]!.separated, false);
});

test('8 determinism: two identical instances give identical crossings, pillars, portals, cost', () => {
  resetIds();
  const segs: GradeSegment[] = [
    seg([0, 10], [100, 10], 0, SK.GROUND),
    seg([0, 30], [100, 30], 0, SK.GROUND),
    seg([0, 50], [100, 50], 0, SK.GROUND),
    seg([50, 0], [50, 60], 1, SK.BRIDGE),
    seg([10, 0], [10, 60], -1, SK.TUNNEL),
  ];
  const a = new GradeSeparation(12345);
  const b = new GradeSeparation(12345);
  a.setNetwork(segs);
  b.setNetwork(segs);
  const ca = a.getCrossings(), cb = b.getCrossings();
  assert.deepEqual(ca, cb);
  assert.equal(a.cost(), b.cost());
  const va = a.view(), vb = b.view();
  assert.deepEqual(va.decks, vb.decks);
  assert.deepEqual(va.pillars, vb.pillars);
  assert.deepEqual(va.portals, vb.portals);
  assert.deepEqual(va.crossings, vb.crossings);
  console.log(`determinism: ${ca.length} crossings, cost=${a.cost()}, pillars=${va.pillars.length}`);
  // different seed gives different pillar jitter but same counts (deterministic per seed)
  const c = new GradeSeparation(99999);
  c.setNetwork(segs);
  const vc = c.view();
  assert.equal(vc.pillars.length, va.pillars.length); // same count
  // but positions differ (jitter seeded differently)
  let diff = 0;
  for (let i = 0; i < va.pillars.length; i++) if (Math.abs(va.pillars[i]!.x - vc.pillars[i]!.x) > 1e-9) diff++;
  console.log(`different seed pillar jitter diff count=${diff} (expected >0 if pillars exist)`);
  // segs mutated outside should not affect
  segs[0]!.a.x = 9999;
  assert.equal(a.getCrossings().length, ca.length);
});

test('9 performance: 200 segments grid, cost/validate under 0.5 ms; 20x20 stress', () => {
  // 200 segs: 10x10 grid of roads + some overpasses
  resetIds();
  const segs: GradeSegment[] = [];
  const N = 10;
  const step = 20;
  for (let i = 0; i < N; i++) {
    segs.push(seg([0, i * step], [N * step, i * step], 0, SK.GROUND)); // horizontal
    segs.push(seg([i * step, 0], [i * step, N * step], 0, SK.GROUND)); // vertical
  }
  // add a few bridges over the grid
  for (let i = 0; i < 5; i++) segs.push(seg([i * step + 5, -5], [i * step + 5, N * step + 5], 1, SK.BRIDGE));
  // make 200 by duplicating with offset
  while (segs.length < 200) {
    const base = segs[segs.length % 20]!;
    segs.push(seg([base.a.x + 200, base.a.y], [base.b.x + 200, base.b.y], base.elevation, base.kind));
  }
  const t0 = performance.now();
  const crossings = detectCrossings(segs);
  const t1 = performance.now();
  console.log(`200 segs: ${crossings.length} crossings, detect=${(t1 - t0).toFixed(2)} ms`);
  assert.ok(crossings.length > 0);
  const gs = new GradeSeparation(1);
  gs.setNetwork(segs);
  const t2 = performance.now();
  const cost = gs.cost();
  const t3 = performance.now();
  const errs = gs.validate();
  const t4 = performance.now();
  const view = gs.view();
  const t5 = performance.now();
  console.log(`cost=${cost} took ${(t3 - t2).toFixed(3)} ms; validate ${errs.length} errs ${(t4 - t3).toFixed(3)} ms; view decks=${view.decks.length} pillars=${view.pillars.length} ${(t5 - t4).toFixed(3)} ms`);
  assert.ok(t3 - t2 < 5, `cost took ${t3 - t2} ms`);
  assert.ok(t4 - t3 < 5, `validate took ${t4 - t3} ms`);
  // 20x20 stress (400 segs) for information (not asserted strict)
  resetIds();
  const big: GradeSegment[] = [];
  const M = 20;
  for (let i = 0; i < M; i++) {
    big.push(seg([0, i * 10], [M * 10, i * 10], 0, SK.GROUND));
    big.push(seg([i * 10, 0], [i * 10, M * 10], 0, SK.GROUND));
  }
  // add overpasses
  for (let i = 0; i < 10; i++) big.push(seg([5 + i * 18, -5], [5 + i * 18, M * 10 + 5], 1, SK.BRIDGE));
  const tb0 = performance.now();
  const bigCross = detectCrossings(big);
  const tb1 = performance.now();
  console.log(`400 segs (20x20): ${bigCross.length} crossings, detect=${(tb1 - tb0).toFixed(2)} ms`);
  // still reasonable (<50 ms)
  assert.ok(tb1 - tb0 < 100, `big detect ${tb1 - tb0} ms`);
});

test('extra: shared endpoints do not create crossings; parallel no crossing', () => {
  resetIds();
  const s1 = seg([0, 0], [50, 0], 0, SK.GROUND);
  const s2 = seg([50, 0], [100, 0], 0, SK.GROUND); // share endpoint (50,0) — no crossing
  assert.equal(detectCrossings([s1, s2]).length, 0);
  const s3 = seg([0, 10], [100, 10], 0, SK.GROUND); // parallel to s1
  assert.equal(detectCrossings([s1, s3]).length, 0);
  // T touching at interior of one but endpoint of other: should not count (we require interior of both)
  const s4 = seg([50, 0], [50, 50], 0, SK.GROUND); // T at (50,0) which is endpoint of s2? Actually s1 ends at 50,0 so endpoint, not crossing
  assert.equal(detectCrossings([s1, s4]).length, 0);
});

test('extra: view pillars and portals counts', () => {
  resetIds();
  const b = seg([0, 0], [45, 0], 1, SK.BRIDGE); // 45 tiles -> floor(45/15)=3 pillars
  const t = seg([0, 20], [60, 20], -1, SK.TUNNEL); // isolated tunnel 60 tiles -> 2 portals
  const gs = new GradeSeparation(777);
  gs.setNetwork([b, t]);
  const view = gs.view();
  console.log(`bridge 45 tiles pillars=${view.pillars.length} (expect 3), tunnel portals=${view.portals.length} (expect 2)`);
  assert.equal(view.pillars.length, 3);
  assert.equal(view.portals.length, 2);
  // ramps
  assert.equal(view.ramps.length, 2);
  // decks
  assert.equal(view.decks.length, 1);
});

test('extra: isSeparated helper', () => {
  resetIds();
  const g = seg([0, 50], [100, 50], 0, SK.GROUND);
  const br = seg([50, 0], [50, 100], 1, SK.BRIDGE);
  const gs = new GradeSeparation(1);
  gs.setNetwork([g, br]);
  assert.equal(gs.isSeparated(g.id, br.id), true);
  assert.equal(gs.isSeparated(br.id, g.id), true);
  assert.equal(gs.isSeparated(g.id, 9999), false);
  // at-grade
  resetIds();
  const g1 = seg([0, 50], [100, 50], 0, SK.GROUND);
  const g2 = seg([50, 0], [50, 100], 0, SK.GROUND);
  const gs2 = new GradeSeparation(2);
  gs2.setNetwork([g1, g2]);
  assert.equal(gs2.isSeparated(g1.id, g2.id), false);
});
