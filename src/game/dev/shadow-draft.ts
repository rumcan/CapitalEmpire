// The vector shadows' first drafts (T142, dev only): each picture's contact and cast shapes from its own pixels (shadow-vector.ts explains the
// shapes). Pure over an alpha image, so node tests can run it; the dev page ?shadows=draft runs it over every library picture
// (shadow-draft-page.ts) and scripts/dev/draft-shadows.mjs writes the result to src/game/shadow-shapes.json.
//
// 1. The picture's foot: each column's lowest opaque pixel. A column TOUCHES the ground when nothing in the picture stands lower in front of it
//    (the iso tent: the lowest pixel of any column, minus half the distance to it, the slope of the ground's map axes in the 2:1 view).
// 2. The ground line under every column: through the touching columns' feet (a box's walls give its V, two posts give the line between them),
//    flat past the outer ones; or flat at the lowest foot (a tree's trunk, a pole: what stands above one point).
// 3. The cast: every opaque pixel h px above its column's ground line lands at its foot + h * the sun's shear; the landed pixels are filled
//    and traced, the outline simplified to a few vertices, each keeping its foot and height (so the sun can still move).
// 4. The contact: the touching columns, in runs (legs, posts, a wall's base); runs closer than the clearance under the picture merge (a car's
//    wheels and its body); a narrow run is a round spot at its foot, a wide one a band along the ground line under it.
import type { VectorShadow } from '../shadow-vector';

export type DraftKind = 'tree' | 'plant' | 'pole' | 'vehicle' | 'building' | 'fence' | 'prop' | 'walker';
/** a picture's draft hints (src/game/dev/shadow-hints.json, the hand corrections; every field optional) */
export interface DraftHint {
  /** the shadow kind the draft treats it as */
  kind?: DraftKind;
  /** the ground line: 'iso' through the touching feet, 'flat' at the lowest foot; or its points [x, y, x, y, ...] (display px about the anchor) */
  ground?: 'iso' | 'flat' | number[];
  /** no shadows at all (a flat ground picture) */
  none?: boolean;
  /** no contact shape / no cast shape */
  contact?: false | number[][]; cast?: false;
  /** the cast's heights times this (a picture drawn taller or shorter than its thing) */
  height?: number;
  /** only pixels at least this high cast (display px: the ground-level part of a picture lies flat) */
  minH?: number;
  /** pixels below this line (display px about the anchor, y) are ground: they cast nothing */
  groundBelow?: number;
  /** the contact runs merge across gaps whose underside stays within this many display px of the ground (a bench seat stays apart) */
  clear?: number;
  /** a long thing seen end on: it stands this share of its picture's height tall, the rest of the picture is its length running back */
  box?: number;
  /** false: no box depth (the whole picture's height casts, as a frontal board or a tower does) */
  depth?: false;
  /** passed through to the entry: feather, penumbra, contact feather, contact darkness, contact lean, cast darkness, fade */
  f?: number; p?: number; fc?: number; kc?: number; cl?: number; ks?: number; fade?: number;
  /** why (copied to the entry's note) */
  n?: string;
}
/** the picture: its alpha (RGBA rows, the trimmed atlas cell), its size in texels, and where a texel lands: display px about the anchor of
 *  texel (0, 0)'s centre and the display px per texel */
export interface DraftPicture { rgba: ArrayLike<number>; w: number; h: number; x0: number; y0: number; rx: number; ry: number }

/** the alpha (0..255) a pixel needs to cast (a thin pole's soft edges included) */
export const DRAFT_SOLID = 72;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const r1 = (v: number) => Math.round(v);

/** the draft of one picture (null: it has no opaque pixels) */
export function draftShadow(pic: DraftPicture, kind: DraftKind, shear: { sx: number; sy: number }, hint: DraftHint = {}): VectorShadow | null {
  const { w, h, rgba, x0, y0, rx, ry } = pic;
  kind = hint.kind ?? kind;
  if (hint.none) return { n: hint.n ?? 'no shadow' };
  const A = (x: number, y: number) => rgba[(y * w + x) * 4 + 3]!;
  const SOLID = DRAFT_SOLID;
  const X = (tx: number) => x0 + tx * rx, Y = (ty: number) => y0 + ty * ry;
  // 1. each column's lowest and highest opaque pixel (texels), ignoring columns with a lone speck
  const bot = new Float64Array(w).fill(-1), top = new Float64Array(w).fill(-1);
  for (let x = 0; x < w; x++) {
    let n = 0;
    for (let y = h - 1; y >= 0; y--) if (A(x, y) >= SOLID) { if (bot[x]! < 0) bot[x] = y; top[x] = y; n++; }
    if (n < 2) { bot[x] = -1; top[x] = -1; }
  }
  const cols: number[] = []; for (let x = 0; x < w; x++) if (bot[x]! >= 0) cols.push(x);
  if (!cols.length) return null;
  let H = 0; for (const x of cols) H = Math.max(H, bot[x]! - top[x]!);
  const Hd = H * ry, Wd = (cols[cols.length - 1]! - cols[0]! + 1) * rx;
  // the iso tent (in display px per texel: the ground's map axes fall half a px per px across, so ry/rx scales the slope)
  const slope = 0.5 * rx / ry, tent = new Float64Array(w).fill(-Infinity);
  { let run = -Infinity; for (let x = 0; x < w; x++) { run = Math.max(run - slope, bot[x]!); tent[x] = run; } run = -Infinity; for (let x = w - 1; x >= 0; x--) { run = Math.max(run - slope, bot[x]!); tent[x] = Math.max(tent[x]!, run); } }
  const tol = Math.max(1.5, 0.012 * H);
  // (touching is judged on a slightly steeper tent, so a wall drawn a hair off the 2:1 slope still touches all along)
  const steep = tentOf(bot, w, slope * 1.2), touch = new Uint8Array(w); for (const x of cols) if (bot[x]! >= steep[x]! - tol) touch[x] = 1;
  // 2. the ground line g (texel rows) under every column
  const g = new Float64Array(w);
  const lowest = Math.max(...cols.map(x => bot[x]!));
  let mode = hint.ground ?? (kind === 'tree' || kind === 'plant' || kind === 'pole' || kind === 'walker' ? 'flat' : 'iso');
  if (Array.isArray(mode)) {
    const pts: [number, number][] = []; for (let i = 0; i + 1 < mode.length; i += 2) pts.push([(mode[i]! - x0) / rx, (mode[i + 1]! - y0) / ry]);
    pts.sort((a, b) => a[0] - b[0]);
    for (let x = 0; x < w; x++) g[x] = interp(pts, x);
  } else if (mode === 'flat') g.fill(lowest);
  else {
    // the touching feet, median-smoothed, then linear between them and flat past the outer ones
    const tx = cols.filter(x => touch[x]), feet: [number, number][] = tx.map((x, i) => { const win = tx.slice(Math.max(0, i - 2), i + 3).map(c => bot[c]!).sort((a, b) => a - b); return [x, win[win.length >> 1]!]; });
    // (past the outer feet the ground follows the tent: a wall's end, a roof's eaves)
    for (let x = 0; x < w; x++) g[x] = feet.length && (x < feet[0]![0] || x > feet[feet.length - 1]![0]) && Number.isFinite(tent[x]!) ? Math.min(interp(feet, x), tent[x]!) : interp(feet, x);
    mode = 'iso';
  }
  // 2b. a box's depth (iso ground with a V: a building's walls, a car's body). Its footprint is the diamond on the V's three corners (the far
  // corner = left + right - near), so a column stands over ground from the near edge g up to the far edge gb. A pixel more than the box's
  // height above the near edge is its roof, standing further back: its height is held to the box's (hcap) and its foot moves back with it,
  // so the roof's shadow is the walls' height long, not the picture's whole height (the old silhouette shadows' fault at the back)
  const gb = Float64Array.from(g); let hcap = Infinity;
  if (hint.box) {
    // a long thing seen end on (a camper, a tractor from the front): its picture's height is mostly its length running back; it stands this
    // share of its picture's height tall, the rest is depth
    for (const x of cols) gb[x] = top[x]!; hcap = hint.box * H;
  } else
  if (mode === 'iso' && hint.depth !== false) {
    // the diamond from the tent over the picture's whole width (a box's walls, a car's or a wagon's wheels near its corners): the near corner
    // at the tent's lowest point, the side corners at the picture's ends, the far corner opposite the near one
    const xl = cols[0]!, xr = cols[cols.length - 1]!; let xf = xl; for (let x = xl; x <= xr; x++) if (tent[x]! > tent[xf]!) xf = x;
    const yl = tent[xl]!, yr = tent[xr]!, yf = tent[xf]!, xbk = xl + xr - xf, ybk = yl + yr - yf;
    if ((xr - xl) * rx > 0.3 * Wd && yf - Math.max(yl, yr) > 0.15 * slope * (xr - xl)) {
      for (let x = xl; x <= xr; x++) gb[x] = Math.min(g[x]!, x <= xbk ? yl + (ybk - yl) * (x - xl) / Math.max(1e-6, xbk - xl) : ybk + (yr - ybk) * (x - xbk) / Math.max(1e-6, xr - xbk));
      const hs: number[] = []; for (let x = xl; x <= xr; x++) if (top[x]! >= 0 && gb[x]! < g[x]!) hs.push(gb[x]! - top[x]!);
      hs.sort((a, b) => a - b); if (hs.length) hcap = Math.max(hs[Math.floor(hs.length * 0.7)]!, 0.15 * H);
    }
  }
  // a vehicle seen end on (drawn heading up or down the screen): its picture's height is mostly its length; it stands about its width tall
  if (!Number.isFinite(hcap) && kind === 'vehicle' && !hint.box && H * ry > 0.9 * Wd) { for (const x of cols) gb[x] = top[x]!; hcap = 0.9 * Wd / ry; }
  const hk = hint.height ?? 1, minH = (hint.minH ?? 0), below = hint.groundBelow;
  const out: VectorShadow = {};
  // 3. the cast: land every opaque pixel on the ground, fill, trace
  if (hint.cast !== false) {
    const sx = shear.sx, sy = shear.sy;
    // the grid: about 1 texel a cell, coarser for a big picture (at most ~360 cells across)
    const pts: number[] = []; let L = Infinity, R = -Infinity, T = Infinity, B = -Infinity;
    for (const x of cols) for (let y = top[x]!; y <= bot[x]!; y++) {
      if (A(x, y) < SOLID) continue;
      const Yd = Y(y); if (below !== undefined && Yd > below) continue;
      // the pixel's foot (texel rows): its column's near ground, or further back for a box's roof (2b)
      const foot = gb[x]! < g[x]! ? Math.min(g[x]!, Math.max(gb[x]!, y + hcap)) : g[x]!;
      let hh = (foot - y) * ry; if ((g[x]! - y) * ry < minH) continue; hh = Math.max(0, hh) * hk;
      const gx = X(x), gy = Y(foot), px = gx + hh * sx, py = gy + hh * sy;
      pts.push(px, py, hh); L = Math.min(L, px); R = Math.max(R, px); T = Math.min(T, py); B = Math.max(B, py);
    }
    if (pts.length >= 9) {
      const leafy = kind === 'tree' || kind === 'plant', cs = Math.max(rx, ry, (R - L) / 360, (B - T) / 360);
      const blur = leafy ? Math.max(2, Math.round(0.035 * Math.max(R - L, B - T) / cs)) : 0, pad = 2 + blur;
      const GW = Math.ceil((R - L) / cs) + 1 + 2 * pad, GH = Math.ceil((B - T) / cs) + 1 + 2 * pad, ox = L - pad * cs, oy = T - pad * cs;
      const grid = new Uint8Array(GW * GH), hsum = new Float32Array(GW * GH), hn = new Uint16Array(GW * GH);
      for (let i = 0; i < pts.length; i += 3) { const c = Math.floor((pts[i + 1]! - oy) / cs) * GW + Math.floor((pts[i]! - ox) / cs); grid[c] = 1; hsum[c] += pts[i + 2]!; hn[c]++; }
      // close (dilate, fill small holes, erode), so the landed pixels make one shape
      // (a tree's or a plant's twice: its leaves' shadow is one soft shape, not every twig's)
      // (a tree's or a plant's blurred into one soft shape: its leaves' shadow, not every twig's and needle's)
      const closed = leafy ? smooth(dilate(grid, GW, GH), GW, GH, blur)
        : erode(fillSmallHoles(dilate(grid, GW, GH), GW, GH, Math.max(6, (GW * GH) / 2500)), GW, GH);
      const rings = traceRings(closed, GW, GH).map(r => ({ r, a: ringArea(r) }));
      // see-through things (a chain-link mesh, a lattice) cast a lighter shadow: the share of the filled shape the pixels really landed on
      let landed = 0, filled = 0; for (let c = 0; c < grid.length; c++) { landed += grid[c]!; filled += closed[c]!; }
      const cover = filled ? landed / filled : 1;
      if (cover < 0.8 && hint.ks === undefined) out.ks = Math.round(clamp(0.2 + cover, 0.45, 1) * 100) / 100;
      const biggest = Math.max(0, ...rings.map(r => Math.abs(r.a)));
      // (specks far from the rest are a roof's ornament landing apart: dropped; holes only when they are big enough to see)
      const keep = rings.filter(r => (r.a > 0 ? r.a > Math.max(6, biggest * (leafy ? 0.08 : 0.03)) : -r.a > Math.max(24, biggest * 0.03)));
      // the height under each landed cell, for a vertex's foot (the nearest cells' mean)
      const hAt = (vx: number, vy: number) => {
        let s = 0, n = 0; const cx = vx, cy = vy;
        for (let rad = 1; rad <= 6 + blur && !n; rad++) for (let dy = -rad; dy < rad; dy++) for (let dx = -rad; dx < rad; dx++) {
          const gx = Math.floor(cx) + dx, gy = Math.floor(cy) + dy; if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) continue;
          const c = gy * GW + gx; if (hn[c]) { s += hsum[c]! / hn[c]!; n++; }
        }
        return n ? s / n : 0;
      };
      const s: number[][] = [];
      for (const { r, a } of keep) {
        const cap = a > 0 ? 22 : 8;
        let tolDP = Math.max(1.5, 0.007 * Math.max(GW, GH)), simp = simplifyRing(r, tolDP);
        while (simp.length > cap) { tolDP *= 1.3; simp = simplifyRing(r, tolDP); }
        // never a ring that crosses itself (it would fill wrong): simplify less until it does not
        while (selfCrosses(simp) && tolDP > 0.6) { tolDP *= 0.75; simp = simplifyRing(r, tolDP); }
        if (simp.length < 3) continue;
        const fl: number[] = [];
        for (const [vx, vy] of simp) {
          const hh = hAt(vx, vy), px = ox + vx * cs, py = oy + vy * cs;
          fl.push(r1(px - hh * sx), r1(py - hh * sy), r1(hh));
        }
        s.push(fl);
      }
      if (s.length) out.s = s;
    }
  }
  // 4. the contact: runs of touching columns
  if (hint.contact !== false && Array.isArray(hint.contact)) out.c = hint.contact;
  else if (hint.contact !== false) {
    const tx = cols.filter(x => touch[x] && (below === undefined || Y(bot[x]!) <= below + 2));
    const runs: [number, number][] = [];
    for (const x of tx) { const l = runs[runs.length - 1]; if (l && x - l[1] <= Math.max(2, 3 / rx)) l[1] = x; else runs.push([x, x]); }
    // merge runs whose gap stays near the ground (a car's body between its wheels; not a bench's seat)
    const clear = hint.clear ?? (kind === 'vehicle' ? Math.max(14, 0.3 * Hd) : kind === 'building' ? Math.max(10, 0.08 * Hd) : Math.max(3, 0.06 * Hd));
    const merged: [number, number][] = [];
    for (const r of runs) {
      const l = merged[merged.length - 1];
      if (l) { let ok = true; for (let x = l[1] + 1; x < r[0] && ok; x++) if (bot[x]! < 0 || (g[x]! - bot[x]!) * ry > clear) ok = false; if (ok) { l[1] = r[1]; continue; } }
      merged.push([r[0], r[1]]);
    }
    const c: number[][] = [], gY = (x: number) => Y(g[clamp(Math.round(x), 0, w - 1)]!);
    if (kind === 'tree') {
      // a tree: one soft pool at its trunk's foot (the canopy keeps the sky off the ground round it), a little wider than the trunk
      const run = merged.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a)), xc = (run[0] + run[1]) / 2;
      const rr = clamp(0.2 * Wd, Math.max(6, (run[1] - run[0] + 1) * rx), 70);
      c.push(ellipse(X(xc), gY(xc), rr, rr * 0.5, 14));
      out.kc = hint.kc ?? 0.38; out.fc = hint.fc ?? Math.round(clamp(0.45 * rr, 3, 24));
      // (its canopy lets some light through)
      if (hint.ks === undefined) out.ks = Math.min(out.ks ?? 1, 0.85);
    } else if (kind === 'plant' && merged.length) {
      // a plant: one pool under its base (its leaves touch the ground here and there: no spot under each)
      const a = merged[0]![0], b = merged[merged.length - 1]![1], xc = (a + b) / 2, rr = Math.max(4, 0.45 * (b - a + 1) * rx);
      c.push(ellipse(X(xc), gY(xc), rr, rr * 0.5, 14));
      out.kc = hint.kc ?? 0.55; out.fc = hint.fc ?? Math.round(clamp(0.3 * rr, 2, 12));
    } else {
      for (const [a, b] of merged) {
        const W = (b - a + 1) * rx, xc = (a + b) / 2;
        if (W < Math.max(9, 0.1 * Wd) || kind === 'pole' && W < 0.3 * Wd) {
          const rr = Math.max(W * 0.75 + 2, 3.5); c.push(ellipse(X(xc), gY(xc), rr, rr * 0.5, 8));
        } else {
          // a band along the ground line: a little under the thing (hidden by it, so the rim reads as one shape) and a little out in front
          const up = clamp(0.25 * Hd, 3, 14), dn = clamp(0.07 * W, 3, kind === 'vehicle' ? 10 : 9), e = dn;
          const xs: number[] = []; const step = Math.max(1, Math.round((b - a) / 8));
          for (let x = a; x < b; x += step) xs.push(x); xs.push(b);
          const line = simplifyOpen(xs.map(x => [X(x), gY(x)] as [number, number]), 2);
          const ring: number[] = [];
          ring.push(r1(line[0]![0] - e), r1(line[0]![1]));
          for (const [px, py] of line) ring.push(r1(px), r1(py - up));
          ring.push(r1(line[line.length - 1]![0] + e), r1(line[line.length - 1]![1]));
          for (let i = line.length - 1; i >= 0; i--) ring.push(r1(line[i]![0]), r1(line[i]![1] + dn));
          c.push(ring);
        }
      }
    }
    if (c.length) out.c = c;
  }
  // the soft rims, from the size
  const size = Math.max(Wd, Hd);
  out.f = hint.f ?? Math.round(clamp(0.012 * size, 2, 6) * 2) / 2;
  // a tree's shadow softens more with height (its canopy is high and lets light through at its edges)
  if (kind === 'tree' && hint.p === undefined) out.p = 0.08;
  for (const k of ['p', 'fc', 'kc', 'cl', 'ks', 'fade'] as const) if (hint[k] !== undefined) out[k] = hint[k];
  if (hint.n) out.n = hint.n;
  return out;
}

function tentOf(bot: Float64Array, w: number, slope: number) {
  const t = new Float64Array(w).fill(-Infinity); let run = -Infinity;
  for (let x = 0; x < w; x++) { run = Math.max(run - slope, bot[x]!); t[x] = run; }
  run = -Infinity; for (let x = w - 1; x >= 0; x--) { run = Math.max(run - slope, bot[x]!); t[x] = Math.max(t[x]!, run); }
  return t;
}
function interp(pts: [number, number][], x: number) {
  if (!pts.length) return 0;
  if (x <= pts[0]![0]) return pts[0]![1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i]![0]) { const [ax, ay] = pts[i - 1]!, [bx, by] = pts[i]!; return bx === ax ? by : ay + (by - ay) * (x - ax) / (bx - ax); }
  return pts[pts.length - 1]![1];
}
/** an ellipse ring (display px), wound positive */
function ellipse(cx: number, cy: number, ex: number, ey: number, n: number): number[] {
  const out: number[] = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push(r1(cx + Math.cos(a) * ex), r1(cy + Math.sin(a) * ey)); } return out;
}
/** a box blur of radius r (separable, twice: near a Gaussian) then the half threshold: a smooth outline */
function smooth(g: Uint8Array, W: number, H: number, r: number) {
  let a = Float32Array.from(g);
  const pass = (src: Float32Array, horiz: boolean) => {
    const o = new Float32Array(W * H), n = 2 * r + 1;
    if (horiz) for (let y = 0; y < H; y++) { let s = 0; for (let x = -r; x <= r; x++) s += x >= 0 && x < W ? src[y * W + x]! : 0; for (let x = 0; x < W; x++) { o[y * W + x] = s / n; const xa = x - r, xb = x + r + 1; if (xa >= 0) s -= src[y * W + xa]!; if (xb < W) s += src[y * W + xb]!; } }
    else for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += y >= 0 && y < H ? src[y * W + x]! : 0; for (let y = 0; y < H; y++) { o[y * W + x] = s / n; const ya = y - r, yb = y + r + 1; if (ya >= 0) s -= src[ya * W + x]!; if (yb < H) s += src[yb * W + x]!; } }
    return o;
  };
  for (let k = 0; k < 2; k++) a = pass(pass(a, true), false);
  const o = new Uint8Array(W * H); for (let i = 0; i < o.length; i++) o[i] = a[i]! >= 0.42 ? 1 : 0;
  // (the grid's border stays empty, so every ring closes inside it)
  for (let x = 0; x < W; x++) { o[x] = 0; o[(H - 1) * W + x] = 0; } for (let y = 0; y < H; y++) { o[y * W] = 0; o[y * W + W - 1] = 0; }
  return o;
}
function selfCrosses(r: [number, number][]) {
  const n = r.length, cr = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    const a = r[i]!, b = r[(i + 1) % n]!, c = r[j]!, d = r[(j + 1) % n]!;
    const d1 = cr(c, d, a), d2 = cr(c, d, b), d3 = cr(a, b, c), d4 = cr(a, b, d);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  }
  return false;
}
function dilate(g: Uint8Array, W: number, H: number) {
  const o = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (!g[y * W + x]) continue; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H) o[Y * W + X] = 1; } }
  return o;
}
function erode(g: Uint8Array, W: number, H: number) {
  const o = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { let all = 1; for (let dy = -1; dy <= 1 && all; dy++) for (let dx = -1; dx <= 1; dx++) if (!g[(y + dy) * W + x + dx]) { all = 0; break; } o[y * W + x] = all; }
  return o;
}
/** fill the empty regions not reaching the grid's edge that are smaller than `minArea` cells */
function fillSmallHoles(g: Uint8Array, W: number, H: number, minArea: number) {
  const seen = new Uint8Array(W * H), o = g.slice(), stack: number[] = [];
  for (let s = 0; s < W * H; s++) {
    if (g[s] || seen[s]) continue;
    const comp: number[] = []; let edge = false; stack.push(s); seen[s] = 1;
    while (stack.length) {
      const c = stack.pop()!, x = c % W, y = (c - x) / W; comp.push(c); if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
      for (const n of [c - 1, c + 1, c - W, c + W]) { if (n < 0 || n >= W * H || seen[n] || g[n]) continue; if ((n === c - 1 && x === 0) || (n === c + 1 && x === W - 1)) continue; seen[n] = 1; stack.push(n); }
    }
    if (!edge && comp.length < minArea) for (const c of comp) o[c] = 1;
  }
  return o;
}
/** the boundary rings of a filled grid (cell corners), the filled side on the right as drawn (x right, y down): outer rings have a positive
 *  shoelace area, holes a negative one */
export function traceRings(g: Uint8Array, W: number, H: number): [number, number][][] {
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && g[y * W + x] === 1;
  // directed edges keyed by their start corner
  const next = new Map<number, number[]>(), key = (x: number, y: number) => y * (W + 2) + x, edges: [number, number, number, number][] = [];
  const add = (ax: number, ay: number, bx: number, by: number) => { const k = key(ax, ay); let l = next.get(k); if (!l) next.set(k, l = []); l.push(edges.length); edges.push([ax, ay, bx, by]); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!at(x, y)) continue;
    if (!at(x, y - 1)) add(x, y, x + 1, y);
    if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if (!at(x - 1, y)) add(x, y + 1, x, y);
  }
  const used = new Uint8Array(edges.length), rings: [number, number][][] = [];
  for (let e0 = 0; e0 < edges.length; e0++) {
    if (used[e0]) continue;
    const ring: [number, number][] = []; let e = e0;
    while (!used[e]) {
      used[e] = 1; const [ax, ay, bx, by] = edges[e]!; ring.push([ax, ay]);
      const cand = (next.get(key(bx, by)) ?? []).filter(i => !used[i]); if (!cand.length) break;
      // at a corner two cells meet diagonally: turn right (toward the filled side) first, so the rings never cross
      const dx = bx - ax, dy = by - ay; let pick = cand[0]!;
      if (cand.length > 1) { const right = cand.find(i => { const [cx, cy, ex, ey] = edges[i]!; return ex - cx === -dy && ey - cy === dx; }); if (right !== undefined) pick = right; }
      e = pick;
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}
export function ringArea(r: [number, number][]) { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i]!, q = r[(i + 1) % r.length]!; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
function segDist(p: [number, number], a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy; if (!l) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l, 0, 1); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function simplifyOpen(p: [number, number][], tol: number): [number, number][] {
  if (p.length < 3) return p.slice();
  let best = 0, at = 0; for (let i = 1; i < p.length - 1; i++) { const d = segDist(p[i]!, p[0]!, p[p.length - 1]!); if (d > best) { best = d; at = i; } }
  if (best <= tol) return [p[0]!, p[p.length - 1]!];
  const a = simplifyOpen(p.slice(0, at + 1), tol), b = simplifyOpen(p.slice(at), tol); return [...a.slice(0, -1), ...b];
}
/** Douglas-Peucker on a closed ring (split at its two farthest points) */
export function simplifyRing(r: [number, number][], tol: number): [number, number][] {
  if (r.length <= 4) return r.slice();
  let i0 = 0, i1 = 0, best = -1; const c = r.length;
  const step = Math.max(1, Math.floor(c / 64));
  for (let i = 0; i < c; i += step) for (let j = i + 1; j < c; j += step) { const d = (r[i]![0] - r[j]![0]) ** 2 + (r[i]![1] - r[j]![1]) ** 2; if (d > best) { best = d; i0 = i; i1 = j; } }
  const a = simplifyOpen(r.slice(i0, i1 + 1), tol), b = simplifyOpen([...r.slice(i1), ...r.slice(0, i0 + 1)], tol);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}
