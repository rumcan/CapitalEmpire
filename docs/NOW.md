# NOW: the live work log (read docs/LEAD.md first)

Update this file **before** each edit and after each sub-step. If you are picking up from someone else: follow LEAD.md section 7.

## Current step
- **Milestone:** M1 Living town (LEAD.md section 3).
- **Branch:** `lead/m1-town-day` (from `origin/main` a95e1ae).
- **Goal:** a town day of `dayLen` sim seconds, separate from the golf season, drives the lot trips (commute rush hours), the night and
  the HUD's time of day; the owner sets the day's length and the town's traffic in the gear menu.

## Plan (tick as you go)
- [x] 1. `src/game/sim/trips.ts`: `demandAt(t, dayLen = DAY)` reads the hour as `(t / dayLen * 24) % 24`; `LotTrips.step/generate` make
  a town hour's trips every `dayLen / 24` sim seconds (not every 60), the hour's kind and demand from `sim.clock` with `dayLen`, and the
  trips per resident a town day times `sim.townTraffic` (default 1).
- [x] 2. `src/game/sim/sim.ts`: `dayLen = DAY` and `townTraffic = 1` fields; `fill()`'s profile uses `demandAt(this.clock, this.dayLen)`.
- [x] 3. `src/game/sim/protocol.ts` + `sim.worker.ts`: a `{ t: 'townDay'; dayLen: number; traffic: number }` message sets them.
- [x] 4. `src/game/sim/client.ts`: `townDay(dayLen, traffic)` posts it and keeps `dayLen` for the clock.
- [x] 5. `src/game/engine.ts`: the owner's settings `townDay = { minutes, traffic }` (localStorage `capitalempire.townday`), sent on
  start and on change (golf mode: dayLen = minutes * 60 sim s at 1x... see note); `clock()` reads the hour from the town day in golf mode.
- [x] 6. Gear menu (`src/ui/NightPanel.tsx` or a new `TownDayPanel.tsx`): "Town day" length (real minutes at 1x) and "Town traffic".
- [x] 7. Tests (`tests/town-day.test.ts`): demandAt with a short day has its peaks at 08:00 / 17:00 of the town day; LotTrips makes about
  `PER_RES * pop * traffic` trips per town day; dayLen = DAY keeps the old numbers.
- [ ] 8. typecheck, tests, build, browser check (rush hour visible: count cars at 08:00 vs 03:00 of the town day; the night falls with it).
- [ ] 9. Land on main, PROGRESS.md paragraph, tick M1 in LEAD.md.

**Note on units:** one sim second is one game minute, and at 1x one real second (check `speed` in `sim.worker.ts`). So `dayLen = 240`
is a 4-minute town day at 1x; the season's month is 120 sim s, so about half a town day... the owner picks the length.

## Next action
Step 8b (found in the browser check): the town day read the season clock (`sim.clock`), which freezes at the season's end (round 'eval',
clock 1440) and between, so the town froze too. Change: `Sim.townFree` (set true by the `townDay` message in golf games) and a getter
`Sim.townTime` = `townFree ? t : clock`; `LotTrips.generate` and `fill()` read `townTime`; `Game.clock()` in golf mode reads
`traffic.simTime(now)` (not `clockTime`). Also: the default town day becomes 10 minutes (4 smeared the peaks: a 2 km trip takes ~140 sim s;
at 10 min the browser showed ~285 cars at 04:00 and ~690 at 09:00).

## Done (newest first)
- 2026-10-23: docs/LEAD.md and this file written; stock taken (see PROGRESS.md "2026-10-23: Claude leads the code").
