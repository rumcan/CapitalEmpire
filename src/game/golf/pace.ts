// T266 (#800, the owner: "people seem to be playing golf at hyper speed"): everyday golf's pace options, a dev switch (?golfPace=...) while the
// lead picks one. daynight: the town clock runs the golf hours slower and the night faster (sim/townclock.ts DayProfile); walk: the playback keeps
// the golfers to a brisk walk (a cart to a cart's speed) and plays the swings at their natural length, a golfer behind his schedule catching up
// with a short fade (play/pacer.ts); long: a longer town day; mix: daynight and walk. Pure TS.

export type GolfPace = 'main' | 'daynight' | 'walk' | 'long' | 'mix';
/** the golf hours' rate on the day/night clock, town minutes a sim second (main's 10-minute day: 2.4; the tournament day: 1) */
export const DAY_RATE = 1.5;
/** option 3's town day, real minutes at 1x: 1 town minute a sim second, the tournament day's pace */
export const LONG_DAY_MIN = 24;
/** the watchable golfers' brisk walk and a cart's speed, tiles a sim second (the range's walkers: rangebiz.ts WALK, 2.8 m/s; a paved cart path's
 *  limit, 5.6 m/s) */
export const WALK_CAP = 1.4, CART_CAP = 2.8;
/** the option a URL's ?golfPace asks for (anything else: main) */
export function paceOf(q: string | null): GolfPace { return q === 'daynight' || q === 'walk' || q === 'long' || q === 'mix' ? q : 'main'; }
/** whether the option runs the day/night clock, and whether it keeps the golfers to a walk */
export const dayNight = (p: GolfPace): boolean => p === 'daynight' || p === 'mix';
export const capped = (p: GolfPace): boolean => p === 'walk' || p === 'mix';
