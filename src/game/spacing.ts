// T312: people step round each other. A visual offset layer over every person drawn at the street tier (the townspeople, the crowd, the golfers,
// caddies, crew, you, the range's golfers): the schedules and models keep the truth (saves, replays and the golf never change); each frame the drawn
// point is the true point plus an offset that
//   1. carries over from the last frame (each person found again by his look and nearness: no ids needed), eased back toward none (TAU);
//   2. for a walker heading for a close pass with someone (closest approach under GAP within HORIZON seconds) eases toward a sidestep across his
//      heading: away from the other's side, or to his own right when they meet head on, so two walkers pass on opposite sides;
//   3. is then pushed apart from every neighbour nearer than GAP (a few relaxation passes on a hash grid): a crowd packs without anyone standing
//      inside another. A golfer at address (his swing or putt frames) is pinned: he never moves and the others step round him.
// Only the people on screen are spaced (the engine calls it with the street tier's movers); the rest walk their paths as before.
import type { Drawable } from './sprites';
import { GOLFER_BASE, GOLFER_CLIPS, GOLFER_FRAMES, GOLFER_PEOPLE, SPECTATOR_BASE, SPECTATOR_FRAMES, SPECTATOR_PEOPLE, WALKER_BASE, WALKER_PEOPLE, WALK_DIRS, WALK_FRAMES } from './library';

/** a person's personal radius, tiles (0.4 m; a tile is 2 m) */
export const PERSON_R = 0.2;
/** the gap kept between two people's points (a hair over two radii, so a pass converged by the relaxation measures at least 2r) */
const GAP = 2 * PERSON_R * 1.06;
/** a walker looks this far (tiles) and this long ahead (s) for a close pass */
const LOOK = 1.8, HORIZON = 1.6;
/** the offset eases toward its target (a sidestep, or none) with this time constant, s */
const TAU = 0.3;
/** the most an offset grows, tiles (a person is never drawn further than this from his true point) */
const OMAX = 0.6;
/** a person is found again within this many tiles of his point last frame */
const MATCH = 0.8;
/** relaxation passes a frame */
const ITER = 4;
/** below this speed (tiles/s) a person stands */
const STAND = 0.12;
/** the hash grid's buckets (a power of two) */
const BUCKETS = 4096, MASK = BUCKETS - 1;

const cellOf = (cx: number, cy: number): number => (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) & MASK;

/** growable typed arrays: a new one of at least n (keeps nothing) */
const f64 = (a: Float64Array<ArrayBuffer>, n: number): Float64Array<ArrayBuffer> => a.length >= n ? a : new Float64Array(Math.max(n, a.length * 2, 64));
const i32 = (a: Int32Array<ArrayBuffer>, n: number): Int32Array<ArrayBuffer> => a.length >= n ? a : new Int32Array(Math.max(n, a.length * 2, 64));

/** the solver: add the frame's people (begin, add), solve, then read ox/oy (tiles) by the index add returned */
export class PeopleSpacer {
  n = 0;
  x = new Float64Array(64); y = new Float64Array(64); ox = new Float64Array(64); oy = new Float64Array(64);
  private vx = new Float64Array(64); private vy = new Float64Array(64);
  private look = new Int32Array(64); private layer = new Int32Array(64); private inv = new Float64Array(64);
  // last frame's people
  private pn = 0;
  private px = new Float64Array(64); private py = new Float64Array(64); private pox = new Float64Array(64); private poy = new Float64Array(64);
  private pvx = new Float64Array(64); private pvy = new Float64Array(64); private plook = new Int32Array(64); private player = new Int32Array(64);
  private taken = new Int32Array(64); private stamp = 0;
  // the hash grid (heads by bucket, then the chain)
  private head = new Int32Array(BUCKETS); private next = new Int32Array(64);
  private cells = new Int32Array(9);

  /** starts a frame */
  begin(): void { this.n = 0; }
  /** a person at (x, y) tiles: his look (the same person is found again by it), his layer (people on different decks never meet), pinned (never
   *  moved, the others step round him). Returns his index */
  add(x: number, y: number, look: number, layer: number, pinned: boolean): number {
    const i = this.n++;
    if (i >= this.x.length) {
      const n = i + 1, g = (a: Float64Array<ArrayBuffer>) => { const b = f64(new Float64Array(0), n * 2); b.set(a); return b; }, h = (a: Int32Array<ArrayBuffer>) => { const b = i32(new Int32Array(0), n * 2); b.set(a); return b; };
      this.x = g(this.x); this.y = g(this.y); this.ox = g(this.ox); this.oy = g(this.oy); this.vx = g(this.vx); this.vy = g(this.vy); this.inv = g(this.inv);
      this.look = h(this.look); this.layer = h(this.layer);
    }
    this.x[i] = x; this.y[i] = y; this.look[i] = look; this.layer[i] = layer; this.inv[i] = pinned ? 0 : 1;
    return i;
  }

  /** the people of the arrays a..n-1 into the grid at cell size s (their points plus their offsets with `withOffset`) */
  private grid(s: number, withOffset: boolean, X: Float64Array, Y: Float64Array, n: number): void {
    this.head.fill(-1); this.next = i32(this.next, n);
    for (let i = 0; i < n; i++) {
      const b = cellOf(Math.floor((X[i]! + (withOffset ? this.ox[i]! : 0)) / s), Math.floor((Y[i]! + (withOffset ? this.oy[i]! : 0)) / s));
      this.next[i] = this.head[b]!; this.head[b] = i;
    }
  }
  /** the distinct buckets of the 3x3 cells round (x, y) at cell size s into this.cells; returns their count */
  private around(x: number, y: number, s: number): number {
    const cx = Math.floor(x / s), cy = Math.floor(y / s), C = this.cells;
    let k = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const b = cellOf(cx + dx, cy + dy);
      let seen = false; for (let q = 0; q < k; q++) if (C[q] === b) { seen = true; break; }
      if (!seen) C[k++] = b;
    }
    return k;
  }

  /** works out every person's offset (ox, oy) for a frame dt seconds after the last */
  solve(dt: number): void {
    const n = this.n, X = this.x, Y = this.y, OX = this.ox, OY = this.oy, VX = this.vx, VY = this.vy, inv = this.inv;
    const d = Math.min(Math.max(dt, 0), 0.1), C = this.cells;
    // 1. each person found again (his look, his layer, the nearest within MATCH of where he was heading): his offset carried over and his velocity (smoothed)
    const pn = this.pn;
    // (by where each was heading: two of one look crossing are not swapped)
    if (pn) { for (let j = 0; j < pn; j++) { this.px[j] = this.px[j]! + this.pvx[j]! * d; this.py[j] = this.py[j]! + this.pvy[j]! * d; } this.grid(1, false, this.px, this.py, pn); }
    this.taken = i32(this.taken, pn); const st = ++this.stamp;
    const kv = d > 0 ? 1 - Math.exp(-d / 0.15) : 0;
    for (let i = 0; i < n; i++) {
      let best = -1, bd = MATCH * MATCH;
      if (pn) {
        const k = this.around(X[i]!, Y[i]!, 1);
        for (let c = 0; c < k; c++) for (let j = this.head[C[c]!]!; j >= 0; j = this.next[j]!) {
          if (this.taken[j] === st || this.plook[j] !== this.look[i] || this.player[j] !== this.layer[i]) continue;
          const e = (this.px[j]! - X[i]!) ** 2 + (this.py[j]! - Y[i]!) ** 2;
          if (e < bd) { bd = e; best = j; }
        }
      }
      if (best >= 0) {
        this.taken[best] = st; OX[i] = this.pox[best]!; OY[i] = this.poy[best]!;
        const ivx = d > 0 ? (X[i]! - this.px[best]!) / d + this.pvx[best]! : 0, ivy = d > 0 ? (Y[i]! - this.py[best]!) / d + this.pvy[best]! : 0;
        VX[i] = d > 0 ? this.pvx[best]! + (ivx - this.pvx[best]!) * kv : this.pvx[best]!; VY[i] = d > 0 ? this.pvy[best]! + (ivy - this.pvy[best]!) * kv : this.pvy[best]!;
      } else { OX[i] = 0; OY[i] = 0; VX[i] = 0; VY[i] = 0; }
    }
    // 2. the sidestep: each walker's target offset across his heading for the close passes ahead, the offset eased toward it
    this.grid(LOOK, false, X, Y, n);
    const ke = d > 0 ? 1 - Math.exp(-d / TAU) : 0;
    for (let i = 0; i < n; i++) {
      if (inv[i] === 0) { OX[i] = 0; OY[i] = 0; continue; }
      let tx = 0, ty = 0;
      const vx = VX[i]!, vy = VY[i]!, s = Math.hypot(vx, vy);
      if (s > STAND) {
        const rx = -vy / s, ry = vx / s; // his right (one side, the same for everyone: two walkers meeting head on pass on opposite sides)
        const k = this.around(X[i]!, Y[i]!, LOOK);
        for (let c = 0; c < k; c++) for (let j = this.head[C[c]!]!; j >= 0; j = this.next[j]!) {
          if (j === i || this.layer[j] !== this.layer[i]) continue;
          const dx = X[j]! - X[i]!, dy = Y[j]! - Y[i]!;
          if (dx * dx + dy * dy > LOOK * LOOK) continue;
          const wx = vx - VX[j]!, wy = vy - VY[j]!, w2 = wx * wx + wy * wy;
          if (w2 < 0.01) continue; // walking together
          const t = (dx * wx + dy * wy) / w2;
          if (t <= 0 || t > HORIZON) continue;
          const mx = dx - wx * t, my = dy - wy * t, cl = Math.hypot(mx, my);
          if (cl >= GAP) continue;
          // his share: all of it past someone standing or pinned, half when both walk
          const share = Math.hypot(VX[j]!, VY[j]!) > STAND && inv[j]! > 0 ? 0.5 : 1;
          // away from the side the other passes on, by what the pass lacks of the gap, more as it nears; dead on his line: to his right, but an
          // overtaker (the other ahead, walking his way) to his left, so the one ahead keeping right and he never pick the same side
          const side = mx * rx + my * ry, ahead = dx * vx + dy * vy > 0 && VX[j]! * vx + VY[j]! * vy > 0;
          const dir = side > 0.01 ? -1 : side < -0.01 ? 1 : ahead ? -1 : 1, u = 1 - t / HORIZON, ramp = u * u * (3 - 2 * u);
          const a = (GAP - cl) * share * ramp;
          tx += rx * dir * a; ty += ry * dir * a;
        }
        const L = Math.hypot(tx, ty); if (L > OMAX) { tx *= OMAX / L; ty *= OMAX / L; }
      }
      OX[i] = OX[i]! + (tx - OX[i]!) * ke; OY[i] = OY[i]! + (ty - OY[i]!) * ke;
    }
    // 3. apart: everyone nearer than GAP pushed apart (the pinned not at all), a few passes
    const S = 0.5; // the cell (>= GAP: the 3x3 cells hold every pair within GAP at the grid's making)
    this.grid(S, true, X, Y, n);
    for (let it = 0; it < ITER; it++) {
      for (let i = 0; i < n; i++) {
        const k = this.around(X[i]! + OX[i]!, Y[i]! + OY[i]!, S);
        for (let c = 0; c < k; c++) for (let j = this.head[C[c]!]!; j >= 0; j = this.next[j]!) {
          if (j <= i || this.layer[j] !== this.layer[i]) continue;
          const wi = inv[i]!, wj = inv[j]!; if (wi + wj === 0) continue;
          let dx = X[j]! + OX[j]! - X[i]! - OX[i]!, dy = Y[j]! + OY[j]! - Y[i]! - OY[i]!;
          const e = dx * dx + dy * dy;
          if (e >= GAP * GAP) continue;
          let L = Math.sqrt(e), p: number;
          if (L < 1e-6) { const a = ((i * 0.618 + j * 0.382) % 1) * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); L = 1; p = GAP / (wi + wj); } // (on one point: a fixed way apart)
          else p = (GAP - L) / (wi + wj);
          const ux = dx / L, uy = dy / L;
          OX[i] = OX[i]! - ux * p * wi; OY[i] = OY[i]! - uy * p * wi; OX[j] = OX[j]! + ux * p * wj; OY[j] = OY[j]! + uy * p * wj;
        }
      }
    }
    for (let i = 0; i < n; i++) { const L = Math.hypot(OX[i]!, OY[i]!); if (L > OMAX) { OX[i] = OX[i]! * OMAX / L; OY[i] = OY[i]! * OMAX / L; } }
    // 4. kept for the next frame
    this.px = f64(this.px, n); this.py = f64(this.py, n); this.pox = f64(this.pox, n); this.poy = f64(this.poy, n); this.pvx = f64(this.pvx, n); this.pvy = f64(this.pvy, n);
    this.plook = i32(this.plook, n); this.player = i32(this.player, n);
    this.px.set(X.subarray(0, n)); this.py.set(Y.subarray(0, n)); this.pox.set(OX.subarray(0, n)); this.poy.set(OY.subarray(0, n));
    this.pvx.set(VX.subarray(0, n)); this.pvy.set(VY.subarray(0, n)); this.plook.set(this.look.subarray(0, n)); this.player.set(this.layer.subarray(0, n));
    this.pn = n;
  }
}

const NW = WALK_DIRS.length;
const W_END = WALKER_BASE + WALKER_PEOPLE.length * NW * WALK_FRAMES, S_END = SPECTATOR_BASE + SPECTATOR_PEOPLE.length * NW * SPECTATOR_FRAMES;
const G_END = GOLFER_BASE + GOLFER_PEOPLE.length * NW * GOLFER_FRAMES;
/** a person's look from his drawn item (the townspeople, the spectators, the golfers: his art; the same look is the same person to the solver),
 *  -1 for anything else */
export function personLook(item: number): number {
  if (item >= WALKER_BASE && item < W_END) return Math.floor((item - WALKER_BASE) / (NW * WALK_FRAMES));
  if (item >= SPECTATOR_BASE && item < S_END) return 10000 + Math.floor((item - SPECTATOR_BASE) / (NW * SPECTATOR_FRAMES));
  if (item >= GOLFER_BASE && item < G_END) return 20000 + Math.floor((item - GOLFER_BASE) / (NW * GOLFER_FRAMES));
  return -1;
}
/** a golfer at address (his drive or putt clip's frames): pinned to his ball */
export function personPinned(item: number): boolean {
  if (item < GOLFER_BASE || item >= G_END) return false;
  const f = (item - GOLFER_BASE) % GOLFER_FRAMES, D = GOLFER_CLIPS.golf_drive, P = GOLFER_CLIPS.golf_putt;
  return (f >= D.start && f < D.start + D.n) || (f >= P.start && f < P.start + P.n);
}

/** the frame's people among the movers of `lists` spaced (dt seconds since the last frame): each person's drawn point and footprint moved by his
 *  offset. `refs` is a scratch array (reused) */
export function spacePeople(sp: PeopleSpacer, lists: readonly (readonly Drawable[])[], dt: number, refs: Drawable[]): void {
  sp.begin(); refs.length = 0;
  for (const list of lists) for (const d of list) {
    const look = personLook(d.item); if (look < 0) continue;
    refs.push(d); sp.add(d.x, d.y, look, Math.round((d.lift ?? 0) / 8), personPinned(d.item));
  }
  if (!refs.length) { sp.solve(dt); return; }
  sp.solve(dt);
  for (let k = 0; k < refs.length; k++) {
    const ox = sp.ox[k]!, oy = sp.oy[k]!; if (ox === 0 && oy === 0) continue;
    const d = refs[k]!; d.x += ox; d.y += oy; d.x0 += ox; d.x1 += ox; d.y0 += oy; d.y1 += oy;
  }
}
