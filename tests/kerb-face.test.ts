// The town roads' kerb face lines up with the roads across the ground chunks' borders (T140). The ground painter bakes the ground in chunks;
// each kerbed road's face (kerb-face.ts) is drawn here on a software raster (tests/helpers/soft-raster.ts) for every chunk a road reaches, at
// three cache levels, and each pixel is checked against the roads' own surface, the network's features: the face covers exactly the ground
// that lies above a road edge on screen, within the face's height (the road shifted up the screen by it, less the road), and its three tones
// sit at their shares of that height (the top tone above, the foot's next to the road). The roads cross the chunks' seams along and across
// them, run along a seam with their far kerb on it, bend, fork, cross and end at a chunk corner. Before T140 the face slid the chunk's own
// road mask up the screen with drawImage, and the slid copy came in empty along the chunk's bottom edge: the face was missing there for its
// own height; the last test shows the checks catch it. Headless: npm test (no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawPaths, type Affine } from '../src/game/cart-bevel';
import { FACE_CUTS, FACE_WORLD, faceShift, kerbFace, stepReach, upScreen } from '../src/game/kerb-face';
import { CLASS, RoadNetwork, type BBox, type Feature, type Leg, type Pt } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { Raster, SoftCtx, boxOf, chunk, chunksOver, covers, styleOf, tileAtPx } from './helpers/soft-raster';

/** the face's three tones for the checks (top, middle, foot), far apart in the raster's colour channel */
const BANDS = ['rgb(255,0,0)', 'rgb(150,0,0)', 'rgb(50,0,0)'] as const, BAND_V = BANDS.map(b => styleOf(b).v);
const BAND_NAME = ['top', 'middle', 'foot'];
/** one chunk's face as the painter draws it into g, a cleared W x H buffer, from the chunk's kerbed features */
type FaceDraw = (g: SoftCtx, feats: readonly Feature[], M: Affine, W: number, H: number, shift: number) => void;
const fixedFace: FaceDraw = (g, feats, M, _W, _H, shift) => kerbFace(g, feats, M, shift, BANDS);
/** the face before T140 (renderer.ts step 4): the chunk's road mask slid up the screen by the face's height with drawImage, less the mask,
 *  in the top tone; each lower tone through the mask slid up by its share of the height */
const slidFace: FaceDraw = (g, feats, M, W, H, shift) => {
  const m = new Raster(W, H); drawPaths(new SoftCtx(m), feats, M);
  g.drawImage(m, 0, -shift); g.globalCompositeOperation = 'destination-out'; g.drawImage(m, 0, 0);
  g.globalCompositeOperation = 'source-in'; g.fillStyle = BANDS[0]; g.fillRect(0, 0, W, H);
  for (const [col, k] of [[BANDS[1], FACE_CUTS[0]], [BANDS[2], FACE_CUTS[1]]] as const) {
    const t = new Raster(W, H), tg = new SoftCtx(t); tg.drawImage(m, 0, -shift * k); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = col; tg.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-atop'; g.drawImage(t, 0, 0);
  }
  g.globalCompositeOperation = 'source-over';
};

/** a layout of street legs, and whether a far kerb's face crosses a chunk's bottom edge (where the slid face had its gap) */
interface Layout { name: string; legs: Leg[]; seam: boolean }
const P = (x: number, y: number): Pt => ({ x, y }), leg = (a: Pt, b: Pt): Leg => ({ a, b });
// every layout meets the corner of four ground chunks, tile (1031.25, 1000): the seams x - y = 31.25 (screen-vertical) and x + y = 2031.25
// (screen-horizontal, the bottom edge of the chunks above it) cross the roads, or run along them
const LAYOUTS: Layout[] = [
  { name: 'a straight run along x', legs: [leg(P(1024.3, 1000.2), P(1038.3, 1000.2))], seam: true },
  { name: 'a straight run along y', legs: [leg(P(1031.4, 993.1), P(1031.4, 1007.1))], seam: true },
  { name: 'a run down the screen, along a seam', legs: [leg(P(1025.3, 994.1), P(1037.3, 1006.1))], seam: false },
  { name: 'a run across the screen, its far kerb on a seam', legs: [leg(P(1026.4, 1007.25), P(1038.4, 995.25))], seam: true },
  { name: 'a bend', legs: [leg(P(1024.3, 1000.2), P(1031.4, 1000.2)), leg(P(1031.4, 1000.2), P(1031.4, 1007.3))], seam: true },
  { name: 'a junction, its spur up the screen', legs: [leg(P(1024.3, 1000.2), P(1031.4, 1000.2)), leg(P(1031.4, 1000.2), P(1038.3, 1000.2)), leg(P(1031.4, 1000.2), P(1031.4, 993.3))], seam: true },
  { name: 'a crossing', legs: [leg(P(1024.3, 1000.2), P(1031.4, 1000.2)), leg(P(1031.4, 1000.2), P(1038.3, 1000.2)), leg(P(1031.4, 993.3), P(1031.4, 1000.2)), leg(P(1031.4, 1000.2), P(1031.4, 1007.1))], seam: true },
  { name: 'a dead end', legs: [leg(P(1021.3, 1000.2), P(1031.4, 1000.2))], seam: true },
];
const LEVELS_CHECKED = [0.6, 0.3, 0.15];
const ID = 'street';

function netOf(legs: Leg[]) { const e = new NetEditor(new RoadNetwork()); e.addLegs(legs, CLASS[ID]!, 0); e.commit(true); return e.net; }
const reaches = (b: BBox, box: BBox) => b[2] >= box[0] && b[0] <= box[2] && b[3] >= box[1] && b[1] <= box[3];

/** the pixels where the face leaves the roads' edges, over every chunk a layout reaches, at cache level L: a gap in the face, a stray face
 *  pixel, a tone out of its band; a few of each with the chunk and the place, and how many lie within 6 px of the chunk's bottom edge. A
 *  pixel counts only where the surface is plain within half a pixel up and down the screen of each point the check looks at (the slid face
 *  blends a pixel's rows there) */
function faceFaults(lay: Layout, L: number, draw: FaceDraw) {
  const net = netOf(lay.legs), all = net.view([900, 900, 1200, 1200], false).asphF.filter(f => f.kerb), boxes = all.map(boxOf);
  assert.ok(all.length, `${lay.name}: kerbed features`);
  const b = boxes.reduce((p, q) => [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[2], q[2]), Math.max(p[3], q[3])]);
  const shift = faceShift(L), faults: string[] = [];
  let chunks = 0, faced = 0, facePx = 0, atBottom = 0;
  for (const [i, j] of chunksOver([b[0] - 1, b[1] - 1, b[2] + 1, b[3] + 1])) {
    const { M, W, H, box } = chunk(i, j, L), up = upScreen(M, shift);
    // the chunk's kerbed features as the painter takes them (renderer.ts step 4: the view round the chunk, those whose face reaches it)
    const feats = net.view([box[0] - 8, box[1] - 8, box[2] + 8, box[3] + 8], false).asphF.filter(f => f.kerb && reaches(stepReach(f.bbox, up), box));
    if (!feats.length) continue;
    chunks++;
    const r = new Raster(W, H); draw(new SoftCtx(r), feats, M, W, H, shift);
    // the pixels to check: the surface's box on screen, grown by the face's height
    const xs = [b[0] - b[3], b[2] - b[1]].map(v => v * M.a + M.e), ys = [b[0] + b[1], b[2] + b[3]].map(v => v * M.b + M.f);
    const x0 = Math.max(0, Math.floor(xs[0]!) - 2), x1 = Math.min(W, Math.ceil(xs[1]!) + 2), y0 = Math.max(0, Math.floor(ys[0]! - shift) - 2), y1 = Math.min(H, Math.ceil(ys[1]!) + 2);
    const note = (what: string, x: number, y: number) => {
      if (y >= H - 6) atBottom++;
      if (faults.length < 6) { const p = tileAtPx(M, x, y); faults.push(`${what} in chunk ${i},${j} at tile (${p.x.toFixed(2)}, ${p.y.toFixed(2)}), px (${x}, ${y})`); }
    };
    let px = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      /** whether the road lies dy px below the pixel's centre on screen, and whether that is plain within half a pixel up and down */
      const road = (dy: number) => { const p = tileAtPx(M, x, y, dy); return covers(all, boxes, p.x, p.y); };
      const plain = (dy: number) => road(dy - 0.5) === road(dy + 0.5);
      const k = y * W + x, alpha = r.a[k]!, face = road(shift) && !road(0);
      if ((alpha > 0.5) !== face) { if (plain(0) && plain(shift)) note(face ? 'a gap in the kerb face' : 'a stray kerb face pixel', x, y); continue; }
      if (!face) continue;
      px++;
      const v = r.v[k]! / alpha, got = BAND_V.reduce((best, bv, n) => Math.abs(bv - v) < Math.abs(BAND_V[best]! - v) ? n : best, 0);
      const want = road(shift * FACE_CUTS[1]) ? 2 : road(shift * FACE_CUTS[0]) ? 1 : 0;
      if (got !== want && plain(shift * FACE_CUTS[0]) && plain(shift * FACE_CUTS[1])) note(`the face's ${BAND_NAME[got]} tone where its ${BAND_NAME[want]} tone belongs`, x, y);
    }
    if (px) faced++;
    facePx += px;
  }
  return { faults, chunks, faced, facePx, atBottom };
}

test('the face stands straight up the screen, FACE_WORLD world px tall (a pixel at least)', () => {
  for (const L of [0.6, 0.15, 0.07, 0.015]) {
    const { M } = chunk(3, 70, L), s = faceShift(L), u = upScreen(M, s);
    assert.equal(s, Math.max(1, FACE_WORLD * L));
    assert.ok(Math.abs(M.a * u.x + M.c * u.y) < 1e-9 && Math.abs(M.b * u.x + M.d * u.y + s) < 1e-9, `at L ${L} the step moves ${s} px up the screen`);
  }
  assert.deepEqual(stepReach([10, 20, 30, 40], { x: -0.5, y: -0.25 }), [9.5, 19.75, 30, 40]);
});

for (const lay of LAYOUTS) {
  test(`a street, ${lay.name}: the kerb face and its tones line up with the road in every chunk it reaches`, () => {
    for (const L of LEVELS_CHECKED) {
      const { faults, chunks, faced, facePx } = faceFaults(lay, L, fixedFace);
      assert.ok(chunks >= 2, `${lay.name} reaches across a chunk seam (${chunks} chunks)`);
      assert.ok(facePx > 0, `at L ${L} the road has a kerb face`);
      if (lay.seam) assert.ok(faced >= 2, `at L ${L} the face crosses a chunk seam (in ${faced} chunks)`);
      assert.deepEqual(faults, [], `at cache level ${L}`);
    }
  });
}

test('the checks catch the slid face: a gap at the chunk\'s bottom edge wherever a far kerb crosses it', () => {
  for (const lay of LAYOUTS.filter(l => l.seam)) for (const L of LEVELS_CHECKED) {
    const { faults, atBottom } = faceFaults(lay, L, slidFace);
    assert.ok(atBottom > 0 && faults.some(f => f.includes('a gap in the kerb face')), `${lay.name} at L ${L}: ${faults.join('; ') || 'no fault found'}`);
  }
});
