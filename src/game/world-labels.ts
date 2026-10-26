// The frame's world labels (T151, #322): the engine's overlay collects every label of the map here instead of writing it at once (the business
// names, the car parks' "P · n/N", the stand-in pills, the counts, the town names, the range's markers), then places them in one pass
// (label-place.ts: by priority, none overlapping, stable across frames) and writes the placed ones. The money floats are drawn after, clear of them.
// No allocation a frame once warm: the labels are pooled and the text widths cached by font.
import { LabelPlacer, type PlaceLabel } from './label-place';

/** one label and how it is written: its text (and an optional second piece in another colour on the line, and a line under it), font, colours,
 *  an optional dark outline and an optional rounded plate behind it */
export interface WorldLabel extends PlaceLabel {
  text: string; font: string; fill: string;
  /** the outline ('' none) and its width (canvas px) */
  stroke: string; lw: number;
  /** the plate ('' none) and its corner radius */
  bg: string; radius: number;
  /** the text's offset from the box's centre (canvas px, + down) */
  ty: number;
  /** a second piece after the text in its own colour ('' none), and both pieces' widths */
  text2: string; fill2: string; w1: number; w2: number;
  /** a line under the text ('' none): its font, colour and offset from the box's centre */
  sub: string; subFont: string; subFill: string; subDy: number;
  alpha: number;
}

/** the outline the map's labels share */
export const LABEL_OUTLINE = 'rgba(2,6,23,0.9)';

export class WorldLabels {
  readonly placer = new LabelPlacer();
  /** the pool; this frame's labels are list[0..n) */
  readonly list: WorldLabel[] = [];
  n = 0;
  /** the labels shown by the last place */
  shown = 0;
  private ctx: CanvasRenderingContext2D | null = null;
  private widths = new Map<string, Map<string, number>>();

  /** a new frame on ctx (the overlay): no labels yet */
  begin(ctx: CanvasRenderingContext2D, dpr = 1): void { this.ctx = ctx; this.n = 0; this.placer.gap = 2 * dpr; }

  /** text's width in font (canvas px), measured once and cached */
  width(font: string, text: string): number {
    let m = this.widths.get(font);
    if (!m) { m = new Map(); this.widths.set(font, m); }
    let w = m.get(text);
    if (w === undefined) {
      const c = this.ctx; if (!c) return 0;
      if (m.size > 2048) m.clear();
      c.font = font; w = c.measureText(text).width; m.set(text, w);
    }
    return w;
  }

  /** a label of this frame (pooled, plain): key and priority, its box (centre and size, canvas px); the caller sets how it is written */
  add(key: unknown, pri: number, x: number, y: number, w: number, h: number): WorldLabel {
    let l = this.list[this.n];
    if (!l) {
      l = { key, pri, x, y, w, h, px: x, py: y, shown: false, text: '', font: '', fill: '', stroke: '', lw: 0, bg: '', radius: 0, ty: 0, text2: '', fill2: '', w1: 0, w2: 0, sub: '', subFont: '', subFill: '', subDy: 0, alpha: 1 };
      this.list.push(l);
    }
    l.key = key; l.pri = pri; l.x = x; l.y = y; l.w = w; l.h = h; l.px = x; l.py = y; l.shown = false;
    l.text = ''; l.font = ''; l.fill = ''; l.stroke = ''; l.lw = 0; l.bg = ''; l.radius = 0; l.ty = 0; l.text2 = ''; l.fill2 = ''; l.w1 = 0; l.w2 = 0;
    l.sub = ''; l.subFont = ''; l.subFill = ''; l.subDy = 0; l.alpha = 1; this.n++;
    return l;
  }

  /** text centred on (x, y) in font (px tall) with a dark outline lw wide (0: none): the car parks' and the businesses' style */
  text(key: unknown, pri: number, text: string, x: number, y: number, font: string, px: number, fill: string, stroke = LABEL_OUTLINE, lw = 0): WorldLabel {
    const w = this.width(font, text), l = this.add(key, pri, x, y, w + lw, px + lw);
    l.text = text; l.font = font; l.fill = fill; l.stroke = lw > 0 ? stroke : ''; l.lw = lw; l.w1 = w;
    return l;
  }
  /** text on a rounded plate (w x h, corner radius) centred on (x, y): the stand-in pills and the range's markers; ty nudges the text */
  pill(key: unknown, pri: number, text: string, x: number, y: number, font: string, w: number, h: number, bg: string, radius: number, fill: string, ty = 0): WorldLabel {
    const l = this.add(key, pri, x, y, w, h);
    l.text = text; l.font = font; l.fill = fill; l.bg = bg; l.radius = radius; l.ty = ty;
    return l;
  }
  /** two pieces on one line in their own colours ("+3" green, " −1" red), centred on (x, y), outlined */
  pair(key: unknown, pri: number, a: string, fa: string, b: string, fb: string, x: number, y: number, font: string, px: number, stroke: string, lw: number): WorldLabel {
    const wa = a ? this.width(font, a) : 0, wb = b ? this.width(font, b) : 0, l = this.add(key, pri, x, y, wa + wb + lw, px + lw);
    l.text = a; l.fill = fa; l.text2 = b; l.fill2 = fb; l.w1 = wa; l.w2 = wb; l.font = font; l.stroke = stroke; l.lw = lw;
    return l;
  }

  /** places this frame's labels in the view (canvas px w x h); the number shown */
  place(w: number, h: number): number { return (this.shown = this.placer.place(this.list, this.n, 0, 0, w, h)); }

  /** writes the placed labels (in the order they came: the font set only when it changes) */
  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.n) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    let font = '', alpha = 1;
    for (let i = 0; i < this.n; i++) {
      const l = this.list[i]!; if (!l.shown) continue;
      if (l.alpha !== alpha) { alpha = l.alpha; ctx.globalAlpha = alpha; }
      if (l.bg) { ctx.fillStyle = l.bg; ctx.beginPath(); ctx.roundRect(l.px - l.w / 2, l.py - l.h / 2, l.w, l.h, l.radius); ctx.fill(); }
      if (l.font !== font) { font = l.font; ctx.font = font; }
      const y = l.py + l.ty;
      if (l.text2) {
        // two pieces: each centred on its own width, the pair centred on the label
        const x0 = l.px - (l.w1 + l.w2) / 2;
        if (l.text) this.write(ctx, l, l.text, x0 + l.w1 / 2, y, l.fill);
        this.write(ctx, l, l.text2, x0 + l.w1 + l.w2 / 2, y, l.fill2);
      } else this.write(ctx, l, l.text, l.px, y, l.fill);
      if (l.sub) { font = l.subFont; ctx.font = font; this.write(ctx, l, l.sub, l.px, l.py + l.subDy, l.subFill); }
    }
    ctx.restore();
  }
  private write(ctx: CanvasRenderingContext2D, l: WorldLabel, t: string, x: number, y: number, fill: string): void {
    if (l.lw > 0) { ctx.lineWidth = l.lw; ctx.strokeStyle = l.stroke; ctx.strokeText(t, x, y); }
    ctx.fillStyle = fill; ctx.fillText(t, x, y);
  }
}
