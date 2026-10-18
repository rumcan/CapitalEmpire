# T005 · Dirt roads and farm lots

Status: open
Module: `src/game/ext/farms/` · Tests: `tests/ext-farms.test.ts`
Spec by the lead, 2026-10-18. Read `agents/arena/INSTRUCTIONS.md` first.

## Why
The owner wants **farm lots next to roads** (and dirt roads), so the countryside between towns is farmland with houses
along the road, not empty grass. Town lots are composed by `src/game/lots/compose.ts` (read it: the output shape is
`Composition { props, ground }`); farms need their own, much bigger lots.

## What to build
1. **Farm parcels along a road:** given a road seg (`a`, `b`, its class half width) and the terrain classes, cut deep
   rural parcels on both sides: frontage 60–160 m (30–80 tiles), depth 120–300 m, following the road, skipping hills,
   water and steep land (TC.HILL, WATER, CREEK, BANK), never overlapping each other.
2. **A farm composition per parcel** (deterministic by a seed): a farmhouse and barn cluster near the road with a drive,
   fields as ground patches (crop rows as `lines`, pasture, orchard), fences along the parcel edges, a few trees, maybe a
   silo. Use only prop ids that exist in `src/game/library.ts` (search it for barn, silo, fence, tree, farmhouse, hay; if
   something is missing, list it in the PR as art to make). Field textures: use the LotPatch `tex` values that exist
   (`field`, `dirt`, `gravel`...).
3. **Dirt roads:** a helper that lays a farm track (a dirt road leg) from the farmhouse cluster back into the fields, as
   legs the lead can add with a `dirt` class later (just return the legs).

## API
```ts
export interface FarmParcel { key: string; o: Pt; u: Pt; n: Pt; w: number; d: number /* tiles */; side: 1 | -1 }
export function farmParcels(seg: { a: Pt; b: Pt; h: number }, cls: Uint8Array /* terrain classes, MAP x MAP */, seed: number): FarmParcel[];
export function composeFarm(p: FarmParcel, seed: number): Composition; // import the type from src/game/lots/compose.ts
export function farmTrack(p: FarmParcel, seed: number): { a: Pt; b: Pt }[];
```

## Tests and numbers
Parcels never overlap, never cover hill/water, stay on their side of the road; 100 seeded farms compose without props
overlapping each other or the road corridor; deterministic. Print parcels per km of road and props per farm.

## Integration notes expected
Where farms go (roads outside towns), how the town's growth should treat farm parcels, the props and textures used.
