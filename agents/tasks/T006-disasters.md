# T006 · Natural disasters

Status: open
Module: `src/game/ext/disasters/` · Tests: `tests/ext-disasters.test.ts`
Spec by the lead, 2026-10-18. Read `agents/arena/INSTRUCTIONS.md` first.

## Why
Occasional disasters test the player's network: a flood closes the river crossings, a storm blocks roads with fallen
trees, a landslide cuts a hill road, a wildfire, an earthquake damages bridges. The player reroutes, repairs, builds
redundancy.

## What to build (a scheduler and an effects model; no rendering, no sim changes)
- **Kinds:** `flood` (rises along rivers: closes bridges and low roads near water for hours), `storm` (random roads in an
  area blocked by debris), `landslide` (roads on steep hill edges), `wildfire` (spreads over PATCH/forest cells near
  roads; closes them while burning), `quake` (bridges and tunnels damaged: closed until repaired).
- **A scheduler:** seeded; a risk per kind per game day that grows with the map (river length for floods, hill road
  length for landslides); never two disasters at once; a warning lead time for floods and storms.
- **Effects:** a list of closures (`segKey`s or areas) with start, end (or `repair` needed with a cost), and the area
  drawn (circle/polygon) for the renderer.

## API
```ts
export type DisasterKind = 'flood' | 'storm' | 'landslide' | 'wildfire' | 'quake';
export interface RoadInfo { key: string; a: Pt; b: Pt; kind: 'ground' | 'bridge' | 'tunnel'; nearWater: number /* tiles */; slope: number }
export interface Disaster { id: number; kind: DisasterKind; warnAt: number; start: number; end: number; area: Pt[]; closures: { key: string; until: number | 'repair'; repairCost: number }[] }
export class Disasters {
  constructor(seed: number, terrainCls: Uint8Array, heights: (x: number, y: number) => number);
  /** advance the clock (game seconds) with the roads as they are now; returns the disasters that warned, started or ended */
  step(t: number, roads: RoadInfo[]): { warned: Disaster[]; started: Disaster[]; ended: Disaster[] };
  repair(disaster: number, key: string): void;
  active(): Disaster[];
}
```

## Tests and numbers
Determinism; risk rates (over 1,000 simulated game days per kind: the counts), floods close only roads near water,
landslides only on slopes, a quake closes bridges until repaired, wildfire spread stays within burnable cells. Print the
mean days between disasters per kind.

## Integration notes expected
How the lead closes lanes in the sim (closures by seg key), the HUD warnings, the repair tool, the overlay drawing.
