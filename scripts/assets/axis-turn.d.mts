// Types for axis-turn.mjs (T315: a turned straight-on picture's size and footprint, for prep-axis-views.mjs and the tests).
export const K: number;
export function footPoint(yaw: number, u: number, v: number): [number, number];
export function footRing(front: number, depth: number, yaw: number): [number, number][];
export function nearAt(ring: [number, number][], x: number): number | null;
export function turnedHeight(hSquare: number, front: number, depth: number, yaw: number): number;
export function fitTurnedFoot(bot: ArrayLike<number>, yaw: number, aspect: number, tol?: number): { cx: number; cy: number; fl: [number, number]; fr: [number, number]; front: number; depth: number; inliers: number } | null;
export function bottomProfile(sharp: unknown, png: Buffer, alpha?: number): Promise<{ bot: Float64Array; width: number; height: number }>;
