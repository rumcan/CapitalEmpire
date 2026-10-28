// T258 (#755): the driving range's ground art as the owner picks it in the studio (Studio > Painted > Range art, the painted surfaces file's
// `range` block: painted-surfaces.json). The hitting mats (GOLF-ART-LIST item 19) and the target greens (item 20) are their pictures laid flat
// on the ground (rangebiz.ts rangeScene, golf/range-pics.ts), or the stand-ins before them (the mats: a dark pad and a turf square a bay on
// the concrete deck; the greens: the range's green preset in a fringe and a first-cut collar). One target green is the bullseye (item 27, a
// giant archery target mown into the turf): by default the fourth, the 200 m green that comes with More target greens (the biggest, so the
// bullseye's 16-24 m fits it); -1 for none. A missing block is the default. Pure: no DOM, importable from node tests.

/** the range's ground art: each of the mats and the greens as its picture or its old stand-in, and which target green (0..4) is the bullseye */
export interface RangeLook { mats: 'picture' | 'stand-in'; greens: 'picture' | 'stand-in'; bullseye: number }
/** the default: both pictures, the bullseye the fourth green (200 m) */
export const DEFAULT_RANGE_LOOK: Readonly<RangeLook> = { mats: 'picture', greens: 'picture', bullseye: 3 };
/** the stand-ins as before T258 (the studio's option; a test's) */
export const RANGE_STAND_INS: Readonly<RangeLook> = { mats: 'stand-in', greens: 'stand-in', bullseye: -1 };
/** each knob's choices (the studio's menus) */
export const RANGE_LOOK_CHOICES = { mats: ['picture', 'stand-in'], greens: ['picture', 'stand-in'], bullseye: [-1, 0, 1, 2, 3, 4] } as const;

/** a look with every knob one of its choices (missing or bad: the default's) */
export function clampRangeLook(f: unknown): RangeLook {
  const o = (f && typeof f === 'object' ? f : {}) as Partial<Record<keyof RangeLook, unknown>>, D = DEFAULT_RANGE_LOOK;
  const pick = <K extends 'mats' | 'greens'>(k: K): RangeLook[K] => ((RANGE_LOOK_CHOICES[k] as readonly unknown[]).includes(o[k]) ? o[k] : D[k]) as RangeLook[K];
  const b = o.bullseye;
  return { mats: pick('mats'), greens: pick('greens'), bullseye: typeof b === 'number' && (RANGE_LOOK_CHOICES.bullseye as readonly number[]).includes(b) ? b : D.bullseye };
}
const memo = new WeakMap<object, RangeLook>();
/** the look a surfaces file carries (painted-surfaces.ts SurfacesFile.range), clamped and kept per file (the file is never changed) */
export function rangeLookOf(file: { range?: unknown } | null | undefined): RangeLook {
  if (!file) return DEFAULT_RANGE_LOOK;
  let l = memo.get(file); if (!l) memo.set(file, l = file.range ? clampRangeLook(file.range) : DEFAULT_RANGE_LOOK);
  return l;
}
