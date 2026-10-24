import { BUSINESS, type BusinessId } from './catalogue';
import type { BizDef } from './state';
import type { LibItem, Prop } from '../types';
import { drawnAs } from '../mirror';
import { OWNER_SCALE, STUDIO_SCALE } from '../lots/scales';

/** The representative delivered sprite for each business's catalogue card. */
export const BUSINESS_IMAGE: Record<BusinessId, string> = { stadium: 'stadium', sportsbar: 'sportsbar', buscompany: 'buscompany', diner: 'diner', taxi: 'taxi', golf: 'golf-clubhouse', estate: 'estate-villa', fishing: 'fishing-lodge', tackle: 'tackle', casino: 'casino', hotel: 'hotel', motel: 'motel', clubhouse: 'golf-clubhouse' };
// Positions and sizes are fractions of the canonical parcel; R exchanges its world axes. A size of 0 draws the sprite at its own map size (the
// studio's size; never stretched past its art); an id with a ':' is a library id as it is (else 'business:' + id). A sprite the owner sized in the
// sprite studio is drawn at that size whatever its share (the owner, 2026-10-24: "I need to be able to fix the sizes of all of the stuff in the
// library"), and no picture is drawn past its pixels (newart.ts lookOf).
type Piece = [string, number, number, number];
const single = (id: string): Piece[] => [[id, 0.5, 0.5, 0.88]];
const LAYOUT: Record<BusinessId, Piece[]> = {
  // the stadium's picture at two thirds of the others' share of the parcel (the owner, 2026-10-21: it was 150% too big)
  stadium: [['stadium', 0.5, 0.5, 0.88 / 1.5]], sportsbar: single('sportsbar'), buscompany: single('buscompany'), diner: single('diner'), taxi: single('taxi'),
  tackle: single('tackle'), casino: single('casino'), hotel: single('hotel'), motel: single('motel'),
  estate: [[ 'estate-villa', .25, .28, .25 ], ['estate-villa', .7, .28, .25], ['estate-villa', .25, .72, .25], ['estate-villa', .7, .72, .25]],
  golf: [
    ['golf-fairway-curved', .25, .25, .4], ['golf-fairway-dogleg', .65, .3, .4], ['golf-fairway-curved', .33, .65, .4],
    ['golf-green-kidney-flagged', .13, .12, .15], ['golf-green-unflagged', .78, .14, .15], ['golf-green-kidney-flagged', .16, .82, .15],
    ['golf-pond', .65, .55, .21], ['golf-bunker-organic', .2, .4, .12], ['golf-bunker-crescent', .58, .12, .11],
    ['golf-tee-box', .45, .38, .09], ['golf-tee-box', .45, .83, .09], ['golf-footbridge', .63, .55, .08],
    ['golf-clubhouse', .8, .8, .19], ['golf-pro-shop', .9, .61, .1], ['golf-cart-garage', .58, .9, .11],
    ['golf-halfway-pavilion', .08, .55, .09], ['golf-driving-range', .84, .4, .14], ['golf-practice-net', .88, .5, .05],
    ['golf-patio-table', .69, .83, .035], ['golf-bench-course-map', .7, .7, .04], ['golf-cart-sw', .7, .9, .04],
  ],
  // the starting clubhouse is a tin-and-tarp shack (the owner, 2026-10-22: start with a poor clubhouse; the grand clubhouse, the pro shop and the
  // cart garage are built later), at its own size
  clubhouse: [['golf:clubhouse-shanty', .5, .5, 0]],
  fishing: [ ['fishing-lodge', .45, .45, .38], ['fishing-cabin', .18, .2, .18], ['fishing-cabin', .18, .7, .18],
    ['fishing-boathouse', .78, .45, .22], ['fishing-dock-rope', .82, .2, .14], ['fishing-dock-lifebuoy', .85, .7, .14],
    ['fishing-rental-kiosk', .54, .83, .12], ['fishing-bass-boat', .93, .7, .1] ],
};

/** Derive render-only props from a saved business parcel (tiles); no extra props enter the save or simulation. */
export function businessArt(def: BizDef, library: LibItem[], index: ReadonlyMap<string, number>): Prop[] {
  const canonical = BUSINESS[def.type].footprint, flip = def.w === canonical.h && def.h === canonical.w;
  return LAYOUT[def.type].flatMap(([id, u, v, fraction], n) => {
    const front = index.get(id.includes(':') ? id : 'business:' + id); if (front === undefined) return [];
    // a rotated parcel draws the four-view art turned (its partner view) and any other picture unflipped: never mirrored (mirror.ts)
    const [tid, tflip] = drawnAs(library[front]!, flip), item = index.get(tid) ?? front;
    const it = library[item], sized = STUDIO_SCALE[library[front]!.id], scale = sized ?? (fraction ? 64 * (def.w + def.h) * fraction / it.w : OWNER_SCALE[it.id] ?? 1);
    const x = def.x + (flip ? v : u) * def.w, y = def.y + (flip ? u : v) * def.h;
    const b = it.boxes[0], radius = fraction ? Math.min(def.w, def.h) * fraction * .35 : b ? Math.max(b.hx, b.hy) * scale : 2;
    return [{ uid: -1000000 - def.id * 100 - n, item, x, y, flip: tflip, scale, x0: x - radius, y0: y - radius, x1: x + radius, y1: y + radius, auto: 'business-art' }];
  });
}
