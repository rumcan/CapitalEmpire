// The GL side of atlas residency (T080; atlas-pages.ts decides what is resident): the always-resident low set (every page from mip lowBase
// down, one texture array), the streamed tiers (texture arrays of cell slots), the cell lookup (an R32I texture: one texel per cell, read by
// the sprite shaders), the fetch and decode of page levels, and the uploads, a few per frame.
import { AtlasPages, atlasBudget, planAtlas, slotRect, type AtlasPlan, type PageLoad, type PageWant, type TierPlan } from './atlas-pages';

/** a GPU texture format the atlas pages upload as (bpp: bytes per texel; clear: a transparent 4 x 4 block of a block format) */
export interface GpuFormat { name: 'rgba8' | 'bc7' | 'astc' | 'etc2'; internal: number; bpp: number; compressed: boolean; clear?: Uint8Array }
export const RGBA8_FORMAT: GpuFormat = { name: 'rgba8', internal: 0x8058 /* RGBA8 */, bpp: 4, compressed: false };

/** one level of one page, decoded for upload: a premultiplied ImageBitmap (RGBA8), or compressed blocks (rows of 4 x 4 blocks, top down) */
export interface LevelData { width: number; height: number; bitmap?: ImageBitmap; blocks?: Uint8Array; close(): void }
/** where the page levels come from */
export interface AtlasSource { format: GpuFormat; level(page: number, level: number): Promise<LevelData>; dispose?(): void }

/** the WebP pages (one URL per page and mip), decoded premultiplied for RGBA8 */
export function webpSource(pages: string[][]): AtlasSource {
  return {
    format: RGBA8_FORMAT,
    async level(p, m) {
      const r = await fetch(pages[p]![m]!); if (!r.ok) throw new Error(`atlas page ${p} mip ${m}: ${r.status}`);
      const bitmap = await createImageBitmap(await r.blob(), { premultiplyAlpha: 'premultiply', colorSpaceConversion: 'none' });
      return { width: bitmap.width, height: bitmap.height, bitmap, close: () => bitmap.close() };
    },
  };
}

/** decoded page levels kept a little while, so the cells of one page-level share a single fetch and decode */
const KEEP_LEVELS = 6;
/** decodes in flight at once */
const DECODES = 4;
/** cell loads in flight at once (they share decodes) */
const LOADS = 96;
/** texels uploaded per frame at most (about 8 MB of RGBA8; at least one load always goes) */
const UPLOAD_TEXELS = 2 << 20;

interface Level { key: number; promise: Promise<LevelData | null>; data: LevelData | null; refs: number; last: number }

export class AtlasGL {
  readonly plan: AtlasPlan;
  /** decoded page levels kept for the next loads (KEEP_LEVELS; a light boot's fewer, T157) */
  keepLevels = KEEP_LEVELS;
  readonly pages: AtlasPages;
  private low: WebGLTexture; private tiers: WebGLTexture[]; private cells: WebGLTexture;
  private levels = new Map<number, Level>();
  private decodeQueue: (() => void)[] = []; private decoding = 0;
  private ready: { load: PageLoad; level: Level }[] = [];
  private zero: Uint8Array;
  frame = 0;
  stats = { uploads: 0, uploadTexels: 0, decodes: 0, failed: 0 };

  private constructor(private gl: WebGL2RenderingContext, private source: AtlasSource, plan: AtlasPlan) {
    this.plan = plan; this.pages = new AtlasPages(plan);
    const f = source.format.internal, P = plan;
    this.low = this.array(f, P.size >> P.lowBase, P.levels - P.lowBase, P.pages);
    this.tiers = P.tiers.map(t => this.array(f, t.slot, t.levels, t.slots));
    this.cells = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, this.cells);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R32I, P.grid * P.grid, P.pages);
    for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // the widest strip of border that can fall outside a page: transparent (the page's own gutter is), zeros or the format's clear block
    const widest = Math.ceil(Math.max(16, ...P.tiers.map(t => t.slot * t.border * source.format.bpp)) / 16) * 16;
    this.zero = new Uint8Array(widest); if (source.format.clear) for (let o = 0; o < widest; o += 16) this.zero.set(source.format.clear, o);
    this.flushLookup();
  }

  /** plan the atlas for this screen, allocate it and load the low set (every page from mip lowBase down) before the first frame; budget: a
   *  light boot's own (compressed bytes, T157: the lot lab's), else GAME-PLAN's for the screen */
  static async create(gl: WebGL2RenderingContext, o: { dpr: number; pages: number; size: number; levels: number; finest: number; source: AtlasSource; budget?: number; keep?: number }) {
    const fmt = o.source.format, maxLayers = gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS) as number;
    // the budget is GAME-PLAN's in compressed bytes; an RGBA8 fallback keeps the same cells resident at 4x the bytes
    const plan = planAtlas({ pages: o.pages, size: o.size, levels: o.levels, bpp: fmt.bpp, budget: (o.budget ?? atlasBudget(o.dpr)) * fmt.bpp, finest: o.finest, maxLayers });
    const a = new AtlasGL(gl, o.source, plan);
    if (o.keep !== undefined) a.keepLevels = o.keep;
    await a.loadLow();
    // a compressed source missing pages (a build without its KTX2 files) is no use: the caller falls back to the WebP pages
    if (a.stats.failed && fmt.compressed) { a.dispose(); throw new Error(`atlas: ${a.stats.failed} ${fmt.name} page levels failed to load`); }
    return a;
  }
  /** free the textures and the source's workers */
  dispose() {
    const gl = this.gl; for (const t of [this.low, ...this.tiers]) gl.deleteTexture(t); gl.deleteTexture(this.cells);
    for (const l of this.levels.values()) l.data?.close(); this.levels.clear(); this.ready = [];
    this.source.dispose?.();
  }
  /** the GPU format the pages are in */
  get format() { return this.source.format.name; }

  private array(internal: number, size: number, levels: number, layers: number) {
    const gl = this.gl, t = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, internal, size, size, Math.max(1, layers));
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAX_LEVEL, levels - 1);
    return t;
  }

  private async loadLow() {
    const P = this.plan, jobs: [number, number][] = [];
    for (let p = 0; p < P.pages; p++) for (let m = P.lowBase; m < P.levels; m++) jobs.push([p, m]);
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const [p, m] = jobs[next++]!;
        const d = await this.source.level(p, m).catch(() => null);
        if (!d) { this.stats.failed++; continue; }
        this.put(this.low, m - P.lowBase, p, 0, 0, d, 0, 0, d.width, d.height);
        d.close();
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
  }

  /** upload the w x h rect at (sx, sy) of a decoded level into layer `layer`, mip `mip` of `tex`, at (x, y) */
  private put(tex: WebGLTexture, mip: number, layer: number, x: number, y: number, d: LevelData, sx: number, sy: number, w: number, h: number) {
    const gl = this.gl, f = this.source.format; if (w <= 0 || h <= 0) return;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    if (d.bitmap) {
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, sx); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, sy);
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, mip, x, y, layer, w, h, 1, gl.RGBA, gl.UNSIGNED_BYTE, d.bitmap);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    } else if (d.blocks) {
      // whole 4 x 4 blocks: copy the rows of blocks of the rect into one tight buffer
      const bw = Math.ceil(d.width / 4), bb = f.bpp * 16, cols = Math.ceil(w / 4), rows = Math.ceil(h / 4), out = new Uint8Array(cols * rows * bb);
      for (let r = 0; r < rows; r++) { const src = ((sy >> 2) + r) * bw + (sx >> 2); out.set(d.blocks.subarray(src * bb, (src + cols) * bb), r * cols * bb); }
      gl.compressedTexSubImage3D(gl.TEXTURE_2D_ARRAY, mip, x, y, layer, w, h, 1, f.internal, out);
    }
    this.stats.uploadTexels += w * h;
  }
  /** clear a rect of a slot (the part of its border past the page's edge) */
  private clear(tex: WebGLTexture, mip: number, layer: number, x: number, y: number, w: number, h: number) {
    const gl = this.gl, f = this.source.format; if (w <= 0 || h <= 0) return;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    const bytes = f.compressed ? Math.ceil(w / 4) * Math.ceil(h / 4) * f.bpp * 16 : w * h * 4;
    if (bytes > this.zero.length) { this.zero = new Uint8Array(bytes); if (f.clear) for (let o = 0; o < bytes; o += 16) this.zero.set(f.clear, o); }
    const z = this.zero.subarray(0, bytes);
    if (f.compressed) gl.compressedTexSubImage3D(gl.TEXTURE_2D_ARRAY, mip, x, y, layer, w, h, 1, f.internal, z);
    else gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, mip, x, y, layer, w, h, 1, gl.RGBA, gl.UNSIGNED_BYTE, z);
  }

  /** a page level, decoded once for every cell that needs it */
  private level(page: number, m: number): Level {
    const key = page * 16 + m; let l = this.levels.get(key);
    if (!l) {
      const entry: Level = { key, data: null, refs: 0, last: this.frame, promise: null! };
      entry.promise = new Promise<void>(res => { this.decodeQueue.push(res); this.pumpDecodes(); })
        .then(() => this.source.level(page, m))
        .then(d => { this.stats.decodes++; entry.data = d; return d; }, () => { this.stats.failed++; this.levels.delete(key); return null; })
        .finally(() => { this.decoding--; this.pumpDecodes(); });
      this.levels.set(key, entry); l = entry;
    }
    l.last = this.frame; return l;
  }
  private pumpDecodes() { while (this.decoding < DECODES && this.decodeQueue.length) { this.decoding++; this.decodeQueue.shift()!(); } }
  /** drop decoded levels no load is waiting for, beyond the few kept */
  private trimLevels() {
    if (this.levels.size <= this.keepLevels) return;
    const idle = [...this.levels.values()].filter(l => l.refs === 0 && l.data).sort((a, b) => a.last - b.last);
    for (const l of idle.slice(0, this.levels.size - this.keepLevels)) { l.data!.close(); this.levels.delete(l.key); }
  }

  /** this frame's wants: update the residency and start the loads it asks for */
  want(wants: PageWant[]) {
    this.frame++;
    for (const load of this.pages.update(this.frame, wants, LOADS)) {
      const page = Math.floor(load.unit / (this.plan.grid * this.plan.grid)), l = this.level(page, load.level);
      l.refs++;
      void l.promise.then(d => {
        if (this.pages.done(load, !!d, this.frame)) this.ready.push({ load, level: l });
        else l.refs--;
      });
    }
  }

  /** upload the cells whose levels have arrived, up to a budget of texels this frame; then the lookup if it changed */
  pump() {
    let texels = 0;
    while (this.ready.length && (texels === 0 || texels < UPLOAD_TEXELS)) {
      const { load, level } = this.ready.shift()!; level.refs--;
      const d = level.data; if (!d || !this.pages.valid(load)) continue;
      const tier = this.plan.tiers[load.tier]!, tex = this.tiers[load.tier]!, mip = load.level - tier.base, r = slotRect(this.plan, tier, load.unit, load.level);
      // the part of the slot inside the page, and zeros for the border past its edges
      const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y), x1 = Math.min(d.width, r.x + r.w), y1 = Math.min(d.height, r.y + r.h);
      this.put(tex, mip, load.slot, x0 - r.x, y0 - r.y, d, x0, y0, x1 - x0, y1 - y0);
      if (x0 > r.x) this.clear(tex, mip, load.slot, 0, 0, x0 - r.x, r.h);
      if (x1 < r.x + r.w) this.clear(tex, mip, load.slot, x1 - r.x, 0, r.x + r.w - x1, r.h);
      if (y0 > r.y) this.clear(tex, mip, load.slot, 0, 0, r.w, y0 - r.y);
      if (y1 < r.y + r.h) this.clear(tex, mip, load.slot, 0, y1 - r.y, r.w, r.y + r.h - y1);
      this.pages.uploaded(load); this.stats.uploads++; texels += r.w * r.h;
    }
    this.trimLevels();
    this.flushLookup();
  }
  private flushLookup() {
    const lookup = this.pages.takeLookup(); if (!lookup) return;
    const gl = this.gl, P = this.plan; gl.bindTexture(gl.TEXTURE_2D, this.cells);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, P.grid * P.grid, P.pages, gl.RED_INTEGER, gl.INT, lookup);
  }

  /** bind the low set, the tiers and the lookup to texture units from `unit` on; returns the units each sampler uses */
  bind(unit: number) {
    const gl = this.gl, units: number[] = [];
    const tex: [number, WebGLTexture][] = [[gl.TEXTURE_2D_ARRAY, this.low], ...this.tiers.map(t => [gl.TEXTURE_2D_ARRAY, t] as [number, WebGLTexture]), [gl.TEXTURE_2D, this.cells]];
    tex.forEach(([target, t], i) => { gl.activeTexture(gl.TEXTURE0 + unit + i); gl.bindTexture(target, t); units.push(unit + i); });
    gl.activeTexture(gl.TEXTURE0);
    return units;
  }
  /** the sampler uniforms' names, in bind() order */
  samplerNames() { return ['uLow', ...this.plan.tiers.map((_, i) => `uT${i + 1}`), 'uCells']; }

  /** GLSL: atlasTex(uv, page), the sprite colour (premultiplied) at page uv, from the finest resident mip of its cell */
  glsl(): string {
    const P = this.plan, f = (v: number) => v.toFixed(1);
    const tierCase = (t: TierPlan, i: number) => `if (t == ${i + 1}) { vec2 s = (cuv * ${f(t.cell)} + ${f(t.border)}) / ${f(t.slot)}; hi = textureLod(uT${i + 1}, vec3(s, layer), min(l, ${f(P.lowBase - 1)}) - ${f(t.base)}); }`;
    return `
uniform highp sampler2DArray uLow; ${P.tiers.map((_, i) => `uniform highp sampler2DArray uT${i + 1};`).join(' ')} uniform highp isampler2D uCells;
vec4 atlasTex(vec2 uv, float page) {
  // the level of detail in atlas mips (mip 0 = ${P.size} px), from the screen-space derivatives of the page uv
  vec2 dx = dFdx(uv) * ${f(P.size)}, dy = dFdy(uv) * ${f(P.size)};
  float lod = 0.5 * log2(max(max(dot(dx, dx), dot(dy, dy)), 1e-12));
  vec3 lp = vec3(uv, page);
  if (lod >= ${f(P.lowBase)}) return textureLod(uLow, lp, lod - ${f(P.lowBase)});
  ivec2 c = clamp(ivec2(floor(uv * ${f(P.grid)})), ivec2(0), ivec2(${P.grid - 1}));
  int code = texelFetch(uCells, ivec2(c.y * ${P.grid} + c.x, int(page + 0.5)), 0).r;
  int t = code & 7;
  if (t == 0) return textureLod(uLow, lp, 0.0);
  // clamped to the finest mip the cell's slot has (it streams in coarse to fine)
  float l = max(lod, float(code >> 14)), layer = float((code >> 3) & 2047);
  vec2 cuv = uv * ${f(P.grid)} - vec2(c);
  vec4 hi = vec4(0.0);
  ${P.tiers.map(tierCase).join('\n  else ')}
  // past the slot's coarsest mip, blend toward the low set's finest, as trilinear filtering would between the two
  if (l > ${f(P.lowBase - 1)}) hi = mix(hi, textureLod(uLow, lp, 0.0), l - ${f(P.lowBase - 1)});
  return hi;
}`;
  }

  /** GPU bytes of the atlas (fixed: the whole plan is allocated up front) */
  get bytes() { return this.plan.bytes; }
}

