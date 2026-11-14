// J10 (#1269; the owner, 2026-11-14: "the show me button should show you whatever you need to see an cover the reset with a blur mast or somthing so it is
// CLEAR what you are showing"): the one spotlight every Show me uses (Spotlight.tsx draws it). This file is the pure part, no DOM: the cut-out's box from
// a target's box (padded, rounded, held on the screen), the clip path that cuts it out of the dimmed layer, where the caption stands beside it (it flips sides
// near an edge and never covers a cut-out), the caption's one line from a step's body, and the tiny store the Show me buttons write to.

/** a box in window css px */
export interface Box { x: number; y: number; w: number; h: number }
export interface Size { w: number; h: number }
/** a place on the map as tiles x0 y0 x1 y1 (tile coordinates, as Engine.lookAt takes them) */
export type TileRect = readonly [number, number, number, number];

/** what a spotlight can show: a control by its data-guide anchor (GuidePulse.tsx anchorElement, with its fallbacks), the control the engine pulsed for
 *  this Show me (pulse: the anchor to use when it pulsed none, or null), or a place on the map */
export type SpotTarget = { ui: string } | { pulse: string | null } | { tiles: TileRect };
/** one Show me: the caption's title and line, and what it lights (the first target is the one the caption stands beside) */
export interface SpotRequest { title: string; line: string; targets: readonly SpotTarget[] }

/** css px of air between a target and its ring */
export const HOLE_PAD = 8;
/** the smallest a cut-out is, so a tiny target still shows */
export const HOLE_MIN_W = 56, HOLE_MIN_H = 40;
/** how far from the window's edge a cut-out's ring may stand */
export const SCREEN_INSET = 3;

/** a cut-out: a rounded box in window css px */
export interface Hole extends Box { r: number }

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
const finite = (...v: number[]) => v.every(Number.isFinite);

/**
 * the cut-out for a target's box: padded a little, never smaller than a finger's worth, held inside the window (a target at the edge or half off it
 * keeps its ring on screen), rounded like the thing it shows (radius: the target's own corner radius, plus the padding; a round thing gets a round
 * hole). null when the target is not on the screen at all
 */
export function holeOf(t: Box, o: { screen: Size; radius?: number; pad?: number }): Hole | null {
  const S = o.screen, pad = o.pad ?? HOLE_PAD;
  if (!finite(t.x, t.y, t.w, t.h, S.w, S.h) || t.w <= 0 || t.h <= 0 || S.w <= 0 || S.h <= 0) return null;
  if (t.x + t.w <= 0 || t.y + t.h <= 0 || t.x >= S.w || t.y >= S.h) return null; // wholly off the window (not even a sliver of it shows)
  let x0 = t.x - pad, y0 = t.y - pad, x1 = t.x + t.w + pad, y1 = t.y + t.h + pad;
  const gw = HOLE_MIN_W - (x1 - x0), gh = HOLE_MIN_H - (y1 - y0);
  if (gw > 0) { x0 -= gw / 2; x1 += gw / 2; }
  if (gh > 0) { y0 -= gh / 2; y1 += gh / 2; }
  x0 = Math.max(x0, SCREEN_INSET); y0 = Math.max(y0, SCREEN_INSET); x1 = Math.min(x1, S.w - SCREEN_INSET); y1 = Math.min(y1, S.h - SCREEN_INSET);
  if (x1 - x0 < 4 || y1 - y0 < 4) return null;
  const w = x1 - x0, h = y1 - y0;
  return { x: x0, y: y0, w, h, r: clamp((o.radius ?? 10) + pad, 0, Math.min(w, h) / 2) };
}

/** whether two boxes touch or lie within pad px of each other */
export const near = (a: Box, b: Box, pad = 0): boolean => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;

/** holes that touch become one (their box together): two cut-outs side by side would leave a dimmed seam, and an overlap would dim itself under
 *  the even-odd cut. The first hole stays first (it is the one the caption stands beside) */
export function mergeHoles(holes: readonly Hole[]): Hole[] {
  const out = holes.map(h => ({ ...h }));
  for (let again = true; again;) {
    again = false;
    for (let i = 0; i < out.length && !again; i++) {
      for (let j = i + 1; j < out.length && !again; j++) {
        const a = out[i]!, b = out[j]!;
        if (!near(a, b, 6)) continue;
        const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), x1 = Math.max(a.x + a.w, b.x + b.w), y1 = Math.max(a.y + a.h, b.y + b.h);
        out[i] = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, r: Math.min(Math.max(a.r, b.r), (x1 - x0) / 2, (y1 - y0) / 2) };
        out.splice(j, 1); again = true;
      }
    }
  }
  return out;
}

const num = (v: number) => String(Math.round(v * 10) / 10);
/** the CSS clip-path that keeps the whole window and cuts the holes out of it: path(evenodd, ...) in window px (the layer fills the window) */
export function holePath(holes: readonly Hole[], S: Size): string {
  let d = `M0 0H${num(S.w)}V${num(S.h)}H0Z`;
  for (const { x, y, w, h, r } of holes) {
    const R = num(r);
    d += `M${num(x + r)} ${num(y)}H${num(x + w - r)}A${R} ${R} 0 0 1 ${num(x + w)} ${num(y + r)}V${num(y + h - r)}A${R} ${R} 0 0 1 ${num(x + w - r)} ${num(y + h)}`
      + `H${num(x + r)}A${R} ${R} 0 0 1 ${num(x)} ${num(y + h - r)}V${num(y + r)}A${R} ${R} 0 0 1 ${num(x + r)} ${num(y)}Z`;
  }
  return `path(evenodd, "${d}")`;
}

/** whether two lists of holes are the same to within eps px (the tracker writes the layer only when a hole has moved) */
export function sameHoles(a: readonly Hole[], b: readonly Hole[], eps = 0.5): boolean {
  return a.length === b.length && a.every((h, i) => { const k = b[i]!; return Math.abs(h.x - k.x) <= eps && Math.abs(h.y - k.y) <= eps && Math.abs(h.w - k.w) <= eps && Math.abs(h.h - k.h) <= eps && Math.abs(h.r - k.r) <= eps; });
}

export type Side = 'right' | 'left' | 'below' | 'above';
/** where the caption stands: its side of the first hole, its top left, how far along the edge facing the hole its arrow stands, and whether it is clear of
 *  every hole (false only when no side had room: it is then held on the screen, touching a hole) */
export interface Placement { side: Side; x: number; y: number; arrow: number; clear: boolean }
/** the gap between a hole and its caption (the arrow stands in it), the caption's least distance from the window's edge, and how near the caption's
 *  corners its arrow may stand */
export const CAP_GAP = 20, CAP_MARGIN = 12, ARROW_EDGE = 22;

/**
 * where a caption of size cap stands beside the first of the holes in a window of size S. A side is used when the caption fits there whole, inside the
 * window's margin and clear of every hole; sides are tried roomiest first, the vertical pair before the horizontal one for a wide, flat target (a top-bar
 * chip) and the other way round for a tall or square one (a rail button), so near an edge it flips to the side that has room
 */
export function placeCaption(holes: readonly Hole[], cap: Size, S: Size, o: { gap?: number; margin?: number } = {}): Placement {
  const gap = o.gap ?? CAP_GAP, m = o.margin ?? CAP_MARGIN, H = holes[0];
  const fitX = (v: number) => clamp(v, m, S.w - m - cap.w), fitY = (v: number) => clamp(v, m, S.h - m - cap.h);
  if (!H) return { side: 'below', x: fitX((S.w - cap.w) / 2), y: fitY((S.h - cap.h) / 2), arrow: 0, clear: true };
  const cx = H.x + H.w / 2, cy = H.y + H.h / 2;
  const space: Record<Side, number> = { right: S.w - (H.x + H.w), left: H.x, below: S.h - (H.y + H.h), above: H.y };
  const horiz: Side[] = space.right >= space.left ? ['right', 'left'] : ['left', 'right'];
  const vert: Side[] = space.below >= space.above ? ['below', 'above'] : ['above', 'below'];
  const order = H.w >= H.h * 1.6 ? [...vert, ...horiz] : [...horiz, ...vert];
  const at = (side: Side): Box => {
    switch (side) {
      case 'right': return { x: H.x + H.w + gap, y: fitY(cy - cap.h / 2), w: cap.w, h: cap.h };
      case 'left': return { x: H.x - gap - cap.w, y: fitY(cy - cap.h / 2), w: cap.w, h: cap.h };
      case 'below': return { x: fitX(cx - cap.w / 2), y: H.y + H.h + gap, w: cap.w, h: cap.h };
      case 'above': return { x: fitX(cx - cap.w / 2), y: H.y - gap - cap.h, w: cap.w, h: cap.h };
    }
  };
  const inside = (b: Box) => b.x >= m - 0.01 && b.y >= m - 0.01 && b.x + b.w <= S.w - m + 0.01 && b.y + b.h <= S.h - m + 0.01;
  let side = order.find(s => { const b = at(s); return inside(b) && !holes.some(h => near(b, h, 6)); });
  const clear = side !== undefined;
  if (!side) side = [...order].sort((a, b) => space[b] - space[a])[0]!; // no room anywhere: the roomiest side, held on the screen
  const b = at(side), x = fitX(b.x), y = fitY(b.y);
  const along = side === 'right' || side === 'left' ? cy - y : cx - x, len = side === 'right' || side === 'left' ? cap.h : cap.w;
  return { side, x, y, arrow: len < ARROW_EDGE * 2 ? len / 2 : clamp(along, ARROW_EDGE, len - ARROW_EDGE), clear };
}

/** a step's body as the caption's one line: its first sentence, cut at a word with an ellipsis when it runs past max characters */
export function firstLine(body: string, max = 120): string {
  const t = body.replace(/\s+/g, ' ').trim();
  const m = /^(.*?[.!?])(?=\s+[A-Z($"'‘“]|$)/.exec(t);
  let s = m ? m[1]! : t;
  if (s.length > max) {
    const cut = s.slice(0, max - 1), sp = cut.lastIndexOf(' ');
    s = `${(sp > max * 0.5 ? cut.slice(0, sp) : cut).replace(/[\s,;:]+$/, '')}…`;
  }
  return s;
}

/** the corners of a tile rect grown by k about its middle, at least min tiles a side (a point's box): what the camera frames for a map target. The camera fits
 *  these corners in the free map, so the target itself fills about 1/k of it: room round it to see where it lies, not a close-up */
export function framePoints(r: TileRect, k = 2, min = 6): { x: number; y: number }[] {
  const cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2, hx = Math.max(min, ((r[2] - r[0]) / 2) * k), hy = Math.max(min, ((r[3] - r[1]) / 2) * k);
  return [{ x: cx - hx, y: cy - hy }, { x: cx + hx, y: cy - hy }, { x: cx + hx, y: cy + hy }, { x: cx - hx, y: cy + hy }];
}
/** the box round some tiles with margin tiles of room (a check's points, the balls' middle) */
export function tilesAround(pts: readonly { x: number; y: number }[], margin = 8): TileRect | null {
  if (!pts.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return finite(x0, y0, x1, y1) ? [x0 - margin, y0 - margin, x1 + margin, y1 + margin] : null;
}

// ---------- the store: the Show me buttons write the request, the one Spotlight in App reads it ----------
/** the spotlight up now: the request, the engine's pulse anchor from before the Show me ran (a pulse target takes only a newer one) and a counter */
export interface SpotState { req: SpotRequest; base: unknown; id: number }
let state: SpotState | null = null, seq = 0;
const subs = new Set<() => void>();
export const spotNow = (): SpotState | null => state;
/** puts the spotlight up (a new Show me replaces the one that is up) */
export function spotShow(req: SpotRequest, base: unknown = null): void { state = { req, base, id: ++seq }; for (const f of [...subs]) f(); }
/** takes it down (a click, Esc, the target done or gone) */
export function spotHide(): void { if (!state) return; state = null; for (const f of [...subs]) f(); }
export function spotSubscribe(f: () => void): () => void { subs.add(f); return () => { subs.delete(f); }; }
