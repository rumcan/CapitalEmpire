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
- [ ] 7. Tests (`tests/town-day.test.ts`): demandAt with a short day has its peaks at 08:00 / 17:00 of the town day; LotTrips makes about
  `PER_RES * pop * traffic` trips per town day; dayLen = DAY keeps the old numbers.
- [ ] 8. typecheck, tests, build, browser check (rush hour visible: count cars at 08:00 vs 03:00 of the town day; the night falls with it).
- [ ] 9. Land on main, PROGRESS.md paragraph, tick M1 in LEAD.md.

**Note on units:** one sim second is one game minute, and at 1x one real second (check `speed` in `sim.worker.ts`). So `dayLen = 240`
is a 4-minute town day at 1x; the season's month is 120 sim s, so about half a town day... the owner picks the length.

## Next action
Step 7: write `tests/town-day.test.ts` (demandAt peaks with a short day; LotTrips trip counts per town day; DAY keeps the classic numbers). Steps 3-6 are in: the message `townDay` (protocol, worker), `SimClient.setTownDay/sendTownDay` (sent with every setGolf), `Game.townDay/setTownDay/clock()`, the gear rows in `NightPanel.tsx` (golf games only).

## Done (newest first)
- 2026-10-23: docs/LEAD.md and this file written; stock taken (see PROGRESS.md "2026-10-23: Claude leads the code").
