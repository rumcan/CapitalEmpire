// Golf tournament draft cards and pure effect functions (G5; docs/GOLF-PLAN.md section 8.3). Pure TS, no DOM.
import { DRAFT, SURGE_SEED } from '../event/config';
import { mulberry } from '../iso';
import type { Pt } from '../network';
import { arrivalShare } from './calendar';
import { growInMonths, growInShare, type PlantKind } from './costs';
import type { PlacedEventStructure } from './eventtool';
import {
  MIN_PARK_RIDE_DIST_TILES,
  distFromClubhouse,
  parkRideNeeds,
  type ParkRideBusInput,
  type ParkRideLotInput,
} from './parkride';
import type { DayFacts, Need } from './tour';
import type { GolfSurface } from './types';
import { hasFirstAidStructure, type WeatherCondition } from './weather';

/** category of a golf draft card (GOLF-PLAN 8.3: road, transport, venue, course) */
export type GolfCardCategory = 'road' | 'transport' | 'venue' | 'course';

/** course quality bonus points per Course consultant card */
export const COURSE_CONSULTANT_BONUS = 5;

/** sponsor income multiplier per Sponsor deal card (+15%) */
export const SPONSOR_DEAL_MUL = 1.15;

/** rent and upkeep multiplier per Volunteer corps card (-20%) */
export const VOLUNTEER_CORPS_MUL = 0.8;

/** weather penalty and stay-home multiplier with Rain insurance (halved) */
export const RAIN_INSURANCE_FACTOR = 0.5;

/** ticket price multiplier with Early-bird tickets (+10%) */
export const EARLY_BIRD_TICKET_MUL = 1.1;

/** minutes earlier that first-day arrivals shift with Early-bird tickets */
export const EARLY_BIRD_SHIFT_MIN = 20;

/** reputation gain bonus per Media partner card (+3) */
export const MEDIA_PARTNER_REP_BONUS = 3;

/** seeded turf grow-in reduction in months per Greenkeeper card (-1 month) */
export const GREENKEEPER_MONTHS_REDUCTION = 1;

/** golf mode card pool (12 cards across road, transport, venue, and course) */
export const GOLF_CARDS = [
  {
    id: 'expressGates',
    name: 'Express gates',
    desc: 'Entrance gate lanes admit 50% more spectators per hour',
    kind: 'unlock',
    category: 'venue',
  },
  {
    id: 'courseConsultant',
    name: 'Course consultant',
    desc: 'Course quality +5 for the club (raises green fees and memberships)',
    kind: 'upgrade',
    category: 'course',
  },
  {
    id: 'sponsorDeal',
    name: 'Sponsor deal',
    desc: 'Tournament sponsor income +15%',
    kind: 'upgrade',
    category: 'venue',
  },
  {
    id: 'shuttleFleet',
    name: 'Shuttle fleet',
    desc: 'Remote car parks (80+ tiles) count as served park-and-ride lots',
    kind: 'unlock',
    category: 'transport',
  },
  {
    id: 'volunteerCorps',
    name: 'Volunteer corps',
    desc: 'Structure rent and annual tent upkeep −20%',
    kind: 'upgrade',
    category: 'venue',
  },
  {
    id: 'rainInsurance',
    name: 'Rain insurance',
    desc: 'Weather satisfaction penalty, rain delay and storm stay-home halved',
    kind: 'unlock',
    category: 'venue',
  },
  {
    id: 'firstAidPosts',
    name: 'First-aid posts',
    desc: 'Heat satisfaction penalty removed across the course',
    kind: 'unlock',
    category: 'venue',
  },
  {
    id: 'earlyBirdTickets',
    name: 'Early-bird tickets',
    desc: 'Ticket income +10%, with earlier first-day spectator arrivals',
    kind: 'unlock',
    category: 'venue',
  },
  {
    id: 'mediaPartner',
    name: 'Media partner',
    desc: 'Tournament reputation gain +3',
    kind: 'upgrade',
    category: 'venue',
  },
  {
    id: 'greenkeeper',
    name: 'Greenkeeper',
    desc: 'Seeded turf grow-in time −1 month',
    kind: 'upgrade',
    category: 'course',
  },
  {
    id: 'roundabout',
    name: 'Roundabout',
    desc: 'Unlocks the roundabout junction on venue approach roads',
    kind: 'unlock',
    category: 'road',
  },
  {
    id: 'express',
    name: 'Express entry',
    desc: 'Car park entrances let a car in every 1.4 s instead of 2 s',
    kind: 'unlock',
    category: 'road',
  },
] as const;

/** union of golf card ids */
export type GolfCardId = (typeof GOLF_CARDS)[number]['id'];

/** descriptor of a golf card */
export type GolfCardDef = (typeof GOLF_CARDS)[number];

const GOLF_CARD_SET = new Set<string>(GOLF_CARDS.map(c => c.id));

/** whether a string is a valid GolfCardId */
export function isGolfCardId(id: string): id is GolfCardId {
  return GOLF_CARD_SET.has(id);
}

/** look up a golf card definition by id (undefined if not in GOLF_CARDS) */
export function findGolfCard(id: string): GolfCardDef | undefined {
  return GOLF_CARDS.find(c => c.id === id);
}

/** count how many times a golf card id appears in the taken cards list */
export function countGolfCard(cards: readonly string[] | undefined, id: GolfCardId): number {
  if (!cards || cards.length === 0) return 0;
  let n = 0;
  for (const c of cards) if (c === id) n++;
  return n;
}

/** whether a golf card id has been taken at least once */
export function hasGolfCard(cards: readonly string[] | undefined, id: GolfCardId): boolean {
  return countGolfCard(cards, id) > 0;
}

/** deterministic golf card draft: up to DRAFT distinct cards from GOLF_CARDS (unlocks once, upgrades repeatable) */
export function golfDraftFor(xp: number, runs: number, taken: readonly string[] = [], count = DRAFT): GolfCardId[] | null {
  const pool: GolfCardId[] = GOLF_CARDS.filter(c => c.kind === 'upgrade' || !taken.includes(c.id)).map(c => c.id);
  const rnd = mulberry(SURGE_SEED + 1000 * xp + runs);
  const out: GolfCardId[] = [];
  while (out.length < count && pool.length > 0) {
    out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]!);
  }
  return out.length > 0 ? out : null;
}

/** 1. Express gates: whether entrance gate lanes run at EXPRESS_GATES (1.5x) rate */
export function hasExpressGates(cards: readonly string[] | undefined): boolean {
  return hasGolfCard(cards, 'expressGates');
}

/** 2. Course consultant: +5 course quality per card, clamped to 0..100 */
export function applyCourseConsultantQuality(baseQuality: number, cards: readonly string[] | undefined): number {
  const bonus = COURSE_CONSULTANT_BONUS * countGolfCard(cards, 'courseConsultant');
  return Math.min(100, Math.max(0, Math.round(baseQuality + bonus)));
}

/** 3. Sponsor deal: +15% sponsor income per card */
export function applySponsorDealIncome(baseSponsorIncome: number, cards: readonly string[] | undefined): number {
  const count = countGolfCard(cards, 'sponsorDeal');
  if (count <= 0 || baseSponsorIncome <= 0) return Math.round(baseSponsorIncome);
  return Math.round(baseSponsorIncome * SPONSOR_DEAL_MUL ** count);
}

/** 4. Shuttle fleet: remote car parks (>= 80 tiles from clubhouse) count as served park-and-ride lots */
export function parkRideNeedsWithCards(
  clubhouse: Pt | null | undefined,
  parkDefs: readonly ParkRideLotInput[],
  busDefs: readonly ParkRideBusInput[],
  cards: readonly string[] | undefined,
  minDistTiles = MIN_PARK_RIDE_DIST_TILES,
): Need[] {
  if (!hasGolfCard(cards, 'shuttleFleet')) {
    return parkRideNeeds(clubhouse, parkDefs, busDefs, minDistTiles);
  }
  if (!clubhouse) return [];
  const seenIds = new Set<number>();
  let count = 0;
  for (const p of parkDefs) {
    if (seenIds.has(p.id)) continue;
    if (distFromClubhouse(clubhouse, p) >= minDistTiles) {
      seenIds.add(p.id);
      count++;
    }
  }
  const needs: Need[] = [];
  if (count >= 1) needs.push('parkRide');
  if (count >= 2) needs.push('parkRide2');
  return needs;
}

/** 5. Volunteer corps: -20% structure rent and annual tent upkeep per card */
export function applyVolunteerCorpsCost(baseCost: number, cards: readonly string[] | undefined): number {
  const count = countGolfCard(cards, 'volunteerCorps');
  if (count <= 0 || baseCost <= 0) return Math.round(baseCost);
  return Math.round(baseCost * VOLUNTEER_CORPS_MUL ** count);
}

/** 6a. Rain insurance: halves rain late-shift and storm stay-home attendance loss & queue surge */
export function applyRainInsuranceToDayFacts(
  rawFacts: DayFacts,
  weatherFacts: DayFacts,
  condition: WeatherCondition,
  cards: readonly string[] | undefined,
): DayFacts {
  if (!hasGolfCard(cards, 'rainInsurance')) return weatherFacts;
  if (condition === 'rain') {
    const shifted = Math.max(0, rawFacts.onTime - weatherFacts.onTime);
    const keepShift = Math.round(shifted * RAIN_INSURANCE_FACTOR);
    return {
      ...weatherFacts,
      onTime: rawFacts.onTime - keepShift,
      late: rawFacts.late + keepShift,
    };
  }
  if (condition === 'storm') {
    const rawArrived = rawFacts.onTime + rawFacts.late;
    const weatherArrived = weatherFacts.onTime + weatherFacts.late;
    const stayedHome = Math.max(0, rawArrived - weatherArrived);
    const halvedStayedHome = Math.round(stayedHome * RAIN_INSURANCE_FACTOR);
    const restored = stayedHome - halvedStayedHome;
    const onTimeShare = rawArrived > 0 ? rawFacts.onTime / rawArrived : 1;
    const addOnTime = Math.round(restored * onTimeShare);
    const addLate = restored - addOnTime;
    return {
      ...weatherFacts,
      onTime: weatherFacts.onTime + addOnTime,
      late: weatherFacts.late + addLate,
      missed: Math.max(0, rawFacts.missed + halvedStayedHome),
      avgQueueMin: Math.round(((rawFacts.avgQueueMin + weatherFacts.avgQueueMin) * 0.5) * 100) / 100,
    };
  }
  return weatherFacts;
}

/** 6b. Rain insurance: halves any weather-induced satisfaction drop */
export function applyRainInsuranceToSatisfaction(
  baseSatisfaction: number,
  weatherSatisfaction: number,
  cards: readonly string[] | undefined,
): number {
  if (!hasGolfCard(cards, 'rainInsurance')) return weatherSatisfaction;
  const drop = Math.max(0, baseSatisfaction - weatherSatisfaction);
  if (drop <= 0) return weatherSatisfaction;
  return Math.min(100, Math.max(0, Math.round(baseSatisfaction - drop * RAIN_INSURANCE_FACTOR)));
}

/** 7. First-aid posts: counts as first-aid coverage so heat penalty is removed */
export function hasFirstAidCoverage(
  structures: readonly PlacedEventStructure[],
  cards: readonly string[] | undefined,
): boolean {
  return hasFirstAidStructure(structures) || hasGolfCard(cards, 'firstAidPosts');
}

/** 8a. Early-bird tickets: +10% ticket price/income */
export function applyEarlyBirdTicketPrice(baseTicketPrice: number, cards: readonly string[] | undefined): number {
  if (!hasGolfCard(cards, 'earlyBirdTickets') || baseTicketPrice <= 0) return baseTicketPrice;
  return Math.round(baseTicketPrice * EARLY_BIRD_TICKET_MUL * 100) / 100;
}

/** 8b. Early-bird tickets: shifts cumulative arrival curve earlier by EARLY_BIRD_SHIFT_MIN (20 min) */
export function earlyBirdArrivalShare(t: number, cards: readonly string[] | undefined): number {
  const shift = hasGolfCard(cards, 'earlyBirdTickets') ? EARLY_BIRD_SHIFT_MIN : 0;
  return arrivalShare(t + shift);
}

/** 9. Media partner: +3 reputation gain per card, clamped to 0..100 */
export function applyMediaPartnerReputation(repAfter: number, cards: readonly string[] | undefined): number {
  const bonus = MEDIA_PARTNER_REP_BONUS * countGolfCard(cards, 'mediaPartner');
  return Math.min(100, Math.max(0, Math.round(repAfter + bonus)));
}

/** 10a. Greenkeeper: reduces seeded turf grow-in duration by 1 month per card (minimum 0) */
export function effectiveGrowInMonths(
  surface: GolfSurface,
  kind: PlantKind = 'seed',
  cards: readonly string[] | undefined = [],
): number {
  const base = growInMonths(surface, kind);
  if (base <= 0) return 0;
  const reduction = GREENKEEPER_MONTHS_REDUCTION * countGolfCard(cards, 'greenkeeper');
  return Math.max(0, base - reduction);
}

/** 10b. Greenkeeper: grow-in maturity in 0..1 with Greenkeeper card reduction applied */
export function growInShareWithCards(
  surface: GolfSurface,
  kind: PlantKind,
  elapsedMonths: number,
  cards: readonly string[] | undefined = [],
): number {
  const m = effectiveGrowInMonths(surface, kind, cards);
  if (m <= 0) return 1;
  return growInShare(surface, kind, elapsedMonths + (growInMonths(surface, kind) - m));
}

/** 10c. Greenkeeper: advances effective grow-in clock by 1 month per Greenkeeper card */
export function effectiveGrowInClockMonth(currentMonth: number, cards: readonly string[] | undefined): number {
  const bonus = GREENKEEPER_MONTHS_REDUCTION * countGolfCard(cards, 'greenkeeper');
  return currentMonth + bonus;
}
