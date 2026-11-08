// The downloaded courses the Course flyout offers under "Place a real course" (T356, #998, with T358's library, library.ts): the records of the courses the player
// fetched, listed once when the game starts and again whenever the flyout opens. The menu is a pure function of its context and cannot wait on IndexedDB, so the
// last listing is kept here and read synchronously; a watcher hears when it changed (the page draws the menu again). A library that cannot be opened (no
// IndexedDB) leaves the list empty. Pure of DOM.
import { sharedLibrary, type CourseLibrary, type CourseRecord } from './library';

let list: readonly CourseRecord[] = [];
const watchers = new Set<() => void>();

/** the downloaded courses that can be built (the preview found holes in them), newest fetch first, as the last listing had them */
export const keptCourses = (): readonly CourseRecord[] => list;

/** the same course, as far as the menu shows it */
const same = (a: CourseRecord, b: CourseRecord): boolean => a.id === b.id && a.name === b.name && a.place === b.place && a.holes === b.holes && a.par === b.par && a.fetchedAt === b.fetchedAt;

/** lists the library again (the shared IndexedDB one, or `lib`); the watchers are told only when the list changed. Never rejects: no library, no list */
export async function refreshKept(lib?: CourseLibrary): Promise<void> {
  let all: CourseRecord[];
  try { all = await (lib ?? await sharedLibrary()).list(); } catch { return; }
  // (a record whose map held no hole is in the library for its preview but cannot be placed, and one never read has no count yet: the picker's preview reads it)
  const next = all.filter(r => (r.holes ?? 0) > 0);
  if (next.length === list.length && next.every((r, i) => same(r, list[i]!))) return;
  list = next;
  for (const w of [...watchers]) w();
}

/** calls `f` whenever a listing changes the list; returns the function that stops it */
export function watchKept(f: () => void): () => void { watchers.add(f); return () => { watchers.delete(f); }; }

/** forgets the list (the tests) */
export function clearKept(): void { list = []; watchers.clear(); }
