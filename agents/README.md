# Agents

Outside coding agents that help build Capital Empire through pull requests.

- **`arena/INSTRUCTIONS.md`** – the Arena agent: code only (like the in-house Haiku coders), one task per PR, every
  feature built as a standalone module in `src/game/ext/<feature>/` that the lead wires in. Read it first.
- **`arena/PR_TEMPLATE.md`** – the PR body.
- **`tasks/`** – one spec per task (`T001-...md`). A task's `Status:` is `open`, `in progress (<branch>)`,
  `in review (#PR)`, `merged` or `wired in`. The lead writes the specs, reviews the PRs, merges, and does the wiring.

How the lead uses it: pick features that stand on their own (a transit mode, a business type's economics, a
generator), write the task spec with the exact API, let the agent build and test it in isolation, then review the PR
and wire it into the city worker, the engine tools, the renderer and the save.

**The golf pivot (2026-10-21):** the game is now a golf events manager ([docs/GOLF-PLAN.md](../docs/GOLF-PLAN.md)). Status as of
that date: T003, T005, T006, T008, T009, T011 and T012 are merged and **wired in**; T001, T002 and T004 are merged, waiting to be
wired (T004 with highways in G6, T002 with the course site in G1/G2, T001 as a shuttle train later); T007 and T013 are open and
still wanted; **T010 is superseded** (it becomes tent economics, GOLF-PLAN section 12); T014 (paranormal nights) is in progress
in another session and the plan recommends parking it. New golf tasks are listed in GOLF-PLAN section 12; their specs are
written when their phase starts.

## Task index
| Task | What | Module |
| --- | --- | --- |
| T001 | Subways: stations, lines, trains, fans with transfers | `src/game/ext/subway/` |
| T002 | Terrain v2: more hills and valleys, less flat edge | `src/game/ext/terrain2/` |
| T003 | Grade separation: bridges over roads, tunnels under them (elevation profiles) | `src/game/ext/grade/` |
| T004 | Highway interchanges: diamond, parclo, cloverleaf, trumpet, stack (ramp geometry) | `src/game/ext/interchange/` |
| T005 | Dirt roads and farm lots along country roads | `src/game/ext/farms/` |
| T006 | Natural disasters: flood, storm, landslide, wildfire, quake (closures) | `src/game/ext/disasters/` |
| T007 | Bug hunt: fuzz tests for the network, lane graph, sim and snapping (report only) | `tests/ext-fuzz-*.test.ts` |
| T008 | Traffic incidents: breakdowns, crashes, rubbernecking, tow trucks | `src/game/ext/incidents/` |
| T009 | Driver variety: driver styles, the ACC car-following model, shoulder use | `src/game/ext/drivers/` |
| T010 | Business economics: the business tree's catalogue and formulas | `src/game/ext/business/` |
| T011 | Taxi service: fleet and dispatch | `src/game/ext/taxi/` |
| T012 | Road, town and place names | `src/game/ext/names/` |
| T013 | Roads and land: class upgrades and downgrades with prices, building over lots (confirm with the bill), natural town layouts | `src/game/ext/landworks/` |
