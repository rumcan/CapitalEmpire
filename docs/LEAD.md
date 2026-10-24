# LEAD: the coding lead's playbook (from 2026-10-23)

**Who leads:** Claude (the chat on the owner's PC, `E:\Repos\CapitalEmpire`) took over the coding side from Argon on 2026-10-23 (the owner:
"take over from Argon with the coding side but keep the core game loop in focus"). Art is the same chat's other hat; nobody else writes
game code unless the owner says so. **Any AI can step in:** read this file, then `docs/NOW.md` (the live work log), then carry on from
NOW.md's "Next action", even if the last session stopped in the middle of a line (see "Resuming" below).

## 1. The game in one paragraph
Capital Empire is a **theme-park-style management game about a golf tournament town**. The player owns a golf course beside a small town.
Most of the year the town lives its normal life (commuters, shoppers, rush hours morning and evening). Once a year the **tournament** comes:
seasonal crowds of spectators arrive by road (cars, buses, park and ride, later taxis from hotels), park, queue at the gates, fill the
galleries round the holes, spend money in the tents, and go home again. The player's job is the theme-park job: build the venue (course,
tents, stands, car parks) and above all **manage the transport and roads around the town** so the crowd gets in and out. The result
(attendance, satisfaction, money) moves the tour tier and reputation, and the next year's crowd is bigger.

## 2. The core loop (what must work end to end)
1. **Off-season** (most of the game year): the town lives (M1); the player builds roads, car parks, bus routes, the course and the venue.
2. **Tournament day(s)**: the crowd travels, parks, walks, queues, watches, spends, leaves (M2, M3); jams and queues hurt satisfaction.
3. **Results**: money lines, satisfaction, reputation, tier verdict (exists: `golf/tournamentday.ts`, `golf/yearend.ts`, `golf/tour.ts`).
4. **Next season**: bigger tier, bigger crowd, new requirements (exists: tour tiers, cards, town growth).

## 3. The MVP milestones (in order; tick them here and in NOW.md)
- [x] **M1 Living town** (landed 2026-10-23). A town day that cycles on its own (separate from the season's months): the lot trips follow it (commute out
  in the morning, home in the evening, shopping between), the night follows it, the HUD shows the time of day; the owner sets the day's
  length and the town's traffic density (gear menu). Traffic never goes dead between tournaments.
- [ ] **M2 Crowds.** Tournament spectators are real movers, not sampled counts: they arrive as party cars (and bus riders), park, walk
  from the car parks to the gates, queue there, spread into galleries (tees, greens, grandstands, tents, the 18th), and walk back and
  drive home at the end. The counts the results use come from them (parked, queued, admitted, late, left). Crowds are visible at street
  zoom (the walker sprites; galleries as dense groups).
- [ ] **M3 Transport and roads on the day.** The player's levers matter and are visible: car park capacity and fees, park and ride and
  shuttle buses, drop-off, the event traffic plan (closures, one-way streets, police at the car park gates), the highway entries the
  seasonal crowd comes from; jams delay arrivals and the results say why (late, missed tee times, angry spectators).
- [ ] **M4 The season loop, tidy.** Off-season → tournament week (practice days on the live clock) → tournament → results → next season,
  with the town growing with success; one coherent HUD for where in the year you are and what to do next.
- [ ] **M5 Balance and onboarding.** Tent economics (a $15,000 tent earns about $115 at tier 1 today), course upkeep (charged at 25%,
  `COURSE_UPKEEP_YEAR_SHARE`), crowd sizes per tier; first-run hints. The campaign simulator (`golf/campaign.ts`) and the real game agree.
- **After the MVP (details):** taxis from hotels to the course, rain delays on the live clock (G8), the golf estate and a second venue
  (G9), courtesy cars, staff and volunteers; **the crowd's wayward-ball scene** (a ball lands outside the ropes: the near spectators
  run to it and crowd round, marshals wave them back, they part into a corridor for the player, hush for the shot, then react; the art
  for it is in `docs/SPECTATOR-ART.md` 3b+). **Art comes after the code** (the owner: "if we get all the code done we can focus on art").

## 4. What already exists (verify before you rely on it)
- **Town traffic:** `sim/trips.ts` LotTrips: each home's share of `PER_RES` trips a day, by hour: morning home → job, evening job → home,
  else shopping; the curve `demandAt` (peaks 08:00 and 17:00). The hour comes from the sim clock. **In golf mode one game day is a whole
  season** (`golf/calendar.ts`: 120 clock units a month), so this curve ran over months and the town was nearly empty (12–25 cars for
  1,000 people). M1 fixes this.
- **Event crowd (from the stadium game, Phase 5):** `event/surge.ts` (party cars from homes to car parks at a departure bell),
  `event/crowd.ts` (walkers from car parks to stops or doors, queues), `event/bus.ts` (shuttles), `event/carpark.ts`, `event/toll.ts`,
  `event/curb.ts`. How much of this runs in golf mode is **not verified**: start M2 by reading `city.ts` round handling in golf mode.
- **Golf scoring:** `golf/venue.ts` (gate lanes, queue FIFO, cubicles, viewing), `golf/tournamentday.ts` (DayFacts, satisfaction,
  money), `golf/parkride.ts`, `golf/parkingfee.ts`, `golf/weather.ts`, `golf/multiday.ts`, `golf/sponsors.ts`, `golf/yearend.ts`.
- **Pedestrians:** `engine.ts` `Pedestrians` (town walkers at street zoom), `pedMovers`.
- Read `docs/GOLF-PLAN.md` (sections 2, 5, 11) for the design, `docs/PROGRESS.md` (the end) for what was verified.

## 5. Decisions (keep adding; the newest last)
- 2026-10-23: **The town day is separate from the season.** The season keeps its time model (one game day = one season, GOLF-PLAN open
  question 1); the town gets its own day of `dayLen` sim seconds (default 600 = 10 real minutes at 1x, the owner's setting; 4 minutes
  smeared the rush hours, as a 2 km trip takes ~140 sim s), which drives the lot trips, the night and the HUD clock. It runs on the sim's
  own time `t` (never stops), not the season clock (frozen at the season's end), so the town never goes dead. In classic (non-golf) games `dayLen` stays 1440 (the old behaviour).

- 2026-10-23: **The crowd model (M2)**: spectators stay parties of `PARTY` fans from the surge; they walk from their bay to the course's
  gates (the placed gate structures, else the clubhouse plot's doors), queue there and are admitted at the gates' lane rate; inside they
  stand in galleries (tees, greens, stands, tents); at the day's end they walk back and their cars drive home. The results' gate waits,
  lateness and exit times come from these movers (replacing `measureGateFlows`). Details and the step list: NOW.md "The M2 design".
- **2026-10-24, the owner: the lead's recommendation is the decision.** Design and planning questions no longer wait for the owner: the
  lead takes the recommended option, records it in the plan's "Owner decisions" and here, and states it in the chat. Irreversible or
  outward-facing actions still get asked first.
- **2026-10-24: Alpha 1.0 is defined (plans/P01.md)** — testers are the owner plus 2–3 newcomers; tiers 1–3 balanced, 4–5 smoke-tested;
  placeholder art allowed if it reads; the single HTML file is the Alpha build. **The season loop (plans/P04.md)**: money booked by the
  month, the tier offer is a choice (Move up default), Skip warns about un-grown seeded surfaces with Lay sod, practice days stay resolved.

## 6. How to work (so anyone can continue)
- **The live log is `docs/NOW.md`.** Before you edit, write there: the step, the branch, the files and the exact change you are about to
  make ("Next action"). After each sub-step, tick it and write the next action. Keep it short and concrete (function names, file paths).
- **Branch per step**, named `lead/<milestone>-<slug>` (e.g. `lead/m1-town-day`), cut from `origin/main`.
- **Commit early and often on the branch**, WIP commits allowed (`WIP: ...`), and **push the branch** (`git push -u origin <branch>`)
  after each commit, so another AI on another machine can pick it up. Land on `main` only when it is verified (below); then delete the
  branch.
- **Verified means:** `npm run typecheck` clean, `npm test` all green, and for anything visible or anything that moves money or
  progression a browser check on the built game (`npm run build`, the 5174 preview), written down in NOW.md with what was seen.
- **Landing:** `git fetch origin && git merge origin/main` on the branch, test again, then fast-forward `main` and push. Update
  `docs/PROGRESS.md` (one paragraph: what changed, how it was checked) and tick the milestone item here.
- **Never** leave `main` red. Never push a WIP commit to `main`.
- Git on the owner's PC needs `safe.directory`: prefix commands with `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0=*`.

## 7. Resuming (the previous session stopped, maybe mid-line)
1. `git fetch origin`; read `docs/NOW.md` (it names the branch and the next action).
2. `git switch <branch>` (or `git switch -c <branch> origin/<branch>` on a fresh clone); `git status` and `git diff` show uncommitted work;
   `git log origin/main..HEAD` shows the branch's commits.
3. `npm run typecheck`: a half-written line shows up as an error at its file and line; finish it as NOW.md describes (the change's
   intent is written there before it was started).
4. `npm test`, then carry on from "Next action". Update NOW.md as you go.

## 8. Where things are
- Game code `src/game/` (engine `engine.ts`, sim worker `sim/`, ground painter `renderer.ts`, golf `golf/`, event `event/`), UI `src/App.tsx`
  and `src/ui/`, tests `tests/*.test.ts` (node test runner; `npm test`), art pipeline `scripts/assets/` (studio: `review/server.mjs`).
- Servers on the owner's PC: the game `npx vite preview --host 127.0.0.1 --port 5174 --strictPort` (serves `dist/`; rebuild with
  `npm run build`), the studio `node scripts/assets/review/server.mjs --port 5179` (run with the git safe.directory variables above).
- Other docs: `GOLF-PLAN.md` (design), `PROGRESS.md` (history), `SECOND-AGENT.md` (who owns what, logs), `GRASS-SYSTEM.md`,
  `ART-PIPELINE.md`, `COURSE-BUILDER.md`, `HANDOVER-ART.md` (the art queue), `ARGON-LEAD.md` (the previous lead's notes; superseded).
