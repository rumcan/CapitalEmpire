# cinderlinks-map: add paths and buildings to a course

Cinderlinks is an isometric golf game played on real courses (woodhill, rondebosch, magnolia-national) built from OpenStreetMap data. This tool lets you
add **cart paths / footpaths** and **buildings** to a course, and draw a **picture** of the course so you can check your work. The running game polls
`out/edits/<course>.json` every two seconds and redraws, so a change shows up in the game with no rebuild.

Run from the `cinderlinks` folder: `node tools/cinderlinks-map.mjs <command> ...`. Plain Node 18+, no installs.
Every command prints one JSON object: `{"ok":true,...}` or `{"ok":false,"error":"..."}` (exit code 1). Add `--pretty` to indent.

## Coordinates (read this first)

- **Game frame, in real metres:** the origin is the course centre, **x grows east, y grows SOUTH** (down on a north-up map). Everything the tool stores or
  prints in metres uses this frame. The game shrinks metres itself; never scale anything.
- **Lat/lon:** accepted by `where`, `add-path`, `add-building`, `set` and printed by `info`/`where`, once the course's centre latitude/longitude is known.
  The raw course files do not store it, so run `calibrate <course>` once (needs the network); it matches the hole lines to OpenStreetMap, then saves the
  result in `courses/edits/_centres.json`. Woodhill's centre is -25.816171, 28.315049 (the OSM relation centre).
- **Rotation:** `rot` is degrees clockwise from east as seen on a north-up map. A building's `w` runs along its own x axis after turning, `d` across.
- The 2-D lat/lon conversion is a flat approximation, good to a metre or two over a course.

## Files

- `courses/edits/<course>.json` is the source; the same bytes also go to `out/edits/<course>.json` when the folder `out/` exists. Writes are atomic.
- The file holds `{ "course", "v": 1, "features": [...] }`. A path is `{id, kind:"path", name, surface, width, pts:[[x,y],...]}`; a building is
  `{id, kind:"building", name, at:[x,y], w, d, h, rot, roof, wall, roofColour, floors}`. Imported features also carry `"src":"osm/<way id>"`.
- Picture default: `out/edits/<course>-map.png`.

## Commands

| command | what it does |
|---|---|
| `help` | the commands as JSON |
| `courses` | course ids, names, places |
| `info woodhill` | centre, bounding box, every hole (par, length, tee, pin in metres and lat/lon), shape counts, added features |
| `where woodhill --x 0 --y 0` (or `--lat -25.8161 --lon 28.315`) | converts both ways; says whether the spot is green/tee/bunker/water/fairway/rough, the nearest hole with distance to its tee and pin, and the ground height in metres (from the course's height grid, `null` if outside it) |
| `calibrate woodhill` | finds and saves the centre lat/lon (network) |
| `add-path woodhill --pts "-40,478 20,470 90,452" --width 2.4 --surface gravel --name "cart path, hole 1"` | `--latlon` makes the points "lat,lon". Surface: gravel, concrete, dirt, sand. Refuses points more than 300 m outside the course's box. Returns the feature, its id (p1, p2...) and length |
| `add-building woodhill --at "-10,505" --w 30 --d 16 --h 6 --rot 15 --roof gable --wall "#e8dcc0" --roof-colour "#8a3b2a" --floors 2 --name Clubhouse` | w and d 2 to 120, h 2 to 20, roof gable/hip/flat, floors 1 to 4. `warnings` says if its centre is on a green, tee, bunker, fairway or water |
| `list woodhill` | the added features in full |
| `remove woodhill b1` | remove one |
| `clear woodhill --yes` | remove all |
| `move woodhill b1 --dx 10 --dy -5` | shift by metres (x east, y south) |
| `set woodhill b1 --roof hip --floors 3 --at "x,y"` | change any field (`width surface name pts at w d h rot roof wall roof-colour floors`), validated as on add |
| `import-osm woodhill [--dry-run]` | fetches paths (golf=cartpath/path; highway path/footway/service/track/cycleway/pedestrian) and buildings (building=*) inside the course box from the public Overpass API and adds them. Safe to repeat: ways already imported (by `src`) are skipped. `--dry-run` only counts. A network failure gives `{"ok":false,"error":...}` (Overpass is often busy: wait a minute and try again) |
| `map woodhill [--out f.png] [--px-per-m 1] [--bbox "x0,y0,x1,y1"] [--grid 100]` | north-up PNG: rough dark green, fairways lighter, greens brightest, tees, sand bunkers, blue water, white tee-to-pin lines with the hole number (yellow) at each tee, grid with game-metre coordinates on the edges, your paths at true width (at least 2 px, id beside the first point), buildings as turned rectangles in roof colour with an outline and their id beside them. Returns the file path, size and box drawn. For detail use `--bbox` and `--px-per-m 4 --grid 20` |

`import-osm` details: surface from the `surface` tag (asphalt/concrete/paved give concrete; gravel/fine_gravel/compacted give gravel; dirt/ground/earth give dirt;
sand gives sand; otherwise gravel); width from the `width` tag, else 2.4 (cart paths, service roads, tracks) or 1.6 (footpaths). Buildings use the
minimum-area rectangle of the outline (its centre, size and turn), height from `height` or `building:levels` x 3.2, else 4.5, and are clamped to the size limits.

## Worked example: the clubhouse and the cart path of hole 1 at Woodhill

1. `info woodhill`: note hole 1 (tee about -46.8,484.8; pin about 262.1,371.7) and the bounding box.
2. `map woodhill` and read the PNG; zoom with `map woodhill --bbox "-200,380,320,520" --px-per-m 4 --grid 20`. Compare with any reference photos you have.
3. Fast route: `calibrate woodhill` (once), `import-osm woodhill --dry-run`, then `import-osm woodhill`. Hand route:
   `add-path woodhill --pts "-40,478 20,470 90,452 150,430 210,400 250,378" --name "cart path, hole 1"` and
   `add-building woodhill --at "-10,505" --w 30 --d 16 --h 6 --rot 15 --floors 2 --name Clubhouse`.
4. `map woodhill` again and check that the features sit where you meant (not in water; read any `warnings`). Fix with `move` / `set` / `remove`.
5. The game shows the change within two seconds. Nothing to rebuild.

## Rule about reference photos

Reference photos and maps found on the web are looked at **for layout only** (where the clubhouse is, how the path runs). Never copy a photo, or trace
pixels from one, into the game; the tool only stores numbers you derived. OpenStreetMap data is (c) OpenStreetMap contributors, ODbL 1.0.
