// The in-game dev editor (P20 / T071; dev builds only: App.tsx loads it behind import.meta.env.DEV). On with ?dev in the URL or the I key.
// Click a sprite to select it (topmost under the cursor: Game.propAt over the sprites' rects), or drag it to move it (past 4 px; Esc cancels); [ and ] resize 5%, the arrows move 0.25 tile
// along the map axes (Shift: 1 tile; a lot prop stops at its lot's edge), R turns it, Delete removes it, Ctrl+D duplicates it, Esc deselects,
// Ctrl+Z undoes. The panel's picker (a library id, with a thumbnail) arms placing: a ghost of the sprite follows the cursor, a click puts it on
// the lot under it (into that lot's preset) or, off the lots, as a player's prop; Shift+click keeps placing, Esc stops; Insert or A (with the
// mouse over the map) places it at the cursor. A preset prop the lot leaves out (it overlaps another upright, it lies past the lot at this
// size...) stays selected as a dashed ghost with the reason, and the panel lists every prop the selected lot leaves out, to pick one back up.
// Every edit is kept, by scope:
//   a lot prop drawn from a preset: the preset's prop, in the lot's frame (the turn and the fit undone), saved to lot-presets.json and flagged
//     curated: every lot drawn from that preset follows, now and whenever a lot is composed again;
//   'this sprite everywhere' (the panel's toggle): the library sprite's size or removal for the whole game, written to the studio Library tab's
//     scale-overrides.json (read at runtime: the size shows at once) and removed.json (read at the next asset rebuild); a size never grows past
//     the picture's pixels (newart.ts maxDrawScale), here or in a preset or the save, as the studio and the game's own resize refuse it;
//   a player's prop: the prop in the game save, as the game's own tools do.
// The dev server writes the files (vite.config.ts: POST /__dev/save, whitelisted, own pages only; the lot presets merge per preset through
// POST /__dev/presets, so two people's saves do not overwrite each other) and hot-reloads them with no page reload or rebuild.
// The lot lab (src/game/dev/lot-lab.ts) drives the panel through armPlacing and editorAct, saves with saveLotPresets, and draws its palette with thumb.
// MULTI-SELECT (T148): Shift+click adds a preset's sprite or decal to the selection or takes it out; a drag on empty ground draws a box that
// selects every sprite and decal of the lot inside it (the lot lab: a plain drag; elsewhere Shift+drag, a plain drag pans); a click on a decal
// selects it; Esc clears. The edits then apply to the whole selection (lot-select.ts): drag any selected item or the arrows move it as one (the
// lot edge stops it), Delete, R (a decal mirrors), [ ], Ctrl+D (a copy beside it). Ctrl+C copies the selection (its layout relative to its
// middle, sizes, turns, mirrors); Ctrl+V pastes it at the pointer, on this lot or another (the lot lab's next lot: the copy is kept for the
// session), and leaves the paste selected. H changes the selected building (or, in the lab with nothing selected, the lot's main building) for
// the next of its family and size class (lot-houses.ts; Shift+H the one before), on its spot. A group edit is one undo step.
import type { Game } from '../engine';
import type { LibItem, Prop } from '../types';
import { ATLAS_PAGES, ATLAS_SIZE, LIBRARY } from '../library';
import { spriteRect, type Drawable } from '../sprites';
import { worldX, worldY } from '../iso';
import { OWNER_SCALE, TABLE_SCALE } from '../lots/scales';
import { carOwnerScale, carSizeId, foldCarSizes } from '../ext/car-art';
import { lookOf, maxDrawScale } from '../newart';
import { compose, lotPreset, lotPresets, lotPresetsMeta, onLotPresetsReload, setLotPresets, type PresetDrop } from '../lots/compose';
import { formatPresets, type LotPreset, type PresetProp } from '../lots/presets';
import { detach } from '../lots/derive';
import { onStudioScales } from '../lots/scales-live';
import { resetFacings } from '../traffic';
import { toFrame, toWorld, type PresetFrame } from '../lots/preset-frame';
import { footprintOf, ownerScaleOf, sizeKey, sizeViews, turned } from '../lots/preset-art';
import { GARAGE_VIEW_BASE } from '../garage-views';
import { applyEdit, clampToLot, fit1, growWithin, placeInPreset, presetToWorld, removeSprite, replacePreset, scaleOverride, snap, studioJson, worldToPreset, type PresetEdit } from './lot-edit';
import { copySel, count, deleteSel, has, inBox, mainBuilding, moveSel, NONE, pasteClip, scaleSel, selOf, swapHouse, toggle as toggleSel, turnSel, union, within, type Clip, type Kind, type ScreenPt, type Selection } from './lot-select';
import { artLimit, classWords, frameHalf, isHouseLike, nextHouse, type HouseOk } from './lot-houses';

/** an edit's kind, as the keys name it */
type Act = 'bigger' | 'smaller' | 'move' | 'turn' | 'delete' | 'duplicate';
/** the lot lab's actions on the selection (its buttons): the edits, Change house (back), copy, paste, undo */
export type LabAct = 'bigger' | 'smaller' | 'turn' | 'delete' | 'duplicate' | 'undo' | 'house' | 'house-back' | 'copy' | 'paste';
/** where a selected sprite comes from */
type Source =
  | { kind: 'preset'; lot: string; preset: LotPreset; index: number; frame: NonNullable<ReturnType<typeof lotPreset>>['frame'] }
  | { kind: 'lot'; lot: string }
  | { kind: 'player' }
  | { kind: 'auto'; tag: string };
/** a preset prop the lot leaves out, selected: outlined where it would stand (dashed), with why */
interface Ghost { lot: string; preset: string; index: number; why: string }
/** one step back: a preset as it was, a studio file's text as it was, or a player prop's state (or its removal / addition) */
type Undo =
  | { kind: 'preset'; before: LotPreset; lot: string; index: number; sel?: Selection }
  | { kind: 'file'; file: 'scale-overrides.json' | 'removed.json'; text: string; restore?: () => void }
  | { kind: 'player'; prop: Prop; item: number; x: number; y: number; scale: number; flip: boolean }
  | { kind: 'player-del'; prop: Prop; item: number; x: number; y: number; scale: number; flip: boolean }
  | { kind: 'player-add'; prop: Prop };

/** the resize step (a factor) and the move steps (tiles) */
const GROW = 1.05, STEP = 0.25, STEP_BIG = 1;
/** a removal is read when the assets are generated (scales.ts REMOVED_IDS, by prep-scales.mjs); the sizes are read at runtime */
const REMOVED_NOTE = 'the sprite leaves the game at the next asset rebuild (the studio\'s Rebuild), which reads removed.json';
const INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
/** the game's car ids (what foldCarSizes folds into their models' keys) */
const CAR_IDS = LIBRARY.filter(it => it.kind === 'car').map(it => it.id);
/** a vehicle: the composer draws a parked car at the road cars' size whatever its scale */
const isCar = (id: string) => /^cars:/.test(id) || LIBRARY[INDEX.get(id) ?? -1]?.cat === 'Vehicles';
/** the message for a grow the picture's pixels refuse (as the studio refuses it) */
const refused = (id: string, lim: number) => `${id}: as big as its picture allows (drawn x${lim.toFixed(2)}): it pixelates above that`;
/** a sprite as the lots draw it: its library index at a footprint centre (world tiles), scale and flip, with its footprint (what spriteRect
 *  and lookOf read) */
function drawable(id: string, cx: number, cy: number, s: number, flip: boolean): Drawable | null {
  const item = INDEX.get(id); if (item === undefined) return null;
  const fp = footprintOf(id, s, flip), x = cx - (fp[0] + fp[2]) / 2, y = cy - (fp[1] + fp[3]) / 2;
  return { item, x, y, flip, scale: s, x0: x + fp[0], y0: y + fp[1], x1: x + fp[2], y1: y + fp[3] };
}
/** T173: the atlas mip a picture of tex rectangle side (0..1 of a page) is painted from at `shown` css px: mip 2 (a page a quarter of mip 0's, a
 *  sixteenth of its pixels) when the picture is at least that big there (no upscaling: as sharp), else mip 1; the lab palette's 48 px cards then
 *  decode the small mip-2 pages for most of their pages (mip 1 only on the few pages of small props) */
export const picMip = (side: number, shown: number): 1 | 2 => (side * ATLAS_SIZE / 4 >= shown ? 2 : 1);
/** paints a library sprite's atlas picture (its stand-in for an old building, as the game draws it) over an element of w x h px */
function paint(el: HTMLElement, it: LibItem, w: number, h: number) {
  const [page, u0, v0, u1, v1] = it.tex, m = picMip(Math.max(u1 - u0, v1 - v0), Math.max(w, h)), P = ATLAS_SIZE / 2 ** m, kx = w / Math.max(1e-6, (u1 - u0) * P), ky = h / Math.max(1e-6, (v1 - v0) * P);
  Object.assign(el.style, { backgroundImage: `url(${ATLAS_PAGES[page]![m]})`, backgroundSize: `${P * kx}px ${P * ky}px`, backgroundPosition: `${-u0 * P * kx}px ${-v0 * P * ky}px`, backgroundRepeat: 'no-repeat' });
}
/** draws a library sprite's look (the picture the lots draw, lookOf) fitted into size x size css px on el's background (from its top left); clears it
 *  for an unknown id. Returns the picture's size there (css px) */
export function thumb(el: HTMLElement, id: string, size: number): { w: number; h: number } {
  const item = INDEX.get(id); if (item === undefined) { el.style.backgroundImage = ''; return { w: 0, h: 0 }; }
  const look = LIBRARY[lookOf({ item, flip: false, scale: 1, x: 0, y: 0 }).item] ?? LIBRARY[item]!, [, u0, v0, u1, v1] = look.tex, a = (u1 - u0) / Math.max(1e-6, v1 - v0);
  const w = a >= 1 ? size : size * a, h = a >= 1 ? size / a : size;
  paint(el, look, w, h);
  return { w, h };
}

/** a whitelisted file's text: the newest the editor is about to write (behind the write in flight), else the dev server's copy, read once
 *  no write is in flight (so a library edit never starts from a text an earlier save is replacing) */
async function load(file: string): Promise<string> {
  while (writing) await writing.catch(() => undefined);
  const w = waiting.get(file); if (w !== undefined) return w;
  const r = await fetch(`/__dev/load?file=${encodeURIComponent(file)}`);
  if (!r.ok) throw new Error(`load ${file}: ${r.status}`);
  return r.text();
}
/** writes a whitelisted file through the dev server (atomic there); application/json, as the server's origin check wants */
async function post(file: string, json: string): Promise<void> {
  const r = await fetch('/__dev/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file, json }) });
  if (!r.ok) throw new Error(`save ${file}: ${r.status} ${await r.text()}`);
}
/** the newest text waiting to be written, by file, and the write in flight: saves go one at a time, and quick edits coalesce into the newest
 *  text, so the file never ends on an older state than the editor holds */
const waiting = new Map<string, string>();
let writing: Promise<void> | null = null;
async function save(file: string, json: string): Promise<void> {
  waiting.set(file, json);
  while (writing) await writing.catch(() => undefined);
  if (!waiting.has(file)) return;   // a later call wrote this file's newest text already
  const text = waiting.get(file)!; waiting.delete(file);
  writing = post(file, text).finally(() => { writing = null; });
  await writing;
}
/** posts the presets with these ids (as held when the write starts) and the removed ids to /__dev/presets: the dev server merges them into lot-presets.json */
async function postPresets(ids: string[], removed: string[]): Promise<void> {
  const r = await fetch('/__dev/presets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ upsert: lotPresets().filter(p => ids.includes(p.id)), remove: removed }) });
  if (!r.ok) throw new Error(`save lot-presets.json: ${r.status} ${await r.text()}`);
}
/** saves the presets with these ids, and drops the removed ids, in lot-presets.json, one write at a time through the save queue: each preset replaces its
 *  own entry on disk, so a preset someone else saved meanwhile stays as it is */
async function savePresets(ids: string[], removed: string[] = []): Promise<void> {
  while (writing) await writing.catch(() => undefined);
  writing = postPresets(ids, removed).finally(() => { writing = null; });
  await writing;
}
/** saves the lot presets with these ids (the lot lab's Save, Approve and edits: [id]) and drops the removed ids (a removal: [], [id]) in lot-presets.json */
export function saveLotPresets(ids: string[], removed: string[] = []): Promise<void> { return savePresets(ids, removed); }
/** the selection as the lot lab shows it (T155: the floating selection bar and the inspector): a key that changes whenever the selection or its
 *  items change; the count of sprites and decals; the items (a preset's: its prop or decal index, library or decal id, scale, view; a sprite of no
 *  preset: index -1); the lot and preset they belong to; and the box round them on screen (client px; null when none is drawn) */
export interface EditorSel {
  key: string; props: number; decals: number; lot: string | null; preset: string | null;
  items: { kind: 'prop' | 'decal'; index: number; id: string; scale: number; view: number }[];
  box: { x0: number; y0: number; x1: number; y1: number } | null;
}
const NO_SEL: EditorSel = { key: '', props: 0, decals: 0, lot: null, preset: null, items: [], box: null };
/** the open editor's entries for the lot lab (set by installLotEditor, null while no editor is installed): arm a library id, run an action, let go of the selection, the selection now */
let lab: { place: (id: string) => void; edit: (a: LabAct) => void; deselect: () => void; sel: () => EditorSel } | null = null;
/** the selection as the lot lab shows it (EditorSel); nothing while no editor is installed */
export function editorSel(): EditorSel { return lab ? lab.sel() : NO_SEL; }
/** the houses Change house may deal (T155: the lot lab's allocations for its road and state) and their words for the messages ('road 3, built');
 *  null: every one (the in-game editor) */
let houseOk: { ok: HouseOk; words: string } | null = null;
/** sets the houses Change house may deal (the lot lab, after its road or state changed), or null for every one */
export function setHouseFilter(ok: HouseOk | null, words = ''): void { houseOk = ok ? { ok, words } : null; }
/** the lot the editor may select and edit on (the lot lab: 'lab', so the neighbours shown round it are never edited, and a plain drag on empty
 *  ground draws the selection box); null: any lot */
let only: string | null = null;
/** keeps the editor to one lot (the lot lab: 'lab'), or null for any; the selection is let go */
export function editorOnly(lot: string | null): void { only = lot; lab?.deselect(); }
/** lets go of the editor's selection (the lot lab after it composes another lot: the old selection's preset is gone) */
export function editorDeselect(): void { lab?.deselect(); }
/** the session store's key of the copied items (Ctrl+C): a paste reaches another lot and survives a reload of the page */
const CLIP_KEY = 'ce-lotlab-clip';
/** the copied items (Ctrl+C), or null; read once from the session store */
let clip: Clip | null = (() => { try { const c: unknown = JSON.parse(sessionStorage.getItem(CLIP_KEY) ?? 'null'); return c && typeof c === 'object' && Array.isArray((c as Clip).props) && Array.isArray((c as Clip).decals) ? c as Clip : null; } catch { return null; } })();
/** the copied items kept in the session store (a blocked store only loses them at a reload) */
function keepClip(c: Clip) { clip = c; try { sessionStorage.setItem(CLIP_KEY, JSON.stringify(c)); } catch { /* kept in memory only */ } }
/** what the editor's panel says now: the selection's line and the last message (the lot lab shows them in its own panel) */
const text = { info: '', msg: '' };
/** the editor panel's words now (the selection, the last message): the lot lab's panel shows them while it hides the editor's */
export function editorText(): { info: string; msg: string } { return { ...text }; }
/** arms placing the library sprite id (the editor turned on): the lot lab's palette; false when the editor is not installed */
export function armPlacing(id: string): boolean { if (!lab) return false; lab.place(id); return true; }
/** one editor action on the selection, as its key would do it: the lot lab's buttons; false when the editor is not installed */
export function editorAct(a: LabAct): boolean { if (!lab) return false; lab.edit(a); return true; }
/** whether the editor's pointer handling is paused (the lot lab's ground painting) */
let paused = false;
/** pauses the editor's pointer handling (the lot lab's ground painting): its presses go to the lab */
export function pauseEditor(v: boolean): void { paused = v; }
/** whether the editor's keys are muted (T158: the lot wizard owns the keys and never lets an edit save its lot) */
let muted = false;
/** mutes the editor's keys (the lot wizard), or lets them work again */
export function muteEditor(v: boolean): void { muted = v; }

/** installs the editor on a game and its overlay canvas (off until ?dev or the I key); returns the uninstall */
export function installLotEditor(game: Game, canvas: HTMLCanvasElement): () => void {
  let on = false, sel: Prop | null = null, ghost: Ghost | null = null, everywhere = false, message = '';
  /** the cursor over the map (overlay px) and whether it is there now; the sprite being placed (a library id) */
  let cursor: { mx: number; my: number } | null = null, overMap = false, placing: string | null = null;
  /** a press on a sprite or a decal (its prop, null for a decal; the overlay px and the tile under it), the snapped tile delta since, whether it
   *  moved past 4 px (a drag), and whether it moves the multi-selection (group: the press was on one of its items, or on a decal); one: the
   *  item pressed, which alone stays selected when a press on a selected group item does not move */
  let drag: { p: Prop | null; mx: number; my: number; t: { x: number; y: number }; dx: number; dy: number; moved: boolean; group: boolean; one: { kind: Kind; i: number } | null } | null = null;
  /** the multi-selection (T148): one lot's preset props and decals by index there; a single preset sprite selected is a group of one. null:
   *  nothing, or a selection that is no preset's (a player's prop, a procedural piece: sel alone) */
  let group: { lot: string; preset: string; sel: Selection } | null = null;
  /** the selection box being drawn on empty ground: its corners (overlay px) and whether it adds to the selection (Shift) */
  let box: { x0: number; y0: number; x1: number; y1: number; add: boolean } | null = null;
  /** the props the selected lot leaves out (compose's drops), for the panel's list */
  let drops: PresetDrop[] = [], dropsLot: string | null = null;
  const undo: Undo[] = [];
  /** a player prop removed and put back by an undo is a new Prop: the old one maps to it, so the steps before still find it */
  const alias = new Map<Prop, Prop>();
  const live = (p: Prop): Prop | null => { let q: Prop | undefined = p; for (let k = 0; q && k < 64 && !game.props.has(q); k++) q = alias.get(q); return q && game.props.has(q) ? q : null; };

  // ---------- the outlines, the placing ghost and the panel (plain DOM, over the game)
  const outline = document.createElement('div');
  outline.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #38bdf8;box-shadow:0 0 0 1px #0c4a6e,0 0 12px #38bdf8;border-radius:3px;z-index:60;display:none';
  const lost = document.createElement('div');
  lost.style.cssText = 'position:fixed;pointer-events:none;border:2px dashed #f97316;background:rgba(249,115,22,.12);border-radius:3px;z-index:60;display:none';
  const ghostEl = document.createElement('div');
  ghostEl.style.cssText = 'position:fixed;pointer-events:none;opacity:.6;outline:1px dashed #38bdf8;z-index:59;display:none';
  // the multi-selection's outlines (one per selected sprite) and rings (one per selected decal), made as needed and reused; the selection box
  const boxEl = document.createElement('div');
  boxEl.style.cssText = 'position:fixed;pointer-events:none;border:1px dashed #fcd34d;background:rgba(252,211,77,.10);z-index:60;display:none';
  const outlines: HTMLDivElement[] = [], rings: HTMLDivElement[] = [];
  /** the n-th reused element of a pool (made with css when there are fewer) */
  const pooled = (pool: HTMLDivElement[], n: number, css: string) => { let d = pool[n]; if (!d) { d = document.createElement('div'); d.style.cssText = css; document.body.append(d); pool.push(d); } return d; };
  const OUTLINE_CSS = 'position:fixed;pointer-events:none;border:2px solid #38bdf8;box-shadow:0 0 0 1px #0c4a6e;border-radius:3px;z-index:60;display:none';
  const RING_CSS = 'position:fixed;pointer-events:none;width:20px;height:20px;margin:-12px 0 0 -12px;border:2px solid #fcd34d;border-radius:50%;z-index:60;display:none';
  const panel = document.createElement('div');
  panel.id = 'ce-dev-editor-panel';   // the lot lab hides it (its own panel has the tools) and shows editorText() instead
  panel.style.cssText = 'position:fixed;right:12px;bottom:12px;width:340px;max-width:calc(100vw - 24px);max-height:70vh;overflow:auto;z-index:61;display:none;background:rgba(12,18,28,.94);color:#e2e8f0;border:1px solid #38bdf8;border-radius:10px;padding:10px 12px;font:12px/1.45 ui-monospace,Consolas,monospace;box-shadow:0 6px 24px rgba(0,0,0,.5)';
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b style="color:#7dd3fc">DEV LOT EDITOR</b><span style="opacity:.7">I closes</span></div>
    <div data-k="info" style="white-space:pre-wrap;word-break:break-all;min-height:3.2em"></div>
    <label style="display:flex;gap:6px;align-items:center;margin:6px 0;cursor:pointer"><input data-k="every" type="checkbox"> this sprite everywhere (size, remove)</label>
    <div style="display:flex;gap:6px;margin:6px 0;align-items:center"><div data-k="thumb" style="width:36px;height:36px;flex:none;border:1px solid #334155;border-radius:5px;background-color:#0f172a"></div><input data-k="pick" list="ce-dev-lib" placeholder="library id or name" style="flex:1;min-width:0;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:5px;padding:3px 6px"><button data-k="add" style="background:#0369a1;color:#fff;border-radius:5px;padding:2px 8px">Place</button></div>
    <datalist id="ce-dev-lib"></datalist>
    <div style="opacity:.75">[ ] size 5% · arrows move ¼ tile (Shift 1) · drag a sprite to move it · Shift+click adds or removes · Shift+drag on the ground: box select · R turn · H change house (Shift+H back) · Del delete · Ctrl+D duplicate · Ctrl+C copy · Ctrl+V paste at the pointer · Place / Enter: click to put (Shift+click: more, Esc stops) · Insert or A: at the cursor · Esc deselect · Ctrl+Z undo</div>
    <div data-k="drops" style="margin-top:6px"></div>
    <div data-k="msg" style="margin-top:6px;color:#fcd34d;white-space:pre-wrap"></div>`;
  const $ = <T extends HTMLElement>(k: string) => panel.querySelector(`[data-k="${k}"]`) as T;
  const list = panel.querySelector('datalist')!;
  for (const it of LIBRARY) if ((!it.id.startsWith('view:') || GARAGE_VIEW_BASE.has(it.id)) && !it.id.startsWith('east:') && it.kind !== 'walker') { const o = document.createElement('option'); o.value = it.id; o.label = it.name; list.appendChild(o); }
  document.body.append(outline, lost, ghostEl, boxEl, panel);
  const pick = $<HTMLInputElement>('pick');
  /** the picker's library id: the id typed, or the one whose name was typed */
  const pickedId = () => { const v = pick.value.trim(); return INDEX.has(v) ? v : LIBRARY.find(i => i.name.toLowerCase() === v.toLowerCase())?.id ?? null; };
  const showThumb = () => thumb($('thumb'), pickedId() ?? '', 36);
  pick.addEventListener('input', showThumb);
  pick.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); arm(); } else if (e.key === 'Escape') { e.preventDefault(); disarm(); } e.stopPropagation(); });
  $<HTMLInputElement>('every').addEventListener('change', e => { everywhere = (e.target as HTMLInputElement).checked; (e.target as HTMLInputElement).blur(); render(); });
  $<HTMLButtonElement>('add').addEventListener('click', () => arm());

  // ---------- where a selection comes from
  /** where a prop comes from: a lot's preset prop (Game.lotFrom), a lot's procedural piece, a player's prop, or an auto prop */
  function sourceOf(p: Prop): Source {
    if (!p.auto) return { kind: 'player' };
    if (!p.auto.startsWith('lot:')) return { kind: 'auto', tag: p.auto };
    const lot = p.auto.slice(4), from = game.lotFrom.get(p);
    return (from && presetSource(lot, from.preset, from.prop)) || { kind: 'lot', lot };
  }
  /** a lot's preset prop as a source, while the lot still draws that preset and the prop is there */
  function presetSource(lot: string, preset: string, index: number): Extract<Source, { kind: 'preset' }> | null {
    const at = game.lotOf(lot), lp = at ? lotPreset(at.g, at.st) : null;
    return lp && lp.preset.id === preset && lp.preset.props[index] ? { kind: 'preset', lot, preset: lp.preset, index, frame: lp.frame } : null;
  }
  /** the selection's source: the drawn prop's, or the ghost's preset prop */
  const selSource = (): Source | null => (sel ? sourceOf(sel) : ghost ? presetSource(ghost.lot, ghost.preset, ghost.index) : null);
  /** the lot the selection is on (for the panel's list of left-out props) */
  const selLot = () => (sel?.auto?.startsWith('lot:') ? sel.auto.slice(4) : ghost?.lot ?? group?.lot ?? null);
  /** a drawn sprite's preset prop: its lot, preset id and index there; null for a sprite drawn from no preset */
  function presetRef(p: Prop): { lot: string; preset: string; i: number } | null { const s = sourceOf(p); return s.kind === 'preset' ? { lot: s.lot, preset: s.preset.id, i: s.index } : null; }
  /** whether the selection is a multi-selection (more than one item, or a decal): the edits then go through lot-select.ts as one */
  const multi = () => !!group && (count(group.sel) > 1 || group.sel.decals.length > 0);
  /** the group's preset as its lot draws it now: the lot, the preset, the lot's frame and the selection (kept to the preset's items); null when
   *  the lot draws another preset now (it was composed again with another one) */
  function groupSrc(): { lot: string; preset: LotPreset; frame: PresetFrame; sel: Selection } | null {
    const g = group; if (!g) return null;
    const at = game.lotOf(g.lot), lp = at ? lotPreset(at.g, at.st) : null;
    return lp && lp.preset.id === g.preset ? { lot: g.lot, preset: lp.preset, frame: lp.frame, sel: within(g.sel, lp.preset) } : null;
  }
  /** the sprite drawn now from a lot's preset prop (the Prop objects are new after a compose), or null */
  const propOf = (lot: string, preset: string, i: number): Prop | null => game.propsOfLot(lot).find(p => { const f = game.lotFrom.get(p); return !!f && f.preset === preset && f.prop === i; }) ?? null;
  /** the ghost as the lots would draw it (its preset prop fitted, turned, at its scale) */
  function ghostDrawable(): Drawable | null {
    const s = ghost ? presetSource(ghost.lot, ghost.preset, ghost.index) : null; if (!s) return null;
    const q = s.preset.props[s.index]!, t = turned(q.id, s.frame.q + q.view), c = presetToWorld(s.frame, s.preset, q.x, q.y);
    return drawable(t.id, c.x, c.y, q.scale * ownerScaleOf(q.id), t.flip);
  }
  /** the props a lot leaves out now, with why (compose's drops) */
  function refreshDrops(lot: string | null) {
    dropsLot = lot; drops = [];
    const at = lot ? game.lotOf(lot) : null;
    if (at) compose(at.g, at.st, drops);
  }

  function render() {
    panel.style.display = on ? 'block' : 'none';
    // off, the words are cleared: the lot lab shows them (editorText), and a selection left from before would show there
    if (!on) { text.info = text.msg = ''; outline.style.display = lost.style.display = ghostEl.style.display = 'none'; return; }
    let info = 'Click a sprite to select it.';
    const s = selSource(), gs = multi() ? groupSrc() : null;
    if (gs) {
      // the multi-selection: how many, of what, on which preset; the decal's own words when it is one decal alone
      const np = gs.sel.props.length, nd = gs.sel.decals.length, c = nd === 1 && !np ? gs.preset.decals?.[gs.sel.decals[0]!] : undefined;
      info = c ? `decal ${c.id}\nlot ${gs.lot}\npreset ${gs.preset.id}, decal ${gs.sel.decals[0]}\nscale ${Math.abs(c.scale)}${c.scale < 0 ? ' · mirrored' : ''} · drag moves · Del · [ ] · R mirrors`
        : `${np + nd} selected: ${np} sprite${np === 1 ? '' : 's'}, ${nd} decal${nd === 1 ? '' : 's'}\nlot ${gs.lot}\npreset ${gs.preset.id}\ndrag any of them or the arrows move them as one · Del · R · [ ] · H · Ctrl+C`;
    } else if (sel) {
      const it = LIBRARY[sel.item]!;
      const src = s?.kind === 'preset' ? `lot ${s.lot}\npreset ${s.preset.id}${s.preset.curated ? ' (curated)' : ''}, prop ${s.index}`
        : s?.kind === 'lot' ? `lot ${s.lot}: procedural (fence, street item, planting): not a preset's` : s?.kind === 'player' ? 'a player-placed prop (the save)' : `an auto prop (${s && s.kind === 'auto' ? s.tag : ''})`;
      const q = s?.kind === 'preset' ? s.preset.props[s.index]! : null;
      info = `${it.id}\n${src}\nscale ${sel.scale.toFixed(3)}${q ? ` (preset ${q.scale} x owner ${ownerScaleOf(q.id)})` : ''} · view ${q ? q.view : '-'}${sel.flip ? ' · flipped' : ''}`;
    } else if (ghost) {
      const q = s?.kind === 'preset' ? s.preset.props[s.index] : undefined;
      info = q ? `${q.id}\nlot ${ghost.lot}\npreset ${ghost.preset}, prop ${ghost.index}\nLEFT OUT: ${ghost.why} (dashed). Move it (arrows), turn or resize it to bring it back, or Ctrl+Z` : `lot ${ghost.lot}: that preset prop is gone`;
    }
    $('info').textContent = text.info = info;
    const box = $('drops');
    box.innerHTML = '';
    const lot = selLot();
    if (lot && lot === dropsLot && drops.length) {
      const h = document.createElement('div'); h.textContent = `props this lot leaves out (${drops.length}):`; h.style.color = '#fdba74'; box.appendChild(h);
      for (const d of drops) {
        const b = document.createElement('button');
        b.textContent = `${d.id.replace(/^variation:/, 'v:')}: ${d.why}`;
        b.style.cssText = `display:block;width:100%;text-align:left;margin-top:2px;padding:1px 4px;border-radius:4px;background:${ghost && ghost.preset === d.preset && ghost.index === d.prop ? '#7c2d12' : '#1e293b'};color:#fde68a;font:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap`;
        b.addEventListener('click', () => { sel = null; group = { lot, preset: d.preset, sel: selOf([d.prop]) }; ghost = { lot, preset: d.preset, index: d.prop, why: d.why }; render(); });
        box.appendChild(b);
      }
    }
    $('msg').textContent = text.msg = (placing ? `placing ${placing}: click the map (Shift+click: more, Esc stops)\n` : '') + message;
  }
  const say = (m: string) => { message = m; render(); };
  /** selects one sprite alone (a preset's: a group of one), or nothing */
  function select(p: Prop | null) { sel = p; ghost = null; const r = p ? presetRef(p) : null; group = r ? { lot: r.lot, preset: r.preset, sel: selOf([r.i]) } : null; refreshDrops(selLot()); render(); }
  /** selects a group of a lot's preset items (none: nothing): the last selected sprite drawn now is the one the panel names (sel) */
  function setGroup(lot: string, preset: string, s: Selection) {
    refreshDrops(lot); ghost = null;
    group = count(s) ? { lot, preset, sel: s } : null;
    sel = group && s.props.length ? propOf(lot, preset, s.props[s.props.length - 1]!) : null;
    render();
  }
  /** after the lots were composed again: the prop now drawn from the preset prop (the old Prop objects are gone), else that preset prop as a
   *  ghost with the reason the lot leaves it out */
  function reselect(lot: string, preset: string, index: number) {
    refreshDrops(lot);
    sel = index < 0 ? null : propOf(lot, preset, index);
    ghost = sel || index < 0 ? null : { lot, preset, index, why: drops.find(d => d.preset === preset && d.prop === index)?.why ?? 'not drawn on this lot' };
    group = index < 0 ? null : { lot, preset, sel: selOf([index]) };
    render();
  }
  /** composes every lot again (a library size changed), the selected lot's at once, and keeps the selection on its preset prop (a
   *  multi-selection on its items) */
  function recomposeKeeping() {
    const g = multi() ? group : null, lot = selLot(), from = sel ? game.lotFrom.get(sel) : ghost ? { preset: ghost.preset, prop: ghost.index } : undefined;
    game.recomposeLots(lot ? [lot] : []);
    if (g) setGroup(g.lot, g.preset, g.sel);
    else if (lot && from) reselect(lot, from.preset, from.prop); else if (sel && !game.props.has(sel)) select(null); else render();
  }
  /** the selection's footprint half extents (world tiles): the drawn prop's, or the ghost's */
  function half(): { hx: number; hy: number } {
    const d: Drawable | null = sel ?? ghostDrawable();
    return d ? { hx: (d.x1 - d.x0) / 2, hy: (d.y1 - d.y0) / 2 } : { hx: 0.25, hy: 0.25 };
  }

  // ---------- the edits
  async function commitPreset(lot: string, before: LotPreset, after0: LotPreset, index: number, what: string, undoIndex: number | null = index, note = '') {
    // a hand edit detaches a derived preset from its master (T155: lots/derive.ts); an undo puts back what was
    const after = undoIndex !== null ? detach(after0) : after0;
    if (undoIndex !== null) undo.push({ kind: 'preset', before, lot, index: undoIndex });
    setLotPresets(replacePreset(lotPresets(), after));
    // this lot at once, then only the other lots drawn from the same preset (not the whole town's ground on every key repeat)
    game.recomposeLots([lot], after.id);
    reselect(lot, after.id, index);
    try { await savePresets([after.id]); say(`${what}: ${after.id} saved to lot-presets.json${after.curated ? ' (curated)' : ''}; every lot drawn from it follows${note}${ghost ? `. This lot leaves it out: ${ghost.why}` : ''}`); }
    catch (e) { say(`NOT SAVED: ${String(e)}`); }
  }
  /** a multi-selection's edit made (one undo step, the selection before kept with it): the preset replaced, its lot composed at once and the
   *  others drawn from it queued, the selection s on the new preset, the preset saved */
  async function commitGroup(lot: string, before: LotPreset, after0: LotPreset, s: Selection, what: string, pushUndo = true) {
    const after = pushUndo ? detach(after0) : after0;
    if (pushUndo) undo.push({ kind: 'preset', before, lot, index: -1, sel: group && group.preset === before.id ? group.sel : NONE });
    setLotPresets(replacePreset(lotPresets(), after));
    game.recomposeLots([lot], after.id);
    setGroup(lot, after.id, s);
    try { await savePresets([after.id]); say(`${what}: ${after.id} saved to lot-presets.json (curated); every lot drawn from it follows`); }
    catch (e) { say(`NOT SAVED: ${String(e)}`); }
  }
  /** k things as words ("1 item", "3 items") */
  const many = (k: number, w = 'item') => `${k} ${w}${k === 1 ? '' : 's'}`;
  /** whether a preset prop's picture shows another view a quarter on (a turn the picture cannot show changes nothing, so it is left) */
  const turnable = (f: PresetFrame) => (q: PresetProp) => { const k = f.q + q.view, a = turned(q.id, k), b = turned(q.id, k + 1); return a.id !== b.id || a.flip !== b.flip; };
  /** the largest preset scale a prop's picture allows (its art limit over its owner scale) */
  const scaleLimit = (q: PresetProp) => artLimit(q.id) / ownerScaleOf(q.id);
  /** an edit of the multi-selection, as one (lot-select.ts): a move by (dx, dy) world tiles (along the lot's frame; the lot edge stops the whole
   *  selection), delete, turn (a decal mirrors), bigger or smaller (each item in place), duplicate (a copy one selection-width along the street,
   *  the copy selected) */
  async function groupAct(a: Act, dx = 0, dy = 0) {
    const g = groupSrc();
    if (!g || !count(g.sel)) { select(null); return say('the selection is gone (the lot draws another preset now)'); }
    const { lot, preset: p, frame: f, sel: s } = g, half = frameHalf(f), n = count(s);
    if (a === 'move') {
      const r = moveSel(p, s, dx * f.u.x + dy * f.u.y, dx * f.n.x + dy * f.n.y, half);
      if (Math.abs(r.dx) < 1e-9 && Math.abs(r.dy) < 1e-9) return say('the lot edge stops the selection there');
      return commitGroup(lot, p, r.preset, s, `moved ${many(n)}${r.clamped ? ' (to the lot edge)' : ''}`);
    }
    if (a === 'delete') return commitGroup(lot, p, deleteSel(p, s), NONE, `deleted ${many(n)}`);
    if (a === 'turn') {
      const r = turnSel(p, s, turnable(f));
      if (!r.turned && !r.mirrored) return say('none of the selected sprites has another view');
      return commitGroup(lot, p, r.preset, s, `turned ${many(r.turned, 'sprite')}${r.mirrored ? `, mirrored ${many(r.mirrored, 'decal')}` : ''}`);
    }
    if (a === 'bigger' || a === 'smaller') {
      const r = scaleSel(p, s, a === 'bigger' ? GROW : 1 / GROW, scaleLimit);
      if (!r.changed) return say('every selected sprite is as big as its picture allows: it pixelates above that');
      return commitGroup(lot, p, r.preset, s, `${a} ${many(r.changed)}${r.refused ? ` (${r.refused} at their picture's limit)` : ''}`);
    }
    if (a === 'duplicate') {
      const c = copySel(p, s); if (!c) return;
      // one selection-width along the street (the footprints' extent, a quarter tile apart), the copy kept in the lot
      let x0 = Infinity, x1 = -Infinity;
      for (const i of s.props) { const q = p.props[i]!, h = half(q); x0 = Math.min(x0, q.x - h.ha); x1 = Math.max(x1, q.x + h.ha); }
      for (const i of s.decals) { const q = p.decals![i]!; x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); }
      const pts = [...s.props.map(i => p.props[i]!), ...s.decals.map(i => p.decals![i]!)], cx = (Math.min(...pts.map(q => q.x)) + Math.max(...pts.map(q => q.x))) / 2, cy = (Math.min(...pts.map(q => q.y)) + Math.max(...pts.map(q => q.y))) / 2;
      const r = pasteClip(p, c, cx + (x1 - x0) + 0.25, cy, half);
      return commitGroup(lot, p, r.preset, r.sel, `duplicated ${many(n)}${r.clamped ? ' (kept in the lot)' : ''}`);
    }
  }
  /** Ctrl+C: the selection (a preset's sprites and decals) copied, kept for the session; false when nothing of a preset is selected */
  function copy(): boolean {
    const g = groupSrc(), c = g ? copySel(g.preset, g.sel) : null;
    if (!c) return false;
    keepClip(c); say(`copied ${many(c.props.length + c.decals.length)}: Ctrl+V pastes them at the pointer, on this lot or another`);
    return true;
  }
  /** Ctrl+V: the copied items pasted with their middle at the pointer's last point on the map (the lot under it, or the lot the editor is kept to;
   *  off the lot they land at its nearest edge), into that lot's preset, as one; the paste stays selected */
  async function paste(): Promise<void> {
    if (!clip) return say('nothing copied yet: select, then Ctrl+C');
    const t = cursor ? game.tileAt(cursor.mx, cursor.my) : null, lot = only ?? (t ? game.lotKeyAt(t.x, t.y) : null) ?? group?.lot ?? null;
    const at = lot ? game.lotOf(lot) : null, lp = at ? lotPreset(at.g, at.st) : null;
    if (!lot || !lp) return say('paste: point at a lot drawn from a preset');
    const q = t ? worldToPreset(lp.frame, lp.preset, t.x, t.y) : { x: lp.preset.w / 2, y: lp.preset.d / 2 };
    const r = pasteClip(lp.preset, clip, q.x, q.y, frameHalf(lp.frame));
    await commitGroup(lot, lp.preset, r.preset, r.sel, `pasted ${many(count(r.sel))}${r.clamped ? ' (kept in the lot)' : ''}`);
  }
  /** H (dir 1) or Shift+H (dir -1): the selected building (the panel's sprite when it is one, else the selection's first building; with nothing
   *  selected, the lot the editor is kept to: its main building) changed for the next of its family and size class (lot-houses.ts), on its spot,
   *  its turn and scale kept (never past the new picture's limit); never the same one. False when there is nothing to change (the key is left to
   *  the game then) */
  async function changeHouse(dir: 1 | -1): Promise<boolean> {
    const g = groupSrc();
    let lot: string, p: LotPreset, f: PresetFrame, i = -1, keep: Selection;
    if (g && g.sel.props.length) {
      ({ lot, preset: p, frame: f } = g); keep = g.sel;
      const r = sel ? presetRef(sel) : null, order = r && r.preset === p.id ? [r.i, ...g.sel.props] : g.sel.props;
      i = order.find(k => isHouseLike(p.props[k]?.id ?? '')) ?? -1;
      if (i < 0) { say('Change house: the selection has no house or building'); return true; }
    } else if (!sel && !ghost && only) {
      const at = game.lotOf(only), lp = at ? lotPreset(at.g, at.st) : null;
      if (!lp) { say('Change house: the lot draws no preset'); return true; }
      lot = only; p = lp.preset; f = lp.frame; i = mainBuilding(p, q => isHouseLike(q.id), frameHalf(f)); keep = i >= 0 ? selOf([i]) : NONE;
      if (i < 0) { say('Change house: this lot has no house or building'); return true; }
    } else { if (sel || ghost) say('Change house: select a house or a building of a lot preset'); return !!(sel || ghost); }
    const q = p.props[i]!, next = nextHouse(q.id, dir, houseOk?.ok);
    if (!next) { say(`${q.id}: no other ${classWords(q.id)} to change to${houseOk ? ` that suits ${houseOk.words} (the house allocations)` : ''}`); return true; }
    const half = frameHalf(f), maxS = scaleLimit({ ...q, id: next }), after = half({ ...q, id: next, scale: Math.min(q.scale, maxS) });
    const np = swapHouse(p, i, next, half(q), after, maxS);
    if (np) await commitGroup(lot, p, np, keep, `${dir > 0 ? 'changed' : 'changed back'} ${q.id} to ${next} (${classWords(next)})`);
    return true;
  }
  async function presetEdit(s: Extract<Source, { kind: 'preset' }>, a: Act, dx: number, dy: number) {
    const q = s.preset.props[s.index]!, here = presetToWorld(s.frame, s.preset, q.x, q.y);
    let e: PresetEdit, note = '';
    if (a === 'bigger' || a === 'smaller') {
      // the drawn size (the preset's scale x the owner scale, a car's its owner size) never past the picture's pixels in any of its views
      const own = ownerScaleOf(q.id), lim = artLimit(q.id), next = growWithin(q.scale * own, a === 'bigger' ? GROW : 1 / GROW, lim);
      if (next === null) return say(refused(q.id, lim));
      e = { op: 'scale', prop: s.index, factor: next / (q.scale * own) };
    } else if (a === 'turn') {
      // a turn the picture cannot show (no four views, no other facing) is refused, not saved as a change nobody sees
      const k = s.frame.q + q.view, now = turned(q.id, k), next = turned(q.id, k + 1);
      if (now.id === next.id && now.flip === next.flip) return say(`${q.id} has no other view: turning it would change nothing`);
      e = { op: 'turn', prop: s.index, by: 1 };
    } else if (a === 'delete') e = { op: 'delete', prop: s.index };
    else {
      // a move or a copy keeps the footprint inside the lot (it never walks off the lot and out of reach); the copy one footprint along x
      const { hx, hy } = half(), to = a === 'duplicate' ? { x: here.x + 2 * hx + 0.25, y: here.y } : { x: here.x + dx, y: here.y + dy };
      const c = clampToLot(s.frame, to.x, to.y, hx, hy), n = worldToPreset(s.frame, s.preset, c.x, c.y, q);
      if (c.clamped) note = ' (at the lot edge)';
      e = a === 'duplicate' ? { op: 'duplicate', prop: s.index, dx: n.x - q.x, dy: n.y - q.y } : { op: 'move', prop: s.index, x: n.x, y: n.y };
    }
    const r = applyEdit(s.preset, e);
    if (r) await commitPreset(s.lot, s.preset, r.preset, r.prop, a, s.index, note);
  }
  async function libraryEdit(item: number, a: Act) {
    const it = LIBRARY[item]!, car = isCar(it.id), id = car ? carSizeId(it.id) : sizeKey(it.id);
    if (a === 'bigger' || a === 'smaller') {
      // the studio's rule (server.mjs /api/scale): its size, else the table's (a car's: 1, the size of its model), times the step; never past the pixels of any of its views
      // a car's size is its model's (carOwnerScale: a size the studio kept under one of its pictures' own keys before T143 counts, the largest), and the
      // save folds those keys into the model's (foldCarSizes), as the studio's save does
      const text = await load('scale-overrides.json'), sizes = JSON.parse(text) as Record<string, number>, base = car ? 1 : TABLE_SCALE[id] ?? OWNER_SCALE[id] ?? 1, cur = car ? carOwnerScale(it.id, sizes) : sizes[id] ?? base;
      const lim = artLimit(car ? it.id : id), next = growWithin(cur, a === 'bigger' ? GROW : 1 / GROW, lim);
      if (next === null) return say(refused(id, lim));
      const out = car ? { ...foldCarSizes(sizes, CAR_IDS), [id]: +next.toFixed(3) } : scaleOverride(sizes, id, base, next / cur), views = sizeViews(id), before = views.map(v => [v, OWNER_SCALE[v]] as const);
      await save('scale-overrides.json', studioJson(out));
      // a car's size is read from the studio file when the game loads (ext/car-art carOwnerScale), so it shows after a reload
      if (car) { undo.push({ kind: 'file', file: 'scale-overrides.json', text }); return say(`${id}: size ${out[id]} saved to scale-overrides.json; every car of this model is drawn at that size after a reload of the game`); }
      // scales.ts reads the studio sizes at runtime: the lots take the new size now (the dev server may reload the page to apply it everywhere)
      const apply = (s: (v: string) => number | undefined) => { for (const v of views) { const k = s(v); if (k === undefined) delete OWNER_SCALE[v]; else OWNER_SCALE[v] = k; } recomposeKeeping(); };
      apply(() => out[id]);
      undo.push({ kind: 'file', file: 'scale-overrides.json', text, restore: () => apply(v => before.find(b => b[0] === v)?.[1]) });
      say(`${id}: size ${out[id]} saved to scale-overrides.json; the game draws it at that size now`);
    } else if (a === 'delete') {
      const text = await load('removed.json'), base = LIBRARY[INDEX.get(id) ?? item]!;
      await save('removed.json', studioJson(removeSprite(JSON.parse(text) as Record<string, unknown>, id, base, new Date().toISOString()))); undo.push({ kind: 'file', file: 'removed.json', text });
      say(`${id}: removed in removed.json; ${REMOVED_NOTE}`);
    } else say('this sprite everywhere: only its size ([ ]) and removal (Delete) apply');
  }
  function playerEdit(p: Prop, a: Act, dx: number, dy: number) {
    if (a === 'delete') { undo.push({ kind: 'player-del', prop: p, item: p.item, x: p.x, y: p.y, scale: p.scale, flip: p.flip }); game.removeProp(p); game.scheduleSave(); select(null); say('removed (the save)'); game.emit(); return; }
    if (a === 'duplicate') { const c = game.addProp(p.item, p.x + (p.x1 - p.x0) + 0.25, p.y, p.flip, p.scale); undo.push({ kind: 'player-add', prop: c }); game.scheduleSave(); select(c); say('duplicated, one footprint along x (the save)'); game.emit(); return; }
    undo.push({ kind: 'player', prop: p, item: p.item, x: p.x, y: p.y, scale: p.scale, flip: p.flip });
    if (a === 'bigger' || a === 'smaller') {
      // as the game's own resize (engine scaleSelected): never past the picture's pixels
      const lim = Math.min(4, maxDrawScale(p.item)), next = growWithin(p.scale, a === 'bigger' ? GROW : 1 / GROW, lim);
      if (next === null) { undo.pop(); say(refused(LIBRARY[p.item]!.id, lim)); return; }
      p.scale = Math.max(0.2, next);
    }
    else if (a === 'move') { p.x += dx; p.y += dy; }
    else { const t = turned(LIBRARY[p.item]!.id, 1), i = INDEX.get(t.id); if (i !== undefined && i !== p.item) p.item = i; else if (t.flip) p.flip = !p.flip; else { undo.pop(); say('this sprite has no other view'); return; } }
    game.devPropChanged(p); say(`${a} (the save)`);
  }
  async function act(a: Act, dx = 0, dy = 0) {
    // a multi-selection (more than one item, or a decal) is edited as one, unless the edit is "this sprite everywhere" (the library's)
    if (multi() && !everywhere) { try { await groupAct(a, dx, dy); } catch (e) { say(`failed: ${String(e)}`); } return; }
    const s = selSource();
    if (!s) return;
    try {
      if (everywhere) {
        const item = sel ? sel.item : s.kind === 'preset' ? INDEX.get(s.preset.props[s.index]!.id) : undefined;
        return item === undefined ? undefined : await libraryEdit(item, a);
      }
      if (s.kind === 'preset') return await presetEdit(s, a, dx, dy);
      if (s.kind === 'player' && sel) return playerEdit(sel, a, dx, dy);
      say(s.kind === 'lot' ? 'a procedural lot piece: not one lot\'s to tune (tick "this sprite everywhere" for its size)' : 'an auto prop: tick "this sprite everywhere" for its size');
    } catch (e) { say(`failed: ${String(e)}`); }
  }

  // ---------- placing a library sprite
  /** the sprite placed at a map point (overlay px), snapped to the move grid: into the preset of the lot under it (the footprint inside the
   *  lot), else as a player's prop */
  async function placeAt(id: string, mx: number, my: number) {
    const item = INDEX.get(id); if (item === undefined) return say(`not a library id: ${id}`);
    const t = game.tileAt(mx, my), x = snap(t.x), y = snap(t.y), lot = game.lotKeyAt(x, y), at = lot ? game.lotOf(lot) : null, lp = at ? lotPreset(at.g, at.st) : null;
    // a lot the editor is not kept to (the lot lab's neighbours) takes nothing: its preset is another lot's
    if (lot && only !== null && lot !== only) return say('place it on the lot: the neighbours are shown for context only');
    if (lot && lp) {
      const v = turned(id, lp.frame.q), fp = footprintOf(v.id, ownerScaleOf(id), v.flip), n = placeInPreset(lp.frame, lp.preset, x, y, (fp[2] - fp[0]) / 2, (fp[3] - fp[1]) / 2);
      const r = applyEdit(lp.preset, { op: 'add', id, x: n.x, y: n.y });
      if (r) await commitPreset(lot, lp.preset, r.preset, r.prop, `added ${id}`, -1, n.clamped ? ' (at the lot edge)' : '');
      return;
    }
    const s = ownerScaleOf(id), fp = footprintOf(id, s, false), p = game.addProp(item, x - (fp[0] + fp[2]) / 2, y - (fp[1] + fp[3]) / 2, false, s);
    undo.push({ kind: 'player-add', prop: p }); game.scheduleSave(); select(p); game.emit();
    say(`placed ${id} as a player's prop (the save)${lot ? ': that lot draws no preset' : ''}`);
  }
  /** arms placing with the picker's sprite: a ghost follows the cursor over the map until a click (Esc stops) */
  function arm() {
    const id = pickedId();
    if (!id) return say(`not a library id: ${pick.value.trim() || '(empty)'}`);
    placing = id; pick.blur(); say('');
  }
  function disarm() { placing = null; ghostEl.style.display = 'none'; render(); }
  async function undoLast() {
    const u = undo.pop();
    if (!u) return say('nothing to undo');
    try {
      if (u.kind === 'preset') {
        const now = lotPresets().find(p => p.id === u.before.id);
        // a multi-selection's step puts its selection back with the preset
        if (u.sel) await commitGroup(u.lot, now ?? u.before, u.before, within(u.sel, u.before), 'undone', false);
        else await commitPreset(u.lot, now ?? u.before, u.before, u.index, 'undone', null);
      } else if (u.kind === 'file') { await save(u.file, u.text); u.restore?.(); say(`undone: ${u.file} restored`); }
      else if (u.kind === 'player') {
        // a prop removed and put back since is a new Prop: the step applies to it
        const p = live(u.prop);
        if (!p) return say('undo: that prop is gone');
        Object.assign(p, { item: u.item, x: u.x, y: u.y, scale: u.scale, flip: u.flip }); game.devPropChanged(p); select(p); say('undone (the save)');
      } else if (u.kind === 'player-del') { const p = game.addProp(u.item, u.x, u.y, u.flip, u.scale); alias.set(u.prop, p); select(p); game.scheduleSave(); game.emit(); say('undone: put back (the save)'); }
      else { const p = live(u.prop); if (p) game.removeProp(p); game.scheduleSave(); select(null); game.emit(); say('undone: the copy removed (the save)'); }
    } catch (e) { say(`undo failed: ${String(e)}`); }
  }
  function toggle(v = !on) { on = v; if (!on) { sel = null; ghost = null; group = null; box = null; placing = null; drag = null; } message = on ? 'dev editor on: click a sprite' : ''; render(); }

  // ---------- input: ahead of the game's own handlers (capture), only while on
  const stop = (e: Event) => { e.preventDefault(); e.stopImmediatePropagation(); };
  /** a field that takes typing (the picker, the game's own inputs): its keys are its own; a checkbox or a button is not one */
  const typing = (t: EventTarget | null) => t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'range'].includes(t.type)) || (t instanceof HTMLElement && t.isContentEditable);
  const onKey = (e: KeyboardEvent) => {
    if (typing(e.target) || muted) return;
    const mod = e.ctrlKey || e.metaKey;
    if ((e.key === 'i' || e.key === 'I') && !mod && !e.altKey) { toggle(); stop(e); return; }
    if (!on) return;
    if (mod && (e.key === 'z' || e.key === 'Z')) { stop(e); void undoLast(); return; }
    if (e.key === 'Escape' && placing) { stop(e); disarm(); return; }
    if (e.key === 'Escape' && drag) { stop(e); const d = drag; drag = null; say(d.moved ? 'move cancelled' : ''); return; }
    if (e.key === 'Escape' && box) { stop(e); box = null; return; }
    // Insert, or A with the mouse over the map: the sprite being placed (or the picker's) at the cursor
    const id = placing ?? pickedId();
    if ((e.key === 'Insert' || ((e.key === 'a' || e.key === 'A') && !mod && !e.altKey && overMap && id)) && cursor) { stop(e); if (id) void placeAt(id, cursor.mx, cursor.my); else say('pick a library id first'); return; }
    // Ctrl+C copies a preset selection (nothing of a preset selected: the key is the page's); Ctrl+V pastes what was copied at the pointer
    // (in the lot lab both are always the lab's: the game's C and V tools never see them)
    if (mod && !e.altKey && (e.key === 'c' || e.key === 'C')) { if (copy()) stop(e); else if (only !== null) { stop(e); say('nothing of the lot is selected to copy'); } return; }
    if (mod && !e.altKey && (e.key === 'v' || e.key === 'V')) { if (clip || only !== null) { stop(e); void paste(); } return; }
    // H: Change house (Shift+H back), with a selection or in the lot lab; with neither the key is the game's
    if ((e.key === 'h' || e.key === 'H') && !mod && !e.altKey && (sel || ghost || group || only)) { stop(e); void changeHouse(e.shiftKey ? -1 : 1); return; }
    if (!sel && !ghost && !group) return;
    const k = e.shiftKey ? STEP_BIG : STEP;
    switch (e.key) {
      case '[': void act('smaller'); break;
      case ']': void act('bigger'); break;
      case 'ArrowRight': void act('move', k, 0); break;
      case 'ArrowLeft': void act('move', -k, 0); break;
      case 'ArrowDown': void act('move', 0, k); break;
      case 'ArrowUp': void act('move', 0, -k); break;
      case 'r': case 'R': if (mod) return; void act('turn'); break;
      case 'Delete': void act('delete'); break;
      case 'd': case 'D': if (!mod) return; void act('duplicate'); break;
      case 'Escape': select(null); break;
      default: return;
    }
    stop(e);
  };
  const onDown = (e: PointerEvent) => {
    if (!on || paused || e.target !== canvas || e.button !== 0) return;
    // the keys come here: stopping the press keeps a framed game (the studio's Lots tab) from taking the focus by itself, so Delete, R and the
    // arrows would go to the page around it
    window.focus();
    // the panel's fields let go of the keys (stopping the event keeps the focus where it was)
    if (document.activeElement instanceof HTMLElement && panel.contains(document.activeElement)) document.activeElement.blur();
    if (placing) { stop(e); const id = placing; if (!e.shiftKey) disarm(); void placeAt(id, e.offsetX, e.offsetY); return; }
    const p = game.propAt(e.offsetX, e.offsetY), mx = e.offsetX, my = e.offsetY, t = game.tileAt(mx, my);
    drag = null; box = null;
    // a sprite of a lot the editor is not kept to (the lab's neighbours): shown for context, never selected
    if (p && only !== null && p.auto !== `lot:${only}`) { stop(e); say('a neighbouring lot: shown for context, not edited here'); return; }
    const dc = p ? null : decalAt(t.x, t.y);
    // Shift+click: a preset's sprite or decal in or out of the selection (a sprite of no preset is selected alone); no drag
    if (e.shiftKey && (p || dc)) {
      stop(e);
      const r = p ? presetRef(p) : dc ? { lot: dc.lot, preset: dc.preset, i: dc.i } : null, k: Kind = p ? 'props' : 'decals';
      if (!r) { select(p); return; }
      const g = group && group.lot === r.lot && group.preset === r.preset ? group.sel : NONE;
      setGroup(r.lot, r.preset, toggleSel(g, k, r.i));
      return;
    }
    // a press on a sprite or a decal starts a drag (onMove, onRelease): on one of a multi-selection it moves them all (a press that does not
    // move then leaves that one alone selected); on any other it selects it alone first
    if (p || dc) {
      stop(e);
      const r = p ? presetRef(p) : { lot: dc!.lot, preset: dc!.preset, i: dc!.i }, k: Kind = p ? 'props' : 'decals';
      const inGroup = !!r && multi() && group!.lot === r.lot && group!.preset === r.preset && has(group!.sel, k, r.i);
      if (!inGroup) { if (p) select(p); else setGroup(r!.lot, r!.preset, k === 'props' ? selOf([r!.i]) : selOf([], [r!.i])); }
      else if (p) { sel = p; render(); }
      drag = { p, mx, my, t, dx: 0, dy: 0, moved: false, group: multi(), one: inGroup && r ? { kind: k, i: r.i } : null };
      return;
    }
    // empty ground: a box (the lot lab: any drag; elsewhere Shift+drag, a plain drag pans the map), or a click that lets go of the selection
    if (only !== null || e.shiftKey) { stop(e); box = { x0: mx, y0: my, x1: mx, y1: my, add: e.shiftKey }; return; }
    if (sel || ghost || group) select(null);
  };
  /** the decal of a lot's preset nearest a tile point (within a tile), on the lot the editor is kept to, else on the lot under the point; null for none */
  function decalAt(x: number, y: number): { lot: string; preset: string; i: number } | null {
    const lot = only ?? game.lotKeyAt(x, y), at = lot ? game.lotOf(lot) : null, lp = at ? lotPreset(at.g, at.st) : null;
    if (!lot || !lp || !lp.preset.decals?.length) return null;
    const f = lp.frame, p = lp.preset, q = toFrame(f, x, y);
    let best = -1, bd = 1;
    p.decals!.forEach((c, i) => { const dd = Math.hypot(fit1(c.x, p.w, f.w) - q.x, fit1(c.y, p.d, f.d) - q.y); if (dd < bd) { bd = dd; best = i; } });
    return best < 0 ? null : { lot, preset: p.id, i: best };
  }
  /** the items of a lot's preset inside the selection box (screen box of overlay px): its sprites by their footprint centre, its decals by their
   *  centre; the lot: the one the editor is kept to, else the one under the box's middle (or its start) */
  function boxPick(b: NonNullable<typeof box>): { lot: string; preset: string; sel: Selection } | null {
    const mid = game.tileAt((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2), st = game.tileAt(b.x0, b.y0);
    const lot = only ?? game.lotKeyAt(mid.x, mid.y) ?? game.lotKeyAt(st.x, st.y), at = lot ? game.lotOf(lot) : null, lp = at ? lotPreset(at.g, at.st) : null;
    if (!lot || !lp) return null;
    const z = game.cam.z, sx = (X: number) => (X - game.cam.X) * z + game.cssW / 2, sy = (Y: number) => (Y - game.cam.Y) * z + game.cssH / 2, pts: ScreenPt[] = [];
    for (const p of game.propsOfLot(lot)) { const f = game.lotFrom.get(p); if (!f || f.preset !== lp.preset.id) continue; const cx = (p.x0 + p.x1) / 2, cy = (p.y0 + p.y1) / 2; pts.push({ kind: 'props', i: f.prop, x: sx(worldX(cx, cy)), y: sy(worldY(cx, cy)) }); }
    (lp.preset.decals ?? []).forEach((c, i) => { const w = presetToWorld(lp.frame, lp.preset, c.x, c.y); pts.push({ kind: 'decals', i, x: sx(worldX(w.x, w.y)), y: sy(worldY(w.x, w.y)) }); });
    return { lot, preset: lp.preset.id, sel: inBox(pts, b.x0, b.y0, b.x1, b.y1) };
  }
  /** a pointer event's overlay px (its client position: a drag may leave the canvas) */
  const pxOf = (e: PointerEvent) => { const b = canvas.getBoundingClientRect(); return { mx: e.clientX - b.left, my: e.clientY - b.top }; };
  const onMove = (e: PointerEvent) => {
    overMap = e.target === canvas; if (overMap) cursor = { mx: e.offsetX, my: e.offsetY };
    if (box) { stop(e); const q = pxOf(e); box.x1 = q.mx; box.y1 = q.my; return; }
    if (!drag) return;
    // a press that moves past 4 px is a drag: the sprite follows the pointer by the snapped tile delta (the game does not pan meanwhile)
    stop(e); const q = pxOf(e), d = drag;
    if (!d.moved && Math.hypot(q.mx - d.mx, q.my - d.my) > 4) d.moved = true;
    if (d.moved) { const t = game.tileAt(q.mx, q.my); d.dx = snap(t.x - d.t.x); d.dy = snap(t.y - d.t.y); }
  };
  /** a drag's release moves the sprite (or the multi-selection, as one) once by its snapped tile delta (a click, or no delta, changes nothing:
   *  the press selected it; a click on an item of a multi-selection leaves that one alone selected); a cancel moves nothing. A box's release
   *  selects what lies inside it (Shift: added to the selection); a box too small to be one is a click on the ground: nothing selected */
  const onRelease = (e: PointerEvent) => {
    const b = box;
    if (b) {
      stop(e); box = null;
      if (e.type !== 'pointerup') return;
      if (Math.abs(b.x1 - b.x0) < 4 && Math.abs(b.y1 - b.y0) < 4) { if (!b.add) select(null); return; }
      const r = boxPick(b);
      if (!r) { if (!b.add) select(null); return say('the box holds no lot drawn from a preset'); }
      const s = b.add && group && group.lot === r.lot && group.preset === r.preset ? union(group.sel, r.sel) : r.sel;
      setGroup(r.lot, r.preset, s);
      if (!count(s)) say('the box holds nothing of the lot');
      return;
    }
    if (!drag) return;
    stop(e); const d = drag; drag = null;
    if (e.type !== 'pointerup') return;
    if (d.dx || d.dy) { void act('move', d.dx, d.dy); return; }
    if (!d.moved && d.one && group) setGroup(group.lot, group.preset, d.one.kind === 'props' ? selOf([d.one.i]) : selOf([], [d.one.i]));
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onRelease, true); window.addEventListener('pointercancel', onRelease, true);
  // a hot reload of lot-presets.json (the file on disk is the merged truth): a reload while a write is queued or in flight is skipped (the editor
  // holds the same or a newer state); any other that differs from the presets held (another person's save, the studio, a hand edit) replaces
  // them, every lot composes again, and the selection follows its preset prop. The echo of the editor's own save matches them: nothing changes
  // the studio saved a size (scale-overrides.json, applied in place by lots/scales-live.ts): the cars' facings again and every lot composed again,
  // so the running game draws what the studio's card shows (T163: before, it kept the old size until a reload by hand)
  const unScales = onStudioScales(() => { resetFacings(); recomposeKeeping(); game.recomposeLots(); say('the studio sizes changed: every lot was composed again at the new sizes'); });
  const unReload = onLotPresetsReload((list, meta) => {
    if (writing || waiting.size || formatPresets(list, meta) === formatPresets(lotPresets(), lotPresetsMeta())) return;
    setLotPresets(list, meta); recomposeKeeping();
    say('lot-presets.json changed on disk: the lots were composed again');
  });

  // the outlines follow their pictures every frame (the camera moves): the selected sprite, the left-out ghost, the sprite being placed
  let raf = 0;
  const r4 = [0, 0, 0, 0];
  const place = (el: HTMLElement, d: Drawable, min: number): { w: number; h: number } => {
    spriteRect(d, r4);
    const b = canvas.getBoundingClientRect(), z = game.cam.z, sx = (X: number) => b.left + (X - game.cam.X) * z + game.cssW / 2, sy = (Y: number) => b.top + (Y - game.cam.Y) * z + game.cssH / 2;
    const x0 = sx(r4[0]), y0 = sy(r4[1]), x1 = sx(r4[2]), y1 = sy(r4[3]);
    // a sprite with no picture (a hidden stand-in) shows a ring at its anchor
    const w = Math.max(min, x1 - x0), h = Math.max(min, y1 - y0), ax = sx(worldX(d.x, d.y)), ay = sy(worldY(d.x, d.y));
    Object.assign(el.style, { display: 'block', left: `${x1 - x0 < min ? ax - min / 2 : x0}px`, top: `${y1 - y0 < min ? ay - min / 2 : y0}px`, width: `${w}px`, height: `${h}px` });
    return { w, h };
  };
  /** the placing ghost: a drawable's picture at its place on the map (hidden for none) */
  const drawGhost = (d: Drawable | null) => { if (!d) { ghostEl.style.display = 'none'; return; } const look = lookOf(d), { w, h } = place(ghostEl, d, 6); paint(ghostEl, LIBRARY[look.item]!, w, h); ghostEl.style.transform = look.flip ? 'scaleX(-1)' : ''; };
  /** the multi-selection's outlines and rings for this frame (a group drag shows them where they would land: moved by the drag's screen delta),
   *  and the selection box; the unused ones hidden */
  const drawGroup = () => {
    let no = 0, nr = 0;
    const g = on && multi() ? group : null, dr = drag?.group && drag.moved ? drag : null, z = game.cam.z;
    const ox = dr ? worldX(dr.dx, dr.dy) * z : 0, oy = dr ? worldY(dr.dx, dr.dy) * z : 0;
    if (g) {
      for (const p of game.propsOfLot(g.lot)) {
        const f = game.lotFrom.get(p); if (!f || f.preset !== g.preset || !has(g.sel, 'props', f.prop)) continue;
        const el = pooled(outlines, no++, OUTLINE_CSS); place(el, p, 14); if (dr) { el.style.left = `${parseFloat(el.style.left) + ox}px`; el.style.top = `${parseFloat(el.style.top) + oy}px`; }
      }
      const s = g.sel.decals.length ? groupSrc() : null, b = canvas.getBoundingClientRect();
      if (s) for (const i of s.sel.decals) {
        const c = s.preset.decals![i]!, w = toWorld(s.frame, fit1(c.x, s.preset.w, s.frame.w), fit1(c.y, s.preset.d, s.frame.d)), el = pooled(rings, nr++, RING_CSS);
        Object.assign(el.style, { display: 'block', left: `${b.left + (worldX(w.x, w.y) - game.cam.X) * z + game.cssW / 2 + ox}px`, top: `${b.top + (worldY(w.x, w.y) - game.cam.Y) * z + game.cssH / 2 + oy}px` });
      }
    }
    for (let k = no; k < outlines.length; k++) outlines[k]!.style.display = 'none';
    for (let k = nr; k < rings.length; k++) rings[k]!.style.display = 'none';
    const bx = on ? box : null;
    if (!bx) { boxEl.style.display = 'none'; return; }
    const b = canvas.getBoundingClientRect();
    Object.assign(boxEl.style, { display: 'block', left: `${b.left + Math.min(bx.x0, bx.x1)}px`, top: `${b.top + Math.min(bx.y0, bx.y1)}px`, width: `${Math.abs(bx.x1 - bx.x0)}px`, height: `${Math.abs(bx.y1 - bx.y0)}px` });
  };
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const g = on && ghost ? ghostDrawable() : null;
    // the panel's sprite gets the bright outline (a multi-selection's are drawn by drawGroup)
    if (on && sel && game.props.has(sel) && !multi()) place(outline, sel, 14); else outline.style.display = 'none';
    if (g) place(lost, g, 14); else lost.style.display = 'none';
    drawGroup();
    // a drag shows the sprite where it would land (its footprint centre plus the snapped delta), else the placing ghost follows the cursor
    const dr = on ? drag : null, dp = dr?.p;
    if (dr?.moved && dp && !dr.group) drawGhost(drawable(LIBRARY[dp.item]!.id, (dp.x0 + dp.x1) / 2 + dr.dx, (dp.y0 + dp.y1) / 2 + dr.dy, dp.scale, dp.flip));
    else if (dr?.moved) ghostEl.style.display = 'none';
    else if (on && placing && overMap && cursor) {
      const t = game.tileAt(cursor.mx, cursor.my), x = snap(t.x), y = snap(t.y), lot = game.lotKeyAt(x, y), at = lot ? game.lotOf(lot) : null, lp = at ? lotPreset(at.g, at.st) : null;
      const v = lp ? turned(placing, lp.frame.q) : { id: placing, flip: false }, d = drawable(v.id, x, y, ownerScaleOf(placing), v.flip);
      drawGhost(d);
    } else ghostEl.style.display = 'none';
  };
  raf = requestAnimationFrame(frame);
  if (new URLSearchParams(location.search).has('dev')) toggle(true);

  /** the selection for the lot lab (EditorSel): a multi-selection's items (its preset's props and decals) or the one sprite alone, and their box on
   *  screen: the selected sprites' pictures and a ring's reach round each decal */
  function selInfo(): EditorSel {
    if (!on) return NO_SEL;
    const b = canvas.getBoundingClientRect(), z = game.cam.z, sx = (X: number) => b.left + (X - game.cam.X) * z + game.cssW / 2, sy = (Y: number) => b.top + (Y - game.cam.Y) * z + game.cssH / 2;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (d: Drawable) => { spriteRect(d, r4); x0 = Math.min(x0, sx(r4[0])); y0 = Math.min(y0, sy(r4[1])); x1 = Math.max(x1, sx(r4[2])); y1 = Math.max(y1, sy(r4[3])); };
    const g = groupSrc(), items: EditorSel['items'] = [];
    if (g && count(g.sel)) {
      for (const i of g.sel.props) { const q = g.preset.props[i]; if (q) items.push({ kind: 'prop', index: i, id: q.id, scale: q.scale, view: q.view }); }
      for (const i of g.sel.decals) { const c = g.preset.decals?.[i]; if (c) items.push({ kind: 'decal', index: i, id: c.id, scale: c.scale, view: 0 }); }
      for (const p of game.propsOfLot(g.lot)) { const f = game.lotFrom.get(p); if (f && f.preset === g.preset.id && has(g.sel, 'props', f.prop)) grow(p); }
      for (const i of g.sel.decals) {
        const c = g.preset.decals![i]!, w = toWorld(g.frame, fit1(c.x, g.preset.w, g.frame.w), fit1(c.y, g.preset.d, g.frame.d)), X = sx(worldX(w.x, w.y)), Y = sy(worldY(w.x, w.y));
        x0 = Math.min(x0, X - 12); y0 = Math.min(y0, Y - 12); x1 = Math.max(x1, X + 12); y1 = Math.max(y1, Y + 12);
      }
      const d = ghost ? ghostDrawable() : null; if (d) grow(d);
    } else if (sel && game.props.has(sel)) { items.push({ kind: 'prop', index: -1, id: LIBRARY[sel.item]!.id, scale: sel.scale, view: 0 }); grow(sel); }
    else return NO_SEL;
    const props = items.filter(t => t.kind === 'prop').length;
    return { key: `${g?.lot ?? ''}|${g?.preset.id ?? ''}|${items.map(t => `${t.kind[0]}${t.index}:${t.id}@${t.scale}/${t.view}`).join(',')}`, props, decals: items.length - props, lot: g?.lot ?? null, preset: g?.preset.id ?? null, items, box: x0 < x1 ? { x0, y0, x1, y1 } : null };
  }

  lab = {
    place: id => { if (!on) toggle(true); pick.value = id; showThumb(); arm(); },
    edit: a => {
      if (a === 'undo') void undoLast();
      else if (a === 'house' || a === 'house-back') void changeHouse(a === 'house' ? 1 : -1).then(done => { if (!done) say('Change house: select a house or a building first'); });
      else if (a === 'copy') { if (!copy()) say('nothing of a lot preset is selected to copy'); }
      else if (a === 'paste') void paste();
      else void act(a);
    },
    deselect: () => { drag = null; box = null; if (sel || ghost || group) select(null); },
    sel: selInfo,
  };
  return () => {
    cancelAnimationFrame(raf); unReload(); unScales(); lab = null;
    boxEl.remove(); for (const d of [...outlines, ...rings]) d.remove();
    window.removeEventListener('keydown', onKey, true); window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onRelease, true); window.removeEventListener('pointercancel', onRelease, true);
    outline.remove(); lost.remove(); ghostEl.remove(); panel.remove();
  };
}
