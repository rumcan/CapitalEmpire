// T339 (#966, the owner 2026-11-04: "remove grid if lots ive already bought to expand the property"): the faint map grid (and the course half grid)
// is not drawn on land the player owns, in any tool; land for sale (and everything else that is not the player's) keeps it; the property is
// outlined once, round the outside, with no line between the blocks bought one by one.
// Headless: npm test (no DOM, no GL; the shader's maths are mirrored by alphaAt / gridAlphaAt, the layer is driven with a recording GL).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LOOK, MAX_OWNED, NO_LAND, PropertyMemo, alphaAt, courseBuilding, gridAlphaAt, gridFrame, gridModes, gridShown, landOwns, ownedLand, packOwned, propertyOf, viewInOwned,
  type GridFrame, type GridModes, type LandRect,
} from '../src/game/ext/map-grid/index.js';
import { MapGridLayer } from '../src/game/ext/map-grid/layer.js';
import { ZOOM_MAX, worldX, worldY } from '../src/game/iso.js';
import type { Tool } from '../src/game/types.js';

const frame = (z: number, map: boolean, half: boolean): GridFrame => gridFrame({ map: 0, minor: 0, major: 0, hw: 0.5, tpp: 1 }, z, 1, map, half);
const near = (a: number, b: number, e = 1e-9) => Math.abs(a - b) <= e;
const modes = (on: boolean, tool: string, scope: 'town' | 'course', placing: boolean, golf: boolean): GridModes => gridModes({ map: false, half: false }, on, tool, scope, placing, golf);
const segLen = (s: readonly number[]) => { let n = 0; for (let k = 0; k + 3 < s.length; k += 4) n += Math.abs(s[k + 2]! - s[k]!) + Math.abs(s[k + 3]! - s[k + 1]!); return n; };
/** the segments x0 y0 x1 y1 of an outline as tuples */
const segs = (s: readonly number[]) => { const o: number[][] = []; for (let k = 0; k + 3 < s.length; k += 4) o.push([s[k]!, s[k + 1]!, s[k + 2]!, s[k + 3]!]); return o; };

// a range start's home plot, two blocks bought east of it (one on the other), and the practice area still for sale inside the home plot
const HOME: LandRect = [100, 100, 70, 150], B1: LandRect = [170, 100, 40, 40], B2: LandRect = [170, 140, 40, 40], LOT: LandRect = [110, 200, 30, 20];
const GOLF = { course: HOME, parcel: [100, 100, 110, 150] as LandRect, parcels: [HOME, B1, B2], practiceLot: LOT };
/** the engine's own rule for ownership (Game.ownedAt): the golf land (course + parcels) less the practice area for sale */
const engineOwns = (g: { course: LandRect; parcel: LandRect; parcels?: readonly LandRect[]; practiceLot?: LandRect }, x: number, y: number) => {
  const q = g.practiceLot; if (q && x >= q[0] && x < q[0] + q[2] && y >= q[1] && y < q[1] + q[3]) return false;
  return [g.course, ...(g.parcels ?? [g.parcel])].some(r => x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3]);
};
/** every tool the game has (a record, so a tool added to the Tool type fails the typecheck here until it is tested too) */
const ALL_TOOLS: Record<Tool, true> = { select: true, road: true, junction: true, bulldoze: true, park: true, toll: true, bus: true, lane: true, downgrade: true, business: true, paint: true, course: true, path: true, buildings: true, props: true, greenkeeping: true, practice: true };
const TOOLS = Object.keys(ALL_TOOLS);

// ---- the land ----

test('the property is the golf land less the practice area for sale, exactly as the game reads ownership', () => {
  const land = propertyOf(GOLF);
  for (let y = 90; y < 260; y += 3.5) for (let x = 90; x < 220; x += 3.5) assert.equal(landOwns(land, x, y), engineOwns(GOLF, x, y), `(${x}, ${y})`);
  assert.equal(landOwns(land, 125, 210), false, 'the practice area for sale is not the player\'s yet');
  assert.equal(landOwns(land, 105, 105), true);
  assert.equal(landOwns(land, 190, 160), true, 'a bought block');
  assert.equal(landOwns(land, 215, 160), false, 'beyond it');
  // an older save with no parcels list owns its one parcel; no golf game owns nothing
  const old = { course: HOME, parcel: HOME };
  assert.equal(landOwns(propertyOf(old), 120, 120), true); assert.equal(landOwns(propertyOf(old), 180, 120), false);
  assert.deepEqual(propertyOf(null), NO_LAND);
  // the course alone counts too (it lies in the parcel on every start, but it is the player's wherever it is)
  assert.equal(landOwns(propertyOf({ course: [0, 0, 10, 10], parcel: HOME, parcels: [HOME] }), 5, 5), true);
});

test('blocks bought one by one are one piece of land: the rectangles merge and the outline has no line between them', () => {
  const land = ownedLand([HOME, B1, B2]);
  assert.equal(land.rects.length, 2, 'an L: two rectangles');
  const area = land.rects.reduce((a, r) => a + r[2] * r[3], 0);
  assert.equal(area, 70 * 150 + 40 * 80, 'they cover the three blocks exactly once');
  assert.ok(near(segLen(land.outline), 2 * (110 + 150)), `the outline is the L's perimeter: ${segLen(land.outline)}`);
  assert.equal(segs(land.outline).length, 6, 'six straight sides');
  // no line along the seams: home | B1 and B2 (x = 170 for y 100..180) and B1 / B2 (y = 140, x 170..210)
  for (const [x0, y0, x1, y1] of segs(land.outline)) {
    if (x0 === 170 && x1 === 170) assert.ok(Math.min(y0, y1) >= 180, `a line along the seam x = 170: ${[x0, y0, x1, y1]}`);
    assert.ok(!(y0 === 140 && y1 === 140), `a line along the seam y = 140: ${[x0, y0, x1, y1]}`);
  }
  // the order they were bought in, and duplicates, change nothing
  assert.deepEqual(ownedLand([B2, HOME, HOME, B1, B1]), land);
  // overlapping rectangles (the course inside its parcel) are one piece too
  const nested = ownedLand([[100, 100, 70, 150], [110, 120, 20, 20]]);
  assert.deepEqual(nested.rects, [[100, 100, 70, 150]]); assert.equal(nested.outline.length, 16);
});

test('a hole in the land (the practice area for sale) is not the player\'s and gets its own line; nothing owned has no outline', () => {
  const land = ownedLand([HOME], [LOT]);
  assert.equal(landOwns(land, 125, 210), false); assert.equal(landOwns(land, 105, 210), true);
  assert.ok(near(segLen(land.outline), 2 * (70 + 150) + 2 * (30 + 20)), 'the plot\'s perimeter and the hole\'s');
  assert.equal(land.rects.reduce((a, r) => a + r[2] * r[3], 0), 70 * 150 - 30 * 20);
  assert.deepEqual(ownedLand([]), NO_LAND); assert.deepEqual(ownedLand([[5, 5, 0, 10], [5, 5, 10, -1]]), NO_LAND, 'empty rectangles are left out');
  assert.deepEqual(ownedLand([HOME], [HOME]), NO_LAND, 'a hole over everything leaves nothing');
  // the property keeps the grid off the plot but lines only the plot: the practice area for sale has its own (white) survey line, no gold one
  const p = propertyOf(GOLF);
  assert.ok(near(segLen(p.outline), 2 * (110 + 150)), `the property's outline has no line round the practice area: ${segLen(p.outline)}`);
  assert.equal(landOwns(p, 125, 210), false);
});

test('two blocks that only touch at a corner are two pieces, each outlined', () => {
  const land = ownedLand([[0, 0, 10, 10], [10, 10, 10, 10]]);
  assert.equal(land.rects.length, 2); assert.equal(segLen(land.outline), 80, 'both perimeters, 40 each');
});

test('the property is made again only when the land changes: a parcel bought, the practice area bought, a rectangle edited in place', () => {
  const memo = new PropertyMemo(), g = { course: HOME, parcel: [100, 100, 70, 150] as LandRect, parcels: [HOME] as LandRect[], practiceLot: LOT as LandRect | undefined };
  const bought = [170, 100, 40, 40], block = bought as unknown as LandRect; // (a block of its own, so editing it in place touches no shared rectangle)
  const a = memo.of(g);
  assert.equal(memo.of(g), a, 'the same object while nothing changed');
  assert.equal(landOwns(a, 190, 120), false);
  g.parcels = [...g.parcels, block]; const b = memo.of(g);
  assert.notEqual(b, a); assert.equal(landOwns(b, 190, 120), true, 'a block bought (a new list)');
  g.parcels.push(B2); const c = memo.of(g);
  assert.notEqual(c, b); assert.equal(landOwns(c, 190, 160), true, 'a block added to the list in place');
  assert.equal(landOwns(c, 125, 210), false);
  delete g.practiceLot; const d = memo.of(g);
  assert.notEqual(d, c); assert.equal(landOwns(d, 125, 210), true, 'the practice area bought');
  bought[0] = 180; const e = memo.of(g);
  assert.notEqual(e, d); assert.equal(landOwns(e, 172, 120), false, 'a rectangle edited in place');
  assert.equal(memo.of(null), NO_LAND, 'no golf game, no land');
  assert.notEqual(memo.of({ course: HOME, parcel: HOME }), e, 'another game');
});

// ---- the grid ----

/** points on the 2 m map grid's lines (x an integer tile, y between lines) and on its other line direction */
const onLines = (x0: number, y0: number, x1: number, y1: number): [number, number][] => { const o: [number, number][] = []; for (let y = y0; y < y1; y += 5) for (let x = x0; x < x1; x += 5) o.push([x, y + 0.25], [x + 0.25, y]); return o; };

test('the bug: with the whole map as the grid\'s ground, an owned tile\'s line is drawn (alphaAt alone has no idea of ownership)', () => {
  const f = frame(ZOOM_MAX, true, false);
  assert.ok(alphaAt(f, 120, 105.25) > 0, 'a line on the home plot');
  assert.ok(alphaAt(f, 190, 150.25) > 0, 'a line on a bought block');
});

test('owned tiles draw no grid in any tool; land for sale (everything that is not the player\'s) still does', () => {
  const land = propertyOf(GOLF);
  const own = onLines(100, 100, 210, 250).filter(([x, y]) => landOwns(land, x, y)), sale = onLines(40, 40, 330, 330).filter(([x, y]) => !landOwns(land, x, y));
  assert.ok(own.length > 100 && sale.length > 100);
  assert.equal(TOOLS.length, 17);
  for (const tool of TOOLS) for (const scope of ['town', 'course'] as const) for (const placing of [false, true]) {
    const m = modes(true, tool, scope, placing, true), f = gridFrame({ map: 0, minor: 0, major: 0, hw: 0.5, tpp: 1 }, ZOOM_MAX, 1, m.map, m.half);
    for (const [x, y] of own) assert.equal(gridAlphaAt(f, land, x, y), 0, `${tool}/${scope}${placing ? '/structure' : ''}: a line on owned land at (${x}, ${y})`);
    if (!m.map && !m.half) continue; // (Select: no grid at all)
    for (const [x, y] of sale) assert.ok(gridAlphaAt(f, land, x, y) > 0, `${tool}: land for sale loses its line at (${x}, ${y})`);
  }
  // the practice area for sale inside the home plot keeps the grid (a hole in the owned land); the plot round it does not
  const f = frame(ZOOM_MAX, true, false);
  assert.ok(gridAlphaAt(f, land, 125, 210.25) > 0, 'a line on the practice area for sale');
  assert.equal(gridAlphaAt(f, land, 105, 210.25), 0, 'a line on the owned plot beside it');
  // the grid's own strength is untouched where it shows
  assert.ok(near(gridAlphaAt(f, land, 300, 300.25), LOOK.map));
  assert.equal(gridAlphaAt(f, NO_LAND, 120, 105.25), alphaAt(f, 120, 105.25), 'with no land the grid is as it was');
  assert.equal(gridAlphaAt(f, null, 120, 105.25), alphaAt(f, 120, 105.25));
});

test('a golf game never shows the 1 m half grid (its land is the player\'s); the 2 m map grid follows the tool as ever', () => {
  for (const tool of TOOLS) for (const scope of ['town', 'course'] as const) for (const placing of [false, true]) {
    const m = modes(true, tool, scope, placing, true);
    assert.equal(m.half, false, `${tool}/${scope}: a golf game has no half grid`);
    assert.equal(m.map, gridShown(true, tool), `${tool}: the map grid's tool rule is unchanged`);
    assert.equal(modes(false, tool, scope, placing, true).map, false, 'the setting off hides it everywhere');
    // a game that is not golf keeps both as they were
    assert.deepEqual(modes(true, tool, scope, placing, false), { map: gridShown(true, tool), half: courseBuilding(tool, scope, placing) });
  }
  assert.equal(modes(true, 'select', 'town', false, true).map, false, 'Select: no grid');
  assert.equal(modes(true, 'course', 'town', false, true).map, true, 'the Course paint brush: the map grid, off the owned land');
  // into out: the same object comes back
  const out = { map: false, half: false }; assert.equal(gridModes(out, true, 'paint', 'town', false, true), out);
});

// ---- what the shader is given ----

test('the owned land is packed as x0 y0 x1 y1 for the shader, the biggest first, and never more than the shader holds', () => {
  const out = new Float32Array(MAX_OWNED * 4);
  const land = ownedLand([HOME, B1, B2]);
  assert.equal(packOwned(land, out), 2);
  assert.deepEqual([...out.slice(0, 8)], [100, 100, 210, 180, 100, 180, 170, 250], 'the big rectangle first');
  assert.equal(packOwned(NO_LAND, out), 0);
  // a long staircase of single blocks: as many as the shader holds, never a bounding box (that would take the land for sale between them)
  const stairs = ownedLand(Array.from({ length: MAX_OWNED + 9 }, (_, i) => [i * 10, i * 10, 10, 10] as LandRect));
  assert.equal(stairs.rects.length, MAX_OWNED + 9);
  assert.equal(packOwned(stairs, out), MAX_OWNED);
  for (let i = 0; i < MAX_OWNED; i++) assert.ok(out[4 * i + 2]! - out[4 * i]! === 10 && out[4 * i + 3]! - out[4 * i + 1]! === 10, 'each packed rectangle is a real block');
});

test('the pass is skipped when everything on screen is the player\'s land, and only then', () => {
  const out = new Float32Array(MAX_OWNED * 4), n = packOwned(ownedLand([[200, 200, 400, 400]]), out);
  const at = (tx: number, ty: number, ze: number) => ({ X: worldX(tx, ty), Y: worldY(tx, ty), ze, cw: 1280, ch: 800 });
  assert.equal(viewInOwned(out, n, at(400, 400, 0.3)), true, 'close in, well inside');
  assert.equal(viewInOwned(out, n, at(400, 400, 0.12)), true, 'the district zoom, still inside');
  assert.equal(viewInOwned(out, n, at(205, 400, 0.3)), false, 'straddling the west edge');
  assert.equal(viewInOwned(out, n, at(400, 596, 0.3)), false, 'straddling the south edge');
  assert.equal(viewInOwned(out, n, at(400, 400, 0.02)), false, 'zoomed out past the land');
  assert.equal(viewInOwned(out, n, at(900, 900, 0.3)), false, 'elsewhere');
  assert.equal(viewInOwned(out, 0, at(400, 400, 0.3)), false, 'no land');
});

/** a WebGL2 context that records the calls the grid layer makes (the layer is the only code that touches the uniforms) */
function recordingGL() {
  const calls: { fn: string; args: unknown[] }[] = [], names = new Map<object, string>();
  const gl = new Proxy({ TEXTURE3: 3, TEXTURE0: 0, TEXTURE_2D: 1, TRIANGLES: 4, VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4, R8UI: 5, NEAREST: 6, CLAMP_TO_EDGE: 7, RED_INTEGER: 8, UNSIGNED_BYTE: 9, UNPACK_ALIGNMENT: 10 } as Record<string, unknown>, {
    get(t, k: string) {
      if (k in t) return t[k];
      if (k === 'getShaderParameter' || k === 'getProgramParameter') return () => true;
      if (k === 'getUniformLocation') return (_p: unknown, n: string) => { const o = { n }; names.set(o, n); return o; };
      if (k === 'createProgram' || k === 'createShader' || k === 'createTexture') return () => ({});
      return (...args: unknown[]) => { calls.push({ fn: k, args: args.map(a => (a && typeof a === 'object' && names.has(a as object) ? names.get(a as object) : a)) }); };
    },
  }) as unknown as WebGL2RenderingContext;
  return { gl, calls };
}

test('the grid layer hands the shader the owned rectangles (and none when the game has no land); a view wholly on them draws nothing', () => {
  const view = { X: 0, Y: 0, ze: 0.3, cw: 1280, ch: 800 };
  const run = (land: ReturnType<typeof ownedLand>, v = view) => {
    const { gl, calls } = recordingGL(), layer = new MapGridLayer();
    const drew = layer.draw(gl, v, ZOOM_MAX, 1, true, false, [], null, land);
    const n = calls.filter(c => c.fn === 'uniform1i' && c.args[0] === 'uOwnN').map(c => c.args[1]);
    const rects = calls.find(c => c.fn === 'uniform4fv' && c.args[0] === 'uOwn');
    return { drew, n, rects: rects ? [...(rects.args[1] as Float32Array).slice(0, 8)] : null, drawn: calls.some(c => c.fn === 'drawArrays') };
  };
  const a = run(ownedLand([HOME, B1, B2]));
  assert.equal(a.drew, true); assert.deepEqual(a.n, [2]); assert.ok(a.drawn); assert.deepEqual(a.rects, [100, 100, 210, 180, 100, 180, 170, 250]);
  const b = run(NO_LAND);
  assert.equal(b.drew, true); assert.deepEqual(b.n, [0]); assert.equal(b.rects, null); assert.ok(b.drawn, 'the grid still draws on land that is not the player\'s');
  const inside = run(ownedLand([[-1000, -1000, 3000, 3000]]));
  assert.equal(inside.drew, false, 'the view is all the player\'s land'); assert.equal(inside.drawn, false); assert.equal(inside.n.length, 0);
});
