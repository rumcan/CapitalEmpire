// The styled tooltip's parts (plan P23-UX 6.2 P2-7, T179; Tooltip.tsx draws them): a control's name, its key and, locked or refused, why.
// Pure TS, no DOM.

/** a tooltip's parts */
export interface TipParts { name: string; key?: string; why?: string }
/** the data attributes a control carries for its tooltip (TooltipLayer reads them) */
export function tipAttrs(t: TipParts): Record<string, string> {
  return { 'data-tip': t.name, ...(t.key ? { 'data-tip-key': t.key } : {}), ...(t.why ? { 'data-tip-why': t.why } : {}) };
}
/** the tooltip's text as one line, its parts in reading order ("Paint (A) · Unlocks with your first hole") */
export function tipText(t: TipParts): string { return `${t.name}${t.key ? ` (${t.key})` : ''}${t.why ? ` · ${t.why}` : ''}`; }
/** where a tooltip stands */
export type TipSide = 'right' | 'below' | 'above';
/** where a control's tooltip stands (window px), from the control's box and the window's height: to the right of a control near the left edge
 *  (the course drawer), above one near the bottom (T250: the town footer), else below it, centred */
export function tipPlace(r: { left: number; right: number; top: number; bottom: number; width: number; height: number }, screenH: number): { x: number; y: number; side: TipSide } {
  if (r.left < 140) return { x: r.right + 8, y: r.top + r.height / 2, side: 'right' };
  return r.bottom > screenH - 120 ? { x: r.left + r.width / 2, y: r.top - 8, side: 'above' } : { x: r.left + r.width / 2, y: r.bottom + 8, side: 'below' };
}
