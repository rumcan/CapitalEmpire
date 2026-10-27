// The toolbar's flyout menus (T193, #502; the owner 2026-10-27 on T182's regrouped rail: "not happy with this, i want sub menus. the menus can
// open all more to the side with more levels. stop putthing everythig in one col"). A rail group opens a flyout to its right; a row with
// children opens the next one further right, as many levels as the tools have (Traffic ▸ Roads ▸ Build ▸ Street); a leaf picks its tool (and
// what it names: the road class, the junction, the surface, the care, the material ...) and the small tool panel shows that tool's options
// alone. A locked row stays in place, dimmed, with its lock's reason (T179); NEW rows keep their badge. Pure TypeScript, no DOM: the rows are
// built from the game's lists (MenuCtx, App.tsx fills it); Flyouts.tsx draws them and walks them by keyboard (navKey, here).
import type { Tool } from '../game/types';
import type { ProgressiveUiState } from '../game/ext/progressive-ui';
import type { IconName } from './Icon';
import { entryKey, extraLock, toolLock, toolNew, toolsIn, type RailItem, type RailTool } from './rail-items';

/** what a leaf does besides picking its tool (App.tsx runs it) */
export type LeafAct =
  | { k: 'road'; id: string } | { k: 'junction'; id: string } | { k: 'surface'; id: string } | { k: 'newHole' } | { k: 'holes' }
  | { k: 'club' } | { k: 'halfway' } | { k: 'care'; id: string } | { k: 'event' } | { k: 'props'; group: string | null }
  | { k: 'paint'; tex: string } | { k: 'plant'; id: string } | { k: 'paintMode'; id: string } | { k: 'range'; section: string | null };
/** a leaf: the rail item it opens from, its tool entry (the Props tool's view with it), what else it does */
export interface Leaf { item: string; entry: RailTool; act?: LeafAct }
/** a flyout row: a caption (no action), a row with children (opens the next flyout), or a leaf. why: locked (dimmed, the reason shown) */
export interface MenuRow {
  key: string; label: string; icon?: IconName; swatch?: string; /** a course surface's mark (SurfaceMark) */ mark?: string; caption?: boolean; children?: MenuRow[]; leaf?: Leaf; why?: string | null; isNew?: boolean; note?: string;
}
/** the game's lists the menus are built from (App.tsx from the engine; the tests from fixtures) */
export interface MenuCtx {
  golf: boolean; ui: ProgressiveUiState | null;
  /** the town's road types (Build) and the course's paths and drives (Paths), with their family's caption and lock */
  roads: { id: string; name: string; family: string; why: string | null }[];
  paths: { id: string; name: string; family: string; why: string | null }[];
  junctions: { id: string; name: string; why: string | null }[];
  /** the course brushes shown at this stage (Shape by hand), the greenkeeping cares, the props' groups, the paint's materials and plants */
  surfaces: { id: string; name: string }[];
  cares: { id: string; name: string }[];
  propGroups: { id: string; name: string }[];
  materials: { id: string; name: string; col?: string }[];
  plants: { id: string; name: string; col?: string }[];
  /** New hole's lock (null: open) */
  newHoleWhy: string | null;
  /** the range card's sections (a game with a range) */
  range: { id: string; name: string }[];
}

/** the group's flyout rows: its sub-groups and tools (a single-tool group, Select or Bulldoze, has none: a click picks its tool) */
export function menuOf(item: RailItem, c: MenuCtx): MenuRow[] {
  const tools = toolsIn(item, c.golf), byId = (id: Tool, view?: string) => tools.find(t => t.id === id && (view === undefined || (t.view?.group ?? '') === view));
  const leaf = (t: RailTool | undefined, label = t?.label ?? '', act?: LeafAct, icon?: IconName): MenuRow | null => t ? { key: `${entryKey(t)}${act ? '|' + JSON.stringify(act) : ''}`, label, icon: icon ?? t.icon, leaf: { item: item.id, entry: t, ...(act ? { act } : {}) }, why: toolLock(c.ui, t.id), isNew: toolNew(c.ui, t.id) } : null;
  const group = (key: string, label: string, icon: IconName, children: (MenuRow | null)[], t?: RailTool): MenuRow | null => {
    const kids = children.filter((r): r is MenuRow => !!r);
    if (!kids.length) return null;
    // a group whose tool is locked (or whose every row is) is locked in place with that reason
    const own = t ? toolLock(c.ui, t.id) : null, all = kids.filter(k => !k.caption), why = own ?? (all.length && all.every(k => k.why) ? all.find(k => k.why)!.why! : null);
    return { key, label, icon, children: kids, why, isNew: !!t && toolNew(c.ui, t.id) };
  };
  /** class rows under family captions (the Build and Paths flyouts): a locked class carries its lock */
  const classes = (t: RailTool | undefined, list: MenuCtx['roads']) => {
    if (!t) return [];
    const out: MenuRow[] = []; let fam = '';
    for (const r of list) {
      if (r.family !== fam) { fam = r.family; out.push({ key: `cap:${t.id}:${fam}`, label: fam, caption: true }); }
      out.push({ ...leaf(t, r.name, { k: 'road', id: r.id })!, key: `${t.id}|${r.family}|${r.id}`, why: toolLock(c.ui, t.id) ?? r.why });
    }
    return out;
  };
  const rows: (MenuRow | null)[] = [];
  if (item.action === 'range') {
    for (const s of c.range) rows.push(leaf(item.tools[0], s.name, { k: 'range', section: s.id === 'card' ? null : s.id }, 'pin'));
    return rows.filter((r): r is MenuRow => !!r);
  }
  switch (item.id) {
    case 'traffic': {
      const road = byId('road');
      rows.push(group('roads', 'Roads', 'road', [group('build', 'Build', 'road', classes(road, c.roads), road), leaf(byId('lane')), leaf(byId('downgrade'))]));
      const j = byId('junction');
      rows.push(group('junctions', 'Junctions', 'junction', j ? [leaf(j, 'Select a junction', { k: 'junction', id: 'select' }, 'compass'), ...c.junctions.map(x => ({ ...leaf(j, x.name, { k: 'junction', id: x.id })!, why: toolLock(c.ui, j.id) ?? x.why }))] : [], j));
      rows.push(group('transport', 'Transport', 'bus', [leaf(byId('bus')), leaf(byId('park')), leaf(byId('toll'))]));
      break;
    }
    case 'course': {
      const h = byId('course');
      rows.push(group('holes', 'Holes', 'trophy', h ? [
        { ...leaf(h, 'New hole', { k: 'newHole' }, 'trophy')!, why: toolLock(c.ui, h.id) ?? c.newHoleWhy },
        leaf(h, 'Your holes', { k: 'holes' }, 'pin'),
        group('shape', 'Shape by hand', 'terrain', c.surfaces.map(s => ({ ...leaf(h, s.name, { k: 'surface', id: s.id })!, mark: s.id }))),
      ] : [], h));
      const b = byId('buildings');
      if (b) rows.push(group('buildings', 'Buildings', 'house', [leaf(b, 'Clubhouse', { k: 'club' }, 'house'), leaf(b, 'Halfway house', { k: 'halfway' }, 'house')], b));
      const g = byId('greenkeeping');
      if (g) rows.push(group('greenkeeping', 'Greenkeeping', 'trees', [leaf(g, 'Grass care', undefined, 'trees'), ...c.cares.map(x => leaf(g, x.name, { k: 'care', id: x.id }))], g));
      if (c.golf) for (const x of item.extras ?? []) rows.push({ key: `extra:${x.id}`, label: x.label, icon: x.icon, leaf: { item: item.id, entry: { id: 'select', label: x.label, key: '', icon: x.icon }, act: { k: 'event' } }, why: extraLock(c.ui, x) });
      break;
    }
    case 'decor': {
      const p = byId('path');
      rows.push(group('paths', 'Paths', 'sidewalk', classes(p, c.paths), p));
      const pr = byId('props');
      if (pr) rows.push(group('props', 'Props', 'leaf', [leaf(pr, 'All props', { k: 'props', group: null }), ...c.propGroups.map(g => leaf(pr, g.name, { k: 'props', group: g.id }))], pr));
      break;
    }
    case 'towndecor': {
      const pa = byId('paint');
      if (pa) rows.push(group('paint', 'Paint', 'terrain', [
        group('materials', 'Areas', 'terrain', c.materials.map(m => ({ ...leaf(pa, m.name, { k: 'paint', tex: m.id })!, ...(m.col ? { swatch: m.col } : {}) }))),
        group('plants', 'Plants', 'trees', c.plants.map(m => ({ ...leaf(pa, m.name, { k: 'plant', id: m.id })!, ...(m.col ? { swatch: m.col } : {}) }))),
        leaf(pa, 'Pick an area', { k: 'paintMode', id: 'pick' }, 'compass'), leaf(pa, 'Erase areas', { k: 'paintMode', id: 'erase' }, 'bulldozer'),
      ], pa));
      const pr = byId('props', ''), bu = byId('props', 'buildings');
      if (pr) rows.push(group('props', 'Props', 'leaf', [leaf(pr, 'All props', { k: 'props', group: null }), ...c.propGroups.map(g => leaf(pr, g.name, { k: 'props', group: g.id }))], pr));
      if (bu) rows.push(leaf(bu, 'Buildings', { k: 'props', group: 'buildings' }, 'buildings'));
      const biz = byId('business');
      if (biz) rows.push(leaf(biz));
      break;
    }
    default:
      // Select, Bulldoze: one tool, no flyout
      if (tools.length > 1) for (const t of tools) rows.push(leaf(t));
  }
  return rows.filter((r): r is MenuRow => !!r);
}

/** every leaf of a menu with its path of row keys (the tests: every tool reachable; App.tsx: the back arrow reopens a leaf's flyout) */
export function leavesOf(rows: readonly MenuRow[], path: string[] = []): { row: MenuRow; path: string[] }[] {
  const out: { row: MenuRow; path: string[] }[] = [];
  for (const r of rows) { if (r.leaf) out.push({ row: r, path: [...path, r.key] }); if (r.children) out.push(...leavesOf(r.children, [...path, r.key])); }
  return out;
}

/** the flyouts' open state: path, the open row's index at each level (the columns shown are the root and each open row's children); focus,
 *  the focused row (level, index), or null when the pointer leads */
export interface NavState { path: number[]; focus: { level: number; index: number } | null }
/** the rows of each column shown */
export function columnsOf(rows: readonly MenuRow[], path: readonly number[]): MenuRow[][] {
  const cols: MenuRow[][] = [rows as MenuRow[]];
  for (const i of path) { const r = cols[cols.length - 1]![i]; if (!r?.children) break; cols.push(r.children); }
  return cols;
}
/** the result of a key in the flyouts: the new state, a leaf to pick, a locked row to tell, or close (Esc, or Left on the first column) */
export type NavOut = { state: NavState; pick?: MenuRow; locked?: MenuRow; close?: boolean; handled: boolean };
/** the keyboard walks the flyouts (T193): Up and Down move in a column (past captions), Right, Enter or Space on a row with children opens it and
 *  goes in, Enter or Space on a leaf picks it (a locked one tells why), Left goes back a column (on the first: closes), Esc closes, Home and End */
export function navKey(rows: readonly MenuRow[], s: NavState, key: string): NavOut {
  const cols = columnsOf(rows, s.path), f = s.focus ?? { level: Math.max(0, cols.length - 1), index: -1 };
  const col = cols[f.level] ?? [], ok = (i: number) => !!col[i] && !col[i]!.caption;
  const step = (from: number, d: 1 | -1) => { for (let k = 1; k <= col.length; k++) { const i = (((from + d * k) % col.length) + col.length) % col.length; if (ok(i)) return i; } return from; };
  const at = (index: number): NavState => ({ path: s.path.slice(0, f.level), focus: { level: f.level, index } });
  switch (key) {
    case 'Escape': return { state: { path: [], focus: null }, close: true, handled: true };
    case 'ArrowDown': return { state: at(step(f.index, 1)), handled: true };
    case 'ArrowUp': return { state: at(step(f.index < 0 ? 0 : f.index, -1)), handled: true };
    case 'Home': return { state: at(step(-1, 1)), handled: true };
    case 'End': return { state: at(step(col.length, -1)), handled: true };
    case 'ArrowLeft':
      if (f.level === 0) return { state: { path: [], focus: null }, close: true, handled: true };
      return { state: { path: s.path.slice(0, f.level - 1), focus: { level: f.level - 1, index: s.path[f.level - 1]! } }, handled: true };
    case 'ArrowRight': case 'Enter': case ' ': {
      const r = col[f.index];
      if (!r || r.caption) return { state: s, handled: key !== ' ' };
      if (r.children) {
        if (r.why) return { state: s, locked: r, handled: true };
        const kids = r.children, first = kids.findIndex(k => !k.caption);
        return { state: { path: [...s.path.slice(0, f.level), f.index], focus: { level: f.level + 1, index: Math.max(0, first) } }, handled: true };
      }
      if (key === 'ArrowRight') return { state: s, handled: true };
      return r.why ? { state: s, locked: r, handled: true } : { state: { path: [], focus: null }, pick: r, close: true, handled: true };
    }
  }
  return { state: s, handled: false };
}
/** the indices of a path of row keys (a leaf's, leavesOf) in a menu: the rows to open to show it (the back arrow) */
export function indicesOf(rows: readonly MenuRow[], keys: readonly string[]): number[] {
  const out: number[] = []; let col: readonly MenuRow[] | undefined = rows;
  for (const k of keys) { if (!col) break; const i = col.findIndex(r => r.key === k); if (i < 0) break; out.push(i); col = col[i]!.children; }
  return out;
}
