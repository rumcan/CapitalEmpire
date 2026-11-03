// T311 (#896), T290 (#875), T301 (#886): a painted (studio) course look's Scale, Angle and Pan reach its pattern transform, for the
// surface's main texture, its border band and its Blend with. Before the fix the renderer laid a painted look in the chunk's own px
// (renderer paintedFill) and never used them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HW, HH } from '../src/game/iso';
import { BRUSH_PRESETS } from '../src/game/paint';
import { courseBandOf, courseTexOf, type LookStyle } from '../src/game/course-look';
import { apply, courseBlendG, courseTexG, paintedLay, type Aff, type ChunkFrame } from '../src/game/painted-turn';

const tee = BRUSH_PRESETS.find(b => b.kind === 'tee')!.style as LookStyle;
const green = BRUSH_PRESETS.find(b => b.kind === 'green')!.style as LookStyle;
/** a ground chunk as renderer paint() frames it: (i, j) at cache level L */
const chunk = (i: number, j: number, L = 0.6): ChunkFrame => {
  const CW = 1024, CH = 512, X0 = i * CW, Y0 = j * CH;
  return { key: `g${i},${j}@${L}`, L, M: [HW * L, HH * L, -HW * L, HH * L, -X0 * L, -Y0 * L], W: Math.round(CW * L), H: Math.round(CH * L) };
};
const close = (a: readonly number[], b: readonly number[], eps = 1e-6) => a.every((v, k) => Math.abs(v - b[k]!) < eps);
/** the pattern laid through the lay: a point q of the texture's own tile space lands in the chunk's tile space at G q */
function landsThrough(c: ChunkFrame, G: Aff, scale: number, tiled: boolean) {
  const lay = paintedLay(c, G, scale, tiled, [10, 10, 40, 30]);
  assert.ok(lay, 'a transformed painted look gets its own composition');
  for (const [x, y] of [[0, 0], [3.5, -2], [17, 41]] as const) {
    const px = apply(lay!.M, x, y), at = apply(lay!.pattern, px[0], px[1]);
    // a tile set takes the whole of G; a painting takes its scale in its look (its coverage), so the pattern carries G without it
    const want = tiled ? apply(G, x, y) : apply(G, x / scale, y / scale);
    assert.ok(close(at, want, 1e-6), `(${x}, ${y}) lands at ${at} not ${want}`);
  }
  return lay!;
}

test('T311: the main texture of a painted look: Scale, Angle and Pan reach the pattern (tile set and painting)', () => {
  const t = courseTexOf({ ...tee, scale: 0.51, angle: 30, ox: 3, oy: -1 });
  const G = courseTexG(t);
  // the scale is G's: two points 1 tile apart land 0.51 tiles apart, turned 30 degrees, offset (3, -1)
  assert.ok(close(apply(G, 0, 0), [3, -1]));
  const [x1, y1] = apply(G, 1, 0);
  assert.ok(Math.abs(Math.hypot(x1 - 3, y1 + 1) - 0.51) < 1e-9);
  assert.ok(Math.abs(Math.atan2(y1 + 1, x1 - 3) * 180 / Math.PI - 30) < 1e-9);
  const lay = landsThrough(chunk(3, 5), G, t.sc, true);
  // the virtual chunk is at the density the texture lands at (the art level times the scale) and asks for the part the fill needs
  assert.equal(lay.L, 0.6 * 0.51);
  assert.ok(lay.need && lay.need[2] > lay.need[0] && lay.need[3] > lay.need[1]);
  landsThrough(chunk(3, 5), G, t.sc, false);
});

test('T311: Scale alone reaches a tile set (laid as authored before), and a painting keeps it in its look', () => {
  const t = courseTexOf({ ...tee, scale: 0.5 }), G = courseTexG(t);
  assert.ok(paintedLay(chunk(0, 0), G, t.sc, true), 'a tile set at scale 0.5 is composed at its scale');
  assert.equal(paintedLay(chunk(0, 0), G, t.sc, false), null, "a painting's scale is its look's coverage (the chunk's own composition)");
});

test('T311: an untouched look keeps the chunk\'s own composition (no extra cost)', () => {
  const t = courseTexOf(tee);
  assert.equal(paintedLay(chunk(1, 1), courseTexG(t), t.sc, true), null);
  assert.equal(paintedLay(chunk(1, 1), courseTexG(t), t.sc, false), null);
});

test('T290: the border band (the fringe) of a painted look: its Scale, Angle and Pan reach the pattern', () => {
  const dflt = { tex: 'preset:fringe', sc: 1, a: 0 };
  const b = courseBandOf('green', { ...green, bscale: 0.4, bangle: 45, box: 3, boy: 2 }, dflt);
  assert.equal(b.sc, 0.4); assert.equal(b.a, 45); assert.deepEqual(b.o, [3, 2]);
  landsThrough(chunk(2, 7), courseTexG(b), b.sc, true);
  landsThrough(chunk(2, 7), courseTexG(b), b.sc, false);
  // Pan alone moves the band's picture
  const p = courseBandOf('green', { ...green, box: 3 }, dflt);
  assert.ok(paintedLay(chunk(2, 7), courseTexG(p), p.sc, true));
});

test('T301: Blend with\'s Scale (and Angle and Pan) reach the blend\'s pattern', () => {
  const t = courseTexOf({ ...tee, mtex: 'preset:golf-green', mshare: 0.5, mscale: 2.5, mangle: 20, mox: 1 });
  const bl = courseBlendG(t)!;
  assert.equal(bl.sc, 2.5);
  const [x1, y1] = apply(bl.G, 1, 0);
  assert.ok(Math.abs(Math.hypot(x1 - 1, y1) - 2.5) < 1e-9);
  const lay = landsThrough(chunk(4, 4), bl.G, bl.sc, true);
  assert.equal(lay.L, 0.6 * 2.5);
  // without its own, the blend follows the fill's scale and angle
  const f = courseBlendG(courseTexOf({ ...tee, scale: 0.7, angle: 10, mtex: 'preset:golf-green' }))!;
  assert.equal(f.sc, 0.7);
});

test('T311: neighbouring chunks compose the same texture grid (whole-px origins, one density): no seam', () => {
  const t = courseTexOf({ ...tee, scale: 0.8, angle: 33, ox: 1.25 }), G = courseTexG(t);
  const a = paintedLay(chunk(5, 5), G, t.sc, true)!, b = paintedLay(chunk(6, 5), G, t.sc, true)!;
  assert.ok(close(a.M.slice(0, 4), b.M.slice(0, 4)));
  for (const v of [a.M[4], a.M[5], b.M[4], b.M[5]]) assert.equal(v, Math.round(v));
  // the virtual buffer covers the whole chunk: every chunk corner maps inside it
  const c = chunk(5, 5);
  for (const [x, y] of [[0, 0], [c.W, 0], [0, c.H], [c.W, c.H]] as const) {
    // chunk px -> tile (inverse of the chunk's M) -> virtual px (inverse of the pattern)
    const d = c.M[0] * c.M[3] - c.M[1] * c.M[2], tx = (c.M[3] * (x - c.M[4]) - c.M[2] * (y - c.M[5])) / d, ty = (-c.M[1] * (x - c.M[4]) + c.M[0] * (y - c.M[5])) / d;
    const P = a.pattern, pd = P[0] * P[3] - P[1] * P[2], vx = (P[3] * (tx - P[4]) - P[2] * (ty - P[5])) / pd, vy = (-P[1] * (tx - P[4]) + P[0] * (ty - P[5])) / pd;
    assert.ok(vx >= 0 && vy >= 0 && vx <= a.W && vy <= a.H, `corner (${x}, ${y}) at (${vx}, ${vy}) outside ${a.W} x ${a.H}`);
  }
});
