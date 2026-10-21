// The Lot Composer (Phase 3 step 5c): a deterministic, lived-in layout for one lot from its use, level, decline and seed.
// Pure TS, no DOM. The lot frame: a point (a, b) is o + u*a + n*b in tiles; the road is at b < 0 and the front edge at b = 0.
// Pieces are placed by footprint centre in the lot frame. done() keeps a candidate only if it lies in the lot, stands on no
// drive or walk (cars excepted), and does not overlap an earlier upright by more than 35% of the smaller footprint.
// Facing: sprites face +Y (unflipped) or +X (flipped); on -Y/-X lots the rear views are used.
import { LIBRARY } from '../library';
import type { LibItem } from '../types';
import type { LotPatch } from '../ground-protocol';
import { mulberry } from '../iso';
import type { Lot } from './lots';
/** the lot geometry compose reads (a LotView or a Lot) */
export type LotGeom = Pick<Lot, 'o' | 'u' | 'n' | 'w' | 'd'>;
import { LU, LV } from './town';
import { OWNER_SCALE } from './scales';
import { LOT_DECALS } from '../lot-decals';
import { parkedCar } from '../traffic';
import { CAR_SCALE, carFootprint, carHeading } from '../ext/car-art';

export interface Placed { id: string; x: number; y: number; flip: boolean; scale: number }
export interface Composition { props: Placed[]; ground: LotPatch[] }
/** the lot state a composition depends on (the seed is the lot's own) */
export interface ComposeState { use: number; level: number; decline: number; seed: number }

type Pt = { x: number; y: number };
type Box4 = [number, number, number, number];
/** a placed candidate: the anchor (ground point) and its footprint in world tiles */
interface Item { id: string; x: number; y: number; flip: boolean; s: number; fp: Box4; car: boolean; wheel: boolean; fence: boolean; boundary: boolean; street: boolean; plant: boolean }
/** a sprite at a size and orientation: its footprint relative to the anchor */
interface Spec { id: string; s: number; flip: boolean; h: Box4 }
interface Opt { flip?: boolean; mul?: number; street?: boolean; plant?: boolean; boundary?: boolean }
interface Patch { kind: 'drive' | 'walk' | 'lot' | 'yard' | 'bed'; tex: LotPatch['tex']; quad: number[]; lines?: number[] }
interface Pair { x: string; y: string }

/** the flat ground decals by group (lot-decals.ts): index lists */
const MARKS: Record<string, number[]> = {};
LOT_DECALS.forEach((d, i) => (MARKS[d.group] ??= []).push(i));
const MARK_ID = new Map(LOT_DECALS.map((d, i) => [d.id, i]));
/** the generated leaf drifts (gen:drift-*) are painted as heaps of big leaves: drawn at full size each leaf came out as big as a car (the owner, 2026-10-20), so they are drawn at this share of their size */
const DRIFT_K = 0.35;
/** the tolerances: an item may reach this far past the lot (street items: into the verge), and touching is not overlap */
const REACH = 0.3, VERGE = 1.2, EPS = 0.02;
/** the largest share of the smaller footprint two uprights may share */
const OVERLAP = 0.35;
/** the car park's bay pitch and depth, tiles (the depth is 5.5 m); the wheel stop id */
const BAY = 2, BAY_DEPTH = 2.75, WHEEL = 'expansion:wheel-stop';
/** the two-way aisle between the bay rows, the entrance drive's width (two lanes), a wheel stop's inset from a bay's outer edge, a nosed-in car's gap to its stop */
/** NOSE: a parked car's centre this far short of its wheel stop: half the car (1.8 tiles: 4.5 m at CAR_SCALE) and a 0.15-tile gap, so its nose stops just short of the stop */
const AISLE = 2.6, DRIVE_W = 2.6, STOP_IN = 0.35, NOSE = 1.05;
/** the house band: the gap between the drive and the house (or its garage), and the side yard on the far side from the drive (tiles) */
const DRIVE_GAP = 0.5, SIDE_YARD = 1.4;

const BY = new Map<string, LibItem>(LIBRARY.map(i => [i.id, i]));
const names = (ids: string[]) => ids.filter(id => BY.has(id));
const cat = (f: (i: LibItem) => boolean) => LIBRARY.filter(f).map(i => i.id);
/** the footprint of a sprite at scale s, relative to its anchor (the union of its boxes, as the engine draws it) */
function boxOf(id: string, s: number, flip: boolean): Box4 {
  const it = BY.get(id)!;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of it.boxes) {
    const hx = (flip ? b.hy : b.hx) * s / 2, hy = (flip ? b.hx : b.hy) * s / 2, dx = (flip ? b.dy : b.dx) * s / 2, dy = (flip ? b.dx : b.dy) * s / 2;
    x0 = Math.min(x0, dx - hx); x1 = Math.max(x1, dx + hx); y0 = Math.min(y0, dy - hy); y1 = Math.max(y1, dy + hy);
  }
  return [x0, y0, x1, y1];
}
/** a seeded pick; '' from an empty list (put() ignores unknown ids) */
const pick = (r: () => number, a: string[]): string => a[Math.floor(r() * a.length)] ?? '';
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

const HOUSE_FRONT = cat(i => i.cat === 'Houses' && i.kind === 'house');
const HOUSE_REAR = names(['expansion:ranch-rear', 'expansion:cottage-rear', 'expansion:dormer-rear', 'expansion:duplex-rear', 'expansion:victorian-rear']);
const HOUSE_RUNDOWN = names(['expansion:rundown-house']);
const GARAGE_FRONT = names(['static:garage_timber', 'static:garage_brick', 'static:garage_brick-v2']);
const GARAGE_REAR = names(['expansion:garage-rear']);
const TREES = cat(i => i.kind === 'tree' && !/dead/.test(i.id));
const BUSHES = cat(i => i.kind === 'bush');
/** ids with their plain variations in the library ('town:bakery' -> 'variation:town-bakery-<hash>-plain:1'), the ones the game has */
const withVariations = (ids: string[]) => { const base = names(ids); return base.concat([...BY.keys()].filter(k => base.some(b => k.startsWith(`variation:${b.replace(':', '-')}-`)))); };
/** every front-facing shop the game has, with its variations (the street fronts deal from it, see com) */
const SHOP_FRONT = withVariations(['town:bakery', 'town:grocery', 'town:pharmacy', 'town:laundromat', 'town:fish_tackle', 'town:barber', 'town:hardware', 'world:video_rental', 'world:video',
  'ref:building-grocery', 'ref:building-corner-shop', 'ref:building-corner-store']);
const SHOP_REAR = withVariations(['static:shop_brick_rear', 'static:shop_brick_rear-v2', 'static:shop_market_rear', 'static:shop_market_rear-v2']);
const BOARDED = names(['expansion:boarded-store-rear', 'expansion:derelict-two-storey']);
const VENUE = withVariations(['world:diner', 'world:arcade', 'world:snack_bar', 'ref:building-gas-canopy']);
const CIVIC = names(['town:firestation', 'town:postoffice', 'world:primary_school', 'world:church', 'world:school']);
const SHED = names(['ref:building-farm-shed', 'expansion:abandoned-workshop']);
const BARN = names(['world:barn']);
/** cars with a facing letter in the name (n = -Y, s = +Y, e = +X, w = -X) */
const CARS = cat(i => i.cat === 'Vehicles' && /_[news](-v2)?$/.test(i.id));
const PICKUPS = CARS.filter(id => /pickup|van/.test(id));
const FACE: Record<string, Pt> = { n: { x: 0, y: -1 }, s: { x: 0, y: 1 }, e: { x: 1, y: 0 }, w: { x: -1, y: 0 } };
/** the car art's direction (0 +x, 1 +y, 2 -x, 3 -y) of the axis a lot-frame vector points along */
const dirOf = (v: Pt) => (Math.abs(v.x) > Math.abs(v.y) ? (v.x > 0 ? 0 : 2) : (v.y > 0 ? 1 : 3));
const JUNK = names(['expansion:junk-car', 'expansion:appliance-pile', 'expansion:scrap-metal', 'expansion:tyre-stack', 'expansion:oil-drums', 'expansion:concrete-rubble']);
const SCRAP = names(['expansion:scrap-engine', 'expansion:tyre-stack', 'expansion:yard-workbench', 'expansion:air-compressor']);
const CLUTTER = names(['expansion:pallet-stack', 'expansion:cable-spool', 'expansion:cement-bags', 'expansion:concrete-rubble', 'expansion:tyre-stack', 'expansion:scrap-metal', 'expansion:oil-drums', 'expansion:lumber-bundle', 'expansion:appliance-pile']);
const TRAILERS = names(['expansion:camper', 'expansion:boxcar', 'expansion:boat-trailer', 'expansion:utility-trailer', 'expansion:lean-to-shed']);
const PRIVACY: Pair = { x: 'expansion:fence-privacy-x', y: 'expansion:fence-privacy-y' };
const CHAIN: Pair = { x: 'expansion:chainlink-x', y: 'expansion:chainlink-y' };
/** flower beds (the soft plants), porch pumpkins, and the bigger Halloween yard pieces (Maple Falls in October) */
const FLOWERS = names(['town:hydrangea', 'town:fern', 'town:ornamental_grass', 'ref:halloween-mums']);
const PUMPKINS = names(['world:pumpkin_0', 'world:pumpkin_1']);
const SPOOKY = names(['ref:halloween-hay-bales', 'ref:halloween-pumpkin-cluster', 'gen:inflatable-pumpkin', 'ref:halloween-sheet-ghost', 'world:scarecrow', 'expansion:blowmold-ghost', 'expansion:yard-spider', 'expansion:yard-coffin', 'ref:halloween-witch-sign', 'ref:halloween-lantern', 'world:grave_0', 'world:grave_1', 'world:grave_2']);
/** the school and pedestrian signs (TrickOrTreat road sign set) for the kerb by a civic building */
const SCHOOL_SIGNS = cat(i => /^variation:sign-pedestrians-school-/.test(i.id));
const DEAD_TREES = names(['world:tree_dead_0', 'world:tree_dead_1', 'world:tree_dead_2']);
/** the props each household story adds to the back yard (one of each, in this order, as they fit) */
const STORY_KIT: Record<string, string[]> = {
  family: names(['expansion:sandbox', 'expansion:kiddie-pool', 'expansion:tricycle', 'expansion:wagon', 'expansion:washing-line']),
  retired: names(['expansion:glasshouse', 'expansion:rain-barrel', 'expansion:compost-bin', 'expansion:garden-pump', 'expansion:patio-swing']),
  worker: names(['expansion:woodpile', 'expansion:rideon-mower', 'expansion:canoe', 'expansion:lawn-roller', 'expansion:washing-line']),
  party: names(['expansion:firepit', 'expansion:hot-tub', 'expansion:camping-cooler', 'expansion:brick-barbecue']),
  mechanic: names(['expansion:motorcycle-front', 'expansion:rototiller', 'expansion:oil-drums']),
  neglected: names(['expansion:attic-trunk', 'expansion:antique-pram', 'expansion:crt-curb', 'expansion:outhouse']),
};

/** does an axis-aligned footprint overlap a convex quad (8 numbers, corners in order); touching is not overlap */
function hit(fp: Box4, q: number[]): boolean {
  const axes: Pt[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }];
  for (let k = 0; k < 4; k++) { const j = (k + 1) % 4; axes.push({ x: -(q[2 * j + 1] - q[2 * k + 1]), y: q[2 * j] - q[2 * k] }); }
  const fx = [fp[0], fp[2], fp[2], fp[0]], fy = [fp[1], fp[1], fp[3], fp[3]];
  for (const ax of axes) {
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (let k = 0; k < 4; k++) {
      const pa = fx[k] * ax.x + fy[k] * ax.y, pb = q[2 * k] * ax.x + q[2 * k + 1] * ax.y;
      a0 = Math.min(a0, pa); a1 = Math.max(a1, pa); b0 = Math.min(b0, pb); b1 = Math.max(b1, pb);
    }
    if (a1 <= b0 + EPS || b1 <= a0 + EPS) return false;
  }
  return true;
}
/** the share of the smaller footprint two axis-aligned footprints share */
function share(p: Box4, q: Box4): number {
  const ix = Math.min(p[2], q[2]) - Math.max(p[0], q[0]), iy = Math.min(p[3], q[3]) - Math.max(p[1], q[1]);
  if (ix <= EPS || iy <= EPS) return 0;
  const sp = (p[2] - p[0]) * (p[3] - p[1]), sq = (q[2] - q[0]) * (q[3] - q[1]);
  return ix * iy / Math.min(sp, sq);
}
/** a seed from the lot's seed and state */
function mix(...v: number[]): number { let h = 0x811c9dc5; for (const x of v) h = Math.imul(h ^ (x >>> 0), 16777619); return h >>> 0; }

/** The composition of one lot: the candidates (in priority order), the drive/walk/car park patches, and done(). */
class Build {
  readonly o: Pt; readonly u: Pt; readonly n: Pt; readonly W: number; readonly D: number;
  /** the facing: flipped (+X) or not (+Y), rear views (-Y, -X) when the road is behind the lot's far side */
  readonly flip: boolean; readonly rear: boolean;
  /** the road direction from the lot (-n) */
  readonly F: Pt;
  readonly items: Item[] = []; readonly patches: Patch[] = [];
  /** flat ground decals: index, x, y (world tiles), scale (negative: mirrored), alpha */
  readonly marks: number[] = [];
  /** no cars at all (derelict); the upright cap for plants (the rest are kept) */
  noCars = false; cap = 28;
  readonly r: () => number;

  constructor(lot: LotGeom, r: () => number) {
    this.o = lot.o; this.u = lot.u; this.n = lot.n; this.W = lot.w; this.D = lot.d; this.r = r;
    const rx = -lot.n.x, ry = -lot.n.y;
    this.flip = Math.abs(rx) > Math.abs(ry);
    this.rear = this.flip ? rx < 0 : ry < 0;
    this.F = { x: rx, y: ry };
  }
  /** the world point of a lot-frame point */
  P(a: number, b: number): Pt { return { x: this.o.x + this.u.x * a + this.n.x * b, y: this.o.y + this.u.y * a + this.n.y * b }; }
  /** a sprite at a seeded size (owner scale times mul, varied by 5%) with its footprint: the union of its boxes, as the engine draws it */
  spec(id: string, o: Opt = {}): Spec | null {
    if (!BY.has(id)) return null;
    // cars at 1: the engine draws a parked car at CAR_SCALE (its footprint too), the size of the cars on the road
    const flip = !!o.flip, car = BY.get(id)!.cat === 'Vehicles', s = car ? 1 : (OWNER_SCALE[id] ?? 1) * (o.mul ?? 1) * (1 + 0.05 * (2 * this.r() - 1));
    return { id, s, flip, h: boxOf(id, car ? CAR_SCALE : s, flip) };
  }
  /** the half extent of a spec along the lot's u (ea) and n (eb) */
  ea(g: Spec): number { return (Math.abs(this.u.x) * (g.h[2] - g.h[0]) + Math.abs(this.u.y) * (g.h[3] - g.h[1])) / 2; }
  eb(g: Spec): number { return (Math.abs(this.n.x) * (g.h[2] - g.h[0]) + Math.abs(this.n.y) * (g.h[3] - g.h[1])) / 2; }
  /** the full footprint extents of a sprite along the lot's u and n at the owner's scale (no draw), to choose what fits */
  fit(id: string, flip: boolean): [number, number] {
    const h = boxOf(id, OWNER_SCALE[id] ?? 1, flip), w = h[2] - h[0], d = h[3] - h[1];
    return [Math.abs(this.u.x) * w + Math.abs(this.u.y) * d, Math.abs(this.n.x) * w + Math.abs(this.n.y) * d];
  }
  /** a spec with its footprint centre at a world point */
  atW(g: Spec | null, c: Pt, o: Opt = {}): Item | null {
    if (!g) return null;
    const it = BY.get(g.id)!, h = g.h, x = c.x - (h[0] + h[2]) / 2, y = c.y - (h[1] + h[3]) / 2;
    const item: Item = { id: g.id, x, y, flip: g.flip, s: g.s, fp: [x + h[0], y + h[1], x + h[2], y + h[3]], car: it.cat === 'Vehicles', wheel: g.id === WHEEL, fence: it.kind === 'fencex' || it.kind === 'fencey' || g.id === 'world:hedge', boundary: !!o.boundary, street: !!o.street, plant: !!o.plant };
    this.items.push(item); return item;
  }
  /** a spec with its footprint centre at a lot-frame point (a along u, b along n) */
  at(g: Spec | null, a: number, b: number, o: Opt = {}): Item | null { return this.atW(g, this.P(a, b), o); }
  /** one sprite, footprint centre at a lot-frame point */
  put(id: string, a: number, b: number, o: Opt = {}): Item | null { return this.at(this.spec(id, o), a, b, o); }
  /** a straight run of fence or hedge segments end to end from (a0, b0) to (a1, b1); the sprite axis follows the run;
   *  segments whose centre falls in gap (fractions of the run) are left out */
  run(kind: Pair, a0: number, b0: number, a1: number, b1: number, gap?: [number, number], drop = 0) {
    const p0 = this.P(a0, b0), p1 = this.P(a1, b1), dx = p1.x - p0.x, dy = p1.y - p0.y, L = Math.hypot(dx, dy);
    if (L < 1e-6) return;
    const g = this.spec(Math.abs(dx) >= Math.abs(dy) ? kind.x : kind.y);
    if (!g) return;
    const ax = Math.abs(dx) >= Math.abs(dy), step = ax ? g.h[2] - g.h[0] : g.h[3] - g.h[1];
    if (step <= 0) return;
    const n = Math.floor(L / step + 1e-9), left = (L - n * step) / 2;
    for (let i = 0; i < n; i++) {
      const t = (left + (i + 0.5) * step) / L;
      if (gap && t >= gap[0] && t <= gap[1]) continue;
      if (drop && this.r() < drop) continue;
      this.atW(g, { x: p0.x + dx * t, y: p0.y + dy * t });
    }
  }
  /** a boundary run in tiles: 4 m panels at a constant height; the final panel meets the endpoint with a small seam overlap */
  boundaryRun(kind: Pair, a0: number, b0: number, a1: number, b1: number) {
    const p0 = this.P(a0, b0), p1 = this.P(a1, b1), dx = p1.x - p0.x, dy = p1.y - p0.y, L = Math.hypot(dx, dy);
    const ax = Math.abs(dx) >= Math.abs(dy), id = ax ? kind.x : kind.y;
    if (L < 1e-6 || !BY.has(id)) return;
    const h = boxOf(id, 1, false), span = ax ? h[2] - h[0] : h[3] - h[1];
    if (span <= 0) return;
    const size = Math.min(2, L), s = size / span, count = Math.ceil(L / size - 1e-9), hs = boxOf(id, s, false);
    // the panel's footprint lies wholly on the line's higher-coordinate side (a few cm: the board is 0.1 tiles thick): the painter (sprites.ts
    // isBehind) then sorts the lot behind the line (a baked lot picture is one prop over its whole lot) before the fence, and the lot in front
    // after it. A footprint straddling the line overlapped both lots and the lot behind could sort after it, painting its bushes and decals
    // over the boards
    const ox = ax ? 0 : (hs[2] - hs[0]) / 2 + 0.01, oy = ax ? (hs[3] - hs[1]) / 2 + 0.01 : 0;
    for (let i = 0; i < count; i++) {
      const start = Math.min(i * size, L - size), t = (start + size / 2) / L;
      this.atW({ id, s, flip: false, h: hs }, { x: p0.x + dx * t + ox, y: p0.y + dy * t + oy }, { boundary: true });
    }
  }
  /** a fence on all four sides, inset by e: the front in kind f (with the gap, fractions of the width), the sides and back in kind k;
   *  drives, walks and car parks cut their own gaps (done() drops fence panels that stand on them) */
  ring(f: Pair, k: Pair, e: number, gap?: [number, number], drop = 0) {
    const { W, D } = this;
    this.run(f, 0, e, W, e, gap, drop);
    this.run(k, e, e, e, D - e, undefined, drop); this.run(k, W - e, e, W - e, D - e, undefined, drop);
    this.run(k, 0, D - e, W, D - e, undefined, drop);
  }
  /** a vegetable bed (lot-frame rectangle; keep it clear of the house, it bars uprights): a field patch with furrows every half tile along u */
  bed(a0: number, b0: number, a1: number, b1: number) {
    const A0 = clamp(a0, 0, this.W), A1 = clamp(a1, 0, this.W), B0 = clamp(b0, 0, this.D), B1 = clamp(b1, 0, this.D);
    if (A1 - A0 < 1 || B1 - B0 < 1) return;
    const lines: number[] = [];
    for (let b = B0 + 0.25; b < B1 - 0.1; b += 0.5) { const p = this.P(A0 + 0.15, b), q = this.P(A1 - 0.15, b); lines.push(p.x, p.y, q.x, q.y); }
    this.patches.push({ kind: 'bed', tex: 'field', quad: this.quad(A0, B0, A1, B1), lines });
  }
  /** a flat decal from a group (or one id) centred at a lot-frame point, at 0.8-1.2x, mirrored at random, 70-100% opaque */
  mark(group: string, a: number, b: number, size = 1) {
    const list = MARKS[group] ?? (MARK_ID.has(group) ? [MARK_ID.get(group)!] : []);
    if (!list.length) return;
    const i = list[Math.floor(this.r() * list.length)], p = this.P(clamp(a, 0.4, this.W - 0.4), clamp(b, 0.4, this.D - 0.4)), s = size * (0.8 + 0.4 * this.r()) * (LOT_DECALS[i]!.id.startsWith('gen:drift-') ? DRIFT_K : 1);
    this.marks.push(i, +p.x.toFixed(3), +p.y.toFixed(3), +(this.r() < 0.5 ? -s : s).toFixed(3), +(0.7 + 0.3 * this.r()).toFixed(2));
  }
  /** n decals from a group at seeded points of a lot-frame rectangle */
  marksIn(group: string, a0: number, b0: number, a1: number, b1: number, n: number, size = 1) { for (let i = 0; i < n; i++) this.mark(group, a0 + (a1 - a0) * this.r(), b0 + (b1 - b0) * this.r(), size); }
  /** a ground patch over the lot-frame rectangle (clamped to the lot) */
  pave(kind: Patch['kind'], a0: number, b0: number, a1: number, b1: number, tex: LotPatch['tex']) {
    const A0 = clamp(a0, 0, this.W), A1 = clamp(a1, 0, this.W), B0 = clamp(b0, 0, this.D), B1 = clamp(b1, 0, this.D);
    if (A1 - A0 < 0.05 || B1 - B0 < 0.05) return;
    this.patches.push({ kind, tex, quad: this.quad(A0, B0, A1, B1) });
  }
  quad(a0: number, b0: number, a1: number, b1: number): number[] {
    return [this.P(a0, b0), this.P(a1, b0), this.P(a1, b1), this.P(a0, b1)].flatMap(p => [p.x, p.y]);
  }
  /** a car park along the lot front from a0 to a1: bay lines every BAY tiles, BAY_DEPTH deep, a wheel stop at each bay's end,
   *  and a car in about half the bays (seeded) */
  carPark(a0: number, a1: number, b0 = 0) {
    const n = Math.floor((a1 - a0) / BAY + 1e-9);
    if (n < 1) return;
    const lines: number[] = [];
    for (let k = 0; k <= n; k++) { const p = this.P(a0 + k * BAY, b0), q = this.P(a0 + k * BAY, b0 + BAY_DEPTH); lines.push(p.x, p.y, q.x, q.y); }
    this.patches.push({ kind: 'lot', tex: 'asphalt', quad: this.quad(a0, b0, a0 + n * BAY, b0 + BAY_DEPTH), lines });
    const flip = Math.abs(this.u.x) < Math.abs(this.u.y);
    for (let k = 0; k < n; k++) {
      const a = a0 + k * BAY + BAY / 2;
      this.put(WHEEL, a, b0 + BAY_DEPTH - 0.4, { flip });
      if (this.r() < 0.5) this.parked(a, b0 + 0.3 + this.carLen(false) / 2, false, k % 2);
    }
  }
  /** a car (or pickup) facing the road best, from a pool, with its near edge at b0 along the lot's n (the old static art: the pickups) */
  vehicle(pool: string[], a: number, b0: number): { it: Item; span: number } | null {
    if (this.noCars || !pool.length) return null;
    let best = -2; const ties: string[] = [];
    for (const id of pool) {
      const m = /_([news])(-v2)?$/.exec(id); if (!m) continue;
      const f = FACE[m[1]], d = f.x * this.F.x + f.y * this.F.y;
      if (d > best + 1e-9) { best = d; ties.length = 0; ties.push(id); } else if (d > best - 1e-9) ties.push(id);
    }
    const g = this.spec(pick(this.r, ties), {});
    if (!g) return null;
    const span = 2 * this.eb(g), it = this.at(g, a, b0 + span / 2, { plant: false });
    return it ? { it, span } : null;
  }
  /** the length of a parked car along the lot's n: its eight-way art's footprint at CAR_SCALE, nosed away from the road (away) or towards it */
  carLen(away: boolean): number {
    const q = carFootprint(carHeading(dirOf(away ? this.n : this.F) * Math.PI / 2));
    return 2 * (Math.abs(this.n.x) * q.hx + Math.abs(this.n.y) * q.hy) * CAR_SCALE / 2;
  }
  /** a parked car from the eight-way art (the car parks' cars, as the engine draws them): model 0 or 1, its footprint centre at lot-frame (a, c),
   *  nosed away from the road (away: its heading is +n) or towards it. Props of kind car are drawn at CAR_SCALE by the engine, so the prop is at scale 1. */
  parked(a: number, c: number, away: boolean, type: number): Item | null {
    if (this.noCars) return null;
    const dir = dirOf(away ? this.n : this.F), f = parkedCar(type, dir), id = LIBRARY[f.item]!.id;
    // the art's anchor offsets are zero (its boxes are centred), so the anchor is the footprint centre, as client.ts visible() places a moving car
    const q = carFootprint(carHeading(dir * Math.PI / 2)), k = CAR_SCALE / 2, h: Box4 = [-q.hx * k, -q.hy * k, q.hx * k, q.hy * k];
    return this.atW({ id, s: 1, flip: false, h }, this.P(a, c), { plant: false });
  }
  /** n sprites from a pool at seeded points of a lot-frame rectangle */
  scatter(pool: string[], a0: number, b0: number, a1: number, b1: number, n: number, o: Opt = {}) {
    for (let i = 0; i < n && pool.length; i++) this.put(pick(this.r, pool), a0 + (a1 - a0) * this.r(), b0 + (b1 - b0) * this.r(), o);
  }
  /** decline 1+: a third of the plants go */
  thin(f: number) { for (let i = this.items.length - 1; i >= 0; i--) if (this.items[i].plant && this.r() < f) this.items.splice(i, 1); }
  /** drops the boundary panels that stand on a drive (a drive's mouth and the run beside it stay open) */
  clearDrives() {
    for (let i = this.items.length - 1; i >= 0; i--) { const it = this.items[i]!; if (it.boundary && this.patches.some(p => p.kind === 'drive' && hit(it.fp, p.quad))) this.items.splice(i, 1); }
  }
  /** is the footprint inside the lot (REACH past the sides and the back, VERGE into the front for street items) */
  inside(it: Item): boolean {
    const [x0, y0, x1, y1] = it.fp, minB = it.street ? -VERGE : -REACH;
    for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) {
      const dx = x - this.o.x, dy = y - this.o.y, a = dx * this.u.x + dy * this.u.y, b = dx * this.n.x + dy * this.n.y;
      if (a < -REACH || a > this.W + REACH || b < minB || b > this.D + REACH) return false;
    }
    return true;
  }
  /** does it stand on a drive or walk (cars on drives and car parks, and wheel stops on car parks, excepted) */
  onPatch(it: Item): boolean {
    for (const p of this.patches) {
      if (p.kind === 'yard') continue;
      if (p.kind === 'drive' && it.car) continue;
      if (p.kind === 'lot' && (it.car || it.wheel)) continue;
      if (hit(it.fp, p.quad)) return true;
    }
    return false;
  }
  /** the composition: candidates in order, the first that fits wins; plants stop at the cap */
  done(): Composition {
    const props: Placed[] = [], acc: Item[] = []; let ups = 0;
    for (const it of this.items) {
      // Shared boundary panels remain on their surveyed line even when a driveway reaches the lot edge.
      if (!this.inside(it) || (!it.boundary && this.onPatch(it))) continue;
      // two cars never share ground (a car is kept only if it shares none with an earlier car)
      if (it.car && acc.some(a => a.car && share(a.fp, it.fp) > 0)) continue;
      if (!it.fence && !it.wheel) {
        if (it.plant && ups >= this.cap) continue;
        if (acc.some(a => !a.fence && !a.wheel && share(a.fp, it.fp) > OVERLAP)) continue;
        ups++;
      }
      acc.push(it); props.push({ id: it.id, x: it.x, y: it.y, flip: it.flip, scale: it.s });
    }
    const ground: LotPatch[] = this.patches.map(p => (p.lines ? { pts: p.quad, tex: p.tex, lines: p.lines } : { pts: p.quad, tex: p.tex }));
    // the decals last, bounded by the lot grown 2 tiles (a decal is up to 4 m across)
    if (this.marks.length) ground.push({ pts: this.quad(-2, -2, this.W + 2, this.D + 2), tex: 'marks', marks: this.marks });
    return { props, ground };
  }
}

/** a seeded sprite from a pool that fits a lot (full width along u up to maxW, depth up to maxD); the smallest when none does,
 *  shrunk to fit (the owner scale only ever goes down). null for an empty pool. */
function specFit(B: Build, list: string[], maxW: number, maxD: number, o: Opt = {}): Spec | null {
  const pool = list.filter(id => BY.has(id)), area = (id: string) => { const [w, d] = B.fit(id, B.flip); return w * d; };
  const ok = pool.filter(id => { const [w, d] = B.fit(id, B.flip); return w <= maxW && d <= maxD; });
  const cand = ok.length ? ok : pool.length ? [pool.reduce((a, b) => (area(a) <= area(b) ? a : b))] : [];
  const id = pick(B.r, cand);
  if (!id) return null;
  const [w, d] = B.fit(id, B.flip);
  return B.spec(id, { ...o, mul: Math.min(1, maxW / w, maxD / d) });
}

/** the house and its yard: a drive on one side (a garage beside the house when the lot is wide enough), a front walk,
 *  bushes against the house, a story for the yard, fences and the bins at the kerb */
function res(B: Build, st: ComposeState) {
  const { W, D, r, rear, flip } = B, up = st.level === LV.UPGRADED, DW = 1.6;   // DW: the drive's width
  const hs = specFit(B, rear ? HOUSE_REAR : st.decline >= 2 ? HOUSE_RUNDOWN : HOUSE_FRONT, W - DW - DRIVE_GAP - SIDE_YARD, D - 3.5, { flip });
  if (!hs) return;
  const hw = 2 * B.ea(hs), hd = 2 * B.eb(hs);
  const sb = Math.min(3 + 1.5 * r(), Math.max(1.5, D - hd - 2.5));
  const L = r() < 0.5;
  const gs = B.spec(rear ? pick(r, GARAGE_REAR) : pick(r, GARAGE_FRONT), { flip });
  const gw = gs ? 2 * B.ea(gs) : 0, gd = gs ? 2 * B.eb(gs) : 0;
  // the house band: beside the drive (L: the drive is at a = 0), a gap from the drive and the side yard on the far side; the garage between them when it fits
  const bA0 = L ? DW + DRIVE_GAP : SIDE_YARD, bA1 = L ? W - SIDE_YARD : W - DW - DRIVE_GAP;
  const garage = !!gs && bA1 - bA0 - gw >= hw + 0.2 && r() < 0.8;
  let hA0 = bA0, hA1 = bA1, gA0 = 0, gA1 = 0;
  if (garage) { if (L) { gA0 = bA0; gA1 = bA0 + gw; hA0 = gA1; } else { gA1 = bA1; gA0 = gA1 - gw; hA1 = gA0; } }
  const ca = (hA0 + hA1) / 2;
  B.at(hs, ca, sb + B.eb(hs));
  if (garage && gs) B.at(gs, (gA0 + gA1) / 2, sb + 1 + B.eb(gs));
  const dA0 = L ? 0 : W - DW, dA1 = dA0 + DW, dB = garage ? sb + 1 + gd : sb + hd;
  B.pave('drive', dA0, 0, dA1, dB, 'paving');
  B.pave('walk', ca - 0.3, 0, ca + 0.3, sb, 'paving');
  const story = ['family', 'retired', 'worker', 'party', 'mechanic', 'neglected'][Math.floor(r() * 6)];
  // the cars in the drive (none for neglected: a junk car in the yard instead): one, and a second of the other model for a worker's story or an
  // upgraded lot, only if it fits fully on the drive. A worker's first car is the old pickup (the eight-way pack has none). model: 0 or 1 of the pack, 2 the pickup
  let slot = 0.4, model = -1;
  const put = (type: number, end: number): boolean => {
    const len = B.carLen(false);
    if (slot + len > end || !B.parked(dA0 + DW / 2, slot + len / 2, false, type)) return false;
    slot += len + 1.2; return true;
  };
  if (story !== 'neglected') {
    if (story === 'worker') { const v = B.vehicle(PICKUPS, dA0 + DW / 2, slot); if (v) { model = 2; slot += v.span + 1.2; } }
    else { const t = Math.floor(r() * 2); if (put(t, Infinity)) model = t; }
    if ((story === 'worker' || up) && model >= 0) put(model === 2 ? Math.floor(r() * 2) : 1 - model, dB - 0.3);
  }
  const bk = sb + hd + 1, neg = story === 'neglected';   // the back yard starts behind the house
  // the porch: pumpkins either side of the walk (most houses: it is October), and for some a Halloween display in the front yard
  if (story !== 'neglected' && r() < 0.8) for (const sx of [-1, 1]) if (r() < 0.8) B.put(pick(r, PUMPKINS), ca + sx * (0.75 + 0.3 * r()), sb - 0.45);
  if (story !== 'neglected' && r() < 0.35) B.scatter(SPOOKY, 0.9, 1.0, W - 0.9, Math.max(1.2, sb - 1.2), 2 + Math.floor(r() * 2));
  if (story === 'family') {
    B.put('expansion:trampoline', W / 2, bk + 2.2);
    if (W >= 11) B.put('gen:back-swingset', W - 3, D - 3.2);
    B.put('expansion:doghouse', 1.4, D - 2.4);
    B.put('gen:kids-bikes', ca + 1.2, 1.4);
    B.put('expansion:basketball-hoop', dA1 + 0.3, sb - 0.8);
  } else if (story === 'retired') {
    B.put('expansion:birdhouse-post', 1.0, bk + 1.5);
    B.put('world:bench', W / 2, bk + 1.2);
    B.bed(1.2, Math.max(bk + 0.4, D - 3.6), Math.min(W - 1.2, 5.2), D - 1.4);
  } else if (story === 'party') {
    if (up || r() < 0.7) B.put('expansion:aboveground-pool', W / 2, bk + 2.5);
    B.put('expansion:barbecue', W - 1.4, bk + 1.2);
    B.put('expansion:lawn-chair', W / 2 + 1.6, bk + 0.8);
    B.put('gen:cooler-lawnchairs', W / 2 - 1.6, bk + 0.8);
  } else if (story === 'mechanic') {
    B.scatter(SCRAP, 0.8, bk, W - 0.8, D - 0.8, 4);
  } else if (story === 'neglected') {
    B.put('expansion:junk-car', W / 2, D - 2.6);
    B.put('expansion:appliance-pile', 1.4, bk + 0.8);
    B.put(pick(r, DEAD_TREES), W - 1.4, bk + 1.2, { plant: true });
  } else if (r() < 0.5) B.bed(W - 4.6, Math.max(bk + 0.4, D - 3.4), W - 1.2, D - 1.4);
  // the ground: leaf drifts in the yards (it is autumn), worn grass where the kids and the dog play, an oil stain on the drive,
  // litter and mud when neglected, pinecones and twigs under the trees
  B.marksIn('leaves', 0.8, 0.8, W - 0.8, sb - 0.4, 1 + Math.floor(r() * 2));
  B.marksIn('leaves', 0.8, bk, W - 0.8, D - 0.8, 1 + Math.floor(r() * 2));
  if (story === 'family') { B.mark('worn', W / 2, bk + 2.2, 1.4); B.mark('worn', 1.6, D - 2.0); }
  if (story !== 'retired' && r() < 0.6) B.mark('stain', dA0 + DW / 2, 1.2 + r() * 2, 0.8);
  if (neg) { B.marksIn('litter', 0.8, 0.8, W - 0.8, D - 0.8, 2 + Math.floor(r() * 2)); B.mark('worn', W / 2, D - 2.6, 1.5); B.mark('rubbish', 1.4, bk + 2); }
  if (r() < 0.5) B.mark('woods', r() < 0.5 ? 1.2 : W - 1.2, D - 1.6);
  // the story's own kit along the back yard, then the trees in the back corners and by the side
  const kit = STORY_KIT[story] ?? [];
  kit.forEach((id, i) => B.put(id, 1.4 + ((i + 0.5) / kit.length) * (W - 2.8), bk + 0.9 + r() * Math.max(0.2, D - bk - 2.4)));
  B.put(pick(r, TREES), 0.9, D - 1.2, { plant: true });
  B.put(pick(r, TREES), W - 0.9, D - 1.2, { plant: true });
  if (story !== 'neglected') B.put(pick(r, TREES), W - 0.8, sb + 2.5, { plant: true });
  if (r() < 0.25) B.put('expansion:satellite-dish', ca + hw / 2 + 0.6, bk - 0.4);
  // the kerb by the drive: the bins, the mailbox and (autumn) leaf bags; a hydrant on some lots
  const bx = L ? DW + 0.5 : W - DW - 0.5, sx = L ? 1 : -1;
  B.put('gen:trash-cans-row', bx, -0.35, { street: true });
  B.put('world:mailbox', bx + sx * 0.9, -0.35, { street: true });
  if (r() < 0.5) B.put('expansion:leaf-bags', bx + sx * 2.1, -0.4, { street: true });
  if (r() < 0.15) B.put('world:hydrant', L ? W - 0.6 : 0.6, -0.4, { street: true });
  // plants: a flower bed in the front yard, packed against the house front and sides
  // (neglected yards keep the same lines at half the density, and run to weeds)
  const dense = neg ? 2 : 1;
  B.cap = (neg ? 16 : 24 + Math.floor(r() * 14)) + (up ? 6 : 0);
  if (!neg) for (let a = 0.9; a <= W - 0.9; a += 1.1) B.put(pick(r, FLOWERS), a, 0.8, { plant: true });
  for (let a = ca - hw / 2 - 0.6; a <= ca + hw / 2 + 0.6; a += dense) B.put(pick(r, neg ? BUSHES : FLOWERS.concat(BUSHES)), a, sb - 0.8, { plant: true });
  for (const sx of [-1, 1]) for (let b = sb + 0.8; b <= sb + 2 * hd - 0.5; b += 1.2 * dense) B.put(pick(r, BUSHES), ca + sx * (hw / 2 + 0.7), b, { plant: true });
  // the rest of the back and front yards in beds, last in order: the cap decides how many of these stay
  for (let b = bk + 0.6; b <= D - 1.2; b += 1.4) for (let a = 1.6; a <= W - 1.4; a += 1.4) B.put(pick(r, BUSHES), a, b, { plant: true });
  for (let b = 0.8; b <= sb - 0.6; b += 1.4) for (let a = 0.8; a <= W - 0.8; a += 1.4) B.put(pick(r, BUSHES), a, b, { plant: true });
}

/** the baked house lots (scripts/assets/lot-variants.mjs) by size and facing: 'w x d front|rear' -> [normal ids, neglected ids] */
const BAKED = new Map<string, [string[], string[]]>();
for (const it of LIBRARY) {
  const m = /^lot:(\d+)x(\d+)-(front|rear)-\d+$/.exec(it.id); if (!m) continue;
  const k = `${m[1]}x${m[2]} ${m[3]}`; let e = BAKED.get(k); if (!e) BAKED.set(k, (e = [[], []]));
  e[/neglected/.test(it.name) ? 1 : 0].push(it.id);
}
/** a house lot as one baked picture (house, yard and decals), when its size has variants: the variant by the
 *  lot's slot along its street (neighbours differ), the neglected ones from decline 2; null when none fits */
function baked(B: Build, lot: LotGeom, st: ComposeState): Composition | null {
  const e = BAKED.get(`${lot.w}x${lot.d} ${B.rear ? 'rear' : 'front'}`); if (!e) return null;
  const pool = st.decline >= 2 && e[1].length ? e[1] : e[0]; if (!pool.length) return null;
  const slot = Math.round((lot.o.x * lot.u.x + lot.o.y * lot.u.y) / lot.w), street = Math.round(lot.o.x * lot.n.x + lot.o.y * lot.n.y);
  const id = pool[(((slot + mix(street) % 7) % pool.length) + pool.length) % pool.length];
  const c = B.P(lot.w / 2, lot.d / 2);
  return { props: [{ id, x: c.x, y: c.y, flip: B.flip, scale: 1 }], ground: [] };
}

/** the fence grid of a baked house lot, drawn as its own layer (the lot picture has no fences): wooden privacy panels on the
 *  lower world-coordinate side line (every lot owns one side) from the back line to 3.65 tiles (7.3 m)
 *  from the front edge, the same on every lot so neighbours' fences meet, and on the back line when n points to +X/+Y (of two
 *  lots back to back exactly one owns it). Along the inside of all three inner lines (so both faces
 *  of every fence are planted): shrubs, ferns and grasses with gaps, now and then a young tree; leaf drifts and tufts at the
 *  fence bases. Each neighbour supplies the planting on its own side of a shared line. */
const FENCE_PLANTS = names(['town:fern', 'town:ornamental_grass']).concat(BUSHES.filter(id => id !== 'world:hedge'));
/** one deterministic deck; each street slot gets three consecutive young-tree choices before the deck repeats */
const FENCE_TREES = (() => {
  const deck = TREES.filter(id => !/-ns:/.test(id)).sort(), r = mulberry(0x66e3);
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
})();
const FENCE_FRONT = 3.65;
/** the boundary fence of a lot: wooden privacy panels on its own side lines (the lower world-coordinate end along u, from the back line to
 *  FENCE_FRONT from the front edge, the same on every lot so neighbours' fences meet, and the back line when n points to +X/+Y: of two lots back
 *  to back exactly one owns it). Every use but industry draws these, so a shared line gets one fence whatever the two uses are. */
function boundaryFence(B: Build, lot: LotGeom) {
  const { W, D } = B, side = lot.u.x + lot.u.y > 0 ? 0 : W;
  B.boundaryRun(PRIVACY, side, D, side, Math.min(D, FENCE_FRONT));
  if (lot.n.x + lot.n.y > 0) B.boundaryRun(PRIVACY, 0, D, W, D);
}
/** a house lot's fence layer (its baked picture has no fences): the boundary fence, and the planting along the inside of its lines */
function fenceLayer(B: Build, lot: LotGeom) {
  const { W, D, r } = B;
  const slot = Math.round((lot.o.x * lot.u.x + lot.o.y * lot.u.y) / W), street = Math.round(lot.o.x * lot.n.x + lot.o.y * lot.n.y);
  const treeStart = mix(street, lot.n.x + 1, lot.n.y + 1) + slot * 3;
  let trees = 0;
  boundaryFence(B, lot);
  const plant = (a: number, b: number) => {
    const u = r();
    if (u >= 0.78) return;
    const young = u < 0.08 && trees < Math.min(3, FENCE_TREES.length);
    const treeIndex = ((treeStart + trees) % FENCE_TREES.length + FENCE_TREES.length) % FENCE_TREES.length;
    const id = young ? FENCE_TREES[treeIndex] : pick(r, FENCE_PLANTS);
    if (young) trees++;
    const g = B.spec(id, { mul: young ? 0.65 : 0.8 + 0.3 * r() });
    if (!g) return;
    // Keep a young tree's full footprint inside the yard; a fixed 0.45-tile inset discards nearly every tree.
    const ea = B.ea(g), eb = B.eb(g);
    if (ea * 2 > W || eb * 2 > D - FENCE_FRONT) return;
    B.at(g, clamp(a, ea, W - ea), clamp(b, FENCE_FRONT + eb, D - eb), { plant: true });
  };
  for (const a of [0.45, W - 0.45]) for (let b = FENCE_FRONT + 0.6; b < D - 0.6; b += 1.0 + 0.6 * r()) plant(a, b);
  for (let a = 1.2; a < W - 1.2; a += 1.0 + 0.6 * r()) plant(a, D - 0.45);
  const base = (a: number, b: number) => { B.mark('leaves', a, b, 0.7 + 0.3 * r()); B.mark('tufts', a, b, 0.55 + 0.2 * r()); };
  for (const a of [0.5, W - 0.5]) for (let b = FENCE_FRONT + 0.5; b < D - 0.5; b += 2) base(a, b);
  for (let a = 1; a < W - 1; a += 2) base(a, D - 0.5);
}

/** the planted island of a car park with a middle double row: one tile between the two middle rows (bushes on it, no wheel stops) */
const ISLAND = 1;
/** a natural car park in the lot-frame rectangle [a0,a1] x [b0,b1] (b0 the street side, b1 the back). The far row of bays is flush against b1 and,
 *  when the rectangle is 2 * BAY_DEPTH + AISLE deep or more, the near row is flush against b0; the aisle is all the space between the two rows.
 *  When that gap is at least 2 * AISLE + 2 * BAY_DEPTH + ISLAND, two middle rows back to back (the island between them, bushes, no wheel stops)
 *  are centred in it, leaving two aisles. Bays are BAY wide, with lines from each row's outer edge (a middle row: its aisle edge) to the aisle
 *  (the island); a wheel stop 0.35 in from each outer edge; a car in fill of the bays (seeded), its nose 0.15 short of its stop (centre NOSE short) along its heading
 *  (the middle rows stop at the island). drive: an entrance (no bay on its columns), paved from the street to the street-side aisle, with a street
 *  sign at its mouth. Returns the bay count. */
function parkingArea(B: Build, a0: number, b0: number, a1: number, b1: number, drive: { a0: number; a1: number } | null, fill: number): number {
  const BP = BAY_DEPTH, H = b1 - b0;
  if (H < BP + AISLE) return 0;
  const two = H >= 2 * BP + AISLE, g0 = two ? b0 + BP : b0, g1 = b1 - BP, c = (g0 + g1) / 2;
  const island = two && g1 - g0 >= 2 * AISLE + 2 * BP + ISLAND;
  // a row: the edge its lines start at, the edge they end at (the aisle), its stop, and its heading (away from the road: +n)
  type Row = { e0: number; e1: number; stop: number; away: boolean; wheel: boolean };
  const rows: Row[] = [{ e0: b1, e1: g1, stop: b1 - STOP_IN, away: true, wheel: true }];
  if (two) rows.push({ e0: b0, e1: g0, stop: b0 + STOP_IN, away: false, wheel: true });
  if (island) {
    rows.push({ e0: c - ISLAND / 2 - BP, e1: c - ISLAND / 2, stop: c - ISLAND / 2, away: true, wheel: false });
    rows.push({ e0: c + ISLAND / 2 + BP, e1: c + ISLAND / 2, stop: c + ISLAND / 2, away: false, wheel: false });
  }
  const segs: [number, number][] = drive ? [[a0, drive.a0], [drive.a1, a1]] : [[a0, a1]], wflip = Math.abs(B.u.x) < Math.abs(B.u.y);
  const low: number[] = [], high: number[] = [];
  let bays = 0;
  for (const row of rows) {
    const into = (row.e0 + row.e1) / 2 < c ? low : high, cen = row.stop + (row.away ? -NOSE : NOSE);
    for (const [s0, s1] of segs) {
      const n = Math.floor((s1 - s0) / BAY + 1e-9);
      if (n < 1) continue;
      const t0 = Math.floor(B.r() * 2);   // seeded: neighbouring bays take different models
      for (let k = 0; k <= n; k++) { const p = B.P(s0 + k * BAY, row.e0), q = B.P(s0 + k * BAY, row.e1); into.push(p.x, p.y, q.x, q.y); }
      for (let k = 0; k < n; k++) {
        const a = s0 + (k + 0.5) * BAY;
        if (row.wheel) B.put(WHEEL, a, row.stop, { flip: wflip });
        bays++;
        if (B.r() < fill) B.parked(a, cen, row.away, (t0 + k) % 2);
      }
    }
  }
  // the asphalt: split around the island (a yard, so its bushes stand on it), each part with its own lines
  const Q = (lo: number, hi: number) => B.quad(clamp(a0, 0, B.W), clamp(lo, 0, B.D), clamp(a1, 0, B.W), clamp(hi, 0, B.D)), ln = (l: number[]) => (l.length ? l : undefined);
  if (island) {
    B.patches.push({ kind: 'lot', tex: 'asphalt', quad: Q(b0, c - ISLAND / 2), lines: ln(low) });
    B.patches.push({ kind: 'yard', tex: 'grass', quad: Q(c - ISLAND / 2, c + ISLAND / 2) });
    B.patches.push({ kind: 'lot', tex: 'asphalt', quad: Q(c + ISLAND / 2, b1), lines: ln(high) });
    for (const [s0, s1] of segs) for (let a = s0 + 0.6; a <= s1 - 0.6; a += 1.4) B.put(pick(B.r, BUSHES), a, c, { plant: true });
  } else B.patches.push({ kind: 'lot', tex: 'asphalt', quad: Q(b0, b1), lines: ln(low.concat(high)) });
  // the entrance: its mouth at the street, its end at the street-side aisle
  if (drive) { B.pave('drive', drive.a0, 0, drive.a1, (g0 + (island ? c - ISLAND / 2 - BP : g1)) / 2, 'asphalt'); B.put('town:street_sign', (drive.a0 + drive.a1) / 2, -0.4, { street: true }); }
  return bays;
}
/** a small green, for a lot whose frontage runs off the map axes (no building there faces the street): two trees, a bench by the front, bushes */
function green(B: Build) {
  const { W, D, r } = B;
  B.put(pick(r, TREES), W * 0.3, D * 0.45, { plant: true });
  B.put(pick(r, TREES), W * 0.7, D * 0.7, { plant: true });
  B.put('world:bench', W / 2, 1.4);
  B.scatter(BUSHES, 0.8, 0.8, W - 0.8, D - 0.8, 4 + Math.floor(r() * 3), { plant: true });
  B.marksIn('leaves', 0.8, 0.8, W - 0.8, D - 0.8, 2);
}

/** a shop or venue with a car park beside it (two bays when the lot allows), a lamp at its corner, a front row by the door
 *  (bike rack, bin, bench, bushes along the shop front), a hvac unit at the side, a tree row along the side lot line and the
 *  bins at the back; a tour venue adds a second bench, a picnic table, a phone booth and a sign */
/** the front of a commercial building: this far back from the lot's street edge (tiles): its paved apron, a shop-front sidewalk with the benches */
const SHOP_FRONT_B = 1.4;
/** a commercial lot as one shop of a street front (a main street, a strip of shops): the building at the front of the lot, against the lot's
 *  lower world-coordinate side line like every lot of the street (as the fences', see fenceLayer), so neighbours line up along the sidewalk
 *  with only an alley between; at its owner scale, never shrunk (a lot that fits no building is a small car park); dealt from the street's
 *  own shuffled deck by the lot's slot along it, so neighbouring shops differ; the car park, bins and deliveries behind it */
function com(B: Build, st: ComposeState, tour: boolean) {
  const { W, D, r, rear, flip } = B;
  const pool = st.decline >= 2 ? BOARDED : rear ? SHOP_REAR : tour ? VENUE : SHOP_FRONT;
  const ok = pool.filter(id => { const [w, d] = B.fit(id, flip); return w <= W - 0.3 && d <= D - SHOP_FRONT_B - 1.2; });
  if (!ok.length) { park(B, st); return; }
  // the street's deck (seeded by the street line and its side), dealt by the slot along it
  const slot = Math.round((B.o.x * B.u.x + B.o.y * B.u.y) / W), street = Math.round(B.o.x * B.n.x + B.o.y * B.n.y);
  const deck = [...ok].sort(), dr = mulberry(mix(street, B.n.x + 2, B.n.y + 2, rear ? 1 : 0));
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(dr() * (i + 1)); [deck[i], deck[j]] = [deck[j]!, deck[i]!]; }
  // the shops that leave room for the drive beside them (its width and 0.3 clear of the shop), when any do
  const room = deck.filter(id => W - B.fit(id, flip)[0] - 0.3 >= DRIVE_W), dk = room.length ? room : deck;
  const ss = B.spec(dk[((slot % dk.length) + dk.length) % dk.length]!, { flip });
  if (!ss) return;
  const sw = 2 * B.ea(ss), sd = 2 * B.eb(ss), low = B.u.x + B.u.y > 0, ca = low ? 0.15 + sw / 2 : W - 0.15 - sw / 2, back = SHOP_FRONT_B + sd;
  // the car park behind the shop, its entrance drive in the alley on the far side (flush with the far lot line): only when the shop leaves
  // the drive's width and the bays' depth (two rows, or one)
  const lotPark = W - sw - 0.3 >= DRIVE_W && D - 0.3 - (back + 0.8) >= BAY_DEPTH + AISLE, dA0 = low ? W - DRIVE_W : 0, dA1 = dA0 + DRIVE_W;
  B.at(ss, ca, SHOP_FRONT_B + sd / 2);
  // asphalt all over, the sidewalk's slabs on to the shop front (both patches carry uprights)
  B.pave('yard', 0, 0, W, D, 'asphalt');
  B.pave('yard', 0, 0, W, SHOP_FRONT_B, 'slabs');
  // the alley: the strip beside the building on the other side line (the neighbour's building stands across it), less the drive's side when there is one
  const al0 = low ? ca + sw / 2 : 0, al1 = low ? W : ca - sw / 2;
  const f0 = lotPark && !low ? dA1 : al0, f1 = lotPark && low ? dA0 : al1, alley = f1 - f0, am = (f0 + f1) / 2;
  if (!rear) {
    B.put('world:bench', ca - sw / 4, 0.5);
    B.put('world:trashcan', ca + sw / 4, 0.45);
    if (r() < 0.6) B.put('town:bike_rack', ca, 0.55);
    B.put('expansion:parking-meter', ca + sw / 2 - 0.4, -0.35, { street: true });
    // the shop door: pumpkins and mums for October, an ice freezer or milk crates out front
    if (r() < 0.7) { B.put(pick(r, PUMPKINS), ca - 0.6, SHOP_FRONT_B - 0.3); B.put(pick(r, PUMPKINS), ca + 0.5, SHOP_FRONT_B - 0.3); }
    if (alley >= 1.2) B.put(r() < 0.5 ? 'expansion:ice-freezer' : 'expansion:milk-crates', am, SHOP_FRONT_B + 0.4);
    if (r() < 0.3) B.put(pick(r, SPOOKY), am, 0.3);
  }
  // the lamp at the corner away from the drive's mouth
  B.put('world:streetlamp', lotPark ? (low ? 0.4 : W - 0.4) : low ? W - 0.4 : 0.4, -0.4, { street: true });
  if (r() < 0.4) B.put('world:hydrant', low ? 0.5 : W - 0.5, -0.4, { street: true });
  // the alley: bins, the hvac unit and the utility cabinet against the wall, litter
  if (alley >= 1.2) {
    B.put('town:dumpster', am, back - 0.8);
    B.put('expansion:hvac-unit', am, SHOP_FRONT_B + sd / 2);
    B.put('expansion:utility-cabinet', am, SHOP_FRONT_B + 1.2);
    B.mark('litter', am, back - 1.6); if (r() < 0.5) B.mark('rubbish', am, back - 2.4, 0.8);
  }
  // behind: the car park from 0.8 behind the back wall to the back line (across the full width), or a paved loading pad when the shop leaves
  // no room; the deliveries at the wall, trees and bushes on the back line
  const pb = back + 0.8;
  if (lotPark) { parkingArea(B, 0.3, pb, W - 0.3, D - 0.3, { a0: dA0, a1: dA1 }, 0.5); B.marksIn('stain', 0.3, pb, W - 0.3, D - 0.3, 1 + Math.floor(W / 4), 0.9); }
  else { B.pave('yard', 0.3, back + 0.2, W - 0.3, D - 0.3, 'pad'); if (alley < 1.2) B.put('town:dumpster', ca, back + 0.8); }
  B.put('town:delivery_crates', ca - sw / 4, back + 0.6);
  B.put('expansion:bread-delivery-rack', ca + sw / 4, back + 0.6);
  if (r() < 0.5) B.put('expansion:shopping-cart', ca, back + 1.0);
  B.marksIn('leaves', 0.8, D - 1.6, W - 0.8, D - 0.6, 1);
  for (let a = 1; a <= W - 1; a += 1.6) B.put(pick(r, BUSHES), a, D - 0.6, { plant: true });
  if (r() < 0.6) B.put(pick(r, TREES), low ? W - 0.7 : 0.7, D - 0.8, { plant: true });
  if (tour) {
    B.put('town:picnic_table', am, back + 0.8);
    B.put('town:phone_booth', low ? W - 1.2 : 1.2, -0.4, { street: true });
    B.put('town:street_sign', ca, -0.6, { street: true });
  }
}

/** a public car park: no building. A verge strip (1 tile) along the frontage with a row of bushes (a hedge's 1.6-tile footprint does not fit), an
 *  entrance drive (DRIVE_W) on one side from the street to the aisle, and the rest of the lot laid out by parkingArea. Cars in the bays: 40-80%
 *  seeded, 70-100% upgraded, 30% at decline 1, 10% at decline 2, none at decline 3. A sign at the drive mouth. */
function park(B: Build, st: ComposeState) {
  const { W, D, r } = B, STRIP = 1;
  const L = r() < 0.5, dA0 = L ? 0 : W - DRIVE_W, dA1 = dA0 + DRIVE_W;
  const pA0 = L ? dA1 : 0, pA1 = L ? W : dA0;
  if (pA1 - pA0 < BAY) return;
  for (let a = pA0 + 0.8; a <= pA1 - 0.6; a += 1.4) B.put(pick(r, BUSHES), a, STRIP / 2, { plant: true });
  const share = st.level === LV.UPGRADED ? 0.7 + 0.3 * r() : 0.4 + 0.4 * r();
  const fill = st.decline >= 3 ? 0 : st.decline === 2 ? 0.1 : st.decline === 1 ? 0.3 : share;
  const bays = parkingArea(B, pA0, STRIP, pA1, D, { a0: dA0, a1: dA1 }, fill);
  B.put('expansion:parking-meter', pA0 + 0.6, -0.35, { street: true });
  // oil stains in the bays, wheel wear on the drive, the odd bit of litter
  B.marksIn('stain', pA0, STRIP, pA1, D, Math.max(1, Math.floor(bays / 2)), 0.9);
  B.mark('town:wheel_wear', dA0 + DRIVE_W / 2, 1.2 + r() * Math.max(0, D - 3)); B.mark('litter', pA0 + r() * (pA1 - pA0), D - 1.2);
}

/** a civic building (or a back view) on the left of a paved forecourt: a tree row, benches and planters, a lamp pair and a bus stop
 *  at the entrance, one car bay at the side, shrubs at the front and back */
function civic(B: Build, st: ComposeState) {
  const { W, D, r, rear, flip } = B;
  const cs = specFit(B, rear ? SHOP_REAR : CIVIC, W - 3.2, D - 6, { flip });
  if (!cs) return;
  const ea = B.ea(cs), eb = B.eb(cs), sb = 3 + 1.5 * r(), cx = 0.3 + ea, cw = 2 * ea;
  B.at(cs, cx, sb + eb);
  B.pave('yard', 0.3, 0, cw + 0.6, sb, 'paving');
  for (let a = 0.8; a <= cw + 0.2; a += 2) B.put(pick(r, TREES), a, 0.7, { plant: true });
  B.put('town:planter_square', cx - 1.2, sb - 0.6);
  B.put('town:planter_square', cx + 1.2, sb - 0.6);
  B.put('world:streetlamp', cx - 1.2, -0.4, { street: true });
  B.put('world:streetlamp', cx + 1.2, -0.4, { street: true });
  B.put('town:bus_stop', cw + 1.2, -0.5, { street: true });
  B.put('world:bench', cx - ea - 0.2, sb - 0.6);
  B.put('world:bench', cx + ea + 0.2, sb - 0.6);
  B.carPark(cw + 0.6, W - 0.3);
  B.put('town:bike_rack', 0.9, sb - 1.0);
  B.put(pick(r, TREES), 0.6, D - 0.6, { plant: true });
  B.put(pick(r, TREES), W - 0.6, D - 0.6, { plant: true });
  for (let a = 1.4; a <= W - 1.4; a += 1.4) B.put(pick(r, BUSHES), a, D - 0.9, { plant: true });
  if (st.decline >= 1) B.put(pick(r, BUSHES), W / 2, sb + 2 * eb + 1, { plant: true });
  B.put('world:trashcan', cx + 2.2, sb - 0.5);
  B.put(pick(r, SCHOOL_SIGNS), W - 0.5, -0.4, { street: true });
  if (r() < 0.6) B.put('ref:halloween-hay-bales', cx + ea - 0.6, sb - 1.6);
  for (let b = sb + 0.8; b <= D - 1.5; b += 1.6) B.put(pick(r, FLOWERS), 0.8, b, { plant: true });
  B.marksIn('leaves', 0.8, sb + 2 * eb + 0.6, W - 0.8, D - 0.8, 2); if (r() < 0.5) B.mark('litter', cx + 1.4, sb - 1.2, 0.8);
}

/** a yard of gravel with a shed at the back, a second shed or trailer, a chain-link fence with a gate gap at the front,
 *  3-5 scrapyard clusters of 3-5 items against the side fences and the shed, a pickup and a van, a utility pole and weeds along the fence */
function ind(B: Build, st: ComposeState) {
  const { W, D, r, flip } = B;
  B.pave('yard', 0.4, 0.4, W - 0.4, D - 0.4, 'gravel');
  const shed = st.decline >= 2 ? ['expansion:abandoned-workshop'] : W >= 12 ? [...SHED, ...BARN] : SHED;
  const sh = specFit(B, shed, W - 0.8, D - 3, { flip });
  const shB = D - (sh ? B.eb(sh) : 1.5) - 0.9;
  if (sh) B.at(sh, W / 2, shB);
  const tr = specFit(B, TRAILERS, W - 2.4, 4.5, { flip });
  if (tr) B.at(tr, B.ea(tr) + 0.8, 3 + B.eb(tr));
  B.run(CHAIN, 0.4, 0.4, W - 0.4, 0.4, [0.35, 0.65]);
  B.run(CHAIN, 0.4, 0.4, 0.4, D - 0.4);
  B.run(CHAIN, W - 0.4, 0.4, W - 0.4, D - 0.4);
  B.run(CHAIN, 0.4, D - 0.4, W - 0.4, D - 0.4);
  B.vehicle(PICKUPS, W / 2 + 1.5, 1.2);
  B.vehicle(PICKUPS, W / 2 - 1.5, 1.2);
  B.put('town:utility_pole', 0.5, -0.5, { street: true });
  const k = 3 + Math.floor(r() * 3);
  for (let i = 0; i < k; i++) {
    // the last cluster stands in front of the shed, the others against the side fences
    const last = i === k - 1 && sh, ca = last ? W / 2 : i % 2 ? W - 1.3 : 1.3, cb = last ? shB - 1.6 : 3 + r() * Math.max(0, D - 8);
    const m = 3 + Math.floor(r() * 3);
    for (let j = 0; j < m; j++) B.put(pick(r, CLUTTER), ca + (r() - 0.5) * 2.4, cb + (r() - 0.5) * 2.4);
  }
  for (let b = 2; b <= D - 1.5; b += 3) B.put(pick(r, BUSHES), 0.9, b, { plant: true });
  // tyre tracks in the mud from the gate, oil and gravel spilt, rubbish by the shed
  B.mark('mud', W / 2, 2.5, 1.2); B.mark('mud', W / 2 + (r() - 0.5) * 3, D / 2, 1.2);
  B.marksIn('stain', 1, 1, W - 1, D - 1, 2); B.marksIn('gravel', 1, 1, W - 1, D - 1, 2); B.mark('rubbish', W - 1.6, D - 2.4);
}

/** a construction site: dirt, cement bags, rubble, a cable spool and a pickup; no building */
function site(B: Build) {
  const { W, D, r, flip } = B;
  B.pave('yard', 0.3, 0.3, W - 0.3, D - 0.3, 'dirt');
  B.put('expansion:cement-bags', 1.2, 1.6);
  B.put('expansion:cement-bags', 2.2, 1.2);
  B.put('expansion:concrete-rubble', W - 1.6, 2.2);
  B.put('expansion:cable-spool', W - 1.4, D - 2.2);
  B.vehicle(PICKUPS, W / 2, 0.8);
  B.mark('mud', W / 2, 2.4, 1.2); B.mark('expansion:mud-footprints', W / 2, D / 2); B.mark('expansion:mud-arc', W * 0.7, D - 2.2); B.marksIn('gravel', 1, 1, W - 1, D - 1, 2);
  B.put('expansion:lumber-bundle', 1.6, D - 1.6);
  B.put('expansion:pallet-stack', W - 2.2, D - 1.4);
  if (r() < 0.5) B.put(pick(r, JUNK), W / 2, D - 1.5, { flip });
}

/** a vacant lot: a few weeds and a tree */
function vacant(B: Build) {
  const { W, D, r } = B;
  B.put(pick(r, BUSHES), W * 0.3, D * 0.5, { plant: true });
  B.put(pick(r, BUSHES), W * 0.7, D * 0.7, { plant: true });
  B.put(pick(r, TREES), W * 0.5, D * 0.3, { plant: true });
  // gone to weeds: tall grass and ferns, a dead tree, now and then a dumped item
  B.scatter(names(['town:ornamental_grass', 'town:fern', 'world:bush_2']), 0.8, 0.8, W - 0.8, D - 0.8, 5 + Math.floor(r() * 4), { plant: true });
  if (r() < 0.4) B.put(pick(r, DEAD_TREES), W * (0.2 + 0.6 * r()), D * (0.5 + 0.3 * r()), { plant: true });
  if (r() < 0.25) B.put(pick(r, JUNK), W * (0.3 + 0.4 * r()), D * 0.75);
  B.marksIn('leaves', 0.8, 0.8, W - 0.8, D - 0.8, 2); B.mark('worn', W * (0.3 + 0.4 * r()), D * (0.3 + 0.4 * r()), 1.5);
  if (r() < 0.4) B.mark('rubbish', W * (0.2 + 0.6 * r()), D * (0.6 + 0.3 * r())); if (r() < 0.6) B.mark('woods', W * r(), D * r());
}

/** is a built or upgraded commercial lot a public car park: the lot's seed falls in the first 15% (seed % 100 < 15).
 *  Decided from the seed alone, so no other lot's draws change. */
export function isCarPark(st: ComposeState): boolean { return st.use === LU.COM && st.level >= LV.BUILT && st.seed % 100 < 15; }

/** The composition of a lot in a given state: deterministic from the lot, its use, level, decline and seed. */
export function compose(lot: LotGeom, st: ComposeState): Composition {
  const B = new Build(lot, mulberry(mix(st.seed, st.use, st.level, st.decline)));
  B.noCars = st.decline >= 3;
  // building sprites face the map axes only: a lot whose frontage runs more than 20 degrees off both axes is a green, not its use
  const angled = Math.max(Math.abs(lot.u.x), Math.abs(lot.u.y)) < Math.cos(Math.PI / 9);
  // every lot but a house's and an industrial yard's draws the boundary fence on its own side lines (a shared line gets one fence); the drive's
  // mouth is left open
  const edge = () => { boundaryFence(B, lot); B.clearDrives(); };
  if (st.use === LU.NONE || st.level === LV.EMPTY) { vacant(B); edge(); }
  else if (angled) { green(B); edge(); }
  else if (st.level === LV.BUILDING) { site(B); edge(); }
  else if (st.use === LU.RES) { const b = baked(B, lot, st); if (b) { fenceLayer(B, lot); const f = B.done(); return { props: [...b.props, ...f.props], ground: f.ground }; } res(B, st); fenceLayer(B, lot); }
  else if (st.use === LU.COM) { if (isCarPark(st)) park(B, st); else com(B, st, false); edge(); }
  else if (st.use === LU.TOUR) { com(B, st, true); edge(); }
  else if (st.use === LU.IND) ind(B, st);
  else { civic(B, st); edge(); }
  if (st.decline >= 1) {
    B.thin(1 / 3);
    B.scatter(JUNK, 0.5, B.D * 0.5, B.W - 0.5, B.D - 0.5, st.decline >= 3 ? 2 : 1);
  }
  if (st.decline >= 3) B.scatter(BUSHES, 0.5, 0.5, B.W - 0.5, B.D - 0.5, 4, { plant: true });
  return B.done();
}
