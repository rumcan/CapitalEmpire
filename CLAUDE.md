# CapitalEmpire: working rules for Claude

Two agents share this repo (from 2026-10-21): the second agent writes the game code, the first chat does the art with the owner;
who owns which files and how to land work on main without clashing is in `docs/SECOND-AGENT.md`. Read `docs/PROGRESS.md` first: it says where the project is, what was decided, and what to do next. Open
`docs/GAME-PLAN.md` only for the section the current task needs (it is long).

## How we work (the owner asked for this, to save tokens)

- **One chat per phase (or big step).** When a phase is done, or the chat is getting long, update
  `docs/PROGRESS.md` and give the owner a start prompt for a fresh chat. Never rely on chat history: everything a
  new session needs is in `docs/PROGRESS.md`.
- **Save tokens: delegating code is the default.** The lead model (you) does not write implementation code itself.
  Every piece of coding goes to `haiku-coder` with a precise brief: files, exact change, check to run. Every test,
  build and benchmark run goes to `haiku-runner`. The lead writes code only when a brief would cost more than the
  change itself (a one-line fix), or after `haiku-coder` has failed twice on the same task. Read files sparingly:
  use Grep and line ranges, not whole files.
- **The lead model designs, the Haiku 5.5 agents do the work.** The owner has authorised these agents:
  - `haiku-coder` (`.claude/agents/haiku-coder.md`): implements a scoped change. Brief it with the exact files, the
    change, and the check to run. Review its diff before accepting it.
  - `haiku-runner` (`.claude/agents/haiku-runner.md`): runs tests, builds and benchmarks (on the worker PC) and
    returns a short summary, so long logs stay out of the lead's context.
  - Keep for the lead: architecture, briefs, reviewing diffs, debugging with unknown causes, anything touching
    several systems at once, and updating `docs/PROGRESS.md`.
- **Slow checks run on the LAN worker PC** (`scripts/worker/run.sh "<command>"`; setup in `docs/PROGRESS.md`). The
  worker clone is read-only: never commit or push from it.
- **Update `docs/PROGRESS.md`** after every verified step: status table, numbers, decisions, next steps.
- **Commit locally after each verified step** (message ends with the Co-Authored-By line). Push only when the owner
  says so.

## Project facts

- **The game is a golf events manager** (the owner's pivot, 2026-10-21): the design is `docs/GOLF-PLAN.md`, the art list
  `docs/GOLF-SPRITES.md`. GAME-PLAN.md's systems sections still hold; where they differ, GOLF-PLAN.md wins.

- Vite + React + TypeScript, single-file build. WebGL2 rendering, ground painting in Web Workers on OffscreenCanvas.
- Map: 2048 x 2048 tiles of 2 m (4 x 4 km). Closest zoom 30% (`ZOOM_MAX`), art at 0.6x native as mip 0.
- Keep the road builder's instant, pretty roads: edits rebuild incrementally and the ground re-bakes itself. Never
  add a manual "rebuild ground" step (the TrickOrTreat town builder has one; we deliberately do not).
- TrickOrTreat (`../TrickOrTreat`) is a read-only art and idea source. Never write to it, least of all to its
  `output/town-builder/` (the owner's data).
- Commands: `npm run dev` (port 5173; `.claude/launch.json` uses 5174), `npm test`, `npm run typecheck`,
  `npm run build`, `npm run bench`, `npm run worker:test`, `npm run worker:bench`; headless gates `npm run sim:gate`,
  `npm run town:gate`, `npm run fix:gate` (run the long ones on the worker).
- Performance budgets are in `docs/GAME-PLAN.md` section 2.3. Check them with the benchmark after any change to
  rendering, the network or traffic.
