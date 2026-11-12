// T429 (docs/CINDERLINKS-PORT.md, the host half of "galleries"): the spectators at the galleries as the view from behind the golfer is sent them, as `gallery`
// actors in the actors list (protocol3p.ts Actor: role 'gallery', count, fans, focus). Nothing is worked out again: how many stand at each spot is the City's
// (the traffic's gallery buffer: x, y, the count, the kind (2: a grandstand), the point faced, eight numbers a spot), and where each fan stands or sits is
// crowdview.ts galleryPeople's, the very call the manager view draws them with (an arc round a tee, a ring round a green, the seats of a grandstand), with the
// places and seats the engine keeps per spot (galleries.ts galleryPlaces, event-seating.ts placeSeating).
// Positions are in the view's frame (protocol3p.ts toView): metres from the course's centre, x east, y south; a seat's height in metres.
// Pure TS, no DOM.
import type { Pt } from './types';
import type { Frame3p } from './export3p';
import type { PlacedSeating } from '../event-seating';
import { galleryPeople, type CrowdPerson } from '../../crowdview';
import { centreOf } from './turn3p';
import { toView, type Actor, type ActorsMsg } from './protocol3p';

/** a gallery actor's id: GALLERY_ID + its spot's index */
export const GALLERY_ID = 300000;
/** the numbers a spot takes in the City's gallery buffer */
export const GALLERY_STRIDE = 8;

/** what galleryActors reads: the City's gallery buffer (GALLERY_STRIDE numbers a spot), each spot's places (a tee's arc, a green's ring: x, y, x, y ... tiles)
 *  and each grandstand's seats, by spot index (the engine's galleryPlaces and gallerySeating) */
export interface GalleryState { G: ArrayLike<number>; places?: ReadonlyMap<number, ArrayLike<number>>; seating?: ReadonlyMap<number, PlacedSeating> }

const r1 = (v: number): number => Math.round(v * 10) / 10;

/** every spot with spectators as a gallery actor: its point, the point its fans face, its count, and each fan where the manager view stands (or seats) him */
export function galleryActors(st: GalleryState, frame: Frame3p | Pt): Actor[] {
  const c = centreOf(frame), G = st.G, out: Actor[] = [], people: CrowdPerson[] = [];
  for (let o = 0; o + GALLERY_STRIDE - 1 < G.length; o += GALLERY_STRIDE) {
    const spot = o / GALLERY_STRIDE, n = galleryPeople(G, o, spot, 0, 1, people, -1, st.seating?.get(spot), st.places?.get(spot));
    if (n <= 0) continue;
    const stand = G[o + 3] === 2, fans: [number, number, number][] = [];
    for (let k = 0; k < n; k++) { const p = people[k]!, v = toView(p, c); fans.push([r1(v[0]), r1(v[1]), stand ? r1(p.seatHeightMetres ?? 0.45) : 0]); }
    const at = toView({ x: G[o]!, y: G[o + 1]! }, c), focus = toView({ x: G[o + 4]!, y: G[o + 5]! }, c);
    const a: Actor = { id: GALLERY_ID + spot, role: 'gallery', at: [r1(at[0]), r1(at[1])], hole: 0, count: n, fans, focus: [r1(focus[0]), r1(focus[1])] };
    if (stand) a.seated = true;
    out.push(a);
  }
  return out;
}

/** an actors list with the galleries in it (the list is the whole list each time: the galleries go with the people) */
export function withGalleries(msg: ActorsMsg, st: GalleryState, frame: Frame3p | Pt): ActorsMsg {
  return { ...msg, actors: [...msg.actors.filter(a => a.role !== 'gallery'), ...galleryActors(st, frame)] };
}
