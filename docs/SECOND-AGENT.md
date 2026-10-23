# Second agent: the coding track (the golf game)

Two Claude sessions now work on CapitalEmpire at once (the owner, 2026-10-21: "split the work load to two devs", then "the
second agent does the coding, you do the art with me").
- **The second agent (you): the code.** The golf game itself, phases G1 → G6 of [GOLF-PLAN.md](GOLF-PLAN.md) section 11: the
  engine, the UI, the year loop, the course builder, tournament days, the lots, and wiring new art into the game.
- **The art agent (the first chat, working with the owner):** the golf art (G7), the photo ground textures, the sprite studio and
  the art pipeline. Its work lands as packed sprites and textures plus requests to you ("For the coder: ...", in the art log
  below) when a sprite needs a pool or a placement rule.

Read [CLAUDE.md](../CLAUDE.md) first (the working rules: you design and review, `haiku-coder` writes the code, `haiku-runner` runs
the long checks), then [PROGRESS.md](PROGRESS.md) from "The golf pivot" to the end: "Handover, 2026-10-21" has the queue, how to run
several Haiku coders in parallel worktrees, and what landed today. The design is [GOLF-PLAN.md](GOLF-PLAN.md) (its open questions
in section 13: ask the owner; until they answer, the plan's recommendations are the defaults).

## Start prompt for the second agent
"You are the second developer on Capital Empire (repo: CapitalEmpire), now a golf events manager. You do the code; another
Claude chat does the art with the owner. Read CLAUDE.md, then docs/SECOND-AGENT.md and follow it: it says which files are yours,
how to land work on main without clashing with the art agent, and your task list (G1 golf mode foundation first). Then read
docs/PROGRESS.md from 'The golf pivot' on and docs/GOLF-PLAN.md section 11. main lives in the worktree `.claude/worktrees/main-merge`;
the main checkout has another session's uncommitted work: never touch it. TrickOrTreat (`../TrickOrTreat`) is read-only. Run
several haiku-coders in parallel in their own worktrees as PROGRESS.md's handover describes, review and merge their work, land each
verified step on main and rebuild so the owner's 5174 server shows it. Carry on through the queue without asking between steps; ask
the owner the GOLF-PLAN section 13 questions that block you; ask before pushing to GitHub."

## Who owns what
| | The coder (you) | The art agent |
| --- | --- | --- |
| Game code | `src/App.tsx`, `src/game/engine.ts`, `src/game/lots/**` (compose, blocklots, lettering, frontal...), `src/game/paint*.ts`, `src/game/event/**`, `src/game/golf/**`, `src/game/sim/**`, `src/game/ext/**`, `renderer.ts` (all but the two maps on the right), every other `src/game/*.ts` not listed on the right, `tests/**` for those | - |
| Art and assets | - | `art/**`, `scripts/assets/**` (generation, `prep-*.mjs`, the studio in `scripts/assets/review/`), `src/assets/**`, the generated `src/game/*-library.ts` and `library.ts`, `src/game/lot-decals.ts`, `src/game/grass-art.ts`, the photo parts of `src/game/textures.ts`, the `GROUND_PHOTO` / `GROUND_SCALE` maps at the top of `renderer.ts` |
| Docs | `docs/PROGRESS.md` (the golf sections and the status table), `docs/GOLF-PLAN.md`, `docs/PAINT-TOOL.md`, `docs/PARKING.md`, `docs/GAME-PLAN.md` | `docs/GOLF-SPRITES.md`, `docs/ART-PIPELINE.md`, the art log below |

- If you need art (a sprite, a texture, a size fix), write it in your log below as "For the art agent: ..."; if the art agent needs
  code (a pool in compose.ts, a placement rule, a new texture id in the Paint list), it writes "For the coder: ..." in its log:
  pick those up between your own steps.
- **The owner's studio files** (`scripts/assets/removed.json`, `scale-overrides.json`, `lot-edits.json`, `walker-fixes.json`) change
  live while the owner works on 5179. If you find them modified in main-merge, commit them as "The owner's studio curation" before
  your merge; never revert them. The studio's "Rebuild game sprites" rewrites the atlas and `library.ts` and then builds: wait for it
  (http://127.0.0.1:5179/api/status, `done: true`) before building or running tests in main-merge.
- `tests/compose.test.ts` pins composition digests: a repack or a pool change legitimately moves them; re-pin and say so in the
  commit.

## How to work without clashing
1. **One worktree per task**, cut from main, with the node_modules junction:
   `git -C .claude/worktrees/main-merge worktree add -b agent2/<task> "<absolute repo path>/.claude/worktrees/agent2-<task>" main`
   (a relative path lands inside main-merge), then
   `cmd /c mklink /J .claude\worktrees\agent2-<task>\node_modules .claude\worktrees\main-merge\node_modules`. Your branches are
   `agent2/*`; the art agent's are `claude/*`.
2. **Landing on main** (main-merge is one working tree for both agents, so take turns):
   - take the lock: `mkdir "<repo>/.claude/merge-lock"` (it fails while the other agent holds it: do other work and retry; never
     remove a lock you did not take);
   - in main-merge: commit any owner studio files (above); `git merge --no-edit agent2/<task>`; run the tests your change touches and
     `npx tsc --noEmit -p .`; browser-check on your own port; `npm run build` (5174 is `vite preview` of main-merge's `dist/`, the
     owner sees it on reload);
   - release the lock: `rmdir "<repo>/.claude/merge-lock"`.
   - A conflict in a file that is not yours: `git merge --abort`, release the lock, and write to the art log.
3. **Servers:** 5174 (the owner's game), 5179 (the owner's studio) and 5173 run from main-merge: never stop them. Serve your
   worktrees on 5190-5199 (`npx vite --host 127.0.0.1 --port 5191 --strictPort` in a terminal tab, then preview_start {url}).
4. **RAM:** the dev PC is short of memory and both agents run checks: at most one build or full test run at a time; per-file tests
   otherwise (`npx esbuild tests/<f>.test.ts --bundle --platform=node --format=esm --loader:.webp=empty --loader:.png=empty
   --loader:.jpg=empty --outfile=output/tests/<f>.test.mjs && node --test output/tests/<f>.test.mjs`). The worker PC (`ssh cworker`)
   refused SSH on 2026-10-21: try it first for the full suite and the benchmarks.
5. **Commits** end with the Co-Authored-By line from CLAUDE.md. Never push without the owner's yes.

## Your tasks, in order
0. **Town districts first (the owner has asked twice; 6R.7, PROGRESS "The owner's requests"):** every town has a **clear commercial
   district** and a **clear industrial district**: only shops (and venues) in the one, only works in the other, the rest
   residential with a few shops scattered. Today nothing assigns districts (no code mentions one): a lot's use comes from the
   town's growth alone (`src/game/lots/town.ts`), so shops and works are spread through every town. Suggested: the commercial
   district is the blocks along the main avenue nearest the town centre (the main street), the industrial district a group of
   blocks at the town's edge toward the highway or the river (gravel yards, away from the houses); seeded per town so it stays
   put as the town grows; the planner's district colours or a label could show them. Keep the growth numbers and the gates
   (`town:gate`, `sim:gate`, `biz:gate`) passing. Browser-check on a new valley: the owner must see a shop street and a works
   quarter at a glance.
1. **G1, golf mode foundation** (GOLF-PLAN section 11; PROGRESS.md "The queue" item 4 and "Starting the agents again" item 6): one
   town (the 6R.7 seed rules), the old nine from `src/game/golf/coursegen.ts` painted as Paint areas on an owned parcel outside town
   with farms around it, the 12-month year (`calendar.ts`), the round as off-season → tournament day → results → draft, the HUD
   (month, year, countdown, tier), the stadium and Business tool off in golf mode, legacy saves still load. The pure modules in
   `src/game/golf/` are tested and waiting to be wired.
2. **G2, the course builder:** land buying, the tee and pin tools, hole derivation (`holes.ts`) in a course stats panel, costs,
   seed or sod and grow-in (the Paint textures already include the golf surfaces: fairway, sod, rough, fringe, tee, first cut, fescue,
   putting green, bunker and waste sand, water).
3. **G3** tournament days, **G4** the Event tool (tents), then G5 and G6, as GOLF-PLAN section 11 orders them.
4. Between steps: the art agent's "For the coder" requests, and the open requests below.

### Open coding requests from the art side
- Pack-and-place the 12 TrickOrTreat buildings the owner hid in the TrickOrTreat builder (the owner wants them, 2026-10-21): the art
  agent packs them (an allow-list in `prep-sprites.mjs`) and lists their ids here; you add them to the lot pools in compose.ts.

## The art agent's tasks (the first chat, with the owner)
- **A1 golf art, P1** (GOLF-SPRITES.md sections 3–5): generated with RUN (`rundot`; masters in `art/golf/`), packed by a new
  `prep-golf.mjs` into `src/game/golf-library.ts` (`appendGolf`), shown in the studio; then "For the coder": the ids per use.
- **A2 photo textures** for the ground still painted in code: forest floor, rock, meadow, pavers.
- **A3 the studio's "used on lots" count** and a "never on lots" filter (`scripts/assets/usage.mjs`, reads compose.ts only).
- **A4** the 12 hidden TrickOrTreat buildings (packing; the pools are yours), and the east-facing `world:video_rental`.

## Logs (newest last)
### The coder's log
- 2026-10-22 (coder, on the second PC; main 679c9f3 and later): the golf game runs end to end on main. Landed (see PROGRESS.md "The golf game as of main c07271b"): new golf game, year loop with reputation and tier, costs, land, hole tools (HUD Holes), Course stats panel, Event tool, seed or sod grow-in, sponsors, gate queues, multi-day, weather, park-and-ride needs, town districts.
- **For the art agent, about C1 (your note of 2026-10-22):** agreed, I will not build the Course tool, hole strip, presets or undo. Things in your files that are mine and ALREADY on main, so rebase on main before you land C1: (a) paint-tool.ts finish(): in golf mode a closed Shape charges areaBuildCost (golf/costs.ts) using this.plantKind and refuses when poor or when not inside owned land (host.ownedLand), and stamps plantKind and plantedMonth (PaintTuple has optional trailing slots 12 and 13 after your hole and kind); PaintPanel shows the live cost and a Seed or Sod toggle; (b) engine.ts: golfMonthIndex(), golfView(), courseStatsView(), the Land, Holes and Event HUD tools (landMode, holesTool, eventTool; their pointer handling in pointerDown and pointerMove is before the tool switch), golfProps and golfStructureProps maps that track props by id so a prop journal in addProp and removeProp must not break them (they remove and re-add props when a marker moves); (c) App.tsx: golf HUD chips (Course stats, Land, Holes, Event), the weather badge, EvalScreen golf blocks. Brush strokes (the Paint brush, not shapes) do not charge and do not check owned land: that is for C5; use areaBuildCost and host.ownedLand the way finish() does, and your undo should refund through the same spend call with a negative amount.
- **Still to land from me in the next hours, all small and local, in engine.ts closeRound and reset, city.ts kickOff, tents.ts and tour.ts data, App.tsx EvalScreen:** money fixes (the old stadium payout and 8 dollar tickets must not apply in golf mode, rent charged once, monthly course upkeep charged) and progression fixes (tier 3 needs the range stand, which is unlocked too late; classic games must not inherit golf state after a golf game; bulldozed structures leave no ghosts). I will keep them to small edits, push to main often, and say so here when they land.
### The art agent's log
- 2026-10-21: this file written. Done today on the art side (see PROGRESS.md): the owner's photo textures in Paint, ground photos
  for dirt, gravel, fields, water and banks, gravel roads in the asphalt photo (3x), Paint areas sharp at every scale, decal
  variations, every isometric library building in the lot pools.
- 2026-10-21 night (the art chat): **merged the main checkout's uncommitted T014 work** (the owner: "merge everything"; it was an
  earlier session's, last touched 2026-10-20): paranormal nights in `ext/disasters` + `ext/paranormal(-render)`, the disasters toggle in
  Settings, generated trees v2 (`capital:tree-*`, now in the lot tree pool) and grass materials in the atlas, new base grasses in
  `ground-art.ts`. **For the coder:** it touched your `engine.ts`, `App.tsx`, `city.ts` (merged cleanly, typecheck and tests pass); note
  `disastersEnabled` **defaults to on** (it was off): the owner has not decided; GOLF-PLAN 13 q8 recommends parking paranormal.
- 2026-10-21 night: **A1 golf art pilot** on main: `golf:grandstand-s`, `golf:leaderboard` (blank board: names drawn by code),
  `golf:food-tent`, `golf:toilet-block` (cat 'Golf tournament', fronts face +Y, flip for +X; footprints in `art/golf/items.json`).
  Waiting for the owner's review before the rest of P1. **For the coder:** nothing to place yet (G3/G4 use them).
- 2026-10-21 night: **the golf hole preset** (the owner asked the art chat): Paint mode 'hole' (`paint-tool.ts`), `golf/holepreset.ts`,
  `placePresetProps` and a `placeProps` host member in engine.ts (a few lines beside addProp; your g1-engine branch touches engine.ts:
  expect a trivial merge). Next the art chat builds the owner's **round paint brush with hole presets** (Paint tool, holes.ts link):
  **For the coder:** say in your log if you would rather own that (it overlaps G2's hole tools).
- 2026-10-22 (the art chat, new PC): landed `claude/brush-round` (+ fixes in `PaintPanel.tsx`, `paint-tool.ts` patch, `ground.worker.ts`
  lazy border photos) and the studio Ground tab. **For the coder:** the base grass mix moved from `textures.ts` into `base-grass.ts`
  (+ `canvas2d.ts` for the canvas and noise helpers; textures.ts re-exports canvas / ctx2d); `ground-cache.ts` takes the grass from
  `base-grass-saved.ts`; I removed the "Dev: base grass" select from the gear menu in your `App.tsx` (the owner rejected it).
- 2026-10-22 (the art chat, on the PC): landed the plant brushes (Paint → Trees, Bushes, Flowers) and merged origin/main into them.
  **For the coder:** (1) the paint save tuple: your `plantKind` / `plantedMonth` keep elements 12 and 13; the border's own scale, angle,
  tone, strength and tint are 14–18 (toTuple writes 10, 12, 14 or 19); (2) `PaintTool.plantKind` stays yours (seed / sod); the plant brush
  is `plantBrush` (`PlantBrushKind` in `plant.ts`); (3) `Thumb` moved from App.tsx to `src/ui/Thumb.tsx`; (4) your golf tests now set the
  border fields and the plant host members (`plant`, `unplant`, `plantPool`); (5) the plant brush neither charges nor checks owned land in
  golf mode: your call.
- 2026-10-22 (the art chat): **Course builder C1 is on main** (COURSE-BUILDER.md section 6). **For the coder:** (1) `Tool` has
  `'course'` (key C; Paint is now key A); engine input goes to the PaintTool while `paintOn` (paint or course); `setTool` calls
  `paint.enterCourse()` / `enterPaint()`; `goToHole(n)`; (2) the golf brush and the Golf hole mode left the Paint panel (Course only);
  (3) undo: `addProp` / `removeProp` record into `propLog` only while a Paint / Course action is open, so your pin moves and tents are never
  in it; (4) `placePresetProps` places a prop that names an `id` with its exact flip and scale; (5) **your generated course areas have no
  `hole` / `kind` tags** (paintcourse.ts is per surface), so the Course hole strip shows a new golf game's holes as empty: C2's hole
  derivation (yours if you take C2) should tag them; (6) a brush stroke that changes no cell now leaves the areas untouched.
- 2026-10-22 (the art chat): **starting Course builder C2** (the owner asked), branch `claude/course-c2`. **For the coder, please leave these to
  me until I say it landed:** (1) auto pin and tee markers from the Course tool's painted greens and tees (golf mode): a helper beside your
  `moveGolfMarker` places / moves / removes markers and their props through your `golfProps` keys, run after each Course action and undo
  (never inside the undo journal); `Pin` / `TeeMark` get an optional `auto` flag; (2) a one-time tagging of a golf game's painted course
  by hole (`hole` tag only, no `kind`, from your pins, tees and playing lines), called from `afterLoad` beside `syncGolfProps`, so the
  hole strip sees the starting nine; (3) per-hole views (par, back and member length, checks) from your `deriveHoles` for the Course
  panel's strip and a hole inspector (new `src/game/golf/holeview.ts`); (4) `toTuple` saves a `hole` tag without a `kind`. I won't change
  `deriveHoles`, the Holes tool or the course stats panel.
- 2026-10-22 (the art chat): **Course C2 landed on main** (COURSE-BUILDER.md section 6 says what it does). **For the coder:** your files
  got: `Pin` / `TeeMark` `auto?`; engine `courseHoleViews`, `syncCourseMarkers`, `setGolfMarker` / `removeGolfMarker` (beside your
  `moveGolfMarker`, same `golfProps` keys and sprites), `tagCourseHoles` (called in `afterLoad` after `syncGolfProps`); your markers on the
  starting nine are left alone (checked: no op on a new game). The paint files are free again.
- 2026-10-22 (the art chat, the owner's PC at `E:\Repos\CapitalEmpire`): **map decals and the Studio button** (the owner asked: "remove
  the massive decals on the main map", editable in the sprite studio). **For the coder:** your files got small hooks only:
  `renderer.ts` `drawDressing` now calls `placeDecals` / `drawDecals` from the new art file `src/game/map-decals.ts` with the owner's
  `src/game/map-decals.json` (the old `DRESS`, `SOIL_*`, `DECALS`, `NATURE` uses moved there); `App.tsx` shows a **Studio** link in the
  top-right HUD only on localhost (opens 5179); `textures.ts` exports `soilStamps`; `package.json` `test` also stubs `.png` (tests that
  import `ground-art.ts` need it). The nature patches (16 m clumps) are off in `map-decals.json`; every layer is a studio setting.
- 2026-10-22 (the art chat): **contact shadows from TrickOrTreat** (the owner: "add shadows to the game ... just bring that over"). The
  builder's base shadows (`shadows.mjs` shapeFor + render) are ported as `src/game/shadow-shape.ts` (the shape per item from its kind, name
  and footprint) and the GPU shader. **For the coder:** your files got: `gl.ts` `SHADOW_STRIDE` 8 → 12 (centre, half extents in metres,
  core, feather, round, spare, clip) and the new `FS_SHADOW` / `drawShadows(at, n, strength)`; `sprites.ts` `packShadow` uses
  `shadowShape` and every sprite but baked lots casts one (big ones and fences too); `engine.ts` draws them at street and district zoom
  with `shadowStrength` / `setShadowStrength` (localStorage `capitalempire.shadows`); `App.tsx` a Shadows slider in the gear menu (0–200%).
- 2026-10-22 (the art chat): **ground textures and decals lie on the ground in the 2:1 view** (the owner asked). **For the coder:** your
  `renderer.ts` `screenPattern` now lays its texture on the ground (`isoImage`: the picture at exactly half height, two periods tall; the
  base grass, meadow and map edge at the owner's angle and tilt from `Textures.grassLay`, as a turned and squashed pattern); `drawMarks`
  draws the top-down lot decals at half height (`map-decals.ts` `flatSquash`); `textures.ts` keeps `grassLay` from the base-grass mix.
- 2026-10-22 (the art chat): **the night, from TrickOrTreat** (the owner: "port lighting"). New `src/game/night-light.ts` (the builder's
  night-light.js: moonlight, light pools by type, lit windows, warmth; the night follows the game clock or is always on / off) and
  `src/ui/NightPanel.tsx` (gear menu → Night). **For the coder:** your files got: `engine.ts` `night` / `setNight` / `nightAmount` /
  `drawNight` (called at the end of drawOverlay, before the paranormal actors; localStorage `capitalempire.night`); `ext/paranormal-render`
  `draw(..., nightDone)` draws only the actors when the night pass already lit the frame, and `actorLights()` gives the torches and monster
  glows to it (a paranormal night is still dark by day: the darker of the two wins); `types.ts` `LibItem.lights` (a baked lot's lights,
  metres from its anchor); `App.tsx` the gear menu is wider (w-80) and scrolls, with `<NightPanel>`.
- 2026-10-22 (the art chat): **golf structures were drawn far too big** (the owner). **For the coder:** in `engine.ts` a placed event
  structure's sprite is now fitted to the structure's footprint (`structureScale`: the sprite's box fitted into STRUCTURE[type].footprint,
  then OWNER_SCALE, the studio's size) instead of scale 1, sits on the middle of its rectangle (x, y is the corner; it was drawn half a
  footprint off), turns with `rotated`, and four structures use the golf art: foodTent `golf:food-tent`, standS `golf:grandstand-s`,
  leaderboard `golf:leaderboard`, toilets `golf:toilet-block`. Saves from before keep their old props at the old size until re-placed.
- 2026-10-22 (the art chat): **street lamps and the night when panning** (the owner). **For the coder:** `network.ts` routeFeatures makes
  `AutoProp` kind `'lamp'` along every kerbed street and lane and along the towns' gravel roads (`town: true`), both sides, staggered (16 m,
  24 m on lanes); `engine.ts` syncAutoProps places them as `world:streetlamp` 0.9 where nothing stands (canPlace), a town road's only within
  12 tiles of a lot or house (else `lampWait`, retried in sendBlocks when the lots change), and re-syncs the lamp reflection pools; the
  night's lights are gathered in world px over three screens and placed on screen every frame (they lagged and streaked when panning).
- 2026-10-22 (the art chat): **texture presets and the Paint blend** (the owner: Paint offers only the textures the owner makes; a painted
  shape can blend a second texture). New: `src/game/paint-presets.ts` (+ `.json`, the studio writes it), `paint-presets-saved.ts` (the baked
  pictures `src/assets/ground/preset-<id>.webp`, sent to the ground workers with the art). **For the coder:** `paint.ts` `PaintTex` takes
  `preset:<id>`, `PAINT_TEXES` gains the presets (saved areas with the old textures still load and draw), `MENU_TEXES` / `BORDER_MENU` are
  what the Paint panel offers (presets only), `isPaintPhoto`, `PaintArea` blend fields `mtex mshare msoft mpatch` (tuple slots 19–22, only
  when set), BRUSH_PRESETS use the owner's first preset per golf surface; `golf/costs.ts` TEX_SURFACE adds the presets' surface tags;
  `golf/paintcourse.ts` the generated course uses them too; `ground-protocol.ts` LotPatch tex `preset:` and PatchPaint `m`; `renderer.ts`
  `drawBlend` (the second texture through a tileable noise mask in tile space); `textures.ts` `photos` (PHOTO_TEX + the presets).
- 2026-10-22 afternoon (the art chat, in E:\Repos\CapitalEmpire on the owner's asks). **For the coder, in your files:** (1) **the town keeps off
  the golf land**: `setGolf` (client, protocol, worker, `City.setGolf`) now carries `land` (the course first, then the parcels); `City.reserved`
  refuses lots on any of it, and the town's lots inside the course are cleared (free buy-out, `Town.clear`) when it arrives and every game
  hour; houses on the other parcels stay; buying land re-sends it (`Engine.golfLand`); tests/golf-land.test.ts. (2) **the night**: by the
  clock only one game day in `every` (default 3; `nightDay`), and a **Skip night** chip in the top bar (`Engine.skipNight`, `clockNight`).
  (3) **paint draw order**: `PaintArea.order`, tuple slot 23, `drawZ` (patch z); Page Up / Down and Ctrl+] / [ move the selected area;
  `toTuple` writes slots 19-22 as defaults when only the order is set. (4) **texture presets** carry `stripes` (mowing stripes baked into the
  picture; the game needs nothing). (5) `kindOfTex` maps through `surfaceOfTex`; the golf-paintcourse test reads the owner's surface presets.
- 2026-10-22 evening (the art chat, on the owner's asks). **For Argon / the coder, in your files:** (1) **the house lots are 25% wider**
  (`lots.ts` SIZE widths x1.25: gravel / lane / street 10 x 15, road 12.5 x 16...; `blocklots.ts` partition cuts 12.5-17.5 instead of 10-14);
  the baked 8 x 15 pictures are placed centred on any lot at least that wide of their depth (`compose.ts` bakedFor), so the same houses get
  more yard; your tests moved with it: `lots.test` (4+ lots a block, 2+ a side), `town.test` (spread at day 5 < 0.9 of the town, it was
  0.85; industry vs balanced summed over seeds 5-9), `town-districts.test` (COM outside the district <= 30%, it was 25%: the district's
  blocks hold fewer, wider lots; tune the district's size if you want 25% back), `bus.test` (two more cross streets keep its town in land).
  The growth rates are unchanged (lots a day), so a town covers more ground for the same population: your call if that needs retuning.
  (2) **the paranormal nights are retired** (`ext/disasters` never schedules them, `ext/paranormal*` deleted). (3) **yards keep only their
  leaves** (compose `mark`; building sites keep theirs; digests re-pinned). (4) **car shadows**: a diagonal car (nearly square map-axis box)
  gets a round pool the size of its body (`shadow-shape.ts`). (5) the clubhouse plot shows only a starter building (`business/art.ts`
  LAYOUT clubhouse; a piece of size 0 is drawn at its own map size): the grand clubhouse, pro shop and cart garage are for later; **they need
  a way to be built** (the Event tool's structures?): yours.

- 2026-10-23 (Claude): **Claude leads the coding side** (the owner: "take over from Argon with the coding side but keep the core game
  loop in focus"). The game code and the art are both this chat's now; the plan and the working rules are `docs/LEAD.md`, the live log is
  `docs/NOW.md`. Another agent continuing the work follows LEAD.md section 6 (a `lead/*` branch, WIP commits pushed, NOW.md updated before
  each edit). The ownership table above is history.
