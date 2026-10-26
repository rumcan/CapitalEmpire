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
import type { TownClock } from './sim/townclock';
import type { Seg } from './network';
import type { GolfSave } from './golf/mode';
import type { GrassSave } from './ext/grass-management';

const DB = 'capital-empire', STORE = 'saves', SLOT = 'town', V2_KEY = 'maple-falls-town-v2';
export const SAVE_VERSION = 5;
/** the build that writes saves (P07/T044): the package version and the git sha; 'dev' when not built by Vite (the tests) */
export const BUILD = typeof __BUILD__ !== 'undefined' && __BUILD__ ? __BUILD__ : { app: '0.0.0', sha: 'dev' };

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function idbDo<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await idb();
  return new Promise((res, rej) => { const tx = db.transaction(STORE, mode), q = fn(tx.objectStore(STORE)); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
export async function gzip(text: string) { return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer(); }
export async function gunzip(buf: ArrayBuffer) { return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text(); }

/** where saves live: get, put and delete a slot's bytes, and list the slots (IndexedDB in the game; a Map in the tests) */
export interface SaveStore { get(k: string): Promise<ArrayBuffer | undefined>; put(k: string, v: ArrayBuffer): Promise<void>; del(k: string): Promise<void>; keys(): Promise<string[]> }
/** the IndexedDB store (the existing idb/idbDo helpers; keys via getAllKeys) */
export const idbStore: SaveStore = {
  get: k => idbDo<ArrayBuffer | undefined>('readonly', s => s.get(k)),
  put: async (k, v) => { await idbDo('readwrite', s => s.put(v, k)); },
  del: async k => { await idbDo('readwrite', s => s.delete(k)); },
  keys: () => idbDo<IDBValidKey[]>('readonly', s => s.getAllKeys()).then(ks => ks.map(String)),
};
let store: SaveStore = idbStore;
/** swaps the store (tests) */
export function setSaveStore(s: SaveStore) { store = s; }

/** a seg as saved (see SaveV5.segs): its ends, class, style and kind, and 1 for the towns' (Seg.town; absent for the player's) */
export function segRec(s: Seg): SaveV5['segs'][number] { const r: SaveV5['segs'][number] = [s.a.x, s.a.y, s.b.x, s.b.y, s.cls.id, s.style, s.kind]; if (s.town) r.push(1); return r; }

/** terrain as runs [value, count, value, count, ...] */
export function rle(a: Uint8Array) { const out: number[] = []; for (let i = 0; i < a.length;) { const v = a[i]; let j = i + 1; while (j < a.length && a[j] === v) j++; out.push(v, j - i); i = j; } return out; }
export function unrle(runs: number[], out: Uint8Array) { let o = 0; for (let k = 0; k + 1 < runs.length; k += 2) { out.fill(runs[k], o, o + runs[k + 1]); o += runs[k + 1]; } return out; }

export interface SaveV5 {
  /** Optional managed turf grid; older saves retain their existing base/lawn/paint choices. */
  grass?: GrassSave;
  version: number; map: number;
  /** the shipped lot model the town's house lots compose with (T160, lots/lot-models; optional, no version bump; missing = v1) */
  lotModel?: number;
  /** the map seed: generateTerrain(seed) rebuilds the valley */
  seed: number;
  /** ax, ay, bx, by, class, line style, structure kind (0 ground, 1 bridge, 2 tunnel; missing = ground), and 1 when the towns' (Seg.town; optional 8th, missing = the player's) */
  segs: [number, number, number, number, string, number, number?, 1?][];
  /** x, y, junction type, flags (optional: 1 widened turns, 2 turn lanes; missing = none; no version bump), and a slip node's corners without a
   *  slipway as their in-arm degrees (optional 5th, written only when non-empty; missing = every corner has one), and a lights' [tier, ...split]
   *  (optional 6th: tier 0 fixed-time, 1 actuated, 2 adaptive; the green seconds per phase, none = 18 each; missing = actuated, 18 each) */
  nodes: [number, number, string, number?, number[]?, number[]?][];
  /** library id, x, y, flip, scale, and 1 for a prop placed by a plant brush (optional); a Props tool prop (T131) has 0 there and its catalogue key after */
  props: [string, number, number, number, number, (0 | 1)?, string?][];
  /** the treasury and the game day, as before the books (kept so older readers still work; the books hold the truth) */
  money: number; day: number; /** tb: the tile set families' band (T150, painted-tiles.ts nextBand: 0 NEAR, 1 MID, 2 FAR), so a reload inside the hysteresis lays the same tiles; ts: T145's coverage step, read by nothing now */ cam?: { X: number; Y: number; z: number; tb?: number; ts?: number };
  /** the town's lots that are not EMPTY: key, use, level, decline, seed, since (v5; missing = none) */
  lots?: LotTuple[];
  /** the sim clock, s, so the construction timers go on (v5) */
  simT?: number;
  /** the game clock's offset from simT, s (clock = simT + shift; missing = 0): a frozen clock saves as it stood (optional, no version bump) */
  shift?: number;
  /** the town clock (T048; optional, no version bump; missing = a clock from 0 at the current day length) */
  townClock?: TownClock;
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
  /** the build that wrote this save (T044; optional, informational only, never used to refuse a save) */
  build?: { app: string; sha: string };
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

export async function writeSave(d: SaveV5) { const buf = await gzip(JSON.stringify({ ...d, build: BUILD })); await store.put(SLOT, buf); return buf.byteLength; }
/** the save migrations, one step per version: step `from` turns a save of that version into the next one's shape; upgradeSave runs them in order */
export const MIGRATIONS: { from: number; up(d: any): any }[] = [
  // v3: the same town with the painted terrain dropped; the seed came in v3 but was optional, so default to 1
  { from: 3, up: d => ({ version: 4, map: MAP, seed: d.seed ?? 1, segs: d.segs, nodes: d.nodes, props: d.props, money: d.money, day: d.day, cam: d.cam }) },
  // v4: the same town, no lots yet
  { from: 4, up: d => ({ ...d, version: 5 }) },
];
/** a parsed save of any version we read as the current one (null if it is not ours or not a version we read) */
export function upgradeSave(d: { version: number; map: number } & Partial<SaveV5>): SaveV5 | null {
  if (d.map !== MAP) return null;
  if (d.version === SAVE_VERSION) return d as SaveV5;
  let x: any = d;
  while (x.version !== SAVE_VERSION) { const m = MIGRATIONS.find(s => s.from === x.version); if (!m) return null; x = m.up(x); }
  return x as SaveV5;
}
/** what reading the save found: ok (the save, maybe migrated from an older version), none (no save), future (a newer build's), otherMap, corrupt (unreadable bytes, bad JSON, an unknown older version); backedUp: the unreadable save's bytes were copied to a backup slot first */
export interface SaveRead { save: SaveV5 | null; status: 'ok' | 'none' | 'future' | 'otherMap' | 'corrupt'; version?: number; migratedFrom?: number; backedUp: boolean; backup?: string }
/** reads the town slot. A save is never overwritten unless it was read or copied to a backup slot first (T042). Never throws. */
export async function readSave(): Promise<SaveRead> {
  try { return await readSlot(); } catch { return { save: null, status: 'none', backedUp: false }; }
}
async function readSlot(): Promise<SaveRead> {
  let buf: ArrayBuffer | undefined, idbOk = true;
  try { buf = await store.get(SLOT); } catch { idbOk = false; } // no IndexedDB (private window): the v2 save may still be in localStorage
  if (!buf) {
    const v2 = migrateV2();
    if (v2) return { save: v2, status: 'ok', version: SAVE_VERSION, migratedFrom: 2, backedUp: true };
    return { save: null, status: 'none', backedUp: idbOk }; // nothing in the slot to lose
  }
  let d: any;
  try { d = JSON.parse(await gunzip(buf)); } catch { d = undefined; }
  if (!d || typeof d !== 'object') return unreadable('corrupt', buf);
  const v: number | undefined = typeof d.version === 'number' ? d.version : undefined;
  if (d.map !== MAP) return unreadable('otherMap', buf, v);
  if (v !== undefined && v > SAVE_VERSION) return unreadable('future', buf, v);
  const save = v === undefined || v < 3 ? null : upgradeSave(d);
  if (!save) return unreadable('corrupt', buf, v);
  if (v! < SAVE_VERSION) { // a migrated save: keep the original bytes once per version
    const pre = `town-pre-v${v}`;
    let backedUp = true;
    try { if ((await store.get(pre)) === undefined) await store.put(pre, buf); } catch { backedUp = false; }
    return { save, status: 'ok', version: SAVE_VERSION, migratedFrom: v, backedUp, ...(backedUp ? { backup: pre } : {}) };
  }
  return { save, status: 'ok', version: SAVE_VERSION, backedUp: true };
}
/** copies an unreadable save's bytes to a backup slot; backedUp false if that failed (the caller then must not write over the slot) */
async function unreadable(status: 'future' | 'otherMap' | 'corrupt', buf: ArrayBuffer, version?: number): Promise<SaveRead> {
  const backup = `town-backup-${status}-${version ?? 'x'}-${Date.now()}`;
  try { await store.put(backup, buf); return { save: null, status, version, backedUp: true, backup }; }
  catch { return { save: null, status, version, backedUp: false }; }
}
/** copies the town slot's bytes to a backup slot, for a save that read fine but failed to load; false when there was nothing to copy or the copy failed */
export async function backupTownSlot(tag: string): Promise<boolean> {
  try { const buf = await store.get(SLOT); if (!buf) return false; await store.put(`town-backup-${tag}-x-${Date.now()}`, buf); return true; } catch { return false; }
}
/** the time in a backup slot's key (its last number; 0 for the pre-version copies) */
const slotStamp = (k: string) => { const m = /-(\d+)$/.exec(k); return m ? Number(m[1]) : 0; };
/** the backup slots (newest first) */
export async function listSaveBackups(): Promise<string[]> {
  try { return (await store.keys()).filter(k => k.startsWith('town-backup-') || k.startsWith('town-pre-v')).sort((a, b) => slotStamp(b) - slotStamp(a)); }
  catch { return []; }
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
export async function clearSave() { try { await store.del(SLOT); } catch { /* ignore */ } }

/** the town slot's bytes as stored (gzip JSON), for a download; null with no save */
export async function exportSaveBytes(): Promise<ArrayBuffer | null> {
  try { return (await store.get(SLOT)) ?? null; } catch { return null; }
}
/** loads a save file's bytes into the town slot: refused (nothing written) unless it gunzips, parses and upgrades (upgradeSave); on success the current town slot is first copied to a backup (backupTownSlot('import')) */
export async function importSaveBytes(buf: ArrayBuffer): Promise<{ ok: boolean; why?: string; version?: number }> {
  let d: any;
  try { d = JSON.parse(await gunzip(buf)); } catch { d = undefined; }
  if (!d || typeof d !== 'object') return { ok: false, why: 'Not a Capital Empire save' };
  const v: number | undefined = typeof d.version === 'number' ? d.version : undefined;
  if (v !== undefined && v > SAVE_VERSION) return { ok: false, why: `This save is from a newer build (v${v})`, version: v };
  if (d.map !== MAP) return { ok: false, why: 'This save is for another map size', version: v };
  const save = v === undefined || v < 3 ? null : upgradeSave(d);
  if (!save) return { ok: false, why: 'This save could not be read', version: v };
  try {
    // a current save that cannot be copied to a backup is never written over
    if ((await store.get(SLOT)) !== undefined && !(await backupTownSlot('import'))) return { ok: false, why: 'The current save could not be backed up, so nothing was loaded', version: v };
    await store.put(SLOT, buf);
  } catch { return { ok: false, why: 'The save could not be written', version: v }; }
  return { ok: true, version: v };
}
/** a backup slot's bytes (null if missing or not a backup slot: only the keys listSaveBackups lists are read) */
export async function readBackup(key: string): Promise<ArrayBuffer | null> {
  try { if (!(await listSaveBackups()).includes(key)) return null; return (await store.get(key)) ?? null; } catch { return null; }
}
/** deletes a backup slot; false for any key listSaveBackups does not list (the town slot is never one of them) or when the delete failed */
export async function deleteBackup(key: string): Promise<boolean> {
  try { if (!(await listSaveBackups()).includes(key)) return false; await store.del(key); return true; } catch { return false; }
}
