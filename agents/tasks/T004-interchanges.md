# T004 · Highway interchanges (geometry generator)

Status: in review (#3)
Module: `src/game/ext/interchange/` · Tests: `tests/ext-interchange.test.ts`
Spec by the lead, 2026-10-18. Read `agents/arena/INSTRUCTIONS.md` first.

## Why
The owner wants **complex highway intersections** (as in Cities: Skylines). The player picks a type at a crossing of two
roads and the game lays the ramps.

## What to build
Given two road centre lines that cross (or a highway and a road), their classes (lane counts, one-way or two-way), and a
type, return the **ramps** as polylines in tiles with an elevation profile each (reuse T003's `Profile` shape), plus which
road goes over: `diamond`, `parclo` (partial cloverleaf), `cloverleaf`, `trumpet` (for a T), `stack` (four-level),
`roundabout-interchange` (a roundabout under the highway). Ramp radii at least 50 m for loops, 150 m for flyovers;
merge/diverge tapers 60 m; weaving between cloverleaf loops at least 150 m.

## API
```ts
export type InterchangeType = 'diamond' | 'parclo' | 'cloverleaf' | 'trumpet' | 'stack' | 'roundabout-interchange';
export interface RoadSpec { pts: Pt[]; lanes: number; oneWay: boolean }
export interface Ramp { pts: Pt[]; z: number[]; from: 'A' | 'B'; to: 'A' | 'B'; turn: 'L' | 'R'; lanes: number }
export interface Interchange { type: InterchangeType; over: 'A' | 'B'; ramps: Ramp[]; footprint: Pt[]; ok: boolean; why: string }
export function makeInterchange(A: RoadSpec, B: RoadSpec, type: InterchangeType): Interchange;
```

## Tests and numbers
Each type on a right-angle crossing: every movement (A→B both ways, B→A both ways) has a ramp, radii and tapers meet the
minimums, ramps do not cross at the same level, the footprint; a 60° crossing; a too-tight case (not ok). Print the
footprint size of each type.

## Integration notes expected
How the lead turns ramps into network segs and lane graph lanes (one-way ramps; merge and diverge nodes), and draws them.
