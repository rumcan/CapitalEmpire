// The event's tunables (Phase 5 step 2b): the stadium site, the crowd, the build and the surge, the clock a round freezes at. Pure TS, no DOM.

/** the build of a round, wall-clock s (the stadium goes up while the sim runs on) */
export const BUILD_S = 600;
/** the surge of a round, sim s from kick-off to the eval (the clock is frozen meanwhile) */
export const SURGE_S = 600;
/** the game clock a round freezes at, s of the day: 18:00 (one sim s is one game minute) */
export const EVENT_CLOCK = 18 * 60;
/** the cars the crowd sends at level 1, over all the towns */
export const L1_CARS = 1200;
/** the party size of a group of visitors (the fans a car stands for; shown on the surge's total line) */
export const PARTY = 3;
/** the share of the surge over which the crowd departs (the rest is the drive in): departures fill the first DEPART_END * SURGE_S */
export const DEPART_END = 0.75;
/** the seed of the surge's own random stream (its departures, origins and destinations: never the sim's or the town's) */
export const SURGE_SEED = 7919;
/** the crowd's growth per level: the cars at level L are L1_CARS * LEVEL_MUL ** (L - 1) */
export const LEVEL_MUL = 1.4;
/** the share of the town's growth the event adds (not used yet: a later step) */
export const TOWN_GROWTH = 0.25;
/** the stadium's footprint, tiles: its width (x) */
export const STADIUM_W = 100;
/** the stadium's footprint, tiles: its height (y) */
export const STADIUM_H = 80;
/** the nearest a stadium centre may be to a town centre, tiles */
export const SITE_MIN = 500;
/** the farthest a stadium centre may be to a town centre, tiles (the search relaxes it by 250 then 500) */
export const SITE_MAX = 1250;
/** the stadium's footprint keeps this many tiles from the map's edges */
export const SITE_MARGIN = 64;
/** a car park's bay width along its row, tiles */
export const BAY_W = 1.25;
/** a car park's bay depth (the row's depth from its aisle), tiles */
export const BAY_D = 2.5;
/** a car park's aisle width (the entry lane along the frontage, and between the bay rows), tiles */
export const AISLE = 3;
/** a car park's cost per tile, $ */
export const LOT_TILE_COST = 25;
/** the time an entrance holds for each car it admits, s (the next car waits this long at the gate) */
export const ENTRY_S = 2;
/** a car park entrance per this many tiles of frontage */
export const ENTRANCE_EVERY = 40;
/** the most entrances a car park has */
export const MAX_ENTRANCES = 3;
/** the most tiles between a road's verge and a car park's edge (the frontage road) */
export const FRONT_GAP = 3;
/** the shortest side of a car park, tiles */
export const MIN_PARK = 12;
