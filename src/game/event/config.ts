// The event's tunables (Phase 5 step 2b): the stadium site, the crowd, the build and the surge, the clock a round freezes at. Pure TS, no DOM.

import { BUSINESS } from '../business/catalogue';

/** the build of a round, wall-clock s (the stadium goes up while the sim runs on) */
export const BUILD_S = 600;
/** the surge of a round, sim s from kick-off to the eval (the clock is frozen meanwhile) */
export const SURGE_S = 600;
/** the game clock a round freezes at, s of the day: 18:00 (one sim s is one game minute) */
export const EVENT_CLOCK = 18 * 60;
/** the cars the crowd sends at level 1, over all the towns */
export const L1_CARS = 240;
/** the party size of a group of visitors (the fans a car stands for; shown on the surge's total line) */
export const PARTY = 3;
/** the share of the surge over which the crowd departs (the rest is the drive in): departures fill the first DEPART_END * SURGE_S */
export const DEPART_END = 0.55;
/** the seed of the surge's own random stream (its departures, origins and destinations: never the sim's or the town's) */
export const SURGE_SEED = 7919;
/** the crowd's growth per level: the cars at level L are L1_CARS * LEVEL_MUL ** (L - 1) */
export const LEVEL_MUL = 1.4;
/** the share of the town's growth a perfect run adds (each town is stamped to its population times 1 + TOWN_GROWTH: see City.closeRound) */
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
/** what the player pays to build the stadium, $ (demolishing gives back half) */
export const STADIUM_COST = 200000;
/** the nearest a placed stadium's centre may be to a town centre, tiles */
export const STADIUM_TOWN_MIN = 200;
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
/** the entry time factor of the Express entry card: an entrance holds ENTRY_S * EXPRESS_ENTRY s per car */
export const EXPRESS_ENTRY = 0.7;
/** the cars an entrance's entry lane holds off the road, waiting for the gate (a car past a full lane holds on the road instead) */
export const ENTRY_Q = 10;
/** a car park entrance per this many tiles of frontage */
export const ENTRANCE_EVERY = 40;
/** the most entrances a car park has */
export const MAX_ENTRANCES = 3;
/** the most tiles between a road's verge and a car park's edge (the frontage road) */
export const FRONT_GAP = 3;
/** the shortest side of a car park, tiles */
export const MIN_PARK = 12;
/** the tiles between the centres of on-street parking bays (6 m), along the kerb */
export const CURB_BAY = 3;
/** the tiles kept clear at each end of an on-street parking run */
export const CURB_END = 4;
/** the fewest bays an on-street parking run may have */
export const CURB_MIN_BAYS = 4;
/** what each on-street parking bay costs to build, $ */
export const CURB_BAY_COST = 60;
/** the toll gate's plaza: the toll piece of road, tiles (the plaza seg's length) */
export const PLAZA_LEN = 30;
/** the tiles at each end of the plaza over which the booth lanes fan out and back in */
export const TAPER = 10;
/** the tiles between booth lanes */
export const BOOTH_W = 1.75;
/** the booths a new toll gate has */
export const START_BOOTHS = 6;
/** the seconds a car stops at a booth to pay */
export const SERVICE_S = 4;
/** the toll per car at level 1, $ */
export const TOLL_PRICE = 25;
/** the toll per car at a level, $ (up a quarter per level) */
export const tollPrice = (level: number): number => Math.round(TOLL_PRICE * (1 + 0.25 * (level - 1)));
/** the route cost a driver puts on a toll, s (a movement into a toll plaza costs this much more) */
export const TOLL_ROUTE_COST = 25;
/** what a new toll gate costs to build, $ (the base: the plaza and its taper) */
export const TOLL_BASE_COST = 10000;
/** what each booth of a new toll gate adds to its cost, $ */
export const TOLL_BOOTH_COST = 4000;
/** the seats of a shuttle bus: a bus leaves its lot stop once it has this many fans on board */
export const BUS_SEATS = 60;
/** the shuttle buses a new route has (the UI's default; a route's count is its own) */
export const START_BUSES = 8;
/** a shuttle bus's length, m (its vehicle type: the bus is the last of VTYPES, the cars never draw it) */
export const BUS_LEN = 12;
/** a fan boards a bus at its lot stop every BOARD_S s (while seats are free), s */
export const BOARD_S = 0.5;
/** a fan alights at the doors stop every ALIGHT_S s, s */
export const ALIGHT_S = 0.3;
/** a bus at its lot stop leaves, once the queue is empty, after MIN_DWELL s at the stop, s */
export const MIN_DWELL = 5;
/** a bus at its lot stop leaves at MAX_DWELL s at the stop whatever the queue, s */
export const MAX_DWELL = 40;
/** a walking fan's speed, m/s (the walk from a car park's bay to a lot stop or a stadium door, straight) */
export const WALK_V = 1.4;
/** what a shuttle route costs to build, $ (the UI charges it) */
export const BUS_ROUTE_COST = 15000;
/** the farthest a party's home may be from a town's bus stop (a stop on a road beside a town's car park lot), tiles (300 m): the party takes the town bus, not a car */
export const BUS_WALK = 150;
/** the seats of a double-decker bus (the Double-decker buses card: every route's seats are at least this) */
export const DECK_SEATS = 100;

/** the town's own growth with town centres (the gravel lots only): lots a game day = TOWN_RATE_BASE + TOWN_RATE_PER_BUILT x the town's built lots, times the speed
 *  (the single town keeps its own rate, see Town.step) */
export const TOWN_RATE_BASE = 5;
/** see TOWN_RATE_BASE: the extra lots a game day per built lot */
export const TOWN_RATE_PER_BUILT = 0.02;
/** with town centres: the lots a game hour the player's paved roads grow on their own (the EMPTY lots fronting paved roads), times the speed */
export const PAVED_RATE = 6;
/** with town centres: the town lays at most one gravel leg every this many game hours, times the speed */
export const GRAVEL_EVERY_H = 6;
/** with town centres: a lot's price, $ (times its frontage class value: CLASS_VALUE in budget.ts), paid to the player when the town builds on a lot on a paved road */
export const LOT_PRICE = 2000;
/** with town centres: the share of a lot's price the player is paid for it (see LOT_PRICE) */
export const SALE_SHARE = 0.3;

/** the treasury of a new valley with town centres, $ (the single town starts with START_MONEY: see budget.ts startMoney); the stadium's cost
 *  (STADIUM_COST) is added to the old 600000, so a new game's spending room is unchanged */
export const EVENT_START_MONEY = 800000;
/** the payout of a round at rate 1 and level 1, $ (the curve: see payout) */
export const PAYOUT_BASE = 100000;
/** the arrival rate at which a round pays nothing (the curve's pivot) */
export const PAYOUT_PIVOT = 0.5;
/** the most a round at rate 0 costs, $ (the penalty: see payout) */
export const PENALTY = 20000;
/** the arrival rate a round must reach to be perfect (its towns grow and the stadium's level rises on close) */
export const PERFECT_RATE = 0.9995;
/** the payout of a round, $ (signed: a negative one is a cost): at rate >= PAYOUT_PIVOT, PAYOUT_BASE times LEVEL_MUL ** (level - 1) times the share
 *  above the pivot (1 at rate 1); below it, a PENALTY times the share under the pivot (the full PENALTY at rate 0) */
export function payout(rate: number, level: number): number {
  if (rate >= PAYOUT_PIVOT) return Math.round(PAYOUT_BASE * LEVEL_MUL ** (level - 1) * (rate - PAYOUT_PIVOT) / (1 - PAYOUT_PIVOT));
  return -Math.round(PENALTY * (PAYOUT_PIVOT - rate) / PAYOUT_PIVOT);
}

/** the cards of the draft (Phase 5 step 7): an unlock is offered once (never again once taken); an upgrade may be taken again */
export const CARDS = [
  { id: 'roundabout', name: 'Roundabout', desc: 'Unlocks the roundabout junction', kind: 'unlock' },
  { id: 'booths', name: '+2 toll booths', desc: 'Every toll gate gets two more booths, and new gates too', kind: 'upgrade' },
  { id: 'doubledecker', name: 'Double-decker buses', desc: 'Buses seat 100 instead of 60', kind: 'unlock' },
  { id: 'buses', name: '+4 buses', desc: 'Every bus route gets four more buses, and new routes too', kind: 'upgrade' },
  { id: 'express', name: 'Express entry', desc: 'Car park entrances let a car in every 1.4 s instead of 2', kind: 'unlock' },
  { id: 'promo', name: 'Promotion', desc: 'Every visit business draws 20% more customers', kind: 'upgrade' },
  { id: 'season', name: 'Season tickets', desc: 'The stadium ticket costs $3 more', kind: 'upgrade' },
] as const;
/** a card's id (see CARDS) */
export type CardId = (typeof CARDS)[number]['id'] | import('../golf/golfcards').GolfCardId;
/** the cards offered at each kick-off (fewer when the pool has fewer left) */
export const DRAFT = 3;
/** the demand multiplier each Promotion card gives every visit business (compounding) */
export const PROMO_MUL = 1.2;
/** the stadium's ticket rise each Season tickets card gives, $ */
export const TICKET_UP = 3;
/** the visit demand multiplier of the cards taken: PROMO_MUL to the number of promo cards */
export function promoMul(cards: readonly CardId[]): number { return PROMO_MUL ** cards.filter(c => c === 'promo').length; }
/** the stadium's ticket price of the cards taken, $: its price per visitor plus TICKET_UP for each season card */
export function ticketPrice(cards: readonly CardId[]): number { return BUSINESS.stadium.pricePerVisitor + TICKET_UP * cards.filter(c => c === 'season').length; }
/** the parking demand's cells (Sim.parkDemand, the Car park panel's overlay) are PD_CELL tiles square */
export const PD_CELL = 16;
