# Tournament kit (2026-11-07)

The newest generated golf art, imported into the game as reviewed eight-view sets (four corner views and four views turned 8 degrees) and
wired into play. Branch `lead/tournament-kit-20261107` (from `lead/eight-facing-runtime-20261107` at 1460eb2).

## What is in

| Art | Game use | Conditions |
| --- | --- | --- |
| Food truck, TV camera tower, broadcast compound, first aid tent, info and will-call booth, four-lane entrance gate, media centre, hole scoreboard, main leaderboard, concession kiosk | The Event tool's structures of those roles (`eventTypes`), replacing their stand-in pictures | budget and upgraded |
| Compact bleacher, 60 seats | The new `compactBleacher60` stand (tier 1), with measured seat rows (budget 5 x 12 benches, upgraded 6 x 10 seats) | budget and upgraded |
| Practice net, bag trolley | Range props (Props panel, New: Range) | one |
| Ball washer, ball bucket stand, ball dispenser, park bench, water tank stall, rope barrier, rope barrier corner, rope walkway, direction signpost, gold tee markers, hole 12 sign, course map board | The existing `newprop:*` props, now with eight facings (aliases, so placed props in saves keep working). Ropes, walkway, signs, map board and water stall have their own Props group, "Tournament dressing" | one |

36 sets, 288 views, packed into 3 shared atlas pages (`src/assets/object-eight/tournament-kit-20261107-v1`, 37 MB of mips).

## How it was made

1. Sources (read only): `F:/Repos/ce-wt/eight-facing-runtime-20261107/art/catalogue-completion-20261107/generated/`
   `golf-source-batch-01/candidate-source-bundle-v1`, `golf-source-batch-02/source-views-eight-facing-v1`, `compact-bleacher-60-*`.
   Copies sit here in `batch01/`, `batch02/`, `bleachers/` (PNGs not in git: E: holds `.git` and is nearly full).
2. Calibration (`calibration/`): the image model did not draw to the catalogue's footprints (the broadcast trucks would be 25 m long at
   30 x 20 m). Each subject got a realistic body size (`dims.json`: width, depth, height in metres). `fit2.mjs` sets the camera scale per
   sheet from the alpha height (rotation invariant), with the width as a check, and the anchor at the projected body centre. Headings use the
   clubhouse mapping: normal NE/SE/SW/NW = 0/270/180/90, yaw8 N/E/S/W = 323/233/143/53. `manifests.mjs` writes `manifests/*.json`.
3. Cut: `node scripts/assets/import-object-eight.mjs --manifest manifests/X.json --out cut/X` (per-view source files, new in the importer).
4. Review: `review/rev1-3.png` show every crop with its footprint (yellow), front edge (red) and anchor (cyan). All 36 passed.
5. Import: `node scripts/assets/import-object-eight.mjs --integrate-batch tournament-kit-20261107 cut/*/manifest.json` (shared pages at
   0.6 x display size).

## Holds and notes

- The seated pavilions (24/60/120) have no art yet; their cards say so and cannot be rented.
- The bleacher's seat rows follow the art's bench and seat counts but have not been watched with a seated crowd on a tournament day.
- Specialist golf vehicles (ambulance cart, shuttle, ice cream cart, ...) and the town cars and later-era houses were not imported here.
