import { PHOTO_TEX } from '../../grass-art';
import { withPresets } from '../../paint-presets-saved';
import { paintedUrl } from '../../painted-grass-art';
import { resolveFamily } from '../../painted-families';
import { lookOfTex, type PresetRef } from '../../painted-surfaces';
import { paintedSurfaces } from '../../painted-surfaces-live';
import { tiledFamily } from '../../painted-tiles';
import { ownTexture } from './texture-library';

let presets: { photos: { tex: string; src: string }[]; refs: PresetRef[] } | null = null;
function presetSets() {
  if (!presets) {
    const own = withPresets({}).presets;
    presets = { photos: [...PHOTO_TEX, ...own], refs: own.filter(p => p.tex.startsWith('preset:')).map(p => ({ id: p.tex.slice(7), surface: p.surface ?? null, painted: p.painted ?? null })) };
  }
  return presets;
}

/** The picture a bunker's My looks texture is laid with (the course layer's tex), for the bake's sand: its painted look's finest picture (a
 *  tile set's first near tile), else its photo; null when it has none (the bake keeps the bunker card's sand). The id names the look, so a
 *  change in My looks or in the studio's surfaces gives a new bake key. */
export function bunkerLookPicture(tex: string): { id: string; url: string } | null {
  // the player's own picture (an upload worn as the look's texture)
  if (tex.startsWith('upload:')) { const own = ownTexture(tex); return own ? { id: own.id, url: own.url } : null; }
  const { photos, refs } = presetSets(), look = lookOfTex(tex, paintedSurfaces(), refs);
  if (look) {
    const fam = resolveFamily(look), tiled = fam?.tiled ? tiledFamily(fam.id) : undefined;
    const url = tiled ? paintedUrl(tiled.levels.near.tiles[0]?.file ?? '') : fam ? paintedUrl(fam.near.file) : null;
    if (fam && url) return { id: `look:${tex}:${fam.id}:${look.version ?? ''}`, url };
  }
  const photo = photos.find(p => p.tex === tex);
  return photo?.src ? { id: `look:${tex}`, url: photo.src } : null;
}
