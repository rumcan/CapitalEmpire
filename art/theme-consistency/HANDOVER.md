# T017 image generation handover

## Integration handover, 2026-10-23

The owner requested generation stop, then asked to merge all outstanding work into main and document the workflow. **Generation is stopped; this integration starts no new images or background batch.** The checkpoint through `27eb91e` is included in the owner-requested `lead/merge-outstanding-20261023` integration for main alongside T015/T016/T018 and shadow work. After pulling, verify `origin/main` and PR #17 rather than reusing the historical branch instructions below. For future art work, follow current repository/task branch rules from the merged checkpoint.

**Read [docs/SPRITE-GENERATION-WORKFLOW.md](../../docs/SPRITE-GENERATION-WORKFLOW.md) for the complete operational workflow**, including example prompts and commands. It covers game screenshots and exact scale references, full overview before individual sprites, the sole authoritative theme, four true rotations under fixed sunlight, the four-cutout alpha fallback, provenance, selected revisions, packing warnings and delivery to the implementing AI. Broader atlas history is in [ART-PIPELINE.md](../../docs/ART-PIPELINE.md).

The continuation count below is the last recorded snapshot: 54 generated drafts, 251 pending, zero visual approvals/game registrations by this task. Refresh from `queue.json`, actual selected files and reports before continuing. When generation is requested again, prioritize pending town houses/buildings (currently `town:laundromat` is the next substantial town building; `town:bus_stop` is also pending), then remaining buildings, trees and vehicles. Another AI handles implementation. File/alpha success does not approve clipped or inconsistent art.

## Continuation update, 2026-10-23

The owner resumed generation and set **town houses and buildings as the priority**. The original queue order is retained as inventory; choose pending town houses/buildings before other golf or reference buildings, then return to the remaining building queue. Existing `world:house_*` and many `town:*` subjects are already generated drafts; the next pending substantial town building is `town:laundromat` (the smaller `town:bus_stop` remains pending). Trees and vehicles remain after buildings.

The selected count is now **54 generated drafts of 305 subjects**, with 251 pending, 54 PNG/alpha file validations, 26 alpha/packing flags, and zero visual approvals or game registrations. New drafts: `golf:clubhouse-shanty` v2 (alpha correction of an opaque v1; visible edge halo and cross-cell warnings, **do not approve or register**), `town:firestation` v1 (four independently generated transparent cutouts assembled into one sheet; source NE/SE/NW touch their source canvas edges), and `town:fish_tackle` v1 (same method; source NE touches its canvas edge). Possible clipping still needs visual review. Original cutouts and exact prompts for both town buildings are in their `generated/buildings/*-singles/` folders and sheet provenance. None is a finished in-game asset.

**Alpha lesson:** telling built-in imagegen to make a transparent four-view sheet repeatedly produced opaque checkerboard or backdrop pixels, even with explicit "NO BACKGROUND" wording. Retrying one isolated view per call with "NO BACKGROUND; transparent alpha, RGBA PNG" produced four real-alpha cutouts for the firestation. Verify `sharp(...).metadata().hasAlpha` and transparent corner pixels after **every** call; reject opaque outputs. `scripts/assets/assemble-theme-consistency.mjs <category> <slug> [vN]` composes four actual cutouts into a 2x2 sheet using only pixel crops and aspect-preserving resizing. It does not repair clipped source views or prove correct rotations. Preserve raw cutouts and provenance, run `prep --id`, then `plan`. Keep the user's priority and these review warnings in the next checkpoint.

This continuation update records the earlier resumed generation session. The later stop/integration checkpoint at the top is the current execution state.

## Prompt for the new chat

> Read `docs/SPRITE-GENERATION-WORKFLOW.md`, `art/theme-consistency/HANDOVER.md`, `art/theme-consistency/IMPLEMENTATION-NOTES.txt`, and task T017. Generation is stopped until I ask to resume. Start from the merged main checkpoint and follow current task/branch instructions. When asked to generate, refresh local jobs, inspect the exact dusk street reference and choose a pending town house/building from actual selected-file existence, then finish remaining buildings, trees and vehicles. Another AI handles implementation. Generate four true rotations of one subject with fixed screen-upper-right sunlight, early dusk, no people or Halloween. Preserve originals, selected revisions, exact prompts and separate file/visual/packing/game review states. Do not regenerate an existing draft just because it is unapproved. Commit and push scoped checkpoints under the applicable authorization.

## Historical task branch and ownership (before owner-requested integration)

- Workspace: `C:/Work Admin/PERSONAL/Repos/CapitalEmpire`.
- Branch: `arena/T017-theme-consistent-library`.
- Draft PR: https://github.com/rumcan/CapitalEmpire/pull/17.
- Task: `agents/tasks/T017-theme-consistent-library.md`.
- Read repository/arena instructions and the imagegen skill before continuing. This is the art task, not lead/runtime implementation work. Do not edit `docs/`, runtime libraries, atlases, renderer, saves or other agents' implementation files.
- Authorized deliverables live under `art/theme-consistency/`; asset tooling lives under `scripts/assets/*theme-consistency*`.
- The owner explicitly prioritizes image generation and says another AI is implementing the new images. Keep implementation separate.
- Preserve unrelated old T015/T016 files, worktrees and other agents' edits. Stage only this task's paths. Do not reset the checkout, push main, force-push or merge your own PR.
- Last art checkpoint commit before this handover: `cf63f1376e8b67ca55e39a81d671f2dd5c1f5484` (51 subjects). Earlier checkpoints: `cb6bcf4`, `2897f37`, `a639649`.
- At the initial stop audit the last confirmed remote checkpoint was `a639649` (35 subjects); the final handover push must include `cf63f13` plus this document. Verify local/remote heads rather than assuming a cancelled tool finished.
- PR metadata reported `mergeable: false` against newer main `064a8fe` at the stop audit. No conflict resolution/rebase was attempted during the generation task. Refresh state before integration; do not assume this draft is ready to merge.

## Exact progress at the earlier stop (superseded by the continuation update)

| Item | Count |
| --- | ---: |
| Subjects inventoried | 305 |
| Buildings in inventory | 190 |
| Trees in inventory | 58 |
| Vehicles in inventory | 57 |
| Generated subjects | 51, all buildings |
| Buildings still to generate | 139 |
| Trees/vehicles generated by T017 | 0 / 0 |
| Total still to generate | 254 |
| Selected sheets passing PNG/alpha file checks | 51 |
| Exported native view crops | 204 |
| Calibrated size previews | 816 |
| Subjects with padding/boundary warnings | 25 |
| Subjects marked visually approved | 0 |
| Subjects registered in game by this task | 0 |

These are **generated drafts with explicit review states**, not a completed or visually approved 305-subject library. Raw revision files are not additional subjects. Original reference exports are not generated replacements.

## Non-negotiable art requirements

1. ALL existing buildings, then ALL trees, then ALL vehicles. One subject per built-in imagegen call. Do not generate people, occupants, crowds or spectators, including tiny crowd textures in grandstands.
2. Four true quarter turns of the SAME object on one transparent PNG, 2x2, with full silhouettes and generous transparent gutters. Reconstruct hidden sides. Do not mirror fronts, signs or text. Preserve architecture, roof, chimney, windows, paint and integral features across rotations.
3. **Early dusk**, with visible warm low side sunlight and warm windows/practical exterior lamps already on. No moonlit night or overhead midday treatment.
4. Sun stays **SCREEN UPPER RIGHT** for every sprite. Shadows go lower-left. Rotate geometry, not the sun.
5. **No Halloween**: remove pumpkins/jack-o-lanterns, cobwebs, ghosts, skull flags, spooky signage and seasonal decorations inherited from old sources. Prompts also exclude wreaths and decorative string-light garlands. Autumn tree colours are allowed.
6. The owner's starter tier means **small budget/makeshift construction**, not simply a premium object covered in dirt and wear. Existing explicitly derelict source buildings can retain their actual condition; do not invent worn variants as substitutes for budget designs.
7. Preserve all original art and historical revisions. Corrective outputs get a new versioned filename; never overwrite a source or silently select a rejected v1.

## Authoritative references

The owner explicitly selected this exact full street image:

`C:/Users/Francois Smit/.codex/generated_images/01a15fe8-e26f-72b1-94e3-874ef3d8db8b/exec-4349c2c3-2faf-41db-a1fd-1957638da4cd.png`

Its byte-for-byte project copy is **`art/theme-consistency/references/theme-authoritative.png`**.

SHA256: `23338f2cf3f635ad4ec1fb18e9084f4e486d449d547bd8d22aecd250601a9db2`.

This full Maple Bean autumn street scene is the sole style authority and satisfies the scene-first workflow. Do not substitute another attachment, an Auri brand board, or a new theme recreation. `references/theme.json` records the owner selection and lighting.

`references/rotation-guide-v1.png` is a **geometry diagram only**. It demonstrates four exact turns using labelled coloured box faces and one white corner marker. Never copy its colours, boxes, text, marker or labels into game art. Building jobs include it as the last reference, after the theme and original identity references. Face pairs are front+right, right+back, back+left, left+front. It improves results but does not guarantee correct geometry.

## Files to use

- `queue.json`: subject states and selected `sheet` versions.
- `jobs.json`: resumable generation order, references and hashes, expected output paths, exact prompt files and ready-to-use `imagegenArguments`.
- `jobs/*.prompt.txt`: current generation instructions. Historical exact prompts remain in each generated sheet's provenance JSON.
- `generated-manifest.json`: selected sheets, hashes, native crops, size previews, calibration and review warnings.
- `prepared-verification.json`: current selected-sheet file/crop report; not visual or game-placement approval.
- `generated/contact.png`: contact sheet of all 51 selected building subjects.
- `generated/buildings/*-4views-vN.png`: raw generated sheets; adjacent `.provenance.json` records exact prompt, references and original generator output path.
- Each selected sheet has a same-named subdirectory containing `NE/SE/SW/NW.native.png` and configured/max previews at DPR1/2. Use manifest paths, not guessed filenames.
- `inventory.json`, `exports/`, `export-verification.json`: original atlas mappings, exact measured sizes and 1,621 source-reference PNGs. These are preserved original assets.
- `generation-brief.txt`, `IMPLEMENTATION-NOTES.txt`: lasting process and integration guidance.

Original exports use maximum camera zoom **0.3**, not mip density 0.6. They retain exact floating CSS bounds and raster/DPR dimensions for normal placement and largest audited normal UI scale. Source-only foliage has no invented runtime size. Arbitrary Studio/script scales have no finite global maximum. Generated previews use one shared scale per subject and preserve aspect ratio; final anchors and hidden-side sizes still need in-game registration by the implementing AI.

## Selected corrective versions

Always trust `queue.sheet` / the manifest, not a blanket v1 glob. Current important selections are:

- `world:house_2` v3; `world:house_3` v2; `world:house_4` v2.
- `town:postoffice` v2 (v1 had reversed text).
- `business:golf-cart-garage`, `business:golf-driving-range`, `business:golf-halfway-pavilion` v2 (attempted angle corrections, still unapproved).
- `business:stadium` v3. v1 retained crowd texture; v2 removed crowds but clipped a floodlight; v3 has empty blue seating and corrected framing.
- `ce:parking-kiosk` v2; `expansion:derelict-two-storey` v2; `expansion:dormer-rear` v2 (opposite-side/porch corrections with the guide).
- `business:fishing-lodge` v2; `expansion:glasshouse` v2; `gen:house-duplex` v2; `gen:house-splitlevel` v2 (decoration cleanup; split-level eave webs replaced by plain brackets).

## Review issues that must remain explicit

- Twenty-five selected subjects have padding/boundary warnings. The crop helper divides the canvas at its exact midpoint. Some full raw sprites extend past that mathematical split even when separated from their neighbour by a visible gap. **Equal-cell native crops can clip those sprites.** Inspect/repack the raw selected sheet or generate a better layout before registering such crops. Do not call these approved just because the PNG checks passed.
- Tiny padding warnings and genuine cross-cell artwork are different; inspect `packingReview` and `warnings` in the manifest.
- Transparent tool previews can display hidden RGB haze where alpha is zero. Inspect alpha or a neutral-grey composite before diagnosing a background. Do not mask/repaint source art to conceal a bad generation.
- Some first-pass sheets repeat a camera angle or change architecture between views. Review all four rotations. Known candidates needing close geometry review include the golf garage/range variants, expansion duplex/greenhouse/lean-to, backyard house variants and long ranch. A diagram in the prompt is not proof that the generator obeyed it.
- Check readable signs and no inherited festive details. Correct the specific failed cell/detail with imagegen, preserve the prior revision, then update the selected queue sheet and rerun preparation.
- No automatic visual approval is recorded. Another AI is responsible for runtime integration and registration, but generated-image defects should not be hidden from it.

## Pending subjects at the earlier stop (historical list)

The next batch was only loaded into chat memory; **none of these were generated**:

1. `golf:clubhouse-shanty`
2. `golf:food-tent`
3. `golf:grandstand-s` — explicitly require empty seats/benches, no crowd texture.
4. `golf:leaderboard`
5. `golf:toilet-block`
6. `ref:building-gas-canopy`
7. `ref:landmark-fountain-v2`
8. `ref:landmark-silo`
9. `ref:landmark-water-tower`
10. `ref:landmark-windmill`
11. `static:garage_brick`
12. `static:garage_brick-v2`
13. `static:garage_timber`
14. `static:shop_brick_rear`
15. `static:shop_brick_rear-v2`
16. `static:shop_market_rear`
17. `static:shop_market_rear-v2`
18. `town:bus_stop`
19. `town:firestation`
20. `town:fish_tackle`

Use disk queue/jobs and file existence as authority rather than relying on chat-memory arrays. After buildings, continue trees and vehicles with their category-specific prompts. T016's earlier tree work and grass assets are historical separate-branch work; they are not new T017 tree/car completions.

## Continuing the workflow

1. Read the task, imagegen skill and this handover; inspect git state without discarding anyone's edits.
2. Refresh `jobs.json` with `scripts/assets/plan-theme-consistency.mjs` if necessary. It adds the geometry reference for buildings and preserves queue review state.
3. Pick the first genuinely pending subject. Inspect its local identity reference with `view_image`, and inspect the master/guide once before using them. Use that job's populated `imagegenArguments` with built-in imagegen, transparent background true.
4. Save every output into its expected/versioned project path, leaving the default generated source in place. Save exact provenance beside it. Persist each subject immediately so interruptions do not lose a batch.
5. For a correction, update that subject's `queue.sheet` to the new version; retain old revisions. Inspect the new output before claiming the correction succeeded.
6. Run preparation, then planning. Commands in PowerShell: `& 'C:/nvm4w/nodejs/node.exe' scripts/assets/prep-theme-consistency.mjs` and then `& 'C:/nvm4w/nodejs/node.exe' scripts/assets/plan-theme-consistency.mjs`. `prep` supports `--id '<subject-id>'` for a targeted refresh. Full preparation can take minutes on large sheets.
7. Push scoped checkpoints and keep PR counts honest. No runtime/atlas integration is part of this art task.

Important tool pitfall: PowerShell commands can return a `session_id` with an empty `output` while still running. **Never send that empty output as an image prompt.** Poll until completion, accumulating chunks if needed. Prefer the already populated `jobs[].imagegenArguments.prompt` instead of reading each prompt through a new shell command. One previous batch stopped at the lodge because this was missed; the affected subject was subsequently generated successfully.

Use the built-in imagegen skill, not a silently substituted API/CLI model. Keep transparent alpha. Sharp is used only for pixel-conserving crops, aspect-preserving sizing and contact sheets; no procedural sprite stand-ins or code recolours. Existing delegated workers hit usage limits, so there is no worker batch to wait for.

Last engine checks: typecheck passed; full existing test suite **905 passed, 0 failed**, serial concurrency, 154,859.686 ms. Logs are under `output/theme-consistency/`. No runtime code was changed by T017. Image file checks and visual/game validation are separate.
