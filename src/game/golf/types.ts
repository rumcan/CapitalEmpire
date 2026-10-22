// The golf course's shared types (docs/GOLF-PLAN.md section 4): painted surfaces and the hole objects. Pure TS, no DOM.

/** metres per tile */
export const TILE_M = 2;
/** a course surface (GOLF-PLAN 4.1); each maps to a Paint texture when golf mode is wired in */
export type GolfSurface = 'green' | 'fringe' | 'tee' | 'fairway' | 'firstCut' | 'rough' | 'fescue' | 'bunker' | 'waste' | 'water' | 'path' | 'other';
/** a painted course area: its surface and its closed outline x0 y0 x1 y1 ... (tiles); a later area paints over an earlier one */
export interface CourseArea { id: number; surface: GolfSurface; pts: number[]; plantKind?: 'seed' | 'sod'; plantedMonth?: number }
/** a hole's tee markers: the back (championship), middle (member) or forward tee */
export interface TeeMark { hole: number; x: number; y: number; kind: 'back' | 'middle' | 'forward' }
/** a hole's pin (the flagstick), standing on its green */
export interface Pin { hole: number; x: number; y: number }
/** a dogleg aim point: the playing line runs tee -> the hole's aim points by order -> pin */
export interface AimPoint { hole: number; x: number; y: number; order: number }
/** a course: its areas (in paint order), tee markers, pins, aim points and the clubhouse door (tiles) */
export interface CourseLayout { areas: CourseArea[]; tees: TeeMark[]; pins: Pin[]; aims: AimPoint[]; clubhouse: { x: number; y: number } }
