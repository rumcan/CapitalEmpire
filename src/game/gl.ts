/** WebGL2 drawing: baked ground chunks as textured quads, sprites as instanced quads from the streamed atlas (atlas-gl.ts),
 *  contact shadows as instanced ground shapes (TrickOrTreat's base shadows, shadow-shape.ts), and vehicles as points for the planner view.
 *  Coordinates are world px.
 *
 *  The shadow layer (T185, the owner, 2026-10-27: "two shadows blocking the same light does not multiply a shadow"): every sprite shadow (the
 *  silhouette casts, the T141 shapes, the vector contact and cast shapes) draws its darkness into one offscreen coverage layer with MAX
 *  blending (beginShadows), so where shadows overlap the ground is as dark as the darkest of them, never their product; the layer then
 *  darkens the ground once (endShadows: a multiply by cast-shadow.ts shadowMultiplier, the one cool shadow colour, so the texture stays). */
import { ATLAS_PAGES, ATLAS_SIZE } from './library';
import { AtlasGL, type AtlasSource } from './atlas-gl';
import { atlasMip0 } from './sizes';
import { CONTACT_LEAN } from './shadow-shape';
import { CONTACT_AO, VERTEX_FLOATS, type VectorMesh } from './shadow-vector';
import { SHADOW_AMBIENT } from './cast-shadow';
import { BRAKE_LIGHT } from './sim/car-lamps';
import { LAMP_LIT_GLSL, SPEC_MASK_K } from './lamp-reflect';

/** floats per sprite instance: rect x0 y0 x1 y1 (world px), uv u0 v0 u1 v1, layer, alpha, cullable, foot line (world px; < 0: casts no shadow),
 *  clip x0 y0 x1 y1 (world px), foot: the footprint's near corner x y and its left and right corners' x (world px; the cast shadows stand on it) */
export const SPRITE_STRIDE = 20;
/** floats per shadow instance: centre x y (world px), half extents hx hy (metres along the map's axes), core, feather (metres), round (0 / 1),
 *  lean (a multiplier of the common lean, shadow-shape.ts contactShadow), clip x0 y0 x1 y1 (world px), the sprite's picture height (world px) and
 *  its cull flag (T216: 1 when cullable, so the shadow goes with its sprite, see CULL_MIN_PX), then two spare */
export const SHADOW_STRIDE = 16;
/** the sprite cull (T216, the owner, 2026-10-27: "the bushes disappear but the shadows stay ... just remove the shadows too"): at the district
 *  zoom a cullable sprite (a small picture, not big) whose picture is shorter than this many device px (times the dpr) is not drawn, and neither
 *  are its cast, contact and vector shadows: one rule for a sprite and all its shadows (VS_SPRITE, VS_CAST, VS_SHADOW, VS_VEC) */
export const CULL_MIN_PX = 7;
/** floats per vector-shadow instance (T142, shadow-vector.ts): the anchor's ground spot x y (world px), the lift (world px: a lifted sprite
 *  casts from its ground spot that much higher, with no contact shape) and the scale; the
 *  mesh's first index and index count, and its far copy's; clip x0 y0 x1 y1 (world px); the picture's rect x0 y0 x1 y1 (world px); the picture's
 *  height and cull flag (T216, as SHADOW_STRIDE's) */
export const VECTOR_STRIDE = 20;
/** the vector mesh textures' width (texels) */
const MESH_W = 2048;
/** floats per point: x y (world px), rgba */
export const POINT_STRIDE = 6;

export interface View { X: number; Y: number; ze: number; cw: number; ch: number }
/** a chunk's whole picture (drawChunk's uv) */
export const FULL_UV: readonly number[] = [0, 0, 1, 1];

const VS_QUAD = `#version 300 es
uniform vec4 uRect; uniform vec4 uCam; // camX camY ze 0
uniform vec2 uScreen; uniform vec4 uUV;
out vec2 vUV;
void main() {
  vec2 c = vec2(gl_VertexID & 1, gl_VertexID >> 1);
  vec2 w = mix(uRect.xy, uRect.zw, c);
  vec2 s = (w - uCam.xy) * uCam.z + uScreen * 0.5;
  gl_Position = vec4(s.x / uScreen.x * 2.0 - 1.0, 1.0 - s.y / uScreen.y * 2.0, 0.0, 1.0);
  vUV = mix(uUV.xy, uUV.zw, c);
}`;
// T215: the street lamps' reflection pools as the camera specular (lamp-reflect.ts): a chunk with a reflection mask (uSpec.z > 0: its gain)
// lights its own pixels by the painting's lamp response (lampLit, the 'lit' mosaics' litPixel) at the mask's intensity times the camera
// falloff, 1 within uSpec.x of the screen's centre and 0 past uSpec.y (the distance in device px over half the longer side: round on any
// screen). The mask is a SPEC_MASK_K-th of the chunk's size (its uv scaled to the px it covers). No mask (uSpec.z 0): the chunk as before
const FS_QUAD = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform sampler2D uMask; uniform int uMode; uniform vec2 uScreen; uniform float uAlpha;
uniform sampler2D uSpecTex; uniform vec4 uSpec;
in vec2 vUV; out vec4 o;
${LAMP_LIT_GLSL}
void main() {
  vec4 c = texture(uTex, vUV);
  if (uSpec.z > 0.0) {
    float a = texture(uSpecTex, vUV * vec2(textureSize(uTex, 0)) / (${SPEC_MASK_K.toFixed(1)} * vec2(textureSize(uSpecTex, 0)))).r;
    if (a > 0.002) {
      float d = length(gl_FragCoord.xy - 0.5 * uScreen) / (0.5 * max(uScreen.x, uScreen.y));
      float I = min(a * (1.0 - smoothstep(uSpec.x, uSpec.y, d)) * uSpec.z, 1.0);
      if (I > 0.002) c.rgb = lampLit(c.rgb * 255.0, I) / 255.0;
    }
  }
  if (uMode == 1) c *= texture(uMask, vec2(gl_FragCoord.x / uScreen.x, 1.0 - gl_FragCoord.y / uScreen.y)).a;
  o = c * uAlpha;
}`;
const VS_SPRITE = `#version 300 es
layout(location=0) in vec4 aRect; layout(location=1) in vec4 aUV; layout(location=2) in vec4 aMisc; layout(location=3) in vec4 aClip;
uniform vec4 uCam; uniform vec2 uScreen; uniform float uMinPx;
out vec3 vUV; out float vAlpha; out vec2 vW; flat out vec4 vClip; flat out float vTint;
void main() {
  vec2 c = vec2(gl_VertexID & 1, gl_VertexID >> 1);
  vec2 w = mix(aRect.xy, aRect.zw, c);
  vec2 s = (w - uCam.xy) * uCam.z + uScreen * 0.5;
  bool cull = aMisc.z > 0.5 && (aRect.w - aRect.y) * uCam.z < uMinPx;
  vTint = aMisc.y > 1.5 ? 1.0 : 0.0; // T176: 2 + alpha marks a tinted sprite
  gl_Position = cull ? vec4(2.0, 2.0, 2.0, 1.0) : vec4(s.x / uScreen.x * 2.0 - 1.0, 1.0 - s.y / uScreen.y * 2.0, 0.0, 1.0);
  vUV = vec3(mix(aUV.xy, aUV.zw, c), aMisc.x); vAlpha = aMisc.y > 1.5 ? aMisc.y - 2.0 : aMisc.y; vW = w; vClip = aClip;
}`;
// the atlas lookup (atlas-gl.ts glsl: atlasTex, from the finest resident mip of the sprite's cell) is sampled before any discard: its level of
// detail comes from derivatives, which need the whole 2 x 2 quad
const FS_SPRITE = (atlas: string) => `#version 300 es
precision highp float; precision highp int;
${atlas}
in vec3 vUV; in float vAlpha; in vec2 vW; flat in vec4 vClip; flat in float vTint; out vec4 o;
void main() {
  // T192: a lamp's glow (sim/car-lamps.ts, layer GLOW_LAYER: no atlas page): a soft disc of the brake lights' red, added (alpha 0), drawn in
  // the painter's order right after its car, so nearer sprites cover it (the branch is the same for a whole instance)
  if (vUV.z < -0.5) {
    if (vW.x < vClip.x || vW.y < vClip.y || vW.x >= vClip.z || vW.y >= vClip.w) discard;
    vec2 q = vUV.xy * 2.0 - 1.0; float d = dot(q, q); if (d >= 1.0) discard;
    float f = (1.0 - d) * (1.0 - d);
    o = vec4(vec3(${BRAKE_LIGHT.colour.map(v => v.toFixed(3)).join(', ')}) * (vAlpha * f), 0.0); return;
  }
  vec4 c = atlasTex(vUV.xy, vUV.z);
  if (vW.x < vClip.x || vW.y < vClip.y || vW.x >= vClip.z || vW.y >= vClip.w) discard;
  if (c.a < 0.004) discard;
  // T176: a tinted sprite (a tree a Build would clear): its own light and shade in one warm rust red (its luminance times the tint), so it
  // reads as marked even among autumn reds, and the art's own darks stay dark (the owner's light rule)
  if (vTint > 0.5) { float l = dot(c.rgb, vec3(0.299, 0.587, 0.114)); c.rgb = min(vec3(l) * vec3(1.8, 0.66, 0.44), vec3(c.a)); }
  o = c * vAlpha;
}`;
// cast shadows (cast-shadow.ts): each sprite's silhouette laid on the ground away from the sun. Every column of the picture stands on its own
// foot: the front edges of its footprint diamond (aFoot: the near corner x y, the left and right corners' x, world px; past the corners the
// corner's height), so a long diagonal sprite (a fence) or a building's front corner casts from where it stands, not from one line through its
// middle. A point h px above its foot moves to (x + h * uCast.x, foot + h * uCast.y); the picture below its foot (steps, shrubs in front) casts
// nothing. Drawn as five vertical slices (the rect's sides and the three corners), each an exact affine map. aMisc.w < 0: casts none. Each
// tile's copy of a sprite casts only the part of the sprite in that tile (clipped in the sprite's own place), so a sprite over several tiles
// casts once
const VS_CAST = `#version 300 es
layout(location=0) in vec4 aRect; layout(location=1) in vec4 aUV; layout(location=2) in vec4 aMisc; layout(location=3) in vec4 aClip;
layout(location=4) in vec4 aFoot;
uniform vec4 uCam; uniform vec2 uScreen; uniform vec4 uCast; uniform float uMinPx;
out vec3 vUV; out float vAlpha; out vec2 vW; flat out vec4 vClip;
float foot(float x) { float cx = clamp(x, aFoot.z, aFoot.w); return aFoot.y - 0.5 * abs(cx - aFoot.x); }
void main() {
  int col = gl_VertexID >> 1; bool top = (gl_VertexID & 1) == 0;
  float l = clamp(aFoot.z, aRect.x, aRect.z), b = clamp(aFoot.x, aRect.x, aRect.z), r = clamp(aFoot.w, aRect.x, aRect.z);
  float x = col == 0 ? aRect.x : col == 1 ? l : col == 2 ? b : col == 3 ? r : aRect.z;
  float f = foot(x), y = top ? aRect.y : clamp(f, aRect.y, aRect.w), h = max(f - y, 0.0);
  vec2 g = vec2(x + h * uCast.x, f + h * uCast.y);
  vec2 s = (g - uCam.xy) * uCam.z + uScreen * 0.5;
  vec2 c = vec2((x - aRect.x) / max(aRect.z - aRect.x, 1e-3), (y - aRect.y) / max(aRect.w - aRect.y, 1e-3));
  // T216: the sprite's own cull (VS_SPRITE): a sprite hidden at the district zoom casts no shadow either
  bool cull = aMisc.z > 0.5 && (aRect.w - aRect.y) * uCam.z < uMinPx;
  gl_Position = cull || aMisc.w < 0.0 ? vec4(2.0, 2.0, 2.0, 1.0) : vec4(s.x / uScreen.x * 2.0 - 1.0, 1.0 - s.y / uScreen.y * 2.0, 0.0, 1.0);
  vUV = vec3(mix(aUV.xy, aUV.zw, c), aMisc.x); vAlpha = aMisc.y > 1.5 ? aMisc.y - 2.0 : aMisc.y; vW = vec2(x, y); vClip = aClip; // T176: a tint's 2 + alpha
}`;
const FS_CAST = (atlas: string) => `#version 300 es
precision highp float; precision highp int;
${atlas}
uniform vec4 uCast;
in vec3 vUV; in float vAlpha; in vec2 vW; flat in vec4 vClip; out vec4 o;
void main() {
  float a = atlasTex(vUV.xy, vUV.z).a * vAlpha * uCast.z;
  if (vW.x < vClip.x || vW.y < vClip.y || vW.x >= vClip.z || vW.y >= vClip.w) discard;
  if (a < 0.004) discard;
  o = vec4(clamp(a, 0.0, 1.0)); // its darkness, into the shadow layer (MAX: GLRenderer.beginShadows)
}`;
// the shape's 2:1 diamond bound: 32 world px per metre across, 16 down (x = (X - Y) * 32, y = (X + Y) * 16, X and Y in metres).
// The lean (T141, shadow-shape.ts leanShift: blob and box alike): uShift is the cast shadows' screen direction times their length against the
// default (contactLean); the shape moves that way on the ground by CONTACT_LEAN.frac of its own reach from its centre to its edge in that
// direction, at most CONTACT_LEAN.max metres, times its own multiplier (aLook.w)
const VS_SHADOW = `#version 300 es
layout(location=0) in vec4 aShape; layout(location=1) in vec4 aLook; layout(location=2) in vec4 aClip; layout(location=3) in vec4 aCull;
uniform vec4 uCam; uniform vec2 uScreen; uniform vec2 uShift; uniform float uMinPx;
out vec2 vOff; out vec2 vW; flat out vec4 vShape; flat out vec4 vLook; flat out vec4 vClip;
void main() {
  vec2 c = vec2(gl_VertexID & 1, gl_VertexID >> 1) * 2.0 - 1.0;
  float e = aShape.z + aShape.w + aLook.y * 3.2;
  vec2 m = vec2(uShift.x / 32.0 + uShift.y / 16.0, uShift.y / 16.0 - uShift.x / 32.0) * 0.5, lean = vec2(0.0);
  float n = length(uShift);
  if (n > 0.0) {
    vec2 u = normalize(m), h = max(aShape.zw, vec2(1e-4));
    float reach = aLook.z > 0.5 ? 1.0 / length(u / h) : min(h.x / max(abs(u.x), 1e-4), h.y / max(abs(u.y), 1e-4));
    lean = vec2((u.x - u.y) * 32.0, (u.x + u.y) * 16.0) * min(reach * ${CONTACT_LEAN.frac.toFixed(4)}, ${CONTACT_LEAN.max.toFixed(4)}) * aLook.w * n;
  }
  vec2 off = c * vec2(e * 32.0 + 2.0, e * 16.0 + 2.0), w = aShape.xy + lean + off;
  vec2 s = (w - uCam.xy) * uCam.z + uScreen * 0.5;
  // T216: the sprite's own cull (VS_SPRITE): aCull.x its picture's height (world px), aCull.y its cull flag
  bool cull = aCull.y > 0.5 && aCull.x * uCam.z < uMinPx;
  gl_Position = cull ? vec4(2.0, 2.0, 2.0, 1.0) : vec4(s.x / uScreen.x * 2.0 - 1.0, 1.0 - s.y / uScreen.y * 2.0, 0.0, 1.0);
  vOff = off; vW = w; vShape = aShape; vLook = aLook; vClip = aClip;
}`;
// TrickOrTreat's shadows.mjs render(): a rounded box or an ellipse in ground metres, darkest at the base and feathered both inside and
// outside the edge; its darkness, times the owner's strength and CONTACT_AO (an ambient occlusion, shadow-vector.ts), into the shadow layer
// (T185: the one shadow colour is laid once, GLRenderer.endShadows). The feather is 3 px (0.09375 m: a metre along an axis is 32 px across)
// softer than the shape's own, as every contact shadow is (shadow-vector.ts BLOB_BLUR)
const FS_SHADOW = `#version 300 es
precision highp float;
in vec2 vOff; in vec2 vW; flat in vec4 vShape; flat in vec4 vLook; flat in vec4 vClip; out vec4 o;
uniform float uStrength;
void main() {
  if (vW.x < vClip.x || vW.y < vClip.y || vW.x >= vClip.z || vW.y >= vClip.w) discard;
  float A = vOff.x / 32.0, B = vOff.y / 16.0, X = (A + B) * 0.5, Y = (B - A) * 0.5, hx = vShape.z, hy = vShape.w, f = vLook.y + 0.09375, d;
  if (vLook.z > 0.5) d = (length(vec2(X / hx, Y / hy)) - 1.0) * min(hx, hy);
  else { float r = min(0.18, min(hx, hy) * 0.5); vec2 q = abs(vec2(X, Y)) - vec2(hx, hy) + r; d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
  float a = vLook.x * ${CONTACT_AO.toFixed(4)} * (1.0 - smoothstep(-f, f * 1.2, d)) * (0.82 + 0.18 * smoothstep(0.0, -min(hx, hy), d));
  a = clamp(a * uStrength, 0.0, 1.0); if (a < 0.002) discard;
  o = vec4(a);
}`;
// the vector shadows (T142, shadow-vector.ts): one instance per sprite, its mesh's triangles fetched from the mesh textures by gl_VertexID
// (vertices past its count fold away). A vertex (x, y, h) about the anchor, in the picture's px, lands at (x, y) + h * the sun's shear, times
// the sprite's scale (a mirrored sprite draws the mirrored copy of its mesh); contact vertices (kind 0) have a small h, their lean. Each tile's copy of a sprite draws only what
// falls from its part of the picture (the point h px up the picture, held to the picture's rect), so a sprite over several tiles draws once.
// Feathered by the rim's edge value (smoothstep), darkness per vertex times the contact or the cast strength, into the shadow layer (T185)
const VS_VEC = `#version 300 es
precision highp float; precision highp int; precision highp usampler2D;
layout(location=0) in vec4 aA; layout(location=1) in vec4 aB; layout(location=2) in vec4 aClip; layout(location=3) in vec4 aRect; layout(location=4) in vec4 aCull;
uniform vec4 uCam; uniform vec2 uScreen; uniform vec2 uShear; uniform vec2 uMul; uniform int uFar; uniform float uMinPx;
uniform highp sampler2D uVerts; uniform highp usampler2D uIdx;
out vec2 vSrc; out float vCore; out float vEdge; flat out vec4 vClip; flat out vec4 vRect;
void main() {
  int id = gl_VertexID, count = int((uFar == 1 ? aB.w : aB.y) + 0.5);
  vClip = aClip; vRect = aRect; vSrc = vec2(0.0); vCore = 0.0; vEdge = 0.0;
  // T216: the sprite's own cull (VS_SPRITE): aCull.x its picture's height (world px), aCull.y its cull flag
  bool cull = aCull.y > 0.5 && aCull.x * uCam.z < uMinPx;
  if (id >= count || cull) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  int i = int((uFar == 1 ? aB.z : aB.x) + 0.5) + id;
  int v = int(texelFetch(uIdx, ivec2(i % ${MESH_W}, i / ${MESH_W}), 0).r) * 2;
  vec4 A = texelFetch(uVerts, ivec2(v % ${MESH_W}, v / ${MESH_W}), 0), B = texelFetch(uVerts, ivec2((v + 1) % ${MESH_W}, (v + 1) / ${MESH_W}), 0);
  float mul = A.w > 0.5 ? uMul.y : aA.z > 0.0 ? 0.0 : uMul.x;
  if (mul <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float h = A.z * aA.w + aA.z;
  vec2 w = aA.xy + vec2(A.x, A.y) * aA.w + h * uShear;
  vSrc = aA.xy + vec2(A.x * aA.w, A.y * aA.w - h); vCore = B.x * mul; vEdge = B.y;
  vec2 s = (w - uCam.xy) * uCam.z + uScreen * 0.5;
  gl_Position = vec4(s.x / uScreen.x * 2.0 - 1.0, 1.0 - s.y / uScreen.y * 2.0, 0.0, 1.0);
}`;
const FS_VEC = `#version 300 es
precision highp float;
in vec2 vSrc; in float vCore; in float vEdge; flat in vec4 vClip; flat in vec4 vRect; out vec4 o;
void main() {
  vec2 p = clamp(vSrc, vRect.xy, vRect.zw);
  if (p.x < vClip.x || p.y < vClip.y || p.x >= vClip.z || p.y >= vClip.w) discard;
  float a = clamp(vCore * smoothstep(0.0, 1.0, vEdge), 0.0, 1.0); if (a < 0.002) discard;
  o = vec4(a);
}`;
// the shadow layer laid on the ground once (T185): one full-screen triangle, each pixel multiplied by the shadow colour's multiplier at its
// coverage (cast-shadow.ts shadowMultiplier: mix(1, SHADOW_AMBIENT, a), a multiply, so the ground keeps its texture). T186: the layer's
// green holds the ground's own baked shade as a coverage (drawShadeMask): the ground is already that dark, so a sprite shadow darkens it
// only as far as it is darker than that, M(s) / M(b), and not at all where the baked shade is the darker (the max of the two, not the product)
const VS_FULL = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID & 1) << 2) - 1.0, float((gl_VertexID & 2) << 1) - 1.0); gl_Position = vec4(p, 0.0, 1.0); }`;
const FS_LAYER = `#version 300 es
precision highp float;
uniform sampler2D uLayer; uniform vec3 uAmbient; out vec4 o;
void main() {
  vec2 sb = texelFetch(uLayer, ivec2(gl_FragCoord.xy), 0).rg; if (sb.r < sb.g + 0.002) discard;
  o = vec4(mix(vec3(1.0), uAmbient, sb.r) / mix(vec3(1.0), uAmbient, sb.g), 1.0);
}`;
// T186: a ground chunk's baked shade mask (ground-cache.ts Tile.shade: the multiplier its bake laid, white where none) into the shadow layer's
// green, as the coverage of the one shadow colour as dark (by luminance): 1 - lum = a * (1 - lum(SHADOW_AMBIENT)); the darkest wins (MAX)
const FS_SHADEMASK = `#version 300 es
precision highp float;
uniform sampler2D uTex; in vec2 vUV; out vec4 o;
void main() {
  float l = dot(texture(uTex, vUV).rgb, vec3(0.299, 0.587, 0.114));
  o = vec4(0.0, clamp((1.0 - l) / ${(1 - (0.299 * SHADOW_AMBIENT[0] + 0.587 * SHADOW_AMBIENT[1] + 0.114 * SHADOW_AMBIENT[2])).toFixed(5)}, 0.0, 1.0), 0.0, 0.0);
}`;
const VS_POINT = `#version 300 es
layout(location=0) in vec2 aPos; layout(location=1) in vec4 aCol;
uniform vec4 uCam; uniform vec2 uScreen; uniform float uSize;
out vec4 vCol;
void main() {
  vec2 s = (aPos - uCam.xy) * uCam.z + uScreen * 0.5;
  gl_Position = vec4(s.x / uScreen.x * 2.0 - 1.0, 1.0 - s.y / uScreen.y * 2.0, 0.0, 1.0);
  gl_PointSize = uSize; vCol = aCol;
}`;
const FS_POINT = `#version 300 es
precision highp float;
in vec4 vCol; out vec4 o;
uniform int uSoft;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0; float d = dot(p, p); if (d > 1.0) discard;
  if (uSoft == 1) { float f = (1.0 - d) * (1.0 - d); o = vec4(vCol.rgb * vCol.a * f, 0.0); }
  else o = vec4(vCol.rgb * vCol.a, vCol.a);
}`;

type Prog = { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };

export class GLRenderer {
  gl: WebGL2RenderingContext;
  private quad: Prog; private shadow: Prog; private point: Prog; private vec: Prog; private layerProg: Prog; private shadeProg: Prog;
  /** the shadow layer (T185): a screen-sized coverage texture (RG8: red the sprite shadows, green the ground's baked shade, T186) and its
   *  framebuffer; open between beginShadows and endShadows */
  private layerTex: WebGLTexture | null = null; private layerFbo: WebGLFramebuffer | null = null; private layerW = 0; private layerH = 0;
  private layerOpen = false; private layerUsed = false;
  /** the vector shadows' mesh textures (initVector) */
  private vecVerts: WebGLTexture | null = null; private vecIdx: WebGLTexture | null = null;
  /** the sprite and cast-shadow programs: built with the atlas (initAtlas), whose residency plan their lookup is compiled for */
  private sprite: Prog | null = null; private cast: Prog | null = null;
  /** the sprite atlas (T080, atlas-gl.ts): the always-resident low set, the streamed cell tiers and the lookup */
  atlas: AtlasGL | null = null; atlasReady = false;
  private dyn: WebGLBuffer; private dynCap = 0;
  private maskTex: WebGLTexture; private emptyTex: WebGLTexture;
  view: View = { X: 0, Y: 0, ze: 1, cw: 1, ch: 1 };
  stats = { draws: 0, instances: 0, uploadFloats: 0 };

  constructor(public canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.quad = this.program(VS_QUAD, FS_QUAD, ['uRect', 'uCam', 'uScreen', 'uUV', 'uTex', 'uMask', 'uMode', 'uAlpha', 'uSpecTex', 'uSpec']);
    this.shadow = this.program(VS_SHADOW, FS_SHADOW, ['uCam', 'uScreen', 'uStrength', 'uShift', 'uMinPx']);
    this.point = this.program(VS_POINT, FS_POINT, ['uCam', 'uScreen', 'uSize', 'uSoft']);
    this.vec = this.program(VS_VEC, FS_VEC, ['uCam', 'uScreen', 'uShear', 'uMul', 'uFar', 'uVerts', 'uIdx', 'uMinPx']);
    this.layerProg = this.program(VS_FULL, FS_LAYER, ['uLayer', 'uAmbient']);
    this.shadeProg = this.program(VS_QUAD, FS_SHADEMASK, ['uRect', 'uCam', 'uScreen', 'uUV', 'uTex']);
    this.dyn = gl.createBuffer()!;
    this.maskTex = gl.createTexture()!; this.emptyTex = gl.createTexture()!;
    for (const t of [this.maskTex, this.emptyTex]) { gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255])); this.texParams(gl.TEXTURE_2D, false); }
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  }
  private program(vs: string, fs: string, names: string[]): Prog {
    const gl = this.gl, p = gl.createProgram()!;
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
      const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      gl.attachShader(p, s);
    }
    gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
    return { p, u: Object.fromEntries(names.map(n => [n, gl.getUniformLocation(p, n)])) };
  }
  private texParams(target: number, mip: boolean) {
    const gl = this.gl;
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR); gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** Plan the sprite atlas for this screen within GAME-PLAN's budget (atlas-pages.ts), load its always-resident low set (every page from a
   *  coarse mip down) and build the sprite programs for it. The finer mips stream in per cell as the view needs them (engine.ts streamAtlas,
   *  then pumpAtlas every frame). Mip 0 only on screens above 1x (sizes.ts atlasMip0). The sources are tried in order (the compressed KTX2
   *  pages, then the WebP pages as RGBA8): one that fails to load its low set gives way to the next. */
  /** budgetMB: a light boot's atlas budget (compressed MB, T157), null or none: GAME-PLAN's for the screen; keep: a light boot's decoded page
   *  levels kept (null or none: atlas-gl.ts KEEP_LEVELS) */
  async initAtlas(dpr: number, sources: AtlasSource[], budgetMB: number | null = null, keep: number | null = null) {
    let a: AtlasGL | null = null, err: unknown = null;
    const budget = budgetMB === null ? undefined : budgetMB * 1024 * 1024;
    for (const source of sources) {
      try { a = await AtlasGL.create(this.gl, { dpr, pages: ATLAS_PAGES.length, size: ATLAS_SIZE, levels: ATLAS_PAGES[0]!.length, finest: atlasMip0(dpr) ? 0 : 1, source, budget, keep: keep ?? undefined }); break; }
      catch (e) { err = e; console.warn('[atlas]', String(e), '- trying the next source'); }
    }
    if (!a) throw err;
    const lib = a.glsl(), samplers = a.samplerNames();
    this.sprite = this.program(VS_SPRITE, FS_SPRITE(lib), ['uCam', 'uScreen', 'uMinPx', ...samplers]);
    this.cast = this.program(VS_CAST, FS_CAST(lib), ['uCam', 'uScreen', 'uCast', 'uMinPx', ...samplers]);
    this.atlas = a; this.atlasReady = true;
  }
  /** bind the atlas textures for a sprite program (units 2 on: 0 and 1 are the chunks' texture and mask; the chunk program's reflection mask, T215,
   *  is on 2 too, rebound with every chunk, as the atlas is with every sprite draw) */
  private bindAtlas(pr: Prog) {
    const a = this.atlas!, units = a.bind(2); a.samplerNames().forEach((n, i) => this.gl.uniform1i(pr.u[n]!, units[i]!));
  }
  /** a texture from a baked ground chunk */
  textureFrom(bmp: ImageBitmap) {
    const gl = this.gl, t = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bmp); this.texParams(gl.TEXTURE_2D, false);
    return t;
  }
  /** T215: a single-channel texture (R8, the bitmap's red) from a baked chunk's reflection mask (renderer.ts takeSpecMask) */
  maskTextureFrom(bmp: ImageBitmap) {
    const gl = this.gl, t = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, bmp); this.texParams(gl.TEXTURE_2D, false);
    return t;
  }
  deleteTexture(t: WebGLTexture) { this.gl.deleteTexture(t); }
  /** T215: the camera specular this frame (engine.ts: lamp-reflect.ts specGain and the knobs), or null (specCam off): the falloff's inner and
   *  outer radius and the gain a chunk drawn with a reflection mask lights its pools by */
  spec: { inner: number; outer: number; gain: number } | null = null;
  /** the build-reveal mask (alpha), in screen space */
  setMask(src: OffscreenCanvas | HTMLCanvasElement | null) {
    if (!src) return; const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  }

  begin(v: View, clear: [number, number, number]) {
    const gl = this.gl; this.view = v; this.stats = { draws: 0, instances: 0, uploadFloats: 0 };
    gl.viewport(0, 0, v.cw, v.ch); gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(clear[0], clear[1], clear[2], 1); gl.clear(gl.COLOR_BUFFER_BIT);
  }
  private camUniforms(pr: Prog) { const v = this.view, gl = this.gl; gl.uniform4f(pr.u.uCam, v.X, v.Y, v.ze, 0); gl.uniform2f(pr.u.uScreen, v.cw, v.ch); }
  /** world rect -> device px, rounded so neighbouring rects share exact edges */
  screenRect(X0: number, Y0: number, X1: number, Y1: number) {
    const v = this.view, sx = (X: number) => Math.round((X - v.X) * v.ze + v.cw / 2), sy = (Y: number) => Math.round((Y - v.Y) * v.ze + v.ch / 2);
    return [sx(X0), sy(Y0), sx(X1), sy(Y1)];
  }
  /** a baked chunk; masked = draw through the reveal mask; spec = its picture's reflection mask (T215, GroundCache.specOf), lit by this.spec */
  drawChunk(tex: WebGLTexture, X0: number, Y0: number, X1: number, Y1: number, masked = false, alpha = 1, uv: readonly number[] = FULL_UV, spec: WebGLTexture | null = null) {
    const gl = this.gl, pr = this.quad, sp = spec && this.spec && this.spec.gain > 0 ? this.spec : null; gl.useProgram(pr.p); this.camUniforms(pr);
    gl.uniform4f(pr.u.uRect, X0, Y0, X1, Y1); gl.uniform4f(pr.u.uUV, uv[0], uv[1], uv[2], uv[3]); gl.uniform1i(pr.u.uMode, masked ? 1 : 0); gl.uniform1f(pr.u.uAlpha, alpha);
    gl.uniform4f(pr.u.uSpec, sp ? sp.inner : 0, sp ? sp.outer : 1, sp ? sp.gain : 0, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(pr.u.uTex, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, masked ? this.maskTex : this.emptyTex); gl.uniform1i(pr.u.uMask, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, sp ? spec : this.emptyTex); gl.uniform1i(pr.u.uSpecTex, 2);
    gl.activeTexture(gl.TEXTURE0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); this.stats.draws++;
  }
  /** upload this frame's dynamic instance data (sprites, shadows and points share one stream buffer) */
  upload(data: Float32Array, floats: number) { return this.uploadParts([[data, floats]])[0]; }
  /** several arrays back to back in the stream buffer; returns each one's float offset */
  uploadParts(parts: [Float32Array, number][]) {
    const gl = this.gl, total = parts.reduce((s, p) => s + p[1], 0), at: number[] = []; gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn);
    if (total > this.dynCap) { this.dynCap = Math.max(total, this.dynCap * 2, 65536); gl.bufferData(gl.ARRAY_BUFFER, this.dynCap * 4, gl.STREAM_DRAW); }
    let o = 0; for (const [d, n] of parts) { at.push(o); if (n) gl.bufferSubData(gl.ARRAY_BUFFER, o * 4, d, 0, n); o += n; }
    this.stats.uploadFloats += total; return at;
  }
  scissor(r: number[] | null) {
    const gl = this.gl; if (!r) { gl.disable(gl.SCISSOR_TEST); return; }
    gl.enable(gl.SCISSOR_TEST); gl.scissor(r[0], this.view.ch - r[3], Math.max(0, r[2] - r[0]), Math.max(0, r[3] - r[1]));
  }
  /** sprite instances at float offset `firstFloat` of the uploaded stream */
  drawSprites(firstFloat: number, count: number, minPx: number) {
    if (!count || !this.atlas || !this.sprite) return; const gl = this.gl, pr = this.sprite;
    gl.useProgram(pr.p); this.camUniforms(pr); gl.uniform1f(pr.u.uMinPx, minPx);
    this.bindAtlas(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn);
    const B = SPRITE_STRIDE * 4, o = firstFloat * 4;
    for (let i = 0; i < 4; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 4, gl.FLOAT, false, B, o + i * 16); gl.vertexAttribDivisor(i, 1); }
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    for (let i = 0; i < 4; i++) { gl.vertexAttribDivisor(i, 0); gl.disableVertexAttribArray(i); }
    this.stats.draws++; this.stats.instances += count;
  }
  /** Open the shadow layer (T185): drawCast, drawShadows and drawVector then draw their darkness into it, the darkest winning where they
   *  overlap (MAX blending), until endShadows lays it on what is drawn so far (the ground). Outside it they would draw coverage straight onto
   *  the screen, so every frame that draws shadows opens it first */
  beginShadows() {
    const gl = this.gl, { cw, ch } = this.view;
    if (!this.layerTex || this.layerW !== cw || this.layerH !== ch) {
      if (this.layerTex) gl.deleteTexture(this.layerTex);
      this.layerTex = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, this.layerTex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RG8, Math.max(1, cw), Math.max(1, ch));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.layerFbo ??= gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.layerFbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.layerTex, 0);
      this.layerW = cw; this.layerH = ch;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.layerFbo);
    gl.viewport(0, 0, cw, ch); gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
    // (the sprite shadows write red only; drawShadeMask green only)
    gl.colorMask(true, false, false, false);
    this.layerOpen = true; this.layerUsed = false;
  }
  /** T186: a ground chunk's baked shade mask (ground-cache.ts Tile.shade) over world rect x0 y0 x1 y1 (uv: the part of the mask it covers),
   *  into the open shadow layer's green: where the ground is already shaded, a sprite shadow darkens it only past that (endShadows) */
  drawShadeMask(tex: WebGLTexture, X0: number, Y0: number, X1: number, Y1: number, uv: readonly number[] = [0, 0, 1, 1]) {
    if (!this.layerOpen) return;
    const gl = this.gl, pr = this.shadeProg; gl.useProgram(pr.p); this.camUniforms(pr);
    gl.uniform4f(pr.u.uRect, X0, Y0, X1, Y1); gl.uniform4f(pr.u.uUV, uv[0]!, uv[1]!, uv[2]!, uv[3]!);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(pr.u.uTex, 0);
    gl.colorMask(false, true, false, false); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.colorMask(true, false, false, false);
    this.stats.draws++;
  }
  /** Close the shadow layer and lay it on the screen: every pixel times the shadow colour's multiplier at its coverage (a multiply: the ground
   *  keeps its texture). Nothing drawn into it: nothing laid */
  endShadows() {
    if (!this.layerOpen) return;
    const gl = this.gl, pr = this.layerProg;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.blendEquation(gl.FUNC_ADD); gl.colorMask(true, true, true, true);
    this.layerOpen = false;
    if (this.layerUsed) {
      gl.useProgram(pr.p); gl.uniform3f(pr.u.uAmbient, SHADOW_AMBIENT[0], SHADOW_AMBIENT[1], SHADOW_AMBIENT[2]);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.layerTex); gl.uniform1i(pr.u.uLayer, 0);
      gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
      gl.drawArrays(gl.TRIANGLES, 0, 3); this.stats.draws++;
    }
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
  /** sprite instances at float offset `firstFloat`, as their cast shadows (cast-shadow.ts): sheared by (sx, sy) per px of height, darkness `strength`;
   *  minPx the sprite cull (CULL_MIN_PX times the dpr at the district zoom, else 0: as drawSprites) */
  drawCast(firstFloat: number, count: number, sx: number, sy: number, strength: number, minPx: number) {
    if (!count || !this.atlas || !this.cast || strength <= 0) return; const gl = this.gl, pr = this.cast;
    this.layerUsed = true;
    gl.useProgram(pr.p); this.camUniforms(pr); gl.uniform4f(pr.u.uCast, sx, sy, strength, 0); gl.uniform1f(pr.u.uMinPx, minPx);
    this.bindAtlas(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn);
    const B = SPRITE_STRIDE * 4, o = firstFloat * 4;
    for (let i = 0; i < 5; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 4, gl.FLOAT, false, B, o + i * 16); gl.vertexAttribDivisor(i, 1); }
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 10, count);
    for (let i = 0; i < 5; i++) { gl.vertexAttribDivisor(i, 0); gl.disableVertexAttribArray(i); }
    this.stats.draws++;
  }
  /** instances at float offset `firstFloat` of the uploaded stream, as contact shadows; strength scales their darkness (1 = the builder's); (shiftX,
   *  shiftY) the lean (shadow-shape.ts contactLean: the cast shadows' screen direction times their length against the default) */
  drawShadows(firstFloat: number, count: number, strength = 1, shiftX = 0, shiftY = 0, minPx = 0) {
    if (!count || strength <= 0) return; const gl = this.gl, pr = this.shadow;
    this.layerUsed = true;
    gl.useProgram(pr.p); this.camUniforms(pr); gl.uniform1f(pr.u.uStrength, strength); gl.uniform2f(pr.u.uShift, shiftX, shiftY); gl.uniform1f(pr.u.uMinPx, minPx); gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn);
    for (let i = 0; i < 4; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 4, gl.FLOAT, false, SHADOW_STRIDE * 4, firstFloat * 4 + i * 16); gl.vertexAttribDivisor(i, 1); }
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    for (let i = 0; i < 4; i++) { gl.vertexAttribDivisor(i, 0); gl.disableVertexAttribArray(i); }
    this.stats.draws++; this.stats.instances += count;
  }
  /** upload the vector shadows' mesh (shadow-vector.ts vectorMesh): its vertices, two RGBA32F texels each, and its indices (R32UI) */
  initVector(m: VectorMesh) {
    if (m.verts.length < m.nVerts * VERTEX_FLOATS) throw new Error('initVector: the mesh data was released (shadow-vector.ts releaseVectorMeshData)');
    const gl = this.gl, up = (tex: WebGLTexture | null, data: ArrayBufferView, texels: number, ifmt: number, fmt: number, type: number, per: number) => {
      const h = Math.max(1, Math.ceil(texels / MESH_W)), t = tex ?? gl.createTexture()!;
      const buf = new (data.constructor as Float32ArrayConstructor | Uint32ArrayConstructor)(MESH_W * h * per); buf.set(data as Float32Array & Uint32Array);
      gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, MESH_W, h, 0, fmt, type, buf);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.vecVerts = up(this.vecVerts, m.verts.subarray(0, m.nVerts * VERTEX_FLOATS), m.nVerts * 2, gl.RGBA32F, gl.RGBA, gl.FLOAT, 4);
    this.vecIdx = up(this.vecIdx, m.idx.subarray(0, m.nIdx), m.nIdx, gl.R32UI, gl.RED_INTEGER, gl.UNSIGNED_INT, 1);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
  get vectorReady() { return !!this.vecVerts; }
  /** vector-shadow instances at float offset `firstFloat` (VECTOR_STRIDE each), each drawing up to `verts` mesh vertices (its count; the rest
   *  fold away); (sx, sy) the sun's shear per px of height (none when the cast shadows are off), contact and cast their strengths; far: the
   *  meshes' far copies (the district zoom); minPx the sprite cull (T216: as drawSprites', CULL_MIN_PX times the dpr at the district zoom) */
  drawVector(firstFloat: number, count: number, verts: number, sx: number, sy: number, contact: number, cast: number, far = false, minPx = 0) {
    if (!count || !verts || !this.vecVerts || (contact <= 0 && cast <= 0)) return; const gl = this.gl, pr = this.vec;
    this.layerUsed = true;
    gl.useProgram(pr.p); this.camUniforms(pr); gl.uniform2f(pr.u.uShear, sx, sy); gl.uniform2f(pr.u.uMul, contact, cast); gl.uniform1i(pr.u.uFar, far ? 1 : 0); gl.uniform1f(pr.u.uMinPx, minPx);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.vecVerts); gl.uniform1i(pr.u.uVerts, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.vecIdx); gl.uniform1i(pr.u.uIdx, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn);
    for (let i = 0; i < 5; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 4, gl.FLOAT, false, VECTOR_STRIDE * 4, firstFloat * 4 + i * 16); gl.vertexAttribDivisor(i, 1); }
    gl.drawArraysInstanced(gl.TRIANGLES, 0, verts, count);
    for (let i = 0; i < 5; i++) { gl.vertexAttribDivisor(i, 0); gl.disableVertexAttribArray(i); }
    this.stats.draws++; this.stats.instances += count;
  }
  /** points at float offset `firstFloat` of the uploaded stream; soft: additive glows instead of hard discs */
  drawPoints(firstFloat: number, count: number, size: number, soft = false) {
    if (!count) return; const gl = this.gl, pr = this.point;
    gl.useProgram(pr.p); this.camUniforms(pr); gl.uniform1f(pr.u.uSize, size); gl.uniform1i(pr.u.uSoft, soft ? 1 : 0); gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn);
    const B = POINT_STRIDE * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, B, firstFloat * 4);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, B, firstFloat * 4 + 8);
    gl.drawArrays(gl.POINTS, 0, count);
    gl.disableVertexAttribArray(0); gl.disableVertexAttribArray(1); this.stats.draws++;
  }
}
