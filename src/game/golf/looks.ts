// T256 (#743; the owner, 2026-10-29: "currently if I edit a bunker on this page it will change every single bunker or green etc on the course.
// we dont want that. You should be editing practice facilities and each holes textures seprately"): the course's looks book. A surface's look
// (its texture, scale, angle, tone and blend, its border's texture, scale, angle and tone: course-look.ts LOOK_FIELDS) belongs to an owner:
// - a hole ('h1' .. 'h18': the cells painted for it),
// - the property ('property': the cells of no hole, painted with Range › Build, the range's own tee and anything else of no hole),
// - a practice facility ('putting', 'chipping': the cells of no hole inside its footprint in the practice area),
// and the course default ('default': PaintTool.brush[kind].style, today's course-wide look, remembered in the browser) is what a new owner
// starts from. The book lives in the game save (GolfSave.looks). Pure: no DOM, importable from node tests.
import { BRUSH_PRESETS, clampStyle, type BrushKind } from '../paint';
import type { LookStyle } from '../course-look';

/** an owner's looks: one style per surface brush (a missing one: the course default's) */
export type LookSet = Partial<Record<BrushKind, LookStyle>>;
/** every owner's looks, by owner key */
export type LookBook = Record<string, LookSet>;
/** the practice facilities that own their looks (golf/rangesave.ts PracticeId) */
export const FACILITY_OWNERS = ['putting', 'chipping'] as const;
export type FacilityOwner = (typeof FACILITY_OWNERS)[number];
/** an owner key: the course default, the property, a facility or a hole */
export type LookOwner = 'default' | 'property' | FacilityOwner | `h${number}`;
/** the surfaces whose look the course grid lays (paint-tool GRID_KINDS) */
export const LOOK_KINDS: readonly BrushKind[] = ['fairway', 'green', 'tee', 'rough', 'bunker', 'water', 'waste', 'longGrass'];

/** the owner of the cells of hole n (0: the property) */
export const holeOwner = (n: number): LookOwner => (n > 0 ? `h${n}` : 'property');
/** the hole an owner key names (0: not a hole) */
export const ownerHole = (o: string): number => (/^h\d+$/.test(o) ? +o.slice(1) : 0);
/** whether a key is an owner the book keeps */
export const isBookOwner = (o: string): boolean => o === 'property' || (FACILITY_OWNERS as readonly string[]).includes(o) || (ownerHole(o) >= 1 && ownerHole(o) <= 255);

/** an owner's name in the words ("hole 3", "your property", "the putting green", "the chipping green", "the course default") */
export function ownerName(o: string): string {
  const n = ownerHole(o);
  if (n) return `hole ${n}`;
  return o === 'property' ? 'your property' : o === 'putting' ? 'the putting green' : o === 'chipping' ? 'the chipping green' : 'the course default';
}
/** a surface's plural name, as the My looks card says it */
const PLURAL: Readonly<Record<BrushKind, string>> = { fairway: 'Fairways', green: 'Greens', tee: 'Tees', rough: 'Rough', bunker: 'Bunkers', water: 'Water', waste: 'Waste areas', longGrass: 'Long grass', path: 'Cart paths' };
/** what the My looks card edits: "Bunkers on hole 3", "Bunkers on your property", "Bunkers on the chipping green", "Course default (new holes)" */
export function lookWhat(kind: BrushKind, owner: string): string {
  return owner === 'default' ? 'Course default (new holes)' : `${PLURAL[kind] ?? kind} on ${ownerName(owner)}`;
}

/** a copy of a style (each look is its own object: editing one never touches another) */
export const copyLook = (st: LookStyle): LookStyle => ({ ...st });
/** a copy of an owner's looks */
export function copySet(s: LookSet): LookSet { const out: LookSet = {}; for (const [k, st] of Object.entries(s) as [BrushKind, LookStyle][]) out[k] = copyLook(st); return out; }
/** the default looks as a set (every look kind, copied) */
export function defaultSet(dflt: (k: BrushKind) => LookStyle): LookSet { const out: LookSet = {}; for (const k of LOOK_KINDS) out[k] = copyLook(dflt(k)); return out; }

/** the look owner o wears for kind k: its own, else the course default */
export function lookOf(book: LookBook | null | undefined, o: string, k: BrushKind, dflt: (k: BrushKind) => LookStyle): LookStyle {
  return (o !== 'default' ? book?.[o]?.[k] : undefined) ?? dflt(k);
}
/** gives owner o its own looks, copied from the course default, when it has none yet (a new hole starts from the default); true when it did */
export function seedOwner(book: LookBook, o: string, dflt: (k: BrushKind) => LookStyle): boolean {
  if (o === 'default' || book[o]) return false;
  book[o] = defaultSet(dflt); return true;
}

/** the book from a save: each known owner's known looks, clamped (a bad entry is dropped); undefined when there is none (an old save: the
 *  engine then gives every hole and the property today's default as their own, so nothing changes on load) */
export function normalizeBook(raw: unknown): LookBook | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: LookBook = {}, kinds = new Set<string>(BRUSH_PRESETS.map(b => b.kind));
  for (const [o, set] of Object.entries(raw as Record<string, unknown>)) {
    if (!isBookOwner(o) || !set || typeof set !== 'object') continue;
    const s: LookSet = {};
    for (const [k, st] of Object.entries(set as Record<string, unknown>)) {
      if (!kinds.has(k) || !st || typeof st !== 'object') continue;
      const p = BRUSH_PRESETS.find(b => b.kind === k)!;
      s[k as BrushKind] = clampStyle({ ...p.style, ...(st as Partial<LookStyle>) });
    }
    out[o] = s;
  }
  return out;
}
