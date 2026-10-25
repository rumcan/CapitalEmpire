// The pictures the Event tool's structures are drawn with (golf/tents.ts STRUCTURES), by structure type. Most are stand-ins until each structure has
// its own art: each is the nearest existing picture of the same thing (a grandstand for a grandstand, a tent for a tent), never a prop of another
// kind (T111: the bigger grandstands were drawn as the course-map bench). Pure TS, no DOM.

/** the library sprite each structure type is drawn with (the engine falls back to FALLBACK_STRUCTURE_SPRITE for a type not listed) */
export const STRUCTURE_SPRITE: Record<string, string> = {
  foodTent: 'golf:food-tent', drinksTent: 'expansion:backyard-tent', kiosk: 'business:fishing-rental-kiosk', foodTruck: 'golf:food-tent',
  merchTent: 'expansion:backyard-tent', merchPavilion: 'business:golf-halfway-pavilion', chalet: 'business:golf-halfway-pavilion', village: 'business:golf-halfway-pavilion',
  standS: 'golf:grandstand-s', standM: 'golf:grandstand-s', standL: 'golf:grandstand-s', leaderboard: 'golf:leaderboard',
  holeBoard: 'poi:fishing-board', screen: 'poi:movie-display', tvTower: 'world:watertower', broadcast: 'business:golf-cart-garage', media: 'business:golf-clubhouse',
  gate: 'ce:parking-entry', toilets: 'golf:toilet-block', firstAid: 'expansion:backyard-tent', info: 'ce:parking-kiosk', rideshare: 'town:bus_stop',
  coach: 'business:golf-cart-garage', hotel: 'business:golf-clubhouse', interchange: 'ce:parking-entry', rangeStand: 'golf:grandstand-s', sponsorDisplay: 'poi:movie-display', helipad: 'business:golf-halfway-pavilion',
};
/** the picture of a structure type not in STRUCTURE_SPRITE */
export const FALLBACK_STRUCTURE_SPRITE = 'expansion:backyard-tent';
/** the structure sprites T111 replaced (the grandstands M and L and the range grandstand drawn as the course-map bench; the food truck and the
 *  drop-off as the produce crates, which the new-art stand-in drew as a bus shelter): a save's prop of one on its structure is replaced by
 *  today's picture (engine syncGolfProps) */
export const STRUCTURE_SPRITE_OLD: Record<string, string> = {
  standM: 'business:golf-bench-course-map', standL: 'business:golf-bench-course-map', rangeStand: 'business:golf-bench-course-map',
  foodTruck: 'town:produce_stand', rideshare: 'town:produce_stand',
};
