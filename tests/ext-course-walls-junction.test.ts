/** Tests for T137 (#261): where three course surfaces meet (a green, a pond or a bunker, and the rough) the walls close cleanly. T099's
 * walls ended there in a sliver about a pixel wide, a gap the water showed through, or a step in height: the pit's far wall was carried by
 * the green's edge and the fringe's edge in turn, which met the rim only roughly; every run that began at a change of kind started with a
 * few-mm piece hanging the old side's drop; and the sides sampled near the junction flickered between the neighbours, leaving crumbs. Each
 * scene has the pit on the green's near side, so both junctions lie on its far rim, where its wall shows, with round, diagonal and stepped
 * boundaries (pure, Node). Tile units; drops in metres; screen down is the tile direction (1, 1). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOB_STYLE, chunkOutlines } from '../src/game/ext/course-blobs/index.js';
import { makeGrid, fillPolygon, SURF } from '../src/game/ext/course-grid/index.js';
import type { Grid } from '../src/game/ext/course-grid/index.js';
import { chunkWalls, coversOf, layerCode, type WallRun } from '../src/game/ext/course-walls/index.js';

const { rough: ROUGH, water: WATER, tee: TEE, bunker: BUNKER, green: GREEN } = SURF;
type Pt = { x: number; y: number };
/** the shortest wall run allowed, tiles (0.5 m: a few px at 30% zoom; ext/course-walls MIN_RUN) */
const MIN_PIECE = 0.25;

/** a grid of 256 x 256 cells (128 x 128 tiles) with rough over the middle */
function base(): Grid {
  const g = makeGrid(0, 0, 256, 256);
  fillPolygon(g, [{ x: 4, y: 4 }, { x: 124, y: 4 }, { x: 124, y: 124 }, { x: 4, y: 124 }], ROUGH, 1, 0);
  return g;
}
const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 40): Pt[] => Array.from({ length: n }, (_, k) => ({ x: cx + rx * Math.cos((2 * Math.PI * k) / n), y: cy + ry * Math.sin((2 * Math.PI * k) / n) }));
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
/** a staircase from (x0, y0) along x then down y in steps of `step` tiles to the diagonal x + y = x0 + y0 + span, closed back over the far corner */
function stairs(x0: number, y0: number, span: number, step: number): Pt[] {
  const p: Pt[] = [{ x: x0, y: y0 }, { x: x0 + span, y: y0 }];
  for (let k = 1, x = x0 + span; x > x0; k++) { p.push({ x, y: y0 + k * step }); x -= step; p.push({ x, y: y0 + k * step }); }
  return p;
}
/** the walls of chunk (cx, cy) (size tiles), exactly as the chunk patches make them, and the pit's own drawn edges */
function scene(g: Grid, pit: number, cx = 0, cy = 0, size = 128) {
  const outs = chunkOutlines(g, cx, cy, size, BLOB_STYLE, true), K = coversOf(outs);
  const cw = chunkWalls(g, outs.flatMap(o => [{ code: layerCode(o.surf, false), edges: o.edges }, ...(o.collar ? [{ code: layerCode(o.surf, true), edges: o.collar.edges }] : [])]), K);
  return { walls: cw.walls, rim: outs.find(o => o.surf === pit)?.edges ?? [] };
}
const pts = (w: WallRun) => Array.from({ length: w.p.length / 3 }, (_, i) => ({ x: w.p[3 * i]!, y: w.p[3 * i + 1]!, dh: w.p[3 * i + 2]! }));
const runLength = (w: WallRun) => { const q = pts(w); let s = 0; for (let i = 1; i < q.length; i++) s += Math.hypot(q[i]!.x - q[i - 1]!.x, q[i]!.y - q[i - 1]!.y); return s; };
/** the distance from p to a run's top edge, and whether the nearest point is within `end` tiles of one of its ends */
function near(p: Pt, w: WallRun, end: number): { d: number; atEnd: boolean } {
  const q = pts(w), L = runLength(w); let best = Infinity, at = 0;
  for (let i = 1, s = 0; i < q.length; i++) {
    const a = q[i - 1]!, b = q[i]!, dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy, l = Math.sqrt(l2);
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0, d = Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
    if (d < best) { best = d; at = s + t * l; }
    s += l;
  }
  return { d: best, atEnd: at < end || at > L - end };
}

/** every check of a clean junction on one scene; label names it in the messages */
function clean(label: string, g: Grid, pit: number) {
  const { walls, rim } = scene(g, pit), lo = layerCode(pit, false), pitWalls = walls.filter(w => w.lo === lo);
  assert.ok(pitWalls.length > 0, `${label}: the pit has its far wall`);
  // 1. no crumbs: no run of wall shorter than MIN_PIECE (a pixel-wide sliver at 30% zoom)
  for (const w of walls) assert.ok(runLength(w) >= MIN_PIECE, `${label}: a wall run only ${runLength(w).toFixed(3)} tiles long (lo ${w.lo}, hs ${w.hs}) at (${w.p[0]!.toFixed(2)}, ${w.p[1]!.toFixed(2)})`);
  // 2. the pit's far rim (its face toward the camera) is walled all along, by one wall: no gap the water or the sand shows through, no
  //    double wall
  let samples = 0;
  for (const e of rim) for (let i = 2; i + 1 < e.length; i += 2) {
    const ax = e[i - 2]!, ay = e[i - 1]!, bx = e[i]!, by = e[i + 1]!, l = Math.hypot(bx - ax, by - ay); if (l < 1e-9) continue;
    const nx = (by - ay) / l, ny = -(bx - ax) / l; // outward, the pit on the left of travel
    if ((nx + ny) * Math.SQRT1_2 > -0.35) continue; // not clearly the far rim
    for (let s = 0.01; s < l; s += 0.02) {
      const p = { x: ax + ((bx - ax) * s) / l, y: ay + ((by - ay) * s) / l }, hits = pitWalls.map(w => near(p, w, 0.05)).filter(h => h.d < 0.03);
      samples++;
      assert.ok(hits.length > 0, `${label}: a gap in the far wall at (${p.x.toFixed(3)}, ${p.y.toFixed(3)})`);
      assert.ok(hits.filter(h => !h.atEnd).length <= 1, `${label}: a double wall at (${p.x.toFixed(3)}, ${p.y.toFixed(3)})`);
    }
  }
  assert.ok(samples > 50, `${label}: the far rim was sampled (${samples})`);
  // 3. no step in height: each run ends square at its own drop (no end hanging its neighbour's), its drop changes only gradually along it
  //    (a change of the ground above the rim is eased over that ground's bank), and two runs that meet at a corner meet at the same drop
  for (const w of walls) {
    const q = pts(w), n = q.length;
    assert.ok(Math.abs(q[0]!.dh - q[1]!.dh) < 0.02 && Math.abs(q[n - 1]!.dh - q[n - 2]!.dh) < 0.02, `${label}: a run's end steps (${q[0]!.dh.toFixed(2)}/${q[1]!.dh.toFixed(2)} .. ${q[n - 2]!.dh.toFixed(2)}/${q[n - 1]!.dh.toFixed(2)}) at (${q[0]!.x.toFixed(2)}, ${q[0]!.y.toFixed(2)})`);
    for (let i = 1; i < n; i++) {
      const dd = Math.abs(q[i]!.dh - q[i - 1]!.dh), ds = Math.hypot(q[i]!.x - q[i - 1]!.x, q[i]!.y - q[i - 1]!.y);
      assert.ok(dd < 0.02 || dd <= 1.6 * ds, `${label}: the drop steps by ${dd.toFixed(2)} m over ${ds.toFixed(3)} tiles at (${q[i]!.x.toFixed(2)}, ${q[i]!.y.toFixed(2)})`);
    }
  }
  for (const a of walls) for (const b of walls) if (a !== b && a.m === b.m) for (const ea of [pts(a)[0]!, pts(a).at(-1)!]) for (const eb of [pts(b)[0]!, pts(b).at(-1)!]) {
    if (Math.hypot(ea.x - eb.x, ea.y - eb.y) < 1e-6) assert.ok(Math.abs(ea.dh - eb.dh) < 0.02, `${label}: two walls meet at (${ea.x.toFixed(2)}, ${ea.y.toFixed(2)}) at ${ea.dh.toFixed(2)} and ${eb.dh.toFixed(2)} m`);
  }
  return walls;
}

test('1. a green, a pond on its near side and the rough: the pond\'s far wall runs on round the rim in one piece', () => {
  const g = base(); fillPolygon(g, ellipse(33, 33, 6, 5), GREEN, 1, 0); fillPolygon(g, ellipse(37, 40, 7, 3.5), WATER, 1, 0);
  const ws = clean('round pond', g, WATER), pond = ws.filter(w => w.lo === layerCode(WATER, false));
  assert.equal(pond.length, 1, 'one wall round the far rim');
  const dh = pts(pond[0]!).map(p => p.dh), deep = 0.25 + 0.8;
  assert.ok(Math.max(...dh) > deep - 0.01 && Math.min(...dh) < 0.8 + 0.01, `from the green's height (${deep} m) to the rough's (0.8 m): ${Math.min(...dh).toFixed(2)}..${Math.max(...dh).toFixed(2)}`);
});

test('2. a green, a bunker cut into its near side and the rough', () => {
  const g = base(); fillPolygon(g, ellipse(33, 33, 6, 5), GREEN, 1, 0); fillPolygon(g, ellipse(37, 39, 3, 2), BUNKER, 1, 0);
  clean('round bunker', g, BUNKER);
});

test('3. diagonal boundaries: a green cut off along a diagonal, a pond or a bunker across it', () => {
  for (const pit of [WATER, BUNKER]) {
    const g = base(); fillPolygon(g, rect(30, 34, 46, 44), pit, 1, 0); fillPolygon(g, [{ x: 20, y: 20 }, { x: 50, y: 20 }, { x: 20, y: 50 }], GREEN, 1, 0);
    clean(`diagonal ${pit === WATER ? 'pond' : 'bunker'}`, g, pit);
    // the other diagonal: the boundary runs down the screen
    const h = base(); fillPolygon(h, rect(30, 22, 44, 38), pit, 1, 0); fillPolygon(h, [{ x: 16, y: 20 }, { x: 36, y: 20 }, { x: 52, y: 36 }, { x: 16, y: 36 }].map(p => ({ x: p.x, y: p.y })), GREEN, 1, 0);
    clean(`steep diagonal ${pit === WATER ? 'pond' : 'bunker'}`, h, pit);
  }
});

test('4. stepped boundaries: a green with a staircase edge (cell steps and 2 m steps), a pond or a bunker across it', () => {
  for (const pit of [WATER, BUNKER]) for (const step of [0.5, 1]) {
    const g = base(); fillPolygon(g, rect(28, 30, 48, 46), pit, 1, 0); fillPolygon(g, stairs(18, 18, 28, step), GREEN, 1, 0);
    clean(`stepped ${step} ${pit === WATER ? 'pond' : 'bunker'}`, g, pit);
  }
});

test('5. a junction across a chunk corner: the cut walls still meet end to end at the border with the same drop', () => {
  const g = base(); fillPolygon(g, ellipse(62, 61, 6, 5), GREEN, 1, 0); fillPolygon(g, ellipse(64, 66.5, 6, 3), WATER, 1, 0);
  const parts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([cx, cy]) => ({ cx: cx!, cy: cy!, ws: scene(g, WATER, cx!, cy!, 64).walls }));
  let ends = 0;
  for (const { cx, cy, ws } of parts) for (const w of ws) for (const e of [pts(w)[0]!, pts(w).at(-1)!]) {
    if (Math.abs(e.x - 64) > 1e-9 && Math.abs(e.y - 64) > 1e-9) continue;
    ends++;
    const other = parts.filter(q => q.cx !== cx || q.cy !== cy).flatMap(q => q.ws.flatMap(v => [pts(v)[0]!, pts(v).at(-1)!]));
    assert.ok(other.some(o => o.x === e.x && o.y === e.y && Math.abs(o.dh - e.dh) < 1e-9), `a border end (${e.x.toFixed(3)}, ${e.y.toFixed(3)}, ${e.dh.toFixed(3)}) meets its neighbour's`);
  }
  assert.ok(ends >= 2, `walls cross the borders (${ends} border ends)`);
});

test('6. nothing else moves: a tee alone on the rough, and a green alone, give the walls they gave before (one run each, full height)', () => {
  const g = base(); fillPolygon(g, rect(26, 29, 38, 35), TEE, 1, 0);
  const tw = scene(g, TEE).walls;
  assert.equal(tw.length, 1, 'one run round the tee');
  for (const p of pts(tw[0]!)) assert.ok(Math.abs(p.dh - 0.6) < 1e-6, `the tee's full height (${p.dh})`);
  const h = base(); fillPolygon(h, ellipse(32, 32, 7, 5), GREEN, 1, 0);
  const gw = scene(h, GREEN).walls;
  assert.equal(gw.length, 1, 'one bank round the green');
  for (const p of pts(gw[0]!)) assert.ok(Math.abs(p.dh - 0.25) < 1e-6, `the green's full height (${p.dh})`);
});
