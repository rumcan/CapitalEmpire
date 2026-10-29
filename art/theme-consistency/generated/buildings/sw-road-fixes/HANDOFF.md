# SW street-facing repairs — first delivery

The next three approved repairs are documented separately in [HANDOFF-02.md](HANDOFF-02.md).

Only three corrected fronts are integrated in this delivery:

| Library ID | Selected sheet / cell | New complete version |
| --- | --- | --- |
| `variation:town-laundromat-43183f9e-plain:1` | batch-01-v2 / 1 | `variation-town-laundromat-43183f9e-plain-1-4views-v2` |
| `variation:ref-building-house-dormer-b4413f08-plain:1` | batch-01-v3 / 3 | `variation-ref-building-house-dormer-b4413f08-plain-1-4views-v3` |
| `variation:gen-house-ranch-long-a4ddd58c-plain:1` | batch-01-v3 / 4 | `variation-gen-house-ranch-long-a4ddd58c-plain-1-4views-v2` |

The physical SW street-facing front is camera **NE**. Each raw sheet contains four different buildings, not four directions of one building. Only the explicitly selected cells enter the game. Cottage and other held cells remain excluded.

`selection-01.json` binds exact sheet, canonical selection and geometry-review hashes. `ready/` contains complete per-building four-view native exports and exact game IDs in provenance. NE is the corrected native sprite; SE/SW/NW retain their original bytes. Lossless component partitioning separates silhouettes that cross nominal quadrants and preserves native RGBA without rotating, mirroring, warping or repainting.

The importer records actual ordinary-door leaf heights96/81/87px respectively (uncertainty ±3px). Storefront double doors are excluded. Hash-bound retained native scales and version-bound footprint scales preserve all unchanged views' exact geometry and anchors; owner curation is untouched.

Reproduce from this checkout:

```powershell
node scripts/assets/stage-sw-repairs.mjs art/theme-consistency/generated/buildings/sw-road-fixes/selection-01.json <source-checkout>
node scripts/assets/prep-views.mjs art/theme-consistency/generated/buildings/sw-road-fixes/ready
```

Staging intentionally requires the selected original versions, so the first command rejects an already-imported or changed source. The second command is the normal rebuild command. Never omit the scoped directory: a default source scan can import unrelated pending artwork.

Evidence: `art/theme-consistency/reviews/sw-road-repairs-20261029/integration-01/`. Actual game screenshots at30% use the same SW-facing road and positions before/after; no screenshot is a synthetic sprite scene.7423 library IDs/order remain stable;7420 other records preserve dimensions, anchors, boxes, quads and glows exactly. All9 retained PNG hashes and all3 native crop RGBA arrays match. Zero browser page errors. View atlas pages decrease41→37 after deterministic repacking. Source geometry follows the root-approved2.25° painted-art tolerance; the dormer is close to that limit.

This delivery does not claim that all SW-facing buildings are repaired. Subsequent approved batches need their own immutable selection snapshot, native calibration and live road proof. Other directions are retained, not redesigned here.
