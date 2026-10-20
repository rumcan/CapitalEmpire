# Capital Empire: progress

The living status of the project. Every session reads this first and updates it before it ends.
The full design is in [GAME-PLAN.md](GAME-PLAN.md); the working rules are in [../CLAUDE.md](../CLAUDE.md).

_Last updated: 2026-10-20 afternoon (B.3 daily visit businesses, B.4 tickets and cards, B.5 bus and taxi companies); before that 2026-10-19 evening, paint branch (the Paint tool: ground areas, docs/PAINT-TOOL.md); before that 2026-10-19 late night (Phase B started: docs/BUSINESSES.md, B.1 the player places the stadium); before that 2026-10-19 night (road builder stress test and its fixes, junction preview); before that 2026-10-19 evening (rings at awkward joins, road Replace mode, lane look-ahead); before that 2026-10-19 afternoon (3-lane ring fixes, lots and town roads clear of rings, dev unlock-all); before that 2026-10-19 morning (all ten Arena PRs merged; disasters and farms wired); before that 2026-10-18 night: Phase 6R in progress; approach flares done; Arena PRs #1 and #2 reviewed (changes requested). Pushed to origin at `21f2092`._

## Where we are

| Phase | Status |
| --- | --- |
| 0. Scale foundation | **Done** (commit `88e64c4` plus the hand-off commit after it), pushed to origin 2026-10-17 |
| 1. Terrain (maple valley for now) | **Done** (2026-10-17), pushed to origin. Steps and numbers below |
| 2. Traffic core | **Done** (2026-10-18), pushed to origin 2026-10-18. Steps, numbers and the gate below |
| 3. Lot Composer + growth | **Done** (2026-10-18), pushed to origin 2026-10-18; the contact sheets wait for the owner's review |
| 4. Budget + bottleneck loop | **Done** (2026-10-18), pushed to origin 2026-10-18. Steps, numbers and the gate below |
| 5. Event round MVP: the stadium (v4, 2026-10-18) | **Done** (2026-10-18; the gate passed on seed 1), not pushed (the owner is away). Steps, numbers and the gate below |
| 6. Expansion (new events, overlapping networks) | **Paused** after its step 1 (actuated signals): the owner put the roads first (Phase 6R below) |
| 6R. Roads first (catalogue, one-way, junction editor, roundabouts, snapping, towns as seeds, terrain) | **In progress** (the owner's direction, 2026-10-18 evening) |
| B. The businesses (GAME-PLAN 1.0.00; design in [BUSINESSES.md](BUSINESSES.md)) | **In progress** (started 2026-10-19 late night): B.1-B.5 done (the player places the stadium; the catalogue and tree; daily visit businesses; tickets, business cards and unlock toasts; the bus and taxi companies). Comes before 6R.5–6R.8 (the owner's order) |
| UI. The Maple Falls look (the owner's mockup, [docs/ui/](ui/)) | **Step 1 done** (2026-10-20): icons, top bar, rail, road panel, hint bar. Open: minimap, event card picture. Section below |
| 7. Road builder pro | Not started (its lane, turn-widening and turn-lane tools move to Phase 5) |
| 8. Look + eras | Not started. The art track can start any time; the stadium, the Toll Gate, car parks and buses come first |
| Paint tool (ground areas; design in [PAINT-TOOL.md](PAINT-TOOL.md)) | **Done** (2026-10-19, branch `claude/frosty-wilson-452c74`, merged up to main `3311ce9`; not yet merged into main, not pushed). Section below |

## Decisions so far

- **Setting (changed 2026-10-17):** a sleepy **maple-wooded town valley for now**, because all the art is Maple
  Falls maple. The 1980s Las Vegas desert is deferred to a later re-skin (GAME-PLAN section 7, item 4). Terrain
  code stays setting-neutral; each setting maps the terrain classes to its own art.
- **Theme (changed 2026-10-18):** none for now. The alien-parasite story is dropped; the theme comes at the end and is
  written to fit the final gameplay. A direction being explored (not decided): you add a business that makes a town
  boom, new towns pop up, and the traffic between towns becomes a logistics layer. GAME-PLAN section 0.
- **Map:** 4 x 4 km (2048 tiles of 2 m).
- **Terrain:** seeded, fixed hills, valleys and rivers. Roads cross rivers with **bridges** and go through hills in
  **tunnels**.
- **Core loop (v4, 2026-10-18): event rounds.** (1) The 10-minute build: an event (a Level 1 sports stadium) drops
  onto the map, placed by the game; the player connects the surrounding autonomous towns to it, routes all the event
  traffic through a **Toll Gate (the only income)** into a sprawling parking lot, and draws a shuttle bus route to the
  doors. (2) The live stress test: the surge runs in real time and the player pays from the toll revenue to fix
  bottlenecks live (add a lane, widen a turn, a bypass). (3) Draft and expand: the evaluation (arrival rate),
  permanent upgrades from the earnings, a level-up and a drafted unlock card (roundabout, rest stop, double-decker
  buses); at 100% arrival the towns grow and a new event drops elsewhere, while the old route keeps running.
  GAME-PLAN section 1.0 (pivots in 1.0.6, open questions in section 7, items 6–13). This replaces the "tourism booms"
  idea (v3) written earlier the same day, and the Phase 4 Career (population milestones, win at 6,000).
- **Player control (up to 2026-10-18):** roads and traffic only. Now (v4): roads plus the Toll Gate, the parking lot and the shuttle bus route; the game places the events. The city grows where traffic flows and stops where it jams.
  **Confirmed 2026-10-17:** the player never builds buildings; the "objects" build tool comes out (Phase 1
  step 3). The game allocates lots (residential, commercial, industrial, tourism, government) and builds them
  with rich generated layouts; the player picks growth options. GAME-PLAN sections 1.5 and 3.5.
- **Growth roads are gravel (added 2026-10-17):** the town extends its own network with gravel roads to the lots it
  allocates; the player upgrades (paves) them and reroutes traffic. Needs a gravel road class (Phase 3, with growth).
  GAME-PLAN section 1.5.
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
- **The worker bench sometimes never gets WebGL** ("GPU: unknown", heap stuck at 8 MB, never ready). Seen twice;
  a plain retry worked. `bench.mjs` now relaunches the browser (up to 3 tries) when WebGL is missing.
- **`npm run event:gate` fails on main (found 2026-10-20, not caused by B.3):** (b) B's rate 48.33% equals A's (needs +10 points;
  towns fixed 2) and (c) C's rate 99.58% (needs 99.95%); the same numbers on a clean checkout of `9f05008`. Its scenarios predate the
  player-placed stadium and later road changes; to look at.
- **The forest only plants as the camera arrives** (2 cells per frame), so a fast pan at district zoom shows trees
  popping in at the edges.

## Remote worker PC

| Item | Value |
| --- | --- |
| Host | `RAMPAGE@192.168.0.8` (hostname PiskriekDesk; Windows, Git Bash shell, 24 threads, Node 22, Chrome 155), SSH key only, LAN only. **Moved from .9 to .8 after a power cut (2026-10-18):** same host key (ED25519 `XKzuqm06…`); `~/.ssh/config` and known_hosts updated. A DHCP reservation on the router would keep it fixed; sshd must be running (`Start-Service sshd`, Automatic) |
| Alias on the dev PC | `cworker` in `~/.ssh/config`, key `~/.ssh/capital_worker_ed25519` (created 2026-10-17) |
| Clone on the worker | `/e/CapitalEmpire` (E: drive; C: is short of space), created by the first `scripts/worker/run.sh` |
| Usage | `scripts/worker/run.sh "npm test"`, `npm run worker:bench`, `scripts/worker/fetch.sh output/bench` |
| Rules | The worker clone is read-only: never commit or push from it. Rebooting the worker also stops its Hunyuan3D server. |

**Status: working (2026-10-17).** The dev PC's key is authorised. The first attempt was rejected; re-saving
`administrators_authorized_keys` as ASCII (PowerShell's `>>` writes UTF-16) and limiting it to Administrators and
SYSTEM (`icacls ... /inheritance:r`) fixed it. The first `npm run worker:test` created the clone: 6/6 tests pass, 26 s including `npm install`. `run.sh` sends a
snapshot of the local working tree, so uncommitted changes are tested too.

## Phase 1, terrain (maple valley for now): done

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
5. **Hills as forest. DONE** (2026-10-17).
   - `src/game/forest.ts` (pure, tested in `tests/forest.test.ts`): a jittered global grid (2.4 tiles) of trees on
     HILL: maples, oaks and birches, conifers more likely higher up (150–400 m), clearings from noise, thinner edges,
     none on cliffs (slope > 1.5, thinning from 1.15). About 11.5% of hill tiles get a tree (192k on seed 1).
   - **Planted lazily** per 64x64-tile cell as the camera reaches it (2 cells per frame, nearest first). The trees
     are sprites only, never engine props: they cannot be selected, bulldozed or saved, and are not in the planner
     blocks. `perf.forest` counts them.
   - **Rock instead of rock-edge sprites (decision):** there are no rock sprites in the atlas, so the 4 m terraces
     and steep faces get a painted rock texture where the slope passes about 1.2–1.6 (`rockAlpha`, also in the
     planner). Hill slopes are steep (median about 0.9 m/m), so this reads as cliffs between the forest. Real
     rock-edge sprites can come with the art track.
   - Hillshade shadows were softened (alpha up to 0.5) because they stained plain grass.
   - Worker bench: Street 30% 60 / 0.85 / 1.1; Street 17% 56.4 / 1.08 / 1.6; District 8% 60 / 1.15 / 1.2; District
     4.5% 60 / 1.88 / 2.2; Planner 2% 60 / 0.72 / 0.8; Whole map 59.5 / 0.83 / 1.0. Heap 216 MB, bake 17.8 ms.
6. **Bridges and tunnels. DONE** (2026-10-17).
   - **Data:** `Seg.kind` / `Route.kind` (`SK` GROUND 0, BRIDGE 1, TUNNEL 2), kept through splits, piece removal, the
     worker ops and the save (an optional 7th element of the v4 seg tuple; no version bump). Routes break where the
     kind changes.
   - **Road tool (C:S style, automatic):** `structures.splitByTerrain` probes the corridor (5 points across) every
     0.25 tiles: any WATER makes a bridge, any HILL a tunnel; ground gaps under 3 tiles between equal structures are
     absorbed; bridges get 1.5-tile abutments. Bridges cost 4x per metre, tunnels 6x; a bridge can span 300 m and a
     tunnel 600 m. The route cost preview and the build toast include them.
   - **Painting:** bridge routes keep their road features plus a deck (water shadow, piers every 9 tiles, fascia,
     concrete deck, railings with posts). Tunnel routes paint nothing but portals (dark mouth, headwall with arch)
     and a dashed planner line. Forest cells near a portal re-plant without the trees in front of the mouth. Cars
     under hills are hidden (the placeholder traffic drives through tunnels).
   - Worker bench: all stages 60 fps; worst p95 2.2 ms (District 4.5%). Heap 217 MB, bake 16.1 ms.
7. **Highway entry. DONE** (2026-10-17). `structures.highwayRoute`: 24 tiles straight in from the generator's border
   point, then the cheaper of two right-angle corners to the starter town's nearest node (scored by structure
   cost, so it avoids tunnels when it can). Built free in `seedTown` as a Road, with bridges/tunnels where needed.
8. **Gate. PASSED** (2026-10-17).
   - 20 seeds pass the generator guarantees (`tests/terrain.test.ts`).
   - A road crosses the river and a hill on real terrain: `tests/gate.test.ts` (seeds 1–3: bridges 29–39 tiles over
     rivers 26–35 wide, tunnels 174–216 tiles, a BRIDGE route, a TUNNEL route and two portals each). Also checked
     in the browser (`look6.mjs`, git-excluded: builds both with the road tool and shoots them).
   - Benchmark budgets still met (worker, RTX 3080, fps / cpu avg / p95 ms): Street 30% 60 / 0.75 / 0.9;
     Street 17% 59.9 / 0.81 / 0.9; District 8% 60 / 1.17 / 1.4; District 4.5% 60 / 2.0 / 2.5; Planner 2% 60 / 0.75 /
     0.9; Whole map 59.8 / 0.86 / 1.0. Heap 216 MB, bake 16.5 ms. 36/36 tests.

Left over from Phase 1 (small, pick up when convenient):
- The Select panel still has Bigger/Smaller for props (a leftover of the removed objects tool).
- The starter town's layout is fixed, so on some seeds a few of its roads are skipped; old saves' roads are not
  checked against the new terrain.
- The highway's last leg can cut through the starter town on unlucky seeds (it targets the nearest node). It can
  be bulldozed like any road.
- Portals and headwalls are drawn the same whichever way the tunnel faces; bridge decks are flat (no ramps).
- Placeholder traffic drives through tunnels (hidden) and over bridges like any road.

## Phase 2, traffic core: done

Goal and gate: GAME-PLAN section 3.3 and the phase table in section 5 (gate: 10k cars for 10 in-game days on a
seeded network, no deadlock, budgets met, every junction type behaves visibly). Suggested steps:
1. **Lane graph** from the network (lead designs): directed lanes per arm (`laneCentres`), connectors as turn
   curves from the renderer's corner fillets, a conflict table per node. Bridges and tunnels are ordinary links
   (tunnel cars hidden). Incremental: rebuild only the touched nodes' lanes.
2. **Sim worker** with IDM car-following on fixed steps, seeded; vehicles stream positions to the main thread.
3. **MOBIL** lane changes, then junction control (priority, stop/yield, fixed-time signals, roundabouts, slips).
4. **Zone next-hop routing** (about 256 zones, reverse Dijkstra over congested times, logit at junctions).
5. **Test traffic** (trip generation stub), safety valves (towing, spawn throttle), then validation scenarios from
   traffic-simulation.de (ring road, on-ramp, lane closure) as tests, and the 10k-car gate on the worker.

Update this file after each step.

### Phase 2 progress
1. **Lane graph. DONE** (2026-10-17). `src/game/sim/lanes.ts` (pure, tested in `tests/lanes.test.ts`, 8 tests):
   - Units: points in tiles, lengths/`s`/speeds in metres and m/s (`MPT = 2`).
   - `DSeg` = one direction of a Seg, with LINK lanes (idx 0 = inner). Lane offsets are `laneCentres` on the driver's
     right (`perp(dir)`); the single-lane class uses 0.45. Lanes stop at an inset from each node (stop line, zebra or
     corner reach at junctions; ring + 0.6 at roundabouts; a 3-tile fillet at bends; 0 at dead ends).
   - Node lanes: CONN connectors are cubic Beziers shaped like circular fillets; roundabouts get RING arcs (short arc
     past each arm and long arc to the next, circulating with the island on the left = decreasing angle), yield entries
     and exits. Dead ends get U-turns. `Movement` = in-dseg to out-dseg with one lane path per allowed in lane
     (multi-lane: L from the inner lane, R from the outer, S from all). `DSeg.out` lists the movements leaving its end.
   - Control: plain junctions pick a major pair (opposed arms, highest class sum): major S/R prio 3, L prio 2, minor
     R 1 and S/L 0 with STOP if the major is road or bigger, else YIELD. Signals/slips: a fixed-time `SignalPlan`
     (opposed arms share a phase; green 18 s, amber 3, all-red 2, offset from the position); slip right turns yield
     unsignalled. Roundabout entries YIELD prio 0.
   - Conflicts per node: merges (same next lane) and polyline crossings, with s and os in metres.
   - Incremental: `update(net)` after each rebuild (`RoadNetwork.lastNodes`/`lastFull` are new): segs with both ends
     in the re-analysed set and all re-analysed nodes are rebuilt; ids are reused by key, so untouched lanes keep
     their ids; `removed`/`changed` list the lane ids for the sim. Tested: incremental equals full, ids stable.
   - Measured (Node, dev PC): 40x40 grid, 3,291 segs, 25,838 lanes, 19,256 movements: full build 680 ms; one edit
     (network rebuild + lane update) 24 ms.
   - Debug overlay: key **L** (`engine.showLanes`) draws link lanes white, connectors yellow, ring arcs cyan,
     conflicts red. Checked in the browser (`look-lanes.mjs`, `look-rb.mjs` at the root, git-excluded).
2. **Sim worker with IDM. DONE** (2026-10-17).
   - `src/game/sim/idm.ts` (Treiber's IDM: a 1.5, b 2.0, T 1.2 s, s0 2 m, delta 4). `src/game/sim/sim.ts`: `Sim`, vehicles
     in fixed slots (typed arrays), per-lane lists front first, `DT` 0.1 s fixed steps, seeded (`mulberry`).
     A vehicle entering a LINK lane picks the movement at its end (random for now) and its plan is that movement's
     lane path; leaders are found along the plan up to 150 m; it brakes for slower connectors once comfortable
     braking (b) is needed. `gate(i, lane)` is the junction-control hook (open in step 2). Graph edits: vehicles on
     removed lanes respawn, others re-validate their plans (`onGraph`).
   - `src/game/sim/sim.worker.ts` replays the net ops (like the ground workers), runs `speed` steps every 100 ms and
     posts `[x, y, angle, flags]` per slot (transferred). `src/game/sim/client.ts` (`SimClient`) interpolates
     between the last two frames and gives the renderer drawables and planner dots; it replaced `TestTraffic`
     (`traffic.ts` keeps only the sprite facings). Tunnel cars are hidden by a flag. `netToOps(net)` (netops.ts)
     seeds a new worker from the current network.
   - Perf: per-lane caches (length, limit, gate) and transferring only flagged lanes took a step at 10k cars on a
     40x40 grid from 11.5 to 7.6 ms (dev PC, Node). The full lane graph build there is 320–680 ms (once, in the worker).
   - Worker bench (RTX 3080, Chrome, 10k sim cars on the 4 km city), fps / cpu avg / p95 ms: Street 30% 60 / 0.63 /
     0.7; Street 17% 60 / 0.71 / 0.8; District 8% 60 / 1.02 / 1.2; District 4.5% 60 / 1.75 / 2.3; Planner 2% 60 / 0.64 /
     0.8; Whole map 59.6 / 0.76 / 0.9. **Sim tick 3.1 ms avg, 5.5 ms max** (budget 25 ms). Heap 217 MB, bake 16.3 ms.
   - Lesson: the brief's curve rule (min of IDM and the curve deceleration whenever the next lane is slower) held cars
     at connector speed for whole links; braking only once the comfortable curve is reached fixes it.
3. **Junction control and MOBIL. DONE** (2026-10-18).
   - `src/game/sim/signals.ts` (`phaseState`). `Sim.gate(i, c)` decides at a junction entry, once the vehicle is within
     braking distance + 4 m of the line: signals (red stops; a grant needs the vehicle to reach the line before red,
     amber only passes vehicles that cannot stop; a granted vehicle gives the grant back if red comes while it can
     still stop), stop signs (stop first), queue order (no grant while the vehicle ahead waits), room beyond the box
     ("don't block the box": free space on the out lane minus reservations, at 3+ arm nodes and roundabouts), and the
     conflict table (no vehicle short of a conflict point, none granted into a conflicting lane, no higher-priority
     vehicle arriving within 4 s, 5 s at merges; equal priority = longest wait first). Ring arcs wait on entry
     reservations.
   - MOBIL (politeness 0.3, threshold 0.2, safe decel 4) every 0.5 s on multi-lane links, with a mandatory bias toward
     lanes that serve the wanted movement; vehicles now want any movement and change lanes for it (a vehicle that
     misses its lane takes a fallback movement). Lane changes are drawn smoothly (`lat` decays).
   - Tow: 60 s stuck in a junction box or 300 s anywhere (`stats.towed`).
   - Overlay: signal heads as green/amber/red discs at each signalled approach (Street tier), from the client's
     interpolated sim time (`SimClient.simTime`).
   - Tests (57 pass): no crossing collisions at a plain junction, nobody enters on red, a roundabout flows with no ring
     overlap and no tows, left-turners use the inner boulevard lane (0.4% in the wrong lane), and an 8x8 grid of mixed
     junctions with 400 cars runs 33 sim minutes at 4 m/s with 3 tows in 40k junction passes.
   - Capacity finding: 8x8 single-lane street blocks of 80 m with random routing flow at 300–400 cars, are at capacity
     at 600 (1.5 m/s) and gridlock at 1000+. Fixed-time signals (18 s greens) on 80 m blocks cut mean speed by a third.
   - Perf: 11 ms per step at 10k cars on the 40x40 grid (dev PC), now congested (mean 3.7 m/s with random routing).
4. **Zone next-hop routing. DONE** (2026-10-18). `src/game/sim/routing.ts` (`Router`):
   - 16 x 16 zones of 128 tiles. Costs in seconds: link = length / measured speed (EMA per dseg every second);
     movement = length / 8 + turn penalty (S 0, R 1.5, L 3, U 20) + measured junction delay (EMA of the waits).
   - Per destination zone a table from a reverse Dijkstra over movements (CSR reverse adjacency, binary heap), built
     on first use, refreshed round-robin (one per step) and on demand after an edit (at most 4 per step). About
     1.4 ms per table on the 40x40 grid (max 6 ms).
   - At each junction a logit choice among near-best movements (within max(20 s, 25%) of the best; theta 3 s + 5%).
     Near the destination (same zone or within 64 tiles) an A* over movements finds the exact dseg.
   - Vehicles have `dest`/`destS` and are removed on arrival (`stats.arrived`); no route → `lost`. Edits drop routes
     and retarget vehicles whose destination vanished.
   - Tests (`tests/routing.test.ts`): the short way wins (100/100), congestion splits two equal routes (126/133),
     a vehicle re-routes around a removed road, a 6x6 grid delivers 764 trips with none lost.
   - Perf: 10k cars on the 40x40 grid about 1.2x the step-3 cost (14 ms per step on the dev PC, Node).
   - Seen: when the target cannot be reached (a small network), `fill()` keeps making 200 spawn attempts per step
     (5.6 ms per tick for 170 cars). Capped in step 5.
5a. **Trips, valves, scenarios, gate script. DONE** (2026-10-18).
   - `src/game/sim/trips.ts`: `DAY = 1440` sim seconds (one game minute per sim second), `demandAt(t)` (0.35 at night,
     peaks 1.0 at 8h and 17h), origins weighted by lane length, destinations by a gravity model
     (`w = lane length of the zone * exp(-d / 1500 m)`), at least 300 m away. `Sim.profile` scales the target by the
     demand curve (off by default and in the gate).
   - Spawn throttle: no spawn on a jammed dseg (speed EMA < 2 m/s) or within 15 m of a vehicle; at most 40 attempts
     per step (`stats.throttled`).
   - **Zipper merges** (lead fix): merges were mutual exclusion (nobody enters while anyone is on the other merging
     connector), which held a lane drop to 8 veh/min. Now a vehicle may enter behind the vehicles already on the other
     lane, and vehicles on merging node lanes follow the nearest merger ahead (by distance left to the merge point). A
     vehicle holding the reservation on the merged lane ignores mergers without one (this deadlocked a roundabout).
   - **Tapers**: a straight 2-arm node where the class changes insets the lanes 4 tiles each side, so the lane shift
     is a gentle S-curve instead of a 1 m kink at 3 m/s.
   - `tests/scenarios.test.ts` (Treiber's scenarios): ring road fundamental diagram (flow 480 → 1106 → 1124 → 1124
     veh/h at 10/25/50/70 veh/km, speed 13.1 → 4.5 m/s; the 4 corner fillets at 4.2 m/s cap the flow), on-ramp (a
     stop-controlled right turn into a boulevard: all ramp vehicles arrive at 6/min with 20/min through), lane drop
     (boulevard to street: 21.7 of 25 veh/min). 66 tests pass.
   - `src/game/bench-net.ts`: the bench network as a pure module (the browser bench and the gate share it).
     `npm run sim:gate -- [days] [cars]` (`scripts/sim/gate.ts`) runs the sim headless on it and checks the gate
     (active >= 98%, arrivals every hour, speed > 1 m/s, towed < 1% and lost < 2% of arrivals); summary in
     `output/sim/gate.json`. Smoke (0.05 days, 10k, dev PC): pass, 16 ms per step mean.
5b. **Car lights. DONE** (2026-10-18). Headlights (two lamps and a soft beam ahead), tail lights (brighter when
   braking) and blinking turn signals (the movement's turn, within 40 m of the line and through the box), drawn as
   soft additive points (`uSoft` in the point shader) at the Street and District tiers (not below 8%).
6. **Gate. PASSED** (2026-10-18).
   - `npm run sim:gate -- 10 10000` on the worker: 10 in-game days (144,000 steps) with 10,000 cars on the 4 km bench
     city: **pass**. 221,661 trips arrived, 1,377 towed (0.62%), 0 lost, active 10,000 every hour, slowest hour
     4.0 m/s. Step 4.6 ms mean, 7.5 ms p99, 44.8 ms max (one spike; budget 25 ms per tick). 658 s wall time.
   - Worker bench with 10k sim cars and lights (fps / cpu avg / p95 ms): Street 30% 60 / 0.41 / 0.5; Street 17% 60 /
     0.64 / 0.8; District 8% 60 / 1.12 / 1.3; District 4.5% 59.8 / 1.86 / 2.3; Planner 2% 60 / 0.67 / 0.8; Whole map
     59.7 / 0.81 / 1.0. Sim tick 5.9 ms avg, 13.8 max. Heap 226 MB, bake 5.1 ms.
   - Every junction type behaves visibly: `look-junctions.mjs` (root, git-excluded) builds a district with signal,
     slip, roundabout and stop/yield crossings and shoots them with traffic (`output/look/junctions-sheet.png`).
   - 66 tests pass.

Left over from Phase 2 (pick up when convenient):
- The economy day (`DAY_SECONDS = 20` in engine.ts) and the sim day (`DAY = 1440` sim s) differ: align them in
  Phase 4 with the time controls (the worker already takes `speed`; there is no UI for it yet).
- Car lights draw over everything (no occlusion by buildings in front).
- Cars still use the 4-facing sprites, so they snap heading mid-turn (16 headings: Phase 6 art track).
- Signals are fixed-time (no actuation, no right-on-red); single-lane street grids reach capacity quickly with
  18 s greens.
- The main thread keeps its own LaneGraph for the overlays (lanes, signal heads): about 2x the lane work per edit.
- `Sim.profile` (the demand curve) is not switched on in the game yet; Phase 3 trips from lots replace it.
- The lane graph's full build is 300–700 ms in the worker at load (once).

## Phase 3, Lot Composer + growth: done (plan as written at the start)

Goal and gate: GAME-PLAN sections 1.2, 1.5 and 3.5 and the phase table (gate: from one highway exit a city of 5k
grows by itself; 100-lot contact sheets pass review; a jam stops growth locally). The Lot Composer ports the ideas of
TrickOrTreat's places-v5 kit (read-only; found under `../TrickOrTreat/.claude/worktrees/vibrant-cerf-929fd1/scripts/
town-builder/places-v5/`: `AUTHORING.md`, `kit.mjs`, `scales.json` with the owner's scales, `RUNS` fences, `stage.mjs`;
the owner's blocks as data in `output/town-builder/presets-v5-study/data/`). Suggested steps:
1. **Gravel road class** (narrow, 8 m/s, no sidewalks, dusty texture, cheap; a single lane each way) in the road
   palette, painter, planner and lane graph.
2. **Parcels**: blocks from the faces of the road graph (incremental per edit), cut into frontage lots (15–20 m
   suburban, wider for commercial), corners handled; each lot knows its frontage dseg and driveway point.
3. **Land use and growth**: allocation (residential, commercial, industrial, tourism, government) from terrain, road
   class, distance to the highway and river, neighbours and a growth option; growth driven by demand and the zone
   access score (actual / free-flow trip time from the sim).
4. **The town lays gravel roads** into new land when its lots fill up (block-grid extensions that respect terrain;
   no bridges or tunnels, those stay the player's).
5. **Lot Composer v1**: archetypes per land use from Maple Falls art (houses with yards, fences, drives and story
   dressing; commercial with car parks and loading bays; industrial yards; civic sites), deterministic per lot,
   ground ops (drives, car parks) baked by the ground workers.
6. **Trips from lots**: residents and jobs per lot, departures by time of day; parked cars are the sim cars.
7. **Access-driven growth and decline** (amber/red districts, boarded, derelict, cleared), the 100-lot contact
   sheets, and the gate run.

### (Old start prompt, Phase 3)
"We're building Capital Empire (repo: CapitalEmpire). Read CLAUDE.md and docs/PROGRESS.md first, then continue
Phase 3 (Lot Composer + growth) at the first step not marked DONE and carry on through the steps without asking
between them. Delegate coding to haiku-coder and checks/benchmarks to haiku-runner (worker PC via
scripts/worker/run.sh), commit locally after each verified step, update docs/PROGRESS.md as you go. Use
look*.mjs at the repo root (git-excluded copies of output/look/look.mjs) for headless screenshots."

### Phase 3 progress
1. **Gravel road class. DONE** (2026-10-18). `gravel` is the first class (key 1): 5 m, one lane each way at 8 m/s,
   gravel verges, no kerbs, $40 per 2 m, `order` -1 (below every paved class: it yields to them and paints under
   them at junctions), no decals. New painted texture `roadgravel` (dusty grey-brown with pebbles; `TEX_VERSION`
   tex-5); the planner uses its mean colour. `window.__CLASSES` is exposed next to `__game` for headless scripts
   (`look-gravel.mjs`).
2. **Parcels. DONE** (2026-10-18). `src/game/lots/lots.ts` (`LotMap`, tested in `tests/lots.test.ts`):
   - Frontage lots like C:S zone cells, not graph faces: oriented rectangles along each side of every ground seg,
     from the verge edge. Width/depth by class: gravel/lane/street 8 x 15 tiles, road 10 x 16, avenue 12 x 18,
     boulevard 16 x 20. Along-positions snap to a global lattice (`t = dot(p, u)`, cells of W), so splitting a seg
     keeps the lots; keys are geometric and stable.
   - Ends leave out the junction reach; depth stops short of other roads' verges and at the **midline** to the road
     behind (back-to-back strips share a block; a cut half-block gets two shallow strips; minimum depth 6 tiles).
     More than 10% HILL/WATER/CREEK/BANK rejects a lot. Overlaps: higher class, then longer seg, then key wins (corner
     squares go to one side, as in real square blocks where lots front two opposite sides).
   - Incremental over a 54-tile scope around the edit; ids kept when the rectangle is unchanged.
   - Engine: `lots.update` after the lanes in `commitNetwork`/`afterLoad`; key **P** overlay (white lots, amber
     corners). The starter town's tight blocks get no lots (too shallow after the midline cap).
   - Cost: bench city 7,112 lots, full update 530 ms; one edit 32 ms on the main thread (over the 30 ms edit budget):
     step 3 moves lots and the town model into the sim worker (it already holds a network replica).
3a. **Town growth model. DONE** (2026-10-18). `src/game/lots/town.ts` (pure, `tests/town.test.ts`):
   - Lot states (use RES/COM/IND/TOUR/GOV, level EMPTY/BUILDING/BUILT/UPGRADED, decline 0–3, seed), events for the
     composer, `pop`/`jobs` (RES 3/5 residents; COM 3/5, IND 6/10, TOUR 3/6, GOV 8/12 jobs at BUILT/UPGRADED).
   - Growth per game hour `(20 + 0.10 * built) / 24` lots (about 10% a day), weighted by `zoneGrowth(access)` (1 up to
     1.3, 0 from 1.8), `exp(-d/40)` to the nearest built lot (the town grows out from the highway exit) and value
     (corner, paved class); top 400 candidates, seeded picks.
   - Land use: road-class scores (RES on gravel/lane/street, COM on road/avenue/boulevard and corners, IND within 120
     tiles of the highway, TOUR near water), balanced towards target shares RES 0.65, COM 0.20, IND 0.10, TOUR 0.05
     (`clamp(1 + 2(target - share)/target, 0.3, 3)`); growth options scale the targets; GOV by quota (one per 400
     residents). Construction 0.5 day; upgrades in good zones; decline in zones over 1.8 for 2 days (shabby →
     boarded → derelict → cleared), recovery below 1.5.
   - Test grid numbers (10x10 streets, 10 days): 298 built, jobs/pop 0.52, COM share 0.19; a jammed zone stops
     building and declines (39 declines, 13 clears) while others grow.
5a. **Art kit. DONE** (2026-10-18). The atlas now holds 220 sprites on 2 pages (2.96 MB of webp; dist 5.0 MB): all
   houses with rear views, shops (with rear views), landmarks, park & sports, backyard structures/furniture/stories,
   POI dressing, scrapyard and derelict (new `Industry` category), utility details, fences, plants. Saves store
   sprite ids, so regenerating the library keeps old saves valid.
5b. **Lot ground. DONE** (2026-10-18). `LotPatch` (oriented quads: paving, pad, asphalt with bay lines, dirt,
   gravel, field) per lot key; `Game.setLotGround(key, patches)` batches per frame; the ground workers paint them
   after the terrain and before verges and roads; the planner fills them flat.
   - Note: `npm test` runs files in parallel, so the wall-clock budgets in the network (4 km grid) and terrain (20
     seeds) tests can fail under load; they pass alone.
3b. **City worker. DONE** (2026-10-18). The sim worker owns the `LotMap` and the `Town` (the main-thread lot update
   cost 32 ms per edit). Main → worker `terrain` (classes, highway entry, seed; resets the town) and `option`;
   worker → main `lots` (plain lot records) and `town` (events, pop, jobs, built). The worker runs at game start, so
   the town grows on the sim clock; with no cars it still posts a frame every second (the clock for signals and the
   town). Reachability is a BFS over the network from the node nearest the highway entry; a 512² water distance
   field serves TOUR scoring. `SimClient.lots` mirrors the lots with their states; key P draws them by use.
4. **The town lays gravel roads. DONE** (2026-10-18). `src/game/lots/roads.ts` (`needsLand`, `planExtension`,
   `tests/roads.test.ts`): when reachable empty lots within `100 + 10 sqrt(built)` tiles of the built centre drop
   below `max(24, 1.5 x daily growth)`, at most once per game hour the worker proposes one 40-tile gravel leg (a
   dead-end continuation, a branch at the parcel lattice, or a leg that closes a block onto another road), never on
   HILL/WATER/CREEK/BANK (bridges and tunnels stay the player's), never through built lots. The main thread applies
   it as a free player-like edit (`townGrow`, style 2, reveal, a toast at most every 30 s), so the network stays
   single-sourced. Lots on gravel cannot upgrade (paving unlocks growth). Test valley: 207 gravel segs for 526 built
   lots in 15 days, all junctions right-angle 3/4-arm crossings.
5c. **Lot Composer. DONE** (2026-10-18). `src/game/lots/compose.ts` (pure, `tests/compose.test.ts`):
   `compose(lot, state)` → props + ground patches, deterministic per lot seed. Facing: fronts face +Y (unflipped) or
   +X (flipped); lots facing -Y/-X use rear views. RES: house at a setback, garage when it fits, drive and front walk,
   trees, packed plants, fences by story, bins and mailbox, a car in the drive, household stories (young family,
   retirees, shift worker, party house, hobby mechanic, neglected). COM: shop + car park with bays and wheel stops +
   loading bay. IND: shed, gravel yard, chain-link, scrapyard clusters. TOUR venues, GOV civic sites, construction
   sites, decline states (shabby, boarded with rundown sprites, derelict). Placements outside the lot, on drives or
   overlapping more than 35% are dropped. Owner scales from places-v5 (`npm run assets:scales` →
   `src/game/lots/scales.ts`). Average uprights: RES 16.5 (upgraded 20.4; the owner's town has ~16 per house), COM 7.5,
   IND 8.3, TOUR 8.7, GOV 7.5, construction 5.4. Tests now import `LIBRARY` (esbuild `--loader:.webp=empty`).
5d. **The engine builds the lots. DONE** (2026-10-18). Town events queue lot keys; up to 40 lots per frame are
   composed (more when the queue is long) as `lot:<key>` auto props plus lot ground; a lot holding a non-auto building
   (the starter town) is skipped. **Save v5** stores the non-empty lot states and the sim clock; the worker restores
   them (`Town.restore`). `Game.stageLots({cols, rows, uses, level, decline, seed})` stages contact sheets
   (`look-stage.mjs`: `output/look/res-*.png`, `mix-*.png`): houses read convincingly next to the owner's density;
   COM/IND/TOUR/GOV lots read sparse (about 8 uprights) and want a density pass.
6. **Trips from lots and access. DONE** (2026-10-18). Driveways on the lot side's outer lane; in `'lots'` mode (from
   the first built RES lot) each RES lot sends `residents x 2.2 / day` trips shaped by `demandAt` (morning to jobs,
   evening home, off-peak shopping), departures spread over the hour. Access per zone = EMA of actual / ideal trip
   time divided by the free-flow ratio `FREE = 1.213` (measured: 50 cars on a 10x10 grid; 600 cars read 3.31 raw),
   so free flow reads about 1.07–1.10 and the town's 1.3/1.8 thresholds mean 30%/80% slower than free flow. The worker
   feeds it to the town hourly and to the main thread (key **O** overlay, automatic at the planner tier).
   - Seen in the browser (8x): the town lays its first gravel roads and construction sites within a game day; the
     early growth is slow (20 lots/day base, construction 12 game hours, so the first houses appear after ~16 game
     hours). Balance in Phase 4. The top bar's population is still the old economy's (house props), not
     `Town.pop`: Phase 4 merges them.
5e. **Density pass. DONE** (2026-10-18). Non-residential lots now carry 14–22 uprights (COM 15.6, IND 16.3, TOUR
   19.6, GOV 16.1): cars in half the 2-tile bays, lamps, front dressing, tree rows, scrapyard clusters, forecourts.
7. **City class and growth gate. DONE (code)** (2026-10-18).
   - `src/game/city.ts`: the worker's city logic (network replica, lanes, sim, lots, reachability, water field, town,
     growth planner) as a class; `sim.worker.ts` is a thin shell. `City.growStats` counts the planner's hourly
     outcomes; `roads.ts` exports `planWhy` (why candidates were rejected).
   - `npm run town:gate -- [seed] [days] [cars]`: terrain + only the highway into the start block, then the city
     grows by itself (grow legs applied as gravel edits); daily lines, `output/sim/town-gate.json`; pass = pop 5000
     within the days, no zero-build day unless every lot zone is jammed, step under 25 ms; prints the jam check
     (builds inside a zone over 1.8 vs elsewhere).
   - **Access, made robust** (lead fix): per zone, decaying sums of actual and ideal trip seconds (half-life one game
     hour), each trip capped at 6x, pulled toward 1 until a zone has 12 (decayed) trips. The per-trip ratio EMA let a
     few slow trips in a young town read 9.4 and stop its growth. `tests/trips.test.ts` now calibrates: 50 cars on a
     10x10 grid read 0.98–1.00, 600 cars 1.72–2.58.
   - **Growth planner fixes** (lead, found with a map render of the gate, `output/prof/gatemap.ts`): legs end on the
     global 40-tile lattice (the next lattice line at least 16 tiles away), so the streets line up into blocks; nodes
     with 2–3 arms offer their missing axis arms (the free side of a T); dead ends of gravel/lane/street/road continue
     straight or turn as a T; the verge rule ignores the start road's corner segs near the start; lots stay 4 tiles
     clear of lattice points along every road (`lots.ts` `BRANCH`/`RESERVE`), so future side streets never cut a house
     (in a full grid those cells are inside junction reach anyway).
   - Local 8-day run (seed 1): builds 19 → 38 a day, pop 417 and 190 built lots on day 8, 82 gravel segs, access
     worst 1.10, step about 2 ms.
7b. **Gate runs and fixes** (2026-10-18), all on the worker (`npm run town:gate -- 1 <days>`):
   - Run 1 (40 days): pop 4,047, then the whole gravel network gridlocked (7,300 cars at 0.1 m/s). Cause: time
     compression. The game day is 24 minutes but cars drive at real speed, so a 2 km trip lasts hours of game time;
     2.2 trips per resident put ~40% of the town on the road at once. Fix: **0.6 trips per resident per day** (each car
     stands for several people), plus an **abandoned-trip valve** (a trip still driving after 1,200 sim s is removed and
     counted against the access of both zones), and each new lot's trip counter starts at a random phase (all lots
     built in one hour used to leave in one hour).
   - Run 2: no jams (about 200 cars, 1.1 ms per step), but growth stopped at pop 4,086 on day 32: the town had filled
     its side of the river and every growth candidate failed on terrain (the planner's `planWhy` counts said so).
     By design the town never bridges, so the gate now plays a **minimal player** (step 7b): when the town is
     land-locked for 3 game hours it builds one paved street across the shortest water crossing (the road pipeline
     makes the bridge), at most every 2 game days.
   - Also fixed: lots kept the lattice points free in off-lattice player grids (half of every block was lost); the
     reservation now only applies where there is no road behind within 45 tiles.
   - **Run 3: PASS.** Pop 5,133 on day 37 (2,245 built lots, 726 gravel legs, one player bridge on day 31), step 1.16 ms
     mean, 8.2 max. From day 35 the bridge funnels the new district's traffic: speed 3.3 m/s, zones over 1.3 reach
     35–37% and the worst zone 2.39 by day 37.
   - **Run 4 (55 days, `keep`): a jam stops growth locally.** Pop 8,166 by day 55 with a second player bridge on day 45.
     19 jam episodes (a zone over 1.8 for 25–92 game hours, mostly where the bridges funnel traffic): in **every** one
     the jammed zone built nothing while 110–403 lots were built elsewhere. Step 2.3 ms mean, 17.8 max.
   - **Worker bench after Phase 3** (10k random cars on the bench city, fps / cpu avg / p95 ms): Street 30% 60 / 0.37 /
     0.5; Street 17% 60 / 0.59 / 0.7; District 8% 60 / 0.98 / 1.1; District 4.5% 60 / 1.65 / 1.9; Planner 2% 60 / 0.64 /
     0.7; Whole map 59.8 / 0.74 / 0.9. Sim tick 4.8 ms avg, 10.3 max. Heap 213 MB, bake 4.3 ms. (A first run had 0 cars:
     the bench commits its network before `afterLoad`, which then sent the worker no ops; `afterLoad` now sends the
     whole network with `netToOps`.)

### Phase 3 gate
- **From one highway exit a city of 5k grows by itself: PASSED** (run 3: 5,133 on day 37, with one player bridge,
  which the design leaves to the player).
- **A jam stops growth locally: PASSED** (run 4, 19 of 19 episodes; also `tests/town.test.ts` test 3).
- **100-lot contact sheets pass review: WAITING FOR THE OWNER.** `output/look/lot-sheet.jpg` (git-ignored; rows:
  houses built, houses upgraded, shops/industry/venues/civic, boarded, derelict; made with `look-stage.mjs` at the
  root, which stages lots on the start block via `Game.stageLots`). Budgets met (worker bench above).

### Left over from Phase 3
- Balance: early growth is slow (first houses after ~16 game hours); the economy's population (top bar, house props)
  is not `Town.pop`; the economy day (20 s) is not the sim day (1440 s). All Phase 4.
- The cars chips (random traffic) stop mattering once the town switches the sim to lot trips; the bench and the
  Phase 2 gate stay in random mode. Decide in Phase 4 whether background traffic remains (tourists on the highway).
- Parked cars in drives are composer props, not the sim's cars (GAME-PLAN wants the parked cars to be the sim cars).
- Lot props are auto props: the select tool can pick and delete them (not counted back in `perf.lotProps`).
- Lots on 45° roads keep axis-aligned buildings (facing by the nearest axis); no stepped setbacks yet.
- `stageLots` overwrites the autosave (debug only).
- The growth planner only lays 40-tile lattice legs; it never bridges (the gate's player does). Towns hemmed by water
  stall until the player bridges; the player gets no hint yet (Phase 4: a "no land" notice).
- The terrain test's per-seed budget is now 4 s (the dev PC is slower than the worker).

## Phase 4, budget + bottleneck loop: done

**Gate changed 2026-10-18** (the pivot to event rounds): the books close every game day and bankruptcy is reachable;
fixing the top bottleneck measurably improves the next rush hour (headless). Step 5's population milestones and Career
are superseded by Phase 5's levels and drafted cards; the code stays (unlocks, grants, locks) until Phase 5 replaces it.
In v4 the toll is the only income, so the property tax, business takings and grants of step 2 are superseded too (the
cost side stays).

Goal and gate: GAME-PLAN sections 1.3, 3.4 and the phase table (gate: a Career run is winnable and losable; fixing the
top bottleneck measurably restarts growth). Suggested steps:
1. **One clock and time controls**: the economy day = the sim day; pause, 1x, 2x, 4x, 8x (the worker already takes
   `speed`); "skip to rush hour". The top bar shows `Town.pop`/jobs.
2. **Budget**: property tax (land value x access), business tax (customers who arrived), construction and upkeep (by
   class and length; bridges/tunnels per metre), signals, compensation for lots a new road cuts, loans; bankruptcy.
3. **Bottleneck tools**: the lane flow heatmap (volume / capacity), junction LOS badges A–F, the ranked bottleneck list
   (vehicle-hours lost per junction/link; click to jump), the car inspector, routes through a junction.
4. **Before/after** snapshots over one simulated rush hour; the district access overlay with growth state.
5. **Milestones and Career**: population milestones unlocking road classes/tools/grants; win and lose conditions;
   a headless Career gate (a scripted player that paves the top bottleneck must restart growth measurably).

### Phase 4 progress
1. **One clock and time controls. DONE** (2026-10-18). The sim clock is the only clock: one sim second is one game minute, a game
   day is 1,440 sim s (24 minutes at 1x), and the economy's day closes at the sim's midnight. Pause/1x/2x/4x/8x in the top bar
   (Space taps pause, Space-drag still pans; `,` and `.` change speed). **Skip to rush hour** (H, or the Rush button):
   the worker fast-forwards (`{t:'skip'}`, 20-step blocks for 70 ms of each 100 ms frame) to the next 7:30 or 16:30; one
   to six game hours take a few seconds. The top bar shows `Town.pop`, jobs and the time of day.
2a. **Budget module. DONE** (2026-10-18). `src/game/budget.ts` (pure, `tests/budget.test.ts`): property tax per built lot
   (RES 12/20, COM 30/50, IND 24/40, TOUR 36/60 $ a day at BUILT/UPGRADED) x frontage value (gravel 0.7 .. boulevard 1.4)
   x access value `clamp(1.5 - 0.5 access, 0.25, 1)` x decline (1, 0.7, 0.3, 0); business $1.5 per customer or worker who
   arrived at a non-RES lot, times punctuality `min(1, FREE ideal / actual)` (the sim tags each lot trip with its
   destination's use and counts `sim.trade`); upkeep 1% of the build cost per tile a day (raised from 0.4% in step 5: at 0.4% the Career could not be lost; bridges x4, tunnels x6);
   signals $20, slipways $40, roundabouts $10 a day; compensation for cleared lots (RES 2,000/3,500 .. TOUR 6,000/10,000;
   500 while building); loans of $25k at 1% a day, one more per 2,000 residents (at most 6); **bankrupt after 5 days in
   a row in the red**.

2b. **The books in the City. DONE** (2026-10-18). `City.budget` (worker and gates alike) books each game day at midnight
   (`Budget.base` = the sim s of day 1's midnight; `dayOf` forgives 1e-6 s of DT drift) from `City.dayIn()` (built lots
   with their zone access, segs, junction types, the day's trade). The main thread mirrors `BudgetSave` from `{t:'budget'}`
   messages and spends through `{t:'spend'}` (optimistic), `{t:'loan'}`, `{t:'budget'}` (reset). A route through the town's
   built lots (centre line half a tile inside a lot) pays compensation, shown in the road panel before building. Save v5
   gains an optional `budget`. UI: click the treasury for the Budget panel (the last ledger, 14 days of net, loans with
   Borrow/Repay); a bankrupt screen (pauses once, then "Keep watching"). The town gate prints the treasury and the day's
   net. Seen in the browser: day 1 of a loaded town booked property 67, upkeep 583, signals 90, interest 250.
3a. **Where time is lost. DONE** (2026-10-18). The sim keeps per-lane decaying sums (halved each game hour): `lossL`
   (vehicle-s under 90% of the limit), `lossQ` (the same within 100 m of a link lane's end: the queue of the junction
   ahead), `enterL`. `src/game/sim/bottlenecks.ts` (`tests/bottlenecks.test.ts`) turns them into a report: junctions (3+ segs
   or a roundabout) with loss, throughput, delay per vehicle and HCM-style LOS A–F (signals 10/20/35/55/80 s, others
   10/15/25/35/50 s); links per seg with loss and v/c (capacity 30 vehicles per lane per game hour at 13.4 m/s, scaled
   by the limit, halved into a signal); the top 10 by loss; flow per dseg. 10x10 grid: 695 veh-s/h lost at the worst
   item with 600 cars, 9 with 50; a 600-car step is about 1.8 ms.
   - Cost (worker, headless `sim:gate` 0.5 day, 10k cars, A/B by checking out `src/game/sim` per commit): step mean 4.3–4.6
     ms before, 4.8 ms after (+~0.4 ms, about 10%); p99 7.0–7.8 → 8.6–9.1 ms. The browser bench after step 2b read a sim
     tick of 7.1 ms avg (19.9 max) against 4.8 in Phase 3 and Street 30% at 51.5 fps; the A/B says most of that is
     run-to-run noise. Rerun the worker bench at the end of the phase.
3b. **Bottleneck UI. DONE** (2026-10-18). The city worker posts the report once per game hour (not while skipping) and on
   request. Key **F** / the Flow button: each direction of each road with traffic on its own side, coloured by v/c
   (< 0.5 green, < 0.8 yellow, < 1 orange, red); LOS badges at junctions with through traffic (street and district
   tiers). Key **B** / Bottlenecks: the top 10 by time lost (veh-min per game hour) with LOS or v/c; a click jumps the
   camera there (zoom at least 0.2) with a pulsing ring. Only one right-hand panel shows (`Game.panel`: budget or
   bottlenecks). Seen on the bench city with 5k cars: 2,206 junctions, 8,106 dsegs with flow; the worst item a
   roundabout at about 50 s per vehicle (LOS E) at v/c 0.08, which is a sim behaviour worth a look (roundabout entries
   wait long at low volume), not a measuring error.

3c. **Car inspector and junction routes. DONE** (2026-10-18). Select tool, street tier: click a car (within 1.5 tiles) for
   its card (speed and limit, going to home/shop/work/venue/civic, trip so far vs ideal with the ratio, distance left,
   Follow) and its route ahead drawn in cyan (`Sim.inspect`: now, the end of its dseg, the dsegs of `localRoute` to the
   destination). With the flow overlay on, click a junction to watch it: the sim logs each crossing's origin and
   destination (a 256 ring, `Sim.setWatch`), drawn as blue lines in and orange lines out. Esc clears both. Checked in the
   browser on the bench city. Note: the in-app browser pane is throttled while hidden (no animation frames, slow
   workers), so its timings mean nothing; use the worker bench.

4. **Before/after and the access overlay. DONE** (2026-10-18). The City pushes a cumulative snapshot at each game hour's
   start (`City.hours`, 96 kept: time lost (`Sim.lostTotal`), arrivals, ratio sums, abandoned, lots started, pop, built);
   the report carries them. `src/game/beforeafter.ts` (`tests/beforeafter.test.ts`): windows between two snapshots, rush
   windows 07–09 and 16–18, `lastRush` (else the last 2 hours), `nextRush`, `compare` (time lost per trip, trips, trip
   time vs free flow, abandoned, lots started). Bottleneck panel: Take snapshot → the before window is the last rush, the
   after window the first rush starting after the current hour (Skip to rush), then a table of changes. Seen in the
   browser: day 2 16–18 vs day 3 07–09. The access overlay (key O, always at the planner tier) adds per zone `+n` lots
   started in the last game day, `−n` declining, a red edge and "growth stopped" over 1.8, and a legend. The Bottlenecks
   list hides items under 0.1 veh-min an hour (turning cars, not bottlenecks) and scrolls above the perf panel.
5a. **Career milestones (module). DONE** (2026-10-18). `src/game/career.ts` (`tests/career.test.ts`): Hamlet (gravel, lane,
   street; plain and signal junctions), Village 250 (road, $10k), Small town 1,000 (roundabouts, $20k), Town 2,500
   (avenue, slipways, tunnels, $30k), Large town 4,000 (boulevard, $50k), City 6,000 = the Career win. Bridges are never
   locked. Grants are income in the ledger. **Upkeep raised from 0.4% to 1% of the build cost a day**: at 0.4% a road
   repaid its price only after 250 days, so even reckless building could not bankrupt a town; at 1% the starter town
   (pop 69) runs about −$1.6k a day until it grows.

5b. **Career wired in. DONE** (2026-10-18). `City.career` updates at each game hour's start (grants paid into the books;
   `step` returns `milestones` and `won`); saved with the books (Save v5 `career`). The road tool refuses locked classes,
   tunnels before Town and locked junction types (toasts name the milestone); the cards show a lock and the residents
   needed; the top bar shows the Career stage and progress to the next; a City! screen at 6,000. The starter town, the
   town's gravel, the bench and the contact sheets are never locked. Old saves start at Hamlet and are paid the grants of
   the milestones they already passed on the first game hour.
5c. **The Phase 4 gate, headless. DONE** (2026-10-18). `scripts/sim/harness.ts` (the valley, the highway, the town's gravel
   and the minimal player's bridges; shared with the town gate, whose output is unchanged) and `npm run fix:gate --
   [seed] [day]` (`scripts/sim/fix-gate.ts`): two runs of the same deterministic city to 09:00 of `day` (checked: the
   same pop and treasury), then run B's scripted player fixes the bottleneck and both run on through the next day's two
   rushes; pass (a): B loses at least 10% less time per trip than A, with at least 98% of A's trips. Scenario C, the
   reckless player (a loan, then all the money on paved street into empty land): **pass (b), bankrupt at the close of
   day 5** (it recovers on day 6 when the Village grant arrives, but bankruptcy is final).
   - Found and fixed on the way: **the sim clock drifted** (`t += 0.1` read 52,379.99999 after 52,380 steps), so hour
     and day snapshots came a step late and windows went missing; `Sim.step` now keeps `t` on the DT grid.
   - Seed 1 at day 36 (pop 4,857; treasury $399k): the top items are 4-arm plain junctions along x = 1240 and y = 920
     around the day-31 street bridge at (1240, 920), several LOS F at v/c 0.05–0.3: **queues spilling back** from the
     bridge head. The 100 m queue zone books a spillback queue to the junction upstream (blocks are 80 m), so the #1
     item is not the cause. The list now says "queued back from downstream" (LOS E/F at v/c < 0.3) or "at capacity"
     (v/c >= 0.8).
   - Player attempts so far, all FAIL (a): (1) the #1 junction's arms one class up plus a signal: 233.7 vs 162.7 s lost
     per trip (worse: the signal adds red time to a junction that was not the cause); (2) the first item with v/c >= 0.6
     (rank 9), its busiest approach seg (28 tiles of gravel) to boulevard: 216.0 vs 197.4 s (noise). One rush window is
     noisy (A alone moved 230 → 163 s between days), so the gate compares both rushes of the next day.
   - (3) **PASS: the corridor.** Every arm of the top 5 junctions (40-tile runs; links' runs 80 tiles) to the best
     unlocked class, within the money less $20k (bridges dropped first when over): 640 tiles gravel → boulevard and 51
     street → boulevard, $332k (the 29-tile bridge was dropped). Next day's two rushes, B against A: **time lost per trip
     158.0 s against 197.4 s (-19.9%)**, trip time over free flow 1.11 against 1.42 (-22%), trips 466 against 461, lots
     started 149 against 144; but trips abandoned 39 against 31. One seed, one comparison: the lesson is that a jam
     cluster needs the corridor fixed, not its #1 junction.
   - Balance note for Phase 5: by day 36 the seed-1 town has $399k at pop 4,857 even with 1% upkeep; money does not
     constrain a sensible player. In Phase 5 the toll becomes the only income anyway.

### Phase 4 gate (as changed 2026-10-18)
- **The books close every game day and bankruptcy is reachable: PASSED** (`tests/budget.test.ts`, `tests/city.test.ts`;
  `fix:gate` scenario C: a reckless player is bankrupt at the close of day 5).
- **Fixing the top bottleneck measurably improves the next rush: PASSED** (`npm run fix:gate -- 1 36` on the worker:
  -19.9% time lost per trip over the next day's two rushes, B against the same city unfixed).
- Budgets met (worker bench after step 4: 60 fps at every stage, main thread at most 2.8 ms p95, sim tick 6.6 ms avg and
  17.9 max against 25). Some stages read 20–50% above Phase 3 (District 4.5% 2.13/2.8 ms, whole map 0.94/1.4 ms); the
  headless A/B put the sim's share at about +0.4 ms per step.

### Left over from Phase 4
- **Superseded by plan v4** (kept in the code until Phase 5 replaces it): the property tax, business takings and
  grants as income (the toll becomes the only income); the population milestones and the Career win at 6,000 (Phase 5
  has levels and drafted cards); the 'Cars' chips (random traffic) and the growth-option select in the perf panel.
- The bottleneck attribution books a spillback queue to the junction upstream (the 100 m queue zone is longer than an
  80 m block); the list flags "queued back from downstream", but a cause-finding pass (follow the queue to the first
  item at capacity) would serve the live stress test.
- Roundabout entries wait long at low volume (about 50 s per vehicle, LOS E at v/c 0.08 on the bench city).
- The economy is generous: seed 1 has $399k at pop 4,857 on day 36 with 1% upkeep. Moot once the toll is the only income.
- `City.hours` (before/after) is not saved: after a load it starts empty.
- Phase 3's 100-lot contact sheets still wait for the owner's review.

## Phase 5, event round MVP (the stadium): done

Goal and gate: GAME-PLAN section 1.0 and the phase table (gate: a scripted player completes a Level 1 stadium round;
replaying it after the player's fixes raises the arrival rate measurably; 100% is reachable; the surge holds the sim
budgets).

**The owner's answers (2026-10-18; GAME-PLAN section 7, items 6–13):**
- **Time:** the sim runs during the 10-minute build (a "Start now" button ends it early); the surge is about 10 real
  minutes at 1x to kick-off; pause and 2x/4x are allowed in the surge, and edits work while paused. During a round the
  day clock is frozen at event evening; the HUD shows real-time countdowns.
- **Towns:** three of about 1,500 people (300–500 m across), placed instantly, 1.5–3 km apart; the stadium 1–2.5 km
  from each; +25% town growth at 100% arrival.
- **The toll: by the network.** Cars take any road; one that reaches the lot around the toll pays nothing. Fixed price
  per level.
- **Surge:** Level 1 about 1,200 cars (parties of 3), +40% per level.
- **Money and losing:** upkeep keeps running, through the rounds too. Income is the toll plus the event's payout by its
  success or failure (the arrival rate). The event is the first of several growth mechanisms (others later).
  Bankruptcy (Phase 4's rule) stays.
- **Cards:** pick 1 of 3, no rarity; unlocks and one-off upgrades; the roundabout becomes a card.
- **Passengers: pedestrian sprites** (walkers bay → stop, a crowd at the stop, walkers doors → stadium). Placeholders
  from the TrickOrTreat character sheets until Phase 8.
- **Old events (Phase 6):** a setting, adjustable for the gameplay tests.

**Design (lead, 2026-10-18).** All tunables live in one file, `src/game/event/config.ts` (build and surge seconds,
crowd per level, party size, toll price, booth service time, bus seats, payout curve, card pool), so balance is data.
- The round lives in the city worker (`City.round`), so the headless gates drive it the same way. Stages: `free` (the
  day clock runs; the player starts the next round) → `build` (wall-clock 600 s, not stopped by pause; headless gates
  pass the time in) → `surge` (sim time, 600 s to kick-off; pause stops it) → `eval` → `draft` → `free`.
- The day clock: `sim.t` stays monotonic (physics, trip ages); a new `clock` (sim.t less the frozen seconds) drives the
  demand profile, the town's hours and the economy's days. A round freezes it at 18:00.
- Upkeep keeps running: during a round it is booked per sim second (the daily rate / 1,440) into a round ledger.
- Several towns: one `Town` (the lot states) with several centres; each lot belongs to its nearest centre; reach is
  from any town centre (the highway entry stays as it is). The towns start unconnected: linking them to the event is
  the player's work.
- The Toll Gate is a short road piece of its own kind (one lane per booth inbound, a service-time stop at each booth
  line, a cost in the routing so drivers avoid it when a free way exists); every car that clears a booth pays.
- The parking lot is a placed rectangle by a road: entrances on that road, bays from its area, a fill rate per
  entrance; a parked car is drawn in its bay and its party becomes walkers.
- Buses are sim vehicles on a looping route (lot stop → doors stop → back), loading from the stop's crowd.

Steps (each ends verified, committed and written up here):
1. **Three autonomous towns.** The valley generator picks 3 town sites (flat land, 300–500 m, 1.5–3 km apart, off the
   map edge), seeds each with a small street grid and stamps it instantly to about 1,500 residents (the Town's own
   allocation, without the clock); growth per town from its own centre; reach from every town centre; saves; town gate
   adapted.
2. **The event site and the round.** The stadium site placed by the game (a footprint 1–2.5 km from each town, on
   flat land, with doors and a kick-off; drawn as a placeholder footprint; roads cannot cross it); the crowd per town
   (size and distance); `src/game/event/config.ts`; the round state machine with the frozen day clock and the round's
   upkeep; the HUD (stage, countdowns, "Start now", the crowd per town).
3. **The parking lot.** A placement tool (drag a rectangle beside a road; bays from the area; entrances on the road),
   cost; in the sim a sink with a fill rate per entrance and a bay count; parked cars drawn in the bays; saves.
4. **The surge trips.** At the surge start each town sends its crowd from its houses' driveways on a departure wave
   toward kick-off, routed to the nearest lot entrance; arrivals, misses and the arrival rate (at the lot for now);
   the HUD's live counts.
5. **The Toll Gate.** A placement tool on a road (booths 6 to start); the lane graph (the fan-out, one lane per booth,
   the merge back), the service-time stop and revenue per car, the routing cost; drawn as a widened plaza with booth
   markers; the toll in the round ledger; saves.
6. **Shuttle buses and walkers.** The bus route tool (the lot stop to the doors stop, routed on the network); buses as
   sim vehicles that dwell, load and unload; walkers (bay → stop → bus; doors → stadium) streamed to the renderer as
   sprites (placeholders from the TrickOrTreat character sheets); the arrival now counts at the doors.
7. **Evaluation, payout, levels and cards.** The evaluation screen (arrival rate, toll, payout, misses by town and
   where they were stuck, the previous run); the payout by arrival rate; the income switches to the toll plus the
   payout (property tax, takings, grants and the Career off); level-up and the draft (pick 1 of 3); the roundabout
   locked until its card; at 100% the towns grow +25% and the stadium goes up a level; rerun or next round.
8. **Live edit tools.** Add a lane (new wider classes; upgrade a stretch in place), widen a turn (a junction's corner
   radius up, turn speeds up), turn lanes (an approach flare with a turn-only lane); paid from the treasury during the
   surge.
9. **Balance and the Phase 5 gate** (headless, on the fix-gate harness): a scripted player builds the links, the toll,
   the lot and the bus route; runs Level 1; fixes the worst items; reruns: the arrival rate rises measurably; a
   generous build reaches 100%; the surge bench on the worker holds the sim budgets.

### Phase 5 progress
1. **Three autonomous towns. DONE** (2026-10-18; commits `e7c8d09`, `c6c0f7f`, `c773978`). The terrain generator picks three
   town sites (64 x 64 buildable blocks at least 128 tiles from the border, 750–1500 tiles apart, the most buildable land
   around them; a new guarantee, retried like the others: seeds 6, 10, 11 and 17 of 1–20 need a retry). A new valley lays
   an 8 x 8 street grid (40-tile blocks, avenues on the middle lines, legs only on buildable land) at each site, and the
   city worker stamps them: the Town's own allocation, lots BUILT at once (30% UPGRADED on paved roads), civic lots per
   town. The Town keeps several centres (each lot belongs to the nearest), per-town residents, built and civic lots;
   reach is from every town centre; the planner grows the towns in turn, hour by hour. With no centres everything runs
   as before (town:gate's day lines are identical).
   - **Decision (lead): about 1,000 residents per town, not 1,500.** An 8 x 8 grid holds 320–420 lots (about 1,000
     residents); terrain can cut a town (seed 2's first town stamps 773). The crowds come from the event config, not
     from the town size, so this costs nothing; the towns still grow with their own gravel roads.
   - `npm run towns:gate -- 1,2,3 2`: residents per town after the stamp 1001/931/1000, 773/1078/1000 (seed 2),
     1039/1017/1029 (seed 3); all hold or grow over two game days; stamp 230–500 ms; City.step mean about 5 ms, max 32 ms.
   - **Dev sandbox (owner's request, 2026-10-18, commit `ddea358`):** on the dev server the towns start as bare grids
     (no instant stamp) and grow 20x faster (construction, the growth rate and the gravel planner), with unlimited money
     (the treasury shows ∞, spending and the day's books leave it alone, no bankruptcy). URL options: `?grow=N`,
     `?stamp=1` (the instant towns), `?money=0`. A badge in the top bar shows what is on. The production build, the
     bench and the gates use the defaults. Also a **20x** speed button. Checked in the browser pane: one town at 1,659
     residents after about a minute at 20x (13 fps in the pane while a thousand lots compose).
2. **The event site and the round. DONE** (2026-10-18; commits `331655c`, `bb78b25` and the UI commit after it).
   - **The day clock** (`sim.clock = sim.t + shift`): the time of day, the town's hours, the books' days and the trips'
     demand read the clock; physics, trip ages, signals and the hourly decay read `sim.t`. A frozen clock keeps the lot
     trips coming every 60 sim s at the frozen hour's demand, so the evening traffic keeps running. Saved as a shift.
   - **The config** `src/game/event/config.ts` (build 600 s wall clock, surge 600 sim s, the clock frozen at 18:00, Level 1
     1,200 cars, parties of 3, +40% per level, the stadium 100 x 80 tiles, 500–1,250 tiles from each town).
   - **The site** (`event/site.ts`, placed by the game from the terrain and the town centres; the city worker and the
     engine get the same one): seed 1 (832, 768) at 510–522 tiles from the towns, seed 2 500–510, seed 3 508–936. The
     score (spread + 0.25 x mean distance) favours the near bound, so the roads to build are about 1 km each.
     The crowd splits the level's cars over the towns by population.
   - **The round** (`event/round.ts`, in the city worker): free → build (wall clock; Start now) → surge (sim time to
     kick-off; pause stops it) → eval → free. Starting freezes the clock at the next 18:00; closing runs it again.
     Upkeep is paid live while a round runs (the daily rate per sim second; booked in the next ledger's upkeep). A save
     mid-round restores as free.
   - **UI**: the stadium as a placeholder footprint (concrete, pitch, four doors, `STADIUM · L1`); roads cannot cross it
     (the road tool refuses with a toast); the round panel (announce, `Build · 9:56` with the crowd per town, Start now,
     `Kick-off in`, `Event over · 0/1200 arrived`, Back to the valley). Checked in the browser pane on a stamped valley:
     the whole loop runs, the clock stands at 18:00 through the round and runs on after it; 10 minutes of round cost
     $11,237 of upkeep on the stamped towns' streets (balance in step 9).
3. **The parking lot. DONE** (2026-10-18; commits `16dccd7`, `bbdcc72` and the 3c commit after it).
   - `event/carpark.ts`: a car park is an axis-aligned rectangle beside a road; the frontage is the parallel ground road
     whose verge is within 3 tiles of an edge (the longest overlap wins); entrances on its centre line, one per 40 tiles of
     frontage (1–3); bays 2.5 m x 5 m in double rows off aisles, nearest an entrance first; $25 a tile. Valid: sides at
     least 12, buildable, no road verge or other car park or the stadium over it, no built lot under it, a frontage.
   - The sim's **entrance sinks**: a car bound for a car park treats its entrance as a stop while the entrance is busy (one
     car per `ENTRY_S` = 2 s; in practice a stopped car needs about 3.3 s to clear it: about 1,100 cars an hour per
     entrance) and parks when it gets in; a full car park turns it away. A queue forms on the road behind it. Headless:
     50 test cars from one town all park through one entrance in about 170 s.
   - The game: the car park tool (P; drag a rectangle; preview green/red with the bays, entrances and the reason or
     the cost), the asphalt and bay lines baked into the ground (like the lots' car parks), parked cars as sprites in
     the bays nearest an entrance, the label `P · parked/bays`, bulldoze removes one, saved. The lots overlay moved from
     P to K. The town never builds on a car park or the stadium site.
   - Dev: the car park panel has [Test 50 cars] (cars from roads joined to the car park).
   - **Known issue (for step 4):** everyday lot trips pick jobs and shops in the other towns, which are not joined yet,
     so those cars are lost at once (about one every 3 sim s on seed 1). Trips must stay within joined roads.
   - Balance note: 1,200 surge cars in about 10 minutes need about 7 entrances' worth of capacity, or a faster entry.
4. **The surge trips. DONE** (2026-10-18). `event/surge.ts`: at the surge start each town's crowd gets a seeded departure
   schedule (a bell over the first 75% of the surge, from its homes' driveways by residents), each car bound for a car park
   joined to its home (chosen by bays, entrances in turn); a town with no joined car park is stranded (all missed). The
   sim tags party cars with their town and reports parked / turned away / lost per town; the HUD shows them live, the
   result per town at kick-off; closing the round clears the party cars and empties the car parks. Everyday lot trips now
   only go to joined roads (the towns start apart; town:gate's day lines are unchanged).
   - **First headless round** (`output/dbg/event.ts`, a scripted player, not committed: seed 1, each town joined by one
     2-lane road to a hub road south of the stadium, two car parks of 624 and 1,540 bays, 3 entrances each): **109 of
     1,200 cars parked before kick-off (9.1%)**; ~1,000 cars still on the road. Worst items: the hub road (1,827 s lost)
     and the towns' exit junctions (LOS F at v/c 0.06–0.4). City.step mean 21–24 ms per sim second with ~1,500 cars
     (2.4 ms per step, inside the budget).
   - **Balance problem for step 9:** 1,200 cars leaving within 7.5 minutes is ~9,600 cars an hour; a 2-lane road carries
     ~1,800 an hour per lane, and unsignalled junctions far less. Level 1 must shrink (fewer, bigger parties) or spread
     its departures, so that a sensible build reaches 60–80% and live fixes reach 100%.
5. **The Toll Gate. DONE** (2026-10-18; commits `99abd01`, `c4cdf1c`).
   - A toll gate is a 30-tile plaza piece of a straight road (`TollDef`: its ends A→B, inbound A→B, booths). The lane
     graph gives the inbound direction one lane per booth (fanning out over 10 tiles from the road lane, back in over the
     last 10, onto all of the out road's lanes); each car takes the booth with the fewest cars on or bound for it, stops
     `SERVICE_S` = 4 s and pays (`tollPrice(level)`, $8 at Level 1); the routing puts 25 s on a toll, so drivers avoid it
     when a free way exists (the toll is "by the network", the owner's choice). The toll is income in the round and the
     ledger.
   - Throughput (cars/s, approach full; 1/2/3/6 booths): boulevard 0.093/0.182/0.271/0.543, street 0.089/0.179/0.271/
     0.336 (one exit lane). About 11 s per car per booth (4 s paying, ~7 s to move up): close to a real cash booth.
   - The game: the toll tool (T; hover a straight road at least 21 tiles from its junctions; inbound toward the stadium,
     R flips; $10,000 + $4,000 a booth), the plaza asphalt baked in the ground, booth islands and `TOLL · $8` in the
     overlay; the gate goes when its road piece is rebuilt or bulldozed; saved; the round panel shows the toll. Checked in
     the browser: test cars queue at the booths and park beyond.
   - **Reviewed: another simulator** (the owner's `Opus5_5-realistic-driver-behavior-simulator.zip`, a highway and a city
     sim). Worth taking: per-driver variety (styles with their own headway, acceleration, braking, reaction), the ACC
     model (IIDM + constant-acceleration heuristic), actuated signals (min/max green, extend on demand, skip empty
     phases), yellow decisions, strategic lane choice. Its architecture (an object per vehicle, `Math.random`) does not
     fit our 10k-car typed-array, seeded sim: ideas only.
     - **Tried and reverted: time-based gap acceptance with impatience.** Our gate already passes ~560 veh/h from a queued
       minor right turn against a 600 veh/h major road (1.8 s wait at low volume; `tests/gaps.test.ts` keeps it), and the
       port made the grid gridlock test worse (mean speed 3.90 → 1.84 m/s). The LOS F at the towns' exits in the
       headless round is spillback from the jammed hub road, not gap acceptance.
     - Still open: actuated signals and driver variety (both move every gate's numbers: do them with a before/after).
   - **Live congestion heat map (owner's request, 2026-10-18; commits `5ee20eb`, `bc23cdc`).** The owner found the hourly
     v/c Flow overlay not good enough (a jammed road read green). The Flow overlay (F) is now live: the worker keeps per
     direction of each road the speed against the limit and the density (EMAs of ~5 s, 0.03 ms per sim second) and posts
     them twice a second while it is on; the overlay draws each direction with traffic in four bands (Flowing 75%+,
     Slow 50–75%, Heavy 25–50%, Stopped under 25%; the dataviz status palette `#0ca30c #fab219 #ec835a #d03b3b`), a glow
     under a solid core, Stopped thicker and pulsing; a legend. The owner chose the congestion view only (not the delay
     hotspots, volume or event-crowd views offered). The hourly report still feeds the Bottlenecks panel.
   - **Fix (owner's report: no cars drove to the stadium, commit `fe84888`):** a car park kept the frontage seg it was built
     on; once that road was split (a new junction, the town's gravel) every town read "no car park reachable". The city
     now rebuilds its car parks after every network batch, and the surge takes a car park's road from its entrances.
6. **Shuttle buses and walkers. DONE** (2026-10-18; commits `07430b2` and the 6b commit after it; art `257ad90`).
   - A bus route (`event/bus.ts`): a lot stop on a road beside a car park and a doors stop on a road near the stadium,
     resolved to lanes like the car park entrances; 8 buses of 60 seats (the starting kit: the first route is free, then
     $15,000). Buses are sim vehicles (vtype 5, 12 m; the schoolbus art as a placeholder) that exist from the surge start
     to the close, board one fan per 0.5 s (leave when full, or the queue is empty after 5 s, or at 40 s), unload one per
     0.3 s, and loop.
   - Walkers (`event/crowd.ts`): each parked party becomes 3 fans walking (1.4 m/s, straight) from its bay to its car
     park's bus stop (the shortest queue), or straight to the nearest stadium door when the car park has no route; fans off
     a bus walk to the nearest door. **The arrival rate now counts fans at the doors before kick-off** (of cars x 3).
   - Drawn: stop markers, the queue as a crowd with its count, walkers from a 12-frame placeholder strip cut from three
     TrickOrTreat character sheets (`scripts/assets/prep-walkers.mjs`; Sam plain, Jess a witch, Tommy a vampire: Phase 8
     brings fan art); dots at far zoom. The round panel counts per town: parked cars, at the stop, on buses, fans arrived.
   - Checked in the browser on the dev valley (a scripted hub road south of the stadium, two car parks, a bus route): the
     whole chain runs (cars park, fans queue and ride, 60 of 3,600 fans in at 3:32 to kick-off with the jams of a naive
     build). Headless test: 90 fans from 30 cars all arrive; walking-only arrival = distance / 1.4 m/s.
7. **Evaluation, payout, levels and cards. DONE** (2026-10-18; commits `c1748cd` and the 7b commit after it).
   - **Payout** (the owner's "money from the success or failure of the event"): at kick-off, up to +$60,000 x the level's
     crowd factor from 50% to 100% arrival, a penalty down to -$20,000 below 50% (`payout()` in the config). On the
     three-town valleys the income is the toll plus the payout; property tax, takings, grants and the Career are off;
     upkeep runs on. The single-town gates are unchanged (fix:gate seed 1 day 36: -19.9%, bankrupt on day 5).
   - **Levels and cards:** every finished round offers 3 seeded cards from the pool (roundabout unlock, +2 booths on every
     gate, double-decker buses 100 seats, +4 buses per route, express entry 1.4 s); the pick raises the player level and is
     needed to close the round. A perfect run (100%) raises the stadium level (x1.4 crowd) and stamps the towns +25%.
     Decisions (lead): each round levels up (not only good ones); +2 booths and +4 buses also apply to existing gates and
     routes. On the event valleys every road class, bridges, tunnels and signals are open from the start (the owner's
     starting kit); the roundabout waits for its card.
   - **The evaluation screen:** the rate and its change since the last run, fans by town and where they were stuck, the
     money line, the 5 worst bottlenecks at kick-off with Go (jumps there with the heat map on), the draft, Back to the
     valley. Checked in the browser on the dev valley: 4% in (a naive build), payout -$18,233, a card picked (Level 2,
     seats 100), the round closes.
   - The worker PC did not answer SSH on 2026-10-18 afternoon (connection timed out): the slow checks ran on the dev PC.
8. **Live edit tools. DONE** (2026-10-18). A new class **Arterial** (2 lanes each way, no median, 16 m, $400 a tile);
   **Add lane** (toolbar, one click widens the straight run of the road under the cursor between junctions: gravel /
   lane / street / road → arterial, avenue → boulevard; toll plazas excluded; paid as the road tool's upgrade; works during
   the surge since the network rebuilds instantly); junction flags **Widen turns** ($3,000: the connectors' turn speeds
   as for twice the radius) and **Turn lanes** ($2,000: on 2-lane approaches the left lane turns left only), set with the
   junction tool's mode switch, a `flags` net op, saved as a 4th node entry. Checked in the browser: a road run widened to
   an arterial for $16,000; it paints 4 lanes with a centre line and dividers.
   - **Deviation (lead, owner away):** flared turn pockets (an extra lane added only near the junction) need new lane-graph
     geometry: moved to Phase 7 (road builder pro). The 3-lane classes also wait for Phase 7 (freeways).
9. **Balance and the Phase 5 gate. DONE** (2026-10-18; commits `5e8a0ab`, `72513dd` and the economy commit after it).
   - **Balance found headless** (`output/dbg/event2.ts`, the lead's experiments; seed 1):
     - Level 1 as first set (1,200 cars, 3,600 fans) was more fans than the three towns have residents; even arterials got
       2% in. **Level 1 is now 240 cars (720 fans), departures over the first 55% of the surge** (a late leaver could not
       make it: a ~1 km drive, the car park queue and a walk of up to 300 m).
     - **Car park entrances queue off the road** (an entry lane of 10 cars; before, one waiting car held the whole road at
       one entrance's pace) and **take both directions** (before, cars arriving on the far side looped through the towns
       looking for a U-turn: plain corners have none).
     - **Closing a round clears all traffic** (a surge left the towns' junctions gridlocked, so the replay collapsed from
       48% to 15%).
     - Builds on seed 1: a naive build (one road link per town into a hub, tolls) 48%; the towns' middle avenues widened
       to arterials with the links leaving from them 66–69%; each town its own feeder and car park 100%.
     - **Signals hurt here:** the fixed-time lights (18 s green) at the three worst junctions cut a replay from 48% to
       38%. Actuated signals (from the reviewed simulator) are Phase 6 step 1.
   - **Economy (lead, owner away):** a new three-town valley starts with $600,000 (the single-town path keeps $80,000);
     the toll is $25 a car; a perfect Level 1 round pays $100,000 (the penalty stays -$20,000). The construction prices are
     unchanged (a 1 km 2-lane road ~$110,000; a spine of arterials ~$250,000).
   - **The gate** (`npm run event:gate -- [seed]`, `scripts/sim/event-gate.ts`): A a naive build's Level 1 round; B the
     same city replayed after the scripted player's corridor fix (for each town with 20%+ of its cars late: its spine
     widened to arterials, a bypass link from the spine to the hub, its link widened); C a generous build (each town its
     own feeder and car park on the stadium side facing it); D the sim budgets over the three surges.

### Phase 5 gate (2026-10-18): PASSED on seed 1
- **A scripted player completes a Level 1 stadium round: PASSED** (A: 47.9% of fans in; the treasury moved exactly toll
  + payout - upkeep).
- **Replaying it after the player's fixes raises the arrival rate measurably: PASSED** (B: 58.8%, +10.8 points).
- **100% is reachable: PASSED** (C: 720/720 fans, every town).
- **The surge holds the sim budgets: PASSED** (1.44 ms per sim step mean, 17 ms max against 25; ~540 cars at the peak).
- Seeds 2 and 3, for information: A 53.3% / 49.6%, B +4.6 / -18.3, C 83% / 75%, budgets met. The scripted player's
  fixed layouts (an L-shaped bypass, feeders on fixed sides) fit those valleys badly (seed 3's bypass is 1,098 tiles
  through the terrain); a smarter scripted player is Phase 6 work (its gate needs two events on one map at 95%+).
- The worker PC did not answer SSH all afternoon: every check ran on the dev PC. The GPU bench was not rerun for
  Phase 5 (the overlay's heat map and the walkers are 2D overlay work; the sim budget is checked headless above).

### Left over from Phase 5
- **Town gridlock:** a surge can lock the towns' 1-lane grids (junctions at LOS F at v/c 0.06 hold cars for good; towing
  takes 300 s). Closing a round clears it, but a cause-finding pass (box blocking, priority deadlocks) is due.
- Fixed-time signals cut capacity at surge volumes (above): actuated signals next.
- The scripted player only knows fixed layouts (seeds 2 and 3).
- Flared turn pockets and 3-lane classes: Phase 7. Pedestrian art and the stadium, toll and car park art: Phase 8.
- Buses pay the toll like cars; the left turn into a car park entrance does not conflict with oncoming traffic.
- The main thread's money mirror catches up with a payout at the next budget message (posted at each stage change).
- Old saves' taken cards are counted as applied (no effect replayed).
- Phase 3's 100-lot contact sheets still wait for the owner's review.

## Phase 6, expansion (new events, overlapping networks): in progress

Goal and gate: GAME-PLAN section 1.0.4 and the phase table (gate: two events on one map, each at 95%+ arrival in the same
session; budgets met). Started 2026-10-18 in the same chat as Phase 5 (the owner's wish), **the owner away: the open
questions take the lead's recommendation, logged here as "lead, owner away"**.

**Decisions (lead, owner away, 2026-10-18):**
- **Old events (GAME-PLAN section 7, item 11; the owner asked for a setting):** a setting `oldEvents` with three modes:
  `together` (default: every event surges in the same round, each with its own arrival rate, all counted), `background`
  (old events surge as load, only the newest counts), `schedule` (old events rerun every third round). The next new
  event appears when the newest event reaches 100% while every counted old one holds 95%+.
- **Event types** (one table in the config; placeholder footprints and labels until Phase 8's art), in the order they
  appear: the stadium (as now), a concert arena (60 x 60 tiles, 0.8x the crowd, parties of 2, kick-off 21:00), a festival
  (140 x 100, 1.2x, parties of 4, departures over 75% of the surge, 14:00), a water park (90 x 70, 0.9x, parties of 4,
  11:00), the casino boulevard (160 x 40, 1x, parties of 2, 22:00). Each is placed by the game 1–2.5 km from the towns
  and at least 300 tiles from the other events. A round freezes the clock at the earliest kick-off among its events.
- **Era pacing (section 7, item 1):** moves to Phase 8 with the look (the eras are an art matter now).
- **Cards added:** electronic tolling (service 4 s → 1.5 s), slip lanes (the 'slip' junction type, locked until drafted;
  the owner's starting kit lists stop/yield and signals only), rest stops and fatigue (simple: drivers slow after 8 minutes
  on the road; a placed rest stop resets them), green wave (offsets of signals along a road). No rarity.
- **Signals become actuated** (from the reviewed simulator; Phase 5 showed fixed-time lights cut capacity): min 7 s,
  max 40 s green, extended while cars approach, empty phases skipped, rest on green.

Steps:
1. **Actuated signals.** Stateful signal plans in the sim (min/max green, extension by approaching cars within 30 m,
   skip empty phases, rest on green); the worker sends the signal states to the renderer; measured before/after on the
   T-junction test, the Phase 2 sim gate and an event-gate replay with signals at the worst junctions.
2. **Several events.** The City's event list (type, site, level, runs); the next event placed at 100% (new site rules);
   a round runs the events by the `oldEvents` setting; each town's crowd split per event; car parks and bus routes serve
   the event whose site is nearest; the evaluation and the payout per event; saved.
3. **Event types.** The config table above; footprints, labels and doors per type; kick-off clocks, party sizes and
   departure spreads.
4. **More cards.** Electronic tolling, slip lanes (locked), green wave, rest stops and fatigue.
5. **Difficulty.** Per-event levels and the crowd curve within the 10k-car budget; the town growth at 100% per event;
   a check that Level 5 crowds stay inside the sim budgets.
6. **The Phase 6 gate** (headless): a smarter scripted player (terrain-aware links, a car park and feeder per town per
   event) brings two events on one map to 95%+ each in the same session; budgets met; the GPU bench when the worker PC is
   back.

### Phase 6 progress
(none yet)
## Phase 6R, roads first (the owner's direction, 2026-10-18 evening): in progress

The owner came back mid-Phase 6 and put the road work first (pulled forward from Phase 7); Phase 6's events resume after
it (its step 1, actuated signals, carries over). **The owner's words, 2026-10-18:**
- Multi-lane roundabouts (1, 2 and 3 lanes); **the roundabout driving "is completely broken"** (a bug: first).
- One-way for every road type; **"all the road types that exist in real life"** (as Cities: Skylines has), and a way to
  **flip through the variants** of a type.
- **Junction editor:** place lights at an intersection, then flip through all the junction types; add **slipways on
  some or all sides**, with **turn lanes in the middle**; "whatever you get in real life"; **mini-roundabouts** (a small
  yellow circle in the road where drivers take turns) instead of two stop streets.
- **Snapping:** each road end has a single place it snaps to and attaches to another road, and every join looks seamless.
- **Towns:** the town's own growth roads must not connect to arterial routes; the player builds town roads as well; the
  towns start as **small seeds whose roads are not bigger than the town**; **a growth target unlocks the events**.
- **Terrain:** less empty space around the edges of the map, more hills and valleys, so roads follow the land instead of
  grids.

Steps (each verified, committed, written up here):
1. **Roundabouts that work** (diagnose the ring logic in the browser and headless; fix entry/circulation/exit), then 2- and
   3-lane rings (lane choice by exit: the outer lane for the first exit, inner lanes for later ones; bigger radii).
2. **The road catalogue**: a parametric road model (lanes each way 1–3, one-way, median none/painted/planted, shoulders,
   sidewalks, trees, a centre turn lane, bus lanes, gravel) and the real-life types built from it, grouped in families
   (small, medium, large, rural); one-way in the lane graph and the painter (arrows, no centre line); the variant flip
   key (cycles the variants of the type in hand: one-way, trees, median, turn lane).
3. **Snapping and seamless joins**: one snap point per road end (its centre line end); a new road snaps to an end, a
   node or a point along a road; joins between different types blend (lane counts taper, kerbs and markings meet).
4. **The junction editor**: a junction's type flips through plain / all-way stop / two-way stop / mini-roundabout /
   signals / roundabout 1–3 lanes; per-arm slip lanes (on some or all sides) and turn lanes in the middle (flared
   pockets); mini-roundabouts in the sim (take turns, yield to the right).
5. **Highways and ramps** (one-way 1–3 lanes, no junctions, on/off ramps; grade separation over roads).
6. **Terrain**: more hills and valleys across the map, less flat space at the edges; the town sites and the event sites
   still placeable.
7. **Towns as seeds**: each town a small seed (a few streets inside its own footprint, ~150 residents); the player builds
   town streets; the town's growth roads join only local streets (gravel, lane, street), never the main road classes;
   **a growth target unlocks the events** (the stadium at 1,500 residents across the three towns; later events need more).
8. **A check of the whole road set** (screenshot tests per type and junction; a sim capacity test per junction type).

**Order changed (the owner, 2026-10-18 evening, GAME-PLAN 1.0.00 "the businesses"):** steps 1–4 (roundabouts, the
catalogue, snapping, the junction editor), then **Phase B, the business layer** (the player places and pays for
businesses, the stadium first; a business tree unlocked by success; revenue per visitor who arrives; cards become
upgrades; it replaces Phase 6's events), then steps 5–8 (highways, terrain, towns as seeds, the road set check). Also:
small public car parks on open town lots as part of the town's growth (a small task alongside).

### Phase 6R progress
- **Road upgrade/downgrade ladder and fair costs (asked 2026-10-19 night, done 2026-10-20, branch `claude/road-ladder`).**
  - `WIDER` is now one step at a time: gravel -> street -> road -> arterial -> six (lane -> street); avenue -> boulevard -> grand; the
    one-way, trees and grass-median chains as before (street.tr -> arterial.tr, the road has no tree variant). `NARROWER` walks it back
    (turn-lane arterial -> road; gravel, lane, avenue and divided are the bottoms; six, grand and divided the tops).
  - Toolbar: ➕ Add lane replaced by ⏫ Upgrade road (N, tool id still `lane`) and ⏬ Downgrade road (Y, tool `downgrade`); both toggles,
    both reverse a one-way run on right-click. The Downgrade preview is blue, Upgrade amber, refused red.
  - Costs (`segValue` = length x class cost x STRUCT_COST, `roadValue` sums the map): an upgrade charges (new - old) x length, a downgrade
    refunds it; the bulldozer refunds the fall in `roadValue` (so the dead ends `tidyEnds` trims count); Replace charges the new road less
    the measured value of what it removes (negative = a refund), and its preview (`routeCost`) shows the net.
  - Checked in the browser (dev server from the worktree): all 16 classes up and down (each charge = class difference x length; up then down
    nets $0), a gravel run clicked down and up through street, road, arterial to six with the toasts and hints; bulldozer refunds on five
    classes = the value removed; Replace street->arterial $10,000, grand->street refund $18,800, road->road $0, preview = paid.
    Junction gallery: 1,134 junctions, 130 flagged (137 before; it builds at a random spot), none without a node. Tests: 421/422 (the one failure, "20 seeds ... under 4 s", is timing: seed 5 took 4.6 s while the
    machine was busy; no road code in it).
- **Houses follow an upgraded road (the owner, 2026-10-20: "they stay fixed and bleed over the road with hedges").** A widened road
  moves its lots back to the new verge (same key, the town keeps the house) but the client only re-composed a lot on a town event, so
  the old props stayed over the road. `TrafficClient.onLotsMoved` now reports lots whose rectangle changed and the engine re-queues them.
  Checked in the browser: a street run downgraded to gravel and back, its houses' nearest props 2.1 -> 1.1 -> 2.1 tiles from the centre
  line (hook off: they stay put). A class change that changes the lot width (street 8 -> road 10 tiles) changes the lot keys, so those
  houses are demolished rather than moved (as before); on gravel the town also keeps its side-street spots free (some lots go).
- **Replace preview fix (15176e6): seen in the browser 2026-10-20** (from the `claude/road-ladder` worktree): an arterial route laid over a
  street with Replace on shows the street piece amber with a dashed outline under the yellow route, nothing red; the build replaced it.
  Phase B (B.2 next) and the paint tool (its own worktree, branch claude/frosty-wilson-452c74) run in their own sessions.
- **Speed limits, ring and mini traffic, junction surfaces, right-click build (2026-10-19 late): DONE.**
  - *Speed limits by road size* (km/h): gravel and lane 30, street 40, avenue 50, road and arterial 60, boulevard 70, divided and six-lane
    80, grand 90 (were 29 to 72, not in size order). *Speed tiers* +20/+40/+60 km/h on every road, capped at 140 (`SPEED_BONUS_KMH`,
    `speedOf`, `RoadNetwork.speedTier`, a 'speed' netop, saved), open from 1990/1995/2000 (`SPEED_TIER_YEAR`; all in dev); chosen in the
    Roads panel ("Speed limits" chips), each road card shows its km/h. The lane graph rebuilds every lane when the tier changes.
  - Faster arterials exposed two ring faults: an inner-lane exit pulling away could still be over the outer lane when a ring car arrived
    (now a ring car stops short of an exit crossing a car on the exit occupies, `accelerate`), and a mini's ring gridlocked with all four
    arms in (a mini entry now also needs the arc after its own clear). Bench (600 veh/h, arterial): 1/2/3 ring lanes 46.0/5.3/4.4 s, 0
    overlaps, 0 towed. An approach of 2+ lanes per ring lane spreads evenly over the ring lanes (six into three: two each) so cars enter
    side by side; the equal-priority merge rule (longest wait first) gives the zipper order. A/B sim:gate step time unchanged.
  - *Junction surfaces*: between each pair of arms under 180 degrees apart the asphalt and the walk are filled from the node to where the
    facing kerbs (walk edges) meet; a sharp corner rounds wider (x 1.2 rad / phi); two arms straight on with different widths taper
    (over twice the step) on each side no other arm joins. `__junctionGallery()` (dev) builds 918 junctions (9 main x 6 side roads x 17
    shapes) and counts bare spots almost enclosed by surface (`junctionHoles`); 198 flagged before, the rest now small slivers at 30-60
    degree corners of the narrowest roads and a grand boulevard folding back at 45 degrees (left).
  - Right-click in the road tool builds the route, as Enter (a right drag still pans).
  - Corners between two road types (two arms, classes differ: a street turning into a rural road, a stub into gravel) left the outer
    corner square bare: the kerb fill (N, facing kerbs, their corner) now runs on the outside of corners too (not on a one-road bend,
    which keeps the route's round join). It and the walk fill only reach a corner behind the node within the wider half width + 4
    tiles; the crossing box is skipped past 150 degrees (both had painted the wide road's asphalt and walk up a narrow road nearly
    straight on); the different-width taper applies within 30 degrees of straight. Gallery now 1,134 junctions (corners added): 137
    flagged, the hairpins (a wide road folding back at 45 degrees) and small slivers at 30-60 degree corners of the narrowest roads.
  - A gravel road (or any road with a gravel shoulder) meeting a road with sidewalks: the sidewalk wraps round the corners on to it,
    runs along both its edges to the mouth, then tapers to nothing over 10 tiles (`GRAVEL_TAPER`); browser-checked street x gravel.
  - Checks: road tests 117/117, typecheck clean; full `npm test` earlier 418/421 (timing budgets only); `town:gate` and `sim:gate` PASS.
- **Junction wedges and parked cars (2026-10-19 night): DONE.** At a junction of 3+ arms each arm is now paved (and its walk
  laid) from the node to where its road's own surface starts (`nodeFeatures`): a street at 45° to a wide road, or a wide one-way
  turning at a junction, left an unpaved wedge (the owner's screenshots). Browser-checked: six-lane one-way turning with a street at
  45°, arterial with a 45° street, six-lane into a diagonal cross street. `CAR_SCALE` (0.8) now in sprites.ts covers parked cars too
  (shrunk about their footprint's middle; 1,236 checked at 0.8). Road tests 91/91.  Next asked by the owner: a paint tool for filled
  shapes (pavement, gravel, dirt, road textures; scale, rotate, border sizes; textures aligned to the iso view by default).
- **The road builder's stress test, and what it found (2026-10-19 night): DONE.** The owner: "put the road builder through its
  paces". `src/game/dev/roadfuzz.ts` (dev server only): `__roadFuzz(seed, steps, { half })` drives the real tools through the Game
  (routes of every class and variant, 90/45 bends, Shift, Replace, bulldozer, every junction type incl. 1-3 lane rings, Add lane,
  reverse) at random points and next to junctions, ends and rings in an empty box; after each action `netProblems` checks the box
  (roads on roads, crossings without a junction, corridors overlapping away from a junction, junctions under MIN_SEP apart, sharp
  joins, segs under a tile, ring arms too short, nodes or roads inside a ring, `checkGraph`); a new problem is a failure with the
  action log since the box was last cleared; `__roadReplay(box, log, upTo)` replays one. First run: 57 failures in 600 actions; now
  4 in 1,800 (384 roads built), the rest checker false alarms or one judgement call (below). Fixed:
  - checkLegs: a route may not double back (rule 6a) or run within two corridors of itself ('The road runs into itself'); the points
    it splits the network at (its own points, new junctions, nodes it passes over) are 2 tiles apart; new junctions MIN_SEP apart;
    parallel to 1e-4 (a diagonal through non-integer points slipped past at 1e-9 and a route was built on a road).
  - Cuts (bulldozer and Replace): `RoadNetwork.clearCut` widens a cut until each new dead end clears the roads around, the facing end
    and any ring's circle; `Game.tidyEnds` afterwards trims dead ends the cut left crowding a road (a seg taken whole made its
    neighbours dead ends) and drops dead-end stubs under 2 tiles. Replace joins an old road at the route's own end point.
  - Route points within 0.05 of a node weld on to it (`Game.weld`); terrain runs under 2 tiles take a neighbour's kind (ground at a
    leg's end grows to 2 tiles into the tunnel/bridge), and a split point within 2 tiles of a node on the route moves on to it.
  - lanes.ts `inset` at a bend: radius = widest lane offset + 1.5 (at 3 tiles an arterial's inner lanes had a connector of length 0
    at a right angle; a six-lane's crossed).
  - Junction tool: a ring is refused (not warned after the build) when an arm is under its radius + 6 (multi-lane) or + 2 (1 lane),
    or another road or node is inside it (`ringClash`); Add lane refuses a widening that crowds a road or grows a ring past its arms
    (`widenClash`). The junction tool now previews the ring it would build (circle and island at the real size, red with the roads in
    the way red and the reason written on it), as the road tool previews routes.
  - Known, left: Replace may cut a short piece of the road a route starts on when it lies in the new corridor next to a junction
    (the normal tool refuses that route as too close), leaving a gap between two junctions; seen once in 1,800 actions.
  - Also: moving cars are drawn 20% smaller (`CAR_SCALE` 0.8 in client.ts, their lamps with them), the owner's ask.
  - Checks: typecheck clean; `npm test` 414/415 (ext-terrain2's 4 s timing); `town:gate` PASS (5,124 pop, 0 jams); `sim:gate -- 1
    10000` PASS (20,961 arrived, 61 towed, 0 lost).
- **Rings at awkward joins, and the road tool's Replace mode (2026-10-19 evening): DONE.**
  - *Cars dived into the ring and U-turned at the centre.* Cause: an arterial met the street 10 tiles from a junction
    (allowed: MIN_SEP 8) and the junction was made a 3-lane ring (rb 15): the arterial's own node sat inside the ring,
    its lanes ran on to the island and cars turned at its dead end there. The junction tool now refuses a ring whose
    arm is shorter than its radius + 2 tiles (`installCheck`, `ringRadius` in network.ts): "Too close to the next
    junction or bend: a 3-lane ring needs arms of 34 m (one is 20 m)".
  - *A road could be left anywhere on a ring.* `snapPoint`: any point in a ring's circle (rb + walk) snaps to its node;
    `checkLegs` rule 5: a leg may not enter a ring's circle except to end on its node ("Roads join a roundabout at its
    centre"; a leg from an arm's far node only keeps its centre line off the circle).
  - *Cars missed their ring lane after a short last piece of road* (a 45° bend near the ring): when the next dseg is
    under LOOK (80 m), the movement at its end is chosen one junction early (`Sim.ahead`), MOBIL biases the lane for
    both, and `start` takes the path that reaches it. Probe (skewed 2-lane ring, 900 veh/h): looping trips 16 → 7 and
    25 → 8 (no bend: 6). Test in roundabout.test.ts (fails before). sim:gate A/B, 1–2 days, 10k cars, seeds 1–3: all
    PASS, arrivals level (seed 2 +0.7 %, seed 3 −0.2 %; seed 1 −4 % was noise), mean speed 2–3 % lower (4.42 → 4.3
    m/s), towed 4–13 a day. `SEED` env for gate.ts added for such A/Bs.
  - *Replace mode* (Roads panel switch under Bends, key E; Shift stays the straight run): finishing a route first
    bulldozes the pieces it clashes with (`replaceCuts` in snap.ts: a seg along it, beside it in the corridor, or met
    at a shallow angle; a seg crossed at 30°+ away from its nodes, or leaving a route node at 30°+ from every way the
    route leaves it, is kept), then builds; checkLegs judges those segs as gone (`skip`). A route end on an old road
    cuts it exactly there, so the rest joins. Cut pieces show red while drawing. Also: a leg may now pass over an
    existing junction at 30°+ without a click there. Browser-tested: arterial over a street's middle, six-lane over a
    road through a crossing, grand boulevard along a 45° street, arterial over a ring arm into the ring centre (the arm
    beyond the ring kept). 8 Replace / ring tests in snap.test.ts.
  - Checks: typecheck clean; `npm test` 406/407 (ext-terrain2's 4 s timing on a loaded PC); `town:gate` PASS (5,124
    pop, 0 jams).
- **3-lane rings, the owner's follow-ups (2026-10-19 afternoon): DONE.**
  - *Cars dived to the island, went round, out the way they came and back in.* Cause: a car that could not get into
    its movement's approach lane (no gap in a queue) got a **random** movement its lane allows (sim.ts `planFrom`), often
    the U-turn on the inner ring. Now (with a destination) the router chooses among the reachable movements (no U unless
    it is the only one). Headless probe, six-lane 3-ring 900 veh/h per arm, trips with an in-out-in path: 46 → 1. The
    owner confirmed on a new map: cars drive the ring correctly. Also in this commit, the earlier session's uncommitted
    3-lane work: lane use 3 rings (R outer, S outer+middle, L middle+inner, U inner; lanes.ts `ring`), an entry's
    look-back along the ring (`ringComing`), and ring exits crossing the outer lanes take an ordinary gap (EXIT_GAP 4 s /
    EXIT_MIN 10 m) instead of the entry rule. Roundabout bench (600 veh/h per arm): 1 / 2 / 3 lanes 42.4 / 4.3 / 4.2 s,
    0 overlaps, 0 towed.
  - *A ring grown to more lanes reached into houses.* Lots now keep clear of a ring's circle (rb + widest walk +
    CLEAR; lots.ts `ringClear`, `blockers`): lots it covers go (the house is demolished, 'gone') and new lots form
    outside, which the town builds. (A bend or class change in an arm near the ring let lots start inside it.)
  - *The town laid gravel into rings.* `planExtension`'s `valid` refuses a leg within a ring's clearance + the gravel
    verge + GAP (a branch point of the 40-tile lattice could fall inside a ring).
  - *Dev unlock-all*: on the dev server every road class, junction (the roundabout without its card), tunnels and
    every lights tier are open from the start (`?unlock=0` plays the unlocks; the badge says "all unlocked").
  - Tests: lots.test.ts and roads.test.ts each gained a ring test (both fail before the fix). `npm test` 394/395 (the
    one failure is ext-terrain2's 4 s timing budget at 4.1 s on a loaded PC), typecheck clean, `town:gate` PASS
    (5,142 pop, 0 jams).
- **Multi-lane roundabouts: cars stopping on the ring (the owner, 2026-10-19: "cars drive in the 3-lane roundabout, stop
  in the middle, wait, then leave, and all the lanes wait for them"): FIXED.** Cause (probe `output/probe/rbstop.ts`):
  the exit gate's diverge rule (sim.ts `gate`) held an exiting ring car until the car ahead going on around was 6 m past
  the fork; ring cars follow 2–5 m apart, so nearly every exit behind a through car stopped dead on the ring and held
  the lane. Now the separation counts our own distance to the fork too (the strict rule only when that car stands).
  Tried and dropped: lane by exit (spiral markings): it starved 2-lane rings (arterial 800: 34 s) and let an inner exit
  clip a car just in on the outer lane of a 3-lane ring. Junction bench (SEEDS=4, before → after): arterial 2-lane 800
  veh/h 4-way 9.7 → 7.5 s; 3-lane 1000 veh/h 26.2 → 23.4 s (T 14.3 → 14.2); street 2-lane 600: 10.8 → 10.6 s; no
  overlaps. Worker: `sim:gate` PASS 43,233 arrived (was 43,482), 107 towed (97), 0 lost, 3.42 ms; `town:gate` PASS
  (5,142, 0 jams). Not seen live: the browser test ring got no traffic; the owner should reload and retest.
- **Junction editor, the rest (6R.4): all-way stop and mini-roundabout: DONE** (design: the addendum in
  `docs/JUNCTION-UX.md`). 'stop': every connector STOP at equal priority, so the longest waiter goes first; 'mini': the
  ring logic on one lane inside the crossing (island 1.2 tiles, painted white with a yellow rim; ring 6 m/s), arms up to
  2 lanes each way. Junction tool: brushes and Type control Plain · 4-way stop · Mini · Lights · Roundabout, Tab flips
  through them, badges 4S / MR, $300 / $1,500, open from 1985. Bench (street 300 veh/h per arm, SEEDS=4): plain 2.9 s,
  all-way stop 14.9 s, mini 4.3 s (10 min, 1 seed), signal 15.5 s, roundabout 4.9 s. Browser: panel, a stop and a mini
  on street crossings (the mini paints right). **Open:** stop bars did not show in the lead's browser pane (signals too), but a
  headless GroundPainter render draws them right beyond each zebra: likely a stale ground bake in that tab; recheck on
  a fresh load. **Left over:** mini at 400 veh/h per arm towed 3; the
  arterial mini showed 2 overlaps; give-way dashes on the mini not visible (same cause as the stop bars?).
- **The road catalogue (6R.2): DONE (2026-10-19).** Design in `docs/ROAD-CATALOGUE.md` (from C:S2's road categories and
  Replace tool, C:S1's upgrade tool, Road Builder / NE2). Every `RoadClass` now has `base` (type), `flags`, `family`,
  `vmax`, `laneLines[]`, `oneway`, `medianTrees`, `streetTrees`; the seven old ids are the plain variants with unchanged
  numbers (old saves load; `classOf()` falls back to street). New types: **six-lane** (3+3, painted median), **grand
  boulevard** (3+3, planted), **divided road** (rural 2+2, grass median, shoulders). Variants: **one-way** (street 2 lanes,
  arterial 4, six-lane 6), **centre turn lane** (arterial, TWLTL markings), **street trees**, **grass median**. The road
  panel groups types Small / Medium / Large / Rural with variant chips; **Tab / Shift+Tab flips the variant**. Add lane:
  arterial → six-lane, boulevard → grand (flags kept). Unlocks by type (six/divided at Large town, grand at City).
  **One-way:** flows seg.a → seg.b as drawn; drawing over it the other way reverses it; **right-click with Add lane
  reverses a straight run** (free); the b→a dseg has no lanes; junctions, rings, signals (no phase for an arm with no
  inbound lanes), driveways and car-park sinks handle it; painted arrows every 15 tiles, full-width stop bar on an
  inbound arm, none on an outbound one; the preview shows chevrons; a one-way dead end warns. Commits `df4a700` (the
  catalogue) and the one-way commit. `npm test` 386 pass; worker gates: `sim:gate -- 2 10000` PASS (43,482 arrived, 97 towed, 0 lost, 3.87 ms per
  step), `town:gate` PASS (pop 5,142, 0 jams, 1.48 ms). **Browser-checked:** grand, six-lane, turn-lane arterial and
  tree street painted; Tab cycles arterial's variants; a one-way street through lights (no head on the outbound arm),
  a one-way arterial through a 2-lane roundabout (lane overlay: entries only from the inbound arm), reversed by
  right-click (the ring's entries moved); a town street turned one-way: 10 live cars, 52 forward moves, 0 against the
  flow; no console errors. **Left over:** bus lanes (with Phase B's bus business), asymmetric roads (2+1) and highways
  (6R.5); the ring's entry geometry uses the last lane's offset on one-way arms; turn arrows on a one-way's last lane
  keep the two-way S+R rule; street trees every 8 m look dense (try 10–12 m).
- **The junction tool, rebuilt (2026-10-19, the owner: "no visual cue on the map", "why isn't type the parent"; then "don't
  lose what we have, research and make it better").** Design in `docs/JUNCTION-UX.md` (from Cities: Skylines II's road
  tools, TM:PE and C:S1's junction view). **Brush** cards (Select · Plain · Lights · Roundabout with ring lanes): a type
  brush applies to every junction you click, right-click resets to plain. **Select** a junction: an outline ring, its
  name, the type as a segmented control, and only that type's options: Plain (wide corners, turn lanes), Lights
  (slipways n of k with All / None and a "+" / "×" button at each corner on the map, wide corners, turn lanes, the signal
  tier, upgrades and the fixed-time split), Roundabout (ring lanes). Slipways are an option of Lights now (the 'slip'
  type stays in saves). **On the road:** turn lanes paint road-size turn arrows, wide corners a 2.2x kerb radius.
  **Badges** at every junction while the tool is open (F / A / Ad, RB n, W, TL, SL n). Every earlier feature kept.
  Commits `a0c1c34` (painting), the merge of the tool, and the polish after the browser check (brushes shrink to chips
  while a junction is selected, panels scroll above the legend, a same-type click just selects, the badge above the
  ring). Browser-checked with real clicks on arterial, street and mixed crossings: select, add a slipway at a corner,
  switch type, brush, right-click reset; lane graph clean.
- **Handover 2 (2026-10-19 morning; the chat got long, a fresh chat continues).** Done since Handover 1 (details in the
  entries below): approach flares; the junction UI (ring lanes, the Tab type flip, slipways per corner, the Signals mode);
  the calendar and the signal tiers; all ten Arena PRs merged (#1–#10, several finished by the lead on their branches);
  wired in: driver variety, traffic incidents, names, disasters (off by default), farms. Pushed to origin up to `4204cb0`;
  later commits are local (ask before pushing).
  - **Next (6R.2 and the rest of 6R.4 are done above): Phase B, the businesses** (GAME-PLAN 1.0.00; research first as
    ROAD-CATALOGUE.md / JUNCTION-UX.md; wire `ext/taxi`, `ext/subway`, T010's economics when its PR comes). *(Was:)* the rest of
    the junction editor (6R.4): the types the tool still lacks, all-way
    stop, two-way stop and the **mini-roundabout** (a small painted circle, take turns, yield to the right), as Plain's
    control options in the junction tool (research first, as JUNCTION-UX.md); then **Phase B** (the owner's order puts the
    businesses after steps 1–4). *(Was:)* the road catalogue (6R.2): a parametric road model (lanes each way 1–3, one-way, median none / painted /
    planted, shoulders, sidewalks, trees, a centre turn lane, bus lanes, gravel) and the real-life types built from it in
    families (small, medium, large, rural); one-way in the lane graph and the painter (arrows, no centre line); the
    variant flip key (cycles the variants of the type in hand). Today's classes are the fixed `CLASSES` table in
    network.ts (`h`, `laneCentres`, `median`, `shoulder`, `walk`, textures, costs; `WIDER` jumps gravel/lane/street/road
    straight to arterial): design the model so the old classes are presets of it and old saves load. Arena task T013
    (roads and land: a one-step up/down ladder with prices, building over lots with a confirm, natural town layouts)
    overlaps the ladder: coordinate (wire T013's ladder onto the catalogue when its PR comes).
  - **Then:** highways and ramps (6R.5; wire the merged `ext/grade` profiles and `ext/interchange` ramps); the hillier
    terrain (6R.6: switch to the merged `ext/terrain2`, tune lakes below 9.5% and hills toward 35%); the towns as seeds
    with a growth target (6R.7); the road set check (6R.8); then **Phase B, the businesses** (GAME-PLAN 1.0.00; wire
    `ext/taxi`, `ext/subway`, and T010's economics when its PR comes).
  - **Left over:** the slip fork overlap (a straight car and a right-turner side by side at the flare start; a diverge
    rule like the roundabout's); left pockets on the flares (the 'tl' flag) and the "brave drivers" on the shoulder
    (`ext/drivers` has `wantsShoulder`); re-run the event gate (new games start with fixed-time lights); the
    load-sensitive timing tests ("accACC ... ns per call", terrain "20 seeds ... under 4 s") fail when the dev PC is busy.
  - **Arena:** no open PRs; tasks without a PR: T007 fuzz testing, T010 business economics, T013 roads and land. The
    owner's rule: finish PRs yourself on their branches (worktree per PR, haiku-coder, your own probes), merge, wire in;
    no review comments.
  - **Workflow notes:** the junction bench is `scripts/bench/jx.ts` (use SEEDS); the owner's dev server on 5174 died
    last night and the lead runs the launch.json server there (if the owner starts his own, stop the preview first);
    the built-in browser pane pauses frames when hidden (call `__game.draw()` / the per-frame queues by hand for checks).
- **Pushed to origin 2026-10-18 evening** (the owner's go-ahead): main at `4732855` (54 commits since Phase 4).
- **Outside agents (the owner's request):** `AGENTS.md` and `agents/` (the Arena agent's instructions: code only, one task
  per branch and PR, standalone modules in `src/game/ext/<feature>/` with tests in `tests/ext-<feature>.test.ts`, the lead
  wires them in; a PR template; task **T001 subways**, a standalone underground rail module with its API and tests).
- **Roundabouts reworked: DONE** (commit `3614086`): real sizes (14 / 22 / 30 m outer radius for 1 / 2 / 3 ring lanes),
  turbo-style ring lanes, entries only when the ring lane has room to clear; zero overlaps on the bench; a 2-lane ring
  takes 600 veh/h per arm at 3.2 s mean delay (1 lane: 39 s). Checked in the browser. The ring-lane choice in the UI
  comes with the junction editor.
- **Snapping, the T fix and the red preview: DONE** (commits `4d667fc`, `6a398ac`, `613b511` and the aim fix): one snap
  point per road end, a road's whole surface snaps to its centre line, a road aimed at a road meets it square, the
  preview turns red exactly when the click would be refused. Checked in the browser on arterial and street joins.
- **Town bus stops and lot buy-outs: DONE** (commit `bcf949e`).
- **Junction bench** (`output/dbg/jx.ts`): on clean geometry every junction type is natural at low volume (waits of 0–5 s);
  signals and slips cope at high volume; the 4-way single-lane roundabout was the weak spot (fixed above).
- **Handover (2026-10-18 late, the chat got too long; a fresh chat continues):**
  - **The bus fix: DONE** (committed just before the handover): buses keep their route through road edits during a
    surge; town-bus fans need no car park. `npm test` 221 pass.
  - **Approach flares: DONE** (2026-10-18 night, the commit after `d4a8b23`). At a 'slip' node each corner the painter
    gives a slip island (`slipCorner` in network.ts, shared by the painter and the lane graph) gets a right turn of its own:
    the in arm's link lanes end at the slip arc's tangent point, approach lanes (flare 1) carry the queue to the stop line,
    departure lanes (flare 2) run from the box to the out arm's link lanes (which start at the other tangent point), and
    the right turn is a slip body (flare 1, free) plus a mouth (YIELD, prio 1) that merges into the exit. The sim gates
    after flare-1 lanes, counts the wait across them (router feed) and does not tow a car queueing on them. Numbers:
    `tests/flare.test.ts` (street, 500 veh/h per arm) right 3.5 s vs straight 16.8 s delay; the junction bench street slip
    4-way W/E/N/S 5.1/2.8/8.0/10.2 s (was 15.0/18.4/20.7/15.4), arterial 2.3/2.2/3.8/6.7 s; towed 0. Browser: street x
    street, arterial x arterial and arterial x street slip crossings built with the editor; the lane overlay (L) follows
    the painted slip roads; an in-page sim on those graphs: right-turn trips take half the straight ones' time (street 28
    vs 54 s, arterial 18 vs 46 s), 0 towed; no console errors. Not seen yet: a live car on a slip on screen (the town had
    15 cars). `npm test` 225 pass. **Left over:** at the fork (link lane end) a straight car and a right-turner can be
    side by side for a moment (the bench counted 1 overlap in 15 min): a diverge rule like the roundabout's would fix it;
    then left pockets (the 'tl' flag) on the same flare, and the "brave drivers" on the shoulder.
  - **Arena PRs reviewed (2026-10-18 night), changes requested, reviews drafted (not posted, waiting for the owner):**
    #1 T001 subways: trains deadlock when a line has more trains than its sections hold (2 stations and 4 trains deliver
    nothing; a 3-station loop with 6 trains stops at t = 57 s): `blocked()` counts a train dwelling at a track's start as
    occupying it; `meanWait` leaves out fans with no wait. #2 T003 grade: a different API and model from the spec (discrete
    levels and costs instead of `planProfile` / `crossingsOf` over terrain heights with vertical curves) and a second spec
    file `T003-grade.md` signed as the lead. The texts are in the session; local branches `pr1`, `pr2`.
  - **Arena PRs, round 2 (2026-10-18 21:00; the owner's rule: post review comments without asking, tell him, merge
    finished PRs and have a Haiku wire them in).** Merged to main on GitHub and pulled: **#4 T005 farms** (17 parcels on a
    test road, none on hill/water/road, no overlaps, all prop ids exist), **#6 T006 disasters**, **#7 T009 drivers**
    (ACC/IIDM/CAH match Treiber & Kesting; 2,040 veh/h per lane; string-stable ring), **#8 T008 incidents** (~7.8 a game
    day for 3,000 cars). Being finished by the lead (the owner, 21:15: no more comments, fix them ourselves on the PR branches and merge; a cron checks for new PRs every 5 min until 22:20): **#1 subways** (re-review: a 3-station loop with 7 trains
    still deadlocks at t = 67 s; two trains can share a section; results depend on dt), **#2 grade** (re-review: no
    vertical curves; wrong on hillsides, a profile through the crossed deck), **#3 interchanges** (radii under the
    minimums and grades up to 67%), **#5 terrain v2** (passes its numbers but the valleys are a jittered grid around
    flat-topped hills and the river is straight: the opposite of the owner's ask). **21:20–21:30:** merged **#9 T012
    names** and **#10 T011 taxis** (lead fix: every driver is paid for the shift, so fleet 1/5/20 profit $2,704/$3,012/$852
    a day) and **#1 subways** (haiku fix on the branch: one owner per block, FCFS at platforms, sub-steps of 0.1 s; the
    lead's probes: no deadlock for 3–9 trains on a loop, never two trains in a block, the same results at dt 0.1 and 1).
    #2, #3, #5 are being fixed on their branches. **Wiring:** the drivers wiring raised delays (street signal 4-way E
    147 s) and jammed the toll plazas (the booth's dwell window assumed a 2 m stop; per-driver s0 varies): parked in
    `output/review/drivers-wiring.patch`, being re-applied with the dwell windows on the driver's own s0 and a milder mix
    (15% aggressive, 15% cautious); then incidents (sim lanes and slow zones), disasters (closures), farms (rural lots),
    names (labels), taxis and subways (with the business layer).
  - **Driver variety wired: DONE** (commit `cff555e`): 15% aggressive / 15% cautious drivers with their own parameters,
    ACC on open road, IIDM inside junctions, at merges and behind obstacles, MOBIL politeness and threshold per driver,
    the stop windows on each driver's jam gap. Worker gates: `sim:gate -- 2 10000` PASS, 43,482 arrived (was 43,311), 97
    towed (68), 0 lost, 5.46 ms per step mean (3.95; budget 25 ms per 100 ms tick); `town:gate` PASS (pop 5,133, 0 jam
    episodes, 1.73 ms). Junction bench (street, 500 veh/h per arm): signal 4-way 18.6/41.8/33.3/45.5 s, slip 9.7/4.8/
    7.8/8.6 s; the slip fork still shows 3 overlaps (the diverge rule, left over from the flares). **#2 grade merged**
    (the lead's solver over the Arena agent's late fix, which still passed under the crossing on a hillside).
    **22:00–22:10:** incidents wired (commit `73970a9`: obstacles and slow zones in the sim, red/amber markers, a city
    switch, on), names wired (merge `6c3eb08`: town labels at map zoom, junction names in the junction panel and the
    bottleneck list, road names in the select hint; browser-checked), **#5 terrain v2 merged** (reworked by a haiku on
    the branch: domain-warped relief, branching valleys, a meandering river, no lattice; 20 seeds pass, hill 28–32%,
    buildable 56–60%; lakes fixed at 9.5% of the map: tune both when it is wired in as the map generator). Still open:
    **#3 interchanges** (a haiku is giving each type its real topology; the stack's left turns must be flyovers over the
    centre, and one-way roads must be honoured). Wiring in progress: disasters (off by default). Left to wire: farms,
    terrain v2 (switch the generator), subways and taxis (with the business layer), grade and interchanges (with the
    highways, 6R.5). Known: the slip fork overlap (a diverge rule); the timing tests ("accACC ns per call", terrain
    "under 4 s") fail when the dev PC is loaded.
  - **2026-10-19 morning: all ten Arena PRs merged.** **#3 interchanges merged** (finished on the branch: each type its own
    topology; the four-level stack with semi-direct flyovers at +14/+21 m, R 156 m, ~1 km across, no loops; one-way
    roads honoured; the lead's probe caught every outer right-turn ramp running B→A on the cloverleaf and the stack, fixed;
    all rules at 90° and 60°). **Disasters wired** (commit `c421976`, off by default; dev `traffic.disastersOn(true)`,
    `traffic.forceDisaster(kind)`; browser: a forced flood warned, closed 3 roads by the river, drew its area).
    **Farms wired** (commit `dbe6d1a`; browser: 8 farms along a new country road; the lead's fix: the town cuts lots
    along every road, so only lots the town builds on push a farm out). **Left to wire:** terrain v2 as the map
    generator (tune: fewer lakes than 9.5%, hills toward 35%), subways and taxis (with the business layer), grade and
    interchanges (with the highways, 6R.5). **Arena tasks with no PR yet:** T007 fuzz testing, T010 business economics,
    T013 roads and land. **Note:** the owner's dev server on 5174 had died (it served stale modules mid-edit); the lead
    started the project's launch.json server on 5174 in its place.
  - **The calendar and the signal tiers: DONE** (commit `988fbb7`, GAME-PLAN 1.0.01). The year is 1985 + the rounds finished
    (in the HUD; toasts at 1990 and 2000). Lights per junction: `Node.sig` 0 fixed-time / 1 actuated / 2 adaptive and
    `Node.split` (fixed-time green seconds per phase), saved in the node entry and replayed in the workers; new lights get
    the best open tier; the Junctions tool's **Signals** mode: the tier, a green-split slider per phase with the cycle
    length, upgrades ($1,500 actuated from 1990, $3,000 adaptive from 2000). **Adaptive** (lead's design after two Haiku
    attempts lost to actuated): max pressure with a lost-time margin (gap-out as actuated; hand over early when another
    phase's queue beats the served demand by 8 cars; up to 60 s green; the busiest phase next; a platoon held only when
    nothing waits). Over 6 seeds it beats actuated: street 500 veh/h 4-way 41.8 vs 46.6 s, T 17.7 vs 23.5; arterial 800
    4-way 25.0 vs 28.6, T 17.9 vs 22.8 (light traffic, street 300: within noise). Browser-checked on street, arterial and
    mixed crossings (new lights fixed-time in 1985, split slider applied, upgrades and the 1987 refusal). **Note:** new
    games now start with fixed-time lights, which have less capacity than the Phase 5 gate's actuated ones: re-run the
    event gate when the rounds are next tuned. **The junction bench moved to `scripts/bench/jx.ts`** (output/dbg was
    wiped; the other dbg scripts, event2/rb/rbgeo, are gone): `npx esbuild scripts/bench/jx.ts --bundle --platform=node
    --format=esm --outfile=output/jx.mjs`, then `SEEDS=6 SIGTIER=1 node output/jx.mjs 500 15 street signal`; single
    runs near saturation are very noisy (per-seed means range 35–63 s), so compare with SEEDS.
  - **Per-corner slipways: DONE** (commit `3a24eae`; browser-checked on street, arterial and mixed crossings: add and
    remove corners, the last one off gives plain lights, roundabouts refused, lane graph clean; the corner click searches
    18 tiles around, the island sits ~12 out).
  - **Junction UI:** ring lanes 1–3 and the Tab type flip DONE (commit `3720049`, browser-checked on street, arterial and
    mixed crossings and a bend); per-corner slipways in progress (haiku; a 'Slipways' mode, `slipOff` per node in the
    ops and the save, $1,000 a corner; resumed after the Haiku session limit).
  - **Arena task T013 (owner, 2026-10-18 night): roads and land**, one task in three parts: one-step class upgrades and
    downgrades with prices (today `WIDER` sends gravel, lane, street and road straight to arterial), building roads over
    lots with a confirm and the bill (no bulldozing first), natural town layouts (river, hill, crossroads, square, ribbon).
  - **Was next: approach flares (the slipways cars actually use; the owner: "I don't see any of them use it").** Cause: at a
    'slip' node the right turn is only a YIELD connector starting at the stop line, inside the shared lane, so a
    right-turner waits behind the red-light queue. Design (lead): at a configured arm the inbound dseg's link lanes end
    `FLARE` = 15 tiles before their normal end (lanes.ts `inset()`); the node owns the approach from there: straight
    continuation lanes (LK.CONN, ctl FREE) from each link lane's end to the stop line, then the junction connectors as
    now (ctl SIGNAL); and a **slip lane** (LK.CONN, ctl YIELD, prio 1) from the rightmost link lane's end along the slip
    curve (a bezier from that end, heading along the arm, to the right exit road's outermost lane start) straight onto the
    exit road: the right-turn movement's path is [link lane, slip lane, out lane]. Conflicts: the slip merges into the
    out lane (conflicts() over the node's lanes). Cars must be in the rightmost lane at the flare start (MOBIL's
    strategic `want`). The renderer already paints the slip road (network.ts slipIsland, R_SLIP 12). Test: a 4-way slip
    junction with red-light queues on every arm: the right-turners' mean delay far below the straight cars'; the junction
    bench `output/dbg/jx.ts` (`node output/dbg/jx.mjs 500 15 street slip`) and an overlap count of 0; browser check on
    street and arterial (the owner's rule: test road/junction work in the browser across classes before saying done).
    Later the same flare carries **left pockets** (the 'tl' flag) and the owner's "brave drivers" who run along the
    shoulder to reach a slip when the queue is long.
  - **Then, in order:** the junction UI (ring lanes 1–3 in the junction panel, flip through junction types, slips and
    turn lanes per arm); the calendar and the signal tiers (GAME-PLAN 1.0.01); the road catalogue with one-way and a
    variant flip (6R.2); highways and ramps, the hillier terrain, the towns as seeds with a growth target (6R.5–7, some as
    Arena tasks T002–T004); then **Phase B, the businesses** (GAME-PLAN 1.0.00; Arena task T010 holds the economics).
  - **Arena agent:** twelve tasks in `agents/tasks/` (pushed); review its PRs against `agents/arena/INSTRUCTIONS.md` and
    wire the modules in from `src/game/ext/`.
  - **Workflow notes:** the worker PC is `cworker` = 192.168.0.8 (moved after a power cut); the owner tests on his own dev
    server at http://localhost:5174 (it serves the working folder live: say when unfinished work may show there); the
    owner asked to be told when something lands; dev-only debug: `window.__game` in the page (roadClick/finishRoute with
    screen coords, setTool, parkTest, startRound/startNow) for scripted browser checks; `output/dbg/` holds the lead's
    headless scripts (event2.ts scenario builds, jx.ts junction bench, rb.ts/rbgeo.ts roundabouts).
- **Queued (the owner, 2026-10-18 evening): the calendar and the signal tiers** (GAME-PLAN 1.0.01): the year from 1985, one
  per finished round; fixed-time lights with a per-junction green split at the start, actuated from 1990, adaptive (busy
  direction bias, green waves) from 2000; saved.
- **Phase 6 step 1, actuated signals: DONE** (commit `0cf0e09`). Signal plans carry their state (the phase served, its
  stage and time): min 7 s, max 40 s green, extended while a car is within 30 m on a served lane, empty phases skipped,
  rest on green; the worker sends the states to the renderer; `Sim.fixedSignals` keeps the old rule for A/B. A 4-arm
  junction (900 + 150 veh/h): minor wait 4.8 → 4.2 s at the same throughput. `sim:gate -- 2 10000` on the worker: PASS,
  43,311 arrived, 68 towed, 0 lost, 3.95 ms per step mean (Phase 2: 4.6).
- **Town growth (the owner's request): DONE** (commits `78e5472`, `c4908e3`). On the three-town valleys the town's gravel
  keeps out of the stadium, car parks, toll plazas and bus stops and never joins or crosses a main road; the town grows
  slowly on its own ((5 + 0.02 built) lots a day, a gravel leg every 6 game hours) and fast along paved roads (6 lots an
  hour); each lot started on a paved road pays a **land sale** (30% of $2,000 x the frontage class value; a street pays
  back about 1.5x its cost). A round's jump to the event evening skips the town's hours (no catch-up burst).
- **Small public car parks in the towns (the owner's request): DONE** (commit `8fcaa88`): about 15% of commercial lots.
- **Roundabouts, the owner's report "completely broken":** traced headless (a 4-arm ring: every car circulates the right
  way and leaves at its own exit; 120 cars all through, none lost or towed) and in the browser. The owner's detail: entries
  wait with no one coming, and **"there isn't a clear uniform snapping system"**: the road tool only rounded clicks to the
  grid, so near-misses made extra nodes beside junctions (stubs, crowded junctions). The snapping system comes first
  (6R.3, in progress), then the roundabout and junction waits are retested on clean joins.
- **The owner (2026-10-18 evening):** you cannot build a road on top of another road without removing it first (drawing
  over a road no longer upgrades it; widening is the Add lane tool); bulldozing a town building buys the lot out (paid as
  compensation; queued).


## The Paint tool (ground areas): done 2026-10-19

The owner's ask: paint a solid shape with a brush, filled with pavement, gravel, dirt or a road colour/texture; shrink/grow
and turn the texture (pavement aligned to the perspective by default); a small/medium/large border with its own texture.
Design: [PAINT-TOOL.md](PAINT-TOOL.md). Built on its own branch (`claude/frosty-wilson-452c74`), merged up to main `3311ce9`.

What was built:
- `src/game/paint.ts`: the area model (polygon + texture, scale, angle, border size and texture), validity (3–200 corners,
  on the map, no crossing edges, at least 1 tile², at most 256 tiles a side), lasso simplification, hit test, save
  tuples. `tests/paint.test.ts`.
- Painted areas ride the lot ground channel (`LotPatch.paint`, key `paint:<id>`), so the workers re-bake only the chunks
  under an edit, at once. `GroundPainter.drawPaints` (renderer.ts): over the lot ground, under bridges, verges and roads
  (a road across a plaza paints over it). Textures: pavers, sidewalk slabs (running bond of the slab sprites + grime),
  concrete, the three asphalts, road gravel, gravel, dirt, field, grass. The texture is turned and scaled in tile space
  about the map origin (pattern = G · the screen pattern), so pavers turn on the ground and equal settings join without
  a seam; angle 0 = the iso grid. Borders: a band inside the edge in any texture, a kerb, or a row of slab sprites.
  The planner map fills areas flat.
- `src/game/paint-tool.ts` + `src/PaintPanel.tsx`: tool **Paint** (key **C**; A is the camera). Draw (click corners,
  click the first / double-click / Enter to close, Backspace, Esc; or press and drag a freehand outline), Pick (click an
  area; the panel then restyles it live; Delete removes it), Erase (click an area). Preview in the road tool's style:
  translucent fill in the texture's colour, border band, amber dashed outline and corners; red with the crossing edges
  and the reason by the cursor when invalid. Corners snap to whole tiles (toggle). Saved as `paints` (optional field, no
  version bump). Free for now (decoration).
- Engine and App edits are a few delegating lines (setTool, pointer and key hooks, overlay branch, save/load/reset,
  the TOOLS entry, the panel and the status line).

Verified: typecheck clean; `npm test` all pass except the known timing flake (ext-terrain2 "20 seeds ... under 4 s":
7.9 s for seed 1 on the busy local machine). In the browser (own server, port 5177): drew an area by corners (pavers on
the iso grid), picked it and changed it to slabs at 30° with a medium kerb, added six more (dark asphalt with a slab rim,
gravel with a small kerb, dirt with a grass rim, pavers at 45°, worn asphalt, road gravel at 50% with an asphalt rim),
roads paint over them; erase removed one; a freehand lasso made a 15-corner gravel area with a slab rim; a bow-tie
preview turns red with "Edges cross"; save + reload brought all areas back identical. Chunk bakes under painted areas are
no slower than plain ones (80 vs 115 ms per chunk on the busy machine, noise dominates). Benchmark (worker PC, RTX 3080, Chrome, size 1): every stage at 60 fps (vsync), cpu avg / p95 ms: street 30% 0.39 / 0.5, street 17% 0.58 / 0.7, district 8% 0.97 / 1.1, district 4.5% 1.65 / 2.0, planner 2% 0.68 / 0.8, whole map 0.76 / 0.9: inside the GAME-PLAN 2.3 budgets (the bench city has no painted areas; paint only costs at bake time). Note: `scripts/worker/run.sh` fails in a git worktree (`cp .git/index`: `.git` is a file there); the runner used `git rev-parse --git-path index` instead.

Open (for the owner): a price per m² by texture; dragging an area's corners after placing; whether the bulldozer should
also remove paint (now only the Paint tool's Erase does).

## Phase UI, the Maple Falls look (the owner's mockup, 2026-10-20): steps 1 and 2 done

**Done (2026-10-20, merged to main):** `scripts/assets/prep-ui-icons.mjs` cuts the sheet into 50 named 64 px WebP icons
(`src/assets/ui/icons/`, ~120 KB); `src/ui/Icon.tsx`; `src/ui/RoadThumb.tsx` draws each road class from its own fields (surface,
walks, median, trees, lane and centre lines, shoulders, one-way arrows); the theme classes in `src/index.css` (`glass`, `btn-icon`,
`btn-gold`, `chip-on`, `rail-tab`, `seg`, `keycap`, `font-display`, `label-caps`). App.tsx (coded by haiku-coder, reviewed): the top bar
(logo, stat tiles with icons from 1900 px, speed/zoom groups, icon buttons, a gear menu for Save / New town / Empty map; it wraps to two
rows below about 1440 px and the rail and stadium card move down with it), the rail by group with a segmented tool row, Upgrade and
Downgrade panels, Road Construction rows with thumbnails and gold prices, icon variant chips, the hint bar with keycaps, glass toasts,
stats and stadium cards. Checked in the browser at 1920, 1600 and 1366 px, no console errors. The zoom slider is gone (the buttons,
scroll and the keys still zoom). **Open:** the minimap (bottom left; none exists yet), the event card's stadium picture and level chip,
the Zones / Utilities / Services / Parks tabs (no such tools yet), panel restyles beyond the header for the junction and business panels.

**Step 2 done (2026-10-20, merged to main):** `src/ui/Minimap.tsx` (haiku-coder, reviewed): a 200 x 100 px isometric minimap bottom left
(so the view box is a rectangle): terrain classes drawn once per valley (one pixel per 8 x 8 tiles), lots as dots and roads by asphalt
width (three colours) rebuilt when `net.version` changes (lots at most every 500 ms), the gold view box from `tileAt` of the screen corners
redrawn only when the camera moves (its own rAF check, no work otherwise); N marker; click or drag moves the camera with the new
`Game.lookAt(x, y, z?)` (jumpTo zooms in and turns the flow overlay on, wrong for a minimap). The town chip beside it: "Maple Falls /
Overview" below DISTRICT_Z, else the nearest town; its dropdown goes to Overview or each town. RoundPanel is now the mockup's event card
(trophy, level chip, era and run, a sentence per stage, View Event, gold Start Event / Start now; the build and surge clocks and town rows
kept). The stadium picture is cut from the mockup (`scripts/assets/prep-ui-event.mjs` -> `src/assets/ui/art/stadium.webp`, 8 KB): the game
has no stadium art yet; replace it when Phase 8's art lands. Layout: the top bar's wrap width depends on its content (the dev badge
wraps it even at 1600 px), so a ResizeObserver puts its bottom in `--hud-top`, which places the rail, the road panel's height and the
right-hand cards (the old `max-[1439px]` rules are gone); the hint bar centres in the lane between the town chip and the stats card; the road
panel and the legends stop above the minimap. Checked in the browser at 1920, 1600 and 1366 px (no overlaps, the dropdown, a town jump and a
minimap drag), typecheck and build pass (5.61 MB), tests 446/447 (the 4 s wall-clock terrain test, which passes on rerun). Bench (local
iGPU, Edge, not the worker): every stage under the 8 ms frame budget (street 30% 1.3 ms avg, whole map 2.1 ms); run it on the worker
after a push for numbers comparable with the table above. **Open:** the Zones / Utilities / Services / Parks tabs, the junction and
business panel restyles, real stadium art.


The owner sent a mockup of the whole screen and an icon sheet, and asked for a task to build that UI. Run it in its own chat, research
first (as JUNCTION-UX.md did), one panel per committed step, each checked in the browser at 1920 x 1080 and on a laptop-sized window.

- **References** (committed): [docs/ui/mockup-road-panel.webp](ui/mockup-road-panel.webp) (the target screen) and
  [docs/ui/icon-sheet.webp](ui/icon-sheet.webp) (48 gold-on-charcoal icons: maple leaf, road, house, junction, bulldozer, bus, power, civic,
  tree, buildings, bank, people, briefcase, sun, income bars, gear, trophy, calendar, info, compass, terrain, layers, chart, camera, the
  play/pause/speed and zoom buttons, pin, one-way arrow, trees, sidewalk, forest, road edge, hills, fullscreen, help, chevrons, swap, open, close).
- **What the mockup asks for**:
  1. *Top bar*: the logo (maple leaf, "Maple Falls / Town builder"), the level ring with its progress bar and cards, then tiles for
     treasury, population, jobs, day and clock (sun icon) and daily income (red when negative); on the right the speed group (pause, 1x,
     2x, 4x, 8x, 20x, the active one gold) and icon buttons (camera, terrain, layers, stats, settings).
  2. *Left rail*: big icon tabs with labels (Roads, Zones, Junctions, Bulldoze, Transport, Utilities, Services, Parks, Buildings), the
     active one gold-outlined. The current tools map onto these: Roads (road, Upgrade, Downgrade), Junctions, Bulldoze, Transport (bus
     routes, car parks, toll gates), Buildings (the businesses); Zones, Utilities, Services and Parks show as locked or are left out until
     they exist.
  3. *Road Construction panel*: title, help (?), a short description, then the classes grouped Small / Medium / Large (and Rural) with a
     thumbnail of the road, its name, lanes, width and speed, and its price per 2 m; the selected class expands to its variant chips
     (Plain, One-way, Trees, Sidewalks), the same variants VARIANTS / Tab already cycle. Locked classes keep the lock line.
  4. *Event card* (top right): trophy, "Event: Stadium", the level chip, era and run, a sentence, the stadium picture, View Event and a
     gold Start Event button (the stadium round's existing HUD).
  5. *Bottom*: the minimap with N and the view box, the town name chip with a dropdown; the hint bar (info icon, the hint, key caps such
     as R Replace, Tab Flip, Esc Cancel); the stats card (fps, sprites, props, segs, the Cars cap 97 / 1k / 5k / 10k, the Growth slider,
     pop and jobs).
- **Style**: dark charcoal glass panels with soft rounded corners, gold (#f5b52e-ish) accents and outlines, a serif display face for the
  logo and panel titles, small caps section labels. Icons: cut the sheet into single transparent PNG/WebP sprites (an art script in
  `scripts/`), not emoji; the toolbar's emoji (including the new Upgrade and Downgrade arrows) go when the icons land.
- **Keep**: every existing tool, key and hint; the canvas size and the performance budgets (GAME-PLAN 2.3: the UI must not cost frame
  time; check with `npm run bench`). The road thumbnails can be rendered from the game's own road painter.

## Phase B, the businesses (GAME-PLAN 1.0.00): in progress

Started 2026-10-19 late night, after 6R.1–6R.4 (the owner's order: steps 1–4 of 6R, then Phase B, then 6R.5–6R.8). The
design, with the research (Cities: Skylines 1/2 unique and signature buildings, OpenTTD cargo income, RollerCoaster Tycoon),
is [BUSINESSES.md](BUSINESSES.md): the player places and pays for businesses (the stadium first), revenue per visitor who
arrives, a tree unlocked by success, cards as upgrades. It replaces Phase 6's game-placed events.

**Decisions (lead, 2026-10-19):**
- The stadium costs **$200,000** and the event valley's starting fund rises from $600,000 to **$800,000** (EVENT_START_MONEY),
  so a new game's room for roads, the toll, car parks and buses is unchanged. Demolishing (between rounds only) refunds half.
- A placed stadium needs open land (GROUND or PATCH tiles), SITE_MARGIN (64 tiles) from the edges, its centre at least
  **200 tiles from every town centre** (STADIUM_TOWN_MIN), no road within 2 tiles, no car park, no town buildings. One
  stadium per game until B.2's catalogue.
- Headless runs and tests keep the game's spot (`City.autoStadium`, default true); the browser's worker sets it false.
  Old saves (no `stadium` field) get the game's spot (placeStadium on the main thread), so they play as before.
- `Game.eventMode` now means "the valley has towns" (it was "a site exists"): the event rules (all classes open, the
  Roundabout card) hold before the stadium is placed.

Steps (from BUSINESSES.md): **B.1** the player places the stadium; **B.2** the business model and catalogue (the City's
business list, saved; the Businesses panel with the tree); **B.3** daily businesses in the sim (gravity demand, visitor trips,
revenue per arrival, satisfaction, upkeep; the sports bar first); **B.4** the stadium's tickets, XP and levels, the tree
opening by success, cards as upgrades; **B.5** transport businesses (the bus company; the taxi company wiring `ext/taxi`);
**B.6** property and tourists (the golf estate's lots, hotels, tourists from the map edge; T010's economics if its PR
comes); **B.7** the Phase B gate (headless: a scripted player with the stadium and three spin-offs, solvent 30 days, 4+
unlocks; budgets met).

### Phase B progress
- **B.1 The player places the stadium (2026-10-19 late night): DONE.** A new valley starts with no stadium: a panel says
  "Place your stadium to start the events" with a button to the **Business tool (key M)**. The tool's panel has the stadium
  card ($200,000 · 100 × 80 tiles); a ghost follows the cursor (green, or red with the reason beside the cursor: map edge,
  open land, too close to a town, a road, a car park, buildings, money, a stadium already); **R** turns it; a click pays and
  builds; the panel then shows Built, Go to and Demolish (+$100,000, refused while a round runs). Code: `siteAt` and `siteWhy`
  in event/site.ts; `City.autoStadium`, `suggested`, `setStadium` (refused mid-round) and the `stadium` worker message; in
  engine.ts `stadiumDef` (main thread authoritative, saved as `stadium: [x, y, w, h] | null`), `bizUpdate/bizWhy/bizClick`,
  `roadNearRect`, `demolishStadium`, `drawSite` and `hintAt` (shared with the toll tool's label); farms re-derive after a
  build or demolish. Test: tests/stadium-place.test.ts (siteAt doors, siteWhy reasons, autoStadium off/on, setStadium
  refused mid-round).
  - Browser-checked (port 5176; the 5174 port was taken): new valley with no stadium and the hint; green and red ghosts with
    the reasons (water, edge, town, road, a stadium already); R rotation; build (−$200,000 with real money, `?money=0`),
    save, reload (kept, the worker in sync), demolish (+$100,000), rebuild; roads of gravel, street and arterial refused
    across it (and an arterial skimming its edge); a round starts, builds and surges from the placed stadium (crowd 80/80/80);
    demolish refused mid-surge; no console errors.
  - Checks: typecheck clean; `npm test` 419/419 on the worker; `town:gate` PASS (5,124 pop, 0 jams); `sim:gate -- 1 10000`
    PASS (20,961 arrived, 61 towed, 0 lost): the same numbers as before.
  - Left: the in-browser bench path (`opts.bench`) starts with no stadium (headless benches unaffected); clearing the town
    mid-round leaves the worker's site until the round closes (the worker refuses setStadium mid-round).
- **B.2 The business model and catalogue (2026-10-19 late night): DONE.** `src/game/business/catalogue.ts` (the lead's design: 12
  types in five families with T010's API shape, plus kind event/visit/fleet/estate, opening hours, party size, demand rate and
  trip-time falloff, max owned, town distance, the water rule; `dailyDemand`, `satisfactionAfter`, `levelFromXp`, `unlockedBy`,
  `unlockText`) and `state.ts` (BizDef, BizStats, BizView). The tree: the stadium → sports bar and bus company (stadium L2), golf
  course and fishing resort (stadium L3); sports bar → diner (2 good days); bus company → taxi company (3 good days); golf →
  golf estate (golf L2) and casino (5 good days); fishing → tackle shop (3 good days) and motel (fishing L2); casino → hotel
  (casino L2). The engine keeps `bizDefs` (saved as `biz` + `bizStats`; an old save's `stadium` becomes business 1); the worker
  keeps each business's stats by id (`City.setBusinesses`, `restoreBiz`, `bizView`; the stadium's level is the round's) and
  posts them (`biz` message); the town keeps its lots and gravel roads off every business; roads may not cross one. The
  Business tool's panel lists the catalogue by family: owned ones (level, satisfaction, revenue, Go to, Demolish for half),
  Build on open types, locked ones greyed with their unlock and progress ("Sports bar: 2 good days (now 0)"). Other
  businesses are drawn as family-coloured rects with "NAME · L1". Tests: business-catalogue (every type reachable from the
  stadium, spin-offs consistent, demand and satisfaction curves, levels, unlock text), business-city (stats by id, the
  stadium kept mid-round, restore).
  - Browser-checked (port 5175): an old save's stadium came in as business 1; a sports bar and a fishing resort built
    (−$30,000, −$90,000), demolish +half; reasons: road in the way, casino too close to a town, the water rule, the most of a
    type, a second stadium; saved and reloaded with `?unlock=0`: the list and the worker's stats back, the sports bar,
    golf and diner locked with their texts. Checks: typecheck clean; `npm test` 434/435 (ext-terrain2's timing only).
- **B.3 Daily businesses in the sim (2026-10-20): DONE.** `src/game/business/visits.ts` (class `Visits`): at each day's start (and when a
  business is placed, and once a game hour for one not yet planned) each visit business's demand, `round(dailyDemand)` with each town's
  driving minutes from the router's zone table (`Router.timeTo`, at the current costs; tau now in real minutes, 3-10), becomes departures from
  the towns' homes (a town by pop x exp(-min / tau), a home by residents) spread over its opening hours; the cars drive from their driveways to
  the business's door (`City.bizDoor`: the nearest road within 6 tiles of a footprint door, the direction with the business on its right),
  tagged in the sim (`Sim.visit`, `visitOut`). A town whose roads do not join the door's road sends no one (zone tables are per 128-tile zone,
  so without the component check an island bar's cars were planned and lost: found in the browser). Each arrival pays price x party
  (`Budget.bizIncome`, the ledger's Business line); arrivals over 2x their ideal time are late. The day's close: satisfaction moves 30% toward
  (on time + half late) / all (unspawned and lost cars are missed), XP += on-time cars, the level from XP, a good day at sat >= 0.75 with
  visitors; every business pays its upkeep per day (the ledger's line is now "Upkeep": roads and businesses; **the stadium's $1,500/day is now
  charged too**, as BUSINESSES.md says). The worker posts the business stats hourly (was: only at the day's close); the Business panel shows a
  visit business's day ("Today: 25 cars (0 late, 0 missed) · $450 · 0 good days"). Plans are not saved: a load plans the rest of the day.
  - Browser-checked (port 5177, headless Edge driving `window.__game`, new valleys with `?stamp=1`): a sports bar beside a town road gets
    16-25 cars by 20:00-23:00, $18 each, satisfaction 0.80 -> 0.84-0.86 and a good day at the close, the ledger's Business line matching; a bar
    on a road not joined to the towns planned and lost all its cars (sat 0.80 -> 0.56) before the fix. Headless (harness seeds 1-3, a bar
    by each town): 22-50 cars planned a day, nearly all on time, none lost. No console errors (one 404 resource, also on main).
  - Checks: typecheck clean; `npm test` 453/453 on the worker (new tests/business-visits.test.ts, 6 tests incl. the island bar);
    `town:gate` PASS (5,130 pop, 0 jams); `sim:gate -- 1 10000` PASS (21,074 arrived, 58 towed, 0 lost).
  - Left: Visits' own misses (no driveway, past the door) are counted at the close but not in the panel's live "missed"; only the towns'
    most populous home's component is checked (homes of a split town on another component are lost and missed); demand is modest (20-50
    cars a day for a bar by a 1,000-resident town; tune with B.7's gate).
- **B.4 The stadium's tickets and the unlocks (2026-10-20): DONE.** At kick-off the stadium earns a ticket per fan at the doors
  (`ticketPrice`: $12, +$3 per Season tickets card), booked as business takings (`Budget.bizIncome`) and shown in the result as
  "Tickets" (`RoundResult.tickets`; the net is toll + tickets + payout - upkeep). The stadium's stats take the round: fans as visitors
  and XP, its revenue, satisfaction 30% toward the arrival rate, a good day for a perfect run (its level stays the round's: the crowd
  depends on it). Two new upgrade cards: **Promotion** (every visit business draws 20% more: `promoMul`, the `mul` of `dailyDemand`) and
  **Season tickets**. The tree already opened by levels and good days (B.3 gives the visit businesses theirs); a toast now says when a
  type unlocks ("Sports bar unlocked: build it with the Business tool (M)"; not on a load or a new valley, not with dev unlock-all).
  The worker posts the business stats when the round's stage changes too. The event gate's money check (a) counts the tickets.
  - Browser-checked (port 5177, headless Edge, `?stamp=1&unlock=0`): a stadium east of a town with an avenue and a 144-bay car park, a
    round run to its eval: 249 fans in, tickets $2,988 (= 249 x $12), net -$13,703 = -$6,167 payout + $2,988 - $10,524 upkeep; the
    eval screen's line "Toll · Tickets · Payout · Upkeep · Net"; the draft offered Season tickets and Promotion; the stadium's stats
    (249 visitors and XP, sat 0.80 -> 0.66); the unlock toasts for the sports bar and the bus company at stadium level 2.
  - Checks: typecheck clean; `npm test` 456/456 on the worker (tests: the card formulas, a kick-off's tickets with faked fan counts, a
    Promotion bar planning more cars); `event:gate` (a) PASS with the tickets ($4,176 of them), (b) and (c) fail as on main (Known issues).
  - Left: no browser check of a real level-up (needs a perfect round); a demolished and rebuilt parent toasts its unlocks again.
- **B.5 Transport businesses (2026-10-20): DONE.**
  - *Bus company:* while one stands, every fan who boards a shuttle pays a $2 fare (booked as business takings, the company's riders
    and revenue); a round whose shuttles carry 100+ riders is its good day (3 open the taxi company). Shuttles run only in rounds, so
    the numbers moved: fare $1 -> $2, upkeep $400 -> $150 a day (the first B.7 tuning will check them).
  - *Taxi company:* wires `ext/taxi` (T011's dispatcher). Ranks at the company's door kerb (6 taxis) and the stadium's (2); each game
    day ~10 rides per 1,000 residents (hours 7-24, parties of 1-3) from a home's driveway to a visit business's door (half) or a home
    of another town, only among homes and doors on the rank's road network (towns start unjoined: without that the taxis "teleported"
    and charged for rides they could not drive, seen in the browser). Each order (pickup, drop-off, back to a rank) is driven as a sim
    car (`Sim.taxi` tag, `taxiOut`, `dropTaxis`; `City.kerbAt`, `doorKerb`, `setupTaxis`, `planTaxis`, `stepTaxis`). Fares into the
    books as business takings, driver and fuel costs as upkeep; 10+ rides is a good day. Upkeep $250 -> $100 a day. Not saved: a load
    starts the taxis at their ranks. **Open (for B.7):** ext/taxi bills wages per 3,600 sim s while a game hour is 60 s, so wages are
    tiny; fares are per km and per (real) minute: a day earns about $45-85 for 6 taxis.
  - The Business panel shows a fleet's day ("Today: 22 rides · $43 · 1 good days" / riders and good rounds for the bus company).
  - Browser-checked (port 5177, headless Edge, `?stamp=1`): a taxi company beside a built house: 20-22 rides on day 0, $43-57, a
    good day at the close, the ledger's Business line; a company beside a road with no homes on its network: no rides (correct).
  - Checks: typecheck clean; `npm test` 459/459 on the worker (new tests/business-taxi.test.ts: the rank, a day's rides booked as the
    dispatcher's revenue, the taxis dropped with the company); `sim:gate -- 1 10000` PASS (21,074 / 58 towed / 0 lost); `town:gate`
    PASS (5,130 pop, 0 jams).
- **B.6 Property and tourists (2026-10-20): DONE.**
  - *Golf estate:* at each day's close an estate sells lots, as many as the best golf course's level, while that course has
    satisfaction >= 0.6 (`ESTATE_SAT`) **and had players that day** (a course nobody can reach keeps its starting satisfaction:
    without the players rule its estate sold lots, seen in the browser); $12,000 a lot, 24 an estate (`ESTATE_LOTS`), booked as
    business takings; the panel: "Lots sold: n/24 · last close +n ($)". The lots are not drawn as houses yet (art, later).
  - *Tourists:* with a road within 12 tiles of the valley's highway entry (the map-edge point; the towns valley has no highway
    until 6R.5, so the player must build one), the tourists are one more catchment in the visit plans: 300 "residents" per level of
    each tourism business (fishing resort, tackle shop, hotel, motel), the casino and the stadium, starting at the entry's kerb
    (`VisitHome.lot` null with a `drive`); only the tourism businesses and the casino draw them, and only on the entry's road network.
    `City.touristEntry()`; the panel of those types says whether tourists come yet, with Go to the entry. Hotels already open by the
    casino's level (B.2's tree).
  - Fixed on the way: `Router.timeTo` rebuilds a zone table from an older graph (it was budget-limited: the town's gravel roads change
    the graph all day, and a new dseg read past an old table's end gave "unreachable", so some visit businesses planned no one in the
    browser). The taxi company's blurb says what it does now.
  - Browser-checked (port 5177, headless Edge, `?stamp=1`): a motel by a town road planned 6 guests from the one town joined to its
    road (a temporary log of the plan: the other towns' components differ, so Infinity) and got 5-7 a night ($56 each), a good day;
    the estate and tourist panel lines. A golf course with players beside an estate was not reached in the browser (the placement
    search found no spot joined to a town in those valleys); the estate rules are in tests/business-estate.test.ts.
  - Checks: typecheck clean; `npm test` 467/467 on the worker (before the last two fixes: the players rule and the test data;
    the business tests pass after them).
- **Next: B.7, the Phase B gate and the balance** (headless: a scripted player with the stadium and three spin-offs, solvent 30 days,
  4+ unlocks; the numbers: taxi wages vs the game hour, the bus company, visit demand), then 6R.5-6R.8.

### Start prompt for a fresh chat
"We're building Capital Empire (repo: CapitalEmpire). Read CLAUDE.md and docs/PROGRESS.md first. Done lately (2026-10-20): the road
Upgrade/Downgrade ladder with fair costs, houses following a widened road, and the Maple Falls HUD (UI steps 1-2). Next in the owner's
order is **Phase B** (the businesses; design in docs/BUSINESSES.md): B.1-B.5 done, **B.6 next** (property and tourists), then
B.7, then 6R.5-6R.8 (highways, terrain, towns as seeds, the road set check). Check `git status` and `git worktree list` first: another
session may have uncommitted work in the main checkout or a worktree (ask the owner before touching it). Carry on through the queue without asking between steps; still ask before pushing. Delegate
coding to haiku-coder (in the background for small jobs) and checks to haiku-runner (the worker PC `cworker`, 192.168.0.8, via
scripts/worker/run.sh); commit locally after each verified step and merge to main when verified; update docs/PROGRESS.md as you go;
test every road/junction/UI change in the browser on your own dev server port (5174 is the owner's). Tell the owner when work lands."
