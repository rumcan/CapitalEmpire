// The golf events' tents and event structures (GOLF-PLAN section 6): the catalogue the Event tool places (footprints, rent and buy, capacity,
// tier), the spend per spectator a day, the price cards, and the pure formulas for a tent's day (demand, queue, sales, satisfaction) and its
// catchment. 1985 dollars, first estimates. Pure TS, no DOM.

/** what a structure does: sells food, drink, snacks or merchandise; hosts guests; shows scores or a screen; films or serves the media; admits,
 *  serves or moves people */
export type StructureKind = 'food' | 'drink' | 'snack' | 'merch' | 'hospitality' | 'grandstand' | 'board' | 'tv' | 'media' | 'gate' | 'toilet' | 'firstaid' | 'info' | 'transport' | 'display' | 'helipad';
/** a structure type: id, name, kind, footprint (tiles of 2 m, before rotation), rent per tournament ($; 0 = cannot be rented), buy ($, permanent
 *  with monthly upkeep; 0 = cannot be bought), capacity in `unit` (per hour, seats, guests, lanes, cubicles, or '' for none), the tier it opens at,
 *  and a one-line blurb */
export interface StructureType { id: string; name: string; kind: StructureKind; footprint: { w: number; h: number }; rent: number; buy: number; capacity: number; unit: string; tier: number; blurb: string }

/** every structure type (GOLF-PLAN 6.1; the shuttle hub is today's bus route, not listed here) */
export const STRUCTURES: StructureType[] = [
  { id: 'foodTent', name: 'Food tent', kind: 'food', footprint: { w: 4, h: 4 }, rent: 2000, buy: 15000, capacity: 300, unit: 'per hour', tier: 1, blurb: 'burgers, BBQ and pizza' },
  { id: 'drinksTent', name: 'Drinks tent', kind: 'drink', footprint: { w: 5, h: 4 }, rent: 2000, buy: 15000, capacity: 400, unit: 'per hour', tier: 2, blurb: 'a beer garden; drinks peak in the afternoon' },
  { id: 'kiosk', name: 'Concession kiosk', kind: 'snack', footprint: { w: 2, h: 2 }, rent: 500, buy: 4000, capacity: 120, unit: 'per hour', tier: 1, blurb: 'snacks and water near the holes' },
  { id: 'foodTruck', name: 'Food truck', kind: 'food', footprint: { w: 3, h: 2 }, rent: 800, buy: 0, capacity: 150, unit: 'per hour', tier: 2, blurb: 'a vehicle that arrives by road' },
  { id: 'merchTent', name: 'Merchandise tent', kind: 'merch', footprint: { w: 6, h: 5 }, rent: 4000, buy: 40000, capacity: 200, unit: 'per hour', tier: 3, blurb: 'shoppers an hour; grows into a pavilion' },
  { id: 'merchPavilion', name: 'Merchandise pavilion', kind: 'merch', footprint: { w: 15, h: 10 }, rent: 20000, buy: 250000, capacity: 1200, unit: 'per hour', tier: 5, blurb: 'the biggest stream at the top, about 45% of the Masters revenue' },
  { id: 'chalet', name: 'Hospitality chalet', kind: 'hospitality', footprint: { w: 5, h: 5 }, rent: 6000, buy: 50000, capacity: 60, unit: 'guests', tier: 4, blurb: 'sold to sponsors in advance; needs VIP parking' },
  { id: 'village', name: 'Corporate hospitality village', kind: 'hospitality', footprint: { w: 20, h: 12 }, rent: 40000, buy: 0, capacity: 500, unit: 'guests', tier: 5, blurb: 'the big sponsor packages' },
  { id: 'standS', name: 'Grandstand S', kind: 'grandstand', footprint: { w: 8, h: 4 }, rent: 3000, buy: 0, capacity: 200, unit: 'seats', tier: 2, blurb: 'viewing satisfaction; seat tickets from tier 4' },
  { id: 'standM', name: 'Grandstand M', kind: 'grandstand', footprint: { w: 20, h: 6 }, rent: 12000, buy: 0, capacity: 1000, unit: 'seats', tier: 3, blurb: 'viewing satisfaction; seat tickets from tier 4' },
  { id: 'standL', name: 'Grandstand L', kind: 'grandstand', footprint: { w: 40, h: 10 }, rent: 40000, buy: 0, capacity: 4000, unit: 'seats', tier: 4, blurb: 'a horseshoe for the big finish; seat tickets' },
  { id: 'leaderboard', name: 'Main leaderboard', kind: 'board', footprint: { w: 4, h: 2 }, rent: 3000, buy: 25000, capacity: 0, unit: '', tier: 3, blurb: 'viewing satisfaction around it' },
  { id: 'holeBoard', name: 'Hole scoreboard', kind: 'board', footprint: { w: 1, h: 1 }, rent: 300, buy: 2000, capacity: 0, unit: '', tier: 3, blurb: 'a small viewing bonus at a hole' },
  { id: 'screen', name: 'Video screen', kind: 'display', footprint: { w: 3, h: 1 }, rent: 8000, buy: 0, capacity: 0, unit: '', tier: 5, blurb: 'a big viewing bonus' },
  { id: 'tvTower', name: 'TV camera tower', kind: 'tv', footprint: { w: 1, h: 1 }, rent: 1500, buy: 10000, capacity: 0, unit: '', tier: 4, blurb: 'TV coverage of the holes it sees' },
  { id: 'broadcast', name: 'Broadcast compound', kind: 'tv', footprint: { w: 15, h: 10 }, rent: 10000, buy: 0, capacity: 0, unit: '', tier: 4, blurb: 'trucks; needed for TV income' },
  { id: 'media', name: 'Media centre', kind: 'media', footprint: { w: 12, h: 8 }, rent: 8000, buy: 80000, capacity: 0, unit: '', tier: 4, blurb: 'the media satisfaction' },
  { id: 'gate', name: 'Entrance gate', kind: 'gate', footprint: { w: 6, h: 3 }, rent: 2000, buy: 20000, capacity: 4, unit: 'lanes', tier: 2, blurb: 'admission at 600 an hour a lane; ticket income is counted here' },
  { id: 'toilets', name: 'Toilet block', kind: 'toilet', footprint: { w: 4, h: 1 }, rent: 400, buy: 6000, capacity: 12, unit: 'cubicles', tier: 2, blurb: 'a spectator need' },
  { id: 'firstAid', name: 'First aid tent', kind: 'firstaid', footprint: { w: 3, h: 3 }, rent: 500, buy: 0, capacity: 0, unit: '', tier: 3, blurb: 'a spectator need' },
  { id: 'info', name: 'Info and will-call booth', kind: 'info', footprint: { w: 2, h: 2 }, rent: 300, buy: 3000, capacity: 0, unit: '', tier: 2, blurb: 'a small satisfaction bonus by the gates' },
  { id: 'rideshare', name: 'Ride-share drop-off zone', kind: 'transport', footprint: { w: 4, h: 8 }, rent: 2000, buy: 10000, capacity: 0, unit: '', tier: 3, blurb: 'taxi and ride-share arrivals; road-side (footprint is a nominal lay-by)' },
  { id: 'coach', name: 'Coach terminal', kind: 'transport', footprint: { w: 20, h: 10 }, rent: 10000, buy: 120000, capacity: 20, unit: 'lanes', tier: 4, blurb: 'coach arrivals in 20 bays; tier 5 needs one' },
  { id: 'rangeStand', name: 'Practice range grandstand', kind: 'grandstand', footprint: { w: 12, h: 4 }, rent: 5000, buy: 30000, capacity: 600, unit: 'seats', tier: 4, blurb: 'viewing; the players practice here' },
  { id: 'sponsorDisplay', name: 'Sponsor display', kind: 'display', footprint: { w: 3, h: 3 }, rent: 0, buy: 0, capacity: 0, unit: '', tier: 3, blurb: 'a car on a plinth and banners; earns a sponsor bonus' },
  { id: 'helipad', name: 'Helipad', kind: 'helipad', footprint: { w: 10, h: 10 }, rent: 0, buy: 60000, capacity: 0, unit: '', tier: 5, blurb: 'VIP satisfaction (tier 5 hospitality)' },
];

/** every structure type by id */
export const STRUCTURE: Record<string, StructureType> = Object.fromEntries(STRUCTURES.map(s => [s.id, s]));

/** the $ a spectator-day a selling kind earns at tier 1 and tier 5 (linear between); kinds not listed earn 0 */
const SPEND: Partial<Record<StructureKind, [number, number]>> = { food: [4, 9], drink: [3, 8], merch: [1, 25], snack: [1, 3] };

/** $ a spectator spends a day at a kind at a tier (1..5, clamped): linear from tier 1 to tier 5; 0 for kinds that do not sell */
export function spendPerSpectator(kind: StructureKind, tier: number): number {
  const s = SPEND[kind]; if (!s) return 0;
  const t = Math.min(5, Math.max(1, tier));
  return s[0] + (s[1] - s[0]) * (t - 1) / 4;
}

/** purchases a spectator makes a day at a selling kind, before the price card (the spend per purchase is spend / PER_DAY) */
export const PER_DAY: Partial<Record<StructureKind, number>> = { food: 1, drink: 1.5, snack: 1, merch: 0.25 };

/** a price card's terms: price multiplies the $ per sale, demand multiplies the sales, satisfaction is added to the tent's satisfaction */
export interface PriceTerms { price: number; demand: number; satisfaction: number }
/** the price cards: cheap sells more at less; premium earns more per sale from fewer sales, at a small satisfaction cost */
export const PRICE: Record<'cheap' | 'normal' | 'premium', PriceTerms> = {
  cheap: { price: 0.8, demand: 1.15, satisfaction: 0 },
  normal: { price: 1, demand: 1, satisfaction: 0 },
  premium: { price: 1.3, demand: 0.8, satisfaction: -0.05 },
};

/** the share of a spectator's spend a tent gets at a walking distance (m): 1 up to 100 m, linear to 0 at 400 m */
export function catchmentWeight(distM: number): number { return distM <= 100 ? 1 : distM >= 400 ? 0 : 1 - (distM - 100) / 300; }

/** one tent's day: its demand (purchases wanted), served and lost purchases, revenue ($), average queue (minutes) and satisfaction (0..1) */
export interface TentDay { demand: number; served: number; lost: number; revenue: number; avgQueueMin: number; satisfaction: number }

/** a tent's day: demand from the spectators it reaches, capped by its capacity (per hour x hours open); the queue from the utilisation, and the
 *  satisfaction from the queue (1 at 5 minutes or less, 0 at 30 or more) plus the price card's term */
export function tentDay(o: { kind: StructureKind; tier: number; capacityPerHour: number; hoursOpen: number; spectators: number; price: PriceTerms }): TentDay {
  const perDay = PER_DAY[o.kind] ?? 0;
  const demand = o.spectators * perDay * o.price.demand;
  const capacity = Math.max(0, o.capacityPerHour * o.hoursOpen);
  const served = Math.min(demand, capacity);
  const lost = demand - served;
  const revenue = perDay > 0 ? Math.round(served * (spendPerSpectator(o.kind, o.tier) / perDay) * o.price.price) : 0;
  const u = capacity > 0 ? demand / capacity : Infinity;
  const avgQueueMin = capacity <= 0 ? 60 : u < 0.7 ? 1 : u < 1 ? 1 + (u - 0.7) / 0.3 * 9 : Math.min(60, 10 + (u - 1) * 50);
  const base = Math.min(1, Math.max(0, (30 - avgQueueMin) / 25));
  const satisfaction = Math.min(1, Math.max(0, base + o.price.satisfaction));
  return { demand, served, lost, revenue, avgQueueMin, satisfaction };
}
