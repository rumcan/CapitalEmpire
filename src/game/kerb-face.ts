// The town roads' kerb face (renderer.ts step 4; lined up across the ground chunks' borders in T140). A kerbed road's kerb stands FACE_WORLD
// world px proud of the asphalt, and the camera sees its side wherever the road lies below the kerb on screen: a wall standing on the
// asphalt's upper edges (the far kerbs), straight up the screen, in the kit strip's three tones (light at the top, the foot darkest). The wall
// is the kerbed roads stepped straight up the screen by its height, less the roads themselves; each tone band is the roads stepped up by
// that band's share of the height. The steps are taken on the roads in tile space, as cart-bevel.ts does for the cart paths' bevel (T139):
// the roads are drawn again under a stepped chunk transform, so the roads just below the chunk's bottom edge step into it with the rest.
// Before T140 the face slid the chunk's baked road mask up by a pixel offset (drawImage), and the slid copy came in empty along the chunk's
// bottom edge: wherever a far kerb crossed a ground chunk's bottom edge, its face was missing for its own height above the seam.
// Pure TypeScript over a 2D context: an OffscreenCanvas in the ground worker, a software raster in tests/kerb-face.test.ts.
import { drawPaths, type Affine, type BevelCtx } from './cart-bevel';
import type { BBox, Feature, Pt } from './network';

/** how tall the kerb's face stands on the screen, world px (the kerb's raised top ring is drawn this far up too) */
export const FACE_WORLD = 7.5;
/** the face's tone bands from the foot: the kit strip's middle tone covers the lower FACE_CUTS[0] of the face and its foot tone the lower
 *  FACE_CUTS[1]; its top tone the rest */
export const FACE_CUTS = [0.62, 0.3] as const;
/** the face's height in a chunk's px at cache level L (at least a pixel, so the far zooms keep a hairline) */
export const faceShift = (L: number) => Math.max(1, FACE_WORLD * L);

/** the tile step that moves what is drawn under the chunk transform M px pixels straight up the screen (a height stands straight up) */
export function upScreen(M: Affine, px: number): Pt {
  const det = M.a * M.d - M.b * M.c;
  return { x: (M.c * px) / det, y: (-M.a * px) / det };
}
/** a feature's box b grown by its copy stepped `step` tiles: what a chunk must include for the stepped copy to reach into it */
export const stepReach = (b: BBox, step: Pt): BBox => [b[0] + Math.min(0, step.x), b[1] + Math.min(0, step.y), b[2] + Math.max(0, step.x), b[3] + Math.max(0, step.y)];

/** the kerb face into g, a cleared chunk buffer: the kerbed roads' features stepped up the screen by the face's height `shift` (chunk px) in
 *  the top tone, the lower bands over it ('source-atop', so they stay on the face), then the roads themselves cut out. bands: the kit strip's
 *  three tones, top to foot. Leaves g's transform at the identity and its compositing at 'source-over' */
export function kerbFace<I>(g: BevelCtx<I>, feats: readonly Feature[], M: Affine, shift: number, bands: readonly string[]) {
  drawPaths(g, feats, M, upScreen(M, shift), bands[0]);
  g.globalCompositeOperation = 'source-atop';
  drawPaths(g, feats, M, upScreen(M, shift * FACE_CUTS[0]), bands[1]);
  drawPaths(g, feats, M, upScreen(M, shift * FACE_CUTS[1]), bands[2]);
  g.globalCompositeOperation = 'destination-out'; drawPaths(g, feats, M);
  g.globalCompositeOperation = 'source-over';
}
