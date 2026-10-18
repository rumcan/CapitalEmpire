# Capital Empire: progress

The living status of the project. Every session reads this first and updates it before it ends.
The full design is in [GAME-PLAN.md](GAME-PLAN.md); the working rules are in [../CLAUDE.md](../CLAUDE.md).

_Last updated: 2026-10-18, Phase 3 done (gravel roads, parcels, the town model in the city worker, the Lot Composer, trips from lots, access-driven growth; the 5k gate passed). The lot contact sheets await the owner's review. Phase 4 next._

## Where we are

| Phase | Status |
| --- | --- |
| 0. Scale foundation | **Done** (commit `88e64c4` plus the hand-off commit after it), pushed to origin 2026-10-17 |
| 1. Terrain (maple valley for now) | **Done** (2026-10-17), pushed to origin. Steps and numbers below |
| 2. Traffic core | **Done** (2026-10-18), pushed to origin 2026-10-18. Steps, numbers and the gate below |
| 3. Lot Composer + growth | **Done** (2026-10-18), pushed to origin 2026-10-18; the contact sheets wait for the owner's review |
| 4. Budget + bottleneck loop | **In progress** (2026-10-18). Steps and numbers below |
| 5. Road builder pro | Not started |
| 6. Vegas look + eras | Not started. The art track can start any time (GAME-PLAN section 4.1) |

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
- **Player control:** roads and traffic only. The city grows where traffic flows and stops where it jams.
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
- **The forest only plants as the camera arrives** (2 cells per frame), so a fast pan at district zoom shows trees
  popping in at the edges.

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

## Phase 4, budget + bottleneck loop: in progress

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
   destination's use and counts `sim.trade`); upkeep 0.4% of the build cost per tile a day (bridges x4, tunnels x6);
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

### Start prompt for a fresh chat
"We're building Capital Empire (repo: CapitalEmpire). Read CLAUDE.md and docs/PROGRESS.md first, then start Phase 4
(budget + bottleneck loop) at step 1 and carry on through the steps without asking between them. Delegate coding to
haiku-coder and checks/benchmarks to haiku-runner (worker PC via scripts/worker/run.sh), commit locally after each
verified step, update docs/PROGRESS.md as you go. Use look*.mjs at the repo root (git-excluded copies of
output/look/look.mjs) for headless screenshots; `npm run town:gate` and `npm run sim:gate` are the headless gates."
