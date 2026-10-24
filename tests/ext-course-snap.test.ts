import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SNAP_PIECE_DIMS,
  SUN_RIGHT_TILE_VEC,
  autoTextureForPiece,
  buildPiecePolygon,
  buildSplineRibbonPolygon,
  buildSunRightBevelPolygons,
  computeSnapPiecePlacement,
  wrapPaintAngle,
  type SnapTargetArea,
  type SnapTargetRoad,
} from '../src/game/ext/course-snap';

describe('ext/course-snap (T029)', () => {
  it('wraps paint angles to [-90, 90] and builds auto-texture collar recipes (Choice 3A)', () => {
    assert.equal(wrapPaintAngle(45), 45);
    assert.equal(wrapPaintAngle(120), -60);
    assert.equal(wrapPaintAngle(-135), 45);

    const fw = autoTextureForPiece('fairway', 30);
    assert.deepEqual(fw, { tex: 'golfFairway', border: 3, btex: 'golfFirstCut', radius: 3, angle: 30 });

    const gr = autoTextureForPiece('green', 0);
    assert.deepEqual(gr, { tex: 'golfGreen', border: 2, btex: 'golfFringe', radius: 4, angle: 0 });

    const tee = autoTextureForPiece('tee', -15);
    assert.deepEqual(tee, { tex: 'golfTee', border: 1, btex: 'golfFirstCut', radius: 1, angle: -15 });
  });

  it('snaps a fairway segment to an existing fairway edge with fat dimensional borders and sun-right bevels', () => {
    const existingFairway: SnapTargetArea = {
      id: 11,
      kind: 'fairway',
      hole: 4,
      pts: [100, 100, 124, 100, 124, 112, 100, 112],
    };
    const res = computeSnapPiecePlacement({
      kind: 'fairway',
      cursor: { x: 126, y: 106 },
      defaultHole: 1,
      areas: [existingFairway],
    });
    assert.equal(res.snapped, true);
    assert.equal(res.snapRule, 'fairway-to-fairway');
    assert.equal(res.targetId, 11);
    assert.equal(res.hole, 4);
    assert.deepEqual(res.snapPt, { x: 124, y: 106 });
    assert.equal(res.angleDeg, 0);
    assert.ok(res.pts.includes(124) && res.pts.includes(148));
    assert.deepEqual(res.layers.map(l => l.role), ['shadow-bevel', 'outer-rim', 'collar', 'core']);
    assert.ok(res.layers.every(l => l.border === 3));
  });

  it('snaps a kidney or practice green to a fairway with sun-right bevels, fat collars, height break, and pins', () => {
    const existingFairway: SnapTargetArea = {
      id: 21,
      kind: 'fairway',
      hole: 7,
      pts: [200, 200, 224, 200, 224, 212, 200, 212],
    };
    const res = computeSnapPiecePlacement({
      kind: 'green',
      archetype: 'green-kidney',
      cursor: { x: 225.5, y: 206 },
      areas: [existingFairway],
    });
    assert.equal(res.snapped, true);
    assert.equal(res.snapRule, 'green-to-fairway');
    assert.equal(res.hole, 7);
    assert.equal(res.recipe.tex, 'golfGreen');
    assert.equal(res.recipe.btex, 'golfFringe');
    assert.equal(res.recipe.joinCollarTex, 'golfFringe');
    assert.deepEqual(res.layers.map(l => l.role), ['shadow-bevel', 'outer-rim', 'sun-bevel', 'collar', 'core', 'join-apron']);
    assert.equal(res.heightOps.length, 1);
    assert.equal(res.props.filter(p => p.kind === 'pin').length, 1);

    const prac = computeSnapPiecePlacement({
      kind: 'green',
      archetype: 'green-practice',
      cursor: { x: 400, y: 400 },
    });
    assert.deepEqual(prac.props.map(p => p.number), [1, 2, 3]);
  });

  it('builds sun-from-right 3D bevels, raised tee boxes with steps, sunken bunkers, and natural ponds', () => {
    assert.ok(SUN_RIGHT_TILE_VEC.x > 0 && SUN_RIGHT_TILE_VEC.y < 0);
    const bev = buildSunRightBevelPolygons([100, 100, 110, 100, 110, 110, 100, 110], 'raised', 1.0);
    assert.ok(bev.sunLitPts[0]! > bev.shadedPts[0]!, 'sun-lit bevel shifts toward +x (right on screen)');
    assert.ok(bev.sunLitPts[1]! < bev.shadedPts[1]!, 'sun-lit bevel shifts toward -y (right on screen)');

    const tee = computeSnapPiecePlacement({
      kind: 'tee',
      archetype: 'tee-raised',
      cursor: { x: 150, y: 150 },
      angleDeg: 0,
    });
    assert.equal(tee.heightOps[0]?.mode, 'raise');
    assert.ok(tee.props.some(p => p.kind === 'tee-steps'));

    const bunker = computeSnapPiecePlacement({
      kind: 'bunker',
      archetype: 'bunker-crescent',
      cursor: { x: 180, y: 150 },
    });
    assert.equal(bunker.heightOps.length, 2);
    assert.ok(bunker.layers.some(l => l.role === 'shadow-bevel' && l.tone === 1));
    assert.ok(bunker.layers.some(l => l.role === 'sun-bevel' && l.tone === 2));

    const pond = computeSnapPiecePlacement({
      kind: 'water',
      archetype: 'water-pond',
      cursor: { x: 210, y: 150 },
    });
    assert.equal(pond.heightOps[0]?.mode, 'lower');
    assert.ok(pond.props.some(p => p.kind === 'pond-waterfall'));

    const dogleg = buildSplineRibbonPolygon({ x: 100, y: 100 }, { x: 120, y: 105 }, { x: 140, y: 120 }, 3, 7, 8);
    assert.equal(dogleg.length, 36);
  });

  it('snaps a cart path and road stub to a road kerb and respects snapEnabled=false for advanced players', () => {
    const road: SnapTargetRoad = { id: 5, ax: 300, ay: 300, bx: 340, by: 300, halfWidthTiles: 3 };
    const pathRes = computeSnapPiecePlacement({
      kind: 'path',
      cursor: { x: 320, y: 304.5 },
      roads: [road],
    });
    assert.equal(pathRes.snapped, true);
    assert.equal(pathRes.snapRule, 'path-to-road');
    assert.equal(pathRes.targetId, 5);
    assert.deepEqual(pathRes.snapPt, { x: 320, y: 303 });
    assert.equal(pathRes.angleDeg, 90);
    assert.equal(pathRes.recipe.joinCollarTex, 'gravel');

    const free = computeSnapPiecePlacement({
      kind: 'fairway',
      cursor: { x: 125, y: 106 },
      snapEnabled: false,
      angleDeg: 35,
      scale: 1.5,
      defaultHole: 2,
    });
    assert.equal(free.snapped, false);
    assert.equal(free.hole, 2);
    assert.equal(free.angleDeg, 35);

    const scaled = buildPiecePolygon('tee', { x: 50, y: 50 }, 0, 2, false);
    const spanX = Math.max(scaled[0]!, scaled[2]!, scaled[4]!, scaled[6]!) - Math.min(scaled[0]!, scaled[2]!, scaled[4]!, scaled[6]!);
    assert.equal(spanX, SNAP_PIECE_DIMS.tee.lengthTiles * 2);
  });
});

describe('ext/course-snap join strips', () => {
  it('edges a turf join with first cut, a cart path join with gravel and only a road join with a kerb', () => {
    const fairway: SnapTargetArea = { id: 1, kind: 'fairway', hole: 2, pts: [200, 200, 224, 200, 224, 212, 200, 212] };
    const green = computeSnapPiecePlacement({ kind: 'green', archetype: 'green-kidney', cursor: { x: 225.5, y: 206 }, areas: [fairway] });
    assert.equal(green.layers.find(l => l.role === 'join-apron')?.btex, 'golfFirstCut');
    const road: SnapTargetRoad = { id: 5, ax: 300, ay: 300, bx: 340, by: 300, halfWidthTiles: 3 };
    const path = computeSnapPiecePlacement({ kind: 'path', cursor: { x: 320, y: 304.5 }, roads: [road] });
    assert.equal(path.layers.find(l => l.role === 'join-apron')?.btex, 'gravel');
    const stub = computeSnapPiecePlacement({ kind: 'road', cursor: { x: 320, y: 304.5 }, roads: [road] });
    assert.equal(stub.layers.find(l => l.role === 'join-apron')?.btex, 'kerb');
  });
});
