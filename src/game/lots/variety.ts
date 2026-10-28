// T270 (#811; the owner, 2026-10-29: "I have 5 video vault stores next to eachother in the game atm. can we do somthing about variety"): which
// shop a lot shows, picked by its place before its preset. The composer used to pick a preset by the lot's slot along its street and draw the shop
// that preset holds, so the only approved shop presets (the lot lab's 12x14 and 14x14 lots, all Video Vaults) made every shop lot of 12-16 tiles a
// Video Vault, and the block lots (irregular widths) took no consecutive slots. Now a shop lot's business is its colour on a lattice along its
// street, so the lots of one block face and the lot across the street always differ, and every picture of the palette is used about as often:
//   colour = (STEP x floor(c / LATTICE) + n/2 x side + axis) mod n
// c is the lot's frontage centre along its street's map axis (world tiles), side is which way the lot faces across that axis (the lots across a
// street face the other way), axis is the street's axis. Two lots side by side on one face have frontage centres half their two widths apart:
// 7 to 25 tiles for lots of 7 to 25 (the shop lots are 8.5 to 20), so 1 to 4 cells, and STEP x 1..4 = 3, 6, 9, 12 is never a multiple of the
// shop palette's 8. The lot across faces the other way (n/2 = 4 more) with its frontage centre within 21 tiles of this one's whenever the two
// overlap (two lots of up to 21: 0 to 3 cells either way): 4 + 3 x (-3..3) = -5, -2, 1, 4, 7, 10, 13, never a multiple of 8 either. Pure: the
// lot's place alone picks it, so a lot never changes on a reload, its neighbours need not be known, and it costs one floor and a mod a lot. The
// composer then draws a preset that holds that shop, else the lot's own preset with its shop swapped for that one in the same spot
// (lots/compose.ts shopPlan). The three venues cannot keep that promise (BY_EIGHT: two tour lots two or three cells apart can match).
import type { LotGeom } from './compose-core';

/** the lattice step along a street (tiles): two lots side by side of 7 tiles or more never share a cell */
export const LATTICE = 7;
/** the colours one cell moves (prime to the palette: 3, else 1) */
const stepOf = (n: number) => (n % 3 ? 3 : 1);

/** the business a picture shows (the shops' and venues' four-view art: the NE view's id; the lettering on its sign) */
export const BUSINESS: Readonly<Record<string, string>> = {
  'town:bakery': 'Bakery', 'town:grocery': 'Maple Falls Grocery', 'town:pharmacy': 'Pharmacy', 'town:laundromat': 'Laundry',
  'town:fish_tackle': 'Fish & tackle', 'town:barber': 'Barbershop', 'world:video': 'Video', 'world:video_rental': 'Video Vault',
  'world:arcade': 'Arcade', 'world:diner': 'Diner', 'world:snack_bar': 'Snack bar',
};
/** the businesses whose sign carries a proper name (one of each to a block face; see docs/GOLF-SPRITES.md for the shops the town needs more of) */
export const NAMED: ReadonlySet<string> = new Set(['Maple Falls Grocery', 'Video Vault']);

/** the shop fronts a shop lot (com) shows, in colour order: the two video shops and the two named ones kept apart on the lattice */
export const SHOP_PALETTE: readonly string[] = ['town:bakery', 'town:grocery', 'town:pharmacy', 'world:video', 'town:laundromat', 'world:video_rental', 'town:fish_tackle', 'town:barber'];
/** the venues a tour lot shows (its gas stations are laid by their own plan, gas-station.ts, and keep their preset) */
export const VENUE_PALETTE: readonly string[] = ['world:arcade', 'world:diner', 'world:snack_bar'];
/** a preset's building that stands for a palette picture: the arcade's straight-on variation (frontal.ts: never drawn as itself on a lot, it was
 *  drawn as a stand-in, a barn or the video shop: newart.ts) is an arcade's spot, always drawn as a palette venue */
export const SPOT_OF: Readonly<Record<string, string>> = { 'variation:world-arcade-f5b7f5eb-plain:1': 'world:arcade' };

/** a lot's place on the lattice: its cell along its street (floor of the frontage centre over LATTICE), the side it faces (0: +y or +x, 1: the
 *  other way) and its street's axis (0: along x, 1: along y) */
export function latticeOf(lot: LotGeom): { cell: number; side: 0 | 1; axis: 0 | 1 } {
  const axis = Math.abs(lot.u.x) >= Math.abs(lot.u.y) ? 0 : 1;
  const c = axis ? lot.o.y + lot.u.y * lot.w / 2 : lot.o.x + lot.u.x * lot.w / 2, across = axis ? lot.n.x : lot.n.y;
  return { cell: Math.floor(c / LATTICE + 1e-9), side: across > 0 ? 0 : 1, axis };
}
/** a lot's colour among n (0..n-1): STEP colours a lattice cell, n/2 more for the lots facing the other way, one more on the other axis */
export function colourOf(lot: LotGeom, n: number): number {
  if (n === 3) return BY_EIGHT[colourOf(lot, 8)]!;
  const { cell, side, axis } = latticeOf(lot);
  return (((stepOf(n) * cell + Math.floor(n / 2) * side + axis) % n) + n) % n;
}
/** a palette of three (the venues) from the eight colours: no way of three keeps every neighbour apart, this one the commonest: colours 3, 4 and
 *  5 apart always differ (the lots side by side one cell apart, 3; the lot straight across, 4; across three cells off, 5), 1, 2, 6 and 7 apart
 *  (two or three cells side by side, one or two off across) may match */
const BY_EIGHT = [2, 2, 1, 1, 1, 0, 0, 0] as const;
/** the order a lot tries the palette in when its colour's picture fits none of its presets (a shop lot never needs it in the towns tried; a
 *  house lot's allocations and size leave it part of the houses): its colour, then on round the palette, so two lots of different colours
 *  only meet when none of the pictures between them fits */
export function tryOrder(colour: number, n: number): number[] { return Array.from({ length: n }, (_, k) => (colour + k) % n); }
/** the business of a picture id (a view's base), or null */
export function businessOf(id: string): string | null { return BUSINESS[SPOT_OF[id] ?? id] ?? null; }
