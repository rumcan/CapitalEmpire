// T169 (#392; P25 #348): the lot model of every use group but the houses, learnt from that group's presets as T159 learns the houses' (one sample a
// preset, every item on it kept: lots/learn.ts), with its pairs and densities by state (lots/taste.ts) and its pools (lots/group-data.ts). A
// group's lots are read round their main building (the widest; none: the lot's middle third), as a house lot round its house. A group learns from
// the owner's own presets of its uses (approved, drafts, the frozen ones they edited) and, as its head start until the owner has trained it, from
// its frozen presets (the lots it draws today): the shops have 7 of the owner's, industry and the open uses none. Its items are those the
// generator lays: everything but the base each generated lot keeps from its frozen preset (lots/compose.ts groupBase: the buildings, the fences,
// the cars, the car park's furniture, the street items). The presets file is only read.
import type { LotPreset, Road } from '../lots/presets';
import { ITEM_KINDS, buildModel, groupOf, modelData, sampleItem, type Box, type HouseClass, type ItemKind, type Sample, type SampleItem, type SectorLot, type UseGroup } from '../lots/learn';
import { buildTaste, tasteData } from '../lots/taste';
import { kindOfId } from '../lots/item-kinds';
import { LIBRARY } from '../library';
import { isBuilding } from '../mirror';
import { roadFrame } from './lot-derive';
import { mainBuilding } from './lot-select';
import { CLASS_NAMES, frameHalf, sizeClassOf } from '../lots/house-class';
import { groupBaseItem } from '../lots/compose';
import type { GroupData } from '../lots/group-data';
import { pavedBoxes, teaches } from './learn-presets';

const INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
/** a preset a group learns from: the owner's (as the houses', learn-presets.ts teaches) or a frozen one of its uses (its head start) */
export const groupTeaches = (p: LotPreset) => teaches(p) || (!p.curated && !p.approved && !p.whole && !p.derived && p.road === undefined && p.use !== 'farm');
/** a preset's sample for its group: its context (its main building: the widest, its size class among its family's) and every item the generator
 *  lays on such a lot (groupBaseItem: not the base), kept */
export function groupSample(p: LotPreset, at: string): Sample {
  const road = (p.road ?? 0) as Road, half = frameHalf(roadFrame(road)), bi = mainBuilding(p, q => { const it = LIBRARY[INDEX.get(q.id) ?? -1]; return !!it && isBuilding(it); }, half);
  const bq = bi >= 0 ? p.props[bi]! : null, bh = bq ? half(bq) : null;
  const house: Box | null = bq && bh ? [bq.x - bh.ha, bq.y - bh.hb, bq.x + bh.ha, bq.y + bh.hb] : null;
  const lot: SectorLot = { w: p.w, d: p.d, house, drives: p.patches.filter(a => a.kind === 'drive').map(a => a.pts) };
  const cls: HouseClass = bq ? CLASS_NAMES[sizeClassOf(bq.id) ?? 0] : 'none', items: SampleItem[] = [];
  for (const q of p.props) if (!groupBaseItem(q.id, q.y)) items.push(sampleItem(lot, q.id, kindOfId(q.id), q.x, q.y, true));
  for (const c of p.decals ?? []) items.push(sampleItem(lot, c.id, 'decal', c.x, c.y, true));
  return { id: `group:${p.id}`, at, src: 'preset', ctx: { use: p.use, state: p.state, w: p.w, d: p.d, road, house: bq?.id ?? null, cls, hw: bh ? 2 * bh.ha : 0, hd: bh ? 2 * bh.hb : 0, ...(house ? { hb: house } : {}), paved: pavedBoxes(p) }, items };
}
/** the samples of a group's presets (groupTeaches), in file order */
export const groupSamples = (list: readonly LotPreset[], group: UseGroup, at = new Date().toISOString()): Sample[] => list.filter(p => groupOf(p.use) === group && groupTeaches(p)).map(p => groupSample(p, at));
/** the most ids a pool repeats over, and the least share an id needs to be in it (an odd one placed once in a hundred lots is left out) */
const POOL_SLOTS = 60, POOL_MIN = 0.01;
/** a group's model data from its samples (on: whether the game generates its lots) */
export function groupData(samples: readonly Sample[], group: UseGroup, on: boolean): GroupData {
  const n = new Map<string, number>(), kinds = new Map<string, ItemKind>();
  for (const s of samples) for (const it of s.items) if (it.kept && (it.kind === 'decal' || INDEX.has(it.id))) { n.set(it.id, (n.get(it.id) ?? 0) + 1); kinds.set(it.id, it.kind); }
  const pools = Object.fromEntries(ITEM_KINDS.map(k => [k, [] as string[]])) as Record<ItemKind, string[]>;
  for (const k of ITEM_KINDS) {
    const ids = [...n].filter(([id]) => kinds.get(id) === k).sort(([a], [b]) => (a < b ? -1 : 1)), tot = ids.reduce((t, [, c]) => t + c, 0);
    for (const [id, c] of ids) if (c / tot >= POOL_MIN) for (let i = 0, r = Math.max(1, Math.round((POOL_SLOTS * c) / tot)); i < r; i++) pools[k].push(id);
  }
  return { on, counts: modelData(buildModel(samples)).counts, pools, ...tasteData(buildTaste(samples, group)) };
}
