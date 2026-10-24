// A golf save's course grid at load (plan P21 section 3.7, T078): the saved grid, or the migration of an older save's golf-surface paint
// areas into a new grid, or a refusal when the saved grid is corrupt (so the load fails and the slot is backed up, T042, instead of the
// course being replaced by an empty grid and saved over). Pure TypeScript, no DOM. Units: tiles.
import { decodeGrid, type Grid } from './index';
import { plantMonth, rasterAreas } from './areas';
import { drawZ, roundCorners, type PaintArea } from '../../paint';
import { surfaceOfTex } from '../../golf/costs';

/** what a golf save's `grid` field gives at load: the decoded grid; 'migrate' when there is none (an older save: its golf paint areas move
 *  into a new grid); 'bad' when there is one that does not decode (truncated or corrupt: the load must fail) */
export function loadCourseGrid(save: unknown): Grid | 'migrate' | 'bad' {
  if (save === undefined || save === null) return 'migrate';
  return decodeGrid(save) ?? 'bad';
}

/** whether a painted area is a course surface the grid takes over: a brush kind or a texture with a golf surface, but not a cart path or
 *  other ground (those stay painted areas); fringe and first-cut bands are taken too (collars are automatic now) and dropped */
export function isCourseArea(a: Pick<PaintArea, 'kind' | 'tex'>): boolean {
  const s = a.kind ?? surfaceOfTex(a.tex);
  return !!s && s !== 'path' && s !== 'other';
}

/** lays the course areas of `areas` into grid g in paint order (a later one over an earlier one, with its hole, its corners rounded as drawn,
 *  seeded ones with their month) and returns them, for the caller to take out of the paint list */
export function migrateAreas(g: Grid, areas: readonly PaintArea[]): PaintArea[] {
  const gone = areas.filter(isCourseArea).sort((a, b) => drawZ(a) - drawZ(b));
  rasterAreas(g, gone.map(a => ({ pts: roundCorners(a.pts, a.radius), surface: a.kind ?? surfaceOfTex(a.tex), hole: a.hole, month: plantMonth(a.plantKind, a.plantedMonth) })));
  return gone;
}
