/** T360 (#1015; the owner, 2026-11-09: "we still have a river that looks like a canal?"): the natural river of terrain model 2.
 *
 *  The old river (model 1) followed the steepest descent of a V-shaped valley cut along a straight guide line: a dead-straight ribbon of one
 *  width with ruler-straight banks. Model 2 draws the river's course first and cuts the valley round it:
 *  - **meanderLine**: the centreline marches from the source edge to the exit edge by a heading that chases the exit and wanders at three
 *    scales (the meanders: a sine-generated curve whose wavelength and angle swing; the valley's slower sweep; a small irregular noise: all
 *    deterministic from the map seed), its turn limited to a radius (kmax) a river this wide can really have, so it bends all the way and has
 *    no long straight run;
 *  - **shapeRiver**: along it the width swings (wider in the bends where the pools are, narrower at the crossings where the riffles are), each
 *    bank has its own small bays and points, the bar side of a bend (the inside) rougher than its cut side (the outside), and a point bar's
 *    width is worked out for the inside of every bend (WaterPoint.bar, the renderer lays the sand on it, the cut bank is the outside).
 *
 *  The stored points keep the meaning every consumer already has (a centreline and a full width, the water a disc at each point and a trapezoid
 *  between each two: terrain-paint.ts waterShape, map-water.ts, water-look.ts, swamp.ts, river-trees.ts): the point is the middle of the two
 *  banks, so the two banks differ though the shape is symmetric about it. Pure TypeScript, no DOM; units are tiles of 2 m. */
import { clamp } from '../iso';
import { smoothstep, type Noise } from './noise';
import { TC, type WaterPoint } from './types';

export type P = { x: number; y: number };

/** the point bar's width as a share of the water's width at the apex of a bend, and the widest the water gets (tiles): the band look and the belt read them */
export const BAR_SHARE = 0.27, W_MAX = 52;
/** the natural river's numbers (tiles unless said). They are terrain model 2's contract: a save stamped model 2 rebuilds its valley from them, so
 *  changing one (or anything else this file and generate.ts's nat branches compute) puts every such town beside another river: a change is a new
 *  model (TERRAIN_MODEL 3, the old numbers kept for model 2), never an edit.
 *  - wander: the heading's wander in radians, three parts. med, the meanders: a sine of the arc (the classic sine-generated curve: a bend, its
 *    mirror, the next) whose wavelength is med[0] tiles on average, its angle med[1], the wavelength swinging by med[2] (a share) over about
 *    450 tiles and the angle by med[3] over 260, so the bends are never alike (a heading swing of 1 radian over 340 tiles is a bend of about 55
 *    tiles' radius at its apex and a river a third longer than its chord), and a second harmonic of share med[4] at a swinging phase skews them;
 *    large, the valley's sweep: the same, wavelength large[0], angle large[1]; small, a Perlin noise of wavelength small[0] and angle small[1],
 *    the irregular rhythm on top;
 *    ds: the step of the march; kmax: the sharpest turn a step may make (1 / the tightest radius); fade: the wander grows over this arc from
 *    the source edge and dies away over this much before the exit; pad: how far outside the borders the march starts and aims; look: how far
 *    ahead along the chord the river aims (the pull back from a stray: a wander of w radians strays about look x w tiles); maxDev: the most its
 *    heading may stray from the chord's, radians (soft: tanh): short of a right angle, so the river never doubles back along its way and a road
 *    straight across it crosses it once (the county road of a range start has at most two bridges)
 *  - step: the spacing of the stored points (the banks' smallest bay is about twice it)
 *  - width: the base width (from the old river's noise, wavelength widthWave), times pool: 0.8 on a riffle to 1.14 on a bend's apex (and its slow swing of 0.1),
 *    and a slow swing of its own (poolWave); held to wMin..wMax. The bend is the turn's tightness: a radius at or under bendRadius
 *  - bank: each bank's bays and points: the amplitude 0.18 of the width plus bankBase tiles, over five waves (the shares sum to 1); the cut
 *    side's share of it cutRough (a steep bank is clean), the bar side's barRough
 *  - bar: the point bar's width, the share of the water's width at the apex of a bend, its slow swing over barWave (and two finer ones, its
 *    outline), and the bends between which it grows from nothing (a crossing has none) to whole (the crescent's horns taper over the range)
 *  - creek: the creeks' own meander (shapeCreek's, creekSwing): a sine of the arc along the flow path, about creekWave tiles a swing and creekAmp tiles
 *    wide, both swinging by a third and two-fifths, so no creek runs a straight line as the flow's grid left it */
export const NAT = {
  wander: { med: [330, 1.0, 0.4, 0.4, 0.2], large: [800, 0.12], small: [70, 0.4] } as const, ds: 4, kmax: 1 / 52, fade: 120, pad: 48, look: 130, maxDev: 1.1,
  step: 1.5,
  widthBase: [18, 32] as const, widthWave: 260, pool: [0.8, 0.34, 0.1] as const, poolWave: 70, wMin: 14, wMax: W_MAX, bendRadius: 80,
  bankWaves: [[60, 0.26], [22, 0.22], [11, 0.22], [6, 0.16], [3.2, 0.14]] as const, bankAmp: 0.18, bankBase: 1.1, cutRough: 0.75, barRough: 1.15,
  bar: BAR_SHARE, barWave: 48, barFrom: [0.12, 0.95] as const,
  creekWave: 90, creekAmp: 8, chordPull: 0.3, spread: 1.75,
} as const;
/** where the river leaves, pulled toward straight across from where it enters (NAT.chordPull of the way along the exit edge from the point straight
 *  across, 1 the exit as drawn): the natural river's chord runs nearer the map's axes, so the free ground on each side of it holds the big rectangles
 *  a range start's parcel needs (golf/rangestart.ts) as the old river's did */
export function pullExit(source: P, exit: P, vertical: boolean): P { return vertical ? { x: source.x + (exit.x - source.x) * NAT.chordPull, y: exit.y } : { x: exit.x, y: source.y + (exit.y - source.y) * NAT.chordPull }; }
/** a point's place along its edge (map fractions) spread out from the middle by NAT.spread (the river's chord then runs farther from the map's centre) */
export function spreadAlong(p: P, vertical: boolean): P { const f = (v: number) => clamp(0.5 + (v - 0.5) * NAT.spread, 0.12, 0.88); return vertical ? { x: f(p.x), y: p.y } : { x: p.x, y: f(p.y) }; }
/** the wander's numbers (see NAT.wander); a spec to try others */
export interface WanderSpec { med: readonly number[]; large: readonly number[]; small: readonly number[] }

const wrap = (a: number) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/** the chord's clip against the box [0, map]^2 (Liang-Barsky): the parameter range [t0, t1] of segment a-b inside it, or null */
function clip(a: P, b: P, map: number): [number, number] | null {
  let t0 = 0, t1 = 1; const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x], [dx, map - a.x], [-dy, a.y], [dy, map - a.y]] as const) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return t0 <= t1 ? [t0, t1] : null;
}

/** the river's centreline from a (on the source border) to b (on the exit border): marched from NAT.pad outside the one to NAT.pad outside the
 *  other, the heading chasing the exit (so the wander can never take the river off its course for long) plus the three-scale wander, each step
 *  turning at most kmax a tile; cut where it crosses the borders (the first and last points are on them). Points NAT.ds apart. Never fails: a
 *  march that does not cross both borders gives the straight chord */
export function meanderLine(wander: Noise, a: P, b: P, map: number, spec: WanderSpec = NAT.wander, look: number = NAT.look): P[] {
  const chord = Math.hypot(b.x - a.x, b.y - a.y) || 1, th0 = Math.atan2(b.y - a.y, b.x - a.x), ux = Math.cos(th0), uy = Math.sin(th0);
  const x0 = a.x - ux * NAT.pad, y0 = a.y - uy * NAT.pad, len = chord + 2 * NAT.pad, ds = NAT.ds, maxTurn = NAT.kmax * ds, TAU = 2 * Math.PI;
  const { med, large, small } = spec;
  let x = x0, y = y0, th = th0, pm = TAU * (0.5 + 0.5 * wander(31.7, 2.3)), pl = TAU * (0.5 + 0.5 * wander(47.1, 6.9));
  const raw: P[] = [{ x, y }];
  for (let i = 1; i < 4000; i++) {
    const s = i * ds, along = (x - x0) * ux + (y - y0) * uy, rem = len - along;
    if (rem < ds) break;
    // the carrot: the point of the chord `look` ahead of the river's own along-chord position (the farther the river strays, the harder the pull back)
    const c = Math.min(len, along + look), cx = x0 + ux * c, cy = y0 + uy * c;
    const env = smoothstep(0, NAT.fade, s) * smoothstep(0, NAT.fade, rem);
    // the meanders and the valley's sweep: sines of a phase that runs at 2 pi a wavelength, the wavelength and the angle swinging slowly
    pm += TAU * ds / (med[0]! * Math.exp(med[2]! * wander(s / 450 + 5.3, 8.1))); pl += TAU * ds / (large[0]! * Math.exp(0.25 * wander(s / 1200 + 2.9, 3.7)));
    const w = med[1]! * (1 + med[3]! * wander(s / 260 + 9.7, 3.3)) * (Math.sin(pm) + med[4]! * Math.sin(2 * pm + 2.4 * wander(s / 300 + 1.3, 6.1))) + large[1]! * Math.sin(pl) + small[1]! * wander(s / small[0]!, 5.5);
    const rel = wrap(Math.atan2(cy - y, cx - x) - th0) + env * w, d = clamp(wrap(th0 + NAT.maxDev * Math.tanh(rel / NAT.maxDev) - th), -maxTurn, maxTurn);
    th += d; x += Math.cos(th) * ds; y += Math.sin(th) * ds;
    raw.push({ x, y });
    if (s > 3 * chord) break;
  }
  // the part inside the map, from the first crossing in to the first crossing out
  const out: P[] = []; let inside = false;
  for (let k = 0; k + 1 < raw.length; k++) {
    const c = clip(raw[k]!, raw[k + 1]!, map); if (!c) { if (inside) break; continue; }
    const p0 = raw[k]!, p1 = raw[k + 1]!, q0 = { x: p0.x + (p1.x - p0.x) * c[0], y: p0.y + (p1.y - p0.y) * c[0] }, q1 = { x: p0.x + (p1.x - p0.x) * c[1], y: p0.y + (p1.y - p0.y) * c[1] };
    if (!inside) { out.push(q0); inside = true; } else if (c[0] > 0) break;
    out.push(q1);
    if (c[1] < 1) break; // left the map
  }
  const ok = out.length > 8 && [out[0]!, out[out.length - 1]!].every(p => Math.min(p.x, p.y, map - p.x, map - p.y) < 1e-6 + 0.5);
  return ok ? out : [a, b];
}

/** a polyline resampled at a fixed arc spacing, ending exactly on its last point */
export function resampleLine(pts: readonly P[], step: number): P[] {
  const out: P[] = [pts[0]!];
  let remain = step;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k]!, b = pts[k + 1]!, L = Math.hypot(b.x - a.x, b.y - a.y);
    let pos = 0;
    while (L - pos >= remain) { pos += remain; const t = pos / L; out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); remain = step; }
    remain -= L - pos;
  }
  const end = pts[pts.length - 1]!, last = out[out.length - 1]!;
  if (out.length > 1 && Math.hypot(end.x - last.x, end.y - last.y) < step * 0.5) out.pop();
  out.push(end);
  return out;
}

/** the noises shapeRiver draws on (generate.ts: seeded noises 9, 15, 16 and 17) */
export interface RiverNoise { width: Noise; left: Noise; right: Noise; pool: Noise }

/** the stored river: the line (NAT.step apart) with a width, a mid-line shifted to the middle of two independent banks, and a point bar on the
 *  inside of each bend. The bar is signed: positive on the +N side (N = (-ty, tx), the side the line turns toward when its heading grows) */
export function shapeRiver(line: readonly P[], nz: RiverNoise): WaterPoint[] {
  const c = resampleLine(line, NAT.step), n = c.length, s = new Float64Array(n);
  for (let i = 1; i < n; i++) s[i] = s[i - 1]! + Math.hypot(c[i]!.x - c[i - 1]!.x, c[i]!.y - c[i - 1]!.y);
  // headings by the chord 6 tiles of arc either side (two points at the old 3-tile step), unwrapped; the turn (curvature) over 12 tiles either side
  const P6 = Math.max(1, Math.round(6 / NAT.step)), P12 = Math.max(1, Math.round(12 / NAT.step)), P9 = Math.max(1, Math.round(9 / NAT.step));
  const th = new Float64Array(n), tx = new Float64Array(n), ty = new Float64Array(n);
  for (let i = 0; i < n; i++) { const a = c[Math.max(0, i - P6)]!, b = c[Math.min(n - 1, i + P6)]!, l = Math.hypot(b.x - a.x, b.y - a.y) || 1; tx[i] = (b.x - a.x) / l; ty[i] = (b.y - a.y) / l; th[i] = Math.atan2(ty[i]!, tx[i]!); }
  for (let i = 1; i < n; i++) th[i] = th[i - 1]! + wrap(th[i]! - th[i - 1]!);
  const kappa = new Float64Array(n);
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - P12), b = Math.min(n - 1, i + P12), ds = s[b]! - s[a]!; kappa[i] = ds > 0 ? (th[b]! - th[a]!) / ds : 0; }
  // the bend: 0 straight .. 1 at a radius of bendRadius or less; the turning smoothed over three points either side before its size is taken, so it
  // dies away where a bend gives way to the next (the line crosses over: its turning changes sign) and the bar there is none
  const bend = new Float64Array(n), signed = new Float64Array(n);
  for (let i = 0; i < n; i++) { let t = 0, m = 0; for (let j = Math.max(0, i - P9); j <= Math.min(n - 1, i + P9); j++) { t += kappa[j]!; m++; } signed[i] = t / m; bend[i] = clamp(Math.abs(signed[i]!) * NAT.bendRadius, 0, 1); }
  const pts: WaterPoint[] = [];
  for (let i = 0; i < n; i++) {
    const arc = s[i]!, bd = bend[i]!, nx = -ty[i]!, ny = tx[i]!, inner = signed[i]! >= 0 ? 1 : -1;
    // width: the old river's slow swing, times the pool (riffle .. apex) and its own slow swing
    const base = NAT.widthBase[0] + (NAT.widthBase[1] - NAT.widthBase[0]) * (0.5 + 0.5 * nz.width(arc / NAT.widthWave, 0.5));
    const w = clamp(base * (NAT.pool[0] + NAT.pool[1] * bd + NAT.pool[2] * nz.pool(arc / NAT.poolWave, 0.77)), NAT.wMin, NAT.wMax);
    // banks: each its own bays and points; the bar side (the inside of a bend) rougher, the cut side (the outside) cleaner
    const amp = NAT.bankAmp * w + NAT.bankBase;
    const swing = (noise: Noise, row: number) => { let v = 0; for (let k = 0; k < NAT.bankWaves.length; k++) v += NAT.bankWaves[k]![1] * noise(arc / NAT.bankWaves[k]![0], row + 3.7 * k); return v; };
    const kL = inner > 0 ? 1 + (NAT.barRough - 1) * bd : 1 - (1 - NAT.cutRough) * bd, kR = inner > 0 ? 1 - (1 - NAT.cutRough) * bd : 1 + (NAT.barRough - 1) * bd;
    let L = Math.max(w * 0.3, w / 2 + amp * kL * swing(nz.left, 0.31)), R = Math.max(w * 0.3, w / 2 + amp * kR * swing(nz.right, 0.67));
    const kw = clamp(L + R, NAT.wMin, NAT.wMax) / (L + R); L *= kw; R *= kw; // (the banks' bays and points keep the water's width within its bounds)
    // the bar: on the inside of a bend, its width the share of the water's, swinging slowly, none where the line crosses
    const out = 0.5 * nz.pool(arc / NAT.barWave + 11.3, 2.19) + 0.3 * nz.pool(arc / 17 + 3.1, 5.3) + 0.2 * nz.pool(arc / 7.5 + 8.7, 8.1);
    const bar = NAT.bar * (L + R) * Math.pow(smoothstep(NAT.barFrom[0], NAT.barFrom[1], bd), 1.3) * (0.78 + 0.22 * clamp(1.6 * out, -1, 1));
    const sh = (L - R) / 2;
    pts.push({ x: c[i]!.x + nx * sh, y: c[i]!.y + ny * sh, w: L + R, bar: inner * bar });
  }
  // the bars' ends: where a bend gives way to the next (the sign changes, the turning is quick) the bar would stop in a few tiles; averaged over 12
  // tiles either side (a box, the sign kept: the two bars' horns meet at nothing) it tapers away over twice as far
  const raw = pts.map(p => p.bar!);
  for (let i = 0; i < n; i++) { let t = 0, m = 0; for (let j = Math.max(0, i - P12); j <= Math.min(n - 1, i + P12); j++) { t += raw[j]!; m++; } pts[i]!.bar = Math.round((t / m) * 100) / 100; }
  return pts;
}

/** the distance (map fractions) from each height sample's centre (HS x HS samples HSTEP tiles apart) to the line: the valley's V, which
 *  generate.ts cuts 70 m a map's width deep round the river as it did round the old guide */
export function valleyDist(line: readonly P[], HS: number, HSTEP: number, map: number): Float32Array {
  // (every fifth point: a chord 20 tiles long sits a tile off a bend of the tightest radius, a hundredth of a metre of valley)
  const sp: P[] = []; for (let i = 0; i < line.length; i += 5) sp.push(line[i]!); if (sp[sp.length - 1] !== line[line.length - 1]) sp.push(line[line.length - 1]!);
  const out = new Float32Array(HS * HS);
  for (let j = 0; j < HS; j++) for (let i = 0; i < HS; i++) {
    const x = (i + 0.5) * HSTEP, y = (j + 0.5) * HSTEP; let best = Infinity;
    for (let k = 0; k + 1 < sp.length; k++) {
      const a = sp[k]!, b = sp[k + 1]!, dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy, t = l2 > 0 ? clamp(((x - a.x) * dx + (y - a.y) * dy) / l2, 0, 1) : 0, ex = a.x + dx * t - x, ey = a.y + dy * t - y, d = ex * ex + ey * ey;
      if (d < best) best = d;
    }
    out[j * HS + i] = Math.sqrt(best) / map;
  }
  return out;
}

/** the height samples the line passes through (indices j * HS + i), for the creeks' river mask */
export function lineCells(line: readonly P[], HS: number, HSTEP: number): number[] {
  const seen = new Set<number>();
  for (let k = 0; k + 1 < line.length; k++) {
    const a = line[k]!, b = line[k + 1]!, n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
    for (let q = 0; q <= n; q++) { const i = clamp(Math.floor((a.x + (b.x - a.x) * q / n) / HSTEP), 0, HS - 1), j = clamp(Math.floor((a.y + (b.y - a.y) * q / n) / HSTEP), 0, HS - 1); seen.add(j * HS + i); }
  }
  return [...seen];
}

/** the natural river's classes: its water (a tile whose centre is within half the local width of a point, TC.WATER: the points are 1.5 tiles apart, so
 *  the discs' union is the river to a few hundredths of a tile) and its bank, 3 tiles past the water and, on the inside of a bend, as far past it as the point
 *  bar there is wide (TC.BANK; never over water). cls is the map's class grid. Row by row, a fill of each disc's span: about 6 ms for a river */
export function rasterRiverNat(cls: Uint8Array, pts: readonly WaterPoint[], map: number, bank = 3): void {
  /** a disc's rows: f(y, x0, x1) for each row's span of tile centres within r of (px, py) */
  const disc = (px: number, py: number, r: number, f: (y: number, x0: number, x1: number) => void) => {
    const y0 = Math.max(0, Math.ceil(py - r - 0.5)), y1 = Math.min(map - 1, Math.floor(py + r - 0.5));
    for (let y = y0; y <= y1; y++) { const dy = y + 0.5 - py, h = Math.sqrt(Math.max(0, r * r - dy * dy)); f(y, Math.max(0, Math.ceil(px - h - 0.5)), Math.min(map - 1, Math.floor(px + h - 0.5))); }
  };
  // the banks first (the water is laid over them): every point's disc grown by the bank, and on its bar's side, the strip out to the bar's width
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!, r = p.w / 2, bar = p.bar ?? 0;
    disc(p.x, p.y, r + bank, (y, x0, x1) => { if (x1 >= x0) cls.fill(TC.BANK, y * map + x0, y * map + x1 + 1); });
    if (Math.abs(bar) < 1e-6) continue;
    const a = pts[Math.max(0, i - 2)]!, b = pts[Math.min(pts.length - 1, i + 2)]!, l = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / l, ny = (b.x - a.x) / l, side = Math.sign(bar);
    const R2 = (r + bank + Math.abs(bar)) ** 2, R1 = (r + bank) ** 2;
    disc(p.x, p.y, r + bank + Math.abs(bar), (y, x0, x1) => {
      const dy = y + 0.5 - p.y;
      for (let x = x0; x <= x1; x++) { const dx = x + 0.5 - p.x, d2 = dx * dx + dy * dy; if (d2 > R2) continue; if (d2 > R1 && (dx * nx + dy * ny) * side > 0) cls[y * map + x] = TC.BANK; }
    });
  }
  for (const p of pts) disc(p.x, p.y, p.w / 2, (y, x0, x1) => { if (x1 >= x0) cls.fill(TC.WATER, y * map + x0, y * map + x1 + 1); });
}

/** the natural creek's lateral swing (tiles) at each point of its line (arc: the arc length of each): a sine whose phase runs at 2 pi a wavelength
 *  (NAT.creekWave, swinging by a third over 200 tiles) and whose amplitude (NAT.creekAmp) swings by 40% over 120; row picks this creek's part of the noise */
export function creekSwing(nz: Noise, arc: readonly number[], row: number): number[] {
  const out: number[] = [], TAU = 2 * Math.PI; let ph = TAU * (0.5 + 0.5 * nz(row * 4.3 + 0.7, 9.1));
  for (let k = 0; k < arc.length; k++) {
    if (k > 0) ph += TAU * (arc[k]! - arc[k - 1]!) / (NAT.creekWave * Math.exp(0.3 * nz(arc[k]! / 200 + row * 2.1, 11.3)));
    out.push(NAT.creekAmp * (1 + 0.4 * nz(arc[k]! / 120 + row * 3.1, 7.7)) * Math.sin(ph));
  }
  return out;
}

/** a creek's stored points made natural (model 2): the line at NAT.step, its width (the old one from the water it carries, 3 to 8) swinging
 *  by about a third over a slow noise, each bank with its own bays and points, the mid-line shifted to the middle of the two. Ends kept */
export function shapeCreek(pts: readonly WaterPoint[], nz: { width: Noise; left: Noise; right: Noise }, row: number): WaterPoint[] {
  const n0 = pts.length, c: P[] = [], w0: number[] = [];
  // the line and the width along it, resampled
  { const out: P[] = [pts[0]!], ws = [pts[0]!.w]; let remain = NAT.step;
    for (let k = 0; k + 1 < n0; k++) {
      const a = pts[k]!, b = pts[k + 1]!, L = Math.hypot(b.x - a.x, b.y - a.y); let pos = 0;
      while (L - pos >= remain) { pos += remain; const t = pos / L; out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); ws.push(a.w + (b.w - a.w) * t); remain = NAT.step; }
      remain -= L - pos;
    }
    const end = pts[n0 - 1]!, last = out[out.length - 1]!;
    if (out.length > 1 && Math.hypot(end.x - last.x, end.y - last.y) < NAT.step * 0.5) { out.pop(); ws.pop(); }
    out.push({ x: end.x, y: end.y }); ws.push(end.w); c.push(...out); w0.push(...ws);
  }
  const n = c.length, s = new Float64Array(n);
  for (let i = 1; i < n; i++) s[i] = s[i - 1]! + Math.hypot(c[i]!.x - c[i - 1]!.x, c[i]!.y - c[i - 1]!.y);
  const out: WaterPoint[] = [];
  for (let i = 0; i < n; i++) {
    const a = c[Math.max(0, i - 2)]!, b = c[Math.min(n - 1, i + 2)]!, l = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / l, ny = (b.x - a.x) / l, arc = s[i]!;
    const w = clamp(w0[i]! * (0.62 + 0.76 * (0.5 + 0.5 * nz.width(arc / 48 + row * 3.1, 0.5 + row))), 2.5, 9);
    const amp = 0.14 * w + 0.2, swing = (noise: Noise, r: number) => { let v = 0; for (let k = 0; k < NAT.bankWaves.length; k++) v += NAT.bankWaves[k]![1] * noise(arc / (NAT.bankWaves[k]![0] * 0.6) + row * 5.3, r + 3.7 * k); return v; };
    const edge = i === 0 || i === n - 1 ? 0 : 1; // (the ends stay where they are: a creek's last point is where it joins)
    let L = Math.max(w * 0.3, w / 2 + edge * amp * swing(nz.left, 0.31)), R = Math.max(w * 0.3, w / 2 + edge * amp * swing(nz.right, 0.67));
    const k = clamp(L + R, 2.5, 9) / (L + R); L *= k; R *= k; // (the banks' bays and points keep the creek's width within its bounds)
    const sh = (L - R) / 2;
    out.push({ x: c[i]!.x + nx * sh, y: c[i]!.y + ny * sh, w: L + R });
  }
  return out;
}
