// Seeded course ground while it grows in (P23 critique D5.1 and D5.2): what a course chunk draws over its seeded cells, the same at every
// zoom tier (the same month looks the same at 8% and at 30%), and the young grass each surface brings up over the soil, so a beginner can
// tell a seeded green from a seeded fairway, tee or rough. Pure TypeScript, no DOM, deterministic. Units: tiles of 2 m, cells of 1 m.
import { CELL_T, SURF } from '../course-grid';
import type { CoursePatch } from '../../ground-protocol';
import { mulberry } from '../../iso';
import { SURF_GROW_MONTHS } from './index';

/** a surface's young grass over the soil: the sprouts' colours (one picked per sprout), their total area as a share of the soil (0..; they
 *  overlap, so seedShare is what they cover), a sprout's length and width (tiles), and the drill rows' spacing (tiles; 0: scattered, as
 *  broadcast seed comes up). The look's tint is the mean of its colours */
export interface SeedLook { cols: readonly string[]; cover: number; len: number; wid: number; rows: number }

/** the young grass by surface id: the green fine, dense and emerald; the tee dense and yellow-green; the fairway in drill rows; the rough
 *  sparse, coarse dark tufts; the fescue sparse straw-gold wisps. The playing surfaces come up thick enough to read green from day one
 *  (T121, the owner's test 2026-10-25: a just built hole read as brown soil): their sprouts cover about two thirds of the soil (fairway) to
 *  four fifths (green), over the quarter of real grass a seeded cell starts with (course-fx seededStage) */
export const SEED_LOOKS: Readonly<Record<number, SeedLook>> = {
  [SURF.rough]: { cols: ['#4e6a2c', '#5a7834', '#43602a'], cover: 0.24, len: 0.7, wid: 0.18, rows: 0 },
  [SURF.fescue]: { cols: ['#b9a75e', '#c8b870', '#a8964f'], cover: 0.24, len: 0.8, wid: 0.15, rows: 0 },
  // T238: the long grass comes up as the rough does, its tufts longer and a shade darker
  [SURF.longGrass]: { cols: ['#4a6428', '#566f30', '#3f5a26'], cover: 0.24, len: 0.85, wid: 0.18, rows: 0 },
  [SURF.fairway]: { cols: ['#6c9f3a', '#7aae44', '#5f9034'], cover: 1.15, len: 0.36, wid: 0.09, rows: 0.2 },
  [SURF.tee]: { cols: ['#a3c24c', '#b2cf5a', '#93b343'], cover: 1.2, len: 0.22, wid: 0.1, rows: 0 },
  [SURF.green]: { cols: ['#3f9b4b', '#4cab57', '#348b40', '#2a7535'], cover: 1.4, len: 0.18, wid: 0.09, rows: 0 },
};
/** the share of the soil a look's sprouts cover (0..1): their area (round ends included) as a share, less their overlaps (scattered at random) */
export const seedShare = (look: SeedLook) => 1 - Math.exp(-look.cover * (1 + Math.PI * look.wid / (4 * look.len)));

/** a colour '#rrggbb' or 'rgb(r, g, b)' as [r, g, b] (0..255); grey for anything else */
export function parseCol(c: string): [number, number, number] {
  const h = /^#([0-9a-f]{6})$/i.exec(c.trim());
  if (h) { const v = parseInt(h[1]!, 16); return [v >> 16, (v >> 8) & 255, v & 255]; }
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(c.trim());
  return m ? [+m[1]!, +m[2]!, +m[3]!] : [128, 128, 128];
}
const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
/** colour a mixed toward b by t (0: a, 1: b), as '#rrggbb' */
export function mixCol(a: string, b: string, t: number): string {
  const p = parseCol(a), q = parseCol(b);
  return hex(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t);
}
/** a look's tint: the mean of its colours */
export function seedTint(look: SeedLook): string {
  const s = [0, 0, 0]; for (const c of look.cols) { const v = parseCol(c); s[0] += v[0]; s[1] += v[1]; s[2] += v[2]; }
  const n = Math.max(1, look.cols.length); return hex(s[0]! / n, s[1]! / n, s[2]! / n);
}
/** what seeded ground of a look reads as from afar over soil of colour soil: the soil mixed toward the tint by the share the sprouts cover
 *  (the planner map's flat colour) */
export const seedColour = (look: SeedLook, soil: string) => mixCol(soil, seedTint(look), seedShare(look));

/** the side of a sprout pattern's square, tiles (it repeats; the soil under it does not, so the repeat does not show) */
export const SPROUT_PERIOD = 8;
/** the finest a sprout pattern is drawn, px a tile (the closest zoom's chunks have about 21) */
export const SPROUT_PX = 24;
/** the px a tile a sprout pattern is drawn at for a chunk drawing px a tile (whole px, 2..SPROUT_PX): the chunk's own scale, so its sprouts
 *  are antialiased into their mean colour on a far chunk instead of being thinned out by a minified pattern */
export const sproutRes = (chunkPx: number) => Math.max(2, Math.min(SPROUT_PX, Math.round(chunkPx)));
/** one sprout of a pattern square: its middle (tiles, 0..SPROUT_PERIOD), angle (radians), length and width (tiles) and colour */
export interface Sprout { x: number; y: number; a: number; len: number; wid: number; col: string }
/** the sprouts of a look's pattern square (seeded: the same every time): about cover x the square in sprout area, scattered, or along drill
 *  rows (lying along the rows, so the rows read) when the look has them */
export function seedSprouts(look: SeedLook, seed = 1): Sprout[] {
  const P = SPROUT_PERIOD, rnd = mulberry(seed >>> 0 || 1), n = Math.round(look.cover * P * P / (look.len * look.wid)), out: Sprout[] = [];
  const rowsN = look.rows > 0 ? Math.max(1, Math.round(P / look.rows)) : 0, gap = rowsN ? P / rowsN : 0;
  for (let k = 0; k < n; k++) {
    // drill rows: each sprout near its row (spread over most of the gap, so the rows read without bare soil stripes between them)
    const x = rnd() * P, y = rowsN ? (Math.floor(rnd() * rowsN) + 0.5) * gap + (rnd() - 0.5) * Math.max(look.wid * 1.5, gap * 0.6) : rnd() * P;
    const a = rowsN ? (rnd() - 0.5) * 0.5 : rnd() * Math.PI, f = 0.7 + 0.6 * rnd();
    out.push({ x, y: (y + P) % P, a, len: look.len * f, wid: look.wid * (0.8 + 0.4 * rnd()), col: look.cols[Math.floor(rnd() * look.cols.length)]! });
  }
  return out;
}

/** one grow-in draw of a course chunk (the renderer's drawCourses step 4, and the planner map): the layer's surface, the grow stage (0 just
 *  seeded .. 3 nearly grown), the mask alpha its cells hold (growMask: 255 x (1 - stage / 4)), how many of the chunk's cells stand at it, and
 *  the surface's young grass */
export interface GrowDraw { s: number; stage: number; alpha: number; cells: number; look: SeedLook }
/** the grow-in draws of course chunk c: each layer whose surface grows in, at each unfinished stage its growth mask holds. It reads only the
 *  patch (its month's mask), never the zoom: the street, district (lite) and planner chunks all draw exactly these, since the grow-in is the
 *  ground's state, not detail (the district chunks once left it out, so a seeded hole looked grown at 8% and bare at 11% and closer) */
export function growDraws(c: CoursePatch): GrowDraw[] {
  const grow = c.grow, n = Math.round(c.size / CELL_T), out: GrowDraw[] = [];
  if (!grow || grow.length !== n * n) return out;
  const cells = [0, 0, 0, 0];
  for (let i = 0; i < grow.length; i++) { const a = grow[i]!; if (a) cells[Math.min(3, Math.max(0, 4 - Math.round(a / 63.75)))]!++; }
  for (const l of c.layers) {
    // T271: a custom grass grows in as the surface it plays as (l.b)
    const gs = l.b ?? l.s, look = SEED_LOOKS[gs];
    if (!look || !((SURF_GROW_MONTHS[gs] ?? 0) > 0) || !l.fill.length) continue;
    for (let st = 0; st < 4; st++) if (cells[st]) out.push({ s: l.s, stage: st, alpha: Math.round(255 * (1 - st / 4)), cells: cells[st]!, look });
  }
  return out;
}
