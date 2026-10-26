# Lot lab: handover (2026-10-26)

Read this to continue the lot lab work in a fresh chat. The design and the rules the game follows are in
`docs/plans/P20.md`, section "The lot lab". This file says where the work is, what runs, what is verified and what is left.

## Where the work is
- Worktree `E:\Repos\CapitalEmpire\.claude\worktrees\lot-presets`, branch `lot-presets`, from origin/main `9aa357b` (after #258).
  Its own `node_modules` (copied from `worktrees/theme-consistency`, without `.vite`). Never run Vite from another checkout's node_modules.
- Commits are local only. **Not pushed, no PR yet**: ask the owner before pushing or opening the PR.
- Git on this machine needs `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0=*` in the environment.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## What runs (the owner asked for these two to stay up)
- Game dev server: http://localhost:5241 (`.claude/launch.json` config `lot-presets-game`).
- Studio: http://127.0.0.1:5242 (config `lot-presets-studio`, env `STUDIO_GAME_URL=http://localhost:5241`). Its **Lots** tab frames
  http://localhost:5241/?lotlab&dev.
- Start them with the browser preview tool (`preview_start` with those names). Stop them with `preview_stop`, or end the
  `node`/`vite` processes listening on 5241 and 5242. Remove both launch.json entries once the work is merged.
- The owner's own servers on 5174 (game) and 5191 (studio) run from `worktrees/theme-consistency`: leave them alone.

## The owner's requests in this chat, in order
1. A dev server on latest main with the studio connected to it (done: above).
2. A Lot presets page: generate a lot as the game would (building facing the road, fence and everything), for residential,
   commercial and industrial at every road angle; edit it (add, move, delete, rotate); save it; it then generates in the game;
   over time hundreds of approved lots (done: the lab, approve flag, matching in compose.ts).
3. It replaces the studio's old Lots tab; just one road with one generated lot beside it, never the whole map or town; the road
   angle and lot random on Generate; paint asphalt and pavement (done).
4. Farms are lots too (done: the Farm type, farm presets).
5. Do not slice off props at the lot's edge; no black background, the map's own grass instead (done: no mask; forest and farms
   are kept away from the lab lot, `Engine.labClear`).
6. The cursor must be select, not the road tool (done: stageLab sets the select tool).
7. **Open:** the leaf decals cannot be selected; bring in TrickOrTreat's town builder tools to lay decals and props from a list.
8. **Open:** this handover (this file).

## Verified (browser, 2026-10-26)
- The lab stages a lot on an axis road and on a diagonal road; Generate, variants, Save draft, Approve all work; an approved
  road-7 preset was drawn by the game's own pick for unforced lots of nearby sizes on road 7, and road 5 stayed a green.
- The studio's Lots tab frames the lab; no town shows; the map round the lot is plain grass; tall props show whole.
- Typecheck clean; 85 lot and farm tests pass (`tests/lot-presets-lab.test.ts`, `tests/lot-presets-farm.test.ts`, the compose,
  preset, lot-edit, lettering, town-growth and farm tests). The full suite was not run (it runs nightly).
- **Not yet checked in the browser:** ground painting (drag, erase), the Farm type, Review drafts, the camera fit on a farm,
  sessionStorage restore after a reload.

## Files (what each does)
- `src/game/dev/lot-lab.ts`: the lab panel (types, states, sizes, road compass, Generate, preset box, edit buttons, paint ground,
  sprite palette, coverage table, presets here), random generate, the camera fit, the paint layer, sessionStorage memory.
- `src/game/dev/lot-editor.ts`: the in-game dev editor (select, drag to move, keys, Place); exports for the lab: `saveLotPresets`,
  `thumb`, `armPlacing`, `editorAct`, `pauseEditor`.
- `src/game/engine.ts`: `stageLab`, `restageLab`, `labClear` (forest kept off), farms through `farmPreset`, `recomposeLots` also
  re-queues farms.
- `src/game/lots/presets.ts` (`Road`, `road`, `approved`, `approvedFor`, 'farm'), `preset-read.ts`, `preset-frame.ts` (`roadOf`,
  `quarterOfRoad`), `preset-from.ts` (a composition as a preset), `compose.ts` (`pickedPreset` tiers, forced preset, `isAngled`,
  `farmPreset`), `compose-core.ts` (`ComposeState.preset`).
- `scripts/assets/freeze-lot-presets.ts`: a freeze keeps every lab preset.
- `scripts/assets/review/studio.html`, `server.mjs`: the Lots tab and `/api/config`.

## Gotchas
- `src/game/lots/lot-presets.json` is written by the lab and the dev editor (whole file, through `/__dev/save`). It holds the
  owner's lab drafts: never commit test presets you made yourself, and never delete the owner's (ids `lab-...`, `curated: true`).
- Editing `compose.ts` or `presets.ts` while the lab is open makes Vite reload the game page; the lab restores its place from
  sessionStorage.
- Fences, street items and the leaf decals of town lots are still procedural (P20 decision 2): shown in the lab, not editable per
  preset. Request 7 changes that for decals.

## Next steps
1. Request 7: decals and props from a list, like TrickOrTreat's town builder (read-only source `E:\Repos\TrickOrTreat`; never write
   to it). Plan: a preset gains its own decals (`decals: { id, x, y, scale, alpha }[]` from `lot-decals.ts`); a lab preset with
   decals draws them instead of the procedural leaf decals; Generate copies the procedural ones into the draft so they can be
   selected and deleted; the panel gets a decal list with thumbnails, click to place, click a decal to select, move, delete.
2. Check the open browser items above.
3. Ask the owner, then push the branch and open the PR against main; remove the launch.json entries after the merge.
