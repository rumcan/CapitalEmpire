// The car paint audit sheet (T236, dev only: ?carpaint=audit). One car model's eight headings in every paint (car-paint.ts PAINTS, row 0 the
// art's own colour), or every view of the library's other vehicles (set=views), on car park asphalt, drawn by the game's own sprite program (gl.ts
// FS_SPRITE with its carPaint) from the game's own sprite packing (sprites.ts), so the sheet is what the game draws.
//   ?carpaint=audit&set=burgundy-wagon   the model (cars:<set>:<heading>) in the kept paints (car-paint.ts KEPT_PAINTS; &all=1 every paint of
//                                        T228's palette, kept or not: the audit's own rows)
//   set=vehicles   every vehicle of vehicles.ts (a row each, the rusty pickup last) at each of the eight headings it has a picture for, drawn as a
//                  car park draws its bay's car (bayFacing: the wagons' size, its ground centre on the bay's), on a bay's outline at the corner
//                  headings (the rusty pickup too, though it parks on farm and junk lots only)
//   set=views      every picture of the library's other vehicles, a row per model, for the record
//   &z=0.3 (the zoom)
// window.__carAudit: { ready, error?, rows, cols } for the capture script (scripts/dev/car-paint-audit.mjs).
import { ATLAS_PAGES, LIBRARY } from '../library';
import { GLRenderer, SPRITE_STRIDE } from '../gl';
import { webpSource } from '../atlas-gl';
import { neededLevel, type PageWant } from '../atlas-pages';
import { SpriteTiles } from '../sprites';
import { HH, HW, SPR_H, SPR_W } from '../iso';
import { CAR_DIRECTIONS, carModel, carOwnerScale } from '../ext/car-art';
import { CAR_PAINT, PAINT_NAMES, PAINTS, KEPT_PAINTS } from '../car-paint';
import { RUSTY_PICKUP, VEHICLES, bayFacing, bayFoot, isWagon } from '../vehicles';
import { BAY_D, BAY_W } from '../event/config';
import type { Prop } from '../types';

interface AuditState { ready: boolean; error?: string; rows: string[]; cols: string[] }
const W = window as unknown as { __carAudit: AuditState };
/** car park asphalt (the bays' ground, where a halo or a speckle shows) */
const GROUND: [number, number, number] = [58 / 255, 63 / 255, 76 / 255];
const tileX = (X: number, Y: number) => (X / HW + Y / HH) / 2, tileY = (X: number, Y: number) => (Y / HH - X / HW) / 2;

/** T236's verdicts (the sheets of 2026-10-28, both wagons at all eight headings at 30% and 15%): every paint is bad on at least one wagon. The
 *  burgundy wagon's sunlit edges are orange, outside its hue band: they stay orange (the right side's rim, the nose at E, the tail at W) under
 *  every paint but red and orange, and red and orange paint its chrome strips and hubcaps. The navy wagon's lit hood front and sills are grey:
 *  under every paint its hood is half painted at E and W, its sill a coloured line, its roof rack speckled */
const VERDICT: Record<string, readonly [string, string]> = {
  0: ['the art', 'the art'],
  1: ['bad: orange rim, nose, tail', 'bad: half hood, speckle'], 2: ['bad: orange rim, nose, tail', 'bad: half hood, speckle'],
  3: ['bad: orange rim and nose glow', 'bad: half hood at W'], 4: ['bad: orange rim, nose, tail', 'bad: half hood, speckle'],
  5: ['bad: red hubcaps, chrome', 'bad: half hood, sill line'], 6: ['bad: orange rim and nose', 'bad: garish, sill line'],
  7: ['bad: orange rim, chrome', 'bad: patchy hood, speckle'], 8: ['bad: orange rim and nose', 'bad: half hood, sill line'],
  9: ['bad: orange rim and nose', 'bad: half hood, sill line'], 10: ['bad: orange rim, nose, tail', 'bad: half hood, speckle'],
  11: ['bad: orange chrome, hubcaps', 'bad: half hood, sill line'],
};

let uid = 1;
/** a parked car prop of library item `item` at its owner size, its anchor at world px (X, Y), in paint `paint`; h: its heading, for a picture
 *  other than the wagons' drawn as a bay's car is (vehicles.ts bayFacing: its ground centre on (X, Y), the wagons' size, the body footprint) */
function carProp(item: number, X: number, Y: number, paint: number, h = -1): Prop {
  const it = LIBRARY[item]!; let x = tileX(X, Y), y = tileY(X, Y), k = carOwnerScale(it.id);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  if (h >= 0 && !isWagon(item)) { const f = bayFacing(it.id, h); [x0, y0, x1, y1] = bayFoot(f, x, y); x -= f.ox; y -= f.oy; k = f.size; }
  else for (const b of it.boxes) { x0 = Math.min(x0, x + (b.dx - b.hx) * k / 2); x1 = Math.max(x1, x + (b.dx + b.hx) * k / 2); y0 = Math.min(y0, y + (b.dy - b.hy) * k / 2); y1 = Math.max(y1, y + (b.dy + b.hy) * k / 2); }
  const p: Prop = { uid: uid++, item, x, y, flip: false, scale: k, x0, y0, x1, y1 };
  if (paint) p.paint = paint;
  return p;
}

export async function startCarPaintAudit(root: HTMLElement) {
  const q = new URLSearchParams(location.search), set = q.get('set') ?? 'burgundy-wagon', z = +(q.get('z') ?? 0.3), dpr = window.devicePixelRatio || 1;
  CAR_PAINT.on = true;
  W.__carAudit = { ready: false, rows: [], cols: [] };
  document.title = `Car paint audit: ${set} ${z}`;
  document.body.style.margin = '0'; document.body.style.background = '#222';
  const idx = (id: string) => LIBRARY.findIndex(i => i.id === id);
  // the grid: rows of cells, each cell a picture (item) in a paint
  const grid: { label: string; cells: { item: number; paint: number; label: string; h?: number }[] }[] = [];
  if (set === 'vehicles') {
    for (const v of [...VEHICLES, RUSTY_PICKUP]) grid.push({ label: `${v.name} (${v.views.filter(Boolean).length})`, cells: v.views.map((id, h) => ({ item: id ? idx(id) : -2, paint: 0, label: `${CAR_DIRECTIONS[h]} ${id ? id.replace(/^variation:|^view:/, '').slice(-26) : '-'}`, h })) });
  } else if (set === 'views') {
    // every picture of every vehicle but the two wagons, a row per model (ext/car-art carModel), the rusty pickup too
    const rows = new Map<string, string[]>();
    for (const it of LIBRARY) {
      if (it.id.startsWith('cars:') || /schoolbus/.test(it.id) || !(it.kind === 'car' || /scrap-pickup/.test(it.id))) continue;
      const m = /scrap-pickup/.test(it.id) ? 'expansion:scrap-pickup-rear' : carModel(it.id); let r = rows.get(m); if (!r) rows.set(m, r = []); r.push(it.id);
    }
    for (const [m, ids] of rows) grid.push({ label: m, cells: ids.map(id => ({ item: idx(id), paint: 0, label: id.replace(/^variation:|^view:/, '') })) });
  } else {
    const all = q.get('all') === '1', paints = all ? PAINTS.map((_, k) => k + 1) : [...KEPT_PAINTS];
    const v = set === 'burgundy-wagon' ? 0 : 1;
    for (const k of [0, ...paints]) grid.push({ label: `${k} ${k ? PAINT_NAMES[k - 1] : 'own'}${VERDICT[k] ? ` · ${VERDICT[k]![v]}` : ''}`, cells: CAR_DIRECTIONS.map(d => ({ item: idx(`cars:${set}:${d}`), paint: k, label: d })) });
  }
  if (grid.some(r => r.cells.some(c => c.item === -1))) { W.__carAudit.error = `missing art in set ${set}`; root.textContent = W.__carAudit.error; return; }
  const cellW = set === 'views' ? 330 : set === 'vehicles' ? 300 : 260, cellH = set === 'views' ? 380 : set === 'vehicles' ? 250 : 210, left = (set === 'vehicles' || set === 'views' ? 150 : 230) / z, top = 30 / z, cols = Math.max(...grid.map(r => r.cells.length));
  const Wworld = left + cols * cellW + 20, Hworld = top + grid.length * cellH + 10, wCss = Math.ceil(Wworld * z), hCss = Math.ceil(Hworld * z);
  W.__carAudit.rows = grid.map(r => r.label); W.__carAudit.cols = grid[0]?.cells.map(c => c.label) ?? [];
  const wrap = document.createElement('div'); wrap.style.cssText = `position:relative;width:${wCss}px;height:${hCss}px`;
  const cv = document.createElement('canvas'), lab = document.createElement('canvas');
  for (const c of [cv, lab]) { c.width = Math.round(wCss * dpr); c.height = Math.round(hCss * dpr); c.style.cssText = `position:absolute;left:0;top:0;width:${wCss}px;height:${hCss}px`; wrap.appendChild(c); }
  root.replaceChildren(wrap);

  // the props: each car centred in its cell (its anchor at the cell's centre, a little below the middle)
  const tiles = new SpriteTiles();
  grid.forEach((r, ri) => r.cells.forEach((c, ci) => { if (c.item >= 0) tiles.add(carProp(c.item, left + ci * cellW + cellW / 2, top + ri * cellH + cellH * 0.6, c.paint, c.h)); }));
  // the labels: the row's paint down the left, each cell's heading (or view) under it
  const l = lab.getContext('2d')!; l.scale(dpr, dpr); l.textBaseline = 'top';
  l.fillStyle = 'rgba(255,255,255,0.9)'; l.font = 'bold 12px sans-serif';
  l.fillText(set === 'views' ? 'every vehicle picture' : set === 'vehicles' ? `the vehicles by heading at ${Math.round(z * 100)}% (as a bay draws them; red: the bay's centre)` : `${set} at ${Math.round(z * 100)}%`, 6, 6);
  grid.forEach((r, ri) => {
    const y = (top + ri * cellH) * z;
    l.fillStyle = 'rgba(0,0,0,0.25)'; if (ri % 2) l.fillRect(0, y, wCss, cellH * z);
    l.fillStyle = 'rgba(255,255,255,0.9)'; l.font = '11px sans-serif'; l.fillText(r.label, 6, y + cellH * z / 2 - 6, left * z - 10);
    r.cells.forEach((c, ci) => { l.font = '9px sans-serif'; l.fillStyle = 'rgba(255,255,255,0.7)'; l.fillText(c.label, (left + ci * cellW) * z + 3, y + 3, cellW * z - 6); });
  });
  // set=vehicles: a bay's outline (BAY_W x BAY_D, as the car parks' lines) over each corner heading's car, and each car's anchor (red)
  if (set === 'vehicles') grid.forEach((r, ri) => r.cells.forEach((c, ci) => {
    const X = left + ci * cellW + cellW / 2, Y = top + ri * cellH + cellH * 0.6, x = tileX(X, Y), y = tileY(X, Y);
    if (c.h !== undefined && c.h % 2 === 0) {
      const along = c.h % 4 === 0, ex = along ? BAY_D / 2 : BAY_W / 2, ey = along ? BAY_W / 2 : BAY_D / 2;
      l.save(); l.setTransform(HW * z * dpr, HH * z * dpr, -HW * z * dpr, HH * z * dpr, 0, 0); l.strokeStyle = 'rgba(255,255,255,0.55)'; l.lineWidth = 1 / (HW * z);
      l.strokeRect(x - ex, y - ey, 2 * ex, 2 * ey); l.restore();
    }
    if (c.item >= 0) { l.fillStyle = '#e33'; l.fillRect(X * z - 1.5, Y * z - 1.5, 3, 3); }
  }));

  // the GL side: the game's renderer and its atlas (the WebP pages)
  const gl = new GLRenderer(cv);
  try { await gl.initAtlas(dpr, [webpSource(ATLAS_PAGES)]); } catch (e) { W.__carAudit.error = String(e); return; }
  const view = { X: Wworld / 2, Y: Hworld / 2, ze: z * dpr, cw: cv.width, ch: cv.height };
  const vis: { i: number; j: number }[] = [];
  for (let j = -1; j <= Math.floor(Hworld / SPR_H) + 1; j++) for (let i = -1; i <= Math.floor(Wworld / SPR_W) + 1; i++) vis.push({ i, j });
  const a = gl.atlas!, P = a.plan, need = neededLevel(z, dpr, P), G = P.grid;
  const t0ms = performance.now(); let settled = 0;
  const frame = () => {
    const f = tiles.frame(vis, []), at = gl.uploadParts([[f.stream, f.floats]]);
    const mark = new Map<number, number>();
    for (let o = 0; o < f.floats; o += SPRITE_STRIDE) {
      const st = f.stream, u0 = Math.min(st[o + 4]!, st[o + 6]!), u1 = Math.max(st[o + 4]!, st[o + 6]!), v0 = st[o + 5]!, v1 = st[o + 7]!, pg = st[o + 8]!;
      for (let gy = Math.max(0, Math.floor(v0 * G)); gy <= Math.min(G - 1, Math.floor(v1 * G)); gy++) for (let gx = Math.max(0, Math.floor(u0 * G)); gx <= Math.min(G - 1, Math.floor(u1 * G)); gx++) {
        const u = (pg * G + gy) * G + gx; mark.set(u, (mark.get(u) ?? 0) + 1);
      }
    }
    const wants: PageWant[] = need >= P.lowBase ? [] : [...mark].map(([unit, w]) => ({ unit, level: need, onScreen: true, weight: w }));
    a.want(wants); a.pump();
    gl.begin(view, GROUND);
    gl.drawSprites(at[0]!, f.floats / SPRITE_STRIDE, 0);
    const soft = wants.filter(w => a.pages.levelOf(w.unit) > need).length;
    settled = soft === 0 ? settled + 1 : 0;
    if (settled > 4 || performance.now() - t0ms > 25000) { W.__carAudit.ready = true; return; }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
