# Argon handoff: Capital Empire (golf events manager)

Hello Argon. You are the **second engineer, reviewer and writer of Codex task packages** on this game. Claude (the lead coder, with
Haiku sidecars) designs, reviews and lands code; a separate Claude chat does the art with the owner. When Claude runs out of usage,
the owner asks **you** for the next task package, gives it to a Codex agent on arena.ai (Agent mode, GitHub connected), and brings
you the pull request to review. On creative calls you decide together with Claude; the owner provides resources and reviews results.

_Written 2026-10-21 by Claude (the code agent). This file lives in the repo as `docs/ARGON-HANDOFF.md` and is copied to the shared
Drive folder "Capital Empire - Argon" (id `11pAG2rlxViL4bby-cUapecWmP43gv7hC`, anyone with the link can view); the repo copy is the
current one. Save everything you write for this game into that folder._

## 1. The game and the repo
- **Repo:** https://github.com/rumcan/CapitalEmpire (public). Base branch and PR target: **`main`**. Your sandbox cannot reach
  GitHub: ask for any file by its repo path and Claude or the owner puts it in the Drive folder.
- **What it is:** a city-traffic builder turned **golf events manager** (the owner's pivot, 2026-10-21). You run the Maple Falls Open:
  year one is a club championship on a tired 9-hole course beside a small town; each year you get twelve months to rebuild holes,
  extend to 18, lay roads and car parks and plan tents and stands; then tournament day runs live as the crowd drives in, parks and
  pours through the gates; then results, reputation, the tour's tier verdict and a card draft. Ten years on, the same town hosts a major
  with 50,000 people a day.
- **Stack:** Vite + React + TypeScript (strict), single-file build. WebGL2 rendering; the ground is painted in Web Workers on
  OffscreenCanvas; the traffic sim (IDM car-following + MOBIL lane changes) runs in its own worker. Map 2048 x 2048 tiles of 2 m.
- **Commands:** `npm ci`, `npm run typecheck` (tsc --noEmit), `npm test` (esbuild bundles `tests/*.test.ts`, then `node --test`; about
  600 tests; two timing tests flake), `npm run build` (the single-file `dist/index.html`, about 75 MB), `npm run dev` (port 5173).
  One test file: `npx esbuild tests/<f>.test.ts --bundle --platform=node --format=esm --loader:.webp=empty --loader:.png=empty
  --loader:.jpg=empty --outfile=output/tests/<f>.test.mjs && node --test output/tests/<f>.test.mjs`.
- **Docs to ask for** (by path): `CLAUDE.md` (working rules), `docs/PROGRESS.md` (the status; read from "The golf pivot" to the end),
  `docs/GOLF-PLAN.md` (the design; section 11 is the roadmap G0-G9, section 13 the owner's open questions), `docs/GOLF-SPRITES.md`
  (the art list), `docs/PAINT-TOOL.md`, `docs/PARKING.md`, `docs/SECOND-AGENT.md` (the code / art split and file ownership).

## 2. The owner's rules (in the owner's words where we have them)
- "You guys need to check each other, shortcuts are unacceptable." Every claim of "tests pass" is checked by running them.
- Keep the road builder's **instant, pretty roads**: edits rebuild incrementally and the ground re-bakes itself. **Never add a manual
  "rebuild ground" step.**
- **Nothing is placed as a whole green or fairway sprite**: the course's playing surfaces are painted with the Paint tool's areas.
  Object sprites (clubhouse, carts, flags, tents, stands) are fine.
- **Lettering is never mirrored** (shop signs read backwards when a sprite is flipped): see `src/game/lots/lettering.ts`.
- TrickOrTreat (a sibling repo) is a read-only art source: never write to it.
- Performance budgets (GAME-PLAN section 2.3): 60 fps at every zoom on the benchmark; check after any change to rendering, the network
  or traffic.
- Commits and PRs say what changed and how it was tested. No new dependencies unless a package names them.
- Until the owner answers GOLF-PLAN section 13, its recommendations are the defaults (one game day is one golf season, September to
  August, the tournament at the season's end; legacy saves keep loading).

## 3. Where things are now (2026-10-21)
- **G0, the plan:** done (GOLF-PLAN.md, GOLF-SPRITES.md).
- **Pure golf modules on main, tested:** `src/game/golf/` types, calendar (now with the season: `seasonMonth`, `seasonLabel`,
  `monthsLeft`), tour (tiers, reputation, verdicts, `spectatorDemand`), holes (hole derivation), coursegen (`generateOldNine`), tents,
  venue, mode (`GolfSave`, `GolfView`).
- **G1, golf mode foundation, in progress (Claude):** course placement beside the town (`golf/place.ts`), the course as Paint areas
  (`golf/paintcourse.ts`), a game-placed Clubhouse business whose doors the tournament crowd heads for, the tournament starting itself at
  the season's end on the existing event-round surge, the golf HUD (tier, month, months left, skip to tournament), then the engine
  wiring (a new game is a golf game; save and load; legacy saves load as classic).

## 4. The next jobs, in order (keep this list current)
1. **G1 finish** (Claude is on it): engine wiring (a new game is a golf game; save and load), build, browser check.
2. **Town districts** (Claude is on it; the owner asked twice): every town has a clear commercial district (the lots on its main
   asphalt street near the centre: shops only) and a clear industrial district (a 2 x 2 block corner of its grid toward the highway:
   works only); the rest residential with a few shops (`src/game/lots/districts.ts`, `useFor` in `src/game/lots/town.ts`).
3. **G1c, course dressing:** tee markers and flagsticks at the layout's tees and pins, trees lining the holes, a cart path loop, benches.
4. **G2a, land:** the owned parcel and buying adjacent farm or town blocks (houses bought out at the land price).
5. **G2b, hole tools:** tee and pin placement, `holes.ts` derivation shown in a course stats panel (par, lengths, warnings).
6. **G2c, course costs:** painting costs money by surface and m²; seed (months of grow-in) or sod (ready now, 3-5x the price);
   monthly maintenance.
7. **G3, tournament days:** spectator demand by tier and reputation, the gates and their queues, the exit wave, on time / missed / exit
   time, tickets and parking, the new results screen (`tour.ts`, `venue.ts`).
8. **G4, the Event tool:** tents and structures (`tents.ts`): rent or buy, placement rules, takings and queues.
Each of these is several packages: split them so each fits one PR.

## 5. The task-package template (for a Codex agent that knows nothing else)
Write each package as a file in the Drive folder, about 5,000 characters or less, one job, one PR:
```
# <ticket id>: <title>
Repo: https://github.com/rumcan/CapitalEmpire  Base branch: main  PR target: main
## Goal
<two or three plain sentences: what the player or the owner will see>
## Files
- Create: <paths>   - Change: <paths, with the functions or lines>   - Do not touch: <paths>
- Interfaces to match: <exact TypeScript signatures, copied from the repo>
## Constraints
- The owner's rules (section 2 of the handoff that apply); strict TypeScript; no new dependencies; match the file's style
  (dense code, a /** ... */ comment on every export); pure modules under src/game/golf/ where possible.
- Performance: <limits, if it touches rendering, the network or traffic>
## Acceptance checks
- `npm ci && npm run typecheck` passes; `npm test` passes (except the known timing flakes: name them);
- the new test file `tests/<name>.test.ts`: <the test code itself where possible>;
- <a browser check, if visual: what to look at and what passing looks like>
## The PR
Title: <ticket id>: <title>   Body: what changed, how it was tested (commands and their output summary).
```

## 6. Working agreements
- Every message names the files it means, by repo path or Drive file name and id.
- Code from you comes as a JSON bundle in the Drive folder: `{ "ticket": ..., "description": ..., "files": { "<repo path>": "<content>" } }`.
  Claude unpacks it with a path-checked script into a holding folder, reviews it, runs the typecheck and tests, and writes a review note
  back to the folder. Nothing is installed unchecked.
- Plain text, no Canvas documents for code. Inside a job you have been given, don't wait for a go-ahead: finish it, then report.
- Ask for any file you need by its repo path.
- The cross-check runs both ways: review Claude's plans and briefs against the owner's words and say what you would change.
