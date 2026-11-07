# Reviewed normal + yaw8 object art

`import-object-eight.mjs` accepts any subject, independently of the frozen 43-building bridge queue. It preserves the input PNGs, writes native crops into a new version folder, and keeps import separate from review. It never manufactures missing angles from an existing image.

Input JSON fields:

```json
{
  "schema": 1,
  "projection": "normal+yaw8",
  "subject": "golf:wood-stand-small-worn",
  "name": "Small timber stand",
  "version": 1,
  "review": "candidate",
  "source": { "normal": "corners-v1.png", "yaw8": "yaw8-v1.png" },
  "footprintMetres": { "width": 16, "depth": 8 },
  "pixelsPerMetre": 44,
  "pixelCalibrationSpace": "orthographic-camera",
  "baselineScale": 1,
  "kind": "building",
  "category": "New: Seating",
  "capacity": 200,
  "visualTier": "worn",
  "eventTypes": ["standS"],
  "aliases": [],
  "views": {}
}
```

Source paths are relative to the input JSON. `pixelsPerMetre` is an actual measured calibration, not a suggested constant. The normal sheet cells are `normalSE normalSW / normalNW normalNE`; the yaw8 sheet cells are `yaw8N yaw8E / yaw8S yaw8W`. Yaw8 means the approved eight-degree tilted cardinal geometry. An old square-cardinal sheet is a different family and does not qualify merely because it contains N/E/S/W pictures.

`pixelsPerMetre` means the **true orthographic camera scale before yaw/pitch foreshortening**. At the normal45° heading, a12m horizontal ground edge spans `12 / sqrt(2) * pixelsPerMetre` image pixels in X and half that in Y. Measure the accepted building's actual foundation corners; exclude steps, benches, eaves and shadows. A resized painting does not inherit its guide's44px/m number automatically. Do not infer scale from an unverified door height or an alpha bounding box.

The importer reads `HW`, `HH` and `TILE_M` from the actual engine source. Currently `worldX=(metresX-metresY)*32`, `worldY=(metresX+metresY)*16`: the game-equivalent true camera scale is **32*sqrt(2)=45.2548339959 world pixels per metre**, with30° ground foreshortening. The source-to-library display factor is therefore `sqrt(2)*HW/TILE_M/pixelsPerMetre`. A44px/m camera source uses factor **1.02851895445**; its12x8m normal-view ground footprint becomes **640x320 game pixels**. The former `64/pixelsPerMetre` factor was sqrt(2) too large. Library width/height and anchors use the corrected factor together; physical collision boxes remain in metres. Camera up/down signs follow the selected view and do not change this scale calculation.

Use one shared measured scale when the sheet is consistent. If an accepted native view has a genuinely different measured camera scale, its `views.<key>.pixelsPerMetre` may override the shared value, but a non-empty `calibrationEvidence` describing the measured ground segment and known length is then required. This adjusts native-to-display size only, never redraws or repairs a wrong camera. A held or inconsistent perspective must be corrected, not hidden with per-view scaling. Each immutable runtime asset version receives a `calibration.json` recording the engine constants, actual display factors and measurement notes. Existing imported versions are preserved; a corrected import requires a new version.

Run:

```
node scripts/assets/import-object-eight.mjs --manifest INPUT.json --out NEW_VERSION_FOLDER
```

Cutting requires native alpha, four complete isolated subjects per sheet, clear gutters, and eight different native pixel images. Exact duplicate and mirrored crops fail. Each crop has the original sheet hash, cell rectangle, crop rectangle and output hash in its sibling provenance. All outputs start as candidates. The script never overwrites a version folder.

Review the images together for unchanged identity, doors/roof/materials, scale, geometry, alpha and upper-right sunlight. Review each crop's `anchor` in crop-local pixels and actual physical `headingDegrees`. When supplied in the input, anchors are measured relative to the full source CELL; cutting converts them to crop-local coordinates. An absent anchor or heading stays null and blocks integration. Keep headings explicit: source-camera labels do not establish the runtime object's yaw or handedness. Legacy reviewed sets may use their original 0/90/180/270 and37/127/217/307 mapping. The detailed single-world clubhouse guide proves a different mapping against the actual game projection: runtime local `(x,y)=(guide x,-guide y)` and heading `(camera beta-object theta-45) mod360`, giving normal NE/SE/SW/NW **0/270/180/90** and yaw8 N/E/S/W **323/233/143/53**. Its ground/body origin is the anchor even when attached furniture extends beyond the body. See the hash-bound import review and collision evidence in [the clubhouse delivery](../../art/catalogue-completion-20261107/generated/old-clubhouse-1950/native-import-v1/manifest.json); no pixel flip or guessed37-degree label is used. Square-cardinal sheets still do not qualify as yaw8.

The output `manifest.json` may additionally specify `views.<key>.boxes` as an array of `{hx,hy,dx,dy}` collision boxes in metres around the anchor. Otherwise physical width/depth and heading generate conservative rectangular bounds. The importer preserves this geometry by facing. A scene source, portrait, tree copy or a two-dimensional screen rotation is not another genuine static-object facing.

After visual/geometry review, set the OUTPUT manifest's `review` to `approved`, then:

```
node scripts/assets/import-object-eight.mjs --integrate NEW_VERSION_FOLDER/manifest.json
```

This verifies original and crop hashes, appends versioned lossless atlas pages and runtime IDs, and regenerates the dedicated library. It preserves prior rows in an append-only registry so old saves still resolve previous versions. New and repaired artwork uses the same path. `aliases` can bind an existing catalogue subject to this reviewed replacement; preserve that old subject's existing four-view lot semantics. Eight-way placement uses the dedicated resolver instead.

`capacity` is documented art metadata. It does not silently change the event catalogue's prices or capacities. `visualTier` describes physical condition independently of tournament unlock tier. A matching event type defaults to worn when available; an explicit upgraded state selects its corresponding reviewed set. Use distinct subjects for worn/upgraded designs and publish new versions to replace a design.

Event seating uses exactly two conditions, `budget` and `upgraded`; older `worn`/`rundown` wording aliases `budget`. The new event IDs are `seatedPavilion24`, `seatedPavilion60`, `seatedPavilion120`, and `compactBleacher60`. They remain unavailable until their complete reviewed eight-view set and measured seating are installed; they never borrow a scaled small-grandstand picture.

An event seating manifest carries `capacity` and a `seating` object, optionally overridden by `views.<key>.seating`:

```json
{
  "capacity": 24,
  "visualTier": "budget",
  "eventTypes": ["seatedPavilion24"],
  "seating": {
    "review": "draft",
    "front": { "x": 0, "y": 1 },
    "rows": [
      { "start": { "x": -2.275, "y": 0.9 }, "step": { "x": 0.65, "y": 0 }, "seats": 8, "seatHeightMetres": 0.45 },
      { "start": { "x": -2.275, "y": 0 }, "step": { "x": 0.65, "y": 0 }, "seats": 8, "seatHeightMetres": 0.45 },
      { "start": { "x": -2.275, "y": -0.9 }, "step": { "x": 0.65, "y": 0 }, "seats": 8, "seatHeightMetres": 0.45 }
    ],
    "entries": [{ "x": -3.075, "y": 1.7 }]
  }
}
```

This is a **draft proposal**, not accepted seat coordinates. Measure actual chair/bench locations and entry ramps against every accepted picture before changing seating review to `approved`. Coordinates are local metres about the physical footprint centre; the actual view `headingDegrees` rotates rows, entry anchors and facing together. `seatHeightMetres` is the bench top: the renderer compensates for the existing adult/child character's actual source-rendered hip pixel offset. Optional seating `verticalPixelsPerMetre` calibrates bench elevation to measured art (default 32 world px/m); use it instead of changing physical bench heights to conceal a source-scale mismatch. Split banks at aisles; optional row `front` vectors support different orientations around a horseshoe. New seating needs exactly its catalogue capacity and at least one valid entry anchor. Metadata cannot replace checking the images or mean that missing source views are finished.

Completion states remain separate: generated source, candidate crops, reviewed art, imported library, and player-selectable angles. Existing four/single-view items retain their limited rotations and report missing yaw8 art. Character walk/swing/crowd sheets and large scene/portrait images have their own pipelines.

The initial runtime retained 26 historical native sets as 208 appended rows without creating new GPU atlas pages. Independent visual review subsequently held the gazebo's repeated corner camera and the owner's rejected tarp-shack clubhouse style: **24 are active, eight of the original 32 subjects are excluded**. All 208 historical rows remain stored so source IDs and prior saves still resolve. Their atlas UVs are shared; normal boxes are copied and yaw8 bounds come from each measured `AXIS_FOOT` record with yaw exactly -8. Normal road-lot rows and their boxes remain unchanged. The explicit whitelist, native/source pixel hashes and exclusion reasons are recorded in `src/game/object-eight-existing.json`. The other six owner-flagged subjects are both L-ranch variants, farmhouse-north, snack-bar, corner-store and house_4-north. This reuses selected runtime art, not newer held candidates. New approved native sets override their subject's lookup normally.

Implementation checks, 2026-11-07: TypeScript clean; both importer checks pass; the focused rotation/placement/road-heading/event/course tests pass. The neighbouring props-variety suite retains its pre-existing `desert-palm desert` assertion because it excludes the newer desert group; the same failure was reproduced from HEAD's original source. The sparse checkout's thumbnail test passes after including the construction/concept/landscaping/range masters. No full suite, build, browser or server was started for this change. Actual imported new art still needs its visual review and browser preview before release.

## Bulk catalogue memory and hard limits

The game already streams GPU atlas cells through a fixed residency plan. It does not put every full 2048px page on the GPU: default compressed texture budgets are 32 MiB at DPR 1 and 96 MiB above DPR 1; WebP/RGBA fallback deliberately uses four times those budgets. Every catalogue page does retain a coarse mip, down to 128px with the current five-level chain. Fine cells load only for visible/nearby sprites and evict by recency. Production KTX2 discovery reads the actual `ATLAS_PAGES`, including new object pages automatically.

Bulk imports still need shared batch packing. The low-mip texture is one array layer per page. Startup now rejects a page count above the actual GPU `MAX_ARRAY_TEXTURE_LAYERS`, or a minimum coarse set above its byte budget, before allocating invalid textures. It reports that reviewed sprites need packing into shared pages; it does not split texture-array banks or silently omit images. At 1208 pages, 128px low mips require 18.875 MiB compressed or 75.5 MiB RGBA, and 512px picking bits retain 37.75 MiB. At 2416 pages the minimum low set reaches 37.75/151 MiB, exceeding the DPR 1 budget even before streamed cells, and exceeds a device with 2048 array layers. Existing pages and every retained imported version also count. No particular GPU limit is assumed for the owner's machine.

The auxiliary image paths are now bounded: startup reads two picking-opacity pages concurrently and releases bitmap/canvas backing after packing the identical alpha bits; 2D ghosts keep two full-page image references in an LRU (about 32 MiB of decoded RGBA for 2048px pages), clearing them on game destruction; thumbnail source work starts only after real viewport intersection and runs at most two tasks concurrently. Missing opacity data never becomes an opaque rectangle that intercepts clicks. Browser image caches, ground textures and the existing streaming decoder's in-flight working set are separate; these limits are not a certified total process-RAM ceiling.

Preserve the full native masters outside GPU atlases. Before catalogue-wide import, batch several approved subjects into shared immutable pages, and pack at the game's calibrated display density rather than giving every small prop its own mostly empty 2048px page. Keep source/provenance and sprite IDs stable. A renderer bank rewrite is unnecessary until an efficiently packed catalogue demonstrably exceeds hardware layers; the explicit startup guard remains a hard cap meanwhile. Focused residency, visibility, alpha, atlas and thumbnail checks pass 23/23; typecheck is clean. No full build, benchmark or server was used for this review/follow-up.
