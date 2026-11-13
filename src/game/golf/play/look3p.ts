// T437 (docs/CINDERLINKS-PORT.md, one look): the view from behind the golfer dressed as the manager game is. One list of the biomes and course types the
// view knows, with the names both views show (the view's own lists, packages/cinderlinks parts 05-ground and 07-play, must match: the test reads them),
// and the rules section 2 of the plan gives:
// - the biome from the map's setting: Maple Falls is a northern valley with maples (clubtitle.ts MONTH_HIGH_C): parkland, under snow in a month whose
//   usual high is at or below freezing;
// - the course type from how the course is kept: a tournament day (the tour's set-up) plays as Tour; a course in good condition (the crew's work, staff.ts
//   courseCondition) as Private; a neglected one as Public. (The game has no superintendent cards yet: when it does, they feed the condition.)
// - T447: both now from what the course looks like (biomeFor3p, courseTypeFor3p below: the Desert theme, a real course's latitude, its sand, water and trees,
//   the club's members and tour tier); biomeOf and courseTypeOf stay as the month-only and condition-only reads.
// - the golfer's look from the player card: the clothes of the golfer art the player chose (library.ts GOLFER_PEOPLE), as the view's golfer wears them.
// Pure TS, no DOM.
import { MONTH_HIGH_C } from '../clubtitle';
import type { CourseType, Dress } from './protocol3p';
import type { Sex } from './types';

/** the biomes the view grows, in its order, with their names */
export const BIOMES_3P = [['parkland', 'Parkland'], ['coastal', 'Coastal'], ['beachside', 'Beachside'], ['desert', 'Desert'], ['savanna', 'Savanna'], ['jungle', 'Jungle'], ['snow', 'Snow']] as const;
export type Biome3p = typeof BIOMES_3P[number][0];
/** the course types the view keeps, in its order, with their names (T447: the game sends links too, for a treeless sandy course by the sea) */
export const COURSE_TYPES_3P = [['links', 'Links'], ['tour', 'Tour'], ['private', 'Private'], ['public', 'Public']] as const;
export const biomeName = (b: string): string => BIOMES_3P.find(x => x[0] === b)?.[1] ?? b;
export const courseTypeName = (t: string): string => COURSE_TYPES_3P.find(x => x[0] === t)?.[1] ?? t;

/** the condition (staff.ts courseCondition, 0..100) at and above which a course plays as Private */
export const KEPT_CONDITION = 80;
/** the usual high (°C) at or below which the map lies under snow */
export const SNOW_HIGH_C = 2;

/** the biome for calendar month `month` (0 January) on the map */
export function biomeOf(month: number): Biome3p {
  const hi = MONTH_HIGH_C[((Math.floor(month) % 12) + 12) % 12] ?? 15;
  return hi <= SNOW_HIGH_C ? 'snow' : 'parkland';
}
/** the course type for how the course is kept: a tournament day plays as Tour, a course in good condition as Private, a neglected one as Public */
export function courseTypeOf(f: { condition: number; tournament: boolean }): CourseType {
  if (f.tournament) return 'tour';
  return f.condition >= KEPT_CONDITION ? 'private' : 'public';
}

// ------------------------------------------------------------------------------------------------------------------------ T447: the style from the course
// The owner (2026-11-13): "these settings need to be applied based on what your Capital Empire course looks like". In host mode the view takes its biome and
// course type from here and offers no choice of them. Each is one table of rules, read top down: the first that holds wins.

/** the ground of the course as the course file shows it (export3p.ts groundOf3p): the painted area, the shares of it that are sand and water, whether a big
 *  water reaches the edge of the course (the sea, a lake shore), and the planted trees a hectare */
export interface Ground3p { paintedM2: number; sand: number; water: number; coast: boolean; treesPerHa: number }
/** what the biome is read from: the gear menu's Desert theme, the calendar month (the home map's climate), a real course's latitude (absent: the home map, Maple
 *  Falls, or a downloaded course whose place the save does not keep), and the ground */
export interface BiomeFacts3p { desert: boolean; month: number; lat?: number | null; ground: Ground3p }
/** what the course type is read from: a tournament or club event today, the crew's condition (0..100), the tour tier the club hosts (1..5), the club's members,
 *  the biome and the ground */
export interface TypeFacts3p { tournament: boolean; condition: number; tier: number; members: number; biome: Biome3p; ground: Ground3p }

/** sand (bunkers, waste) at or above this share of the painted course makes a desert course; this much by the sea a beachside one */
export const DESERT_SAND = 0.15, BEACH_SAND = 0.06;
/** a links course: by the sea, at most this many planted trees a hectare, and at least this share of sand */
export const LINKS_TREES_PER_HA = 1, LINKS_SAND = 0.03;
/** the tour tier (golf/tour.ts TIERS) from which the club is a tour venue: the Maple Falls Classic and the Open */
export const TOUR_TIER = 4;
/** latitude bands, degrees from the equator: snow at or beyond SNOW_LAT, jungle within JUNGLE_LAT, savanna within SAVANNA_LAT */
export const SNOW_LAT = 60, JUNGLE_LAT = 12, SAVANNA_LAT = 30;
/** the shipped real courses' latitudes (osm/index.ts OSM_COURSES ids): the save keeps a course's place as words only */
export const SHIPPED_LAT: Readonly<Record<string, number>> = { rondebosch: -33.97, 'magnolia-national': 33.5, woodhill: -25.8 };

const monthHigh = (m: number) => MONTH_HIGH_C[((Math.floor(m) % 12) + 12) % 12] ?? 15;
const near = (lat: number | null | undefined, lo: number, hi: number) => lat != null && Number.isFinite(lat) && Math.abs(lat) >= lo && Math.abs(lat) < hi;
/** the biome rules, top down */
export const BIOME_RULES: readonly { biome: Biome3p; why: string; when: (f: BiomeFacts3p) => boolean }[] = [
  { biome: 'desert', why: 'the Desert theme is on', when: f => f.desert },
  { biome: 'snow', why: 'far north or south', when: f => near(f.lat, SNOW_LAT, 91) },
  { biome: 'snow', why: 'a month under snow on the home map', when: f => f.lat == null && monthHigh(f.month) <= SNOW_HIGH_C },
  { biome: 'desert', why: 'a course of sand', when: f => f.ground.sand >= DESERT_SAND },
  { biome: 'beachside', why: 'by the sea, sandy', when: f => f.ground.coast && f.ground.sand >= BEACH_SAND },
  { biome: 'coastal', why: 'by the sea', when: f => f.ground.coast },
  { biome: 'jungle', why: 'in the tropics', when: f => near(f.lat, 0, JUNGLE_LAT) },
  { biome: 'savanna', why: 'in the warm dry belt', when: f => near(f.lat, JUNGLE_LAT, SAVANNA_LAT) },
  { biome: 'parkland', why: 'the rest', when: () => true },
];
/** the course type rules, top down */
export const TYPE_RULES: readonly { type: CourseType; why: string; when: (f: TypeFacts3p) => boolean }[] = [
  { type: 'tour', why: 'a tournament today', when: f => f.tournament },
  { type: 'links', why: 'by the sea, treeless and sandy', when: f => (f.biome === 'coastal' || f.biome === 'beachside') && f.ground.treesPerHa <= LINKS_TREES_PER_HA && f.ground.sand >= LINKS_SAND },
  { type: 'tour', why: 'a tour venue, well kept', when: f => f.tier >= TOUR_TIER && f.condition >= KEPT_CONDITION },
  { type: 'private', why: "a members' club, well kept", when: f => f.members >= 1 && f.condition >= KEPT_CONDITION },
  { type: 'public', why: 'the rest', when: () => true },
];
/** the biome of the course (BIOME_RULES) */
export const biomeFor3p = (f: BiomeFacts3p): Biome3p => BIOME_RULES.find(r => r.when(f))!.biome;
/** the course type of the course (TYPE_RULES) */
export const courseTypeFor3p = (f: TypeFacts3p): CourseType => TYPE_RULES.find(r => r.when(f))!.type;

/** the clothes of each golfer art (library.ts GOLFER_PEOPLE ids), sampled from its preview (art/golfers/<id>/preview.png): the shirt and the trousers */
export const ART_DRESS: Readonly<Record<string, { shirt: string; trousers: string }>> = {
  'golfer:golf_am_m1': { shirt: '#7d634c', trousers: '#897258' }, 'golfer:golf_am_m2': { shirt: '#708fa2', trousers: '#47755d' },
  'golfer:golf_am_m3': { shirt: '#8a482d', trousers: '#a67757' }, 'golfer:golf_am_w1': { shirt: '#bca872', trousers: '#ccc7c8' },
  'golfer:golf_pro_m1': { shirt: '#5d7175', trousers: '#7d8084' }, 'golfer:golf_pro_m2': { shirt: '#c4a057', trousers: '#343d56' },
  'golfer:golf_pro_m3': { shirt: '#8e2b22', trousers: '#c1bab7' }, 'golfer:golf_pro_m4': { shirt: '#2a2d39', trousers: '#979a9e' },
  'golfer:golf_pro_w1': { shirt: '#ca9486', trousers: '#d9b2b1' }, 'golfer:golf_pro_w2': { shirt: '#2b5c4f', trousers: '#262b45' },
};
/** the player's dress in the view: the clothes of his card's golfer art (`artId`; unknown: the view's own red polo and navy trousers), a white cap, his sex */
export function playerDress(artId: string | undefined, sex: Sex): Dress {
  const d = (artId && ART_DRESS[artId]) || { shirt: '#c8323a', trousers: '#2a3550' };
  return { shirt: d.shirt, trousers: d.trousers, cap: '#f6f6f2', skin: '#e2b48a', hair: '#47291a', build: sex === 'w' ? 0.94 : 1, sex };
}
