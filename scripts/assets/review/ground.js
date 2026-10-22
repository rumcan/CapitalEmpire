// The Ground tab of the sprite studio: the map's base grass. Two pictures (A and B, any ground picture or grass photo) with size and colour
// controls, mixed exactly as the game mixes them (src/game/base-grass.ts mixGrass), previewed on a block of 4 houses inside 4 streets with
// sidewalks. Save writes src/game/base-grass.json and the two adjusted pictures (src/assets/ground/base-grass-a.webp / -b.webp); the game
// reads them after Rebuild (or npm run build). Below the grass, the map decals laid over it (src/game/map-decals.ts: nature patches, bare soil,
// grass patches, leaf scatters, tufts), placed and drawn in the preview exactly as the game does; Save decals writes src/game/map-decals.json.
// Served by server.mjs.
import { adjustPixels, mixGrass, canvas, ctx2d, soilStamps, AUTHOR, DEFAULT_MIX, DEFAULT_SIDE, DECAL_LAYERS, DEFAULT_DECALS, DECALS, NATURE, decalPics, drawDecals, placeDecals } from '/ground-lib.js';

const el = (t, a = {}, ...k) => { const e = document.createElement(t); Object.assign(e, a); for (const c of k) if (c != null) e.append(c); return e; };
const btn = (t, fn, c = '') => el('button', { className: 'btn ' + c, textContent: t, onclick: fn });
const hint = t => el('div', { className: 'hint', textContent: t });
const clone = o => JSON.parse(JSON.stringify(o));
const BASE_W = 2048, BASE_H = 1024;

// state: the settings being edited (F), the last saved (saved), the sources, the houses, the loaded pictures
let F = null, saved = null, SOURCES = [], HOUSES = [], RANGES = null, mixed = null, sideCv = { a: null, b: null }, busy = 0, timer = 0;
const IMGS = new Map();
// the map decals being edited (DF), the last saved (dSaved), and their pictures (decalArt: nature patches, soil stamps, decals)
let DF = null, dSaved = null, decalArt = null;
const V = { z: 0.5, night: false };

// ---------------- the page
const root = document.getElementById('v-ground');
const left = el('div', { className: 'side', style: 'width:360px;overflow:auto;border-left:0;border-right:1px solid var(--line)' });
const cv = el('canvas', { style: 'display:block;width:100%;height:100%' });
const stage = el('div', { style: 'flex:1;position:relative;min-width:0;background:#0d0f08' }, cv);
const msgEl = el('span', { className: 'hint' });
const saveB = btn('Save', save, 'gold');
const bar = el('div', { className: 'bar' },
  saveB, btn('Undo changes', () => { F = clone(saved); build(); rebuild(); }), btn("Back to the game's grass", unsave, 'red'),
  el('span', { className: 'hint', textContent: 'Zoom' }),
  ...[['Close', 0.5], ['Mid', 0.3], ['Far', 0.15]].map(([t, z]) => { const b = el('button', { className: 'chip', textContent: t, onclick: () => { V.z = z; zoomChips(); draw(); } }); b.dataset.z = z; return b; }),
  el('span', { style: 'flex:1' }), msgEl);
root.append(el('div', { style: 'display:flex;flex-direction:column;height:calc(100vh - 70px)' }, bar, el('div', { style: 'display:flex;flex:1;min-height:0' }, left, stage)));
const zoomChips = () => bar.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', +c.dataset.z === V.z));
const msg = t => { msgEl.textContent = t; };
const dirty = () => JSON.stringify(F) !== JSON.stringify(saved) || !saved.saved;
const dDirty = () => JSON.stringify(DF.layers) !== JSON.stringify(dSaved.layers);

// ---------------- pictures
function img(src) {
  let p = IMGS.get(src);
  if (!p) { p = new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('cannot load ' + src)); im.src = src; }); IMGS.set(src, p); }
  return p;
}
/** one side's picture as the game gets it: the source squeezed to 256 x scale px, its colours adjusted (what Save writes) */
async function sidePicture(s) {
  const im = await img('/ground-src?p=' + encodeURIComponent(s.src)), px = Math.max(16, Math.min(4096, Math.round(256 * s.scale)));
  const c = canvas(px, px), g = ctx2d(c); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, px, px);
  const d = g.getImageData(0, 0, px, px); adjustPixels(d.data, s); g.putImageData(d, 0, 0);
  return c;
}
/** the picture at the size the game lays it (px x AUTHOR) */
function gameSize(c) { const n = Math.round(c.width * AUTHOR), o = canvas(n, n), g = ctx2d(o); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, n, n); return o; }

/** rebuilds the two pictures and the mix (debounced; the mix takes a second or two) */
function rebuild() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const my = ++busy; msg('mixing…');
    try {
      const [a, b] = await Promise.all([sidePicture(F.a), sidePicture(F.b)]);
      if (my !== busy) return;
      sideCv = { a, b };
      await new Promise(r => setTimeout(r, 0));
      mixed = mixGrass(gameSize(a), gameSize(b), F.mix, BASE_W, BASE_H, AUTHOR);
      if (my !== busy) return;
      swatches(); draw(); msg(dirty() ? 'not saved' : 'saved');
    } catch (e) { msg(String(e.message || e)); }
  }, 250);
}

// ---------------- the side panel
const groups = () => [...new Set(SOURCES.map(s => s.group))];
function sourcePicker(k) {
  const wrap = el('div', { style: 'max-height:210px;overflow:auto;border:1px solid var(--line);border-radius:6px;padding:4px;margin:4px 0' });
  for (const gname of groups()) {
    wrap.append(el('div', { className: 'hint', style: 'margin:4px 2px', textContent: gname }));
    const row = el('div', { style: 'display:flex;flex-wrap:wrap;gap:4px' });
    for (const s of SOURCES.filter(x => x.group === gname)) {
      const on = F[k].src === s.src;
      const t = el('img', { src: '/ground-src?thumb=1&p=' + encodeURIComponent(s.src), title: s.name, loading: 'lazy', width: 48, height: 48, style: `cursor:pointer;border-radius:4px;border:2px solid ${on ? 'var(--gold)' : 'transparent'}` });
      t.onclick = () => { F[k].src = s.src; build(); rebuild(); };
      row.append(t);
    }
    wrap.append(row);
  }
  return wrap;
}
/** a labelled slider: value shown as fmt(v) */
function slider(label, get, set, [lo, hi], step, fmt = v => v.toFixed(2)) {
  const out = el('span', { className: 'scale', style: 'min-width:54px', textContent: fmt(get()) });
  const inp = el('input', { type: 'range', min: lo, max: hi, step, value: get(), style: 'min-width:0;flex:1;padding:0' });
  inp.oninput = () => { set(+inp.value); out.textContent = fmt(+inp.value); rebuild(); };
  return el('div', { className: 'prow' }, el('span', { style: 'width:86px;font-size:12px;color:var(--dim)', textContent: label }), inp, out);
}
/** the Tint slider row with the colour picker after its label */
const tintRow = (color, row) => { row.children[0].after(color); return row; };
function sideBlock(k) {
  const s = F[k], R = RANGES, cur = SOURCES.find(x => x.src === s.src);
  const color = el('input', { type: 'color', value: s.tint, style: 'min-width:0;width:44px;flex:0 0 44px;padding:0;height:24px' });
  color.oninput = () => { s.tint = color.value; rebuild(); };
  const sw = el('canvas', { width: 64, height: 64, style: 'border-radius:4px;border:1px solid var(--line)' }); sw.dataset.side = k;
  return el('div', { style: 'margin-bottom:12px' },
    el('h3', {}, el('span', { textContent: `Grass ${k.toUpperCase()} ` }), el('small', { className: 'hint', textContent: cur ? `${cur.group}: ${cur.name}` : s.src })),
    el('div', { style: 'display:flex;gap:8px;align-items:center' }, sw, hint(k === 'a' ? 'The ground everywhere.' : 'Laid over A in soft patches (the B share below).')),
    sourcePicker(k),
    slider('Size', () => s.scale, v => { s.scale = v; }, R.scale, 0.05, v => `${Math.round(v * 256)} px`),
    slider('Brightness', () => s.bright, v => { s.bright = v; }, R.bright, 0.01),
    slider('Contrast', () => s.contrast, v => { s.contrast = v; }, R.contrast, 0.01),
    slider('Saturation', () => s.sat, v => { s.sat = v; }, R.sat, 0.01),
    slider('Hue', () => s.hue, v => { s.hue = v; }, R.hue, 1, v => `${Math.round(v)}°`),
    tintRow(color, slider('Tint', () => s.tintAmt, v => { s.tintAmt = v; }, R.tintAmt, 0.01, v => `${Math.round(v * 100)}%`)),
    el('div', { className: 'row', style: 'padding:0' }, btn(`Reset ${k.toUpperCase()}'s colours and size`, () => { F[k] = { ...clone(DEFAULT_SIDE), src: s.src }; build(); rebuild(); })));
}
function build() {
  const R = RANGES, m = F.mix;
  left.replaceChildren(
    hint('Pick any two pictures, size and colour them, and set how they mix. The preview is the game\'s own mix on a block of 4 houses inside 4 streets. Save, then Rebuild game sprites (top right) to see it in the game.'),
    sideBlock('a'), sideBlock('b'),
    el('div', { className: 'row', style: 'padding:0;margin-bottom:10px' }, btn('Swap A and B', () => { [F.a, F.b] = [F.b, F.a]; build(); rebuild(); })),
    el('h3', { textContent: 'The mix' }),
    slider('B share', () => m.share, v => { m.share = v; }, R.share, 0.01, v => `${Math.round(v * 100)}%`),
    slider('Softness', () => m.soft, v => { m.soft = v; }, R.soft, 0.01),
    slider('Patch size', () => m.patch, v => { m.patch = v; }, R.patch, 0.05, v => `${v.toFixed(2)}x`),
    slider('Light swing', () => m.tone, v => { m.tone = v; }, R.tone, 0.01, v => `±${Math.round(v * 100)}%`),
    slider('Warm / cool', () => m.warm, v => { m.warm = v; }, R.warm, 0.01, v => `±${Math.round(v * 100)}%`),
    el('div', { className: 'row', style: 'padding:0' }, btn("The game's mix", () => { F.mix = clone(DEFAULT_MIX); build(); rebuild(); })),
    el('h3', { textContent: 'The whole texture' }), hint('The 2048 x 1024 mixed texture the game tiles over the map.'),
    el('canvas', { id: 'g-flat', width: 320, height: 160, style: 'border:1px solid var(--line);border-radius:4px' }),
    decalsBlock());
  swatches(); saveB.disabled = false;
}
// ---------------- the map decals
const pct = v => `${Math.round(v * 100)}%`;
/** a slider for the decals: redraws the preview (no re-mix) */
function dSlider(label, get, set, [lo, hi], step, fmt = v => v.toFixed(2)) {
  const out = el('span', { className: 'scale', style: 'min-width:54px', textContent: fmt(get()) });
  const inp = el('input', { type: 'range', min: lo, max: hi, step, value: get(), style: 'min-width:0;flex:1;padding:0' });
  inp.oninput = () => { set(+inp.value); out.textContent = fmt(get()); decalsChanged(); };
  return el('div', { className: 'prow' }, el('span', { style: 'width:86px;font-size:12px;color:var(--dim)', textContent: label }), inp, out);
}
const check = (label, get, set, size = 12) => { const c = el('input', { type: 'checkbox', checked: get(), style: 'flex:0 0 auto;min-width:0;width:auto;padding:0;margin:0' }); c.onchange = () => { set(c.checked); decalsChanged(); }; return el('label', { style: `display:flex;gap:6px;align-items:center;font-size:${size}px;cursor:pointer` }, c, label); };
/** one layer picture as a 48 px tile (its crop of the atlas) */
function picTile(id, k) {
  const c = el('canvas', { width: 48, height: 48, style: 'background:#4a6a2a;border-radius:4px' }), g = c.getContext('2d');
  if (!decalArt) return c;
  const sw4 = decalArt.soil.width / 4;
  const [im, sx, sy, sw, sh] = id === 'nature' ? [decalArt.nature, NATURE[k].x, NATURE[k].y, NATURE[k].w, NATURE[k].h] : id === 'soil' ? [decalArt.soil, k * sw4, 0, sw4, decalArt.soil.height] : [decalArt.decals, DECALS[k].x, DECALS[k].y, DECALS[k].w, DECALS[k].h];
  const f = Math.min(48 / sw, 48 / sh); g.drawImage(im, sx, sy, sw, sh, (48 - sw * f) / 2, (48 - sh * f) / 2, sw * f, sh * f);
  return c;
}
function layerBlock(L) {
  const s = DF.layers[L.id], pics = decalPics(L.id);
  const grid = el('div', { style: 'display:flex;flex-wrap:wrap;gap:4px;margin:4px 0' });
  pics.forEach((k, i) => {
    const on = !s.off.includes(i), t = picTile(L.id, k); t.title = on ? 'used: click to leave it out' : 'left out: click to use it';
    t.style.cursor = 'pointer'; t.style.border = `2px solid ${on ? 'var(--gold)' : 'transparent'}`; t.style.opacity = on ? 1 : 0.35;
    t.onclick = () => { s.off = on ? [...s.off, i].sort((a, b) => a - b) : s.off.filter(x => x !== i); build(); decalsChanged(); };
    grid.append(t);
  });
  const sizeFmt = v => `${v.toFixed(2)}x`;
  return el('div', { style: `margin-bottom:12px;${s.on ? '' : 'opacity:0.6'}` },
    el('h3', { style: 'display:flex;gap:6px;align-items:center;margin-bottom:2px' }, check(L.name, () => s.on, v => { s.on = v; build(); }, 14)), hint(L.note),
    dSlider('How many', () => s.count, v => { s.count = v; }, L.count, L.count[1] > 5 ? 0.05 : 0.01, v => `${v.toFixed(2)} / 8x8 tiles`),
    dSlider('Smallest', () => s.min, v => { s.min = v; if (s.max < v) s.max = v; }, L.size, 0.01, sizeFmt),
    dSlider('Largest', () => s.max, v => { s.max = v; if (s.min > v) s.min = v; }, L.size, 0.01, sizeFmt),
    dSlider('Faintest', () => s.aMin, v => { s.aMin = v; if (s.aMax < v) s.aMax = v; }, [0, 1], 0.01, pct),
    dSlider('Strongest', () => s.aMax, v => { s.aMax = v; if (s.aMin > v) s.aMin = v; }, [0, 1], 0.01, pct),
    check('Mirror at random', () => s.flip, v => { s.flip = v; }),
    hint('Pictures (click to use or leave out):'), grid,
    el('div', { className: 'row', style: 'padding:0' }, btn(`The game's ${L.name.toLowerCase()}`, () => { DF.layers[L.id] = clone(DEFAULT_DECALS[L.id]); build(); decalsChanged(); })));
}
function decalsBlock() {
  if (!DF) return null;
  return el('div', { style: 'border-top:1px solid var(--line);margin-top:14px;padding-top:8px' },
    el('h3', { textContent: 'Map decals' }),
    hint('Laid over the grass everywhere on the map, under roads, lots and terrain (which cover them). Each layer: on or off, how many, the size and opacity ranges and which pictures. The preview shows them on the grass. Save decals, then Rebuild game sprites to see them in the game.'),
    el('div', { className: 'row', style: 'padding:0;margin:6px 0 4px' },
      btn('Save decals', saveDecals, 'gold'), btn('Undo decal changes', () => { DF = clone(dSaved); build(); decalsChanged(); })),
    el('div', { className: 'row', style: 'padding:0;margin:0 0 10px' },
      btn("The game's decals", () => { DF.layers = clone(DEFAULT_DECALS); build(); decalsChanged(); }),
      btn('All off', () => { for (const L of DECAL_LAYERS) DF.layers[L.id].on = false; build(); decalsChanged(); }, 'red')),
    ...DECAL_LAYERS.map(layerBlock));
}
function decalsChanged() { draw(); msg(dDirty() ? 'decals not saved' : 'decals saved'); }
async function saveDecals() {
  msg('saving decals…');
  const r = await fetch('/api/decals', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file: DF }) });
  if (!r.ok) { msg(await r.text()); return; }
  const d = await r.json(); dSaved = clone(d.file); DF = clone(d.file); build(); msg('decals saved: Rebuild game sprites to see them in the game');
}

function swatches() {
  for (const k of ['a', 'b']) { const c = left.querySelector(`canvas[data-side="${k}"]`), s = sideCv[k]; if (c && s) { const g = c.getContext('2d'); g.clearRect(0, 0, 64, 64); g.drawImage(s, 0, 0, 64, 64); } }
  const f = left.querySelector('#g-flat'); if (f && mixed) f.getContext('2d').drawImage(mixed, 0, 0, 320, 160);
}

// ---------------- the preview: a block of 4 houses (lots 12 tiles square) inside sidewalks, 4 streets and the far sidewalks
const BLOCK = 24, WALK = 1, ROAD = 4;
const HOUSE_AT = [[6, 6], [18, 6], [6, 18], [18, 18]];
let housePics = [];
function draw() {
  const D = devicePixelRatio || 1, W = stage.clientWidth, H = stage.clientHeight; if (!W || !H) return;
  cv.width = Math.round(W * D); cv.height = Math.round(H * D);
  const g = cv.getContext('2d'), z = V.z, cx = BLOCK / 2, cy = BLOCK / 2;
  const ox = W / 2 - (cx - cy) * 32 * z, oy = H / 2 - (cx + cy) * 16 * z;
  g.setTransform(D, 0, 0, D, 0, 0); g.fillStyle = '#0d0f08'; g.fillRect(0, 0, W, H);
  if (!mixed) return;
  // the grass: a screen-space texture, one texture px = 1 / AUTHOR native px
  const gp = g.createPattern(mixed, 'repeat'); gp.setTransform(new DOMMatrix([z / AUTHOR, 0, 0, z / AUTHOR, 0, 0])); g.fillStyle = gp; g.fillRect(0, 0, W, H);
  // the map decals, as the game places and draws them (tile -> canvas px; half a canvas px per world px at z = 1)
  if (DF && decalArt) {
    const M = new DOMMatrix([32 * z * D, 16 * z * D, -32 * z * D, 16 * z * D, ox * D, oy * D]), Mi = M.inverse();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [px, py] of [[0, 0], [cv.width, 0], [0, cv.height], [cv.width, cv.height]]) { const q = Mi.transformPoint(new DOMPoint(px, py)); x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
    drawDecals(g, placeDecals([x0, y0, x1, y1], DF, () => true), decalArt, z / 2 * D, M);
    g.globalAlpha = 1; g.setTransform(D, 0, 0, D, 0, 0);
  }
  // tile space: (x, y) -> ((x - y) 32 z + ox, (x + y) 16 z + oy); the street bands are squares rings about the block
  g.save(); g.setTransform(32 * z * D, 16 * z * D, -32 * z * D, 16 * z * D, ox * D, oy * D);
  /** fills the square ring between `inner` and `outer` tiles out from the block with a tile-space photo (period tiles a repeat) or a colour */
  const lay = (pic, period, outer, inner, col) => {
    g.save(); g.beginPath(); g.rect(-outer, -outer, BLOCK + 2 * outer, BLOCK + 2 * outer); g.rect(-inner, -inner, BLOCK + 2 * inner, BLOCK + 2 * inner); g.clip('evenodd');
    if (pic) { const pt = g.createPattern(pic, 'repeat'); pt.setTransform(new DOMMatrix([period / pic.width, 0, 0, period / pic.width, 0, 0])); g.fillStyle = pt; } else g.fillStyle = col;
    g.fillRect(-outer, -outer, BLOCK + 2 * outer, BLOCK + 2 * outer); g.restore();
  };
  lay(asphaltPic, 12, WALK + ROAD, WALK, '#3a3d45');
  lay(concretePic, 6, WALK, 0, '#9a968c');
  lay(concretePic, 6, WALK + ROAD + WALK, WALK + ROAD, '#9a968c');
  // kerb lines
  g.lineWidth = 0.08; g.strokeStyle = 'rgba(40,40,40,0.6)';
  for (const r of [0, WALK, WALK + ROAD, WALK + ROAD + WALK]) g.strokeRect(-r, -r, BLOCK + 2 * r, BLOCK + 2 * r);
  g.restore();
  // the houses, back to front, each on its anchor at the game's scale
  housePics.forEach((h, i) => {
    if (!h?.im?.complete || !h.im.naturalWidth) return;
    const [x, y] = HOUSE_AT[i], s = h.s, q = s.quad, qw = q[2] - q[0], qh = q[3] - q[1], k = s.scale * z / 2;
    const ax = (s.ax ?? (q[0] + q[2]) / 2) - q[0], ay = (s.ay ?? q[3]) - q[1], sx = (x - y) * 32 * z + ox, sy = (x + y) * 16 * z + oy;
    g.drawImage(h.im, sx - ax * k, sy - ay * k, qw * k, qh * k);
  });
}
let asphaltPic = null, concretePic = null;
img('/tex/asphalt').then(p => { asphaltPic = p; draw(); }, () => {}); img('/tex/pad').then(p => { concretePic = p; draw(); }, () => {});
new ResizeObserver(() => draw()).observe(stage);

// ---------------- save
async function save() {
  if (!sideCv.a || !sideCv.b) return;
  saveB.disabled = true; msg('saving…');
  try {
    const b64 = async c => { const blob = await c.convertToBlob({ type: 'image/png' }); const s = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); }); return String(s).split(',')[1]; };
    const r = await fetch('/api/ground', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file: F, a: await b64(sideCv.a), b: await b64(sideCv.b) }) });
    if (!r.ok) { msg(await r.text()); return; }
    const d = await r.json(); saved = clone(d.file); F = clone(d.file); build(); msg('saved: Rebuild game sprites to see it in the game');
  } finally { saveB.disabled = false; }
}
async function unsave() {
  if (!confirm("Go back to the game's grass (the generated backyard + meadow, the original mix)? Your saved grass pictures are removed.")) return;
  const d = await fetch('/api/ground-unsave', { method: 'POST' }).then(r => r.json());
  saved = clone(d.file); F = clone(d.file); build(); rebuild(); msg("back to the game's grass: Rebuild game sprites to see it in the game");
}

// ---------------- start (when the tab is first shown)
let started = false;
async function start() {
  if (started) return; started = true;
  const d = await fetch('/api/ground').then(r => r.json());
  SOURCES = d.sources; RANGES = d.ranges; HOUSES = d.houses; saved = clone(d.file); F = clone(d.file); dSaved = clone(d.decals); DF = clone(d.decals);
  // the decal pictures: the nature patches and decals atlases, and the soil stamps the game makes from soil.webp
  Promise.all(['nature', 'decals', 'soil'].map(k => img('/decal-art/' + k))).then(([n, dc, so]) => {
    const toCv = im => { const c = canvas(im.naturalWidth, im.naturalHeight); ctx2d(c).drawImage(im, 0, 0); return c; };
    decalArt = { nature: toCv(n), decals: toCv(dc), soil: soilStamps(toCv(so)) }; build(); draw();
  }, e => msg(String(e.message || e)));
  // four different houses (the first four the game has)
  housePics = HOUSES.slice(0, 4).map(s => { const im = new Image(); im.onload = draw; im.src = '/thumb/' + encodeURIComponent(s.id); return { s, im }; });
  zoomChips(); build(); rebuild();
}
document.querySelector('.tab[data-v="ground"]').addEventListener('click', start);
if (location.hash === '#ground') document.querySelector('.tab[data-v="ground"]').click();
