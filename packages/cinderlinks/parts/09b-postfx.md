## postfx The painted look (T448)
The finished picture is passed through a WebGL2 layer before it reaches the screen. The owner chose "Painted + cinematic" as the game's look, always on: an oil-paint filter over the whole picture, an anti-flicker calm, and a light cinematic finish (the owner, 2026-11-13: the paint covers everything, no radius, and the look has no off switch).
R: Each frame the picture goes to the GPU: all of it (the land, the trees, the people and the sky) is painted (a Kuwahara filter: flat strokes that keep the edges); a temporal calm (85% to start) holds each pixel to its last frames inside its neighbours' colours, so shimmer settles; the picture is scaled to the screen with sharp pixel edges; a cinematic finish (40% to start: a filmic tone curve, a teal and orange grade, bloom, sun rays from the upper right, a little lens fringe, grain and vignette) and a contrast-adaptive sharpen end it.
R: The ball, the flag and the marker are kept sharp. The style menu's Picture section sets the calm and the cinematic amount; the browser keeps them. Without WebGL2 the plain picture is shown and the menu says so.
R: The aiming marks, the putting grid and the panels stay above the layer at full sharpness; the layer never takes a click.
R: With ?fx=test in the address a bar at the top steps through the filters tried (the backquote key too; hold Backslash for the original) with the sliders and the frame rate, the slowest frame and the filter's GPU and CPU time.
File: game.js
Check: function picSet(
Check: PAINTED = PRESETS.findIndex(

````js file=game.js

// ---- the painted look (T448): a WebGL2 layer between the game's picture and the overlay. PIC: the player's settings (localStorage cinderlinks.picture:
// { calm (0..0.85), cine (0..1) }); PFX: the layer once it runs (null: no WebGL2, or headless); picSet changes a setting.
var PFX = null;
const PIC = { calm: 0.85, cine: 0.4 };
try { const s = JSON.parse(localStorage.getItem('cinderlinks.picture') || 'null'); if (s && typeof s === 'object') { for (const k of ['calm', 'cine']) if (Number.isFinite(s[k])) PIC[k] = s[k]; } } catch (e) { /* the defaults */ }
PIC.calm = clamp(PIC.calm, 0, 0.85); PIC.cine = clamp(PIC.cine, 0, 1);
const FX_TEST = typeof location !== 'undefined' && /[?&]fx=test(&|$)/.test(location.search || '');
function picSet(k, v) {   // a Picture setting from the style menu (or the test bar), kept in the browser
  if (k === 'calm') PIC.calm = clamp(+v, 0, 0.85); else if (k === 'cine') PIC.cine = clamp(+v, 0, 1);
  try { localStorage.setItem('cinderlinks.picture', JSON.stringify(PIC)); } catch (e) { /* not kept */ }
  if (PFX) PFX.changed(k);
}
(function () {
  if (typeof document === 'undefined' || typeof WebGL2RenderingContext === 'undefined' || typeof img === 'undefined' || typeof vctx === 'undefined') return;   // (headless, a worker, or no WebGL2: the plain picture)
  const PRESETS = [
    { name: 'Original', desc: 'The game as it is: hard pixels, scaled with no smoothing.', off: true },
    { name: 'Painted', desc: 'The oil-paint filter over the whole picture (the ball, the flag and the marker kept sharp), with the anti-flicker calm on top.', pre: 3, up: 2, paint: true, cine: 0 },
    { name: 'Painted + cinematic', desc: 'Painted all over, anti-flicker calm on top, and the Cinematic finish mixed in (40% by default).', pre: 3, up: 2, paint: true, cine: 0.5 },
    { name: 'Smooth', desc: 'Plain bilinear smoothing: soft, slightly blurry.', up: 1 },
    { name: 'Sharp pixels AA', desc: 'Pixels stay crisp; only their edges are smoothed, so nothing shimmers when the camera turns (the Unity "smooth pixel" filter).', up: 2 },
    { name: 'Edge smoothing (xBR)', desc: 'Rebuilds diagonal edges and curves from the pixels (the xBR family of pixel-art upscalers).', up: 3 },
    { name: 'FXAA', desc: 'The classic game anti-aliasing pass over the scaled picture.', up: 0, post: 1 },
    { name: 'Bicubic + CAS (FSR-like)', desc: 'Smooth Catmull-Rom upscale, then contrast-adaptive sharpening: the idea behind AMD FSR 1.', up: 4, post: 2, sharp: 0.8 },
    { name: 'Smudge', desc: 'An edge-keeping blur smooths the ground noise and dithering but keeps outlines, then sharp-pixel scaling.', pre: 1, up: 2 },
    { name: 'Calm (anti-flicker)', desc: "Each pixel is blended with the last frames, held inside its neighbours' colours: distant shimmer and crawling edges settle.", calm: 0.7, up: 2 },
    { name: 'Painterly', desc: 'Kuwahara oil-paint filter: flat painted strokes that keep the edges.', pre: 2, up: 2 },
    { name: 'HD-2D', desc: 'Octopath-style: xBR edges, soft bloom, tilt-shift focus on the near ground, clarity, warm grade, vignette.', up: 3, bloom: 0.35, tilt: 0.9, clar: 0.25, vig: 0.35, grade: 1 },
    { name: 'HD-2D deluxe', desc: 'HD-2D plus anti-flicker, sun rays from the upper right and CAS sharpening.', calm: 0.6, up: 4, post: 2, sharp: 0.6, bloom: 0.35, tilt: 0.85, clar: 0.2, vig: 0.35, grade: 1, rays: 0.55 },
    { name: 'HD-2D painterly', desc: 'The HD-2D finish over the oil-paint filter.', pre: 2, up: 2, bloom: 0.3, tilt: 0.85, clar: 0.2, vig: 0.35, grade: 1 },
    { name: 'HD-2D soft', desc: 'The smoothest: smudge, anti-flicker, xBR edges, bloom, focus, grade, FXAA.', pre: 1, calm: 0.6, up: 3, bloom: 0.3, tilt: 0.8, clar: 0.15, vig: 0.3, grade: 1, post: 1 },
    { name: 'Cinematic', desc: 'Filmic tone curve, teal and orange grade, light bloom, sun rays, lens fringe, fine grain and vignette.', up: 4, post: 2, sharp: 0.5, bloom: 0.25, clar: 0.15, vig: 0.45, grade: 2, ca: 1, grain: 0.02, rays: 0.4 },
  ];
  const stage = document.getElementById('stage'), viewEl = document.getElementById('view'), overEl = document.getElementById('over');
  if (!stage || !viewEl || !overEl) return;
  const cv = document.createElement('canvas'); cv.id = 'fx';
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:none';   // (under the overlay; clicks go through it)
  stage.insertBefore(cv, overEl);
  const gl = cv.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
  if (!gl) { cv.remove(); return; }

  // ---- shaders
  const VS = `#version 300 es
out vec2 vUv; void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
  const HEAD = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D uT; uniform vec2 uTS;
const vec3 LW = vec3(0.2126, 0.7152, 0.0722);
`;
  // the picture at its own size, turned the GL way up; 1 smudge (bilateral), 2 paint (Kuwahara), 3 paint all but the kept-sharp pixels
  const PRE = HEAD + `uniform int uMode; uniform highp usampler2D uM;
vec3 S(ivec2 q){ q = clamp(q, ivec2(0), ivec2(uTS) - 1); return texelFetch(uT, ivec2(q.x, int(uTS.y) - 1 - q.y), 0).rgb; }
vec3 KUW(ivec2 p, vec3 c){   // Kuwahara: of the four 3 x 3 squares that share this pixel, the mean of the calmest (the 5 x 5 read once: 25 reads, not 36)
  vec3 t[25];
  for (int j = 0; j < 5; j++) for (int i = 0; i < 5; i++) t[j * 5 + i] = S(p + ivec2(i - 2, j - 2));
  float bv = 1e9; vec3 best = c;
  for (int q = 0; q < 4; q++) {
    int ox = (q & 1) == 0 ? 0 : 2, oy = (q & 2) == 0 ? 0 : 2; vec3 m = vec3(0.0), m2 = vec3(0.0);
    for (int j = 0; j < 3; j++) for (int i = 0; i < 3; i++) { vec3 s = t[(oy + j) * 5 + ox + i]; m += s; m2 += s * s; }
    m /= 9.0; vec3 v = m2 / 9.0 - m * m; float vs = v.r + v.g + v.b;
    if (vs < bv) { bv = vs; best = m; }
  }
  return best;
}
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy); vec3 c = S(p);
  if (uMode == 1) {
    vec3 acc = vec3(0.0); float w = 0.0;
    for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) { vec3 s = S(p + ivec2(i, j)); vec3 d = s - c; float k = exp(-dot(d, d) / 0.045) * exp(-float(i * i + j * j) / 4.5); acc += s * k; w += k; }
    c = acc / w;
  } else if (uMode == 2) {
    c = KUW(p, c);
  } else if (uMode == 3) {   // all of it, but the ball, the flag and the marker: kept sharp
    if (texelFetch(uM, ivec2(p.x, int(uTS.y) - 1 - p.y), 0).r != 2u) c = KUW(p, c);
  }
  o = vec4(c, 1.0);
}`;
  // a smaller copy (four taps), with a soft brightness cut for the bloom (uTh < 0: none)
  const DOWN = HEAD + `uniform float uTh;
void main(){
  vec2 t = 1.0 / uTS;
  vec3 c = 0.25 * (texture(uT, vUv + vec2(-t.x, -t.y)).rgb + texture(uT, vUv + vec2(t.x, -t.y)).rgb + texture(uT, vUv + vec2(-t.x, t.y)).rgb + texture(uT, vUv + t).rgb);
  if (uTh >= 0.0) c *= smoothstep(uTh, uTh + 0.3, dot(c, LW));
  o = vec4(c, 1.0);
}`;
  // a 9-tap gaussian along one direction (five linear taps)
  const BLUR = HEAD + `uniform vec2 uDir;
void main(){
  vec2 d = uDir / uTS;
  vec3 c = texture(uT, vUv).rgb * 0.2270270270;
  c += (texture(uT, vUv + d * 1.3846153846).rgb + texture(uT, vUv - d * 1.3846153846).rgb) * 0.3162162162;
  c += (texture(uT, vUv + d * 3.2307692308).rgb + texture(uT, vUv - d * 3.2307692308).rgb) * 0.0702702703;
  o = vec4(c, 1.0);
}`;
  // the screen pass: upscale (0 nearest, 1 bilinear, 2 sharp-pixel AA, 3 xBR) and the finish
  const FINAL = HEAD + `uniform sampler2D uBlur, uBloom, uRayT; uniform vec2 uOut; uniform int uUp, uGrade;
uniform float uBloomK, uTilt, uClar, uVig, uCA, uGrain, uTime, uHz, uRays, uGradeK;
vec3 N(vec2 uv){ return texelFetch(uT, clamp(ivec2(floor(uv * uTS)), ivec2(0), ivec2(uTS) - 1), 0).rgb; }
vec3 SB(vec2 uv){   // sharp bilinear: hard inside the pixel, blended over one screen pixel at its edge
  vec2 tx = uv * uTS, sc = uOut / uTS, r = 0.5 - 0.5 / sc, cd = fract(tx) - 0.5;
  vec2 f = (cd - clamp(cd, -r, r)) * sc + 0.5;
  return texture(uT, (floor(tx) + f) / uTS).rgb;
}
vec3 F(ivec2 q){ return texelFetch(uT, clamp(q, ivec2(0), ivec2(uTS) - 1), 0).rgb; }
float D(vec3 a, vec3 b){ vec3 d = abs(a - b); return dot(d, vec3(0.299, 0.587, 0.114)) * 1.5 + abs(d.r - d.b) * 0.25; }
vec3 XBR(vec2 uv){   // xBR level 1: each pixel's corner is cut along a diagonal edge, with a one-screen-pixel soft line
  vec2 tx = uv * uTS; ivec2 p = ivec2(floor(tx)); vec2 fp = fract(tx);
  ivec2 s = ivec2(fp.x < 0.5 ? -1 : 1, fp.y < 0.5 ? -1 : 1);
  vec3 E = F(p), Fh = F(p + ivec2(s.x, 0)), H = F(p + ivec2(0, s.y)), I = F(p + s);
  vec3 B = F(p + ivec2(0, -s.y)), Dd = F(p + ivec2(-s.x, 0)), C = F(p + ivec2(s.x, -s.y)), G = F(p + ivec2(-s.x, s.y));
  vec3 F4 = F(p + ivec2(2 * s.x, 0)), I4 = F(p + ivec2(2 * s.x, s.y)), H5 = F(p + ivec2(0, 2 * s.y)), I5 = F(p + ivec2(s.x, 2 * s.y));
  float w1 = D(E, C) + D(E, G) + D(I, F4) + D(I, H5) + 4.0 * D(H, Fh);
  float w2 = D(H, Dd) + D(H, I5) + D(Fh, I4) + D(Fh, B) + 4.0 * D(E, I);
  vec3 base = SB(uv);
  if (w1 < w2 && D(E, Fh) > 0.02 && D(E, H) > 0.02) {
    vec3 P = D(E, Fh) <= D(E, H) ? Fh : H;
    vec2 q = abs(fp - 0.5) * 2.0; float w = 2.2 / (uOut.x / uTS.x);
    base = mix(base, P, smoothstep(1.0 - w, 1.0 + w, q.x + q.y) * 0.85);
  }
  return base;
}
vec3 BC(vec2 uv){   // Catmull-Rom bicubic in nine linear taps
  vec2 sp = uv * uTS, t1 = floor(sp - 0.5) + 0.5, f = sp - t1;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f)), w1 = 1.0 + f * f * (-2.5 + 1.5 * f), w2 = f * (0.5 + f * (2.0 - 1.5 * f)), w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2, o12 = w2 / w12, a = (t1 - 1.0) / uTS, d = (t1 + 2.0) / uTS, m = (t1 + o12) / uTS;
  vec3 r = (texture(uT, vec2(a.x, a.y)).rgb * w0.x + texture(uT, vec2(m.x, a.y)).rgb * w12.x + texture(uT, vec2(d.x, a.y)).rgb * w3.x) * w0.y
         + (texture(uT, vec2(a.x, m.y)).rgb * w0.x + texture(uT, vec2(m.x, m.y)).rgb * w12.x + texture(uT, vec2(d.x, m.y)).rgb * w3.x) * w12.y
         + (texture(uT, vec2(a.x, d.y)).rgb * w0.x + texture(uT, vec2(m.x, d.y)).rgb * w12.x + texture(uT, vec2(d.x, d.y)).rgb * w3.x) * w3.y;
  return clamp(r, 0.0, 1.0);
}
vec3 UP(vec2 uv){ return uUp == 0 ? N(uv) : uUp == 1 ? texture(uT, uv).rgb : uUp == 2 ? SB(uv) : uUp == 3 ? XBR(uv) : BC(uv); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main(){
  vec2 uv = vUv;
  vec3 c = UP(uv);
  vec3 bl = texture(uBlur, uv).rgb;
  if (uClar > 0.0) c += (c - bl) * uClar;
  if (uTilt > 0.0) {   // far land (up toward the horizon) and the very bottom go soft; the golfer's ground stays sharp
    float t = smoothstep(uHz - 0.17, uHz + 0.03, uv.y) * 0.95 + smoothstep(0.08, 0.0, uv.y) * 0.4;
    c = mix(c, bl, clamp(t, 0.0, 1.0) * uTilt);
  }
  if (uBloomK > 0.0) c += texture(uBloom, uv).rgb * uBloomK;
  if (uRays > 0.0) c += texture(uRayT, uv).rgb * uRays * vec3(1.0, 0.9, 0.7) * smoothstep(0.0, 0.6, uv.y);   // light shafts (made at quarter size: RAYS)
  vec3 c0 = c;
  float l = dot(c, LW);
  if (uGrade == 1) {
    c = mix(vec3(l), c, 1.12);
    c = mix(c, c * c * (3.0 - 2.0 * c), 0.35);
    c *= mix(vec3(0.95, 0.98, 1.05), vec3(1.05, 1.0, 0.92), smoothstep(0.15, 0.85, l));
  } else if (uGrade == 2) {
    c = pow(aces(pow(max(c, 0.0), vec3(2.2)) * 0.95), vec3(1.0 / 2.2));
    c *= mix(vec3(0.93, 1.0, 1.06), vec3(1.06, 1.0, 0.91), smoothstep(0.1, 0.9, dot(c, LW)));
    c = mix(vec3(dot(c, LW)), c, 1.1);
  }
  c = mix(c0, c, uGradeK);
  if (uVig > 0.0) c *= 1.0 - uVig * smoothstep(0.35, 1.05, length((uv - 0.5) * vec2(1.5, 1.15)));
  if (uGrain > 0.0) c += (hash(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) * uGrain;
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;
  const FXAA = HEAD + `void main(){
  vec2 r = 1.0 / uTS; vec3 lw = vec3(0.299, 0.587, 0.114);
  vec3 cM = texture(uT, vUv).rgb;
  float nw = dot(texture(uT, vUv + vec2(-1.0, 1.0) * r).rgb, lw), ne = dot(texture(uT, vUv + vec2(1.0, 1.0) * r).rgb, lw);
  float sw = dot(texture(uT, vUv + vec2(-1.0, -1.0) * r).rgb, lw), se = dot(texture(uT, vUv + vec2(1.0, -1.0) * r).rgb, lw), m = dot(cM, lw);
  float lo = min(m, min(min(nw, ne), min(sw, se))), hi = max(m, max(max(nw, ne), max(sw, se)));
  vec2 dir = vec2(-((nw + ne) - (sw + se)), (nw + sw) - (ne + se));
  float red = max((nw + ne + sw + se) * (0.25 / 8.0), 1.0 / 128.0);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + red), vec2(-8.0), vec2(8.0)) * r;
  vec3 A = 0.5 * (texture(uT, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture(uT, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 B = A * 0.5 + 0.25 * (texture(uT, vUv - dir * 0.5).rgb + texture(uT, vUv + dir * 0.5).rgb);
  float lb = dot(B, lw);
  o = vec4((lb < lo || lb > hi) ? A : B, 1.0);
}`;
  // light shafts at quarter size: the bright sky (the bloom's copy) smeared toward the sun at the upper right
  const RAYS = HEAD + `void main(){
  vec2 sun = vec2(0.92, 1.08), d = (sun - vUv) / 28.0, p = vUv; float k = 1.0; vec3 acc = vec3(0.0);
  for (int i = 0; i < 28; i++) { p += d; acc += texture(uT, p).rgb * k; k *= 0.93; }
  o = vec4(acc / 28.0, 1.0);
}`;
  // contrast-adaptive sharpening (after AMD CAS)
  const CAS = HEAD + `uniform float uSharp;
void main(){
  vec2 r = 1.0 / uTS;
  vec3 a = texture(uT, vUv + vec2(-r.x, 0.0)).rgb, b = texture(uT, vUv + vec2(0.0, -r.y)).rgb, c = texture(uT, vUv).rgb, d = texture(uT, vUv + vec2(r.x, 0.0)).rgb, e = texture(uT, vUv + vec2(0.0, r.y)).rgb;
  vec3 mn = min(min(a, b), min(min(c, d), e)), mx = max(max(a, b), max(max(c, d), e));
  vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, 1e-4), 0.0, 1.0));
  vec3 w = -amp * mix(0.125, 0.2, uSharp);
  o = vec4(clamp((c + (a + b + d + e) * w) / (1.0 + 4.0 * w), 0.0, 1.0), 1.0);
}`;
  // temporal calm: the last frames, held inside this pixel's 3x3 neighbourhood (no motion vectors, so it only settles what stays put)
  const CALM = HEAD + `uniform sampler2D uH; uniform highp usampler2D uM; uniform float uK;
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy), mxp = ivec2(uTS) - 1;
  vec3 c = texelFetch(uT, p, 0).rgb, mn = c, mx = c, s1 = vec3(0.0), s2 = vec3(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec3 s = texelFetch(uT, clamp(p + ivec2(i, j), ivec2(0), mxp), 0).rgb; mn = min(mn, s); mx = max(mx, s); s1 += s; s2 += s * s; }
  vec3 mu = s1 / 9.0, sd = sqrt(max(s2 / 9.0 - mu * mu, 0.0));
  vec3 h = texelFetch(uH, p, 0).rgb;
  h = clamp(h, max(mn, mu - sd * 1.25), min(mx, mu + sd * 1.25));
  uint mk = texelFetch(uM, ivec2(p.x, int(uTS.y) - 1 - p.y), 0).r;
  float k = mk == 2u ? 0.0 : mk == 1u ? uK * 0.35 : uK;   // (the ball is never held back; figures only a little, so they do not smear)
  o = vec4(mix(c, h, k), 1.0);
}`;
  function prog(fs) {
    const p = gl.createProgram();
    for (const [t, s] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]]) {
      const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('postfx shader: ' + gl.getShaderInfoLog(sh));
      gl.attachShader(p, sh);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('postfx link: ' + gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
    return { p, u };
  }
  let P;
  try { P = { pre: prog(PRE), down: prog(DOWN), blur: prog(BLUR), fin: prog(FINAL), fxaa: prog(FXAA), cas: prog(CAS), calm: prog(CALM), rays: prog(RAYS) }; } catch (e) { console.error(e); return; }

  function tex(w, h) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return { t, w, h };
  }
  function target(w, h) { const x = tex(w, h); x.fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, x.fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, x.t, 0); return x; }
  const mtex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, mtex); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8UI, VW, VH);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  const hasM = typeof sprM !== 'undefined' && sprM.length === VW * VH; const zeroM = new Uint8Array(VW * VH);
  const src = tex(VW, VH), pre = target(VW, VH), hist = [target(VW, VH), target(VW, VH)]; let hi = 0;
  const hw = Math.max(1, VW >> 1), hh = Math.max(1, VH >> 1), qw = Math.max(1, VW >> 2), qh = Math.max(1, VH >> 2);
  const halfA = target(hw, hh), halfB = target(hw, hh), qA = target(qw, qh), qB = target(qw, qh), qR = target(qw, qh);
  let disp = null;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const vao = gl.createVertexArray();

  function pass(pg, to, inp, set) {
    gl.useProgram(pg.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, to ? to.fb : null);
    gl.viewport(0, 0, to ? to.w : cv.width, to ? to.h : cv.height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, inp.t); gl.uniform1i(pg.u.uT, 0); gl.uniform2f(pg.u.uTS, inp.w, inp.h);
    if (set) set(pg.u);
    gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  const blur2 = (a, b, k) => { pass(P.blur, b, a, (u) => gl.uniform2f(u.uDir, k, 0)); pass(P.blur, a, b, (u) => gl.uniform2f(u.uDir, 0, k)); };

  // ---- the GPU clock (where the browser offers it) and the frame rate
  const tq = gl.getExtension('EXT_disjoint_timer_query_webgl2'); const queries = [];
  let gpuMs = 0, gpuN = 0, gpuShow = 0, cpuMs = 0, fpsT = performance.now(), fpsN = 0, fps = 0, frameMax = 0, lastT = 0, maxShow = 0;

  // the preset in force: the painted look (or none) in play; any of them with ?fx=test (the bar steps through them; &fxp=<n> starts on the nth)
  const PAINTED = PRESETS.findIndex((p) => p.name === 'Painted + cinematic');
  let cur = PAINTED, peek = false;   // (always painted: the owner, 2026-11-13)
  if (FX_TEST) { const k = +(new URLSearchParams(location.search).get('fxp')); if (k >= 1 && k <= PRESETS.length) cur = k - 1; }
  const FORCE_W = +(new URLSearchParams(location.search).get('fxw')) || 0;   // (testing: the screen picture's width, whatever the window's)
  const CINE = { up: 2, post: 2, sharp: 0.5, bloom: 0.25, clar: 0.15, vig: 0.45, grade: 2, ca: 1, grain: 0.02, rays: 0.4 };
  function resolve(p) {
    if (!p.paint) return p;
    const k = p.cine ? PIC.cine : 0, r = { pre: 3, up: 2, calm: PIC.calm > 0 ? Math.min(0.85, PIC.calm) : 0 };
    if (k > 0) { r.post = 2; r.sharp = CINE.sharp * k; r.bloom = CINE.bloom * k; r.clar = CINE.clar * k; r.vig = CINE.vig * k; r.grade = 2; r.gradeK = k; r.ca = CINE.ca * k; r.grain = CINE.grain * k; r.rays = CINE.rays * k; }
    return r;
  }
  function draw() {
    const pr = resolve(PRESETS[cur]);
    const on = !pr.off && !peek;
    cv.style.display = on ? 'block' : 'none';
    if (!on) return;
    const t0 = performance.now();
    const r = viewEl.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const W = FORCE_W || Math.max(1, Math.round(r.width * dpr)), H = FORCE_W ? Math.round(FORCE_W * r.height / Math.max(1, r.width)) : Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; disp = null; }
    if (pr.post && (!disp || disp.w !== W || disp.h !== H)) disp = target(W, H);
    let q = null;
    if (tq && queries.length < 4) { q = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, q); }
    gl.bindTexture(gl.TEXTURE_2D, src.t);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, VW, VH, gl.RGBA, gl.UNSIGNED_BYTE, img.data);
    gl.bindTexture(gl.TEXTURE_2D, mtex); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, VW, VH, gl.RED_INTEGER, gl.UNSIGNED_BYTE, hasM ? sprM : zeroM); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    pass(P.pre, pre, src, (u) => {
      gl.uniform1i(u.uMode, pr.pre || 0);
      if (u.uM) { gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, mtex); gl.uniform1i(u.uM, 4); gl.activeTexture(gl.TEXTURE0); }
    });
    let base = pre;
    if (pr.calm) { const h0 = hist[hi], h1 = hist[hi ^ 1]; pass(P.calm, h1, pre, (u) => { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, h0.t); gl.uniform1i(u.uH, 1); gl.uniform1f(u.uK, pr.calm); gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, mtex); gl.uniform1i(u.uM, 4); gl.activeTexture(gl.TEXTURE0); }); hi ^= 1; base = h1; }
    const needBlur = pr.tilt || pr.clar;
    if (needBlur) { pass(P.down, halfA, base, (u) => gl.uniform1f(u.uTh, -1)); blur2(halfA, halfB, 1); blur2(halfA, halfB, 2); }
    if (pr.bloom) { pass(P.down, qA, base, (u) => gl.uniform1f(u.uTh, 0.6)); blur2(qA, qB, 1); blur2(qA, qB, 2.5); if (pr.rays) pass(P.rays, qR, qA); }
    const hzy = typeof HZ === 'number' ? 1 - HZ / VH : 0.65;
    const fin = (u) => {
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, halfA.t); gl.uniform1i(u.uBlur, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, qA.t); gl.uniform1i(u.uBloom, 2);
      if (u.uRayT) { gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, qR.t); gl.uniform1i(u.uRayT, 5); }
      gl.uniform2f(u.uOut, W, H); gl.uniform1i(u.uUp, pr.up || 0); gl.uniform1i(u.uGrade, pr.grade || 0);
      gl.uniform1f(u.uBloomK, pr.bloom || 0); gl.uniform1f(u.uTilt, pr.tilt || 0); gl.uniform1f(u.uClar, pr.clar || 0); gl.uniform1f(u.uVig, pr.vig || 0);
      gl.uniform1f(u.uGrain, pr.grain || 0); gl.uniform1f(u.uTime, performance.now() / 1000); gl.uniform1f(u.uHz, hzy); gl.uniform1f(u.uRays, pr.rays || 0); gl.uniform1f(u.uGradeK, pr.gradeK === undefined ? 1 : pr.gradeK);
    };
    if (pr.post === 1) { pass(P.fin, disp, base, fin); pass(P.fxaa, null, disp); }
    else if (pr.post === 2) { pass(P.fin, disp, base, fin); pass(P.cas, null, disp, (u) => gl.uniform1f(u.uSharp, pr.sharp || 0.5)); }
    else pass(P.fin, null, base, fin);
    if (q) { gl.endQuery(tq.TIME_ELAPSED_EXT); queries.push(q); }
    while (queries.length && gl.getQueryParameter(queries[0], gl.QUERY_RESULT_AVAILABLE)) {
      const q0 = queries.shift();
      if (!gl.getParameter(tq.GPU_DISJOINT_EXT)) { gpuMs += gl.getQueryParameter(q0, gl.QUERY_RESULT) / 1e6; gpuN++; }
      gl.deleteQuery(q0);
    }
    cpuMs += performance.now() - t0;
  }

  // ---- the hook: every time the game sends its picture to the canvas, the layer draws too (a failure turns the layer off: the plain picture)
  let bar = null, show = () => {}, resetStats = () => {}, failed = false;
  const put = vctx.putImageData.bind(vctx);
  vctx.putImageData = function (im) { put.apply(null, arguments); if (im === img && !failed) { try { draw(); } catch (e) { failed = true; cv.style.display = 'none'; console.error(e); } if (bar) tickStats(); } };
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); failed = true; cv.style.display = 'none'; });
  PFX = { changed() { resetStats(); show(); }, get: () => cur, stats: () => ({ fps, frameMax: maxShow, gpu: gpuShow }) };
  if (typeof styleShow === 'function') styleShow();   // (the style menu was written before the layer ran: its Picture section again)

  // ---- the test bar (?fx=test only): the filters tried, the sliders and the stats
  if (!FX_TEST) return;
  const css = document.createElement('style');
  css.textContent = `#fxBar{position:absolute;left:50%;top:1.2%;transform:translateX(-50%);z-index:30;display:flex;align-items:stretch;gap:0;pointer-events:auto;
    background:rgba(10,26,18,.92);border:2px solid #0a1a12;box-shadow:0 0 0 1px rgba(242,201,76,.6);font:inherit;color:#f4ecd0;text-shadow:1px 1px 0 #000;user-select:none}
  #fxBar button{font:inherit;color:#f2c94c;background:none;border:0;padding:4px 10px;cursor:pointer;font-size:15px}
  #fxBar button:hover{background:rgba(242,201,76,.15)}
  #fxMid{padding:3px 12px;min-width:260px;text-align:center;cursor:pointer}
  #fxName{font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#f2c94c}
  #fxDesc{font-size:9px;opacity:.8;max-width:460px;line-height:1.25;margin-top:2px}
  #fxStat{font-size:10px;opacity:.75;margin-top:2px}
  #fxTune{display:none;font-size:10px;margin-top:3px;gap:10px;justify-content:center;align-items:center}
  #fxTune input{width:110px;accent-color:#f2c94c;vertical-align:middle}`;
  document.head.appendChild(css);
  bar = document.createElement('div'); bar.id = 'fxBar';
  bar.innerHTML = '<button id="fxPrev" type="button" title="previous filter">&#9664;</button><div id="fxMid" title="click: next filter (right-click: previous); the backquote key; hold Backslash for the original"><div id="fxName"></div><div id="fxDesc"></div><div id="fxStat"></div><div id="fxTune"><label>Calm <input id="fxCalm" type="range" min="0" max="85" step="5"> <b id="fxCalmV"></b></label><label id="fxCineL">Cinematic <input id="fxCine" type="range" min="0" max="100" step="5"> <b id="fxCineV"></b></label></div></div><button id="fxNext" type="button" title="next filter">&#9654;</button>';
  (document.getElementById('hud') || stage).appendChild(bar);
  for (const ev of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'click', 'contextmenu', 'wheel']) bar.addEventListener(ev, (e) => e.stopPropagation());
  const q = (id) => bar.querySelector('#' + id), tuneEl = q('fxTune'), calmEl = q('fxCalm'), cineEl = q('fxCine'), nameEl = q('fxName'), descEl = q('fxDesc'), statEl = q('fxStat');
  calmEl.addEventListener('input', () => picSet('calm', +calmEl.value / 100));
  cineEl.addEventListener('input', () => picSet('cine', +cineEl.value / 100));
  show = () => {
    const pr = PRESETS[cur];
    nameEl.textContent = 'Filter ' + (cur + 1) + '/' + PRESETS.length + ': ' + pr.name + (peek ? ' (showing the original)' : '');
    descEl.textContent = pr.desc;
    tuneEl.style.display = pr.paint ? 'flex' : 'none';
    q('fxCineL').style.display = pr.cine ? '' : 'none';
    calmEl.value = String(Math.round(PIC.calm * 100)); q('fxCalmV').textContent = Math.round(PIC.calm * 100) + '%';
    cineEl.value = String(Math.round(PIC.cine * 100));
    q('fxCineV').textContent = Math.round(PIC.cine * 100) + '%';
  };
  resetStats = () => { gpuMs = gpuN = cpuMs = 0; fpsN = 0; frameMax = 0; fpsT = performance.now(); };
  const step = (d) => { cur = (cur + d + PRESETS.length) % PRESETS.length; resetStats(); show(); };
  q('fxPrev').addEventListener('click', () => step(-1));
  q('fxNext').addEventListener('click', () => step(1));
  q('fxMid').addEventListener('click', (e) => step(e.shiftKey ? -1 : 1));
  q('fxMid').addEventListener('contextmenu', (e) => { e.preventDefault(); step(-1); });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Backquote') { step(e.shiftKey ? -1 : 1); e.stopImmediatePropagation(); }
    else if (e.code === 'Backslash' && !peek) { peek = true; show(); e.stopImmediatePropagation(); }
  }, true);
  window.addEventListener('keyup', (e) => { if (e.code === 'Backslash') { peek = false; show(); } }, true);
  function tickStats() {
    const now = performance.now();
    if (lastT) frameMax = Math.max(frameMax, now - lastT);
    lastT = now; fpsN++;
    if (now - fpsT >= 1000) {
      fps = fpsN * 1000 / (now - fpsT); maxShow = frameMax;
      gpuShow = gpuN ? gpuMs / gpuN : 0;
      const cpu = fpsN ? cpuMs / fpsN : 0;
      statEl.textContent = fps.toFixed(0) + ' fps, slowest frame ' + maxShow.toFixed(1) + ' ms' + (PRESETS[cur].off ? '' : ', filter ' + (tq && gpuN ? 'GPU ' + gpuShow.toFixed(2) + ' ms, ' : '') + 'CPU ' + cpu.toFixed(2) + ' ms');
      fpsT = now; fpsN = 0; frameMax = 0; gpuMs = gpuN = 0; cpuMs = 0;
    }
  }
  show();
})();
````
