/** Upright sprites, organised for drawing: every prop is listed in each draw tile (SPR_W x SPR_H world px) its picture
 *  touches, and each tile keeps its own painter's order. Every instance carries its tile's rectangle and the shader
 *  clips to it, so a prop spanning tiles is drawn once per tile without double blending, each tile's order only has to
 *  be right for the props inside it, and a whole frame is one instanced draw. Edits re-sort only the tiles they touch. Moving vehicles are merged into a tile's order every
 *  frame, after the last prop that is behind them. */
import { SPR_H as CHUNK_H, SPR_W as CHUNK_W, worldX, worldY } from './iso';
import { LIBRARY } from './library';
import { CAR_SCALE } from './ext/car-art';
import { SHADOW_STRIDE, SPRITE_STRIDE } from './gl';
import type { Prop } from './types';
import { shadowShape } from './shadow-shape';
import { NEW_ART_ONLY, lookOf } from './newart';

/** anything drawn like a prop: library item, anchor (tiles), flip, scale, footprint (tiles) */
export interface Drawable { item: number; x: number; y: number; flip: boolean; scale: number; x0: number; y0: number; x1: number; y1: number; /** a moving car (SimClient.visible): already drawn at CAR_SCALE */ moving?: boolean }
/** every car is drawn this much smaller than its art, parked (props of kind car, about the middle of their footprint) and moving (SimClient.visible,
 *  about the car's centre): the owner, 2026-10-19, "20% smaller", the parked cars too */
export { CAR_SCALE };
interface DTile { i: number; j: number; props: Set<Prop>; order: Prop[] | null; packed: Float32Array; shadows: Float32Array; rects: Float32Array; buckets: Map<number, number[]> }
export interface TileDraw { i: number; j: number; shadows: number; sprites: number }

const BUCKET = 256;
const tkey = (i: number, j: number) => (j + 512) * 4096 + (i + 2048);
const SHADOWED = (it: (typeof LIBRARY)[number]) => it.kind !== 'lot';

/** the trimmed picture's rectangle in world px */
export function spriteRect<T extends number[] | Float32Array>(d0: Drawable, out: T = [0, 0, 0, 0] as T, o = 0): T {
  const d = NEW_ART_ONLY ? { ...d0, ...lookOf(d0) } : d0, it = LIBRARY[d.item], parked = it.kind === 'car' && !d.moving, f = parked ? CAR_SCALE : 1, k = d.scale * f, ax = d.flip ? it.w - it.ax : it.ax;
  // a parked car shrinks about the middle of its footprint, so it stays in its bay
  const cx = (d.x0 + d.x1) / 2, cy = (d.y0 + d.y1) / 2, px = parked ? cx + (d.x - cx) * f : d.x, py = parked ? cy + (d.y - cy) * f : d.y, X = worldX(px, py), Y = worldY(px, py);
  const left = X - ax * k, top = Y - it.ay * k, q = it.quad;
  const qx0 = d.flip ? it.w - q[2] : q[0], qx1 = d.flip ? it.w - q[0] : q[2];
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
function packSprite(d0: Drawable, out: Float32Array, o: number, i: number, j: number, alpha = 1) {
  // the new-art preview draws another picture on the same footprint (newart.ts); off, the look is the drawable itself
  const d = NEW_ART_ONLY ? { ...d0, ...lookOf(d0) } : d0, it = LIBRARY[d.item], t = it.tex;
  spriteRect(d0, out, o);
  out[o + 4] = d.flip ? t[3] : t[1]; out[o + 5] = t[2]; out[o + 6] = d.flip ? t[1] : t[3]; out[o + 7] = t[4];
  // w: the foot line (world px) the cast shadow hinges on; a baked lot casts none (its picture carries its own, baked)
  out[o + 8] = t[0]; out[o + 9] = alpha; out[o + 10] = it.big ? 0 : 1; out[o + 11] = it.kind === 'lot' ? -1 : worldY(d.x, d.y);
  clip(out, o + 12, i, j);
  // the footprint's front edges, for the cast shadows (gl.ts VS_CAST): the near corner (x1, y1) and the left (x0, y1) and right (x1, y0) corners
  out[o + 16] = worldX(d0.x1, d0.y1); out[o + 17] = worldY(d0.x1, d0.y1); out[o + 18] = worldX(d0.x0, d0.y1); out[o + 19] = worldX(d0.x1, d0.y0);
}
/** the sprite's contact shadow (shadow-shape.ts): its shape from the footprint (2 m tiles, so the half extents in metres are the tile
 *  spans), a parked car's shrunk like its picture; none packs as a zero-size shape */
function packShadow(d: Drawable, out: Float32Array, o: number, i: number, j: number) {
  const it = LIBRARY[d.item], f = it.kind === 'car' && !d.moving ? CAR_SCALE : 1, sh = shadowShape(it, (d.x1 - d.x0) * f, (d.y1 - d.y0) * f, d.scale);
  const cx = sh?.atAnchor ? d.x : (d.x0 + d.x1) / 2, cy = sh?.atAnchor ? d.y : (d.y0 + d.y1) / 2;
  out[o] = worldX(cx, cy); out[o + 1] = worldY(cx, cy); out[o + 2] = sh?.hx ?? 0; out[o + 3] = sh?.hy ?? 0;
  out[o + 4] = sh?.core ?? 0; out[o + 5] = sh?.feather ?? 0; out[o + 6] = sh?.round ? 1 : 0; out[o + 7] = 0;
  clip(out, o + 8, i, j);
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
  private tmp = [0, 0, 0, 0];
  count = 0;

  add(p: Prop) {
    const r = spriteRect(p, this.tmp), keys: number[] = [];
    for (let j = Math.floor(r[1] / CHUNK_H); j <= Math.floor(r[3] / CHUNK_H); j++) for (let i = Math.floor(r[0] / CHUNK_W); i <= Math.floor(r[2] / CHUNK_W); i++) {
      const k = tkey(i, j); let t = this.tiles.get(k);
      if (!t) { t = { i, j, props: new Set(), order: null, packed: new Float32Array(0), shadows: new Float32Array(0), rects: new Float32Array(0), buckets: new Map() }; this.tiles.set(k, t); }
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
  clear() { this.tiles.clear(); this.where.clear(); this.count = 0; }
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
    t.order.forEach((p, i) => { packSprite(p, t.packed, i * SPRITE_STRIDE, t.i, t.j); t.rects.set(t.packed.subarray(i * SPRITE_STRIDE, i * SPRITE_STRIDE + 4), i * 4); if (SHADOWED(LIBRARY[p.item])) sh.push(i); });
    t.shadows = new Float32Array(sh.length * SHADOW_STRIDE); sh.forEach((i, k) => packShadow(t.order![i], t.shadows, k * SHADOW_STRIDE, t.i, t.j));
    t.buckets = new Map();
    for (let i = 0; i < n; i++) { const o = i * 4; for (let gx = Math.floor(t.rects[o] / BUCKET); gx <= Math.floor(t.rects[o + 2] / BUCKET); gx++) for (let gy = Math.floor(t.rects[o + 1] / BUCKET); gy <= Math.floor(t.rects[o + 3] / BUCKET); gy++) { const k = gx * 65536 + gy; let l = t.buckets.get(k); if (!l) t.buckets.set(k, (l = [])); l.push(i); } }
  }
  private ensure(floats: number, shadows: number) {
    if (floats > this.stream.length) { const s = new Float32Array(Math.max(floats, this.stream.length * 2)); s.set(this.stream); this.stream = s; }
    if (shadows > this.shadowStream.length) { const s = new Float32Array(Math.max(shadows, this.shadowStream.length * 2)); s.set(this.shadowStream); this.shadowStream = s; }
  }
  private rbuf: number[][] = [];

  /** Pack this frame's streams for the visible tiles: the shadows, and the sprites in each tile's order with the movers
   *  merged in. Returns both streams and their lengths. */
  frame(visible: { i: number; j: number }[], movers: Drawable[]) {
    // movers by tile
    const byTile = new Map<number, { d: Drawable; r: number[] }[]>();
    while (this.rbuf.length < movers.length) this.rbuf.push([0, 0, 0, 0]);
    for (let m = 0; m < movers.length; m++) {
      const d = movers[m], r = spriteRect(d, this.rbuf[m]);
      for (let j = Math.floor(r[1] / CHUNK_H); j <= Math.floor(r[3] / CHUNK_H); j++) for (let i = Math.floor(r[0] / CHUNK_W); i <= Math.floor(r[2] / CHUNK_W); i++) {
        const k = tkey(i, j); let l = byTile.get(k); if (!l) byTile.set(k, (l = [])); l.push({ d, r });
      }
    }
    let at = 0, sat = 0; const draws: TileDraw[] = [];
    for (const { i, j } of visible) {
      const k = tkey(i, j), t = this.tiles.get(k), mv = byTile.get(k);
      if (!t && !mv) continue;
      if (t) this.prepare(t);
      const nProps = t ? t.order!.length : 0, nMv = mv ? mv.length : 0;
      this.ensure(at + (nProps + nMv) * SPRITE_STRIDE, sat + (t ? t.shadows.length : 0) + nMv * SHADOW_STRIDE);
      const s = this.stream, ss = this.shadowStream, d: TileDraw = { i, j, shadows: 0, sprites: 0 };
      if (t) { ss.set(t.shadows, sat); sat += t.shadows.length; d.shadows += t.shadows.length / SHADOW_STRIDE; }
      if (mv) for (const m of mv) { packShadow(m.d, ss, sat, i, j); sat += SHADOW_STRIDE; d.shadows++; }
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
        }
        if (t && pi < nProps) { s.set(t.packed.subarray(pi * SPRITE_STRIDE), at); at += (nProps - pi) * SPRITE_STRIDE; }
        d.sprites = nProps + nMv;
      }
      draws.push(d);
    }
    return { stream: this.stream, floats: at, shadows: this.shadowStream, shadowFloats: sat, draws };
  }
}
