// T169 (#392; P25 #348): the lot model of the uses other than houses, by use group (lots/learn.ts UseGroup: shops and offices, industry, the open
// uses). Each group's data: whether the game generates its lots (on: a group whose generated lots look worse than its frozen presets' stays on
// them), its keep counts (lots/learn.ts ModelData counts), its pairs and densities by state (lots/taste.ts TasteData) and its pools, the items its
// lots are laid from by kind (each id repeated by how often the group's presets place it, so the generator's even pick draws them as the
// presets do). A model v3 on carries them under groups; the houses' (res) stay at the top, as v1 and v2. Pure, with no runtime imports but
// learn.ts and taste.ts (vite.config.ts loads it through dev-save.ts).
import { ITEM_KINDS, USE_GROUPS, type ItemKind, type UseGroup } from './learn';
import { tasteData, tasteFrom, type TasteData } from './taste';

/** a group's model data (see the file head) */
export interface GroupData extends TasteData { on: boolean; counts: Record<string, [number, number]>; pools: Record<ItemKind, string[]> }
/** the groups a model holds (the houses' are its top level) */
export type GroupsData = Partial<Record<Exclude<UseGroup, 'res'>, GroupData>>;
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const KEY = /^[a-z]+\|[a-z]+\|[a-z-]+$/;
/** a group's data read back (bad entries dropped); null when it is not one */
export function groupFrom(d: unknown): GroupData | null {
  if (!obj(d)) return null;
  const counts: Record<string, [number, number]> = {}, pools = Object.fromEntries(ITEM_KINDS.map(k => [k, [] as string[]])) as Record<ItemKind, string[]>;
  if (obj(d.counts)) for (const [k, v] of Object.entries(d.counts)) if (KEY.test(k) && Array.isArray(v) && v.length === 2 && v.every(n => Number.isInteger(n) && n >= 0) && v[1] <= v[0]) counts[k] = [v[0], v[1]];
  if (obj(d.pools)) for (const k of ITEM_KINDS) { const v = d.pools[k]; if (Array.isArray(v)) pools[k] = v.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(0, 400); }
  return { on: d.on === true, counts, pools, ...tasteData(tasteFrom(d)) };
}
/** a model's groups read back (only those that read) */
export function groupsFrom(d: unknown): GroupsData {
  const out: GroupsData = {}, g = obj(d) ? d.groups : undefined;
  if (obj(g)) for (const k of USE_GROUPS) { if (k === 'res') continue; const r = groupFrom(g[k]); if (r) out[k] = r; }
  return out;
}
/** a model file's groups block (dev-save.ts modelFile): one group a line set, keys in order; '' with none */
export function groupsBlock(d: unknown): string {
  const g = groupsFrom(d), keys = Object.keys(g) as (keyof GroupsData)[];
  if (!keys.length) return '';
  const lines = keys.map(k => { const x = g[k]!; return `  ${JSON.stringify(k)}: {\n   "on": ${x.on},\n   "counts": ${JSON.stringify(x.counts)},\n   "anchors": ${JSON.stringify(x.anchors)},\n   "pairs": ${JSON.stringify(x.pairs)},\n   "density": ${JSON.stringify(x.density)},\n   "pools": ${JSON.stringify(x.pools)}\n  }`; });
  return `,\n "groups": {\n${lines.join(',\n')}\n }`;
}
