// T437 (docs/CINDERLINKS-PORT.md, one look): the view from behind the golfer dressed as the manager game is. One list of the biomes and course types the
// view knows, with the names both views show (the view's own lists, packages/cinderlinks parts 05-ground and 07-play, must match: the test reads them),
// and the rules section 2 of the plan gives:
// - the biome from the map's setting: Maple Falls is a northern valley with maples (clubtitle.ts MONTH_HIGH_C): parkland, under snow in a month whose
//   usual high is at or below freezing;
// - the course type from how the course is kept: a tournament day (the tour's set-up) plays as Tour; a course in good condition (the crew's work, staff.ts
//   courseCondition) as Private; a neglected one as Public. (The game has no superintendent cards yet: when it does, they feed the condition.)
// - the golfer's look from the player card: the clothes of the golfer art the player chose (library.ts GOLFER_PEOPLE), as the view's golfer wears them.
// Pure TS, no DOM.
import { MONTH_HIGH_C } from '../clubtitle';
import type { CourseType, Dress } from './protocol3p';
import type { Sex } from './types';

/** the biomes the view grows, in its order, with their names */
export const BIOMES_3P = [['parkland', 'Parkland'], ['coastal', 'Coastal'], ['beachside', 'Beachside'], ['desert', 'Desert'], ['savanna', 'Savanna'], ['jungle', 'Jungle'], ['snow', 'Snow']] as const;
export type Biome3p = typeof BIOMES_3P[number][0];
/** the course types the view keeps, in its order, with their names (links is the view's own choice: the game sends the other three) */
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

/** the clothes of each golfer art (library.ts GOLFER_PEOPLE ids), sampled from its preview (art/golfers/<id>/preview.png): the shirt and the trousers */
export const ART_DRESS: Readonly<Record<string, { shirt: string; trousers: string }>> = {
  'golfer:golf_am_m1': { shirt: '#7d634c', trousers: '#897258' }, 'golfer:golf_am_m2': { shirt: '#708fa2', trousers: '#47755d' },
  'golfer:golf_am_m3': { shirt: '#8a482d', trousers: '#a67757' }, 'golfer:golf_am_w1': { shirt: '#bca872', trousers: '#ccc7c8' },
  'golfer:golf_pro_m1': { shirt: '#5d7175', trousers: '#7d8084' }, 'golfer:golf_pro_m2': { shirt: '#c4a057', trousers: '#343d56' },
  'golfer:golf_pro_m3': { shirt: '#8e2b22', trousers: '#c1bab7' }, 'golfer:golf_pro_m4': { shirt: '#2a2d39', trousers: '#979a9e' },
  'golfer:golf_pro_w1': { shirt: '#ca9486', trousers: '#d9b2b1' }, 'golfer:golf_pro_w2': { shirt: '#2b5c4f', trousers: '#262b45' },
};
export { GOLFER_ART_IDS, artFor } from './golfart3p'; // (T450: the golfer art ids and the rule for a golfer's, kept where actors3p.ts can import them alone)
/** the player's dress in the view: the clothes of his card's golfer art (`artId`; unknown: the view's own red polo and navy trousers), a white cap, his sex */
export function playerDress(artId: string | undefined, sex: Sex): Dress {
  const d = (artId && ART_DRESS[artId]) || { shirt: '#c8323a', trousers: '#2a3550' };
  const art = artId && ART_DRESS[artId] ? artId.slice('golfer:'.length) : undefined; // (T450: he is drawn as that golfer)
  return { shirt: d.shirt, trousers: d.trousers, cap: '#f6f6f2', skin: '#e2b48a', hair: '#47291a', build: sex === 'w' ? 0.94 : 1, sex, ...(art ? { art } : {}) };
}
