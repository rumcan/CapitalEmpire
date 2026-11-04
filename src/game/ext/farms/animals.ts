// T309 (#894): the farm animals. Cows and horses graze the paddock (the pasture inside its chain-link fence), sheep the other pastures and the
// fallow fields; a few a farm, each wandering slowly round a home spot in its field and never out of it (the field is shrunk by a margin past
// the fence, and every walk is a straight line between two points inside that rectangle, so it stays inside: the rectangle is convex).
// Pure and stateless: where an animal is and what it shows is a function of its seed and the time, like the crowd (crowdview.ts), so nothing is
// stepped per frame and a farm's animals cost one hash a cycle each when drawn. The art (animals-library.ts) has 8 headings in world-angle
// order (CAR_DIRECTIONS: k 0 SE .. 7 E, the nose on screen) and 15 frames a heading: graze 0-3, lookup 4-6 (head 2/3 down, 1/3, up), walk 7-14.
import type { Pt } from '../../network';
import { farmAnimalFields, type AnimalField, type FarmModel, type FarmParcel } from './farms';

export type AnimalKind = 'cow' | 'horse' | 'sheep';
/** the animals' art as the game knows it: its id (cow-*, horse-*, sheep-*: the kind) */
export interface AnimalArtRef { id: string }
export const animalKind = (id: string): AnimalKind => (id.startsWith('horse') ? 'horse' : id.startsWith('sheep') ? 'sheep' : 'cow');

/** a heading's frames: graze (the main idle), lookup (the head coming up), walk; and the clip timings (seconds a frame) */
export const ANIMAL_GRAZE = 0, ANIMAL_LOOKUP = 4, ANIMAL_WALK = 7, ANIMAL_ROW = 15;
export const GRAZE_FRAME_S = 0.7, LOOKUP_FRAME_S = 0.22, WALK_FRAME_S = 0.16;
/** walking speed (tiles a second; a tile is 2 m: a slow amble), wander radius round the home spot (tiles), the margin kept inside the field's
 *  edge (tiles: the fence stands on the edge; the margin is past half the longest animal's length) */
export const ANIMAL_SPEED: Readonly<Record<AnimalKind, number>> = { cow: 0.3, horse: 0.36, sheep: 0.28 };
export const ANIMAL_WANDER: Readonly<Record<AnimalKind, number>> = { cow: 3, horse: 3.5, sheep: 2.5 };
export const ANIMAL_MARGIN = 1.6;
/** at most this many animals a farm (the paddock's herd plus the sheep) */
export const ANIMALS_PER_FARM_MAX = 12;

/** one animal: its art, kind, field (the parcel frame: o + u a + n b; the field shrunk by the margin), home spot and its timing */
export interface FarmAnimal {
  art: number; kind: AnimalKind;
  o: Pt; u: Pt; n: Pt;
  /** the field it keeps to (a0, b0, a1, b1: parcel frame, already shrunk by ANIMAL_MARGIN) */
  f: [number, number, number, number];
  home: [number, number]; r: number;
  seed: number; cycle: number; phase: number; speed: number;
}
/** what an animal shows at a time: world tiles, its heading row (0..7) and its frame in the row (0..14) */
export interface AnimalView { x: number; y: number; art: number; row: number; frame: number; moving: boolean }

const h32 = (a: number, b: number, c = 0) => {
  let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77) ^ Math.imul(c | 0, 0xc2b2ae3d)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0; h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0; return (h ^ (h >>> 16)) >>> 0;
};
const u01 = (a: number, b: number, c = 0) => h32(a, b, c) / 4294967296;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** the nearest painted heading to a world direction (CAR_DIRECTIONS order: carHeading) */
export const animalHeading = (dx: number, dy: number) => ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;

/** The animals of one farm (deterministic in parcel, seed and the art list): the paddock gets a herd of cows (3-5) or horses (2-4), each other
 *  pasture and, on half the farms, the largest fallow field a flock of sheep (4-7); no more than the field's area allows (one per 30 square tiles)
 *  and ANIMALS_PER_FARM_MAX in all. arts: the animal art (ANIMALS), each picked by kind; none of a kind: that kind is left out */
export function farmAnimals(p: FarmParcel, seed: number, arts: readonly AnimalArtRef[], model?: FarmModel, fields: AnimalField[] = farmAnimalFields(p, seed, model)): FarmAnimal[] {
  const byKind: Record<AnimalKind, number[]> = { cow: [], horse: [], sheep: [] };
  arts.forEach((a, i) => byKind[animalKind(a.id)].push(i));
  const s0 = h32(seed, 0x7309), out: FarmAnimal[] = [];
  const fallow = fields.filter(q => q.kind === 'fallow').sort((a, b) => (b.a1 - b.a0) * (b.b1 - b.b0) - (a.a1 - a.a0) * (a.b1 - a.b0))[0];
  const grazed = fields.filter(q => q.kind !== 'fallow' || (q === fallow && u01(s0, 1) < 0.5 && !fields.some(z => z.kind === 'pasture')));
  grazed.forEach((q, qi) => {
    const a0 = q.a0 + ANIMAL_MARGIN, b0 = q.b0 + ANIMAL_MARGIN, a1 = q.a1 - ANIMAL_MARGIN, b1 = q.b1 - ANIMAL_MARGIN;
    if (a1 - a0 < 2 || b1 - b0 < 2) return;
    const kind: AnimalKind = q.kind === 'paddock' ? (u01(s0, 2, qi) < 0.6 ? 'cow' : 'horse') : 'sheep';
    const pool = byKind[kind].length ? byKind[kind] : null; if (!pool) return;
    const lo = kind === 'cow' ? 3 : kind === 'horse' ? 2 : 4, span = kind === 'sheep' ? 4 : 3;
    const want = Math.min(lo + Math.floor(u01(s0, 3, qi) * span), Math.floor((q.a1 - q.a0) * (q.b1 - q.b0) / 30), ANIMALS_PER_FARM_MAX - out.length);
    // (a herd keeps together: the homes round a centre, a breed or two a herd)
    const ca = a0 + (a1 - a0) * (0.25 + 0.5 * u01(s0, 4, qi)), cb = b0 + (b1 - b0) * (0.25 + 0.5 * u01(s0, 5, qi));
    const breedA = pool[Math.floor(u01(s0, 6, qi) * pool.length)]!, breedB = pool[Math.floor(u01(s0, 7, qi) * pool.length)]!;
    for (let j = 0; j < want; j++) {
      const s = h32(s0, 100 + qi, j), ang = u01(s, 1) * Math.PI * 2, rad = 5 * Math.sqrt(u01(s, 2));
      out.push({
        art: u01(s, 3) < 0.7 ? breedA : breedB, kind, o: p.o, u: p.u, n: p.n, f: [a0, b0, a1, b1],
        home: [clamp(ca + Math.cos(ang) * rad, a0, a1), clamp(cb + Math.sin(ang) * rad, b0, b1)], r: ANIMAL_WANDER[kind],
        seed: s, cycle: 30 + 25 * u01(s, 4), phase: u01(s, 5) * 1000, speed: ANIMAL_SPEED[kind] * (0.85 + 0.3 * u01(s, 6)),
      });
    }
  });
  return out;
}

/** the i-th waypoint of an animal (parcel frame): a point round its home, inside its field */
function waypoint(a: FarmAnimal, i: number): [number, number] {
  const ang = u01(a.seed, i, 11) * Math.PI * 2, d = a.r * Math.sqrt(u01(a.seed, i, 12));
  return [clamp(a.home[0] + Math.cos(ang) * d, a.f[0], a.f[2]), clamp(a.home[1] + Math.sin(ang) * d, a.f[1], a.f[3])];
}
const toWorld = (a: FarmAnimal, pa: number, pb: number, out: { x: number; y: number }) => { out.x = a.o.x + a.u.x * pa + a.n.x * pb; out.y = a.o.y + a.u.y * pa + a.n.y * pb; };
const headingOf = (a: FarmAnimal, p: [number, number], q: [number, number]) => {
  const da = q[0] - p[0], db = q[1] - p[1];
  return animalHeading(a.u.x * da + a.n.x * db, a.u.y * da + a.n.y * db);
};

/** where an animal is and what it shows at time t (seconds). Its life is a chain of cycles: in cycle i it lifts its head at waypoint i (lookup),
 *  now and then stands looking round, walks to waypoint i + 1, puts its head down and grazes there for the rest of the cycle */
export function animalAt(a: FarmAnimal, t: number, out: AnimalView): AnimalView {
  const T = t + a.phase, i = Math.floor(T / a.cycle), tau = T - i * a.cycle;
  const p = waypoint(a, i), q = waypoint(a, i + 1), dist = Math.hypot(q[0] - p[0], q[1] - p[1]);
  const up = 3 * LOOKUP_FRAME_S, stand = u01(a.seed, i, 13) < 0.35 ? 2 + 4 * u01(a.seed, i, 14) : 0;
  const walk = Math.min(dist / a.speed, a.cycle - 2 * up - stand - 4);
  out.art = a.art; out.moving = false;
  if (tau < up + stand) {
    // the head comes up at waypoint i, facing as it walked there; then it stands looking round
    toWorld(a, p[0], p[1], out); out.row = headingOf(a, waypoint(a, i - 1), p);
    out.frame = ANIMAL_LOOKUP + Math.min(2, Math.floor(tau / LOOKUP_FRAME_S));
  } else if (tau < up + stand + walk) {
    const w = tau - up - stand, k = walk > 0 ? w / walk : 1;
    toWorld(a, p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, out); out.row = headingOf(a, p, q);
    out.frame = ANIMAL_WALK + Math.floor(w / WALK_FRAME_S) % 8; out.moving = true;
  } else {
    const g = tau - up - stand - Math.max(0, walk);
    toWorld(a, q[0], q[1], out); out.row = headingOf(a, p, q);
    // the head goes down (lookup backwards), then the graze loop
    out.frame = g < up ? ANIMAL_LOOKUP + 2 - Math.min(2, Math.floor(g / LOOKUP_FRAME_S)) : ANIMAL_GRAZE + Math.floor((g - up) / GRAZE_FRAME_S + (a.seed & 3)) % 4;
  }
  return out;
}

/** the world box an animal can be in (its field's corners), for culling */
export function animalBox(a: FarmAnimal): [number, number, number, number] {
  const xs: number[] = [], ys: number[] = [], w = { x: 0, y: 0 };
  for (const [pa, pb] of [[a.f[0], a.f[1]], [a.f[2], a.f[1]], [a.f[0], a.f[3]], [a.f[2], a.f[3]]] as [number, number][]) { toWorld(a, pa, pb, w); xs.push(w.x); ys.push(w.y); }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
