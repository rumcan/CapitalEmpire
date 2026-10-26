// The lot lab's Lot grid (T148, key L): the lab lot's boundary and its cells (1-tile squares in the lot's own frame), and the neighbouring lots'
// boundaries when they are shown, drawn with WebGL2 in a light outline over the ground and under every shadow and sprite: the engine calls the
// lab's hook (Game.devGround) right after the map grid (ext/map-grid/layer.ts, the same full-screen pass and premultiplied colour). Per pixel:
// the tile under it (the iso inverse), each lot's frame coordinates a (along u) and b (away, along n), the distance in device px to its edges and
// cell lines (tiles over the tiles per px of that axis, from the camera's constant derivatives), box-filtered coverage. A frame allocates nothing.

/** the camera the grid is drawn for (gl.ts View): world px at the screen centre, device px per world px, the canvas in device px */
export interface GridCam { X: number; Y: number; ze: number; cw: number; ch: number }
/** a lot to outline: origin, along u and away n (unit vectors, world tiles), size (tiles), whether its cells are drawn, its outline's strength */
export interface GridLot { o: { x: number; y: number }; u: { x: number; y: number }; n: { x: number; y: number }; w: number; d: number; cells: boolean; alpha: number }
/** the most lots one frame draws (the lab lot and its seven neighbours, one spare) */
export const MAX_GRID_LOTS = 9;

const VS = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
#define MAXL ${MAX_GRID_LOTS}
uniform vec3 uCam; uniform vec2 uScreen; uniform vec4 uA[MAXL]; uniform vec4 uB[MAXL]; uniform vec2 uC[MAXL]; uniform int uN;
out vec4 o;
float cover(float d, float hw) { return clamp(hw + 0.5 - d, 0.0, 1.0); }
void main() {
  vec2 s = vec2(gl_FragCoord.x, uScreen.y - gl_FragCoord.y);
  vec2 W = (s - 0.5 * uScreen) / uCam.z + uCam.xy;
  float a0 = W.x / 64.0, b0 = W.y / 32.0;
  vec2 t = vec2(0.5 * (a0 + b0), 0.5 * (b0 - a0));
  // the tile point's change per device px across and down the screen (constant: the iso map is linear)
  vec2 tx = vec2(0.5, -0.5) / (64.0 * uCam.z), ty = vec2(-0.5, -0.5) / (32.0 * uCam.z);
  float al = 0.0;
  for (int i = 0; i < MAXL; i++) {
    if (i >= uN) break;
    vec2 org = uA[i].xy, u = uA[i].zw, n = uB[i].xy; float w = uB[i].z, d = uB[i].w;
    vec2 r = t - org; float a = dot(r, u), b = dot(r, n);
    // tiles per device px along each frame axis
    float ga = length(vec2(dot(tx, u), dot(ty, u))), gb = length(vec2(dot(tx, n), dot(ty, n)));
    float pa = 1.5 * ga, pb = 1.5 * gb;
    if (a < -pa || a > w + pa || b < -pb || b > d + pb) continue;
    // the boundary: the a-edges over the lot's depth, the b-edges over its width (device px)
    float e = 1e9;
    if (b >= -pb && b <= d + pb) e = min(e, min(abs(a), abs(a - w)) / ga);
    if (a >= -pa && a <= w + pa) e = min(e, min(abs(b), abs(b - d)) / gb);
    al = max(al, cover(e, 0.9) * uC[i].x);
    // the cells: 1-tile lines inside the lot
    if (uC[i].y > 0.0 && a > 0.0 && a < w && b > 0.0 && b < d) {
      float c = min(abs(fract(a + 0.5) - 0.5) / ga, abs(fract(b + 0.5) - 0.5) / gb);
      al = max(al, cover(c, 0.45) * uC[i].y);
    }
  }
  if (al < 0.002) discard;
  o = vec4(vec3(0.94, 0.98, 1.0) * al, al);
}`;

/** the Lot grid layer: its program, made on the first frame that draws */
export class LotGridLayer {
  private gl: WebGL2RenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private broken = false;
  private A = new Float32Array(MAX_GRID_LOTS * 4); private B = new Float32Array(MAX_GRID_LOTS * 4); private C = new Float32Array(MAX_GRID_LOTS * 2);
  /** draws the lots' outlines for this frame (the first MAX_GRID_LOTS); true when it drew */
  draw(gl: WebGL2RenderingContext, v: GridCam, lots: readonly GridLot[]): boolean {
    const n = Math.min(MAX_GRID_LOTS, lots.length);
    if (this.broken || !n) return false;
    if (this.gl !== gl) { this.gl = gl; this.prog = null; }
    if (!this.prog && !this.build(gl)) return false;
    for (let i = 0; i < n; i++) {
      const l = lots[i]!;
      this.A.set([l.o.x, l.o.y, l.u.x, l.u.y], i * 4); this.B.set([l.n.x, l.n.y, l.w, l.d], i * 4); this.C.set([l.alpha, l.cells ? 0.32 * l.alpha : 0], i * 2);
    }
    const u = this.u;
    gl.useProgram(this.prog);
    gl.uniform3f(u.uCam!, v.X, v.Y, v.ze); gl.uniform2f(u.uScreen!, v.cw, v.ch);
    gl.uniform4fv(u.uA!, this.A, 0, n * 4); gl.uniform4fv(u.uB!, this.B, 0, n * 4); gl.uniform2fv(u.uC!, this.C, 0, n * 2); gl.uniform1i(u.uN!, n);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }
  /** frees the program (made again if it draws later) */
  dispose() { if (this.gl && this.prog) this.gl.deleteProgram(this.prog); this.prog = null; }
  private build(gl: WebGL2RenderingContext): boolean {
    const p = gl.createProgram(); if (!p) return false;
    for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]] as const) {
      const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('[lot-grid] shader:', gl.getShaderInfoLog(s)); this.broken = true; return false; }
      gl.attachShader(p, s); gl.deleteShader(s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn('[lot-grid] link:', gl.getProgramInfoLog(p)); this.broken = true; return false; }
    this.prog = p;
    for (const k of ['uCam', 'uScreen', 'uA', 'uB', 'uC', 'uN']) this.u[k] = gl.getUniformLocation(p, k);
    return true;
  }
}
