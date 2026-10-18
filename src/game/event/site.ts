// The stadium's site (Phase 5 step 2b): where the stadium's footprint goes on the valley, its doors, and the crowd a round sends
// from each town (by population share). Pure TS, no DOM: placeStadium reads the terrain classes and the town centres.
import { MAP } from '../iso';
import { TC } from '../terrain/types';
import type { Pt } from '../network';
import { L1_CARS, LEVEL_MUL, SITE_MARGIN, SITE_MAX, SITE_MIN, STADIUM_H, STADIUM_W } from './config';

/** the stadium's site: the footprint rectangle (top-left tile x, y and its size w, h in tiles), its centre c, and its 4 doors (the middle of
 *  each side, the third tile outside: north, east, south, west) */
export interface Site { x: number; y: number; w: number; h: number; c: Pt; doors: Pt[] }

/** the lattice the centres are searched on, tiles */
const LATTICE = 16;
/** the search's extra reach when no centre fits (tiles beyond SITE_MAX), in turn */
const RELAX = [0, 250, 500];

/** the integral image of buildable tiles (GROUND or PATCH): S[y * (MAP + 1) + x] is the count over [0, x) x [0, y) */
function buildable(cls: Uint8Array): Int32Array {
  const N = MAP + 1, S = new Int32Array(N * N);
  for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
    const c = cls[y * MAP + x]!, b = c === TC.GROUND || c === TC.PATCH ? 1 : 0;
    S[(y + 1) * N + x + 1] = S[y * N + x + 1]! + S[(y + 1) * N + x]! - S[y * N + x]! + b;
  }
  return S;
}

/** the centre search with the farthest distance maxD over the integral image S (see buildable); the best site or null */
function search(S: Int32Array, centres: Pt[], maxD: number): Site | null {
  const N = MAP + 1;
  const hw = STADIUM_W / 2, hh = STADIUM_H / 2;
  let best: Site | null = null, bestScore = Infinity;
  for (let cy = 0; cy <= MAP; cy += LATTICE) {
    if (cy - hh < SITE_MARGIN || cy + hh > MAP - SITE_MARGIN) continue;
    for (let cx = 0; cx <= MAP; cx += LATTICE) {
      if (cx - hw < SITE_MARGIN || cx + hw > MAP - SITE_MARGIN) continue;
      let dmin = Infinity, dmax = -Infinity, dsum = 0, ok = true;
      for (const t of centres) {
        const d = Math.hypot(t.x - cx, t.y - cy);
        if (d < SITE_MIN || d > maxD) { ok = false; break; }
        if (d < dmin) dmin = d; if (d > dmax) dmax = d; dsum += d;
      }
      if (!ok) continue;
      const x0 = cx - hw, y0 = cy - hh, x1 = cx + hw, y1 = cy + hh;
      const n = S[y1 * N + x1]! - S[y0 * N + x1]! - S[y1 * N + x0]! + S[y0 * N + x0]!;
      if (n !== STADIUM_W * STADIUM_H) continue;
      const score = (dmax - dmin) + 0.25 * (dsum / centres.length);
      if (score < bestScore) {
        bestScore = score;
        best = { x: x0, y: y0, w: STADIUM_W, h: STADIUM_H, c: { x: cx, y: cy }, doors: [
          { x: cx, y: y0 - 3 }, { x: x1 + 2, y: cy }, { x: cx, y: y1 + 2 }, { x: x0 - 3, y: cy } ] };
      }
    }
  }
  return best;
}

/** the stadium's site on the valley (cls: the terrain classes, MAP x MAP; centres: the town centres, tiles): the lattice centre whose footprint
 *  lies within SITE_MARGIN of the edges and is all buildable, each town centre SITE_MIN..SITE_MAX away; the lowest score wins
 *  (max distance - min distance + a quarter of the mean distance; ties: the smaller cy, then cx). If none fits, the far limit grows by 250, then
 *  500 more. Null with no centres or no fit. Deterministic. */
export function placeStadium(cls: Uint8Array, centres: Pt[]): Site | null {
  if (!centres.length) return null;
  const S = buildable(cls);
  for (const r of RELAX) { const s = search(S, centres, SITE_MAX + r); if (s) return s; }
  return null;
}

/** the cars a round of the given level sends, split over the towns by population share (all zero: equal shares), by largest remainder:
 *  the parts sum to the total (round(L1_CARS * LEVEL_MUL ** (level - 1))); the ties go to the earlier towns */
export function crowdFor(level: number, pops: number[]): number[] {
  const n = pops.length;
  if (!n) return [];
  const total = Math.round(L1_CARS * LEVEL_MUL ** (level - 1));
  const sum = pops.reduce((a, b) => a + b, 0);
  const out = new Array<number>(n).fill(0), frac = new Array<number>(n).fill(0);
  let used = 0;
  for (let i = 0; i < n; i++) {
    const v = sum > 0 ? total * pops[i]! / sum : total / n, f = Math.floor(v);
    out[i] = f; frac[i] = v - f; used += f;
  }
  const order = out.map((_, i) => i).sort((a, b) => frac[b]! - frac[a]! || a - b);
  for (let k = 0; k < total - used; k++) out[order[k]!]!++;
  return out;
}

/** true if (x, y) is inside the site's footprint, grown by pad tiles on each side */
export function insideSite(s: Site, x: number, y: number, pad = 0): boolean {
  return x >= s.x - pad && x < s.x + s.w + pad && y >= s.y - pad && y < s.y + s.h + pad;
}
