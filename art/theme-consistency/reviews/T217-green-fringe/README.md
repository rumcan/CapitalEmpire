# Accepted green and fringe integration proof

T217 #569, checked 2026-10-28 on branch lead/terrain-green-fringe-20261027, including main 8e7742d.

The new selectable option is **Putting green (fine turf)**, runtime ID `putting-green-finished`, source ID `painted:putting-green`: NEAR v1, MID v2, FAR v2. Fringe keeps ID `fringe`, all v1. Each has four independent paintings per detail set. Canonical source selections remain hash-bound through READY-MATERIALS.json; the green alias does not change its canonical bytes.

The game screenshots show a real hole built with New hole and mature sod, at 30%, 8% and 2% zoom on a DPR 1, 1600 x 900 screen. For review only, green and fringe were temporarily assigned these families in the browser. API writes were blocked, original choices restored, and no saved surface mappings changed. readouts.json records the actual selected families and authored bands. The Studio images show each accepted family's three native-aspect previews. No page errors occurred.

The initial seeded-hole screenshots were rejected as visual evidence because grow-in effects obscured the artwork; they are not included here.

Typecheck passes, and 24 focused importer/terrain tests pass. asset-verification.json records 72 canonical primary PNG/packed sizes, 511 source hash bindings, all 345 pre-existing packed files unchanged, 30 unselected family records preserved and the exact current surface file unchanged. The owner paintings and legacy pinned green remain selectable. No full suite/build ran under the daytime policy.

Limits: these prove asset selection and rendering, not every terrain visual. The MID game image has visible checkerboard/chunk differences in surrounding terrain; this import does not change those renderer effects. Current anchor settings produce about 3.67 full-tile areas at NEAR and 5.73 at MID/FAR across this viewport, exceeding the older two-to-four target at the latter zooms. Existing anchor settings were preserved. The small green at FAR is an honest map-scale view; Studio provides the larger source-art comparison.
