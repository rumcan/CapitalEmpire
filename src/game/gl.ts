/** WebGL2 drawing: baked ground chunks as textured quads, sprites as instanced quads from one texture-array atlas,
 *  soft shadows as instanced ellipses, and vehicles as points for the planner view. Coordinates are world px. */
import { ATLAS_PAGES, ATLAS_SIZE } from './library';

/** floats per sprite instance: rect x0 y0 x1 y1 (world px), uv u0 v0 u1 v1, layer, alpha, cullable, spare, clip x0 y0 x1 y1 (world px) */
export const SPRITE_STRIDE = 16;
/** floats per shadow instance: centre x y, radii rx ry (world px), clip x0 y0 x1 y1 */
export const SHADOW_STRIDE = 8;
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
const FS_SPRITE = `#version 300 es
precision highp float; precision mediump sampler2DArray;
uniform sampler2DArray uAtlas;
in vec3 vUV; in float vAlpha; in vec2 vW; flat in vec4 vClip; out vec4 o;
void main() {
  if (vW.x < vClip.x || vW.y < vClip.y || vW.x >= vClip.z || vW.y >= vClip.w) discard;
  vec4 c = texture(uAtlas, vUV); if (c.a < 0.004) discard; o = c * vAlpha;
}`;
const VS_SHADOW = `#version 300 es
layout(location=0) in vec4 aEll; layout(location=1) in vec4 aClip;
uniform vec4 uCam; uniform vec2 uScreen;
out vec2 vP; out vec2 vW; flat out vec4 vClip;
void main() {
  vec2 c = vec2(gl_VertexID & 1, gl_VertexID >> 1) * 2.0 - 1.0;
  vec2 w = aEll.xy + c * aEll.zw;
  vec2 s = (w - uCam.xy) * uCam.z + uScreen * 0.5;
  gl_Position = vec4(s.x / uScreen.x * 2.0 - 1.0, 1.0 - s.y / uScreen.y * 2.0, 0.0, 1.0);
  vP = c; vW = w; vClip = aClip;
}`;
const FS_SHADOW = `#version 300 es
precision highp float;
in vec2 vP; in vec2 vW; flat in vec4 vClip; out vec4 o;
void main() { if (vW.x < vClip.x || vW.y < vClip.y || vW.x >= vClip.z || vW.y >= vClip.w) discard; float d = dot(vP, vP); float a = 0.24 * (1.0 - smoothstep(0.55, 1.0, d)); o = vec4(0.0, 0.0, 0.0, a); }`;
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
void main() { vec2 p = gl_PointCoord * 2.0 - 1.0; if (dot(p, p) > 1.0) discard; o = vec4(vCol.rgb * vCol.a, vCol.a); }`;

type Prog = { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };

export class GLRenderer {
  gl: WebGL2RenderingContext;
  private quad: Prog; private sprite: Prog; private shadow: Prog; private point: Prog;
  atlas: WebGLTexture | null = null; atlasReady = false;
  private dyn: WebGLBuffer; private dynCap = 0;
  private maskTex: WebGLTexture; private emptyTex: WebGLTexture;
  view: View = { X: 0, Y: 0, ze: 1, cw: 1, ch: 1 };
  stats = { draws: 0, instances: 0, uploadFloats: 0 };

  constructor(public canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.quad = this.program(VS_QUAD, FS_QUAD, ['uRect', 'uCam', 'uScreen', 'uUV', 'uTex', 'uMask', 'uMode', 'uAlpha']);
    this.sprite = this.program(VS_SPRITE, FS_SPRITE, ['uCam', 'uScreen', 'uMinPx', 'uAtlas']);
    this.shadow = this.program(VS_SHADOW, FS_SHADOW, ['uCam', 'uScreen']);
    this.point = this.program(VS_POINT, FS_POINT, ['uCam', 'uScreen', 'uSize']);
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

  /** load the sprite atlas pages into one texture array; dpr-1 screens skip mip 0 (half the memory) */
  async loadAtlas(hiDpi: boolean) {
    const gl = this.gl, base = hiDpi ? 0 : 1, levels = ATLAS_PAGES[0].length - base, size = ATLAS_SIZE >> base;
    const tex = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, gl.RGBA8, size, size, ATLAS_PAGES.length);
    const bmps = await Promise.all(ATLAS_PAGES.flatMap((row, p) => row.slice(base).map(async (url, m) => ({ p, m, bmp: await createImageBitmap(await (await fetch(url)).blob(), { premultiplyAlpha: 'premultiply', colorSpaceConversion: 'none' }) }))));
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    for (const { p, m, bmp } of bmps) { gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, m, 0, 0, p, bmp.width, bmp.height, 1, gl.RGBA, gl.UNSIGNED_BYTE, bmp); bmp.close(); }
    this.texParams(gl.TEXTURE_2D_ARRAY, true);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAX_LEVEL, levels - 1);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic'); if (aniso) gl.texParameterf(gl.TEXTURE_2D_ARRAY, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 2);
    this.atlas = tex; this.atlasReady = true;
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
    if (!count || !this.atlas) return; const gl = this.gl, pr = this.sprite;
    gl.useProgram(pr.p); this.camUniforms(pr); gl.uniform1f(pr.u.uMinPx, minPx);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlas); gl.uniform1i(pr.u.uAtlas, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn);
    const B = SPRITE_STRIDE * 4, o = firstFloat * 4;
    for (let i = 0; i < 4; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 4, gl.FLOAT, false, B, o + i * 16); gl.vertexAttribDivisor(i, 1); }
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    for (let i = 0; i < 4; i++) { gl.vertexAttribDivisor(i, 0); gl.disableVertexAttribArray(i); }
    this.stats.draws++; this.stats.instances += count;
  }
  /** instances at float offset `firstFloat` of the uploaded stream, as soft ground shadows */
  drawShadows(firstFloat: number, count: number) {
    if (!count) return; const gl = this.gl, pr = this.shadow;
    gl.useProgram(pr.p); this.camUniforms(pr); gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn);
    for (let i = 0; i < 2; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 4, gl.FLOAT, false, SHADOW_STRIDE * 4, firstFloat * 4 + i * 16); gl.vertexAttribDivisor(i, 1); }
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    for (let i = 0; i < 2; i++) { gl.vertexAttribDivisor(i, 0); gl.disableVertexAttribArray(i); }
    this.stats.draws++; this.stats.instances += count;
  }
  /** points at float offset `firstFloat` of the uploaded stream */
  drawPoints(firstFloat: number, count: number, size: number) {
    if (!count) return; const gl = this.gl, pr = this.point;
    gl.useProgram(pr.p); this.camUniforms(pr); gl.uniform1f(pr.u.uSize, size); gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn);
    const B = POINT_STRIDE * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, B, firstFloat * 4);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, B, firstFloat * 4 + 8);
    gl.drawArrays(gl.POINTS, 0, count);
    gl.disableVertexAttribArray(0); gl.disableVertexAttribArray(1); this.stats.draws++;
  }
}
