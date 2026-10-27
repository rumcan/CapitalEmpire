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
