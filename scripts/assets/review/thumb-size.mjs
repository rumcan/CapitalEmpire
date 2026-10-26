// The studio's thumbnail sizes (T144): a Library card asks /thumb/<id>?s=<px> for its picture as WebP with its long side at most s device pixels,
// and s is one of a few steps, so the server's cache (output/review/thumbs/<id>.<s>.webp) is reused as the "Size on screen" slider moves and the
// browser keeps only pictures the size the cards show. The same rounding runs in studio.html (its inline script cannot import; keep the two alike).
/** the long sides a thumbnail is served at, in device px; the largest is the cap */
export const THUMB_STEPS = [128, 256, 384, 512];
/** the step a wanted long side (device px) is served at: the smallest step not below it, the cap past the largest, the smallest for nothing sensible */
export function thumbStep(px) {
  const n = +px;
  if (!(n > 0)) return THUMB_STEPS[0];
  return THUMB_STEPS.find(s => s >= n) ?? THUMB_STEPS[THUMB_STEPS.length - 1];
}
