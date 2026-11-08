// T333 (#959; the owner, 2026-11-04: "i also telport and dispear"): you and your cart move continuously in your round. Pure TS, no DOM:
// - **The walk up** (stepToward): near your ball you walk the last steps to the address (no snap from SNAP_TILES away), and a new aim turns you round
//   the ball at a shuffle (ADDRESS_PACE), never in one frame.
// - **The jump** (jumpAlpha, puffAt): the only moves in one frame are the ones you ask for (Jump to ball, Skip) and the cart brought or called from
//   far off; each fades in at its new place (JUMP_FADE_S) with a dust puff where it left and where it lands (PUFF_S), so it reads as intentional.
// Units: tiles (2 m), seconds.
import type { Pt } from './types';

/** you shuffle round your ball to a new address at this pace (tiles per second: 1.5 m/s) */
export const ADDRESS_PACE = 0.75;
/** within this (tiles) of the address you are at it: the shot opens */
export const AT_ADDRESS = 0.12;
/** a jump fades in over this long (s) */
export const JUMP_FADE_S = 0.35;
/** a dust puff lasts this long (s) */
export const PUFF_S = 0.6;

/** moves p toward `to` by at most `step` tiles (in place); returns the distance left */
export function stepToward(p: { x: number; y: number }, to: Pt, step: number): number {
  const dx = to.x - p.x, dy = to.y - p.y, d = Math.hypot(dx, dy);
  if (d <= step || d < 1e-9) { p.x = to.x; p.y = to.y; return 0; }
  const k = step / d; p.x += dx * k; p.y += dy * k; return d - step;
}

/** how visible something that jumped `age` seconds ago is (0 at the jump, 1 once faded in; 1 for no jump: a negative or non-finite age) */
export function jumpAlpha(age: number): number {
  if (!Number.isFinite(age) || age < 0 || age >= JUMP_FADE_S) return 1;
  const u = age / JUMP_FADE_S; return u * u * (3 - 2 * u);
}

/** a dust puff `age` seconds old: its rings (each a radius in tiles and an alpha 0..1), into out (cleared); none once it is over */
export function puffAt(age: number, out: { r: number; a: number }[]): { r: number; a: number }[] {
  out.length = 0;
  if (!(age >= 0) || age >= PUFF_S) return out;
  for (let k = 0; k < 3; k++) {
    const u = age / PUFF_S - k * 0.12; if (u <= 0) continue;
    out.push({ r: 0.25 + 0.9 * u + k * 0.15, a: 0.45 * (1 - u) * (1 - k * 0.25) });
  }
  return out;
}

/** a dust puff in the world: where (tiles) and when (performance.now ms) */
export interface Puff { x: number; y: number; at: number }
/** the puffs still showing at `now` (ms), the old ones dropped in place; at most 6 kept */
export function livePuffs(puffs: Puff[], now: number): Puff[] {
  for (let k = puffs.length - 1; k >= 0; k--) if (now - puffs[k]!.at >= PUFF_S * 1000) puffs.splice(k, 1);
  while (puffs.length > 6) puffs.shift();
  return puffs;
}
