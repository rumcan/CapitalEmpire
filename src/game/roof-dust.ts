// Roof dust (T384, #1040; the owner, 2026-11-08, of the desert town: "leaves on roofs"). The house and building art was painted in autumn, with fallen leaves lying in the roofs' valleys and along their gutters, and the desert theme leaves that
// art as it is. The ticket asks for "a little sand and dust in the valleys and along the gutters, no leaves": until painted desert roofs exist (docs/GOLF-SPRITES.md asks for them) the sprite shader takes the leaves' own pixels, the
// saturated oranges and yellows (a pixel's hue 9.5 to 50 degrees, saturation over 0.7, not black and not the bright glow of a lit window), and gives them the colour of dry sand, a little paler than the leaf was: the specks that were leaves are drifts of
// dust in the same places, and the roofs, the walls, the windows, a red door and a brick wall are as drawn. A STAND-IN, a per-pixel grade, never a wash: it touches only what the leaves' colours are, only on the world's buildings in the
// desert theme (sprites.ts flags those instances with ROOF_DUST_CODE, the paint code space gl.ts already decodes; autumn flags none), and costs a branch a pixel of those instances alone.
// The GLSL and its JavaScript twin (roofDust, which the tests run on colours) are the same arithmetic.

/** the code the sprite instances of the world's buildings carry in the desert theme (car-paint.ts packAlpha: 2 + 2 code + alpha; the car paints use 1 to 31) */
export const ROOF_DUST_CODE = 99;

/** the dust's colour at full value: dry sand (hue 36 degrees, saturation 0.32), taken times the pixel's own brightness and DUST_GAIN (a speck of dust on a dark roof is paler than the leaf that was there: a dark russet leaf becomes a light dust, never a brown speck), up to DUST_CAP */
export const DUST_RGB = [1, 0.88, 0.68] as const, DUST_GAIN = 1.3, DUST_CAP = 0.95;
/** the band a leaf's colour lies in: hue (degrees) from HUE[0] to HUE[1] with HUE_SOFT of ease at each end, saturation from SAT[0] (nothing) to SAT[1] (all of it), value from VAL[0] to VAL[1] (the dark roofs and shades are left; so is the glow of a lit window) */
export const BAND = { hue: [9.5, 50], hueSoft: 3, sat: [0.7, 0.8], valLo: [0.28, 0.4], valHi: [0.9, 0.97] } as const;

const smooth = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
/** how much of a colour (rgb 0..1, not premultiplied) is a leaf's: 0 for everything that is not an orange or yellow of leaf strength */
export function leafWeight(r: number, g: number, b: number): number {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.05 || mx < 0.3 || r < g || r < b) return 0; // a grey, a dark, anything the red is not the strongest of
  const sat = d / mx, hue = 60 * (g - b) / d; // 0 (red) to 60 (yellow) with red the strongest; negative toward magenta
  return smooth(BAND.sat[0], BAND.sat[1], sat) * smooth(BAND.valLo[0], BAND.valLo[1], mx) * (1 - smooth(BAND.valHi[0], BAND.valHi[1], mx))
    * smooth(BAND.hue[0] - BAND.hueSoft, BAND.hue[0], hue) * (1 - smooth(BAND.hue[1], BAND.hue[1] + BAND.hueSoft + 3, hue));
}
/** the roof's pixel as the desert theme draws it: the leaf's colours go to dust at their own brightness */
export function roofDust(r: number, g: number, b: number): [number, number, number] {
  const w = leafWeight(r, g, b), t = Math.min(DUST_CAP, Math.max(r, g, b) * DUST_GAIN);
  return [r + (t * DUST_RGB[0] - r) * w, g + (t * DUST_RGB[1] - g) * w, b + (t * DUST_RGB[2] - b) * w];
}

/** the same in GLSL (rgb un-premultiplied): the sprite fragment shader calls it for an instance carrying ROOF_DUST_CODE */
export const ROOF_DUST_GLSL = `
vec3 roofDust(vec3 rgb) {
  float mx = max(rgb.r, max(rgb.g, rgb.b)), mn = min(rgb.r, min(rgb.g, rgb.b)), d = mx - mn;
  if (d < 0.05 || mx < 0.3 || rgb.r < rgb.g || rgb.r < rgb.b) return rgb;
  float sat = d / mx, hue = 60.0 * (rgb.g - rgb.b) / d;
  float w = smoothstep(${BAND.sat[0]}, ${BAND.sat[1]}, sat) * smoothstep(${BAND.valLo[0]}, ${BAND.valLo[1]}, mx) * (1.0 - smoothstep(${BAND.valHi[0]}, ${BAND.valHi[1]}, mx))
    * smoothstep(${(BAND.hue[0] - BAND.hueSoft).toFixed(1)}, ${BAND.hue[0].toFixed(1)}, hue) * (1.0 - smoothstep(${BAND.hue[1].toFixed(1)}, ${(BAND.hue[1] + BAND.hueSoft + 3).toFixed(1)}, hue));
  return mix(rgb, min(mx * ${DUST_GAIN.toFixed(2)}, ${DUST_CAP.toFixed(2)}) * vec3(${DUST_RGB.map(v => v.toFixed(2)).join(', ')}), w);
}`;
