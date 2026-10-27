// A lot as the lot wizard and gallery show it (T158; T173, #406: every use): the lab lot as the game composes it, kept to its base, and the items
// the model offers on it, laid by the game's own path (lots/compose.ts layoutWith: sectors, anchors, inventory, rows, pairs, densities) with the
// lab's live model (live-model.ts) and a seed of its own, every item offered for the owner to judge (none thinned by the keep rates: their clicks
// are what the keep rates learn). The base is the game's: a house lot keeps its buildings, fences and street items; a shop's, an industrial's or
// an open lot's also its cars and car park pieces (lots/compose.ts groupBaseItem). Its sample (lotSample) carries its lot's use, so it trains
// that use's group. Pure: no DOM (the wizard and the gallery draw it).
import type { LotPreset, PresetState, PresetUse, Road } from '../lots/presets';
import type { PresetFrame } from '../lots/preset-frame';
import type { Fitted } from '../lots/presets';
import { groupOf, sampleItem, type Box, type HouseClass, type Sample, type SectorLot, type UseGroup } from '../lots/learn';
import { groupBaseItem, layoutWith, type LayModel } from '../lots/compose';
import type { LaidItem } from '../lots/lot-gen';
import { isFence } from '../lots/item-kinds';
import { CLASS_NAMES, frameHalf, sizeClassOf } from '../lots/house-class';
import { LIBRARY } from '../library';
import { isBuilding } from '../mirror';
import { pavedBoxes } from './learn-presets';

const BY = new Map(LIBRARY.map(i => [i.id, i]));
/** an offered item on a wizard lot: deleted or not */
export interface WizItem extends LaidItem { deleted: boolean }
/** a wizard lot (the wizard's, a gallery's): its base (the buildings, fences, street items, patches; a group's cars and car park pieces), the
 *  offered items, the deletes to undo, its sector lot, its main building, size class and footprint, the generator's seed, and (T173) the use
 *  group it trains */
export interface WizLot { base: LotPreset; items: WizItem[]; undo: number[]; lot: SectorLot; house: string | null; cls: HouseClass; hw: number; hd: number; seed: number; group: UseGroup }
/** a wizard lot from a lot composed as the game composes it (raw, laid in frame f): kept to its base, the model's items offered round its main
 *  building (the widest) by the game's path with model M (seeded: the sample keeps the seed, so the same lot can be made again) */
export function makeLot(raw: LotPreset, f: PresetFrame, M: LayModel, seed = Math.floor(Math.random() * 2147483647)): WizLot {
  const group: UseGroup = groupOf(raw.use) ?? 'res', half = frameHalf(f);
  const keep = (id: string, y: number) => (group === 'res' ? y < 0 || isFence(id) || (!!BY.get(id) && isBuilding(BY.get(id)!)) : groupBaseItem(id, y));
  const base: LotPreset = { ...raw, props: raw.props.filter(q => keep(q.id, q.y)), decals: [] };
  let hi = -1, area = 0;
  base.props.forEach((q, i) => { const it = BY.get(q.id); if (!it || !isBuilding(it)) return; const h = half(q), a = h.ha * h.hb; if (a > area) { area = a; hi = i; } });
  const fit: Fitted = { props: base.props, patches: base.patches, from: base.props.map((_, i) => i), dropped: 0, decals: [] };
  const offers = layoutWith({ w: base.w, d: base.d }, { preset: base, fit, frame: f }, raw.state, hi, group, M, seed, false);
  const hq = hi >= 0 ? base.props[hi]! : null, hh = hq ? half(hq) : null;
  const house: Box | null = hq && hh ? [hq.x - hh.ha, hq.y - hh.hb, hq.x + hh.ha, hq.y + hh.hb] : null;
  const lot: SectorLot = { w: base.w, d: base.d, house, drives: base.patches.filter(p => p.kind === 'drive').map(p => p.pts) };
  const k = hq ? sizeClassOf(hq.id) : null, cls: HouseClass = hq ? CLASS_NAMES[k ?? 0] : 'none';
  return { base, items: offers.map(o => ({ ...o, deleted: false })), undo: [], lot, house: hq?.id ?? null, cls, hw: hh ? 2 * hh.ha : 0, hd: hh ? 2 * hh.hb : 0, seed, group };
}
/** a wizard lot as a preset (id): its base and the offered items not deleted */
export function lotPreset(c: WizLot, id: string): LotPreset {
  const props = [...c.base.props], decals = [...(c.base.decals ?? [])];
  for (const it of c.items) if (!it.deleted) { if (it.kind === 'decal') decals.push({ id: it.id, x: it.x, y: it.y, scale: 1, alpha: 1 }); else props.push({ id: it.id, x: it.x, y: it.y, scale: 1, view: 0 }); }
  return { ...c.base, id, props, decals };
}
/** a wizard lot's sample: its context (its use: the group it trains) and every offered item, kept or deleted (the wizard's); a gallery's judges the
 *  whole lot (src gallery, the verdict: its items as they stood) */
export function lotSample(c: WizLot, l: { use: PresetUse; state: PresetState; road: Road }, verdict?: 'up' | 'down'): Sample {
  return { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, at: new Date().toISOString(), ctx: { use: l.use, state: l.state, w: c.base.w, d: c.base.d, road: l.road, house: c.house, cls: c.cls, hw: c.hw, hd: c.hd, seed: c.seed, ...(c.lot.house ? { hb: c.lot.house } : {}), paved: pavedBoxes(c.base) },
    items: c.items.map(it => sampleItem(c.lot, it.id, it.kind, it.x, it.y, !it.deleted)), ...(verdict ? { src: 'gallery' as const, verdict } : {}) };
}
