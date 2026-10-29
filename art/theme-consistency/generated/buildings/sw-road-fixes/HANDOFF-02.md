# SW repairs — second delivery

Adds three corrected camera-NE fronts for physical SW-facing streets. The first delivery's laundry/dormer/ranch remain unchanged.

| Library ID | Selected raw sheet / cell | New complete version | Calibration |
| --- | --- | --- | --- |
| `variation:gen-house-farmhouse-wrap-2b0eea83-plain:1` | batch-02-v2 / 1 | `variation-gen-house-farmhouse-wrap-2b0eea83-plain-1-4views-v3` | Estimated retention of old visible architectural height |
| `variation:town-grocery-46d5dc39-plain:1` | batch-03-v2 / 1 | `variation-town-grocery-46d5dc39-plain-1-4views-v2` | Estimated retention of old visible architectural height |
| `variation:town-hardware-bf36737f-plain:1` | batch-03-v2 / 2 | `variation-town-hardware-bf36737f-plain-1-4views-v2` | Actual ordinary single-leaf door100px±3 |

The farmhouse's visible48px fragment has its head hidden by the porch; it is not a full-door measurement. The grocery's93px observation is a tall glazed storefront leaf, which the gauge contract excludes. Neither is normalised to a supposed standard door. Their SHA-bound NE `nativeScale` values are explicit estimates: old rendered height multiplied by old alpha16 visible-height/native-height, divided by the new canonical alpha16 visible-height. Source measurements, reasons and formulas are recorded in `selection-02.json` and `art/building-views/measures.json`. Existing footprints and the other three views retain their exact layout.

`selection-02.json` and immutable `accepted-selection-02.json` bind approved IDs/cells, native sheets and per-cell geometry reviews. Complete exports live under `ready/`; only NE changes. Lossless component partitioning copies native RGBA without repainting, flipping, warping or resampling. Other unapproved cells remain excluded.

Preparation uses the same explicitly scoped command:

```powershell
node scripts/assets/prep-views.mjs art/theme-consistency/generated/buildings/sw-road-fixes/ready
```

Evidence is under `art/theme-consistency/reviews/sw-road-repairs-20261029/integration-02/`: actual game road before/after images, exact native/retained-file checks and compressed full library snapshots. All7423 IDs/order and7420 other logical records remain unchanged, including the first three repairs;9 retained native PNGs are byte-identical and3 crop RGBA arrays match. Zero browser page errors, typecheck and2 focused calibration checks pass. The view atlas remains37 pages. Additional SW-facing repairs remain pending.
