// J10 (#1269; the owner, 2026-11-14: "the show me button should show you whatever you need to see an cover the reset with a blur mast or somthing so it is CLEAR
// what you are showing"): the one spotlight every Show me uses (shows.ts puts the request in the store, spot.ts). A full-window layer dims and blurs everything but
// a cut-out round each target (a control found by its data-guide anchor, or a place on the map, followed every frame by one requestAnimationFrame reader), a soft
// gold ring rounds each cut-out, and a caption (the step's title and one line) stands beside the first with an arrow to it. The cut-out is a hole in the layer, so the
// target itself stays clickable; a click anywhere else, Esc, or a click on the target ends it. It never traps focus (focus goes to the target when that takes focus),
// the caption is read out politely, nothing flashes (a slow breathing glow, still under reduced motion), and the blur gives way to a plain darker tint where
// backdrop-filter is missing, under reduced motion, or if the frames come slow while it is up.
import { Fragment, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { ANCHOR_FALLBACK } from '../GuidePulse';
import { holeOf, holePath, mergeHoles, placeCaption, spotHide, spotNow, spotSubscribe, type Box, type Hole, type SpotState, type TileRect } from './spot';
import './spotlight.css';

/** what the spotlight needs of the game: the pulse it set (a pulse target), the map as screen boxes (spotScreen writes the box into out: no allocation a frame), and a repaint */
export interface SpotView { guideAnchor: { id: string; until: number } | null; spotScreen(r: TileRect, out: Box): boolean; emit(): void }

/** how long a target's control may take to come on screen (its card or menu is opening) before its fallback (the rail group that opens it) is used */
const GRACE_MS = 600;
/** how long nothing at all to light ends the spotlight (the thing was never drawn, or went: its card was closed) */
const GONE_MS = 1500, LOST_MS = 900;
/** the median frame time (ms) with the blur up above which the blur is given up for the plain tint: just under 30 frames a second. It is judged on frames where nothing moved, from
 *  JUDGE_AFTER_MS after the spotlight came up (the camera easing to a map target, and the ground baking there, make slow frames on any machine, and are not the blur's). One
 *  spotlight that came up slow loses its blur; the second does so for the rest of the session (one slow spell, the machine busy for a moment, does not take the blur away for good) */
const SLOW_MS = 34, JUDGE_AFTER_MS = 1000;
let blurSlow = false, slowStrikes = 0;

/** Esc ends the spotlight and nothing else: this listener is the first on the window (installed when this module loads), so no card or menu below sees the key */
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && spotNow()) { e.stopImmediatePropagation(); e.preventDefault(); spotHide(); } }, true);
}

/** whether the player has asked for less motion */
function reducedMotion(): boolean { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } }
/** whether the page can blur what is behind a layer and the player has asked for neither less motion nor less transparency */
function blurAvailable(): boolean {
  try {
    return typeof CSS !== 'undefined' && (CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)')) && !reducedMotion()
      && !window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
  } catch { return false; }
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
const FOCUSABLE = 'button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

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

/** a box is the same as last frame's to within this many px (the tracker writes the layer only when a target has moved more) */
const EPS = 0.5;

/**
 * runs while a spotlight is up: one requestAnimationFrame reader finds every target's box (reads, as numbers in two small typed arrays) and writes the cut-out, the rings
 * and the caption only when a box has moved, so a frame where nothing moved reads one rectangle per target and compares numbers: no writes, nothing allocated but the
 * browser's own rectangles. Returns what undoes it
 */
function track(spot: SpotState, gameRef: { current: SpotView | null }, layerEl: HTMLDivElement, capEl: HTMLDivElement, ringEls: (HTMLDivElement | null)[]): () => void {
  const t0 = performance.now(), targets = spot.req.targets, n = targets.length;
  const els: (HTMLElement | null)[] = targets.map(() => null), radius = new WeakMap<Element, number>();
  // each target's box this frame and last: x, y, w, h, radius (w -1: not found), and one box the map's boxes are written into
  const cur = new Float64Array(n * 5), was = new Float64Array(n * 5).fill(-1e9), mapBox: Box = { x: 0, y: 0, w: 0, h: 0 }, ivs = new Float64Array(24);
  let raf = 0, last: Hole[] = [], lastW = 0, lastH = 0, capW = 0, capH = 0, remeasure = true, focused = false, shown = false, lastHole = t0, prevT = 0, tShown = 0, steady = 0, slowN = 0, tJudge = 0, judged = false;
  const blur = blurAvailable() && !blurSlow;
  layerEl.dataset.blur = blur ? 'on' : 'off';
  const resize = () => { remeasure = true; };
  window.addEventListener('resize', resize);
  // a click that lands anywhere but the layer or its caption is the player doing the thing (the target is clickable through its cut-out): it is over
  const click = (e: MouseEvent) => { const t = e.target; if (t instanceof Element && t.closest('.spot-layer, .spot-cap')) return; spotHide(); };
  window.addEventListener('click', click, true);

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const g = gameRef.current, sw = window.innerWidth, sh = window.innerHeight, grace = now - t0 > GRACE_MS;
    // ---- reads: the caption's size, then every target's box
    if (remeasure) { const r = capEl.getBoundingClientRect(); if (r.width > 0) { capW = r.width; capH = r.height; } }
    let moved = remeasure || sw !== lastW || sh !== lastH;
    for (let i = 0; i < n; i++) {
      const t = targets[i]!, o = i * 5;
      let found = false;
      if ('tiles' in t) {
        if (g && g.spotScreen(t.tiles, mapBox)) { cur[o] = mapBox.x; cur[o + 1] = mapBox.y; cur[o + 2] = mapBox.w; cur[o + 3] = mapBox.h; cur[o + 4] = 9999; found = true; }
      } else {
        let id: string | null;
        if ('ui' in t) id = t.ui;
        else { const a = g?.guideAnchor; id = a && a !== spot.base ? a.id : grace ? t.pulse : null; }
        if (id) {
          const prev = els[i] ?? null;
          // the common frame: the control found already is still on screen under its own anchor: one read. Else look again (it moved to another card, was hidden, or is not drawn yet)
          let el: HTMLElement | null = prev && prev.isConnected && prev.dataset.guide === id ? prev : null, r = el ? el.getBoundingClientRect() : null;
          if (r && (r.width <= 0 || r.height <= 0)) { el = null; r = null; }
          if (!el) { el = controlFor(id, prev, grace); r = el ? el.getBoundingClientRect() : null; }
          els[i] = el;
          if (el && r) {
            if (el !== prev) el.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' }); // a control scrolled out of its card (an upgrade on the range card) is brought into view, and the cut-out follows it
            let rad = radius.get(el); if (rad === undefined) { rad = radiusOf(el, r.width, r.height); radius.set(el, rad); }
            cur[o] = r.left; cur[o + 1] = r.top; cur[o + 2] = r.width; cur[o + 3] = r.height; cur[o + 4] = rad; found = true;
          }
        }
      }
      if (!found) cur[o + 2] = -1;
      if (!moved) for (let k = 0; k < 5; k++) if (Math.abs(cur[o + k]! - was[o + k]!) > EPS) { moved = true; break; }
    }
    // ---- writes, only when a box moved (or the window did)
    if (moved) {
      remeasure = false; lastW = sw; lastH = sh; was.set(cur);
      const S = { w: sw, h: sh }, holes: Hole[] = [];
      for (let i = 0; i < n; i++) {
        const o = i * 5; if (cur[o + 2]! < 0) continue;
        const h = holeOf({ x: cur[o]!, y: cur[o + 1]!, w: cur[o + 2]!, h: cur[o + 3]! }, { screen: S, radius: cur[o + 4]! }); if (h) holes.push(h);
      }
      last = mergeHoles(holes);
      if (last.length) {
        const clip = holePath(last, S);
        layerEl.style.clipPath = clip; layerEl.style.setProperty('-webkit-clip-path', clip);
        ringEls.forEach((el, i) => {
          const h = last[i]; if (!el) return;
          if (!h) { el.style.display = 'none'; return; }
          el.style.display = ''; el.style.width = `${h.w}px`; el.style.height = `${h.h}px`; el.style.borderRadius = `${h.r}px`; el.style.transform = `translate(${h.x}px, ${h.y}px)`;
        });
        const p = placeCaption(last, { w: capW || 300, h: capH || 90 }, S);
        capEl.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`; capEl.style.setProperty('--arrow', `${Math.round(p.arrow)}px`);
        if (capEl.dataset.side !== p.side) capEl.dataset.side = p.side;
      }
    }
    if (last.length) {
      lastHole = now;
      if (!shown) { shown = true; tShown = now; layerEl.dataset.on = '1'; capEl.style.visibility = 'visible'; }
      // focus goes to the first control it lights, once, when that takes focus (never trapped: nothing here takes it back)
      if (!focused) {
        focused = true;
        const el = els.find(e => !!e), f = el && el.matches(FOCUSABLE) ? el : null;
        if (f && !(f as HTMLButtonElement).disabled) try { f.focus({ preventScroll: true }); } catch { /* not focusable now */ }
      }
    } else if (now - (shown ? lastHole : t0) > (shown ? LOST_MS : GONE_MS)) { spotHide(); return; } // nothing to light: it was never drawn, or it went
    // ---- the blur gives way to the plain tint when the frames come slow with it up: judged on the median frame over up to 24 frames where nothing moved, from JUDGE_AFTER_MS on
    // (the camera easing to a map target and the ground baking there make slow frames on any machine), leaving out the first two of them
    if (blur && shown && !judged && prevT && !moved && now - tShown > JUDGE_AFTER_MS && ++steady > 2) {
      if (slowN === 0) tJudge = now;
      ivs[slowN++] = now - prevT;
      if (slowN >= ivs.length || (slowN >= 4 && now - tJudge > 1500)) {
        judged = true;
        if (ivs.subarray(0, slowN).sort()[slowN >> 1]! > SLOW_MS && layerEl.dataset.blur === 'on') { layerEl.dataset.blur = 'off'; if (++slowStrikes >= 2) blurSlow = true; }
      }
    }
    prevT = now;
  };
  raf = requestAnimationFrame(tick);
  return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); window.removeEventListener('click', click, true); };
}
