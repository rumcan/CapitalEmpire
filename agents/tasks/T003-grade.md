# T003 · Grade separation: bridges and tunnels over and under roads

Status: open
Module: `src/game/ext/grade/` · Tests: `tests/ext-grade.test.ts`
Spec by the lead, 2026-10-18. Read `agents/arena/INSTRUCTIONS.md` first.

## What it is in the game
The player can build **grade-separated crossings** where roads cross without a junction: an **overpass** (a bridge deck over the road below) and an **underpass** (a short tunnel under the road above). On the current map river bridges and hill tunnels are terrain-driven (they exist because of water/hills). This module adds the **road-over-road** kind: a bridge that exists because another road is underneath, and a tunnel that exists because another road is on top. The lead wires it in afterwards: the elevation keys (Page Up/Down) in the road tool, the drawing (decks, pillars, portals, shadows, ramp shading), the lane graph (no junction, no signal, no conflicts where grade-separated), the traffic sim (vehicles pass over/under without yielding), the costs and the save.

## Units
Positions in **tiles** (1 tile = 2 m; the map is 2048 x 2048 tiles, `MAP` in `src/game/iso.ts`). Lengths in tiles, vertical clearance in tiles (1 tile = 2 m). Time in sim seconds only where needed. Money in $.

## Model (keep it simple and deterministic)
- **Elevation:** each road segment has an elevation `z` in levels: `-1` = tunnel/underpass (below ground), `0` = ground (default), `1` = bridge/overpass (above ground), `2` = high bridge (optional second deck). A segment is straight between its two end points `a` and `b` (tiles). Its `kind` is `SK.GROUND` / `SK.BRIDGE` / `SK.TUNNEL` from `src/game/network.ts` for saving; `z` is the logical level (a bridge over a road is `kind = SK.BRIDGE` and `z = 1`; a tunnel under a road is `kind = SK.TUNNEL` and `z = -1`; ground is both `SK.GROUND` and `z = 0`).
- **Ramps:** a road that changes elevation does so on a ramp between two segments of different `z` that share an endpoint. The ramp length must satisfy a max grade of 6 % (0.06). Clearance from the lower road surface to the bottom of the deck above is 2.75 tiles (5.5 m — truck clearance). So a rise of one level needs at least `CLEARANCE_TILES / MAX_GRADE ≈ 45.83` tiles (≈ 92 m) of ramp. Two levels need twice that. A segment that is shorter than its required ramp is invalid (the road tool refuses it).
- **Crossings:** two segments whose interiors intersect in 2D form a crossing at point `(x, y)`. If they have the same `z` it is **at-grade**: the network builds a junction node there (with signals/conflicts as now). If they have different `z` it is **grade-separated**: no junction, no conflicts, one passes over/under the other. The module detects all interior crossings, classifies them, and reports which pairs are separated.
- **Structures:** an overpass segment is a bridge deck: it has a deck polygon (centreline + half width), pillars every ~15 tiles (cost extra), a shadow cast on the ground. An underpass segment is a short cut-and-cover tunnel: a portal at each end, a shadow/retaining wall, and a dashed planner line underground. A ramp is the transition piece between elevations (either end on ground or bridge/tunnel). For the sim and renderer the module reports the structure extents.
- **Costs** (the lead tunes later; export them as constants): ground $150 per tile, overpass/bridge $600 per tile, underpass/tunnel $900 per tile, ramp surcharge $200 per tile of ramp (on top of the per-tile kind cost), pillar $2,000 each, portal $5,000 each, upkeep 1 % of build cost per game day (1,440 sim s).
- **Limits** (export as constants): max single bridge span 150 tiles (300 m), max single tunnel/underpass length 300 tiles (600 m). Abutment 1.5 tiles at each bridge end where it meets ground (like terrain bridges). Short ground gaps under 3 tiles between equal elevated structures are absorbed (as in `splitByTerrain`).

## API (keep these names; add more if useful)
```ts
export type Elevation = -1 | 0 | 1 | 2;
export type SegKind = 0 | 1 | 2; // re-export SK.GROUND | SK.BRIDGE | SK.TUNNEL for convenience
export interface GradeSegment { id: number; a: Pt; b: Pt; elevation: Elevation; kind: SegKind }
export interface Crossing { id: number; a: number; b: number; x: number; y: number; separated: boolean; clearance: number }
export interface RampInfo { seg: number; rise: number; need: number; ok: boolean }
export interface SpanInfo { seg: number; kind: SegKind; length: number; ok: boolean }
export interface GradeView {
  decks: { id: number; pts: Pt[]; hw: number; elevation: Elevation }[];
  pillars: { x: number; y: number; seg: number }[];
  portals: { x: number; y: number; dir: Pt; seg: number }[];
  crossings: Crossing[];
  ramps: RampInfo[];
}
export const GROUND_COST_PER_TILE: number, BRIDGE_COST_PER_TILE: number, TUNNEL_COST_PER_TILE: number;
export const RAMP_COST_PER_TILE: number, PILLAR_COST: number, PORTAL_COST: number, UPKEEP_RATE: number;
export const CLEARANCE_TILES: number, MAX_GRADE: number, MAX_BRIDGE_SPAN: number, MAX_TUNNEL_LENGTH: number;
export const ABUTMENT: number, PILLAR_SPACING: number;

/** pure helpers (no state, deterministic, allocation-free where noted) */
export function segLength(s: GradeSegment): number;
export function rampLength(deltaLevels: number): number; // tiles needed for this rise at MAX_GRADE
export function segmentCost(seg: GradeSegment): number; // per-tile cost including kind; ramp surcharge added by caller if it is a ramp
export function buildCost(segments: GradeSegment[]): number; // stations + bridges + tunnels + pillars + portals + ramp surcharge
export function detectCrossings(segments: GradeSegment[]): Crossing[]; // interior crossings only
export function classifyCrossings(segments: GradeSegment[], crossings: Crossing[]): Crossing[]; // sets separated by elevation
export function validateRamps(segments: GradeSegment[]): RampInfo[]; // every segment checked as potential ramp
export function validateSpans(segments: GradeSegment[]): SpanInfo[]; // max span check per continuous run of same kind

export class GradeSeparation {
  constructor(seed?: number);
  /** replace the network (a segment added/removed/changed): crossings recomputed, pillars/portals re-placed deterministically */
  setNetwork(segments: GradeSegment[]): void;
  /** add or update one segment (incremental) */
  setSegment(seg: GradeSegment): void;
  /** remove a segment by id */
  removeSegment(id: number): void;
  /** all segments in the network */
  getSegments(): GradeSegment[];
  /** interior crossings, with separated flag */
  getCrossings(): Crossing[];
  /** true when segments a and b are grade-separated (different z and their interiors cross, or they are connected via a ramp chain) */
  isSeparated(a: number, b: number): boolean;
  /** total build cost including pillars/portals/ramps */
  cost(): number;
  /** upkeep per game day */
  upkeepPerDay(): number;
  /** validation errors (empty = valid): ramp too steep, span too long, tunnel too long */
  validate(): string[];
  /** what the renderer and lane builder consume (reuse objects between calls where possible) */
  view(): GradeView;
  /** summary for the panel */
  stats(): { segments: number; overpasses: number; underpasses: number; crossings: number; separated: number; atGrade: number };
}
```

## Tests (`tests/ext-grade.test.ts`) and the numbers to print
1. **At-grade crossing:** two ground segments crossing at (50,50): 1 crossing detected, `separated = false` (needs a junction).
2. **Overpass:** one ground east-west, one bridge north-south over (50,50): 1 crossing, `separated = true` (no junction). Same for tunnel under.
3. **Ramp length:** one level needs ~45.83 tiles at 6 %; two levels ~91.66 tiles. A 10-tile ramp for one level is invalid; a 50-tile ramp is valid (print both).
4. **Cost:** a known network: 2 ground 20 tiles each + 1 bridge 15 tiles with 1 pillar + ramp 50 tiles: print `buildCost` and hand-check pillars/portals/ramp surcharge.
5. **Span limits:** a continuous bridge run of 160 tiles (>150) fails validation; 300-tile tunnel is at the limit and passes; 301 fails.
6. **Overpass over many roads:** one bridge over 5 parallel ground roads: 5 crossings, all separated, no false at-grade.
7. **Underpass / high bridge:** tunnel under + high bridge (z=2) over ground: crossings correctly separated regardless of top vs bottom; at-grade only when `z` equal.
8. **Determinism:** two identical `GradeSeparation` instances with same seed give identical crossings, pillars, portals, and cost.
9. **Performance:** 200 segments in a grid: print `detectCrossings` time; `cost()`/`validate()` under 0.5 ms per call at this scale (print measured times). Include the 20x20 grid stress (400 segs) for information.

## Integration notes the lead expects in the PR
Where the elevation comes from (the road tool's Page Up/Down raising `z` and `kind`; a node with arms of mixed `z` is a ramp foot), how `getCrossings()`/`isSeparated()` feeds the network rebuild (skip creating a Node at separated crossings; keep junctions only at at-grade crossings), what the lane graph does with `view()` (decks are lanes at height, no conflicts with ground `next`/`prev`, tunnel lanes hidden), what the renderer draws per frame (`decks`, `pillars`, `portals`, their sizes and how often they change), and the save shape (`GradeSegment[]` is enough; crossings are derived).

## Notes
- Reuse `Pt` from `src/game/network.ts` and `MAP`/`mulberry` from `src/game/iso.ts` if useful; do not import DOM/React/WebGL globals.
- Keep per-step work allocation-free (the sim calls `isSeparated` and `view` every frame only indirectly; the lane graph consumes crossings once per rebuild).
- No new npm dependencies. Deterministic: seed the pillar jitter with `mulberry`.
