// #1300 (the owner, 2026-11-14: "remove all shack art. there should not be any shack stuff. you can place second hand stuff for cheaper and new stuff
// for more money"). The props had a shabby and a proper version of the stalls and the event structures; now the player chooses a SECOND-HAND one (cheaper:
// a normal, decent thing a little older in style) or a NEW one (the dearer, best-looking one). The decisions (the lead, 2026-11-15):
//  - the shack pictures (every shack, shanty and tin-and-tarp prop, SHACK_PROPS) leave every menu; a save holding one loads it as its replacement:
//    the second-hand painting of its new counterpart once that has landed (queue-shack1300*.json, packed by prep-range-art.mjs, listed in range-art.json),
//    else the new counterpart itself;
//  - the other "(shabby)" props (the bleachers, the scaffolds, the cap and drinks stalls: decent, only older) are the second-hand tier: their groups are
//    "Stalls (second-hand)" and "Event structures (second-hand)", at SECOND_HAND_FACTOR of the new price ($300 against $500);
//  - a second-hand painting, once it lands, is a card beside its new counterpart in the same group, "<name> (second-hand)" at SECOND_HAND_FACTOR of its price;
//  - the props have no appeal or upkeep yet (decor.ts: appeal 0), so the gap is the price and the look; the event seating keeps its own two conditions
//    (facility-models.ts: budget = second-hand, upgraded = new, the one-time fee unchanged).
import RANGE_ART from './range-art.json';
import RANGE_ITEMS from './range-art-items.json';

/** a second-hand prop's price against its new one */
export const SECOND_HAND_FACTOR = 0.6;
export type PropTier = 'second-hand' | 'new';

/** every shack prop (new-props-library.ts) and the NEW prop it loads as in an old save (or its second-hand painting, once packed) */
export const SHACK_PROPS: Readonly<Record<string, string>> = {
  'newprop:tarp-market-stall': 'newprop:drinks-stand-with-canopy', 'newprop:shack-stall': 'newprop:club-rack-stall', 'newprop:shack-map-board': 'newprop:course-map-board',
  'newprop:tarp-counter': 'newprop:green-kiosk', 'newprop:shanty-hut': 'newprop:starter-hut', 'newprop:shanty-stall': 'newprop:green-food-kiosk',
  'newprop:shanty-counter': 'newprop:pro-shop-kiosk', 'newprop:snack-shack': 'newprop:food-pavilion', 'newprop:shanty-shed': 'newprop:garden-shed',
  'newprop:tarp-shelter': 'newprop:marquee', 'newprop:bait-shack': 'newprop:garden-shed', 'newprop:tarp-seating': 'newprop:picnic-table',
  'newprop:shanty-medical-tent': 'newprop:medical-tent', 'newprop:shanty-cart-ambulance': 'newprop:cart-ambulance', 'newprop:shanty-toilet': 'newprop:portable-toilets',
  'newprop:shanty-weather-mast': 'newprop:weather-station', 'newprop:shanty-ticket-hut': 'newprop:ticket-booth', 'newprop:shanty-booth': 'newprop:green-booth',
  'newprop:shanty-turnstiles': 'newprop:ticket-booth', 'newprop:shanty-counter-2': 'newprop:white-tent-booth',
  'newprop:shanty-camera-tower': 'newprop:camera-tower', 'newprop:shanty-broadcast-van': 'newprop:broadcast-truck', 'newprop:shanty-satellite-van': 'newprop:satellite-van',
  'newprop:shanty-camera': 'newprop:tv-camera', 'newprop:shanty-range-bay': 'newprop:range-bay',
  'newprop:shanty-leaderboard': 'newprop:leaderboard', 'newprop:shanty-hole-sign': 'newprop:hole-12-sign', 'newprop:shanty-clock': 'newprop:clock-post', 'newprop:shanty-signpost': 'newprop:direction-signpost',
};
/** which second-hand painting (range-art-items.json secondHand: its slug) replaces which shack prop (the art table, scripts/assets/art-1304-1300.mjs) */
export const SHACK_PAINTING: Readonly<Record<string, string>> = {
  'newprop:tarp-market-stall': 'second-hand-drinks-stand', 'newprop:shack-stall': 'second-hand-club-rack-stall', 'newprop:shack-map-board': 'second-hand-map-board',
  'newprop:tarp-counter': 'second-hand-kiosk', 'newprop:shanty-hut': 'second-hand-starter-hut', 'newprop:shanty-stall': 'second-hand-food-kiosk',
  'newprop:shanty-counter': 'second-hand-pro-shop-kiosk', 'newprop:snack-shack': 'second-hand-food-pavilion', 'newprop:shanty-shed': 'second-hand-garden-shed',
  'newprop:tarp-shelter': 'second-hand-marquee', 'newprop:bait-shack': 'second-hand-garden-shed', 'newprop:tarp-seating': 'second-hand-picnic-seats',
  'newprop:shanty-medical-tent': 'second-hand-medical-tent', 'newprop:shanty-cart-ambulance': 'second-hand-cart-ambulance', 'newprop:shanty-toilet': 'second-hand-toilets',
  'newprop:shanty-weather-mast': 'second-hand-weather-mast', 'newprop:shanty-ticket-hut': 'second-hand-ticket-booth', 'newprop:shanty-booth': 'second-hand-booth',
  'newprop:shanty-turnstiles': 'second-hand-turnstiles', 'newprop:shanty-counter-2': 'second-hand-tent-booth',
  'newprop:shanty-camera-tower': 'second-hand-camera-tower', 'newprop:shanty-broadcast-van': 'second-hand-broadcast-van', 'newprop:shanty-satellite-van': 'second-hand-satellite-van',
  'newprop:shanty-camera': 'second-hand-tv-camera', 'newprop:shanty-range-bay': 'second-hand-range-bay',
  'newprop:shanty-leaderboard': 'second-hand-leaderboard', 'newprop:shanty-hole-sign': 'second-hand-hole-sign', 'newprop:shanty-clock': 'second-hand-clock', 'newprop:shanty-signpost': 'second-hand-signpost',
};
/** a shack prop: never offered, never drawn (an old save's loads as its replacement) */
export const isShackProp = (id: string): boolean => id in SHACK_PROPS;

/** the second-hand paintings: slug, its new counterpart (a newprop id) and its name, from range-art-items.json */
export const SECOND_HAND_ITEMS: readonly { slug: string; newId: string; name: string }[] =
  ((RANGE_ITEMS as { secondHand?: { slug: string; newId: string; name: string }[] }).secondHand ?? []).map(({ slug, newId, name }) => ({ slug, newId, name }));
/** a second-hand painting's library ids (view 1, view 2) once prep-range-art.mjs has packed it, else null */
export function secondHandViews(slug: string, views: Readonly<Record<string, readonly string[]>> = (RANGE_ART as { views: Record<string, string[]> }).views): readonly string[] | null {
  const v = views[slug]; return v && v.length ? v : null;
}

/** the library id a shack prop loads as (has: the library has that id): its second-hand painting when packed, else its new counterpart */
export function shackReplacement(id: string, has: (id: string) => boolean, views?: Readonly<Record<string, readonly string[]>>): string {
  const next = SHACK_PROPS[id]; if (!next) return id;
  const slug = SHACK_PAINTING[id], v = slug ? secondHandViews(slug, views) : null;
  return v && has(v[0]!) ? v[0]! : next;
}
/** the catalogue key (decor.ts) a replacement is placed with */
export const replacementKey = (id: string): string => id.startsWith('newprop:') ? `newprop-${id.slice('newprop:'.length)}`
  : `secondhand-${SECOND_HAND_ITEMS.find(i => secondHandViews(i.slug)?.includes(id))?.slug ?? id}`;
/** an old save's prop tuple with any shack prop swapped for its replacement (its catalogue key too); every other tuple as it was */
export function shackTuple<T extends readonly unknown[]>(t: T, has: (id: string) => boolean, views?: Readonly<Record<string, readonly string[]>>): T {
  const id = t[0]; if (typeof id !== 'string' || !isShackProp(id)) return t;
  const next = shackReplacement(id, has, views), out = [...t] as unknown[] as T & unknown[];
  out[0] = next; if (typeof out[6] === 'string') out[6] = replacementKey(next);
  return out as unknown as T;
}

/** the "(shabby)" categories' new names */
export const tierCat = (cat: string): string => cat.replace(/ \(shabby\)$/, ' (second-hand)');
/** a library category's tier: "(second-hand)" ones, and their new counterparts' plain groups (Stalls, Event structures); null: no tier choice */
export function tierOfCat(cat: string): PropTier | null {
  if (/ \((second-hand|shabby)\)$/.test(cat)) return 'second-hand';
  return /^New: (Stalls|Event structures)$/.test(cat) ? 'new' : null;
}
/** a second-hand price from the new one, to the nearest $10 */
export const secondHandPrice = (newPrice: number): number => Math.round(newPrice * SECOND_HAND_FACTOR / 10) * 10;

/** the house lots' For Sale sign (estate.ts): the second-hand sale sign once painted, else the plain direction signpost (the shanty one is gone) */
export const saleSignId = (): string => secondHandViews('second-hand-sale-sign')?.[0] ?? 'newprop:direction-signpost';
