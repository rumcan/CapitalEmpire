// The lot generator's taste beyond the keep rates (T161, #379; P25 #348 step 6), learnt from the same samples (lots/learn.ts) and shipped with the
// model (lot-models, v2 on):
// PAIRS: items that go together, as the owner lays them (the bins by the mailbox, the doghouse with its sandbox and a tree, the hvac unit with its
// utility cabinet, the bench by the streetlamp). Over the kept items of every sample (but a gallery lot judged Bad), how often a partner stands
// within PAIR_R of its anchor, and where (the offsets seen). The generator (lot-gen.ts) lays a partner by an anchor it lays at that rate, at one
// of those offsets; a partner brings no partner of its own. Sprite to sprite; cars (a car keeps to the drive) and decals (flat) take no part.
// DENSITIES by state (built tidy, upgraded lush, decrepit junky): the kept items per 160 tiles squared of each kind on the house lots of each
// state, from a prior that holds the state's character (CHARACTER: a few samples move it, many settle it); the generator scales its counts by a
// state's density over the built lots' (stateKinds), so built lots keep the density they have.
// Pure, with no runtime imports but learn.ts (vite.config.ts loads it through dev-save.ts).
import type { PresetState } from './presets';
import { ITEM_KINDS, groupOf, type ItemKind, type Sample, type UseGroup } from './learn';

/** how near (tiles, centre to centre) a partner stands to its anchor to go with it; the least times a pair is seen to be learnt; the least rate a
 *  partner is laid at; the most offsets a pair keeps (the first seen) */
export const PAIR_R = 2.5, PAIR_MIN = 3, PAIR_RATE_MIN = 0.25, PAIR_OFFS = 8;
/** the kinds that take part in pairs */
export const PAIRED: ReadonlySet<ItemKind> = new Set<ItemKind>(['tree', 'bush', 'flowerbed', 'prop']);
/** a state's character: the prior its density starts from, as a multiple of the built lots' (upgraded lush: more plants and flowers, fewer stains;
 *  decrepit junky: more props and stains, fewer flowers and bushes) */
export const CHARACTER: Readonly<Record<PresetState, Readonly<Record<ItemKind, number>>>> = {
  built: { tree: 1, bush: 1, flowerbed: 1, prop: 1, car: 1, decal: 1 },
  upgraded: { tree: 1.25, bush: 1.4, flowerbed: 1.6, prop: 1, car: 1, decal: 0.8 },
  declined: { tree: 0.9, bush: 0.8, flowerbed: 0.3, prop: 1.5, car: 1.2, decal: 1.4 },
};
/** how many lots the character prior weighs, and the bounds of a state's multiple */
export const DENSITY_K = 6, DENSITY_MIN = 0.25, DENSITY_MAX = 3;
const STATES: readonly PresetState[] = ['built', 'upgraded', 'declined'];

/** a pair: the times its anchor was kept with the partner near, and the offsets seen (dx, dy pairs: the partner's place less the anchor's, lot frame,
 *  tiles) */
export interface PairCount { n: number; offs: number[] }
/** the taste: per anchor id the times it was kept (with a partner learnt: tasteData keeps only those); per anchor and partner id the pair; per state
 *  and kind the house lots counted and the sum of their kept items per 160 tiles squared */
export interface Taste { anchors: Map<string, number>; pairs: Map<string, Map<string, PairCount>>; density: Map<string, [number, number]> }
export const emptyTaste = (): Taste => ({ anchors: new Map(), pairs: new Map(), density: new Map() });
const dkey = (s: PresetState, k: ItemKind) => `${s}|${k}`;
const r2 = (v: number) => Math.round(v * 100) / 100 + 0, r3 = (v: number) => Math.round(v * 1000) / 1000 + 0;  // (+ 0: never -0, as the data file reads back)

/** the taste of a list of samples (group: whose lots' densities it counts, T169: the houses' unless told) */
export function buildTaste(samples: readonly Sample[], group: UseGroup = 'res'): Taste { const t = emptyTaste(); for (const s of samples) learnTaste(t, s, group); return t; }
/** a taste with one more sample counted (a gallery lot judged Bad says something is wrong but not which item: it is not counted); its densities
 *  only from the lots of group (T169: each use group learns its own) */
export function learnTaste(t: Taste, s: Sample, group: UseGroup = 'res'): Taste {
  if (s.verdict === 'down') return t;
  const kept = s.items.filter(i => i.kept);
  // pairs: each kept anchor, and the nearest of each other id kept within PAIR_R of it
  const paired = kept.filter(i => PAIRED.has(i.kind));
  for (const a of paired) {
    t.anchors.set(a.id, (t.anchors.get(a.id) ?? 0) + 1);
    const near = new Map<string, { d: number; dx: number; dy: number }>();
    for (const b of paired) {
      if (b === a) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), was = near.get(b.id);
      if (d <= PAIR_R && (!was || d < was.d)) near.set(b.id, { d, dx, dy });
    }
    if (!near.size) continue;
    let m = t.pairs.get(a.id); if (!m) t.pairs.set(a.id, m = new Map());
    for (const [id, o] of near) { const c = m.get(id) ?? { n: 0, offs: [] }; c.n++; if (c.offs.length < 2 * PAIR_OFFS) c.offs.push(r2(o.dx), r2(o.dy)); m.set(id, c); }
  }
  // densities: a lot of the group's (a house lot's) kept items of each kind per 160 tiles squared
  const st = s.ctx.state as PresetState;
  if (groupOf(s.ctx.use) === group && STATES.includes(st) && s.ctx.w > 0 && s.ctx.d > 0) {
    const per = (160 / (s.ctx.w * s.ctx.d));
    for (const k of ITEM_KINDS) { const c = t.density.get(dkey(st, k)) ?? [0, 0]; c[0]++; c[1] += kept.filter(i => i.kind === k).length * per; t.density.set(dkey(st, k), c); }
  }
  return t;
}

/** a pair's rate: the times seen over the anchor's (a prior of two unseen: a pair seen once or twice says little) */
export const pairRate = (t: Taste, anchor: string, partner: string): number => { const c = t.pairs.get(anchor)?.get(partner); return c ? c.n / ((t.anchors.get(anchor) ?? c.n) + 2) : 0; };
/** a partner as the generator lays it: its id and kind, its rate, its offsets (dx, dy pairs) */
export interface Partner { id: string; kind: ItemKind; rate: number; offs: readonly number[] }
/** the generator's pairs: per anchor id its partners (seen PAIR_MIN times or more, laid at PAIR_RATE_MIN or more, in the pools: the kind they are
 *  offered as), by id; undefined when there are none (a model without pairs lays as before) */
export function pairTable(t: Taste, pools: Readonly<Record<ItemKind, readonly string[]>>): Map<string, Partner[]> | undefined {
  const kindOf = new Map<string, ItemKind>();
  for (const k of ITEM_KINDS) if (PAIRED.has(k)) for (const id of pools[k]) kindOf.set(id, k);
  const out = new Map<string, Partner[]>();
  for (const [a, m] of [...t.pairs].sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))) {
    const list: Partner[] = [];
    for (const [b, c] of [...m].sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))) {
      const kind = kindOf.get(b), rate = pairRate(t, a, b);
      if (kind && c.n >= PAIR_MIN && rate >= PAIR_RATE_MIN && c.offs.length >= 2) list.push({ id: b, kind, rate, offs: c.offs });
    }
    if (list.length) out.set(a, list);
  }
  return out.size ? out : undefined;
}

/** a state's density of a kind (kept items per 160 tiles squared): its lots' mean drawn to the character prior (the mean of every state's lots,
 *  times the state's character) with DENSITY_K lots' weight */
export function stateDensity(t: Taste, s: PresetState, k: ItemKind): number {
  let lots = 0, sum = 0;
  for (const q of STATES) { const c = t.density.get(dkey(q, k)); if (c) { lots += c[0]; sum += c[1]; } }
  const mean = lots ? sum / lots : 0, c = t.density.get(dkey(s, k)) ?? [0, 0];
  return (c[1] + DENSITY_K * CHARACTER[s][k] * mean) / (c[0] + DENSITY_K);
}
/** the generator's count multiple of each kind on a lot of a state: the state's density over the built lots' (built: 1; a kind no lot has: the
 *  character), within DENSITY_MIN..DENSITY_MAX; undefined when the taste has no densities (a model without them lays as before) */
export function stateKinds(t: Taste, s: PresetState): Record<ItemKind, number> | undefined {
  if (!t.density.size) return undefined;
  const out = {} as Record<ItemKind, number>;
  for (const k of ITEM_KINDS) {
    if (s === 'built') { out[k] = 1; continue; }
    const b = stateDensity(t, 'built', k), v = b > 1e-6 ? stateDensity(t, s, k) / b : CHARACTER[s][k];
    out[k] = Math.min(DENSITY_MAX, Math.max(DENSITY_MIN, r3(v)));
  }
  return out;
}

/** the taste as data (the model file's anchors, pairs and density): the pairs seen PAIR_MIN times or more and their anchors, keys sorted */
export interface TasteData { anchors: Record<string, number>; pairs: Record<string, Record<string, number[]>>; density: Record<string, Record<string, [number, number]>> }
export function tasteData(t: Taste): TasteData {
  const anchors: Record<string, number> = {}, pairs: Record<string, Record<string, number[]>> = {}, density: Record<string, Record<string, [number, number]>> = {};
  const sorted = <V>(m: Map<string, V>) => [...m].sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));
  for (const [a, m] of sorted(t.pairs)) {
    const row: Record<string, number[]> = {};
    for (const [b, c] of sorted(m)) if (c.n >= PAIR_MIN) row[b] = [c.n, ...c.offs];
    if (Object.keys(row).length) { pairs[a] = row; anchors[a] = t.anchors.get(a) ?? 0; }
  }
  for (const s of STATES) {
    const row: Record<string, [number, number]> = {};
    for (const k of ITEM_KINDS) { const c = t.density.get(dkey(s, k)); if (c) row[k] = [c[0], r3(c[1])]; }
    if (Object.keys(row).length) density[s] = row;
  }
  return { anchors, pairs, density };
}
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** a taste read back from a model's data (its anchors, pairs and density; none: an empty taste, as v1's); bad entries dropped */
export function tasteFrom(d: unknown): Taste {
  const t = emptyTaste(), o = d && typeof d === 'object' ? (d as Partial<Record<keyof TasteData, unknown>>) : {};
  const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  if (obj(o.anchors)) for (const [a, n] of Object.entries(o.anchors)) if (fin(n) && n >= 0) t.anchors.set(a, n);
  if (obj(o.pairs)) for (const [a, row] of Object.entries(o.pairs)) {
    if (!obj(row)) continue;
    const m = new Map<string, PairCount>();
    for (const [b, v] of Object.entries(row)) if (Array.isArray(v) && v.length >= 1 && v.length % 2 === 1 && v.every(fin) && v[0]! >= 1) m.set(b, { n: v[0]!, offs: v.slice(1) as number[] });
    if (m.size) { t.pairs.set(a, m); if (!t.anchors.has(a)) t.anchors.set(a, Math.max(...[...m.values()].map(c => c.n))); }
  }
  if (obj(o.density)) for (const s of STATES) {
    const row = o.density[s]; if (!obj(row)) continue;
    for (const k of ITEM_KINDS) { const v = row[k]; if (Array.isArray(v) && v.length === 2 && v.every(fin) && v[0]! >= 0 && v[1]! >= 0) t.density.set(dkey(s, k), [v[0]!, v[1]!]); }
  }
  return t;
}
