// The galleries (LEAD.md M2.2): where the spectators stand once they are through the gates. Each hole's green (beside it, off the line of
// play) and its tee, every grandstand and every tent or kiosk is a spot with a pull (weight) and a room (cap); an admitted party picks a spot
// by weight, fuller spots pulling less, and stands there. Pure TS, no DOM: the engine makes the spots from the course and the placed
// structures, the City (sim worker) picks them.
import { STRUCTURE } from './tents';
import { structureRect, type PlacedEventStructure } from './eventtool';
import { G as GROUND, groundAt, type WalkField } from './walkfield';

export type GalleryKind = 'green' | 'tee' | 'stand' | 'tent';
/** a spot: its point (tiles), kind, pull, room (fans) and hole (0 for a structure); fx, fy: what its fans face (the pin of a green, the tee, a
 *  grandstand's point a tile toward the screen's bottom, a tent's centre); ax, ay: where play aims (the pin for a green or a tee, else fx, fy) */
export interface GallerySpot { x: number; y: number; kind: GalleryKind; weight: number; cap: number; hole: number; fx: number; fy: number; ax: number; ay: number }

/** the pulls and rooms: a green's gallery (the last hole's pulls most), a tee's, a grandstand's (by its seats), a tent's (by its rate) */
export const GALLERY = { green: { weight: 3, cap: 400, off: 7 }, lastGreen: { weight: 5, cap: 800 }, tee: { weight: 1.5, cap: 150, back: 3, off: 4 }, standPerWeight: 80, tentWeight: 1, tentFront: 3 };
const TENT_KINDS = new Set(['food', 'drink', 'snack', 'merch', 'hospitality']);

/** T377 (#1033, the owner: "fix people standing watching next to a tee box. they need to be around it not on it."): the ground the fans of a gallery may stand on: open
 *  ground and paths, never a fairway, the ground in front of a tee in the line of play, a tee box, a green, a bunker or water (golf/walkfield.ts) */
const standable = (g: number): boolean => g === GROUND.open || g === GROUND.path;
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

/** the spots of a course (tees and pins by hole; a hole with no pin has no green spot) and its placed structures. T377: with the course's walk field (`ground`) a
 *  green's and a tee's gallery stands on open ground round it (standingSpot), never on the tee box or the putting surface */
export function gallerySpots(tees: readonly { hole: number; x: number; y: number }[], pins: readonly { hole: number; x: number; y: number }[], structures: readonly PlacedEventStructure[] = [], ground: WalkField | null = null): GallerySpot[] {
  const out: GallerySpot[] = [], last = Math.max(0, ...pins.map(p => p.hole));
  for (const p of [...pins].sort((a, b) => a.hole - b.hole)) {
    const t = tees.find(q => q.hole === p.hole);
    // the line of play from the tee to the pin, and its side (the spectators stand off it, to its left)
    let ux = 0.7071, uy = 0.7071;
    if (t) { const dx = p.x - t.x, dy = p.y - t.y, L = Math.hypot(dx, dy); if (L > 1e-6) { ux = dx / L; uy = dy / L; } }
    const nx = -uy, ny = ux, G = p.hole === last ? { ...GALLERY.green, ...GALLERY.lastGreen } : GALLERY.green;
    const g = standingSpot(ground, p.x + nx * GALLERY.green.off, p.y + ny * GALLERY.green.off, { x: p.x, y: p.y });
    out.push({ x: g.x, y: g.y, kind: 'green', weight: G.weight, cap: G.cap, hole: p.hole, fx: p.x, fy: p.y, ax: p.x, ay: p.y });
    if (t) {
      const s = standingSpot(ground, t.x - ux * GALLERY.tee.back + nx * GALLERY.tee.off, t.y - uy * GALLERY.tee.back + ny * GALLERY.tee.off, { x: t.x, y: t.y }, { tx: t.x, ty: t.y, ux, uy });
      out.push({ x: s.x, y: s.y, kind: 'tee', weight: GALLERY.tee.weight, cap: GALLERY.tee.cap, hole: p.hole, fx: t.x, fy: t.y, ax: p.x, ay: p.y });
    }
  }
  for (const s of structures) {
    const def = STRUCTURE[s.typeId]; if (!def) continue;
    const [x, y, w, h] = structureRect(s);
    // a grandstand's fans look a tile toward the screen's bottom; a tent's look at its centre (its spot is in front)
    const cx = x + w / 2, cy = y + h / 2;
    if (def.kind === 'grandstand') { const fx = cx + 0.7071, fy = cy + 0.7071; out.push({ x: cx, y: cy, kind: 'stand', weight: def.capacity / GALLERY.standPerWeight, cap: def.capacity, hole: 0, fx, fy, ax: fx, ay: fy }); }
    else if (TENT_KINDS.has(def.kind)) out.push({ x: cx, y: y + h + GALLERY.tentFront, kind: 'tent', weight: GALLERY.tentWeight, cap: Math.max(20, Math.round(def.capacity / 2)), hole: 0, fx: cx, fy: cy, ax: cx, ay: cy });
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
