// The galleries (LEAD.md M2.2): where the spectators stand once they are through the gates. Each hole's green (beside it, off the line of
// play) and its tee, every grandstand and every tent or kiosk is a spot with a pull (weight) and a room (cap); an admitted party picks a spot
// by weight, fuller spots pulling less, and stands there. Pure TS, no DOM: the engine makes the spots from the course and the placed
// structures, the City (sim worker) picks them.
import { STRUCTURE } from './tents';
import { structureRect, type PlacedEventStructure } from './eventtool';
import { G as GROUND, groundAt, type WalkField } from './walkfield';
import { facilityArtReadiness, structureSeating } from './facility-art';
import { eventAnchor, seatingProblems, type SeatPoint } from './event-seating';
import { OBJECT_EIGHT_SETS } from '../object-eight-library';
import type { ObjectEightSet } from '../object-eight-types';

export type GalleryKind = 'green' | 'tee' | 'stand' | 'tent';
/** a spot: its point (tiles), kind, pull, room (fans) and hole (0 for a structure); fx, fy: what its fans face (the pin of a green, the tee, a
 *  grandstand's authored front, a tent's centre); ax, ay: where play aims (the pin for a green or a tee, else fx, fy) */
export interface GallerySpot { x: number; y: number; kind: GalleryKind; weight: number; cap: number; hole: number; fx: number; fy: number; ax: number; ay: number;
  /** Structure identity for the renderer's authored seat layout; entry is the real approach/exit point in tiles. */ structureId?: number; entry?: SeatPoint;
  /** T377: where a tee's or a green's fans stand, best first (x, y, x, y ... in tiles): an arc round the back and sides of the tee box, a ring round the green's
   *  open sides (galleryPlaces); absent with no field: the fans stand in a block at x, y as before */
  places?: number[] }

/** the pulls and rooms: a green's gallery (the last hole's pulls most), a tee's, a grandstand's (by its seats), a tent's (by its rate) */
export const GALLERY = { green: { weight: 3, cap: 400, off: 7 }, lastGreen: { weight: 5, cap: 800 }, tee: { weight: 1.5, cap: 150, back: 3, off: 4 }, standPerWeight: 80, tentWeight: 1, tentFront: 3 };
const TENT_KINDS = new Set(['food', 'drink', 'snack', 'merch', 'hospitality']);

/** T377 (#1033, the owner: "fix people standing watching next to a tee box. they need to be around it not on it."): the ground the fans of a gallery may stand on: open
 *  ground and paths, never a fairway, the ground in front of a tee in the line of play, a tee box, a green, a bunker or water (golf/walkfield.ts) */
const standable = (g: number): boolean => g === GROUND.open || g === GROUND.path || g === GROUND.walk;
/** the block of fans a spot draws (crowdview.ts galleryPeople: rows of up to 10, 0.55 apart across the line to the focus, 0.6 apart going back from it, up to 6
 *  rows, jitter 0.12) as sample points: tiles across the line, and tiles back from the spot along it (a little in front too), with a margin */
const BLOCK_ACROSS = [-3.2, -1.6, 0, 1.6, 3.2], BLOCK_BACK = [-0.8, 0, 1.2, 2.4, 3.6, 4.4];
/** whether the whole block of fans at (x, y), facing the unit vector (ux, uy), stands on ground they may */
function blockClear(f: WalkField, x: number, y: number, ux: number, uy: number): boolean {
  const vx = -uy, vy = ux;
  for (const a of BLOCK_ACROSS) for (const b of BLOCK_BACK) if (!standable(groundAt(f, x + vx * a - ux * b, y + vy * a - uy * b))) return false;
  return true;
}
/** where a gallery stands: the place wanted (x, y) when the whole block of its fans is on ground they may stand on, else the nearest place that is (rings round
 *  it a tile apart out to 16 tiles, starting on the side away from the focus: round the tee, round the green), and for a tee not in front of it (`front`: the
 *  tee and the line of play: never ahead of it, dot(place - tee, aim) at most half a tile); the place wanted when there is none, and with no field */
export function standingSpot(f: WalkField | null | undefined, x: number, y: number, focus: { x: number; y: number }, front?: { tx: number; ty: number; ux: number; uy: number }): { x: number; y: number } {
  if (!f) return { x, y };
  const ok = (px: number, py: number): boolean => {
    if (front && (px - front.tx) * front.ux + (py - front.ty) * front.uy > 0.5) return false;
    const L = Math.hypot(focus.x - px, focus.y - py) || 1; return blockClear(f, px, py, (focus.x - px) / L, (focus.y - py) / L);
  };
  if (ok(x, y)) return { x, y };
  const a0 = Math.atan2(y - focus.y, x - focus.x);
  for (let r = 1; r <= 16; r++) {
    const n = Math.max(8, Math.round(r * 2 * Math.PI / 1.5));
    for (let j = 0; j < n; j++) {
      const a = a0 + (j % 2 ? 1 : -1) * Math.ceil(j / 2) * 2 * Math.PI / n, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (ok(px, py)) return { x: px, y: py };
    }
  }
  return { x, y };
}

/** T377 (#1033, the owner: "they need to be around it not on it"; the lead's review: a gallery is an arc round a tee, a ring round a green, not one clump): the places a tee's
 *  or a green's fans stand at, best first. They are the points of a lattice (a metre or so) on open ground that the walk field (the spectators', grown clear of the tee box,
 *  the green, the bunkers and the water) lets people stand on, in the first three rows from the box or the green (four where the ground is narrow; a row a lattice step further out, which a chamfer
 *  distance to the box or the green measures), so a gallery is a few deep along its outline. A tee's are behind it and to its sides, never ahead of the tee (dot with
 *  the line of play at most half a tile) and so outside the line of play and its forward cone; a green's are all round it but the cone of 35 degrees on each side of its
 *  approach. They are ordered from straight behind (the tee's back, the green's back) outward round both sides, a bin of 0.06 rad at a time, a bin's rows together:
 *  the first n places are the n fans of a crowd of n, so it grows outward along the arc and the ring and is a few rows deep all the way. [] where there are fewer than
 *  a handful. c: the tee marker or the pin; u: the unit line of play, tee to pin */
export function galleryPlaces(f: WalkField, kind: 'tee' | 'green', c: { x: number; y: number }, u: { x: number; y: number }): number[] {
  const LAT = kind === 'tee' ? PLACE_LAT : PLACE_LAT_GREEN, R = kind === 'tee' ? 18 : 22, n = Math.floor(2 * R / LAT) + 1, src = kind === 'tee' ? GROUND.tee : GROUND.green, X = (i: number) => c.x - R + i * LAT, Y = (j: number) => c.y - R + j * LAT;
  const d = new Float32Array(n * n), ok = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const g = groundAt(f, X(i), Y(j)); d[j * n + i] = g === src ? 0 : 1e9; ok[j * n + i] = standable(g) ? 1 : 0; }
  // the distance to the box or the green: a chamfer over the lattice (the first pass down and right, the second up and left)
  const D1 = LAT, D2 = LAT * Math.SQRT2;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i; let v = d[k]!;
    if (i > 0) v = Math.min(v, d[k - 1]! + D1);
    if (j > 0) { v = Math.min(v, d[k - n]! + D1); if (i > 0) v = Math.min(v, d[k - n - 1]! + D2); if (i < n - 1) v = Math.min(v, d[k - n + 1]! + D2); }
    d[k] = v;
  }
  for (let j = n - 1; j >= 0; j--) for (let i = n - 1; i >= 0; i--) {
    const k = j * n + i; let v = d[k]!;
    if (i < n - 1) v = Math.min(v, d[k + 1]! + D1);
    if (j < n - 1) { v = Math.min(v, d[k + n]! + D1); if (i < n - 1) v = Math.min(v, d[k + n + 1]! + D2); if (i > 0) v = Math.min(v, d[k + n - 1]! + D2); }
    d[k] = v;
  }
  // the back of a tee is away from the line of play; the back of a green is away from its approach (the way the line of play comes)
  const bx = kind === 'tee' ? -u.x : u.x, by = kind === 'tee' ? -u.y : u.y;
  const cand: { x: number; y: number; dist: number; bin: number; band: number }[] = []; let dmin = Infinity;
  for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
    const k = j * n + i; if (!ok[k] || !ok[k - 1] || !ok[k + 1] || !ok[k - n] || !ok[k + n] || d[k]! > PLACE_REACH) continue;
    const dx = X(i) - c.x, dy = Y(j) - c.y, r = Math.hypot(dx, dy) || 1e-9;
    if (kind === 'tee' ? dx * u.x + dy * u.y > 0.5 : (-dx * u.x - dy * u.y) / r > APPROACH_COS) continue;
    dmin = Math.min(dmin, d[k]!);
    cand.push({ x: X(i), y: Y(j), dist: d[k]!, bin: Math.floor(Math.abs(Math.atan2(bx * dy - by * dx, bx * dx + by * dy)) / PLACE_BIN), band: 0 });
  }
  for (const q of cand) q.band = Math.floor((q.dist - dmin + 0.01) / LAT);
  // three rows deep, and a row more (to four) where the open ground is so narrow that three rows would not hold the 90 fans a gallery draws
  let rows = cand.filter(q => q.band < PLACE_ROWS);
  for (let r = PLACE_ROWS + 1; r <= PLACE_ROWS_MAX && rows.length < PLACES_MIN; r++) rows = cand.filter(q => q.band < r);
  if (rows.length < 12) return [];
  rows.sort((p, q) => p.bin - q.bin || p.band - q.band || p.x - q.x || p.y - q.y);
  const out: number[] = []; for (const q of rows.slice(0, PLACES_MAX)) out.push(q.x, q.y);
  return out;
}
/** the lattice of the places (tiles: a tee's 1.1 m, a green's 1.2 m), the rows a gallery is deep (3, to 4 where it must be to hold the 90 fans a gallery draws: a lattice step apart), the angle a bin is, how far from the box or green a
 *  place may be (tiles), the most places a spot has, and the cone round a green's approach that no one stands in */
const PLACE_LAT = 0.55, PLACE_LAT_GREEN = 0.6, PLACE_ROWS = 3, PLACE_ROWS_MAX = 4, PLACES_MIN = 90, PLACE_BIN = 0.06, PLACE_REACH = 9, PLACES_MAX = 90, APPROACH_COS = Math.cos(35 * Math.PI / 180);

/** the spots of a course (tees and pins by hole; a hole with no pin has no green spot) and its placed structures. T377: with the course's walk field (`ground`) a
 *  green's and a tee's gallery stands on open ground round it (standingSpot), never on the tee box or the putting surface */
export function gallerySpots(tees: readonly { hole: number; x: number; y: number }[], pins: readonly { hole: number; x: number; y: number }[], structures: readonly PlacedEventStructure[] = [], sets: readonly ObjectEightSet[] = OBJECT_EIGHT_SETS, ground: WalkField | null = null): GallerySpot[] {
  const out: GallerySpot[] = [], last = Math.max(0, ...pins.map(p => p.hole));
  for (const p of [...pins].sort((a, b) => a.hole - b.hole)) {
    const t = tees.find(q => q.hole === p.hole);
    // the line of play from the tee to the pin, and its side (the spectators stand off it, to its left)
    let ux = 0.7071, uy = 0.7071;
    if (t) { const dx = p.x - t.x, dy = p.y - t.y, L = Math.hypot(dx, dy); if (L > 1e-6) { ux = dx / L; uy = dy / L; } }
    const nx = -uy, ny = ux, G = p.hole === last ? { ...GALLERY.green, ...GALLERY.lastGreen } : GALLERY.green;
    // (T377: a green's gallery is a ring round its open sides, its point the best place, the ring's back; with too little open ground round it, or no field, the block)
    const gp = ground ? galleryPlaces(ground, 'green', p, { x: ux, y: uy }) : [], g = gp.length ? { x: gp[0]!, y: gp[1]! } : standingSpot(ground, p.x + nx * GALLERY.green.off, p.y + ny * GALLERY.green.off, { x: p.x, y: p.y });
    out.push({ x: g.x, y: g.y, kind: 'green', weight: G.weight, cap: G.cap, hole: p.hole, fx: p.x, fy: p.y, ax: p.x, ay: p.y, ...(gp.length ? { places: gp } : {}) });
    if (t) {
      // (and a tee's an arc behind and to the sides of the tee box)
      const tp = ground ? galleryPlaces(ground, 'tee', t, { x: ux, y: uy }) : [], s = tp.length ? { x: tp[0]!, y: tp[1]! } : standingSpot(ground, t.x - ux * GALLERY.tee.back + nx * GALLERY.tee.off, t.y - uy * GALLERY.tee.back + ny * GALLERY.tee.off, { x: t.x, y: t.y }, { tx: t.x, ty: t.y, ux, uy });
      out.push({ x: s.x, y: s.y, kind: 'tee', weight: GALLERY.tee.weight, cap: GALLERY.tee.cap, hole: p.hole, fx: t.x, fy: t.y, ax: p.x, ay: p.y, ...(tp.length ? { places: tp } : {}) });
    }
  }
  for (const s of structures) {
    const def = STRUCTURE[s.typeId]; if (!def) continue;
    if (def.requiresEightArt && !facilityArtReadiness(s, sets).ready) continue;
    const [x, y, w, h] = structureRect(s, sets), centre = { x: x + w / 2, y: y + h / 2 }, authored = structureSeating(s, sets);
    if (def.kind === 'grandstand') {
      const layout = authored.layout && !seatingProblems(authored.layout, def.capacity, authored.footprint).length ? authored.layout : undefined;
      const front = layout?.front ?? { x: 0, y: 1 }, length = Math.hypot(front.x, front.y);
      const focus = eventAnchor({ x: front.x * 2 / length, y: front.y * 2 / length }, authored.headingDegrees, centre);
      const entry = eventAnchor(layout?.entries[0] ?? { x: -def.footprint.w, y: def.footprint.h }, authored.headingDegrees, centre);
      out.push({ ...centre, kind: 'stand', weight: def.capacity / GALLERY.standPerWeight, cap: def.capacity, hole: 0, fx: focus.x, fy: focus.y, ax: focus.x, ay: focus.y, structureId: s.id, entry });
    } else if (TENT_KINDS.has(def.kind)) {
      const entry = eventAnchor({ x: 0, y: def.footprint.h + GALLERY.tentFront * 2 }, authored.headingDegrees, centre);
      out.push({ ...entry, kind: 'tent', weight: GALLERY.tentWeight, cap: Math.max(20, Math.round(def.capacity / 2)), hole: 0, fx: centre.x, fy: centre.y, ax: centre.x, ay: centre.y, structureId: s.id, entry });
    }
  }
  return out;
}

/** the spot an arriving party takes: by weight times the room left (a full spot pulls nothing); with every spot full, the least full one;
 *  -1 with no spots. r: a uniform draw in [0, 1). weights: each spot's pull at this minute (the City's draws, see gallerydraw.ts spotDraw), in place
 *  of its weight */
export function pickSpot(spots: readonly GallerySpot[], fill: readonly number[], r: number, weights?: readonly number[]): number {
  if (!spots.length) return -1;
  let sum = 0; const w = spots.map((s, i) => { const v = (weights ? weights[i] ?? 0 : s.weight) * Math.max(0, 1 - (fill[i] ?? 0) / s.cap); sum += v; return v; });
  if (sum <= 0) { let best = 0; spots.forEach((s, i) => { if ((fill[i] ?? 0) / s.cap < (fill[best] ?? 0) / spots[best]!.cap) best = i; }); return best; }
  let x = r * sum;
  for (let i = 0; i < w.length; i++) { x -= w[i]!; if (x < 0) return i; }
  return w.length - 1;
}
