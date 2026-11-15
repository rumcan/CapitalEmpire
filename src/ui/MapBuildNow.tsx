// The map's BUILD NOW button (#1325; the owner, 2026-11-15: "building a new hole UIX is really bad. it is not clear at all where and what to click to build the actual hole. Add a
// button to the map where you are placeing the hole you to the side of the wireframe outline that says BUILD NOW", then "add the same build now to roads"). One component for
// New hole (with its tee and green chosen) and the road tool (a route of clicks waiting for Enter): a big gold button with the thing's picture at its left and its price, standing
// on the map beside the planned outline, at the side away from the panels. What it says and does is the engine's (buildNowInfo: the same Build the panel's button and Enter do,
// greyed with the reason when it cannot be built); where it stands follows the outline every frame (buildNowPlace gives the outline's screen box into one reused object; placeBuildNow,
// build-now.ts, picks the side; one transform write a frame, and only when it moved). The panels' rectangles are read a few times a second, not every frame.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { ActionTile, TILE_ROW } from './ActionTile';
import { newPlace, panelsLeft, placeBuildNow, type BuildNowInfo, type BuildNowPlace, type Rect } from './build-now';
import { currentUiScale } from './uiScale';
import './build-now.css';

/** what the button needs of the game */
export interface BuildNowGame { buildNowInfo(): BuildNowInfo | null; buildNowPlace(out: BuildNowPlace): boolean; subscribe?(fn: () => void): () => void }

/** the things on the map the button stands clear of, as selectors: the rail and its panel, the cards and flyouts (.glass), the minimap */
const PANELS = '.ui-root .glass, .ui-root [data-testid="rail"], .ui-root [data-testid="minimap"], .ui-root [data-testid="tool-panel"], .ui-root .pointer-events-auto';
/** how often the panels' rectangles are read again (ms): a panel opening or the window changing is not a frame by frame event */
const SCAN_MS = 250;
/** the free map's margins (px): the top bar's bottom edge, and the hint bar under the map */
const EDGE = 8, HINT_H = 56;

/** the panels' rectangles now (css px of the window), skipping the button itself and anything unseen */
function scan(avoid: Rect[], free: Rect): void {
  avoid.length = 0;
  const W = window.innerWidth, H = window.innerHeight;
  free.l = EDGE; free.r = W - EDGE; free.b = H - HINT_H;
  const hud = parseFloat(document.documentElement.style.getPropertyValue('--hud-top')) * currentUiScale();
  free.t = (hud > 0 ? hud : 0) + EDGE;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(PANELS))) {
    if (el.closest('[data-build-now]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 24 || r.right <= 0 || r.bottom <= 0 || r.left >= W || r.top >= H) continue;
    if (r.width * r.height > 0.4 * W * H) continue; // (a layer over the whole window is no panel)
    avoid.push({ l: r.left - 4, t: r.top - 4, r: r.right + 4, b: r.bottom + 4 });
  }
}

export function MapBuildNow({ game }: { game: BuildNowGame }) {
  const info = game.buildNowInfo();
  const box = useRef<HTMLDivElement>(null), btn = useRef<HTMLButtonElement>(null), infoRef = useRef(info);
  infoRef.current = info;
  const id = info?.id ?? '';
  const size = useRef({ w: 220, h: 56 });
  // the button's size, measured when its words change (not every frame)
  useLayoutEffect(() => { const b = btn.current; if (b) { const r = b.getBoundingClientRect(); if (r.width > 0) size.current = { w: r.width, h: r.height }; } });
  // one reader a frame while the button is up: the outline's box, the side, the button's place
  useEffect(() => {
    if (!id) return;
    const place = newPlace(), at = { x: 0, y: 0 }, avoid: Rect[] = [], free: Rect = { l: 0, t: 0, r: 0, b: 0 };
    let raf = 0, last = -1e9, left = false, px = NaN, py = NaN, shown = false;
    scan(avoid, free);
    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      const el = box.current; if (!el) return;
      if (now - last > SCAN_MS) { last = now; scan(avoid, free); left = !panelsLeft(avoid, window.innerWidth); const b = btn.current; if (b) { const r = b.getBoundingClientRect(); if (r.width > 0) size.current = { w: r.width, h: r.height }; } }
      const ok = game.buildNowPlace(place);
      if (!ok) { if (shown) { el.style.visibility = 'hidden'; shown = false; } return; }
      placeBuildNow(place, size.current.w, size.current.h, free, avoid, left, at);
      const x = Math.round(at.x), y = Math.round(at.y);
      if (x !== px || y !== py) { px = x; py = y; el.style.transform = `translate(${x}px, ${y}px)`; }
      if (!shown) { el.style.visibility = 'visible'; shown = true; }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [id, game]);
  if (!info) return null;
  return (
    <div ref={box} className="build-now-wrap ui-unscaled" data-build-now={info.id} data-testid="build-now" style={{ visibility: 'hidden' }}>
      <button ref={btn} type="button" className="build-now" data-ok={info.ok ? '1' : '0'} aria-disabled={!info.ok} title={info.ok ? `Build it now: ${info.price}` : info.why}
        onClick={() => infoRef.current?.build()} onPointerDown={e => e.stopPropagation()}>
        <ActionTile tile={info.tile} size={TILE_ROW} />
        <span className="build-now-words">
          <span className="build-now-head" data-testid="build-now-head">BUILD NOW{info.ok ? ` · ${info.price}` : ''}</span>
          {!info.ok && <span className="build-now-why" data-testid="build-now-why">{info.why}</span>}
        </span>
      </button>
    </div>
  );
}
