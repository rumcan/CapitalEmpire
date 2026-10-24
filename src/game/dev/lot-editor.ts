// The in-game dev editor (P20 / T071; dev builds only: App.tsx loads it behind import.meta.env.DEV). On with ?dev in the URL or the I key.
// Click a sprite to select it (topmost under the cursor: Game.propAt over the sprites' rects); [ and ] resize 5%, the arrows move 0.25 tile
// along the map axes (Shift: 1 tile), R turns it, Delete removes it, Ctrl+D duplicates it, Esc deselects, Ctrl+Z undoes; the panel's picker
// adds a library sprite at the cursor (or Insert). Every edit is kept, by scope:
//   a lot prop drawn from a preset: the preset's prop, in the lot's frame (the turn and the fit undone), saved to lot-presets.json and flagged
//     curated: every lot drawn from that preset follows, now and whenever a lot is composed again;
//   'this sprite everywhere' (the panel's toggle): the library sprite's size or removal for the whole game, written to the studio Library tab's
//     scale-overrides.json (read at runtime: the size shows at once) and removed.json (read at the next asset rebuild); a size never grows past
//     the picture's pixels (newart.ts maxDrawScale), here or in a preset or the save, as the studio and the game's own resize refuse it;
//   a player's prop: the prop in the game save, as the game's own tools do.
// The dev server writes the files (vite.config.ts: POST /__dev/save, whitelisted) and hot-reloads the presets with no page reload or rebuild.
import type { Game } from '../engine';
import type { Prop } from '../types';
import { LIBRARY } from '../library';
import { spriteRect } from '../sprites';
import { worldX, worldY } from '../iso';
import { OWNER_SCALE, TABLE_SCALE } from '../lots/scales';
import { maxDrawScale } from '../newart';
import { lotPreset, lotPresets, lotPresetsMeta, onLotPresetsReload, setLotPresets } from '../lots/compose';
import { formatPresets, type LotPreset } from '../lots/presets';
import { fourViews, ownerScaleOf, turned } from '../lots/preset-art';
import { applyEdit, growWithin, presetToWorld, removeSprite, replacePreset, scaleOverride, studioJson, worldToPreset, type PresetEdit } from './lot-edit';

/** an edit's kind, as the keys name it */
type Act = 'bigger' | 'smaller' | 'move' | 'turn' | 'delete' | 'duplicate';
/** where a selected sprite comes from */
type Source =
  | { kind: 'preset'; lot: string; preset: LotPreset; index: number; frame: NonNullable<ReturnType<typeof lotPreset>>['frame'] }
  | { kind: 'lot'; lot: string }
  | { kind: 'player' }
  | { kind: 'auto'; tag: string };
/** one step back: a preset as it was, a studio file's text as it was, or a player prop's state (or its removal / addition) */
type Undo =
  | { kind: 'preset'; before: LotPreset; lot: string; index: number }
  | { kind: 'file'; file: 'scale-overrides.json' | 'removed.json'; text: string; restore?: () => void }
  | { kind: 'player'; prop: Prop; item: number; x: number; y: number; scale: number; flip: boolean }
  | { kind: 'player-del'; item: number; x: number; y: number; scale: number; flip: boolean }
  | { kind: 'player-add'; prop: Prop };

/** the resize step (a factor) and the move steps (tiles) */
const GROW = 1.05, STEP = 0.25, STEP_BIG = 1;
/** a removal is read when the assets are generated (scales.ts REMOVED_IDS, by prep-scales.mjs); the sizes are read at runtime */
const REMOVED_NOTE = 'the sprite leaves the game at the next asset rebuild (the studio\'s Rebuild), which reads removed.json';
const INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
/** the largest drawn scale a sprite's art allows (newart.ts maxDrawScale: its picture's pixels at the closest zoom); four-view art takes the
 *  smallest of its four views, since a preset or a library size draws it in any of them; Infinity for a stand-in (it fills any footprint) */
const artLimit = (id: string) => Math.min(...(fourViews(id)?.views ?? [id]).map(v => { const i = INDEX.get(v); return i === undefined ? Infinity : maxDrawScale(i); }));
/** the message for a grow the picture's pixels refuse (as the studio refuses it) */
const refused = (id: string, lim: number) => `${id}: as big as its picture allows (drawn x${lim.toFixed(2)}): it pixelates above that`;

/** fetches a whitelisted file's text from the dev server */
async function load(file: string): Promise<string> {
  const r = await fetch(`/__dev/load?file=${encodeURIComponent(file)}`);
  if (!r.ok) throw new Error(`load ${file}: ${r.status}`);
  return r.text();
}
/** writes a whitelisted file through the dev server (atomic there) */
async function post(file: string, json: string): Promise<void> {
  const r = await fetch('/__dev/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file, json }) });
  if (!r.ok) throw new Error(`save ${file}: ${r.status} ${await r.text()}`);
}
/** the newest text waiting to be written, by file, and the write in flight: saves go one at a time, and quick edits coalesce into the newest
 *  text, so the file never ends on an older state than the editor holds */
const waiting = new Map<string, string>();
let writing: Promise<void> | null = null;
/** the newest text the editor gave each file: a hot reload of that text is the echo of its own save */
const latest = new Map<string, string>();
async function save(file: string, json: string): Promise<void> {
  waiting.set(file, json); latest.set(file, json);
  while (writing) await writing.catch(() => undefined);
  if (!waiting.has(file)) return;   // a later call wrote this file's newest text already
  const text = waiting.get(file)!; waiting.delete(file);
  writing = post(file, text).finally(() => { writing = null; });
  await writing;
}

/** installs the editor on a game and its overlay canvas (off until ?dev or the I key); returns the uninstall */
export function installLotEditor(game: Game, canvas: HTMLCanvasElement): () => void {
  let on = false, sel: Prop | null = null, everywhere = false, cursor: { mx: number; my: number } | null = null, message = '';
  const undo: Undo[] = [];

  // ---------- the outline and the panel (plain DOM, over the game)
  const outline = document.createElement('div');
  outline.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #38bdf8;box-shadow:0 0 0 1px #0c4a6e,0 0 12px #38bdf8;border-radius:3px;z-index:60;display:none';
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;right:12px;bottom:12px;width:330px;max-width:calc(100vw - 24px);z-index:61;display:none;background:rgba(12,18,28,.94);color:#e2e8f0;border:1px solid #38bdf8;border-radius:10px;padding:10px 12px;font:12px/1.45 ui-monospace,Consolas,monospace;box-shadow:0 6px 24px rgba(0,0,0,.5)';
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b style="color:#7dd3fc">DEV LOT EDITOR</b><span style="opacity:.7">I closes</span></div>
    <div data-k="info" style="white-space:pre-wrap;word-break:break-all;min-height:3.2em"></div>
    <label style="display:flex;gap:6px;align-items:center;margin:6px 0;cursor:pointer"><input data-k="every" type="checkbox"> this sprite everywhere (size, remove)</label>
    <div style="display:flex;gap:6px;margin:6px 0"><input data-k="pick" list="ce-dev-lib" placeholder="library id to add" style="flex:1;min-width:0;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:5px;padding:3px 6px"><button data-k="add" style="background:#0369a1;color:#fff;border-radius:5px;padding:2px 8px">Add at cursor</button></div>
    <datalist id="ce-dev-lib"></datalist>
    <div style="opacity:.75">[ ] size 5% · arrows move ¼ tile (Shift 1) · R turn · Del delete · Ctrl+D duplicate · Insert add · Esc deselect · Ctrl+Z undo</div>
    <div data-k="msg" style="margin-top:6px;color:#fcd34d;white-space:pre-wrap"></div>`;
  const $ = <T extends HTMLElement>(k: string) => panel.querySelector(`[data-k="${k}"]`) as T;
  const list = panel.querySelector('datalist')!;
  for (const it of LIBRARY) if (!it.id.startsWith('view:') && !it.id.startsWith('east:') && it.kind !== 'walker') { const o = document.createElement('option'); o.value = it.id; list.appendChild(o); }
  document.body.append(outline, panel);
  $<HTMLInputElement>('every').addEventListener('change', e => { everywhere = (e.target as HTMLInputElement).checked; (e.target as HTMLInputElement).blur(); render(); });
  $<HTMLButtonElement>('add').addEventListener('click', () => void addAtCursor());

  /** where a prop comes from: a lot's preset prop (Game.lotFrom), a lot's procedural piece, a player's prop, or an auto prop */
  function sourceOf(p: Prop): Source {
    if (!p.auto) return { kind: 'player' };
    if (!p.auto.startsWith('lot:')) return { kind: 'auto', tag: p.auto };
    const lot = p.auto.slice(4), from = game.lotFrom.get(p), at = game.lotOf(lot), lp = from && at ? lotPreset(at.g, at.st) : null;
    return lp && from && lp.preset.id === from.preset && lp.preset.props[from.prop] ? { kind: 'preset', lot, preset: lp.preset, index: from.prop, frame: lp.frame } : { kind: 'lot', lot };
  }
  function render() {
    panel.style.display = on ? 'block' : 'none';
    if (!on) { outline.style.display = 'none'; return; }
    let info = 'Click a sprite to select it.';
    if (sel) {
      const it = LIBRARY[sel.item]!, s = sourceOf(sel);
      const src = s.kind === 'preset' ? `lot ${s.lot}\npreset ${s.preset.id}${s.preset.curated ? ' (curated)' : ''}, prop ${s.index}`
        : s.kind === 'lot' ? `lot ${s.lot}: procedural (fence, street item, planting): not a preset's` : s.kind === 'player' ? 'a player-placed prop (the save)' : `an auto prop (${s.tag})`;
      const q = s.kind === 'preset' ? s.preset.props[s.index]! : null;
      info = `${it.id}\n${src}\nscale ${sel.scale.toFixed(3)}${q ? ` (preset ${q.scale} x owner ${ownerScaleOf(q.id)})` : ''} · view ${q ? q.view : '-'}${sel.flip ? ' · flipped' : ''}`;
    }
    $('info').textContent = info;
    $('msg').textContent = message;
  }
  const say = (m: string) => { message = m; render(); };
  function select(p: Prop | null) { sel = p; render(); }
  /** after the lots were composed again: the prop now drawn from the preset prop (the old Prop objects are gone) */
  function reselect(lot: string, preset: string, index: number) {
    sel = index < 0 ? null : game.propsOfLot(lot).find(p => { const f = game.lotFrom.get(p); return !!f && f.preset === preset && f.prop === index; }) ?? null;
    render();
  }
  /** composes every lot again (a library size changed), the selected lot's at once, and keeps the selection on its preset prop */
  function recomposeKeeping() {
    const lot = sel?.auto?.startsWith('lot:') ? sel.auto.slice(4) : null, from = sel ? game.lotFrom.get(sel) : undefined;
    game.recomposeLots(lot ? [lot] : []);
    if (lot && from) reselect(lot, from.preset, from.prop); else if (sel && !game.props.has(sel)) select(null); else render();
  }

  // ---------- the edits
  async function commitPreset(lot: string, before: LotPreset, after: LotPreset, index: number, what: string, undoIndex: number | null = index) {
    if (undoIndex !== null) undo.push({ kind: 'preset', before, lot, index: undoIndex });
    setLotPresets(replacePreset(lotPresets(), after));
    game.recomposeLots([lot]);
    reselect(lot, after.id, index);
    try { await save('lot-presets.json', formatPresets(lotPresets(), lotPresetsMeta())); say(`${what}: ${after.id} saved to lot-presets.json${after.curated ? " (curated)" : ""}; every lot drawn from it follows`); }
    catch (e) { say(`NOT SAVED: ${String(e)}`); }
  }
  async function presetEdit(s: Extract<Source, { kind: 'preset' }>, a: Act, dx: number, dy: number) {
    const q = s.preset.props[s.index]!, here = presetToWorld(s.frame, s.preset, q.x, q.y);
    let e: PresetEdit;
    if (a === 'bigger' || a === 'smaller') {
      // the drawn size (the preset's scale x the owner scale) never past the picture's pixels in any of its views
      const own = ownerScaleOf(q.id), lim = artLimit(q.id), next = growWithin(q.scale * own, a === 'bigger' ? GROW : 1 / GROW, lim);
      if (next === null) return say(refused(q.id, lim));
      e = { op: 'scale', prop: s.index, factor: next / (q.scale * own) };
    } else if (a === 'turn') e = { op: 'turn', prop: s.index, by: 1 };
    else if (a === 'delete') e = { op: 'delete', prop: s.index };
    else if (a === 'duplicate') { const n = worldToPreset(s.frame, s.preset, here.x + 0.5, here.y + 0.5, q); e = { op: 'duplicate', prop: s.index, dx: n.x - q.x, dy: n.y - q.y }; }
    else { const n = worldToPreset(s.frame, s.preset, here.x + dx, here.y + dy, q); e = { op: 'move', prop: s.index, x: n.x, y: n.y }; }
    const r = applyEdit(s.preset, e);
    if (r) await commitPreset(s.lot, s.preset, r.preset, r.prop, a, s.index);
  }
  async function libraryEdit(p: Prop, a: Act) {
    const it = LIBRARY[p.item]!, id = fourViews(it.id)?.views[0] ?? it.id;
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
      const text = await load('removed.json'), base = LIBRARY[INDEX.get(id) ?? p.item]!;
      await save('removed.json', studioJson(removeSprite(JSON.parse(text) as Record<string, unknown>, id, base, new Date().toISOString()))); undo.push({ kind: 'file', file: 'removed.json', text });
      say(`${id}: removed in removed.json; ${REMOVED_NOTE}`);
    } else say('this sprite everywhere: only its size ([ ]) and removal (Delete) apply');
  }
  function playerEdit(p: Prop, a: Act, dx: number, dy: number) {
    if (a === 'delete') { undo.push({ kind: 'player-del', item: p.item, x: p.x, y: p.y, scale: p.scale, flip: p.flip }); game.removeProp(p); game.scheduleSave(); select(null); say('removed (the save)'); game.emit(); return; }
    if (a === 'duplicate') { const c = game.addProp(p.item, p.x + 0.5, p.y + 0.5, p.flip, p.scale); undo.push({ kind: 'player-add', prop: c }); game.scheduleSave(); select(c); say('duplicated (the save)'); game.emit(); return; }
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
    if (!sel) return;
    try {
      if (everywhere) return await libraryEdit(sel, a);
      const s = sourceOf(sel);
      if (s.kind === 'preset') return await presetEdit(s, a, dx, dy);
      if (s.kind === 'player') return playerEdit(sel, a, dx, dy);
      say(s.kind === 'lot' ? 'a procedural lot piece: not one lot\'s to tune (tick "this sprite everywhere" for its size)' : 'an auto prop: tick "this sprite everywhere" for its size');
    } catch (e) { say(`failed: ${String(e)}`); }
  }
  /** adds the picker's library sprite at the cursor, in the selected lot's preset */
  async function addAtCursor() {
    const id = $<HTMLInputElement>('pick').value.trim();
    if (!INDEX.has(id)) return say(`not a library id: ${id || '(empty)'}`);
    const s = sel ? sourceOf(sel) : null;
    if (!s || s.kind !== 'preset') return say('select a sprite of a lot drawn from a preset first: the new one joins that preset');
    if (!cursor) return say('move the cursor over the lot first');
    const t = game.tileAt(cursor.mx, cursor.my), n = worldToPreset(s.frame, s.preset, t.x, t.y);
    const r = applyEdit(s.preset, { op: 'add', id, x: n.x, y: n.y });
    if (r) await commitPreset(s.lot, s.preset, r.preset, r.prop, `added ${id}`, -1);
  }
  async function undoLast() {
    const u = undo.pop();
    if (!u) return say('nothing to undo');
    try {
      if (u.kind === 'preset') {
        const now = lotPresets().find(p => p.id === u.before.id);
        await commitPreset(u.lot, now ?? u.before, u.before, u.index, 'undone', null);
      } else if (u.kind === 'file') { await save(u.file, u.text); u.restore?.(); say(`undone: ${u.file} restored`); }
      else if (u.kind === 'player') { Object.assign(u.prop, { item: u.item, x: u.x, y: u.y, scale: u.scale, flip: u.flip }); game.devPropChanged(u.prop); say('undone (the save)'); }
      else if (u.kind === 'player-del') { select(game.addProp(u.item, u.x, u.y, u.flip, u.scale)); game.scheduleSave(); game.emit(); say('undone: put back (the save)'); }
      else { game.removeProp(u.prop); game.scheduleSave(); select(null); game.emit(); say('undone: the copy removed (the save)'); }
    } catch (e) { say(`undo failed: ${String(e)}`); }
  }
  function toggle(v = !on) { on = v; if (!on) sel = null; message = on ? 'dev editor on: click a sprite' : ''; render(); }

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
    if (e.key === 'Insert') { stop(e); void addAtCursor(); return; }
    if (!sel) return;
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
    if (!on || e.target !== canvas || e.button !== 0) return;
    const p = game.propAt(e.offsetX, e.offsetY);
    // the panel's fields let go of the keys (stopping the event keeps the focus where it was)
    if (document.activeElement instanceof HTMLElement && panel.contains(document.activeElement)) document.activeElement.blur();
    if (p) { select(p); stop(e); } else if (sel) select(null);
  };
  const onMove = (e: PointerEvent) => { if (e.target === canvas) cursor = { mx: e.offsetX, my: e.offsetY }; };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove, true);
  // a hot reload of lot-presets.json: while the editor writes, or when it is the text the editor wrote last, it is the echo of its own saves
  // (the editor holds the same or newer presets) and is ignored; any other (the studio, a hand edit) replaces the presets, every lot composes
  // again, and the selection follows its preset prop
  const unReload = onLotPresetsReload((list, meta) => {
    if (writing || waiting.size || formatPresets(list, meta) === latest.get('lot-presets.json')) return;
    const lot = sel?.auto?.startsWith('lot:') ? sel.auto.slice(4) : null, from = sel ? game.lotFrom.get(sel) : undefined;
    setLotPresets(list, meta); game.recomposeLots(lot ? [lot] : []);
    if (lot && from) reselect(lot, from.preset, from.prop); else select(null);
    say('lot-presets.json changed on disk: the lots were composed again');
  });

  // the outline follows the selected sprite's picture every frame (the camera moves)
  let raf = 0;
  const r4 = [0, 0, 0, 0];
  const frame = () => {
    raf = requestAnimationFrame(frame);
    if (!on || !sel || !game.props.has(sel)) { outline.style.display = 'none'; return; }
    spriteRect(sel, r4);
    const b = canvas.getBoundingClientRect(), z = game.cam.z, sx = (X: number) => b.left + (X - game.cam.X) * z + game.cssW / 2, sy = (Y: number) => b.top + (Y - game.cam.Y) * z + game.cssH / 2;
    const x0 = sx(r4[0]), y0 = sy(r4[1]), x1 = sx(r4[2]), y1 = sy(r4[3]);
    // a sprite with no picture (a hidden stand-in) shows a ring at its anchor
    const wide = Math.max(14, x1 - x0), tall = Math.max(14, y1 - y0), ax = sx(worldX(sel.x, sel.y)), ay = sy(worldY(sel.x, sel.y));
    Object.assign(outline.style, { display: 'block', left: `${(x1 - x0 < 14 ? ax - 7 : x0) - 3}px`, top: `${(y1 - y0 < 14 ? ay - 7 : y0) - 3}px`, width: `${wide}px`, height: `${tall}px` });
  };
  raf = requestAnimationFrame(frame);
  if (new URLSearchParams(location.search).has('dev')) toggle(true);

  return () => {
    cancelAnimationFrame(raf); unReload();
    window.removeEventListener('keydown', onKey, true); window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('pointermove', onMove, true);
    outline.remove(); panel.remove();
  };
}
