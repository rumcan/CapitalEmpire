// Help › Keys (T202, #529; plan P23-UX 6.2 P2-8 the keymap): T182 took the key letters off the rail and T193 put the tools in flyout menus, so
// the keys were only in each tooltip; the Keys sheet lists them all in one place, laid out as the menus are: at the top the rail (T250: its two
// drawers, the course drawer and the town footer, each a card; the number
// keys open its groups, Select, Bulldoze) and the keys that work anywhere (Esc, Undo / Redo, Delete, this sheet), then Course and Town with each group's tools (from the rail's own table, rail-items.ts RAIL: one source for the rail,
// the flyouts and this sheet; a tool listed once) and a tool's keys while it is in hand, then the camera, the speed and the views. A locked tool or group is dimmed with its lock's reason. In the lot lab the sheet is the
// lab's keys under their own heading (lot-lab-ui.ts KEYS: the lab's own table). Pure TypeScript, no DOM: KeysSheet.tsx draws it.
import type { Tool } from '../game/types';
import type { ProgressiveUiState } from '../game/ext/progressive-ui';
import { SURFACE_BRUSHES } from '../game/paint';
import { CLASS, KEY_CLASSES } from '../game/network';
import { RAIL, drawerOf, railEntries, toolLock, toolsIn, type RailItem } from './rail-items';

/** a row: its keys (as shown: 'R', 'Ctrl+Z', '1 – 6'), what they do, the tool they pick (a tool key), and why it is locked (null: open) */
export interface KeyRow { keys: string; what: string; tool?: Tool; why?: string | null }
/** the part of the sheet a section sits in: the top (the rail and the keys that work anywhere), under Course or Town (as the rail's headings),
 *  the camera, speed and views, or the lot lab */
export type KeyPart = 'top' | 'course' | 'town' | 'general' | 'lab';
/** a section (a card on the sheet): its title, its part, its rows, and why it is locked (a tool's keys in hand while the tool is locked: the
 *  card is dimmed with the reason once) */
export interface KeySection { id: string; title: string; part: KeyPart; rows: KeyRow[]; why?: string | null }
/** the parts in the sheet's order, with their headings ('' : none) */
export const KEY_PARTS: readonly { part: KeyPart; heading: string }[] = [
  { part: 'top', heading: '' }, { part: 'course', heading: 'Course' }, { part: 'town', heading: 'Town' }, { part: 'general', heading: 'Camera, speed and views' }, { part: 'lab', heading: 'Lot lab' },
];

/** the groups the number keys open (1 the first): the rail's groups a game shows after Select, in the rail's order (railEntries): the Course
 *  groups, the Town groups, Bulldoze. T250 split the rail into the course drawer and the town footer and kept the numbers as they were (the
 *  course drawer's 1-3 and Bulldoze's 6, the footer's 4 and 5 with a driving range) */
export function numberedGroups(golf: boolean, range: boolean): RailItem[] {
  return railEntries(null, golf, 'select', { range }).map(e => e.item).filter(r => r.id !== 'select').slice(0, 6);
}
/** a group with one tool and no card (Bulldoze): its number picks the tool, no flyout */
const menuless = (r: RailItem): boolean => !r.action && r.tools.length === 1;

/** a tool's keys while it is in hand (the engine's and the tools' own handlers: engine.ts keyDown, paint-tool.ts key, propstool.ts key,
 *  parking-tool.ts key); the number keys' rows come from the lists they pick from */
const inHand = (): { title: string; tool: Tool; alt?: true; rows: [string, string][] }[] => [
  { title: 'Holes in hand', tool: 'course', rows: [
    [`1 – ${SURFACE_BRUSHES.length}`, `the surface: ${SURFACE_BRUSHES.map(b => b.name.toLowerCase()).join(', ')}`], ['[ / ]', 'a smaller / bigger brush or green'],
    ['R', 'turn the stamp, the hole or the green'], ['Enter', 'finish the shape or the run'], ['Backspace', 'take back the last corner'],
    ['PageUp / PageDown', 'the picked area up / down a layer']] },
  // T206: Facilities ▸ Practice (golf/practicetool.ts key) and Facilities ▸ Plants (the Paint tool's plant brush: paint-tool.ts key)
  { title: 'Practice in hand', tool: 'practice', rows: [['[ / ]', 'a smaller / bigger facility (never under what opens it)'], ['R', 'turn it'], ['Tab / Shift+Tab', 'the putting green\'s next / previous outline'], ['Click', 'build it (its price shows first)']] },
  { title: 'Plants in hand', tool: 'paint', alt: true, rows: [['Drag', 'plant trees, bushes or flowers'], ['Alt + drag', 'remove what the plant brush planted'], ['[ / ]', 'a smaller / bigger brush']] },
  { title: 'Props in hand', tool: 'props', rows: [['R', 'turn it'], ['Delete', 'sell the picked prop']] },
  { title: 'Roads and paths in hand', tool: 'road', rows: [
    [`1 – ${KEY_CLASSES.length}`, `the road class: ${KEY_CLASSES.map(c => (CLASS[c]?.name ?? c).toLowerCase()).join(', ')}`],
    ['Tab / Shift+Tab', 'the next / previous kind of this class (one-way, trees, a median)'], ['Q', 'bends of 90° or 45°'], ['E', 'Replace: the roads in the way are bulldozed'],
    ['Shift', 'a straight run'], ['Enter, double-click', 'build the route'], ['Backspace, right-click', 'take back the last point (the first: drop the route)']] },
  { title: 'Junctions in hand', tool: 'junction', rows: [['Tab / Shift+Tab', 'the next / previous type of the junction under the pointer']] },
  { title: 'Car park in hand', tool: 'park', rows: [['Tab', 'the rows\' other side']] },
  { title: 'Toll gate in hand', tool: 'toll', rows: [['R', 'turn the gate round']] },
  { title: 'Paint in hand', tool: 'paint', rows: [['Tab', 'Draw, Pick and Erase in turn'], ['[ / ]', 'a smaller / bigger brush'], ['Enter', 'close the outline'], ['Backspace', 'take back the last corner'], ['PageUp / PageDown', 'the picked area up / down a layer']] },
  { title: 'Buildings in hand', tool: 'business', rows: [['R', 'turn it']] },
];
/** the keys that work anywhere (the top), the camera, the speed and the views */
const general = (): { id: string; title: string; rows: [string, string][] }[] => [
  { id: 'anywhere', title: 'Anywhere', rows: [['Esc', 'close the top card or menu, then put down what is in hand, then back to Select'], ['Ctrl+Z / Ctrl+Y', 'undo / redo (the course, the paint, the props)'], ['Delete', 'remove or sell what is picked'], ['? / F1', 'these keys']] },
  { id: 'camera', title: 'Camera', rows: [['W A S D, arrows', 'pan'], ['Space + drag, right drag', 'pan'], ['+ / −, the wheel', 'zoom in / out']] },
  { id: 'speed', title: 'Speed', rows: [['Space (tap)', 'pause / go on'], [', / .', 'slower / faster'], ['H', 'skip to the next rush hour']] },
  { id: 'views', title: 'Views and panels', rows: [['G', 'the grid'], ['F', 'traffic flow and the junctions\' service'], ['B', 'the worst bottlenecks'], ['L', 'the lanes'], ['K', 'the lots'], ['O', 'the access paths']] },
];

/** the lot lab's key table (lot-lab-ui.ts KEYS: [section, [keys, what][]][]) */
export type LabKeys = readonly (readonly [string, readonly (readonly [string, string])[]])[];

/** the Keys sheet: in the game, the rail (the number keys, Select, Bulldoze) and the keys that work anywhere, each group's tools under Course and Town (in the rail's order, a
 *  tool listed once: the Props tool sits in both decorations) with the tools' keys in hand after them, and the camera, speed and views; in the lot lab
 *  (lab given), the lab's own keys alone. ui: the unlocks in force (golf), null for every tool open */
export function keySheet(o: { golf: boolean; ui: ProgressiveUiState | null; range: boolean; lab?: LabKeys | null }): KeySection[] {
  if (o.lab) return o.lab.map(([title, rows]) => ({ id: `lab:${title}`, title, part: 'lab' as const, rows: rows.map(([k, w]) => ({ keys: k, what: w })) }));
  const out: KeySection[] = [], seen = new Set<Tool>(), ui = o.golf ? o.ui : null, game = o.golf ? 'golf' : 'classic';
  const locks = new Map(railEntries(ui, o.golf, 'select', { range: o.range }).map(e => [e.item.id, e.locked]));
  const toolRow = (t: { id: Tool; key: string; label: string }, label = t.label): KeyRow => ({ keys: t.key, what: label, tool: t.id, why: toolLock(ui, t.id) });
  // T250: the two drawers, as laid out: the course drawer (Select, its numbered groups top to bottom, Bulldoze's key) and the town footer (its
  // numbered groups left to right); a group's number is numberedGroups'
  const sel = RAIL.find(r => r.id === 'select')!.tools[0]!, groups = numberedGroups(o.golf, o.range), side: KeyRow[] = [toolRow(sel, 'Select')], foot: KeyRow[] = [];
  seen.add(sel.id);
  for (const r of groups) (drawerOf(r) === 'footer' ? foot : side).push({ keys: String(groups.indexOf(r) + 1), what: menuless(r) ? r.label : `the ${r.label} menu`, why: locks.get(r.id) ?? null });
  for (const r of RAIL) if (r.section === null && r.id !== 'select' && (!r.only || r.only === game)) for (const t of toolsIn(r, o.golf)) if (t.key && !seen.has(t.id)) { seen.add(t.id); side.push(toolRow(t)); }
  out.push({ id: 'drawer', title: 'The course drawer (left)', part: 'top', rows: side }, { id: 'footer', title: 'The town footer (bottom)', part: 'top', rows: foot });
  // Course and Town: each group's tools with a key, then the keys of their tools in hand
  const shown = new Set<Tool>(), held = new Set<string>();
  for (const part of ['course', 'town'] as const) {
    for (const r of RAIL) {
      if (r.section !== part || (r.only && r.only !== game) || (r.action === 'range' && !o.range)) continue;
      const rows: KeyRow[] = [];
      for (const t of toolsIn(r, o.golf)) {
        shown.add(t.id);
        if (!t.key || seen.has(t.id)) continue;
        seen.add(t.id); rows.push(toolRow(t, t.id === 'road' ? 'Roads (Build)' : t.label));
      }
      if (rows.length) out.push({ id: r.id, title: r.label, part, rows });
    }
    for (const s of inHand()) {
      // a tool's second home (alt: Facilities' Plants, the Paint tool's plant brush) has its own keys in hand there
      const r = RAIL.find(x => x.section === part && (!x.only || x.only === game) && toolsIn(x, o.golf).some(t => t.id === s.tool && !!t.alt === !!s.alt));
      // a tool in two groups (Props: Facilities and Town decoration) has its keys in hand once, under the first
      const hk = `${s.tool}${s.alt ? ':alt' : ''}`;
      if (!r || !shown.has(s.tool) || held.has(hk)) continue;
      held.add(hk);
      out.push({ id: `in:${hk}`, title: s.title, part, rows: s.rows.map(([k, w]) => ({ keys: k, what: w })), why: toolLock(ui, s.tool) });
    }
  }
  for (const s of general()) {
    const sec: KeySection = { id: s.id, title: s.title, part: s.id === 'anywhere' ? 'top' : 'general', rows: s.rows.map(([k, w]) => ({ keys: k, what: w })) };
    if (sec.part === 'top') out.splice(2, 0, sec); else out.push(sec); // after the two drawers' cards
  }
  return out;
}
