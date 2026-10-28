// T266 (#800, the owner: "people seem to be playing golf at hyper speed"): golf's pace. Watchable (the default, the lead's pick: option 4 of the
// prototype) runs the town clock's golf hours slower and its night faster (sim/townclock.ts DayProfile: the night keeps NIGHT_S, the golf hours take
// the rest of the town day) and keeps the golfers, everyday and the tournament's, to a brisk walk and a cart to a cart's speed, their swings at
// their natural length, a golfer behind his schedule catching up with a short fade (play/pacer.ts). Fast is the old pace. The dev server's
// ?golfPace=main|daynight|walk|long|mix still plays the prototype's options. Pure TS.

export type GolfPace = 'main' | 'daynight' | 'walk' | 'long' | 'mix';
/** the gear menu's setting: watchable (mix) or fast (the old pace, main) */
export type PaceSetting = 'watchable' | 'fast';
/** the night's length (20:00 to 06:00) on the day/night clock, sim seconds (real seconds at 1x); a town day too short for it stays flat */
export const NIGHT_S = 40;
/** the prototype's option 3's town day, real minutes at 1x (dev only): 1 town minute a sim second, the tournament day's pace */
export const LONG_DAY_MIN = 24;
/** the watchable golfers' brisk walk and a cart's speed, tiles a sim second (the range's walkers: rangebiz.ts WALK, 2.8 m/s; a paved cart path's
 *  limit, 5.6 m/s); a caddie walks a little faster than his pro, to keep up */
export const WALK_CAP = 1.4, CART_CAP = 2.8, CADDIE_CAP = 1.6;
/** where the setting is remembered */
export const PACE_KEY = 'capitalempire.golfPace';
/** the option a dev URL's ?golfPace asks for (null: none asked) */
export function paceOf(q: string | null): GolfPace | null { return q === 'main' || q === 'daynight' || q === 'walk' || q === 'long' || q === 'mix' ? q : null; }
/** the option of a remembered setting (anything else: watchable) */
export const paceOfSetting = (s: string | null): GolfPace => (s === 'fast' ? 'main' : 'mix');
/** the setting an option shows as */
export const settingOf = (p: GolfPace): PaceSetting => (p === 'main' ? 'fast' : 'watchable');
/** whether the option runs the day/night clock, and whether it keeps the golfers to a walk */
export const dayNight = (p: GolfPace): boolean => p === 'daynight' || p === 'mix';
export const capped = (p: GolfPace): boolean => p === 'walk' || p === 'mix';
