// The cars' lamps (T192, the owner, 2026-10-27: "remove the carr lights in hte game., leave the brake lights but smaller and make sure the
// lights are behind game sprites, you can see the lights through buildings and the car itself").
//   - No headlights, beams or turn signals: only the two brake lights, lit while the car brakes or stands still (the sim's braking flag, or
//     no move between its last two frames).
//   - Half the old size and brightness: BRAKE_LIGHT.
//   - Drawn in the sprite pass, as the car's own glow instances right after its picture in its tile's painter's order (sprites.ts frame), so
//     every sprite nearer than the car (a building, a tree's canopy) covers them; and only when the car's rear faces the viewer (a car seen
//     from the front hides its brake lights behind its own body). The sprite shader draws them (gl.ts FS_SPRITE, layer GLOW_LAYER).
// Pure: importable from node (the tests).
import { worldX, worldY } from '../iso';

/** the brake lights: the glow's radius (world px; the old lamp point was 0.55 x 64 = 35.2 px across, a radius of 17.6) and its brightness at
 *  its centre (the old 1 when braking; the old 0.55 tail light when not braking is gone), both halved; the lamps' spread across the car's
 *  rear, a share of its drawn size (as before); lift, how far up the screen from the ground under the car's rear they sit (world px at the
 *  car's drawn size 1: on its body, at its painted tail lights, not on the road) */
export const BRAKE_LIGHT = { radius: 8.8, alpha: 0.5, spread: 0.3, lift: 12, colour: [1, 0.12, 0.08] as const } as const;
/** the sprite stream's layer value that marks a lamp's glow instance (gl.ts FS_SPRITE draws a soft red disc for it; no atlas page) */
export const GLOW_LAYER = -1;
/** floats per lamp in a Drawable's lamps list: world X, Y (px), radius (world px), brightness */
export const LAMP_FLOATS = 4;
/** the rear faces the viewer (the screen's down, +x +y on the map) unless the car heads toward the viewer by more than this (the sum of its
 *  unit heading's map components: -1.41 straight away, 1.41 straight toward); side on, its brake lights still show at its rear corners */
export const REAR_SHOWS_BELOW = 0.3;

/** the brake lights of a car at tile (x, y) heading a (radians), drawn w times its owner size, half its length hl (tiles, as drawn), into out
 *  from k (LAMP_FLOATS each): none unless lit, and none when its rear faces away from the viewer; returns the next index */
export function brakeLamps(x: number, y: number, a: number, w: number, hl: number, lit: boolean, out: number[], k = 0): number {
  if (!lit) return k;
  const hx = Math.cos(a), hy = Math.sin(a);
  if (hx + hy >= REAR_SHOWS_BELOW) return k;
  const rx = -hy, ry = hx, bx = x - hx * hl, by = y - hy * hl, s = BRAKE_LIGHT.spread * w;
  for (const side of [1, -1]) {
    const tx = bx + rx * s * side, ty = by + ry * s * side;
    out[k] = worldX(tx, ty); out[k + 1] = worldY(tx, ty) - BRAKE_LIGHT.lift * w; out[k + 2] = BRAKE_LIGHT.radius; out[k + 3] = BRAKE_LIGHT.alpha; k += LAMP_FLOATS;
  }
  return k;
}
/** a car stands still between two frames: it moved less than this (tiles) */
export const STILL = 1e-3;
