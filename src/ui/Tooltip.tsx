// The styled tooltip (plan P23-UX 6.2 P2-7, T179): one tooltip for the rail and the top bar in place of the browser's title. A control carries
// data-tip (its name), data-tip-key (its key, if any) and data-tip-why (why it is locked or refused, if it is); the one TooltipLayer shows it on
// hover after TIP_DELAY_MS and at once on keyboard focus, beside the control, with role="tooltip" and the control's aria-describedby.
import { useEffect, useRef, useState } from 'react';
import { tipPlace, type TipParts, type TipSide } from './tip';
export { tipAttrs, tipText, type TipParts } from './tip';

/** how long the pointer rests on a control before its tooltip shows, ms */
export const TIP_DELAY_MS = 450;


interface Shown { el: HTMLElement; parts: TipParts; x: number; y: number; side: TipSide }
/** where a control's tooltip stands: beside the course drawer's, above the town footer's (T250), else below (tip.ts tipPlace) */
const place = (el: HTMLElement) => tipPlace(el.getBoundingClientRect(), window.innerHeight);
const partsOf = (el: HTMLElement): TipParts => ({ name: el.dataset.tip ?? '', ...(el.dataset.tipKey ? { key: el.dataset.tipKey } : {}), ...(el.dataset.tipWhy ? { why: el.dataset.tipWhy } : {}) });

/** the one tooltip of the page (mounted once, in App) */
export function TooltipLayer() {
  const [tip, setTip] = useState<Shown | null>(null);
  const timer = useRef<number | null>(null), cur = useRef<HTMLElement | null>(null), box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const clear = () => { if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; } };
    const hide = () => { clear(); if (cur.current) cur.current.removeAttribute('aria-describedby'); cur.current = null; setTip(null); };
    const show = (el: HTMLElement) => { if (!el.isConnected || !el.dataset.tip) return; cur.current = el; el.setAttribute('aria-describedby', 'ui-tip'); setTip({ el, parts: partsOf(el), ...place(el) }); };
    const target = (e: Event) => (e.target instanceof Element ? (e.target.closest('[data-tip]') as HTMLElement | null) : null);
    const over = (e: PointerEvent) => {
      const el = target(e); if (el === cur.current) return;
      hide(); if (!el) return;
      cur.current = el; timer.current = window.setTimeout(() => show(el), TIP_DELAY_MS);
    };
    const out = (e: PointerEvent) => { const el = target(e); if (el && el === cur.current && !(e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) hide(); };
    const focus = (e: FocusEvent) => { const el = target(e); if (el && el.matches(':focus-visible')) { hide(); show(el); } };
    const blur = (e: FocusEvent) => { if (target(e) === cur.current) hide(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    document.addEventListener('pointerover', over); document.addEventListener('pointerout', out); document.addEventListener('pointerdown', hide, true);
    document.addEventListener('focusin', focus); document.addEventListener('focusout', blur); document.addEventListener('keydown', key);
    return () => {
      clear();
      document.removeEventListener('pointerover', over); document.removeEventListener('pointerout', out); document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('focusin', focus); document.removeEventListener('focusout', blur); document.removeEventListener('keydown', key);
    };
  }, []);
  // placed once its size is known: beside the rail's control (its middle), else centred below (or, near the bottom, above) the control; kept
  // inside the window
  useEffect(() => {
    const b = box.current; if (!b || !tip) return;
    const r = b.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
    let left = tip.side === 'right' ? tip.x : tip.x - r.width / 2, top = tip.side === 'right' ? tip.y - r.height / 2 : tip.side === 'above' ? tip.y - r.height : tip.y;
    left = Math.min(Math.max(6, left), W - 6 - r.width); top = Math.min(Math.max(6, top), H - 6 - r.height);
    b.style.left = `${left}px`; b.style.top = `${top}px`; b.style.visibility = 'visible';
  }, [tip]);
  if (!tip) return null;
  const { parts, x, y, side } = tip;
  return (
    <div ref={box} id="ui-tip" role="tooltip" className={`ui-tip ui-unscaled ui-tip-${side}`} style={{ left: x, top: y, visibility: 'hidden' }} data-testid="ui-tip">
      <span className="ui-tip-name">{parts.name}</span>
      {parts.key && <kbd className="ui-tip-key">{parts.key}</kbd>}
      {parts.why && <span className="ui-tip-why"><span aria-hidden>🔒 </span>{parts.why}</span>}
    </div>
  );
}
