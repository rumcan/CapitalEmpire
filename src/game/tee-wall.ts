// T364 (#1019; the owner, 2026-11-08: "use the same texture the bunker uses for its walls for the elevated tee walls"; the sun is at the upper right):
// a raised tee's cut sides in the bunker's wall. The Bunker look (ext/bunker-look) paints its cut face in the pack's "Wall earth" (the Cut wall
// texture's default, stage-materials.ts bunker:wall-earth: brown earth with its pebbles, roots and tufts), laid at the scale the approved look gives it
// and lit by the stage's wall shader (stage-baker/wall-renderer.js: a directional term from the sun at the upper right, none of it where the face
// turns away, a darker lip under the grass and a darker foot). The tee's slope (course-walls FaceForm.Rock, the T127 form kept, with its stairs)
// takes that picture and that shading instead of its painted earth and set stones; the course finish's `teeWall` ('rock') brings the stones back.
// Pure but for the picture's URL (a Vite asset; under the node test bundle an empty module): importable from node tests.
import wallEarth from './ext/bunker-look/package/textures/wall-earth.png';

/** the picture the bunker's cut wall is painted with, as a URL the ground workers decode with the painted pictures (Textures.preparePainted) */
export const BUNKER_WALL_PICTURE: string = wallEarth as string;
/** its mean colour (the picture's, for the district tier, which lays flat tones only) */
export const BUNKER_WALL_MEAN: readonly number[] = [84, 51, 26];
/** the ground one repeat of the picture covers across, metres, as the approved bunker look lays it: along the wall one repeat is 0.6 x the
 *  picture's aspect (1365 x 768) x the texture size (the look's textureScale 1.164 x earthScale 3) ground units of 2 m; a tee's face shows the
 *  picture at the same size, so a bunker's wall and a tee's wall are one soil */
export const BUNKER_WALL_METRES = 2 * 0.6 * (1365 / 768) * 1.1642699115 * 3;
/** the stage's Shadow strength for its wall shader (the approved look's Shadow 1.252 over 1.5: the share of the directional term it lets through) */
export const BUNKER_WALL_STRENGTH = 1.25218473451 / 1.5;
/** the wall shader's directional term, `.28 + .74 x light` (light 0 turned from the sun .. about .93 facing it), mixed with a flat .95 by the strength:
 *  the share of the picture's colour a face keeps (stage-baker/wall-renderer.js, `shade`) */
export function bunkerWallShade(light: number, strength = BUNKER_WALL_STRENGTH): number {
  const l = Math.max(0, Math.min(1, light)), directional = 0.28 + 0.74 * 0.93 * l, k = Math.max(0, Math.min(1, strength));
  return 0.95 + (directional - 0.95) * k;
}
/** the shade a slope of the tee's wall keeps, from its slope light b (course-walls slopeLight: 1 is flat ground, below 1 turned from the sun at the
 *  upper right, above it toward it) over the range [lo, hi] the bank bins span (renderer BANK_B0 .. BANK_B1): the shader's term, a face turned
 *  fully away at its darkest, one turned fully to the sun as the shader lights it (1 is the picture as it is) */
export function teeWallShade(b: number, lo: number, hi: number, strength = BUNKER_WALL_STRENGTH): number {
  return bunkerWallShade(hi > lo ? (b - lo) / (hi - lo) : 0, strength);
}
/** the shader's extra darkening under the lip of the grass (overhang) and at the foot (contact), as the share of the colour kept at the strength */
export const bunkerWallOverhang = (strength = BUNKER_WALL_STRENGTH) => Math.max(0.62, 1 - Math.min(1, strength) * 0.18);
export const bunkerWallContact = (strength = BUNKER_WALL_STRENGTH) => Math.max(0.62, 1 - Math.min(1, strength) * 0.14);
