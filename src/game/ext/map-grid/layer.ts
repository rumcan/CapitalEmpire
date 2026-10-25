// The map grid and the course half grid drawn with WebGL2 (T100; the maths and the look in index.ts).
// Draw order: the engine calls draw() after the ground chunks and before the cast shadows, contact shadows and sprites. The ground chunks hold
// the roads (the ground workers paint them in), so the shader hides the lines on every road tile (the network's occupancy: asphalt, verge,
// median) and the grid reads as over the ground and its paint, under the roads, and under every building, tree, car and prop (and their
// shadows darken it like the ground). The 2D overlay and the UI stay on top.
// Speed: one full-screen triangle (the visible area only), the line maths per pixel, one texel fetch for the road mask. The occupancy lives
// in an R8UI texture of the map (2048 x 2048, 4 MB), made on the first frame that draws and kept in step with the network's version: the
// rows of the last rebuild's dirty box are uploaded, the whole map after a full rebuild or a missed version. A frame allocates nothing.
import { MAP } from '../../iso';
import { MAX_LAND, frameDraws, gridFrame, packLand, LAND_FADE_T, type GridFrame, type LandRect } from './index';

/** the camera the grid is drawn for: world px at the screen centre (X, Y), device px per world px (ze), the canvas in device px (cw, ch) */
export interface GridView { X: number; Y: number; ze: number; cw: number; ch: number }
/** the network's occupancy as the grid reads it (RoadNetwork fits): per tile 0 free, else a road's verge, asphalt or median; the version
 *  that changes on every rebuild, and the last rebuild's dirty box (tiles) and whether it was full */
export interface OccSource { occ: Uint8Array; version: number; lastDirty: readonly number[] | null; lastFull: boolean }

const VS = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
// per pixel: the tile under it (the iso inverse of x = (X - Y) * 64, y = (X + Y) * 32), the road mask, the distance in device px to the
// nearest map grid line and half grid line (fract distance in tiles over the tiles per px across a line), box-filtered coverage, and the
// half grid only on the course land (a rectangle's distance, faded over LAND_FADE_T tiles outside); premultiplied warm white
const FS = `#version 300 es
precision highp float; precision highp int; precision highp usampler2D;
#define MAXR ${MAX_LAND}
uniform vec4 uCam; uniform vec2 uScreen; uniform vec4 uLook; uniform float uHW;
uniform usampler2D uOcc; uniform int uMask; uniform vec4 uLand[MAXR]; uniform int uLandN;
out vec4 o;
float cover(float d) { return clamp(uHW + 0.5 - d, 0.0, 1.0); }
void main() {
  vec2 s = vec2(gl_FragCoord.x, uScreen.y - gl_FragCoord.y);
  vec2 W = (s - 0.5 * uScreen) / uCam.z + uCam.xy;
  float a = W.x / 64.0, b = W.y / 32.0;
  vec2 t = vec2(0.5 * (a + b), 0.5 * (b - a));
  if (uMask == 1) {
    ivec2 ti = ivec2(floor(t));
    if (ti.x >= 0 && ti.y >= 0 && ti.x < ${MAP} && ti.y < ${MAP} && texelFetch(uOcc, ti, 0).r > 0u) discard;
  }
  vec2 fM = abs(fract(t + 0.5) - 0.5) / uCam.w;
  float cM = cover(min(fM.x, fM.y)), al = cM * uLook.x;
  if (uLook.y > 0.0 || uLook.z > 0.0) {
    float inLand = 1.0;
    if (uLandN >= 0) {
      float sd = 1e9;
      for (int i = 0; i < MAXR; i++) { if (i >= uLandN) break; vec4 r = uLand[i]; vec2 q = max(r.xy - t, t - r.zw); sd = min(sd, max(q.x, q.y)); }
      inLand = 1.0 - smoothstep(0.0, ${LAND_FADE_T.toFixed(2)}, sd);
    }
    vec2 fH = abs(fract(2.0 * t + 0.5) - 0.5) / (2.0 * uCam.w);
    float h = max(cover(min(fH.x, fH.y)) * uLook.y, cM * uLook.z);
    al = mix(al, max(al, h), inLand);
  }
  if (al < 0.002) discard;
  o = vec4(vec3(1.0, 0.98, 0.9) * al, al);
}`;

/** the grid layer: its program and the occupancy texture, made on the first frame that draws */
export class MapGridLayer {
  private gl: WebGL2RenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private occTex: WebGLTexture | null = null;
  /** the network version the texture holds (-1: none yet), and the dirty box of the rebuild seen last (a version change that left it as it was
   *  is not one rebuild: a clear) */
  private occVer = -1; private occDirty: unknown = null;
  private frame: GridFrame = { map: 0, minor: 0, major: 0, hw: 0.5, tpp: 1 };
  private land = new Float32Array(MAX_LAND * 4);
  /** counters (the console and the tests of the engine): frames drawn, occupancy uploads (rows) */
  readonly stats = { draws: 0, uploads: 0, rows: 0 };
  /** a shader that failed to build leaves the layer off (reported once) */
  private broken = false;

  /** draws the grid for this frame; z is the css zoom, map the map grid setting, half a course building tool on, land the course land (none:
   *  the whole view), occ the network's occupancy (null: no road mask). True when it drew */
  draw(gl: WebGL2RenderingContext, v: GridView, z: number, dpr: number, map: boolean, half: boolean, land: readonly LandRect[], occ: OccSource | null): boolean {
    const f = gridFrame(this.frame, z, dpr, map, half);
    if (this.broken || !frameDraws(f)) return false;
    if (this.gl !== gl) { this.gl = gl; this.prog = null; this.occTex = null; this.occVer = -1; }
    if (!this.prog && !this.build(gl)) return false;
    const masked = !!occ && this.syncOcc(gl, occ);
    const n = f.minor > 0 || f.major > 0 ? packLand(land, this.land) : -1, u = this.u;
    gl.useProgram(this.prog);
    gl.uniform4f(u.uCam!, v.X, v.Y, v.ze, f.tpp);
    gl.uniform2f(u.uScreen!, v.cw, v.ch);
    gl.uniform4f(u.uLook!, f.map, f.minor, f.major, 0);
    gl.uniform1f(u.uHW!, f.hw);
    gl.uniform1i(u.uMask!, masked ? 1 : 0);
    gl.uniform1i(u.uLandN!, n);
    if (n > 0) gl.uniform4fv(u.uLand!, this.land, 0, n * 4);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, masked ? this.occTex : null); gl.uniform1i(u.uOcc!, 3);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE0);
    this.stats.draws++;
    return true;
  }

  /** frees the GL objects (the layer makes them again if it draws later) */
  dispose() {
    const gl = this.gl; if (!gl) return;
    if (this.prog) gl.deleteProgram(this.prog);
    if (this.occTex) gl.deleteTexture(this.occTex);
    this.prog = null; this.occTex = null; this.occVer = -1;
  }

  private build(gl: WebGL2RenderingContext): boolean {
    const p = gl.createProgram();
    if (!p) return false;
    for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]] as const) {
      const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('[map-grid] shader:', gl.getShaderInfoLog(s)); this.broken = true; return false; }
      gl.attachShader(p, s); gl.deleteShader(s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn('[map-grid] link:', gl.getProgramInfoLog(p)); this.broken = true; return false; }
    this.prog = p;
    for (const k of ['uCam', 'uScreen', 'uLook', 'uHW', 'uOcc', 'uMask', 'uLand', 'uLandN']) this.u[k] = gl.getUniformLocation(p, k);
    return true;
  }

  /** keeps the occupancy texture at the network's version: the dirty box's rows after one rebuild, the whole map otherwise; true when ready */
  private syncOcc(gl: WebGL2RenderingContext, src: OccSource): boolean {
    if (src.occ.length !== MAP * MAP) return false;
    let full = false;
    if (!this.occTex) {
      this.occTex = gl.createTexture();
      if (!this.occTex) return false;
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.occTex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8UI, MAP, MAP);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      full = true;
    }
    if (!full && src.version === this.occVer) return true;
    let y0 = 0, y1 = MAP;
    const d = src.lastDirty;
    if (!full && src.version === this.occVer + 1 && !src.lastFull && (d === null || d !== this.occDirty)) {
      if (!d) { this.occVer = src.version; return true; } // the rebuild changed no ground
      y0 = Math.max(0, Math.floor(d[1]!) - 1); y1 = Math.min(MAP, Math.ceil(d[3]!) + 1);
    }
    this.occDirty = d;
    if (y1 > y0) {
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.occTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, y0, MAP, y1 - y0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, src.occ, y0 * MAP);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      this.stats.uploads++; this.stats.rows += y1 - y0;
    }
    this.occVer = src.version;
    return true;
  }
}
