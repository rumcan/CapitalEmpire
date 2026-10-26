/** WebGL2 drawing: baked ground chunks as textured quads, sprites as instanced quads from the streamed atlas (atlas-gl.ts),
 *  contact shadows as instanced ground shapes (TrickOrTreat's base shadows, shadow-shape.ts), and vehicles as points for the planner view.
 *  Coordinates are world px. */
import { ATLAS_PAGES, ATLAS_SIZE } from './library';
import { AtlasGL, type AtlasSource } from './atlas-gl';
import { atlasMip0 } from './sizes';
import { CONTACT_LEAN } from './shadow-shape';
import { VERTEX_FLOATS, type VectorMesh } from './shadow-vector';

/** floats per sprite instance: rect x0 y0 x1 y1 (world px), uv u0 v0 u1 v1, layer, alpha, cullable, foot line (world px; < 0: casts no shadow),
 *  clip x0 y0 x1 y1 (world px), foot: the footprint's near corner x y and its left and right corners' x (world px; the cast shadows stand on it) */
export const SPRITE_STRIDE = 20;
/** floats per shadow instance: centre x y (world px), half extents hx hy (metres along the map's axes), core, feather (metres), round (0 / 1),
 *  lean (a multiplier of the common lean, shadow-shape.ts contactShadow), clip x0 y0 x1 y1 (world px) */
export const SHADOW_STRIDE = 12;
/** floats per vector-shadow instance (T142, shadow-vector.ts): the anchor x y (world px), the scale signed by the mirror and the scale; the
 *  mesh's first index and index count, 2 spare; clip x0 y0 x1 y1 (world px); the picture's rect x0 y0 x1 y1 (world px) */
export const VECTOR_STRIDE = 16;
/** the vector mesh textures' width (texels) */
const MESH_W = 2048;
/** floats per point: x y (world px), rgba */
export const POINT_STRIDE = 6;

export interface View { X: number; Y: number; ze: number; cw: number; ch: number }

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
const FS_QUAD = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform sampler2D uMask; uniform int uMode; uniform vec2 uScreen; uniform float uAlpha;
in vec2 vUV; out vec4 o;
void main() {
  vec4 c = texture(uTex, vUV);
  if (uMode == 1) c *= texture(uMask, vec2(gl_FragCoord.x / uScreen.x, 1.0 - gl_FragCoord.y / uScreen.y)).a;
  o = c * uAlpha;
}`;
const VS_SPRITE = `#version 300 es
layout(location=0) in vec4 aRect; layout(location=1) in vec4 aUV; layout(location=2) in vec4 aMisc; layout(location=3) in vec4 aClip;
uniform vec4 uCam; uniform vec2 uScreen; uniform float uMinPx;
out vec3 vUV; out float vAlpha; out vec2 vW; flat out vec4 vClip;
void main() {
  vec2 c = vec2(gl_VertexID & 1, gl_VertexID >> 1);
  vec2 w = mix(aRect.xy, aRect.zw, c);
  vec2 s = (w - uCam.xy) * uCam.z + uScreen * 0.5;
  bool cull = aMisc.z > 0.5 && (aRect.w - aRect.y) * uCam.z < uMinPx;
  gl_Position = cull ? vec4(2.0, 2.0, 2.0, 1.0) : vec4(s.x / uScreen.x * 2.0 - 1.0, 1.0 - s.y / uScreen.y * 2.0, 0.0, 1.0);
  vUV = vec3(mix(aUV.xy, aUV.zw, c), aMisc.x); vAlpha = aMisc.y; vW = w; vClip = aClip;
}`;
// the atlas lookup (atlas-gl.ts glsl: atlasTex, from the finest resident mip of the sprite's cell) is sampled before any discard: its level of
// detail comes from derivatives, which need the whole 2 x 2 quad
const FS_SPRITE = (atlas: string) => `#version 300 es
precision highp float; precision highp int;
${atlas}
in vec3 vUV; in float vAlpha; in vec2 vW; flat in vec4 vClip; out vec4 o;
void main() {
  vec4 c = atlasTex(vUV.xy, vUV.z);
  if (vW.x < vClip.x || vW.y < vClip.y || vW.x >= vClip.z || vW.y >= vClip.w) discard;
  if (c.a < 0.004) discard; o = c * vAlpha;
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
uniform vec4 uCam; uniform vec2 uScreen; uniform vec4 uCast;
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
  gl_Position = aMisc.w < 0.0 ? vec4(2.0, 2.0, 2.0, 1.0) : vec4(s.x / uScreen.x * 2.0 - 1.0, 1.0 - s.y / uScreen.y * 2.0, 0.0, 1.0);
  vUV = vec3(mix(aUV.xy, aUV.zw, c), aMisc.x); vAlpha = aMisc.y; vW = vec2(x, y); vClip = aClip;
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
  o = vec4(0.024, 0.031, 0.051, 1.0) * a;
}`;
// the shape's 2:1 diamond bound: 32 world px per metre across, 16 down (x = (X - Y) * 32, y = (X + Y) * 16, X and Y in metres).
// The lean (T141, shadow-shape.ts leanShift: blob and box alike): uShift is the cast shadows' screen direction times their length against the
// default (contactLean); the shape moves that way on the ground by CONTACT_LEAN.frac of its own reach from its centre to its edge in that
// direction, at most CONTACT_LEAN.max metres, times its own multiplier (aLook.w)
const VS_SHADOW = `#version 300 es
layout(location=0) in vec4 aShape; layout(location=1) in vec4 aLook; layout(location=2) in vec4 aClip;
uniform vec4 uCam; uniform vec2 uScreen; uniform vec2 uShift;
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
  gl_Position = vec4(s.x / uScreen.x * 2.0 - 1.0, 1.0 - s.y / uScreen.y * 2.0, 0.0, 1.0);
  vOff = off; vW = w; vShape = aShape; vLook = aLook; vClip = aClip;
}`;
// TrickOrTreat's shadows.mjs render(): a rounded box or an ellipse in ground metres, darkest at the base and feathered both inside and
// outside the edge, in the builder's shadow colour (6, 8, 13); premultiplied, times the owner's strength
const FS_SHADOW = `#version 300 es
precision highp float;
in vec2 vOff; in vec2 vW; flat in vec4 vShape; flat in vec4 vLook; flat in vec4 vClip; out vec4 o;
uniform float uStrength;
void main() {
  if (vW.x < vClip.x || vW.y < vClip.y || vW.x >= vClip.z || vW.y >= vClip.w) discard;
  float A = vOff.x / 32.0, B = vOff.y / 16.0, X = (A + B) * 0.5, Y = (B - A) * 0.5, hx = vShape.z, hy = vShape.w, f = vLook.y, d;
  if (vLook.z > 0.5) d = (length(vec2(X / hx, Y / hy)) - 1.0) * min(hx, hy);
  else { float r = min(0.18, min(hx, hy) * 0.5); vec2 q = abs(vec2(X, Y)) - vec2(hx, hy) + r; d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
  float a = vLook.x * (1.0 - smoothstep(-f, f * 1.2, d)) * (0.82 + 0.18 * smoothstep(0.0, -min(hx, hy), d));
  a = clamp(a * uStrength, 0.0, 1.0); if (a < 0.002) discard;
  o = vec4(vec3(6.0, 8.0, 13.0) / 255.0 * a, a);
}`;
// the vector shadows (T142, shadow-vector.ts): one instance per sprite, its mesh's triangles fetched from the mesh textures by gl_VertexID
// (vertices past its count fold away). A vertex (x, y, h) about the anchor, in the picture's px, lands at (x, y) + h * the sun's shear, times
// the sprite's scale (a mirrored sprite draws the mirrored copy of its mesh); contact vertices (kind 0) have a small h, their lean. Each tile's copy of a sprite draws only what
// falls from its part of the picture (the point h px up the picture, held to the picture's rect), so a sprite over several tiles draws once.
// Feathered by the rim's edge value (smoothstep), darkness per vertex times the contact or the cast strength; the same cool multiply
const VS_VEC = `#version 300 es
precision highp float; precision highp int; precision highp usampler2D;
layout(location=0) in vec4 aA; layout(location=1) in vec4 aB; layout(location=2) in vec4 aClip; layout(location=3) in vec4 aRect;
uniform vec4 uCam; uniform vec2 uScreen; uniform vec2 uShear; uniform vec2 uMul;
uniform highp sampler2D uVerts; uniform highp usampler2D uIdx;
out vec2 vSrc; out float vCore; out float vEdge; flat out vec4 vClip; flat out vec4 vRect;
void main() {
  int id = gl_VertexID, count = int(aB.y + 0.5);
  vClip = aClip; vRect = aRect; vSrc = vec2(0.0); vCore = 0.0; vEdge = 0.0;
  if (id >= count) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  int i = int(aB.x + 0.5) + id;
  int v = int(texelFetch(uIdx, ivec2(i % ${MESH_W}, i / ${MESH_W}), 0).r) * 2;
  vec4 A = texelFetch(uVerts, ivec2(v % ${MESH_W}, v / ${MESH_W}), 0), B = texelFetch(uVerts, ivec2((v + 1) % ${MESH_W}, (v + 1) / ${MESH_W}), 0);
  float mul = A.w > 0.5 ? uMul.y : uMul.x;
  if (mul <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 w = aA.xy + vec2(A.x, A.y) * aA.w + A.z * aA.w * uShear;
  vSrc = aA.xy + vec2(A.x, A.y - A.z) * aA.w; vCore = B.x * mul; vEdge = B.y;
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
  o = vec4(vec3(6.0, 8.0, 13.0) / 255.0 * a, a);
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
  private quad: Prog; private shadow: Prog; private point: Prog; private vec: Prog;
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
    this.quad = this.program(VS_QUAD, FS_QUAD, ['uRect', 'uCam', 'uScreen', 'uUV', 'uTex', 'uMask', 'uMode', 'uAlpha']);
    this.shadow = this.program(VS_SHADOW, FS_SHADOW, ['uCam', 'uScreen', 'uStrength', 'uShift']);
    this.point = this.program(VS_POINT, FS_POINT, ['uCam', 'uScreen', 'uSize', 'uSoft']);
    this.vec = this.program(VS_VEC, FS_VEC, ['uCam', 'uScreen', 'uShear', 'uMul', 'uVerts', 'uIdx']);
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
  async initAtlas(dpr: number, sources: AtlasSource[]) {
    let a: AtlasGL | null = null, err: unknown = null;
    for (const source of sources) {
      try { a = await AtlasGL.create(this.gl, { dpr, pages: ATLAS_PAGES.length, size: ATLAS_SIZE, levels: ATLAS_PAGES[0]!.length, finest: atlasMip0(dpr) ? 0 : 1, source }); break; }
      catch (e) { err = e; console.warn('[atlas]', String(e), '- trying the next source'); }
    }
    if (!a) throw err;
    const lib = a.glsl(), samplers = a.samplerNames();
    this.sprite = this.program(VS_SPRITE, FS_SPRITE(lib), ['uCam', 'uScreen', 'uMinPx', ...samplers]);
    this.cast = this.program(VS_CAST, FS_CAST(lib), ['uCam', 'uScreen', 'uCast', ...samplers]);
    this.atlas = a; this.atlasReady = true;
  }
  /** bind the atlas textures for a sprite program (units 2 on: 0 and 1 are the chunks' texture and mask) */
  private bindAtlas(pr: Prog) {
    const a = this.atlas!, units = a.bind(2); a.samplerNames().forEach((n, i) => this.gl.uniform1i(pr.u[n]!, units[i]!));
  }
  /** a texture from a baked ground chunk */
  textureFrom(bmp: ImageBitmap) {
    const gl = this.gl, t = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bmp); this.texParams(gl.TEXTURE_2D, false);
    return t;
  }
  deleteTexture(t: WebGLTexture) { this.gl.deleteTexture(t); }
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
  /** a baked chunk; masked = draw through the reveal mask */
  drawChunk(tex: WebGLTexture, X0: number, Y0: number, X1: number, Y1: number, masked = false, alpha = 1, uv: readonly number[] = [0, 0, 1, 1]) {
    const gl = this.gl, pr = this.quad; gl.useProgram(pr.p); this.camUniforms(pr);
    gl.uniform4f(pr.u.uRect, X0, Y0, X1, Y1); gl.uniform4f(pr.u.uUV, uv[0], uv[1], uv[2], uv[3]); gl.uniform1i(pr.u.uMode, masked ? 1 : 0); gl.uniform1f(pr.u.uAlpha, alpha);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(pr.u.uTex, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, masked ? this.maskTex : this.emptyTex); gl.uniform1i(pr.u.uMask, 1);
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
  /** sprite instances at float offset `firstFloat`, as their cast shadows (cast-shadow.ts): sheared by (sx, sy) per px of height, darkness `strength` */
  drawCast(firstFloat: number, count: number, sx: number, sy: number, strength: number) {
    if (!count || !this.atlas || !this.cast || strength <= 0) return; const gl = this.gl, pr = this.cast;
    gl.useProgram(pr.p); this.camUniforms(pr); gl.uniform4f(pr.u.uCast, sx, sy, strength, 0);
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
  drawShadows(firstFloat: number, count: number, strength = 1, shiftX = 0, shiftY = 0) {
    if (!count || strength <= 0) return; const gl = this.gl, pr = this.shadow;
    gl.useProgram(pr.p); this.camUniforms(pr); gl.uniform1f(pr.u.uStrength, strength); gl.uniform2f(pr.u.uShift, shiftX, shiftY); gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn);
    for (let i = 0; i < 3; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 4, gl.FLOAT, false, SHADOW_STRIDE * 4, firstFloat * 4 + i * 16); gl.vertexAttribDivisor(i, 1); }
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    for (let i = 0; i < 3; i++) { gl.vertexAttribDivisor(i, 0); gl.disableVertexAttribArray(i); }
    this.stats.draws++; this.stats.instances += count;
  }
  /** upload the vector shadows' mesh (shadow-vector.ts vectorMesh): its vertices, two RGBA32F texels each, and its indices (R32UI) */
  initVector(m: VectorMesh) {
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
   *  fold away); (sx, sy) the sun's shear per px of height (none when the cast shadows are off), contact and cast their strengths */
  drawVector(firstFloat: number, count: number, verts: number, sx: number, sy: number, contact: number, cast: number) {
    if (!count || !verts || !this.vecVerts || (contact <= 0 && cast <= 0)) return; const gl = this.gl, pr = this.vec;
    gl.useProgram(pr.p); this.camUniforms(pr); gl.uniform2f(pr.u.uShear, sx, sy); gl.uniform2f(pr.u.uMul, contact, cast);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.vecVerts); gl.uniform1i(pr.u.uVerts, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.vecIdx); gl.uniform1i(pr.u.uIdx, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn);
    for (let i = 0; i < 4; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 4, gl.FLOAT, false, VECTOR_STRIDE * 4, firstFloat * 4 + i * 16); gl.vertexAttribDivisor(i, 1); }
    gl.drawArraysInstanced(gl.TRIANGLES, 0, verts, count);
    for (let i = 0; i < 4; i++) { gl.vertexAttribDivisor(i, 0); gl.disableVertexAttribArray(i); }
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
