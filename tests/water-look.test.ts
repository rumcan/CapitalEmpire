// Headless tests for T230 (#669): the concept's water (src/game/water-look.ts: the depth toward the middle, the light edge, the shore's
// reflections, the glint on every pond and river; the drawing is renderer.ts waterOver and gl.ts FS_QUAD's glossLight, the look is checked in
// the browser by scripts/dev/water-shots.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { clampSurfaces, lookOfTex } from '../src/game/painted-surfaces';
import file from '../src/game/painted-surfaces.json';
import tiles from '../src/game/painted-tiles.json';
import { CASTER_STRIDE, CK } from '../src/game/living-ground';
import { GLOSS, glossPixel, swampKey } from '../src/game/swamp';
import { BED, DEFAULT_WATER_LOOK, EDGE, GLINT, REFLECT, REFLECT_TINTS, SITE, WATER_OFF, WaterField, clampWaterLook, depthAt, edgeAt, fieldPad, glintAt, glintImage, hexRgb, riverLook, waterImages, waterLookOf, waterPixel } from '../src/game/water-look';

const lum = (c: readonly number[]) => 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!;
/** the pond's picture's mean (pond-concept-run) */
const POND = [30, 67, 66];
/** a square pond of side s tiles from (x0, y0) as one ring */
const square = (x0: number, y0: number, s: number) => [x0, y0, x0 + s, y0, x0 + s, y0 + s, x0, y0 + s];
/** a field over tile box b with a square pond in it, its shore distances made */
const pondField = (b: number[], pond: number[], res = 4, look = DEFAULT_WATER_LOOK) => { const f = WaterField.over(b, fieldPad(look), res); f.rings([pond], SITE.course); f.shore(Math.max(look.reach, 3)); return f; };
/** a field sample's index at tile point (x, y) */
const at = (f: WaterField, x: number, y: number) => Math.floor((y - f.y0) * f.res) * f.W + Math.floor((x - f.x0) * f.res);
/** a canvas-like 'screen' then 'multiply' of the bake's images at sample k over pixel c (the canvas's own blend formulas) */
const composite = (c: readonly number[], im: ReturnType<typeof waterImages>, k: number) => {
  let o = [...c];
  if (im.edge) { const a = im.edge[4 * k + 3]! / 255; o = o.map((v, i) => { const s = 255 - ((255 - v) * (255 - im.edge![4 * k + i]!)) / 255; return v + (s - v) * a; }); }
  if (im.shade) { const a = im.shade[4 * k + 3]! / 255; o = o.map((v, i) => v * (1 - a + a * (im.shade![4 * k + i]! / 255))); }
  if (im.tint) { const a = im.tint[4 * k + 3]! / 255; o = o.map((v, i) => { const s = 255 - ((255 - v) * (255 - im.tint![4 * k + i]!)) / 255; return v + (s - v) * a; }); }
  return o;
};

test('T230 the switch: the file\'s water block, clamped; absent the tuned look; ponds and rivers wear the concept\'s deep water, lake kept for the studio', () => {
  assert.deepEqual(waterLookOf(null), DEFAULT_WATER_LOOK);
  assert.deepEqual(waterLookOf(clampSurfaces(file)), clampWaterLook((file as { water?: unknown }).water));
  assert.deepEqual(clampWaterLook({ on: false }), WATER_OFF);
  assert.deepEqual(clampWaterLook({ depth: 9, reach: -1, edge: 'x', reflect: NaN }), { ...DEFAULT_WATER_LOOK, depth: 2, reach: 2 });
  const f = clampSurfaces({ ...file, water: { on: false, depth: 0.5 } });
  assert.equal(f.water?.on, false); assert.equal(f.water?.depth, 0.5);
  assert.equal(clampSurfaces({ ...file, water: undefined }).water, undefined, 'no block, none: the tuned look');
  const s = clampSurfaces(file);
  assert.equal(lookOfTex('waterDark', s)?.family, 'pond-concept-run'); assert.equal(lookOfTex('water', s)?.family, 'lake', 'the rivers keep the brighter lake (the lead, 2026-10-28)');
  const fams = (tiles as { families: { id: string; kind: string; mean: string }[] }).families;
  assert.equal(fams.find(v => v.id === 'pond-concept-run')?.kind, 'water'); assert.ok(fams.find(v => v.id === 'lake'), 'lake stays a choice');
  assert.deepEqual(hexRgb(fams.find(v => v.id === 'pond-concept-run')!.mean), POND);
});

test('T230 the shore distance: an exact distance in from the shore, capped, and the same in every chunk that samples a point', () => {
  const pond = square(100, 100, 30), f = pondField([90, 90, 140, 140], pond);
  // a point 5 tiles in from the west shore (and 15 from the rest): 5 tiles, within half a sample
  assert.ok(Math.abs(f.d[at(f, 105.1, 115.1)]! - 5.1) < 0.2, String(f.d[at(f, 105.1, 115.1)]));
  assert.ok(Math.abs(f.d[at(f, 101.1, 120.1)]! - 1.1) < 0.2);
  assert.equal(f.d[at(f, 115.1, 115.1)], Math.max(DEFAULT_WATER_LOOK.reach, 3), 'capped in the middle');
  assert.equal(f.d[at(f, 95.1, 115.1)], 0, 'land is 0');
  // two neighbouring chunks' fields (their boxes meet at x 120) read, over their own boxes, exactly what one field over the whole pond reads:
  // so the depth runs on across the seam
  const a = pondField([88, 96, 120, 128], pond), b = pondField([120, 96, 152, 128], pond), all = pondField([60, 60, 180, 180], pond);
  for (const y of [100.6, 103.1, 111.4, 125.9]) {
    for (const x of [100.4, 110.1, 116.1, 119.9]) assert.equal(a.d[at(a, x, y)], all.d[at(all, x, y)], `${x},${y}`);
    for (const x of [120.1, 124.4, 129.6, 140]) assert.equal(b.d[at(b, x, y)], all.d[at(all, x, y)], `${x},${y}`);
  }
  // the shallows' width varies along the shore (no even band), and is the world's (both chunks read what the whole field reads)
  const sa = a.shallows(), sall = all.shallows(), along: number[] = [];
  for (let y = 100.6; y < 128; y += 1.5) { along.push(sall[at(all, 101.1, y)]!); assert.ok(Math.abs(sa[at(a, 101.1, y)]! - sall[at(all, 101.1, y)]!) < 1e-6); }
  assert.ok(Math.max(...along) - Math.min(...along) > 0.15, along.join(' ')); assert.ok(along.every(v => v >= EDGE.vary[0] - 1e-6 && v <= EDGE.vary[1] + 1e-6));
  // a waterway: a straight river 20 wide; its middle 10 in (capped), its edge near 0
  const r = WaterField.over([0, 0, 60, 60], 8, 2); r.waterway([{ x: 0, y: 30, w: 20 }, { x: 60, y: 30, w: 20 }], SITE.river); r.shore(12);
  assert.ok(Math.abs(r.d[at(r, 30.1, 30.1)]! - 10) < 0.4); assert.ok(r.d[at(r, 30.1, 20.3)]! < 0.5); assert.equal(r.d[at(r, 30.1, 18)], 0);
});

test('T230 rivers on the lake: the middle a deeper teal (its hue kept, never pushed blue), the edge a bright turquoise, their own depth knob', () => {
  const LAKE = hexRgb((tiles as { families: { id: string; mean: string }[] }).families.find(v => v.id === 'lake')!.mean), l = riverLook(DEFAULT_WATER_LOOK);
  assert.equal(l.depth, DEFAULT_WATER_LOOK.riverDepth); assert.ok(DEFAULT_WATER_LOOK.riverDepth < DEFAULT_WATER_LOOK.depth, 'a little less deep than the ponds');
  const mid = waterPixel(LAKE, 7, 0, l), edge = waterPixel(LAKE, 0.8, 0, l), gb = (c: readonly number[]) => c[1]! / c[2]!;
  assert.ok(lum(mid) < lum(LAKE) * 0.95, 'deeper in the middle'); assert.ok(Math.abs(gb(mid) - gb(LAKE)) < 0.05, `teal kept: ${mid} vs ${LAKE}`);
  assert.ok(lum(edge) > lum(LAKE) + 10 && edge[1]! - LAKE[1]! > edge[2]! - LAKE[2]!, `a bright turquoise edge: ${edge}`);
  // the ponds' palette would push the lake royal blue: the rivers' does not
  assert.ok(gb(waterPixel(LAKE, 7, 0, { ...DEFAULT_WATER_LOOK, depth: l.depth })) < gb(mid) - 0.05);
  // the knob rides in the file, clamped; off: the river as before
  assert.equal(clampWaterLook({ riverDepth: 5 }).riverDepth, 2); assert.deepEqual(waterPixel(LAKE, 7, 0, riverLook(WATER_OFF)), LAKE);
  const r = readFileSync(resolve('src/game/renderer.ts'), 'utf8'); assert.match(r, /look = site === SITE\.river \? riverLook\(w\.look\) : w\.look/);
});

test('T230 depth: darker and more teal toward the middle, a curve over the texture (its ripples keep their contrast), lighter at the edge', () => {
  const l = DEFAULT_WATER_LOOK, ripple = [POND[0]! + 8, POND[1]! + 8, POND[2]! + 8];
  // darker toward the middle, from the end of the light edge on (and never lighter than the texture past it)
  let prev = Infinity;
  for (const d of [1.5, 2, 3, 4, 5, 6, 7, 8]) { const v = lum(waterPixel(POND, d, 0, l)); assert.ok(v <= prev + 1e-9, `d ${d}`); prev = v; }
  const mid = waterPixel(POND, l.reach, 0, l), edge = waterPixel(POND, 0.6, 0, l);
  assert.ok(lum(mid) < lum(POND) * 0.93, 'the middle reads deep'); assert.ok(lum(edge) > lum(POND) + 6, 'the edge reads lighter');
  // more teal: the red goes most, the blue least
  assert.ok(mid[0]! / POND[0]! < mid[1]! / POND[1]! && mid[1]! / POND[1]! < mid[2]! / POND[2]!);
  assert.ok(mid[2]! > mid[1]! + 8 && POND[2]! <= POND[1]!, 'the teal-green picture reads teal-blue in the middle, as the concept\'s');
  // a curve, not a wash: a ripple keeps most of its lift over the water around it at every depth (a flat wash toward a colour would flatten it)
  for (const d of [0.6, 2, 7]) { const a = waterPixel(ripple, d, 0, l), b = waterPixel(POND, d, 0, l); assert.ok(lum(a) - lum(b) > 8 * 0.62, `d ${d}: ${lum(a) - lum(b)}`); }
  // the depth curve: 0 on the shore, rising smoothly, 1 from the reach on; the edge: nothing on the shore line, gone by its fade
  assert.equal(depthAt(0, 7), 0); assert.equal(depthAt(7, 7), 1); assert.equal(depthAt(20, 7), 1);
  for (let d = 0; d < 7; d += 0.25) assert.ok(depthAt(d + 0.25, 7) >= depthAt(d, 7));
  assert.equal(edgeAt(0, 1), 0); assert.equal(edgeAt(EDGE.fade[1], 1), 0); assert.ok(edgeAt(0.8, 1) > 0.5 * EDGE.a);
  // the bake's images composite to waterPixel (the canvas's screen then multiply), within the images' 8 bits
  const f = pondField([90, 90, 140, 140], square(100, 100, 30)), im = waterImages(f, SITE.course, l);
  assert.ok(im.edge && im.shade);
  const sh = f.shallows();
  for (const [x, y] of [[100.6, 115], [101.2, 115], [103, 115], [106, 115], [115, 115], [110, 100.7], [129.3, 120]] as const) {
    const k = at(f, x, y), want = waterPixel(POND, f.d[k]!, 0, l, sh[k]!), got = composite(POND, im, k);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(got[i]! - want[i]!) < 1.5, `${x},${y}: ${got} vs ${want}`);
  }
  // nothing off the water, and nothing for another site
  const land = at(f, 95, 115); assert.equal(im.shade![4 * land + 3], 0); assert.equal(im.edge![4 * land + 3], 0);
  const none = waterImages(f, SITE.river, l); assert.equal(none.edge, null); assert.equal(none.shade, null);
});

test('T230 off is the identity: no images, no glint colour change, the pixel itself; each knob at 0 leaves its part out', () => {
  const f = pondField([90, 90, 140, 140], square(100, 100, 30));
  assert.deepEqual(waterImages(f, 0xff, WATER_OFF), { edge: null, shade: null, tint: null });
  for (const d of [0, 0.5, 2, 9]) assert.deepEqual(waterPixel(POND, d, 0.7, WATER_OFF), POND);
  const noEdge = waterImages(f, 0xff, { ...DEFAULT_WATER_LOOK, edge: 0 }); assert.equal(noEdge.edge, null); assert.ok(noEdge.shade);
  assert.deepEqual(waterImages(f, 0xff, { ...DEFAULT_WATER_LOOK, depth: 0, reflect: 0, edge: 0 }), { edge: null, shade: null, tint: null });
  // the renderer: no field, nothing drawn, while the look and the glint are both off
  const r = readFileSync(resolve('src/game/renderer.ts'), 'utf8');
  // (T248: and the water's motion off, which makes no field either)
  assert.match(r, /if \(!c \|\| \(!waterLookActive\(look\) && !this\.specCam && !motion\)\) return \(this\.waterNow = null\);/);
  assert.match(r, /if \(!this\.specCam\) return;/);
});

test('T230 the glint: on the water only, inset from the shore, its colour the shaded water\'s mean, dimmed under reflections; lit by T199\'s glossLight', () => {
  const l = DEFAULT_WATER_LOOK, f = pondField([90, 90, 140, 140], square(100, 100, 30)), g = glintImage(f, SITE.course, l, POND)!;
  assert.ok(g);
  const a = (x: number, y: number) => g[4 * at(f, x, y) + 3]!;
  assert.equal(a(95, 115), 0, 'none on land'); assert.equal(a(100.2, 115), 0, 'none at the shore line');
  assert.ok(a(100.6, 115) < a(102.5, 115) && a(102.5, 115) <= a(115, 115), 'rising in from the shore');
  assert.equal(a(115, 115), Math.round(GLINT.a * 255));
  assert.equal(glintAt(GLINT.inset[0], 0), 0); assert.ok(glintAt(5, 1) < glintAt(5, 0) * 0.2, 'a reflection hides the sky');
  // its colour: the water's mean as the bake shades it there
  for (const [x, y] of [[115, 115], [101.5, 115], [110, 101.2]] as const) {
    const k = at(f, x, y), m = waterPixel(POND, f.d[k]!, 0, l, f.shallows()[k]!);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(g[4 * k + i]! - m[i]!) <= 1, `${x},${y}: ${g[4 * k + i]} vs ${m[i]}`); // (made at a 32nd of a tile's steps)
  }
  // the shaded pond is still water to the GPU's key (swamp.ts swampKey), at its edge, its middle and at a reflection's soft rim: the glint
  // lights it (in a reflection's core the glint is dimmed anyway: glintAt)
  for (const d of [0.6, 2, 7]) for (const r of [0, 0.3]) { const c = waterPixel(POND, d, r, l); assert.ok(swampKey(c[0]!, c[1]!, c[2]!) > 0.5, `${d} ${r}: ${c}`); }
  // and glossPixel (gl.ts glossLight's twin) lifts a lit ripple toward the sky more than a dark hollow: textured, not a flat shine
  const mid = waterPixel(POND, 7, 0, l), up = mid.map(v => v + 10), down = mid.map(v => v - 10);
  const lift = (c: number[]) => lum(glossPixel(c, mid, GLINT.a, 1)) - lum(c);
  assert.ok(lift(up) > 2 * lift(down) && lift(down) > 0);
  assert.ok(GLOSS.night > 0, 'it fades after dusk with the swamp\'s');
  // nothing for another site
  assert.equal(glintImage(f, SITE.river, l, POND), null);
});

test('T230 reflections: a shore tree reflects straight down the screen onto the water, never up it, fading by REFLECT.reach', () => {
  // a pond whose north-west shore is the line x + y = 200 (a big square turned 45 degrees would do; a square from (100, 100) has its
  // top-left corner there); a tree on the shore at (99, 99), just off the water's corner up the screen
  const pond = square(100, 100, 30), f = pondField([90, 90, 140, 140], pond);
  const tree = Float32Array.from([CK.TREE, 99, 99, 2, 1, 1, 0.5]); assert.equal(tree.length, CASTER_STRIDE);
  f.reflect(tree);
  assert.ok(f.refl, 'a reflection');
  const r = (x: number, y: number) => f.refl![at(f, x, y)]!;
  // down the screen from the foot (x and y growing alike): its crown's mirror image; up the screen and on land: nothing
  assert.ok(r(102, 102) > 0.3, String(r(102, 102))); assert.ok(r(101, 101) > 0);
  assert.equal(r(95, 95), 0); assert.equal(r(98.5, 98.5), 0);
  // across the screen (x up, y down: the same screen height) it narrows to nothing past the crown's width
  assert.ok(r(104.5, 100.5) < r(102.5, 102.5));
  // faded out past REFLECT.reach tiles below the foot
  assert.equal(r(99 + REFLECT.reach + 0.3, 99 + REFLECT.reach + 0.3), 0);
  // a building's walls reflect too; a fence does not
  const g = pondField([90, 90, 140, 140], pond); g.reflect(Float32Array.from([CK.BUILDING, 95, 95, 99.5, 99.5, NaN, NaN, CK.FENCE, 100, 100, 110, 100, 0.05, 0]));
  assert.ok(g.refl && g.refl[at(g, 101, 101)]! > 0.5); assert.equal(g.refl![at(g, 105, 101)], 0);
  // the reflection darkens the shade (the bake's multiply) and dims the glint
  const l = DEFAULT_WATER_LOOK, k = at(f, 102, 102), im = waterImages(f, SITE.course, l), plain = pondField([90, 90, 140, 140], pond), im0 = waterImages(plain, SITE.course, l);
  assert.ok(lum(composite(POND, im, k)) < lum(composite(POND, im0, k)) - 3);
  // the bake's three layers are waterPixel with the reflection's tint (a red maple mirrors redder than a conifer)
  const want = waterPixel(POND, f.d[k]!, f.refl![k]!, l, f.shallows()[k]!, REFLECT_TINTS[f.reflTint![k]!]), got = composite(POND, im, k);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(got[i]! - want[i]!) < 1.5, `${got} vs ${want}`);
  assert.equal(f.reflTint![k], 1, 'the maple (mood 0 + 1)');
  const maple = waterPixel(POND, 7, 1, l, 1, REFLECT_TINTS[1]), pine = waterPixel(POND, 7, 1, l, 1, REFLECT_TINTS[5]);
  assert.ok(maple[0]! - maple[2]! > pine[0]! - pine[2]! + 4);
  assert.ok(glintImage(f, SITE.course, l, POND)![4 * k + 3]! < glintImage(plain, SITE.course, l, POND)![4 * k + 3]!);
  // and the reflect knob at 0 draws none (nor dims the glint)
  const noRefl = { ...l, reflect: 0 }; assert.deepEqual(composite(POND, waterImages(f, SITE.course, noRefl), k), composite(POND, waterImages(plain, SITE.course, noRefl), k));
  assert.equal(BED.length, 3);
});

test('T230 the renderer: the river, the course\'s water and painted water draw the look right after their water; the swamp and the creeks keep T199\'s', () => {
  const r = readFileSync(resolve('src/game/renderer.ts'), 'utf8'), step1 = r.slice(r.indexOf('// ---- 1. terrain:'), r.indexOf('const walk = net.walkF'));
  const riverWater = step1.indexOf("if (rivers.length) layer('water', g => shore(g, rivers, 0, 0.3), water);"), riverLook = step1.indexOf('this.waterOver(ctx, SITE.river');
  assert.ok(riverWater > 0 && riverLook > riverWater, 'the river\'s look right after its water');
  assert.ok(!/waterOver\([^)]*creek/.test(r) && !/SITE\.creek/.test(r), 'no creek site: the streams (and the swamp\'s own) keep their look');
  assert.ok(step1.indexOf('this.swampField.alpha(') < riverLook, 'the swamp band is laid before, untouched');
  assert.match(r, /if \(s === SURF\.water\) this\.waterOver\(ctx, SITE\.course, \(\) => ringsOfCode\(code\), ls\[0\]!\.l\.tex, lite\);/);
  assert.match(r, /if \(waterTex\(p\.tex\)\) this\.waterOver\(g, SITE\.paint, \(\) => polyPath\(p\.pts\), p\.tex, lite\);/);
  // the glint shares the swamp's gloss mask (the same switch, falloff and knobs on the GPU)
  assert.match(r, /this\.glossMask \?\?= new OffscreenCanvas/);
});
