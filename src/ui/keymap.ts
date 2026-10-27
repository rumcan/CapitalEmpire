// Help › Keys (T202, #529; plan P23-UX 6.2 P2-8 the keymap): T182 took the key letters off the rail and T193 put the tools in flyout menus, so
// the keys are only in each tooltip; the Keys sheet lists them all in one place, laid out as the menus are: the number keys and each group's
// tools (from the rail's own table, rail-items.ts RAIL: one source for the rail, the flyouts and this sheet), a tool's keys while it is in
// hand, the camera, the speed, the views, and the keys that work anywhere (Esc, Undo / Redo, Delete, this sheet); the lot lab's keys under
// their own heading in the lab. A locked tool is dimmed with its lock's reason. Pure TypeScript, no DOM: KeysSheet.tsx draws it.
import type { Tool } from '../game/types';
import type { ProgressiveUiState } from '../game/ext/progressive-ui';
import { RAIL, toolLock, toolsIn, type RailItem } from './rail-items';

/** a row: its keys (as shown: 'R', 'Ctrl+Z', '1 – 6'), what they do, the tool they pick (a tool key), and why that tool is locked (null: open) */
export interface KeyRow { keys: string; what: string; tool?: Tool; why?: string | null }
/** a section: its title, the rail heading it sits under (Course, Town; null: the general keys), and its rows */
export interface KeySection { id: string; title: string; heading: 'course' | 'town' | 'general' | 'lab'; rows: KeyRow[] }

/** the number keys pick the rail's groups in order (Select has V): the groups a game shows, after Select (rail-items.ts railEntries' order) */
export function numberedGroups(golf: boolean, range: boolean): RailItem[] {
  return RAIL.filter(r => r.id !== 'select' && (!r.only || r.only === (golf ? 'golf' : 'classic')) && (r.action !== 'range' || range) && toolsIn(r, golf).length > 0).slice(0, 6);
}

/** a tool's keys while it is in hand (the engine's and the tools' own handlers: engine.ts keyDown, paint-tool.ts key, propstool.ts key) */
const IN_TOOL: { title: string; tools: Tool[]; rows: [string, string][] }[] = [
  { title: 'Roads (in hand)', tools: ['road'], rows: [['1 – 6', 'the road class: gravel, lane, street, road, avenue, boulevard'], ['Tab / Shift+Tab', 'the next / previous kind of this class (one-way, trees, a median)'], ['Q', 'bends of 90° or 45°'], ['E', 'Replace: the roads in the way are bulldozed'], ['Shift', 'a straight run'], ['Enter', 'build the route'], ['Backspace', 'take back the last point']] },
  { title: 'Junctions (in hand)', tools: ['junction'], rows: [['Tab / Shift+Tab', 'the next / previous type of the junction under the pointer']] },
  { title: 'Holes (in hand)', tools: ['course'], rows: [['1 – 7', 'the surface: fairway, green, tee, rough, bunker, water, cart path'], ['[ / ]', 'a smaller / bigger brush'], ['R', 'turn the stamp or the hole'], ['Enter', 'finish the shape or the run'], ['Backspace', 'take back the last corner'], ['Ctrl+Z / Ctrl+Y', 'undo / redo on the course']] },
  { title: 'Paint (in hand)', tools: ['paint'], rows: [['Tab', 'Draw, Pick and Erase in turn'], ['[ / ]', 'a smaller / bigger brush'], ['Enter', 'close the outline'], ['PageUp / PageDown', 'the picked area up / down a layer']] },
  { title: 'Props and buildings (in hand)', tools: ['props', 'business'], rows: [['R', 'turn it'], ['Delete', 'sell the picked prop']] },
  { title: 'Toll gate (in hand)', tools: ['toll'], rows: [['R', 'turn the gate round']] },
];
/** the camera, the speed, the views and the keys that work anywhere */
const GENERAL: { id: string; title: string; rows: [string, string][] }[] = [
  { id: 'camera', title: 'Camera', rows: [['W A S D / arrows', 'pan'], ['Space + drag, right drag', 'pan'], ['+ / −, the wheel', 'zoom in / out']] },
  { id: 'speed', title: 'Speed', rows: [['Space (tap)', 'pause / go on'], [', / .', 'slower / faster (1×, 2×, 4×, 8×, 20×)'], ['H', 'skip to the next rush hour']] },
  { id: 'views', title: 'Views', rows: [['G', 'the grid'], ['F', 'traffic flow and the junctions\' service'], ['B', 'the worst bottlenecks'], ['L', 'the lanes'], ['K', 'the lots'], ['O', 'the access paths']] },
  { id: 'anywhere', title: 'Anywhere', rows: [['Esc', 'close the top card or menu, then put down what is in hand, then back to Select'], ['Ctrl+Z / Ctrl+Y', 'undo / redo (the course and the lot lab)'], ['Delete', 'remove what is picked'], ['? / F1', 'these keys']] },
];

/** the Keys sheet: the number keys and each group with its tools' keys (in the rail's order, a tool listed once: the Props tool sits in both
 *  decorations), the tools' keys in hand, the general keys, and the lot lab's sections when given */
export function keySheet(o: { golf: boolean; ui: ProgressiveUiState | null; range: boolean; lab?: readonly [string, readonly [string, string][]][] }): KeySection[] {
  const out: KeySection[] = [], seen = new Set<string>(), groups = numberedGroups(o.golf, o.range);
  out.push({ id: 'groups', title: 'The menus', heading: 'general', rows: [
    ...groups.map((r, i) => ({ keys: String(i + 1), what: r.tools.length === 1 && !r.action && r.id === 'bulldoze' ? r.label : `${r.label}: open its menu` })),
    { keys: 'V', what: 'Select', tool: 'select' as Tool },
  ] });
  seen.add('select');
  for (const r of RAIL) {
    if ((r.only && r.only !== (o.golf ? 'golf' : 'classic')) || (r.action === 'range' && !o.range) || r.id === 'select') continue;
    const rows: KeyRow[] = [];
    for (const t of toolsIn(r, o.golf)) {
      if (!t.key || seen.has(`${t.id}:${t.key}`)) continue;
      seen.add(`${t.id}:${t.key}`);
      rows.push({ keys: t.key, what: t.label === 'Build' ? 'Roads' : t.label, tool: t.id, why: o.golf ? toolLock(o.ui, t.id) : null });
    }
    if (rows.length) out.push({ id: r.id, title: r.label, heading: r.section ?? 'general', rows });
  }
  const has = new Set(RAIL.flatMap(r => toolsIn(r, o.golf).map(t => t.id)));
  for (const s of IN_TOOL) if (s.tools.some(t => has.has(t))) out.push({ id: `in:${s.tools[0]}`, title: s.title, heading: 'general', rows: s.rows.map(([k, w]) => ({ keys: k, what: w })) });
  for (const s of GENERAL) out.push({ id: s.id, title: s.title, heading: 'general', rows: s.rows.map(([k, w]) => ({ keys: k, what: w })) });
  for (const [title, rows] of o.lab ?? []) out.push({ id: `lab:${title}`, title, heading: 'lab', rows: rows.map(([k, w]) => ({ keys: k, what: w })) });
  return out;
}
