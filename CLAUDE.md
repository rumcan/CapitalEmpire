# CapitalEmpire: working rules for Claude

> **Start here, after any switch-over or crash (2026-10-26):** read `docs/NOW.md` section "START HERE". It is always current: what is
> in flight, the queue, and how to get every agent back to work. Then read `docs/AGENT-BRIEF.md`: the agent rules, the brief template,
> the progress protocol and the restart checklist. Every ticket is a GitHub issue. Its agent pushes the branch and comments on the
> issue after every sub-step, so the work survives a lost chat or a change of Claude account (the owner, 2026-10-26).
> Background on the game and how the lead works: `docs/LEAD.md`.
> **Asked to make the spectator / crowd art or the 3D people?** Start with `docs/HANDOVER-PEOPLE.md` (the state and next steps), then `docs/SPECTATOR-ART.md`.

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
- **Since 2026-10-24 the Claude sessions run ON the worker PC** (PiskriekDesk, 192.168.0.5): there is no `cworker`
  here, so `scripts/worker/run.sh` only applies from the old dev PC. **One heavy run at a time across all sessions**
  (16 GB RAM: check no other `vite build` / `node --test` is running first).
- **Testing during the day: your own code only; the full regression runs at night** (the owner, 2026-10-25, to speed up
  development). A coder runs typecheck plus the test files for the code it touched (and their neighbours), and nothing
  wider: no full `npm test`, no build, no gates, no bench, unless its ticket is about speed or the build. The lead merges a
  PR on a clean typecheck, those tests passing and a review, after merging main into it. Every night a scheduled task
  ("CapitalEmpire nightly regression", about 02:00) runs the full suite, typecheck, the build and the headless gates on
  main in `.claude/worktrees/nightly`, writes `E:/ClaudeTemp/nightly/<date>.md`, and opens one `[nightly]` issue for a
  real failure, naming the PRs merged since the last green night. Fix `[nightly]` issues first the next day.
- **Update `docs/PROGRESS.md`** after every verified step: status table, numbers, decisions, next steps.
- **Commit locally after each verified step** (message ends with the Co-Authored-By line). Push only when the owner
  says so.

## Disk: never use the C: drive (the owner, 2026-10-24)

C: is full. **Never put a clone, worktree, `node_modules`, build output, art export or large log on C:**, not even in your
scratchpad (it lives on C:). Worktrees go under `E:\Repos\CapitalEmpire\.claude\worktrees` (the `isolation: worktree` agents do
this already); temp and bulky files under `E:\ClaudeTemp`; the npm cache is `E:\npm-cache`. Remove your worktree
(`git worktree remove`) once its PR is merged. D: and E: have room; check `df -h /c /d /e` before anything big.

## Stop what you started when you are done (the owner, 2026-10-25)

Every AI (lead, coders, runners, art and other sessions) stops its own background work the moment it no longer needs it, and before
it reports back. This includes:
- dev servers (`npm run dev`, `vite`, `vite preview`, static servers) and the `npm`/`cmd` and `esbuild --service` processes behind them;
- `node --test`, builds, gates, the bench and headless browsers;
- watch loops, and anything you started with `run_in_background` or a preview tool.
Never leave a server idling for later.
- **The owner's own servers** (the game on 5174 and the studio on 5191, from `worktrees/theme-consistency`) are theirs: leave them alone
  unless they say otherwise.
- **Before your final report:** list what you started, check nothing of yours is still listening (PowerShell
  `Get-NetTCPConnection -State Listen` on your port, `Get-CimInstance Win32_Process -Filter "Name='node.exe'"`), and say in the
  report that it is stopped.
- **Finished worktrees** go too (`git worktree remove`) once their PR is merged.

## Project facts

- **The game is a golf events manager** (the owner's pivot, 2026-10-21): the design is `docs/GOLF-PLAN.md`, the art list
  `docs/GOLF-SPRITES.md`. GAME-PLAN.md's systems sections still hold; where they differ, GOLF-PLAN.md wins.

- Vite + React + TypeScript; the build is `dist/index.html` plus hashed asset files (T080; served by `vite preview` or any static server). WebGL2 rendering, ground painting in Web Workers on OffscreenCanvas.
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
