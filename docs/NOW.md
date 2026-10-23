# NOW: the live work log (read docs/LEAD.md first)

Update this file **before** each edit and after each sub-step. If you are picking up from someone else: follow LEAD.md section 7.

## Current step
- **Milestone:** M2 Crowds (LEAD.md section 3). **Not started**: no branch yet; cut `lead/m2-crowds` from `origin/main` when you start.
- **Goal:** tournament spectators are real movers (cars to car parks, walkers to the gates, queues, galleries, home again), and the
  results' counts come from them.

## Plan (first: find out what runs today; tick as you go)
- [ ] 1. Read how a golf tournament day runs now: `city.ts` (round stages free/build/surge/eval in golf mode; `setGolf`), `event/surge.ts`
  (party cars to car parks), `event/crowd.ts` (walkers), `golf/tournamentday.ts` and `golf/venue.ts` (what the results read). Write the
  findings here: what is simulated, what is a formula, what is drawn.
- [ ] 2. Design the crowd model for golf (in LEAD.md section 5 as a decision): where spectators come from (the town, the highway entries
  for the seasonal crowd), the car parks they use, the gate(s) of the course, the galleries (tees, greens, grandstands, tents), the exit.
- [ ] 3. Implement in steps, each with tests and a browser check, the walkers drawn with the townspeople sprites at street zoom.

## Next action
Step 1 above (read and write down the findings).

## Done (newest first)
- 2026-10-23: **M1 Living town landed** on main (see PROGRESS.md). Branch `lead/m1-town-day` deleted after landing.
- 2026-10-23: docs/LEAD.md and this file written; stock taken (see PROGRESS.md "2026-10-23: Claude leads the code").
