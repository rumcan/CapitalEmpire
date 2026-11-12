// Can this hole be opened in the view from behind the golfer (T417, docs/CINDERLINKS-PORT.md)? It needs a tee, a pin on a green, a playing line that
// neither starts nor ends in water, and some length. The reasons are the hole card's own words (holes.ts warnings) where it has them. Pure TS, no DOM.
import { PIN_OFF_GREEN, surfaceAt, type Hole } from '../holes';
import type { CourseArea, GolfSurface } from '../types';
import { TILE_M } from '../types';

/** the shortest hole the view opens, m */
export const MIN_HOLE_M = 40;
/** the hole card's warnings that stop a hole being opened (holes.ts deriveHoles words them) */
const BLOCKING = ['No pin', 'No tee markers', PIN_OFF_GREEN] as const;
/** the reasons this file adds, in the same voice */
export const TEE_IN_WATER = 'The tee is in the water';
export const PIN_IN_WATER = 'The pin is in the water';
export const TOO_SHORT = `The hole is shorter than ${MIN_HOLE_M} m`;

/** the verdict: ok, or the reasons it is not */
export interface Playable3p { ok: boolean; reasons: string[] }

/** whether the hole can be opened, and why not. surfAt reads the surface at a tile point (the game's own reader, the course grid); absent: the painted
 *  areas, topmost first (holes.ts surfaceAt) */
export function playable3p(hole: Hole, areas: CourseArea[], surfAt?: (x: number, y: number) => GolfSurface | null): Playable3p {
  const reasons: string[] = BLOCKING.filter(w => hole.warnings.includes(w));
  const at = surfAt ?? ((x: number, y: number) => surfaceAt(areas, x, y));
  const line = hole.line;
  if (line.length >= 2) {
    const tee = line[0]!, pin = line[line.length - 1]!;
    if (at(tee.x, tee.y) === 'water') reasons.push(TEE_IN_WATER);
    if (at(pin.x, pin.y) === 'water') reasons.push(PIN_IN_WATER);
    let len = 0;
    for (let i = 1; i < line.length; i++) len += Math.hypot(line[i]!.x - line[i - 1]!.x, line[i]!.y - line[i - 1]!.y);
    if (len * TILE_M <= MIN_HOLE_M) reasons.push(TOO_SHORT);
  } else if (!reasons.length) reasons.push('The hole has no playing line');
  return { ok: reasons.length === 0, reasons };
}
