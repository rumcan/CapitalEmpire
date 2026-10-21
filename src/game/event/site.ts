// The stadium's site (Phase 5 step 2b): where the stadium's footprint goes on the valley, its doors, and the crowd a round sends
// from each town (by population share). Pure TS, no DOM: placeStadium reads the terrain classes and the town centres.
import { MAP } from '../iso';
import { TC } from '../terrain/types';
import type { Pt } from '../network';
import { L1_CARS, LEVEL_MUL, SITE_MARGIN, SITE_MAX, SITE_MIN, STADIUM_H, STADIUM_TOWN_MIN, STADIUM_W } from './config';
import { WATER_REACH } from '../business/catalogue';

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

/** the site with top-left tile (x, y) and size w x h tiles: its centre at the middle, and its 4 doors (the middle of each side, the third tile outside) */
export function siteAt(x: number, y: number, w: number, h: number): Site {
  const cx = x + w / 2, cy = y + h / 2, x1 = x + w, y1 = y + h;
  return { x, y, w, h, c: { x: cx, y: cy }, doors: [{ x: cx, y: y - 3 }, { x: x1 + 2, y: cy }, { x: cx, y: y1 + 2 }, { x: x - 3, y: cy }] };
}

/** why a business on site s cannot stand there ('' when it can), checked in order: the footprint within SITE_MARGIN of the map's edges; every tile
 *  open land (GROUND or PATCH: no water, creek, bank or hill); the centre at least townMin from each town centre (centres: tiles; 0: no such check);
 *  with water, a water tile within WATER_REACH tiles of the footprint (see nearWater) */
export function siteWhy(s: Site, cls: Uint8Array, centres: Pt[], townMin = STADIUM_TOWN_MIN, water = false): string {
  if (s.x < SITE_MARGIN || s.y < SITE_MARGIN || s.x + s.w > MAP - SITE_MARGIN || s.y + s.h > MAP - SITE_MARGIN) return 'Too close to the map edge';
  for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) {
    const c = cls[y * MAP + x]; if (c !== TC.GROUND && c !== TC.PATCH) return 'Needs open land (no water, creek, bank or hill)';
  }
  if (townMin > 0) for (const t of centres) if (Math.hypot(t.x - s.c.x, t.y - s.c.y) < townMin) return `Too close to a town: ${townMin === STADIUM_TOWN_MIN ? 'stadiums stand' : 'it must stand'} outside the towns`;
  if (water && !nearWater(s, cls)) return 'Must stand by water (a lake or a river within 12 m)';
  return '';
}

/** whether a water tile (TC.WATER; a creek is dry) lies within WATER_REACH tiles of site s's footprint: the distance from the tile's centre to the rect */
function nearWater(s: Site, cls: Uint8Array): boolean {
  const R = WATER_REACH, x0 = Math.max(0, Math.floor(s.x - R)), x1 = Math.min(MAP - 1, Math.ceil(s.x + s.w + R)), y0 = Math.max(0, Math.floor(s.y - R)), y1 = Math.min(MAP - 1, Math.ceil(s.y + s.h + R));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (cls[y * MAP + x] !== TC.WATER) continue;
    const px = x + 0.5, py = y + 0.5, dx = Math.max(s.x - px, 0, px - (s.x + s.w)), dy = Math.max(s.y - py, 0, py - (s.y + s.h));
    if (dx * dx + dy * dy <= R * R) return true;
  }
  return false;
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
        best = siteAt(x0, y0, STADIUM_W, STADIUM_H);
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
 *  the parts sum to the total (round(L1_CARS * LEVEL_MUL ** (level - 1)) unless one is given: a golf tournament day's cars); the ties go to the earlier towns */
export function crowdFor(level: number, pops: number[], total = Math.round(L1_CARS * LEVEL_MUL ** (level - 1))): number[] {
  const n = pops.length;
  if (!n) return [];
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
