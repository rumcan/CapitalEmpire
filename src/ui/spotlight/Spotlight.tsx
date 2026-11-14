// J10 (#1269; the owner, 2026-11-14: "the show me button should show you whatever you need to see an cover the reset with a blur mast or somthing so it is CLEAR
// what you are showing"): the one spotlight every Show me uses (shows.ts puts the request in the store, spot.ts). A full-window layer dims and blurs everything but
// a cut-out round each target (a control found by its data-guide anchor, or a place on the map, followed every frame by one requestAnimationFrame reader), a soft
// gold ring rounds each cut-out, and a caption (the step's title and one line) stands beside the first with an arrow to it. The cut-out is a hole in the layer, so the
// target itself stays clickable; a click anywhere else, Esc, or a click on the target ends it. It never traps focus (focus goes to the target when that takes focus),
// the caption is read out politely, nothing flashes (a slow breathing glow, still under reduced motion), and the blur gives way to a plain darker tint where
// backdrop-filter is missing, under reduced motion, or if the frames come slow while it is up.
import { Fragment, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { ANCHOR_FALLBACK } from '../GuidePulse';
import { holeOf, holePath, mergeHoles, placeCaption, sameHoles, spotHide, spotNow, spotSubscribe, type Box, type Hole, type SpotState, type TileRect } from './spot';
import './spotlight.css';

/** what the spotlight needs of the game: the pulse it set (a pulse target), the map as screen boxes, and a repaint */
export interface SpotView { guideAnchor: { id: string; until: number } | null; spotScreen(r: TileRect): Box | null; emit(): void }

/** how long a target's control may take to come on screen (its card or menu is opening) before its fallback (the rail group that opens it) is used */
const GRACE_MS = 600;
/** how long nothing at all to light ends the spotlight (the thing was never drawn, or went: its card was closed) */
const GONE_MS = 1500, LOST_MS = 900;
/** the mean frame time (ms) over the first frames with the blur up that turns the blur off: the plain tint is then used for the rest of the session */
const SLOW_MS = 40;
let blurSlow = false;

/** Esc ends the spotlight and nothing else: this listener is the first on the window (installed when this module loads), so no card or menu below sees the key */
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && spotNow()) { e.stopImmediatePropagation(); e.preventDefault(); spotHide(); } }, true);
}

/** whether the player has asked for less motion */
function reducedMotion(): boolean { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } }
/** whether the page can blur what is behind a layer and the player has not asked for less motion */
function blurAvailable(): boolean {
  try { return typeof CSS !== 'undefined' && (CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)')) && !reducedMotion(); } catch { return false; }
}
/** a control's corner radius in px (its first corner; a percentage is read against its box) */
function radiusOf(el: Element, w: number, h: number): number {
  try {
    const v = getComputedStyle(el).borderTopLeftRadius, n = parseFloat(v);
    return !Number.isFinite(n) ? 10 : v.endsWith('%') ? (Math.min(w, h) * n) / 100 : n;
  } catch { return 10; }
}
const visible = (el: Element): boolean => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
/** the first visible element carrying data-guide id */
function anchorEl(id: string): HTMLElement | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(`[data-guide="${id}"]`))) if (visible(el)) return el;
  return null;
}
/** the control to light for anchor id: the one already found while it stays on screen (the anchor's own, else its fallback until the anchor's own is drawn), else the
 *  anchor's own, else (once grace is over) the first fallback on screen: the rail group that opens the card the control is in */
function controlFor(id: string, cached: HTMLElement | null, grace: boolean): HTMLElement | null {
  const ok = !!cached && cached.isConnected && visible(cached);
  if (ok && cached!.dataset.guide === id) return cached;
  const own = anchorEl(id); if (own) return own;
  if (ok && (ANCHOR_FALLBACK[id] ?? []).includes(cached!.dataset.guide ?? '')) return cached;
  if (grace) for (const f of ANCHOR_FALLBACK[id] ?? []) { const el = anchorEl(f); if (el) return el; }
  return null;
}
const FOCUSABLE ='button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

export function Spotlight({ game }: { game: SpotView | null }) {
  const spot = useSyncExternalStore(spotSubscribe, spotNow);
  const layer = useRef<HTMLDivElement>(null), cap = useRef<HTMLDivElement>(null), rings = useRef<(HTMLDivElement | null)[]>([]);
  const gameRef = useRef(game); gameRef.current = game;

  // when the spotlight ends the engine's pulse for it goes too (the ring would come back for what is left of its time)
  useEffect(() => spotSubscribe(() => {
    const g = gameRef.current;
    if (!spotNow() && g?.guideAnchor) { g.guideAnchor = null; g.emit(); }
  }), []);

  useLayoutEffect(() => {
    if (!spot || !layer.current || !cap.current) return;
    return track(spot, gameRef, layer.current, cap.current, rings.current);
  }, [spot]);

  return (
    <>
      {/* the caption, read out politely when a Show me starts (the visible one is hidden from readers so it is not read twice) */}
      <div className="sr-only" role="status" aria-live="polite" data-testid="spotlight-live">{spot ? `${spot.req.title}. ${spot.req.line} Press Escape to close.` : ''}</div>
      {spot && (
        <Fragment key={spot.id}>
          <div ref={layer} className="spot-layer ui-unscaled" data-testid="spotlight" data-on="0" aria-hidden onClick={() => spotHide()} onContextMenu={e => { e.preventDefault(); spotHide(); }} />
          {[0, 1, 2].map(i => <div key={i} ref={el => { rings.current[i] = el; }} className="spot-ring ui-unscaled" data-testid="spotlight-ring" aria-hidden style={{ display: 'none' }} />)}
          <div ref={cap} className="spot-cap ui-unscaled" data-testid="spotlight-caption" data-side="below" aria-hidden onClick={() => spotHide()} style={{ visibility: 'hidden' }}>
            <div className="spot-cap-title">{spot.req.title}</div>
            <div className="spot-cap-line">{spot.req.line}</div>
            <div className="spot-cap-hint">Click anywhere or press Esc to close</div>
          </div>
        </Fragment>
      )}
    </>
  );
}

/**
 * runs while a spotlight is up: one requestAnimationFrame reader finds every target's box (reads), then writes the cut-out, the rings and the caption only when something
 * moved, so a still target costs a few reads a frame and no layout. Returns what undoes it
 */
function track(spot: SpotState, gameRef: { current: SpotView | null }, layerEl: HTMLDivElement, capEl: HTMLDivElement, ringEls: (HTMLDivElement | null)[]): () => void {
  const t0 = performance.now(), targets = spot.req.targets;
  const els: (HTMLElement | null)[] = targets.map(() => null), radius = new WeakMap<Element, number>();
  let raf = 0, last: Hole[] = [], lastKey = '', capW = 0, capH = 0, remeasure = true, focused = false, shown = false, lastHole = t0, prevT = 0, frames = 0, sum = 0, n = 0;
  const blur = blurAvailable() && !blurSlow;
  layerEl.dataset.blur = blur ? 'on' : 'off';
  const resize = () => { remeasure = true; };
  window.addEventListener('resize', resize);
  // a click that lands anywhere but the layer or its caption is the player doing the thing (the target is clickable through its cut-out): it is over
  const click = (e: MouseEvent) => { const t = e.target; if (t instanceof Element && t.closest('.spot-layer, .spot-cap')) return; spotHide(); };
  window.addEventListener('click', click, true);

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const g = gameRef.current, S = { w: window.innerWidth, h: window.innerHeight }, grace = now - t0 > GRACE_MS;
    // ---- reads: the caption's size, then every target's box
    if (remeasure) { const r = capEl.getBoundingClientRect(); if (r.width > 0) { capW = r.width; capH = r.height; } }
    const found: { box: Box; radius: number }[] = [];
    targets.forEach((t, i) => {
      if ('tiles' in t) { const b = g?.spotScreen(t.tiles); if (b) found.push({ box: b, radius: 9999 }); return; }
      let id: string | null;
      if ('ui' in t) id = t.ui;
      else { const a = g?.guideAnchor; id = a && a !== spot.base ? a.id : grace ? t.pulse : null; }
      if (!id) return;
      const prev = els[i] ?? null, el = els[i] = controlFor(id, prev, grace);
      if (!el) return;
      if (el !== prev) el.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' }); // a control scrolled out of its card (an upgrade on the range card) is brought into view, and the cut-out follows it
      const r = el.getBoundingClientRect();
      let rad = radius.get(el); if (rad === undefined) { rad = radiusOf(el, r.width, r.height); radius.set(el, rad); }
      found.push({ box: { x: r.left, y: r.top, w: r.width, h: r.height }, radius: rad });
    });
    const holes = mergeHoles(found.map(f => holeOf(f.box, { screen: S, radius: f.radius })).filter((h): h is Hole => !!h));
    // ---- writes, only on a change
    const key = `${S.w}x${S.h}`;
    if (holes.length) {
      lastHole = now;
      if (!sameHoles(holes, last) || key !== lastKey || remeasure) {
        remeasure = false;
        const clip = holePath(holes, S);
        layerEl.style.clipPath = clip; layerEl.style.setProperty('-webkit-clip-path', clip);
        ringEls.forEach((el, i) => {
          const h = holes[i]; if (!el) return;
          if (!h) { el.style.display = 'none'; return; }
          el.style.display = ''; el.style.width = `${h.w}px`; el.style.height = `${h.h}px`; el.style.borderRadius = `${h.r}px`; el.style.transform = `translate(${h.x}px, ${h.y}px)`;
        });
        const p = placeCaption(holes, { w: capW || 300, h: capH || 90 }, S);
        capEl.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`; capEl.style.setProperty('--arrow', `${Math.round(p.arrow)}px`);
        if (capEl.dataset.side !== p.side) capEl.dataset.side = p.side;
        last = holes; lastKey = key;
      }
      if (!shown) { shown = true; layerEl.dataset.on = '1'; capEl.style.visibility = 'visible'; }
      // focus goes to the first control it lights, once, when that takes focus (never trapped: nothing here takes it back)
      if (!focused) {
        focused = true;
        const el = els.find(e => !!e), f = el && el.matches(FOCUSABLE) ? el : null;
        if (f && !(f as HTMLButtonElement).disabled) try { f.focus({ preventScroll: true }); } catch { /* not focusable now */ }
      }
    } else if (now - (shown ? lastHole : t0) > (shown ? LOST_MS : GONE_MS)) { spotHide(); return; } // nothing to light: it was never drawn, or it went
    // ---- the blur gives way to the plain tint when the frames come slow with it up
    if (blur && shown && n >= 0 && layerEl.dataset.blur === 'on' && prevT && ++frames > 8) {
      sum += now - prevT;
      if (++n >= 40) { if (sum / n > SLOW_MS) { blurSlow = true; layerEl.dataset.blur = 'off'; } n = -1; }
    }
    prevT = now;
  };
  raf = requestAnimationFrame(tick);
  return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); window.removeEventListener('click', click, true); };
}
