# AGENTS.md

> **If you are continuing the lead's work (not an arena task):** read `docs/LEAD.md` and `docs/NOW.md` first; they override the arena
> rules below for that work (the lead works in `lead/*` branches, edits docs and lands verified steps on `main`).
> **If you were asked to make the spectator / crowd art or the 3D people:** start with `docs/HANDOVER-PEOPLE.md`, then `docs/SPECTATOR-ART.md`.

Coding agents working on this repository: read **`agents/arena/INSTRUCTIONS.md`** before anything else, then
`CLAUDE.md`. Work only on a task from `agents/tasks/`, in its own branch, delivered as a pull request; build features as
standalone modules under `src/game/ext/<feature>/` with tests in `tests/ext-<feature>.test.ts` (the test runner only reads `tests/*.test.ts`); never push to `main`; never edit `docs/`.
