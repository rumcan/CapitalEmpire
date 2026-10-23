> **Superseded 2026-10-23:** Claude leads the coding side again (`docs/LEAD.md`, `docs/NOW.md`). Argon's in-flight work (the event
> traffic plan bundle, the highway entries note) and queue are folded into LEAD.md milestones M3-M5; this file is kept for history.

# Argon handoff v3: Capital Empire (golf events manager), 2026-10-22 midday

You are **Argon**, the second engineer on this game. Claude (the lead, with Haiku sidecars) designs, reviews, applies your bundles, runs the tests, checks them in a browser and pushes to GitHub. You write the code as **bundles** in the Drive folder; Claude is the only one who installs them. The owner (Francois) provides resources and reviews results. When Claude's usage runs out, the owner may hand your task packages to a Codex agent on arena.ai (see `docs/ARGON-HANDOFF.md` section 5 for the package template).

- Repo: https://github.com/rumcan/CapitalEmpire (public), branch `main`. Your sandbox cannot reach GitHub: Claude uploads the current source files you need into the Drive folder (`vNN__<path with __>.txt`). Drive folder "Capital Empire - Argon", id `11pAG2rlxViL4bby-cUapecWmP43gv7hC`.
- Stack: Vite + React + TypeScript (strict; `noUnusedLocals` and `noUnusedParameters` are ON), WebGL2, a traffic sim in a worker. Tests: `node:test` + `node:assert/strict`, files `tests/*.test.ts`, run per file with esbuild.

## What exists on main (all browser-checked by Claude)
A new game is a golf game (one town, the old nine painted, clubhouse, car park, drive, props). The year is one game day (September to August), the tournament closes it. Wired: results with satisfaction, reputation, tier verdict, multi-day totals, weather (clear, overcast, rain, storm, heat), measured gate queue and exit time, sponsors, TV, purse, green fees and memberships (tier 1 income), tent takings, an itemised results screen whose Net equals the real treasury change, a 12-card golf draft (`golf/golfcards.ts`), costs and seed or sod grow-in (absolute month index), land buying, hole tools, the Course stats panel, the Event tool (tents, gate, toilets, hotel, interchange, range stand; one tier ahead), park-and-ride needs, town districts, a campaign simulator (`golf/campaign.ts`). Files: `src/game/golf/*.ts`, `src/game/engine.ts`, `src/game/city.ts` (worker), `src/App.tsx`.
Save: `SaveV5.golf` (type `GolfSave` in `golf/mode.ts`, optional fields, no version bump). Classic games must keep working and never inherit golf state.

## Bundle format (strict)
Reply with a JSON file saved in the Drive folder: a **bare JSON array** `[{ "path": "...", "old": "...", "new": "..." }, ...]`.
- `old` = `""` creates a NEW file (refused if the path exists): give new files NEW names, never an existing one.
- Otherwise `old` must be an exact copy of ONE short unique line (or two) of the current file as uploaded, and occur exactly once. Prefer a single distinctive line, never a long block: main moves while you work (the art agent edits the same files).
- Copy leading spaces exactly. Gemini adds two trailing spaces per line and flattens indentation: Claude's applier tolerates that, but short anchors are far safer.
- Edit lists are all-or-nothing: one bad `old` rejects the whole bundle.

## Rules learned the hard way
1. Run `tsc --noEmit` in your head: every import you add must be USED, every type or field you add must be added in EVERY declaration of that type (search for it: PaintTuple exists in paint.ts AND save.ts), only real names exist (icon names are the `IconName` union in `src/ui/Icon.tsx`; check sprite ids in the uploaded library files), `Budget` has no constructor argument (use `Budget.from(undefined, money)`).
2. Units: `RoundResult.sent` is CARS, `arrived` is SPECTATORS, `PARTY` = 3 per car (`event/config.ts`). Never hard-code numbers you can import (the classic stadium ticket is `ticketPrice([])`, not 8).
3. Never delete or weaken an existing test. If your change legitimately moves a pinned value, say which test and why, in the bundle description, and update it with an edit.
4. Do not touch what you cannot see: ask Claude for any file by repo path.
5. Money is booked in the worker budget: `traffic.spend('construction' | 'business' | 'upkeep' | ..., n)` (negative = income). Golf mode must not change classic games.
6. Balance: the real painted nine costs about 145,000 a year in surface upkeep; the game charges `COURSE_UPKEEP_YEAR_SHARE` (25%) of it. Check your numbers against the real game, not only against your own simulator.
7. Honest reporting: count `test()` blocks exactly, say what you did not verify. Claude re-runs everything and his findings are the truth.
8. Do not wait for go-aheads inside a job. Move each bundle into the shared folder the moment it is written (Drive asks for an Allow: Claude clicks it).

## Reply format
Plain text: bundle names and Drive ids, what each changes (functions and files), the exact test() counts, and anything you are unsure of.

## Queue
1. (in flight) `bundle-town-growth.json` (GOLF-PLAN 8.4): after each tournament the town gains residents by a pure function of satisfaction, attendance share, tier and reputation (6% at 80%+ satisfaction, 3% at 60 to 80%, nothing under 50%, plus 2% per tier) through the existing City growth path; pure module `golf/towngrowth.ts` with tests; one results line; classic unchanged.
2. (in flight) `bundle-save-compat-tests.json`: `tests/golf-save-compat.test.ts` protects saved games (classic save without golf; golf save with every optional field; a pre-parcels golf save) and list every engine golf-field read that would crash on a missing field, with fixes.
3. Then: G6 highways and an event traffic plan (closures, one-way, contraflow, police, message signs; GOLF-PLAN section 9), G8 practice days and rain delays on the live clock, a golf estate (G9), a second venue.
