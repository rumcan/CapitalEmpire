/** Saves: gzip-compressed JSON in IndexedDB. v4 stores only the map seed: the valley is regenerated from it. v5 adds the town's
 *  lots and the sim clock. Old v2 saves (160-tile maps in localStorage), v3 saves (with the painted terrain) and v4 saves (no lots)
 *  are migrated. */
import { MAP } from './iso';
import type { SaveData } from './types';
import type { LotTuple } from './lots/town';
import type { BudgetSave } from './budget';
import type { CareerSave } from './career';
import type { RoundSave } from './event/round';

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

/** terrain as runs [value, count, value, count, ...] */
export function rle(a: Uint8Array) { const out: number[] = []; for (let i = 0; i < a.length;) { const v = a[i]; let j = i + 1; while (j < a.length && a[j] === v) j++; out.push(v, j - i); i = j; } return out; }
export function unrle(runs: number[], out: Uint8Array) { let o = 0; for (let k = 0; k + 1 < runs.length; k += 2) { out.fill(runs[k], o, o + runs[k + 1]); o += runs[k + 1]; } return out; }

export interface SaveV5 {
  version: number; map: number;
  /** the map seed: generateTerrain(seed) rebuilds the valley */
  seed: number;
  /** ax, ay, bx, by, class, line style, structure kind (0 ground, 1 bridge, 2 tunnel; missing = ground) */
  segs: [number, number, number, number, string, number, number?][];
  /** x, y, junction type */
  nodes: [number, number, string][];
  /** library id, x, y, flip, scale */
  props: [string, number, number, number, number][];
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
