// The guide's pulse (T188, plan P23-UX P2-3): the guide's Show me and a checklist's Fix point at a control by its data-guide anchor, not at screen
// coordinates. A gold ring pulses over the first visible element of the anchor (or of its fallbacks: a panel's control falls back to the rail
// group that opens it), following it each frame until the pulse ends. Reduced motion: a still ring.
import { useEffect, useRef, useState } from 'react';

/** where an anchor falls back to while its control is not on screen (its panel closed) */
export const ANCHOR_FALLBACK: Readonly<Record<string, readonly string[]>> = {
  'new-hole': ['rail-course'], 'clubhouse-card': ['rail-course'], 'tool-park': ['rail-traffic'], 'fix-holes': ['season-chip'], 'fix-carpark': ['season-chip'],
  'fix-clubhouse': ['season-chip'], 'invite-pill': ['season-chip'], 'results': ['season-chip'],
};
/** the element an anchor id points at now: the first visible one of the id, then of its fallbacks */
export function anchorElement(id: string, doc: Pick<Document, 'querySelectorAll'> = document): HTMLElement | null {
  for (const a of [id, ...(ANCHOR_FALLBACK[id] ?? [])]) {
    for (const el of Array.from(doc.querySelectorAll<HTMLElement>(`[data-guide="${a}"]`))) {
      const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) return el;
    }
  }
  return null;
}

export function GuidePulse({ anchor }: { anchor: { id: string; until: number } | null }) {
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const raf = useRef(0);
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    if (!anchor) { setBox(null); return; }
    const step = () => {
      if (performance.now() > anchor.until) { setBox(null); return; }
      const el = anchorElement(anchor.id), r = el?.getBoundingClientRect();
      setBox(r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null);
      raf.current = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(raf.current);
  }, [anchor]);
  if (!box) return null;
  return <div className="guide-pulse ui-unscaled" data-testid="guide-pulse" data-anchor={anchor?.id} style={{ left: box.x - 6, top: box.y - 6, width: box.w + 12, height: box.h + 12 }} aria-hidden />;
}
