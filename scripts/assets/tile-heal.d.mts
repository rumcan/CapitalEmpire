/** the edge heal (T162, tile-heal.mjs): its method name, the bridge's weight, the heal and the wrap measure */
export const HEAL_METHOD: string;
export function bridgeWeight(p: number, band: number): number;
export function healWrap(px: Uint8Array | Uint8ClampedArray, w: number, h: number, ch: number, band: number): Uint8Array;
export function wrapMismatch(px: Uint8Array | Uint8ClampedArray, w: number, h: number, ch: number): { lr: number; tb: number; h: number; v: number };
