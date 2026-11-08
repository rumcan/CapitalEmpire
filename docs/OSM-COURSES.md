# Real golf courses from OpenStreetMap (T340, #967): stage 1 findings, 2026-11-08

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
5. **Paint** with the course surfaces the paint tool already has (the borders, first cut and fringe come with the presets): rough over the whole boundary, then `rough`
   polygons, fairways, tees, greens, bunkers, water (hazard polygons, `natural=water`, streams 2 to 4 m wide), cart paths and `golf=path` lines where mapped.
6. **Fill in and list for the player** when missing: a par 4/5 with no fairway gets a band along its line (about 28 m wide, inside the boundary); a line whose end is on no
   green gets a green of about 400 m2 there; a green with no pin gets one at its centre (Mowbray: 15 of 18); par from length; hole numbers from `ref`/`name` on tees and greens,
   else ask the player to number them (the hole strip already reorders); no holes at all: say so, do not invent them.
7. **Tests**: holes in order with a tee, a pin on a green and a par each; every feature inside the land; the fill-in list matches what was missing; the same fixture gives the
   same course twice.
8. **In the game**: a dev URL first (`?osmcourse=<fixture>`), then a "Real course" card. **Do not call Overpass or Nominatim from players' browsers** (both are for light,
   cached use; Nominatim forbids heavy and search-as-you-type use): ship a few pre-fetched, checked-in courses with the credit shown, and add more with this script.
9. **Screenshots**: a famous course and a Cape Town club built in the game beside their previews. No heights came with what was fetched (later: a public DEM for T026).

## For the owner to decide
- **Which less famous course to build first**: the Cape Town clubs are all complete; the cleanest is Rondebosch (18 holes, 18 pins, no slips), then Mowbray (3 pins) and
  Milnerton (a missing green). If the owner has a local club in mind, name it: the script needs only the name. Bloemfontein stays the "no holes mapped" test.
- **Which famous course**: Augusta (18 clean holes plus the Par 3 Course, woods, creek) is easier for the game than the Old Course (double greens, 8 shared fairways).
- **Land size**: whether the game's course land may be about 3 km across, or real courses are scaled.
