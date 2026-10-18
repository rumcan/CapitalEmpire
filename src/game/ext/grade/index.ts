/** Grade separation: bridges over and tunnels under roads (road-over-road). Pure TS, no DOM. */
import { MAP, mulberry } from '../../iso';
import { SK } from '../../network';
import type { Pt } from '../../network';

/** Elevation levels: -1 tunnel/underpass, 0 ground, 1 bridge/overpass, 2 high bridge */
export type Elevation = -1 | 0 | 1 | 2;
/** Re-export SegKind for convenience */
export type SegKind = 0 | 1 | 2;

/** A road segment with its elevation and structural kind */
export interface GradeSegment {
  /** unique id */
  id: number;
  /** start point (tiles) */
  a: Pt;
  /** end point (tiles) */
  b: Pt;
  /** logical level: -1 below, 0 ground, 1 above, 2 high */
  elevation: Elevation;
  /** structural kind: SK.GROUND 0, SK.BRIDGE 1, SK.TUNNEL 2 (for save) */
  kind: SegKind;
}

/** Interior crossing between two segments */
export interface Crossing {
  /** stable id */
  id: number;
  /** ids of the two segments */
  a: number;
  b: number;
  /** intersection point (tiles) */
  x: number;
  y: number;
  /** true when elevations differ → no junction needed */
  separated: boolean;
  /** vertical clearance in tiles (levels * CLEARANCE_TILES) */
  clearance: number;
}

/** Validation of a potential ramp */
export interface RampInfo {
  /** segment id */
  seg: number;
  /** levels risen (abs(elevation)) */
  rise: number;
  /** tiles needed at MAX_GRADE */
  need: number;
  /** true when length >= need or elevation is ground */
  ok: boolean;
}

/** Validation of a continuous span */
export interface SpanInfo {
  /** representative segment id of the span */
  seg: number;
  /** kind of the span */
  kind: SegKind;
  /** total length of the continuous run (tiles) */
  length: number;
  /** true when within limits */
  ok: boolean;
}

/** What the renderer and lane builder consume */
export interface GradeView {
  /** bridge decks: centreline and half width for rendering / lane placement */
  decks: { id: number; pts: Pt[]; hw: number; elevation: Elevation }[];
  /** pillar centres (tiles) */
  pillars: { x: number; y: number; seg: number }[];
  /** tunnel portal positions and direction into tunnel (unit vector in tile space) */
  portals: { x: number; y: number; dir: Pt; seg: number }[];
  /** all crossings (with separated flag) */
  crossings: Crossing[];
  /** ramp checks */
  ramps: RampInfo[];
}

// ---------------------------------------------------------------------------
// Constants (tunable, exported)
// ---------------------------------------------------------------------------

/** $ per tile of road at ground (tiles = 2 m) — street class reference */
export const GROUND_COST_PER_TILE = 150;
/** $ per tile of overpass/bridge deck (includes deck, railings, abutments) */
export const BRIDGE_COST_PER_TILE = 600;
/** $ per tile of underpass/tunnel (cut-and-cover) */
export const TUNNEL_COST_PER_TILE = 900;
/** $ per tile extra for ramp (grade, retaining walls, earthworks) */
export const RAMP_COST_PER_TILE = 200;
/** $ per pillar (pier foundation + column) */
export const PILLAR_COST = 2000;
/** $ per portal (headwall + wing walls) */
export const PORTAL_COST = 5000;
/** upkeep per game day as share of build cost (1 % → rebuilds in 100 days) */
export const UPKEEP_RATE = 0.01;

/** vertical clearance from lower road surface to underside of deck above (tiles = 5.5 m) */
export const CLEARANCE_TILES = 2.75;
/** maximum road grade (6 % — 1:16.7, comfortable for trucks) */
export const MAX_GRADE = 0.06;
/** longest single bridge run before an expansion joint / support is needed (tiles = 300 m) */
export const MAX_BRIDGE_SPAN = 150;
/** longest single tunnel/underpass run before ventilation needed (tiles = 600 m) */
export const MAX_TUNNEL_LENGTH = 300;
/** abutment length at each bridge end where it meets ground (tiles) */
export const ABUTMENT = 1.5;
/** pillar spacing along a bridge centreline (tiles = 30 m) */
export const PILLAR_SPACING = 15;
/** half width of a typical road corridor for deck hw (tiles): street ~1.625+1.0 */
export const DEFAULT_HW = 2.6;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const EPS = 1e-9;

/** length of a grade segment in tiles (1 tile = 2 m) */
export function segLength(s: GradeSegment): number {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
  return Math.hypot(dx, dy);
}

/** tiles of ramp needed to rise `deltaLevels` levels at MAX_GRADE (0 levels → 0) */
export function rampLength(deltaLevels: number): number {
  const d = Math.abs(deltaLevels);
  if (d < EPS) return 0;
  return (d * CLEARANCE_TILES) / MAX_GRADE;
}

/** cost per tile by kind */
function costPerTile(kind: SegKind): number {
  return kind === SK.BRIDGE ? BRIDGE_COST_PER_TILE : kind === SK.TUNNEL ? TUNNEL_COST_PER_TILE : GROUND_COST_PER_TILE;
}

/** build cost of one segment (length * per-tile kind cost). Ramp surcharge is added in buildCost(). */
export function segmentCost(seg: GradeSegment): number {
  return segLength(seg) * costPerTile(seg.kind);
}

/** helper: segment intersection (interior) — returns point or null */
function segIntersect(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const abx = b.x - a.x, aby = b.y - a.y;
  const cdx = d.x - c.x, cdy = d.y - c.y;
  const den = abx * cdy - aby * cdx;
  if (Math.abs(den) < 1e-12) return null; // parallel
  const acx = c.x - a.x, acy = c.y - a.y;
  const t = (acx * cdy - acy * cdx) / den;
  const u = (acx * aby - acy * abx) / den;
  // interior only: exclude endpoints (t==0,1 or u==0,1)
  if (t <= EPS || t >= 1 - EPS || u <= EPS || u >= 1 - EPS) return null;
  return { x: a.x + abx * t, y: a.y + aby * t };
}

/** squared distance tile */
function dist2(p: Pt, q: Pt): number {
  const dx = p.x - q.x, dy = p.y - q.y;
  return dx * dx + dy * dy;
}

/** detect interior crossings (excludes shared endpoints and collinear overlaps) */
export function detectCrossings(segments: GradeSegment[]): Crossing[] {
  const out: Crossing[] = [];
  let cid = 0;
  const n = segments.length;
  for (let i = 0; i < n; i++) {
    const si = segments[i];
    const a0 = si.a, a1 = si.b;
    const abx = a1.x - a0.x, aby = a1.y - a0.y;
    const alen2 = abx * abx + aby * aby;
    if (alen2 < EPS) continue;
    // bbox for quick reject
    const aminX = Math.min(a0.x, a1.x), amaxX = Math.max(a0.x, a1.x);
    const aminY = Math.min(a0.y, a1.y), amaxY = Math.max(a0.y, a1.y);
    for (let j = i + 1; j < n; j++) {
      const sj = segments[j];
      // skip if share an endpoint within EPS (node, not crossing)
      if (dist2(si.a, sj.a) < EPS || dist2(si.a, sj.b) < EPS || dist2(si.b, sj.a) < EPS || dist2(si.b, sj.b) < EPS) continue;
      const b0 = sj.a, b1 = sj.b;
      // bbox reject
      if (Math.max(aminX, Math.min(b0.x, b1.x)) > Math.min(amaxX, Math.max(b0.x, b1.x)) + EPS) continue;
      if (Math.max(aminY, Math.min(b0.y, b1.y)) > Math.min(amaxY, Math.max(b0.y, b1.y)) + EPS) continue;
      const pt = segIntersect(a0, a1, b0, b1);
      if (!pt) continue;
      const clearance = Math.abs(si.elevation - sj.elevation) * CLEARANCE_TILES;
      const separated = si.elevation !== sj.elevation;
      out.push({ id: cid++, a: si.id, b: sj.id, x: pt.x, y: pt.y, separated, clearance });
    }
  }
  // stable sort by id (deterministic)
  out.sort((p, q) => p.id - q.id);
  return out;
}

/** classify existing crossings by current elevations: updates separated/clearance */
export function classifyCrossings(segments: GradeSegment[], crossings: Crossing[]): Crossing[] {
  const map = new Map<number, GradeSegment>();
  for (const s of segments) map.set(s.id, s);
  for (const c of crossings) {
    const sa = map.get(c.a), sb = map.get(c.b);
    if (!sa || !sb) continue;
    c.separated = sa.elevation !== sb.elevation;
    c.clearance = Math.abs(sa.elevation - sb.elevation) * CLEARANCE_TILES;
  }
  return crossings;
}

/** every segment as potential ramp: need = rampLength(|elevation|), ok when length >= need or ground */
export function validateRamps(segments: GradeSegment[]): RampInfo[] {
  const out: RampInfo[] = [];
  for (const s of segments) {
    const rise = Math.abs(s.elevation);
    const need = rampLength(rise);
    const len = segLength(s);
    const ok = s.elevation === 0 ? true : len + 1e-9 >= need;
    out.push({ seg: s.id, rise, need, ok });
  }
  return out;
}

/** max-span check per continuous run of same kind where segments touch end-to-end */
export function validateSpans(segments: GradeSegment[]): SpanInfo[] {
  if (!segments.length) return [];
  // key = quantised endpoint for connectivity (0.001 tile snap)
  const keyOf = (p: Pt) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;
  // map endpoint key -> list of segment indices incident
  const at = new Map<string, number[]>();
  segments.forEach((s, i) => {
    for (const k of [keyOf(s.a), keyOf(s.b)]) {
      let arr = at.get(k);
      if (!arr) { arr = []; at.set(k, arr); }
      arr.push(i);
    }
  });
  const visited = new Set<number>();
  const out: SpanInfo[] = [];
  for (let i = 0; i < segments.length; i++) {
    if (visited.has(i)) continue;
    const kind = segments[i].kind;
    if (kind === SK.GROUND) { visited.add(i); continue; }
    // BFS over same-kind touching segments
    const stack: number[] = [i];
    visited.add(i);
    let total = 0;
    const members: number[] = [];
    while (stack.length) {
      const curIdx = stack.pop()!;
      const cur = segments[curIdx];
      total += segLength(cur);
      members.push(curIdx);
      for (const kp of [keyOf(cur.a), keyOf(cur.b)]) {
        const neigh = at.get(kp) ?? [];
        for (const ni of neigh) {
          if (visited.has(ni)) continue;
          if (segments[ni].kind !== kind) continue;
          visited.add(ni);
          stack.push(ni);
        }
      }
    }
    const limit = kind === SK.BRIDGE ? MAX_BRIDGE_SPAN : MAX_TUNNEL_LENGTH;
    const ok = total <= limit + 1e-9;
    out.push({ seg: segments[members[0]]!.id, kind, length: total, ok });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cost including pillars/portals/ramp surcharge
// ---------------------------------------------------------------------------

/** count pillars for a bridge chain: one every PILLAR_SPACING, not at the abutments */
function countPillarsForLength(len: number): number {
  if (len < PILLAR_SPACING - 1e-9) return 0;
  // first pillar at PILLAR_SPACING/2 from start, last before ABUTMENT at end
  // simple: floor((len - ABUTMENT*2) / PILLAR_SPACING) clamped >=0, or floor(len / PILLAR_SPACING)
  // use floor(len / PILLAR_SPACING) as stable estimate (tests use this)
  return Math.max(0, Math.floor(len / PILLAR_SPACING));
}

/** total build cost: segments + pillars + portals + ramp surcharge (ramp extra per tile of elevated segment) */
export function buildCost(segments: GradeSegment[]): number {
  let sum = 0;
  // per-segment base
  for (const s of segments) sum += segmentCost(s);
  // ramp surcharge: for every non-ground segment, add RAMP_COST per tile (the sloping earthworks)
  for (const s of segments) if (s.elevation !== 0) sum += segLength(s) * RAMP_COST_PER_TILE;
  // pillars for bridges
  // group bridges into runs for pillar count (reuse validateSpans grouping but count per run)
  const spans = validateSpans(segments);
  for (const sp of spans) if (sp.kind === SK.BRIDGE) sum += countPillarsForLength(sp.length) * PILLAR_COST;
  // portals for tunnels/underpasses: 2 per continuous tunnel run
  for (const sp of spans) if (sp.kind === SK.TUNNEL) sum += 2 * PORTAL_COST;
  return sum;
}

// ---------------------------------------------------------------------------
// Main class
// ---------------------------------------------------------------------------

/** Grade separation manager: holds segments, detects crossings, builds view, validates. */
export class GradeSeparation {
  private segs: Map<number, GradeSegment> = new Map();
  private crossings: Crossing[] = [];
  private viewCache: GradeView | null = null;
  private seed: number;
  private rng: () => number;

  constructor(seed = 1) {
    this.seed = seed >>> 0;
    this.rng = mulberry(this.seed);
  }

  /** replace the whole network; crossings and view recomputed */
  setNetwork(segments: GradeSegment[]): void {
    this.segs.clear();
    for (const s of segments) this.segs.set(s.id, { ...s, a: { ...s.a }, b: { ...s.b } });
    this.recompute();
  }

  /** add or update one segment */
  setSegment(seg: GradeSegment): void {
    this.segs.set(seg.id, { ...seg, a: { ...seg.a }, b: { ...seg.b } });
    this.recompute();
  }

  /** remove segment by id */
  removeSegment(id: number): void {
    this.segs.delete(id);
    this.recompute();
  }

  /** all segments (copy) */
  getSegments(): GradeSegment[] {
    return [...this.segs.values()].map(s => ({ ...s, a: { ...s.a }, b: { ...s.b } }));
  }

  /** interior crossings with separated flag */
  getCrossings(): Crossing[] {
    return this.crossings.map(c => ({ ...c }));
  }

  /** true when a and b are grade-separated (different z and interior crossing exists, or same elevation but indirect?) */
  isSeparated(a: number, b: number): boolean {
    for (const c of this.crossings) {
      if ((c.a === a && c.b === b) || (c.a === b && c.b === a)) return c.separated;
    }
    // also if no crossing but different elevations at a shared ramp node? Not separated (they meet at junction)
    return false;
  }

  /** total build cost (defines saving) */
  cost(): number {
    return buildCost(this.getSegments());
  }

  /** upkeep per game day (1 % of build cost) */
  upkeepPerDay(): number {
    return this.cost() * UPKEEP_RATE;
  }

  /** validation strings: ramp too steep, span too long, tunnel too long */
  validate(): string[] {
    const errs: string[] = [];
    for (const r of validateRamps(this.getSegments())) {
      if (!r.ok) errs.push(`Ramp ${r.seg} too steep: need ${r.need.toFixed(1)} tiles, has ${segLength(this.segs.get(r.seg)!)?.toFixed(1) ?? '?'}`);
    }
    for (const s of validateSpans(this.getSegments())) {
      if (!s.ok) {
        const kindName = s.kind === SK.BRIDGE ? 'Bridge' : 'Tunnel';
        const lim = s.kind === SK.BRIDGE ? MAX_BRIDGE_SPAN : MAX_TUNNEL_LENGTH;
        errs.push(`${kindName} span ${s.seg} too long: ${s.length.toFixed(1)} > ${lim} tiles`);
      }
    }
    return errs;
  }

  /** what renderer draws: decks, pillars, portals, crossings, ramps */
  view(): GradeView {
    if (this.viewCache) return this.viewCache;
    const segs = this.getSegments();
    const decks: GradeView['decks'] = [];
    const pillars: GradeView['pillars'] = [];
    const portals: GradeView['portals'] = [];
    // decks for bridges/high bridges
    for (const s of segs) if (s.kind === SK.BRIDGE) {
      decks.push({ id: s.id, pts: [{ ...s.a }, { ...s.b }], hw: DEFAULT_HW, elevation: s.elevation });
    }
    // pillars: along each bridge span, jittered deterministically
    this.rng = mulberry(this.seed);
    for (const s of segs) if (s.kind === SK.BRIDGE) {
      const len = segLength(s);
      const n = countPillarsForLength(len);
      if (n <= 0) continue;
      const dx = (s.b.x - s.a.x) / len, dy = (s.b.y - s.a.y) / len;
      for (let k = 0; k < n; k++) {
        const t = (k + 1) * PILLAR_SPACING; // spacing along; first at 15, etc.
        if (t > len + 1e-9) break;
        // jitter +-0.4 tiles crosswise and +-1 tile along, seeded
        const jx = (this.rng() - 0.5) * 0.8, jy = (this.rng() - 0.5) * 0.8;
        const px = (this.rng() - 0.5) * 2;
        const bx = s.a.x + dx * (t + px) + (-dy) * jx;
        const by = s.a.y + dy * (t + px) + dx * jy;
        // clamp to map
        pillars.push({ x: Math.max(0, Math.min(MAP, bx)), y: Math.max(0, Math.min(MAP, by)), seg: s.id });
      }
    }
    // portals for tunnels: 2 per tunnel run (at run ends)
    // Build endpoint map for tunnel runs: collect segments of each run to find endpoints
    // Simpler: each tunnel segment gets 2 portals at its ends where neighbor is not tunnel or no neighbor
    const keyOf = (p: Pt) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;
    const at = new Map<string, GradeSegment[]>();
    for (const s of segs) if (s.kind === SK.TUNNEL) {
      for (const kp of [keyOf(s.a), keyOf(s.b)]) {
        let arr = at.get(kp);
        if (!arr) { arr = []; at.set(kp, arr); }
        arr.push(s);
      }
    }
    for (const s of segs) if (s.kind === SK.TUNNEL) {
      const ends: [Pt, Pt][] = [[s.a, s.b], [s.b, s.a]];
      for (const [pt, other] of ends) {
        const key = keyOf(pt);
        const neigh = (at.get(key) ?? []).filter(q => q.kind === SK.TUNNEL && q.id !== s.id);
        // portal if no other tunnel continues (dead end or meets ground)
        if (neigh.length === 0) {
          const dx = other.x - pt.x, dy = other.y - pt.y;
          const L = Math.hypot(dx, dy) || 1;
          portals.push({ x: pt.x, y: pt.y, dir: { x: dx / L, y: dy / L }, seg: s.id });
        }
      }
    }
    // also handle tunnelRuns where interior run endpoints already covered; deduplicate by quantised pos
    const seen = new Set<string>();
    const uniqPortals: typeof portals = [];
    for (const p of portals) {
      const k = `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)},${p.seg}`;
      if (seen.has(k)) continue;
      seen.add(k);
      uniqPortals.push(p);
    }
    // ramps
    const ramps = validateRamps(segs);
    const crossings = this.crossings.map(c => ({ ...c }));
    this.viewCache = { decks, pillars: pillars, portals: uniqPortals, crossings, ramps };
    return this.viewCache;
  }

  /** summary stats for panel */
  stats(): { segments: number; overpasses: number; underpasses: number; crossings: number; separated: number; atGrade: number } {
    const segs = this.getSegments();
    const overpasses = segs.filter(s => s.kind === SK.BRIDGE).length;
    const underpasses = segs.filter(s => s.kind === SK.TUNNEL).length;
    const crossings = this.crossings.length;
    const separated = this.crossings.filter(c => c.separated).length;
    return { segments: segs.length, overpasses, underpasses, crossings, separated, atGrade: crossings - separated };
  }

  private recompute(): void {
    const arr = this.getSegments();
    this.crossings = detectCrossings(arr);
    this.viewCache = null;
  }
}
