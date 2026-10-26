// The overlay of the bay rows' lots and the on-street runs (docs/PARKING.md sections 1 and 2): each built park's entrance as an amber dot and its label
// P · parked/bays, and a lot with no road in reach outlined red. Drawn over the baked ground (Game.drawParks).
import type { CarPark, ParkView } from './event/carpark';
import { LOT_ID0, rowLots, rowQuad, type BayRowDef } from './event/rows';
import { PRI } from './label-place';
import { LABEL_OUTLINE, type WorldLabels } from './world-labels';

/** what the overlay needs from the engine: the canvas, the device pixel ratio, the iso transform and the tile → css px mapping */
export interface ParkOverlayView {
  ctx: CanvasRenderingContext2D;
  dpr: number;
  setIso(c: CanvasRenderingContext2D): void;
  screen(x: number, y: number): { x: number; y: number };
  /** the frame's world labels (T151): the labels go there, placed with the map's others; without it they are written at once */
  labels?: WorldLabels;
}
/** a lot with no road's label key (a number past the engine's own kinds, by its lowest row's id) */
const NO_ROAD_KEY = 7e6;

/** a label at css px c: bold text with a dark outline, centred (the car parks' style); a world label (key, priority) when the view has them */
function label(v: ParkOverlayView, key: unknown, pri: number, text: string, x: number, y: number, col: string) {
  const ctx = v.ctx, dpr = v.dpr, font = `bold ${12 * dpr}px ui-sans-serif, system-ui, sans-serif`;
  if (v.labels) { v.labels.text(key, pri, text, x, y, font, 12 * dpr, col, LABEL_OUTLINE, 3 * dpr); return; }
  ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = 3 * dpr; ctx.strokeStyle = LABEL_OUTLINE; ctx.strokeText(text, x, y);
  ctx.fillStyle = col; ctx.fillText(text, x, y);
  ctx.lineJoin = 'miter'; ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}

/** the rows' and runs' overlay: for each park with a view, its entrances as amber dots and the label P · parked/bays (at the entrance of an on-street run,
 *  at the mean of the bays of a lot); then each lot of rows with no road in reach (no extra park with its id, LOT_ID0 + its lowest row id) outlined red */
export function drawParkingOverlay(v: ParkOverlayView, parks: CarPark[], views: ParkView[], rows: BayRowDef[]) {
  const ctx = v.ctx, dpr = v.dpr;
  for (const p of parks) {
    const view = views.find(q => q.id === p.id);
    if (!view) continue;
    for (const e of p.entrances) {
      const b = v.screen(e.x, e.y);
      ctx.beginPath(); ctx.arc(b.x, b.y, 4 * dpr, 0, Math.PI * 2); ctx.fillStyle = '#ffbe3c'; ctx.fill();
    }
    let x = 0, y = 0;
    if (p.curb) { const e = p.entrances[0]; if (!e) continue; x = e.x; y = e.y; }
    else {
      if (!p.bays.length) continue;
      for (const b of p.bays) { x += b.x; y += b.y; }
      x /= p.bays.length; y /= p.bays.length;
    }
    const c = v.screen(x, y);
    label(v, p, PRI.count, `P · ${view.parked}/${view.bays}`, c.x, c.y, '#f8fafc');
  }
  const have = new Set(parks.map(p => p.id));
  for (const rs of rowLots(rows)) {
    if (have.has(LOT_ID0 + rs[0]!.id)) continue;
    let x = 0, y = 0;
    v.setIso(ctx); ctx.beginPath();
    for (const r of rs) {
      const q = rowQuad(r);
      ctx.moveTo(q[0]!, q[1]!); for (let i = 2; i + 1 < q.length; i += 2) ctx.lineTo(q[i]!, q[i + 1]!); ctx.closePath();
      x += (r.ax + r.bx) / 2; y += (r.ay + r.by) / 2;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.strokeStyle = '#f87171'; ctx.lineWidth = 2 * dpr; ctx.stroke();
    const c = v.screen(x / rs.length, y / rs.length);
    label(v, NO_ROAD_KEY + rs[0]!.id, PRI.warn, 'no road within 48 m', c.x, c.y, '#fecaca');
  }
}
