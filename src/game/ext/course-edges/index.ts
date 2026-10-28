// Course edges: sun-lit rims, bevel shading, drop shadows, edge binning, and mowing stripes (plan P21, section 3.4).
// Pure TypeScript, no DOM, deterministic.
// Units: styles, widths and offsets are specified in metres; polylines, coordinates and output geometries are in tiles of 2 m.
import { SUN_TILE_DIR } from '../course-height';
import { sunFacing, type EdgeProfile } from '../../paint-edges';
import { SURF } from '../course-grid';

export { SUN_TILE_DIR, SURF };
export type { EdgeProfile };

/** 2D point in tile coordinates */
export interface Pt {
  x: number;
  y: number;
}

/** polyline representation: flat coordinate array [x0, y0, x1, y1, ...] or array of Pt */
export type EdgePolyline = readonly Pt[] | readonly number[];

/** one run of binned edges carrying its polyline points and mean sun factor L */
export interface EdgeRun {
  /** polyline points as flat coordinates [x0, y0, x1, y1, ...] (tiles) */
  pts: number[];
  /** mean sun factor L (-1..1) along this run */
  L: number;
  /** the normal direction bin index (0..bins-1) */
  bin: number;
}

/** the sun factor L = n · SUN_TILE_DIR (-1 away .. +1 toward sun) for a unit normal in tile space */
export function sunFactor(nxOrPt: number | { x: number; y: number }, ny?: number): number {
  if (typeof nxOrPt === 'object') {
    return sunFacing(nxOrPt.x, nxOrPt.y);
  }
  return sunFacing(nxOrPt, ny!);
}

/** normalize any polyline or list of polylines into an array of Pt[] */
function normalizeEdgeList(edges: readonly (readonly Pt[] | readonly number[])[] | readonly Pt[] | readonly number[]): Pt[][] {
  if (!Array.isArray(edges) || edges.length === 0) return [];
  // single flat array [x0, y0, x1, y1, ...]
  if (typeof edges[0] === 'number') {
    const nums = edges as readonly number[];
    const pts: Pt[] = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      pts.push({ x: nums[i]!, y: nums[i + 1]! });
    }
    return pts.length > 0 ? [pts] : [];
  }
  // single Pt array [{x, y}, ...]
  if (typeof edges[0] === 'object' && edges[0] !== null && 'x' in edges[0] && 'y' in edges[0]) {
    return [edges as Pt[]];
  }
  // array of polylines
  const out: Pt[][] = [];
  for (const item of edges as readonly (readonly Pt[] | readonly number[])[]) {
    if (!item || item.length === 0) continue;
    if (typeof item[0] === 'number') {
      const nums = item as readonly number[];
      const pts: Pt[] = [];
      for (let i = 0; i + 1 < nums.length; i += 2) {
        pts.push({ x: nums[i]!, y: nums[i + 1]! });
      }
      if (pts.length > 0) out.push(pts);
    } else if (typeof item[0] === 'object' && item[0] !== null) {
      out.push(item as Pt[]);
    }
  }
  return out;
}

/**
 * splits polylines where the bin of the smoothed normal (2 m window) changes; each run carries its mean L.
 * edges: one or more polylines in tile coordinates.
 * bins: number of normal direction bins around the circle (default 8).
 * windowTiles: normal smoothing window along the curve in tiles (default 1.0 tile = 2 m).
 */
export function binEdges(
  edges: readonly (readonly Pt[] | readonly number[])[] | readonly Pt[] | readonly number[],
  bins = 8,
  windowTiles = 1.0,
): EdgeRun[] {
  const polylines = normalizeEdgeList(edges);
  const runs: EdgeRun[] = [];

  for (const poly of polylines) {
    if (poly.length < 2) continue;

    // cumulative arc lengths
    const n = poly.length;
    const isClosed = n >= 3 && Math.hypot(poly[0]!.x - poly[n - 1]!.x, poly[0]!.y - poly[n - 1]!.y) < 1e-5;
    const segCount = isClosed ? n - 1 : n - 1;
    const d: number[] = new Array(n);
    d[0] = 0;
    for (let i = 0; i < n - 1; i++) {
      const segLen = Math.hypot(poly[i + 1]!.x - poly[i]!.x, poly[i + 1]!.y - poly[i]!.y);
      d[i + 1] = d[i]! + segLen;
    }
    const totalLen = d[n - 1]!;
    if (totalLen < 1e-6) continue;

    // interpolation along polyline
    const ptAt = (s: number): Pt => {
      let curS = s;
      if (isClosed) {
        curS = ((curS % totalLen) + totalLen) % totalLen;
      } else {
        curS = Math.max(0, Math.min(totalLen, curS));
      }
      let lo = 0;
      let hi = n - 1;
      while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (d[mid]! <= curS) lo = mid;
        else hi = mid;
      }
      const segLen = d[lo + 1]! - d[lo]!;
      if (segLen < 1e-9) return { x: poly[lo]!.x, y: poly[lo]!.y };
      const t = (curS - d[lo]!) / segLen;
      return {
        x: poly[lo]!.x + t * (poly[lo + 1]!.x - poly[lo]!.x),
        y: poly[lo]!.y + t * (poly[lo + 1]!.y - poly[lo]!.y),
      };
    };

    // calculate smoothed normal and bin for each segment: surface on left of travel, outward normal is (dy, -dx)
    const segBins: number[] = new Array(segCount);
    const segLs: number[] = new Array(segCount);
    const segLens: number[] = new Array(segCount);
    const halfWin = Math.max(windowTiles / 2, 1e-4);

    for (let i = 0; i < segCount; i++) {
      const midS = (d[i]! + d[i + 1]!) / 2;
      let sA: number;
      let sB: number;
      if (isClosed) {
        sA = midS - halfWin;
        sB = midS + halfWin;
      } else {
        // for open curves, ensure full window length so end segments are fully smoothed
        const win = Math.min(totalLen, windowTiles);
        sA = Math.max(0, Math.min(totalLen - win, midS - win / 2));
        sB = Math.min(totalLen, Math.max(win, midS + win / 2));
      }
      const pA = ptAt(sA);
      const pB = ptAt(sB);
      const dx = pB.x - pA.x;
      const dy = pB.y - pA.y;
      const chordLen = Math.hypot(dx, dy);
      let nx = 0;
      let ny = 0;
      if (chordLen > 1e-9) {
        nx = dy / chordLen;
        ny = -dx / chordLen;
      } else {
        // fallback to segment's own tangent
        const sx = poly[i + 1]!.x - poly[i]!.x;
        const sy = poly[i + 1]!.y - poly[i]!.y;
        const slen = Math.hypot(sx, sy);
        if (slen > 1e-9) {
          nx = sy / slen;
          ny = -sx / slen;
        }
      }

      const angle = Math.atan2(ny, nx);
      const normAngle = (angle + 2 * Math.PI) % (2 * Math.PI);
      // center bins at octant angles (0, 45, 90, 135, ...)
      const b = Math.floor(((normAngle + Math.PI / bins) / (2 * Math.PI)) * bins) % bins;
      segBins[i] = b;
      segLs[i] = sunFactor(nx, ny);
      segLens[i] = d[i + 1]! - d[i]!;
    }

    // partition into runs
    interface RawRun {
      bin: number;
      segStart: number;
      segEnd: number; // inclusive
      totalLen: number;
      sumL: number;
    }
    const rawRuns: RawRun[] = [];
    let curRun: RawRun = {
      bin: segBins[0]!,
      segStart: 0,
      segEnd: 0,
      totalLen: segLens[0]!,
      sumL: segLs[0]! * segLens[0]!,
    };

    for (let i = 1; i < segCount; i++) {
      if (segBins[i] === curRun.bin) {
        curRun.segEnd = i;
        curRun.totalLen += segLens[i]!;
        curRun.sumL += segLs[i]! * segLens[i]!;
      } else {
        rawRuns.push(curRun);
        curRun = {
          bin: segBins[i]!,
          segStart: i,
          segEnd: i,
          totalLen: segLens[i]!,
          sumL: segLs[i]! * segLens[i]!,
        };
      }
    }
    rawRuns.push(curRun);

    // for closed polylines, if first and last run have the same bin, merge them
    if (isClosed && rawRuns.length > 1 && rawRuns[0]!.bin === rawRuns[rawRuns.length - 1]!.bin) {
      const last = rawRuns.pop()!;
      rawRuns[0]!.segStart = last.segStart; // marks wrap-around
      rawRuns[0]!.totalLen += last.totalLen;
      rawRuns[0]!.sumL += last.sumL;
    }

    // construct EdgeRun objects
    for (const r of rawRuns) {
      const flat: number[] = [];
      if (r.segStart > r.segEnd) {
        // wrap-around closed run: last segments then first segments
        for (let i = r.segStart; i < segCount; i++) {
          flat.push(poly[i]!.x, poly[i]!.y);
        }
        for (let i = 0; i <= r.segEnd + 1; i++) {
          flat.push(poly[i]!.x, poly[i]!.y);
        }
      } else {
        for (let i = r.segStart; i <= r.segEnd + 1; i++) {
          flat.push(poly[i]!.x, poly[i]!.y);
        }
      }
      const L = r.totalLen > 0 ? r.sumL / r.totalLen : 0;
      runs.push({
        pts: flat,
        L,
        bin: r.bin,
      });
    }
  }

  return runs;
}

/** specification of light rim or bevel shade along an edge */
export interface EdgeStyleRimShade {
  /** width in metres */
  width: number;
  /** blend mode */
  blend: 'screen' | 'multiply';
  /** hex color */
  color: string;
  /** peak opacity (0..1) */
  alpha: number;
  /** side of the edge (upper-right or lower-left) - only set for sunken surfaces */
  side?: 'upper-right' | 'lower-left';
}

/** specification of drop shadow cast outside an edge */
export interface EdgeStyleDrop {
  /** offset distance in metres toward 145° */
  offset: number;
  /** softness width in metres */
  soft: number;
  /** peak opacity (0..1) */
  alpha: number;
}

/** edge styling numbers and look of a golf surface (P21 section 3.4) */
export interface EdgeStyle {
  /** profile behavior */
  profile: EdgeProfile;
  /** feather band width in metres */
  feather: number;
  /** light rim inside the edge facing the sun (null if none) */
  rim: EdgeStyleRimShade | null;
  /** soft shade inside the edge facing away from the sun (null if none) */
  shade: EdgeStyleRimShade | null;
  /** drop shadow outside the edge facing away from the sun (null if none) */
  drop: EdgeStyleDrop | null;
}

export type CollarName = 'first-cut' | 'fringe' | 'lip' | 'bank';

export interface EdgeStyleTable extends ReadonlyArray<Readonly<EdgeStyle>> {
  readonly [surf: number]: Readonly<EdgeStyle>;
  readonly 'first-cut': Readonly<EdgeStyle>;
  readonly fringe: Readonly<EdgeStyle>;
  readonly lip: Readonly<EdgeStyle>;
  readonly bank: Readonly<EdgeStyle>;
}

const baseEdgeStyles: EdgeStyle[] = [
  /* none (0) */ {
    profile: 'flat',
    feather: 0,
    rim: null,
    shade: null,
    drop: null,
  },
  /* rough (1) */ {
    profile: 'flat',
    feather: 1.0,
    rim: null,
    shade: { width: 0.6, blend: 'multiply', color: '#233018', alpha: 0.06 },
    drop: null,
  },
  /* fescue (2) */ {
    profile: 'flat',
    feather: 1.2,
    rim: null,
    shade: null,
    drop: null,
  },
  /* water (3) */ {
    profile: 'sunken',
    feather: 0.2,
    rim: { width: 0.25, blend: 'screen', color: '#ffffff', alpha: 0.25, side: 'lower-left' },
    shade: { width: 1.4, blend: 'multiply', color: '#0d1a2a', alpha: 0.35, side: 'upper-right' },
    drop: null,
  },
  /* fairway (4) */ {
    profile: 'turf',
    feather: 0.4,
    rim: { width: 1.2, blend: 'screen', color: '#fff4c8', alpha: 0.12 },
    shade: { width: 1.2, blend: 'multiply', color: '#233018', alpha: 0.12 },
    drop: null,
  },
  /* tee (5) */ {
    profile: 'raised',
    feather: 0.3,
    rim: { width: 1.0, blend: 'screen', color: '#fff4c8', alpha: 0.26 },
    shade: { width: 1.0, blend: 'multiply', color: '#233018', alpha: 0.26 },
    drop: { offset: 0.6, soft: 1.0, alpha: 0.20 },
  },
  /* bunker (6) */ {
    profile: 'sunken',
    feather: 0.15,
    rim: { width: 0.6, blend: 'screen', color: '#fff2d6', alpha: 0.20, side: 'lower-left' },
    shade: { width: 0.9, blend: 'multiply', color: '#3a2a18', alpha: 0.30, side: 'upper-right' },
    drop: null,
  },
  /* waste (7) */ {
    profile: 'flat',
    feather: 0.4,
    rim: null,
    shade: null,
    drop: null,
  },
  /* green (8) */ {
    profile: 'raised',
    feather: 0.3,
    rim: { width: 0.8, blend: 'screen', color: '#fff4c8', alpha: 0.22 },
    shade: { width: 0.8, blend: 'multiply', color: '#233018', alpha: 0.22 },
    drop: { offset: 0.4, soft: 0.8, alpha: 0.16 },
  },
  /* long grass (9, T238): flat and soft like the rough and the fescue */ {
    profile: 'flat',
    feather: 1.1,
    rim: null,
    shade: { width: 0.6, blend: 'multiply', color: '#233018', alpha: 0.06 },
    drop: null,
  },
];

/** each golf surface's edge style table (P21 section 3.4), indexed by SURF id and collar names */
export const EDGE_STYLE: EdgeStyleTable = Object.assign(baseEdgeStyles, {
  'first-cut': {
    profile: 'flat' as const,
    feather: 0.4,
    rim: null,
    shade: null,
    drop: null,
  },
  fringe: {
    profile: 'flat' as const,
    feather: 0.4,
    rim: null,
    shade: null,
    drop: null,
  },
  lip: {
    profile: 'flat' as const,
    feather: 0.4,
    rim: null,
    shade: null,
    drop: null,
  },
  bank: {
    profile: 'flat' as const,
    feather: 0.4,
    rim: null,
    shade: null,
    drop: null,
  },
});

/** one step in a multi-stroke feather ramp */
export interface FeatherStep {
  /** stroke width (same distance unit as feather w: 2w, 1.33w, 0.67w) */
  width: number;
  /** stroke alpha (each 1/n, summing to 1) */
  alpha: number;
}

/** stroke widths and alphas for a linear fade (P21 section 3.4; widths 2w, 1.33w, 0.67w with alpha 1/3 each) */
export function featherSteps(w: number, n = 3): FeatherStep[] {
  const steps = Math.max(1, Math.round(n));
  const alpha = 1 / steps;
  const out: FeatherStep[] = [];
  for (let k = 0; k < steps; k++) {
    const width = 2 * w * ((steps - k) / steps);
    out.push({ width, alpha });
  }
  return out;
}

/**
 * the tile-space offset toward the 145° cast shadow (P21 section 3.4).
 * m: distance in metres (1 tile = 2 m, so magnitude in tiles is m / 2).
 */
export function dropOffset(m: number): { x: number; y: number } {
  const tiles = m / 2;
  return {
    x: -tiles * SUN_TILE_DIR.x,
    y: -tiles * SUN_TILE_DIR.y,
  };
}

/** pattern for mowing stripes along fairways */
export type StripePattern = 'along' | 'across' | 'checker' | 'half' | 'none';

/** light and dark band polygons in tile coordinates */
export interface StripeBands {
  light: Pt[][];
  dark: Pt[][];
}

/**
 * mowing stripe bands along a hole's centre line (P21 section 3.4).
 * line: centre line points in tile coordinates.
 * pattern: 'along' (3 m bands parallel to line), 'across', 'checker', 'half', or 'none'.
 * widthM: band width in metres (default 3 m).
 * halfExtentM: fairway lateral half-extent in metres (default 20 m).
 */
export function stripeBands(
  line: readonly Pt[] | readonly number[],
  pattern: StripePattern,
  widthM = 3,
  halfExtentM = 20,
): StripeBands {
  if (pattern === 'none') {
    return { light: [], dark: [] };
  }

  // normalize line to Pt[]
  let pts: Pt[] = [];
  if (line.length > 0 && typeof line[0] === 'number') {
    const nums = line as readonly number[];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      pts.push({ x: nums[i]!, y: nums[i + 1]! });
    }
  } else {
    pts = (line as readonly Pt[]).map((p) => ({ x: p.x, y: p.y }));
  }

  if (pts.length < 2) {
    return { light: [], dark: [] };
  }

  // 1 tile = 2 metres
  const widthTiles = widthM / 2;
  const halfExtentTiles = halfExtentM / 2;

  const N = pts.length;
  // compute segment tangents and normals
  const segT: Pt[] = [];
  const segN: Pt[] = [];
  const segLens: number[] = [];
  for (let i = 0; i < N - 1; i++) {
    const dx = pts[i + 1]!.x - pts[i]!.x;
    const dy = pts[i + 1]!.y - pts[i]!.y;
    const len = Math.hypot(dx, dy);
    segLens.push(len);
    if (len > 1e-9) {
      const tx = dx / len;
      const ty = dy / len;
      segT.push({ x: tx, y: ty });
      segN.push({ x: -ty, y: tx }); // normal pointing left of travel
    } else {
      segT.push({ x: 1, y: 0 });
      segN.push({ x: 0, y: 1 });
    }
  }

  // compute vertex miter vectors M_i
  const miter: Pt[] = new Array(N);
  miter[0] = { x: segN[0]!.x, y: segN[0]!.y };
  miter[N - 1] = { x: segN[N - 2]!.x, y: segN[N - 2]!.y };

  for (let i = 1; i < N - 1; i++) {
    const n1 = segN[i - 1]!;
    const n2 = segN[i]!;
    const denom = 1 + (n1.x * n2.x + n1.y * n2.y);
    if (denom < 0.1) {
      miter[i] = { x: n2.x, y: n2.y };
    } else {
      const mx = (n1.x + n2.x) / denom;
      const my = (n1.y + n2.y) / denom;
      const mLen = Math.hypot(mx, my);
      if (mLen > 3) {
        miter[i] = { x: (mx / mLen) * 3, y: (my / mLen) * 3 };
      } else {
        miter[i] = { x: mx, y: my };
      }
    }
  }

  // helper to construct a continuous ribbon polygon between offset uA and uB
  const makeRibbon = (uA: number, uB: number): Pt[] => {
    const ring: Pt[] = [];
    // forward along uA
    for (let i = 0; i < N; i++) {
      ring.push({
        x: pts[i]!.x + uA * miter[i]!.x,
        y: pts[i]!.y + uA * miter[i]!.y,
      });
    }
    // backward along uB
    for (let i = N - 1; i >= 0; i--) {
      ring.push({
        x: pts[i]!.x + uB * miter[i]!.x,
        y: pts[i]!.y + uB * miter[i]!.y,
      });
    }
    return ring;
  };

  const light: Pt[][] = [];
  const dark: Pt[][] = [];

  if (pattern === 'half') {
    // left side (u >= 0) is light, right side (u <= 0) is dark, split directly at the line (u = 0)
    light.push(makeRibbon(0, halfExtentTiles));
    dark.push(makeRibbon(-halfExtentTiles, 0));
    return { light, dark };
  }

  if (pattern === 'along') {
    // positive side (u from 0 to +halfExtent)
    let k = 0;
    for (let u = 0; u < halfExtentTiles - 1e-6; u += widthTiles, k++) {
      const uNext = Math.min(halfExtentTiles, u + widthTiles);
      const band = makeRibbon(u, uNext);
      if (k % 2 === 0) light.push(band);
      else dark.push(band);
    }
    // negative side (u from 0 down to -halfExtent)
    k = 0;
    for (let u = 0; u > -halfExtentTiles + 1e-6; u -= widthTiles, k++) {
      const uNext = Math.max(-halfExtentTiles, u - widthTiles);
      // ribbon from uNext to u maintains CCW / non-inverted geometry
      const band = makeRibbon(uNext, u);
      // to alternate across the centre line (u = 0), the first negative band is dark
      if (k % 2 === 0) dark.push(band);
      else light.push(band);
    }
    return { light, dark };
  }

  // cumulative arc lengths along the line for across and checker
  const cumD: number[] = new Array(N);
  cumD[0] = 0;
  for (let i = 0; i < N - 1; i++) {
    cumD[i + 1] = cumD[i]! + segLens[i]!;
  }
  const totalLength = cumD[N - 1]!;

  // helper to get point and miter at arc length s
  const sampleAt = (s: number): { pt: Pt; m: Pt } => {
    const curS = Math.max(0, Math.min(totalLength, s));
    let lo = 0;
    let hi = N - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (cumD[mid]! <= curS) lo = mid;
      else hi = mid;
    }
    const slen = cumD[lo + 1]! - cumD[lo]!;
    const t = slen > 1e-9 ? (curS - cumD[lo]!) / slen : 0;
    const pt = {
      x: pts[lo]!.x + t * (pts[lo + 1]!.x - pts[lo]!.x),
      y: pts[lo]!.y + t * (pts[lo + 1]!.y - pts[lo]!.y),
    };
    const m = {
      x: miter[lo]!.x + t * (miter[lo + 1]!.x - miter[lo]!.x),
      y: miter[lo]!.y + t * (miter[lo + 1]!.y - miter[lo]!.y),
    };
    return { pt, m };
  };

  const makeQuadCell = (s0: number, s1: number, u0: number, u1: number): Pt[] => {
    const a = sampleAt(s0);
    const b = sampleAt(s1);
    return [
      { x: a.pt.x + u0 * a.m.x, y: a.pt.y + u0 * a.m.y },
      { x: b.pt.x + u0 * b.m.x, y: b.pt.y + u0 * b.m.y },
      { x: b.pt.x + u1 * b.m.x, y: b.pt.y + u1 * b.m.y },
      { x: a.pt.x + u1 * a.m.x, y: a.pt.y + u1 * a.m.y },
    ];
  };

  if (pattern === 'across') {
    let sIdx = 0;
    for (let s = 0; s < totalLength - 1e-6; s += widthTiles, sIdx++) {
      const sNext = Math.min(totalLength, s + widthTiles);
      const quad = makeQuadCell(s, sNext, -halfExtentTiles, halfExtentTiles);
      if (sIdx % 2 === 0) light.push(quad);
      else dark.push(quad);
    }
    return { light, dark };
  }

  if (pattern === 'checker') {
    let sIdx = 0;
    for (let s = 0; s < totalLength - 1e-6; s += widthTiles, sIdx++) {
      const sNext = Math.min(totalLength, s + widthTiles);
      let uIdx = 0;
      for (let u = -halfExtentTiles; u < halfExtentTiles - 1e-6; u += widthTiles, uIdx++) {
        const uNext = Math.min(halfExtentTiles, u + widthTiles);
        const cell = makeQuadCell(s, sNext, u, uNext);
        if ((sIdx + uIdx) % 2 === 0) light.push(cell);
        else dark.push(cell);
      }
    }
    return { light, dark };
  }

  return { light, dark };
}
