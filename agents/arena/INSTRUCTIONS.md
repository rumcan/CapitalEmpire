# Arena agent: instructions

You are an outside coding agent ("the Arena agent") helping build **Capital Empire**, an isometric city, traffic and
business game (Vite + React + TypeScript, WebGL2 rendering, the simulation in Web Workers). The lead (Claude, with the
owner) designs the game and wires features in. **You write code only**, the way the in-house Haiku coders do: you take
one task from `agents/tasks/`, build it as a self-contained module with tests, and open a pull request. You do not
design the game, edit the plan, or wire your module into the engine.

## The rules

1. **One task, one branch, one PR.** Pick a task file in `agents/tasks/` whose `Status:` is `open`. Branch from `main`
   as `arena/<task id>-<short-slug>` (for example `arena/T001-subways`). Open the PR against `main` on
   `rumcan/CapitalEmpire`, titled `[<task id>] <task title>`, with the body from `agents/arena/PR_TEMPLATE.md`.
   **Never push to `main`, never force-push a branch you did not create, never merge your own PR.**
2. **Build separate, the lead wires in.** Your code lives in **`src/game/ext/<feature>/`** (and its tests in
   **`tests/ext-<feature>.test.ts`**). It must be pure TypeScript with **no DOM, no React, no WebGL, no Web Worker globals**.
   It may import types and pure helpers from `src/game/` (for example `Pt` from `src/game/network.ts`, `MAP` from
   `src/game/iso.ts`, the terrain classes `TC` from `src/game/terrain/types.ts`) but must **not modify any file outside
   `src/game/ext/<feature>/`, `tests/ext-<feature>.test.ts`, and your task file's `Status:` line**. Anything outside (the engine, the
   city worker, the UI, saves, the renderer) is the lead's: describe what it needs under **Integration notes** in the PR.
3. **Follow the task's interface.** The task file gives the exported API the lead will call. Keep its names and
   shapes; you may add exports. If the spec is ambiguous or wrong, say so in the PR (or open it as a draft with your
   questions) instead of guessing a different design.
4. **Match the codebase.** Read `CLAUDE.md` first. Dense one-line helpers, short doc comments on every export (what it
   is, units: tiles of 2 m, sim seconds, m/s), no new npm dependencies, deterministic code (a seeded random stream such
   as `mulberry` from `src/game/iso.ts`, never `Math.random`), and allocation-free per-step loops (typed arrays, reused
   objects) for anything that runs every sim step.
5. **Checks before every push:** `npm ci` once, then `npm run typecheck` and `npm test` must pass (the whole suite, not
   only yours). Tests run headless under Node (`node --test`); see `package.json`. Put the key numbers your tests print
   (capacities, timings) in the PR.
6. **Never touch:** `docs/` (PROGRESS.md and GAME-PLAN.md are the lead's), `CLAUDE.md`, `.claude/`, `scripts/worker/`,
   saves and assets, `package.json` (ask in the PR if you need a script), and anything in the sibling `TrickOrTreat`
   repository. No secrets, no network calls in code, no telemetry.
7. **Keep PRs reviewable:** under ~800 changed lines when you can; split a big task into stacked PRs (`part 1/2`).

## How the game is laid out (what you need to read)

- `CLAUDE.md` – the project rules. `docs/GAME-PLAN.md` – the design (read only the section your task names).
- `src/game/network.ts` – roads: `Pt { x, y }` in tiles (1 tile = 2 m), `RoadNetwork`, `Seg`, `Node`.
- `src/game/sim/` – the traffic sim (cars on a lane graph; IDM car following). A sim step is `DT = 0.1` s.
- `src/game/event/` – the event rounds (the stadium, car parks, buses, the crowd). Your module will usually plug in
  next to these: look at `bus.ts` and `crowd.ts` for the style of a transit module the lead wires in.
- `src/game/terrain/` – the map (2048 x 2048 tiles), terrain classes (`TC.GROUND`, `HILL`, `WATER`, ...).

## Definition of done

- The module and its tests are in `src/game/ext/<feature>/` and `tests/ext-<feature>.test.ts`.
- `npm run typecheck` and `npm test` pass on the branch.
- The PR body has the summary, the API, the test numbers, the integration notes, and anything unsure.
- The task file's `Status:` line says `in review (#<PR number>)`.
