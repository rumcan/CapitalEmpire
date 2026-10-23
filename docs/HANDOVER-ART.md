# Handover: the art chat, 2026-10-21 night (the owner moves to a new chat on a new PC)

## Current entry point, 2026-10-23

For image generation, read [SPRITE-GENERATION-WORKFLOW.md](SPRITE-GENERATION-WORKFLOW.md) and the live [T017 handover](../art/theme-consistency/HANDOVER.md) first. The canonical guide includes concrete commands and prompts, the exact theme reference, screenshot/zoom calibration, scene-first derivation, four rotations, fixed dusk sunlight, no people/Halloween, budget versus wear, alpha checks, provenance and delivery to the implementing AI.

The owner requested a stop followed by integration of outstanding work into main. This checkpoint creates no new images; resume generation only when requested. The T015/T016/T017 art checkpoints, T018 ghost preview and outstanding shadow changes are included in this integration. Generated T017 sheets remain drafts subject to the live handover's review warnings. The remainder of this document is a **historical 2026-10-21 snapshot**: its unmerged-branch list, RUN provider details and immediate next actions are not the current generation queue or merge status.

Read this first, then `CLAUDE.md`, `docs/SECOND-AGENT.md` (who owns which files) and the end of `docs/PROGRESS.md`. This file says
exactly where the art chat stopped and what to do next, in order.

## 1. Where everything is
- **GitHub `main` is current** (pushed with this file). Everything below marked "on main" is in it.
- **One unmerged branch, pushed to GitHub: `claude/brush-round`** (3 commits on top of main; see 3.1).
- On the old dev PC: main lived in the worktree `.claude/worktrees/main-merge`, the owner's test game on **5174** (`vite preview` of
  main's `dist/`; rebuild with `npm run build` after every landing) and the sprite studio on **5179**
  (`node scripts/assets/review/server.mjs --port 5179`). On a new PC: clone, `npm install`, then `npm run build` + `npx vite preview
  --host 127.0.0.1 --port 5174 --strictPort` for the game, and the studio command above. The studio's Rebuild and `prep-sprites.mjs` need
  the TrickOrTreat repo beside this one (`../TrickOrTreat`, read-only) or `TOT_REPO` set to it.
- RUN image generation: the `rundot` CLI, signed in (`rundot login`); game id `AFjPSjQH9kbcCl57sgO3`. **RUN has a daily image cap**
  (hit after about 10 images on 2026-10-21).
- **The owner's standing rules:** land each verified step on main and rebuild 5174 so they can test it; push main to GitHub when a step is
  verified (fetch and merge origin/main first: the coder pushes from another PC); **never pre-pick options for the owner** (e.g. a short list
  of grasses): give them everything to choose from and the controls to tweak it; no lettering in generated art.
- **Disk:** the old PC ran out of space (each worktree is a full copy of the art, ~0.5 GB). Remove merged worktrees (unlink the
  `node_modules` junction first with `cmd /c rmdir <wt>\node_modules`, then `git worktree remove`). The ~25 old `claude/*` worktrees from
  earlier sessions are all merged; remove them when the owner agrees.

## 2. Done today (all on main)
- **Merged the old "Paranormal nights" work** (T014, an earlier session's uncommitted work in the main checkout): paranormal nights in the
  disasters, a disasters toggle in Settings (**on by default**: the owner has not decided), generated trees v2 in the lot tree pool, new base
  grasses. Details in PROGRESS "The art chat, 2026-10-21 night".
- **Houses face their street** on both street directions (browser-checked). **Straight-on buildings** kept off the lots: 8 more in
  `lots/frontal.ts`, found with `scripts/assets/frontal-scan.py` (run it again when new building art arrives).
- **Golf art pilot (A1):** `golf:grandstand-s`, `golf:leaderboard`, `golf:food-tent`, `golf:toilet-block` (the toilet block is a cleaned
  white-background take: regenerate it on magenta). Pipeline: `scripts/assets/gen-golf.mjs` (prompts and footprints in
  `art/golf/items.json`, generated on **flat magenta** and keyed by `key-magenta.mjs`: never RUN's background removal, it leaves a white halo),
  pick a take from `output/golf-gen/` into `art/golf/<id>.png`, then `node scripts/assets/prep-golf.mjs` (packs `src/assets/golf/` and
  `src/game/golf-library.ts`, honours the studio's size overrides). ART-PIPELINE.md "The golf sprites".
- **Golf hole preset:** Paint → Golf hole: one click lays a hole of painted areas (rough, fairway with a first-cut band, tee, green with a
  fringe band, bunkers with rough edges, a pond) plus the flag and ~150 trees, bushes and flowers (`golf/holepreset.ts`).
- **Golf brush:** Paint → Golf brush row (Fairway, Green, Tee, Rough, Bunker, Water, Cart path): a round iso brush, strokes per hole (1–18)
  join into one area per kind (`src/game/brush.ts` mask → outline), Rub out / Alt erases, presets editable and remembered. Paint areas carry
  optional `hole` / `kind` tags (save tuple elements 10, 11).
- **Studio Holes tab** (5179 → Holes): 18 preset hole slots saved to `src/game/golf/hole-presets.json`; Generate, edit areas (texture,
  border, corners, move, order), move / add / delete props, Save. The game does not read the file yet (see 3.5).
- **Dev base-grass picker** (gear menu → "Dev: base grass", `src/game/dev-grass.ts`): **the owner rejected it** ("I didn't tell you to force
  me to pick a certain grass"): replace it with the studio Ground tab (3.2) and then remove it.
- **Studio Rebuild fix:** `prep-sprites` only loads entries marked `local` from `art/*/items.json` (the golf prompts file broke it).
- **Plans written:** `docs/COURSE-BUILDER.md` (the Course tool, separate from Paint: hole strip, palette tabs, inspector, Game / Plan / Hole
  focus views, build order C1–C5); `docs/GOLF-SPRITES.md` "The owner's additions" (white tents, TV cameras, course odds and ends, first-tee
  sign, pro shops, tables with umbrellas, estate gates, plants, flag poles, cart bridges).

## 3. What to do next, in order
1. **DONE 2026-10-22 (see PROGRESS "The art chat, 2026-10-22").** Land `claude/brush-round` (tests pass: brush 11, paint 36, paint-brush 8, golf-holepreset 6, compose 16; tsc clean; NOT
   browser-checked): (a) rounder golf-brush outlines (resample 0.5 tile, 4 x 9-point smoothing, simplify 0.12; a radius-1 dab falls back to
   the resampled loop); (b) **the border band gets its own scale, angle and tone** (Darker / Lighter, strength, tint), like the fill (the
   owner asked for "as much as you can the normal texture"). **Fix first:** when the border angle `ba` is absent the renderer falls back to
   the fill's angle, so the panel's 0° can disagree with what is drawn: send `ba` (and `bs`) whenever any border field is non-default, or add
   an explicit "follow the fill" default. Then browser-check (paint a fairway, change its border scale / angle / tone), merge, build, push.
2. **DONE 2026-10-22.** Studio "Ground" tab: the base-grass tweaker (the owner, exactly: "pick from everything and tweak the tint and scale etc. … in the
   studio on a small patch of land with 4 houses and 4 streets"). Plan: move the game's grass mix (`textures.ts` `grass(gA, gB)`: two
   pictures hex-mixed in soft patches, an fbm mix mask at 0.38–0.62, a tone 0.9–1.1 and a warm drift ±0.08) into a module the studio can
   bundle (as `hole-lib.ts` does), driven by settings: per grass A / B the source (any image in `src/assets/ground/`, `ground/grass-v1/png/`,
   `art/grass-photo/`), scale, tint + strength, brightness, contrast, saturation, hue; the mix share and softness, the patch size, the tone
   and warm amounts. The tab previews it on a test patch (a block of 4 houses inside 4 streets with sidewalks; houses from the library).
   Save writes `src/game/base-grass.json` and encodes the two chosen pictures as `src/assets/ground/base-grass-a.webp` / `-b.webp`; the game
   reads them (through `ground-cache.ts`, where `withBaseGrass` sits today) instead of the dev picker; until the owner saves, the game keeps
   today's grass. Then delete the gear-menu picker.
3. **DONE 2026-10-22 (on main, browser-checked on the PC).** Plant brushes: Paint → Trees, Bushes, Flowers (size, spacing, smallest and largest
   size, a picture grid to pick the sprites; Rub out / Alt removes only planted props; free, no refund). In code the brush is
   `PaintTool.plantBrush` / `PlantBrushKind`: `plantKind` is the coder's seed / sod. Paint save tuple: 12–13 seed / sod and month, **14–18 the
   border's own style**.
4. **DONE 2026-10-22 (on main, browser-checked; COURSE-BUILDER.md section 6 says what was built).** **Course builder C1** (`docs/COURSE-BUILDER.md`): the Course rail tool; the Build tab (the golf brush moves out of Paint), the Presets tab
   (the Golf hole mode moves out of Paint), the hole strip, undo. Tell the coder (SECOND-AGENT.md log): these are the coder's files.
5. **The game's Golf hole mode reads `hole-presets.json`** (a 1–18 picker; an empty slot falls back to the generator); later "Save hole as
   preset N" in the game.
6. **Golf art:** the next batch is already written in `art/golf/items.json` (entrance gate, drinks tent, merchandise tent, concession kiosk,
   first aid tent, shuttle stop, hole scoreboard, picnic set, flagstick, bins, comfort station, ball washer + bench) plus the toilet block
   on magenta: `node scripts/assets/gen-golf.mjs --takes 1` (repeat after the daily cap resets; it skips takes that exist). On the old PC a
   retrying runner was generating them into `.claude/worktrees/golf-art/output/golf-gen/` (git-ignored: copy them over if wanted). Pick takes,
   pack, show in the studio, then the owner's additions list. Swap the hole preset's flag to `golf:flagstick` once it exists.
7. Then the art queue: A2 photo textures (forest floor, rock, meadow, pavers), A3 the studio's "used on lots" count and "never on lots"
   filter, A4 the 12 hidden TrickOrTreat buildings and the east-facing `world:video_rental`.

## 4. Start prompt for the new chat
"You are the art developer on Capital Empire (repo: CapitalEmpire), a golf events manager; you work with me (the owner) on the art and the
course-building tools, and a second agent writes the game code. Read docs/HANDOVER-ART.md first and follow its section 3 in order, then
CLAUDE.md, docs/SECOND-AGENT.md, the end of docs/PROGRESS.md, docs/ART-PIPELINE.md and docs/COURSE-BUILDER.md. Land each verified step on
main, rebuild my 5174 server and push main to GitHub (fetch and merge origin/main first). Give me every option and the controls to tweak
them; never pre-pick for me."

## 5. How the 2026-10-22 cloud session worked (if the next chat is also a cloud session linked to the PC)
- The PC folder is E:\AI\CapitalEmpire (main). The cloud container cannot reach npm or push to GitHub: it clones the repo, uses the
  preinstalled esbuild for `npm test`, TypeScript 6 against a baseline of vite-type errors, an esbuild + tailwind-standalone dev build
  browser-checked with Playwright, then moves commits to the PC as a git bundle (copied to `output/`, then `git fetch` + `git merge
  --ff-only` in the PC's shell). **Push main from the PC.** No git identity on the PC shell: commit in the cloud.
- The studio runs in the cloud with `TOT_REPO` pointing at a partial clone of TrickOrTreat (branch town/builder-in-repo fetched) plus a stub
  `output/town-builder/library/library.json`.
