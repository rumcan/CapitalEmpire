import { STUDIO_SCALE } from '../../lots/scales';
import { carModel, carModelSize } from './model.mjs';
export { CAR_MODEL_NAMES, carModel, carModelName, carModelSize, foldCarSizes } from './model.mjs';

/** Eight sprite headings in world-angle order. The delivery labels describe the nose on screen. */
export const CAR_DIRECTIONS = ['SE', 'S', 'SW', 'W', 'NW', 'N', 'NE', 'E'] as const;
/** Nearest painted heading to a world atan2 angle (radians), wrapping through north without mirroring. */
export function carHeading(angle: number): number {
  return ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
}
/** every car is drawn this much smaller than its art, parked and moving (sprites.ts drawables of kind car; SimClient.visible): the owner, 2026-10-19;
 *  0.88 (was 0.8): the owner, 2026-10-21, found all cars about 10% too small */
export const CAR_SCALE = 0.88;
/** a car's size key: its model (model.mjs carModel). Every picture of one car shares one studio size: the eight headings of an eight-way car
 *  (cars:<model>:<heading> -> cars:<model>), a town car's facings and their views (static:compact_n, static:compact_e-v2,
 *  variation:static-compact_n-<hash>:1 -> static:compact), a world car's views (variation:world-car_0-<hash>:2 -> world:car_0). For car ids only */
export function carSizeId(id: string): string { return carModel(id); }
/** a car's owner size (the sprite studio's size for its model, scale-overrides.json; 1 when unset): a car is drawn at CAR_SCALE times it, parked and
 *  moving, whichever way it faces, so cars keep the road cars' size until the owner sets one. A size the studio kept under one of the model's pictures
 *  before T143 (a facing's or a view's own key) still counts: the largest of them (carModelSize), until the studio's next save folds them into the
 *  model's key. The table's car sizes (places-v5) are not used: lot and road cars never took them */
export function carOwnerScale(id: string, sizes: Readonly<Record<string, number>> = STUDIO_SCALE): number { return carModelSize(sizes, carModel(id)) ?? 1; }
/** World-axis bounding half sizes in metres of a 4.5 m long, 1.8 m wide car. */
export function carFootprint(heading: number): { hx: number; hy: number } {
  const a = heading * Math.PI / 4, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  return { hx: 2.25 * c + 0.9 * s, hy: 2.25 * s + 0.9 * c };
}
