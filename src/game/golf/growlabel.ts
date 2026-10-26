// A hole's grow-in in words (plan P23 4.6, T135): one text, "growing · ready Mar 1985", for every place that says it: the hole's badge (◔,
// its tooltip), the Holes panel's status line and the course hint pill (Game.holeGrowLabel and Game.courseHint). Pure TS, no DOM.
import { monthIndexLabel } from './calendar';

/** the grow-in words for the game month a hole is grown in (golfMonthIndex's scale: Game.holesGrowing), or '' once it is grown in (undefined) */
export function growReadyLabel(readyMonth: number | undefined): string { return readyMonth === undefined ? '' : `growing · ready ${monthIndexLabel(readyMonth)}`; }

/** the course hint pill with hole n's grow-in right after the hole's name (the first "Hole n" in it: "Painting Fairway · Hole 1 · growing ·
 *  ready Mar 1985 · $2 a cell"); the hint as it is when it names no hole n (a cart path, a practice green, a rub out) or the hole is grown in */
export function hintWithGrow(hint: string, n: number, grow: string): string {
  if (!grow) return hint;
  const at = new RegExp(`Hole ${n}(?!\\d)`).exec(hint);
  if (!at) return hint;
  const end = at.index + at[0].length;
  return `${hint.slice(0, end)} · ${grow}${hint.slice(end)}`;
}
