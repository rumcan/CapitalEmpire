# Farm animals through ChatGPT (T309, issue #894)

The owner, 2026-11-08: "farm animals must go to the chatgpt AI to generate the animations." So the clips of the cows, horses and sheep (graze, look-up, walk) are
made in ChatGPT's GIF generator, not from Idol renders. This file is the whole job: what is in the game now, the route a clip takes, and how to continue.

## State (PR #1000)
- **Final, in the game:** the herds (`src/game/ext/farms/animals.ts`: the owner's sizes, 3 to 8 cows or 2 to 4 horses in the paddock, 6 to 12 sheep in the other
  pastures; each animal keeps to its own cell of the field, 3.2 m from the next and clear of hay bales and bushes, and never leaves the field shrunk past its fence),
  the movers (`Game.animalMovers`, the street tier only, culled by the farm's box), the pack script (`scripts/assets/prep-animals.mjs`: two tail atlas pages,
  `src/game/animals-library.ts`, 840 vector shadows) and `?animals=0` (dev) for the A/B. Cost: about 0.02 ms a frame measured by the game's own counter; the farms bench
  with the herds on and off by turns on one map differs by +0.04 ms on average (run-to-run noise 0.11 ms): well under the 0.3 ms ceiling.
- **Placeholder:** `art/animals/<id>/sheet.webp` (7 animals x 8 headings x 15 frames), rendered from Idol splats by `scripts/assets/animals/` (`idol_models.py`, `model.py`,
  `repair.py`, `rig.py`, `build.py`, `final.py`). **No more polishing of these frames.** ChatGPT's clips replace them one heading and clip at a time.
- **The 7 animals:** cow-holstein, cow-brown, horse-bay, horse-chestnut, horse-grey, sheep-white, sheep-blackface. A herd uses one or two breeds of its kind.

## The sheet (what ChatGPT's clips are cut into; `import_frames.py` writes it, `prep-animals.mjs` reads it)
- **Rows** = the 8 headings in world-angle order (`CAR_DIRECTIONS`): SE S SW W NW N NE E. The nose is on screen: SE is down-right, E is right. **Never mirrored:** the sun is at
  the upper right and the sprites are lit, so each heading is its own clip (the owner's rule).
- **Columns** = the 15 frames of a heading: graze 0-3 (loops; the main idle: the head down, a slow nod and chew), look-up 4-6 (the head coming up: 2/3 down, 1/3, up; the game
  plays it backwards to put the head down), walk 7-14 (8 frames, loops, a walk in place: the game moves the animal). `sheet.json` `clips` holds each clip's start, n, times, loop.
  Game speed: graze 0.7 s a frame, look-up 0.22 s, walk 0.16 s (a sheep 0.11 s). To change a clip's frame count, the sheet's columns and `ANIMAL_GRAZE/LOOKUP/WALK/ROW` in
  `animals.ts` change together; ChatGPT's GIF may have any number of frames, the importer picks evenly.
- **Cells** = `frameWidth` x `frameHeight` px (`sheet.json`) at the art scale (a 1.78 m person = 190 px; the game draws at half), transparent, the animal's middle on the ground
  at `sheet.json` `anchor`, the sun at the upper right in the picture. Each animal has its own cell size (a sheep's is small).

## The route of a clip
1. **The pack** (`scripts/assets/animals/chatgpt_pack.py`): per animal, clip and heading a folder with `ref.png` (the animal standing at the heading, the game's camera and light,
   on flat grey), `camera.png` (an in-game shot of the animal in its paddock with a person standing near it, for the angle and the scale: `scripts/dev/animal-camera-shot.mjs`),
   `pose-guide.png` (optional: the placeholder's frames), `PROMPT.md` (modelled on `output/gif-test/PROMPT.md`) and `CHECKS.md`. The first pack, the brown cow at SE with
   all three clips, is in `E:/ClaudeTemp/T309/chatgpt/` (the generator rebuilds it: `python chatgpt_pack.py --animal cow-brown --render`, through `bash E:/ClaudeTemp/heavy.sh`).
2. **ChatGPT:** upload `ref.png` then `camera.png`, paste the prompt, check the GIF against `CHECKS.md` (same animal, still camera, loop joins, clean background, scale), save it as
   `result.gif`.
3. **The import** (`scripts/assets/animals/import_frames.py <gif|strip> --animal <id> --clip <clip> --heading <H>`): cuts the frames (a GIF's frames or a strip's cells), keys the flat
   background (what touches the border; small gaps between the legs; `--cut-shadow` for a ground shadow; `--bg`, `--tol` for a noisy or tinted background), scales all the frames by one
   factor so the body matches the placeholder's (`--scale-by area|box`, or `--scale` to force: take the walk's for the other clips), stands the animal on the placeholder's ground
   (mass centre and lowest hoof; every frame's lowest hoof lined up), writes the cells of that heading and clip into the sheet and notes them in `sheet.json` (`imported`, `art`).
   `--dry-run --preview p.png` writes only a picture: the placeholder on top, the new clip below. There is no mirror option.
4. **The pack into the atlas:** `bash E:/ClaudeTemp/heavy.sh node scripts/assets/prep-animals.mjs` (about 4 minutes; rewrites `src/assets/animals`, `src/game/animals-library.ts` and the
   shadows). Commit the sheets and the generated files; run `npm run typecheck` and `tests/farm-animals.test.ts`.

## Scope (for the lead to size)
7 animals x 3 clips x 8 headings = **168 clips**, each its own ChatGPT run. One breed of each kind (cow-brown, horse-bay, sheep-white) is 72; the walk alone for them is 24. The herds
use whatever the sheet holds: an animal whose heading has no ChatGPT clip yet shows its placeholder frames, so a partly done animal is safe to ship (the contact sheets
`F:/ClaudeTemp/T309/contact-final-*.png` show the placeholders). Pale animals (the white sheep, the grey horse) key best on a flat colour that is not near their coat: ask ChatGPT for
a flat mid blue (#4A78C8) instead of light grey; the importer keys any flat colour.

## Checks to run after an import
Look at the preview; `node scripts/dev/animal-shots.mjs` (a dev server) shows the herds in a farm; the walk's feet should not skate (if they do, change `ANIMAL_SPEED` in
`animals.ts`, not the art). A clip that came out at a different size from its neighbours: re-import it with `--scale` from the walk.
