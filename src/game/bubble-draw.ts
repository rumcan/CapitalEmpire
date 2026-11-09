// Drawing the speech bubbles (T406, #1090) on the 2D overlay, all in code (no art): a rounded box with a tail in the 1985 painterly UI style, a cloud with a
// trail of dots for a thought, a jagged burst for a shout and a wobbly pink box for a moan. Cream paper, a dark brown line, and a shadow falling to the lower
// left (the sun is at the upper right). One batched pass over the few bubbles on screen: the text is wrapped once and kept on the bubble.
// A bubble is never drawn over a ball or a golfer mid-swing (the `clears` the engine gives: it is lifted off them, or hidden while it cannot clear), and
// bubbles are drawn far to near, so a nearer person's bubble is on top. They sit in the world overlay, under the HUD. Pure canvas, no engine.
import { HH } from './iso';
import { bubblePose, zoomAlpha, type Bubble } from './bubbles';
import type { BubbleStyle } from './bubble-lines';

/** a rectangle on the overlay (device px) the bubbles keep clear of: a ball, a golfer in his swing */
export interface Clear { x0: number; y0: number; x1: number; y1: number }

/** the text's size (css px at dpr 1), the widest a line of it is, the line's height, and the box's padding, corner radius and the tail's length */
export const FONT_PX = 12, MAX_TEXT_W = 112, LINE_H = 14, PAD_X = 8, PAD_Y = 5, RADIUS = 8, TAIL = 9;
const FONT = 'ui-sans-serif, system-ui, sans-serif';

/** the colours by style: paper, line and ink */
const LOOK: Readonly<Record<BubbleStyle, { fill: string; line: string; ink: string }>> = {
  say: { fill: '#fff7dc', line: '#3a2716', ink: '#2b1d10' },
  think: { fill: '#f1f5ff', line: '#33405f', ink: '#242c44' },
  shout: { fill: '#ffe9a8', line: '#7a2410', ink: '#4a1608' },
  moan: { fill: '#ffe3e1', line: '#7a2a2a', ink: '#4a1a1a' },
};

/** the bubble's text wrapped to MAX_TEXT_W (css px) with `measure` (the width of a string at FONT_PX): its lines, and the box's inner width and height */
export function wrap(text: string, measure: (s: string) => number): { lines: string[]; w: number; h: number } {
  const words = text.split(/\s+/).filter(Boolean), lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (cur && measure(t) > MAX_TEXT_W) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  let wd = 0; for (const l of lines) wd = Math.max(wd, measure(l));
  return { lines, w: Math.max(28, Math.ceil(wd)), h: Math.max(1, lines.length) * LINE_H };
}

/** a rounded rectangle path */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
}
/** a jagged burst round the box (x, y, w, h): points alternate out and in round an ellipse a little bigger than the box */
function burst(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, spike: number): void {
  const cx = x + w / 2, cy = y + h / 2, rx = w / 2 + spike * 0.7, ry = h / 2 + spike * 0.7, N = 18;
  for (let i = 0; i < N * 2; i++) {
    const a = i * Math.PI / N, k = i % 2 ? 0.86 : 1.12, px = cx + Math.cos(a) * rx * k, py = cy + Math.sin(a) * ry * k;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

/** the keep-clear rectangle of a ball or a golfer mid-swing at screen point (px, py) (device px): around the ball with a little room, or over the golfer's
 *  whole figure from his feet up (heightPx), written into `out` */
export function clearAround(out: Clear, px: number, py: number, halfW: number, up: number, down: number): Clear { out.x0 = px - halfW; out.x1 = px + halfW; out.y0 = py - up; out.y1 = py + down; return out; }

const hit = (a: Clear, x0: number, y0: number, x1: number, y1: number): boolean => a.x0 < x1 && a.x1 > x0 && a.y0 < y1 && a.y1 > y0;
const placed: Clear[] = [];
let order: Bubble[] = [], ay: number[] = [];

/** where a bubble's box may stand, tried in turn: where it was, lifted a box, shifted aside by 0.6 of its width, lifted two, lifted and shifted, shifted a whole width,
 *  lifted three (each pair: the shift in box widths, the lifts in boxes) */
const TRIES: readonly (readonly [number, number])[] = [[0, 0], [0, 1], [0.6, 0], [-0.6, 0], [0, 2], [0.6, 1], [-0.6, 1], [1.05, 0], [-1.05, 0], [0, 3], [1.05, 1], [-1.05, 1]];
/** where a bubble's box goes: its left x and top y (y: where it would sit, over the head) at width bw and height bh, tried at TRIES until it is clear of every keep-clear
 *  rectangle (a ball, a golfer in his swing) and every box already placed; x held to minX..maxX. When it cannot be clear of all: where it was if only other bubbles are in
 *  the way (they may overlap), and not at all (false: hidden for the frame) if a ball or a golfer in his swing is. Written into `out` */
export function place(bx: number, y: number, bw: number, bh: number, clears: readonly Clear[], placed: readonly Clear[], out: { x: number; y: number }, minX = -Infinity, maxX = Infinity): boolean {
  const step = bh * 1.1; // (a box and a gap: a lifted box does not touch the one it was lifted off)
  for (const [fx, k] of TRIES) {
    const x = Math.min(maxX, Math.max(minX, bx + fx * bw)), yy = y - k * step;
    let ok = true;
    for (const c of clears) if (hit(c, x, yy, x + bw, yy + bh)) { ok = false; break; }
    if (ok) for (const r of placed) if (hit(r, x, yy, x + bw, yy + bh)) { ok = false; break; }
    if (ok) { out.x = x; out.y = yy; return true; }
  }
  for (const c of clears) if (hit(c, bx, y, bx + bw, y + bh)) return false;
  out.x = bx; out.y = y; return true;
}

/** a bubble's place on the overlay this frame: its box, its anchor (the head it points to), its size scale and opacity */
interface Geo { b: Bubble; s: number; x: number; y: number; w: number; h: number; ax: number; ay: number; alpha: number }
const geos: Geo[] = [];
const spot = { x: 0, y: 0 };

/** draws the bubbles over the map. A fan hurt by a ball is the gag, so his moan is placed first (nothing is lifted over it) and drawn last (on top); the rest are placed and
 *  drawn far to near, so a nearer person's bubble is on top. Each box stands above its person's head, tried at TRIES to clear the balls and the golfers in their swings and the
 *  boxes already placed, and hidden for the frame when it cannot clear a ball or a golfer. screen: a tile point to the overlay's device px; ze: the camera's zoom times dpr;
 *  zoom: the camera's CSS zoom (the fade). Returns the bubbles drawn */
export function drawBubbles(ctx: CanvasRenderingContext2D, list: readonly Bubble[], now: number, zoom: number, ze: number, dpr: number, cw: number, ch: number,
  screen: (x: number, y: number) => { x: number; y: number }, clears: readonly Clear[]): number {
  const za = zoomAlpha(zoom); if (za <= 0.01 || !list.length) return 0;
  // the order: far to near by the anchor's screen y; the hurt first (to be placed first)
  const n = list.length; if (order.length < n) { order = new Array<Bubble>(n); ay = new Array<number>(n); }
  let m = 0;
  for (let i = 0; i < n; i++) {
    const b = list[i]!; if (!b.text) continue;
    const p = screen(b.x, b.y), y = (b.hurt ? -1e9 : 0) + p.y - b.lift * ze; let j = m++;
    while (j > 0 && ay[j - 1]! > y) { order[j] = order[j - 1]!; ay[j] = ay[j - 1]!; j--; }
    order[j] = b; ay[j] = y;
  }
  placed.length = 0; geos.length = 0;
  const scaleZ = 0.85 + 0.35 * Math.min(1, Math.max(0, (zoom - 0.12) / 0.18)), head = Math.max(10 * dpr, 0.9 * HH * 2 * ze) + 3 * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // placing, in order
  for (let q = 0; q < m; q++) {
    const b = order[q]!, pose = bubblePose(b, now), alpha = pose.alpha * za; if (alpha <= 0.01) continue;
    if (!b.lines) { ctx.font = `700 ${FONT_PX}px ${FONT}`; const w = wrap(b.text, s => ctx.measureText(s).width); b.lines = w.lines; b.w = w.w; b.h = w.h; }
    const s = scaleZ * pose.scale * dpr, bw = (b.w! + 2 * PAD_X) * s, bh = (b.h! + 2 * PAD_Y) * s, p = screen(b.x, b.y), ax = p.x, ayy = p.y - b.lift * ze - head;
    if (ax < -bw || ax > cw + bw || ayy < -bh - 60 * dpr || ayy > ch + 40 * dpr) continue;
    const wob = b.style === 'moan' ? Math.sin(now * 24) * 1.1 * dpr : 0, minX = 6 * dpr, maxX = cw - 6 * dpr - bw, bx = Math.min(maxX, Math.max(minX, ax - bw / 2)) + wob;
    if (!place(bx, ayy - TAIL * s - bh, bw, bh, clears, placed, spot, minX, maxX)) continue;
    const g = geos[geos.length] ?? (geos[geos.length] = { b, s, x: 0, y: 0, w: 0, h: 0, ax: 0, ay: 0, alpha: 0 });
    g.b = b; g.s = s; g.x = spot.x; g.y = spot.y; g.w = bw; g.h = bh; g.ax = ax; g.ay = ayy; g.alpha = alpha;
    placed.push({ x0: g.x, y0: g.y, x1: g.x + bw, y1: g.y + bh });
  }
  // drawing: the others in the order they were placed (far to near), the hurt last
  let drawn = 0;
  for (let pass = 0; pass < 2; pass++) for (const g of geos) { if (!!g.b.hurt !== (pass === 1)) continue; paint(ctx, g, now, dpr); drawn++; }
  ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  return drawn;
}

/** one placed bubble: its shadow (to the lower left: the sun is at the upper right), its box or burst or cloud, its tail or its trail of dots, its words */
function paint(ctx: CanvasRenderingContext2D, g: Geo, now: number, dpr: number): void {
  const { b, s, x: bx, y: by, w: bw, h: bh, ax, ay: ayy } = g, look = LOOK[b.style], r = RADIUS * s, tailX = Math.min(bx + bw - r - 5 * s, Math.max(bx + r + 5 * s, ax)), lw = Math.max(1.5 * dpr, 1.8 * s);
  ctx.globalAlpha = g.alpha; ctx.lineWidth = lw;
  for (let pass = 0; pass < 2; pass++) {
    const ox = pass ? 0 : -2.2 * s, oy = pass ? 0 : 2.6 * s, col = pass ? look.fill : 'rgba(40,26,12,0.3)';
    ctx.beginPath();
    if (b.style === 'shout') burst(ctx, bx + ox, by + oy, bw, bh, 6 * s); else roundRect(ctx, bx + ox, by + oy, bw, bh, r);
    ctx.fillStyle = col; ctx.fill(); if (pass) { ctx.strokeStyle = look.line; ctx.stroke(); }
    if (b.style === 'think') continue;
    // the tail: filled over the box's edge across its base (so no line runs through the join), its two slanted edges stroked
    const lx = tailX - 5 * s + ox, rx = tailX + 5 * s + ox, yb = by + bh + oy;
    ctx.beginPath(); ctx.moveTo(lx, yb - lw); ctx.lineTo(lx, yb); ctx.lineTo(ax + ox, ayy + oy); ctx.lineTo(rx, yb); ctx.lineTo(rx, yb - lw); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    if (pass) { ctx.beginPath(); ctx.moveTo(lx, yb); ctx.lineTo(ax, ayy); ctx.lineTo(rx, yb); ctx.strokeStyle = look.line; ctx.stroke(); }
  }
  if (b.style === 'think') {
    // the trail of dots from the cloud down to the head
    const x0 = tailX, y0 = by + bh + 2 * s, dx = ax - x0, dy = ayy - y0;
    for (let k = 0; k < 2; k++) {
      const u = 0.32 + k * 0.4, rr = (3.6 - k * 1.4) * s;
      ctx.beginPath(); ctx.arc(x0 + dx * u, y0 + dy * u, rr, 0, Math.PI * 2); ctx.fillStyle = look.fill; ctx.fill(); ctx.strokeStyle = look.line; ctx.stroke();
    }
  }
  // the words
  ctx.fillStyle = look.ink; ctx.font = `${b.style === 'think' ? 'italic ' : ''}700 ${FONT_PX * s}px ${FONT}`;
  const L = b.lines!, tx = bx + bw / 2, ty = by + PAD_Y * s + LINE_H * s / 2, jit = b.style === 'moan' ? Math.sin(now * 31) * 0.8 * dpr : 0;
  for (let i = 0; i < L.length; i++) ctx.fillText(L[i]!, tx + jit, ty + i * LINE_H * s);
}
