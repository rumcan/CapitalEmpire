// J11 (#1270): the map's sounds, the ones the engine tells this module about (a few one-line calls in engine.ts; nothing here runs per frame):
//   spent   every spend the treasury sees: a thing built or placed with a click on the map is a low thump, a click that takes something away (the bulldozer's
//           refund) is a scrape and a few stones, and a purchase made in a card, the bank or at the land sale is a coin
//   warned  a warning toast (a refused action, a tool that is locked, a place that is full) is a soft low "can't"
// The range's ambience (a breeze, a bird now and then and the distant strikes of the golfers hitting) is range-ambience.ts.
import { sfx } from './sfx';

/** what each kind of spend sounds like. kind: the treasury's ('construction', 'lots', 'upkeep', 'business', 'balls', 'bank', 'compensation'); n: dollars, negative
 *  for a refund; atMap: a click on the map made it (SimClient.onSpend, the engine's moneySpot). Upkeep, takings and the bank's own charges are not purchases: no sound */
export function soundOfSpend(kind: string, n: number, atMap: boolean): 'place' | 'bulldoze' | 'cash' | null {
  if (!Number.isFinite(n) || n === 0) return null;
  if (kind === 'construction') return n > 0 ? (atMap ? 'place' : 'cash') : atMap ? 'bulldoze' : null;
  if (kind === 'lots') return n > 0 ? 'cash' : null;
  return null;
}

export const mapSounds = {
  spent(kind: string, n: number, atMap: boolean): void {
    const s = soundOfSpend(kind, n, atMap);
    if (s === 'place') sfx.place(); else if (s === 'bulldoze') sfx.bulldoze(); else if (s === 'cash') sfx.cash();
  },
  /** a toast of this kind was shown: only a warning sounds (the low "can't") */
  toast(kind: string): void { if (kind === 'warn') sfx.refuse(); },
};
