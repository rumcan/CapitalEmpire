// Terrain v2: rolling hill country for the 4 x 4 km map (pure TypeScript, no DOM).
// Same output as src/game/terrain/generate.ts (a `Terrain`), so the engine can swap the one call. Unlike v1 (one
// flat valley floor, mountains only on 2-3 edges) the whole map is hill country: a connected lowland of valleys
// 300-800 m wide, hill masses between them, the river and creeks in the valley floors, and hills on every edge.
import { MAP, clamp, mulberry } from '../../iso';
import { TC, HS, HSTEP, sampleField, type Chokepoint, type Edge, type Terrain, type WaterPoint, type Waterway } from '../../terrain/types';
import { makeNoise, fbm, ridged, smoothstep, hash2, type Noise } from '../../terrain/noise';
import { priorityFlood, flowDirs, flowAccum } from '../../terrain/flow';
import { checkGuarantees } from '../../terrain/generate';

/** the generator's knobs: frequencies are per map width, heights are metres, distances are tiles of 2 m */
export const T2 = {
  /** the hill mass: uplift (m) of the broad masses and of their ridged crests, and the crest frequency across the map */
  bandUp: 110, ridgeUp: 40, ridgeFreq: 9,
  /** a valley's half width (tiles) and the share of the map that must be hill before water is cut in */
  valleyW: 74, hillMin: 0.385, hillMax: 0.396,
  /** the mountain edges: how far in they fade (map fraction) and the uplift they carry at the border (m) */
  edgeIn: 0.13, edgeUpLo: 55, edgeUpHi: 150,
  /** the open edge (the highway's side) still gets hills in its band, this high (m), fading over this fraction */
  openIn: 0.08, openUpLo: 70, openUpHi: 120,
  /** valley mouths narrow at the borders: the width factor just inside the border, and the fade-in (map fraction) */
  mouthW: 0.72, mouthIn: 0.1,
  /** the river's valley floor: flat within 45 tiles of the bed, blended into the hills by 150, rising 3 cm a tile */
  floorFlat: 45, floorBlend: 150, floorRise: 0.03,
  /** the river's bed falls this much (m) from its source to its mouth, with this much noise (m) */
  riverDrop: 34, riverWobble: 3,
  /** the highway's valley: half-width (tiles), depth (tiles), and the creek clearance around the entry (tiles) */
  hwyHalf: 44, hwyDeep: 200, hwyClear: 30,
  /** the local valley floor: min-filter radius in height samples (5 = 40 tiles) */
  floorR: 5,
  /** the flat-edge check: the outer band (tiles), the relief (m) over a 32-tile window below which land is flat, and the most flat buildable land the band may hold */
  edgeBand: 64, flatRelief: 8, edgeFlatMax: 0.3,
  /** a valley corridor's median width must be in this range (tiles of 2 m) */
  valleyMin: 150, valleyMax: 400,
  /** the share of the map that must be buildable in one passable component (v1 asks 55%) */
  connected: 0.557,
};

/** creeks: a channel cell needs this many upstream samples, at most MAX_CREEKS per map, a traced creek this many cells, heads this far apart */
const CREEK_MIN_ACC = 45, MAX_CREEKS = 9, CREEK_MIN_CELLS = 24, CREEK_HEAD_GAP = 40;
/** the class grid and the patch noise run at this many tiles per cell */
const CELL = 4, G = MAP / CELL;

/** what checkGuarantees2 reports: the shares (0..1) and the reasons it failed (empty when ok) */
export interface Guarantees2 {
  ok: boolean;
  reasons: string[];
  /** the share of the map that is TC.HILL, target 25-40% */
  hill: number;
  /** the share that is buildable (GROUND or PATCH), target 45-60% */
  buildable: number;
  /** the share of the 64-tile edge band that is flat buildable land (relief under 8 m in a 32-tile window) */
  edgeFlat: number;
  /** per edge N, E, S, W the share of its 64-tile band that is hill (3 of them must reach 25%) */
  edgeHill: number[];
  /** the median width of the valley corridors between hill bands, tiles of 2 m */
  valley: number;
  /** the mean local relief over each town site (and the start block last), metres */
  townRelief: number[];
  /** the share of the map that is buildable land in the largest passable component (v1 asks 55%) */
  connected: number;
}

type P = { x: number; y: number };
/** a valley axis: its ends, its half width (tiles) and the fraction of the width its mouth keeps at the border */
type Axis = { ax: number; ay: number; bx: number; by: number; w: number; mouth: number };
/** the height layers before the highway and river are carved */
interface Layers { base: Float32Array; mass: Float32Array; edge: Float32Array; open: Float32Array; dv: Float32Array }

const EDGES: Edge[] = ['N', 'E', 'S', 'W'];
const OPP: Record<Edge, Edge> = { N: 'S', E: 'W', S: 'N', W: 'E' };
const buildable = (c: number) => c === TC.GROUND || c === TC.PATCH;
const pct = (v: number) => (v * 100).toFixed(1) + '%';
/** distance from a point (u, v) to an edge, in map fractions */
const dEdge = (e: Edge, u: number, v: number) => (e === 'W' ? u : e === 'E' ? 1 - u : e === 'N' ? v : 1 - v);
/** the position of a point along an edge, in map fractions (x for N/S, y for W/E) */
const alongEdge0 = (e: Edge, p: P) => (e === 'N' || e === 'S' ? p.x : p.y);
/** the point at fraction p along an edge, in map fractions */
const along = (e: Edge, p: number): P => (e === 'N' ? { x: p, y: 0 } : e === 'S' ? { x: p, y: 1 } : e === 'W' ? { x: 0, y: p } : { x: 1, y: p });

/** distance from (px, py) to segment a-b; writes the clamped projection (0..1) to lastT (shared with the water widths) */
let lastT = 0;
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = clamp(L2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0, 0, 1);
  lastT = t;
  const qx = ax + dx * t - px, qy = ay + dy * t - py;
  return Math.sqrt(qx * qx + qy * qy);
}

/** distance from a point to a waterway's centreline minus half its width, in tiles (negative inside the water) */
function waterDist(pts: WaterPoint[], x: number, y: number): number {
  let best = Infinity;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1];
    best = Math.min(best, segDist(x, y, a.x, a.y, b.x, b.y) - (a.w + (b.w - a.w) * lastT) / 2);
  }
  return best;
}

/** Chaikin corner cutting; keeps both endpoints */
function chaikin(pts: P[]): P[] {
  const out: P[] = [pts[0]];
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1];
    out.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y }, { x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** resample a polyline at a fixed arc spacing, ending exactly on its last point */
function resample(pts: P[], step: number): P[] {
  const out: P[] = [pts[0]];
  let remain = step;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1], L = Math.hypot(b.x - a.x, b.y - a.y);
    let pos = 0;
    while (L - pos >= remain) { pos += remain; const t = pos / L; out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); remain = step; }
    remain -= L - pos;
  }
  const end = pts[pts.length - 1], last = out[out.length - 1];
  if (out.length > 1 && Math.hypot(end.x - last.x, end.y - last.y) < step * 0.5) out.pop();
  out.push(end);
  return out;
}

/** offset every interior point of a resampled line perpendicular to its tangent by a two-scale noise, fading at both ends */
function meander(line: P[], n: Noise, seedK: number, amp: number, scale: number): P[] {
  const s = [0];
  for (let k = 1; k < line.length; k++) s.push(s[k - 1] + Math.hypot(line[k].x - line[k - 1].x, line[k].y - line[k - 1].y));
  const L = s[s.length - 1];
  return line.map((p, k) => {
    if (k === 0 || k === line.length - 1) return p;
    // the tangent over +-4 points, so the offset does not flip at D8 corners; the meander fades over 60 tiles at both ends
    const a = line[Math.max(0, k - 4)], b = line[Math.min(line.length - 1, k + 4)], tl = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const fade = smoothstep(0, 60, s[k]) * smoothstep(0, 60, L - s[k]);
    const off = fade * (amp * fbm(n, s[k] / scale, seedK, 3) + 0.2 * amp * n(s[k] / (scale * 0.2), seedK + 50));
    return { x: p.x - (b.y - a.y) / tl * off, y: p.y + (b.x - a.x) / tl * off };
  });
}

/** the minimum of a square field over a (2r+1)² window, edges clamped (separating axis, monotonic deques) */
function minFilter(src: Float32Array, n: number, r: number): Float32Array {
  const tmp = new Float32Array(n * n), out = new Float32Array(n * n), dq = new Int32Array(n);
  for (let y = 0; y < n; y++) {
    const row = y * n;
    let h = 0, t = 0;
    for (let x = 0; x < n + r; x++) {
      if (x < n) { const v = src[row + x]; while (t > h && src[row + dq[t - 1]] >= v) t--; dq[t++] = x; }
      const c = x - r;
      if (c >= 0) { while (dq[h] < c - r) h++; tmp[row + c] = src[row + dq[h]]; }
    }
  }
  for (let x = 0; x < n; x++) {
    let h = 0, t = 0;
    for (let y = 0; y < n + r; y++) {
      if (y < n) { const v = tmp[y * n + x]; while (t > h && tmp[dq[t - 1] * n + x] >= v) t--; dq[t++] = y; }
      const c = y - r;
      if (c >= 0) { while (dq[h] < c - r) h++; out[c * n + x] = tmp[dq[h] * n + x]; }
    }
  }
  return out;
}

/** paint the river's water and its 3-tile bank ring into cls (banks cut into hills too, as in v1) */
function rasterRiver(cls: Uint8Array, pts: WaterPoint[]) {
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1], mw = Math.max(a.w, b.w) / 2 + 4;
    const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - mw)), x1 = Math.min(MAP - 1, Math.ceil(Math.max(a.x, b.x) + mw));
    const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - mw)), y1 = Math.min(MAP - 1, Math.ceil(Math.max(a.y, b.y) + mw));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dd = segDist(x + 0.5, y + 0.5, a.x, a.y, b.x, b.y);
      const e = dd - (a.w + (b.w - a.w) * lastT) / 2, idx = y * MAP + x;
      if (e <= 0) cls[idx] = TC.WATER;
      else if (e <= 3 && cls[idx] !== TC.WATER) cls[idx] = TC.BANK;
    }
  }
}

/** paint a creek as TC.CREEK over ground and patches only (no bank ring), as in v1 */
function rasterCreek(cls: Uint8Array, pts: WaterPoint[]) {
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1], mw = Math.max(a.w, b.w) / 2 + 4;
    const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - mw)), x1 = Math.min(MAP - 1, Math.ceil(Math.max(a.x, b.x) + mw));
    const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - mw)), y1 = Math.min(MAP - 1, Math.ceil(Math.max(a.y, b.y) + mw));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dd = segDist(x + 0.5, y + 0.5, a.x, a.y, b.x, b.y);
      const e = dd - (a.w + (b.w - a.w) * lastT) / 2, idx = y * MAP + x;
      if (e <= 0 && (cls[idx] === TC.GROUND || cls[idx] === TC.PATCH)) cls[idx] = TC.CREEK;
    }
  }
}

/** one attempt: edges, valley network, hill heights, highway and river valleys, classes, creeks, sites, chokepoints */
function build(genSeed: number): Terrain {
  const r = mulberry(genSeed);
  // 1. edges: mountains on 3 sides; the fourth is open for the highway and the river's mouth
  const mountainEdges: Edge[] = [];
  while (mountainEdges.length < 3) { const e = EDGES[Math.floor(r() * 4)]; if (!mountainEdges.includes(e)) mountainEdges.push(e); }
  const exit = EDGES.find(e => !mountainEdges.includes(e))!;
  const source = OPP[exit];
  const sp = along(source, 0.25 + 0.5 * r()), ep = along(exit, 0.25 + 0.5 * r());
  // 2. one noise per purpose, all derived from the seed
  const nk = (k: number): Noise => makeNoise(hash2(genSeed, k));
  const nWarp = nk(1), nBase = nk(2), nMod = nk(3), nSw = nk(4), nEdge = nk(5), nEdgeR = nk(6);
  const nFine = nk(7), nWidth = nk(8), nPatch = nk(9), nMeander = nk(10), nRidge = nk(11), nBed = nk(12);
  // 3. the valley network: a jittered grid of nodes, every edge anchor joined to the nearest node, and the nodes
  // joined to their left and upper neighbours (a spanning tree, so the lowland is connected by construction) plus
  // some of the other neighbours (loops, so the valleys do not read as a waffle)
  const NN = 5, cell = MAP / NN;
  const node: P[] = [];
  for (let gy = 0; gy < NN; gy++) for (let gx = 0; gx < NN; gx++) {
    node.push({ x: (gx + 0.5) * cell + (r() - 0.5) * cell * 0.45, y: (gy + 0.5) * cell + (r() - 0.5) * cell * 0.45 });
  }
  const id = (gx: number, gy: number) => gy * NN + gx;
  // one anchor per edge at 18-82% along it; on the open edge it keeps 300 tiles from the river's mouth (the highway
  // takes that mouth, so the two never share a valley)
  const anchors: P[] = [];
  for (const e of EDGES) {
    let p = 0.18 + 0.64 * r();
    if (e === exit) {
      const rp = alongEdge0(e, ep);
      for (let tries = 0; tries < 8 && Math.abs(p - rp) * MAP < 300; tries++) p = 0.18 + 0.64 * r();
    }
    anchors.push({ x: along(e, p).x * MAP, y: along(e, p).y * MAP });
  }
  const axes: Axis[] = [];
  // a link is a gently bent 3-segment chain, so the valleys wind instead of running straight between the nodes
  const link = (a: P, b: P, w = T2.valleyW * (0.85 + 0.3 * r()), mouth = 1) => {
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    const pts: P[] = [a];
    for (let k = 1; k <= 3; k++) {
      const t = k / 4, off = (r() - 0.5) * 0.3 * L;
      pts.push({ x: a.x + dx * t - (dy / L) * off, y: a.y + dy * t + (dx / L) * off });
    }
    pts.push(b);
    for (let k = 0; k + 1 < pts.length; k++) axes.push({ ax: pts[k].x, ay: pts[k].y, bx: pts[k + 1].x, by: pts[k + 1].y, w: w * (0.8 + 0.4 * r()), mouth });
  };
  for (let gy = 0; gy < NN; gy++) for (let gx = 0; gx < NN; gx++) {
    if (gx > 0) link(node[id(gx - 1, gy)], node[id(gx, gy)]);
    if (gy > 0) link(node[id(gx, gy - 1)], node[id(gx, gy)]);
    // a loop along the other neighbours now and then: more of the hill masses cut into separate bands
    if (gx > 0 && gy > 0 && r() < 0.12) link(node[id(gx - 1, gy)], node[id(gx, gy - 1)]);
  }
  // each edge anchor joins the nearest node, and that last stretch narrows into its mouth
  for (const a of anchors) {
    let bn = node[0], bd = Infinity;
    for (const n of node) { const d = Math.hypot(n.x - a.x, n.y - a.y); if (d < bd) { bd = d; bn = n; } }
    link(a, bn, T2.valleyW * (0.9 + 0.2 * r()), T2.mouthW);
  }
  // the highway takes the open edge's anchor: that mouth is its entry, so the 16 x 48 strip is always lowland
  const hwyAnchor = anchors[EDGES.indexOf(exit)];
  const hwyPos = alongEdge0(exit, hwyAnchor); // tiles along the open edge
  // 4. the river's control points: source edge to exit edge, kept in the middle of the map and bent by noise.
  //    Its valley is one of the axes, and the water is carved along its final line (step 8), so it always has a floor.
  const rHead: P = { x: sp.x * MAP, y: sp.y * MAP }, rTail: P = { x: ep.x * MAP, y: ep.y * MAP };
  const cp: P[] = [rHead];
  const ndx = rTail.x - rHead.x, ndy = rTail.y - rHead.y, nl = Math.hypot(ndx, ndy) || 1;
  const bend = 0.18 * MAP;
  for (let k = 1; k <= 3; k++) {
    const t = k / 4, off = bend * fbm(nWarp, t * 2.7, 4.1, 3);
    cp.push({ x: clamp(rHead.x + ndx * t - (ndy / nl) * off, 0.2 * MAP, 0.8 * MAP), y: clamp(rHead.y + ndy * t + (ndx / nl) * off, 0.2 * MAP, 0.8 * MAP) });
  }
  cp.push(rTail);
  for (let k = 0; k + 1 < cp.length; k++) link(cp[k], cp[k + 1], T2.valleyW * 1.5, 0.62);
  /** the normalised distance (1 on a valley's half width) to the nearest axis; valley mouths narrow at the borders */
  const valleyAt = (x: number, y: number): number => {
    const near = smoothstep(0, T2.mouthIn, Math.min(x, y, MAP - x, MAP - y) / MAP);
    // a domain warp: the valleys wind and their edges are organic, not straight lines between the nodes
    x += 55 * fbm(nWarp, x / 520, y / 520, 3);
    y += 55 * fbm(nWarp, x / 520 + 4.7, y / 520 + 9.2, 3);
    let best = 1e9;
    for (const a of axes) {
      const dx = a.bx - a.ax, dy = a.by - a.ay, L2 = dx * dx + dy * dy;
      const t = clamp(((x - a.ax) * dx + (y - a.ay) * dy) / L2, 0, 1);
      const d = Math.hypot(a.ax + dx * t - x, a.ay + dy * t - y) / (a.w * (a.mouth + (1 - a.mouth) * near));
      if (d < best) best = d;
    }
    return best;
  };
  // 5. the height layers, first without the highway's cut so its valley can go where the open edge is lowest
  const layers: Layers = { base: new Float32Array(HS * HS), mass: new Float32Array(HS * HS), edge: new Float32Array(HS * HS), open: new Float32Array(HS * HS), dv: new Float32Array(HS * HS) };
  for (let j = 0; j < HS; j++) for (let i = 0; i < HS; i++) {
    const u = (i + 0.5) / HS, v = (j + 0.5) / HS, k = j * HS + i;
    const x = u * MAP, y = v * MAP;
    // the normalised distance to the nearest valley axis, its unit wobbled by noise; the classes are hills past its cut
    layers.dv[k] = valleyAt(x, y) * (0.85 + 0.3 * fbm(nWarp, u * 3.2, v * 3.2, 3));
    layers.base[k] = 9 * fbm(nBase, u * 6, v * 6, 4) + 16 * fbm(nSw, u * 2.2, v * 2.2, 3) + 12 * dEdge(exit, u, v);
    layers.mass[k] = (T2.bandUp + T2.ridgeUp * ridged(nRidge, u * T2.ridgeFreq, v * T2.ridgeFreq, 3)) * (0.7 + 0.55 * fbm(nMod, u * 2.6, v * 2.6, 3));
    let m = 0;
    for (const e of mountainEdges) {
      const d = clamp(dEdge(e, u, v) + 0.05 * fbm(nEdge, u * 4, v * 4, 4), 0, 1);
      m = Math.max(m, Math.pow(clamp(1 - d / T2.edgeIn, 0, 1), 0.7));
    }
    layers.edge[k] = m * (T2.edgeUpLo + (T2.edgeUpHi - T2.edgeUpLo) * ridged(nEdgeR, u * 9, v * 9, 4));
    // the open edge gets its own hills, so no side of the map is a flat strip
    const dOpen = clamp(1 - dEdge(exit, u, v) / T2.openIn, 0, 1);
    layers.open[k] = (0.75 + 0.25 * dOpen) * (T2.openUpLo + (T2.openUpHi - T2.openUpLo) * ridged(nEdgeR, u * 7 + 11.3, v * 7 + 4.7, 3));
  }
  // 6. a preliminary cut radius from the histogram of the distance field, used while the creeks are routed (the final
  //     one is calibrated on the painted classes); hills are where the distance to the nearest valley axis passes it
  const dvG = new Float32Array(G * G), patchG = new Float32Array(G * G);
  for (let cj = 0; cj < G; cj++) for (let ci = 0; ci < G; ci++) {
    const c = cj * G + ci, d = sampleField(layers.dv, ci * CELL + CELL / 2, cj * CELL + CELL / 2);
    dvG[c] = Math.min(d, 24);
    patchG[c] = fbm(nPatch, (ci * CELL + 2) / 180, (cj * CELL + 2) / 180, 4);
  }
  const BINS = 512, DV_MAX = 24;
  const bin = new Int32Array(BINS);
  for (let c = 0; c < G * G; c++) bin[Math.min(BINS - 1, (dvG[c] / DV_MAX * BINS) | 0)]++;
  // the radius used for the creek checks (the final cut is found later, on the painted classes)
  const hillThr = ((): number => { let acc = 0; const want = T2.hillMin * G * G; for (let b = BINS - 1; b >= 0; b--) { acc += bin[b]; if (acc >= want) return ((b + 0.5) / BINS) * DV_MAX; } return DV_MAX; })();
  // the height rise is gradual: hills start just off a valley floor and reach their full uplift by about two usual
  // valley widths (3100 m), so the edges of the lowland are gentle slopes, not walls
  const up0 = new Float32Array(HS * HS);
  const mv = T2.valleyW * 1.06; // the mean axis half width: the normalised distance field's unit, in tiles
  for (let k = 0; k < HS * HS; k++) {
    const d = Math.min(layers.dv[k] * mv, 400);
    up0[k] = Math.max(layers.mass[k], Math.max(layers.edge[k], layers.open[k])) * smoothstep(60, 400, d);
  }
  /** the entry point (a tile on the open edge) for a position along that edge */
  const entryAt = (pos: number): P => ({ x: exit === 'N' || exit === 'S' ? pos : exit === 'W' ? 0 : MAP - 1, y: exit === 'N' ? 0 : exit === 'S' ? MAP - 1 : pos });
  // 7. the heights: the highest of the layers, with the highway's valley cut through every hill it meets, terraced at 4 m
  const height = new Float32Array(HS * HS), uplift = new Float32Array(HS * HS), natural = new Float32Array(HS * HS);
  const buildHeight = (pos: number) => {
    for (let j = 0; j < HS; j++) for (let i = 0; i < HS; i++) {
      const k = j * HS + i, x = i * HSTEP + HSTEP / 2, y = j * HSTEP + HSTEP / 2;
      const lat = Math.abs((exit === 'N' || exit === 'S' ? x : y) - pos);
      const up0k = up0[k] * smoothstep(30, 100, lat) * smoothstep(60, 140, lat);
      const q = up0k / 4, fl = Math.floor(q);
      uplift[k] = 4 * (fl + smoothstep(0.75, 1, q - fl)); // 4 m terraces on the hills
      height[k] = layers.base[k] + uplift[k];
      natural[k] = height[k];
    }
    // the highway's valley: a shallow tongue from the entry inland, so the highway has a valley to come in by
    const e0 = entryAt(pos), hb = sampleField(height, e0.x, e0.y);
    for (let j = 0; j < HS; j++) for (let i = 0; i < HS; i++) {
      const x = i * HSTEP + HSTEP / 2, y = j * HSTEP + HSTEP / 2;
      const t = exit === 'N' ? y : exit === 'S' ? MAP - y : exit === 'W' ? x : MAP - x; // depth inland
      if (t > T2.hwyDeep + 80) continue;
      const lat = Math.abs((exit === 'N' || exit === 'S' ? x : y) - pos);
      const w = smoothstep(T2.hwyDeep + 70, T2.hwyDeep - 20, t) * smoothstep(T2.hwyHalf + 40, T2.hwyHalf - 4, lat);
      if (w <= 0) continue;
      const k = j * HS + i, target = hb + 0.02 * t;
      height[k] += (target - height[k]) * w;
      uplift[k] *= 1 - w; // the entry strip must be buildable
    }
  };
  buildHeight(hwyPos);
  // 8. the river: the control line, smoothed, resampled, meandered, with a bed that falls from its head to its mouth
  let line = cp;
  for (let it = 0; it < 3; it++) line = chaikin(line);
  line = meander(resample(line, 8), nMeander, 0.5, 42, 190);
  const arc = [0];
  for (let k = 1; k < line.length; k++) arc.push(arc[k - 1] + Math.hypot(line[k].x - line[k - 1].x, line[k].y - line[k - 1].y));
  const riverLen = arc[arc.length - 1];
  const headH = sampleField(height, rHead.x, rHead.y);
  const pts: WaterPoint[] = line.map((p, k) => ({
    x: p.x, y: p.y,
    w: clamp(20 + 20 * (0.5 + 0.5 * nWidth(arc[k] / 300, 0)), 20, 40),
  }));
  const bed: number[] = line.map((_, k) => headH - T2.riverDrop * (arc[k] / riverLen) + T2.riverWobble * fbm(nBed, arc[k] / 240, 3.7, 3));
  /** the bed height and width at arc length s along the river */
  const bedAt = (s: number) => {
    let lo = 0, hi = arc.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (arc[mid] <= s) lo = mid; else hi = mid; }
    const t = (s - arc[lo]) / Math.max(1e-6, arc[hi] - arc[lo]);
    return bed[lo] + (bed[hi] - bed[lo]) * t;
  };
  /** the river's valley floor: flat within 45 tiles of the bed, blended into the hills by 150, rising 3 cm a tile */
  const bedH = new Float32Array(HS * HS).fill(Infinity), bedD2 = new Float32Array(HS * HS).fill(Infinity);
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1];
    const reach = T2.floorBlend + Math.max(a.w, b.w) / 2;
    const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - reach) / HSTEP)), i1 = Math.min(HS - 1, Math.ceil((Math.max(a.x, b.x) + reach) / HSTEP));
    const j0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - reach) / HSTEP)), j1 = Math.min(HS - 1, Math.ceil((Math.max(a.y, b.y) + reach) / HSTEP));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = i * HSTEP + HSTEP / 2, y = j * HSTEP + HSTEP / 2;
      const d = segDist(x, y, a.x, a.y, b.x, b.y), k2 = j * HS + i, d2 = d * d;
      if (d2 < bedD2[k2]) { bedD2[k2] = d2; bedH[k2] = bedAt(arc[k] + (arc[k + 1] - arc[k]) * lastT); }
    }
  }
  for (let k = 0; k < HS * HS; k++) {
    const d = Math.sqrt(bedD2[k]);
    if (!Number.isFinite(d) || d >= T2.floorBlend) continue;
    const w = smoothstep(T2.floorBlend, T2.floorFlat, d);
    const floorY = bedH[k] + T2.floorRise * d;
    height[k] = Math.max(bedH[k], height[k] + (floorY - height[k]) * w);
    uplift[k] *= 1 - w * 0.85; // the floor is lowland; the banks of a gorge keep some rock
  }
  const waters: Waterway[] = [{ kind: 'river', pts }];
  // 9. local relief, for scoring sites (how far the ground rises above the lowest point within 40 tiles)
  const floorMin = minFilter(height, HS, T2.floorR);
  const relief = new Float32Array(HS * HS);
  for (let k = 0; k < HS * HS; k++) relief[k] = height[k] - floorMin[k];
  // 10. creeks: heads at the foot of the hills come down the flow to the river, a junction or the border (v1's method).
  //     Their routing field is clean inside the river's floor, so a creek that reaches the floor runs to the water.
  const heightC = new Float32Array(HS * HS);
  for (let j = 0; j < HS; j++) for (let i = 0; i < HS; i++) {
    const k = j * HS + i, d = Math.sqrt(bedD2[k]);
    const fine = 16 * fbm(nFine, ((i + 0.5) / HS) * 14, ((j + 0.5) / HS) * 14, 4) + 5 * fbm(nFine, ((i + 0.5) / HS) * 40 + 7.7, ((j + 0.5) / HS) * 40 + 3.1, 2);
    heightC[k] = d < T2.floorBlend ? bedH[k] + T2.floorRise * d : natural[k] + fine; // natural: not the highway's cut
  }
  // a low rise in the routing field around the highway's entry diverts creeks, so the entry strip stays clear
  const e0 = entryAt(hwyPos);
  for (let j = 0; j < HS; j++) for (let i = 0; i < HS; i++) {
    const d = Math.hypot(i * HSTEP + HSTEP / 2 - e0.x, j * HSTEP + HSTEP / 2 - e0.y);
    if (d < 220) heightC[j * HS + i] += 26 * smoothstep(220, 90, d);
  }
  const filledC = priorityFlood(heightC, HS), dirC = flowDirs(filledC, HS), acc = flowAccum(dirC, HS, filledC);
  // a river cell is within 2 cells of the river's centreline
  const riverCell = new Uint8Array(HS * HS);
  for (const p of pts) {
    const ci = clamp(Math.round(p.x / HSTEP - 0.5), 0, HS - 1), cj = clamp(Math.round(p.y / HSTEP - 0.5), 0, HS - 1);
    for (let jj = Math.max(0, cj - 2); jj <= Math.min(HS - 1, cj + 2); jj++)
      for (let ii = Math.max(0, ci - 2); ii <= Math.min(HS - 1, ci + 2); ii++) riverCell[jj * HS + ii] = 1;
  }
  const claimedBy = new Int16Array(HS * HS);
  const isChannel = (c: number) => acc[c] >= CREEK_MIN_ACC;
  // true if any cell within Chebyshev radius rr of c (c included) passes pred
  const anyNear = (c: number, rr: number, pred: (n: number) => boolean) => {
    const x = c % HS, y = (c - x) / HS;
    for (let yy = Math.max(0, y - rr); yy <= Math.min(HS - 1, y + rr); yy++)
      for (let xx = Math.max(0, x - rr); xx <= Math.min(HS - 1, x + rr); xx++) if (pred(yy * HS + xx)) return true;
    return false;
  };
  const heads: number[] = [];
  for (let c = 0; c < HS * HS; c++) {
    if (!isChannel(c)) continue;
    if (anyNear(c, 1, n => dirC[n] === c && isChannel(n))) continue;
    if (!anyNear(c, 3, n => layers.dv[n] > hillThr)) continue; // a head sits at the foot of the hills
    heads.push(c);
  }
  // trace a head down until a river cell or the border (it ends there), or a claimed cell (a junction: included)
  const traceCreek = (h: number): { cells: number[]; join: number } => {
    const cells: number[] = [];
    if (claimedBy[h]) return { cells, join: -1 };
    let c = h, join = -1;
    for (;;) {
      cells.push(c);
      if (riverCell[c] || dirC[c] < 0) break;
      const nx = dirC[c];
      if (claimedBy[nx]) { cells.push(nx); join = claimedBy[nx] - 1; break; }
      c = nx;
    }
    return { cells, join };
  };
  const trial = heads.map(h => { const tc = traceCreek(h).cells; return { h, endAcc: acc[tc[tc.length - 1]] }; });
  trial.sort((a, b) => b.endAcc - a.endAcc || a.h - b.h);
  const accepted: { head: number; hx: number; hy: number; cells: number[]; join: number }[] = [];
  for (const cand of trial) {
    if (accepted.length >= MAX_CREEKS) break;
    const hx = cand.h % HS, hy = (cand.h - hx) / HS;
    if (accepted.some(a => Math.max(Math.abs(a.hx - hx), Math.abs(a.hy - hy)) < CREEK_HEAD_GAP)) continue;
    const { cells, join } = traceCreek(cand.h);
    if (cells.length < CREEK_MIN_CELLS) continue;
    const id = accepted.length + 1;
    for (const c of cells) if (!claimedBy[c] && !riverCell[c]) claimedBy[c] = id;
    accepted.push({ head: cand.h, hx, hy, cells, join });
  }
  /** true if a point more than 48 tiles of arc from the creek's end lies within 24 tiles of a map border */
  const hugsBorder = (fin: WaterPoint[]) => {
    const s = [0];
    for (let k = 1; k < fin.length; k++) s.push(s[k - 1] + Math.hypot(fin[k].x - fin[k - 1].x, fin[k].y - fin[k - 1].y));
    const L = s[s.length - 1];
    for (let k = 0; k < fin.length; k++) {
      if (L - s[k] < 48) continue;
      const p = fin[k];
      if (Math.min(p.x, p.y, MAP - p.x, MAP - p.y) < 24) return true;
    }
    return false;
  };
  /** snap a creek's end onto the nearest point of the creek it joins (or null when it is too far away) */
  const joinTo = (fin: WaterPoint[], target: WaterPoint[] | null): WaterPoint[] | null => {
    if (!target) return null;
    const last = fin[fin.length - 1];
    let bx = target[0].x, by = target[0].y, bd = Infinity;
    for (let k = 0; k + 1 < target.length; k++) {
      const a = target[k], b = target[k + 1], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
      const t = L2 > 0 ? clamp(((last.x - a.x) * dx + (last.y - a.y) * dy) / L2, 0, 1) : 0;
      const qx = a.x + dx * t, qy = a.y + dy * t, d = Math.hypot(qx - last.x, qy - last.y);
      if (d < bd) { bd = d; bx = qx; by = qy; }
    }
    if (bd > 40) return null;
    fin[fin.length - 1] = { x: bx, y: by, w: last.w };
    return fin;
  };
  /** the cells a creek runs through from its head to the river or the border, ignoring other creeks */
  const traceToEnd = (h: number): number[] => {
    const cells: number[] = [];
    let c = h;
    for (;;) {
      cells.push(c);
      if (riverCell[c] || dirC[c] < 0) break;
      c = dirC[c];
      if (cells.length > HS * HS) break;
    }
    return cells;
  };
  /** a creek's polyline from its routing cells: smoothed, meandered, with widths from the flow accumulation */
  const creekLine = (cells: number[], idx: number): WaterPoint[] => {
    const cellPts: P[] = cells.map(c => ({ x: (c % HS) * HSTEP + HSTEP / 2, y: ((c - (c % HS)) / HS) * HSTEP + HSTEP / 2 }));
    let cl = cellPts;
    for (let it = 0; it < 3; it++) cl = chaikin(cl);
    cl = meander(resample(cl, 6), nMeander, idx * 7.3 + 20, 16, 160);
    return cl.map(p => {
      let best = 0, bd = Infinity;
      for (let j = 0; j < cellPts.length; j++) {
        const d = (cellPts[j].x - p.x) ** 2 + (cellPts[j].y - p.y) ** 2;
        if (d < bd) { bd = d; best = j; }
      }
      const a = acc[cells[best]];
      return { x: p.x, y: p.y, w: clamp(3 + 5 * clamp(Math.log(a / CREEK_MIN_ACC) / Math.log(20), 0, 1), 3, 8) };
    });
  };
  const isHillP = (p: P) => { const ix = Math.floor(p.x), iy = Math.floor(p.y); return ix >= 0 && iy >= 0 && ix < MAP && iy < MAP && layers.dv[(iy >> 3) * HS + (ix >> 3)] > hillThr; };
  const finals: (WaterPoint[] | null)[] = [];
  accepted.forEach((cr, idx) => {
    /** a creek's line from routing cells, trimmed where it leaves the hills (the last hill point is kept) */
    const trimmedOf = (cells: number[]): WaterPoint[] | null => {
      const cpts = creekLine(cells, idx);
      let i0 = 0;
      while (i0 < cpts.length && isHillP(cpts[i0])) i0++;
      const trimmed = cpts.slice(Math.max(0, i0 - 1));
      return trimmed.length < 8 ? null : trimmed;
    };
    let fin = trimmedOf(cr.cells);
    // a junction snaps onto the creek it joins; when that creek is gone, the creek runs on to the river or the border
    if (fin && cr.join >= 0) {
      const target = finals[cr.join];
      fin = target ? joinTo(fin, target) ?? fin : trimmedOf(traceToEnd(cr.head));
    }
    if (fin && hugsBorder(fin)) fin = null;
    // a creek that would spend much of its run inside a hill (a routing artifact) is dropped
    if (fin) {
      let inHill = 0;
      for (const p of fin) if (isHillP(p)) inHill++;
      if (inHill > 0.25 * fin.length) fin = null;
    }
    // a creek that would run into the highway's valley is dropped (the entry stays clear)
    if (fin && fin.some(p => Math.hypot(p.x - e0.x, p.y - e0.y) < T2.hwyClear)) fin = null;
    finals.push(fin);
  });
  const creekPts: WaterPoint[][] = [];
  for (const fin of finals) if (fin) { creekPts.push(fin); waters.push({ kind: 'creek', pts: fin }); }
  // 11. the classes: the cut radius comes from the sorted distance field (the share above a radius is a quantile), and
  // is nudged up to four times because the water and the creeks cut into the hills after the paint
  const cls = new Uint8Array(MAP * MAP);
  /** paint the classes given the cut radius: hills past it, patches, then the river and the creeks cut in */
  const classify = (thr: number) => {
    for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
      const c = (y >> 2) * G + (x >> 2), k = y * MAP + x;
      cls[k] = dvG[c] > thr ? TC.HILL : patchG[c] > 0.35 ? TC.PATCH : TC.GROUND;
    }
    rasterRiver(cls, pts);
    for (const cr of creekPts) rasterCreek(cls, cr);
  };
  const hillTarget = T2.hillMin + (T2.hillMax - T2.hillMin) * r();
  const dvSorted = Float32Array.from(dvG).sort();
  /** the cut radius that leaves `share` of the cells above it (binary search on the sorted field) */
  const radiusFor = (share: number): number => {
    let lo = 0, hi = dvSorted.length;
    const from = Math.floor((1 - share) * dvSorted.length);
    while (lo < hi) { const mid = (lo + hi) >> 1; if (mid < from) lo = mid + 1; else hi = mid; }
    return dvSorted[clamp(lo, 0, dvSorted.length - 1)];
  };
  const countHills = () => { let n = 0; for (let k = 0; k < MAP * MAP; k++) if (cls[k] === TC.HILL) n++; return n / (MAP * MAP); };
  let cellShare = Math.min(0.6, hillTarget + 0.03);
  for (let it = 0; it < 4; it++) {
    classify(radiusFor(cellShare));
    const h = countHills();
    if (Math.abs(h - hillTarget) < 0.004) break;
    cellShare = clamp(cellShare + (hillTarget - h), 0.2, 0.6);
  }
  // 12. buildable tiles' integral image and a cell-resolution relief table, for scoring sites
  const S = MAP + 1, I = new Int32Array(S * S);
  for (let y = 0; y < MAP; y++) {
    let row = 0;
    for (let x = 0; x < MAP; x++) { row += buildable(cls[y * MAP + x]) ? 1 : 0; I[(y + 1) * S + x + 1] = I[y * S + x + 1] + row; }
  }
  const count = (x0: number, y0: number, x1: number, y1: number) => I[y1 * S + x1] - I[y0 * S + x1] - I[y1 * S + x0] + I[y0 * S + x0];
  const FG = G + 1, FR = new Float32Array(FG * FG);
  for (let cj = 0; cj < G; cj++) {
    let row = 0;
    for (let ci = 0; ci < G; ci++) { row += sampleField(relief, ci * CELL + CELL / 2, cj * CELL + CELL / 2); FR[(cj + 1) * FG + ci + 1] = FR[cj * FG + ci + 1] + row; }
  }
  /** the mean local relief (m) over a tile rectangle, from the cell-resolution summed-area table */
  const reliefMean = (x0: number, y0: number, x1: number, y1: number) => {
    const c0 = clamp(x0 >> 2, 0, G - 1), c1 = clamp(x1 >> 2, 0, G), d0 = clamp(y0 >> 2, 0, G - 1), d1 = clamp(y1 >> 2, 0, G);
    return (FR[d1 * FG + c1] - FR[d0 * FG + c1] - FR[d1 * FG + c0] + FR[d0 * FG + c0]) / Math.max(1, (c1 - c0) * (d1 - d0));
  };
  // 13. the highway entry: a 16 x 48 strip of buildable land on the open edge, nearest the chosen position
  const hw: { x: number; y: number; edge: Edge }[] = [];

  for (let c = 0; c + 16 <= MAP; c += 16) {
    const cx = c + 8;
    let x = 0, y = 0, rect: [number, number, number, number];
    if (exit === 'N') { x = cx; y = 0; rect = [c, 0, c + 16, 48]; }
    else if (exit === 'S') { x = cx; y = MAP - 1; rect = [c, MAP - 48, c + 16, MAP]; }
    else if (exit === 'W') { x = 0; y = cx; rect = [0, c, 48, c + 16]; }
    else { x = MAP - 1; y = cx; rect = [MAP - 48, c, MAP, c + 16]; }
    if (Math.abs((exit === 'N' || exit === 'S' ? x : y) - hwyPos) > 64) continue;
    if (count(rect[0], rect[1], rect[2], rect[3]) !== 768) continue;
    if (waterDist(pts, x, y) < 60) continue;
    hw.push({ x, y, edge: exit });
  }
  // 14. the start block: 64 x 64 buildable, 64+ tiles in from the border, near the highway and (first choice) the water
  const pick: { score: number; h: { x: number; y: number; edge: Edge } | null; b: { x: number; y: number; cx: number; cy: number; rel: number } | null } = { score: Infinity, h: null, b: null };
  // the flattest buildable block nearest a highway strip; riverside blocks get a bonus, and any block is allowed when
  // none is riverside (so the start is always placed)
  for (let by = 64; by <= MAP - 128; by += 16) for (let bx = 64; bx <= MAP - 128; bx += 16) {
    if (count(bx, by, bx + 64, by + 64) !== 64 * 64) continue;
    const cx = bx + 32, cy = by + 32, near = waterDist(pts, cx, cy) <= 140 ? 0 : 6;
    const rel = reliefMean(bx, by, bx + 64, by + 64);
    for (const h of hw) {
      const dh = Math.hypot(cx - h.x, cy - h.y);
      if (dh > 380) continue;
      if (rel + dh * 0.004 + near < pick.score) { pick.score = rel + dh * 0.004 + near; pick.h = h; pick.b = { x: bx, y: by, cx, cy, rel }; }
    }
  }
  const highway = pick.h ? { x: pick.h.x, y: pick.h.y, edge: pick.h.edge } : { x: -1, y: -1, edge: 'N' as Edge };
  const start = pick.b ? { x: pick.b.x, y: pick.b.y, size: 64 } : { x: -1, y: -1, size: 64 };
  // 15. town sites: 64 x 64 buildable blocks in the lowest-relief spots, three of them 750-1500 tiles apart
  const tc: { x: number; y: number; cx: number; cy: number; score: number }[] = [];
  for (let by = 128; by <= MAP - 192; by += 16) for (let bx = 128; bx <= MAP - 192; bx += 16) {
    if (count(bx, by, bx + 64, by + 64) !== 64 * 64) continue;
    const cx = bx + 32, cy = by + 32;
    const wx0 = clamp(cx - 120, 0, MAP), wy0 = clamp(cy - 120, 0, MAP), wx1 = clamp(cx + 120, 0, MAP), wy1 = clamp(cy + 120, 0, MAP);
    tc.push({ x: bx, y: by, cx, cy, score: reliefMean(wx0, wy0, wx1, wy1) });
  }
  tc.sort((a, b) => a.score - b.score || a.y - b.y || a.x - b.x);
  const kept: typeof tc = [];
  for (const c of tc) {
    if (kept.length >= 80) break;
    if (kept.some(k => Math.hypot(k.cx - c.cx, k.cy - c.cy) <= 96)) continue;
    kept.push(c);
  }
  let bestTri: [(typeof kept)[number], (typeof kept)[number], (typeof kept)[number]] | null = null;
  let bestScore = Infinity;
  for (let i = 0; i < kept.length; i++) for (let j = i + 1; j < kept.length; j++) {
    const dij = Math.hypot(kept[i].cx - kept[j].cx, kept[i].cy - kept[j].cy);
    if (dij < 750 || dij > 1500) continue;
    for (let k = j + 1; k < kept.length; k++) {
      const dik = Math.hypot(kept[i].cx - kept[k].cx, kept[i].cy - kept[k].cy), djk = Math.hypot(kept[j].cx - kept[k].cx, kept[j].cy - kept[k].cy);
      if (dik < 750 || dik > 1500 || djk < 750 || djk > 1500) continue;
      const score = kept[i].score + kept[j].score + kept[k].score;
      if (score < bestScore) { bestScore = score; bestTri = [kept[i], kept[j], kept[k]]; }
    }
  }
  const towns: Terrain['towns'] = bestTri ? bestTri.map(b => ({ x: b.x, y: b.y, size: 64 })) : [];
  // 16. chokepoints: the narrowest bridge site with buildable banks, and the longest hill-walled run of the river
  const chokepoints: Chokepoint[] = [];
  const buildableXY = (x: number, y: number) => { const ix = Math.floor(x), iy = Math.floor(y); return ix >= 0 && iy >= 0 && ix < MAP && iy < MAP && buildable(cls[iy * MAP + ix]); };
  const perp = (k: number) => {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
    const tx = b.x - a.x, ty = b.y - a.y, L = Math.hypot(tx, ty) || 1;
    return { nx: -ty / L, ny: tx / L };
  };
  let bridge: Chokepoint | null = null;
  for (let k = 10; k < pts.length - 10; k++) {
    const p = pts[k], { nx, ny } = perp(k), off = p.w / 2 + 6;
    if (buildableXY(p.x + nx * off, p.y + ny * off) && buildableXY(p.x - nx * off, p.y - ny * off) && (!bridge || p.w < bridge.width))
      bridge = { kind: 'bridge', x: p.x, y: p.y, width: p.w };
  }
  const hillHit = (p: P, dx: number, dy: number, from: number, to: number) => {
    for (let t = from; t <= to; t++) {
      const ix = Math.floor(p.x + dx * t), iy = Math.floor(p.y + dy * t);
      if (ix < 0 || iy < 0 || ix >= MAP || iy >= MAP) return -1;
      if (cls[iy * MAP + ix] === TC.HILL) return t;
    }
    return -1;
  };
  const gorgeW = new Float32Array(pts.length);
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k], { nx, ny } = perp(k), from = p.w / 2 + 4, to = p.w / 2 + 40;
    const hp = hillHit(p, nx, ny, from, to), hm = hillHit(p, -nx, -ny, from, to);
    if (hp >= 0 && hm >= 0) gorgeW[k] = hp + hm;
  }
  let runA = -1, runB = -1, bestA = 0, bestLen = 0;
  for (let k = 0; k <= pts.length; k++) {
    if (k < pts.length && gorgeW[k] > 0) { if (runA < 0) runA = k; continue; }
    if (runA >= 0 && k - runA > bestLen) { bestLen = k - runA; bestA = runA; runB = k - 1; }
    runA = -1;
  }
  if (bestLen > 0) {
    const mid = (bestA + runB) >> 1;
    chokepoints.push({ kind: 'gorge', x: pts[mid].x, y: pts[mid].y, width: gorgeW[mid] });
  }
  if (bridge) chokepoints.unshift(bridge);
  return { seed: genSeed, attempt: 0, height, cls, waters, mountainEdges, highway, start, towns, chokepoints };
}

/** the shares and the reasons a map fails the v2 rules (the v1 guarantees come along from checkGuarantees) */
export function checkGuarantees2(t: Terrain): Guarantees2 {
  const N = MAP * MAP;
  let hillN = 0, buildN = 0;
  for (let i = 0; i < N; i++) { const c = t.cls[i]; if (c === TC.HILL) hillN++; else if (buildable(c)) buildN++; }
  const hill = hillN / N, buildableShare = buildN / N;
  // the edge band: how much of the band is flat buildable land (under 8 m of relief in a 5 x 5 sample window, 32 tiles)
  const B = Math.round(T2.edgeBand / HSTEP), R = 2;
  let edgeN = 0, edgeFlat = 0;
  for (let j = 0; j < HS; j++) for (let i = 0; i < HS; i++) {
    if (Math.min(i, j, HS - 1 - i, HS - 1 - j) >= B) continue;
    edgeN++;
    if (!buildable(t.cls[(j * HSTEP + HSTEP / 2) * MAP + i * HSTEP + HSTEP / 2])) continue;
    let mn = Infinity, mx = -Infinity;
    for (let jj = Math.max(0, j - R); jj <= Math.min(HS - 1, j + R); jj++)
      for (let ii = Math.max(0, i - R); ii <= Math.min(HS - 1, i + R); ii++) { const v = t.height[jj * HS + ii]; if (v < mn) mn = v; if (v > mx) mx = v; }
    if (mx - mn < T2.flatRelief) edgeFlat++;
  }
  // hills reach the edge on at least 3 sides
  const edgeHill = [0, 0, 0, 0];
  for (let e = 0; e < 4; e++) {
    let band = 0, hills = 0;
    for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
      const d = e === 0 ? y : e === 1 ? MAP - 1 - x : e === 2 ? MAP - 1 - y : x;
      if (d >= T2.edgeBand) continue;
      band++;
      if (t.cls[y * MAP + x] === TC.HILL) hills++;
    }
    edgeHill[e] = band ? hills / band : 0;
  }
  const edgesWithHills = edgeHill.filter(v => v >= 0.25).length;
  // valleys: for lowland points on a 64-tile lattice, the narrowest pair of opposite rays to a hill (8 rays, 4 axes);
  // the median over the points is the width of the valley corridors between the hill bands, in tiles
  const rays: number[] = [];
  for (let y = 32; y < MAP; y += 64) for (let x = 32; x < MAP; x += 64) {
    if (t.cls[y * MAP + x] === TC.HILL) continue;
    const d: number[] = [];
    for (let a = 0; a < 8; a++) {
      const dx = Math.round(Math.cos(a * Math.PI / 4)), dy = Math.round(Math.sin(a * Math.PI / 4));
      let k = 1;
      for (; k <= 700; k++) {
        const px = x + dx * k, py = y + dy * k;
        if (px < 0 || py < 0 || px >= MAP || py >= MAP) break;
        if (t.cls[py * MAP + px] === TC.HILL) break;
      }
      d.push(k);
    }
    rays.push(Math.min(d[0] + d[4], d[1] + d[5], d[2] + d[6], d[3] + d[7]));
  }
  rays.sort((a, b) => a - b);
  const valley = rays.length ? rays[rays.length >> 1] : 0;
  // the town sites and the start block sit in valley floors: mean local relief over each, in metres
  const reliefAt = (x0: number, y0: number, size: number) => {
    let sum = 0, n = 0;
    for (let y = y0; y < y0 + size; y += HSTEP) for (let x = x0; x < x0 + size; x += HSTEP) {
      let mn = Infinity, mx = -Infinity;
      for (let jj = -2; jj <= 2; jj++) for (let ii = -2; ii <= 2; ii++) {
        const v = sampleField(t.height, x + ii * HSTEP, y + jj * HSTEP);
        if (v < mn) mn = v; if (v > mx) mx = v;
      }
      sum += mx - mn; n++;
    }
    return n ? sum / n : 0;
  };
  const townRelief = t.towns.map(w => reliefAt(w.x, w.y, w.size));
  if (t.start.x >= 0) townRelief.push(reliefAt(t.start.x, t.start.y, t.start.size));
  const base = checkGuarantees(t);
  const reasons: string[] = [...base.reasons];
  if (hill < 0.25 || hill > 0.4) reasons.push(`hills ${pct(hill)} outside 25-40%`);
  if (buildableShare < 0.45 || buildableShare > 0.6) reasons.push(`buildable ${pct(buildableShare)} outside 45-60%`);
  if (edgeN && edgeFlat / edgeN > T2.edgeFlatMax) reasons.push(`flat edge band ${pct(edgeFlat / edgeN)} > ${pct(T2.edgeFlatMax)} of the band`);
  if (edgesWithHills < 3) reasons.push(`hills reach the edge on ${edgesWithHills} sides, need 3`);
  if (valley < T2.valleyMin || valley > T2.valleyMax) reasons.push(`median valley ${valley.toFixed(0)} tiles outside ${T2.valleyMin}-${T2.valleyMax}`);
  if (townRelief.some(v => v > 12)) reasons.push(`town/start site relief ${townRelief.map(v => v.toFixed(0)).join(', ')} m > 12`);
  return { ok: reasons.length === 0, reasons, hill, buildable: buildableShare, edgeFlat: edgeN ? edgeFlat / edgeN : 0, edgeHill, valley, townRelief, connected: base.buildableConnected };
}

/** Generate the terrain for a seed: retries with derived seeds (up to 8) until checkGuarantees2 passes. */
export function generateTerrain2(seed: number): Terrain {
  let reasons: string[] = [];
  for (let a = 0; a < 8; a++) {
    const t = build(a === 0 ? seed : hash2(seed, a));
    const rep = checkGuarantees2(t);
    if (rep.ok) { t.seed = seed; t.attempt = a; return t; }
    reasons = rep.reasons;
  }
  throw new Error(`terrain2 seed ${seed}: all 8 attempts failed: ${reasons.join('; ')}`);
}
