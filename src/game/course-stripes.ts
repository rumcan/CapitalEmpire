// T218: the fairways' mowing stripes (the owner, 2026-10-27: "add some artificial stripes to fairway grass" / "light ones like on the range").
// Light and dark bands as light as the driving range's outfield's (its preset's Stripes, drawn by the same renderer mowStripes), laid across
// each hole's line of play (the back tee, the aim points, the pin: engine holeLines). Every leg of a dogleg has its own bands, split at the
// bisector of each bend, and the band count runs on round the bend. Fairway cells of no hole (painted by hand, or a hole with no tee or pin
// yet) take DEFAULT_MOW_DIR. Everything is in world tiles, so the bands of neighbouring chunks meet. Pure: no DOM, importable from node tests.
import type { MowStripes } from './ground-protocol';
import { PRESETS, clampStripes, type PaintPreset } from './paint-presets';

/** the preset whose Stripes the fairways wear: the range's outfield (golf/rangehost RANGE_PRESET.outfield), so the two always match */
export const FAIRWAY_STRIPE_PRESET = 'range-outfield';
/** the band axis of fairway cells of no hole: along tile (1, 1), straight down the screen, so the bands lie level across it */
export const DEFAULT_MOW_DIR: Readonly<{ x: number; y: number }> = { x: Math.SQRT1_2, y: Math.SQRT1_2 };

/** a stripe look: MowStripes without its axis and origin (w the band width in tiles, l / k how much lighter / darker, lc / dc the colours,
 *  t the tint, f the soft edge), and across: the bands lie across the line of play (the preset's dir 'x' or 'check'), else along it ('y') */
export interface StripeLook { w: number; l: number; k: number; lc: string; dc: string; t: number; f: number; across: boolean }

/** the fairways' stripe look: the range outfield preset's Stripes (its numbers whether or not the outfield shows them; a missing preset: the
 *  presets' default Stripes) */
export function fairwayStripeLook(presets: readonly Pick<PaintPreset, 'id' | 'stripes'>[] = PRESETS): StripeLook {
  const s = clampStripes(presets.find(p => p.id === FAIRWAY_STRIPE_PRESET)?.stripes);
  return { w: s.width, l: s.light, k: s.dark, lc: s.lightCol, dc: s.darkCol, t: s.tint, f: s.soft, across: s.dir !== 'y' };
}

/** one leg of a hole's stripes: its bands (alternating along (ux, uy) from (ox, oy), light first) and where its share starts: the bend's
 *  point and the bisector's normal, pointing into this leg (null: the first leg, or the hole's only one) */
export interface StripeLeg { m: MowStripes; cut: { x: number; y: number; nx: number; ny: number } | null }

const bands = (look: StripeLook, ux: number, uy: number, ox: number, oy: number): MowStripes =>
  ({ ux, uy, ox, oy, w: look.w, l: look.l, k: look.k, lc: look.lc, dc: look.dc, t: look.t, f: look.f });

/** a hole's stripe legs from its playing line (flat tiles: tee, aim points, pin):
 *  - across (the range's look): each leg's bands alternate along its direction, so each band lies across the line of play; the band count runs
 *    on round each bend (the leg's origin is set back by the length already walked), so the bands meet on the line;
 *  - along: each leg's bands alternate sideways, the line in the middle of a band;
 *  - angle (the hook for greenkeeping's mow angle, grass-management GrassAction 'mow'; absent until a mow sets one): the way the mower drives,
 *    degrees in tile space. Its passes are the bands, so they lie along it, one direction over the whole hole, from the tee;
 *  - a line of under two points (hole 0: no hole, or no tee or pin yet): one leg along DEFAULT_MOW_DIR from the map origin */
export function holeStripeLegs(line: ArrayLike<number>, look: StripeLook, angle?: number): StripeLeg[] {
  if (angle !== undefined && Number.isFinite(angle)) {
    const a = (angle * Math.PI) / 180;
    return [{ m: bands(look, -Math.sin(a), Math.cos(a), line.length >= 2 ? line[0]! : 0, line.length >= 2 ? line[1]! : 0), cut: null }];
  }
  const P: { x: number; y: number }[] = [];
  for (let k = 0; k + 1 < line.length; k += 2) {
    const x = line[k]!, y = line[k + 1]!, q = P[P.length - 1];
    if (Number.isFinite(x) && Number.isFinite(y) && (!q || Math.hypot(x - q.x, y - q.y) > 1e-3)) P.push({ x, y });
  }
  if (P.length < 2) {
    const d = DEFAULT_MOW_DIR;
    return [{ m: look.across ? bands(look, d.x, d.y, 0, 0) : bands(look, -d.y, d.x, 0, 0), cut: null }];
  }
  const legs: StripeLeg[] = [];
  let walked = 0, px = 0, py = 0;
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i]!, b = P[i + 1]!, len = Math.hypot(b.x - a.x, b.y - a.y), dx = (b.x - a.x) / len, dy = (b.y - a.y) / len;
    const m = look.across ? bands(look, dx, dy, a.x - dx * walked, a.y - dy * walked) : bands(look, -dy, dx, a.x + dy * look.w / 2, a.y - dx * look.w / 2);
    let cut: StripeLeg['cut'] = null;
    if (i > 0) {
      // the bend's bisector: its normal is the two legs' directions summed (a hairpin, where they cancel: this leg's own)
      let nx = px + dx, ny = py + dy; const n = Math.hypot(nx, ny);
      if (n < 1e-3) { nx = dx; ny = dy; } else { nx /= n; ny /= n; }
      cut = { x: a.x, y: a.y, nx, ny };
    }
    legs.push({ m, cut });
    walked += len; px = dx; py = dy;
  }
  return legs;
}

/** the leg a tile point is mown with: the last whose cut it lies past (on a sharp S the later bend wins) */
export function legAt(legs: readonly StripeLeg[], x: number, y: number): number {
  for (let i = legs.length - 1; i > 0; i--) { const c = legs[i]!.cut; if (!c || (x - c.x) * c.nx + (y - c.y) * c.ny >= 0) return i; }
  return 0;
}

/** the band a tile point lies in (as mowStripes draws it): its leg, the band's index along the leg's axis and whether it is a light one */
export function bandAt(legs: readonly StripeLeg[], x: number, y: number): { leg: number; band: number; light: boolean } {
  const leg = legAt(legs, x, y), m = legs[leg]!.m, w = Math.max(0.25, m.w), band = Math.floor(((x - m.ox) * m.ux + (y - m.oy) * m.uy) / w);
  return { leg, band, light: (band & 1) === 0 };
}

/** a convex polygon (flat x y) cut to the half-plane where (p - c) . n >= 0 (Sutherland-Hodgman) */
function keepSide(poly: readonly number[], cx: number, cy: number, nx: number, ny: number): number[] {
  const out: number[] = [], n = poly.length >> 1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, ax = poly[2 * i]!, ay = poly[2 * i + 1]!, bx = poly[2 * j]!, by = poly[2 * j + 1]!;
    const fa = (ax - cx) * nx + (ay - cy) * ny, fb = (bx - cx) * nx + (by - cy) * ny;
    if (fa >= 0) out.push(ax, ay);
    if (fa >= 0 !== fb >= 0) { const t = fa / (fa - fb); out.push(ax + t * (bx - ax), ay + t * (by - ay)); }
  }
  return out;
}

/** leg i's share of a tile box (x0, y0, x1, y1) as a convex polygon (flat x y; empty when it has none there): past its own cut and short
 *  of every later leg's (legAt's rule), so the legs' shares tile the box without overlapping */
export function legArea(legs: readonly StripeLeg[], i: number, box: readonly number[]): number[] {
  let p = [box[0]!, box[1]!, box[2]!, box[1]!, box[2]!, box[3]!, box[0]!, box[3]!];
  const c = legs[i]?.cut;
  if (c) p = keepSide(p, c.x, c.y, c.nx, c.ny);
  for (let j = i + 1; j < legs.length && p.length >= 6; j++) { const q = legs[j]!.cut; if (q) p = keepSide(p, q.x, q.y, -q.nx, -q.ny); }
  return p.length >= 6 ? p : [];
}
