/** Eight sprite headings in world-angle order. The delivery labels describe the nose on screen. */
export const CAR_DIRECTIONS = ['SE', 'S', 'SW', 'W', 'NW', 'N', 'NE', 'E'] as const;
/** Nearest painted heading to a world atan2 angle (radians), wrapping through north without mirroring. */
export function carHeading(angle: number): number {
  return ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
}
/** every car is drawn this much smaller than its art, parked and moving (sprites.ts drawables of kind car; SimClient.visible): the owner, 2026-10-19 */
export const CAR_SCALE = 0.8;
/** World-axis bounding half sizes in metres of a 4.5 m long, 1.8 m wide car. */
export function carFootprint(heading: number): { hx: number; hy: number } {
  const a = heading * Math.PI / 4, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  return { hx: 2.25 * c + 0.9 * s, hy: 2.25 * s + 0.9 * c };
}
