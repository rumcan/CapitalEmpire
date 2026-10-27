import type { LibItem } from './types';
import OVERRIDES from './shadow-overrides.json';

/** Contact shadows: TrickOrTreat's town-builder base shadows (scripts/town-builder/shadows.mjs shapeFor + render), ported, then made for the
 *  top-right sun (T141, the owner, 2026-10-26: "the shadows should be tailor made for a top right shadow ... some are not right at all").
 *  Each upright sprite casts a feathered ground shape at its base, projected in the 2:1 view: buildings and vehicles their footprint, fences a
 *  thin strip along their run, trees and bushes a round pool sized from the canopy, poles and signs a small dark spot at the pole's foot, round
 *  things (a fountain, a pool, a fire pit) a round pool, other props their base. The GPU draws the shape under every sprite (gl.ts
 *  FS_SHADOW is render()'s formula) and leans it away from the sun, blob and box alike (contactLean). Baked house lots carry their own
 *  shadows (lot-render.mjs) and cast none.
 *
 *  How a sprite's shape is found, in order:
 *  1. its override (shadow-overrides.json, by library id; a turned view shares its NE view's entry, turned with it; a variation set's
 *     `variation:<group>` entry covers each of its pictures): a kind, a size, an offset, the core, the feather, the lean, or no contact or
 *     no cast shadow at all;
 *  2. the kind rules (kindOf): the library kind, then the name's words (whole words: "street" is no tree, "compost" no post);
 *  3. the picture (the trimmed sprite rect as drawn): a box never reaches wider than its picture, sits under the picture's middle, and a
 *     placeholder footprint (business art's 2 x 2 m box under a whole building) is replaced by the picture's base; a spot or a pool stands at
 *     the foot of a picture drawn above its anchor (a stop sign's pole). */

/** a shadow shape: half extents (metres, along the map's x and y), darkness at the base (0..1), the feathered edge (metres), round or boxy */
export interface ShadowShape { hx: number; hy: number; core: number; feather: number; round: boolean; /** at the anchor (round shapes) or the footprint's centre */ atAnchor: boolean }
/** a placed contact shadow: its centre (tiles), its shape, and its lean (a multiplier of the common lean, contactLean; 1 for most) */
export interface ContactShadow { x: number; y: number; hx: number; hy: number; core: number; feather: number; round: boolean; lean: number;
  /** the footprint (tiles) the picture gave in place of a placeholder one (business art's 2 x 2 m box): the cast shadow stands on it */
  foot?: [number, number, number, number] }
export type ShadowKind = 'none' | 'walker' | 'fencex' | 'fencey' | 'vehicle' | 'roundhouse' | 'round' | 'building' | 'tree' | 'pole' | 'plant' | 'prop';
export const SHADOW_KINDS: readonly ShadowKind[] = ['none', 'walker', 'fencex', 'fencey', 'vehicle', 'roundhouse', 'round', 'building', 'tree', 'pole', 'plant', 'prop'];
/** a per-sprite override (shadow-overrides.json). Sizes and offsets are metres at the sprite's scale 1, along the map's x and y as its NE
 *  view (or the sprite itself) stands: hx, hy the half extents (a round kind: hx = hy, the radius), dx, dy the centre's offset from the anchor
 *  (with them the shape stands there instead of on its rule's spot); core the darkness at the base (0..1), feather the soft edge (metres);
 *  lean a multiplier of the common lean (0: straight down); contact false: no contact shadow; cast false: no cast shadow (sprites.ts) */
export interface ShadowOverride { kind?: ShadowKind; hx?: number; hy?: number; dx?: number; dy?: number; core?: number; feather?: number; lean?: number; contact?: boolean; cast?: boolean; note?: string }
/** the override table, by library id (`variation:<group>` for every picture of a variation set) */
export const SHADOW_OVERRIDES: Readonly<Record<string, ShadowOverride>> = OVERRIDES as Record<string, ShadowOverride>;

/** The common lean of every contact shadow (blob and box alike, T141): each shape moves away from the sun, along the cast shadows' angle, by
 *  `frac` of its own reach from its centre to its edge in that direction (so it never slides off its base: a fence's strip moves its own
 *  thin depth, a tree's pool half its radius), at most `max` metres, at the cast shadows' full length (cast-shadow.ts CAST_DEFAULT.length).
 *  2026-10-27: a small lean (was 0.5 / 0.8 m): the contact shadows are an ambient occlusion under their object (shadow-vector.ts CONTACT_AO) */
export const CONTACT_LEAN = { frac: 0.15, max: 0.25 } as const;
const LEAN_LENGTH = 0.9;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
// the name rules, on whole words of the sprite's name and id (lower case, split on anything but letters)
const words = (it: LibItem) => new Set(`${it.name} ${it.id}`.toLowerCase().split(/[^a-z]+/).filter(Boolean));
const any = (w: Set<string>, list: readonly string[]) => list.some(x => w.has(x));
const ROUNDHOUSE = ['fountain', 'merrygoround', 'carousel', 'gazebo', 'bandstand'];
/** small round things: a round pool from their base */
const ROUND = ['trampoline', 'pool', 'firepit', 'birdbath', 'well', 'spool', 'barrel', 'barrels', 'drum', 'urn', 'statue', 'globe', 'tire', 'tyre', 'tires', 'roundabout'];
const PLANT = ['tree', 'trees', 'bush', 'bushes', 'fern', 'hydrangea', 'ornamental', 'mums', 'pumpkin', 'pumpkins', 'hay', 'haybale', 'ghost', 'scarecrow', 'shrub', 'shrubs', 'plant', 'plants', 'planter', 'grass', 'witch', 'lantern', 'flower', 'flowers', 'cactus', 'palm'];
const POLE = ['lamp', 'streetlamp', 'lamppost', 'pole', 'sign', 'signs', 'signpost', 'post', 'posts', 'flag', 'flagpole', 'pin', 'meter', 'bollard', 'signal', 'payphone', 'hydrant', 'mailbox', 'mailboxes', 'goalpost', 'goalposts', 'traffic', 'birdhouse'];
const VEHICLE = ['car', 'cars', 'van', 'pickup', 'bus', 'compact', 'truck', 'wagon', 'stationwagon', 'sedan', 'coupe', 'cart', 'carts', 'taxi', 'schoolbus', 'boat'];
/** words that make a vehicle word something else: a car park's gate, a bus stop, a cart garage, a car-seat bench, a toy */
const NOT_VEHICLE = ['park', 'parking', 'stop', 'shelter', 'garage', 'seat', 'carseat', 'bench', 'kiddie', 'toy', 'shopping', 'pull', 'crushed', 'stack', 'depot', 'company', 'buscompany', 'trailer', 'boathouse'];
/** the building kinds (drawn from building art) */
const BOXY = new Set(['house', 'building', 'venue', 'vending', 'arcade', 'junglegym']);
/** the art inventory's buildings among the business art (views-library BUILDING_IDS): read from the ids, so this file stays free of the art */
const BUSINESS_BUILDING = /^(view:)?business:(buscompany|casino|diner|estate-villa|fishing-boathouse|fishing-cabin|fishing-lodge|fishing-rental-kiosk|golf-cart-garage|golf-clubhouse|golf-driving-range|golf-halfway-pavilion|golf-pro-shop|hotel|motel|sportsbar|stadium|tackle|taxi)(:(se|sw|nw))?$/;

/** a sprite's override and the quarter turns its sizes and offsets take: its own entry, its NE view's (a turned view: view:<id>:se 1, sw 2,
 *  nw 3; east:<id> 1), its variation set's */
export function overrideOf(id: string): { o: ShadowOverride; turn: number } | null {
  let r = OVERRIDE_OF.get(id);
  if (r === undefined) OVERRIDE_OF.set(id, r = findOverride(id));
  return r;
}
/** (overrideOf's answers by id: every moving car and walker asks each frame) */
const OVERRIDE_OF = new Map<string, { o: ShadowOverride; turn: number } | null>();
function findOverride(id: string): { o: ShadowOverride; turn: number } | null {
  const own = SHADOW_OVERRIDES[id]; if (own) return { o: own, turn: 0 };
  const v = /^view:(.+):(se|sw|nw)$/.exec(id);
  if (v) { const o = SHADOW_OVERRIDES[v[1]!]; if (o) return { o, turn: v[2] === 'se' ? 1 : v[2] === 'sw' ? 2 : 3 }; }
  if (id.startsWith('east:')) { const o = SHADOW_OVERRIDES[id.slice(5)]; if (o) return { o, turn: 1 }; }
  const g = /^(variation:.+):\d+$/.exec(id); if (g) { const o = SHADOW_OVERRIDES[g[1]!]; if (o) return { o, turn: 0 }; }
  return null;
}

const KINDS = new Map<LibItem, ShadowKind>();
/** the shadow kind of a library sprite (its override's, else the rules') */
export function kindOf(it: LibItem): ShadowKind {
  let k = KINDS.get(it);
  if (k) return k;
  const o = overrideOf(it.id)?.o;
  k = o?.kind ?? ruleKind(it);
  KINDS.set(it, k);
  return k;
}
/** the kind the name rules give (no override) */
export function ruleKind(it: LibItem): ShadowKind {
  const w = words(it);
  if (it.kind === 'lot') return 'none';
  if (it.kind === 'walker') return 'walker';
  if (it.kind === 'fencex' || it.kind === 'fencey') return it.kind;
  if (it.kind === 'gazebo' || any(w, ROUNDHOUSE)) return 'roundhouse';
  if (BOXY.has(it.kind) || BUSINESS_BUILDING.test(it.id)) return 'building';
  if (it.kind === 'car' || (any(w, VEHICLE) && !any(w, NOT_VEHICLE))) return 'vehicle';
  if (it.kind === 'tree') return 'tree';
  if (it.kind === 'lamp' || any(w, POLE)) return 'pole';
  if (it.kind === 'bush' || any(w, PLANT)) return w.has('tree') || w.has('treehouse') ? 'tree' : 'plant';
  if (w.has('treehouse')) return 'tree';
  if (any(w, ROUND) || (w.has('fire') && w.has('pit'))) return 'round';
  return 'prop';
}

/** the shadow of a library item placed with a footprint of half extents hx, hy (metres) at the given scale, by its kind alone (no picture,
 *  no override's offset); null = none. contactShadow places it */
export function shadowShape(it: LibItem, hx: number, hy: number, scale = 1): ShadowShape | null {
  const kind = kindOf(it), ov = overrideOf(it.id), o = ov?.o;
  if (kind === 'none' || o?.contact === false) return null;
  const s = baseShape(it, kind, hx, hy, scale);
  if (o) {
    const sw = (ov!.turn & 1) === 1, ohx = sw ? o.hy : o.hx, ohy = sw ? o.hx : o.hy;
    if (ohx !== undefined) s.hx = ohx * scale; if (ohy !== undefined) s.hy = ohy * scale;
    if (o.core !== undefined) s.core = o.core; if (o.feather !== undefined) s.feather = o.feather;
  }
  return s;
}
function baseShape(it: LibItem, kind: ShadowKind, hx: number, hy: number, scale: number): ShadowShape {
  switch (kind) {
    case 'walker': return { hx: 0.28, hy: 0.28, core: 0.5, feather: 0.12, round: true, atAnchor: true };
    // fences: a thin strip along the run
    case 'fencex': return { hx: hx * 0.95, hy: 0.16, core: 0.62, feather: 0.14, round: false, atAnchor: false };
    case 'fencey': return { hx: 0.16, hy: hy * 0.95, core: 0.62, feather: 0.14, round: false, atAnchor: false };
    // vehicles: a dark pool that reaches past the body (bumpers, wheels): 1.12 along the length, 1.35 across. A car heading diagonally (its
    // map-axis footprint nearly square, a box round the turned body) gets a round pool the size of the body instead (the owner, 2026-10-22: the
    // box made the diagonal cars' shadows far bigger than the cars)
    case 'vehicle': {
      if (Math.max(hx, hy) < 1.4 * Math.min(hx, hy)) { const r = 0.65 * (hx + hy) / 2; return { hx: r, hy: r, core: 0.95, feather: 0.34, round: true, atAnchor: false }; }
      const [kx, ky] = hx >= hy ? [1.12, 1.35] : [1.35, 1.12]; return { hx: hx * kx, hy: hy * ky, core: 0.95, feather: 0.34, round: false, atAnchor: false };
    }
    // round structures (a gazebo, a fountain, a merry-go-round)
    case 'roundhouse': { const r = clamp(Math.max(hx, hy) * 0.95, 0.5, 4); return { hx: r, hy: r, core: 0.6, feather: 0.3, round: true, atAnchor: false }; }
    // small round things (a trampoline, a pool, a fire pit, a barrel, a statue)
    case 'round': { const r = clamp(Math.max(hx, hy) * 0.9, 0.15, 4); return { hx: r, hy: r, core: 0.6, feather: clamp(r * 0.3, 0.1, 0.3), round: true, atAnchor: false }; }
    // buildings and venues: their footprint
    case 'building': return { hx: hx * 0.97, hy: hy * 0.97, core: 0.55, feather: 0.32, round: false, atAnchor: false };
    // trees: from the canopy (the picture is about two canopy radii across, at 64 px per metre), not the trunk
    case 'tree': { const r = clamp(((it.w * scale) / 64) * 0.32, 0.45, 1.6); return { hx: r, hy: r, core: 0.58, feather: clamp(r * 0.35, 0.12, 0.5), round: true, atAnchor: true }; }
    // poles, lamps, signs, hydrants: small and dark
    case 'pole': { const r = clamp(Math.min(hx, hy) * 0.75, 0.12, 0.35); return { hx: r, hy: r, core: 0.7, feather: 0.1, round: true, atAnchor: true }; }
    // bushes and plants: round, from the base
    case 'plant': { const r = Math.max(0.25, Math.max(hx, hy) * 0.95); return { hx: r, hy: r, core: 0.58, feather: clamp(r * 0.35, 0.12, 0.5), round: true, atAnchor: true }; }
    // other props: their base, at least 0.3 m across both axes, keeping the footprint's aspect
    default: { const sum = hx + hy, s = Math.max(0.3, sum), fx = sum > 0 ? hx / sum : 0.5; return { hx: s * fx * 0.9, hy: s * (1 - fx) * 0.9, core: 0.6, feather: clamp(s * 0.12, 0.1, 0.3), round: false, atAnchor: false }; }
  }
}

/** what contactShadow needs of a drawable: its anchor and footprint (tiles: 2 m each, so a span in tiles is a half extent in metres) and scale */
export interface ShadowSpot { x: number; y: number; x0: number; y0: number; x1: number; y1: number; scale: number }
/** world px of a tile point (iso.ts worldX / worldY, kept here so this file stays pure) */
const WX = (x: number, y: number) => (x - y) * 64, WY = (x: number, y: number) => (x + y) * 32;

/** The contact shadow of item `it` drawn at `d` (anchor and footprint, tiles) with its trimmed picture at `pic` (world px x0 y0 x1 y1, as
 *  sprites.ts spriteRect draws it); null = none. The picture keeps a box under itself: never wider than the picture, centred on its middle,
 *  its front corner no lower than the picture's foot, and a placeholder footprint (far narrower than the picture: business art's 2 x 2 m
 *  box) replaced by the picture's own base. A round shape on the anchor stands at the foot of a picture drawn above the anchor. */
export function contactShadow(it: LibItem, d: ShadowSpot, pic: ArrayLike<number>): ContactShadow | null {
  const ov = overrideOf(it.id), o = ov?.o, s = shadowShape(it, d.x1 - d.x0, d.y1 - d.y0, d.scale);
  if (!s) return null;
  const kind = kindOf(it), lean = o?.lean ?? 1, AY = WY(d.x, d.y);
  const px0 = pic[0]!, px1 = pic[2]!, py1 = pic[3]!, pw = px1 - px0;
  // the override's spot: an offset from the anchor (metres at scale 1, turned with the view)
  if (o && (o.dx !== undefined || o.dy !== undefined)) {
    let dx = o.dx ?? 0, dy = o.dy ?? 0; for (let t = 0; t < (ov!.turn & 3); t++) [dx, dy] = [dy, -dx];
    return { x: d.x + dx * d.scale / 2, y: d.y + dy * d.scale / 2, hx: s.hx, hy: s.hy, core: s.core, feather: s.feather, round: s.round, lean };
  }
  if (s.atAnchor) {
    // a spot (a pole, a sign) stands on its picture's foot, up or down the screen from the anchor (a stop sign, a traffic light, a utility pole
    // are drawn wholly above theirs); a pool (a bush, a tree) goes up to a picture drawn wholly above its anchor
    let x = d.x, y = d.y; const off = py1 - AY, vh = 16 * Math.SQRT2 * s.hy;
    if (pw > 0 && kind === 'pole' && Math.abs(off) > vh + 4) { const t = (off - vh) / 64; x += t; y += t; }
    else if (pw > 0 && kind !== 'walker' && off < -4) { const t = -off / 64; x -= t; y -= t; }
    // a tree drawn with its trunk's foot below its anchor (an old tree scaled up about a high anchor): the pool goes down to the foot
    else if (pw > 0 && kind === 'tree' && off > 8) { const t = (off - 6) / 64; x += t; y += t; }
    return { x, y, hx: s.hx, hy: s.hy, core: s.core, feather: s.feather, round: s.round, lean };
  }
  let cx = (d.x0 + d.x1) / 2, cy = (d.y0 + d.y1) / 2, hx = s.hx, hy = s.hy, placeholder = false;
  const fitted = !(o && (o.hx !== undefined || o.hy !== undefined)) && pw > 8 && kind !== 'fencex' && kind !== 'fencey' && kind !== 'walker';
  if (fitted) {
    // the shape's width on screen: a box's diamond (hx + hy) * 64, an ellipse's 2 * sqrt(hx² + hy²) * 32
    const width = () => (s.round ? 64 * Math.hypot(hx, hy) : 64 * (hx + hy));
    // a placeholder footprint (business art's 2 x 2 m box; a building's far narrower than its picture): the picture's base, square, its foot on
    // the picture's foot (a prop's narrow footprint under a wide picture is its real base: a rotary washing line, a sign on its post)
    if ((placeholderBoxes(it) || kind === 'building') && width() < 0.45 * pw) {
      // (a vehicle's pool: three quarters of its picture's width, its body seen across the corner)
      const h = (kind === 'vehicle' ? 0.75 : 0.88) * pw / 128; hx = s.round ? h * Math.SQRT2 : h; hy = hx; placeholder = true;
      const mid = (px0 + px1) / 2, footY = py1 - 16 * (s.round ? 1.414 * hx : hx + hy);
      // the centre: on screen at (mid, footY), back to tiles
      const a = mid / 64, b = footY / 32; cx = (a + b) / 2; cy = (b - a) / 2;
    } else {
      // narrower than the picture (its widest point is often a roof's eaves or a canopy; a vehicle's pool may reach a little past its body)
      const most = (kind === 'vehicle' ? 1.05 : 0.9) * pw, w = width();
      if (w > most) { const f = most / w; hx *= f; hy *= f; }
      // under the picture's middle: a centre off it by more than an eighth of the picture's width slides across the screen to it
      const CX = WX(cx, cy), mid = (px0 + px1) / 2;
      if (Math.abs(CX - mid) > pw / 8) { const t = (mid - CX) / 128; cx += t; cy -= t; }
      // its front corner no lower than the picture's foot
      const front = WY(cx, cy) + 16 * (s.round ? 1.414 * Math.max(hx, hy) : hx + hy);
      if (front > py1 + 4) { const t = (front - py1 - 4) / 64; cx -= t; cy -= t; }
    }
  }
  const out: ContactShadow = { x: cx, y: cy, hx, hy, core: s.core, feather: s.feather, round: s.round, lean };
  // the picture's base in place of a placeholder footprint, for the cast shadow's foot too (sprites.ts packSprite)
  if (placeholder) out.foot = [cx - hx / 2, cy - hy / 2, cx + hx / 2, cy + hy / 2];
  return out;
}
/** business art's placeholder footprint: one 2 x 2 m box on the anchor under a whole building or a big prop (its contact shadow and its cast
 *  shadow's foot come from the picture instead: contactShadow) */
export const placeholderBoxes = (it: LibItem) => it.kind === 'business' && it.boxes.length === 1 && it.boxes[0]!.hx === 1 && it.boxes[0]!.hy === 1 && it.boxes[0]!.dx === 0 && it.boxes[0]!.dy === 0;

/** does the sprite cast a cast shadow (cast-shadow.ts; an override can turn it off: a flat sprite) */
export function castsShadow(it: LibItem): boolean { return it.kind !== 'lot' && overrideOf(it.id)?.o.cast !== false; }

/** the lean uniform (gl.ts drawShadows uShift): the cast shadows' screen direction, times their length against the default; none when off */
export function contactLean(c: { on: boolean; angle: number; length: number }): { x: number; y: number } {
  const k = c.on ? c.length / LEAN_LENGTH : 0, a = c.angle * Math.PI / 180;
  return k ? { x: Math.cos(a) * k, y: Math.sin(a) * k } : { x: 0, y: 0 };
}
/** the world px a contact shadow moves by (gl.ts VS_SHADOW computes the same per vertex; this copy is for tests and the audit): along the
 *  lean's direction on the ground by CONTACT_LEAN.frac of the shape's reach from its centre to its edge that way, at most CONTACT_LEAN.max m */
export function leanShift(s: Pick<ContactShadow, 'hx' | 'hy' | 'round' | 'lean'>, uShift: { x: number; y: number }): { x: number; y: number } {
  const n = Math.hypot(uShift.x, uShift.y); if (n === 0) return { x: 0, y: 0 };
  const mx = (uShift.x / 32 + uShift.y / 16) / 2, my = (uShift.y / 16 - uShift.x / 32) / 2, m = Math.hypot(mx, my), ux = mx / m, uy = my / m;
  const reach = s.round ? 1 / Math.hypot(ux / s.hx, uy / s.hy) : Math.min(s.hx / Math.max(Math.abs(ux), 1e-4), s.hy / Math.max(Math.abs(uy), 1e-4));
  const lean = Math.min(reach * CONTACT_LEAN.frac, CONTACT_LEAN.max) * s.lean * n;
  return { x: (ux - uy) * 32 * lean, y: (ux + uy) * 16 * lean };
}

/** the shadow's alpha at ground point (X, Y) metres from its centre (render() of shadows.mjs, one sample): darkest at the base, feathered both
 *  inside and outside the edge. The GPU shader (gl.ts FS_SHADOW) computes the same per pixel; this copy is for tests. */
export function shadowAlpha(s: Pick<ShadowShape, 'hx' | 'hy' | 'core' | 'feather' | 'round'>, X: number, Y: number) {
  const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  let d: number;
  if (s.round) d = (Math.hypot(X / s.hx, Y / s.hy) - 1) * Math.min(s.hx, s.hy);
  else { const r = Math.min(0.18, s.hx * 0.5, s.hy * 0.5), qx = Math.abs(X) - s.hx + r, qy = Math.abs(Y) - s.hy + r; d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; }
  const f = s.feather;
  return clamp(s.core * (1 - smooth(-f, f * 1.2, d)) * (0.82 + 0.18 * smooth(0, -Math.min(s.hx, s.hy), d)), 0, 1);
}
