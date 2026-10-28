// The top bar's title, as the concept has it (T235, #690; docs/art/concept/maple-falls-concept.webp): the club's name over "Year 3 • October •
// Sunny 16°C". The name grows with the club (a driving range, then a golf club, then a golf and country club); the second line is the club's
// year, the month and the month's weather with a temperature for the season. Words only, from the game's own figures: the engine fills the facts
// (Engine.titleName), the UI draws them (ui/ClubTitle.tsx). Pure TS, no DOM.
import { mulberry } from '../iso';
import { MONTH_NAMES } from './calendar';
import { getTournamentWeather, weatherSeed, type WeatherCondition } from './weather';

/** the map's name: the club carries it ("Maple Falls Golf Club"), as the minimap's overview does; the town keeps its own name on the minimap */
export const MAP_NAME = 'Maple Falls';

/** the first tier at which the club is a golf and country club: tier 4, the Maple Falls Classic, is the first with hospitality, media and hotel
 *  rooms (golf/tour.ts OWN_NEEDS); tiers 1 to 3 (the Club Championship, the County Amateur, the State Open) are a golf club's tournaments */
export const COUNTRY_CLUB_TIER = 4;

/** what the club is: a driving range (a range start before its first hole), a golf club, a golf and country club */
export type ClubStage = 'range' | 'club' | 'country';

/** the club's stage: a range start with no hole is its driving range; from COUNTRY_CLUB_TIER the golf and country club; else a golf club */
export function clubStage(f: { range: boolean; holes: number; tier: number }): ClubStage {
  if (f.range && f.holes < 1) return 'range';
  return f.tier >= COUNTRY_CLUB_TIER ? 'country' : 'club';
}

/** the club's name: map + "Driving Range" | "Golf Club" | "Golf & Country Club"; short: the form for a narrow bar ("Maple Falls Range",
 *  "Maple Falls GC", "Maple Falls G&CC") */
export function clubName(stage: ClubStage, short = false, map: string = MAP_NAME): string {
  return `${map} ${stage === 'range' ? (short ? 'Range' : 'Driving Range') : stage === 'club' ? (short ? 'GC' : 'Golf Club') : short ? 'G&CC' : 'Golf & Country Club'}`;
}

/** the calendar months in full (0 = January) */
export const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

/** the weather as the title words it (the tournament chip says Clear and Heat; the concept's line says "Sunny"): one word a condition */
export const TITLE_WEATHER: Record<WeatherCondition, string> = { clear: 'Sunny', overcast: 'Overcast', rain: 'Rain', storm: 'Storm', heat: 'Hot' };

/** the usual afternoon high, °C, by calendar month (0 = January): a northern valley with maples (October's 16 is the concept's) */
export const MONTH_HIGH_C: readonly number[] = [-1, 1, 6, 13, 19, 24, 27, 26, 22, 16, 8, 2];
/** how far a weather moves the day from the month's usual high, °C */
export const WEATHER_SHIFT_C: Record<WeatherCondition, number> = { clear: 2, overcast: -2, rain: -4, storm: -3, heat: 8 };
/** the day's spread around that, °C: the draw is -2 to +2 */
export const TEMP_SPREAD_C = 2;
/** the limits a weather keeps whatever the month: a heat day is 31 or more, no other weather is above 30; rain is not below 1 (colder is
 *  snow), a storm not below 4 */
export const TEMP_LIMITS_C: Record<WeatherCondition, [number, number]> = {
  clear: [-30, 30], overcast: [-30, 30], rain: [1, 30], storm: [4, 30], heat: [31, 40],
};

/** the temperature, °C, of a month's weather: the month's usual high, moved by the weather and by a draw of up to TEMP_SPREAD_C either way
 *  that is seeded by the map, the run and the month (the same seed as the weather's, weatherSeed), kept within the weather's limits. The same
 *  date always reads the same */
export function monthTemperature(seed: number, run: number, month: number, condition: WeatherCondition): number {
  const m = Math.min(11, Math.max(0, Math.floor(month)));
  const draw = Math.round((mulberry((weatherSeed(seed, run, m) ^ 0x5bd1e995) >>> 0)() * 2 - 1) * TEMP_SPREAD_C);
  const [lo, hi] = TEMP_LIMITS_C[condition];
  return Math.min(hi, Math.max(lo, MONTH_HIGH_C[m]! + WEATHER_SHIFT_C[condition] + draw));
}

/** a temperature as the title says it: "16°C", with a true minus below zero ("−3°C") */
export const tempText = (c: number): string => `${c < 0 ? '−' : ''}${Math.abs(c)}°C`;

/** what the title needs: the map's seed, the seasons played (the club's year is the next one), the calendar month (0 = January), the tournament
 *  run whose weather it is (Engine.weatherRun: the tournament chip's), whether it is a range start, its holes (a tee and a pin), the tier, and
 *  the road a range stands on ('' or none: not said) */
export interface ClubTitleFacts { seed: number; seasons: number; month: number; run: number; range: boolean; holes: number; tier: number; road?: string }

/** the title as drawn: the stage, the name (full and short), the line's parts (when: "Year 3 • October", whenShort: "Year 3 • Oct"; weather:
 *  "Sunny 16°C"), the line in full, and the tooltip's full text */
export interface ClubTitle { stage: ClubStage; name: string; short: string; when: string; whenShort: string; weather: string; sub: string; tip: string }

/** the club's year: season n played is year n + 1 (year 1 is the first season, September to the tournament in August) */
export const clubYear = (seasons: number): number => Math.max(0, Math.floor(seasons)) + 1;

/** the title for the facts: "Maple Falls Golf Club" over "Year 3 • October • Sunny 16°C". The weather is the month's: the tournament's own
 *  (golf/weather.ts getTournamentWeather) for the month it falls in (August), so the title and the tournament chip say the same */
export function clubTitle(f: ClubTitleFacts): ClubTitle {
  const stage = clubStage(f), month = Math.min(11, Math.max(0, Math.floor(f.month))), w = getTournamentWeather(f.seed, f.run, 0, month).condition;
  const name = clubName(stage), year = `Year ${clubYear(f.seasons)}`, when = `${year} • ${FULL_MONTHS[month]}`, weather = `${TITLE_WEATHER[w]} ${tempText(monthTemperature(f.seed, f.run, month, w))}`;
  const sub = `${when} • ${weather}`;
  return { stage, name, short: clubName(stage, true), when, whenShort: `${year} • ${MONTH_NAMES[month]}`, weather, sub, tip: `${name}${f.road && stage === 'range' ? `, on ${f.road}` : ''} · ${sub}` };
}
