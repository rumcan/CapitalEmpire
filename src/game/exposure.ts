// T261 (#766; the owner, 2026-10-29: "it should also be a filter that increases and decreases exposure and not a flat shape on top that
// changes transparency"): a look's Exposure. The texture's own pixels made darker or lighter, keeping their detail and colour (the standing
// rule: no flat colour washes): its RGB times f, from 0.5 (one stop darker) to 2 (one stop lighter), 1 unchanged. It replaces the old Tone
// (a flat tint laid over the texture with Multiply or Screen at a strength) for a look's fill and its border band alike.
// The save keeps the old fields (PaintArea tone and toneAmt, the border's btone and btoneAmt; the tint is no longer read), so the format does
// not change: tone 0 is none, Darker (1) at strength a is f = 1 - a (at least 0.5), Lighter (2) at a is f = 1 + a.
// Pure maths and two small Canvas 2D helpers (a context passed in): importable from node tests.

/** the exposure's range: one stop darker to one stop lighter */
export const EXPOSURE_MIN = 0.5, EXPOSURE_MAX = 2;
/** closer to 1 than this is no exposure at all (nothing is drawn) */
const NONE = 0.005;
/** the strength of a tone 0 look (paint.ts DEFAULT_STYLE.toneAmt): a look set back to none saves as the default does */
const NONE_AMT = 0.35;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** a look's exposure from its saved tone fields: none 1; Darker at strength a, 1 - a (at least 0.5); Lighter at a, 1 + a (at most 2) */
export function exposureOf(tone: number | undefined, amt: number | undefined): number {
  const a = Number.isFinite(amt) ? clamp(amt!, 0, 1) : 0;
  return tone === 1 ? Math.max(EXPOSURE_MIN, 1 - a) : tone === 2 ? Math.min(EXPOSURE_MAX, 1 + a) : 1;
}
/** whether exposure f changes anything */
export const exposed = (f: number | undefined): f is number => f !== undefined && Number.isFinite(f) && Math.abs(f - 1) >= NONE;
/** the saved tone fields for exposure f (none: tone 0 at the default strength) */
export function toneOfExposure(f: number): { tone: 0 | 1 | 2; toneAmt: number } {
  const v = clamp(Number.isFinite(f) ? f : 1, EXPOSURE_MIN, EXPOSURE_MAX);
  if (!exposed(v)) return { tone: 0, toneAmt: NONE_AMT };
  return v < 1 ? { tone: 1, toneAmt: r3(1 - v) } : { tone: 2, toneAmt: r3(v - 1) };
}
/** the Exposure slider: its position in stops (-1 one stop darker, 0 none, 1 one stop lighter) for exposure f, and back */
export const exposureStops = (f: number): number => Math.log2(clamp(Number.isFinite(f) ? f : 1, EXPOSURE_MIN, EXPOSURE_MAX));
export const exposureAtStops = (s: number): number => 2 ** clamp(Number.isFinite(s) ? s : 0, -1, 1);
/** the exposure in words: "none", "darker 30%" (the texture at 70%), "lighter 20%" (at 120%) */
export function exposureLabel(f: number): string {
  const p = Math.round(Math.abs(f - 1) * 100);
  return !exposed(f) || p === 0 ? 'none' : `${f < 1 ? 'darker' : 'lighter'} ${p}%`;
}
/** the grey a darker exposure multiplies by: rgb(255 f) */
export function exposureGrey(f: number): string { const v = Math.round(255 * clamp(f, EXPOSURE_MIN, 1)); return `rgb(${v},${v},${v})`; }

/** a Canvas 2D context, the DOM's or a worker's */
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
/** exposure f over what `draw` lays (a fill or a stroke of the current path or shape), at alpha k (a feather's step): darker, `draw` again in
 *  the grey of f multiplied; lighter, `draw` again in `paint` (the texture it just laid) added to itself ('lighter') at alpha (f - 1) k, so
 *  the texture's own pixels come out times f. The context's composite, alpha and styles are left as they were */
export function exposeDraw(g: Ctx, f: number | undefined, paint: string | CanvasGradient | CanvasPattern, draw: () => void, k = 1): void {
  if (!exposed(f) || !(k > 0)) return;
  const op = g.globalCompositeOperation, al = g.globalAlpha, fs = g.fillStyle, ss = g.strokeStyle;
  if (f < 1) { g.globalCompositeOperation = 'multiply'; g.globalAlpha = Math.min(1, k); g.fillStyle = g.strokeStyle = exposureGrey(f); }
  else { g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, (Math.min(f, EXPOSURE_MAX) - 1) * k); g.fillStyle = g.strokeStyle = paint; }
  draw();
  g.globalCompositeOperation = op; g.globalAlpha = al; g.fillStyle = fs; g.strokeStyle = ss;
}
/** exposure f on what is already drawn inside g's clip over the box x0, y0 to x1, y1 (g's user space; an opaque fill: a course surface's,
 *  a painted area's, its blend included): darker, the grey of f multiplied over the box; lighter, the canvas's own pixels under the box drawn
 *  onto themselves ('lighter' at alpha f - 1), so each comes out times f. The clip keeps it inside the shape */
export function exposeClip(g: Ctx, f: number | undefined, x0: number, y0: number, x1: number, y1: number): void {
  if (!exposed(f) || !(x1 > x0) || !(y1 > y0)) return;
  g.save();
  if (f < 1) { g.globalCompositeOperation = 'multiply'; g.globalAlpha = 1; g.fillStyle = exposureGrey(f); g.fillRect(x0, y0, x1 - x0, y1 - y0); }
  else {
    // the box's corners on the canvas (device px), grown to whole px and kept on the canvas
    const m = g.getTransform(), c = g.canvas, W = c.width, H = c.height;
    let a = Infinity, b = Infinity, p = -Infinity, q = -Infinity;
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]] as const) { const X = m.a * x + m.c * y + m.e, Y = m.b * x + m.d * y + m.f; a = Math.min(a, X); p = Math.max(p, X); b = Math.min(b, Y); q = Math.max(q, Y); }
    const sx = Math.max(0, Math.floor(a)), sy = Math.max(0, Math.floor(b)), sw = Math.min(W, Math.ceil(p)) - sx, sh = Math.min(H, Math.ceil(q)) - sy;
    if (sw > 0 && sh > 0) {
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, Math.min(f, EXPOSURE_MAX) - 1);
      g.drawImage(c, sx, sy, sw, sh, sx, sy, sw, sh);
    }
  }
  g.restore();
}
