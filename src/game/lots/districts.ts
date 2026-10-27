// Town districts (G6R.7): commercial and industrial districts for seeded towns. Pure TS, no DOM.
import type { Pt } from '../network';
import { BLOCK } from './roads';
import { TOWN_BLOCKS } from './seedtowns';

/** street class ids that count as an asphalt through-road for the commercial district (G6R.7) */
export const COM_CLASSES: ReadonlySet<string> = new Set<string>([
  'avenue', 'road', 'arterial', 'boulevard', 'six', 'grand', 'divided',
]);

/** distance from town centre (tiles) within which an asphalt through-road lot is in the commercial district */
export const COM_DIST_RADIUS = 100;

/** side of the industrial district in blocks (2x2 blocks = 80x80 tiles) */
export const IND_BLOCKS = 2;

/** whether a lot with centre lotCentre fronting a street of class segClassId is in the commercial district of townCentre */
export function inCommercial(lotCentre: Pt, segClassId: string, townCentre: Pt): boolean {
  if (!COM_CLASSES.has(segClassId)) return false;
  return Math.hypot(lotCentre.x - townCentre.x, lotCentre.y - townCentre.y) <= COM_DIST_RADIUS;
}

/** the 2x2-block (80x80 tile) rectangle [x, y, w, h] at the corner of the town grid nearest entry */
export function industrialRect(townCentre: Pt, entry: Pt, n = TOWN_BLOCKS): [number, number, number, number] {
  const span = n * BLOCK;
  const x0 = Math.round((townCentre.x - span / 2) / BLOCK) * BLOCK;
  const y0 = Math.round((townCentre.y - span / 2) / BLOCK) * BLOCK;
  const w = IND_BLOCKS * BLOCK, h = IND_BLOCKS * BLOCK;
  const farX = x0 + (n - IND_BLOCKS) * BLOCK;
  const farY = y0 + (n - IND_BLOCKS) * BLOCK;
  const corners: [number, number, number, number][] = [
    [x0, y0, w, h],
    [farX, y0, w, h],
    [x0, farY, w, h],
    [farX, farY, w, h],
  ];
  let best = corners[0]!, bestD = Infinity;
  for (const r of corners) {
    const cx = r[0] + r[2] / 2, cy = r[1] + r[3] / 2;
    const d = Math.hypot(cx - entry.x, cy - entry.y);
    if (d < bestD) { bestD = d; best = r; }
  }
  return best;
}

/** whether a lot with centre lotCentre lies inside the 2x2-block industrial rectangle indRect */
export function inIndustrial(lotCentre: Pt, indRect: [number, number, number, number]): boolean {
  return lotCentre.x >= indRect[0] && lotCentre.x <= indRect[0] + indRect[2] &&
         lotCentre.y >= indRect[1] && lotCentre.y <= indRect[1] + indRect[3];
}

/** T091 (plan P22 2.3.6): a grown town's (a range start's) industrial district, 2x2 blocks (80 x 80 tiles), on the town's side of the county
 *  road, 200-280 tiles from the town's seed along exitDir (a unit axis toward the nearer map exit), across from the seed's line +-40 tiles;
 *  null when it would touch golf land (each [x, y, w, h], padded by 6 as the town's roads keep off it). The town opens it at 250 built lots */
export function grownIndustrialRect(seed: Pt, exitDir: Pt, golfLand: readonly [number, number, number, number][] = []): [number, number, number, number] | null {
  const span = IND_BLOCKS * BLOCK, along = 200 + span / 2, cx = seed.x + exitDir.x * along, cy = seed.y + exitDir.y * along;
  const r: [number, number, number, number] = [cx - span / 2, cy - span / 2, span, span];
  for (const [gx, gy, gw, gh] of golfLand) if (r[0] < gx + gw + 6 && r[0] + r[2] > gx - 6 && r[1] < gy + gh + 6 && r[1] + r[3] > gy - 6) return null;
  return r;
}
/** the built lots from which a grown town opens its industrial district (plan P22 2.3.6) */
export const GROWN_IND_FROM = 250;
