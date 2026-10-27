// The lot wizard (T158, #343): a fast loop in the lot lab that teaches the generator where items belong. W turns it on. Each lot is the cell's own
// lot as the game composes it, kept to its house, fences and street items, plus a generous set of offered items (wizard-gen.ts) whose sectors the
// model draws (lots/learn.ts). T183 (#461; the owner: "should not auto delete when you click items in the wizzard it should select them and pressing
// del on keyboard should delete them"): a click selects an offered item (highlighted), Shift or Ctrl+click adds or takes it out, a drag on the ground
// draws a box that selects; Del (or Backspace) deletes the selection (each deleted item still learns "not kept here"); Ctrl+Z (Undo) takes the
// last step back (a delete, a stroke of Draw, a placed decal); Esc clears the selection (with none, leaves). The lab's Draw paints the wizard's lot
// (saved with the sample) and a decal from the palette goes on it (kept). Space saves the sample (every
// offered item, kept or deleted, with the lot's context: learn-store.ts, through the dev server's merge) and shows the next lot at once; S skips
// (nothing learned). The next lot is timed (Space to its first frame). A heat map over the lot shows, for the kind under the pointer (or the one
// chosen), each sector's keep rate and the past samples kept (green) and deleted (red); the inspector counts the samples by house size class and
// shows the trend of the share kept per lot. "Also keep as a draft preset" (off by default) saves each wizard lot as a lab draft too.
// The wizard never saves its lot as a preset unless that toggle is on, and its edits never go through the editor (muted, paused).
import type { Game } from '../engine';
import type { LotPreset, PresetPatch, PresetState, PresetUse, Road } from '../lots/presets';
import type { PresetFrame } from '../lots/preset-frame';
import { toFrame } from '../lots/preset-frame';
import { ITEM_KINDS, SECTORS, SECTOR_NAMES, USE_GROUPS, countOf, keepRate, learningStats, sectorArea, sectorOf, sectorRects, type ItemKind, type Model, type Sample, type UseGroup } from '../lots/learn';
import { addSample, learnedSamples, liveModel, onLearning } from './learn-store';
import { LATEST } from '../lots/lot-models';
import { groupStats, ownerSample, sampleGroup } from './live-model';
import { lotPreset, lotSample, makeLot, selectAfter, type WizLot } from './wizard-lot';
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
  /** T173: Ship model: the lab renders the exam (the live model beside the latest shipped one) and ships the live model's data on the owner's
   *  word there; the version shipped, or null (cancelled, failed) */
  ship(data: Record<string, unknown>, from: string): Promise<number | null>;
  /** a lot-frame point on screen (viewport px), or null */
  toScreen(x: number, y: number): { x: number; y: number } | null;
  say(m: string): void;
  redraw(): void;
  /** T183: the lab is drawing or placing a decal: the wizard's clicks are the lab's then */
  busy?(): boolean;
}
/** one undo step of the wizard (T183): items deleted, the ground before a stroke, a decal placed (its item's index) */
type Step = { del: number[] } | { ground: PresetPatch[] } | { add: number };
export { lotPreset, lotSample, makeLot, type WizLot } from './wizard-lot';
/** T173: the names of the use groups as the panel shows them */
const GROUP_NAMES: Readonly<Record<UseGroup, string>> = { res: 'houses', com: 'shops', ind: 'industry', open: 'parks, civic, tour' };
/** the live model's keep counts for a group (the heat map's, the sector table's) */
const modelOf = (g: UseGroup): Model => { const L = liveModel().lay; return g === 'res' ? L.model : L.groups[g]?.model ?? L.model; };
const SVGNS = 'http://www.w3.org/2000/svg';
const KIND_NAMES: Readonly<Record<ItemKind, string>> = { tree: 'trees', bush: 'bushes', flowerbed: 'flowerbeds', prop: 'props', car: 'cars', decal: 'decals' };

/** the wizard (off until toggled): its keys, its panels and its frame, for the lab to call */
export function makeWizard(host: WizardHost) {
  let on = false, same = true, keep = false, heat = true, heatKind: ItemKind = 'tree', hover: ItemKind | null = null, heatKey = '';
  /** the lot on screen: its base (the house, fences, street items, patches), the offered items, the deletes to undo, its sector lot, its context */
  let cur: WizLot | null = null;
  /** the save-and-next times (ms), the last first */
  const times: number[] = [];
  /** T183: the selected offered items (indices), the undo steps, the press in progress (its point, the item under it, adding) and the box it
   *  draws (client px), and whether the owner painted the lot's ground (then the sample keeps it) */
  let sel = new Set<number>(), steps: Step[] = [], painted = false;
  let press: { x: number; y: number; i: number; add: boolean; moved: boolean } | null = null;
  const selSvg = document.createElementNS(SVGNS, 'svg') as SVGSVGElement;
  selSvg.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:57;display:none';
  document.body.append(selSvg);
  let selKey = '';
  const svg = document.createElementNS(SVGNS, 'svg') as SVGSVGElement;
  svg.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:56;display:none';
  document.body.append(svg);
  const unLearn = onLearning(() => { heatKey = ''; host.redraw(); });

  /** the wizard's lot as a preset: its base and the offered items not deleted */
  function build(): LotPreset { return lotPreset(cur!, WIZARD_ID); }
  /** the sample of the lot on screen: its context and every offered item, kept or deleted */
  function sample(): Sample { const s = lotSample(cur!, host.lot()); if (painted) s.ground = cur!.base.patches.map(p => ({ ...p, pts: [...p.pts] })); return s; }
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
    // the generator is pure and seeded (lots/lot-gen.ts): the sample keeps the seed, so the same lot can be made again
    // T173: laid by the game's path with the live model, the lab lot's use's group (a shop lot: the shops' items, round its main building)
    cur = makeLot(raw, f, liveModel().lay);
    sel = new Set(); steps = []; painted = false; press = null; selKey = '';
    host.show(build());
    heatKey = '';
    // timed to the frame that shows it
    requestAnimationFrame(() => requestAnimationFrame(() => { times.unshift(performance.now() - t0); times.length = Math.min(times.length, 40); host.redraw(); }));
  }
  /** the lot shown again after a change (the selection's marks too) */
  function shown(): void { host.show(build()); heatKey = ''; selKey = ''; host.redraw(); }
  /** the selection deleted (Del, Backspace): one undo step; each deleted item still learns "not kept here" */
  function deleteSel(): void {
    const c = cur; if (!c) return;
    const is = [...sel].filter(i => c.items[i] && !c.items[i]!.deleted);
    if (!is.length) { host.say('nothing selected: click an offered item (Shift or Ctrl+click adds, drag a box), then Del'); return; }
    for (const i of is) c.items[i]!.deleted = true;
    steps.push({ del: is }); sel = new Set();
    host.say(`deleted ${is.length} item${is.length === 1 ? '' : 's'} (Ctrl+Z undoes)`); shown();
  }
  /** the last step taken back: deleted items back (selected again), the ground before a stroke, a placed decal gone */
  function undo(): void {
    const c = cur, s = steps.pop(); if (!c) return;
    if (!s) { host.say('nothing to undo'); return; }
    if ('del' in s) { for (const i of s.del) c.items[i]!.deleted = false; sel = new Set(s.del); host.say(`put back ${s.del.length} item${s.del.length === 1 ? '' : 's'}`); }
    else if ('ground' in s) { c.base = { ...c.base, patches: s.ground }; host.say('stroke undone'); }
    else { c.items.splice(s.add, 1); sel.delete(s.add); host.say('decal taken back'); }
    shown();
  }
  /** the lot's ground (the lab's Draw paints it): its size and patches; null with no lot */
  function ground(): { w: number; d: number; patches: PresetPatch[] } | null { const c = cur; return c ? { w: c.base.w, d: c.base.d, patches: c.base.patches } : null; }
  /** a stroke's result: the lot's patches replaced (one undo step), kept with the sample */
  function setGround(patches: PresetPatch[], what: string): void {
    const c = cur; if (!c) return;
    steps.push({ ground: c.base.patches }); c.base = { ...c.base, patches }; painted = true; host.say(what); shown();
  }
  /** a decal from the palette placed on the lot: an item kept (the sample learns it), one undo step */
  function addDecal(id: string, x: number, y: number): void {
    const c = cur; if (!c) return;
    c.items.push({ kind: 'decal', id, x, y, deleted: false }); steps.push({ add: c.items.length - 1 }); shown();
  }
  /** the items whose ground point lies in a client-px box */
  function inBox(x0: number, y0: number, x1: number, y1: number): number[] {
    const c = cur; if (!c) return [];
    const [a, b, e, f] = [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)], out: number[] = [];
    c.items.forEach((it, i) => { if (it.deleted) return; const p = host.toScreen(it.x, it.y); if (p && p.x >= a && p.x <= e && p.y >= b && p.y <= f) out.push(i); });
    return out;
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
  /** whether an event is on the map: the game's canvas or the overlay canvas over it (where the pointer lands) */
  const onMap = (t: EventTarget | null) => t === host.game.canvas || t === host.game.overlay;
  /** a press on the map: the item under it (or none: a box may follow) noted; the click acts on release (window capture: the editor and the game
   *  never see it). While the lab draws or places a decal the press is the lab's */
  const onDown = (e: PointerEvent) => {
    if (!on || e.button !== 0 || !onMap(e.target) || host.busy?.()) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const b = host.game.canvas.getBoundingClientRect();
    press = { x: e.clientX, y: e.clientY, i: itemAt(e.clientX - b.left, e.clientY - b.top), add: e.shiftKey || e.ctrlKey || e.metaKey, moved: false };
  };
  /** the pointer over the map: the heat map follows the kind of the offered item under it; a press dragged over the ground draws the box */
  const onMove = (e: PointerEvent) => {
    if (!on) return;
    const pr = press;
    if (pr) {
      if (!pr.moved && Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > 5) pr.moved = true;
      if (pr.moved) { drawSel(e.clientX, e.clientY); return; }
    }
    if (!onMap(e.target)) return;
    const b = host.game.canvas.getBoundingClientRect(), i = itemAt(e.clientX - b.left, e.clientY - b.top), k = i >= 0 ? cur!.items[i]!.kind : null;
    if (k !== hover) { hover = k; heatKey = ''; }
  };
  /** the release: a box selects the items in it (Shift or Ctrl adds them); a click selects the item under it (Shift or Ctrl+click adds or takes
   *  it out), or on the ground clears the selection */
  const onUp = (e: PointerEvent) => {
    const pr = press; if (!on || !pr) return;
    press = null; e.preventDefault(); e.stopImmediatePropagation();
    sel = selectAfter(sel, { item: pr.i, add: pr.add, box: pr.moved ? inBox(pr.x, pr.y, e.clientX, e.clientY) : null });
    const n = sel.size;
    host.say(n ? `${n} selected · Del deletes · Esc clears` : pr.i < 0 && !pr.moved ? 'click an offered item to select it (the house, fences and street items stay); drag a box to select several' : 'nothing in the box');
    selKey = ''; host.redraw();
  };
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove, { capture: true, passive: true });
  window.addEventListener('pointerup', onUp, true);
  /** the selection's marks (a ring at each selected item's ground point) and the box while it is drawn; drawn again when they change */
  function drawSel(bx?: number, by?: number): void {
    const c = cur, cam = host.game.cam;
    if (!on || !c) { if (selSvg.childNodes.length) selSvg.replaceChildren(); return; }
    const key = `${[...sel].join(',')}|${cam.X.toFixed(1)},${cam.Y.toFixed(1)},${cam.z.toFixed(4)}|${bx ?? ''},${by ?? ''}|${innerWidth}`;
    if (key === selKey) return;
    selKey = key;
    const out: SVGElement[] = [];
    for (const i of sel) {
      const it = c.items[i]; if (!it || it.deleted) continue;
      const p = host.toScreen(it.x, it.y); if (!p) continue;
      const ring = document.createElementNS(SVGNS, 'ellipse'), r = Math.max(9, 20 * cam.z / 0.12);
      ring.setAttribute('cx', `${p.x}`); ring.setAttribute('cy', `${p.y}`); ring.setAttribute('rx', `${r}`); ring.setAttribute('ry', `${r / 2}`);
      ring.setAttribute('fill', 'rgba(56,189,248,.22)'); ring.setAttribute('stroke', '#38bdf8'); ring.setAttribute('stroke-width', '3');
      out.push(ring);
    }
    const pr = press;
    if (pr && pr.moved && bx !== undefined && by !== undefined) {
      const rect = document.createElementNS(SVGNS, 'rect');
      rect.setAttribute('x', `${Math.min(pr.x, bx)}`); rect.setAttribute('y', `${Math.min(pr.y, by)}`); rect.setAttribute('width', `${Math.abs(bx - pr.x)}`); rect.setAttribute('height', `${Math.abs(by - pr.y)}`);
      rect.setAttribute('fill', 'rgba(56,189,248,.12)'); rect.setAttribute('stroke', '#38bdf8'); rect.setAttribute('stroke-dasharray', '6 4');
      out.push(rect);
    }
    selSvg.replaceChildren(...out);
  }
  // for the automated checks (dev builds only): the offered items left, with their kind, sector and place on screen
  (window as unknown as { ceWizard?: unknown }).ceWizard = {
    items: () => (cur ? cur.items.map((it, i) => ({ i, kind: it.kind, id: it.id, deleted: it.deleted, sector: sectorOf(cur!.lot, it.x, it.y), at: host.toScreen(it.x, it.y) })).filter(t => !t.deleted) : []),
    selected: () => [...sel],
    patches: () => (cur ? cur.base.patches.map(p => ({ kind: p.kind, tex: p.tex, n: p.pts.length / 2 })) : []),
    times: () => [...times],
  };

  /** the wizard on or off: the editor muted and paused while it runs; on, the first lot at once */
  function toggle(v = !on): void {
    on = v; pauseEditor(v); muteEditor(v); heatKey = ''; svg.style.display = v ? 'block' : 'none'; selSvg.style.display = v ? 'block' : 'none'; sel = new Set(); steps = []; press = null; selKey = '';
    if (v) next(false); else { cur = null; host.leave(); }
    host.redraw();
  }
  /** the wizard on with a given lot (the gallery's Fix: that lot to put right, item by item) */
  function load(c: WizLot): void {
    on = true; pauseEditor(true); muteEditor(true); heatKey = ''; svg.style.display = 'block';
    cur = { ...c, items: c.items.map(it => ({ ...it })), undo: [] }; sel = new Set(); steps = []; painted = false; press = null; selKey = ''; selSvg.style.display = 'block';
    host.show(build()); host.redraw();
  }
  /** the wizard's keys (the lab calls it first while the wizard is on, after its Draw keys): Space save and next, S skip, Del or Backspace delete
   *  the selection, Ctrl+Z undo, Esc clear the selection (with none: leave), W leave; true when handled */
  function onKey(e: KeyboardEvent): boolean {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'z' || e.key === 'Z')) { undo(); return true; }
    const mod = e.ctrlKey || e.metaKey || e.altKey;
    if (mod) return false;
    if (e.key === ' ') { if (!e.repeat) next(true); return true; }
    if (e.key === 's' || e.key === 'S') { next(false); host.say('skipped: nothing learned from that lot'); return true; }
    if (e.key === 'Delete' || e.key === 'Backspace') { deleteSel(); return true; }
    if (e.key === 'Escape' && sel.size) { sel = new Set(); selKey = ''; host.say('selection cleared'); host.redraw(); return true; }
    if (e.key === 'w' || e.key === 'W' || e.key === 'Escape') { toggle(false); return true; }
    return false;
  }
  /** the heat map: the lot's sectors tinted by the keep rate of the kind under the pointer (or the chosen one) for this house class, and the past
   *  samples of that kind at their place on this lot (normalised): kept green, deleted red. Drawn again only when the view or the data changed */
  function frame(): void {
    drawSel();
    const c = cur, cam = host.game.cam;
    if (!on || !heat || !c) { if (svg.childNodes.length) svg.replaceChildren(); return; }
    const kind = hover ?? heatKind, key = `${kind}|${cam.X.toFixed(1)},${cam.Y.toFixed(1)},${cam.z.toFixed(4)}|${innerWidth}x${innerHeight}|${learnedSamples().length}`;
    if (key === heatKey) return;
    heatKey = key;
    const out: SVGElement[] = [], m = modelOf(c.group), pt = (x: number, y: number) => host.toScreen(x, y);
    for (const s of SECTORS) {
      if (sectorArea(c.lot, s) < 0.25) continue;
      const rate = keepRate(m, c.cls, kind, s), n = countOf(m, c.cls, kind, s);
      for (const b of sectorRects(c.lot, s)) {
        const ps = [pt(b[0], b[1]), pt(b[2], b[1]), pt(b[2], b[3]), pt(b[0], b[3])];
        if (ps.some(p => !p)) continue;
        const poly = document.createElementNS(SVGNS, 'polygon');
        poly.setAttribute('points', ps.map(p => `${p!.x},${p!.y}`).join(' '));
        poly.setAttribute('fill', `hsla(${Math.round(rate * 120)},85%,50%,${n.offered ? 0.24 : 0.06})`); poly.setAttribute('stroke', 'rgba(255,255,255,.25)');
        out.push(poly);
      }
    }
    // the past samples of this kind, at their place on this lot (the newest 400)
    let shown = 0;
    // (the owner's samples of this lot's group: T173)
    const all = learnedSamples().filter(s => ownerSample(s) && sampleGroup(s) === c.group);
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
      el('span', 'font-size:12px;opacity:.85;white-space:nowrap', c ? `${left} of ${c.items.length} offered left${sel.size ? ` · ${sel.size} selected` : ''} · click to select · Del deletes · Space saves and next` : ''),
      btn('Delete (Del)', sel.size ? GO : BTN, () => deleteSel(), 'deletes the selected items (each still learns "not kept here")'),
      btn('Save & next (Space)', GO, () => next(true), 'records this lot (every offered item, kept or deleted) and shows the next one'),
      btn('Skip (S)', BTN, () => { next(false); host.say('skipped: nothing learned from that lot'); }, 'the next lot, nothing learned'),
      btn('↶ Undo (Ctrl+Z)', BTN, () => undo(), 'takes the last step back: a delete, a stroke, a placed decal'),
      btn('Exit (W)', BTN, () => toggle(false), 'W or Esc')];
  }
  /** the inspector's WIZARD section: the toggles, the counter (samples by house class, the share kept per lot and its trend, the save-and-next
   *  time), the heat map's kind, and this lot's sectors with the keep rate of that kind */
  function panel(): HTMLElement[] {
    const st = learningStats(learnedSamples()), c = cur, m = modelOf(c?.group ?? 'res'), kind = hover ?? heatKind, gs = groupStats(learnedSamples());
    const out: HTMLElement[] = [heading('LOT WIZARD', 'margin-top:4px')];
    const tg = el('div', 'display:flex;flex-direction:column;gap:3px');
    tg.append(check('same size and road (fastest)', same, v => { same = v; host.redraw(); }, 'off: each lot moves to the next coverage gap (another size or road angle)'),
      check('also keep as a draft preset', keep, v => { keep = v; host.redraw(); }, 'Space then saves the lot as a lab draft too (off: it only teaches the generator)'),
      check('heat map', heat, v => { heat = v; heatKey = ''; host.redraw(); }, 'each sector tinted by the keep rate of the kind under the pointer (or the one chosen); past samples kept green, deleted red'));
    out.push(tg);
    const ms = times.length ? [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)]! : 0;
    // T160/T173: the game composes its lots with a shipped model, never the live one: shipping freezes this one as the next version, once the owner
    // has seen its exam (the lab renders it beside the latest shipped model's)
    out.push(btn(`Ship model (v${shipped + 1})…`, GO, () => ship(), `renders the exam (the model learnt so far beside v${shipped}) and, on your word there, freezes it as lot model v${shipped + 1} (src/game/lots/lot-models, with its exam picture): new towns compose their lots with it; a saved town keeps its own version`));
    out.push(el('div', 'font-size:12px;opacity:.7;margin-top:4px', 'the presets are always the head start; your samples train the group of the lot they were made on'));
    // T173: the training counters per group: the owner's samples, the wizard's share kept per lot (first ten → last ten), the gallery's good share
    const tbl = el('div', 'display:grid;grid-template-columns:auto auto auto auto;gap:1px 8px;font-size:12px;margin-top:6px');
    tbl.append(el('b', '', 'group'), el('b', 'text-align:right', 'samples'), el('b', 'text-align:right', 'kept/lot'), el('b', 'text-align:right', 'good'));
    for (const g of USE_GROUPS) {
      const x = gs[g], lit = c?.group === g ? 'color:#c4b5fd;font-weight:700' : 'opacity:.85';
      tbl.append(el('span', lit, GROUP_NAMES[g]), el('span', `${lit};text-align:right`, `${x.samples}`), el('span', `${lit};text-align:right`, x.wizard ? `${Math.round(x.first * 100)}→${Math.round(x.last * 100)}%` : '·'), el('span', `${lit};text-align:right`, x.judged ? `${Math.round(x.up * 100)}% of ${x.judged}` : '·'));
    }
    out.push(el('div', 'font-size:13px;margin-top:6px;font-weight:700', `${st.total} sample${st.total === 1 ? '' : 's'}`), tbl,
      el('div', `font-size:12px;${ms > 500 ? 'color:#fca5a5' : 'opacity:.85'}`, times.length ? `next lot on screen: ${Math.round(times[0]!)} ms (median ${Math.round(ms)} ms of ${times.length})` : ''));
    if (st.shares.length > 1) out.push(spark(st.shares));
    const sel = el('select', 'background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:2px 6px;font:inherit;margin-left:6px');
    for (const k of ITEM_KINDS) sel.append(new Option(KIND_NAMES[k], k));
    sel.value = heatKind; sel.addEventListener('change', () => { heatKind = sel.value as ItemKind; heatKey = ''; host.redraw(); });
    const hk = el('div', 'margin-top:6px;font-size:12px'); hk.append(`heat map of`, sel, el('span', 'opacity:.7', hover ? ` (pointer: ${KIND_NAMES[hover]})` : ''));
    out.push(hk);
    if (c) {
      out.push(el('div', 'font-size:12px;opacity:.8;margin-top:4px', `${GROUP_NAMES[c.group]} · ${c.cls} main building${c.house ? '' : ' (none)'} · keep rate of ${KIND_NAMES[kind]} by sector:`));
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
  /** the latest shipped lot model (lot-models/index.ts LATEST, the ships of this session after it) */
  let shipped = LATEST;
  /** T173: Ship model: the live model (live-model.ts) shown in its exam beside the latest shipped one, shipped on the owner's word there */
  function ship(): void {
    const gs = groupStats(learnedSamples()), from = `the presets and ${USE_GROUPS.map(g => `${gs[g].samples} ${GROUP_NAMES[g]} sample${gs[g].samples === 1 ? '' : 's'}`).join(', ')}, shipped ${new Date().toISOString().slice(0, 10)}`;
    void host.ship(liveModel().data, from).then(v => { if (v) { shipped = v; host.say(`shipped lot model v${v} (and its exam picture): new towns compose their lots with it (after a reload)`); host.redraw(); } })
      .catch(e => host.say(`the model was not shipped: ${String(e)}`));
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
    on: () => on, toggle, onKey, frame, bar, panel, toggleBtn, next, load, ground, setGround, addDecal,
    dispose() { delete (window as unknown as { ceWizard?: unknown }).ceWizard; window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('pointermove', onMove, true); window.removeEventListener('pointerup', onUp, true); unLearn(); svg.remove(); selSvg.remove(); if (on) { pauseEditor(false); muteEditor(false); } },
  };
}
