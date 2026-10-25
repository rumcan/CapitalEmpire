/** The main thread's side of ground baking: which chunks are on screen, which are baked (as GL textures), which are
 *  stale after an edit, and a small pool of ground workers that bake them. Edits never block drawing: a stale chunk
 *  keeps showing its old picture until the new one arrives, and every visible chunk falls back to the planner map. */
import { CHUNK_H, CHUNK_W, MID_H, MID_W, PLAN_H, PLAN_W, PLAN_K } from './iso';
import { GROUND_ART } from './ground-art';
import { CH_SIZE, CH_STEP } from './ext/course-height';
import { withBaseGrass } from './base-grass-saved';
import { withPresets } from './paint-presets-saved';
import { GRASS_ART_DEFAULT, type GrassArt } from './painted-grass-lod';
import { patchBox, type FromWorker, type LotPatch, type NetOp, type TileKind, type ToWorker } from './ground-protocol';
import type { GLRenderer } from './gl';
import { unionBox, type BBox } from './network';
import type { Waterway } from './terrain/types';
import GroundWorker from './ground.worker?worker&inline';
import type { GrassCellView } from './ext/grass-management';

export interface Tile {
  kind: TileKind; i: number; j: number;
  tex: WebGLTexture | null; texL: number; texArtL: number; px: number;
  /** the picture before the last edit, kept for the build reveal */
  prev: WebGLTexture | null; prevUntil: number;
  /** A short zoom-resolution crossfade; independent of the construction reveal picture. */
  fadeFrom: WebGLTexture | null; fadeStart: number; fadePx: number;
  gen: number; stale: boolean; pendingL: number; pendingArtL: number; used: number;
  /** when its picture last landed (performance.now ms), and the earliest time it may be baked again while it still has a picture (a course
   *  stroke re-staling the same chunks every send: each is re-baked at most every COURSE_HOLD_MS, showing its last picture meanwhile) */
  baked: number; hold: number;
}
/** the least time between two bakes of a ground chunk that course edits keep re-staling, ms */
export const COURSE_HOLD_MS = 150;
const key = (k: TileKind, i: number, j: number) => (k === 'g' ? 0 : k === 'm' ? 1 : 2) * 1e10 + (j + 2048) * 65536 + (i + 32768);
const SIZE: Record<TileKind, [number, number]> = { g: [CHUNK_W, CHUNK_H], m: [MID_W, MID_H], p: [PLAN_W, PLAN_H] };

export class GroundCache {
  tiles = new Map<number, Tile>();
  /** the lot patches last sent, by lot key (to find the old boxes of edits) */
  private lotPatches = new Map<string, LotPatch[]>();
  private workers: Worker[] = []; private inflight: number[] = []; private reqs = new Map<number, { t: Tile; gen: number; w: number }>();
  private nextId = 1; private want: { t: Tile; L: number; artL: number; pri: number }[] = [];
  ready = 0; private isReady: boolean[] = []; errors: string[] = []; bakeMs = 0; baked = 0;
  /** texture uploads in the last second, and the main-thread ms they cost */
  uploadsThisSecond = 0; uploadMsPerSecond = 0; private upCount = 0; private upMs = 0; private upT = 0;
  /** GPU pixel budget for baked chunks (RGBA, so x4 bytes) */
  budgetPx = 48e6;
  constructor(public gl: GLRenderer, workers = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 2))) {
    for (let w = 0; w < workers; w++) {
      const wk = new GroundWorker(); wk.onmessage = (e: MessageEvent<FromWorker>) => this.onMessage(w, e.data);
      this.workers.push(wk); this.inflight.push(0);
    }
  }
  terminate() { for (const w of this.workers) w.terminate(); this.workers = []; }
  /** the game's Grass setting (painted-grass-lod.ts GrassArt), sent with the art */
  grassArt: GrassArt = GRASS_ART_DEFAULT;
  /** the Grass setting changed: every worker switches and every chunk is baked again (each keeps its old picture until then) */
  setGrassArt(art: GrassArt) { if (art === this.grassArt) return; this.grassArt = art; this.broadcast({ t: 'grassArt', art }); this.invalidateAll(); }
  init(t: { cls: Uint8Array; height: Float32Array; waters: Waterway[] }) { const art = { ...withPresets(withBaseGrass(GROUND_ART)), grassArt: this.grassArt }; this.workers.forEach((wk, i) => wk.postMessage({ t: 'init', art, terrain: t.cls, height: t.height, waters: t.waters, build: i === 0, peers: this.workers.length - 1 } satisfies ToWorker)); }
  broadcast(m: ToWorker, transfer?: (w: number) => Transferable[]) { this.workers.forEach((wk, i) => wk.postMessage(m, transfer ? transfer(i) : [])); }
  netOps(ops: NetOp[]) { if (ops.length) this.broadcast({ t: 'net', ops }); }
  lamps(pts: Float32Array) { this.broadcast({ t: 'lamps', pts }); }
  terrain(t: { cls: Uint8Array; height: Float32Array; waters: Waterway[] }) { this.broadcast({ t: 'terrain', cls: t.cls, height: t.height, waters: t.waters }); }
  blocks(data: Float32Array) { this.broadcast({ t: 'blocks', data }); }
  /** the course height in tile box b (whole samples, clamped) goes to every worker, and the ground there re-bakes (the old bake shows until then) */
  courseHeight(field: Float32Array, b: [number, number, number, number]) {
    const i0 = Math.max(0, Math.floor(b[0] / CH_STEP) - 1), i1 = Math.min(CH_SIZE - 1, Math.ceil(b[2] / CH_STEP) + 1);
    const j0 = Math.max(0, Math.floor(b[1] / CH_STEP) - 1), j1 = Math.min(CH_SIZE - 1, Math.ceil(b[3] / CH_STEP) + 1);
    const w = i1 - i0 + 1, h = j1 - j0 + 1, data = new Float32Array(w * h);
    for (let j = 0; j < h; j++) data.set(field.subarray((j0 + j) * CH_SIZE + i0, (j0 + j) * CH_SIZE + i1 + 1), j * w);
    this.broadcast({ t: 'course', i0, j0, w, h, data });
    this.invalidate([b[0] - 4, b[1] - 4, b[2] + 4, b[3] + 4], true);
  }
  /** Changed turf cells invalidate only the chunks that touch them, retaining the old bake until replacement. */
  grass(cells: GrassCellView[], strength: number, heat: boolean, mowing = false) {
    this.broadcast({ t: 'grass', cells, strength, heat, mowing });
    const local = new Map<string, BBox>();
    for (const c of cells) { const x = Math.floor(c.x / 32) * 32, y = Math.floor(c.y / 32) * 32; local.set(`${x},${y}`, [x, y, x + 32, y + 32]); }
    for (const box of local.values()) this.invalidate(box, false, 0, 'gm');
  }
  /** the lot patches of the keys in `set` replace their old ones, `drop` removes keys; the chunks under the old and new patches go stale */
  /** stale: per key, the box its new patches actually changed (a course chunk edited in one corner), which goes stale instead of their
   *  whole boxes (the ground outside it was baked from identical geometry) */
  lotGround(set: [string, LotPatch[]][], drop: string[], stale?: ReadonlyMap<string, BBox>) {
    if (!set.length && !drop.length) return;
    let box: BBox | null = null;
    for (const k of drop) { const old = this.lotPatches.get(k); if (old) { const b = patchBox(old); if (b) box = unionBox(box, b); this.lotPatches.delete(k); } }
    let held: BBox | null = null;
    for (const [k, ps] of set) {
      const s = stale?.get(k), old = this.lotPatches.get(k);
      if (s && old) { held = unionBox(held, s); if (ps.length) this.lotPatches.set(k, ps); else this.lotPatches.delete(k); continue; }
      if (old) { const b = patchBox(old); if (b) box = unionBox(box, b); }
      const b = patchBox(ps); if (b) box = unionBox(box, b);
      if (ps.length) this.lotPatches.set(k, ps); else this.lotPatches.delete(k);
    }
    this.broadcast({ t: 'lotground', set, drop });
    if (box) this.invalidate([box[0] - 1, box[1] - 1, box[2] + 1, box[3] + 1], false, 0, 'gmp');
    if (held) this.invalidate([held[0] - 1, held[1] - 1, held[2] + 1, held[3] + 1], false, 0, 'gmp', this.courseHoldMs);
  }

  tile(kind: TileKind, i: number, j: number) {
    const k = key(kind, i, j); let t = this.tiles.get(k);
    if (!t) { t = { kind, i, j, tex: null, texL: 0, texArtL: 0, px: 0, prev: null, prevUntil: 0, fadeFrom: null, fadeStart: 0, fadePx: 0, gen: 0, stale: false, pendingL: 0, pendingArtL: 0, used: 0, baked: 0, hold: 0 }; this.tiles.set(k, t); }
    return t;
  }
  /** mark the chunks over a tile-space box stale; keepPrev keeps the current picture for the build reveal */
  invalidate(b: BBox, keepPrev = false, until = 0, kinds = 'gmp', hold = 0) {
    const xs = [(b[0] - b[1]) * 64, (b[2] - b[1]) * 64, (b[0] - b[3]) * 64, (b[2] - b[3]) * 64], ys = [(b[0] + b[1]) * 32, (b[2] + b[1]) * 32, (b[0] + b[3]) * 32, (b[2] + b[3]) * 32];
    const X0 = Math.min(...xs), X1 = Math.max(...xs), Y0 = Math.min(...ys), Y1 = Math.max(...ys);
    for (const t of this.tiles.values()) {
      if (!kinds.includes(t.kind)) continue;
      const [W, H] = SIZE[t.kind];
      if ((t.i + 1) * W < X0 || t.i * W > X1 || (t.j + 1) * H < Y0 || t.j * H > Y1) continue;
      t.gen++; t.stale = true; t.hold = hold ? Math.max(t.hold, t.baked + hold) : 0;
      if (keepPrev && t.tex && t.kind !== 'p') { if (t.prev && t.prev !== t.tex) this.gl.deleteTexture(t.prev); t.prev = t.tex; t.prevUntil = Math.max(t.prevUntil, until); }
    }
  }
  invalidateAll() { for (const t of this.tiles.values()) { t.gen++; t.stale = true; t.hold = 0; } }
  /** ask for a tile at a level this frame (lower pri = sooner) */
  need(t: Tile, L: number, pri: number, now: number, artL = L) { t.used = now; if ((t.tex && t.texL === L && t.texArtL === artL && (!t.stale || now < t.hold)) || t.pendingL === L && t.pendingArtL === artL) return; this.want.push({ t, L, artL, pri }); }
  /** send the most urgent requests to idle workers */
  pump() {
    if (!this.ready) { this.want = []; return; }
    this.want.sort((a, b) => a.pri - b.pri);
    for (const w of this.want) {
      let best = -1; for (let i = 0; i < this.workers.length; i++) if (this.isReady[i] && this.inflight[i] < 2 && (best < 0 || this.inflight[i] < this.inflight[best])) best = i;
      if (best < 0) break;
      const id = this.nextId++; w.t.pendingL = w.L; w.t.pendingArtL = w.artL; this.inflight[best]++;
      this.reqs.set(id, { t: w.t, gen: w.t.gen, w: best });
      this.workers[best].postMessage({ t: 'paint', id, kind: w.t.kind, i: w.t.i, j: w.t.j, L: w.L, artL: w.artL } satisfies ToWorker);
    }
    this.want = [];
  }
  get busy() { return this.inflight.reduce((s, v) => s + v, 0); }
  /** the hold on chunks a course edit re-stales (COURSE_HOLD_MS; the benchmark tries others) */
  courseHoldMs = COURSE_HOLD_MS;
  private onMessage(w: number, m: FromWorker) {
    if (m.t === 'ready') { this.ready++; this.isReady[w] = true; return; }
    if (m.t === 'error') { this.errors.push(m.message); console.error('[ground worker]', m.message); return; }
    if (m.t === 'log') { console.log(`[ground worker ${w}]`, m.message); return; }
    if (m.t === 'texpack') { m.snaps.forEach((snap, k) => this.workers[k + 1]?.postMessage({ t: 'textures', snap } satisfies ToWorker, snap.bitmaps)); return; }
    const r = this.reqs.get(m.id); this.reqs.delete(m.id); this.inflight[w]--;
    if (!r) { m.bmp.close(); return; }
    const t = r.t; t.pendingL = 0; t.pendingArtL = 0;
    this.bakeMs += m.ms; this.baked++;
    if (r.gen !== t.gen) { m.bmp.close(); return; } // edited while baking: it will be asked for again
    const u0 = performance.now();
    const old = t.tex, oldL = t.texL, oldPx = t.px, artL = m.artL ?? m.L, fade = old && (oldL !== m.L || t.texArtL !== artL) && !t.stale && t.kind !== 'p' && !t.prev;
    if (t.fadeFrom && t.fadeFrom !== old && t.fadeFrom !== t.prev) this.gl.deleteTexture(t.fadeFrom);
    t.fadeFrom = null; t.fadePx = 0;
    t.tex = this.gl.textureFrom(m.bmp); t.texL = m.L; t.texArtL = artL; t.px = m.bmp.width * m.bmp.height; t.stale = false; t.baked = u0; m.bmp.close();
    if (fade) { t.fadeFrom = old; t.fadeStart = Infinity; t.fadePx = oldPx; }
    else if (old && old !== t.prev) this.gl.deleteTexture(old);
    const u1 = performance.now(); this.upCount++; this.upMs += u1 - u0;
    if (u1 - this.upT > 1000) { this.uploadsThisSecond = this.upCount; this.uploadMsPerSecond = this.upMs; this.upCount = 0; this.upMs = 0; this.upT = u1; }
  }
  /** drop the least recently used pictures above the pixel budget */
  evict(now: number) {
    let px = 0; for (const t of this.tiles.values()) px += (t.tex ? t.px : 0) + t.fadePx;
    if (px <= this.budgetPx) return;
    const old = [...this.tiles.values()].filter(t => t.tex && t.used !== now && t.kind !== 'p').sort((a, b) => a.used - b.used);
    for (const t of old) { if (px <= this.budgetPx * 0.8) break; px -= t.px + t.fadePx; this.gl.deleteTexture(t.tex!); t.tex = null; if (t.prev) { this.gl.deleteTexture(t.prev); t.prev = null; } if (t.fadeFrom) { this.gl.deleteTexture(t.fadeFrom); t.fadeFrom = null; t.fadePx = 0; } }
  }
  /** release reveal pictures whose animation is over */
  settle(now: number) { for (const t of this.tiles.values()) {
    if (t.prev && now > t.prevUntil && !t.stale) { if (t.prev !== t.tex) this.gl.deleteTexture(t.prev); t.prev = null; }
    if (t.fadeFrom && (now >= t.fadeStart + 180 || !Number.isFinite(t.fadeStart) && now - t.used > 2000)) { if (t.fadeFrom !== t.tex && t.fadeFrom !== t.prev) this.gl.deleteTexture(t.fadeFrom); t.fadeFrom = null; t.fadePx = 0; }
  } }
  static planOf(i: number, j: number) { return { i: Math.floor(i / PLAN_K), j: Math.floor(j / PLAN_K) }; }
  /** Reuse the other ground tier's already baked pictures during a zoom transition; never request extra bakes. */
  zoomFallback(kind: 'g' | 'm', box: readonly [number, number, number, number], now: number) {
    const other = kind === 'g' ? 'm' : 'g', [w, h] = SIZE[other], result: { tex: WebGLTexture; rect: [number, number, number, number]; uv: [number, number, number, number] }[] = [];
    for (let j = Math.floor(box[1] / h); j < Math.ceil(box[3] / h); j++) for (let i = Math.floor(box[0] / w); i < Math.ceil(box[2] / w); i++) {
      const tile = this.tiles.get(key(other, i, j)); if (!tile?.tex) continue;
      const x0 = Math.max(box[0], i * w), y0 = Math.max(box[1], j * h), x1 = Math.min(box[2], (i + 1) * w), y1 = Math.min(box[3], (j + 1) * h);
      tile.used = now;
      result.push({ tex: tile.tex, rect: [x0, y0, x1, y1], uv: [(x0 - i * w) / w, (y0 - j * h) / h, (x1 - i * w) / w, (y1 - j * h) / h] });
    }
    return result;
  }
}
