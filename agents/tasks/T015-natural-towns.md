# T015 · Natural town layouts (a central feature, not a grid)

Status: open
Module: `src/game/ext/townform/` · Tests: `tests/ext-townform.test.ts`
Spec by the lead, 2026-10-18. Read `agents/arena/INSTRUCTIONS.md` first.

## Why
The owner wants more natural starting towns: "there may be a central structure that forces the town from being built
in a grid, like next to a river or a hill." Today every town is `townGrid()` (`src/game/lots/seedtowns.ts`): a square
lattice of `BLOCK`-tile blocks with an avenue through the middle, legs dropped where the ground is not GROUND/PATCH.
Phase 6R step 7 also makes the towns start as **small seeds** (a few streets inside their footprint, about 150
residents) that grow later, so the seed's shape decides how the whole town grows.

## What to build
A generator of town street seeds shaped by what is around the site (the terrain classes `TC` in
`src/game/terrain/types.ts`, read through a `classAt(x, y)` callback, and a height callback if useful). Pick the form
from the site, deterministically by a seed:
1. **River town:** a main street along the bank (following the river's curve at a set distance), short side streets
   up from it, maybe one bridge leg across (return it flagged so the lead builds it as a bridge).
2. **Hill town:** streets that follow the contours around a hill (or a ring around its foot) with a few steep links
   straight up, a lookout or church at the top as the central structure.
3. **Crossroads town:** two country roads meeting at a green or market square; the streets radiate along them.
4. **Square / green town:** a central square (a block left open: return it as a reserved area) with streets around it
   and lanes leaving it at irregular angles.
5. **Linear (ribbon) town:** houses along one road through a valley, with a few short spurs.
The grid stays as one option for flat open sites, but rarer. Streets may bend (polyline legs; keep segments at least
4 tiles and angles the road tool accepts: 90° and 45° bends are safe, other angles are fine where the network allows
them, see `src/game/snap.ts` and `RoadNetwork.addLegs`).

Rules: every leg stays on GROUND/PATCH with its half width (as `landOk` checks), the seed fits inside the town's
footprint (`towns[k].size`, see `townCentres`), the seed's streets are local classes only (gravel, lane, street), no
dead ends shorter than one lot, everything is connected, and the result says **where the town wants to grow** (a few
growth directions or frontier legs for the town's own gravel growth).

## API
```ts
export type TownForm = 'river' | 'hill' | 'crossroads' | 'square' | 'ribbon' | 'grid';
export interface TownSeed { form: TownForm; legs: Leg[]; cls: ClassId[]; bridges: number[] /* indexes into legs */; reserved: { x0: number; y0: number; x1: number; y1: number; what: string }[]; growth: { from: Pt; dir: Pt }[]; centre: Pt /* the central structure */ }
export function pickForm(site: { x: number; y: number; size: number }, classAt: (x: number, y: number) => number, seed: number): TownForm;
export function townSeed(site: { x: number; y: number; size: number }, classAt: (x: number, y: number) => number, seed: number, form?: TownForm, scale?: 'seed' | 'full'): TownSeed;
```
`scale: 'seed'` is the small start (about 150 residents' worth of frontage); `'full'` is a grown town of today's size
(the stamp `TOWN_POP` = 1000), so the lead can use either.

## Tests and numbers
Each form on a fitting synthetic site (a river strip, a round hill, flat land) gives connected legs, all on buildable
ground, inside the footprint, with no crossing legs except at shared ends; `pickForm` picks river next to water and
hill next to a hill; deterministic by seed. In the PR: an SVG or PNG contact sheet of the six forms (draw the legs
over the terrain classes, as a test output under `output/`) and the frontage (lot count) of each seed.

## Integration notes expected
How `seedTowns` in `src/game/engine.ts` and `townGrid` are replaced, how the lot cutter (`src/game/lots/lots.ts`)
handles bent streets, and how the town's growth uses `growth`.
