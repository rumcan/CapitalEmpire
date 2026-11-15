/** Tests for #1326 (the owner, 2026-11-15: "can we get the mowing lines on fairway the same as in the golf gameplay where we have a better multiple stripes that
 * cross"): the fairway's default mowing is the golf view's criss-cross (packages/cinderlinks/parts/05-ground.md plaid: 3.6 m stripes along the hole crossed by a
 * fainter set at right angles), straight over the whole hole (no chevron at a bend), the green's the view's fine diagonal checker; the looks before stay a setting
 * (?mow=wide, ?gmow=along). Pure, Node. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import file from '../src/game/painted-surfaces.json';
import { BAND_PATTERNS, DEFAULT_FAIRWAY_PATTERN, DEFAULT_GREEN_PATTERN, MOW_PATTERNS, PATTERN_LOOKS, mowRecOf, patternOf } from '../src/game/mow-lines';
import { DEFAULT_COURSE_FINISH, clampCourseFinish, crewBandLook, finishOf, finishStripeLook, greenStripeLook, mowShown, mowSpec } from '../src/game/course-finish';
import { PLAID_CROSS, PLAID_MAIN, bandAt, fairwayStripeLook, holeStripeLegs, mainLegDeg, plaidLegs } from '../src/game/course-stripes';
import { clampSurfaces, greenPatternSurfaces, mowPatternSurfaces } from '../src/game/painted-surfaces';

const FIN = DEFAULT_COURSE_FINISH, BASE = fairwayStripeLook(), F = clampSurfaces(file);
const P = (id: string) => MOW_PATTERNS.findIndex(q => q.id === id);
const DOGLEG = [0, 0, 100, 0, 100, 40];   // a long leg east, then a short one south

test('the criss-cross is a pattern at the end of the list (a saved look\'s index keeps its meaning) and the fairway\'s default', () => {
  assert.deepEqual(MOW_PATTERNS.map(p => p.id).slice(0, 8), ['along', 'wide', 'crosscut', 'halves', 'collar', 'straight', 'check', 'diamond']);
  assert.equal(MOW_PATTERNS[8]!.id, 'plaid'); assert.equal(patternOf(mowRecOf({ pattern: 'plaid' })), 'plaid');
  assert.equal(DEFAULT_FAIRWAY_PATTERN, 'plaid'); assert.equal(FIN.pattern, 'plaid'); assert.equal(finishOf(F).pattern, 'plaid');
  const sp = mowSpec('fairway', undefined, FIN, BASE)!;
  assert.equal(sp.pattern, 'plaid'); assert.equal(sp.textured, true); assert.equal(sp.angle, 0);
  // the golf view's 3.6 m stripe in 2 m tiles; the texture made lighter or darker, no tint
  assert.equal(sp.look.w, 1.8); assert.equal(PATTERN_LOOKS.plaid!.w! * 2, 3.6); assert.equal(sp.look.t, 0); assert.equal(sp.look.straight, 0); assert.equal(sp.look.across, false);
  assert.equal(mowShown('fairway', undefined, FIN).pattern, 'plaid');
});

test('two sets crossing at right angles, each one leg over the whole hole: no fold at the bend', () => {
  const look = mowSpec('fairway', undefined, FIN, BASE)!.look, [main, cross] = plaidLegs(DOGLEG, look);
  assert.equal(main.length, 1); assert.equal(cross.length, 1); assert.equal(main[0]!.cut, null); assert.equal(cross[0]!.cut, null);
  assert.equal(mainLegDeg(DOGLEG), 0, 'the longest leg runs east');
  // the main set's bands alternate sideways (its stripes run east, along the long leg); the cross set's along it
  const a = main[0]!.m, b = cross[0]!.m;
  assert.ok(Math.abs(a.ux) < 1e-9 && Math.abs(Math.abs(a.uy) - 1) < 1e-9, `main axis ${a.ux},${a.uy}`);
  assert.ok(Math.abs(a.ux * b.ux + a.uy * b.uy) < 1e-9, 'the sets cross at right angles');
  // strengths: the main stronger, the two adding up to the look's own where they agree
  assert.ok(PLAID_MAIN > PLAID_CROSS); assert.ok(Math.abs(PLAID_MAIN + PLAID_CROSS - 1) < 1e-9);
  assert.ok(Math.abs(a.l - look.l * PLAID_MAIN) < 1e-12 && Math.abs(b.l - look.l * PLAID_CROSS) < 1e-12 && Math.abs(a.k - look.k * PLAID_MAIN) < 1e-12);
  // the tee in the middle of a light main stripe, as the view centres its stripes on the line
  assert.equal(bandAt(main, 0, 0).light, true); assert.equal(bandAt(main, 0, 0.85).light, true); assert.equal(bandAt(main, 0, 0.95).light, false);
  // four tones: every pairing of a light or dark main stripe with a light or dark cross band is found on the fairway
  const tones = new Set<string>();
  for (let x = 0; x < 8; x += 0.5) for (let y = -4; y < 4; y += 0.5) tones.add(`${bandAt(main, x, y).light}${bandAt(cross, x, y).light}`);
  assert.equal(tones.size, 4);
  // past the bend the same stripes run on (one leg): the stripe at the bend's side is the one on the long leg
  assert.equal(bandAt(main, 100, 20).leg, 0); assert.equal(bandAt(main, 100, 20).band, bandAt(main, 10, 20).band);
});

test('the grounds crew mows the main stripes the ground draws, and the look\'s angle turns the pattern', () => {
  const sp = mowSpec('fairway', undefined, FIN, BASE)!;
  assert.ok(BAND_PATTERNS.includes('plaid')); assert.deepEqual(crewBandLook(sp, finishStripeLook(FIN, BASE)!), sp.look);
  const crew = holeStripeLegs(DOGLEG, sp.look), [main] = plaidLegs(DOGLEG, sp.look);
  assert.equal(crew.length, 1); assert.deepEqual([crew[0]!.m.ux, crew[0]!.m.uy, crew[0]!.m.ox, crew[0]!.m.oy], [main[0]!.m.ux, main[0]!.m.uy, main[0]!.m.ox, main[0]!.m.oy]);
  const turned = mowSpec('fairway', { p: P('plaid'), a: 30 }, FIN, BASE)!; assert.equal(turned.look.straight, 30); assert.equal(turned.angle, 0);
  const [tm] = plaidLegs(DOGLEG, turned.look), ang = (Math.atan2(-tm[0]!.m.ux, tm[0]!.m.uy) * 180) / Math.PI;
  assert.ok(Math.abs(ang - 30) < 1e-9, `${ang}`);
  // greenkeeping's mow angle, when set, is the main stripes' direction
  const [gk] = plaidLegs(DOGLEG, sp.look, 90); assert.ok(Math.abs(Math.abs(gk[0]!.m.ux) - 1) < 1e-9);
  // a line of under two points: the default direction, from the map origin
  assert.equal(plaidLegs([], sp.look)[0].length, 1); assert.ok(Number.isFinite(mainLegDeg([5, 5])));
});

test('the green: the view\'s fine diagonal checker by default; the old looks are a setting', () => {
  assert.equal(DEFAULT_GREEN_PATTERN, 'diamond'); assert.equal(FIN.greenPattern, 'diamond');
  const g = mowSpec('green', undefined, FIN, BASE)!;
  assert.equal(g.pattern, 'diamond'); assert.equal(g.look.check, true); assert.equal(g.angle, 45); assert.equal(g.look.w, greenStripeLook(FIN, BASE)!.w);
  assert.equal(mowShown('green', undefined, FIN).pattern, 'diamond');
  // the tee stays plain (the owner's calls of 2026-10-29 and 2026-11-08)
  assert.equal(mowSpec('tee', undefined, FIN, BASE), null);
  // the looks before #1326: ?mow=wide, ?gmow=along, and the file's knobs
  assert.equal(mowSpec('fairway', undefined, finishOf(mowPatternSurfaces(F, 'wide')), BASE)!.look.w, 5);
  const oldGreen = mowSpec('green', undefined, finishOf(greenPatternSurfaces(F, 'along')), BASE)!;
  assert.equal(oldGreen.pattern, 'along'); assert.deepEqual(oldGreen.look, greenStripeLook(finishOf(F), BASE));
  assert.equal(clampCourseFinish({ greenPattern: 'zigzag' }).greenPattern, 'diamond'); assert.equal(clampCourseFinish({ greenPattern: 'along' }).greenPattern, 'along');
  // the finish off: no green lines, as before
  assert.equal(mowSpec('green', undefined, { ...FIN, on: false }, BASE), null);
});
