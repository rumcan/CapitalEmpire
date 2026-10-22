import { mulberry } from './iso';

/** The plant brushes (Paint → Golf brush row: Trees, Bushes, Flowers): a drag scatters props inside the brush circle, spaced apart and
 *  skipping blocked spots; Rub out / Alt removes only props placed this way (Prop.plant), never lot, town or forest props. */
export type PlantKind = 'trees' | 'bushes' | 'flowers';
/** a plant brush: radius r and spacing (tiles; one tile is 2 m), the size range (lo..hi times the sprite's map scale), and the sprites it
 *  picks from (null = every sprite of the kind) */
export interface PlantSet { r: number; spacing: number; lo: number; hi: number; ids: string[] | null }
export const PLANT_KINDS: { kind: PlantKind; name: string; col: string }[] = [
  { kind: 'trees', name: 'Trees', col: '#4f8a3a' },
  { kind: 'bushes', name: 'Bushes', col: '#6fae4a' },
  { kind: 'flowers', name: 'Flowers', col: '#d98ab5' },
];
export const PLANT_DEFAULTS: Record<PlantKind, PlantSet> = {
  trees: { r: 6, spacing: 4, lo: 0.85, hi: 1.15, ids: null },
  bushes: { r: 4, spacing: 2, lo: 0.85, hi: 1.15, ids: null },
  flowers: { r: 3, spacing: 1, lo: 0.85, hi: 1.15, ids: null },
};
export const PLANT_R: [number, number] = [0.5, 20], PLANT_SPACING: [number, number] = [0.5, 12], PLANT_SIZE: [number, number] = [0.4, 2.5];
/** the flowers: the three flowering ground plants the golf hole preset uses */
export const FLOWER_IDS = ['town:hydrangea', 'town:fern', 'town:ornamental_grass'];

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const fin = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
/** a plant brush from storage (or a partial edit), every value held to its range; ids keeps only strings (an empty list stays empty) */
export function clampPlant(s: Partial<PlantSet> | undefined, kind: PlantKind): PlantSet {
  const D = PLANT_DEFAULTS[kind], lo = clamp(fin(s?.lo, D.lo), PLANT_SIZE[0], PLANT_SIZE[1]), hi = clamp(fin(s?.hi, D.hi), PLANT_SIZE[0], PLANT_SIZE[1]);
  return { r: clamp(fin(s?.r, D.r), PLANT_R[0], PLANT_R[1]), spacing: clamp(fin(s?.spacing, D.spacing), PLANT_SPACING[0], PLANT_SPACING[1]), lo: Math.min(lo, hi), hi: Math.max(lo, hi), ids: Array.isArray(s?.ids) ? s.ids.filter((x): x is string => typeof x === 'string') : null };
}

/** the sprites a kind can plant, from the library items (in library order): trees = kind tree, bushes = kind bush but the flowers, flowers = FLOWER_IDS */
export function plantPool(items: readonly { id: string; name: string; kind: string }[], kind: PlantKind): { id: string; name: string }[] {
  const flowers = new Set(FLOWER_IDS);
  return items.filter(it => kind === 'trees' ? it.kind === 'tree' : kind === 'bushes' ? it.kind === 'bush' && !flowers.has(it.id) : flowers.has(it.id)).map(it => ({ id: it.id, name: it.name }));
}

/** the candidate spots of one dab: about 1.5 x (the circle's area / spacing²) random points inside the circle (seeded); the engine keeps
 *  those at least 0.9 x spacing from every prop */
export function plantPoints(x: number, y: number, r: number, spacing: number, seed: number): { x: number; y: number }[] {
  const rnd = mulberry(seed), n = Math.max(1, Math.ceil(1.5 * Math.PI * r * r / (spacing * spacing))), out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2, d = r * Math.sqrt(rnd()); out.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d }); }
  return out;
}
