/** Tests for T365 (#1020; the owner, 2026-11-08: "add fairway mowing lines that have patterns like the image attached" and "make the strongest look the default for
 * new fairways"): four more mowing patterns, wide stripes, a crosscut, two-tone halves and a collar ring (src/game/mow-lines.ts), each with its own tuned numbers;
 * the fairway's default is the finish's pattern, wide stripes, and the old look (the bands along the hole at the finish's own width and strength) is the pattern
 * 'along' (the file's `course.pattern`, the dev server's ?mow=along). Held to the owner's rules: the texture made lighter or darker, never a tint; baked, nothing per
 * frame (the stripes are laid by the ground painter's bake from the same records). Pure, Node. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import file from '../src/game/painted-surfaces.json';
import { BAND_PATTERNS, CROSS_DEFAULT, CROSS_RANGE, DEFAULT_FAIRWAY_PATTERN, MOW_PATTERNS, PATTERN_LOOKS, clampMow, mowCustom, mowRecOf, patternOf } from '../src/game/mow-lines';
import { BAND_DARK, BAND_LIGHT, DEFAULT_COURSE_FINISH, FINISH_OFF, clampCourseFinish, crewBandLook, finishMow, finishOf, finishStripeLook, greenStripeLook, mowShown, mowSpec } from '../src/game/course-finish';
import { HALF_SOFT, HALF_WIDTH, RING_PASSES, bandAt, crosscutLegs, fairwayStripeLook, holeStripeLegs, ringPass, turnStripeLegs } from '../src/game/course-stripes';
import { clampSurfaces, mowPatternSurfaces, oldMowSurfaces, oldTeeSurfaces } from '../src/game/painted-surfaces';
import { COURSE_PATCH_REACH } from '../src/game/ext/course-grid/patch';

const FIN = DEFAULT_COURSE_FINISH, BASE = fairwayStripeLook(), F = clampSurfaces(file);
const ALONG = { ...FIN, pattern: 'along' as const };
const P = (id: string) => MOW_PATTERNS.findIndex(q => q.id === id);
const deg = (x: number, y: number) => (Math.atan2(y, x) * 180) / Math.PI;
/** the angle between two undirected lines, degrees 0..90 */
const between = (a: { x: number; y: number }, b: { x: number; y: number }) => (Math.acos(Math.min(1, Math.abs(a.x * b.x + a.y * b.y))) * 180) / Math.PI;

test('the patterns: the owner\'s four in the list, named, each a pattern a look can name and the worker can carry by index', () => {
  const ids = MOW_PATTERNS.map(p => p.id);
  assert.deepEqual(ids, ['along', 'wide', 'crosscut', 'halves', 'collar', 'straight', 'check', 'diamond']);
  assert.deepEqual(MOW_PATTERNS.filter(p => ['wide', 'crosscut', 'halves', 'collar'].includes(p.id)).map(p => p.name), ['Wide stripes', 'Crosscut', 'Two-tone halves', 'Collar ring']);
  for (const p of MOW_PATTERNS) { assert.ok(p.note.length > 20, p.id); assert.deepEqual(clampMow({ pattern: p.id }), { pattern: p.id }); assert.equal(patternOf(mowRecOf({ pattern: p.id })), p.id, `${p.id} by its index`); }
  assert.equal(clampMow({ pattern: 'zigzag' }), undefined);
  // every pattern a look names is carried (the bands along the hole too: the fairway's default is not that one now), none named: none carried
  assert.deepEqual(mowRecOf({ pattern: 'along' }), { p: 0 }); assert.deepEqual(mowRecOf({ width: 2 }), { w: 2 });
  assert.equal(patternOf({ w: 2 }), undefined, 'none named: the kind\'s own'); assert.equal(patternOf({ p: 99 }), undefined);
  // naming the bands along the hole changes no number, so the Studio's finish off keeps T218's untextured bands for them; the others are custom looks
  assert.equal(mowCustom({ p: 0 }), false); for (const id of ['wide', 'crosscut', 'halves', 'collar', 'straight', 'check', 'diamond']) assert.equal(mowCustom({ p: P(id) }), true, id);
});

test('the default: the strongest look is the fairway\'s, wide stripes; the old look is one pattern away and the other surfaces are as they were', () => {
  assert.equal(DEFAULT_FAIRWAY_PATTERN, 'wide'); assert.equal(FIN.pattern, 'wide'); assert.equal(finishOf(F).pattern, 'wide');
  const wide = mowSpec('fairway', undefined, FIN, BASE)!;
  assert.equal(wide.pattern, 'wide'); assert.equal(wide.textured, true); assert.equal(wide.angle, 0);
  // bold: 5 tiles (10 m), inside the owner's 8 to 12 m, at the full lift and multiply (the finish's strength is 0.8), a crisper edge, never a tint
  assert.equal(wide.look.w, 5); assert.ok(wide.look.w * 2 >= 8 && wide.look.w * 2 <= 12);
  assert.equal(wide.look.l, BAND_LIGHT); assert.equal(wide.look.k, BAND_DARK); assert.ok(wide.look.f < finishStripeLook(FIN, BASE)!.f); assert.equal(wide.look.t, 0, 'the texture lighter or darker, no flat tint');
  assert.ok(wide.look.l > finishStripeLook(FIN, BASE)!.l && wide.look.k > finishStripeLook(FIN, BASE)!.k, 'stronger than the finish\'s own bands');
  // the old look, exactly: the finish's pattern 'along', a look naming 'along', the dev flag's file
  const fl = finishStripeLook(FIN, BASE)!;
  for (const spec of [mowSpec('fairway', undefined, ALONG, BASE)!, mowSpec('fairway', { p: 0 }, FIN, BASE)!, mowSpec('fairway', undefined, finishOf(oldMowSurfaces(F)), BASE)!]) {
    assert.deepEqual(spec.look, fl); assert.equal(spec.pattern, 'along'); assert.equal(spec.angle, 0); assert.equal(spec.textured, true);
  }
  // a look's own pattern beats the finish's; a look's own numbers beat the pattern's
  assert.equal(mowSpec('fairway', { p: P('halves') }, FIN, BASE)!.pattern, 'halves');
  const own = mowSpec('fairway', { w: 4, l: 0.5 }, FIN, BASE)!; assert.equal(own.pattern, 'wide'); assert.equal(own.look.w, 4); assert.equal(own.look.l, BAND_LIGHT * 0.5); assert.equal(own.look.k, BAND_DARK);
  // the finish off (T218's look): the fairway keeps its untextured bands whatever the finish's pattern says; a pattern a look names is laid by the finish
  const off = mowSpec('fairway', undefined, FINISH_OFF, BASE)!; assert.deepEqual(off.look, BASE); assert.equal(off.textured, false); assert.equal(off.pattern, 'along');
  const named = mowSpec('fairway', { p: P('wide') }, FINISH_OFF, BASE)!; assert.equal(named.textured, true); assert.equal(named.pattern, 'wide');
  // the green keeps its fine stripes (the patterns' numbers are the fairway's), the tee and the rough are plain and lay along the hole where turned on
  assert.deepEqual(mowSpec('green', undefined, FIN, BASE)!.look, greenStripeLook(FIN, BASE)); assert.equal(mowSpec('green', undefined, FIN, BASE)!.pattern, 'along');
  assert.equal(mowSpec('tee', undefined, FIN, BASE), null); assert.equal(mowSpec('rough', undefined, FIN, BASE), null);
  assert.deepEqual(mowSpec('tee', { on: 1 }, FIN, BASE)!.look, fl); assert.equal(mowSpec('tee', { on: 1 }, FIN, BASE)!.pattern, 'along');
  assert.equal(mowSpec('green', { p: P('wide') }, FIN, BASE)!.look.w, greenStripeLook(FIN, BASE)!.w, 'a green with wide stripes keeps its own stripe width until the player sets one');
  // the range outfield's bands are the finish's own, as before (finishMow does not read the pattern)
  const m = { ux: 1, uy: 0, ox: 0, oy: 0, w: 3, l: 0, k: 0, lc: '#fff', dc: '#000', t: 0, f: 0.1, lx: 1, ly: 0 };
  assert.equal(finishMow(m, FIN, BASE)!.w, FIN.bandWidth); assert.deepEqual(finishMow(m, FIN, BASE), finishMow(m, ALONG, BASE));
});

test('the finish\'s pattern is a setting: clamped, kept in the file, off with the dev flag\'s old look, and the tees\' old look is a different flag', () => {
  assert.equal(clampCourseFinish({ pattern: 'crosscut' }).pattern, 'crosscut'); assert.equal(clampCourseFinish({ pattern: 'along' }).pattern, 'along');
  for (const bad of ['zigzag', 3, null, undefined, {}]) assert.equal(clampCourseFinish({ pattern: bad }).pattern, 'wide', `${String(bad)}: the default`);
  assert.equal(FINISH_OFF.pattern, 'wide', 'the finish being off does not change the knob (the fairway ignores it then)');
  const old = oldMowSurfaces(F);
  assert.equal(finishOf(old).pattern, 'along'); assert.deepEqual({ ...finishOf(old), pattern: 'wide' }, finishOf(F), 'only the pattern changes'); assert.deepEqual(old.surfaces, F.surfaces);
  assert.deepEqual(clampSurfaces(JSON.parse(JSON.stringify(old))), old, 'saved and loaded again, the same file');
  // any pattern can be the fairway's default (the dev server's ?mow=<pattern>: the bench's A/B of each pattern's cost)
  for (const q of MOW_PATTERNS) assert.equal(finishOf(mowPatternSurfaces(F, q.id)).pattern, q.id);
  assert.deepEqual(oldMowSurfaces(F), mowPatternSurfaces(F, 'along'));
  // the two old looks stack (?tee=old&mow=along)
  const both = oldMowSurfaces(oldTeeSurfaces(F)); assert.equal(finishOf(both).pattern, 'along'); assert.equal(finishOf(both).teeWall, 'rock'); assert.equal(both.surfaces.tee!.family, F.surfaces.fairway!.family);
});

test('wide stripes: 8 to 12 m bands along the hole, light and dark alternating, a band across the line of play, the width a slider\'s', () => {
  const look = mowSpec('fairway', undefined, FIN, BASE)!.look, line = [0, 0, 100, 0];
  const legs = holeStripeLegs(line, look); assert.equal(legs.length, 1);
  const m = legs[0]!.m; assert.equal(m.w, 5); assert.ok(Math.abs(m.ux) < 1e-9 && Math.abs(m.uy - 1) < 1e-9, 'the bands alternate sideways, along the hole\'s line');
  // the line of play runs down the middle of a band (a light one), the neighbours alternate
  assert.equal(bandAt(legs, 50, 0).light, true); assert.equal(bandAt(legs, 50, 4).light, false, 'a band 10 m wide: 8 m off the line is the next band (4 tiles from a centre at 2.5 is the dark one)');
  assert.equal(bandAt(legs, 50, -4).light, false); assert.equal(bandAt(legs, 50, 9).light, true);
  assert.equal(mowSpec('fairway', { p: P('wide'), w: 6 }, FIN, BASE)!.look.w, 6, 'the width is the player\'s to set');
  assert.equal(mowShown('fairway', undefined, FIN).width, 5); assert.equal(mowShown('fairway', undefined, FIN).light, 1); assert.equal(mowShown('fairway', undefined, FIN).dark, 1);
});

test('two-tone halves: one band as wide as the fairway\'s reach, its edge on the line of play, left light and right dark, with a crisp edge, round a dogleg too', () => {
  const sp = mowSpec('fairway', { p: P('halves') }, FIN, BASE)!, look = sp.look;
  assert.equal(sp.pattern, 'halves'); assert.equal(look.half, true); assert.equal(look.w, HALF_WIDTH); assert.equal(look.across, false);
  assert.ok(look.l === BAND_LIGHT && look.k === BAND_DARK, 'light against dark at the full strength');
  // the soft edge is HALF_SOFT tiles across whatever the band's width (mowBands: the edge is f / 2 of the band)
  assert.ok(Math.abs((look.f / 2) * look.w - HALF_SOFT) < 0.01, `${(look.f / 2) * look.w}`); assert.ok(HALF_SOFT <= 0.5, 'a crisp mowing line');
  const line = [0, 0, 100, 0], legs = holeStripeLegs(line, look);
  assert.deepEqual([legs[0]!.m.ox, legs[0]!.m.oy], [0, 0], 'the band starts on the line itself');
  // the line's left (the leg's (-dy, dx): +y for a hole running east) is one tone all along it, the right the other
  for (const x of [10, 50, 90, 200]) { assert.equal(bandAt(legs, x, 6).light, true, `left at ${x}`); assert.equal(bandAt(legs, x, -6).light, false, `right at ${x}`); }
  assert.equal(bandAt(legs, 50, 150).light, true, 'a fairway\'s whole width is one band'); assert.equal(bandAt(legs, 50, -150).light, false);
  // a dogleg: east to (100, 0), then south to (100, 80): the left of the line is the same light half on both legs, the right the dark
  const bent = holeStripeLegs([0, 0, 100, 0, 100, 80], look); assert.equal(bent.length, 2);
  assert.equal(bandAt(bent, 50, 5).light, true); assert.equal(bandAt(bent, 95, 40).light, true, 'left of the second leg (west of a line running south)');
  assert.equal(bandAt(bent, 50, -5).light, false); assert.equal(bandAt(bent, 105, 40).light, false);
  // the half's edge passes through the bend's point from both legs, so the halves meet there
  assert.deepEqual([bent[1]!.m.ox, bent[1]!.m.oy], [100, 0]);
  // no width slider in the panel's sense: the pattern's own width is not a number to set; the other patterns have no `half`
  for (const id of ['along', 'wide', 'crosscut', 'collar', 'straight', 'check', 'diamond']) assert.equal(mowSpec('fairway', { p: P(id) }, FIN, BASE)!.look.half, undefined, id);
});

test('a crosscut: two sets of stripes crossed at 90 degrees or 45, symmetric about the line of play, each at half the strength; the angle is the crossing', () => {
  assert.deepEqual([...CROSS_RANGE], [15, 90]); assert.equal(CROSS_DEFAULT, 90); assert.equal(PATTERN_LOOKS.crosscut!.angle, CROSS_DEFAULT);
  const sp = mowSpec('fairway', { p: P('crosscut') }, FIN, BASE)!;
  assert.equal(sp.angle, 90, 'square diamonds by default'); assert.equal(mowSpec('fairway', { p: P('crosscut'), a: 45 }, FIN, BASE)!.angle, 45); assert.equal(sp.look.check, undefined, 'not the XOR of a checkerboard');
  assert.equal(mowShown('fairway', { pattern: 'crosscut' }, FIN).angle, 90);
  assert.equal(sp.look.l, BAND_LIGHT); assert.equal(sp.look.k, BAND_DARK);
  const across = holeStripeLegs([0, 0, 100, 0], { ...sp.look, across: true });
  for (const cross of [90, 45, 60]) {
    const [a, b] = crosscutLegs(across, cross), ua = { x: a[0]!.m.ux, y: a[0]!.m.uy }, ub = { x: b[0]!.m.ux, y: b[0]!.m.uy };
    // the two sets' stripes (each lies at right angles to its bands' axis) cross at `cross` degrees
    assert.ok(Math.abs(between(ua, ub) - cross) < 1e-9 || Math.abs(between(ua, ub) - (180 - cross)) < 1e-9, `${cross}: ${between(ua, ub)}`);
    // and are symmetric about the line of play (east): the stripes' directions are cross / 2 either side of it
    const sa = { x: -ua.y, y: ua.x }, sb = { x: -ub.y, y: ub.x };
    assert.ok(Math.abs(between(sa, { x: 1, y: 0 }) - cross / 2) < 1e-9, `set A: ${between(sa, { x: 1, y: 0 })}`); assert.ok(Math.abs(between(sb, { x: 1, y: 0 }) - cross / 2) < 1e-9, `set B: ${between(sb, { x: 1, y: 0 })}`);
    assert.ok(Math.abs(Math.sign(sa.x * sa.y) + Math.sign(sb.x * sb.y)) < 1e-9 || cross === 180, 'one set leans each way');
    assert.equal(a[0]!.m.w, b[0]!.m.w); assert.deepEqual([a[0]!.m.ox, a[0]!.m.oy], [b[0]!.m.ox, b[0]!.m.oy], 'the sets share the leg\'s origin');
  }
  // a dogleg: both sets keep their legs' cuts (the bends' bisectors), so the legs meet as the other patterns' do
  const bend = holeStripeLegs([0, 0, 100, 0, 100, 80], { ...sp.look, across: true }), [a, b] = crosscutLegs(bend, 90);
  assert.equal(a.length, 2); assert.equal(b.length, 2); assert.deepEqual(a[1]!.cut, bend[1]!.cut); assert.deepEqual(b[1]!.cut, bend[1]!.cut);
  assert.deepEqual(turnStripeLegs(bend, 135)[0]!.m.ux, a[0]!.m.ux, 'a set is the legs turned a quarter and half the crossing');
  assert.notEqual(crosscutLegs(across, NaN)[0][0]!.m.ux, undefined, 'a bad angle is the default');
});

test('a collar ring: two passes round the fairway\'s edge inside the wide stripes, within the reach of the chunks the bake has', () => {
  const sp = mowSpec('fairway', { p: P('collar') }, FIN, BASE)!;
  assert.equal(sp.pattern, 'collar'); assert.equal(sp.look.w, 5); assert.equal(sp.look.l, BAND_LIGHT); assert.equal(sp.look.k, BAND_DARK);
  assert.equal(RING_PASSES, 2);
  // a pass is a third of the band (1.67 tiles at the default: 3.3 m), between 1 and 2 tiles: the ring never reaches past the edges the bake has
  assert.ok(Math.abs(ringPass(5) - 5 / 3) < 1e-9); assert.equal(ringPass(0.5), 1); assert.equal(ringPass(16), 2); assert.equal(ringPass(NaN), ringPass(5));
  for (const w of [0.5, 1, 3, 5, 8, 16]) assert.ok(RING_PASSES * ringPass(w) <= COURSE_PATCH_REACH, `${w}: ${RING_PASSES * ringPass(w)} tiles in`);
  // the interior is the wide stripes: the same legs as the along pattern's
  const legs = holeStripeLegs([0, 0, 100, 0], sp.look); assert.equal(legs[0]!.m.w, 5); assert.equal(bandAt(legs, 50, 0).light, true);
});

test("the grounds crew mows the bands the ground draws: the default wide stripes, a hole's own width, a collar ring's inside; the other patterns keep the finish's", () => {
  assert.deepEqual([...BAND_PATTERNS], ['along', 'wide', 'collar']);
  const fl = finishStripeLook(FIN, BASE)!;
  // a hole with no mowing look of its own: the fairway's default pattern, wide stripes, 5 tiles a pass (it was the finish's 3 before T365)
  assert.equal(crewBandLook(mowSpec('fairway', undefined, FIN, BASE), fl).w, 5);
  assert.equal(crewBandLook(mowSpec('fairway', undefined, FIN, BASE), fl).across, false, 'along the line of play');
  assert.deepEqual(crewBandLook(mowSpec('fairway', undefined, ALONG, BASE), fl), fl, "the old look: the finish's own bands");
  assert.equal(crewBandLook(mowSpec('fairway', { p: P('collar') }, FIN, BASE), fl).w, 5);
  assert.equal(crewBandLook(mowSpec('fairway', { w: 4 }, FIN, BASE), fl).w, 4, "a hole's own band width is its passes");
  // the patterns that are not mown pass by pass, the lines off and the finish off: the finish's look
  for (const id of ['halves', 'crosscut', 'straight', 'check', 'diamond']) assert.equal(crewBandLook(mowSpec('fairway', { p: P(id) }, FIN, BASE), fl), fl, id);
  assert.equal(crewBandLook(mowSpec('fairway', { on: 0 }, FIN, BASE), fl), fl); assert.equal(crewBandLook(null, fl), fl);
  const off = mowSpec('fairway', undefined, FINISH_OFF, BASE)!; assert.deepEqual(crewBandLook(off, BASE), BASE, "the finish off: T218's bands, as before");
});
