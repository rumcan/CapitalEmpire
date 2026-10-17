import { MAP, clamp, mulberry } from '../iso';
import { TC, HS, HSTEP, sampleField, type Edge, type Terrain, type Waterway, type WaterPoint, type Chokepoint } from './types';
import { makeNoise, fbm, ridged, smoothstep, hash2, type Noise } from './noise';
import { priorityFlood, flowDirs, flowAccum, traceDown } from './flow';

/** creeks: a channel cell needs this many upstream samples to count as a channel */
const CREEK_MIN_ACC = 60;
/** creeks: at most this many per map */
const MAX_CREEKS = 6;
/** creeks: a traced creek needs at least this many samples */
const CREEK_MIN_CELLS = 30;
/** creeks: heads of accepted creeks are at least this many samples apart (Chebyshev) */
const CREEK_HEAD_GAP = 40;

/** the result of checking the generator's guarantees; ms is how long the check took */
export interface GuaranteeReport { ok: boolean; reasons: string[]; buildableConnected: number; sideA: number; sideB: number; ms?: number }

type P = { x: number; y: number };
const EDGES: Edge[] = ['N', 'E', 'S', 'W'];
const OPP: Record<Edge, Edge> = { N: 'S', E: 'W', S: 'N', W: 'E' };
const buildable = (c: number) => c === TC.GROUND || c === TC.PATCH;
const pct = (v: number) => (v * 100).toFixed(1) + '%';

/** distance from a sample (u, v) to an edge, in map fractions */
const dEdge = (e: Edge, u: number, v: number) => (e === 'W' ? u : e === 'E' ? 1 - u : e === 'N' ? v : 1 - v);
/** the point at fraction p along an edge */
const along = (e: Edge, p: number): P => (e === 'N' ? { x: p, y: 0 } : e === 'S' ? { x: p, y: 1 } : e === 'W' ? { x: 0, y: p } : { x: 1, y: p });

/** distance from (px, py) to segment a-b; writes the clamped projection (0..1) to lastT */
let lastT = 0;
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = clamp(L2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0, 0, 1);
  lastT = t;
  const qx = ax + dx * t - px, qy = ay + dy * t - py;
  return Math.sqrt(qx * qx + qy * qy);
}

/** signed distance to the water edge (centreline distance minus half the local width); negative inside the river */
function waterDist(pts: WaterPoint[], x: number, y: number): number {
  let best = Infinity;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1];
    const dd = segDist(x, y, a.x, a.y, b.x, b.y);
    best = Math.min(best, dd - (a.w + (b.w - a.w) * lastT) / 2);
  }
  return best;
}

/** bilinear uplift-style sample of an HS field at tile (x, y), same layout as heightAt */
const bil = (f: Float32Array, x: number, y: number) => sampleField(f, x, y);

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

/** label buffer and stack shared by the component passes (reused, not allocated per tile) */
let LAB: Int32Array | null = null;
let STK = new Int32Array(1 << 16);
function growStack() { const g = new Int32Array(STK.length * 2); g.set(STK); STK = g; }

/** label the 4-connected components of passable (or buildable-only) tiles with a scanline fill; sizes[k] is label k+1 */
function labelComponents(cls: Uint8Array, land: boolean): { lab: Int32Array; sizes: number[] } {
  const N = MAP * MAP;
  const lab = LAB ?? (LAB = new Int32Array(N));
  for (let i = 0; i < N; i++) { const c = cls[i]; lab[i] = (land ? buildable(c) || c === TC.CREEK : c !== TC.HILL) ? 0 : -1; }
  const sizes: number[] = [];
  for (let s = 0; s < N; s++) {
    if (lab[s] !== 0) continue;
    const id = sizes.length + 1;
    let sp = 0, size = 0;
    STK[sp++] = s;
    while (sp > 0) {
      const p = STK[--sp];
      if (lab[p] !== 0) continue;
      const y = (p / MAP) | 0, row = y * MAP;
      let x0 = p - row, x1 = x0;
      while (x0 > 0 && lab[row + x0 - 1] === 0) x0--;
      while (x1 < MAP - 1 && lab[row + x1 + 1] === 0) x1++;
      for (let x = x0; x <= x1; x++) lab[row + x] = id;
      size += x1 - x0 + 1;
      for (let d = -1; d <= 1; d += 2) {
        const ny = y + d;
        if (ny < 0 || ny >= MAP) continue;
        const nr = ny * MAP;
        let inRun = false;
        for (let x = x0; x <= x1; x++) {
          if (lab[nr + x] !== 0) { inRun = false; continue; }
          if (!inRun) { inRun = true; if (sp === STK.length) growStack(); STK[sp++] = nr + x; }
        }
      }
    }
    sizes.push(size);
  }
  return { lab, sizes };
}

/** what the checks and the generator need from a finished map */
export function checkGuarantees(t: Terrain): GuaranteeReport {
  const t0 = performance.now();
  const reasons: string[] = [];
  const N = MAP * MAP;
  const pass = labelComponents(t.cls, false);
  let bestId = 0, bestSize = 0;
  for (let k = 0; k < pass.sizes.length; k++) if (pass.sizes[k] > bestSize) { bestSize = pass.sizes[k]; bestId = k + 1; }
  let bBuild = 0;
  if (bestId) for (let i = 0; i < N; i++) if (pass.lab[i] === bestId && buildable(t.cls[i])) bBuild++;
  const buildableConnected = bBuild / N;
  // creeks count as land here: they are crossed by culverts
  const sides = labelComponents(t.cls, true).sizes.sort((a, b) => b - a);
  const sideA = (sides[0] ?? 0) / N, sideB = (sides[1] ?? 0) / N;
  if (buildableConnected < 0.55) reasons.push(`buildable land connected ${pct(buildableConnected)} < 55%`);
  if (sideA < 0.15 || sideB < 0.15) reasons.push(`river does not split land: sides ${pct(sideA)} / ${pct(sideB)}, need both >= 15%`);
  if (t.highway.x < 0) reasons.push('no highway entry');
  if (t.start.x < 0) reasons.push('no start block');
  else {
    let bad = 0;
    for (let y = t.start.y; y < t.start.y + t.start.size; y++) for (let x = t.start.x; x < t.start.x + t.start.size; x++) if (!buildable(t.cls[y * MAP + x])) bad++;
    if (bad) reasons.push(`start block has ${bad} unbuildable tiles`);
  }
  if (t.chokepoints.length < 1) reasons.push('no chokepoint (bridge or gorge)');
  return { ok: reasons.length === 0, reasons, buildableConnected, sideA, sideB, ms: performance.now() - t0 };
}

/** one attempt: edges, height field, main river, classes, highway entry, start block, chokepoints */
function build(genSeed: number): Terrain {
  const r = mulberry(genSeed);
  // 1. edges: 2 or 3 mountain edges, a random exit off them, the source opposite the exit
  const nMount = r() < 0.5 ? 2 : 3;
  const mountainEdges: Edge[] = [];
  while (mountainEdges.length < nMount) { const e = EDGES[Math.floor(r() * 4)]; if (!mountainEdges.includes(e)) mountainEdges.push(e); }
  const exitOpts = EDGES.filter(e => !mountainEdges.includes(e));
  const exit = exitOpts[Math.floor(r() * exitOpts.length)];
  const source = OPP[exit];
  // 2. river guide: source and exit points on their edges
  const sp = along(source, 0.3 + 0.4 * r());
  const ep = along(exit, 0.3 + 0.4 * r());
  // noise per purpose: 1 warp, 2 base, 3 mountain edge, 4 ridge, 5 butte, 6-7 butte warp, 8 butte ridge, 9 river width, 10 hill detail, 11 patches
  const nk = (k: number): Noise => makeNoise(hash2(genSeed, k));
  const nWarp = nk(1), nBase = nk(2), nEdge = nk(3), nRidge = nk(4), nB = nk(5), nW1 = nk(6), nW2 = nk(7), nB2 = nk(8), nWidth = nk(9), nDetail = nk(10), nPatch = nk(11);
  const gdx = ep.x - sp.x, gdy = ep.y - sp.y, gL2 = gdx * gdx + gdy * gdy;
  const guideDist = (u: number, v: number) => {
    // the warp fades to zero at both ends of the guide so the river stays pinned to its source and exit
    const t = clamp(((u - sp.x) * gdx + (v - sp.y) * gdy) / gL2, 0, 1);
    const taper = smoothstep(0, 0.15, t) * smoothstep(1, 0.85, t);
    const qx = u + 0.08 * taper * fbm(nWarp, u * 3, v * 3, 3);
    const qy = v + 0.08 * taper * fbm(nWarp, u * 3 + 5.2, v * 3 + 1.3, 3);
    return segDist(qx, qy, sp.x, sp.y, ep.x, ep.y);
  };
  // 3-4. height field: valley base plus hill uplift (mountains, buttes), cut by the river gorge, in 4 m terraces
  const height = new Float32Array(HS * HS), uplift = new Float32Array(HS * HS);
  // creek routing height: the river's height plus a finer wobble, so creeks get their own flow field
  const heightC = new Float32Array(HS * HS);
  for (let j = 0; j < HS; j++) for (let i = 0; i < HS; i++) {
    const u = (i + 0.5) / HS, v = (j + 0.5) / HS, k = j * HS + i;
    const gd = guideDist(u, v);
    const base = 6 * fbm(nBase, u * 3, v * 3, 4) + 40 * dEdge(exit, u, v) + 70 * gd;
    const fine = 12 * fbm(nBase, u * 14 + 9.1, v * 14 + 3.7, 3);
    const edgeN = fbm(nEdge, u * 3, v * 3, 4);
    let m = 0;
    for (const e of mountainEdges) m = Math.max(m, smoothstep(0.16, 0.03, dEdge(e, u, v) + 0.09 * edgeN));
    const upM = m * (250 + 350 * ridged(nRidge, u * 6, v * 6, 5));
    const w = fbm(nB, u * 4 + 1.5 * fbm(nW1, u * 2, v * 2, 3), v * 4 + 1.5 * fbm(nW2, u * 2, v * 2, 3), 4);
    const b = smoothstep(0.40, 0.48, w) * (1 - smoothstep(0.1, 0.4, m));
    const upB = b * (40 + 40 * ridged(nB2, u * 8, v * 8, 3));
    let up = Math.max(upM, upB);
    up *= smoothstep(0.015, 0.05, gd);
    const q = up / 4, fl = Math.floor(q);
    up = 4 * (fl + smoothstep(0.75, 1, q - fl));
    uplift[k] = up;
    height[k] = base + up;
    heightC[k] = base + up + fine;
  }
  // 5. main river: steepest descent from just inside the source edge, smoothed, resampled, run off both ends
  const filled = priorityFlood(height, HS);
  const dir = flowDirs(filled, HS);
  let si = clamp(Math.round(sp.x * HS - 0.5), 0, HS - 1), sj = clamp(Math.round(sp.y * HS - 0.5), 0, HS - 1);
  if (source === 'N') sj += 6; else if (source === 'S') sj -= 6; else if (source === 'W') si += 6; else si -= 6;
  si = clamp(si, 0, HS - 1); sj = clamp(sj, 0, HS - 1);
  const riverCells = traceDown(dir, sj * HS + si);
  let path: P[] = riverCells.map(c => ({ x: (c % HS) * HSTEP + HSTEP / 2, y: ((c / HS) | 0) * HSTEP + HSTEP / 2 }));
  for (let it = 0; it < 3; it++) path = chaikin(path);
  path = resample(path, 8);
  // the river enters at the source point on its edge, and leaves straight out perpendicular to the nearest border
  const head: P = { x: sp.x * MAP, y: sp.y * MAP };
  const last = path[path.length - 1];
  const dN = last.y, dS = MAP - last.y, dW = last.x, dE = MAP - last.x, dMin = Math.min(dN, dS, dW, dE);
  const tail: P = dMin === dN ? { x: last.x, y: 0 } : dMin === dS ? { x: last.x, y: MAP } : dMin === dW ? { x: 0, y: last.y } : { x: MAP, y: last.y };
  path = [head, ...path, tail];
  const pts: WaterPoint[] = [];
  let s = 0;
  for (let k = 0; k < path.length; k++) {
    if (k > 0) s += Math.hypot(path[k].x - path[k - 1].x, path[k].y - path[k - 1].y);
    pts.push({ x: path[k].x, y: path[k].y, w: clamp(20 + 20 * (0.5 + 0.5 * nWidth(s / 300, 0)), 20, 40) });
  }
  const waters: Waterway[] = [{ kind: 'river', pts }];
  // 6. classes: hills and patches from the detail grids, then river water and banks on top
  const cls = new Uint8Array(MAP * MAP);
  const G = 512;
  const detailG = new Float32Array(G * G), patchG = new Float32Array(G * G);
  for (let cj = 0; cj < G; cj++) for (let ci = 0; ci < G; ci++) {
    const x = ci * 4 + 2, y = cj * 4 + 2, c = cj * G + ci;
    detailG[c] = fbm(nDetail, x / 24, y / 24, 3);
    patchG[c] = fbm(nPatch, x / 180, y / 180, 4);
  }
  for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
    const c = (y >> 2) * G + (x >> 2), k = y * MAP + x;
    if (bil(uplift, x, y) >= 3 + 2 * detailG[c]) cls[k] = TC.HILL;
    else if (patchG[c] > 0.35) cls[k] = TC.PATCH;
  }
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
  // 6b. creeks: channel heads fed by hills come down the flow directions to the river, a junction, or the border
  // creeks route on their own field (heightC), so their paths are not the river's
  const filledC = priorityFlood(heightC, HS), dirC = flowDirs(filledC, HS), acc = flowAccum(dirC, HS, filledC);
  const riverCell = new Uint8Array(HS * HS);
  // the river mask is dilated by 2 cells, so a creek path that slips diagonally past the river still stops at it
  for (const c of riverCells) {
    const x = c % HS, y = (c - x) / HS;
    for (let yy = Math.max(0, y - 2); yy <= Math.min(HS - 1, y + 2); yy++)
      for (let xx = Math.max(0, x - 2); xx <= Math.min(HS - 1, x + 2); xx++) riverCell[yy * HS + xx] = 1;
  }
  // 0 = free, otherwise the accepted creek index + 1 that claimed the cell
  const claimedBy = new Int16Array(HS * HS);
  const isChannel = (c: number) => acc[c] >= CREEK_MIN_ACC;
  // true if any cell within Chebyshev radius r of c (c included) passes pred
  const anyNear = (c: number, r: number, pred: (n: number) => boolean) => {
    const x = c % HS, y = (c - x) / HS;
    for (let yy = Math.max(0, y - r); yy <= Math.min(HS - 1, y + r); yy++)
      for (let xx = Math.max(0, x - r); xx <= Math.min(HS - 1, x + r); xx++) if (pred(yy * HS + xx)) return true;
    return false;
  };
  const heads: number[] = [];
  for (let c = 0; c < HS * HS; c++) {
    if (!isChannel(c)) continue;
    if (anyNear(c, 1, n => dirC[n] === c && isChannel(n))) continue;
    if (!anyNear(c, 3, n => uplift[n] > 0)) continue;
    heads.push(c);
  }
  // trace a head down until a river cell or the border (it ends there), or a claimed cell (a junction: included, join = its creek)
  const traceCreek = (head: number): { cells: number[]; join: number } => {
    const cells: number[] = [];
    if (claimedBy[head]) return { cells, join: -1 };
    let c = head, join = -1;
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
  // a junction ends on the nearest point of the creek it joins (projected onto its segments); null if that creek is gone
  // or the nearest point is more than 40 tiles from the old end (the junction was lost to trimming)
  // true if a point more than 48 tiles of arc from the creek's end lies within 24 tiles of a map border
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
  const nMeander = nk(12);
  const finals: (WaterPoint[] | null)[] = [];
  accepted.forEach((cr, idx) => {
    const cellPts: P[] = cr.cells.map(c => ({ x: (c % HS) * HSTEP + HSTEP / 2, y: ((c - (c % HS)) / HS) * HSTEP + HSTEP / 2 }));
    let line = cellPts;
    for (let it = 0; it < 3; it++) line = chaikin(line);
    line = resample(line, 6);
    // arc length, then meander: interior points offset perpendicular to the path
    const sArc = [0];
    for (let k = 1; k < line.length; k++) sArc.push(sArc[k - 1] + Math.hypot(line[k].x - line[k - 1].x, line[k].y - line[k - 1].y));
    const moved: P[] = line.map((p, k) => {
      if (k === 0 || k === line.length - 1) return p;
      // tangent over +-4 points so the offset doesn't flip at the D8 corners; the meander fades out over 60 tiles at both ends
      const a = line[Math.max(0, k - 4)], b = line[Math.min(line.length - 1, k + 4)], L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const fade = smoothstep(0, 60, sArc[k]) * smoothstep(0, 60, sArc[line.length - 1] - sArc[k]);
      const off = fade * (16 * fbm(nMeander, sArc[k] / 160, idx * 7.3, 3) + 3 * nMeander(sArc[k] / 30, idx * 7.3 + 50));
      return { x: p.x - (b.y - a.y) / L * off, y: p.y + (b.x - a.x) / L * off };
    });
    // width from the accumulation of the nearest original cell
    const cpts: WaterPoint[] = moved.map(p => {
      let best = 0, bd = Infinity;
      for (let j = 0; j < cellPts.length; j++) {
        const d = (cellPts[j].x - p.x) ** 2 + (cellPts[j].y - p.y) ** 2;
        if (d < bd) { bd = d; best = j; }
      }
      const a = acc[cr.cells[best]];
      return { x: p.x, y: p.y, w: clamp(3 + 5 * clamp(Math.log(a / CREEK_MIN_ACC) / Math.log(20), 0, 1), 3, 8) };
    });
    // drop the leading hill points, keeping the last so the creek emerges from the hill edge
    const isHill = (p: P) => { const ix = Math.floor(p.x), iy = Math.floor(p.y); return ix >= 0 && iy >= 0 && ix < MAP && iy < MAP && cls[iy * MAP + ix] === TC.HILL; };
    let i0 = 0;
    while (i0 < cpts.length && isHill(cpts[i0])) i0++;
    const trimmed = cpts.slice(Math.max(0, i0 - 1));
    // accepted creeks are processed in order, so the creek this one joins is already final
    const fin0 = trimmed.length < 8 ? null : trimmed;
    let fin = fin0 && cr.join >= 0 ? joinTo(fin0, finals[cr.join]) : fin0;
    // a creek that runs within 24 tiles of a border (more than 48 tiles of arc from its end) is dropped
    if (fin && hugsBorder(fin)) fin = null;
    finals.push(fin);
  });
  for (const fin of finals) {
    if (!fin) continue;
    const trimmed = fin;
    waters.push({ kind: 'creek', pts: trimmed });
    // raster: creeks cut only ground and patches, with no bank ring
    for (let k = 0; k + 1 < trimmed.length; k++) {
      const a = trimmed[k], b = trimmed[k + 1], mw = Math.max(a.w, b.w) / 2 + 4;
      const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - mw)), x1 = Math.min(MAP - 1, Math.ceil(Math.max(a.x, b.x) + mw));
      const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - mw)), y1 = Math.min(MAP - 1, Math.ceil(Math.max(a.y, b.y) + mw));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const dd = segDist(x + 0.5, y + 0.5, a.x, a.y, b.x, b.y);
        const e = dd - (a.w + (b.w - a.w) * lastT) / 2, idx2 = y * MAP + x;
        if (e <= 0 && (cls[idx2] === TC.GROUND || cls[idx2] === TC.PATCH)) cls[idx2] = TC.CREEK;
      }
    }
  }
  // integral image of buildable tiles: I[y*(MAP+1)+x] counts buildable tiles in [0,x) x [0,y)
  const S = MAP + 1;
  const I = new Int32Array(S * S);
  for (let y = 0; y < MAP; y++) {
    let row = 0;
    for (let x = 0; x < MAP; x++) { row += buildable(cls[y * MAP + x]) ? 1 : 0; I[(y + 1) * S + x + 1] = I[y * S + x + 1] + row; }
  }
  const count = (x0: number, y0: number, x1: number, y1: number) => I[y1 * S + x1] - I[y0 * S + x1] - I[y1 * S + x0] + I[y0 * S + x0];
  // 7. highway entry candidates: border tiles every 16 tiles, 48 deep and 16 wide buildable strip inward
  const hw: { x: number; y: number; edge: Edge }[] = [];
  for (const e of EDGES) {
    if (mountainEdges.includes(e)) continue;
    for (let c = 0; c + 16 <= MAP; c += 16) {
      const cx = c + 8;
      let x = 0, y = 0, rect: [number, number, number, number];
      if (e === 'N') { x = cx; y = 0; rect = [c, 0, c + 16, 48]; }
      else if (e === 'S') { x = cx; y = MAP - 1; rect = [c, MAP - 48, c + 16, MAP]; }
      else if (e === 'W') { x = 0; y = cx; rect = [0, c, 48, c + 16]; }
      else { x = MAP - 1; y = cx; rect = [MAP - 48, c, MAP, c + 16]; }
      if (waterDist(pts, x, y) < 60) continue;
      if (count(rect[0], rect[1], rect[2], rect[3]) !== (rect[2] - rect[0]) * (rect[3] - rect[1])) continue;
      hw.push({ x, y, edge: e });
    }
  }
  // 8. start blocks: 64 x 64 fully buildable on a 16 lattice, near the river edge
  const blocks: { x: number; y: number; cx: number; cy: number; wd: number }[] = [];
  // top-left corners in [64, MAP - 128], so the block is at least 64 tiles from every border
  for (let by = 64; by <= MAP - 128; by += 16) for (let bx = 64; bx <= MAP - 128; bx += 16) {
    if (count(bx, by, bx + 64, by + 64) !== 64 * 64) continue;
    const cx = bx + 32, cy = by + 32, wd = waterDist(pts, cx, cy);
    if (wd <= 140) blocks.push({ x: bx, y: by, cx, cy, wd: Math.max(0, wd) });
  }
  let best = Infinity, bestH: (typeof hw)[number] | null = null, bestB: (typeof blocks)[number] | null = null;
  for (const h of hw) for (const b of blocks) {
    const dh = Math.hypot(b.cx - h.x, b.cy - h.y);
    if (dh > 320) continue;
    if (dh + b.wd < best) { best = dh + b.wd; bestH = h; bestB = b; }
  }
  const highway = bestH ? { x: bestH.x, y: bestH.y, edge: bestH.edge } : { x: -1, y: -1, edge: 'N' as Edge };
  const start = bestB ? { x: bestB.x, y: bestB.y, size: 64 } : { x: -1, y: -1, size: 64 };
  // 9. chokepoints: the narrowest river crossing with buildable banks, and the longest run of hill-walled points
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
  // distance to a hill along a ray from p, in tiles; -1 if no hill on the map within the reach
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
  return { seed: genSeed, attempt: 0, height, cls, waters, mountainEdges, highway, start, chokepoints };
}

/** Generate the terrain for a seed: retries up to 8 times until checkGuarantees passes. */
export function generateTerrain(seed: number): Terrain {
  let reasons: string[] = [];
  for (let a = 0; a < 8; a++) {
    const t = build(a === 0 ? seed : hash2(seed, a));
    const rep = checkGuarantees(t);
    if (rep.ok) { t.seed = seed; t.attempt = a; return t; }
    reasons = rep.reasons;  }
  throw new Error(`terrain seed ${seed}: all 8 attempts failed: ${reasons.join('; ')}`);
}
