// Tyre tracks on the grass (T322, #913; the owner, 2026-11-03: "add tracks to the course for where golf carts and equipment and cars drive on
// grass. just light and dark streaks. same as when you add height to the map, just light streaks for one direction and dark for another").
//
// A low-resolution wear field, one cell a tile (2 m), over the map. Each vehicle on the grass (the golf carts, the grounds crew's mowers and carts,
// the cars off the roads) is sampled where the game already works out its point (the movers near the screen) and leaves wear along the way it
// moved since its last sample, every STEP tiles, a little to the right of its way (LANE: a cart out and back along one route leaves two tracks
// side by side). A cell keeps:
//   - w, the wear (the tiles driven through it, weighted by the vehicle), fading by FADE_MIN game minutes when the traffic stops;
//   - vx, vy, the sum of the ways driven through it (unit vectors times the wear): its direction, and how one-way it is (|v| / w);
//   - o, the sum of where across the way the wheels passed (tiles from the cell's centre), so a track's streaks run on from cell to cell.
// None on greens, tees, bunkers, water, roads or paths: `ok` (the engine's) says which tiles take wear.
//
// The ground pass reads it (gl.ts FS_QUAD, TRACKS_GLSL) as a brightness change, the way the height light is (ext/course-height/light.ts): only
// light and dark, the grass's own texture times a factor, no colour, no wash. A track brightens where it was driven toward the sun's side
// (SUN_TILE_DIR: the grass laid over toward the light) and darkens where it was driven away, as mowing stripes do; two paired tyre streaks
// (GAUGE apart) on a soft worn lane. No ground re-bake, no atlas page: one RGBA8 texture of the map's tiles, its changed rows sent to the GPU
// now and then (UPLOAD_MS).
// Pure TypeScript (no DOM, no GL): the engine owns one, gl.ts uploads its bytes, tests/tyre-tracks.test.ts runs it in node.
import { SUN_TILE_DIR } from './ext/course-height';

/** tiles between two deposits along a vehicle's way */
export const STEP = 0.5;
/** the tracks lie this far to the right of the way driven (tiles): a two-way route leaves two tracks side by side */
export const LANE = 0.6;
/** a vehicle that moved further than this (tiles) since its last sample jumped (a skip, a new day, another vehicle in its slot): no wear */
export const MAX_JUMP = 14;
/** the wear that shows as about 63% of a track's full strength (w, tiles driven): a few passes faint, ten or so clear */
export const W_SAT = 8;
/** the most wear a cell holds (a route driven all season fades in days, not months) */
export const W_MAX = 40;
/** the e-folding time of the wear without traffic, game minutes (three days) */
export const FADE_MIN = 3 * 1440;
/** the fade runs at most this often (game minutes) and the GPU copy at most every UPLOAD_MS real milliseconds */
export const FADE_EVERY = 30, UPLOAD_MS = 250;
/** a cell's wear below this is dropped */
const W_EPS = 0.05;
/** how far across the way a deposit's point is kept (tiles from the cell's centre, in B as ±1) */
export const OFF_RANGE = 0.5;
/** the tracks' look (gl.ts TRACKS_GLSL): half the gauge between the paired streaks (tiles: 1.1 m between the wheels), a streak's width (its
 *  gaussian's sigma, tiles), the worn lane's share and width, and the strength (the brightness change at a full one-way track) */
export const GAUGE = 0.28, STREAK = 0.075, LANE_SHARE = 0.35, LANE_W = 0.5, STRENGTH = 0.14;
/** the switch, kept across reloads (the gear menu's Tyre tracks) */
export const TRACKS_KEY = 'capitalempire.tyreTracks';

/** the weight of each kind of vehicle's wear (a pass of a golf cart is 1) */
export const WEAR = { cart: 1, mower: 1.2, push: 0.4, car: 1.5 } as const;
export type WearKind = keyof typeof WEAR;

interface Cell { w: number; vx: number; vy: number; o: number }
interface Last { x: number; y: number; seen: number }

export class TyreTracks {
  /** the cells with wear, by index (y × n + x) */
  readonly cells = new Map<number, Cell>();
  /** the GPU's copy: RGBA a tile (made on the first wear) */
  bytes: Uint8Array | null = null;
  /** the rows changed since the last upload [x0, y0, x1, y1] (inclusive), or null */
  dirty: [number, number, number, number] | null = null;
  /** the box of the cells with wear [x0, y0, x1, y1] (inclusive; grows, shrinks on a fade), or null */
  box: [number, number, number, number] | null = null;
  /** bumped on every change of the bytes */
  version = 0;
  private last = new Map<string, Last>();
  private okCache: Int8Array;
  private frame = 0;
  private fadeAt = -1;
  constructor(readonly n: number, private ok: (x: number, y: number) => boolean) { this.okCache = new Int8Array(n * n); }

  /** whether tile (x, y) takes wear (cached; forgetOk after an edit of the course, the roads or the land) */
  takes(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.n || y >= this.n) return false;
    const i = y * this.n + x, c = this.okCache[i]!;
    if (c) return c > 0;
    const v = this.ok(x, y); this.okCache[i] = v ? 1 : -1; return v;
  }
  /** the course, the roads or the land changed: the tiles are asked again, and wear on a tile that no longer takes it goes */
  forgetOk(ok?: (x: number, y: number) => boolean) {
    if (ok) this.ok = ok;
    this.okCache.fill(0);
    for (const i of [...this.cells.keys()]) { const x = i % this.n, y = (i - x) / this.n; if (!this.takes(x, y)) { this.cells.delete(i); this.encode(i, null); } }
    this.reBox();
  }

  /** a new frame: vehicles not sampled for a while are forgotten (their next sample starts afresh) */
  beginFrame() {
    if (++this.frame % 120 !== 0) return;
    for (const [k, l] of this.last) if (this.frame - l.seen > 120) this.last.delete(k);
  }
  /** vehicle `id` is at (x, y) (tiles): wear along its way since its last sample (every STEP tiles; nothing until it moved STEP) */
  move(id: string, x: number, y: number, kind: WearKind) {
    const l = this.last.get(id);
    if (!l) { this.last.set(id, { x, y, seen: this.frame }); return; }
    l.seen = this.frame;
    const dx = x - l.x, dy = y - l.y, d = Math.hypot(dx, dy);
    if (d < STEP) return;
    if (d > MAX_JUMP) { l.x = x; l.y = y; return; }
    const ux = dx / d, uy = dy / d, k = Math.floor(d / STEP), wt = WEAR[kind] * STEP;
    // the right of the way: (−uy, ux) is a quarter turn clockwise on the screen (tile y runs down-right)
    for (let s = 1; s <= k; s++) this.deposit(l.x + ux * STEP * s - uy * LANE, l.y + uy * STEP * s + ux * LANE, ux, uy, wt);
    l.x += ux * STEP * k; l.y += uy * STEP * k;
  }
  /** wear wt at point (px, py) driven along unit (ux, uy) */
  deposit(px: number, py: number, ux: number, uy: number, wt: number) {
    const cx = Math.floor(px), cy = Math.floor(py);
    if (!this.takes(cx, cy)) return;
    const i = cy * this.n + cx; let c = this.cells.get(i);
    if (!c) { c = { w: 0, vx: 0, vy: 0, o: 0 }; this.cells.set(i, c); this.grow(cx, cy); }
    // across the way: where the point lies from the cell's centre along the way's normal (−uy, ux) (LANE's side), held to OFF_RANGE
    const across = Math.max(-OFF_RANGE, Math.min(OFF_RANGE, (px - cx - 0.5) * -uy + (py - cy - 0.5) * ux));
    const keep = c.w + wt > W_MAX ? (W_MAX - wt) / Math.max(c.w, 1e-9) : 1;
    if (keep < 1) { const f = Math.max(0, keep); c.w *= f; c.vx *= f; c.vy *= f; c.o *= f; }
    c.w += wt; c.vx += ux * wt; c.vy += uy * wt; c.o += across * wt;
    this.encode(i, c);
  }
  /** the game's minute now: the wear fades (every FADE_EVERY game minutes at most) */
  fade(minute: number) {
    if (this.fadeAt < 0 || minute < this.fadeAt) { this.fadeAt = minute; return; }
    const dt = minute - this.fadeAt; if (dt < FADE_EVERY) return;
    this.fadeAt = minute;
    if (!this.cells.size) return;
    const f = Math.exp(-dt / FADE_MIN);
    for (const [i, c] of this.cells) {
      c.w *= f; c.vx *= f; c.vy *= f; c.o *= f;
      if (c.w < W_EPS) { this.cells.delete(i); this.encode(i, null); } else this.encode(i, c);
    }
    this.reBox();
  }
  /** all wear gone (a new game, a load) */
  clear() {
    for (const i of this.cells.keys()) this.encode(i, null);
    this.cells.clear(); this.last.clear(); this.box = null; this.fadeAt = -1;
  }

  /** a cell's four bytes: R, G its way (128 ± 127 × v / w: the direction and how one-way), B where across it the wheels ran (128 ± 127 × o / w /
   *  OFF_RANGE), A its strength (255 × (1 − e^(−w / W_SAT))) */
  static encodeCell(c: Cell, out: Uint8Array, at: number) {
    const w = Math.max(c.w, 1e-9), b = (v: number) => Math.max(1, Math.min(255, Math.round(128 + 127 * Math.max(-1, Math.min(1, v)))));
    out[at] = b(c.vx / w); out[at + 1] = b(c.vy / w); out[at + 2] = b(c.o / w / OFF_RANGE); out[at + 3] = Math.round(255 * (1 - Math.exp(-c.w / W_SAT)));
  }
  private encode(i: number, c: Cell | null) {
    const B = this.bytes ?? (this.bytes = new Uint8Array(this.n * this.n * 4)), at = i * 4;
    if (c) TyreTracks.encodeCell(c, B, at); else { B[at] = 128; B[at + 1] = 128; B[at + 2] = 128; B[at + 3] = 0; }
    const x = i % this.n, y = (i - x) / this.n, d = this.dirty;
    if (!d) this.dirty = [x, y, x, y]; else { if (x < d[0]) d[0] = x; if (y < d[1]) d[1] = y; if (x > d[2]) d[2] = x; if (y > d[3]) d[3] = y; }
    this.version++;
  }
  private grow(x: number, y: number) {
    const b = this.box;
    if (!b) this.box = [x, y, x, y]; else { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; }
  }
  private reBox() {
    this.box = null;
    for (const i of this.cells.keys()) { const x = i % this.n; this.grow(x, (i - x) / this.n); }
  }
  /** the dirty rows to send (and clears them): null when nothing changed */
  takeDirty(): [number, number, number, number] | null { const d = this.dirty; this.dirty = null; return d; }
}

/** GLSL (gl.ts FS_QUAD): tyreTracks(c, p, px): the grass colour c (0..1) at world tile p, px the tiles a screen pixel spans, with the wear texture
 *  uTrackTex (RGBA8, a texel a tile, bilinear) and uTrack (x the strength, 0 off; y the map's size in tiles). The four cells round p each draw
 *  their paired streaks and worn lane across their own way, weighted bilinearly, so the streaks run on smoothly from cell to cell; a streak finer
 *  than a pixel turns into its mean (the zoomed-out look: a soft lane). Lighter where the cell was driven toward the sun's side, darker (a cool
 *  multiply) where away; a cell driven both ways about equally only darkens a little (the grass pressed down) */
export const TRACKS_GLSL = `
const vec2 TRACK_LEAN = vec2(${SUN_TILE_DIR.x.toFixed(5)}, ${SUN_TILE_DIR.y.toFixed(5)});
float trackProfile(float u, float px) {
  float sg = sqrt(${STREAK.toFixed(4)} * ${STREAK.toFixed(4)} + 0.36 * px * px), a = ${STREAK.toFixed(4)} / sg;
  float du = u - ${GAUGE.toFixed(4)}, dv = u + ${GAUGE.toFixed(4)}, lw = ${LANE_W.toFixed(4)};
  return a * (exp(-du * du / (sg * sg)) + exp(-dv * dv / (sg * sg))) + ${LANE_SHARE.toFixed(4)} * exp(-u * u / (lw * lw));
}
vec3 tyreTracks(vec3 c, vec2 p, float px) {
  if (texture(uTrackTex, p / uTrack.y).a < 0.004) return c;
  vec2 q = p - 0.5, b = floor(q), f = q - b;
  float lit = 0.0, pressed = 0.0;
  for (int k = 0; k < 4; k++) {
    vec2 o = vec2(float(k & 1), float(k >> 1));
    ivec2 t = ivec2(b + o);
    vec4 e = texelFetch(uTrackTex, clamp(t, ivec2(0), ivec2(int(uTrack.y) - 1)), 0);
    if (e.a < 0.004) continue;
    vec2 wo = mix(1.0 - f, f, o); float wk = wo.x * wo.y;
    vec2 v = (e.rg * 255.0 - 128.0) / 127.0; float coh = length(v);
    vec2 d = coh > 0.02 ? v / coh : vec2(1.0, 0.0), n = vec2(-d.y, d.x);
    float off = (e.b * 255.0 - 128.0) / 127.0 * ${OFF_RANGE.toFixed(2)};
    float u = dot(p - vec2(t) - 0.5, n) - off;
    float pr = trackProfile(u, px) * e.a * wk;
    float s = clamp(dot(d, TRACK_LEAN) * 2.5, -1.0, 1.0) * min(1.0, coh * 1.25);
    lit += pr * s; pressed += pr * (1.0 - abs(s)) * 0.45;
  }
  float g = uTrack.x * (lit - pressed);
  return g >= 0.0 ? c * (1.0 + g) : c * (1.0 + g * vec3(1.0, 0.95, 0.82));
}`;
