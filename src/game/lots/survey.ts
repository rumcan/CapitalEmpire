// T232 (#673; docs/art/CONCEPT-LOOK.md step 9, the concept's "bought land is bare dirt inside a white dashed line"): the survey line round a
// plot. A town lot under construction (compose.ts site), the land the player bought (golf/land-sale.ts, T200) and the town lots the player
// cleared on it are pegged out by a white dashed line just inside their lines. The line is a lines-only ground patch (tex 'marks', so no
// painter fills it; survey: the renderer strokes its lines white and dashed with the lots' decals, over all their ground and under the roads).
// Pure, no library: the ground worker's renderer reads the dash from here too.
import type { LotPatch } from '../ground-protocol';

type Pt = { x: number; y: number };
/** a plot: its corner o and frame (u along the frontage, n into it, unit vectors), its width along u and depth along n (tiles) */
export interface Plot { o: Pt; u: Pt; n: Pt; w: number; d: number }
/** how far inside the plot's lines the survey line runs (tiles) */
export const SURVEY_INSET = 0.3;
/** the line's dash and gap along it, and its width (tiles: 1.4 m dashes, 0.8 m gaps, 20 cm wide); each side starts with a dash at its
 *  corner, so a corner reads as an L. A dash is in world tiles from the side's start, so every ground chunk draws it alike */
export const SURVEY_DASH: readonly number[] = [0.7, 0.4];
export const SURVEY_W = 0.1;
/** its colour: chalk white, a little warm */
export const SURVEY_COL = 'rgba(250,247,238,0.95)';

/** the survey line round a plot, inset tiles inside its lines: its four sides as segments x0 y0 x1 y1 (world tiles), clockwise from the
 *  frontage's start; none for a plot too small to hold it */
export function surveyLines(p: Plot, inset = SURVEY_INSET): number[] {
  const a0 = inset, b0 = inset, a1 = p.w - inset, b1 = p.d - inset;
  if (a1 - a0 < 0.5 || b1 - b0 < 0.5) return [];
  const P = (a: number, b: number) => [p.o.x + p.u.x * a + p.n.x * b, p.o.y + p.u.y * a + p.n.y * b];
  const c = [P(a0, b0), P(a1, b0), P(a1, b1), P(a0, b1)], out: number[] = [];
  for (let k = 0; k < 4; k++) { const s = c[k]!, e = c[(k + 1) % 4]!; out.push(+s[0]!.toFixed(3), +s[1]!.toFixed(3), +e[0]!.toFixed(3), +e[1]!.toFixed(3)); }
  return out;
}
/** the survey line's ground patch (null for a plot too small): pts bound its lines (grown by the line's width) */
export function surveyPatch(p: Plot, inset = SURVEY_INSET): LotPatch | null {
  const lines = surveyLines(p, inset); if (!lines.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < lines.length; i += 2) { x0 = Math.min(x0, lines[i]!); x1 = Math.max(x1, lines[i]!); y0 = Math.min(y0, lines[i + 1]!); y1 = Math.max(y1, lines[i + 1]!); }
  const g = SURVEY_W;
  return { pts: [x0 - g, y0 - g, x1 + g, y0 - g, x1 + g, y1 + g, x0 - g, y1 + g].map(v => +v.toFixed(3)), tex: 'marks', lines, survey: true };
}
/** a map-axis rectangle [x, y, w, h] (tiles: the player's land) as a plot */
export const rectPlot = (r: readonly [number, number, number, number]): Plot => ({ o: { x: r[0], y: r[1] }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, w: r[2], d: r[3] });
