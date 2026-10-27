# The driving range: art to generate (paste-ready prompts, 2026-10-27)

Everything the driving range still draws with a stand-in, plus the few requests it has no picture for at all. The game marks each
stand-in on the map with a yellow "Stand In for ..." pill (`src/game/golf/rangebiz.ts rangeScene`, `rangehost.ts`). The tracker stays
`docs/GOLF-SPRITES.md` ("The range business kit", "Practice facilities"); this file gives the same items as prompts ready for the
image generator.

## How to use this list
1. **One subject per generation.** Start each prompt with the matching **shared block** (A, B, C or D below), then add the item's prompt.
2. **Attach the references in this order:**
   1. `art/theme-consistency/references/theme-authoritative.png`: the owner's Maple Bean street, the only style authority.
   2. The item's identity picture, when it lists one.
   3. For four-view sheets only, last: `art/theme-consistency/references/rotation-guide-v1.png` (geometry only).
3. **Check every result** before keeping it:
   - the background is truly transparent;
   - the four views are four real turns of the same object (the back is a real back, not the front mirrored);
   - the light is at the upper right in every view;
   - nothing is cropped.
4. **Save it** as `art/theme-consistency/generated/<category>/<slug>-4views-vN.png` with its provenance, as
   `docs/SPRITE-GENERATION-WORKFLOW.md` section 6 says. The item's game id is in brackets after its name.

Sizes are real-world metres (1 game unit = 1 m, a map tile is 2 m). The generated pixels are calibrated to the game later, so the sizes
are there for proportion, not pixel counts.

## The shared blocks

**A. Four views (buildings, signs and props that have a front).**
> ONE subject. Reference 1 is the only visual-theme authority: match its detailed illustrated miniature style, materials and light. A later reference, when given, is this subject's identity: keep its design. The last reference, when it is the camera-rotation guide, is a geometry diagram only: never copy its colours, boxes, labels or marker. Return one SQUARE PNG with true transparent alpha, a strict 2x2 grid of four separate cells in row-major order NE, SE, SW, NW: four genuine 90-degree turns of the SAME physical object, with the face pairs front+right, right+back, back+left, left+front. Reconstruct the real back and sides; never mirror a front and never repeat a view. Fixed parallel 2:1 isometric camera, ground axes +/-26.565 degrees, verticals vertical. Early autumn dusk: low warm sunlight fixed at SCREEN UPPER RIGHT in every cell, right-facing planes warmer, left-facing planes cooler, only tiny soft contact shadows toward SCREEN LOWER LEFT; practical lamps already warmly lit, still enough daylight to read every material. The year is 1985: no modern screens, LEDs, QR codes or present-day plastic signage. No people, no Halloween decoration, no ground tile, lawn, street, backdrop, haze, checkerboard, caption or frame, no neighbouring objects. Leave at least 15% clear transparent space round each view, including the centre gutters; shrink all four views uniformly so nothing is cropped. No lettering unless this prompt asks for it; lettering that is asked for reads correctly in every view.

**B. One view (small props that look the same from every side).**
> ONE subject on a SQUARE PNG with true transparent alpha, centred, one view only. Reference 1 is the only visual-theme authority: match its detailed illustrated miniature style. Fixed parallel 2:1 isometric camera, verticals vertical. Early autumn dusk: low warm sunlight from SCREEN UPPER RIGHT, a tiny soft contact shadow toward SCREEN LOWER LEFT. The year is 1985. No people, no ground tile, lawn, backdrop, checkerboard, caption or frame. Leave at least 15% clear space on every side. No lettering.

**C. Ground pictures, seen from straight above (mats, target greens, turf).**
> A ground picture seen from STRAIGHT ABOVE (orthographic top-down, no perspective, no isometric tilt), filling the whole square canvas edge to edge. Detailed hand-painted illustrated style matching reference 1's grass and paving. Soft even daylight with a gentle warm light from the upper right; no cast shadows except tiny ones under small objects, toward the lower left. No objects standing up out of the ground, no people, no lettering, no frame. No visible repeating pattern: every patch of it looks different.

**D. Eight facings (vehicles).**
> ONE vehicle, eight separate pictures of the SAME vehicle, one per facing: E, NE, N, NW, W, SW, S, SE (the direction its front points on the map). Each on its own SQUARE PNG with true transparent alpha, the vehicle centred with 15% clear space round it. Reference 1 is the only visual-theme authority: match its detailed illustrated miniature style. Fixed parallel 2:1 isometric camera, verticals vertical. Early autumn dusk: low warm sunlight fixed at SCREEN UPPER RIGHT in every picture whatever the facing, a tiny soft contact shadow toward SCREEN LOWER LEFT. Every facing is its own drawing: never mirror one facing to make another. The year is 1985. No driver or people, no ground tile, backdrop or caption.

## The list at a glance
| # | Item (game id) | Block | Size (m) | Stand-in in the game today | P |
| --- | --- | --- | --- | --- | --- |
| 1 | Tin-and-tarp pro shop (`golf:clubhouse-shanty`) | A | 12 x 8, 4 high | the rusty lean-to shed | P1 |
| 2 | Double-deck hitting stand, one section (`golf:range-deck`) | A | 20 x 7, 7 high | the covered bays drawn again a storey up | P1 |
| 3 | Coffee kiosk (`golf:range-coffee-kiosk`) | A | 3 x 2.5, 3 high | the fishing rental kiosk | P1 |
| 4 | The player's cottage (`golf:home-cottage`) | A | 6 x 5, 5 high | house 4 | P2 |
| 5 | "Driving Range" road sign (`golf:range-sign`) | A | 4 x 0.5, 3 high | the tournament leaderboard | P1 |
| 6 | Yardage board (`golf:range-yardage-board`) | A | 2 x 0.5, 2.5 high | the fishing notice board | P1 |
| 7 | Distance marker post (`golf:range-distance-post`) | B | 0.5 x 0.5, 1.5 high | the parking sign | P1 |
| 8 | Golf academy sign (`golf:range-academy-sign`) | A | 1.5 x 0.3, 1.8 high | the fishing notice board | P2 |
| 9 | Practice green sign (`golf:practice-sign`) | A | 1 x 0.2, 1 high | none | P2 |
| 10 | Floodlight mast (`golf:range-floodlight`) | A | 1 x 1, 12 high | the street lamp | P1 |
| 11 | Ball dispenser (`golf:range-ball-dispenser`) | A | 1.5 x 1, 2 high | a utility cabinet | P1 |
| 12 | Hitting bay divider (`golf:range-bay-divider`) | A | 1.5 x 0.2, 1.2 high | none (the mats stand open) | P2 |
| 13 | Range tee marker (`golf:tee-marker`) | B | 0.3, drawn 1.5x | none | P1 |
| 14 | White plastic garden chair (`golf:yard-plastic-chair`) | A | 0.5, 0.9 high | the striped lawn chair | P2 |
| 15 | Gas bottle on a braai stand (`golf:yard-gas-bottle`) | B | 0.5, 1 high | none | P2 |
| 16 | Practice green flag (`golf:practice-flag`) | B | 0.2, 0.9 high | a red pin at a fifth of its size | P2 |
| 17 | Range ball basket (`golf:practice-balls`) | B | 0.4, 0.3 high | none | P2 |
| 18 | Ball-picker cart (`golf:range-picker`) | D | 2.5 x 1.5 | a navy wood-panel wagon | P1 |
| 19 | Hitting mat (`golf:range-mats`) | C | 4.2 x 6 a bay | a dark pad and a green square | P1 |
| 20 | Target green (`golf:range-target-green`) | C | 12 to 20 across | the green preset disc | P1 |
| 21 | Divot-scarred range tee turf (texture) | C | a 16 m square | the tee turf | P1 |

P1 is the opening range and its first upgrades; P2 comes later. Items 22-26 (the end of this file) are ideas the game does not place yet.

## Buildings

**1. Tin-and-tarp pro shop** (`golf:clubhouse-shanty`, block A, P1). The range's starting shop, where golfers buy their buckets. It
has one picture today (no turns), so the game stands the lean-to shed in for it.
- Identity reference: `art/theme-consistency/exports/buildings/golf-clubhouse-shanty.configured@2x.png`.
- Full ready-made prompt: `art/theme-consistency/jobs/golf-clubhouse-shanty.prompt.txt`.
> Subject: golf:clubhouse-shanty, the driving range's starter pro shop, a makeshift tin-and-tarp shack, about 12 x 8 m and 4 m high. Keep the identity reference's design: plank walls in faded blue and grey paint, a rusty corrugated-tin roof with a blue tarp patch tied over it, a stovepipe chimney, small four-pane windows, an open doorway, a serving hatch with a timber counter on the front, a bench by the wall, a blue crate of range balls by the door. Small-budget, cheerful and cared for, not derelict. A bare-bulb lamp lit over the hatch.

**2. Double-deck hitting stand, one section** (`golf:range-deck`, block A, P1). The "Second tier of bays" upgrade: the game sets one
section over every four bays, side by side, so the two ends must join cleanly.
- Identity reference (for the style it must match): `art/theme-consistency/exports/buildings/business-golf-driving-range.configured@2x.png`, the covered bays already in the game.
> Subject: golf:range-deck, one section of a two-storey driving-range hitting stand, about 20 m long, 7 m deep and 7 m high, built in exactly the same style as the identity reference's covered bays: heavy timber posts on dressed-stone piers, timber knee braces with black iron brackets, a dark green standing-seam metal roof, warm lanterns under the eaves. Four open hitting bays on each storey, all open toward the front: green artificial-turf mats with a white rubber tee, dark green timber divider walls between the bays, a timber club rack in each bay. The upper deck is a timber floor on beams with a dark green steel safety rail along its open front. A steel stair with a handrail climbs to the upper deck at one end. Both short ends are clean and open enough to butt against an identical section beside it. Empty, no golfers.

**3. Coffee kiosk** (`golf:range-coffee-kiosk`, block A, P1). The "Coffee kiosk" upgrade, beside the shop on a small concrete patio.
> Subject: golf:range-coffee-kiosk, a small timber coffee kiosk at a 1985 driving range, about 3 x 2.5 m and 3 m high. Painted cream timber walls with dark green trim, a serving hatch with a fold-down counter on the front, a red-and-white striped canvas awning over the hatch, a chrome espresso machine and a stack of paper cups visible through the hatch, a blank dark green chalk menu board hung beside it (no writing), a warm light inside. A plain back wall with a small door and a gas bottle in a cage.

**4. The player's cottage** (`golf:home-cottage`, block A, P2). The player's home when they move up from the caravan (the second of
three homes; the third is the farmhouse already in the game).
> Subject: golf:home-cottage, a modest owner-built cottage beside a driving range, about 6 x 5 m and 5 m high. Whitewashed brick walls, a red-oxide corrugated-iron roof, a small covered stoep (veranda) across the front with a timber bench, a green front door, two sash windows with warm lamplight, a galvanised water tank on a timber stand at one side, a small satellite dish on the roof. Neat and cared for, a step up from a caravan, not a mansion. No garden beds or fence attached (the game places those).

**The six-storey car park's diagonal views:** skip them. Codex is drawing them now (T183, issue #459).

## Signs

**5. "Driving Range" road sign** (`golf:range-sign`, block A, P1). It stands at the range's drive, facing the road.
> Subject: golf:range-sign, a weathered roadside sign for a small 1985 driving range, about 4 m wide and 3 m high: a white painted board with a dark green trim on two stout timber posts, a red golf-flag-on-a-green motif at its left, and the words DRIVING RANGE in bold dark green capitals. The lettering must read correctly, left to right, in the two views that show the face; the back of the board is plain painted planks.

If the generator garbles the letters, make the board blank: the game can write the words on it.

**6. Yardage board** (`golf:range-yardage-board`, block A, P1). One stands beside each target green; the game writes the distance on it.
> Subject: golf:range-yardage-board, a driving-range yardage board, about 2 m wide and 2.5 m high: a white painted board with a green trim on two white posts, its face BLANK (the game writes a number on it), a small red flag finial on top. The back is plain painted planks.

**7. Distance marker post** (`golf:range-distance-post`, block B, P1). They stand down both sides of the range every 50 m; the game writes
the distance beside them.
> Subject: golf:range-distance-post, a short driving-range distance marker, about 1.5 m high: a square timber post painted in red and white bands, a small blank white plate on top (no number), set in the ground.

**8. Golf academy sign** (`golf:range-academy-sign`, block A, P2). By the academy's two lesson bays; the game writes on its plate.
> Subject: golf:range-academy-sign, a smart little golf academy sign, about 1.5 m wide and 1.8 m high: a dark green painted timber board on two posts with a gold crossed-golf-clubs crest at its top and a BLANK cream plate below it (the game writes the words). The back is plain dark green planks.

**9. Practice green sign** (`golf:practice-sign`, block A, P2). By the putting green the player builds.
> Subject: golf:practice-sign, a small sign by a practice putting green, about 1 m wide and 1 m high: a dark green timber board on one post, the words PRACTICE GREEN in white capitals, reading correctly in the views that show the face. The back is plain dark green planks.

## Equipment and props

**10. Floodlight mast** (`golf:range-floodlight`, block A, P1). The "Floodlights" upgrade: eight masts down the two sides keep the range open
till 22:00. Four views, because the lamps must point down the range whichever way the range faces.
> Subject: golf:range-floodlight, a tall galvanised-steel floodlight mast at a driving range, about 12 m high on a square concrete foot: a slim lattice or tube mast with a service ladder, at its top a bank of four rectangular floodlights on a crossbar, all angled down and forward toward the front. The lamps glow warm white, lit. Fit the whole mast, lamps included, inside each cell.

**11. Ball dispenser** (`golf:range-ball-dispenser`, block A, P1). The "Ball dispenser" upgrade: golfers fill a bucket themselves.
> Subject: golf:range-ball-dispenser, a 1985 coin-operated range-ball dispenser, about 1.5 m wide, 1 m deep and 2 m high: a green painted steel cabinet with a chrome coin slot and a small blank instruction plate on its front, a chute at waist height with a wire bucket of white range balls under it, a few balls on the ground at its foot. A plain back with a service door and a padlock.

**12. Hitting bay divider** (`golf:range-bay-divider`, block A, P2). A low wall between two open (uncovered) mats.
> Subject: golf:range-bay-divider, a low timber divider between two driving-range hitting mats, about 1.5 m long, 0.2 m thick and 1.2 m high: dark green painted planks on two short posts, a timber club rack fixed to one side holding two golf clubs, a small hook with a towel.

**13. Range tee marker** (`golf:tee-marker`, block B, P1). Marks the front of the tee box; the game draws it 1.5 times its real size so
it reads when zoomed out.
> Subject: golf:tee-marker, a single golf tee marker: a red painted timber block about 30 cm long, rounded at the ends, on a short spike, standing on its own.

**14. White plastic garden chair** (`golf:yard-plastic-chair`, block A, P2). For the caravan yard.
> Subject: golf:yard-plastic-chair, one ordinary white moulded-plastic garden armchair, about 0.6 m wide and 0.9 m high, a little weathered.

**15. Gas bottle on a braai stand** (`golf:yard-gas-bottle`, block B, P2). For the caravan yard.
> Subject: golf:yard-gas-bottle, a dented grey 9 kg LPG gas bottle with a brass valve and a rubber hose, standing beside a small black steel gas braai (barbecue) stand with a round grid, about 1 m high together.

**16. Practice green flag** (`golf:practice-flag`, block B, P2). In each cup of the practice green.
> Subject: golf:practice-flag, a short practice-green flagstick, about 0.9 m high: a thin white pole with a small yellow triangular pennant lifting in the breeze, a white cup liner showing in the hole at its foot.

**17. Range ball basket** (`golf:practice-balls`, block B, P2). Beside a golfer on the practice green or at a mat.
> Subject: golf:practice-balls, a wire basket of white range balls, about 40 cm across and 30 cm high, with a carry handle, three or four balls spilled on the ground beside it.

## Vehicle

**18. Ball-picker cart** (`golf:range-picker`, block D, P1). The "Ball picker cart" upgrade: after closing it drives up and down the
outfield picking up the balls.
> Subject: golf:range-picker, a small 1985 driving-range ball-picker cart, about 2.5 m long and 1.5 m wide: a dark green utility cart with a protective wire-mesh cage over its open cab (to stop flying balls), towing behind it a gang of three ball-picking units (rows of rubber discs between wheels that roll the balls up into trays), a wire basket of collected white balls on its back.

## Ground pictures

**19. Hitting mat** (`golf:range-mats`, block C, P1). One mat a bay; the bays stand side by side, so the mat's left and right edges must
join seamlessly into a strip.
> Subject: golf:range-mats, ONE driving-range hitting mat seen from straight above, about 4.2 m wide and 6 m deep: a concrete pad with a slightly worn green artificial-turf mat on it, a white rubber tee near the front edge, two or three white range balls beside it, a scuffed, flattened strike zone behind the tee. The left and right edges of the picture continue the concrete and must tile seamlessly when two copies are placed side by side.

**20. Target green** (`golf:range-target-green`, block C, P1). The "Target greens" upgrade: five round greens down the outfield. The game
lays it at any size, so it must look right scaled.
> Subject: golf:range-target-green, one round driving-range target green seen from straight above, filling the square: a smooth fine-cut inner green, a lighter mown collar ring round it, a faint darker ring at its outer edge where it meets the coarser outfield grass (the outfield shows only in the corners), a cup at the exact centre (no flag), a few white range balls lying scattered on it. No mowing stripes.

**21. Divot-scarred range tee turf** (texture, block C, P1). The turf of the range's tee box, where the uncovered bays hit off grass.
> Subject: a seamless ground texture of a busy driving range's tee turf seen from straight above, covering a 16 x 16 m area: short green fairway grass scarred with many small divots (oval patches of bare brown soil and torn turf, some filled with green-tinted sand), a few loose white golf tees and broken tee pieces. It must tile seamlessly on all four edges with no visible repeat: no single distinctive divot or patch that the eye picks out when it repeats.

## Not for the image generator: 3D golfer clips
These are animations of the 3D golfers, made with RUN.world and Meshy as `docs/HANDOVER-PEOPLE.md` says, not pictures. Listed so the
range's art is complete:
- `golf_range_tee_up` (P1): between shots at a mat, the golfer bends to take a ball from the bucket, tees it up and stands for a waggle.
- `golf_putt` (P1): a short pendulum putting stroke, head still.
- `golf_chip` (P1): a half swing with a wedge, from grass and from sand.
- `golf_coach` (P2): the academy pro stands beside a pupil, points at the ball, then mimes a slow half swing.

## Already in the game (no new art needed)
- **Buildings:** the covered bays (`business:golf-driving-range`), the pro shop (`business:golf-pro-shop`), the caravan, the farmhouse, its garage and glasshouse.
- **Furniture and fences:** the bench, the bin row, the bag trolley, the patio tables, the red flagsticks on the target greens, the chain-link and picket fences.
- **Yard props:** the washing line, braais, lawn chairs, cooler, swing seat, birdhouse.

## Ideas the game does not place yet (P3)
These would make the range richer, but nothing draws them today. Each needs a small ticket to place it before its art is worth making.

**22. Safety net poles** (block A). Tall timber poles with netting down the sides of the range, where it borders a road.
> Subject: a run of driving-range safety netting, one section about 10 m long and 12 m high: two tall creosoted timber poles with steel guy wires, a fine dark green net stretched between them, sagging slightly. Both ends clean so sections join.

**23. Bag stand rack** (block A). Beside the shop: golfers leave their bags here.
> Subject: a timber golf-bag rack about 3 m long and 1.2 m high, slots for six bags, three golf bags (tan, navy, red tartan) standing in it.

**24. Ball washer stand** (block B). At the end of the tee box.
> Subject: a classic green paddle-type golf ball washer on a short post, with a white towel hanging from it and a small litter bin at its foot, about 1.1 m high.

**25. Price board** (block A). Beside the shop's hatch; the game would write the bucket prices on it.
> Subject: a free-standing A-frame board, about 0.7 m wide and 1.1 m high, dark green with a cream trim and a BLANK chalk face.

**26. Bucket return trolley** (block A). Where golfers leave empty buckets.
> Subject: a low galvanised trolley about 1 m long with stacked empty wire range-ball buckets on it.
