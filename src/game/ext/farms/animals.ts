// T309 (#894): the farm animals. Cows and horses graze the paddock (the pasture inside its chain-link fence), sheep the other pastures and the
// fallow fields; a herd a farm, each animal wandering slowly round a home spot in its own patch of the field and never out of it (the field is
// shrunk by a margin past the fence, and every walk is a straight line between two points inside that rectangle, so it stays inside: the rectangle
// is convex). The animals keep a little apart: each has the part of the field nearer its home than any other animal's (a convex cell), shrunk by
// half the spacing, and walks between points of that cell only, so two animals are never closer than ANIMAL_SEP * 2 tiles (3.2 m).
// Pure and stateless but for a cache of the waypoints: where an animal is and what it shows is a function of its seed and the time, like the crowd
// (crowdview.ts), so nothing is stepped per frame and a farm's animals cost one hash a cycle each when drawn. The art (animals-library.ts) has 8
// headings in world-angle order (CAR_DIRECTIONS: k 0 SE .. 7 E, the nose on screen) and 15 frames a heading: graze 0-3 (head down, a nod, the tail
// swishing), lookup 4-6 (head 2/3 down, 1/3, up), walk 7-14 (a four-beat walk, the feet matched to WALK_FRAME_S and the speed).
import type { Pt } from '../../network';
import { farmAnimalFields, type AnimalField, type FarmModel, type FarmParcel } from './farms';

export type AnimalKind = 'cow' | 'horse' | 'sheep';
/** the animals' art as the game knows it: its id (cow-*, horse-*, sheep-*: the kind) */
export interface AnimalArtRef { id: string }
export const animalKind = (id: string): AnimalKind => (id.startsWith('horse') ? 'horse' : id.startsWith('sheep') ? 'sheep' : 'cow');

/** a heading's frames: graze (the main idle), lookup (the head coming up), walk; and the clip timings (seconds a frame) */
export const ANIMAL_GRAZE = 0, ANIMAL_LOOKUP = 4, ANIMAL_WALK = 7, ANIMAL_ROW = 15;
export const GRAZE_FRAME_S = 0.7, LOOKUP_FRAME_S = 0.22;
/** the walk's frame time by kind (a sheep's short legs step quicker) */
export const WALK_FRAME_S: Readonly<Record<AnimalKind, number>> = { cow: 0.16, horse: 0.16, sheep: 0.11 };
/** walking speed (tiles a second; a tile is 2 m): a slow amble, the stride of the art (the foot's travel while it is down, 8 frames of WALK_FRAME_S),
 *  wander radius round the home spot (tiles), the margin kept inside the field's edge (tiles: the fence stands on the edge; the margin is past half
 *  the longest animal's length) and half the least spacing between two animals (tiles) */
export const ANIMAL_SPEED: Readonly<Record<AnimalKind, number>> = { cow: 0.28, horse: 0.40, sheep: 0.20 };
export const ANIMAL_WANDER: Readonly<Record<AnimalKind, number>> = { cow: 3, horse: 3.5, sheep: 2.5 };
export const ANIMAL_MARGIN = 1.6, ANIMAL_SEP = 0.8;
/** how far past the bisector an animal keeps from a hay bale or a bush in its field (tiles): its cell ends well short of the thing */
export const OBSTACLE_SEP = 1.1;
/** the herd's size range by kind (the owner's: 3 to 8 cows, 2 to 4 horses, 6 to 12 sheep), the field's area (square tiles) each animal needs, and
 *  at most this many animals a farm (the paddock's herd plus the sheep) */
export const HERD: Readonly<Record<AnimalKind, readonly [number, number]>> = { cow: [3, 8], horse: [2, 4], sheep: [6, 12] };
export const ANIMAL_AREA = 24;
export const ANIMALS_PER_FARM_MAX = 16;

/** one animal: its art, kind, field (the parcel frame: o + u a + n b; the field shrunk by the margin), home spot, its neighbours' homes and its timing */
export interface FarmAnimal {
  art: number; kind: AnimalKind;
  o: Pt; u: Pt; n: Pt;
  /** the field it keeps to (a0, b0, a1, b1: parcel frame, already shrunk by ANIMAL_MARGIN) */
  f: [number, number, number, number];
  home: [number, number]; r: number;
  /** the other animals' homes and the field's hay bales and bushes (a, b, sep triples): its cell is the part of the field nearer its own home than any of
   *  these by their sep */
  nb: number[];
  seed: number; cycle: number; phase: number; speed: number;
  /** the waypoints of cycles ci - 1, ci, ci + 1 (a cache; ci starts at a cycle no time reaches) */
  ci: number; w: [number, number, number, number, number, number];
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

/** is (x, y) inside the cell of the animal at (hx, hy): nearer it than every other home or thing in nb (a, b, sep) by at least its sep (the distance past the bisector) */
export function inCell(hx: number, hy: number, nb: number[], x: number, y: number): boolean {
  for (let k = 0; k < nb.length; k += 3) {
    const dx = hx - nb[k]!, dy = hy - nb[k + 1]!, d = Math.hypot(dx, dy);
    // the signed distance of the point from the bisector, positive on the animal's own side
    if (((x - (hx + nb[k]!) / 2) * dx + (y - (hy + nb[k + 1]!) / 2) * dy) / d < nb[k + 2]!) return false;
  }
  return true;
}

/** The animals of one farm (deterministic in parcel, seed and the art list): the paddock gets a herd of cows (3-8) or horses (2-4), each other
 *  pasture and, on half the farms, the largest fallow field a flock of sheep (6-12); no more than the field's area allows (one per ANIMAL_AREA square
 *  tiles) and ANIMALS_PER_FARM_MAX in all. arts: the animal art (ANIMALS), each picked by kind; none of a kind: that kind is left out. obstacles: the
 *  farm's hay bales and bushes (world tiles): the animals' homes keep clear of those in their field and their walks keep to their side of them */
export function farmAnimals(p: FarmParcel, seed: number, arts: readonly AnimalArtRef[], model?: FarmModel, fields: AnimalField[] = farmAnimalFields(p, seed, model), obstacles: readonly Pt[] = []): FarmAnimal[] {
  const byKind: Record<AnimalKind, number[]> = { cow: [], horse: [], sheep: [] };
  arts.forEach((a, i) => byKind[animalKind(a.id)].push(i));
  const s0 = h32(seed, 0x7309), out: FarmAnimal[] = [];
  const fallow = fields.filter(q => q.kind === 'fallow').sort((a, b) => (b.a1 - b.a0) * (b.b1 - b.b0) - (a.a1 - a.a0) * (a.b1 - a.b0))[0];
  const grazed = fields.filter(q => q.kind !== 'fallow' || (q === fallow && u01(s0, 1) < 0.5 && !fields.some(z => z.kind === 'pasture')));
  grazed.forEach((q, qi) => {
    const a0 = q.a0 + ANIMAL_MARGIN, b0 = q.b0 + ANIMAL_MARGIN, a1 = q.a1 - ANIMAL_MARGIN, b1 = q.b1 - ANIMAL_MARGIN;
    if (a1 - a0 < 2 || b1 - b0 < 2) return;
    // the hay bales and bushes standing in this field (parcel frame)
    const obs: [number, number][] = [];
    for (const o of obstacles) {
      const dx = o.x - p.o.x, dy = o.y - p.o.y, oa = dx * p.u.x + dy * p.u.y, ob = dx * p.n.x + dy * p.n.y;
      if (oa > q.a0 && oa < q.a1 && ob > q.b0 && ob < q.b1) obs.push([oa, ob]);
    }
    const kind: AnimalKind = q.kind === 'paddock' ? (u01(s0, 2, qi) < 0.6 ? 'cow' : 'horse') : 'sheep';
    const pool = byKind[kind].length ? byKind[kind] : null; if (!pool) return;
    const [lo, hi] = HERD[kind];
    const want = Math.min(lo + Math.floor(u01(s0, 3, qi) * (hi - lo + 1)), Math.floor((q.a1 - q.a0) * (q.b1 - q.b0) / ANIMAL_AREA), ANIMALS_PER_FARM_MAX - out.length);
    if (want < 1) return;
    // (a herd keeps together: the homes round a centre, at least 2.6 tiles apart, a breed or two a herd)
    const ca = a0 + (a1 - a0) * (0.25 + 0.5 * u01(s0, 4, qi)), cb = b0 + (b1 - b0) * (0.25 + 0.5 * u01(s0, 5, qi));
    const breedA = pool[Math.floor(u01(s0, 6, qi) * pool.length)]!, breedB = pool[Math.floor(u01(s0, 7, qi) * pool.length)]!;
    const spread = 2.6 * Math.sqrt(want) * 0.9 + 1, homes: [number, number][] = [];
    for (let j = 0; j < want; j++) {
      for (let t = 0; t < 40; t++) {
        const s = h32(s0, 100 + qi, j * 64 + t), ang = u01(s, 1) * Math.PI * 2, rad = spread * Math.sqrt(u01(s, 2)) * (1 + t / 40);
        const h: [number, number] = [clamp(ca + Math.cos(ang) * rad, a0, a1), clamp(cb + Math.sin(ang) * rad, b0, b1)];
        if (homes.every(g => Math.hypot(g[0] - h[0], g[1] - h[1]) >= 2.6) && obs.every(g => Math.hypot(g[0] - h[0], g[1] - h[1]) >= 2 * OBSTACLE_SEP + 0.2)) { homes.push(h); break; }
      }
    }
    homes.forEach((home, j) => {
      const s = h32(s0, 100 + qi, j), nb: number[] = [];
      homes.forEach((g, k) => { if (k !== j) nb.push(g[0], g[1], ANIMAL_SEP); });
      for (const g of obs) nb.push(g[0], g[1], OBSTACLE_SEP);
      out.push({
        art: u01(s, 3) < 0.7 ? breedA : breedB, kind, o: p.o, u: p.u, n: p.n, f: [a0, b0, a1, b1], home, r: ANIMAL_WANDER[kind], nb,
        seed: s, cycle: 30 + 25 * u01(s, 4), phase: u01(s, 5) * 1000, speed: ANIMAL_SPEED[kind] * (0.85 + 0.3 * u01(s, 6)),
        ci: -1e9, w: [0, 0, 0, 0, 0, 0],
      });
    });
  });
  return out;
}

/** the i-th waypoint of an animal (parcel frame): a point round its home, inside its field and its cell (the home itself, if six tries miss) */
export function waypoint(a: FarmAnimal, i: number): [number, number] {
  for (let t = 0; t < 6; t++) {
    const ang = u01(a.seed, i, 11 + 2 * t) * Math.PI * 2, d = a.r * Math.sqrt(u01(a.seed, i, 12 + 2 * t));
    const x = clamp(a.home[0] + Math.cos(ang) * d, a.f[0], a.f[2]), y = clamp(a.home[1] + Math.sin(ang) * d, a.f[1], a.f[3]);
    if (inCell(a.home[0], a.home[1], a.nb, x, y)) return [x, y];
  }
  return [a.home[0], a.home[1]];
}
/** the waypoints of cycles i - 1, i and i + 1, from the cache when the cycle is the same or the next */
function waypoints(a: FarmAnimal, i: number): [number, number, number, number, number, number] {
  if (a.ci === i) return a.w;
  const w = a.w;
  if (a.ci === i - 1) { w[0] = w[2]; w[1] = w[3]; w[2] = w[4]; w[3] = w[5]; const q = waypoint(a, i + 1); w[4] = q[0]; w[5] = q[1]; }
  else { const p = waypoint(a, i - 1), c = waypoint(a, i), q = waypoint(a, i + 1); w[0] = p[0]; w[1] = p[1]; w[2] = c[0]; w[3] = c[1]; w[4] = q[0]; w[5] = q[1]; }
  a.ci = i; return w;
}
const toWorld = (a: FarmAnimal, pa: number, pb: number, out: { x: number; y: number }) => { out.x = a.o.x + a.u.x * pa + a.n.x * pb; out.y = a.o.y + a.u.y * pa + a.n.y * pb; };
const headingOf = (a: FarmAnimal, da0: number, db0: number, da1: number, db1: number) => {
  const da = da1 - da0, db = db1 - db0;
  return animalHeading(a.u.x * da + a.n.x * db, a.u.y * da + a.n.y * db);
};

/** where an animal is and what it shows at time t (seconds). Its life is a chain of cycles: in cycle i it lifts its head at waypoint i (lookup),
 *  now and then stands looking round, walks to waypoint i + 1, puts its head down and grazes there for the rest of the cycle */
export function animalAt(a: FarmAnimal, t: number, out: AnimalView): AnimalView {
  const T = t + a.phase, i = Math.floor(T / a.cycle), tau = T - i * a.cycle;
  const w = waypoints(a, i), dist = Math.hypot(w[4] - w[2], w[5] - w[3]);
  const up = 3 * LOOKUP_FRAME_S, stand = u01(a.seed, i, 13) < 0.35 ? 2 + 4 * u01(a.seed, i, 14) : 0;
  const walk = Math.min(dist / a.speed, a.cycle - 2 * up - stand - 4), step = WALK_FRAME_S[a.kind];
  out.art = a.art; out.moving = false;
  if (tau < up + stand) {
    // the head comes up at waypoint i, facing as it walked there; then it stands looking round
    toWorld(a, w[2], w[3], out); out.row = headingOf(a, w[0], w[1], w[2], w[3]);
    out.frame = ANIMAL_LOOKUP + Math.min(2, Math.floor(tau / LOOKUP_FRAME_S));
  } else if (tau < up + stand + walk) {
    const s = tau - up - stand, k = walk > 0 ? s / walk : 1;
    toWorld(a, w[2] + (w[4] - w[2]) * k, w[3] + (w[5] - w[3]) * k, out); out.row = headingOf(a, w[2], w[3], w[4], w[5]);
    out.frame = ANIMAL_WALK + Math.floor(s / step) % 8; out.moving = true;
  } else {
    const g = tau - up - stand - Math.max(0, walk);
    toWorld(a, w[4], w[5], out); out.row = headingOf(a, w[2], w[3], w[4], w[5]);
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
