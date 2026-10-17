/** The main thread's side of ground baking: which chunks are on screen, which are baked (as GL textures), which are
 *  stale after an edit, and a small pool of ground workers that bake them. Edits never block drawing: a stale chunk
 *  keeps showing its old picture until the new one arrives, and every visible chunk falls back to the planner map. */
import { CHUNK_H, CHUNK_W, MID_H, MID_W, PLAN_H, PLAN_W, PLAN_K } from './iso';
import { GROUND_ART } from './ground-art';
import { patchBox, type FromWorker, type LotPatch, type NetOp, type TileKind, type ToWorker } from './ground-protocol';
import type { GLRenderer } from './gl';
import { unionBox, type BBox } from './network';
import type { Waterway } from './terrain/types';
import GroundWorker from './ground.worker?worker&inline';

export interface Tile {
  kind: TileKind; i: number; j: number;
  tex: WebGLTexture | null; texL: number; px: number;
  /** the picture before the last edit, kept for the build reveal */
  prev: WebGLTexture | null; prevUntil: number;
  gen: number; stale: boolean; pendingL: number; used: number;
}
const key = (k: TileKind, i: number, j: number) => (k === 'g' ? 0 : k === 'm' ? 1 : 2) * 1e10 + (j + 2048) * 65536 + (i + 32768);
const SIZE: Record<TileKind, [number, number]> = { g: [CHUNK_W, CHUNK_H], m: [MID_W, MID_H], p: [PLAN_W, PLAN_H] };

export class GroundCache {
  tiles = new Map<number, Tile>();
  /** the lot patches last sent, by lot key (to find the old boxes of edits) */
  private lotPatches = new Map<string, LotPatch[]>();
  private workers: Worker[] = []; private inflight: number[] = []; private reqs = new Map<number, { t: Tile; gen: number; w: number }>();
  private nextId = 1; private want: { t: Tile; L: number; pri: number }[] = [];
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
  init(t: { cls: Uint8Array; height: Float32Array; waters: Waterway[] }) { this.workers.forEach((wk, i) => wk.postMessage({ t: 'init', art: GROUND_ART, terrain: t.cls, height: t.height, waters: t.waters, build: i === 0, peers: this.workers.length - 1 } satisfies ToWorker)); }
  broadcast(m: ToWorker, transfer?: (w: number) => Transferable[]) { this.workers.forEach((wk, i) => wk.postMessage(m, transfer ? transfer(i) : [])); }
  netOps(ops: NetOp[]) { if (ops.length) this.broadcast({ t: 'net', ops }); }
  lamps(pts: Float32Array) { this.broadcast({ t: 'lamps', pts }); }
  terrain(t: { cls: Uint8Array; height: Float32Array; waters: Waterway[] }) { this.broadcast({ t: 'terrain', cls: t.cls, height: t.height, waters: t.waters }); }
  blocks(data: Float32Array) { this.broadcast({ t: 'blocks', data }); }
  /** the lot patches of the keys in `set` replace their old ones, `drop` removes keys; the chunks under the old and new patches go stale */
  lotGround(set: [string, LotPatch[]][], drop: string[]) {
    if (!set.length && !drop.length) return;
    let box: BBox | null = null;
    for (const k of drop) { const old = this.lotPatches.get(k); if (old) { const b = patchBox(old); if (b) box = unionBox(box, b); this.lotPatches.delete(k); } }
    for (const [k, ps] of set) {
      const old = this.lotPatches.get(k); if (old) { const b = patchBox(old); if (b) box = unionBox(box, b); }
      const b = patchBox(ps); if (b) box = unionBox(box, b);
      if (ps.length) this.lotPatches.set(k, ps); else this.lotPatches.delete(k);
    }
    this.broadcast({ t: 'lotground', set, drop });
    if (box) this.invalidate([box[0] - 1, box[1] - 1, box[2] + 1, box[3] + 1], false, 0, 'gmp');
  }

  tile(kind: TileKind, i: number, j: number) {
    const k = key(kind, i, j); let t = this.tiles.get(k);
    if (!t) { t = { kind, i, j, tex: null, texL: 0, px: 0, prev: null, prevUntil: 0, gen: 0, stale: false, pendingL: 0, used: 0 }; this.tiles.set(k, t); }
    return t;
  }
  /** mark the chunks over a tile-space box stale; keepPrev keeps the current picture for the build reveal */
  invalidate(b: BBox, keepPrev = false, until = 0, kinds = 'gmp') {
    const xs = [(b[0] - b[1]) * 64, (b[2] - b[1]) * 64, (b[0] - b[3]) * 64, (b[2] - b[3]) * 64], ys = [(b[0] + b[1]) * 32, (b[2] + b[1]) * 32, (b[0] + b[3]) * 32, (b[2] + b[3]) * 32];
    const X0 = Math.min(...xs), X1 = Math.max(...xs), Y0 = Math.min(...ys), Y1 = Math.max(...ys);
    for (const t of this.tiles.values()) {
      if (!kinds.includes(t.kind)) continue;
      const [W, H] = SIZE[t.kind];
      if ((t.i + 1) * W < X0 || t.i * W > X1 || (t.j + 1) * H < Y0 || t.j * H > Y1) continue;
      t.gen++; t.stale = true;
      if (keepPrev && t.tex && t.kind !== 'p') { if (t.prev && t.prev !== t.tex) this.gl.deleteTexture(t.prev); t.prev = t.tex; t.prevUntil = Math.max(t.prevUntil, until); }
    }
  }
  invalidateAll() { for (const t of this.tiles.values()) { t.gen++; t.stale = true; } }
  /** ask for a tile at a level this frame (lower pri = sooner) */
  need(t: Tile, L: number, pri: number, now: number) { t.used = now; if ((t.tex && t.texL === L && !t.stale) || t.pendingL === L) return; this.want.push({ t, L, pri }); }
  /** send the most urgent requests to idle workers */
  pump() {
    if (!this.ready) { this.want = []; return; }
    this.want.sort((a, b) => a.pri - b.pri);
    for (const w of this.want) {
      let best = -1; for (let i = 0; i < this.workers.length; i++) if (this.isReady[i] && this.inflight[i] < 2 && (best < 0 || this.inflight[i] < this.inflight[best])) best = i;
      if (best < 0) break;
      const id = this.nextId++; w.t.pendingL = w.L; this.inflight[best]++;
      this.reqs.set(id, { t: w.t, gen: w.t.gen, w: best });
      this.workers[best].postMessage({ t: 'paint', id, kind: w.t.kind, i: w.t.i, j: w.t.j, L: w.L } satisfies ToWorker);
    }
    this.want = [];
  }
  get busy() { return this.inflight.reduce((s, v) => s + v, 0); }
  private onMessage(w: number, m: FromWorker) {
    if (m.t === 'ready') { this.ready++; this.isReady[w] = true; return; }
    if (m.t === 'error') { this.errors.push(m.message); console.error('[ground worker]', m.message); return; }
    if (m.t === 'log') { console.log(`[ground worker ${w}]`, m.message); return; }
    if (m.t === 'texpack') { m.snaps.forEach((snap, k) => this.workers[k + 1]?.postMessage({ t: 'textures', snap } satisfies ToWorker, snap.bitmaps)); return; }
    const r = this.reqs.get(m.id); this.reqs.delete(m.id); this.inflight[w]--;
    if (!r) { m.bmp.close(); return; }
    const t = r.t; t.pendingL = 0;
    this.bakeMs += m.ms; this.baked++;
    if (r.gen !== t.gen) { m.bmp.close(); return; } // edited while baking: it will be asked for again
    const u0 = performance.now();
    const old = t.tex; t.tex = this.gl.textureFrom(m.bmp); t.texL = m.L; t.px = m.bmp.width * m.bmp.height; t.stale = false; m.bmp.close();
    if (old && old !== t.prev) this.gl.deleteTexture(old);
    const u1 = performance.now(); this.upCount++; this.upMs += u1 - u0;
    if (u1 - this.upT > 1000) { this.uploadsThisSecond = this.upCount; this.uploadMsPerSecond = this.upMs; this.upCount = 0; this.upMs = 0; this.upT = u1; }
  }
  /** drop the least recently used pictures above the pixel budget */
  evict(now: number) {
    let px = 0; for (const t of this.tiles.values()) px += t.tex ? t.px : 0;
    if (px <= this.budgetPx) return;
    const old = [...this.tiles.values()].filter(t => t.tex && t.used !== now && t.kind !== 'p').sort((a, b) => a.used - b.used);
    for (const t of old) { if (px <= this.budgetPx * 0.8) break; px -= t.px; this.gl.deleteTexture(t.tex!); t.tex = null; if (t.prev) { this.gl.deleteTexture(t.prev); t.prev = null; } }
  }
  /** release reveal pictures whose animation is over */
  settle(now: number) { for (const t of this.tiles.values()) if (t.prev && now > t.prevUntil && !t.stale) { if (t.prev !== t.tex) this.gl.deleteTexture(t.prev); t.prev = null; } }
  static planOf(i: number, j: number) { return { i: Math.floor(i / PLAN_K), j: Math.floor(j / PLAN_K) }; }
}
