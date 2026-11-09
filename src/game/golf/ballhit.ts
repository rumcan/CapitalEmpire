// A ball that comes down among the fans (T406, #1090; the owner, 2026-11-09: "if you hit a spectator he will hold his knee for 2 mins and just go 'Aaarggg ...
// aaarrgghh...' over and over"). Event-driven: the playback reports a ball's landing once (play/view.ts PlayLand), and only then are the galleries near it
// looked at; no person is checked per frame. The fans stand where crowdview.ts galleryPeople puts them (seeded, the same every frame), so the fan a ball hits
// is found by asking it for the people of the few spots near the landing. Also the game events a landing raises (a birdie, a ball in the water, a nice shot).
// Pure TS, no DOM.
import { galleryPeople, hash, type CrowdPerson } from '../crowdview';
import { HIT_R, type EventId } from '../bubble-lines';
import type { PlayLand } from './play/view';

/** the gallery buffer's stride (floats a spot: x, y, fans, kind, fx, fy, ax, ay) */
export const GALLERY_STRIDE = 8;
/** a spot within this many tiles of a landing may hold a fan it hits: a block of fans reaches about 5 tiles from its point; an arc or a ring (places) up to 24 */
const REACH_BLOCK = 6, REACH_PLACES = 24;
/** the fan a ball hit: his gallery spot and slot, where he stands (tiles), how far the ball was from him, and where his gallery looks (tiles). A ball over a fan's
 *  head does no harm: only a ball that is down (a landing, or where it rests) hits */
export interface FanHit { spot: number; slot: number; x: number; y: number; d: number; fx: number; fy: number }
const SCRATCH: CrowdPerson[] = [];

/** the fan a ball hits at (x, y) (tiles): the nearest standing fan of the galleries in `G` (the City's gallery buffer) within HIT_R of it, or null. Grandstand
 *  fans sit apart in their stands and are not hit. places: the spots' arcs and rings (the engine's galleryPlaces). Reuses a scratch list: no allocation once warm */
export function fanHit(G: ArrayLike<number>, places: ReadonlyMap<number, ArrayLike<number>> | null, x: number, y: number, r = HIT_R): FanHit | null {
  let best: FanHit | null = null, bd = r;
  for (let i = 0; i + GALLERY_STRIDE - 1 < G.length; i += GALLERY_STRIDE) {
    if (G[i + 3] === 2 || G[i + 2]! < 1) continue;
    const spot = i / GALLERY_STRIDE, pl = places?.get(spot), reach = pl ? REACH_PLACES : REACH_BLOCK;
    if (Math.abs(G[i]! - x) > reach || Math.abs(G[i + 1]! - y) > reach) continue;
    const k = galleryPeople(G, i, spot, 0, 1, SCRATCH, -1, undefined, pl);
    for (let s = 0; s < k; s++) {
      const p = SCRATCH[s]!, d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = { spot, slot: s, x: p.x, y: p.y, d, fx: G[i + 4]!, fy: G[i + 5]! }; }
    }
  }
  return best;
}
/** the fan a landed ball hits: where it came down, else where it rests (a ball rolls on: the roll's end), the first that finds one; null for none */
export function fanHitBy(G: ArrayLike<number>, places: ReadonlyMap<number, ArrayLike<number>> | null, l: Pick<PlayLand, 'x' | 'y' | 'rx' | 'ry' | 'landLie' | 'lie'>): FanHit | null {
  if (l.landLie === 'water' || l.lie === 'water') return null; // (a ball in the water hits no one)
  return fanHit(G, places, l.x, l.y) ?? ((l.rx !== l.x || l.ry !== l.y) ? fanHit(G, places, l.rx, l.ry) : null);
}

/** within this many tiles of a fan a ball coming down in the rough makes its golfer shout Fore (20 m) */
export const FORE_R = 10;
/** a shot that ends within this many tiles of the pin (3 m) and is not holed is a nice shot */
export const NICE_R = 1.5;
/** the chance a bad penalty makes a golfer throw his club (rare, seeded by the stroke: the same every time the day is played) */
export const THROW_P = 0.06;

/** the game events a ball's landing raises, in the order they should speak: a score (ace, eagle, birdie), the water, the ball lost out of bounds, a nice shot
 *  (an approach that ends by the pin), a Fore (a ball in the rough near the fans: `nearFans`), a club thrown (rare, after a penalty). Seeded by the golfer, hole
 *  and stroke, so a replayed day tells the same story */
export function landEvents(l: PlayLand, nearFans: boolean): EventId[] {
  const out: EventId[] = [];
  if (l.holed) {
    const toPar = l.stroke - l.par;
    if (l.stroke === 1 && l.par >= 3) out.push('ace'); else if (toPar <= -2) out.push('eagle'); else if (toPar === -1) out.push('birdie');
    return out;
  }
  if (l.landLie === 'water' || l.lie === 'water') out.push('ball-water');
  else if (l.lie === 'out') out.push('ball-lost');
  else if (l.club !== 'putter' && Math.hypot(l.rx - l.px, l.ry - l.py) <= NICE_R && (l.lie === 'green' || l.landLie === 'green')) out.push('nice-shot');
  else if (nearFans && l.club !== 'putter' && (l.landLie === 'rough' || l.landLie === 'fescue' || l.landLie === 'bunker')) out.push('fore');
  if (l.penalty && hash(l.golfer * 101 + l.hole, l.stroke * 7 + 3) < THROW_P) out.push('club-throw');
  return out;
}
