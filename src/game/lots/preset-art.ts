// The art side of the lot presets (P20): a prop's four views, how its picture turns with the lot (never mirrored: mirror.ts), its footprint
// and its owner scale. Pure over the library, no DOM. One quarter turn takes a prop's front from +y to +x (the four-view order NE, SE, SW, NW:
// the front facing +y, +x, -y, -x in world tiles).
import { LIBRARY } from '../library';
import type { LibItem } from '../types';
import { VIEW_ART, unmirror } from '../views-library';
import { AXIS_SETS } from '../axis-library';
import { OWNER_SCALE } from './scales';
import { hasLettering } from './lettering';
import { CAR_DIRECTIONS, CAR_SCALE, carFootprint, carOwnerScale } from '../ext/car-art';

const BY = new Map<string, LibItem>(LIBRARY.map(i => [i.id, i]));
/** a footprint relative to its anchor (tiles): x0, y0, x1, y1 */
export type Box4 = [number, number, number, number];

/** the four views of a sprite's art, [NE, SE, SW, NW] (the front facing +y, +x, -y, -x), and the index of the given id among them */
export interface Views { views: [string, string, string, string]; at: number }
const viewCache = new Map<string, Views | null>();
/** the four views of a sprite (views-library.ts: the base id is the NE view, its SE view is east:<id> or view:<id>:se, then view:<id>:sw and
 *  view:<id>:nw), from any one of them; null when the library lacks any of the four */
export function fourViews(id: string): Views | null {
  const c = viewCache.get(id); if (c !== undefined) return c;
  const base = id.startsWith('view:') ? id.slice(5, id.lastIndexOf(':')) : id.startsWith('east:') && VIEW_ART.has(id) ? id.slice(5) : id;
  const se = unmirror(base, true)[0], sw = `view:${base}:sw`, nw = `view:${base}:nw`;
  const views: [string, string, string, string] = [base, se, sw, nw];
  const ok = se !== base && views.every(v => BY.has(v)) && unmirror(sw, true)[0] === nw;
  const out = ok && views.includes(id) ? { views, at: views.indexOf(id) } : null;
  viewCache.set(id, out);
  return out;
}

/** the screen-axis pictures (axis-library.ts, T154): each one's set [N, E, S, W] (the front facing screen down, right, up, left: one quarter turn
 *  each, the same way round as NE, SE, SW, NW) and its place in it */
const AXIS = new Map<string, Views>();
for (const views of Object.values(AXIS_SETS)) if (views.every(v => BY.has(v))) views.forEach((v, at) => AXIS.set(v, { views: [...views] as Views['views'], at }));
/** the screen-axis set of a picture (any of its four), or null */
export const axisViews = (id: string): Views | null => AXIS.get(id) ?? null;
const AXIS_OF = new Map<string, string>(Object.entries(AXIS_SETS).flatMap(([s, views]) => views.map(v => [v, s] as const)));
/** the id a picture's studio size is kept under (its Library card): a four-view building's NE view, a screen-axis picture's subject (T154) */
export const sizeKey = (id: string): string => AXIS_OF.get(id) ?? fourViews(id)?.views[0] ?? id;
/** every picture one studio size (sizeKey) draws: the subject's four views (or itself) and its screen-axis set */
export const sizeViews = (key: string): string[] => [...new Set([...(fourViews(key)?.views ?? [key]), ...(AXIS_SETS[key] ?? [])])];

/** a drawn sprite as a preset stores it: its base id (the NE view for four-view art, else itself) and the view it is turned to (0..3) */
export function baseView(id: string): { id: string; view: 0 | 1 | 2 | 3 } {
  const v = fourViews(id) ?? axisViews(id);
  return v ? { id: v.views[0], view: v.at as 0 | 1 | 2 | 3 } : { id, view: 0 };
}

/** the props whose picture lies along one world axis and is drawn mirrored on the other (as the composer flips them with the lot's axis): wheel
 *  stops, the car park's pay boom and the trailers. Every other sprite without four views keeps its picture (a mirrored tree or bench would put
 *  the sun on the wrong side) */
export const AXIS_PROPS: ReadonlySet<string> = new Set(['expansion:wheel-stop', 'ce:parking-entry', 'expansion:camper', 'expansion:boxcar', 'expansion:boat-trailer', 'expansion:utility-trailer']);
/** the eight-way car art (traffic.ts facings): cars:<model>:<heading> */
const CAR8 = /^cars:(.+):(SE|S|SW|W|NW|N|NE|E)$/;
/** the old vehicle art with a facing letter (n -y, s +y, e +x, w -x) */
const LETTER = /_([nsew])(-v2)?$/;
/** a facing letter turned one quarter: +y to +x to -y to -x */
const NEXT_LETTER: Record<string, string> = { s: 'e', e: 'n', n: 'w', w: 's' };

/** a sprite turned q quarter turns (the lot's facing plus the prop's view; any integer): the sprite and flip it is drawn with. Four-view art
 *  and a screen-axis set (N, E, S, W) take their turned view; an eight-way car its turned heading; an old vehicle its turned facing letter when the library has it; a fence its x or
 *  y run; an axis prop (AXIS_PROPS) is mirrored on odd turns; anything else, lettered signs among them, keeps its picture unflipped */
export function turned(id: string, q: number): { id: string; flip: boolean } {
  const t = ((Math.round(q) % 4) + 4) % 4;
  if (!t) return { id, flip: false };
  const v = fourViews(id) ?? axisViews(id);
  if (v) return { id: v.views[(v.at + t) % 4], flip: false };
  const car = CAR8.exec(id);
  if (car) { const h = CAR_DIRECTIONS.indexOf(car[2] as typeof CAR_DIRECTIONS[number]), n = `cars:${car[1]}:${CAR_DIRECTIONS[((h - 2 * t) % 8 + 8) % 8]}`; return { id: BY.has(n) ? n : id, flip: false }; }
  const it = BY.get(id);
  if (it?.cat === 'Vehicles') {
    const m = LETTER.exec(id);
    if (m) { let l = m[1]!; for (let k = 0; k < t; k++) l = NEXT_LETTER[l]!; const n = id.slice(0, m.index) + `_${l}` + (m[2] ?? ''); return { id: BY.has(n) ? n : id, flip: false }; }
    return { id, flip: false };
  }
  if (t % 2 && (it?.kind === 'fencex' || it?.kind === 'fencey')) { const n = id.replace(/-([xy])$/, (_, a: string) => (a === 'x' ? '-y' : '-x')); if (n !== id && BY.has(n)) return { id: n, flip: false }; }
  if (t % 2 && AXIS_PROPS.has(id) && !hasLettering(id, it?.name)) return { id, flip: true };
  return { id, flip: false };
}

/** the footprint of a sprite drawn at scale s and flip, relative to its anchor (tiles): the union of its boxes as the engine draws it; an
 *  eight-way car's is its 4.5 x 1.8 m body along its heading, and another vehicle's its boxes, both at CAR_SCALE times s (a car's s is its owner size: ownerScaleOf) */
export function footprintOf(id: string, s: number, flip: boolean): Box4 {
  const car = CAR8.exec(id);
  if (car) { const q = carFootprint(CAR_DIRECTIONS.indexOf(car[2] as typeof CAR_DIRECTIONS[number])), k = CAR_SCALE * s / 2; return [-q.hx * k, -q.hy * k, q.hx * k, q.hy * k]; }
  const it = BY.get(id); if (!it) return [-0.5, -0.5, 0.5, 0.5];
  const k = it.cat === 'Vehicles' ? CAR_SCALE * s : s;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of it.boxes) {
    const hx = (flip ? b.hy : b.hx) * k / 2, hy = (flip ? b.hx : b.hy) * k / 2, dx = (flip ? b.dy : b.dx) * k / 2, dy = (flip ? b.dx : b.dy) * k / 2;
    x0 = Math.min(x0, dx - hx); x1 = Math.max(x1, dx + hx); y0 = Math.min(y0, dy - hy); y1 = Math.max(y1, dy + hy);
  }
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : [-0.5, -0.5, 0.5, 0.5];
}

/** the scale a preset's scale multiplies (unitless): the sprite's owner scale (scales.ts OWNER_SCALE), the car's owner size for a vehicle (its
 *  studio size, carOwnerScale: the engine draws a parked car at CAR_SCALE times it), and 1 for sprites the owner never scaled */
export function ownerScaleOf(id: string): number {
  return BY.get(id)?.cat === 'Vehicles' || CAR8.test(id) ? carOwnerScale(id) : OWNER_SCALE[id] ?? 1;
}

/** is a library id known to the game (the preset checks) */
export const hasSprite = (id: string) => BY.has(id);
