// T402 (#1080): which animals a farm keeps, and what it keeps them in, from the layout alone (no art, no obstacles). animals.ts places the herds
// with this plan, and farms.ts picks the farm's outbuildings from it (the owner, 2026-11-09: "a house garage as a barn??": a farm's buildings come
// from the farm kit; cows get a barn or a cow shed, horses a stable, sheep a shed), so the buildings and the animals always read the same herd.
// Pure TS, no DOM, no library: the two modules import it and nothing of theirs.
import type { AnimalField } from './farms';

export type AnimalKind = 'cow' | 'horse' | 'sheep';

/** the hash the animals' placement is drawn from (a fraction of 2^32 from three integers) */
export const h32 = (a: number, b: number, c = 0) => {
  let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77) ^ Math.imul(c | 0, 0xc2b2ae3d)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0; h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0; return (h ^ (h >>> 16)) >>> 0;
};
export const u01 = (a: number, b: number, c = 0) => h32(a, b, c) / 4294967296;

/** one grazed field of a farm: the field, its index among the grazed fields and the kind that grazes it */
export interface Graze { q: AnimalField; qi: number; kind: AnimalKind }
/** The fields a farm's animals graze and what grazes each (animals.ts farmAnimals's own rule): the paddock (the pasture inside the chain-link fence)
 *  a herd of cows (6 farms in 10) or horses, every other pasture sheep, and, only on a farm with no pasture, half the time its largest fallow field
 *  sheep. fields: the farm's grass fields (farmAnimalFields) */
export function herdPlan(fields: readonly AnimalField[], seed: number): Graze[] {
  const s0 = h32(seed, 0x7309);
  const fallow = fields.filter(q => q.kind === 'fallow').sort((a, b) => (b.a1 - b.a0) * (b.b1 - b.b0) - (a.a1 - a.a0) * (a.b1 - a.b0))[0];
  const grazed = fields.filter(q => q.kind !== 'fallow' || (q === fallow && u01(s0, 1) < 0.5 && !fields.some(z => z.kind === 'pasture')));
  return grazed.map((q, qi): Graze => ({ q, qi, kind: q.kind === 'paddock' ? (u01(s0, 2, qi) < 0.6 ? 'cow' : 'horse') : 'sheep' }));
}

/** what a farm keeps its animals in (the farm kit's outbuildings): a barn, a stable or a shed */
export type Shelter = 'barn' | 'stable' | 'shed';
/** The farm's main outbuilding by its herd: the paddock's horses a stable, its cows a barn; a farm of sheep alone a shed; a farm with no animals the
 *  barn it always had */
export function shelterOf(plan: readonly Graze[]): Shelter {
  const paddock = plan.find(g => g.q.kind === 'paddock');
  if (paddock) return paddock.kind === 'horse' ? 'stable' : 'barn';
  return plan.length ? 'shed' : 'barn';
}
/** whether a farm has sheep (a shed stands for them, whatever its main outbuilding is) */
export const hasSheep = (plan: readonly Graze[]): boolean => plan.some(g => g.kind === 'sheep');
