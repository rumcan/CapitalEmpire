// A lot's lawn is laid as authored (T181, the owner 2026-10-27: "lawns have an auto transparent color mask over them please remove"): the
// ground's automatic overlays leave a lot's yard alone. They were the living ground's variants (T111: the lush green multiplied along fences
// and hedges, the soil's colour on thin grass under trees and by doors, bare soil, leaf litter), laid over every lawn, and the grass condition
// picture (the Grass panel's strength), laid over every lawn when it was turned up. The Grass panel's health colours (a view the player turns
// on) still show over a lawn, as on the course; the ambient occlusion (the light, not a colour) still shades it. A road block's grass (the
// town's grass in soft patches, lawns.ts blockLawn) and the course keep every overlay, as before. Pure.
import { grassSurface } from './ext/grass-management';

/** a lawn patch's layer: 1 a lot's own yard (lawns.ts lotLawn), 0 a road block's grass under the lots (blockLawn) */
export interface LawnLike { tex: string; lawn?: { z: number } }

/** whether a patch is a lot's own lawn (its yard), which the ground's automatic overlays leave as authored */
export function isLotLawn(p: { lawn?: { z: number } }): boolean { return !!p.lawn && p.lawn.z >= 1; }

/** what the grass condition layer lays over a patch: 'none'; 'heat' (the Grass panel's health colours, a view the player turns on); or
 *  'picture' (the condition picture at the Grass panel's strength). Not grass, and fresh sod: none. A hand-painted tile set (T145; tiled)
 *  and a lot's lawn (T181) keep their art: only the health colours go over them. presetSurface: the patch's preset's golf surface */
export function grassOverlay(p: LawnLike, heat: boolean, tiled: (tex: string) => boolean, presetSurface?: string | null): 'none' | 'heat' | 'picture' {
  if (!grassSurface(p.tex, !!p.lawn, presetSurface) || p.tex === 'golfSod') return 'none';
  if (heat) return 'heat';
  if (isLotLawn(p) || tiled(p.tex)) return 'none';
  return 'picture';
}

/** whether the living ground's variants leave a lot patch alone (the cut-out list): hard ground and non-grass paint as before (the caller's
 *  rule), and now a lot's lawn; a road block's grass and the map grass keep the variety */
export function livingKeepsOff(p: LawnLike & { top?: boolean; layby?: unknown }, grassy: (tex: string) => boolean, tiled: (tex: string) => boolean): boolean {
  if (isLotLawn(p)) return true;
  if (p.top || p.layby || p.lawn || p.tex === 'marks' || (grassy(p.tex) && !tiled(p.tex))) return false;
  return true;
}
