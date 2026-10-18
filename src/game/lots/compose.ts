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
import { LU, LV } from './town';
import { OWNER_SCALE } from './scales';

export interface Placed { id: string; x: number; y: number; flip: boolean; scale: number }
export interface Composition { props: Placed[]; ground: LotPatch[] }
/** the lot state a composition depends on (the seed is the lot's own) */
export interface ComposeState { use: number; level: number; decline: number; seed: number }

type Pt = { x: number; y: number };
type Box4 = [number, number, number, number];
/** a placed candidate: the anchor (ground point) and its footprint in world tiles */
interface Item { id: string; x: number; y: number; flip: boolean; s: number; fp: Box4; car: boolean; wheel: boolean; fence: boolean; street: boolean; plant: boolean }
/** a sprite at a size and orientation: its footprint relative to the anchor */
interface Spec { id: string; s: number; flip: boolean; h: Box4 }
interface Opt { flip?: boolean; mul?: number; street?: boolean; plant?: boolean }
interface Patch { kind: 'drive' | 'walk' | 'lot' | 'yard'; tex: LotPatch['tex']; quad: number[]; lines?: number[] }
interface Pair { x: string; y: string }

/** the tolerances: an item may reach this far past the lot (street items: into the verge), and touching is not overlap */
const REACH = 0.3, VERGE = 1.2, EPS = 0.02;
/** the largest share of the smaller footprint two uprights may share */
const OVERLAP = 0.35;
/** the car park's bay pitch and depth, tiles; the wheel stop id */
const BAY = 1.25, BAY_DEPTH = 2.5, WHEEL = 'expansion:wheel-stop';

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
const HOUSE_REAR = names(['expansion:ranch-rear']);
const HOUSE_RUNDOWN = names(['expansion:rundown-house']);
const GARAGE_FRONT = names(['static:garage_timber', 'static:garage_brick', 'static:garage_brick-v2']);
const GARAGE_REAR = names(['expansion:garage-rear']);
const TREES = cat(i => i.kind === 'tree' && !/dead/.test(i.id));
const BUSHES = cat(i => i.kind === 'bush');
const SHOP_FRONT = names(['town:bakery', 'town:grocery', 'town:pharmacy', 'town:laundromat', 'town:fish_tackle', 'world:video_rental', 'ref:building-grocery']);
const SHOP_REAR = names(['static:shop_brick_rear', 'static:shop_brick_rear-v2', 'static:shop_market_rear', 'static:shop_market_rear-v2']);
const BOARDED = names(['expansion:boarded-store-rear', 'expansion:derelict-two-storey']);
const VENUE = names(['world:diner', 'world:arcade', 'ref:building-gas-canopy']);
const CIVIC = names(['town:firestation', 'town:postoffice', 'world:primary_school', 'world:church', 'world:school']);
const SHED = names(['ref:building-farm-shed', 'expansion:abandoned-workshop']);
const BARN = names(['world:barn']);
/** cars with a facing letter in the name (n = -Y, s = +Y, e = +X, w = -X) */
const CARS = cat(i => i.cat === 'Vehicles' && /_[news](-v2)?$/.test(i.id));
const PICKUPS = CARS.filter(id => /pickup|van/.test(id));
const FACE: Record<string, Pt> = { n: { x: 0, y: -1 }, s: { x: 0, y: 1 }, e: { x: 1, y: 0 }, w: { x: -1, y: 0 } };
const JUNK = names(['expansion:junk-car', 'expansion:appliance-pile', 'expansion:scrap-metal', 'expansion:tyre-stack', 'expansion:oil-drums', 'expansion:concrete-rubble']);
const SCRAP = names(['expansion:scrap-engine', 'expansion:tyre-stack', 'expansion:yard-workbench', 'expansion:air-compressor']);
const CLUTTER = names(['expansion:pallet-stack', 'expansion:cable-spool', 'expansion:cement-bags', 'expansion:concrete-rubble', 'expansion:tyre-stack', 'expansion:scrap-metal', 'expansion:oil-drums', 'expansion:lumber-bundle']);
const PICKET: Pair = { x: 'world:fence_picket_x', y: 'world:fence_picket_y' };
const PRIVACY: Pair = { x: 'expansion:fence-privacy-x', y: 'expansion:fence-privacy-y' };
const CHAIN: Pair = { x: 'expansion:chainlink-x', y: 'expansion:chainlink-y' };
const HEDGE: Pair = { x: 'world:hedge', y: 'world:hedge' };

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
  /** no cars at all (derelict); the upright cap for plants (the rest are kept) */
  noCars = false; cap = 28;
  readonly r: () => number;

  constructor(lot: Lot, r: () => number) {
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
    const flip = !!o.flip, s = (OWNER_SCALE[id] ?? 1) * (o.mul ?? 1) * (1 + 0.05 * (2 * this.r() - 1));
    return { id, s, flip, h: boxOf(id, s, flip) };
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
    const item: Item = { id: g.id, x, y, flip: g.flip, s: g.s, fp: [x + h[0], y + h[1], x + h[2], y + h[3]], car: it.cat === 'Vehicles', wheel: g.id === WHEEL, fence: it.kind === 'fencex' || it.kind === 'fencey' || g.id === 'world:hedge', street: !!o.street, plant: !!o.plant };
    this.items.push(item); return item;
  }
  /** a spec with its footprint centre at a lot-frame point (a along u, b along n) */
  at(g: Spec | null, a: number, b: number, o: Opt = {}): Item | null { return this.atW(g, this.P(a, b), o); }
  /** one sprite, footprint centre at a lot-frame point */
  put(id: string, a: number, b: number, o: Opt = {}): Item | null { return this.at(this.spec(id, o), a, b, o); }
  /** a straight run of fence or hedge segments end to end from (a0, b0) to (a1, b1); the sprite axis follows the run;
   *  segments whose centre falls in gap (fractions of the run) are left out */
  run(kind: Pair, a0: number, b0: number, a1: number, b1: number, gap?: [number, number]) {
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
      this.atW(g, { x: p0.x + dx * t, y: p0.y + dy * t });
    }
  }
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
   *  and a car in every other bay with a seeded chance */
  carPark(a0: number, a1: number) {
    const n = Math.floor((a1 - a0) / BAY + 1e-9);
    if (n < 1) return;
    const lines: number[] = [];
    for (let k = 0; k <= n; k++) { const p = this.P(a0 + k * BAY, 0), q = this.P(a0 + k * BAY, BAY_DEPTH); lines.push(p.x, p.y, q.x, q.y); }
    this.patches.push({ kind: 'lot', tex: 'asphalt', quad: this.quad(a0, 0, a0 + n * BAY, BAY_DEPTH), lines });
    const flip = Math.abs(this.u.x) < Math.abs(this.u.y);
    for (let k = 0; k < n; k++) {
      const a = a0 + k * BAY + BAY / 2;
      this.put(WHEEL, a, BAY_DEPTH - 0.4, { flip });
      if (k % 2 === 0 && this.r() < 0.6) this.vehicle(CARS, a, 0.3);
    }
  }
  /** a car (or pickup) facing the road best, from a pool, with its near edge at b0 along the lot's n */
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
  /** n sprites from a pool at seeded points of a lot-frame rectangle */
  scatter(pool: string[], a0: number, b0: number, a1: number, b1: number, n: number, o: Opt = {}) {
    for (let i = 0; i < n && pool.length; i++) this.put(pick(this.r, pool), a0 + (a1 - a0) * this.r(), b0 + (b1 - b0) * this.r(), o);
  }
  /** decline 1+: a third of the plants go */
  thin(f: number) { for (let i = this.items.length - 1; i >= 0; i--) if (this.items[i].plant && this.r() < f) this.items.splice(i, 1); }
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
      if (!this.inside(it) || this.onPatch(it)) continue;
      if (!it.fence && !it.wheel) {
        if (it.plant && ups >= this.cap) continue;
        if (acc.some(a => !a.fence && !a.wheel && share(a.fp, it.fp) > OVERLAP)) continue;
        ups++;
      }
      acc.push(it); props.push({ id: it.id, x: it.x, y: it.y, flip: it.flip, scale: it.s });
    }
    const ground: LotPatch[] = this.patches.map(p => (p.lines ? { pts: p.quad, tex: p.tex, lines: p.lines } : { pts: p.quad, tex: p.tex }));
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
  const hs = specFit(B, rear ? HOUSE_REAR : st.decline >= 2 ? HOUSE_RUNDOWN : HOUSE_FRONT, W - DW - 0.5, D - 3.5, { flip });
  if (!hs) return;
  const hw = 2 * B.ea(hs), hd = 2 * B.eb(hs);
  const sb = Math.min(3 + 1.5 * r(), Math.max(1.5, D - hd - 2.5));
  const L = r() < 0.5;
  const gs = B.spec(rear ? pick(r, GARAGE_REAR) : pick(r, GARAGE_FRONT), { flip });
  const gw = gs ? 2 * B.ea(gs) : 0, gd = gs ? 2 * B.eb(gs) : 0;
  const garage = !!gs && W - DW - gw >= hw + 0.2 && r() < 0.8;
  // the house band: beside the drive (L: the drive is at a = 0), with the garage between them when it fits
  let hA0 = L ? DW : 0, hA1 = L ? W : W - DW, gA0 = 0, gA1 = 0;
  if (garage) { if (L) { gA0 = DW; gA1 = DW + gw; hA0 = gA1; } else { gA1 = W - DW; gA0 = gA1 - gw; hA1 = gA0; } }
  const ca = (hA0 + hA1) / 2;
  B.at(hs, ca, sb + B.eb(hs));
  if (garage && gs) B.at(gs, (gA0 + gA1) / 2, sb + 1 + B.eb(gs));
  const dA0 = L ? 0 : W - DW, dA1 = dA0 + DW, dB = garage ? sb + 1 + gd : sb + hd;
  B.pave('drive', dA0, 0, dA1, dB, 'paving');
  B.pave('walk', ca - 0.3, 0, ca + 0.3, sb, 'paving');
  const story = ['family', 'retired', 'worker', 'party', 'mechanic', 'neglected'][Math.floor(r() * 6)];
  // the cars in the drive (none for neglected: a junk car in the yard instead)
  let slot = 0.4;
  const car = (pool: string[]) => { const v = B.vehicle(pool, dA0 + DW / 2, slot); if (v) slot += v.span + 0.2; };
  if (story === 'worker') { car(PICKUPS); car(CARS); } else if (story !== 'neglected') car(CARS);
  if (up && story !== 'neglected') car(CARS);
  const bk = sb + hd + 1;   // the back yard starts behind the house
  if (story === 'family') {
    B.put('expansion:trampoline', W / 2, bk + 2.2);
    if (W >= 11) B.put('gen:back-swingset', W - 3, D - 3.2);
    B.put('expansion:doghouse', 1.4, D - 2.4);
    B.put('gen:kids-bikes', ca + 1.2, 1.4);
    B.put('expansion:basketball-hoop', dA1 + 0.3, sb - 0.8);
  } else if (story === 'retired') {
    B.put('expansion:birdhouse-post', 1.0, bk + 1.5);
    B.put('world:bench', W / 2, bk + 1.2);
  } else if (story === 'party') {
    if (up || r() < 0.7) B.put('expansion:aboveground-pool', W / 2, bk + 2.5);
    B.put('expansion:barbecue', W - 1.4, bk + 1.2);
    B.put('expansion:lawn-chair', W / 2 + 1.6, bk + 0.8);
    B.put('gen:cooler-lawnchairs', W / 2 - 1.6, bk + 0.8);
  } else if (story === 'mechanic') {
    B.scatter(SCRAP, 0.8, bk, W - 0.8, D - 0.8, 4);
  } else {
    B.put('expansion:junk-car', W / 2, D - 2.6);
    B.put('expansion:appliance-pile', 1.4, bk + 0.8);
  }
  // trees in the back corners and by the side; bins and the mailbox at the kerb by the drive
  B.put(pick(r, TREES), 0.9, D - 1.2, { plant: true });
  B.put(pick(r, TREES), W - 0.9, D - 1.2, { plant: true });
  if (story !== 'neglected') B.put(pick(r, TREES), W - 0.8, sb + 2.5, { plant: true });
  const bx = L ? DW + 0.5 : W - DW - 0.5;
  B.put('gen:trash-cans-row', bx, -0.35, { street: true });
  B.put('world:mailbox', bx + (L ? 0.9 : -0.9), -0.35, { street: true });
  // fences: a picket front (a hedge for retired), the sides and rear in privacy board (chain for the mechanic); none in front when neglected
  if (story === 'retired') B.run(HEDGE, 0, 0.45, W, 0.45);
  else if (story !== 'neglected') B.run(PICKET, 0, 0.2, W, 0.2);
  const sideFence = story === 'retired' ? PICKET : story === 'mechanic' ? CHAIN : PRIVACY;
  B.run(sideFence, 0.2, sb + 1, 0.2, D - 0.2);
  B.run(sideFence, W - 0.2, sb + 1, W - 0.2, D - 0.2);
  B.run(sideFence, 0, D - 0.2, W, D - 0.2);
  // plants: packed against the house front and sides, then along the back fence (fewer when neglected)
  // neglected yards keep the same lines at half the density
  const dense = story === 'neglected' ? 2 : 1;
  B.cap = (story === 'neglected' ? 12 : 12 + Math.floor(r() * 12)) + (up ? 4 : 0);
  for (let a = ca - hw / 2 - 0.6; a <= ca + hw / 2 + 0.6; a += dense) B.put(pick(r, BUSHES), a, sb - 0.8, { plant: true });
  for (const sx of [-1, 1]) for (let b = sb + 0.8; b <= sb + 2 * hd - 0.5; b += 1.2 * dense) B.put(pick(r, BUSHES), ca + sx * (hw / 2 + 0.7), b, { plant: true });
  for (let a = 1; a <= W - 1; a += 1.6 * dense) B.put(pick(r, BUSHES), a, D - 0.9, { plant: true });
  for (const a of [0.9, W - 0.9]) for (let b = bk; b <= D - 1.5; b += 1.2 * dense) B.put(pick(r, BUSHES), a, b, { plant: true });
  // the rest of the back and front yards in beds, last in order: the cap decides how many of these stay
  for (let b = bk + 0.6; b <= D - 1.2; b += 1.4) for (let a = 1.6; a <= W - 1.4; a += 1.4) B.put(pick(r, BUSHES), a, b, { plant: true });
  for (let b = 0.8; b <= sb - 0.6; b += 1.4) for (let a = 0.8; a <= W - 0.8; a += 1.4) B.put(pick(r, BUSHES), a, b, { plant: true });
}

/** a shop or venue with a car park beside it, a loading bay and bins at the back; a tour venue adds benches and trees */
function com(B: Build, st: ComposeState, tour: boolean) {
  const { W, D, r, rear, flip } = B;
  const pool = st.decline >= 2 ? BOARDED : rear ? SHOP_REAR : tour ? VENUE : SHOP_FRONT;
  const ss = specFit(B, pool, W - 2.9, D - 3.5, { flip });
  if (!ss) return;
  const sw = 2 * B.ea(ss), sd = 2 * B.eb(ss), sb = 1 + r(), ca = 0.3 + sw / 2;
  B.at(ss, ca, sb + B.eb(ss));
  if (!rear) { B.put('world:bench', ca + 1.0, sb - 0.8); B.put('town:bike_rack', ca - 1.0, sb - 0.9); }
  const pA0 = ca + sw / 2 + 0.6;
  B.carPark(pA0, W - 0.3);
  B.pave('yard', 0.3, D - 3.2, 0.3 + sw, D - 0.4, 'pad');
  B.put('town:dumpster', sw * 0.3 + 0.5, D - 1.3);
  B.put('town:delivery_crates', sw * 0.7 + 0.2, D - 1.2);
  B.put('expansion:hvac-unit', ca, sb + sd + 0.8);
  B.put(pick(r, TREES), 0.6, D - 0.6, { plant: true });
  B.put(pick(r, TREES), W - 0.6, sb + 0.6, { plant: true });
  if (tour) { B.put('world:bench', W - 1.0, sb + 1.6); B.put(pick(r, TREES), W - 0.6, D - 2.2, { plant: true }); }
}

/** a civic building (or a back view) on a paved forecourt, trees in a row, benches and street lamps */
function civic(B: Build, st: ComposeState) {
  const { W, D, r, rear, flip } = B;
  const cs = specFit(B, rear ? SHOP_REAR : CIVIC, W - 1.6, D - 6, { flip });
  if (!cs) return;
  const ea = B.ea(cs), eb = B.eb(cs), sb = 3 + 1.5 * r();
  B.at(cs, W / 2, sb + eb);
  B.pave('yard', W / 2 - ea - 0.8, 0, W / 2 + ea + 0.8, sb, 'paving');
  for (let a = 0.8; a <= W - 0.8; a += 2) B.put(pick(r, TREES), a, 0.7, { plant: true });
  B.put('world:bench', W / 2 - ea - 1.4, sb - 0.6);
  B.put('world:bench', W / 2 + ea + 1.4, sb - 0.6);
  B.put('world:streetlamp', 0.4, -0.4, { street: true });
  B.put('world:streetlamp', W - 0.4, -0.4, { street: true });
  if (st.decline >= 1) B.put(pick(r, BUSHES), W / 2, sb + 2 * eb + 1, { plant: true });
}

/** a yard of gravel with a shed at the back, a chain-link fence with a gate gap at the front, clutter clusters and a pickup */
function ind(B: Build, st: ComposeState) {
  const { W, D, r, flip } = B;
  B.pave('yard', 0.4, 0.4, W - 0.4, D - 0.4, 'gravel');
  const shed = st.decline >= 2 ? ['expansion:abandoned-workshop'] : W >= 12 ? [...SHED, ...BARN] : SHED;
  const sh = specFit(B, shed, W - 0.8, D - 3, { flip });
  if (sh) B.at(sh, W / 2, D - B.eb(sh) - 0.9);
  B.run(CHAIN, 0.4, 0.4, W - 0.4, 0.4, [0.35, 0.65]);
  B.run(CHAIN, 0.4, 0.4, 0.4, D - 0.4);
  B.run(CHAIN, W - 0.4, 0.4, W - 0.4, D - 0.4);
  B.run(CHAIN, 0.4, D - 0.4, W - 0.4, D - 0.4);
  const k = 2 + Math.floor(r() * 3);
  for (let i = 0; i < k; i++) {
    const ca = 1.5 + r() * Math.max(0, W - 3), cb = 2.5 + r() * Math.max(0, D - 7);
    for (let j = 0; j < 3; j++) B.put(pick(r, CLUTTER), ca + (r() - 0.5) * 2.4, cb + (r() - 0.5) * 2.4);
  }
  B.vehicle(PICKUPS, W / 2 + 1.5, 1.2);
}

/** a construction site: dirt, cement bags, rubble, a cable spool, a pickup and a temporary fence; no building */
function site(B: Build) {
  const { W, D, r, flip } = B;
  B.pave('yard', 0.3, 0.3, W - 0.3, D - 0.3, 'dirt');
  B.put('expansion:cement-bags', 1.2, 1.6);
  B.put('expansion:cement-bags', 2.2, 1.2);
  B.put('expansion:concrete-rubble', W - 1.6, 2.2);
  B.put('expansion:cable-spool', W - 1.4, D - 2.2);
  B.vehicle(PICKUPS, W / 2, 0.8);
  B.run(CHAIN, 0.4, 0.4, W - 0.4, 0.4, [0.35, 0.65]);
  if (r() < 0.5) B.put(pick(r, JUNK), W / 2, D - 1.5, { flip });
}

/** a vacant lot: a few weeds and a tree */
function vacant(B: Build) {
  const { W, D, r } = B;
  B.put(pick(r, BUSHES), W * 0.3, D * 0.5, { plant: true });
  B.put(pick(r, BUSHES), W * 0.7, D * 0.7, { plant: true });
  B.put(pick(r, TREES), W * 0.5, D * 0.3, { plant: true });
}

/** The composition of a lot in a given state: deterministic from the lot, its use, level, decline and seed. */
export function compose(lot: Lot, st: ComposeState): Composition {
  const B = new Build(lot, mulberry(mix(st.seed, st.use, st.level, st.decline)));
  B.noCars = st.decline >= 3;
  if (st.use === LU.NONE || st.level === LV.EMPTY) vacant(B);
  else if (st.level === LV.BUILDING) site(B);
  else if (st.use === LU.RES) res(B, st);
  else if (st.use === LU.COM) com(B, st, false);
  else if (st.use === LU.TOUR) com(B, st, true);
  else if (st.use === LU.IND) ind(B, st);
  else civic(B, st);
  if (st.decline >= 1) {
    B.thin(1 / 3);
    B.scatter(JUNK, 0.5, B.D * 0.5, B.W - 0.5, B.D - 0.5, st.decline >= 3 ? 2 : 1);
  }
  if (st.decline >= 3) B.scatter(BUSHES, 0.5, 0.5, B.W - 0.5, B.D - 0.5, 4, { plant: true });
  return B.done();
}
