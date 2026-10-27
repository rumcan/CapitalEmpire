// The rail (plan P23 4.2, P1-E): Select · Course: Holes, Paths, Buildings, Props (T131) · Town: Roads, Junctions, Transport · Paint · Bulldoze. The same
// places from minute zero: a tool the stage has not opened stays in place, dimmed, with what unlocks it, and a tool opened past stage 1 carries
// a NEW badge until it is first opened (the seen ids are T117's, saved in golf.progress). Pure TypeScript, no DOM (the rail's buttons are
// Rail.tsx); the icon names are types only.
import type { Tool } from '../game/types';
import type { ProgressiveUiState, RailGroupId } from '../game/ext/progressive-ui';
import type { IconName } from './Icon';
import type { TipParts } from './tip';

/** a tool in a rail item: the segmented row at the top of its panel when the item has more than one */
export interface RailTool { id: Tool; label: string; key: string; icon: IconName }
/** a rail item: its label, icon and key letter, the heading it sits under, its progressive-ui group, its tools (the first is the one a click
 *  opens), and the games it shows in (golf games have Buildings, the classic town game the Business tool) */
export interface RailItem {
  id: string; label: string; icon: IconName; key: string; section: 'course' | 'town' | null; group: RailGroupId; tools: RailTool[];
  only?: 'golf' | 'classic';
}

/** the rail in order (P23 4.2: today's keys stay, decision 1) */
export const RAIL: readonly RailItem[] = [
  { id: 'select', label: 'Select', icon: 'compass', key: 'V', section: null, group: 'select', tools: [{ id: 'select', label: 'Select / Pan', key: 'V', icon: 'compass' }] },
  { id: 'holes', label: 'Holes', icon: 'trophy', key: 'C', section: 'course', group: 'course', tools: [{ id: 'course', label: 'Holes', key: 'C', icon: 'trophy' }] },
  { id: 'paths', label: 'Paths', icon: 'sidewalk', key: '', section: 'course', group: 'course', tools: [{ id: 'path', label: 'Paths', key: '', icon: 'sidewalk' }] },
  { id: 'buildings', label: 'Buildings', icon: 'house', key: '', section: 'course', group: 'course', tools: [{ id: 'buildings', label: 'Buildings', key: '', icon: 'house' }], only: 'golf' },
  { id: 'props', label: 'Props', icon: 'leaf', key: 'Z', section: 'course', group: 'course', tools: [{ id: 'props', label: 'Props', key: 'Z', icon: 'leaf' }], only: 'golf' },
  // Greenkeeping (plan P23-UX P2-5, T175): the Grass panel as a tool, its care armed like a brush; it opens with the first grown hole (no key:
  // every free letter is taken)
  { id: 'greenkeeping', label: 'Greenkeeping', icon: 'trees', key: '', section: 'course', group: 'course', tools: [{ id: 'greenkeeping', label: 'Greenkeeping', key: '', icon: 'trees' }], only: 'golf' },
  { id: 'roads', label: 'Roads', icon: 'road', key: 'R', section: 'town', group: 'roads', tools: [
    { id: 'road', label: 'Build', key: 'R', icon: 'road' },
    { id: 'lane', label: 'Upgrade', key: 'N', icon: 'up' },
    { id: 'downgrade', label: 'Downgrade', key: 'Y', icon: 'down' },
  ] },
  { id: 'junction', label: 'Junctions', icon: 'junction', key: 'J', section: 'town', group: 'junction', tools: [{ id: 'junction', label: 'Junctions', key: 'J', icon: 'junction' }] },
  { id: 'transport', label: 'Transport', icon: 'bus', key: '', section: 'town', group: 'transport', tools: [
    { id: 'bus', label: 'Bus route', key: 'U', icon: 'bus' },
    { id: 'park', label: 'Car park', key: 'P', icon: 'pin' },
    { id: 'toll', label: 'Toll gate', key: 'T', icon: 'swap' },
  ] },
  { id: 'business', label: 'Buildings', icon: 'buildings', key: 'M', section: 'town', group: 'business', tools: [{ id: 'business', label: 'Business', key: 'M', icon: 'buildings' }], only: 'classic' },
  { id: 'paint', label: 'Paint', icon: 'terrain', key: 'A', section: null, group: 'paint', tools: [{ id: 'paint', label: 'Paint', key: 'A', icon: 'terrain' }] },
  { id: 'bulldoze', label: 'Bulldoze', icon: 'bulldozer', key: 'X', section: null, group: 'bulldoze', tools: [{ id: 'bulldoze', label: 'Bulldoze', key: 'X', icon: 'bulldozer' }] },
];

/** the rail item a tool sits in (the menus' tool: Engine.uiTool), or undefined */
export const railItemOf = (t: Tool): RailItem | undefined => RAIL.find(r => r.tools.some(x => x.id === t));

/** a rail item as the rail draws it: on (its tool is in hand), locked (why: the tooltip's "Unlocks with …", null when open) and NEW */
export interface RailEntry { item: RailItem; on: boolean; locked: string | null; isNew: boolean; heading: 'course' | 'town' | null }

/** the id that carries an item's NEW badge: a one-tool item its tool, a group of tools its group (opening any of them clears it) */
const badgeId = (r: RailItem) => (r.tools.length > 1 ? r.group : r.tools[0]!.id);

/** a tool's lock reason under the unlocks (null: open, or no unlocks in force) */
export function toolLock(ui: ProgressiveUiState | null, t: Tool): string | null {
  return ui?.lockedTools.find(x => x.id === t)?.why ?? null;
}
/** whether a tool carries a NEW badge (open past stage 1 and not opened yet) */
export const toolNew = (ui: ProgressiveUiState | null, t: Tool): boolean => !!ui && (ui.newTools as string[]).includes(t);

/** the rail for a game: golf (with the unlocks in force, or null for every tool) or the classic town game, and the tool in hand. Every item
 *  of the game is listed, in the rail's order, whatever the stage: a locked one carries its why, and the first item under a heading carries it */
export function railEntries(ui: ProgressiveUiState | null, golf: boolean, uiTool: Tool): RailEntry[] {
  const out: RailEntry[] = [];
  let last: RailItem['section'] = null;
  for (const r of RAIL) {
    if (r.only && r.only !== (golf ? 'golf' : 'classic')) continue;
    const locked = golf && ui && r.tools.every(t => toolLock(ui, t.id)) ? toolLock(ui, r.tools[0]!.id) : null;
    const id = badgeId(r), isNew = golf && !!ui && !locked && ((ui.newGroups as string[]).includes(id) || (ui.newTools as string[]).includes(id));
    out.push({ item: r, on: r.tools.some(t => t.id === uiTool), locked, isNew, heading: r.section !== last ? r.section : null });
    last = r.section;
  }
  return out;
}

/** a rail item's tooltip (T179): its name, its key (if it has one) and, locked, what unlocks it (the stages' and the ramp's words) */
export function railTip(e: RailEntry): TipParts {
  return { name: e.item.label, ...(e.item.key ? { key: e.item.key } : {}), ...(e.locked ? { why: e.locked } : {}) };
}
