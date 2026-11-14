// The map's cursor (#1282; the owner, 2026-11-14: "show a pointer cursor over anything the will pop up a window if you click it"). Over anything a click opens a
// window or a card for (a building, the range and its practice area, a hole or its badge, a person you can talk to, a car, a block of land for sale, a bunker, a prop
// you select) the cursor is a pointer; over open ground it is the plain arrow (the pan hand while no character stands in the world); the tools keep their own cursors
// (a build or the bulldozer: the crosshair; the paint tools: their brush's; a tee in hand: copy or grabbing) and the Walk cursor its verbs (footprints, a speech
// bubble, an eye, a hand: with Walk in hand a click walks you to the thing, so only what opens at once, a hole's badge, is a pointer there). What a click opens is
// the engine's own pick (Game.clickOpensAt: Select's click asked without acting), so the cursor never says "click" where nothing opens. Pure TS, no DOM, no
// engine: App.tsx hands in the facts.

/** what the cursor is chosen from */
export interface MapCursorFacts {
  /** Walk in hand (the character takes the clicks): the css cursor of the verb under the pointer (VERB_CURSOR), else null */
  verb: string | null;
  /** a tee set in hand (null: none): being dragged (grabbing) or about to be laid (copy) */
  teePlace: { drag: boolean } | null;
  /** the tool in hand (Select: the rail's pointer or its walking figure with a side mode open) */
  tool: string;
  /** Select in hand: a click under the pointer opens a window or a card at once (the engine's pick: with Walk in hand it is only a hole's badge) */
  opens: boolean;
  /** your character stands in the world (the pointer's rest is then the arrow, else the pan hand: a drag moves the map) */
  hasYou: boolean;
  /** a paint tool is in hand, and its brush's cursor */
  paintOn: boolean; paintCursor: string;
}

/** the css cursor of the map: a tee in hand, the pointer over what a Select click opens, the Walk verb, Select's rest (the arrow, or the pan hand with no character),
 *  a paint tool's brush, else the crosshair of a build */
export function mapCursor(f: MapCursorFacts): string {
  if (f.teePlace) return f.teePlace.drag ? 'grabbing' : 'copy';
  if (f.tool === 'select' && f.opens) return 'pointer';
  if (f.verb) return f.verb;
  if (f.tool === 'select') return f.hasYou ? 'default' : 'grab';
  return f.paintOn ? f.paintCursor : 'crosshair';
}
