// Seeded tournament weather calendar and pure day effects (G8; docs/GOLF-PLAN.md sections 8.3, 10, 11 and 12). Pure TS, no DOM.
import { mulberry } from '../iso';
import { START_YEAR } from '../event/round';
import { STRUCTURE } from './tents';
import { ON_TIME_GRACE_MIN } from './tournamentday';
import type { PlacedEventStructure, PlacedStructureDay } from './eventtool';
import type { DayFacts } from './tour';

/** weather condition for a tournament day */
export type WeatherCondition = 'clear' | 'overcast' | 'rain' | 'storm' | 'heat';

/** all weather conditions in canonical order */
export const WEATHER_CONDITIONS: readonly WeatherCondition[] = ['clear', 'overcast', 'rain', 'storm', 'heat'] as const;

/** calendar month index (0 = Jan .. 11 = Dec) for the end-of-August tournament (MONTH_NAMES[7] === 'Aug') */
export const TOURNAMENT_MONTH = 7;

/** first-tee rain delay in minutes evaluated against ON_TIME_GRACE_MIN (45 min) */
export const RAIN_DELAY_MIN = 18;

/** share of expected spectators who stay home when a thunderstorm hits (25%) */
export const STORM_STAY_HOME_SHARE = 0.25;

/** factor shortening exit P95 window during a storm's early exit wave */
export const STORM_EXIT_P95_FACTOR = 0.75;

/** extra queue wait (minutes) added by a storm's concentrated early exit wave */
export const STORM_EXIT_QUEUE_SURGE_MIN = 4;

/** multiplier on drinks ('drink') and water/concession ('snack') takings during heat */
export const HEAT_DRINK_MULTIPLIER = 1.35;

/** fallback multiplier on aggregate tent takings during heat when per-structure breakdown is absent */
export const HEAT_TENT_FALLBACK_MULTIPLIER = 1.2;

/** satisfaction points lost during heat when no firstAid structure is placed on the course */
export const HEAT_SATISFACTION_PENALTY = 5;

/** full descriptor and effect parameters for a tournament day's weather */
export interface WeatherInfo {
  condition: WeatherCondition;
  label: string;
  icon: string;
  summary: string;
  description: string;
  rainDelayMin: number;
  stayHomeShare: number;
  exitP95Factor: number;
  exitQueueSurgeMin: number;
  drinkMultiplier: number;
  satisfactionPenalty: number;
}

/** static metadata and parameters for each weather condition */
export const WEATHER_INFO: Record<WeatherCondition, WeatherInfo> = {
  clear: {
    condition: 'clear',
    label: 'Clear',
    icon: '☀️',
    summary: 'Sunny and calm; no weather disruptions',
    description: 'Sunny and calm; no weather disruptions',
    rainDelayMin: 0,
    stayHomeShare: 0,
    exitP95Factor: 1,
    exitQueueSurgeMin: 0,
    drinkMultiplier: 1,
    satisfactionPenalty: 0,
  },
  overcast: {
    condition: 'overcast',
    label: 'Overcast',
    icon: '☁️',
    summary: 'Mild cloud cover; comfortable walking conditions',
    description: 'Mild cloud cover; comfortable walking conditions',
    rainDelayMin: 0,
    stayHomeShare: 0,
    exitP95Factor: 1,
    exitQueueSurgeMin: 0,
    drinkMultiplier: 1,
    satisfactionPenalty: 0,
  },
  rain: {
    condition: 'rain',
    label: 'Rain',
    icon: '🌧️',
    summary: 'Rain delays first tee; fewer on-time arrivals',
    description: 'Rain delays first tee; fewer on-time arrivals',
    rainDelayMin: RAIN_DELAY_MIN,
    stayHomeShare: 0,
    exitP95Factor: 1,
    exitQueueSurgeMin: 0,
    drinkMultiplier: 0.9,
    satisfactionPenalty: 0,
  },
  storm: {
    condition: 'storm',
    label: 'Storm',
    icon: '⛈️',
    summary: 'Thunderstorm cuts attendance 25% and triggers early exit wave',
    description: 'Thunderstorm cuts attendance 25% and triggers early exit wave',
    rainDelayMin: 0,
    stayHomeShare: STORM_STAY_HOME_SHARE,
    exitP95Factor: STORM_EXIT_P95_FACTOR,
    exitQueueSurgeMin: STORM_EXIT_QUEUE_SURGE_MIN,
    drinkMultiplier: 0.75,
    satisfactionPenalty: 0,
  },
  heat: {
    condition: 'heat',
    label: 'Heat',
    icon: '🌡️',
    summary: 'High heat boosts drinks & water (+35%); first aid prevents satisfaction drop',
    description: 'High heat boosts drinks & water (+35%); first aid prevents satisfaction drop',
    rainDelayMin: 0,
    stayHomeShare: 0,
    exitP95Factor: 1,
    exitQueueSurgeMin: 0,
    drinkMultiplier: HEAT_DRINK_MULTIPLIER,
    satisfactionPenalty: HEAT_SATISFACTION_PENALTY,
  },
};

/** relative probability weights by calendar month (0 = Jan .. 11 = Dec; August = 7 is mostly clear or heat, sometimes storm) */
export const MONTH_WEATHER_WEIGHTS: readonly Record<WeatherCondition, number>[] = [
  { clear: 25, overcast: 35, rain: 28, storm: 10, heat: 2 },  // Jan
  { clear: 28, overcast: 34, rain: 26, storm: 10, heat: 2 },  // Feb
  { clear: 32, overcast: 30, rain: 25, storm: 10, heat: 3 },  // Mar
  { clear: 38, overcast: 25, rain: 22, storm: 10, heat: 5 },  // Apr
  { clear: 42, overcast: 20, rain: 16, storm: 10, heat: 12 }, // May
  { clear: 44, overcast: 14, rain: 10, storm: 10, heat: 22 }, // Jun
  { clear: 45, overcast: 10, rain: 5, storm: 10, heat: 30 },  // Jul
  { clear: 45, overcast: 12, rain: 5, storm: 8, heat: 30 },   // Aug (tournament month)
  { clear: 42, overcast: 22, rain: 14, storm: 8, heat: 14 },  // Sep
  { clear: 36, overcast: 30, rain: 22, storm: 8, heat: 4 },   // Oct
  { clear: 28, overcast: 34, rain: 26, storm: 10, heat: 2 },  // Nov
  { clear: 25, overcast: 35, rain: 28, storm: 10, heat: 2 },  // Dec
];

/** normalized probability distribution (summing to 1) for a calendar month (0 = Jan .. 11 = Dec, clamped) */
export function weatherProbabilities(month = TOURNAMENT_MONTH): Record<WeatherCondition, number> {
  const m = Math.min(11, Math.max(0, Math.floor(month)));
  const w = MONTH_WEATHER_WEIGHTS[m]!;
  const total = w.clear + w.overcast + w.rain + w.storm + w.heat;
  return {
    clear: w.clear / total,
    overcast: w.overcast / total,
    rain: w.rain / total,
    storm: w.storm / total,
    heat: w.heat / total,
  };
}

/** normalize either a 1-based tournament run number (1, 2, ...) or a calendar year (1985, 1986, ...) to the calendar year */
export function canonicalTournamentYear(yearOrRun: number): number {
  const n = Math.floor(yearOrRun);
  return n >= START_YEAR ? n : START_YEAR + Math.max(0, n - 1);
}

/** deterministic 32-bit seed derived from the map seed, tournament year (or 1-based run), and month */
export function weatherSeed(seed: number, yearOrRun: number, month = TOURNAMENT_MONTH): number {
  const yr = canonicalTournamentYear(yearOrRun);
  const m = Math.min(11, Math.max(0, Math.floor(month)));
  return ((seed | 0) + Math.imul(yr, 0x9e3779b1) + Math.imul(m + 1, 0x85ebca6b)) >>> 0 || 1;
}

/** draw a single WeatherInfo from a [0, 1) uniform random sample for the given month */
export function pickWeatherFromSample(u: number, month = TOURNAMENT_MONTH): WeatherInfo {
  const probs = weatherProbabilities(month);
  const clamped = Math.min(0.999999, Math.max(0, u));
  let cum = 0;
  for (const cond of WEATHER_CONDITIONS) {
    cum += probs[cond];
    if (clamped < cum) return WEATHER_INFO[cond];
  }
  return WEATHER_INFO.clear;
}

/** generate the seeded multi-day weather calendar for a tournament of `days` days in `month` (default August = 7) */
export function weatherCalendar(seed: number, yearOrRun: number, days: number, month = TOURNAMENT_MONTH): WeatherInfo[] {
  const count = Math.max(1, Math.floor(days));
  const rng = mulberry(weatherSeed(seed, yearOrRun, month));
  const out: WeatherInfo[] = [];
  for (let d = 0; d < count; d++) {
    out.push(pickWeatherFromSample(rng(), month));
  }
  return out;
}

/** get the deterministic weather for a single tournament day (dayIndex 0-based) from game seed and run/year */
export function getTournamentWeather(seed: number, yearOrRun: number, dayIndex = 0, month = TOURNAMENT_MONTH): WeatherInfo {
  const idx = Math.max(0, Math.floor(dayIndex));
  const cal = weatherCalendar(seed, yearOrRun, idx + 1, month);
  return cal[idx]!;
}

/**
 * Apply pure weather effects to tournament DayFacts:
 * - rain delays the first tee, shifting on-time arrivals past the 45-minute grace period (ON_TIME_GRACE_MIN) into late
 * - storm cuts attendance by 25% (stayed-home spectators added to missed) and triggers an early, concentrated exit wave
 * - clear, overcast, and heat leave arrival/exit DayFacts unchanged
 */
export function applyWeatherToDayFacts(facts: DayFacts, condition: WeatherCondition): DayFacts {
  if (condition === 'rain') {
    const shiftShare = Math.min(1, Math.max(0, (RAIN_DELAY_MIN + facts.avgQueueMin * 0.5) / ON_TIME_GRACE_MIN));
    const shifted = Math.min(facts.onTime, Math.round(facts.onTime * shiftShare));
    return {
      ...facts,
      onTime: facts.onTime - shifted,
      late: facts.late + shifted,
    };
  }
  if (condition === 'storm') {
    const keepShare = 1 - STORM_STAY_HOME_SHARE;
    const totalArrived = facts.onTime + facts.late;
    const newOnTime = Math.round(facts.onTime * keepShare);
    const newLate = Math.round(facts.late * keepShare);
    const stayedHome = Math.max(0, totalArrived - (newOnTime + newLate));
    return {
      ...facts,
      onTime: newOnTime,
      late: newLate,
      missed: facts.missed + stayedHome,
      exitP95Min: Math.max(1, Math.round(facts.exitP95Min * STORM_EXIT_P95_FACTOR)),
      avgQueueMin: Math.round((facts.avgQueueMin + STORM_EXIT_QUEUE_SURGE_MIN) * 100) / 100,
    };
  }
  return { ...facts };
}

/** whether at least one first aid structure ('firstAid') is placed on the course */
export function hasFirstAidStructure(structures: readonly PlacedEventStructure[]): boolean {
  return structures.some(s => s.typeId === 'firstAid' || STRUCTURE[s.typeId]?.kind === 'firstaid');
}

/**
 * Apply weather modifier to day satisfaction (0..100):
 * - heat lowers satisfaction slightly (-5) unless a firstAid structure is placed
 * - clear has no effect
 */
export function applyWeatherToSatisfaction(baseSatisfaction: number, condition: WeatherCondition, firstAidPlaced = false): number {
  if (condition === 'heat' && !firstAidPlaced) {
    return Math.max(0, Math.min(100, Math.round(baseSatisfaction - HEAT_SATISFACTION_PENALTY)));
  }
  return Math.max(0, Math.min(100, Math.round(baseSatisfaction)));
}

/**
 * Apply weather modifier to tent takings ($):
 * - heat raises drinks ('drink') and water/concession ('snack') takings by +35% (or +20% on aggregate fallback)
 * - storm scales aggregate takings by 75% if not already evaluated at storm-reduced attendance
 * - clear has no effect
 */
export function applyWeatherToTentRevenue(
  baseRevenue: number,
  condition: WeatherCondition,
  byStructure?: readonly PlacedStructureDay[],
): number {
  if (condition === 'heat') {
    if (byStructure && byStructure.length > 0) {
      let extra = 0;
      for (const s of byStructure) {
        if (s.kind === 'drink' || s.kind === 'snack') {
          extra += s.day.revenue * (HEAT_DRINK_MULTIPLIER - 1);
        }
      }
      return Math.round(baseRevenue + extra);
    }
    return Math.round(baseRevenue * HEAT_TENT_FALLBACK_MULTIPLIER);
  }
  return Math.round(baseRevenue);
}
