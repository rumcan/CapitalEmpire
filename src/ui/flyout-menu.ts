// The toolbar's flyout menus (T193, #502; the owner 2026-10-27 on T182's regrouped rail: "not happy with this, i want sub menus. the menus can
// open all more to the side with more levels. stop putthing everythig in one col"). A rail group opens a flyout to its right; a row with
// children opens the next one further right, as many levels as the tools have (Traffic ▸ Roads ▸ Build ▸ Street); a leaf picks its tool (and
// what it names: the road class, the junction, the surface, the care, the material ...) and the small tool panel shows that tool's options
// alone. A locked row stays in place, dimmed, with its lock's reason (T179); NEW rows keep their badge. Pure TypeScript, no DOM: the rows are
// built from the game's lists (MenuCtx, App.tsx fills it); Flyouts.tsx draws them and walks them by keyboard (navKey, here).
import type { Tool } from '../game/types';
import type { ProgressiveUiState } from '../game/ext/progressive-ui';
import type { IconName } from './Icon';
import { entryKey, extraLock, toolLock, toolNew, toolsIn, toolsNew, type RailItem, type RailTool } from './rail-items';
import { GREENKEEPING, JAM } from '../game/features';
import { EXTRA_TILE, PLANT_TILE, PRACTICE_TILE, PROP_GROUP_TILE, PROP_KIND_TILE, ROW_TILE, SURFACE_TILE, type ToolTile } from './tool-tiles';

/** T400: the icon of a golf props' kind row in Facilities */
const PROP_KIND_ICON: Readonly<Record<string, IconName>> = { structures: 'buildings', coursefurniture: 'leaf', rangeprops: 'pin', vehicles: 'bus' };
/** what a leaf does besides picking its tool (App.tsx runs it) */
export type LeafAct =
  | { k: 'road'; id: string } | { k: 'junction'; id: string } | { k: 'surface'; id: string } | { k: 'newHole' } | { k: 'holes' }
  | { k: 'club' } | { k: 'halfway' } | { k: 'care'; id: string } | { k: 'event' } | { k: 'props'; group: string | null }
  | { k: 'paint'; tex: string } | { k: 'plant'; id: string } | { k: 'paintMode'; id: string } | { k: 'range'; section: string | null } | { k: 'land' }
  | { k: 'practice'; id: string } | { k: 'build' } | { k: 'place'; id: string } | { k: 'pro'; id: 'prooffice' | 'teachhut' } | { k: 'estate' }
  /** T356 (#998): Course > Place a real course > (a course): takes that map-data course in hand */
  | { k: 'real'; id: string };
/** T256 (#743): Build, the holes' painting tools on your property (Range › Build, Facilities › Build on your property): the course tool's
 *  entry with the property's brush */
const BUILD_TOOL: RailTool = { id: 'course', label: 'Build', key: '', icon: 'terrain' };
/** a leaf: the rail item it opens from, its tool entry (the Props tool's view with it), what else it does */
export interface Leaf { item: string; entry: RailTool; act?: LeafAct }
/** a flyout row: a caption (no action), a row with children (opens the next flyout), or a leaf. why: locked (dimmed, the reason shown) */
export interface MenuRow {
  key: string; label: string; icon?: IconName; swatch?: string; /** a course surface's mark (SurfaceMark) */ mark?: string; caption?: boolean; children?: MenuRow[]; leaf?: Leaf; why?: string | null; isNew?: boolean; note?: string;
  /** T233: its illustrated tile (art 174, tool-tiles.ts), drawn above its name; a column with a tiled row is laid out as a grid of tiles */
  tile?: ToolTile;
  /** T256: drawn as a gold button (the Range's Build) */
  gold?: boolean;
  /** #1272: the guide's anchor the row carries (data-guide: the Facilities tile is "rail-facilities", which GuidePulse falls back from to the Course button while
   *  the flyout is shut); a leaf's is its tool's */
  guide?: string;
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
  /** the props' groups: Facilities ▸ Decoration ▸ Props lists them (the everyday groups of the course) and, with no townPropGroups, Town decoration ▸ Props too */
  propGroups: { id: string; name: string }[];
  /** T400 (#1078): Town decoration ▸ Props' groups, the town's alone (no golf group); absent: propGroups */
  townPropGroups?: { id: string; name: string }[];
  /** T400 (#1078): the golf props by kind, a row each in Facilities after Decoration (Tournament structures, Course furniture, Range props, Course vehicles): a
   *  kind of one group is a leaf, else a flyout of its groups under "All <kind>" */
  propKinds?: { id: string; name: string; groups: { id: string; name: string }[] }[];
  materials: { id: string; name: string; col?: string }[];
  plants: { id: string; name: string; col?: string }[];
  /** T206: the practice facilities (Facilities ▸ Practice) with their own lock besides the tool's (no practice area: not a range start) */
  practice?: { id: string; name: string; why: string | null }[];
  /** T356: the real courses (Course > Place a real course): the id and the name the menu shows, with its place, holes and par; `kept`: one the player downloaded
   *  (T358's library, listed under its own caption), else one the game ships (listed first) */
  real?: { id: string; name: string; place: string; holes: number; par: number; kept?: boolean }[];
  /** New hole's lock (null: open) */
  newHoleWhy: string | null;
  /** the range card's sections (a game with a range); T288: place, a placement (the range, its car park, the practice area: a click takes it in
   *  hand) with its lock (why) */
  range: { id: string; name: string; place?: boolean; why?: string | null }[];
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
  /** T233: a row with its tile (none: as it was) */
  const tiled = (r: MenuRow | null, tile: ToolTile | undefined): MenuRow | null => (r && tile ? { ...r, tile } : r);
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
  /** #1272: the Facilities tile's rows, the Course flyout's sixth tile (they were the rows of the Facilities rail button's flyout):
   *  T206: Practice ▸ the facilities (each its own building tool), Plants ▸ the plant brush's kinds, Decoration ▸ Props ▸ by group
   *  T233: the tiles (tool-tiles.ts): Practice (the range bays) and its putting and chipping greens, Plants (the trees) with its Trees and
   *  Flowers, Decoration (the boulders) and its Props' Stone, Water and Plants */
  const facilityRows = (): MenuRow[] => {
    const out: (MenuRow | null)[] = [], pt = byId('practice');
    // T214: the teaching hut, after the greens (placed with the Buildings tool's ghost)
    if (pt) out.push(tiled(group('practice', 'Practice', 'pin', [...(c.practice ?? []).map(f => tiled({ ...leaf(pt, f.name, { k: 'practice', id: f.id }, 'pin')!, why: toolLock(c.ui, pt.id) ?? f.why }, PRACTICE_TILE[f.id])),
      ...(c.practice?.length ? [tiled({ ...leaf(pt, 'Teaching hut', { k: 'pro', id: 'teachhut' }, 'house')!, why: toolLock(c.ui, pt.id) ?? (c.practice.every(f => f.why) ? c.practice[0]!.why : null) }, ROW_TILE.teachHut)] : [])], pt), ROW_TILE.practice));
    const pa = byId('paint');
    if (pa) out.push(tiled(group('plants', 'Plants', 'trees', c.plants.map(m => tiled({ ...leaf(pa, m.name, { k: 'plant', id: m.id })!, ...(m.col ? { swatch: m.col } : {}) }, PLANT_TILE[m.id])), pa), ROW_TILE.plants));
    const pr = byId('props');
    if (pr) out.push(tiled(group('decoration', 'Decoration', 'leaf', [group('props', 'Props', 'leaf', [leaf(pr, 'All props', { k: 'props', group: null }), ...c.propGroups.map(g => tiled(leaf(pr, g.name, { k: 'props', group: g.id }), PROP_GROUP_TILE[g.id]))], pr)], pr), ROW_TILE.decoration));
    // T400 (#1078; the owner, 2026-11-09: "why are the golf shit in the town decoration menu and not in the facilities menu?"): the golf props, by the kinds the
    // tournament kit meant, a row each: Tournament structures ▸ (the stalls, seating, media and event structures), Course furniture ▸ (the tournament
    // dressing and the course props), Range props, Course vehicles. Town decoration lists none of them
    if (pr) for (const k of c.propKinds ?? []) {
      const icon: IconName = PROP_KIND_ICON[k.id] ?? 'leaf', tile = PROP_KIND_TILE[k.id];
      out.push(tiled(k.groups.length === 1
        ? leaf(pr, k.name, { k: 'props', group: k.groups[0]!.id }, icon)
        : group(`kind:${k.id}`, k.name, icon, [leaf(pr, `All ${k.name.toLowerCase()}`, { k: 'props', group: k.id }, icon), ...k.groups.map(g => leaf(pr, g.name, { k: 'props', group: g.id }, icon))], pr), tile));
    }
    // T256: the same Build as the Range's: paint your property
    if (c.golf) { const b = leaf(BUILD_TOOL, 'Build on your property', { k: 'build' }, 'terrain'); if (b) out.push({ ...b, gold: true, tile: ROW_TILE.build }); }
    return out.filter((r): r is MenuRow => !!r);
  };
  const rows: (MenuRow | null)[] = [];
  if (item.action === 'range') {
    for (const s of c.range) {
      if (s.place) { const r = leaf(item.tools[0], s.name, { k: 'place', id: s.id }, 'house'); if (r) rows.push({ ...r, why: s.why ?? null, ...(s.why ? {} : { gold: true }) }); continue; }
      rows.push(leaf(item.tools[0], s.name, { k: 'range', section: s.id === 'card' ? null : s.id }, 'pin'));
    }
    // T256: Build, gold, last: the holes' painting tools on the range, the practice area and the rest of your land
    // (T459, the jam MVP: no free painting of the property: holes come from New hole)
    if (!JAM && c.golf && c.range.length) { const b = leaf(BUILD_TOOL, 'Build', { k: 'build' }, 'terrain'); if (b) rows.push({ ...b, gold: true, note: 'Paint your property, apart from the holes' }); }
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
      // T233: the Course flyout's tools as the concept's illustrated tiles (tool-tiles.ts): Holes, New hole, Shape by hand and its surfaces,
      // Buildings and the Clubhouse, Cart paths & roads (its classes stay a list under their families)
      rows.push(tiled(group('holes', 'Holes', 'trophy', h ? [
        tiled({ ...leaf(h, 'New hole', { k: 'newHole' }, 'trophy')!, why: toolLock(c.ui, h.id) ?? c.newHoleWhy }, ROW_TILE.newHole),
        leaf(h, 'Your holes', { k: 'holes' }, 'pin'),
        // (T459, the jam MVP: holes come from New hole; Shape by hand, the surface brushes, is hidden)
        ...(JAM ? [] : [tiled(group('shape', 'Shape by hand', 'terrain', c.surfaces.map(s => tiled({ ...leaf(h, s.name, { k: 'surface', id: s.id })!, mark: s.id }, SURFACE_TILE[s.id]))), ROW_TILE.shape)]),
      ] : [], h), ROW_TILE.holes));
      const b = byId('buildings');
      // (T459, the jam MVP: the clubhouse alone)
      if (b) rows.push(tiled(group('buildings', 'Buildings', 'house', JAM ? [tiled(leaf(b, 'Clubhouse', { k: 'club' }, 'house'), ROW_TILE.club)] : [tiled(leaf(b, 'Clubhouse', { k: 'club' }, 'house'), ROW_TILE.club), tiled(leaf(b, 'Halfway house', { k: 'halfway' }, 'house'), ROW_TILE.halfway), tiled(leaf(b, "Pro's office", { k: 'pro', id: 'prooffice' }, 'house'), ROW_TILE.proOffice), leaf(b, 'House lots', { k: 'estate' }, 'house')], b), ROW_TILE.buildings));
      // T356 (#998, the owner: "add a way for the user to place the golf course he imported into his map"): the real courses, each placed with its outline in hand
      // (the shipped ones first; the player's downloaded courses under a caption of their own, only when there are some: without, the list is the three alone)
      if (c.golf && c.real?.length) {
        const real = (x: NonNullable<MenuCtx['real']>[number]): MenuRow => ({ key: `real:${x.id}`, label: x.name, icon: 'pin', note: `${x.place} · ${x.holes} holes · par ${x.par}`, leaf: { item: item.id, entry: { id: 'select', label: x.name, key: '', icon: 'pin' }, act: { k: 'real', id: x.id } } });
        const shipped = c.real.filter(x => !x.kept), kept = c.real.filter(x => x.kept);
        rows.push(group('real', 'Place a real course…', 'trophy', kept.length ? [...(shipped.length ? [{ key: 'real:cap-featured', label: 'Featured', caption: true }, ...shipped.map(real)] : []), { key: 'real:cap-kept', label: 'Downloaded courses', caption: true }, ...kept.map(real)] : shipped.map(real), h));
      }
      // (T288: Cart paths & roads is a rail button of its own, below Course)
      const g = GREENKEEPING ? byId('greenkeeping') : undefined; // hidden for now (features.ts)
      if (g) rows.push(group('greenkeeping', 'Greenkeeping', 'trees', [leaf(g, 'Grass care', undefined, 'trees'), ...c.cares.map(x => leaf(g, x.name, { k: 'care', id: x.id }))], g));
      if (c.golf) for (const x of item.extras ?? []) rows.push({ key: `extra:${x.id}`, label: x.label, icon: x.icon, tile: EXTRA_TILE[x.id], leaf: { item: item.id, entry: { id: 'select', label: x.label, key: '', icon: x.icon }, act: x.id === 'land' ? { k: 'land' } : { k: 'event' } }, why: extraLock(c.ui, x) });
      // #1272 (the owner, 2026-11-14: "move facilities button in main menu to this menu bottom right empty space"): Facilities, the sixth tile, bottom right: it
      // opens its own tools (Practice, Plants, Props ...) as the next level, to the side like the real courses' list. It was a rail button: its lock (every one of
      // its tools locked), its NEW mark and its Z key (the Props tool's own) are the same, and its leaves pick through Course (the item lit while one is in hand)
      const ft = tools.filter(t => t.within === 'facilities'), fk = c.golf && ft.length ? facilityRows() : [];
      if (fk.length) {
        const why = ft.every(t => toolLock(c.ui, t.id)) ? toolLock(c.ui, ft[0]!.id) : null;
        rows.push({ key: 'facilities', label: 'Facilities', icon: 'leaf', tile: ROW_TILE.facilities, children: fk, why, isNew: !why && toolsNew(c.ui, ft), note: 'Practice greens, plants and props (Z: Props)', guide: 'rail-facilities' });
      }
      break;
    }
    case 'paths': {
      // T288 (#873, the owner: "make cart paths and roads its own button above facilities in the main left menu"): the course's cart paths and
      // drives (the road tool on your property, its classes under their families), then the town's roads (Traffic › Build's classes), each with
      // its own lock: the roads say when they open
      // (two tiles: the cart paths with the T233 cart path tile, the roads on the navy square; each opens its classes as a list)
      const p = byId('path');
      if (p) { const r = group('paths', 'Cart paths & drives', 'sidewalk', classes(p, c.paths), p); if (r) rows.push({ ...r, note: 'Roads and cart paths on your property', tile: ROW_TILE.paths }); }
      const rd = byId('road');
      if (rd) { const r = group('roads', 'Roads', 'road', classes(rd, c.roads), rd); if (r) rows.push({ ...r, note: 'Town roads: they give the town new lots' }); }
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
      // (T400: the town's groups alone: a group with nothing for the town, the golf props', is no row here)
      if (pr) rows.push(group('props', 'Props', 'leaf', [leaf(pr, 'All props', { k: 'props', group: null }), ...(c.townPropGroups ?? c.propGroups).map(g => leaf(pr, g.name, { k: 'props', group: g.id }))], pr));
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
