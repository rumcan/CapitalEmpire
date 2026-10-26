// World labels never overlap (T151, #322). The lead (2026-10-26): "the engine's world labels (building/business names, "P · n/N", "Stand In
// for ...", gallery counts, town names) go through one placement pass each frame: by priority (the business's own name and counts first,
// stand-in labels last), each label takes its anchor if free, else the nearest free slot just above or below within a small radius, else it is
// hidden at that zoom (and shown again when there is room). Stable: a label does not jump between slots frame to frame (keep last frame's slot
// while it stays free). Money floats keep their own columns and are placed after the labels, avoiding them."
//
// Pure (no canvas): the engine collects the frame's labels (world-labels.ts), this places them, the engine draws the placed ones. Boxes are in
// canvas px, centred on the label's point. The placed boxes are kept in horizontal bands so a test looks at the few boxes near it.

/** a label to place: its identity across frames, its priority, its anchor (the box's centre where it wants to be) and its box; out: where it
 *  is drawn (its box's centre) and whether it is drawn at all */
export interface PlaceLabel {
  /** the same thing each frame (an object, a number or a string): its slot is remembered by it */
  key: unknown;
  /** higher is placed first (PRI) */
  pri: number;
  x: number; y: number; w: number; h: number;
  px: number; py: number; shown: boolean;
}

/** the priorities: a tool's hint at the cursor over all, the business's own name (and the town names), the counts (P · n/N, n watching, TOLL),
 *  a warning, the range's distance markers, an area's label, the growth figures, and the stand-in pills last (they give way to real names) */
export const PRI = { hint: 200, name: 100, count: 90, warn: 80, marker: 70, area: 60, growth: 50, standIn: 10 } as const;

/** what a label remembers between frames: its slot (px off its anchor, + down), the frame it was last placed in, whether it was shown, and how
 *  many frames running its anchor has been free while it sat off it */
interface Memo { dy: number; frame: number; shown: boolean; home: number }

/** the placement pass, kept across frames (its memo is what keeps the labels still) */
export class LabelPlacer {
  /** the clear space kept between two labels (canvas px) */
  gap = 2;
  /** how far a label may move off its anchor, in its own heights */
  reach = 3;
  /** a label off its anchor goes back once its anchor has been free this many frames running */
  homeFrames = 20;
  /** the frame count (one per place) */
  frame = 0;
  /** this frame's placed boxes: x0, y0, x1, y1 each */
  box = new Float64Array(4 * 128);
  /** the number of placed boxes */
  n = 0;
  private memo = new Map<unknown, Memo>();
  private memos: (Memo | undefined)[] = [];
  private order: number[] = [];
  private pri = new Float64Array(128);
  private was = new Uint8Array(128);
  private bands: number[][] = [];
  private bandY0 = 0;
  private static readonly BAND = 32;
  private readonly byRank = (a: number, b: number): number => (this.pri[b]! - this.pri[a]!) || (this.was[b]! - this.was[a]!) || (a - b);

  /** places labels[0..count) in the view (x0, y0)-(x1, y1) (canvas px): a label wholly outside it is not shown and keeps its memory. Returns the
   *  number shown */
  place(labels: readonly PlaceLabel[], count: number, x0: number, y0: number, x1: number, y1: number): number {
    const f = ++this.frame;
    this.n = 0; this.resetBands(y0, y1);
    if (this.pri.length < count) { this.pri = new Float64Array(count * 2); this.was = new Uint8Array(count * 2); }
    const order = this.order; order.length = count;
    for (let i = 0; i < count; i++) {
      const l = labels[i]!, m = this.memo.get(l.key);
      this.memos[i] = m; this.pri[i] = l.pri; this.was[i] = m && m.shown && m.frame === f - 1 ? 1 : 0; order[i] = i;
    }
    this.memos.length = count;
    // by priority; between equals the one shown last frame first (so two equals never swap), then the order they came in
    order.sort(this.byRank);
    let shown = 0;
    for (let k = 0; k < count; k++) {
      const i = order[k]!, l = labels[i]!; l.shown = false;
      if (l.x + l.w / 2 < x0 || l.x - l.w / 2 > x1 || l.y + l.h / 2 < y0 || l.y - l.h / 2 > y1) continue;
      let m = this.memos[i] ?? this.memo.get(l.key);
      if (!m) { m = { dy: 0, frame: 0, shown: false, home: 0 }; this.memo.set(l.key, m); }
      if (m.frame === f) continue; // the same thing twice this frame: the first one stands
      const radius = this.reach * l.h, kept = m.shown && m.frame === f - 1;
      let dy = NaN;
      // keep last frame's slot while it stays free; back to the anchor once that has been free a while
      if (kept && m.dy !== 0 && Math.abs(m.dy) <= radius && this.free(l, m.dy)) {
        dy = m.dy;
        if (this.free(l, 0)) { if (++m.home >= this.homeFrames) { dy = 0; m.home = 0; } } else m.home = 0;
      } else { m.home = 0; dy = this.search(l, radius); }
      m.frame = f;
      if (Number.isNaN(dy)) { m.shown = false; m.dy = 0; continue; }
      m.dy = dy; m.shown = true; l.shown = true; l.px = l.x; l.py = l.y + dy; shown++;
      this.add(l.px - l.w / 2, l.py - l.h / 2, l.px + l.w / 2, l.py + l.h / 2);
    }
    if ((f & 255) === 0) for (const [key, m] of this.memo) if (m.frame < f - 255) this.memo.delete(key);
    return shown;
  }

  /** the index of a placed box within the gap of (x0, y0)-(x1, y1), or -1 */
  hit(x0: number, y0: number, x1: number, y1: number): number {
    const g = this.gap, B = this.box, bands = this.bands, b0 = this.bandOf(y0 - g), b1 = this.bandOf(y1 + g);
    for (let b = b0; b <= b1; b++) {
      const band = bands[b]!;
      for (let k = 0; k < band.length; k++) {
        const j = band[k]!, o = 4 * j;
        if (x0 < B[o + 2]! + g && x1 > B[o]! - g && y0 < B[o + 3]! + g && y1 > B[o + 1]! - g) return j;
      }
    }
    return -1;
  }
  /** how far up (px, <= 0) the box (x0, y0)-(x1, y1) must move to clear the placed labels: 0 if it is clear; else just above the ones it meets,
   *  climbing over each in turn; NaN past max px */
  clearUp(x0: number, y0: number, x1: number, y1: number, max: number): number {
    let dy = 0;
    for (let k = 0; k < 32; k++) {
      const j = this.hit(x0, y0 + dy, x1, y1 + dy); if (j < 0) return dy;
      dy = this.box[4 * j + 1]! - this.gap - y1;
      if (-dy > max) return NaN;
    }
    return NaN;
  }

  /** whether label l is clear of the placed boxes dy px off its anchor */
  private free(l: PlaceLabel, dy: number): boolean { return this.hit(l.x - l.w / 2, l.y + dy - l.h / 2, l.x + l.w / 2, l.y + dy + l.h / 2) < 0; }
  /** the anchor if free, else the nearest free slot above or below it within radius (above on a tie), else NaN. Upwards: just above the box in
   *  the way, again until clear (each step only passes boxes that are in the way, so the first clear one is the nearest) */
  private search(l: PlaceLabel, radius: number): number {
    const hw = l.w / 2, hh = l.h / 2, B = this.box, g = this.gap;
    let up = 0, upOk = false;
    for (let k = 0; k < 32; k++) {
      const j = this.hit(l.x - hw, l.y + up - hh, l.x + hw, l.y + up + hh); if (j < 0) { upOk = true; break; }
      up = B[4 * j + 1]! - g - hh - l.y; if (-up > radius) break;
    }
    if (upOk && up === 0) return 0;
    let down = 0, downOk = false;
    for (let k = 0; k < 32; k++) {
      const j = this.hit(l.x - hw, l.y + down - hh, l.x + hw, l.y + down + hh); if (j < 0) { downOk = true; break; }
      down = B[4 * j + 3]! + g + hh - l.y; if (down > radius) break;
    }
    if (upOk && (!downOk || -up <= down)) return up;
    return downOk ? down : NaN;
  }
  private add(x0: number, y0: number, x1: number, y1: number): void {
    const j = this.n++;
    if (4 * this.n > this.box.length) { const b = new Float64Array(this.box.length * 2); b.set(this.box); this.box = b; }
    const B = this.box, o = 4 * j; B[o] = x0; B[o + 1] = y0; B[o + 2] = x1; B[o + 3] = y1;
    const b1 = this.bandOf(y1); for (let b = this.bandOf(y0); b <= b1; b++) this.bands[b]!.push(j);
  }
  /** the bands cover the view and a margin above and below it; a box beyond them is filed in the end band (both the boxes and the tests are
   *  clamped, so a box and a test that meet always share a band) */
  private resetBands(y0: number, y1: number): void {
    const M = 512, n = Math.max(1, Math.ceil((y1 - y0 + 2 * M) / LabelPlacer.BAND));
    this.bandY0 = y0 - M;
    while (this.bands.length < n) this.bands.push([]);
    for (const b of this.bands) b.length = 0;
    this.bands.length = n;
  }
  private bandOf(y: number): number {
    const b = Math.floor((y - this.bandY0) / LabelPlacer.BAND);
    return b < 0 ? 0 : b >= this.bands.length ? this.bands.length - 1 : b;
  }
}

/** the money floats' columns (T147) after the labels: each column (the floats over one point) moves up as one, just clear of the placed labels in
 *  its way over its whole rise; a column keeps last frame's lift while that stays clear, so its floats never jump */
export class ColumnPlacer {
  private kx: number[] = []; private ky: number[] = []; private dy: number[] = []; private seen: number[] = [];
  private frame = 0;
  /** once a frame, before the columns: the columns not seen last frame are forgotten */
  begin(): void {
    const f = ++this.frame; let k = 0;
    for (let i = 0; i < this.kx.length; i++) if (this.seen[i]! >= f - 1) { this.kx[k] = this.kx[i]!; this.ky[k] = this.ky[i]!; this.dy[k] = this.dy[i]!; this.seen[k] = this.seen[i]!; k++; }
    this.kx.length = this.ky.length = this.dy.length = this.seen.length = k;
  }
  /** the lift (px, <= 0) of the column at point (kx, ky) (its key: the floats' own point) whose whole rise is the box (x0, y0)-(x1, y1): 0 if no
   *  label is in its way; at most max px (past that it stays at its point) */
  lift(placer: LabelPlacer, kx: number, ky: number, x0: number, y0: number, x1: number, y1: number, max: number): number {
    const f = this.frame;
    let i = 0; while (i < this.kx.length && (this.kx[i] !== kx || this.ky[i] !== ky)) i++;
    if (i < this.kx.length) {
      if (this.seen[i] === f) return this.dy[i]!;
      const d = this.dy[i]!;
      if (placer.hit(x0, y0 + d, x1, y1 + d) < 0) { this.seen[i] = f; return d; }
    } else { this.kx.push(kx); this.ky.push(ky); this.dy.push(0); this.seen.push(f); }
    const d = placer.clearUp(x0, y0, x1, y1, max), v = Number.isNaN(d) ? 0 : d;
    this.dy[i] = v; this.seen[i] = f; return v;
  }
}
