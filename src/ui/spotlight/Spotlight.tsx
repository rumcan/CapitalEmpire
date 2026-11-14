// J10 (#1269; the owner, 2026-11-14: "the show me button should show you whatever you need to see an cover the reset with a blur mast or somthing so it is CLEAR
// what you are showing"): the one spotlight every Show me uses (shows.ts puts the request in the store, spot.ts). A full-window layer dims and blurs everything but
// a cut-out round each target (a control found by its data-guide anchor, or a place on the map, followed every frame by one requestAnimationFrame reader), a soft
// gold ring rounds each cut-out, and a caption (the step's title and one line) stands beside the first with an arrow to it. The cut-out is a hole in the layer, so the
// target itself stays clickable; a click anywhere else, or Esc, ends it. It never traps focus (focus goes to the lit control when that takes focus), the caption is read
// out politely, nothing flashes (a slow breathing glow, still under reduced motion), and the blur gives way to a plain darker tint where backdrop-filter is missing,
// under reduced motion, or if the frames come slow while it is up.
// #1297 (the owner, 2026-11-14: the guide's Show me lit the Course button, "clicking there does not open", and never led on to the thing the step names): the cut-out is the
// control itself (a few px of air), so what is lit is what a click reaches, and the layer takes no click at all until something is lit. A target inside a menu has a lead
// (leads.ts): the spotlight lights the deepest level of its chain that is on screen, the rail button first. A click on a lit outer level is a real click on it (it opens its
// menu) and the spotlight stays up and lights the next level when it appears; a click on the last level, the entry itself, ends it, having done what the entry does. Left
// alone for a moment the spotlight opens the next level itself (App.tsx's reveal). The reader still reads one rectangle a frame: the deeper levels are looked for a few
// times a second (SCAN_MS), and a click asks for a look at once.
import { Fragment, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { chainOf, crumbsOf, deepestOn } from './leads';
import { holeOf, holePath, mergeHoles, placeCaption, spotHide, spotNow, spotShow, spotSubscribe, type Box, type Hole, type SpotState, type TileRect } from './spot';
import './spotlight.css';

/** what the spotlight needs of the game: the pulse it set (a pulse target), the map as screen boxes (spotScreen writes the box into out: no allocation a frame), and a repaint */
export interface SpotView { guideAnchor: { id: string; until: number } | null; spotScreen(r: TileRect, out: Box): boolean; emit(): void }
/** #1297: opens the menu level after the one lit (App.tsx): id is the target's anchor, level the lit control's place in its chain (leads.ts chainOf: 0 the target, 1.. the levels
 *  before it, the rail button last). True when it opened something */
export type Reveal = (id: string, level: number) => boolean;

/** how long a target's control may take to come on screen (its card or menu is opening) before its fallback (the rail group that opens it) is used */
const GRACE_MS = 600;
/** how long nothing at all to light ends the spotlight (the thing was never drawn, or went: its card was closed) */
const GONE_MS = 1500, LOST_MS = 900;
/** how often a lit outer level looks for the deeper level that a click or the pointer opened (a menu opening is not a frame by frame event), and how long an outer level may
 *  stay lit, untouched, before the spotlight opens the next level itself */
const SCAN_MS = 120, DWELL_MS = 3000;
/** the median frame time (ms) with the blur up above which the blur is given up for the plain tint: just under 30 frames a second. It is judged on frames where nothing moved, from
 *  JUDGE_AFTER_MS after the spotlight came up (the camera easing to a map target, and the ground baking there, make slow frames on any machine, and are not the blur's). One
 *  spotlight that came up slow loses its blur; the second does so for the rest of the session (one slow spell, the machine busy for a moment, does not take the blur away for good) */
const SLOW_MS = 34, JUDGE_AFTER_MS = 1000;
let blurSlow = false, slowStrikes = 0;

/** Esc ends the spotlight and nothing else: this listener is the first on the window (installed when this module loads), so no card or menu below sees the key */
if (typeof window !== 'undefined') {
  // (a debugging hook like __game: scripts/dev/spotlight-click-shots.mjs puts any request up and follows its lead)
  Object.assign(window as unknown as Record<string, unknown>, { __spot: { show: spotShow, hide: spotHide, now: spotNow } });
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
/** the control to light for anchor id and its level in the chain (leads.ts chainOf: 0 the anchor's own, then the levels of its menu, the rail button last): the deepest level that
 *  is on screen. Until grace is over only the anchor's own counts (its card or menu is opening: lighting an outer level first would flash it and move on). null: none on screen */
function resolve(id: string, grace: boolean): { el: HTMLElement; level: number } | null {
  let found: HTMLElement | null = null;
  const k = deepestOn(chainOf(id), a => (found = anchorEl(a)) !== null, grace); // (the loop stops at the first level on screen: found is that level's control)
  return k >= 0 && found ? { el: found, level: k } : null;
}
const FOCUSABLE = 'button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';
/** takes the browser's focus to a lit control that takes focus (never from a field the player is typing in) */
function focusLit(el: HTMLElement | null): void {
  if (!el || !el.matches(FOCUSABLE) || (el as HTMLButtonElement).disabled) return;
  const a = document.activeElement; if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
  try { el.focus({ preventScroll: true }); } catch { /* not focusable now */ }
}

export function Spotlight({ game, reveal }: { game: SpotView | null; reveal?: Reveal }) {
  const spot = useSyncExternalStore(spotSubscribe, spotNow);
  const layer = useRef<HTMLDivElement>(null), cap = useRef<HTMLDivElement>(null), crumbs = useRef<HTMLDivElement>(null), levelLive = useRef<HTMLDivElement>(null), rings = useRef<(HTMLDivElement | null)[]>([]);
  const gameRef = useRef(game); gameRef.current = game;
  const revealRef = useRef(reveal); revealRef.current = reveal;

  // when the spotlight ends the engine's pulse for it goes too (the ring would come back for what is left of its time)
  useEffect(() => spotSubscribe(() => {
    const g = gameRef.current;
    if (!spotNow() && g?.guideAnchor) { g.guideAnchor = null; g.emit(); }
  }), []);

  useLayoutEffect(() => {
    if (!spot || !layer.current || !cap.current || !crumbs.current || !levelLive.current) return;
    return track(spot, gameRef, revealRef, layer.current, cap.current, crumbs.current, levelLive.current, rings.current);
  }, [spot]);

  return (
    <>
      {/* the caption, read out politely when a Show me starts (the visible one is hidden from readers so it is not read twice) */}
      <div className="sr-only" role="status" aria-live="polite" data-testid="spotlight-live">{spot ? `${spot.req.title}. ${spot.req.line} Press Escape to close.` : ''}</div>
      {/* the level lit now, said again each time the lead goes on to the next (tracker: only when the level changes) */}
      <div ref={levelLive} className="sr-only" role="status" aria-live="polite" data-testid="spotlight-level" />
      {spot && (
        <Fragment key={spot.id}>
          <div ref={layer} className="spot-layer ui-unscaled" data-testid="spotlight" data-on="0" aria-hidden onClick={() => spotHide()} onContextMenu={e => { e.preventDefault(); spotHide(); }} />
          {[0, 1, 2].map(i => <div key={i} ref={el => { rings.current[i] = el; }} className="spot-ring ui-unscaled" data-testid="spotlight-ring" aria-hidden style={{ display: 'none' }} />)}
          <div ref={cap} className="spot-cap ui-unscaled" data-testid="spotlight-caption" data-side="below" aria-hidden onClick={() => spotHide()} style={{ visibility: 'hidden' }}>
            <div className="spot-cap-title">{spot.req.title}</div>
            {/* the way down the menu, the level lit now in gold (tracker: only when the level changes) */}
            <div ref={crumbs} className="spot-cap-crumbs" data-testid="spotlight-crumbs" hidden />
            <div className="spot-cap-line">{spot.req.line}</div>
            <div className="spot-cap-hint">Click the lit control to go on. Click elsewhere or press Esc to close</div>
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
 * browser's own rectangles. A lit outer level of a menu (the rail button) looks for its deeper levels a few times a second, not every frame. Returns what undoes it
 */
function track(spot: SpotState, gameRef: { current: SpotView | null }, revealRef: { current: Reveal | undefined }, layerEl: HTMLDivElement, capEl: HTMLDivElement, crumbEl: HTMLDivElement, liveEl: HTMLDivElement, ringEls: (HTMLDivElement | null)[]): () => void {
  const t0 = performance.now(), targets = spot.req.targets, n = targets.length;
  const els: (HTMLElement | null)[] = targets.map(() => null), ids: (string | null)[] = targets.map(() => null), radius = new WeakMap<Element, number>();
  // each target's box this frame and last: x, y, w, h, radius (w -1: not found), and one box the map's boxes are written into; lvl: each lit control's level in its chain (0: its own anchor)
  const cur = new Float64Array(n * 5), was = new Float64Array(n * 5).fill(-1e9), mapBox: Box = { x: 0, y: 0, w: 0, h: 0 }, ivs = new Float64Array(24), lvl = new Int8Array(n);
  const avoid: Box[] = []; // the open menu's rows, read once for each level lit (and when the window changes), not every frame a map target's cut-out follows the camera
  let avoidFor = -1;
  let raf = 0, last: Hole[] = [], lastW = 0, lastH = 0, capW = 0, capH = 0, remeasure = true, shown = false, lastHole = t0, prevT = 0, tShown = 0, steady = 0, slowN = 0, tJudge = 0, judged = false;
  // the level lit now (the first lit control's anchor and place in its chain), since when, how many changes so far, and the one the spotlight already opened the next of by itself
  let lastScan = -1e9, rescan = true, sigId: string | null = null, sigLvl = -1, levelSince = t0, levelNo = 0, openedFor = -1;
  const blur = blurAvailable() && !blurSlow;
  layerEl.dataset.blur = blur ? 'on' : 'off';
  const resize = () => { remeasure = true; avoidFor = -1; };
  window.addEventListener('resize', resize);
  // a click is the player doing the thing. On a lit outer level (a menu's rail button or group) it is a real click on it: the menu opens and the spotlight goes on to the next level.
  // On the last level, or anywhere else but the layer or its caption (which end it themselves), it ends it
  const click = (e: MouseEvent) => {
    const t = e.target; if (!(t instanceof Element) || t.closest('.spot-layer, .spot-cap')) return;
    for (let i = 0; i < n; i++) { const el = els[i]; if (el && lvl[i]! > 0 && el.contains(t)) { rescan = true; levelSince = performance.now(); return; } }
    spotHide();
  };
  window.addEventListener('click', click, true);

  /** the caption's way down the menu: the names of the levels with the lit one in gold. Written when the level changes, never per frame */
  const writeCrumbs = (id: string | null, level: number) => {
    const names = id ? crumbsOf(id) : null;
    crumbEl.replaceChildren();
    if (!names || names.length < 2) { crumbEl.hidden = true; liveEl.textContent = ''; return; }
    crumbEl.hidden = false;
    const at = names.length - 1 - level; // (the chain counts from the target; the names from the rail button)
    liveEl.textContent = `Now lit: ${names[Math.max(0, at)]}`;
    names.forEach((name, i) => {
      if (i) { const sep = document.createElement('span'); sep.className = 'spot-crumb-sep'; sep.textContent = ' › '; crumbEl.appendChild(sep); }
      const s = document.createElement('span'); s.className = 'spot-crumb'; s.textContent = name; if (i === at) s.dataset.on = '1'; else if (i < at) s.dataset.done = '1'; crumbEl.appendChild(s);
    });
  };

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const g = gameRef.current, sw = window.innerWidth, sh = window.innerHeight, grace = now - t0 > GRACE_MS;
    // (rescan: a click, or the spotlight's own opening, asks for a look at once; such a look takes the deeper level whatever the pointer is doing)
    const forced = rescan, scanDue = rescan || now - lastScan >= SCAN_MS; if (scanDue) { lastScan = now; rescan = false; }
    // ---- reads: the caption's size, then every target's box
    if (remeasure) { const r = capEl.getBoundingClientRect(); if (r.width > 0) { capW = r.width; capH = r.height; } }
    let moved = remeasure || sw !== lastW || sh !== lastH, fi = -1;
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
          // the common frame: the control found already is still on screen for the same anchor: one read of its box
          let el: HTMLElement | null = null, r: DOMRect | null = null;
          if (prev && ids[i] === id && prev.isConnected) { r = prev.getBoundingClientRect(); if (r.width > 0 && r.height > 0) el = prev; else r = null; }
          // look again (the DOM is queried, a few times a second at most): at a new anchor (the engine pulsed another control), with nothing lit (it moved to another card, was
          // hidden, or is not drawn yet), and from an outer level of a menu for a deeper level that has opened since
          if (ids[i] !== id || (scanDue && (!el || lvl[i]! > 0))) {
            const hit = resolve(id, grace);
            // (a menu that opened under the pointer's hover does not take the lit control from under it: the player's click would land on the dimmed page. A click does take the lead on, and so does leaving the control)
            if (hit && hit.el !== el && !(el && !forced && ids[i] === id && hit.level < lvl[i]! && el.matches(':hover'))) { el = hit.el; r = el.getBoundingClientRect(); lvl[i] = hit.level; }
            else if (!hit && ids[i] !== id) { el = null; r = null; }
            ids[i] = id;
          }
          els[i] = el;
          if (el && r) {
            if (el !== prev) el.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' }); // a control scrolled out of its card (an upgrade on the range card) is brought into view, and the cut-out follows it
            let rad = radius.get(el); if (rad === undefined) { rad = radiusOf(el, r.width, r.height); radius.set(el, rad); }
            cur[o] = r.left; cur[o + 1] = r.top; cur[o + 2] = r.width; cur[o + 3] = r.height; cur[o + 4] = rad; found = true;
            if (fi < 0) fi = i;
          }
        } else els[i] = null;
      }
      if (!found) cur[o + 2] = -1;
      if (!moved) for (let k = 0; k < 5; k++) if (Math.abs(cur[o + k]! - was[o + k]!) > EPS) { moved = true; break; }
    }
    // ---- the level lit now: the first lit control's anchor and place in its chain. A new level: the caption's way down the menu, the keyboard's focus, a fresh moment to wait
    const lid = fi >= 0 ? ids[fi]! : null, llv = fi >= 0 ? lvl[fi]! : -1;
    if (lid !== sigId || llv !== sigLvl) {
      sigId = lid; sigLvl = llv; levelSince = now; levelNo++;
      writeCrumbs(lid, llv); capEl.dataset.lit = lid ? chainOf(lid)[llv] ?? lid : ''; capEl.dataset.target = lid ?? ''; capEl.dataset.level = String(llv); // (the control lit: the anchor at its level of the chain; the target it leads to)
      // the caption's size has changed (its way down the menu is a line more or less): measured now, once per level, and the caption stands again (a pending re-measure would be cleared by the writes below)
      { const r = capEl.getBoundingClientRect(); if (r.width > 0) { capW = r.width; capH = r.height; } moved = true; }
      if (shown) { focusLit(els[fi] ?? null); rescan = true; }
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
        // the caption stands clear of the menu's other rows too (the open flyouts' tiles: the lit one is a cut-out), so it never hides the choices round the one lit
        if (avoidFor !== levelNo) { avoidFor = levelNo; avoid.length = 0; for (const row of document.querySelectorAll('[data-flyout-col] [data-row]')) { const b = row.getBoundingClientRect(); if (b.width > 0) avoid.push({ x: b.x, y: b.y, w: b.width, h: b.height }); } }
        const p = placeCaption(last, { w: capW || 300, h: capH || 90 }, S, { avoid });
        capEl.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`; capEl.style.setProperty('--arrow', `${Math.round(p.arrow)}px`);
        if (capEl.dataset.side !== p.side) capEl.dataset.side = p.side;
      }
    }
    if (last.length) {
      lastHole = now;
      if (!shown) {
        shown = true; tShown = now; layerEl.dataset.on = '1'; capEl.style.visibility = 'visible';
        // focus goes to the first control it lights, once, when that takes focus (never trapped: nothing here takes it back)
        focusLit(els.find(e => !!e) ?? null);
      }
    } else if (now - (shown ? lastHole : t0) > (shown ? LOST_MS : GONE_MS)) { spotHide(); return; } // nothing to light: it was never drawn, or it went
    // ---- left alone on an outer level for a moment: the spotlight opens the next level itself (App.tsx reveal), once for each level
    if (shown && sigId && sigLvl > 0 && openedFor !== levelNo && now - levelSince > DWELL_MS) {
      openedFor = levelNo;
      if (revealRef.current?.(sigId, sigLvl)) rescan = true;
    }
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
