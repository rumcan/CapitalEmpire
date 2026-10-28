// T213 (#558): who rides a cart and who has a caddie. The tour's pros (tier CADDIE_TIER and up) each have a caddie who walks beside them and stands off
// the green while they putt; the amateurs at the lower tiers (CART_TIER and down) and the everyday visitors ride carts, two to a cart, on the cart
// paths; the club's members may walk. A cart's golfers move a little faster between shots (CART_PACE): round.ts takes it in its time model (the
// outcome of every stroke stays the same, only the minutes move), so T211's waits still hold. Pure TS, no DOM; the playback is carts.ts and view.ts.
import { rng } from './shot';
import type { Golfer, Group } from './types';

/** the tiers (1..5) whose pros have caddies: the tour events (tier 1 and 2 pros are the local club pros, who carry their own bags) */
export const CADDIE_TIER = 3;
/** the tiers (1..5) whose amateurs ride carts: the small events (the amateurs at the bigger events walk, as the pros do) */
export const CART_TIER = 2;
/** a cart's golfers take this share of the walking time between two shots and between a green and the next tee (round.ts): the drive is quick, the
 *  walks from the cart to the ball and back are not */
export const CART_PACE = 0.75;
/** the share of the club members' everyday groups who walk (the visitors always ride) */
export const MEMBER_WALK = 0.5;

/** a tier as an integer 1..5 */
const tierOf = (tier: number): number => Math.min(5, Math.max(1, Math.round(tier)));

/** pairs the riders of each group into carts, two to a cart in the group's order (an odd one rides alone): golfer.cart is the cart's index, 0.. in
 *  group order. The owner never rides (his walk to his ball is the live playback's, view.ts pendingAt). Clears the cart of everyone else. Returns the
 *  number of carts */
export function pairCarts(golfers: Golfer[], groups: Group[], rides: (g: Golfer, group: number) => boolean): number {
  const who = new Map(golfers.map(g => [g.id, g] as const));
  for (const g of golfers) delete g.cart;
  let n = 0;
  groups.forEach((gr, k) => {
    let seat = 0;
    for (const id of gr.players) {
      const g = who.get(id);
      if (!g || g.owner || !rides(g, k)) continue;
      g.cart = seat === 0 ? n++ : n - 1;
      seat = (seat + 1) % 2;
    }
  });
  return n;
}

/** a tournament field's entourage at a tier: a caddie for each pro at CADDIE_TIER and up, carts for the amateurs at CART_TIER and down (the owner
 *  walks). Written into the golfers (deterministic: the field and its groups decide it) */
export function fieldEntourage(golfers: Golfer[], groups: Group[], tier: number): void {
  const k = tierOf(tier);
  for (const g of golfers) { if (g.pro && !g.owner && k >= CADDIE_TIER) g.caddie = true; else delete g.caddie; }
  pairCarts(golfers, groups, g => !g.pro && k <= CART_TIER);
}

/** an everyday day's carts: every visitors' group rides, a members' group walks MEMBER_WALK of the time (its own stream of the day's seed, so the roster's
 *  draws never shift). member[k]: whether group k is the club's members */
export function dayEntourage(golfers: Golfer[], groups: Group[], member: readonly boolean[], seed: number): void {
  const walk = groups.map((_, k) => !!member[k] && rng(seed, -3, k)() < MEMBER_WALK);
  for (const g of golfers) delete g.caddie;
  pairCarts(golfers, groups, (_, k) => !walk[k]);
}
