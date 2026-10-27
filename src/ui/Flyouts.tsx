// The toolbar's cascading flyouts (T193, #502; the rows are flyout-menu.ts). A rail group's flyout opens to its right; a row with children opens
// the next column further right (on a click, or on hover once a flyout is open, like a menu bar); a leaf picks its tool and closes them. Esc, or a
// click anywhere off the rail and the flyouts (that click goes no further), closes them; the keyboard walks them (flyout-menu.ts navKey).
// Every column fits the screen at any size and UI scale (T179's 90-125%): its height is the room under the HUD's top (a longer list scrolls
// vertically, never sideways), its top slides up to stay on screen, and the columns narrow when four of them would pass the right edge. Text
// wraps: no column ever scrolls sideways (the owner: "horizontal menu sliders" are not cool).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { LockMark, NewBadge } from './Rail';
import { columnsOf, navKey, type MenuRow, type NavState } from './flyout-menu';
import { currentUiScale } from './uiScale';
import { SurfaceMark } from './course/SurfaceMark';

/** a column's width (local px, at 100%), the narrowest it may get, the gap between columns, and the room kept under the screen's bottom */
const COL_W = 232, COL_MIN = 184, GAP = 6, BOTTOM = 12;
/** how long the pointer rests on a row before its submenu replaces an open one (ms: a diagonal move to the open one does not switch it) */
const HOVER_MS = 140;

export interface FlyoutsProps {
  rows: MenuRow[];
  /** the rail button's top (local px in the rail's box) and the left edge the first column starts at */
  top: number; left: number;
  /** the rows to open at first (the back arrow: the leaf's parents), and whether the keyboard leads (focus the first row) */
  startPath?: number[]; keyboard?: boolean;
  onLeaf: (r: MenuRow) => void; onLocked: (r: MenuRow) => void; onClose: () => void;
  /** the rail's box: a click on it is the rail's own (it switches or closes the flyouts) */
  railRef?: React.RefObject<HTMLElement | null>;
}

export function Flyouts({ rows, top, left, startPath = [], keyboard = false, onLeaf, onLocked, onClose, railRef }: FlyoutsProps) {
  const [nav, setNav] = useState<NavState>(() => ({ path: startPath, focus: keyboard ? { level: startPath.length, index: Math.max(0, (columnsOf(rows, startPath)[startPath.length] ?? []).findIndex(r => !r.caption)) } : null }));
  const [tops, setTops] = useState<number[]>([]);
  const [room, setRoom] = useState<{ h: number; w: number }>({ h: 600, w: 1200 });
  const box = useRef<HTMLDivElement | null>(null), timer = useRef(0);
  const cols = columnsOf(rows, nav.path);
  // (another group's flyouts are a new Flyouts: App.tsx keys it by the group, so the open rows start again there)
  // the room on screen (local px: the UI layer is zoomed by the UI scale), measured from where the flyouts start
  useLayoutEffect(() => {
    const measure = () => { const s = currentUiScale() || 1, r = box.current?.getBoundingClientRect(); const y0 = r ? r.top : 96, x0 = r ? r.left : 100; setRoom({ h: Math.max(160, (window.innerHeight - y0) / s - BOTTOM), w: Math.max(COL_MIN, (window.innerWidth - x0) / s - BOTTOM) }); };
    measure(); window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure);
  }, []);
  // each column's top: beside the row that opened it, slid up to stay on screen
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const out: number[] = [];
    cols.forEach((_, level) => {
      const col = el.querySelector<HTMLElement>(`[data-flyout-col="${level}"]`); if (!col) { out.push(0); return; }
      const h = col.offsetHeight;
      let want = level === 0 ? top : (() => { const parent = el.querySelector<HTMLElement>(`[data-flyout-col="${level - 1}"]`), row = parent?.querySelector<HTMLElement>(`[data-row="${level - 1}:${nav.path[level - 1]}"]`); return (out[level - 1] ?? 0) + (row ? row.offsetTop - (parent?.scrollTop ?? 0) - 4 : 0); })();
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
      if (!t || box.current?.contains(t) || railRef?.current?.contains(t)) return;
      e.stopPropagation(); e.preventDefault(); onClose();
    };
    window.addEventListener('keydown', onKey, true); window.addEventListener('pointerdown', onDown, true);
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('pointerdown', onDown, true); };
  }, [rows, nav, onLeaf, onLocked, onClose, railRef]);
  // the focused row takes the browser's focus (the screen reader and the visible ring follow the keyboard)
  useEffect(() => { if (nav.focus) box.current?.querySelector<HTMLElement>(`[data-row="${nav.focus.level}:${nav.focus.index}"]`)?.focus(); }, [nav.focus]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const width = Math.max(COL_MIN, Math.min(COL_W, Math.floor((room.w - GAP * cols.length) / Math.max(1, cols.length))));
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
    <div ref={box} className="flyouts" style={{ left }} data-testid="flyouts" role="presentation">
      {cols.map((col, level) => (
        <div key={level} role="menu" aria-orientation="vertical" data-flyout-col={level} className="flyout glass" style={{ top: tops[level] ?? (level ? 0 : top), width, maxHeight: room.h }}>
          {col.map((r, index) => {
            if (r.caption) return <div key={r.key} className="flyout-caption" role="presentation">{r.label}</div>;
            const opened = nav.path[level] === index && !!r.children, focused = nav.focus?.level === level && nav.focus.index === index;
            return (
              <button key={r.key} type="button" role="menuitem" data-row={`${level}:${index}`} data-key={r.key} tabIndex={focused ? 0 : -1}
                data-guide={r.leaf ? `tool-${r.leaf.entry.view?.group ?? r.leaf.entry.id}` : undefined}
                aria-haspopup={r.children ? 'menu' : undefined} aria-expanded={r.children ? opened : undefined} aria-disabled={r.why ? true : undefined}
                className={`flyout-row ${opened ? 'flyout-row-open' : ''} ${r.why ? 'flyout-row-locked' : ''}`}
                onMouseEnter={() => (r.children && !r.why ? open(level, index, false) : shut(level))}
                onClick={() => {
                  if (r.why) { onLocked(r); return; }
                  // a click opens it (the pointer has opened it already on its way in: a click never shuts it again)
                  if (r.children) { open(level, index, true); return; }
                  onLeaf(r);
                }}>
                <span className="flyout-mark">{r.why ? <LockMark size={13} /> : r.mark ? <SurfaceMark kind={r.mark} size={22} /> : r.swatch ? <span className="flyout-swatch" style={{ background: r.swatch }} /> : r.icon ? <Icon name={r.icon} size={20} /> : null}</span>
                <span className="flyout-text">
                  <span className="flyout-label">{r.label}{r.isNew && !r.why && <NewBadge className="ml-1.5" />}</span>
                  {r.why && <span className="flyout-why">{r.why}</span>}
                </span>
                {r.children && <span className="flyout-more" aria-hidden>▸</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
