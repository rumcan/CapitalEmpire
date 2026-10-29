/** T248 (#718): water that moves. The owner, 2026-10-28: "add effects of small waves to the transision from water to dirt with a vector
 *  lapping of waves animation on edges of water" and "add maybe two textures on the water so it looks like the water is moving but first do
 *  research on how to make the water look amazing" (the research: docs/art/WATER-RESEARCH.md).
 *
 *  The ground is baked into chunk pictures, so the motion is a per-frame pass in gl.ts FS_QUAD over the water's own pixels (as T215's lamp
 *  pools, T199/T230's glint and T262's grass shine are), from one small mask a chunk with water carries:
 *  - **The mask** (motionMask): RGBA8 over T230's water field's lattice (water-look.ts WaterField: world-anchored, 2 samples a tile, so the
 *    chunks agree), cropped to the chunk: red the signed distance from the shore (SD: in from it on the water, out from it on the bank), green
 *    and blue a river's downstream direction (its spline runs from the source to the exit; 0 on still water), alpha the waves' strength (by
 *    the river's width, by a pond's area: the ponds lap gently, the big water more) times the exclusions (none under and beside a bridge and
 *    its shadow, none in the swamp past the bank). Made by the ground worker with the bake (renderer.ts waterMotionMask), no read back.
 *  - **Two moving ripple layers** (RIPPLE): gradient noise with its derivatives in the shader (no art, no texture), two scales, lit by the
 *    one sun at the upper right as a multiply of the baked water (crests toward the sun lighter, their backs darker: the painting stays, never
 *    a wash). Ponds drift slowly with the wind; a river's layers run downstream along its flow, each read twice half a cycle apart and cross-
 *    faded (Valve's flow map; a time offset by a slow noise hides the pulse, a jump each cycle keeps the pattern new), so they never stretch.
 *  - **Waves lapping at the shore** (FOAM, WET): thin, broken, irregular foam crests every few metres run in toward the shore (a fract of the
 *    distance plus the waves' phase, the phase shifted by a slow noise, broken up by the ripple layers) and fade as they arrive; the swash
 *    then runs up a darker wet band of bank just above the waterline and dries again. The waterline itself is the picture's own (each pixel's
 *    water key; a few taps of the picture along the field's slope find how far a pixel lies from it), so nothing spills onto the bank and no
 *    hard outline is drawn.
 *  - **Sparkle** (SPARKLE): where a ripple's normal turns to the sun's half-vector, a glint, textured by the water's own colour, inset from the
 *    shore, kept out of the shadows (the last frame's shadow layer, as T262's shine), faded after dusk.
 *  It fades out toward the district zoom (ZOOM: the district chunks carry no mask). The switch (the gear menu's Water motion, engine.ts
 *  waterMotion; remembered): off makes no mask and never takes the shader's branch, so the frame is today's, bit for bit. Pure: no DOM, the
 *  node tests run the mask and the shader's CPU twin (motionPixel); gl.ts builds its shader from WATER_MOTION_GLSL. Units: tiles of 2 m. */
import { HH, HW } from './iso';
import { SUN_SCREEN } from './grass-shine';
import type { WaterField } from './water-look';

// ---------- the knobs ----------
/** the water motion's knobs (the gear menu's Water motion): the switch, the speed of everything that moves (the rivers' flow, the ponds'
 *  drift and the waves), the ripples', the foam's and the sparkle's strength (1 the tuned look, 0 none) */
export interface WaterMotion { on: boolean; flow: number; ripple: number; foam: number; sparkle: number }
export const WATER_MOTION: Readonly<WaterMotion> = { on: true, flow: 1, ripple: 1, foam: 1, sparkle: 1 };
export const MOTION_RANGES = { flow: [0, 3], ripple: [0, 3], foam: [0, 3], sparkle: [0, 3] } as const;
/** where the look is remembered (localStorage) */
export const WATER_MOTION_KEY = 'capitalempire.waterMotion.v1';
/** a look with every knob held to its range (missing or bad: the tuned look's) */
export function clampWaterMotion(s: unknown): WaterMotion {
  const o = (s && typeof s === 'object' ? s : {}) as Partial<Record<keyof WaterMotion, unknown>>, D = WATER_MOTION;
  const num = (k: keyof typeof MOTION_RANGES) => { const v = o[k], [lo, hi] = MOTION_RANGES[k]; return Math.round(Math.min(hi, Math.max(lo, typeof v === 'number' && Number.isFinite(v) ? v : D[k])) * 1000) / 1000; };
  return { on: typeof o.on === 'boolean' ? o.on : D.on, flow: num('flow'), ripple: num('ripple'), foam: num('foam'), sparkle: num('sparkle') };
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const fract = (v: number) => v - Math.floor(v);

// ---------- the mask ----------
/** the signed distance's range in the mask's red (tiles: out on the bank .. in on the water): 0.03 of a tile a step */
export const SD_RANGE = [-2, 6] as const;
export const encodeSd = (sd: number) => Math.round(clamp((sd - SD_RANGE[0]) / (SD_RANGE[1] - SD_RANGE[0]), 0, 1) * 255);
export const decodeSd = (b: number) => SD_RANGE[0] + (b / 255) * (SD_RANGE[1] - SD_RANGE[0]);
/** the waves' strength (0..1, the mask's alpha) by the water: a river by its width (tiles: narrow ones lap least, it flows), a pond or
 *  painted water by its area (tiles squared: a course pond gently, a lake-sized body most) */
export const LAP = { river: [0.3, 0.55], riverWidth: [10, 40], pond: [0.5, 1], area: [500, 5000] } as const;
export const riverLap = (w: number) => LAP.river[0] + (LAP.river[1] - LAP.river[0]) * smooth(LAP.riverWidth[0], LAP.riverWidth[1], w);
export const pondLap = (area: number) => LAP.pond[0] + (LAP.pond[1] - LAP.pond[0]) * smooth(LAP.area[0], LAP.area[1], area);
/** the bank side the mask carries (tiles past the water's edge: the swash and the wet band reach no farther; the strength and the flow are
 *  carried out to it from the nearest water, so the shader's weights never step at the waterline) */
export const BANK_REACH = 1;
/** the bridges' exclusion: none within the deck's half width plus the first (tiles), whole past the second; the deck's shadow on the water
 *  lies shadowPx world px down the screen (renderer.ts: DECK_T + PIER_H + 14), the piers between */
export const BRIDGE = { clear: [0.2, 1.3], shadowPx: 66 } as const;
/** a chunk's motion mask: RGBA (w x h texels on the field's lattice) and the tile box its texels cover (x0, y0, x1, y1: their outer edges) */
export interface MotionMaskData { w: number; h: number; data: Uint8Array; box: [number, number, number, number] }
/** a swamp band's alpha over the bake's tile box (swamp.ts SwampField alpha, laid from x0 y0 at res samples a tile) */
export interface BandRef { a: { data: ArrayLike<number>; W: number; H: number }; x0: number; y0: number; res: number }
/** what keeps the waves away: the bridges over the chunk (network.ts BridgeRec: the deck's line and half width, tiles) and the swamp bands */
export interface MotionExtras { bridges?: readonly { pts: readonly { x: number; y: number }[]; hw: number }[]; bands?: readonly (BandRef | null)[] }

/** the motion mask of a water field (its sites marked with motion() on, shore() done), over the chunk's samples and one round them (the
 *  bilinear reads at its edge); null when no water lies there */
export function motionMask(f: WaterField, ex: MotionExtras = {}): MotionMaskData | null {
  const { W, H, res, x0, y0, site, d } = f, [iu0, iv0, iu1, iv1] = f.inner;
  const u0 = Math.max(0, iu0 - 1), v0 = Math.max(0, iv0 - 1), u1 = Math.min(W - 1, iu1 + 1), v1 = Math.min(H - 1, iv1 + 1), w = u1 - u0 + 1, h = v1 - v0 + 1;
  let anyWater = false;
  for (let v = v0; v <= v1 && !anyWater; v++) for (let u = u0; u <= u1; u++) if (site[v * W + u]) { anyWater = true; break; }
  if (!anyWater) return null;
  const out = f.bank(BANK_REACH + 1), flow = f.flow, amp = f.amp, data = new Uint8Array(w * h * 4);
  const reach = BANK_REACH, R = Math.ceil(reach * res) + 1;
  // the exclusions over the crop (1: none)
  const ex1 = new Float32Array(w * h).fill(1);
  const tileOf = (u: number, v: number): [number, number] => [x0 + (u + 0.5) / res, y0 + (v + 0.5) / res];
  for (const b of ex.bridges ?? []) {
    if (b.pts.length < 2) continue;
    const s = BRIDGE.shadowPx / (2 * HH), g = b.hw + BRIDGE.clear[1];
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const q of b.pts) { bx0 = Math.min(bx0, q.x); by0 = Math.min(by0, q.y); bx1 = Math.max(bx1, q.x + s); by1 = Math.max(by1, q.y + s); }
    const ua = Math.max(u0, Math.floor((bx0 - g - x0) * res)), ub = Math.min(u1, Math.ceil((bx1 + g - x0) * res)), va = Math.max(v0, Math.floor((by0 - g - y0) * res)), vb = Math.min(v1, Math.ceil((by1 + g - y0) * res));
    for (let v = va; v <= vb; v++) for (let u = ua; u <= ub; u++) {
      const [px, py] = tileOf(u, v); let best = Infinity;
      // the deck, its shadow down the screen and the piers between (the line at three shifts down the screen)
      for (const t of [0, 0.5, 1]) for (let i = 0; i + 1 < b.pts.length; i++) best = Math.min(best, segDist(px - t * s, py - t * s, b.pts[i]!, b.pts[i + 1]!));
      const e = smooth(b.hw + BRIDGE.clear[0], b.hw + BRIDGE.clear[1], best), k = (v - v0) * w + (u - u0);
      if (e < ex1[k]!) ex1[k] = e;
    }
  }
  for (const r of ex.bands ?? []) {
    if (!r) continue;
    const { a, x0: bx, y0: by, res: br } = r;
    for (let v = v0; v <= v1; v++) for (let u = u0; u <= u1; u++) {
      const [px, py] = tileOf(u, v), i = Math.floor((px - bx) * br), j = Math.floor((py - by) * br);
      if (i < 0 || j < 0 || i >= a.W || j >= a.H) continue;
      const al = a.data[(j * a.W + i) * 4 + 3]! / 255; if (!(al > 0)) continue;
      const k = (v - v0) * w + (u - u0); ex1[k] = Math.min(ex1[k]!, 1 - al);
    }
  }
  for (let v = v0; v <= v1; v++) for (let u = u0; u <= u1; u++) {
    const k = v * W + u, o = 4 * ((v - v0) * w + (u - u0)), e = ex1[(v - v0) * w + (u - u0)]!;
    let fx = 0, fy = 0, a = 0, sd: number;
    if (site[k]) { sd = d[k]!; if (flow) { fx = flow[2 * k]!; fy = flow[2 * k + 1]!; a = amp![k]!; } else a = LAP.pond[0]; }
    else {
      sd = -out[k]!;
      if (out[k]! <= reach) {
        // (the bank: the nearest water sample's strength and flow, carried out to the swash's reach)
        let bd = Infinity;
        for (let j = Math.max(0, v - R); j <= Math.min(H - 1, v + R); j++) for (let i = Math.max(0, u - R); i <= Math.min(W - 1, u + R); i++) {
          const q = j * W + i; if (!site[q]) continue;
          const dd = (i - u) * (i - u) + (j - v) * (j - v); if (dd >= bd) continue;
          bd = dd; if (flow) { fx = flow[2 * q]!; fy = flow[2 * q + 1]!; a = amp![q]!; } else a = LAP.pond[0];
        }
      }
    }
    data[o] = encodeSd(sd); data[o + 1] = Math.round(128 + 127 * clamp(fx, -1, 1)); data[o + 2] = Math.round(128 + 127 * clamp(fy, -1, 1)); data[o + 3] = Math.round(255 * clamp(a * e, 0, 1));
  }
  return { w, h, data, box: [x0 + u0 / res, y0 + v0 / res, x0 + (u1 + 1) / res, y0 + (v1 + 1) / res] };
}
/** the distance from point (x, y) to segment a b */
function segDist(x: number, y: number, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy, t = l2 > 0 ? clamp(((x - a.x) * dx + (y - a.y) * dy) / l2, 0, 1) : 0;
  return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
}

// ---------- the look ----------
/** the zoom (CSS) the motion fades out over: whole from the second up, gone by the first (the district chunks, iso.ts MID_BELOW 10%, carry no
 *  mask: the fade keeps that switch from showing) */
export const ZOOM = [0.1, 0.125] as const;
/** the two ripple layers: their frequencies (a tile: the first about 1.4 tiles a ripple, the second finer), their slopes' shares, how much
 *  the sun-facing slope lights or shades the water (a share of its colour) and how far in from the shore they rise to whole (tiles); the
 *  ponds' wind drift of each (tiles a second at speed 1) */
export const RIPPLE = { fa: 0.72, fb: 1.85, ra: 1, rb: 0.42, shade: 0.075, rise: [0.05, 1.1], driftA: [0.06, -0.035], driftB: [-0.025, -0.05] } as const;
/** a river's flow: its surface speed (tiles a second at speed 1), how far a phase carries the pattern before the cross-fade (tiles), the
 *  finer layer's share of that (faster), and the slow noise that offsets the phase from place to place (its frequency, its reach in cycles) */
export const FLOW = { speed: 0.42, travel: 1.1, fine: 1.35, offF: 0.085, offK: 1.6 } as const;
/** the sparkle: the ripple normal's bump, the highlight's exponent and strength, its inset from the shore (tiles), and the sky colour it
 *  takes the water toward (0..1) with the water's own colour (textured: own share) */
export const SPARKLE = { bump: 0.42, exp: 140, amount: 0.55, inset: [0.6, 1.8], sky: [0.86, 0.93, 0.96], own: 0.55, night: 0.85 } as const;
/** the foam crests: their spacing (tiles) and how far out they start (tiles) at the waves' strength 0 and 1, the waves' speed (crests a
 *  second at speed 1), a crest's width (tiles, and never under this many device px), its soft trail behind (tiles), the most alpha, the
 *  river's share (it flows more than it laps), the breakup's threshold, the foam colour (0..1), and the device px a tile can shrink to before the
 *  crests fade out (they would flicker) */
export const FOAM = { lam: [0.6, 1.1], reach: [1.2, 3], rate: 0.3, width: 0.07, widthPx: 1.3, tail: 0.32, alpha: 0.5, river: 0.55, broken: [0.42, 0.7], col: [0.84, 0.9, 0.87], fadePx: [0.15, 0.22] } as const;
/** the bank side: the damp band (tiles past the waterline), the swash's run-up on top (tiles at strength 1), the wet colour's multiply (a
 *  cool darkening: the soil's texture stays) and its strength, and the swash's leading edge's foam alpha */
export const WET = { damp: 0.13, run: 0.32, mul: [0.7, 0.72, 0.77], amount: 0.75, edge: 0.22 } as const;
/** the water key (0..255 a channel): the water pictures are teal (blue and green well over red: the pond #1e4342, the lake #0b5263); the
 *  bank, the grass, the soil, the roads and a bridge's deck are not. The shore taps: the steps (tiles) the picture is read at along the
 *  field's slope, and how far (the most a pixel's distance from the waterline is read as) */
export const KEY = { br: [4, 14], gr: [6, 18] } as const;
export const waterKey = (r: number, g: number, b: number) => smooth(KEY.br[0], KEY.br[1], b - r) * smooth(KEY.gr[0], KEY.gr[1], g - r);
export const TAPS = { step: 0.1, n: 6 } as const;

/** the direction toward the sun along the ground (tiles, unit) and its elevation's sine: the screen's sun (grass-shine.ts SUN_SCREEN, the
 *  upper right) taken back through the iso projection (iso.ts: X = HW (x - y), Y = HH (x + y)) */
export const SUN_TILE = (() => {
  const sx = SUN_SCREEN[0], sy = SUN_SCREEN[1], tx = (sx / HW + sy / HH) / 2, ty = (sy / HH - sx / HW) / 2, l = Math.hypot(tx, ty);
  return [tx / l, ty / l, SUN_SCREEN[2]] as const;
})();
/** the half-vector of the sun and the eye in the ground's frame (x, y tiles, up): the eye looks from the bottom of the screen (+x +y) down at
 *  30 degrees (the 2:1 view: sin 30 = HH / HW) */
export const HALF = (() => {
  const c = Math.sqrt(1 - SUN_TILE[2] ** 2), L = [SUN_TILE[0] * c, SUN_TILE[1] * c, SUN_TILE[2]], e = Math.cos(Math.PI / 6) / Math.SQRT2, V = [e, e, HH / HW];
  const h = [L[0]! + V[0]!, L[1]! + V[1]!, L[2]! + V[2]!], l = Math.hypot(h[0]!, h[1]!, h[2]!);
  return [h[0]! / l, h[1]! / l, h[2]! / l] as const;
})();

/** one frame's motion (engine.ts waterFrame; gl.ts uniforms): the gains (each knob times the zoom fade; sparkle also by day), the river's
 *  phase (cycles, mod 256), the waves' phase (crests, mod 256), the ponds' two layers' drift (noise units, mod 256) and the tiles a device px
 *  covers (the crests' anti-aliasing) */
export interface MotionFrame { gain: number; ripple: number; foam: number; sparkle: number; phase: number; wave: number; drift: readonly number[]; pxTile: number }
/** the zoom fade at CSS zoom z */
export const motionFade = (z: number) => smooth(ZOOM[0], ZOOM[1], z);
/** the frame's uniforms from the look, the zoom (CSS), the night (0 day .. 1), the screen's device px per world px (ze) and the phases */
export function motionFrame(m: WaterMotion, z: number, night: number, ze: number, ph: { phase: number; wave: number; drift: readonly number[] }): MotionFrame | null {
  const g = m.on ? motionFade(z) : 0; if (!(g > 0)) return null;
  return { gain: g, ripple: g * m.ripple, foam: g * m.foam, sparkle: g * m.sparkle * (1 - SPARKLE.night * clamp(night, 0, 1)), phase: ph.phase, wave: ph.wave, drift: ph.drift, pxTile: Math.SQRT2 / (2 * HH * Math.max(1e-4, ze)) };
}
/** the phases after dt seconds at the look's speed (they wrap at 256: the noise repeats every 256 of its cells, the jumps every 256 cycles) */
export function stepPhases(ph: { phase: number; wave: number; drift: number[] }, dt: number, m: WaterMotion) {
  const s = m.flow * dt, w = (v: number) => ((v % 256) + 256) % 256;
  ph.phase = w(ph.phase + (s * FLOW.speed) / FLOW.travel); ph.wave = w(ph.wave + s * FOAM.rate);
  ph.drift[0] = w(ph.drift[0]! + s * RIPPLE.driftA[0] * RIPPLE.fa); ph.drift[1] = w(ph.drift[1]! + s * RIPPLE.driftA[1] * RIPPLE.fa);
  ph.drift[2] = w(ph.drift[2]! + s * RIPPLE.driftB[0] * RIPPLE.fb); ph.drift[3] = w(ph.drift[3]! + s * RIPPLE.driftB[1] * RIPPLE.fb);
  return ph;
}
/** the phases t seconds from the start at the look's speed (the captures hold the clock) */
export const phasesAt = (t: number, m: WaterMotion) => stepPhases({ phase: 0, wave: 0, drift: [0, 0, 0, 0] }, t, m);

// ---------- the noise (the shader's, and its twin) ----------
/** a lattice cell's gradient (-1..1 each; periodic over 256 cells): the shader's hash (Dave Hoskins' hash without sine), in float32 as the GPU */
export function hash2(cx: number, cy: number): [number, number] {
  const f = Math.fround, m = (v: number) => f(v - 256 * Math.floor(v / 256));
  const x = m(cx), y = m(cy);
  let p0 = f(fract(f(x * 0.1031))), p1 = f(fract(f(y * 0.103))), p2 = f(fract(f(x * 0.0973)));
  const dd = f(f(p0 * f(p1 + 33.33)) + f(p1 * f(p2 + 33.33)) + f(p2 * f(p0 + 33.33)));
  p0 = f(p0 + dd); p1 = f(p1 + dd); p2 = f(p2 + dd);
  return [f(fract(f(f(p0 + p1) * p2))) * 2 - 1, f(fract(f(f(p0 + p2) * p1))) * 2 - 1];
}
/** gradient noise at p and its derivatives (Inigo Quilez's form, quintic): [value (about -0.7..0.7), d/dx, d/dy] */
export function noiseD(px: number, py: number): [number, number, number] {
  const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const dux = 30 * fx * fx * (fx * (fx - 2) + 1), duy = 30 * fy * fy * (fy * (fy - 2) + 1);
  const ga = hash2(ix, iy), gb = hash2(ix + 1, iy), gc = hash2(ix, iy + 1), gd = hash2(ix + 1, iy + 1);
  const va = ga[0] * fx + ga[1] * fy, vb = gb[0] * (fx - 1) + gb[1] * fy, vc = gc[0] * fx + gc[1] * (fy - 1), vd = gd[0] * (fx - 1) + gd[1] * (fy - 1);
  const k = va - vb - vc + vd;
  const v = va + ux * (vb - va) + uy * (vc - va) + ux * uy * k;
  const dx = ga[0] + ux * (gb[0] - ga[0]) + uy * (gc[0] - ga[0]) + ux * uy * (ga[0] - gb[0] - gc[0] + gd[0]) + dux * (uy * k + vb - va);
  const dy = ga[1] + ux * (gb[1] - ga[1]) + uy * (gc[1] - ga[1]) + ux * uy * (ga[1] - gb[1] - gc[1] + gd[1]) + duy * (ux * k + vc - va);
  return [v, dx, dy];
}

// ---------- the CPU twin ----------
/** a mask sample as the shader reads it: the signed distance (tiles), the flow (x, y: -1..1) and the waves' strength times the exclusions */
export interface MotionSample { sd: number; fx: number; fy: number; amp: number }
/** a mask texel (RGBA bytes) as a sample */
export const sampleOf = (r: number, g: number, b: number, a: number): MotionSample => ({ sd: decodeSd(r), fx: (g / 255) * 2 - 1, fy: (b / 255) * 2 - 1, amp: a / 255 });
/** the shader's twin: the ground's pixel c (0..255) at tile point (x, y) where the mask reads s, in frame fr; edge: the pixel's distance from
 *  the picture's waterline (tiles, at most TAPS.step x TAPS.n; the shader reads it off the picture; here given, default from the field), shade:
 *  the last frame's shadow there (0..1). No frame (null: the motion off or faded out): c itself */
export function motionPixel(c: readonly number[], x: number, y: number, s: MotionSample, fr: MotionFrame | null, edge?: number, shade = 0): number[] {
  if (!fr || !(fr.gain > 0) || s.sd <= -0.7) return [...c];
  const cmax = TAPS.step * TAPS.n, key = waterKey(c[0]!, c[1]!, c[2]!), sd = s.sd, A = s.amp, fl = Math.hypot(s.fx, s.fy), river = fl > 0.3;
  const col = c.map(v => v / 255);
  const off = noiseD(x * FLOW.offF + 31.7, y * FLOW.offF + 11.3)[0] * FLOW.offK;
  let a: number[], b: number[];
  if (river) {
    const nx = s.fx / fl, ny = s.fy / fl, ph0 = fr.phase + off, ph1 = ph0 + 0.5, f0 = fract(ph0), f1 = fract(ph1), w0 = 1 - Math.abs(1 - 2 * f0), w1 = 1 - w0, wn = 1 / Math.sqrt(w0 * w0 + w1 * w1);
    const j0 = [fract(Math.floor(ph0) * 0.3183) * 64, fract(Math.floor(ph0) * 0.4142) * 64], j1 = [fract(Math.floor(ph1) * 0.3183) * 64 + 17, fract(Math.floor(ph1) * 0.4142) * 64 + 17];
    const d0 = FLOW.travel * (f0 - 0.5), d1 = FLOW.travel * (f1 - 0.5), mix2 = (p: number[], q: number[]) => p.map((v, i) => (v * w0 + q[i]! * w1) * wn);
    a = mix2(noiseD((x - nx * d0) * RIPPLE.fa + j0[0]!, (y - ny * d0) * RIPPLE.fa + j0[1]!), noiseD((x - nx * d1) * RIPPLE.fa + j1[0]!, (y - ny * d1) * RIPPLE.fa + j1[1]!));
    b = mix2(noiseD((x - nx * d0 * FLOW.fine) * RIPPLE.fb + j0[1]!, (y - ny * d0 * FLOW.fine) * RIPPLE.fb + j0[0]!), noiseD((x - nx * d1 * FLOW.fine) * RIPPLE.fb + j1[1]!, (y - ny * d1 * FLOW.fine) * RIPPLE.fb + j1[0]!));
  } else {
    a = noiseD(x * RIPPLE.fa - fr.drift[0]!, y * RIPPLE.fa - fr.drift[1]!);
    b = noiseD(x * RIPPLE.fb - fr.drift[2]!, y * RIPPLE.fb - fr.drift[3]!);
  }
  const gx = a[1]! * RIPPLE.fa * RIPPLE.ra + b[1]! * RIPPLE.fb * RIPPLE.rb, gy = a[2]! * RIPPLE.fa * RIPPLE.ra + b[2]! * RIPPLE.fb * RIPPLE.rb;
  let out = col;
  const e = edge ?? clamp(Math.abs(sd), 0, cmax);
  if (key > 0.001 && sd > -0.6) {
    // the water: the ripples' light, the sparkle, the foam crests
    const ww = key * smooth(-0.6, -0.1, sd), lit = -(gx * SUN_TILE[0] + gy * SUN_TILE[1]);
    const k = 1 + fr.ripple * RIPPLE.shade * clamp(lit, -2.5, 2.5) * smooth(RIPPLE.rise[0], RIPPLE.rise[1], sd) * ww;
    out = out.map(v => v * k);
    const nx = -gx * SPARKLE.bump, ny = -gy * SPARKLE.bump, nl = Math.hypot(nx, ny, 1), nh = Math.max(0, (nx * HALF[0] + ny * HALF[1] + HALF[2]) / nl);
    const sp = Math.pow(nh, SPARKLE.exp) * fr.sparkle * SPARKLE.amount * ww * smooth(SPARKLE.inset[0], SPARKLE.inset[1], sd) * (1 - clamp(shade, 0, 1));
    if (sp > 0) out = out.map((v, i) => v + sp * (v * 1.6 * SPARKLE.own + SPARKLE.sky[i]! * (1 - SPARKLE.own)));
    const fo = foamAt(sd, e, A, fr, off, river ? a[0]! : b[0]!, river) * ww;
    if (fo > 0) { const t = 0.82 + 0.36 * (0.5 + b[0]!); out = out.map((v, i) => v + (FOAM.col[i]! * t - v) * fo); }
  }
  if (key < 0.999 && sd < 0.45) {
    // the bank: the damp band and the swash running up it, by the pixel's distance from the waterline
    const bw = (1 - key), { wet, edge: fe } = bankAt(e, A, fr, off, b[0]!);
    if (wet > 0) out = out.map((v, i) => v * (1 + (WET.mul[i]! - 1) * wet * WET.amount * bw));
    if (fe > 0) out = out.map((v, i) => v + (FOAM.col[i]! - v) * fe * bw);
  }
  return out.map(v => clamp(v, 0, 1) * 255);
}
/** the foam crests' alpha on the water sd tiles in from the field's shore, e from the picture's waterline, at the waves' strength A (the
 *  slow offset off, the breakup layer's value n) */
export function foamAt(sd: number, e: number, A: number, fr: MotionFrame, off: number, n: number, river: boolean): number {
  const lam = FOAM.lam[0] + (FOAM.lam[1] - FOAM.lam[0]) * A, R = FOAM.reach[0] + (FOAM.reach[1] - FOAM.reach[0]) * A;
  if (!(sd < R) || !(A > 0)) return 0;
  const q = fract(sd / lam + fr.wave + off * 0.6), aw = Math.max(FOAM.width, FOAM.widthPx * fr.pxTile) / lam, tail = FOAM.tail / lam;
  const crest = smooth(0, aw, q) * (1 - smooth(aw, aw + tail, q)), brk = smooth(FOAM.broken[0], FOAM.broken[1], 0.5 + 1.1 * n);
  const env = smooth(R, 0.45 * R, sd) * smooth(0, 0.22, Math.min(e, Math.max(sd, 0) + 0.05)), far = 1 - smooth(FOAM.fadePx[0], FOAM.fadePx[1], fr.pxTile);
  return clamp(fr.foam * FOAM.alpha * Math.pow(A, 0.7) * env * crest * brk * far * (river ? FOAM.river : 1), 0, 0.6);
}
/** the bank e tiles past the picture's waterline: the wet band's share (0..1) and the swash edge's foam alpha, at the waves' strength A */
export function bankAt(e: number, A: number, fr: MotionFrame, off: number, n: number): { wet: number; edge: number } {
  if (!(A > 0.001)) return { wet: 0, edge: 0 };
  const q0 = fract(fr.wave + off * 0.6), run = smooth(0, 0.1, q0) * (1 - smooth(0.1, 0.75, q0));
  const vary = 0.7 + 0.6 * clamp(0.5 + n, 0, 1), reachW = (WET.damp + WET.run * A * run * Math.min(1, fr.foam)) * vary;
  const wet = (1 - smooth(0.55 * reachW, reachW, e)) * smooth(0.02, 0.12, A) * Math.min(1, fr.gain * 2);
  const lip = smooth(reachW - 0.07, reachW - 0.02, e) * (1 - smooth(reachW - 0.02, reachW + 0.03, e));
  const far = 1 - smooth(FOAM.fadePx[0], FOAM.fadePx[1], fr.pxTile);
  return { wet, edge: clamp(WET.edge * fr.foam * run * lip * smooth(FOAM.broken[0], FOAM.broken[1], 0.5 + 1.1 * n) * far, 0, 0.4) };
}

// ---------- the shader ----------
const g = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(+v.toFixed(6)));
const v2 = (a: readonly number[]) => `vec2(${g(a[0]!)}, ${g(a[1]!)})`;
const v3 = (a: readonly number[]) => `vec3(${g(a[0]!)}, ${g(a[1]!)}, ${g(a[2]!)})`;
/** GLSL (gl.ts FS_QUAD; needs uTex, uRect, uUV, the shadow layer's uShadeLayer, uLayerCam, uLayerScreen): waterMotion(c, p), motionPixel on the
 *  GPU from the same numbers, for the chunk's pixel c (0..1) at tile point p. Uniforms: uWaterTex (the chunk's mask), uWaterBox (its tile box),
 *  uWater (gain, ripple, foam, sparkle), uWaterT (the river's phase, the waves' phase, 0, tiles a device px), uWaterDrift (the ponds' drifts) */
export const WATER_MOTION_GLSL = `uniform sampler2D uWaterTex; uniform vec4 uWaterBox; uniform vec4 uWater; uniform vec4 uWaterT; uniform vec4 uWaterDrift;
vec2 wHash(vec2 c) {
  c = mod(c, 256.0);
  vec3 p = fract(vec3(c.x, c.y, c.x) * vec3(0.1031, 0.103, 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.xx + p.yz) * p.zy) * 2.0 - 1.0;
}
vec3 wNoise(vec2 p) {
  vec2 i = floor(p), f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0), du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  vec2 ga = wHash(i), gb = wHash(i + vec2(1.0, 0.0)), gc = wHash(i + vec2(0.0, 1.0)), gd = wHash(i + vec2(1.0, 1.0));
  float va = dot(ga, f), vb = dot(gb, f - vec2(1.0, 0.0)), vc = dot(gc, f - vec2(0.0, 1.0)), vd = dot(gd, f - vec2(1.0, 1.0)), k = va - vb - vc + vd;
  return vec3(va + u.x * (vb - va) + u.y * (vc - va) + u.x * u.y * k,
    ga + u.x * (gb - ga) + u.y * (gc - ga) + u.x * u.y * (ga - gb - gc + gd) + du * (u.yx * k + vec2(vb, vc) - va));
}
float wKey(vec3 c) { c *= 255.0; return smoothstep(${g(KEY.br[0])}, ${g(KEY.br[1])}, c.b - c.r) * smoothstep(${g(KEY.gr[0])}, ${g(KEY.gr[1])}, c.g - c.r); }
vec4 wMask(vec2 p) { return textureLod(uWaterTex, (p - uWaterBox.xy) / (uWaterBox.zw - uWaterBox.xy), 0.0); }
float wSd(vec4 m) { return mix(${g(SD_RANGE[0])}, ${g(SD_RANGE[1])}, m.r); }
/** the chunk picture at tile point p (world px X = HW (x - y), Y = HH (x + y), through the quad's rect and uv) */
vec3 wPic(vec2 p) {
  vec2 w = vec2(${g(HW)} * (p.x - p.y), ${g(HH)} * (p.x + p.y));
  return textureLod(uTex, uUV.xy + (w - uRect.xy) / (uRect.zw - uRect.xy) * (uUV.zw - uUV.xy), 0.0).rgb;
}
/** how far (tiles) the pixel at p lies from the picture's waterline, read along the field's slope (toWater: a bank pixel looks for water) */
float wEdge(vec2 p, float sd, bool toWater) {
  vec2 gr = vec2(wSd(wMask(p + vec2(0.3, 0.0))) - sd, wSd(wMask(p + vec2(0.0, 0.3))) - sd);
  float gl = length(gr); if (gl < 1e-4) return ${g(TAPS.step * TAPS.n)};
  vec2 dir = gr / gl * (toWater ? 1.0 : -1.0);
  for (int i = 1; i <= ${TAPS.n}; i++) {
    float r = float(i) * ${g(TAPS.step)};
    if ((wKey(wPic(p + dir * r)) > 0.5) == toWater) {
      // (one more tap halfway back: a twentieth of a tile)
      float h = r - ${g(TAPS.step / 2)};
      return ((wKey(wPic(p + dir * h)) > 0.5) == toWater) ? h - ${g(TAPS.step / 4)} : r - ${g(TAPS.step / 4)};
    }
  }
  return ${g(TAPS.step * TAPS.n)};
}
vec3 waterMotion(vec3 c, vec2 p) {
  vec4 m = wMask(p);
  float sd = wSd(m);
  if (sd <= -0.7) return c;
  float key = wKey(c), A = m.a;
  vec2 F = m.gb * 2.0 - 1.0; float fl = length(F); bool river = fl > 0.3;
  float off = wNoise(p * ${g(FLOW.offF)} + vec2(31.7, 11.3)).x * ${g(FLOW.offK)};
  vec3 a, b;
  if (river) {
    vec2 n = F / fl;
    float ph0 = uWaterT.x + off, ph1 = ph0 + 0.5, f0 = fract(ph0), f1 = fract(ph1), w0 = 1.0 - abs(1.0 - 2.0 * f0), w1 = 1.0 - w0, wn = inversesqrt(w0 * w0 + w1 * w1);
    vec2 j0 = fract(floor(ph0) * vec2(0.3183, 0.4142)) * 64.0, j1 = fract(floor(ph1) * vec2(0.3183, 0.4142)) * 64.0 + 17.0;
    vec2 d0 = n * (${g(FLOW.travel)} * (f0 - 0.5)), d1 = n * (${g(FLOW.travel)} * (f1 - 0.5));
    a = (wNoise((p - d0) * ${g(RIPPLE.fa)} + j0) * w0 + wNoise((p - d1) * ${g(RIPPLE.fa)} + j1) * w1) * wn;
    b = (wNoise((p - d0 * ${g(FLOW.fine)}) * ${g(RIPPLE.fb)} + j0.yx) * w0 + wNoise((p - d1 * ${g(FLOW.fine)}) * ${g(RIPPLE.fb)} + j1.yx) * w1) * wn;
  } else {
    a = wNoise(p * ${g(RIPPLE.fa)} - uWaterDrift.xy);
    b = wNoise(p * ${g(RIPPLE.fb)} - uWaterDrift.zw);
  }
  vec2 gs = a.yz * ${g(RIPPLE.fa * RIPPLE.ra)} + b.yz * ${g(RIPPLE.fb * RIPPLE.rb)};
  vec3 col = c;
  bool near = sd < 0.75;
  float e = near ? wEdge(p, sd, key < 0.5) : ${g(TAPS.step * TAPS.n)};
  if (key > 0.001 && sd > -0.6) {
    float ww = key * smoothstep(-0.6, -0.1, sd), lit = -dot(gs, ${v2(SUN_TILE)});
    col *= 1.0 + uWater.y * ${g(RIPPLE.shade)} * clamp(lit, -2.5, 2.5) * smoothstep(${g(RIPPLE.rise[0])}, ${g(RIPPLE.rise[1])}, sd) * ww;
    vec3 N = normalize(vec3(-gs * ${g(SPARKLE.bump)}, 1.0));
    float sp = pow(max(dot(N, ${v3(HALF)}), 0.0), ${g(SPARKLE.exp)}) * uWater.w * ${g(SPARKLE.amount)} * ww * smoothstep(${g(SPARKLE.inset[0])}, ${g(SPARKLE.inset[1])}, sd);
    if (sp > 0.002 && uLayerCam.w > 0.5) {
      // (no sun glint in a shadow: the last frame's shadow layer where this pixel's world point lay then, as T262's shine)
      vec2 q = (vW - uLayerCam.xy) * uLayerCam.z + 0.5 * uLayerScreen;
      vec2 sb = textureLod(uShadeLayer, vec2(q.x / uLayerScreen.x, 1.0 - q.y / uLayerScreen.y), 0.0).rg;
      sp *= 1.0 - clamp(max(sb.r, sb.g), 0.0, 1.0);
    }
    col += sp * (col * ${g(1.6 * SPARKLE.own)} + ${v3(SPARKLE.sky.map(v => v * (1 - SPARKLE.own)))});
    // the foam crests running in
    float lam = mix(${g(FOAM.lam[0])}, ${g(FOAM.lam[1])}, A), R = mix(${g(FOAM.reach[0])}, ${g(FOAM.reach[1])}, A);
    if (sd < R && A > 0.0) {
      float q = fract(sd / lam + uWaterT.y + off * 0.6), aw = max(${g(FOAM.width)}, ${g(FOAM.widthPx)} * uWaterT.w) / lam, tail = ${g(FOAM.tail)} / lam;
      float crest = smoothstep(0.0, aw, q) * (1.0 - smoothstep(aw, aw + tail, q));
      float brk = smoothstep(${g(FOAM.broken[0])}, ${g(FOAM.broken[1])}, 0.5 + 1.1 * (river ? a.x : b.x));
      float env = smoothstep(R, 0.45 * R, sd) * smoothstep(0.0, 0.22, min(e, max(sd, 0.0) + 0.05)) * (1.0 - smoothstep(${g(FOAM.fadePx[0])}, ${g(FOAM.fadePx[1])}, uWaterT.w));
      float fo = clamp(uWater.z * ${g(FOAM.alpha)} * pow(A, 0.7) * env * crest * brk * (river ? ${g(FOAM.river)} : 1.0), 0.0, 0.6) * ww;
      col = mix(col, ${v3(FOAM.col)} * (0.82 + 0.36 * (0.5 + b.x)), fo);
    }
  }
  if (key < 0.999 && sd < 0.45 && A > 0.001) {
    // the bank: the damp band and the swash running up it
    float bw = 1.0 - key, q0 = fract(uWaterT.y + off * 0.6), run = smoothstep(0.0, 0.1, q0) * (1.0 - smoothstep(0.1, 0.75, q0));
    float rw = (${g(WET.damp)} + ${g(WET.run)} * A * run * min(1.0, uWater.z)) * (0.7 + 0.6 * clamp(0.5 + b.x, 0.0, 1.0));
    float wet = (1.0 - smoothstep(0.55 * rw, rw, e)) * smoothstep(0.02, 0.12, A) * min(1.0, uWater.x * 2.0);
    col *= 1.0 + (${v3(WET.mul)} - 1.0) * (wet * ${g(WET.amount)} * bw);
    float lip = smoothstep(rw - 0.07, rw - 0.02, e) * (1.0 - smoothstep(rw - 0.02, rw + 0.03, e));
    float fe = clamp(${g(WET.edge)} * uWater.z * run * lip * smoothstep(${g(FOAM.broken[0])}, ${g(FOAM.broken[1])}, 0.5 + 1.1 * b.x) * (1.0 - smoothstep(${g(FOAM.fadePx[0])}, ${g(FOAM.fadePx[1])}, uWaterT.w)), 0.0, 0.4);
    col = mix(col, ${v3(FOAM.col)}, fe * bw);
  }
  return clamp(col, 0.0, 1.0);
}`;
