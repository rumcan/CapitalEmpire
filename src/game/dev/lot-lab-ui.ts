// The lot lab's screen (T155, #333; the owner, 2026-10-26: "make the lot building UIX area better ... theres a lot of realesatate to move some of
// that stuff out of the side drawer"): plain DOM over the game, laid out round the map. The left DRAWER holds only the lot choice (type, state,
// size, road angle); a TOOLBAR over the map the lot's actions (variants, Generate, New lot, save, approve, discard, undo) and the view toggles; a
// STATUS line under it the last message; a floating SELECTION BAR beside the selection its edits; the bottom PALETTE strip the sprites, decals and
// ground paint; the right INSPECTOR the selected house or item (and the lot: its preset, the presets here, the coverage); a "?" overlay the keys.
// Every panel collapses (its edge button) and the sizes follow the window (1920 x 1080 roomy, 1366 x 768 compact), so the map keeps the middle.
// This module holds the shell and the small DOM helpers; lot-lab.ts fills the panels.

/** the theme: a button, a lit button, a field, the panels' background and edge */
export const BTN = 'background:#1e293b;color:#e2e8f0;border:1px solid #334155;', ON = 'background:#0369a1;color:#fff;border:1px solid #38bdf8;';
export const DANGER = 'background:#7f1d1d;color:#fecaca;border:1px solid #991b1b;', GO = 'background:#166534;color:#dcfce7;border:1px solid #22c55e;';
export const SEL = 'width:100%;box-sizing:border-box;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:4px 6px;font:inherit';
const PANEL_BG = 'background:rgba(12,18,28,.95);color:#e2e8f0;font:13px/1.4 system-ui,"Segoe UI",sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.45)';
/** a DOM element with inline style and text (textContent: no markup from ids or names) */
export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, css = '', text = ''): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); e.style.cssText = css; e.textContent = text; return e; };
/** a button: its style, its text, its click handler (the handlers wrap their own failures) and a title */
export const btn = (text: string, css: string, on: (e: MouseEvent) => unknown, title = '') => { const b = el('button', `cursor:pointer;font:inherit;border-radius:6px;padding:4px 9px;white-space:nowrap;${css}`, text); b.title = title; b.addEventListener('click', e => { on(e); }); return b; };
/** a section heading (small capitals, the accent colour) */
export const heading = (text: string, css = '') => el('div', `color:#7dd3fc;font-weight:700;font-size:11px;letter-spacing:.08em;margin:12px 0 5px;${css}`, text);
/** a monospace line (ids) */
export const mono = (text: string, css = '') => el('div', `font:11px/1.35 ui-monospace,Consolas,monospace;word-break:break-all;${css}`, text);
/** a chip (the palette's groups and categories): lit when on */
export const chip = (text: string, on: boolean, click: () => unknown, title = '') => btn(text, `${on ? ON : BTN}border-radius:999px;padding:2px 10px;font-size:12px;flex:none`, click, title);
/** a labelled checkbox: set on a change */
export const check = (text: string, on: boolean, set: (v: boolean) => void, title = '') => { const l = el('label', 'display:flex;gap:4px;align-items:center;cursor:pointer;white-space:nowrap'), c = el('input'); c.type = 'checkbox'; c.checked = on; c.addEventListener('change', () => { set(c.checked); }); l.append(c, text); l.title = title; return l; };
/** a field that takes typing (the search, the selects, the game's own inputs): its keys are its own; a checkbox or a button is not one */
export const typing = (t: EventTarget | null) => t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'range'].includes(t.type)) || (t instanceof HTMLElement && t.isContentEditable);

/** the screen's sizes for a window (px): the drawer's and the inspector's widths, the palette's thumbnail size and rows. Roomy from 1600 x 950,
 *  compact below (1366 x 768 keeps a map of about 860 x 560 between the panels) */
export function sizesFor(w: number, h: number): { drawer: number; inspector: number; thumb: number; rows: number } {
  const wide = w >= 1600, tall = h >= 950;
  return { drawer: wide ? 264 : 224, inspector: wide ? 340 : 284, thumb: wide && tall ? 68 : 58, rows: tall ? 2 : 1 };
}
/** which panels are folded away (kept for a reload, sessionStorage) */
export interface Folds { drawer: boolean; inspector: boolean; palette: boolean }
/** a folded panel's rail (px) */
const RAIL = 30;
/** the palette's header row (px: its search, chips and fold button) */
const PAL_HEAD = 40;

/** the lab's screen: the panels (their bodies for lot-lab.ts to fill), the layout (place: after a resize or a fold), and the free area between
 *  them where the lot is fitted */
export interface Shell {
  drawer: HTMLElement; toolbar: HTMLElement; status: HTMLElement; selbar: HTMLElement; palette: HTMLElement; palHead: HTMLElement; palBody: HTMLElement;
  inspector: HTMLElement; help: HTMLElement; folds: Folds; thumb: number;
  /** lays the panels out for the window and the folds; true when the free area changed */
  place(): boolean;
  /** the free area on screen (viewport px) between the panels: the lot is fitted into it */
  free(): { L: number; T: number; R: number; B: number };
  fold(which: keyof Folds, v: boolean): void;
  show(on: boolean): void;
  remove(): void;
}
/** builds the shell (hidden until show): the folds start as stored, else open (the inspector folded on a window narrower than 1280) */
export function makeShell(stored: Partial<Folds> | null, onFold: () => void): Shell {
  const folds: Folds = { drawer: stored?.drawer === true, inspector: stored?.inspector ?? innerWidth < 1280, palette: stored?.palette === true };
  const drawer = el('div', `position:fixed;left:0;top:0;bottom:0;box-sizing:border-box;overflow:auto;z-index:62;display:none;${PANEL_BG};border-right:1px solid #38bdf8;padding:10px 12px`);
  const inspector = el('div', `position:fixed;right:0;top:0;bottom:0;box-sizing:border-box;overflow:auto;z-index:62;display:none;${PANEL_BG};border-left:1px solid #38bdf8;padding:10px 12px`);
  const toolbar = el('div', `position:fixed;top:8px;box-sizing:border-box;z-index:62;display:none;${PANEL_BG};border:1px solid #334155;border-radius:10px;padding:6px 8px;display:none;flex-wrap:wrap;gap:6px;align-items:center`);
  const status = el('div', 'position:fixed;box-sizing:border-box;z-index:61;display:none;background:rgba(12,18,28,.82);color:#fcd34d;font:12px/1.4 system-ui,sans-serif;border-radius:8px;padding:4px 10px;white-space:pre-wrap;pointer-events:none;max-height:5.8em;overflow:hidden');
  const selbar = el('div', `position:fixed;z-index:63;display:none;${PANEL_BG};border:1px solid #38bdf8;border-radius:10px;padding:5px 6px;gap:5px;align-items:center;flex-wrap:nowrap`);
  const palette = el('div', `position:fixed;bottom:0;box-sizing:border-box;z-index:62;display:none;${PANEL_BG};border-top:1px solid #38bdf8;padding:6px 10px 8px`);
  const palHead = el('div', `display:flex;gap:6px;align-items:center;height:${PAL_HEAD - 8}px;overflow:hidden`), palBody = el('div', 'margin-top:6px');
  palette.append(palHead, palBody);
  const help = el('div', 'position:fixed;inset:0;z-index:70;display:none;background:rgba(2,6,12,.66);align-items:center;justify-content:center');
  /** the fold buttons: a rail for a folded side panel, the palette's own in its header (lot-lab.ts draws it) */
  const rails = { drawer: el('div', `position:fixed;left:0;top:0;bottom:0;width:${RAIL}px;z-index:62;display:none;${PANEL_BG};border-right:1px solid #38bdf8;cursor:pointer;writing-mode:vertical-rl;text-align:center;padding-top:10px;color:#7dd3fc;font-weight:700;letter-spacing:.1em`, '▸ LOT'),
    inspector: el('div', `position:fixed;right:0;top:0;bottom:0;width:${RAIL}px;z-index:62;display:none;${PANEL_BG};border-left:1px solid #38bdf8;cursor:pointer;writing-mode:vertical-rl;text-align:center;padding-top:10px;color:#7dd3fc;font-weight:700;letter-spacing:.1em`, '◂ INSPECTOR') };
  rails.drawer.title = 'open the lot drawer'; rails.inspector.title = 'open the inspector';
  let shown = false, last = '', sz = sizesFor(innerWidth, innerHeight);
  const shell: Shell = {
    drawer, toolbar, status, selbar, palette, palHead, palBody, inspector, help, folds, thumb: sz.thumb,
    place() {
      sz = sizesFor(innerWidth, innerHeight); shell.thumb = sz.thumb;
      const L = folds.drawer ? RAIL : sz.drawer, R = folds.inspector ? RAIL : sz.inspector;
      const vis = (e: HTMLElement, on: boolean, d = 'block') => { e.style.display = shown && on ? d : 'none'; };
      vis(drawer, !folds.drawer); vis(rails.drawer, folds.drawer); vis(inspector, !folds.inspector); vis(rails.inspector, folds.inspector);
      vis(toolbar, true, 'flex'); vis(palette, true);
      drawer.style.width = `${sz.drawer}px`; inspector.style.width = `${sz.inspector}px`;
      Object.assign(toolbar.style, { left: `${L + 8}px`, right: `${R + 8}px` });
      Object.assign(palette.style, { left: `${L}px`, right: `${R}px` });
      palBody.style.display = folds.palette ? 'none' : 'block';
      palette.style.height = `${folds.palette ? PAL_HEAD + 6 : PAL_HEAD + 14 + sz.rows * (sz.thumb + 6) + 10}px`;
      const tb = toolbar.getBoundingClientRect();
      Object.assign(status.style, { left: `${L + 8}px`, top: `${(shown ? tb.bottom : 48) + 6}px`, maxWidth: `${Math.max(200, innerWidth - L - R - 16)}px` });
      const key = JSON.stringify(shell.free());
      const changed = key !== last; last = key; return changed;
    },
    free() {
      const L = folds.drawer ? RAIL : sz.drawer, R = folds.inspector ? RAIL : sz.inspector;
      const tb = shown ? toolbar.getBoundingClientRect().bottom : 56, pb = shown ? palette.getBoundingClientRect().top : innerHeight;
      return { L, T: tb + 4, R: innerWidth - R, B: Math.max(tb + 80, pb) };
    },
    fold(which, v) { folds[which] = v; shell.place(); onFold(); },
    show(on) { shown = on; shell.place(); },
    remove() { for (const e of [drawer, inspector, toolbar, status, selbar, palette, help, rails.drawer, rails.inspector]) e.remove(); },
  };
  rails.drawer.addEventListener('click', () => shell.fold('drawer', false));
  rails.inspector.addEventListener('click', () => shell.fold('inspector', false));
  help.addEventListener('click', e => { if (e.target === help) help.style.display = 'none'; });
  document.body.append(drawer, inspector, toolbar, status, selbar, palette, help, rails.drawer, rails.inspector);
  return shell;
}
/** a panel's header: its title and a fold button (◂ for the drawer, ▸ for the inspector) */
export function panelHead(title: string, foldText: string, fold: () => void, extra: HTMLElement[] = []): HTMLElement {
  const h = el('div', 'display:flex;align-items:center;gap:6px;margin-bottom:4px');
  h.append(el('div', 'flex:1;font-weight:800;color:#7dd3fc;font-size:14px;letter-spacing:.06em', title), ...extra, btn(foldText, `${BTN}padding:1px 8px`, fold, 'fold this panel away (its rail opens it again)'));
  return h;
}

/** the keys, for the "?" overlay: [keys, what they do], by section */
export const KEYS: [string, [string, string][]][] = [
  ['The lot', [['g / Shift+G', 'next / previous variant of this cell'], ['Generate ▶', 'this lot again: a new layout, seed and building (its type, size and road angle kept)'], ['New lot ▶', 'a random size and road angle (the drawer\'s locks hold them)'], ['Ctrl+S', 'save the draft'], ['Ctrl+Enter', 'approve, then the next gap'], ['L', 'lot grid'], ['N', 'neighbours'], ['?', 'this list'], ['Esc', 'close this list / stop painting or placing / clear the selection']]],
  ['Selecting', [['click', 'select a sprite or a decal (fences, bins and mailbox too)'], ['Shift+click', 'add or remove one'], ['drag on the ground', 'box select'], ['drag a selected one', 'move the selection'], ['arrows', 'move ¼ tile (Shift: 1 tile)']]],
  ['Editing (the selection bar)', [['R', 'turn (a decal mirrors)'], ['H / Shift+H', 'change house: the next / previous house of its family and size class that suits this road and state (nothing selected: the lot\'s house)'], ['Del', 'delete'], ['[ / ]', 'smaller / bigger'], ['Ctrl+C / Ctrl+V', 'copy / paste at the pointer (here or on the next lot)'], ['Ctrl+D', 'duplicate'], ['Ctrl+Z', 'undo']]],
  ['The palette', [['click a sprite, then the lot', 'place it (Shift+click places more, Esc stops)'], ['Insert or A', 'place it at the pointer'], ['a decal, then press on the lot', 'place a decal (Shift keeps placing)'], ['Ground: a swatch, then drag', 'paint a rectangle; Erase: click a painted patch']]],
];
/** draws the keys overlay into the shell's help element */
export function drawHelp(help: HTMLElement): void {
  const box = el('div', `${PANEL_BG};border:1px solid #38bdf8;border-radius:12px;padding:16px 20px;max-width:min(860px,calc(100vw - 40px));max-height:calc(100vh - 60px);overflow:auto;columns:2 360px;column-gap:28px`);
  box.append(el('div', 'font-weight:800;color:#7dd3fc;font-size:15px;margin-bottom:6px;column-span:all', 'Lot lab keys  (? or Esc closes)'));
  for (const [sec, rows] of KEYS) {
    const s = el('div', 'break-inside:avoid;margin-bottom:10px');
    s.append(heading(sec.toUpperCase(), 'margin-top:4px'));
    for (const [k, t] of rows) { const r = el('div', 'display:flex;gap:10px;margin:2px 0'); r.append(el('span', 'flex:none;min-width:118px;font:12px ui-monospace,Consolas,monospace;color:#fcd34d', k), el('span', 'opacity:.9', t)); s.append(r); }
    box.append(s);
  }
  help.replaceChildren(box);
}
