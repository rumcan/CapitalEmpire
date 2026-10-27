/** the edge heal (T162, T165; tile-heal.mjs): its method names, the bridge's weight, the heals, the stripes and the measures */
type Px = Uint8Array | Uint8ClampedArray;
export interface Mismatch { lr: number; tb: number; h: number; v: number }
export const HEAL_METHOD: string;
export const HEAL_MATCH: string;
export const HEAL_SHARED: string;
export const HEAL_AS_MADE: string;
export function bridgeWeight(p: number, band: number): number;
export function healWrap(px: Px, w: number, h: number, ch: number, band: number): Uint8Array;
export function healWrapWith(px: Px, w: number, h: number, ch: number, band: number, opts?: { bridge?: 'middle' | 'match' }): { pixels: Uint8Array; centre: { x: number; y: number } };
export function healShared(tiles: Px[], w: number, h: number, ch: number, band: number): { tiles: Uint8Array[]; centre: { x: number; y: number } };
export function wrapMismatch(px: Px, w: number, h: number, ch: number): Mismatch;
export function crossMismatch(a: Px, b: Px, w: number, h: number, ch: number): { lr: number; tb: number };
export function setMismatch(tiles: Px[], w: number, h: number, ch: number): Mismatch;
export function stripePeriod(px: Px, w: number, h: number, ch: number, axis: 'x' | 'y'): { period: number; strength: number } | null;
export function stripePhase(px: Px, w: number, h: number, ch: number, periodX: number, periodY: number): { x: number; y: number };
export function stripeCrop(px: Px, w: number, h: number, ch: number, opts?: { minFrac?: number; minStrength?: number }): {
  x0: number; y0: number; w: number; h: number; periodX: number; periodY: number; kx: number; ky: number;
  phase: { before: { x: number; y: number }; after: { x: number; y: number } };
} | null;
export function cropPixels(px: Px, w: number, h: number, ch: number, r: { x0: number; y0: number; w: number; h: number }): Uint8Array;
