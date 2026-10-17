# Capital Empire: progress

The living status of the project. Every session reads this first and updates it before it ends.
The full design is in [GAME-PLAN.md](GAME-PLAN.md); the working rules are in [../CLAUDE.md](../CLAUDE.md).

_Last updated: 2026-10-17, start of the Phase 1 session (worker PC working)._

## Where we are

| Phase | Status |
| --- | --- |
| 0. Scale foundation | **Done** (commit `88e64c4` plus the hand-off commit after it), local only, not pushed |
| 1. Desert terrain | **Next.** Task list below |
| 2. Traffic core | Not started. The approach is decided (GAME-PLAN section 3.3) |
| 3. Lot Composer + growth | Not started |
| 4. Budget + bottleneck loop | Not started |
| 5. Road builder pro | Not started |
| 6. Vegas look + eras | Not started. The art track can start any time (GAME-PLAN section 4.1) |

## Decisions so far

- **Setting:** 1980s Las Vegas valley as the MVP; eras advance later as art arrives.
- **Map:** 4 x 4 km (2048 tiles of 2 m).
- **Terrain:** seeded, fixed hills, valleys and rivers. Roads cross rivers with **bridges** and go through hills in
  **tunnels**.
- **Player control:** roads only. The city grows where traffic flows and stops where it jams.
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
- **The art is still Maple Falls autumn (night).** The desert art track has not started (GAME-PLAN section 4.1).
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

## Next: Phase 1, desert terrain

The goal and gate are in GAME-PLAN section 3.1 and the phase table in section 5. These are the steps, in order; the
ones marked **(haiku)** can be briefed to `haiku-coder`.

1. **Terrain data model** (lead designs; haiku implements). `src/game/terrain/`:
   - a seeded generator in pure TS (no DOM) that outputs a 256² height field;
   - a 2048² terrain-class grid: sand, caliche, rock, water, wash, bank;
   - the river and wash polylines.
   Save stores the seed only. Tests check the guarantees: at least 55% buildable and connected, a start site by the
   river and the highway entry, and at least one chokepoint.
2. **Rivers and washes** (haiku, from a lead brief): D8 flow accumulation, then smoothed polylines with widths.
3. **Collision** (haiku). Terrain classes go into the occupancy grid. `canPlace` and the road tool refuse rock and
   water, except for bridges and tunnels.
4. **Desert ground** (lead + haiku):
   - new procedural textures in `textures.ts` (sand, caliche, desert gravel, rock floor, water, wet bank) replacing
     the grass base;
   - the painter draws the terrain classes;
   - the planner colours change to match.
   Bump `TEX_VERSION` in `texture-share.ts`.
5. **Hills as fixed sprites** (lead decides). A placeholder rock kit until the art arrives: either procedurally
   drawn cliff and butte pieces packed into the atlas by a prep script, or generated art through the TrickOrTreat
   RUN pipeline. They are depth-sorted like buildings and cannot be bulldozed.
6. **Bridges and tunnels in the road tool** (lead designs; haiku implements):
   - segment flags, with cost per metre;
   - a bridge deck, piers and railings over water;
   - tunnel portals, with the underground run not painted;
   - network ops and save support.
7. **Highway entry** at the map edge, built by the generator.
8. **Gate:** 20 seeds pass the generator tests; a road can cross a river and a hill; benchmark budgets still met
   (run `haiku-runner`).

Update this file after each step.
