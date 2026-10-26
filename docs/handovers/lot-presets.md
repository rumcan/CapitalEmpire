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
- **Done (2026-10-26, T155 #333 PR 1): a roomier lab, house allocations, lawns by state** (the owner: "make the lot building UIX area better ...
  move some of that stuff out of the side drawer"; "Each house needs an allocation that says it will only work on which road angles and if its a
  build. upgraded or decrepit house"; "green grass for upgraded house lawns, fairway for the built ones and rough for the decrepit ones").
  - The screen (`src/game/dev/lot-lab-ui.ts`): the left drawer holds only the lot choice (type, state, size + W/D, road compass, New lot's
    locks); a toolbar over the map (◀ Variant, Generate ▶, New lot ▶, the draft chip, Save draft, Approve, Approve & next gap, Discard, Undo,
    Lot grid, Neighbours, Person, ?); a status line under it; a floating selection bar beside the selection (count, Turn, Change house,
    Smaller, Bigger, Copy, Paste, Duplicate, Delete: the editor's `editorSel()` gives the items and their screen box); the bottom palette strip
    (`lot-lab-palette.ts`: search, group chips All / Plants / Props / Buildings / Vehicles / Decals / Ground, category chips, large thumbnails
    scrolling sideways; data-driven from LIBRARY, so new art appears by itself); the right inspector (the selection: picture, id, size,
    footprint, a house's allocation; the lot: preset id, source, Next gap, Review drafts, Change house, Paste, the lot's house allocation, the
    presets here, the coverage); "?" the keys overlay. Every panel folds (its edge button; a rail opens it); sizes follow the window (roomy from
    1600 x 950, compact at 1366 x 768); the folds are kept in `ce-lotlab`. The studio's Lots tab frame fills the view (its "open in its own tab"
    link moved to the header).
  - House allocations: `src/game/lots/house-alloc.ts` (pure), data `src/game/lots/house-allocations.json` (`{ v, houses: { <base id>: { roads,
    states } } }`; a house not listed suits everything), saved per house through `POST /__dev/allocations` (vite.config.ts, `mergeAllocations`,
    one request at a time; `GET` reads it back), held in the lab by `src/game/dev/house-alloc-store.ts` (hot reload). Generate (`otherHouse`), New
    lot and the variants (`allowedHouse`) and Change house (`nextHouse(..., ok)` through `setHouseFilter`) deal only houses that suit the lot's
    road and state; the inspector's compass toggles them and says how many of the pool and family suit (`suitCounts`).
  - Lawns by state: `painted-surfaces.ts STATE_LAWN` / `lawnTexFor`; surfaces `lawnBuilt` (fairway), `lawnUpgraded` (putting-green),
    `lawnDeclined` (sage-long, as rough on main, until the long-grass tiles are repaired and handed off) in `painted-surfaces.json`, tunable in
    Studio › Painted; `lotLawn(key, g, ids, state)`; the engine's `placeLot` passes `stateOf(level, decline)`, so every game lot uses them.
  - Tests `tests/house-alloc.test.ts`, `tests/lawns-by-state.test.ts`, `tests/lot-lab-palette.test.ts`; screenshots in `E:/ClaudeTemp/T155/`.
  - Next (PR 2): auto-sized lots from a master on the largest size of a (type, state, road angle).
- **Done (2026-10-26, T148 #309): multi-select, copy/paste, Change house, Lot grid, Generate in place, Neighbours** (the owner: "add multiple
  select and move/delete ... cntr c for copy and v for paste ... a shortcut button to change the house ... a grid that shows you where the Lot
  boundries are"; "click generate it should stay on that lot"; "a on and off toggle where you unhide or hide houses around the lot").
  - The selection lives in the editor (`lot-editor.ts`: `group` = one lot's preset props and decals by index; the pure edits in
    `src/game/dev/lot-select.ts`). Shift+click adds or removes a sprite or decal; a drag on empty ground draws a box (in the lab a plain drag:
    `editorOnly('lab')`; elsewhere Shift+drag); Esc clears. Drag any selected item or the arrows move the whole selection (the lot edge stops
    it as one); Delete, R (a decal mirrors), [ ], Ctrl+D apply to each item; one undo step per group edit (the selection comes back with it).
    Decals are selected by the editor now (the lab's old "Select decals" mode is gone; placing decals from the DECALS list stays in the lab).
  - Ctrl+C copies the selection relative to its middle (sizes, views, decal mirrors); Ctrl+V pastes it with its middle at the pointer's last
    point on the lot, on this lot or the next one opened (the clip is kept in sessionStorage `ce-lotlab-clip`), shifted in as one; the paste
    stays selected.
  - Change house (H, Shift+H back, the button next to Turn; Shift+click on the button goes back): the selected building, or with nothing
    selected the lot's main building, for the next of its pool (`src/game/dev/lot-houses.ts`): its `newart.ts standInFamily` family, drawn as
    itself, base views, front views only (no `-north-`, house backs, `*-rear`), in its size class (the family's owner-size footprint areas in
    three: small, medium, large), in area order; never the same one; the street-side edge and the centre along the street kept, the view
    kept, the scale never past the new picture's limit.
  - Lot grid (L): `src/game/dev/lot-grid.ts`, a WebGL2 pass through the new `Game.devGround` hook (after the map grid, under shadows and
    sprites): the lab lot's boundary and 1-tile cells, the neighbours' boundaries.
  - Generate (▶) keeps the lot (type, state, size incl. the steppers' size, road angle) and rolls another variant, a new seed and a new building
    of the same size class (`lot-lab-plan.ts planInPlace`); New lot ▶ is the old random Generate with the locks (`planNewLot`).
  - Neighbours (N): `Game.stageLabNeighbours`, lots `lab-n0..6` (two each way along the street, three across: `neighbourLots`), of the lab's
    type (a car park or tour shop among shops, a civic lot among houses) and state, composed as the game would (approved presets of the road,
    else frozen); never selectable (`editorOnly`); none for a farm. The lab street is 90 tiles each way now. L and N are kept in `ce-lotlab`.
  - Tests `tests/lot-lab-select.test.ts`; screenshots in `E:/ClaudeTemp/T148/`.
- **Done (2026-10-26, after the account switch): the Library's sizes reach every pack, and stand-ins are packed for the buildings drawn as
  them (the owner: "these houses are still locked at a maximum size ... make it so I can make the building in the library the right size").**
  Root cause: the studio's Rebuild never ran `prep-views.mjs`, so a size set on a four-view building (most houses) was never packed: the card
  stayed "pixelates above x1.02" for ever (92 sprites were drawn past their sharp size before; 0 after). Now `server.mjs rebuild()` runs, in
  order: prep-decals, nature-patches, prep-sprites, prep-cars, prep-business-art, prep-construction, prep-views, prep-scales, audit-sprites
  (the packs before the scale table, which reads what they write; the audit last). Stand-ins: `newart.ts standInCandidates / standInNeeds`
  give the size each four-view building must be packed at for the old buildings drawn as it (max over them of S_b x span(b) / span(s));
  `prep-views.mjs` runs that through `scripts/assets/stand-in-needs.ts` (esbuild, a child process) and packs each subject at
  max(own size, that need), capped at 3x its pixels, and logs "Packed past their own size as stand-ins"; `size-report.ts` gives a swapped
  building `native` = the smallest of its candidates' own pixels as a scale of it (so its card says what a Rebuild can reach), and the studio's
  soft warning applies to stand-ins too. Test `tests/standin-needs.test.ts`. A full Rebuild (the studio's steps, run directly) took 714 s:
  prep-sprites 584 s, prep-views 97 s, the rest under 20 s each. prep-views, run with no folders as the studio runs it, synced 20 sheets from
  the main checkout's `art/theme-consistency/generated/buildings` (10 new subjects: the church 44e76535, the freight depot, the drive-in screen,
  the farm shed, the grocery 79498713, the large house 20cb9f9e, the l-ranch 2edc5f59, the backyard tent, the treehouse north, the garden shed
  ac94c81e; 10 newer versions: estate villa v4, fishing lodge v5, treehouse v2, back patio pool v2, duplex v2, l-shape v1, bus stop v2, post
  office v2, barn v2 x2), so 9 fewer buildings are stand-ins (33 of them now, 19 distinct stand-ins) and the views atlas is 37 pages (was 25;
  the game streams pages within its fixed budget, atlas-pages.ts). `tests/newart.test.ts` (> 50 swapped, was > 100) and
  `tests/standin-labels.test.ts` (the church is drawn as itself now) follow the art. Checked in the studio on 5193 (shots in
  `E:/ClaudeTemp/lotmerge/`): 51fa4b80 x1.46 sharp 1.57, 1dde6f56 x1.99 sharp 2.04 (Bigger accepted: x2.14, warns until the next Rebuild),
  2521eca8 x1.77 drawn as the duplex c39d1a23 at exactly its size, sharp 2.29; trees, houses and landmarks cards match their names. Still
  past its sharp size: `golf:clubhouse-shanty` only (its stand-in `business:golf-clubhouse` needs x4.25, capped at x4.04 = 3x its pixels:
  higher-res art). Pre-existing, not mine: `tests/lot-presets-json.test.ts` "every prop id is a library id" fails because the owner removed
  `variation:gen-house-l-shape-e0e3b328-plain:1` in the studio (removed.json) while 9 lot presets still place it. Not pushed.
- (Superseded by the entry above.) **At the account switch (2026-10-26):** (1) A coder was changing `scripts/assets/prep-sprites.mjs` (and `size-report.ts`) so each
  four-view stand-in is packed for the largest size any old building drawn as it needs (the owner: "resized and rebuilt this house but it
  is not getting any bigger": `variation:world-house_0-north-1dde6f56-plain:1` at x1.99 is drawn as a stand-in, `newart.ts` SWAP /
  `standIn`, and prep-sprites packed the stand-in only for its own owner scale). It may be unfinished: check `git diff` on those two
  files, finish or redo it (need_s = max(own scale, max over swapped buildings of S_b * span(b) / span(s)), capped at 3x source), then
  Rebuild. (2) A studio Rebuild was running (`GET http://127.0.0.1:5242/api/status` shows it; never POST /api/rebuild to poll, a POST
  after it finishes starts another). After it: check the Library pictures match (an earlier mid-edit Rebuild scrambled them; the fix
  was restoring `src/assets/atlas`, `library.ts`, `sizes.ts`, `lots/scales.ts`, `lots/studio-base.ts` from git and clearing
  `output/review/thumbs`). (3) About 108 Library cards have no visible picture in their atlas rect (e.g. `world:trashcan`): not
  investigated. (4) `prep-cars.mjs`, `prep-views.mjs`, `prep-business-art.mjs` are not in the studio's Rebuild steps: run them by hand
  when cars, four-view buildings or business art need repacking. The branch's last push was 51643a7: push the newer commits.
- **Done (2026-10-26): cars resizable and business art re-packed (the owner: "repack and also do cars ... every single prop and decal
  should be resizable so it has a standard size for placement").** Cars: one studio size per model (`ext/car-art carOwnerScale`), applied
  parked, placed and on the roads (traffic, sim client, range host), footprints follow; the studio's car cards have Smaller/Bigger; the
  dev editor resizes cars; tests `tests/cars-size.test.ts`. Car pictures stop being sharp past about x1.15 (their art); `size-report.ts`
  gives cars no per-model native yet. Decals already had Smaller/Bigger (cat 'Decals'); `prep-decals.mjs` bakes their sizes at Rebuild.
  Business art (`prep-business-art.mjs`): packed from the masters at the owner's sizes, never shrinking; the 19 ids drawn from four-view
  art (views-library REPLACE: stadium, diner, sportsbar, motel, hotel, golf-clubhouse ...) are held, since their limit is the four-view
  art (about 590 px a view: the stadium's x0.64 is real); growing them needs higher-res four-view art (an art job). The max/max@2x exports
  are upscaled crops, not more detail. Atlas unchanged: 3 business pages, 63.9 MiB RGBA8 of 96 MiB.
- **Sprites still refuse to grow (the owner, with a studio screenshot: "cant resize the images ... this issue is on all the images"; the
  stadium: "pixelates above x0.64: its picture has no more pixels").** Not fixed yet; the owner has NOT finished sizing, so do not run
  Rebuild until they say so. Found: business artwork goes through its own pack, `scripts/assets/prep-business-art.mjs`, which shrinks
  every business picture to at most 512 px on its longest side (the stadium at its master's 1533 px) from the masters in
  `src/assets/businesses/capital-v1` (39 of 45 masters are bigger than 512, but only a little: sportsbar 663, diner 602, buscompany 701).
  Far bigger renders of the same buildings exist: `art/theme-consistency/exports/buildings/business-*.max@2x.png` (stadium 4056 x 2696)
  and the four views in `art/building-views/business-*`. Plan: (1) in the studio, list which cards refuse below their best source's
  pixels, family by family (houses from TrickOrTreat, business art, building views, Capital art), to confirm what "all the images" means;
  check `/api/scale` does not refuse from a stale cached report (`server.mjs` `sizeReport(false)`); (2) re-pack business art from the
  largest source (the `max@2x` export when there is one, else the master) at what each owner scale needs (`0.6 * ownerScale * 1.05 *`
  display width, as prep-sprites does), and make `size-report.ts` read that source's width as `native` for business sprites; (3) check the
  atlas page count and memory against GAME-PLAN section 2.3; (4) then the owner sizes, then Rebuild.
- **Authored lots keep every prop:** a whole or farm preset draws every prop where the owner put it, overlapping or not (`Build.keepAll`):
  before, a house moved onto a tree vanished (left out for overlap).
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
0. The owner sizes in the studio Library and presses Rebuild game sprites (about 12 minutes; every pack now, prep-views included), then checks
   the buildings and cars in the lab with the Person cursor. Higher-res four-view art for the 19 swapped businesses and the starter clubhouse's
   stand-in is an art job for the owner. Ask the owner about `variation:gen-house-l-shape-e0e3b328-plain:1` (removed, still in 9 presets).
1. The owner sizes the houses in the studio Library, then Rebuild game sprites (the studio's button; `STUDIO_DEV_GAME=1`, so no npm
   build). Check a rebuilt house in the lab at its new size with the person cursor.
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
- The branch is on origin (pushed at 51643a7 by the handover session with the owner's approval); later commits push fast-forward.
  **No PR yet**: ask the owner before opening it.
- Git on this machine needs `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0=*` in the environment.
- Commit messages end with the session's `Co-Authored-By:` line (Claude Fable 5.1 on 2026-10-26, Claude Opus 5.5 before).

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
