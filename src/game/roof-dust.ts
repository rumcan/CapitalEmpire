// Roof dust (T384, #1040; the owner, 2026-11-08, of the desert town: "leaves on roofs"; the lead's review of the first cut, 2026-11-09: the recoloured leaves read as pale dots, hail or bird droppings, "that's a leaf pattern in a new colour, not dust").
// The house and building art was painted in autumn, with fallen leaves lying on the roofs, and the desert theme leaves that art as it is: until painted desert roofs exist (docs/GOLF-SPRITES.md asks for them) the sprite shader grades it, per pixel,
// in two steps, only on the world's buildings in the desert theme (sprites.ts flags those instances with ROOF_DUST_CODE, the paint code space gl.ts already decodes; autumn flags none):
//   1. the leaves go: a pixel that is a leaf's (a saturated orange or yellow, hue 9.5 to 50 degrees; the dark russet of its outline and the warm blend of its edge with the roof, when a leaf is next to it) takes the colour of the roof round it (a ring of twelve taps of the sprite at 3 and
//      7 px, the leaves among them left out): no leaf shape is left to read as a speck, and where a leaf-coloured thing is no small speck on a roof (an orange wall, a big painted area: most of the ring is the same colour) nothing is touched;
//   2. the dust: a soft, low-contrast, warm film where dust settles, in the roof's creases (a pixel darker than the roof round it: the valleys, the gutters and eaves' shadow lines, the joints of the shingles) on dark roofs only (the walls and
//      windows have lighter surroundings and get none), stronger on the planes that are lit (the sun at the upper right: a lit plane is the lighter one) and muted on the shaded ones, following the roof's own texture (it fills the dark
//      gaps, so the shingles stay), never a flat wash: at most FILM.amount of the way toward warm sand, which lightens a dark roof by under 0.09 at its deepest, under a quarter of the leaves' contrast.
// A STAND-IN, a per-pixel grade, and costs twelve atlas taps a pixel of those instances alone. The GLSL and its JavaScript twin (roofGrade, which the tests run on colours and a summary of the ring) are the same arithmetic.

/** the code the sprite instances of the world's buildings carry in the desert theme (car-paint.ts packAlpha: 2 + 2 code + alpha; the car paints use 1 to 31) */
export const ROOF_DUST_CODE = 99;

/** the dust's colour at its fullest (warm dry sand) and how far a crease goes toward it at the film's fullest */
export const DUST_TONE = [0.80, 0.68, 0.50] as const;
export const FILM = {
  amount: 0.20,
  /** the pixel darker than the roof round it by this much starts a film (the first) and gets all of it (the second): a crease */
  crease: [0.012, 0.085],
  /** the roof round it (its mean luminance) is dark enough for dust: from some to none (a window's or a light wall's surroundings are lighter) */
  roofRound: [0.32, 0.46],
  /** the pixel itself is dark enough: from some to none */
  roofSelf: [0.40, 0.58],
  /** the lit planes (the lighter ones: the roof round it from this to that) take all of the film, the shaded ones litFloor of it */
  lit: [0.10, 0.34], litFloor: 0.45,
} as const;
/** the band a leaf's colour lies in: hue (degrees) from HUE[0] to HUE[1] with HUE_SOFT of ease at each end, saturation from SAT[0] (nothing) to SAT[1] (all of it), value from VAL[0] to VAL[1] (the dark roofs and shades are left; so is the glow of a lit window) */
export const BAND = { hue: [9.5, 50], hueSoft: 3, sat: [0.7, 0.8], valLo: [0.28, 0.4], valHi: [0.9, 0.97] } as const;
/** the dark russet of a leaf's outline and veins: browner and darker than the band, counted only beside a leaf (the strongest leaf in the ring over LEAF_NEAR) */
export const DARK_BAND = { hue: [6, 42], hueSoft: 3, sat: [0.45, 0.6], val: [0.14, 0.2, 0.42, 0.5] } as const;
export const LEAF_NEAR = [0.25, 0.6] as const;
/** the warm residue of a leaf's edge (its blend with the roof, a brown or a dull red where the colour is no leaf's any more, which the first cut left as a ghost of every leaf): a pixel warmer than the roof round it (red over blue, by WARM.over from none to all), darker than a window's glow
 *  (WARM.valMax) and no green, counted only beside a leaf */
export const WARM = { over: [0.04, 0.16], valMax: [0.55, 0.7], green: 0.05 } as const;
/** the ring of taps: INNER px of the screen from the pixel (6 taps), OUTER px (6 taps turned half a step); a leaf is replaced where the ring's roof part is at least FRAC[0] (some) to FRAC[1] (all) of the taps */
export const RING = { inner: 3, outer: 7, taps: 12 } as const, FRAC = [0.3, 0.6] as const;
/** the ring's average leans toward its darker taps (the roof under a leaf is dark; the wall a tap beyond the eave is not): a tap counts (1 - leaf) times (DARK_LEAN - its luminance) */
export const DARK_LEAN = 1.4;

const smooth = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
export const lumOf = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
/** how much of a colour (rgb 0..1, not premultiplied) is a leaf's: 0 for everything that is not an orange or yellow of leaf strength */
export function leafWeight(r: number, g: number, b: number): number {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.05 || mx < 0.3 || r < g || r < b) return 0; // a grey, a dark, anything the red is not the strongest of
  const sat = d / mx, hue = 60 * (g - b) / d; // 0 (red) to 60 (yellow) with red the strongest; negative toward magenta
  return smooth(BAND.sat[0], BAND.sat[1], sat) * smooth(BAND.valLo[0], BAND.valLo[1], mx) * (1 - smooth(BAND.valHi[0], BAND.valHi[1], mx))
    * smooth(BAND.hue[0] - BAND.hueSoft, BAND.hue[0], hue) * (1 - smooth(BAND.hue[1], BAND.hue[1] + BAND.hueSoft + 3, hue));
}
/** how much of a colour is the dark russet of a leaf's outline (the caller counts it only beside a leaf) */
export function darkLeafWeight(r: number, g: number, b: number): number {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.04 || mx < 0.12 || r < g || r < b) return 0;
  const sat = d / mx, hue = 60 * (g - b) / d, B = DARK_BAND;
  return smooth(B.sat[0], B.sat[1], sat) * smooth(B.val[0], B.val[1], mx) * (1 - smooth(B.val[2], B.val[3], mx)) * smooth(B.hue[0] - B.hueSoft, B.hue[0], hue) * (1 - smooth(B.hue[1], B.hue[1] + B.hueSoft, hue));
}
/** how much of a colour is the warm residue of a leaf's edge, against the roof's colour round it (the caller counts it only beside a leaf) */
export function warmWeight(r: number, g: number, b: number, roof: readonly number[]): number {
  return smooth(WARM.over[0], WARM.over[1], (r - b) - (roof[0]! - roof[2]!)) * (1 - smooth(WARM.valMax[0], WARM.valMax[1], Math.max(r, g, b))) * (1 - smooth(0, WARM.green, g - r));
}

/** what the shader learns of the ring round a pixel: the roof's colour there (the average of the taps that are not leaves, leaning dark), the share of the taps that are roof (0 to 1), that colour's luminance, and the strongest leaf in the inner ring (3 px) */
export interface Around { r: number; g: number; b: number; frac: number; lum: number; leaf: number }
/** the roof's pixel as the desert theme draws it (rgb 0..1, not premultiplied): a leaf's pixel is the roof's own colour round it, then the dust film in the creases of a dark roof */
export function roofGrade(r: number, g: number, b: number, a: Around): [number, number, number] {
  const near = smooth(LEAF_NEAR[0], LEAF_NEAR[1], a.leaf), k = Math.max(leafWeight(r, g, b), Math.max(darkLeafWeight(r, g, b), warmWeight(r, g, b, [a.r, a.g, a.b])) * near) * smooth(FRAC[0], FRAC[1], a.frac);
  const R = r + (a.r - r) * k, G = g + (a.g - g) * k, B = b + (a.b - b) * k, lb = lumOf(R, G, B), F = FILM;
  const film = smooth(F.crease[0], F.crease[1], a.lum - lb) * (1 - smooth(F.roofRound[0], F.roofRound[1], a.lum)) * (1 - smooth(F.roofSelf[0], F.roofSelf[1], lb))
    * (F.litFloor + (1 - F.litFloor) * smooth(F.lit[0], F.lit[1], a.lum)) * F.amount;
  return [R + (DUST_TONE[0] - R) * film, G + (DUST_TONE[1] - G) * film, B + (DUST_TONE[2] - B) * film];
}

const n = (v: number) => v.toFixed(3);
/** the same in GLSL (rgb un-premultiplied): the sprite fragment shader calls roofDust for an instance carrying ROOF_DUST_CODE, after its atlas lookup (atlasTex is the atlas's, defined above it) */
export const ROOF_DUST_GLSL = `
float leafW(vec3 rgb) {
  float mx = max(rgb.r, max(rgb.g, rgb.b)), mn = min(rgb.r, min(rgb.g, rgb.b)), d = mx - mn;
  if (d < 0.05 || mx < 0.3 || rgb.r < rgb.g || rgb.r < rgb.b) return 0.0;
  float sat = d / mx, hue = 60.0 * (rgb.g - rgb.b) / d;
  return smoothstep(${BAND.sat[0]}, ${BAND.sat[1]}, sat) * smoothstep(${BAND.valLo[0]}, ${BAND.valLo[1]}, mx) * (1.0 - smoothstep(${BAND.valHi[0]}, ${BAND.valHi[1]}, mx))
    * smoothstep(${(BAND.hue[0] - BAND.hueSoft).toFixed(1)}, ${BAND.hue[0].toFixed(1)}, hue) * (1.0 - smoothstep(${BAND.hue[1].toFixed(1)}, ${(BAND.hue[1] + BAND.hueSoft + 3).toFixed(1)}, hue));
}
float darkLeafW(vec3 rgb) {
  float mx = max(rgb.r, max(rgb.g, rgb.b)), mn = min(rgb.r, min(rgb.g, rgb.b)), d = mx - mn;
  if (d < 0.04 || mx < 0.12 || rgb.r < rgb.g || rgb.r < rgb.b) return 0.0;
  float sat = d / mx, hue = 60.0 * (rgb.g - rgb.b) / d;
  return smoothstep(${DARK_BAND.sat[0]}, ${DARK_BAND.sat[1]}, sat) * smoothstep(${DARK_BAND.val[0]}, ${DARK_BAND.val[1]}, mx) * (1.0 - smoothstep(${DARK_BAND.val[2]}, ${DARK_BAND.val[3]}, mx))
    * smoothstep(${(DARK_BAND.hue[0] - DARK_BAND.hueSoft).toFixed(1)}, ${DARK_BAND.hue[0].toFixed(1)}, hue) * (1.0 - smoothstep(${DARK_BAND.hue[1].toFixed(1)}, ${(DARK_BAND.hue[1] + DARK_BAND.hueSoft).toFixed(1)}, hue));
}
float warmW(vec3 rgb, vec3 roof) {
  float mx = max(rgb.r, max(rgb.g, rgb.b));
  return smoothstep(${WARM.over[0]}, ${WARM.over[1]}, (rgb.r - rgb.b) - (roof.r - roof.b)) * (1.0 - smoothstep(${WARM.valMax[0]}, ${WARM.valMax[1]}, mx)) * (1.0 - smoothstep(0.0, ${WARM.green}, rgb.g - rgb.r));
}
vec3 roofGrade(vec3 rgb, vec3 roof, float frac, float lr, float leaf) {
  float near = smoothstep(${LEAF_NEAR[0]}, ${LEAF_NEAR[1]}, leaf);
  float k = max(leafW(rgb), max(darkLeafW(rgb), warmW(rgb, roof)) * near) * smoothstep(${FRAC[0]}, ${FRAC[1]}, frac);
  vec3 b = mix(rgb, roof, k);
  float lb = dot(b, vec3(0.299, 0.587, 0.114));
  float film = smoothstep(${FILM.crease[0]}, ${FILM.crease[1]}, lr - lb) * (1.0 - smoothstep(${FILM.roofRound[0]}, ${FILM.roofRound[1]}, lr)) * (1.0 - smoothstep(${FILM.roofSelf[0]}, ${FILM.roofSelf[1]}, lb))
    * (${n(FILM.litFloor)} + ${n(1 - FILM.litFloor)} * smoothstep(${FILM.lit[0]}, ${FILM.lit[1]}, lr)) * ${n(FILM.amount)};
  return mix(b, vec3(${DUST_TONE.map(v => v.toFixed(2)).join(', ')}), film);
}
vec3 roofDust(vec3 rgb, vec2 uv, float page) {
  float px = max(length(dFdx(uv)), length(dFdy(uv)));
  vec3 sum = vec3(0.0); float sw = 0.0, sl = 0.0, leaf = 0.0;
  for (int k = 0; k < ${RING.taps}; k++) {
    float a = 1.0471976 * float(k % 6) + (k < 6 ? 0.0 : 0.5235988), r = k < 6 ? ${RING.inner}.0 : ${RING.outer}.0;
    vec4 s = atlasTex(uv + vec2(cos(a), sin(a)) * (r * px), page);
    if (s.a < 0.6) continue;
    vec3 sc = s.rgb / s.a; float lw = leafW(sc), wt = (1.0 - lw) * max(0.05, ${DARK_LEAN.toFixed(1)} - dot(sc, vec3(0.299, 0.587, 0.114)));
    if (k < 6) leaf = max(leaf, lw);
    sum += sc * wt; sw += wt; sl += 1.0 - lw;
  }
  vec3 roof = sw > 0.05 ? sum / sw : rgb;
  return roofGrade(rgb, roof, sl / ${RING.taps}.0, dot(roof, vec3(0.299, 0.587, 0.114)), leaf);
}`;
