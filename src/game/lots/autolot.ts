// T305 (#890; the owner, 2026-11-02: "you can make lots bigger if that makes it easier for you. you made really good looking farms we can always make the
// smaller lots presets and bigger ones auto gen"; the lead's brief: "BIG lots are generated, the way the farms are"): a whole lot laid out by its
// template, in the lot's own preset frame (x along the street, 0..w; y away from it, 0..d; the verge at y < 0), as farms.ts lays a parcel. Each slot
// is filled from the lot groups (groups.ts membersOf, T297: pictures the owner has already used in that kind of place) and fitted to its spot with
// the composer's footprints (frameHalf) and picture limits (PIXEL_LIMIT). A slot whose member does not fit, or overlaps beyond the composer's OVERLAP,
// is skipped, never forced. A building faces the street in the view for the lot's road: on a screen-straight road the screen-axis views (roadView;
// view 0 is the front to the street), on any other road its four views turned (turned). Pure: no DOM, deterministic for (size, road, use, state,
// tier, seed). The fences a lot owns are laid as compose's boundary fence does (the side at the higher world end, the back when n points +x/+y).
import { LIBRARY } from '../library';
import { isBuilding } from '../mirror';
import { PIXEL_LIMIT } from '../sizes';
import REMOVED from '../../../scripts/assets/removed.json';
import ALLOC_JSON from './house-allocations.json';
import { FRONTAL } from './frontal';
import { SHOP_PALETTE, colourOf, tryOrder } from './variety';
import { frameHalf, houseFamilies } from './house-class';
import { allows, parseAllocations } from './house-alloc';
import { tierOf } from './tiers';
import { membersOf, roleOf, type Role, type Zone } from './groups';
import { facingOf, frameOf, roadOf, type PresetFrame } from './preset-frame';
import { axisSetOf, drawnView, faces, isVehicle, ownerScaleOf } from './preset-art';
import { CHAIN, OVERLAP, PRIVACY, mix, share, type Box4, type LotGeom } from './compose-core';
import { mulberry } from '../iso';
import { carPark } from './carpark-lot';
import { parsePresets, type Fitted, type LotPreset, type PresetPatch, type PresetProp, type PresetState, type PresetUse, type Road, type View } from './presets';
import PRESET_JSON from './lot-presets.json';

/** the templates a lot draws (the lot lab's picker lists them all): a house, a corner house, a trailer park, a junk yard and a small shop */
export type AutoTemplate = 'house' | 'corner' | 'trailer' | 'junk' | 'shop';
export const AUTO_TEMPLATES: readonly AutoTemplate[] = ['house', 'corner', 'trailer', 'junk', 'shop'];
/** the template a lot of a use, tier and seed draws: res splits by the seed (a house, a corner house, and on a starter lot a quarter trailer parks);
 *  ind is a junk yard, com a small shop; a park, a tour venue and a civic lot have none (null) */
export function templateOf(use: PresetUse, tier: number, seed: number): AutoTemplate | null {
  if (use === 'res') return tier === 0 && seed % 4 === 0 ? 'trailer' : seed % 3 === 0 ? 'corner' : 'house';
  if (use === 'ind') return 'junk';
  if (use === 'com') return 'shop';
  return null;
}

const LIB_AT = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
const BYID = new Map(LIBRARY.map(it => [it.id, it] as const));
/** a picture the owner removed, or one the library lacks: never drawn */
const gone = (id: string): boolean => !!(REMOVED as Record<string, unknown>)[id] || !LIB_AT.has(id);
const ALLOC = parseAllocations(ALLOC_JSON);
const EPS = 1e-6;
/** the main building's front set-back from the street, its back yard, the fence the lot's side runs to (tiles; compose's FENCE_FRONT), the verge */
const FRONT = 4.5, BACK = 3.5, FENCE_FRONT = 3.65, VERGE = -1.5;
let TEX: Map<string, string> | null = null;
/** the texture a patch kind takes for a use and state (T305 owner's list: the patches the presets use): the most common tex of that kind in the shipped
 *  presets (lot-presets.json, read once); the fallback when no preset has the pair */
export function texOf(use: PresetUse, state: PresetState, kind: PresetPatch['kind'], fallback: string): string {
  if (!TEX) {
    const n = new Map<string, Map<string, number>>();
    for (const p of parsePresets(PRESET_JSON).presets) for (const a of p.patches) {
      const k = `${p.use}|${p.state}|${a.kind}`, m = n.get(k) ?? new Map<string, number>();
      m.set(a.tex, (m.get(a.tex) ?? 0) + 1); n.set(k, m);
    }
    TEX = new Map([...n].map(([k, m]) => [k, [...m].sort((x, y) => y[1] - x[1])[0]![0]] as const));
  }
  return TEX.get(`${use}|${state}|${kind}`) ?? fallback;
}
/** the owned boundary: the preset x of the side line the lot owns and whether it owns its back (compose's boundaryFence rule) */
interface Own { side: number; back: boolean }
/** a template's seed salts (the lot's draws differ by template) */
const SALT: Record<AutoTemplate, number> = { house: 0x51, corner: 0x52, trailer: 0x53, junk: 0x54, shop: 0x55 };

let HOUSE_ODD: string[] | null = null, HOUSE_EVEN: string[] | null = null;
/** the pieces with a screen-axis set that are not houses: a back yard's set or deck, a pool, a shop of the industry, a warehouse (the house pick skips them) */
const BACK_PIECE = /back|swing|deck|porch|pool|screen|bbq|patio|rear|gazebo|tent|bench|shed|garden|industrial|auto-body|warehouse|corrugated/i;
/** the houses a road shows: the house-kind buildings with a screen-axis set on a screen-straight road (not garages or sheds), else the dwelling
 *  family (houseFamilies) not frontal and not removed; sorted, made once */
function housesOf(road: Road): string[] {
  if (road % 2) return HOUSE_ODD ??= LIBRARY.filter(it => isBuilding(it) && (it.kind === 'building' || it.kind === 'house') && roleOf(it.id) === 'house'
    && !it.id.startsWith('view:') && !it.id.startsWith('east:') && axisSetOf(it.id) !== null && !gone(it.id) && !BACK_PIECE.test(it.id)).map(it => it.id).sort();
  return HOUSE_EVEN ??= (houseFamilies().get('dwelling')?.ids ?? []).filter(id => !FRONTAL.has(id) && !gone(id)).sort();
}
const WHEEL_STOP = 'expansion:wheel-stop';
const TRAILERS = ['expansion:mobile-home', 'expansion:camper', 'expansion:pop-up-caravan'];
const YARD_THINGS = ['town:picnic_table', 'expansion:carseat-bench', 'expansion:backyard-tent', 'expansion:ham-radio-bench'];
const JUNK_PILES = ['expansion:scrap-metal', 'expansion:tyre-stack', 'expansion:scrap-engine', 'expansion:crushed-car-stack'];
const JUNK_CARS = ['expansion:junk-car', 'expansion:scrap-pickup-rear', 'expansion:crushed-car-stack'];

/** one lot's layout in the preset frame: its props and ground patches (the composer's footprints and overlap rule), filled as the template asks */
class Lay {
  readonly props: PresetProp[] = [];
  readonly patches: PresetPatch[] = [];
  readonly boxes: Box4[] = [];
  constructor(readonly f: PresetFrame, readonly W: number, readonly D: number, readonly use: PresetUse, readonly state: PresetState, readonly road: Road,
    readonly tier: number, readonly r: () => number) {}
  /** a piece's half extents along x and y (frameHalf: its view turned, its scale, its owner size) */
  half(q: PresetProp) { return frameHalf(this.f)(q); }
  boxOf(q: PresetProp): Box4 { const h = this.half(q); return [q.x - h.ha, q.y - h.hb, q.x + h.ha, q.y + h.hb]; }
  /** a box inside the lot (its verge in front) */
  inside(b: Box4): boolean { return b[0] >= -EPS && b[2] <= this.W + EPS && b[1] >= VERGE && b[3] <= this.D + EPS; }
  /** adds a piece if it lies in the lot and shares no more than OVERLAP with another (the composer's rule); false, nothing added, otherwise */
  add(q: PresetProp): boolean {
    const b = this.boxOf(q);
    if (!this.inside(b) || this.boxes.some(p => share(b, p) > OVERLAP)) return false;
    this.props.push(q); this.boxes.push(b); return true;
  }
  /** the piece of id at its scale to fit a spot (cx, cy: its centre; ha, hb: the half extents it may take): the largest scale up to 1 that fits, the
   *  picture's pixel limit kept, null below least (a piece is skipped, never shrunk past it) */
  fit(id: string, view: View, cx: number, cy: number, ha: number, hb: number, least = 0.7): PresetProp | null {
    const one = this.half({ id, x: cx, y: cy, scale: 1, view }), lim = PIXEL_LIMIT[LIB_AT.get(drawnView(id, this.f, view).id) ?? -1] ?? 0;
    // T308 (#893): a car is drawn at the road cars' size (scale 1) or not at all: a car shrunk to a spot was the tiny car in the drive
    if (isVehicle(id)) return ha >= one.ha - 1e-9 && hb >= one.hb - 1e-9 ? { id, x: cx, y: cy, scale: 1, view } : null;
    const k = Math.floor(Math.min(1, ha / one.ha, hb / one.hb, lim / ownerScaleOf(id)) * 100) / 100;
    return k >= least ? { id, x: cx, y: cy, scale: k, view } : null;
  }
  /** the first piece of a list (from a seeded place in it) that fits the spot and is clear; false when none does. Buildings only of the lot's tier and
   *  facing its road (tierOf, faces); the list is a group's members (groups.ts) or a fixed set of ids */
  pick(list: readonly string[], view: View, cx: number, cy: number, ha: number, hb: number, least = 0.7, from?: number): boolean {
    const n = list.length; if (!n) return false;
    // (from: the list is in its order of choice, tried from that place; the draw is still taken, so the lot's later draws stay as they were)
    const r = Math.floor(this.r() * n), at = from ?? r;
    for (let t = 0, tried = 0; t < n && tried < 24; t++) {
      const id = list[(at + t) % n]!;
      if (gone(id)) continue;
      const it = BYID.get(id); if (it && isBuilding(it) && (tierOf(id) > this.tier || !faces(id, this.road))) continue;
      tried++;
      const q = this.fit(id, view, cx, cy, ha, hb, least);
      if (q && this.add(q)) return true;
    }
    return false;
  }
  /** a member of a group cell (membersOf: this lot's use and state, the zone, the role; any size) in the spot */
  group(role: Role, zone: Zone, cx: number, cy: number, ha: number, hb: number, least = 0.7): boolean {
    return this.pick(membersOf(this.use, this.state, zone, role), 0, cx, cy, ha, hb, least);
  }
  /** a ground patch over a rectangle (clamped to the lot), with its painted lines (x0, y0, x1, y1 pairs) when given */
  patch(kind: PresetPatch['kind'], tex: string, x0: number, y0: number, x1: number, y1: number, lines?: number[]) {
    const a = Math.max(0, x0), b = Math.max(0, y0), c = Math.min(this.W, x1), d = Math.min(this.D, y1);
    if (c - a < 0.5 || d - b < 0.5) return;
    this.patches.push({ kind, tex, pts: [a, b, c, b, c, d, a, d], ...(lines ? { lines } : {}) });
  }
  /** T314 (#899): a small worn patch of bare ground (a soft, irregular blob of dirt: the ground's soft dirt edge feathers it), centred at (cx, cy) with
   *  half extents ra along x and rb along y (tiles), kept inside the lot. Dirt only ever lies in these: under a play set, by a shed, at a drive's end */
  worn(cx: number, cy: number, ra: number, rb: number) {
    if (ra < 0.3 || rb < 0.3) return;
    const n = 11, ph = this.r() * 2 * Math.PI, pts: number[] = [];
    for (let k = 0; k < n; k++) {
      const a = ph + (k / n) * 2 * Math.PI, s = 0.72 + 0.36 * this.r();
      pts.push(Math.min(this.W - 0.1, Math.max(0.1, cx + Math.cos(a) * ra * s)), Math.min(this.D - 0.1, Math.max(0.1, cy + Math.sin(a) * rb * s)));
    }
    this.patches.push({ kind: 'yard', tex: 'dirt', pts });
  }
  /** a run of fence pieces end to end from (x0, y0) to (x1, y1), kind.x along x and kind.y along y; gap: the fraction [t0, t1] of the run left open (a gate) */
  fence(kind: { x: string; y: string }, x0: number, y0: number, x1: number, y1: number, gap?: [number, number]) {
    const ax = Math.abs(x1 - x0) >= Math.abs(y1 - y0), id = ax ? kind.x : kind.y, L = Math.hypot(x1 - x0, y1 - y0);
    if (!BYID.has(id)) return;
    const one = this.half({ id, x: 0, y: 0, scale: 1, view: 0 }), step = 2 * (ax ? one.ha : one.hb);
    if (!(step > 0) || L < step) return;
    const n = Math.floor(L / step + 1e-9), left = (L - n * step) / 2;
    for (let i = 0; i < n; i++) {
      const t = (left + (i + 0.5) * step) / L;
      if (gap && t >= gap[0] && t <= gap[1]) continue;
      this.props.push({ id, x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, scale: 1, view: 0 });
    }
  }
}

/** the boundary fence a lot owns, as compose's boundaryFence lays it: its side line from the back to FENCE_FRONT from the street, and its back */
function ownFence(L: Lay, own: Own, kind: { x: string; y: string }) {
  const sx = own.side === 0 ? 0.12 : L.W - 0.12;
  L.fence(kind, sx, L.D, sx, Math.min(L.D, FENCE_FRONT));
  if (own.back) L.fence(kind, 0.12, L.D - 0.12, L.W - 0.12, L.D - 0.12);
}

/** a house lot: the main house at its front set-back facing the street, on the side away from the drive; with a drive (a lot 14 tiles or more) a
 *  drive from the street to a garage or carport on the other side (its front to the street), a parked car on the drive, a shed behind; a front walk,
 *  planters on the front lawn; the back yard with a patio or a play set; the bins at the kerb and the mailbox; T314 (#899): the yard trees (yardTrees)
 *  and the owned boundary (boundary). The yards are lawn: no bed or yard rectangle, bare ground only in small worn patches (Lay.worn) under the play
 *  set or patio, by the shed and at an open drive's end. A corner house has no drive. False when the house does not fit (the caller tries another layout) */
function houseLot(L: Lay, corner: boolean, left: boolean, own: Own, drive: boolean): boolean {
  const { W, D, road, state } = L, fr = Math.min(FRONT, 0.25 * D), bk = Math.min(BACK, 0.2 * D);
  const hx0 = drive ? (left ? 4.2 : 0.8) : corner ? (left ? 0.8 : 3.2) : 0.8, hx1 = drive ? (left ? W - 0.8 : W - 4.2) : corner ? (left ? W - 3.2 : W - 0.8) : W - 0.8;
  const maxHb = (D - fr - bk) / 2;
  if (maxHb < 2 || hx1 - hx0 < 4) return false;
  const cx = (hx0 + hx1) / 2, cy = fr + maxHb, ha = (hx1 - hx0) / 2;
  if (!L.pick(housesOf(road).filter(id => allows(ALLOC, id, road, state)), 0, cx, cy, ha, maxHb, 0.75)) return false;
  const hb = L.boxOf(L.props[L.props.length - 1]!), fy = hb[1], by = hb[3];
  const dx = left ? 2.3 : W - 2.3, edge = left ? dx : W - dx;
  // (what the trees keep clear of: the house, the drive and garage, the walk; what the boundary keeps clear of: the drive)
  const keep: Keep[] = [{ b: hb, m: 1.6 }], open: Box4[] = [];
  let driveEnd = 0;
  if (drive) {
    const gh = Math.min(3.2, (D - fr - 3) / 2);
    let g: Box4 | null = null;
    if (gh >= 1.2 && edge - 0.4 >= 1.2 && L.group('garage', 'side', dx, fr + gh, Math.min(2.6, edge - 0.4), gh)) g = L.boxOf(L.props[L.props.length - 1]!);
    driveEnd = g ? g[1] + 0.3 : fr;
    L.patch('drive', texOf(L.use, state, 'drive', 'paving'), dx - 1.3, 0, dx + 1.3, driveEnd);
    const db: Box4 = [dx - 1.3, 0, dx + 1.3, driveEnd];
    keep.push({ b: db, m: 1.1 }); open.push(db);
    if (g) keep.push({ b: g, m: 1.2 });
    else L.worn(dx, driveEnd + 0.6, 1.1, 0.6);
    L.group('car', 'side', dx, driveEnd / 2, 1.4, Math.max(1.2, driveEnd / 2 - 0.1), 0.6);
    if (L.group('shed', 'back', dx, D - 1.8, 1.6, 1.6, 0.5)) { const s = L.boxOf(L.props[L.props.length - 1]!); keep.push({ b: s, m: 1.0 }); L.worn((s[0] + s[2]) / 2, s[1] - 0.5, Math.min(1.1, (s[2] - s[0]) / 2 + 0.2), 0.55); }
  }
  L.patch('walk', texOf(L.use, state, 'walk', 'paving'), cx - 0.7, 0, cx + 0.7, fy + 0.2);
  keep.push({ b: [cx - 0.7, 0, cx + 0.7, fy + 0.2], m: 1.0 });
  L.group('bin', 'front', left && drive ? W - 0.8 : 0.8, -0.4, 0.8, 0.6, 0.5);
  L.pick(['world:mailbox'], 0, cx + (cx < W / 2 ? 1.4 : -1.4), -0.4, 0.45, 0.45);
  for (let k = 0; k < 3; k++) { const x = hx0 + (k + 0.5) * (hx1 - hx0) / 3; if (Math.abs(x - cx) > 1.4) L.group('planter', 'front', x, 2.4, 1.2, 1.2, 0.5); }
  if (D - by > 3) {
    const zh = (D - by) / 2 - 0.3, zc = (by + D) / 2;
    if (L.group(seedBit(L) ? 'play' : 'patio', 'back', cx, zc, ha - 0.6, zh) || L.group('patio', 'back', cx, zc, ha - 0.6, zh)) {
      const s = L.boxOf(L.props[L.props.length - 1]!);
      keep.push({ b: s, m: 0.8 });
      L.worn((s[0] + s[2]) / 2, (s[1] + s[3]) / 2, Math.min(1.8, (s[2] - s[0]) / 2 + 0.4), Math.min(1.5, (s[3] - s[1]) / 2 + 0.4));
    }
  }
  yardTrees(L, keep);
  boundary(L, own, open);
  return true;
}
/** a seeded bit of the lot's draws (the same lot lays the same): one draw from the lot's stream, once per call site */
const seedBit = (L: Lay): boolean => L.r() < 0.5;

/** a trailer park (starter tier): a gravel lane in from the street down the middle, mobile homes, campers and pop-up caravans in rows either side, a
 *  picnic table by the lane, junk at the back, the owned chain-link fence */
function trailerLot(L: Lay): boolean {
  const { W, D } = L, lx0 = W / 2 - 1.5, lx1 = W / 2 + 1.5;
  L.patch('yard', 'gravel', lx0, 0, lx1, D);
  let homes = 0;
  // each home has a small yard of its own on its outer side: a table or a chair set, a junk car or a bin, and the trees along the back
  for (let y = 4.6; y + 2.3 <= D - 0.5; y += 4.6) for (const side of [0, 1]) {
    const x0 = side ? lx1 + 0.4 : 0.5, x1 = side ? W - 0.5 : lx0 - 0.4, ox = side ? W - 1.1 : 1.1;
    if (x1 - x0 < 3 || !L.pick(TRAILERS, 0, (x0 + x1) / 2, y, (x1 - x0) / 2, 2.3, 1)) continue;
    homes++;
    L.pick(YARD_THINGS, 0, ox, y - 1.2, 0.8, 0.8, 0.5);
    L.pick(['expansion:junk-car', 'world:trashcan'], 0, ox, y + 1.4, 0.9, 1.1, 0.5);
  }
  if (!homes) return false;
  for (let k = 0; k < 3; k++) L.group('tree', 'back', (k + 0.5) * W / 3, D - 1.6, 1.6, 1.6, 0.5);
  // the fence on three sides (the lane is the open side)
  const f = 0.12;
  L.fence(CHAIN, f, D - f, W - f, D - f);
  L.fence(CHAIN, f, 0, f, D - f);
  L.fence(CHAIN, W - f, 0, W - f, D - f);
  return true;
}

/** a junk yard (industry): chain-link round the lot with a gate in the middle of the street side, a junkyard crane at the back, an office at the front,
 *  junk cars and scrap piles in a grid on the gravel */
function junkLot(L: Lay): boolean {
  const { W, D } = L;
  L.patch('yard', texOf(L.use, L.state, 'yard', 'gravel'), 0, 0, W, D);
  const g0 = (W / 2 - 2 - 0.3) / (W - 0.6), g1 = (W / 2 + 2 - 0.3) / (W - 0.6);
  L.fence(CHAIN, 0.3, 0.3, W - 0.3, 0.3, [g0, g1]);
  L.fence(CHAIN, 0.3, 0.3, 0.3, D - 0.3);
  L.fence(CHAIN, W - 0.3, 0.3, W - 0.3, D - 0.3);
  L.fence(CHAIN, 0.3, D - 0.3, W - 0.3, D - 0.3);
  const crane = L.pick(['expansion:junkyard-crane'], 0, W / 2, D - 3.2, 2.2, 2.2, 0.6);
  L.group('shed', 'front', 2.2, 2.4, 1.6, 1.6) || L.group('junk', 'front', 2.2, 2.4, 1.2, 1.2);
  let placed = crane ? 1 : 0;
  // (T305 owner's list: 10 to 16 junk pieces in rough rows; the rows stop at 16)
  for (let y = 5.5; y < D - 6 && placed < 16; y += 4.2) for (let x = 1.5; x < W - 1.5 && placed < 16; x += 3.2) {
    // (the learned industrial cells hold few cars and no scrap in the middle: a fixed junk piece then, so a yard always has its junk)
    if (L.group('car', 'middle', x, y, 1.4, 2.4, 0.6) || L.pick(JUNK_CARS, 0, x, y, 1.4, 2.4, 0.6)) placed++;
    else if (L.group('junk', 'middle', x, y, 1.4, 1.4, 0.5) || L.pick(JUNK_PILES, 0, x, y, 1.4, 1.4, 0.5)) placed++;
  }
  return placed > 1;
}

/** a small shop at the street (a shop front of the palette its road and tier allow) with its car park beside it (carpark-lot.ts: one row of bays square to the
 *  street, a 6 m aisle in front, a car nose out in each bay, the painted lines on the car park patch only), the yard grass round it, a lamp at each end of
 *  the frontage, the owned fence. Everything sits on the lot's own frame: no piece at a free angle */
function shopLot(L: Lay, own: Own, first: number): boolean {
  const { W, D, road, f } = L, sw = Math.min(W * 0.45, W - 6), hb = D * 0.4;
  L.patch('yard', texOf('park', L.state, 'yard', 'grass'), 0, 0, W, D);
  // T331 (#945): the shop of the lot's business or colour on the street lattice first (as a preset shop lot: compose.ts shopPlan), then the next
  // colours; a seeded place in the list showed the same few shops side by side and across the street (and a named one twice to a block)
  const shops = tryOrder(first, SHOP_PALETTE.length).map(c => SHOP_PALETTE[c]!).filter(id => !gone(id) && faces(id, road));
  if (!L.pick(shops, 0, sw / 2 + 0.3, 1.0 + hb, sw / 2 - 0.3, hb, 0.7, 0)) return false;
  const sb = L.boxOf(L.props[L.props.length - 1]!);
  const park = carPark(f, Math.min(W - 1, sb[2] + 0.5), W - 0.3, Math.floor(L.r() * 4096));
  if (park) {
    L.patch('lot', texOf(L.use, L.state, 'lot', 'asphalt'), park.x0, 0, park.x1, park.y1, park.lines);
    for (const c of park.cars) L.add(c);
    // a wheel stop at each bay's far end, only where the bays run along the preset's y (frame turn 0: the stop's picture lies across the bay) and
    // the picture fits the bay's width (L.fit: the largest scale that fits, never past its pixels; none when it does not fit)
    if (f.q === 0) { const bw = (park.x1 - park.x0) / park.bays; for (let k = 0; k < park.bays; k++) { const q = L.fit(WHEEL_STOP, 0, park.x0 + (k + 0.5) * bw, park.y1 - 0.4, bw / 2 - 0.02, 0.2, 0.7); if (q) L.add(q); } }
  }
  // street furniture in an evenly spaced row on the grass in front of the shop, inside the lot (the aisle is over the car park, never here): view 0 faces the street
  ['world:bench', 'world:trashcan', 'world:bench', 'world:trashcan'].forEach((id, k) => L.pick([id], 0, (k + 0.5) * sw / 4, 0.5, 0.6, 0.4, 0.5));
  L.pick(['world:streetlamp'], 0, 0.8, -0.4, 0.4, 0.4);
  L.pick(['world:streetlamp'], 0, W - 0.8, -0.4, 0.4, 0.4);
  ownFence(L, own, PRIVACY);
  return true;
}

/** a plot no template fits (a lot too shallow for a house, say): planters by the street, the yard trees and the owned boundary, so the lot is never bare */
function plotLot(L: Lay, own: Own): boolean {
  const { W } = L;
  L.group('planter', 'front', 1.5, 2, 1.2, 1.2, 0.5);
  L.group('planter', 'front', W - 1.5, 2, 1.2, 1.2, 0.5);
  yardTrees(L, []);
  boundary(L, own, []);
  return true;
}

// ---------- T314 (#899; the owner, 2026-11-03: "these lots have no trees for some reason and no fences and the yards have a lot of hard cutoff ground dirt
// textures that look unnatural. i want to have a lot of trees on the vertical lots to hide any weird unnatural issues")
/** a tree's least scale; the fewest and most trees a house lot takes (yardTrees: by its area, TREE_AREA tiles² a tree) */
const TREE_LEAST = 0.55, TREES_MIN = 3, TREES_MAX = 8, TREE_AREA = 45;
/** a box in the preset frame and the gap (tiles) a tree's trunk keeps from it */
interface Keep { b: Box4; m: number }
/** the distance (tiles) from a point to a box, 0 inside it */
const gapTo = (b: Box4, x: number, y: number): number => Math.hypot(Math.max(b[0] - x, 0, x - b[2]), Math.max(b[1] - y, 0, y - b[3]));
let REAL_TREES: string[] | null = null;
/** the owner's 56 real trees (library cat 'New: Trees'; their NE view, as the decor menu offers them), the leafed ones (no bare or dead tree in a yard) */
function realTrees(): string[] {
  return REAL_TREES ??= LIBRARY.filter(it => it.kind === 'tree' && it.cat === 'New: Trees' && it.id.endsWith(':ne') && !/bare|dead|stump/.test(it.id) && !gone(it.id)).map(it => it.id).sort();
}
/** one yard tree at (x, y) clear of the kept boxes (each gap times slack): from the lot groups' trees of the zone (the owner's own picks) or the real
 *  trees, by a draw; the largest scale that fits, then drawn down a little (0.72..1 of it, never under TREE_LEAST) so a row mixes sizes. False when
 *  none fits or the spot is not clear */
function treeAt(L: Lay, zone: Zone, x: number, y: number, keep: readonly Keep[], slack = 1): boolean {
  if (keep.some(k => gapTo(k.b, x, y) < k.m * slack)) return false;
  const own = membersOf(L.use, L.state, zone, 'tree'), real = realTrees();
  const list = own.length && (!real.length || L.r() < 0.4) ? own : real;
  if (!L.pick(list, 0, x, y, 1.4, 1.4, TREE_LEAST)) return false;
  const i = L.props.length - 1, q = L.props[i]!;
  L.props[i] = { ...q, scale: Math.max(Math.min(q.scale, TREE_LEAST), Math.floor(q.scale * (0.72 + 0.28 * L.r()) * 100) / 100) };
  return true;
}
/** the yard trees of a house lot (TREES_MIN to TREES_MAX, about one for each TREE_AREA tiles², counting the have it holds already): one or two in the
 *  front yard by its corners, then a row along the back (a fixed depth, so a street's back rows line up and hide the lots' back seams) and columns down
 *  the sides, in turn; each clear of the kept boxes (the house, the drive, the walk, the back set) and of the street. When too few fit, the spots are
 *  tried again with the gaps cut to 60%. Returns the trees the lot holds */
function yardTrees(L: Lay, keep: readonly Keep[], have = 0): number {
  const { W, D } = L, want = Math.min(TREES_MAX, Math.max(TREES_MIN, Math.round(W * D / TREE_AREA)));
  const front: [number, number][] = W >= 12 ? [[1.5, 1.7], [W - 1.5, 1.7]] : [[L.r() < 0.5 ? 1.5 : W - 1.5, 1.7]];
  const back: [number, number][] = [], side: [number, number][] = [];
  for (let x = 1.5 + L.r() * 1.2; x <= W - 1.5; x += 3.4 + L.r() * 1.6) back.push([x, D - 1.4]);
  for (let y = FENCE_FRONT + 1.4 + L.r(); y <= D - 3.4; y += 3.6 + L.r() * 1.4) side.push([1.4, y], [W - 1.4, y]);
  const spots: [Zone, number, number][] = front.map(([x, y]): [Zone, number, number] => ['front', x, y]);
  for (let k = 0; k < Math.max(back.length, side.length); k++) {
    const b = back[k], s = side[k];
    if (b) spots.push(['back', b[0], b[1]]);
    if (s) spots.push(['side', s[0], s[1]]);
  }
  const used = new Set<number>();
  let n = have;
  for (const slack of [1, 0.6]) {
    spots.forEach((s, k) => { if (n < want && !used.has(k) && treeAt(L, s[0], s[1], s[2], keep, slack)) { n++; used.add(k); } });
    if (n >= TREES_MIN) break;
  }
  return n;
}
/** the clipped hedge's shrubs (round ones: they read as a hedge along any line), drawn in turn by the lot's draws */
const HEDGE = ['landscape:bush-deep-green', 'landscape:bush-sage-round', 'world:bush_0', 'landscape:bush-deep-green'];
/** a hedge's shrubs: about HEDGE_STEP tiles apart, each fitted to HEDGE_HALF (tiles) */
const HEDGE_STEP = 1.4, HEDGE_HALF = 1.0;
/** a hedge from (x0, y0) to (x1, y1): its shrubs laid where they are clear (a tree's trunk or a shed leaves a gap; open: the drive, never planted over).
 *  Returns how many were laid */
function hedge(L: Lay, x0: number, y0: number, x1: number, y1: number, open: readonly Box4[]): number {
  const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(len / HEDGE_STEP));
  let laid = 0;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    if (open.some(b => gapTo(b, x, y) < HEDGE_HALF + 0.2)) continue;
    const q = L.fit(HEDGE[Math.floor(L.r() * HEDGE.length)]!, 0, x, y, HEDGE_HALF, HEDGE_HALF, 0.35);
    if (q && L.add(q)) laid++;
  }
  return laid;
}
/** the boundary a house lot owns (ownedOf: one side line, and the back line when it owns it, so a line between two lots is planted or fenced once and a
 *  street's runs meet): on a screen-straight road (odd) a clipped hedge just inside the line, from the back to FENCE_FRONT from the street (no fence
 *  picture runs along a screen axis: an iso panel on a 45-degree line saws, and the composer drops a panel whose turned box leaves the lot); on any other
 *  road compose's board fence on the line. The drive is left open */
function boundary(L: Lay, own: Own, open: readonly Box4[]) {
  if (L.road % 2 === 0) { ownFence(L, own, PRIVACY); return; }
  const e = HEDGE_HALF + 0.05, sx = own.side === 0 ? e : L.W - e;
  hedge(L, sx, Math.min(L.D - e, FENCE_FRONT + 0.4), sx, L.D - e, open);
  if (own.back) hedge(L, e, L.D - e, L.W - e, L.D - e, open);
}
/** a ground patch's bare looks (laid again as worn dirt) and its paved ones */
const BARE_TEX = /dirt|field|gravel|rocky|sand|waste/i, PAVED_TEX = /paving|concrete|slabs|pad/i;
/** a patch's box in the preset frame */
function ptsBox(pts: readonly number[]): Box4 {
  const b: Box4 = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 1 < pts.length; i += 2) { b[0] = Math.min(b[0], pts[i]!); b[2] = Math.max(b[2], pts[i]!); b[1] = Math.min(b[1], pts[i + 1]!); b[3] = Math.max(b[3], pts[i + 1]!); }
  return b;
}
/** the most a bare patch and a paved yard of a dressed preset may cover (tiles², by its box): a bigger one is laid again smaller and soft */
const BARE_MAX = 3, PAVED_MAX = 8;
/** T314 (#899): an approved lab house preset drawn on a screen-straight road, dressed as a generated house lot is: its bare yard or bed rectangles
 *  bigger than BARE_MAX become a small worn patch at their middle and its paved yards bigger than PAVED_MAX a rounded patio inside them (drives, walks
 *  and car parks kept); trees added up to the yard's count (yardTrees: the preset's own trees counted; the buildings, drive and walk kept clear); the
 *  owned hedge. The preset's own props stay as they are (from kept); the added ones come last, from -1. Deterministic from seed; the fit itself on
 *  any other road or use */
export function dressStraight(fit: Fitted, f: PresetFrame, lot: LotGeom, use: PresetUse, state: PresetState, seed: number): Fitted {
  const road = roadOf(lot.n);
  if (use !== 'res' || road % 2 === 0) return fit;
  const L = new Lay(f, lot.w, lot.d, use, state, road, 3, mulberry(mix(seed, 0x314)));
  for (const q of fit.props) { L.props.push(q); L.boxes.push(L.boxOf(q)); }
  const n0 = L.props.length, keep: Keep[] = [], open: Box4[] = [];
  let trees = 0, changed = false;
  for (const q of fit.props) { const it = BYID.get(q.id); if (!it) continue; if (it.kind === 'tree') trees++; else if (isBuilding(it)) keep.push({ b: L.boxOf(q), m: 1.6 }); }
  for (const a of fit.patches) {
    const b = ptsBox(a.pts), w = b[2] - b[0], h = b[3] - b[1], cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    if (a.kind === 'drive' || a.kind === 'walk' || a.kind === 'lot') { L.patches.push(a); keep.push({ b, m: 1.0 }); if (a.kind === 'drive') open.push(b); continue; }
    if ((a.kind === 'bed' || BARE_TEX.test(a.tex)) && w * h > BARE_MAX) { L.worn(cx, cy, Math.min(1.1, w / 2), Math.min(0.9, h / 2)); changed = true; continue; }
    if (PAVED_TEX.test(a.tex) && w * h > PAVED_MAX) {
      // a rounded patio within the rectangle (an ellipse of about PAVED_MAX, its edge a little uneven), its paving kept
      const k = Math.min(1, Math.sqrt(PAVED_MAX / (Math.PI * (w / 2) * (h / 2)))), ra = Math.max(0.6, (w / 2) * k), rb = Math.max(0.6, (h / 2) * k), pts: number[] = [];
      for (let j = 0; j < 14; j++) { const t = (j / 14) * 2 * Math.PI, s = 0.9 + 0.1 * L.r(); pts.push(cx + Math.cos(t) * ra * s, cy + Math.sin(t) * rb * s); }
      L.patches.push({ ...a, pts }); changed = true; continue;
    }
    L.patches.push(a);
  }
  yardTrees(L, keep, trees);
  boundary(L, ownedOf(lot), open);
  const added = L.props.length - n0;
  if (!added && !changed) return fit;
  const from = fit.from.concat(Array.from({ length: added }, () => -1));
  return { ...fit, props: L.props, from, patches: L.patches, ...(fit.standIn ? { standIn: fit.standIn.concat(Array.from({ length: added }, () => undefined)) } : {}) };
}

/** the lot's owned boundary: the preset x of its side line (0 or W) and whether it owns its back (the composer's rule, read in the preset frame) */
function ownedOf(lot: LotGeom): Own {
  const sa = lot.u.x + lot.u.y > 0 ? lot.w : 0, same = lot.u.x * -lot.n.y + lot.u.y * lot.n.x > 0;
  // T314 (#899): on a screen-straight road n is a map diagonal and n.x + n.y is zero (roads 3 and 7: two lots back to back): the one whose n points to +x
  // owns the back, so exactly one of the two plants or fences it (the sum alone left it to rounding: neither, or both)
  const s = lot.n.x + lot.n.y;
  return { side: same ? sa : lot.w - sa, back: Math.abs(s) > 1e-6 ? s > 0 : lot.n.x > 0 };
}

/** the owner's direction (2026-11-02: "you can make lots bigger if that makes it easier for you ... bigger ones auto gen"): a lot at least this wide and
 *  deep (tiles) is generated, not drawn from a preset; the small lots keep the presets and their remix */
export const AUTO_LOT_W = 14, AUTO_LOT_D = 12;
export const isBigLot = (lot: { w: number; d: number }): boolean => lot.w >= AUTO_LOT_W && lot.d >= AUTO_LOT_D;
const CACHE = new Map<string, LotPreset | null>();
/** drops the generated lots (the presets they learn from changed) */
export function clearAutoLots(): void { CACHE.clear(); }
/** a whole lot generated for a lot of w x d tiles on its road: the preset (whole: it draws alone, as a farm does; the owned fences, the street items and the
 *  ground patches all in it), in the lot's preset frame; a plot (fence and planting) when the template does not fit the lot; null only for a use with no template. Cached by its inputs */
export function autoLot(lot: LotGeom, use: PresetUse, tier: number, seed: number, state: PresetState = 'built', template: AutoTemplate | null = templateOf(use, tier, seed), biz?: string): LotPreset | null {
  if (!template) return null;
  // (a shop: the business the town picked for the lot (T295 #2, LotState.biz), else the lot's colour on the street lattice, T270)
  const first = template !== 'shop' ? 0 : biz !== undefined && SHOP_PALETTE.includes(biz) ? SHOP_PALETTE.indexOf(biz) : colourOf(lot, SHOP_PALETTE.length);
  const road = roadOf(lot.n), key = `${lot.w}|${lot.d}|${road}|${facingOf(lot.n)}|${use}|${state}|${tier}|${seed}|${template}|${first}`;
  const hit = CACHE.get(key); if (hit !== undefined) return hit;
  const f = frameOf(lot), own = ownedOf(lot);
  let L: Lay | null = null;
  // a house tries its drive layout first, then the plain one (a lot too narrow for the drive and its house)
  const modes = template === 'house' ? [true, false] : [false];
  for (const drive of modes) {
    const T = new Lay(f, lot.w, lot.d, use, state, road, tier, mulberry(mix(seed, SALT[template], 0x305)));
    const ok = template === 'house' ? houseLot(T, false, (seed >> 2) % 2 === 0, own, drive) : template === 'corner' ? houseLot(T, true, (seed >> 2) % 2 === 0, own, false)
      : template === 'trailer' ? trailerLot(T) : template === 'junk' ? junkLot(T) : shopLot(T, own, first);
    if (ok) { L = T; break; }
  }
  // (the template does not fit: the plot, so the lot is never left bare on a road it has to front)
  if (!L) { const T = new Lay(f, lot.w, lot.d, use, state, road, tier, mulberry(mix(seed, 0x306))); if (plotLot(T, own)) L = T; }
  const out: LotPreset | null = L ? { id: `auto:${template}`, use, state, w: lot.w, d: lot.d, props: L.props, patches: L.patches, whole: true } : null;
  if (CACHE.size > 4096) CACHE.clear();
  CACHE.set(key, out);
  return out;
}
