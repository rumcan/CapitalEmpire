// Terrain v2: organic hill country for the 4 x 4 km map (pure TypeScript, no DOM).
// Same output as src/game/terrain/generate.ts (a `Terrain`), so the engine can swap the one call. The land is one
// domain-warped height field (broad fBm plus ridged crests, tilted toward the highway's edge). The valleys are its
// drainage: steepest descent on the pit-filled grid and flow accumulation, so they branch like streams. The river is a
// meandering line cut into the ground (the drainage runs down it), a channel's floor widens with the water it carries,
// and basins that fill become lakes. Hills are ground well above the floor of its nearest channel (or steep ground near
// one), so the hill share comes from the terrain, not from a target.
import { MAP, clamp, mulberry } from '../../iso';
import { TC, HS, HSTEP, sampleField, type Chokepoint, type Edge, type Terrain, type WaterPoint, type Waterway } from '../../terrain/types';
import { makeNoise, fbm, ridged, smoothstep, hash2, type Noise } from '../../terrain/noise';
import { priorityFlood, flowDirs, flowAccum } from '../../terrain/flow';
import { checkGuarantees } from '../../terrain/generate';

/** the generator's knobs: frequencies and distances are tiles of 2 m, heights are metres */
export const T2 = {
  /** the domain warp: amplitude (tiles) and scale (tiles per noise cell), so no feature lines up on an axis */
  warpAmp: 140, warpScale: 700,
  /** the broad hills: fBm uplift (m) and its scale (tiles); the ridged crests: uplift (m, around their mean) and scale */
  baseUp: 80, baseScale: 620, ridgeUp: 130, ridgeScale: 360,
  /** the tilt toward the open edge (m across the map), so the drainage runs out there */
  tilt: 60,
  /** the mountain edges: how far in they fade (map fraction) and the uplift they carry at the border (m) */
  edgeIn: 0.13, edgeUpLo: 55, edgeUpHi: 150,
  /** the open edge (the highway's side) still gets hills in its band, fading in over this fraction (map) */
  openIn: 0.08, openUpLo: 70, openUpHi: 120,
  /** a channel cell is valley floor when it has chanMin upstream cells; its floor's half width (tiles) is hwBase + hwLog * ln(acc / chanMin), within hwBase..hwMax; the river's floor is at least riverHw */
  chanMin: 250, hwBase: 60, hwLog: 18, hwMax: 200, riverHw: 110,
  /** the floors are flat within half their width and rise 3 cm a tile away from the bed */
  floorRise: 0.03,
  /** hills: ground this far (m) above its nearest floor, or half that on a slope steeper than slopeHill (m per tile) */
  hillAbove: 13, hillSoft: 0.5, slopeHill: 0.22,
  /** the lakes: the deepest basins of the lowland cover this share of the map */
  lakeShare: 0.095,
  /** the border (outside the river and the highway valley) is raised to at least this height (m), so it never drains */
  wallH: 180,
  /** the river's meander amplitude (tiles) */
  meander: 90,
  /** the highway's valley: half-width (tiles), depth (tiles), and the creek clearance around the entry (tiles) */
  hwyHalf: 44, hwyDeep: 200, hwyClear: 30,
  /** the local valley floor: min-filter radius in height samples (5 = 40 tiles) */
  floorR: 5,
  /** the flat-edge check: the outer band (tiles), the relief (m) over a 32-tile window below which land is flat, and the most flat buildable land the band may hold */
  edgeBand: 64, flatRelief: 8, edgeFlatMax: 0.3,
  /** the median width of the valley corridors between hill bands must be in this range (tiles of 2 m) */
  valleyMin: 150, valleyMax: 400,
};

/** creeks: a channel cell needs this many upstream cells, at most MAX_CREEKS per map, a traced creek this many cells, heads this far apart */
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
const EDGES: Edge[] = ['N', 'E', 'S', 'W'];
const OPP: Record<Edge, Edge> = { N: 'S', E: 'W', S: 'N', W: 'E' };
const buildable = (c: number) => c === TC.GROUND || c === TC.PATCH;
const pct = (v: number) => (v * 100).toFixed(1) + '%';
/** a sample is hill when it stands high above its nearest floor, or is half that high on a steep slope */
const isHillS = (above: number, slope: number) => above >= T2.hillAbove || (above >= T2.hillAbove * T2.hillSoft && slope >= T2.slopeHill);
/** distance from a point (u, v) to an edge, in map fractions */
const dEdge = (e: Edge, u: number, v: number) => (e === 'W' ? u : e === 'E' ? 1 - u : e === 'N' ? v : 1 - v);
/** the point at fraction p along an edge, in map fractions */
const along = (e: Edge, p: number): P => (e === 'N' ? { x: p, y: 0 } : e === 'S' ? { x: p, y: 1 } : e === 'W' ? { x: 0, y: p } : { x: 1, y: p });
/** the entry point (a tile on the open edge) for a position along that edge */
const entryAt = (e: Edge, pos: number): P => ({ x: e === 'N' || e === 'S' ? pos : e === 'W' ? 0 : MAP - 1, y: e === 'N' ? 0 : e === 'S' ? MAP - 1 : pos });

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

/** distance (in samples) from every sample to the nearest seed sample, and that seed's index: a two-pass chamfer (1, sqrt 2) */
function nearestSeed(seed: Uint8Array, n: number): { dist: Float32Array; src: Int32Array } {
  const N = n * n, dist = new Float32Array(N).fill(1e9), src = new Int32Array(N).fill(-1);
  for (let c = 0; c < N; c++) if (seed[c]) { dist[c] = 0; src[c] = c; }
  const relax = (c: number, nb: number, w: number) => { if (dist[nb] + w < dist[c]) { dist[c] = dist[nb] + w; src[c] = src[nb]; } };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const c = y * n + x;
    if (x > 0) relax(c, c - 1, 1);
    if (y > 0) { relax(c, c - n, 1); if (x > 0) relax(c, c - n - 1, Math.SQRT2); if (x < n - 1) relax(c, c - n + 1, Math.SQRT2); }
  }
  for (let y = n - 1; y >= 0; y--) for (let x = n - 1; x >= 0; x--) {
    const c = y * n + x;
    if (x < n - 1) relax(c, c + 1, 1);
    if (y < n - 1) { relax(c, c + n, 1); if (x < n - 1) relax(c, c + n + 1, Math.SQRT2); if (x > 0) relax(c, c + n - 1, Math.SQRT2); }
  }
  return { dist, src };
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

/** one attempt: edges, the warped height field, the highway cut, the drainage and river, valley floors, classes, creeks, sites, chokepoints */
function build(genSeed: number): Terrain {
  const r = mulberry(genSeed);
  // 1. edges: mountains on 3 sides; the fourth is open for the highway and the river's mouth; the river rises on the source edge
  const mountainEdges: Edge[] = [];
  while (mountainEdges.length < 3) { const e = EDGES[Math.floor(r() * 4)]; if (!mountainEdges.includes(e)) mountainEdges.push(e); }
  const exit = EDGES.find(e => !mountainEdges.includes(e))!;
  const source = OPP[exit];
  const sp = along(source, 0.25 + 0.5 * r()), ep = along(exit, 0.25 + 0.5 * r());
  const hwyPos = (0.2 + 0.6 * r()) * MAP; // tiles along the open edge
  // 2. one noise per purpose, all derived from the seed
  const nk = (k: number): Noise => makeNoise(hash2(genSeed, k));
  const nWx = nk(1), nWy = nk(2), nBase = nk(3), nRidge = nk(4), nEdge = nk(5), nEdgeR = nk(6), nOpen = nk(7);
  const nFine = nk(8), nWidth = nk(9), nPatch = nk(10), nMeander = nk(11), nBend = nk(12);
  // 3. the height field on the sample grid: broad fBm plus ridged crests, both sampled at domain-warped positions,
  //    the tilt toward the open edge, and the mountain and open-edge uplifts
  const hraw = new Float32Array(HS * HS);
  const ws = T2.warpScale;
  for (let j = 0; j < HS; j++) for (let i = 0; i < HS; i++) {
    const k = j * HS + i, x = i * HSTEP + HSTEP / 2, y = j * HSTEP + HSTEP / 2, u = x / MAP, v = y / MAP;
    const wx = x + T2.warpAmp * fbm(nWx, x / ws, y / ws, 3), wy = y + T2.warpAmp * fbm(nWy, x / ws, y / ws, 3);
    const base = T2.baseUp * fbm(nBase, wx / T2.baseScale, wy / T2.baseScale, 5);
    const crest = T2.ridgeUp * (ridged(nRidge, wx / T2.ridgeScale, wy / T2.ridgeScale, 4) - 0.5);
    const tilt = T2.tilt * clamp(dEdge(exit, clamp(wx / MAP, 0, 1), clamp(wy / MAP, 0, 1)), 0, 1);
    const edgeWarp = 0.12 * fbm(nEdge, u * 3, v * 3, 4);
    let m = 0;
    for (const e of mountainEdges) {
      const d = clamp(dEdge(e, u, v) + edgeWarp, 0, 1);
      m = Math.max(m, Math.pow(clamp(1 - d / T2.edgeIn, 0, 1), 0.7));
    }
    const edge = m * (T2.edgeUpLo + (T2.edgeUpHi - T2.edgeUpLo) * ridged(nEdgeR, u * 9, v * 9, 4));
    const dOpen = clamp(1 - dEdge(exit, u, v) / T2.openIn, 0, 1);
    const open = (0.75 + 0.25 * dOpen) * (T2.openUpLo + (T2.openUpHi - T2.openUpLo) * ridged(nOpen, u * 7 + 11.3, v * 7 + 4.7, 3));
    hraw[k] = base + crest + tilt + Math.max(edge, open);
  }
  // 4. the highway's valley: a cut (never a fill) from the entry inland, its floor at the entry's height, so the
  //    highway has a valley to come in by; the tongue is marked so the classes keep it buildable
  const e0 = entryAt(exit, hwyPos), hb = sampleField(hraw, e0.x, e0.y);
  const tongue = new Float32Array(HS * HS);
  for (let j = 0; j < HS; j++) for (let i = 0; i < HS; i++) {
    const x = i * HSTEP + HSTEP / 2, y = j * HSTEP + HSTEP / 2;
    const t = exit === 'N' ? y : exit === 'S' ? MAP - y : exit === 'W' ? x : MAP - x; // depth inland
    const lat = Math.abs((exit === 'N' || exit === 'S' ? x : y) - hwyPos);
    const w = smoothstep(T2.hwyDeep + 70, T2.hwyDeep - 20, t) * smoothstep(T2.hwyHalf + 40, T2.hwyHalf - 4, lat);
    if (w <= 0) continue;
    const k = j * HS + i;
    tongue[k] = w;
    hraw[k] += (Math.min(hraw[k], hb + 0.02 * t) - hraw[k]) * w;
  }
  // 5. the river: a winding line from the source edge to the exit edge (control points bent by noise, smoothed and
  //    meandered). Its bed is a running minimum of the ground along the line, so it never climbs, and the ground within
  //    16 tiles is cut down to that bed: the drainage then runs down the river, which is the biggest channel by construction
  const rHead: P = { x: sp.x * MAP, y: sp.y * MAP }, rTail: P = { x: ep.x * MAP, y: ep.y * MAP };
  const cp: P[] = [rHead];
  const ndx = rTail.x - rHead.x, ndy = rTail.y - rHead.y, nl = Math.hypot(ndx, ndy) || 1;
  const bend = 0.18 * MAP;
  for (let k = 1; k <= 3; k++) {
    const t = k / 4, off = bend * fbm(nBend, t * 2.7, 4.1, 3);
    cp.push({ x: clamp(rHead.x + ndx * t - (ndy / nl) * off, 0.2 * MAP, 0.8 * MAP), y: clamp(rHead.y + ndy * t + (ndx / nl) * off, 0.2 * MAP, 0.8 * MAP) });
  }
  cp.push(rTail);
  let line: P[] = cp;
  for (let it = 0; it < 3; it++) line = chaikin(line);
  line = meander(resample(line, 8), nMeander, 0.5, T2.meander, 190);
  const arc = [0];
  for (let k = 1; k < line.length; k++) arc.push(arc[k - 1] + Math.hypot(line[k].x - line[k - 1].x, line[k].y - line[k - 1].y));
  const pts: WaterPoint[] = line.map((p, k) => ({ x: p.x, y: p.y, w: clamp(20 + 20 * (0.5 + 0.5 * nWidth(arc[k] / 300, 0)), 20, 40) }));
  const waters: Waterway[] = [{ kind: 'river', pts }];
  const bed = new Float32Array(line.length);
  bed[0] = sampleField(hraw, line[0].x, line[0].y);
  for (let k = 1; k < line.length; k++) bed[k] = Math.min(sampleField(hraw, line[k].x, line[k].y), bed[k - 1] - 0.01 * (arc[k] - arc[k - 1]));
  // the nearest point of the river line to every sample (squared distance in tiles, and the bed there)
  const riverD2 = new Float32Array(HS * HS).fill(Infinity), riverBed = new Float32Array(HS * HS);
  for (let k = 0; k + 1 < line.length; k++) {
    const a = line[k], b = line[k + 1], reach = T2.riverHw;
    const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - reach) / HSTEP)), i1 = Math.min(HS - 1, Math.ceil((Math.max(a.x, b.x) + reach) / HSTEP));
    const j0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - reach) / HSTEP)), j1 = Math.min(HS - 1, Math.ceil((Math.max(a.y, b.y) + reach) / HSTEP));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = i * HSTEP + HSTEP / 2, y = j * HSTEP + HSTEP / 2;
      const d = segDist(x, y, a.x, a.y, b.x, b.y), k2 = j * HS + i;
      if (d * d < riverD2[k2]) { riverD2[k2] = d * d; riverBed[k2] = bed[k] + (bed[k + 1] - bed[k]) * lastT; }
    }
  }
  for (let k = 0; k < HS * HS; k++) if (riverD2[k] <= 16 * 16) hraw[k] = Math.min(hraw[k], riverBed[k]);
  // the border: only the river's ends and the highway's valley may drain off the map, so the basins drain into the one
  // river and the lowland is one connected valley system; the rest of the border is raised to a wall
  for (let j = 0; j < HS; j++) for (let i = 0; i < HS; i++) {
    if (!(i === 0 || j === 0 || i === HS - 1 || j === HS - 1)) continue;
    const k = j * HS + i;
    if (riverD2[k] > 16 * 16 && tongue[k] === 0) hraw[k] = Math.max(hraw[k], T2.wallH);
  }
  // 6. drainage: fill the pits, route every sample to its steepest neighbour, accumulate the flow (a small fine noise breaks ties)
  const D = new Float32Array(HS * HS);
  for (let j = 0; j < HS; j++) for (let i = 0; i < HS; i++) D[j * HS + i] = hraw[j * HS + i] + 3 * fbm(nFine, ((i + 0.5) / HS) * 14, ((j + 0.5) / HS) * 14, 4);
  const F = priorityFlood(D, HS), dir = flowDirs(F, HS), acc = flowAccum(dir, HS, F);
  // 7. channels: every cell with enough upstream cells, and the river's own samples; a channel's floor half width grows with its flow
  const chan = new Uint8Array(HS * HS), hwC = new Float32Array(HS * HS);
  for (let c = 0; c < HS * HS; c++) {
    if (acc[c] < T2.chanMin) continue;
    chan[c] = 1;
    hwC[c] = clamp(T2.hwBase + T2.hwLog * Math.log(acc[c] / T2.chanMin), T2.hwBase, T2.hwMax);
  }
  for (let c = 0; c < HS * HS; c++) if (riverD2[c] <= HSTEP * HSTEP) { chan[c] = 1; hwC[c] = Math.max(hwC[c], T2.riverHw); }
  const { dist, src } = nearestSeed(chan, HS);
  // 8. the valley floors: each sample is pulled toward the bed of its nearest channel, flat inside half the floor's width
  const height = new Float32Array(HS * HS), above = new Float32Array(HS * HS), slope = new Float32Array(HS * HS);
  for (let k = 0; k < HS * HS; k++) {
    const s = src[k], d = dist[k] * HSTEP, hw = hwC[s], bed = F[s];
    const w = smoothstep(hw, hw * 0.5, d);
    height[k] = hraw[k] + (bed + T2.floorRise * d - hraw[k]) * w;
    above[k] = (height[k] - bed) * (1 - smoothstep(0.2, 0.8, tongue[k]));
  }
  for (let j = 0; j < HS; j++) for (let i = 0; i < HS; i++) {
    const ie = Math.min(HS - 1, i + 1), iw = Math.max(0, i - 1), jn = Math.min(HS - 1, j + 1), js = Math.max(0, j - 1);
    const gx = (height[j * HS + ie] - height[j * HS + iw]) / ((ie - iw) * HSTEP), gy = (height[jn * HS + i] - height[js * HS + i]) / ((jn - js) * HSTEP);
    slope[j * HS + i] = Math.hypot(gx, gy);
  }
  // 9. local relief, for scoring sites (how far the ground rises above the lowest point within 40 tiles)
  const floorMin = minFilter(height, HS, T2.floorR);
  const relief = new Float32Array(HS * HS);
  for (let k = 0; k < HS * HS; k++) relief[k] = height[k] - floorMin[k];
  const cellP = (c: number): P => ({ x: (c % HS) * HSTEP + HSTEP / 2, y: Math.floor(c / HS) * HSTEP + HSTEP / 2 });
  // 10. creeks: heads at the foot of the hills come down the drainage to the river, a junction or the border (v1's method)
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
    if (anyNear(c, 1, n => dir[n] === c && isChannel(n))) continue;
    if (!anyNear(c, 3, n => isHillS(above[n], slope[n]))) continue; // a head sits at the foot of the hills
    heads.push(c);
  }
  // trace a head down until a river cell or the border (it ends there), or a claimed cell (a junction: included)
  const traceCreek = (h: number): { cells: number[]; join: number } => {
    const cells: number[] = [];
    if (claimedBy[h]) return { cells, join: -1 };
    let c = h, join = -1;
    for (;;) {
      cells.push(c);
      if (riverCell[c] || dir[c] < 0) break;
      const nx = dir[c];
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
      if (riverCell[c] || dir[c] < 0) break;
      c = dir[c];
      if (cells.length > HS * HS) break;
    }
    return cells;
  };
  /** a creek's polyline from its routing cells: smoothed, meandered, with widths from the flow accumulation */
  const creekLine = (cells: number[], idx: number): WaterPoint[] => {
    const cellPts: P[] = cells.map(c => cellP(c));
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
  const isHillP = (p: P) => { const ix = Math.floor(p.x), iy = Math.floor(p.y); return ix >= 0 && iy >= 0 && ix < MAP && iy < MAP && isHillS(above[(iy >> 3) * HS + (ix >> 3)], slope[(iy >> 3) * HS + (ix >> 3)]); };
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
  // 11. the classes: hills where isHillS says so, patches over some ground, then the river and the creeks cut in
  // the basins: where the drainage had to fill a pit, the water stands at the spill level (lakes). The deepest basins
  // among the lowland cover T2.lakeShare of the map, so the lakes take the same share of every map
  const pond = new Float32Array(HS * HS);
  for (let k = 0; k < HS * HS; k++) pond[k] = F[k] - D[k];
  const hillC = new Uint8Array(G * G), pondC = new Float32Array(G * G), lowC = new Float32Array(G * G);
  let nLow = 0;
  for (let cj = 0; cj < G; cj++) for (let ci = 0; ci < G; ci++) {
    const c = cj * G + ci, cx = ci * CELL + CELL / 2, cy = cj * CELL + CELL / 2;
    hillC[c] = isHillS(sampleField(above, cx, cy), sampleField(slope, cx, cy)) ? 1 : 0;
    pondC[c] = sampleField(pond, cx, cy);
    if (!hillC[c]) lowC[nLow++] = pondC[c];
  }
  const sortedLow = lowC.subarray(0, nLow).sort();
  const want = Math.round(T2.lakeShare * G * G);
  const lakeAt = want > 0 && nLow > 0 ? Math.max(0.5, sortedLow[Math.max(0, nLow - want)]) : Infinity;
  const cls = new Uint8Array(MAP * MAP);
  for (let cj = 0; cj < G; cj++) for (let ci = 0; ci < G; ci++) {
    const c0 = cj * G + ci;
    const patch = fbm(nPatch, (ci * CELL + 2) / 180, (cj * CELL + 2) / 180, 4) > 0.35;
    const lake = !hillC[c0] && pondC[c0] > lakeAt;
    const c = hillC[c0] ? TC.HILL : lake ? TC.WATER : patch ? TC.PATCH : TC.GROUND;
    for (let y = cj * CELL; y < cj * CELL + CELL; y++) for (let x = ci * CELL; x < ci * CELL + CELL; x++) cls[y * MAP + x] = c;
  }
  // the passes: a lowland pocket cut off by hills is joined to the main lowland through the fewest hill cells, and those
  // cells become ground, so the valley floors stay one connected system. One 0-1 breadth-first search from the main
  // lowland (entering a hill cell costs 1, lowland 0) gives every cell its way back; each pocket walks that way home.
  const N2 = G * G, hillG = new Uint8Array(N2);
  for (let c = 0; c < N2; c++) hillG[c] = cls[Math.floor(c / G) * CELL * MAP + (c % G) * CELL] === TC.HILL ? 1 : 0;
  const lab = new Int32Array(N2), sizes: number[] = [];
  for (let s = 0; s < N2; s++) {
    if (hillG[s] || lab[s]) continue;
    const id = sizes.length + 1; let size = 0; const stack = [s]; lab[s] = id;
    while (stack.length) {
      const c = stack.pop()!; size++;
      const x = c % G, y = (c - x) / G;
      if (x > 0 && !hillG[c - 1] && !lab[c - 1]) { lab[c - 1] = id; stack.push(c - 1); }
      if (x < G - 1 && !hillG[c + 1] && !lab[c + 1]) { lab[c + 1] = id; stack.push(c + 1); }
      if (y > 0 && !hillG[c - G] && !lab[c - G]) { lab[c - G] = id; stack.push(c - G); }
      if (y < G - 1 && !hillG[c + G] && !lab[c + G]) { lab[c + G] = id; stack.push(c + G); }
    }
    sizes.push(size);
  }
  if (sizes.length > 1) {
    let big = 1;
    for (let k = 2; k <= sizes.length; k++) if (sizes[k - 1] > sizes[big - 1]) big = k;
    const passDq = new Int32Array(8 * N2), passDist = new Int32Array(N2).fill(1e9), passPrev = new Int32Array(N2);
    const firstOf = new Int32Array(sizes.length + 1).fill(-1);
    let hd = 4 * N2, tl = hd;
    for (let c = 0; c < N2; c++) {
      if (lab[c] !== big) { if (firstOf[lab[c]] < 0) firstOf[lab[c]] = c; continue; }
      passDist[c] = 0; passDq[tl++] = c;
    }
    while (hd < tl) {
      const c = passDq[hd++], x = c % G, y = (c - x) / G;
      for (let q = 0; q < 4; q++) {
        const nb = q === 0 ? (x > 0 ? c - 1 : -1) : q === 1 ? (x < G - 1 ? c + 1 : -1) : q === 2 ? (y > 0 ? c - G : -1) : (y < G - 1 ? c + G : -1);
        if (nb < 0) continue;
        const w = hillG[nb], nd = passDist[c] + w;
        if (nd >= passDist[nb]) continue;
        passDist[nb] = nd; passPrev[nb] = c;
        if (w) passDq[tl++] = nb; else passDq[--hd] = nb;
      }
    }
    for (let p = 1; p <= sizes.length; p++) {
      if (p === big || firstOf[p] < 0 || passDist[firstOf[p]] >= 1e9) continue;
      for (let c = firstOf[p]; passDist[c] > 0; c = passPrev[c]) {
        if (!hillG[c]) continue;
        hillG[c] = 0;
        const ci = c % G, cj = (c - ci) / G;
        for (let y = cj * CELL; y < cj * CELL + CELL; y++) for (let x = ci * CELL; x < ci * CELL + CELL; x++) cls[y * MAP + x] = TC.GROUND;
      }
    }
  }
  rasterRiver(cls, pts);
  for (const cr of creekPts) rasterCreek(cls, cr);
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
  const EB = T2.edgeBand;
  for (let e = 0; e < 4; e++) {
    // the band of edge e (N = y < EB, E = x >= MAP - EB, S = y >= MAP - EB, W = x < EB), scanned rows or columns only
    let band = 0, hills = 0;
    const y0 = e === 2 ? MAP - EB : 0, y1 = e === 0 ? EB : MAP, x0 = e === 1 ? MAP - EB : 0, x1 = e === 3 ? EB : MAP;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
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
