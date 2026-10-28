// Modes never steal a click; Esc closes menus first (P23 P1-A, T116; docs/plans/P23-UX.md 4.10). Pure: no DOM, no engine.
//
// The side modes (the Grass panel, and the Land, Event and Holes switches) live in Select: opening one switches to Select and closes the
// others, and picking any build tool closes them all, so none of them takes a click from the tool in hand.
// Esc walks a ladder: the topmost menu or card first (Help, the gear menu, the Event catalogue, the Grass panel, Course stats, the Budget or
// Bottlenecks card), then the tool steps back or drops what is in hand (a route, a stroke, an outline, a piece, a selection), then the tool
// is put down for Select.
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

/** the menus and cards Esc closes, topmost first: the Help card, the gear menu, Holes > My looks (P23 P1-E), the Event catalogue, the Grass
 *  panel, Course stats, and the Budget or Bottlenecks card (the engine's panel) */
export type EscCard = 'help' | 'menu' | 'looks' | 'event' | 'grass' | 'stats' | 'panel';
export const ESC_CARDS: readonly EscCard[] = ['help', 'menu', 'looks', 'event', 'grass', 'stats', 'panel'];

/** the topmost open menu or card (the one Esc closes first), or null when none is open */
export function topCard(open: Partial<Record<EscCard, boolean>>): EscCard | null {
  return ESC_CARDS.find(c => open[c]) ?? null;
}

/** what the Esc ladder works on (the engine's): the open menus and cards and closing one, the tool's own step (true when it stepped back
 *  one stage or dropped what was in hand), the tool in hand, and putting it down for Select */
export interface EscLadder {
  open(): Partial<Record<EscCard, boolean>>;
  close(c: EscCard): void;
  hand(): boolean;
  tool(): Tool;
  select(): void;
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
