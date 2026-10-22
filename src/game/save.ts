/** Saves: gzip-compressed JSON in IndexedDB. v4 stores only the map seed: the valley is regenerated from it. v5 adds the town's
 *  lots and the sim clock. Old v2 saves (160-tile maps in localStorage), v3 saves (with the painted terrain) and v4 saves (no lots)
 *  are migrated. */
import { MAP } from './iso';
import type { SaveData } from './types';
import type { LotTuple } from './lots/town';
import type { PaintTuple } from './paint';
import type { BudgetSave } from './budget';
import type { CareerSave } from './career';
import type { RoundSave } from './event/round';
import type { BusinessId } from './business/catalogue';
import type { BizStats } from './business/state';
import type { Seg } from './network';
import type { GolfSave } from './golf/mode';

const DB = 'capital-empire', STORE = 'saves', SLOT = 'town', V2_KEY = 'maple-falls-town-v2';
export const SAVE_VERSION = 5;

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function idbDo<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await idb();
  return new Promise((res, rej) => { const tx = db.transaction(STORE, mode), q = fn(tx.objectStore(STORE)); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
async function gzip(text: string) { return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer(); }
async function gunzip(buf: ArrayBuffer) { return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text(); }

/** a seg as saved (see SaveV5.segs): its ends, class, style and kind, and 1 for the towns' (Seg.town; absent for the player's) */
export function segRec(s: Seg): SaveV5['segs'][number] { const r: SaveV5['segs'][number] = [s.a.x, s.a.y, s.b.x, s.b.y, s.cls.id, s.style, s.kind]; if (s.town) r.push(1); return r; }

/** terrain as runs [value, count, value, count, ...] */
export function rle(a: Uint8Array) { const out: number[] = []; for (let i = 0; i < a.length;) { const v = a[i]; let j = i + 1; while (j < a.length && a[j] === v) j++; out.push(v, j - i); i = j; } return out; }
export function unrle(runs: number[], out: Uint8Array) { let o = 0; for (let k = 0; k + 1 < runs.length; k += 2) { out.fill(runs[k], o, o + runs[k + 1]); o += runs[k + 1]; } return out; }

export interface SaveV5 {
  version: number; map: number;
  /** the map seed: generateTerrain(seed) rebuilds the valley */
  seed: number;
  /** ax, ay, bx, by, class, line style, structure kind (0 ground, 1 bridge, 2 tunnel; missing = ground), and 1 when the towns' (Seg.town; optional 8th, missing = the player's) */
  segs: [number, number, number, number, string, number, number?, 1?][];
  /** x, y, junction type, flags (optional: 1 widened turns, 2 turn lanes; missing = none; no version bump), and a slip node's corners without a
   *  slipway as their in-arm degrees (optional 5th, written only when non-empty; missing = every corner has one), and a lights' [tier, ...split]
   *  (optional 6th: tier 0 fixed-time, 1 actuated, 2 adaptive; the green seconds per phase, none = 18 each; missing = actuated, 18 each) */
  nodes: [number, number, string, number?, number[]?, number[]?][];
  /** library id, x, y, flip, scale, and 1 for a prop placed by a plant brush (optional) */
  props: [string, number, number, number, number, 1?][];
  /** the treasury and the game day, as before the books (kept so older readers still work; the books hold the truth) */
  money: number; day: number; cam?: { X: number; Y: number; z: number };
  /** the town's lots that are not EMPTY: key, use, level, decline, seed, since (v5; missing = none) */
  lots?: LotTuple[];
  /** the sim clock, s, so the construction timers go on (v5) */
  simT?: number;
  /** the game clock's offset from simT, s (clock = simT + shift; missing = 0): a frozen clock saves as it stood (optional, no version bump) */
  shift?: number;
  /** the city's books: the treasury, loans, days in the red, bankruptcy and the ledgers (v5; missing = a fresh budget with money) */
  budget?: BudgetSave;
  /** the career: the highest milestone reached and the win (v5; missing = a fresh career at the hamlet) */
  career?: CareerSave;
  /** the event round: its stage, level, runs and last result (a build or surge saved mid-way restores as free; optional, no version bump) */
  round?: RoundSave;
  /** the car parks as [x, y, w, h] tiles, ids 1..n in this order (optional, no version bump; missing = none) */
  parks?: [number, number, number, number][];
  /** the toll gates as [ax, ay, bx, by, booths] (the plaza's ends, inbound a → b; ids 1..n in this order; optional, no version bump; missing = none) */
  tolls?: [number, number, number, number, number][];
  /** the shuttle bus routes as [park, sx, sy, dx, dy, buses, seats, town] (the lot stop and the doors stop, tiles; town: the town's index, -1 for a route
   *  of a car park; ids 1..n in this order; optional, no version bump; missing = none; a save without the town element has none) */
  buses?: [number, number, number, number, number, number, number, number?][];
  /** how many of the round's cards the game has applied to its tolls and bus routes (optional, no version bump; missing = all of them) */
  cardsApplied?: number;
  /** old (Phase B step 1): the stadium the player placed as [x, y, w, h] tiles, or null for none. Not written any more: a save without biz reads it as
   *  the stadium (id 1); a save with neither had the game's spot (placeStadium, as the engine's load gives it) */
  stadium?: [number, number, number, number] | null;
  /** the painted ground areas as [tex, scale, angle, border, btex, pts, radius, tone, toneAmt, tint] (the Paint tool, docs/PAINT-TOOL.md; ids 1..n in this order; optional, no version bump; missing = none; the last four are optional on load) */
  paints?: PaintTuple[];
  /** the Car park tool's bay rows as [ax, ay, bx, by, side, bay, col] (the drag, side 1 or -1, bay 90/60/45, col white or yellow; ids 1..n in this order;
   *  optional, no version bump; missing = none; docs/PARKING.md) */
  rows?: [number, number, number, number, number, number, string][];
  /** the on-street runs as [ax, ay, bx, by] (traffic from a to b, bays on its right kerb; ids 1..n in this order; optional, no version bump; missing = none) */
  curbs?: [number, number, number, number][];
  /** the parking fee per car ($, 0 to 50; optional, no version bump; missing = $5) */
  parkFee?: number;
  /** the placed businesses as [type, x, y, w, h] (top-left tile and size, turned; ids 1..n in this order; optional: a save without it reads stadium) */
  biz?: [BusinessId, number, number, number, number][];
  /** each business's stats, in the order of biz (its id is its place: 1..n; optional: missing = fresh) */
  bizStats?: BizStats[];
  /** the roads' speed-limit tier (0 to 3; absent: 0) */
  speed?: number;
  /** the golf game's state (golf/mode.ts; optional, no version bump; missing = a legacy classic game, which loads as before) */
  golf?: GolfSave;
}
/** the v2 library order (scripts/prep-sprites.py), so v2 saves' item indices can be read */
const V2_IDS = ['world:house_1', 'world:house_3', 'world:house_4', 'gen:house-duplex', 'gen:house-l-ranch', 'gen:house-ranch-long', 'gen:house-splitlevel', 'gen:house-l-shape', 'gen:house-farmhouse-wrap', 'static:garage_timber', 'static:garage_brick',
  'town:bakery', 'town:grocery', 'town:pharmacy', 'town:laundromat', 'town:postoffice', 'town:firestation', 'town:fish_tackle', 'world:diner', 'world:arcade', 'world:video_rental', 'ref:building-gas-canopy',
  'world:church', 'world:gazebo', 'world:watertower', 'ref:landmark-windmill', 'world:barn', 'world:primary_school',
  'world:tree_oak_0', 'world:tree_oak_1', 'world:tree_oak_2', 'world:tree_pine_0', 'world:tree_pine_1', 'ref:tree-maple-crimson', 'ref:tree-birch-gold', 'ref:tree-spruce-blue', 'world:bush_0', 'world:bush_1', 'world:hedge', 'town:hydrangea',
  'world:car_0', 'world:car_1', 'world:car_2', 'world:car_3', 'static:pickup_n', 'static:van_e', 'static:compact_e', 'static:compact_n', 'world:schoolbus',
  'world:streetlamp', 'world:hydrant', 'world:mailbox', 'world:bench', 'world:trashcan', 'town:stop_sign', 'town:street_sign', 'town:traffic_light', 'town:bus_stop', 'town:phone_booth', 'town:utility_pole', 'town:bike_rack', 'town:picnic_table', 'town:planter_square',
  'world:pumpkin_0', 'world:pumpkin_1', 'world:scarecrow', 'ref:halloween-hay-bales', 'ref:halloween-pumpkin-cluster', 'world:candy_stand', 'gen:inflatable-pumpkin', 'ref:halloween-sheet-ghost',
  'world:fence_picket_x', 'world:fence_picket_y', 'world:fence_iron_x', 'world:fence_iron_y', 'gen:fence-privacy-wood',
  'gen:trash-cans-row', 'gen:kids-bikes', 'expansion:trampoline', 'expansion:doghouse', 'expansion:basketball-hoop', 'expansion:washing-line'];

export async function writeSave(d: SaveV5) { const buf = await gzip(JSON.stringify(d)); await idbDo('readwrite', s => s.put(buf, SLOT)); return buf.byteLength; }
/** a parsed save of any version we read as the current one (null if it is not ours or not a version we read) */
export function upgradeSave(d: { version: number; map: number } & Partial<SaveV5>): SaveV5 | null {
  if (d.map !== MAP) return null;
  if (d.version === SAVE_VERSION) return d as SaveV5;
  // v4: the same town, no lots yet
  if (d.version === 4) return { ...(d as SaveV5), version: SAVE_VERSION };
  // v3: the same town with the painted terrain dropped; the seed came in v3 but was optional, so default to 1
  if (d.version === 3) return { version: SAVE_VERSION, map: MAP, seed: d.seed ?? 1, segs: d.segs!, nodes: d.nodes!, props: d.props!, money: d.money!, day: d.day!, cam: d.cam };
  return null;
}
export async function readSave(): Promise<SaveV5 | null> {
  try {
    const buf = await idbDo<ArrayBuffer | undefined>('readonly', s => s.get(SLOT));
    if (buf) { const d = upgradeSave(JSON.parse(await gunzip(buf))); if (d) return d; }
  } catch { /* no IndexedDB (private window): fall through */ }
  return migrateV2();
}
/** a v2 save (160-tile map) moved into the centre of the big map; its painted terrain is dropped (seed 1) */
function migrateV2(): SaveV5 | null {
  try {
    const raw = localStorage.getItem(V2_KEY); if (!raw) return null;
    const d = JSON.parse(raw) as SaveData; if (d.version !== 2) return null;
    const n = d.map, o = Math.floor((MAP - n) / 2);
    return {
      version: SAVE_VERSION, map: MAP, seed: 1, money: d.money, day: d.day,
      segs: d.segs.map(([ax, ay, bx, by, c, s]) => [ax + o, ay + o, bx + o, by + o, c, s]),
      nodes: d.nodes.map(([x, y, t2]) => [x + o, y + o, t2]),
      props: d.props.filter(([i]) => V2_IDS[i]).map(([i, x, y, f, k]) => [V2_IDS[i], x + o, y + o, f, k]),
      cam: d.cam ? { X: d.cam.X, Y: d.cam.Y + o * 64, z: d.cam.z } : undefined,
    };
  } catch { return null; }
}
export async function clearSave() { try { await idbDo('readwrite', s => s.delete(SLOT)); } catch { /* ignore */ } }
