// The Lot Composer (Phase 3 step 5c; P20 / T064): one lot's props and ground, deterministic from the lot, its use, level, decline and seed.
// Every built or upgraded lot of a use (houses, shops, public car parks, tour shops, industrial yards, civic buildings) is drawn from a preset
// (lot-presets.json, the owner tunes it): picked by use, state and size bucket and by the lot's slot along its street (neighbours differ),
// fitted to the lot's size and turned to its facing (never mirrored). An approved lot-lab preset (one with a road) wins over the frozen ones on its
// road angle, and gives an angled lot its building. Procedural, because they are not one lot's to tune (P20 decision 2): the vacant lots, the
// greens on angled lots, the building sites, the boundary fences and the house lots' fence planting, the industrial chain-link, the street items,
// the leaf decals, and the decline touches (a third of the plants gone, junk; at decline 1 half the cars, at 3 none). A whole preset (a lab preset that
// holds all of them) draws alone, its decals included, as a farm does.
// T160 (P25 #348 step 5): a house lot whose preset is a frozen one (not the owner's own: curated, approved or whole stay exact) keeps its base
// from that preset (the house, its drive and walk), its boundary fence and street items, and gets its plants, props, cars and decals from the
// learned generator (lot-gen.ts generateLayout), seeded by the lot's place on its street (a lot never changes on a reload, neighbours differ),
// with a shipped model (lot-models/: a new town the latest, a saved town its own version, lotModel). ?oldlots composes as before.
// The candidate list and its checks are compose-core.ts's. Pure TS, no DOM.
import type { LotPatch } from '../ground-protocol';
import { mulberry } from '../iso';
import { isBuilding } from '../mirror';
import { LU, LV } from './town';
import {
  BUSHES, BY, Build, CHAIN, DEAD_TREES, DRIVE_GAP, JUNK, MARK_ID, PARK_PIECES, PICKUPS, PRIVACY, SCHOOL_SIGNS, SIDE_YARD, TREES, clamp, isCarPark, mix,
  names, pick, specFit, withVariations,
  type Composition, type ComposeState, type LotGeom, type Pt, type PresetDrop,
} from './compose-core';
import { approvedFor, bucketOf, fitPreset, parsePresets, pickPreset, presetsFor, stateOf, type Fitted, type LotPreset, type PresetDecal, type PresetMeta, type PresetProp, type PresetState, type PresetUse, type Road } from './presets';
import { drawnView, footprintOf, ownerScaleOf, roadView, turned } from './preset-art';
import { frameOf, listToWorld, quarterOfRoad, roadOf, toWorld, type PresetFrame } from './preset-frame';
import PRESET_JSON from './lot-presets.json';
import { generateLayout, type LaidItem } from './lot-gen';
import { kindPools } from './item-kinds';
import { modelFrom, type Box, type HouseClass, type ItemKind, type Model, type SectorLot } from './learn';
import { pairTable, stateKinds, tasteFrom, type Partner } from './taste';
import { CLASS_NAMES, frameHalf, houseFamilies, sizeClassOf } from './house-class';
import { allows, parseAllocations } from './house-alloc';
import ALLOC_JSON from './house-allocations.json';
import REMOVED from '../../../scripts/assets/removed.json';
import { OWNER_SCALE } from './scales';
import { LIBRARY } from '../library';
import { drawnAsStandIn } from '../newart';
import { LATEST, LOT_MODELS } from './lot-models';
export { isCarPark, type Composition, type ComposeState, type LotGeom, type Placed, type PresetDrop } from './compose-core';

/** the fence grid of a house lot, drawn as its own layer (procedural: the presets hold no fences): wooden privacy panels on the
 *  lower world-coordinate side line (every lot owns one side) from the back line to 3.65 tiles (7.3 m)
 *  from the front edge, the same on every lot so neighbours' fences meet, and on the back line when n points to +X/+Y (of two
 *  lots back to back exactly one owns it). Along the inside of all three inner lines (so both faces
 *  of every fence are planted): shrubs, ferns and grasses with gaps, now and then a young tree; leaf drifts and tufts at the
 *  fence bases. Each neighbour supplies the planting on its own side of a shared line. */
const FENCE_PLANTS = names(['town:fern', 'town:ornamental_grass']).concat(BUSHES.filter(id => id !== 'world:hedge'));
/** one deterministic deck; each street slot gets three consecutive young-tree choices before the deck repeats */
const FENCE_TREES = (() => {
  const deck = TREES.filter(id => !/-ns:/.test(id)).sort(), r = mulberry(0x66e3);
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
})();
const FENCE_FRONT = 3.65;
/** the boundary fence of a lot: wooden privacy panels on its lines at the higher world-coordinate end: its side line there (along u, from the
 *  back line to FENCE_FRONT from the front edge, the same on every lot so neighbours' fences meet) and its back line when n points to +X/+Y.
 *  One rule for sides and backs, so every line between two lots is owned by exactly one of them (the lot on its lower side), whichever way the
 *  two face: a block's end column meets its rows' sides with its back. Every use but industry draws these, so a shared line gets one fence
 *  whatever the two uses are. */
function boundaryFence(B: Build, lot: LotGeom, lines: FenceLines = ALL_LINES) {
  const { W, D } = B, side = fenceSide(lot, W);
  if (lines.side) B.boundaryRun(PRIVACY, side, D, side, Math.min(D, FENCE_FRONT));
  if (lines.back && ownsBack(lot)) B.boundaryRun(PRIVACY, 0, D, W, D);
}
/** which of the lines a lot owns get their fence (fenceOnly: an empty lot fences only the lines it shares with a lot that has a house) */
export interface FenceLines { side: boolean; back: boolean }
const ALL_LINES: FenceLines = { side: true, back: true };
/** the local x (0 or W) of the side line a lot owns: the one at the higher world-coordinate end */
export const fenceSide = (lot: LotGeom, W: number) => (lot.u.x + lot.u.y > 0 ? W : 0);
/** does a lot own its back line (n points to +X / +Y) */
export const ownsBack = (lot: LotGeom) => lot.n.x + lot.n.y > 0;
/** the points just across the lines a lot owns (tiles): side, back (null when it does not own the back): the lot found there is the neighbour */
export function acrossLines(lot: LotGeom): { side: { x: number; y: number }; back: { x: number; y: number } | null } {
  const { o, u, n, w, d } = lot, at = (a: number, b: number) => ({ x: o.x + u.x * a + n.x * b, y: o.y + u.y * a + n.y * b });
  const s = fenceSide(lot, w);
  return { side: at(s + (s ? 0.5 : -0.5), (Math.min(d, FENCE_FRONT) + d) / 2), back: ownsBack(lot) ? at(w / 2, d + 0.5) : null };
}
/** a house lot's fence layer (its preset has no fences): the boundary fence, and the planting along the inside of its lines */
function fenceLayer(B: Build, lot: LotGeom) {
  const { W, D, r } = B;
  const slot = Math.round((lot.o.x * lot.u.x + lot.o.y * lot.u.y) / W), street = Math.round(lot.o.x * lot.n.x + lot.o.y * lot.n.y);
  const treeStart = mix(street, lot.n.x + 1, lot.n.y + 1) + slot * 3;
  let trees = 0;
  boundaryFence(B, lot);
  const plant = (a: number, b: number) => {
    const u = r();
    if (u >= 0.78) return;
    const young = u < 0.08 && trees < Math.min(3, FENCE_TREES.length);
    const treeIndex = ((treeStart + trees) % FENCE_TREES.length + FENCE_TREES.length) % FENCE_TREES.length;
    const id = young ? FENCE_TREES[treeIndex] : pick(r, FENCE_PLANTS);
    if (young) trees++;
    const g = B.spec(id, { mul: young ? 0.65 : 0.8 + 0.3 * r() });
    if (!g) return;
    // Keep a young tree's full footprint inside the yard; a fixed 0.45-tile inset discards nearly every tree.
    const ea = B.ea(g), eb = B.eb(g);
    if (ea * 2 > W || eb * 2 > D - FENCE_FRONT) return;
    B.at(g, clamp(a, ea, W - ea), clamp(b, FENCE_FRONT + eb, D - eb), { plant: true });
  };
  for (const a of [0.45, W - 0.45]) for (let b = FENCE_FRONT + 0.6; b < D - 0.6; b += 1.0 + 0.6 * r()) plant(a, b);
  for (let a = 1.2; a < W - 1.2; a += 1.0 + 0.6 * r()) plant(a, D - 0.45);
  const base = (a: number, b: number) => { B.mark('leaves', a, b, 0.7 + 0.3 * r()); B.mark('tufts', a, b, 0.55 + 0.2 * r()); };
  for (const a of [0.5, W - 0.5]) for (let b = FENCE_FRONT + 0.5; b < D - 0.5; b += 2) base(a, b);
  for (let a = 1; a < W - 1; a += 2) base(a, D - 0.5);
}


/** a small green, for a lot whose frontage runs off the map axes (no building there faces the street): two trees, a bench by the front, bushes */
function green(B: Build) {
  const { W, D, r } = B;
  // a centrepiece (gazebo, fountain, jungle gym) on a green that runs with the map axes (a lot more than 20 degrees off them stays plain)
  const square = Math.min(Math.abs(B.u.x), Math.abs(B.u.y)) < Math.sin(Math.PI / 9);
  const cp = square ? specFit(B, PARK_PIECES, W - 2, D - 2, { flip: B.flip }) : null;
  if (cp && r() < 0.7) B.at(cp, W / 2, D / 2);
  B.put(pick(r, TREES), W * 0.3, D * 0.45, { plant: true });
  B.put(pick(r, TREES), W * 0.7, D * 0.7, { plant: true });
  B.put('world:bench', W / 2, 1.4);
  B.scatter(BUSHES, 0.8, 0.8, W - 0.8, D - 0.8, 4 + Math.floor(r() * 3), { plant: true });
  B.marksIn('leaves', 0.8, 0.8, W - 0.8, D - 0.8, 2);
}


/** building supplies grouped by their use; names() omits pieces removed in the studio */
const SITE_KIT = {
  masonry: names(['construction:brick-pallet', 'construction:block-pallet', 'construction:roof-tile-pallet', 'construction:cement-bag-pallet', 'construction:tile-crate', 'construction:stone-pallet', 'construction:mortar-tools']).concat(withVariations(['expansion:cement-bags'])),
  aggregate: names(['construction:gravel-pile', 'construction:sand-pile']),
  long: names(['construction:timber-stack', 'construction:pipe-bundle', 'construction:steel-beams', 'construction:rebar-bundle', 'construction:lumber-stack']).concat(withVariations(['expansion:lumber-bundle'])),
  storage: names(['construction:pallet-stack', 'construction:mesh-rolls']).concat(withVariations(['expansion:pallet-stack'])),
  rubble: withVariations(['expansion:concrete-rubble']), spool: withVariations(['expansion:cable-spool']), forklift: withVariations(['expansion:forklift']),
};
/** a dirt construction site: a digger, varied supplies, rubble, a cable spool and a pickup; no building */
function site(B: Build) {
  B.allMarks = true;
  const { W, D, r, flip } = B;
  B.pave('yard', 0.3, 0.3, W - 0.3, D - 0.3, 'dirt');
  // The digger's source faces +X, so mirror it for streets along the other axis (+Y).
  // Give the machine priority over the smaller props; done() applies the usual lot and collision checks.
  B.put('construction:digger', W / 2 - 0.6, D / 2 + 1, { flip: !flip });
  B.put(pick(r, SITE_KIT.masonry), 1.2, 1.6);
  B.put(pick(r, SITE_KIT.masonry), 2.5, 1.2);
  B.put(pick(r, SITE_KIT.rubble), W - 1.6, 2.2);
  B.put(pick(r, SITE_KIT.aggregate), W - 1.5, D * 0.3);
  B.put(pick(r, SITE_KIT.spool), W - 1.4, D - 2.2);
  if (r() < 0.4) B.put(pick(r, SITE_KIT.forklift), W / 2 + 1.5, D / 2, { flip });
  B.put(pick(r, SITE_KIT.rubble), W / 2 - 2.6, D / 2 - 0.4);
  B.vehicle(PICKUPS, W / 2, 0.8);
  B.mark('mud', W / 2, 2.4, 1.2); B.mark('expansion:mud-footprints', W / 2, D / 2); B.mark('expansion:mud-arc', W * 0.7, D - 2.2); B.marksIn('gravel', 1, 1, W - 1, D - 1, 2);
  B.put(pick(r, SITE_KIT.long), 1.6, D - 1.8, { flip });
  B.put(pick(r, SITE_KIT.storage), W - 2.2, D - 1.4);
  if (r() < 0.5) B.put(pick(r, JUNK), W / 2, D - 1.5, { flip });
}

/** a vacant lot: a few weeds and a tree */
function vacant(B: Build) {
  const { W, D, r } = B;
  B.put(pick(r, BUSHES), W * 0.3, D * 0.5, { plant: true });
  B.put(pick(r, BUSHES), W * 0.7, D * 0.7, { plant: true });
  B.put(pick(r, TREES), W * 0.5, D * 0.3, { plant: true });
  // gone to weeds: tall grass and ferns, a dead tree, now and then a dumped item
  B.scatter(names(['town:ornamental_grass', 'town:fern', 'world:bush_2']), 0.8, 0.8, W - 0.8, D - 0.8, 5 + Math.floor(r() * 4), { plant: true });
  if (r() < 0.4) B.put(pick(r, DEAD_TREES), W * (0.2 + 0.6 * r()), D * (0.5 + 0.3 * r()), { plant: true });
  if (r() < 0.25) B.put(pick(r, JUNK), W * (0.3 + 0.4 * r()), D * 0.75);
  B.marksIn('leaves', 0.8, 0.8, W - 0.8, D - 0.8, 2); B.mark('worn', W * (0.3 + 0.4 * r()), D * (0.3 + 0.4 * r()), 1.5);
  if (r() < 0.4) B.mark('rubbish', W * (0.2 + 0.6 * r()), D * (0.6 + 0.3 * r())); if (r() < 0.6) B.mark('woods', W * r(), D * r());
}


/** an empty lot's or a starter house's lot's part of the fence grid: only the boundary fence it owns (boundaryFence), the lines given (the
 *  owner: an empty lot fences only a line it shares with a lot that has a house); nothing else stands on it (the block's grass shows) */
export function fenceOnly(lot: LotGeom, seed: number, lines: FenceLines = ALL_LINES): Composition {
  const B = new Build(lot, mulberry(mix(seed, 0x0fe7)));
  boundaryFence(B, lot, lines);
  return B.done();
}


// ---------------------------------------------------------------- the lots from presets (P20)
/** the lot presets the built lots are drawn from (lot-presets.json, read once), and the file's header (its dated notes: a save writes it back) */
const FILE = parsePresets(PRESET_JSON);
let PRESETS: LotPreset[] = FILE.presets, META: PresetMeta | undefined = FILE.meta;
/** the frozen presets (no road): the pool a lot not on a lab road draws from (the lab's presets never reach it) */
let LEGACY: LotPreset[] = PRESETS.filter(p => p.road === undefined);
/** the presets the lots are drawn from now */
export const lotPresets = (): readonly LotPreset[] => PRESETS;
/** the preset file's header (formatPresets writes it first), or undefined for a file without one */
export const lotPresetsMeta = (): PresetMeta | undefined => META;
/** replaces the presets (the dev editor after a save, a hot reload of lot-presets.json), and the header when given; the caller composes the
 *  lots again */
export function setLotPresets(list: LotPreset[], meta: PresetMeta | undefined = META) { PRESETS = list; LEGACY = list.filter(p => p.road === undefined); META = meta; BUCKETS.clear(); }
/** presetsFor's answer by use, state and size bucket for the frozen presets now (every compose asks; setLotPresets clears it) */
const BUCKETS = new Map<string, LotPreset[]>();
function presetsOf(use: PresetUse, state: PresetState, w: number, d: number): LotPreset[] {
  const b = bucketOf(w, d), k = `${use}|${state}|${b.w}x${b.d}`;
  let l = BUCKETS.get(k); if (!l) BUCKETS.set(k, (l = presetsFor(LEGACY, use, state, w, d)));
  return l;
}
/** approvedFor's answer by use, state, size bucket and road for the approved lab presets now (the same cache, cleared by setLotPresets) */
function approvedOf(use: PresetUse, state: PresetState, w: number, d: number, road: Road): LotPreset[] {
  const b = bucketOf(w, d), k = `A|${use}|${state}|${b.w}x${b.d}|${road}`;
  let l = BUCKETS.get(k); if (!l) BUCKETS.set(k, (l = approvedFor(PRESETS, use, state, w, d, road)));
  return l;
}
/** who takes a hot reload of lot-presets.json in the dev server (the dev editor: it ignores the echo of its own saves, else sets the presets and
 *  composes the lots again); with none, the reload replaces the presets and the header */
let reloadHandler: ((list: LotPreset[], meta: PresetMeta | undefined) => void) | null = null;
/** takes the hot reloads of lot-presets.json (dev server only; never in a build); returns the release */
export function onLotPresetsReload(fn: (list: LotPreset[], meta: PresetMeta | undefined) => void): () => void { reloadHandler = fn; return () => { if (reloadHandler === fn) reloadHandler = null; }; }
// the dev server: a saved lot-presets.json (the dev editor's, the studio's or by hand) replaces the presets in place, no page reload
if (import.meta.hot) import.meta.hot.accept('./lot-presets.json', m => { if (!m) return; const f = parsePresets(m.default); if (reloadHandler) reloadHandler(f.presets, f.meta); else setLotPresets(f.presets, f.meta); });

/** the preset use of a lot's state: res, com (a public car park: park), tour, ind, civic; null for a lot of no use */
export function presetUse(st: ComposeState): PresetUse | null {
  switch (st.use) {
    case LU.RES: return 'res';
    case LU.COM: return isCarPark(st) ? 'park' : 'com';
    case LU.TOUR: return 'tour';
    case LU.IND: return 'ind';
    case LU.GOV: return 'civic';
    default: return null;
  }
}
/** the street a lot's preset pick reads: its street line (the lot's front edge along n, whole tiles) and its facing */
export const streetKey = (lot: LotGeom) => `${Math.round(lot.o.x * lot.n.x + lot.o.y * lot.n.y)}|${Math.round(lot.n.x)},${Math.round(lot.n.y)}`;
/** a lot's slot along its street: its place in whole lots (the shop decks' rule), offset to stay positive (pickPreset floors a negative slot to
 *  0); the neighbours of one street take consecutive slots */
export const streetSlot = (lot: LotGeom) => Math.round((lot.o.x * lot.u.x + lot.o.y * lot.u.y) / lot.w) + 4096;

/** a lot whose frontage runs more than 20 degrees off both map axes: building sprites face the map axes only, so it is a green, not its use (compose) */
export function isAngled(lot: LotGeom): boolean { return Math.max(Math.abs(lot.u.x), Math.abs(lot.u.y)) < Math.cos(Math.PI / 9); }

/** the preset a lot draws, in this order: the lot lab's forced one (st.preset, when the presets have it, on any lot of any use and level); else, for a
 *  built or upgraded lot, an approved lab preset for the lot's road (approvedFor: a diagonal road takes only its own, an angled lot on an axis road
 *  none); else, on a lot the map axes fit, the frozen preset of its use, state and size bucket, picked by its street slot (pickPreset); null when no
 *  preset fits (a lot not built or upgraded, or of no use, has none unless forced) */
export function pickedPreset(lot: LotGeom, st: ComposeState): LotPreset | null {
  if (st.preset !== undefined) { const forced = PRESETS.find(p => p.id === st.preset); if (forced) return forced; }
  const use = presetUse(st), state = stateOf(st.level, st.decline);
  if (!use || !state) return null;
  const road = roadOf(lot.n), angled = isAngled(lot), ok = angled && road % 2 === 0 ? [] : approvedOf(use, state, lot.w, lot.d, road);
  if (ok.length) return pickPreset(ok, streetSlot(lot), streetKey(lot)) ?? null;
  if (angled) return null;
  // the frozen preset of the lot's slot, among those whose house fits the lot's band at today's sizes (houseFits: a list where every one fits,
  // nearly all, picks as before; neighbours still differ); none fits: among all, the house centred in its band
  const list = presetsOf(use, state, lot.w, lot.d), fits = list.filter(q => houseFits(q, lot));
  return pickPreset(fits.length ? fits : list, streetSlot(lot), streetKey(lot)) ?? null;
}
/** the preset a built lot draws (pickedPreset), fitted to the lot, and the lot's preset frame: frameOf, except that a lab preset of a diagonal road
 *  is turned by its quarter (quarterOfRoad); null as pickedPreset */
export function lotPreset(lot: LotGeom, st: ComposeState): { preset: LotPreset; fit: Fitted; frame: PresetFrame } | null {
  const preset = pickedPreset(lot, st);
  if (!preset) return null;
  const frame0 = frameOf(lot), frame = preset.road !== undefined && preset.road % 2 ? { ...frame0, q: quarterOfRoad(preset.road) } : frame0;
  // T167: a picture the owner removed is never drawn: a stand-in takes its place (or it is left out), before the house finds its yards
  const fit = standIns(fitPreset(preset, lot.w, lot.d), preset, lot, frame);
  return { preset, fit: frozenHouse(preset) ? houseYards(fit, frame) : fit, frame };
}

// ---------- T167: stand-ins for the pictures the owner removed
/** a picture the owner removed in the studio (removed.json: its kind, category, name and picture rectangle, read only), or one the library no
 *  longer has; null when it is drawn as itself */
function removedOf(id: string): RemovedPic | null {
  const r = (REMOVED as Record<string, RemovedPic | undefined>)[id];
  return r ? r : BY.has(id) ? null : { kind: 'building', cat: '', name: id };
}
interface RemovedPic { kind: string; cat: string; name: string; quad?: number[]; w?: number }
/** a removed picture's footprint half extent (tiles): its picture's width over a tile's 128 display px, a square base, at its owner size */
const removedHalf = (id: string, r: RemovedPic, scale: number) => { const q = r.quad, w = q && q.length >= 4 ? q[2]! - q[0]! : r.w ?? 256; return (w / 128) * scale * (OWNER_SCALE[id] ?? 1) / 2; };
/** the house allocations (T155, read only): a stand-in house is one that suits the lot's road angle and state */
const ALLOC = parseAllocations(ALLOC_JSON);
/** a fitted preset with its removed pictures replaced: the lot's house (its widest building) by a house of the same size class that suits the
 *  lot's road and state (the allocations) and fits its band, picked by the lot (it never changes on a reload); another building (a fire station)
 *  by a building of its kind and about its footprint, else left out; an expansion or a prop left out. Each stand-in is marked (standIn: the
 *  removed id) for the lot lab's badge. The preset itself is not changed */
export function standIns(fit: Fitted, preset: LotPreset, lot: LotGeom, f: PresetFrame): Fitted {
  const rem = fit.props.map(q => removedOf(q.id));
  if (!rem.some(Boolean)) return fit;
  const half = frameHalf(f), size = (i: number) => { const q = fit.props[i]!, r = rem[i]; if (r) { const h = removedHalf(q.id, r, q.scale); return 4 * h * h; } const it = BY.get(q.id); if (!it || !isBuilding(it)) return 0; const h = half(q); return 4 * h.ha * h.hb; };
  const buildingAt = (i: number) => { const r = rem[i]; return r ? ['building', 'house', 'venue'].includes(r.kind) : !!BY.get(fit.props[i]!.id) && isBuilding(BY.get(fit.props[i]!.id)!); };
  let main = -1, best = 0;
  fit.props.forEach((_, i) => { if (!buildingAt(i)) return; const a = size(i); if (a > best) { best = a; main = i; } });
  const state = preset.state, road = roadOf(lot.n), seed = fnv(`${streetKey(lot)}#${streetSlot(lot)}#removed`);
  const props: PresetProp[] = [], from: number[] = [], mark: (string | undefined)[] = [];
  fit.props.forEach((q, i) => {
    const r = rem[i];
    if (!r) { props.push(q); from.push(fit.from[i]!); mark.push(fit.standIn?.[i]); return; }
    const expansion = /(^|[:-])expansion[:-]/.test(q.id) && i !== main;
    const id = expansion || !buildingAt(i) ? null : i === main && preset.use === 'res' ? standInHouse(q, r, fit, lot, f, road, state, seed) : standInBuilding(q, r, seed + i, road);
    if (!id) return;
    // the stand-in keeps the removed one's street edge (its front, a square base) and its spot along the street; houseYards then keeps its yards
    const hr = removedHalf(q.id, r, q.scale), h = half({ ...q, id, scale: 1 }), y = clamp(q.y - hr + h.hb, h.hb, Math.max(h.hb, lot.d - h.hb)), x = clamp(q.x, h.ha, Math.max(h.ha, lot.w - h.ha));
    props.push({ ...q, id, scale: 1, x, y }); from.push(fit.from[i]!); mark.push(q.id);
  });
  return { ...fit, props, from, standIn: mark };
}
/** a stand-in house: a dwelling (house-class.ts) not removed, that suits the lot's road and state, of the removed one's size class, whose footprint
 *  fits the lot's house band (the drive side and the side yards, T164) and depth; among those one picked by the lot's seed; else the one of any
 *  class nearest the removed one's size that fits; null when none fits. On a road at 45 degrees (T154 Phase 2) the houses with a screen-axis set
 *  (they face the road: preset-art.ts roadView) come first: the others only when none of those fits */
function standInHouse(q: PresetProp, r: RemovedPic, fit: Fitted, lot: LotGeom, f: PresetFrame, road: Road, state: PresetState, seed: number): string | null {
  const fam = houseFamilies().get('dwelling'); if (!fam) return null;
  const half = frameHalf(f), hr = removedHalf(q.id, r, q.scale), area = 4 * hr * hr, [lo, hi] = fam.bounds;
  const cls = area < lo ? 0 : area < hi ? 1 : 2, drive = fit.patches.find(a => a.kind === 'drive');
  let d0 = Infinity, d1 = -Infinity; if (drive) for (let i = 0; i < drive.pts.length; i += 2) { d0 = Math.min(d0, drive.pts[i]!); d1 = Math.max(d1, drive.pts[i]!); }
  const left = drive ? (d0 + d1) / 2 < lot.w / 2 : true, band = drive ? (left ? lot.w - SIDE_YARD - (d1 + DRIVE_GAP) : d0 - DRIVE_GAP - SIDE_YARD) : lot.w - 2 * SIDE_YARD;
  const fits = (id: string) => { const h = half({ ...q, id, scale: 1 }); return 2 * h.ha <= band + 1e-6 && 2 * h.hb <= lot.d - 1; };
  const all = fam.ids.filter(id => !removedOf(id) && allows(ALLOC, id, road, state) && fits(id)), faced = all.filter(id => roadView(id, road, 0)), ok = faced.length ? faced : all;
  const same = ok.filter(id => sizeClassOf(id) === cls);
  if (same.length) return same[seed % same.length]!;
  if (!ok.length) return null;
  return ok.reduce((a, b) => (Math.abs(fam.area.get(a)! - area) <= Math.abs(fam.area.get(b)! - area) ? a : b));
}
/** a stand-in building of another use (a fire station): one of the library's buildings of the removed one's kind (not removed, drawn as itself, a
 *  front view) within 40% of its footprint area, one of the three nearest picked by the seed; null when there is none. On a road at 45 degrees
 *  (T154 Phase 2) those with a screen-axis set come first */
function standInBuilding(q: PresetProp, r: RemovedPic, seed: number, road: Road): string | null {
  const hr = removedHalf(q.id, r, q.scale), area = 4 * hr * hr;
  let pool = KIND_POOL.get(r.kind);
  if (!pool) KIND_POOL.set(r.kind, pool = LIBRARY.filter((it, i) => it.kind === r.kind && isBuilding(it) && !removedOf(it.id) && !drawnAsStandIn(i) && !it.id.startsWith('view:') && !it.id.startsWith('east:') && !/-north-|[-_]rear(?![a-z])/.test(it.id))
    .map(it => { const fp = footprintOf(it.id, OWNER_SCALE[it.id] ?? 1, false); return { id: it.id, a: (fp[2] - fp[0]) * (fp[3] - fp[1]) }; }));
  const all = pool.filter(c => c.a >= area * 0.6 && c.a <= area * 1.4).sort((a, b) => Math.abs(a.a - area) - Math.abs(b.a - area) || (a.id < b.id ? -1 : 1));
  const faced = all.filter(c => roadView(c.id, road, 0)), near = (faced.length ? faced : all).slice(0, 3);
  return near.length ? near[seed % near.length]!.id : null;
}
/** the library's buildings of a kind with their footprint areas, made once per kind (standInBuilding) */
const KIND_POOL = new Map<string, { id: string; a: number }[]>();
/** the approved farm preset a farm parcel draws (use 'farm', built, at its size, on its road angle: approvedFor), picked by its key (pickPreset); null
 *  when none fits: an angled parcel on an even road takes none, as pickedPreset gives a lot none */
export function farmPreset(p: { o: Pt; u: Pt; n: Pt; w: number; d: number; key: string }): LotPreset | null {
  const road = roadOf(p.n), ok = isAngled(p) && road % 2 === 0 ? [] : approvedOf('farm', 'built', p.w, p.d, road);
  return pickPreset(ok, 0, p.key) ?? null;
}

/** the share of a preset's cars a lot at decline 1 keeps (its preset is the built one; decline 3 keeps none) */
const CAR_KEEP_D1 = 0.5;
/** what the street items read of a drawn preset (preset frame, tiles): the drive's x range and the biggest building's; same: the lot's u runs
 *  along the preset's x (else x is mirrored into the lot's a: a = W - x) */
interface Drawn { drive: [number, number] | null; main: [number, number] | null; same: boolean }

/** the uprights the procedural plants (the fence layer's, the decline's) may add to a lot drawn from a preset: the old layouts' cap held them
 *  with the yard's own plants, which the presets now carry */
const EXTRA_PLANTS = 6;
/** draws a lot's preset: its patches, then its props as the first candidates (each turned to the lot's facing: preset-art.ts turned, never
 *  mirrored; at its footprint centre), the cars thinned by the lot's decline. The plant cap leaves EXTRA_PLANTS for the procedural planting */
function fromPreset(B: Build, lot: LotGeom, st: ComposeState, p: { preset: LotPreset; fit: Fitted; frame: PresetFrame }): Drawn {
  const { preset, fit, frame: f } = p, same = lot.u.x * f.u.x + lot.u.y * f.u.y > 0;
  const range = (pts: readonly number[]): [number, number] => { let a = Infinity, b = -Infinity; for (let i = 0; i < pts.length; i += 2) { a = Math.min(a, pts[i]!); b = Math.max(b, pts[i]!); } return [a, b]; };
  let drive: [number, number] | null = null, main: [number, number] | null = null, big = 0, ups = 0;
  for (const a of fit.patches) {
    B.patches.push({ kind: a.kind, tex: a.tex as LotPatch['tex'], quad: listToWorld(f, a.pts), ...(a.lines ? { lines: listToWorld(f, a.lines) } : {}) });
    if (a.kind === 'drive' && !drive) drive = range(a.pts);
  }
  if (B.drops) { const kept = new Set(fit.from); preset.props.forEach((q, i) => { if (!kept.has(i)) B.drops!.push({ preset: preset.id, prop: i, id: q.id, why: 'outside the lot at this size (the fit)' }); }); }
  fit.props.forEach((q, k) => {
    // T154 Phase 2: on a road at 45 degrees a building with a screen-axis set faces its street (preset-art.ts drawnView), else its view is turned
    const t = drawnView(q.id, f, q.view), it = BY.get(t.id);
    if (!it) return;
    const car = it.cat === 'Vehicles';
    if (car && (B.noCars || (st.decline === 1 && B.r() >= CAR_KEEP_D1))) { B.drops?.push({ preset: preset.id, prop: fit.from[k]!, id: t.id, why: B.noCars ? 'no cars on a derelict lot' : 'cars thinned on a shabby lot' }); return; }
    // a car's scale is its owner size (ownerScaleOf), the engine draws it at CAR_SCALE times that
    const s = q.scale * ownerScaleOf(q.id);
    // a whole preset's prop in front of the lot is a street item (the verge: done() keeps it there, as it keeps a procedural one)
    const item = B.atW({ id: t.id, s, flip: t.flip, h: footprintOf(t.id, s, t.flip) }, toWorld(f, q.x, q.y), { plant: it.kind === 'tree' || it.kind === 'bush', from: { preset: preset.id, prop: fit.from[k]! }, street: preset.whole === true && q.y < 0, ...(fit.standIn?.[k] ? { standIn: fit.standIn[k] } : {}), ...(t.diag ? { diag: true } : {}) });
    if (item && !item.fence && !item.wheel) ups++;
    if (isBuilding(it)) { const fp = footprintOf(t.diag ? t.id : q.id, s, false), hw = t.diag ? (fp[2] - fp[0]) / (2 * Math.SQRT2) : (q.view % 2 ? fp[3] - fp[1] : fp[2] - fp[0]) / 2; if (hw > big) { big = hw; main = [q.x - hw, q.x + hw]; } }
  });
  B.cap = ups + EXTRA_PLANTS;
  return { drive, main, same };
}

/** a frozen house preset: a house lot laid out by the old layouts and frozen (P20 T063), not one of the owner's own (curated, approved in the lab,
 *  or whole): its house keeps its yards at today's sizes (houseYards) */
const frozenHouse = (p: LotPreset) => p.use === 'res' && !p.curated && !p.approved && !p.whole;

// ---------- T160: the house lots generated on the fly
/** whether the house lots are generated (on; ?oldlots, or setGeneratedLots(false), composes them from their frozen presets' own items) */
let GENERATED = !(typeof location !== 'undefined' && /[?&]oldlots(&|=|$)/.test(location.search ?? ''));
export function setGeneratedLots(on: boolean): void { GENERATED = on; }
export const generatedLots = () => GENERATED;
/** the shipped model the lots compose with (a new town: LATEST; a loaded town: its save's lotModel, v1 when it has none), and the models read */
let MODEL_V = LATEST;
const MODELS = new Map<number, Model>();
/** the model version the town composes with: a version not shipped falls back to the nearest one below it (else v1) */
export function setLotModel(v: number): void { MODEL_V = LOT_MODELS[v] ? v : Math.max(1, ...Object.keys(LOT_MODELS).map(Number).filter(n => n < v)); }
export const lotModelVersion = () => MODEL_V;
/** a model version known from now on without a reload (the tests; a dev session after shipping one): its data (lots/learn.ts ModelData) */
export function addLotModel(v: number, data: unknown): void { (LOT_MODELS as Record<number, unknown>)[v] = data; MODELS.delete(v); TASTES.delete(v); }
function shippedModel(): Model { let m = MODELS.get(MODEL_V); if (!m) MODELS.set(MODEL_V, m = modelFrom(LOT_MODELS[MODEL_V] ?? LOT_MODELS[1])); return m; }
/** the shipped model's taste (T161, lots/taste.ts: its pairs and its densities by state; v1 has neither, and lays as it did), read once per version:
 *  the generator's pair table and each state's count multiples */
const TASTES = new Map<number, { pairs: Map<string, Partner[]> | undefined; kinds: Map<PresetState, Record<ItemKind, number> | undefined> }>();
function shippedTaste(state: PresetState): { pairs?: Map<string, Partner[]>; kinds?: Record<ItemKind, number> } {
  let t = TASTES.get(MODEL_V);
  if (!t) {
    const taste = tasteFrom(LOT_MODELS[MODEL_V] ?? LOT_MODELS[1]);
    TASTES.set(MODEL_V, t = { pairs: pairTable(taste, kindPools()), kinds: new Map((['built', 'upgraded', 'declined'] as const).map(s => [s, stateKinds(taste, s)])) });
  }
  const kinds = t.kinds.get(state);
  return { ...(t.pairs ? { pairs: t.pairs } : {}), ...(kinds ? { kinds } : {}) };
}
/** 32-bit FNV-1a of a string */
const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
/** a house lot's generator seed: its place on its street (streetKey, streetSlot: as the preset pick reads it) and its look state, so a lot never
 *  changes on a reload, its neighbours differ, and an upgrade lays it anew */
export const lotSeed = (lot: LotGeom, state: PresetState) => fnv(`${streetKey(lot)}#${streetSlot(lot)}#${state}`);
/** a fitted house preset's base: its patches and every building on it (the house, a garage, a shed, an attached expansion; the wizard's makeLot
 *  keeps the house alone, which lost the garages beside the houses); the index of the house, the widest (-1: none) */
function houseBase(p: { preset: LotPreset; fit: Fitted; frame: PresetFrame }): { base: { preset: LotPreset; fit: Fitted; frame: PresetFrame }; house: number } {
  // every building of the preset stays (the house, its garage, a shed, an attached expansion: they belong to the house, not to its yard); the
  // widest is the house (the generator's size class and sectors read it)
  const half = frameHalf(p.frame), keep: number[] = [];
  let k = -1, area = 0;
  p.fit.props.forEach((q, i) => { const it = BY.get(q.id); if (!it || !isBuilding(it)) return; keep.push(i); const h = half(q), a = h.ha * h.hb; if (a > area) { area = a; k = keep.length - 1; } });
  // the stand-in marks (T167) follow the props kept, index for index
  const fit: Fitted = { ...p.fit, props: keep.map(i => p.fit.props[i]!), from: keep.map(i => p.fit.from[i]!), decals: [], ...(p.fit.standIn ? { standIn: keep.map(i => p.fit.standIn![i]) } : {}) };
  return { base: { ...p, fit }, house: k };
}
/** the generated items of a house lot (its base drawn): lot-gen.ts generateLayout in the preset's frame, with the shipped model, seeded by the
 *  lot, each item kept with the model's keep rate where it stands (the learned taste thins the generous set, as the owner does in the wizard);
 *  nothing on the house, the walk takes nothing and the drive only a car; the cars thinned by decline as a preset's are. Placed after the base,
 *  the street items and the fence, so those win any overlap */
function generatedItems(B: Build, lot: LotGeom, st: ComposeState, p: { preset: LotPreset; fit: Fitted; frame: PresetFrame }, state: PresetState, hi: number) {
  const f = p.frame;
  for (const it of layoutOf(lot, p, state, hi)) {
    if (it.kind === 'decal') { decalMarks(B, f, [{ id: it.id, x: it.x, y: it.y, scale: 1, alpha: 1 }]); continue; }
    if (it.kind === 'car' && (B.noCars || (st.decline === 1 && B.r() >= CAR_KEEP_D1))) continue;
    const t = turned(it.id, f.q), s = ownerScaleOf(it.id);
    B.atW({ id: t.id, s, flip: t.flip, h: footprintOf(t.id, s, t.flip) }, toWorld(f, it.x, it.y), { plant: it.kind === 'tree' || it.kind === 'bush' || it.kind === 'flowerbed', ...(it.kind === 'car' ? { paved: true } : {}) });
  }
}
/** the items the generator lays on a house lot's base (generatedItems; preset frame, tiles): seeded by the lot, with the shipped model and its taste
 *  (T161: the state's density, the pairs) */
function layoutOf(lot: LotGeom, p: { preset: LotPreset; fit: Fitted; frame: PresetFrame }, state: PresetState, hi: number): LaidItem[] {
  const f = p.frame, half = frameHalf(f), hq = hi >= 0 ? p.fit.props[hi] : undefined, hh = hq ? half(hq) : null;
  const house: Box | null = hq && hh ? [hq.x - hh.ha, hq.y - hh.hb, hq.x + hh.ha, hq.y + hh.hb] : null;
  // nothing lands on any building of the base (the house, its garage, a shed)
  const taken = p.fit.props.map(q => { const h = half(q); return [q.x - h.ha, q.y - h.hb, q.x + h.ha, q.y + h.hb] as Box; });
  const box = (pts: readonly number[]): Box => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let i = 0; i + 1 < pts.length; i += 2) { x0 = Math.min(x0, pts[i]!); x1 = Math.max(x1, pts[i]!); y0 = Math.min(y0, pts[i + 1]!); y1 = Math.max(y1, pts[i + 1]!); } return [x0, y0, x1, y1]; };
  const sl: SectorLot = { w: lot.w, d: lot.d, house, drives: p.fit.patches.filter(a => a.kind === 'drive').map(a => a.pts) };
  const avoid = p.fit.patches.filter(a => a.kind === 'drive' || a.kind === 'walk').map(a => ({ box: box(a.pts), ...(a.kind === 'drive' ? { but: ['car' as const] } : {}) }));
  const k = hq ? sizeClassOf(hq.id) : null, cls: HouseClass = hq ? CLASS_NAMES[k ?? 0] : 'none';
  return generateLayout({ lot: sl, cls, model: shippedModel(), taken, pools: kindPools(), half, seed: lotSeed(lot, state), avoid, keep: true, ...shippedTaste(state) });
}
/** the items the generator lays on a lot the game generates (a built house lot of a frozen preset; preset frame, tiles), as compose draws them
 *  (but the cars a decline thins): the exam sheet and the tests read them; null for any other lot */
export function lotLayout(lot: LotGeom, st: ComposeState): LaidItem[] | null {
  if (!GENERATED || st.use === LU.NONE || st.level === LV.EMPTY || st.level === LV.BUILDING || presetUse(st) !== 'res') return null;
  const p = lotPreset(lot, st), state = stateOf(st.level, st.decline);
  if (!p || !state || p.preset.use === 'farm' || p.preset.whole || !frozenHouse(p.preset)) return null;
  const hb = houseBase(p);
  return layoutOf(lot, hb.base, state, hb.house);
}

/** a fitted house preset's house and its band (preset frame: x along the frontage, 0..f.w): the widest building (hw, hd its half extents along x
 *  and y as the lot draws it: turned to the lot's facing, at its owner size), and the band the old layouts lay a house in (legacy-layout.ts res):
 *  from DRIVE_GAP past the drive, or from a building between the house and the drive in the house's depth (a garage), to SIDE_YARD short of the
 *  side line on the far side. null when the preset has no drive or no building */
function houseBand(fit: Fitted, f: PresetFrame): { k: number; hw: number; hd: number; lo: number; hi: number } | null {
  const W = f.w, drive = fit.patches.find(a => a.kind === 'drive');
  if (!drive) return null;
  let d0 = Infinity, d1 = -Infinity;
  for (let i = 0; i < drive.pts.length; i += 2) { d0 = Math.min(d0, drive.pts[i]!); d1 = Math.max(d1, drive.pts[i]!); }
  const left = (d0 + d1) / 2 < W / 2;
  const half = (q: PresetProp): [number, number] => {
    const t = turned(q.id, f.q + q.view), b = footprintOf(t.id, q.scale * ownerScaleOf(q.id), t.flip), w = b[2] - b[0], h = b[3] - b[1];
    return [(Math.abs(f.u.x) * w + Math.abs(f.u.y) * h) / 2, (Math.abs(f.n.x) * w + Math.abs(f.n.y) * h) / 2];
  };
  let k = -1, hw = 0, hd = 0;
  fit.props.forEach((q, i) => { const it = BY.get(q.id); if (!it || !isBuilding(it)) return; const [a, b] = half(q); if (a > hw) { k = i; hw = a; hd = b; } });
  if (k < 0) return null;
  const h = fit.props[k]!;
  let near = left ? d1 + DRIVE_GAP : d0 - DRIVE_GAP;
  fit.props.forEach((q, i) => {
    const it = BY.get(q.id); if (i === k || !it || !isBuilding(it)) return;
    const [a, b] = half(q);
    if (q.y + b <= h.y - hd || q.y - b >= h.y + hd) return;
    if (left && q.x < h.x) near = Math.max(near, q.x + a); else if (!left && q.x > h.x) near = Math.min(near, q.x - a);
  });
  return { k, hw, hd, lo: left ? near : SIDE_YARD, hi: left ? W - SIDE_YARD : near };
}

/** T164: a frozen house preset's house keeps its yards. The presets were frozen from the old layouts with the house in its band (houseBand), and
 *  the owner sizes houses in the studio after the freeze: a house drawn bigger is wider, and stood on its frozen centre it ate its side yard (after
 *  the studio Rebuild of 2026-10-26 the ranch-long house stood 1.01 tiles from the side line of a 12.5-tile lot). So the fit moves the house
 *  along the frontage into its band (the least move), with its front walk and the props before its front (its porch and beds); a house wider
 *  than its band is centred in it (pickedPreset picks only presets whose house fits the lot, when its bucket has one) */
export function houseYards(fit: Fitted, f: PresetFrame): Fitted {
  const band = houseBand(fit, f);
  if (!band) return fit;
  const { k, hw, hd, lo, hi } = band, h = fit.props[k]!;
  const x = hi - lo >= 2 * hw - 1e-9 ? clamp(h.x, lo + hw, hi - hw) : (lo + hi) / 2, dx = x - h.x;
  if (Math.abs(dx) < 1e-9) return fit;
  const front = h.y - hd, before = (q: { x: number; y: number }) => q.y < front && q.x >= h.x - hw && q.x <= h.x + hw;
  const props = fit.props.map((q, i) => (i === k || before(q) ? { ...q, x: q.x + dx } : q));
  const patches = fit.patches.map(a => {
    if (a.kind !== 'walk') return a;
    let x0 = Infinity, x1 = -Infinity; for (let i = 0; i < a.pts.length; i += 2) { x0 = Math.min(x0, a.pts[i]!); x1 = Math.max(x1, a.pts[i]!); }
    if ((x0 + x1) / 2 < h.x - hw || (x0 + x1) / 2 > h.x + hw) return a;
    return { ...a, pts: a.pts.map((v, i) => (i % 2 ? v : clamp(v + dx, 0, f.w))) };
  });
  return { ...fit, props, patches };
}
/** whether a frozen house preset's house fits its band on a lot (any other preset does: the owner's are theirs to lay out) */
function houseFits(p: LotPreset, lot: LotGeom): boolean {
  if (!frozenHouse(p)) return true;
  const band = houseBand(fitPreset(p, lot.w, lot.d), frameOf(lot));
  return !band || band.hi - band.lo >= 2 * band.hw - 1e-9;
}

/** a whole preset's decals as the lot's ground marks (Build.marks: index, world x, y, scale, alpha, rounded as Build.mark rounds them); a decal id the game
 *  has no mark for is left out */
function decalMarks(B: Build, f: PresetFrame, decals: readonly PresetDecal[]) {
  for (const q of decals) { const i = MARK_ID.get(q.id); if (i === undefined) continue; const p = toWorld(f, q.x, q.y); B.marks.push(i, +p.x.toFixed(3), +p.y.toFixed(3), +q.scale.toFixed(3), +q.alpha.toFixed(2)); }
}

/** a lot's street items (they stay procedural: P20 decision 2), where the old layouts put them, by the preset's drive and main building: a
 *  house's bins, mailbox, leaf bags and a hydrant beside its drive; a shop's lamp away from its drive, a hydrant and a parking meter (a tour
 *  shop adds a phone booth and a sign); a car park's meter beside its drive; a civic building's lamp pair, bus stop and school sign; an
 *  industrial yard's utility pole. Preset-frame x, turned into the lot's a */
function streetItems(B: Build, use: PresetUse, d: Drawn) {
  const { W, r } = B, put = (id: string, x: number, b: number) => B.put(id, d.same ? x : W - x, b, { street: true });
  const dr = d.drive, left = dr ? (dr[0] + dr[1]) / 2 < W / 2 : true, m = d.main;
  if (use === 'res') {
    const bx = dr ? (left ? dr[1] + 0.5 : dr[0] - 0.5) : W / 2, sx = left ? 1 : -1;
    put('gen:trash-cans-row', bx, -0.35);
    put('world:mailbox', bx + sx * 0.9, -0.35);
    if (r() < 0.5) put('expansion:leaf-bags', bx + sx * 2.1, -0.4);
    if (r() < 0.15) put('world:hydrant', left ? W - 0.6 : 0.6, -0.4);
  } else if (use === 'com' || use === 'tour') {
    const lamp = dr && left ? W - 0.4 : 0.4;
    if (m) put('expansion:parking-meter', m[1] - 0.4, -0.35);
    put('world:streetlamp', lamp, -0.4);
    if (r() < 0.4) put('world:hydrant', lamp < W / 2 ? W - 0.5 : 0.5, -0.4);
    if (use === 'tour') { put('town:phone_booth', lamp < W / 2 ? 1.2 : W - 1.2, -0.4); put('town:street_sign', m ? (m[0] + m[1]) / 2 : W / 2, -0.6); }
  } else if (use === 'park') put('expansion:parking-meter', dr ? (left ? dr[1] + 0.6 : dr[0] - 0.6) : 0.6, -0.35);
  else if (use === 'civic') {
    const c = m ? (m[0] + m[1]) / 2 : W / 3;
    put('world:streetlamp', c - 1.2, -0.4);
    put('world:streetlamp', c + 1.2, -0.4);
    put('town:bus_stop', (m ? m[1] : c + 2) + 0.9, -0.5);
    put(pick(r, SCHOOL_SIGNS), W - 0.5, -0.4);
  } else put('town:utility_pole', 0.5, -0.5);
}

/** an industrial yard's chain-link ring, its gate gap in the middle of the front (the fences stay procedural) */
function chainRing(B: Build) {
  const { W, D } = B;
  B.run(CHAIN, 0.4, 0.4, W - 0.4, 0.4, [0.35, 0.65]);
  B.run(CHAIN, 0.4, 0.4, 0.4, D - 0.4);
  B.run(CHAIN, W - 0.4, 0.4, W - 0.4, D - 0.4);
  B.run(CHAIN, 0.4, D - 0.4, W - 0.4, D - 0.4);
}

/** The composition of a lot in a given state: deterministic from the lot, its use, level, decline and seed (and the presets). */
export function compose(lot: LotGeom, st: ComposeState, drops?: PresetDrop[]): Composition {
  const B = new Build(lot, mulberry(mix(st.seed, st.use, st.level, st.decline)));
  B.drops = drops ?? null;
  B.noCars = st.decline >= 3;
  // a preset that draws alone (a farm's, and a whole preset's: the lot lab's forced one, or the approved one picked for the lot): no street items, fences,
  // leaf marks or decline touches; its decals are the lot's ground marks
  const use = presetUse(st), lp = st.preset !== undefined || use ? lotPreset(lot, st) : null;
  if (lp && (lp.preset.use === 'farm' || lp.preset.whole)) { B.keepAll = true; fromPreset(B, lot, st, lp); decalMarks(B, lp.frame, lp.fit.decals); return B.done(); }
  const angled = isAngled(lot);
  // every lot but a house's and an industrial yard's draws the boundary fence on its own side lines (a shared line gets one fence); the drive's
  // mouth is left open
  const edge = () => { boundaryFence(B, lot); B.clearDrives(); };
  const p = use ? lp : null;
  if (st.use === LU.NONE || st.level === LV.EMPTY) { vacant(B); edge(); }
  else if (angled && !p) { green(B); edge(); }
  else if (st.level === LV.BUILDING) { site(B); edge(); }
  else if (!p || !use) { vacant(B); edge(); }
  else if (GENERATED && use === 'res' && frozenHouse(p.preset)) {
    // T160: the base of the frozen preset (its house, drive and walk), its street items and boundary fence; the yard from the generator
    const state = stateOf(st.level, st.decline)!, hb = houseBase(p), d = fromPreset(B, lot, st, hb.base);
    streetItems(B, use, d);
    boundaryFence(B, lot);
    generatedItems(B, lot, st, hb.base, state, hb.house);
    B.cap = Infinity;
  }
  else {
    const d = fromPreset(B, lot, st, p);
    streetItems(B, use, d);
    B.marksIn('leaves', 0.8, 0.8, B.W - 0.8, B.D - 0.8, 1 + Math.floor(B.r() * 2));
    if (use === 'res') fenceLayer(B, lot); else if (use === 'ind') chainRing(B); else edge();
  }
  if (st.decline >= 1) {
    B.thin(1 / 3);
    B.scatter(JUNK, 0.5, B.D * 0.5, B.W - 0.5, B.D - 0.5, st.decline >= 3 ? 2 : 1);
  }
  if (st.decline >= 3) B.scatter(BUSHES, 0.5, 0.5, B.W - 0.5, B.D - 0.5, 4, { plant: true });
  return B.done();
}
