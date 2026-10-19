// The Paint tool's state and input (docs/PAINT-TOOL.md "The tool (UI)"): drawing outlines by clicks or a lasso, picking, erasing and the preview. No React; the engine and PaintPanel call it.
import type { LotPatch } from './ground-protocol';
import { BORDER_TEXES, BORDER_W, DEFAULT_STYLE, PAINT_TEXES, areaAt, checkArea, clampStyle, crossings, fromTuples, simplify, snapPt, toTuple, type PaintArea, type PaintTuple } from './paint';

export type PaintMode = 'draw' | 'pick' | 'erase';
/** what the tool needs from the engine */
export interface PaintHost { setLotGround(key: string, patches: LotPatch[] | null): void; emit(): void; save(): void; toast(text: string, kind?: 'info' | 'warn'): void }
/** what the preview needs to draw (the engine's overlay helpers) */
export interface PaintView { ctx: CanvasRenderingContext2D; setIso(ctx: CanvasRenderingContext2D): void; screen(x: number, y: number): { x: number; y: number }; dpr: number; hint(mx: number, my: number, text: string, bad: boolean): void }

const TEX_COL = new Map(PAINT_TEXES.map(t => [t.id as string, t.col] as [string, string]));
const BTEX_COL = new Map(BORDER_TEXES.map(t => [t.id as string, t.col] as [string, string]));

/** a '#rrggbb' colour with an alpha, as an rgba() string */
function rgba(hex: string, a: number): string { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }

/** adds a polygon's corners to the current path (the caller begins the path and sets the transform) */
function trace(ctx: CanvasRenderingContext2D, pts: number[], closed: boolean) {
  const n = pts.length >> 1; if (n < 1) return;
  ctx.moveTo(pts[0]!, pts[1]!); for (let i = 1; i < n; i++) ctx.lineTo(pts[2 * i]!, pts[2 * i + 1]!);
  if (closed) ctx.closePath();
}

/** the Paint tool: the painted areas, the panel's style, and the outline being drawn (clicks or a lasso) */
export class PaintTool {
  areas: PaintArea[] = [];
  nextId = 1;
  mode: PaintMode = 'draw';
  /** the panel's settings: for the next area, or mirroring the picked area */
  style: Omit<PaintArea, 'id' | 'pts'> = { ...DEFAULT_STYLE };
  /** corners snap to whole tiles (else to quarter tiles) */
  snap = true;
  /** the corners placed so far, x0 y0 x1 y1 ... (tiles) */
  pts: number[] = [];
  /** the tile under the pointer (raw), or null */
  cursor: { x: number; y: number } | null = null;
  /** the pointer in css px, or null */
  mouse: { mx: number; my: number } | null = null;
  /** the picked area's id (0: none) */
  selected = 0;
  /** the area under the pointer in pick or erase (0: none) */
  hover = 0;
  private down: { mx: number; my: number } | null = null;
  /** true while a freehand outline is being drawn */
  lasso = false;
  /** the reused buffer of outline() */
  private ol: number[] = [];
  private host: PaintHost;

  constructor(host: PaintHost) { this.host = host; }

  /** the ground patch of a painted area (outline, texture, scale, angle, border width, border texture, draw order) */
  static patch(a: PaintArea): LotPatch { return { pts: a.pts, tex: a.tex, paint: { s: a.scale, a: a.angle, b: BORDER_W[a.border]!, bt: a.btex, z: a.id } }; }

  /** sends an area's patch to the lot ground (key paint:<id>) */
  private send(a: PaintArea) { this.host.setLotGround('paint:' + a.id, [PaintTool.patch(a)]); }

  /** replaces the areas with the save tuples (none: clears) and sends their patches */
  load(ts?: PaintTuple[]) { this.clear(); this.areas = fromTuples(ts ?? []); this.nextId = this.areas.length + 1; for (const a of this.areas) this.send(a); }

  /** removes every area from the ground and resets the drawing and selection (the style and mode stay) */
  clear() {
    for (const a of this.areas) this.host.setLotGround('paint:' + a.id, null);
    this.areas = []; this.pts = []; this.selected = 0; this.hover = 0; this.nextId = 1; this.lasso = false; this.down = null;
  }

  /** the areas as save tuples */
  save(): PaintTuple[] { return this.areas.map(a => toTuple(a)); }

  /** switches between Draw, Pick and Erase, dropping the outline and the selection */
  setMode(m: PaintMode) { this.mode = m; this.cancel(); this.selected = 0; this.hover = 0; this.host.emit(); }

  /** changes the panel's style; a picked area takes the change at once (its ground re-bakes) */
  setStyle(p: Partial<Omit<PaintArea, 'id' | 'pts'>>) {
    this.style = clampStyle({ ...this.style, ...p });
    if (this.mode === 'pick' && this.selected) {
      const a = this.areas.find(q => q.id === this.selected);
      if (a) { Object.assign(a, this.style); this.send(a); this.host.save(); }
    }
    this.host.emit();
  }

  /** drops the outline being drawn (its corners, the lasso and the press) */
  cancel() { this.pts = []; this.lasso = false; this.down = null; }

  /** a press on tile t (css px mx, my): draw waits for the release (a click or a lasso); pick selects the area under it; erase removes it */
  pointerDown(t: { x: number; y: number }, mx: number, my: number) {
    if (this.mode === 'draw') { this.down = { mx, my }; this.cursor = t; return; }
    if (this.mode === 'pick') {
      const a = areaAt(this.areas, t.x, t.y);
      this.selected = a?.id ?? 0;
      if (a) this.take(a);
      this.host.emit(); return;
    }
    const a = areaAt(this.areas, t.x, t.y);
    if (a) this.remove(a.id);
  }

  /** a move over tile t (null off the map): draws the lasso, or hovers the area under the pointer */
  pointerMove(t: { x: number; y: number } | null, mx: number, my: number) {
    this.cursor = t; this.mouse = { mx, my };
    if (this.mode !== 'draw') { this.hover = t ? (areaAt(this.areas, t.x, t.y)?.id ?? 0) : 0; return; }
    const d = this.down;
    if (d && !this.lasso && this.pts.length === 0 && Math.abs(mx - d.mx) + Math.abs(my - d.my) > 6) { this.lasso = true; this.pts = []; }
    if (this.lasso && t) {
      const x = Math.round(t.x * 4) / 4, y = Math.round(t.y * 4) / 4, n = this.pts.length;
      if (n === 0 || Math.hypot(x - this.pts[n - 2]!, y - this.pts[n - 1]!) >= 0.3) this.pts.push(x, y);
    }
  }

  /** the release (draw): a lasso is simplified and closed; a press without a drag is a click that adds a corner (tol: the close distance in tiles) */
  pointerUp(tol: number) {
    if (this.mode !== 'draw') return;
    if (this.lasso) {
      let p = simplify(this.pts); const n = p.length;
      if (n >= 4 && p[0] === p[n - 2] && p[1] === p[n - 1]) p = p.slice(0, n - 2);
      this.pts = p; this.lasso = false; this.down = null; this.finish(true); return;
    }
    if (this.down) { this.down = null; if (this.cursor) this.addCorner(this.cursor, tol); }
  }

  /** adds a corner at tile t, snapped; with 3 or more placed, a point within tol (at least 0.5 tile) of the first corner closes the outline */
  private addCorner(t: { x: number; y: number }, tol: number) {
    const p = snapPt(t.x, t.y, this.snap), n = this.pts.length;
    if (n >= 6 && Math.hypot(p.x - this.pts[0]!, p.y - this.pts[1]!) <= Math.max(tol, 0.5)) { this.finish(false); return; }
    if (n && p.x === this.pts[n - 2] && p.y === this.pts[n - 1]) return;
    this.pts.push(p.x, p.y); this.host.emit();
  }

  /** closes the outline: a valid one becomes an area with the panel's style; an invalid one toasts why (a lasso is dropped, a click keeps its corners for Backspace) */
  private finish(fromLasso: boolean) {
    if (this.pts.length < 6) { if (fromLasso) this.cancel(); return; }
    const why = checkArea(this.pts);
    if (why) { this.host.toast(why, 'warn'); if (fromLasso) this.cancel(); this.host.emit(); return; }
    const a: PaintArea = { id: this.nextId++, pts: this.pts.slice(), ...this.style };
    this.areas.push(a); this.send(a); this.cancel(); this.host.save(); this.host.emit();
  }

  /** removes an area and its ground (it re-bakes at once) */
  remove(id: number) {
    const i = this.areas.findIndex(a => a.id === id); if (i < 0) return;
    this.areas.splice(i, 1); this.host.setLotGround('paint:' + id, null);
    if (this.selected === id) this.selected = 0;
    if (this.hover === id) this.hover = 0;
    this.host.save(); this.host.emit();
  }

  /** a double click closes the outline being drawn (draw, 3 or more corners) */
  doubleClick() { if (this.mode === 'draw' && this.pts.length >= 6) this.finish(false); }

  /** a key press: true when the tool used it (Enter closes, Backspace undoes a corner, Esc cancels or deselects, Delete removes the picked area) */
  key(e: KeyboardEvent): boolean {
    switch (e.key) {
      case 'Enter': if (!this.pts.length) return false; this.finish(false); break;
      case 'Backspace': if (this.mode !== 'draw' || !this.pts.length) return false; this.pts.length -= 2; break;
      case 'Escape': if (this.pts.length) this.cancel(); else if (this.selected) this.selected = 0; else return false; break;
      case 'Delete': if (!this.selected) return false; this.remove(this.selected); return true;
      default: return false;
    }
    this.host.emit(); return true;
  }

  /** the outline as drawn: the corners, plus the snapped cursor while clicking (not lassoing); a reused buffer, valid until the next call */
  outline(): number[] {
    const c = this.cursor;
    if (this.mode !== 'draw' || this.lasso || !this.pts.length || !c) return this.pts;
    const p = snapPt(c.x, c.y, this.snap), ol = this.ol;
    ol.length = 0; for (const v of this.pts) ol.push(v); ol.push(p.x, p.y);
    return ol;
  }

  /** the overlay preview: the outline being drawn (fill, border band, dashed edge, crossing edges, corners, and why it cannot be placed), or the picked and hovered areas */
  drawPreview(v: PaintView) {
    const ctx = v.ctx, d = v.dpr;
    if (this.mode === 'draw') {
      const P = this.outline();
      if (P.length >= 4) {
        const why = P.length >= 6 ? checkArea(P) : '', bad = why !== '';
        v.setIso(ctx); ctx.beginPath(); trace(ctx, P, true); ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = bad ? 'rgba(160,40,40,0.5)' : rgba(TEX_COL.get(this.style.tex) ?? '#888888', 0.5); ctx.fill();
        if (this.style.border > 0 && P.length >= 6) {
          // the border band: twice the width, stroked in tile units on the clipped edge
          v.setIso(ctx); ctx.beginPath(); trace(ctx, P, true);
          ctx.save(); ctx.clip(); ctx.lineWidth = 2 * BORDER_W[this.style.border]!; ctx.strokeStyle = rgba(BTEX_COL.get(this.style.btex) ?? '#888888', 0.75); ctx.stroke(); ctx.restore();
        }
        v.setIso(ctx); ctx.beginPath(); trace(ctx, P, true); ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.strokeStyle = bad ? '#f87171' : 'rgba(255,230,150,0.9)'; ctx.lineWidth = 1.5 * d; ctx.setLineDash([6 * d, 4 * d]); ctx.stroke(); ctx.setLineDash([]);
        if (P.length >= 6) {
          const hit = crossings(P), n = P.length >> 1;
          if (hit.length) {
            v.setIso(ctx); ctx.beginPath();
            for (const i of hit) { const j = (i + 1) % n; ctx.moveTo(P[2 * i]!, P[2 * i + 1]!); ctx.lineTo(P[2 * j]!, P[2 * j + 1]!); }
            ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.strokeStyle = '#f87171'; ctx.lineWidth = 3 * d; ctx.stroke();
          }
        }
        if (!this.lasso) {
          for (let i = 0; i < this.pts.length >> 1; i++) {
            const s = v.screen(this.pts[2 * i]!, this.pts[2 * i + 1]!);
            ctx.beginPath(); ctx.arc(s.x, s.y, 4 * d, 0, Math.PI * 2); ctx.fillStyle = '#ffd866'; ctx.fill(); ctx.strokeStyle = '#4a3200'; ctx.lineWidth = 1.5 * d; ctx.stroke();
          }
          if (this.pts.length >= 6) {
            const s = v.screen(this.pts[0]!, this.pts[1]!);
            ctx.beginPath(); ctx.arc(s.x, s.y, 9 * d, 0, Math.PI * 2); ctx.strokeStyle = '#ffd866'; ctx.lineWidth = 2 * d; ctx.stroke();
          }
        }
        if (bad && this.mouse) v.hint(this.mouse.mx, this.mouse.my, why, true);
      }
      if (!this.pts.length && this.cursor && !this.lasso) {
        const p = snapPt(this.cursor.x, this.cursor.y, this.snap), s = v.screen(p.x, p.y);
        ctx.beginPath(); ctx.arc(s.x, s.y, 4 * d, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,216,102,0.9)'; ctx.fill();
      }
      return;
    }
    if (this.mode === 'pick') {
      const a = this.areas.find(q => q.id === this.selected);
      if (a) this.shade(v, a, 'rgba(251,191,36,0.18)', '#fbbf24', 2);
    }
    const h = this.areas.find(q => q.id === this.hover);
    if (h) {
      if (this.mode === 'erase') this.shade(v, h, 'rgba(240,80,60,0.3)', '#f87171', 2);
      else this.shade(v, h, null, 'rgba(255,255,255,0.8)', 1.5);
    }
  }

  /** fills (when fill is set) and outlines an area's polygon on the overlay; lw in css px */
  private shade(v: PaintView, a: PaintArea, fill: string | null, stroke: string, lw: number) {
    const ctx = v.ctx;
    v.setIso(ctx); ctx.beginPath(); trace(ctx, a.pts, true); ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.strokeStyle = stroke; ctx.lineWidth = lw * v.dpr; ctx.stroke();
  }

  /** copies a picked area's look into the panel's style */
  private take(a: PaintArea) { this.style = { tex: a.tex, scale: a.scale, angle: a.angle, border: a.border, btex: a.btex }; }
}
