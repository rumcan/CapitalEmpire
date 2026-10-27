// The Lot Composer's core (Phase 3 step 5c; split out for P20 / T064): the candidate list and its checks (Build, done()), the library
// pools and helpers that both the runtime composer (compose.ts: lots from presets, plus the procedural parts) and the old use layouts
// (legacy-layout.ts, kept for the presets' freeze script) use. Pure TS, no DOM. The lot frame: a point (a, b) is o + u*a + n*b in tiles; the
// road is at b < 0 and the front edge at b = 0. Pieces are placed by footprint centre in the lot frame. done() keeps a candidate only if it
// lies in the lot, stands on no drive or walk (cars and preset props excepted), and does not overlap an earlier upright by more than 35% of
// the smaller footprint. Facing: sprites face +Y (unflipped) or +X (flipped); on -Y/-X lots the old layouts used the rear views.
import { LIBRARY } from '../library';
import type { LibItem } from '../types';
import type { LotPatch } from '../ground-protocol';
import type { Lot } from './lots';
/** the lot geometry compose reads (a LotView or a Lot) */
export type LotGeom = Pick<Lot, 'o' | 'u' | 'n' | 'w' | 'd'>;
import { LU, LV } from './town';
import { OWNER_SCALE } from './scales';
import { FRONTAL } from './frontal';
import { hasLettering, EAST_FACING } from './lettering';
import { drawnAs } from '../mirror';
import { AXIS_HEADING } from '../axis-library';
import { LOT_DECALS } from '../lot-decals';
import { parkedCar } from '../traffic';
import { CAR_SCALE, carFootprint, carHeading, carOwnerScale } from '../ext/car-art';

/** a placed prop; street is set (true) only for an item on the sidewalk in front of the lot (a lay-by's bays take none: see engine placeLot);
 *  from: the preset it was drawn from and its prop index there (compose.ts; the dev editor maps an edit back to the preset by it) */
export interface Placed { id: string; x: number; y: number; flip: boolean; scale: number; street?: true; from?: { preset: string; prop: number }; /** T167: drawn in place of this removed picture */ standIn?: string }
export interface Composition { props: Placed[]; ground: LotPatch[] }
/** a preset prop a lot leaves out: the preset and the prop's index there, its sprite id as drawn, and why (past the lot line, overlaps <id>
 *  NN%, the fit, the decline) */
export interface PresetDrop { preset: string; prop: number; id: string; why: string }
/** the lot state a composition depends on (the seed is the lot's own) */
export interface ComposeState { use: number; level: number; decline: number; seed: number; /** the lot lab's forced preset id (dev only): the lot draws that preset, approved or not */ preset?: string }

export type Pt = { x: number; y: number };
export type Box4 = [number, number, number, number];
/** a placed candidate: the anchor (ground point) and its footprint in world tiles; from: a preset prop's source (see Placed), which done()
 *  keeps off the patch check and the plant cap (the owner placed it) */
export interface Item { id: string; x: number; y: number; flip: boolean; s: number; fp: Box4; car: boolean; wheel: boolean; fence: boolean; boundary: boolean; street: boolean; plant: boolean; /** stands on the paving (a drive's pay boom) */ paved?: boolean; from?: { preset: string; prop: number }; standIn?: string; /** T154 Phase 2: a building facing a road at 45 degrees: its footprint the square inside its world box (fp), turned 45 degrees */ diag?: boolean }
/** a sprite at a size and orientation: its footprint relative to the anchor */
export interface Spec { id: string; s: number; flip: boolean; h: Box4 }
export interface Opt { flip?: boolean; mul?: number; street?: boolean; plant?: boolean; boundary?: boolean; paved?: boolean; from?: { preset: string; prop: number }; standIn?: string; diag?: boolean }
export interface Patch { kind: 'drive' | 'walk' | 'lot' | 'yard' | 'bed'; tex: LotPatch['tex']; quad: number[]; lines?: number[] }
export interface Pair { x: string; y: string }

/** the flat ground decals by group (lot-decals.ts): index lists */
export const MARKS: Record<string, number[]> = {};
LOT_DECALS.forEach((d, i) => (MARKS[d.group] ??= []).push(i));
export const MARK_ID = new Map(LOT_DECALS.map((d, i) => [d.id, i]));
/** the generated leaf drifts (gen:drift-*) are painted as heaps of big leaves: drawn at full size each leaf came out as big as a car (the owner, 2026-10-20), so they are drawn at this share of their size */
export const DRIFT_K = 0.35;
/** the tolerances: an item may reach this far past the lot (street items: into the verge), and touching is not overlap */
export const REACH = 0.3, VERGE = 1.2, EPS = 0.02;
/** the largest share of the smaller footprint two uprights may share */
export const OVERLAP = 0.35;
/** a parked car or vehicle keeps this far (tiles) from each of its own lot's lines (sides, back and front): a car that would cross it moves
 *  inward along the lot frame if that clears the lot's other items, else it is left out (see Build.fitCar) */
export const CAR_INSET = 0.4;
/** the car park's bay pitch and depth, tiles (the depth is 5.5 m); the wheel stop id */
export const BAY = 2, BAY_DEPTH = 2.75, WHEEL = 'expansion:wheel-stop';

export const BY = new Map<string, LibItem>(LIBRARY.map(i => [i.id, i]));
export const names = (ids: string[]) => ids.filter(id => BY.has(id));
/** the library ids of a filter, without the east-facing art (east:*: drawn only in place of a flipped front, EAST_FACING), the other views (view:*)
 *  and the screen-axis pictures (axis-library.ts, T154: their footings run along the screen, so the town's lots, which run along the map axes, do not
 *  pick them; the Props tool, the lot lab and the roads at 45 degrees place them) */
export const cat = (f: (i: LibItem) => boolean) => LIBRARY.filter(i => !i.id.startsWith('east:') && !i.id.startsWith('view:') && AXIS_HEADING[i.id] === undefined && f(i)).map(i => i.id);
/** the footprint of a sprite at scale s, relative to its anchor (the union of its boxes, as the engine draws it) */
export function boxOf(id: string, s: number, flip: boolean): Box4 {
  const it = BY.get(id)!;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of it.boxes) {
    const hx = (flip ? b.hy : b.hx) * s / 2, hy = (flip ? b.hx : b.hy) * s / 2, dx = (flip ? b.dy : b.dx) * s / 2, dy = (flip ? b.dx : b.dy) * s / 2;
    x0 = Math.min(x0, dx - hx); x1 = Math.max(x1, dx + hx); y0 = Math.min(y0, dy - hy); y1 = Math.max(y1, dy + hy);
  }
  return [x0, y0, x1, y1];
}
/** a seeded pick; '' from an empty list (put() ignores unknown ids) */
export const pick = (r: () => number, a: string[]): string => a[Math.floor(r() * a.length)] ?? '';
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** the house band: the gap between the drive and the house (or its garage), and the side yard on the far side from the drive (tiles): the old
 *  layouts lay a house in it (legacy-layout.ts res), and the runtime composer keeps a frozen preset's house in it (compose.ts houseYards) */
export const DRIVE_GAP = 0.5, SIDE_YARD = 1.4;
/** a pool for a sprite drawn flipped: lettering reads backwards when mirrored, so a flipped lot keeps only the plain sprites, and a lettering
 *  sprite with east-facing art (EAST_FACING) stays (it is drawn as that art, unflipped). Unflipped keeps the whole pool. */
export const plain = (list: string[], flip: boolean | undefined) => (flip ? list.filter(id => EAST_FACING[id] !== undefined || !hasLettering(id, BY.get(id)?.name)) : list);
/** the sprite a front is drawn as, and its flip: a flipped front with east-facing art is that art, drawn unflipped; otherwise itself, as flipped */
/** rear views drawn the other way round (the back wall with its deck or porch faces +X, the house's front -X): unlike the other rear views
 *  (back toward +Y, front -Y) they are drawn flipped on a lot whose street is north of it and unflipped when it is west, so a house always
 *  faces its street (the owner, 2026-10-21: no house facing north on a north-south street). Sorted by eye from the studio's pictures. */
export const REAR_X = new Set(['variation:world-house_4-north-630f880a-plain:1', 'variation:ref-building-farmhouse-north-408a9ca6-plain:1', 'variation:ref-building-house-large-north-24d21776-plain:1',
  'variation:gen-house-l-shape-north-79eba705-plain:1', 'expansion:dormer-rear', 'variation:expansion-dormer-rear-55d3cd77-plain:1', 'expansion:victorian-rear',
  'variation:expansion-ranch-rear-bde86a42-plain-corner:1']);
export const facing = (id: string, flip: boolean): [string, boolean] => { if (REAR_X.has(id)) return [id, !flip]; const e = flip ? EAST_FACING[id] : undefined; return e ? [e, false] : [id, flip]; };
/** ...and as it is drawn, so the layout takes the drawn footprint: no building is mirrored (mirror.ts; a flipped four-view building is its partner view) */
export const faced = (id: string, flip: boolean): [string, boolean] => { const [f, k] = facing(id, flip), it = BY.get(f); return it ? drawnAs(it, k) : [f, k]; };

/** ids with their plain variations in the library ('town:bakery' -> 'variation:town-bakery-<hash>-plain:1'), the ones the game has */
export const withVariations = (ids: string[]) => { const base = names(ids); return base.concat([...BY.keys()].filter(k => !FRONTAL.has(k) && base.some(b => k.startsWith(`variation:${b.replace(':', '-')}-`)))); };
export const TREES = cat(i => i.kind === 'tree' && !/dead/.test(i.id));
export const BUSHES = cat(i => i.kind === 'bush');
/** a small green's centrepiece */
export const PARK_PIECES = names(['world:gazebo', 'ref:landmark-fountain-v2', 'world:junglegym_0', 'world:junglegym_1']);
/** cars with a facing letter in the name (n = -Y, s = +Y, e = +X, w = -X) */
export const CARS = cat(i => i.cat === 'Vehicles' && /_[news](-v2)?$/.test(i.id));
export const PICKUPS = CARS.filter(id => /pickup|van/.test(id));
export const FACE: Record<string, Pt> = { n: { x: 0, y: -1 }, s: { x: 0, y: 1 }, e: { x: 1, y: 0 }, w: { x: -1, y: 0 } };
/** the car art's direction (0 +x, 1 +y, 2 -x, 3 -y) of the axis a lot-frame vector points along */
export const dirOf = (v: Pt) => (Math.abs(v.x) > Math.abs(v.y) ? (v.x > 0 ? 0 : 2) : (v.y > 0 ? 1 : 3));
export const JUNK = names(['expansion:junk-car', 'expansion:appliance-pile', 'expansion:scrap-metal', 'expansion:tyre-stack', 'expansion:oil-drums', 'expansion:concrete-rubble']);
export const PRIVACY: Pair = { x: 'expansion:fence-privacy-x', y: 'expansion:fence-privacy-y' };
export const CHAIN: Pair = { x: 'expansion:chainlink-x', y: 'expansion:chainlink-y' };
/** the school and pedestrian signs (TrickOrTreat road sign set) for the kerb by a civic building */
export const SCHOOL_SIGNS = cat(i => /^variation:sign-pedestrians-school-/.test(i.id));
export const DEAD_TREES = names(['world:tree_dead_0', 'world:tree_dead_1', 'world:tree_dead_2']);

/** does an axis-aligned footprint overlap a convex quad (8 numbers, corners in order); touching is not overlap */
export function hit(fp: Box4, q: number[]): boolean {
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
export function share(p: Box4, q: Box4): number {
  const ix = Math.min(p[2], q[2]) - Math.max(p[0], q[0]), iy = Math.min(p[3], q[3]) - Math.max(p[1], q[1]);
  if (ix <= EPS || iy <= EPS) return 0;
  const sp = (p[2] - p[0]) * (p[3] - p[1]), sq = (q[2] - q[0]) * (q[3] - q[1]);
  return ix * iy / Math.min(sp, sq);
}
/** a seed from the lot's seed and state */
export function mix(...v: number[]): number { let h = 0x811c9dc5; for (const x of v) h = Math.imul(h ^ (x >>> 0), 16777619); return h >>> 0; }

/** The composition of one lot: the candidates (in priority order), the drive/walk/car park patches, and done(). */
export class Build {
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
  /** where the preset props this lot leaves out are told, with why (compose's drops argument: the dev editor); null: not told */
  drops: PresetDrop[] | null = null;
  /** a building site keeps all its ground decals (mud, footprints, gravel); every other lot keeps only its leaves (the owner, 2026-10-22) */
  allMarks = false;
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
    // a flipped front with east-facing art is that art, unflipped (faced)
    const [sid, flip] = faced(id, !!o.flip);
    if (!BY.has(sid)) return null;
    // a car at its owner size: the engine draws a parked car at CAR_SCALE times it (its footprint too), the size of the cars on the road
    const car = BY.get(sid)!.cat === 'Vehicles', s = car ? carOwnerScale(sid) : (OWNER_SCALE[id] ?? 1) * (o.mul ?? 1) * (1 + 0.05 * (2 * this.r() - 1));
    return { id: sid, s, flip, h: boxOf(sid, car ? CAR_SCALE * s : s, flip) };
  }
  /** the half extent of a spec along the lot's u (ea) and n (eb) */
  ea(g: Spec): number { return (Math.abs(this.u.x) * (g.h[2] - g.h[0]) + Math.abs(this.u.y) * (g.h[3] - g.h[1])) / 2; }
  eb(g: Spec): number { return (Math.abs(this.n.x) * (g.h[2] - g.h[0]) + Math.abs(this.n.y) * (g.h[3] - g.h[1])) / 2; }
  /** the full footprint extents of a sprite along the lot's u and n at the owner's scale (no draw), to choose what fits */
  fit(id: string, flip: boolean): [number, number] {
    const [sid, f] = faced(id, flip), h = boxOf(sid, OWNER_SCALE[id] ?? 1, f), w = h[2] - h[0], d = h[3] - h[1];
    return [Math.abs(this.u.x) * w + Math.abs(this.u.y) * d, Math.abs(this.n.x) * w + Math.abs(this.n.y) * d];
  }
  /** a car's footprint centre, moved along the lot frame so its footprint keeps CAR_INSET from each of the lot's lines (a car inside them is
   *  returned as given). A move is refused (null) when it would land the car on another item of the lot, and when the lot is too small for the car */
  fitCar(g: Spec, c: Pt): Pt | null {
    const dx = c.x - this.o.x, dy = c.y - this.o.y, a = dx * this.u.x + dy * this.u.y, b = dx * this.n.x + dy * this.n.y;
    const ea = this.ea(g), eb = this.eb(g), la = ea + CAR_INSET, lb = eb + CAR_INSET;
    if (la > this.W - la || lb > this.D - lb) return null;
    const a1 = clamp(a, la, this.W - la), b1 = clamp(b, lb, this.D - lb);
    if (Math.abs(a1 - a) < 1e-3 && Math.abs(b1 - b) < 1e-3) return c;
    const p = this.P(a1, b1), h = g.h, fp: Box4 = [p.x - (h[2] - h[0]) / 2, p.y - (h[3] - h[1]) / 2, p.x + (h[2] - h[0]) / 2, p.y + (h[3] - h[1]) / 2];
    return this.items.some(it => share(it.fp, fp) > 0) ? null : p;
  }
  /** a spec with its footprint centre at a world point (a car's centre is fitted inside its lot first, see fitCar) */
  atW(g: Spec | null, c: Pt, o: Opt = {}): Item | null {
    // the last check: a lettering sprite is never drawn flipped (the pools leave them out; this holds for any sprite chosen)
    if (!g || (g.flip && hasLettering(g.id, BY.get(g.id)?.name))) return null;
    const it = BY.get(g.id)!, car = it.cat === 'Vehicles', cc = car ? this.fitCar(g, c) : c;
    if (!cc) return null;
    const h = g.h, x = cc.x - (h[0] + h[2]) / 2, y = cc.y - (h[1] + h[3]) / 2;
    const item: Item = { id: g.id, x, y, flip: g.flip, s: g.s, fp: [x + h[0], y + h[1], x + h[2], y + h[3]], car, wheel: g.id === WHEEL, fence: it.kind === 'fencex' || it.kind === 'fencey' || g.id === 'world:hedge', boundary: !!o.boundary, street: !!o.street, plant: !!o.plant, ...(o.paved ? { paved: true } : {}), ...(o.from ? { from: o.from } : {}), ...(o.standIn ? { standIn: o.standIn } : {}), ...(o.diag ? { diag: true } : {}) };
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
    const flipped = this.r() < 0.5, alpha = 0.7 + 0.3 * this.r(); // drawn even when the decal is left out, so the lot's other draws stay the same
    if (!this.allMarks && LOT_DECALS[i]!.group !== 'leaves') return;
    this.marks.push(i, +p.x.toFixed(3), +p.y.toFixed(3), +(flipped ? -s : s).toFixed(3), +alpha.toFixed(2));
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
      if (this.r() < 0.5) this.parked(a, b0 + CAR_INSET + this.carLen(false) / 2, false, k % 2);
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
  /** the length of a parked car along the lot's n: its eight-way art's footprint at CAR_SCALE times its owner size (the longer of the two models,
   *  as a bay takes either), nosed away from the road (away) or towards it */
  carLen(away: boolean): number {
    const dir = dirOf(away ? this.n : this.F), q = carFootprint(carHeading(dir * Math.PI / 2)), z = CAR_SCALE * Math.max(parkedCar(0, dir).size, parkedCar(1, dir).size);
    return 2 * (Math.abs(this.n.x) * q.hx + Math.abs(this.n.y) * q.hy) * z / 2;
  }
  /** a parked car from the eight-way art (the car parks' cars, as the engine draws them): model 0 or 1, its footprint centre at lot-frame (a, c),
   *  nosed away from the road (away: its heading is +n) or towards it. Props of kind car are at their owner size (f.size); the engine draws them at CAR_SCALE times it. */
  parked(a: number, c: number, away: boolean, type: number): Item | null {
    if (this.noCars) return null;
    const dir = dirOf(away ? this.n : this.F), f = parkedCar(type, dir), id = LIBRARY[f.item]!.id;
    // the art's anchor offsets are zero (its boxes are centred), so the anchor is the footprint centre, as client.ts visible() places a moving car
    const q = carFootprint(carHeading(dir * Math.PI / 2)), k = CAR_SCALE * f.size / 2, h: Box4 = [-q.hx * k, -q.hy * k, q.hx * k, q.hy * k];
    return this.atW({ id, s: f.size, flip: false, h }, this.P(a, c), { plant: false });
  }
  /** n sprites from a pool at seeded points of a lot-frame rectangle */
  scatter(pool: string[], a0: number, b0: number, a1: number, b1: number, n: number, o: Opt = {}) {
    for (let i = 0; i < n && pool.length; i++) this.put(pick(this.r, pool), a0 + (a1 - a0) * this.r(), b0 + (b1 - b0) * this.r(), o);
  }
  /** decline 1+: a third of the plants go */
  thin(f: number) {
    for (let i = this.items.length - 1; i >= 0; i--) if (this.items[i].plant && this.r() < f) {
      const it = this.items[i]!; if (it.from && this.drops) this.drops.push({ ...it.from, id: it.id, why: 'fewer plants on a declined lot' });
      this.items.splice(i, 1);
    }
  }
  /** drops the boundary panels that stand on a drive (a drive's mouth and the run beside it stay open) */
  clearDrives() {
    for (let i = this.items.length - 1; i >= 0; i--) { const it = this.items[i]!; if (it.boundary && this.patches.some(p => p.kind === 'drive' && hit(it.fp, p.quad))) this.items.splice(i, 1); }
  }
  /** is the footprint inside the lot (REACH past the sides and the back, VERGE into the front for street items): its corners (a building facing a
   *  road at 45 degrees, diag: its turned square's, the midpoints of its world box's sides) */
  inside(it: Item): boolean {
    const [x0, y0, x1, y1] = it.fp, minB = it.street ? -VERGE : -REACH, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    for (const [x, y] of it.diag ? [[mx, y0], [x1, my], [mx, y1], [x0, my]] : [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) {
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
  /** a lot the owner laid out (a whole or farm preset): every prop is drawn where it stands, overlapping another or not (only the lot line holds) */
  keepAll = false;
  /** T219: an iconic place (compose.ts composeWhole): no lot line either (its land is its own; a picture whose footprint pokes past it stays) */
  loose = false;
  done(): Composition {
    const props: Placed[] = [], acc: Item[] = []; let ups = 0;
    // a preset prop left out is told to the drops sink, with why (the dev editor shows them: nothing in a preset goes unseen)
    const drop = (it: Item, why: string) => { if (it.from && this.drops) this.drops.push({ ...it.from, id: it.id, why }); };
    for (const it of this.items) {
      // Shared boundary panels remain on their surveyed line even when a driveway reaches the lot edge.
      if (!this.loose && !this.inside(it)) { drop(it, 'past the lot line'); continue; }
      if (!it.boundary && !it.paved && !it.from && this.onPatch(it)) continue;
      // two cars never share ground (a car is kept only if it shares none with an earlier car)
      const car = it.car && !this.keepAll ? acc.find(a => a.car && share(a.fp, it.fp) > 0) : undefined;
      if (car) { drop(it, `overlaps the car ${car.id}`); continue; }
      if (!it.fence && !it.wheel) {
        if (it.plant && !it.from && ups >= this.cap) continue;
        const over = this.keepAll ? undefined : acc.find(a => !a.fence && !a.wheel && share(a.fp, it.fp) > OVERLAP);
        if (over) { drop(it, `overlaps ${over.id} ${Math.round(100 * share(over.fp, it.fp))}%`); continue; }
        ups++;
      }
      acc.push(it); const p: Placed = { id: it.id, x: it.x, y: it.y, flip: it.flip, scale: it.s }; if (it.street) p.street = true; if (it.from) p.from = it.from; if (it.standIn) p.standIn = it.standIn; props.push(p);
    }
    const ground: LotPatch[] = this.patches.map(p => (p.lines ? { pts: p.quad, tex: p.tex, lines: p.lines } : { pts: p.quad, tex: p.tex }));
    // the decals last, bounded by the lot grown 2 tiles (a decal is up to 4 m across)
    if (this.marks.length) ground.push({ pts: this.quad(-2, -2, this.W + 2, this.D + 2), tex: 'marks', marks: this.marks });
    return { props, ground };
  }
}

/** a seeded sprite from a pool that fits a lot (full width along u up to maxW, depth up to maxD); the smallest when none does,
 *  shrunk to fit (the owner scale only ever goes down). null for an empty pool. */
export function specFit(B: Build, list: string[], maxW: number, maxD: number, o: Opt = {}): Spec | null {
  const pool = plain(list.filter(id => BY.has(id)), o.flip), area = (id: string) => { const [w, d] = B.fit(id, B.flip); return w * d; };
  const ok = pool.filter(id => { const [w, d] = B.fit(id, B.flip); return w <= maxW && d <= maxD; });
  const cand = ok.length ? ok : pool.length ? [pool.reduce((a, b) => (area(a) <= area(b) ? a : b))] : [];
  const id = pick(B.r, cand);
  if (!id) return null;
  const [w, d] = B.fit(id, B.flip);
  return B.spec(id, { ...o, mul: Math.min(1, maxW / w, maxD / d) });
}

/** is a built or upgraded commercial lot a public car park: the lot's seed falls in the first 15% (seed % 100 < 15).
 *  Decided from the seed alone, so no other lot's draws change. */
export function isCarPark(st: ComposeState): boolean { return st.use === LU.COM && st.level >= LV.BUILT && st.seed % 100 < 15; }
