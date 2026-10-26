// The lot gallery (T159, P25 #348 step 4): a dozen generated lots at once along the lab street, each the cell's lot as the game composes it with
// the items the model lays round its house (lot-wizard.ts makeLot), to judge whole: Good or Bad per lot, Space saves the verdicts (a sample per
// judged lot: src gallery, its verdict; a lot judged Bad teaches nothing about which item, lots/learn.ts) and lays the next dozen; Fix opens
// that lot in the wizard to put it right item by item. Both feed lot-learning.json the same merge-safe way (learn-store.ts). The editor is
// muted and paused meanwhile; nothing is saved as a preset.
import type { Game } from '../engine';
import type { LotGeom } from '../lots/compose-core';
import type { LotPreset, PresetState, PresetUse, Road } from '../lots/presets';
import type { PresetFrame } from '../lots/preset-frame';
import { learningStats } from '../lots/learn';
import { addSamples, learnedModel, learnedSamples, learnedTaste } from './learn-store';
import { lotPreset, lotSample, makeLot, type WizLot } from './lot-wizard';
import { muteEditor, pauseEditor } from './lot-editor';
import { BTN, DANGER, GO, ON, btn, el, heading } from './lot-lab-ui';

/** the most lots a gallery lays, and the street they share (tiles: the lab street runs 90 each way of the lab lot; a gap between lots) */
export const GALLERY_MAX = 12, STREET_SPAN = 168, GAP = 2;
/** what the gallery asks of the lab */
export interface GalleryHost {
  game: Game;
  lot(): { use: PresetUse; state: PresetState; road: Road };
  /** the lab lot's geometry and the frame its presets are laid in */
  geo(): LotGeom | null;
  frame(): PresetFrame | null;
  /** a lot of the current cell composed as the game composes it (a new seed and house each call), not shown */
  base(): LotPreset | null;
  /** stages the gallery's lots: each slot's preset (in memory), the middle one on the lab lot, the others along the street; [] drops them */
  stage(slots: readonly { g: LotGeom; p: LotPreset }[], mid: number): void;
  /** the camera over these lots and their street */
  fit(gs: readonly LotGeom[]): void;
  /** a world point (tiles) on screen (viewport px) */
  toScreen(x: number, y: number): { x: number; y: number };
  leave(): void;
  say(m: string): void;
  redraw(): void;
}
/** how many lots of w tiles the street takes (at most GALLERY_MAX) and which is the lab lot's (the middle one) */
export function galleryRow(w: number): { n: number; mid: number; off: (k: number) => number } {
  const n = Math.max(1, Math.min(GALLERY_MAX, Math.floor(STREET_SPAN / (w + GAP)))), mid = Math.floor((n - 1) / 2);
  return { n, mid, off: k => (k - mid) * (w + GAP) };
}

/** the gallery (off until opened): its keys, bar, panel and frame, for the lab to call; wizard: to Fix a lot in */
export function makeGallery(host: GalleryHost, wizard: { load(c: WizLot): void }) {
  let on = false, slots: { lot: WizLot; g: LotGeom; verdict: 'up' | 'down' | null }[] = [], mid = 0;
  const layer = el('div', 'position:fixed;left:0;top:0;pointer-events:none;z-index:57;display:none');
  document.body.append(layer);
  /** the next dozen: each a lot of the cell with a new seed and house, the model's items round it, laid along the street */
  function lay(): void {
    const g0 = host.geo(), f = host.frame();
    if (!g0 || !f) { host.say('the gallery has no lot to compose here'); return; }
    const row = galleryRow(g0.w), out: typeof slots = [];
    for (let k = 0; k < row.n; k++) {
      const raw = host.base(); if (!raw) break;
      const o = row.off(k), g: LotGeom = { ...g0, o: { x: g0.o.x + g0.u.x * o, y: g0.o.y + g0.u.y * o } };
      out.push({ lot: makeLot(raw, f, learnedModel(), undefined, learnedTaste()), g, verdict: null });
    }
    if (!out.length) { host.say('the gallery has no lot to compose here (no preset of this type and state near this size)'); return; }
    slots = out; mid = Math.min(row.mid, out.length - 1);
    host.stage(slots.map((s, k) => ({ g: s.g, p: lotPreset(s.lot, `lab-gallery-${k}`) })), mid);
    host.fit(slots.map(s => s.g));
    drawCards(); host.redraw();
  }
  /** the verdicts saved (a sample per judged lot) and the next dozen laid */
  function save(): void {
    const l = host.lot(), judged = slots.filter(s => s.verdict);
    // the dozen's verdicts in one save (T160, from #364's review: not one request per lot)
    void addSamples(judged.map(s => lotSample(s.lot, l, s.verdict!))).catch(e => host.say(`NOT SAVED to lot-learning.json: ${String(e)}`));
    host.say(judged.length ? `learned: ${judged.filter(s => s.verdict === 'up').length} good, ${judged.filter(s => s.verdict === 'down').length} bad (${learnedSamples().length} samples)` : 'nothing judged: the next dozen');
    lay();
  }
  /** the gallery on (the editor muted and paused, the first dozen laid) or off (its lots dropped, the lab's own lot back) */
  function open(v = !on): void {
    on = v; pauseEditor(v); muteEditor(v); layer.style.display = v ? 'block' : 'none';
    if (v) lay(); else { slots = []; layer.replaceChildren(); host.stage([], 0); host.leave(); }
    host.redraw();
  }
  /** a lot opened in the wizard to put right (the gallery closes first) */
  function fix(k: number): void {
    const s = slots[k]; if (!s) return;
    on = false; layer.style.display = 'none'; layer.replaceChildren(); host.stage([], 0); slots = [];
    wizard.load(s.lot);
    host.fit([host.geo()!]);
    host.say('fixing that lot in the wizard: click off what is wrong, Space saves it');
  }
  /** each lot's card: its number, Good, Bad and Fix, the verdict lit */
  function drawCards(): void {
    layer.replaceChildren(...slots.map((s, k) => {
      const c = el('div', 'position:fixed;pointer-events:auto;transform:translate(-50%,-100%);display:flex;gap:3px;align-items:center;background:rgba(12,18,28,.9);border:1px solid #334155;border-radius:8px;padding:3px 4px;font:12px system-ui,sans-serif;color:#e2e8f0;white-space:nowrap');
      c.dataset.k = String(k);
      const set = (v: 'up' | 'down') => () => { s.verdict = s.verdict === v ? null : v; drawCards(); host.redraw(); };
      c.append(el('b', 'padding:0 3px', `${k + 1}`), btn('Good', `${s.verdict === 'up' ? GO : BTN}padding:1px 7px`, set('up'), 'this lot looks right'), btn('Bad', `${s.verdict === 'down' ? DANGER : BTN}padding:1px 7px`, set('down'), 'something here is wrong'), btn('Fix', `${BTN}padding:1px 7px`, () => fix(k), 'open it in the wizard to click off what is wrong'));
      return c;
    }));
  }
  /** each frame: the cards above their lots' back edges */
  function frame(): void {
    if (!on) return;
    const cards = layer.children;
    slots.forEach((s, k) => {
      const c = cards[k] as HTMLElement | undefined; if (!c) return;
      const g = s.g, p = host.toScreen(g.o.x + g.u.x * g.w / 2 + g.n.x * g.d, g.o.y + g.u.y * g.w / 2 + g.n.y * g.d);
      c.style.left = `${p.x}px`; c.style.top = `${p.y - 4}px`;
    });
  }
  /** the gallery's keys (the lab calls it first while it is open): Space saves and lays the next dozen, Esc closes; true when handled */
  function onKey(e: KeyboardEvent): boolean {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.key === ' ') { if (!e.repeat) save(); return true; }
    if (e.key === 'Escape') { open(false); return true; }
    return false;
  }
  /** the toolbar while the gallery is open */
  function bar(): HTMLElement[] {
    const j = slots.filter(s => s.verdict).length;
    return [el('span', 'border-radius:999px;padding:2px 10px;font-size:12px;font-weight:800;background:#b45309;color:#fff;white-space:nowrap', 'GALLERY'),
      el('span', 'font-size:12px;opacity:.85;white-space:nowrap', `${j} of ${slots.length} judged · Good / Bad per lot, Fix to put one right`),
      btn('Save & next dozen (Space)', GO, () => save(), 'records the verdicts (a sample per judged lot) and lays the next dozen'),
      btn('All good', BTN, () => { for (const s of slots) s.verdict ??= 'up'; drawCards(); host.redraw(); }, 'every lot not judged yet: Good'),
      btn('Exit (Esc)', BTN, () => open(false))];
  }
  /** the inspector's GALLERY section: the counts */
  function panel(): HTMLElement[] {
    const st = learningStats(learnedSamples());
    return [heading('LOT GALLERY', 'margin-top:4px'), el('div', 'font-size:12px;opacity:.9', `${slots.length} lots laid · ${slots.filter(s => s.verdict === 'up').length} good · ${slots.filter(s => s.verdict === 'down').length} bad`),
      el('div', 'font-size:12px;opacity:.85', st.judged ? `judged so far: ${st.judged} lots, ${Math.round(st.up * 100)}% good` : 'no lot judged yet'),
      el('div', 'font-size:12px;opacity:.85', `samples: ${st.bySrc.wizard} wizard · ${st.bySrc.gallery} gallery · ${st.bySrc.preset} presets`)];
  }
  const toggleBtn = () => btn('Gallery', on ? ON : BTN, () => open(), 'a dozen generated lots at once: Good or Bad each, Fix one in the wizard; the generator learns from both');
  return { on: () => on, open, onKey, bar, panel, frame, toggleBtn, dispose() { layer.remove(); if (on) { pauseEditor(false); muteEditor(false); } } };
}
