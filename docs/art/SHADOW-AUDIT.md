# Prop shadow audit (T141, #271)

The owner (2026-10-26): "audit each props boxed shadow. the shadows should be tailor made for a top right shadow ... some are not right at
all." House rule: the sun at the upper right, shadows at 145° on screen (to the lower left), a cool multiply that keeps the ground's texture.

**Status: done** (branch `arena/T141-prop-shadows`). 1,638 sprite views audited, 713 had a problem before, 20 are flagged after (all
checked: 3 are the overrides' own "no contact shadow", the rest are measurement artefacts or accepted, see "After").

## The audit sheet (dev only)

- `npm run dev`, then `http://127.0.0.1:<port>/?shadows=audit&cat=<category>&page=<n>` (src/game/dev/shadow-audit.ts). Categories
  (src/game/dev/shadow-audit-items.ts `AUDIT_CATS`): trees, poles, props, golf (the Props tool's catalogue, the course dressing, the course
  pieces' props, the Event tool's structures: T113's course props), range (every piece of a fully built range at each home stage and facing,
  at the engine's size and footprint), vehicles, walkers (sampled: standing frames, all eight facings), buildings (with business art), fences.
- Each sprite, in each of its views, is drawn three times, one strip each: BOTH shadows, the CONTACT shadow alone (with its footprint in white
  and its anchor in red on the ground), the CAST shadow alone. The label gives the id, the contact shape (`o` round, `[]` box, half extents in
  metres), its shadow kind and the scale. It is drawn by the game's own GL programs and sprite packing (gl.ts, sprites.ts), so the sheet is what
  the game draws; it also draws the old shadow code (it was used for the before sheets).
- Options: `&z=0.3` zoom, `&w=1600` width (CSS px), `&per=40` items a page, `&h=3600` page height (device px), `&measure=1` measures every
  picture's opaque base from the atlas alpha (window.__shadowAudit.measure).
- Capture: `node scripts/dev/shadow-audit.mjs --base http://127.0.0.1:5186/ --out <dir> [--cats trees,poles] [--scales 1,2] [--pages 0,1]
  [--measure]` (headless Edge, closed when done; JPGs `<cat>-<page>-30pct.jpg` at 30% on a 1x screen and `-2x.jpg` at 30% on a 2x screen,
  1,600 px wide).
- 1,638 entries: trees 94, poles 181, props 462, golf 134, range 63, vehicles 70, walkers 40 (a sample: every frame shares one rule), buildings
  547, fences 47. Left out: the baked lots (they carry their own shadows) and 46 old buildings the game never draws as themselves (newart.ts
  draws a new-art stand-in of their family, which is audited; their shadow is now the stand-in's).

## How the contact shadows work now (src/game/shadow-shape.ts)

1. **The override** (`src/game/shadow-overrides.json`, by library id): kind, hx, hy (half extents, metres at scale 1), dx, dy (the centre's
   offset from the anchor, metres at scale 1), core, feather, lean (a multiplier), `"contact": false`, `"cast": false`, and a note. A turned
   view (`view:<id>:se|sw|nw`, `east:<id>`) shares its NE view's entry, its sizes and offsets turned with it; `variation:<group>` covers every
   picture of a variation set. Offsets are not mirrored for a flipped sprite (only some old trees are flipped).
2. **The kind rules** (`ruleKind`), on whole words of the name and id: lots none; walkers; fences their strip; roundhouse (gazebo, fountain,
   merry-go-round, carousel, bandstand); building (the building kinds and the art inventory's business buildings, by id); vehicle (kind car or
   a vehicle word, unless a car park, a stop, a shelter, a garage, a seat, a bench, a toy, a shopping cart or a pull wagon); tree; pole (kind
   lamp or a pole word: lamp, pole, sign, post, flag, pin, meter, bollard, hydrant, mailbox, ...); plant; round (small round things: a
   trampoline, a pool, a fire pit, a well, a spool, a barrel, a statue, ...); else prop (a box from the footprint).
3. **The picture** (`contactShadow`, from the sprite's trimmed picture rect as drawn): a box is never wider than 0.9 of its picture (a
   vehicle's 1.05), slides under the picture's middle when it is off by more than an eighth of its width, and keeps its front corner no lower
   than the picture's foot; a placeholder footprint (business art's 2 x 2 m box, or a building's footprint under 45% of its picture's width)
   is replaced by the picture's own base, which the cast shadow then stands on too; a pole's spot stands on the picture's foot (up or down
   the screen from the anchor); a tree's pool goes down to the trunk's foot when the picture reaches below its anchor.
4. **One lean for blob and box** (`CONTACT_LEAN`, `leanShift`; gl.ts VS_SHADOW per vertex, the same GPU cost: one instance a shadow): every
   shape moves along the cast shadows' angle (145°) by half its own reach from its centre to its edge in that direction, at most 0.8 m, times
   the cast length against its default and its override's lean. So nothing slides off its base (a fence's strip moves less than its depth), a
   round pool and a box of one size lean alike, and the sun side stays lit.
5. Sprites with `"cast": false` cast no cast shadow (sprites.ts packSprite); a hidden look casts no contact shadow either.

## Before (the old code), by category

The problem classes, measured from each picture's opaque alpha (`output/t141/problems.mjs` in the worktree, not committed): a box wider than
its picture; a box off the picture's middle; a contact shadow hidden under its picture (under 30% of its width); a pole's spot off the pole's
foot; a tree's pool above its trunk's foot; the lean sliding a shape off its base; a box sticking out in front of the picture by over 25 px.
Besides these, the kind rules gave 188 sprites the wrong kind (listed after the table).

- **trees**: 94 audited, 5 with problems
  - pool above the trunk foot (5): `world:tree_pine_1`, `ref:tree-maple-crimson`, `ref:tree-birch-gold`, `ref:tree-spruce-blue`, `world:tree_pine_2`
- **poles**: 181 audited, 130 with problems
  - spot off the pole's foot (129): `world:speaker_post`, `world:hydrant`, `world:mailbox`, `town:stop_sign` (40 px under the foot), `town:traffic_light`
    (57), `town:utility_pole` (126), `expansion:rural-mailboxes`, `expansion:compost-bin` and its 7 variations, every road sign set
    (`variation:sign-*`, 100 pictures), `arcade:arcade_v2_clutter_poster` and its 8 variations, `town:phone_booth` x3
  - wider than its picture, lean slides it off its base (1): `ce:parking-in-sign`
- **props**: 462 audited, 134 with problems
  - sticks out in front (15): `world:scoreboard`, `variation:world-trashcan-76186b58-ns`, `expansion:trampoline`, `expansion:aboveground-pool` and its 4
    variations, `expansion:crushed-car-stack` (and 2 variation sets), `expansion:junk-car`, `expansion:scrap-pickup-rear` (and its variations),
    `expansion:stationwagon-rear`
  - wider than its picture (102): `world:bench`, `world:trashcan`, `variation:world-trashcan-76186b58-ns` (a 1.17 m box under a 0.41 m can),
    `expansion:trampoline` (a square under a round trampoline), the above-ground pools, the fire pits, the doghouses, `town:bus_stop` x3, the
    car-seat benches, the cable spools, the scrap cars, the cement bags, the coin horse rides, the kiddie car, the shopping cart, the wagon, and
    about 40 more variation views whose box is their base's or bigger
  - lean slides it off its base (8): `expansion:wheel-stop`, `expansion:canoe` (and its variation), `poi:canoe-rack`, four thin arcade walls and counters
  - off the picture (7): `expansion:basketball-hoop`, `expansion:aboveground-pool`, `expansion:backyard-tent`, `town:bus_stop`,
    `variation:expansion-lean-to-shed-0b83bbf7-plain`, `ce:parking-entry`, `ce:parking-exit`
  - hidden under its picture (16): the business props with the 2 x 2 m placeholder box (`business:golf-bench-course-map`, `-patio-table`,
    `-mower`, `-practice-net`, `-footbridge`, `business:bus-sw`, `-se`, `business:taxi-sw`, `-se`, `business:fishing-bass-boat`, the docks),
    `business:golf-pond`, `business:golf-bunker-crescent`, `expansion:washing-line`, `expansion:satellite-dish`
  - a speck for a pool (2): `business:golf-cart-sw`, `business:golf-cart-se` (the placeholder box as a vehicle)
- **golf**: 134 audited, 42 with problems
  - hidden under its picture (17): `business:golf-clubhouse` x4, `business:golf-halfway-pavilion` x4, `business:golf-cart-garage` x4 (also a 0.88 m
    round "vehicle" pool: "cart"), `business:fishing-rental-kiosk` x4, `business:golf-bench-course-map`
  - off the picture (9) and sticks out in front (5): `golf:grandstand-s` (its NE and SW footprints reach 190 to 340 px left of the picture),
    `golf:leaderboard` x4, `expansion:backyard-tent`, `ce:parking-entry`, `town:bus_stop`, `world:watertower`
  - wider than its picture (11): `world:bench`, `world:trashcan`, `business:golf-pin-red`, `golf:grandstand-s`, `golf:leaderboard` x2,
    `golf:toilet-block`, `town:bus_stop` x3, `world:watertower`
  - pool above the trunk foot (5): the five trees above; lean slides it off its base (1): `world:hedge`
- **range**: 63 audited, 32 with problems
  - hidden under its picture (10): `business:golf-pro-shop` x4, `business:fishing-rental-kiosk` x4 (the coffee kiosk), `business:golf-patio-table`,
    `expansion:washing-line`
  - wider than / off the picture / sticks out in front (28): `business:golf-driving-range` (the covered bays' roofs on their bays' footprint)
    x10, `golf:leaderboard` x2 (the range's sign), `gen:house-farmhouse-wrap` x4 (the house), `world:house_4`, `world:bench`, `expansion:firepit`
  - lean slides it off its base (2): `world:fence_picket_x`, `expansion:chainlink-x` (the yard's and the boundary's fences)
- **vehicles**: 70 audited, 8 with problems
  - sticks out in front (1): `world:schoolbus` (its box 1.7 times the bus's width, then widened 1.35)
  - wider than its picture (7): the side views of `world:car_2`, `world:car_3`, `static:compact_w`, `static:pickup_n`
- **walkers**: 40 audited, 0 with problems
- **buildings**: 547 audited, 340 with problems
  - sticks out in front (192): almost every house, shop, barn, school and industrial building: the old lean slid a building's box by
    `6 * cast.length` px per metre of (hx + hy), 30 to 60 px down-left, out in front of the walls
  - off the picture (87): `world:diner`, `ref:building-gas-canopy`, `town:grocery`, `gen:house-ranch-long`, `gen:back-patio-pool`, the
    `variation:*-plain` building variations (garages, cottages, dormers, the corner shop, the gas shop, the barn, the farmhouses), the
    industrial variations, `business:diner`, `-buscompany`, `-casino`, `-fishing-boathouse`, `golf:grandstand-s`, `golf:leaderboard`
  - wider than its picture (49): `town:grocery`, `world:primary_school`, `ref:landmark-silo` x4, `world:bleachers`, the industrial variations,
    `golf:grandstand-s`, `golf:toilet-block`, and other building variations whose footprint is bigger than their picture
  - hidden under its picture (76): every business building (the 2 x 2 m placeholder box): stadium, clubhouse, pro shop, cart garage, halfway
    pavilion, sports bar, diner, bus company, taxi, casino, hotel, motel, estate villa, fishing lodge, tackle shop, fishing cabin, boathouse,
    rental kiosk, driving range, each x4 views
  - a pole's spot under a whole building (13): `town:postoffice` and its views and variation ("Post Office": the word "post"),
    `world:drivein_marquee` x4, `town:phone_booth`
- **fences**: 47 audited, 22 with problems
  - lean slides it off its base (22): every fence along x (`world:hedge`, `world:fence_picket_x`, `world:fence_iron_x`, `expansion:chainlink-x`,
    `-fence-privacy-x`, `-gate-chainlink-x`, `-picket-x`, `world:gate` and their variations): the old lean moved a 0.16 m deep strip by
    about 0.5 m, three times its depth, off its fence
  - wider than its picture (3): `variation:expansion-gate-chainlink-x-0393aa75-ns`, `variation:expansion-fence-privacy-x-dd8abdb9`, its `-ns`
- **total**: 1,638 audited, 713 with problems

The kind rules (188 sprites given a wrong kind, now right; `tests/shadow-overrides.test.ts` holds them):
- `/tree/` matched "street": `world:streetlamp` (kind lamp: the town's lamps and the range's floodlights), `town:street_sign` and both
  street-name sign sets got a tree's canopy pool (tree to pole).
- The pole words vetoed the building rule: `town:postoffice` (and its views and variation), `world:drivein_marquee` (pole to building).
- `post` inside words: `expansion:compost-bin`, `arcade_v2_clutter_poster` and their variations (pole to prop).
- Vehicle words in other things: `town:bus_stop`, `ce:parking-entry`, `-exit`, `-kiosk`, `-in-sign` ("Car park ..."),
  `expansion:carseat-bench`, `expansion:crushed-car-stack`, the toy car, the pull wagon, the shopping cart (vehicle to prop or pole);
  `business:golf-cart-garage` (vehicle to building).
- Business art: the 18 business buildings were props with a 2 x 2 m box (prop to building, sized from their picture); the pins were props (now
  poles); the bass boat and the taxis were props (now vehicles).
- Round things had boxes: the trampoline, the above-ground pools, the wishing well, the fire pits, the rain barrel, the cable spools, the
  tyre stack (prop to round).

## After

- **trees** 94 audited, 0 flagged; **poles** 181, 0; **vehicles** 70, 0; **walkers** 40, 0.
- **props** 462, 5 flagged: `world:scoreboard`, `business:golf-pond`, `business:golf-bunker-crescent` have no contact shadow by override (a board
  on two posts; two flat ground pictures, which cast none either); `expansion:washing-line` and `expansion:satellite-dish` keep a small box at
  their pole under a wide picture (right: their base is the pole).
- **golf** 134, 3 flagged: `golf:leaderboard` x2 and `world:watertower` are measurement artefacts (the leaderboard's measure was taken at
  another scale; the water tower is drawn as a stand-in, a snack bar or a barn, whose shadow fits).
- **range** 63, 5 flagged: `expansion:washing-line` (as above); the covered bays' roofs x4 lean 25 to 30 px past the picture's foot (the
  lean, by design).
- **buildings** 547, 4 flagged: `business:stadium` x4 (measured at a scale past its pixel limit; drawn at its limit, the shadow fits that).
- **fences** 47, 3 flagged: the frontal fence panel views (`variation:expansion-fence-privacy-x-*`, `-gate-chainlink-x-*-ns`), see below.
- **total**: 1,638 audited, 20 flagged, none a real fault but the follow-ups below.

## The override table (src/game/shadow-overrides.json, 4 entries)

- `world:schoolbus`: hx 3.9, hy 1.0 (its library box is 1.7 times the bus's width).
- `world:scoreboard`: no contact shadow (a board on two posts: the cast shadow draws the posts).
- `business:golf-pond`, `business:golf-bunker-crescent`: no contact and no cast shadow (flat ground pictures).

Everything else is fixed by the rules and the picture fit, so the table stays the place for the owner's own tuning: add an entry by library id
(its NE view for four-view art), with a `note`. `tests/shadow-overrides.test.ts` checks every key names a library sprite or variation set, every
number is sane, and every entry says why.

## Follow-ups (not done here)

- The frontal fence panel views (`variation:expansion-fence-privacy-x-*`, `variation:expansion-chainlink-y-96c97f62-ns:*`, the gate
  variations) are drawn facing the camera while their footprint runs along a map axis: their strip runs diagonally under a level panel. A map
  axis shape cannot follow a screen-level panel; they need their footprints fixed (art) or a "no contact" override each.
- Two-post signs (the guide, recreation and local sign sets) get their spot at the post on the anchor, none at the other post.
- Override offsets (dx, dy) are not mirrored for a flipped sprite (only some old trees are drawn flipped; none has an offset).

## Sheets

On the dev PC (scratch, not committed): before `E:/ClaudeTemp/T141/before/`, after `E:/ClaudeTemp/T141/after/`. Each has every page of every
category at 30% (`<cat>-<n>-30pct.jpg`: trees 4, poles 5, props 12, golf 5, range 3, vehicles 2, walkers 1, buildings 31, fences 2) and at 2x
the golf and range categories in full (24 and 9 pages) and the first two pages of the others; `items-<cat>-<n>.json` (each page's entries and
shapes) and, in before/, `measure-<cat>.json` (each picture's measured base). Regenerate with the capture command above.

# T142: a hand-drawn vector shadow for every picture (#288)

The owner (2026-10-26), after T141's sheets: "clearly some are still screwed up ... can you put a smart opus on the shadows to vector draw each
shadow individually for all assets?" T141 placed every shadow from the footprint; where the footprint does not match the picture (the range's
covered bays, the leaderboard) the shadow came off the picture. T142 draws each picture's shadow from the picture itself, which also settles
T141's follow-ups above: the frontal fence panels' strips follow the panel as drawn, two-post signs get a spot under each post, and a mirrored
sprite draws a mirrored copy of its shapes (the sun's side kept).

## The data: src/game/shadow-shapes.json (one picture a line, 1,401 pictures)

By library id: `c` contact rings `[x, y, ...]` and `s` cast rings `[x, y, h, ...]` in the picture's display px about its anchor (world px at
scale 1; x right, y down the screen, so a point is the spot of the 2:1 ground drawn there). A cast vertex is the ground point (x, y) under a
point h px up the picture; it lands at (x, y) + h * the sun's shear (cast-shadow.ts castShear), so the gear menu's sun angle and length still
move it. A cast ring wound the other way is a hole (the gap under a bench). `f`/`p` the cast's soft rim and its growth with height, `fc`/`kc`/`cl`
the contact's rim, darkness and lean, `ks`/`fade` the cast's darkness and how much lighter it gets at its tip, `same` another picture's shapes,
`n` a hand note. An entry with no rings draws no shadow (a pond, a bunker).

## How it is made

1. **Draft** (src/game/dev/shadow-draft.ts, run over every picture by the dev page `?shadows=draft`;
   `node scripts/dev/draft-shadows.mjs --base http://127.0.0.1:5188/ [--only id,id]` writes the file):
   - each column's lowest opaque pixel; a column touches the ground when nothing stands lower in front of it (the iso tent, slope 1:2);
   - the ground line through the touching feet (a box's walls give its V, two posts the line between them), or flat at the lowest foot
     for trees, plants, poles and walkers;
   - a box's depth: the footprint diamond from the tent (near corner, side corners, the far corner opposite); pixels more than the walls'
     height above the near edge are roof standing further back (their height held, their foot moved back), so roofs do not cast the whole
     picture's height (the old silhouette shadows' fault at the back); a vehicle seen end on stands about its width tall;
   - the cast: every opaque pixel laid on the ground, filled, traced and simplified (at most 22 points a ring); trees and plants blurred
     into one soft shape; see-through things (a mesh, a lattice) lighter by how much of the shape their pixels really cover;
   - the contact: runs of touching columns (legs and posts as round spots, walls as a band along the ground line), one soft pool under a
     tree's trunk or a plant.
2. **Hand hints** (src/game/dev/shadow-hints.json, by id, variation set, or a four-view family's NE id with `"all": true`): `none`,
   `contact`/`cast` false or the contact's own rings, `ground` (iso / flat / its points), `box` (a long thing seen end on: the share of its
   picture that is its height), `depth: false`, `height`, `minH`, `groundBelow`, `clear`, the look numbers, and `n` (copied into the entry as
   its note). Re-run the draft after editing.
3. **Review** on the audit sheets: `node scripts/dev/shadow-audit.mjs --base ... --out <dir> --cats <cat> --scales 2 --q "&strips=both"`
   (`&strips=both`: the BOTH strip alone, three times as many pictures a page; `&old=1`: T141's shadows, for the before sheets). In game:
   `node scripts/dev/shadow-shots.mjs --base ... --out <dir>` (the range start, a hole, a street; before and after, 30% and 15%, 1x and 2x).

## The engine

- src/game/shadow-vector.ts builds one mesh for all pictures at load (ear clipping with hole bridging; each ring rimmed outward by its feather,
  edge 1 on the shape and 0 outside; a mirrored copy of each), two RGBA32F texels a vertex and an R32UI index texture (gl.ts initVector).
- sprites.ts packs one 16-float instance per sprite (anchor, scale, the mesh's range, the tile clip, the picture's rect) in each draw tile, cached
  like the old shadows; gl.ts drawVector draws a frame's instances in two instanced draws (meshes of up to 240 indices, and bigger ones), each
  instance running to its set's largest count (the rest fold away). The fragment: smoothstep of the rim, the darkness per vertex times the
  Shadows slider (contact) or the cast strength (fading out by night), the same cool multiply as before. Each tile's copy of a sprite draws only
  what falls from its part of the picture, so a sprite over several tiles draws once.
- A picture with an entry draws neither T141's contact shape nor its silhouette cast. Without one (the walkers' animated frames, new art) T141's
  rules stay: `VECTOR_FALLBACK` lists the deliberate ones, and tests/shadow-vector.test.ts fails for any other drawn picture without an entry
  (new art: run the draft for it).
- The gear menu (dev): "Drawn shadows (T142)" turns them off for comparison (localStorage `capitalempire.vectorShadows`).
