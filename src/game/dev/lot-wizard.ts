// The lot wizard (T158, #343): a fast loop in the lot lab that teaches the generator where items belong. W turns it on. Each lot is the cell's own
// lot as the game composes it, kept to its house, fences and street items, plus a generous set of offered items (wizard-gen.ts) whose sectors the
// model draws (lots/learn.ts). A click deletes an offered item (no selection step); Backspace puts the last one back; Space saves the sample (every
// offered item, kept or deleted, with the lot's context: learn-store.ts, through the dev server's merge) and shows the next lot at once; S skips
// (nothing learned). The next lot is timed (Space to its first frame). A heat map over the lot shows, for the kind under the pointer (or the one
// chosen), each sector's keep rate and the past samples kept (green) and deleted (red); the inspector counts the samples by house size class and
// shows the trend of the share kept per lot. "Also keep as a draft preset" (off by default) saves each wizard lot as a lab draft too.
// The wizard never saves its lot as a preset unless that toggle is on, and its edits never go through the editor (muted, paused).
import type { Game } from '../engine';
import type { LotPreset, PresetState, PresetUse, Road } from '../lots/presets';
import type { PresetFrame } from '../lots/preset-frame';
import { toFrame } from '../lots/preset-frame';
import { CLASSES, ITEM_KINDS, SECTORS, SECTOR_NAMES, countOf, keepRate, learningStats, sampleItem, sectorArea, sectorRects, type Box, type HouseClass, type ItemKind, type Sample, type SectorLot } from '../lots/learn';
import { addSample, learnedModel, learnedSamples, onLearning } from './learn-store';
import { generateOffers, pools, type Offer } from './wizard-gen';
import { areaOf, CLASS_NAMES, frameHalf, isHouseLike, sizeClassOf } from './lot-houses';
import { mainBuilding } from './lot-select';
import { isFence } from './lot-derive';
import { muteEditor, pauseEditor } from './lot-editor';
import { BTN, GO, ON, btn, check, el, heading, mono } from './lot-lab-ui';

/** the wizard lot's preset id (in memory only: never saved as itself) */
export const WIZARD_ID = 'lab-wizard';
/** what the wizard asks of the lab */
export interface WizardHost {
  game: Game;
  /** the lab lot's context */
  lot(): { use: PresetUse; state: PresetState; road: Road };
  /** the frame presets are laid in on the lab lot (null: none staged) */
  frame(): PresetFrame | null;
  /** a lot of the current cell (gap: of the next coverage gap) composed as the game composes it, whole, not yet shown; null: nothing to compose */
  base(gap: boolean): LotPreset | null;
  /** shows the wizard's lot (in the presets, the lab lot staged with it) */
  show(p: LotPreset): void;
  /** the wizard is off: its lot goes, the lab shows a lot of its own again */
  leave(): void;
  /** keeps a lot as a lab draft preset (the toggle): its id */
  keepDraft(p: LotPreset): Promise<string>;
  /** a lot-frame point on screen (viewport px), or null */
  toScreen(x: number, y: number): { x: number; y: number } | null;
  say(m: string): void;
  redraw(): void;
}
/** an offered item on the wizard's lot: deleted or not */
interface Item extends Offer { deleted: boolean }
const SVGNS = 'http://www.w3.org/2000/svg';
const KIND_NAMES: Readonly<Record<ItemKind, string>> = { tree: 'trees', bush: 'bushes', flowerbed: 'flowerbeds', prop: 'props', car: 'cars', decal: 'decals' };

/** the wizard (off until toggled): its keys, its panels and its frame, for the lab to call */
export function makeWizard(host: WizardHost) {
  let on = false, same = true, keep = false, heat = true, heatKind: ItemKind = 'tree', hover: ItemKind | null = null, heatKey = '';
  /** the lot on screen: its base (the house, fences, street items, patches), the offered items, the deletes to undo, its sector lot, its context */
  let cur: { base: LotPreset; items: Item[]; undo: number[]; lot: SectorLot; house: string | null; cls: HouseClass; hw: number; hd: number } | null = null;
  /** the save-and-next times (ms), the last first */
  const times: number[] = [];
  const svg = document.createElementNS(SVGNS, 'svg') as SVGSVGElement;
  svg.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:56;display:none';
  document.body.append(svg);
  const unLearn = onLearning(() => { heatKey = ''; host.redraw(); });

  /** the wizard's lot as a preset: its base and the offered items not deleted */
  function build(): LotPreset {
    const c = cur!, props = [...c.base.props], decals = [...(c.base.decals ?? [])];
    for (const it of c.items) if (!it.deleted) { if (it.kind === 'decal') decals.push({ id: it.id, x: it.x, y: it.y, scale: 1, alpha: 1 }); else props.push({ id: it.id, x: it.x, y: it.y, scale: 1, view: 0 }); }
    return { ...c.base, id: WIZARD_ID, props, decals };
  }
  /** the sample of the lot on screen: its context and every offered item, kept or deleted */
  function sample(): Sample {
    const c = cur!, l = host.lot();
    return { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, at: new Date().toISOString(), ctx: { use: l.use, state: l.state, w: c.base.w, d: c.base.d, road: l.road, house: c.house, cls: c.cls, hw: c.hw, hd: c.hd },
      items: c.items.map(it => sampleItem(c.lot, it.id, it.kind, it.x, it.y, !it.deleted)) };
  }
  /** the next lot: the sample of this one recorded first (record), then a lot of this cell (or the next gap) with its house, fences and street
   *  items, and the offered items drawn by the model; shown at once and timed to its first frame */
  function next(record: boolean): void {
    const t0 = performance.now();
    if (record && cur) {
      const s = sample(), kept = s.items.filter(i => i.kept).length;
      void addSample(s).catch(e => host.say(`NOT SAVED to lot-learning.json: ${String(e)}`));
      if (keep) void host.keepDraft(build()).catch(e => host.say(`draft not saved: ${String(e)}`));
      host.say(`learned: ${kept} of ${s.items.length} kept (${learnedSamples().length} samples)`);
    }
    const raw = host.base(!same), f = host.frame();
    if (!raw || !f) { host.say('the wizard has no lot to compose here (no preset of this type and state near this size)'); return; }
    const half = frameHalf(f), hi = mainBuilding(raw, q => isHouseLike(q.id), half), hq = hi >= 0 ? raw.props[hi]! : null, hh = hq ? half(hq) : null;
    // the base: the house, the fences and the street items (the verge); the plants, props, cars and decals are the wizard's to offer
    const base: LotPreset = { ...raw, id: WIZARD_ID, props: raw.props.filter((q, i) => i === hi || isFence(q.id) || q.y < 0), decals: [] };
    const house: Box | null = hq && hh ? [hq.x - hh.ha, hq.y - hh.hb, hq.x + hh.ha, hq.y + hh.hb] : null;
    const lot: SectorLot = { w: base.w, d: base.d, house, drives: base.patches.filter(p => p.kind === 'drive').map(p => p.pts) };
    const taken: Box[] = base.props.map(q => { const h = half(q); return [q.x - h.ha, q.y - h.hb, q.x + h.ha, q.y + h.hb] as Box; });
    const k = hq ? sizeClassOf(hq.id) : null, cls: HouseClass = hq ? CLASS_NAMES[k ?? 0] : 'none';
    const offers = generateOffers({ lot, cls, model: learnedModel(), taken, pools: pools(areaOf), half, r: Math.random });
    cur = { base, items: offers.map(o => ({ ...o, deleted: false })), undo: [], lot, house: hq?.id ?? null, cls, hw: hh ? 2 * hh.ha : 0, hd: hh ? 2 * hh.hb : 0 };
    host.show(build());
    heatKey = '';
    // timed to the frame that shows it
    requestAnimationFrame(() => requestAnimationFrame(() => { times.unshift(performance.now() - t0); times.length = Math.min(times.length, 40); host.redraw(); }));
  }
  /** an offered item deleted (or, with -1, the last delete undone) and the lot shown again */
  function del(i: number): void {
    const c = cur; if (!c) return;
    if (i < 0) { const j = c.undo.pop(); if (j === undefined) { host.say('nothing to put back'); return; } c.items[j]!.deleted = false; }
    else { c.items[i]!.deleted = true; c.undo.push(i); }
    host.show(build()); heatKey = ''; host.redraw();
  }
  /** the offered item under a pointer: a sprite of the wizard's lot (the topmost under it), else the offered decal nearest the point (within a tile); -1 none */
  function itemAt(mx: number, my: number): number {
    const c = cur, g = host.game; if (!c) return -1;
    const p = g.propAt(mx, my), from = p ? g.lotFrom.get(p) : undefined;
    if (from && from.preset === WIZARD_ID) {
      let k = from.prop - c.base.props.length;
      if (k < 0) return -1;
      for (let i = 0; i < c.items.length; i++) { const it = c.items[i]!; if (it.deleted || it.kind === 'decal') continue; if (k-- === 0) return i; }
      return -1;
    }
    const f = host.frame(); if (!f) return -1;
    const t = g.tileAt(mx, my), q = toFrame(f, t.x, t.y);
    let best = -1, bd = 1;
    c.items.forEach((it, i) => { if (it.deleted || it.kind !== 'decal') return; const d = Math.hypot(it.x - q.x, it.y - q.y); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  /** a press on the map: deletes the offered item under it (window capture: the editor and the game never see it) */
  const onDown = (e: PointerEvent) => {
    if (!on || e.button !== 0 || e.target !== host.game.canvas) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const b = host.game.canvas.getBoundingClientRect(), i = itemAt(e.clientX - b.left, e.clientY - b.top);
    if (i < 0) { host.say('not an offered item (the house, fences and street items stay): click a tree, bush, flowerbed, prop, car or decal'); return; }
    del(i);
  };
  /** the pointer over the map: the heat map follows the kind of the offered item under it */
  const onMove = (e: PointerEvent) => {
    if (!on || e.target !== host.game.canvas) return;
    const b = host.game.canvas.getBoundingClientRect(), i = itemAt(e.clientX - b.left, e.clientY - b.top), k = i >= 0 ? cur!.items[i]!.kind : null;
    if (k !== hover) { hover = k; heatKey = ''; }
  };
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove, { capture: true, passive: true });

  /** the wizard on or off: the editor muted and paused while it runs; on, the first lot at once */
  function toggle(v = !on): void {
    on = v; pauseEditor(v); muteEditor(v); heatKey = ''; svg.style.display = v ? 'block' : 'none';
    if (v) next(false); else { cur = null; host.leave(); }
    host.redraw();
  }
  /** the wizard's keys (the lab calls it first while the wizard is on): Space save and next, S skip, Backspace undo, W or Esc leave; true when handled */
  function onKey(e: KeyboardEvent): boolean {
    const mod = e.ctrlKey || e.metaKey || e.altKey;
    if (mod) return false;
    if (e.key === ' ') { if (!e.repeat) next(true); return true; }
    if (e.key === 's' || e.key === 'S') { next(false); host.say('skipped: nothing learned from that lot'); return true; }
    if (e.key === 'Backspace') { del(-1); return true; }
    if (e.key === 'w' || e.key === 'W' || e.key === 'Escape') { toggle(false); return true; }
    return false;
  }
  /** the heat map: the lot's sectors tinted by the keep rate of the kind under the pointer (or the chosen one) for this house class, and the past
   *  samples of that kind at their place on this lot (normalised): kept green, deleted red. Drawn again only when the view or the data changed */
  function frame(): void {
    const c = cur, cam = host.game.cam;
    if (!on || !heat || !c) { if (svg.childNodes.length) svg.replaceChildren(); return; }
    const kind = hover ?? heatKind, key = `${kind}|${cam.X.toFixed(1)},${cam.Y.toFixed(1)},${cam.z.toFixed(4)}|${innerWidth}x${innerHeight}|${learnedSamples().length}`;
    if (key === heatKey) return;
    heatKey = key;
    const out: SVGElement[] = [], m = learnedModel(), pt = (x: number, y: number) => host.toScreen(x, y);
    for (const s of SECTORS) {
      if (sectorArea(c.lot, s) < 0.25) continue;
      const rate = keepRate(m, c.cls, kind, s), n = countOf(m, c.cls, kind, s);
      for (const b of sectorRects(c.lot, s)) {
        const ps = [pt(b[0], b[1]), pt(b[2], b[1]), pt(b[2], b[3]), pt(b[0], b[3])];
        if (ps.some(p => !p)) continue;
        const poly = document.createElementNS(SVGNS, 'polygon');
        poly.setAttribute('points', ps.map(p => `${p!.x},${p!.y}`).join(' '));
        poly.setAttribute('fill', `hsla(${Math.round(rate * 120)},85%,50%,${n.offered ? 0.32 : 0.12})`); poly.setAttribute('stroke', 'rgba(255,255,255,.25)');
        out.push(poly);
      }
    }
    // the past samples of this kind, at their place on this lot (the newest 400)
    let shown = 0;
    const all = learnedSamples();
    for (let si = all.length - 1; si >= 0 && shown < 400; si--) for (const it of all[si]!.items) {
      if (it.kind !== kind || shown >= 400) continue;
      const p = pt(it.nx * c.lot.w, it.ny * c.lot.d); if (!p) continue;
      const dot = document.createElementNS(SVGNS, 'circle');
      dot.setAttribute('cx', `${p.x}`); dot.setAttribute('cy', `${p.y}`); dot.setAttribute('r', '3.5');
      dot.setAttribute('fill', it.kept ? '#22c55e' : '#ef4444'); dot.setAttribute('stroke', '#0b1220'); dot.setAttribute('stroke-width', '1');
      out.push(dot); shown++;
    }
    svg.replaceChildren(...out);
  }
  /** the toolbar while the wizard is on: its keys as buttons */
  function bar(): HTMLElement[] {
    const c = cur, left = c ? c.items.filter(i => !i.deleted).length : 0;
    return [el('span', 'border-radius:999px;padding:2px 10px;font-size:12px;font-weight:800;background:#7c3aed;color:#fff;white-space:nowrap', 'WIZARD'),
      el('span', 'font-size:12px;opacity:.85;white-space:nowrap', c ? `${left} of ${c.items.length} offered left · click deletes` : ''),
      btn('Save & next (Space)', GO, () => next(true), 'records this lot (every offered item, kept or deleted) and shows the next one'),
      btn('Skip (S)', BTN, () => { next(false); host.say('skipped: nothing learned from that lot'); }, 'the next lot, nothing learned'),
      btn('⌫ Undo', BTN, () => del(-1), 'Backspace: puts the last deleted item back'),
      btn('Exit (W)', BTN, () => toggle(false), 'W or Esc')];
  }
  /** the inspector's WIZARD section: the toggles, the counter (samples by house class, the share kept per lot and its trend, the save-and-next
   *  time), the heat map's kind, and this lot's sectors with the keep rate of that kind */
  function panel(): HTMLElement[] {
    const st = learningStats(learnedSamples()), m = learnedModel(), c = cur, kind = hover ?? heatKind;
    const out: HTMLElement[] = [heading('LOT WIZARD', 'margin-top:4px')];
    const tg = el('div', 'display:flex;flex-direction:column;gap:3px');
    tg.append(check('same size and road (fastest)', same, v => { same = v; host.redraw(); }, 'off: each lot moves to the next coverage gap (another size or road angle)'),
      check('also keep as a draft preset', keep, v => { keep = v; host.redraw(); }, 'Space then saves the lot as a lab draft too (off: it only teaches the generator)'),
      check('heat map', heat, v => { heat = v; heatKey = ''; host.redraw(); }, 'each sector tinted by the keep rate of the kind under the pointer (or the one chosen); past samples kept green, deleted red'));
    out.push(tg);
    const ms = times.length ? [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)]! : 0;
    out.push(el('div', 'font-size:13px;margin-top:6px;font-weight:700', `${st.total} sample${st.total === 1 ? '' : 's'}`),
      el('div', 'font-size:12px;opacity:.85', CLASSES.filter(k => st.byClass[k]).map(k => `${k} ${st.byClass[k]}`).join(' · ') || 'none yet: delete what is wrong, then Space'),
      el('div', 'font-size:12px;opacity:.85', st.shares.length ? `kept per lot: ${Math.round(st.first * 100)}% (first 10) → ${Math.round(st.last * 100)}% (last 10)` : ''),
      el('div', `font-size:12px;${ms > 500 ? 'color:#fca5a5' : 'opacity:.85'}`, times.length ? `next lot on screen: ${Math.round(times[0]!)} ms (median ${Math.round(ms)} ms of ${times.length})` : ''));
    if (st.shares.length > 1) out.push(spark(st.shares));
    const sel = el('select', 'background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:2px 6px;font:inherit;margin-left:6px');
    for (const k of ITEM_KINDS) sel.append(new Option(KIND_NAMES[k], k));
    sel.value = heatKind; sel.addEventListener('change', () => { heatKind = sel.value as ItemKind; heatKey = ''; host.redraw(); });
    const hk = el('div', 'margin-top:6px;font-size:12px'); hk.append(`heat map of`, sel, el('span', 'opacity:.7', hover ? ` (pointer: ${KIND_NAMES[hover]})` : ''));
    out.push(hk);
    if (c) {
      out.push(el('div', 'font-size:12px;opacity:.8;margin-top:4px', `${c.cls} house${c.house ? '' : ' (none)'} · keep rate of ${KIND_NAMES[kind]} by sector:`));
      const t = el('div', 'display:grid;grid-template-columns:1fr auto auto;gap:1px 8px;font-size:12px');
      for (const s of SECTORS) {
        if (sectorArea(c.lot, s) < 0.25) continue;
        const r = keepRate(m, c.cls, kind, s), n = countOf(m, c.cls, kind, s);
        t.append(el('span', '', SECTOR_NAMES[s]), el('span', `color:hsl(${Math.round(r * 120)},80%,60%);text-align:right`, `${Math.round(r * 100)}%`), el('span', 'opacity:.6;text-align:right', `${n.kept}/${n.offered}`));
      }
      out.push(t);
      if (c.house) out.push(mono(c.house, 'opacity:.55;margin-top:3px'));
    }
    return out;
  }
  /** a sparkline of the share kept per lot (0..1), the newest on the right */
  function spark(v: readonly number[]): HTMLElement {
    const W = 260, H = 34, s = v.slice(-60), box = el('div', 'margin-top:4px'), g = document.createElementNS(SVGNS, 'svg'), line = document.createElementNS(SVGNS, 'polyline');
    g.setAttribute('width', `${W}`); g.setAttribute('height', `${H}`); g.style.cssText = 'display:block;background:#0f172a;border:1px solid #334155;border-radius:6px';
    line.setAttribute('points', s.map((x, i) => `${(i / Math.max(1, s.length - 1)) * (W - 8) + 4},${H - 4 - x * (H - 8)}`).join(' '));
    line.setAttribute('fill', 'none'); line.setAttribute('stroke', '#22c55e'); line.setAttribute('stroke-width', '2');
    g.append(line); box.append(g); return box;
  }
  /** the wizard's toolbar toggle for the lab's own toolbar (lit when on) */
  const toggleBtn = () => btn('Wizard (W)', on ? ON : BTN, () => toggle(), 'the lot wizard: generate, click off what is wrong, Space saves and shows the next; the generator learns where things go');
  return {
    on: () => on, toggle, onKey, frame, bar, panel, toggleBtn, next,
    dispose() { window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('pointermove', onMove, true); unLearn(); svg.remove(); if (on) { pauseEditor(false); muteEditor(false); } },
  };
}
