// T173 (#406; P25): the lot lab's LIVE model: the lot model the game would get if it were shipped now. It is learnt as every shipped model was:
// each use group from its head start, the presets (the houses: the owner's presets, learn-presets.ts; the other uses: their presets, the owner's
// and the frozen ones, learn-groups.ts), plus the owner's training samples of that group (the wizard's and the gallery's in lot-learning.json: a
// sample trains the group of its lot's use, never another). The other uses' head starts are far larger than the houses' (a few hundred lots each
// against 87), so an owner's sample of theirs counts as many times as their head start is larger (OWNER_WEIGHT): a dozen lots of training move
// a shop lot as they move a house lot. With no training, the live model is the latest shipped one (learnt from the same presets). Which parts a
// group has (its places, inventory, on in the game) follow the latest shipped model. Pure: no DOM, no files.
import type { LotPreset } from '../lots/presets';
import { USE_GROUPS, buildModel, groupOf, modelData, type Sample, type UseGroup } from '../lots/learn';
import { buildTaste, tasteData } from '../lots/taste';
import { buildPlaces, placesData } from '../lots/places';
import { groupsFrom, type GroupData } from '../lots/group-data';
import { presetSamples } from './learn-presets';
import { groupData, groupSamples } from './learn-groups';

/** an owner's training sample (the wizard's, the gallery's): a sample from the presets is the head start's, learnt from the presets themselves */
export const ownerSample = (s: Sample) => (s.src ?? 'wizard') !== 'preset';
/** the group a sample trains: its lot's use's (a farm's, or an unknown use's: the houses', as the samples before T173) */
export const sampleGroup = (s: Sample): UseGroup => groupOf(s.ctx.use) ?? 'res';
/** how many times an owner's sample of a group counts: its head start's lots over the houses' (at least once) */
export const ownerWeight = (headLots: number, resLots: number) => Math.max(1, Math.round(headLots / Math.max(1, resLots)));
/** the head starts, made once per presets list (the lab sets a new list when the presets change) */
const HEADS = new WeakMap<readonly LotPreset[], Map<UseGroup, Sample[]>>();
function headStart(presets: readonly LotPreset[], g: UseGroup, at: string): Sample[] {
  let m = HEADS.get(presets); if (!m) HEADS.set(presets, m = new Map());
  let h = m.get(g); if (!h) m.set(g, h = g === 'res' ? presetSamples(presets, at) : groupSamples(presets, g, at));
  return h;
}
/** the live model's data (a model file's: counts, anchors, pairs, density, places, groups) from the presets, the samples (the owner's are learnt,
 *  the presets' are the head start's) and the latest shipped model's data (which parts each group has) */
export function liveModelData(presets: readonly LotPreset[], samples: readonly Sample[], latest: unknown, at = '2026-10-27T00:00:00.000Z'): Record<string, unknown> {
  // (a gallery lot judged Bad says something is wrong but not which item: it trains nothing, not even a group's pools)
  const owner = samples.filter(s => ownerSample(s) && s.verdict !== 'down'), of = (g: UseGroup) => owner.filter(s => sampleGroup(s) === g);
  const res = headStart(presets, 'res', at), resAll = [...res, ...of('res')];
  const L = (latest ?? {}) as { places?: unknown }, data: Record<string, unknown> = { ...modelData(buildModel(resAll)), ...tasteData(buildTaste(resAll)) };
  if (L.places) data.places = placesData(buildPlaces(resAll));
  const prev = groupsFrom(latest), groups: Record<string, GroupData> = {};
  for (const g of USE_GROUPS) {
    const p = g === 'res' ? undefined : prev[g as Exclude<UseGroup, 'res'>]; if (!p) continue;
    const head = headStart(presets, g, at), w = ownerWeight(head.length, res.length), all = [...head];
    for (const s of of(g)) for (let k = 0; k < w; k++) all.push(s);
    const d = groupData(all, g, p.on);
    if (p.places) { const t = buildPlaces(all); if (p.places.inventory) t.inventory = true; d.places = placesData(t); }
    groups[g] = d;
  }
  if (Object.keys(groups).length) data.groups = groups;
  return data;
}
/** the training counters per group (the wizard's panel): the owner's samples, the wizard's share kept per lot (its first and last ten lots) and
 *  the gallery's lots judged and the share judged good */
export interface GroupStats { samples: number; wizard: number; first: number; last: number; judged: number; up: number }
export function groupStats(samples: readonly Sample[]): Record<UseGroup, GroupStats> {
  const out = {} as Record<UseGroup, GroupStats>, mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  for (const g of USE_GROUPS) {
    const ss = samples.filter(s => ownerSample(s) && sampleGroup(s) === g), wiz = ss.filter(s => !s.src || s.src === 'wizard').filter(s => s.items.length).map(s => s.items.filter(i => i.kept).length / s.items.length);
    const judged = ss.filter(s => s.verdict), up = judged.filter(s => s.verdict === 'up').length;
    out[g] = { samples: ss.length, wizard: wiz.length, first: mean(wiz.slice(0, 10)), last: mean(wiz.slice(-10)), judged: judged.length, up: judged.length ? up / judged.length : 0 };
  }
  return out;
}
