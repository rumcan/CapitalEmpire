// The business catalogue and its formulas (Phase B step 2, design in docs/BUSINESSES.md): the types the player can place, what each costs,
// earns and needs to unlock, and the pure formulas for demand, satisfaction, levels and the tree. The API follows Arena task T010's shape (so
// its numbers can drop in), with a kind in place of the schedule and per-type placement rules. 1985 dollars, scaled so the stadium's round
// stays the main income and a good spin-off pays for itself in about ten game days. Pure TS, no DOM.

/** a business type's id */
export type BusinessId = 'stadium' | 'sportsbar' | 'buscompany' | 'diner' | 'taxi' | 'golf' | 'estate' | 'fishing' | 'tackle' | 'casino' | 'hotel' | 'motel';
/** how a business earns: event (the stadium's rounds), visit (customers drive to its door during its hours), fleet (fares from its vehicles),
 *  estate (lots it sells as the town builds on them) */
export type BusinessKind = 'event' | 'visit' | 'fleet' | 'estate';
/** what opens a type: the parent business owned and (any given) its level, its good days, its revenue so far ($); parent null: open from the start */
export interface Unlock { parent: BusinessId | null; level?: number; goodDays?: number; revenue?: number }
/** a business type: its id, name, family, kind, footprint (tiles, before R turns it), build cost ($), upkeep ($ a game day), price per visitor ($: a
 *  ticket, a meal, a green fee, a room night, a fare; for estate the price of one lot), the party a visitor car carries, its opening hours (game
 *  hours, [open, close); visit only), the cars a day per 1000 residents at no trip time and level 1 (visit only), the driving time in real minutes (sim s / 60; the map is ~10 minutes across) over
 *  which that demand falls by e (visit only), how many the player may own, the nearest its centre may be to a town centre (tiles), whether it must
 *  stand by water (within WATER_REACH tiles of a water tile), its unlock, its spin-offs, and one line for the panel */
export interface BusinessType {
  id: BusinessId; name: string; family: 'sports' | 'leisure' | 'tourism' | 'transport' | 'property'; kind: BusinessKind;
  footprint: { w: number; h: number }; buildCost: number; upkeepPerDay: number; pricePerVisitor: number; party: number;
  hours: [number, number]; rate: number; tau: number; max: number; townMin: number; water: boolean;
  unlock: Unlock; spinOffs: BusinessId[]; blurb: string;
}

/** a water-side business's footprint must have a water tile within this many tiles of its edge */
export const WATER_REACH = 6;
/** the satisfaction a new business starts with (0..1) */
export const START_SAT = 0.8;
/** a day is good when its satisfaction is at least this and it had visitors */
export const GOOD_SAT = 0.75;
/** the lots a golf estate sells in all (its price is one lot; see City.closeVisits) */
export const ESTATE_LOTS = 24;
/** the satisfaction the golf course needs (at least this) for its estate to sell lots that day (0..1; see City.closeVisits) */
export const ESTATE_SAT = 0.6;
/** the XP each level needs (index = level - 1): level 1 at 0, level 5 at 7,000 satisfied visitor cars */
export const LEVEL_XP = [0, 400, 1200, 3000, 7000];

/** the catalogue. Numbers: the stadium's $200,000 is B.1's (the start fund grew by it); a 1985 NFL ticket averaged about $20 and MLB about $6, so
 *  the stadium's ticket is $12; a 1985 public green fee was about $15-30 ($22); an average US room night about $50 (the hotel $55, the motel $28);
 *  a 1985 bus fare about $0.75. B.7 tuning (the owner: a spin-off pays back its cost in about 10 game days, the rounds the main income): the bar
 *  $11, the bus company $30,000 with an $8 shuttle fare, the taxi company $10,000 and $50 a day (its fares in game time, see City TAXI_ECON). */
export const BUSINESSES: BusinessType[] = [
  { id: 'stadium', name: 'Stadium', family: 'sports', kind: 'event', footprint: { w: 100, h: 80 }, buildCost: 200000, upkeepPerDay: 1500, pricePerVisitor: 12, party: 3,
    hours: [18, 21], rate: 0, tau: 0, max: 1, townMin: 200, water: false, unlock: { parent: null }, spinOffs: ['sportsbar', 'buscompany', 'golf', 'fishing'],
    blurb: 'Runs the event rounds; the crowd drives to it from the towns, so the spot sets how hard the traffic is.' },
  { id: 'sportsbar', name: 'Sports bar', family: 'leisure', kind: 'visit', footprint: { w: 14, h: 10 }, buildCost: 30000, upkeepPerDay: 200, pricePerVisitor: 11, party: 2,
    hours: [16, 24], rate: 60, tau: 4, max: 3, townMin: 0, water: false, unlock: { parent: 'stadium', level: 2 }, spinOffs: ['diner'],
    blurb: 'Fans come in the evenings; close to the homes it fills up, far away it stays empty.' },
  { id: 'buscompany', name: 'Bus company', family: 'transport', kind: 'fleet', footprint: { w: 30, h: 20 }, buildCost: 30000, upkeepPerDay: 150, pricePerVisitor: 8, party: 1,
    hours: [0, 24], rate: 0, tau: 0, max: 1, townMin: 0, water: false, unlock: { parent: 'stadium', level: 2 }, spinOffs: ['taxi'],
    blurb: 'The depot of your shuttles: every fan who boards pays a fare; a round of 100 riders is a good day.' },
  { id: 'diner', name: 'Diner', family: 'leisure', kind: 'visit', footprint: { w: 12, h: 10 }, buildCost: 20000, upkeepPerDay: 120, pricePerVisitor: 6, party: 2,
    hours: [7, 22], rate: 80, tau: 3, max: 3, townMin: 0, water: false, unlock: { parent: 'sportsbar', goodDays: 2 }, spinOffs: [],
    blurb: 'Breakfast to supper; people only drive a few minutes for a meal.' },
  { id: 'taxi', name: 'Taxi company', family: 'transport', kind: 'fleet', footprint: { w: 16, h: 12 }, buildCost: 10000, upkeepPerDay: 50, pricePerVisitor: 0, party: 1,
    hours: [0, 24], rate: 0, tau: 0, max: 1, townMin: 0, water: false, unlock: { parent: 'buscompany', goodDays: 3 }, spinOffs: [],
    blurb: 'Six taxis wait at its door (and the stadium\'s) and carry the towns\' parties to your businesses and the other towns, on the roads it can reach.' },
  { id: 'golf', name: 'Golf course', family: 'leisure', kind: 'visit', footprint: { w: 150, h: 110 }, buildCost: 180000, upkeepPerDay: 900, pricePerVisitor: 22, party: 4,
    hours: [7, 19], rate: 25, tau: 6, max: 1, townMin: 150, water: false, unlock: { parent: 'stadium', level: 3 }, spinOffs: ['estate', 'casino'],
    blurb: 'Foursomes all day; golfers drive further than diners, but not past a jam.' },
  { id: 'estate', name: 'Golf estate', family: 'property', kind: 'estate', footprint: { w: 80, h: 60 }, buildCost: 50000, upkeepPerDay: 100, pricePerVisitor: 12000, party: 1,
    hours: [0, 24], rate: 0, tau: 0, max: 2, townMin: 0, water: false, unlock: { parent: 'golf', level: 2 }, spinOffs: [],
    blurb: 'Private lots by the course: they sell while the golf course is popular, more at its higher levels (24 an estate).' },
  { id: 'fishing', name: 'Bass-fishing resort', family: 'tourism', kind: 'visit', footprint: { w: 60, h: 40 }, buildCost: 90000, upkeepPerDay: 500, pricePerVisitor: 18, party: 3,
    hours: [5, 20], rate: 20, tau: 8, max: 1, townMin: 100, water: true, unlock: { parent: 'stadium', level: 3 }, spinOffs: ['tackle', 'motel'],
    blurb: 'Must stand by water; anglers leave at dawn and drive a long way for a good lake.' },
  { id: 'tackle', name: 'Fish-and-tackle shop', family: 'tourism', kind: 'visit', footprint: { w: 10, h: 8 }, buildCost: 15000, upkeepPerDay: 80, pricePerVisitor: 15, party: 1,
    hours: [5, 18], rate: 15, tau: 5, max: 2, townMin: 0, water: false, unlock: { parent: 'fishing', goodDays: 3 }, spinOffs: [],
    blurb: 'Bait and gear; best on the way from the towns to the resort.' },
  { id: 'casino', name: 'Casino', family: 'leisure', kind: 'visit', footprint: { w: 60, h: 40 }, buildCost: 300000, upkeepPerDay: 2000, pricePerVisitor: 45, party: 2,
    hours: [18, 24], rate: 40, tau: 8, max: 1, townMin: 150, water: false, unlock: { parent: 'golf', goodDays: 5 }, spinOffs: ['hotel'],
    blurb: 'The big evening draw: high spending, and a rush of cars after dark.' },
  { id: 'hotel', name: 'Hotel', family: 'tourism', kind: 'visit', footprint: { w: 30, h: 24 }, buildCost: 150000, upkeepPerDay: 800, pricePerVisitor: 55, party: 2,
    hours: [14, 23], rate: 6, tau: 10, max: 2, townMin: 0, water: false, unlock: { parent: 'casino', level: 2 }, spinOffs: [],
    blurb: 'Room nights for casino and stadium guests; tourists come in from the highway.' },
  { id: 'motel', name: 'Motel', family: 'tourism', kind: 'visit', footprint: { w: 30, h: 16 }, buildCost: 60000, upkeepPerDay: 300, pricePerVisitor: 28, party: 2,
    hours: [15, 24], rate: 8, tau: 10, max: 2, townMin: 0, water: false, unlock: { parent: 'fishing', level: 2 }, spinOffs: [],
    blurb: 'Cheap rooms for anglers and fans; tourists come in from the highway.' },
];
/** a type by id */
export const BUSINESS: Record<BusinessId, BusinessType> = Object.fromEntries(BUSINESSES.map(b => [b.id, b])) as Record<BusinessId, BusinessType>;

/** the level for xp (1..LEVEL_XP.length): the last level whose XP is reached */
export function levelFromXp(xp: number): number { let L = 1; for (let i = 1; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]!) L = i + 1; return L; }

/** a visit business's demand, cars a game day: the sum over its catchment (each town's residents and its driving time in real minutes, sim s / 60) of
 *  rate / 1000 * pop * exp(-tripMin / tau), times 1 + 0.25 per level above 1, times 0.5 + 0.5 * satisfaction (a satisfied business draws up to
 *  twice an unhappy one's crowd), times mul (the cards); 0 for any other kind. Falls with trip time (traffic decides it) */
export function dailyDemand(type: BusinessType, level: number, catchment: { pop: number; tripMin: number }[], satisfaction: number, mul = 1): number {
  if (type.kind !== 'visit' || !(type.tau > 0)) return 0;
  let d = 0;
  for (const c of catchment) d += type.rate / 1000 * Math.max(0, c.pop) * Math.exp(-Math.max(0, c.tripMin) / type.tau);
  return d * (1 + 0.25 * (level - 1)) * (0.5 + 0.5 * Math.min(1, Math.max(0, satisfaction))) * mul;
}

/** the satisfaction after a day: the day's score is (on time + half the late) / all (1 with no visitors: nothing went wrong), and satisfaction
 *  moves 30% of the way from prev toward it; clamped to 0..1 */
export function satisfactionAfter(prev: number, onTime: number, late: number, missed: number): number {
  const n = onTime + late + missed, score = n > 0 ? (onTime + 0.5 * late) / n : 1;
  return Math.min(1, Math.max(0, prev + 0.3 * (score - prev)));
}

/** a business the player owns, as the tree reads it: its type, level, good days and revenue so far ($) */
export interface Owned { id: BusinessId; level: number; goodDays: number; revenue: number }
/** whether unlock u is met by the owned businesses: its parent owned (any one of them) with each given condition met; no parent: always */
export function unlockMet(u: Unlock, owned: Owned[]): boolean {
  if (!u.parent) return true;
  return owned.some(o => o.id === u.parent && (u.level === undefined || o.level >= u.level) && (u.goodDays === undefined || o.goodDays >= u.goodDays)
    && (u.revenue === undefined || o.revenue >= u.revenue));
}
/** the types open to build: those whose unlock is met (in catalogue order) */
export function unlockedBy(owned: Owned[]): BusinessId[] { return BUSINESSES.filter(b => unlockMet(b.unlock, owned)).map(b => b.id); }
/** the unlock of a type as the panel says it, with the progress of the best owned parent: e.g. 'Stadium level 2 (now 1)', 'Sports bar: 2 good
 *  days (now 0)', 'Build a Golf course first'; '' for a root type */
export function unlockText(t: BusinessType, owned: Owned[]): string {
  const u = t.unlock; if (!u.parent) return '';
  const p = BUSINESS[u.parent], mine = owned.filter(o => o.id === u.parent);
  if (!mine.length) return `Build a ${p.name} first`;
  const best = (f: (o: Owned) => number) => Math.max(...mine.map(f));
  const parts: string[] = [];
  if (u.level !== undefined) parts.push(`level ${u.level} (now ${best(o => o.level)})`);
  if (u.goodDays !== undefined) parts.push(`${u.goodDays} good days (now ${best(o => o.goodDays)})`);
  if (u.revenue !== undefined) parts.push(`$${u.revenue.toLocaleString()} revenue (now $${Math.round(best(o => o.revenue)).toLocaleString()})`);
  return `${p.name}: ${parts.join(', ')}`;
}
