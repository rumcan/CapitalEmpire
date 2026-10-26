// Which library pictures get a vector shadow (T142), the kind their draft treats them as, and their hand hints (shadow-hints.json). Pure over
// the library: the draft page, the audit page and the vector-shadow test share it.
import { LIBRARY } from '../library';
import type { LibItem } from '../types';
import { lookOf } from '../newart';
import { VIEW_ART } from '../views-library';
import { fourViews } from '../lots/preset-art';
import { kindOf } from '../shadow-shape';
import { vectorFallback } from '../shadow-vector';
import type { DraftHint, DraftKind } from './shadow-draft';
import HINTS from './shadow-hints.json';

/** the hand hints, by library id, `variation:<group>` (every picture of the set) or a four-view family's NE id with `"all": true` */
export const SHADOW_HINTS = HINTS as Record<string, DraftHint & { all?: boolean }>;

/** is a picture drawn as itself (not swapped for a stand-in by newart.ts, not hidden, not an east view drawn as its mirrored front) */
export function drawnAsItself(i: number): boolean {
  const it = LIBRARY[i]!;
  if (it.id.startsWith('east:') && !VIEW_ART.has(it.id)) return false;
  const l = lookOf({ item: i, flip: false, scale: 1, x: 100.5, y: 100.5, x0: 99, y0: 99, x1: 102, y1: 102 });
  return !l.hidden && l.item === i;
}
/** the pictures the vector shadows cover: every library picture drawn as itself, but the baked lots (their shadows are baked in) and the
 *  fallback list (shadow-vector.ts VECTOR_FALLBACK) */
export function draftItems(): number[] {
  const out: number[] = [];
  LIBRARY.forEach((it, i) => { if (it.kind !== 'lot' && !vectorFallback(it.id, it.kind) && drawnAsItself(i)) out.push(i); });
  return out;
}
/** the draft's kind of a picture, from its T141 shadow kind */
export function draftKindOf(it: LibItem): DraftKind {
  switch (kindOf(it)) {
    case 'tree': return 'tree';
    case 'plant': return 'plant';
    case 'pole': return 'pole';
    case 'vehicle': return 'vehicle';
    case 'building': case 'roundhouse': return 'building';
    case 'fencex': case 'fencey': return 'fence';
    case 'walker': return 'walker';
    default: return 'prop';
  }
}
/** a picture's hints: its own, its variation set's, its four-view family's (when marked for all its views) */
export function hintOf(id: string): DraftHint {
  const own = SHADOW_HINTS[id]; if (own) return strip(own);
  const g = /^(variation:.+):\d+$/.exec(id); if (g && SHADOW_HINTS[g[1]!]) return strip(SHADOW_HINTS[g[1]!]!);
  const v = fourViews(id); if (v) { const f = SHADOW_HINTS[v.views[0]]; if (f?.all) return strip(f); }
  return {};
}
const strip = (h: DraftHint & { all?: boolean }): DraftHint => { const { all: _all, ...rest } = h; return rest; };
