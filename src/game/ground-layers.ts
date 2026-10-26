// What one ground chunk draws in a frame (engine.ts draw): pure, so the tests can run it in Node.

/** a chunk's pictures (GroundCache Tile): its texture and the level it was baked at, the older level it crossfades from, the build reveal's picture */
export interface ChunkPictures<T> { tex: T | null; texL: number; texArtL: number; fadeFrom: T | null; prev: T | null }
/** a chunk's layers, bottom to top: the planner map's piece under it, its base picture at full strength, the other ground tier's pictures over
 *  that (GroundCache.zoomFallback; they may cover only part of it), and its new picture over all of it at topAlpha (the zoom crossfade) */
export interface ChunkLayers<T> { planner: boolean; base: T | null; fallback: boolean; top: T | null; topAlpha: number }

/** the layers of chunk t, wanted at raster level L and art level artL; zoomBlend: the zoom crossfade, 0 until every chunk on screen has its
 *  picture at the new level, 1 once it is over; otherTier: the camera came from the other ground tier (district chunks to full ones or back).
 *  Every chunk draws something at full strength (T134, #253): its older picture while the crossfade waits, else its new one (a chunk that
 *  comes into view has nothing older, and nothing would show but the clear colour), else the planner map under it. */
export function chunkLayers<T>(t: ChunkPictures<T>, L: number, artL: number, zoomBlend: number, otherTier: boolean): ChunkLayers<T> {
  const planner = !t.tex && !t.prev;
  if (zoomBlend >= 1) return { planner, base: t.tex, fallback: false, top: null, topAlpha: 0 };
  const ready = !!t.tex && t.texL === L && t.texArtL === artL, old = ready ? t.fadeFrom : t.tex;
  return { planner, base: old ?? (ready ? t.tex : null), fallback: otherTier || !old, top: ready && zoomBlend > 0 ? t.tex : null, topAlpha: zoomBlend };
}
