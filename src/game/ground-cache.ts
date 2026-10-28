/** The main thread's side of ground baking: which chunks are on screen, which are baked (as GL textures), which are
 *  stale after an edit, and a small pool of ground workers that bake them. Edits never block drawing: a stale chunk
 *  keeps showing its old picture until the new one arrives, and every visible chunk falls back to the planner map. */
import { CHUNK_H, CHUNK_W, MID_H, MID_W, PLAN_H, PLAN_W, PLAN_K } from './iso';
import { GROUND_ART } from './ground-art';
import { CH_SIZE, CH_STEP } from './ext/course-height';
import { HEIGHT_LIGHT_REACH, HEIGHT_LIGHT_STRENGTH, clampHeightLight } from './ext/course-height/light';
import { withBaseGrass } from './base-grass-saved';
import { withPresets } from './paint-presets-saved';
import { GRASS_ART_DEFAULT, type GrassArt } from './painted-grass-lod';
import { patchBox, type FromWorker, type LotPatch, type NetOp, type TileKind, type ToWorker, type WorkerLimits } from './ground-protocol';
import type { GLRenderer } from './gl';
import { unionBox, type BBox } from './network';
import type { Waterway } from './terrain/types';
import GroundWorker from './ground.worker?worker';
import type { GrassCellView } from './ext/grass-management';
import { casterChange } from './living-ground';
import { LEAF_DENSITY_DEFAULT, clampLeafDensity } from './leaf-fall';
import { onPaintedSurfaces, paintedSurfaces, setPaintedSurfaces } from './painted-surfaces-live';
import { finishOf, type CourseFinish } from './course-finish';
import { REFLECT, clampWaterLook, waterLookOf, type WaterLook } from './water-look';
import type { PaintedLook } from './painted-families';
import { pictureCurrent } from './ground-layers';
import { SHINE_WEIGHTS, type ShineWeights } from './grass-shine';

export interface Tile {
  kind: TileKind; i: number; j: number;
  tex: WebGLTexture | null; texL: number; texArtL: number; px: number;
  /** T186: its picture's baked shade multiplier (renderer.ts takeShadeMask, a quarter of its size; gl.ts drawShadeMask), null when it has none */
  shade: WebGLTexture | null;
  /** the picture before the last edit, kept for the build reveal */
  prev: WebGLTexture | null; prevUntil: number;
  /** A short zoom-resolution crossfade; independent of the construction reveal picture. */
  fadeFrom: WebGLTexture | null; fadeStart: number; fadePx: number;
  gen: number; stale: boolean; pendingL: number; pendingArtL: number; used: number;
  /** the tile spec its picture was baked at (painted-tiles.ts tileSpec: the band and the DPR) and whether it laid a tile set family (T145,
   *  T150: only such a chunk depends on the spec), and the spec of the bake in flight */
  texTs: number; texTiled: boolean; pendingTs: number;
  /** when its picture last landed (performance.now ms), and the earliest time it may be baked again while it still has a picture (a course
   *  stroke re-staling the same chunks every send: each is re-baked at most every COURSE_HOLD_MS, showing its last picture meanwhile) */
  baked: number; hold: number;
}
/** T197: how long a provisional picture (a tile set not decoded yet) shows before its chunk is asked for again, ms */
export const PROVISIONAL_RETRY_MS = 400;
/** how many times running a chunk is baked again for a tile set not decoded (a tile that never decodes: it keeps its photo after these) */
export const PROVISIONAL_TRIES = 4;
/** the least time between two bakes of a ground chunk that course edits keep re-staling, ms */
export const COURSE_HOLD_MS = 150;
/** the bakes the ground cache keeps the worker time of (bakeLog) */
export const BAKE_LOG = 4096;
const key = (k: TileKind, i: number, j: number) => (k === 'g' ? 0 : k === 'm' ? 1 : 2) * 1e10 + (j + 2048) * 65536 + (i + 32768);
const SIZE: Record<TileKind, [number, number]> = { g: [CHUNK_W, CHUNK_H], m: [MID_W, MID_H], p: [PLAN_W, PLAN_H] };

export class GroundCache {
  tiles = new Map<number, Tile>();
  /** the lot patches last sent, by lot key (to find the old boxes of edits) */
  private lotPatches = new Map<string, LotPatch[]>();
  private workers: Worker[] = []; private inflight: number[] = []; private reqs = new Map<number, { t: Tile; gen: number; w: number; at: number }>();
  private nextId = 1; private want: { t: Tile; L: number; artL: number; ts: number; pri: number }[] = [];
  ready = 0; private isReady: boolean[] = []; errors: string[] = []; bakeMs = 0; baked = 0;
  /** T197: the provisional pictures that landed (a tile set not decoded yet: baked again) */
  provisional = 0;
  private provTries = new WeakMap<Tile, number>();
  /** T166: the worker ms of the last BAKE_LOG bakes (a ring: entry n % BAKE_LOG is bake n; scripts/perf/memory.mjs reads their median and p95),
   *  when the first chunk landed (performance.now ms since the page loaded) and how long the builder took to have its textures (ms) */
  bakeLog: number[] = []; firstTileAt = 0; texMs = 0;
  /** T168: each bake's wait, from its request to its picture landing (ms, the same ring as bakeLog): what a stall in the worker costs the view */
  waitLog: number[] = [];
  /** T168: textures the open tool can lay, made ahead by the workers while idle (each name once) */
  private warmed = new Set<string>();
  prewarm(tex: Iterable<string>) { const fresh = [...tex].filter(t => !this.warmed.has(t)); if (!fresh.length) return; for (const t of fresh) this.warmed.add(t); this.broadcast({ t: 'prewarm', tex: fresh }); }
  /** the builder worker writes the textures to this browser's cache after a fresh start: seconds in which a bake sent to it waits (T134: the
   *  planner pieces asked for first landed 5 s late), so it takes none while it has peers */
  private saving: boolean[] = [];
  /** texture uploads in the last second, and the main-thread ms they cost */
  uploadsThisSecond = 0; uploadMsPerSecond = 0; private upCount = 0; private upMs = 0; private upT = 0;
  /** GPU pixel budget for baked chunks (RGBA, so x4 bytes) */
  budgetPx = 48e6;
  /** the baked pictures' pixels on the GPU at the last evict (chunks, their zoom crossfade and build reveal pictures), and the most so far */
  residentPx = 0; peakPx = 0;
  constructor(public gl: GLRenderer, workers = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 2))) {
    for (let w = 0; w < workers; w++) {
      const wk = new GroundWorker(); wk.onmessage = (e: MessageEvent<FromWorker>) => this.onMessage(w, e.data);
      this.workers.push(wk); this.inflight.push(0);
    }
  }
  terminate() { for (const w of this.workers) w.terminate(); this.workers = []; this.unsurfaces?.(); this.unsurfaces = null; }
  /** the game's Grass setting (painted-grass-lod.ts GrassArt), sent with the art */
  grassArt: GrassArt = GRASS_ART_DEFAULT;
  /** the Grass setting changed: every worker switches and every chunk is baked again (each keeps its old picture until then) */
  setGrassArt(art: GrassArt) { if (art === this.grassArt) return; this.grassArt = art; this.broadcast({ t: 'grassArt', art }); this.invalidateAll(); }
  /** a light boot's worker limits (boot.ts, T157), sent with init; null: the game's */
  limits: WorkerLimits | null = null;
  init(t: { cls: Uint8Array; height: Float32Array; waters: Waterway[] }) { const art = { ...withPresets(withBaseGrass(GROUND_ART)), grassArt: this.grassArt }, limits = this.limits ?? undefined; this.workers.forEach((wk, i) => wk.postMessage({ t: 'init', art, terrain: t.cls, height: t.height, waters: t.waters, build: i === 0, peers: this.workers.length - 1, limits } satisfies ToWorker)); this.broadcast({ t: 'living', ...this.living }); this.broadcast({ t: 'slopeLight', strength: this.slopeLight }); this.broadcast({ t: 'leaves', density: this.leafDensity }); this.broadcast({ t: 'specCam', on: this.specCam }); this.broadcast({ t: 'swamp', on: this.swamp }); this.broadcast({ t: 'riverSwamp', on: this.riverSwamp }); this.broadcast({ t: 'grassShine', on: this.grassShine, weights: this.shineWeights }); this.broadcast({ t: 'surfaces', file: paintedSurfaces() });
    // the studio saved the painted surfaces (the dev server hot-swaps the file): every worker takes the new looks and every chunk is baked again
    this.unsurfaces?.(); this.unsurfaces = onPaintedSurfaces(file => { this.broadcast({ t: 'surfaces', file }); this.invalidateAll(); }); }
  private unsurfaces: (() => void) | null = null;
  /** the course height light's strength (T126): light.json's, or the gear menu's Slope light */
  slopeLight = HEIGHT_LIGHT_STRENGTH;
  /** the Slope light changed: every worker switches and every chunk is baked again (each keeps its old picture until then) */
  setSlopeLight(v: number) { const s = clampHeightLight(v); if (s === this.slopeLight) return; this.slopeLight = s; this.broadcast({ t: 'slopeLight', strength: s }); this.invalidateAll(); }
  /** the living ground (T111): the gear menu's Ground variety and the dev debug view of its influence maps */
  living = { on: true, debug: false };
  /** the living ground is baked at all (its variety, or the debug view of its maps) */
  get livingActive() { return this.living.on || this.living.debug; }
  /** T220: the fallen leaves' density (the gear menu's Fallen leaves, leaf-fall.ts; 0 = none, the ground exactly as before T220) */
  leafDensity = LEAF_DENSITY_DEFAULT;
  /** the Fallen leaves changed: every worker switches and every chunk is baked again (each keeps its old picture until then); also the dev switch
   *  window.__game.ground.setLeafDensity(0) that compares the looks and the bake times */
  setLeafDensity(v: number) { const d = clampLeafDensity(v); if (d === this.leafDensity) return; this.leafDensity = d; this.broadcast({ t: 'leaves', density: d }); this.invalidateAll(); }
  /** the chunks lay something from the casters (the living ground, or the fallen leaves under the trees and along the fences and walls): a chunk
   *  waits for the casters round it, and a caster edit re-bakes the chunks under it */
  get castersUsed() { return this.livingActive || this.leafDensity > 0 || this.waterReflects; }
  /** T230: the water reflects its shore's trees and buildings (water-look.ts: the look on, its reflect knob above 0) */
  get waterReflects() { const w = this.waterLook; return w.on && w.reflect > 0; }
  /** T230: the water look (water-look.ts: deeper and more teal toward the middle, a lighter edge, the shore's reflections) as the surfaces file
   *  has it (Studio > Painted > Water look) */
  get waterLook(): WaterLook { return waterLookOf(paintedSurfaces()); }
  /** T230: sets some of the water look's knobs (the rest stay), as a studio save does: every chunk is baked again. The dev switch
   *  window.__game.ground.setWaterLook({ on: false }) compares the water before T230 and the bake times */
  setWaterLook(f: Partial<WaterLook>) { const cur = paintedSurfaces(); setPaintedSurfaces({ ...cur, water: clampWaterLook({ ...waterLookOf(cur), ...f }) }); }
  /** T230: a surface's painted look from the console, as a studio save does (window.__game.ground.setSurfaceLook('water', { family: 'lake' })
   *  with setWaterLook({ on: false }) brings back the water before T230) */
  setSurfaceLook(key: string, look: Partial<PaintedLook>) { const cur = paintedSurfaces(), was = cur.surfaces[key]; setPaintedSurfaces({ ...cur, surfaces: { ...cur.surfaces, [key]: { ...(was ?? { family: '', version: null, scale: 1, tint: '#ffffff', tone: 0 }), ...look } } }); }
  /** Ground variety or its debug view changed: every worker switches and every chunk is baked again (each keeps its old picture until then) */
  /** T204: the rugged edges on or off (the dev switch: window.__game.ground.setRugged(false) compares the looks and the bake times) */
  rugged = true;
  setRugged(on: boolean) { if (on === this.rugged) return; this.rugged = on; this.broadcast({ t: 'rugged', on }); this.invalidateAll(); }
  /** T247: the soft dirt edges on (the default) or off (the dev switch: window.__game.ground.setSoftDirt(false) shows the look before T247 and
   *  compares the bake times) */
  softDirt = true;
  setSoftDirt(on: boolean) { if (on === this.softDirt) return; this.softDirt = on; this.broadcast({ t: 'softDirt', on }); this.invalidateAll(); }
  /** T218: the fairways' mowing stripes on or off (the dev switch: window.__game.ground.setStripes(false) compares the looks and the bake times) */
  stripes = true;
  setStripes(on: boolean) { if (on === this.stripes) return; this.stripes = on; this.broadcast({ t: 'stripes', on }); this.invalidateAll(); }
  /** T227: the course finish (course-finish.ts: the fairway and outfield bands, the green stripes, the darker collar, the bunker lips) as the
   *  surfaces file has it (Studio > Painted > Course finish) */
  get courseFinish(): CourseFinish { return finishOf(paintedSurfaces()); }
  /** T227: sets some of the course finish's knobs (the rest stay), as a studio save does: every chunk is baked again, and the engine lays the
   *  collars again when their width changed. The dev switch window.__game.ground.setCourseFinish({ on: false }) compares the look before T227
   *  and the bake times */
  setCourseFinish(f: Partial<CourseFinish>) { const cur = paintedSurfaces(); setPaintedSurfaces({ ...cur, course: { ...finishOf(cur), ...f } }); }
  /** T215: the street lamps' reflection pools as the camera specular (on: each chunk's pools go onto its reflection mask, lit on the GPU by the
   *  camera falloff, gl.ts FS_QUAD) or baked into the road picture as before (off, the default); the dev switch window.__game.specCam */
  specCam = false;
  setSpecCam(on: boolean) { if (on === this.specCam) return; this.specCam = on; this.broadcast({ t: 'specCam', on }); this.invalidateAll(); }
  /** T215: each chunk picture's reflection mask (renderer.ts takeSpecMask), by picture: it goes wherever its picture is drawn (a zoom
   *  crossfade's old picture, the build reveal's, the other tier's fallback) and is deleted with it (dropPicture) */
  private specs = new Map<WebGLTexture, WebGLTexture>();
  /** the reflection mask of a chunk picture, or null (specCam off, or no lamp pool on its asphalt) */
  specOf(tex: WebGLTexture | null): WebGLTexture | null { return (tex && this.specs.get(tex)) ?? null; }
  /** T199: the small streams drawn as swamp (on, the default) or as their old creek bed (the dev switch window.__game.ground.setSwamp(false)
   *  compares the looks and the bake times); every chunk is baked again */
  swamp = true;
  setSwamp(on: boolean) { if (on === this.swamp) return; this.swamp = on; this.broadcast({ t: 'swamp', on }); this.invalidateAll(); }
  /** T265 (#794): the river's swamp band (on, the default) or the river as before (the dev switch window.__game.ground.setRiverSwamp(false), for
   *  comparing the looks and the bake times) */
  riverSwamp = true;
  setRiverSwamp(on: boolean) { if (on === this.riverSwamp) return; this.riverSwamp = on; this.broadcast({ t: 'riverSwamp', on }); this.invalidateAll(); }
  /** T265, the bench: every worker paints its last bakes of this kind again, the river's swamp on and off by turns, and answers each paint's ms */
  private abWait = new Map<number, (m: { on: number[]; off: number[] }) => void>();
  bakeAB(kind: 'g' | 'm', reps: number): Promise<{ on: number[]; off: number[] }> {
    return Promise.all(this.workers.map((wk, w) => new Promise<{ on: number[]; off: number[] }>(res => { this.abWait.set(w, res); wk.postMessage({ t: 'bakeAB', kind, reps } satisfies ToWorker); })))
      .then(rs => ({ on: rs.flatMap(r => r.on), off: rs.flatMap(r => r.off) }));
  }
  /** T199: each chunk picture's swamp gloss mask (renderer.ts takeGlossMask), by picture, as its reflection mask (it goes and is deleted with it) */
  private glosses = new Map<WebGLTexture, WebGLTexture>();
  /** the gloss mask of a chunk picture (T199 the swamp's pools, T230 its ponds and rivers), or null (specCam off, or no swamp or water on it) */
  glossOf(tex: WebGLTexture | null): WebGLTexture | null { return (tex && this.glosses.get(tex)) ?? null; }
  /** T262 (#769): the grass shine (grass-shine.ts) on (the default: each bake makes its chunk's weight mask, gl.ts FS_QUAD lights the grass by
   *  it) or off (no mask: the ground exactly as before), and its weights per surface group (baked into the masks); the gear menu's Grass shine */
  grassShine = true;
  shineWeights: ShineWeights = { ...SHINE_WEIGHTS };
  setGrassShine(on: boolean, weights: ShineWeights = this.shineWeights) {
    if (on === this.grassShine && JSON.stringify(weights) === JSON.stringify(this.shineWeights)) return;
    this.grassShine = on; this.shineWeights = { ...weights }; this.broadcast({ t: 'grassShine', on, weights: this.shineWeights }); this.invalidateAll();
  }
  /** T262: each chunk picture's grass shine weight mask, by picture, as its reflection mask (it goes and is deleted with it) */
  private shines = new Map<WebGLTexture, { mask: WebGLTexture; bytes: number }>();
  /** T262: the GPU bytes the weight masks of the pictures held take now (the bench's shineMB), and the worker ms of the last BAKE_LOG bakes'
   *  masks (the same ring as bakeLog) */
  shineBytes = 0; shineLog: number[] = [];
  shineOf(tex: WebGLTexture | null): WebGLTexture | null { return (tex && this.shines.get(tex)?.mask) ?? null; }
  /** delete a chunk picture and its reflection, gloss and shine masks */
  private dropPicture(tex: WebGLTexture) {
    this.gl.deleteTexture(tex); const s = this.specs.get(tex); if (s) { this.gl.deleteTexture(s); this.specs.delete(tex); }
    const g = this.glosses.get(tex); if (g) { this.gl.deleteTexture(g); this.glosses.delete(tex); }
    const sh = this.shines.get(tex); if (sh) { this.gl.deleteTexture(sh.mask); this.shineBytes -= sh.bytes; this.shines.delete(tex); }
  }
  setLiving(on: boolean, debug: boolean) { if (on === this.living.on && debug === this.living.debug) return; this.living = { on, debug }; this.broadcast({ t: 'living', on, debug }); this.invalidateAll(); }
  /** the caster records last sent, by key, and the edits waiting for the next pump (null: the key goes) */
  private casterSent = new Map<string, Float32Array>(); private casterQueue = new Map<string, Float32Array | null>(); private casterPrefixes: string[] = [];
  /** the living ground's casters of some keys (living-ground.ts records; an empty array drops the key): sent to the workers at the next pump,
   *  before any chunk it asks for, and only the chunks under the records that changed are baked again */
  casters(set: Iterable<[string, Float32Array]>) { for (const [k, r] of set) this.casterQueue.set(k, r.length ? r : null); }
  /** every caster key starting with prefix goes (a new map: its forest and town-tree cells), without re-baking (the map's chunks are new) */
  dropCasters(prefix: string) { for (const k of [...this.casterSent.keys()]) if (k.startsWith(prefix)) this.casterSent.delete(k); for (const k of [...this.casterQueue.keys()]) if (k.startsWith(prefix)) this.casterQueue.delete(k); this.casterPrefixes.push(prefix); }
  /** true while caster edits wait to be sent */
  get castersPending() { return this.casterQueue.size > 0; }
  private flushCasters() {
    if (!this.casterQueue.size && !this.casterPrefixes.length) return;
    const set: [string, Float32Array][] = [], drop: string[] = [];
    for (const [k, r] of this.casterQueue) {
      const old = this.casterSent.get(k), box = casterChange(old, r ?? new Float32Array(0));
      if (r) { this.casterSent.set(k, r); if (box || !old) set.push([k, r]); } else if (old) { this.casterSent.delete(k); drop.push(k); }
      // (T230: with the water's reflections, also the water below it down the screen, as far as a reflection reaches)
      if (box && this.castersUsed) this.invalidate(this.waterReflects ? [box[0], box[1], box[2] + REFLECT.reach, box[3] + REFLECT.reach] : box, false, 0, 'gm');
    }
    this.casterQueue.clear();
    const dropPrefix = this.casterPrefixes.splice(0);
    if (set.length || drop.length || dropPrefix.length) this.broadcast({ t: 'casters', set, drop, dropPrefix });
  }
  broadcast(m: ToWorker, transfer?: (w: number) => Transferable[]) { this.workers.forEach((wk, i) => wk.postMessage(m, transfer ? transfer(i) : [])); }
  netOps(ops: NetOp[]) { if (ops.length) this.broadcast({ t: 'net', ops }); }
  lamps(pts: Float32Array) { this.broadcast({ t: 'lamps', pts }); }
  /** the tile set bands the workers decode ahead (painted-tiles.ts bandsAhead, T150): sent only when they change */
  private aheadKey = '';
  tilesAhead(bands: readonly number[]) { const k = bands.join(','); if (k === this.aheadKey) return; this.aheadKey = k; this.broadcast({ t: 'tilesAhead', bands: [...bands] }); }
  terrain(t: { cls: Uint8Array; height: Float32Array; waters: Waterway[] }) { this.broadcast({ t: 'terrain', cls: t.cls, height: t.height, waters: t.waters }); }
  blocks(data: Float32Array) { this.broadcast({ t: 'blocks', data }); }
  /** the course height in tile box b (whole samples, clamped) goes to every worker, and the ground its light reaches re-bakes (the old bake
   *  shows until then): the light at a point depends on the heights up to HEIGHT_LIGHT_REACH tiles away (T126) */
  courseHeight(field: Float32Array, b: [number, number, number, number]) {
    const i0 = Math.max(0, Math.floor(b[0] / CH_STEP) - 1), i1 = Math.min(CH_SIZE - 1, Math.ceil(b[2] / CH_STEP) + 1);
    const j0 = Math.max(0, Math.floor(b[1] / CH_STEP) - 1), j1 = Math.min(CH_SIZE - 1, Math.ceil(b[3] / CH_STEP) + 1);
    const w = i1 - i0 + 1, h = j1 - j0 + 1, data = new Float32Array(w * h);
    for (let j = 0; j < h; j++) data.set(field.subarray((j0 + j) * CH_SIZE + i0, (j0 + j) * CH_SIZE + i1 + 1), j * w);
    this.broadcast({ t: 'course', i0, j0, w, h, data });
    const r = HEIGHT_LIGHT_REACH; this.invalidate([b[0] - r, b[1] - r, b[2] + r, b[3] + r], true);
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
    if (!t) { t = { kind, i, j, tex: null, texL: 0, texArtL: 0, px: 0, shade: null, prev: null, prevUntil: 0, fadeFrom: null, fadeStart: 0, fadePx: 0, gen: 0, stale: false, pendingL: 0, pendingArtL: 0, used: 0, baked: 0, hold: 0, texTs: -1, texTiled: false, pendingTs: -1 }; this.tiles.set(k, t); }
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
      if (keepPrev && t.tex && t.kind !== 'p') { if (t.prev && t.prev !== t.tex) this.dropPicture(t.prev); t.prev = t.tex; t.prevUntil = Math.max(t.prevUntil, until); }
    }
  }
  invalidateAll() { for (const t of this.tiles.values()) { t.gen++; t.stale = true; t.hold = 0; } }
  /** ask for a tile at a level this frame (lower pri = sooner); ts: the tile spec (painted-tiles.ts tileSpec, T145, T150: a picture that
   *  laid a tile set is baked again at another band or DPR, so a stale chunk never keeps an old set or size) */
  need(t: Tile, L: number, pri: number, now: number, artL = L, ts = 0) { t.used = now; if ((pictureCurrent(t, L, artL, ts) && (!t.stale || now < t.hold)) || t.pendingL === L && t.pendingArtL === artL && t.pendingTs === ts) return; this.want.push({ t, L, artL, ts, pri }); }

  /** send the most urgent requests to idle workers */
  pump() {
    this.flushCasters();
    if (!this.ready) { this.want = []; return; }
    this.want.sort((a, b) => a.pri - b.pri);
    for (const w of this.want) {
      // asked for twice this frame (the planner piece under several chunks): sent once, at its most urgent (T134: the copies filled every
      // worker's slots at a fresh start)
      if (w.t.pendingL === w.L && w.t.pendingArtL === w.artL && w.t.pendingTs === w.ts) continue;
      let best = -1; for (let i = 0; i < this.workers.length; i++) if (this.isReady[i] && this.inflight[i] < 2 && (!this.saving[i] || this.workers.length === 1) && (best < 0 || this.inflight[i] < this.inflight[best])) best = i;
      if (best < 0) break;
      const id = this.nextId++; w.t.pendingL = w.L; w.t.pendingArtL = w.artL; w.t.pendingTs = w.ts; this.inflight[best]++;
      this.reqs.set(id, { t: w.t, gen: w.t.gen, w: best, at: performance.now() });
      this.workers[best].postMessage({ t: 'paint', id, kind: w.t.kind, i: w.t.i, j: w.t.j, L: w.L, artL: w.artL, ts: w.ts } satisfies ToWorker);
    }
    this.want = [];
  }
  get busy() { return this.inflight.reduce((s, v) => s + v, 0); }
  /** T197: nothing asked for this frame and no bake in flight: the view's ground is done, and chunks ahead may be baked (Engine.prebake) */
  get idle() { return this.want.length === 0 && this.busy === 0; }
  /** the hold on chunks a course edit re-stales (COURSE_HOLD_MS; the benchmark tries others) */
  courseHoldMs = COURSE_HOLD_MS;
  private onMessage(w: number, m: FromWorker) {
    if (m.t === 'ready') { this.ready++; this.isReady[w] = true; this.saving[w] = !!m.saving; if (w === 0) this.texMs = m.ms; return; }
    if (m.t === 'saved') { this.saving[w] = false; return; }
    if (m.t === 'error') { this.errors.push(m.message); console.error('[ground worker]', m.message); return; }
    if (m.t === 'log') { console.log(`[ground worker ${w}]`, m.message); return; }
    if (m.t === 'bakeAB') { const f = this.abWait.get(w); this.abWait.delete(w); f?.(m); return; }
    if (m.t === 'texpack') { m.snaps.forEach((snap, k) => this.workers[k + 1]?.postMessage({ t: 'textures', snap } satisfies ToWorker, snap.bitmaps)); return; }
    const r = this.reqs.get(m.id); this.reqs.delete(m.id); this.inflight[w]--;
    if (!r) { m.bmp.close(); m.shade?.close(); m.spec?.close(); m.gloss?.close(); return; }
    const t = r.t; t.pendingL = 0; t.pendingArtL = 0; t.pendingTs = -1;
    this.bakeLog[this.baked % BAKE_LOG] = m.ms; this.waitLog[this.baked % BAKE_LOG] = performance.now() - r.at; if (!this.firstTileAt) this.firstTileAt = performance.now();
    this.bakeMs += m.ms; this.shineLog[this.baked % BAKE_LOG] = m.shineMs ?? 0; this.baked++;
    // edited while baking: it will be asked for again, and keeps the picture it has meanwhile; one with none shows this one (stale, so it is
    // still asked for again: the ground before the edit for a bake, rather than nothing; T134, the startup's edits did this to the planner pieces)
    const edited = r.gen !== t.gen;
    if (edited && t.tex) { m.bmp.close(); m.shade?.close(); m.spec?.close(); m.gloss?.close(); return; }
    const u0 = performance.now();
    // a new tile spec (T145, T150: a band switch or a DPR change) keeps the old picture until the whole view has the new one too (engine.ts: then a cut, never a crossfade between sets)
    const ts = m.ts ?? 0, stepChanged = (t.texTiled || !!m.tiled) && t.texTs !== ts;
    const old = t.tex, oldL = t.texL, oldPx = t.px, artL = m.artL ?? m.L, fade = old && (oldL !== m.L || t.texArtL !== artL || stepChanged) && !t.stale && t.kind !== 'p' && !t.prev;
    if (t.fadeFrom && t.fadeFrom !== old && t.fadeFrom !== t.prev) this.dropPicture(t.fadeFrom);
    t.fadeFrom = null; t.fadePx = 0;
    // (T186: the shade mask goes with the new picture: the fading old picture shows over the new mask meanwhile, a few frames)
    if (t.shade) this.gl.deleteTexture(t.shade);
    t.shade = m.shade ? this.gl.textureFrom(m.shade) : null; m.shade?.close();
    t.tex = this.gl.textureFrom(m.bmp); t.texL = m.L; t.texArtL = artL; t.texTs = ts; t.texTiled = !!m.tiled; t.px = m.bmp.width * m.bmp.height; t.stale = edited; t.baked = u0; m.bmp.close();
    if (m.spec) { this.specs.set(t.tex, this.gl.specTexture(m.spec)); m.spec.close(); }
    if (m.gloss) { this.glosses.set(t.tex, this.gl.specTexture(m.gloss)); m.gloss.close(); } // (T199: premultiplied, as the reflection mask)
    if (m.shine) { const sh = m.shine; this.shines.set(t.tex, { mask: this.gl.byteTexture(sh.data, sh.w, sh.h), bytes: sh.data.length }); this.shineBytes += sh.data.length; } // (T262: plain bytes, R8)
    // T197: a picture that fell back to the photo where a tile set was not decoded yet shows meanwhile and is asked for again after a short
    // hold (the tiles decode on the way), so a placeholder never stays
    if (m.prov && !edited) { this.provisional++; const k = (this.provTries.get(t) ?? 0) + 1; this.provTries.set(t, k); if (k <= PROVISIONAL_TRIES) { t.stale = true; t.hold = u0 + PROVISIONAL_RETRY_MS; } }
    else this.provTries.delete(t);
    if (fade) { t.fadeFrom = old; t.fadeStart = Infinity; t.fadePx = oldPx; }
    else if (old && old !== t.prev) this.dropPicture(old);
    const u1 = performance.now(); this.upCount++; this.upMs += u1 - u0;
    if (u1 - this.upT > 1000) { this.uploadsThisSecond = this.upCount; this.uploadMsPerSecond = this.upMs; this.upCount = 0; this.upMs = 0; this.upT = u1; }
  }
  /** drop the least recently used pictures above the pixel budget (planner pieces too: one is asked for first whenever a chunk on screen has
   *  no picture, so each new place the camera goes keeps one, T134; one not drawn for a while is baked again in a millisecond or two) */
  evict(now: number) {
    let px = 0, held = 0; for (const t of this.tiles.values()) { px += (t.tex ? t.px : 0) + t.fadePx; if (t.prev && t.prev !== t.tex) held += t.px; }
    this.residentPx = px + held; this.peakPx = Math.max(this.peakPx, this.residentPx);
    if (px <= this.budgetPx) return;
    const old = [...this.tiles.values()].filter(t => t.tex && t.used !== now).sort((a, b) => a.used - b.used);
    for (const t of old) { if (px <= this.budgetPx * 0.8) break; px -= t.px + t.fadePx; this.dropPicture(t.tex!); t.tex = null; if (t.shade) { this.gl.deleteTexture(t.shade); t.shade = null; } if (t.prev) { this.dropPicture(t.prev); t.prev = null; } if (t.fadeFrom) { this.dropPicture(t.fadeFrom); t.fadeFrom = null; t.fadePx = 0; } }
  }
  /** release reveal pictures whose animation is over */
  settle(now: number) { for (const t of this.tiles.values()) {
    if (t.prev && now > t.prevUntil && !t.stale) { if (t.prev !== t.tex) this.dropPicture(t.prev); t.prev = null; }
    if (t.fadeFrom && (now >= t.fadeStart + 180 || !Number.isFinite(t.fadeStart) && now - t.used > 2000)) { if (t.fadeFrom !== t.tex && t.fadeFrom !== t.prev) this.dropPicture(t.fadeFrom); t.fadeFrom = null; t.fadePx = 0; }
  } }
  static planOf(i: number, j: number) { return { i: Math.floor(i / PLAN_K), j: Math.floor(j / PLAN_K) }; }
  /** Reuse the other ground tier's already baked pictures during a zoom transition; never request extra bakes. */
  zoomFallback(kind: 'g' | 'm', box: readonly [number, number, number, number], now: number) {
    const other = kind === 'g' ? 'm' : 'g', [w, h] = SIZE[other], result: { tex: WebGLTexture; spec: WebGLTexture | null; rect: [number, number, number, number]; uv: [number, number, number, number] }[] = [];
    for (let j = Math.floor(box[1] / h); j < Math.ceil(box[3] / h); j++) for (let i = Math.floor(box[0] / w); i < Math.ceil(box[2] / w); i++) {
      const tile = this.tiles.get(key(other, i, j)); if (!tile?.tex) continue;
      const x0 = Math.max(box[0], i * w), y0 = Math.max(box[1], j * h), x1 = Math.min(box[2], (i + 1) * w), y1 = Math.min(box[3], (j + 1) * h);
      tile.used = now;
      result.push({ tex: tile.tex, spec: this.specOf(tile.tex), rect: [x0, y0, x1, y1], uv: [(x0 - i * w) / w, (y0 - j * h) / h, (x1 - i * w) / w, (y1 - j * h) / h] });
    }
    return result;
  }
}
