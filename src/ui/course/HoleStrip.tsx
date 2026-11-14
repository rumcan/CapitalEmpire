import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Game } from '../../game/engine';
import { JAM } from '../../game/features';
import type { HoleView } from '../../game/golf/holeview';
import { HOLE_COUNT } from '../../game/paint-tool';
import { ActionTile, TILE_SMALL } from '../ActionTile'; // J8 (#1261): Edit Hole Layout wears its painted tile (in place of the pencil)
import { currentUiScale } from '../uiScale';
import { placeMenu } from './menu-place';

/** New hole: the plan mode (golf: click a tee, then a green; T102) or, in a classic game, the next free hole to paint by hand. #1296 (the owner: "clicking on plan
 *  a hole does nothing"): the wizard waits on the next hole's tee after every Build, so Plan a hole found its card open already and changed nothing on screen. Now
 *  where it finds it so (or `show`, the + menu's Plan a hole) it shows what it did: a toast says which hole and what to click, the camera goes where its tee may go
 *  and the Holes panel scrolls to the wizard's card (Game.planHoleShown). False when it could not open (the reason is a toast: a classic game, a lock, every hole in use) */
export function newHole(game: Game, show = false): boolean {
  const p = game.paint;
  if (game.golfMode) {
    const waiting = p.planOpen && !p.wizard.base && p.wizard.step === 'tee';
    if (!p.setPlan()) return false;
    if (show || waiting) game.planHoleShown();
    return true;
  }
  const f = p.nextFreeHole(); if (f) { game.goToHole(f); p.setBrush(p.brushKind); return true; } game.toast(`All ${HOLE_COUNT} holes have areas`, 'warn'); return false;
}

/** the + badge's dropdown, on the UI layer over the panel's edge (#1296, the owner: "the window should be overflow visible"): the Holes panel scrolls, and a menu inside it
 *  was cut off by the panel's bottom edge, its last items out of reach. It is a child of the UI root (so the Text size scales it like the rest), fixed to the window, placed
 *  under the badge once its size is known (above it near the window's bottom) and kept inside the window; Esc, a press outside, a scroll or a resize puts it away */
function HoleMenu({ anchor, onClose, children }: { anchor: HTMLElement | null; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const place = useCallback(() => {
    const b = box.current; if (!b || !anchor) return;
    const s = currentUiScale(), a = anchor.getBoundingClientRect(), m = b.getBoundingClientRect(), at = placeMenu(a, m, window.innerWidth, window.innerHeight);
    b.style.left = `${at.left / s}px`; b.style.top = `${at.top / s}px`; b.style.visibility = 'visible'; // (the UI root zooms by the Text size: its units are the window's over the scale)
  }, [anchor]);
  useLayoutEffect(place, [place]);
  useEffect(() => {
    const inside = (t: EventTarget | null) => t instanceof Node && (box.current?.contains(t) || anchor?.contains(t));
    const down = (e: PointerEvent) => { if (!inside(e.target)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onClose(); anchor?.focus(); } };
    const scroll = (e: Event) => { if (!inside(e.target)) onClose(); }, resize = () => place();
    document.addEventListener('pointerdown', down, true); window.addEventListener('keydown', key, true); document.addEventListener('scroll', scroll, true); window.addEventListener('resize', resize);
    return () => { document.removeEventListener('pointerdown', down, true); window.removeEventListener('keydown', key, true); document.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', resize); };
  }, [anchor, onClose, place]);
  const host = typeof document !== 'undefined' ? document.querySelector('.ui-root') ?? document.body : null;
  if (!host) return null;
  return createPortal(<div ref={box} role="menu" className="hole-menu glass-2" style={{ visibility: 'hidden' }} data-testid="hole-menu">{children}</div>, host);
}

/** a hole's badge state (P23 4.3, colour never alone: each has an icon): ✓ ready, ◔ growing (grow: Game.holeGrowLabel's 'growing · ready Mar
 *  1985', '' once grown in: P23 4.6, T135), ! needs attention */
export interface HoleState { kind: 'ready' | 'growing' | 'attn'; icon: string; word: string }
export function holeState(v: HoleView, grow: string): HoleState {
  if (!v.ok) return { kind: 'attn', icon: '!', word: 'needs attention' };
  if (grow) return { kind: 'growing', icon: '◔', word: grow };
  return { kind: 'ready', icon: '✓', word: 'ready' };
}

/** the Holes panel's Your holes (P23 4.3): a badge per hole that exists ("Hole 1", T205), each with its icon as well as its colour, the current one ringed (a
 *  click makes it current, moves the camera there and opens its hole card, T174; dragged onto another badge, the two trade numbers, D4.12), and the "+" badge (New hole ▾: Plan a hole · From a saved hole · An empty hole to
 *  paint by hand); one status line under them for the current hole ("Hole 1 · par 4 · 342 m · growing · ready Mar 1985", wrapping, then
 *  ✎ Edit hole 1, T205) and, when it needs
 *  attention, what it is missing */
export function HoleStrip({ game }: { game: Game }) {
  const p = game.paint, views = game.courseHoleViews(), cur = p.brushHole, cv = views[cur - 1];
  /** a hole's grow-in words (T121, T135: the one source, Game.holeGrowLabel), '' once it is grown in */
  const growth = (n: number) => game.holeGrowLabel(n);
  const [menu, setMenu] = useState(false), addBtn = useRef<HTMLButtonElement>(null);
  /** the badge being dragged to renumber (T174, P23 D4.12: dropped on another badge, the two trade numbers); 0: none */
  const [drag, setDrag] = useState(0);
  const built = views.filter(v => v.started), scored = views.filter(v => v.par > 0);
  const totalPar = scored.reduce((s, v) => s + v.par, 0), totalM = scored.reduce((s, v) => s + v.lengthM, 0);
  const curState = cv?.started ? holeState(cv, growth(cur)) : null;
  const empty = () => { const f = p.nextFreeHole(); if (!f) { game.toast(`All ${HOLE_COUNT} holes are in use`, 'warn'); return; } game.goToHole(f); p.setBrush(p.brushKind); };
  const pick = (f: () => void) => () => { setMenu(false); f(); };
  const missing = cv?.started && !cv.ok ? [...cv.checks.filter(c => !c.ok).map(c => c.label), ...cv.warnings].slice(0, 3) : [];
  /** T205: the status line's ✎ Edit hole n goes straight into New hole's editor on the current hole (a hole New hole planned); while that
   *  editor is open it reads "Editing hole n" */
  const planned = !!cv?.started && p.hasPlan(cur), editing = planned && p.editingHole === cur;
  return (
    <section data-section="holes" className="mt-3">
      <div className="sec-head"><h3 className="label-caps">Your holes</h3>{scored.length > 1 && <span className="sec-note">{`${scored.length} holes · par ${totalPar} · ${totalM} m`}</span>}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {built.map(v => {
          const st = holeState(v, growth(v.n)), on = cur === v.n;
          return (
            <button key={v.n} data-hole={v.n} aria-pressed={on} className={`hole-badge hole-${st.kind} ${on ? 'hole-badge-on' : ''} ${drag === v.n ? 'opacity-50' : ''}`} title={`Hole ${v.n}${v.par ? ` · par ${v.par} · ${v.lengthM} m` : ''} · ${st.word} · click for its card; drag onto another badge to trade numbers`}
              onClick={() => { game.goToHole(v.n); game.openHoleCard(v.n); }}
              draggable onDragStart={e => { e.dataTransfer.setData('text/plain', String(v.n)); e.dataTransfer.effectAllowed = 'move'; setDrag(v.n); }} onDragEnd={() => setDrag(0)}
              onDragOver={e => { if (drag && drag !== v.n) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
              onDrop={e => { e.preventDefault(); const from = +e.dataTransfer.getData('text/plain') || drag; setDrag(0); if (from && from !== v.n) game.renumberHole(from, v.n); }}>
              <span className="hole-icon" aria-hidden>{st.icon}</span>{`Hole ${v.n}`}
            </button>
          );
        })}
        {cv && !cv.started && built.length > 0 && <span className="hole-badge hole-empty hole-badge-on" title={`Hole ${cur}: empty, painted by hand`}>{`Hole ${cur}`}</span>}
        {/* (T459, the jam MVP: holes come from New hole alone: no saved holes and no painting by hand, docs/JAM.md "Future development": the + plans a hole at once) */}
        {JAM
          ? <button className="hole-badge hole-add" title="Plan a hole: click a tee, then a green" data-testid="hole-add" onClick={() => newHole(game, true)}>+ <span className="text-[12px]">New hole</span></button>
          : (
            <div className="relative">
              <button ref={addBtn} className="hole-badge hole-add" aria-haspopup="menu" aria-expanded={menu} title="New hole" data-testid="hole-add" onClick={() => setMenu(!menu)}>+ <span aria-hidden>▾</span></button>
              {menu && (
                <HoleMenu anchor={addBtn.current} onClose={() => setMenu(false)}>
                  <button role="menuitem" data-testid="hole-menu-plan" onClick={pick(() => newHole(game, true))}>Plan a hole<small>Click a tee, then a green</small></button>
                  <button role="menuitem" data-testid="hole-menu-saved" onClick={pick(() => p.setMode('hole'))}>From a saved hole<small>Place one of your saved holes</small></button>
                  <button role="menuitem" data-testid="hole-menu-empty" onClick={pick(empty)}>An empty hole<small>Paint it by hand, cell by cell</small></button>
                </HoleMenu>
              )}
            </div>
          )}
      </div>
      <div className="status-line mt-1.5" data-status>
        <span className="min-w-0">{!cv ? '' : cv.started
          ? `Hole ${cur}${cv.par ? ` · par ${cv.par} · ${cv.lengthM} m` : ''} · ${curState!.word}`
          : built.length ? `Hole ${cur} · empty: paint a green and a tee` : 'No holes yet: New hole plans one for you'}</span>
        {planned && <button className={`chip ${editing ? 'chip-editing' : ''}`} disabled={editing} onClick={() => game.editHole(cur)} title={editing ? `Hole ${cur}'s layout editor is open above: drag the tee, the green or the line, then Move tees and flag` : `Edit Hole Layout on hole ${cur}: drag the tee, the green or the line; it moves the tee markers and the flag, no grass is laid`} data-testid="status-edit">{editing ? `Editing hole ${cur}` : <><ActionTile tile="edit-hole" size={TILE_SMALL} />Edit Hole Layout</>}</button>}
      </div>
      {missing.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5">
          {missing.map(m => <li key={m} className="sub-line flex items-center gap-1.5"><span className="text-amber-400" aria-hidden>✗</span>{m}</li>)}
        </ul>
      )}
    </section>
  );
}
