// T326 (#926): your golf cart, easy to find and to call (the owner, 2026-11-04: "why dont i have a golf cart?": it was parked by the car park, ~120 m
// off, small and unmarked). Pure TS, no DOM, no engine: the engine hands it what it needs (where the cart may stand, the course's surface) and draws
// what it says.
// - Call it (the Cart button, key C): near you it waits ("here"); within CALL_DRIVE tiles it drives itself to you along a route ("drive"); farther it
//   appears APPEAR_TILES short of you, on the way it would come, and drives the last of it ("appear"): seen to arrive, never a long wait.
// - Find it: off screen an edge marker points to it (edgeMarker); at street zoom a "Your cart" label (the engine's caddie labels).
// - It waits sensibly: when you get out at a tee or by a green it moves off them to the nearest rough or path beside (parkSpot); at the start of your
//   round it is brought to the first tee when it is not already near (BRING_TILES).
import type { Pt } from './types';

/** a call within this many tiles (80 m) has the cart drive itself all the way to you; farther it appears nearer first */
export const CALL_DRIVE = 40;
/** a far call: the cart appears this many tiles (16 m) from you, on its way, and drives the rest */
export const APPEAR_TILES = 8;
/** the cart comes to this far from you (tiles): beside you, inside CART_REACH (play/yours.ts) so E gets you in */
export const CALL_GAP = 1.6;
/** at the start of a round the cart is brought to the first tee when it is farther than this (tiles, 30 m) */
export const BRING_TILES = 15;
/** a parked cart is moved off a tee, or out of this many tiles (6 m) of a green's edge */
export const GREEN_CLEAR = 3;
/** how far round a spot the parking looks (tiles) */
export const PARK_SEARCH = 10;
/** the edge marker sits this far (CSS px) inside the screen's edge */
export const EDGE_MARGIN = 28;

/** what a call does: the cart is already within reach, drives to you, or appears nearer first */
export type CallMode = 'here' | 'drive' | 'appear';
/** the call's mode for a cart d tiles from you (straight line) */
export function callMode(d: number, reach: number): CallMode {
  return d <= reach ? 'here' : d <= CALL_DRIVE ? 'drive' : 'appear';
}

/** the spot the cart comes to beside you: CALL_GAP off you toward where it comes from, else round you (eight ways), else farther (2x, 3x); null: none
 *  (ok: where the cart may stand) */
export function callSpot(you: Pt, from: Pt, ok: (x: number, y: number) => boolean): Pt | null {
  const L = Math.hypot(from.x - you.x, from.y - you.y), a0 = L > 1e-6 ? Math.atan2(from.y - you.y, from.x - you.x) : 0;
  for (const k of [1, 1.5, 2, 3]) {
    const r = CALL_GAP * k;
    for (let j = 0; j < 8; j++) {
      // (toward the cart first, then alternating either side of it)
      const a = a0 + (j % 2 ? 1 : -1) * Math.ceil(j / 2) * Math.PI / 4, x = you.x + Math.cos(a) * r, y = you.y + Math.sin(a) * r;
      if (ok(x, y)) return { x, y };
    }
  }
  return null;
}

/** where a far-called cart appears: APPEAR_TILES from you toward where it was, the first spot it may stand walking out from there (half-tile steps,
 *  up to twice as far), else round you; null: none */
export function appearSpot(you: Pt, from: Pt, ok: (x: number, y: number) => boolean): Pt | null {
  const L = Math.hypot(from.x - you.x, from.y - you.y), ux = L > 1e-6 ? (from.x - you.x) / L : 1, uy = L > 1e-6 ? (from.y - you.y) / L : 0;
  for (let d = APPEAR_TILES; d <= APPEAR_TILES * 2; d += 0.5) { const x = you.x + ux * d, y = you.y + uy * d; if (ok(x, y)) return { x, y }; }
  for (let d = APPEAR_TILES - 0.5; d >= CALL_GAP * 2; d -= 0.5) { const x = you.x + ux * d, y = you.y + uy * d; if (ok(x, y)) return { x, y }; }
  return callSpot(you, from, ok);
}

/** the surface kinds the parking cares about: a tee, a green, somewhere a cart waits well (rough, a path, off the course), or other (the fairway,
 *  deep grass) */
export type ParkSurf = 'tee' | 'green' | 'good' | 'other';
/** whether a cart parked at `at` should move: on a tee, or within GREEN_CLEAR of a green (greenNear says the distance to the nearest green's edge in
 *  tiles, Infinity: none near) */
export function shouldPark(at: Pt, surf: (x: number, y: number) => ParkSurf, greenNear: (x: number, y: number) => number): boolean {
  return surf(at.x, at.y) === 'tee' || greenNear(at.x, at.y) <= GREEN_CLEAR;
}
/** where a cart waits beside a tee or a green: the nearest spot (rings of half a tile, out to PARK_SEARCH) it may stand on rough or a path ('good'),
 *  off the tee and GREEN_CLEAR clear of a green; null: none (it stays) */
export function parkSpot(at: Pt, ok: (x: number, y: number) => boolean, surf: (x: number, y: number) => ParkSurf, greenNear: (x: number, y: number) => number): Pt | null {
  for (let r = 0.5; r <= PARK_SEARCH; r += 0.5) {
    const n = Math.max(8, Math.round(r * 2 * Math.PI / 0.75));
    for (let j = 0; j < n; j++) {
      const a = j / n * Math.PI * 2, x = at.x + Math.cos(a) * r, y = at.y + Math.sin(a) * r;
      if (surf(x, y) === 'good' && greenNear(x, y) > GREEN_CLEAR && ok(x, y)) return { x, y };
    }
  }
  return null;
}

/** the edge marker for a point at screen (sx, sy) (CSS px) on a w x h screen: null when it is on screen (inside the margin), else the marker's spot
 *  on the edge (EDGE_MARGIN inside it, on the line from the screen's centre to the point) and the angle (radians) it points */
export function edgeMarker(sx: number, sy: number, w: number, h: number, margin = EDGE_MARGIN): { x: number; y: number; a: number } | null {
  if (sx >= 0 && sy >= 0 && sx <= w && sy <= h) return null;
  const cx = w / 2, cy = h / 2, dx = sx - cx, dy = sy - cy, hx = Math.max(1, cx - margin), hy = Math.max(1, cy - margin);
  const k = Math.min(dx ? hx / Math.abs(dx) : Infinity, dy ? hy / Math.abs(dy) : Infinity);
  return { x: cx + dx * k, y: cy + dy * k, a: Math.atan2(dy, dx) };
}

/** a distance in metres as the marker says it: "80 m", "1.2 km" */
export function distText(m: number): string { return m < 1000 ? `${Math.round(m / 5) * 5} m` : `${(m / 1000).toFixed(1)} km`; }
