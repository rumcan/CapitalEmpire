// The career: the population milestones a town reaches as it grows, what each unlocks (road classes, junction types, tunnels)
// and the budget grant paid then, and the win at WIN_POP. Milestones never un-reach. Pure TS, no DOM, runs in node.
import { CLASS, type ClassId, type NodeType } from './network';

/** a population milestone: the residents it needs, what reaching it unlocks and the grant paid then */
export interface Milestone {
  /** the residents needed */
  pop: number;
  /** the town's name at this size */
  name: string;
  /** the road classes it unlocks */
  classes: ClassId[];
  /** the junction types it unlocks */
  junctions: NodeType[];
  /** true if it unlocks tunnels (bridges are never locked) */
  tunnels: boolean;
  /** the grant paid when reached, $ */
  grant: number;
}

/** the milestones in order (index 0 is the hamlet every town starts as); each unlocks what it lists, on top of the ones below */
export const MILESTONES: Milestone[] = [
  { pop: 0, name: 'Hamlet', classes: ['gravel', 'lane', 'street'], junctions: ['plain', 'stop', 'mini', 'signal'], tunnels: false, grant: 0 },
  { pop: 250, name: 'Village', classes: ['road'], junctions: [], tunnels: false, grant: 10000 },
  { pop: 1000, name: 'Small town', classes: [], junctions: ['roundabout'], tunnels: false, grant: 20000 },
  { pop: 2500, name: 'Town', classes: ['avenue', 'arterial'], junctions: ['slip'], tunnels: true, grant: 30000 },
  { pop: 4000, name: 'Large town', classes: ['boulevard', 'six', 'divided'], junctions: [], tunnels: false, grant: 50000 },
  { pop: 6000, name: 'City', classes: ['grand'], junctions: [], tunnels: false, grant: 0 },
];
/** the type a class id unlocks by (its base); an unknown or missing id unlocks nothing */
const baseOf = (id?: string): ClassId => (id && CLASS[id]?.base) || '';
/** the residents that win the career (the City milestone) */
export const WIN_POP = 6000;

/** the index of the last milestone the population reaches (0 below the first; the last index at WIN_POP and above) */
export function reachedFor(pop: number): number {
  let r = 0;
  for (let i = 0; i < MILESTONES.length; i++) if (pop >= MILESTONES[i]!.pop) r = i;
  return r;
}
/** true if a road class is unlocked at milestone index reached (a milestone at or below it lists it) */
export function classUnlocked(id: ClassId, reached: number): boolean { return MILESTONES.some((m, i) => i <= reached && m.classes.includes(baseOf(id))); }
/** true if a junction type is unlocked at milestone index reached */
export function junctionUnlocked(t: NodeType, reached: number): boolean { return MILESTONES.some((m, i) => i <= reached && m.junctions.includes(t)); }
/** true if tunnels are unlocked at milestone index reached */
export function tunnelsUnlocked(reached: number): boolean { return MILESTONES.some((m, i) => i <= reached && m.tunnels); }
/** the milestone that unlocks a road class or junction type (by its id), or tunnels (no id): the lowest one that lists it; null if none does */
export function unlockOf(kind: 'class' | 'junction' | 'tunnel', id?: string): Milestone | null {
  return MILESTONES.find(m => kind === 'class' ? m.classes.includes(baseOf(id)) : kind === 'junction' ? m.junctions.includes(id as NodeType) : m.tunnels) ?? null;
}

/** the career as saved: the index of the highest milestone reached and whether the win has happened */
export interface CareerSave { reached: number; won: boolean }

/** the town's career: the highest milestone reached (it never goes back) and whether it has won (it stays so) */
export class Career {
  /** the index of the highest milestone reached (into MILESTONES) */
  reached = 0;
  /** true once the population first reached WIN_POP */
  won = false;

  /** raises reached to reachedFor(pop) if that is higher; returns the milestones newly reached, in order, and whether the win happened now */
  update(pop: number): { newly: Milestone[]; won: boolean } {
    const newly: Milestone[] = [], r = reachedFor(pop);
    for (let i = this.reached + 1; i <= r; i++) newly.push(MILESTONES[i]!);
    if (r > this.reached) this.reached = r;
    const won = !this.won && pop >= WIN_POP;
    if (won) this.won = true;
    return { newly, won };
  }
  /** the save: the highest milestone reached and the win */
  toJSON(): CareerSave { return { reached: this.reached, won: this.won }; }
  /** a career from a save (a fresh one, at the hamlet, if none is given) */
  static from(s?: CareerSave): Career {
    const c = new Career();
    if (!s) return c;
    c.reached = s.reached ?? 0; c.won = s.won ?? false;
    return c;
  }
}
