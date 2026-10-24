// Headless tests for the painted surfaces' edges (paint-edges.ts: feather, sun-lit bevel, cast shadow): npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SUN_TILE_DIR } from '../src/game/ext/course-height';
import {
  EDGE_LOOKS, bandRamp, castWeight, edgeBox, edgeField, edgeImages, edgeNormals, edgeProfileOf, edgeReach, edgeRes, edgeShade, featherAlpha,
  featherTiles, isCellSeam, rimWeight, sunFacing, type EdgeImage,
} from '../src/game/paint-edges';
import { PaintTool } from '../src/game/paint-tool';
import { DEFAULT_STYLE, type PaintArea } from '../src/game/paint';

/** a square of side s at (x, y), counter-clockwise or clockwise */
const square = (x: number, y: number, s: number, cw = false) => cw ? [x, y, x, y + s, x + s, y + s, x + s, y] : [x, y, x + s, y, x + s, y + s, x, y + s];
/** the alpha of an edge image at tile (tx, ty) for a field sampled from (x0, y0) at res */
const alphaAt = (img: EdgeImage | null, x0: number, y0: number, res: number, tx: number, ty: number) => {
  if (!img) return 0;
  const u = Math.floor((tx - x0) * res), v = Math.floor((ty - y0) * res);
  return img.data[(v * img.W + u) * 4 + 3]!;
};

describe('paint edges: the sun and the edge normals', () => {
  it('the sun lies at the screen\'s upper right, so its shadows fall down-left', () => {
    const sx = (SUN_TILE_DIR.x - SUN_TILE_DIR.y) * 64, sy = (SUN_TILE_DIR.x + SUN_TILE_DIR.y) * 32;
    assert.ok(sx > 0 && sy < 0);
    assert.ok(Math.abs(sunFacing(SUN_TILE_DIR.x, SUN_TILE_DIR.y) - 1) < 1e-9);
    assert.ok(Math.abs(sunFacing(-SUN_TILE_DIR.x, -SUN_TILE_DIR.y) + 1) < 1e-9);
  });

  it('edgeNormals point outward whichever way the outline winds', () => {
    for (const cw of [false, true]) {
      const pts = square(10, 10, 4, cw), n = edgeNormals(pts);
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4, mx = (pts[2 * i]! + pts[2 * j]!) / 2, my = (pts[2 * i + 1]! + pts[2 * j + 1]!) / 2;
        // a step out along the normal from the edge's middle leaves the square
        const ox = mx + n[2 * i]! * 0.5, oy = my + n[2 * i + 1]! * 0.5;
        assert.ok(ox < 10 || ox > 14 || oy < 10 || oy > 14, `edge ${i} (${cw ? 'cw' : 'ccw'})`);
        assert.ok(Math.abs(Math.hypot(n[2 * i]!, n[2 * i + 1]!) - 1) < 1e-9);
      }
    }
  });

  it('edgeShade: raised lit toward the sun and dark away, sunken the other way round, nothing side-on', () => {
    assert.deepEqual(edgeShade(1, false), { light: 1, dark: 0 });
    assert.deepEqual(edgeShade(-1, false), { light: 0, dark: 1 });
    assert.deepEqual(edgeShade(1, true), { light: 0, dark: 1 });
    assert.deepEqual(edgeShade(-1, true), { light: 1, dark: 0 });
    assert.deepEqual(edgeShade(0, false), { light: 0, dark: 0 });
    assert.ok(edgeShade(0.5, false).light > 0 && edgeShade(0.5, false).light < 1);
  });
});

describe('paint edges: profiles, widths, resolution', () => {
  it('edgeProfileOf: greens and tees raised, fairways turf, bunkers sunken, water feathers, paving and kerbs crisp', () => {
    assert.equal(edgeProfileOf('green', 'golfGreen'), 'raised');
    assert.equal(edgeProfileOf('tee', 'golfTee'), 'raised');
    assert.equal(edgeProfileOf('fairway', 'golfFairway'), 'turf');
    assert.equal(edgeProfileOf('bunker', 'bunkerSand'), 'sunken');
    assert.equal(edgeProfileOf('water', 'waterDark'), 'water');
    for (const s of ['rough', 'fringe', 'firstCut', 'fescue', 'waste', 'path']) assert.equal(edgeProfileOf(s, 'golfRough'), 'flat');
    assert.equal(edgeProfileOf(null, 'waterClear'), 'water');
    assert.equal(edgeProfileOf(null, 'asphalt'), 'crisp');
    assert.equal(edgeProfileOf(null, 'paving'), 'crisp');
    assert.equal(edgeProfileOf(null, 'dirt', 'kerb'), 'crisp');
    assert.equal(edgeProfileOf(null, 'dirt'), 'flat');
    assert.equal(EDGE_LOOKS.crisp, null);
  });

  it('the looks: water and flat have no bevel or shadow, raised is stronger than turf, sunken casts nothing outside', () => {
    for (const k of ['water', 'flat'] as const) { const l = EDGE_LOOKS[k]!; assert.equal(l.light + l.dark + l.shadow, 0); }
    const r = EDGE_LOOKS.raised!, t = EDGE_LOOKS.turf!, s = EDGE_LOOKS.sunken!;
    assert.ok(r.light > t.light && r.dark > t.dark && r.shadow > t.shadow && r.shadowLen > t.shadowLen);
    assert.ok(s.sunken && s.shadow === 0 && s.dark > 0 && s.light > 0);
  });

  it('featherTiles: about half a tile to a tile at the close and mid zooms, wider (at most 1.5) far out; edgeRes 1..5 and finer when closer', () => {
    for (const k of ['flat', 'water', 'turf', 'raised', 'sunken'] as const) for (const L of [0.6, 0.45, 0.3, 0.2, 0.15]) {
      const f = featherTiles(EDGE_LOOKS[k]!, L);
      // a bunker's sand edge is crisper (its hollow is drawn by the inner shade): a quarter tile and up
      assert.ok(f >= (k === 'sunken' ? 0.25 : 0.4) && f <= 1, `${k} at ${L}: ${f}`);
    }
    assert.ok(featherTiles(EDGE_LOOKS.turf!, 0.035) > featherTiles(EDGE_LOOKS.turf!, 0.3));
    assert.ok(featherTiles(EDGE_LOOKS.turf!, 0.001) <= 1.5);
    let last = 0;
    for (const L of [0.035, 0.07, 0.1, 0.15, 0.2, 0.3, 0.45, 0.6]) { const r = edgeRes(L); assert.ok(r >= 1 && r <= 5 && r >= last); last = r; }
    assert.equal(edgeRes(0.6), 5);
    assert.equal(edgeRes(0.3), 4);
  });

  it('the band weights: feather 0 at the outline to 1 at its width, the rim fades past the feather, the shadow only away from the sun', () => {
    assert.equal(featherAlpha(-0.2, 0.6), 0); assert.equal(featherAlpha(0, 0.6), 0); assert.equal(featherAlpha(0.6, 0.6), 1);
    assert.ok(featherAlpha(0.3, 0.6) > 0.4 && featherAlpha(0.3, 0.6) < 0.6);
    assert.equal(rimWeight(0, 0.6, 0.5), 1); assert.equal(rimWeight(1.1, 0.6, 0.5), 0); assert.equal(rimWeight(-0.1, 0.6, 0.5), 0);
    const r = EDGE_LOOKS.raised!;
    assert.equal(castWeight(-0.3, 0.9, 0.6, r), 0, 'no shadow outside an edge facing the sun');
    assert.ok(castWeight(-0.3, -0.9, 0.6, r) > castWeight(-0.8, -0.9, 0.6, r));
    assert.equal(castWeight(-3, -1, 0.6, r), 0);
    assert.equal(castWeight(-0.3, -1, 0.6, EDGE_LOOKS.sunken!), 0, 'a bunker casts nothing outside');
  });
});

describe('paint edges: the distance field and the images', () => {
  const look = EDGE_LOOKS.raised!, feather = featherTiles(look, 0.6), reach = edgeReach(look, feather), res = 4;
  const pts = square(10, 10, 8), x0 = 6, y0 = 6;
  const f = edgeField(pts, x0, y0, 16, 16, res, reach), im = edgeImages(f, look, feather);
  const dAt = (tx: number, ty: number) => f.d[Math.floor((ty - y0) * res) * f.W + Math.floor((tx - x0) * res)]!;

  it('edgeField: + inside, - outside, the distance to the outline near it, clamped to the reach far from it', () => {
    assert.ok(f.any);
    assert.ok(Math.abs(dAt(14.1, 10.6) - 0.625) < 1e-6, 'a px centre 0.625 inside the top edge');
    assert.ok(Math.abs(dAt(14.1, 9.4) + 0.625) < 1e-6, 'a px centre 0.625 outside the top edge');
    assert.equal(dAt(14.1, 14.1), Math.fround(reach));
    assert.equal(dAt(7.1, 7.1), -Math.fround(reach));
  });

  it('edgeImages: the feather cuts all outside, part in the band, nothing deep inside', () => {
    assert.equal(alphaAt(im.cut, x0, y0, res, 14.1, 9.6), 255);
    const mid = alphaAt(im.cut, x0, y0, res, 14.1, 10 + feather / 2);
    assert.ok(mid > 40 && mid < 215, `band ${mid}`);
    assert.equal(alphaAt(im.cut, x0, y0, res, 14.1, 14.1), 0);
  });

  it('edgeImages: a raised square is lit on its sun-facing edge, dark on the far one, and casts its shadow down-left only', () => {
    // the sun is toward -y (and a little -x): the top edge (y = 10) faces it, the bottom edge (y = 18) faces away
    assert.ok(alphaAt(im.light, x0, y0, res, 14.1, 10.4) > 20);
    assert.equal(alphaAt(im.dark, x0, y0, res, 14.1, 10.4), 0);
    assert.ok(alphaAt(im.dark, x0, y0, res, 14.1, 17.6) > 20);
    assert.equal(alphaAt(im.light, x0, y0, res, 14.1, 17.6), 0);
    assert.ok(alphaAt(im.shadow, x0, y0, res, 14.1, 18.3) > 10, 'shadow outside the edge facing away');
    assert.equal(alphaAt(im.shadow, x0, y0, res, 14.1, 9.7), 0, 'no shadow outside the sun-facing edge');
    assert.equal(alphaAt(im.light, x0, y0, res, 14.1, 14.1) + alphaAt(im.dark, x0, y0, res, 14.1, 14.1), 0, 'nothing deep inside');
  });

  it('edgeImages: a sunken square (bunker) is reversed, a water square only feathers', () => {
    const s = EDGE_LOOKS.sunken!, fs = featherTiles(s, 0.6), si = edgeImages(edgeField(pts, x0, y0, 16, 16, res, edgeReach(s, fs)), s, fs);
    assert.ok(alphaAt(si.dark, x0, y0, res, 14.1, 10.4) > 20, 'shade on the inner edge facing the sun (the lip\'s shadow)');
    assert.ok(alphaAt(si.light, x0, y0, res, 14.1, 17.6) > 20, 'light on the far inner wall');
    assert.equal(si.shadow, null);
    const w = EDGE_LOOKS.water!, fw = featherTiles(w, 0.6), wi = edgeImages(edgeField(pts, x0, y0, 16, 16, res, edgeReach(w, fw)), w, fw);
    assert.ok(wi.cut); assert.equal(wi.light, null); assert.equal(wi.dark, null); assert.equal(wi.shadow, null);
  });

  it('any outline: a concave L shape is inside only where it is filled, and the facing turns smoothly round a rounded corner', () => {
    const L = [0, 0, 10, 0, 10, 4, 4, 4, 4, 10, 0, 10];
    const fl = edgeField(L, -2, -2, 14, 14, 2, 1.5);
    const at = (tx: number, ty: number) => fl.d[Math.floor((ty + 2) * 2) * fl.W + Math.floor((tx + 2) * 2)]!;
    assert.ok(at(2.1, 2.1) > 0 && at(8.1, 2.1) > 0 && at(2.1, 8.1) > 0);
    assert.ok(at(7.1, 7.1) < 0, 'the notch is outside');
    // a circle (many short edges, as a rounded union): the facing outside follows the direction from the centre
    const circle: number[] = []; for (let k = 0; k < 48; k++) { const a = (k / 48) * 2 * Math.PI; circle.push(50 + 6 * Math.cos(a), 50 + 6 * Math.sin(a)); }
    const fc = edgeField(circle, 40, 40, 20, 20, 4, 2);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * 2 * Math.PI + 0.1, tx = 50 + 6.6 * Math.cos(a), ty = 50 + 6.6 * Math.sin(a);
      const i = Math.floor((ty - 40) * 4) * fc.W + Math.floor((tx - 40) * 4);
      assert.ok(Math.abs(fc.sun[i]! - sunFacing(Math.cos(a), Math.sin(a))) < 0.15, `angle ${a.toFixed(2)}`);
    }
  });

  it('cell seams: no feather, bevel or shadow along a cut on a multiple of the cell (the next cell carries on), the outer edge still feathers', () => {
    assert.equal(isCellSeam(200, 5, 200, 30, 200), true);
    assert.equal(isCellSeam(5, 400, 30, 400, 200), true);
    assert.equal(isCellSeam(201, 5, 201, 30, 200), false);
    assert.equal(isCellSeam(200, 5, 210, 30, 200), false);
    assert.equal(isCellSeam(200, 5, 200, 30, 0), false);
    // the left cell of a rectangle cut at x = 200
    const cellPts = [190, 10, 200, 10, 200, 20, 190, 20], fc = edgeField(cellPts, 186, 6, 18, 18, 4, reach, 200), ic = edgeImages(fc, look, feather);
    assert.equal(alphaAt(ic.cut, 186, 6, 4, 199.9, 15.1), 0, 'inside, at the seam: nothing cut');
    assert.equal(alphaAt(ic.cut, 186, 6, 4, 200.1, 15.1), 0, 'outside, past the seam: nothing cut (no dip in the bilinear stretch)');
    assert.equal(alphaAt(ic.light, 186, 6, 4, 199.9, 15.1) + alphaAt(ic.dark, 186, 6, 4, 199.9, 15.1), 0);
    assert.equal(alphaAt(ic.shadow, 186, 6, 4, 200.4, 15.1), 0);
    assert.equal(alphaAt(ic.cut, 186, 6, 4, 195.1, 9.6), 255, 'the outer (top) edge is still feathered');
  });

  it('chunk independence: two boxes side by side sample exactly what one box over both does', () => {
    const whole = edgeImages(edgeField(pts, 6, 6, 16, 16, res, reach), look, feather);
    const left = edgeImages(edgeField(pts, 6, 6, 8, 16, res, reach), look, feather), right = edgeImages(edgeField(pts, 14, 6, 8, 16, res, reach), look, feather);
    for (const [ty, tx] of [[10.4, 10.1], [17.6, 13.9], [18.3, 14.1], [10.2, 17.9]] as const) {
      const part = tx < 14 ? left : right, px0 = tx < 14 ? 6 : 14;
      for (const k of ['cut', 'light', 'dark', 'shadow'] as const) assert.equal(alphaAt(part[k], px0, 6, res, tx, ty), alphaAt(whole[k], 6, 6, res, tx, ty), `${k} at ${tx},${ty}`);
    }
  });

  it('edgeBox: the area box grown by the reach, inside the chunk box, null when they miss', () => {
    assert.deepEqual(edgeBox([10, 10, 18, 18], [0, 0, 100, 100], 1.2), [7, 7, 21, 21]);
    assert.deepEqual(edgeBox([10, 10, 18, 18], [12, 0, 15, 100], 1.2), [12, 7, 15, 21]);
    assert.equal(edgeBox([10, 10, 18, 18], [40, 40, 60, 60], 1.2), null);
  });

  it('bandRamp: a border band\'s inner edge steps evenly from full (b - w/2) to none (b + w/2)', () => {
    const b = 1, f = 0.6, ramp = bandRamp(b, f, 5);
    assert.equal(ramp.length, 5);
    assert.ok(Math.abs(ramp[0]!.half - (b + f / 2)) < 1e-9 && Math.abs(ramp[4]!.half - (b - f / 2)) < 1e-9);
    // the coverage at a depth: 1 - the product of (1 - alpha) over the strokes reaching it, as the canvas lays them
    const cover = (d: number) => 1 - ramp.filter(s => s.half >= d).reduce((p, s) => p * (1 - s.alpha), 1);
    assert.ok(Math.abs(cover(b - f / 2 - 0.01) - 1) < 1e-9);
    assert.equal(cover(b + f / 2 + 0.01), 0);
    for (let k = 0; k < 5; k++) assert.ok(Math.abs(cover(ramp[k]!.half - 1e-6) - (k + 1) / 5) < 1e-9);
    assert.ok(bandRamp(0.25, 0.6).every(s => s.half >= 0 && s.half <= 0.375 + 1e-9), 'a thin band ramps over its own depth');
  });
});

describe('paint edges: the ground patch', () => {
  const base: PaintArea = { id: 7, pts: square(0, 0, 10), ...DEFAULT_STYLE };
  it('PaintTool.patch carries the edge profile from the brush kind or the texture, and nothing for crisp paving', () => {
    assert.equal(PaintTool.patch(base).paint?.e, undefined);
    assert.equal(PaintTool.patch({ ...base, tex: 'golfGreen', kind: 'green' }).paint?.e, 'raised');
    assert.equal(PaintTool.patch({ ...base, tex: 'golfFairway' }).paint?.e, 'turf');
    assert.equal(PaintTool.patch({ ...base, tex: 'bunkerSand' }).paint?.e, 'sunken');
    assert.equal(PaintTool.patch({ ...base, tex: 'waterDark' }).paint?.e, 'water');
    assert.equal(PaintTool.patch({ ...base, tex: 'dirt', border: 1, btex: 'kerb' }).paint?.e, undefined);
    assert.equal(PaintTool.patch({ ...base, tex: 'dirt' }).paint?.e, 'flat');
  });
});
