/** Tests for T364 (#1019; the owner, 2026-11-08: "replace grass on tees with the green grass but without any mow lines" and "use the same texture the
 * bunker uses for its walls for the elevated tee walls"): the Tee surface wears the putting green's painted grass, with no mowing lines unless a look
 * turns them on; a raised tee's cut sides wear the bunker's wall (its picture, its stage shader's light) and the old tees stay one setting away
 * (the course finish's teeWall 'rock', the file's Tee look, the dev server's ?tee=old). Pure, Node. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import file from '../src/game/painted-surfaces.json';
import { OLD_TEE_LOOK, clampSurfaces, lookOfTex, oldTeeSurfaces } from '../src/game/painted-surfaces';
import { DEFAULT_COURSE_FINISH, FINISH_OFF, TEE_WALLS, clampCourseFinish, finishOf, mowShown, mowSpec } from '../src/game/course-finish';
import { fairwayStripeLook } from '../src/game/course-stripes';
import { PRESETS } from '../src/game/paint-presets';
import { BUNKER_WALL_METRES, BUNKER_WALL_STRENGTH, TEE_WALL_EXPOSURE, TEE_WALL_STRENGTH, bunkerWallContact, bunkerWallOverhang, bunkerWallShade, teeWallShade } from '../src/game/tee-wall';
import { BUNKER_PACK_TEXTURES } from '../src/game/ext/bunker-look/stage-materials';
import { DEFAULT_BUNKER_TEXTURES } from '../src/game/ext/bunker-look/settings';
import { FaceForm, ROCK_FROM, SURF_HEIGHT, WallMat, faceForm, surfHeights } from '../src/game/ext/course-walls/index.js';
import { SURF } from '../src/game/ext/course-grid/index.js';

const F = clampSurfaces(file), BASE = fairwayStripeLook();

test('the Tee surface wears the putting green\'s painted grass: the same family, version, scale, tint and tone, on the tee\'s own texture ids', () => {
  assert.equal(F.surfaces.tee!.family, 'green-concept-run');
  assert.deepEqual(F.surfaces.tee, F.surfaces.green, 'the green\'s look, whole');
  // the tee's photo texture id (golfTee) and a preset standing for the tee surface lay it; the fairway's grass is not the tee's any more
  assert.deepEqual(lookOfTex('golfTee', F), lookOfTex('golfGreen', F));
  const teePreset = { id: 'a-tee', surface: 'tee' }; assert.deepEqual(lookOfTex('preset:a-tee', F, [teePreset]), F.surfaces.green);
  assert.notEqual(lookOfTex('golfTee', F)!.family, lookOfTex('golfFairway', F)!.family);
  // the range's turf tee box already wore the green's grass: the course's tee and the range's match
  const range = PRESETS.find(p => p.id === 'range-tee-turf'); if (range) assert.equal(lookOfTex(`preset:${range.id}`, F, [range])!.family, F.surfaces.tee!.family);
  // the first cut round a tee, the green's fringe and the fairway keep their own looks
  assert.equal(F.surfaces.firstCut!.family, 'first-cut-concept-run'); assert.equal(F.surfaces.fairway!.family, 'fairway-concept-run');
});

test('no mowing lines on a tee by default: its look sets none, the finish lays none, the panel reads Off; a look that turns them on still gets them', () => {
  for (const fin of [DEFAULT_COURSE_FINISH, FINISH_OFF, { ...DEFAULT_COURSE_FINISH, bandStrength: 1 }]) {
    assert.equal(mowSpec('tee', undefined, fin, BASE), null, 'mown plain');
    assert.equal(mowShown('tee', undefined, fin).on, false);
  }
  assert.equal(mowSpec('tee', { on: 0 }, DEFAULT_COURSE_FINISH, BASE), null);
  assert.ok(mowSpec('tee', { on: 1 }, DEFAULT_COURSE_FINISH, BASE), 'turned on by the player: the lines');
});

test('a tee\'s walls: the bunker\'s by default, the old rock a setting; the finish being off does not touch them', () => {
  assert.deepEqual([...TEE_WALLS], ['bunker', 'rock']);
  assert.equal(DEFAULT_COURSE_FINISH.teeWall, 'bunker'); assert.equal(finishOf(F).teeWall, 'bunker'); assert.equal(finishOf(null).teeWall, 'bunker');
  assert.equal(FINISH_OFF.teeWall, 'bunker', 'the tees\' walls are T127\'s, not T227\'s: the finish off keeps them');
  assert.equal(clampCourseFinish({ teeWall: 'rock' }).teeWall, 'rock');
  assert.equal(clampCourseFinish({ teeWall: 'bunker' }).teeWall, 'bunker');
  for (const bad of ['cliff', 7, null, undefined, {}]) assert.equal(clampCourseFinish({ teeWall: bad }).teeWall, 'bunker', `${String(bad)}: the default`);
  // it survives the file's own clamp (the Studio saves the course block whole)
  const saved = clampSurfaces(JSON.parse(JSON.stringify({ ...file, course: { ...DEFAULT_COURSE_FINISH, teeWall: 'rock' } })));
  assert.equal(saved.course!.teeWall, 'rock'); assert.equal(finishOf(saved).teeWall, 'rock');
});

test('the old tees: the fairway\'s grass and the rock sides, from one call; nothing else in the file changes and the file itself is left alone', () => {
  const was = JSON.stringify(F), old = oldTeeSurfaces(F);
  assert.equal(JSON.stringify(F), was, 'the file is not changed');
  assert.deepEqual(old.surfaces.tee, OLD_TEE_LOOK); assert.equal(old.surfaces.tee!.family, F.surfaces.fairway!.family, 'the fairway\'s grass, as before');
  assert.equal(finishOf(old).teeWall, 'rock');
  assert.deepEqual({ ...old.surfaces, tee: F.surfaces.tee }, F.surfaces, 'every other surface as it was');
  assert.deepEqual(old.lawns, F.lawns); assert.deepEqual(old.presets, F.presets);
  assert.deepEqual({ ...finishOf(old), teeWall: 'bunker' }, finishOf(F), 'the other knobs as they were');
  // saved and loaded again, it is the same file
  assert.deepEqual(clampSurfaces(JSON.parse(JSON.stringify(old))), old);
  // a file with its own finish keeps its knobs
  const own = oldTeeSurfaces({ ...F, course: { ...DEFAULT_COURSE_FINISH, bandWidth: 7 } });
  assert.equal(own.course!.bandWidth, 7); assert.equal(own.course!.teeWall, 'rock');
});

test('a raised tee has the rock form (the default 0.6 m, from ROCK_FROM up) and a flat tee a low grass bank: the two shots\' tees', () => {
  assert.ok(SURF_HEIGHT[SURF.tee]! >= ROCK_FROM);
  assert.equal(faceForm(SURF.tee, WallMat.Turf, SURF_HEIGHT).f, FaceForm.Rock, 'the raised tee: the walls the bunker\'s picture now clothes');
  const low = surfHeights([undefined, undefined, undefined, undefined, undefined, 0.15]);
  assert.equal(faceForm(SURF.tee, WallMat.Turf, low).f, FaceForm.Bank, 'the flat tee: a low grass bank, no wall');
  // a bunker's own cut face and the pond's stay walls: the tee's picture is the bunker's, never the other way round
  assert.equal(faceForm(SURF.tee, WallMat.Sand, SURF_HEIGHT).f, FaceForm.Wall);
});

test('the bunker wall: the picture the Bunker look\'s Cut wall wears by default, at the scale the approved bunker lays it', () => {
  assert.equal(DEFAULT_BUNKER_TEXTURES.wall, 'bunker:wall-earth');
  const e = BUNKER_PACK_TEXTURES.find(t => t.id === 'bunker:wall-earth')!;
  assert.ok(e && /\/textures\/wall-earth\.png$/.test(e.url.split('?')[0]!), 'the pack\'s Wall earth: wall-earth.png, the file the tee wall lays too');
  // one repeat is 0.6 x aspect x textureScale (1.164) x earthScale (3) ground units of 2 m along the wall: about 7.45 m
  assert.ok(Math.abs(BUNKER_WALL_METRES - 7.45) < 0.01, String(BUNKER_WALL_METRES));
});

test('the bunker wall\'s light: its stage shader\'s term, none of it turned from the sun, the picture as it is turned to it; the tee wall takes the same range', () => {
  // the shader: directional = .28 + .74 x light, shade = mix(.95, directional, strength): the approved Shadow 1.252 / 1.5
  assert.ok(Math.abs(BUNKER_WALL_STRENGTH - 0.835) < 0.001);
  assert.ok(Math.abs(bunkerWallShade(0) - (0.95 + (0.28 - 0.95) * BUNKER_WALL_STRENGTH)) < 1e-9, 'turned from the sun: the least');
  assert.ok(bunkerWallShade(0) > 0.3 && bunkerWallShade(0) < 0.5, `a face in its own shade keeps about 0.39 (${bunkerWallShade(0)})`);
  assert.ok(bunkerWallShade(1) > 0.9 && bunkerWallShade(1) <= 1, 'turned to the sun: the picture as it is');
  assert.equal(bunkerWallShade(0, 0), 0.95, 'no Shadow strength: a flat .95');
  let last = -1; for (let l = 0; l <= 1.0001; l += 0.05) { const v = bunkerWallShade(l); assert.ok(v >= last, `light ${l.toFixed(2)} is not darker than less light`); last = v; }
  assert.equal(bunkerWallShade(-3), bunkerWallShade(0)); assert.equal(bunkerWallShade(9), bunkerWallShade(1), 'held to its range');
  // the tee's slope: its bank light range (flat ground is 1) mapped onto the shader's, at the tee wall's own strength (a bunker's pit wall in its own
  // shade is near black; a tee's wall is seen in the open and keeps the texture in shade: the same term at a lower strength, the picture lifted)
  assert.ok(TEE_WALL_STRENGTH > 0 && TEE_WALL_STRENGTH < BUNKER_WALL_STRENGTH, 'the same shader term, turned down');
  assert.ok(TEE_WALL_EXPOSURE > 1 && TEE_WALL_EXPOSURE < 2, 'the picture lifted by adding itself at the excess (an alpha in (0, 1))');
  for (const [lo, hi] of [[0.3, 1.7]] as const) {
    assert.equal(teeWallShade(lo, lo, hi), bunkerWallShade(0, TEE_WALL_STRENGTH)); assert.equal(teeWallShade(hi, lo, hi), bunkerWallShade(1, TEE_WALL_STRENGTH));
    assert.ok(teeWallShade(1, lo, hi) > teeWallShade(lo, lo, hi) && teeWallShade(1, lo, hi) < teeWallShade(hi, lo, hi), 'flat-ground light is in between');
    assert.ok(teeWallShade(lo, lo, hi) > bunkerWallShade(0), 'a tee wall turned from the sun keeps more of its picture than a pit wall in shade');
    // a face turned from the sun keeps its texture (a share of the lifted picture that is not black) and still reads darker than one turned to it
    assert.ok(teeWallShade(lo, lo, hi) * TEE_WALL_EXPOSURE > 0.6, `${teeWallShade(lo, lo, hi) * TEE_WALL_EXPOSURE}`);
    assert.ok(teeWallShade(hi, lo, hi) / teeWallShade(lo, lo, hi) > 1.3, 'lit and shaded faces differ');
  }
  assert.equal(teeWallShade(1, 1, 1), bunkerWallShade(0, TEE_WALL_STRENGTH), 'a degenerate range does not divide by nothing');
  // the lip's overhang and the foot's contact: darker, never past the shader's .62 floor
  assert.ok(bunkerWallOverhang() < 1 && bunkerWallOverhang() >= 0.62 && bunkerWallContact() < 1 && bunkerWallContact() >= 0.62);
  assert.ok(bunkerWallOverhang() < bunkerWallContact(), 'the shader darkens under the lip more than at the foot (0.18 against 0.14)');
  assert.equal(bunkerWallOverhang(0), 1);
});
