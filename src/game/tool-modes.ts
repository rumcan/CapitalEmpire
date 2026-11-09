// Modes never steal a click; Esc closes menus first (P23 P1-A, T116; docs/plans/P23-UX.md 4.10). Pure: no DOM, no engine.
//
// The side modes (the Grass panel, and the Land, Event and Holes switches) live in Select: opening one switches to Select and closes the
// others, and picking any build tool closes them all, so none of them takes a click from the tool in hand.
// Esc walks a ladder: the topmost menu or card first (the picture card, a conversation, Help, the gear menu, the Event catalogue, the Grass
// panel, Course stats, the Budget or Bottlenecks card, then the side cards from the outermost in: your bag or cards, your profile, the Staff,
// the Clubhouse, the Range and the event announcement; T394), then the tool steps back or drops what is in hand (a route, a stroke, an outline,
// a piece, a selection), then the tool is put down for Select. A right click on the map (no drag) takes the very same step (T392, T393).
import type { Tool } from './types';
import { SURFACE_BRUSHES } from './paint';

/** the side modes: the engine's flags of the Grass panel and the Land, Holes and Event switches */
export type SideMode = 'grassPanel' | 'landMode' | 'holesTool' | 'eventTool';
export const SIDE_MODES: readonly SideMode[] = ['grassPanel', 'landMode', 'holesTool', 'eventTool'];
export type SideModes = Record<SideMode, boolean>;

/** whether picking tool t closes the side modes: every build tool does; Select (where they live) keeps them */
export const closesSideModes = (t: Tool): boolean => t !== 'select';

/** picks tool t for the side modes m: a build tool turns them all off (Select keeps them); true when one was on */
export function pickTool(m: SideModes, t: Tool): boolean {
  if (!closesSideModes(t)) return false;
  let was = false;
  for (const k of SIDE_MODES) { if (m[k]) was = true; m[k] = false; }
  return was;
}

/** opens side mode k and closes the others, or closes k when it is open; true when k is now open (the caller then switches to Select) */
export function switchSideMode(m: SideModes, k: SideMode): boolean {
  const on = !m[k];
  for (const j of SIDE_MODES) m[j] = false;
  m[k] = on;
  return on;
}

/** the menus and cards Esc closes, topmost first: the picture card ("Set the scene", over everything), a conversation or the first tee's card, the
 *  Help card, the gear menu, Holes > My looks (P23 P1-E), the Event catalogue, the Grass panel, Course stats, the Budget or Bottlenecks card (the
 *  engine's panel), then the cards that stand side by side at the right edge, the outermost (leftmost) first, as they stack
 *  (src/ui/golf/card-stack.ts): your bag or your cards, your profile, the Staff card, the Clubhouse card, the Range card and the event
 *  announcement (T394). A hole card and a place card are the tool's own rung (the engine's escHand) */
export type EscCard = 'scene' | 'talk' | 'help' | 'menu' | 'looks' | 'bunkers' | 'event' | 'grass' | 'stats' | 'panel' | 'bag' | 'cards' | 'player' | 'staff' | 'club' | 'range' | 'eventCard';
export const ESC_CARDS: readonly EscCard[] = ['scene', 'talk', 'help', 'menu', 'looks', 'bunkers', 'event', 'grass', 'stats', 'panel', 'bag', 'cards', 'player', 'staff', 'club', 'range', 'eventCard'];

/** the topmost open menu or card (the one Esc closes first), or null when none is open */
export function topCard(open: Partial<Record<EscCard, boolean>>): EscCard | null {
  return ESC_CARDS.find(c => open[c]) ?? null;
}

/** what the Esc ladder works on (the engine's): the open menus and cards and closing one, the tool's own step (true when it stepped back
 *  one stage or dropped what was in hand), the tool in hand, and putting it down for Select; back, when given, is a right click's own
 *  meaning with a route in hand (it takes back the route's last point, true when it did: the road tool's, since T207) */
export interface EscLadder {
  open(): Partial<Record<EscCard, boolean>>;
  close(c: EscCard): void;
  hand(): boolean;
  tool(): Tool;
  select(): void;
  back?(): boolean;
}
/** the rung one Esc took: a card closed, the tool's own step, out to Select, or nothing (Select with nothing in hand) */
export type EscStep = { card: EscCard } | 'hand' | 'select' | null;

/** one Esc: the topmost menu or card closes; else the tool steps back or drops what is in hand; else a build tool is put down for Select */
export function escapeLadder(l: EscLadder): EscStep {
  const card = topCard(l.open());
  if (card) { l.close(card); return { card }; }
  if (l.hand()) return 'hand';
  if (l.tool() === 'select') return null;
  l.select();
  return 'select';
}

/** the Esc key as a right click hands it to a tool's own step (a stand-in key event: the tools read its key and modifiers only; no DOM) */
export const ESC_KEY = { key: 'Escape', code: 'Escape', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, preventDefault() { /* a click has no key to stop */ }, stopPropagation() { /* none */ } } as unknown as KeyboardEvent;

/** what a right click on the map did: the route's last point taken back, or the step Esc takes (null: nothing; a drag is the pan) */
export type ClickStep = EscStep | 'back';

/** T392 (#1057), T393 (#1060): a right click on the map (pressed and let go without a drag) takes the very step Esc does, through the same
 *  ladder, so every tool and mode that Esc puts down a right click puts down too (Bulldoze, Land for sale, the Event catalogue, House lots,
 *  a real course, the brushes ...). Its own meanings stay first: a route in hand answers by taking back its last point (l.back); a right drag
 *  is the camera's pan and cancels nothing (moved) */
export function rightClickLadder(l: EscLadder, o: { moved?: boolean } = {}): ClickStep {
  if (o.moved) return null;
  if (l.back?.()) return 'back';
  return escapeLadder(l);
}

/** what a number key does (T202, #529; plan P23-UX 6.2 P2-8): 'surface', the course brush's surfaces while the Holes tool is in hand (1-8 in
 *  its panel: paint-tool.ts key takes them first); 'class', the road classes while the town's Build is in hand (1-6, its flyout's classes in
 *  order: network.ts KEY_CLASSES); else 'group', the nth rail group after Select (its flyout opens: App.tsx railKey). Before T202 1-6 picked a
 *  road class and the road tool from any tool. i: the key's index from 0 */
export type NumberKeyUse = { k: 'surface' | 'class' | 'group'; i: number };
export function numberKeyUse(uiTool: Tool, n: number): NumberKeyUse | null {
  if (!(n >= 1 && n <= 9) || !Number.isInteger(n)) return null;
  if (uiTool === 'course') return n <= SURFACE_BRUSHES.length ? { k: 'surface', i: n - 1 } : null; // T222: the seventh surface is the Waste area; T252: the eighth Long grass (no cart path brush)
  if (uiTool === 'road') return n <= 6 ? { k: 'class', i: n - 1 } : null;
  return n <= 6 ? { k: 'group', i: n - 1 } : null;
}
