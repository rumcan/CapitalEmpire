// T237 (#694): the walking distance shown while a car park is placed (golf/walkserve.ts). Round each venue (the range, the clubhouse, the first
// tee, the practice area, a tournament's gates) a ring of WALK_SERVE_M on the ground with the venue's name at its door; from the car park a line
// to each venue it would serve, labelled with the walk; and under the pointer's hint the verdict: "Serves: Range (40 m walk), ..." or, in red,
// "Too far to walk to anything". Drawn on the overlay canvas: no state.
import type { Pt } from './network';
import { VENUE_NAME, WALK_SERVE_TILES, serveLine, type Serve, type Venue } from './golf/walkserve';

/** what the overlay needs from the engine: the canvas, its device pixel ratio, a tile's point on screen (device px) and the iso transform (tiles
 *  to device px, for the rings) */
export interface ServeView { ctx: CanvasRenderingContext2D; dpr: number; screen(x: number, y: number): Pt; setIso(ctx: CanvasRenderingContext2D): void }

/** the colours: a ring and line of a served venue, a ring out of reach, the verdict's good and bad ink, the outline */
export const SERVE_STYLE = { on: '#4ade80', onFill: 'rgba(74, 222, 128, 0.07)', off: 'rgba(203, 213, 225, 0.55)', good: '#bbf7d0', bad: '#fca5a5', outline: 'rgba(15, 23, 42, 0.9)' } as const;

/** text with the hint's outline, left, centre or right of (x, y) (device px) */
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, dpr: number, ink: string, align: CanvasTextAlign = 'center', px = 12) {
  ctx.font = `bold ${px * dpr}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = 3 * dpr; ctx.strokeStyle = SERVE_STYLE.outline; ctx.strokeText(text, x, y);
  ctx.fillStyle = ink; ctx.fillText(text, x, y);
  ctx.lineJoin = 'miter'; ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}

/** the walking-distance preview: venues' rings (the served ones green), a line from the car park (from: its point nearest a door) to each served
 *  venue with its walk, and the verdict under the pointer (mx, my: CSS px; the hint stands at its right, this a line below it; mx NaN: the rings
 *  alone, as the Car park tool shows them before a drag) */
export function drawServePreview(v: ServeView, venues: readonly Venue[], serves: readonly Serve[], from: (door: Pt) => Pt, mx: number, my: number): void {
  const { ctx, dpr } = v;
  // the rings: one per venue, a dashed ellipse on the ground (the iso transform), its stroke in device px
  for (const ve of venues) {
    const served = serves.some(s => s.venue.id === ve.id);
    v.setIso(ctx); ctx.beginPath(); ctx.arc(ve.door.x, ve.door.y, WALK_SERVE_TILES, 0, Math.PI * 2); ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (served) { ctx.fillStyle = SERVE_STYLE.onFill; ctx.fill(); }
    ctx.strokeStyle = served ? SERVE_STYLE.on : SERVE_STYLE.off; ctx.lineWidth = (served ? 2 : 1.25) * dpr; ctx.setLineDash([7 * dpr, 5 * dpr]); ctx.stroke(); ctx.setLineDash([]);
    const d = v.screen(ve.door.x, ve.door.y);
    ctx.beginPath(); ctx.arc(d.x, d.y, 4 * dpr, 0, Math.PI * 2); ctx.fillStyle = served ? SERVE_STYLE.on : SERVE_STYLE.off; ctx.fill();
    label(ctx, VENUE_NAME[ve.id], d.x, d.y - 12 * dpr, dpr, served ? SERVE_STYLE.good : '#e2e8f0', 'center', 11);
  }
  // the serve lines: from the car park's nearest point to each served venue's door, the walk at the middle
  for (const s of serves) {
    const a0 = from(s.venue.door), a = v.screen(a0.x, a0.y), b = v.screen(s.venue.door.x, s.venue.door.y);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = SERVE_STYLE.outline; ctx.lineWidth = 5 * dpr; ctx.stroke();
    ctx.strokeStyle = SERVE_STYLE.on; ctx.lineWidth = 2.5 * dpr; ctx.stroke();
    label(ctx, `${VENUE_NAME[s.venue.id]} · ${s.m} m walk`, (a.x + b.x) / 2, (a.y + b.y) / 2, dpr, SERVE_STYLE.good, 'center', 11);
  }
  // the verdict, a line under the pointer's hint (none before a car park is dragged out: only the rings)
  if (Number.isFinite(mx)) label(ctx, serveLine(serves), mx * dpr + 14 * dpr, my * dpr + 6 * dpr, dpr, serves.length ? SERVE_STYLE.good : SERVE_STYLE.bad, 'left');
}
