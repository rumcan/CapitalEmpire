# Capital Empire: progress

The living status of the project. Every session reads this first and updates it before it ends.
The full design is in [GAME-PLAN.md](GAME-PLAN.md); the working rules are in [../CLAUDE.md](../CLAUDE.md).

_Last updated: 2026-10-17, Phase 1 steps 1–4 done (generator, creeks, wiring, valley ground)._

## Where we are

| Phase | Status |
| --- | --- |
| 0. Scale foundation | **Done** (commit `88e64c4` plus the hand-off commit after it), local only, not pushed |
| 1. Terrain (maple valley for now) | **In progress.** Task list below |
| 2. Traffic core | Not started. The approach is decided (GAME-PLAN section 3.3) |
| 3. Lot Composer + growth | Not started |
| 4. Budget + bottleneck loop | Not started |
| 5. Road builder pro | Not started |
| 6. Vegas look + eras | Not started. The art track can start any time (GAME-PLAN section 4.1) |

## Decisions so far

- **Setting (changed 2026-10-17):** a sleepy **maple-wooded town valley for now**, because all the art is Maple
  Falls maple. The 1980s Las Vegas desert is deferred to a later re-skin (GAME-PLAN section 7, item 4). Terrain
  code stays setting-neutral; each setting maps the terrain classes to its own art.
- **Story:** you are a neural parasite farming humans for Universal Food Processing Inc.; jams stress the
  livestock and spoil the meat. Parasite coworkers (boy band producer, tele-evangelist, rom-com writer) cause the
  population booms. Full text in GAME-PLAN section 0; the new mechanics it suggests are in section 7, item 5.
- **Map:** 4 x 4 km (2048 tiles of 2 m).
- **Terrain:** seeded, fixed hills, valleys and rivers. Roads cross rivers with **bridges** and go through hills in
  **tunnels**.
- **Player control:** roads and traffic only. The city grows where traffic flows and stops where it jams.
  **Confirmed 2026-10-17:** the player never builds buildings; the "objects" build tool comes out (Phase 1
  step 3). The game allocates lots (residential, commercial, industrial, tourism, government) and builds them
  with rich generated layouts; the player picks growth options. GAME-PLAN sections 1.5 and 3.5.
- **Traffic:** must be very powerful and adaptive: edits take effect at once, routes react to congestion, and
  disruptions (tourism events, roadworks) are first-class. GAME-PLAN section 3.3.
- **Road builder UX:** Cities: Skylines and similar games are the reference, to win their players. GAME-PLAN
  section 3.2.
- **Closest zoom:** 30% (the town builder's 30%), at full art quality.
- **Roads stay instant:** no manual "rebuild ground" step, ever.
- **Traffic sim:** our own TypeScript IDM + MOBIL simulation in a worker. Treiber's traffic-simulation.de is the
  accuracy reference (GPL, so we implement the equations rather than copy its code). CityFlow and A/B Street (both
  Apache-2.0) are sources for design ideas. Details in GAME-PLAN section 3.3.
- **Workflow:** the lead model designs and reviews; Haiku 5.5 agents (`haiku-coder`, `haiku-runner`) do scoped
  coding and checks; slow checks run on the LAN worker PC; one chat per phase.

## Phase 0 results (what was built, and measured)

Built:
- Incremental road network: only touched nodes and routes rebuild. Spatial grids, lazy road litter (LRU cached),
  canonical route direction.
- Ground baking in 1–3 Web Workers. Edits are recorded as ops (`netops.ts`) and replayed in the workers. Textures
  are built once, shared with the other workers, and cached in IndexedDB.
- WebGL2 renderer: a texture-array sprite atlas (mips 0.6x to 0.0375x), a painter's order per draw tile, and
  per-instance clip rectangles, so a frame of sprites is one instanced draw. Test cars are merged into the order.
- Zoom tiers: full chunks (30%–10%), 4x4 lite district chunks (10%–3.5%), and the planner map (3.5%–0.6%) with
  cars as dots.
- Node asset pipeline (`scripts/assets/`) reading the TrickOrTreat export. Saves v3 (gzip in IndexedDB; old v2
  saves are moved into the map centre).
- Headless tests (`tests/network.test.ts`, 6 passing), the `?bench` 4 km city, and `scripts/perf/bench.mjs`
  (headless browser on the real GPU).

Benchmark: 4 km city, 394k props, 4,324 road segments, 10k test cars, on an AMD Radeon iGPU (headless Edge):

| Stage | dpr 1 (1600x900): fps / cpu avg / p95 ms | dpr 2 (3200x1800): fps / cpu avg / p95 ms |
| --- | --- | --- |
| Street 30% | 141 / 2.2 / 3.2 | 131 / 2.3 / 3.3 |
| Street 17% | 131 / 2.2 / 2.8 | 109 / 2.8 / 3.9 |
| District 8% | 142 / 2.9 / 3.6 | 137 / 3.3 / 4.5 |
| District 4.5% (29k sprites) | 137 / 4.8 / 6.8 | 122 / 5.9 / 8.4 |
| Planner 2% | 143 / 2.1 / 2.8 | 132 / 2.5 / 4.2 |
| Whole map 0.65% | 121 / 2.6 / 3.6 | 115 / 2.7 / 4.0 |

Other numbers:
- JS heap: about 225 MB.
- Full 4 km grid network: 156–180 ms to build. One road edit: about 1.6 ms. A chunk bake: about 20 ms.
- Startup: 8.9 s on the first visit (texture build) and 3.3 s after that (cache).
- Production build: a single 2.9 MB `dist/index.html`. It runs, with its inline workers.

## Known issues and backlog (carried forward)

- **Car colours change when a car turns.** The 4-facing sprites (`compact_n/e/s/w`) are four different cars.
  Fix in Phase 2 with cars rendered at 16 headings (TrickOrTreat's three.js pipeline).
- **No 45° or curve headings for cars yet** (same fix).
- **Cold start is 8.9 s.** Option: pre-bake the procedural ground textures into assets offline.
- **District 4.5% at dpr 2 has a p95 of 8.4 ms**, just over the 8 ms budget (the average is 5.9 ms).
- **The whole-map view draws 289 planner tiles.** Tiles outside the map diamond could be skipped.
- **The ground workers replay the whole network at load** (about 2 s at full size, in parallel with the main
  thread). Fine for now.
- **`SpriteTiles` has no unit tests.** The test bundle would need an esbuild loader for `.webp` imports.
- **The art is Maple Falls autumn (night),** which now matches the maple-valley setting. The desert art track is
  deferred with the desert re-skin (GAME-PLAN section 7, item 4).
- **The test traffic is a placeholder** (no car following, cars pass through each other). The real sim is Phase 2.
- **The terrain tool and its 7 Maple Falls terrain types still exist.** Phase 1 replaces them with generated
  desert terrain.

## Remote worker PC

| Item | Value |
| --- | --- |
| Host | `RAMPAGE@192.168.0.9` (Windows, Git Bash shell, 24 threads, Node 22, Chrome 155), SSH key only, LAN only |
| Alias on the dev PC | `cworker` in `~/.ssh/config`, key `~/.ssh/capital_worker_ed25519` (created 2026-10-17) |
| Clone on the worker | `/e/CapitalEmpire` (E: drive; C: is short of space), created by the first `scripts/worker/run.sh` |
| Usage | `scripts/worker/run.sh "npm test"`, `npm run worker:bench`, `scripts/worker/fetch.sh output/bench` |
| Rules | The worker clone is read-only: never commit or push from it. Rebooting the worker also stops its Hunyuan3D server. |

**Status: working (2026-10-17).** The dev PC's key is authorised. The first attempt was rejected; re-saving
`administrators_authorized_keys` as ASCII (PowerShell's `>>` writes UTF-16) and limiting it to Administrators and
SYSTEM (`icacls ... /inheritance:r`) fixed it. The first `npm run worker:test` created the clone: 6/6 tests pass, 26 s including `npm install`. `run.sh` sends a
snapshot of the local working tree, so uncommitted changes are tested too.

## Next: Phase 1, terrain (maple valley for now)

The goal and gate are in GAME-PLAN section 3.1 and the phase table in section 5. The setting changed to a maple
valley on 2026-10-17, so the art steps (4 and 5) use the Maple Falls art we already have. These are the steps, in
order; the ones marked **(haiku)** can be briefed to `haiku-coder`.

1. **Terrain data model and generator. DONE** (2026-10-17). `src/game/terrain/` (pure TS, no DOM):
   - `generateTerrain(seed)` gives a 256² height field (8 tiles per sample) and a 2048² class grid. The classes are
     setting-neutral: `TC` = GROUND 0, PATCH 1, HILL 2, WATER 3, CREEK 4, BANK 5. Each setting maps them to art.
   - Mountains/hills on 2–3 edges (ridged noise), buttes/knolls in the valley (domain-warped noise), and rock
     uplift terraced in 4 m steps (the terrace edges are where step 5 puts cliff or rock-edge pieces).
   - **The main river is D8**, folded in from step 2: priority-flood, steepest descent from the source edge to the
     opposite edge, Chaikin-smoothed, resampled every 8 tiles, 20–40 tiles wide. A guide trough and a tilt keep it
     crossing the valley. Where the source edge has mountains it cuts a gorge.
   - It also places the highway entry (a border tile on an edge with no mountains), a 64² start block (inset at
     least 64 tiles from the border, at most 320 tiles from the highway and 140 tiles from the water) and the
     chokepoints (the narrowest bridge site with flat banks, and the longest gorge).
   - `checkGuarantees(t)`: at least 55% of the map is buildable in the largest component with no hills (water
     counts as bridgeable); the river splits the buildable land with at least 15% on each side; the start block and
     highway are valid; at least one chokepoint. Up to 8 attempts with derived seeds, so the map still follows
     from the seed alone.
   - `tests/terrain.test.ts` (5 tests). `npm run terrain:preview [seeds]` writes PNGs to `output/terrain/`.
   - Measured on the worker: all 20 seeds pass, 18 on the first attempt (seeds 6 and 11 need one retry). Generate
     takes 356 ms on average and 661 ms at most (a retry). Buildable-and-connected is 55–71%.
   - Not wired in yet: the engine, the save (seed only) and the painter still use the old painted terrain
     (steps 3 and 4).
2. **Creeks. DONE** (2026-10-17). Up to 6 creeks per map, from heads at the foot of the hills down the D8 flow to
   the river (a dilated river mask), the map border, or another creek (the end is snapped onto that creek's final
   line). They have their own routing height (the river's height plus finer noise, so they wind instead of
   following D8 straight lines), a two-scale meander that fades at both ends, widths of 3–8 tiles from the
   accumulation, and are trimmed where they leave the hills. Class CREEK has no bank ring and only replaces
   GROUND/PATCH. A creek is dropped if it runs within 24 tiles of a border (except its last 48 tiles), and so are
   the creeks that join it. The split guarantee counts CREEK as land (culverts are cheap).
   - Worker: all 20 seeds pass; 4 need one retry (6, 10, 11, 17). Generate takes 319 ms on average, 593 ms at most.
     118–120 creeks over the 20 seeds.
   - Lesson: adding noise to the river's height field made the river miss the guide (9 of 12 retries had "river
     does not split the land"). Keep the river's field smooth, and put any detail in a separate creek field.
3. **Collision and wiring. DONE** (2026-10-17).
   - The engine generates the terrain from `game.seed` (`genTerrain`) and sends `terrain.cls` to the ground workers
     through the existing init message (cloning 4 MB is cheaper than regenerating in each worker).
   - "New town" picks a new random seed ("New valley (seed N)"); "Empty map" keeps the seed.
   - **Save v4** stores the seed and no terrain. v3 saves are converted (their painted terrain is dropped; seed
     `d.seed ?? 1`), and v2 migrates with seed 1.
   - **Collision** is a terrain check in the engine, not in the road occupancy grid (whose codes are road codes):
     - roads refuse HILL and WATER until bridges and tunnels exist; CREEK (culverts) and BANK (riverside roads) are
       allowed;
     - props (`canPlace`) refuse HILL, WATER, CREEK and BANK.
   - The starter town is centred on the generated start block, skipping roads that would cross blocked terrain;
     the camera starts there.
   - The painter maps the classes to placeholder textures until step 4: GROUND grass, PATCH meadow, HILL dirt,
     WATER gravel, CREEK field, BANK dirt. The planner already has proper class colours.
   - **The Build (objects) and Terrain tools are gone** (UI, keys B/T/F, prop dragging). The game still places
     props itself (starter town, lamps, auto trees).
   - Checked in a headless browser: the valley, river and creeks show in the planner; the starter town sits by the
     river; no console errors. Throwaway screenshot script: `output/look/look.mjs` (gitignored).
   - **Worker benchmark** (`npm run worker:bench`, RTX 3080, 1600x900 dpr 1, vsync caps at 60 fps), as fps / cpu
     avg / p95 ms: Street 30% 60 / 0.81 / 1.0; Street 17% 60 / 0.91 / 1.1; District 8% 60 / 1.27 / 1.4; District
     4.5% 60 / 2.41 / 3.6; Planner 2% 60 / 0.84 / 1.0; Whole map 60 / 0.93 / 1.1. Heap 215 MB. This is the new
     baseline (the Phase 0 table was the laptop's AMD iGPU).
   - Left over: the Select panel still has Bigger/Smaller for props (remove it with the step 4 UI pass); the
     starter town's layout is fixed, so on some seeds a few of its roads are skipped; roads in old saves are not
     checked against the new terrain.
4. **Maple valley ground. DONE** (2026-10-17).
   - New screen-space textures in `textures.ts`: forest floor (leaf litter, twigs), river water (ripples), wet bank
     (silt, pebbles, reed tufts), creek bed (stones). `TEX_VERSION` is `tex-2`.
   - The workers now get the height field and the waterways too (`init` and a full `terrain` message;
     `GroundPainter.setTerrain`). Pure helpers in `src/game/terrain-paint.ts` (tested in
     `tests/terrain-paint.test.ts`): `shadeField` (hillshade per height sample, light from the screen top-left),
     `shadeRGBA`, `classAlpha` (blurred class coverage plus noise, so class edges are soft and organic) and
     `waterShape` (tapered capsules between the smoothed waterway points, all wound the same way).
   - Paint order: grass; meadow (PATCH) and forest floor (HILL) through the soft class masks; river banks
     (3 tiles, feathered) and creek beds with a thin water line from the polylines; the hillshade; the river water.
     Feathering is 4 nested shapes added with `lighter`. No 2 m staircase anywhere.
   - The planner uses the textures' mean colours (20% desaturated), the waterway shapes and the hillshade.
   - Worker bench: Street 30% 60 / 0.72 / 0.8; Street 17% 60 / 0.79 / 0.9; District 8% 60 / 1.15 / 1.4; District
     4.5% 59.9 / 2.26 / 4.5; Planner 2% 56.7 / 1.03 / 1.5; Whole map 60 / 0.97 / 1.2. Heap 228 MB. Average chunk
     bake 16.9 ms (541 bakes). 16/16 tests.
   - Watch: the first worker bench run never reported ready within 240 s (no page errors); the retry was fine.
     If it happens again, look at the cold texture build in a fresh profile.
   - Screenshots: `look.mjs` at the repo root (git-excluded via `.git/info/exclude`; a copy of
     `output/look/look.mjs` that also shoots the river, a creek and a hill) writes `output/look/s4-*.png`.
5. **Hills as forest** (lead decides). Cover HILL with dense maple-tree sprites from the existing atlas (the forest
   reads as raised ground at 30%), plus placeholder rock-edge pieces along the 4 m terrace edges. They are
   depth-sorted like buildings and cannot be bulldozed. Watch the visible-instance budget (60k at the Street tier).
6. **Bridges and tunnels in the road tool** (lead designs; haiku implements):
   - segment flags, with cost per metre;
   - a bridge deck, piers and railings over water;
   - tunnel portals, with the underground run not painted;
   - network ops and save support.
7. **Highway entry** at the map edge: the generator already picks the point; build the road from it.
8. **Gate:** 20 seeds pass the generator tests; a road can cross a river and a hill; benchmark budgets still met
   (run `haiku-runner`).

Update this file after each step.
