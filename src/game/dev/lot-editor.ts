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
// The dev server writes the files (vite.config.ts: POST /__dev/save, whitelisted, own pages only) and hot-reloads the presets with no page
// reload or rebuild.
// The lot lab (src/game/dev/lot-lab.ts) drives the panel through armPlacing and editorAct, saves with saveLotPresets, and draws its palette with thumb.
import type { Game } from '../engine';
import type { LibItem, Prop } from '../types';
import { ATLAS_PAGES, ATLAS_SIZE, LIBRARY } from '../library';
import { spriteRect, type Drawable } from '../sprites';
import { worldX, worldY } from '../iso';
import { OWNER_SCALE, TABLE_SCALE } from '../lots/scales';
import { lookOf, maxDrawScale } from '../newart';
import { compose, lotPreset, lotPresets, lotPresetsMeta, onLotPresetsReload, setLotPresets, type PresetDrop } from '../lots/compose';
import { formatPresets, type LotPreset } from '../lots/presets';
import { footprintOf, fourViews, ownerScaleOf, turned } from '../lots/preset-art';
import { applyEdit, clampToLot, growWithin, placeInPreset, presetToWorld, removeSprite, replacePreset, scaleOverride, snap, studioJson, worldToPreset, type PresetEdit } from './lot-edit';

/** an edit's kind, as the keys name it */
type Act = 'bigger' | 'smaller' | 'move' | 'turn' | 'delete' | 'duplicate';
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
  | { kind: 'preset'; before: LotPreset; lot: string; index: number }
  | { kind: 'file'; file: 'scale-overrides.json' | 'removed.json'; text: string; restore?: () => void }
  | { kind: 'player'; prop: Prop; item: number; x: number; y: number; scale: number; flip: boolean }
  | { kind: 'player-del'; prop: Prop; item: number; x: number; y: number; scale: number; flip: boolean }
  | { kind: 'player-add'; prop: Prop };

/** the resize step (a factor) and the move steps (tiles) */
const GROW = 1.05, STEP = 0.25, STEP_BIG = 1;
/** a removal is read when the assets are generated (scales.ts REMOVED_IDS, by prep-scales.mjs); the sizes are read at runtime */
const REMOVED_NOTE = 'the sprite leaves the game at the next asset rebuild (the studio\'s Rebuild), which reads removed.json';
const INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
/** the largest drawn scale a sprite's art allows (newart.ts maxDrawScale: its picture's pixels at the closest zoom); four-view art takes the
 *  smallest of its four views, since a preset or a library size draws it in any of them; Infinity for a stand-in (it fills any footprint) */
const artLimit = (id: string) => Math.min(...(fourViews(id)?.views ?? [id]).map(v => { const i = INDEX.get(v); return i === undefined ? Infinity : maxDrawScale(i); }));
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
/** paints a library sprite's atlas picture (its stand-in for an old building, as the game draws it) over an element of w x h px */
function paint(el: HTMLElement, it: LibItem, w: number, h: number) {
  const [page, u0, v0, u1, v1] = it.tex, P = ATLAS_SIZE / 2, kx = w / Math.max(1e-6, (u1 - u0) * P), ky = h / Math.max(1e-6, (v1 - v0) * P);
  Object.assign(el.style, { backgroundImage: `url(${ATLAS_PAGES[page]![1]})`, backgroundSize: `${P * kx}px ${P * ky}px`, backgroundPosition: `${-u0 * P * kx}px ${-v0 * P * ky}px`, backgroundRepeat: 'no-repeat' });
}
/** draws a library sprite's look (the picture the lots draw, lookOf) fitted into size x size css px on el's background; clears it for an unknown id */
export function thumb(el: HTMLElement, id: string, size: number): void {
  const item = INDEX.get(id); if (item === undefined) { el.style.backgroundImage = ''; return; }
  const look = LIBRARY[lookOf({ item, flip: false, scale: 1, x: 0, y: 0 }).item] ?? LIBRARY[item]!, [, u0, v0, u1, v1] = look.tex, a = (u1 - u0) / Math.max(1e-6, v1 - v0);
  paint(el, look, a >= 1 ? size : size * a, a >= 1 ? size / a : size);
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
/** a text's fingerprint (two FNV-1a passes, 64 bits as a string) */
const fingerprint = (s: string) => { let a = 0x811c9dc5, b = 0x01000193 ^ s.length; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 2246822519) ^ (b >>> 13); } return `${(a >>> 0).toString(36)}.${(b >>> 0).toString(36)}`; };
/** every text the editor gave a file this session: a hot reload of any of them is the echo of its own save (an earlier one can land after a
 *  later write), never applied, so memory never falls behind disk */
const written = new Set<string>();
async function save(file: string, json: string): Promise<void> {
  waiting.set(file, json); written.add(fingerprint(json));
  while (writing) await writing.catch(() => undefined);
  if (!waiting.has(file)) return;   // a later call wrote this file's newest text already
  const text = waiting.get(file)!; waiting.delete(file);
  writing = post(file, text).finally(() => { writing = null; });
  await writing;
}
/** writes the lot presets now held (lotPresets()) to lot-presets.json through the editor's save queue (its hot reload echo is ignored): the lot lab's Save and Approve */
export function saveLotPresets(): Promise<void> { return save('lot-presets.json', formatPresets(lotPresets(), lotPresetsMeta())); }
/** the open editor's entries for the lot lab (set by installLotEditor, null while no editor is installed): arm a library id, run an action */
let lab: { place: (id: string) => void; edit: (a: 'bigger' | 'smaller' | 'turn' | 'delete' | 'duplicate' | 'undo') => void } | null = null;
/** arms placing the library sprite id (the editor turned on): the lot lab's palette; false when the editor is not installed */
export function armPlacing(id: string): boolean { if (!lab) return false; lab.place(id); return true; }
/** one editor action on the selection, as its key would do it: the lot lab's buttons; false when the editor is not installed */
export function editorAct(a: 'bigger' | 'smaller' | 'turn' | 'delete' | 'duplicate' | 'undo'): boolean { if (!lab) return false; lab.edit(a); return true; }
/** whether the editor's pointer handling is paused (the lot lab's ground painting) */
let paused = false;
/** pauses the editor's pointer handling (the lot lab's ground painting): its presses go to the lab */
export function pauseEditor(v: boolean): void { paused = v; }

/** installs the editor on a game and its overlay canvas (off until ?dev or the I key); returns the uninstall */
export function installLotEditor(game: Game, canvas: HTMLCanvasElement): () => void {
  let on = false, sel: Prop | null = null, ghost: Ghost | null = null, everywhere = false, message = '';
  /** the cursor over the map (overlay px) and whether it is there now; the sprite being placed (a library id) */
  let cursor: { mx: number; my: number } | null = null, overMap = false, placing: string | null = null;
  /** a press on a sprite (its prop, the overlay px and the tile under it), the snapped tile delta since, and whether it moved past 4 px (a drag) */
  let drag: { p: Prop; mx: number; my: number; t: { x: number; y: number }; dx: number; dy: number; moved: boolean } | null = null;
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
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;right:12px;bottom:12px;width:340px;max-width:calc(100vw - 24px);max-height:70vh;overflow:auto;z-index:61;display:none;background:rgba(12,18,28,.94);color:#e2e8f0;border:1px solid #38bdf8;border-radius:10px;padding:10px 12px;font:12px/1.45 ui-monospace,Consolas,monospace;box-shadow:0 6px 24px rgba(0,0,0,.5)';
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b style="color:#7dd3fc">DEV LOT EDITOR</b><span style="opacity:.7">I closes</span></div>
    <div data-k="info" style="white-space:pre-wrap;word-break:break-all;min-height:3.2em"></div>
    <label style="display:flex;gap:6px;align-items:center;margin:6px 0;cursor:pointer"><input data-k="every" type="checkbox"> this sprite everywhere (size, remove)</label>
    <div style="display:flex;gap:6px;margin:6px 0;align-items:center"><div data-k="thumb" style="width:36px;height:36px;flex:none;border:1px solid #334155;border-radius:5px;background-color:#0f172a"></div><input data-k="pick" list="ce-dev-lib" placeholder="library id or name" style="flex:1;min-width:0;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:5px;padding:3px 6px"><button data-k="add" style="background:#0369a1;color:#fff;border-radius:5px;padding:2px 8px">Place</button></div>
    <datalist id="ce-dev-lib"></datalist>
    <div style="opacity:.75">[ ] size 5% · arrows move ¼ tile (Shift 1) · drag a sprite to move it · R turn · Del delete · Ctrl+D duplicate · Place / Enter: click to put (Shift+click: more, Esc stops) · Insert or A: at the cursor · Esc deselect · Ctrl+Z undo</div>
    <div data-k="drops" style="margin-top:6px"></div>
    <div data-k="msg" style="margin-top:6px;color:#fcd34d;white-space:pre-wrap"></div>`;
  const $ = <T extends HTMLElement>(k: string) => panel.querySelector(`[data-k="${k}"]`) as T;
  const list = panel.querySelector('datalist')!;
  for (const it of LIBRARY) if (!it.id.startsWith('view:') && !it.id.startsWith('east:') && it.kind !== 'walker') { const o = document.createElement('option'); o.value = it.id; o.label = it.name; list.appendChild(o); }
  document.body.append(outline, lost, ghostEl, panel);
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
  const selLot = () => (sel?.auto?.startsWith('lot:') ? sel.auto.slice(4) : ghost?.lot ?? null);
  /** the ghost as the lots would draw it (its preset prop fitted, turned, at its scale) */
  function ghostDrawable(): Drawable | null {
    const s = ghost ? presetSource(ghost.lot, ghost.preset, ghost.index) : null; if (!s) return null;
    const q = s.preset.props[s.index]!, t = turned(q.id, s.frame.q + q.view), c = presetToWorld(s.frame, s.preset, q.x, q.y);
    return drawable(t.id, c.x, c.y, isCar(t.id) ? 1 : q.scale * ownerScaleOf(q.id), t.flip);
  }
  /** the props a lot leaves out now, with why (compose's drops) */
  function refreshDrops(lot: string | null) {
    dropsLot = lot; drops = [];
    const at = lot ? game.lotOf(lot) : null;
    if (at) compose(at.g, at.st, drops);
  }

  function render() {
    panel.style.display = on ? 'block' : 'none';
    if (!on) { outline.style.display = lost.style.display = ghostEl.style.display = 'none'; return; }
    let info = 'Click a sprite to select it.';
    const s = selSource();
    if (sel) {
      const it = LIBRARY[sel.item]!;
      const src = s?.kind === 'preset' ? `lot ${s.lot}\npreset ${s.preset.id}${s.preset.curated ? ' (curated)' : ''}, prop ${s.index}`
        : s?.kind === 'lot' ? `lot ${s.lot}: procedural (fence, street item, planting): not a preset's` : s?.kind === 'player' ? 'a player-placed prop (the save)' : `an auto prop (${s && s.kind === 'auto' ? s.tag : ''})`;
      const q = s?.kind === 'preset' ? s.preset.props[s.index]! : null;
      info = `${it.id}\n${src}\nscale ${sel.scale.toFixed(3)}${q ? ` (preset ${q.scale} x owner ${ownerScaleOf(q.id)})` : ''} · view ${q ? q.view : '-'}${sel.flip ? ' · flipped' : ''}`;
    } else if (ghost) {
      const q = s?.kind === 'preset' ? s.preset.props[s.index] : undefined;
      info = q ? `${q.id}\nlot ${ghost.lot}\npreset ${ghost.preset}, prop ${ghost.index}\nLEFT OUT: ${ghost.why} (dashed). Move it (arrows), turn or resize it to bring it back, or Ctrl+Z` : `lot ${ghost.lot}: that preset prop is gone`;
    }
    $('info').textContent = info;
    const box = $('drops');
    box.innerHTML = '';
    const lot = selLot();
    if (lot && lot === dropsLot && drops.length) {
      const h = document.createElement('div'); h.textContent = `props this lot leaves out (${drops.length}):`; h.style.color = '#fdba74'; box.appendChild(h);
      for (const d of drops) {
        const b = document.createElement('button');
        b.textContent = `${d.id.replace(/^variation:/, 'v:')}: ${d.why}`;
        b.style.cssText = `display:block;width:100%;text-align:left;margin-top:2px;padding:1px 4px;border-radius:4px;background:${ghost && ghost.preset === d.preset && ghost.index === d.prop ? '#7c2d12' : '#1e293b'};color:#fde68a;font:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap`;
        b.addEventListener('click', () => { sel = null; ghost = { lot, preset: d.preset, index: d.prop, why: d.why }; render(); });
        box.appendChild(b);
      }
    }
    $('msg').textContent = (placing ? `placing ${placing}: click the map (Shift+click: more, Esc stops)\n` : '') + message;
  }
  const say = (m: string) => { message = m; render(); };
  function select(p: Prop | null) { sel = p; ghost = null; refreshDrops(selLot()); render(); }
  /** after the lots were composed again: the prop now drawn from the preset prop (the old Prop objects are gone), else that preset prop as a
   *  ghost with the reason the lot leaves it out */
  function reselect(lot: string, preset: string, index: number) {
    refreshDrops(lot);
    sel = index < 0 ? null : game.propsOfLot(lot).find(p => { const f = game.lotFrom.get(p); return !!f && f.preset === preset && f.prop === index; }) ?? null;
    ghost = sel || index < 0 ? null : { lot, preset, index, why: drops.find(d => d.preset === preset && d.prop === index)?.why ?? 'not drawn on this lot' };
    render();
  }
  /** composes every lot again (a library size changed), the selected lot's at once, and keeps the selection on its preset prop */
  function recomposeKeeping() {
    const lot = selLot(), from = sel ? game.lotFrom.get(sel) : ghost ? { preset: ghost.preset, prop: ghost.index } : undefined;
    game.recomposeLots(lot ? [lot] : []);
    if (lot && from) reselect(lot, from.preset, from.prop); else if (sel && !game.props.has(sel)) select(null); else render();
  }
  /** the selection's footprint half extents (world tiles): the drawn prop's, or the ghost's */
  function half(): { hx: number; hy: number } {
    const d: Drawable | null = sel ?? ghostDrawable();
    return d ? { hx: (d.x1 - d.x0) / 2, hy: (d.y1 - d.y0) / 2 } : { hx: 0.25, hy: 0.25 };
  }

  // ---------- the edits
  async function commitPreset(lot: string, before: LotPreset, after: LotPreset, index: number, what: string, undoIndex: number | null = index, note = '') {
    if (undoIndex !== null) undo.push({ kind: 'preset', before, lot, index: undoIndex });
    setLotPresets(replacePreset(lotPresets(), after));
    // this lot at once, then only the other lots drawn from the same preset (not the whole town's ground on every key repeat)
    game.recomposeLots([lot], after.id);
    reselect(lot, after.id, index);
    try { await save('lot-presets.json', formatPresets(lotPresets(), lotPresetsMeta())); say(`${what}: ${after.id} saved to lot-presets.json${after.curated ? ' (curated)' : ''}; every lot drawn from it follows${note}${ghost ? `. This lot leaves it out: ${ghost.why}` : ''}`); }
    catch (e) { say(`NOT SAVED: ${String(e)}`); }
  }
  async function presetEdit(s: Extract<Source, { kind: 'preset' }>, a: Act, dx: number, dy: number) {
    const q = s.preset.props[s.index]!, here = presetToWorld(s.frame, s.preset, q.x, q.y);
    let e: PresetEdit, note = '';
    if (a === 'bigger' || a === 'smaller') {
      // a parked car is drawn at the road cars' size (CAR_SCALE) whatever its preset scale (compose: car ? 1)
      if (isCar(q.id)) return say(`${q.id}: a parked car is drawn at the size of the cars on the road; its size is not the preset's`);
      // the drawn size (the preset's scale x the owner scale) never past the picture's pixels in any of its views
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
    const it = LIBRARY[item]!, id = fourViews(it.id)?.views[0] ?? it.id;
    if ((a === 'bigger' || a === 'smaller') && isCar(id)) return say(`${id}: a parked car is drawn at the size of the cars on the road; it has no library size to set`);
    if (a === 'bigger' || a === 'smaller') {
      // the studio's rule (server.mjs /api/scale): its size, else the table's, times the step; never past the pixels of any of its views
      const text = await load('scale-overrides.json'), sizes = JSON.parse(text) as Record<string, number>, base = TABLE_SCALE[id] ?? OWNER_SCALE[id] ?? 1, cur = sizes[id] ?? base;
      const lim = artLimit(id), next = growWithin(cur, a === 'bigger' ? GROW : 1 / GROW, lim);
      if (next === null) return say(refused(id, lim));
      const out = scaleOverride(sizes, id, base, next / cur), views = fourViews(id)?.views ?? [id], before = views.map(v => [v, OWNER_SCALE[v]] as const);
      await save('scale-overrides.json', studioJson(out));
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
    if (lot && lp) {
      const v = turned(id, lp.frame.q), fp = footprintOf(v.id, isCar(id) ? 1 : ownerScaleOf(id), v.flip), n = placeInPreset(lp.frame, lp.preset, x, y, (fp[2] - fp[0]) / 2, (fp[3] - fp[1]) / 2);
      const r = applyEdit(lp.preset, { op: 'add', id, x: n.x, y: n.y });
      if (r) await commitPreset(lot, lp.preset, r.preset, r.prop, `added ${id}`, -1, n.clamped ? ' (at the lot edge)' : '');
      return;
    }
    const s = isCar(id) ? 1 : ownerScaleOf(id), fp = footprintOf(id, s, false), p = game.addProp(item, x - (fp[0] + fp[2]) / 2, y - (fp[1] + fp[3]) / 2, false, s);
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
        await commitPreset(u.lot, now ?? u.before, u.before, u.index, 'undone', null);
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
  function toggle(v = !on) { on = v; if (!on) { sel = null; ghost = null; placing = null; drag = null; } message = on ? 'dev editor on: click a sprite' : ''; render(); }

  // ---------- input: ahead of the game's own handlers (capture), only while on
  const stop = (e: Event) => { e.preventDefault(); e.stopImmediatePropagation(); };
  /** a field that takes typing (the picker, the game's own inputs): its keys are its own; a checkbox or a button is not one */
  const typing = (t: EventTarget | null) => t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'range'].includes(t.type)) || (t instanceof HTMLElement && t.isContentEditable);
  const onKey = (e: KeyboardEvent) => {
    if (typing(e.target)) return;
    const mod = e.ctrlKey || e.metaKey;
    if ((e.key === 'i' || e.key === 'I') && !mod && !e.altKey) { toggle(); stop(e); return; }
    if (!on) return;
    if (mod && (e.key === 'z' || e.key === 'Z')) { stop(e); void undoLast(); return; }
    if (e.key === 'Escape' && placing) { stop(e); disarm(); return; }
    if (e.key === 'Escape' && drag) { stop(e); const d = drag; drag = null; say(d.moved ? 'move cancelled' : ''); return; }
    // Insert, or A with the mouse over the map: the sprite being placed (or the picker's) at the cursor
    const id = placing ?? pickedId();
    if ((e.key === 'Insert' || ((e.key === 'a' || e.key === 'A') && !mod && !e.altKey && overMap && id)) && cursor) { stop(e); if (id) void placeAt(id, cursor.mx, cursor.my); else say('pick a library id first'); return; }
    if (!sel && !ghost) return;
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
    const p = game.propAt(e.offsetX, e.offsetY);
    // a press on a sprite selects it and starts a drag (onMove, onRelease): a click alone only selects it
    drag = null;
    if (p) { select(p); stop(e); drag = { p, mx: e.offsetX, my: e.offsetY, t: game.tileAt(e.offsetX, e.offsetY), dx: 0, dy: 0, moved: false }; } else if (sel || ghost) select(null);
  };
  /** a pointer event's overlay px (its client position: a drag may leave the canvas) */
  const pxOf = (e: PointerEvent) => { const b = canvas.getBoundingClientRect(); return { mx: e.clientX - b.left, my: e.clientY - b.top }; };
  const onMove = (e: PointerEvent) => {
    overMap = e.target === canvas; if (overMap) cursor = { mx: e.offsetX, my: e.offsetY };
    if (!drag) return;
    // a press that moves past 4 px is a drag: the sprite follows the pointer by the snapped tile delta (the game does not pan meanwhile)
    stop(e); const q = pxOf(e), d = drag;
    if (!d.moved && Math.hypot(q.mx - d.mx, q.my - d.my) > 4) d.moved = true;
    if (d.moved) { const t = game.tileAt(q.mx, q.my); d.dx = snap(t.x - d.t.x); d.dy = snap(t.y - d.t.y); }
  };
  /** a drag's release moves the sprite once by its snapped tile delta (a click, or no delta, changes nothing: the press selected it); a cancel moves nothing */
  const onRelease = (e: PointerEvent) => {
    if (!drag) return;
    stop(e); const d = drag; drag = null;
    if (e.type === 'pointerup' && (d.dx || d.dy)) void act('move', d.dx, d.dy);
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onRelease, true); window.addEventListener('pointercancel', onRelease, true);
  // a hot reload of lot-presets.json: any text this editor wrote this session is the echo of its own saves (an earlier one can land after a
  // later write) and is never applied, nor is any reload while it writes (the editor holds the same or newer presets); any other (the studio,
  // a hand edit) replaces the presets, every lot composes again, and the selection follows its preset prop
  const unReload = onLotPresetsReload((list, meta) => {
    if (writing || waiting.size || written.has(fingerprint(formatPresets(list, meta)))) return;
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
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const g = on && ghost ? ghostDrawable() : null;
    if (on && sel && game.props.has(sel)) place(outline, sel, 14); else outline.style.display = 'none';
    if (g) place(lost, g, 14); else lost.style.display = 'none';
    // a drag shows the sprite where it would land (its footprint centre plus the snapped delta), else the placing ghost follows the cursor
    const dr = on ? drag : null;
    if (dr?.moved) drawGhost(drawable(LIBRARY[dr.p.item]!.id, (dr.p.x0 + dr.p.x1) / 2 + dr.dx, (dr.p.y0 + dr.p.y1) / 2 + dr.dy, dr.p.scale, dr.p.flip));
    else if (on && placing && overMap && cursor) {
      const t = game.tileAt(cursor.mx, cursor.my), x = snap(t.x), y = snap(t.y), lot = game.lotKeyAt(x, y), at = lot ? game.lotOf(lot) : null, lp = at ? lotPreset(at.g, at.st) : null;
      const v = lp ? turned(placing, lp.frame.q) : { id: placing, flip: false }, d = drawable(v.id, x, y, isCar(placing) ? 1 : ownerScaleOf(placing), v.flip);
      drawGhost(d);
    } else ghostEl.style.display = 'none';
  };
  raf = requestAnimationFrame(frame);
  if (new URLSearchParams(location.search).has('dev')) toggle(true);

  lab = { place: id => { if (!on) toggle(true); pick.value = id; showThumb(); arm(); }, edit: a => { if (a === 'undo') void undoLast(); else void act(a); } };
  return () => {
    cancelAnimationFrame(raf); unReload(); lab = null;
    window.removeEventListener('keydown', onKey, true); window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onRelease, true); window.removeEventListener('pointercancel', onRelease, true);
    outline.remove(); lost.remove(); ghostEl.remove(); panel.remove();
  };
}
