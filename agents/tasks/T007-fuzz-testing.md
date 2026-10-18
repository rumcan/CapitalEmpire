# T007 · Bug hunt: fuzz testing the road network and the lane graph

Status: open
Files: `tests/ext-fuzz-network.test.ts`, `tests/ext-fuzz-lanes.test.ts`, and a report `agents/reports/T007.md`
Spec by the lead, 2026-10-18. Read `agents/arena/INSTRUCTIONS.md` first. **You change no code in `src/`:** you find
bugs and write them up; the lead fixes them.

## What to build
Seeded random edit sequences against the real modules (headless, Node), checking invariants after every edit:
- **The network** (`src/game/network.ts`, `src/game/netops.ts`): random legs of every class (axis, 45°, random angles,
  short, long, overlapping, crossing near nodes), removals (`removePiece`), node types (plain, signal, slip, roundabout)
  and flags (`setNodeFlags` with ring lanes 1–3), rebuilds. Invariants: no NaN anywhere, every seg's nodes exist, node
  degrees match, `netToOps` + `applyOps` into a fresh network gives the same segs/nodes (round trip), no zero-length segs,
  no two nodes closer than 0.5 tiles.
- **The lane graph** (`src/game/sim/lanes.ts` `LaneGraph.update`, `checkGraph`): after each edit `checkGraph` is clean,
  every movement's paths connect, incremental updates equal a full rebuild (build one graph incrementally, another from
  scratch: same lanes by key, same movements).
- **The sim** (`src/game/sim/sim.ts`): a few hundred random cars on the fuzzed network for a while: no NaN positions, no
  vehicle on a dead lane, the counts add up.
- **The snapping** (`src/game/snap.ts`): random clicks never produce a route `checkLegs` passes that then breaks an
  invariant above.
Keep each test under ~60 s; mark long ones to skip unless `FUZZ_LONG=1`.

## The report (`agents/reports/T007.md`)
Each bug found: the minimal seed/sequence that reproduces it (as a ready-to-paste test), what breaks, and where in the
code you think the cause is. Commit the failing reproductions as `test.skip(...)` so the suite stays green.

## Integration notes expected
Nothing to wire: the list of bugs for the lead.
