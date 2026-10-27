// The shadow audit sheet (T141, dev only: ?shadows=audit). Every library sprite that casts a shadow (shadow-audit-items.ts), on a plain ground
// grid, labelled with its id, each drawn three times: both shadows, the contact shadow alone, the cast shadow alone (the three strips of a row).
// Drawn by the game's own GL programs (gl.ts) from the game's own sprite packing (sprites.ts), so the sheet is what the game draws.
//   ?shadows=audit&cat=trees&page=0   the category (AUDIT_CATS) and the page of it
//   &z=0.3 (the zoom), &w=1600 (the sheet's width, CSS px), &per=40 (items a page at most), &h=3600 (a page's height at most, device px)
//   &measure=1   also measure every picture's opaque base (atlas mip 0 alpha), for the review: window.__shadowAudit.measure
// window.__shadowAudit: { ready, pages, page, items: the page's entries with their shapes, measure } for the capture script
// (scripts/dev/shadow-audit.mjs).
import { ATLAS_PAGES, LIBRARY } from '../library';
import { GLRenderer, SHADOW_STRIDE, SPRITE_STRIDE, VECTOR_STRIDE } from '../gl';
import { webpSource } from '../atlas-gl';
import { neededLevel, type PageWant } from '../atlas-pages';
import { SpriteTiles, spriteRect, VECTOR, vecOf } from '../sprites';
import { VECTOR_SHADOWS, vectorMesh } from '../shadow-vector';
import { HH, HW, SPR_H, SPR_W, worldX, worldY } from '../iso';
import { CAST, castShear } from '../cast-shadow';
import * as SHAPE from '../shadow-shape';
import { CAR_SCALE } from '../ext/car-art';
import { lookOf } from '../newart';
import type { Prop } from '../types';
import { AUDIT_CATS, auditEntries, type AuditCat, type AuditEntry } from './shadow-audit-items';

const MODES = ['both', 'contact', 'cast'] as const;
/** the strips drawn: all three, or (&strips=both, T142's review sheets) the first alone */
let NS = 3;
/** engine.ts shadowStrength's default */
const CONTACT_STRENGTH = 1.1;
const GROUND: [number, number, number] = [150 / 255, 170 / 255, 118 / 255];
interface AuditState { ready: boolean; pages: number; page: number; cat: string; items: unknown[]; measure?: unknown[]; soft?: number; error?: string }
const W = window as unknown as { __shadowAudit: AuditState };

/** the lean uniform drawShadows takes (engine.ts draw: shadow-shape.ts contactLean) */
// (the old shadow-shape.ts, before T141, has none of contactLean, contactShadow, leanShift, kindOf, castsShadow: the page draws it too, for the
// before sheets)
const NEW = SHAPE as unknown as Partial<typeof SHAPE>;
function leanOf(): [number, number] {
  if (NEW.contactLean) { const l = NEW.contactLean(CAST); return [l.x, l.y]; }
  const lean = CAST.on ? 6 * CAST.length : 0, a = CAST.angle * Math.PI / 180; return [lean * Math.cos(a), lean * Math.sin(a)];
}
/** the contact shadow the game gives a drawable (sprites.ts packShadow's call), for the labels and the review: its shape, its centre about
 *  the anchor (tiles) and its lean (world px) */
function shapeOf(p: Prop) {
  const l = lookOf(p), it = LIBRARY[l.item]!, f = it.kind === 'car' ? CAR_SCALE : 1, cx = (p.x0 + p.x1) / 2, cy = (p.y0 + p.y1) / 2, hw = (p.x1 - p.x0) * f / 2, hh = (p.y1 - p.y0) * f / 2;
  if (l.hidden) return null;
  if (!NEW.contactShadow || !NEW.leanShift || !NEW.kindOf || !NEW.castsShadow) {
    const o = SHAPE.shadowShape(LIBRARY[p.item]!, hw * 2, hh * 2, p.scale), [lx, ly] = leanOf(); if (!o) return null;
    return { ...o, cx: o.atAnchor ? 0 : cx - p.x, cy: o.atAnchor ? 0 : cy - p.y, lean: 1, shift: [lx * (o.hx + o.hy), ly * (o.hx + o.hy)], kind: LIBRARY[p.item]!.kind, cast: true };
  }
  const s = NEW.contactShadow(it, { x: l.x ?? p.x, y: l.y ?? p.y, x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh, scale: l.scale }, spriteRect(p));
  if (!s) return null;
  const [lx, ly] = leanOf(), sh = NEW.leanShift(s, { x: lx, y: ly });
  return { ...s, cx: s.x - p.x, cy: s.y - p.y, shift: [sh.x, sh.y], kind: NEW.kindOf(it), cast: NEW.castsShadow(it) };
}
let uid = 1;
/** a prop of an entry with its anchor at tile (x, y) */
function propOf(e: AuditEntry, x: number, y: number): Prop {
  const it = LIBRARY[e.item]!;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  if (e.foot) [x0, y0, x1, y1] = [x + e.foot[0], y + e.foot[1], x + e.foot[2], y + e.foot[3]];
  else for (const b of it.boxes) {
    const k = e.scale, hx = (e.flip ? b.hy : b.hx) * k / 2, hy = (e.flip ? b.hx : b.hy) * k / 2, dx = (e.flip ? b.dy : b.dx) * k / 2, dy = (e.flip ? b.dx : b.dy) * k / 2;
    x0 = Math.min(x0, x + dx - hx); x1 = Math.max(x1, x + dx + hx); y0 = Math.min(y0, y + dy - hy); y1 = Math.max(y1, y + dy + hy);
  }
  if (!Number.isFinite(x0)) { x0 = x - 0.25; y0 = y - 0.25; x1 = x + 0.25; y1 = y + 0.25; }
  return { uid: uid++, item: e.item, x, y, flip: e.flip, scale: e.scale, x0, y0, x1, y1 };
}
/** an entry's extents about its anchor's world point (world px): the picture, its cast shadow and its contact shadow */
function extentsOf(e: AuditEntry) {
  const p = propOf(e, 0, 0), r = spriteRect(p), sh = castShear(CAST), H = Math.max(0, -r[1]);
  const fy = Math.max(worldY(p.x1, p.y1), 0);
  let L = Math.min(r[0], r[0] + H * sh.sx), R = Math.max(r[2], r[2] + H * sh.sx), T = r[1], B = Math.max(r[3], fy + H * sh.sy);
  const corners = [[p.x0, p.y0], [p.x1, p.y0], [p.x1, p.y1], [p.x0, p.y1]] as const;
  for (const [x, y] of corners) { L = Math.min(L, worldX(x, y)); R = Math.max(R, worldX(x, y)); T = Math.min(T, worldY(x, y)); B = Math.max(B, worldY(x, y)); }
  // the drawn shapes' reach (T142; whether drawn or not, so the sheets before and after share one layout)
  const it = LIBRARY[lookOf(p).item]!, vs = VECTOR_SHADOWS[it.id], v = vs?.same ? VECTOR_SHADOWS[vs.same] : vs, k = e.scale, m = e.flip ? -1 : 1;
  for (const ring of v?.s ?? []) for (let i = 0; i + 2 < ring.length; i += 3) {
    const x = (m * ring[i]! + ring[i + 2]! * sh.sx) * k, y = (ring[i + 1]! + ring[i + 2]! * sh.sy) * k;
    L = Math.min(L, x - 8); R = Math.max(R, x + 8); B = Math.max(B, y + 8);
  }
  // the contact shadow lies within the footprint and the picture's width, give or take its feather and lean: a margin (the same layout before
  // and after a change to the shadows)
  L -= 40; R += 24; B += 24;
  return { L: L - 14, T: T - 10, R: R + 14, B: B + 12 };
}

interface Cell { e: AuditEntry; L: number; T: number; R: number; B: number; x: number; w: number }
interface Row { cells: Cell[]; y: number; strip: number; h: number }
interface Page { rows: Row[]; h: number; n: number }
/** lay a category's entries out in rows of cells, each row three strips (both, contact, cast) and a label band; pages of at most `per` entries
 *  and maxH world px */
function layout(entries: AuditEntry[], width: number, z: number, per: number, maxH: number): Page[] {
  const left = 26 / z, minW = 118 / z, gap = 6 / z, label = 40 / z, pages: Page[] = [];
  let page: Page = { rows: [], h: 8 / z, n: 0 }, row: Row | null = null, x = left;
  const closeRow = () => { if (!row) return; row.h = row.strip * NS + label + gap; page.h += row.h; row = null; };
  for (const e of entries) {
    const ex = extentsOf(e), w = Math.max(minW, ex.R - ex.L), h = ex.B - ex.T;
    if (row && (x + w > width || page.n >= per)) closeRow();
    if (!row) {
      if (page.n >= per || (page.rows.length && page.h + h * 3 + label > maxH)) { pages.push(page); page = { rows: [], h: 8 / z, n: 0 }; }
      row = { cells: [], y: page.h, strip: 0, h: 0 }; page.rows.push(row); x = left;
    }
    row.cells.push({ e, ...ex, x, w }); row.strip = Math.max(row.strip, h); x += w; page.n++;
  }
  closeRow(); if (page.n) pages.push(page);
  return pages;
}
const tileX = (X: number, Y: number) => (X / HW + Y / HH) / 2, tileY = (X: number, Y: number) => (Y / HH - X / HW) / 2;

/** the opaque base of each picture (atlas mip 0 alpha), in world px about its anchor at its scale: the picture's bottom, the x extent and centre of
 *  its lowest band (the lowest 12% of its opaque height), its widest x extent, and its opaque top */
async function measure(entries: AuditEntry[]) {
  const byPage = new Map<number, AuditEntry[]>();
  for (const e of entries) { const p = LIBRARY[e.item]!.tex[0]; let l = byPage.get(p); if (!l) byPage.set(p, l = []); l.push(e); }
  const out: unknown[] = [];
  for (const [page, list] of byPage) {
    const bmp = await createImageBitmap(await (await fetch(ATLAS_PAGES[page]![0]!)).blob()), cv = new OffscreenCanvas(bmp.width, bmp.height), g = cv.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(bmp, 0, 0); const PW = bmp.width, PH = bmp.height; bmp.close();
    for (const e of list) {
      const it = LIBRARY[e.item]!, [, u0, v0, u1, v1] = it.tex, q = it.quad, k = e.scale;
      const px0 = Math.floor(Math.min(u0, u1) * PW), py0 = Math.floor(v0 * PH), pw = Math.max(1, Math.round(Math.abs(u1 - u0) * PW)), ph = Math.max(1, Math.round((v1 - v0) * PH));
      const d = g.getImageData(px0, py0, pw, ph).data, rowMin = new Float64Array(ph).fill(Infinity), rowMax = new Float64Array(ph).fill(-Infinity);
      let top = -1, bottom = -1, ox0 = Infinity, ox1 = -Infinity;
      for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) if (d[(y * pw + x) * 4 + 3]! > 128) { if (top < 0) top = y; bottom = y; if (x < rowMin[y]!) rowMin[y] = x; if (x > rowMax[y]!) rowMax[y] = x; ox0 = Math.min(ox0, x); ox1 = Math.max(ox1, x); }
      if (bottom < 0) { out.push({ id: it.id, empty: true }); continue; }
      const band = Math.max(2, Math.round((bottom - top) * 0.12)); let bx0 = Infinity, bx1 = -Infinity, sum = 0, n = 0;
      for (let y = bottom - band; y <= bottom; y++) if (rowMax[y]! >= 0) { bx0 = Math.min(bx0, rowMin[y]!); bx1 = Math.max(bx1, rowMax[y]!); sum += (rowMin[y]! + rowMax[y]!) / 2; n++; }
      // texels to display px (the trimmed quad), then to world px about the anchor at the prop's scale (mirrored when flipped)
      const sx = (q[2] - q[0]) / pw, sy = (q[3] - q[1]) / ph, X = (t: number) => { const dx = q[0] + (t + 0.5) * sx; return ((e.flip ? it.w - dx : dx) - it.ax) * k; }, Y = (t: number) => (q[1] + (t + 0.5) * sy - it.ay) * k;
      const a = X(bx0), b = X(bx1), c = X(ox0), dd = X(ox1);
      out.push({ id: it.id, top: Y(top), bottom: Y(bottom), base: [Math.min(a, b), Math.max(a, b)], baseC: X(sum / n), wide: [Math.min(c, dd), Math.max(c, dd)] });
    }
  }
  return out;
}

export async function startShadowAudit(root: HTMLElement) {
  const q = new URLSearchParams(location.search), cat = (q.get('cat') ?? 'trees') as AuditCat, pageNo = +(q.get('page') ?? 0);
  // &old=1: T141's shadows (the rule shapes and the silhouettes) for every picture, for the before sheets (T142)
  VECTOR.on = q.get('old') !== '1'; NS = q.get('strips') === 'both' ? 1 : 3;
  const z = +(q.get('z') ?? 0.3), wCss = +(q.get('w') ?? 1600), per = +(q.get('per') ?? 40), dpr = window.devicePixelRatio || 1, maxDev = +(q.get('h') ?? 3600);
  W.__shadowAudit = { ready: false, pages: 0, page: pageNo, cat, items: [] };
  document.title = `Shadow audit: ${cat} ${pageNo}`;
  document.body.style.margin = '0'; document.body.style.background = '#222';
  if (!AUDIT_CATS.includes(cat)) { W.__shadowAudit.error = `no category ${cat}`; root.textContent = `categories: ${AUDIT_CATS.join(', ')}`; return; }
  const entries = auditEntries(cat), pages = layout(entries, wCss / z, z, per, maxDev / dpr / z);
  W.__shadowAudit.pages = pages.length;
  if (q.get('measure') === '1') W.__shadowAudit.measure = await measure(entries);
  const page = pages[Math.min(pageNo, pages.length - 1)]!, hCss = Math.ceil(page.h * z);
  const wrap = document.createElement('div'); wrap.style.cssText = `position:relative;width:${wCss}px;height:${hCss}px`;
  const cv = document.createElement('canvas'), lab = document.createElement('canvas');
  for (const c of [cv, lab]) { c.width = Math.round(wCss * dpr); c.height = Math.round(hCss * dpr); c.style.cssText = `position:absolute;left:0;top:0;width:${wCss}px;height:${hCss}px`; wrap.appendChild(c); }
  root.replaceChildren(wrap);

  // the props: each cell's entry once in each strip, a sprite set per strip
  const tiles = MODES.map(() => new SpriteTiles()), Wworld = wCss / z, Hworld = page.h;
  const items: unknown[] = [];
  const ground = new OffscreenCanvas(wCss, hCss), g = ground.getContext('2d')!;
  g.fillStyle = `rgb(${GROUND.map(v => Math.round(v * 255)).join(',')})`; g.fillRect(0, 0, wCss, hCss);
  // the 2 m tile grid, faint, in the iso view
  g.save(); g.setTransform(HW * z, HH * z, -HW * z, HH * z, 0, 0); g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1 / (HW * z);
  const t0 = Math.floor(tileY(Wworld, 0)) - 2, t1 = Math.ceil(tileX(Wworld, Hworld)) + 2;
  for (let t = t0; t <= t1; t++) { g.beginPath(); g.moveTo(t, t0); g.lineTo(t, t1); g.moveTo(t0, t); g.lineTo(t1, t); g.stroke(); }
  g.restore();
  for (const row of page.rows) {
    MODES.slice(0, NS).forEach((m, mi) => {
      const y0 = row.y + mi * row.strip;
      if (mi) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(0, y0 * z, wCss, 1); }
      for (const c of row.cells) {
        const AX = c.x - c.L + (c.w - (c.R - c.L)) / 2, AY = y0 - c.T, p = propOf(c.e, tileX(AX, AY), tileY(AX, AY));
        tiles[mi]!.add(p);
        if (m === 'contact') {
          // the footprint (white) and the anchor (red), on the ground of the contact strip only
          g.save(); g.setTransform(HW * z, HH * z, -HW * z, HH * z, 0, 0); g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1 / (HW * z);
          g.strokeRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0); g.restore();
          g.fillStyle = '#e33'; g.fillRect(worldX(p.x, p.y) * z - 1.5, worldY(p.x, p.y) * z - 1.5, 3, 3);
        }
        if (mi === 0) {
          const it = LIBRARY[c.e.item]!, s = shapeOf(p), box = [c.x * z, row.y * z, c.w * z, row.h * z].map(v => Math.round(v));
          items.push({ id: it.id, kind: it.kind, cat: it.cat, scale: c.e.scale, note: c.e.note, foot: [p.x0 - p.x, p.y0 - p.y, p.x1 - p.x, p.y1 - p.y], shape: s, box, vector: VECTOR.on && !!vecOf(lookOf(p).item) });
        }
      }
    });
  }
  W.__shadowAudit.items = items;

  // the labels: each strip's mode down the left, each cell's id and shape under its strips
  const l = lab.getContext('2d')!; l.scale(dpr, dpr); l.textBaseline = 'top';
  for (const row of page.rows) {
    MODES.slice(0, NS).forEach((m, mi) => {
      l.save(); l.translate(4, (row.y + mi * row.strip + row.strip / 2) * z); l.rotate(-Math.PI / 2); l.font = 'bold 11px sans-serif'; l.textAlign = 'center';
      l.fillStyle = 'rgba(0,0,0,0.65)'; l.fillText(m.toUpperCase(), 0, 0); l.restore();
    });
    for (const c of row.cells) {
      const it = LIBRARY[c.e.item]!, x = c.x * z + 3, w = c.w * z - 6, y = (row.y + row.strip * NS) * z + 2, p = propOf(c.e, 0, 0), s = shapeOf(p);
      const vec = VECTOR.on ? vecOf(lookOf(p).item) : null;
      const line2 = vec ? `drawn ${vec.count / 3} tris${c.e.scale !== 1 ? ` s${c.e.scale.toFixed(2)}` : ""}` : s ? `${s.round ? "o" : "[]"} ${s.hx.toFixed(2)}x${s.hy.toFixed(2)} ${s.kind}${s.cast ? "" : " nocast"}${c.e.scale !== 1 ? ` s${c.e.scale.toFixed(2)}` : ""}` : "none";
      l.fillStyle = 'rgba(255,255,255,0.88)'; l.fillRect(x - 2, y - 1, w + 4, 38);
      l.fillStyle = '#111'; l.font = '10px sans-serif';
      const words = it.id.split(/(?<=[:_-])/); let line = '', ly = y;
      for (const wd of words) { if (l.measureText(line + wd).width > w && line) { l.fillText(line, x, ly); ly += 10; line = ''; if (ly > y + 20) break; } line += wd; }
      if (ly <= y + 20) l.fillText(line, x, ly);
      l.fillStyle = '#555'; l.font = '9px sans-serif'; l.fillText(c.e.note ? `${line2} · ${c.e.note}` : line2, x, y + 28, w);
    }
  }

  // the GL side: the game's renderer, its atlas (the WebP pages), the ground as one chunk
  const gl = new GLRenderer(cv);
  try { await gl.initAtlas(dpr, [webpSource(ATLAS_PAGES)]); } catch (e) { W.__shadowAudit.error = String(e); return; }
  gl.initVector(vectorMesh());
  const groundTex = gl.textureFrom(await createImageBitmap(ground));
  const view = { X: Wworld / 2, Y: Hworld / 2, ze: z * dpr, cw: cv.width, ch: cv.height };
  const vis: { i: number; j: number }[] = [];
  for (let j = Math.floor(-1); j <= Math.floor(Hworld / SPR_H) + 1; j++) for (let i = -1; i <= Math.floor(Wworld / SPR_W) + 1; i++) vis.push({ i, j });
  const a = gl.atlas!, P = a.plan, need = neededLevel(z, dpr, P), G = P.grid, [lx, ly] = leanOf(), sh = castShear(CAST);
  const t0ms = performance.now(); let settled = 0;
  const frame = () => {
    const f = tiles.map(t => t.frame(vis, []));
    const at = gl.uploadParts([[f[0]!.shadows, f[0]!.shadowFloats], [f[1]!.shadows, f[1]!.shadowFloats], [f[0]!.stream, f[0]!.floats], [f[1]!.stream, f[1]!.floats], [f[2]!.stream, f[2]!.floats],
      ...f.flatMap(s => s.vec.map(v => [v.data, v.floats] as [Float32Array, number]))]);
    // the atlas cells every picture needs, at the view's level
    const mark = new Map<number, number>();
    for (const s of f) for (let o = 0; o < s.floats; o += SPRITE_STRIDE) {
      const st = s.stream, u0 = Math.min(st[o + 4]!, st[o + 6]!), u1 = Math.max(st[o + 4]!, st[o + 6]!), v0 = st[o + 5]!, v1 = st[o + 7]!, pg = st[o + 8]!;
      for (let gy = Math.max(0, Math.floor(v0 * G)); gy <= Math.min(G - 1, Math.floor(v1 * G)); gy++) for (let gx = Math.max(0, Math.floor(u0 * G)); gx <= Math.min(G - 1, Math.floor(u1 * G)); gx++) {
        const u = (pg * G + gy) * G + gx; mark.set(u, (mark.get(u) ?? 0) + 1);
      }
    }
    const wants: PageWant[] = need >= P.lowBase ? [] : [...mark].map(([unit, w]) => ({ unit, level: need, onScreen: true, weight: w }));
    a.want(wants); a.pump();
    gl.begin(view, GROUND);
    gl.drawChunk(groundTex, 0, 0, Wworld, Hworld);
    // the shadows into one layer, as the game draws them (T185: gl.ts beginShadows)
    gl.beginShadows();
    gl.drawCast(at[2]!, f[0]!.floats / SPRITE_STRIDE, sh.sx, sh.sy, CAST.strength);
    gl.drawCast(at[4]!, f[2]!.floats / SPRITE_STRIDE, sh.sx, sh.sy, CAST.strength);
    gl.drawShadows(at[0]!, f[0]!.shadowFloats / SHADOW_STRIDE, CONTACT_STRENGTH, lx, ly);
    gl.drawShadows(at[1]!, f[1]!.shadowFloats / SHADOW_STRIDE, CONTACT_STRENGTH, lx, ly);
    // the vector shadows (T142): both in the first strip, the contact shapes alone in the second, the cast shapes alone in the third
    f.forEach((s, m) => s.vec.forEach((v, b) => gl.drawVector(at[5 + m * s.vec.length + b]!, v.floats / VECTOR_STRIDE, v.verts, sh.sx, sh.sy, m === 2 ? 0 : CONTACT_STRENGTH, m === 1 ? 0 : CAST.strength)));
    gl.endShadows();
    for (const k of [2, 3, 4]) gl.drawSprites(at[k]!, f[k - 2]!.floats / SPRITE_STRIDE, 0);
    const soft = wants.filter(w => a.pages.levelOf(w.unit) > need).length;
    settled = soft === 0 ? settled + 1 : 0;
    if (settled > 4 || performance.now() - t0ms > 25000) { W.__shadowAudit.soft = soft; W.__shadowAudit.ready = true; return; }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
