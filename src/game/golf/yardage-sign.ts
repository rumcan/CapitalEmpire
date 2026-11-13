// J7d (#1234; the owner, 2026-11-13: "pls make all the labels show on hover otherwise add a 50m artwork sign"): a distance on the range as a small painted
// yardage board standing on a post in the world (the 50 m markers, the target greens' boards, the junk), drawn on the map's overlay at world scale, in place
// of a floating label. A stand-in until the "yardage sign" picture lands (docs/art/CHATGPT-IMAGE-QUEUE.md): a cream board in a dark wooden frame, the
// figures painted on it, its post and a short shadow cast away from the sun (upper right: shadows fall toward 145°, down and to the left).

/** the board's look */
export const SIGN = { face: '#f3ead2', frame: '#5b3a1e', ink: '#2a1a0b', post: '#6b4423', shadow: 'rgba(20,12,4,0.28)' } as const;

/** the board's size for a world unit of u canvas px (32 * the zoom: about a metre and a half): the figures' size (never below minPx, so they stay legible
 *  zoomed out: the board grows a little past life then), the board's width for text w px wide, its height and the post's height. Pure */
export function signSize(u: number, textW: (px: number) => number, minPx: number): { px: number; w: number; h: number; post: number } {
  const px = Math.max(minPx, Math.round(0.5 * u)), w = textW(px) + px * 0.9, h = px * 1.55, post = Math.max(px * 0.9, 0.7 * u);
  return { px, w, h, post };
}

/** draws a yardage board whose post stands at (x, y) (canvas px) with text on it, for a world unit of u px; minPx: the least figure size */
export function drawYardageSign(c: CanvasRenderingContext2D, x: number, y: number, text: string, u: number, minPx: number): void {
  const font = (px: number) => `800 ${px}px system-ui, sans-serif`;
  const s = signSize(u, px => { c.font = font(px); return c.measureText(text).width; }, minPx);
  const top = y - s.post - s.h, lw = Math.max(1, s.px * 0.12);
  // the shadow on the ground: down and to the left of the post (the sun at the upper right)
  c.fillStyle = SIGN.shadow; c.beginPath(); c.ellipse(x - s.w * 0.28, y + s.px * 0.12, s.w * 0.42, s.px * 0.22, -0.25, 0, Math.PI * 2); c.fill();
  // the post
  c.fillStyle = SIGN.post; c.fillRect(x - lw, y - s.post, lw * 2, s.post);
  // the board, its frame and the figures
  c.fillStyle = SIGN.frame; c.beginPath(); c.roundRect(x - s.w / 2 - lw, top - lw, s.w + 2 * lw, s.h + 2 * lw, lw * 1.5); c.fill();
  c.fillStyle = SIGN.face; c.fillRect(x - s.w / 2, top, s.w, s.h);
  c.fillStyle = SIGN.ink; c.font = font(s.px); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, x, top + s.h / 2 + s.px * 0.04);
}
