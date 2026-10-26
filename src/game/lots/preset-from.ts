// A composition as lot presets (P20; the lot lab's farms): a lot's or a farm's props and ground patches, in the lot's preset frame, as the preset file
// stores them (preset-art.ts: the base view, the turn and the owner scale; preset-frame.ts: the frame). Pure, no DOM. It undoes fromPreset (compose.ts)
// for the props: a preset made here composes back to the same props where they stood. A mirrored four-view prop is stored as its unmirrored partner
// view, as freeze-lot-presets.ts stores it; a composition's ground keeps no kind, so every patch is stored as 'yard' (nothing blocks on it).
import type { Composition } from './compose-core';
import type { PresetPatch, PresetProp, View } from './presets';
import { baseView, footprintOf, fourViews, ownerScaleOf } from './preset-art';
import { listToFrame, toFrame, type PresetFrame } from './preset-frame';

/** a number as the preset file writes it: rounded to 3 decimals */
const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** a value kept within [a, b] */
const within = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
/** a list of world x, y pairs in the preset frame, clamped into the lot (x into [0, w], y into [0, d]) and rounded */
const pairs = (f: PresetFrame, a: readonly number[], w: number, d: number): number[] => listToFrame(f, a).map((v, i) => r3(within(v, 0, i % 2 ? d : w)));

/** a composition (world tiles, as compose or composeFarm returns it) as a lot preset's props and patches in the frame f (a lot of w x d tiles): each prop at its footprint centre, kept 0.2 tiles inside the lot (a street item stands just outside the front edge; fitPreset drops a prop outside), as its base view turned to the lot's facing, its scale over the owner's; a flipped four-view prop as its unmirrored partner view (a flipped sprite without four views is kept unflipped); each ground patch with a texture, not the decals, in the lot */
export function presetFromComposition(c: Composition, f: PresetFrame, w: number, d: number): { props: PresetProp[]; patches: PresetPatch[] } {
  const props: PresetProp[] = [];
  for (const q of c.props) {
    const fv = q.flip ? fourViews(q.id) : null, p = fv ? { ...q, id: fv.views[[1, 0, 3, 2][fv.at]!]!, flip: false } : q;
    const fp = footprintOf(p.id, p.scale, p.flip), at = toFrame(f, p.x + (fp[0] + fp[2]) / 2, p.y + (fp[1] + fp[3]) / 2), bv = baseView(p.id);
    props.push({ id: bv.id, x: r3(within(at.x, 0.2, w - 0.2)), y: r3(within(at.y, 0.2, d - 0.2)), scale: r3(p.scale / ownerScaleOf(bv.id)), view: (((bv.view - f.q) % 4 + 4) % 4) as View });
  }
  const patches: PresetPatch[] = [];
  for (const g of c.ground) {
    if (g.tex === 'marks' || !g.pts.length) continue;
    patches.push({ kind: 'yard', tex: g.tex, pts: pairs(f, g.pts, w, d), ...(g.lines ? { lines: pairs(f, g.lines, w, d) } : {}) });
  }
  return { props, patches };
}
