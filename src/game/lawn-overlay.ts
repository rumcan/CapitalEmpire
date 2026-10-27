// A lot's lawn and the grass condition picture (T181, the owner 2026-10-27: "lawns have an auto transparent color mask over them please
// remove"): the condition picture (the Grass panel's strength, when it is turned up) leaves a lot's yard alone; the Grass panel's health
// colours (a view the player turns on) still show over it, as on the course. The living ground's streaks (T111) are laid over lawns again
// (T181b: the owner likes them); the wash the owner meant was its ambient occlusion (living-ground.ts LIVING_AO). Pure.
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
