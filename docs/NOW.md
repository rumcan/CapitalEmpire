# NOW: the live work log (read docs/LEAD.md first)

Update this file **before** each edit and after each sub-step. If you are picking up from someone else: follow LEAD.md section 7.

## Current step
- **Milestone:** M2 Crowds (LEAD.md section 3). **Branch:** `lead/m2-crowds` (from `origin/main` 4c90e25).
- **Sub-step now:** M2.1 Course gates and their queues.

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
- [ ] b. `sim/protocol.ts` `{ t: 'gates'; gates: { x; y; lanes }[] }`, `sim.worker.ts` case, `City.setGates`; `SimClient.setGates`.
- [ ] c. `City.walkDoor` in golf mode with gates: walk to the nearest gate (stage 2); `City.step`: each gate admits `lanes * 10` fans a sim
  second (fractions carried).
- [ ] d. The frame: the gate queues appended to `stops` (so the engine draws them), or their own array; the engine draws them.
- [ ] e. Engine: the gates from `golf.structures` (kind 'gate', `structureRect` middle, `STRUCTURE[type].capacity` lanes) sent on load and
  whenever the structures change.
- [ ] f. typecheck, tests, build, browser check (place a gate, skip to the tournament, see the queue and the admitted count), land.

## Next action
M2.1 b: the `gates` message: `sim/protocol.ts` ToSim `{ t: 'gates'; gates: { x: number; y: number; lanes: number }[] }`, its case in `sim.worker.ts` calling `City.setGates`, `SimClient.setGates`. (a is done: `Crowd.setGates/atGate/admit`, `Walker.stage` 2, `FanCounts.atGate`, `GateStats`, `Crowd.now`; tests `tests/gates.test.ts`.)

## Done (newest first)
- 2026-10-23: M2 findings and design written (above). M1 Living town landed on main (4c90e25).
