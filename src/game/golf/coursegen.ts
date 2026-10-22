// The old nine-hole course (docs/GOLF-PLAN.md section 3): the holes run one after another, clockwise, along the perimeter of an inset rectangle (with a top-edge interior bay when needed on tighter sites), with their painted areas, tee markers, pins and dogleg aim points. Pure TS, no DOM.
import { mulberry } from '../iso';
import { TILE_M, type AimPoint, type CourseArea, type CourseLayout, type GolfSurface, type Pin, type TeeMark } from './types';

/** the nine pars in order: two par 3s, five par 4s, two par 5s (par 36) */
export const OLD_NINE_PARS = [4, 3, 5, 4, 4, 3, 4, 5, 4];
/** metre length ranges by par, drawn uniformly from the seeded stream */
const LEN_M: Record<number, [number, number]> = { 3: [120, 190], 4: [280, 380], 5: [440, 480] };
/** minimum metre length by par so derived pars (GOLF-PLAN 4.2: par 3 <= 230 m, par 4 <= 430 m, par 5 > 430 m) hold after tile rounding */
const FLOOR_M: Record<number, number> = { 3: 120, 4: 240, 5: 440 };
/** tiles from each green to the next tee */
const WALK = 16;
/** the inset rectangle keeps this many tiles from the site's edges */
const MARGIN = 15;
/** each retry scales every hole length by this factor when a tiny test site cannot hold regulation floors */
const SHRINK = 0.95;

/** the flattened outline of a ring: an n-gon around (cx, cy) with semi-axis a along the unit u and b along the unit v, rounded to tiles */
function ring(cx: number, cy: number, ux: number, uy: number, a: number, vx: number, vy: number, b: number, n: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const t = (2 * Math.PI * k) / n, c = Math.cos(t) * a, s = Math.sin(t) * b;
    out.push(Math.round(cx + c * ux + s * vx), Math.round(cy + c * uy + s * vy));
  }
  return out;
}

/** k distinct values from the pool, chosen by the seeded stream (a partial shuffle), in pool order */
function pick(rng: () => number, pool: number[], k: number): number[] {
  const a = pool.slice();
  for (let i = 0; i < k; i++) { const j = i + Math.floor(rng() * (a.length - i)); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a.slice(0, k).sort((x, y) => x - y);
}

/** the inset rectangle's size (and optional top-edge interior bay depth fd) for a path perimeter (tiles), or null when it does not keep MARGIN */
function frame(site: { x0: number; y0: number; x1: number; y1: number }, perim: number): { w: number; h: number; fd: number } | null {
  const maxW = site.x1 - site.x0 - 2 * MARGIN, maxH = site.y1 - site.y0 - 2 * MARGIN;
  if (maxW <= 0 || maxH <= 0) return null;
  const rectMax = 2 * (maxW + maxH);
  if (perim <= rectMax + 1e-6) {
    const W = site.x1 - site.x0, H = site.y1 - site.y0;
    let h = perim / (2 * (W / H + 1)), w = (W / H) * h;
    if (w > maxW) { w = maxW; h = Math.min(maxH, perim / 2 - w); }
    else if (h > maxH) { h = maxH; w = Math.min(maxW, perim / 2 - h); }
    return { w, h, fd: 0 };
  }
  const maxFd = maxW >= 150 ? Math.max(0, maxH - 60) : 0;
  const fd = (perim - rectMax) / 2;
  return fd <= maxFd + 1e-6 ? { w: maxW, h: maxH, fd: Math.min(maxFd, fd) } : null;
}

/**
 * Generate the old nine for a site (tiles) and a seed. Hole i+1 runs from its tee to its pin along the clockwise loop;
 * Hole 1 starts WALK/2 past the clubhouse door and Hole 9 ends WALK/2 before it. Regulation par floors (GOLF-PLAN 4.2) are preserved.
 */
export function generateOldNine(site: { x0: number; y0: number; x1: number; y1: number }, seed: number): CourseLayout {
  const rng = mulberry(seed);
  const R = Math.round;
  // the seeded lengths and regulation floors, in tiles
  const raw = OLD_NINE_PARS.map(par => { const [lo, hi] = LEN_M[par]!; return (lo + rng() * (hi - lo)) / TILE_M; });
  const floors = OLD_NINE_PARS.map(par => FLOOR_M[par]! / TILE_M);
  const sumRaw = raw.reduce((a, b) => a + b, 0), sumFloor = floors.reduce((a, b) => a + b, 0);
  const maxW = site.x1 - site.x0 - 2 * MARGIN, maxH = site.y1 - site.y0 - 2 * MARGIN;
  const rectMax = 2 * (maxW + maxH);
  const fullMax = rectMax + (maxW >= 150 ? 2 * Math.max(0, maxH - 60) : 0);
  let L: number[];
  if (maxW > 0 && maxH > 0 && sumRaw + 9 * WALK <= rectMax) {
    L = raw.slice();
  } else if (maxW > 0 && maxH > 0 && sumFloor + 9 * WALK <= rectMax) {
    const target = rectMax - 9 * WALK, t = (target - sumFloor) / (sumRaw - sumFloor || 1);
    L = raw.map((r, i) => floors[i]! + t * (r - floors[i]!));
  } else if (maxW > 0 && maxH > 0 && sumRaw + 9 * WALK <= fullMax) {
    L = raw.slice();
  } else if (maxW > 0 && maxH > 0 && sumFloor + 9 * WALK <= fullMax) {
    const target = fullMax - 9 * WALK, t = (target - sumFloor) / (sumRaw - sumFloor || 1);
    L = raw.map((r, i) => floors[i]! + t * (r - floors[i]!));
  } else {
    let scale = 1, fr = frame(site, sumRaw + 9 * WALK);
    if (!fr) {
      let hi = 1;
      for (let k = 1; ; k++) {
        if (k > 200) throw new Error('generateOldNine: the site is too small for nine holes');
        scale = Math.pow(SHRINK, k);
        fr = frame(site, sumRaw * scale + 9 * WALK);
        if (fr) break;
        hi = scale;
      }
      let lo = scale;
      while (hi - lo > 0.001) {
        const mid = (lo + hi) / 2, f = frame(site, sumRaw * mid + 9 * WALK);
        if (f) { lo = mid; fr = f; } else hi = mid;
      }
      scale = lo;
    }
    L = raw.map(r => r * scale);
  }
  const perim = L.reduce((a, b) => a + b, 0) + 9 * WALK;
  const fr = frame(site, perim);
  if (!fr) throw new Error('generateOldNine: the site is too small for nine holes');
  const { w, h, fd } = fr;
  const cx = (site.x0 + site.x1) / 2, cy = (site.y0 + site.y1) / 2;
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  const fw = R(w / 6);
  // the path, clockwise from the clubhouse door (bottom middle): each leg's start point and unit direction
  const corners: [number, number][] = fd > 0
    ? [[cx, y1], [x0, y1], [x0, y0], [cx - fw, y0], [cx - fw, y0 + fd], [cx + fw, y0 + fd], [cx + fw, y0], [x1, y0], [x1, y1], [cx, y1]]
    : [[cx, y1], [x0, y1], [x0, y0], [x1, y0], [x1, y1], [cx, y1]];
  const seg: { x: number; y: number; dx: number; dy: number }[] = [], cum: number[] = [0];
  for (let k = 0; k < corners.length - 1; k++) {
    const [ax, ay] = corners[k]!, [bx, by] = corners[k + 1]!, len = Math.hypot(bx - ax, by - ay);
    seg.push({ x: ax, y: ay, dx: (bx - ax) / len, dy: (by - ay) / len });
    cum.push(cum[k]! + len);
  }
  const nSeg = seg.length;
  /** the point and forward direction at u tiles along the path (0 <= u < perimeter) */
  const at = (u: number) => {
    let k = 0;
    while (k < nSeg - 1 && u >= cum[k + 1]!) k++;
    const g = seg[k]!, t = u - cum[k]!;
    return { x: g.x + g.dx * t, y: g.y + g.dy * t, dx: g.dx, dy: g.dy };
  };
  // the holes: tee and pin positions along the path, starting WALK/2 past the clubhouse door
  const tee: number[] = [], pin: number[] = [];
  let s = WALK / 2;
  for (let i = 0; i < 9; i++) { tee.push(s); pin.push(s + L[i]!); s = pin[i]! + WALK; }
  // the dogleg aim points: each path corner between a hole's tee and pin
  const aims: AimPoint[] = [];
  for (let i = 0; i < 9; i++) {
    let order = 0;
    for (let k = 1; k < nSeg; k++) if (cum[k]! > tee[i]! && cum[k]! < pin[i]!) aims.push({ hole: i + 1, x: R(seg[k]!.x), y: R(seg[k]!.y), order: order++ });
  }
  /** a band of half width `half` along the path from a0 to b0 (tiles), as one non-self-intersecting polygon with square corners */
  const band = (a0: number, b0: number, half: number): number[] => {
    let a = a0, b = b0;
    for (let k = 1; k < nSeg; k++) {
      if (cum[k]! > a && cum[k]! - a < half + 2) a = cum[k]!;
      if (cum[k]! < b && b - cum[k]! < half + 2) b = cum[k]! + half + 2;
    }
    if (b <= a + 4) { a = a0; b = b0; }
    const brk = [a];
    for (let k = 1; k < nSeg; k++) if (cum[k]! > a + half + 1 && cum[k]! < b - half - 1) brk.push(cum[k]!);
    brk.push(b);
    const n = brk.length - 1, dx: number[] = [], dy: number[] = [];
    for (let j = 0; j < n; j++) { const m = at((brk[j]! + brk[j + 1]!) / 2); dx.push(m.dx); dy.push(m.dy); }
    const left: number[] = [], right: number[] = [];
    for (let j = 0; j <= n; j++) {
      const p = at(brk[j]!);
      let nx = 0, ny = 0;
      if (j > 0) { nx -= dy[j - 1]!; ny += dx[j - 1]!; }
      if (j < n) { nx -= dy[j]!; ny += dx[j]!; }
      left.push(p.x + half * nx, p.y + half * ny);
      right.push(p.x - half * nx, p.y - half * ny);
    }
    const out: number[] = [];
    for (let j = 0; j <= n; j++) out.push(R(left[2 * j]!), R(left[2 * j + 1]!));
    for (let j = n; j >= 0; j--) out.push(R(right[2 * j]!), R(right[2 * j + 1]!));
    return out;
  };
  // the areas, in paint order (later paints over earlier)
  const areas: CourseArea[] = [];
  const add = (surface: GolfSurface, pts: number[]) => { areas.push({ id: areas.length + 1, surface, pts }); };
  add('rough', [site.x0, site.y0, site.x1, site.y0, site.x1, site.y1, site.x0, site.y1]);
  for (let i = 0; i < 9; i++) {
    const a = tee[i]! + 22, b = pin[i]! - 7;
    if (OLD_NINE_PARS[i]! >= 4 && b > a) add('fairway', band(a, b, 7.5));
  }
  for (let i = 0; i < 9; i++) {
    const g = at(pin[i]!), px = R(g.x), py = R(g.y);
    add('fringe', ring(px, py, 1, 0, 8.5, 0, 1, 8.5, 12));
    add('green', ring(px, py, 1, 0, 7, 0, 1, 7, 12));
  }
  // the tee rectangles: 14 x 6 tiles, centred 5 tiles past the back tee point (spanning -2..+12), covering back (0), middle (+4) and forward (+8)
  const teePt = tee.map(u => at(u));
  for (let i = 0; i < 9; i++) {
    const t = teePt[i]!, tx = R(t.x), ty = R(t.y), ccx = tx + 5 * t.dx, ccy = ty + 5 * t.dy, px = -t.dy, py = t.dx;
    const box: [number, number][] = [[7, 3], [7, -3], [-7, -3], [-7, 3]];
    add('tee', box.flatMap(([a, b]) => [R(ccx + a * t.dx + b * px), R(ccy + a * t.dy + b * py)]));
  }
  // the bunkers (6 in all): 4 greenside bunkers (9 tiles sideways of the pin) and 2 fairway bunkers (at 60% of a par 4 or 5, 8 tiles sideways), chosen by the stream
  const bunker = (x: number, y: number, dx: number, dy: number) => ring(x, y, -dy, dx, 2, dx, dy, 1.5, 10);
  const green = pick(rng, [0, 1, 2, 3, 4, 5, 6, 7, 8], 4);
  const fair = pick(rng, OLD_NINE_PARS.flatMap((p, i) => (p >= 4 ? [i] : [])), 2);
  for (let i = 0; i < 9; i++) {
    if (green.includes(i)) {
      const g = at(pin[i]!), side = rng() < 0.5 ? -1 : 1;
      add('bunker', bunker(g.x + side * 9 * -g.dy, g.y + side * 9 * g.dx, g.dx, g.dy));
    }
    if (fair.includes(i)) {
      const m = at(tee[i]! + 0.6 * L[i]!), side2 = rng() < 0.5 ? -1 : 1;
      add('bunker', bunker(m.x + side2 * 8 * -m.dy, m.y + side2 * 8 * m.dx, m.dx, m.dy));
    }
  }
  // the pond: a 16-gon of radius 12, 28 tiles in from hole 2's green toward the middle, kept 25 tiles inside the rectangle
  const g2 = at(pin[1]!), vx = cx - g2.x, vy = cy - g2.y, vl = Math.hypot(vx, vy) || 1;
  const pondX = Math.min(Math.max(g2.x + (vx / vl) * 28, x0 + 25), x1 - 25), pondY = Math.min(Math.max(g2.y + (vy / vl) * 28, y0 + 25), y1 - 25);
  add('water', ring(R(pondX), R(pondY), 1, 0, 12, 0, 1, 12, 16));
  // the markers and pins (back at +0, middle at +4, forward at +8 along the tee box axis)
  const tees: TeeMark[] = [], pins: Pin[] = [];
  for (let i = 0; i < 9; i++) {
    const t = teePt[i]!, tx = R(t.x), ty = R(t.y);
    tees.push({ hole: i + 1, x: tx, y: ty, kind: 'back' });
    tees.push({ hole: i + 1, x: R(tx + 4 * t.dx), y: R(ty + 4 * t.dy), kind: 'middle' });
    tees.push({ hole: i + 1, x: R(tx + 8 * t.dx), y: R(ty + 8 * t.dy), kind: 'forward' });
    const g = at(pin[i]!);
    pins.push({ hole: i + 1, x: R(g.x), y: R(g.y) });
  }
  return { areas, tees, pins, aims, clubhouse: { x: R(cx), y: R(y1) } };
}
