// T297 (#882; the lead's design, 2026-11-02: "a group holds only pictures the owner has already used in that kind of place on that kind of lot: a
// shabby back yard's junk stays shabby, a tidy front yard's planting stays tidy"): the lot groups, learned from the presets. Every prop of every
// preset gives a cell key use|state|zone|role|size; a cell's members are the distinct ids seen in it. compose.ts remixes a lot's props within
// their cell (lotPreset). Pure: no DOM, no randomness. The library's own fields decide the role, so new art joins a group by its name.
import { LIBRARY } from '../library';
import { isBuilding } from '../mirror';
import { footprintOf, ownerScaleOf } from './preset-art';
import { SKIP_CAT } from './item-kinds';
import type { LotPreset, PresetProp, PresetState, PresetUse } from './presets';

/** where a prop stands in its lot's frame: front (y < 0.3 d), back (y > 0.65 d), side (x < 0.2 w or x > 0.8 w, else), middle */
export type Zone = 'front' | 'side' | 'middle' | 'back';
/** what a prop is for, from the library item (roleOf); a building in a preset's main spot is no role (mainOf) */
export type Role = 'house' | 'garage' | 'shed' | 'play' | 'patio' | 'planter' | 'tree' | 'car' | 'bin' | 'mail' | 'sign' | 'junk' | 'decor';

const BYID = new Map(LIBRARY.map(it => [it.id, it] as const));
/** a turned view's id suffix (a four-view picture's N E S W or diagonal views, a numbered variation): the base picture's id is the rest */
const VIEW_SUFFIX = /:(\d+|ne|nw|se|sw|n|e|s|w)$/;
/** ids that are never grouped: fences and gates, the parking gear, people, and the patches and decals */
const NEVER = /fence|gate|hedge|wheel-stop|parking-entry|boom|walker|spectator|golfer|townsperson/i;
const GARAGE = /garage|carport/, SHED = /\bshed|outhouse|lean-to|boxcar|glasshouse|coop|doghouse/, PLAY = /swings?\b|slide|trampoline|sandbox|playhouse|treehouse|junglegym|skate|kiddie|tricycle|basketball|soapbox|go-kart|gokart|ride-on/;
const PATIO = /patio|barbecue|barbeque|\bbbq|picnic|table|chair|umbrella|fire ?pit|\bbench\b|gazebo|hammock|carseat|\bpool\b|camping|cooler|ice chest|\btent\b/;
const PLANTER = /planter|fern|hydrangea|grass|flower|\bbed\b|\bpot\b|plant|bush|shrub|\bmums?\b/, BIN = /trash|dumpster|recycl|garbage|compost|\bbin\b/;
const MAIL = /mailbox|\bmail\b|letter/, SIGN = /\bsign\b|meter/, JUNK = /junk|scrap|tyre|tire|crate|barrel|drum|pallet|rubble|heap|\bpile\b|bundle|cement|lumber|timber|appliance|rusty|stripped|\bcrt\b|hvac|compressor|spool|cabinet|woodpile|firewood/;

const ROLE_CACHE = new Map<string, Role | null>();
/** the role of a library id (cached): a car, tree, building part (garage, shed or house), play set, patio, planter, bin, mail box, sign, junk or decor; null
 *  for what is never swapped (fences, gates, the parking gear, people) and for an id the library lacks */
export function roleOf(id: string): Role | null {
  let r = ROLE_CACHE.get(id); if (r !== undefined) return r;
  r = roleOfItem(id); ROLE_CACHE.set(id, r); return r;
}
function roleOfItem(id: string): Role | null {
  if (id.startsWith('cars:')) return 'car';
  const it = BYID.get(id) ?? BYID.get(id.replace(VIEW_SUFFIX, '')); if (!it) return null;
  if (it.kind === 'fencex' || it.kind === 'fencey' || it.kind === 'walker' || it.cat === 'Fences' || SKIP_CAT.has(it.cat)) return null;
  const w = `${id} ${it.name}`.toLowerCase();
  if (NEVER.test(w)) return null;
  if (it.kind === 'car' || it.cat === 'Vehicles') return 'car';
  if (it.kind === 'tree') return 'tree';
  if (it.kind === 'building' || it.kind === 'house' || it.kind === 'venue' || it.kind === 'lot') return GARAGE.test(w) ? 'garage' : SHED.test(w) ? 'shed' : 'house';
  if (it.kind === 'gazebo' || (PATIO.test(w) && !PLAY.test(w.replace(/patio swing/, '')))) return 'patio';
  if (PLAY.test(w) || it.kind === 'junglegym') return 'play';
  if (SHED.test(w)) return 'shed';
  if (it.kind === 'bush' || PLANTER.test(w)) return 'planter';
  if (BIN.test(w)) return 'bin';
  if (MAIL.test(w)) return 'mail';
  if (SIGN.test(w) || it.cat === 'Road signs') return 'sign';
  if (JUNK.test(w)) return 'junk';
  return 'decor';
}

/** a prop's zone in its preset's frame (w along the street, d away from it): see Zone */
export function zoneOf(x: number, y: number, w: number, d: number): Zone {
  if (y < 0.3 * d) return 'front'; if (y > 0.65 * d) return 'back';
  return x < 0.2 * w || x > 0.8 * w ? 'side' : 'middle';
}

const SIZE_CACHE = new WeakMap<PresetProp, string>();
/** a prop's size key: the footprint area (the sum of hx x hy over its library boxes, at its drawn scale: its preset scale times its owner scale) as a
 *  log2 bucket, and l or a for its long side along the street (its view's turn: an even view runs its width along x) */
export function sizeOf(q: PresetProp): string {
  let k = SIZE_CACHE.get(q); if (k !== undefined) return k;
  const it = BYID.get(q.id) ?? BYID.get(q.id.replace(VIEW_SUFFIX, '')), s = q.scale * ownerScaleOf(q.id);
  let a = 0; for (const b of it?.boxes ?? []) a += b.hx * b.hy;
  a *= s * s;
  const fp = footprintOf(q.id, s, false), long = q.view % 2 === 0 ? fp[2] - fp[0] >= fp[3] - fp[1] : fp[3] - fp[1] >= fp[2] - fp[0];
  k = `${Math.floor(Math.log2(Math.max(a, 1e-3)))}${long ? 'l' : 'a'}`; SIZE_CACHE.set(q, k); return k;
}

/** a preset's main building: the index of its biggest building prop (the house or the shop), -1 for none (its footprint at its drawn size) */
export function mainOf(p: LotPreset): number {
  let k = -1, area = 0;
  p.props.forEach((q, i) => { const it = BYID.get(q.id); if (!it || !isBuilding(it)) return; const fp = footprintOf(q.id, q.scale * ownerScaleOf(q.id), false), a = (fp[2] - fp[0]) * (fp[3] - fp[1]); if (a > area) { area = a; k = i; } });
  return k;
}
/** a cell's key */
export const cellOf = (use: PresetUse, state: PresetState, zone: Zone, role: Role, size: string): string => `${use}|${state}|${zone}|${role}|${size}`;

/** the cells learned from a list of presets: each key to its members (the distinct ids seen in it, sorted); the main building of each preset is left out */
export function learnGroups(presets: readonly LotPreset[]): Map<string, string[]> {
  const seen = new Map<string, Set<string>>();
  for (const p of presets) {
    const main = mainOf(p);
    p.props.forEach((q, i) => {
      if (i === main) return;
      const role = roleOf(q.id); if (!role) return;
      const k = cellOf(p.use, p.state, zoneOf(q.x, q.y, p.w, p.d), role, sizeOf(q));
      let s = seen.get(k); if (!s) seen.set(k, s = new Set()); s.add(q.id);
    });
  }
  return new Map([...seen].map(([k, s]) => [k, [...s].sort()] as const));
}

/** the cells of the presets the groups are learned from (buildGroups sets them; the first groupOf after that learns them) */
let SOURCE: readonly LotPreset[] = [], CELLS: Map<string, string[]> | null = null, MEMBERS: Map<string, string[]> | null = null;
/** the presets the groups are learned from: replaces the cells (compose.ts calls it with the presets it draws from, and again on a reload) */
export function buildGroups(presets: readonly LotPreset[]): void { SOURCE = presets; CELLS = null; MEMBERS = null; }
/** the members of a cell (the ids seen in it, sorted), or [] for a cell no preset has */
export function groupOf(use: PresetUse, state: PresetState, zone: Zone, role: Role, size: string): readonly string[] {
  if (!CELLS) CELLS = learnGroups(SOURCE);
  return CELLS.get(cellOf(use, state, zone, role, size)) ?? [];
}

/** T305 (#890): the members of every size of one use, state, zone and role (a cell's key without its size), sorted and without repeats: an auto
 *  lot (autolot.ts) fills a slot from these and fits each to its spot, so the size is the spot's, not the preset's */
export function membersOf(use: PresetUse, state: PresetState, zone: Zone, role: Role): readonly string[] {
  if (!CELLS) CELLS = learnGroups(SOURCE);
  if (!MEMBERS) {
    const sets = new Map<string, Set<string>>();
    for (const [k, m] of CELLS) { const p = k.slice(0, k.lastIndexOf('|')); let s = sets.get(p); if (!s) sets.set(p, s = new Set()); for (const id of m) s.add(id); }
    MEMBERS = new Map([...sets].map(([p, s]) => [p, [...s].sort()] as const));
  }
  return MEMBERS.get(`${use}|${state}|${zone}|${role}`) ?? [];
}
