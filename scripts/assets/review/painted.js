// The Painted tab of the sprite studio: which hand-painted family each surface of the game wears (src/game/painted-surfaces.ts, the file
// src/game/painted-surfaces.json). On the left every surface by its plain name (the golf surfaces, the map, the town's lawns, the living
// ground, the course walls, and every texture preset, which follows its golf surface unless it is given a look of its own); on the right the
// picked surface's look: a family (each card shows its three zoom levels: near 40 m, mid 320 m, far 4096 m a tile), the version, the scale,
// the tint and the tone, previewed as the game lays it. Save writes the file; a game on a vite dev server from this checkout takes it at once
// (no rebuild, no reload). Served by server.mjs.
import { FAMILIES, LEVEL_NAMES, familyVersions, lookColour, resolveFamily, newLook, surfaceKinds, TILED_FAMILIES, TILE_BANDS, ANCHORS, TILES, tilePermutation, tileIndex, tileMetres } from '/painted-lib.js';

const el = (t, a = {}, ...k) => { const e = document.createElement(t); Object.assign(e, a); for (const c of k) if (c != null) e.append(c); return e; };
const btn = (t, fn, c = '') => el('button', { className: 'btn ' + c, textContent: t, onclick: fn });
const hint = t => el('div', { className: 'hint', textContent: t });
const clone = o => JSON.parse(JSON.stringify(o));
const post = (u, b) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b || {}) }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json(); });
const art = (file, px) => `/painted-art?f=${encodeURIComponent(file)}${px ? `&px=${px}` : ''}`;
const KIND_NAME = { grass: 'Grass', sand: 'Sand', water: 'Water', cut: 'Cut faces and soil' };

let D = null, F = null, saved = '', sel = 'surf:green';
const root = document.getElementById('v-painted');
const list = el('div', { className: 'list', style: 'width:300px;overflow:auto' });
const side = el('div', { style: 'flex:1;overflow:auto;padding:12px 16px;min-width:0' });
const msgEl = el('span', { className: 'hint' });
const saveB = btn('Save', save, 'gold'), undoB = btn('Undo changes', () => { F = JSON.parse(saved); draw(); });
root.append(el('div', { style: 'display:flex;flex-direction:column;height:calc(100vh - 70px)' },
  el('div', { className: 'bar' }, saveB, undoB, el('span', { className: 'hint', textContent: 'Pick a surface, then its family, version, scale, tint and tone. Save: a dev game from this checkout takes it at once (no rebuild).' }), el('span', { style: 'flex:1' }), msgEl),
  el('div', { style: 'display:flex;flex:1;min-height:0' }, list, side)));
const msg = t => { msgEl.textContent = t; const dirty = F && JSON.stringify(F) !== saved; saveB.textContent = dirty ? 'Save (not saved)' : 'Save'; saveB.style.outline = dirty ? '2px solid #fff6' : ''; };
window.addEventListener('beforeunload', e => { if (F && JSON.stringify(F) !== saved) { e.preventDefault(); e.returnValue = ''; } });

async function load() {
  D = await (await fetch('/api/painted')).json();
  F = clone(D.file); saved = JSON.stringify(F); draw(); msg('');
}
async function save() {
  try { const r = await post('/api/painted', { file: F }); F = r.file; saved = JSON.stringify(F); draw(); msg('Saved src/game/painted-surfaces.json: a dev game from this checkout re-bakes its ground with it now.'); }
  catch (e) { msg('Not saved: ' + e.message); }
}

/** the look of a selection, whether it is the surface's own (presets may follow their golf surface), and its label */
function lookOf(key) {
  if (key.startsWith('surf:')) { const k = key.slice(5); return { look: F.surfaces[k] ?? null, own: true, name: D.surfaces.find(s => s.key === k)?.name ?? k, kinds: surfaceKinds(k) }; }
  if (key.startsWith('lawn:')) { const i = +key.slice(5); return { look: F.lawns[i] ?? null, own: true, name: `Town lawn ${i + 1}`, kinds: ['grass'], lawn: i }; }
  const id = key.slice(7), p = D.presets.find(q => q.id === id), sk = p?.surface ?? (id === 'fescue' ? 'fescue' : null);
  const follow = sk && F.surfaces[sk] ? sk : null;
  return { look: F.presets[id] ?? (follow ? F.surfaces[follow] : null), own: !!F.presets[id], follow, name: `Preset: ${p?.name ?? id}`, kinds: ['grass', 'sand', 'cut'], preset: id };
}
function setLook(key, look) {
  if (key.startsWith('surf:')) { if (look) F.surfaces[key.slice(5)] = look; else delete F.surfaces[key.slice(5)]; }
  else if (key.startsWith('lawn:')) { const i = +key.slice(5); if (look) F.lawns[i] = { weight: F.lawns[i]?.weight ?? 1, ...look }; else F.lawns.splice(i, 1); }
  else { const id = key.slice(7); if (look) F.presets[id] = look; else delete F.presets[id]; }
}
const swatchOf = look => { const r = look && resolveFamily(look); return r ? lookColour(r.near.mean, look) : '#555'; };

function draw() {
  // ---- the surfaces, by group
  list.innerHTML = '';
  const item = (key, label, look, note) => {
    const d = el('div', { className: 'li' + (key === sel ? ' on' : ''), style: 'display:flex;gap:8px;align-items:center' },
      el('span', { style: `width:16px;height:16px;border-radius:3px;flex:0 0 auto;background:${look ? swatchOf(look) : 'repeating-linear-gradient(45deg,#444,#444 3px,#666 3px,#666 6px)'}` }),
      el('span', { style: 'flex:1' }, label, note ? el('small', { textContent: ' ' + note }) : null));
    d.onclick = () => { sel = key; draw(); }; list.append(d);
  };
  const head = t => list.append(el('div', { className: 'li', style: 'cursor:default;color:var(--gold);font-weight:700;background:#1a1d12', textContent: t }));
  for (const g of [...new Set(D.surfaces.map(s => s.group))]) {
    head(g);
    for (const s of D.surfaces.filter(x => x.group === g)) { const l = F.surfaces[s.key]; item('surf:' + s.key, s.name, l, l ? familyLabel(l) : 'photo'); }
  }
  head(`Town lawns (one per lot and road block)`);
  F.lawns.forEach((l, i) => item('lawn:' + i, `Lawn ${i + 1}`, l, `${familyLabel(l)} · weight ${l.weight}`));
  if (F.lawns.length < D.lawnSlots) { const add = el('div', { className: 'li', textContent: '+ Add a lawn' }); add.onclick = () => { F.lawns.push({ ...newLook('grass'), weight: 1 }); sel = 'lawn:' + (F.lawns.length - 1); draw(); msg(''); }; list.append(add); }
  head('Texture presets (the Paint tool)');
  for (const p of D.presets) { const o = lookOf('preset:' + p.id); item('preset:' + p.id, p.name, o.look, o.own ? familyLabel(o.look) : o.follow ? `follows ${D.surfaces.find(s => s.key === o.follow)?.name.split(' (')[0]}` : 'photo'); }
  editor();
}
const familyLabel = l => { const f = FAMILIES.find(x => x.id === l.family); return f ? `${f.name}${f.tiled ? (f.provisional ? ' (tile set, provisional)' : ' (tile set)') : ''}${l.version ? ' ' + l.version : ''}${l.scale !== 1 ? ` ×${l.scale}` : ''}` : l.family; };
/** a tile set family's sets (T145): its revisions, near to far */
const tiledSets = f => LEVEL_NAMES.map(l => f.pick[l]).join(', ');

function editor() {
  side.innerHTML = '';
  const o = lookOf(sel), look = o.look;
  side.append(el('h3', { style: 'margin:4px 0 6px', textContent: o.name }));
  if (o.preset) {
    const cb = el('input', { type: 'checkbox', checked: o.own, style: 'min-width:0;margin-right:6px' });
    cb.onchange = () => { setLook(sel, cb.checked ? clone(o.look ?? newLook('grass')) : null); draw(); msg(''); };
    side.append(el('label', { className: 'hint', style: 'display:flex;align-items:center' }, cb, o.follow ? `Its own look (else it follows ${D.surfaces.find(s => s.key === o.follow)?.name}: the course and this preset match)` : 'Its own look (else its photo)'));
    if (!o.own) { if (look) preview(look, false); return; }
  }
  if (!look) {
    side.append(hint('No painted look: the game lays its photo texture here.'), btn('Give it a painted look', () => { setLook(sel, newLook(o.kinds[0])); draw(); msg(''); }, 'gold'));
    return;
  }
  const change = c => { setLook(sel, { ...look, ...c }); draw(); msg(''); };
  // ---- the family picker: the kinds that fit this surface first, each family with its three zoom levels
  const fits = FAMILIES.filter(f => o.kinds.includes(f.kind)), rest = FAMILIES.filter(f => !o.kinds.includes(f.kind));
  const cards = fams => el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 10px' }, ...fams.map(f => {
    const r = resolveFamily({ family: f.id, version: f.id === look.family ? look.version : null, scale: 1 });
    const c = el('div', { className: 'card', style: `min-width:0;width:236px;cursor:pointer;${f.id === look.family ? 'border-color:var(--gold);box-shadow:0 0 0 1px var(--gold)' : ''}`, title: `${f.name}: ${LEVEL_NAMES.map(l => `${l} ${r[l].version} (${Math.round(f.coverage[l])} m)`).join(', ')}` },
      el('div', { style: 'display:flex;gap:2px;background:#0d0f08' }, ...LEVEL_NAMES.map(l => el('div', { style: 'position:relative' }, el('img', { src: art(r[l].file, 96), width: 76, height: 76, style: 'display:block' }), el('span', { style: 'position:absolute;left:2px;bottom:1px;font-size:10px;color:#fff;text-shadow:0 0 2px #000', textContent: `${l} ${Math.round(f.coverage[l])} m` })))),
      el('div', { className: 'meta', style: 'padding:4px 8px' }, el('div', { className: 'name', textContent: f.name }), el('div', { className: 'cat', textContent: `${KIND_NAME[f.kind] ?? f.kind}${f.legacy ? ' · first draft' : ''} · ${f.tiled ? (f.provisional ? 'PROVISIONAL tile sets ' : 'hand-painted tile sets ') + tiledSets(f) : familyVersions(f).join(', ')}` })));
    c.onclick = () => change({ family: f.id, version: null });
    return c;
  }));
  side.append(el('div', { className: 'hint', textContent: 'Family (each card: the near, mid and far paintings and the ground one tile covers)' }), cards(fits));
  if (rest.length) { const d = el('details', {}, el('summary', { className: 'hint', style: 'cursor:pointer', textContent: `Other families (${rest.length})` }), cards(rest)); side.append(d); }
  // ---- a hand-painted tile set (T145): laid as authored, nothing to set; its three sets of four whole tiles shown as the game butts them
  const f = FAMILIES.find(x => x.id === look.family);
  if (f.tiled) { tiledPreview(f); return; }
  // ---- version
  const vs = familyVersions(f);
  side.append(el('div', { className: 'hint', textContent: 'Version (a level without it keeps its pick)' }), el('div', { className: 'chips', style: 'margin-bottom:8px' },
    ...[null, ...vs].map(v => { const c = el('span', { className: 'chip' + (look.version === v ? ' on' : ''), textContent: v ? `${v}: ${LEVEL_NAMES.filter(l => f.levels[l][v]).join(', ')}` : `Auto (${LEVEL_NAMES.map(l => `${l} ${f.pick[l] ?? '-'}`).join(', ')})` }); c.onclick = () => change({ version: v }); return c; })));
  // ---- scale, tint, tone (and a lawn's weight)
  const slider = (label, key, lo, hi, step, fmt) => {
    const out = el('span', { className: 'scale', textContent: fmt(look[key]) }), r = el('input', { type: 'range', min: lo, max: hi, step, value: look[key], style: 'min-width:0;flex:1' });
    r.oninput = () => { out.textContent = fmt(+r.value); }; r.onchange = () => change({ [key]: +r.value });
    return el('div', { className: 'prow', style: 'max-width:640px' }, el('span', { style: 'width:70px', textContent: label }), r, out);
  };
  const r0 = resolveFamily(look);
  side.append(slider('Scale', 'scale', D.ranges.scale[0], D.ranges.scale[1], 0.01, v => `×${(+v).toFixed(2)}`),
    hint(`One tile covers: near ${+(f.coverage.near * look.scale).toFixed(1)} m, mid ${Math.round(f.coverage.mid * look.scale)} m, far ${Math.round(f.coverage.far * look.scale)} m. Smaller is finer.`));
  const tint = el('input', { type: 'color', value: look.tint, style: 'min-width:0;width:60px;padding:0;height:28px' }); tint.onchange = () => change({ tint: tint.value });
  side.append(el('div', { className: 'prow' }, el('span', { style: 'width:70px', textContent: 'Tint' }), tint, btn('None', () => change({ tint: '#ffffff' })), el('span', { className: 'hint', textContent: 'multiplied over the painting (white leaves it)' })));
  side.append(slider('Tone', 'tone', D.ranges.tone[0], D.ranges.tone[1], 0.01, v => (v > 0 ? '+' : '') + Math.round(v * 100) + '%'));
  if (o.lawn !== undefined) {
    side.append(slider('Weight', 'weight', 0, 10, 0.1, v => (+v).toFixed(1)), hint('How often this lawn is picked among the lawns (0: never).'));
    side.append(btn('Remove this lawn', () => { setLook(sel, null); sel = 'lawn:0'; draw(); msg(''); }, 'red'));
  }
  preview(look, true);
  if (r0) side.append(hint(`Mean colour as laid: ${lookColour(r0.near.mean, look)}`));
}

/** a tile set family (T145, src/game/painted-tiles.ts): each band's set of four whole tiles, two by two as the game's placement butts them
 *  (its seeded permutation, cells 0..1), at their native aspect and light, never squashed, turned, mirrored, tinted or blended; and the world
 *  one world size a tile takes (T150: its native pixels at the band's anchor zoom, on a DPR 1 screen) */
async function tiledPreview(f) {
  const t = TILED_FAMILIES.find(x => x.id === f.id); if (!t) return;
  if (t.owner) side.append(el('div', { className: 'hint', style: 'color:var(--gold);font-weight:600', textContent: `PROVISIONAL (T162): the owner's own paintings (${t.owner}), one a level, shipped as they were supplied except their outer edges, healed once in the asset step (scripts/assets/tile-heal.mjs) so each tiles with itself; one tile a level repeats (accepted for now).` }));
  else if (t.provisional) side.append(el('div', { className: 'hint', style: 'color:var(--gold);font-weight:600', textContent: `PROVISIONAL (T153): the art session's newest raw tiles, shipped before its handoff (no canonical selection or visual decision yet; seams not repaired). Re-running scripts/assets/prep-painted-tiles.mjs once READY-MATERIALS lists ${t.materialId} switches it to the accepted selection.` }));
  side.append(hint(`A hand-painted tile set (${t.materialId}, ${t.provisional ? 'provisional tiles' : 'selection'} ${t.revision}): three independently authored sets, ${t.levels.near.tiles.length === 1 ? 'one whole tile' : `${t.levels.near.tiles.length} whole tiles`} each, laid exactly as authored. No version, scale, tint or tone: the camera picks the set; each set has one world size, drawn at its native pixels at its anchor zoom and smaller as the camera zooms out, never larger.`));
  const box = el('div', { style: 'display:flex;flex-direction:column;gap:12px;margin-top:10px' }); side.append(box);
  for (const band of LEVEL_NAMES) {
    const lv = t.levels[band], perm = tilePermutation(t.id, band, lv.tiles.length), k = 0.2, w = Math.round(lv.native[0] * k), h = Math.round(lv.native[1] * k);
    const c = el('canvas', { width: 2 * w, height: 2 * h, style: 'display:block;max-width:100%' }), g = c.getContext('2d');
    box.append(el('div', {}, el('div', { className: 'hint', textContent: `${band}: ${lv.revision} · ${lv.native.join(' x ')} px · tiles ${lv.tiles.map(x => x.id).join(', ')} · one tile ${Math.round(tileMetres(lv, TILE_BANDS.indexOf(band)))} m wide (native at zoom ${(ANCHORS[band] * 100).toFixed(2)}% on a DPR 1 screen)${lv.status ? ` · ${lv.status}` : ''}` }), c));
    for (let iy = 0; iy < 2; iy++) for (let ix = 0; ix < 2; ix++) {
      const img = await pic(lv.tiles[tileIndex(perm, ix, iy)].file); if (img) g.drawImage(img, ix * w, iy * h, w, h);
    }
  }
}

/** the look laid as the game does (tinted and toned): the near painting on the ground at the closest zoom (an iso diamond, 21 px a metre), and
 *  each level over the ground its tile covers at scale 1 (so a smaller scale shows more repeats) */
const pics = new Map();
const pic = file => { let p = pics.get(file); if (!p) { p = new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = art(file); }); pics.set(file, p); } return p; };
async function preview(look, big) {
  const r = resolveFamily(look); if (!r) return;
  const box = el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;margin-top:10px' }); side.append(box);
  const toned = (img, w, h, draw) => {
    const c = el('canvas', { width: w, height: h }), g = c.getContext('2d');
    draw(g);
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (look.tint !== '#ffffff') { g.globalCompositeOperation = 'multiply'; g.fillStyle = look.tint; g.fillRect(0, 0, w, h); }
    if (look.tone < 0) { const v = Math.round(255 * (1 + look.tone)); g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, 0, w, h); }
    else if (look.tone > 0) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = look.tone; g.drawImage(c, 0, 0); }
    return c;
  };
  if (big) {
    const img = await pic(r.near.file); if (!img) return;
    // the closest zoom: 21.5 px a metre along a tile edge, the ground squashed 2:1 (a tile edge is 64 x 32 px a 2 m tile at zoom 1, x0.6)
    const W = 640, H = 320, ppm = img.width / r.near.metres, k = 21.5 / ppm;
    const c = toned(img, W, H, g => { const p = g.createPattern(img, 'repeat'); g.setTransform(1, 0, 0, 1, W / 2, H / 2); g.scale(1, 0.5); g.rotate(Math.PI / 4); g.scale(k, k); g.fillStyle = p; g.fillRect(-4000, -4000, 8000, 8000); });
    box.append(el('div', {}, el('div', { className: 'hint', textContent: 'On the ground at the closest zoom (30%), near level (one painting a tile: in the game the tiles are laid in soft shifted patches, so no repeat shows)' }), c));
  }
  for (const l of LEVEL_NAMES) {
    const img = await pic(r[l].file); if (!img) continue;
    const S = 150, f = FAMILIES.find(x => x.id === look.family), span = f.coverage[l], n = span / r[l].metres;
    const c = toned(img, S, S, g => { const p = g.createPattern(img, 'repeat'); g.scale(S / (img.width * n), S / (img.width * n)); g.fillStyle = p; g.fillRect(0, 0, img.width * n, img.width * n); });
    box.append(el('div', {}, el('div', { className: 'hint', textContent: `${l}: ${Math.round(span)} m across (${r[l].version})` }), c));
  }
}

document.querySelector('.tab[data-v="painted"]').addEventListener('click', () => { if (!D) load(); });
