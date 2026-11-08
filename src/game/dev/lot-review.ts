// T385 (#1042; the owner, 2026-11-08): the studio's LOT REVIEW (dev builds only: ?lotreview; the studio's Lot review tab frames it, scripts/assets/review/studio.html).
// "I can go into the studio with a quick pick decal and a props and quickly place shit or mark the lot as fucked and we can have you look at the fucked ones. maybe
// have a dropdown for multi select options and I can select which options are valid. check house, check driveway or parking lot. check trees, check fence."
//   BROWSE: every house lot of a generated town (the street grid a new game lays, its lots cut by the town's lot map, each lot given a seeded state) or of T353's
//     estate (its streets and lots), one at a time (arrows) or from the grid of lots in the left panel, each coloured by its standing (not looked at, touched, ok, bad).
//     The same seed is the same town, so a lot is the same before and after a change; the Autumn / Desert chips frame the page again in the other theme.
//   CHECKLIST: a dropdown of the four checks (House, Driveway or parking, Trees, Fence): tick what is valid, a lot with any check unticked is bad. The machine's own
//     reading of the lot (lots/lot-audit.ts) is beside each, and any clutter it finds. G: all good, Enter: save the ticks, B: mark bad (the note goes with it).
//   QUICK PICK: the Props and Decals flyouts (quick picks first, then every sprite and decal by category and search): arm one and click on the lot, it is placed as THAT LOT'S
//     OVERRIDE (kept in the lot's record, drawn with the lot again whenever it is composed); U undoes the last, C clears them.
//   SAVED: every action writes the lot's record into scripts/assets/lot-review.json through the dev server (POST /__dev/lot-review, lots/review-file.ts): the checks, the
//     bad mark and note, the override, the machine's reading and the lot's frame and state; the lead reads it (npm run lots:review). Nothing here ships: the game never reads it.
// The panels open to the side (flyouts), the lists scroll up and down: no sideways scrollbar. Camera and keys as the lot lab's: the HUD is hidden, the page's own keys stop here.
import type { Game } from '../engine';
import { CLASS } from '../network';
import { LIBRARY } from '../library';
import { MAP, worldX, worldY, ZOOM_MAX, ZOOM_MIN } from '../iso';
import { compose, type LotGeom } from '../lots/compose';
import { LOT_DECALS, type LotDecal } from '../lot-decals';
import decalSheet from '../../assets/ground/lot-decals.webp';
import { cleanYards } from '../lots/clean-yards';
import { auditLot, type LotAudit } from '../lots/lot-audit';
import { placeable, spriteGroup } from '../lots/item-kinds';
import { CHECKS, CHECK_WORDS, parseReview, reviewId, standingOf, summaryOf, type Check, type ReviewFile, type ReviewOverride, type ReviewRecord, type Standing } from '../lots/review-file';
import { estateState, estateStreets, overrideComposition, readingOf, reviewLot, townState, type ReviewKind, type ReviewLot } from './review-set';
import { LotGridLayer, type GridLot } from './lot-grid';
import { thumb } from './lot-editor';
import { BTN, DANGER, GO, ON, btn, chip, el, heading, typing } from './lot-lab-ui';

const SESSION = 'ce-lotreview', API = '/__dev/lot-review';
/** the left panel's and the review card's widths, the space (px) the fitted lot keeps clear of the free area's edges, the road strip kept in view past each end of a lot (tiles) */
const DRAWER = 292, CARD = 372, FIT = 36, MARGIN = 8;
const FILL: Record<Standing, string> = { none: '#334155', touched: '#d97706', ok: '#16a34a', bad: '#dc2626' };
const STANDING_WORDS: Record<Standing, string> = { none: 'not looked at', touched: 'touched', ok: 'OK', bad: 'BAD' };
const ARROW = ['↙', '↓', '↘', '→', '↗', '↑', '↖', '←'];
const LIB_AT = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
/** the quick picks: the yard things an owner puts back on a lot (library ids; one the library lacks is left out) */
const QUICK_PROPS = ['world:mailbox', 'gen:trash-cans-row', 'world:bench', 'town:hydrangea', 'town:fern', 'town:ornamental_grass', 'world:bush_1', 'capital:tree-oak-moderate', 'capital:tree-maple-open', 'world:tree_pine_1',
  'gen:back-swingset', 'expansion:sandbox', 'expansion:trampoline', 'expansion:basketball-hoop', 'expansion:barbecue', 'town:picnic_table', 'expansion:lawn-chair', 'expansion:doghouse', 'gen:kids-bikes', 'expansion:washing-line',
  'expansion:patio-swing', 'expansion:firepit', 'world:streetlamp', 'cars:burgundy-wagon:SW', 'cars:navy-wood-panel-wagon:SW', 'static:pickup_n'].filter(id => LIB_AT.has(id));
type Filter = 'all' | 'todo' | 'bad';
type Armed = { kind: 'prop' | 'decal'; id: string } | null;
/** what the page keeps across a reload (the theme chips frame the page again): the set, the seed, the lot, the filter */
interface Session { kind: ReviewKind; seed: number; idx: number; filter: Filter }
/** the lot being reviewed: its ticks and note not saved yet (dirty), and what is placed on it */
interface Pending { checks: Partial<Record<Check, boolean>>; note: string; override: ReviewOverride; dirty: boolean }

/** the world-px box of a lot and the road strip before it (the camera fits it) */
function lotBox(g: LotGeom) {
  const depth = 2 * CLASS.street.h + CLASS.street.walk, b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const [k, l] of [[0, 0], [g.w, 0], [g.w, g.d], [0, g.d], [-MARGIN, -depth], [g.w + MARGIN, -depth], [g.w + MARGIN, 0], [-MARGIN, 0]] as const) {
    const x = g.o.x + g.u.x * k + g.n.x * l, y = g.o.y + g.u.y * k + g.n.y * l, X = worldX(x, y), Y = worldY(x, y);
    b.x0 = Math.min(b.x0, X); b.y0 = Math.min(b.y0, Y); b.x1 = Math.max(b.x1, X); b.y1 = Math.max(b.y1, Y);
  }
  return b;
}
/** a decal's thumbnail on a tile px wide (its rectangle of the decal sheet, scaled to fit and centred) */
function decalThumb(t: HTMLElement, d: LotDecal, px: number) {
  const k = (px - 8) / Math.max(d.w, d.h);
  Object.assign(t.style, { backgroundImage: `url(${decalSheet})`, backgroundSize: `${2048 * k}px ${1180 * k}px`, backgroundPosition: `${(px - d.w * k) / 2 - d.x * k}px ${(px - d.h * k) / 2 - d.y * k}px`, backgroundRepeat: 'no-repeat' });
}
/** installs the lot review on a game (dev builds, ?lotreview, in the lab's light boot); returns the uninstall */
export function installLotReview(game: Game): () => void {
  const query = new URLSearchParams(location.search), saved = (() => { try { return JSON.parse(sessionStorage.getItem(SESSION) ?? 'null') as Partial<Session> | null; } catch { return null; } })();
  let kind: ReviewKind = query.get('source') === 'estate' ? 'estate' : query.get('source') === 'town' ? 'town' : saved?.kind === 'estate' ? 'estate' : 'town';
  let seed = Math.max(0, Math.floor(+(query.get('seed') ?? saved?.seed ?? 1) || 1)), idx = Math.max(0, Math.floor(+(query.get('lot') ?? saved?.idx ?? 0) || 0));
  let filter: Filter = saved?.filter === 'todo' || saved?.filter === 'bad' ? saved.filter : 'all';
  const theme: 'autumn' | 'desert' = game.desertTheme ? 'desert' : 'autumn';
  let file: ReviewFile = { v: 1, lots: {} }, lots: ReviewLot[] = [], pend: Pending | null = null, armed: Armed = null, fly: 'checks' | 'props' | 'decals' | null = null;
  let message = '', started = false, audit: LotAudit | null = null, auditId = '', lastWasProp = true;
  const gridLayer = new LotGridLayer(), gridLots: GridLot[] = [];
  const cur = (): ReviewLot | undefined => lots[idx];
  const recOf = (l: ReviewLot): ReviewRecord | undefined => file.lots[l.id];
  const standing = (l: ReviewLot): Standing => standingOf(recOf(l));
  const visible = (): number[] => lots.map((l, i) => i).filter(i => { const s = standing(lots[i]!); return filter === 'all' || (filter === 'todo' ? s === 'none' || s === 'touched' : s === 'bad'); });
  const remember = () => { try { sessionStorage.setItem(SESSION, JSON.stringify({ kind, seed, idx, filter } satisfies Session)); } catch { /* no storage */ } };

  // ---------- the dev server's file
  async function load(): Promise<void> { try { file = parseReview(await (await fetch(API)).text()); } catch { message = 'the review file could not be read'; } }
  async function post(body: { upsert?: Record<string, ReviewRecord>; remove?: string[] }): Promise<boolean> {
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) { message = `not saved: ${(await r.json().catch(() => ({ error: r.status }))).error}`; return false; }
      return true;
    } catch (e) { message = `not saved: ${String(e)}`; return false; }
  }

  // ---------- the lot being reviewed
  const effective = (id: string): ReviewOverride | undefined => (pend && cur()?.id === id ? pend.override : file.lots[id]?.override);
  game.lotOverride = (key, g) => overrideComposition(g, effective(reviewId(kind, seed, key)));
  function open(i: number) {
    idx = Math.min(Math.max(0, i), Math.max(0, lots.length - 1)); const l = cur(); pend = null; audit = null; auditId = '';
    if (l) { const r = recOf(l); pend = { checks: { ...(r?.checks ?? {}) }, note: r?.note ?? '', override: { props: [...(r?.override?.props ?? [])], decals: [...(r?.override?.decals ?? [])] }, dirty: false }; }
    remember(); fit(); render();
  }
  /** the record a lot is saved as: its frame and state, the ticks (every check written when commit; else only the valid ones), the mark and note, what is placed, what the machine read */
  function recordOf(l: ReviewLot, p: Pending, o: { commit: boolean; bad?: boolean }): ReviewRecord {
    const a = reading(l), checks: Partial<Record<Check, boolean>> = {};
    for (const c of CHECKS) { if (o.commit) checks[c] = p.checks[c] === true; else if (p.checks[c] === true) checks[c] = true; }
    const prev = recOf(l);
    return {
      kind: l.kind, seed: l.seed, theme, key: l.key, o: [l.g.o.x, l.g.o.y], u: [l.g.u.x, l.g.u.y], n: [l.g.n.x, l.g.n.y], w: l.g.w, d: l.g.d, use: l.st.use, level: l.st.level, decline: l.st.decline,
      ...(l.st.tier !== undefined ? { tier: l.st.tier } : {}), lotSeed: l.st.seed, road: l.road, checks: o.commit ? checks : { ...(prev?.checks ?? {}), ...checks },
      ...(o.bad || (o.bad === undefined && prev?.bad) ? { bad: true } : {}), ...(p.note.trim() ? { note: p.note.trim().slice(0, 600) } : {}),
      ...(p.override.props.length || p.override.decals.length ? { override: { props: p.override.props, decals: p.override.decals } } : {}),
      audit: { house: a.house, buildings: a.buildings, facingOff: a.facingOff, drive: a.drive, driveConnects: a.driveConnects, path: a.path, trees: a.trees, treesClear: a.treesClear, fence: a.fence, fencePieces: a.fencePieces, fenceAcross: a.fenceAcross, clutter: a.clutter.slice(0, 60) },
      at: new Date().toISOString(),
    };
  }
  /** the machine's reading of a lot as the game composes it (without the override), kept for the lot shown */
  function reading(l: ReviewLot): LotAudit { if (audit && auditId === l.id) return audit; audit = auditLot(l.g, compose(l.g, l.st)); auditId = l.id; return audit; }
  /** saves the shown lot's record (a mark, the ticks, a placement) */
  async function commit(o: { commit: boolean; bad?: boolean }): Promise<boolean> {
    const l = cur(), p = pend; if (!l || !p) return false;
    const rec = recordOf(l, p, o);
    if (!(await post({ upsert: { [l.id]: rec } }))) { render(); return false; }
    file.lots[l.id] = rec; p.dirty = false; return true;
  }
  /** goes to a lot, saving the ticks left unsaved on this one first */
  async function go(i: number) { if (pend?.dirty) await commit({ commit: true }); open(i); }
  async function step(d: 1 | -1) {
    const v = visible(); if (!v.length) return;
    const at = v.indexOf(idx); const next = at >= 0 ? v[(at + d + v.length) % v.length]! : (d > 0 ? v.find(i => i > idx) ?? v[0]! : [...v].reverse().find(i => i < idx) ?? v[v.length - 1]!);
    await go(next);
  }
  async function mark(what: 'good' | 'save' | 'bad') {
    const p = pend, l = cur(); if (!p || !l) return;
    if (what === 'good') for (const c of CHECKS) p.checks[c] = true;
    const ok = await commit(what === 'bad' ? { commit: true, bad: true } : { commit: true, bad: what === 'good' ? false : undefined });
    const s = summaryOf(file);
    message = ok ? `${l.id}: ${STANDING_WORDS[standing(l)]} (saved; ${s.ok} ok, ${s.bad} bad of ${s.lots} looked at)` : message;
    if (ok) await step(1); else render();
  }
  async function place(x: number, y: number) {
    const l = cur(), p = pend, a = armed; if (!l || !p || !a) return;
    const dx = x - l.g.o.x, dy = y - l.g.o.y, ca = dx * l.g.u.x + dy * l.g.u.y, cb = dx * l.g.n.x + dy * l.g.n.y;
    if (ca < -0.5 || ca > l.g.w + 0.5 || cb < -1 || cb > l.g.d + 0.5) { message = 'click inside the outlined lot: what is placed is that lot\'s override'; render(); return; }
    const snap = (v: number) => Math.round(v * 4) / 4;
    if (a.kind === 'prop') p.override.props.push({ id: a.id, a: snap(ca), b: snap(cb) }); else p.override.decals.push({ id: a.id, a: snap(ca), b: snap(cb) });
    game.restageReview(l.key);
    message = `${a.id} placed (${p.override.props.length} sprites, ${p.override.decals.length} decals on this lot)`;
    await commit({ commit: false }); render();
  }
  async function undo(all: boolean) {
    const l = cur(), p = pend; if (!l || !p) return;
    if (all) { p.override.props.length = 0; p.override.decals.length = 0; } else if (!p.override.decals.length || (p.override.props.length && lastWasProp)) p.override.props.pop(); else p.override.decals.pop();
    game.restageReview(l.key); message = all ? 'the override is cleared' : 'the last one is taken off'; await commit({ commit: false }); render();
  }

  // ---------- staging and the camera
  async function stage() {
    message = `laying the ${kind} (seed ${seed})...`; render();
    await load();
    const out = game.stageReview({ kind, state: i => (kind === 'town' ? townState(seed, i) : estateState(seed, i)), streets: estateStreets({ x: MAP / 2, y: MAP / 2 }) });
    lots = out.map(o => reviewLot(kind, seed, o.key, o.g, o.st));
    message = `${lots.length} house lots of the ${kind}, seed ${seed}`;
    open(idx);
  }
  const free = () => ({ L: DRAWER, T: 0, R: innerWidth - CARD, B: innerHeight });
  function fit() {
    const l = cur(); if (!l) return;
    const h = lotBox(l.g), a = free(), z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, (a.R - a.L - 2 * FIT) / (h.x1 - h.x0), (a.B - a.T - 2 * FIT) / (h.y1 - h.y0)));
    game.camEase = null; game.cam.z = z;
    const c = game.canvas.getBoundingClientRect(), ox = c.left + game.cssW / 2, oy = c.top + game.cssH / 2, wx = (h.x0 + h.x1) / 2, wy = (h.y0 + h.y1) / 2;
    game.cam.X = wx - ((a.L + a.R) / 2 - ox) / z; game.cam.Y = wy - ((a.T + a.B) / 2 - oy) / z; game.emit();
    gridLots.length = 0; gridLots.push({ o: l.g.o, u: l.g.u, n: l.g.n, w: l.g.w, d: l.g.d, cells: false, alpha: 1 });
  }

  // ---------- the panels (plain DOM over the game; the lists scroll up and down only)
  const style = document.createElement('style');
  style.textContent = '#root > div > :not(canvas){display:none!important}#ce-dev-editor-panel{display:none!important}#ce-lotreview *{scrollbar-width:thin}';
  const root = el('div', 'position:fixed;inset:0;z-index:60;pointer-events:none;font:13px/1.4 system-ui,"Segoe UI",sans-serif;color:#e2e8f0'); root.id = 'ce-lotreview';
  const PANEL = 'background:rgba(12,18,28,.95);box-shadow:0 6px 24px rgba(0,0,0,.45);pointer-events:auto;box-sizing:border-box;';
  const drawer = el('div', `position:absolute;left:0;top:0;bottom:0;width:${DRAWER}px;overflow-y:auto;overflow-x:hidden;padding:10px 12px;border-right:1px solid #38bdf8;${PANEL}`);
  const card = el('div', `position:absolute;right:0;top:0;bottom:0;width:${CARD}px;overflow-y:auto;overflow-x:hidden;padding:10px 12px;border-left:1px solid #38bdf8;${PANEL}`);
  const flyout = el('div', `position:absolute;right:${CARD}px;top:48px;width:392px;max-height:calc(100vh - 72px);overflow-y:auto;overflow-x:hidden;padding:10px 12px;border:1px solid #38bdf8;border-right:0;border-radius:10px 0 0 10px;display:none;${PANEL}`);
  const status = el('div', `position:absolute;left:${DRAWER + 10}px;top:8px;max-width:calc(100vw - ${DRAWER + CARD + 30}px);padding:4px 10px;border-radius:8px;background:rgba(12,18,28,.85);color:#fcd34d;white-space:pre-wrap;pointer-events:none`);
  root.append(drawer, card, flyout, status);
  let propSearch = '', propCat = 'quick', decalGroup = '', propShown = 120;

  function drawStatus() { status.textContent = (cleanYards() ? '' : 'OLD YARDS (?oldyards)  ') + (armed ? `placing ${armed.id}: click inside the lot (Shift+click: more, Esc stops)` : message); }
  function render() { drawDrawer(); drawCard(); drawFly(); drawStatus(); game.canvas.style.cursor = armed ? 'crosshair' : ''; }

  function drawDrawer() {
    const s = summaryOf(file), top = el('div', 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:4px 0');
    const set = (k: ReviewKind, sd: number) => { kind = k; seed = sd; idx = 0; pend = null; remember(); void stage(); };
    top.append(chip('Town', kind === 'town', () => set('town', seed), 'the house lots of a generated town'), chip('Estate', kind === 'estate', () => set('estate', seed), 'T353\'s estate lots'));
    const sin = el('input', 'width:64px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:3px 6px;font:inherit'); sin.type = 'number'; sin.value = String(seed); sin.title = 'the set\'s seed: the same seed is the same town';
    sin.addEventListener('change', () => set(kind, Math.max(0, Math.floor(+sin.value || 0))));
    top.append(el('span', 'opacity:.7', 'seed'), sin);
    const th = el('div', 'display:flex;gap:6px;margin:4px 0');
    const reload = (d: 'on' | 'off') => { remember(); const u = new URL(location.href); u.searchParams.set('desert', d); u.searchParams.set('lot', String(idx)); location.href = u.toString(); };
    th.append(chip('Autumn', theme === 'autumn', () => theme !== 'autumn' && reload('off'), 'frame the page again in the autumn look'), chip('Desert', theme === 'desert', () => theme !== 'desert' && reload('on'), 'frame the page again in the desert look'));
    const fl = el('div', 'display:flex;gap:6px;margin:4px 0');
    for (const [f, w, t] of [['all', 'All', 'every lot'], ['todo', 'To do', 'lots not looked at, or touched'], ['bad', 'Bad', 'the lots marked bad']] as const) fl.append(chip(w, filter === f, () => { filter = f; remember(); render(); }, t));
    const sum = el('div', 'margin:6px 0;opacity:.85', `${s.ok} ok, ${s.bad} bad, ${s.touched} touched of ${lots.length} lots in this set (${s.lots} in the file)`);
    const grid = el('div', 'display:flex;flex-wrap:wrap;gap:3px;margin-top:6px');
    for (const i of visible()) {
      const l = lots[i]!, st = standing(l), t = el('button', `cursor:pointer;width:32px;height:26px;border-radius:5px;font:11px ui-monospace,Consolas,monospace;color:#fff;background:${FILL[st]};border:${i === idx ? '2px solid #7dd3fc' : '1px solid #0f172a'};padding:0`, String(i + 1));
      t.title = `${l.id}\n${l.g.w}x${l.g.d} ${ARROW[l.road]} road ${l.road}, ${l.st.level === 3 ? 'upgraded' : 'built'}${l.st.decline ? `, decline ${l.st.decline}` : ''}${l.st.tier !== undefined ? `, tier ${l.st.tier}` : ''}\n${STANDING_WORDS[st]}`;
      t.addEventListener('click', () => void go(i)); grid.append(t);
    }
    drawer.replaceChildren(el('div', 'font-weight:800;color:#7dd3fc;font-size:14px;letter-spacing:.06em', 'LOT REVIEW'), el('div', 'opacity:.7;font-size:12px', 'the owner\'s studio: house lots of a generated town or the estate, ticked and marked, saved to scripts/assets/lot-review.json'), top, th, fl, sum, grid);
  }

  /** the checks dropdown: its button (the valid ones named) and the flyout beside the card that opens from it */
  function drawCard() {
    const l = cur(), p = pend;
    if (!l || !p) { card.replaceChildren(el('div', 'opacity:.7', lots.length ? '' : 'no lots yet')); return; }
    const a = reading(l), rd = readingOf(a), st = standing(l);
    const head = el('div', 'display:flex;align-items:center;gap:8px');
    head.append(el('div', 'font-weight:800;color:#7dd3fc;font-size:14px;letter-spacing:.06em;flex:1', `LOT ${idx + 1} / ${lots.length}`));
    const badge = el('span', `padding:1px 10px;border-radius:999px;background:${FILL[st]};color:#fff;font-weight:700;font-size:12px`, STANDING_WORDS[st]); head.append(badge);
    const info = el('div', 'margin:4px 0;opacity:.9', `${l.g.w} x ${l.g.d} tiles, ${ARROW[l.road]} road ${l.road}, ${l.st.level === 3 ? 'upgraded' : 'built'}${l.st.decline ? `, decline ${l.st.decline}` : ''}${l.st.tier !== undefined ? `, tier ${l.st.tier}` : ''}, ${kind} ${seed}`);
    const nav = el('div', 'display:flex;gap:6px;margin:6px 0');
    nav.append(btn('◂ Prev', BTN, () => void step(-1), 'previous lot (Left arrow, ,)'), btn('Next ▸', BTN, () => void step(1), 'next lot (Right arrow, .)'));
    const valid = CHECKS.filter(c => p.checks[c]).map(c => CHECK_WORDS[c]);
    const dd = btn(`Valid: ${valid.length ? valid.join(', ') : 'none ticked'}  ${fly === 'checks' ? '◂' : '▸'}`, `${fly === 'checks' ? ON : BTN}width:100%;text-align:left;white-space:normal`, () => { fly = fly === 'checks' ? null : 'checks'; render(); }, 'the checks: tick what is valid, any unticked check marks the lot bad (1 to 4 toggle them)');
    const acts = el('div', 'display:flex;gap:6px;margin:6px 0;flex-wrap:wrap');
    acts.append(btn('Good (G)', GO, () => void mark('good'), 'all four valid, saved, next lot'), btn('Save (Enter)', BTN, () => void mark('save'), 'save the ticks as they are (an unticked check marks the lot bad), next lot'), btn('Mark bad (B)', DANGER, () => void mark('bad'), 'mark the lot bad, with the note, next lot'));
    const note = el('textarea', 'width:100%;height:54px;box-sizing:border-box;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:4px 6px;font:inherit;resize:vertical'); note.placeholder = 'a note for the lead (N: type here, then B)';
    note.value = p.note; note.addEventListener('input', () => { p.note = note.value; p.dirty = true; });
    const ov = p.override, placed = el('div', 'margin:6px 0;display:flex;gap:6px;align-items:center;flex-wrap:wrap');
    placed.append(el('span', 'opacity:.85', `placed here: ${ov.props.length} sprites, ${ov.decals.length} decals`), btn('Undo (U)', BTN, () => void undo(false), 'take the last one off'), btn('Clear (C)', BTN, () => void undo(true), 'take every placed one off'));
    const pal = el('div', 'display:flex;gap:6px;margin:6px 0');
    pal.append(btn(`Props ${fly === 'props' ? '◂' : '▸'} (P)`, fly === 'props' ? ON : BTN, () => { fly = fly === 'props' ? null : 'props'; render(); }, 'quick pick props, and every sprite by category and search'), btn(`Decals ${fly === 'decals' ? '◂' : '▸'} (D)`, fly === 'decals' ? ON : BTN, () => { fly = fly === 'decals' ? null : 'decals'; render(); }, 'quick pick ground decals'));
    const read = el('div', 'margin-top:8px;font-size:12px');
    read.append(heading('THE MACHINE READS'));
    for (const c of CHECKS) read.append(el('div', `color:${rd[c][0] ? '#86efac' : '#fca5a5'}`, `${rd[c][0] ? '✓' : '✗'} ${CHECK_WORDS[c]}: ${rd[c][1]}`));
    read.append(el('div', `color:${a.clutter.length ? '#fca5a5' : '#86efac'}`, a.clutter.length ? `✗ clutter: ${[...new Set(a.clutter)].join(', ')}` : '✓ no clutter'));
    const keys = el('div', 'margin-top:10px;font-size:11px;opacity:.6', 'keys: arrows or , . lots · 1-4 ticks · G good · Enter save · B bad · N note · P props · D decals · U undo · C clear · Esc stop placing');
    card.replaceChildren(head, info, nav, dd, acts, el('div', 'font-size:12px;opacity:.75;margin-top:4px', 'a lot with any check unticked is bad'), note, placed, pal, read, keys);
  }

  /** the flyout beside the card: the checks, the props or the decals */
  function drawFly() {
    flyout.style.display = fly ? 'block' : 'none'; if (!fly) return;
    const p = pend, l = cur(); if (!p || !l) return;
    if (fly === 'checks') {
      const rd = readingOf(reading(l)), box = el('div');
      box.append(el('div', 'font-weight:800;color:#7dd3fc;letter-spacing:.06em;margin-bottom:6px', 'VALID'));
      CHECKS.forEach((c, k) => {
        const row = el('label', 'display:flex;gap:8px;align-items:flex-start;padding:6px 4px;cursor:pointer;border-bottom:1px solid #1e293b'), cb = el('input'); cb.type = 'checkbox'; cb.checked = p.checks[c] === true;
        cb.addEventListener('change', () => { p.checks[c] = cb.checked; p.dirty = true; render(); });
        const t = el('div'); t.append(el('div', 'font-weight:600', `${k + 1}  ${CHECK_WORDS[c]}`), el('div', `font-size:12px;color:${rd[c][0] ? '#86efac' : '#fca5a5'}`, `the machine: ${rd[c][1]}`));
        row.append(cb, t); box.append(row);
      });
      box.append(el('div', 'margin-top:8px;font-size:12px;opacity:.7', 'Anything unticked marks the lot bad when it is saved (Enter, G, B, or on to the next lot).'));
      flyout.replaceChildren(box); return;
    }
    const grid = el('div', 'display:flex;flex-wrap:wrap;gap:6px;margin-top:8px'), px = 64;
    const tile = (title: string, on: boolean, click: () => void) => { const t = el('div', `position:relative;width:${px}px;height:${px}px;box-sizing:border-box;border:${on ? '2px solid #38bdf8' : '1px solid #334155'};border-radius:7px;background:#0f172a;cursor:pointer;background-repeat:no-repeat`); t.title = title; t.addEventListener('click', click); return t; };
    if (fly === 'decals') {
      const groups = [...new Set(LOT_DECALS.map(d => d.group))], chips = el('div', 'display:flex;flex-wrap:wrap;gap:6px');
      chips.append(chip('all', decalGroup === '', () => { decalGroup = ''; render(); }), ...groups.map(g => chip(g, decalGroup === g, () => { decalGroup = g; render(); })));
      for (const d of LOT_DECALS) {
        if (decalGroup && d.group !== decalGroup) continue;
        const t = tile(`${d.id} (${d.group}): click, then click on the lot`, armed?.id === d.id, () => { armed = armed?.id === d.id ? null : { kind: 'decal', id: d.id }; lastWasProp = false; render(); });
        decalThumb(t, d, px - 2); grid.append(t);
      }
      flyout.replaceChildren(el('div', 'font-weight:800;color:#7dd3fc;letter-spacing:.06em', 'DECALS'), chips, grid); return;
    }
    // props: quick picks first, then every sprite the lots may place, by category; the search narrows the category (the quick picks: every sprite)
    const find = el('input', 'width:100%;box-sizing:border-box;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:4px 8px;font:inherit;margin-top:6px'); find.placeholder = 'search the sprites (id or name)'; find.value = propSearch;
    const cats = new Map<string, number>(); LIBRARY.forEach((it, i) => { if (placeable(it, i) && spriteGroup(it) !== 'buildings') cats.set(it.cat, (cats.get(it.cat) ?? 0) + 1); });
    const chips = el('div', 'display:flex;flex-wrap:wrap;gap:6px;margin-top:6px');
    chips.append(chip('quick', propCat === 'quick', () => { propCat = 'quick'; propShown = 120; render(); }), chip('all', propCat === '', () => { propCat = ''; propShown = 120; render(); }),
      ...[...cats].sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([c, n]) => chip(`${c} ${n}`, propCat === c, () => { propCat = c; propShown = 120; render(); })));
    /** the grid of tiles for the category and search (made again as the search is typed: the search box itself stays, so it keeps the focus) */
    const fill = () => {
      const s = propSearch.trim().toLowerCase();
      const list = s || propCat !== 'quick' ? LIBRARY.filter((it, i) => placeable(it, i) && spriteGroup(it) !== 'buildings' && (!propCat || propCat === 'quick' || it.cat === propCat) && (!s || it.id.toLowerCase().includes(s) || it.name.toLowerCase().includes(s))).map(it => it.id) : QUICK_PROPS;
      const tiles: HTMLElement[] = [];
      for (const id of list.slice(0, propShown)) {
        const it = LIBRARY[LIB_AT.get(id)!]!, t = tile(`${it.name}
${id}: click, then click on the lot`, armed?.id === id, () => { armed = armed?.id === id ? null : { kind: 'prop', id }; lastWasProp = true; render(); });
        const pic = el('div', 'position:absolute;background-repeat:no-repeat'), z = thumb(pic, id, px - 8);
        Object.assign(pic.style, { width: `${z.w}px`, height: `${z.h}px`, left: `${(px - 2 - z.w) / 2}px`, top: `${px - 5 - z.h}px` }); t.append(pic); tiles.push(t);
      }
      if (list.length > propShown) tiles.push(btn(`${list.length - propShown} more`, BTN, () => { propShown += 120; fill(); }));
      if (!list.length) tiles.push(el('div', 'opacity:.7;padding:8px', 'nothing matches'));
      grid.replaceChildren(...tiles);
    };
    find.addEventListener('input', () => { propSearch = find.value; propShown = 120; fill(); });
    fill();
    flyout.replaceChildren(el('div', 'font-weight:800;color:#7dd3fc;letter-spacing:.06em', 'PROPS'), find, chips, grid);
  }

  // ---------- keys and the pointer
  const onKey = (e: KeyboardEvent) => {
    if (!started || e.ctrlKey || e.metaKey || e.altKey) return;
    const inField = typing(e.target);
    if (e.key === 'Escape') { if (armed || fly) { armed = null; fly = null; render(); e.stopImmediatePropagation(); e.preventDefault(); } if (inField && e.target instanceof HTMLElement) e.target.blur(); return; }
    if (inField) { if (e.key === 'Enter' && e.target instanceof HTMLTextAreaElement && !e.shiftKey) { e.preventDefault(); e.stopImmediatePropagation(); void mark('save'); } else e.stopImmediatePropagation(); return; }
    const k = e.key.toLowerCase(); let used = true;
    if (e.key === 'ArrowRight' || k === '.') void step(1); else if (e.key === 'ArrowLeft' || k === ',') void step(-1);
    else if (k === 'g') void mark('good'); else if (e.key === 'Enter') void mark('save'); else if (k === 'b') void mark('bad');
    else if (k >= '1' && k <= '4' && pend) { const c = CHECKS[+k - 1]!; pend.checks[c] = !pend.checks[c]; pend.dirty = true; render(); }
    else if (k === 'n') { const t = card.querySelector('textarea'); t?.focus(); }
    else if (k === 'p') { fly = fly === 'props' ? null : 'props'; render(); } else if (k === 'd') { fly = fly === 'decals' ? null : 'decals'; render(); }
    else if (k === 'u') void undo(false); else if (k === 'c') void undo(true);
    else used = false;
    if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
  };
  const onDown = (e: PointerEvent) => {
    if (!armed || !started || e.button !== 0) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const t = game.tileAt(e.offsetX, e.offsetY); void place(t.x, t.y);
    if (!e.shiftKey) { armed = null; render(); }
  };
  window.addEventListener('keydown', onKey, true); game.canvas.addEventListener('pointerdown', onDown, true);
  document.head.append(style); document.body.append(root);
  game.devGround = (gl, v) => gridLots.length > 0 && gridLayer.draw(gl, v, gridLots);
  const onResize = () => { fit(); };
  window.addEventListener('resize', onResize);

  // the headless shots drive the page through this (scripts/dev/lot-review-shots.mjs)
  Object.assign(window as unknown as Record<string, unknown>, { __lotReview: {
    ready: () => started && lots.length > 0, lots: () => lots, index: () => idx, file: () => file, open: (i: number) => open(i), flyout: (w: typeof fly) => { fly = w; render(); },
    hide: (on: boolean) => { root.style.display = on ? 'none' : ''; }, say: () => message,
  } });

  // ---------- start once the game is ready
  const poll = window.setInterval(() => { if (!game.ready) return; window.clearInterval(poll); started = true; void stage(); }, 200);
  render();
  return () => {
    window.clearInterval(poll); window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', onResize); game.canvas.removeEventListener('pointerdown', onDown, true);
    style.remove(); root.remove(); if (game.lotOverride) game.lotOverride = null; game.devGround = null; gridLayer.dispose(); delete (window as unknown as Record<string, unknown>).__lotReview;
  };
}
