// Shared translucent ghost and wireframe preview module for build tools (UIX revamp T018).
// Pure TypeScript, no DOM globals: works with engine.ts overlay views and headless unit tests.
// Units: world coordinates and widths in tiles of 2 m; screen coordinates in CSS pixels; money in $.
import { drawRefusedCross, HATCH_LIGHT, polyCentre, strokeHatch } from '../refused-mark';

/** a 2D point in world tiles (2 m per tile) or screen CSS pixels */
export interface GhostPt { x: number; y: number }

/** a world-space footprint rectangle in tiles; angleDeg rotates counter-clockwise around (x, y) when set */
export interface GhostRect { x: number; y: number; w: number; h: number; angleDeg?: number }

/** visual state of a ghost preview element ('invalid' is strictly reserved for refused placements) */
export type GhostStatus = 'valid' | 'invalid' | 'replace' | 'neutral';

/** a connection or snap point highlighted on the ghost preview (world tiles) */
export interface GhostSnapPoint {
  x: number;
  y: number;
  kind: 'node' | 'end' | 'road' | 'edge' | 'grid';
  /** unit normal for 'road' or 'edge' cross-ticks */
  nx?: number;
  ny?: number;
  /** half-length of cross-tick in tiles (default 1.5) */
  halfSpan?: number;
}

/** minimal 2D canvas context subset used by ghost drawing helpers (compatible with CanvasRenderingContext2D and test doubles) */
export interface GhostCanvasCtx {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineJoin: CanvasLineJoin;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  rect(x: number, y: number, w: number, h: number): void;
  arc(x: number, y: number, r: number, startAngle: number, endAngle: number): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  save(): void;
  restore(): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  setLineDash(segments: number[]): void;
  fillText(text: string, x: number, y: number): void;
  strokeText(text: string, x: number, y: number): void;
}

/** overlay view adapter matching PaintView in src/game/paint-tool.ts and engine.ts */
export interface GhostView {
  ctx: GhostCanvasCtx;
  setIso(ctx: GhostCanvasCtx): void;
  screen(x: number, y: number): GhostPt;
  dpr: number;
}

/** a complete declarative ghost preview blueprint for any build tool */
export interface GhostBlueprint {
  status: GhostStatus;
  /** closed world-space polygons (flat [x0, y0, x1, y1, ...] in tiles) */
  polys?: { pts: readonly number[]; fillColor?: string; dashed?: boolean; borderWidthTiles?: number; borderColor?: string }[];
  /** world-space rectangles (tiles) */
  rects?: { rect: GhostRect; fillColor?: string; dashed?: boolean }[];
  /** world-space extruded strips along segments (tiles) */
  strips?: { legs: readonly { a: GhostPt; b: GhostPt }[]; halfWidth: number; status?: GhostStatus; fillColor?: string; dashed?: boolean }[];
  /** world-space rings or circles (tiles) */
  rings?: { cx: number; cy: number; outerR: number; innerR?: number; status?: GhostStatus }[];
  /** world-space detail line segments [x0, y0, x1, y1, ...] (bay lines, booth ticks, chevrons) */
  detailLines?: { pts: readonly number[]; color?: string; widthPx?: number; dashed?: boolean }[];
  /** snap or connection markers */
  snaps?: readonly GhostSnapPoint[];
  /** entrance or door markers in world tiles */
  entrances?: readonly GhostPt[];
  /** one-line cursor text (reason when bad, summary/cost when valid) */
  label?: string;
  /** true when placement is refused or unaffordable */
  bad?: boolean;
}

/** unified ghost palette and stroke metrics across all build tools (CSS colours; dash lengths in CSS pixels) */
export const GHOST_STYLE = {
  validFill: 'rgba(60,200,90,0.32)',
  validStroke: '#86efac',
  validWire: 'rgba(255,230,150,0.9)',
  invalidFill: 'rgba(230,80,80,0.35)',
  invalidStroke: '#f87171',
  replaceFill: 'rgba(251,191,36,0.22)',
  replaceStroke: '#fbbf24',
  neutralFill: 'rgba(50,60,80,0.45)',
  neutralStroke: '#ffd866',
  snapColor: '#ffb020',
  entranceColor: '#ffbe3c',
  hintGoodFill: '#bbf7d0',
  hintBadFill: '#fecaca',
  hintOutline: 'rgba(2,6,23,0.9)',
  dashOnPx: 6,
  dashOffPx: 4,
} as const;

/** converts a '#rrggbb' hex string and alpha (0..1) into an 'rgba(r,g,b,a)' CSS colour */
export function rgbaOf(hex: string, alpha: number): string {
  const clean = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.slice(1) : '888888';
  const n = parseInt(clean, 16), a = Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 1));
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** resolves placement validity, status, and one-line cursor label from a refusal reason, cost ($), treasury ($), and summary */
export function ghostStatus(why: string, cost = 0, money = Infinity, summary = ''): { ok: boolean; status: GhostStatus; label: string; bad: boolean } {
  const trimmed = why.trim();
  if (trimmed) return { ok: false, status: 'invalid', label: trimmed, bad: true };
  const c = Math.max(0, Math.round(Number.isFinite(cost) ? cost : 0));
  if (c > money) {
    const label = `Not enough money: $${c.toLocaleString()}`;
    return { ok: false, status: 'invalid', label, bad: true };
  }
  const costText = c > 0 ? `$${c.toLocaleString()}` : '';
  const label = summary && costText ? `${summary} · ${costText}` : summary || costText;
  return { ok: true, status: 'valid', label, bad: false };
}

/** returns the 4 world-space corners (tiles) of a GhostRect in counter-clockwise order */
export function rectCorners(r: GhostRect): GhostPt[] {
  const rad = (r.angleDeg ?? 0) * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
  const ux = c, uy = s, vx = -s, vy = c;
  const pt = (lx: number, ly: number): GhostPt => ({ x: r.x + ux * lx + vx * ly + 0, y: r.y + uy * lx + vy * ly + 0 });
  return [pt(0, 0), pt(r.w, 0), pt(r.w, r.h), pt(0, r.h)];
}

/** returns the 8 flat coordinates [x0,y0..x3,y3] (tiles) of a segment a->b extruded by halfWidth tiles on each side and end */
export function corridorQuad(a: GhostPt, b: GhostPt, halfWidth: number, capEnds = true): number[] {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux, hw = Math.max(0, halfWidth), ext = capEnds ? hw : 0;
  const ax = a.x - ux * ext, ay = a.y - uy * ext, bx = b.x + ux * ext, by = b.y + uy * ext;
  return [
    ax + nx * hw, ay + ny * hw,
    bx + nx * hw, by + ny * hw,
    bx - nx * hw, by - ny * hw,
    ax - nx * hw, ay - ny * hw,
  ];
}

/** selects default fill and stroke colours for a GhostStatus */
export function colorsForStatus(status: GhostStatus, customFill?: string): { fill: string; stroke: string } {
  if (status === 'invalid') return { fill: GHOST_STYLE.invalidFill, stroke: GHOST_STYLE.invalidStroke };
  if (status === 'replace') return { fill: GHOST_STYLE.replaceFill, stroke: GHOST_STYLE.replaceStroke };
  if (status === 'neutral') return { fill: customFill ?? GHOST_STYLE.neutralFill, stroke: GHOST_STYLE.neutralStroke };
  return { fill: customFill ?? GHOST_STYLE.validFill, stroke: GHOST_STYLE.validStroke };
}

/** traces a flat [x0, y0, x1, y1, ...] polygon into ctx (caller calls beginPath and sets transform) */
function traceFlat(ctx: GhostCanvasCtx, pts: readonly number[], closed = true): void {
  const n = pts.length >> 1;
  if (n < 1) return;
  ctx.moveTo(pts[0]!, pts[1]!);
  for (let i = 1; i < n; i++) ctx.lineTo(pts[2 * i]!, pts[2 * i + 1]!);
  if (closed) ctx.closePath();
}

/** draws a translucent ghost polygon with wireframe outline and optional inner collar band in world tiles */
export function drawGhostPoly(
  v: GhostView,
  pts: readonly number[],
  status: GhostStatus,
  opts?: { fillColor?: string; dashed?: boolean; lineWidthPx?: number; borderWidthTiles?: number; borderColor?: string; cross?: boolean },
): void {
  if (pts.length < 6) return;
  const ctx = v.ctx, dpr = v.dpr, { fill, stroke } = colorsForStatus(status, opts?.fillColor);
  v.setIso(ctx); ctx.beginPath(); traceFlat(ctx, pts, true); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = fill; ctx.fill();
  // refused (T180, not by colour alone): a hatch inside it, at a fixed screen pitch
  if (status === 'invalid') hatchPoly(v, pts);
  if (opts?.borderWidthTiles && opts.borderWidthTiles > 0 && status !== 'invalid') {
    v.setIso(ctx); ctx.beginPath(); traceFlat(ctx, pts, true);
    ctx.save(); ctx.clip();
    ctx.lineWidth = 2 * opts.borderWidthTiles;
    ctx.strokeStyle = opts.borderColor ?? 'rgba(255,255,255,0.65)';
    ctx.stroke();
    ctx.restore();
  }
  v.setIso(ctx); ctx.beginPath(); traceFlat(ctx, pts, true); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = (opts?.lineWidthPx ?? 1.5) * dpr;
  if (opts?.dashed !== false) ctx.setLineDash([GHOST_STYLE.dashOnPx * dpr, GHOST_STYLE.dashOffPx * dpr]);
  ctx.stroke();
  if (opts?.dashed !== false) ctx.setLineDash([]);
  if (status === 'invalid' && opts?.cross !== false) { const c = polyCentre(pts), p = v.screen(c.x, c.y); drawRefusedCross(ctx, p.x, p.y, dpr); }
}

/** a refused footprint's hatch (T180): the polygon (tiles) as the clip, the hatch over its box on screen */
function hatchPoly(v: GhostView, pts: readonly number[]): void {
  const ctx = v.ctx, n = pts.length >> 1;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) { const p = v.screen(pts[2 * i]!, pts[2 * i + 1]!); if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  ctx.save();
  v.setIso(ctx); ctx.beginPath(); traceFlat(ctx, pts, true); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clip();
  strokeHatch(ctx, x0, y0, x1, y1, v.dpr, HATCH_LIGHT, 0.75);
  ctx.restore();
}

/** a refused footprint drawn elsewhere (the clubhouse's and the Props ghost's rects): the hatch inside the polygon (tiles) and the ✕, at its
 *  centre, or (front) by its front corner, 16 css px in, where a building's picture standing on the footprint does not cover it */
export function drawRefusedMarks(v: GhostView, pts: readonly number[], at: 'centre' | 'front' = 'centre'): void {
  if (pts.length < 6) return;
  hatchPoly(v, pts);
  const c = polyCentre(pts), p = v.screen(c.x, c.y);
  if (at === 'front') {
    let f = p;
    for (let i = 0; i + 1 < pts.length; i += 2) { const q = v.screen(pts[i]!, pts[i + 1]!); if (q.y > f.y) f = q; }
    const dx = p.x - f.x, dy = p.y - f.y, L = Math.hypot(dx, dy), k = L > 0 ? Math.min(1, (16 * v.dpr) / L) : 0;
    drawRefusedCross(v.ctx, f.x + dx * k, f.y + dy * k, v.dpr);
    return;
  }
  drawRefusedCross(v.ctx, p.x, p.y, v.dpr);
}

/** draws an axis-aligned or rotated ghost footprint rectangle in world tiles */
export function drawGhostRect(
  v: GhostView,
  rect: GhostRect,
  status: GhostStatus,
  opts?: { fillColor?: string; dashed?: boolean; lineWidthPx?: number },
): void {
  const corners = rectCorners(rect), flat: number[] = [];
  for (const c of corners) flat.push(c.x, c.y);
  drawGhostPoly(v, flat, status, opts);
}

/** draws an extruded corridor strip along one or more legs in world tiles */
export function drawGhostStrip(
  v: GhostView,
  legs: readonly { a: GhostPt; b: GhostPt }[],
  halfWidth: number,
  status: GhostStatus,
  opts?: { fillColor?: string; dashed?: boolean; lineWidthPx?: number },
): void {
  if (!legs.length) return;
  const ctx = v.ctx, dpr = v.dpr, { fill, stroke } = colorsForStatus(status, opts?.fillColor);
  v.setIso(ctx); ctx.beginPath();
  for (const l of legs) traceFlat(ctx, corridorQuad(l.a, l.b, halfWidth, true), true);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = (opts?.lineWidthPx ?? 1.5) * dpr;
  if (opts?.dashed) ctx.setLineDash([GHOST_STYLE.dashOnPx * dpr, GHOST_STYLE.dashOffPx * dpr]);
  ctx.stroke();
  if (opts?.dashed) ctx.setLineDash([]);
}

/** draws a circular or annular ghost ring (e.g. roundabout or junction footprint) in world tiles */
export function drawGhostRing(
  v: GhostView,
  cx: number,
  cy: number,
  outerR: number,
  innerR = 0,
  status: GhostStatus = 'neutral',
): void {
  const ctx = v.ctx, dpr = v.dpr, { fill, stroke } = colorsForStatus(status);
  v.setIso(ctx); ctx.beginPath(); ctx.arc(cx, cy, Math.max(0.5, outerR), 0, Math.PI * 2); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = stroke; ctx.lineWidth = 2 * dpr; ctx.stroke();
  if (innerR > 0) {
    v.setIso(ctx); ctx.beginPath(); ctx.arc(cx, cy, Math.max(0.5, innerR), 0, Math.PI * 2); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = status === 'invalid' ? 'rgba(240,80,60,0.18)' : 'rgba(110,150,80,0.5)';
    ctx.fill();
    ctx.setLineDash([GHOST_STYLE.dashOnPx * dpr, GHOST_STYLE.dashOffPx * dpr]);
    ctx.strokeStyle = stroke; ctx.lineWidth = 1.5 * dpr; ctx.stroke();
    ctx.setLineDash([]);
  }
  if (status === 'invalid') { const p = v.screen(cx, cy); drawRefusedCross(ctx, p.x, p.y, dpr); }
}

/** draws a snap indicator (amber ring on node/end/edge, cross-tick on road, small dot on grid) */
export function drawGhostSnap(v: GhostView, snap: GhostSnapPoint): void {
  const ctx = v.ctx, dpr = v.dpr;
  if (snap.kind === 'node' || snap.kind === 'end') {
    const s = v.screen(snap.x, snap.y);
    ctx.beginPath(); ctx.arc(s.x, s.y, 8 * dpr, 0, Math.PI * 2);
    ctx.strokeStyle = GHOST_STYLE.snapColor; ctx.lineWidth = 2 * dpr; ctx.stroke();
  } else if ((snap.kind === 'road' || snap.kind === 'edge') && snap.nx !== undefined && snap.ny !== undefined) {
    const h = snap.halfSpan ?? 1.5;
    v.setIso(ctx); ctx.beginPath();
    ctx.moveTo(snap.x - snap.nx * h, snap.y - snap.ny * h);
    ctx.lineTo(snap.x + snap.nx * h, snap.y + snap.ny * h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = GHOST_STYLE.snapColor; ctx.lineWidth = 2 * dpr; ctx.stroke();
  } else if (snap.kind === 'grid') {
    const s = v.screen(snap.x, snap.y);
    ctx.beginPath(); ctx.arc(s.x, s.y, 4 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,216,102,0.9)'; ctx.fill();
  }
}

/** draws a one-line status or refusal hint beside the cursor at (mx, my) in CSS pixels */
export function drawGhostHint(v: GhostView, mx: number, my: number, text: string, bad: boolean): void {
  if (!text) return;
  const ctx = v.ctx, dpr = v.dpr, x = mx * dpr + 14 * dpr, y = my * dpr - 12 * dpr;
  ctx.font = `bold ${12 * dpr}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = 3 * dpr;
  ctx.strokeStyle = GHOST_STYLE.hintOutline; ctx.strokeText(text, x, y);
  ctx.fillStyle = bad ? GHOST_STYLE.hintBadFill : GHOST_STYLE.hintGoodFill;
  ctx.fillText(text, x, y);
  ctx.lineJoin = 'miter'; ctx.textBaseline = 'alphabetic';
}

/** renders a full GhostBlueprint onto the overlay view (mx, my are cursor CSS pixels for the label) */
export function drawGhostBlueprint(v: GhostView, bp: GhostBlueprint, mx?: number, my?: number): void {
  const ctx = v.ctx, dpr = v.dpr;
  if (bp.strips) {
    for (const s of bp.strips) drawGhostStrip(v, s.legs, s.halfWidth, s.status ?? bp.status, { fillColor: s.fillColor, dashed: s.dashed });
  }
  if (bp.polys) {
    for (const p of bp.polys) drawGhostPoly(v, p.pts, bp.status, p);
  }
  if (bp.rects) {
    for (const r of bp.rects) drawGhostRect(v, r.rect, bp.status, { fillColor: r.fillColor, dashed: r.dashed });
  }
  if (bp.rings) {
    for (const rg of bp.rings) drawGhostRing(v, rg.cx, rg.cy, rg.outerR, rg.innerR ?? 0, rg.status ?? bp.status);
  }
  if (bp.detailLines) {
    for (const dl of bp.detailLines) {
      if (dl.pts.length < 4) continue;
      v.setIso(ctx); ctx.beginPath();
      for (let i = 0; i + 3 < dl.pts.length; i += 4) {
        ctx.moveTo(dl.pts[i]!, dl.pts[i + 1]!);
        ctx.lineTo(dl.pts[i + 2]!, dl.pts[i + 3]!);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.strokeStyle = bp.status === 'invalid' ? GHOST_STYLE.invalidStroke : (dl.color ?? 'rgba(255,255,255,0.9)');
      ctx.lineWidth = (dl.widthPx ?? 1.2) * dpr;
      if (dl.dashed) ctx.setLineDash([GHOST_STYLE.dashOnPx * dpr, GHOST_STYLE.dashOffPx * dpr]);
      ctx.stroke();
      if (dl.dashed) ctx.setLineDash([]);
    }
  }
  if (bp.entrances) {
    for (const e of bp.entrances) {
      const p = v.screen(e.x, e.y);
      ctx.beginPath(); ctx.arc(p.x, p.y, 4 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = GHOST_STYLE.entranceColor; ctx.fill();
    }
  }
  if (bp.snaps) {
    for (const s of bp.snaps) drawGhostSnap(v, s);
  }
  if (bp.label && mx !== undefined && my !== undefined) {
    drawGhostHint(v, mx, my, bp.label, Boolean(bp.bad || bp.status === 'invalid'));
  }
}
