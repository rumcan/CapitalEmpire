/** Upright sprites, organised for drawing: every prop is listed in each draw tile (SPR_W x SPR_H world px) its picture
 *  touches, and each tile keeps its own painter's order. Every instance carries its tile's rectangle and the shader
 *  clips to it, so a prop spanning tiles is drawn once per tile without double blending, each tile's order only has to
 *  be right for the props inside it, and a whole frame is one instanced draw. Edits re-sort only the tiles they touch. Moving vehicles are merged into a tile's order every
 *  frame, after the last prop that is behind them. */
import { SPR_H as CHUNK_H, SPR_W as CHUNK_W, worldX, worldY } from './iso';
import { LIBRARY } from './library';
import { CAR_SCALE } from './ext/car-art';
import { SHADOW_STRIDE, SPRITE_STRIDE, VECTOR_STRIDE } from './gl';
import type { Prop } from './types';
import { castsShadow, contactShadow, placeholderBoxes, type ContactShadow, type ShadowSpot } from './shadow-shape';
import { lookOf } from './newart';
import { vectorMesh, type VectorRange } from './shadow-vector';
import { GLOW_LAYER, LAMP_FLOATS } from './sim/car-lamps';

/** anything drawn like a prop: library item, anchor (tiles), flip, scale, footprint (tiles) */
export interface Drawable { item: number; x: number; y: number; flip: boolean; scale: number; x0: number; y0: number; x1: number; y1: number; /** a moving car (SimClient.visible): already drawn at CAR_SCALE */ moving?: boolean;
  /** drawn this high above its spot (world px, up the screen; T133: the range's upper deck and its golfers): it keeps its footprint for the
   *  painter's order and casts no shadow (what holds it up casts its own) */
  lift?: number;
  /** drawn tinted (T176: a tree New hole's Build would clear): a warm red multiplied in, so the art's own darks stay dark */
  tint?: boolean;
  /** its lamps (T192: a car's lit brake lights, sim/car-lamps.ts; LAMP_FLOATS each: world X, Y, radius, brightness): glow instances packed
   *  right after its picture in its tile's painter's order, so whatever is drawn nearer covers them like the car itself */
  lamps?: number[] }
/** every car is drawn this much smaller than its art, parked (props of kind car, about the middle of their footprint) and moving (SimClient.visible,
 *  about the car's centre): the owner, 2026-10-19, "20% smaller", the parked cars too */
export { CAR_SCALE };
interface DTile { i: number; j: number; props: Set<Prop>; order: Prop[] | null; packed: Float32Array; shadows: Float32Array; rects: Float32Array; buckets: Map<number, number[]>;
  /** the vector shadows (T142) of its props, in sets by their meshes' size (VECTOR_SETS: gl.ts drawVector runs each set to its largest
   *  count), and those counts */
  vsets: Float32Array[]; vmax: number[]; vfar: number[] }
export interface TileDraw { i: number; j: number; shadows: number; sprites: number }

/** the vector shadows (T142, shadow-vector.ts): on, every picture with an entry draws its own contact and cast shapes instead of T141's shape
 *  and silhouette; off, T141's everywhere (the gear menu's comparison; engine.ts setVectorShadows re-packs the tiles) */
export const VECTOR = { on: true };
/** the vector shadows' sets: a mesh of at most this many indices draws in this set (gl.ts drawVector runs every instance of a set to its
 *  largest count, so a few sets of like sizes waste little: half the meshes have under 270 indices, 1% over 490) */
export const VECTOR_SETS = [300, 420, Infinity] as const;
const setOf = (count: number) => { let k = 0; while (count > VECTOR_SETS[k]!) k++; return k; };
/** per library item: its vector mesh's range (null: none, T141's shadows); filled as items are first packed */
const VEC: (VectorRange | null)[] = [];
export const vecOf = (item: number) => VEC[item] !== undefined ? VEC[item]! : (VEC[item] = vectorMesh().at.get(LIBRARY[item]!.id) ?? null);

const BUCKET = 256;
const tkey = (i: number, j: number) => (j + 512) * 4096 + (i + 2048);
const SHADOWED = (it: (typeof LIBRARY)[number]) => it.kind !== 'lot';

/** where a drawable's picture hangs: its anchor (world px), its scale and mirror, and the picture drawn (newart.ts lookOf); null when hidden */
export function spriteAnchor(d0: Drawable): { X: number; Y: number; k: number; flip: boolean; item: number } | null {
  const l = lookOf(d0), it = LIBRARY[l.item]!;
  if (l.hidden) return null;
  const parked = it.kind === 'car' && !d0.moving, f = parked ? CAR_SCALE : 1, x = l.x ?? d0.x, y = l.y ?? d0.y;
  const cx = (d0.x0 + d0.x1) / 2, cy = (d0.y0 + d0.y1) / 2, px = parked ? cx + (x - cx) * f : x, py = parked ? cy + (y - cy) * f : y;
  return { X: worldX(px, py), Y: worldY(px, py) - (d0.lift ?? 0), k: l.scale * f, flip: l.flip, item: l.item };
}
/** the trimmed picture's rectangle in world px */
export function spriteRect<T extends number[] | Float32Array>(d0: Drawable, out: T = [0, 0, 0, 0] as T, o = 0): T {
  // the picture drawn for it (newart.ts: a stand-in for an old building, the drawable itself otherwise); a hidden one is a zero-area rect at its anchor
  const l = lookOf(d0), it = LIBRARY[l.item]!;
  if (l.hidden) { const X = worldX(d0.x, d0.y), Y = worldY(d0.x, d0.y); out[o] = X; out[o + 1] = Y; out[o + 2] = X; out[o + 3] = Y; return out; }
  const parked = it.kind === 'car' && !d0.moving, f = parked ? CAR_SCALE : 1, k = l.scale * f, ax = l.flip ? it.w - it.ax : it.ax;
  // a parked car shrinks about the middle of its footprint, so it stays in its bay; a stand-in is drawn at its own anchor (centred on the footprint)
  const x = l.x ?? d0.x, y = l.y ?? d0.y;
  const cx = (d0.x0 + d0.x1) / 2, cy = (d0.y0 + d0.y1) / 2, px = parked ? cx + (x - cx) * f : x, py = parked ? cy + (y - cy) * f : y, X = worldX(px, py), Y = worldY(px, py) - (d0.lift ?? 0);
  const left = X - ax * k, top = Y - it.ay * k, q = it.quad;
  const qx0 = l.flip ? it.w - q[2] : q[0], qx1 = l.flip ? it.w - q[0] : q[2];
  out[o] = left + qx0 * k; out[o + 1] = top + q[1] * k; out[o + 2] = left + qx1 * k; out[o + 3] = top + q[3] * k;
  return out;
}
/** painter's rule for two footprints: a is behind b */
export function isBehind(a: Drawable, b: Drawable) {
  const e = 0.02;
  if (a.x1 <= b.x0 + e) return true; if (b.x1 <= a.x0 + e) return false;
  if (a.y1 <= b.y0 + e) return true; if (b.y1 <= a.y0 + e) return false;
  return a.x1 + a.y1 < b.x1 + b.y1;
}
function clip(out: Float32Array, o: number, i: number, j: number) { out[o] = i * CHUNK_W; out[o + 1] = j * CHUNK_H; out[o + 2] = (i + 1) * CHUNK_W; out[o + 3] = (j + 1) * CHUNK_H; }
/** per library item: casts a cast shadow (shadow-shape.ts castsShadow: an override can turn it off), and has business art's placeholder
 *  footprint (its cast shadow stands on its picture's base instead: contactShadow's foot); filled as items are first packed */
const CASTS: boolean[] = [], PLACEHOLDER: boolean[] = [];
const casts = (item: number) => CASTS[item] ??= castsShadow(LIBRARY[item]!);
const placeholder = (item: number) => PLACEHOLDER[item] ??= placeholderBoxes(LIBRARY[item]!);
/** the drawn spot of a drawable for its contact shadow (scratch): the look's anchor and scale, the footprint (a parked car's shrunk like its
 *  picture, about its middle) */
const SPOT: ShadowSpot = { x: 0, y: 0, x0: 0, y0: 0, x1: 0, y1: 0, scale: 1 };
function spotOf(d: Drawable, l: { x?: number; y?: number; scale: number; item: number }): ShadowSpot {
  const f = LIBRARY[l.item]!.kind === 'car' && !d.moving ? CAR_SCALE : 1, cx = (d.x0 + d.x1) / 2, cy = (d.y0 + d.y1) / 2, hw = (d.x1 - d.x0) * f / 2, hh = (d.y1 - d.y0) * f / 2;
  SPOT.x = l.x ?? d.x; SPOT.y = l.y ?? d.y; SPOT.x0 = cx - hw; SPOT.y0 = cy - hh; SPOT.x1 = cx + hw; SPOT.y1 = cy + hh; SPOT.scale = l.scale;
  return SPOT;
}
function packSprite(d0: Drawable, out: Float32Array, o: number, i: number, j: number, alpha = 1) {
  // the picture drawn for it (newart.ts: a stand-in on the same footprint for an old building, the drawable itself otherwise)
  const l = lookOf(d0), it = LIBRARY[l.item]!, t = it.tex;
  spriteRect(d0, out, o);
  out[o + 4] = l.flip ? t[3] : t[1]; out[o + 5] = t[2]; out[o + 6] = l.flip ? t[1] : t[3]; out[o + 7] = t[4];
  // w: the foot line (world px) the cast shadow hinges on; a baked lot casts none (its picture carries its own, baked), nor a sprite whose
  // override says so (shadow-overrides.json: a flat one); a hidden one draws nothing
  // (a picture with a vector shadow casts its drawn shape instead: packVector)
  out[o + 8] = t[0]; out[o + 9] = l.hidden ? 0 : d0.tint ? 2 + alpha : alpha; /* T176: 2 + alpha marks a tinted sprite (gl.ts) */ out[o + 10] = it.big ? 0 : 1; out[o + 11] = it.kind === 'lot' || l.hidden || d0.lift || !casts(l.item) || (VECTOR.on && vecOf(l.item)) ? -1 : worldY(l.x ?? d0.x, l.y ?? d0.y);
  clip(out, o + 12, i, j);
  // the footprint's front edges, for the cast shadows (gl.ts VS_CAST): the near corner (x1, y1) and the left (x0, y1) and right (x1, y0)
  // corners; business art's placeholder footprint (a 2 x 2 m box under a whole building) gives way to its picture's base (T141)
  let x0 = d0.x0, y0 = d0.y0, x1 = d0.x1, y1 = d0.y1;
  if (placeholder(l.item) && !l.hidden) { const f = contactShadow(it, spotOf(d0, l), out.subarray(o, o + 4))?.foot; if (f) [x0, y0, x1, y1] = f; }
  out[o + 16] = worldX(x1, y1); out[o + 17] = worldY(x1, y1); out[o + 18] = worldX(x0, y1); out[o + 19] = worldX(x1, y0);
}
/** a lamp's glow instance (T192): a square of its radius about its point, drawn by the sprite program as a soft disc (gl.ts FS_SPRITE, layer
 *  GLOW_LAYER), clipped to the tile like the car it belongs to; it casts no shadow and asks the atlas for nothing */
export function packLamp(lamps: ArrayLike<number>, k: number, out: Float32Array, o: number, i: number, j: number) {
  const X = lamps[k]!, Y = lamps[k + 1]!, r = lamps[k + 2]!;
  out[o] = X - r; out[o + 1] = Y - r; out[o + 2] = X + r; out[o + 3] = Y + r;
  out[o + 4] = 0; out[o + 5] = 0; out[o + 6] = 1; out[o + 7] = 1;
  out[o + 8] = GLOW_LAYER; out[o + 9] = lamps[k + 3]!; out[o + 10] = 0; out[o + 11] = -1;
  clip(out, o + 12, i, j);
  out[o + 16] = 0; out[o + 17] = 0; out[o + 18] = 0; out[o + 19] = 0;
}
/** the world px box a drawable's lamps reach, grown into r (x0 y0 x1 y1) */
function lampBox(d: Drawable, r: number[]) {
  const L = d.lamps; if (!L) return;
  for (let k = 0; k + LAMP_FLOATS - 1 < L.length; k += LAMP_FLOATS) { const X = L[k]!, Y = L[k + 1]!, q = L[k + 2]!; r[0] = Math.min(r[0]!, X - q); r[1] = Math.min(r[1]!, Y - q); r[2] = Math.max(r[2]!, X + q); r[3] = Math.max(r[3]!, Y + q); }
}
/** a drawable's contact shadow as packShadow packs it (null: none), its picture's rect `rect` (spriteRect) when known */
export function contactOf(d: Drawable, rect: ArrayLike<number> = spriteRect(d)): ContactShadow | null {
  const l = lookOf(d);
  return d.lift || l.hidden || (VECTOR.on && vecOf(l.item)) ? null : contactShadow(LIBRARY[l.item]!, spotOf(d, l), rect);
}
/** a drawable's vector shadow instance (gl.ts VECTOR_STRIDE) into `out` at `o`: false when it has none (off, no entry, hidden). A lifted one
 *  (T133: the range's upper deck) casts from its ground spot, every point of it its lift higher, and has no contact shape (what holds it up
 *  has its own), so a double deck casts a two-storey shadow */
export function packVector(d: Drawable, out: Float32Array, o: number, i: number, j: number, rect: ArrayLike<number>, h = rect[3]! - rect[1]!): boolean {
  if (!VECTOR.on) return false;
  const a = spriteAnchor(d); if (!a) return false;
  const v = vecOf(a.item); if (!v || !v.count) return false;
  // (a mirrored sprite draws its mirrored mesh)
  const lift = d.lift ?? 0;
  out[o] = a.X; out[o + 1] = a.Y + lift; out[o + 2] = lift; out[o + 3] = a.k;
  out[o + 4] = a.flip ? v.mfirst : v.first; out[o + 5] = a.flip ? v.mcount : v.count; out[o + 6] = a.flip ? v.fmfirst : v.ffirst; out[o + 7] = a.flip ? v.fmcount : v.fcount;
  clip(out, o + 8, i, j);
  out[o + 12] = rect[0]!; out[o + 13] = rect[1]!; out[o + 14] = rect[2]!; out[o + 15] = rect[3]!;
  // T216: the sprite's own cull (gl.ts CULL_MIN_PX): h its picture's height (default the rect's; a mover passes its own, as its lamps may have grown the rect), and its flag
  out[o + 16] = h; out[o + 17] = LIBRARY[a.item]!.big ? 0 : 1; out[o + 18] = 0; out[o + 19] = 0;
  return true;
}
/** the sprite's contact shadow (shadow-shape.ts contactShadow): the drawn picture's (the look's) shape from the footprint (2 m tiles, so the
 *  half extents in metres are the tile spans) and the picture's rect `rect` (world px, spriteRect), a parked car's shrunk like its picture;
 *  none (a lifted or hidden sprite, a lot, an override's contact: false) packs as a zero-size shape. T216: its sprite's cull rides along (h: its picture's
 *  height, default the rect's; and whether it is cullable), so the shadow is hidden with the sprite at the district zoom */
export function packShadow(d: Drawable, out: Float32Array, o: number, i: number, j: number, rect: ArrayLike<number>, h = rect[3]! - rect[1]!) {
  const sh = contactOf(d, rect);
  out[o] = sh ? worldX(sh.x, sh.y) : 0; out[o + 1] = sh ? worldY(sh.x, sh.y) : 0; out[o + 2] = sh?.hx ?? 0; out[o + 3] = sh?.hy ?? 0;
  out[o + 4] = sh?.core ?? 0; out[o + 5] = sh?.feather ?? 0; out[o + 6] = sh?.round ? 1 : 0; out[o + 7] = sh?.lean ?? 0;
  clip(out, o + 8, i, j);
  out[o + 12] = h; out[o + 13] = LIBRARY[lookOf(d).item]!.big ? 0 : 1; out[o + 14] = 0; out[o + 15] = 0;
}
/** topological painter's order over the props of one tile (their pictures overlap) */
function topoOrder(props: Prop[], rects: Float32Array) {
  const n = props.length, buckets = new Map<number, number[]>(), cell = 400;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    for (let gx = Math.floor(rects[o] / cell); gx <= Math.floor(rects[o + 2] / cell); gx++) for (let gy = Math.floor(rects[o + 1] / cell); gy <= Math.floor(rects[o + 3] / cell); gy++) {
      const k = gx * 65536 + gy; let l = buckets.get(k); if (!l) buckets.set(k, (l = [])); l.push(i);
    }
  }
  const behind: number[][] = Array.from({ length: n }, () => []), seen = new Set<number>();
  for (const l of buckets.values()) for (let a = 0; a < l.length; a++) for (let b = a + 1; b < l.length; b++) {
    const p = l[a], q = l[b], key = p < q ? p * n + q : q * n + p; if (seen.has(key)) continue; seen.add(key);
    const P = p * 4, Q = q * 4; if (rects[P] >= rects[Q + 2] || rects[Q] >= rects[P + 2] || rects[P + 1] >= rects[Q + 3] || rects[Q + 1] >= rects[P + 3]) continue;
    if (isBehind(props[p], props[q])) behind[q].push(p); else behind[p].push(q);
  }
  const idx = props.map((_, i) => i).sort((a, b) => (props[a].x1 + props[a].y1) - (props[b].x1 + props[b].y1));
  const state = new Uint8Array(n), out: Prop[] = [];
  for (const i of idx) {
    if (state[i]) continue; state[i] = 1; const stack: [number, number][] = [[i, 0]];
    while (stack.length) {
      const top = stack[stack.length - 1], deps = behind[top[0]];
      if (top[1] < deps.length) { const d = deps[top[1]++]; if (!state[d]) { state[d] = 1; stack.push([d, 0]); } }
      else { stack.pop(); state[top[0]] = 2; out.push(props[top[0]]); }
    }
  }
  return out;
}

export class SpriteTiles {
  tiles = new Map<number, DTile>();
  private where = new Map<Prop, number[]>();
  private stream = new Float32Array(1 << 16); private shadowStream = new Float32Array(1 << 14);
  private vecStream = VECTOR_SETS.map(() => new Float32Array(1 << 13));
  private tmp = [0, 0, 0, 0];
  count = 0;

  add(p: Prop) {
    const r = spriteRect(p, this.tmp), keys: number[] = [];
    for (let j = Math.floor(r[1] / CHUNK_H); j <= Math.floor(r[3] / CHUNK_H); j++) for (let i = Math.floor(r[0] / CHUNK_W); i <= Math.floor(r[2] / CHUNK_W); i++) {
      const k = tkey(i, j); let t = this.tiles.get(k);
      if (!t) { t = { i, j, props: new Set(), order: null, packed: new Float32Array(0), shadows: new Float32Array(0), rects: new Float32Array(0), buckets: new Map(), vsets: [], vmax: [], vfar: [] }; this.tiles.set(k, t); }
      t.props.add(p); t.order = null; keys.push(k);
    }
    this.where.set(p, keys); this.count++;
  }
  remove(p: Prop) {
    const keys = this.where.get(p); if (!keys) return;
    for (const k of keys) { const t = this.tiles.get(k); if (!t) continue; t.props.delete(p); t.order = null; if (!t.props.size) this.tiles.delete(k); }
    this.where.delete(p); this.count--;
  }
  /** after a prop moved, flipped or scaled */
  update(p: Prop) { this.remove(p); this.add(p); }
  /** whether p is drawn (T176: a tinted tree the Build has since cleared is not put back) */
  has(p: Prop): boolean { return this.where.has(p); }
  clear() { this.tiles.clear(); this.where.clear(); this.count = 0; }
  /** re-pack every tile (the vector shadows turned on or off) */
  repack() { for (const t of this.tiles.values()) t.order = null; }
  /** the props of the tiles touching a world-px point, front-most first (for picking) */
  at(X: number, Y: number): Prop[] {
    const t = this.tiles.get(tkey(Math.floor(X / CHUNK_W), Math.floor(Y / CHUNK_H))); if (!t) return [];
    this.prepare(t); return [...t.order!].reverse();
  }
  private prepare(t: DTile) {
    if (t.order) return;
    const props = [...t.props], rects = new Float32Array(props.length * 4);
    props.forEach((p, i) => spriteRect(p, rects, i * 4));
    t.order = topoOrder(props, rects);
    const n = t.order.length; t.packed = new Float32Array(n * SPRITE_STRIDE); t.rects = new Float32Array(n * 4);
    const sh: number[] = [];
    t.order.forEach((p, i) => { packSprite(p, t.packed, i * SPRITE_STRIDE, t.i, t.j); t.rects.set(t.packed.subarray(i * SPRITE_STRIDE, i * SPRITE_STRIDE + 4), i * 4); if (SHADOWED(LIBRARY[p.item]) && !p.lift && !(VECTOR.on && vecOf(lookOf(p).item))) sh.push(i); });
    t.shadows = new Float32Array(sh.length * SHADOW_STRIDE); sh.forEach((i, k) => packShadow(t.order![i], t.shadows, k * SHADOW_STRIDE, t.i, t.j, t.rects.subarray(i * 4, i * 4 + 4)));
    // the vector shadows (T142), small meshes and big ones
    const vs = VECTOR_SETS.map(() => new Float32Array(n * VECTOR_STRIDE)), vn = VECTOR_SETS.map(() => 0); t.vmax = VECTOR_SETS.map(() => 0); t.vfar = VECTOR_SETS.map(() => 0);
    for (let i = 0; i < n; i++) {
      const p = t.order[i]!, l = lookOf(p), v = SHADOWED(LIBRARY[p.item]!) ? vecOf(l.item) : null, c = v ? (l.flip ? v.mcount : v.count) : 0; if (!c) continue;
      const k = setOf(c);
      if (!packVector(p, vs[k]!, vn[k]! * VECTOR_STRIDE, t.i, t.j, t.rects.subarray(i * 4, i * 4 + 4))) continue;
      t.vfar[k] = Math.max(t.vfar[k]!, vs[k]![vn[k]! * VECTOR_STRIDE + 7]!); vn[k]!++; t.vmax[k] = Math.max(t.vmax[k]!, c);
    }
    t.vsets = vs.map((a, k) => a.slice(0, vn[k]! * VECTOR_STRIDE));
    t.buckets = new Map();
    for (let i = 0; i < n; i++) { const o = i * 4; for (let gx = Math.floor(t.rects[o] / BUCKET); gx <= Math.floor(t.rects[o + 2] / BUCKET); gx++) for (let gy = Math.floor(t.rects[o + 1] / BUCKET); gy <= Math.floor(t.rects[o + 3] / BUCKET); gy++) { const k = gx * 65536 + gy; let l = t.buckets.get(k); if (!l) t.buckets.set(k, (l = [])); l.push(i); } }
  }
  /** every packed instance of the tiles touching a world-px box: fn(packed, offset of the instance, SPRITE_STRIDE floats). Tiles not
   *  prepared yet are skipped, except the first `prepare` of them (T080: the atlas cells near the view, without sorting every tile there) */
  visit(X0: number, Y0: number, X1: number, Y1: number, fn: (packed: Float32Array, o: number) => void, prepare = 0) {
    for (let j = Math.floor(Y0 / CHUNK_H); j <= Math.floor(Y1 / CHUNK_H); j++) for (let i = Math.floor(X0 / CHUNK_W); i <= Math.floor(X1 / CHUNK_W); i++) {
      const t = this.tiles.get(tkey(i, j)); if (!t) continue;
      if (!t.order) { if (prepare <= 0) continue; prepare--; this.prepare(t); }
      for (let o = 0; o < t.packed.length; o += SPRITE_STRIDE) fn(t.packed, o);
    }
  }
  private ensure(floats: number, shadows: number) {
    if (floats > this.stream.length) { const s = new Float32Array(Math.max(floats, this.stream.length * 2)); s.set(this.stream); this.stream = s; }
    if (shadows > this.shadowStream.length) { const s = new Float32Array(Math.max(shadows, this.shadowStream.length * 2)); s.set(this.shadowStream); this.shadowStream = s; }
  }
  private rbuf: number[][] = [];
  private vone = new Float32Array(VECTOR_STRIDE);

  /** Pack this frame's streams for the visible tiles: the shadows, and the sprites in each tile's order with the movers
   *  merged in. Returns both streams and their lengths. */
  frame(visible: { i: number; j: number }[], movers: Drawable[]) {
    // movers by tile
    const byTile = new Map<number, { d: Drawable; r: number[]; h: number }[]>();
    while (this.rbuf.length < movers.length) this.rbuf.push([0, 0, 0, 0]);
    for (let m = 0; m < movers.length; m++) {
      // (h: the picture's own height, read before lampBox grows r for the lamps: the sprite's cull, T216)
      const d = movers[m], r = spriteRect(d, this.rbuf[m]), h = r[3]! - r[1]!; lampBox(d, r);
      for (let j = Math.floor(r[1] / CHUNK_H); j <= Math.floor(r[3] / CHUNK_H); j++) for (let i = Math.floor(r[0] / CHUNK_W); i <= Math.floor(r[2] / CHUNK_W); i++) {
        const k = tkey(i, j); let l = byTile.get(k); if (!l) byTile.set(k, (l = [])); l.push({ d, r, h });
      }
    }
    let at = 0, sat = 0; const draws: TileDraw[] = [];
    // the vector shadows: small and big sets, their floats and their largest counts
    const vat = VECTOR_SETS.map(() => 0), vmax = VECTOR_SETS.map(() => 0), vfar = VECTOR_SETS.map(() => 0), vput = (set: number, src: Float32Array, n: number) => {
      let b = this.vecStream[set]!; if (vat[set]! + n > b.length) { const g = new Float32Array(Math.max(vat[set]! + n, b.length * 2)); g.set(b); this.vecStream[set] = b = g; }
      b.set(n === src.length ? src : src.subarray(0, n), vat[set]); vat[set]! += n;
    }, vone = this.vone;
    for (const { i, j } of visible) {
      const k = tkey(i, j), t = this.tiles.get(k), mv = byTile.get(k);
      if (!t && !mv) continue;
      if (t) this.prepare(t);
      const nProps = t ? t.order!.length : 0, nMv = mv ? mv.length : 0;
      let nLamps = 0; if (mv) for (const m of mv) nLamps += (m.d.lamps?.length ?? 0) / LAMP_FLOATS;
      this.ensure(at + (nProps + nMv + nLamps) * SPRITE_STRIDE, sat + (t ? t.shadows.length : 0) + nMv * SHADOW_STRIDE);
      const s = this.stream, ss = this.shadowStream, d: TileDraw = { i, j, shadows: 0, sprites: 0 };
      if (t) { ss.set(t.shadows, sat); sat += t.shadows.length; d.shadows += t.shadows.length / SHADOW_STRIDE; }
      // (a mover with a vector shadow packs no T141 shape: packVector below)
      if (mv) for (const m of mv) { if (VECTOR.on && vecOf(lookOf(m.d).item)) continue; packShadow(m.d, ss, sat, i, j, m.r, m.h); sat += SHADOW_STRIDE; d.shadows++; }
      if (t) t.vsets.forEach((a, k) => { if (a.length) { vput(k, a, a.length); vmax[k] = Math.max(vmax[k]!, t.vmax[k]!); vfar[k] = Math.max(vfar[k]!, t.vfar[k]!); } });
      if (mv) for (const m of mv) {
        if (!packVector(m.d, vone, 0, i, j, m.r, m.h)) continue;
        const c = vone[5]!, set = setOf(c); vput(set, vone, VECTOR_STRIDE); vmax[set] = Math.max(vmax[set]!, c); vfar[set] = Math.max(vfar[set]!, vone[7]!);
      }
      if (!mv) { if (t) { s.set(t.packed, at); at += t.packed.length; d.sprites = nProps; } }
      else {
        // each mover goes after the last prop behind it that its picture overlaps
        const slot = mv.map(({ d: m, r }) => {
          let pos = 0;
          if (t) for (let gx = Math.floor(r[0] / BUCKET); gx <= Math.floor(r[2] / BUCKET); gx++) for (let gy = Math.floor(r[1] / BUCKET); gy <= Math.floor(r[3] / BUCKET); gy++) {
            const l = t.buckets.get(gx * 65536 + gy); if (!l) continue;
            for (const pi of l) { if (pi < pos) continue; const o = pi * 4; if (t.rects[o] >= r[2] || r[0] >= t.rects[o + 2] || t.rects[o + 1] >= r[3] || r[1] >= t.rects[o + 3]) continue; if (isBehind(t.order![pi], m)) pos = pi + 1; }
          }
          return { m, pos, depth: m.x1 + m.y1 };
        }).sort((a, b) => a.pos - b.pos || a.depth - b.depth);
        let pi = 0;
        for (const sl of slot) {
          if (t && sl.pos > pi) { s.set(t.packed.subarray(pi * SPRITE_STRIDE, sl.pos * SPRITE_STRIDE), at); at += (sl.pos - pi) * SPRITE_STRIDE; pi = sl.pos; }
          packSprite(sl.m, s, at, i, j); at += SPRITE_STRIDE;
          // (T192: its lamps right after it, so what is nearer covers them as it covers the car)
          const L = sl.m.lamps; if (L) for (let k = 0; k + LAMP_FLOATS - 1 < L.length; k += LAMP_FLOATS) { packLamp(L, k, s, at, i, j); at += SPRITE_STRIDE; }
        }
        if (t && pi < nProps) { s.set(t.packed.subarray(pi * SPRITE_STRIDE), at); at += (nProps - pi) * SPRITE_STRIDE; }
        d.sprites = nProps + nMv + nLamps;
      }
      draws.push(d);
    }
    return { stream: this.stream, floats: at, shadows: this.shadowStream, shadowFloats: sat, draws,
      vec: this.vecStream.map((data, k) => ({ data, floats: vat[k]!, verts: vmax[k]!, far: vfar[k]! })) };
  }
}
