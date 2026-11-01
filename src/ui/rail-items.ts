// The rail (plan P23 4.2, P1-E; regrouped by T182, #454, the owner 2026-10-27: "First under Course should be grouped seperate, Driving range and
// its upgrades ... then course where all the golf course shit is like building club house and halfway house and holes and the tournament stuff.
// then there should be a decoration place ... Then in the main menu you have Town, under town you will have Traffic and Town Decoration"):
//   Select · COURSE: Driving range, Course, Facilities · TOWN: Traffic, Town decoration · Bulldoze.
// T206 (#540, the owner 2026-10-27: "the practice areas have their own building tools under facilities when you should also move Decoration under
// facilities from the main menu"; "cart paths and roads should be next to buildings in the menu, just below it"; "these are roads for on you
// property"): Facilities takes Decoration's place (Practice, Plants, Decoration's Props); the Paths tool moves into Course as Cart paths & roads,
// directly below Buildings. Town roads stay in Traffic.
// Each group is one rail item; its panel shows its tools in a row at the top (in sections where a group has several kinds: Traffic's Roads,
// Junctions and Transport). The tools move in whole; nothing is removed. Props sits in both decorations (the same tool, the group the player
// opened it from is the one lit). The same places from minute zero: a group whose every tool is locked stays in place, dimmed, with what unlocks
// it; a locked tool inside an open group stays in its row, dimmed, with its lock and why; NEW marks a group with a tool opened past stage 1 until
// one of them is opened (the seen ids are T117's, saved in golf.progress: the tools' ids, so old saves keep theirs). No key letters on
// the rail (the owner: "also remove the shortcut key indicators"): the keys still work and the tooltip names them. Pure TypeScript, no DOM (the
// rail's buttons are Rail.tsx, the tool row App.tsx); the icon names are types only.
import type { Tool } from '../game/types';
import { CHIP_STAGE, NEW_BADGE_IDS, STAGE_WHY, type GolfChipId, type ProgressiveUiState, type RailGroupId } from '../game/ext/progressive-ui';
import type { IconName } from './Icon';
import type { TipParts } from './tip';
import { GREENKEEPING } from '../game/features';

/** a tool in a rail item: its button in the row at the top of the item's panel; sub: the section it sits in (Traffic's Roads, Junctions,
 *  Transport); only: the game it shows in */
export interface RailTool { id: Tool; label: string; key: string; icon: IconName; sub?: string; only?: 'golf' | 'classic'; /** T187: the Props tool's view this entry opens (its place and group) */ view?: PropsView; /** T206: a second home of a tool (Facilities' Plants, the Paint tool's plant brush): the item lit only when opened from there */ alt?: true }
/** the Props tool's view (T187): where it places (Decoration the course, Town decoration the town) and the group it opens on */
export interface PropsView { where: 'course' | 'town'; group?: 'buildings' }
/** an entry's key in its item (the Props tool sits twice in Town decoration: its props and its buildings) */
export const entryKey = (t: RailTool): string => (t.view ? `${t.id}:${t.view.where}:${t.view.group ?? ''}` : t.id);
/** a button in an item's row that is no tool: the Tournament (the Event catalogue, a side mode with a top-bar chip of its own) */
export interface RailExtra { id: GolfChipId; label: string; icon: IconName }
/** a rail item: its label, icon and key (named in the tooltip, never drawn on the rail), the heading it sits under, its progressive-ui group (the
 *  NEW badge's id), its tools (the first open one is what a click opens), its extras, the games it shows in, and its action: 'range' opens the
 *  range card (the range's buildings, practice facilities and upgrades), shown only in a game with a range */
export interface RailItem {
  id: string; label: string; icon: IconName; key: string; section: 'course' | 'town' | null; group: RailGroupId; tools: RailTool[];
  extras?: RailExtra[]; only?: 'golf' | 'classic'; action?: 'range';
}

/** the rail in order (the keys stay the tools' own: C Holes, Z Props, R roads, J junctions, U P T transport, A Paint, X Bulldoze, V Select) */
export const RAIL: readonly RailItem[] = [
  { id: 'select', label: 'Select', icon: 'compass', key: 'V', section: null, group: 'select', tools: [{ id: 'select', label: 'Select / Pan', key: 'V', icon: 'compass' }] },
  // COURSE
  { id: 'range', label: 'Range', icon: 'pin', key: '', section: 'course', group: 'course', tools: [{ id: 'select', label: 'Range card', key: '', icon: 'pin' }], only: 'golf', action: 'range' },
  { id: 'course', label: 'Course', icon: 'trophy', key: 'C', section: 'course', group: 'course', tools: [
    { id: 'course', label: 'Holes', key: 'C', icon: 'trophy' },
    { id: 'buildings', label: 'Buildings', key: '', icon: 'house', only: 'golf' },
    // T206: the roads on the player's own property (the course's cart paths and drives: the road tool on the course, T084), below Buildings
    { id: 'path', label: 'Cart paths & roads', key: '', icon: 'sidewalk' },
    // Greenkeeping (plan P23-UX P2-5, T175): the Grass panel as a tool, its care armed like a brush; it opens with the first grown hole
    ...(GREENKEEPING ? [{ id: 'greenkeeping' as const, label: 'Greenkeeping', key: '', icon: 'trees' as const, only: 'golf' as const }] : []), // hidden for now (features.ts)
  ], extras: [{ id: 'event', label: 'Tournament', icon: 'calendar' }, { id: 'land', label: 'Land for sale', icon: 'terrain' }] },
  // T206: the practice facilities' own building tools, the plant brush (Town decoration's, on the course side too) and Decoration's Props
  { id: 'facilities', label: 'Facilities', icon: 'leaf', key: 'Z', section: 'course', group: 'course', only: 'golf', tools: [
    { id: 'practice', label: 'Practice', key: '', icon: 'pin', only: 'golf', sub: 'Practice' },
    { id: 'paint', label: 'Plants', key: '', icon: 'trees', only: 'golf', sub: 'Plants', alt: true },
    { id: 'props', label: 'Props', key: 'Z', icon: 'leaf', only: 'golf', view: { where: 'course' }, sub: 'Decoration' },
  ] },
  // TOWN
  // the owner, 2026-11-01: "move ground height to its own button in bottom right menu next to traffic": the height brush (the Course tool's
  // Ground height: Raise, Lower, Smooth, Flatten) as a group of its own in the town footer; a click takes it in hand, no flyout
  { id: 'ground', label: 'Ground height', icon: 'up', key: '', section: 'town', group: 'paint', only: 'golf', tools: [{ id: 'course', label: 'Ground height', key: '', icon: 'up', only: 'golf', alt: true }] },
  { id: 'traffic', label: 'Traffic', icon: 'road', key: 'R', section: 'town', group: 'roads', tools: [
    { id: 'road', label: 'Build', key: 'R', icon: 'road', sub: 'Roads' },
    { id: 'lane', label: 'Upgrade', key: 'N', icon: 'up', sub: 'Roads' },
    { id: 'downgrade', label: 'Downgrade', key: 'Y', icon: 'down', sub: 'Roads' },
    { id: 'junction', label: 'Junctions', key: 'J', icon: 'junction', sub: 'Junctions' },
    { id: 'bus', label: 'Bus route', key: 'U', icon: 'bus', sub: 'Transport' },
    { id: 'park', label: 'Car park', key: 'P', icon: 'pin', sub: 'Transport' },
    { id: 'toll', label: 'Toll gate', key: 'T', icon: 'swap', sub: 'Transport' },
  ] },
  { id: 'towndecor', label: 'Town decoration', icon: 'terrain', key: 'A', section: 'town', group: 'paint', tools: [
    { id: 'paint', label: 'Paint', key: 'A', icon: 'terrain' },
    { id: 'props', label: 'Props', key: 'Z', icon: 'leaf', only: 'golf', view: { where: 'town' } },
    // the few buildings the player adds to the town: a golf game's from the Props tool's Buildings (T187: decor.ts, the library's art); the
    // classic game's Business tool
    { id: 'props', label: 'Buildings', key: '', icon: 'buildings', only: 'golf', view: { where: 'town', group: 'buildings' } },
    { id: 'business', label: 'Buildings', key: 'M', icon: 'buildings', only: 'classic' },
  ] },
  { id: 'bulldoze', label: 'Bulldoze', icon: 'bulldozer', key: 'X', section: null, group: 'bulldoze', tools: [{ id: 'bulldoze', label: 'Bulldoze', key: 'X', icon: 'bulldozer' }] },
];

/** the rail items a tool sits in (Props: Facilities and Town decoration; Paint: Town decoration, and Facilities' Plants) */
export const railItemsOf = (t: Tool): RailItem[] => RAIL.filter(r => !r.action && r.tools.some(x => x.id === t));
/** the rail item a tool sits in (the menus' tool: Engine.uiTool): the one the player opened it from when that holds it (active), else its first
 *  that is not a second home (alt), else its first */
export const railItemOf = (t: Tool, active?: string | null): RailItem | undefined => {
  const all = railItemsOf(t); return all.find(r => r.id === active) ?? all.find(r => !r.tools.find(x => x.id === t)!.alt) ?? all[0];
};
/** an item's tools in a game (golf or the classic town game) */
export const toolsIn = (r: RailItem, golf: boolean): RailTool[] => r.tools.filter(t => !t.only || t.only === (golf ? 'golf' : 'classic'));

/** a rail item as the rail draws it: on (its tool is in hand, or its card is open), locked (why: the tooltip's "Unlocks with …", null when open)
 *  and NEW */
export interface RailEntry { item: RailItem; on: boolean; locked: string | null; isNew: boolean; heading: 'course' | 'town' | null }

/** a tool's lock reason under the unlocks (null: open, or no unlocks in force) */
export function toolLock(ui: ProgressiveUiState | null, t: Tool): string | null {
  return ui?.lockedTools.find(x => x.id === t)?.why ?? null;
}
/** an extra's lock reason: its top-bar chip not shown yet (the stage that shows it), null when open */
export function extraLock(ui: ProgressiveUiState | null, x: RailExtra): string | null {
  if (!ui || (ui.visibleGolfChips as string[]).includes(x.id)) return null;
  return ui.chipLocks?.[x.id as GolfChipId] ?? (STAGE_WHY[CHIP_STAGE[x.id]] || 'Not open yet');
}
/** whether a tool carries a NEW badge (open past stage 1 and not opened yet) */
export const toolNew = (ui: ProgressiveUiState | null, t: Tool): boolean => !!ui && (ui.newTools as string[]).includes(t);

/** what the rail reads besides the unlocks: the item the player opened (it is the one lit when the tool in hand sits in two), whether the game
 *  has a driving range and whether its card is open */
export interface RailView { active?: string | null; range?: boolean; rangeOpen?: boolean }

/** the rail for a game: golf (with the unlocks in force, or null for every tool) or the classic town game, and the tool in hand. Every item
 *  of the game is listed, in the rail's order, whatever the stage: a locked one carries its why, and the first item under a heading carries it */
export function railEntries(ui: ProgressiveUiState | null, golf: boolean, uiTool: Tool, v: RailView = {}): RailEntry[] {
  const out: RailEntry[] = [], lit = v.rangeOpen ? null : railItemOf(uiTool, v.active);
  let last: RailItem['section'] = null;
  for (const r of RAIL) {
    if (r.only && r.only !== (golf ? 'golf' : 'classic')) continue;
    if (r.action === 'range' && !v.range) continue;
    const tools = toolsIn(r, golf);
    if (!tools.length) continue;
    const locked = golf && ui && !r.action && tools.every(t => toolLock(ui, t.id)) ? toolLock(ui, tools.find(t => toolLock(ui, t.id))!.id) : null;
    // NEW: a tool of the group is new and none of its badged tools has been opened yet (opening one clears the group's badge; the row keeps the
    // others' own badges until they are opened)
    const newT = (t: RailTool) => (ui!.newTools as string[]).includes(t.id), opened = (t: RailTool) => NEW_BADGE_IDS.includes(t.id) && !newT(t) && !toolLock(ui, t.id);
    const isNew = golf && !!ui && !locked && !r.action && tools.some(newT) && !tools.some(opened);
    const on = r.action === 'range' ? !!v.rangeOpen : lit === r;
    out.push({ item: r, on, locked, isNew, heading: r.section !== last ? r.section : null });
    last = r.section;
  }
  return out;
}

/** T250 (#721, the owner 2026-10-28: "lets have course on the left drawer and have a new footer drawer for town"): the two drawers the rail is
 *  split into: the course drawer on the left (Select, the COURSE groups, Bulldoze) and the town footer along the bottom (the TOWN groups).
 *  The groups, their tools and their order in RAIL are unchanged; a group's drawer is its section's */
export type Drawer = 'side' | 'footer';
export const drawerOf = (r: RailItem): Drawer => (r.section === 'town' ? 'footer' : 'side');
/** a drawer's entries, in the rail's order (railEntries' headings hold: each drawer's first item under a heading carries it) */
export const drawerEntries = (es: readonly RailEntry[], d: Drawer): RailEntry[] => es.filter(e => drawerOf(e.item) === d);
/** T255 (#739, the owner 2026-10-29: "these windows need to move to the center footer where town moved to"): the drawer a tool's panel stands
 *  in: its group's (railItemOf: the one the player opened it from when that holds it, the rail's lit group), so a town tool's panel docks above
 *  the town footer and a club tool's keeps the left tool panel; Paint and Props, in both, follow the group they were opened from */
export const toolDrawer = (t: Tool, active?: string | null): Drawer => { const r = railItemOf(t, active); return r ? drawerOf(r) : 'side'; };

/** a rail item's tooltip (T179): its name, its key (if it has one) and, locked, what unlocks it (the stages' and the ramp's words) */
export function railTip(e: RailEntry): TipParts {
  return { name: e.item.label, ...(e.item.key ? { key: e.item.key } : {}), ...(e.locked ? { why: e.locked } : {}) };
}
/** the entry a click on an item opens: the last one used there if it is still open (by its entryKey, or its tool), else its first open one
 *  (null: every tool locked) */
export function pickEntry(r: RailItem, golf: boolean, ui: ProgressiveUiState | null, last?: string | null): RailTool | null {
  const open = toolsIn(r, golf).filter(t => !toolLock(ui, t.id));
  return (last ? open.find(t => entryKey(t) === last) ?? open.find(t => t.id === last) : undefined) ?? open[0] ?? null;
}
/** the tool a click on an item opens (pickEntry's) */
export function pickTool(r: RailItem, golf: boolean, ui: ProgressiveUiState | null, lastUsed?: Tool | null): Tool | null {
  return pickEntry(r, golf, ui, lastUsed)?.id ?? null;
}
/** an item's tools in sections, in order (Traffic: Roads, Junctions, Transport; others one unnamed section) */
export function toolSections(r: RailItem, golf: boolean): { sub: string; tools: RailTool[] }[] {
  const out: { sub: string; tools: RailTool[] }[] = [];
  for (const t of toolsIn(r, golf)) { const s = t.sub ?? ''; const last = out[out.length - 1]; if (last && last.sub === s) last.tools.push(t); else out.push({ sub: s, tools: [t] }); }
  return out;
}
