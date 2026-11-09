# Real golf courses from OpenStreetMap (T340, #967): stage 1 findings and the stage 2 build, 2026-11-08

> **Credit:** the data is © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright). The game must show
> "© OpenStreetMap contributors" on its credits screen (and on the card of any real course it builds); a checked-in fixture of the data stays
> under the ODbL with that credit in its header. The script's outputs are not committed.

## What stage 1 built
`scripts/dev/osm-course.mjs "<course name>" [--country za] [--list] [--pick N] [--osm way/ID] [--refresh] [--out DIR]` (plain Node 22, no installs):
1. Nominatim search for the name (`leisure=golf_course`; `--list` shows the hits, `--osm way/ID` skips the search).
2. **One** Overpass query: the course boundary as an area, then inside it every `golf=*` feature, `natural=water`, streams, rivers and ditches,
   `natural=wood` / `scrub` and `landuse=forest`, as geometry.
3. `E:/ClaudeTemp/T340/<slug>.json`: the features in **metres, x east and y north of the course centre** (the middle of the boundary's bounding box;
   a local equirectangular projection, error well under 1 m per km), grouped by kind (`tee fairway green bunker water_hazard lateral_water_hazard rough
   driving_range hole cartpath path pin water waterway wood other`), each with its OSM tags; areas as `polys` (outer and inner rings, multipolygon
   relations joined), hole lines and paths as `line`, pins as `pos`. `meta` holds counts, every `golf=*` value seen, and the analysis below.
4. `E:/ClaudeTemp/T340/<slug>.png`: top-down preview, coloured per kind, hole lines numbered, legend with counts (PNG encoded in the script).

Polite to the public servers: a descriptive User-Agent (no personal address), Nominatim at most one request a second, one Overpass query per course, raw
answers cached in `E:/ClaudeTemp/T340/raw/` (a rerun makes no request); on 429/5xx or a network error it waits (Retry-After, else 15 s) and retries once, on a timeout
or a second failure it moves to the next mirror (`overpass.kumi.systems`, `overpass.private.coffee`; `--timeout S` sets the wait per attempt, 150 s). Never a commercial
course-guide site or satellite imagery. The whole of stage 1 cost the public servers 10 Nominatim requests (6 names found), 8 requests to the main Overpass server (6 course
queries, one retry, one count check) and a few light probes of the mirrors (see below).

## Results (run 2026-11-08, one Overpass query per course)
| course | OSM id | size of boundary | tee | fairway | green | bunker | water | rough | cart path | hole lines | pins | woods |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **Old Course**, St Andrews | way/1019045811 | 1477 x 2014 m, 39.5 ha | 42 | 8 | 12 | 110 | 5 + 1 burn | 4 | 9 (+20 paths) | 18 | 18 | 21 |
| **Augusta National** (club) | way/871993734 | 1506 x 1756 m, 150.6 ha | 48 | 26 | 43 | 69 | 7 + 1 creek | 14 | 37 (+13 paths) | 27 | 27 | 115 |
| Rondebosch GC, Cape Town | relation/10698368 | 1345 x 1375 m, 42.1 ha | 34 | 21 | 18 | 41 | 4 + 1 stream | 0 | 0 | 18 | 18 | 0 |
| Mowbray GC, Cape Town | relation/1067677 | 1078 x 726 m, 49.3 ha | 64 | 19 | 18 | 45 | 9 | 0 | 0 | 18 | 3 | 0 |
| Milnerton GC, Cape Town | relation/3096148 | 947 x 2771 m, 53 ha | 66 | 19 | 19 | 45 | 7 + 3 lakes | 3 | 11 | 18 | 18 | 0 |
| Bloemfontein GC | way/7792831 | 2804 x 1209 m, 232 ha | 0 | 0 | 0 | 0 | 2 streams | 0 | 0 | 0 | 0 | 0 |

| hole ordering | Old Course | Augusta | Rondebosch | Mowbray | Milnerton | Bloemfontein |
| --- | --- | --- | --- | --- | --- | --- |
| hole lines with `ref` / `par` | 18 / 18 | 27 / 27 (18 + 9) | 18 / 18 | 18 / 18 | 18 / 18 | none |
| numbers 1..N, none missing or doubled | yes, par 72 | yes per course: 18 (par 72) + Par 3 Course 9 (par 27) | yes, par 72 | yes, par 72 | yes, par 71 | n/a |
| line starts on a tee polygon (within 15 m) | 18 | 27 | 18 | 18 | 18 | n/a |
| line ends on a green polygon | 18 | 27 | 18 | 18 | 17 (hole 17: 62 m off) | n/a |
| drawn tee to green | all | all | all | all | all | n/a |
| par 4/5 lines mostly over a mapped fairway | 15 of 16 | all | all | all | all | n/a |
| lines with a bend (aim point) | 1 of 18 | 11 of 27 | 9 of 18 | 12 of 18 | 7 of 18 | n/a |
| pins on a green | 18 (11 greens) | 27, all with the hole `ref` | 18 | 3 | 17 of 18 | n/a |
| greens used by 2 holes | 7 (double greens) | 0 | 0 | 0 | 0 | n/a |
| greens / tees on no hole line | 1 / 24 | 16 / 21 | 0 / 16 | 0 / 46 | 2 / 48 | n/a |
| **guess without hole lines**: nearest-first pairing right | 1 of 18 | 2 of 27 | 1 of 18 | 0 of 18 | 0 of 17 | n/a |
| nearest green 60 m or more away is the right one | 2 of 18 | 4 of 27 | 0 of 18 | 1 of 18 | 2 of 17 | n/a |

Preview images (local, not committed): `E:/ClaudeTemp/T340/old-course-st-andrews.png`, `augusta-national-golf-club.png`, `rondebosch-golf-club.png`,
`mowbray-golf-club.png`, `milnerton-golf-club.png`, `bloemfontein-golf-club.png`. They look like the courses: the Old Course's out-and-back loop with holes
1 and 18 sharing one wide fairway and the burn in front; Augusta's 18 holes with Rae's Creek at 12 and 13, the Par 3 Course and the two practice ranges;
the Cape Town clubs complete with fairways, bunkers, ponds and numbered holes; Bloemfontein only a boundary and a stream.

## What the data showed
1. **Hole lines (`golf=hole`, a line from tee to green with `ref`, `par`, often `name` and `handicap`) make the order exact** and exist on 5 of 6 courses. Their
   length is the playing length (Augusta's hole 1 comes out at 409 m, 447 yd) and the par totals come out right (72, 72 and 27 for the Par 3 Course). Of the 99 lines,
   all 99 start on a mapped tee polygon and 98 end on a mapped green polygon (the one exception is Milnerton's 17th); none is drawn green to tee.
2. **Guessing the holes from tee/green pairs does not work.** The next tee stands beside the last green, so the nearest green to a tee is nearly always the
   wrong hole's; a nearest-first pairing recovers 0 to 2 holes of 17 to 27 on every course. If hole lines are missing, `ref=` and `name=` on tees and greens
   are the only cheap link (Augusta: `ref` on 26 of 48 tees, 21 of 43 greens, 42 of 69 bunkers; Old Course: the hole numbers sit in `name` on 16 tees and
   10 greens, "7/11" on a double green; Mowbray: `ref` on 15 greens; Rondebosch and Milnerton have neither).
3. **One boundary can hold several courses.** Augusta's holds the Par 3 Course (refs 1..9 repeat). Hole lines carry the course in `golf:course:name` (Augusta)
   or `course:name` (Old Course), a different key per mapper; group by whichever is present.
4. **Tee boxes are several polygons per hole** (2 to 4; Mowbray and Milnerton tag them `tee=yellow|white|red|blue`, Augusta `tee=championship`). Extra tee
   polygons and greens on no hole line are the practice facilities.
5. **Rough and trees are mostly not mapped as such**: `golf=rough` has 0 to 14 polygons, woods exist only at the famous two (21 and 115). Rough is "the boundary
   minus everything else"; trees come from the game's own "Frame with trees".
6. **Features are big enough for 2 m tiles** (4 m2 each): bunker medians 17 m2 (the Old Course's pot bunkers), 45 to 127 m2 elsewhere; greens 360 to 435 m2 on the
   Cape Town clubs; their tee polygons 59 to 160 m2.
7. **Coverage depends on the place, not the course's fame.** All three Cape Town clubs tried are complete (Mowbray's tags say `source=coct-2015`, so it looks
   like an import of City of Cape Town open data); Bloemfontein has the boundary and nothing else (confirmed with a count query on its bounding box plus
   1 km: 0 `golf=*` elements). Nominatim found 6 of 10 names tried ("Huddle Park", "Fish Hoek Golf Club", "Zwartkop Country Club" returned nothing: the OSM
   spelling or `--osm way/ID` is needed). Milnerton shows ordinary slips: hole 17's green missing or misplaced and one pin off its green (its par total, 71, may be right).
8. **No problems from geometry**: the multipolygon fairways, ponds and course boundaries (Cape Town's are relations, Mowbray's has two parcels) all closed, no
   unclosed area ways, nothing skipped. A hand-made answer exercised the rarer cases: a node-only course, an unclosed way, a multipolygon with an inner ring,
   a sea-sized lake (skipped), a hole drawn green to tee (flagged).
9. **The public servers**: the main Overpass server answered every course (33 to 46 s for the three timed); once it said "at capacity" (502) and the retry 15 s
   later worked. **No mirror was usable that morning**: `overpass.kumi.systems` answered its status page but hung on every query (a 504, then silence, even for
   `node(1)`), `overpass.private.coffee` did not answer at all, and the other mirrors tried refused (OSM France 403, mail.ru 504, osm.jp refused, NCHC no DNS).
   The fall-over itself works (checked against two local fake servers: one hung, one 429 then 200), but it had nowhere to fall to. So fetch a course once and keep
   the JSON: the cache in `E:/ClaudeTemp/T340/raw/` is what makes reruns free.

## Verdict
**Yes: stage 2 can build a playable course from this data when the course has hole lines (5 of the 6 tried, including both famous ones and 3 of 3 Cape Town
clubs).** Tees, greens, fairways, bunkers, water, hole numbers, par and a playing line with aim points come straight from OSM; the rest are small, listable
fill-ins. **When a course has only a boundary (Bloemfontein) it cannot**: there is nothing to build holes from, and the honest result is "this course has no
mapped holes" (land and rough only, or a refusal). Two game-side questions: the **Old Course's 7 double greens** (one green, two holes) do not fit "everything
belongs to one hole" in the Course tool, and real holes lie closer than the 60 m corridor guideline (per course, 2 to 16 pairs of non-consecutive holes have lines
within 60 m of each other), so the validity checks must warn on an imported course, not refuse it.

## Stage 2 plan (the converter, then the game)
1. **A pure converter** `osmCourseToSpec(json, options)` (under `src/game/ext/`, no network), tested on a small checked-in fixture (3 trimmed holes of one course, ODbL
   credit in its header): in metres, x east / y north, to tiles (2 m, y flipped to the game's south-down), with the offset and scale stated. Real courses are 0.7 to 2.8 km
   across: every one tried fits the 4.1 km map at 1:1; if the playable land is only 2 km, scale uniformly (Milnerton 0.72) or crop to chosen holes, and say which.
2. **Choose the course**: group hole lines by `golf:course:name` / `course:name`; take the group the caller names, else the one with refs 1..18; offer the rest.
3. **Holes in order of `ref`**: par from `par` (else the game's rule by length: par 3 up to 230 m, par 4 up to 430 m, par 5 above), name, handicap. Tee point
   = the line's first vertex (flip a line the script reports as drawn green to tee; none of the 99 was); **aim points = the interior vertices that bend more
   than 10 degrees**; pin = the `golf=pin` on the green containing the line's end (the node's `ref`, else by position), else the green's centroid.
4. **Tees**: assign every tee polygon whose centre is within 15 m of a line's start to that hole; with `tee=` colours or by distance from the green set back, middle and
   forward markers; paint the rest as plain tee ground with no hole.
5. **Paint** with the course surfaces the paint tool already has (the borders, first cut and fringe come with the presets): rough over the whole boundary (T362: natural fescue, with a band of rough round the fairways, greens and tees), then `rough`
   polygons, fairways, tees, greens, bunkers, water (hazard polygons, `natural=water`, streams 2 to 4 m wide), cart paths and `golf=path` lines where mapped.
6. **Fill in and list for the player** when missing: a par 4/5 with no fairway gets a band along its line (about 28 m wide, inside the boundary); a line whose end is on no
   green gets a green of about 400 m2 there; a green with no pin gets one at its centre (Mowbray: 15 of 18); par from length; hole numbers from `ref`/`name` on tees and greens,
   else ask the player to number them (the hole strip already reorders); no holes at all: say so, do not invent them.
7. **Tests**: holes in order with a tee, a pin on a green and a par each; every feature inside the land; the fill-in list matches what was missing; the same fixture gives the
   same course twice.
8. **In the game**: a dev URL first (`?osmcourse=<fixture>`), then a "Real course" card. **Do not call Overpass or Nominatim from players' browsers** (T358 later did, for the search only, under the rules in its section below; both are for light,
   cached use; Nominatim forbids heavy and search-as-you-type use): ship a few pre-fetched, checked-in courses with the credit shown, and add more with this script.
9. **Screenshots**: a famous course and a Cape Town club built in the game beside their previews. No heights came with what was fetched (later: a public DEM for T026).

## For the owner to decide
- **Which less famous course to build first**: the Cape Town clubs are all complete; the cleanest is Rondebosch (18 holes, 18 pins, no slips), then Mowbray (3 pins) and
  Milnerton (a missing green). If the owner has a local club in mind, name it: the script needs only the name. Bloemfontein stays the "no holes mapped" test.
- **Which famous course**: Augusta (18 clean holes plus the Par 3 Course, woods, creek) is easier for the game than the Old Course (double greens, 8 shared fairways).
- **Land size**: whether the game's course land may be about 3 km across, or real courses are scaled.


---

# Stage 2 (built): Rondebosch and Magnolia National in the game

**Read this first:** the map is **2 km** (`MAP = 1024` tiles of 2 m in `src/game/iso.ts`), not the 4 km CLAUDE.md and the stage 1 numbers above assume.
Rondebosch (688 x 610 tiles, 1376 x 1220 m) and Magnolia National (502 x 658) fit at 1:1, no scaling or crop; **Woodhill's land is 1079 x 583 tiles, wider than the map,
so the game scales it to 90%** (see Woodhill below). But **no generated
valley can host them**: in 12 seeds there is no river-free 500 x 500 window, and every 700-tile window has about 30,000 water tiles (rivers, creeks, banks). So a
map-data game is laid on the **flat plain** (`boot.ts flatTerrain()`; the save's `golf.osm` makes `load()` use it): the land in the middle of the map, 24+ tiles
from every edge, and the clubhouse parcel, car park and drive on the side of the land nearest the first tee (a real clubhouse stands by the first tee: the parcel on the far
side was a kilometre's cart ride from it), the entry road from the map's edge on that side (the terrain's highway enters there; `golf.osm.entry` saves the point). The range
start cannot take a 700-tile course (its county road, parcel and town window need the middle of the map), so the game has the **old start's rules** (no `start`: the
tournament comes with the season, the clubhouse and car park are already placed).

## What was built
| piece | file |
| --- | --- |
| the converter `osmCourseToSpec(json, opts)`: stage-1 JSON to a course spec, pure, deterministic | `src/game/golf/osm/convert.ts` (+ `geom.ts`, `types.ts`) |
| the raster `paintSpec(grid, spec, ox, oy)`: the spec into the course grid's 1 m cells | `src/game/golf/osm/raster.ts` |
| the plan `planOsmGame(spec)`: land, clubhouse parcel, car park, road, drive, golf state, grid | `src/game/golf/osm/start.ts` |
| the shipped courses and their loader (a JSON chunk each; no network); `specOf` scales a course that does not fit the map | `src/game/golf/osm/index.ts`, `data/*.json` |
| the fixtures' maker (stage-1 JSON to a trimmed fixture) | `scripts/dev/osm-trim-fixture.mjs` |
| the engine: `?osmcourse=<id>` (a dev start: saving off), `newOsmGame`, `startRealCourse(id)`, `golf.osm` | `src/game/engine.ts`, `golf/mode.ts` |
| the credit: the Holes panel's course card, the gear menu, the new-game card | `src/ui/course/OsmNote.tsx`, `src/App.tsx`, `src/ui/golf/YouCards.tsx` |
| the "Your course" row on the Who-are-you card (Build your own / Rondebosch / Magnolia National / Woodhill): a real course starts a new game on it | `src/ui/golf/YouCards.tsx` |
| the shots script | `scripts/dev/osm-course-shots.mjs` |

## The converter's rules
- **The course**: hole lines are grouped by `golf:course:name` / `course:name`; the group with the most holes numbered 1..18 is built (or `opts.course`); the others
  are named in the spec and left out, and so are the features that belong to their holes (Magnolia: the Par 3 Course). One line per number 1..18, in order of `ref`;
  a number mapped twice keeps the first; more than 18 are dropped; refs that are not 1..n are renumbered; every one is a warning.
- **Orientation**: a line drawn green to tee is turned round. Tee = the line's start; aim points = the interior vertices that bend more than 10 degrees (at least 25 m
  apart and from the ends, at most 4); green = the green polygon the line ends on (or is within 25 m of); pin = the `golf=pin` node on that green (the one that carries
  the hole's number wins a tie), else the green's middle.
- **Tees**: every tee polygon goes to the hole line whose start is nearest (within 80 m); the line's start tee gets the white (middle) marker, one farther from the pin the
  back marker, nearer ones the senior and forward markers; `tee=` colours are kept when every tee of the hole has a different one. The game works par out from the
  back tee's length (golf/holes.ts parFromLength: 3 up to 230 m, 4 up to 430 m, 5 beyond), so a marker is moved within its tee to the spot that gives the mapped par,
  and a back set that would change it stays plain tee ground. Where no spot does, `par-differs` is a warning (Magnolia's holes 5, 10 and 11: 450 to 482 m "par 4s" the game
  calls par 5, so the game's par is 75 where the map says 72; the new-game card says both).
- **Fairways** go to the hole line they run along (the most samples inside), bunkers and water to the nearest line within 90 m (hole 0 beyond); features of another course's
  holes are left out. Waterways become bands 2 to 6 m wide (a `width` tag wins) unless they run inside a mapped water polygon; a tunnelled or culverted one is not drawn.
- **Fill-ins**, each listed in `spec.fills`: a green of about 400 m2 where a line ends on none, a tee of 14 x 8 m where it starts on none, a fairway band 28 m wide along a
  par 4 or 5 whose line runs over (almost) no fairway (laid over rough only, so inside the boundary and under everything else), a pin at the green's middle (none mapped, or
  the mapped one lies off its green), par from length (none tagged). **Rough**: T362 changed this: the boundary is the course's wild land (natural fescue, or the desert's ground) with a band of rough round the fairways, greens and tees, and the mapped `golf=rough` polygons stay rough (the section on the course's ground, below). Nothing is made up for a course
  with no holes (Bloemfontein): the spec has none and says `no-holes`.
- **Warnings, never refusals**: holes closer than the 60 m corridor guideline (the game's own `deriveHoles` rule), a long walk to the next tee, a double green (the
  green belongs to its first hole), par differences, other courses, renumbering.
- **Paint order** (a later surface over an earlier one): wild land (the boundary; T340 had it rough), mapped rough, fairway, bunker, water, tee, green, then the band of rough (T362). Water leaves greens and tees alone, so a pin or a tee marker is never
  under water; the planting month stays 0 (established: the course is not growing in). Cart paths and woods are not imported (trees: the game's own Frame with trees).

## Results
| | Rondebosch | Magnolia National (the 18 of the Augusta National club boundary) | Woodhill (scaled to 90%) |
| --- | --- | --- | --- |
| holes, par as mapped / as the game works it out | 18, 72 / 72 | 18, 72 / 75 (holes 5, 10, 11) | 18, 73 / 72 (hole 2) |
| length (tee to pin along the aim points) | 5685 m | 6832 m | 5659 m (6290 m at true size) |
| land | 688 x 610 tiles | 502 x 658 tiles | 976 x 529 tiles (1079 x 583 at true size) |
| fill-ins | none needed | none needed | none needed (one tunnelled stream not drawn) |
| warnings | 20 close-hole pairs | 15 close-hole pairs; the Par 3 Course (5 holes in the box) named and left out | 2 close-hole pairs, the scale, 1 par difference |
| fixture | 36 kB: 34 tees, 18 greens, 21 fairways, 41 bunkers, 4 water | 97 kB: 36 tees, 34 greens, 23 fairways, 55 bunkers, 6 water, 14 rough, 1 creek | 60 kB: 35 tees, 21 greens, 20 fairways, 43 bunkers, 8 water, 23 rough, 5 waterways |

### Performance (the bench)
`node scripts/perf/bench.mjs http://localhost:5189/ --start town --osmcourse <id> --size 1` on a dev server (`--seed 1` instead of `--osmcourse` for the hand-made nine, which comes with its stamped town),
1600 x 900, RTX 3080, run on the merged branch. The budget is 8 ms of main thread a frame (GAME-PLAN 2.3). Main-thread time a frame while the camera pans (average / p95):

| | 30% pan | 15% pan | props | heap |
| --- | --- | --- | --- | --- |
| hand-made nine with its town (pop 1001) | 1.19 / 1.6 ms | 1.52 / 2.1 ms | 12930 | 351 MB |
| Rondebosch | 1.04 / 1.5 ms | 1.38 / 2.1 ms | 33 | 201 MB |
| Woodhill (90%) | 1.18 / 1.8 ms | 1.33 / 1.9 ms | 33 | 262 MB |

A second run with `--zooms 30,30` (the 30% pan twice): Rondebosch 1.60 / 2.3 ms, then 1.66 / 2.5 ms; Woodhill 1.48 / 2.2 ms, then 1.29 / 1.9 ms. The ground cache peaked at 47 to 59 MB and the ground plus the
tile pictures at 183 to 188 MB on all three (the hand-made nine too: the tile cache sits at its cap). **Frames a second swing from run to run** (the PC is shared with other agents' browsers and servers; the lock orders only the heavy jobs): Rondebosch 40 fps (30%) and 51 fps (15%) on the first run, 19 and 47 fps in the 30% pass twice on the second; Woodhill 30 and 45, then 19.5 and 41; the nine 54 and 53. The first pass over the
course after the fitted overview decodes about 90 tile pictures (the near ground textures; the nine's settle had already done most of its own) and the second pass none (the warm pass held 47 fps on Rondebosch and 41 on Woodhill with the main thread at 1.3 to 1.7 ms: what limits the frame rate there is not the main thread).

### Woodhill Country Club, Pretoria (OSM relation/5974410)
- The club has **no `leisure=golf_course` polygon** in OpenStreetMap: the course area is the "Woodhill Golf Estate" `landuse=residential` multipolygon (2277 x 1535 m, 198.7 ha), found with
  `--osm relation/5974410`. **That boundary includes the estate's housing. It is kept as course land for now** (the rough is laid over it, houses and all) and is not cut out; a later
  pass could subtract mapped buildings. Everything else is mapped: 18 hole lines (numbered, par on all, each from a tee to a green), 18 pins, 35 tees, 20 fairways, 21 greens, 43 bunkers, 23 rough,
  water, 5 waterways, woods, 9 cart paths, a driving range and the clubhouse (woods, cart paths and the range are not imported).
- **Scaled to 90%.** At true size the holes' land is 1079 tiles (2158 m) wide and the map is 1024 tiles. `specOf` (osm/index.ts) tries true size, then the largest whole percent at which
  `osmFits` holds (`osmScaleFor`), and `osmCourseToSpec(json, { scale })` multiplies every coordinate (the 40 m margin and what is made up keep their size). The clubhouse parcel then goes
  on the north or south side (the land is 529 tiles tall, so there is room), where the wide land leaves it none east or west. The scale is in the spec (`scale`), a warning (`scaled`), the save (`golf.osm.scale`), the Holes panel's course card and the
  new-game card. Hole lengths shrink with it, so the game's par from length can move: hole 2 is **mapped par 4 at 189 m** (par 3 by the game's rule at true size, and 173 m scaled). The mapped par (73) is
  kept in the spec; the game shows its own (72).

## Adding a course
1. `node scripts/dev/osm-course.mjs "<name>" [--country za]` (stage 1: the JSON in `E:/ClaudeTemp/T340/`; one Overpass query, cached).
2. `node scripts/dev/osm-trim-fixture.mjs <that json> --id <id> --name "<name the game shows>" --place "<city, country>" [--course "<course name tag>" --rename "<real>=<game name>"]`
   writes `src/game/golf/osm/data/<id>.json` with the credit in its header. Real brand names stay out of the game: rename a famous club.
3. Add it to `OSM_COURSES` in `src/game/golf/osm/index.ts` (holes, par, and `scale` when `specOf` scales it: the test checks them against the loader) and run `tests/golf-osm-course.test.ts`.

## Left for later
Cart paths and `golf=path` lines (the Course's paths are the road tool's), trees from the data (`natural=wood`; today the game's own Frame with trees, `?frame=1` in dev),
(heights from a public DEM: done in T357, below) cropping a course to chosen holes instead of scaling it, cutting the housing out of Woodhill's estate boundary, the Old Course's double greens (one green, two
holes), the Par 3 Course. (The course picker that takes a name, and Wingate Park's holes worked out from its fairways, came back with T358: the next section.)

# Real ground height (T357, #999): the land under a map-data course

The owner, 2026-11-08: "see if theres a way to add the height map to the real world course imports." A real course has 20 to 90 m of relief (Woodhill 91 m, Magnolia National 57 m,
Rondebosch 27 m); the game's own course height (`ext/course-height`: a 4 m grid held to +-3 m) is the player's shaping layer and cannot hold that. A map-data game now has a second,
smooth layer under it, the **land height** (`golf/osm/land.ts`), on the same 4 m lattice, and everything that reads the ground reads **land + course height**.

## Where the heights come from at play time (the decision)
| | where | how big | when it is read |
| --- | --- | --- | --- |
| a shipped course (Rondebosch, Magnolia National, Woodhill) | the fixture's `height` (a packed grid on the stage-1 metres frame, with its source and credit) | 19, 52 and 27 kB | when the course is picked: no request |
| a downloaded course (T358's search) | AWS Terrain Tiles, fetched by the player's browser when Build this course is pressed with **Real ground height** ticked (`dem.ts`) | 4 to 16 tiles of about 90 kB, once | the tiles are kept in the library; nothing is asked twice |
| a game on either | the save (`golf.land`): the laid land, whole | about 75 kB (2 cm units, deflated) | at load; no fixture, library or network |

**The save keeps the land, it does not refetch it.** A refetch at load would need the library (another browser profile has none), the network, and the same smoothing as the day the
game was made; the land of a game under way must not change under the player's shaping. The cost is about 75 kB of base64 in the save (the save is already gzip JSON; the land is
already deflated), written from a copy packed once when the course is laid (`landPack`), never repacked. A save from before T357, and a course with no elevation data, has no `golf.land`:
flat ground, exactly as before. The library keeps the raw tiles (like the raw Overpass answer: a better smoothing later improves old downloads), not the grid.

## The data
- **Source:** Tilezen's "terrarium" PNGs on AWS Open Data, `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`: free, no key, public. Height in metres is R*256 + G + B/256 - 32768.
  Zoom 15, about 4 m a pixel at golf's latitudes, but the data is as good as the country's source: SRTM (30 m radar, with a faint diagonal striping and the treetops and roofs in it) in South
  Africa, USGS 3DEP (10 m) in the United States, lidar (2 m) in England.
- **CORS, checked 2026-11-08** (`curl` with an Origin header on a real tile): a GET and a preflight both answer `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET`, and
  `Access-Control-Expose-Headers: x-amz-meta-x-imagery-sources`, so the browser reads the tile **and what it is made from** (`srtm/S26E028.tif` under Woodhill, `ned13/imgn34w083_13.tif`
  under Augusta). A plain GET with no custom header sends no preflight (a custom header would not be allowed: `Access-Control-Allow-Headers` is not given). The source decides the smoothing and the credit.
- **Smoothing:** a Gaussian, **sigma 25 m for SRTM** (about 60 m across at half height), 8 m for 3DEP, 5 m for lidar (`terrarium.ts` SOURCES). Measured on Woodhill: the ripple the radar leaves
  (wavelength about 60 m) is cut to 3% of its height, an 800 m landform keeps 98% of its own; the root-mean-square slope falls from 10.5% unsmoothed to 8.6% at 15 m and 7.5% at 25 m. At 15 m
  the previews still showed the diagonal grain; at 25 m it is gone and the landforms (the NE hill, the stream valley through holes 9, 13 and 18) stay. The lead's sketch said "about 30 m".
- **The fixture lattice:** a smoothed grid has nothing under about 2 sigma, so it is kept at a **16 m lattice for SRTM and 8 m for 3DEP** (`packStepOf`), not 4 m, and read through a
  Catmull-Rom cubic (continuous slope: no facets in the light; a plane comes back exact). 16-bit units of 1 cm from a base, each sample as its difference from the planar prediction
  (left + up - up-left), zigzagged into a low-byte plane and a high-byte plane, raw-deflated, base64: Woodhill 27 kB at 16 m (80 kB at 4 m), Magnolia 52 kB at 8 m (120 kB at 4 m).
- **The window:** the land, a 400 m skirt round it, and the smoothing's reach: the holes' box and 440 m on every side in a fixture; the spec's land and skirt in a download.

## How the land is laid (`layLand`)
1. The ground is read at the centre of every course-height sample (4 m) through the spec's frame (`originM`, `scale`: a tile of the spec is at `((originM[0] + 2x) / scale, (originM[1] - 2y) / scale)` metres of the stage-1 frame).
2. **Relative to its own mean:** the samples under the land average 0, so the plain stands at the course's average level and the baseline is the same wherever the course is put.
   The elevation 0 stands for is kept (`base`; Woodhill 1459 m).
3. **In true proportion:** a course scaled down to fit the map (Woodhill, 90%) has its heights scaled by the same factor, so a slope in m per m is the real hill's (the slope the ball reads).
4. **A skirt of SKIRT_T = 200 tiles (400 m)** beyond the land: the real ground goes on and is multiplied by a smoothstep that is 1 at the land's edge with no slope, so the slope is continuous
   across the edge (tested: within 3% where the hill is 14% steep), there is no cliff and no line in the light where the land ends, and it is exactly 0 at 400 m. Where the land
   is within 400 m of the map's edge (Woodhill is 24 tiles from it) the skirt is clipped by the map.
5. **Level features:** a green (a pad of 3 tiles past its edge, then 5 tiles of feather), a tee (2 and 4) and a pond (2 and 4) take the mean of the ground under their pad, so the 30 m data's
   noise is never on a green and a pond is never tilted; the feather blends the bank into the slope round it. Water first, then tees, then greens (a green beside water stays level).
6. **The greens' own tilt (`designGreens`):** every green a hole plays to gets the game's own gentle tilt in the **course height** layer (the player's shaping layer, so the Height tool can
   change it): a plane through its middle, 1 to 2% (seeded by the course and the hole), rising away from the approach (the last aim point, else the tee): front low, back high, as the hole
   shaping lays a built hole's green (`ext/hole-ground` HOLE_GROUND.green). A green no hole plays to has none; a double green is tilted for its first hole. The break grid (T319) and the putts read it.
   A course with no elevation data still gets its greens' tilt.
7. `?land=0` (dev, and the bench's `--land 0`) leaves the land and the tilt out: the flat plain as before T357.

**A course placed into a running game (T356, `layRealCourse`)** gets its ground too (`Game.layPlacedLand`): `layLand(turned, land, { x: plan.ox, y: plan.oy }, { frame: turnedFrame(spec, turned, deg) })`
reads the land through the turn (the turned frame's tile is turned back about the middle of the frame and read in the converted spec's frame: the heights turn with the course; tested: the rise from tee to pin is
the same at 60 degrees), `clearLandIn` takes away what an older course laid inside the new rectangle (the skirts round it simply add), `addLandPatch` adds the new patch, and `designGreens` tilts its greens. The
land comes with the course: a shipped one from its fixture (`startRealPlace` loads it), a downloaded one from the picker's **Real ground height** box (**Place it in my map** goes through the same step as Build
this course, with the window that holds the land however it is turned: `landWindow(spec, SKIRT_T, true)`, a square about the land's middle, up to 16 tiles), and a downloaded one chosen from the menu's list only when the
library already holds every tile it needs (nothing is asked for from a menu). Without a land it is placed flat, with its greens' tilt. The patch's box and the greens' go to the workers (`courseHeightChanged`), the
save keeps the sum (`golf.land`).

## What reads it, and what does not
| reads land + course height | reads the course height alone |
| --- | --- |
| **the hillshade**: the workers get the land as its own layer (`landLightRect`, T388) beside the course height and light each by its own response (`heightLightGrid`'s `land`), so the slope light (T126: the sun at the upper right, shadows at 145 degrees) bakes into every chunk of the land as it does round a mound | the Height tool and its undo, the hole shaping (`ext/hole-ground`), the tee planner, the road flattening (`flattenRoadsIn`) |
| **the ball**: `ballHeight` (the roll's bend, a putt's break, the lie's slope: `slopeAt`, `crossSlope`, the break grid) | the course quality's slope checks: the steep green and steep fairway penalties, the shaping bonus, the pins' slope (`evaluateCourseHeightQuality`, `courseTerrain(field)`) |
| **the holes' rise and plays-like length** in the course stats (`coursestats.ts`, `HeightSampler`) | |

The slope checks judge the player's own layer: a real hill is not the player's to smooth (the layer is held to 3 m), so a steep real fairway is not marked down and "Smooth the steep
fairway" is not said of it; the rise and the plays-like length ("plays 316 m (-22 m)") are the real ground's. **Roads and cart paths follow the land**: the road tool lays flat
ribbons as ever, nothing flattens the land under them (`flattenRoadsIn` still flattens the player's layer), so a road across a slope is lit as the slope it crosses; house lots (T353) stand on the land as it is too (the estate levels nothing). Where the player shapes
the ground on a hillside the shaping sits on the land (a mound is 2 m on the slope).

## The real ground's light (T388, #1048): the hills read, gentle ground stays calm
The owner: "make the hills read" (Woodhill's 67 m hill showed as a subtle shading at the default Slope light of 1). **The cause was the response, not the strength.** The slope light's
gentle-ground gain (T263, `lightExag`: built for a fairway's 1 to 3% rolls) tilts the light's normal 0.38 at a 3% slope, 0.43 at 5% and 0.45 at 10%: flat from 4 to 10%. Under real ground
(median slope 6%, 90th percentile 13% on Woodhill) every slope from 3 to 15% therefore lit the same, by its direction alone: blotches of "facing the sun" and "facing away" with hard
edges, a gentle regional slope as strong as a hill's flank (the whole of Magnolia National 10% darker for it), and nothing to tell a hill from the plain. Doubling the strength (T357's idea)
doubled the blotches.
- **The land is lit by its own response** (`ext/course-height/light.ts` `landExag`, `LAND_EXAG` 6, `LAND_FLOOR` 0.3, `LAND_KNEE` 0.1): the tilt per slope grows with the slope, faint on gentle ground
  (0.05 at 2%, 0.27 at 6%) and 0.6 at 10%, 0.9 at 15%, 1.2 at 20%, so the light follows the steepness: a flank is lit and shaded in proportion, its crest rounds off, gentle ground stays near flat.
  `LAND_GAIN` 1.35 makes a land-dominated point's shade and lift 35% deeper than the same tilt on the player's ground (a steep flank has room to show). The shade's gentle-ground boost
  (`gentleDark`) is for the player's rolls and is left off the land (a 3% slope facing away darkened a whole course by 6%).
- **Two layers, two responses, one surface.** `heightLightGrid(h, box, res, land)` takes the land as `LightLand` (the samples of its box, `landLightRect`): the surface for the cast shadows and the
  occlusion is the sum; the tilt is the course height's own (its gain, the player's rolls and a green's 1 to 2% tilt as ever) plus the land's (its response), the two added; a point's land share
  of the tilt sets how much of the amplitude boost it takes. No land (or a chunk out of its reach) lights every number as before (a test holds it). **The ball keeps the true ground**: only the
  light is split.
- **The workers get the layers apart**: `GroundCache.courseHeight(field, box, land)` sends the course height alone in the box of an edit, as ever, and the land layer (`{ t: 'land', rect }`: the box of
  everything that is not 0, about 1 MB, copied per worker) only when the land changed (a new game, a placed course, a load: the field and its rev), before the course message. The painter
  (`landL`) lights both in the chunk bake and the planner map.
- **The old light is an option** (the owner's rule: the old look stays): the gear menu's **Real ground hill light** (only in a game with land, on by default, kept across reloads) and `?landlight=classic|hills`
  (dev server; the bench's `--landlight`) light the land and the course height as one summed field with the gentle-ground gain, as before T388 (`classic`).
- **Measured** (the CPU reference `applyHeightLight` on a textured grass, the mean deviation of a pixel's luminance from the flat ground's, by the land's own slope; the old light against the new): Woodhill
  gentle ground (under 4%) 9.0% before, 2.9% now; middle slopes 11.8% before, 12.0% now; steep (over 10%) 11.9% before, 22.4% now (hills read twice as strongly, gentle ground a third as much).
  Magnolia National 7.7 / 11.2 / 11.9% before, 2.0 / 10.9 / 21.5% now; Rondebosch (a plain with lumps) 9.0 / 10.8 / 10.4% before, 2.5 / 9.0 / 15.1% now. The luminance spread of the whole land (5th to 95th
  percentile) is 0.36 before and 0.56 now on Woodhill; the best 120-tile windows 0.33 before and 0.60 to 0.62 now. The in-game shots, before and after, are in `E:/ClaudeTemp/T388/`
  (`scripts/dev/land-light-shots.mjs`: each course in both lights at 30% and 15%).
- **The skirt is longer** (`SKIRT_T` 200 to 320 tiles, 640 m): where the real ground beyond the land falls below the land's mean (Woodhill's valley through holes 9, 13 and 18 leaves the NW edge 35 m under its
  mean) the skirt has to climb back to the plain, and over 400 m that climb was a 13% flank all round, a rim the light drew as a band of shade. Over 640 m the steepest climb is 8% and the share of the skirt steeper
  than 8% falls from 24% to 15% on Woodhill (24% to 17% on Magnolia National). The **data window stays 400 m** (`WINDOW_T`: the shipped grids hold about 215 to 260 tiles beyond the land, a download is at most 16 tiles):
  past it the real ground is held at its edge value and faded out with the rest, so nothing more is fetched and the climb is smooth. The map's 1024 tiles bound it where the land is wide (Woodhill is 24 tiles from
  its west and east edges, and the skirt is clipped there as before).
- **Not done**: the optional "Add the real ground to this course" action for a course built flat or before T357 (it would fetch the tiles for an imported course); taking the regional plane out of the
  light as well (the land's response makes it small: Woodhill's 2.9% regional slope tilts 0.08, a 4% shift of tone, Magnolia's 3.6% a 3%).
- Tests: `tests/ext-course-height-land-light.test.ts` (12: the response, gentle ground and a hill, no land as before, the player's layer on the land, the old light, the seam, the land's cubic, the land layer
  as given, the skirt, the plumbing and the way back).

## Credit
- **Tilezen's required attribution** (github.com/tilezen/joerd docs/attribution.md, which says to credit each source the data draws on): for SRTM, 3DEP and GMTED2010 "United States 3DEP
  (formerly NED) and global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey"; England's lidar "United Kingdom terrain data (c) Environment Agency copyright and/or database
  right 2015. All rights reserved"; the other national sources have their lines in `terrarium.ts` SOURCES. The shipped courses are SRTM (Rondebosch, Woodhill) and 3DEP (Magnolia National).
  SRTM and 3DEP are in the public domain; USGS asks for the credit.
- **Where it shows:** the gear menu's credits, a line beside the OSM one ("Credits: real-course ground height ..." with the tiles' credit in its tooltip: "Terrain tiles: Tilezen / Mapzen on AWS
  Open Data"); the course card (Holes panel) says "Real ground height (SRTM, 30 m): 74 m of rise across the land" with the credit as its tooltip; the picker's Featured list names the source of each shipped
  course; a downloaded course's preview has the Real ground height box and says where the data is from. The fixtures keep the credit in their `height`.

## Being polite to the elevation server (`dem.ts`)
One GET a tile, one at a time, 250 ms apart (a `Gate`); a course needs 4 to 16 tiles; every tile is kept for good in the library's `answers` store under `dem:z/x/y` with its imagery source (an
elevation tile does not change; a second course that shares a tile does not ask for it), a tile in the library is never fetched again; a 429, 403 or 5xx stops the lot (`ServerBusy`: "The map servers are
busy: try again in a minute"), a 404 or no network is `DemUnavailable` (the card unticks the box and says why: Build then makes the course flat); Cancel stops it; nothing is sent unless the player builds
with the box ticked. In tests every request is a fake (`tests/golf-osm-land.test.ts`: the request count, the gate's pauses, the cache, the refusals).

## Checks
- `tests/golf-osm-land.test.ts` (34 tests; every request a fake): the terrarium decode through every PNG row filter; the sampling's alignment (north up, east right, a metre a metre: a tilted plane is read at its
  true slope) and the tile maths (Woodhill is in the tile the sketch cached); the smoothing (the 60 m ripple to under a tenth, an 800 m landform keeps 98%); the packing (within half a unit, a quarter of the 16-bit size);
  the credits; the shipped fixtures (their source, step and size); the land laid (relative to its own mean, true proportion, exactly 0 beyond the skirt, the slope continuous across the land's edge, no cliff; scaled courses keep
  their slopes; greens, tees and ponds level; the same twice; a turned spec reads the same ground turned); **Woodhill's NE high point is within 300 m of the tee of hole 5 or 6, hole 6 runs 22 m down the hill**, Rondebosch rises to
  the south west, Magnolia's 18th climbs 20 m; the greens' tilt (1 to 2%, front low and back high, level across, not doubled); land + course height (the ball's reading, the workers' rect, the course stats' rise and plays-like
  length, the lie's slope on a falling fairway); the save (packs and unpacks within 1 cm, `golf.land` through `normalizeGolfSave`, a land that does not decode is a flat course); and `dem.ts` (the request count, the 250 ms gate, the
  cache, a 429 stops the lot, a 404 or no network is "unavailable", Cancel).
- `tests/ui-osm-land.test.ts`: the picker's Featured lines, the course card, the credit.
- `node scripts/dev/osm-land-shots.mjs --base http://localhost:5188/ --out E:/ClaudeTemp/T357 [--course ...] [--look name:dx:dy:zoom]`: each course before (`?land=0`) and after, the overview, the middle zoom over the
  hole pair that runs over the most ground, a green, and the slope readings (the walk-on round's second shot, and a ball put 40% down a falling hole), with the game's state checked as it goes.
- `node scripts/dev/osm-search-shots.mjs`: T358's mocked run, now with the elevation tiles mocked too: Build with Real ground height ticked asks for each of the course's tiles once with a plain GET, the game has the
  land, the save keeps it (a reload asks for nothing), unticked it builds flat and asks for nothing.

## Performance (the bench, 2026-11-08)
`node scripts/perf/bench.mjs http://localhost:5188/ --start town --osmcourse <id> --size 1 --seed 1`, a dev server, 1600 x 900, RTX 3080, each twice: **lead/live** (01e2662, served from a copy of its tree: the bench of a branch
against the very tree it was cut from, T356 in it) against **this branch**. The budgets: 8 ms of main thread a frame (GAME-PLAN 2.3) and 192 MB for the ground plus the tile pictures. Main-thread time a frame while the camera
pans (average / p95, ms), the ground cache's bakes (median / p95 ms) and the ground plus tile pictures (peak MB):

| | | lead/live run 1 | run 2 | the land, run 1 | run 2 |
| --- | --- | --- | --- | --- | --- |
| **Woodhill** 30% pan | main thread | 1.35 / 2.0 | 1.30 / 2.0 | 1.34 / 2.1 | 1.80 / 3.0 |
| | bakes | 94 / 305 | 80 / 285 | 85 / 221 | 88 / 466 |
| | ground + tiles | 132 | 132 | 131 | 129 |
| Woodhill 15% pan | main thread | 1.38 / 2.0 | 1.53 / 2.5 | 1.71 / 2.5 | 1.33 / 1.9 |
| | bakes | 53 / 106 | 57 / 131 | 64 / 117 | 60 / 118 |
| | ground + tiles | 178 | 178 | 173 | 174 |
| **Rondebosch** 30% pan | main thread | 1.22 / 1.8 | 1.02 / 1.5 | 1.35 / 2.1 | 1.05 / 1.7 |
| | bakes | 64 / 130 | 58 / 143 | 118 / 334 | 55 / 137 |
| | ground + tiles | 185 | 185 | 186 | 185 |
| Rondebosch 15% pan | main thread | 1.37 / 1.9 | 1.44 / 2.2 | 1.24 / 1.7 | 0.95 / 1.4 |
| | bakes | 51 / 97 | 48 / 85 | 102 / 306 | 43 / 81 |
| | ground + tiles | 186 | 182 | 183 | 184 |
| average bake, all stages (ms) | Woodhill / Rondebosch | 41.2 / 31.8 | 40.3 / 29.6 | 38.8 / 68.5 | 41.7 / 31.6 |

**The main thread does not move** (the land is baked in the workers; the main thread gets one 1 MB array when a game loads and reads it for the ball): 0.8 to 1.8 ms average and 1.1 to 3.0 ms p95 on both sides (with the third runs below), against
the 8 ms budget, the spread between two runs of the same build as wide as the difference between the builds (the PC is shared with other agents' browsers: frames a second swing too, 27 to 53). **Memory is the same**: the ground plus the
tile pictures peak at 129 to 186 MB on both sides (the budget is 192), the heap 212 to 258 MB. **The bakes**: the land puts the slope light into every chunk of the course (it was in none), so a chunk's bake carries about
twenty-five canvas operations more (`heightLight`) and a few ms of the light grid's arithmetic; at 15% pan Woodhill's median bake is 60 to 64 ms against 53 to 57 (about 10% more), at 30% the same, Rondebosch's second run is level with
lead/live's. **Rondebosch's first run with the land is an outlier** (the average bake 68 ms, the median 118, against 32 and 55 in its second run and 30 to 32 in lead/live's two): it is shown as it came (the PC is shared with other agents' browsers, and the same build's second run is level with lead/live's; see the third runs below). The land adds nothing to the main thread, nothing to the memory, and about a tenth to the workers' bake.

**Third runs** (Rondebosch only, to re-test the outlier; the land's third run is on the tree after the second merge with lead/live, a15baae: T353's house lots, T336's cards, T378's mirror, so it also shows those cost nothing here): lead/live 1.01 / 1.5 ms at 30% and 1.19 / 1.8 at 15%, the average bake 25.7 ms, the ground plus tiles peak 185 MB;
**with the land** 0.78 / 1.1 at 30% and 0.79 / 1.1 at 15%, the average bake 26.1 ms, peak 184 MB. The PC was quieter this time and the picture is the same as in the second runs: the main thread, the bakes and the memory are level with lead/live's, so the first run's outlier was
the PC's load and not the land's (two of the land's three Rondebosch runs are level with lead/live's three; the raw outputs are in `E:/ClaudeTemp/T357/bench-*.out`).

## Left out, and for the lead to decide
- **The light's strength on real ground** (done in T388, see "The real ground's light" above): the land has its own response and a modest boost, so the hills read at the default Slope light of 1 and gentle ground does not darken.
- **The skirt** (done in T388: 640 m, over 400 m of data): where the real ground beyond the land falls away below the land's mean the skirt climbs back to the plain more gently; the plain is at the land's average
  level, not at the clubhouse's. The whole map as land (a 2 km window in each fixture) would remove the trough.
- **A new tee the player places on a slope** is levelled against the course layer, not the land (`teeCourse().field`), so on a 6% hillside it stands on the hillside; the hole shaping's rolls are laid on the course layer too.
  Both would read the ground if the planners took a sampler as `holeTerrain` now does.
- **Saves from before T357, and courses built flat** (the box unticked, or no tiles): no land. An "add the ground to this course" could fetch it for an imported course and lay it under what the player has built (the
  course layer is relative, so it would still fit); not built.
- **SRTM is a surface model**: treetops and roofs are in it (Rondebosch's surroundings are lumpy; its land is the flat Black River plain). 3DEP (the US) and the lidar (England) are cleaner. A finer source for Cape Town
  (the city's lidar contours) would not change the game's feel at 30 m smoothing.
- **The elevation server** (an S3 bucket) publishes no rate limit; the rules above are modest (a few tiles once per course, kept). If the game ships widely a small proxy with its own cache is the safe course, as for Overpass.
- `?land=0` stays in production code (one `URLSearchParams` read when a map-data game is laid): the A/B of the shots and the bench; it can go when no longer wanted.

## Adding the ground to a course
`node scripts/dev/osm-course.mjs "<name>" --height` (or `node scripts/dev/osm-height.mjs <slug>` on a stage-1 JSON already made) writes `<slug>.height.json` (the 4 m smoothed grid packed, with the
source and credit) and `<slug>-height.png` (a hillshade with the hole lines) beside the JSON, and caches the tiles in `E:/ClaudeTemp/T340/dem/raw/<z>-<x>-<y>.png` with a `.meta` (the imagery source).
`scripts/dev/osm-trim-fixture.mjs` then reads that height file (next to its input; `--height <file>` or `--height none`), crops it to the course's box and 440 m round it, keeps it at the step the
source needs and writes the fixture's `height`. Rerunning the trim script with `--height none` reproduces the committed fixtures byte for byte.

# Stage 3 (built): Find a real course (T358, #1003)

The owner, 2026-11-08, on the new-game card's "Your course" list: "this needs to be a search for a golf course. a download/import area." The card's "Your course" row opens a picker
beside the Who-are-you card (`src/ui/golf/CoursePicker.tsx`): **Build your own** first, the three shipped courses as **Featured**, the courses the player fetched as **Downloaded
courses** (Refresh, Delete), and **Find a real course**, a search box. From T358 on the player's browser does call the public servers (Nominatim and Overpass) for this one feature,
on the player's own submit and under the rules below; the shipped courses are still fixtures, with no request.

## The steps (`src/game/golf/osm/find.ts`; every part is pure and takes the network and the clock as arguments, so the tests make no live request)
1. **What is typed** (`query.ts`): a name; `way/123`, `relation 123`, `node:123`; an openstreetmap.org link (an object, or a map position `#map=z/lat/lon`, `?mlat=&mlon=`); `lat, lon`. Another
   site's link, or a bare openstreetmap.org link, is said to be unusable.
2. **A name** goes to Nominatim (`nominatim.ts`): one GET on submit, `limit=20`, filtered to what the map tags `leisure=golf_course` (once each, areas before points, at most 10), each with its
   name, town and country. The answer is kept for a week (the same question again, in any case or spacing, sends nothing).
3. **No golf course by that name** (Woodhill: a residential estate with `golf=*` features inside; Wingate: the map's name is the one word "Wingatepark Country Club", and Nominatim's index is
   word based, so "Wingate Park Country Club" finds nothing and "wingate" finds a suburb and a building): the best place the search did find (an anchor: not a road, a building or a car park;
   Woodhill's `club=sport` node, the Wingate Park suburb) is looked at with **one small Overpass query** (`nearQuery`): the golf courses within 3 km, the golf features within 3 km, and the landuse
   and leisure areas that hold the place. `candidatesOf` offers the mapped golf courses first, then the areas that hold at least 6 golf features and are under 6 km across, each by golf features
   held (Woodhill's estate polygon comes out first). Also kept for a week.
4. **A pick** fetches the course with **one Overpass query**, the same one `scripts/dev/osm-course.mjs` asks (a test compares them), tried on the main server and then on the two mirrors (a
   timeout, a busy answer or a runtime-error remark moves on; nothing is retried on the same server). The raw answer goes into the library; `fromosm.ts` (the script's model-building, ported; a
   test compares it with the script's JSON feature for feature on the 8 answers it cached) makes the course JSON, `specOf` (the converter, scaled to fit the 2 km map when it must be) the spec,
   `grade.ts` the report.
5. **The preview** (`preview.ts`, a canvas): the stage-1 PNG preview's look; the counts (holes, greens, bunkers, pins; tees, fairways, water); the grade; the size and the scale needed to fit the
   map; what the converter made up; **Build this course**, which starts a new game on the spec (`Game.startRealCourse(spec)`), as the featured ones do.

## The grade (what "Build this course" will make)
| Grade | Means | Example (the answers cached on this PC) |
| --- | --- | --- |
| **Full** | 9 or 18 numbered hole lines (one course of the boundary): the holes are the map's own | Rondebosch, Magnolia National, Woodhill, Milnerton, Mowbray, the Old Course: 18 holes |
| **Partial** | no hole lines but fairways, greens and tees: holes worked out from them (a guess, drawn amber in the preview, `holes-derived`); or only some holes numbered | Wingate Park: 3 holes (`derive.ts`, back from `arena/T340-wingate-parked`) |
| **Outline only** | nothing to build holes from: the game cannot build it and says so | Bloemfontein: a boundary and two streams |

A graded course is built at true size when its land fits the 2 km map, else scaled by the largest whole percent at which it does (the card says the percent: Woodhill 90%). One that would have to shrink
below 30% (`MIN_SCALE` in `grade.ts`: its holes would be under a third of their real length) is "too big for the 2 km map" and is not built.

## Being polite to the public servers (`polite.ts`)
- **Nominatim** (usage policy: at most one request a second, no autocomplete, cache results, identify the app): a search runs only on Search or Enter (never as you type); `Gate` keeps requests at
  least 1.1 s apart; answers are kept 7 days (IndexedDB); the request carries `X-Requested-With: CapitalEmpire-golf` (Nominatim's CORS answer allows that header; the browser adds the page's origin
  as the Referer; a browser cannot set User-Agent); a search already made sends nothing.
- **Overpass**: one query to look near a place and one query per import; a course already kept is never fetched again, Refresh is the only refetch; the main server (130 s) and then the two mirrors
  (45 s each: a mirror that is down hangs; for the look near a place 70 s and 30 s), a simple POST (no custom header, so no preflight); a server that timed out is left alone for 5 minutes and one that was
  busy for a minute, so a retry does not wait on it again; the card says which server it is asking and why the last was given up on; the player can Cancel. (Seen on 2026-11-08 in a real run: the main
  server answered 502 at once, the first mirror held the request until the limit.)
- **A 429, a refusal (403) or a busy server** (502, 503, 504, 509, an Overpass "timed out" remark on every server): the card says "The map servers are busy: try again in a minute.", and for the
  minute (or the server's Retry-After) nothing more is sent (`Cooldown`). No network: "Could not reach the map servers: are you online?".
- **If the game ships widely**, the public servers' policies stop being enough (they are for light, interactive use): a self-hosted Overpass or a small proxy with its own cache would be needed.
  That is a decision for the owner, not for this ticket.

## The library (`library.ts`)
IndexedDB `capital-empire-osm`: `courses` (the record: id `way/123`, the name the map gives it, place, credit, licence, fetch date, server, size, grade, holes, par), `raw` (the Overpass answer as
text), `answers` (the kept Nominatim answers and near looks). Listing reads only the records. Only the raw answer is kept: the course is rebuilt from it with the converter of the day, so an
improved converter improves old downloads. Where IndexedDB is not available (a private window in some browsers) the library holds for the visit only, and the card says so. The library is per
browser profile.

## Names and credit
A shipped course keeps the made-up name when the club is famous (Magnolia National); **a player's own import shows the name the map gives it**, because the player chose it. "© OpenStreetMap
contributors" is on the picker, the preview, the course card (the Holes panel) and the gear menu's credits, as before; a record keeps its credit and licence with the answer.

## Checks
`tests/golf-osm-find.test.ts` (parsing, the hit filter on real Nominatim answers, the polite client, Overpass and its mirrors, the near look, the library on a fake store, the grade, the preview, the
model against the script's) and `node scripts/dev/osm-search-shots.mjs` (a headless run with the servers mocked: Wingate through the near look to a Partial preview and a game on it, Bloemfontein's
Outline only, a 429, the library across a reload, Delete). The fixtures in `tests/fixtures/osm/` are real answers (ODbL data, credit above).

## Still to do
Estate streets and house lots on imported courses (T354, T353); choose which of two full courses of one
boundary to build (the converter builds the fullest; the others are named in the warnings); a Par 3 course of a boundary; cropping a too-big course instead of scaling it.

---

# Placing a real course into a game under way (T356, #998)

The owner, 2026-11-08: "add a way for the user to place the golf course he imported into his map, seeing a outline and then having to rotate the course to fit.
it should auto buy any property or expand the map size so he can place the course. the placing highlight can turn red if you cant place it coz you dont have
enough money. It should auto build over other roads and buildings by buying the land and destroying everything under it. Add a notification pop up."

**Use:** Course › *Place a real course…* › Rondebosch / Magnolia National / Woodhill (*Featured*) and, under *Downloaded courses*, every course the player fetched with the
new-game card's search (T358, kept in this browser's IndexedDB: the list is read when the page starts and again each time the Course flyout opens, so a course downloaded on the
card is there at once; none downloaded: no caption, the three alone). The course's outline follows the pointer; R / Shift+R (or Shift+wheel) turn it
15 degrees, Alt+R one degree, Alt+wheel freely; a click asks (the pop-up), *Place it* lays it, *Cancel* (or Esc, or a right click) leaves everything as it was.
A map-data game (`?osmcourse=`, the new-game card) is unchanged: it still lays the course on a new flat map.
**From the new-game card's search** (T358): the preview that opens after a name is searched or a downloaded course is opened has **Place it in my map** under **Build this course** (the owner, 2026-11-08:
"place the imported course with the placing mode, and back out if they decide not to use it, rather than starting a new game straight away"). Build starts a new game on the course, as before. Place keeps
the game's map: the card hides (it stays mounted, so the picker is as it was), the course goes in hand (`Game.startRealPlaceSpec`, `RealPlacer.startSpec`), and Esc, a right click or the placing
card's Cancel puts it down and brings the card back on the same preview, nothing bought and no new game; Place it lays it on the game's own map, the card returns with its Your course row naming the
course and the picker closed. (On the card the game is the one just started: its money may not cover a course; the outline is red then, and the price says so.)
A downloaded course is read back from the library and converted as a new game would convert it (`previewOfKept`: scaled to the map when it must be; holes worked out from the fairways
marked as a guess in the saved game's note, `derived`); it goes through the same plan, pop-up and laying, saved with its library id (`way/4261725`) and `placed`.

| piece | file |
| --- | --- |
| the turn: `rotateSpec(spec, deg)` (about the middle of the land, before rasterising; never a mirror; the holes' order, lengths and pars untouched; `rot` and `outline` on the turned spec), `coverStrips` (the land bought), `coverOutline`, `firstFittingAngle` | `src/game/golf/osm/rotate.ts` |
| the plan of a pose: `planPlace(world, turnedSpec, pose, build)`: land, demolition, refusals, price; `popupText`, `priceLines`, `placeLabel` | `src/game/golf/osm/place.ts` |
| the grid diff that lays the painted course into the game's course grid and clears the old holes; the build price from the painted spec | `src/game/golf/osm/placegrid.ts` |
| the mode (state, keys, drawing of the outline and the faint holes, the pop-up's view; `RealInfo`, `realInfoOf`, the host's `kept` for a downloaded course) | `src/game/golf/osm/placer.ts` |
| the downloaded courses for the menu (the library's list kept for the flyout, `refreshKept`, `keptCourses`, `watchKept`) | `src/game/golf/osm/kept.ts` |
| the engine's host: the world the planner reads, the lay (`Game.layRealCourse`), the pointer, keys, wheel, Esc | `src/game/engine.ts` (`real`, `realWorld`, `layRealCourse`) |
| the Course menu entry; the card over the map and the pop-up | `src/ui/flyout-menu.ts`, `src/ui/course/RealPlaceCard.tsx`, `src/App.tsx` |
| tests | `tests/golf-osm-place.test.ts`, `tests/golf-osm-placer.test.ts`, `tests/golf-osm-kept.test.ts`, `tests/ui-course-picker.test.ts` (Place it in my map), `tests/tile-cache.test.ts` (the draw-time trim) |
| shots; bench | `scripts/dev/real-place-shots.mjs`; `scripts/dev/real-place-kept-shots.mjs` (a downloaded course on the menu and from the new-game card); `scripts/perf/bench.mjs --realplace <id>[,laid]` |

## How it decides (planPlace)
- **The land bought is a cover of the turned land**: the game's ownership is a list of axis-aligned rects (and the build grid's shader takes 32 of them), so a turned
  land is covered by at most 18 horizontal strips as wide as the land is in each (rounded outward); an unturned land (0, 90, 180, 270 degrees) is one rect, exactly itself.
  The outline shown is the cover, so what you see is the land you get (about 6 to 10% more than the oriented rectangle at 15 to 45 degrees). The strips join `golf.parcels`
  and are kept apart in `golf.courseRects`: Land for sale sees them as one box (its search for blocks grows with the square of the rects) and the survey lines leave them be.
- **Price** = land + demolition + the course laid. Land: each piece of the cover, cut at the 40-tile blocks Land for sale uses, less what you own, at the rate of its block's
  class (farm 1, open 1.25, town 2, industrial 3, commercial 4 dollars a m2, `golf/parcels.ts`), plus the town's growth (5% a thousand people above the first). The
  buildings under it are bought out at their compensation (`budget.ts compensation`, the bulldozer's price), the public roads at their value (length x class cost x kind) as
  compensation too; the club's own cart paths and drives go free. The course laid: its painted surfaces at the paint tool's seed price (`golf/costs.ts unitBuildCost`).
- **A lot with no road is cleared too and counted**: a built lot outside the cover whose frontage lost its road (the piece it fronted lies in the cover), or whose road no longer
  reaches the county road (the cut stranded it), is bought out with the rest and listed in the pop-up.
- **Red (the outline hatched, the reason by the pointer)**, in the order they are told: off the map (4 tiles to spare; "the map cannot grow"), a tournament under way, over the club's own
  buildings, car parks, range, practice area, tournament structures or an iconic place, within 26 tiles of the town's centre, a cut that leaves the town's centre or the clubhouse with no
  way to the county road, and last the river: a hole's green with a corner or its middle on the river, a tee marker or a pin on it, or a hole whose line runs more than a quarter of its
  length along it ("The river runs over hole 7's green"). Short of money: red too, "Not enough money: $X (short $Y)".
- **The river**: a generated valley has water (`TC.WATER`, about 3% of the map) in every 700-tile window, so "red over any river tile" (`RIVER_RULE = 'cover'` in place.ts) would never let
  a course be placed. The default (`'features'`) lets the river run through the course: the cells on river tiles are left unpainted (`placeDiff`'s `wet`), so the map's river keeps flowing
  across the fairways and roughs, and only what a hole cannot do without (its green, its tee marker, its pin, a fairway along the water) refuses. Creeks and banks are painted over.
- **Over what is there**: the player's own placed items go for nothing; town trees and forest go as the course grid's new surfaces take their ground; a tunnel is left
  (it runs under the land).

## Laying it (Place it)
Buys out the lots (the worker pays their compensation), pays the land, the roads and the course, cuts the road pieces inside the cover (`NetEditor.removePiece`; the ends outside
are dead ends, trimmed by the bulldozer's `tidyEnds`), removes the player's placed items, adds the cover to the land (`fitCourseGrid`, `sendGolf`), applies **one `GridDiff`**
through the grid's own pipeline (`applyDiff`, `courseGridChanged`: the workers' cells, the ground that re-bakes itself, the trees that go), clears the old course's holes,
puts the tee sets, pins and aim points, and saves `golf.osm` with `placed: true` and `turn` (the loader then keeps the game's own map and seed; a new-game map-data
course has no `placed` and is laid on the flat map as before). Your previous holes are **replaced** by the course's (the pop-up says so); the land they stood on stays yours.
**T357:** the course's real ground goes with it (`Game.layPlacedLand`: the land turned with the course, the greens' tilt; see "Real ground height" above).
The camera then goes over the whole land, and the ground cache drops the chunk pictures the next frame does not draw (`GroundCache.purgeUnused`): they are the old place's ground, and the first
bakes over the new land need the memory (see Performance).

## Performance (the bench, T356)
`node scripts/perf/bench.mjs http://localhost:5189/ --start town --seed 7 --stamp 1 --money 1 --size 1 [--realplace rondebosch | --realplace rondebosch,laid] [--zooms 30,30]` on a dev server, 1600 x 900,
RTX 3080, the merged branch, the old start's town at pop 933 (372 built lots, 129 road pieces, 9 holes of its own). **Use `--seed 7` (or 2, 5, 10, 12, 13): `--seed 1` gives no old start, so the game
takes a random map (the T340 table above says `--seed 1`).** The budget is 8 ms of main thread a frame. Main-thread ms a frame, average / p95:

| | 30% pan | 15% pan |
| --- | --- | --- |
| no course placed (the game as it is) | 0.86 / 1.2 (55.6 fps) | 0.91 / 1.3 (59.2 fps) |
| in hand, A/B on one page: off (no course) | 0.68 / 0.9 | 0.84 / 1.1 |
| in hand, the pointer still (the outline and faint holes drawn, the plan kept) | 0.75 / 1.0 (+0.07 ms) | 0.87 / 1.1 (+0.02 ms) |
| in hand, the pose moved a tile every frame (a replan every frame: the worst a pointer can do) | 1.42 / 1.9 (+0.73 ms) | 1.44 / 1.8 (+0.60 ms) |
| Rondebosch placed, the first pass over it (two runs) | 1.05 / 1.6 (26.4 fps), 1.07 / 1.8 (26.9 fps) | 1.15 / 1.8 (49.5 fps), 1.15 / 1.7 (50.7 fps) |
| the game as it is, the same day (the base run that goes with them) | 0.80 / 1.2 (58.8 fps) | 0.81 / 1.2 (59.1 fps) |

**Memory: the chunk pictures plus the tile caches** (`groundPlusTilesPeakMB` of the bench, MB of 1e6 bytes; GAME-PLAN 2.3's budget is 192; the most over the frames of a stage), the same command:

| | 30% pan | 15% pan |
| --- | --- | --- |
| placed, before the fix (two runs) | 198, 198 | 191, 195 |
| placed, after (two runs) | **185, 185** | **185, 186** |
| the game as it is (before / after: nothing placed, the cache change only) | 185 / 186 | 189 / 185 |

- **The main thread is nowhere near the budget.** What costs frames after placing is the ground, off the main thread: the first pass over the new course bakes its chunks (median bake 56 to 62 ms
  against 37) and decodes its textures (109 to 124 tile pictures against 16 to 24 as it is; 18 in the 15% pass), as T340's new-game courses do.
- **Two things held the first pass over 192 MB, both fixed.** (1) The old town's chunk pictures (about 46 MB, mostly the ground of the place the camera had left) stayed resident beside the first bakes over the
  new land, and a chunk of a course lays a dozen tile sets: its bake pins about 150 MB of tile pictures in the one ground worker at once (198 MB = 46 + 151.7). `layRealCourse` now calls
  `GroundCache.purgeUnused()`: the next frame drops every chunk picture it does not draw (a few dozen `deleteTexture` calls once; the frame costs are below), the tile budget
  (what the chunk pictures leave of the 192) grows by as much, and the first pass redecodes less (109 to 124 decodes, 101 to 116 of them redecodes, against 158 to 179 and 150 to 177).
  (2) The mips and pre-scaled copies (the swamp's) a bake makes while it draws were counted after the bake, so a full cache stood up to 9 MB past its budget at the end of a bake (145 MB against 136):
  `TileCache.pinOf` (wired to `Textures.tilePinned`, the bake in hand's tiles) now trims the least recently used pictures of the other tiles at once when a draw makes one, the same pictures
  the trim after the bake would have dropped (`tests/tile-cache.test.ts`). No bake lost a tile to it: `groundProvisional` (bakes that fell back to a placeholder for a tile not ready) stays 0.
- **What is left.** The sum is the chunk pictures plus the tile caches, the second held to what the first leaves less 8 MB (`TILE_SLACK`), so a full cache sits at about 184 MB and a bake whose
  pinned tiles alone are bigger than its share (a chunk with every surface of a course on it) can still reach past it for the length of that bake, more when the chunk pictures have filled
  their own 128 MB budget in a long session (the floor of the tile budget is what that budget leaves, 64 MB). That is the design of T272, the same in the game as it is (185 to 189 MB above); a
  bound on the tiles one bake may pin (two passes by layer, or the chunk pictures giving way to the overflow) is a ticket of its own.
- **Laying it** costs 268 ms of main thread in the bench (about 750 ms from the click to the next frame in the shots: the grid diff of every painted cell of the course, then the ground's re-bake in the workers).
- **The plan** (`planPlace`) on a synthetic town: 3,750 lots and 1,250 road pieces 1.3 to 2.1 ms a pose, 12,150 lots and 4,050 pieces 3.6 to 5 ms (the lots' boxes, the land classes and the road graph are kept
  between poses; `output/plan-bench` is not committed). It runs when the pose changes, never for a pointer that holds still.

## Left out, and for the lead to decide
- **The map cannot grow.** `MAP = 1024` is a compile-time constant of the engine (typed arrays, the terrain, the workers), so "expand the map" is not offered: a course that fits
  in no turn is refused with a message that suggests a smaller or a scaled course (`specOf` already scales Woodhill to 90%; true size needs 1079 tiles). Woodhill at 90% is 976 x 529 tiles: it fits the 1016 usable tiles only at 0, 90, 180 and 270 degrees (and within 4 degrees of them); Rondebosch and Magnolia fit at every turn.
- **Rerouting around the course** is not done: a cut road ends at the boundary (and the lots it leaves roadless are cleared and counted, the way to the county road is kept by refusing a
  cut that would lose it). A detour needs the road builder's snap and crossing rules on public land; the pop-up's text says what happens.
- **Estate streets (T354)** are laid by a new game on the course (the section on the estate, below), not by the placing mode: a course placed into a game under way has its course only (the spec's estate turns with the rest and waits).
- The cover's extra land and the rect budget (18 strips, 32 in the shader) are choices: a finer cover costs rects the build grid cannot take.

# The course's ground: a band of rough, then natural fescue or the desert (T362, #1017)

The owner, 2026-11-08: "add a layer of rough around the edges of the fairway and greens for the imported course but leave the rest of the course the natural fescue or desert." T340 had laid the
whole boundary as rough. Now:

- **The boundary is the course's wild land** (`SpecSurface 'wild'`, the converter's one change to what it paints): **natural fescue** (`SURF.fescue`) in an autumn game, and **the land's own
  ground in a desert game**: left unpainted, so the desert theme draws it as the desert sand and dirt (the golf surfaces are never re-skinned by the theme, so a painted fescue would stay a green-gold
  grass in a desert). The mapped `golf=rough` areas stay rough in both.
- **A band of rough goes round every fairway, green and tee.** `OSM_ROUGH_BAND_M` (`types.ts`): **fairway 7 m, green 6 m, tee 5 m**, measured from the edge of the surface. The game plays the first 3 m of
  rough beside a fairway, fringe, tee or green as the first cut (`golf/play/courseview.ts FIRST_CUT_TILES`, and the course's automatic first-cut and fringe collars are drawn over it), so
  the band is the first cut (3 m) and 4, 3 or 2 m of rough, and the land past it plays as fescue ("Long grass: much shorter, and wild"). **The widths are data**: the spec carries them
  (`OsmCourseSpec.roughBand`), a fixture's `meta.roughBandM` and the converter's `roughBandM` option change them for one course (`roughBandOf`: the defaults, the fixture's over them, the option's over those;
  a bad number is ignored, none goes past 0 to 20 m), and a width of 0 is no band.
- **Who lays it: the raster, not the converter.** The game's theme is known only when the course is laid (`newGame` takes it from the new-game card or the last choice before it lays anything), so the converter's spec
  is the same for every game and `paintSpec(grid, spec, ox, oy, { desert, legacy })` decides: `wild` is `SURF.fescue`, or nothing in a desert game. After every area is laid it turns each cell of the natural
  ground (none, or the wild fescue) within the width of a fairway, tee or green cell into rough (`layBand`: edge cells only, each stamps a disc of squares: the band is its width to the cell along an edge,
  and the corners are the true offset arc, not a staircase). Nothing but the natural ground changes: a bunker, a pond, a mapped rough area keeps what it is, and a fairway a bunker cut into still has its band where it is open.
  Shipped and searched courses are alike (both go through `planOsmGame` and the placing mode's `scratchOf`, which take the paint options), and a course placed into a game under way is laid the same and priced by the game's
  theme (`RealHost.paint`). **Old saves keep what they have**: a saved game keeps the grid it was laid with, nothing re-lays it.
- **The wild land stays inside the land.** It is clipped to the spec's frame (the land: the holes' features and their margin): the boundary of a big estate (Woodhill's is the whole estate, 2,277 x 1,535 m) no longer
  spills fescue into the grid's 32-tile pad round the land, outside what the club owns. A made-up fairway band (`clip`) lays over the course's own land (the wild land and the mapped rough) by a mask of those cells, since a
  desert game paints no surface there.
- **A dev switch for the before and after:** `?rough=old` on the dev server lays T340's look (`PaintOptions.legacy`: the boundary rough, no band) in the same build, as `?land=0` does for the height.

| cells (1 m) | Rondebosch | Woodhill (90%) | Magnolia National |
| --- | --- | --- | --- |
| before (T340): rough | 286,702 | 1,393,993 | 752,789 |
| now, autumn: fescue / rough | 211,851 / 75,183 | 1,135,479 / 258,514 (mapped rough 313,930 laid over) | 595,208 / 157,581 |
| now, desert: unpainted land / rough | 1,573,490 / 75,183 | 1,820,921 / 258,514 | 971,601 / 157,581 |
| paint time (the whole grid) | 15 to 22 ms | 25 to 29 ms | 28 to 35 ms |
| price of painting it (the placing mode), autumn / desert / before | $555,818 / $449,892 / $619,108 | $1,265,210 / $697,470 / $1,605,853 | $1,199,354 / $901,750 / $1,377,916 |

What this changes in play and in the books (the owner asked for natural land, so these follow): the land past the band plays as fescue (carry x0.6, wide and wild) where it played as rough (x0.88); a
desert game's plays as rough within 80 m of a played line and out of bounds beyond (an unpainted cell, as every unpainted cell of the course is); the upkeep of the land falls with it (fescue $0.05 a m2 a year against $0.15 for
rough; nothing for the desert's own ground); a house lot or a street over the wild land clears it as over any rough (T353, T355). The tests: `tests/golf-osm-rough.test.ts` (band widths to the cell, fescue against desert by theme,
the widths as data, the lies, the shipped courses, the placing mode's price).

# The estate of a real course: its streets and house lots (T354, #996)

The owner, 2026-11-08: "Add a way to add the estate streets if your golf course you are importing is also a golf estate." Woodhill is the example: its boundary is the "Woodhill Golf Estate"
(`landuse=residential`) and its streets and houses are in OpenStreetMap inside it. A new game on it can lay them: the streets as the game's residential road class, one network joined to the
entry road, and T353's house lots at the places of the map's houses.

## From the map to the fixture
- `scripts/dev/osm-course.mjs` asks, in the **same single Overpass query** as before, for the ways inside the boundary with `highway=residential|service|living_street|unclassified|tertiary` (as
  geometry: footways, paths and cycleways are not asked for, a cart path is `golf=cartpath` already) and for the `building=*` ways as centres (`out center`: a point each, no footprint).
  They become the kinds `street` (lines, with their tags) and `building` (a point each) of the stage-1 JSON, with `meta.estate` (`residential`: the boundary is landuse=residential, the counts).
  The script's User-Agent is now `CapitalEmpire-dev/1.0 (dev script)` (no address in it). The browser's own query (`overpass.ts courseQuery`, which a test pins to the script's text) is T378's file and
  is **not** extended here: a searched course gets streets as soon as that query asks for the two statements (the converter reads the two kinds from any JSON that has them).
- `scripts/dev/osm-trim-fixture.mjs` keeps them: the street runs inside the box (the holes and 120 m), no names, `highway`, `bridge`, `tunnel`; **a driveway, a parking aisle and a drive-through are not
  streets** (Woodhill's 328 ways are 210 driveways, 7 parking aisles and 111 streets: 98 residential, 8 service, 5 living_street); each building as a point (a tag only when it is not a plain
  house: Woodhill's 143 are 135 `yes`, 1 `house`, 5 `roof`, 1 `ruins`, 1 `security`); `meta.estate: true` for a residential boundary. **`--merge <fixture>`** adds only these to a fixture that exists, byte for
  byte as it was otherwise (its trimmed features and its real ground height stay): the new run's frame is checked against the fixture's by their 18 hole lines (the same OSM ways; it was 0.01 m off) and the
  streets are moved by the offset if the boundary was edited between the runs. Woodhill's fixture went from 88.7 to 107.7 kB.

## The converter (`golf/osm/convert.ts`, `streets.ts buildEstate`)
`spec.estate` (absent when the map has no streets inside the land): the streets, the houses and what was left out.
- The streets are cut **20 m past the land's edge** (`STREET_REACH`): an estate's perimeter road lies just outside the land (Woodhill's about 10 m), and a network cut at the edge itself fell apart into
  100 pieces of which 43 (4.7 km) were left over, where at 12 m or more 6 are (the clubhouse parcel stands 28 m from the land, so a street 20 m out never reaches it). A street's end within 2 m of another street (`STREET_SNAP`) is **joined** to it: onto a vertex of it when one is about as near, else onto the foot
  of the perpendicular (the other street gets a vertex there, so the two share a node: the trim's simplification removes a junction's vertex from the through street, and 19 of Woodhill's 218 street ends
  needed this); of two ends that meet, the later moves onto the earlier.
- **A street that crosses a hole is left out, whole**: its way meets what the converter paints as a fairway (the made-up bands too), a tee, a green, a bunker or water, or crosses a hole's line of play or a waterway.
  Then **the pieces the biggest network does not reach are left out** ("isn't connected"). Both are warnings with their counts (`street-over-hole`, `street-unconnected`), and a street on a bridge or in a tunnel is
  `street-bridge`: nothing is a refusal.
- The houses: the `building` points that are houses (`yes`, `house`, `residential`, `detached`, `semidetached_house`, `terrace`, `bungalow`, `villa`, `apartments`; a roof, a ruin, a garage, a guard house are not),
  inside the land, **off the course** (not on a fairway, tee, green, bunker or water) and **off the street's own line** (3 m): the anchors the lots are laid at.
- At the course's scale: the JSON is scaled first (Woodhill 90%), the streets with it.

## On the map (`start.ts planOsmGame(spec, map, paint, estate)`, `streets.ts joinEstate`)
The estate's streets on the map as legs, and **one link** that joins their network to the entry road: from the street vertex with the shortest way out of the land (straight towards the map's edge on the
road's side, to the row 8 tiles from the road's inner end, then along that row to a T on the road) that crosses no playing surface or hazard (the course grid is read along it) and keeps 3 tiles clear of the
clubhouse parcel and the car park. With no such way the streets are not laid and the game says why (`estateWhy`, a toast): a network the town cannot reach is no estate. Everything else of the plan is as it was.

## The game (`engine.ts`)
- `newOsmGame` lays the legs and the link as the **street** class (as the entry road and the drive are laid: the towns' legs) and keeps the houses; **the lots are laid in `afterLoad`**, once the network is committed
  (the streets are real roads, with their junctions): T353's frontage frames along them (`estateStreets`, `ES.framesOf`), the frames that hold a house of the map (`streets.ts framesAtBuildings`: each house takes the
  nearest frame within 6 tiles, a frame once), laid by `layEstateLots(along, free)` **free of charge and for sale** (the club's land: the houses fill in over time as T353's lots do: they sell with the
  reputation and the view, and are built in stages) under T353's rules (the club's own land, off the course surfaces, 30 m from every hole's line: the landing zones, no overlap). A frame is square to its
  street, so **every house faces its street**; a house with no street beside it gets no lot.
- **Streets at any heading take lots** (`EstateEnv.anyHeading`, which `engine.ts estateEnv()` sets). T353 refused a lot on a street more than 20 degrees off both map axes (`OFF_AXIS_DEG`), believing the town's composer
  draws a green there. It does not any more: on every heading it draws a house (the lot lab's diagonal-road presets, T305's generated lots turned to the road; `lots/compose.ts planOf`): a probe composing a built
  house lot at 0, 10 ... 80 degrees gave a preset and a building on all 24 seeds at every angle. The frames at Woodhill's houses lie 20 to 60 degrees off the axes (all 41 would pass the axis rule only with the whole
  course turned about 40 degrees), so under the axis rule **0 of those 41 could be laid**; with it off **38 are laid in the game**, and the three left are the ground's (land that is not the club's, a hole's range, a lot
  already there). The model's default is still T353's (`lotWhy` without `anyHeading` refuses as before, its tests unchanged); the House lots tool, which reads the same env, no longer refuses a diagonal street either.
- **Woodhill in the game** (a new game on `?osmcourse=woodhill`, the land 1,952 x 1,058 m): the network goes from 2 road pieces to 786 (the estate's 779 legs, the 257 m link, the entry road and drive); 100 street pieces
  of 12,037 m with 88 junctions, 6 pieces (611 m) left out as not joined to the biggest network, none over a hole; 143 buildings of which 92 are houses; **38 lots laid at the houses** (41 frames at houses, 3 refused), all for sale;
  after 7 minutes at 20x (Sep 1984 to Aug 1985) 31 for sale, 1 sold, 1 being built, 5 built. The town's own lots along the new streets go from 14 to 263 (none on the club's land). The bench (estate off against on, twice each):
  the main thread a frame 0.8 to 1.0 ms against 0.9 to 1.4 ms at the estate's zoom (budget 8 ms), memory level.
- **The tick box** on the new-game card (Who are you? › Your course): "Build the estate streets and lots (for a course that is a golf estate)", checked until unticked. **On by default for a course whose boundary is a
  residential estate** (`spec.estate.residential`: Woodhill): a course that has streets but is no estate builds them only when the box is ticked by hand. `?osmestate=0|1` on the dev server (and the bench's
  `--osmestate`) overrides it for the session.
- Old saves have no estate; a saved estate is the roads and `golf.estate` (T353's save) as for any streets and lots.
