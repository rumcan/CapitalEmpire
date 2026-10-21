# A005: Supplied construction-site artwork

Status: verified locally; publishing awaits the owner's approval

The owner asked the art developer to finish the supplied digger and construction-material sheets from `output/construction/`
and place them on the game's construction sites. This is the art handover task, with runtime integration explicitly requested.

## Scope

- Retain the two transparent masters in `art/construction/` and reproducibly pack sixteen materials plus the isometric digger.
- Generate `src/assets/construction/*` and `src/game/construction-library.ts`; preserve existing saved library indices.
- Integrate through `src/game/library.ts`, its generator `scripts/assets/prep-sprites.mjs`, and `src/game/lots/compose.ts`.
- Include the new library, rebuild step, and scale overrides in `scripts/assets/review/server.mjs` and `scripts/assets/prep-scales.mjs`.
- Verify with `tests/construction.test.ts`, existing composition checks, typecheck, the full test suite, build and browser screenshots.
- Work in `claude/construction-art`; preserve the other session's dirty checkout, TrickOrTreat, docs and existing server processes.

## Acceptance

All supplied materials appear across deterministic construction-site compositions on both street axes. The actual excavator
replaces the placeholder scrapyard crane. Props retain transparency, real-world scale, valid lot footprints and studio controls.
Land verified work locally under the shared merge lock and rebuild the owner's preview; ask before publishing new commits.

## Validation (2026-10-21)

- Typecheck and production build passed; `dist/index.html` is 76,994,901 bytes.
- Full suite: 640/642 passed, with the two documented timing flakes. Isolated reruns passed 8/8 drivers and 8/8 terrain;
  ACC 136.1 ns/call, slowest terrain seed 3450 ms (limit 4000 ms).
- Construction and existing composition checks passed, including all sixteen materials across 128 seeds for each of four
  street facings, determinism, containment, collisions, saved-index ordering, and supplemental studio scale overrides.
- Browser: houses face their streets on the staged grid; construction sites checked at 1920x1080 and 1366x768,
  56 diggers and all sixteen material IDs present, no WebGL error. Studio lists and renders all seventeen thumbnails.
- Review screenshots and logs are retained in the worktree's ignored `output/construction-review/` directory.
