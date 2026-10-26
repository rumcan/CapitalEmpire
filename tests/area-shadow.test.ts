// Headless tests for T136 (#260): the Shadow slider for painted areas. The optional area field and its save tuple slot (old saves load and
// save unchanged), the edge shade's direction (the sun at the upper right, the shade on the edges turned toward 145°), falloff, strength,
// the light's inset (T110), and the paint tool's patch, re-bake and undo. Bundled by esbuild, run by node --test; no DOM, no canvas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STYLE, clampStyle, fromTuples, toTuple, type PaintArea, type PaintTuple } from '../src/game/paint';
import { AREA_SHADE, EDGE_LOOKS, areaLightAlpha, areaLightEdge, areaLightGap, areaShadeAlpha, areaShadeEdge, areaShadeImages, areaShadeLen, areaShadeReach, areaShadow, featherTiles, edgeField, edgeNormals, edgeRes, lightFacing, shadeFacing, shadeFalloff, shadeNoise, sunFacing } from '../src/game/paint-edges';
import { SUN_SHADOW_DEG } from '../src/game/ext/course-height';
import { HH, HW } from '../src/game/iso';
import { PaintTool } from '../src/game/paint-tool';
import type { LotPatch } from '../src/game/ground-protocol';

const SQUARE = [0, 0, 10, 0, 10, 10, 0, 10];
const area = (o: Partial<PaintArea> = {}): PaintArea => ({ id: 1, pts: SQUARE.slice(), ...DEFAULT_STYLE, tex: 'grass', ...o });

// ---------- 1. the field and its save tuple ----------

test('1a. Shadow saves as an optional trailing slot (24) and loads back; every slot before it is written, an unset order as null', () => {
  const t = toTuple(area({ shadow: 0.5 }));
  assert.equal(t.length, 25);
  assert.equal(t[24], 0.5);
  assert.equal(t[23], null, 'no draw order of its own: a null placeholder, not a number');
  assert.equal(t[19], '', 'no blend: the empty placeholder');
  const [a] = fromTuples([JSON.parse(JSON.stringify(t)) as PaintTuple]);
  assert.equal(a!.shadow, 0.5);
  assert.equal(a!.order, undefined, 'the null order loads as none');
  assert.equal(a!.mtex, undefined);
  // with an order and a blend too: both kept, the shade after them
  const b = area({ shadow: 0.25, order: 7.5, mtex: 'dirt', mshare: 0.4, msoft: 0.2, mpatch: 2 });
  const [c] = fromTuples([JSON.parse(JSON.stringify(toTuple(b))) as PaintTuple]);
  assert.equal(c!.shadow, 0.25); assert.equal(c!.order, 7.5); assert.equal(c!.mtex, 'dirt'); assert.equal(c!.mshare, 0.4);
  // a round trip of the round trip is the same tuple
  assert.deepEqual(toTuple(c!), toTuple({ ...b, id: c!.id }));
});

test('1b. old saves (no slot 24) load with no shade and save back unchanged; Shadow 0 writes nothing new', () => {
  const plain: PaintTuple = ['grass', 1, 0, 0, 'kerb', SQUARE.slice(), 0, 0, 0.35, '#000000'];
  const brushed: PaintTuple = ['grass', 1, 0, 2, 'dirt', SQUARE.slice(), 0, 0, 0.35, '#000000', 3, 'green'];
  const bordered: PaintTuple = ['pad', 1, 0, 2, 'kerb', SQUARE.slice(), 0, 0, 0.35, '#000000', 0, '', '', 0, 2, -30, 1, 0.6, '#402010'];
  const blended: PaintTuple = ['grass', 1, 0, 0, 'kerb', SQUARE.slice(), 0, 0, 0.35, '#000000', 0, '', '', 0, 1, 0, 0, 0.35, '#000000', 'dirt', 0.5, 0.12, 1];
  const ordered: PaintTuple = ['grass', 1, 0, 0, 'kerb', SQUARE.slice(), 0, 0, 0.35, '#000000', 0, '', '', 0, 1, 0, 0, 0.35, '#000000', '', 0.5, 0.12, 1, 4];
  const shortest: PaintTuple = ['grass', 1, 0, 0, 'kerb', SQUARE.slice()];
  for (const t of [plain, brushed, bordered, blended, ordered, shortest]) {
    const [a] = fromTuples([t]);
    assert.ok(a, `loads: ${t.length} slots`);
    assert.equal(a!.shadow, undefined, `${t.length} slots: no shade`);
    assert.ok(!('shadow' in a!), 'the field is left out, not undefined');
    const again = toTuple(a!);
    if (t !== shortest) assert.deepEqual(again, t, `${t.length} slots: saved back as it was`);
    assert.ok(again.length <= 24);
  }
  assert.equal(toTuple(area({ shadow: 0 })).length, 10, 'Shadow 0 is the old look: the old ten slots');
});

test('1c. clampStyle keeps Shadow in 0..1 to 3 decimals and leaves it out at 0 or when it is not a number', () => {
  assert.equal(clampStyle({ ...DEFAULT_STYLE, shadow: 1.7 }).shadow, 1);
  assert.equal(clampStyle({ ...DEFAULT_STYLE, shadow: 0.12345 }).shadow, 0.123);
  for (const bad of [0, -0.4, Number.NaN, Infinity * 0, 'x' as unknown as number, undefined]) {
    const s = clampStyle({ ...DEFAULT_STYLE, shadow: bad });
    assert.ok(!('shadow' in s), `${String(bad)}: left out`);
  }
  // a hand-edited save: a bad slot 24 loads as none, a big one is clamped
  const [a] = fromTuples([['grass', 1, 0, 0, 'kerb', SQUARE.slice(), 0, 0, 0.35, '#000000', 0, '', '', 0, 1, 0, 0, 0.35, '#000000', '', 0.5, 0.12, 1, null, 9]]);
  assert.equal(a!.shadow, 1);
  const [b] = fromTuples([['grass', 1, 0, 0, 'kerb', SQUARE.slice(), 0, 0, 0.35, '#000000', 0, '', '', 0, 1, 0, 0, 0.35, '#000000', '', 0.5, 0.12, 1, null, 'x' as unknown as number]]);
  assert.equal(b!.shadow, undefined);
});

test('1d. the ground patch carries the shade (sh) only above 0, for crisp and feathered areas alike', () => {
  assert.equal(PaintTool.patch(area()).paint!.sh, undefined);
  assert.equal(PaintTool.patch(area({ shadow: 0.6 })).paint!.sh, 0.6);
  const paving = PaintTool.patch(area({ tex: 'paving', shadow: 0.3 })).paint!;
  assert.equal(paving.e, undefined, 'paving stays crisp'); assert.equal(paving.sh, 0.3, 'and still takes its shade');
});

// ---------- 2. the shade model ----------

/** the screen direction (degrees: 0 right, 90 down) of a tile-space direction */
const screenDeg = (x: number, y: number) => { const a = Math.atan2((x + y) * HH, (x - y) * HW) * 180 / Math.PI; return (a + 360) % 360; };

test('2a. direction: the most shaded edge is the one whose outside faces 145° on screen; edges turned to the sun get light, not shade', () => {
  // an octagon-ish ring of 72 edges: find the edge with the strongest shade at the outline
  const n = 72, ring: number[] = [];
  for (let i = 0; i < n; i++) { const a = (2 * Math.PI * i) / n; ring.push(50 + 10 * Math.cos(a), 50 + 10 * Math.sin(a)); }
  const nm = edgeNormals(ring);
  let best = -1, bestA = -1, lit = -1, litA = -1;
  for (let i = 0; i < n; i++) {
    const f = sunFacing(nm[2 * i]!, nm[2 * i + 1]!), a = areaShadeAlpha(0, f, 1), l = areaLightAlpha(0.2, f, 1);
    if (a > bestA) { bestA = a; best = i; }
    if (l > litA) { litA = l; lit = i; }
    if (f > 0.25) assert.equal(a, 0, 'an edge turned to the sun is never shaded');
    if (f < 0.1) assert.equal(l, 0, 'an edge turned away is never lit');
  }
  const shadeDir = screenDeg(nm[2 * best]!, nm[2 * best + 1]!), litDir = screenDeg(nm[2 * lit]!, nm[2 * lit + 1]!);
  assert.ok(Math.abs(shadeDir - SUN_SHADOW_DEG) <= 6, `the shaded side faces ${shadeDir.toFixed(1)}° on screen (145° wanted)`);
  assert.ok(Math.abs(litDir - (SUN_SHADOW_DEG + 180) % 360) <= 6, `the lit side faces ${litDir.toFixed(1)}° (the sun, 325°)`);
  // the facing weights themselves: all of it turned straight away, a touch side-on, none turned to the sun
  assert.equal(shadeFacing(-1), 1); assert.ok(shadeFacing(0) > 0 && shadeFacing(0) < 0.2); assert.equal(shadeFacing(0.5), 0);
  assert.equal(lightFacing(1), 1); assert.equal(lightFacing(0), 0); assert.equal(lightFacing(-1), 0);
});

test('2b. falloff: strongest at the outline, easing to nothing a few metres in, nothing outside', () => {
  const len = areaShadeLen(1);
  assert.ok(len * 2 >= 3 && len * 2 <= 4, `fades out over ${(len * 2).toFixed(1)} m at full Shadow`);
  assert.ok(areaShadeLen(0.2) * 2 >= 2, 'a faint shade still spans a couple of metres');
  assert.equal(areaShadeAlpha(-0.01, -1, 1), 0, 'none outside the outline');
  let prev = Infinity;
  for (let d = 0; d <= len; d += 0.05) { const a = areaShadeAlpha(d, -1, 1); assert.ok(a <= prev + 1e-12, `falls off inward (d ${d.toFixed(2)})`); prev = a; }
  assert.ok(areaShadeAlpha(len * 0.5, -1, 1) > 0.05, 'still there half way in: a soft fade, not a thin line');
  assert.equal(areaShadeAlpha(len, -1, 1), 0, 'gone at its depth');
  assert.equal(areaShadeAlpha(len * (1 + AREA_SHADE.noise), -1, 1, 1), 0, 'gone at its depth with the noise at its deepest');
  assert.ok(shadeFalloff(0, 1) === 1 && shadeFalloff(1, 1) === 0);
  // the reach covers the deepest shade, so the field the renderer builds holds all of it
  assert.ok(areaShadeReach(1) > len * (1 + AREA_SHADE.noise));
  assert.equal(areaShadeReach(0), 0, 'no shade: nothing widens the edge images');
});

test('2c. strength: from the slider, 0 is nothing, more is darker at every depth; the cool multiply keeps the texture', () => {
  for (const d of [0, 0.3, 0.8, 1.2]) {
    assert.equal(areaShadeAlpha(d, -1, 0), 0);
    let prev = -1;
    for (let s = 0; s <= 1.0001; s += 0.1) { const a = areaShadeAlpha(d, -1, s); assert.ok(a >= prev - 1e-12, `d ${d}: stronger with the slider`); prev = a; }
  }
  for (const s of [0.25, 0.5, 1]) assert.ok(Math.abs(areaShadeAlpha(0, -1, s) - s * AREA_SHADE.max) < 1e-12, 'at the outline the alpha is the slider times the most');
  assert.equal(areaShadow(undefined), 0); assert.equal(areaShadow(-1), 0); assert.equal(areaShadow(3), 1); assert.equal(areaShadow('0.5'), 0);
  // a multiply (canvas: base x (1 - a + a x colour)): the darkest it gets at full strength still keeps over half the texture's light, the
  // same factor for a texel and its neighbour (their contrast kept), and the shade is cool (blue darkened least)
  const f = AREA_SHADE.rgb.map(c => 1 - AREA_SHADE.max + AREA_SHADE.max * c / 255);
  assert.ok(Math.min(...f) >= 0.55, `the deepest shade keeps ${Math.round(Math.min(...f) * 100)}% of the texture`);
  assert.ok(f[2]! > f[1]! && f[1]! > f[0]!, 'cool: blue kept most, red least');
  const texels = [40, 90, 160, 220], shaded = texels.map(v => v * f[1]!);
  for (let i = 1; i < texels.length; i++) assert.ok(Math.abs(shaded[i]! / shaded[i - 1]! - texels[i]! / texels[i - 1]!) < 1e-9, 'the texture\'s contrast is kept');
});

test('2d. the noise varies the depth (no even band) and is the same in every chunk', () => {
  const vals = new Set<number>();
  for (let x = 0; x < 40; x += 3.3) vals.add(Math.round(shadeNoise(x, 17) * 20));
  assert.ok(vals.size >= 4, 'the depth changes along an edge');
  assert.equal(shadeNoise(123.25, 456.5), shadeNoise(123.25, 456.5));
  assert.ok(areaShadeAlpha(1, -1, 1, 0) < areaShadeAlpha(1, -1, 1, 1), 'a deeper patch reaches further in');
});

test('2e. the light (T110): inset a small gap inside the outline, ramped in, from the slider; none at 0', () => {
  assert.equal(areaLightAlpha(0, 1, 1), 0, 'nothing on the edge line');
  assert.equal(areaLightAlpha(AREA_SHADE.gap * 0.9, 1, 1), 0, 'nothing within the gap');
  const peak = areaLightAlpha(AREA_SHADE.gap + AREA_SHADE.ramp, 1, 1);
  assert.ok(peak > 0.5 * AREA_SHADE.light, 'full just past the ramp');
  assert.ok(areaLightAlpha(AREA_SHADE.gap + AREA_SHADE.ramp + AREA_SHADE.width + 0.01, 1, 1) === 0, 'gone a band further in');
  assert.ok(AREA_SHADE.gap * 2 >= 0.15 && AREA_SHADE.gap * 2 <= 0.3, 'the gap is 0.15 to 0.3 m');
  assert.equal(areaLightAlpha(0.2, 1, 0), 0);
  assert.ok(Math.abs(areaLightAlpha(0.2, 1, 0.5) - 0.5 * areaLightAlpha(0.2, 1, 1)) < 1e-12, 'its strength from the slider');
  assert.ok(areaLightGap(0) === 0 && areaLightGap(1) === 1);
});

test('2g. on a feathered area both are measured from where its edge reads (the middle of the feather), so the feather never fades them out', () => {
  const feather = featherTiles(EDGE_LOOKS.flat!, 0.3), e = areaShadeEdge(feather), le = areaLightEdge(feather);
  assert.ok(e > 0 && e < feather && le > 0 && le < e, 'the edges read inside the outline, within the feather (the light where the edge is seen)');
  assert.equal(areaShadeEdge(0), 0, 'a crisp area: the outline itself'); assert.equal(areaLightEdge(0), 0);
  for (const d of [0, e * 0.5, e]) assert.ok(Math.abs(areaShadeAlpha(d, -1, 1, 0.5, e) - AREA_SHADE.max) < 1e-12, 'full through the feather');
  assert.ok(Math.abs(areaShadeAlpha(e + 0.5, -1, 1, 0.5, e) - areaShadeAlpha(0.5, -1, 1)) < 1e-12, 'the fade starts at the edge');
  assert.ok(areaShadeAlpha(0.5, -1, 1, 0.5, e) > areaShadeAlpha(0.5, -1, 1), 'so it is deeper by the edge');
  assert.equal(areaLightAlpha(le + AREA_SHADE.gap * 0.9, 1, 1, le), 0, 'the gap of the light is inside the edge');
  assert.ok(areaLightAlpha(le + AREA_SHADE.gap + AREA_SHADE.ramp, 1, 1, le) > 0.5 * AREA_SHADE.light);
  assert.ok(Math.abs(areaShadeReach(1, feather) - areaShadeReach(1) - e) < 1e-12, 'the images reach the further for it');
});

test('2f. the images over a square: shade inside its lower-left edges only, light along its upper-right edge, nothing outside; far levels skip the light', () => {
  const pts = [100, 100, 112, 100, 112, 112, 100, 112], res = edgeRes(0.6), reach = areaShadeReach(1);
  const f = edgeField(pts, 96, 96, 20, 20, res, reach);
  const im = areaShadeImages(f, 1);
  assert.ok(im.shade && im.light && im.lightBox);
  /** the mean alpha of an image over a tile box */
  const mean = (img: NonNullable<typeof im.shade>, x0: number, y0: number, x1: number, y1: number) => {
    let s = 0, n = 0;
    for (let v = 0; v < img.H; v++) for (let u = 0; u < img.W; u++) { const x = 96 + (u + 0.5) / res, y = 96 + (v + 0.5) / res; if (x >= x0 && x < x1 && y >= y0 && y < y1) { s += img.data[4 * (v * img.W + u) + 3]!; n++; } }
    return n ? s / n : 0;
  };
  // the sun lies toward -y (upper right on screen): the y = 112 edge (outside toward the lower left, 153°) is the shaded one
  const near = mean(im.shade!, 102, 111, 110, 112), far = mean(im.shade!, 102, 100, 110, 101);
  assert.ok(near > 60, `the edge turned from the sun is shaded (${near.toFixed(0)})`);
  assert.equal(far, 0, 'the edge turned to the sun is not');
  assert.ok(mean(im.shade!, 102, 108.5, 110, 109.5) < near, 'fading inward');
  assert.equal(mean(im.shade!, 102, 105, 110, 106), 0, 'the middle of the area is untouched');
  assert.equal(mean(im.shade!, 96, 113, 116, 116), 0, 'nothing outside the area');
  assert.ok(mean(im.light!, 102, 100, 110, 100.5) > 0, 'the sun side is lit');
  assert.equal(mean(im.light!, 102, 111, 110, 112), 0, 'the shaded side is not');
  assert.ok(im.lightBox![3] < 103, 'the light box holds the lit edge only, not the whole area');
  const farLevel = areaShadeImages(edgeField(pts, 96, 96, 20, 20, edgeRes(0.07), reach), 1, false);
  assert.ok(farLevel.shade && !farLevel.light, 'far out the shade alone (less of it), no light');
  assert.ok(AREA_SHADE.lightL >= 0.07 && AREA_SHADE.lightL <= 0.15);
  const none = areaShadeImages(f, 0);
  assert.ok(!none.shade && !none.light, 'Shadow 0: nothing');
});

// ---------- 3. the paint tool: re-bake and undo ----------

/** a host that records the ground patches it is sent */
function world() {
  const sent: [string, LotPatch[] | null][] = [];
  const host = { setLotGround: (k: string, p: LotPatch[] | null) => { sent.push([k, p]); }, emit() {}, save() {}, toast() {}, affine() {}, placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [] };
  const tool = new PaintTool(host);
  tool.load([toTuple(area({ id: 1, mtex: 'dirt', mshare: 0.3, msoft: 0.12, mpatch: 1 })), toTuple(area({ id: 2, pts: SQUARE.map(v => v + 40) }))]);
  sent.length = 0;
  return { tool, sent };
}
/** picks the area under tile (x, y) with the Pick mode, as a click does */
function pick(tool: PaintTool, x: number, y: number) { tool.setMode('pick'); tool.pointerDown({ x, y }, 0, 0, false); }

test('3a. the slider re-bakes only the picked area (its own patch, its outline unchanged)', () => {
  const { tool, sent } = world();
  pick(tool, 45, 45); assert.equal(tool.selected, 2);
  tool.setStyle({ shadow: 0.4 });
  assert.deepEqual(sent.map(s => s[0]), ['paint:2'], 'one patch sent, the picked area\'s');
  assert.equal(sent[0]![1]![0]!.paint!.sh, 0.4);
  assert.deepEqual(sent[0]![1]![0]!.pts, PaintTool.patch(tool.areas[1]!).pts, 'the same outline: only its chunks re-bake');
  assert.equal(tool.areas[0]!.shadow, undefined, 'the other area keeps its look');
  tool.setStyle({ shadow: 0 });
  assert.ok(!('shadow' in tool.areas[1]!), 'back to 0: the field goes (the old look)');
  // picking an area shows its Shadow (and its blend), and another control's change keeps them
  tool.setStyle({ shadow: 0.6 }); pick(tool, 5, 5); pick(tool, 45, 45);
  assert.equal(tool.style.shadow, 0.6, "the panel shows the picked area's Shadow");
  tool.setStyle({ border: 1 });
  assert.equal(tool.areas[1]!.shadow, 0.6, 'a Border change keeps the Shadow');
  pick(tool, 5, 5);
  assert.equal(tool.style.mtex, 'dirt'); assert.equal(tool.style.shadow, undefined);
  tool.setStyle({ shadow: 0.3 });
  assert.equal(tool.areas[0]!.mtex, 'dirt', 'a Shadow change keeps the blend'); assert.equal(tool.areas[0]!.tex, 'grass');
});

test('3b. undo takes a whole slider drag back in one step and redo puts it back; a later change is its own step', () => {
  const { tool } = world(), now = Date.now;
  let t = 1_000_000; Date.now = () => t;
  try {
    pick(tool, 5, 5);
    for (const v of [0.1, 0.2, 0.35, 0.5, 0.7]) { tool.setStyle({ shadow: v }); t += 30; }
    assert.equal(tool.areas[0]!.shadow, 0.7);
    assert.equal(tool.undoLabel, 'restyle area');
    tool.undo();
    assert.equal(tool.areas.find(a => a.id === 1)!.shadow, undefined, 'one undo: the whole drag');
    assert.equal(tool.canUndo, false, 'and it was one step');
    tool.redo();
    assert.equal(tool.areas.find(a => a.id === 1)!.shadow, 0.7);
    // a change long after: a step of its own
    t += 5000; pick(tool, 5, 5); tool.setStyle({ shadow: 0.2 });
    tool.undo();
    assert.equal(tool.areas.find(a => a.id === 1)!.shadow, 0.7, 'the later change undone alone');
    tool.undo();
    assert.equal(tool.areas.find(a => a.id === 1)!.shadow, undefined);
  } finally { Date.now = now; }
});

test('3c. the Border and the other look controls go through the same undo (the usual path), the drag joined; another area starts a new step', () => {
  const { tool } = world(), now = Date.now;
  let t = 2_000_000; Date.now = () => t;
  try {
    pick(tool, 5, 5);
    tool.setStyle({ border: 1 }); t += 20; tool.setStyle({ border: 2 }); t += 20;
    pick(tool, 45, 45); tool.setStyle({ shadow: 0.5 }); t += 20;
    tool.undo();
    assert.equal(tool.areas.find(a => a.id === 2)!.shadow, undefined, 'area 2\'s change undone first');
    assert.equal(tool.areas.find(a => a.id === 1)!.border, 2, 'area 1\'s border kept');
    tool.undo();
    assert.equal(tool.areas.find(a => a.id === 1)!.border, 0, 'then area 1\'s whole border drag');
  } finally { Date.now = now; }
});
