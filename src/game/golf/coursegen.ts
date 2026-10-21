// The old nine-hole course (docs/GOLF-PLAN.md section 3): the holes run one after another, clockwise, along the perimeter of an inset rectangle, with their painted areas, tee markers, pins and dogleg aim points. Pure TS, no DOM.
import { mulberry } from '../iso';
import { TILE_M, type AimPoint, type CourseArea, type CourseLayout, type GolfSurface, type Pin, type TeeMark } from './types';

/** the nine pars in order: two par 3s, five par 4s, two par 5s (par 36) */
export const OLD_NINE_PARS = [4, 3, 5, 4, 4, 3, 4, 5, 4];
/** metre length ranges by par, drawn uniformly from the seeded stream */
const LEN_M: Record<number, [number, number]> = { 3: [120, 190], 4: [280, 380], 5: [430, 480] };
/** tiles from each green to the next tee */
const WALK = 20;
/** the inset rectangle keeps this many tiles from the site's edges */
const MARGIN = 15;
/** each retry scales every hole length by this factor */
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
  for (let i = 0; i < k; i++) { const j = i + Math.floor(rng() * (a.length - i)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, k).sort((x, y) => x - y);
}

/** the inset rectangle's size for a perimeter (tiles) in the site's aspect ratio, or null when it would not keep MARGIN from the edges */
function frame(site: { x0: number; y0: number; x1: number; y1: number }, perim: number): { w: number; h: number } | null {
  const W = site.x1 - site.x0, H = site.y1 - site.y0, h = perim / (2 * (W / H + 1)), w = (W / H) * h;
  return w <= W - 2 * MARGIN && h <= H - 2 * MARGIN ? { w, h } : null;
}

/**
 * Generate the old nine for a site (tiles) and a seed. Hole i+1 runs from its tee to its pin along the rectangle's
 * perimeter; the next tee is WALK tiles past the pin. Lengths shrink 5% per retry, then to an exact fit, until the rectangle fits the site.
 */
export function generateOldNine(site: { x0: number; y0: number; x1: number; y1: number }, seed: number): CourseLayout {
  const rng = mulberry(seed);
  const R = Math.round;
  // the seeded lengths, in tiles
  const raw = OLD_NINE_PARS.map(par => { const [lo, hi] = LEN_M[par]; return (lo + rng() * (hi - lo)) / TILE_M; });
  const sumRaw = raw.reduce((a, b) => a + b, 0);
  // shrink the holes until the rectangle (perimeter = lengths + the nine walks) fits the site: 5% steps first, then an exact fit
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
    // the largest scale that still fits, to 0.001 (the perimeter then fills the margin)
    let lo = scale;
    while (hi - lo > 0.001) {
      const mid = (lo + hi) / 2, f = frame(site, sumRaw * mid + 9 * WALK);
      if (f) { lo = mid; fr = f; } else hi = mid;
    }
    scale = lo;
  }
  const { w, h } = fr;
  const cx = (site.x0 + site.x1) / 2, cy = (site.y0 + site.y1) / 2;
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, hw = w / 2;
  // the path, clockwise from the clubhouse door (bottom middle): each leg's start point and unit direction
  const seg = [
    { x: cx, y: y1, dx: -1, dy: 0 }, { x: x0, y: y1, dx: 0, dy: -1 }, { x: x0, y: y0, dx: 1, dy: 0 },
    { x: x1, y: y0, dx: 0, dy: 1 }, { x: x1, y: y1, dx: -1, dy: 0 },
  ];
  const cum = [0, hw, hw + h, hw + h + w, hw + 2 * h + w, hw + 2 * h + w + hw];
  /** the point and forward direction at u tiles along the path (0 <= u < perimeter) */
  const at = (u: number) => {
    let k = 0;
    while (k < 4 && u >= cum[k + 1]) k++;
    const g = seg[k], t = u - cum[k];
    return { x: g.x + g.dx * t, y: g.y + g.dy * t, dx: g.dx, dy: g.dy };
  };
  // the holes: tee and pin positions along the path
  const L = raw.map(l => l * scale);
  const tee: number[] = [], pin: number[] = [];
  let s = 0;
  for (let i = 0; i < 9; i++) { tee.push(s); pin.push(s + L[i]); s = pin[i] + WALK; }
  // the dogleg aim points: each rectangle corner between a hole's tee and pin
  const aims: AimPoint[] = [];
  for (let i = 0; i < 9; i++) {
    let order = 0;
    for (let k = 1; k <= 4; k++) if (cum[k] > tee[i] && cum[k] < pin[i]) aims.push({ hole: i + 1, x: R(seg[k].x), y: R(seg[k].y), order: order++ });
  }
  /** a band of half width `half` along the path from a to b (tiles), as one polygon with square corners */
  const band = (a: number, b: number, half: number): number[] => {
    const brk = [a];
    for (let k = 1; k <= 4; k++) if (cum[k] > a && cum[k] < b) brk.push(cum[k]);
    brk.push(b);
    const n = brk.length - 1, dx: number[] = [], dy: number[] = [];
    for (let j = 0; j < n; j++) { const m = at((brk[j] + brk[j + 1]) / 2); dx.push(m.dx); dy.push(m.dy); }
    const left: number[] = [], right: number[] = [];
    for (let j = 0; j <= n; j++) {
      const p = at(brk[j]);
      let nx = 0, ny = 0;
      if (j > 0) { nx -= dy[j - 1]; ny += dx[j - 1]; }
      if (j < n) { nx -= dy[j]; ny += dx[j]; }
      left.push(p.x + half * nx, p.y + half * ny);
      right.push(p.x - half * nx, p.y - half * ny);
    }
    const out: number[] = [];
    for (let j = 0; j <= n; j++) out.push(R(left[2 * j]), R(left[2 * j + 1]));
    for (let j = n; j >= 0; j--) out.push(R(right[2 * j]), R(right[2 * j + 1]));
    return out;
  };
  // the areas, in paint order (later paints over earlier)
  const areas: CourseArea[] = [];
  const add = (surface: GolfSurface, pts: number[]) => { areas.push({ id: areas.length + 1, surface, pts }); };
  add('rough', [site.x0, site.y0, site.x1, site.y0, site.x1, site.y1, site.x0, site.y1]);
  for (let i = 0; i < 9; i++) {
    const a = tee[i] + 30, b = pin[i] - 10;
    if (OLD_NINE_PARS[i] >= 4 && b > a) add('fairway', band(a, b, 7.5));
  }
  for (let i = 0; i < 9; i++) {
    const g = at(pin[i]), px = R(g.x), py = R(g.y);
    add('fringe', ring(px, py, 1, 0, 8.5, 0, 1, 8.5, 12));
    add('green', ring(px, py, 1, 0, 7, 0, 1, 7, 12));
  }
  // the tee rectangles: 10 x 6 tiles, centred 3 tiles past the tee point, long side along the hole
  const teePt = tee.map(u => at(u));
  for (let i = 0; i < 9; i++) {
    const t = teePt[i], tx = R(t.x), ty = R(t.y), ccx = tx + 3 * t.dx, ccy = ty + 3 * t.dy, px = -t.dy, py = t.dx;
    const corners = [[5, 3], [5, -3], [-5, -3], [-5, 3]];
    add('tee', corners.flatMap(([a, b]) => [R(ccx + a * t.dx + b * px), R(ccy + a * t.dy + b * py)]));
  }
  // the bunkers (4 to 6 in all): 4 greenside bunkers (9 tiles sideways of the pin) and 2 fairway bunkers (at 60% of a par 4 or 5, 8 tiles sideways), chosen by the stream
  const bunker = (x: number, y: number, dx: number, dy: number) => ring(x, y, -dy, dx, 2, dx, dy, 1.5, 10);
  const green = pick(rng, [0, 1, 2, 3, 4, 5, 6, 7, 8], 4);
  const fair = pick(rng, OLD_NINE_PARS.flatMap((p, i) => (p >= 4 ? [i] : [])), 2);
  for (let i = 0; i < 9; i++) {
    if (green.includes(i)) {
      const g = at(pin[i]), side = rng() < 0.5 ? -1 : 1;
      add('bunker', bunker(g.x + side * 9 * -g.dy, g.y + side * 9 * g.dx, g.dx, g.dy));
    }
    if (fair.includes(i)) {
      const m = at(tee[i] + 0.6 * L[i]), side2 = rng() < 0.5 ? -1 : 1;
      add('bunker', bunker(m.x + side2 * 8 * -m.dy, m.y + side2 * 8 * m.dx, m.dx, m.dy));
    }
  }
  // the pond: a 16-gon of radius 12, 28 tiles in from hole 2's green toward the middle, kept 25 tiles inside the rectangle
  const g2 = at(pin[1]), vx = cx - g2.x, vy = cy - g2.y, vl = Math.hypot(vx, vy) || 1;
  const pondX = Math.min(Math.max(g2.x + (vx / vl) * 28, x0 + 25), x1 - 25), pondY = Math.min(Math.max(g2.y + (vy / vl) * 28, y0 + 25), y1 - 25);
  add('water', ring(R(pondX), R(pondY), 1, 0, 12, 0, 1, 12, 16));
  // the markers and pins
  const tees: TeeMark[] = [], pins: Pin[] = [];
  for (let i = 0; i < 9; i++) {
    const back = at(tee[i]), mid = at(tee[i] + 8), fwd = at(tee[i] + 16);
    tees.push({ hole: i + 1, x: R(back.x), y: R(back.y), kind: 'back' });
    tees.push({ hole: i + 1, x: R(mid.x), y: R(mid.y), kind: 'middle' });
    tees.push({ hole: i + 1, x: R(fwd.x), y: R(fwd.y), kind: 'forward' });
    const g = at(pin[i]);
    pins.push({ hole: i + 1, x: R(g.x), y: R(g.y) });
  }
  return { areas, tees, pins, aims, clubhouse: { x: R(cx), y: R(y1) } };
}
