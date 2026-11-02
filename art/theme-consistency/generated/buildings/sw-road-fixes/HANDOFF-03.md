# SW repairs — third delivery (2026-10-30)

This delivery adds nine approved camera-NE fronts for physical SW-facing streets to the six already delivered. Five SW targets remain with the art lead; this is not a claim that all twenty are finished.

| Library ID | Raw sheet / cell | New per-building version | Native calibration |
| --- | --- | --- | --- |
| `variation:ref-building-farmhouse-ef501a21-plain:1` | 04-v1 / 2 | v3 | Ordinary porch leaf60px±4 |
| `variation:expansion-rundown-house-a7c17683-plain:1` | 05-v1 / 1 | v3 | Estimated retention of prior architectural height;57px is an occluded fragment |
| `variation:gen-house-l-shape-north-79eba705-plain:1` | 05-v1 / 2 | v3 | Main pedestrian leaf88px±3; not garage opening |
| `variation:ref-building-house-dormer-north-6952cea5-plain:1` | 05-v1 / 3 | v3 | Estimated retention of prior architectural height |
| `variation:world-house_2-north-332663ab-plain:1` | 05-v1 / 4 | v2 | Estimated retention of prior architectural height |
| `variation:ref-building-house-cottage-fc52ce66-plain:1` | 06-v1 / 1 | v3 | Ordinary leaf73px±4 |
| `variation:gen-house-duplex-north-521714ac-plain:1` | 06-v1 / 2 | v3 | Ground-floor left leaf75px±4 |
| `variation:gen-house-splitlevel-north-63bc759e-plain:1` | 06-v1 / 3 | v3 | One residential slider panel76px±4 |
| `variation:gen-house-l-ranch-18552ce5-plain:1` | 06-v1 / 4 | v3 | Ordinary leaf71px±4 |

The two balustrade-hidden thresholds have no valid full-door reading. Actual-game size review also caught the rundown house's earlier57px reading as only the visible boarded leaf below the porchroof; its head is hidden. All three use explicit SHA-bound `nativeScale` estimates retaining preceding visible architectural height with alpha16 extents. The rundown correction preserves467.320855 gamepx of visible height (old476.73px display height ×447/456), giving nativeScale0.8574694592 for545px of new visible height. The artwork and owner baseline remain unchanged;57px is not treated as a standard door. Formulas/source measurements are in the selections and measures. The original `world:house_2` remains pinned to its unchanged v2: its north variation is a different ID.

The art lead explicitly accepted the L-shaped house's roof variation: its two dormers now sit over the garage. Other three source directions retain their older details. This accepted difference is not evidence that every direction has already been redesigned.

## Authority and preparation

`selection-03-delivery.json` binds the two explicit selections (`selection-03.json` and `selection-03-extension-06.json`) covering these nine IDs only. Their final authority is immutable `accepted-selection-03-delivery-v3.json`, which clarifies replaced-source failure labels and explicitly corrects the occluded rundown door observation. Both source-review hashes and calibration bindings were updated deliberately. Original WIP snapshots remain archived. Selected PNGs and approved native geometry are unchanged.

Each raw sheet contains four different subjects. Never interpret its four cells as four directions of one building. Native component partitioning copies original RGBA without painting, mirroring, rotation, shear or resampling; all nine crops match that partition exactly. Complete per-building folders under `ready/` have the exact library `id` in provenance, a corrected NE and byte-identical retained SE/SW/NW.

Use only the scoped preparation command:

```powershell
node scripts/assets/prep-views.mjs art/theme-consistency/generated/buildings/sw-road-fixes/ready
```

The source staging script intentionally rejects already-imported original versions. It is not a command to rerun against the finished delivery. Never omit the importer folder argument, which could discover unrelated pending art.

## Verification

Evidence: `art/theme-consistency/reviews/sw-road-repairs-20261029/integration-03/`. All7423 library IDs/order remain stable; all7414 non-repaired serialized records remain identical except repacked atlas coordinates, including the preceding six repairs. The27 retained native view PNGs remain byte-identical; corrected NE footprints preserve their preceding placement/collision geometry. Native crop equality and source/approval hash bindings are checked. The original house2 pin is preserved. Typecheck and two focused calibration checks pass; the view atlas remains37 pages.

The nine before/after pairs are actual game frames at30% and diagnostic prop scale1. Their lossless WebP files decode to exactly the original screenshot RGBA. `after-contact.png` crops those frames for road-angle review. `baseline-contact.png` is an additional actual-game contact using each item's runtime `baselineOf` scale; its `baseline-game.json` records those scales for physical-size review. These contacts are review composites, not generator input or shipped sprites. Both game runs reported zero page errors. Full native screenshot PNGs remain under `E:/ClaudeTemp/T283/`.

## Next phase, after all SW repairs

The owner then wants the other street-facing direction, called physical **SE**, as **new renders**, with sun fixed at **SCREEN UPPER RIGHT** toward LOWER LEFT. Never mirror a bitmap to obtain it.

Runtime auditing maps that direction to canonical **SE** (`unmirror(base,true)` / `turned(base,1)`, `flip:false`). Existing SE native pictures often show rear/service facades while NW pictures retain a front entrance. A geometric edge test alone is therefore insufficient: audit entrance/façade semantics and physical features before accepting each new render. An existing NW image must not simply be relabelled or mirrored.

The current staging tool is deliberately NE-only. A future SE delivery needs an explicit direction-aware equivalent that replaces SE and preserves approved NE/SW/NW, IDs/indices, owner calibration and footprints. Keep four distinct subjects per sheet and use genuine transparent backgrounds. No SE source or runtime change is included here; finish the remaining SW targets first.
