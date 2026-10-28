// The toolbar's cascading flyouts (T193, #502; the rows are flyout-menu.ts). A rail group's flyout opens to its right; a row with children opens
// the next column further right (on a click, or on hover once a flyout is open, like a menu bar); a leaf picks its tool and closes them. Esc, or a
// click anywhere off the rail and the flyouts (that click goes no further), closes them; the keyboard walks them (flyout-menu.ts navKey).
// Every column fits the screen at any size and UI scale (T179's 90-125%): its height is the room under the HUD's top (a longer list scrolls
// vertically, never sideways), its top slides up to stay on screen, and the columns narrow when four of them would pass the right edge. Text
// wraps: no column ever scrolls sideways (the owner: "horizontal menu sliders" are not cool).
// T233 (#674, the concept's Golf Course panel): a column with an illustrated tool tile (MenuRow.tile, tool-tiles.ts) is laid out as a grid of
// tiles, each picture above its name, as many across as its width holds (three at full width, two when the columns narrow); a row of it with no
// tile shows its icon, mark or swatch on the same navy square. Captions span the grid; a locked tile is dimmed with its lock and its reason.
// T250 (#721): the town footer's flyouts open upward (up): the first column stands on the footer, above its button, and each deeper level opens
// to its side as on the rail, beside the row that opened it, all in the room between the top bar and the footer. The first column slides left
// only when the menu's deepest walk would not fit to the right at the narrowest columns (upLeft). The rows, tiles, keys and locks are the same.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { LockMark, NewBadge } from './Rail';
import { columnsOf, navKey, type MenuRow, type NavState } from './flyout-menu';
import { currentUiScale } from './uiScale';
import { SurfaceMark } from './course/SurfaceMark';
import { tileUrl } from './tool-tiles';

/** a column's width (local px, at 100%), a tile grid's (T233: three tiles across), the narrowest either may get (a grid: two across), the gap
 *  between columns, and the room kept under the screen's bottom */
const COL_W = 232, TILE_COL_W = 280, COL_MIN = 184, GAP = 6, BOTTOM = 12;
/** whether a column is a grid of tiles (T233: any of its rows has one) */
export const isTileGrid = (col: readonly MenuRow[]): boolean => col.some(r => !!r.tile);
/** the columns' widths (local px) in the room there is: each its own (a list's or a grid's), all narrowed alike when they would pass the right
 *  edge, never under COL_MIN */
export function columnWidths(cols: readonly (readonly MenuRow[])[], room: number): number[] {
  const want = cols.map(c => (isTileGrid(c) ? TILE_COL_W : COL_W)), sum = want.reduce((a, b) => a + b, 0), fit = room - GAP * cols.length;
  const k = sum > fit ? Math.max(0, fit) / sum : 1;
  return want.map(w => Math.max(COL_MIN, Math.floor(w * k)));
}
/** how long the pointer rests on a row before its submenu replaces an open one (ms: a diagonal move to the open one does not switch it) */
const HOVER_MS = 140;
/** T250: how many columns a menu's deepest walk shows (the root's and each level under it) */
export const menuDepth = (rows: readonly MenuRow[]): number => 1 + Math.max(0, ...rows.map(r => (r.children ? menuDepth(r.children) : 0)));
/** T250: the upward flyouts' left edge (local px from the screen's left): over the footer button (left), slid left only as far as the menu's
 *  deepest walk (depth columns at the narrowest) needs to fit before the screen's right edge, never past its left margin */
export const upLeft = (left: number, screenW: number, depth: number): number => Math.round(Math.max(BOTTOM, Math.min(left, screenW - BOTTOM - depth * (COL_MIN + GAP))));
/** the top bar's bottom (--hud-top, local px; App.tsx sets it in px, its fallback is 5.75rem) */
function hudTop(): number {
  const v = typeof document === 'undefined' ? '' : getComputedStyle(document.documentElement).getPropertyValue('--hud-top').trim(), n = parseFloat(v);
  return Number.isFinite(n) ? (v.endsWith('rem') ? n * 16 : n) : 92;
}

const NO_REFS: readonly React.RefObject<HTMLElement | null>[] = [];

export interface FlyoutsProps {
  rows: MenuRow[];
  /** the rail button's top (local px in the rail's box) and the left edge the first column starts at (up: the footer button's left edge, local
   *  px from the screen's left; top unused) */
  top: number; left: number;
  /** T250: the town footer's flyouts: they open upward from the footer, their deeper levels to the side */
  up?: boolean;
  /** the rows to open at first (the back arrow: the leaf's parents), and whether the keyboard leads (focus the first row) */
  startPath?: number[]; keyboard?: boolean;
  onLeaf: (r: MenuRow) => void; onLocked: (r: MenuRow) => void; onClose: () => void;
  /** the drawers' boxes (T250: the course drawer and the town footer): a click on one is the rail's own (it switches or closes the flyouts) */
  railRefs?: readonly React.RefObject<HTMLElement | null>[];
}

export function Flyouts({ rows, top, left, up = false, startPath = [], keyboard = false, onLeaf, onLocked, onClose, railRefs = NO_REFS }: FlyoutsProps) {
  const [nav, setNav] = useState<NavState>(() => ({ path: startPath, focus: keyboard ? { level: startPath.length, index: Math.max(0, (columnsOf(rows, startPath)[startPath.length] ?? []).findIndex(r => !r.caption)) } : null }));
  const [tops, setTops] = useState<number[]>([]);
  const [room, setRoom] = useState<{ h: number; w: number; x: number }>({ h: 600, w: 1200, x: left });
  const box = useRef<HTMLDivElement | null>(null), timer = useRef(0);
  const cols = columnsOf(rows, nav.path);
  // (another group's flyouts are a new Flyouts: App.tsx keys it by the group, so the open rows start again there)
  // the room on screen (local px: the UI layer is zoomed by the UI scale), measured from where the flyouts start; upward (T250), from the top
  // bar's bottom down to the footer's top (the box's bottom), and from the first column's left edge to the screen's right edge
  const depth = menuDepth(rows);
  useLayoutEffect(() => {
    const measure = () => {
      const s = currentUiScale() || 1, r = box.current?.getBoundingClientRect();
      let next: { h: number; w: number; x: number };
      if (up) {
        const sw = window.innerWidth / s, x = upLeft(left, sw, depth), bottom = r ? r.bottom / s : window.innerHeight / s - 80;
        next = { h: Math.max(160, bottom - hudTop() - 8), w: Math.max(COL_MIN, sw - x - BOTTOM), x };
      } else {
        const y0 = r ? r.top : 96, x0 = r ? r.left : 100;
        next = { h: Math.max(160, (window.innerHeight - y0) / s - BOTTOM), w: Math.max(COL_MIN, (window.innerWidth - x0) / s - BOTTOM), x: left };
      }
      setRoom(o => (o.h === next.h && o.w === next.w && o.x === next.x ? o : next));
    };
    measure(); window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure);
  }, [up, left, depth]);
  // each column's top: beside the row that opened it, slid up to stay on screen (upward, the first column stands on the room's bottom)
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const out: number[] = [];
    cols.forEach((_, level) => {
      const col = el.querySelector<HTMLElement>(`[data-flyout-col="${level}"]`); if (!col) { out.push(0); return; }
      const h = col.offsetHeight;
      let want = level === 0 ? (up ? room.h - h : top) : (() => { const parent = el.querySelector<HTMLElement>(`[data-flyout-col="${level - 1}"]`), row = parent?.querySelector<HTMLElement>(`[data-row="${level - 1}:${nav.path[level - 1]}"]`); return (out[level - 1] ?? 0) + (row ? row.offsetTop - (parent?.scrollTop ?? 0) - 4 : 0); })();
      want = Math.max(0, Math.min(want, room.h - h));
      out.push(Math.round(want));
    });
    if (out.length !== tops.length || out.some((v, i) => v !== tops[i])) setTops(out);
  });
  // the keyboard (capture: the game's own keys never see a key the flyouts use) and a click off them (it closes them and goes no further)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const o = navKey(rows, nav, e.key);
      if (!o.handled) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (o.pick) { onLeaf(o.pick); return; }
      if (o.locked) onLocked(o.locked);
      if (o.close) { onClose(); return; }
      setNav(o.state);
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t || box.current?.contains(t) || railRefs.some(r => r.current?.contains(t))) return;
      e.stopPropagation(); e.preventDefault(); onClose();
    };
    window.addEventListener('keydown', onKey, true); window.addEventListener('pointerdown', onDown, true);
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('pointerdown', onDown, true); };
  }, [rows, nav, onLeaf, onLocked, onClose, railRefs]);
  // the focused row takes the browser's focus (the screen reader and the visible ring follow the keyboard)
  useEffect(() => { if (nav.focus) box.current?.querySelector<HTMLElement>(`[data-row="${nav.focus.level}:${nav.focus.index}"]`)?.focus(); }, [nav.focus]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const widths = columnWidths(cols, room.w);
  const open = (level: number, index: number, now: boolean) => {
    window.clearTimeout(timer.current);
    const go = () => setNav(s => ({ path: [...s.path.slice(0, level), index], focus: s.focus ? { level, index } : null }));
    if (now || nav.path.length <= level) go(); else timer.current = window.setTimeout(go, HOVER_MS);
  };
  const shut = (level: number, now = false) => {
    window.clearTimeout(timer.current);
    const go = () => setNav(s => ({ path: s.path.slice(0, level), focus: s.focus }));
    if (now) go(); else if (nav.path.length > level) timer.current = window.setTimeout(go, HOVER_MS);
  };
  return (
    <div ref={box} className={`flyouts ${up ? 'flyouts-up' : ''}`} style={up ? { left: room.x, height: room.h } : { left }} data-testid="flyouts" data-up={up || undefined} role="presentation">
      {cols.map((col, level) => { const grid = isTileGrid(col); return (
        <div key={level} role="menu" aria-orientation="vertical" data-flyout-col={level} className={`flyout glass ${grid ? 'flyout-grid' : ''}`} style={{ top: tops[level] ?? (level ? 0 : top), width: widths[level], maxHeight: room.h }}>
          {col.map((r, index) => {
            if (r.caption) return <div key={r.key} className="flyout-caption" role="presentation">{r.label}</div>;
            const opened = nav.path[level] === index && !!r.children, focused = nav.focus?.level === level && nav.focus.index === index;
            // T233: a tile: the picture (or the row's icon on the navy square), its lock, NEW and more marks on it, the name and the reason under it
            const pic = r.tile ? tileUrl(r.tile) : undefined, mark = r.mark ? <SurfaceMark kind={r.mark} size={grid ? 40 : 22} /> : r.swatch ? <span className="flyout-swatch" style={{ background: r.swatch }} /> : r.icon ? <Icon name={r.icon} size={grid ? 36 : 20} /> : null;
            return (
              <button key={r.key} type="button" role="menuitem" data-row={`${level}:${index}`} data-key={r.key} tabIndex={focused ? 0 : -1}
                data-guide={r.leaf ? `tool-${r.leaf.entry.view?.group ?? r.leaf.entry.id}` : undefined}
                {...(grid && r.why ? { 'data-tip': `${r.label}: ${r.why}` } : r.note && !r.why ? { 'data-tip': r.note } : {})}
                {...(grid && r.tile ? { 'data-tile': r.tile } : {})}
                aria-haspopup={r.children ? 'menu' : undefined} aria-expanded={r.children ? opened : undefined} aria-disabled={r.why ? true : undefined}
                className={`flyout-row ${grid ? 'flyout-tile' : ''} ${opened ? 'flyout-row-open' : ''} ${r.why ? 'flyout-row-locked' : ''}`}
                onMouseEnter={() => (r.children && !r.why ? open(level, index, false) : shut(level))}
                onClick={() => {
                  if (r.why) { onLocked(r); return; }
                  // a click opens it (the pointer has opened it already on its way in: a click never shuts it again)
                  if (r.children) { open(level, index, true); return; }
                  onLeaf(r);
                }}>
                {grid ? <>
                  <span className={`flyout-pic ${pic ? '' : 'flyout-pic-icon'}`}>
                    {pic ? <img src={pic} alt="" draggable={false} /> : mark}
                    {r.why && <span className="flyout-pic-lock"><LockMark size={13} /></span>}
                    {r.isNew && !r.why && <NewBadge className="flyout-pic-new" />}
                    {r.children && <span className="flyout-pic-more" aria-hidden>▸</span>}
                  </span>
                  <span className="flyout-label">{r.label}</span>
                  {r.why && <span className="flyout-why">{r.why}</span>}
                </> : <>
                  <span className="flyout-mark">{r.why ? <LockMark size={13} /> : mark}</span>
                  <span className="flyout-text">
                    <span className="flyout-label">{r.label}{r.isNew && !r.why && <NewBadge className="ml-1.5" />}</span>
                    {r.why && <span className="flyout-why">{r.why}</span>}
                  </span>
                  {r.children && <span className="flyout-more" aria-hidden>▸</span>}
                </>}
              </button>
            );
          })}
        </div>
      ); })}
    </div>
  );
}
