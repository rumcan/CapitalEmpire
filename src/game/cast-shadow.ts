// Cast shadows (the owner, 2026-10-22: "a way to add baked shadows"): every upright sprite throws its silhouette onto the ground away from the
// sun, hinged at its foot. The game draws them for its sprites on the GPU (gl.ts drawCast); the baked house lots carry theirs, baked into the
// lot pictures with the same settings (scripts/assets/lot-render.mjs), so both agree. Settings: cast-shadow.json (the sun's side, how long,
// how dark). Pure: importable from node and the asset scripts.
import file from './cast-shadow.json';

/** the cast shadows: angle, the screen direction they fall in (degrees: 0 right, 90 down, 180 left); length, a shadow's length per unit of the
 *  sprite's height on screen; strength, how dark (0..1); on, drawn at all */
export interface CastShadow { on: boolean; angle: number; length: number; strength: number }
export const CAST_DEFAULT: CastShadow = { on: true, angle: 165, length: 0.55, strength: 0.32 };
/** the ranges of the settings */
export const CAST_RANGES = { angle: [0, 360], length: [0.1, 1.5], strength: [0, 1] } as const;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** settings with every value held to its range (missing: the defaults) */
export function clampCast(c: Partial<CastShadow> | null | undefined): CastShadow {
  const D = CAST_DEFAULT, n = (k: keyof typeof CAST_RANGES, v: unknown) => clamp(typeof v === 'number' && Number.isFinite(v) ? v : D[k], CAST_RANGES[k][0], CAST_RANGES[k][1]);
  return { on: c?.on !== false, angle: n('angle', c?.angle), length: n('length', c?.length), strength: n('strength', c?.strength) };
}
/** the settings the game was built with */
export const CAST: CastShadow = clampCast(file as Partial<CastShadow>);
/** the shear of a shadow: a point h px above the foot line moves to (x + h * sx, foot + h * sy) */
export function castShear(c: CastShadow): { sx: number; sy: number } {
  const a = c.angle * Math.PI / 180;
  return { sx: c.length * Math.cos(a), sy: c.length * Math.sin(a) };
}
