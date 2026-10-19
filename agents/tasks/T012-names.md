# T012 · Road, town and place names

Status: in review (#9)
Module: `src/game/ext/names/` · Tests: `tests/ext-names.test.ts`
Spec by the lead, 2026-10-18. Read `agents/arena/INSTRUCTIONS.md` first.

## Why
Named towns, streets, avenues, highways, bridges, stations and businesses make the map feel lived in (the HUD, the
bottleneck list "Maple Ave & 3rd St", the toasts).

## What to build
Seeded generators for a small-town North American setting (the art is a maple-wooded valley; the theme may change later,
so keep the word lists in data files per setting): town names, street names by class (lane/street: tree and local
names; road: "County Road 12"; avenue/boulevard: "Maple Avenue"; arterial: "Route 9"; highway: "I-84"), numbered grids
("3rd Street"), bridge and tunnel names, station names (from the nearest street or landmark), business names by type
("Riverside Stadium", "Bass Lake Tackle"). No repeats within a map; stable for the same seed and inputs; a junction name
from its two biggest roads ("Maple Ave & 3rd St").

## API
```ts
export class Names {
  constructor(seed: number, setting?: 'maple-valley');
  town(i: number): string;
  road(key: string, cls: string, nearTown?: string): string;
  junction(roadNames: string[]): string;
  bridge(roadName: string, overWater: boolean): string;
  station(nearest: string): string;
  business(type: string, place: string): string;
}
```

## Tests and numbers
No duplicate road names in 2,000 draws per town; stable for the same keys; junction names order the bigger road first.
Print 20 samples of each.

## Integration notes expected
Where the lead shows names (the HUD, the bottleneck list, labels on the map at district zoom), the save (only the seed).
