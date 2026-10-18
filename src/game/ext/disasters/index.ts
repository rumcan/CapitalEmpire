// Natural disasters: independent, seeded daily risk and road-segment closures. No sim or renderer dependencies.
import { MAP, mulberry } from '../../iso';
import { TC } from '../../terrain/types';
import type { Pt } from '../../network';

/** Disaster types; times are game seconds (one game day = 1440 seconds). */
export type DisasterKind = 'flood' | 'storm' | 'landslide' | 'wildfire' | 'quake';
/** Current road geometry in tiles (2 m); nearWater is distance to water in tiles, slope is rise/run. */
export interface RoadInfo { key: string; a: Pt; b: Pt; kind: 'ground' | 'bridge' | 'tunnel'; nearWater: number; slope: number }
/** One event. Area is a tile-space polygon; burned, when present, is the exact PATCH/HILL fuel-cell footprint (cell centres). */
export interface Disaster {
  id: number; kind: DisasterKind; warnAt: number; start: number; end: number; area: Pt[];
  closures: { key: string; until: number | 'repair'; repairCost: number }[];
  burned?: Pt[];
}

const DAY = 1440, KINDS: DisasterKind[] = ['flood', 'storm', 'landslide', 'wildfire', 'quake'];
type Changes = { warned: Disaster[]; started: Disaster[]; ended: Disaster[] };
// Shared, immutable fast-path response: no allocations on ordinary 0.1 s sim ticks.
const QUIET = Object.freeze({ warned: Object.freeze([]), started: Object.freeze([]), ended: Object.freeze([]) }) as unknown as Changes;
const WATER_RANGE = 24, STEEP = 0.25;
const mid = (r: RoadInfo): Pt => ({ x: (r.a.x + r.b.x) / 2, y: (r.a.y + r.b.y) / 2 });
const len = (r: RoadInfo) => Math.hypot(r.a.x - r.b.x, r.a.y - r.b.y);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP && y < MAP;
function distance(p: Pt, r: RoadInfo): number {
  const dx = r.b.x - r.a.x, dy = r.b.y - r.a.y, l2 = dx * dx + dy * dy;
  const f = l2 ? clamp(((p.x - r.a.x) * dx + (p.y - r.a.y) * dy) / l2, 0, 1) : 0;
  return Math.hypot(p.x - r.a.x - dx * f, p.y - r.a.y - dy * f);
}
function circle(p: Pt, radius: number): Pt[] {
  const a: Pt[] = [];
  for (let i = 0; i < 12; i++) { const angle = i * Math.PI / 6; a.push({ x: p.x + radius * Math.cos(angle), y: p.y + radius * Math.sin(angle) }); }
  return a;
}
function hull(points: Pt[]): Pt[] {
  if (points.length < 3) return circle(points[0], 1);
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const lower: Pt[] = [], upper: Pt[] = [];
  for (const p of sorted) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (let i = sorted.length - 1; i >= 0; i--) { const p = sorted[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  lower.pop(); upper.pop(); const outline = lower.concat(upper);
  return outline.length >= 3 ? outline : circle(points[0], 1);
}

/** Seeded disaster scheduler. step expects a nondecreasing game clock and current (not cached) roads.
 *  Risk is sampled once per game day, even when a caller skips days. At most one event, including warnings,
 *  can be outstanding. A quake holds the slot until all damaged segments are repaired. */
export class Disasters {
  private readonly random: () => number;
  private readonly cls: Uint8Array;
  private readonly heights: (x: number, y: number) => number;
  private readonly riverLength: number;
  private readonly fuelCells: number;
  private nextDay = DAY;
  private now = 0;
  private nextId = 1;
  private pending: Disaster | null = null;
  private current: Disaster | null = null;
  private forced: DisasterKind | null = null;

  /** The terrain buffer is MAP*MAP classes, row-major; heights gives metres at tile coordinates. */
  constructor(seed: number, terrainCls: Uint8Array, heights: (x: number, y: number) => number) {
    if (terrainCls.length !== MAP * MAP) throw new RangeError('terrainCls must be MAP*MAP');
    this.random = mulberry(seed); this.cls = terrainCls; this.heights = heights;
    let bankEdges = 0, fuel = 0;
    for (let i = 0; i < terrainCls.length; i++) {
      const c = terrainCls[i];
      if (c === TC.PATCH || c === TC.HILL) fuel++;
      if (c !== TC.WATER) continue;
      const x = i % MAP, y = (i / MAP) | 0;
      if (x === 0 || terrainCls[i - 1] !== TC.WATER) bankEdges++;
      if (x === MAP - 1 || terrainCls[i + 1] !== TC.WATER) bankEdges++;
      if (y === 0 || terrainCls[i - MAP] !== TC.WATER) bankEdges++;
      if (y === MAP - 1 || terrainCls[i + MAP] !== TC.WATER) bankEdges++;
    }
    // Half the shoreline perimeter approximates the channel centreline length without mistaking width for length.
    this.riverLength = bankEdges / 2; this.fuelCells = fuel;
  }

  /** Advance to t game seconds; transitions are returned once, in chronological order within each list.
   *  Treat the arrays as read-only: uneventful ticks share one frozen empty result. */
  step(t: number, roads: RoadInfo[]): Changes {
    if (!Number.isFinite(t) || t < this.now) throw new RangeError('disaster clock must be finite and nondecreasing');
    if (t < this.nextDay && t < (this.pending?.start ?? Infinity) && t < (this.current?.end ?? Infinity)) {
      this.now = t; return QUIET;
    }
    const out: Changes = { warned: [], started: [], ended: [] };
    for (;;) {
      const at = Math.min(this.nextDay, this.pending?.start ?? Infinity, this.current?.end ?? Infinity);
      if (at > t) break;
      this.now = at;
      if (this.current && this.current.end === at) { out.ended.push(this.current); this.current = null; }
      if (this.pending && this.pending.start === at) { this.current = this.pending; this.pending = null; out.started.push(this.current); }
      if (this.nextDay === at) {
        this.nextDay += DAY;
        if (!this.current && !this.pending) {
          const event = this.roll(at, roads);
          if (event) {
            if (event.warnAt < event.start) { this.pending = event; out.warned.push(event); }
            else { this.current = event; out.started.push(event); }
          }
        }
      }
    }
    this.now = t;
    return out;
  }

  /** Dev and tests: the next daily roll is kind instead of the seeded draw (it starts only if the kind has a road to close, else that day is empty). */
  force(kind: DisasterKind): void { this.forced = kind; }

  /** Repair one quake closure by segment key. A quake ends after its last closure is repaired; the next step reports ended. */
  repair(disaster: number, key: string): void {
    const d = this.current;
    if (!d || d.id !== disaster || d.kind !== 'quake') return;
    const index = d.closures.findIndex(c => c.key === key && c.until === 'repair');
    if (index < 0) return;
    d.closures.splice(index, 1);
    if (d.closures.length === 0) d.end = this.now;
  }

  /** Currently started, not ended disasters; warnings are delivered by step's warned list. */
  active(): Disaster[] { return this.current && this.current.end > this.now ? [this.current] : []; }

  /** Approximate seeded Bernoulli probability per game day for each kind at the current map/roads. */
  riskPerDay(roads: RoadInfo[]): Record<DisasterKind, number> {
    let roadLen = 0, steepLen = 0, structures = 0, near = 0;
    for (const r of roads) {
      const l = len(r); roadLen += l;
      if (r.kind === 'ground' && r.slope >= STEEP) steepLen += l;
      if (r.kind !== 'ground') structures++;
      if (r.kind !== 'tunnel' && r.nearWater <= WATER_RANGE) near++;
    }
    // An ineligible kind has zero risk. The probability of an actual event can be lower if the
    // sampled site has no closure (e.g. no burnable cell close enough to any road).
    return {
      flood: near ? 0.006 + Math.min(0.04, this.riverLength / 1000 * 0.018) : 0,
      storm: roads.length ? 0.012 + Math.min(0.02, roadLen / 20000 * 0.012) : 0,
      landslide: steepLen ? 0.004 + Math.min(0.05, steepLen / 4000 * 0.04) : 0,
      wildfire: this.fuelCells && roads.length ? 0.008 + Math.min(0.025, this.fuelCells / 200000 * 0.012) : 0,
      quake: structures ? 0.006 + Math.min(0.025, structures / 20 * 0.014) : 0,
    };
  }

  private roll(at: number, roads: RoadInfo[]): Disaster | null {
    if (this.forced) { const k = this.forced; this.forced = null; return this.make(k, at, roads); }
    const risks = this.riskPerDay(roads);
    let draw = this.random();
    for (const kind of KINDS) { draw -= risks[kind]; if (draw < 0) return this.make(kind, at, roads); }
    return null;
  }

  private make(kind: DisasterKind, at: number, roads: RoadInfo[]): Disaster | null {
    const eligible = roads.filter(r => kind === 'flood' ? r.kind !== 'tunnel' && r.nearWater <= WATER_RANGE && this.low(r)
      : kind === 'landslide' ? r.kind === 'ground' && r.slope >= STEEP
        : kind === 'quake' ? r.kind !== 'ground' : kind === 'storm' ? true : r.kind === 'ground');
    if (!eligible.length) return null;
    let anchor = eligible[(this.random() * eligible.length) | 0];
    let ignition: Pt | null = null;
    if (kind === 'wildfire') {
      const from = (this.random() * eligible.length) | 0;
      for (let i = 0; i < eligible.length; i++) {
        const road = eligible[(from + i) % eligible.length];
        ignition = this.ignition(road);
        if (ignition) { anchor = road; break; }
      }
      if (!ignition) return null;
    }
    const centre = kind === 'wildfire' ? ignition! : mid(anchor);
    const radius = kind === 'flood' ? 45 : kind === 'storm' ? 70 : kind === 'landslide' ? 35 : 90;
    const start = at + (kind === 'flood' ? 90 : kind === 'storm' ? 45 : 0);
    const end = kind === 'quake' ? Infinity : start + (kind === 'flood' ? 360 : kind === 'storm' ? 180 : kind === 'landslide' ? 300 : 120);
    const burned = kind === 'wildfire' ? this.spread(ignition!) : undefined;
    const affected = roads.filter(r => kind === 'flood' ? r.kind !== 'tunnel' && r.nearWater <= WATER_RANGE && this.low(r) && distance(centre, r) <= radius
      : kind === 'storm' ? distance(centre, r) <= radius && (r === anchor || this.random() < 0.65)
        : kind === 'landslide' ? r.kind === 'ground' && r.slope >= STEEP && distance(centre, r) <= radius
          : kind === 'quake' ? r.kind !== 'ground' && distance(centre, r) <= radius
            : r.kind === 'ground' && burned!.some(p => distance(p, r) <= 3));
    if (!affected.length) return null;
    const closures = [...new Map(affected.map(r => [r.key, { key: r.key, until: kind === 'quake' ? 'repair' as const : end,
      repairCost: kind === 'quake' ? (r.kind === 'bridge' ? 12000 : 18000) : 0 }])).values()];
    return { id: this.nextId++, kind, warnAt: at, start, end, area: burned ? hull(burned) : circle(centre, radius), closures, ...(burned ? { burned } : {}) };
  }

  // A ground road is low if its midpoint is within 6 m of nearby water; without nearby sampled water,
  // trust the supplied nearWater distance (useful for sparse/partial terrain data).
  private low(r: RoadInfo): boolean {
    if (r.kind === 'bridge') return true;
    const p = mid(r), cx = Math.floor(p.x), cy = Math.floor(p.y);
    let nearest = Infinity, waterHeight = 0;
    for (let dy = -26; dy <= 26; dy++) for (let dx = -26; dx <= 26; dx++) {
      const x = cx + dx, y = cy + dy, dist2 = dx * dx + dy * dy;
      if (dist2 >= nearest || !inside(x, y) || this.cls[y * MAP + x] !== TC.WATER) continue;
      nearest = dist2; waterHeight = this.heights(x + 0.5, y + 0.5);
    }
    return nearest === Infinity || this.heights(p.x, p.y) <= waterHeight + 6;
  }

  // Find fuel cells along this segment (including its ends), within three tiles of the road.
  private ignition(r: RoadInfo): Pt | null {
    const steps = Math.max(1, Math.ceil(len(r) / 4));
    for (let i = 0; i <= steps; i++) {
      const x = Math.floor(r.a.x + (r.b.x - r.a.x) * i / steps), y = Math.floor(r.a.y + (r.b.y - r.a.y) * i / steps);
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const px = x + dx, py = y + dy;
        if (inside(px, py) && this.burnable(this.cls[py * MAP + px]) && distance({ x: px + 0.5, y: py + 0.5 }, r) <= 3)
          return { x: px + 0.5, y: py + 0.5 };
      }
    }
    return null;
  }

  // PATCH is undergrowth; HILL is the forest's terrain class (tree placement itself is procedural).
  private burnable(c: number): boolean { return c === TC.PATCH || c === TC.HILL; }

  // Seeded 4-connected spread. Only fuel cells burn; the exact footprint is separate from its overlay hull.
  private spread(seed: Pt): Pt[] {
    const result: Pt[] = [seed], seen = new Set<number>();
    const start = Math.floor(seed.y) * MAP + Math.floor(seed.x);
    seen.add(start); const queue = [start];
    for (let head = 0; head < queue.length && queue.length < 128; head++) {
      const at = queue[head], x = at % MAP, y = (at / MAP) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, index = ny * MAP + nx;
        if (!inside(nx, ny) || seen.has(index) || !this.burnable(this.cls[index])) continue;
        seen.add(index);
        if (this.random() < 0.83 && queue.length < 128) { queue.push(index); result.push({ x: nx + 0.5, y: ny + 0.5 }); }
      }
    }
    return result;
  }
}
