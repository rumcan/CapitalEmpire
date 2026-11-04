// The sun breaking through the clouds (T310, #895; the owner, 2026-11-03: "so you are not building the cloud you are building where the sun comes
// through the clouds", "we dont add any shadow").
//
// A field over the map, "how much sun reaches here": 0 is the overcast (the ground as it always was, and no drop shadows), 1 full sun (the ground a
// little brighter, the drop shadows as the game draws them). Nothing is drawn for a cloud: no grey, no dark patch, no cloud shadow. It does two
// things only:
//   1. the ground pass (gl.ts FS_QUAD, SUN_GLSL sunLight) brightens the ground in the sun, the way the height light's lift does
//      (ext/course-height/light.ts: the texel times a slightly warm gain on its mid-tones and up, the dark gaps kept dark, and a faint warm screen
//      on its lit tips): only light, the texture's own detail times a factor, no wash;
//   2. the shadow passes (gl.ts VS_VEC, the drawn cast shapes, and VS_CAST, the silhouette casts) fade each object's drop (cast) shadow by the sun at
//      its foot: none in the overcast, as now in the sun. The contact (blob) shadows are never touched.
//
// The shapes: one tileable fBm noise picture (SUN_TEX px square, a few octaves of gradient noise, made once in memory: no atlas page, no ground
// re-bake), read twice at two scales and turns (A and B) that drift at slightly different velocities along one wind, so the gaps keep changing
// shape as they go and the two repeats (REPEAT_A, REPEAT_B tiles) never line up into a visible tiling. A soft threshold (cover ± soft) cuts the
// blobby gaps a few hundred metres across with soft edges.
//
// The motion: in game time (Engine.sunFrame: the clock runs at the sim speed, faster at 4x or 20x), and at the 1x rate while paused, so the map
// never looks frozen.
// Pure TypeScript (no DOM, no GL): gl.ts uploads the picture, engine.ts runs the clock, tests/sun-patches.test.ts checks it in node.

/** the noise picture's size (px, square, tileable) */
export const SUN_TEX = 512;
/** the octaves of the fBm, its coarsest lattice period (cells across the picture) and each octave's gain */
export const OCTAVES = 5, BASE_CELLS = 4, GAIN = 0.5;
/** map tiles one repeat of each read of the picture covers (A, B; 2 m a tile): the coarsest octave's wavelength is REPEAT / BASE_CELLS tiles,
 *  about 350 m for A, so a gap of sun is a few hundred metres across. Their ratio is far from a simple fraction (no visible common repeat) */
export const REPEAT_A = 700, REPEAT_B = 959;
/** read B is turned this much (radians) against A */
export const TURN_B = 0.61;
/** the weight of each read in the field (A + B = 1) */
export const MIX_A = 0.6;
/** the wind (tiles, unit) the gaps drift along, and its speed at 1x (tiles per real second: 2.8 m/s; 20x is 56 m/s). B drifts DRIFT_B times as
 *  fast with a small cross wind (CROSS_B of the speed, to the wind's left), so the two reads slide over each other and the shapes change */
export const WIND = { x: 0.6, y: 0.8 } as const, WIND_SPEED = 1.4, DRIFT_B = 1.3, CROSS_B = 0.25;
/** the soft threshold on the field: sun = smoothstep(cover − soft, cover + soft, n). About a third to two fifths of the ground is in the sun */
export const COVER = 0.53, SOFT = 0.07;
/** the light at strength 1 in full sun (the height light's lift and highlight, light.ts LIFT_G 0.3 and SPEC_G 0.26 on a slope facing the sun
 *  squarely, a little less: flat ground in the sun): the gain on the texel's mid-tones and up, per channel slightly warm, and the warm screen
 *  of the sunlight over its lit tips */
export const LIFT = 0.2, LIFT_W = [1.06, 1, 0.84] as const, SPEC = 0.06, SUN_RGB = [255, 236, 176] as const;
/** the lift's luminance mask: none in the dark gaps (luminance under LUM_LO), all of it from LUM_HI up; the highlight's: from SPEC_LO to SPEC_HI */
export const LUM_LO = 0.04, LUM_HI = 0.18, SPEC_LO = 0.32, SPEC_HI = 0.62;
/** the strength's range: 0 = off, 1 = the default look, 2 = twice the light */
export const SUN_RANGE = [0, 2] as const;
/** the setting, kept across reloads (the gear menu's Sun and clouds) */
export const SUN_KEY = 'capitalempire.sunPatches';
/** the texture unit every program reads the picture from (gl.ts: above the chunks' 0-7 and the atlas's) */
export const SUN_UNIT = 15;

export interface SunSetting { on: boolean; strength: number }
export const SUN_DEFAULT: SunSetting = { on: true, strength: 1 };
/** a setting held to its range (anything else: the default) */
export function clampSun(v: unknown): SunSetting {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<SunSetting>, s = typeof o.strength === 'number' && Number.isFinite(o.strength) ? o.strength : SUN_DEFAULT.strength;
  return { on: typeof o.on === 'boolean' ? o.on : SUN_DEFAULT.on, strength: Math.max(SUN_RANGE[0], Math.min(SUN_RANGE[1], s)) };
}

/** the clock's step (game seconds of drift) for a frame of dt real seconds at sim speed k: k times dt, and dt while paused (k 0: the 1x rate) */
export const sunStep = (dt: number, speed: number) => (dt > 0 ? dt : 0) * (speed > 0 ? speed : 1);

const fract = (v: number) => v - Math.floor(v);
/** the two reads' offsets (picture uv, each in 0..1: the picture repeats) at clock t (game s): [ax, ay, bx, by]. A point of the field drifts
 *  with the wind: the read at tile p is the picture at p / REPEAT + off, off = −(drift × t) / REPEAT (B's turned into B's frame) */
export function sunOffsets(t: number): [number, number, number, number] {
  const d = WIND_SPEED * t, ax = -WIND.x * d / REPEAT_A, ay = -WIND.y * d / REPEAT_A;
  // B's drift: DRIFT_B along the wind and CROSS_B to its left, turned by TURN_B into B's frame
  const wx = (WIND.x * DRIFT_B - WIND.y * CROSS_B) * d, wy = (WIND.y * DRIFT_B + WIND.x * CROSS_B) * d;
  const c = Math.cos(TURN_B), s = Math.sin(TURN_B), bx = -(c * wx - s * wy) / REPEAT_B, by = -(s * wx + c * wy) / REPEAT_B;
  return [fract(ax), fract(ay), fract(bx), fract(by)];
}

/** the noise picture: SUN_TEX² bytes (R8), tileable fBm of gradient noise, its values spread over 0..255 by their mean and spread (mean 127.5,
 *  three standard deviations to either end). Seeded: the same picture every time */
export function sunNoise(seed = 310): Uint8Array {
  const N = SUN_TEX, f = new Float32Array(N * N);
  const hash = (x: number, y: number, o: number) => {
    let h = (x * 374761393 + y * 668265263 + o * 2147483647 + seed * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return h >>> 0;
  };
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  let amp = 1;
  for (let o = 0; o < OCTAVES; o++) {
    const P = BASE_CELLS << o, cell = N / P;
    // the lattice's gradients (unit, any angle), wrapped at P: the picture tiles
    const gx = new Float32Array(P * P), gy = new Float32Array(P * P);
    for (let j = 0; j < P; j++) for (let i = 0; i < P; i++) { const a = hash(i, j, o) / 4294967296 * Math.PI * 2; gx[j * P + i] = Math.cos(a); gy[j * P + i] = Math.sin(a); }
    for (let y = 0; y < N; y++) {
      const fy = (y + 0.5) / cell, j0 = Math.floor(fy), ty = fy - j0, j1 = (j0 + 1) % P, v = fade(ty);
      for (let x = 0; x < N; x++) {
        const fx = (x + 0.5) / cell, i0 = Math.floor(fx), tx = fx - i0, i1 = (i0 + 1) % P, u = fade(tx);
        const g = (i: number, j: number, dx: number, dy: number) => gx[j * P + i]! * dx + gy[j * P + i]! * dy;
        const n00 = g(i0, j0, tx, ty), n10 = g(i1, j0, tx - 1, ty), n01 = g(i0, j1, tx, ty - 1), n11 = g(i1, j1, tx - 1, ty - 1);
        const a = n00 + (n10 - n00) * u, b = n01 + (n11 - n01) * u;
        f[y * N + x]! += (a + (b - a) * v) * amp;
      }
    }
    amp *= GAIN;
  }
  let m = 0; for (let k = 0; k < f.length; k++) m += f[k]!; m /= f.length;
  let s = 0; for (let k = 0; k < f.length; k++) s += (f[k]! - m) ** 2; s = Math.sqrt(s / f.length) || 1;
  const out = new Uint8Array(N * N);
  for (let k = 0; k < f.length; k++) out[k] = Math.max(0, Math.min(255, Math.round(127.5 + (f[k]! - m) / (3 * s) * 127.5)));
  return out;
}

const smooth = (a: number, b: number, v: number) => { const t = v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a); return t * t * (3 - 2 * t); };
/** the picture at uv (repeating, bilinear, as the GPU reads it), 0..1 */
export function sampleNoise(tex: Uint8Array, u: number, v: number): number {
  const N = SUN_TEX, x = fract(u) * N - 0.5, y = fract(v) * N - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const at = (i: number, j: number) => tex[(((j % N) + N) % N) * N + (((i % N) + N) % N)]! / 255;
  const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx, b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
  return a + (b - a) * fy;
}
/** the sun (0 overcast .. 1 full sun) at map tile (x, y) for the reads' offsets off (sunOffsets): the CPU reference of SUN_GLSL sunAt */
export function sunAt(tex: Uint8Array, x: number, y: number, off: readonly number[]): number {
  const c = Math.cos(TURN_B), s = Math.sin(TURN_B);
  const a = sampleNoise(tex, x / REPEAT_A + off[0]!, y / REPEAT_A + off[1]!);
  const b = sampleNoise(tex, (c * x - s * y) / REPEAT_B + off[2]!, (s * x + c * y) / REPEAT_B + off[3]!);
  return smooth(COVER - SOFT, COVER + SOFT, MIX_A * a + (1 - MIX_A) * b);
}

/** GLSL: sunAt(tile, lod) the sun at a map tile (textureLod at lod: the vertex shaders read level 0; the ground pass passes its own lod), and
 *  sunLight(c, sun) the ground's colour lit by it. Needs uniform sampler2D uSunTex (unit SUN_UNIT) and vec4 uSun (x the light's strength,
 *  y how far the overcast hides the drop shadows 0..1, z on: 1) and uSunOff (sunOffsets) */
export const SUN_GLSL = `
float sunAt(vec2 t, float lod) {
  const mat2 TB = mat2(${Math.cos(TURN_B).toFixed(6)}, ${Math.sin(TURN_B).toFixed(6)}, ${(-Math.sin(TURN_B)).toFixed(6)}, ${Math.cos(TURN_B).toFixed(6)});
  float a = textureLod(uSunTex, t / ${REPEAT_A.toFixed(1)} + uSunOff.xy, lod).r;
  float b = textureLod(uSunTex, TB * t / ${REPEAT_B.toFixed(1)} + uSunOff.zw, lod).r;
  return smoothstep(${(COVER - SOFT).toFixed(4)}, ${(COVER + SOFT).toFixed(4)}, ${MIX_A.toFixed(3)} * a + ${(1 - MIX_A).toFixed(3)} * b);
}
vec3 sunLight(vec3 c, float sun) {
  float l = dot(c, vec3(0.299, 0.587, 0.114)), k = sun * uSun.x;
  c *= 1.0 + k * ${LIFT.toFixed(4)} * vec3(${LIFT_W.map(v => v.toFixed(3)).join(', ')}) * smoothstep(${LUM_LO.toFixed(3)}, ${LUM_HI.toFixed(3)}, l);
  float hi = min(1.0, k * ${SPEC.toFixed(4)}) * smoothstep(${SPEC_LO.toFixed(3)}, ${SPEC_HI.toFixed(3)}, l);
  return 1.0 - (1.0 - c) * (1.0 - hi * vec3(${SUN_RGB.map(v => (v / 255).toFixed(4)).join(', ')}));
}
// the drop shadow's share at a ground point: 1 in the sun, 1 − uSun.y in the overcast
float sunCast(vec2 t) { return uSun.z > 0.5 ? 1.0 - uSun.y * (1.0 - sunAt(t, 0.0)) : 1.0; }
`;
/** the world px (x, y) of the 2:1 ground to its map tile, in GLSL (iso.ts tileOf without the floor; hw, hh: HW, HH) */
export const tileGlsl = (p: string, hw: number, hh: number) => `vec2(${p}.x / ${(2 * hw).toFixed(1)} + ${p}.y / ${(2 * hh).toFixed(1)}, ${p}.y / ${(2 * hh).toFixed(1)} - ${p}.x / ${(2 * hw).toFixed(1)})`;
