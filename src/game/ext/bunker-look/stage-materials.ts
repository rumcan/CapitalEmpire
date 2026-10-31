/** Literal URLs let Vite emit the preserved approved material set; the edit worker receives resolved browser URLs. */
export const BUNKER_STAGE_MATERIALS = Object.freeze({
  material: new URL('./package/textures/material-atlas.png', import.meta.url).href,
  rough: new URL('./package/textures/border-grass.png', import.meta.url).href,
  firstCut: new URL('./package/textures/first-cut.png', import.meta.url).href,
  earth: new URL('./package/textures/wall-earth.png', import.meta.url).href,
});
