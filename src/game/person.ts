// People are never player-placeable props (T401, #1079; the owner, 2026-11-09: "why can I place a golfer swinging outside town on a random piece of desert
// only. the people should not be placeable."). The game draws its own people (the golfers, the crowds, the staff, the townsfolk: walkers, and the
// animated ones of the eight-view and object libraries); a player only ever places things. One predicate says what a person is, so the Props catalogue,
// the studio's palettes (the lot lab's and the Lot review's quick pick) and the save loader all ask the same question, and a person that comes back
// into the library by a new import is caught here by its tag, its category or its id, not by a hand list somewhere.
import type { LibItem } from './types';

/** the library categories whose pictures are people: the town's, the spectators' (the crowd and the staff), the golfers', the owner's new People props */
export const PEOPLE_CATS: ReadonlySet<string> = new Set(['Townspeople', 'Spectators', 'Golfers', 'New: People']);
/** the ids that name a person: the cast's frames (person:, golfer:, spectator:, staff:, crowd:) and the new props that are people: the People sheet
 *  (golfer-, caddie-, marshal-) and the figures among the others (the marshal, the course worker, the catering staff) */
const PERSON_ID = /^(person:|golfer:|spectator:|staff:|crowd:|newprop:(golfer|caddie|marshal|course-worker|catering-staff)(-|$))/;
/** whether an id names a person */
export const isPersonId = (id: string): boolean => PERSON_ID.test(id);
/** the fields of a library picture that say it is a person */
export type PersonLike = Pick<LibItem, 'id' | 'cat'> & { kind?: string; person?: boolean };
/** whether a library picture is a person: tagged so at its source (LibItem.person: the walkers' pushes in library.ts, the People props, an eight-view
 *  set's registry row), or of a people category, or named as one. Animals and the other walkers are no people */
export const isPerson = (it: PersonLike): boolean => it.person === true || it.kind === 'person' || PEOPLE_CATS.has(it.cat) || isPersonId(it.id);

/** the saved prop tuples an old save loads (golf/decor.ts propTuple: the library id first) without its people: a person placed from the Props tool
 *  before T401 is dropped, nothing refunded or charged (a prop costs nothing to keep, and the save holds no money for it). lookup: the library
 *  picture of an id (undefined: no longer in the library, which is dropped by the loader as before) */
export function dropPeople<T extends readonly unknown[]>(tuples: readonly T[], lookup: (id: string) => PersonLike | undefined): T[] {
  return tuples.filter(t => { const id = t[0]; if (typeof id !== 'string') return true; const it = lookup(id); return !(isPersonId(id) || (it && isPerson(it))); });
}
