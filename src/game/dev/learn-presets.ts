// The owner's presets as a head start for the lot generator (T159, P25 #348 step 3): every item the owner laid on a lot of theirs (the lab presets,
// approved and drafts, and the frozen presets they edited: curated) is a "kept here" sample with its lot's context, so the model starts from their
// taste on day one. A sample per preset (src 'preset', id preset:<preset id>): learnt again, it replaces the one before (lots/learn.ts
// mergeSamples), so an edited preset is never counted twice. Left out: the house (the lot's own, not an item), fences and other buildings (the
// generator does not offer them), the auto-sized presets (derived from a master: the master already counts), the lab's own in-memory lots (the
// wizard's, the gallery's) and farms. The presets file is only read.
import type { LotPreset, Road } from '../lots/presets';
import { sampleItem, type Box, type HouseClass, type Sample, type SampleItem, type SectorLot } from '../lots/learn';
import { isFence, kindOfId } from '../lots/item-kinds';
import { LIBRARY } from '../library';
import { isBuilding } from '../mirror';
import { roadFrame } from './lot-derive';
import { mainBuilding } from './lot-select';
import { CLASS_NAMES, frameHalf, isHouseLike, sizeClassOf } from './lot-houses';

const INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
/** whether a preset teaches the generator: a lab preset (the owner's: approved or a draft) or a frozen one they edited; not derived, not the lab's
 *  in-memory lots, not a farm */
export const teaches = (p: LotPreset) => p.use !== 'farm' && !p.derived && !p.id.startsWith('lab-wizard') && !p.id.startsWith('lab-gallery') && (p.road !== undefined || !!p.curated);
/** a preset's sample: its context (a frozen preset is laid out for road 0) and every item on it but the house, fences and other buildings, kept */
export function presetSample(p: LotPreset, at: string): Sample {
  const road = (p.road ?? 0) as Road, half = frameHalf(roadFrame(road)), hi = mainBuilding(p, q => isHouseLike(q.id), half), hq = hi >= 0 ? p.props[hi]! : null, hh = hq ? half(hq) : null;
  const house: Box | null = hq && hh ? [hq.x - hh.ha, hq.y - hh.hb, hq.x + hh.ha, hq.y + hh.hb] : null;
  const lot: SectorLot = { w: p.w, d: p.d, house, drives: p.patches.filter(a => a.kind === 'drive').map(a => a.pts) };
  const cls: HouseClass = hq ? CLASS_NAMES[sizeClassOf(hq.id) ?? 0] : 'none', items: SampleItem[] = [];
  p.props.forEach((q, i) => {
    const it = LIBRARY[INDEX.get(q.id) ?? -1];
    if (i === hi || isFence(q.id) || (it && isBuilding(it))) return;
    items.push(sampleItem(lot, q.id, kindOfId(q.id), q.x, q.y, true));
  });
  for (const c of p.decals ?? []) items.push(sampleItem(lot, c.id, 'decal', c.x, c.y, true));
  return { id: `preset:${p.id}`, at, src: 'preset', ctx: { use: p.use, state: p.state, w: p.w, d: p.d, road, house: hq?.id ?? null, cls, hw: hh ? 2 * hh.ha : 0, hd: hh ? 2 * hh.hb : 0, ...(house ? { hb: house } : {}), paved: pavedBoxes(p) }, items };
}
/** T171: a preset's drives' and car parks' boxes (lot frame, tiles: lots/places.ts reads its items' places against them) */
export function pavedBoxes(p: Pick<LotPreset, 'patches'>): Box[] {
  return p.patches.filter(a => a.kind === 'drive' || a.kind === 'lot').map(a => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let i = 0; i + 1 < a.pts.length; i += 2) { x0 = Math.min(x0, a.pts[i]!); x1 = Math.max(x1, a.pts[i]!); y0 = Math.min(y0, a.pts[i + 1]!); y1 = Math.max(y1, a.pts[i + 1]!); } return [x0, y0, x1, y1] as Box; });
}
/** the samples of every preset that teaches (teaches), in file order */
export function presetSamples(list: readonly LotPreset[], at = new Date().toISOString()): Sample[] { return list.filter(teaches).map(p => presetSample(p, at)).filter(s => s.items.length > 0); }
