# Straight-on (8-degree) views of the corners-only buildings (T398, #1070)

The lead's animation runner painted the straight-on views of 49 buildings as 2x2 "axisturn" sheets (`F:/Art/newArt/animations/buildings/<id>/axisturn.png`, N E / S W, each building turned 8 degrees toward the sun,
late-afternoon daylight, sun at the upper right). **30 are in the game**, 15 are rejected with their reasons, 4 are not imported (`review.json`: `buildings`, `rejects`, `skipped`). Nothing here is owner-approved.

## What is in the game

Each reviewed building is an object-eight set (T375's format, as the Video Vault and the Arcade): `normal+yaw8`, eight pictures in the ring `NE N SE E SW S NW W` (the road's order).
- the four **normal** views are the building's own existing corner pictures, reused (`import-object-eight.mjs`: a per-view source `{ "reuse": "<library id>" }`; the set is `runtimeReuse`): aliases of the
  existing atlas cells, so the corners draw exactly as before and no pixel is stored twice;
- the four **yaw8** views (N, E, S, W; headings 37, 127, 217, 307: the building turned 8 degrees off square) are new atlas cells on two shared pages (`src/assets/object-eight/straight-views-20261109-v1`, 28 MB of lossless
  webp with mips, 120 pictures at 0.6 x display size).
On a screen-straight road (roads 1, 3, 5, 7) a lot draws the view whose front faces the street (`lots/preset-art.ts roadView`); the map-axis roads draw the corners as before. `world:house_0`, `_1` and `_3` also have the
old square straight-on set (T154), which still wins on straight roads until the turned views are preferred over it.

## How it was made (`scripts/assets/straight-views/`)

1. `cut_sheets.py`: `prep_sheet.py` keys and cleans each sheet pixel for pixel (faint haze and specks removed, solid alpha 252-253 to 255, an edge pixel takes the colour of the solid pixels beside it so no background
   colour survives, the four buildings kept as connected pieces and repacked into clean cells: nine sheets had a building running over the sheet's midline), then the lead's
   `D:/AI/chatgpt-bridge/import-native.py --kind axisturn --all-generated-views` archives it and cuts the four views (`turned/<N|E|S|W>.native.png`). An RGB sheet with a checkerboard baked in is not cut.
2. `contact.py` / `pair.py`: the review sheets. The reviewer compares each building's four existing corner views with the four new views at the scale the game would draw them, on the criteria of the issue: the
   same building (identity, materials, colours), the scale, the 8-degree turn, late-afternoon daylight. `review.json` holds the decisions and, per building, `cells`: **the guide's N cell is not always the
   building's front.** The game's N is the face on the NE corner's lower-left (the +y face), E the next quarter turn the corners take (the building turned counter-clockwise from above), so the four cells are rotated
   to fit (farmhouse, grocery and snack bar: the sheet's W cell is the N view).
3. `measure.mjs`: footprint (twice the half extents of the library's NE box), the corners' library display scale, the T375 footprint-box fit (`fit-box-silhouette.mjs`) on the four corners and the four straight
   views, the fit's bias removed with the corners (a corner's true camera scale is the native scale over its library display scale), the median of the four straight views, and the anchors refitted at that one scale
   (`measurements.json`: scale, anchors, IoU). Fitted, not owner-measured: the check sheets show each building on lots.
4. `build.mjs --prepare` writes `<slug>/input.json` (+ the padded sources) and cuts them; `--integrate` approves the manifests and runs `integrateObjects` (the batch packer).
5. `light.py`: how old the lighting of the existing corners reads against the new views (for T404's relight).

`src/` (the padded sources) and `cut/*.native.png` are regenerable and not committed (126 MB): they are archived at `F:/Art/newArt/animations/t398-straight-views/<slug>/{src,cut}`; the manifests and provenance stay,
with the sha256 of every crop and source.

## Still without straight-on views

See `review.json` `rejects` and `skipped`, and the lead's art list on #1070: the five `gen:house-*` types and six `variation:gen-house-*` houses (not in this batch), `world:house_5`, `town:laundromat`, the church,
gas shop, barber, post office, the drive-in sign.
