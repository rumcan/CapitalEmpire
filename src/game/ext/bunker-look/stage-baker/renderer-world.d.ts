/** The bake renderer's host helpers that the tests read (the renderer itself runs in the stage worker). */
export interface FaceTerrain { width: number; height: number; contours?: readonly (readonly (readonly number[])[])[]; sample(x: number, y: number): number }
export interface FaceField { W: number; H: number; data: Uint8Array; at(x: number, y: number): number }
export const FACE_FULL: number, FACE_REACH: number, FACE_COS_LO: number, FACE_COS_HI: number;
export function faceField(terrain: FaceTerrain, greens: readonly (readonly number[])[] | undefined): FaceField;
export function wallAt(field: FaceField | null, options: { wall?: number; wallLow?: number }, x: number, y: number): number;
export function surfaceHeight(d: number, depth: number, options?: Record<string, unknown>): number;
export class WorldRenderer { constructor(); }
