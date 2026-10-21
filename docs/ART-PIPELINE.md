# The art pipeline: TrickOrTreat art into Capital Empire

How the game's sprites, ground art, baked house lots and townspeople are made, the owner's tool for fixing them, and the
owner's rules for how lots must look. TrickOrTreat (`../TrickOrTreat`, or `TOT_REPO`) is a **read-only** source: never write
to it, least of all its `output/town-builder/` (the owner's painted town and builder library).

## The asset steps (`scripts/assets/`)

| Step | What it makes | Time |
| --- | --- | --- |
| `prep-ground.mjs` | `src/assets/ground/*` + `src/game/ground-art.ts`: asphalt, curbs, slabs, grass bases, leaves, the builder's grass/leaf decals (`decals.webp`), bare soil, car-park asphalt | ~1 min |
| `prep-decals.mjs` | `lot-decals.webp` + `src/game/lot-decals.ts`: the flat decals the composer lays in lots (leaf drifts, worn grass, litter, oil, mud) | seconds |
| `nature-patches.mjs` | `nature.webp` + `src/game/nature-patches.ts`: 10 baked 16 m patches (leafy, wild, mossy, bare, golden) the ground painter scatters over open grass | ~30 s |
| `prep-sprites.mjs` | the atlas (`src/assets/atlas/`, 15 pages x 5 mips) + `src/game/library.ts`: every upright TrickOrTreat sprite, the baked house lots, the 40 townspeople's walk frames | ~20 min |
| `prep-scales.mjs` | `src/game/lots/scales.ts` (OWNER_SCALE): the owner's map scale (plus studio overrides) for each packed id | seconds |
| `audit-sprites.mjs` | the check: sprites stretched past their atlas pixels at the closest zoom (want 0), TrickOrTreat sprites the game lacks | seconds |

Full rebuild, from the checkout: `export TOT_REPO="C:/Work Admin/PERSONAL/Repos/TrickOrTreat"` (not needed from the main
checkout), then `node scripts/assets/prep-sprites.mjs && node scripts/assets/prep-scales.mjs && node scripts/assets/audit-sprites.mjs`.
The sprite studio's **Rebuild** button runs all of these. While prep-sprites runs, `src/assets/atlas/` is empty: the game and
`npm test` cannot build until it finishes.

### Resolution
The game's closest zoom is 30% on a dpr-2 screen, so mip 0 is 0.6 px per native px. Each sprite is packed at 0.6 x the
largest scale the game draws it at (the owner's map scale + 5% composer jitter, forest trees 1.5), capped by its painted
source, so nothing is stretched. Townspeople are drawn at half their art size (128 px/m art, 64 px/m game).
GPU cost: 15 pages = about 336 MB with mips at dpr 2 (GAME-PLAN 2.3 budgets 96 MB: the owner has not decided yet).

## Generated textures and the golf art (2026-10-21)
- **Photo ground textures** come from the RUN.world CLI (`rundot`, signed in; the TrickOrTreat game's id) through
  `scripts/assets/gen-grass-photos.mjs` (branch `claude/paint-wip`): the owner's three grass photos (`art/grass-photo/`) as
  references, one subject per texture, output in the git-ignored `output/grass-gen/`. Each generation is removed from RUN's
  library once downloaded (the 1 GB cap). `scripts/assets/prep-photo-grass.mjs` packs a chosen take into `src/assets/ground/`
  at full resolution.
- **Limits learned:** the model on the owner's plan (`gemini-3.1-flash-image-preview`, 120 credits) makes 1024 x 1024 images;
  the 2K/4K model is not on the plan. So a texture stands for a small patch (2–8 m) and is hex-mixed over large areas. The
  safety filter gives false positives on some wording ("a photograph shot straight down", "asphalt road surface", "crushed
  stone"): reword and retry.
- **The golf sprites** to make are listed in [GOLF-SPRITES.md](GOLF-SPRITES.md) (camera, facings, sizes, priorities). They go
  through TrickOrTreat's sheet runner like every other sprite, then `prep-sprites.mjs`. The whole-hole golf sprites are retired
  in golf mode (the holes are painted).

## Baked house lots (`lot-layout.mjs`, `lot-variants.mjs`, `lot-render.mjs`)
A residential lot is ONE sprite: the house, yard, plants and ground decals rendered with the builder's own drawing rules
(`lot-render.mjs`: screen = ((X - Y) * 32, (X + Y) * 16) px per metre, sprites by their library anchor, flats then shadows
then uprights back to front). `lot-variants.mjs` makes 16 variants for the town's 8 x 15-tile lot (10 front-facing, 6 rear,
each a different house); the composer (`src/game/lots/compose.ts` `baked()`) places one per RES lot, the variant by the lot's
slot along its street so neighbours differ, the neglected variants from decline 2.

**The fences are not in the lot pictures.** `compose.ts` `fenceLayer()` draws the fence grid as its own props on the lot
lines (each lot owns its a = 0 side line and, when n points to +X/+Y, its back line; side fences stop 7.3 m from the front
on every lot so they meet), with planting along both faces and leaf drifts at the bases.

## The owner's rules for lots (from their review, 2026-10-20)
- Measure everything against the owner's Maple Falls map (`output/lotstudy/` scripts show how: per-house inventory, renders).
- Houses, trees and cars are picked **by rule** from the builder library (category, role, `facing` tag), so new art is used as
  soon as TrickOrTreat has it; square-on views (`facing:south`/`facing:north`) are left out. Deal them from shuffled decks:
  never the same house, tree or car twice in a block.
- Sizes are the owner's map scales (`places-v5/scales.json`), never blanket ranges; footprints are `fw`/`fh` (tiles: half
  extents in metres), because some `base` boxes have their axes swapped. A house too wide for a side drive gets a front drive;
  one too wide for the lot is not used on it.
- Parked cars are the size of the cars on the road (CAR_SCALE 0.8).
- Every flat decal has a **scenario** in `lot-layout.mjs` `SCENARIOS` tied to something real (pinecones under pines, oil under
  the car, leaves against fences...) and scaled by the lot's size; `coverage()` lists any decal with neither a scenario nor an
  `EXCLUDED` reason (must be none).
- Fill the grass: plants, young trees and nature clusters in every open patch; big nature patches across open land.
- Commercial lots: asphalt all over, sidewalk slabs in front of the building.

## The sprite studio (`scripts/assets/review/`)
`node scripts/assets/review/server.mjs --port 5179`, then http://127.0.0.1:5179/ — the owner's screen:
- **Library**: every sprite as the game has it, at true relative size (zoom slider), the pointer a townsperson at the same
  scale (feet on the pointer). Smaller/Bigger -> `scale-overrides.json`; Remove/Restore -> `removed.json`.
- **Lots**: click a sprite in a baked lot to move (0.25 m), resize, mirror or delete it there -> `lot-edits.json`.
- **People**: each townsperson's walk rows animated; click a frame to fix it -> `walker-fixes.json` (codes parsed by
  `walker-fix.mjs`): `mirror`; `use:<k>` / `use-mirror:<k>` (another frame of the row); `use:<DIR>:<k>` / `use-mirror:<DIR>:<k>`
  (a frame of another facing); `new` (a new frame is needed: drop its picture in the popover, saved to
  `walker-frames/<person>/<DIR>-<k>.png`, contain-fitted to the frame cell at the pack; with no picture the pack keeps the old frame
  and logs it). The "Walk frames needing new art" line lists every `new` frame.
- **Rebuild**: runs the asset steps. Every step reads these files (`overrides.mjs`, `removed.mjs`).

## Townspeople (`src/game/ext/pedestrians/`)
Seeded walkers on the town sidewalks: each has a home door and walks to a place (shops, work, civic, venues: built lots'
frontages) and back, entering and leaving only through doors; road edits keep walkers on unchanged sidewalks. Drawn as
movers at the Street tier (engine `updatePeds` / `pedMovers`). The generated walk sheets have wrong-way frames (the SE row's
frames 3-4 on most adults): fixed per frame in `walker-fixes.json`.
