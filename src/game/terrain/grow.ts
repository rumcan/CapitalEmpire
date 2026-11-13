/** A map that grows to fit (issue #1174). The old map keeps its place at the north-west corner (offset 0, 0), so the map gains land to the east and
 *  the south and no saved coordinate moves. What the save keeps of the old terrain is `Terrain.grown` (below): the classes and heights as they were,
 *  stamped over the valley that generateTerrain makes at the new size, so the town stands on the ground it was built on. The ring of new land is that
 *  new valley, with its water left out (a river is carried straight out to the new edge from where the old one reached the old edge) and its
 *  heights blended into the old edge over RING_BLEND tiles. Pure: sizes are arguments, nothing here reads MAP. */
import { TC, HSTEP, type Edge, type Terrain } from './types';
import { rle, unrle, type SaveV5 } from '../save';

/** how far into the new land the heights blend from the old edge's, tiles */
export const RING_BLEND = 96;
/** the saved old terrain: its side (tiles), classes as runs (save.ts rle), heights in centimetres (HS * HS whole numbers), and the map data the terrain carries */
export interface GrownSave {
  from: number; cls: number[]; height: number[];
  meta: { attempt: number; model?: number; waters: Terrain['waters']; mountainEdges: Edge[]; highway: Terrain['highway']; start: Terrain['start']; towns: Terrain['towns']; chokepoints: Terrain['chokepoints'] };
}

/** the terrain as a save keeps it for a grown map (a map that has grown keeps this in every later save: it is not the seed's valley any more) */
export function packGrown(t: Terrain, side: number): GrownSave {
  const hs = side / HSTEP, height = new Array<number>(hs * hs);
  for (let i = 0; i < height.length; i++) height[i] = Math.round(t.height[i]! * 100);
  const { attempt, model, waters, mountainEdges, highway, start, towns, chokepoints } = t;
  return { from: side, cls: rle(t.cls.subarray(0, side * side)), height, meta: { attempt, ...(model !== undefined ? { model } : {}), waters, mountainEdges, highway, start, towns, chokepoints } };
}

const wet = (c: number): boolean => c === TC.WATER || c === TC.CREEK || c === TC.BANK;
const smooth = (t: number): number => { const u = t <= 0 ? 0 : t >= 1 ? 1 : t; return u * u * (3 - 2 * u); };

/** the highway's entry on a map that has grown from `from` to `to`: on the east or the south edge it moves out to the new edge (the other two edges
 *  did not move) */
export function movedHighway(h: Terrain['highway'], to: number): Terrain['highway'] {
  if (h.edge === 'E') return { x: to - 1, y: h.y, edge: 'E' };
  if (h.edge === 'S') return { x: h.x, y: to - 1, edge: 'S' };
  return h;
}

/** `gen`, the valley generated at the new size `side` (it is changed and returned), with the old terrain `g` put back at the north-west corner: the old
 *  classes and heights as they were, the new land round them as described at the top, and the old map data (the highway moved to the new edge) */
export function applyGrown(gen: Terrain, g: GrownSave, side: number): Terrain {
  const M = g.from, N = side, HM = M / HSTEP, HN = N / HSTEP;
  if (!(M > 0) || M >= N || M % HSTEP || N % HSTEP) return gen;
  const base = unrle(g.cls, new Uint8Array(M * M));
  const cls = gen.cls;
  for (let y = 0; y < N; y++) {
    const by = Math.min(y, M - 1), row = y * N;
    for (let x = 0; x < N; x++) {
      if (x < M && y < M) { cls[row + x] = base[y * M + x]!; continue; }
      const c = base[by * M + Math.min(x, M - 1)]!;
      cls[row + x] = wet(c) ? c : wet(cls[row + x]!) ? TC.GROUND : cls[row + x]!;
    }
  }
  const h = gen.height;
  for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) {
    const k = j * HN + i;
    if (i < HM && j < HM) { h[k] = g.height[j * HM + i]! / 100; continue; }
    const e = g.height[Math.min(j, HM - 1) * HM + Math.min(i, HM - 1)]! / 100;
    const dist = Math.hypot(Math.max(0, i - (HM - 1)), Math.max(0, j - (HM - 1))) * HSTEP;
    h[k] = e + (h[k]! - e) * smooth(dist / RING_BLEND);
  }
  const m = g.meta;
  gen.attempt = m.attempt; gen.model = m.model; gen.waters = m.waters; gen.mountainEdges = m.mountainEdges; gen.highway = movedHighway(m.highway, N);
  gen.start = m.start; gen.towns = m.towns; gen.chokepoints = m.chokepoints;
  return gen;
}

/** the longest road piece the county road's extension is cut into, tiles */
const EXT_PIECE = 128;
/** the county road carried out to the new edge: the saved road pieces (`segs`) that end at the highway's old entry `h` (within 2 tiles) give the class, style and kind
 *  of new pieces from that end straight out to the new edge, so the town stays joined to the county road when the entry moves (movedHighway). [] when the entry is on the
 *  north or west edge (it did not move) or no road reaches it */
export function extendHighway(segs: SaveV5['segs'], h: Terrain['highway'], to: number): SaveV5['segs'] {
  if (h.edge !== 'E' && h.edge !== 'S') return [];
  let best: SaveV5['segs'][number] | null = null, end: { x: number; y: number } | null = null, bd = 2 * 2 + 1e-9;
  for (const s of segs) for (const [x, y] of [[s[0], s[1]], [s[2], s[3]]] as const) {
    const d = (x - h.x) ** 2 + (y - h.y) ** 2;
    if (d < bd) { bd = d; best = s; end = { x, y }; }
  }
  if (!best || !end) return [];
  const goal = to - 1, along = h.edge === 'E' ? end.x : end.y, len = goal - along;
  if (!(len > 0)) return [];
  const out: SaveV5['segs'] = [], pieces = Math.ceil(len / EXT_PIECE);
  for (let k = 0; k < pieces; k++) {
    const a = along + Math.round(len * k / pieces), b = k === pieces - 1 ? goal : along + Math.round(len * (k + 1) / pieces);
    const seg: SaveV5['segs'][number] = h.edge === 'E' ? [a, end.y, b, end.y, best[4], best[5], 0] : [end.x, a, end.x, b, best[4], best[5], 0];
    if (best[7]) seg.push(1);
    out.push(seg);
  }
  return out;
}
