// The galleries (LEAD.md M2.2): where the spectators stand once they are through the gates. Each hole's green (beside it, off the line of
// play) and its tee, every grandstand and every tent or kiosk is a spot with a pull (weight) and a room (cap); an admitted party picks a spot
// by weight, fuller spots pulling less, and stands there. Pure TS, no DOM: the engine makes the spots from the course and the placed
// structures, the City (sim worker) picks them.
import { STRUCTURE } from './tents';
import { structureRect, type PlacedEventStructure } from './eventtool';
import { facilityArtReadiness, structureSeating } from './facility-art';
import { eventAnchor, seatingProblems, type SeatPoint } from './event-seating';
import { OBJECT_EIGHT_SETS } from '../object-eight-library';
import type { ObjectEightSet } from '../object-eight-types';

export type GalleryKind = 'green' | 'tee' | 'stand' | 'tent';
/** a spot: its point (tiles), kind, pull, room (fans) and hole (0 for a structure); fx, fy: what its fans face (the pin of a green, the tee, a
 *  grandstand's authored front, a tent's centre); ax, ay: where play aims (the pin for a green or a tee, else fx, fy) */
export interface GallerySpot { x: number; y: number; kind: GalleryKind; weight: number; cap: number; hole: number; fx: number; fy: number; ax: number; ay: number;
  /** Structure identity for the renderer's authored seat layout; entry is the real approach/exit point in tiles. */ structureId?: number; entry?: SeatPoint }

/** the pulls and rooms: a green's gallery (the last hole's pulls most), a tee's, a grandstand's (by its seats), a tent's (by its rate) */
export const GALLERY = { green: { weight: 3, cap: 400, off: 7 }, lastGreen: { weight: 5, cap: 800 }, tee: { weight: 1.5, cap: 150, back: 3, off: 4 }, standPerWeight: 80, tentWeight: 1, tentFront: 3 };
const TENT_KINDS = new Set(['food', 'drink', 'snack', 'merch', 'hospitality']);

/** the spots of a course (tees and pins by hole; a hole with no pin has no green spot) and its placed structures */
export function gallerySpots(tees: readonly { hole: number; x: number; y: number }[], pins: readonly { hole: number; x: number; y: number }[], structures: readonly PlacedEventStructure[] = [], sets: readonly ObjectEightSet[] = OBJECT_EIGHT_SETS): GallerySpot[] {
  const out: GallerySpot[] = [], last = Math.max(0, ...pins.map(p => p.hole));
  for (const p of [...pins].sort((a, b) => a.hole - b.hole)) {
    const t = tees.find(q => q.hole === p.hole);
    // the line of play from the tee to the pin, and its side (the spectators stand off it, to its left)
    let ux = 0.7071, uy = 0.7071;
    if (t) { const dx = p.x - t.x, dy = p.y - t.y, L = Math.hypot(dx, dy); if (L > 1e-6) { ux = dx / L; uy = dy / L; } }
    const nx = -uy, ny = ux, G = p.hole === last ? { ...GALLERY.green, ...GALLERY.lastGreen } : GALLERY.green;
    out.push({ x: p.x + nx * GALLERY.green.off, y: p.y + ny * GALLERY.green.off, kind: 'green', weight: G.weight, cap: G.cap, hole: p.hole, fx: p.x, fy: p.y, ax: p.x, ay: p.y });
    if (t) out.push({ x: t.x - ux * GALLERY.tee.back + nx * GALLERY.tee.off, y: t.y - uy * GALLERY.tee.back + ny * GALLERY.tee.off, kind: 'tee', weight: GALLERY.tee.weight, cap: GALLERY.tee.cap, hole: p.hole, fx: t.x, fy: t.y, ax: p.x, ay: p.y });
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
