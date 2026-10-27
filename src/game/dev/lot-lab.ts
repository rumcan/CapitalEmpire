// The lot lab (dev builds only: ?lotlab; the studio's Lots tab frames it): ONE lot on ONE street, composed by the real game as it would
// compose a lot of that type, state, size and road angle (Game.stageLab / restageLab), building, fence and all. The dev editor (lot-editor.ts)
// edits it on the map; Save writes it as a lab preset (a draft, in memory until saved); Approve makes the game draw it on the matching lots
// (compose.ts). Round the lot and its road lies the map's own grass (no forest or farms near: stageLab), and the camera fits the lot and its road
// into the free area between the panels (zoom at least LAB_ZOOM, or the fit zoom of a lot too big for that). SELECT / DRAW (T183, #461): two modes,
// lit in the toolbar. Select is the editor's (click, Shift+click, box, move, copy, paste). Draw paints a ground material: pick one under Ground in
// the palette (or B: the last one) and drag; a round brush (0.5-4 tiles, [ ]) snapped to half tiles, each stroke merged into the lot's one patch
// of that material (lot-paint.ts), Shift+drag erases it, R Shape (a rectangle), one undo per stroke; a banner says so and the cursor is the brush.
// Esc, V, Select or a sprite or decal from the palette go back to Select; a stroke in progress is laid first, the selection kept. In the wizard
// Draw paints its lot (saved with the sample). The editor's pointer handling is paused while drawing. DECALS: a
// whole preset's flat ground decals (leaves, litter, stains): a thumbnail arms placing it on the lot; a click on a decal selects it (the editor).
// A generated lot is whole: the game draws its fences, street items and decals from the preset alone (compose.ts).
// SIZE: the W and D steppers under the size select resize the current preset (fitted, curated, staged again at the new size). PERSON CURSOR:
// a townsperson stands at the pointer over the map, at the game's scale, for scale (its feet on the point under the pointer).
// Farm: a farm parcel, the game's own farm for the variant's seed, or an approved farm preset. The lab's place (type, state, size, road, locks,
// the current preset, the toggles and the folded panels) is kept across a page reload (sessionStorage 'ce-lotlab').
// T148: GENERATE stays on this lot (its type, state, size and road angle) and rolls a new layout (another variant, a new seed, a new building of
// the same size class: lot-lab-plan.ts, lot-houses.ts); NEW LOT is the old Generate (a random size and road angle as the locks allow). The
// editor is kept to the lab lot (editorOnly): a plain drag on its ground draws the selection box. LOT GRID (L): the lot's boundary and cells (and
// the neighbours' boundaries) on the ground under the sprites (lot-grid.ts, Game.devGround). NEIGHBOURS (N): the lots round this one on its
// street (two each way, three across), composed as the game would, for context (never edited; not for a farm).
// T155 (#333): the screen (lot-lab-ui.ts): the left drawer holds only the lot choice; the toolbar over the map the lot's actions and the view
// toggles; a floating bar beside the selection its edits; the bottom palette strip (lot-lab-palette.ts) the sprites, decals and ground; the right
// inspector the selected house or item and the lot (its preset, the presets here, the coverage); "?" the keys. HOUSE ALLOCATIONS
// (lots/house-alloc.ts): each house suits some road angles and look states, set in the inspector's compass and saved per house through the dev
// server; Generate, New lot and Change house deal only houses that suit this lot's road and state (a house never set suits everything).
import type { Game } from '../engine';
import { CLASS } from '../network';
import { ATLAS_PAGES, ATLAS_SIZE, LIBRARY } from '../library';
import type { LibItem } from '../types';
import { lookOf } from '../newart';
import { spriteRect, type Drawable } from '../sprites';
import { footprintOf, ownerScaleOf } from '../lots/preset-art';
import { worldX, worldY, ZOOM_MAX, ZOOM_MIN } from '../iso';
import { composeFarm, type FarmParcel } from '../ext/farms/farms';
import type { ComposeState, LotGeom } from '../lots/compose-core';
import { compose, lotPresets, setLotPresets } from '../lots/compose';
import { approvedFor, bucketOf, fitPreset, presetsFor, WHOLE_FRONT, type LotPreset, type PresetDecal, type PresetState, type PresetUse, type Road } from '../lots/presets';
import { frameOf, quarterOfRoad, toFrame, toWorld, type Pt, type PresetFrame } from '../lots/preset-frame';
import { presetFromComposition } from '../lots/preset-from';
import { LU, LV } from '../lots/town';
import { allocOf, allows, STATE_WORDS, toggled, type HouseAlloc } from '../lots/house-alloc';
import type { LotDecal } from '../lot-decals';
import decalSheet from '../../assets/ground/lot-decals.webp';
import { replacePreset } from './lot-edit';
import { armPlacing, editorAct, editorDeselect, editorOnly, editorSel, editorText, pauseEditor, pushEditorUndo, saveLotPresets, setHouseFilter, thumb, type EditorSel, type LabAct } from './lot-editor';
import { BRUSH_DEFAULT, CELL, applyStroke, grid, rectCells, stepBrush, strokeCells } from './lot-paint';
import { mainBuilding, swapHouse } from './lot-select';
import { allowedHouse, artLimit, baseOf, classWords, frameHalf, isHouseLike, otherHouse, suitCounts, type HouseOk } from './lot-houses';
import { neighbourLots, planInPlace, planNewLot, type Neighbour } from './lot-lab-plan';
import { LotGridLayer, type GridLot } from './lot-grid';
import { allocations, onAllocations, saveAllocation } from './house-alloc-store';
import { detach, isMaster, largestSize, type DropCounts } from '../lots/derive';
import { deriveMaster, mastersReport } from './lot-derive';
import { BTN, DANGER, GO, ON, SEL, btn, check, drawHelp, el, heading, makeShell, mono, panelHead, typing, type Folds } from './lot-lab-ui';
import { makePalette, SWATCHES, type Swatch } from './lot-lab-palette';
import { makeWizard, WIZARD_ID } from './lot-wizard';
import { makeGallery } from './lot-gallery';
import { makeExam } from './lot-exam';
import { shipWithExam } from './ship-exam';

/** the least zoom the lab keeps (Camera.z): the lot stays big enough to edit (a lot too big for it keeps its fit zoom, see keepCam) */
const LAB_ZOOM = 0.12;
/** the space (px) the fitted lot keeps clear of the free area's edges */
const FIT_MARGIN = 40;
/** tiles of the road the camera fit keeps in view past each end of the lot */
const MARGIN = 8;
/** a use's name in the panel and the messages */
const USE_NAME: Record<PresetUse, string> = { res: 'residential', com: 'commercial', ind: 'industrial', park: 'car park', tour: 'tour shop', civic: 'civic', farm: 'farm' };
/** the big type toggles, and the types in the select */
const TYPES: [PresetUse, string][] = [['res', 'Residential'], ['com', 'Commercial'], ['ind', 'Industrial'], ['farm', 'Farm']], MORE: PresetUse[] = ['park', 'tour', 'civic'];
/** the farm sizes (the Farm type): a parcel's frontage and depth (tiles), named as the panel shows them */
const FARM_SIZES = [{ key: '40x60', w: 40, d: 60, name: 'Small' }, { key: '56x100', w: 56, d: 100, name: 'Medium' }, { key: '80x150', w: 80, d: 150, name: 'Large' }];
/** the look states of the toggles (the owner's "decrepit" is the lab's declined) */
const STATES: [PresetState, string][] = [['built', 'Built'], ['upgraded', 'Upgraded'], ['declined', 'Decrepit']];
/** the types, road angles and look states a stored place may name (pick: the stored value when it is one of them, else the default) */
const USES: PresetUse[] = [...TYPES.map(([u]) => u), ...MORE], ROADS: Road[] = [0, 1, 2, 3, 4, 5, 6, 7], STATE_KEYS: PresetState[] = STATES.map(([s]) => s);
/** the sessionStorage key of the lab's place (type, state, size, road, locks, the current preset, toggles, folds) */
const SESSION = 'ce-lotlab';
/** the editor's idle selection line (lot-editor.ts render) */
const EDITOR_IDLE = 'Click a sprite to select it.';
/** each road's arrow (where its street is on screen), by road (presets.ts Road) */
const ARROW = ['↙', '↓', '↘', '→', '↗', '↑', '↖', '←'];
/** each road's words, by road: the messages and the tooltips */
const ROAD_WORDS: readonly string[] = ['the street bottom-left (along map +y)', 'the street at the bottom (a diagonal road)', 'the street bottom-right (along map +x)', 'the street at the right (a diagonal road)', 'the street top-right (along map -y)', 'the street at the top (a diagonal road)', 'the street top-left (along map -x)', 'the street at the left (a diagonal road)'];
/** the compass grid, row by row: the road of each button (null: the lot itself) */
const COMPASS: (Road | null)[] = [6, 5, 4, 7, null, 3, 0, 1, 2];
/** a size of this type and state: its bucket (key, tiles) and the lot size it is composed at (tiles); a farm size has its name */
interface Size { key: string; bw: number; bd: number; w: number; d: number; name?: string }
/** the draft in memory: its preset, and whether it is saved (the editor replacing it counts: the editor wrote the file) */
interface Draft { id: string; obj: LotPreset; saved: boolean }
/** the farm sizes as the sizes of the Farm type (a farm has no buckets: its own size is its bucket) */
const FARM_LIST: Size[] = FARM_SIZES.map(f => { const b = bucketOf(f.w, f.d); return { key: f.key, bw: b.w, bd: b.d, w: f.w, d: f.d, name: f.name }; });
/** the decal sheet's size (px: lot-decals.webp as prep-decals.mjs writes it) */
const SHEET_W = 2048, SHEET_H = 1180;
/** a value kept within [lo, hi] */
const within = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** a decal's thumbnail on a tile px wide inside: its rectangle of the sheet scaled to fit (a margin round it) and centred */
function decalThumb(t: HTMLElement, d: LotDecal, px: number) { const k = (px - 8) / Math.max(d.w, d.h); Object.assign(t.style, { backgroundImage: `url(${decalSheet})`, backgroundSize: `${SHEET_W * k}px ${SHEET_H * k}px`, backgroundPosition: `${(px - d.w * k) / 2 - d.x * k}px ${(px - d.h * k) / 2 - d.y * k}px` }); }

/** a lot's size bucket key (bw x bd, tiles) */
const bkey = (w: number, d: number) => { const b = bucketOf(w, d); return `${b.w}x${b.d}`; };
/** the frozen presets (no road): the pool a lot not made in the lab draws from */
const legacy = () => lotPresets().filter(p => p.road === undefined);
/** the lab presets (a road set): drafts and approved ones; the wizard's and the gallery's lots (in memory only) are not among them */
const lab = () => lotPresets().filter(p => p.road !== undefined && p.id !== 'lab-wizard' && !p.id.startsWith('lab-gallery-'));
/** the compose use of a preset use (town.ts LU): a car park is a commercial lot; a farm draws alone (no use: its forced preset) */
const luOf = (u: PresetUse) => (u === 'res' ? LU.RES : u === 'ind' ? LU.IND : u === 'tour' ? LU.TOUR : u === 'civic' ? LU.GOV : u === 'farm' ? LU.NONE : LU.COM);
/** the compose level and decline of a look state (town.ts LV): declined is a built lot at decline 2 */
const levelOf = (s: PresetState) => (s === 'upgraded' ? { level: LV.UPGRADED, decline: 0 } : { level: LV.BUILT, decline: s === 'declined' ? 2 : 0 });
/** a variant's seed for a use: a car park needs seed % 100 < 15, a shop seed % 100 >= 15 (compose.ts); the others any seed */
const seedOf = (u: PresetUse, v: number) => (u === 'park' ? ((v % 15) + 15) % 15 : u === 'com' ? 15 + (((v * 7) % 85) + 85) % 85 : 1 + (((v * 7) % 997) + 997) % 997);
/** a stored value when it is one of the list, else the default */
const valueOr = <T extends string | number>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
/** a frame coordinate snapped to half tiles and kept in [0, hi] (a paint point: the lot's frame, tiles) */
const snapHalf = (v: number, hi: number) => Math.min(hi, Math.max(0, Math.round(v * 2) / 2));
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
/** a sprite's picture centred in a box of px css px, standing on its bottom (the inspector's and the compass's thumbnails) */
function picBox(id: string, px: number, css = ''): HTMLElement {
  const box = el('div', `position:relative;width:${px}px;height:${px}px;flex:none;box-sizing:border-box;border:1px solid #334155;border-radius:6px;background:#0f172a;${css}`), pic = el('div', 'position:absolute;background-repeat:no-repeat');
  const s = thumb(pic, id, px - 8); Object.assign(pic.style, { width: `${s.w}px`, height: `${s.h}px`, left: `${(px - 2 - s.w) / 2}px`, top: `${px - 5 - s.h}px` });
  box.append(pic); return box;
}

/** installs the lot lab on a game (dev builds, ?lotlab): the screen, the keys, the ground painting; returns the uninstall (panels, style, layer, listeners, timers) */
export function installLotLab(game: Game): () => void {
  /** the model: the type, state, size (a bucket key), road angle and variant the lot is composed with */
  let use: PresetUse = 'res', state: PresetState = 'built', size = '', road: Road = 0, variant = 0;
  /** the preset the lot draws now, the draft in memory, what the engine has staged (its road, size and the state it was staged with: a full stage when the road or size change), its geometry, and the zoom the lot fits at */
  let current: string | null = null, draft: Draft | null = null, staged: { road: Road; w: number; d: number; st: ComposeState } | null = null, geo: LotGeom | null = null, fitZ = LAB_ZOOM;
  /** the last action's message, the last generate's source line, the New lot locks */
  let message = '', source = '', lockAngle = false, lockSize = false;
  /** started once the game is ready; the signature of what the panels show (the 1.5 s check draws them only when it changed); the timers and the frame */
  let started = false, sigLast = '', live = 0, raf = 0;
  /** Draw (T183): the material painted (null: Select), the last one (B comes back to it), the brush's radius (tiles), Shape (a rectangle instead of
   *  the brush), the pointer's point on the lot (the brush circle), and the stroke in progress (its target: the lab's preset or the wizard's lot;
   *  its path and cells so far; erasing; Shape's corners) */
  let paint: Swatch | null = null, lastSw: Swatch = SWATCHES.find(s => s.tex === 'concrete') ?? SWATCHES[0]!, brushR = BRUSH_DEFAULT, shape = false, brushAt: Pt | null = null;
  let stroke: { id: string; sw: Swatch; w: number; d: number; path: number[]; cells: Set<number>; erase: boolean; x0: number; y0: number; x1: number; y1: number; wiz: boolean } | null = null;
  /** the decal mode: 'place' (a press on the lot adds the armed decal decalId; Shift keeps placing) or null (off: a click on a decal selects it,
   *  through the editor, with the sprites) */
  let decalMode: 'place' | null = null, decalId = '';
  /** the person cursor: on (a townsperson at the pointer over the map), and the pointer's last point (client px) while it is over the map (null off it) */
  let personOn = false, pointer: { x: number; y: number } | null = null;
  /** the Lot grid (L) and the Neighbours (N) toggles; the neighbours staged now (for the grid); the last Generate's seed number (planInPlace) */
  let gridOn = false, neighOn = false, neighs: Neighbour[] = [], seedNum = 0;
  /** what the staged neighbours were made for (type, state, lot size, road, place; '' none): neighbours() stages them again only when it changed */
  let neighKey = '';
  /** the exam holds the camera (T161, ?exam: dev/lot-exam.ts) */
  let examHold = false;
  /** the Lot grid's layer and the lots it outlines (made again when the lot, the neighbours or the toggle change; the frame hook reads it) */
  const gridLayer = new LotGridLayer();
  let gridLots: GridLot[] = [];
  /** the editor's last message as the lab saw it (a new one becomes the lab's status) and the selection's key (a change draws the bar and the inspector) */
  let emMsg = '', selKey = '';
  /** the houses that suit this lot's road angle and state (the house allocations): Generate, New lot and Change house deal only these */
  const houseOk: HouseOk = id => allows(allocations(), baseOf(id), road, state);
  /** the lot's road and state as words ('↘ road 2, built') */
  const lotWords = () => `${ARROW[road]} road ${road}, ${STATE_WORDS[state]}`;

  // ---------- the DOM: a style hiding the game's HUD and the editor's own panel (the lab shows its words), the paint layer (an SVG: the paint
  // drag's rectangle), the screen's panels (lot-lab-ui.ts), the person's sprite
  const style = document.createElement('style');
  style.textContent = '#root > div > :not(canvas){display:none!important}#ce-dev-editor-panel{display:none!important}';
  const SVGNS = 'http://www.w3.org/2000/svg', mask = document.createElementNS(SVGNS, 'svg'), preview = document.createElementNS(SVGNS, 'path');
  mask.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:55;display:none';
  preview.setAttribute('fill', 'rgba(56,189,248,.35)'); preview.setAttribute('stroke', '#38bdf8');
  // T183: the brush circle at the pointer (Draw), and the mode banner over the map
  const brushEl = document.createElementNS(SVGNS, 'path');
  brushEl.setAttribute('fill', 'rgba(253,230,138,.12)'); brushEl.setAttribute('stroke', '#fde68a'); brushEl.setAttribute('stroke-width', '2');
  mask.append(preview, brushEl);
  const banner = el('div', 'position:fixed;z-index:58;transform:translateX(-50%);display:none;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;background:rgba(15,23,42,.95);border:2px solid #fde68a;color:#fef3c7;font:600 13px system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.45);pointer-events:none;white-space:nowrap');
  banner.id = 'ce-lab-draw-banner';
  const folds0 = (() => { const f = stored()?.folds; return f && typeof f === 'object' ? f as Partial<Folds> : null; })();
  const shell = makeShell(folds0, () => { fitCam(); palette.draw(); keep(); });
  const palette = makePalette(shell, {
    sprite: id => { setPaint(null); setDeco(null); message = armPlacing(id) ? `placing ${id}: click on the lot (Shift+click places more, Esc stops)` : 'the map editor is not on yet'; render(); },
    decal: id => { setDeco('place', id); message = `placing ${id}: press on the lot (Shift keeps placing, Esc stops)`; render(); palette.draw(); },
    paint: sw => { setPaint(sw === 'erase' ? lastSw : sw); render(); palette.draw(); },
    armed: () => ({ decal: decalMode === 'place' ? decalId : null, paint }),
    decalThumb,
    folded: v => shell.fold('palette', v),
  });
  drawHelp(shell.help);
  /** the lot wizard (T158, lot-wizard.ts): W turns it on; it owns the clicks and the keys while it runs */
  const wizard = makeWizard({
    game, lot: () => ({ use, state, road }), frame: () => (geo ? labFrame(geo) : null), base: wizardBase, show: wizardShow, leave: wizardLeave, keepDraft, toScreen,
    busy: () => paint !== null || decalMode === 'place',
    say: m => { message = m; drawStatus(); }, redraw: () => render(), ship: (data, from) => shipModel(data, from),
  });
  /** the lot gallery (T159, lot-gallery.ts): a dozen generated lots along the street, judged Good or Bad, Fix one in the wizard */
  const gallery = makeGallery({
    game, lot: () => ({ use, state, road }), geo: () => geo, frame: () => (geo ? labFrame(geo) : null), base: () => wizardBase(false), stage: galleryStage,
    fit: gs => { fitList = gs.length > 1 ? [...gs] : null; fitGeos(gs); },
    toScreen: (x, y) => { const c = game.cam, o = origin(); return { x: o.x + (worldX(x, y) - c.X) * c.z, y: o.y + (worldY(x, y) - c.Y) * c.z }; },
    leave: wizardLeave, say: m => { message = m; drawStatus(); }, redraw: () => render(),
  }, wizard);
  // T161: the generator's exam: Ship model renders it (T173); with ?exam, window.__lotExam, for scripts/lots/exam.mjs to stage its rows and shoot its lots
  const exam = makeExam({
    game, stage: examStage, free: () => shell.free(),
    screen: (x, y) => { const c = game.cam, o = origin(); return { x: o.x + (worldX(x, y) - c.X) * c.z, y: o.y + (worldY(x, y) - c.Y) * c.z }; },
    hold: v => { examHold = v; badgeLayer.style.display = v ? 'none' : ''; },
    centre: (wx, wy, z) => { game.cam.z = z; centreOn(wx, wy); game.emit(); },
  });
  if (/[?&]exam(&|=|$)/.test(location.search)) (window as unknown as { __lotExam?: unknown }).__lotExam = exam;
  /** T173: Ship model: the exam rendered (ship-exam.ts), the lab's lot staged again after it; the version shipped, or null */
  async function shipModel(data: Record<string, unknown>, from: string): Promise<number | null> {
    const saved = staged ? { road, w: staged.w, d: staged.d, st: staged.st } : null;
    try { return await shipWithExam({ exam, game, say: m => { message = m; drawStatus(); } }, data, from); }
    finally { exam.done(); if (saved) { road = saved.road; fitList = null; stage(saved.w, saved.d, saved.st); } render(); }
  }
  const personEl = el('div', 'position:fixed;left:0;top:0;display:none;pointer-events:none;z-index:58;background-repeat:no-repeat');
  /** T167: a badge on each prop drawn as a stand-in for a picture the owner removed (the lab lot and its neighbours), so the owner sees where to
   *  re-lay a preset: their world points (footprint centres) and the removed ids, found when the panels are drawn; placed each frame */
  const badgeLayer = el('div', 'position:fixed;left:0;top:0;pointer-events:none;z-index:57');
  let badges: { x: number; y: number; was: string; id: string }[] = [];
  function syncBadges(): void {
    const out: typeof badges = [];
    for (const k of ['lab', ...neighs.map(n => n.key)]) {
      const at = game.lotOf(k); if (!at) continue;
      for (const p of compose(at.g, at.st).props) if (p.standIn) { const fp = footprintOf(p.id, p.scale, p.flip); out.push({ x: p.x + (fp[0] + fp[2]) / 2, y: p.y + (fp[1] + fp[3]) / 2, was: p.standIn, id: p.id }); }
    }
    badges = out;
    badgeLayer.replaceChildren(...out.map(b => { const e = el('div', 'position:fixed;transform:translate(-50%,-50%);background:rgba(146,64,14,.92);color:#fde68a;border:1px solid #f59e0b;border-radius:999px;padding:1px 7px;font:600 11px system-ui,sans-serif;white-space:nowrap', 'stand-in for a removed picture'); e.title = `${b.id} drawn in place of ${b.was} (removed in the studio): re-lay the preset to choose another`; return e; }));
  }
  /** each frame: the badges over their props */
  function placeBadges(): void {
    const c = game.cam, o = origin(), cs = badgeLayer.children;
    badges.forEach((b, i) => { const e = cs[i] as HTMLElement | undefined; if (!e) return; e.style.left = `${o.x + (worldX(b.x, b.y) - c.X) * c.z}px`; e.style.top = `${o.y + (worldY(b.x, b.y) - c.Y) * c.z - 14}px`; });
  }

  // ---------- the model's helpers
  /** the draft counts as saved once it is written, or once the editor replaced it (an edit, which the editor wrote to disk) */
  function draftSaved(): boolean { const d = draft; return !!d && (d.saved || lotPresets().find(p => p.id === d.id) !== d.obj); }
  /** the draft (not yet on disk) with this id */
  function unsaved(id: string): boolean { return draft?.id === id && !draftSaved(); }
  /** removes the unsaved draft from the presets (it is not kept); the draft is gone from the model */
  function dropDraft() { const d = draft; if (d && !draftSaved()) setLotPresets(lotPresets().filter(p => p.id !== d.id)); draft = null; }
  /** the sizes of this type and state: a farm's three (FARM_LIST); else the buckets of the frozen and lab presets, each with its lot size (the first frozen preset's, else the first lab preset's), by width then depth */
  function sizes(): Size[] { return sizesOf(use, state); }
  /** the sizes of a type and state (sizes() for any pair: the masters report reads them all) */
  function sizesOf(u: PresetUse, s: PresetState): Size[] {
    if (u === 'farm') return FARM_LIST;
    const m = new Map<string, Size>();
    for (const p of [...legacy(), ...lab()]) if (p.use === u && p.state === s) { const b = bucketOf(p.w, p.d), k = `${b.w}x${b.d}`; if (!m.has(k)) m.set(k, { key: k, bw: b.w, bd: b.d, w: p.w, d: p.d }); }
    return [...m.values()].sort((a, b) => a.bw - b.bw || a.bd - b.bd);
  }
  /** the auto-size (T155 PR 2): when the preset is a master (a lab preset on the largest size of its type and state, not derived), every smaller
   *  size of its type, state and road derived from it (lots/derive.ts) into the presets in memory: ids to save, ids to remove (sizes no longer
   *  derived) and the words for the message; nothing for any other preset */
  function deriveIfMaster(id: string): { ids: string[]; remove: string[]; words: string } {
    const m = lotPresets().find(p => p.id === id), ss = m ? sizesOf(m.use, m.state) : [];
    if (!m || !isMaster(m, ss)) return { ids: [], remove: [], words: '' };
    const plan = deriveMaster(m, ss, lotPresets()), gone = new Set(plan.remove);
    let list = lotPresets().filter(p => !gone.has(p.id));
    for (const q of plan.upsert) list = list.some(p => p.id === q.id) ? replacePreset(list, q) : [...list, q];
    setLotPresets(list);
    const sum: DropCounts = { tree: 0, large: 0, small: 0, fence: 0, decal: 0 };
    for (const c of plan.covered) for (const k of Object.keys(sum) as (keyof DropCounts)[]) sum[k] += c.dropped[k];
    const dropped = (Object.keys(sum) as (keyof DropCounts)[]).filter(k => sum[k]).map(k => `${sum[k]} ${k === 'large' || k === 'small' ? `${k} props` : `${k}s`}`).join(', ');
    return { ids: plan.upsert.map(p => p.id), remove: plan.remove, words: `\nderived ${plan.upsert.length} smaller size${plan.upsert.length === 1 ? '' : 's'} from this master${dropped ? ` (dropped across them: ${dropped})` : ''}${plan.skipped.length ? `; skipped ${plan.skipped.map(s => `${s.key} (${s.why})`).join(', ')}` : ''}${plan.remove.length ? `; removed ${plan.remove.length} no longer derived` : ''}` };
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
  /** the current preset (the one the lot draws), or undefined */
  const curPreset = () => (current === null ? undefined : lotPresets().find(q => q.id === current));
  /** the lab lot's frame as its presets are laid in it (a diagonal road: its quarter) */
  const labFrame = (g: LotGeom): PresetFrame => { const f = frameOf(g); return road % 2 ? { ...f, q: quarterOfRoad(road) } : f; };
  /** whether the staged lot is this w x d on this road (then the street and the lot stay, and only the lot is composed again) */
  const lotSame = (w: number, d: number) => !!staged && staged.road === road && staged.w === w && staged.d === d;
  /** composes the lab lot with st: the street and the lot are staged again only when the road or size changed (then the camera fits the lot and its road); else the same street, composed again */
  function stage(w: number, d: number, st: ComposeState) {
    const fresh = !lotSame(w, d);
    // the editor lets go of its selection: the lot draws another preset now
    editorDeselect();
    if (fresh) { geo = game.stageLab({ road, w, d, st }).g; } else game.restageLab(st);
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
  function centreOn(wx: number, wy: number) { const a = shell.free(), o = origin(), z = game.cam.z; game.cam.X = wx - ((a.L + a.R) / 2 - o.x) / z; game.cam.Y = wy - ((a.T + a.B) / 2 - o.y) / z; }
  /** the camera on the lot and its road, after a fresh stage (or a panel folded): the largest zoom (at most ZOOM_MAX) at which the lot and its road fit the free area with FIT_MARGIN px to spare, and the hole's centre at the area's centre */
  function fitCam() { if (fitList) fitGeos(fitList); else if (geo) fitGeos([geo]); }
  /** the lots the camera keeps fitted instead of the lab lot alone (the gallery's row), or null */
  let fitList: LotGeom[] | null = null;
  /** the camera over these lots and their road (the lab lot; the gallery's row): the largest zoom (at most ZOOM_MAX) at which they fit the free area
   *  with FIT_MARGIN px to spare, their middle at the area's centre */
  function fitGeos(gs: readonly LotGeom[]) {
    if (!gs.length) return;
    const h = gs.map(holeBox).reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }));
    const a = shell.free(), z = Math.min(ZOOM_MAX, (a.R - a.L - 2 * FIT_MARGIN) / (h.x1 - h.x0), (a.B - a.T - 2 * FIT_MARGIN) / (h.y1 - h.y0));
    fitZ = Math.max(ZOOM_MIN, z); game.cam.z = fitZ; centreOn((h.x0 + h.x1) / 2, (h.y0 + h.y1) / 2); game.emit();
  }
  /** the camera stays on the lot: its zoom never below the floor (LAB_ZOOM, or the fit zoom of a lot too big for it), and the lot centred back in the free area once its centre has left it */
  function keepCam() {
    const g = geo, c = game.cam;
    if (!g || examHold) return;
    if (c.z < Math.min(LAB_ZOOM, fitZ)) c.z = Math.min(LAB_ZOOM, fitZ);
    const tx = g.o.x + (g.u.x * g.w + g.n.x * g.d) / 2, ty = g.o.y + (g.u.y * g.w + g.n.y * g.d) / 2, wx = worldX(tx, ty), wy = worldY(tx, ty);
    const a = shell.free(), o = origin(), sx = o.x + (wx - c.X) * c.z, sy = o.y + (wy - c.Y) * c.z;
    if (sx < a.L || sy < a.T || sx > a.R || sy > a.B) centreOn(wx, wy);
  }
  /** the paint layer sized to the window (shown while a lab lot is staged) */
  let maskKey = '';
  function drawMask() {
    mask.style.display = geo ? 'block' : 'none';
    const key = `${innerWidth},${innerHeight}`;
    if (key === maskKey) return;
    maskKey = key; mask.setAttribute('width', `${innerWidth}`); mask.setAttribute('height', `${innerHeight}`);
  }
  /** Draw's marks on the paint layer: the stroke in progress (its cells in the material's colour, red when erasing; Shape's rectangle), the brush
   *  circle at the pointer, the banner and the canvas's cursor (none in Draw: the circle is the cursor) */
  function drawPaint() {
    drawBanner();
    game.canvas.style.cursor = paint !== null ? 'none' : '';
    const g = geo, s = stroke;
    if (!g) { preview.setAttribute('d', ''); brushEl.setAttribute('d', ''); return; }
    const f = frameOf(g), c = game.cam, o = origin();
    /** a point of the lot's frame on screen: frame -> world (o + u x + n y) -> screen */
    const S = (x: number, y: number) => { const p = toWorld(f, x, y); return `${o.x + (worldX(p.x, p.y) - c.X) * c.z},${o.y + (worldY(p.x, p.y) - c.Y) * c.z}`; };
    const quad = (x0: number, y0: number, x1: number, y1: number) => `M${S(x0, y0)}L${S(x1, y0)}L${S(x1, y1)}L${S(x0, y1)}Z`;
    if (s) {
      let d = '';
      if (shape) d = quad(Math.min(s.x0, s.x1), Math.min(s.y0, s.y1), Math.max(s.x0, s.x1), Math.max(s.y0, s.y1));
      else { const nx = grid(s.w, s.d).nx; for (const k of s.cells) { const i = k % nx, j = Math.floor(k / nx); d += quad(i * CELL, j * CELL, (i + 1) * CELL, (j + 1) * CELL); } }
      preview.setAttribute('d', d);
      preview.setAttribute('fill', s.erase ? 'rgba(248,113,113,.45)' : `${s.sw.col}cc`); preview.setAttribute('stroke', s.erase ? '#f87171' : 'none');
    } else preview.setAttribute('d', '');
    const b = brushAt;
    if (paint !== null && b) {
      const r = shape ? 0.3 : brushR, pts: string[] = [];
      for (let k = 0; k < 32; k++) { const a = (k / 32) * Math.PI * 2; pts.push(S(b.x + r * Math.cos(a), b.y + r * Math.sin(a))); }
      brushEl.setAttribute('d', `M${pts.join('L')}Z${shape ? `M${S(b.x - 0.6, b.y)}L${S(b.x + 0.6, b.y)}M${S(b.x, b.y - 0.6)}L${S(b.x, b.y + 0.6)}` : ''}`);
      brushEl.setAttribute('stroke', stroke?.erase ? '#f87171' : '#fde68a');
    } else brushEl.setAttribute('d', '');
  }
  /** the mode banner over the map while drawing: the material, what a drag does, the keys */
  function drawBanner() {
    if (paint === null || !started) { banner.style.display = 'none'; return; }
    const a = shell.free(), sw = el('span', `display:inline-block;width:14px;height:14px;border-radius:3px;border:1px solid #fde68a;background:${paint.col}`);
    banner.style.display = 'flex'; banner.style.left = `${(a.L + a.R) / 2}px`; banner.style.top = `${a.T + 10}px`;
    const size = `${brushR} tile${brushR === 1 ? '' : 's'}`;
    banner.replaceChildren(el('span', 'font-weight:800;color:#fde68a', '✎ Drawing:'), sw, el('span', '', paint.name),
      el('span', 'opacity:.9', `· ${shape ? 'Shape: drag a rectangle' : 'drag to paint'} · Shift+drag erases · [ ] brush ${size} · R ${shape ? 'brush' : 'Shape'} · Esc or V back to Select`));
  }

  // ---------- the actions
  /** runs one action: a failure becomes the message; the panels are drawn after */
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
   *  draft (whole: everything the game draws becomes the draft's own), and stages it. The main building is then dealt by the house allocations
   *  (T155): reroll (Generate) changes it for a random other of its family and size class that suits this road and state (lot-houses.ts
   *  otherHouse); otherwise (New lot, a variant) it stays when it suits them, else it is changed for one that does (allowedHouse); a farm keeps its
   *  buildings. The source line says where it came from */
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
        const g = geo!;
        const { props, patches, decals } = presetFromComposition(compose(g, sst), labFrame(g), w, d, { whole: true });
        obj = { id, use, state, w, d, props, patches, decals, road, whole: true };
      }
      const words = c.kind === 'approved' ? 'the approved' : c.kind === 'frozen' ? 'the frozen' : '(the game draws a green on a diagonal road today) the frozen';
      source = `variant ${variant + 1} of ${n}${reroll ? ` (seed ${seed})` : ''}: from ${words} ${src.id}${src.road !== undefined && src.road !== road ? ` (turned from road ${src.road})` : ''}`;
    } else {
      // the game's own farm: the bare lot's geometry (staged only when the road or size changed), its parcel and the variant's seed
      if (!lotSame(w, d)) stage(w, d, { use: 0, level: 0, decline: 0, seed });
      const g = geo!;
      const parcel: FarmParcel = { key: 'lab', o: g.o, u: g.u, n: g.n, w, d, side: 1 };
      const { props, patches, decals } = presetFromComposition(composeFarm(parcel, seed), labFrame(g), w, d, { whole: true });
      obj = { id, use, state, w, d, props, patches, decals, road, whole: true };
      source = `variant ${variant + 1}: the game's farm for seed ${seed}`;
    }
    const dealt = dealHouse(obj, reroll); obj = dealt.obj; source += dealt.note;
    setLotPresets([...lotPresets(), obj]);
    draft = { id, obj, saved: false }; current = id;
    stage(w, d, { use: luOf(use), ...levelOf(state), seed, preset: id });
    message = '';
  }
  /** the main building of a new lot, as the house allocations deal it, on its spot (as Change house does): reroll (Generate) a random other of its
   *  family and size class that suits this road and state; otherwise it stays when it suits them, else one that does (a farm keeps its buildings).
   *  The note says what changed */
  function dealHouse(obj: LotPreset, reroll: boolean): { obj: LotPreset; note: string } {
    if (use === 'farm' || !geo) return { obj, note: '' };
    const half = frameHalf(labFrame(geo)), i = mainBuilding(obj, q => isHouseLike(q.id), half), q = i >= 0 ? obj.props[i]! : null;
    if (!q) return { obj, note: '' };
    const was = baseOf(q.id), next = reroll ? otherHouse(q.id, Math.random, houseOk) : allowedHouse(q.id, Math.random, houseOk);
    if (next && next !== was) {
      const own = ownerScaleOf(next), maxS = artLimit(next) / own, swapped = swapHouse(obj, i, next, half(q), half({ ...q, id: next, scale: Math.min(q.scale, maxS) }), maxS);
      // a new draft is not the owner's edit yet: no curated flag
      if (swapped) { delete swapped.curated; return { obj: swapped, note: `\nnew building: ${next}${reroll ? '' : ` (${was} does not suit ${lotWords()})`}` }; }
      return { obj, note: '' };
    }
    if (!next && !houseOk(was)) return { obj, note: `\nno ${classWords(was)} suits ${lotWords()} (the house allocations): kept ${was}` };
    return { obj, note: !next && reroll ? `\nno other ${classWords(was)} suits ${lotWords()}: kept ${was}` : '' };
  }
  /** Generate (in place): this lot again, its type, state, size (the current preset's own, steppers included) and road angle kept: another
   *  variant of its cell when it has more than one, a new seed (fences, street items, decals), a new building of the same size class */
  async function generateHere(): Promise<void> {
    const p = curPreset(), s = sizeNow();
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
  function retype(): Promise<void> { if (use === 'farm') state = 'built'; const l = sizes(); if (!l.some(s => s.key === size)) size = l[0]?.key ?? ''; variant = -1; return regen(); }
  /** a new lot for the cell the drawer chose: the wizard's next (nothing learned) while the wizard is on, else the cell's first variant */
  async function regen(): Promise<void> { if (wizard.on()) { if (use === 'farm') { wizard.toggle(false); return; } wizard.next(false); return; } await generate(1); }
  /** opens a lab preset: its type, state, size and road, composed as it is (its own preset forced); the unsaved draft before it is dropped */
  async function open(id: string): Promise<void> {
    const p = lotPresets().find(q => q.id === id && q.road !== undefined);
    if (!p) { message = `no lab preset ${id}`; return; }
    if (draft?.id !== id) dropDraft();
    use = p.use; state = p.state; size = bkey(p.w, p.d); road = p.road ?? road; variant = 0; current = id;
    stage(p.w, p.d, { use: luOf(use), ...levelOf(state), seed: seedOf(use, 0), preset: id });
    message = `opened ${id} (${p.approved ? 'approved' : 'draft'})`; source = '';
  }
  /** saves the presets (the draft included) to lot-presets.json: the draft is on disk now (the game draws it once approved); a master derives its
   *  smaller sizes first (saved with it) */
  async function save(): Promise<void> {
    const id = current; if (!id) return;
    const dv = deriveIfMaster(id);
    await saveLotPresets([id, ...dv.ids], dv.remove);
    const d = draft; if (d && d.id === id) d.saved = true;
    message = `saved ${id} as a draft: the game draws it once it is approved${dv.words}`;
  }
  /** approves or unapproves a lab preset (the game draws the approved ones on the matching lots) and saves the presets at once */
  async function approve(id: string, on: boolean): Promise<void> {
    const p = lotPresets().find(q => q.id === id && q.road !== undefined);
    if (!p) { message = `no lab preset ${id}`; return; }
    const next: LotPreset = { ...p };
    if (on) next.approved = true; else delete next.approved;
    setLotPresets(replacePreset(lotPresets(), next));
    const d = draft; if (d && d.id === id) { d.obj = next; d.saved = true; }
    // a master derives its smaller sizes again: they follow its approval
    const dv = deriveIfMaster(id);
    await saveLotPresets([id, ...dv.ids], dv.remove);
    const b = bucketOf(p.w, p.d);
    message = (on ? `approved ${id}: the game draws it on ${USE_NAME[p.use]} ${p.state} lots of about ${b.w} x ${b.d} tiles facing ${ROAD_WORDS[p.road ?? road]!}` : `unapproved ${id}`) + dv.words;
  }
  /** Approve & next gap: approves the current lab preset, then moves to the next gap */
  async function approveNext(): Promise<void> {
    if (!current) { message = 'nothing to approve: generate a lot first'; return; }
    await approve(current, true);
    const m = message; await nextGap(); message = `${m}${message ? `\n${message}` : ''}`;
  }
  /** the next gap: the first cell of this type and state (sizes x road angles, after the current cell, wrapping) with no approved lab preset; moves there and generates its first variant */
  async function nextGap(): Promise<void> {
    const gc = gapCell();
    if (gc) { size = gc[0].key; road = gc[1]; variant = -1; await generate(1); return; }
    message = sizes().length ? 'every size and road angle of this type and state has an approved preset' : 'no presets of this type and state yet';
  }
  /** the next gap: the first cell of this type and state (sizes x road angles, after the current cell, wrapping) with no approved lab preset; null: none */
  function gapCell(): [Size, Road] | null {
    const cells: [Size, Road][] = [];
    for (const s of sizes()) for (let r = 0; r < 8; r++) cells.push([s, r as Road]);
    const at = cells.findIndex(([s, r]) => s.key === size && r === road);
    for (let k = 1; k <= cells.length; k++) { const c = cells[(at + k + cells.length) % cells.length]!; if (!approvedIn(c[0].key, c[1])) return c; }
    return null;
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
    // a master's derived sizes go with it (a detached one is the owner's own and stays)
    const kids = lotPresets().filter(q => q.derived === id).map(q => q.id);
    if ((p.approved || kids.length) && !confirm(`Remove the${p.approved ? ' approved' : ''} preset ${id}${kids.length ? ` and the ${kids.length} sizes derived from it` : ''}? The game stops drawing ${kids.length ? 'them' : 'it'} on matching lots.`)) return;
    const disk = !unsaved(id);
    setLotPresets(lotPresets().filter(q => q.id !== id && !kids.includes(q.id)));
    if (disk || kids.length) await saveLotPresets([], disk ? [id, ...kids] : kids);
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
  /** a preset changed by the lab (painted, erased, a decal placed): set in the model (and the draft), curated (the owner edited it), the lot composed again with it, and the presets saved (the draft is on disk then) */
  async function commitLab(p: LotPreset, change: Partial<LotPreset>): Promise<void> {
    // a hand edit detaches a derived preset from its master
    const next: LotPreset = detach({ ...p, ...change, curated: true });
    setLotPresets(replacePreset(lotPresets(), next));
    const d = draft; if (d && d.id === p.id) { d.obj = next; d.saved = true; }
    if (staged) game.restageLab(staged.st);
    await saveLotPresets([p.id]);
  }
  /** the paint mode: a swatch, Erase, or null (off); the editor's pointer handling pauses while one is on, and a drag in progress is dropped */
  function setPaint(v: Swatch | null): void {
    // a stroke in progress is laid first: switching never drops it (nor the editor's selection: the editor is only paused)
    if (stroke) finishStroke();
    paint = v; if (v) lastSw = v;
    if (v !== null) decalMode = null;
    pauseEditor(v !== null || decalMode !== null || wizard.on());
    message = v ? `Draw: ${v.name}` : message.startsWith('Draw:') ? '' : message;
    drawPaint();
  }
  /** the current lab preset resized to w2 x d2 (tiles): fitted to the new size (fitPreset: the far side moves, props past the edge dropped), curated, set in the model (and the draft); the size select set to its bucket when this size has it; the lot staged again at the new size (the street fresh, the camera fitted); the presets saved */
  async function resize(w2: number, d2: number): Promise<void> {
    const p = curPreset();
    if (!p) { message = 'no lab preset to resize: Generate a lot first'; return; }
    const f = fitPreset(p, w2, d2), next: LotPreset = detach({ ...p, w: w2, d: d2, props: f.props, patches: f.patches, ...(p.decals ? { decals: f.decals } : {}), curated: true });
    setLotPresets(replacePreset(lotPresets(), next));
    const d = draft; if (d && d.id === p.id) { d.obj = next; d.saved = true; }
    const b = bucketOf(w2, d2), k = `${b.w}x${b.d}`;
    if (sizes().some(s => s.key === k)) size = k;
    staged = null; stage(w2, d2, { use: luOf(use), ...levelOf(state), seed: seedOf(use, variant), preset: p.id });
    await saveLotPresets([p.id]);
    message = `lot now ${w2} x ${d2} tiles: the game uses it on lots of about ${b.w} x ${b.d} tiles${f.dropped ? ` (${f.dropped} props fell outside and were dropped)` : ''}`;
  }
  /** the current preset when it is a whole lab preset (it holds decals), else null */
  function wholeNow(): LotPreset | null { const p = curPreset(); return p?.whole ? p : null; }
  /** the decal mode: 'place' with the armed decal, or null (off); the paint mode is off while one is on, and the editor's pointer handling pauses
   *  while placing (off, the editor selects decals with the sprites: a click, Shift+click, the box) */
  function setDeco(m: 'place' | null, id = decalId): void {
    decalMode = m; decalId = id;
    if (m !== null) { if (stroke) finishStroke(); paint = null; }
    pauseEditor(m === 'place' || paint !== null || wizard.on()); drawPaint();
  }
  /** a pointer event's point in the lot's frame (tiles, not snapped); null when no lot is staged */
  function framePt(e: PointerEvent): Pt | null { const g = geo; if (!g) return null; const b = game.canvas.getBoundingClientRect(), t = game.tileAt(e.clientX - b.left, e.clientY - b.top); return toFrame(frameOf(g), t.x, t.y); }
  /** a press on the map while placing a decal (window capture; the editor is paused): the armed decal at the point (kept in the lot: x in [0, w],
   *  y in [-1.5, d]); Shift keeps placing, else placing stops */
  const onDecalDown = (e: PointerEvent) => {
    if (decalMode !== 'place' || paint !== null || e.button !== 0 || !(e.target instanceof HTMLCanvasElement)) return;
    // T183: in the wizard the decal goes on the wizard's lot (kept, so the sample learns it; Ctrl+Z takes it back), never into a saved preset
    if (wizard.on()) {
      e.preventDefault(); e.stopImmediatePropagation();
      const l = wizard.ground(), q = framePt(e);
      if (!l || !q) return;
      if (!e.shiftKey) { setDeco(null); palette.draw(); }
      wizard.addDecal(decalId, within(q.x, 0, l.w), within(q.y, -WHOLE_FRONT, l.d));
      message = `decal ${decalId} placed on the wizard's lot (Ctrl+Z undoes)`; render(); return;
    }
    const p = wholeNow(), q = p && framePt(e);
    e.preventDefault(); e.stopImmediatePropagation();
    if (!p || !q) { message = 'Generate a lot first (old presets have no decals of their own)'; render(); return; }
    if (!e.shiftKey) { setDeco(null); palette.draw(); }
    const decals: PresetDecal[] = [...(p.decals ?? []), { id: decalId, x: within(q.x, 0, p.w), y: within(q.y, -WHOLE_FRONT, p.d), scale: 1, alpha: 1 }];
    void act(async () => { await commitLab(p, { decals }); message = `decal ${decalId} placed`; });
  };
  /** the wizard's lot (T158): a lot of the current cell (gap: the next coverage gap's), composed as the game composes it from one of the cell's
   *  presets with a random seed, whole, its house dealt by the allocations (a random one of its pool that suits the lot), not yet shown. The
   *  same cell keeps the staged street (the fast path: no new stage); another cell is staged first */
  function wizardBase(gap: boolean): LotPreset | null {
    if (use === 'farm') return null;
    if (gap) { const gc = gapCell(); if (gc) { size = gc[0].key; road = gc[1]; } }
    const s = sizeNow(); if (!s) return null;
    const keepLot = !!staged && staged.road === road && bkey(staged.w, staged.d) === s.key, w = keepLot ? staged!.w : s.w, d = keepLot ? staged!.d : s.d;
    if (!lotSame(w, d)) stage(w, d, { use: luOf(use), ...levelOf(state), seed: 1 });
    const c = candidates(w, d), g = geo;
    if (!c.list.length || !g) return null;
    const src = c.list[Math.floor(Math.random() * c.list.length)]!, sst: ComposeState = { use: luOf(use), ...levelOf(state), seed: seedOf(use, Math.floor(Math.random() * 997)), preset: src.id };
    const { props, patches, decals } = presetFromComposition(compose(g, sst), labFrame(g), w, d, { whole: true });
    return dealHouse({ id: WIZARD_ID, use, state, w, d, props, patches, decals, road, whole: true }, true).obj;
  }
  /** shows the wizard's lot: in the presets (in memory: an unsaved draft), the lab lot composed again with it (the street kept when the size and
   *  road are the same) */
  function wizardShow(p: LotPreset): void {
    if (draft && draft.id !== p.id) dropDraft();
    const list = lotPresets();
    setLotPresets(list.some(q => q.id === p.id) ? replacePreset(list, p) : [...list, p]);
    draft = { id: p.id, obj: p, saved: false }; current = p.id; source = '';
    const st: ComposeState = { use: luOf(use), ...levelOf(state), seed: 1, preset: p.id };
    if (staged && lotSame(p.w, p.d)) { game.restageLab(st); staged = { ...staged, st }; } else stage(p.w, p.d, st);
  }
  /** the gallery's lots staged (T159): each slot's preset in memory (lab-gallery-k), the middle one on the lab lot, the others along the street
   *  (the neighbours' place: their keys lab-n-gal...); [] drops them, and the neighbours come back when they are on */
  function galleryStage(slots: readonly { g: LotGeom; p: LotPreset }[], mid: number): void {
    const list = lotPresets().filter(q => !q.id.startsWith('lab-gallery-'));
    if (!slots.length) { fitList = null; setLotPresets(list); game.stageLabNeighbours([]); neighs = []; neighKey = ''; neighbours(); return; }
    if (draft && !draftSaved()) dropDraft();
    draft = null;
    setLotPresets([...lotPresets().filter(q => !q.id.startsWith('lab-gallery-')), ...slots.map(s => s.p)]);
    const st = (id: string): ComposeState => ({ use: luOf(use), ...levelOf(state), seed: 1, preset: id }), m = slots[mid]!;
    current = m.p.id; source = '';
    if (staged && lotSame(m.p.w, m.p.d)) { game.restageLab(st(m.p.id)); staged = { ...staged, st: st(m.p.id) }; } else stage(m.p.w, m.p.d, st(m.p.id));
    neighs = []; neighKey = 'gallery';
    game.stageLabNeighbours(slots.filter((_, k) => k !== mid).map((s, k) => ({ key: `lab-n-gal${k}`, g: s.g, st: st(s.p.id) })));
  }
  /** the exam's row staged (T161, dev/lot-exam.ts): the lab's road the row's, the middle lot on the lab lot and the others along the street at
   *  their own sizes (a gap between; the exam's neighbours, keys lab-n-exam...), each composed with its own state and frozen preset */
  function examStage(r: Road, row: readonly { w: number; d: number; st: ComposeState }[], mid: number): LotGeom[] {
    if (draft && !draftSaved()) dropDraft();
    draft = null; current = null; source = ''; fitList = null;
    road = r;
    const m = row[mid]!;
    stage(m.w, m.d, m.st);
    const g = geo!, GAP = 3, at: number[] = [];
    at[mid] = 0;
    for (let k = mid + 1; k < row.length; k++) at[k] = at[k - 1]! + row[k - 1]!.w + GAP;
    for (let k = mid - 1; k >= 0; k--) at[k] = at[k + 1]! - row[k]!.w - GAP;
    const gs = row.map((l, k): LotGeom => (k === mid ? g : { o: { x: g.o.x + g.u.x * at[k]!, y: g.o.y + g.u.y * at[k]! }, u: g.u, n: g.n, w: l.w, d: l.d }));
    neighs = []; neighKey = 'exam';
    game.stageLabNeighbours(gs.map((q, k) => ({ key: `lab-n-exam${k}`, g: q, st: row[k]!.st })).filter((_, k) => k !== mid));
    return gs;
  }
  /** the wizard (or the gallery) is off: its lots go from the presets, and the lab shows the cell's first variant */
  function wizardLeave(): void {
    setLotPresets(lotPresets().filter(q => q.id !== WIZARD_ID && !q.id.startsWith('lab-gallery-')));
    if (draft?.id === WIZARD_ID) draft = null;
    current = null; variant = -1;
    void act(() => generate(1));
  }
  /** a wizard lot kept as a lab draft preset too (the wizard's toggle): a new id, saved; its id */
  async function keepDraft(p: LotPreset): Promise<string> {
    const id = `lab-${use}-${state}-${bkey(p.w, p.d)}-r${road}-wz${Date.now().toString(36)}`, q: LotPreset = { ...p, id };
    setLotPresets([...lotPresets(), q]);
    await saveLotPresets([id]);
    return id;
  }
  /** a point of the lab lot's frame (tiles) on screen (viewport px), or null with no lot staged */
  function toScreen(x: number, y: number): { x: number; y: number } | null {
    const g = geo; if (!g) return null;
    const w = toWorld(frameOf(g), x, y), c = game.cam, o = origin();
    return { x: o.x + (worldX(w.x, w.y) - c.X) * c.z, y: o.y + (worldY(w.x, w.y) - c.Y) * c.z };
  }
  /** a house's allocation set (null: unset, it suits everything again), saved through the dev server's per-house merge */
  async function setAlloc(id: string, a: HouseAlloc | null): Promise<void> {
    await saveAllocation(id, a);
    message = a ? `${id}: suits ${a.roads.length ? a.roads.map(r => ARROW[r]).join(' ') : 'no road'} · ${a.states.length ? a.states.map(s => STATE_WORDS[s]).join(', ') : 'no state'} (saved to house-allocations.json)` : `${id}: allocation cleared: it suits every road and state again (saved)`;
  }

  // ---------- the panels
  /** what the panels show, as a string: the periodic check draws them only when this changed */
  function sig(): string { return [use, state, size, road, variant, current, message, source, lockAngle, lockSize, draftSaved(), lotPresets().length, Object.keys(allocations().houses).length, lab().map(p => `${p.id}${p.approved ? '+' : ''}${p.props.length}`).join(';')].join('|'); }
  /** the DRAWER: the lot choice only (type, state, size with the steppers, road angle, New lot's locks), compact */
  function renderDrawer() {
    const d = shell.drawer, farm = use === 'farm';
    const types = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:5px');
    for (const [u, t] of TYPES) types.append(btn(t, `padding:7px 2px;font-weight:700;${use === u ? ON : BTN}`, () => { if (u !== use) void act(() => { use = u; return retype(); }); }));
    const other = el('select', `${SEL};margin-top:5px`);
    other.append(new Option('More: car park, tour shop, civic', ''));
    for (const u of MORE) other.append(new Option(USE_NAME[u], u));
    other.value = MORE.includes(use) ? use : '';
    other.addEventListener('change', () => { const u = other.value as PresetUse; if (u && u !== use) void act(() => { use = u; return retype(); }); });
    const st = el('div', 'display:flex;gap:5px');
    for (const [s, t] of STATES) {
      const b = btn(t, `flex:1;padding:6px 2px;${state === s ? ON : BTN}${farm ? 'opacity:.45;cursor:default;' : ''}`, () => { if (s !== state) void act(() => { state = s; return retype(); }); }, farm ? 'a farm has one state' : s === 'declined' ? 'declined (decline 2 or more): the owner\'s decrepit' : '');
      b.disabled = farm; st.append(b);
    }
    const ss = sizes(), sel = el('select', SEL);
    if (!ss.length) sel.append(new Option('no presets of this type and state', ''));
    for (const s of ss) sel.append(new Option(`${sizeLabel(s)} · ${approvedIn(s.key, null)} approved`, s.key));
    sel.value = size;
    sel.addEventListener('change', () => { size = sel.value; void act(() => { variant = -1; return regen(); }); });
    const comp = el('div', 'display:grid;grid-template-columns:repeat(3,40px);gap:4px;justify-content:center;margin-top:2px');
    for (const r of COMPASS) {
      if (r === null) { const c = el('div', 'display:flex;align-items:center;justify-content:center'); c.append(el('div', 'width:14px;height:14px;border-radius:3px;background:#64748b')); comp.append(c); continue; }
      const green = approvedIn(size, r) > 0;
      const b = btn(ARROW[r]!, `position:relative;width:40px;height:40px;padding:0;font-size:19px;${road === r ? ON : BTN}`, () => { void act(() => { road = r; variant = -1; return regen(); }); }, `Road ${r}: ${ROAD_WORDS[r]}${green ? ' (approved presets here)' : ''}`);
      if (green) b.append(el('span', 'position:absolute;top:3px;right:3px;width:6px;height:6px;border-radius:50%;background:#22c55e'));
      comp.append(b);
    }
    const locks = el('div', 'display:flex;gap:12px;flex-wrap:wrap');
    locks.append(check('angle', lockAngle, v => { lockAngle = v; render(); }, 'New lot keeps the road angle'), check('size', lockSize, v => { lockSize = v; render(); }, 'New lot keeps the size'));
    d.replaceChildren(panelHead('LOT', '◂', () => shell.fold('drawer', true)), el('div', 'opacity:.7;font-size:12px', 'Which lot: the game composes it on one street.'),
      heading('TYPE'), types, other, heading('STATE'), st, heading('SIZE'), sel, sizeSteps(), heading('ROAD ANGLE'), comp,
      el('div', 'text-align:center;opacity:.75;font-size:12px;margin-top:3px', `${ARROW[road]} road ${road}: ${ROAD_WORDS[road]}`), heading('NEW LOT KEEPS'), locks);
  }
  /** the W and D steppers of the current lab preset (under the size select): − and + take it a step smaller or larger (1 tile; a farm 4), kept in its range (lots 6..40 by 6..60, farms 20..120 by 30..200); disabled with no current preset or at a limit */
  function sizeSteps(): HTMLElement {
    const p = curPreset(), k = use === 'farm' ? 4 : 1;
    const [w0, w1, d0, d1] = use === 'farm' ? [20, 120, 30, 200] : [6, 40, 6, 60];
    const row = el('div', 'display:flex;gap:4px;align-items:center;margin-top:5px;white-space:nowrap');
    const axis = (name: 'w' | 'd', lo: number, hi: number) => {
      const v = p ? p[name] : 0;
      row.append(el('span', 'margin:0 2px 0 4px;font-size:12px', `${name === 'w' ? 'W' : 'D'} ${p ? v : '-'}`));
      for (const s of [-k, k]) {
        const n = within(v + s, lo, hi), b = btn(s < 0 ? '−' : '+', `${BTN}padding:1px 8px`, () => { if (p) void act(() => resize(name === 'w' ? n : p.w, name === 'd' ? n : p.d)); }, `${s < 0 ? 'smaller' : 'larger'} ${name === 'w' ? 'width' : 'depth'}: ${k} tile${k > 1 ? 's' : ''}`);
        b.disabled = !p || (s < 0 ? v <= lo : v >= hi);
        row.append(b);
      }
    };
    axis('w', w0, w1); axis('d', d0, d1);
    return row;
  }
  /** a thin divider of the toolbar */
  const bar = () => el('div', 'width:1px;align-self:stretch;background:#334155;margin:0 2px');
  /** the TOOLBAR over the map: the variants, Generate, New lot; the preset's state chip, Save draft, Approve, Approve & next gap, Discard; Undo;
   *  the view toggles; the keys */
  function renderToolbar() {
    const p = curPreset(), t = shell.toolbar;
    const [chipT, bg, fg] = !p ? ['no lot', '#1e293b', '#94a3b8'] : unsaved(p.id) ? ['unsaved draft', '#92400e', '#fde68a'] : p.approved ? ['approved', '#14532d', '#86efac'] : ['saved draft', '#0c4a6e', '#7dd3fc'];
    const tog = (text: string, on: boolean, f: () => unknown, tip: string) => btn(text, on ? ON : BTN, () => act(f), tip);
    const views = [tog('Lot grid (L)', gridOn, () => setGrid(!gridOn), "the lot's boundary and its cells (1 tile = 2 m), and the neighbours' boundaries, on the ground under the sprites"),
      tog('Neighbours (N)', neighOn, () => setNeigh(!neighOn), use === 'farm' ? 'a farm stands alone on its country road: no neighbours' : 'the lots round this one on its street (two each way, three across), as the game would draw them (never edited)'),
      tog('Person', personOn, () => { personOn = !personOn; }, 'a townsperson stands at the pointer over the map, for scale (its feet on the point under the pointer)'),
      el('div', 'flex:1'),
      btn('?', `${BTN}font-weight:800;padding:4px 11px`, () => toggleHelp(), 'the keys (?)')];
    // T183: the mode switch, lit: Select (the editor's, or the wizard's select) or Draw (a ground material)
    const modes = use === 'farm' ? [] : [
      btn('↖ Select (V)', paint === null ? ON : BTN, () => { setPaint(null); render(); palette.draw(); }, wizard.on() ? 'Select: click an offered item, Shift or Ctrl+click adds, drag a box; Del deletes' : 'Select: click, Shift+click or drag a box to pick sprites and decals; move, copy and paste them'),
      btn(paint ? `✎ Draw: ${paint.name} (B)` : '✎ Draw (B)', paint !== null ? `${ON}border-color:#fde68a;color:#fef3c7;` : BTN, () => { setPaint(paint ? null : lastSw); render(); palette.draw(); }, 'Draw a ground material (pick one under Ground in the palette): drag paints with a round brush, Shift+drag erases, [ ] brush size, R Shape (a rectangle), Esc or V back to Select'),
      bar()];
    // the wizard's own bar while it runs (its keys as buttons), the view toggles kept
    if (wizard.on()) { t.replaceChildren(...modes, ...wizard.bar(), bar(), ...views); return; }
    if (gallery.on()) { t.replaceChildren(...gallery.bar(), bar(), ...views); return; }
    t.replaceChildren(
      ...modes,
      wizard.toggleBtn(), gallery.toggleBtn(),
      btn('◀ Variant', BTN, () => act(() => generate(-1)), 'the previous variant (Shift+G)'),
      btn('Generate ▶', ON, () => act(generateHere), 'this lot again (its type, size and road angle): a new layout, seed and building that suits its road and state'),
      btn('New lot ▶', BTN, () => act(newLot), 'a random size and road angle, as the drawer\'s locks allow; both locked: the next variant'),
      bar(),
      el('span', `border-radius:999px;padding:2px 10px;font-size:12px;background:${bg};color:${fg};white-space:nowrap`, chipT),
      btn('Save draft', BTN, () => act(save), 'Ctrl+S'),
      ...(p ? [btn(p.approved ? 'Unapprove' : 'Approve', p.approved ? BTN : GO, () => act(() => approve(p.id, !p.approved)))] : []),
      btn('Approve & next gap', GO, () => act(approveNext), 'Ctrl+Enter'),
      ...(p ? [btn('Discard', DANGER, () => act(() => remove(p.id)), 'remove this preset')] : []),
      bar(),
      btn('↶ Undo', BTN, () => act(() => { if (!editorAct('undo')) message = 'the map editor is not on yet'; }), 'Ctrl+Z'),
      bar(),
      ...views);
  }
  /** the Lot grid on or off (L) */
  function setGrid(v: boolean) { gridOn = v; syncGrid(); message = v ? "lot grid on: the lot's boundary and its 1-tile cells" : ''; }
  /** the Neighbours on or off (N): staged round the lot, or dropped */
  function setNeigh(v: boolean) { neighOn = v; neighbours(); message = v ? (use === 'farm' ? 'a farm has no neighbours here (it stands alone on its country road)' : `neighbours on: ${neighs.length} lots round this one, as the game draws them (not edited)`) : ''; }
  /** the keys overlay on or off */
  function toggleHelp(v = shell.help.style.display === 'none') { shell.help.style.display = v ? 'flex' : 'none'; }
  /** the house allocation of a house (its base id): the compass of the road angles it suits (lit green; this lot's road outlined), the states it
   *  suits, whether it suits this lot, how many of its pool and family suit this lot, and Everything / Clear. A click toggles one and saves it */
  function allocBox(id: string, title: string): HTMLElement {
    const b = baseOf(id), a = allocOf(allocations(), b), box = el('div', 'border:1px solid #334155;border-radius:8px;padding:8px;margin-top:6px;background:rgba(15,23,42,.6)');
    box.append(heading(title, 'margin-top:0'));
    const top = el('div', 'display:flex;gap:10px;align-items:center');
    const comp = el('div', 'display:grid;grid-template-columns:repeat(3,38px);gap:4px;flex:none');
    for (const r of COMPASS) {
      if (r === null) { comp.append(picBox(b, 38)); continue; }
      const on = !a || a.roads.includes(r), here = r === road;
      comp.append(btn(ARROW[r]!, `width:38px;height:38px;padding:0;font-size:18px;${on ? GO : BTN}${here ? 'outline:2px solid #fcd34d;outline-offset:1px;' : ''}`, () => act(() => setAlloc(b, toggled(a, { road: r }))), `road ${r}: ${ROAD_WORDS[r]}: ${on ? 'suits it (click: not)' : 'does not suit it (click: suits)'}${here ? ' · this lot\'s road' : ''}`));
    }
    const right = el('div', 'flex:1;min-width:0;display:flex;flex-direction:column;gap:4px');
    for (const [s, t] of STATES) {
      const on = !a || a.states.includes(s);
      right.append(btn(`${on ? '✓' : '✗'} ${t}`, `text-align:left;${on ? GO : BTN}${s === state ? 'outline:2px solid #fcd34d;outline-offset:1px;' : ''}`, () => act(() => setAlloc(b, toggled(a, { state: s }))), `${on ? 'suits' : 'does not suit'} ${STATE_WORDS[s]} lots (click toggles)`));
    }
    top.append(comp, right);
    const ok = allows(allocations(), b, road, state), c = suitCounts(b, houseOk);
    box.append(top,
      el('div', `margin-top:6px;font-weight:600;color:${ok ? '#86efac' : '#fca5a5'}`, ok ? `✓ suits this lot (${lotWords()})` : `✗ not dealt on this lot (${lotWords()})`),
      el('div', 'font-size:12px;opacity:.85', `${c.pool} of ${c.poolAll} ${classWords(b)} houses suit ${lotWords()} · ${c.family} of ${c.familyAll} in the family`),
      el('div', 'font-size:12px;opacity:.65;margin-top:2px', a ? 'set (house-allocations.json)' : 'not set yet: it suits every road and state'));
    const row = el('div', 'display:flex;gap:5px;margin-top:5px');
    row.append(btn('All on', BTN, () => act(() => setAlloc(b, { roads: [...ROADS], states: [...STATE_KEYS] })), 'suits every road and state (set)'), btn('Clear', BTN, () => act(() => setAlloc(b, null)), 'unset: the house suits everything again'));
    box.append(row, mono(b, 'opacity:.6;margin-top:4px'));
    return box;
  }
  /** the SELECTION section of the inspector: one sprite (its picture, name, id, size; a house's allocation), one decal, or a list of many */
  function selSection(s: EditorSel): HTMLElement[] {
    if (!s.items.length) return [];
    const out: HTMLElement[] = [heading(`SELECTION · ${s.props} sprite${s.props === 1 ? '' : 's'}${s.decals ? `, ${s.decals} decal${s.decals === 1 ? '' : 's'}` : ''}`, 'margin-top:4px')];
    if (s.items.length === 1) {
      const t = s.items[0]!;
      if (t.kind === 'decal') out.push(mono(t.id), el('div', 'font-size:12px;opacity:.85', `decal · scale ${Math.abs(t.scale).toFixed(2)}${t.scale < 0 ? ' · mirrored' : ''}`));
      else {
        const it = LIBRARY.find(i => i.id === t.id), own = ownerScaleOf(t.id), drawn = (t.index >= 0 ? t.scale * own : t.scale), fp = footprintOf(t.id, drawn, false);
        const row = el('div', 'display:flex;gap:8px;align-items:flex-start'), txt = el('div', 'min-width:0;flex:1');
        txt.append(el('div', 'font-weight:700', it?.name ?? t.id), mono(t.id, 'opacity:.75'), el('div', 'font-size:12px;opacity:.85;margin-top:2px', `${it?.cat ?? ''}`));
        row.append(picBox(t.id, 64), txt);
        out.push(row, el('div', 'font-size:12px;margin-top:4px', t.index >= 0 ? `size x${t.scale.toFixed(2)} of its library size x${own.toFixed(2)} = drawn x${drawn.toFixed(2)}` : `drawn x${drawn.toFixed(2)} (a procedural piece or a player's prop: not the preset's)`),
          el('div', 'font-size:12px', `footprint ${(fp[2] - fp[0]).toFixed(1)} × ${(fp[3] - fp[1]).toFixed(1)} tiles · view ${t.view}`));
        if (t.index >= 0 && isHouseLike(t.id)) out.push(allocBox(t.id, 'HOUSE ALLOCATION'));
      }
    } else {
      const list = el('div', 'font-size:12px;max-height:180px;overflow:auto');
      for (const t of s.items.slice(0, 40)) list.append(mono(`${t.kind === 'decal' ? 'decal ' : ''}${t.id} x${Math.abs(t.scale).toFixed(2)}`));
      if (s.items.length > 40) list.append(el('div', 'opacity:.7', `and ${s.items.length - 40} more`));
      out.push(list);
      const house = s.items.find(t => t.kind === 'prop' && t.index >= 0 && isHouseLike(t.id));
      if (house) out.push(allocBox(house.id, 'HOUSE ALLOCATION (the selection\'s house)'));
    }
    const info = editorText().info;
    if (info && info !== EDITOR_IDLE) out.push(el('div', 'font:11px/1.35 ui-monospace,Consolas,monospace;opacity:.6;white-space:pre-wrap;word-break:break-all;margin-top:6px', info));
    return out;
  }
  /** the LOT section of the inspector: the preset (its id, props, where it came from), the lot's house allocation (nothing selected), the lot's
   *  tools (Next gap, Review drafts, Change house, Paste), the presets of this size and road, the coverage of this type and state */
  function lotSection(s: EditorSel): HTMLElement[] {
    const p = curPreset(), out: HTMLElement[] = [heading('THIS LOT')];
    if (!p) out.push(el('div', 'opacity:.75', 'no lot composed yet: pick a type, state, size and road, then Generate'));
    else {
      out.push(mono(p.id), el('div', 'font-size:12px;opacity:.85', `${USE_NAME[p.use]} · ${STATE_WORDS[p.state]} · ${p.w} × ${p.d} tiles · ${p.props.length} props${p.decals ? ` · ${p.decals.length} decals` : ''}`));
      if (source) out.push(el('div', 'font-size:11px;opacity:.7;white-space:pre-wrap;margin-top:2px', source));
      out.push(roleBox(p));
    }
    const tools = el('div', 'display:flex;flex-wrap:wrap;gap:5px;margin-top:6px');
    const ed = (a: LabAct) => () => act(() => { if (!editorAct(a)) message = 'the map editor is not on yet'; });
    tools.append(btn('Next gap', BTN, () => act(nextGap), 'the next size and road angle of this type and state with no approved preset'), btn('Review drafts', BTN, () => act(nextDraft), 'open the next saved draft of this type'),
      btn('Change house (H)', BTN, ed('house'), 'the lot\'s house (or the selected one) for the next of its family and size class that suits this road and state; Shift+H the one before'), btn('Paste (Ctrl+V)', BTN, ed('paste'), 'what was copied, at the pointer\'s last point on the lot'));
    out.push(tools);
    if (p && geo && use !== 'farm' && !s.items.length) {
      const i = mainBuilding(p, q => isHouseLike(q.id), frameHalf(labFrame(geo)));
      if (i >= 0) out.push(allocBox(p.props[i]!.id, 'THE LOT\'S HOUSE: ALLOCATION'));
    }
    out.push(heading('PRESETS HERE (THIS SIZE AND ROAD)'), hereList(), heading('COVERAGE (THIS TYPE AND STATE)'), coverage(), heading('MASTERS (AUTO-SIZE)'), mastersBox());
    return out;
  }
  /** the preset's part in the auto-size: a master (Save or Approve derives the smaller sizes), derived (from which master; a hand edit detaches
   *  it), detached, or hand-made at another size than the master's (a button to the master size) */
  function roleBox(p: LotPreset): HTMLElement {
    const box = el('div', 'border-radius:8px;padding:6px 8px;margin-top:6px;font-size:12px'), ss = sizesOf(p.use, p.state), L = largestSize(ss);
    if (p.road === undefined || p.use === 'farm' || !L) return box;
    const tag = (t: string, bg: string) => el('span', `border-radius:999px;padding:1px 8px;margin-right:6px;font-weight:700;background:${bg}`, t);
    if (isMaster(p, ss)) {
      const mb = bucketOf(p.w, p.d), of = ss.filter(z => z.bw <= mb.w && z.bd <= mb.d && z.key !== `${mb.w}x${mb.d}`).length, kids = lotPresets().filter(q => q.derived === p.id).length;
      box.style.background = '#1e3a5f';
      box.append(tag('MASTER', '#0369a1'), `the largest ${USE_NAME[p.use]} ${STATE_WORDS[p.state]} size: Save draft or Approve derives the ${of} smaller sizes on ${ARROW[p.road]} road ${p.road} (${kids} derived now)`);
    } else if (p.derived) {
      const m = p.derived;
      box.style.background = '#3b2f12';
      box.append(tag('DERIVED', '#a16207'), `from ${m.replace(`lab-${p.use}-${p.state}-`, '')}: made again when its master is saved; a hand edit here detaches it`, el('br'), btn('Open the master', `${BTN}margin-top:4px`, () => act(() => open(m)), m));
    } else if (p.detached) {
      box.style.background = '#1f2937';
      box.append(tag('DETACHED', '#475569'), `hand-edited away from ${p.detached.replace(`lab-${p.use}-${p.state}-`, '')}: the master leaves this size alone`);
    } else {
      box.style.background = '#1f2937';
      box.append(tag('HAND-MADE', '#475569'), `the master size of ${USE_NAME[p.use]} ${STATE_WORDS[p.state]} is ${sizeLabel(L)}: a lot laid out there derives this size and the others`, el('br'),
        btn(`Go to ${sizeLabel(L)}`, `${BTN}margin-top:4px`, () => act(() => cellGo(L, road)), 'open (or generate) the master size on this road'));
    }
    return box;
  }
  /** the masters report: this type and state's master on each road and how many sizes it covers; then every type and state: the masters, the
   *  derived presets, and the cells (type, state, size, road angle) with an approved preset of them all */
  function mastersBox(): HTMLElement {
    const box = el('div', 'font-size:12px'), all = lotPresets(), states = STATE_KEYS;
    const rep = mastersReport(all, sizesOf, USES.filter(u => u !== 'farm'), states), here = rep.masters.filter(m => m.use === use && m.state === state);
    const t = el('div', 'display:grid;grid-template-columns:22px 1fr auto;gap:2px 6px;align-items:center');
    for (const r of ROADS) {
      const m = here.filter(x => x.road === r);
      t.append(el('span', 'color:#7dd3fc;text-align:center', ARROW[r]!), el('span', 'font:11px ui-monospace,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.85', m.length ? m.map(x => x.id.replace(`lab-${use}-${state}-`, '')).join(', ') : '—'),
        el('span', `white-space:nowrap;${m.length ? 'color:#86efac' : 'opacity:.5'}`, m.length ? m.map(x => `${x.covers}/${x.of}`).join(' ') : 'no master'));
    }
    const pct = rep.cells ? Math.round((100 * rep.covered) / rep.cells) : 0;
    box.append(t, el('div', 'margin-top:5px;opacity:.9', `All types and states: ${rep.masters.length} master${rep.masters.length === 1 ? '' : 's'} · ${rep.derived} derived preset${rep.derived === 1 ? '' : 's'} · ${rep.covered} of ${rep.cells} cells (type × state × size × road) approved (${pct}%)`));
    return box;
  }
  /** the INSPECTOR: the selection (when there is one), then the lot */
  function renderInspector() {
    const s = editorSel();
    shell.inspector.replaceChildren(panelHead('INSPECTOR', '▸', () => shell.fold('inspector', true)), ...(wizard.on() ? wizard.panel() : []), ...(gallery.on() ? gallery.panel() : []), ...selSection(s), ...lotSection(s));
  }
  /** the coverage of this type and state: a row per size, a column per road angle; the approved count (bold), the drafts (small), the colour, the current cell outlined; a click opens or generates it */
  function coverage(): HTMLElement {
    const box = el('div'), ss = sizes();
    if (!ss.length) { box.append(el('div', 'opacity:.75', 'no presets of this type and state yet')); return box; }
    const t = el('table', 'width:100%;border-collapse:separate;border-spacing:2px;font-size:11px'), hr = el('tr');
    hr.append(el('td', 'opacity:.7', 'size'));
    ARROW.forEach(a => hr.append(el('td', 'text-align:center;color:#7dd3fc;font-size:13px', a)));
    t.append(hr);
    let ok = 0, all = 0;
    for (const s of ss) {
      const tr = el('tr');
      tr.append(el('td', 'white-space:nowrap;padding-right:2px', sizeLabel(s)));
      for (let r = 0; r < 8; r++) {
        const rr = r as Road, a = approvedIn(s.key, rr), dr = cell(s.key, rr).length - a, cur = s.key === size && rr === road;
        all++; if (a) ok++;
        const td = el('td', `text-align:center;padding:3px 0;border-radius:4px;cursor:pointer;background:${a ? '#14532d' : dr ? '#713f12' : '#1e293b'};${cur ? 'outline:2px solid #38bdf8;' : ''}`);
        td.append(el('b', '', String(a)));
        if (dr) td.append(el('small', 'opacity:.85', `+${dr}`));
        td.title = `${sizeLabel(s)}, road ${r}: ${a} approved, ${dr} drafts`;
        td.addEventListener('click', () => { void act(() => cellGo(s, rr)); });
        tr.append(td);
      }
      t.append(tr);
    }
    const here = lab().filter(p => p.use === use && p.state === state), appTot = here.filter(p => p.approved).length;
    box.append(t, el('div', 'margin-top:4px;opacity:.85;font-size:12px', `${ok} of ${all} cells approved · ${appTot} approved presets · ${here.length - appTot} drafts`));
    return box;
  }
  /** the lab presets of this type, state, size and road: an approve checkbox, the id shortened, the props, Open and remove; the current one lit */
  function hereList(): HTMLElement {
    const box = el('div'), l = cell(size, road);
    if (!l.length) { box.append(el('div', 'opacity:.75;font-size:12px', 'no preset made for this size and road angle yet')); return box; }
    for (const p of l) {
      const row = el('div', `display:flex;gap:6px;align-items:center;padding:2px 4px;border-radius:4px;font-size:12px;${p.id === current ? 'background:#0c4a6e;' : ''}`);
      const ck = el('input'); ck.type = 'checkbox'; ck.checked = !!p.approved; ck.title = 'approved: the game draws it on the matching lots';
      ck.addEventListener('change', () => { void act(() => approve(p.id, ck.checked)); });
      // ★ a master, ↳ derived from one
      const mark = isMaster(p, sizes()) ? '★ ' : p.derived ? '↳ ' : '';
      const name = el('span', 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,Consolas,monospace', mark + p.id.replace(`lab-${use}-${state}-`, ''));
      name.title = `${p.id}${mark === '★ ' ? '\nthe master of this type, state and road' : p.derived ? `\nderived from ${p.derived}` : ''}`;
      row.append(ck, name, el('span', 'opacity:.7;white-space:nowrap', `${p.props.length}`), btn('Open', `${BTN}padding:1px 6px`, () => { void act(() => open(p.id)); }), btn('✕', `${BTN}padding:1px 6px`, () => { void act(() => remove(p.id)); }, 'remove'));
      box.append(row);
    }
    return box;
  }
  /** the SELECTION BAR's buttons and count (drawn when the selection changed; placed beside it every frame) */
  function renderSelbar(s: EditorSel) {
    const n = s.items.length;
    const b = (text: string, a: LabAct, tip: string, css = BTN) => btn(text, `${css}padding:4px 8px`, e => { const k: LabAct = a === 'house' && e.shiftKey ? 'house-back' : a; void act(() => { if (!editorAct(k)) message = 'the map editor is not on yet'; }); }, tip);
    shell.selbar.replaceChildren(
      el('span', 'font-weight:700;color:#7dd3fc;padding:0 4px;white-space:nowrap', `${n} selected`),
      b('⟳ Turn', 'turn', 'R: each selected sprite a quarter turn; a decal mirrors'),
      b('⌂ Change house', 'house', 'H: the selected house for the next of its family and size class that suits this road and state; Shift+click or Shift+H: the one before'),
      b('− Smaller', 'smaller', '['), b('+ Bigger', 'bigger', ']'),
      b('Copy', 'copy', 'Ctrl+C: the selection, its layout, sizes, turns and mirrors'), b('Paste', 'paste', 'Ctrl+V: what was copied, at the pointer\'s last point on the lot'),
      b('Duplicate', 'duplicate', 'Ctrl+D: a copy beside it, selected'),
      b('✕ Delete', 'delete', 'Del', DANGER));
  }
  /** places the selection bar beside the selection (above it, else below it, kept in the free area); hidden with nothing selected or while painting */
  function placeSelbar(s: EditorSel) {
    const sb = shell.selbar;
    if (!s.items.length || !s.box || paint !== null || decalMode !== null) { sb.style.display = 'none'; return; }
    sb.style.display = 'flex';
    const a = shell.free(), w = sb.offsetWidth, h = sb.offsetHeight;
    let y = s.box.y0 - h - 12;
    if (y < a.T + 4) y = s.box.y1 + 12;
    sb.style.left = `${within((s.box.x0 + s.box.x1) / 2 - w / 2, a.L + 6, Math.max(a.L + 6, a.R - w - 6))}px`;
    sb.style.top = `${within(y, a.T + 4, Math.max(a.T + 4, a.B - h - 6))}px`;
  }
  /** the status line under the toolbar: the last message (hidden when there is none) */
  function drawStatus() { shell.status.textContent = message; shell.status.style.display = message && started ? 'block' : 'none'; }
  /** the houses Change house may deal: those that suit this lot's road and state */
  function syncHouseFilter() { setHouseFilter(use === 'farm' ? null : houseOk, lotWords()); }
  /** draws the panels and the message; the place kept for a reload */
  function render() {
    if (!started) return;
    syncHouseFilter();
    renderDrawer(); renderToolbar(); renderInspector(); drawStatus(); syncBadges();
    if (shell.place()) fitCam();
    sigLast = sig(); keep();
  }
  /** the lab's stored place (sessionStorage); null when there is none, it is unreadable, or storage is off */
  function stored(): Record<string, unknown> | null { try { const o: unknown = JSON.parse(sessionStorage.getItem(SESSION) ?? 'null'); return o && typeof o === 'object' ? o as Record<string, unknown> : null; } catch { return null; } }
  /** keeps the lab's place (type, state, size, road, locks, the current preset, the toggles, the folded panels) in sessionStorage; a blocked or full store only loses it */
  function keep(): void { try { sessionStorage.setItem(SESSION, JSON.stringify({ use, state, size, road, lockAngle, lockSize, current, person: personOn, grid: gridOn, neighbours: neighOn, folds: shell.folds })); } catch { /* the place is not kept */ } }

  // ---------- start, the keys, the painting, the frame
  /** the game is ready: the screen shown, the palette drawn, the stored place restored (each field checked; a size the use and state lack falls back to the default) and its preset opened, else the first variant generated (residential, built, 10 x 16 when it exists, road 0 by default) */
  function start() {
    started = true; shell.show(true);
    const r = stored();
    use = valueOr(r?.use, USES, 'res'); state = use === 'farm' ? 'built' : valueOr(r?.state, STATE_KEYS, 'built');
    road = valueOr(r?.road, ROADS, 0); lockAngle = r?.lockAngle === true; lockSize = r?.lockSize === true; personOn = r?.person === true; gridOn = r?.grid === true; neighOn = r?.neighbours === true; variant = -1;
    const l = sizes(), sz = r?.size, want = typeof sz === 'string' ? sz : '';
    size = l.some(s => s.key === want) ? want : (l.some(s => s.key === '10x16') ? '10x16' : (l[0]?.key ?? ''));
    palette.draw();
    live = window.setInterval(() => {
      // a reload from disk (another lab tab or the editor saved) drops an unsaved draft from the presets: it goes back in and the lot draws it again
      if (current && draft && draft.id === current && !draft.saved && !lotPresets().some(p => p.id === current)) {
        setLotPresets([...lotPresets(), draft.obj]); if (staged) game.restageLab(staged.st);
      } else if (current && !lotPresets().some(p => p.id === current)) { current = null; draft = null; message = 'the preset is gone from lot-presets.json (reloaded from disk): Generate again'; }
      if (sig() !== sigLast) render();
    }, 1500);
    const cv = r?.current, cur = typeof cv === 'string' ? cv : null;
    if (cur && lab().some(p => p.id === cur)) void act(() => open(cur));
    else void act(() => generate(1));
  }
  /** what a stroke paints: the wizard's lot while the wizard runs (its own undo; saved with the sample), else the lab's preset */
  function strokeTarget(): { id: string; w: number; d: number; wiz: boolean } | null {
    if (wizard.on()) { const l = wizard.ground(); return l ? { id: WIZARD_ID, w: l.w, d: l.d, wiz: true } : null; }
    const p = curPreset(); return p ? { id: p.id, w: p.w, d: p.d, wiz: false } : null;
  }
  /** a press on the map in Draw: a stroke starts (Shift: erasing), the brush's cells under it at once (Shape: the rectangle's first corner).
   *  Window capture: the game's pan, the editor's pick and the wizard's select never see it */
  const onPaintDown = (e: PointerEvent) => {
    const m = paint;
    if (m === null || e.button !== 0 || !(e.target instanceof HTMLCanvasElement)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const t = strokeTarget(), q = framePt(e);
    if (!t) { message = 'Generate a lot first'; render(); return; }
    if (!q) return;
    const x = within(q.x, 0, t.w), y = within(q.y, 0, t.d), sx = snapHalf(q.x, t.w), sy = snapHalf(q.y, t.d);
    stroke = { id: t.id, sw: m, w: t.w, d: t.d, path: [x, y], cells: shape ? new Set() : strokeCells(grid(t.w, t.d), [x, y], brushR), erase: e.shiftKey, x0: sx, y0: sy, x1: sx, y1: sy, wiz: t.wiz };
    brushAt = q; drawPaint();
  };
  /** the pointer in Draw: the brush circle follows it; a stroke adds the brush's cells along the way (Shape: the rectangle's far corner) */
  const onPaintMove = (e: PointerEvent) => {
    if (paint === null) return;
    const q = e.target instanceof HTMLCanvasElement ? framePt(e) : null, s = stroke;
    brushAt = q;
    if (s) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (q) {
        const x = within(q.x, 0, s.w), y = within(q.y, 0, s.d);
        if (shape) { s.x1 = snapHalf(q.x, s.w); s.y1 = snapHalf(q.y, s.d); }
        else { const n = s.path.length; for (const c of strokeCells(grid(s.w, s.d), [s.path[n - 2]!, s.path[n - 1]!, x, y], brushR)) s.cells.add(c); s.path.push(x, y); }
      }
    }
    drawPaint();
  };
  /** the release lays the stroke (a cancel too: a stroke is never dropped) */
  const onPaintUp = (e: PointerEvent) => {
    if (!stroke) return;
    e.preventDefault(); e.stopImmediatePropagation();
    finishStroke();
  };
  /** the stroke in progress laid: merged into its target's one patch of its material (lot-paint.ts applyStroke; erasing takes the cells out),
   *  one undo step (the lab's: the editor's Undo and Ctrl+Z; the wizard's: its own), the lab's preset saved as the lab saves every edit */
  function finishStroke(): void {
    const s = stroke; stroke = null; drawPaint();
    if (!s) return;
    if (shape && (Math.abs(s.x1 - s.x0) < 0.5 || Math.abs(s.y1 - s.y0) < 0.5)) { message = 'Shape: drag at least half a tile each way'; render(); return; }
    const cells = shape ? rectCells(grid(s.w, s.d), s.x0, s.y0, s.x1, s.y1) : s.cells;
    if (!cells.size) return;
    const what = `${s.erase ? 'erased' : 'painted'} ${s.sw.name}`;
    if (s.wiz) {
      const l = wizard.ground(); if (!l) return;
      wizard.setGround(applyStroke(l.patches, s.sw, l.w, l.d, cells, s.erase), what);
      message = `${what} on the wizard's lot (Ctrl+Z undoes; saved with the sample)`; render(); return;
    }
    const p = lotPresets().find(q => q.id === s.id);
    if (!p) { message = 'Generate a lot first'; render(); return; }
    const before = p.patches, next = applyStroke(before, s.sw, p.w, p.d, cells, s.erase);
    void act(async () => {
      await commitLab(p, { patches: next });
      pushEditorUndo(async () => { const now = lotPresets().find(q => q.id === p.id); if (now) await commitLab(now, { patches: before }); }, what);
      message = `${what}, saved (Ctrl+Z undoes)`;
    });
  }
  /** the keys, in the capture phase, while the lab is on and not typing: ? the keys overlay (Esc closes it), g next variant, G previous, Ctrl+S
   *  save, Ctrl+Enter approve and next gap, Esc paint or decal placing off, L lot grid, N neighbours (the game's own L and N are stopped here) */
  const onKey = (e: KeyboardEvent) => {
    if (!started || typing(e.target)) return;
    const mod = e.ctrlKey || e.metaKey;
    const plain = !mod && !e.altKey, k = e.key.toLowerCase(), helpOn = shell.help.style.display !== 'none';
    // T183: the mode keys come first (in the wizard too): B Draw (the last material), V or Esc back to Select, [ ] the brush, R Shape; Ctrl+Z in
    // Draw takes the last stroke back (the editor's undo; the wizard's own while it runs)
    if (!helpOn && !gallery.on() && use !== 'farm') {
      const drawKey = !plain ? null
        : k === 'b' && !e.shiftKey ? () => setPaint(paint ? null : lastSw)
          : paint === null ? null
            : k === 'v' || e.key === 'Escape' ? () => setPaint(null)
              : e.key === '[' || e.key === ']' ? () => { brushR = stepBrush(brushR, e.key === ']' ? 1 : -1); message = `brush ${brushR} tile${brushR === 1 ? '' : 's'}`; }
                : k === 'r' ? () => { shape = !shape; message = shape ? 'Shape: drag a rectangle' : 'the brush: drag to paint'; } : null;
      if (drawKey) { e.preventDefault(); e.stopImmediatePropagation(); drawKey(); drawPaint(); render(); palette.draw(); return; }
      if (paint !== null && mod && k === 'z' && !wizard.on()) { e.preventDefault(); e.stopImmediatePropagation(); void act(() => { if (!editorAct('undo')) message = 'the map editor is not on yet'; }); return; }
    }
    // the wizard owns its keys while it runs (Space, S, Backspace, W, Esc), and the lab's own lot keys rest (only ?, L and N stay)
    // the gallery owns its keys while it is open (Space, Esc), as the wizard does
    if (gallery.on() && !helpOn) {
      if (gallery.onKey(e)) { e.preventDefault(); e.stopImmediatePropagation(); render(); return; }
      if (!(plain && (k === 'l' || e.key === '?'))) { if (plain || mod) { e.preventDefault(); e.stopImmediatePropagation(); } return; }
    } else if (wizard.on() && !helpOn) {
      if (wizard.onKey(e)) { e.preventDefault(); e.stopImmediatePropagation(); render(); return; }
      if (!(plain && (k === 'l' || k === 'n' || e.key === '?'))) { if (plain || mod) { e.preventDefault(); e.stopImmediatePropagation(); } return; }
    } else if (k === 'w' && plain && !helpOn && use !== 'farm') { e.preventDefault(); e.stopImmediatePropagation(); wizard.toggle(true); return; }
    const go: (() => unknown) | null = e.key === '?' && !mod ? () => toggleHelp() : e.key === 'Escape' && helpOn ? () => toggleHelp(false)
      : k === 'l' && plain ? () => setGrid(!gridOn) : k === 'n' && plain ? () => setNeigh(!neighOn)
        : e.key === 'Escape' && (paint !== null || decalMode !== null) ? () => { setPaint(null); setDeco(null); palette.draw(); }
          : e.key === 'g' && plain && !e.shiftKey ? () => generate(1) : e.key === 'G' && e.shiftKey && plain ? () => generate(-1)
            : mod && (e.key === 's' || e.key === 'S') ? save : mod && e.key === 'Enter' ? approveNext : null;
    if (!go) return;
    e.preventDefault(); e.stopImmediatePropagation(); void act(go);
  };
  /** the pointer over the map (the game's canvas or the overlay on it) keeps its point for the person cursor; a move anywhere else (a panel) clears it. Window capture and passive: it runs before the lab's own handlers, which stop the events */
  const onMapMove = (e: PointerEvent) => { pointer = e.target === game.canvas || e.target === game.overlay ? { x: e.clientX, y: e.clientY } : null; };
  /** the pointer left the window (no element takes it): the person goes */
  const onMapOut = (e: PointerEvent) => { if (!e.relatedTarget) pointer = null; };
  /** the window resized: the panels laid out again (their sizes follow it), the lot fitted again and the palette drawn at its thumbnail size */
  const onResize = () => { if (!started) return; if (shell.place()) fitCam(); palette.draw(); };
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
  /** each frame: the camera kept on the lot, the paint layer, the paint drag's rectangle while one is made, the person cursor, the editor's new
   *  message as the status, the selection bar (and the inspector when the selection changed) */
  function frame() {
    raf = requestAnimationFrame(frame); keepCam(); drawMask(); if (paint !== null || stroke) drawPaint(); drawPerson();
    if (!started) return;
    const ed = editorText();
    if (ed.msg !== emMsg) { emMsg = ed.msg; if (ed.msg) { message = ed.msg; drawStatus(); } }
    const s = editorSel();
    if (s.key !== selKey) { selKey = s.key; renderSelbar(s); renderInspector(); }
    placeSelbar(s);
    wizard.frame(); gallery.frame(); placeBadges();
  }

  /** the Lot grid's draw for the engine (Game.devGround): the lots syncGrid chose, none when the grid is off */
  const drawGrid = (gl: WebGL2RenderingContext, v: { X: number; Y: number; ze: number; cw: number; ch: number }) => gridLots.length > 0 && gridLayer.draw(gl, v, gridLots);
  game.devGround = drawGrid;
  // the editor is kept to the lab lot: the neighbours are never selected, and a drag on the lot's ground draws the selection box
  editorOnly('lab');
  // another tab or helper saved the house allocations: the inspector shows them
  const unAlloc = onAllocations(() => { if (started) renderInspector(); });
  document.head.append(style);
  document.body.append(mask, personEl, badgeLayer, banner);
  window.addEventListener('pointermove', onMapMove, { capture: true, passive: true }); window.addEventListener('pointerout', onMapOut, true);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('pointerdown', onPaintDown, true);
  window.addEventListener('pointermove', onPaintMove, true);
  window.addEventListener('pointerup', onPaintUp, true);
  window.addEventListener('pointercancel', onPaintUp, true);
  window.addEventListener('pointerdown', onDecalDown, true);
  window.addEventListener('resize', onResize);
  raf = requestAnimationFrame(frame);
  const poll = window.setInterval(() => { if (!game.ready) return; window.clearInterval(poll); start(); }, 200);
  return () => {
    window.clearInterval(poll); window.clearInterval(live); cancelAnimationFrame(raf); unAlloc();
    window.removeEventListener('pointermove', onMapMove, true); window.removeEventListener('pointerout', onMapOut, true);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('pointerdown', onPaintDown, true); window.removeEventListener('pointermove', onPaintMove, true);
    window.removeEventListener('pointerup', onPaintUp, true); window.removeEventListener('pointercancel', onPaintUp, true);
    window.removeEventListener('pointerdown', onDecalDown, true); window.removeEventListener('resize', onResize);
    pauseEditor(false); editorOnly(null); setHouseFilter(null);
    if (game.devGround === drawGrid) game.devGround = null;
    gridLayer.dispose(); game.stageLabNeighbours([]);
    wizard.dispose(); gallery.dispose();
    style.remove(); mask.remove(); shell.remove(); personEl.remove(); badgeLayer.remove(); banner.remove(); game.canvas.style.cursor = ''; delete (window as unknown as { __lotExam?: unknown }).__lotExam;
  };
}
