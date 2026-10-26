// The lot lab's palette strip (T155): the bottom of the screen, between the drawer and the inspector, with a search, the group chips (All, Plants,
// Props, Buildings, Vehicles, Decals, Ground), the category chips of the group (the library's categories, or the decal groups), and a strip of
// large thumbnails that scrolls sideways (the mouse wheel scrolls it too). It is data-driven: every library sprite the lab may place appears under
// its category and group (a new plant or prop added to the library shows up with no change here), every lot decal under its group, and the ground
// swatches under Ground. A click arms placing a sprite (the editor), placing a decal, or painting a ground (the lab). Collapsible.
import { LIBRARY } from '../library';
import type { LibItem } from '../types';
import { drawnAsStandIn } from '../newart';
import { LOT_DECALS, type LotDecal } from '../lot-decals';
import { thumb } from './lot-editor';
import { BTN, chip, el, type Shell } from './lot-lab-ui';

/** the palette's groups: the sprite groups, the decals and the ground paint */
export type PalGroup = 'all' | 'plants' | 'props' | 'buildings' | 'vehicles' | 'decals' | 'ground';
export const GROUPS: [PalGroup, string][] = [['all', 'All'], ['plants', 'Plants'], ['props', 'Props'], ['buildings', 'Buildings'], ['vehicles', 'Vehicles'], ['decals', 'Decals'], ['ground', 'Ground']];
/** the library categories the palette leaves out (the people) */
export const SKIP_CAT = new Set(['Townspeople', 'Spectators', 'Golfers']);
/** a sprite's group, from its kind and category (so new art lands in the right group by what it is) */
export function spriteGroup(it: Pick<LibItem, 'id' | 'kind' | 'cat' | 'big'>): 'plants' | 'props' | 'buildings' | 'vehicles' {
  if (it.kind === 'car' || it.cat === 'Vehicles' || it.id.startsWith('cars:')) return 'vehicles';
  if (it.kind === 'tree' || it.kind === 'bush' || it.kind === 'plant' || /tree|plant|vegetation|flower|hedge|shrub|bush|garden bed|grass/i.test(it.cat)) return 'plants';
  if (it.kind === 'building' || it.kind === 'house' || it.kind === 'venue' || it.kind === 'lot' || it.big) return 'buildings';
  return 'props';
}
/** whether the lab's palette offers a library sprite: not a turned view or an east copy, not a walker or one of the people, not an old building
 *  drawn as a stand-in */
export const placeable = (it: LibItem, i: number) => !it.id.startsWith('view:') && !it.id.startsWith('east:') && it.kind !== 'walker' && !SKIP_CAT.has(it.cat) && !drawnAsStandIn(i);
/** the sprites a group, category ('' every one) and search (id or name, any case) show, in library order */
export function paletteSprites(group: PalGroup, cat: string, q: string): LibItem[] {
  const s = q.trim().toLowerCase();
  return LIBRARY.filter((it, i) => placeable(it, i) && (group === 'all' || spriteGroup(it) === group) && (!cat || it.cat === cat) && (!s || it.id.toLowerCase().includes(s) || it.name.toLowerCase().includes(s)));
}
/** the categories of a sprite group (with how many sprites each), by name */
export function groupCats(group: PalGroup): [string, number][] {
  const m = new Map<string, number>();
  LIBRARY.forEach((it, i) => { if (placeable(it, i) && (group === 'all' || spriteGroup(it) === group)) m.set(it.cat, (m.get(it.cat) ?? 0) + 1); });
  return [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/** a ground swatch: a patch's kind and texture, its name and its colour on the tile */
export interface Swatch { name: string; kind: 'drive' | 'walk' | 'yard'; tex: string; col: string }
export const SWATCHES: Swatch[] = [{ name: 'Asphalt', kind: 'drive', tex: 'asphalt', col: '#3c4150' }, { name: 'Pavement', kind: 'walk', tex: 'paving', col: '#9a9184' }, { name: 'Concrete', kind: 'yard', tex: 'concrete', col: '#8a8782' }, { name: 'Slabs', kind: 'walk', tex: 'slabs', col: '#b5ab9a' }, { name: 'Gravel', kind: 'yard', tex: 'gravel', col: '#7a7468' }, { name: 'Dirt', kind: 'yard', tex: 'dirt', col: '#7b5a3a' }];
/** the decal groups, in the sheet's order */
const DECAL_GROUPS = [...new Set(LOT_DECALS.map(d => d.group))];

/** what the palette asks of the lab: arm a sprite, arm a decal, set the paint mode; what is armed now (to light it); a hover line */
export interface PaletteHost {
  sprite(id: string): void; decal(id: string): void; paint(sw: Swatch | 'erase' | null): void;
  armed(): { decal: string | null; paint: Swatch | 'erase' | null };
  decalThumb(t: HTMLElement, d: LotDecal, px: number): void;
  folded(v: boolean): void;
}
/** the palette (its state and draw): fills the shell's palette header and body */
export function makePalette(shell: Shell, host: PaletteHost) {
  let group: PalGroup = 'all', cat = '', search = '', shown = 160;
  const find = el('input', 'width:170px;flex:none;box-sizing:border-box;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:4px 8px;font:inherit');
  find.placeholder = 'search the palette'; find.title = 'search the sprites (id or name) and the decals (id)';
  find.addEventListener('input', () => { search = find.value; shown = 160; draw(); });
  const groups = el('div', 'display:flex;gap:4px;flex:none'), cats = el('div', 'display:flex;gap:4px;overflow-x:auto;flex:1;min-width:0;scrollbar-width:thin;padding-bottom:2px');
  const hover = el('div', 'flex:none;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:11px ui-monospace,Consolas,monospace;opacity:.75');
  const foldB = el('button', `cursor:pointer;font:inherit;border-radius:6px;padding:2px 9px;flex:none;${BTN}`);
  foldB.addEventListener('click', () => host.folded(!shell.folds.palette));
  const strip = el('div', 'display:grid;grid-auto-flow:column;gap:6px;overflow-x:auto;overflow-y:hidden;padding-bottom:4px;scrollbar-width:thin');
  strip.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { strip.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  shell.palHead.append(el('div', 'font-weight:800;color:#7dd3fc;font-size:12px;letter-spacing:.08em;flex:none', 'PALETTE'), find, groups, cats, hover, foldB);
  shell.palBody.append(strip);
  /** a tile of the strip: px square, its title, lit when armed; the click */
  const tile = (title: string, lit: boolean, click: () => void, over = title) => {
    const px = shell.thumb, t = el('div', `width:${px}px;height:${px}px;box-sizing:border-box;border:${lit ? '2px solid #38bdf8' : '1px solid #334155'};border-radius:7px;background-color:#0f172a;background-repeat:no-repeat;background-position:center;cursor:pointer;position:relative;overflow:hidden`);
    t.title = title; t.addEventListener('click', click); t.addEventListener('mouseenter', () => { hover.textContent = over; });
    return t;
  };
  function drawChips() {
    groups.replaceChildren(...GROUPS.map(([g, name]) => chip(name, g === group, () => { group = g; cat = ''; shown = 160; draw(); }, g === 'decals' ? 'flat ground decals (leaves, litter, stains)' : g === 'ground' ? 'paint asphalt, pavement and more on the lot' : `the library's ${name.toLowerCase()}`)));
    const list: [string, number][] = group === 'decals' ? DECAL_GROUPS.map(g => [g, LOT_DECALS.filter(d => d.group === g).length]) : group === 'ground' ? [] : groupCats(group);
    cats.replaceChildren(...(list.length ? [chip('every category', cat === '', () => { cat = ''; shown = 160; draw(); })] : []), ...list.map(([c, n]) => chip(`${c} ${n}`, c === cat, () => { cat = c; shown = 160; draw(); })));
  }
  /** draws the chips and the strip for the group, category and search */
  function draw() {
    drawChips();
    foldB.textContent = shell.folds.palette ? '▴ show' : '▾ hide'; foldB.title = shell.folds.palette ? 'show the palette' : 'fold the palette away';
    const px = shell.thumb, a = host.armed(), q = search.trim().toLowerCase();
    strip.style.gridTemplateRows = `repeat(${Math.max(1, Math.round((parseFloat(shell.palette.style.height) - 60) / (px + 6)))}, ${px}px)`;
    strip.style.gridAutoColumns = `${px}px`;
    const out: HTMLElement[] = [];
    if (group === 'ground') {
      for (const sw of SWATCHES) { const t = tile(`${sw.name}: drag on the lot to paint a rectangle (${sw.kind} · ${sw.tex})`, a.paint === sw, () => host.paint(a.paint === sw ? null : sw), `${sw.name} · ${sw.tex}`); t.style.background = sw.col; t.append(el('span', 'position:absolute;left:0;right:0;bottom:0;background:rgba(0,0,0,.55);font-size:10px;text-align:center', sw.name)); out.push(t); }
      const er = tile('Erase: click a painted patch to remove it', a.paint === 'erase', () => host.paint(a.paint === 'erase' ? null : 'erase'), 'Erase'); er.append(el('span', 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px', '⌫ Erase')); out.push(er);
      const off = tile('paint off (Esc)', a.paint === null, () => host.paint(null), 'Off'); off.append(el('span', 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px', 'Off')); out.push(off);
    } else if (group === 'decals') {
      for (const d of LOT_DECALS) {
        if ((cat && d.group !== cat) || (q && !d.id.toLowerCase().includes(q))) continue;
        const t = tile(`${d.id} (${d.group}): click, then press on the lot`, a.decal === d.id, () => host.decal(d.id), d.id); host.decalThumb(t, d, px - 2); out.push(t);
      }
    } else {
      const all = paletteSprites(group, cat, search);
      for (const it of all.slice(0, shown)) {
        const t = tile(`${it.name}\n${it.id}\n${it.cat}: click, then click on the lot`, false, () => host.sprite(it.id), `${it.name} · ${it.id}`), pic = el('div', 'position:absolute;background-repeat:no-repeat');
        // the picture centred across the tile and standing on its bottom
        const s = thumb(pic, it.id, px - 8); Object.assign(pic.style, { width: `${s.w}px`, height: `${s.h}px`, left: `${(px - 2 - s.w) / 2}px`, top: `${px - 5 - s.h}px` });
        t.append(pic); out.push(t);
      }
      if (all.length > shown) { const m = tile(`${all.length - shown} more`, false, () => { shown += 160; draw(); }); m.append(el('span', 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;text-align:center', `More\n${all.length - shown}`)); out.push(m); }
      if (!all.length) out.push(el('div', 'opacity:.7;padding:8px;white-space:nowrap', 'nothing matches'));
    }
    strip.replaceChildren(...out);
  }
  return { draw, focus: () => find.focus() };
}
