import { useState } from 'react';
import type { Game } from '../../game/engine';
import type { HoleView } from '../../game/golf/holeview';
import { HOLE_COUNT } from '../../game/paint-tool';

/** New hole: the plan mode (golf: click a tee, then a green; T102) or, in a classic game, the next free hole to paint by hand */
export function newHole(game: Game) {
  const p = game.paint;
  if (game.golfMode) { p.setPlan(); return; }
  const f = p.nextFreeHole(); if (f) { game.goToHole(f); p.setBrush(p.brushKind); } else game.toast(`All ${HOLE_COUNT} holes have areas`, 'warn');
}

/** a hole's badge state (P23 4.3, colour never alone: each has an icon): ✓ ready, ◔ growing (with the month it is ready in), ! needs attention */
export interface HoleState { kind: 'ready' | 'growing' | 'attn'; icon: string; word: string }
export function holeState(v: HoleView, growth: { growing: boolean; ready: string } | null): HoleState {
  if (!v.ok) return { kind: 'attn', icon: '!', word: 'needs attention' };
  if (growth?.growing) return { kind: 'growing', icon: '◔', word: `growing, ready ${growth.ready}` };
  return { kind: 'ready', icon: '✓', word: 'ready' };
}

/** the Holes panel's Your holes (P23 4.3): a badge per hole that exists, each with its icon as well as its colour, the current one ringed (a
 *  click makes it current and moves the camera there), and the "+" badge (New hole ▾: Plan a hole · From a saved hole · An empty hole to
 *  paint by hand); one status line under them for the current hole ("Hole 1 · par 4 · 342 m · growing, ready Mar 1985") and, when it needs
 *  attention, what it is missing */
export function HoleStrip({ game }: { game: Game }) {
  const p = game.paint, views = game.courseHoleViews(), cur = p.brushHole, cv = views[cur - 1];
  const [menu, setMenu] = useState(false);
  const built = views.filter(v => v.started), scored = views.filter(v => v.par > 0);
  const totalPar = scored.reduce((s, v) => s + v.par, 0), totalM = scored.reduce((s, v) => s + v.lengthM, 0);
  const curState = cv?.started ? holeState(cv, game.holeGrowthOf(cur)) : null;
  const empty = () => { const f = p.nextFreeHole(); if (!f) { game.toast(`All ${HOLE_COUNT} holes are in use`, 'warn'); return; } game.goToHole(f); p.setBrush(p.brushKind); };
  const pick = (f: () => void) => () => { setMenu(false); f(); };
  const missing = cv?.started && !cv.ok ? [...cv.checks.filter(c => !c.ok).map(c => c.label), ...cv.warnings].slice(0, 3) : [];
  return (
    <section data-section="holes" className="mt-3">
      <div className="sec-head"><h3 className="label-caps">Your holes</h3>{scored.length > 1 && <span className="sec-note">{`${scored.length} holes · par ${totalPar} · ${totalM} m`}</span>}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {built.map(v => {
          const st = holeState(v, game.holeGrowthOf(v.n)), on = cur === v.n;
          return (
            <button key={v.n} data-hole={v.n} aria-pressed={on} className={`hole-badge hole-${st.kind} ${on ? 'hole-badge-on' : ''}`} title={`Hole ${v.n}${v.par ? ` · par ${v.par} · ${v.lengthM} m` : ''} · ${st.word}`} onClick={() => game.goToHole(v.n)}>
              <span className="hole-icon" aria-hidden>{st.icon}</span>{v.n}
            </button>
          );
        })}
        {cv && !cv.started && built.length > 0 && <span className="hole-badge hole-empty hole-badge-on" title={`Hole ${cur}: empty, painted by hand`}>{cur}</span>}
        <div className="relative">
          <button className="hole-badge hole-add" aria-haspopup="menu" aria-expanded={menu} title="New hole" onClick={() => setMenu(!menu)}>+ <span aria-hidden>▾</span></button>
          {menu && (
            <div role="menu" className="hole-menu glass-2">
              <button role="menuitem" onClick={pick(() => newHole(game))}>Plan a hole<small>Click a tee, then a green</small></button>
              <button role="menuitem" onClick={pick(() => p.setMode('hole'))}>From a saved hole<small>Place one of your saved holes</small></button>
              <button role="menuitem" onClick={pick(empty)}>An empty hole<small>Paint it by hand, cell by cell</small></button>
            </div>
          )}
        </div>
      </div>
      <div className="status-line mt-1.5" data-status>
        {!cv ? '' : cv.started
          ? `Hole ${cur}${cv.par ? ` · par ${cv.par} · ${cv.lengthM} m` : ''} · ${curState!.word}`
          : built.length ? `Hole ${cur} · empty: paint a green and a tee` : 'No holes yet: New hole plans one for you'}
      </div>
      {missing.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5">
          {missing.map(m => <li key={m} className="sub-line flex items-center gap-1.5"><span className="text-amber-400" aria-hidden>✗</span>{m}</li>)}
        </ul>
      )}
    </section>
  );
}
