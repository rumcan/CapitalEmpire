/** T272 (#825): a ground worker's tile set pictures, kept decoded and pre-scaled under a byte budget.
 *
 *  Each tile set picture (painted-tiles.ts, by URL) is a chain: its full-size decode (the source) and its mips, each half the one before (made
 *  by halving the smallest, as Textures.tileImage always made them), plus any copies pre-scaled to the exact px a cell lands at (T265's swamp:
 *  a cell is then a plain copy). A bake draws the smallest mip at least as wide as its cells (painted-tiles.ts tilePx), so the preparation
 *  before a bake decodes a tile only when no kept mip is that wide, makes that mip at once and drops the decode (four times the mip's size, and
 *  never drawn itself at dpr 1). On main the cache counted decoded sources (24, about 6 MB each) and dropped and decoded the course's tiles
 *  again and again (741 decodes in 54 bakes over the grown town at 30%); here a tile stays decoded, as its mips, while the bakes use it.
 *
 *  Eviction is by least recent use over single pictures, inside the budget (GAME-PLAN 2.3: the ground's 192 MB less what the chunk pictures
 *  hold, never less than their budget leaves, shared by the workers, each of which keeps its own cache: tileCacheBudget, sent by the ground
 *  cache as the chunk pictures come and go). A chain is cut only at its head or its tail, so it stays
 *  each picture the halving of the one before, and a bake draws the very pixels main drew. A picture's use is a bake drawing it or a bake's
 *  preparation needing it; a source not drawn itself counts as never used, so it goes first. The pictures of the bakes about to run (pinned)
 *  are never dropped.
 *
 *  Pure (no canvas): the decode, halving and closing are passed in, so node tests run it with plain sizes. */

/** a picture: a decoded bitmap, a canvas, or (the tests) a size */
export interface Pic { readonly width: number; readonly height: number }
/** a picture's bytes (RGBA8) */
export const picBytes = (p: Pic) => p.width * p.height * 4;
/** a MB as boot.ts counts the chunk pictures' budget (32e6 px of RGBA8: "128 MB") */
const MB = 1e6;
/** GAME-PLAN 2.3: the ground's GPU memory, the chunk pictures and the tile cache together */
export const GROUND_GPU_BYTES = 192 * MB;
/** the least a worker's tile cache gets (a boot whose chunk budget leaves less of GROUND_GPU_BYTES) */
export const TILE_CACHE_MIN = 16 * MB;
/** a worker's tile cache before its init says otherwise (the game's: 192 MB less its 128 MB of chunk pictures, one worker) */
export const TILE_CACHE_BYTES = 64 * MB;
/** following the chunk pictures held, the tiles take what they leave less this (one bake's new mips before the trim after it, the swamp's
 *  glosses, the step), in steps of TILE_STEP (so a few chunks coming and going send nothing) */
export const TILE_SLACK = 8 * MB, TILE_STEP = 4 * MB;
/** a worker's tile cache in bytes: what groundPx pixels of chunk pictures (RGBA8, their budget) leave of GROUND_GPU_BYTES (at least
 *  TILE_CACHE_MIN), shared by the workers, each of which holds its own. With heldPx (the pixels the chunk pictures hold now, ground-cache.ts
 *  residentPx) below their budget: what those leave, less TILE_SLACK, a TILE_STEP below; never less than the budget's share */
export function tileCacheBudget(groundPx: number, workers: number, heldPx = groundPx): number {
  const budget = Math.max(0, groundPx), held = Math.max(0, heldPx), floor = GROUND_GPU_BYTES - budget * 4;
  const free = held < budget ? Math.max(floor, Math.floor((GROUND_GPU_BYTES - held * 4 - TILE_SLACK) / TILE_STEP) * TILE_STEP) : floor;
  return Math.floor(Math.max(TILE_CACHE_MIN, free) / Math.max(1, Math.round(workers)));
}
/** the width of the mip halving makes of a picture w px wide (textures.ts downscale's rounding) */
export const halfOf = (w: number) => Math.max(1, Math.round(w * 0.5));

interface Entry<P extends Pic> {
  /** the chain, largest first: [source?, mip, mip/2, ...], each the halving of the one before; and when each was last used (0: never) */
  pics: P[]; stamps: number[];
  /** pics[0] is the full-size decode */
  src: boolean;
  /** copies pre-scaled to w x h (by `${w}x${h}`) */
  exact: Map<string, { pic: P; stamp: number }>;
}

export interface TileCacheOps<P extends Pic> {
  /** url's full-size picture, decoded (a rejection leaves the tile not decoded: its bake falls back, T197) */
  decode(url: string): Promise<P>;
  /** the mip half the size of p (textures.ts downscale(p, 0.5)) */
  halve(p: P): P;
  /** a picture dropped (a bitmap closed, a canvas emptied) */
  close(p: P): void;
}

/** what the cache did, for the bench's counts (textures.ts TileCacheStats) */
export interface TileCacheEvents {
  /** a decode started */
  decode?(url: string): void;
  /** a decode failed */
  error?(url: string, err: unknown): void;
  /** a picture dropped: the source, a mip, a pre-scaled copy, or the url's last picture (the whole tile gone) */
  drop?(url: string, what: 'source' | 'mip' | 'copy' | 'tile'): void;
  /** a mip or a copy made (ms) */
  scale?(ms: number): void;
}

export class TileCache<P extends Pic> {
  /** the bytes this cache may hold after a trim, and the sources it may keep decoded (a light boot's few: T157) */
  budget = TILE_CACHE_BYTES; maxSources = 24;
  /** the bytes held now, and the most ever (the pinned pictures of the bakes about to run can take it past the budget until the next trim) */
  bytes = 0; peak = 0;
  on: TileCacheEvents = {};
  private map = new Map<string, Entry<P>>();
  private loads = new Map<string, Promise<void>>();
  private clock = 0; private sources = 0;
  /** urls whose full-size decode a bake asked for and found dropped (the swamp's gloss): kept, and decoded again by the next preparation */
  private keepSrc = new Set<string>();
  constructor(private ops: TileCacheOps<P>) {}

  get size() { return this.map.size; }
  has(url: string) { return this.map.has(url); }
  /** url's pictures serve a bake laying it px wide without decoding it again (a kept mip at least that wide, or its source) */
  ready(url: string, px: number): boolean {
    const e = this.map.get(url); if (!e) return false;
    if (this.keepSrc.has(url) && !e.src) return false;
    return e.src || e.pics[0]!.width >= px;
  }
  /** before a bake: every url of want made ready at its px (the widest its cells take): one already ready counts as used; one not is decoded
   *  (one decode however many bakes wait for it), its mip at px made at once and the decode dropped; then the cache trimmed, never dropping
   *  these or keep's */
  async prepare(want: ReadonlyMap<string, number>, keep: Iterable<string> = []): Promise<void> {
    await Promise.all([...want].map(([url, px]) => {
      if (this.ready(url, px)) { this.touch(url, px); return null; }
      let pending = this.loads.get(url);
      if (!pending) {
        this.on.decode?.(url);
        pending = this.ops.decode(url).then(pic => { this.addSource(url, pic); this.image(url, px); this.dropSource(url); }, err => { this.on.error?.(url, err); })
          .finally(() => { this.loads.delete(url); });
        this.loads.set(url, pending);
      }
      // (a second bake waiting on the same decode makes its own mip from the first's)
      return pending.then(() => { this.image(url, px); });
    }));
    this.trim(new Set([...want.keys(), ...keep]));
  }
  /** the smallest picture of url at least px wide, made by halving if need be (a bake draws it: used now); its source when none is and the
   *  source is kept (px past the source: drawn as main drew it); null when url is not decoded, or its source is gone and px is past its mips */
  image(url: string, px = Infinity): P | null {
    const e = this.map.get(url); if (!e) return null;
    for (let last = e.pics[e.pics.length - 1]!; last.width > 96 && last.width / 2 >= px; last = e.pics[e.pics.length - 1]!) {
      const t0 = performance.now(), m = this.ops.halve(last); this.on.scale?.(performance.now() - t0);
      e.pics.push(m); e.stamps.push(0); this.add(picBytes(m));
    }
    const k = this.pick(e, px); if (k < 0) return null;
    e.stamps[k] = ++this.clock;
    return e.pics[k]!;
  }
  /** url's full-size decode, or null when it was dropped: then the next preparation decodes it again and keeps it until it is asked for (the
   *  bake asking is provisional meanwhile). Not a use: it goes after the bake */
  source(url: string): P | null {
    const e = this.map.get(url);
    if (!e?.src) { this.keepSrc.add(url); return null; }
    this.keepSrc.delete(url);
    return e.pics[0]!;
  }
  /** url pre-scaled to exactly w x h px (kept with its pictures, used now): made by make from the picture a w-px cell draws; null when that
   *  picture is not there */
  exact(url: string, w: number, h: number, make: (from: P) => P): P | null {
    const e = this.map.get(url); if (!e) return null;
    const k = `${w}x${h}`, have = e.exact.get(k);
    if (have) { have.stamp = ++this.clock; return have.pic; }
    const from = this.image(url, w); if (!from) return null;
    const t0 = performance.now(), pic = make(from); this.on.scale?.(performance.now() - t0);
    e.exact.set(k, { pic, stamp: ++this.clock }); this.add(picBytes(pic));
    return pic;
  }
  /** the picture a px-wide cell of url would draw now (nothing made, nothing marked used: the bench), or null */
  peek(url: string, px: number): P | null { const e = this.map.get(url); if (!e) return null; const k = this.pick(e, px); return k >= 0 ? e.pics[k]! : null; }
  /** after a bake: every full-size decode no bake drew itself dropped (its mips are made; it is needed again only for a mip wider than any
   *  kept), but one a bake asked to keep; then the cache trimmed to its budget */
  afterBake() {
    for (const url of [...this.map.keys()]) this.dropSource(url);
    this.trim();
  }
  /** drops the least recently used pictures until the cache holds at most budget bytes and maxSources sources: never a picture of a pinned
   *  url (the bakes about to run), never a source a bake asked to keep; a chain only at its head or its tail */
  trim(pinned: ReadonlySet<string> = new Set()) {
    for (;;) {
      const overBytes = this.bytes > this.budget, overSrc = this.sources > this.maxSources;
      if (!overBytes && !overSrc) return;
      // the least recently used picture that may go: a source (not kept for a bake), and past the bytes a copy, a chain's head or its tail
      const best: { url: string; at: number; copy: string | null; stamp: number } = { url: '', at: -1, copy: null, stamp: Infinity };
      for (const [u, e] of this.map) {
        if (pinned.has(u)) continue;
        const n = e.pics.length, cands: [number, string | null, number][] = [];
        if (e.src && !this.keepSrc.has(u)) cands.push([0, null, e.stamps[0]!]);
        if (overBytes) {
          for (const [k, x] of e.exact) cands.push([-1, k, x.stamp]);
          if (!e.src) cands.push([0, null, e.stamps[0]!]);
          if (n > 1) cands.push([n - 1, null, e.stamps[n - 1]!]);
        }
        for (const [at, copy, stamp] of cands) if (stamp < best.stamp) { best.url = u; best.at = at; best.copy = copy; best.stamp = stamp; }
      }
      const e = this.map.get(best.url); if (!e) return; // (all pinned: past the budget until the next trim)
      if (best.copy !== null) { const x = e.exact.get(best.copy)!; e.exact.delete(best.copy); this.bytes -= picBytes(x.pic); this.ops.close(x.pic); this.on.drop?.(best.url, 'copy'); continue; }
      this.cut(best.url, e, best.at);
    }
  }

  /** marks the picture a px-wide cell of url draws as used (a bake's preparation needs it: a tile listed but not laid keeps its mip) */
  private touch(url: string, px: number) {
    const e = this.map.get(url); if (!e) return;
    const k = this.pick(e, px); if (k >= 0 && !(e.src && k === 0)) e.stamps[k] = ++this.clock;
  }
  /** url's fresh full-size decode: put ahead of the mips kept when they are its own halvings, else in their place (never used yet) */
  private addSource(url: string, pic: P) {
    const e = this.map.get(url);
    if (e?.src) { this.ops.close(pic); return; } // (decoded already)
    if (e && halfOf(pic.width) === e.pics[0]!.width) { e.pics.unshift(pic); e.stamps.unshift(0); e.src = true; }
    else { if (e) this.dropEntry(url, e); this.map.set(url, { pics: [pic], stamps: [0], src: true, exact: new Map() }); }
    this.sources++; this.add(picBytes(pic));
  }
  /** url's full-size decode dropped, unless a bake drew it itself, asked to keep it, or it has no mip yet */
  private dropSource(url: string) {
    const e = this.map.get(url);
    if (e?.src && !e.stamps[0] && !this.keepSrc.has(url) && e.pics.length > 1) this.cut(url, e, 0);
  }
  /** the index of the picture a px-wide cell draws: the smallest at least px wide; the source when px is past every picture and it is kept;
   *  -1 when px is past every mip and the source is gone */
  private pick(e: Entry<P>, px: number): number {
    let k = -1; for (let i = 0; i < e.pics.length; i++) { if (e.pics[i]!.width >= px) k = i; else break; }
    return k >= 0 ? k : e.src ? 0 : -1;
  }
  private add(n: number) { this.bytes += n; if (this.bytes > this.peak) this.peak = this.bytes; }
  /** drops picture `at` of url's chain (its head or its tail); its last: the whole tile */
  private cut(url: string, e: Entry<P>, at: number) {
    const pic = e.pics[at]!, wasSrc = at === 0 && e.src;
    e.pics.splice(at, 1); e.stamps.splice(at, 1); this.bytes -= picBytes(pic); this.ops.close(pic);
    if (wasSrc) { e.src = false; this.sources--; }
    if (!e.pics.length) this.dropEntry(url, e); else this.on.drop?.(url, wasSrc ? 'source' : 'mip');
  }
  private dropEntry(url: string, e: Entry<P>) {
    for (const p of e.pics) { this.bytes -= picBytes(p); this.ops.close(p); }
    for (const x of e.exact.values()) { this.bytes -= picBytes(x.pic); this.ops.close(x.pic); }
    if (e.src) this.sources--;
    this.map.delete(url); this.on.drop?.(url, 'tile');
  }
}
