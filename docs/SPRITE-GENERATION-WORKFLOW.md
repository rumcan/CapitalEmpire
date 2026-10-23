# Image generation: scene first, then reusable sprites

This is the operational workflow for new Capital Empire object art and the T017 building/tree/vehicle restyle. It records the owner's decisions so another chat can continue without reconstructing chat history. Read the live [art handover](../art/theme-consistency/HANDOVER.md), [implementation notes](../art/theme-consistency/IMPLEMENTATION-NOTES.txt), and the assigned task before generating anything. This document explains the process; the queue and selected files describe current progress.

The owner has assigned runtime implementation to another AI and prioritizes image generation here. Generation does not register an asset in the game. A request to stop ends generation, including running batch loops; a saved queue is a set of instructions, not a background service. Resume only when asked. Do not start image generation as part of a documentation or merge request.

## Quick continuation

1. Inspect the current branch, working tree and repository instructions. Preserve other agents' work. Refresh the handover's branch/PR information after integration; old task-branch names are historical once merged.
2. Read the imagegen skill available in the current session. Use the built-in image generator, with local reference paths and transparent background enabled for sprites. Do not silently substitute a CLI, API model or procedural stand-in.
3. Verify the theme hash below. Inspect that image and the chosen subject's identity references before sending them to the generator.
4. Refresh planning from the current queue. Determine the next pending job from both the selected sheet path and actual file existence. Do not rely on stale counts or a copied list in this document.
5. Generate one subject, save its source and exact provenance immediately, inspect alpha and all four views, then prepare that subject and refresh planning. Record defects rather than hiding them.
6. Commit/push scoped checkpoints according to current authorization. Update the handover with the next subject, selected revisions, review warnings and any live tool execution. Another AI handles runtime registration and game validation.

Current owner priority is pending town houses/buildings before other pending buildings, then the remaining building queue, trees and vehicles. Preserve that priority while checking the live handover for later changes. Do not regenerate an existing draft simply because it has not yet been visually approved; repair it only for an identified defect.

## The one theme authority

Use this exact full street scene for every subject:

- Project copy: [`art/theme-consistency/references/theme-authoritative.png`](../art/theme-consistency/references/theme-authoritative.png).
- SHA256: `23338f2cf3f635ad4ec1fb18e9084f4e486d449d547bd8d22aecd250601a9db2`.
- Owner-selected original: `C:/Users/Francois Smit/.codex/generated_images/01a15fe8-e26f-72b1-94e3-874ef3d8db8b/exec-4349c2c3-2faf-41db-a1fd-1957638da4cd.png`.
- Selection metadata: [`references/theme.json`](../art/theme-consistency/references/theme.json).

The project copy is portable; another computer does not need the owner's private generated-images folder. The full Maple Bean autumn street image establishes materials, miniature illustration style, camera and lighting. Do not replace it with a recreated theme, a different attachment, a brand board, or a rotation diagram.

```powershell
(Get-FileHash -Algorithm SHA256 -LiteralPath 'art/theme-consistency/references/theme-authoritative.png').Hash.ToLowerInvariant()
```

All assets use **early dusk**: enough low warm side sunlight to read brick, siding, bark and shingles, with warm windows and practical lamps already on. Sun stays at **screen upper-right**, shadows toward **screen lower-left**, in every cell. Rotate the object under that fixed light. No moon, moonlight, deep nighttime scene or overhead midday lighting.

Do not generate people, characters, occupants or crowds, including baked crowd textures in grandstands. Do not copy Halloween elements from an old source: no pumpkins/jack-o-lanterns, cobwebs, ghosts, bats, skulls, spooky signs or seasonal decorations. Current prompts also exclude wreaths and decorative string-light garlands. Autumn red/orange/gold foliage is allowed; conifers keep their appropriate evergreen colours.

## 1. Establish actual game scale

Start with a real game screenshot at the intended asset zoom. Preserve it and record resolution, camera projection, numeric zoom if known, device pixel ratio, lighting and nearby scale references such as a house, car or tree. If the zoom is unknown, write “unknown”; never infer an exact numeric zoom from appearance alone. Inspect both the target gameplay view and the closest supported view.

For the existing library restyle, the original artwork is in the repo, mostly packed into atlases. T017 exports individual identity references from those preserved pixels. [`inventory.json`](../art/theme-consistency/inventory.json) maps source library, atlas/crop, hash, anchor-relative quad and measured placement sizes; [`exports/`](../art/theme-consistency/exports/) holds the reference PNGs.

| Export | Meaning |
| --- | --- |
| `.native.png` | Conserved current atlas crop. These are retained mip-0 pixels, not a claim to have recovered a higher-resolution pre-atlas master. |
| `.configured.png`, `.configured@2x.png` | Normal configured placement at maximum camera zoom, rasterized for DPR 1 and 2. |
| `.max.png`, `.max@2x.png` | Largest audited normal UI/contextual placement at maximum camera zoom, at DPR 1 and 2. |

The audited maximum camera zoom is **0.3**. **0.6 is mip-0 pixel density for the DPR-2 pipeline, not the camera zoom.** Preserve exact floating CSS bounds from the inventory; source-reference raster dimensions round up after multiplying by DPR. In outline:

```text
CSS width  = (quad.right - quad.left) * instanceScale * carFactor * 0.3
CSS height = (quad.bottom - quad.top) * instanceScale * carFactor * 0.3
reference raster extent = ceil(CSS extent * DPR)
```

The exporter audits placement-specific scales rather than applying one blanket owner multiplier: business parcel/golf-structure fits, ordinary traffic/parked-car scaling, tree brush limits and seeded placement variation differ. Inspect each inventory entry's `configuredContext` and `scaleCandidates`. Do not apply a car multiplier twice or copy an old constant from prose over current audited source code.

“Max” means the largest **audited normal placement**, not a mathematical global maximum: arbitrary Studio, script or saved scales are unbounded. Source-only foliage without a runtime `LibItem` has **no measured in-game maximum**. Preserve its native identity and state that limitation until an implementing AI assigns placement size.

The source exports are already measured. A generated canvas is not the same thing as an exact game-size export. Preparation estimates a shared density from an original reference and preserves aspect ratio; hidden-side dimensions and final anchors still require game registration.

## 2. Generate and approve the complete overview first

Give the generator the actual game screenshot for composition/scale and the authoritative street PNG for theme. Generate the complete desired feature in context **before** requesting its loose props. For a golf tournament, establish a food court with white tents, service fronts, paths, admission furniture, signs and support facilities within the course/town. Keep the venue empty of people.

Inspect the overview for projection, zoom, relative dimensions, lighting, object readability and coherence. Fix a wrong overview before deriving components. Save the approved overview, exact prompt, references and approval notes. Feed that approved image back into every derivative generation, alongside the authoritative theme and any existing subject references. The overview defines the chosen design in context; it does not supersede the owner's theme.

The existing T017 restyle already uses the owner's selected complete street image as its approved full-scene theme. Do not regenerate that authority for each building. For a new feature or budget tier absent from the scene, establish its complete overview first.

Worked overview prompt; substitute the actual paths and measurements in the call:

> Reference 1 is the owner's authoritative Maple Bean street theme. Reference 2 is the actual game screenshot at [recorded zoom, resolution and DPR, or explicitly unknown]. Preserve reference 2's camera, apparent scale, streets and golf course layout, rendered with reference 1's detailed illustrated miniature materials and lighting. Add a complete small local golf tournament with a modest white pop-up tent food court near the clubhouse, folding serving tables, ordinary chairs, simple timber signs, rope on stakes, bins and practical service access. Show no people, silhouettes, occupants or crowd textures. Early dusk: low warm sun from screen upper-right, shadows lower-left, warm practical lights already on, enough remaining daylight for detail. No moonlight or Halloween decorations. Express the small budget through modest quantity and inexpensive usable construction. This full scene will be reused to derive individual sprites; make their designs coherent and readable at the game zoom. Return a complete scene image, not a transparent sprite sheet.

## 3. Inventory independently placeable subjects

Identify the objects actually visible in the approved overview. Record each subject's ID, scene location/crop locator, role, approximate footprint, ground contact and meaningful variations. Separate objects that players must place independently: one tee marker or distance stake is one sprite, not a bunch of markers baked together. Assemblies are appropriate only when they are a single placement unit, such as a table with attached benches.

Budget and condition are separate axes. A small-budget event uses functional pop-up gazebos, folding tables, ordinary plastic chairs, simple timber boards and standard bins. It can be new and maintained. A premium structure covered in rust, tears and dirt is a worn premium asset, not a small-budget design. Create wear/damage states only where maintenance/replacement gameplay needs them. Retain an explicitly derelict source's identity when that is the assigned subject; do not make every starter asset derelict.

Choose colour variants where gameplay benefits: tent fabrics, umbrellas, carts, vehicles, furniture, bins and individual markers. For foliage, vary species, age, branch structure and canopy silhouette; a generic hue filter is not a new tree species. Never use a colour variation as a substitute for a requested rotation.

## 4. Derive one subject per generation call

Use reference roles explicitly:

1. The exact authoritative street image: **theme**.
2. The approved feature overview, when applicable: **scene design and scale context**.
3. The individual exported source view(s): **identity**, all belonging to one subject.
4. Optional [`rotation-guide-v1.png`](../art/theme-consistency/references/rotation-guide-v1.png): **geometry only**, last in the list.

The rotation diagram demonstrates visible face pairs: front+right, right+back, back+left, left+front. Its coloured blocks, marker, captions and palette must never appear in the output. It cannot replace the theme reference or prove that a generated turntable is correct. The current building job planner supplies the diagram; use the reference roles from the job rather than assuming every attached image is a second asset.

Inspect local references with the image-viewing tool before editing them. Use the built-in image generator with `transparent_background: true` and local `referenced_image_paths`; do not mix local paths and a recent-conversation-image selector in one call. Use the job's populated `imagegenArguments.prompt` where available. Shell reads can return an empty output while still running: wait for completion before using their result as a prompt.

Request exactly one subject on a square transparent PNG with four real quarter-turn views, row-major **NE, SE, SW, NW**. Keep a fixed parallel 2:1 isometric camera, ground axes approximately ±26.565 degrees and verticals vertical. Reconstruct actual hidden sides. A front mirrored left-to-right is not a rear facade. A different roof/window layout in each cell is not the same house.

Leave at least **15% of each cell's width and height clear on every side** of its complete silhouette, with generous middle gutters. Shrink uniformly to fit. No UI, captions, frame, checkerboard, backdrop, terrain tile, broad shadow cloud or neighbouring objects. Keep architectural steps/porches where integral. Avoid attached gardens, cars or scenery when generating a building. Cars are empty; trees have no buildings, lamps, pots or landscape bundles.

Worked single-subject sheet prompt:

> Subject: [ID and name]. Generate this ONE existing [building/tree/vehicle], preserving the identity in the subject reference(s). Reference 1 is the sole visual-theme authority. [Reference 2 is the approved feature overview; identify the exact visible object.] The other identity references show this same object, not additional subjects. [The final diagram is geometry-only guidance: do not copy its colours, labels or marker.] Return one SQUARE RGBA PNG sprite sheet, true transparent alpha, four separate cells in row-major NE, SE, SW, NW. Show four genuine rigid quarter turns of the same physical object with front+right, right+back, back+left, left+front face pairs. Preserve [roof/chimney/window/signage details, or species/trunk/canopy, or vehicle model/wheelbase/paint]. Fixed 2:1 isometric camera, verticals vertical. Sun always SCREEN UPPER RIGHT, tiny contact shadows SCREEN LOWER LEFT; rotate geometry only. Early dusk with readable materials and [warm windows/practical lamps for buildings; physically placed vehicle lamps where appropriate; no invented lamps on trees]. No people or Halloween decoration. Complete isolated silhouettes, no ground tile, backdrop or baked checkerboard. Leave 15% clear space around every cell edge, including the centre splits; shrink all views uniformly without clipping. Reconstruct real hidden sides; do not mirror signs or repeat the same view. Original measured CSS size is [inventory value or explicitly undefined for source-only art]; generated pixels will be calibrated later and are not final registered game dimensions.

For corrections, state the observed defect precisely and attach the relevant selected draft as well as the same authoritative references. Examples: replace only the cobweb-like eave ornament with a plain structural bracket; restore the rear wall instead of repeating the porch; make a sign read normally; fit the entire floodlight inside its cell. Preserve correct identity and save a new version. Inspect the result before claiming the correction succeeded.

## 5. True-alpha fallback: four isolated views, then assembly

Built-in generation has sometimes returned opaque backdrops or baked checkerboards despite a transparent-sheet request. Check alpha after **every** output. Prompt wording and the UI preview do not prove transparency.

If a four-view sheet repeatedly fails, generate four separate transparent cutouts, one view of the **same subject** per call. Reuse the theme, identity and approved preceding view to maintain design. State the exact face pair/heading and fixed screen lighting for each call. Request “NO BACKGROUND; transparent alpha, RGBA PNG,” full silhouette and ample padding. Preserve all four raw files and their separate prompts/provenance.

Store them in `art/theme-consistency/generated/<category>/<slug>-singles/NE.png`, `SE.png`, `SW.png`, `NW.png`. Then:

```powershell
node scripts/assets/assemble-theme-consistency.mjs buildings town-example v1
```

The assembler creates a transparent 2x2 sheet through alpha-bounds crops and aspect-preserving fitting. It reports `sourceTouchesCanvas`. A clipped raw roof/branch cannot be recovered by padding a new sheet: regenerate the clipped source. The helper fits each cutout inside a 720px box in a 1024px cell; this does **not** prove equal physical scale across asymmetric views. Review their dimensions against the identity references and compensate/repack or regenerate if needed. It does not prove correct rotations or shared architecture either. Keep the assembly report and inputs in provenance, select the resulting sheet explicitly, then run preparation and planning.

## 6. Save provenance and selected revisions immediately

Copy every successful generated image into the project while retaining the original generator output. Suggested sheet name: `art/theme-consistency/generated/<category>/<slug>-4views-vN.png`, with adjacent `.provenance.json`. Never overwrite a source or a rejected earlier revision.

Record at least subject ID/category, generation timestamp, tool/model information actually reported, original generator output path, project output path/hash, exact prompt, ordered reference paths/roles/hashes, view order, intended light/camera, source measurements or scale limitation, and pending review state. If four cutouts were assembled, record each raw output and prompt plus assembly parameters/report. Do not invent unavailable model metadata.

Set the subject's `queue.sheet` to the chosen revision when correcting it. Use that selection and `generated-manifest.json` throughout delivery; a blanket `*-v1.png` glob can silently restore reversed signs, Halloween details or clipped views. Do not count revisions as additional subjects. Current planner prompts can evolve; a generated image's sidecar must retain the exact prompt that made it.

## 7. Validate files, art, packing and game placement separately

| Stage | What passing it establishes |
| --- | --- |
| File/alpha check | Decodable PNG, real alpha/clear pixels, hashes and basic dimensions. It does not establish correct artwork. |
| Visual review | Same identity, genuine rotations, coherent dusk/light, correct signage, no prohibited details and intact silhouettes. |
| Packing review | Complete separable cells/crops, safe gutters, preserved edges and usable contact points. |
| Game registration/review | Correct footprint, relative size, anchor, facing mapping, sorting and appearance at actual gameplay zoom. |

Inspect alpha numerically and composite the image on neutral grey. RGB haze stored beneath **alpha zero** is invisible and is not an opaque background. Conversely, a grey/white checkerboard painted into opaque pixels is a backdrop. `metadata().hasAlpha` alone is insufficient: an RGBA image can still have alpha 255 everywhere. Inspect clear corner/background pixels and silhouette edges; real cutouts can also have faint partial-alpha haze or edge halos. Preserve real warm windows, pale roofs, white tents and vehicle bodywork—never erase them by treating their colour as background.

The prep tool examines alpha at threshold 8 and ignores components smaller than eight pixels **for crop-bound estimation only**, retaining original pixels inside the crop. This is not a pixel-cleanup, background-removal or artifact-repair operation. Do not claim that thresholding repaired a defective source or use destructive masking to conceal one.

The crop helper splits the sheet at its mathematical midpoint, using the remainder on the right/bottom for odd dimensions. A complete sprite may cross that split even when there is a visible gap to its neighbour. Equal-cell extraction can then cut it in half. Inspect raw selected sheets and manifest `packingReview`, per-view `warnings` and `touchesCellEdge`; distinguish a small margin warning from genuine cross-cell artwork. Repack a complete source with conservative pixel operations or regenerate a better layout. Never deliver a visibly clipped crop as approved merely because file checks passed.

Review all four views together. Track one asymmetric feature (chimney, porch, loading door, vehicle bed or branch) through the full turn. Check roof plan, storeys, door/window rhythm, material/colour identity, rear facades, sign spelling and readable non-mirrored text. Check that brighter surfaces follow screen lighting rather than a particular facade. Verify complete antennas, eaves, branches, wheels and ground contact. Regenerate a targeted defect; keep the old file and explicit rejection reason.

The implementing AI must finally check sprites beside existing cars/houses/trees at the reference view and closest zoom, at DPR 1/2 where supported, including all directions, anchor/footprint, occlusion and depth sorting. Calibrated previews are estimates until that registration. Do not set visual/game approval from a successful script exit.

## 8. Repository tools and commands

Run commands from the checkout root with installed project dependencies and Node available. On this Windows setup, if `node` is absent from PATH, use `& 'C:/nvm4w/nodejs/node.exe'` in place of `node`; the executable path is machine-specific.

| Tool/data | Responsibility |
| --- | --- |
| `scripts/assets/export-theme-consistency.mjs` | Refresh original reference exports, source inventory and verification; preserve existing selected queue metadata. Reads current runtime libraries/atlases and retained source-only manifests. Does not generate replacement art. |
| `scripts/assets/plan-theme-consistency.mjs` | Verify authoritative/reference hashes and rebuild per-subject prompt files and resumable jobs without resetting queue review state. Does not invoke imagegen. |
| `scripts/assets/prep-theme-consistency.mjs` | Read selected sheets; inspect alpha/boundaries; extract native crops and shared-density configured/max previews; update manifests/contact sheet and file reports. Does not register runtime assets or approve art. |
| `scripts/assets/assemble-theme-consistency.mjs` | Assemble four existing RGBA cutouts; no creative repair, rotation or missing-pixel reconstruction. |
| `queue.json` | Subject inventory, selected `sheet` revision and review state. Preserve corrections. |
| `jobs.json`, `jobs/*.prompt.txt` | Current ready-to-use imagegen arguments, reference roles/hashes, output paths and planning state. Absolute reference paths are local: rerun planning in a new checkout/worktree. |
| `generated-manifest.json`, `prepared-verification.json` | Selected-sheet hashes, native/size output paths, calibration, warnings and separate review statuses. |
| `generated/contact.png` | Overview for inspection, not proof of detailed approval. |

Typical continuation, after checking the current queue and chosen ID:

```powershell
# Routine resume: refresh local absolute paths and inspect the next job.
node scripts/assets/plan-theme-consistency.mjs

# After saving/selecting a generated revision:
node scripts/assets/prep-theme-consistency.mjs --id 'town:example'
node scripts/assets/plan-theme-consistency.mjs

# Full crop/preview/contact refresh, when needed:
node scripts/assets/prep-theme-consistency.mjs

# Refresh original references only when inputs changed or inventory needs rebuilding.
node scripts/assets/export-theme-consistency.mjs
node scripts/assets/plan-theme-consistency.mjs
```

Do not regenerate the original inventory casually while another AI is changing runtime libraries: snapshot source hashes and inspect the resulting diff. The exporter reads current files, so changed libraries can legitimately change the inventory. Keep original source-only references/retained manifests available and review any reported unavailable sources.

Find pending jobs using selected paths plus disk existence, rather than `queueStatus` alone:

```powershell
$plan = Get-Content -LiteralPath 'art/theme-consistency/jobs.json' -Raw | ConvertFrom-Json
$pending = @($plan.jobs | Where-Object {
    $candidate = if ($_.selectedSheet) { $_.selectedSheet } else { $_.expectedSheet }
    -not (Test-Path -LiteralPath $candidate)
})
$pending | Select-Object -First 12 id, category, state, expectedSheet
# Apply the live handover's town-building priority before choosing a job.
$next = $pending | Where-Object { $_.category -eq 'buildings' -and $_.id -like 'town:*' } | Select-Object -First 1
if (-not $next) { $next = $pending | Select-Object -First 1 }
$next.imagegenArguments | ConvertTo-Json -Depth 8
```

If a selected revision is missing but another revision exists, investigate before generating: do not silently downgrade to the older file. A file that exists but fails alpha/rotation/packing review belongs in a correction queue, not a “never generated” count. Never pass an empty prompt from a still-running shell tool. Persist each subject before beginning the next; batch scripts must remain interruptible and honor a stop request.

## Ground art and the historical pipeline

Ground bases are top-down materials projected by the renderer; do not bake isometric perspective into them twice. Calibrate detail density/physical scale against the actual screenshot and examples such as `src/assets/ground/lot-asphalt.webp` and `paint-photo-fairway-sod.webp`. Keep base grass condition, mowing lines, divots, cart tracks and crowd wear as separate layers where gameplay changes them locally. Transparent wear decals still need isolated boundaries and scale checks.

[`art/grass-management/SPRITE-WORKFLOW.md`](../art/grass-management/SPRITE-WORKFLOW.md) records the original scene-first direction. [`ART-PIPELINE.md`](ART-PIPELINE.md) documents the broader atlas/lot pipeline and historical RUN.world workflows. Its RUN golf generation used flat magenta plus `key-magenta.mjs`; photo generation had its own CLI/model limits. Those are historical/separate paths. **Current T017 uses built-in imagegen with native transparent alpha.** Do not send native-alpha outputs through magenta keying, silently swap models, or remove white windows/tents/cars to force transparency. A local crop/packing tool is not a replacement image generator.

## Handoff/checkpoint checklist

- State whether generation is running, stopped or blocked; cancel/poll live executions when asked to stop. Do not imply that a saved queue is generating in the background.
- Record current branch, commit/remote state and PR or merged-main location. Preserve unrelated changes; stage only authorized paths.
- Link this workflow, the exact theme/hash, live handover, task, queue/jobs and implementation notes. Keep the scene overview and original game-scale references available.
- Compute progress from current selected files and reports. Keep generated drafts, valid files, packing flags, visual approvals and game registrations distinct; avoid stale hardcoded totals in reusable instructions.
- Name the next pending subject and live priority, plus correction candidates and selected v2/v3/etc revisions. Keep rejected source files and provenance.
- Report real checks and limitations: alpha/backdrop failures, edge clipping, duplicate angles, reversed signs, estimated scale or unavailable references. Do not translate “file check passed” into “production ready.”
- Give the implementing AI selected raw-sheet/native-crop paths from the manifest, direction order, source measurements, calibration policy and unresolved review flags. Runtime library/atlas integration remains its separate responsibility.

Reusable new-chat prompt:

> Read `docs/SPRITE-GENERATION-WORKFLOW.md`, `art/theme-consistency/HANDOVER.md`, `art/theme-consistency/IMPLEMENTATION-NOTES.txt` and the current task/repository instructions. When I ask you to continue generation, refresh jobs for this checkout, inspect the exact authoritative dusk reference and next pending subject, and generate one subject at a time. Follow the live town-building priority, then remaining buildings, trees and vehicles. Use four true rotations, fixed screen-upper-right light, early dusk, no people or Halloween. Preserve selected revisions and exact provenance; inspect real alpha and clipping after every call. Another AI handles implementation. Do not start generation if this chat is only reviewing, documenting or merging work.
