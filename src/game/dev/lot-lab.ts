// The lot lab (dev builds only: ?lotlab; the studio's Lot presets tab frames it): ONE lot on ONE street, composed by the real game as it would
// compose a lot of that type, state, size and road angle (Game.stageLab / restageLab), building, fence and all. The dev editor (lot-editor.ts)
// edits it on the map; Save writes it as a lab preset (a draft, in memory until saved); Approve makes the game draw it on the matching lots
// (compose.ts). The panel on the left picks the lot (type, state, size, road angle, variant; Generate is random unless locked), lists the cells
// of this type and state and the presets made here, and adds sprites from the library. Round the lot and its road lies the map's own grass (no
// forest or farms near: stageLab), and the camera fits the lot and its road (zoom at least LAB_ZOOM, or the fit zoom of a lot too big for that). PAINT GROUND: a drag on the
// lot paints a ground rectangle into its preset and Erase removes the patch under a click (the editor's pointer handling is paused meanwhile). DECALS: a
// whole preset's flat ground decals (leaves, litter, stains): a thumbnail arms placing it on the lot, Select decals picks, moves, scales and mirrors them.
// A generated lot is whole: the game draws its fences, street items and decals from the preset alone (compose.ts).
// SIZE: the W and D steppers under the size select resize the current preset (fitted, curated, staged again at the new size). PERSON CURSOR:
// a townsperson stands at the pointer over the map, at the game's scale, for scale (its feet on the point under the pointer).
// Farm: a farm parcel, the game's own farm for the variant's seed, or an approved farm preset. The lab's place (type, state, size, road, locks
// and the current preset, and whether the person cursor, the lot grid and the neighbours are on) is kept across a page reload (sessionStorage 'ce-lotlab'). Keys: g next variant, G previous, Ctrl+S save, Ctrl+Enter
// approve and next gap, Esc paint off, L lot grid, N neighbours; the editor's keys (lot-editor.ts: Shift+click, the box, H, Ctrl+C / Ctrl+V...) and
// the game's own are left alone.
// T148: GENERATE stays on this lot (its type, state, size and road angle) and rolls a new layout (another variant, a new seed, a new building of
// the same size class: lot-lab-plan.ts, lot-houses.ts); NEW LOT is the old Generate (a random size and road angle as the locks allow). The
// editor is kept to the lab lot (editorOnly): a plain drag on its ground draws the selection box. LOT GRID (L): the lot's boundary and cells (and
// the neighbours' boundaries) on the ground under the sprites (lot-grid.ts, Game.devGround). NEIGHBOURS (N): the lots round this one on its
// street (two each way, three across), composed as the game would, for context (never edited; not for a farm).
import type { Game } from '../engine';
import { CLASS } from '../network';
import { ATLAS_PAGES, ATLAS_SIZE, LIBRARY } from '../library';
import type { LibItem } from '../types';
import { drawnAsStandIn, lookOf } from '../newart';
import { spriteRect, type Drawable } from '../sprites';
import { footprintOf, ownerScaleOf } from '../lots/preset-art';
import { worldX, worldY, ZOOM_MAX, ZOOM_MIN } from '../iso';
import { composeFarm, type FarmParcel } from '../ext/farms/farms';
import type { ComposeState, LotGeom } from '../lots/compose-core';
import { compose, lotPresets, setLotPresets } from '../lots/compose';
import { approvedFor, bucketOf, fitPreset, presetsFor, WHOLE_FRONT, type LotPreset, type PresetDecal, type PresetPatch, type PresetState, type PresetUse, type Road } from '../lots/presets';
import { frameOf, quarterOfRoad, toFrame, toWorld, type Pt, type PresetFrame } from '../lots/preset-frame';
import { presetFromComposition } from '../lots/preset-from';
import { LU, LV } from '../lots/town';
import { LOT_DECALS, type LotDecal } from '../lot-decals';
import decalSheet from '../../assets/ground/lot-decals.webp';
import { replacePreset } from './lot-edit';
import { armPlacing, editorAct, editorDeselect, editorOnly, editorText, pauseEditor, saveLotPresets, thumb, type LabAct } from './lot-editor';
import { mainBuilding, swapHouse } from './lot-select';
import { artLimit, frameHalf, isHouseLike, otherHouse } from './lot-houses';
import { neighbourLots, planInPlace, planNewLot, type Neighbour } from './lot-lab-plan';
import { LotGridLayer, type GridLot } from './lot-grid';

/** the panel's width (px): the lot is composed right of it (the camera shifts by half of it) */
const PANEL_W = 340;
/** the least zoom the lab keeps (Camera.z): the lot stays big enough to edit (a lot too big for it keeps its fit zoom, see keepCam) */
const LAB_ZOOM = 0.12;
/** the dev editor's panel (bottom-right, EDITOR_W px wide): the free area stops short of it on a window wider than EDITOR_MIN px */
const EDITOR_W = 352, EDITOR_MIN = 1100;
/** the space (px) the fitted lot keeps clear of the free area's edges */
const FIT_MARGIN = 40;
/** tiles of the road the camera fit keeps in view past each end of the lot */
const MARGIN = 8;
/** the palette's page: sprites shown at a time (More adds one) */
const PAGE = 120;
/** the library categories the palette leaves out (the people) */
const SKIP_CAT = new Set(['Townspeople', 'Spectators', 'Golfers']);
/** a use's name in the panel and the messages */
const USE_NAME: Record<PresetUse, string> = { res: 'residential', com: 'commercial', ind: 'industrial', park: 'car park', tour: 'tour shop', civic: 'civic', farm: 'farm' };
/** the big type toggles, and the types in the select */
const TYPES: [PresetUse, string][] = [['res', 'Residential'], ['com', 'Commercial'], ['ind', 'Industrial'], ['farm', 'Farm']], MORE: PresetUse[] = ['park', 'tour', 'civic'];
/** the farm sizes (the Farm type): a parcel's frontage and depth (tiles), named as the panel shows them */
const FARM_SIZES = [{ key: '40x60', w: 40, d: 60, name: 'Small' }, { key: '56x100', w: 56, d: 100, name: 'Medium' }, { key: '80x150', w: 80, d: 150, name: 'Large' }];
/** the look states of the toggles */
const STATES: [PresetState, string][] = [['built', 'Built'], ['upgraded', 'Upgraded'], ['declined', 'Declined']];
/** the types, road angles and look states a stored place may name (pick: the stored value when it is one of them, else the default) */
const USES: PresetUse[] = [...TYPES.map(([u]) => u), ...MORE], ROADS: Road[] = [0, 1, 2, 3, 4, 5, 6, 7], STATE_KEYS: PresetState[] = STATES.map(([s]) => s);
/** the sessionStorage key of the lab's place (type, state, size, road, locks, the current preset) */
const SESSION = 'ce-lotlab';
/** the editor's idle selection line (lot-editor.ts render): the lab shows no "Selected" line for it */
const EDITOR_IDLE = 'Click a sprite to select it.';
/** the editor's selection line for the lab's panel ("Selected: ..."), '' while the editor is off or nothing is selected */
const selLine = (): string => { const i = editorText().info; return i && i !== EDITOR_IDLE ? `Selected: ${i}` : ''; };
/** each road's arrow (where its street is on screen), by road (presets.ts Road) */
const ARROW = ['↙', '↓', '↘', '→', '↗', '↑', '↖', '←'];
/** each road's words, by road: the messages and the tooltips */
const ROAD_WORDS: readonly string[] = ['the street bottom-left (along map +y)', 'the street at the bottom (a diagonal road)', 'the street bottom-right (along map +x)', 'the street at the right (a diagonal road)', 'the street top-right (along map -y)', 'the street at the top (a diagonal road)', 'the street top-left (along map -x)', 'the street at the left (a diagonal road)'];
/** the compass grid, row by row: the road of each button (null: the lot itself) */
const COMPASS: (Road | null)[] = [6, 5, 4, 7, null, 3, 0, 1, 2];
/** the panel's colours (as lot-editor.ts): a button, a lit button, a field */
const BTN = 'background:#1e293b;color:#e2e8f0;border:1px solid #334155;', ON = 'background:#0369a1;color:#fff;border:1px solid #38bdf8;';
const SEL = 'width:100%;box-sizing:border-box;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:5px;padding:3px 6px;font:inherit';
/** the map mask's SVG namespace */
const SVGNS = 'http://www.w3.org/2000/svg';
/** a size of this type and state: its bucket (key, tiles) and the lot size it is composed at (tiles); a farm size has its name */
interface Size { key: string; bw: number; bd: number; w: number; d: number; name?: string }
/** the draft in memory: its preset, and whether it is saved (the editor replacing it counts: the editor wrote the file) */
interface Draft { id: string; obj: LotPreset; saved: boolean }
/** a ground swatch of the PAINT GROUND row: a patch's kind and texture, and its name on the button */
interface Swatch { name: string; kind: PresetPatch['kind']; tex: string }
/** the ground swatches, in the row's order (asphalt and pavement and more: the game's ground textures) */
const SWATCHES: Swatch[] = [{ name: 'Asphalt', kind: 'drive', tex: 'asphalt' }, { name: 'Pavement', kind: 'walk', tex: 'paving' }, { name: 'Concrete', kind: 'yard', tex: 'concrete' }, { name: 'Slabs', kind: 'walk', tex: 'slabs' }, { name: 'Gravel', kind: 'yard', tex: 'gravel' }, { name: 'Dirt', kind: 'yard', tex: 'dirt' }];
/** the farm sizes as the sizes of the Farm type (a farm has no buckets: its own size is its bucket) */
const FARM_LIST: Size[] = FARM_SIZES.map(f => { const b = bucketOf(f.w, f.d); return { key: f.key, bw: b.w, bd: b.d, w: f.w, d: f.d, name: f.name }; });
/** the decal sheet's size (px: lot-decals.webp as prep-decals.mjs writes it), a thumbnail's inside size (px), and the decal groups in the sheet's order */
const SHEET_W = 2048, SHEET_H = 1180, THUMB_PX = 46, DECAL_GROUPS = [...new Set(LOT_DECALS.map(d => d.group))];
/** a value kept within [lo, hi] */
const within = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** a decal's thumbnail (THUMB_PX square inside its border): its rectangle of the sheet scaled to fit and centred on the tile */
function decalThumb(t: HTMLElement, d: LotDecal) { const k = THUMB_PX / Math.max(d.w, d.h); Object.assign(t.style, { backgroundImage: `url(${decalSheet})`, backgroundSize: `${SHEET_W * k}px ${SHEET_H * k}px`, backgroundPosition: `${(THUMB_PX - d.w * k) / 2 - d.x * k}px ${(THUMB_PX - d.h * k) / 2 - d.y * k}px` }); }

/** a lot's size bucket key (bw x bd, tiles) */
const bkey = (w: number, d: number) => { const b = bucketOf(w, d); return `${b.w}x${b.d}`; };
/** the frozen presets (no road): the pool a lot not made in the lab draws from */
const legacy = () => lotPresets().filter(p => p.road === undefined);
/** the lab presets (a road set): drafts and approved ones */
const lab = () => lotPresets().filter(p => p.road !== undefined);
/** the compose use of a preset use (town.ts LU): a car park is a commercial lot; a farm draws alone (no use: its forced preset) */
const luOf = (u: PresetUse) => (u === 'res' ? LU.RES : u === 'ind' ? LU.IND : u === 'tour' ? LU.TOUR : u === 'civic' ? LU.GOV : u === 'farm' ? LU.NONE : LU.COM);
/** the compose level and decline of a look state (town.ts LV): declined is a built lot at decline 2 */
const levelOf = (s: PresetState) => (s === 'upgraded' ? { level: LV.UPGRADED, decline: 0 } : { level: LV.BUILT, decline: s === 'declined' ? 2 : 0 });
/** a variant's seed for a use: a car park needs seed % 100 < 15, a shop seed % 100 >= 15 (compose.ts); the others any seed */
const seedOf = (u: PresetUse, v: number) => (u === 'park' ? ((v % 15) + 15) % 15 : u === 'com' ? 15 + (((v * 7) % 85) + 85) % 85 : 1 + (((v * 7) % 997) + 997) % 997);
/** a DOM element with inline style and text (textContent: no markup from ids or names) */
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, css = '', text = ''): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); e.style.cssText = css; e.textContent = text; return e; };
/** a button: its style, its text, its click handler (the handlers wrap their own failures) and a title */
const btn = (text: string, css: string, on: () => unknown, title = '') => { const b = el('button', `cursor:pointer;font:inherit;border-radius:5px;padding:3px 8px;${css}`, text); b.title = title; b.addEventListener('click', () => { on(); }); return b; };
/** a section heading */
const heading = (text: string) => el('div', 'color:#7dd3fc;font-weight:700;letter-spacing:.04em;margin:10px 0 4px', text);
/** a field that takes typing (the search, the selects, the game's own inputs): its keys are its own; a checkbox or a button is not one */
const typing = (t: EventTarget | null) => t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'range'].includes(t.type)) || (t instanceof HTMLElement && t.isContentEditable);
/** a stored value when it is one of the list, else the default */
const valueOr = <T extends string | number>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
/** whether a point (x, y) lies inside a polygon given as x, y pairs (the even-odd rule) */
const inPoly = (pts: readonly number[], x: number, y: number): boolean => { let inside = false; for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) { const xi = pts[i]!, yi = pts[i + 1]!, xj = pts[j]!, yj = pts[j + 1]!; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; } return inside; };
/** a frame coordinate snapped to half tiles and kept in [0, hi] (a paint point: the lot's frame, tiles) */
const snapHalf = (v: number, hi: number) => Math.min(hi, Math.max(0, Math.round(v * 2) / 2));
/** the free area on screen (viewport px): right of the panel, the window's top and bottom, and left of the dev editor's panel on a wide window */
const freeArea = () => ({ L: PANEL_W, T: 0, R: innerWidth - (innerWidth > EDITOR_MIN ? EDITOR_W : 0), B: innerHeight });
/** the view's subject in world px: the box around the lot and the road strip in front of it (MARGIN tiles past each end), which the camera fits */
function holeBox(g: LotGeom): { x0: number; y0: number; x1: number; y1: number } {
  const depth = 2 * CLASS.street.h + CLASS.street.walk, b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const C: [number, number][] = [[0, 0], [g.w, 0], [g.w, g.d], [0, g.d], [-MARGIN, -depth], [g.w + MARGIN, -depth], [g.w + MARGIN, 0], [-MARGIN, 0]];
  for (const [k, l] of C) { const x = g.o.x + g.u.x * k + g.n.x * l, y = g.o.y + g.u.y * k + g.n.y * l, X = worldX(x, y), Y = worldY(x, y); b.x0 = Math.min(b.x0, X); b.y0 = Math.min(b.y0, Y); b.x1 = Math.max(b.x1, X); b.y1 = Math.max(b.y1, Y); }
  return b;
}

/** the person cursor's sprite: an adult townsperson (the studio's own scale person, base_man; else the first adult 3d person, else the first walker; -1 when there is none), its owner scale, and its footprint (tiles from the anchor, as lot-editor.ts drawable builds it) */
const PERSON_I = (() => { for (const f of [(id: string) => id === 'person:3d:base_man', (id: string) => id.startsWith('person:3d:') && !/kid|child|boy|girl/.test(id)]) { const i = LIBRARY.findIndex(it => f(it.id)); if (i >= 0) return i; } return LIBRARY.findIndex(it => it.kind === 'walker'); })();
const PERSON_S = PERSON_I < 0 ? 1 : ownerScaleOf(LIBRARY[PERSON_I]!.id);
const PERSON_FP: readonly number[] = PERSON_I < 0 ? [-0.5, -0.5, 0.5, 0.5] : footprintOf(LIBRARY[PERSON_I]!.id, PERSON_S, false);
/** the person's Drawable and its screen-independent rectangle (world px): both reused each frame, so the frame allocates nothing for them */
const personD: Drawable = { item: PERSON_I, x: 0, y: 0, flip: false, scale: PERSON_S, x0: 0, y0: 0, x1: 0, y1: 0 }, PERSON_R: number[] = [0, 0, 0, 0];
/** paints a library sprite's atlas picture over an element of w x h px (lot-editor.ts paint: the picture's rectangle of its page, mip 1) */
function paintPic(node: HTMLElement, it: LibItem, w: number, h: number) {
  const [page, u0, v0, u1, v1] = it.tex, P = ATLAS_SIZE / 2, kx = w / Math.max(1e-6, (u1 - u0) * P), ky = h / Math.max(1e-6, (v1 - v0) * P);
  Object.assign(node.style, { backgroundImage: `url(${ATLAS_PAGES[page]![1]})`, backgroundSize: `${P * kx}px ${P * ky}px`, backgroundPosition: `${-u0 * P * kx}px ${-v0 * P * ky}px`, backgroundRepeat: 'no-repeat' });
}

/** installs the lot lab on a game (dev builds, ?lotlab): the panel, the map mask, the keys, the ground painting; returns the uninstall (panel, style, mask, listeners, timers) */
export function installLotLab(game: Game): () => void {
  /** the model: the type, state, size (a bucket key), road angle and variant the lot is composed with */
  let use: PresetUse = 'res', state: PresetState = 'built', size = '', road: Road = 0, variant = 0;
  /** the preset the lot draws now, the draft in memory, what the engine has staged (its road, size and the state it was staged with: a full stage when the road or size change), its geometry, and the zoom the lot fits at */
  let current: string | null = null, draft: Draft | null = null, staged: { road: Road; w: number; d: number; st: ComposeState } | null = null, geo: LotGeom | null = null, fitZ = LAB_ZOOM;
  /** the last action's message, the last generate's source line, the Generate locks, the palette's search, category and page */
  let message = '', source = '', lockAngle = false, lockSize = false, search = '', cat = 'All', shown = PAGE;
  /** started once the game is ready; the signature of what the panel shows (the 1.5 s check draws it only when it changed); the mask's last key; the timers and the frame */
  let started = false, sigLast = '', maskKey = '', live = 0, raf = 0;
  /** the ground painting: the mode (a swatch, Erase, or null: off) and the drag in progress (its preset, swatch, size, the press point and the point now, in the lot's frame) */
  let paint: Swatch | 'erase' | null = null;
  let paintDrag: { id: string; sw: Swatch; w: number; d: number; x0: number; y0: number; x1: number; y1: number } | null = null;
  /** the decal mode: 'place' (a press on the lot adds the armed decal decalId; Shift keeps placing) or null (off: a click on a decal selects it,
   *  through the editor, with the sprites) */
  let decalMode: 'place' | null = null, decalId = '';
  /** the person cursor: on (a townsperson at the pointer over the map), and the pointer's last point (client px) while it is over the map (null off it) */
  let personOn = false, pointer: { x: number; y: number } | null = null;
  /** the Lot grid (L) and the Neighbours (N) toggles; the neighbours staged now (for the grid); the last Generate's seed number (planInPlace) */
  let gridOn = false, neighOn = false, neighs: Neighbour[] = [], seedNum = 0;
  /** what the staged neighbours were made for (type, state, lot size, road, place; '' none): neighbours() stages them again only when it changed */
  let neighKey = '';
  /** the Lot grid's layer and the lots it outlines (made again when the lot, the neighbours or the toggle change; the frame hook reads it) */
  const gridLayer = new LotGridLayer();
  let gridLots: GridLot[] = [];
  /** the editor's words as the lab last saw them (the selection line, the message): the refresh shows a change */
  let emInfo = '', emMsg = '';

  // ---------- the DOM: a style hiding the game's HUD and the editor's own panel (its words show under THIS PRESET), the map mask (an SVG: the hole and the paint preview), the panel on the left (plain DOM, as lot-editor.ts)
  const style = document.createElement('style');
  style.textContent = '#root > div > :not(canvas){display:none!important}#ce-dev-editor-panel{display:none!important}';
  // the paint layer: an SVG over the map for the paint drag's rectangle (the map round the lot is the map's own grass: stageLab clears the
  // forest and the farms there, so nothing else stands near the lot)
  const mask = document.createElementNS(SVGNS, 'svg'), preview = document.createElementNS(SVGNS, 'path');
  mask.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:55;display:none';
  preview.setAttribute('fill', 'rgba(56,189,248,.35)'); preview.setAttribute('stroke', '#38bdf8');
  mask.append(preview);
  const panel = document.createElement('div');
  panel.style.cssText = `position:fixed;left:0;top:0;bottom:0;width:${PANEL_W}px;box-sizing:border-box;overflow:auto;z-index:62;display:none;background:rgba(12,18,28,.94);color:#e2e8f0;border-right:1px solid #38bdf8;padding:10px 12px;font:12px/1.45 ui-monospace,Consolas,monospace;box-shadow:6px 0 24px rgba(0,0,0,.5)`;
  const typeBox = el('div'), sizeBox = el('div'), roadBox = el('div'), genSrc = el('div', 'color:#94a3b8;font-size:11px;white-space:pre-wrap;min-height:1.4em;margin-top:4px');
  const curBox = el('div'), covBox = el('div'), hereBox = el('div'), paintBox = el('div'), msgBox = el('div', 'color:#fcd34d;white-space:pre-wrap;margin-top:8px;min-height:1.4em');
  /** a labelled checkbox: set on a change, the panel drawn */
  const check = (text: string, on: boolean, set: (v: boolean) => void) => { const l = el('label', 'display:flex;gap:4px;align-items:center;cursor:pointer'), c = el('input'); c.type = 'checkbox'; c.checked = on; c.addEventListener('change', () => { set(c.checked); render(); }); l.append(c, text); return l; };
  /** the palette's search field, its category select, the thumbnails and the More button */
  const findBox = el('input', SEL); findBox.placeholder = 'search the id or name';
  findBox.addEventListener('input', () => { search = findBox.value; shown = PAGE; renderGrid(); });
  const cats = el('select', SEL); cats.append(new Option('All', 'All'));
  for (const c of [...new Set(LIBRARY.map(i => i.cat))].filter(c => !SKIP_CAT.has(c)).sort()) cats.append(new Option(c, c));
  cats.addEventListener('change', () => { cat = cats.value; shown = PAGE; renderGrid(); });
  const grid = el('div', 'display:flex;flex-wrap:wrap;gap:4px;margin-top:6px');
  const morePal = btn('More', `${BTN}margin-top:6px;width:100%;display:none`, () => { shown += PAGE; renderGrid(); });
  /** the DECALS section: the mode row (drawn by renderDecals), the group select and the decal thumbnails of the group (drawn by showDecals) */
  const decalBar = el('div'), decalGroupSel = el('select', SEL), decalGrid = el('div', 'display:flex;flex-wrap:wrap;gap:4px;margin-top:6px');
  decalGroupSel.append(new Option('All', 'All'), ...DECAL_GROUPS.map(g => new Option(g, g)));
  decalGroupSel.addEventListener('change', () => { showDecals(); });
  /** the edit row: the editor's actions on the selection (one sprite or decal, or many); Change house goes back with Shift held */
  const edit = el('div', 'display:flex;flex-wrap:wrap;gap:4px');
  const EDITS: [LabAct, string, string][] = [['turn', 'Turn (R)', 'each selected sprite a quarter turn; a decal mirrors'], ['house', 'Change house (H)', 'the selected house (nothing selected: the lot\'s house) for another of its family and size class, on its spot; Shift+click or Shift+H: the one before'],
    ['delete', 'Delete (Del)', ''], ['bigger', 'Bigger (])', ''], ['smaller', 'Smaller ([)', ''], ['duplicate', 'Duplicate (Ctrl+D)', 'a copy beside it, selected'],
    ['copy', 'Copy (Ctrl+C)', 'the selection: its layout, sizes, turns and mirrors'], ['paste', 'Paste (Ctrl+V)', 'what was copied, at the pointer\'s last point on the lot (this lot or the next one you open), left selected'], ['undo', 'Undo (Ctrl+Z)', '']];
  for (const [a, t, tip] of EDITS) {
    const b = el('button', `cursor:pointer;font:inherit;border-radius:5px;${BTN}padding:3px 6px`, t); b.title = tip;
    b.addEventListener('click', e => { const k: LabAct = a === 'house' && e.shiftKey ? 'house-back' : a; void act(() => { if (!editorAct(k)) message = 'the map editor is not on yet'; }); });
    edit.append(b);
  }
  /** the view toggles (Person cursor, Lot grid, Neighbours: drawn by renderPerson), and the person's sprite: a fixed element over the map (above the mask, under the panel), no pointer events */
  const personBox = el('div', 'margin-top:4px'), personEl = el('div', 'position:fixed;left:0;top:0;display:none;pointer-events:none;z-index:58;background-repeat:no-repeat');
  /** the editor's selection line, under THIS PRESET (drawn by render: selLine) */
  const selBox = el('div', 'color:#94a3b8;font-size:11px;white-space:pre-wrap;margin-top:4px');
  /** the generate row: the previous variant, Generate (this lot again, a new layout) and New lot (a random size and road angle unless locked) */
  const gen = el('div', 'display:flex;gap:6px;margin-top:6px');
  gen.append(btn('◀ Variant', `flex:1;${BTN}`, () => act(() => generate(-1)), 'the previous variant (Shift+G)'),
    btn('Generate ▶', `flex:1;${ON}`, () => act(generateHere), 'this lot again (its type, size and road angle): a new layout, seed and building'),
    btn('New lot ▶', `flex:1;${BTN}`, () => act(newLot), 'a random size and road angle, as the locks allow; both locked: the next variant'));
  const locks = el('div', 'display:flex;gap:12px;margin-top:4px');
  panel.append(
    el('div', 'font-weight:700;color:#7dd3fc;font-size:14px', 'LOTS'),
    el('div', 'opacity:.8', 'Compose a lot as the game would, edit it on the map, save it, approve it.'),
    el('div', 'opacity:.6;font-size:11px', 'g next variant · G previous · Ctrl+S save · Ctrl+Enter approve & next gap · Esc paint off / clear · L lot grid · N neighbours · Shift+click add/remove · drag on the ground: box select · arrows move · R turn · H change house (Shift+H back) · Del · [ ] size · Ctrl+C / Ctrl+V copy, paste at the pointer · Ctrl+D duplicate · Ctrl+Z undo'),
    personBox,
    heading('TYPE AND STATE'), typeBox, heading('SIZE'), sizeBox, heading('ROAD ANGLE'), roadBox,
    heading('GENERATE'), gen, el('div', 'opacity:.6;font-size:11px;margin-top:2px', 'The locks hold New lot\'s size and road angle.'), locks, genSrc,
    heading('THIS PRESET'), curBox, selBox,
    heading('EDIT THE SELECTION'), edit,
    el('div', 'opacity:.75;margin-top:4px', 'Click a sprite on the lot (fences, bins and mailbox too) or a leaf pile or other decal to select it; Shift+click adds or removes one; a drag on the lot\'s ground draws a box round several. Drag any selected one (or the arrows) to move them together; Esc clears. Ctrl+C copies, Ctrl+V pastes at the pointer, here or on the next lot. New decals: the DECALS list. (Leaves outside the lot belong to the map grass, not to the lot.)'),
    heading('PAINT GROUND'), paintBox, heading('DECALS'), decalBar, decalGroupSel, decalGrid,
    heading('ADD A SPRITE'), findBox, cats, grid, morePal,
    heading('COVERAGE (THIS TYPE AND STATE)'), covBox,
    heading('PRESETS HERE (THIS SIZE AND ROAD ANGLE)'), hereBox,
    msgBox);

  // ---------- the model's helpers
  /** the draft counts as saved once it is written, or once the editor replaced it (an edit, which the editor wrote to disk) */
  function draftSaved(): boolean { const d = draft; return !!d && (d.saved || lotPresets().find(p => p.id === d.id) !== d.obj); }
  /** the draft (not yet on disk) with this id */
  function unsaved(id: string): boolean { return draft?.id === id && !draftSaved(); }
  /** removes the unsaved draft from the presets (it is not kept); the draft is gone from the model */
  function dropDraft() { const d = draft; if (d && !draftSaved()) setLotPresets(lotPresets().filter(p => p.id !== d.id)); draft = null; }
  /** the sizes of this type and state: a farm's three (FARM_LIST); else the buckets of the frozen and lab presets, each with its lot size (the first frozen preset's, else the first lab preset's), by width then depth */
  function sizes(): Size[] {
    if (use === 'farm') return FARM_LIST;
    const m = new Map<string, Size>();
    for (const p of [...legacy(), ...lab()]) if (p.use === use && p.state === state) { const b = bucketOf(p.w, p.d), k = `${b.w}x${b.d}`; if (!m.has(k)) m.set(k, { key: k, bw: b.w, bd: b.d, w: p.w, d: p.d }); }
    return [...m.values()].sort((a, b) => a.bw - b.bw || a.bd - b.bd);
  }
  /** a size as the panel shows it: 'Small 40 × 60' for a farm, '10 × 16' for a lot */
  const sizeLabel = (s: Size) => `${s.name ? `${s.name} ` : ''}${s.bw} × ${s.bd}`;
  /** the size the lot is composed at now: the size's entry, else the first size of this type and state */
  function sizeNow(): Size | undefined { const l = sizes(); return l.find(s => s.key === size) ?? l[0]; }
  /** the lab presets of this type and state in a cell: a bucket key and a road (null: any road) */
  function cell(key: string, r: Road | null): LotPreset[] { return lab().filter(p => p.use === use && p.state === state && bkey(p.w, p.d) === key && (r === null || p.road === r)); }
  /** how many approved lab presets a cell has */
  function approvedIn(key: string, r: Road | null): number { return cell(key, r).filter(p => p.approved).length; }
  /** the presets a lot of w x d on the road draws from: the approved lab presets of the road (approvedFor; a farm: any approved farm); else the frozen presets of this type and state (diagonal on an odd road: the game draws a green there today) */
  function candidates(w: number, d: number): { list: LotPreset[]; kind: 'approved' | 'frozen' | 'diagonal' } {
    const ap = approvedFor(lotPresets(), use, state, w, d, road);
    return ap.length ? { list: ap, kind: 'approved' } : { list: presetsFor(legacy(), use, state, w, d), kind: road % 2 ? 'diagonal' : 'frozen' };
  }
  /** whether the staged lot is this w x d on this road (then the street and the lot stay, and only the lot is composed again) */
  const lotSame = (w: number, d: number) => !!staged && staged.road === road && staged.w === w && staged.d === d;
  /** composes the lab lot with st: the street and the lot are staged again only when the road or size changed (then the camera fits the lot and its road); else the same street, composed again */
  function stage(w: number, d: number, st: ComposeState) {
    const fresh = !lotSame(w, d);
    // the editor lets go of its selection: the lot draws another preset now
    editorDeselect();
    if (fresh) { geo = game.stageLab({ road, w, d, st }).g; maskKey = ''; } else game.restageLab(st);
    staged = { road, w, d, st };
    if (fresh) fitCam();
    // a fresh stage cleared the map: the neighbours again; else only when the type or state changed (a restage keeps them, their ground baked)
    neighbours(fresh);
  }
  /** the neighbours' use for a lab type (a street of shops round a car park or a tour shop, houses round a civic building), and their seed base:
   *  the same for the same type, state, size and road, so Generate shows a new layout among the same neighbours */
  const neighUse = (u: PresetUse): PresetUse => (u === 'park' || u === 'tour' ? 'com' : u === 'civic' ? 'res' : u);
  const neighSeed = () => { let h = 7; for (const c of `${use}|${state}|${staged?.w}x${staged?.d}|${road}`) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0; return h % 9973; };
  /** the Neighbours (N): the lots round the lab lot on its street (lot-lab-plan.ts neighbourLots: two each way, three across), of its type
   *  (neighUse) and state, each as wide as a size of that type at the lab lot's depth (picked by the seed base), composed as the game composes a
   *  lot there (its approved presets of the road, else the frozen pool); none when off, for a farm, or with no lot staged. Staged again only when
   *  what they depend on changed (or force: the map was cleared). The grid follows */
  function neighbours(force = false) {
    const g = geo, key = neighOn && g && use !== 'farm' ? `${use}|${state}|${g.w}x${g.d}|${road}|${g.o.x},${g.o.y}` : '';
    if (!force && key === neighKey) return;
    neighKey = key;
    if (!key || !g) { if (neighs.length && !force) game.stageLabNeighbours([]); neighs = []; syncGrid(); return; }
    const nu = neighUse(use), bd = bucketOf(g.w, g.d).d, base = neighSeed();
    const ws = [...legacy(), ...lab()].filter(p => p.use === nu && p.state === state && bucketOf(p.w, p.d).d === bd).map(p => p.w).filter(w => w >= 8 && w <= 24);
    const widths = ws.length ? [...new Set(ws)].sort((a, b) => a - b) : [g.w];
    neighs = neighbourLots(g, 2 * (CLASS.street.h + CLASS.street.walk), k => widths[(base + k * 5) % widths.length]!);
    game.stageLabNeighbours(neighs.map((nb, k) => ({ key: nb.key, g: nb.g, st: { use: luOf(nu), ...levelOf(state), seed: seedOf(nu, base + 11 * k) } })));
    syncGrid();
  }
  /** the Lot grid's lots (L): the lab lot with its cells, and the neighbours' boundaries when they are shown; none when the grid is off */
  function syncGrid() {
    const g = geo;
    gridLots = gridOn && g ? [{ o: g.o, u: g.u, n: g.n, w: g.w, d: g.d, cells: true, alpha: 0.95 }, ...neighs.map(nb => ({ ...nb.g, cells: false, alpha: 0.6 }))] : [];
    game.emit();
  }
  /** the map's centre on screen (viewport px): where the camera's X, Y sit (the canvas's centre) */
  function origin(): { x: number; y: number } { const b = game.canvas.getBoundingClientRect(); return { x: b.left + game.cssW / 2, y: b.top + game.cssH / 2 }; }
  /** the camera centred so a world point (px) sits at the free area's centre (the zoom kept) */
  function centreOn(wx: number, wy: number) { const a = freeArea(), o = origin(), z = game.cam.z; game.cam.X = wx - ((a.L + a.R) / 2 - o.x) / z; game.cam.Y = wy - ((a.T + a.B) / 2 - o.y) / z; }
  /** the camera on the lot and its road, after a fresh stage: the largest zoom (at most ZOOM_MAX) at which the lot and its road fit the free area with FIT_MARGIN px to spare, and the hole's centre at the area's centre */
  function fitCam() {
    const g = geo; if (!g) return;
    const h = holeBox(g), a = freeArea(), z = Math.min(ZOOM_MAX, (a.R - a.L - 2 * FIT_MARGIN) / (h.x1 - h.x0), (a.B - a.T - 2 * FIT_MARGIN) / (h.y1 - h.y0));
    fitZ = Math.max(ZOOM_MIN, z); game.cam.z = fitZ; centreOn((h.x0 + h.x1) / 2, (h.y0 + h.y1) / 2); game.emit();
  }
  /** the camera stays on the lot: its zoom never below the floor (LAB_ZOOM, or the fit zoom of a lot too big for it), and the lot centred back in the free area once its centre has left it */
  function keepCam() {
    const g = geo, c = game.cam;
    if (!g) return;
    if (c.z < Math.min(LAB_ZOOM, fitZ)) c.z = Math.min(LAB_ZOOM, fitZ);
    const tx = g.o.x + (g.u.x * g.w + g.n.x * g.d) / 2, ty = g.o.y + (g.u.y * g.w + g.n.y * g.d) / 2, wx = worldX(tx, ty), wy = worldY(tx, ty);
    const a = freeArea(), o = origin(), sx = o.x + (wx - c.X) * c.z, sy = o.y + (wy - c.Y) * c.z;
    if (sx < a.L || sy < a.T || sx > a.R || sy > a.B) centreOn(wx, wy);
  }
  /** the paint layer sized to the window (shown while a lab lot is staged); resized only when the window changed */
  function drawMask() {
    mask.style.display = geo ? 'block' : 'none';
    const key = `${innerWidth},${innerHeight}`;
    if (key === maskKey) return;
    maskKey = key; mask.setAttribute('width', `${innerWidth}`); mask.setAttribute('height', `${innerHeight}`);
  }
  /** the paint drag's rectangle on the paint layer (its screen outline); none when there is no drag */
  function drawPaint() {
    const g = geo, dr = paintDrag;
    if (!g || !dr) { preview.setAttribute('d', ''); return; }
    const f = frameOf(g), c = game.cam, o = origin();
    const x0 = Math.min(dr.x0, dr.x1), x1 = Math.max(dr.x0, dr.x1), y0 = Math.min(dr.y0, dr.y1), y1 = Math.max(dr.y0, dr.y1);
    /** a point of the lot's frame on screen: frame -> world (o + u x + n y) -> screen */
    const S = (x: number, y: number) => { const p = toWorld(f, x, y); return `${o.x + (worldX(p.x, p.y) - c.X) * c.z},${o.y + (worldY(p.x, p.y) - c.Y) * c.z}`; };
    preview.setAttribute('d', `M${S(x0, y0)}L${S(x1, y0)}L${S(x1, y1)}L${S(x0, y1)}Z`);
  }
  /** a pointer event's point in a lot's frame (tiles): snapped to half tiles and kept in the lot (x in [0, w], y in [0, d]); null when no lot is staged */
  function paintPt(e: PointerEvent, w: number, d: number): Pt | null {
    const g = geo; if (!g) return null;
    const b = game.canvas.getBoundingClientRect(), t = game.tileAt(e.clientX - b.left, e.clientY - b.top), q = toFrame(frameOf(g), t.x, t.y);
    return { x: snapHalf(q.x, w), y: snapHalf(q.y, d) };
  }

  // ---------- the actions
  /** runs one action: a failure becomes the message; the panel is drawn after */
  async function act(f: () => unknown) { try { await f(); } catch (e) { message = `failed: ${String(e)}`; } render(); }
  /** the next (step 1) or previous (step -1) variant of this cell: a draft of it (a new lab preset, in memory until saved) composed on the lot; the source line says which preset it came from. A farm with no approved farm in reach draws the game's own farm for the variant's seed */
  async function generate(step: 1 | -1): Promise<void> {
    const s = sizeNow(), c = s ? candidates(s.w, s.d) : null;
    const own = use === 'farm' && !!c && !c.list.length;
    if (!s || !c || (!c.list.length && !own)) { message = 'no preset of this type and state near this size'; return; }
    size = s.key;
    const n = c.list.length;
    variant = n ? (((variant + step) % n) + n) % n : Math.max(0, variant + step);
    seedNum = variant;
    compose1(s.w, s.d, c, seedOf(use, variant), false);
  }
  /** composes the lot w x d (tiles) from its candidates' variant `variant` (an approved farm or the game's farm for a farm) with the seed, as a new
   *  draft (whole: everything the game draws becomes the draft's own), and stages it; reroll: the main building is changed for a random other of
   *  its family and size class (lot-houses.ts otherHouse; a farm keeps its buildings). The source line says where it came from */
  function compose1(w: number, d: number, c: { list: LotPreset[]; kind: 'approved' | 'frozen' | 'diagonal' }, seed: number, reroll: boolean): void {
    const n = c.list.length, key = bkey(w, d), id = `lab-${use}-${state}-${key}-r${road}-${Date.now().toString(36)}`;
    dropDraft();
    let obj: LotPreset;
    if (n) {
      const src = c.list[variant]!;
      if (use === 'farm') {
        // an approved farm preset draws alone (compose), so its copy is whole too: fitted to the size, with the decals it has (none, unless it has them)
        const f = fitPreset(src, w, d);
        obj = { id, use, state, w, d, props: f.props, patches: f.patches, decals: f.decals, road, whole: true };
      } else {
        // the lot as the game draws it from the source (forced to it), captured whole: its fences, street items and decals become the draft's own
        const sst: ComposeState = { use: luOf(use), ...levelOf(state), seed, preset: src.id };
        stage(w, d, sst);
        const g = geo!, f = frameOf(g), pframe: PresetFrame = road % 2 ? { ...f, q: quarterOfRoad(road) } : f;
        const { props, patches, decals } = presetFromComposition(compose(g, sst), pframe, w, d, { whole: true });
        obj = { id, use, state, w, d, props, patches, decals, road, whole: true };
      }
      const words = c.kind === 'approved' ? 'the approved' : c.kind === 'frozen' ? 'the frozen' : '(the game draws a green on a diagonal road today) the frozen';
      source = `variant ${variant + 1} of ${n}${reroll ? ` (seed ${seed})` : ''}: from ${words} ${src.id}${src.road !== undefined && src.road !== road ? ` (turned from road ${src.road})` : ''}`;
    } else {
      // the game's own farm: the bare lot's geometry (staged only when the road or size changed), its parcel and the variant's seed
      if (!lotSame(w, d)) stage(w, d, { use: 0, level: 0, decline: 0, seed });
      const g = geo!, f = frameOf(g), pframe: PresetFrame = road % 2 ? { ...f, q: quarterOfRoad(road) } : f;
      const parcel: FarmParcel = { key: 'lab', o: g.o, u: g.u, n: g.n, w, d, side: 1 };
      const { props, patches, decals } = presetFromComposition(composeFarm(parcel, seed), pframe, w, d, { whole: true });
      obj = { id, use, state, w, d, props, patches, decals, road, whole: true };
      source = `variant ${variant + 1}: the game's farm for seed ${seed}`;
    }
    if (reroll && use !== 'farm' && geo) {
      // a new building: the main one changed for a random other of its family and size class, on its spot (as Change house does)
      const f = frameOf(geo), half = frameHalf(road % 2 ? { ...f, q: quarterOfRoad(road) } : f), i = mainBuilding(obj, q => isHouseLike(q.id), half);
      const q = i >= 0 ? obj.props[i]! : null, next = q ? otherHouse(q.id, Math.random) : null;
      if (q && next) {
        const own = ownerScaleOf(next), maxS = artLimit(next) / own, swapped = swapHouse(obj, i, next, half(q), half({ ...q, id: next, scale: Math.min(q.scale, maxS) }), maxS);
        // a new draft is not the owner's edit yet: no curated flag
        if (swapped) { obj = swapped; delete obj.curated; source += `\nnew building: ${next}`; }
      }
    }
    setLotPresets([...lotPresets(), obj]);
    draft = { id, obj, saved: false }; current = id;
    stage(w, d, { use: luOf(use), ...levelOf(state), seed, preset: id });
    message = '';
  }
  /** Generate (in place): this lot again, its type, state, size (the current preset's own, steppers included) and road angle kept: another
   *  variant of its cell when it has more than one, a new seed (fences, street items, decals), a new building of the same size class */
  async function generateHere(): Promise<void> {
    const p = current === null ? undefined : lotPresets().find(q => q.id === current), s = sizeNow();
    const w = p?.w ?? s?.w, d = p?.d ?? s?.d;
    if (w === undefined || d === undefined) { message = 'no preset of this type and state near this size'; return; }
    const c = candidates(w, d), own = use === 'farm' && !c.list.length;
    if (!c.list.length && !own) { message = 'no preset of this type and state near this size'; return; }
    const plan = planInPlace({ use, state, w, d, road }, c.list.length, Math.max(0, variant), seedNum, Math.random);
    variant = plan.variant; seedNum = plan.seed;
    compose1(w, d, c, seedOf(use, plan.seed), true);
  }
  /** New lot (the old Generate): a random cell (its size and its road angle, each unless locked), then its first variant; both locked: the next variant of this cell */
  async function newLot(): Promise<void> {
    const pl = planNewLot(sizes(), size, road, lockSize, lockAngle, Math.random);
    if (pl.fresh) { size = pl.size; road = pl.road; variant = -1; }
    await generate(1);
  }
  /** a type or state changed: a farm has one state (built); the size kept when this pair has that size, else the first size; then the first variant */
  function retype(): Promise<void> { if (use === 'farm') state = 'built'; const l = sizes(); if (!l.some(s => s.key === size)) size = l[0]?.key ?? ''; variant = -1; return generate(1); }
  /** opens a lab preset: its type, state, size and road, composed as it is (its own preset forced); the unsaved draft before it is dropped */
  async function open(id: string): Promise<void> {
    const p = lotPresets().find(q => q.id === id && q.road !== undefined);
    if (!p) { message = `no lab preset ${id}`; return; }
    if (draft?.id !== id) dropDraft();
    use = p.use; state = p.state; size = bkey(p.w, p.d); road = p.road ?? road; variant = 0; current = id;
    stage(p.w, p.d, { use: luOf(use), ...levelOf(state), seed: seedOf(use, 0), preset: id });
    message = `opened ${id} (${p.approved ? 'approved' : 'draft'})`; source = '';
  }
  /** saves the presets (the draft included) to lot-presets.json: the draft is on disk now (the game draws it once approved) */
  async function save(): Promise<void> {
    const id = current; if (!id) return;
    await saveLotPresets([id]);
    const d = draft; if (d && d.id === id) d.saved = true;
    message = `saved ${id} as a draft: the game draws it once it is approved`;
  }
  /** approves or unapproves a lab preset (the game draws the approved ones on the matching lots) and saves the presets at once */
  async function approve(id: string, on: boolean): Promise<void> {
    const p = lotPresets().find(q => q.id === id && q.road !== undefined);
    if (!p) { message = `no lab preset ${id}`; return; }
    const next: LotPreset = { ...p };
    if (on) next.approved = true; else delete next.approved;
    setLotPresets(replacePreset(lotPresets(), next));
    const d = draft; if (d && d.id === id) { d.obj = next; d.saved = true; }
    await saveLotPresets([id]);
    const b = bucketOf(p.w, p.d);
    message = on ? `approved ${id}: the game draws it on ${USE_NAME[p.use]} ${p.state} lots of about ${b.w} x ${b.d} tiles facing ${ROAD_WORDS[p.road ?? road]!}` : `unapproved ${id}`;
  }
  /** Approve & next gap: approves the current lab preset, then moves to the next gap */
  async function approveNext(): Promise<void> {
    if (!current) { message = 'nothing to approve: generate a lot first'; return; }
    await approve(current, true);
    const m = message; await nextGap(); message = `${m}${message ? `\n${message}` : ''}`;
  }
  /** the next gap: the first cell of this type and state (sizes x road angles, after the current cell, wrapping) with no approved lab preset; moves there and generates its first variant */
  async function nextGap(): Promise<void> {
    const cells: [Size, Road][] = [];
    for (const s of sizes()) for (let r = 0; r < 8; r++) cells.push([s, r as Road]);
    const at = cells.findIndex(([s, r]) => s.key === size && r === road);
    for (let k = 1; k <= cells.length; k++) {
      const [s, r] = cells[(at + k + cells.length) % cells.length]!;
      if (!approvedIn(s.key, r)) { size = s.key; road = r; variant = -1; await generate(1); return; }
    }
    message = cells.length ? 'every size and road angle of this type and state has an approved preset' : 'no presets of this type and state yet';
  }
  /** Review drafts: opens the next saved draft of this type (any state, size and road), in file order, after the current one, wrapping */
  async function nextDraft(): Promise<void> {
    const l = lab().filter(p => p.use === use && !p.approved && !unsaved(p.id));
    if (!l.length) { message = 'no drafts to review'; return; }
    const i = l.findIndex(p => p.id === current);
    await open(l[(i + 1) % l.length]!.id);
  }
  /** removes a lab preset (confirmed when approved): from the file unless it is the unsaved draft; a current one is dropped and the lot draws what the game draws without it */
  async function remove(id: string): Promise<void> {
    const p = lotPresets().find(q => q.id === id);
    if (!p) return;
    if (p.approved && !confirm(`Remove the approved preset ${id}? The game stops drawing it on matching lots.`)) return;
    const disk = !unsaved(id);
    setLotPresets(lotPresets().filter(q => q.id !== id));
    if (disk) await saveLotPresets([], [id]);
    if (current === id) {
      current = null; draft = null;
      if (staged) stage(staged.w, staged.d, { use: luOf(use), ...levelOf(state), seed: seedOf(use, variant) });
    }
    message = `removed ${id}${disk ? ' from lot-presets.json' : ''}${p.approved ? ': the game no longer draws it' : ''}`;
  }
  /** a coverage cell: its first approved lab preset (else its first draft) opened, else its first variant generated there */
  async function cellGo(s: Size, r: Road): Promise<void> {
    size = s.key; road = r;
    const l = cell(s.key, r), pick = l.find(p => p.approved) ?? l[0];
    if (pick) { await open(pick.id); return; }
    variant = -1; await generate(1);
  }
  /** a painted or erased preset: its patches replaced (curated: the owner edited it), set in the model, the lot composed again with it, and the presets saved (the draft is on disk then) */
  async function setPatches(p: LotPreset, patches: PresetPatch[]): Promise<void> {
    const next: LotPreset = { ...p, patches, curated: true };
    setLotPresets(replacePreset(lotPresets(), next));
    const d = draft; if (d && d.id === p.id) { d.obj = next; d.saved = true; }
    if (staged) game.restageLab(staged.st);
    await saveLotPresets([p.id]);
  }
  /** Erase: the last patch of the preset whose polygon holds the point (in its frame) is removed and the preset saved; else says so */
  async function eraseAt(p: LotPreset, q: Pt): Promise<void> {
    let i = p.patches.length - 1;
    while (i >= 0 && !inPoly(p.patches[i]!.pts, q.x, q.y)) i--;
    if (i < 0) { message = 'no painted patch there'; return; }
    const tex = p.patches[i]!.tex;
    await setPatches(p, p.patches.filter((_, k) => k !== i));
    message = `erased a ${tex} patch`;
  }
  /** the paint mode: a swatch, Erase, or null (off); the editor's pointer handling pauses while one is on, and a drag in progress is dropped */
  function setPaint(v: Swatch | 'erase' | null): void { paint = v; paintDrag = null; if (v !== null) decalMode = null; pauseEditor(v !== null || decalMode !== null); drawPaint(); }

  /** a preset's decals replaced (curated: the owner edited it): set in the model, the lot composed again with it, and the presets saved (the draft is on disk then) */
  async function setDecals(p: LotPreset, decals: PresetDecal[], msg: string): Promise<void> {
    const next: LotPreset = { ...p, decals, curated: true };
    setLotPresets(replacePreset(lotPresets(), next));
    const d = draft; if (d && d.id === p.id) { d.obj = next; d.saved = true; }
    if (staged) game.restageLab(staged.st);
    await saveLotPresets([p.id]);
    message = msg;
  }
  /** the current lab preset resized to w2 x d2 (tiles): fitted to the new size (fitPreset: the far side moves, props past the edge dropped), curated, set in the model (and the draft); the size select set to its bucket when this size has it; the lot staged again at the new size (the street fresh, the camera fitted); the presets saved */
  async function resize(w2: number, d2: number): Promise<void> {
    const p = current === null ? undefined : lotPresets().find(q => q.id === current);
    if (!p) { message = 'no lab preset to resize: Generate a lot first'; return; }
    const f = fitPreset(p, w2, d2), next: LotPreset = { ...p, w: w2, d: d2, props: f.props, patches: f.patches, ...(p.decals ? { decals: f.decals } : {}), curated: true };
    setLotPresets(replacePreset(lotPresets(), next));
    const d = draft; if (d && d.id === p.id) { d.obj = next; d.saved = true; }
    const b = bucketOf(w2, d2), k = `${b.w}x${b.d}`;
    if (sizes().some(s => s.key === k)) size = k;
    staged = null; stage(w2, d2, { use: luOf(use), ...levelOf(state), seed: seedOf(use, variant), preset: p.id });
    await saveLotPresets([p.id]);
    message = `lot now ${w2} x ${d2} tiles: the game uses it on lots of about ${b.w} x ${b.d} tiles${f.dropped ? ` (${f.dropped} props fell outside and were dropped)` : ''}`;
  }
  /** the current preset when it is a whole lab preset (it holds decals), else null */
  function wholeNow(): LotPreset | null { const p = current === null ? undefined : lotPresets().find(q => q.id === current); return p?.whole ? p : null; }
  /** the decal mode: 'place' with the armed decal, or null (off); the paint mode is off while one is on, and the editor's pointer handling pauses
   *  while placing (off, the editor selects decals with the sprites: a click, Shift+click, the box) */
  function setDeco(m: 'place' | null, id = decalId): void {
    decalMode = m; decalId = id;
    if (m !== null) { paint = null; paintDrag = null; }
    pauseEditor(m === 'place' || paint !== null); drawPaint();
  }
  /** a pointer event's point in the lot's frame (tiles, not snapped); null when no lot is staged */
  function framePt(e: PointerEvent): Pt | null { const g = geo; if (!g) return null; const b = game.canvas.getBoundingClientRect(), t = game.tileAt(e.clientX - b.left, e.clientY - b.top); return toFrame(frameOf(g), t.x, t.y); }
  /** a press on the map while placing a decal (window capture; the editor is paused): the armed decal at the point (kept in the lot: x in [0, w],
   *  y in [-1.5, d]); Shift keeps placing, else placing stops */
  const onDecalDown = (e: PointerEvent) => {
    if (decalMode !== 'place' || paint !== null || e.button !== 0 || !(e.target instanceof HTMLCanvasElement)) return;
    const p = wholeNow(), q = p && framePt(e);
    e.preventDefault(); e.stopImmediatePropagation();
    if (!p || !q) { message = 'Generate a lot first (old presets have no decals of their own)'; render(); return; }
    if (!e.shiftKey) setDeco(null);
    void act(() => setDecals(p, [...(p.decals ?? []), { id: decalId, x: within(q.x, 0, p.w), y: within(q.y, -WHOLE_FRONT, p.d), scale: 1, alpha: 1 }], `decal ${decalId} placed`));
  };
  /** draws the DECALS thumbnails of the group the select shows: each decal's rectangle of the sheet, its id as the title; a click arms placing it */
  function showDecals() {
    decalGrid.replaceChildren();
    for (const d of LOT_DECALS) {
      if (decalGroupSel.value !== 'All' && d.group !== decalGroupSel.value) continue;
      const t = el('div', 'width:48px;height:48px;flex:none;box-sizing:border-box;border:1px solid #334155;border-radius:5px;background-color:#0f172a;background-repeat:no-repeat;cursor:pointer');
      decalThumb(t, d); t.title = d.id;
      t.addEventListener('click', () => { setDeco('place', d.id); message = `placing ${d.id}: press on the lot (Shift keeps placing, Esc stops)`; render(); });
      decalGrid.append(t);
    }
  }

  // ---------- the panel
  /** what the panel shows, as a string: the periodic check draws the panel only when this changed */
  function sig(): string { return [use, state, size, road, variant, current, message, source, lockAngle, lockSize, draftSaved(), lotPresets().length, lab().map(p => `${p.id}${p.approved ? '+' : ''}${p.props.length}`).join(';')].join('|'); }
  /** draws the type and state toggles and the select of the other types; a farm has one state, so the state row is off while it is chosen */
  function renderType() {
    typeBox.replaceChildren();
    const row = el('div', 'display:flex;gap:6px');
    for (const [u, t] of TYPES) row.append(btn(t, `flex:1;padding:8px 2px;font-weight:700;${use === u ? ON : BTN}`, () => { if (u !== use) void act(() => { use = u; return retype(); }); }));
    const other = el('select', `${SEL};margin-top:6px`);
    other.append(new Option('More: Car park, Tour shop, Civic', ''));
    for (const u of MORE) other.append(new Option(USE_NAME[u], u));
    other.value = MORE.includes(use) ? use : '';
    other.addEventListener('change', () => { const u = other.value as PresetUse; if (u && u !== use) void act(() => { use = u; return retype(); }); });
    const farm = use === 'farm', st = el('div', 'display:flex;gap:6px;margin-top:6px');
    for (const [s, t] of STATES) {
      const b = btn(t, `flex:1;${state === s ? ON : BTN}${farm ? 'opacity:.45;cursor:default;' : ''}`, () => { if (s !== state) void act(() => { state = s; return retype(); }); }, farm ? 'a farm has one state' : '');
      b.disabled = farm; st.append(b);
    }
    typeBox.append(row, other, st);
  }
  /** draws the size select: each size with its approved count */
  function renderSize() {
    sizeBox.replaceChildren();
    const ss = sizes(), sel = el('select', SEL);
    if (!ss.length) sel.append(new Option('no presets of this type and state', ''));
    for (const s of ss) sel.append(new Option(`${sizeLabel(s)} · ${approvedIn(s.key, null)} approved`, s.key));
    sel.value = size;
    sel.addEventListener('change', () => { size = sel.value; void act(() => { variant = -1; return generate(1); }); });
    sizeBox.append(sel, sizeSteps());
  }
  /** the W and D steppers of the current lab preset (under the size select): − and + take it a step smaller or larger (1 tile; a farm 4), kept in its range (lots 6..40 by 6..60, farms 20..120 by 30..200); disabled with no current preset or at a limit */
  function sizeSteps(): HTMLElement {
    const p = current === null ? undefined : lotPresets().find(q => q.id === current), k = use === 'farm' ? 4 : 1;
    const [w0, w1, d0, d1] = use === 'farm' ? [20, 120, 30, 200] : [6, 40, 6, 60];
    const row = el('div', 'display:flex;gap:4px;align-items:center;margin-top:6px;white-space:nowrap');
    /** one axis: its label and its − and + (each takes the preset to the next size on that axis, within [lo, hi]) */
    const axis = (name: 'w' | 'd', lo: number, hi: number) => {
      const v = p ? p[name] : 0;
      row.append(el('span', 'margin:0 2px 0 4px', `${name === 'w' ? 'W' : 'D'} ${p ? v : '-'}`));
      for (const s of [-k, k]) {
        const n = within(v + s, lo, hi), b = btn(s < 0 ? '−' : '+', `${BTN}padding:1px 7px`, () => { if (p) void act(() => resize(name === 'w' ? n : p.w, name === 'd' ? n : p.d)); }, `${s < 0 ? 'smaller' : 'larger'} ${name === 'w' ? 'width' : 'depth'}: ${k} tile${k > 1 ? 's' : ''}`);
        b.disabled = !p || (s < 0 ? v <= lo : v >= hi);
        row.append(b);
      }
    };
    axis('w', w0, w1); axis('d', d0, d1);
    return row;
  }
  /** draws the road angle compass: the current road lit, a green dot where this size has an approved preset on that road, a grey lot in the middle */
  function renderRoad() {
    roadBox.replaceChildren();
    const g = el('div', 'display:grid;grid-template-columns:repeat(3,38px);gap:4px;justify-content:center;margin-top:4px');
    for (const r of COMPASS) {
      if (r === null) { const c = el('div', 'display:flex;align-items:center;justify-content:center'); c.append(el('div', 'width:12px;height:12px;border-radius:2px;background:#64748b')); g.append(c); continue; }
      const green = approvedIn(size, r) > 0;
      const b = btn(ARROW[r]!, `position:relative;width:38px;height:38px;padding:0;font-size:18px;${road === r ? ON : BTN}`, () => { void act(() => { road = r; variant = -1; return generate(1); }); }, `Road ${r}: ${ROAD_WORDS[r]}${green ? ' (approved presets here)' : ''}`);
      if (green) b.append(el('span', 'position:absolute;top:3px;right:3px;width:6px;height:6px;border-radius:50%;background:#22c55e'));
      g.append(b);
    }
    roadBox.append(g);
  }
  /** draws the Generate locks (the angle, the size), as the model holds them */
  function renderLocks() { locks.replaceChildren(check('Lock angle', lockAngle, v => { lockAngle = v; }), check('Lock size', lockSize, v => { lockSize = v; })); }
  /** draws the Person cursor toggle (lit when on): a townsperson stands at the pointer over the map, for scale */
  function renderPerson() {
    const row = el('div', 'display:flex;gap:4px');
    row.append(btn('Person cursor', `flex:1;${personOn ? ON : BTN}padding:5px 4px`, () => act(() => { personOn = !personOn; }), 'a townsperson stands at the pointer over the map, for scale (its feet on the point under the pointer)'),
      btn('Lot grid (L)', `flex:1;${gridOn ? ON : BTN}padding:5px 4px`, () => act(() => setGrid(!gridOn)), "the lot's boundary and its cells (1 tile = 2 m), and the neighbours' boundaries, on the ground under the sprites"),
      btn('Neighbours (N)', `flex:1;${neighOn ? ON : BTN}padding:5px 4px`, () => act(() => setNeigh(!neighOn)), use === 'farm' ? 'a farm stands alone on its country road: no neighbours' : 'the lots round this one on its street (two each way, three across), as the game would draw them: to judge it in context (never edited)'));
    personBox.replaceChildren(row);
  }
  /** the Lot grid on or off (L) */
  function setGrid(v: boolean) { gridOn = v; syncGrid(); message = v ? "lot grid on: the lot's boundary and its 1-tile cells" : ''; }
  /** the Neighbours on or off (N): staged round the lot, or dropped */
  function setNeigh(v: boolean) { neighOn = v; neighbours(); message = v ? (use === 'farm' ? 'a farm has no neighbours here (it stands alone on its country road)' : `neighbours on: ${neighs.length} lots round this one, as the game draws them (not edited)`) : ''; }
  /** draws this preset: its id, its state as a chip (unsaved draft amber, saved draft sky, approved green), its props, and the actions on it */
  function renderCur() {
    curBox.replaceChildren();
    const p = current === null ? undefined : lotPresets().find(q => q.id === current);
    if (!p) { curBox.append(el('div', 'opacity:.75', 'no lot composed yet: pick a type, state, size and road, then Generate')); return; }
    const [chip, bg, fg] = unsaved(p.id) ? ['unsaved draft', '#92400e', '#fde68a'] : p.approved ? ['approved', '#14532d', '#86efac'] : ['saved draft', '#0c4a6e', '#7dd3fc'];
    const top = el('div', 'margin:4px 0');
    top.append(el('span', `border-radius:4px;padding:0 6px;background:${bg};color:${fg}`, chip), el('span', 'opacity:.75;margin-left:8px', `${p.props.length} props`));
    const row = el('div', 'display:flex;flex-wrap:wrap;gap:4px;margin-top:4px');
    row.append(
      btn('Save draft', BTN, () => act(save), 'Ctrl+S'),
      btn(p.approved ? 'Unapprove' : 'Approve', p.approved ? BTN : ON, () => act(() => approve(p.id, !p.approved))),
      btn('Approve & next gap', ON, () => act(approveNext), 'Ctrl+Enter'),
      btn('Next gap', BTN, () => act(nextGap)),
      btn('Review drafts', BTN, () => act(nextDraft)),
      btn('Discard', 'background:#7f1d1d;color:#fecaca;border:1px solid #991b1b;', () => act(() => remove(p.id)), 'remove this preset'));
    curBox.append(el('div', 'word-break:break-all', p.id), top, row);
  }
  /** draws the PAINT GROUND row: a swatch per ground, Erase and Off (the mode lit), and the hint */
  function renderPaint() {
    paintBox.replaceChildren();
    const row = el('div', 'display:flex;flex-wrap:wrap;gap:4px');
    for (const sw of SWATCHES) row.append(btn(sw.name, `${paint === sw ? ON : BTN}padding:3px 6px`, () => { void act(() => setPaint(sw)); }, `${sw.kind} · ${sw.tex}`));
    row.append(btn('Erase', `${paint === 'erase' ? ON : BTN}padding:3px 6px`, () => { void act(() => setPaint('erase')); }, 'click a painted patch: removes the last one under it'), btn('Off', `${paint === null ? ON : BTN}padding:3px 6px`, () => { void act(() => setPaint(null)); }, 'Esc'));
    paintBox.append(row, el('div', 'opacity:.75;margin-top:4px', 'Drag on the lot to paint a rectangle. Erase: click a painted patch.'));
  }
  /** draws the DECALS mode row: Select decals and Off (the mode lit), and the hint: what the mode does, the armed decal, the selected one */
  function renderDecals() {
    decalBar.replaceChildren();
    const row = el('div', 'display:flex;flex-wrap:wrap;gap:4px;margin-top:4px');
    row.append(btn('Off', `${decalMode === null ? ON : BTN}padding:3px 6px`, () => { void act(() => setDeco(null)); }, 'Esc'));
    const hint = decalMode === 'place' ? `placing ${decalId}: press on the lot (Shift keeps placing, Esc stops)` : 'click a thumbnail, then press on the lot to place that decal. A decal on the lot: click selects it (Shift+click adds it to the sprites selected), drag moves, Del removes, [ ] size, R mirrors';
    decalBar.append(row, el('div', 'opacity:.75;margin-top:4px', hint));
  }
  /** draws the coverage of this type and state: a row per size, a column per road angle; the approved count (bold), the drafts (small), the colour, the current cell outlined; a click opens or generates it */
  function renderCov() {
    covBox.replaceChildren();
    const ss = sizes();
    if (!ss.length) { covBox.append(el('div', 'opacity:.75', 'no presets of this type and state yet')); return; }
    const t = el('table', 'width:100%;border-collapse:separate;border-spacing:2px'), hr = el('tr');
    hr.append(el('td', 'opacity:.7', 'size'));
    ARROW.forEach(a => hr.append(el('td', 'text-align:center;color:#7dd3fc;font-size:14px', a)));
    t.append(hr);
    let ok = 0, all = 0;
    for (const s of ss) {
      const tr = el('tr');
      tr.append(el('td', 'white-space:nowrap;padding-right:4px', sizeLabel(s)));
      for (let r = 0; r < 8; r++) {
        const rr = r as Road, a = approvedIn(s.key, rr), dr = cell(s.key, rr).length - a, cur = s.key === size && rr === road;
        all++; if (a) ok++;
        const td = el('td', `text-align:center;padding:4px 0;border-radius:4px;cursor:pointer;background:${a ? '#14532d' : dr ? '#713f12' : '#1e293b'};${cur ? 'outline:2px solid #38bdf8;' : ''}`);
        td.append(el('b', '', String(a)));
        if (dr) td.append(el('small', 'opacity:.85', ` +${dr}`));
        td.title = `${sizeLabel(s)}, road ${r}: ${a} approved, ${dr} drafts`;
        td.addEventListener('click', () => { void act(() => cellGo(s, rr)); });
        tr.append(td);
      }
      t.append(tr);
    }
    const here = lab().filter(p => p.use === use && p.state === state), appTot = here.filter(p => p.approved).length;
    covBox.append(t, el('div', 'margin-top:4px;opacity:.85', `${ok} of ${all} cells approved · ${appTot} approved presets · ${here.length - appTot} drafts`));
  }
  /** draws the lab presets of this type, state, size and road: an approve checkbox, the id shortened, the props, Open and remove; the current one lit */
  function renderHere() {
    hereBox.replaceChildren();
    const l = cell(size, road);
    if (!l.length) { hereBox.append(el('div', 'opacity:.75', 'no preset made for this size and road angle yet')); return; }
    for (const p of l) {
      const row = el('div', `display:flex;gap:6px;align-items:center;padding:2px 4px;border-radius:4px;${p.id === current ? 'background:#0c4a6e;' : ''}`);
      const box = el('input'); box.type = 'checkbox'; box.checked = !!p.approved; box.title = 'approved: the game draws it on the matching lots';
      box.addEventListener('change', () => { void act(() => approve(p.id, box.checked)); });
      const name = el('span', 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', p.id.replace(`lab-${use}-${state}-`, ''));
      name.title = p.id;
      row.append(box, name, el('span', 'opacity:.7;white-space:nowrap', `${p.props.length} props`), btn('Open', `${BTN}padding:1px 6px`, () => { void act(() => open(p.id)); }), btn('✕', `${BTN}padding:1px 6px`, () => { void act(() => remove(p.id)); }, 'remove'));
      hereBox.append(row);
    }
  }
  /** draws the palette: the library sprites matching the search and category (the first page); a click arms placing with the editor */
  function renderGrid() {
    grid.replaceChildren();
    const q = search.trim().toLowerCase();
    const all = LIBRARY.filter((it, i) => !it.id.startsWith('view:') && !it.id.startsWith('east:') && it.kind !== 'walker' && !drawnAsStandIn(i) && (cat === 'All' ? !SKIP_CAT.has(it.cat) : it.cat === cat) && (!q || it.id.toLowerCase().includes(q) || it.name.toLowerCase().includes(q)));
    for (const it of all.slice(0, shown)) {
      const t = el('div', 'width:48px;height:48px;flex:none;box-sizing:border-box;border:1px solid #334155;border-radius:5px;background-color:#0f172a;cursor:pointer;background-repeat:no-repeat');
      thumb(t, it.id, 44); t.title = `${it.name}\n${it.id}`;
      t.addEventListener('click', () => { message = armPlacing(it.id) ? `placing ${it.name}: click on the lot (Shift+click places more, Esc stops)` : 'the map editor is not on yet'; render(); });
      grid.append(t);
    }
    morePal.style.display = all.length > shown ? 'block' : 'none';
    morePal.textContent = `More (${all.length - shown} left)`;
  }
  /** draws the panel's changing sections and the message; the place kept for a reload */
  function render() {
    if (!started) return;
    renderType(); renderSize(); renderRoad(); renderLocks(); renderPerson();
    genSrc.textContent = source; renderCur(); selBox.textContent = selLine(); renderPaint(); renderDecals(); renderCov(); renderHere();
    msgBox.textContent = message;
    sigLast = sig(); keep();
  }
  /** the lab's stored place (sessionStorage); null when there is none, it is unreadable, or storage is off */
  function stored(): Record<string, unknown> | null { try { const o: unknown = JSON.parse(sessionStorage.getItem(SESSION) ?? 'null'); return o && typeof o === 'object' ? o as Record<string, unknown> : null; } catch { return null; } }
  /** keeps the lab's place (type, state, size, road, locks, the current preset, the person cursor) in sessionStorage; a blocked or full store only loses it */
  function keep(): void { try { sessionStorage.setItem(SESSION, JSON.stringify({ use, state, size, road, lockAngle, lockSize, current, person: personOn, grid: gridOn, neighbours: neighOn })); } catch { /* the place is not kept */ } }

  // ---------- start, the keys, the painting, the frame
  /** the game is ready: the panel shown, the palette drawn, the stored place restored (each field checked; a size the use and state lack falls back to the default) and its preset opened, else the first variant generated (residential, built, 10 x 16 when it exists, road 0 by default) */
  function start() {
    started = true; panel.style.display = 'block';
    const r = stored();
    use = valueOr(r?.use, USES, 'res'); state = use === 'farm' ? 'built' : valueOr(r?.state, STATE_KEYS, 'built');
    road = valueOr(r?.road, ROADS, 0); lockAngle = r?.lockAngle === true; lockSize = r?.lockSize === true; personOn = r?.person === true; gridOn = r?.grid === true; neighOn = r?.neighbours === true; variant = -1;
    const l = sizes(), sz = r?.size, want = typeof sz === 'string' ? sz : '';
    size = l.some(s => s.key === want) ? want : (l.some(s => s.key === '10x16') ? '10x16' : (l[0]?.key ?? ''));
    renderGrid(); showDecals();
    live = window.setInterval(() => {
      // a reload from disk (another lab tab or the editor saved) drops an unsaved draft from the presets: it goes back in and the lot draws it again
      if (current && draft && draft.id === current && !draft.saved && !lotPresets().some(p => p.id === current)) {
        setLotPresets([...lotPresets(), draft.obj]); if (staged) game.restageLab(staged.st);
      } else if (current && !lotPresets().some(p => p.id === current)) { current = null; draft = null; message = 'the preset is gone from lot-presets.json (reloaded from disk): Generate again'; }
      // the editor's words (its panel is hidden here): its message becomes the lab's when it changed; its selection line is drawn by render
      const ed = editorText(), moved = ed.info !== emInfo;
      if (ed.msg !== emMsg) { emMsg = ed.msg; if (ed.msg) message = ed.msg; }
      emInfo = ed.info;
      if (moved || sig() !== sigLast) render();
    }, 1500);
    const cv = r?.current, cur = typeof cv === 'string' ? cv : null;
    if (cur && lab().some(p => p.id === cur)) void act(() => open(cur));
    else void act(() => generate(1));
  }
  /** a press on the map with a paint mode on: Erase removes at once; a swatch starts a drag (onPaintMove, onPaintUp). Window capture: the game's pan and the editor's pick never see it */
  const onPaintDown = (e: PointerEvent) => {
    const m = paint;
    if (m === null || e.button !== 0 || !(e.target instanceof HTMLCanvasElement)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const p = current === null ? undefined : lotPresets().find(q => q.id === current);
    if (!p) { message = 'Generate a lot first'; render(); return; }
    const q = paintPt(e, p.w, p.d);
    if (!q) return;
    if (m === 'erase') { void act(() => eraseAt(p, q)); return; }
    paintDrag = { id: p.id, sw: m, w: p.w, d: p.d, x0: q.x, y0: q.y, x1: q.x, y1: q.y };
    drawPaint();
  };
  /** a drag's moves: the rectangle follows the pointer (kept in the lot) */
  const onPaintMove = (e: PointerEvent) => {
    const d = paintDrag;
    if (!d) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const q = paintPt(e, d.w, d.d);
    if (!q) return;
    d.x1 = q.x; d.y1 = q.y; drawPaint();
  };
  /** a drag's release paints the rectangle (at least 0.5 x 0.5 tiles) as a patch of its preset, saved; a cancel paints nothing */
  const onPaintUp = (e: PointerEvent) => {
    const d = paintDrag;
    if (!d) return;
    e.preventDefault(); e.stopImmediatePropagation(); paintDrag = null; drawPaint();
    if (e.type === 'pointercancel') return;
    const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
    if (x1 - x0 < 0.5 || y1 - y0 < 0.5) { message = 'drag at least 0.5 x 0.5 tiles to paint'; render(); return; }
    const p = lotPresets().find(q => q.id === d.id);
    if (!p) { message = 'Generate a lot first'; render(); return; }
    const patch: PresetPatch = { kind: d.sw.kind, tex: d.sw.tex, pts: [x0, y0, x1, y0, x1, y1, x0, y1] };
    void act(async () => { await setPatches(p, [...p.patches, patch]); message = `painted ${d.sw.name} (${x1 - x0} x ${y1 - y0} tiles), saved`; });
  };
  /** the keys, in the capture phase, while the panel is on and not typing: g next variant, G previous, Ctrl+S save, Ctrl+Enter approve and next gap, Esc paint off, L lot grid, N neighbours (the game's own L and N are stopped here) */
  const onKey = (e: KeyboardEvent) => {
    if (!started || typing(e.target)) return;
    const mod = e.ctrlKey || e.metaKey;
    const plain = !mod && !e.altKey, k = e.key.toLowerCase();
    const go: (() => unknown) | null = k === 'l' && plain ? () => setGrid(!gridOn) : k === 'n' && plain ? () => setNeigh(!neighOn) : (e.key === 'Escape' && (paint !== null || decalMode !== null) ? () => { setPaint(null); setDeco(null); } : e.key === 'g' && !mod && !e.altKey && !e.shiftKey ? () => generate(1) : e.key === 'G' && e.shiftKey && !mod && !e.altKey ? () => generate(-1) : mod && (e.key === 's' || e.key === 'S') ? save : mod && e.key === 'Enter' ? approveNext : null);
    if (!go) return;
    e.preventDefault(); e.stopImmediatePropagation(); void act(go);
  };
  /** the pointer over the map (the game's canvas or the overlay on it) keeps its point for the person cursor; a move anywhere else (the panel, the editor's panel) clears it. Window capture and passive: it runs before the lab's own handlers, which stop the events */
  const onMapMove = (e: PointerEvent) => { pointer = e.target === game.canvas || e.target === game.overlay ? { x: e.clientX, y: e.clientY } : null; };
  /** the pointer left the window (no element takes it): the person goes */
  const onMapOut = (e: PointerEvent) => { if (!e.relatedTarget) pointer = null; };
  /** the person cursor: a townsperson at the pointer's point on the map, its feet (the footprint's centre) on that point, drawn as the game draws the sprite at the camera's zoom (spriteRect, lookOf) and mirrored when its look is flipped; hidden when it is off, the pointer is off the map or there is no sprite */
  function drawPerson() {
    const pt = pointer;
    if (!personOn || !pt || PERSON_I < 0) { personEl.style.display = 'none'; return; }
    const b = game.canvas.getBoundingClientRect(), t = game.tileAt(pt.x - b.left, pt.y - b.top), fp = PERSON_FP;
    personD.x = t.x - (fp[0]! + fp[2]!) / 2; personD.y = t.y - (fp[1]! + fp[3]!) / 2;
    personD.x0 = personD.x + fp[0]!; personD.y0 = personD.y + fp[1]!; personD.x1 = personD.x + fp[2]!; personD.y1 = personD.y + fp[3]!;
    const lk = lookOf(personD);
    if (lk.hidden) { personEl.style.display = 'none'; return; }
    const r = spriteRect(personD, PERSON_R), c = game.cam, z = c.z, ox = b.left + game.cssW / 2, oy = b.top + game.cssH / 2, w = (r[2]! - r[0]!) * z, h = (r[3]! - r[1]!) * z;
    Object.assign(personEl.style, { display: 'block', left: `${ox + (r[0]! - c.X) * z}px`, top: `${oy + (r[1]! - c.Y) * z}px`, width: `${w}px`, height: `${h}px`, transform: lk.flip ? 'scaleX(-1)' : '' });
    paintPic(personEl, LIBRARY[lk.item]!, w, h);
  }
  /** each frame: the camera kept on the lot, the mask drawn, the paint drag's rectangle while one is made, the person cursor */
  function frame() { raf = requestAnimationFrame(frame); keepCam(); drawMask(); if (paintDrag) drawPaint(); drawPerson(); }

  /** the Lot grid's draw for the engine (Game.devGround): the lots syncGrid chose, none when the grid is off */
  const drawGrid = (gl: WebGL2RenderingContext, v: { X: number; Y: number; ze: number; cw: number; ch: number }) => gridLots.length > 0 && gridLayer.draw(gl, v, gridLots);
  game.devGround = drawGrid;
  // the editor is kept to the lab lot: the neighbours are never selected, and a drag on the lot's ground draws the selection box
  editorOnly('lab');
  document.head.append(style);
  document.body.append(mask, panel, personEl);
  window.addEventListener('pointermove', onMapMove, { capture: true, passive: true }); window.addEventListener('pointerout', onMapOut, true);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('pointerdown', onPaintDown, true);
  window.addEventListener('pointermove', onPaintMove, true);
  window.addEventListener('pointerup', onPaintUp, true);
  window.addEventListener('pointercancel', onPaintUp, true);
  window.addEventListener('pointerdown', onDecalDown, true);
  raf = requestAnimationFrame(frame);
  const poll = window.setInterval(() => { if (!game.ready) return; window.clearInterval(poll); start(); }, 200);
  return () => {
    window.clearInterval(poll); window.clearInterval(live); cancelAnimationFrame(raf);
    window.removeEventListener('pointermove', onMapMove, true); window.removeEventListener('pointerout', onMapOut, true);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('pointerdown', onPaintDown, true); window.removeEventListener('pointermove', onPaintMove, true);
    window.removeEventListener('pointerup', onPaintUp, true); window.removeEventListener('pointercancel', onPaintUp, true);
    window.removeEventListener('pointerdown', onDecalDown, true);
    pauseEditor(false); editorOnly(null);
    if (game.devGround === drawGrid) game.devGround = null;
    gridLayer.dispose(); game.stageLabNeighbours([]);
    style.remove(); mask.remove(); panel.remove(); personEl.remove();
  };
}
