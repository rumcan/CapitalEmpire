# T002 · Terrain v2: more hills and valleys

Status: open
Module: `src/game/ext/terrain2/` · Tests: `tests/ext-terrain2.test.ts`
Spec by the lead, 2026-10-18. Read `agents/arena/INSTRUCTIONS.md` first.

## Why
The owner wants **less empty flat land around the map edges and more hills and valleys everywhere**, so roads have to
follow the land instead of being laid in grids. Today's generator (`src/game/terrain/generate.ts`) makes a river valley
with mountain edges and a few buttes; too much of the middle and edges is flat.

## What to build
A second generator with the **same output type** as today's (`Terrain` in `src/game/terrain/types.ts`) so the lead can
switch to it with one line. Read `generate.ts` and `types.ts` and reuse their helpers by import where you can (noise,
flow, the class labelling) without editing them; copy what you must into your module.
- Rolling relief over the whole map: ridges, saddles, valleys of 300–800 m between hill bands; hills (TC.HILL) covering
  25–40% of the map; buildable land (GROUND/PATCH) 45–60%, in connected valley floors and gentle slopes.
- The river and creeks as today (rivers in valley floors), lakes allowed in basins.
- The map edges: no flat strip; mountains or hills reach the edge on at least 3 sides (the highway entry still finds a
  valley to come in by).
- The three town sites (`towns`, 64 x 64 fully buildable, 750–1500 tiles apart) and a start block still exist; the town
  sites sit in valley floors.
- Deterministic by seed; the same guarantees as `checkGuarantees` (export your own `checkGuarantees2` with the rules
  above added).

## API
```ts
export function generateTerrain2(seed: number): Terrain;
export function checkGuarantees2(t: Terrain): { ok: boolean; reasons: string[]; hill: number; buildable: number; edgeFlat: number };
```

## Tests and numbers to print
20 seeds pass `checkGuarantees2`; per seed the hill share, buildable share, the flat share of a 64-tile edge band, and the
generation time (under 4 s each on a dev PC). Determinism (same seed → identical `cls`). A PNG preview is welcome as an
extra script under `src/game/ext/terrain2/preview.ts` (writing into `output/`), not required.

## Integration notes expected
How the lead swaps it in (engine `genTerrain`, the harness `setupTowns`), anything the town grid/site placement needs.
