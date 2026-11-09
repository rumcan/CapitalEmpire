# Golf sprites and textures: what to make (v6, 2026-10-21)

**The image generator's list, with prompts and the angle every item needs:** [GOLF-ART-LIST.md](GOLF-ART-LIST.md) (2026-10-27: the range, fun
targets, practice areas, pros and memberships, storage and maintenance, the course, the clubhouse, the tournament, people).

The art the golf events game needs ([GOLF-PLAN.md](GOLF-PLAN.md)): course furniture, the tournament's temporary structures,
people, vehicles and the painted surfaces. **Nothing here is a whole hole:** greens, fairways, tees, bunkers and water are
painted with the Paint tool (textures, section 6). Sprites are the objects that stand on them.

## 1. Rules every sprite follows (from GAME-PLAN 2.2 and ART-PIPELINE.md)
- **Camera and scale:** the TrickOrTreat iso camera (2:1, 128 px per tile native); real size by the owner's scale table (one game
  unit is 1 m); packed at 0.6x of the largest scale the game draws it at.
- **Facings:** unflipped art faces +Y, flipped art faces +X. **Buildings and stands need a front view and a rear view**, so they
  can face a hole or a road from any side. **Anything with lettering** (scoreboards, signs, banners, the tournament logo) needs
  its own art per side, because lettering is never mirrored.
- **No lettering in the generated art (the owner, 2026-10-21):** signs are pictograms, banners and boards are blank; lettering
  may be added by hand later, not now. So every golf sprite can be mirrored to face either way.
- **Readability at 30% zoom:** anything under about 0.5 m becomes a ground decal or is drawn slightly over-size (tee markers,
  ball washers, rakes: marked "decal or 1.5x" below).
- **No baked ground:** sprites come on transparent backgrounds with no grass under them. Shadows are soft and short, as on the
  existing sprites.
- **Making them:** RUN.world image generation through TrickOrTreat's sheet runner (`scripts/town-variations/runner.mjs`: sheets
  of 4–8 items on magenta, sliced into the builder library), read here through the prep scripts, never written into TrickOrTreat.
  RUN's current model makes 1024 px images (the 2K model is not on the plan), so big structures (the L grandstand, the
  hospitality village, the broadcast compound) need **one item per sheet** to keep their detail.
- **Priority:** **P1** for tiers 1–3 and the MVP (phases G1–G4), **P2** for tiers 4–5 (G5–G6), **P3** later (G8–G9).

## 2. Existing art we keep using
| Art (atlas id) | Use in golf mode |
| --- | --- |
| `business:golf-clubhouse`, `golf-pro-shop`, `golf-cart-garage`, `golf-halfway-pavilion` | The clubhouse area and the halfway house |
| `business:golf-practice-net`, `golf-driving-range` | The practice area; `golf-driving-range` is also the range's covered bays (`rangeScene`, until the range kit below, P1) |
| `business:golf-bench-course-map`, `golf-patio-table`, `golf-mower`, `golf-bag-trolley`, `golf-footbridge` | Course furniture |
| `business:golf-pin-red`, `golf-pin-yellow`, `golf-pin-red-equipment` | Flagsticks (until the new pin set) |
| `business:golf-cart-sw`, `golf-cart-se` | Golf carts: the SW and SE headings of the eight-facing set `business:golf-cart` (T351: art/golf-cart-20261109/README.md) |
| `business:bus-sw`, `bus-se`, `taxi-sw`, `taxi-se`, the 8-direction cars | Shuttles, taxis, spectators' cars |
| `ce:parking-*` (entrance and exit gates, P sign, kiosk, pay station, IN sign) | Spectator car parks |
| `business:hotel`, `motel`, `diner`, `sportsbar` | Town growth with the tournament |
| Townspeople (40 walkers) | Placeholder spectators until the spectator set |
| Forest and lot trees, hedges, flowers | Course landscaping |

**Retired in golf mode** (the holes are painted): `golf-fairway-curved`, `golf-fairway-dogleg`, `golf-green-kidney-flagged`,
`golf-green-unflagged`, `golf-bunker-organic`, `golf-bunker-crescent`, `golf-tee-box`, `golf-pond`. Also unused in golf mode, and
candidates to drop from the atlas for GPU memory: the Halloween sets (monsters, pumpkins, the arcade).

## 3. The course (everyday furniture)
| Sprite | Size (m) | Views and variants | Notes | P |
| --- | --- | --- | --- | --- |
| Flagstick and cup | 2.1 tall | flags red, yellow, white, blue; flag waving 2 frames; the tournament flag (logo) | thin: keep the stick 2 px at mip 0 | P1 |
| Tee markers | 0.3 | blue, white, red, gold, black pairs | decal or 1.5x | P1 |
| Tee sign (hole number, par, length) | 1.2 x 1.5 | numbers 1–18 as overlays; front and rear | lettering: per side | P1 |
| Ball washer and bench set | 1.8 wide | one set; a trash can | decal or 1.5x for the washer | P1 |
| Yardage posts (100, 150, 200) | 1.2 | 3 colours | decal or 1.5x | P2 |
| Out-of-bounds and hazard stakes | 1.0 | white, yellow, red | decal or 1.5x; in runs like fences | P2 |
| Bunker rake | 1.6 long | lying, standing | decal | P2 |
| Cart path signs, "To 10th tee" arrows | 1.0 | 2 | lettering per side | P2 |
| Drinking fountain / water cooler stand | 1.2 | 2 | - | P2 |
| On-course comfort station (restroom hut) | 4 x 3 | front, rear | - | P1 |
| Rain / lightning shelter | 4 x 4 | open wooden; stone | front, rear | P2 |
| Footbridges | 6–12 long | wood, stone, cart bridge | X and Y facings | P1 |
| Irrigation pump house | 3 x 3 | front, rear | - | P3 |
| Maintenance barn and yard (equipment, sand and soil piles) | 20 x 12 | front, rear | the superintendent's base | P2 |
| Greens mower, fairway mower, utility vehicle | 1.5–3 | 8 facings | movers (G7) | P2 |
| Sprinklers spraying | 0.3 + spray | 3 frames | evening flavour | P3 |
| Flower beds and planters by tees | 2–4 | 4 | the beauty score | P2 |
| Practice green flags (short, numbered) | 0.8 | 5 | - | P2 |
| Range kit: target flags, distance boards, ball dispenser, hitting bay dividers, mats, ball-picker cart | various | sets | the driving range every range start opens with (P22 T096; the rows are in "The range business kit" below) | P1 |
| Bag drop stand, bag racks, club storage | 2–4 | front, rear | by the clubhouse | P2 |

## 4. The tournament (temporary structures)
| Sprite | Footprint (m) / height | Views and variants | Notes | P |
| --- | --- | --- | --- | --- |
| **Grandstand S** (about 200 seats) | 16 x 8 / 5 | front, rear; empty and full (crowd layer) | modular end pieces | P1 |
| **Grandstand M** (about 1,000) | 40 x 12 / 9 | front, rear; empty, full | stairs, a sponsor scrim on the back | P1 |
| **Grandstand L horseshoe** (about 4,000) | 80 x 20 / 14 | front, rear, the two corner pieces; empty, full | one item per sheet; around the 18th green | P2 |
| Practice range grandstand | 24 x 8 / 6 | front, rear | - | P2 |
| **Main leaderboard** (the big manual board) | 8 x 3 / 7 | front, rear; blank board (names drawn by the game) | lettering by code, not in the art | P1 |
| Hole scoreboard | 2 x 1 / 2.5 | front, rear | - | P1 |
| Video screen on a trailer | 6 x 2 / 6 | front, rear | - | P2 |
| **TV camera tower** (scaffold, camera and operator on top) | 2 x 2 / 6, 10 and 15 | 3 heights; front, rear | "from camera stand": the tall ones see more holes | P2 |
| TV camera crane / jib | 4 x 2 / 8 | 2 | by the 18th | P3 |
| Camera operator on the ground, photographers' platform | 1–3 | 2 | - | P2 |
| **Broadcast compound**: outside-broadcast trucks, satellite uplink truck, cabins | 30 x 20 | trucks as single sprites, 4 facings | one item per sheet | P2 |
| Media centre (marquee) | 24 x 16 / 6 | front, rear | - | P2 |
| **Hospitality chalet** (white marquee with glass front) | 10 x 10 / 5 | front, rear; 2 sizes | sponsor-coloured trims as variants | P2 |
| Corporate hospitality village (double-deck pavilion) | 40 x 24 / 9 | front, rear | one item per sheet | P2 |
| **Entrance gate complex** (admission arch, ticket scanners, bag-check tables, metal detectors, staff) | 12 x 6 / 5 | front, rear; queue lane barriers | the tournament logo on the arch | P1 |
| Will-call / ticket office, info booth | 4 x 4 | front, rear | lettering per side | P1 |
| **Food tent** (pagoda tent with counter) | 8 x 8 / 4 | front, rear; burger, BBQ, pizza, ice cream, coffee signs | 5 variants | P1 |
| **Drinks tent / beer garden** (tent, benches, umbrellas) | 10 x 8 / 4 | front, rear | - | P1 |
| Concession kiosk | 4 x 3 / 3 | front, rear; 3 variants | - | P1 |
| Food trucks | 7 x 2.5 | 4 facings; 4 liveries | also drives in (a vehicle) | P2 |
| **Merchandise tent** | 12 x 10 / 5 | front, rear | caps and shirts on racks visible at the front | P1 |
| **Merchandise pavilion** (the big shop) | 30 x 20 / 8 | front, rear | one item per sheet | P2 |
| Picnic tables, umbrellas, standing tables | 2–3 | 3 | around the tents | P1 |
| Trash and recycling bin clusters | 1.5 | 2 | - | P1 |
| **Toilet block** (row of portable toilets) | 8 x 2 / 2.4 | front, rear | - | P1 |
| Luxury restroom trailer | 9 x 3 | front, rear | hospitality areas | P2 |
| First aid tent, ambulance parked | 6 x 6 | front, rear | - | P1 |
| Water refill station | 2 x 1 | 2 | heat (G8) | P2 |
| ATM booth | 1.5 | 2 | - | P3 |
| **Gallery rope and stakes** | runs (stake every 3 m) | a run piece, a corner, a crosswalk gap | laid in runs like the fence layer | P1 |
| Crosswalk gate (two marshals with "Quiet" paddles) | 4 | front, rear | - | P1 |
| Crowd barriers and event fencing with branded scrim | runs | 2 | laid in runs | P1 |
| Sponsor display: car on a plinth ("hole-in-one car") | 6 x 4 | 2 cars | - | P2 |
| Sponsor flags, banners, flagpoles with tournament flags | 1–6 tall | 4 | lettering per side | P1 |
| Directional signs (gates, parking, shuttles, grandstands) | 1.5 | 6 | lettering per side | P1 |
| Course map boards | 3 x 2 | front, rear | - | P2 |
| Trophy presentation stage (by the 18th green) | 10 x 6 | front, rear | the trophy on a table | P2 |
| Volunteer HQ tent, police command post (cabin with mast) | 8 x 6 | front, rear | - | P2 |
| Generator trailers, lighting towers | 3 x 2 / 8 (towers) | 2 | - | P3 |
| **Helipad with helicopter** | 20 x 20 | helicopter 4 facings, landing animation 3 frames | VIP flights at tier 5 | P3 |
| **Shuttle stop shelter and queue barriers** | 8 x 3 | front, rear | at the gates and park-and-ride lots | P1 |
| Park-and-ride sign, coach terminal shelters | 2–20 | front, rear | - | P2 |
| Ride-share pick-up / drop-off sign and kerb paint | 2 | 2 | kerb paint is a decal | P2 |

### The owner's additions (2026-10-21 night)
All P1, no lettering (pictograms or blank boards):
| Sprite | Notes |
| --- | --- |
| **Large plain white tents** (marquees, no branding) | 3 sizes (10 x 10, 15 x 10, 20 x 12 m); front and rear; the generic event tent |
| **TV cameras** | camera on a tripod with operator, camera platform, the camera tower (section 4, raised to P1) |
| **Course odds and ends** | gardening tools (rakes, shovels, wheelbarrow, hose reel, leaf blower), ball cleaners (ball washers), tee markers for the tee boxes (blue, white, red, gold) |
| **First-tee sign** | a blank board on posts (lettering later, by hand) |
| **Pro shop buildings** | 2-3 more variants beside `business:golf-pro-shop` |
| **Tables with umbrellas** | patio tables, café sets, picnic tables with parasols |
| **Golf estate gates** | a gatehouse and stone pillars with wrought-iron gates, sized for each road class that can enter the estate (lane, street, avenue) |
| **More grass, bushes, flower beds** | ornamental grass clumps, shrubs, flower beds and planters for tees and the clubhouse |
| **Flag poles** | single and in rows (plain coloured flags) |
| **Golf cart bridges** | both axes (X and Y facings; flipping gives the other two), wood and stone |

## 5. People and vehicles (movers)
**The spectators' brief is [SPECTATOR-ART.md](SPECTATOR-ART.md)** (2026-10-23: 3D people through the RUN CLI, the cast, every clip,
the wayward-ball scene); it replaces the spectator rows below.

| Sprite | Frames | Variants | Notes | P |
| --- | --- | --- | --- | --- |
| **Spectators** walking | 5 facings x 5 walk frames (the townspeople format) | 12+ people (caps, visors, umbrellas, kids) | crowds on walkways | P1 |
| Spectators standing / cheering / seated | 3 frames each | the same people | rope lines and grandstands (crowd layers) | P1 |
| **Pro golfers** | walk, address, swing (4 frames), putt (3), celebrate (2) | 6 (shirt colours) | the featured groups | P1 |
| **Caddies** with bags | walk, stand | 4 | with the pros | P1 |
| Everyday golfers (foursomes) | walk, swing, putt | 8 | the off-season | P1 |
| Marshals (Quiet paddles), volunteers, security, ticket scanners, vendors | stand, walk | 2 each | - | P2 |
| TV crew, photographers, officials (rules buggy) | stand, walk | 2 each | - | P2 |
| **Golf carts** | 8 facings | white, green; with bags | the 2-facing art is not enough | P1 |
| Marshal cart, media cart, official cart with flag | 8 facings | 3 | - | P2 |
| Courtesy cars (sponsor-branded sedans) | 8 facings | 2 liveries | players' transport (G8) | P2 |
| **Coaches** (charter buses) | 8 facings | 3 liveries | regional visitors (G6) | P2 |
| Police car, police officer directing traffic | 8 facings; 3 frames | - | the event traffic plan | P2 |
| Outside-broadcast trucks, delivery trucks, flatbed with tent parts | 8 facings | 3 | build-out and deliveries | P3 |
| Tractor with mower deck, utility vehicle | 8 facings | 2 | maintenance movers | P3 |

## 6. Painted surfaces (photo textures, Paint tool)
Generated with the RUN CLI (`scripts/assets/gen-grass-photos.mjs`, branch `claude/paint-wip`; images in the git-ignored
`output/grass-gen/` of the `photo-grass` worktree). Each one stands for a small patch (2–8 m) and is hex-mixed over large areas,
so 1024 px is plenty (section 1).

| Texture | Status (2026-10-21) |
| --- | --- |
| Fairway, New sod, Rough | **In the game** (the owner's photos, full resolution) |
| Putting green | Generated (test take; detailed at 1:1) |
| Concrete, Worn asphalt, Road gravel, Dirt, Field, Grass, Lush lawn, Worn lawn, Clover lawn, Meadow, Wildflowers | Generated (first takes, to review) |
| Asphalt, Dark asphalt, Gravel | Blocked by RUN's safety filter on every wording tried (false positives): new wording or references, or keep the code-painted ones |
| Fringe, Tee, First cut, Deep fescue, Bunker sand, Waste sand, Pine straw, Bark mulch, Spectator walkway, Wood chips | Generated (first takes, to review) |
| Pond water (still, with ripple variation), pond bank (mud and reeds), grow-in (bare soil with seedlings), divot-scarred range tee, field parking (grass with tyre ruts), event matting (plastic walkway panels), flower bed soil | **To make** (P1 except event matting P2) |
| Pavers, Slabs, Rocky dirt, Rocky dirt alt | Kept as they are (the owner: correct already) |

## 7. Counts
- P1: about 45 sprite items (with views and variants about 140 images) plus 7 textures: enough for tiers 1–3.
- P2: about 40 items (about 120 images): tiers 4–5.
- P3: about 12 items.
- The biggest single items (L grandstand, hospitality village, merchandise pavilion, broadcast compound) are one per sheet.

## Course piece props (T030b)
- Still missing: tee steps, a bunker rake, a pond waterfall, pond rocks, and pond reeds (reeds use the roadside ornamental grass for now). They plug into `PIECE_PROP_SPRITE` in `src/game/ext/course-pieces/index.ts` (a sprite id, or `null` until the art exists).

## The range business kit (plan P24 Phase 1, T129, the World of Golf extras, T133, and the range's look, P22 T096: art requests)
**Paste-ready prompts for every item below and in "Practice facilities":** [GOLF-ART-LIST.md](GOLF-ART-LIST.md) section 1 (2026-10-27).
The opening range (`golf/rangebiz.ts rangeScene`) stands these in with labelled stand-ins ("Stand In for ..."); each goes in by its id in
`rangeScene`. Four views (NE, SE, SW, NW as the building sheets: the front in NE and NW), sun at the upper right, shadows at 145°, early
autumn dusk, no lettering in the art unless said.
| Sprite (id to use) | Footprint (m) / height | Stand-in today | Prompt (short) | P |
| --- | --- | --- | --- | --- |
| Tin-and-tarp shack, four views (`golf:clubhouse-shanty` views) | 12 x 8 / 4 | `expansion:lean-to-shed` | the existing shanty picture (rusty corrugated tin, blue tarp roof patch, plank walls, a serving hatch with a counter, a crate of range balls) turned to four views | P1 |
| Range floodlight (`golf:range-floodlight`) | 1 x 1 / 12 | `world:streetlamp` | a tall galvanised floodlight mast with a bank of four rectangular lamps angled down the range, a concrete foot | P1 |
| Range yardage board (`golf:range-yardage-board`) | 2 x 0.5 / 2.5 | `poi:fishing-board` | a white painted board on two posts with a blank face for the game's number, a green trim | P1 |
| Range distance marker post (`golf:range-distance-post`) | 0.5 x 0.5 / 1.5 | `ce:parking-sign` | a short white-and-red striped post with a blank plate on top | P1 |
| Ball dispenser (`golf:range-ball-dispenser`) | 1.5 x 1 / 2 | `expansion:utility-cabinet` | a green metal range-ball dispenser with a coin slot, a chute and a wire bucket under it, a few balls on the ground | P1 |
| "Driving Range" road sign (`golf:range-sign`) | 4 x 0.5 / 3 | `golf:leaderboard` | a weathered roadside sign on two timber posts, white board with a red golf flag motif, the lettering DRIVING RANGE | P1 |
| Hitting bay divider (`golf:range-bay-divider`) | 1.5 x 0.2 / 1.2 | none (the mats stand open) | a low green timber divider between two hitting mats, a club rack on it | P2 |
| Range tee markers (`golf:tee-marker`, already requested) | 0.3 | none | the single red timber tee marker of T111 | P1 |
| Gas bottle and plastic garden chairs (`golf:yard-gas-bottle`, `golf:yard-plastic-chair`) | 0.5 / 1 | the striped lawn chair | a dented grey LPG gas bottle on a braai stand; a white plastic garden chair | P2 |
| Ball-picker cart (`golf:range-picker`, 8 facings as the cars: `cars:...:E..SE`) | 2.5 x 1.5 | the navy wood-panel wagon (T133, "Stand In for Ball picker cart" over it) | a small green utility cart with a wire-caged cab towing a gang of ball-picking discs, a basket of balls on its back; never mirrored, each facing its own picture | P1 |
| Double-deck hitting stand section (`golf:range-deck`, four views, T133) | 20 x 7 / 7 (two storeys) | the covered-bay building drawn again a storey up (`business:golf-driving-range`, "Stand In for the double-deck hitting stand") | one section of a World of Golf style two-storey hitting stand: four open bays a storey, green mats with rubber tees, timber dividers with club racks, a steel stair at one end, a green steel roof, the upper deck's rail along its front; the rangebiz.ts deck draws one per four bays | P1 |
| Coffee kiosk (`golf:range-coffee-kiosk`, four views, T133) | 3 x 2.5 / 3 | `business:fishing-rental-kiosk` ("Stand In for Coffee kiosk") | a small timber coffee kiosk with a serving hatch and counter, an espresso machine and paper cups, a chalk menu board (no lettering), a striped awning | P1 |
| Golf academy sign (`golf:range-academy-sign`, T133) | 1.5 x 0.3 / 1.8 | `poi:fishing-board` ("Stand In for Golf academy sign") | a dark green timber sign on two posts with a gold crossed-clubs crest and a blank plate for the game's words | P2 |
| The player's cottage (`golf:home-cottage`, four views, T133) | 6 x 5 / 5 | `world:house_4` ("Stand In for the player's cottage") | a modest whitewashed cottage with a corrugated-iron roof, a small stoep with a bench, a water tank on a stand at its side, a satellite dish | P2 |
| Golf pro coaching pose (`golf_coach`, the 3D golfers' 8 facings, T133) | 1 / 1.8 | the golfer's idle frame and the drive clip | a coach standing side-on to the pupil, one hand out pointing at the ball, then miming a slow half swing; 8 frames | P2 |
| Divot-scarred range tee (texture) | 16 m | the tee turf | listed in section 6 | P1 |
| Hitting mats strip (`golf:range-mats`, T096; one mat a bay, the bays 2.5 tiles apart) | 4.2 x 6 per bay / 0.05 | each open bay's dark pad (an `asphaltDark` patch) and a green tee square (scene patches) | a top-down decal of one artificial-turf hitting mat on a concrete pad: worn green turf, a white rubber tee, two or three range balls, a scuffed strike zone; tiles side by side into a strip, so its left and right edges match | P1 |
| Target green decal (`golf:range-target-green`, T096) | 12-20 across (radius 3-5 tiles) | the `range-green` preset disc with a raised, feathered collar (`ScenePatch` 'target') | a top-down round range target green: a smooth inner green, a lighter collar ring, a faint darker ring at the edge, a cup at the centre for the flag, a few balls lying on it; laid at any size, never rotated into a different look | P1 |
| Range golfer at a mat (`golf_range_tee_up`, the 3D golfers' 8 facings, T096) | 1 / 1.8 | the golfer's idle frame between drives, then the drive clip (`golf_drive`) | a golfer at a hitting mat between shots: bends to take a ball from the bucket at the mat, tees it up, stands up for a practice waggle; then the existing drive clip; 8 frames | P1 |
| Car park building (`golf:range-carpark`, four views, T146) | 18 x 26 / 12 (ground, three decks and the open roof deck) | **In (T154):** `ce:parking-garage-6storey`, the art model's parking garage (five covered levels at 36 cars: GARAGE_CARS 180), drawn from its screen-axis views (N, E, S, W, one per quarter turn) at scale 0.6 so it sits inside the footprint; no label. **Still wanted:** its four diagonal views NE, SE, SW, NW (`parking-garage-6storey-8views`: the eight-view contract), so it lines up with the range's lot, whose edges run along the world axes | the existing 6-storey parking garage (brick columns with cream caps, warm-grey floor bands, dark green rails, warm ceiling lights, the rear-right stair tower, the green P sign by the ramp) turned to the four diagonal headings. The house lighting: the sun at the upper right, shadows at 145°; never mirrored, each view its own picture. `rangeScene` places it at frame u 49..58, v 2..15 with its foot, its ramp facing the frame's +u | P1 |

## Practice facilities (plan P24 Phase 2, T130: art requests)
The practice greens the player paints (`golf/practice.ts`, golfers in `golf/rangebiz.ts RangeSim`) stand these in; the stroke clips go into the
3D golfer sheets (`library.ts GOLFER_CLIPS`, the eight facings, as `golf_drive`) and replace the frames `RangeSim.view` picks today. Sun at the
upper right, shadows at 145°, never mirrored.
| Sprite (id to use) | Footprint (m) / height | Stand-in today | Prompt (short) | P |
| --- | --- | --- | --- | --- |
| Putting stroke clip (`golf_putt`, the 3D golfers' 8 facings) | 1 / 1.8 | the drive clip's address, takeaway and impact frames ("Stand In for golfer putting clip" over the green) | a golfer bent over a putter, a short pendulum stroke back and through, head still, holding the finish; 8 frames | P1 |
| Chipping stroke clip (`golf_chip`, 8 facings) | 1 / 1.8 | the whole drive clip ("Stand In for golfer chipping clip") | a half swing with a wedge, hands to hip height, a short follow-through, from grass and from sand (a little spray); 10 frames | P1 |
| Practice green cup flag (`golf:practice-flag`) | 0.2 / 0.9 | `business:golf-pin-red` at 0.2 scale | a short practice-green flagstick, a small yellow triangular pennant, a white cup liner showing at its foot | P2 |
| Putting green sign (`golf:practice-sign`) | 1 x 0.2 / 1 | none | a small dark green timber sign on one post, the lettering PRACTICE GREEN in white | P2 |
| Range ball basket (`golf:practice-balls`) | 0.4 / 0.3 | none | a wire basket of white range balls on the grass, a few spilled | P2 |

## Screen-axis sets in the game, their diagonal views wanted (T154)
The art model's `<slug>-screen-axis-4views-v1` sets are in the game (`scripts/assets/prep-axis-views.mjs`, record in `art/axis-views/INDEX.md`).
Their views are the cardinal headings N, E, S, W of the eight-view contract (HANDOVER.md: NE, SE, SW, NW, N, E, S, W). The subjects new with
them are drawn from those four views (one per quarter turn), so on the world-axis roads and lots they stand 45 degrees off until their
**diagonal views NE, SE, SW, NW** exist; these are wanted, as eight-view sheets (`<slug>-8views-vN`, the same subject, its existing four views kept
byte for byte):
| Subject (id) | Has | Missing | P |
| --- | --- | --- | --- |
| Parking garages, 2 to 6 storeys (`ce:parking-garage-<n>storey`) | N, E, S, W | NE, SE, SW, NW (the 6-storey first: the range's car park) | P1 |
| Shrubs: deep green, golden russet, sage round (`landscape:bush-*`); pale hydrangea (`landscape:hydrangea-pale`) | N, E, S, W | NE, SE, SW, NW | P2 |
| Flower beds: daisies, lavender, marigolds (`landscape:flowerbed-*`) | N, E, S, W | NE, SE, SW, NW | P1 |
| Bench, street lamp, trash can, car park entrance gate (`world:bench`, `world:streetlamp`, `world:trashcan`, `ce:parking-entry`) | N, E, S, W (beside their old pictures) | NE, SE, SW, NW | P2 |
| Pickup (`static:pickup_n`, the pickup model) | N, E, S, W | the four diagonal headings, as an eight-way car (art/cars) | P2 |
The shops and houses with screen-axis sets (`town:bakery`, `town:grocery`, `town:pharmacy`, the three industrial variations, `world:house_0`,
`_1`, `_3`) keep their diagonal views; their N, E, S, W views are extra headings (`view:<id>:n|e|s|w`) the roads at 45 degrees take in T154 Phase 2.
The world trash can's set had no crops yet (cut from its sheet by its subjects) and the 4-, 5- and 6-storey car parks' half-cell crops clip
their subject (re-cut from the sheet the same way): the art model may want to review those cuts.

## Buildings on the roads at 45 degrees: their cardinal views wanted (T154 Phase 2)
On a road at 45 degrees a building with a screen-axis set faces its street. A lot's front faces its street: N on road 1, E on 3, S on 5, W on 7
(`lots/preset-art.ts roadView`). It is never mirrored, and its footprint and anchor come from the set. A building without a set is drawn in its
diagonal view, at 45 degrees to the road, as before. 14 buildings have a set: the five parking garages, `town:bakery`, `town:grocery`,
`town:pharmacy`, the three industrial variations, and `world:house_0`, `_1` and `_3`. A variation (`variation:<base>-<hash>:1`) is its own picture
and needs its own set. **Wanted: the N, E, S, W views** of the buildings below, as eight-view sheets (`<slug>-8views-vN`: the existing four views
kept byte for byte, plus the four cardinal ones). The buildings the owner's presets of the 45-degree roads draw today come first (counted
2026-10-27 over `lot-presets.json`):
| Building (id) | Presets at 45 degrees | P |
| --- | --- | --- |
| House 5 (`world:house_5`) | 13 (12 approved) | P1 |
| Colonial L-shape, double garage, variation 1 (`variation:gen-house-l-shape-e0e3b328-plain:1`), and its base `gen:house-l-shape` | 3 + 1 | P1 |
| House 2 (`world:house_2`) and its variation `variation:world-house_2-north-332663ab-plain:1` | 2 + 1 | P1 |
| House 0, variation 1 (`variation:world-house_0-51fa4b80-plain:1`) | 1 | P2 |
| House Large, variation 1 (`variation:ref-building-house-large-20cb9f9e-plain:1`) | 1 | P2 |
| Ranch L-shape, corner porch, variation 1 (`variation:gen-house-l-ranch-18552ce5-plain:1`) | 1 | P2 |
| House Dormer, variation 1 (`variation:ref-building-house-dormer-b4413f08-plain:1`); Bellamy Hardware, variation 1 (`variation:town-hardware-bf36737f-plain:1`) | 1 draft each | P2 |
| House back, shed and garden (`gen:back-shed-garden`); weathered timber outhouse (`expansion:outhouse`) | 1 each | P2 |

All the presets place 74 different buildings; 65 of them have no set yet (houses 28, industry 14, shops and services 9, landmarks 9, yard
buildings 5). The library holds 165 building subjects, 14 of them with a set. By how often the presets place them, the next ones wanted are:
`town:postoffice` (193), `expansion:boarded-store-rear` and its variation (42 + 82), `expansion:lean-to-shed` (73), `world:school` (56),
`expansion:outhouse` (53), `world:arcade` and its variation (51 + 45), `expansion:derelict-two-storey` (49), `static:garage_brick-v2` and its
variation (39 + 32), `ref:building-gas-canopy` (39), `world:house_5` (38), `world:video` (38), `world:diner` (38), `world:video_rental` (37),
`world:snack_bar` (35), `expansion:rundown-house` (34), `town:laundromat` (33), `static:garage_timber` (31), `ref:landmark-water-tower` (27),
`static:garage_brick` (26), `world:house_2` (25), `world:house_4` (20).

T298 (#883, the shopping centre, `lots/centre.ts`): on a road at 45 degrees a centre shows only the three shops with a set (bakery, grocery,
pharmacy). **Wanted next, P1:** the N, E, S, W views of `world:video`, `world:video_rental`, `town:laundromat`, `town:fish_tackle` and
`town:barber`, so a centre (and a shop lot) on those roads shows the whole palette; and the wheel stop (`expansion:wheel-stop`) at the screen
headings. T296 (#881): until it lands, every car park whose rows are not along a world axis (the screen-straight streets and any free angle) paints its
stops on the ground (a concrete bar with its shadow, `LotPatch.stops`, renderer.ts drawLots); the picture stays on the map-axis streets. **Wanted, P2:**
`expansion:wheel-stop` in the two screen headings (lying across the screen and up it), a 1.7 m precast concrete kerb stone with two bolt holes, sun at
the upper right, so the painted stand-in can give way on the screen-straight streets (any other angle keeps the painted stop).

## Props kit (plan P24 Phase 3, T131: art requests)
The Props tool (`golf/decor.ts DECOR`) shows these as labelled stand-ins ("Stand In for ..." on the card and once per kind on the map); each
goes in by replacing its item's `id` (and dropping its `standIn`). Four views where it says so (NE, SE, SW, NW as the building sheets: the front
in NE and NW), sun at the upper right, shadows at 145°, early autumn dusk, no lettering, never drawn to be mirrored.
| Sprite (id to use) | Footprint (m) / height | Stand-in today | Prompt (short) | P |
| --- | --- | --- | --- | --- |
| Bronze golfer statue (`golf:prop-golfer-statue`, four views) | 1.5 x 1.5 / 3 | `expansion:coin-horse-ride` | a bronze golfer at the top of his follow-through on a square dressed-stone plinth with a plain bronze plaque | P1 |
| Stone pillar (`golf:prop-stone-pillar`) | 0.8 x 0.8 / 2.2 | `world:grave_2` | a square sandstone gate pillar with a moulded cap and a stone ball finial, a little lichen at the foot | P1 |
| Club flag pole (`golf:prop-flag-pole`) | 0.5 x 0.5 / 8 | `business:golf-pin-red` (scaled up) | a tall white aluminium flag pole on a concrete foot, a dark green club flag with a small gold crest lifting in the breeze | P1 |
| Flower bed (`golf:prop-flower-bed`) | 3 x 1.5 / 0.5 | **In (T154):** `landscape:flowerbed-daisies` (and the lavender and marigold beds, new Props items), screen-axis views; **still wanted:** their diagonal views (below) | a raised bed edged in brick, massed red and yellow annuals with a clipped box edge, dark mulch between | P1 |
| Tiered garden fountain, small (`golf:prop-fountain-small`, four views) | 2 x 2 / 1.8 | none (the plaza fountain is real art) | a two-tier cast-stone fountain in a round basin, water spilling from the top bowl, wet stone darker | P2 |
| Stone entrance arch (`golf:prop-entrance-arch`, four views) | 5 x 1 / 4 | none (the ivy garden arch is real art) | a dressed-stone arch on two pillars over a path, a blank stone keystone, low hedges either side | P2 |
| Classical urn on plinth (`golf:prop-urn`) | 0.8 x 0.8 / 1.6 | none | a stone urn on a square plinth spilling trailing ivy and white petunias | P2 |

## Town buildings (T187, Town decoration › Buildings: art requests)
The few buildings a golf game's player adds to the town (`golf/decor.ts DECOR`, group `buildings`) use the library's own art: the plaza fountain
(`ref:landmark-fountain-v2`), the bus shelter (`town:bus_stop`), the toilet block (`golf:toilet-block`) and the white chapel (`variation:world-church-44e76535-plain:1`).
These are missing and offered only once drawn (four views, sun at the upper right, shadows at 145°, early autumn dusk, no lettering):
| Sprite (id to use) | Footprint (m) / height | Today | Prompt (short) | P |
| --- | --- | --- | --- | --- |
| Park bandstand (`town:bandstand`, four views) | 6 x 6 / 5 | `world:gazebo` is a stand-in (not offered) | an octagonal white timber bandstand on a low brick base, a green shingled roof with a small cupola, steps on one side | P1 |
| Bronze statue on a plinth (`town:statue-founder`, four views) | 2 x 2 / 4 | none | a bronze figure of a town founder in a frock coat on a dressed-stone plinth, a little green patina | P2 |
| Town hall annex (`town:townhall-annex`, four views) | 12 x 8 / 7 | none | a small two-storey brick civic building with a white portico and a flag, autumn trees beside it | P2 |

## Build-tool tiles (T233, #674: art requests)
Art 174's twelve tiles show on the Course and Facilities flyouts' tools (`ui/tool-tiles.ts`). These tools still show their icon, mark or swatch on
the tile's navy square; a second sheet in 174's style would finish the panel (one tiny isometric diorama per tile on a dark navy rounded square
#1E2A44, a 4 x 3 grid on charcoal #1C1F26, the light from the upper right, the same scale as 174, no lettering):
| Tile (file name in `src/assets/ui/tiles/`) | For | Prompt (short) | P |
| --- | --- | --- | --- |
| `waste` | Course › Shape by hand › Waste area | a patch of pale waste sand with scattered pebbles, dry grass tufts and a little scrub | P1 |
| `halfway-house` | Course › Buildings › Halfway house | a small timber snack hut with a striped awning and a bench | P1 |
| `your-holes` | Course › Holes › Your holes | a tiny fairway running to a green with a flag, a tee at the near end (a whole hole) | P2 |
| `tournament` | Course › Tournament | a small white grandstand and a scoreboard beside a green | P2 |
| `land` | Course › Land for sale | a bare dirt plot inside a white dashed line with a For Sale post (no lettering on the sign) | P2 |
| `bushes` | Facilities › Plants › Bushes | a few autumn shrubs, scarlet burning bush and golden spirea | P2 |
| `palms` | Facilities › Plants › Palms | two palms on a sandy grass patch | P2 |
| `props` | Facilities › Decoration › Props, All props | a bench, a lamp post and a planter on a paved square | P2 |
| `furniture` | Decoration › Props › Furniture | a patio table with a red umbrella and two chairs | P2 |
| `long-grass` | Course › Shape by hand › Long grass (wears `rough` today) | a patch of tall, wispy golden-green long grass, looser than rough | P1 |
| `chipping` | Facilities › Practice › Chipping green and bunker (wears `bunker` today) | a small chipping green with a flag, a bunker beside it, a few balls | P2 |
| `build` | Facilities › Build on your property; Range › Build | surveyor's stakes with orange tape and a wheelbarrow of turf on a lawn edge | P2 |

| `pro-office` | Course › Buildings › Pro's office (T214; wears `clubhouse` today) | a small white clapboard office with a green door and a "Pro" window, a flag on a short pole | P2 |
| `teaching-hut` | Facilities › Practice › Teaching hut (T214; wears `snack-hut` today) | a tiny timber hut with an open front, a bucket of balls and an alignment stick beside it | P2 |

All twelve are art 181, one sheet in the ChatGPT queue (`docs/art/CHATGPT-IMAGE-QUEUE.md`, first). Sheet order, row by row: waste,
halfway-house, your-holes, tournament / land, bushes, palms, props / furniture, long-grass, chipping, build.

## Shop fronts, venues and house backs for variety (T270, #811: art requests)
Shop lots now show the shop their place calls for (`lots/variety.ts`): eight shop fronts (`SHOP_PALETTE`: bakery, Maple Falls Grocery,
pharmacy, Video, laundry, Video Vault, fish and tackle, barbershop) take turns along every street, so neighbours never match, but a town of
16 shops shows each one about twice, and the two named ones (Video Vault, Maple Falls Grocery) about once in eight. More shop fronts spread
them thinner; the tour lots have only three venues (`VENUE_PALETTE`), so two venues can still match two or three lots apart. Each in four views
(the NE view's id below, `east:`/`view:<id>:sw`/`:nw` as the others), sun at the upper right, shadows at 145°, early autumn dusk, about the
footprint of the existing shops (5-7 x 4-5 tiles at their owner size) so they fit the presets' spots:
| Sprite (id to use) | Footprint (m) / height | Today | Prompt (short) | P |
| --- | --- | --- | --- | --- |
| Hardware store (`town:hardware`, four views) | 13 x 9 / 7 | only the straight-on `variation:town-hardware-...-plain:1` (frontal.ts: never on a lot) | a two-storey brick hardware store "Bellamy Hardware" with a green awning, tools and paint cans in the windows, a wheelbarrow out front | P1 |
| Florist (`town:florist`, four views) | 10 x 8 / 6 | none | a narrow timber shop front painted sage green, buckets of mums and pumpkins on the sidewalk, a striped awning, a hand-painted sign "Petal & Stem" | P1 |
| Book and record shop (`town:books`, four views) | 10 x 9 / 6 | none | a brick shop with a deep bay window full of books and LPs, a wooden sign "Second Chapter", warm lamp light inside | P1 |
| Hair salon (`town:salon`, four views) | 9 x 8 / 5 | none | a single-storey stucco salon with a pink neon "Curl Up & Dye" sign, two chairs visible through the window | P2 |
| Shoe repair and tailor (`town:cobbler`, four views) | 8 x 8 / 6 | none | a small two-storey brick shop, a hanging boot sign, "Main St Shoe Repair" painted on the glass | P2 |
| Bank branch (`town:bank`, four views) | 13 x 10 / 8 | none | a small sandstone bank with two columns, a clock over the door, "Maple Falls Savings" carved on the lintel | P2 |
| Ice cream parlour (venue, `world:ice_cream`, four views) | 9 x 8 / 5 | none | a pastel candy-striped parlour with a giant cone on the roof, café tables out front | P1 |
| Mini golf hut (venue, `world:minigolf_hut`, four views) | 8 x 7 / 5 | none | a timber hut with a windmill gable and a ticket window, a putter rack and a little course flag beside it | P1 |
| Pro shop and tackle (venue, `world:outfitter`, four views) | 11 x 8 / 6 | none | a timber outfitter with golf bags and fishing rods in the window, a canoe on the roof rack of a pickup outside | P2 |
| A house back of the screened porch's size (`gen:back-porch-small`, four views) | 7 x 10 / 6 | `gen:back-screened-porch` is the only back of its size (no other back fits its lots: the lab's 14x10 house presets of roads 4 and 6 all show it) | the back of a small clapboard house with a screened porch, a grill and a hose reel, laundry on a line | P1 |
| Two more small house backs (`gen:back-deck-small`, `gen:back-mudroom`, four views) | 7 x 10 / 6 | none | the backs of small houses: a timber deck with a kiddie pool; a mudroom door with boots, a woodpile and a garden shed | P2 |

## Waterside trees (T265, #794: art requests)
The tree belts along the rivers and creeks (`src/game/river-trees.ts`) deal the library's broadleaf trees, birches and aspens first, and some
spruces and firs; the library has no waterside species of its own. Wanted, each as four views (ne, se, sw, nw, `gen:tree-<name>:<view>` like
the generated trees), the light from the upper right, shadows at 145°, autumn colours to sit with the maples and birches, never mirrored:
| Tree | Look | P |
| --- | --- | --- |
| `willow-weeping` | a broad weeping willow, its long drooping fronds reaching the ground, gold-green to yellow in autumn | P1 |
| `alder` | a narrow, many-stemmed alder by the water, dark green going olive and brown, small cones | P2 |
| `swamp-snag` | a dead grey tree standing in the swamp, broken top, a little moss at its foot (the woods' snags are drier) | P2 |

Until they come, the belts use the existing pools (`BELT_BROAD_DEAL`, `BELT_CONIFER_DEAL`, the woods' dead snags in the swamp); a new species
goes into `FOREST_BROADLEAF` (or a waterside pool in `river-trees.ts`) and `tree-sun.ts` measures its lit side.

## Grounds crew (T269, #810: art requests)
The grounds crew works the course every morning (`src/game/golf/crew.ts`, played back by `crewview.ts`, drawn by the engine's `crewMovers`):
greenkeepers drive a utility cart green to green and change the cups (walk to the new spot, kneel and cut it, set the flag, walk back, kneel and
fill the old one), mow the greens with a walk-behind and rake the bunkers; mower operators ride a reel mower along the fairway's stripe bands and a
rotary mower down the rough. Until the art lands each is drawn as a labelled stand-in ("Stand In for <name>", the T213 caddie's pill).
**The people and their clips are 3D work for RUN 3D** (`docs/HANDOVER-PEOPLE.md` "Grounds crew"); the vehicles are best made in 3D too
(eight facings), else as 2D pictures through the ChatGPT queue. The sun at the upper right, shadows at 145°, nothing mirrored.

| Sprite (id to use) | Frames / views | Today's stand-in | Look | P |
| --- | --- | --- | --- | --- |
| **Greenkeeper** (`staff_greenkeeper_m`, a person) | 8 facings: walk, idle, kneel and cut a cup (a hole-cutter twist, 4 frames), set the flag (2), rake (a bunker stroke, 4), push a walk-behind (walk with the arms out) | the spectator `spec_m_bucket_hat`, walking; `sit` for kneeling | 1985 greenkeeper: a cap or bucket hat, a green or khaki work shirt, khaki trousers, work boots | P1 |
| **Mower operator** (`staff_mower_m`, a person) | 8 facings: walk, idle, ride (seated, hands on the wheel or the levers), push a walk-behind | the spectator `spec_m_young_cap`; `sit` on the mower | a cap and ear defenders, a work shirt, jeans | P1 |
| **Ride-on reel mower** (`vehicle:fairway-mower`) | 8 facings | `business:golf-mower` (one view) | a 5-gang fairway reel mower, about 2.5 x 2.5 m, deep green with yellow reels, an open seat | P1 |
| **Utility cart** (`vehicle:utility-cart`) | 8 facings | the hire cart `business:golf-cart-sw/se` (two views) | a two-seat utility vehicle with a cargo bed: a hole cutter, a cup and flag, a rake and a bucket of sand in the bed | P1 |
| **Walk-behind greens mower** (`vehicle:greens-mower`) | 8 facings | `gen:lawnmower` | a 1980s walk-behind greens reel mower with its grass basket at the front | P2 |
| **Rotary rough mower** (`vehicle:rough-mower`) | 8 facings | `expansion:rideon-mower` (one view) | a ride-on rotary mower with a wide deck, red or green | P2 |
| **Maintenance barn** (`course:maintenance-barn`, 2D, four views) | four views | none: the crew come and go at the clubhouse car park's entrance | a timber barn with a wide roll-up door, a fuel tank and a sand bin beside it, about 14 x 10 m | P3 |


## Farms (T259, #759: GOLF-ART-LIST 185-189, the slots and the swap)
The farms' model 2 (`src/game/ext/farms/farms.ts`, `crops.ts`): the farmhouse and yard set back 60-120 m on a dirt lane lined by a windbreak, the
fields round them by the calendar month (ploughed December to May, young corn June and July, ripe corn August to October, stubble in November,
each field a month early, on time or late), an orchard's strict grid on some farms. Until the art lands every piece is a labelled stand-in
("Stand In for <name>", the pills shown with the stand-ins on), and **each piece's swap is one line**: name the art in its slot below.
The prompts are in `docs/art/CHATGPT-IMAGE-QUEUE.md` "Farms". The sun at the upper right, shadows at 145°, nothing mirrored.

| Art | Slot (the one line) | File names (the queue's) | Today's stand-in |
| --- | --- | --- | --- |
| **185 corn, young** | `painted-surfaces.json` `surfaces.cornYoung` (rows along the map's x) and `cornYoungY` (rows along y): `{ "family": "<the tile set's family>", "version": null, "scale": 1, "tint": "#ffffff", "tone": 0 }` | `corn-young-30.png`, `corn-young-10.png` | the field's soil (Farm fields, `dirt-run`) with green rows of plants drawn along the field (`crops.ts` ROW_LOOK.young) |
| **185 corn, ripe** | `surfaces.cornRipe` / `cornRipeY` | `corn-ripe-30.png`, `-10` | tan-gold rows, nearly closed, their shadows in the gaps (ROW_LOOK.ripe) |
| **185 corn, stubble** | `surfaces.cornStubble` / `cornStubbleY` | `corn-stubble-30.png`, `-10` | short pale stalks in rows over the soil (ROW_LOOK.stubble) |
| **186 ploughed field** | `surfaces.fieldPloughed` / `fieldPloughedY` | `ploughed-30.png`, `-10` | dark furrows with a lit ridge beside each, along the field (ROW_LOOK.plough) |
| **187 orchard trees** | `farms.ts` `ORCHARD_ART`: the library id for each leaf stage (`open` summer, `moderate` autumn, `patchy`, `near-bare` winter) | `orchard-apple-red-1view-v1.png`, `orchard-pear-1view-v1.png`, `orchard-apple-young-1view-v1.png`, `orchard-apple-bare-1view-v1.png` | the capital oaks or maples (one species an orchard) at 0.62 of their size, through their own leaf stages |
| **188 windbreak poplars** | `farms.ts` `POPLAR_ART`: `greengold` (April to September), `gold` (October, November), `bare` (December to March) | `poplar-gold-1view-v1.png`, `poplar-greengold-1view-v1.png`, `poplar-bare-1view-v1.png` | the gold birch (`ref:tree-birch-gold`) on most farms, a row of spruces on the rest |
| **189 farm lane** | `surfaces.farmLane` | (P2: a two-rut dirt lane with a grass strip, or a dirt path family that reads right) | the Dirt surface with a hard edge and two wheel ruts drawn along it (the ruts stay with the art: they follow the lane) |

- **For the lead (the queue): the ground pictures in a second direction.** The owner's method repaints a game screenshot, so a tile keeps the
  direction its rows were painted in; a painted texture is laid unturned (its light would turn with it). A field takes the slot of the map axis
  nearest its rows, so 185 and 186 want each picture twice: rows from the upper left toward the lower right (the queue's, the `x` slot) and
  rows from the upper right toward the lower left (the `y` slot). With only one in, the fields of the other axis keep the stand-in rows.
- **The sprites** (187, 188) go through the art pipeline as one-view trees (`tree-sun.ts` measures their lit side; nothing is mirrored): add
  them to the library, then name their ids in `ORCHARD_ART` / `POPLAR_ART`. The orchard keeps its 6 m grid and the windbreak its 6.4 m
  spacing whatever the picture.
- **Old saves:** a save made before T259 keeps its farms as they were (model 1) until a farm is rebuilt (a road edit that changes its parcel,
  a new farm on a new road); new games get model 2. The dev switch `window.__game.setFarmModel(1 | 2)` changes a game's farms at once.

## Fences along screen-straight streets (T314, #899: art requests)
The town's fence pictures (picket, board/privacy, chain-link, iron, the hedge pieces) all run along the map axes, which are the screen's diagonals. A lot on
a screen-straight street (a map diagonal) has its boundary lines along the screen's vertical and horizontal, where an iso panel saws (and the composer
drops it, its turned box leaving the lot). Until these exist, those lots plant a clipped hedge of round shrubs on their owned lines (`autolot.ts` boundary).
- **Board fence, screen-horizontal run** and **screen-vertical run** (2 pictures; 4 m of fence each, the sun at the upper right, shadows at 145°).
- **Picket fence**, the same two runs.
- **A gate** for each (the drive's gap).

## The swing meter (T316, #902: an art request)
The owner's 3-click swing meter (the shot panel, `src/ui/ShotPanel.tsx` drawMeter) is drawn on a plain canvas, labelled "Stand In for swing meter art".
- **A half-circle meter face** (about 300 x 180 px, transparent): the arc from the snap line at the right end over the top to the left end, a gold 100%
  mark at 5/6 of the way (150 degrees), the overswing (the last sixth) in red, a short tail below the snap line on the right, a polished 1985 golf-game
  look (brass and enamel). The marker, the ticks, the sweet spot and the numbers stay drawn by the code on top.

## The spin ball (T318, #904: an art request)
The spin ball in the bottom right of the shot view (`src/ui/SpinBall.tsx` drawBall) is drawn on a plain canvas, labelled "Stand In for spin ball art".
- **A golf ball face** (about 110 x 110 px, transparent round it): a white ball seen face on, dimpled, lit from the upper right (the sun), a cool shade at
  the lower left, a faint cross through it; the 2008-era golf game look. The dot, its pulse, the TOP / BACK / DRAW / FADE words and the meter stay drawn
  by the code on top.

## The rail's cursors (T323, #921: an art request)
- **Stand In for the Select and Walk rail icons**: `src/ui/Rail.tsx` draws a line pointer (an arrow) and a walking figure as inline SVGs. Wanted: two
  icons in the rail's style (`src/assets/ui/icons/*.webp`, the same size and finish as compass, pin, trophy): `cursor-select` (a mouse arrow)
  and `cursor-walk` (a golfer mid-stride, side-on, facing right). Swap them in `CursorPair` (Rail.tsx) when they land.

## The mayor and the Mayor's Cup (T246, #708: art requests)
- **Stand In for the Mayor**: `src/ui/golf/EventCard.tsx` `MayorStandIn` draws a plain figure (a head, a dark suit and a gold sash) labelled
  "Stand In for the Mayor". Wanted (with GOLF-ART-LIST 222, the town hall and the mayor's office): a portrait of the town's mayor, 1980s, chain of
  office or sash, about 160 x 192, and a presentation picture (the mayor handing a silver cup to a golfer on the 18th green, the clubhouse behind,
  sun upper right). Swap them into `MayorStandIn` (the card's announcement and the result) when they land.
- **The trophies** (optional): a small silver cup (the Mayor's Cup) and a club championship plate for the player card's Titles rows (the trophy icon
  stands in).

## The club's pros (T214, #559: P26 phases 3-4, GOLF-ART-LIST 53-55 and 136-138: art requests)
The pro's office and the teaching hut stand in today, labelled "Stand In for <name>" (`business/art.ts LAYOUT`, `golf/pros.ts` labels); the
staff walk as stand-in people (`engine.ts Game.PRO_ART`). Each building in four views, the sun at the upper right, shadows at 145°, early autumn
dusk, nothing mirrored; each person in the golfer sheets' eight directions and clips (idle, walk; the coach and handshake clips as 136-138 ask):
| Sprite (id to use) | Footprint (m) / height | Today | Prompt (short) | P |
| --- | --- | --- | --- | --- |
| Pro's office (`golf:pro-office`, four views; art 53) | 8 x 6 / 4.5 | `business:golf-pro-shop` fitted to the 4 x 3 tiles | a small white clapboard golf office with a green door, a porch with two chairs, a window lettered "Golf Professional", a club rack by the door | P1 |
| Teaching hut (`golf:teaching-hut`, four views; art 54) | 4 x 3 / 3.5 | `expansion:lean-to-shed` | an open-fronted timber teaching hut with a pitched shingle roof, a mirror and a whiteboard inside, a bucket of balls and alignment sticks out front | P1 |
| Membership desk sign (`golf:membership-sign`; art 55) | 1 x 0.3 / 1.5 | `poi:fishing-board` at the office's door | a painted A-frame sign on the porch reading "Memberships" in the club's green and cream | P2 |
| Head pro (`golfer:staff_head_pro_m`; art 136) | a person | `golf_pro_m2` | a man in his fifties in a navy club polo, khaki trousers, a visor; idle, walk, coach, handshake | P1 |
| Teaching pro (`golfer:staff_teach_pro_w`; art 137) | a person | `golf_pro_w1` | a woman in her thirties in a white club polo and a cap, a club in hand; idle, walk, the drive, demonstrate | P1 |
| Membership secretary (`spectator:staff_secretary_w`; art 138) | a person | `spec_w_older_cardigan` | a woman in her sixties in a cardigan with a clipboard and a folder; idle, walk, handshake, hand over a folder | P2 |

## The wind (T334, #960: art requests)
The wind's cues are stand-ins today: the trees' and shrubs' tops lean and breathe in the sprite shader (a shear of the picture about its foot, `gl.ts` VS_SPRITE), and the pin
flag's cloth ripples in the fragment shader (it streams out in a breeze, hangs limp and drawn in toward the pole in a calm; `business:golf-pin-red` and `-yellow`). The flag always
streams to the picture's right (nothing is mirrored), so it cannot show which way the wind blows; the shot panel's dial and the arrow by the ball do. The sun at the upper right, shadows
at 145°, nothing mirrored, each picture in the four views:
| Sprite (id to use) | Footprint / height | Today | Prompt (short) | P |
| --- | --- | --- | --- | --- |
| Pin flag sheet (`golf:pin-flag-wind`, 8 frames x 4 wind directions: S, W, N, E; strengths limp, light, firm) | 0.1 m / 2.2 m | `business:golf-pin-red` with the shader's ripple | a red flagstick cloth in four wind directions, each as limp, a light breeze and a firm wind (8 frames of the ripple loop), the white pole and the black base the same in every frame | P2 |
| Tree sway sheet (`golf:tree-sway`, 4 frames) for the common trees | as each tree | the shader's shear | the same tree with its crown leaning left, upright and right in a gust (4 frames loop), the trunk fixed | P3 |

## House lots (T353, #995: art requests)
Course › Buildings › House lots (golf/estate.ts) draws a plot for sale as bare dirt inside the white dashed survey line with a post by its front corner; a sold plot
with the builder's first delivery; a lot being built as the town's own building site; a finished lot as the town's own house lot (the saved game's lot model), so the
houses need no art of their own. These are stand-ins, labelled "Stand In" on the card; the sun at the upper right, shadows at 145°, nothing mirrored, no lettering
(the owner, 2026-10-21: signs are pictograms):
| Sprite (id to use) | Footprint / height | Today | Prompt (short) | P |
| --- | --- | --- | --- | --- |
| For Sale post (`golf:estate-sale-post`, four views) | 0.3 m / 1.8 m | `newprop:shanty-signpost` | a short timber post with a white board hung from an arm, a red band across the top and a green golf-flag pictogram, no lettering | P2 |
| Sold post (`golf:estate-sold-post`, four views) | 0.3 m / 1.8 m | the lumber stack and the earth heap | the same post with a diagonal red band across the board (a pictogram for sold), no lettering | P3 |
| House lots tile (`estate` in `src/assets/ui/tiles/`, the flyout row) | tile | the house icon on the navy square | a little isometric diorama on a dark navy rounded square #1E2A44: three small houses in a row along a new street beside a fairway, a For Sale post at the near end, the light from the upper right, no lettering (the Build-tool tiles' style) | P2 |

## Your bag's club icons (T335, #961: art requests)
The bag card (`src/ui/golf/BagCard.tsx`) and the shot panel's club strip draw each club as a small SVG stand-in (`src/ui/golf/ClubIcon.tsx`, labelled "Stand In for club icons" on the card): a shaft
and a head by the club's family, the head tinted by its upgrade level (Garage-sale slate, Club sky, Tour green, Prototype gold). The real pictures, one square icon each on the owner's gold-on-charcoal UI
style, the sun at the upper right, nothing mirrored, 64 x 64 px, the club standing at 20 degrees with the head at the lower left:
| Sprite (id to use) | Today | Prompt (short) | P |
| --- | --- | --- | --- |
| Driver, 3-wood, 5-wood icons (`ui:club-driver`, `ui:club-wood3`, `ui:club-wood5`) | `ClubIcon` wood | a golf wood with a large rounded head, a black graphite shaft and a leather grip, lit from the upper right, on a charcoal square | P2 |
| Hybrid icon (`ui:club-hybrid`) | `ClubIcon` hybrid | a hybrid rescue club, a small rounded wood-iron head | P2 |
| Irons icon (`ui:club-iron`, one drawing for the 4- to 9-iron, the number is the tile's text) | `ClubIcon` iron | a cavity-back iron with a steel head and shaft | P2 |
| Wedges icon (`ui:club-wedge`, for the PW, GW, SW and LW) | `ClubIcon` wedge | a wedge with a rounded toe and grooves on the face | P2 |
| Putter icon (`ui:club-putter`) | `ClubIcon` putter | a blade putter, flat head, vertical shaft | P2 |
| Level frames (`ui:club-level-0..3`: Garage-sale, Club, Tour, Prototype) | the tile's border colour | four tile frames: worn slate, sky steel, emerald enamel, gold foil | P3 |
| Putter shafts and heads (`ui:putter-shaft-*`, `ui:putter-head-*`: stock steel, whippy graphite, stiff counter-balanced; blade, mallet, lie-angle balanced) | text only | six small parts icons | P3 |

## Your cards and the prize machine (T336, #962: art requests)
The cards (`src/game/golf/cards/catalogue.ts`) have two stand-in looks today (`src/ui/golf/CardArt.tsx`, labelled "Stand In for card art"): a drawn glyph on a dark frame lit from the upper right, and, for the
cards that have one, a painting taken from TrickOrTreat's treats (`src/assets/cards/<key>.webp`, cut by `scripts/assets/prep-card-art.mjs`: Power Mash is the button-masher's controller, Range Rat a Walkman, the
machine's header the arcade cabinet). Every card needs its own painting in the same loot-card style: 16:9, 640 x 360 px, one object lit from the upper right on a deep purple-black ground with a soft glow in the
rarity's colour, no lettering, nothing mirrored, no brand names or logos. Put the file in `src/assets/cards/<card id>.webp` and set the card's `art` (a card with a painting shows it everywhere at once).
| Sprite (id to use) | Today | Prompt (short) | P |
| --- | --- | --- | --- |
| Infomercial Wonder-Wedge (`card:wonder-wedge`, common) | glyph | a chrome wedge on a shopping-channel starburst, a sticker reading nothing, grooves glowing | P2 |
| Range Rat (`card:range-rat`, common) | TrickOrTreat's Walkman | a range-bucket of white balls with headphones hung on it | P3 |
| Overspeed Sticks (`card:overspeed-sticks`, common) | glyph | three colour-banded swing-speed whip sticks crossed | P2 |
| Lucky Ball Marker (`card:lucky-marker`, common) | glyph | a brass coin ball marker on a green, a four-leaf clover stamped on it | P2 |
| Lead Tape Special (`card:lead-tape`, common) | glyph | a roll of grey lead tape with a strip peeled onto a driver head | P3 |
| Power Mash (`card:power-mash`, uncommon) | TrickOrTreat's controller | a worn arcade button-masher, one big round button, sparks | P2 |
| Arm-Lock Putter Grip (`card:arm-lock`), Broomstick Putter (`card:broomstick`) (uncommon) | glyph | a putter locked along a forearm; a very long putter anchored at the chest | P2 |
| Swing-Plane Hoop (`card:swing-hoop`, uncommon) | glyph | a bright hoop on a belt around a golfer's waist, straps trailing | P3 |
| Mid-Flight Whisper (`card:mid-flight-whisper`, rare) | glyph | a golf ball in flight with sound waves curling round it as if listening | P2 |
| Hybrid Hero (`card:hybrid-hero`), Tour Van Fitting (`card:tour-van-fitting`) (rare) | glyph | a hybrid club with a cape; a fitting van with its back doors open on a rack of clubs | P2 |
| Long Drive Shaft (`card:long-drive-shaft`), Lie-Angle Balanced Flatstick (`card:flatstick`), Garage Launch Monitor (`card:launch-monitor`) (epic) | glyph | a bent graphite shaft; a putter with a level bubble on its face; a basement screen with a ball-flight graph | P2 |
| Tour Pro in a Bottle (`card:pro-in-a-bottle`), Non-Conforming Driver (`card:hot-driver`) (legendary) | glyph | a potion bottle with a tiny golfer inside; a glowing red-hot driver face with heat waves | P1 |
| The junk (`dud:*`: Broken Tee, Ball Retriever (No Head), Scorecard Pencil, Cracked Divot Tool, Somebody Else's Ball, Sun-Bleached Visor, Expired Sunscreen, Empty Range Bag) | grey glyphs | eight bits of lost-and-found golf junk, each faded and a little sad, on the same dark ground | P3 |
| Rarity backs and frames (`ui:card-frame-0..4`: common, uncommon, rare, epic, legendary) | a coloured bar and border | five card frames: worn grey, green enamel, blue steel, purple foil, orange gold foil with a glow | P2 |
| Pull tokens (`ui:pull-bronze`, `-silver`, `-gold`) | coloured text chips | three small pull tickets: a copper, a silver and a gold prize ticket | P3 |
| The prize machine (`business:prize-machine`, in the clubhouse and the pro shop, four views) and its front (`ui:prize-machine-front`) | the arcade cabinet painting in the machine's header | a 1985 prize vending machine with a glass front of golf prizes, a coin slot and a chute, lit from the upper right | P2 |

## The rest of the cards (T337, #963: art requests)
Same rules as the T336 table above (16:9, 640 x 360 px, one object lit from the upper right on a deep purple-black ground, a soft glow in the rarity's colour, no lettering, nothing mirrored, no brands). Today each card is a drawn
glyph on the dark frame (`CardArt.tsx`, "Stand In for card art"; T337 added twelve glyphs: the laser, the eye, the heart, the eraser, the microphone, the robot, the wind, the slope, the dice, the beer, the flag and the trophy), except
Backyard Trick Shot, which uses TrickOrTreat's yo-yo painting (`src/assets/cards/yoyo.webp`, cut by `scripts/assets/prep-card-art.mjs`). A card's painting goes in `src/assets/cards/<card id>.webp` and the card's `art` points at it.
| Sprite (id to use) | Today | Prompt (short) | P |
| --- | --- | --- | --- |
| Putting Mirror (`card:putting-mirror`), Pre-Shot Routine Card (`card:routine-card`), Weighted Donut (`card:weighted-donut`) (common) | glyph | a small mirror with two ball-width lines on a green; a laminated card of numbered steps with a pencil; a doughnut-shaped club weight on a driver | P3 |
| Tall Tees (`card:tall-tees`), Hack-Out Boots (`card:hackout-boots`) (common) | glyph | three very tall wooden tees in a row with a ball on top; a pair of muddy spiked boots standing in long grass | P3 |
| Tour Caddie's Yardage Book (`card:yardage-book`), Dad's Old Persimmon (`card:persimmon`) (uncommon) | glyph | a small spiral book of hand-drawn hole maps with a pencil in the spine; a dark wooden driver with a worn leather head cover | P3 |
| Tour Issue Balls (`card:tour-balls`), Two-Piece Rocket Balls (`card:rocket-balls`) (uncommon) | glyph | a box of three unmarked white balls with a ribbon; a ball with a small rocket flame trailing it | P3 |
| Rake of Truth (`card:bunker-rake`), Fairway Finder (`card:fairway-finder`), Cold Beer, Hot Hands (`card:cold-beer`) (uncommon) | glyph | a bunker rake combing a perfect line; a flag with a compass needle on a fairway; a frosty bottle of golden beer, a little steam rising from a gripping hand | P3 |
| Laser Rangefinder (`card:laser-rangefinder`) (uncommon) | glyph | a small black binocular-shaped rangefinder with a thin red beam to a far flag | P2 |
| Lesson Voucher Book (`card:lesson-book`), Gambler's Dice (`card:gamblers-dice`) (uncommon) | glyph | a booklet of tear-off vouchers with a pencil; two dice on a green felt showing one golf ball pip each | P3 |
| Slow-Mo Swing App (`card:slow-mo-app`), Green-Speed Nerd (`card:speed-nerd`), Pace Putting Robot (`card:pace-robot`) (rare) | glyph | a tablet showing a frozen swing with an arc overlay; a tiny nerd with thick glasses tilting a ramp for a ball; a small tin robot putting a ball with a measured stroke | P2 |
| Wind Whisperer (`card:wind-whisperer`), Slope Mode (`card:slope-mode`) (rare) | glyph | a golfer cupping a hand to listen to curling streams of wind; a green drawn as a tilted contour map with a ball rolling | P2 |
| Mic'd-Up Caddie (`card:mic-caddie`), Skins Hustler (`card:skins-hustler`), Sponsor Tent (`card:sponsor-tent`) (rare) | glyph | a caddie with a headset microphone pointing at a club; a man with a roll of banknotes behind his back grinning; a striped sponsor tent with a banner and a trophy | P2 |
| Driver Off the Deck (`card:deck-driver`), Scramble Captain (`card:scramble-captain`) (rare) | glyph | a driver sitting on a fairway lie, the ball low on the grass; a captain's hat on a star with two balls flying side by side | P2 |
| Carbon Everything (`card:carbon-bag`), The Hole-Whisperer's Putter (`card:putter-whisperer`) (epic) | glyph | a black carbon-weave golf bag with every club a matching dark shaft; a putter whose head is a small cupped ear listening to a hole | P2 |
| Read the Feet (`card:read-the-feet`), Backyard Trick Shot (`card:trick-shot`) (epic) | glyph; TrickOrTreat's yo-yo | a pair of golf shoes with a glowing line along the green; a ball bouncing off a garage door, a trampoline and a yo-yo into a cup | P2 |
| The Snowman Eraser (`card:snowman-eraser`), Self-Correcting Ball (`card:self-correcting-ball`) (legendary) | glyph | a pencil eraser rubbing out a big 8 on a scorecard; a ball with tiny steering fins and a gyroscope | P1 |
| Ace Magnet (`card:ace-magnet`), Clutch Gene (`card:clutch-gene`) (legendary) | glyph | a horseshoe magnet pulling a golf ball into a cup across a green; a glowing heart in a ribbon of DNA | P1 |
| The Help page's Cards tab (`ui:help-cards`) | the card list | a hand fanning eight cards, the top one's corner glowing | P3 |
| Course tools (`ui:tool-laser`, `ui:tool-slope`, `ui:tool-read`, `ui:tool-pace`, `ui:tool-scramble`) | text chips on the shot panel | five small tool icons: a laser line, a hill, a green's grain arrow, a metronome, two balls | P3 |

## Place a real course (T356, #998: an art request)
Course › *Place a real course…* is a row of the Course flyout with the generic trophy glyph today (no tile art; its three courses are rows with the pin glyph). Same tile rules as
the Course flyout's other tiles (`ui/tool-tiles.ts ROW_TILE`, art 174: the 4:3 illustrated square, the sun at the upper right, shadows at 145°):
| Sprite (id to use) | Size | Today | Prompt (short) | P |
| --- | --- | --- | --- | --- |
| Course flyout tile "Place a real course" (`ROW_TILE.real`) | 4:3 tile | the trophy glyph | an aerial view of a real golf course's outline laid over a town's streets, a green dashed boundary and a few fairways and greens drawn faintly inside it, a small rotate arrow at one corner | P3 |

## Desert litter (T384, #1040: art requests)
In the desert theme every autumn leaf source of the ground bake lays desert litter instead (`src/game/desert-litter.ts`): the road and sidewalk litter (the gutter clumps, the strays, the sidewalk edge), the ground scatter on the open
ground, the fallen leaves' piles, drifts and scatters (under the trees, along the kerbs, fences and walls, over the yards: `leaf-fall.ts`), the living ground's litter under the trees, the lots' leaf decals (`lot-decals.ts` group
`leaves`), the map decals and the nature patches. Each is drawn on its autumn picture's own rect, so the same places, sizes and counts hold (one theme switch, the surfaces file's `desert`, picks them all) and painted pictures drop
in by replacing a sheet. **These are stand-ins drawn with the canvas** ("Stand In for desert litter"): the pebbles' highlight at the upper right and shade at the lower left, soft-edged, textured grit and strokes, no flat colour wash,
the colours sand, stone, dry brown and a little grey-green, never an autumn red, orange or green leaf. The sun at the upper right, shadows at 145°, nothing mirrored, no lettering:
| Sprite (id to use) | Footprint / height | Today | Prompt (short) | P |
| --- | --- | --- | --- | --- |
| Desert litter sprites (`ground:desert-litter`, one sheet of 48 cells of 40 x 40 px on transparent, in `leaves.webp`'s layout, 26 round and 22 long, the same cells as the leaves) | 0.1 to 0.65 m a sprite | `desert-litter.ts desertLeafSheet`: clumps of sand, pebbles on sand, bits of grit (the round cells); streaks of windblown sand, chunks of dry brush, stout tufts of straw, a tumbleweed tuft (the long ones, which the fallen leaves' piles and the litter above 0.2 m draw: chunky forms that keep their light and dark at 3 px across, thin stems blurred to a grey haze); and a second, grainier sheet in the same cells for the road litter (`desertLeafSheet(true)`: warm sand grains and tiny stones, a third the size, after the lead's review: pale chips on the asphalt read as chips) | a sheet of 48 tiny top-down desert litter sprites, each centred in its own square cell on a transparent ground: round ones (a smooth grey and tan pebble, two pebbles, a few grains of grit, a pale clump of wind-blown sand) and long ones (a dry brown twig with a side twig, a tuft of straw-coloured dry grass, a curled dry palm frond, a small round tumbleweed tangle of thin pale stems); soft shadow to the lower left, the light from the upper right, no leaves, no green | P2 |
| Desert lot decals (`ground:desert-lot-decals`, 18 pictures on the rects of the leaf group of `lot-decals.webp`: scatters 231 x 146 to 231 x 227 px, drifts 200 x 111 to 260 x 170 px, a pile and a cluster) | 2 to 4 m a decal | `desertLotDecals`: a wind-blown sand drift with ripples and a few pebbles, a heap of sand, a scatter of grit, a patch of dry brush | eighteen flat top-down ground decals for a dry desert town's yards and drives on transparent: a long wind-blown drift of pale sand with fine ripples along it, a low heap of sand with a few pebbles, a thin scatter of grit and tiny pebbles, a small patch of dry brush with twigs and a tumbleweed tuft; soft feathered edges that fade into the ground, the light from the upper right | P2 |
| Desert nature patches (`ground:desert-nature`, 10 patches in `nature.webp`'s layout, 400 x 180 px each) | 16 m a patch | `desertNature`: sand blotches with stones, dry brush and tufts | ten large flat top-down ground patches of open desert on transparent: blotches of sand with scattered grey and tan stones, dry brush, straw-coloured tufts and one tumbleweed, soft edges, the light from the upper right | P3 |
| Desert grass decals (`ground:desert-decals`, 9 pictures in `decals.webp`'s layout: 3 grit scatters, 5 dry-grass patches, 1 tuft) | 2 to 4 m | `desertMapDecals` | nine flat top-down decals: three scatters of grit and pebbles, five patches of dry straw-coloured grass, one tuft, soft edges, no green | P3 |
| Desert house roofs (`building:<house>-desert`, the same house art with its roof without leaves: a little sand and dust in the valleys and along the gutters) | as each house | the house art as it is (the autumn leaves are painted into its roofs); in the desert theme the sprite shader takes the leaves out (a leaf's pixels take the colour of the roof round them, from a ring of taps of the sprite) and lays a soft, low-contrast warm film of dust in the roof's creases on dark roofs, stronger on the lit planes than the shaded ones (`roof-dust.ts`: a per-pixel grade on the world's buildings, under a quarter of the leaves' contrast, never a wash) | the same house in the same four views with its roof painted clean of any leaf: dark roofing with a thin film of pale sand and dust drifted into the valleys and along the gutters, the light from the upper right | P2 |

The stand-ins are switched by the desert theme alone (the surfaces file's `desert`; the roof dust by the sprite instances the engine flags): painted sheets with the same layouts replace them one by one, and autumn is untouched.

## The range ball loop (T386, #1043: art requests)
The driving range's balls are an economy now (`docs/plans/T386-range-ball-loop.md`): you pick them up by hand, then buy tools, staff and machines. The lying balls are one instanced draw of white dots with a soft shadow
(no art needed). Everything below is a stand-in today, labelled "Stand In for <name>" on the map. Same rules as the range kit above (sun at the upper right, shadows at 145°, nothing mirrored, no lettering, four views or the
eight facings as marked).
| Sprite (id to use) | Size | Today | Prompt (short) | P |
| --- | --- | --- | --- | --- |
| Ball room (`golf:range-ball-room`, front and rear, four views) | 3 x 2.5 m, 2.5 high | the ball trolley (`business:golf-bag-trolley`) with a "Ball room · N balls" pill at the shop's front | a lean-to ball store built on the side of the shack: corrugated tin roof, a half door open on a wooden bin heaped with white range balls, a wire basket on the step, a hose coiled on the wall | P1 |
| You picking balls up by hand (clips `golf_pickup`, the player's eight facings) | the golfer sheets' frame | your walk and idle frames, a "Stand In for pick-up clip" pill | a golfer in a 1985 polo and slacks stooping to scoop range balls into a wire basket held in one hand, then standing; a loop of 1.6 s | P1 |
| You picking balls up with the ball tube (`tube_pick`, staff_range_m and the player's eight facings) | the golfer sheets' frame | your frames, a "Stand In for tube_pick clip" pill | standing upright, pushing a clear plastic ball tube down onto a ball and lifting it, the ball riding up inside; a loop of 1.2 s | P1 |
| Carrying a basket (`carry_bucket`) and emptying it (`dump_bucket`) (eight facings) | the golfer sheets' frame | your walk frames, the basket's count in a pill over you | walking with a wire basket of white balls held against the hip; tipping it into a bin, the balls pouring | P2 |
| Ball tube (`golf:range-ball-tube`, prop in hand and standing) | 1.4 m long | none | a 1.4 m clear plastic tube with a rubber ring at the mouth and a wooden handle | P3 |
| Wire basket (`golf:practice-balls`, above) | 0.4 m | the basket's count in a pill | as the range kit's basket of balls, with a carry handle | P2 |
| Push picker (`golf:range-push-picker`, eight facings) | 1.2 x 0.9 m | none: a "Stand In for push picker" pill over you | a hand-pushed ball picker: a wheeled frame with a wire roller cage that rolls balls up into a basket behind it, a tubular handle | P1 |
| Pull-behind picker (`golf:range-tow-picker`, eight facings, behind your golf cart) | 2 x 1.4 m | a "Stand In for pull-behind picker" pill over the cart | a small trailer with a single row of ball-picking discs between two wheels and a wire hopper, a tow bar to the golf cart | P1 |
| Gang picker (`golf:range-gang-picker`, eight facings) | 4 x 1.6 m | the same pill | three picking units abreast on a folding frame behind the cart, each with its own hopper, a wide swath | P2 |
| Night picking cart (`golf:range-picker`, the ball-picker cart row above) | 2.5 x 1.5 m | the wagon with a "Stand In for Ball picker cart" pill | as above: it drives the lanes by itself after closing, a flashing amber light | P2 |
| Out-of-balls sign (`golf:range-sign-out`) | 1 x 0.8 m | a red "OUT OF BALLS" pill at the ball room | a blank red board hung on the ball room's half door (no lettering: a crossed-out ball) | P3 |
| Range attendant (`staff_range_m`, eight facings; clips walk, `tube_pick`, `carry_bucket`, `dump_bucket`, idle) | the golfer sheets' frame | the spectators' young man in a cap (`spec_m_young_cap`) walking, a "Stand In for the range attendant (staff_range_m)" pill | a teenage lad from the town in a 1985 range-staff polo, cap and shorts, a wire basket on his hip | P1 |
| Robot picker (`golf:range-robot-picker`, eight facings, a roll loop and a charging pose) | 0.8 x 0.6 m | a small teal puck with a white ball on top, a "Stand In for robot picker" pill | a 1985 amateur inventor's contraption: a squat wheeled box of plywood and sheet tin with a rotating wire brush roller in front, a clear tube hopper on top full of range balls, a car-battery on the back, one antenna with a ribbon | P1 |
| Ball washer (`golf:range-ball-washer`, front and rear, four views) | 1.2 x 0.9 m, 1.1 m high | none (the Flow panel names it) | a barrel-shaped tumbling ball washer in a steel cradle: a mesh drum half full of balls, a hose in and a drain out, a hand crank wheel and a basket under the chute | P1 |
| Target nets (`golf:range-target-net`, per target green, four views) | 5 x 1.2 m, 2.5 high | none | a green nylon funnel net on poles behind a target green with a chute running down to a wheeled bin of balls | P2 |
| Bucket counter (`golf:range-bucket-counter`, four views) | 0.6 x 0.5 m, 0.9 high | none | a small brass-and-steel counting scoop on the shop counter: a hopper, a clicking tally dial, a spout over the bucket | P3 |
| Staff golf cart (`golf:range-staff-cart`, eight facings; the attendant at the wheel, a tow hitch) | 2.4 x 1.2 m | none: the attendants walk | a battered white golf cart with a wire basket on the back and a tow hitch, a red stripe (no lettering) | P3 |
| Supplier's lorry (`golf:range-supplier-lorry`, four views; the Standing order and the Pallet deliveries) | 5 x 2 m | a "balls delivered" toast | a small flatbed lorry with a tarpaulin over cases of range balls, backing up to the ball room's half door | P3 |
| Ball polisher (`golf:range-ball-polisher`, four views) | 1 x 0.8 m | none | a wax-tumbler barrel on a steel stand beside the washer, a hose and a drip tray | P3 |
| Robot charging rack (`golf:range-robot-rack`, four views) | 1.6 x 0.8 m | none | a plywood shelf of car-battery chargers with clip leads, a robot docked on each | P3 |
| The golf side's gear, props in and about the bays (`golf:range-video-trolley`, `golf:range-launch-monitor`, `golf:range-radar-dish`, `golf:range-putt-mirror`, `golf:range-training-clubs`, `golf:range-fans`; four views each) | 0.5 to 1.2 m | none (the tree's effect on your practice only) | a VCR and a TV on a wheeled trolley with a camcorder on a tripod; a squat grey box of LEDs on a tripod behind the mat; a radar dish on a pole; a mirror and a chalk line for the putting green; a rack of heavy warm-up clubs; two pedestal fans and a lemonade jug | P3 |

## Desert sand (T382, #1038: an art slot)
In the desert theme the open ground is dirt with many small, blended, windblown blotches of pale rippled sand (the owner, 2026-11-08: "more small sand blotches but no big sandy spaces. sand should be blended"; the yards are dirt with a few drifts, desert plants on them). The blotch
shapes are code (`src/game/living-ground.ts` `sandBlotch`: three octaves of world-space noise, warped and stretched along the wind, 2 to 12 m across, feathered edges; deterministic and never periodic, so no tiling); what the blotches are *painted with* is the surfaces file's **Sand drifts**
surface (`dune`, group Map: `src/game/painted-surfaces.ts`), an art slot: the desert theme gives it the `sand-ripples-tiles` tile set (hand-painted ripples and grain, laid as authored at the pictures' own resolution, a multiply brings its gold toward the dirt; the classic `sand-ripples` family is a smooth painting and read as a glossy smear) and autumn has none and lays none. A painted family made for it replaces the stand-in with no code: pick it for Sand drifts in the Studio's
Painted surfaces (with the desert theme on). It wants the look of wind-rippled sand seen from above at 1 to 4 m a repeat: fine parallel ripples running one way (the sun at the upper right, shadows at 145 degrees), pale warm sand a little lighter than the dirt it lies on, soft grains, no stones or plants, tileable.

## Hillside and Mountain rock (T409, #1105: two art slots, each with an autumn and a desert look)
The natural ground's material follows the slope (`src/game/relief.ts`: flat and gentle ground keeps the map's own ground, moderate slopes wear the **Hillside** surface, steep slopes the **Mountain rock**, each edge blended over a few degrees and broken up by noise; the numbers are the surfaces file's `relief`: `hillAt` 9, `rockAt` 27, `blend` 4, `noise` 2, `grain` 12, degrees and tiles). The two surfaces are art slots (`hillside`, `mountain` in `src/game/painted-surfaces.ts`, group Map) and ship with **stand-ins** that are existing families: autumn Hillside = the `dirt-run` tile set, autumn Mountain rock = `cutaway-sand` (the pale lumpy cut-sand face, crisp at 48 px/m) tinted a warm grey-beige; desert Hillside = the `dirt-run` tiles, desert Mountain rock = `cutaway-sand` in a warm beige (`src/game/desert-theme.ts`). Real art replaces them with no code: make a tile set family (`docs/art/GROUND-TEXTURE-METHOD.md`), then pick it for the surface in the Studio's Painted surfaces. They must be as crisp as the dirt (T382: a smooth painting laid at a coarse scale reads as a smear), so tile sets, not the old smooth families. The game's own shots of a mound and a valley (autumn and desert) are the screenshots the method starts from: the slope band shows where the layer belongs. Prompts (edit prompts on the game screenshot; the words texture, tile, tileable and seamless stay out of them):

| Slot (suggested family id) | Prompt draft |
| --- | --- |
| Hillside, autumn (`hillside-run`) | "In this screenshot of a painted isometric golf-game map (autumn, late-afternoon sun from the upper right), the ground on the sloping hillside is a flat stand-in. Repaint only that sloping ground as a real hillside: thin, rough, wind-bent grass in golden and straw tones with patches of warm brown soil showing through, small pale stones and a few flat rocks half-buried in the earth, tufts of dry fescue clinging to the slope. Keep the camera, the scale of everything, the shape of the slope, the light and everything that is not that ground exactly as it is, in the same hand-painted style and brush detail as the rest of the scene. No text." |
| Mountain rock, autumn (`mountain-rock-run`) | "In this screenshot of a painted isometric golf-game map (autumn, late-afternoon sun from the upper right), the ground on the steep valley walls is a flat stand-in. Repaint only that steep ground as bare mountain rock and scree: weathered grey-brown rock in broken, angular slabs and ledges with dark cracks, loose pale scree and gravel gathering in the hollows, a little rust and lichen colour, a very few dry grass tufts in the cracks. The rock faces catch the light from the upper right and keep soft cool shadow in the crevices. Keep the camera, the scale, the shape of the ground and everything else exactly as it is, same hand-painted style. No text." |
| Hillside, desert (`hillside-desert-run`) | "In this screenshot of a painted isometric golf-game map set in the desert (late-afternoon sun from the upper right), the ground on the sloping hillside is a flat stand-in. Repaint only that sloping ground as rocky sand and gravel: pale warm sand with scattered gravel and small rounded stones, shallow wind-carved ripples, a few dry scrub tufts, a darker earthy tone in the hollows. Keep the camera, the scale of everything, the shape of the slope, the light and everything that is not that ground exactly as it is, same hand-painted style. No text." |
| Mountain rock, desert (`sandstone-run`) | "In this screenshot of a painted isometric golf-game map set in the desert (late-afternoon sun from the upper right), the ground on the steep valley walls is a flat stand-in. Repaint only that steep ground as layered sandstone: orange, ochre and rust bands in broken slabs and ledges, deep cracks with soft cool shadow, pale sandy rubble and scree gathered at the foot of the faces. The faces catch the light from the upper right. Keep the camera, the scale, the shape of the ground and everything else exactly as it is, same hand-painted style. No text." |
