// Construction dust (the owner, 2026-11-15: "we need to add the dust that happens when you draw a road on EVERYTHING you build"). The road builder's
// dust (engine.ts puff() and the build front) and the dust of everything else new on the map share one fixed pool here:
// - **The pool** (DustPool): DUST_CAP particles made once; a spawn past the cap is dropped, a dead particle is swapped out (no allocation per frame).
// - **The look** (drawDust): the road dust's sand puffs, each with a lit side toward the sun at the upper right (screen up and right).
// - **Where** (footSpots, edgeSpots, gridSpots): spots scaled to the footprint: one for a bench, a ring round a clubhouse, along the edges of a hole or a
//   painted area (the boundary cells of what a grid step laid).
// - **How much** (Bucket, takeTokens): a token bucket per kind, so a big brush stroke or a long paint stroke gives a light trail, not a flood.
// - **When** (DustArm, armTick, dustAllowed): never while a save loads and the ground first bakes (armed only QUIET_MS after the load once the town's lots
//   are composed), never on an undo or redo, never in the scene behind the jam's title card (engine.ts show).

/** the most dust particles alive at once (the road's and the buildings' together) */
export const DUST_CAP = 600;
/** after a load (or a new game) no new dust for this long, and not until the town's lots are composed (ms) */
export const QUIET_MS = 2000;
/** the most spots one footprint or grid step puffs at */
export const MAX_SPOTS = 64;

export interface Dust { x: number; y: number; vx: number; vy: number; vz: number; z: number; life: number; age: number; r: number }

/** a fixed pool of dust particles: items[0..n) are alive */
export class DustPool {
  readonly items: Dust[];
  n = 0;
  constructor(readonly cap = DUST_CAP) {
    this.items = [];
    for (let i = 0; i < cap; i++) this.items.push({ x: 0, y: 0, vx: 0, vy: 0, vz: 0, z: 0, life: 1, age: 0, r: 0 });
  }
  /** a new particle (false when the pool is full: it is dropped) */
  spawn(x: number, y: number, vx: number, vy: number, vz: number, life: number, r: number): boolean {
    if (this.n >= this.cap) return false;
    const p = this.items[this.n++]!;
    p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.vz = vz; p.z = 0; p.life = life; p.age = 0; p.r = r;
    return true;
  }
  /** the road builder's puff (engine.ts puff): n particles round (x, y) tiles */
  puff(x: number, y: number, n: number, rnd: () => number = Math.random) {
    for (let i = 0; i < n; i++) {
      if (!this.spawn(x + (rnd() - 0.5) * 1.5, y + (rnd() - 0.5) * 1.5, (rnd() - 0.5) * 1.2, (rnd() - 0.5) * 1.2, 0.6 + rnd() * 1.2, 0.6 + rnd() * 0.6, 0.25 + rnd() * 0.3)) return;
    }
  }
  /** ages and moves the live particles (as the road dust always moved); the dead ones are swapped to the end */
  step(dt: number) {
    const it = this.items;
    let i = 0;
    while (i < this.n) {
      const p = it[i]!;
      p.age += dt;
      if (p.age >= p.life) { const j = --this.n; it[i] = it[j]!; it[j] = p; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= 0.8 * dt; p.r += 0.6 * dt;
      i++;
    }
  }
  clear() { this.n = 0; }
}

// ---------- where

/** spots every `gap` tiles along a closed polygon (flat x, y pairs in tiles), at most `max`, written as x, y pairs into out; returns the count */
export function edgeSpots(poly: ArrayLike<number>, gap: number, max: number, out: Float32Array | number[]): number {
  const m = poly.length >> 1; if (!m || max <= 0) return 0;
  let per = 0;
  for (let i = 0; i < m; i++) { const j = (i + 1) % m; per += Math.hypot(poly[2 * j]! - poly[2 * i]!, poly[2 * j + 1]! - poly[2 * i + 1]!); }
  if (per < 1e-6) { out[0] = poly[0]!; out[1] = poly[1]!; return 1; }
  const k = Math.max(1, Math.min(max, Math.round(per / gap))), step = per / k;
  let seg = 0, at = 0, segLen = Math.hypot(poly[2]! - poly[0]!, poly[3]! - poly[1]!) || 0;
  let base = 0; // the walked length at the start of segment seg
  for (let s = 0; s < k; s++) {
    at = s * step;
    while (at > base + segLen && seg < m - 1) { base += segLen; seg++; const j = (seg + 1) % m; segLen = Math.hypot(poly[2 * j]! - poly[2 * seg]!, poly[2 * j + 1]! - poly[2 * seg + 1]!); }
    const j = (seg + 1) % m, t = segLen > 1e-9 ? (at - base) / segLen : 0;
    out[2 * s] = poly[2 * seg]! + (poly[2 * j]! - poly[2 * seg]!) * t;
    out[2 * s + 1] = poly[2 * seg + 1]! + (poly[2 * j + 1]! - poly[2 * seg + 1]!) * t;
  }
  return k;
}

/** spots for a footprint [x0, y0]..[x1, y1] (tiles), scaled to its size: one in the middle of a small thing (a bench, a sign), a ring round a big one
 *  (a spot every DUST_GAP tiles of its edge, at most max) */
export const DUST_GAP = 1.8;
const ring = new Float32Array(8);
export function footSpots(x0: number, y0: number, x1: number, y1: number, max: number, out: Float32Array | number[]): number {
  if (max <= 0) return 0;
  if (Math.max(x1 - x0, y1 - y0) <= 1.5) { out[0] = (x0 + x1) / 2; out[1] = (y0 + y1) / 2; return 1; }
  ring[0] = x0; ring[1] = y0; ring[2] = x1; ring[3] = y0; ring[4] = x1; ring[5] = y1; ring[6] = x0; ring[7] = y1;
  return edgeSpots(ring, DUST_GAP, max, out);
}

/** the minimum of what gridSpots reads from a course grid diff (ext/course-grid GridDiff) */
export interface GridDiffLike { x0: number; y0: number; w: number; n: number; idx: ArrayLike<number>; s0: ArrayLike<number>; s1: ArrayLike<number>; k0?: ArrayLike<number>; k1?: ArrayLike<number> }

/** spots on the edges of what a course grid step laid: the changed cells that took a surface (not none) and border a cell of another surface, evenly
 *  thinned to at most max; `surf` is the grid's surface layer after the step, `cell` its cell size in tiles. Returns the count */
export function gridSpots(d: GridDiffLike, surf: ArrayLike<number>, cell: number, max: number, out: Float32Array | number[]): number {
  if (!d.n || max <= 0) return 0;
  const w = d.w, L = surf.length;
  const edge = (k: number): boolean => {
    const s = d.s1[k]!; if (!s) return false;
    if (s === d.s0[k] && (!d.k0 || !d.k1 || d.k0[k] === d.k1[k])) return false; // (only its hole or month changed: nothing new to see)
    const i = d.idx[k]!, c = i % w;
    return (c > 0 && surf[i - 1] !== s) || (c < w - 1 && surf[i + 1] !== s) || (i >= w && surf[i - w] !== s) || (i + w < L && surf[i + w] !== s);
  };
  let count = 0;
  for (let k = 0; k < d.n; k++) if (edge(k)) count++;
  if (!count) return 0;
  const want = Math.min(max, Math.max(1, Math.round(Math.sqrt(count) * 1.2))), every = count / want;
  let seen = 0, n = 0, next = 0;
  for (let k = 0; k < d.n && n < want; k++) {
    if (!edge(k)) continue;
    if (seen >= next) {
      const i = d.idx[k]!, c = i % w, r = (i - c) / w;
      out[2 * n] = d.x0 + (c + 0.5) * cell; out[2 * n + 1] = d.y0 + (r + 0.5) * cell; n++; next += every;
    }
    seen++;
  }
  return n;
}

// ---------- how much

/** a token bucket: `burst` tokens at most, refilled at `rate` a second */
export interface Bucket { tokens: number; at: number; rate: number; burst: number }
export function bucket(burst: number, rate: number): Bucket { return { tokens: burst, at: -Infinity, rate, burst }; }
/** takes up to `want` tokens at `now` (ms); returns how many it got */
export function takeTokens(b: Bucket, now: number, want: number): number {
  b.tokens = b.at === -Infinity ? b.burst : Math.min(b.burst, b.tokens + Math.max(0, now - b.at) / 1000 * b.rate);
  b.at = now;
  const got = Math.max(0, Math.min(want, Math.floor(b.tokens)));
  b.tokens -= got; return got;
}

// ---------- when

export interface DustArm { quietUntil: number; armed: boolean }
/** a load, a new game or the bench: no dust until QUIET_MS have passed and the lots are composed */
export function disarm(a: DustArm, now: number) { a.armed = false; a.quietUntil = now + QUIET_MS; }
/** each frame: arms once the quiet time is over and the world has settled (the town's lot queue empty) */
export function armTick(a: DustArm, now: number, settled: boolean) { if (!a.armed && settled && now >= a.quietUntil) a.armed = true; }
/** whether new construction may puff: armed, not the title card's scene, not an undo or redo putting things back */
export function dustAllowed(a: DustArm, show: boolean, restoring: boolean): boolean { return a.armed && !show && !restoring; }
/** a lot (or an estate plot) grew: seen before at a lower stage and now at `min` or higher (a lot seen for the first time, as on a load, never puffs) */
export function grewTo(prev: number | undefined, next: number, min: number): boolean { return prev !== undefined && next > prev && next >= min; }

// ---------- the builder's dust

export type DustKind = 'foot' | 'prop' | 'ground';
/** particles per spot by kind: a building's ring, a prop's puff, a painted edge's light trail */
const PER_SPOT: Record<DustKind, number> = { foot: 3, prop: 3, ground: 2 };

/** the dust of new construction: the pool (shared with the road builder's puffs), the gate and the throttles */
export class BuildDust {
  readonly pool = new DustPool();
  readonly arm: DustArm = { quietUntil: Infinity, armed: false };
  readonly buckets: Record<DustKind, Bucket> = { foot: bucket(96, 64), prop: bucket(10, 14), ground: bucket(64, 14) };
  private spots = new Float32Array(MAX_SPOTS * 2);

  /** a new thing's footprint (tiles) */
  rect(now: number, x0: number, y0: number, x1: number, y1: number, kind: DustKind) {
    this.emit(now, footSpots(x0, y0, x1, y1, MAX_SPOTS, this.spots), kind, Math.max(x1 - x0, y1 - y0) <= 1.5 ? 1 : 0);
  }
  /** a new thing's outline (flat x, y pairs, tiles) */
  poly(now: number, pts: ArrayLike<number>, kind: DustKind) { this.emit(now, edgeSpots(pts, DUST_GAP, MAX_SPOTS, this.spots), kind, 0); }
  /** the edges of what a course grid step laid */
  grid(now: number, d: GridDiffLike, surf: ArrayLike<number>, cell: number) { const k = gridSpots(d, surf, cell, MAX_SPOTS, this.spots); this.emit(now, k, 'ground', k >= 24 ? 1 : 0); } // (a big step, a hole: a thicker line)

  /** puffs at the first k spots, as many as the kind's bucket allows (thinned evenly over the spots) */
  private emit(now: number, k: number, kind: DustKind, extra: number) {
    if (!k) return;
    const got = takeTokens(this.buckets[kind], now, k); if (!got) return;
    const S = this.spots, per = PER_SPOT[kind] + extra, every = k / got;
    for (let s = 0; s < got; s++) {
      const j = Math.min(k - 1, Math.floor(s * every));
      this.pool.puff(S[2 * j]!, S[2 * j + 1]!, per);
    }
  }
}

// ---------- the look

/** the road dust's colour, and its lit side's (the sun at the upper right) */
const DUST_FILL = 'rgb(214,190,150)', DUST_LIT = 'rgb(240,226,198)';
/** draws the live dust on the 2D overlay: (x, y) tiles to screen by `proj` (into its out), ze the zoom times the pixel ratio, hw and hh the tile's half
 *  sizes. Each puff is the road dust's sand ellipse with a smaller lit one toward the upper right */
export function drawDust(ctx: CanvasRenderingContext2D, pool: DustPool, proj: (x: number, y: number, out: { x: number; y: number }) => void, ze: number, hw: number, hh: number, minR = 0) {
  const n = pool.n; if (!n) return;
  const it = pool.items, o = scr, a0 = ctx.globalAlpha;
  for (let i = 0; i < n; i++) {
    const p = it[i]!; proj(p.x, p.y, o);
    // (the owner, 2026-11-16: "I did not see the construction dust": at the zooms people play at a puff was 1-4 px; minR (device px) keeps it a
    //  visible cloud zoomed out, its rise scaled with it, and a little denser once enlarged)
    const r0 = p.r * hw * ze, k = minR > 0 ? Math.max(1, (minR * (0.6 + p.r)) / Math.max(r0, 1e-6)) : 1, r = r0 * k;
    const a = (1 - p.age / p.life) * (k > 1 ? 0.62 : 0.5), y = o.y - p.z * hh * ze * 1.5 * k;
    ctx.globalAlpha = a; ctx.fillStyle = DUST_FILL; ctx.beginPath(); ctx.ellipse(o.x, y, r, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = a * 0.7; ctx.fillStyle = DUST_LIT; ctx.beginPath(); ctx.ellipse(o.x + r * 0.22, y - r * 0.18, r * 0.55, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = a0;
}
const scr = { x: 0, y: 0 };
