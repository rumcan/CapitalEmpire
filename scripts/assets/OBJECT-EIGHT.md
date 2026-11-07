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
  "pixelsPerMetre": 32,
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

Run:

```
node scripts/assets/import-object-eight.mjs --manifest INPUT.json --out NEW_VERSION_FOLDER
```

Cutting requires native alpha, four complete isolated subjects per sheet, clear gutters, and eight different native pixel images. Exact duplicate and mirrored crops fail. Each crop has the original sheet hash, cell rectangle, crop rectangle and output hash in its sibling provenance. All outputs start as candidates. The script never overwrites a version folder.

Review the images together for unchanged identity, doors/roof/materials, scale, geometry, alpha and upper-right sunlight. Review each crop's `anchor` in crop-local pixels and actual physical `headingDegrees`. When supplied in the input, anchors are measured relative to the full source CELL; cutting converts them to crop-local coordinates. An absent anchor or heading stays null and blocks integration. The current guide uses `turn_views.py --turn -8`: relative to normalNE=0, normal headings are 0/90/180/270 degrees and yaw8 N/E/S/W headings are **37/127/217/307 degrees**. This is the guide's actual minus-eight-degree geometry; it is different from 45-degree square-cardinal images. Keep the headings explicit for any guide with a different baseline.

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

The initial runtime also reuses **26 existing registered native sets** without creating new GPU atlas pages. Their 208 appended standalone IDs share the old atlas UVs; normal boxes are copied and yaw8 bounds come from each existing measured `AXIS_FOOT` record with yaw exactly -8. Normal road-lot rows and their boxes remain unchanged. The explicit whitelist, all eight native/source pixel hashes and six excluded owner review flags are recorded in `src/game/object-eight-existing.json`. The original eligible count was 32; both L-ranch variants, farmhouse-north, snack-bar, corner-store and house_4-north are excluded for existing angle/style flags. This reuses selected runtime art, not newer held candidates. New approved native sets override their subject's lookup normally.

Implementation checks, 2026-11-07: TypeScript clean; both importer checks pass; the focused rotation/placement/road-heading/event/course tests pass. The neighbouring props-variety suite retains its pre-existing `desert-palm desert` assertion because it excludes the newer desert group; the same failure was reproduced from HEAD's original source. The sparse checkout's thumbnail test passes after including the construction/concept/landscaping/range masters. No full suite, build, browser or server was started for this change. Actual imported new art still needs its visual review and browser preview before release.
