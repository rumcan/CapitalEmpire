// The golf course's shared types (docs/GOLF-PLAN.md section 4): painted surfaces and the hole objects. Pure TS, no DOM.

/** metres per tile */
export const TILE_M = 2;
/** a course surface (GOLF-PLAN 4.1); each maps to a Paint texture when golf mode is wired in */
export type GolfSurface = 'green' | 'fringe' | 'tee' | 'fairway' | 'firstCut' | 'rough' | 'longGrass' | 'fescue' | 'bunker' | 'waste' | 'water' | 'path' | 'other';
/** a painted course area: its surface and its closed outline x0 y0 x1 y1 ... (tiles); a later area paints over an earlier one */
export interface CourseArea { id: number; surface: GolfSurface; pts: number[]; plantKind?: 'seed' | 'sod'; plantedMonth?: number }
/** a hole's tee set (T254, the four 1985 American sets, back to front; golf/teesets.ts TEE_SET): back the blue (championship), middle the white
 *  (members'), senior the yellow (forward men's, the seniors), forward the red (ladies' and beginners'). The old saves' back, middle and forward
 *  are the blue, white and red as they stand */
export type TeeKind = 'back' | 'middle' | 'senior' | 'forward';
/** a hole's tee markers (one pair per set) */
export interface TeeMark {
  hole: number; x: number; y: number; kind: TeeKind;
  /** placed by the Course tool from the painted tee (it goes with the tee) */ auto?: boolean;
  /** T254: put here by Edit Hole Layout: it stays even off the tee turf (the card warns) until the player moves it or paints a tee under it */ held?: boolean;
}
/** T268 (#809): a tee box Place or Add tee laid for a set (GolfSave.teeBoxes, by `hole:kind`; golf/teeplace.ts): its centre (tiles), heading
 *  (radians), size (1: 14 x 8 m), the hole it was laid for, and the ground it covered: u, the cells it changed as they were; z, the heights its
 *  level pad changed, before and after. Moving or removing the set puts that ground back. Kept off TeeMark so the markers stay small (the hole
 *  views key their caches on the markers' text every frame) */
export interface TeeBoxRec { x: number; y: number; a: number; s: number; n: number; u: string; z?: string }
/** a hole's pin (the flagstick), standing on its green */
export interface Pin {
  hole: number; x: number; y: number;
  /** placed by the Course tool from the painted green (it goes with the green) */ auto?: boolean;
  /** T254: put here by Edit Hole Layout: it stays even off the green (the card warns) */ held?: boolean;
}
/** a dogleg aim point: the playing line runs tee -> the hole's aim points by order -> pin */
export interface AimPoint { hole: number; x: number; y: number; order: number }
/** a course: its areas (in paint order), tee markers, pins, aim points and the clubhouse door (tiles) */
export interface CourseLayout { areas: CourseArea[]; tees: TeeMark[]; pins: Pin[]; aims: AimPoint[]; clubhouse: { x: number; y: number } }
