// T351 (#994, the owner, 2026-11-08: "why does the golf cart not look natural when driving?"): the hire cart's eight pictures. The game had two (golf-cart-sw and golf-cart-se,
// the front to the screen's lower left or lower right), picked by the sign of hx - hy, so a cart driving up the screen showed its front and one driving across it a diagonal: it
// slid sideways or looked to reverse. It now has a picture for every heading on the iso screen, the object-eight set business:golf-cart (art/golf-cart-20261109/README.md): its SE
// and SW are the two it had, the other six the lead's corners and axisturn sheets. The picture drawn is the nearest of eight to the cart's heading, counted the way the cars'
// eight headings are (ext/car-art carHeading: 0 the screen's lower right, then S, SW, W, NW, N, NE, E), never mirrored; the heading is blended through its neighbours on a bend
// (play/cartturn.ts), so the picture steps round and never jumps across. ?oldcart: the two pictures and their rule, and the carts' steady pace and snapping heading, as before.
import { LIBRARY } from '../library';
import { carHeading } from '../ext/car-art';
import { OBJECT_EIGHT_SETS } from '../object-eight-library';
import type { ObjectEightSet, ObjectFacingKey } from '../object-eight-types';
import { OWNER_SCALE, STUDIO_SCALE } from '../lots/scales';
import { setCartSoft } from './play/cartturn';

/** the set's subject, and the two pictures the cart had before it (its SW and SE headings) */
export const CART_SUBJECT = 'business:golf-cart';
export const CART_OLD_IDS: readonly [string, string] = ['business:golf-cart-sw', 'business:golf-cart-se'];
/** the set's view that shows each of the eight headings, in carHeading's order (SE, S, SW, W, NW, N, NE, E: tile +x, +x+y, +y, -x+y, -x, -x-y, -y, +x-y): the way the cart's
 *  front faces (preset-art.ts: the NE view's front to +y, the SW heading; the N view's to the screen's bottom, the S heading; ...) */
export const CART_VIEW_KEYS: readonly ObjectFacingKey[] = ['normalSE', 'yaw8N', 'normalNE', 'yaw8W', 'normalNW', 'yaw8S', 'normalSW', 'yaw8E'];

/** the library index of the picture for each of the eight headings (carHeading's order). `at` says where a library id is (-1: not in it); `sets` are the eight-view sets. With
 *  no set the two old pictures serve their own headings; a heading with no picture is left to its nearest neighbour that has one (the one before it first), never mirrored */
export function cartItems(at: (id: string) => number, sets: readonly ObjectEightSet[]): number[] {
  const set = sets.find(s => s.subject === CART_SUBJECT && s.review === 'approved' && s.projection === 'normal+yaw8');
  const raw = CART_VIEW_KEYS.map(k => { const id = set?.views[k]?.id; return id === undefined ? -1 : at(id); });
  if (raw.every(i => i < 0)) { raw[2] = at(CART_OLD_IDS[0]); raw[0] = at(CART_OLD_IDS[1]); }
  return raw.map((i, h) => {
    if (i >= 0) return i;
    for (let d = 1; d <= 4; d++) for (const s of [-1, 1]) { const j = raw[(h + s * d + 8) % 8]!; if (j >= 0) return j; }
    return -1;
  });
}
const INDEX = new Map<string, number>(LIBRARY.map((it, i) => [it.id, i] as const));
/** the library index of each heading's picture (carHeading's order); -1s only when the library has none of the cart's pictures */
export const CART_ITEMS: readonly number[] = cartItems(id => INDEX.get(id) ?? -1, OBJECT_EIGHT_SETS);
/** the old pictures' indices (SW, SE) */
export const CART_OLD: readonly number[] = CART_OLD_IDS.map(id => INDEX.get(id) ?? -1);

/** ?oldcart: the two pictures picked by the sign of hx - hy, and your cart's side by your heading, as before T351 (the A/B and the old look kept as an option) */
export const OLD_CART: boolean = (() => { try { return new URLSearchParams(globalThis.location?.search ?? '').has('oldcart'); } catch { return false; } })();
setCartSoft(!OLD_CART); // (and the field's carts drive as before: a steady pace, the segment's own heading)

/** the heading (0-7, carHeading's order) a tile direction is nearest */
export const cartHeading = (hx: number, hy: number): number => carHeading(Math.atan2(hy, hx));
/** the heading (0-7) of a tile-space angle (atan2(hy, hx)) */
export const cartHeadingOf = (angle: number): number => carHeading(angle);
/** the library index of the picture a cart heading (hx, hy) draws: the nearest of eight (?oldcart: of two) */
export function cartPicture(hx: number, hy: number): number { return OLD_CART ? CART_OLD[hx - hy < 0 ? 0 : 1]! : CART_ITEMS[cartHeading(hx, hy)]!; }

/** the cart's draw scale, one for all eight pictures (the six new ones are sized, in the library, so that this one scale draws them as large as the two old ones): a size the
 *  studio set for the picture, else the studio's or the owner's for golf-cart-se (0.294, the size the cart always had, so a resize of the cart there still resizes all of it),
 *  else the set's baseline */
const BASE_SCALE = OBJECT_EIGHT_SETS.find(s => s.subject === CART_SUBJECT)?.baselineScale ?? 0.294;
export function cartScale(item: number): number {
  const id = LIBRARY[item]?.id ?? '', se = CART_OLD_IDS[1];
  return STUDIO_SCALE[id] ?? STUDIO_SCALE[se] ?? OWNER_SCALE[id] ?? OWNER_SCALE[se] ?? BASE_SCALE;
}
