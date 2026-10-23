# NOW: the live work log (read docs/LEAD.md first)

Update this file **before** each edit and after each sub-step. If you are picking up from someone else: follow LEAD.md section 7.

## Current step
- **Milestone:** M2 Crowds (LEAD.md section 3). **Branch:** `lead/m2-crowds` (from `origin/main` 4c90e25).
- **Sub-step now:** M2.3 Going home (M2.1 gates and M2.2 galleries landed on main).

## Findings: what a golf tournament day simulates today (2026-10-23)
- **Start:** `City.startTournament` (city.ts) at the season's end: the crowd is `spectatorDemand(tier, rep)` (day 1's share, less the
  parking-fee cut) in party cars of `PARTY` = 3 fans, split over the towns by population (`crowdFor`); the season clock freezes; the surge
  starts at once (`beginSurge`: `planSurge`, `startBuses`).
- **Simulated:** the surge (`event/surge.ts`): party cars leave the towns' homes over the first `DEPART_END` = 55% of `SURGE_S` = 600 sim s
  and drive to the car parks (`parks`, their sinks); each parked car's 3 fans walk (`City.partyWalk`): to a shuttle stop if their car
  park has a route (`event/bus.ts`, buses in the sim), else (`walkDoor`) straight to the nearest of the **clubhouse plot's 4 "doors"**
  (`event/site.ts` siteAt: the middle of each side of the site; the site is the clubhouse business plot in golf mode), where they count
  as arrived at once (`Crowd.arrive`). Walkers and stop queues are drawn (engine `drawCrowd`, the walker sprites). **Kick-off**
  (`City.kickOff`) takes the counts: arrived fans, cars parked; tickets are paid per arrived fan.
- **Formulas (not people):** the gate queue, lateness and the exit time (`golf/yearend.ts` `measureGateFlows`: a fixed arrival curve
  07:00-13:00 through the gate lanes of the placed gate structures), viewing, satisfaction, money (`computeYearEnd`, `tournamentday.ts`).
- **Missing:** gates as places with queues; the spectators inside the course (galleries round the holes, grandstands, tents); the walk
  back and the **drive home** (`closeRound` despawns every car: "the roads clear after the event"); the seasonal crowd from outside the town
  (everyone comes from the town's homes).

## The M2 design (decision in LEAD.md section 5)
- **M2.1 Course gates.** The gates are the placed Event structures of kind 'gate' (their rectangle's middle; lanes = the structure's
  capacity); with none, the clubhouse plot's doors as today (one lane each). Fans walk from their bay to the nearest gate, join its queue
  (a FIFO of parties), and are admitted at the gate's rate (`GATE_LANE_PER_HOUR` = 600 a lane an hour; one sim s = one game minute, so
  10 a lane a sim second); admitted fans are the ones inside (the counts kick-off reads). The queues are drawn like the shuttle stops'.
- **M2.2 Galleries.** Admitted fans go to gallery spots (the featured holes' tees and greens, grandstands, tents) and stand there as
  crowds (counts per spot; drawn as dense groups); tents serve them.
- **M2.3 Going home.** At the day's end the fans walk back to their car park and their party cars drive home (respawned at their bay,
  bound for their home lot): the egress traffic. The round's eval shows how long it took.
- **M2.4 Results from the movers.** The measured gate waits, the late fans (admitted after their tee time) and the exit times replace
  `measureGateFlows`' formula.
- **M2.5 The tournament on the town day.** The tournament day maps onto one town day (gates 07:00, play, exits in the evening).

## Plan for M2.1 (tick as you go)
- [x] a. `event/crowd.ts`: a walker stage 2 (to gate `route`), gate queues (`gateQ`: FIFO of parties per gate), `admit(g, n)` (moves up to n
  fans from gate g's queue inside: `arrive`), `atGate` in `counts()`; tests in `tests/crowd.test.ts` (or a new `tests/gates.test.ts`).
- [x] b. `sim/protocol.ts` `{ t: 'gates'; gates: { x; y; lanes }[] }`, `sim.worker.ts` case, `City.setGates`; `SimClient.setGates`.
- [x] c. `City.walkDoor` in golf mode with gates: walk to the nearest gate (stage 2); `City.step`: each gate admits `lanes * 10` fans a sim
  second (fractions carried).
- [x] d. The frame: the gate queues appended to `stops` (so the engine draws them), or their own array; the engine draws them.
- [x] e. Engine: the gates from `golf.structures` (kind 'gate', `structureRect` middle, `STRUCTURE[type].capacity` lanes) sent on load and
  whenever the structures change.
- [x] f. typecheck, tests, build, browser check (place a gate, skip to the tournament, see the queue and the admitted count), land.

## Plan for M2.2 Galleries (write the details here before you start)
- [x] a. Decide the gallery spots: per hole of the course (golf/holes.ts, holeview.ts: tees and greens; the featured holes), the placed
  grandstands and tents (golf.structures, STRUCTURE kinds 'grandstand', 'food', 'drink', ...), the 18th green. A pure module
  `src/game/golf/galleries.ts`: spots (x, y, capacity, kind) from the holes and structures; the share of the crowd each draws.
- [x] b. Admitted fans walk from the gate to a spot (a stage 3 walker in event/crowd.ts, or a gallery list in the crowd) and stand there
  (counts per spot); later in the day they move between spots (follow the play: M2.5 ties it to the town day).
- [x] c. Send the spots to the sim (a message like `gates`), draw the standing crowds at street zoom (dense walker groups, the count).
- [x] d. Tests, browser check, land.

## Plan for M2.3 Going home (branch `lead/m2-going-home`)
**Found:** a party car records only its town (`Sim.party[slot]`) and, once parked, `[town, park, bay]` (`Sim.partyBays`, read by
`City.drainParty` → `partyWalk`); its home lot is not kept. `closeRound` despawns every car and `emptyParks` zeroes the car parks.
**Design:** `City.parkedCars` records each parked party car `{ town, park, bay }`. In golf mode the leaving starts `LEAVE_AFTER` sim s after
kick-off and releases the parked cars' parties over `LEAVE_S` sim s (in a seeded random order): each party walks from a gallery spot that
has fans (taking PARTY fans off it; with no spots, from the nearest gate or the site's middle) to its car's bay (a `Crowd` walker stage 4,
route = the index in `parkedCars`); when it lands (`Crowd.onBack`) its car waits to leave (`City.leavePending`); each step a waiting car
is spawned at its car park's entrance (the park's sink: lane by `sinkLane`, s = the sink's s) bound for a home of its town (the homes of the
surge's plan, by population; `driveway(lot, g)`), and the park's `parked` count drops. Measured (for M2.4): `leave = { start, cars,
gone, last }` (sim s), into `RoundResult.leave` when the round closes.
- [x] a. `event/crowd.ts`: stage 4, `onBack(town, route)`; test.
- [x] b. `city.ts`: `parkedCars` (in `drainParty`), the homes by town kept from `planSurge`, `LEAVE_AFTER` / `LEAVE_S`, `stepLeaving(dt)`
  (release, walk, spawn), the measurement; `closeRound` keeps despawning (anything left is cut off).
- [ ] c. Tests (a City-level test if feasible, else crowd-level), browser check (the evening traffic out of the car parks), land.

## Next action
M2.3 c: `npm run build`; browser check on a test copy (5181, own storage): Skip to tournament at 8x, after kick-off (eval) watch
`window.__game.traffic.round.last.leave` (cars, gone, start, last) rise and the car parks empty; look at the car park and its road for the
evening traffic. a and b are in (crowd stage 4 / onBack; `City.parkedCars`, `surgeHomes`, `leave`, `stepLeaving`, `leaveFrom`, `driveHome`,
`LEAVE_AFTER` 120 / `LEAVE_S` 300 at the top of city.ts; `RoundResult.leave`).

## Done (newest first)
- 2026-10-23: **M2.2 Galleries landed** on main. Browser-checked on a test copy (5181, fresh golf game, Skip to tournament at 8x): 18 spots (9 greens, 9 tees), 102 of the 168 fans in standing at them while the rest still walked, drawn as rings of standing fans with `n watching` (15 by a green, 12 by a tee).
- 2026-10-23: **M2.1 Course gates landed** on main. Browser-checked on a test copy (port 5181, a fresh golf game, a gate placed by script between the car park and the clubhouse plot, Skip to tournament at 8x): the fans walked to the gate (stage 2 walkers seen), the gate admitted all 168 who arrived (`last.gates`: admitted 168, wait 0: a 4-lane gate admits 40 a second and they came about one a second, so no queue at tier 1); 168 of 360 fans arrived at all: the round's stuck list blames the town's 4-arm junctions (M3's job).
- 2026-10-23: M2 findings and design written (above). M1 Living town landed on main (4c90e25).
