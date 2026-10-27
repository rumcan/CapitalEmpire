// What one ground chunk draws in a frame (engine.ts draw): pure, so the tests can run it in Node.

/** a chunk's pictures (GroundCache Tile): its texture and the level it was baked at, the older level it crossfades from, the build reveal's picture */
export interface ChunkPictures<T> { tex: T | null; texL: number; texArtL: number; fadeFrom: T | null; prev: T | null; /** T145, T150: the tile spec it was baked at (the band and the DPR), and whether it laid a tile set */ texTs?: number; texTiled?: boolean }
/** a chunk's layers, bottom to top: the planner map's piece under it, its base picture at full strength, the other ground tier's pictures over
 *  that (GroundCache.zoomFallback; they may cover only part of it), and its new picture over all of it at topAlpha (the zoom crossfade) */
export interface ChunkLayers<T> { planner: boolean; base: T | null; fallback: boolean; top: T | null; topAlpha: number }

/** the layers of chunk t, wanted at raster level L and art level artL; zoomBlend: the zoom crossfade, 0 until every chunk on screen has its
 *  picture at the new level, 1 once it is over; otherTier: the camera came from the other ground tier (district chunks to full ones or back).
 *  Every chunk draws something at full strength (T134, #253): its older picture while the crossfade waits, else its new one (a chunk that
 *  comes into view has nothing older, and nothing would show but the clear colour), else the planner map under it. */
/** a chunk's picture is the one wanted at raster level L, art level artL and tile spec ts (T145, T150: the spec matters only to a picture
 *  that laid a tile set family), stale or not */
export function pictureCurrent<T>(t: Pick<ChunkPictures<T>, 'tex' | 'texL' | 'texArtL' | 'texTs' | 'texTiled'>, L: number, artL: number, ts = 0): boolean {
  return !!t.tex && t.texL === L && t.texArtL === artL && (!t.texTiled || t.texTs === ts);
}
export function chunkLayers<T>(t: ChunkPictures<T>, L: number, artL: number, zoomBlend: number, otherTier: boolean, ts = 0): ChunkLayers<T> {
  const planner = !t.tex && !t.prev;
  if (zoomBlend >= 1) return { planner, base: t.tex, fallback: false, top: null, topAlpha: 0 };
  const ready = pictureCurrent(t, L, artL, ts), old = ready ? t.fadeFrom : t.tex;
  return { planner, base: old ?? (ready ? t.tex : null), fallback: otherTier || !old, top: ready && zoomBlend > 0 ? t.tex : null, topAlpha: zoomBlend };
}

/** one chunk to bake ahead (prebakeTargets) */
export interface PrebakeTarget { kind: 'g' | 'm'; i: number; j: number; L: number; artL: number; ts: number; pri: number }
/** the view prebakeTargets reads: the camera (world px), the canvas (device px), the DPR, the zoom, the tier drawn now ('p' the planner map),
 *  the view's world box and the tile band now */
export interface PrebakeView { X: number; Y: number; cw: number; ch: number; dpr: number; z: number; kind: 'g' | 'm' | 'p'; box: readonly [number, number, number, number]; band: number | null }
/** the ground's zoom levels and chunk sizes prebakeTargets works with (engine.ts: grassZoomLevels, tileSpec, nextBand, the zoom range and the
 *  chunk sizes), passed in so this stays pure */
export interface PrebakeLevels {
  levels: (z: number) => { district: boolean; artL: number; rasterL: number }; spec: (z: number, band: number | null) => number;
  zMin: number; zMax: number; chunk: { g: [number, number]; m: [number, number] };
}
/** T197: the chunks a zoom would show next, to bake ahead while the view is done: for each zoom factor f (nearest first) the view at z x f
 *  (clamped to [zMin, zMax]) and its chunks at that zoom's tier, level and tile spec, nearest the camera first, up to `limit`. A chunk already
 *  with a picture (any level: better than the planner map, and never re-baked ahead, so no level ping-pong) is skipped, and so is one of the
 *  tier drawn now that is on screen (one picture a chunk: readying another level would blur it now). pri: the bake priority, after any chunk on
 *  screen */
export function prebakeTargets(v: PrebakeView, lv: PrebakeLevels, factors: readonly number[], hasPicture: (kind: 'g' | 'm', i: number, j: number) => boolean, limit: number): PrebakeTarget[] {
  const out: PrebakeTarget[] = [], seen = new Set<string>();
  for (const f of factors) {
    const zz = Math.min(lv.zMax, Math.max(lv.zMin, v.z * f)); if (Math.abs(zz - v.z) < 1e-9) continue;
    const l = lv.levels(zz), k: 'g' | 'm' = l.district ? 'm' : 'g', [CW, CH] = lv.chunk[k], ts = lv.spec(zz, v.band), ze = zz * v.dpr;
    const x0 = v.X - v.cw / 2 / ze, y0 = v.Y - v.ch / 2 / ze, x1 = v.X + v.cw / 2 / ze, y1 = v.Y + v.ch / 2 / ze;
    const cand: PrebakeTarget[] = [];
    for (let j = Math.floor(y0 / CH); j <= Math.floor(y1 / CH); j++) for (let i = Math.floor(x0 / CW); i <= Math.floor(x1 / CW); i++) {
      const cx0 = i * CW, cy0 = j * CH, cx1 = cx0 + CW, cy1 = cy0 + CH, id = `${k}${i},${j}`;
      if (seen.has(id)) continue;
      if (k === v.kind && cx1 > v.box[0] && cx0 < v.box[2] && cy1 > v.box[1] && cy0 < v.box[3]) continue; // on screen: its picture stays
      if (hasPicture(k, i, j)) continue;
      seen.add(id);
      cand.push({ kind: k, i, j, L: l.rasterL, artL: l.artL, ts, pri: 4e6 + Math.hypot((cx0 + cx1) / 2 - v.X, (cy0 + cy1) / 2 - v.Y) * ze });
    }
    cand.sort((a, b) => a.pri - b.pri);
    for (const c of cand) { out.push(c); if (out.length >= limit) return out; }
  }
  return out;
}
