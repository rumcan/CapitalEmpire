// T450 (docs/CINDERLINKS-PORT.md): which of CapitalEmpire's golfers (the rendered art in art/golfers/<id>) a person is in the view from behind the
// golfer. Kept apart from look3p.ts, with no imports, so the round's pure model (actors3p.ts) does not pull the manager view's modules in with it.
import type { Sex } from './types';

/** the golfer art ids, in library.ts GOLFER_PEOPLE's order without its 'golfer:' prefix (the test keeps them the same): the folders of art/golfers the
 *  view draws people from (packages/cinderlinks/parts/08k-golfart.md GOLFART_IDS) */
export const GOLFER_ART_IDS: readonly string[] = ['golf_am_m1', 'golf_am_m2', 'golf_am_m3', 'golf_am_w1', 'golf_pro_m1', 'golf_pro_m2', 'golf_pro_m3', 'golf_pro_m4', 'golf_pro_w1', 'golf_pro_w2'];
/** the golfer art a golfer of this sex and look wears, by the manager view's own rule (engine.ts GOLFER_ART: a sex's art is the ids with _m or _w,
 *  and his look picks one of them), so the view shows the same person the course does */
export function artFor(sex: Sex, look: number): string {
  const own = GOLFER_ART_IDS.filter(id => id.includes(sex === 'w' ? '_w' : '_m')), list = own.length ? own : GOLFER_ART_IDS;
  return list[((Math.floor(look) % list.length) + list.length) % list.length]!;
}
