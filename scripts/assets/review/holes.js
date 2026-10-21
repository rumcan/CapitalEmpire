// The Holes tab of the sprite studio: the golf hole presets (src/game/golf/hole-presets.json, 18 slots) as painted areas and props on an iso canvas. Served by server.mjs.
import { roundCorners, checkArea, insidePoly, PAINT_TEXES, BORDER_TEXES, BORDER_W, RADIUS_MAX } from '/hole-lib.js';

const N = 18, FLOWERS = ['town:hydrangea', 'town:fern', 'town:ornamental_grass'], FLAGS = ['golf:flagstick', 'business:golf-pin-red'];
/** the Add menu's area kinds: texture, border size, border texture (a 16-point circle of radius 5 at the view centre, corner radius 2) */
const KINDS = { Rough: ['golfRough', 0, 'kerb'], Fairway: ['golfFairway', 3, 'golfFirstCut'], Green: ['golfGreen', 2, 'golfFringe'], Tee: ['golfTee', 1, 'golfFirstCut'], Bunker: ['bunkerSand', 2, 'golfRough'], Water: ['waterDark', 2, 'dirt'], 'Cart path': ['asphalt', 0, 'kerb'] };
const COL = new Map(BORDER_TEXES.map(t => [t.id, t.col])), TEXES = new Map(), PICS = new Map(), NONE = { ok: false, img: null, pat: null };
const SEL = '#5ee6ff', BAD = '#ff4d3a';

const snap = (v, n) => Math.round(v * n) / n + 0;
/** an outline's shape check (checkArea), at the map centre: the presets are in a local frame (the tee at 0), so the map's edge does not apply */
const shapeErr = pts => checkArea(pts.map(v => v + 1024));
const el = (t, a = {}, ...k) => { const e = document.createElement(t); Object.assign(e, a); for (const c of k) if (c != null) e.append(c); return e; };
const btn = (t, fn, c = '') => el('button', { className: 'btn ' + c, textContent: t, onclick: fn });
const hint = t => el('div', { className: 'hint', textContent: t });
const clone = h => JSON.parse(JSON.stringify(h));
const empty = () => ({ name: 'Hole', areas: [], props: [] });
/** a hole in the stored shape (the key order server.mjs writes): for the unsaved check and for Save */
const norm = h => ({ name: h.name, areas: h.areas.map(a => ({ tex: a.tex, border: a.border, btex: a.btex, radius: a.radius, ...(a.kind !== undefined ? { kind: a.kind } : {}), pts: a.pts })), props: h.props.map(p => ({ id: p.id, x: p.x, y: p.y, flip: p.flip, scale: p.scale })) });

// state: the slot being edited (draft, unsaved), its selection, the view (z, ox, oy in CSS px), the drag in progress
let stored = Array(N).fill(null), SPR = new Map(), REMOVED = {}, PICKS = [], pickSel = null, DPR = 1, raf = 0;
const S = { slot: 0, draft: empty(), undo: [], sel: null, prop: null, pend: null, z: 1, ox: 0, oy: 0, cw: 0, ch: 0, drag: null, fitted: false };

// ---------------- the page
const nameIn = el('input', { placeholder: 'Name', style: 'min-width:140px', oninput: () => { S.draft.name = nameIn.value.slice(0, 40); renderList(); } });
const seedIn = el('input', { type: 'number', value: '1', style: 'min-width:0;width:90px' });
const msgEl = el('span', { className: 'hint' });
const list = el('div', { className: 'list', style: 'width:170px;overflow:auto' });
const side = el('div', { className: 'side', style: 'width:290px;overflow:auto' });
const cv = el('canvas', { style: 'position:absolute;inset:0;width:100%;height:100%;touch-action:none' });
const cwrap = el('div', { style: 'flex:1;position:relative;min-width:0;overflow:hidden' }, cv);
const ctx = cv.getContext('2d');
document.getElementById('v-holes').append(el('div', { style: 'display:flex;flex-direction:column;height:calc(100vh - 70px)' },
  el('div', { className: 'bar' }, nameIn, el('span', { className: 'hint', textContent: 'Seed' }), seedIn, btn('Generate', generate), btn('Re-scatter plants', rescatter),
    btn('Save', save, 'gold'), btn('Revert', revert), btn('Clear slot', clearSlot, 'red'), btn('Fit', () => { fit(); draw(); }), el('span', { style: 'flex:1' }), msgEl),
  el('div', { style: 'display:flex;flex:1;min-height:0' }, list, cwrap, side)));
new ResizeObserver(() => {
  DPR = window.devicePixelRatio || 1; S.cw = cwrap.clientWidth; S.ch = cwrap.clientHeight;
  cv.width = Math.round(S.cw * DPR); cv.height = Math.round(S.ch * DPR);
  if (!S.fitted && S.cw) { fit(); S.fitted = true; }
  draw();
}).observe(cwrap);

function msg(t, bad) { msgEl.textContent = t; msgEl.style.color = bad ? '#d0543a' : ''; }
const dirty = () => JSON.stringify(norm(S.draft)) !== JSON.stringify(norm(stored[S.slot] ?? empty()));
const isPlant = id => !FLAGS.includes(id) && (FLOWERS.includes(id) || SPR.get(id)?.kind === 'tree' || SPR.get(id)?.kind === 'bush');

// ---------------- the slots and the undo stack
function renderList() {
  list.innerHTML = '';
  for (let i = 0; i < N; i++) {
    const h = stored[i], on = i === S.slot, d = on && dirty();
    list.append(el('div', { className: 'li' + (on ? ' on' : ''), style: h ? 'font-weight:700' : '', onclick: () => openSlot(i) },
      `Hole ${i + 1}${d ? ' ●' : ''}`, el('br'), el('small', { textContent: h ? h.name : 'empty' })));
  }
}
function openSlot(i) {
  if (i === S.slot) return;
  if (dirty() && !confirm(`Discard the unsaved changes to Hole ${S.slot + 1}?`)) return;
  S.slot = i; S.draft = stored[i] ? clone(stored[i]) : empty(); S.undo = []; S.sel = null; S.prop = null; S.pend = null;
  fit(); refresh();
}
function pushUndo() { S.undo.push(JSON.stringify(S.draft)); if (S.undo.length > 50) S.undo.shift(); }
function undo() { const s = S.undo.pop(); if (!s) return msg('Nothing to undo'); S.draft = JSON.parse(s); clampSel(); refresh(); }
function clampSel() { if (S.sel !== null && S.sel >= S.draft.areas.length) S.sel = null; if (S.prop !== null && S.prop >= S.draft.props.length) S.prop = null; }
function refresh() { nameIn.value = S.draft.name; renderList(); panel(); draw(); cv.style.cursor = S.pend ? 'copy' : 'crosshair'; }

// ---------------- the bar: generate, save, revert, clear
const gen = async () => (await fetch('/api/hole-generate?seed=' + encodeURIComponent(seedIn.value))).json();
async function generate() {
  const h = await gen(); pushUndo();
  S.draft.areas = h.areas; S.draft.props = h.props; S.sel = null; S.prop = null;
  msg(`Seed ${seedIn.value}: not saved yet`); fit(); refresh();
}
/** the plants (trees, bushes, flowers) of the hole go, a fresh set at the seed comes in; the areas and the flag stay */
async function rescatter() {
  const h = await gen(); pushUndo();
  S.draft.props = S.draft.props.filter(p => !isPlant(p.id)).concat(h.props.filter(p => isPlant(p.id)));
  S.prop = null; msg(`Plants re-scattered from seed ${seedIn.value}: not saved yet`); refresh();
}
async function save() {
  const bad = S.draft.areas.findIndex(a => shapeErr(a.pts) !== '');
  if (bad >= 0) return msg(`Area ${bad + 1}: ${shapeErr(S.draft.areas[bad].pts)}`, true);
  if (!S.draft.areas.length) return msg('Add an area first', true);
  const r = await fetch('/api/holes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ n: S.slot + 1, hole: norm(S.draft) }) });
  if (!r.ok) return msg(await r.text(), true);
  const d = await r.json(); stored = d.holes; S.draft = clone(stored[S.slot]);
  msg(`Saved Hole ${S.slot + 1}`); refresh();
}
function revert() { pushUndo(); S.draft = stored[S.slot] ? clone(stored[S.slot]) : empty(); S.sel = null; S.prop = null; msg('Reverted'); refresh(); }
async function clearSlot() {
  if (!confirm(`Clear Hole ${S.slot + 1}?`)) return;
  const r = await fetch('/api/holes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ n: S.slot + 1, hole: null }) });
  if (!r.ok) return msg(await r.text(), true);
  stored = (await r.json()).holes; S.draft = empty(); S.undo = []; S.sel = null; S.prop = null; msg(`Cleared Hole ${S.slot + 1}`); refresh();
}

// ---------------- the view: iso tile (x, y) -> screen ((x - y) * 32 * z + ox, (x + y) * 16 * z + oy)
const proj = (x, y) => [(x - y) * 32 * S.z + S.ox, (x + y) * 16 * S.z + S.oy];
const unproj = (sx, sy) => { const u = (sx - S.ox) / (32 * S.z), v = (sy - S.oy) / (16 * S.z); return [(u + v) / 2, (v - u) / 2]; };
/** centre the hole in the canvas (its areas and props; the origin when empty) */
function fit() {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const see = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const a of S.draft.areas) for (let k = 0; k < a.pts.length; k += 2) see(a.pts[k], a.pts[k + 1]);
  for (const p of S.draft.props) see(p.x, p.y);
  if (!(x1 >= x0)) { x0 = 0; y0 = 0; x1 = 10; y1 = 10; }
  const umin = (x0 - y1) * 32, umax = (x1 - y0) * 32, vmin = (x0 + y0) * 16, vmax = (x1 + y1) * 16;
  const uw = Math.max(1, umax - umin), vh = Math.max(1, vmax - vmin);
  S.z = Math.min(6, Math.max(0.3, Math.min(S.cw * 0.9 / uw, S.ch * 0.9 / vh)));
  S.ox = S.cw / 2 - (umin + umax) / 2 * S.z; S.oy = S.ch / 2 - (vmin + vmax) / 2 * S.z;
}

// ---------------- drawing
function texture(id) {
  if (id === 'kerb') return NONE;
  let t = TEXES.get(id);
  if (!t) { const img = new Image(); t = { ok: false, img, pat: null }; img.onload = () => { t.ok = true; draw(); }; img.src = '/tex/' + encodeURIComponent(id); TEXES.set(id, t); }
  return t;
}
/** a texture's photo as a pattern (one photo spans 4 tiles), or the Paint colour until it loads (and on a 404) */
function fillOf(id) {
  const t = texture(id);
  if (t.ok && !t.pat) { const p = ctx.createPattern(t.img, 'repeat'); if (p) { p.setTransform(new DOMMatrix().scale(4 / t.img.width)); t.pat = p; } }
  return t.pat ?? COL.get(id) ?? '#555555';
}
/** an area's outline in tile space, corners rounded */
function outline(a) {
  const q = roundCorners(a.pts, a.radius), p = new Path2D(); p.moveTo(q[0], q[1]);
  for (let k = 2; k < q.length; k += 2) p.lineTo(q[k], q[k + 1]);
  p.closePath(); return p;
}
function picOf(id) {
  let im = PICS.get(id);
  if (!im) { im = new Image(); im.onload = draw; im.src = '/thumb/' + encodeURIComponent(id); PICS.set(id, im); }
  return im;
}
/** a prop's screen box: its anchor point (sx, sy), the picture's size (w, h) and the offset of its anchor in the picture (ax, ay) at the prop's scale (k); flipped about the anchor */
function boxOf(p) {
  const s = SPR.get(p.id), q = s ? s.quad : [0, 0, 64, 64], qw = q[2] - q[0], qh = q[3] - q[1], k = p.scale * S.z / 2;
  const ax = (s?.ax ?? (q[0] + q[2]) / 2) - q[0], ay = (s?.ay ?? q[3]) - q[1], [sx, sy] = proj(p.x, p.y), A = p.flip ? qw - ax : ax;
  return { sx, sy, ax, ay, k, w: qw * k, h: qh * k, left: sx - A * k, top: sy - ay * k };
}
/** the prop indices, the furthest from the viewer first (by x + y) */
const propOrder = () => S.draft.props.map((_, i) => i).sort((a, b) => (S.draft.props[a].x + S.draft.props[a].y) - (S.draft.props[b].x + S.draft.props[b].y));
function propAt(x, y) {
  const ord = propOrder();
  for (let j = ord.length - 1; j >= 0; j--) { const b = boxOf(S.draft.props[ord[j]]); if (x >= b.left && x <= b.left + b.w && y >= b.top && y <= b.top + b.h) return ord[j]; }
  return null;
}
function areaAt(tx, ty) { for (let i = S.draft.areas.length - 1; i >= 0; i--) if (insidePoly(S.draft.areas[i].pts, tx, ty)) return i; return null; }
function draw() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); }
function paint() {
  const g = ctx, D = DPR, z = S.z, A = S.draft.areas, sel = S.sel;
  g.setTransform(D, 0, 0, D, 0, 0); g.fillStyle = '#26361c'; g.fillRect(0, 0, S.cw, S.ch);
  g.setTransform(32 * z * D, 16 * z * D, -32 * z * D, 16 * z * D, S.ox * D, S.oy * D);
  for (const a of A) {
    const path = outline(a); g.fillStyle = fillOf(a.tex); g.fill(path);
    if (a.border) { g.save(); g.clip(path); g.lineWidth = 2 * BORDER_W[a.border]; g.strokeStyle = fillOf(a.btex); g.stroke(path); g.restore(); }
  }
  A.forEach((a, i) => {
    const bad = shapeErr(a.pts) !== '';
    if (!bad && i !== sel) return;
    g.lineWidth = (bad ? 2.5 : 2) / (32 * z); g.strokeStyle = bad ? BAD : SEL; g.stroke(outline(a));
  });
  g.setTransform(D, 0, 0, D, 0, 0);
  for (const i of propOrder()) {
    const p = S.draft.props[i], b = boxOf(p), im = picOf(p.id);
    if (!im.complete || !im.naturalWidth) continue;
    g.save(); g.translate(b.sx, b.sy); if (p.flip) g.scale(-1, 1); g.drawImage(im, -b.ax * b.k, -b.ay * b.k, b.w, b.h); g.restore();
  }
  if (S.prop !== null && S.draft.props[S.prop]) { const b = boxOf(S.draft.props[S.prop]); g.lineWidth = 2; g.strokeStyle = SEL; g.strokeRect(b.left, b.top, b.w, b.h); }
  if (sel !== null && A[sel]) {
    g.fillStyle = SEL; const pts = A[sel].pts;
    for (let k = 0; k < pts.length; k += 2) { const [sx, sy] = proj(pts[k], pts[k + 1]); g.fillRect(sx - 4, sy - 4, 8, 8); }
  }
}

// ---------------- the mouse: select, drag (corner, area, prop), place, pan, zoom
cv.oncontextmenu = e => e.preventDefault();
cv.addEventListener('pointerdown', e => {
  e.preventDefault();
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  cv.setPointerCapture(e.pointerId);
  if (e.button !== 0) { S.drag = { pan: true, x0: x, y0: y, ox: S.ox, oy: S.oy }; return; }
  const [tx, ty] = unproj(x, y);
  if (S.pend) {
    pushUndo(); const sp = SPR.get(S.pend);
    S.draft.props.push({ id: S.pend, x: snap(tx, 10), y: snap(ty, 10), flip: false, scale: sp?.scale ?? 1 });
    S.prop = S.draft.props.length - 1; S.sel = null; S.pend = null; msg(''); refresh(); return;
  }
  const a = S.sel !== null ? S.draft.areas[S.sel] : null;
  if (a) for (let k = 0; k < a.pts.length; k += 2) {
    const [sx, sy] = proj(a.pts[k], a.pts[k + 1]);
    if (Math.hypot(sx - x, sy - y) <= 7) { S.drag = { kind: 'corner', i: k, area: S.sel, x0: tx, y0: ty, orig: a.pts.slice(), moved: false }; return; }
  }
  const pi = propAt(x, y);
  if (pi !== null) { const p = S.draft.props[pi]; S.sel = null; S.prop = pi; S.drag = { kind: 'prop', i: pi, dx: p.x - tx, dy: p.y - ty, moved: false }; refresh(); return; }
  const ai = areaAt(tx, ty); S.prop = null; S.sel = ai;
  if (ai !== null) S.drag = { kind: 'area', i: ai, x0: tx, y0: ty, orig: S.draft.areas[ai].pts.slice(), moved: false };
  refresh();
});
cv.addEventListener('pointermove', e => {
  const d = S.drag; if (!d) return;
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  if (d.pan) { S.ox = d.ox + x - d.x0; S.oy = d.oy + y - d.y0; draw(); return; }
  const [tx, ty] = unproj(x, y);
  if (!d.moved) { pushUndo(); d.moved = true; }
  if (d.kind === 'corner') { const a = S.draft.areas[d.area]; a.pts = d.orig.slice(); a.pts[d.i] = snap(tx, 4); a.pts[d.i + 1] = snap(ty, 4); }
  if (d.kind === 'area') { const a = S.draft.areas[d.i], dx = snap(tx - d.x0, 4), dy = snap(ty - d.y0, 4); a.pts = d.orig.map((v, k) => v + (k % 2 ? dy : dx)); }
  if (d.kind === 'prop') { const p = S.draft.props[d.i]; p.x = snap(tx + d.dx, 10); p.y = snap(ty + d.dy, 10); }
  draw();
});
const endDrag = () => { const d = S.drag; S.drag = null; if (d && d.moved) refresh(); };
cv.addEventListener('pointerup', endDrag);
cv.addEventListener('pointercancel', endDrag);
cv.addEventListener('wheel', e => {
  e.preventDefault();
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, z0 = S.z, z1 = Math.min(6, Math.max(0.3, z0 * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
  S.ox = x - (x - S.ox) * z1 / z0; S.oy = y - (y - S.oy) * z1 / z0; S.z = z1; draw();
}, { passive: false });

// ---------------- edits of the selection (also the keys: Delete, F, + and -, Ctrl+Z)
function delSel() {
  if (S.sel !== null) { pushUndo(); S.draft.areas.splice(S.sel, 1); S.sel = null; refresh(); return true; }
  if (S.prop !== null) { pushUndo(); S.draft.props.splice(S.prop, 1); S.prop = null; refresh(); return true; }
  return false;
}
function flipSel() { if (S.prop === null) return; pushUndo(); const p = S.draft.props[S.prop]; p.flip = !p.flip; refresh(); }
function scaleSel(f) { if (S.prop === null) return; pushUndo(); const p = S.draft.props[S.prop]; p.scale = Math.min(5, Math.max(0.1, +(p.scale * f).toFixed(3))); refresh(); }
/** the area one step up (later in the array, drawn over) or down */
function moveArea(d) {
  const a = S.sel, t = a + d, A = S.draft.areas;
  if (a === null || t < 0 || t >= A.length) return;
  pushUndo(); [A[a], A[t]] = [A[t], A[a]]; S.sel = t; refresh();
}
function addArea(k) {
  const [tex, border, btex] = KINDS[k], [cx, cy] = unproj(S.cw / 2, S.ch / 2), pts = [];
  for (let i = 0; i < 16; i++) { const a = 2 * Math.PI * i / 16; pts.push(snap(cx + 5 * Math.cos(a), 4), snap(cy + 5 * Math.sin(a), 4)); }
  pushUndo(); S.draft.areas.push({ tex, border, btex, radius: 2, kind: k, pts });
  S.sel = S.draft.areas.length - 1; S.prop = null; refresh();
}
window.addEventListener('keydown', e => {
  if (!document.getElementById('v-holes').classList.contains('on') || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { if (delSel()) e.preventDefault(); }
  else if (e.key === 'f' || e.key === 'F') flipSel();
  else if (e.key === '+' || e.key === '=') scaleSel(1.08);
  else if (e.key === '-') scaleSel(1 / 1.08);
  else if (e.key === 'Escape') { S.pend = null; S.sel = null; S.prop = null; msg(''); refresh(); }
});

// ---------------- the side panel: the selected area, the selected prop, or the Add menu
function panel() {
  side.innerHTML = '';
  if (S.sel !== null && S.draft.areas[S.sel]) return areaPanel(S.draft.areas[S.sel], S.sel);
  if (S.prop !== null && S.draft.props[S.prop]) return propPanel(S.draft.props[S.prop]);
  side.append(el('h3', { textContent: 'Nothing selected' }), hint('Click an area or a prop on the canvas. Wheel zooms, right- or middle-drag pans.'),
    el('h3', { textContent: 'Add an area' }), hint('A 5-tile circle at the view centre:'),
    el('div', { className: 'chips' }, ...Object.keys(KINDS).map(k => el('span', { className: 'chip', textContent: k, onclick: () => addArea(k) }))),
    el('h3', { textContent: 'Add a prop' }), hint('Pick a sprite, then click the canvas to put it down (Esc cancels).'),
    pickSel, el('div', { className: 'row', style: 'padding:0;margin:8px 0' }, btn('Place', () => { S.pend = pickSel.value; msg('Click the canvas to place it'); refresh(); })));
}
function areaPanel(a, i) {
  const err = shapeErr(a.pts), n = S.draft.areas.length;
  const tsel = el('select', { onchange: e => { pushUndo(); a.tex = e.target.value; refresh(); } }, ...PAINT_TEXES.map(t => el('option', { value: t.id, textContent: t.name })));
  tsel.value = a.tex;
  const bsel = el('select', { onchange: e => { pushUndo(); a.btex = e.target.value; refresh(); } }, ...BORDER_TEXES.map(t => el('option', { value: t.id, textContent: t.name })));
  bsel.value = a.btex;
  const chips = el('div', { className: 'chips' }, ...['None', 'Small', 'Medium', 'Large'].map((t, k) => el('span', { className: 'chip' + (a.border === k ? ' on' : ''), textContent: t, onclick: () => { if (a.border !== k) { pushUndo(); a.border = k; refresh(); } } })));
  const rv = el('span', { textContent: String(a.radius) });
  const rr = el('input', { type: 'range', min: 0, max: RADIUS_MAX, step: 0.5, value: a.radius, style: 'width:100%;min-width:0', onpointerdown: () => pushUndo(), oninput: e => { a.radius = +e.target.value; rv.textContent = String(a.radius); draw(); } });
  side.append(el('h3', { textContent: `Area ${i + 1} of ${n}${a.kind ? ' · ' + a.kind : ''}` }),
    hint('Texture'), tsel, hint('Border'), chips, hint('Border texture'), bsel,
    el('div', { className: 'hint' }, 'Corner radius ', rv, ' tiles'), rr,
    el('div', { className: 'row', style: 'padding:0;margin:8px 0' }, Object.assign(btn('Up', () => moveArea(1)), { disabled: i >= n - 1 }), Object.assign(btn('Down', () => moveArea(-1)), { disabled: i <= 0 }), btn('Delete', delSel, 'red')),
    err ? el('div', { className: 'msg', style: 'color:#d0543a', textContent: 'Invalid: ' + err + '. Save refuses it.' }) : hint('Drag a corner, or inside to move it (0.25 tile steps). Delete or Backspace removes it.'));
}
function propPanel(p) {
  const s = SPR.get(p.id);
  side.append(el('h3', { textContent: s ? s.name : p.id }), el('div', { className: 'id', textContent: p.id }),
    hint(`at ${p.x.toFixed(1)}, ${p.y.toFixed(1)} · scale ${p.scale.toFixed(2)}${p.flip ? ' · mirrored' : ''}`),
    el('div', { className: 'row', style: 'padding:0;margin:8px 0' }, btn('Flip (F)', flipSel), btn('Smaller (-)', () => scaleSel(1 / 1.08)), btn('Bigger (+)', () => scaleSel(1.08))),
    el('div', { className: 'row', style: 'padding:0;margin:8px 0' }, btn('Delete', delSel, 'red')),
    hint('Drag it to move (0.1 tile steps). Delete or Backspace removes it.'));
}

// ---------------- load
async function load() {
  const [h, s] = await Promise.all([fetch('/api/holes').then(r => r.json()), fetch('/api/sprites').then(r => r.json())]);
  stored = h.holes; REMOVED = s.removed;
  for (const sp of s.sprites) SPR.set(sp.id, sp);
  PICKS = s.sprites.filter(sp => !REMOVED[sp.id] && (sp.kind === 'tree' || sp.kind === 'bush' || FLOWERS.includes(sp.id) || FLAGS.includes(sp.id))).sort((a, b) => (a.id < b.id ? -1 : 1));
  pickSel = el('select', { style: 'max-width:100%' }, ...PICKS.map(sp => el('option', { value: sp.id, textContent: sp.name + ' · ' + sp.id })));
  S.draft = stored[S.slot] ? clone(stored[S.slot]) : empty();
  if (S.cw) { fit(); S.fitted = true; }
  refresh();
}
load();
