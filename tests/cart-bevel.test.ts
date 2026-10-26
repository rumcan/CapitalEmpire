// The cart paths' sun bevel lines up with the paths (T139). The ground painter bakes the ground in chunks; each cart path's light rim, shade
// rim and the slabs' cast shade (cart-bevel.ts) are drawn here on a software raster (tests/helpers/soft-raster.ts) for
// every chunk a path crosses, at the closest and a far cache level, and each pixel is checked against the path's own surface, the network's
// features: a lit pixel lies within the rim's depth of an edge facing the sun, a shaded one of an edge facing away, the rims run the whole
// length of those edges, and the cast is the surface stepped at 145°. The paths cross the chunks' seams along and across them, bend and fork
// at a chunk corner. T084 slid the chunk's mask by a pixel offset instead, which drew a bevel bar across a path at every chunk seam (the
// owner's screenshot, 2026-10-26); the last test shows the checks catch it. Headless: npm test (no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HH, HW } from '../src/game/iso';
import { CART_CAST, CART_RIM, CART_SURFACE, cartCast, cartRim, drawPaths, fromSun, type Affine } from '../src/game/cart-bevel';
import { SUN_TILE_DIR } from '../src/game/ext/course-height';
import { CLASS, RoadNetwork, type BBox, type ClassId, type Feature, type Leg, type Pt } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { Raster, SoftCtx, alphaOf, boxOf, chunk, chunksOver, covers, join } from './helpers/soft-raster';

/** one chunk's bake of a surface kind's bevel: the paths' mask, the two rims and the cast, as the painter draws them */
type RimDraw = (g: SoftCtx, m: Raster, feats: readonly Feature[], M: Affine, W: number, H: number, s: number) => void;
const fixedRim: RimDraw = (g, m, feats, M, W, H, s) => cartRim(g, m, feats, M, W, H, '#fff', s);
/** T084's rim: the chunk's mask slid by the pixel offset of a (0, s) tile step, with drawImage */
const slidRim: RimDraw = (g, m, _feats, M, W, H, s) => {
  g.drawImage(m, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-out'; g.drawImage(m, M.c * s, M.d * s); g.globalCompositeOperation = 'source-over';
};

/** a layout: its legs, and its straight runs (from, to) whose middles are checked for a whole rim on both long edges */
interface Layout { name: string; legs: Leg[]; runs: [Pt, Pt][] }
const P = (x: number, y: number): Pt => ({ x, y }), leg = (a: Pt, b: Pt): Leg => ({ a, b });
// every layout meets the corner of four ground chunks, tile (1031.25, 1000): the seams x - y = 31.25 (screen-vertical) and x + y = 2031.25
// (screen-horizontal) cross the paths, or run along inside them
const LAYOUTS: Layout[] = [
  { name: 'a straight run along x', legs: [leg(P(1024.3, 1000.2), P(1038.3, 1000.2))], runs: [[P(1024.3, 1000.2), P(1038.3, 1000.2)]] },
  { name: 'a straight run along y', legs: [leg(P(1031.4, 993.1), P(1031.4, 1007.1))], runs: [[P(1031.4, 993.1), P(1031.4, 1007.1)]] },
  { name: 'a run down the screen, along a seam', legs: [leg(P(1025.3, 994.1), P(1037.3, 1006.1))], runs: [[P(1025.3, 994.1), P(1037.3, 1006.1)]] },
  { name: 'a run across the screen, along a seam', legs: [leg(P(1025.3, 1006.1), P(1037.3, 994.1))], runs: [[P(1025.3, 1006.1), P(1037.3, 994.1)]] },
  { name: 'a bend', legs: [leg(P(1024.3, 1000.2), P(1031.4, 1000.2)), leg(P(1031.4, 1000.2), P(1031.4, 1007.3))], runs: [] },
  { name: 'a spur toward the sun', legs: [leg(P(1024.3, 1000.2), P(1031.4, 1000.2)), leg(P(1031.4, 1000.2), P(1038.3, 1000.2)), leg(P(1031.4, 1000.2), P(1031.4, 993.3))], runs: [] },
];
/** the bevelled cart path classes: their surfaces have a painted look with rims */
const BEVELLED = (['cart-walk', 'cart-dirt', 'cart-slab', 'cart'] as const).filter(id => CART_SURFACE.has(CLASS[id]!.tex));
const LEVELS_CHECKED = [0.6, 0.15];

/** the surface kind's features as the painter gets them for chunk c (renderer.ts paint: the view round the chunk, the visible asphalt) */
function featsFor(net: RoadNetwork, tex: string, box: BBox) {
  const vis = (b: BBox) => b[2] >= box[0] && b[0] <= box[2] && b[3] >= box[1] && b[1] <= box[3];
  return net.view([box[0] - 8, box[1] - 8, box[2] + 8, box[3] + 8], false).asphF.filter(f => vis(f.bbox) && f.tex === tex);
}
function netOf(id: ClassId, legs: Leg[]) { const e = new NetEditor(new RoadNetwork()); e.addLegs(legs, CLASS[id]!, 0); e.commit(true); return e.net; }

/** the pixels where one class's bevel leaves its surface, over every chunk a layout reaches, at cache level L: stray lit or shaded pixels (not
 *  within the rim's depth of an edge facing toward, or away from, the sun), gaps in a rim along a straight run's edge, and cast pixels off the
 *  stepped surface; a few of each, with the chunk and the place */
function bevelFaults(id: ClassId, lay: Layout, L: number, rim: RimDraw) {
  const cls = CLASS[id]!, net = netOf(id, lay.legs), sun = SUN_TILE_DIR, look = CART_SURFACE.get(cls.tex)!;
  // the surface: the whole path's features, whichever chunk they fall in
  const all = net.view([900, 900, 1200, 1200], false).asphF.filter(f => f.tex === cls.tex), boxes = all.map(boxOf);
  const on = (x: number, y: number) => covers(all, boxes, x, y);
  const b = boxes.reduce((p, q) => [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[2], q[2]), Math.max(p[3], q[3])]);
  // px per tile along the sun's ground direction; the checks allow half a pixel of sampling
  const tol = 0.5 / (L * Math.hypot(HW * (sun.x - sun.y), HH * (sun.x + sun.y))), cast = fromSun(CART_CAST);
  const faults: string[] = []; let chunks = 0, litPx = 0, shadePx = 0, atBorder = 0;
  /** a fault at pixel (x, y) of a W x H chunk: the first few kept as text, and those within 6 px of the chunk's border counted */
  const note = (what: string, i: number, j: number, p: Pt, x: number, y: number, W: number, H: number) => {
    if (x < 6 || y < 6 || x >= W - 6 || y >= H - 6) atBorder++;
    if (faults.length < 6) faults.push(`${what} in chunk ${i},${j} at tile (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
  };
  for (const [i, j] of chunksOver(b)) {
    const { M, W, H, box } = chunk(i, j, L), feats = featsFor(net, cls.tex, box); if (!feats.length) continue;
    chunks++;
    const m = new Raster(W, H); drawPaths(new SoftCtx(m), feats, M);
    const lit = new Raster(W, H), shade = new Raster(W, H); rim(new SoftCtx(lit), m, feats, M, W, H, CART_RIM); rim(new SoftCtx(shade), m, feats, M, W, H, -CART_RIM);
    const det = M.a * M.d - M.b * M.c, tileAt = (x: number, y: number): Pt => { const X = x + 0.5 - M.e, Y = y + 0.5 - M.f; return { x: (M.d * X - M.c * Y) / det, y: (M.a * Y - M.b * X) / det }; };
    /** whether the surface ends within depth (plus the tolerance) of p, looking dir (+1 toward the sun, -1 away) */
    const nearEdge = (p: Pt, dir: number, depth: number) => { for (let t = 0; t <= depth + tol + 1e-9; t += tol / 4) if (!on(p.x + dir * sun.x * t, p.y + dir * sun.y * t)) return true; return false; };
    for (const [r, dir, what] of [[lit, 1, 'a light rim pixel off the sun-facing edges'], [shade, -1, 'a shade rim pixel off the edges facing away']] as const) {
      const bb = r.bb; if (!bb) continue;
      for (let y = bb[1]; y < bb[3]; y++) for (let x = bb[0]; x < bb[2]; x++) {
        if (r.a[y * W + x]! <= 0.5) continue;
        if (dir > 0) litPx++; else shadePx++;
        const p = tileAt(x, y); if (!nearEdge(p, dir, CART_RIM)) note(what, i, j, p, x, y, W, H);
      }
    }
    // the rims run the whole length of a straight run's long edges, away from its ends (the end bulbs and their own rims)
    for (const [A, B] of lay.runs) {
      const len = Math.hypot(B.x - A.x, B.y - A.y), u = { x: (B.x - A.x) / len, y: (B.y - A.y) / len }, margin = cls.h + cls.bulb + 0.6;
      const mb = m.bb; if (!mb) continue;
      for (let y = mb[1]; y < mb[3]; y++) for (let x = mb[0]; x < mb[2]; x++) {
        if (m.a[y * W + x]! <= 0.5) continue;
        const p = tileAt(x, y), s = (p.x - A.x) * u.x + (p.y - A.y) * u.y; if (s < margin || s > len - margin) continue;
        for (const [r, dir, what] of [[lit, 1, 'a gap in the light rim'], [shade, -1, 'a gap in the shade rim']] as const) {
          const t = CART_RIM - tol; if (t <= 0) continue;
          if (!on(p.x + dir * sun.x * t, p.y + dir * sun.y * t) && r.a[y * W + x]! <= 0.5) note(what, i, j, p, x, y, W, H);
        }
      }
    }
    // the cast: the surface stepped CART_CAST from the sun, wherever the stepped surface is plain (not within the tolerance of its edge)
    if (look.cast) {
      const c = new Raster(W, H), ca = alphaOf(look.cast); cartCast(new SoftCtx(c), feats, M, W, H, look.cast);
      const reach = join(c.bb, m.bb); if (!reach) continue;
      for (let y = Math.max(0, reach[1] - 8); y < Math.min(H, reach[3] + 8); y++) for (let x = Math.max(0, reach[0] - 8); x < Math.min(W, reach[2] + 8); x++) {
        const p = tileAt(x, y), q = { x: p.x - cast.x, y: p.y - cast.y }, inside = on(q.x, q.y);
        if ([[tol, 0], [-tol, 0], [0, tol], [0, -tol]].some(([dx, dy]) => on(q.x + dx!, q.y + dy!) !== inside)) continue;
        if ((c.a[y * W + x]! > ca / 2) !== inside) note(inside ? 'a gap in the cast shade' : 'a stray cast shade pixel', i, j, p, x, y, W, H);
      }
    }
  }
  return { faults, chunks, litPx, shadePx, atBorder };
}

test('every bevelled cart path class: the dirt walking path, the dirt path and the cement slabs (the paved path has no bevel)', () => {
  assert.deepEqual(BEVELLED, ['cart-walk', 'cart-dirt', 'cart-slab']);
  assert.ok(!CART_SURFACE.has(CLASS.cart!.tex), 'the paved cart path is drawn as asphalt, with the plain roads\' soft edge');
});

test('the bevel steps along the sun\'s ground direction: the light rim on the edges facing the upper right, the cast and shade at 145°', () => {
  const s = fromSun(1), sx = (s.x - s.y) * HW, sy = (s.x + s.y) * HH;
  assert.ok(Math.abs(Math.atan2(sy, sx) * 180 / Math.PI - 145) < 1e-6, 'a step from the sun points 145° on screen');
});

for (const id of BEVELLED) for (const lay of LAYOUTS) {
  test(`${id}, ${lay.name}: the light rim, the shade rim and the cast line up with the path in every chunk it crosses`, () => {
    for (const L of LEVELS_CHECKED) {
      const { faults, chunks, litPx, shadePx } = bevelFaults(id, lay, L, fixedRim);
      assert.ok(chunks >= 2, `${lay.name} crosses a chunk seam (${chunks} chunks)`);
      assert.ok(litPx > 0 && shadePx > 0, `at L ${L} the path has both rims (${litPx} lit, ${shadePx} shaded px)`);
      assert.deepEqual(faults, [], `at cache level ${L}`);
    }
  });
}

test('the checks catch T084\'s slid mask: a bevel bar along the chunk\'s border, across the path wherever it crosses a seam', () => {
  for (const id of BEVELLED) for (const lay of LAYOUTS) for (const L of LEVELS_CHECKED) {
    const { faults, atBorder } = bevelFaults(id, lay, L, slidRim);
    assert.ok(atBorder > 0 && faults.some(f => f.includes('rim pixel off')), `${id}, ${lay.name} at L ${L}: ${faults.join('; ') || 'no fault found'}`);
  }
});
