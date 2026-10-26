# Lot lab (lot presets): handover (2026-10-26, kept current)

## Start prompt (paste into a fresh chat)
> You are continuing the CapitalEmpire "lot lab" work (the studio's Lots tab: generate, edit, approve lot presets).
> Work in the worktree `E:\Repos\CapitalEmpire\.claude\worktrees\lot-presets` (branch `lot-presets`); never use the main checkout.
> Read `docs/handovers/lot-presets.md` there first (this file), then `docs/plans/P20.md` section "The lot lab". Git needs
> `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0=*`. The game dev server is http://localhost:5241 and the studio
> http://127.0.0.1:5242 (`.claude/launch.json` configs `lot-presets-game`, `lot-presets-studio`; start them with the browser preview tool
> if they are down). Leave the owner's 5174/5191 servers alone. Do the "Exact next step" below, check it as "How to check" says, commit,
> and keep this file current. Ask the owner before pushing or opening a PR.

## Now (the current work, newest first)
- **House sizes (the owner: "you have houses in the game that are at max size too small. i need those fixed ... the person wont even fit
  through the door at max size of the house"; "waiting on your house size fixes before we can start making the presets").** Cause found:
  the cap is the atlas picture's pixels at its last pack (`src/game/sizes.ts`, `prep-sprites.mjs` packs at `0.6 * max(1, ownerScale * 1.05)`),
  not the art: the TrickOrTreat sources hold about x3.3. Bug: `scripts/assets/review/size-report.ts` (~line 63) takes the atlas limit as
  the picture's own, so the studio refuses bigger sizes. Fix in progress (a coder): `native` from the source picture's real width, the
  studio allowing sizes up to it with the "once packed again" hint. Then: the owner sizes the houses in the studio Library (person cursor),
  then **Rebuild game sprites** packs them sharp at those sizes.
- **Several helpers on the network (the owner: "setup the studio to run on the network and anyone with the IP can help create preset
  lots").** Done and live (2026-10-26): studio http://192.168.0.2:5242 and game http://192.168.0.2:5241 (both listen on 0.0.0.0; the
  studio frames the game at the address the visitor used). Saves merge per preset on the server (`POST /__dev/presets`,
  `dev-save.ts mergePresets`, tests `tests/dev-save-merge.test.ts`): checked in the browser (a saved draft reached the file, Discard
  removed it, the owner's presets untouched). The lab hides the dev editor's floating panel and shows its words. Windows may ask to allow
  node through the firewall the first time another computer connects: the owner clicks Allow (never change firewall settings yourself).
  Open: `/__dev/save` still accepts a whole lot-presets.json from an old open tab; reload old tabs.
- Done today, after the first handover: lot size steppers (W/D) and the person cursor (an adult, base_man) in the lab; whole presets
  (fences, bins, decals all editable); decals select with a click.

## Exact next step
1. When `size-report.ts` is fixed: restart the studio, open Library, check House 1 north (`variation:world-house_1-north-*`) now allows
   about x3.3; tell the owner to size the houses, then run Rebuild (the studio's button; `STUDIO_DEV_GAME=1`, so no npm build).
2. (Done: merge saves, network.) Optionally make `/__dev/save` refuse lot-presets.json so only merges write it.

## How to check
- Typecheck: `npx tsc --noEmit -p .`. Lot tests: `npx esbuild tests/lot-presets-lab.test.ts tests/lot-presets-farm.test.ts tests/lot-presets.test.ts tests/lot-presets-json.test.ts tests/compose.test.ts tests/lot-edit.test.ts --bundle --platform=node --format=esm --loader:.webp=empty --loader:.png=empty --outdir=output/tests-check --out-extension:.js=.mjs --log-level=warning && node --test output/tests-check/*.mjs`.
- Browser: http://localhost:5241/?lotlab&dev (or the studio's Lots tab): Generate, select a piece, Delete, Approve; `lot-presets.json` changes.

## Background
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
7. Done: decals and props from a list, and delete for everything. Lab drafts are now **whole presets** (`whole: true`,
   `decals: [...]`): Generate captures everything the game draws (fences, bins, mailbox, hydrant, leaf and litter decals), and a
   whole preset draws alone, so every piece can be selected, moved and deleted. The DECALS list places decals; a click on any lot
   decal selects it (no mode). In the studio frame the Delete key now reaches the editor. Leaves outside the lot are the map's own
   grass decals, not the lot's. Lots made before this change are not whole: Generate again.
8. Done: this handover (this file).
9. **Open (needs art): the owner's rule "the house front door is perpendicular to the street. This is a standard for every single
   house."** On axis roads every preset house already faces its street (view 0). On 45-degree roads (odd road angles, which run
   screen-horizontal or screen-vertical) no house can: every house in the library is drawn in four views facing the map axes, which
   are diagonals on screen, and the FRONTAL set (`lots/frontal.ts`) is flat elevations, not usable. Needed: each house in four more
   views, its front facing screen down, right, up and left. Suggested ids `view:<base>:s`, `view:<base>:e`, `view:<base>:n`,
   `view:<base>:w` next to the existing `:se`/`:sw`/`:nw`; then `preset-art.ts turned` and the lab's R take eight views on a diagonal
   road. Until that art exists, the game keeps diagonal-road lots as greens unless the owner approves a preset there.

## Verified (browser, 2026-10-26)
- The lab stages a lot on an axis road and on a diagonal road; Generate, variants, Save draft, Approve all work; an approved
  road-7 preset was drawn by the game's own pick for unforced lots of nearby sizes on road 7, and road 5 stayed a green.
- The studio's Lots tab frames the lab; no town shows; the map round the lot is plain grass; tall props show whole.
- Typecheck clean; 85 lot and farm tests pass (`tests/lot-presets-lab.test.ts`, `tests/lot-presets-farm.test.ts`, the compose,
  preset, lot-edit, lettering, town-growth and farm tests). The full suite was not run (it runs nightly).
- Also checked: whole drafts (26 of 26 drawn props come from the preset, 18 decals), deleting sprites, trees and decals, Delete in
  the studio frame. **Not yet checked in the browser:** ground painting, the Farm type, Review drafts, the camera fit on a farm.

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
1. Request 9: the diagonal house views (art first: the owner's art chat or image pipeline; then the eight-view code path).
2. Before committing, drop any lab presets you made yourself while testing (the owner's have moved sprites, `curated: true`, and
   were made in their tab; when unsure, ask). `scratchpad`-style helper: parse with `parsePresets`, filter by id, write with
   `formatPresets`.
3. Check the open browser items above.
4. Ask the owner, then push the branch and open the PR against main; remove the launch.json entries after the merge.
